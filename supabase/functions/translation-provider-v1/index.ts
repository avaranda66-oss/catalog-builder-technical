// supabase/functions/translation-provider-v1/index.ts
// Supabase Edge Function: translation-provider-v1
// Gateway autenticado exclusivo para tradução PRESYS com credenciais BYOK em trânsito
// Zero persistência, zero logs de chaves, autorização estrita de equipe e sanitização de erros.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://catalog-builder-technical.vercel.app'
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app');
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

// Limites server-side de segurança para preview e requisições
const LIMITS = {
  MAX_NODES: 100,
  MAX_CHARS_PER_NODE: 5000,
  MAX_TOTAL_CHARS: 50000
};

// Provedor e modelo fixados / resolvidos server-side
const ALLOWED_PROVIDERS = ['gemini'];
const GEMINI_MODEL = 'gemini-2.5-flash';

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  try {
    // 1. Validação de JWT presente no cabeçalho
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'CREDENTIAL_REQUIRED', message: 'JWT de autenticação ausente.' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // 2. Validação do usuário autenticado no Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'CREDENTIAL_INVALID', message: 'Sessão inválida ou expirada.' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 3. Validação de autorização ativa na equipe PRESYS (membership e role válidos)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile || !profile.is_active || (profile.role !== 'admin' && profile.role !== 'editor')) {
      return new Response(JSON.stringify({ error: 'FORBIDDEN', message: 'Usuário não possui autorização ativa na equipe PRESYS.' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 4. Leitura e validação do corpo da requisição
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'TRANSLATION_INVALID_RESPONSE', message: 'Payload JSON inválido.' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const { provider, apiKey, sourceLocale, targetLocale, nodes } = body || {};

    // 4.1 Validação do provedor (Allowlist estrita)
    const normalizedProvider = (provider || 'gemini').toLowerCase();
    if (!ALLOWED_PROVIDERS.includes(normalizedProvider)) {
      return new Response(JSON.stringify({ error: 'PROVIDER_UNAVAILABLE', message: `Provedor "${provider}" não suportado.` }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 4.2 Validação da chave pessoal BYOK (Somente em trânsito)
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 5) {
      return new Response(JSON.stringify({ error: 'CREDENTIAL_REQUIRED', message: 'Chave de API pessoal não informada ou inválida.' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 4.3 Validação dos nós de texto
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return new Response(JSON.stringify({ error: 'TRANSLATION_INVALID_RESPONSE', message: 'Nenhum nó de texto enviado para tradução.' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 4.4 Defesa contra payloads excessivos (Payload Limits)
    if (nodes.length > LIMITS.MAX_NODES) {
      return new Response(JSON.stringify({
        error: 'PAYLOAD_TOO_LARGE',
        message: `Limite de nós excedido: máximo permitido é ${LIMITS.MAX_NODES}, recebido ${nodes.length}.`
      }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    let totalChars = 0;
    for (const node of nodes) {
      if (!node.id || typeof node.text !== 'string') {
        return new Response(JSON.stringify({ error: 'TRANSLATION_INVALID_RESPONSE', message: 'Estrutura de nó de texto inválida.' }), {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
      if (node.text.length > LIMITS.MAX_CHARS_PER_NODE) {
        return new Response(JSON.stringify({
          error: 'PAYLOAD_TOO_LARGE',
          message: `Nó "${node.id}" excede o tamanho máximo de ${LIMITS.MAX_CHARS_PER_NODE} caracteres.`
        }), {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
      totalChars += node.text.length;
    }

    if (totalChars > LIMITS.MAX_TOTAL_CHARS) {
      return new Response(JSON.stringify({
        error: 'PAYLOAD_TOO_LARGE',
        message: `Total de caracteres (${totalChars}) excede o limite permitido de ${LIMITS.MAX_TOTAL_CHARS}.`
      }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 5. Comunicação segura com o Google Gemini (usando cabeçalho x-goog-api-key, NUNCA na URL)
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    const systemInstruction = `You are the professional technical catalog translator for PRESYS Instruments.
Translate the provided text nodes from ${sourceLocale || 'pt-BR'} to ${targetLocale || 'en-US'}.
Strict rules:
1. Preserve all placeholders like [[TECH_001]], [[TECH_002]] EXACTLY as they are. Do not translate, rename, or omit them.
2. Provide high precision metrological translation appropriate for engineering datasheets and technical catalogs.
3. Return ONLY a valid JSON object matching this schema:
{"translations": [{"id": "node_id", "translatedText": "translated text with placeholders intact"}]}`;

    const prompt = JSON.stringify(nodes, null, 2);

    const geminiPayload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemInstruction}\n\nNodes to translate:\n${prompt}` }]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    };

    let geminiRes: Response;
    try {
      geminiRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey.trim()
        },
        body: JSON.stringify(geminiPayload)
      });
    } catch {
      return new Response(JSON.stringify({ error: 'PROVIDER_UNAVAILABLE', message: 'Falha ao conectar com o provedor de IA.' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 6. Sanitização de erros do provedor (Sem vazar segredos ou respostas brutas)
    if (!geminiRes.ok) {
      const status = geminiRes.status;
      if (status === 400 || status === 401 || status === 403) {
        return new Response(JSON.stringify({ error: 'CREDENTIAL_INVALID', message: 'Chave de API do provedor rejeitada ou não autorizada.' }), {
          status: 401,
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      } else if (status === 429) {
        return new Response(JSON.stringify({ error: 'PROVIDER_RATE_LIMIT', message: 'Limite de requisições excedido no provedor. Aguarde alguns instantes.' }), {
          status: 429,
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ error: 'PROVIDER_UNAVAILABLE', message: 'Serviço do provedor temporariamente indisponível.' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const json = await geminiRes.json();
    const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return new Response(JSON.stringify({ error: 'TRANSLATION_INVALID_RESPONSE', message: 'Provedor retornou resposta vazia.' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(candidateText);
    } catch {
      return new Response(JSON.stringify({ error: 'TRANSLATION_INVALID_RESPONSE', message: 'Falha ao analisar JSON retornado pelo provedor.' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const result = parsed.translations && Array.isArray(parsed.translations)
      ? parsed
      : Array.isArray(parsed)
      ? { translations: parsed }
      : null;

    if (!result) {
      return new Response(JSON.stringify({ error: 'TRANSLATION_INVALID_RESPONSE', message: 'Schema de resposta retornado pelo provedor é inválido.' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  } catch {
    return new Response(JSON.stringify({ error: 'PROVIDER_UNAVAILABLE', message: 'Erro interno no gateway de tradução.' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});

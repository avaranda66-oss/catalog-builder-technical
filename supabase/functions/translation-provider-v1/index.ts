// Supabase Edge Function: translation-provider-v1
// Gateway autenticado para tradução com credenciais BYOK em trânsito (Zero persistência de chaves)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'CREDENTIAL_REQUIRED', message: 'JWT de autenticação ausente.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // 1. Validação de usuário autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'CREDENTIAL_INVALID', message: 'Sessão inválida ou expirada.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Leitura do corpo da requisição (A chave pessoal vem em trânsito e nunca é persistida)
    const body = await req.json();
    const { provider, apiKey, model, sourceLocale, targetLocale, nodes } = body;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 5) {
      return new Response(JSON.stringify({ error: 'CREDENTIAL_REQUIRED', message: 'Chave de API pessoal não informada.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return new Response(JSON.stringify({ error: 'TRANSLATION_INVALID_RESPONSE', message: 'Nenhum nó de texto enviado para tradução.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const selectedModel = model || 'gemini-1.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;

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

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim()
      },
      body: JSON.stringify(geminiPayload)
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 400 || status === 401 || status === 403) {
        return new Response(JSON.stringify({ error: 'CREDENTIAL_INVALID', message: 'Chave de API do provedor inválida ou não autorizada.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else if (status === 429) {
        return new Response(JSON.stringify({ error: 'PROVIDER_RATE_LIMIT', message: 'Limite de requisições excedido no provedor. Aguarde alguns instantes.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ error: 'PROVIDER_UNAVAILABLE', message: `Erro no provedor (HTTP ${status}).` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const json = await response.json();
    const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return new Response(JSON.stringify({ error: 'TRANSLATION_INVALID_RESPONSE', message: 'Resposta vazia do provedor.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const parsed = JSON.parse(candidateText);
    const result = parsed.translations && Array.isArray(parsed.translations)
      ? parsed
      : Array.isArray(parsed)
      ? { translations: parsed }
      : null;

    if (!result) {
      return new Response(JSON.stringify({ error: 'TRANSLATION_INVALID_RESPONSE', message: 'Schema retornado incompatível com o esperado.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'TRANSLATION_INVALID_RESPONSE', message: err?.message || 'Erro no processamento da tradução.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

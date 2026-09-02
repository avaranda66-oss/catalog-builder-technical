import {
  TranslationCredential,
  TranslationResponse,
  TranslationError,
  PrintableTextNode
} from '@/translation/types';
import { TechnicalTokenProtector } from '@/translation/token-protector';

export interface TranslationSampleResult {
  id: string;
  sourceText: string;
  translatedText: string;
  tokensProtected: Array<{ placeholder: string; original: string }>;
}

export class TranslationService {
  private static readonly DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

  /**
   * Testa a validade da chave do usuário através de uma chamada mínima (teste de 1 token).
   * Não altera catálogo nem consome quota excessiva.
   */
  static async testConnection(credential: TranslationCredential): Promise<{ success: boolean; model: string; error?: string }> {
    if (!credential || !credential.apiKey || !credential.apiKey.trim()) {
      throw new TranslationError('CREDENTIAL_REQUIRED', 'Credencial pessoal não informada.');
    }

    const testNode: PrintableTextNode = {
      id: 'test_node_ping',
      pageId: 'test',
      path: 'test',
      sourceText: 'Calibrador PRESYS TA-25N',
      kind: 'heading',
      policy: 'translate'
    };

    try {
      const res = await this.executeTranslation(
        [testNode],
        'en-US',
        credential,
        'pt-BR'
      );

      if (res && res.size > 0) {
        return {
          success: true,
          model: credential.model || this.DEFAULT_GEMINI_MODEL
        };
      }

      throw new TranslationError('TRANSLATION_INVALID_RESPONSE', 'Resposta de teste inválida do provedor.');
    } catch (err: any) {
      if (err instanceof TranslationError) {
        throw err;
      }
      throw new TranslationError('CREDENTIAL_INVALID', err?.message || 'Falha ao validar credencial.');
    }
  }

  /**
   * Executa a tradução de uma amostra controlada de nós imprimíveis com proteção de tokens.
   * Não muta o catálogo original.
   */
  static async translateSampleNodes(
    nodes: PrintableTextNode[],
    targetLocale: string,
    credential: TranslationCredential,
    sourceLocale = 'pt-BR'
  ): Promise<TranslationSampleResult[]> {
    if (!credential || !credential.apiKey) {
      throw new TranslationError('CREDENTIAL_REQUIRED', 'Configure sua chave de API para visualizar o preview de tradução.');
    }

    if (!nodes || nodes.length === 0) return [];

    // Limita a no máximo 5 nós para preview rápido
    const sampleNodes = nodes.slice(0, 5);

    const translatedMap = await this.executeTranslation(sampleNodes, targetLocale, credential, sourceLocale);

    return sampleNodes.map((node) => {
      const translated = translatedMap.get(node.id) || node.sourceText;
      const { tokenMap } = TechnicalTokenProtector.protectTokens(node.sourceText);
      const tokensProtected = Array.from(tokenMap.entries()).map(([placeholder, original]) => ({
        placeholder,
        original
      }));

      return {
        id: node.id,
        sourceText: node.sourceText,
        translatedText: translated,
        tokensProtected
      };
    });
  }

  /**
   * Executa a chamada estruturada de tradução com proteção e restauração de tokens.
   */
  private static async executeTranslation(
    nodes: PrintableTextNode[],
    targetLocale: string,
    credential: TranslationCredential,
    sourceLocale: string
  ): Promise<Map<string, string>> {
    // 1. Aplica proteção de tokens técnicos em cada nó
    const tokenMaps = new Map<string, Map<string, string>>();
    const payloadNodes = nodes.map((n) => {
      const { maskedText, tokenMap } = TechnicalTokenProtector.protectTokens(n.sourceText);
      tokenMaps.set(n.id, tokenMap);
      return {
        id: n.id,
        text: maskedText
      };
    });

    // 2. Executa a chamada com o provedor configurado
    const rawResponse = await this.callGeminiDirect(payloadNodes, targetLocale, credential, sourceLocale);

    // 4. Validação estrita da resposta estruturada
    if (!rawResponse || !Array.isArray(rawResponse.translations)) {
      throw new TranslationError('TRANSLATION_INVALID_RESPONSE', 'Resposta do provedor não contém o array de traduções esperado.');
    }

    const resultMap = new Map<string, string>();
    const expectedIds = new Set(nodes.map((n) => n.id));

    for (const item of rawResponse.translations) {
      if (!item.id || !expectedIds.has(item.id)) {
        throw new TranslationError('TRANSLATION_INVALID_RESPONSE', `ID desconhecido ou inválido retornado pelo provedor: "${item.id}"`);
      }

      const tokenMap = tokenMaps.get(item.id) || new Map();
      const restored = TechnicalTokenProtector.restoreTokens(item.translatedText, tokenMap);
      resultMap.set(item.id, restored);
    }

    // Garante que todos os IDs solicitados foram retornados
    for (const id of expectedIds) {
      if (!resultMap.has(id)) {
        throw new TranslationError('TRANSLATION_INVALID_RESPONSE', `O provedor não retornou tradução para o nó "${id}".`);
      }
    }

    return resultMap;
  }

  /**
   * Chamada direta segura à API do Google Gemini com saída estritamente estruturada em JSON.
   */
  private static async callGeminiDirect(
    nodes: Array<{ id: string; text: string }>,
    targetLocale: string,
    credential: TranslationCredential,
    sourceLocale: string
  ): Promise<TranslationResponse> {
    const model = credential.model || this.DEFAULT_GEMINI_MODEL;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(credential.apiKey.trim())}`;

    const systemInstruction = `You are the professional technical catalog translator for PRESYS Instruments.
Translate the provided text nodes from ${sourceLocale} to ${targetLocale}.
Strict rules:
1. Preserve all placeholders like [[TECH_001]], [[TECH_002]] EXACTLY as they are. Do not translate, rename, or omit them.
2. Provide high precision metrological translation appropriate for engineering datasheets and technical catalogs.
3. Return ONLY a valid JSON object matching this schema:
{"translations": [{"id": "node_id", "translatedText": "translated text with placeholders intact"}]}`;

    const prompt = JSON.stringify(nodes, null, 2);

    const body = {
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

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
    } catch (err: any) {
      throw new TranslationError('PROVIDER_UNAVAILABLE', `Não foi possível conectar ao provedor Gemini: ${err?.message}`);
    }

    if (!response.ok) {
      const status = response.status;
      if (status === 400 || status === 401 || status === 403) {
        throw new TranslationError('CREDENTIAL_INVALID', 'Chave de API do Gemini inválida ou não autorizada.');
      } else if (status === 429) {
        throw new TranslationError('PROVIDER_RATE_LIMIT', 'Limite de requisições excedido no provedor Gemini. Aguarde alguns instantes.');
      } else {
        throw new TranslationError('PROVIDER_UNAVAILABLE', `Erro no serviço Gemini (HTTP ${status}).`);
      }
    }

    const json = await response.json();
    const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new TranslationError('TRANSLATION_INVALID_RESPONSE', 'O provedor retornou uma resposta vazia.');
    }

    try {
      const parsed = JSON.parse(candidateText);
      if (parsed.translations && Array.isArray(parsed.translations)) {
        return parsed as TranslationResponse;
      }
      // Trata caso onde retornou array direto
      if (Array.isArray(parsed)) {
        return { translations: parsed };
      }
      throw new Error('Schema incompatível');
    } catch {
      throw new TranslationError('TRANSLATION_INVALID_RESPONSE', 'Falha ao analisar a resposta JSON do provedor Gemini.');
    }
  }
}

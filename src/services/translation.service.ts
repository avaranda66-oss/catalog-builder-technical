// src/services/translation.service.ts
// Serviço de tradução do Catalog Builder: roteamento exclusivo via Supabase Edge Function Gateway
// Zero chamadas diretas do browser para o Google Gemini — BYOK em trânsito seguro.

import {
  TranslationCredential,
  TranslationResponse,
  TranslationError,
  PrintableTextNode
} from '@/translation/types';
import { TechnicalTokenProtector } from '@/translation/token-protector';
import { getSupabase } from './supabase.service';

export interface TranslationSampleResult {
  id: string;
  sourceText: string;
  translatedText: string;
  tokensProtected: Array<{ placeholder: string; original: string }>;
}

export class TranslationService {
  /**
   * Testa a validade da chave do usuário através do gateway seguro da Edge Function.
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
          model: 'gemini-2.5-flash'
        };
      }

      throw new TranslationError('TRANSLATION_INVALID_RESPONSE', 'Resposta de teste inválida do gateway de tradução.');
    } catch (err: any) {
      if (err instanceof TranslationError) {
        throw err;
      }
      throw new TranslationError('CREDENTIAL_INVALID', err?.message || 'Falha ao validar credencial.');
    }
  }

  /**
   * Executa a tradução de uma amostra controlada de nós imprimíveis com proteção de tokens.
   * Não muta o catálogo original. Roteado exclusivamente pela Edge Function.
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
   * Executa a chamada estruturada de tradução através do gateway exclusivo da Edge Function.
   * Aplica proteção determinística e restauração rigorosa de tokens técnicos.
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

    // 2. Invoca EXCLUSIVAMENTE o gateway da Edge Function
    const supabase = getSupabase();
    if (!supabase || typeof (supabase as any).functions?.invoke !== 'function') {
      throw new TranslationError('PROVIDER_UNAVAILABLE', 'Cliente Supabase não inicializado ou indisponível.');
    }

    let responseData: any;
    try {
      const { data, error } = await (supabase as any).functions.invoke('translation-provider-v1', {
        body: {
          provider: credential.provider || 'gemini',
          apiKey: credential.apiKey.trim(),
          sourceLocale,
          targetLocale,
          nodes: payloadNodes
        }
      });

      if (error) {
        // Tenta ler o corpo estruturado de erro sanitizado da Edge Function
        let edgeError = 'PROVIDER_UNAVAILABLE';
        let edgeMessage = error.message || 'Erro no gateway de tradução.';

        if (error.context && typeof error.context.json === 'function') {
          try {
            const errJson = await error.context.json();
            if (errJson.error) edgeError = errJson.error;
            if (errJson.message) edgeMessage = errJson.message;
          } catch {
            // Context parsing fallback
          }
        }

        throw new TranslationError(edgeError as any, edgeMessage);
      }

      responseData = data;
    } catch (err: any) {
      if (err instanceof TranslationError) {
        throw err;
      }
      throw new TranslationError('PROVIDER_UNAVAILABLE', `Falha ao contactar gateway de tradução: ${err?.message || 'Erro de rede'}`);
    }

    // 3. Validação estrita da resposta estruturada
    const rawResponse = responseData as TranslationResponse;
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
}

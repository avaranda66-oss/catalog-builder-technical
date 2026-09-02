// src/translation/full-catalog-translation.service.ts
// Motor Completo de Tradução em Lote de Catálogos (Fase 2C.2)
// Princípio Não-Destrutivo, Proteção contra Source Drift, Memória de Tradução Local e Chunking com Headroom.

import { Catalog } from '@/domain/catalog.schema';
import { getSupabase } from '@/services/supabase.service';
import {
  PrintableTextNode,
  BatchTranslationProgress,
  FullTranslationResult,
  TranslationError,
  TranslationResponseNode
} from './types';
import { PrintableTextRegistry } from './printable-text.registry';
import { PrintStringRegistry } from './print-strings.registry';
import { PersonalCredentialVault } from './credential-vault';
import { TechnicalTokenProtector } from './token-protector';
import {
  TranslationMemoryCache,
  computeNodeHash,
  computeCatalogContentHash,
  TRANSLATION_ENGINE_VERSION,
  DEFAULT_GLOSSARY_VERSION
} from './translation-cache';
import { TranslationApplierRegistry } from './translation-applier.registry';

export interface TranslationServiceOptions {
  provider?: 'gemini';
  model?: string;
  forceRetranslate?: boolean;
  maxChunkNodes?: number;
  maxChunkChars?: number;
  concurrency?: number;
}

const DEFAULT_MAX_CHUNK_NODES = 60; // Headroom seguro abaixo do limite de 100 da Edge Function
const DEFAULT_MAX_CHUNK_CHARS = 30000; // Headroom seguro abaixo de 50.000 caracteres
const MAX_RETRIES = 3;

export class FullCatalogTranslationService {
  /**
   * Executa a tradução completa do catálogo em lote de forma não-destrutiva.
   * Produz um preview traduzido em memória pronto para revisão e persistência independente.
   */
  static async translateCatalog(
    sourceCatalog: Catalog,
    targetLocale: string,
    userId: string,
    onProgress?: (progress: BatchTranslationProgress) => void,
    abortSignal?: AbortSignal,
    options: TranslationServiceOptions = {}
  ): Promise<FullTranslationResult> {
    const provider = options.provider || 'gemini';
    const model = options.model || 'gemini-2.5-flash';
    const sourceLocale = sourceCatalog.sourceLocale || sourceCatalog.locale || 'pt-BR';
    const maxChunkNodes = options.maxChunkNodes || DEFAULT_MAX_CHUNK_NODES;
    const maxChunkChars = options.maxChunkChars || DEFAULT_MAX_CHUNK_CHARS;

    // 1. Snapshot Imutável e Cálculo de Hash de Conteúdo Fonte
    const initialVersion = sourceCatalog.version;
    const initialId = sourceCatalog.id;
    const allExtractedNodes = PrintableTextRegistry.extractCatalogNodes(sourceCatalog);
    const sourceContentHash = await computeCatalogContentHash(allExtractedNodes);

    onProgress?.({
      phase: 'preparing',
      totalNodes: allExtractedNodes.length,
      translatedNodes: 0,
      cachedNodes: 0,
      remainingNodes: allExtractedNodes.length,
      currentChunk: 0,
      totalChunks: 0,
      percent: 5,
      message: `Iniciando preparação do catálogo para tradução em ${targetLocale}...`
    });

    // 2. Resolução de Strings de Sistema (Zero Fallback Silencioso)
    const localizedSystemStrings: Record<string, string> = {};
    const systemNodesToTranslate: PrintableTextNode[] = [];
    const allSystemKeys = PrintStringRegistry.getAllKeys();

    for (const key of allSystemKeys) {
      const approved = PrintStringRegistry.getApprovedString(key, targetLocale);
      if (approved) {
        localizedSystemStrings[key] = approved;
      } else {
        // String de sistema não homologada estaticamente para o idioma alvo: entra no pipeline
        const sourceSysText = PrintStringRegistry.getApprovedString(key, sourceLocale) || key;
        systemNodesToTranslate.push({
          id: `sys_${key}`,
          pageId: 'system',
          path: `localizedSystemStrings.${key}`,
          sourceText: sourceSysText,
          kind: 'system',
          policy: 'system'
        });
      }
    }

    // 3. Seleção de Nós Traduzíveis
    const translatableNodes = [
      ...allExtractedNodes.filter((n) => n.policy === 'translate'),
      ...systemNodesToTranslate
    ];

    const resultsMap = new Map<string, string>();
    const nodesNeedingTranslation: Array<{
      node: PrintableTextNode;
      hash: string;
      protectedText: string;
      tokenMap: Map<string, string>;
    }> = [];

    // 4. Verificação de Cache (Translation Memory)
    onProgress?.({
      phase: 'checking_cache',
      totalNodes: translatableNodes.length,
      translatedNodes: 0,
      cachedNodes: 0,
      remainingNodes: translatableNodes.length,
      currentChunk: 0,
      totalChunks: 0,
      percent: 15,
      message: 'Consultando memória de tradução local...'
    });

    let cacheHits = 0;
    for (const node of translatableNodes) {
      if (abortSignal?.aborted) {
        throw new TranslationError('ABORTED', 'Tradução cancelada pelo usuário.');
      }

      const nodeHash = await computeNodeHash({
        sourceText: node.sourceText,
        sourceLocale,
        targetLocale,
        policy: node.policy,
        provider,
        model,
        glossaryVersion: DEFAULT_GLOSSARY_VERSION,
        engineVersion: TRANSLATION_ENGINE_VERSION
      });

      if (!options.forceRetranslate) {
        const cachedEntry = await TranslationMemoryCache.get(userId, nodeHash);
        if (cachedEntry && cachedEntry.translatedText) {
          resultsMap.set(node.id, cachedEntry.translatedText);
          if (node.id.startsWith('sys_')) {
            const sysKey = node.id.replace(/^sys_/, '');
            localizedSystemStrings[sysKey] = cachedEntry.translatedText;
          }
          cacheHits++;
          continue;
        }
      }

      // Protege tokens técnicos
      const { protectedText, tokenMap } = TechnicalTokenProtector.protect(node.sourceText);
      nodesNeedingTranslation.push({
        node,
        hash: nodeHash,
        protectedText,
        tokenMap
      });
    }

    // 5. Agrupamento em Chunks com Limites Seguros
    const chunks: Array<typeof nodesNeedingTranslation> = [];
    let currentChunk: typeof nodesNeedingTranslation = [];
    let currentChars = 0;

    for (const item of nodesNeedingTranslation) {
      const itemLen = item.protectedText.length;
      if (
        currentChunk.length >= maxChunkNodes ||
        (currentChars + itemLen > maxChunkChars && currentChunk.length > 0)
      ) {
        chunks.push(currentChunk);
        currentChunk = [item];
        currentChars = itemLen;
      } else {
        currentChunk.push(item);
        currentChars += itemLen;
      }
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    // 6. Tradução dos Chunks via Edge Function com Concorrência e Backoff
    let translatedCount = cacheHits;
    const totalNodesCount = translatableNodes.length;

    if (chunks.length > 0) {
      // Recupera credencial BYOK do cofre seguro
      const credential = await PersonalCredentialVault.getCredential(userId, provider);
      if (!credential || !credential.apiKey) {
        throw new TranslationError(
          'CREDENTIAL_REQUIRED',
          'Chave de API do provedor de tradução não configurada ou expirada.'
        );
      }

      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        if (abortSignal?.aborted) {
          throw new TranslationError('ABORTED', 'Tradução cancelada pelo usuário.');
        }

        const chunk = chunks[cIdx];
        const payloadNodes = chunk.map((c) => ({
          id: c.node.id,
          text: c.protectedText
        }));

        onProgress?.({
          phase: 'translating',
          totalNodes: totalNodesCount,
          translatedNodes: translatedCount,
          cachedNodes: cacheHits,
          remainingNodes: totalNodesCount - translatedCount,
          currentChunk: cIdx + 1,
          totalChunks: chunks.length,
          percent: Math.round((translatedCount / totalNodesCount) * 80) + 15,
          message: `Traduzindo lote ${cIdx + 1} de ${chunks.length} (${chunk.length} textos)...`
        });

        const translationsResponse = await this.invokeGatewayWithRetry(
          credential.apiKey,
          sourceLocale,
          targetLocale,
          payloadNodes,
          abortSignal
        );

        // Validação Estruturada da Resposta do Chunk
        if (!translationsResponse || !Array.isArray(translationsResponse.translations)) {
          throw new TranslationError(
            'TRANSLATION_INVALID_RESPONSE',
            `Resposta inválida recebida do gateway de tradução no lote ${cIdx + 1}.`
          );
        }

        const rawTranslations = translationsResponse.translations;

        // Validação Estrita 1: Contagem exata de nós
        if (rawTranslations.length !== chunk.length) {
          throw new TranslationError(
            'TRANSLATION_INVALID_RESPONSE',
            `Contagem de nós divergente na resposta do provedor no lote ${cIdx + 1}: esperado ${chunk.length}, recebido ${rawTranslations.length}.`
          );
        }

        // Validação Estrita 2: Detecção de duplicados
        const returnedIds = rawTranslations.map((t: any) => t.id);
        const uniqueReturnedIds = new Set(returnedIds);
        if (uniqueReturnedIds.size !== returnedIds.length) {
          throw new TranslationError(
            'TRANSLATION_INVALID_RESPONSE',
            `IDs duplicados detectados na resposta do provedor no lote ${cIdx + 1}.`
          );
        }

        // Validação Estrita 3: IDs desconhecidos ou extras
        const expectedIds = new Set(chunk.map((c) => c.node.id));
        for (const rId of returnedIds) {
          if (!expectedIds.has(rId)) {
            throw new TranslationError(
              'TRANSLATION_INVALID_RESPONSE',
              `ID desconhecido ou extra retornado pelo provedor no lote ${cIdx + 1}: "${rId}".`
            );
          }
        }

        const respMap = new Map<string, string>();
        rawTranslations.forEach((t: TranslationResponseNode) => {
          if (t.id && typeof t.translatedText === 'string') {
            respMap.set(t.id, t.translatedText);
          }
        });

        // Garante que todos os IDs do lote foram retornados
        for (const item of chunk) {
          const rawTranslated = respMap.get(item.node.id);
          if (!rawTranslated) {
            throw new TranslationError(
              'TRANSLATION_INVALID_RESPONSE',
              `Nó traduzido ausente na resposta do provedor: ID ${item.node.id}`
            );
          }

          // Restaura tokens técnicos metrológicos
          const restoredText = TechnicalTokenProtector.restore(rawTranslated, item.tokenMap);

          // Valida que nenhum placeholder [[TECH_XXX]] vazou para o texto final
          if (restoredText.includes('[[TECH_')) {
            throw new TranslationError(
              'TRANSLATION_INVALID_RESPONSE',
              `Placeholder técnico não restaurado detectado no nó ${item.node.id}: ${restoredText}`
            );
          }

          resultsMap.set(item.node.id, restoredText);

          // Se for nó de sistema, atualiza o mapa de strings localizadas
          if (item.node.id.startsWith('sys_')) {
            const sysKey = item.node.id.replace(/^sys_/, '');
            localizedSystemStrings[sysKey] = restoredText;
          }

          // Grava no cache de memória local
          await TranslationMemoryCache.set(userId, {
            hash: item.hash,
            nodeId: item.node.id,
            sourceLocale,
            targetLocale,
            sourceText: item.node.sourceText,
            translatedText: restoredText,
            provider,
            model,
            glossaryVersion: DEFAULT_GLOSSARY_VERSION,
            engineVersion: TRANSLATION_ENGINE_VERSION,
            createdAt: new Date().toISOString()
          });

          translatedCount++;
        }
      }
    }

    // 7. Aplica as Traduções no Clone do Catálogo
    onProgress?.({
      phase: 'validating',
      totalNodes: totalNodesCount,
      translatedNodes: translatedCount,
      cachedNodes: cacheHits,
      remainingNodes: 0,
      currentChunk: chunks.length,
      totalChunks: chunks.length,
      percent: 95,
      message: 'Montando versão localizada do catálogo...'
    });

    const applierResult = TranslationApplierRegistry.applyTranslations(
      sourceCatalog,
      resultsMap,
      targetLocale,
      localizedSystemStrings
    );

    // Fail-Closed: Se algum nó traduzível ficou sem aplicação, interrompe imediatamente
    if (applierResult.unappliedCount > 0) {
      throw new TranslationError(
        'TRANSLATION_INVALID_RESPONSE',
        `Falha de integridade: ${applierResult.unappliedCount} nós não foram aplicados ao documento: ${applierResult.unappliedNodeIds.join(', ')}`
      );
    }

    const translatedCatalog = applierResult.translatedCatalog;

    // Atualiza metadados formais de tradução
    translatedCatalog.translationMeta = {
      sourceCatalogId: initialId,
      sourceCatalogVersion: initialVersion,
      sourceContentHash,
      sourceLocale,
      targetLocale,
      provider,
      model,
      translationEngineVersion: TRANSLATION_ENGINE_VERSION,
      glossaryVersion: DEFAULT_GLOSSARY_VERSION,
      translatedAt: new Date().toISOString(),
      coverage: 100,
      layoutQaStatus: 'pending'
    };

    // 8. Estado Inicial de Layout QA (Aguardando Renderização Real do A4)
    const layoutQa = {
      hasIssues: false,
      issues: [],
      status: 'pending' as const,
      auditedAt: new Date().toISOString()
    };

    onProgress?.({
      phase: 'ready',
      totalNodes: totalNodesCount,
      translatedNodes: translatedCount,
      cachedNodes: cacheHits,
      remainingNodes: 0,
      currentChunk: chunks.length,
      totalChunks: chunks.length,
      percent: 100,
      message: `Tradução para ${targetLocale} concluída com sucesso!`
    });

    return {
      translatedCatalog,
      sourceCatalogId: initialId,
      sourceCatalogVersion: initialVersion,
      sourceContentHash,
      sourceLocale,
      targetLocale,
      totalNodes: totalNodesCount,
      cacheHits,
      cacheMisses: nodesNeedingTranslation.length,
      translatedCount,
      layoutQa,
      completedAt: new Date().toISOString()
    };
  }

  /**
   * Invoca a Edge Function translation-provider-v1 com retries delimitados e backoff exponencial.
   */
  private static async invokeGatewayWithRetry(
    apiKey: string,
    sourceLocale: string,
    targetLocale: string,
    nodes: Array<{ id: string; text: string }>,
    abortSignal?: AbortSignal,
    attempt: number = 1
  ): Promise<any> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new TranslationError('PROVIDER_UNAVAILABLE', 'Cliente Supabase não inicializado.');
    }

    try {
      const { data, error } = await supabase.functions.invoke('translation-provider-v1', {
        body: {
          provider: 'gemini',
          apiKey: apiKey.trim(),
          sourceLocale,
          targetLocale,
          nodes
        }
      });

      if (error) {
        // Se for erro de autenticação ou chave inválida, falha imediatamente sem retry
        if (data?.error === 'CREDENTIAL_INVALID' || error.message?.includes('CREDENTIAL_INVALID')) {
          throw new TranslationError(
            'CREDENTIAL_INVALID',
            'Chave de API inválida ou rejeitada pelo provedor de tradução.'
          );
        }

        if (data?.error === 'PROVIDER_QUOTA' || error.message?.includes('QUOTA')) {
          throw new TranslationError(
            'PROVIDER_QUOTA',
            'Quota de requisições excedida na chave do provedor de tradução.'
          );
        }

        if (attempt < MAX_RETRIES && !abortSignal?.aborted) {
          const delayMs = Math.pow(2, attempt) * 1000;
          await new Promise((res) => setTimeout(res, delayMs));
          return this.invokeGatewayWithRetry(apiKey, sourceLocale, targetLocale, nodes, abortSignal, attempt + 1);
        }

        throw new TranslationError(
          'PROVIDER_UNAVAILABLE',
          `Falha na comunicação com o gateway de tradução: ${error.message}`
        );
      }

      return data;
    } catch (err: any) {
      if (err instanceof TranslationError) throw err;

      if (attempt < MAX_RETRIES && !abortSignal?.aborted) {
        const delayMs = Math.pow(2, attempt) * 1000;
        await new Promise((res) => setTimeout(res, delayMs));
        return this.invokeGatewayWithRetry(apiKey, sourceLocale, targetLocale, nodes, abortSignal, attempt + 1);
      }

      throw new TranslationError(
        'PROVIDER_UNAVAILABLE',
        err.message || 'Erro inesperado na chamada do gateway de tradução.'
      );
    }
  }

  /**
   * Valida se o catálogo original sofreu alterações concorrentes (Source Drift) antes de salvar a nova versão.
   */
  static async verifySourceDrift(
    currentOriginalCatalog: Catalog,
    expectedSourceVersion: number,
    expectedSourceHash: string
  ): Promise<boolean> {
    if (currentOriginalCatalog.version !== expectedSourceVersion) {
      return true; // Drift detectado (versão diferente)
    }

    const currentNodes = PrintableTextRegistry.extractCatalogNodes(currentOriginalCatalog);
    const currentHash = await computeCatalogContentHash(currentNodes);

    return currentHash !== expectedSourceHash;
  }
}

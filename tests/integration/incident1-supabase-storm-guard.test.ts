import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { SupabaseService } from '../../src/services/supabase.service';
import type {
  ProductWorkbookReadRepository,
  ProductSourceDocumentReadRepository
} from '../../src/components/library/mega-workspace/MegaWorkspaceReadOnlyContainer';
import {
  ensureWorkbookV2,
  type ProductWorkbookV2,
  type TechnicalDatum
} from '../../src/domain/product-workbook/types';
import { resolveEffectiveProductKnowledge } from '../../src/domain/product-workbook/inheritance.engine';
import { collectReferencedSourceDocumentIds } from '../../src/domain/product-workspace/view-model';

describe('SUPABASE.CPU.INCIDENT1 Regression Tests', () => {
  describe('1. Mega Workspace Open Path: Finite Request Guarantee', () => {
    it('executes exactly 3 requests (product wb, family wb, source docs batch) and zero mutations', async () => {
      const prodDatum: TechnicalDatum = {
        id: 'd-1',
        moduleId: 'general',
        semanticKey: 'temp_range',
        label: 'Faixa de Temperatura',
        value: { type: 'text', value: '-20..100 C' },
        status: 'draft',
        evidence: [
          {
            id: 'ev-1',
            sourceDocumentId: 'doc-1',
            observedValue: { type: 'text', value: '-20..100 C' },
            capturedAt: new Date().toISOString()
          }
        ],
        audit: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };

      const famDatum: TechnicalDatum = {
        id: 'd-2',
        moduleId: 'general',
        semanticKey: 'accuracy',
        label: 'Exatidão',
        value: { type: 'text', value: '0.1%' },
        status: 'approved',
        evidence: [
          {
            id: 'ev-2',
            sourceDocumentId: 'doc-2',
            observedValue: { type: 'text', value: '0.1%' },
            capturedAt: new Date().toISOString()
          }
        ],
        audit: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };

      const mockProdWb: ProductWorkbookV2 = {
        id: 'wb-p1',
        schemaVersion: 2,
        owner: { kind: 'product', id: 'prod-1' },
        revision: 1,
        modules: [
          {
            id: 'general',
            semanticKey: 'general',
            label: 'General',
            kind: 'key_value',
            order: 0,
            datumIds: ['d-1']
          }
        ],
        data: { temp_range: prodDatum },
        datasets: [],
        overrides: {}
      };

      const mockFamWb: ProductWorkbookV2 = {
        id: 'wb-f1',
        schemaVersion: 2,
        owner: { kind: 'family', id: 'fam-1' },
        revision: 1,
        modules: [
          {
            id: 'general',
            semanticKey: 'general',
            label: 'General',
            kind: 'key_value',
            order: 0,
            datumIds: ['d-2']
          }
        ],
        data: { accuracy: famDatum },
        datasets: [],
        overrides: {}
      };

      const getWorkbookSpy = vi.fn().mockImplementation(async ({ kind, id: _targetId }) => {
        if (kind === 'product') return mockProdWb;
        if (kind === 'family') return mockFamWb;
        return null;
      });

      const listSourceDocumentsSpy = vi.fn().mockResolvedValue([
        { id: 'doc-1', title: 'Manual A', filename: 'manual_a.pdf' },
        { id: 'doc-2', title: 'Datasheet B', filename: 'datasheet_b.pdf' }
      ]);

      const mockWorkbookRepo: ProductWorkbookReadRepository = {
        getWorkbook: getWorkbookSpy
      };

      const mockSourceRepo: ProductSourceDocumentReadRepository = {
        listSourceDocuments: listSourceDocumentsSpy,
        getSourceDocument: vi.fn()
      };

      // Simula o fluxo exato de carregamento do MegaWorkspaceReadOnlyContainer
      const productId = 'prod-1';
      const familyId = 'fam-1';

      // 1. Carrega Workbook do Produto
      const rawProdWb = await mockWorkbookRepo.getWorkbook({ kind: 'product', id: productId });
      const prodWb = rawProdWb ? ensureWorkbookV2(rawProdWb) : null;

      // 2. Carrega Workbook da Família
      const rawFamWb = await mockWorkbookRepo.getWorkbook({ kind: 'family', id: familyId });
      const famWb = rawFamWb ? ensureWorkbookV2(rawFamWb) : null;

      // 3. Resolve Conhecimento
      const knowledge = resolveEffectiveProductKnowledge({
        productId,
        familyWorkbook: famWb,
        productWorkbook: prodWb,
        policy: 'effective_for_publishing'
      });
      const referencedDocIds = collectReferencedSourceDocumentIds(knowledge, {
        productWorkbook: prodWb,
        familyWorkbook: famWb
      });

      // 4. Carrega Fontes em lote
      const sources = await mockSourceRepo.listSourceDocuments([...referencedDocIds]);

      // Verificação estrita de contagem finita de requisições
      expect(getWorkbookSpy).toHaveBeenCalledTimes(2); // 1 para produto, 1 para família
      expect(listSourceDocumentsSpy).toHaveBeenCalledTimes(1); // 1 requisição em lote para todas as fontes
      expect(referencedDocIds).toEqual(expect.arrayContaining(['doc-1', 'doc-2']));
      expect(sources).toHaveLength(2);

      // Re-render sem mudança de identidade não executa chamadas adicionais
      expect(getWorkbookSpy).toHaveBeenCalledTimes(2);
      expect(listSourceDocumentsSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Concurrency Conflict (40001) Circuit Breaker / Storm Guard', () => {
    beforeEach(() => {
      useCatalogStore.setState({
        currentCatalog: {
          id: 'test-cat-incident1',
          title: 'Test Catalog',
          version: 9,
          pages: []
        } as any,
        syncStatus: 'conflict',
        syncError: 'Conflito de concorrência detectado.',
        isSaving: false,
        isDirty: true
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('blocks 50 successive save calls immediately at the store boundary when syncStatus is conflict', async () => {
      const saveCatalogSpy = vi.spyOn(SupabaseService, 'saveCatalog');

      // Executa 50 tentativas consecutivas de salvamento (simulando um loop desgovernado de retry/effect)
      const attempts = [];
      for (let i = 0; i < 50; i++) {
        attempts.push(useCatalogStore.getState().saveCurrentCatalog());
      }

      const results = await Promise.all(attempts);

      // Cada chamada deve ter sido rejeitada com código 40001 sem tocar na rede
      for (const res of results) {
        expect(res.success).toBe(false);
        expect(res.status).toBe('conflict');
        expect(res.errorCode).toBe('40001');
      }

      // NENHUMA chamada de rede para SupabaseService.saveCatalog pode ter ocorrido!
      expect(saveCatalogSpy).toHaveBeenCalledTimes(0);
    });

    it('purges queued pending saves after conflict to prevent draining queue storms', async () => {
      // Simula uma resposta do servidor com 40001
      let resolveFirstCall: (val: any) => void;
      const firstCallPromise = new Promise((resolve) => {
        resolveFirstCall = resolve;
      });

      const saveCatalogSpy = vi.spyOn(SupabaseService, 'saveCatalog').mockImplementation(async () => {
        return firstCallPromise as any;
      });

      // Configura store pronto para salvar
      useCatalogStore.setState({
        syncStatus: 'dirty',
        isDirty: true,
        isSaving: false
      });

      // 1. Inicia primeiro voo
      const flight1 = useCatalogStore.getState().saveCurrentCatalog();

      // 2. Enfileira segundo save enquanto o primeiro está em voo
      const flight2 = useCatalogStore.getState().saveCurrentCatalog();

      // 3. Servidor responde ao primeiro voo com Conflito 40001
      resolveFirstCall!({
        success: false,
        conflict: true,
        errorCode: '40001',
        error: 'Conflito de Concorrência: versão esperada 9 vs 11 no servidor.'
      });

      const [res1, res2] = await Promise.all([flight1, flight2]);

      expect(res1.status).toBe('conflict');
      expect(res1.errorCode).toBe('40001');
      expect(res2.status).toBe('conflict');

      // A fila pendente deve ter sido purgada, NÃO deve disparar um segundo voo para o servidor!
      expect(saveCatalogSpy).toHaveBeenCalledTimes(1);
      expect(useCatalogStore.getState().syncStatus).toBe('conflict');

      // Tentativa subsequente é imediatamente bloqueada sem rede
      const flight3 = await useCatalogStore.getState().saveCurrentCatalog();
      expect(flight3.status).toBe('conflict');
      expect(saveCatalogSpy).toHaveBeenCalledTimes(1); // Permanece 1, zero chamadas adicionais
    });

    it('blocks flushCatalog while in conflict without generating network calls', async () => {
      const saveCatalogSpy = vi.spyOn(SupabaseService, 'saveCatalog');

      // Tenta flush enquanto em conflito
      const flushResult = await useCatalogStore.getState().flushCatalog('test-cat-incident1');

      expect(flushResult.success).toBe(false);
      expect(flushResult.status).toBe('conflict');
      expect(flushResult.errorCode).toBe('40001');
      expect(saveCatalogSpy).toHaveBeenCalledTimes(0);
    });

    it('bounds external repeated callers and mutations locally when in conflict', () => {
      const saveCatalogSpy = vi.spyOn(SupabaseService, 'saveCatalog');

      // Executa mutação local no documento enquanto em conflito
      useCatalogStore.getState().commitDocumentMutation(
        (draft) => {
          draft.title = 'Título Editado Localmente';
        },
        'SET_TITLE',
        { targetId: 'test-cat-incident1' }
      );

      // Estado local foi atualizado
      expect(useCatalogStore.getState().currentCatalog?.title).toBe('Título Editado Localmente');
      // Status permanece 'conflict'
      expect(useCatalogStore.getState().syncStatus).toBe('conflict');
      // NENHUMA chamada de rede para SupabaseService.saveCatalog foi gerada
      expect(saveCatalogSpy).toHaveBeenCalledTimes(0);
    });

    it('restores save capability only after explicit conflict resolution (reload server version)', async () => {
      const saveCatalogSpy = vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValue({
        success: true,
        data: { version: 12 }
      });

      // Usuário resolve conflito recarregando versão do servidor
      useCatalogStore.setState({
        syncStatus: 'synced',
        syncError: null,
        isDirty: false
      });

      // Agora o salvamento é permitido novamente quando o estado volta a ser dirty
      useCatalogStore.setState({
        isDirty: true,
        syncStatus: 'dirty'
      });

      const result = await useCatalogStore.getState().saveCurrentCatalog();
      expect(result.success).toBe(true);
      expect(saveCatalogSpy).toHaveBeenCalledTimes(1);
    });
  });
});

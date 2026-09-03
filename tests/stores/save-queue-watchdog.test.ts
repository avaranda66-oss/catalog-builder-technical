// tests/stores/save-queue-watchdog.test.ts
// Validação canônica de resiliência, liberação de fila, proteção contra late-completion e timeout supervisionado.
// Fase CORE.H2 — Confiabilidade do Editor e Veracidade de Conformidade.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useCatalogStore,
  _resetCatalogSaveQueuesForTest,
  _getCatalogSaveQueueForTest
} from '../../src/stores/useCatalogStore';
import { SupabaseService } from '../../src/services/supabase.service';
import { StorageService } from '../../src/services/storage.service';
import { Catalog } from '../../src/domain/catalog.schema';

describe('CORE.H2 — Save Queue Watchdog & State Machine Recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetCatalogSaveQueuesForTest();
    vi.spyOn(StorageService, 'cacheCatalog').mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    _resetCatalogSaveQueuesForTest();
  });

  function setupCatalog(id: string = 'cat-watchdog-1', version: number = 1): Catalog {
    const cat: Catalog = {
      id,
      title: 'Catálogo Watchdog Test',
      themeId: 'default',
      version,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          title: 'Página 1',
          blocks: []
        }
      ]
    };

    useCatalogStore.setState({
      currentCatalog: cat,
      editorContext: { kind: 'catalog', catalogId: id },
      isSaving: false,
      isDirty: false,
      syncStatus: 'synced',
      syncError: null,
      localRevision: 1,
      lastAcknowledgedLocalRevision: 1
    });

    return cat;
  }

  // =========================================================================
  // SAVE-WATCHDOG-1: remote promise nunca resolve -> caller recebe timeout
  // =========================================================================
  it('SAVE-WATCHDOG-1: remote promise pendurada resulta em timeout para o chamador original', async () => {
    setupCatalog('cat-w1', 1);

    // Mock do Supabase retornando promise que nunca resolve
    vi.spyOn(SupabaseService, 'saveCatalog').mockImplementation(
      () => new Promise(() => {}) // pending forever
    );

    const saveCallPromise = useCatalogStore.getState().saveCurrentCatalog();

    // Estado imediato deve ser saving
    expect(useCatalogStore.getState().isSaving).toBe(true);
    expect(useCatalogStore.getState().syncStatus).toBe('saving');

    // Avança o timer do watchdog (10s)
    await vi.advanceTimersByTimeAsync(10000);

    const result = await saveCallPromise;

    expect(result.success).toBe(false);
    expect(result.status).toBe('error');
    expect(result.error).toContain('Tempo limite de salvamento excedido');
    expect(useCatalogStore.getState().syncStatus).toBe('error');
    expect(useCatalogStore.getState().syncError).toContain('watchdog 10s');
    expect(useCatalogStore.getState().isSaving).toBe(false);
  });

  // =========================================================================
  // SAVE-WATCHDOG-2: timeout -> queue liberada
  // =========================================================================
  it('SAVE-WATCHDOG-2: após timeout, a fila em memória do catálogo é liberada', async () => {
    setupCatalog('cat-w2', 1);

    vi.spyOn(SupabaseService, 'saveCatalog').mockImplementation(
      () => new Promise(() => {})
    );

    const savePromise = useCatalogStore.getState().saveCurrentCatalog();
    const queue = _getCatalogSaveQueueForTest('cat-w2');
    expect(queue?.isSaving).toBe(true);

    await vi.advanceTimersByTimeAsync(10000);
    await savePromise;

    // A fila deve estar totalmente liberada
    expect(queue?.isSaving).toBe(false);
    expect(queue?.inFlightPromise).toBeNull();
  });

  // =========================================================================
  // SAVE-WATCHDOG-3: timeout -> retry inicia nova Supabase call
  // =========================================================================
  it('SAVE-WATCHDOG-3: após timeout, nova chamada de saveCurrentCatalog dispara nova requisição Supabase', async () => {
    setupCatalog('cat-w3', 1);

    const saveMock = vi.spyOn(SupabaseService, 'saveCatalog');

    // Primeira tentativa trava
    saveMock.mockImplementationOnce(() => new Promise(() => {}));

    const savePromise1 = useCatalogStore.getState().saveCurrentCatalog();
    await vi.advanceTimersByTimeAsync(10000);
    await savePromise1;

    expect(saveMock).toHaveBeenCalledTimes(1);

    // Segunda tentativa (retry) resolve com sucesso
    saveMock.mockImplementationOnce(async () => ({
      success: true,
      data: { version: 2 }
    }));

    const savePromise2 = useCatalogStore.getState().saveCurrentCatalog();
    const res2 = await savePromise2;

    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(res2.success).toBe(true);
    expect(res2.status).toBe('synced');
  });

  // =========================================================================
  // SAVE-WATCHDOG-4: timeout + retry success -> synced corretamente
  // =========================================================================
  it('SAVE-WATCHDOG-4: ciclo timeout seguido de retry bem-sucedido sincroniza estado do store', async () => {
    setupCatalog('cat-w4', 1);

    const saveMock = vi.spyOn(SupabaseService, 'saveCatalog');
    saveMock.mockImplementationOnce(() => new Promise(() => {}));

    const p1 = useCatalogStore.getState().saveCurrentCatalog();
    await vi.advanceTimersByTimeAsync(10000);
    await p1;

    expect(useCatalogStore.getState().syncStatus).toBe('error');

    saveMock.mockImplementationOnce(async () => ({
      success: true,
      data: { version: 2 }
    }));

    const p2 = useCatalogStore.getState().saveCurrentCatalog();
    const res2 = await p2;

    expect(res2.success).toBe(true);
    expect(useCatalogStore.getState().syncStatus).toBe('synced');
    expect(useCatalogStore.getState().isDirty).toBe(false);
    expect(useCatalogStore.getState().currentCatalog?.version).toBe(2);
  });

  // =========================================================================
  // SAVE-WATCHDOG-5: attempt antigo resolve após retry -> não corrompe estado novo
  // =========================================================================
  it('SAVE-WATCHDOG-5: attempt atrasado que resolve após o retry não corrompe versão ou estado do store', async () => {
    setupCatalog('cat-w5', 1);

    let resolveAttempt1: Function = () => {};
    const attempt1Promise = new Promise<{ success: boolean; data: any }>((res) => {
      resolveAttempt1 = res;
    });

    const saveMock = vi.spyOn(SupabaseService, 'saveCatalog');
    saveMock.mockImplementationOnce(() => attempt1Promise);

    // Inicia Attempt 1
    const p1 = useCatalogStore.getState().saveCurrentCatalog();

    // Expira Attempt 1 pelo watchdog (10s)
    await vi.advanceTimersByTimeAsync(10000);
    await p1;

    expect(useCatalogStore.getState().syncStatus).toBe('error');

    // Inicia Attempt 2 (retry) com sucesso imediato -> versão 3
    saveMock.mockImplementationOnce(async () => ({
      success: true,
      data: { version: 3 }
    }));

    const p2 = useCatalogStore.getState().saveCurrentCatalog();
    const res2 = await p2;
    expect(res2.success).toBe(true);
    expect(useCatalogStore.getState().currentCatalog?.version).toBe(3);
    expect(useCatalogStore.getState().syncStatus).toBe('synced');

    // Agora, Attempt 1 finalmente resolve tardiamente (ex: 20s depois) com versão antiga 2
    resolveAttempt1({
      success: true,
      data: { version: 2 }
    });
    await vi.runAllTimersAsync();

    // O estado do catálogo DEVE permanecer versão 3 e synced, não ser sobrescrito para versão 2!
    expect(useCatalogStore.getState().currentCatalog?.version).toBe(3);
    expect(useCatalogStore.getState().syncStatus).toBe('synced');
  });

  // =========================================================================
  // SAVE-WATCHDOG-6: late old attempt NÃO limpa inFlight de new attempt
  // =========================================================================
  it('SAVE-WATCHDOG-6: finalização de attempt antigo atrasado não limpa inFlight de attempt mais novo em andamento', async () => {
    setupCatalog('cat-w6', 1);

    let resolveAttempt1: Function = () => {};
    const attempt1Promise = new Promise<{ success: boolean; data: any }>((res) => {
      resolveAttempt1 = res;
    });

    const saveMock = vi.spyOn(SupabaseService, 'saveCatalog');
    saveMock.mockImplementationOnce(() => attempt1Promise);

    // Attempt 1 começa
    const p1 = useCatalogStore.getState().saveCurrentCatalog();

    // Timeout de Attempt 1
    await vi.advanceTimersByTimeAsync(10000);
    await p1;

    // Inicia Attempt 2 (que fica pendurado esperando)
    let resolveAttempt2: Function = () => {};
    const attempt2Promise = new Promise<{ success: boolean; data: any }>((res) => {
      resolveAttempt2 = res;
    });
    saveMock.mockImplementationOnce(() => attempt2Promise);

    const p2 = useCatalogStore.getState().saveCurrentCatalog();

    const queue = _getCatalogSaveQueueForTest('cat-w6');
    expect(queue?.isSaving).toBe(true);
    expect(queue?.inFlightPromise).not.toBeNull();

    // Agora Attempt 1 resolve tarde
    resolveAttempt1({ success: true, data: { version: 2 } });
    await Promise.resolve(); // drain microtasks

    // Attempt 2 AINDA DEVE ESTAR EM ANDAMENTO com queue.isSaving = true!
    expect(queue?.isSaving).toBe(true);
    expect(queue?.inFlightPromise).not.toBeNull();

    // Resolve Attempt 2
    resolveAttempt2({ success: true, data: { version: 3 } });
    const res2 = await p2;
    expect(res2.success).toBe(true);
    expect(queue?.isSaving).toBe(false);
  });

  // =========================================================================
  // SAVE-WATCHDOG-7: pending edit durante save -> permanece dirty após ack anterior
  // =========================================================================
  it('SAVE-WATCHDOG-7: edições ocorridas durante o salvamento mantêm isDirty se a revisão avançar', async () => {
    setupCatalog('cat-w7', 1);

    let resolveSave: Function = () => {};
    const inFlightPromise = new Promise<{ success: boolean; data: any }>((res) => {
      resolveSave = res;
    });

    vi.spyOn(SupabaseService, 'saveCatalog').mockImplementationOnce(() => inFlightPromise);

    const savePromise = useCatalogStore.getState().saveCurrentCatalog();

    // Simula edição pelo usuário enquanto salva (revisão sobe de 1 para 2)
    useCatalogStore.setState({
      localRevision: 2,
      isDirty: true
    });

    // Supabase conclui salvamento da revisão 1
    resolveSave({
      success: true,
      data: { version: 2 }
    });

    // Como há revisão pendente, o loop tentará salvar a revisão 2
    // Fornecemos o mock para o segundo ciclo do loop
    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValueOnce({
      success: true,
      data: { version: 3 }
    });

    await savePromise;

    // Ao final de ambos os ciclos, a revisão 2 foi ack
    expect(useCatalogStore.getState().lastAcknowledgedLocalRevision).toBe(2);
    expect(useCatalogStore.getState().isDirty).toBe(false);
  });

  // =========================================================================
  // SAVE-WATCHDOG-8: pending edit + timeout + retry -> payload mais novo é persistido
  // =========================================================================
  it('SAVE-WATCHDOG-8: edição pendente durante timeout faz com que o retry salve o payload atualizado', async () => {
    setupCatalog('cat-w8', 1);

    const saveMock = vi.spyOn(SupabaseService, 'saveCatalog');
    saveMock.mockImplementationOnce(() => new Promise(() => {}));

    const p1 = useCatalogStore.getState().saveCurrentCatalog();

    // Usuário altera título durante o salvamento
    useCatalogStore.setState({
      currentCatalog: {
        ...useCatalogStore.getState().currentCatalog!,
        title: 'Título Atualizado na Edição Pendente'
      },
      localRevision: 2,
      isDirty: true
    });

    // Watchdog expira Attempt 1
    await vi.advanceTimersByTimeAsync(10000);
    await p1;

    // Retry agora
    saveMock.mockImplementationOnce(async (payload) => {
      expect((payload as any).title).toBe('Título Atualizado na Edição Pendente');
      return { success: true, data: { version: 2 } };
    });

    const p2 = useCatalogStore.getState().saveCurrentCatalog();
    const res2 = await p2;

    expect(res2.success).toBe(true);
    expect(useCatalogStore.getState().currentCatalog?.title).toBe('Título Atualizado na Edição Pendente');
  });

  // =========================================================================
  // SAVE-WATCHDOG-9: dois timeouts consecutivos + sucesso -> recuperável
  // =========================================================================
  it('SAVE-WATCHDOG-9: dois timeouts consecutivos seguidos de sucesso recuperam o store sem deadlock', async () => {
    setupCatalog('cat-w9', 1);

    const saveMock = vi.spyOn(SupabaseService, 'saveCatalog');

    // Timeout 1
    saveMock.mockImplementationOnce(() => new Promise(() => {}));
    const p1 = useCatalogStore.getState().saveCurrentCatalog();
    await vi.advanceTimersByTimeAsync(10000);
    const r1 = await p1;
    expect(r1.status).toBe('error');

    // Timeout 2
    saveMock.mockImplementationOnce(() => new Promise(() => {}));
    const p2 = useCatalogStore.getState().saveCurrentCatalog();
    await vi.advanceTimersByTimeAsync(10000);
    const r2 = await p2;
    expect(r2.status).toBe('error');

    // Tentativa 3 com Sucesso
    saveMock.mockImplementationOnce(async () => ({
      success: true,
      data: { version: 2 }
    }));
    const p3 = useCatalogStore.getState().saveCurrentCatalog();
    const r3 = await p3;

    expect(r3.success).toBe(true);
    expect(useCatalogStore.getState().syncStatus).toBe('synced');
    expect(useCatalogStore.getState().currentCatalog?.version).toBe(2);
  });

  // =========================================================================
  // SAVE-WATCHDOG-10: Catalog A timeout -> Catalog B pode salvar normalmente
  // =========================================================================
  it('SAVE-WATCHDOG-10: timeout no Catálogo A não afeta nem bloqueia a fila do Catálogo B', async () => {
    const saveMock = vi.spyOn(SupabaseService, 'saveCatalog');

    // Configura Catálogo A
    setupCatalog('cat-A', 1);
    saveMock.mockImplementationOnce(() => new Promise(() => {}));

    const pA = useCatalogStore.getState().saveCurrentCatalog();

    // Expira Catálogo A
    await vi.advanceTimersByTimeAsync(10000);
    await pA;

    // Troca para Catálogo B
    setupCatalog('cat-B', 1);
    saveMock.mockImplementationOnce(async () => ({
      success: true,
      data: { version: 2 }
    }));

    const pB = useCatalogStore.getState().saveCurrentCatalog();
    const rB = await pB;

    expect(rB.success).toBe(true);
    expect(rB.version).toBe(2);
    expect(useCatalogStore.getState().currentCatalog?.id).toBe('cat-B');
    expect(useCatalogStore.getState().syncStatus).toBe('synced');
  });

  // =========================================================================
  // SAVE-WATCHDOG-11: timeout não altera acknowledged revision
  // =========================================================================
  it('SAVE-WATCHDOG-11: timeout de salvamento preserva lastAcknowledgedLocalRevision sem avanço falso', async () => {
    setupCatalog('cat-w11', 1);
    useCatalogStore.setState({
      localRevision: 5,
      lastAcknowledgedLocalRevision: 2,
      isDirty: true
    });

    vi.spyOn(SupabaseService, 'saveCatalog').mockImplementation(
      () => new Promise(() => {})
    );

    const p = useCatalogStore.getState().saveCurrentCatalog();
    await vi.advanceTimersByTimeAsync(10000);
    await p;

    // Não pode ter avançado para 5
    expect(useCatalogStore.getState().lastAcknowledgedLocalRevision).toBe(2);
    expect(useCatalogStore.getState().isDirty).toBe(true);
  });

  // =========================================================================
  // SAVE-WATCHDOG-12: original caller não fica pendurado além do watchdog
  // =========================================================================
  it('SAVE-WATCHDOG-12: o chamador original recebe a promise supervisionada e resolve no deadline de 10s', async () => {
    setupCatalog('cat-w12', 1);

    vi.spyOn(SupabaseService, 'saveCatalog').mockImplementation(
      () => new Promise(() => {})
    );

    let completed = false;
    const p = useCatalogStore.getState().saveCurrentCatalog().then((res) => {
      completed = true;
      return res;
    });

    // Aos 9.9 segundos, ainda não resolveu
    await vi.advanceTimersByTimeAsync(9900);
    expect(completed).toBe(false);

    // Aos 10 segundos, o watchdog dispara e conclui a promise do chamador
    await vi.advanceTimersByTimeAsync(100);
    expect(completed).toBe(true);

    const res = await p;
    expect(res.status).toBe('error');
    expect(res.error).toContain('Tempo limite');
  });
});

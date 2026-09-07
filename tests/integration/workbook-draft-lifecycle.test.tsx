import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_PRODUCTS } from '@/data/initialProducts';
import type { Product } from '@/domain/product.schema';
import {
  ProductWorkbookV2,
  WorkbookOwner,
  addDataset,
  addDatum,
  addModule,
  createWorkbook,
  ensureWorkbookV2,
  getDatasetCellKey
} from '@/domain/product-workbook';
import { ProductKnowledgeWorkspace } from '@/components/library/product-workspace/ProductKnowledgeWorkspace';
import { ProductWorkspaceExperienceGate } from '@/components/library/mega-workspace/ProductWorkspaceExperienceGate';
import {
  ProductWorkbookRepository,
  SaveWorkbookParams,
  SaveWorkbookResult,
  WorkbookConflictError
} from '@/services/product-workbook';
import { SupabaseProductWorkbookRepository } from '@/services/product-workbook/product-workbook.repository';
import { useAuthStore } from '@/stores/useAuthStore';
import { activeEditingContext } from '@/stores/activeEditingContext';
import { useCatalogStore } from '@/stores/useCatalogStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useUIStore } from '@/stores/useUIStore';
import { useWorkbookDraftStore } from '@/stores/useWorkbookDraftStore';

const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_Q_ID = '44444444-4444-4444-8444-444444444444';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function productFixture(id = PRODUCT_ID): Product {
  return {
    ...INITIAL_PRODUCTS[0],
    id,
    family_id: undefined,
    code: id === PRODUCT_ID ? 'P-100' : 'Q-200',
    model: id === PRODUCT_ID ? 'Pump' : 'Valve',
    family: 'Geral',
    version: 1
  };
}

function workbookFixture(ownerId = PRODUCT_ID, revision = 1): ProductWorkbookV2 {
  let workbook = ensureWorkbookV2(createWorkbook({
    id: `55555555-5555-4555-8555-${ownerId === PRODUCT_ID ? '555555555555' : '666666666666'}`,
    owner: { kind: 'product', id: ownerId },
    revision
  }));
  workbook = ensureWorkbookV2(addModule(workbook, {
    id: 'mod-base',
    semanticKey: 'base.general',
    label: 'Base',
    kind: 'key_value',
    order: 0
  }));
  workbook = ensureWorkbookV2(addDatum(workbook, {
    semanticKey: 'base.pressure',
    moduleId: 'mod-base',
    label: 'Pressão',
    value: { type: 'quantity', amount: 10, unit: 'bar' },
    evidence: [{
      id: 'ev-base',
      sourceDocumentId: 'doc-base',
      page: 4,
      section: 'Dados técnicos',
      observedValue: { type: 'quantity', amount: 10, unit: 'bar' }
    }],
    status: 'verified'
  }, 'datum-base'));
  workbook = addDataset(workbook, {
    id: 'dataset-base',
    semanticKey: 'base.table',
    moduleId: 'mod-base',
    label: 'Tabela Base',
    kind: 'matrix',
    columns: [{ id: 'col-value', semanticKey: 'base.value', label: 'Valor', valueType: 'quantity', unit: 'bar', order: 0 }],
    rows: [{ id: 'row-1', semanticKey: 'base.row', label: 'Linha 1', order: 0 }],
    cells: {
      [getDatasetCellKey('row-1', 'col-value')]: { rowId: 'row-1', columnId: 'col-value', datumId: 'datum-base' }
    },
    order: 0
  });
  return workbook;
}

function cloneWorkbook(workbook: ProductWorkbookV2, revision = workbook.revision): ProductWorkbookV2 {
  return JSON.parse(JSON.stringify({ ...workbook, revision })) as ProductWorkbookV2;
}

function mockRepository(initial: ProductWorkbookV2 | null) {
  const getWorkbook = vi.fn(async (_owner: WorkbookOwner) => initial ? cloneWorkbook(initial) : null);
  const saveWorkbook = vi.fn<ProductWorkbookRepository['saveWorkbook']>();
  const repository: ProductWorkbookRepository = { getWorkbook, saveWorkbook };
  return { repository, getWorkbook, saveWorkbook };
}

async function addModuleThroughClassic(templateName: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: /Novo Módulo|Criar Primeiro Módulo Técnico/ }));
  fireEvent.click(screen.getByRole('button', { name: templateName }));
  fireEvent.click(screen.getByRole('button', { name: /Adicionar Módulo/ }));
}

describe('G1 Workbook draft/session lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    activeEditingContext.release();
    useWorkbookDraftStore.getState().resetForTests();
    useAuthStore.setState({
      status: 'authenticated',
      userId: 'g1-workbook-user',
      role: 'admin',
      email: 'g1-workbook@example.test',
      errorMessage: null
    });
    useUIStore.setState({ navigationEpoch: 0, selectedProductForWorkspaceId: null, activeTab: 'library' });
  });

  it('AUD-005: real Classic edit during ACK survives; next manual Save uses canonical ACK revision and persists both generations', async () => {
    const product = productFixture();
    const base = workbookFixture();
    vi.spyOn(SupabaseProductWorkbookRepository.prototype, 'getWorkbook').mockResolvedValue(base);
    const pending: Array<{ params: SaveWorkbookParams; deferred: ReturnType<typeof deferred<SaveWorkbookResult>> }> = [];
    const saveSpy = vi.spyOn(SupabaseProductWorkbookRepository.prototype, 'saveWorkbook')
      .mockImplementation((params) => {
        const item = { params, deferred: deferred<SaveWorkbookResult>() };
        pending.push(item);
        return item.deferred.promise;
      });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    render(<ProductKnowledgeWorkspace product={product} onClose={() => undefined} />);
    await screen.findByText(/Revisão Persistida: 1/);

    await addModuleThroughClassic(/Especificações Metrológicas/);
    fireEvent.click(screen.getByRole('button', { name: /Salvar Conhecimento/ }));
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(pending[0].params.expectedRevision).toBe(1);
    expect(pending[0].params.workbook.revision).toBe(1);

    await addModuleThroughClassic(/Sinais Elétricos e Termometria/);
    const sessionDuringSave = useWorkbookDraftStore.getState().getSession({ kind: 'product', id: PRODUCT_ID })!;
    expect(sessionDuringSave.localGeneration).toBe(2);
    expect(sessionDuringSave.acknowledgedGeneration).toBe(0);
    expect(sessionDuringSave.inFlight).not.toBeNull();

    await act(async () => {
      pending[0].deferred.resolve({
        success: true,
        workbook: cloneWorkbook(ensureWorkbookV2(pending[0].params.workbook), 2),
        revision: 2
      });
      await Promise.resolve();
    });

    let session = useWorkbookDraftStore.getState().getSession({ kind: 'product', id: PRODUCT_ID })!;
    expect(session.baseRevision).toBe(2);
    expect(session.acknowledgedGeneration).toBe(1);
    expect(session.localGeneration).toBe(2);
    expect(session.draft.modules.map((module) => module.label)).toEqual(expect.arrayContaining([
      'Especificações Metrológicas',
      'Sinais Elétricos e Termometria'
    ]));
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Rascunho mantido nesta sessão/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Salvar Conhecimento/ }));
    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(pending[1].params.expectedRevision).toBe(2);
    expect(pending[1].params.workbook.revision).toBe(2);
    expect(pending[1].params.workbook.modules.map((module) => module.label)).toEqual(expect.arrayContaining([
      'Especificações Metrológicas',
      'Sinais Elétricos e Termometria'
    ]));

    await act(async () => {
      pending[1].deferred.resolve({
        success: true,
        workbook: cloneWorkbook(ensureWorkbookV2(pending[1].params.workbook), 3),
        revision: 3
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      session = useWorkbookDraftStore.getState().getSession({ kind: 'product', id: PRODUCT_ID })!;
      expect(session.acknowledgedGeneration).toBe(2);
      expect(session.baseRevision).toBe(3);
    });
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('B: refresh while Save is active is evidence-only; compatible own echo is reconciled by ACK and no successor is automatic', async () => {
    const owner = { kind: 'product' as const, id: PRODUCT_ID };
    const base = workbookFixture();
    const firstSave = deferred<SaveWorkbookResult>();
    const getWorkbook = vi.fn()
      .mockResolvedValueOnce(base)
      .mockImplementationOnce(async () => {
        const current = useWorkbookDraftStore.getState().getSession(owner)!;
        return cloneWorkbook(current.inFlight!.sentSnapshot, 2);
      });
    const saveWorkbook = vi.fn().mockImplementationOnce(() => firstSave.promise);
    const repository: ProductWorkbookRepository = { getWorkbook, saveWorkbook };

    await useWorkbookDraftStore.getState().load(owner, repository);
    const editedA = { ...base, metadata: { phase: 'A' } };
    useWorkbookDraftStore.getState().edit(owner, editedA);
    const save = useWorkbookDraftStore.getState().save(owner, repository);
    useWorkbookDraftStore.getState().edit(owner, { ...editedA, metadata: { phase: 'B' } });
    await useWorkbookDraftStore.getState().refresh(owner, repository);

    let session = useWorkbookDraftStore.getState().getSession(owner)!;
    expect(session.baseRevision).toBe(1);
    expect(session.remoteRevision).toBe(2);
    expect(session.inFlight?.expectedRevision).toBe(1);
    expect(session.draft.metadata?.phase).toBe('B');

    firstSave.resolve({ success: true, workbook: cloneWorkbook(ensureWorkbookV2(editedA), 2), revision: 2 });
    await expect(save).resolves.toBe(false);
    session = useWorkbookDraftStore.getState().getSession(owner)!;
    expect(session.baseRevision).toBe(2);
    expect(session.acknowledgedGeneration).toBe(1);
    expect(session.localGeneration).toBe(2);
    expect(session.draft.metadata?.phase).toBe('B');
    expect(session.conflict).toBeNull();
    expect(saveWorkbook).toHaveBeenCalledTimes(1);
  });

  it('F/G refresh keeps highest evidence snapshot and clean remote deletion establishes an explicit deleted baseline', async () => {
    const owner = { kind: 'product' as const, id: PRODUCT_ID };
    const base = workbookFixture();
    const remote3 = cloneWorkbook({ ...base, metadata: { server: 'v3' } }, 3);
    const stale2 = cloneWorkbook({ ...base, metadata: { server: 'stale-v2' } }, 2);
    const getWorkbook = vi.fn()
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce(remote3)
      .mockResolvedValueOnce(stale2)
      .mockResolvedValueOnce(null);
    const saveWorkbook = vi.fn();
    const repository: ProductWorkbookRepository = { getWorkbook, saveWorkbook };

    await useWorkbookDraftStore.getState().load(owner, repository);
    await useWorkbookDraftStore.getState().refresh(owner, repository);
    let session = useWorkbookDraftStore.getState().getSession(owner)!;
    expect(session.baseRevision).toBe(3);
    expect(session.remoteRevision).toBe(3);
    expect(session.remoteSnapshot?.metadata?.server).toBe('v3');

    await useWorkbookDraftStore.getState().refresh(owner, repository);
    session = useWorkbookDraftStore.getState().getSession(owner)!;
    expect(session.baseRevision).toBe(3);
    expect(session.remoteRevision).toBe(3);
    expect(session.remoteSnapshot?.metadata?.server).toBe('v3');

    await useWorkbookDraftStore.getState().refresh(owner, repository);
    session = useWorkbookDraftStore.getState().getSession(owner)!;
    expect(getWorkbook).toHaveBeenCalledTimes(4);
    expect(saveWorkbook).not.toHaveBeenCalled();
    expect(session.remoteDeletion).toBe(true);
    expect(session.baseSnapshot).toBeNull();
    expect(session.baseRevision).toBeNull();
    expect(session.draft.revision).toBe(0);
  });

  it('H/M: failure keeps ownership; edit after failure survives; concurrent explicit retry joins one latest request', async () => {
    const owner = { kind: 'product' as const, id: PRODUCT_ID };
    const base = workbookFixture();
    const retry = deferred<SaveWorkbookResult>();
    const { repository, saveWorkbook } = mockRepository(base);
    saveWorkbook
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(() => retry.promise);

    await useWorkbookDraftStore.getState().load(owner, repository);
    useWorkbookDraftStore.getState().edit(owner, { ...base, metadata: { phase: 'A' } });
    await expect(useWorkbookDraftStore.getState().save(owner, repository)).resolves.toBe(false);
    let session = useWorkbookDraftStore.getState().getSession(owner)!;
    expect(session.failure?.message).toContain('offline');
    expect(session.localGeneration).toBe(1);
    expect(session.acknowledgedGeneration).toBe(0);

    useWorkbookDraftStore.getState().edit(owner, { ...session.draft, metadata: { phase: 'B' } });
    const retry1 = useWorkbookDraftStore.getState().save(owner, repository);
    const retry2 = useWorkbookDraftStore.getState().save(owner, repository);
    expect(saveWorkbook).toHaveBeenCalledTimes(2);
    const retryParams = saveWorkbook.mock.calls[1][0] as SaveWorkbookParams;
    expect(retryParams.expectedRevision).toBe(1);
    expect(ensureWorkbookV2(retryParams.workbook).metadata?.phase).toBe('B');

    retry.resolve({ success: true, workbook: cloneWorkbook(ensureWorkbookV2(retryParams.workbook), 2), revision: 2 });
    await expect(retry1).resolves.toBe(true);
    await expect(retry2).resolves.toBe(true);
    session = useWorkbookDraftStore.getState().getSession(owner)!;
    expect(session.failure).toBeNull();
    expect(session.baseRevision).toBe(2);
    expect(session.acknowledgedGeneration).toBe(2);
  });

  it('I: acknowledged older generation advances CAS base; explicit successor 40001 preserves latest draft and never retries automatically', async () => {
    const owner = { kind: 'product' as const, id: PRODUCT_ID };
    const base = workbookFixture();
    const firstSave = deferred<SaveWorkbookResult>();
    const { repository, saveWorkbook } = mockRepository(base);
    saveWorkbook
      .mockImplementationOnce(() => firstSave.promise)
      .mockRejectedValueOnce(new WorkbookConflictError('WORKBOOK_CONFLICT Atual: 3', 2, 3, `product:${PRODUCT_ID}`));

    await useWorkbookDraftStore.getState().load(owner, repository);
    useWorkbookDraftStore.getState().edit(owner, { ...base, metadata: { phase: 'A' } });
    const first = useWorkbookDraftStore.getState().save(owner, repository);
    useWorkbookDraftStore.getState().edit(owner, { ...base, metadata: { phase: 'B' } });
    const sent1 = ensureWorkbookV2((saveWorkbook.mock.calls[0][0] as SaveWorkbookParams).workbook);
    firstSave.resolve({ success: true, workbook: cloneWorkbook(sent1, 2), revision: 2 });
    await expect(first).resolves.toBe(false);

    await expect(useWorkbookDraftStore.getState().save(owner, repository)).resolves.toBe(false);
    const secondParams = saveWorkbook.mock.calls[1][0] as SaveWorkbookParams;
    expect(secondParams.expectedRevision).toBe(2);
    expect(ensureWorkbookV2(secondParams.workbook).metadata?.phase).toBe('B');
    let session = useWorkbookDraftStore.getState().getSession(owner)!;
    expect(session.baseRevision).toBe(2);
    expect(session.conflict?.actualRevision).toBe(3);
    expect(session.draft.metadata?.phase).toBe('B');

    for (let index = 0; index < 50; index += 1) {
      await useWorkbookDraftStore.getState().save(owner, repository);
    }
    expect(saveWorkbook).toHaveBeenCalledTimes(2);
  });

  it('L: canonical re-key of a post-send edited entity fails closed with canonical + local draft + delta retained', async () => {
    const owner = { kind: 'product' as const, id: PRODUCT_ID };
    const base = workbookFixture();
    const saveDeferred = deferred<SaveWorkbookResult>();
    const { repository, saveWorkbook } = mockRepository(base);
    saveWorkbook.mockImplementationOnce(() => saveDeferred.promise);

    await useWorkbookDraftStore.getState().load(owner, repository);
    useWorkbookDraftStore.getState().edit(owner, { ...base, metadata: { sent: 'yes' } });
    const save = useWorkbookDraftStore.getState().save(owner, repository);
    const current = useWorkbookDraftStore.getState().getSession(owner)!;
    const later = {
      ...current.draft,
      modules: current.draft.modules.map((module) => module.id === 'mod-base' ? { ...module, label: 'Local later label' } : module)
    } as ProductWorkbookV2;
    useWorkbookDraftStore.getState().edit(owner, later);

    const sent = ensureWorkbookV2((saveWorkbook.mock.calls[0][0] as SaveWorkbookParams).workbook);
    const canonical = cloneWorkbook({
      ...sent,
      modules: sent.modules.map((module) => module.id === 'mod-base' ? { ...module, id: 'mod-server' } : module),
      data: Object.fromEntries(Object.entries(sent.data).map(([id, datum]) => [id, datum.moduleId === 'mod-base' ? { ...datum, moduleId: 'mod-server' } : datum])),
      datasets: sent.datasets.map((dataset) => dataset.moduleId === 'mod-base' ? { ...dataset, moduleId: 'mod-server' } : dataset)
    } as ProductWorkbookV2, 2);
    saveDeferred.resolve({ success: true, workbook: canonical, revision: 2 });
    await expect(save).resolves.toBe(false);

    const session = useWorkbookDraftStore.getState().getSession(owner)!;
    expect(session.reconciliationRequired?.reason).toBe('structural-replay');
    expect(session.reconciliationRequired?.canonicalSnapshot?.modules[0].id).toBe('mod-server');
    expect(session.reconciliationRequired?.localDraft.modules[0].label).toBe('Local later label');
    expect(session.acknowledgedGeneration).toBe(0);
    expect(saveWorkbook).toHaveBeenCalledTimes(1);
  });

  it('N/O: unmount/remount during in-flight Save retains the owner request; StrictMode dedupes the product load and late ACK settles retained state', async () => {
    const product = productFixture();
    const base = workbookFixture();
    const saveDeferred = deferred<SaveWorkbookResult>();
    const getSpy = vi.spyOn(SupabaseProductWorkbookRepository.prototype, 'getWorkbook').mockResolvedValue(base);
    const saveSpy = vi.spyOn(SupabaseProductWorkbookRepository.prototype, 'saveWorkbook').mockImplementation(() => saveDeferred.promise);

    const firstRender = render(
      <React.StrictMode>
        <ProductKnowledgeWorkspace product={product} onClose={() => undefined} />
      </React.StrictMode>
    );
    await screen.findByText(/Revisão Persistida: 1/);
    expect(getSpy).toHaveBeenCalledTimes(1);
    await addModuleThroughClassic(/Condições de Operação & Ambiente/);
    fireEvent.click(screen.getByRole('button', { name: /Salvar Conhecimento/ }));
    expect(saveSpy).toHaveBeenCalledTimes(1);
    firstRender.unmount();

    render(<ProductKnowledgeWorkspace product={product} onClose={() => undefined} />);
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(useWorkbookDraftStore.getState().getSession({ kind: 'product', id: PRODUCT_ID })?.inFlight).not.toBeNull();

    const sent = ensureWorkbookV2((saveSpy.mock.calls[0][0] as SaveWorkbookParams).workbook);
    await act(async () => {
      saveDeferred.resolve({ success: true, workbook: cloneWorkbook(sent, 2), revision: 2 });
      await Promise.resolve();
    });
    const session = useWorkbookDraftStore.getState().getSession({ kind: 'product', id: PRODUCT_ID })!;
    expect(session.inFlight).toBeNull();
    expect(session.baseRevision).toBe(2);
    expect(session.acknowledgedGeneration).toBe(1);
  });

  it('AUD-012 N5: reconnect CAS conflict keeps the local draft visibly unsaved, blocks retries, survives reopening, and only discards through a server reload', async () => {
    const product = productFixture();
    const base = workbookFixture();
    const remote = cloneWorkbook({ ...base, metadata: { server: 'revision-3' } }, 3);
    const getSpy = vi.spyOn(SupabaseProductWorkbookRepository.prototype, 'getWorkbook')
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce(remote);
    const saveSpy = vi.spyOn(SupabaseProductWorkbookRepository.prototype, 'saveWorkbook')
      .mockRejectedValueOnce(new Error('Conexão interrompida'))
      .mockRejectedValueOnce(new WorkbookConflictError('WORKBOOK_CONFLICT Atual: 3', 1, 3, `product:${PRODUCT_ID}`));

    const view = render(<ProductKnowledgeWorkspace product={product} onClose={() => undefined} />);
    await screen.findByText(/Revisão Persistida: 1/);
    await addModuleThroughClassic(/Especificações Metrológicas/);
    fireEvent.click(screen.getByRole('button', { name: /Salvar Conhecimento/ }));
    await screen.findByText(/Conexão interrompida/);
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));

    await screen.findByText(/Alterações não salvas — conflito CAS/);
    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/não há mesclagem automática/i)).toBeInTheDocument();
    const blockedSave = screen.getByRole('button', { name: /Salvar Conhecimento/ });
    expect(blockedSave).toBeDisabled();
    fireEvent.click(blockedSave);
    expect(saveSpy).toHaveBeenCalledTimes(2);

    view.unmount();
    render(<ProductKnowledgeWorkspace product={product} onClose={() => undefined} />);
    expect(await screen.findByText(/Alterações não salvas — conflito CAS/)).toBeInTheDocument();
    expect(getSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Descartar rascunho local e recarregar servidor/ }));
    await screen.findByText(/Revisão Persistida: 3/);
    expect(screen.queryByText(/Alterações não salvas — conflito CAS/)).not.toBeInTheDocument();
    expect(getSpy).toHaveBeenCalledTimes(2);
    const session = useWorkbookDraftStore.getState().getSession({ kind: 'product', id: PRODUCT_ID })!;
    expect(session.draft.metadata?.server).toBe('revision-3');
    expect(session.localGeneration).toBe(session.acknowledgedGeneration);
  });

  it('AUD-012 N5: remote deletion with a dirty draft is explicit to the user and cannot be saved as a replacement', async () => {
    const product = productFixture();
    const base = workbookFixture();
    vi.spyOn(SupabaseProductWorkbookRepository.prototype, 'getWorkbook').mockResolvedValue(base);
    const saveSpy = vi.spyOn(SupabaseProductWorkbookRepository.prototype, 'saveWorkbook');
    render(<ProductKnowledgeWorkspace product={product} onClose={() => undefined} />);
    await screen.findByText(/Revisão Persistida: 1/);
    await addModuleThroughClassic(/Condições de Operação & Ambiente/);

    await act(async () => {
      await useWorkbookDraftStore.getState().refresh(
        { kind: 'product', id: PRODUCT_ID },
        { getWorkbook: vi.fn(async () => null), saveWorkbook: vi.fn() }
      );
    });

    expect(await screen.findByText(/workbook foi removido no servidor/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Salvar Conhecimento/ })).toBeDisabled();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('AUD-012 N5: navigation or identity changes invalidate an in-progress discard without replacing the retained local draft', async () => {
    const owner = { kind: 'product' as const, id: PRODUCT_ID };
    const base = workbookFixture();
    const navigationRead = deferred<ProductWorkbookV2 | null>();
    const identityRead = deferred<ProductWorkbookV2 | null>();
    const navigationRepository: ProductWorkbookRepository = {
      getWorkbook: vi.fn(() => navigationRead.promise),
      saveWorkbook: vi.fn()
    };
    const identityRepository: ProductWorkbookRepository = {
      getWorkbook: vi.fn(() => identityRead.promise),
      saveWorkbook: vi.fn()
    };

    await useWorkbookDraftStore.getState().load(owner, { getWorkbook: vi.fn(async () => base), saveWorkbook: vi.fn() });
    useWorkbookDraftStore.getState().edit(owner, { ...base, metadata: { local: 'retain' } });
    const navigationDiscard = useWorkbookDraftStore.getState().discardWithRefresh(owner, navigationRepository, 0);
    useUIStore.getState().advanceNavigationEpoch();
    navigationRead.resolve(cloneWorkbook({ ...base, metadata: { server: 'ignored-navigation' } }, 2));
    await expect(navigationDiscard).resolves.toBe(false);
    expect(useWorkbookDraftStore.getState().getSession(owner)?.draft.metadata?.local).toBe('retain');

    useAuthStore.setState({ userId: 'device-a' });
    await useWorkbookDraftStore.getState().load(owner, { getWorkbook: vi.fn(async () => base), saveWorkbook: vi.fn() });
    useWorkbookDraftStore.getState().edit(owner, { ...base, metadata: { local: 'device-a' } });
    const identityDiscard = useWorkbookDraftStore.getState().discardWithRefresh(owner, identityRepository, 1);
    useAuthStore.setState({ userId: 'device-b' });
    identityRead.resolve(cloneWorkbook({ ...base, metadata: { server: 'ignored-identity' } }, 2));
    await expect(identityDiscard).resolves.toBe(false);
    const retainedA = useWorkbookDraftStore.getState().sessions[`device-a:product:${PRODUCT_ID}`];
    expect(retainedA.draft.metadata?.local).toBe('device-a');
    expect(retainedA.discardToken).toBeNull();
  });

  it('AUD-012: Classic → Mega → Classic preserves the same dirty session with zero writes; cancel does nothing and explicit discard is the only disposal path', async () => {
    const product = productFixture();
    const base = workbookFixture();
    const classicGetSpy = vi.spyOn(SupabaseProductWorkbookRepository.prototype, 'getWorkbook').mockResolvedValue(base);
    const saveSpy = vi.spyOn(SupabaseProductWorkbookRepository.prototype, 'saveWorkbook');
    const megaWorkbookRepo = { getWorkbook: vi.fn(async () => cloneWorkbook(base)) };
    const sourceRepo = {
      getSourceDocument: vi.fn(async () => null),
      listSourceDocuments: vi.fn(async () => [])
    };

    render(
      <ProductWorkspaceExperienceGate
        product={product}
        onClose={() => undefined}
        workbookRepo={megaWorkbookRepo}
        sourceRepo={sourceRepo}
      />
    );
    await screen.findByText(/Revisão Persistida: 1/);
    await addModuleThroughClassic(/Acessórios Inclusos e Opcionais/);
    let session = useWorkbookDraftStore.getState().getSession({ kind: 'product', id: PRODUCT_ID })!;
    expect(session.localGeneration).toBe(1);
    expect(session.acknowledgedGeneration).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: /Abrir Mega · preservar rascunho/ }));
    await screen.findByText(/Rascunho do Classic mantido nesta sessão/);
    expect(saveSpy).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /Workspace Clássico/ }));
    expect((await screen.findAllByText(/Rascunho mantido nesta sessão/)).length).toBeGreaterThan(0);
    expect(screen.getByText('Acessórios Inclusos e Opcionais')).toBeInTheDocument();
    expect(classicGetSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    session = useWorkbookDraftStore.getState().getSession({ kind: 'product', id: PRODUCT_ID })!;
    expect(session.localGeneration).toBe(1);
    expect(session.acknowledgedGeneration).toBe(0);
    expect(saveSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Descartar e abrir Mega/ }));
    await screen.findByText(/Mega Workspace/);
    session = useWorkbookDraftStore.getState().getSession({ kind: 'product', id: PRODUCT_ID })!;
    expect(session.localGeneration).toBe(0);
    expect(session.acknowledgedGeneration).toBe(0);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('product P → Q → P retains P draft independently of Q and performs zero writes', async () => {
    const ownerP = { kind: 'product' as const, id: PRODUCT_ID };
    const ownerQ = { kind: 'product' as const, id: PRODUCT_Q_ID };
    const baseP = workbookFixture(PRODUCT_ID, 1);
    const baseQ = workbookFixture(PRODUCT_Q_ID, 7);
    const getWorkbook = vi.fn(async (owner: WorkbookOwner) => owner.id === PRODUCT_ID ? cloneWorkbook(baseP) : cloneWorkbook(baseQ));
    const saveWorkbook = vi.fn();
    const repository: ProductWorkbookRepository = { getWorkbook, saveWorkbook };

    await useWorkbookDraftStore.getState().load(ownerP, repository);
    useWorkbookDraftStore.getState().edit(ownerP, { ...baseP, metadata: { retained: 'P' } });
    await useWorkbookDraftStore.getState().load(ownerQ, repository);
    const qSession = useWorkbookDraftStore.getState().getSession(ownerQ)!;
    expect(qSession.baseRevision).toBe(7);
    expect(qSession.localGeneration).toBe(0);

    const pSession = useWorkbookDraftStore.getState().getSession(ownerP)!;
    expect(pSession.draft.metadata?.retained).toBe('P');
    expect(pSession.localGeneration).toBe(1);
    expect(pSession.baseRevision).toBe(1);
    expect(saveWorkbook).not.toHaveBeenCalled();
  });

  it('C2 React lifecycle: P → Q → stale P cleanup → unmount Q → Library fallback', async () => {
    const productP = productFixture(PRODUCT_ID);
    const productQ = productFixture(PRODUCT_Q_ID);
    const baseP = workbookFixture(PRODUCT_ID, 1);
    const baseQ = workbookFixture(PRODUCT_Q_ID, 7);
    vi.spyOn(SupabaseProductWorkbookRepository.prototype, 'getWorkbook')
      .mockImplementation(async (owner: WorkbookOwner) => owner.id === PRODUCT_ID ? cloneWorkbook(baseP) : cloneWorkbook(baseQ));
    const libraryFlush = vi.spyOn(useLibraryStore.getState(), 'flushLibraryEdits').mockResolvedValue(true);
    const catalogSave = vi.spyOn(useCatalogStore.getState(), 'saveActiveDocument').mockResolvedValue({
      success: true,
      status: 'synced'
    });

    const view = render(<ProductKnowledgeWorkspace product={productP} onClose={() => undefined} />);
    await waitFor(() => expect(activeEditingContext.get()?.resourceId).toBe(PRODUCT_ID));
    const pGeneration = activeEditingContext.get()!.generation;

    view.rerender(<ProductKnowledgeWorkspace product={productQ} onClose={() => undefined} />);
    await waitFor(() => expect(activeEditingContext.get()?.resourceId).toBe(PRODUCT_Q_ID));
    const qGeneration = activeEditingContext.get()!.generation;
    expect(qGeneration).toBeGreaterThan(pGeneration);

    activeEditingContext.release(pGeneration);
    expect(activeEditingContext.get()?.resourceId).toBe(PRODUCT_Q_ID);

    view.unmount();
    expect(activeEditingContext.get()).toBeNull();

    await activeEditingContext.save();
    expect(libraryFlush).toHaveBeenCalledTimes(1);
    expect(catalogSave).not.toHaveBeenCalled();
  });
});

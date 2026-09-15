import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogLibrary } from '@/vnext/app/CatalogLibrary';
import {
  CatalogLibraryService,
  createDefaultCatalogStarterRegistry,
  type CatalogLibraryResult,
} from '@/vnext/library';
import {
  createCatalogDocument,
  createStaticPageTemplateRegistry,
  type ApplicationExecutionDependencies,
} from '@/vnext/application';
import type {
  CatalogListItem,
  CatalogPersistenceEnvelope,
  CatalogRepository,
  CreateCatalogRequest,
  PersistenceResult,
} from '@/vnext/persistence';

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function testUuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

function validEnvelope(id: string, title: string): CatalogPersistenceEnvelope {
  let rootPending = true;
  let subId = 1;
  const doc = createCatalogDocument(() => {
    if (rootPending) {
      rootPending = false;
      return id;
    }
    return testUuid(subId++);
  }, title);
  return {
    catalogId: id,
    remoteRevision: 1,
    lastMutationId: testUuid(9000),
    title,
    locale: doc.locale,
    createdAt: '2026-09-14T12:00:00.000Z',
    updatedAt: '2026-09-14T12:05:00.000Z',
    createdBy: 'user-a',
    updatedBy: 'user-a',
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot: doc,
  };
}

function item(title: string, suffix: string, archived = false): CatalogListItem {
  return {
    catalogId: `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`,
    remoteRevision: 1,
    title,
    locale: 'pt-BR',
    createdAt: '2026-09-14T12:00:00.000Z',
    updatedAt: '2026-09-14T12:05:00.000Z',
    createdBy: 'user-a',
    updatedBy: 'user-a',
    archivedAt: archived ? '2026-09-14T12:10:00.000Z' : null,
    documentSchemaVersion: 1,
  };
}

function serviceWithList(
  list: CatalogLibraryService['list']
): CatalogLibraryService {
  return { list, listStarters: () => [], getCreateState: () => 'idle' } as unknown as CatalogLibraryService;
}

describe('W3.E CatalogLibrary UI coordination', () => {
  it('ignores an older archived load that resolves after a newer active load', async () => {
    const initial = deferred<CatalogLibraryResult<readonly CatalogListItem[]>>();
    const archived = deferred<CatalogLibraryResult<readonly CatalogListItem[]>>();
    const active = deferred<CatalogLibraryResult<readonly CatalogListItem[]>>();
    const list = vi.fn()
      .mockImplementationOnce(() => initial.promise)
      .mockImplementationOnce(() => archived.promise)
      .mockImplementationOnce(() => active.promise);

    const { getByRole, queryByText, getByText } = render(
      <CatalogLibrary service={serviceWithList(list)} onOpen={vi.fn()} />
    );

    await act(async () => {
      initial.resolve({ ok: true, value: [item('Ativo inicial', '1')] });
      await initial.promise;
    });
    await waitFor(() => expect(getByText('Ativo inicial')).toBeInTheDocument());

    fireEvent.click(getByRole('tab', { name: 'Arquivados' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    fireEvent.click(getByRole('tab', { name: 'Ativos' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));

    await act(async () => {
      active.resolve({ ok: true, value: [item('Ativo mais novo', '2')] });
      await active.promise;
    });
    await waitFor(() => expect(getByText('Ativo mais novo')).toBeInTheDocument());

    await act(async () => {
      archived.resolve({ ok: true, value: [item('Arquivado atrasado', '3', true)] });
      await archived.promise;
    });

    expect(getByText('Ativo mais novo')).toBeInTheDocument();
    expect(queryByText('Arquivado atrasado')).toBeNull();
    expect(getByRole('button', { name: 'Abrir' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Duplicar' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Renomear' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
  });

  it('traps dialog focus, supports Escape, and restores focus to the triggering action', async () => {
    const list = vi.fn().mockResolvedValue({ ok: true, value: [item('Catálogo foco', '4')] });
    const { getByRole, queryByRole } = render(
      <CatalogLibrary service={serviceWithList(list)} onOpen={vi.fn()} />
    );

    const renameTrigger = await waitFor(() => getByRole('button', { name: 'Renomear' }));
    renameTrigger.focus();
    fireEvent.click(renameTrigger);

    const renameDialog = getByRole('dialog', { name: 'Renomear catálogo' });
    const renameInput = getByRole('textbox', { name: 'Nome do catálogo' });
    await waitFor(() => expect(document.activeElement).toBe(renameInput));
    fireEvent.keyDown(renameInput, { key: 'Escape' });
    await waitFor(() => expect(queryByRole('dialog', { name: 'Renomear catálogo' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(renameTrigger));
    expect(renameDialog).not.toBeInTheDocument();

    const archiveTrigger = getByRole('button', { name: 'Arquivar' });
    archiveTrigger.focus();
    fireEvent.click(archiveTrigger);

    const archiveDialog = getByRole('dialog', { name: 'Arquivar “Catálogo foco”?' });
    const cancel = getByRole('button', { name: 'Cancelar' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));

    const confirm = getByRole('button', { name: 'Arquivar catálogo' });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(getByRole('button', { name: 'Fechar' }));

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    await waitFor(() => expect(queryByRole('dialog', { name: 'Arquivar “Catálogo foco”?' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(archiveTrigger));
    expect(archiveDialog).not.toBeInTheDocument();
  });

  it('CREATE-AMB-07 presents unresolved create as verification and retries the same service attempt without refresh guidance', async () => {
    let pending = false;
    const list = vi.fn().mockResolvedValue({ ok: true, value: [] });
    const createBlank = vi.fn(async (): Promise<CatalogLibraryResult<CatalogPersistenceEnvelope>> => {
      pending = true;
      return { ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } };
    });
    const service = {
      list,
      listStarters: () => [],
      createBlank,
      getCreateState: () => pending ? 'pending-verification' : 'idle',
    } as unknown as CatalogLibraryService;
    const { getByRole, getAllByRole, queryByText } = render(
      <CatalogLibrary service={service} onOpen={vi.fn()} />
    );

    const create = await waitFor(() => getByRole('button', { name: 'Novo catálogo' }));
    fireEvent.click(create);
    fireEvent.click(getByRole('button', { name: /Em branco/ }));
    const alert = await waitFor(() => getByRole('alert'));
    expect(alert).toHaveTextContent('Não foi possível confirmar a criação. Tente novamente para verificar o mesmo catálogo.');
    expect(queryByText(/Atualize a biblioteca/i)).toBeNull();
    expect(getAllByRole('button', { name: 'Verificar criação' }).length).toBeGreaterThanOrEqual(2);
    const retry = alert.querySelector('button');
    expect(retry).not.toBeNull();
    fireEvent.click(retry!);
    await waitFor(() => expect(createBlank).toHaveBeenCalledTimes(2));
    expect(createBlank.mock.calls).toEqual([[], []]);
  });

  it('W3.F exposes compact Duplicate and Starter flows below React authority', async () => {
    const source = item('Catálogo base', '40');
    const copy = item('Cópia de Catálogo base', '41');
    const list = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: [source] })
      .mockResolvedValue({ ok: true, value: [copy, source] });
    const duplicateEnvelope = {
      ...copy,
      lastMutationId: '00000000-0000-4000-8000-000000000042',
      origin: { originKind: 'duplicate', originId: source.catalogId, originRevision: 1 },
      documentSnapshot: {
        schemaVersion: 1,
        id: copy.catalogId,
        title: copy.title,
        locale: 'pt-BR',
        style: { fonts: [{ family: 'Noto Sans', revision: '5.3.0', weight: 400 as const, style: 'normal' as const }], defaultText: {}, palette: ['#172033'] },
        pages: [{ id: 'copy-page', widthMm: 210 as const, heightMm: 297 as const, objects: [] }],
        assets: [],
      },
    };
    const duplicate = vi.fn().mockResolvedValue({ ok: true, value: duplicateEnvelope });
    const createFromStarter = vi.fn().mockResolvedValue({ ok: true, value: duplicateEnvelope });
    const createBlank = vi.fn().mockResolvedValue({ ok: true, value: duplicateEnvelope });
    const onOpen = vi.fn();
    const service = {
      list,
      duplicate,
      createFromStarter,
      createBlank,
      listStarters: () => [{
        starterId: 'essential',
        revision: 1,
        label: 'Ficha técnica essencial',
        description: 'Título e tabela básica.',
        category: 'Ficha técnica',
      }],
      getCreateState: () => 'idle',
    } as unknown as CatalogLibraryService;
    const { getByRole, getByText } = render(<CatalogLibrary service={service} onOpen={onOpen} />);

    fireEvent.click(await waitFor(() => getByRole('button', { name: 'Duplicar' })));
    await waitFor(() => expect(duplicate).toHaveBeenCalledWith(source.catalogId));
    await waitFor(() => expect(getByText('Cópia de Catálogo base')).toBeInTheDocument());

    fireEvent.click(getByRole('button', { name: 'Novo catálogo' }));
    expect(getByRole('dialog', { name: 'Novo catálogo' })).toBeInTheDocument();
    expect(getByRole('button', { name: /Em branco/ })).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: /Ficha técnica essencial/ }));
    await waitFor(() => expect(createFromStarter).toHaveBeenCalledWith('essential'));
    expect(onOpen).toHaveBeenCalledWith(copy.catalogId);

    fireEvent.click(getByRole('button', { name: 'Novo catálogo' }));
    fireEvent.click(getByRole('button', { name: /Em branco/ }));
    await waitFor(() => expect(createBlank).toHaveBeenCalledTimes(1));
  });
});

describe('Pending-create navigation amendment (PENDING-NAV-01..06)', () => {
  it('PENDING-NAV-01: ambiguous Duplicate gates row actions and exposes Verificar criação as primary action', async () => {
    let createState: 'idle' | 'pending-verification' = 'idle';
    const rowItem = item('Catálogo Alpha', '101');
    const list = vi.fn().mockResolvedValue({ ok: true, value: [rowItem] });
    const duplicate = vi.fn(async () => {
      createState = 'pending-verification';
      return { ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } } as const;
    });
    const onOpen = vi.fn();
    const service = {
      list,
      duplicate,
      listStarters: () => [],
      getCreateState: () => createState,
    } as unknown as CatalogLibraryService;

    const { getByRole, getAllByRole, queryByRole } = render(
      <CatalogLibrary service={service} onOpen={onOpen} />
    );

    const dupButton = await waitFor(() => getByRole('button', { name: 'Duplicar' }));
    fireEvent.click(dupButton);

    await waitFor(() => {
      expect(getAllByRole('button', { name: 'Verificar criação' }).length).toBeGreaterThanOrEqual(1);
    });

    const openBtn = getByRole('button', { name: 'Abrir' });
    const duplicateBtn = getByRole('button', { name: 'Duplicar' });
    const renameBtn = getByRole('button', { name: 'Renomear' });
    const archiveBtn = getByRole('button', { name: 'Arquivar' });

    expect(openBtn).toBeDisabled();
    expect(duplicateBtn).toBeDisabled();
    expect(renameBtn).toBeDisabled();
    expect(archiveBtn).toBeDisabled();

    fireEvent.click(openBtn);
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(renameBtn);
    expect(queryByRole('dialog', { name: 'Renomear catálogo' })).toBeNull();

    expect(queryByRole('button', { name: 'Novo catálogo' })).toBeNull();
  });

  it('PENDING-NAV-02: pending Starter or Blank behaves identically', async () => {
    let createState: 'idle' | 'pending-verification' = 'idle';
    const rowItem = item('Catálogo Beta', '102');
    const list = vi.fn().mockResolvedValue({ ok: true, value: [rowItem] });
    const createFromStarter = vi.fn(async () => {
      createState = 'pending-verification';
      return { ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } } as const;
    });
    const onOpen = vi.fn();
    const service = {
      list,
      createFromStarter,
      createBlank: vi.fn().mockResolvedValue({ ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } }),
      listStarters: () => [{
        starterId: 'essential',
        revision: 1,
        label: 'Ficha técnica essencial',
        description: 'Descrição',
        category: 'Ficha',
      }],
      getCreateState: () => createState,
    } as unknown as CatalogLibraryService;

    const { getByRole, getAllByRole, queryByRole } = render(
      <CatalogLibrary service={service} onOpen={onOpen} />
    );

    const newBtn = await waitFor(() => getByRole('button', { name: 'Novo catálogo' }));
    fireEvent.click(newBtn);

    const starterBtn = getByRole('button', { name: /Ficha técnica essencial/ });
    fireEvent.click(starterBtn);

    await waitFor(() => {
      expect(getAllByRole('button', { name: 'Verificar criação' }).length).toBeGreaterThanOrEqual(1);
    });

    expect(queryByRole('dialog', { name: 'Novo catálogo' })).toBeNull();
    expect(getByRole('button', { name: 'Abrir' })).toBeDisabled();
    expect(getByRole('button', { name: 'Duplicar' })).toBeDisabled();
    expect(getByRole('button', { name: 'Renomear' })).toBeDisabled();
    expect(getByRole('button', { name: 'Arquivar' })).toBeDisabled();

    const headerVerify = getAllByRole('button', { name: 'Verificar criação' })[0];
    await act(async () => {
      fireEvent.click(headerVerify);
    });
    expect(queryByRole('dialog', { name: 'Novo catálogo' })).toBeNull();
  });

  it('PENDING-NAV-03: clicking Verificar criação reconciles the SAME pending logical attempt without C2/M2 reallocation', async () => {
    const deps: ApplicationExecutionDependencies = {
      createId: (() => {
        let count = 1;
        return () => `00000000-0000-4000-8000-${String(count++).padStart(12, '0')}`;
      })(),
      templateRegistry: createStaticPageTemplateRegistry([]),
    };
    const createdRequests: CreateCatalogRequest[] = [];
    let holdVerification = true;
    const sourceEnvelope = validEnvelope('00000000-0000-4000-8000-000000000201', 'Catálogo Fonte');

    const mockRepo: CatalogRepository = {
      listCatalogs: vi.fn(async (): Promise<PersistenceResult<readonly CatalogListItem[]>> => ({ ok: true, value: [sourceEnvelope] })),
      getCatalog: vi.fn(async (id: string): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
        if (id === sourceEnvelope.catalogId) return { ok: true, value: sourceEnvelope };
        if (holdVerification) return { ok: false, error: { code: 'OFFLINE', message: 'Offline' } };
        return { ok: false, error: { code: 'NOT_FOUND' } };
      }),
      createCatalog: vi.fn(async (req: CreateCatalogRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
        createdRequests.push(req);
        if (createdRequests.length === 1) {
          return { ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME', message: 'Ambiguous' } };
        }
        return {
          ok: true,
          value: {
            catalogId: req.documentSnapshot.id,
            remoteRevision: 1,
            lastMutationId: req.mutationId,
            title: req.documentSnapshot.title,
            locale: req.documentSnapshot.locale,
            createdAt: '2026-09-15T12:00:00.000Z',
            updatedAt: '2026-09-15T12:00:00.000Z',
            createdBy: 'user',
            updatedBy: 'user',
            archivedAt: null,
            documentSchemaVersion: 1,
            documentSnapshot: req.documentSnapshot,
            origin: req.origin,
          },
        };
      }),
      saveCAS: vi.fn(),
      archiveCAS: vi.fn(),
    };

    let mutationSequence = 100;
    const nextUuid = () => testUuid(mutationSequence++);
    const realService = new CatalogLibraryService({
      repository: mockRepo,
      applicationDependencies: deps,
      createId: nextUuid,
      createMutationId: nextUuid,
      createOpenSessionId: nextUuid,
      authLineage: () => 'lineage-1',
      authorityScopeId: () => 'scope-1',
      starterRegistry: createDefaultCatalogStarterRegistry(),
    });

    const { getByRole, getAllByRole } = render(
      <CatalogLibrary service={realService} onOpen={vi.fn()} />
    );

    fireEvent.click(await waitFor(() => getByRole('button', { name: 'Duplicar' })));
    await waitFor(() => expect(realService.getCreateState()).toBe('pending-verification'));
    expect(createdRequests.length).toBe(1);
    const initialRequest = createdRequests[0];

    holdVerification = false;
    const verifyBtn = getAllByRole('button', { name: 'Verificar criação' })[0];
    fireEvent.click(verifyBtn);

    await waitFor(() => expect(realService.getCreateState()).toBe('idle'));
    expect(createdRequests.length).toBe(2);
    const replayRequest = createdRequests[1];

    expect(replayRequest.documentSnapshot.id).toBe(initialRequest.documentSnapshot.id);
    expect(replayRequest.mutationId).toBe(initialRequest.mutationId);
    expect(replayRequest.origin).toEqual(initialRequest.origin);
    expect(replayRequest.documentSnapshot.title).toBe(initialRequest.documentSnapshot.title);
  });

  it('PENDING-NAV-04: once exact pending attempt resolves, row actions become usable again', async () => {
    let createState: 'idle' | 'pending-verification' = 'pending-verification';
    const rowItem = item('Catálogo Gama', '103');
    const list = vi.fn().mockResolvedValue({ ok: true, value: [rowItem] });
    const createBlank = vi.fn(async () => {
      createState = 'idle';
      return {
        ok: true,
        value: {
          ...rowItem,
          origin: { originKind: 'duplicate', originId: rowItem.catalogId, originRevision: 1 },
          documentSnapshot: {} as any,
        },
      } as const;
    });
    const onOpen = vi.fn();
    const service = {
      list,
      createBlank,
      listStarters: () => [],
      getCreateState: () => createState,
    } as unknown as CatalogLibraryService;

    const { getByRole, getAllByRole } = render(
      <CatalogLibrary service={service} onOpen={onOpen} />
    );

    await waitFor(() => expect(getByRole('button', { name: 'Abrir' })).toBeDisabled());
    expect(getByRole('button', { name: 'Duplicar' })).toBeDisabled();

    const verifyBtn = getAllByRole('button', { name: 'Verificar criação' })[0];
    fireEvent.click(verifyBtn);

    await waitFor(() => expect(getByRole('button', { name: 'Abrir' })).toBeEnabled());
    expect(getByRole('button', { name: 'Duplicar' })).toBeEnabled();
    expect(getByRole('button', { name: 'Renomear' })).toBeEnabled();
    expect(getByRole('button', { name: 'Arquivar' })).toBeEnabled();

    fireEvent.click(getByRole('button', { name: 'Abrir' }));
    expect(onOpen).toHaveBeenCalledWith(rowItem.catalogId);
  });

  it('PENDING-NAV-05: auth authority change makes old pending attempt inert without cross-authority replay', async () => {
    let mutationSequence = 500;
    const nextUuid = () => testUuid(mutationSequence++);
    const deps: ApplicationExecutionDependencies = {
      createId: nextUuid,
      templateRegistry: createStaticPageTemplateRegistry([]),
    };
    let currentAuth = 'user-auth-a';
    const createdRequests: CreateCatalogRequest[] = [];
    const sourceEnvelope = validEnvelope('00000000-0000-4000-8000-000000000301', 'Catálogo Auth');

    const mockRepo: CatalogRepository = {
      listCatalogs: vi.fn(async (): Promise<PersistenceResult<readonly CatalogListItem[]>> => ({ ok: true, value: [sourceEnvelope] })),
      getCatalog: vi.fn(async (id: string): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
        if (id === sourceEnvelope.catalogId) return { ok: true, value: sourceEnvelope };
        return { ok: false, error: { code: 'OFFLINE', message: 'Offline' } };
      }),
      createCatalog: vi.fn(async (req: CreateCatalogRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
        createdRequests.push(req);
        if (createdRequests.length === 1) {
          return { ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME', message: 'Ambiguous' } };
        }
        return {
          ok: true,
          value: {
            catalogId: req.documentSnapshot.id,
            remoteRevision: 1,
            lastMutationId: req.mutationId,
            title: req.documentSnapshot.title,
            locale: req.documentSnapshot.locale,
            createdAt: '2026-09-15T12:00:00.000Z',
            updatedAt: '2026-09-15T12:00:00.000Z',
            createdBy: 'user',
            updatedBy: 'user',
            archivedAt: null,
            documentSchemaVersion: 1,
            documentSnapshot: req.documentSnapshot,
            ...(req.origin ? { origin: req.origin } : {}),
          },
        };
      }),
      saveCAS: vi.fn(),
      archiveCAS: vi.fn(),
    };

    const service = new CatalogLibraryService({
      repository: mockRepo,
      applicationDependencies: deps,
      createId: nextUuid,
      createMutationId: nextUuid,
      createOpenSessionId: nextUuid,
      authLineage: () => currentAuth,
      authorityScopeId: () => 'scope-static',
      starterRegistry: createDefaultCatalogStarterRegistry(),
    });

    await service.duplicate(sourceEnvelope.catalogId);
    expect(service.getCreateState()).toBe('pending-verification');
    expect(createdRequests.length).toBe(1);
    const firstMutationId = createdRequests[0].mutationId;

    currentAuth = 'user-auth-b';

    await service.createBlank('Novo catálogo B');
    expect(service.getCreateState()).toBe('idle');
    expect(createdRequests.filter((r) => r.mutationId === firstMutationId).length).toBe(1);
  });

  it('PENDING-NAV-06: pending create installs beforeunload warning; clearing removes it', async () => {
    let createState: 'idle' | 'pending-verification' = 'idle';
    const list = vi.fn().mockResolvedValue({ ok: true, value: [] });
    const service = {
      list,
      listStarters: () => [],
      getCreateState: () => createState,
    } as unknown as CatalogLibraryService;

    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { rerender, unmount } = render(
      <CatalogLibrary service={service} onOpen={vi.fn()} />
    );

    const initialBeforeUnloadListeners = addEventListenerSpy.mock.calls.filter(([event]) => event === 'beforeunload');
    expect(initialBeforeUnloadListeners.length).toBe(0);

    createState = 'pending-verification';
    rerender(<CatalogLibrary service={service} onOpen={vi.fn()} />);

    const pendingBeforeUnloadListeners = addEventListenerSpy.mock.calls.filter(([event]) => event === 'beforeunload');
    expect(pendingBeforeUnloadListeners.length).toBe(1);

    const handler = pendingBeforeUnloadListeners[0][1] as (e: BeforeUnloadEvent) => void;
    const fakeEvent = { preventDefault: vi.fn(), returnValue: '' } as unknown as BeforeUnloadEvent;
    handler(fakeEvent);
    expect(fakeEvent.preventDefault).toHaveBeenCalled();
    expect(fakeEvent.returnValue).toBe('');

    createState = 'idle';
    rerender(<CatalogLibrary service={service} onOpen={vi.fn()} />);

    const removedListeners = removeEventListenerSpy.mock.calls.filter(([event]) => event === 'beforeunload');
    expect(removedListeners.length).toBe(1);

    unmount();
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });
});

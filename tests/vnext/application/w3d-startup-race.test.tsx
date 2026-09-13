import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocumentSession, type ApplicationExecutionDependencies } from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
} from '@/vnext/persistence';
import {
  InMemoryRecoveryRepository,
  digestCanonicalDocument,
  type RecoveryDeleteResult,
  type RecoveryInspection,
  type RecoveryKey,
  type RecoveryRecord,
  type RecoveryRepository,
  type RecoveryWriteResult,
} from '@/vnext/recovery';
import {
  CATALOG_ID,
  MUTATION_0,
  MUTATION_1,
  SESSION_A,
  SESSION_B,
  recoveryDocument,
  recoveryRecord,
} from '../recovery/fixtures';

const AUTHORITY_A = 'deployment:workspace:user-a';
const AUTHORITY_B = 'deployment:workspace:user-b';
const RECOVERED_SESSION = '99999999-9999-4999-8999-999999999999';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

class GatedRecoveryRepository implements RecoveryRepository {
  readonly firstList = deferred<readonly RecoveryInspection[]>();
  private first = true;

  constructor(readonly delegate: InMemoryRecoveryRepository) {}

  putIfNewer(record: RecoveryRecord): Promise<RecoveryWriteResult> {
    return this.delegate.putIfNewer(record);
  }

  get(key: RecoveryKey): Promise<RecoveryInspection | undefined> {
    return this.delegate.get(key);
  }

  listByScope(authorityScopeId: string): Promise<readonly RecoveryInspection[]> {
    if (this.first) {
      this.first = false;
      return this.firstList.promise;
    }
    return this.delegate.listByScope(authorityScopeId);
  }

  deleteIfGeneration(key: RecoveryKey, expectedGeneration: number): Promise<RecoveryDeleteResult> {
    return this.delegate.deleteIfGeneration(key, expectedGeneration);
  }
}

function unavailable<T>(): Promise<PersistenceResult<T>> {
  return Promise.resolve({ ok: false, error: { code: 'REMOTE_FAILURE' } });
}

function envelope(
  documentSnapshot: CatalogDocument,
  remoteRevision = 7,
  lastMutationId = MUTATION_0
): CatalogPersistenceEnvelope {
  return {
    catalogId: documentSnapshot.id,
    remoteRevision,
    lastMutationId,
    title: documentSnapshot.title,
    locale: documentSnapshot.locale,
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    createdBy: null,
    updatedBy: null,
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot,
  };
}

function repositoryBase(
  cloud: CatalogDocument,
  overrides: Partial<CatalogRepository> = {}
): CatalogRepository {
  return {
    listCatalogs: () => unavailable(),
    getCatalog: () => Promise.resolve({ ok: true, value: envelope(cloud) }),
    createCatalog: () => unavailable(),
    saveCAS: () => unavailable(),
    archiveCAS: () => unavailable(),
    ...overrides,
  };
}

function textDocument(title = 'Cloud base'): CatalogDocument {
  return {
    schemaVersion: 1,
    id: CATALOG_ID,
    title,
    locale: 'pt-BR',
    style: {
      fonts: [{ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' }],
      defaultText: {
        fontFamily: 'Noto Sans',
        fontSizePt: 10,
        lineHeight: 1.2,
        fontWeight: 400,
        color: '#172033',
      },
      palette: ['#172033'],
    },
    pages: [{
      id: 'page-1',
      widthMm: 210,
      heightMm: 297,
      objects: [{
        id: 'text-target',
        type: 'text',
        frame: { xMm: 20, yMm: 30, widthMm: 72, heightMm: 20 },
        zIndex: 0,
        text: plainRichText('text-local', 'Canonical A'),
        style: {
          fontFamily: 'Noto Sans',
          fontSizePt: 12,
          lineHeight: 1.2,
          fontWeight: 700,
          color: '#172033',
          textAlign: 'left',
        },
      }],
    }],
    assets: [],
  };
}

function makeRuntime(
  recoveryRepository: RecoveryRepository,
  cloud = recoveryDocument('Cloud base'),
  repository = repositoryBase(cloud)
) {
  const applicationDependencies: ApplicationExecutionDependencies = {
    createId: () => 'generated-id',
  };
  const session = createDocumentSession(cloud, applicationDependencies);
  const openSessionIds = [SESSION_B, RECOVERED_SESSION];
  let openSessionIndex = 0;
  const runtime = new VNextPersistenceRuntime({
    session,
    repository,
    applicationDependencies,
    createMutationId: () => MUTATION_1,
    createOpenSessionId: () => openSessionIds[openSessionIndex++] ?? crypto.randomUUID(),
    authLineage: `${AUTHORITY_A}:0`,
    authorityScopeId: AUTHORITY_A,
    recoveryRepository,
    binding: envelope(cloud),
  });
  return { runtime, session };
}

async function seedRecovery(
  repository: InMemoryRecoveryRepository,
  cloud = recoveryDocument('Cloud base'),
  overrides: Partial<RecoveryRecord> = {}
): Promise<RecoveryRecord> {
  const local = overrides.documentSnapshot ?? { ...cloud, title: 'Recovered local work' };
  const record = await recoveryRecord({
    authorityScopeId: AUTHORITY_A,
    catalogId: cloud.id,
    openSessionId: SESSION_A,
    baseRemoteRevision: 7,
    baseRemoteSnapshotDigest: await digestCanonicalDocument(cloud),
    documentSnapshot: local,
    ...overrides,
  });
  await repository.putIfNewer(record);
  return record;
}

async function waitForEditor(container: HTMLElement): Promise<void> {
  await waitFor(() => expect(
    container.querySelector('[data-editor-action="add-shape"]')
  ).not.toBeNull());
}

function beginTextDraft(container: HTMLElement): HTMLTextAreaElement {
  const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
  if (!page) throw new Error('Missing canonical page');
  page.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 420,
    bottom: 594,
    width: 420,
    height: 594,
    toJSON: () => ({}),
  });
  const hit = container.querySelector<HTMLElement>('[data-editor-object-id="text-target"]');
  const edit = container.querySelector<HTMLButtonElement>('[data-editor-action="edit-text"]');
  if (!hit || !edit) throw new Error('Missing Text authoring controls');
  fireEvent.pointerDown(hit, { pointerId: 80, button: 0, clientX: 80, clientY: 80 });
  fireEvent.pointerUp(hit, { pointerId: 80, button: 0, clientX: 80, clientY: 80 });
  fireEvent.click(edit);
  const textarea = container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]');
  if (!textarea) throw new Error('Missing Text draft textarea');
  return textarea;
}

afterEach(cleanup);

beforeEach(() => {
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  if (typeof globalThis.PointerEvent === 'undefined') {
    globalThis.PointerEvent = MockPointerEvent as typeof PointerEvent;
  }
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

describe('W3.D startup recovery race defense', () => {
  it('STARTUP-RACE-01 gates initial authoring until discovery reports no candidate', async () => {
    const memory = new InMemoryRecoveryRepository();
    const recoveryRepository = new GatedRecoveryRepository(memory);
    const { runtime, session } = makeRuntime(recoveryRepository);
    const view = render(<VNextApp runtime={runtime} />);

    expect(view.getByText('Verificando alterações locais…')).toBeTruthy();
    expect(view.container.querySelector('[data-editor-action="add-shape"]')).toBeNull();
    expect(session.getSnapshot().document.pages[0].objects).toHaveLength(0);

    await act(async () => recoveryRepository.firstList.resolve([]));
    await waitForEditor(view.container);
    fireEvent.click(view.container.querySelector('[data-editor-action="add-shape"]')!);
    expect(session.getSnapshot().document.pages[0].objects).toHaveLength(1);
  });

  it('STARTUP-RACE-02 keeps authoring gated for a candidate and releases only after recovery', async () => {
    const memory = new InMemoryRecoveryRepository();
    await seedRecovery(memory);
    const inspections = await memory.listByScope(AUTHORITY_A);
    const recoveryRepository = new GatedRecoveryRepository(memory);
    const { runtime, session } = makeRuntime(recoveryRepository);
    const originalOpenSessionId = runtime.workspace.getSnapshot().binding.openSessionId;
    const view = render(<VNextApp runtime={runtime} />);

    await act(async () => recoveryRepository.firstList.resolve(inspections));
    await waitFor(() => expect(view.getByRole('dialog', { name: 'Recuperação local' })).toBeTruthy());
    expect(view.container.querySelector('[data-editor-action="add-shape"]')).toBeNull();

    fireEvent.click(view.getByRole('button', { name: 'Recuperar minhas alterações' }));
    await waitForEditor(view.container);
    const recovered = runtime.workspace.getSnapshot();
    expect(recovered.session).not.toBe(session);
    expect(recovered.binding.openSessionId).not.toBe(originalOpenSessionId);
    expect(recovered.session.getSnapshot()).toMatchObject({
      document: { title: 'Recovered local work' },
      canUndo: false,
      canRedo: false,
    });
  });

  it('STARTUP-RACE-03 rejects recovery after a canonical local edit and preserves both sides', async () => {
    const memory = new InMemoryRecoveryRepository();
    const record = await seedRecovery(memory);
    const { runtime, session } = makeRuntime(memory);
    const [candidate] = await runtime.recoveryStartup!.discover(AUTHORITY_A);
    const originalOpenSessionId = runtime.workspace.getSnapshot().binding.openSessionId;

    expect(session.execute({ type: 'document.rename', title: 'Lnew survives' }).ok).toBe(true);
    expect(await runtime.recover(candidate!)).toBe(false);

    expect(runtime.workspace.getSnapshot().session).toBe(session);
    expect(runtime.workspace.getSnapshot().binding.openSessionId).toBe(originalOpenSessionId);
    expect(session.getSnapshot().document.title).toBe('Lnew survives');
    expect((await memory.get({
      authorityScopeId: record.authorityScopeId,
      catalogId: record.catalogId,
      openSessionId: record.openSessionId,
    }))?.status).toBe('VALID');
  });

  it('STARTUP-RACE-04 rejects recovery while a visible Text draft is pending', async () => {
    const memory = new InMemoryRecoveryRepository();
    const cloud = textDocument();
    const { runtime, session } = makeRuntime(memory, cloud);
    const view = render(<VNextApp runtime={runtime} />);
    await waitForEditor(view.container);
    const record = await seedRecovery(memory, cloud);
    const [candidate] = await runtime.recoveryStartup!.discover(AUTHORITY_A);
    const textarea = beginTextDraft(view.container);
    fireEvent.change(textarea, { target: { value: 'Visible current draft' } });

    expect(await runtime.recover(candidate!)).toBe(false);
    expect(runtime.workspace.getSnapshot().session).toBe(session);
    expect(view.container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')?.value)
      .toBe('Visible current draft');
    expect((await memory.get({
      authorityScopeId: record.authorityScopeId,
      catalogId: record.catalogId,
      openSessionId: record.openSessionId,
    }))?.status).toBe('VALID');
  });

  it('STARTUP-RACE-05 rechecks after async acceptance and rejects TOCTOU authoring', async () => {
    const memory = new InMemoryRecoveryRepository();
    const record = await seedRecovery(memory);
    const { runtime, session } = makeRuntime(memory);
    const [candidate] = await runtime.recoveryStartup!.discover(AUTHORITY_A);
    const originalOpenSessionId = runtime.workspace.getSnapshot().binding.openSessionId;

    const recovering = runtime.recover(candidate!);
    expect(session.execute({ type: 'document.rename', title: 'Advanced during accept' }).ok).toBe(true);

    expect(await recovering).toBe(false);
    expect(runtime.workspace.getSnapshot().session).toBe(session);
    expect(runtime.workspace.getSnapshot().binding.openSessionId).toBe(originalOpenSessionId);
    expect(session.getSnapshot().document.title).toBe('Advanced during accept');
    expect((await memory.get({
      authorityScopeId: record.authorityScopeId,
      catalogId: record.catalogId,
      openSessionId: record.openSessionId,
    }))?.status).toBe('VALID');
  });

  it('STARTUP-RACE-06 rejects an install when authority changes during acceptance', async () => {
    const memory = new InMemoryRecoveryRepository();
    const record = await seedRecovery(memory);
    const { runtime, session } = makeRuntime(memory);
    const [candidate] = await runtime.recoveryStartup!.discover(AUTHORITY_A);

    const recovering = runtime.recover(candidate!);
    runtime.updateAuthContext(`${AUTHORITY_B}:1`, AUTHORITY_B);

    expect(await recovering).toBe(false);
    expect(runtime.workspace.getSnapshot().session).toBe(session);
    expect(runtime.workspace.getSnapshot().activeAuthorityScopeId).toBe(AUTHORITY_B);
    expect((await memory.get({
      authorityScopeId: record.authorityScopeId,
      catalogId: record.catalogId,
      openSessionId: record.openSessionId,
    }))?.status).toBe('VALID');
  });

  it('STARTUP-RACE-07 rejects a candidate after the active remote binding advances', async () => {
    const memory = new InMemoryRecoveryRepository();
    const record = await seedRecovery(memory);
    const cloud = recoveryDocument('Cloud base');
    const { runtime, session } = makeRuntime(memory, cloud);
    const [candidate] = await runtime.recoveryStartup!.discover(AUTHORITY_A);
    const before = runtime.workspace.getSnapshot();

    expect(runtime.workspace.acknowledge(
      before.binding.openSessionId,
      before.binding.authLineage,
      envelope(cloud, 8, MUTATION_1),
      session.getSnapshot().localSequence
    )).toBe(true);
    expect(runtime.workspace.getSnapshot().dirty).toBe(false);

    expect(await runtime.recover(candidate!)).toBe(false);
    expect(runtime.workspace.getSnapshot().session).toBe(session);
    expect(runtime.workspace.getSnapshot().binding).toMatchObject({
      remoteRevision: 8,
      lastMutationId: MUTATION_1,
    });
    expect((await memory.get({
      authorityScopeId: record.authorityScopeId,
      catalogId: record.catalogId,
      openSessionId: record.openSessionId,
    }))?.status).toBe('VALID');
  });

  it('STARTUP-RACE-08 applies ordinary dirty protection to Open Cloud', async () => {
    const memory = new InMemoryRecoveryRepository();
    const record = await seedRecovery(memory);
    const inspections = await memory.listByScope(AUTHORITY_A);
    const recoveryRepository = new GatedRecoveryRepository(memory);
    const cloud = recoveryDocument('Cloud base');
    const getCatalog = vi.fn(() => Promise.resolve({ ok: true as const, value: envelope(cloud) }));
    const { runtime, session } = makeRuntime(
      recoveryRepository,
      cloud,
      repositoryBase(cloud, { getCatalog })
    );
    const view = render(<VNextApp runtime={runtime} />);
    await act(async () => recoveryRepository.firstList.resolve(inspections));
    await waitFor(() => expect(view.getByRole('dialog', { name: 'Recuperação local' })).toBeTruthy());

    act(() => {
      expect(session.execute({ type: 'document.rename', title: 'Current work must survive' }).ok).toBe(true);
    });
    fireEvent.click(view.getByRole('button', { name: 'Abrir versão salva na nuvem' }));

    await waitFor(() => expect(view.getByText(
      'Salve ou descarte as alterações atuais antes de abrir a versão da nuvem.'
    )).toBeTruthy());
    expect(getCatalog).toHaveBeenCalledTimes(1);
    expect(runtime.workspace.getSnapshot().session).toBe(session);
    expect(session.getSnapshot().document.title).toBe('Current work must survive');
    expect((await memory.get({
      authorityScopeId: record.authorityScopeId,
      catalogId: record.catalogId,
      openSessionId: record.openSessionId,
    }))?.status).toBe('VALID');
  });

  it('STARTUP-RACE-09 safely installs a fresh recovered session and typed overlay', async () => {
    const memory = new InMemoryRecoveryRepository();
    const cloud = textDocument();
    const text = cloud.pages[0].objects[0];
    if (text.type !== 'text') throw new Error('Expected Text object');
    const record = await seedRecovery(memory, cloud, {
      documentSnapshot: cloud,
      authoringRecoveryOverlay: {
        kind: 'TEXT_DRAFT_V1',
        pageId: cloud.pages[0].id,
        objectId: text.id,
        expectedText: text.text,
        draft: 'Recovered draft',
        compositionWasActive: true,
      },
    });
    const { runtime, session } = makeRuntime(memory, cloud);
    const originalOpenSessionId = runtime.workspace.getSnapshot().binding.openSessionId;
    const [candidate] = await runtime.recoveryStartup!.discover(AUTHORITY_A);

    expect(await runtime.recover(candidate!)).toBe(true);
    const recovered = runtime.workspace.getSnapshot();
    expect(recovered.session).not.toBe(session);
    expect(recovered.binding.openSessionId).not.toBe(originalOpenSessionId);
    expect(recovered.session.getSnapshot()).toMatchObject({ canUndo: false, canRedo: false });
    expect(await memory.get({
      authorityScopeId: record.authorityScopeId,
      catalogId: record.catalogId,
      openSessionId: record.openSessionId,
    })).toBeUndefined();
    expect((await memory.get({
      authorityScopeId: AUTHORITY_A,
      catalogId: CATALOG_ID,
      openSessionId: recovered.binding.openSessionId,
    }))?.status).toBe('VALID');

    const view = render(<VNextApp runtime={runtime} />);
    await waitFor(() => expect(
      view.container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')?.value
    ).toBe('Recovered draft'));
    expect(view.container.querySelector('[data-editor-action="add-shape"]')).not.toBeNull();
  });

  it('STARTUP-RACE-10 ignores a late discovery result after authority changes', async () => {
    const memory = new InMemoryRecoveryRepository();
    const record = await seedRecovery(memory);
    const pendingA = deferred<readonly RecoveryInspection[]>();
    const deleteIfGeneration = vi.fn((key: RecoveryKey, generation: number) => (
      memory.deleteIfGeneration(key, generation)
    ));
    const recoveryRepository: RecoveryRepository = {
      putIfNewer: (next) => memory.putIfNewer(next),
      get: (key) => memory.get(key),
      listByScope: (scope) => scope === AUTHORITY_A ? pendingA.promise : memory.listByScope(scope),
      deleteIfGeneration,
    };
    const { runtime } = makeRuntime(recoveryRepository);
    const view = render(<VNextApp runtime={runtime} />);
    expect(view.getByText('Verificando alterações locais…')).toBeTruthy();

    act(() => runtime.updateAuthContext(`${AUTHORITY_B}:1`, AUTHORITY_B));
    await waitForEditor(view.container);
    const inspections = await memory.listByScope(AUTHORITY_A);
    await act(async () => pendingA.resolve(inspections));

    expect(view.queryByRole('dialog', { name: 'Recuperação local' })).toBeNull();
    expect(runtime.workspace.getSnapshot().activeAuthorityScopeId).toBe(AUTHORITY_B);
    expect(deleteIfGeneration).not.toHaveBeenCalled();
    expect((await memory.get({
      authorityScopeId: record.authorityScopeId,
      catalogId: record.catalogId,
      openSessionId: record.openSessionId,
    }))?.status).toBe('VALID');
  });

  it('surfaces discovery failure and permits an explicit safe continuation', async () => {
    const memory = new InMemoryRecoveryRepository();
    const failed = new GatedRecoveryRepository(memory);
    const { runtime } = makeRuntime(failed);
    const view = render(<VNextApp runtime={runtime} />);

    await act(async () => failed.firstList.reject(new Error('IndexedDB detail must stay hidden')));
    await waitFor(() => expect(view.getByText('Não foi possível verificar alterações locais.')).toBeTruthy());
    expect(view.container.querySelector('[data-editor-action="add-shape"]')).toBeNull();
    expect(view.container.textContent).not.toContain('IndexedDB');

    fireEvent.click(view.getByRole('button', { name: 'Continuar sem recuperação local' }));
    await waitForEditor(view.container);
    expect(runtime.workspace.getSnapshot().localProtection).toBe('unavailable');
  });
});

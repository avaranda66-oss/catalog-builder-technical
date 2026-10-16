import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDocumentSession,
  createStaticPageTemplateRegistry,
  type ApplicationExecutionDependencies,
} from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import {
  overlayDetail,
  recoveryCandidateSummary,
} from '@/vnext/app/recovery-presentation';
import type { CatalogDocument } from '@/vnext/domain';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
} from '@/vnext/persistence';
import {
  InMemoryRecoveryRepository,
  digestCanonicalDocument,
  recoveryKeyOf,
  type AuthoringRecoveryOverlay,
  type RecoveryRecord,
  type RecoveryStartupCandidate,
} from '@/vnext/recovery';
import {
  CATALOG_ID,
  MUTATION_0,
  MUTATION_1,
  recoveryDocument,
  recoveryRecord,
} from '../recovery/fixtures';

afterEach(cleanup);

const SCOPE = 'deployment:workspace:user-a';
const CATALOG_B = '66666666-6666-4666-8666-666666666666';

function documentOf(catalogId: string, title: string): CatalogDocument {
  return { ...recoveryDocument(title), id: catalogId };
}

function envelope(documentSnapshot: CatalogDocument): CatalogPersistenceEnvelope {
  return {
    catalogId: documentSnapshot.id,
    remoteRevision: 7,
    lastMutationId: MUTATION_0,
    title: documentSnapshot.title,
    locale: documentSnapshot.locale,
    createdAt: '2026-10-15T12:00:00.000Z',
    updatedAt: '2026-10-15T12:00:00.000Z',
    createdBy: null,
    updatedBy: null,
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot,
  };
}

function unavailable<T>(): Promise<PersistenceResult<T>> {
  return Promise.resolve({ ok: false, error: { code: 'REMOTE_FAILURE' } });
}

function openRuntime(opened: CatalogDocument, recoveryRepository: InMemoryRecoveryRepository) {
  const cloud = new Map([[CATALOG_ID, envelope(documentOf(CATALOG_ID, 'Cloud base'))], [opened.id, envelope(opened)]]);
  const getCatalog = vi.fn(async (catalogId: string) => {
    const value = cloud.get(catalogId);
    return value ? { ok: true as const, value } : { ok: false as const, error: { code: 'NOT_FOUND' as const } };
  });
  const repository: CatalogRepository = {
    listCatalogs: () => unavailable(),
    getCatalog,
    createCatalog: () => unavailable(),
    saveCAS: () => unavailable(),
    archiveCAS: () => unavailable(),
  };
  let generated = 0;
  const createId = () => `00000000-0000-4000-8000-${String(++generated).padStart(12, '0')}`;
  const dependencies: ApplicationExecutionDependencies = { createId, templateRegistry: createStaticPageTemplateRegistry([]) };
  const runtime = new VNextPersistenceRuntime({
    session: createDocumentSession(opened, dependencies),
    repository,
    applicationDependencies: dependencies,
    createMutationId: createId,
    createOpenSessionId: createId,
    authLineage: `${SCOPE}:0`,
    authorityScopeId: SCOPE,
    recoveryRepository,
    binding: envelope(opened),
  });
  return { runtime, getCatalog };
}

async function pendingRecordFor(catalogId: string, title: string): Promise<RecoveryRecord> {
  const attemptedDocumentSnapshot = documentOf(catalogId, `${title} (tentativa)`);
  return recoveryRecord({
    authorityScopeId: SCOPE,
    catalogId,
    documentSnapshot: documentOf(catalogId, title),
    baseRemoteSnapshotDigest: await digestCanonicalDocument(documentOf(catalogId, 'Cloud base')),
    pendingRemoteMutation: {
      mutationId: MUTATION_1,
      catalogId,
      expectedRemoteRevision: 7,
      previousLastMutationId: MUTATION_0,
      capturedLocalEditSequence: 2,
      attemptedDocumentSnapshot,
      attemptDigestAlgorithm: 'SHA-256',
      attemptDigest: await digestCanonicalDocument(attemptedDocumentSnapshot),
    },
  });
}

const forbiddenFatherText = /Inspector|Recovery|JSON|IndexedDB|richText|technicalCode|activeType|[{}]|[0-9a-f]{8}-[0-9a-f]{4}-/;

describe('FR-42 local backup screen only for the open catalog, in plain language', () => {
  it('opens catalog B straight away when the only backup on this computer belongs to catalog A', async () => {
    const recoveryRepository = new InMemoryRecoveryRepository();
    const leftover = await pendingRecordFor(CATALOG_ID, 'Sobra do catálogo A');
    await recoveryRepository.putIfNewer(leftover);
    const { runtime, getCatalog } = openRuntime(documentOf(CATALOG_B, 'Catálogo B'), recoveryRepository);

    const view = render(<VNextApp runtime={runtime} />);

    await waitFor(() => expect(view.container.querySelector('[data-vnext-shell]')).not.toBeNull());
    expect(view.queryByRole('dialog', { name: 'Recuperação local' })).toBeNull();
    // Saving is not paused by another catalog's unconfirmed save.
    expect(runtime.workspace.getSnapshot().save.phase).toBe('idle');
    expect(getCatalog).not.toHaveBeenCalledWith(CATALOG_ID);
    // The backup of catalog A is kept for when A is opened.
    expect((await recoveryRepository.get(recoveryKeyOf(leftover)))?.status).toBe('VALID');
  });

  it('pauses saving only for the open catalog unconfirmed save and resumes after it is discarded', async () => {
    const recoveryRepository = new InMemoryRecoveryRepository();
    const record = await pendingRecordFor(CATALOG_ID, 'Catálogo A com salvamento pendente');
    await recoveryRepository.putIfNewer(record);
    const { runtime } = openRuntime(documentOf(CATALOG_ID, 'Cloud base'), recoveryRepository);

    const view = render(<VNextApp runtime={runtime} />);

    const dialog = await view.findByRole('dialog', { name: 'Recuperação local' });
    expect(within(dialog).getByText('Cópia de segurança neste computador')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Catálogo A com salvamento pendente' })).toBeInTheDocument();
    expect(within(dialog).getByText(/não chegou a ser confirmado/)).toBeInTheDocument();
    expect(runtime.workspace.getSnapshot().save.phase).toBe('ambiguous');
    expect(view.container.querySelector('[data-vnext-shell]')).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Descartar recuperação local' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar descarte local' }));

    await waitFor(() => expect(view.container.querySelector('[data-vnext-shell]')).not.toBeNull());
    expect(view.queryByRole('dialog', { name: 'Recuperação local' })).toBeNull();
    expect(runtime.workspace.getSnapshot().save.phase).toBe('idle');
    expect(await recoveryRepository.get(recoveryKeyOf(record))).toBeUndefined();
  });

  it('shows unfinished edits as readable text, never as raw stored data', async () => {
    const recoveryRepository = new InMemoryRecoveryRepository();
    const record = await recoveryRecord({
      authorityScopeId: SCOPE,
      documentSnapshot: documentOf(CATALOG_ID, 'Catálogo com medida'),
      baseRemoteSnapshotDigest: await digestCanonicalDocument(documentOf(CATALOG_ID, 'Cloud base')),
      updatedAt: '2026-10-15T12:30:00.000Z',
      authoringRecoveryOverlay: {
        kind: 'TABLE_CELL_DRAFT_V1',
        pageId: 'page-1', objectId: 'table-object', tableId: 'table', cellId: 'cell-1',
        expectedContent: { type: 'empty' },
        activeType: 'measurement',
        draft: { richText: '', technicalCode: '', measurement: { valueText: '0,1', unit: '°C', qualifier: 'approx' } },
        compositionWasActive: false,
      },
    });
    await recoveryRepository.putIfNewer(record);
    const { runtime } = openRuntime(documentOf(CATALOG_ID, 'Cloud base'), recoveryRepository);

    const view = render(<VNextApp runtime={runtime} />);
    const dialog = await view.findByRole('dialog', { name: 'Recuperação local' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ver alterações recuperadas' }));

    const summary = dialog.querySelector('[data-recovery-summary]')?.textContent ?? '';
    expect(summary).toMatch(/^Guardada em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2} · 1 página · inclui: célula de tabela que estava sendo editada$/);
    const cellDraft = dialog.querySelector('[data-recovery-table-cell-draft]');
    expect(cellDraft?.textContent).toBe('Célula de tabela que estava sendo editadaMedida: aprox. 0,1 °C');
    expect(within(dialog).getByText('Somente para ver')).toBeInTheDocument();
    const visibleText = [...dialog.querySelectorAll('h2, h3, p, strong, span, button, label')]
      .filter((element) => !element.closest('[data-editorial-root]'))
      .map((element) => element.textContent ?? '')
      .join('\n');
    expect(visibleText).not.toMatch(forbiddenFatherText);
  });

  it('describes position drafts and damaged backups without technical terms', () => {
    const frame: AuthoringRecoveryOverlay = {
      kind: 'INSPECTOR_FRAME_DRAFT_V1', pageId: 'p', objectId: 'o',
      expectedFrame: { xMm: 1, yMm: 2, widthMm: 3, heightMm: 4 },
      draft: { x: '20', y: '30', width: '72', height: '20,5' },
    };
    expect(overlayDetail(frame)).toBe('Horizontal 20 mm, vertical 30 mm, largura 72 mm, altura 20,5 mm.');
    const damaged = {
      id: 'x',
      inspection: { status: 'INVALID', key: { authorityScopeId: SCOPE, catalogId: CATALOG_ID, openSessionId: CATALOG_ID }, rawRecord: {}, error: { code: 'INVALID_RECORD', message: 'zod: Expected object' } },
      decision: { kind: 'INVALID_OR_UNSUPPORTED_RECORD' },
    } as unknown as RecoveryStartupCandidate;
    expect(recoveryCandidateSummary(damaged)).toBeUndefined();
  });
});

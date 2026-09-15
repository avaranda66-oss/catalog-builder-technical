import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CatalogCloneService,
  createDocumentSession,
  createStaticPageTemplateRegistry,
  type ApplicationExecutionDependencies,
} from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
} from '@/vnext/persistence';
import {
  InMemoryRecoveryRepository,
  recoveryKeyOf,
} from '@/vnext/recovery';
import {
  CATALOG_ID,
  MUTATION_0,
  recoveryDocument,
  recoveryRecord,
} from '../recovery/fixtures';

afterEach(cleanup);

function unavailable<T>(): Promise<PersistenceResult<T>> {
  return Promise.resolve({ ok: false, error: { code: 'REMOTE_FAILURE' } });
}

function envelope(): CatalogPersistenceEnvelope {
  const documentSnapshot = recoveryDocument('Cloud base');
  return {
    catalogId: CATALOG_ID,
    remoteRevision: 7,
    lastMutationId: MUTATION_0,
    title: documentSnapshot.title,
    locale: documentSnapshot.locale,
    createdAt: '2026-09-14T12:00:00.000Z',
    updatedAt: '2026-09-14T12:00:00.000Z',
    createdBy: null,
    updatedBy: null,
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot,
  };
}

function repository(remote: CatalogPersistenceEnvelope): CatalogRepository {
  return {
    listCatalogs: () => unavailable(),
    getCatalog: (catalogId) => Promise.resolve(
      catalogId === remote.catalogId
        ? { ok: true as const, value: remote }
        : { ok: false as const, error: { code: 'NOT_FOUND' as const } }
    ),
    createCatalog: () => unavailable(),
    saveCAS: () => unavailable(),
    archiveCAS: () => unavailable(),
  };
}

describe('W3.E Library Open preserves the W3.D startup gate', () => {
  it('LIB-19 keeps the editor structurally absent until the recovery decision is resolved', async () => {
    const remote = envelope();
    const recoveryRepository = new InMemoryRecoveryRepository();
    const record = await recoveryRecord({
      authorityScopeId: 'deployment:workspace:user-a',
      documentSnapshot: recoveryDocument('Protected local work'),
    });
    await recoveryRepository.putIfNewer(record);

    let generated = 0;
    const createId = () => `00000000-0000-4000-8000-${String(++generated).padStart(12, '0')}`;
    const dependencies: ApplicationExecutionDependencies = {
      createId,
      templateRegistry: createStaticPageTemplateRegistry([]),
    };
    const session = createDocumentSession(remote.documentSnapshot, dependencies);
    const runtime = new VNextPersistenceRuntime({
      session,
      repository: repository(remote),
      applicationDependencies: dependencies,
      createMutationId: createId,
      createOpenSessionId: createId,
      authLineage: 'user-a:0',
      authorityScopeId: 'deployment:workspace:user-a',
      recoveryRepository,
      binding: remote,
    });

    const { container, getByRole } = render(<VNextApp runtime={runtime} />);

    await waitFor(() => expect(getByRole('dialog', { name: 'Recuperação local' })).toBeInTheDocument());
    expect(container.querySelector('[data-vnext-shell]')).toBeNull();
    expect(container.querySelector('[data-editor-action="save"]')).toBeNull();

    fireEvent.click(getByRole('button', { name: 'Abrir versão salva na nuvem' }));
    await waitFor(() => expect(container.querySelector('[data-vnext-shell]')).not.toBeNull());
    expect(container.querySelector('[data-editor-action="save"]')).not.toBeNull();

    const preserved = await recoveryRepository.get(recoveryKeyOf(record));
    expect(preserved?.status).toBe('VALID');
  });

  it('W3.F does not copy source Recovery state and still presents the ordinary W3.D scope gate', async () => {
    const source = recoveryDocument('Cloud base');
    const recoveryRepository = new InMemoryRecoveryRepository();
    const sourceRecord = await recoveryRecord({
      authorityScopeId: 'deployment:workspace:user-a',
      documentSnapshot: recoveryDocument('Protected source work'),
    });
    await recoveryRepository.putIfNewer(sourceRecord);

    let generated = 100;
    const createId = () => `00000000-0000-4000-8000-${String(++generated).padStart(12, '0')}`;
    const clone = new CatalogCloneService(createId).clone(source, { title: 'Cópia de Cloud base' });
    const clonedEnvelope: CatalogPersistenceEnvelope = {
      catalogId: clone.id,
      remoteRevision: 1,
      lastMutationId: createId(),
      title: clone.title,
      locale: clone.locale,
      createdAt: '2026-09-14T13:00:00.000Z',
      updatedAt: '2026-09-14T13:00:00.000Z',
      createdBy: null,
      updatedBy: null,
      archivedAt: null,
      documentSchemaVersion: clone.schemaVersion,
      documentSnapshot: clone,
    };
    const dependencies: ApplicationExecutionDependencies = {
      createId,
      templateRegistry: createStaticPageTemplateRegistry([]),
    };
    const session = createDocumentSession(clone, dependencies);
    const runtime = new VNextPersistenceRuntime({
      session,
      repository: repository(clonedEnvelope),
      applicationDependencies: dependencies,
      createMutationId: createId,
      createOpenSessionId: createId,
      authLineage: 'user-a:0',
      authorityScopeId: 'deployment:workspace:user-a',
      recoveryRepository,
      binding: clonedEnvelope,
    });

    const { container, getByRole } = render(<VNextApp runtime={runtime} />);

    await waitFor(() => expect(getByRole('dialog', { name: 'Recuperação local' })).toBeInTheDocument());
    expect(container.querySelector('[data-vnext-shell]')).toBeNull();
    expect(getByRole('heading', { name: 'Protected source work' })).toBeInTheDocument();
    const inspections = await recoveryRepository.listByScope('deployment:workspace:user-a');
    expect(inspections).toHaveLength(1);
    expect(inspections[0]?.key.catalogId).toBe(CATALOG_ID);
    expect(inspections[0]?.key.catalogId).not.toBe(clone.id);
    expect(await recoveryRepository.get(recoveryKeyOf(sourceRecord))).toMatchObject({ status: 'VALID' });
  });
});

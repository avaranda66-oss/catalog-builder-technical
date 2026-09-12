import { describe, expect, it, vi } from 'vitest';
import type { CatalogDocument } from '@/vnext/domain';
import {
  SupabaseCatalogRepository,
  type VNextPersistenceRpcClient,
  type VNextPersistenceRpcResponse,
} from '@/vnext/persistence';

const CATALOG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CATALOG_ID = '22222222-2222-4222-8222-222222222222';
const MUTATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function documentFixture(id = CATALOG_ID): CatalogDocument {
  return {
    schemaVersion: 1,
    id,
    title: 'Catálogo W3.B',
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
    pages: [{ id: 'page-1', widthMm: 210, heightMm: 297, objects: [] }],
    assets: [],
  };
}

function envelope(document = documentFixture(), revision = 1, mutationId = MUTATION_ID) {
  return {
    catalogId: document.id,
    remoteRevision: revision,
    lastMutationId: mutationId,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-12T17:00:00.000Z',
    updatedAt: '2026-09-12T17:00:00.000Z',
    createdBy: '99999999-9999-4999-8999-999999999999',
    updatedBy: '99999999-9999-4999-8999-999999999999',
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot: document,
  };
}

function clientReturning(response: VNextPersistenceRpcResponse): VNextPersistenceRpcClient & { rpc: ReturnType<typeof vi.fn> } {
  return { rpc: vi.fn().mockResolvedValue(response) };
}

describe('SupabaseCatalogRepository', () => {
  it('preflights create and sends only the VNext RPC payload with exact lowercase identities', async () => {
    const client = clientReturning({ data: envelope(), error: null });
    const repository = new SupabaseCatalogRepository(client, { isOffline: () => false });

    const result = await repository.createCatalog({
      mutationId: MUTATION_ID,
      documentSnapshot: documentFixture(),
      origin: { originKind: 'blank' },
    });

    expect(result.ok).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('create_vnext_catalog_v1', {
      p_mutation_id: MUTATION_ID,
      p_document_snapshot: documentFixture(),
      p_origin: { originKind: 'blank' },
    });
  });

  it('rejects uppercase mutation UUID before database dispatch', async () => {
    const client = clientReturning({ data: envelope(), error: null });
    const repository = new SupabaseCatalogRepository(client, { isOffline: () => false });

    const result = await repository.createCatalog({
      mutationId: MUTATION_ID.toUpperCase(),
      documentSnapshot: documentFixture(),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_DOCUMENT' } });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('rejects persistence-incompatible root without normalizing or dispatching', async () => {
    const client = clientReturning({ data: envelope(), error: null });
    const repository = new SupabaseCatalogRepository(client, { isOffline: () => false });

    const result = await repository.createCatalog({
      mutationId: MUTATION_ID,
      documentSnapshot: documentFixture('catalog-authored-root'),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_DOCUMENT' } });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('rejects save root mismatch before dispatch', async () => {
    const client = clientReturning({ data: envelope(), error: null });
    const repository = new SupabaseCatalogRepository(client, { isOffline: () => false });

    const result = await repository.saveCAS({
      mutationId: MUTATION_ID,
      catalogId: CATALOG_ID,
      expectedRemoteRevision: 1,
      documentSnapshot: documentFixture(OTHER_CATALOG_ID),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'ENVELOPE_MISMATCH' } });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('maps semantic SQL outcomes without leaking transport-specific codes upward', async () => {
    const cases = [
      [{ code: 'P0002', message: 'VNEXT_NOT_FOUND: missing' }, 'NOT_FOUND'],
      [{ code: 'P0001', message: 'VNEXT_ARCHIVED: archived' }, 'ARCHIVED'],
      [{ code: '40001', message: 'VNEXT_CONFLICT: stale' }, 'CONFLICT'],
      [{ code: '23505', message: 'duplicate key value violates unique constraint' }, 'CONFLICT'],
      [{ code: '42501', message: 'AUTH_ROLE_FORBIDDEN' }, 'UNAUTHORIZED'],
      [{ code: '22023', message: 'VNEXT_UNSUPPORTED_VERSION: 2' }, 'UNSUPPORTED_VERSION'],
      [{ code: '22023', message: 'VNEXT_INVALID_DOCUMENT: bad pages' }, 'INVALID_DOCUMENT'],
    ] as const;

    for (const [error, expected] of cases) {
      const client = clientReturning({ data: null, error });
      const result = await new SupabaseCatalogRepository(client, { isOffline: () => false }).getCatalog(CATALOG_ID);
      expect(result).toMatchObject({ ok: false, error: { code: expected } });
    }
  });

  it('treats a mutation timeout after dispatch as ambiguous and does not retry', async () => {
    const client: VNextPersistenceRpcClient & { rpc: ReturnType<typeof vi.fn> } = {
      rpc: vi.fn().mockRejectedValue(new Error('request timed out after dispatch')),
    };
    const repository = new SupabaseCatalogRepository(client, { isOffline: () => false });

    const result = await repository.saveCAS({
      mutationId: MUTATION_ID,
      catalogId: CATALOG_ID,
      expectedRemoteRevision: 1,
      documentSnapshot: documentFixture(),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } });
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('keeps a rejected mutation ambiguous when connectivity changes after dispatch', async () => {
    const isOffline = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const client: VNextPersistenceRpcClient & { rpc: ReturnType<typeof vi.fn> } = {
      rpc: vi.fn().mockRejectedValue(new Error('request failed')),
    };
    const repository = new SupabaseCatalogRepository(client, { isOffline });

    const result = await repository.saveCAS({
      mutationId: MUTATION_ID,
      catalogId: CATALOG_ID,
      expectedRemoteRevision: 1,
      documentSnapshot: documentFixture(),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } });
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(isOffline).toHaveBeenCalledTimes(1);
  });

  it('uses a code-only ETIMEDOUT signal for post-dispatch mutation ambiguity', async () => {
    const client = clientReturning({
      data: null,
      error: { code: 'ETIMEDOUT', message: 'request failed' },
    });
    const repository = new SupabaseCatalogRepository(client, { isOffline: () => false });

    const result = await repository.saveCAS({
      mutationId: MUTATION_ID,
      catalogId: CATALOG_ID,
      expectedRemoteRevision: 1,
      documentSnapshot: documentFixture(),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } });
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('maps code-only ETIMEDOUT after a read dispatch to REMOTE_FAILURE', async () => {
    const client = clientReturning({
      data: null,
      error: { code: 'ETIMEDOUT', message: 'request failed' },
    });
    const repository = new SupabaseCatalogRepository(client, { isOffline: () => false });

    const result = await repository.getCatalog(CATALOG_ID);

    expect(result).toMatchObject({ ok: false, error: { code: 'REMOTE_FAILURE' } });
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('keeps concrete PostgreSQL/domain rejection semantic even when its text looks transport-like', async () => {
    const client = clientReturning({
      data: null,
      error: { code: '40001', message: 'VNEXT_CONFLICT: network race lost' },
    });
    const repository = new SupabaseCatalogRepository(client, { isOffline: () => false });

    const result = await repository.saveCAS({
      mutationId: MUTATION_ID,
      catalogId: CATALOG_ID,
      expectedRemoteRevision: 1,
      documentSnapshot: documentFixture(),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('maps non-transport server failures to REMOTE_FAILURE', async () => {
    const client = clientReturning({
      data: null,
      error: { code: 'XX000', message: 'unexpected server failure' },
    });
    const repository = new SupabaseCatalogRepository(client, { isOffline: () => false });

    const result = await repository.getCatalog(CATALOG_ID);

    expect(result).toMatchObject({ ok: false, error: { code: 'REMOTE_FAILURE' } });
  });

  it('classifies known pre-dispatch offline state without calling RPC', async () => {
    const client = clientReturning({ data: envelope(), error: null });
    const repository = new SupabaseCatalogRepository(client, { isOffline: () => true });

    const result = await repository.getCatalog(CATALOG_ID);

    expect(result).toMatchObject({ ok: false, error: { code: 'OFFLINE' } });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('classifies a known pre-dispatch offline mutation without calling RPC', async () => {
    const client = clientReturning({ data: envelope(), error: null });
    const repository = new SupabaseCatalogRepository(client, { isOffline: () => true });

    const result = await repository.saveCAS({
      mutationId: MUTATION_ID,
      catalogId: CATALOG_ID,
      expectedRemoteRevision: 1,
      documentSnapshot: documentFixture(),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'OFFLINE' } });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('parses authoritative save response through W3.A envelope validation', async () => {
    const changed = { ...documentFixture(), title: 'Título salvo' };
    const client = clientReturning({ data: envelope(changed, 2), error: null });
    const repository = new SupabaseCatalogRepository(client, { isOffline: () => false });

    const result = await repository.saveCAS({
      mutationId: MUTATION_ID,
      catalogId: CATALOG_ID,
      expectedRemoteRevision: 1,
      documentSnapshot: changed,
    });

    expect(result).toMatchObject({ ok: true, value: { remoteRevision: 2, title: 'Título salvo' } });
  });

  it('rejects a malformed authoritative envelope instead of repairing it', async () => {
    const malformed = { ...envelope(), title: 'Projection drift' };
    const client = clientReturning({ data: malformed, error: null });
    const repository = new SupabaseCatalogRepository(client, { isOffline: () => false });

    const result = await repository.getCatalog(CATALOG_ID);

    expect(result).toMatchObject({ ok: false, error: { code: 'ENVELOPE_MISMATCH' } });
  });

  it('maps archive CAS arguments and parses exact authoritative metadata', async () => {
    const archived = {
      ...envelope(documentFixture(), 2),
      archivedAt: '2026-09-12T18:00:00.000Z',
    };
    const { documentSnapshot: _snapshot, ...metadata } = archived;
    const client = clientReturning({ data: metadata, error: null });
    const repository = new SupabaseCatalogRepository(client, { isOffline: () => false });

    const result = await repository.archiveCAS({
      mutationId: MUTATION_ID,
      catalogId: CATALOG_ID,
      expectedRemoteRevision: 1,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        catalogId: CATALOG_ID,
        remoteRevision: 2,
        lastMutationId: MUTATION_ID,
        archivedAt: '2026-09-12T18:00:00.000Z',
      },
    });
    expect(client.rpc).toHaveBeenCalledWith('archive_vnext_catalog_cas_v1', {
      p_catalog_id: CATALOG_ID,
      p_expected_remote_revision: 1,
      p_mutation_id: MUTATION_ID,
    });
  });

  it('keeps list payload lightweight and accepts no snapshot/lastMutationId authority', async () => {
    const { documentSnapshot: _snapshot, lastMutationId: _mutation, ...item } = envelope();
    const client = clientReturning({ data: [item], error: null });
    const repository = new SupabaseCatalogRepository(client, { isOffline: () => false });

    const result = await repository.listCatalogs();

    expect(result).toMatchObject({ ok: true, value: [{ catalogId: CATALOG_ID, remoteRevision: 1 }] });
    expect(client.rpc).toHaveBeenCalledWith('list_vnext_catalogs_v1', { p_include_archived: false });
  });
});

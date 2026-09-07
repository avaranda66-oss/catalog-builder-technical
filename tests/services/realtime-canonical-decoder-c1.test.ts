import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../../src/domain/catalog.schema';
import { handleCatalogRealtimeEvent, type RealtimePayload } from '../../src/services/realtime.service';
import { StorageService } from '../../src/services/storage.service';
import { catalogRowToCatalog, SupabaseService } from '../../src/services/supabase.service';
import { useCatalogStore } from '../../src/stores/useCatalogStore';

const ACTIVE_ID = 'a1111111-1111-4111-8111-111111111111';
const OTHER_ID = 'b2222222-2222-4222-8222-222222222222';
const CREATED_AT = '2026-09-01T10:00:00.000Z';
const UPDATED_AT = '2026-09-07T12:00:00.000Z';

const baseCatalog: Catalog = {
  id: ACTIVE_ID,
  title: 'Catálogo local',
  subtitle: 'Estado anterior',
  themeId: 'default-technical',
  pages: [{
    id: 'page-1',
    pageNumber: 1,
    pageType: 'technical',
    title: 'Página 1',
    blocks: [{ id: 'block-1', type: 'text', title: 'Conteúdo preservado' }]
  }],
  sourceLocale: 'pt-BR',
  locale: 'pt-BR',
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  version: 7
};

function richRealtimeRow(id = ACTIVE_ID, version = 8) {
  return {
    id,
    name: 'Catálogo francês autorizado',
    status: 'draft',
    version,
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
    brand: {
      id: 'payload-id-must-not-win',
      title: 'Título não autoritativo',
      subtitle: 'Métrologie industrielle',
      themeId: 'presys-corporate',
      pages: structuredClone(baseCatalog.pages),
      sourceLocale: 'pt-BR',
      locale: 'fr-FR',
      translationMeta: {
        sourceCatalogId: 'source-catalog-1',
        sourceCatalogVersion: 4,
        sourceContentHash: 'sha256-canonical-content',
        sourceLocale: 'pt-BR',
        targetLocale: 'fr-FR',
        provider: 'approved-provider',
        coverage: 100,
        layoutQaStatus: 'passed' as const
      },
      localizedSystemStrings: {
        specificationsTitle: 'Spécifications techniques',
        featuresTitle: 'Caractéristiques principales'
      },
      lastMutation: {
        kind: 'MANUAL_EDIT' as const,
        clientInstanceId: 'remote-client',
        summary: 'Métadonnées de traduction mises à jour',
        timestamp: UPDATED_AT
      },
      customFutureMetadata: {
        complianceHash: 'sha256-approved-extension',
        customTenantId: 'tenant-c1'
      },
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
      version: 2
    }
  };
}

function asRealtimePayload(row: ReturnType<typeof richRealtimeRow>): RealtimePayload {
  return { eventType: 'UPDATE', new: row };
}

function expectRichMetadata(
  actual: Catalog | undefined,
  expected: Catalog,
  options: { includeLastMutation?: boolean } = {}
) {
  const { includeLastMutation = true } = options;
  expect(actual).toMatchObject({
    id: expected.id,
    title: expected.title,
    version: expected.version,
    createdAt: expected.createdAt,
    updatedAt: expected.updatedAt,
    sourceLocale: expected.sourceLocale,
    locale: expected.locale,
    translationMeta: expected.translationMeta,
    localizedSystemStrings: expected.localizedSystemStrings,
    customFutureMetadata: expected.customFutureMetadata
  });
  if (includeLastMutation) {
    expect(actual?.lastMutation).toEqual(expected.lastMutation);
  }
}

describe('C1 — canonical catalog realtime decoder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCatalogStore.setState({
      currentCatalog: structuredClone(baseCatalog),
      savedCatalogs: [structuredClone(baseCatalog)],
      editorContext: { kind: 'catalog', catalogId: ACTIVE_ID },
      activePageIndex: 0,
      selectedBlockId: null,
      selectedChildId: null,
      isSaving: false,
      isDirty: false,
      syncStatus: 'synced',
      syncError: null,
      serverSavedAt: null,
      cachedAt: null,
      inFlightSave: null,
      remoteVersionBarrier: null,
      localRevision: 0,
      lastAcknowledgedLocalRevision: 0
    });
  });

  it('C1-T1: authoritative and realtime materialization preserve equivalent metadata', async () => {
    const row = richRealtimeRow();
    const authoritative = catalogRowToCatalog(row);

    await handleCatalogRealtimeEvent(asRealtimePayload(row));

    expectRichMetadata(useCatalogStore.getState().currentCatalog ?? undefined, authoritative);
  });

  it('C1-T2: a clean active catalog adopts translation and localization metadata', async () => {
    const row = richRealtimeRow();
    const expected = catalogRowToCatalog(row);

    await handleCatalogRealtimeEvent(asRealtimePayload(row));

    const state = useCatalogStore.getState();
    expectRichMetadata(state.currentCatalog ?? undefined, expected);
    expect(state.isDirty).toBe(false);
    expect(state.syncStatus).toBe('synced');
  });

  it('C1-T3: OTHER_CATALOG saved-list adoption preserves canonical metadata', async () => {
    const row = richRealtimeRow(OTHER_ID, 3);
    const expected = catalogRowToCatalog(row);

    await handleCatalogRealtimeEvent(asRealtimePayload(row));

    const state = useCatalogStore.getState();
    expect(state.currentCatalog).toEqual(baseCatalog);
    expectRichMetadata(state.savedCatalogs.find((catalog) => catalog.id === OTHER_ID), expected);
  });

  it('C1-T4: self-echo and stale events remain inert', async () => {
    useCatalogStore.setState({
      inFlightSave: {
        catalogId: ACTIVE_ID,
        expectedVersion: 7,
        targetVersion: 8,
        capturedRevision: 0
      },
      isSaving: true,
      syncStatus: 'saving'
    });

    await handleCatalogRealtimeEvent(asRealtimePayload(richRealtimeRow(ACTIVE_ID, 8)));
    expect(useCatalogStore.getState().currentCatalog).toEqual(baseCatalog);
    expect(useCatalogStore.getState().syncStatus).toBe('saving');

    useCatalogStore.setState({ inFlightSave: null, isSaving: false, syncStatus: 'synced' });
    await handleCatalogRealtimeEvent(asRealtimePayload(richRealtimeRow(ACTIVE_ID, 7)));
    expect(useCatalogStore.getState().currentCatalog).toEqual(baseCatalog);
    expect(useCatalogStore.getState().syncStatus).toBe('synced');
  });

  it('C1-T5: a dirty active catalog is never replaced for metadata parity', async () => {
    const dirtyCatalog = { ...structuredClone(baseCatalog), title: 'Edição local não salva' };
    useCatalogStore.setState({
      currentCatalog: dirtyCatalog,
      isDirty: true,
      localRevision: 1,
      syncStatus: 'dirty'
    });

    await handleCatalogRealtimeEvent(asRealtimePayload(richRealtimeRow()));

    const state = useCatalogStore.getState();
    expect(state.currentCatalog).toEqual(dirtyCatalog);
    expect(state.syncStatus).toBe('conflict');
  });

  it('C1-T6: structural removal without matching mutation metadata stays blocked', async () => {
    const row = richRealtimeRow();
    row.brand.pages = [{
      id: 'page-1',
      pageNumber: 1,
      pageType: 'technical',
      title: 'Página 1',
      blocks: []
    }];

    await handleCatalogRealtimeEvent(asRealtimePayload(row));

    const state = useCatalogStore.getState();
    expect(state.currentCatalog).toEqual(baseCatalog);
    expect(state.syncStatus).toBe('conflict');
    expect(state.syncError).toContain('removeria conteúdo');
  });

  it('C1-T7: realtime adoption followed by normal save keeps canonical metadata', async () => {
    const row = richRealtimeRow();
    const expected = catalogRowToCatalog(row);
    let serializedCatalog: Catalog | undefined;

    vi.spyOn(StorageService, 'cacheCatalog').mockResolvedValue();
    vi.spyOn(SupabaseService, 'saveCatalog').mockImplementation(async (catalog) => {
      serializedCatalog = catalog as Catalog;
      return { success: true, data: { id: ACTIVE_ID, version: 9 } };
    });

    await handleCatalogRealtimeEvent(asRealtimePayload(row));
    const result = await useCatalogStore.getState().saveCurrentCatalog();

    expect(result.success).toBe(true);
    expectRichMetadata(serializedCatalog, expected, { includeLastMutation: false });
    expect(serializedCatalog?.lastMutation).toMatchObject({
      kind: 'MANUAL_EDIT',
      summary: 'Salvamento de catálogo'
    });
  });
});

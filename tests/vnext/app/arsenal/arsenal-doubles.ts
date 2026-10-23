import { vi } from 'vitest';
import { frameToCanonicalU, walkPageObjects } from '../../../../src/vnext/domain';
import type { CatalogDocument, EditorialObject } from '../../../../src/vnext/domain';
import {
  collectArsenalPayloadAssetIds,
  createInMemoryArsenalStore,
  stripArsenalTableValues,
  type ArsenalCaptureRequest,
  type ArsenalCaptureResult,
  type ArsenalCaptureService,
  type ArsenalInsertRequest,
  type ArsenalInsertionPort,
  type ArsenalInsertionService,
  type ArsenalInsertResult,
  type ArsenalPayload,
  type ArsenalPresetSummary,
  type ArsenalRepository,
  type ArsenalViewer,
} from '../../../../src/vnext/arsenal';
import type { ArsenalEditorRuntime } from '../../../../src/vnext/app/editor/arsenal/arsenal-runtime';
import {
  CONTRACT_ACTORS,
  builtinCoverPreset,
  headerBlockDraft,
  specTableDraft,
  titleStyleDraft,
} from '../../arsenal/contract/fixtures';

/**
 * Doubles of the arsenal slices that run in parallel (persistence, capture/insertion): the screen is tested against
 * the contract interfaces only. The repository is the contract's in-memory reference.
 */

export const ACTORS = CONTRACT_ACTORS;

export function viewerOf(actor: { readonly userId: string; readonly role: 'admin' | 'editor' | 'viewer' }): ArsenalViewer {
  return { userId: actor.userId, role: actor.role };
}

let uuidCounter = 0;
/** Canonical lowercase UUIDs, different on every call. */
export function testUuid(): string {
  uuidCounter += 1;
  const tail = uuidCounter.toString(16).padStart(12, '0');
  return `aaaaaaaa-bbbb-4ccc-8ddd-${tail}`;
}

/**
 * A shared store with: one PRESYS built-in cover, a header saved by Ana (author), a table saved by Bruno (another
 * editor) and a title style the AI proposed and Ana confirmed.
 */
export async function seededStore() {
  const store = createInMemoryArsenalStore({ builtins: [builtinCoverPreset()], now: () => '2026-10-23T12:00:00.000Z' });
  const ana = store.as(ACTORS.author);
  const bruno = store.as(ACTORS.otherEditor);
  const header = await ana.create({ presetId: testUuid(), mutationId: testUuid(), draft: { ...headerBlockDraft(), name: 'Cabeçalho azul' } });
  const table = await bruno.create({ presetId: testUuid(), mutationId: testUuid(), draft: { ...specTableDraft(), name: 'Tabela de especificações' } });
  const style = await ana.create({ presetId: testUuid(), mutationId: testUuid(), draft: { ...titleStyleDraft(), origin: 'ai', name: 'Título grande' } });
  if (!header.ok || !table.ok || !style.ok) throw new Error('seed failed');
  return { store, ids: { header: header.value.id, table: table.value.id, style: style.value.id, builtin: builtinCoverPreset().id } };
}

/** Wraps a repository so a test can add list items (a newer payload version) or make a call fail. */
export function wrapRepository(base: ArsenalRepository, overrides: Partial<ArsenalRepository> & { extraSummaries?: ArsenalPresetSummary[] } = {}): ArsenalRepository {
  const { extraSummaries = [], ...calls } = overrides;
  return {
    list: calls.list ?? (async (query) => {
      const result = await base.list(query);
      return result.ok ? { ok: true, value: [...result.value, ...extraSummaries] } : result;
    }),
    getMany: calls.getMany ?? ((ids) => base.getMany(ids)),
    create: calls.create ?? ((request) => base.create(request)),
    updateCAS: calls.updateCAS ?? ((request) => base.updateCAS(request)),
    deleteCAS: calls.deleteCAS ?? ((request) => base.deleteCAS(request)),
    recordUse: calls.recordUse ?? ((id) => base.recordUse(id)),
  };
}

/**
 * Insertion double: puts two marker boxes on the target page (a new page first for page presets) under ONE
 * transaction id, like the real service must; styles touch nothing. Records every request.
 */
export function fakeInsertion(): ArsenalInsertionService & { readonly requests: ArsenalInsertRequest[] } {
  const requests: ArsenalInsertRequest[] = [];
  return {
    requests,
    async insert(request: ArsenalInsertRequest, port: ArsenalInsertionPort): Promise<ArsenalInsertResult> {
      requests.push(request);
      const transactionId = port.createTransactionId();
      const { target } = request;
      if (target.kind === 'object') {
        return { ok: true, transactionId, pageId: port.getDocument().pages[0].id, objectIds: [target.objectId], placeholders: [] };
      }
      let pageId: string;
      if (target.kind === 'new-page') {
        const added = port.execute({ type: 'page.add', afterPageId: target.afterPageId }, { transactionId });
        if (!added.ok) return { ok: false, error: { code: 'ACTION_FAILED', details: 'page.add' }, rolledBack: false };
        pageId = added.metadata.createdIds[0];
      } else {
        pageId = target.pageId;
      }
      const objectIds: string[] = [];
      for (const [index, yMm] of [12, 40].entries()) {
        const result = port.execute({
          type: 'object.insert', pageId,
          object: {
            type: 'shape', shape: 'rectangle', zIndex: 50 + index,
            frameU: frameToCanonicalU({ xMm: 20, yMm, widthMm: 60, heightMm: 15 }), style: { fill: '#003f78' },
          },
        }, { transactionId });
        if (!result.ok) {
          if (objectIds.length > 0) port.undo();
          return { ok: false, error: { code: 'ACTION_FAILED', details: result.error.details }, rolledBack: objectIds.length > 0 };
        }
        objectIds.push(...result.metadata.createdIds.slice(0, 1));
      }
      return { ok: true, transactionId, pageId, objectIds, placeholders: [] };
    },
  };
}

function boundingFrame(objects: readonly EditorialObject[]) {
  const left = Math.min(...objects.map((object) => object.frame.xMm));
  const top = Math.min(...objects.map((object) => object.frame.yMm));
  const right = Math.max(...objects.map((object) => object.frame.xMm + object.frame.widthMm));
  const bottom = Math.max(...objects.map((object) => object.frame.yMm + object.frame.heightMm));
  return { xMm: left, yMm: top, widthMm: right - left, heightMm: bottom - top };
}

/** `structure-only`: every table of a page or block loses its values, like the real capture. */
function withoutValues(objects: readonly EditorialObject[], tableValues: 'structure-only' | 'generic-values'): EditorialObject[] {
  if (tableValues === 'generic-values') return [...objects];
  return objects.map((object) => object.type === 'table' ? { ...object, table: stripArsenalTableValues(object.table) } : object);
}

function withAssets(document: CatalogDocument, payload: Exclude<ArsenalPayload, { kind: 'style' }>): ArsenalPayload {
  const ids = new Set(collectArsenalPayloadAssetIds(payload));
  return { ...payload, assets: document.assets.filter((asset) => ids.has(asset.id)) };
}

/** Capture double: enough of the real rules for the screen (hidden objects out, tables without values by default). */
export function fakeCapture(): ArsenalCaptureService & { readonly calls: ArsenalCaptureRequest[] } {
  const calls: ArsenalCaptureRequest[] = [];
  const capture = (request: ArsenalCaptureRequest): ArsenalCaptureResult => {
    calls.push(request);
    const { document, source } = request;
    const tableValues = request.tableValues ?? 'structure-only';
    const allObjects = document.pages.flatMap((page) => walkPageObjects(page).map(({ object }) => ({ page, object })));
    if (source.kind === 'page') {
      const page = document.pages.find((entry) => entry.id === source.pageId);
      if (!page) return { ok: false, error: { code: 'SOURCE_NOT_FOUND', details: source.pageId } };
      const objects = withoutValues(page.objects.filter((object) => !object.hidden), tableValues);
      const hidden = page.objects.filter((object) => object.hidden).map((object) => object.id);
      return {
        ok: true,
        content: {
          kind: 'page', origin: request.origin, suggestedName: `Página ${document.pages.indexOf(page) + 1}`, suggestedCategory: 'paginas',
          payload: withAssets(document, { kind: 'page', objects, tableValues, assets: [] }),
        },
        notes: hidden.length ? [{ code: 'HIDDEN_OBJECTS_SKIPPED', objectIds: hidden }] : [],
      };
    }
    if (source.kind === 'objects') {
      const page = document.pages.find((entry) => entry.id === source.pageId);
      const chosen = page?.objects.filter((object) => source.objectIds.includes(object.id) && !object.hidden) ?? [];
      if (!page || chosen.length === 0) return { ok: false, error: { code: chosen.length ? 'SOURCE_NOT_FOUND' : 'SOURCE_EMPTY', details: '' } };
      const frame = boundingFrame(chosen);
      const objects = withoutValues(chosen.map((object) => ({ ...object, frame: { ...object.frame, xMm: object.frame.xMm - frame.xMm, yMm: object.frame.yMm - frame.yMm } })) as EditorialObject[], tableValues);
      return {
        ok: true,
        content: {
          kind: 'block', origin: request.origin, suggestedName: 'Bloco da página', suggestedCategory: 'paginas',
          payload: withAssets(document, { kind: 'block', frame, objects, tableValues, assets: [] }),
        },
        notes: [],
      };
    }
    const found = allObjects.find(({ object }) => object.id === source.objectId)?.object;
    if (!found) return { ok: false, error: { code: 'SOURCE_NOT_FOUND', details: source.objectId } };
    if (source.kind === 'table') {
      if (found.type !== 'table') return { ok: false, error: { code: 'SOURCE_UNSUPPORTED', details: found.type } };
      const table = tableValues === 'structure-only' ? stripArsenalTableValues(found.table) : found.table;
      return {
        ok: true,
        content: {
          kind: 'table', origin: request.origin, suggestedName: 'Tabela', suggestedCategory: 'tabelas',
          payload: { kind: 'table', sizeMm: { widthMm: found.frame.widthMm, heightMm: found.frame.heightMm }, table, tableValues, assets: [] },
        },
        notes: tableValues === 'structure-only' ? [{ code: 'TABLE_VALUES_REMOVED', objectIds: [found.id] }] : [],
      };
    }
    const style = found.type === 'text' ? { target: 'text' as const, text: found.style }
      : found.type === 'shape' ? { target: 'shape' as const, shape: found.style }
        : found.type === 'table' ? { target: 'table' as const, table: found.table.style }
          : null;
    if (!style) return { ok: false, error: { code: 'SOURCE_UNSUPPORTED', details: found.type } };
    return {
      ok: true,
      content: { kind: 'style', origin: request.origin, suggestedName: `Estilo de ${found.type === 'text' ? 'texto' : found.type === 'shape' ? 'forma' : 'tabela'}`, suggestedCategory: 'estilos', payload: { kind: 'style', style } },
      notes: [],
    };
  };
  return { calls, capture: vi.fn(capture) };
}

export interface TestRuntime extends ArsenalEditorRuntime {
  readonly insertion: ReturnType<typeof fakeInsertion>;
  readonly capture: ReturnType<typeof fakeCapture>;
}

export function testRuntime(repository: ArsenalRepository, viewer: ArsenalViewer, extra: Partial<ArsenalEditorRuntime> = {}): TestRuntime {
  return {
    repository,
    insertion: fakeInsertion(),
    capture: fakeCapture(),
    viewer,
    createId: testUuid,
    ...extra,
  } as TestRuntime;
}

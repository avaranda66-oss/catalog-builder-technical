import {
  walkPageObjects,
  type CatalogDocument,
  type EditorialObject,
  type Frame,
  type LeafEditorialObject,
  type Page,
  type RichText,
} from '../domain';
import { pageTitle } from '../editor/page-title';
import { TO_FILL } from '../library/presys-archetypes';
import { lineStyleState } from '../editor/native-element-authoring';
import {
  ARSENAL_DEFAULT_TABLE_VALUE_POLICY,
  ARSENAL_LIMITS,
  ARSENAL_PAYLOAD_SCHEMA_VERSION,
  arsenalPayloadBytes,
  validateArsenalPayload,
  type ArsenalCategory,
  type ArsenalPayload,
  type ArsenalPresetDraft,
  type ArsenalPresetMetadata,
  type ArsenalStyle,
} from './contracts';
import type {
  ArsenalCaptureErrorCode,
  ArsenalCaptureNote,
  ArsenalCaptureNoteCode,
  ArsenalCaptureRequest,
  ArsenalCaptureResult,
  ArsenalCaptureService,
  ArsenalCapturedContent,
} from './capture';
import {
  arsenalVisibleObjects,
  boundingFrame,
  normalizeStacking,
  translateFrame,
  ungroupedChild,
} from './arsenal-geometry';
import { objectsUnderTablePolicy, payloadAssetsFrom, tableUnderPolicy } from './arsenal-content';
import { ARSENAL_PHOTO_PLACEHOLDER_TEXT, tableWithPhotoPlaceholders, withPhotoPlaceholders } from './arsenal-placeholder';

/**
 * Onda 4.5 — capture (ADR-arsenal §2–§4): turns what is on the page into the content of a preset draft. Pure and
 * synchronous: no network, no AI. The person (or the AI, after the person confirms) only adds the name, category
 * and tags with `buildArsenalPresetDraft`.
 */

/** What the "Guardar no arsenal" dialog tells the person about each note (short sentences, pt-BR). */
export const ARSENAL_CAPTURE_NOTE_MESSAGES: Readonly<Record<ArsenalCaptureNoteCode, string>> = Object.freeze({
  HIDDEN_OBJECTS_SKIPPED: 'Os objetos ocultos ficaram de fora.',
  TABLE_VALUES_REMOVED: 'A tabela vai sem valores técnicos: só estrutura e estilo. Os valores vêm do PDF.',
  IMAGE_PLACEHOLDER: `A foto vai como moldura "${ARSENAL_PHOTO_PLACEHOLDER_TEXT}".`,
});

type Failure = Extract<ArsenalCaptureResult, { ok: false }>;
const fail = (code: ArsenalCaptureErrorCode, details: string): Failure => ({ ok: false, error: { code, details } });

const A4_AREA = 210 * 297;

function plainLine(text: RichText): string {
  for (const paragraph of text.paragraphs) {
    const line = paragraph.inlines.map((inline) => (inline.kind === 'text' ? inline.text : ' ')).join('').replace(/\s+/g, ' ').trim();
    if (line) return line;
  }
  return '';
}

/** "Cabeçalho – Título do catálogo": a label and the most prominent words, without the "(A COMPLETAR)" marker. */
function suggestedName(label: string, title: string): string {
  const words = title.replace(new RegExp(`\\s*\\(${TO_FILL}\\)`, 'g'), '').replace(TO_FILL, '').replace(/\s+/g, ' ').trim();
  const name = words ? `${label} – ${words}` : label;
  return name.length > ARSENAL_LIMITS.nameMaxChars ? `${name.slice(0, ARSENAL_LIMITS.nameMaxChars - 1).trimEnd()}…` : name;
}

function titleOf(objects: readonly EditorialObject[], document: CatalogDocument): string {
  return pageTitle({ id: 'arsenal:title', widthMm: 210, heightMm: 297, objects: [...objects] }, document.style.defaultText);
}

interface Prepared {
  readonly objects: EditorialObject[];
  readonly notes: ArsenalCaptureNote[];
}

/** Hidden ones out, painting order kept, pictures turned into frames where asked, tables under the policy. */
function prepareObjects(
  objects: readonly EditorialObject[],
  request: ArsenalCaptureRequest,
  hiddenIds: readonly string[],
): Prepared {
  const notes: ArsenalCaptureNote[] = [];
  if (hiddenIds.length > 0) notes.push({ code: 'HIDDEN_OBJECTS_SKIPPED', objectIds: [...hiddenIds] });
  const placeholders = withPhotoPlaceholders(normalizeStacking(objects), new Set(request.placeholderAssetIds ?? []));
  const policy = objectsUnderTablePolicy(normalizeStacking(placeholders.objects), request.tableValues ?? ARSENAL_DEFAULT_TABLE_VALUE_POLICY);
  if (policy.strippedIds.length > 0) notes.push({ code: 'TABLE_VALUES_REMOVED', objectIds: policy.strippedIds });
  if (placeholders.replacedIds.length > 0) notes.push({ code: 'IMAGE_PLACEHOLDER', objectIds: placeholders.replacedIds });
  return { objects: policy.objects, notes };
}

function countObjects(objects: readonly EditorialObject[]): number {
  return objects.reduce((total, object) => total + 1 + (object.type === 'group' ? object.objects.length : 0), 0);
}

function finish(
  kind: ArsenalCapturedContent['kind'],
  request: ArsenalCaptureRequest,
  payload: ArsenalPayload,
  suggested: { name: string; category: ArsenalCategory },
  notes: readonly ArsenalCaptureNote[],
): ArsenalCaptureResult {
  if (payload.kind === 'page' || payload.kind === 'block') {
    const count = countObjects(payload.objects);
    if (count > ARSENAL_LIMITS.objectsMax) return fail('TOO_LARGE', `${count} objetos > ${ARSENAL_LIMITS.objectsMax}`);
  }
  if (payload.kind !== 'style' && payload.assets.length > ARSENAL_LIMITS.assetsMax) {
    return fail('TOO_LARGE', `${payload.assets.length} imagens > ${ARSENAL_LIMITS.assetsMax}`);
  }
  const bytes = arsenalPayloadBytes(payload);
  if (bytes > ARSENAL_LIMITS.payloadMaxBytes) return fail('TOO_LARGE', `${bytes} bytes > ${ARSENAL_LIMITS.payloadMaxBytes}`);
  const issues = validateArsenalPayload(payload);
  if (issues.length > 0) return fail('INVALID_PAYLOAD', issues.map((entry) => `${entry.code} ${entry.path} ${entry.details}`).join('; '));
  return {
    ok: true,
    content: { kind, origin: request.origin, payload, suggestedName: suggested.name, suggestedCategory: suggested.category },
    notes,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------------------------

function capturePage(request: ArsenalCaptureRequest, pageId: string): ArsenalCaptureResult {
  const { document } = request;
  const pageIndex = document.pages.findIndex((page) => page.id === pageId);
  if (pageIndex < 0) return fail('SOURCE_NOT_FOUND', pageId);
  const page = document.pages[pageIndex];
  const visible = arsenalVisibleObjects(page.objects);
  if (visible.objects.length === 0 && !page.background) return fail('SOURCE_EMPTY', pageId);
  const prepared = prepareObjects(visible.objects, request, visible.hiddenIds);
  const notes = [...prepared.notes];

  let background = page.background;
  const placeholderIds = new Set(request.placeholderAssetIds ?? []);
  if (background?.image && placeholderIds.has(background.image.assetId)) {
    const { image: _image, ...rest } = background;
    background = rest.color === undefined ? undefined : rest;
    const existing = notes.find((note) => note.code === 'IMAGE_PLACEHOLDER');
    if (existing) notes.splice(notes.indexOf(existing), 1, { ...existing, objectIds: [...existing.objectIds, page.id] });
    else notes.push({ code: 'IMAGE_PLACEHOLDER', objectIds: [page.id] });
  }

  const draft: ArsenalPayload = {
    kind: 'page',
    ...(page.safeArea ? { safeArea: { ...page.safeArea } } : {}),
    ...(background ? { background: { ...background } } : {}),
    objects: prepared.objects,
    tableValues: request.tableValues ?? ARSENAL_DEFAULT_TABLE_VALUE_POLICY,
    assets: [],
  };
  const payload: ArsenalPayload = { ...draft, assets: payloadAssetsFrom(draft, document.assets) };
  const category: ArsenalCategory = pageIndex === 0 ? 'capas' : 'paginas';
  const label = category === 'capas' ? 'Capa' : 'Página';
  return finish('page', request, payload, { name: suggestedName(label, pageTitle(page, document.style.defaultText)), category }, notes);
}

function blockCategory(frame: Frame, pageIndex: number): { category: ArsenalCategory; label: string } {
  if (frame.yMm + frame.heightMm <= 297 * 0.25) return { category: 'cabecalhos', label: 'Cabeçalho' };
  if (frame.yMm >= 297 * 0.75) return { category: 'rodapes', label: 'Rodapé' };
  if (pageIndex === 0 && frame.widthMm * frame.heightMm >= A4_AREA * 0.5) return { category: 'capas', label: 'Capa' };
  return { category: 'paginas', label: 'Bloco' };
}

function captureObjects(request: ArsenalCaptureRequest, pageId: string, objectIds: readonly string[]): ArsenalCaptureResult {
  const { document } = request;
  const pageIndex = document.pages.findIndex((page) => page.id === pageId);
  if (pageIndex < 0) return fail('SOURCE_NOT_FOUND', pageId);
  const page = document.pages[pageIndex];
  if (objectIds.length === 0) return fail('SOURCE_EMPTY', pageId);

  const entries = walkPageObjects(page);
  const wanted = new Set(objectIds);
  for (const id of wanted) {
    if (!entries.some((entry) => entry.object.id === id)) return fail('SOURCE_NOT_FOUND', id);
  }
  // Painting order of the page; a child counts at its group's place, and a child whose group is selected is
  // already inside it.
  const picked: EditorialObject[] = [];
  const hiddenIds: string[] = [];
  const ordered = [...page.objects]
    .map((object, arrayIndex) => ({ object, arrayIndex }))
    .sort((a, b) => a.object.zIndex - b.object.zIndex || a.arrayIndex - b.arrayIndex)
    .map(({ object }) => object);
  for (const object of ordered) {
    if (wanted.has(object.id)) {
      picked.push(object);
      continue;
    }
    if (object.type !== 'group') continue;
    const children = object.objects
      .map((child, arrayIndex) => ({ child, arrayIndex }))
      .sort((a, b) => a.child.zIndex - b.child.zIndex || a.arrayIndex - b.arrayIndex)
      .map(({ child }) => child)
      .filter((child) => wanted.has(child.id));
    for (const child of children) {
      if (object.hidden || child.hidden) hiddenIds.push(child.id);
      else picked.push(ungroupedChild(object, child));
    }
  }
  const visible = arsenalVisibleObjects(picked);
  hiddenIds.push(...visible.hiddenIds);
  if (visible.objects.length === 0) return fail('SOURCE_EMPTY', objectIds.join(', '));

  const frame = boundingFrame(visible.objects.map((object) => object.frame))!;
  const relative = visible.objects.map((object) => ({ ...object, frame: translateFrame(object.frame, -frame.xMm, -frame.yMm) }));
  const prepared = prepareObjects(relative, request, hiddenIds);
  const draft: ArsenalPayload = {
    kind: 'block',
    frame,
    objects: prepared.objects,
    tableValues: request.tableValues ?? ARSENAL_DEFAULT_TABLE_VALUE_POLICY,
    assets: [],
  };
  const payload: ArsenalPayload = { ...draft, assets: payloadAssetsFrom(draft, document.assets) };
  const { category, label } = blockCategory(frame, pageIndex);
  return finish('block', request, payload, { name: suggestedName(label, titleOf(visible.objects, document)), category }, prepared.notes);
}

function findLeaf(document: CatalogDocument, objectId: string): { object: EditorialObject; page: Page; hidden: boolean } | undefined {
  for (const page of document.pages) {
    const entry = walkPageObjects(page).find((candidate) => candidate.object.id === objectId);
    if (entry) return { object: entry.object, page, hidden: Boolean(entry.object.hidden || entry.parentGroup?.hidden) };
  }
  return undefined;
}

function captureTable(request: ArsenalCaptureRequest, objectId: string): ArsenalCaptureResult {
  const found = findLeaf(request.document, objectId);
  if (!found) return fail('SOURCE_NOT_FOUND', objectId);
  if (found.object.type !== 'table') return fail('SOURCE_UNSUPPORTED', `${objectId} é ${found.object.type}`);
  if (found.hidden) return fail('SOURCE_EMPTY', `${objectId} está oculta`);
  const notes: ArsenalCaptureNote[] = [];
  const policy = request.tableValues ?? ARSENAL_DEFAULT_TABLE_VALUE_POLICY;
  const placeholders = tableWithPhotoPlaceholders(found.object.table, new Set(request.placeholderAssetIds ?? []));
  const underPolicy = tableUnderPolicy(placeholders.table, policy);
  if (underPolicy.stripped) notes.push({ code: 'TABLE_VALUES_REMOVED', objectIds: [objectId] });
  if (placeholders.changed) notes.push({ code: 'IMAGE_PLACEHOLDER', objectIds: [objectId] });
  const table = underPolicy.table;
  const draft: ArsenalPayload = {
    kind: 'table',
    sizeMm: { widthMm: found.object.frame.widthMm, heightMm: found.object.frame.heightMm },
    table,
    tableValues: policy,
    assets: [],
  };
  const payload: ArsenalPayload = { ...draft, assets: payloadAssetsFrom(draft, request.document.assets) };
  const sourceTitle = found.object.table.title ? plainLine(found.object.table.title) : '';
  const shape = `${table.rows.length} linha${table.rows.length === 1 ? '' : 's'} × ${table.columns.length} coluna${table.columns.length === 1 ? '' : 's'}`;
  return finish('table', request, payload, { name: suggestedName('Tabela', sourceTitle || shape), category: 'tabelas' }, notes);
}

function styleOf(object: LeafEditorialObject): { style: ArsenalStyle; name: string } | undefined {
  switch (object.type) {
    case 'text': {
      const size = object.style.fontSizePt;
      const bold = object.style.fontWeight === 700 ? ' negrito' : '';
      return {
        style: { target: 'text', text: { ...object.style }, ...(object.box ? { box: { ...object.box } } : {}) },
        name: `Texto${size === undefined ? '' : ` ${String(size).replace('.', ',')} pt`}${bold}${object.box ? ' com selo' : ''}`,
      };
    }
    case 'shape':
      return { style: { target: 'shape', shape: { ...object.style } }, name: object.shape === 'ellipse' ? 'Estilo de elipse' : 'Estilo de retângulo' };
    case 'polygon':
      return { style: { target: 'polygon', polygon: { ...object.style } }, name: 'Estilo de polígono' };
    case 'line':
      return { style: { target: 'line', line: lineStyleState(object) }, name: 'Estilo de linha' };
    case 'table':
      return { style: { target: 'table', table: object.table.style }, name: 'Estilo de tabela' };
    default:
      return undefined;
  }
}

function captureStyle(request: ArsenalCaptureRequest, objectId: string): ArsenalCaptureResult {
  const found = findLeaf(request.document, objectId);
  if (!found) return fail('SOURCE_NOT_FOUND', objectId);
  if (found.object.type === 'group') return fail('SOURCE_UNSUPPORTED', `${objectId} é um grupo`);
  const style = styleOf(found.object);
  if (!style) return fail('SOURCE_UNSUPPORTED', `${objectId} é ${found.object.type}`);
  const payload: ArsenalPayload = { kind: 'style', style: style.style };
  return finish('style', request, payload, { name: suggestedName(style.name, ''), category: 'estilos' }, []);
}

/** Captures the content of a preset from the open catalog (rules in `capture.ts`). */
export function captureArsenalContent(request: ArsenalCaptureRequest): ArsenalCaptureResult {
  const { source } = request;
  switch (source.kind) {
    case 'page':
      return capturePage(request, source.pageId);
    case 'objects':
      return captureObjects(request, source.pageId, source.objectIds);
    case 'table':
      return captureTable(request, source.objectId);
    case 'style':
      return captureStyle(request, source.objectId);
  }
}

export function createArsenalCaptureService(): ArsenalCaptureService {
  return { capture: captureArsenalContent };
}

export type ArsenalDraftMetadataInput = Partial<Pick<ArsenalPresetMetadata, 'name' | 'category' | 'description' | 'tags' | 'synonyms'>>;

/**
 * The draft `create` sends: captured content plus what the person typed (or the suggestion when left empty). Run
 * it through `parseArsenalPresetDraft` before saving.
 */
export function buildArsenalPresetDraft(content: ArsenalCapturedContent, metadata: ArsenalDraftMetadataInput = {}): ArsenalPresetDraft {
  const name = metadata.name?.replace(/\s+/g, ' ').trim() || content.suggestedName;
  const description = metadata.description?.replace(/\s+/g, ' ').trim();
  return {
    kind: content.kind,
    origin: content.origin,
    name,
    category: metadata.category ?? content.suggestedCategory,
    ...(description ? { description } : {}),
    tags: [...(metadata.tags ?? [])],
    synonyms: [...(metadata.synonyms ?? [])],
    payloadSchemaVersion: ARSENAL_PAYLOAD_SCHEMA_VERSION,
    payload: content.payload,
  };
}

import { z } from 'zod';
import {
  AssetRefSchema,
  EditorialObjectSchema,
  FrameSchema,
  PageSchema,
  PolygonStyleSchema,
  ShapeStyleSchema,
  StrokeDashSchema,
  TableModelSchema,
  TableStyleSchema,
  TextBoxSchema,
  TextStyleSchema,
  type EditorialObject,
  type Page,
  type TableModel,
} from '../domain/editorial-model';
import { walkPageObjects } from '../domain/object-tree';
import { validateTable } from '../table/table-model';

/**
 * Onda 4.5 — "Arsenal" (ADR-arsenal): presets the whole team saves once and reuses in any catalog.
 *
 * This module is the shared contract of the parallel slices (persistence, capture/insertion, gallery, AI):
 * kinds, categories, limits, the Zod schemas of the preset and of its versioned payload, the policy for technical
 * values in tables, and the compact index the AI reads. Everything here is pure: no network, no React, no AI.
 */

// ---------------------------------------------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------------------------------------------

export const ARSENAL_PAYLOAD_SCHEMA_VERSION = 1 as const;

/** One place for every size rule. The migration 00031 repeats the server-side ones (a test compares them). */
export const ARSENAL_LIMITS = Object.freeze({
  nameMaxChars: 80,
  descriptionMaxChars: 280,
  tagsMax: 12,
  tagMaxChars: 32,
  synonymsMax: 24,
  synonymMaxChars: 40,
  /** Every editorial object of the payload, group children included. */
  objectsMax: 400,
  assetsMax: 40,
  /** `JSON.stringify` bytes on the client. Lower than the server limit because `jsonb::text` adds spaces. */
  payloadMaxBytes: 786_432,
  /** `octet_length(payload::text)` on the server. */
  serverPayloadMaxBytes: 1_048_576,
  getManyMax: 50,
  compactIndexMaxEntries: 120,
  compactIndexMaxTags: 4,
  compactIndexMaxChars: 12_000,
});

export const ARSENAL_PRESET_KINDS = ['page', 'block', 'table', 'style'] as const;
export type ArsenalPresetKind = (typeof ARSENAL_PRESET_KINDS)[number];

export const ARSENAL_CATEGORIES = ['capas', 'tabelas', 'cabecalhos', 'rodapes', 'paginas', 'estilos'] as const;
export type ArsenalCategory = (typeof ARSENAL_CATEGORIES)[number];

/** Gallery order and the words the person reads. */
export const ARSENAL_CATEGORY_LABELS: Readonly<Record<ArsenalCategory, string>> = Object.freeze({
  capas: 'Capas',
  tabelas: 'Tabelas',
  cabecalhos: 'Cabeçalhos',
  rodapes: 'Rodapés',
  paginas: 'Páginas',
  estilos: 'Estilos',
});

export const ARSENAL_KIND_LABELS: Readonly<Record<ArsenalPresetKind, string>> = Object.freeze({
  page: 'Página inteira',
  block: 'Bloco',
  table: 'Tabela',
  style: 'Estilo',
});

/** Which categories each kind may be filed under. The CHECK of `vnext_presets` mirrors this table. */
export const ARSENAL_KIND_CATEGORIES: Readonly<Record<ArsenalPresetKind, readonly ArsenalCategory[]>> = Object.freeze({
  page: Object.freeze(['capas', 'paginas'] as const),
  block: Object.freeze(['capas', 'cabecalhos', 'rodapes', 'paginas'] as const),
  table: Object.freeze(['tabelas'] as const),
  style: Object.freeze(['estilos'] as const),
});

export const ARSENAL_SCOPES = ['team', 'builtin'] as const;
export type ArsenalScope = (typeof ARSENAL_SCOPES)[number];

export const ARSENAL_ORIGINS = ['person', 'ai', 'builtin'] as const;
export type ArsenalOrigin = (typeof ARSENAL_ORIGINS)[number];

/** Origins a team preset can have (built-ins live in code, never in the database). */
export const ARSENAL_TEAM_ORIGINS = ['person', 'ai'] as const;
export type ArsenalTeamOrigin = (typeof ARSENAL_TEAM_ORIGINS)[number];

/**
 * `structure-only` (default): tables keep grid, merges, widths and style; only header-row words stay, every other
 * cell is empty ("valores vêm do PDF"). `generic-values`: the person explicitly chose to keep generic content.
 */
export const ARSENAL_TABLE_VALUE_POLICIES = ['structure-only', 'generic-values'] as const;
export type ArsenalTableValuePolicy = (typeof ARSENAL_TABLE_VALUE_POLICIES)[number];
export const ARSENAL_DEFAULT_TABLE_VALUE_POLICY: ArsenalTableValuePolicy = 'structure-only';

export const ARSENAL_STYLE_TARGETS = ['text', 'shape', 'polygon', 'line', 'table'] as const;
export type ArsenalStyleTarget = (typeof ARSENAL_STYLE_TARGETS)[number];

export function isArsenalCategoryAllowed(kind: ArsenalPresetKind, category: ArsenalCategory): boolean {
  return ARSENAL_KIND_CATEGORIES[kind].includes(category);
}

// ---------------------------------------------------------------------------------------------------------------
// Identifiers and text
// ---------------------------------------------------------------------------------------------------------------

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BUILTIN_ID_PATTERN = /^builtin:[a-z0-9][a-z0-9._-]{0,79}$/;
export const ARSENAL_BUILTIN_ID_PREFIX = 'builtin:';

export const ArsenalTeamPresetIdSchema = z.string().regex(UUID_PATTERN, 'ARSENAL_ID_NOT_CANONICAL_UUID');
export const ArsenalBuiltinPresetIdSchema = z.string().regex(BUILTIN_ID_PATTERN, 'ARSENAL_BUILTIN_ID_INVALID');
export const ArsenalPresetIdSchema = z.union([ArsenalTeamPresetIdSchema, ArsenalBuiltinPresetIdSchema]);

export function isBuiltinArsenalPresetId(id: string): boolean {
  return BUILTIN_ID_PATTERN.test(id);
}

export function isTeamArsenalPresetId(id: string): boolean {
  return UUID_PATTERN.test(id);
}

/** `builtin:presys-p1-capa` for the page template `presys-p1-capa`. Throws on a slug the database would refuse. */
export function builtinArsenalPresetId(slug: string): string {
  const id = `${ARSENAL_BUILTIN_ID_PREFIX}${slug}`;
  if (!BUILTIN_ID_PATTERN.test(id)) throw new Error(`ARSENAL_BUILTIN_ID_INVALID: ${slug}`);
  return id;
}

const hasControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });

/** One-line text, trimmed, without control characters, at most `max` characters. */
const boundedText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value.trim() === value, 'ARSENAL_TEXT_UNTRIMMED')
    .refine((value) => !hasControlCharacter(value), 'Control character');

/** Lower case, no accents, single spaces: "Cabeçalho  AZUL" → "cabecalho azul". */
export function normalizeArsenalSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const termList = (maxCount: number, maxChars: number) =>
  z
    .array(boundedText(maxChars))
    .max(maxCount)
    .superRefine((terms, context) => {
      const seen = new Set<string>();
      terms.forEach((term, index) => {
        const key = normalizeArsenalSearchText(term);
        if (seen.has(key)) context.addIssue({ code: 'custom', path: [index], message: 'ARSENAL_TERM_DUPLICATE' });
        seen.add(key);
      });
    });

// ---------------------------------------------------------------------------------------------------------------
// Payload (versioned content of a preset)
// ---------------------------------------------------------------------------------------------------------------

export const ArsenalPresetKindSchema = z.enum(ARSENAL_PRESET_KINDS);
export const ArsenalCategorySchema = z.enum(ARSENAL_CATEGORIES);
export const ArsenalScopeSchema = z.enum(ARSENAL_SCOPES);
export const ArsenalOriginSchema = z.enum(ARSENAL_ORIGINS);
export const ArsenalTeamOriginSchema = z.enum(ARSENAL_TEAM_ORIGINS);
export const ArsenalTableValuePolicySchema = z.enum(ARSENAL_TABLE_VALUE_POLICIES);

const assetList = z.array(AssetRefSchema).max(ARSENAL_LIMITS.assetsMax);

/** A whole A4 page. Objects keep the ids of the source catalog; insertion always creates fresh ids. */
export const ArsenalPagePayloadSchema = z
  .object({
    kind: z.literal('page'),
    safeArea: PageSchema.shape.safeArea,
    background: PageSchema.shape.background,
    objects: z.array(EditorialObjectSchema),
    tableValues: ArsenalTableValuePolicySchema,
    assets: assetList,
  })
  .strict();

/**
 * Loose objects or a group (header, footer, cover band, callout…). `frame` is where the block sat on the source
 * page; object frames are relative to it (its top-left corner is 0,0), so "same place" insertion is exact.
 */
export const ArsenalBlockPayloadSchema = z
  .object({
    kind: z.literal('block'),
    frame: FrameSchema,
    objects: z.array(EditorialObjectSchema).min(1),
    tableValues: ArsenalTableValuePolicySchema,
    assets: assetList,
  })
  .strict();

/** Table structure and style; values follow `tableValues`. */
export const ArsenalTablePayloadSchema = z
  .object({
    kind: z.literal('table'),
    sizeMm: FrameSchema.pick({ widthMm: true, heightMm: true }),
    table: TableModelSchema,
    tableValues: ArsenalTableValuePolicySchema,
    assets: assetList,
  })
  .strict();

export const ArsenalLineStyleSchema = z
  .object({
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    thicknessPt: z.number().finite().positive().max(72).optional(),
    dash: StrokeDashSchema.optional(),
    opacity: z.number().finite().min(0).max(1).optional(),
  })
  .strict();

export const ArsenalStyleSchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('text'), text: TextStyleSchema, box: TextBoxSchema.optional() }).strict(),
  z.object({ target: z.literal('shape'), shape: ShapeStyleSchema }).strict(),
  z.object({ target: z.literal('polygon'), polygon: PolygonStyleSchema }).strict(),
  z.object({ target: z.literal('line'), line: ArsenalLineStyleSchema }).strict(),
  z.object({ target: z.literal('table'), table: TableStyleSchema }).strict(),
]);
export type ArsenalStyle = z.infer<typeof ArsenalStyleSchema>;

/** A look applied to an existing object. Styles never carry images. */
export const ArsenalStylePayloadSchema = z
  .object({
    kind: z.literal('style'),
    style: ArsenalStyleSchema,
  })
  .strict();

export const ArsenalPayloadSchema = z.discriminatedUnion('kind', [
  ArsenalPagePayloadSchema,
  ArsenalBlockPayloadSchema,
  ArsenalTablePayloadSchema,
  ArsenalStylePayloadSchema,
]);

export type ArsenalPagePayload = z.infer<typeof ArsenalPagePayloadSchema>;
export type ArsenalBlockPayload = z.infer<typeof ArsenalBlockPayloadSchema>;
export type ArsenalTablePayload = z.infer<typeof ArsenalTablePayloadSchema>;
export type ArsenalStylePayload = z.infer<typeof ArsenalStylePayloadSchema>;
export type ArsenalPayload = z.infer<typeof ArsenalPayloadSchema>;

// ---------------------------------------------------------------------------------------------------------------
// Preset envelope
// ---------------------------------------------------------------------------------------------------------------

export const ArsenalPresetMetadataSchema = z
  .object({
    name: boundedText(ARSENAL_LIMITS.nameMaxChars),
    category: ArsenalCategorySchema,
    description: boundedText(ARSENAL_LIMITS.descriptionMaxChars).optional(),
    tags: termList(ARSENAL_LIMITS.tagsMax, ARSENAL_LIMITS.tagMaxChars),
    synonyms: termList(ARSENAL_LIMITS.synonymsMax, ARSENAL_LIMITS.synonymMaxChars),
  })
  .strict();
export type ArsenalPresetMetadata = z.infer<typeof ArsenalPresetMetadataSchema>;

const timestamp = z.string().min(1);
const safeCount = z.number().int().safe();

const ArsenalPresetSummaryBaseSchema = z
  .object({
    id: ArsenalPresetIdSchema,
    scope: ArsenalScopeSchema,
    origin: ArsenalOriginSchema,
    kind: ArsenalPresetKindSchema,
    ...ArsenalPresetMetadataSchema.shape,
    /** Any positive version is listed; only the current one can be loaded and inserted. */
    payloadSchemaVersion: safeCount.positive(),
    revision: safeCount.min(1),
    createdBy: z.string().min(1).nullable(),
    createdByName: z.string().min(1).nullable(),
    createdAt: timestamp.nullable(),
    updatedAt: timestamp.nullable(),
    useCount: safeCount.nonnegative(),
    lastUsedAt: timestamp.nullable(),
  })
  .strict();

type SummaryShape = z.infer<typeof ArsenalPresetSummaryBaseSchema>;

function refineEnvelope(preset: SummaryShape & { payload?: { kind: ArsenalPresetKind } }, context: z.RefinementCtx): void {
  const builtin = preset.scope === 'builtin';
  if (builtin !== isBuiltinArsenalPresetId(preset.id))
    context.addIssue({ code: 'custom', path: ['id'], message: 'ARSENAL_SCOPE_ID_MISMATCH' });
  if (builtin !== (preset.origin === 'builtin'))
    context.addIssue({ code: 'custom', path: ['origin'], message: 'ARSENAL_SCOPE_ORIGIN_MISMATCH' });
  if (builtin && preset.createdBy !== null)
    context.addIssue({ code: 'custom', path: ['createdBy'], message: 'ARSENAL_BUILTIN_HAS_NO_AUTHOR' });
  if (!isArsenalCategoryAllowed(preset.kind, preset.category))
    context.addIssue({ code: 'custom', path: ['category'], message: 'ARSENAL_CATEGORY_NOT_ALLOWED_FOR_KIND' });
  if (preset.payload && preset.payload.kind !== preset.kind)
    context.addIssue({ code: 'custom', path: ['payload', 'kind'], message: 'ARSENAL_PAYLOAD_KIND_MISMATCH' });
}

/** What the gallery list and the AI index read (no payload). */
export const ArsenalPresetSummarySchema = ArsenalPresetSummaryBaseSchema.extend({
  /** Server size of the payload; absent for built-ins. */
  payloadBytes: safeCount.positive().optional(),
}).superRefine(refineEnvelope);
export type ArsenalPresetSummary = z.infer<typeof ArsenalPresetSummarySchema>;

/** A loaded preset, ready to preview and insert. */
export const ArsenalPresetSchema = ArsenalPresetSummaryBaseSchema.extend({
  payloadBytes: safeCount.positive().optional(),
  payloadSchemaVersion: z.literal(ARSENAL_PAYLOAD_SCHEMA_VERSION),
  payload: ArsenalPayloadSchema,
}).superRefine(refineEnvelope);
export type ArsenalPreset = z.infer<typeof ArsenalPresetSchema>;

/** What capture produces and `create` sends: a team preset before it has an id, author or revision. */
export const ArsenalPresetDraftSchema = z
  .object({
    kind: ArsenalPresetKindSchema,
    origin: ArsenalTeamOriginSchema,
    ...ArsenalPresetMetadataSchema.shape,
    payloadSchemaVersion: z.literal(ARSENAL_PAYLOAD_SCHEMA_VERSION),
    payload: ArsenalPayloadSchema,
  })
  .strict()
  .superRefine((draft, context) => {
    if (!isArsenalCategoryAllowed(draft.kind, draft.category))
      context.addIssue({ code: 'custom', path: ['category'], message: 'ARSENAL_CATEGORY_NOT_ALLOWED_FOR_KIND' });
    if (draft.payload.kind !== draft.kind)
      context.addIssue({ code: 'custom', path: ['payload', 'kind'], message: 'ARSENAL_PAYLOAD_KIND_MISMATCH' });
  });
export type ArsenalPresetDraft = z.infer<typeof ArsenalPresetDraftSchema>;

// ---------------------------------------------------------------------------------------------------------------
// Deep payload validation
// ---------------------------------------------------------------------------------------------------------------

export interface ArsenalIssue {
  readonly code: string;
  readonly path: string;
  readonly details: string;
}

export type ArsenalParseFailureCode = 'INVALID_PRESET' | 'UNSUPPORTED_VERSION' | 'TOO_LARGE';

export type ArsenalParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: ArsenalParseFailureCode; readonly issues: readonly ArsenalIssue[] };

const issue = (code: string, path: string, details: string): ArsenalIssue => ({ code, path, details });

function zodIssues(error: z.ZodError, prefix = ''): ArsenalIssue[] {
  return error.issues.map((entry) =>
    issue('ARSENAL_SCHEMA_INVALID', [prefix, ...entry.path.map(String)].filter(Boolean).join('.'), entry.message),
  );
}

/** UTF-8 size of the payload as the client sends it. */
export function arsenalPayloadBytes(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

/** The objects of a page/block payload seen as one synthetic page, so the domain walkers can be reused. */
function payloadValidationPage(payload: ArsenalPagePayload | ArsenalBlockPayload): Page {
  return {
    id: 'arsenal:validation-page',
    widthMm: 210,
    heightMm: 297,
    objects: payload.objects,
    ...(payload.kind === 'page' && payload.background ? { background: payload.background } : {}),
  };
}

function tablesOf(payload: ArsenalPayload): TableModel[] {
  if (payload.kind === 'table') return [payload.table];
  if (payload.kind === 'style') return [];
  return walkPageObjects(payloadValidationPage(payload))
    .map(({ object }) => object)
    .filter((object): object is Extract<EditorialObject, { type: 'table' }> => object.type === 'table')
    .map((object) => object.table);
}

/** Every asset id the payload points at (images, icons, page background, images inside table cells). */
export function collectArsenalPayloadAssetIds(payload: ArsenalPayload): string[] {
  const ids = new Set<string>();
  if (payload.kind === 'style') return [];
  if (payload.kind !== 'table') {
    if (payload.kind === 'page' && payload.background?.image) ids.add(payload.background.image.assetId);
    for (const { object } of walkPageObjects(payloadValidationPage(payload))) {
      if (object.type === 'image' || object.type === 'icon') ids.add(object.assetId);
    }
  }
  for (const table of tablesOf(payload)) {
    for (const cell of table.cells) if (cell.content.type === 'image') ids.add(cell.content.assetId);
  }
  return [...ids];
}

export type ArsenalTableValueViolationCode =
  | 'TABLE_BODY_VALUE'
  | 'TABLE_TECHNICAL_VALUE'
  | 'TABLE_NOTES'
  | 'TABLE_TITLE';

export interface ArsenalTableValueViolation {
  readonly code: ArsenalTableValueViolationCode;
  readonly tableId: string;
  readonly cellId?: string;
}

/**
 * What a `structure-only` table must not contain: words outside header rows, any code/measurement/image/marker,
 * notes or legend, and the title. An empty list means the table is only structure and style.
 */
export function findArsenalTableValueViolations(table: TableModel): ArsenalTableValueViolation[] {
  const roles = new Map(table.rows.map((row) => [row.id, row.role]));
  const violations: ArsenalTableValueViolation[] = [];
  for (const cell of table.cells) {
    const { type } = cell.content;
    if (type === 'empty') continue;
    if (type === 'richText') {
      if (roles.get(cell.rowId) !== 'header') violations.push({ code: 'TABLE_BODY_VALUE', tableId: table.id, cellId: cell.id });
      continue;
    }
    violations.push({ code: 'TABLE_TECHNICAL_VALUE', tableId: table.id, cellId: cell.id });
  }
  if (table.annotations.length > 0 || table.legend.length > 0 || (table.annotationIds?.length ?? 0) > 0
    || table.cells.some((cell) => (cell.annotationIds?.length ?? 0) > 0)) {
    violations.push({ code: 'TABLE_NOTES', tableId: table.id });
  }
  if (table.title) violations.push({ code: 'TABLE_TITLE', tableId: table.id });
  return violations;
}

/**
 * The `structure-only` version of a table: same grid, merges, sizes and styles; header-row words stay, every other
 * cell becomes empty; notes, legend, title and cell images go away. The result passes `validateTable`.
 */
export function stripArsenalTableValues(table: TableModel): TableModel {
  const roles = new Map(table.rows.map((row) => [row.id, row.role]));
  const { title: _title, annotationIds: _tableAnnotationIds, ...rest } = table;
  return {
    ...rest,
    cells: table.cells.map((cell) => {
      const keep = cell.content.type === 'richText' && roles.get(cell.rowId) === 'header';
      const { annotationIds: _annotationIds, contentPresentation, content, ...cellRest } = cell;
      const wrapPolicy = contentPresentation?.wrapPolicy;
      const presentation = keep
        ? contentPresentation
        : wrapPolicy === undefined ? undefined : { wrapPolicy };
      return {
        ...cellRest,
        content: keep ? content : { type: 'empty' as const },
        ...(presentation === undefined ? {} : { contentPresentation: presentation }),
      };
    }),
    annotations: [],
    legend: [],
  };
}

const ENVELOPE_TOLERANCE_MM = 0.01;

/**
 * Checks what the schema alone cannot: size, object count, unique ids, sound tables, the technical-value policy,
 * block geometry and that `assets` lists exactly the images the payload uses.
 */
export function validateArsenalPayload(payload: ArsenalPayload): ArsenalIssue[] {
  const issues: ArsenalIssue[] = [];
  const bytes = arsenalPayloadBytes(payload);
  if (bytes > ARSENAL_LIMITS.payloadMaxBytes) {
    issues.push(issue('ARSENAL_PAYLOAD_TOO_LARGE', 'payload', `${bytes} bytes > ${ARSENAL_LIMITS.payloadMaxBytes}`));
  }
  if (payload.kind === 'style') return issues;

  const ids: string[] = [];
  if (payload.kind === 'table') {
    const { table } = payload;
    ids.push(table.id, ...table.columns.map((c) => c.id), ...table.rows.map((r) => r.id), ...table.cells.map((c) => c.id),
      ...table.annotations.map((a) => a.id), ...table.legend.map((l) => l.id));
  } else {
    const entries = walkPageObjects(payloadValidationPage(payload));
    if (entries.length > ARSENAL_LIMITS.objectsMax) {
      issues.push(issue('ARSENAL_TOO_MANY_OBJECTS', 'payload.objects', `${entries.length} > ${ARSENAL_LIMITS.objectsMax}`));
    }
    for (const { object } of entries) {
      ids.push(object.id);
      if (object.type === 'table') {
        const table = object.table;
        ids.push(table.id, ...table.columns.map((c) => c.id), ...table.rows.map((r) => r.id), ...table.cells.map((c) => c.id),
          ...table.annotations.map((a) => a.id), ...table.legend.map((l) => l.id));
      }
    }
    if (payload.kind === 'block') {
      payload.objects.forEach((object, index) => {
        const { xMm, yMm, widthMm, heightMm } = object.frame;
        if (xMm < -ENVELOPE_TOLERANCE_MM || yMm < -ENVELOPE_TOLERANCE_MM
          || xMm + widthMm > payload.frame.widthMm + ENVELOPE_TOLERANCE_MM
          || yMm + heightMm > payload.frame.heightMm + ENVELOPE_TOLERANCE_MM) {
          issues.push(issue('ARSENAL_BLOCK_OBJECT_OUTSIDE_FRAME', `payload.objects.${index}.frame`, object.id));
        }
      });
    }
  }
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) issues.push(issue('ARSENAL_DUPLICATE_ID', 'payload', id));
    seen.add(id);
  }

  for (const table of tablesOf(payload)) {
    for (const diagnostic of validateTable(table, payload.assets)) {
      issues.push(issue(diagnostic.code, `table:${table.id}`, diagnostic.details));
    }
    if (payload.tableValues === 'structure-only') {
      for (const violation of findArsenalTableValueViolations(table)) {
        issues.push(issue(`ARSENAL_${violation.code}`, `table:${table.id}`, violation.cellId ?? table.id));
      }
    }
  }

  const declared = new Set<string>();
  payload.assets.forEach((asset, index) => {
    if (declared.has(asset.id)) issues.push(issue('ARSENAL_ASSET_DUPLICATE', `payload.assets.${index}`, asset.id));
    declared.add(asset.id);
  });
  const referenced = new Set(collectArsenalPayloadAssetIds(payload));
  for (const id of referenced) {
    if (!declared.has(id)) issues.push(issue('ARSENAL_ASSET_MISSING', 'payload.assets', id));
  }
  for (const id of declared) {
    if (!referenced.has(id)) issues.push(issue('ARSENAL_ASSET_UNUSED', 'payload.assets', id));
  }
  return issues;
}

function unsupportedVersion(input: unknown): number | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const version = (input as { payloadSchemaVersion?: unknown }).payloadSchemaVersion;
  return typeof version === 'number' && Number.isInteger(version) && version > ARSENAL_PAYLOAD_SCHEMA_VERSION
    ? version
    : undefined;
}

function finishParse<T extends { payload: ArsenalPayload }>(value: T): ArsenalParseResult<T> {
  const issues = validateArsenalPayload(value.payload);
  if (issues.length === 0) return { ok: true, value };
  const tooLarge = issues.some((entry) => entry.code === 'ARSENAL_PAYLOAD_TOO_LARGE');
  return { ok: false, code: tooLarge ? 'TOO_LARGE' : 'INVALID_PRESET', issues };
}

/** A loaded preset (team or built-in). A newer payload version answers UNSUPPORTED_VERSION instead of a crash. */
export function parseArsenalPreset(input: unknown): ArsenalParseResult<ArsenalPreset> {
  const version = unsupportedVersion(input);
  if (version !== undefined) {
    return { ok: false, code: 'UNSUPPORTED_VERSION', issues: [issue('ARSENAL_UNSUPPORTED_VERSION', 'payloadSchemaVersion', String(version))] };
  }
  const parsed = ArsenalPresetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID_PRESET', issues: zodIssues(parsed.error) };
  return finishParse(parsed.data);
}

/** A draft about to be saved (capture result, AI proposal confirmed by the person). */
export function parseArsenalPresetDraft(input: unknown): ArsenalParseResult<ArsenalPresetDraft> {
  const version = unsupportedVersion(input);
  if (version !== undefined) {
    return { ok: false, code: 'UNSUPPORTED_VERSION', issues: [issue('ARSENAL_UNSUPPORTED_VERSION', 'payloadSchemaVersion', String(version))] };
  }
  const parsed = ArsenalPresetDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID_PRESET', issues: zodIssues(parsed.error) };
  return finishParse(parsed.data);
}

/** A list item. Newer payload versions are accepted here so the gallery can say "precisa de app mais novo". */
export function parseArsenalPresetSummary(input: unknown): ArsenalParseResult<ArsenalPresetSummary> {
  const parsed = ArsenalPresetSummarySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID_PRESET', issues: zodIssues(parsed.error) };
  return { ok: true, value: parsed.data };
}

export function isArsenalPayloadVersionSupported(summary: Pick<ArsenalPresetSummary, 'payloadSchemaVersion'>): boolean {
  return summary.payloadSchemaVersion === ARSENAL_PAYLOAD_SCHEMA_VERSION;
}

// ---------------------------------------------------------------------------------------------------------------
// Who may do what (presentation only; the database decides)
// ---------------------------------------------------------------------------------------------------------------

export type ArsenalRole = 'admin' | 'editor' | 'viewer';

export interface ArsenalViewer {
  readonly userId: string | null;
  readonly role: ArsenalRole | null;
}

/** Read, save and insert: active admins and editors. */
export function canUseArsenal(viewer: ArsenalViewer): boolean {
  return viewer.userId !== null && (viewer.role === 'admin' || viewer.role === 'editor');
}

/** Rename, change and delete: the author or an admin. Built-ins are read-only for everyone. */
export function canManageArsenalPreset(
  preset: Pick<ArsenalPresetSummary, 'scope' | 'createdBy'>,
  viewer: ArsenalViewer,
): boolean {
  if (preset.scope !== 'team' || !canUseArsenal(viewer)) return false;
  return viewer.role === 'admin' || (preset.createdBy !== null && preset.createdBy === viewer.userId);
}

// ---------------------------------------------------------------------------------------------------------------
// Search and the AI index
// ---------------------------------------------------------------------------------------------------------------

export type ArsenalSearchable = Pick<ArsenalPresetSummary, 'name' | 'category' | 'kind' | 'tags' | 'synonyms'>
  & { readonly description?: string };

function searchWords(preset: ArsenalSearchable): string[] {
  return [
    preset.name,
    preset.description ?? '',
    ...preset.tags,
    ...preset.synonyms,
    ARSENAL_CATEGORY_LABELS[preset.category],
    ARSENAL_KIND_LABELS[preset.kind],
  ]
    .map(normalizeArsenalSearchText)
    .flatMap((text) => text.split(/[^a-z0-9]+/))
    .filter(Boolean);
}

/** Every word of the query must start a word of the name, description, tags, synonyms, category or kind. */
export function arsenalPresetMatchesQuery(preset: ArsenalSearchable, query: string): boolean {
  const wanted = normalizeArsenalSearchText(query).split(/[^a-z0-9]+/).filter(Boolean);
  if (wanted.length === 0) return true;
  const words = searchWords(preset);
  return wanted.every((term) => words.some((word) => word.startsWith(term)));
}

export interface ArsenalCompactIndexEntry {
  readonly id: string;
  readonly name: string;
  readonly category: ArsenalCategory;
  readonly kind: ArsenalPresetKind;
  readonly tags: readonly string[];
}

export interface ArsenalCompactIndexOptions {
  readonly maxEntries?: number;
  readonly maxTagsPerEntry?: number;
  /** Budget for `JSON.stringify(index)`; entries are dropped from the end until it fits. */
  readonly maxChars?: number;
}

export type ArsenalIndexable = Pick<
  ArsenalPresetSummary,
  'id' | 'name' | 'category' | 'kind' | 'tags' | 'useCount' | 'payloadSchemaVersion'
>;

/**
 * What the AI reads about the arsenal: id, name, category, kind and a few tags — never payloads. Most used first,
 * then by name (pt-BR) and id, so the same arsenal always gives the same index. Presets this app cannot insert
 * (newer payload version) are left out.
 */
export function buildArsenalCompactIndex(
  presets: readonly ArsenalIndexable[],
  options: ArsenalCompactIndexOptions = {},
): ArsenalCompactIndexEntry[] {
  const maxEntries = Math.max(0, options.maxEntries ?? ARSENAL_LIMITS.compactIndexMaxEntries);
  const maxTags = Math.max(0, options.maxTagsPerEntry ?? ARSENAL_LIMITS.compactIndexMaxTags);
  const maxChars = Math.max(2, options.maxChars ?? ARSENAL_LIMITS.compactIndexMaxChars);
  const entries = presets
    .filter((preset) => preset.payloadSchemaVersion === ARSENAL_PAYLOAD_SCHEMA_VERSION)
    .slice()
    .sort((a, b) =>
      b.useCount - a.useCount
      || a.name.localeCompare(b.name, 'pt-BR')
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, maxEntries)
    .map((preset) => ({
      id: preset.id,
      name: preset.name,
      category: preset.category,
      kind: preset.kind,
      tags: preset.tags.slice(0, maxTags),
    }));
  while (entries.length > 0 && JSON.stringify(entries).length > maxChars) entries.pop();
  return entries;
}

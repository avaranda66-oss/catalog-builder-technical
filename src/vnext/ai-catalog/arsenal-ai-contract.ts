/**
 * Onda 4.5 — what the AI of the assistant knows about the arsenal (ADR-arsenal §7), as a pure contract shared by the
 * Edge Function (vnext-catalog-composer), the probes and the browser.
 *
 * - The request of `edit_intent` and `compose_scaffold` may carry `arsenal`: a SHORT index of saved presets
 *   (ref, name, category, kind, a few tags). Never payloads, never ids of the database: refs `a1`, `a2`… are local to
 *   one request, as `o1`/`p1` are in the outline, so a UUID costs no tokens and cannot be invented. The browser keeps
 *   the map back to the preset ids.
 * - The reply may be `use_preset {status, preset: ref, summary?}`: "use the saved one". The server checks that the
 *   ref was in the request; the browser checks it again against its own map and that the preset still exists.
 *   Using a preset is then ZERO AI: typed editor actions with one Desfazer.
 * - The flexibility policy (layout and style use sensible defaults, technical values stay blocked) is
 *   LAYOUT_DEFAULTS_POLICY of edit-intent-contract.ts, used by both prompts.
 *
 * Rules (as edit-intent-contract.ts): no imports; only erasable TypeScript; never log prompts or model text.
 */
type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => !!value && typeof value === 'object' && !Array.isArray(value);
const keysOf = (value: Obj) => Object.keys(value).sort().join('|');
const hasControl = (value: string) => [...value].some(character => {
  const code = character.charCodeAt(0);
  return code < 32 || code === 127;
});
const line = (value: unknown, max: number, min = 1): value is string => typeof value === 'string'
  && value.trim().length >= min && value.length <= max && value.trim() === value && !hasControl(value);

/** Same values as ARSENAL_CATEGORIES / ARSENAL_PRESET_KINDS of src/vnext/arsenal/contracts.ts (a test compares them). */
export const ARSENAL_AI_CATEGORIES = ['capas', 'tabelas', 'cabecalhos', 'rodapes', 'paginas', 'estilos'] as const;
export type ArsenalAiCategory = typeof ARSENAL_AI_CATEGORIES[number];
export const ARSENAL_AI_KINDS = ['page', 'block', 'table', 'style'] as const;
export type ArsenalAiKind = typeof ARSENAL_AI_KINDS[number];

/**
 * Small on purpose: the outline of the open page already takes most of the 6 000-token input ceiling, so the index
 * gets about 800 tokens. Most used presets come first (buildArsenalCompactIndex), so the cut keeps the useful ones.
 */
export const ARSENAL_AI_LIMITS = Object.freeze({
  entries: 30,
  nameChars: 80,
  tags: 3,
  tagChars: 32,
  /** `JSON.stringify(index).length` the server accepts. */
  indexChars: 2_400,
  summaryChars: 220,
});

export const ARSENAL_AI_REF = /^a\d{1,3}$/;

export interface ArsenalAiIndexEntry {
  readonly ref: string;
  readonly name: string;
  readonly category: ArsenalAiCategory;
  readonly kind: ArsenalAiKind;
  readonly tags: readonly string[];
}

/** Strict parser of the `arsenal` field of a request (exact keys, bounded sizes, unique refs). null = reject. */
export function parseArsenalAiIndex(value: unknown): ArsenalAiIndexEntry[] | null {
  if (!Array.isArray(value) || value.length > ARSENAL_AI_LIMITS.entries) return null;
  if (JSON.stringify(value).length > ARSENAL_AI_LIMITS.indexChars) return null;
  const refs = new Set<string>();
  const entries: ArsenalAiIndexEntry[] = [];
  for (const raw of value) {
    if (!isObj(raw) || keysOf(raw) !== 'category|kind|name|ref|tags') return null;
    if (typeof raw.ref !== 'string' || !ARSENAL_AI_REF.test(raw.ref) || refs.has(raw.ref)) return null;
    if (!line(raw.name, ARSENAL_AI_LIMITS.nameChars)) return null;
    if (!(ARSENAL_AI_CATEGORIES as readonly string[]).includes(String(raw.category))) return null;
    if (!(ARSENAL_AI_KINDS as readonly string[]).includes(String(raw.kind))) return null;
    if (!Array.isArray(raw.tags) || raw.tags.length > ARSENAL_AI_LIMITS.tags ||
      raw.tags.some(tag => !line(tag, ARSENAL_AI_LIMITS.tagChars))) return null;
    refs.add(raw.ref);
    entries.push({ ref: raw.ref, name: raw.name, category: raw.category as ArsenalAiCategory,
      kind: raw.kind as ArsenalAiKind, tags: [...raw.tags as string[]] });
  }
  return entries;
}

/* ------------------------------------------------------------------------------------------------ */
/* Prompts                                                                                          */
/* ------------------------------------------------------------------------------------------------ */

export const ARSENAL_AI_RULE =
  'arsenal lists presets the team saved (ref a1..., name, category, kind, tags): covers, tables, headers, footers, pages ' +
  'and styles. When the user asks to insert, put or use something that ONE preset clearly matches by name, category or tags ' +
  '(for example "the standard header", "that specifications table"), answer use_preset {status, preset, summary} with its ref ' +
  'instead of building it: a preset brings its own layout and needs no values. A request for ONE page, table, header, footer ' +
  'or style of a kind a preset provides is a clear match even in other words ("página de acessórios" -> a page preset about ' +
  'acessórios); a request for several pages or with text to write is not. Use only refs listed in arsenal, never invent ' +
  'one. If no preset clearly matches, ignore arsenal and answer as usual (never refuse because of it). ' +
  'summary is ONE short sentence in the language of ' +
  'the user request, naming the preset by its name (never by ref).';

/* ------------------------------------------------------------------------------------------------ */
/* Reply                                                                                            */
/* ------------------------------------------------------------------------------------------------ */

export interface ArsenalPresetChoice {
  readonly status: 'use_preset';
  readonly preset: string;
  readonly summary?: string;
}

type Schema = { type: string; properties: Record<string, unknown>; propertyOrdering?: string[]; required?: string[] } & Obj;

/**
 * The response schema of a task, plus the `use_preset` branch: one more status and one `preset` field.
 * `preset` is an ENUM of the refs actually sent (a1…aN): the model cannot write any other ref, and the decoding grammar
 * stays small. A free STRING (maxLength 5) made Gemini refuse the edit_intent schema with a bare HTTP 400 "Request
 * contains an invalid argument" (real probe 2026-10-23: too many states next to the 40 intents); the enum of 30 refs is
 * accepted. Without refs (older callers) the bounded STRING stays, which the compose schema accepts.
 */
export function withArsenalChoice<T extends Schema>(schema: T, refs: readonly string[] = []): T {
  const properties = schema.properties as Record<string, Obj>;
  const status = properties.status as { type: string; enum: string[] };
  const ordering = schema.propertyOrdering ?? Object.keys(properties);
  return {
    ...schema,
    propertyOrdering: [ordering[0], 'preset', ...ordering.slice(1), ...(properties.summary ? [] : ['summary'])],
    properties: {
      ...properties,
      status: { ...status, enum: [...status.enum, 'use_preset'] },
      preset: refs.length ? { type: 'STRING', enum: [...refs] } : { type: 'STRING', maxLength: 5 },
      ...(properties.summary ? {} : { summary: { type: 'STRING', maxLength: ARSENAL_AI_LIMITS.summaryChars } }),
    },
  };
}

/**
 * Lenient-before-strict for the `use_preset` branch: drops the keys of the other branches and blank text. On the
 * OTHER branches a leftover `preset` is dropped: with the enum of refs the model sometimes fills it next to a
 * proposal (real probe 2026-10-23: {"status":"proposal","preset":"a5",…}), and it carries no action there.
 */
export function normalizeArsenalChoice(raw: unknown): unknown {
  if (isObj(raw) && raw.status !== 'use_preset' && 'preset' in raw) {
    const { preset: _leftover, ...rest } = raw;
    return rest;
  }
  if (!isObj(raw) || raw.status !== 'use_preset') return raw;
  const next: Obj = { ...raw };
  // Keys of the other branches carry no action here; a non-empty list of intents or pages stays and is rejected.
  for (const key of ['question', 'reason', 'language', 'version']) delete next[key];
  for (const key of ['intents', 'pages']) if (Array.isArray(next[key]) && (next[key] as unknown[]).length === 0) delete next[key];
  if (typeof next.summary === 'string') next.summary = next.summary.replace(/\s+/g, ' ').trim();
  if (next.summary === '' || next.summary === null || next.summary === undefined) delete next.summary;
  if (typeof next.preset === 'string') next.preset = next.preset.trim().toLowerCase();
  return next;
}

/**
 * Strict check of a `use_preset` reply against the index the request carried: exact keys, a ref that was sent.
 * null = the reply is not usable (no index sent, unknown ref, extra keys).
 */
export function verifyArsenalChoice(value: unknown, index: readonly ArsenalAiIndexEntry[] | undefined): ArsenalPresetChoice | null {
  if (!index?.length || !isObj(value) || value.status !== 'use_preset') return null;
  if (!['preset|status', 'preset|status|summary'].includes(keysOf(value))) return null;
  if (typeof value.preset !== 'string' || !ARSENAL_AI_REF.test(value.preset)) return null;
  if (!index.some(entry => entry.ref === value.preset)) return null;
  if ('summary' in value && !line(value.summary, ARSENAL_AI_LIMITS.summaryChars + 40, 6)) return null;
  return { status: 'use_preset', preset: value.preset, ...(typeof value.summary === 'string' ? { summary: value.summary } : {}) };
}

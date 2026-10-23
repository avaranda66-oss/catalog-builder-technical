import type { DocumentSession } from '../../../application';
import { walkPageObjects } from '../../../domain';
import type { AssetRef, EditorialObject } from '../../../domain';
import {
  ARSENAL_CATEGORIES,
  ARSENAL_CATEGORY_LABELS,
  ARSENAL_STYLE_OBJECT_TYPES,
  isArsenalPayloadVersionSupported,
  normalizeArsenalSearchText,
  type ArsenalCaptureService,
  type ArsenalCaptureSource,
  type ArsenalCategory,
  type ArsenalInsertFailure,
  type ArsenalInsertionPort,
  type ArsenalInsertionService,
  type ArsenalInsertTarget,
  type ArsenalPayload,
  type ArsenalPreset,
  type ArsenalPresetSummary,
  type ArsenalPreviewBuilder,
  type ArsenalRepository,
  type ArsenalRepositoryErrorCode,
  type ArsenalStyleTarget,
  type ArsenalTeamOrigin,
  type ArsenalViewer,
} from '../../../arsenal';
import type { ArsenalService } from '../../../arsenal/service';

/**
 * Onda 4.5 — what the editor needs to show the "Arsenal" (ADR-arsenal). The app builds it once (Supabase repository,
 * capture and insertion services, the person's role); tests pass doubles. Using a preset never calls the AI: it is
 * typed editor actions through `insertion`, with one Desfazer.
 */
export interface ArsenalEditorRuntime {
  readonly repository: ArsenalRepository;
  readonly insertion: ArsenalInsertionService;
  readonly capture: ArsenalCaptureService;
  /** Who is looking: decides who sees Renomear/Apagar (the database decides for real). */
  readonly viewer: ArsenalViewer;
  /** Picture of each card. Default: `buildArsenalPreview` (arsenal-preview.ts). */
  readonly previewBuilder?: ArsenalPreviewBuilder;
  /**
   * Whether an image of a preset can still be loaded, for the insertion. Without it every image of a preset enters
   * as the "Foto a escolher (A COMPLETAR)" frame (never a reference to an image that may not load).
   */
  readonly isAssetAvailable?: (asset: AssetRef) => Promise<boolean>;
  /** Image addresses for the cards (images of other catalogs). The open catalog's own images are always used. */
  readonly previewAssetUrls?: ReadonlyMap<string, string>;
  /** UUID generator (tests). Default: `crypto.randomUUID`. */
  readonly createId?: () => string;
  /**
   * The list the assistant reads (one list, local search, no network per request). Built over `repository` when
   * absent (`createArsenalEditorRuntime` always gives one).
   */
  readonly service?: ArsenalService;
}

export function arsenalRandomId(runtime: Pick<ArsenalEditorRuntime, 'createId'>): string {
  if (runtime.createId) return runtime.createId();
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

/** The editor session seen by the insertion service (zero AI, one transaction id per insertion). */
export function createSessionInsertionPort(
  session: Pick<DocumentSession, 'getSnapshot' | 'execute' | 'undo'>,
  runtime: Pick<ArsenalEditorRuntime, 'isAssetAvailable' | 'createId'>,
): ArsenalInsertionPort {
  return {
    getDocument: () => session.getSnapshot().document,
    execute: (action, context) => session.execute(action, context),
    undo: () => session.undo(),
    isAssetAvailable: runtime.isAssetAvailable ?? (async () => false),
    createTransactionId: () => `arsenal:${arsenalRandomId(runtime)}`,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Words on the cards
// ---------------------------------------------------------------------------------------------------------------

export type ArsenalOriginBadge = 'PRESYS' | 'IA' | 'Você' | 'Equipe';

/** "origem (você/IA/PRESYS)": a built-in, a preset the AI proposed, mine, or someone else's. */
export function arsenalOriginBadge(preset: Pick<ArsenalPresetSummary, 'origin' | 'createdBy'>, viewer: ArsenalViewer): ArsenalOriginBadge {
  if (preset.origin === 'builtin') return 'PRESYS';
  if (preset.origin === 'ai') return 'IA';
  return preset.createdBy !== null && preset.createdBy === viewer.userId ? 'Você' : 'Equipe';
}

/** Who saved it, in plain words. */
export function arsenalAuthorLabel(
  preset: Pick<ArsenalPresetSummary, 'origin' | 'createdBy' | 'createdByName'>,
  viewer: ArsenalViewer,
): string {
  if (preset.origin === 'builtin') return 'Modelo PRESYS';
  const mine = preset.createdBy !== null && preset.createdBy === viewer.userId;
  const who = mine ? 'você' : preset.createdByName ?? 'alguém da equipe';
  return preset.origin === 'ai' ? `Sugerido pela IA, guardado por ${who}` : `Guardado por ${who}`;
}

export function arsenalUsageLabel(useCount: number): string {
  return useCount > 0 ? `Usado ${useCount}×` : 'Ainda não usado';
}

/** Gallery order: category order, then the most used, then by name (pt-BR). */
export function sortArsenalSummaries<T extends Pick<ArsenalPresetSummary, 'category' | 'useCount' | 'name' | 'id'>>(presets: readonly T[]): T[] {
  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
  return [...presets].sort((a, b) =>
    ARSENAL_CATEGORIES.indexOf(a.category) - ARSENAL_CATEGORIES.indexOf(b.category)
    || b.useCount - a.useCount
    || collator.compare(a.name, b.name)
    || a.id.localeCompare(b.id));
}

export function arsenalCategoryCounts(presets: readonly Pick<ArsenalPresetSummary, 'category'>[]): Record<ArsenalCategory, number> {
  const counts = Object.fromEntries(ARSENAL_CATEGORIES.map((category) => [category, 0])) as Record<ArsenalCategory, number>;
  for (const preset of presets) counts[preset.category] += 1;
  return counts;
}

export function arsenalPresetCanBeInserted(preset: Pick<ArsenalPresetSummary, 'payloadSchemaVersion'>): boolean {
  return isArsenalPayloadVersionSupported(preset);
}

// ---------------------------------------------------------------------------------------------------------------
// Where "Usar" puts a preset
// ---------------------------------------------------------------------------------------------------------------

const STYLE_TARGET_WORDS: Readonly<Record<ArsenalStyleTarget, string>> = Object.freeze({
  text: 'um texto',
  shape: 'uma forma',
  polygon: 'um polígono',
  line: 'uma linha',
  table: 'uma tabela',
});

export interface ArsenalUseContext {
  readonly pageId: string;
  /** The objects selected on the current page (top level). */
  readonly selectedObjects: readonly Pick<EditorialObject, 'id' | 'type' | 'locked'>[];
}

export type ArsenalTargetChoice =
  | { readonly ok: true; readonly target: ArsenalInsertTarget }
  | { readonly ok: false; readonly message: string };

/**
 * Pages enter after the current page; blocks go back to where they were captured (headers and footers); tables go
 * to the top of the free area of the current page; a style needs one selected object of the matching type.
 */
export function arsenalTargetFor(preset: Pick<ArsenalPreset, 'kind' | 'payload'>, context: ArsenalUseContext): ArsenalTargetChoice {
  const { payload } = preset;
  if (payload.kind === 'page') return { ok: true, target: { kind: 'new-page', afterPageId: context.pageId } };
  if (payload.kind === 'block') return { ok: true, target: { kind: 'page', pageId: context.pageId, placement: 'original' } };
  if (payload.kind === 'table') return { ok: true, target: { kind: 'page', pageId: context.pageId } };
  const wanted = ARSENAL_STYLE_OBJECT_TYPES[payload.style.target];
  const words = STYLE_TARGET_WORDS[payload.style.target];
  const [only, ...rest] = context.selectedObjects;
  if (!only || rest.length > 0 || only.type !== wanted) {
    return { ok: false, message: `Para usar este estilo, selecione ${words} na página e clique em Usar de novo.` };
  }
  if (only.locked) return { ok: false, message: 'O objeto selecionado está travado. Destrave-o para mudar a aparência.' };
  return { ok: true, target: { kind: 'object', objectId: only.id } };
}

/** The style target of a loaded style preset (cards say "Estilo de texto", "Estilo de tabela"…). */
export function arsenalStyleTargetOf(payload: ArsenalPayload | undefined): ArsenalStyleTarget | undefined {
  return payload?.kind === 'style' ? payload.style.target : undefined;
}

export function arsenalStyleNeedsWords(target: ArsenalStyleTarget): string {
  return STYLE_TARGET_WORDS[target];
}

/** "entrou … sem usar IA": the message after a successful "Usar". */
export function arsenalInsertedMessage(
  preset: Pick<ArsenalPreset, 'name' | 'kind'>,
  where: { readonly pageNumber?: number; readonly placeholders: number },
): string {
  const place = preset.kind === 'page'
    ? 'como página nova'
    : preset.kind === 'style'
      ? 'no objeto selecionado'
      : where.pageNumber ? `na página ${where.pageNumber}` : 'na página atual';
  const photos = where.placeholders === 0 ? ''
    : where.placeholders === 1
      ? ' Uma foto ficou como “Foto a escolher (A COMPLETAR)”: troque-a antes de publicar.'
      : ` ${where.placeholders} fotos ficaram como “Foto a escolher (A COMPLETAR)”: troque-as antes de publicar.`;
  return `“${preset.name}” entrou ${place} sem usar IA. Para voltar, use Desfazer.${photos}`;
}

export function arsenalInsertFailureMessage(failure: ArsenalInsertFailure): string {
  switch (failure.error.code) {
    case 'UNSUPPORTED_VERSION':
      return 'Este modelo foi guardado por uma versão mais nova do app. Atualize a página (F5) para usá-lo.';
    case 'TARGET_INVALID':
    case 'TARGET_NOT_FOUND':
      return 'A página ou o objeto escolhido mudou. Selecione de novo e clique em Usar. Nada foi alterado.';
    case 'INVALID_PRESET':
      return 'Este modelo está com defeito e não pode ser usado. Nada foi alterado.';
    case 'ACTION_FAILED':
    default:
      return 'Não foi possível usar o modelo. Nada foi alterado.';
  }
}

export function arsenalRepositoryErrorMessage(code: ArsenalRepositoryErrorCode, doing: 'listar' | 'abrir' | 'guardar' | 'renomear' | 'apagar'): string {
  switch (code) {
    case 'OFFLINE':
      return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
    case 'UNAUTHORIZED':
      return 'Sua conta não pode usar o arsenal. Fale com o administrador.';
    case 'FORBIDDEN':
      return 'Só quem guardou este modelo (ou um administrador) pode mudá-lo.';
    case 'READ_ONLY':
      return 'Os modelos PRESYS não podem ser renomeados nem apagados.';
    case 'NOT_FOUND':
      return 'Este modelo não está mais no arsenal. A lista foi atualizada.';
    case 'CONFLICT':
      return 'Alguém mudou este modelo agora há pouco. A lista foi atualizada: tente de novo.';
    case 'TOO_LARGE':
      return 'É grande demais para o arsenal (mais de 400 objetos ou de 768 KB). Guarde uma parte menor.';
    case 'AMBIGUOUS_COMMIT_OUTCOME':
      return doing === 'guardar'
        ? 'Não deu para confirmar se foi guardado. Clique em Guardar de novo: não fica repetido.'
        : 'Não deu para confirmar a mudança. Tente de novo.';
    case 'INVALID_PRESET':
    case 'UNSUPPORTED_VERSION':
      return 'O arsenal não aceitou este conteúdo. Nada foi guardado.';
    default:
      return doing === 'listar'
        ? 'Não foi possível abrir o arsenal agora. Tente de novo.'
        : `Não foi possível ${doing} agora. Tente de novo.`;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// "Guardar no arsenal"
// ---------------------------------------------------------------------------------------------------------------

/** What the save dialog captures, and from where it was asked. */
export interface ArsenalSaveRequest {
  readonly source: ArsenalCaptureSource;
  /** When one text/shape/polygon/line/table is the source, the dialog also offers "Só a aparência". */
  readonly styleObjectId?: string;
  /** `ai` when the assistant proposed it and the person confirms here. */
  readonly origin?: ArsenalTeamOrigin;
  readonly suggestedName?: string;
  readonly suggestedCategory?: ArsenalCategory;
}

const STYLE_SOURCE_TYPES = new Set<EditorialObject['type']>(Object.values(ARSENAL_STYLE_OBJECT_TYPES));

/** "Guardar no arsenal…" of the selection: one table → table preset; anything else → block of objects. */
export function arsenalSaveRequestForSelection(
  pageId: string,
  selected: readonly Pick<EditorialObject, 'id' | 'type'>[],
): ArsenalSaveRequest | undefined {
  if (selected.length === 0) return undefined;
  const only = selected.length === 1 ? selected[0] : undefined;
  if (only?.type === 'table') return { source: { kind: 'table', objectId: only.id }, styleObjectId: only.id };
  return {
    source: { kind: 'objects', pageId, objectIds: selected.map((object) => object.id) },
    ...(only && STYLE_SOURCE_TYPES.has(only.type) ? { styleObjectId: only.id } : {}),
  };
}

/** Whether a payload carries tables (the dialog warns that values stay out). */
export function arsenalPayloadHasTables(payload: ArsenalPayload): boolean {
  if (payload.kind === 'table') return true;
  if (payload.kind === 'style') return false;
  const page = { id: 'arsenal:tables', widthMm: 210 as const, heightMm: 297 as const, objects: payload.objects };
  return walkPageObjects(page).some(({ object }) => object.type === 'table');
}

/** "azul, PCON ,  azul" → ["azul", "PCON"] (accents and capitals do not make a new tag). */
export function parseArsenalTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const tag = raw.replace(/\s+/g, ' ').trim();
    if (!tag) continue;
    const key = normalizeArsenalSearchText(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export function arsenalCategoryLabel(category: ArsenalCategory): string {
  return ARSENAL_CATEGORY_LABELS[category];
}

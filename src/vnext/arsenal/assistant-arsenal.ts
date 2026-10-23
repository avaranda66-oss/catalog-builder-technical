import type { ReactNode } from 'react';
import type { DocumentSession } from '../application';
import type { AssetRef, CatalogDocument } from '../domain/editorial-model';
import { ARSENAL_AI_LIMITS, type ArsenalAiIndexEntry } from '../ai-catalog/arsenal-ai-contract';
import {
  ARSENAL_CATEGORY_LABELS, ARSENAL_PAYLOAD_SCHEMA_VERSION, buildArsenalCompactIndex, parseArsenalPresetDraft,
  type ArsenalPreset, type ArsenalPresetSummary,
} from './contracts';
import type { ArsenalRepository, ArsenalRepositoryErrorCode } from './repository';
import {
  ARSENAL_STYLE_OBJECT_TYPES, type ArsenalInsertionPort, type ArsenalInsertionService, type ArsenalInsertResult,
  type ArsenalInsertTarget,
} from './insertion';
import type { ArsenalCaptureService } from './capture';

/**
 * Onda 4.5 — the arsenal as the assistant uses it: what it lists, how it uses a preset (zero AI, one Desfazer) and how
 * it keeps something the AI built ("Guardar no arsenal?"). The editor builds it from the persistence, insertion and
 * capture services (`createAssistantArsenal`) and hands it to `CatalogNativeComposer`; tests hand a fake.
 */

export interface AssistantArsenalUseContext {
  readonly session: DocumentSession;
  readonly activePageId?: string;
  readonly selectedObjectIds: readonly string[];
}

export type AssistantArsenalUseResult =
  | {
    readonly ok: true; readonly text: string; readonly pageId: string; readonly objectIds: readonly string[]; readonly newPage: boolean;
    /** Nothing changed (a style already applied): the chat offers no Desfazer, which would undo the change before. */
    readonly unchanged?: true;
  }
  | { readonly ok: false; readonly text: string };

/** "Guardar no arsenal?" after the AI built a page: the person confirmed the name and the category. */
export interface AssistantArsenalSaveRequest {
  readonly document: CatalogDocument;
  readonly pageId: string;
  readonly name: string;
  readonly category: 'capas' | 'paginas';
}

export type AssistantArsenalSaveResult =
  | { readonly ok: true; readonly text: string; readonly presetId: string }
  | { readonly ok: false; readonly text: string };

export interface AssistantArsenal {
  /** Presets the person can see now (team + built-in), without payloads. */
  readonly presets: readonly ArsenalPresetSummary[];
  /** Loads the preset, inserts it with the insertion service and records the use. Never calls the AI. */
  use(presetId: string, context: AssistantArsenalUseContext): Promise<AssistantArsenalUseResult>;
  /** Absent: the assistant does not offer "Guardar no arsenal?". */
  save?(request: AssistantArsenalSaveRequest): Promise<AssistantArsenalSaveResult>;
  /** "Ver outros" → the gallery of the arsenal, already filtered by these words. */
  openGallery?(query: string): void;
  /** The live thumbnail of a preset for the cards (the gallery's PageThumbnail). */
  renderThumbnail?(preset: ArsenalPresetSummary): ReactNode;
}

// ---------------------------------------------------------------------------------------------------------------
// What the AI reads
// ---------------------------------------------------------------------------------------------------------------

export interface AssistantArsenalAiIndex {
  readonly entries: readonly ArsenalAiIndexEntry[];
  /** The preset behind a ref of this index, or undefined (unknown ref: the reply is not used). */
  presetIdOf(ref: string): string | undefined;
}

/**
 * The short index of the arsenal sent with an AI request, with local refs a1, a2… instead of ids, cut to
 * ARSENAL_AI_LIMITS. Never payloads.
 *
 * Order: every category takes turns, each with its most used presets first (buildArsenalCompactIndex). With 34
 * presets and the 2 400-character cap, a plain "most used, then by name" list dropped whole categories (all the
 * footers and the PRESYS header began with late letters — real probe 2026-10-23: the AI could not offer "Rodapé com
 * site"). When it is still too long, tags go first (3 → 1), then the last entries.
 */
export function buildAssistantArsenalAiIndex(presets: readonly ArsenalPresetSummary[]): AssistantArsenalAiIndex {
  const sorted = buildArsenalCompactIndex(presets, {
    maxEntries: Number.MAX_SAFE_INTEGER, maxTagsPerEntry: ARSENAL_AI_LIMITS.tags, maxChars: Number.MAX_SAFE_INTEGER,
  });
  const byCategory = new Map<string, typeof sorted>();
  for (const entry of sorted) byCategory.set(entry.category, [...(byCategory.get(entry.category) ?? []), entry]);
  const queues = [...byCategory.values()];
  const compact: typeof sorted = [];
  while (compact.length < ARSENAL_AI_LIMITS.entries && queues.some(queue => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && compact.length < ARSENAL_AI_LIMITS.entries) compact.push(next);
    }
  }
  const entriesWith = (tags: number): ArsenalAiIndexEntry[] => compact.map((entry, index) => ({
    ref: `a${index + 1}`, name: entry.name, category: entry.category, kind: entry.kind,
    tags: entry.tags.filter(tag => tag.length <= ARSENAL_AI_LIMITS.tagChars).slice(0, tags),
  }));
  // Tags help the AI (“padrão”, “site”) but cost more than a name: down to one tag, then the last entries go (every
  // category keeps its most used ones, thanks to the turns above).
  let tags = ARSENAL_AI_LIMITS.tags;
  let entries = entriesWith(tags);
  while (tags > 1 && JSON.stringify(entries).length > ARSENAL_AI_LIMITS.indexChars) entries = entriesWith(--tags);
  while (entries.length > 0 && JSON.stringify(entries).length > ARSENAL_AI_LIMITS.indexChars) entries.pop();
  const ids = new Map(entries.map((entry, index) => [entry.ref, compact[index].id]));
  return { entries, presetIdOf: ref => ids.get(ref) };
}

// ---------------------------------------------------------------------------------------------------------------
// Using and saving
// ---------------------------------------------------------------------------------------------------------------

export interface AssistantArsenalDependencies {
  readonly repository: ArsenalRepository;
  readonly insertion: ArsenalInsertionService;
  readonly capture?: ArsenalCaptureService;
  readonly presets: readonly ArsenalPresetSummary[];
  /** False when an image of the preset cannot be loaded any more (it becomes the "Foto a escolher" frame). */
  readonly isAssetAvailable: (asset: AssetRef) => Promise<boolean>;
  /** UUIDs for transactions, new presets and mutations. */
  readonly createId?: () => string;
  readonly openGallery?: (query: string) => void;
  readonly renderThumbnail?: (preset: ArsenalPresetSummary) => ReactNode;
}

const REPOSITORY_TEXT: Partial<Record<ArsenalRepositoryErrorCode, string>> = {
  OFFLINE: 'Sem conexão com o arsenal agora. Tente de novo em instantes.',
  UNAUTHORIZED: 'Só administradores e editores usam o arsenal.',
  NOT_FOUND: 'Este modelo não está mais no arsenal.',
  UNSUPPORTED_VERSION: 'Este modelo foi guardado por uma versão mais nova do app. Atualize a página para usar.',
  TOO_LARGE: 'Esta página é grande demais para o arsenal.',
  INVALID_PRESET: 'Não deu para guardar: o conteúdo não passou na conferência.',
  FORBIDDEN: 'Só o autor ou um administrador pode mudar este modelo.',
};
const repositoryText = (code: ArsenalRepositoryErrorCode) =>
  REPOSITORY_TEXT[code] ?? 'O arsenal não respondeu. Tente de novo em instantes.';

const STYLE_OBJECT_WORDS: Readonly<Record<string, string>> = {
  text: 'um texto', shape: 'uma forma', polygon: 'uma forma', line: 'uma linha', table: 'uma tabela',
};

function targetFor(preset: ArsenalPreset, context: AssistantArsenalUseContext): ArsenalInsertTarget | { readonly error: string } {
  const document = context.session.getSnapshot().document;
  const pageId = document.pages.some(page => page.id === context.activePageId) ? context.activePageId! : document.pages.at(-1)?.id;
  if (!pageId) return { error: 'Não encontrei a página aberta.' };
  switch (preset.payload.kind) {
    case 'page': return { kind: 'new-page', afterPageId: pageId };
    case 'block': return { kind: 'page', pageId, placement: 'original' };
    case 'table': return { kind: 'page', pageId };
    case 'style': {
      const type = ARSENAL_STYLE_OBJECT_TYPES[preset.payload.style.target];
      const objects = document.pages.flatMap(page => page.objects.flatMap(object => object.type === 'group' ? [object, ...object.objects] : [object]));
      const selected = context.selectedObjectIds.map(id => objects.find(object => object.id === id)).filter(Boolean);
      if (selected.length !== 1 || selected[0]!.type !== type) {
        return { error: `Este estilo vale para ${STYLE_OBJECT_WORDS[type] ?? 'um objeto'}. Selecione ${STYLE_OBJECT_WORDS[type] ?? 'o objeto'} na página e peça de novo.` };
      }
      return { kind: 'object', objectId: selected[0]!.id };
    }
  }
}

function usedText(preset: ArsenalPreset, result: Extract<ArsenalInsertResult, { ok: true }>, document: CatalogDocument): string {
  const number = document.pages.findIndex(page => page.id === result.pageId) + 1;
  const where = preset.payload.kind === 'page' ? `: página nova (página ${number})`
    : preset.payload.kind === 'style' ? '' : ` na página ${number}`;
  const verb = preset.payload.kind === 'style' ? `Apliquei o estilo “${preset.name}”` : `Usei “${preset.name}” do arsenal`;
  const values = preset.payload.kind !== 'style' && preset.payload.tableValues === 'structure-only'
    && (preset.payload.kind === 'table' || JSON.stringify(preset.payload.objects).includes('"type":"table"'))
    ? ' As células da tabela vêm vazias: os valores vêm do PDF ou da planilha.' : '';
  const photos = result.placeholders.length
    ? ` ${result.placeholders.length === 1 ? 'Uma foto não carregou e virou' : `${result.placeholders.length} fotos não carregaram e viraram`} a moldura “Foto a escolher”.`
    : '';
  return `${verb}${where}, sem usar IA.${values}${photos} Um Desfazer volta tudo.`;
}

const INSERT_TEXT: Record<string, string> = {
  UNSUPPORTED_VERSION: 'Este modelo foi guardado por uma versão mais nova do app. Atualize a página para usar.',
  TARGET_INVALID: 'Este modelo não serve para o que está selecionado.',
  TARGET_NOT_FOUND: 'Não encontrei a página ou o objeto onde pôr o modelo.',
};

/** The arsenal of the assistant over the real services. */
export function createAssistantArsenal(deps: AssistantArsenalDependencies): AssistantArsenal {
  const createId = deps.createId ?? (() => crypto.randomUUID());
  return {
    presets: deps.presets,
    openGallery: deps.openGallery,
    renderThumbnail: deps.renderThumbnail,
    async use(presetId, context) {
      const loaded = await deps.repository.getMany([presetId]);
      if (!loaded.ok) return { ok: false, text: repositoryText(loaded.error.code) + ' Nada foi mudado.' };
      const preset = loaded.value[0];
      if (!preset) return { ok: false, text: repositoryText('NOT_FOUND') + ' Nada foi mudado.' };
      const target = targetFor(preset, context);
      if ('error' in target) return { ok: false, text: target.error + ' Nada foi mudado.' };
      const { session } = context;
      const port: ArsenalInsertionPort = {
        getDocument: () => session.getSnapshot().document,
        execute: (action, executionContext) => session.execute(action, executionContext),
        undo: () => session.undo(),
        isAssetAvailable: deps.isAssetAvailable,
        createTransactionId: createId,
      };
      const result = await deps.insertion.insert({ preset, target }, port);
      if (!result.ok) {
        return { ok: false, text: (INSERT_TEXT[result.error.code] ?? 'Não deu para usar este modelo sem estragar a página.') + ' Nada foi mudado.' };
      }
      if (result.unchanged) {
        return { ok: true, unchanged: true, pageId: result.pageId, objectIds: result.objectIds, newPage: false,
          text: preset.payload.kind === 'style'
            ? `O objeto já estava com o estilo “${preset.name}”. Nada mudou.`
            : `“${preset.name}” não mudou nada na página.` };
      }
      // Counting the use never blocks the insertion that already happened.
      try { await deps.repository.recordUse(presetId); } catch { /* the use count is best effort */ }
      return { ok: true, text: usedText(preset, result, session.getSnapshot().document), pageId: result.pageId,
        objectIds: result.objectIds, newPage: target.kind === 'new-page' };
    },
    ...(deps.capture ? {
      async save(request: AssistantArsenalSaveRequest): Promise<AssistantArsenalSaveResult> {
        const name = request.name.trim();
        if (!name) return { ok: false, text: 'Escreva um nome para guardar no arsenal.' };
        const captured = deps.capture!.capture({ document: request.document, source: { kind: 'page', pageId: request.pageId }, origin: 'ai' });
        if (!captured.ok) {
          return { ok: false, text: captured.error.code === 'TOO_LARGE' ? repositoryText('TOO_LARGE') : 'Não deu para guardar esta página no arsenal.' };
        }
        const draft = parseArsenalPresetDraft({
          kind: captured.content.kind, origin: 'ai', name, category: request.category, tags: [], synonyms: [],
          payloadSchemaVersion: ARSENAL_PAYLOAD_SCHEMA_VERSION, payload: captured.content.payload,
        });
        if (!draft.ok) return { ok: false, text: draft.code === 'TOO_LARGE' ? repositoryText('TOO_LARGE') : repositoryText('INVALID_PRESET') };
        const created = await deps.repository.create({ presetId: createId(), mutationId: createId(), draft: draft.value });
        if (!created.ok) return { ok: false, text: repositoryText(created.error.code) };
        return { ok: true, presetId: created.value.id,
          text: `Guardei “${created.value.name}” no arsenal, em ${ARSENAL_CATEGORY_LABELS[created.value.category]}. `
            + 'Toda a equipe já pode usar, sem gastar IA.' };
      },
    } : {}),
  };
}

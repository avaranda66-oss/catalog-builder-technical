import React from 'react';
import { Boxes, Pencil, Search, Trash2, X } from 'lucide-react';
import type { EditorialObject } from '../../../domain';
import {
  ARSENAL_CATEGORIES,
  ARSENAL_CATEGORY_LABELS,
  ARSENAL_KIND_LABELS,
  ARSENAL_LIMITS,
  arsenalPresetMatchesQuery,
  canManageArsenalPreset,
  type ArsenalCategory,
  type ArsenalInsertionPort,
  type ArsenalInsertSuccess,
  type ArsenalPreset,
  type ArsenalPresetSummary,
} from '../../../arsenal';
import { LibraryRowMenu } from '../LibraryRowMenu';
import type { PageThumbnailDocument } from '../PageThumbnail';
import { ArsenalModal } from './ArsenalModal';
import { ArsenalPresetThumbnail } from './ArsenalThumbnail';
import {
  arsenalAuthorLabel,
  arsenalCategoryCounts,
  arsenalInsertedMessage,
  arsenalInsertFailureMessage,
  arsenalOriginBadge,
  arsenalPresetCanBeInserted,
  arsenalRandomId,
  arsenalRepositoryErrorMessage,
  arsenalStyleNeedsWords,
  arsenalStyleTargetOf,
  arsenalTargetFor,
  arsenalUsageLabel,
  sortArsenalSummaries,
  type ArsenalEditorRuntime,
} from './arsenal-runtime';
import './Arsenal.css';

export const ARSENAL_PANEL_ID = 'vnext-arsenal';

export type ArsenalCategoryFilter = 'all' | ArsenalCategory;

export interface ArsenalInsertedEvent {
  readonly preset: ArsenalPreset;
  readonly result: ArsenalInsertSuccess;
  readonly message: string;
}

export interface ArsenalPanelProps {
  readonly open: boolean;
  readonly runtime: ArsenalEditorRuntime;
  /** The open catalog: its look for the pictures. */
  readonly document: PageThumbnailDocument;
  readonly assetUrls: ReadonlyMap<string, string>;
  /** Where "Usar" puts pages (after it), blocks and tables (on it). */
  readonly currentPageId: string;
  /** Selected objects of the current page (a style goes on the selected object). */
  readonly selectedObjects: readonly Pick<EditorialObject, 'id' | 'type' | 'locked'>[];
  readonly createPort: () => ArsenalInsertionPort;
  /** Ends an open text or cell edit first; false keeps everything as it is. */
  readonly prepare: () => boolean;
  /** Changes after something was saved in the arsenal, so the list is read again. */
  readonly refreshKey?: number;
  /** "Abrir o arsenal" from the assistant: these words go in the search (all categories). */
  readonly searchRequest?: { readonly serial: number; readonly query: string };
  readonly onInserted: (event: ArsenalInsertedEvent) => void;
  /** Every sentence for the person goes to the editor's one status line (one announcement). */
  readonly onMessage: (message: string) => void;
  readonly onClose: () => void;
}

type ListPhase = 'loading' | 'ready' | 'error';
const cacheKey = (preset: Pick<ArsenalPresetSummary, 'id' | 'revision'>) => `${preset.id}@${preset.revision}`;

/**
 * Onda 4.5 — the "Arsenal" panel: the team's saved covers, tables, headers, footers, pages and styles, each with a
 * live picture. "Usar" puts one in the open catalog with typed editor actions (one Desfazer, no AI). Renomear and
 * Apagar are offered only to the author or an admin; the PRESYS models are read-only and have no menu. It takes the
 * place of "Propriedades" in the right column, so the page stays usable (select a text, then use a style).
 */
export function ArsenalPanel({
  open, runtime, document, assetUrls, currentPageId, selectedObjects, createPort, prepare, refreshKey = 0,
  searchRequest, onInserted, onMessage, onClose,
}: ArsenalPanelProps) {
  const headingId = React.useId();
  const [mounted, setMounted] = React.useState(open);
  if (open && !mounted) setMounted(true);
  const [phase, setPhase] = React.useState<ListPhase>('loading');
  const [listProblem, setListProblem] = React.useState<string | null>(null);
  const [summaries, setSummaries] = React.useState<readonly ArsenalPresetSummary[]>([]);
  const [loaded, setLoaded] = React.useState<ReadonlyMap<string, ArsenalPreset>>(() => new Map());
  const [category, setCategory] = React.useState<ArsenalCategoryFilter>('all');
  const [query, setQuery] = React.useState(searchRequest?.query ?? '');
  const [searchSerial, setSearchSerial] = React.useState(searchRequest?.serial);
  if (searchRequest && searchRequest.serial !== searchSerial) {
    setSearchSerial(searchRequest.serial);
    setQuery(searchRequest.query);
    setCategory('all');
  }
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [lastMessage, setLastMessage] = React.useState<string | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<{ preset: ArsenalPresetSummary; trigger: HTMLElement | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<{ preset: ArsenalPresetSummary; trigger: HTMLElement | null } | null>(null);
  const panelRef = React.useRef<HTMLElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const loadSeq = React.useRef(0);
  const requested = React.useRef(new Set<string>());
  const busyRef = React.useRef<string | null>(null);
  const alive = React.useRef(true);
  React.useEffect(() => () => { alive.current = false; }, []);
  const live = React.useRef({ currentPageId, selectedObjects });
  live.current = { currentPageId, selectedObjects };

  const say = React.useCallback((message: string) => {
    setLastMessage(message);
    onMessage(message);
  }, [onMessage]);

  const reload = React.useCallback(async () => {
    const seq = ++loadSeq.current;
    setListProblem(null);
    let result;
    try {
      result = await runtime.repository.list();
    } catch {
      result = { ok: false as const, error: { code: 'REMOTE_FAILURE' as const } };
    }
    if (!alive.current || seq !== loadSeq.current) return;
    if (!result.ok) {
      setListProblem(arsenalRepositoryErrorMessage(result.error.code, 'listar'));
      setPhase((current) => (current === 'ready' ? 'ready' : 'error'));
      return;
    }
    setSummaries(sortArsenalSummaries(result.value));
    setPhase('ready');
  }, [runtime]);

  // The list is read when the panel opens and after something was saved.
  React.useEffect(() => {
    if (open) void reload();
  }, [open, refreshKey, reload]);

  // The pictures need the content: loaded in groups of 50, once per revision.
  React.useEffect(() => {
    if (!open) return;
    const wanted = summaries.filter((summary) => arsenalPresetCanBeInserted(summary) && !requested.current.has(cacheKey(summary)));
    if (wanted.length === 0) return;
    wanted.forEach((summary) => requested.current.add(cacheKey(summary)));
    for (let start = 0; start < wanted.length; start += ARSENAL_LIMITS.getManyMax) {
      const chunk = wanted.slice(start, start + ARSENAL_LIMITS.getManyMax);
      void runtime.repository.getMany(chunk.map((summary) => summary.id)).then((result) => {
        if (!alive.current) return;
        if (!result.ok) {
          chunk.forEach((summary) => requested.current.delete(cacheKey(summary)));
          return;
        }
        setLoaded((current) => {
          const next = new Map(current);
          for (const preset of result.value) next.set(cacheKey(preset), preset);
          return next;
        });
      }, () => chunk.forEach((summary) => requested.current.delete(cacheKey(summary))));
    }
  }, [open, runtime, summaries]);

  // Opening puts the cursor in the search; closing gives the focus back to what opened the panel.
  const wasOpen = React.useRef(false);
  React.useLayoutEffect(() => {
    const changed = open !== wasOpen.current;
    wasOpen.current = open;
    if (!changed) return;
    const root = globalThis.document;
    const active = root.activeElement;
    if (open) {
      opener.current = active instanceof HTMLElement && active !== root.body && !panelRef.current?.contains(active) ? active : null;
      searchRef.current?.focus({ preventScroll: true });
      return;
    }
    if (!panelRef.current?.contains(active) && active !== root.body) return;
    const back = opener.current;
    if (back?.isConnected && !back.closest('[hidden]')) back.focus();
    else root.querySelector<HTMLElement>('[data-editor-action="open-arsenal"]')?.focus();
  }, [open]);

  const counts = React.useMemo(() => arsenalCategoryCounts(summaries), [summaries]);
  const visible = React.useMemo(() => summaries.filter((summary) =>
    (category === 'all' || summary.category === category) && arsenalPresetMatchesQuery(summary, query)), [category, query, summaries]);
  const sections = React.useMemo(() => ARSENAL_CATEGORIES
    .map((entry) => ({ category: entry, presets: visible.filter((summary) => summary.category === entry) }))
    .filter((section) => section.presets.length > 0), [visible]);

  const presetFor = (summary: ArsenalPresetSummary) => loaded.get(cacheKey(summary));

  const use = async (summary: ArsenalPresetSummary) => {
    if (busyRef.current) return;
    if (!arsenalPresetCanBeInserted(summary)) {
      say('Este modelo foi guardado por uma versão mais nova do app. Atualize a página (F5) para usá-lo.');
      return;
    }
    if (!prepare()) return;
    busyRef.current = summary.id;
    setBusyId(summary.id);
    try {
      let preset = presetFor(summary);
      if (!preset) {
        const result = await runtime.repository.getMany([summary.id]);
        if (!result.ok) { say(arsenalRepositoryErrorMessage(result.error.code, 'abrir')); return; }
        preset = result.value[0];
        if (!preset) {
          say(arsenalRepositoryErrorMessage('NOT_FOUND', 'abrir'));
          void reload();
          return;
        }
        const found = preset;
        setLoaded((current) => new Map(current).set(cacheKey(found), found));
      }
      const choice = arsenalTargetFor(preset, { pageId: live.current.currentPageId, selectedObjects: live.current.selectedObjects });
      if (!choice.ok) { say(choice.message); return; }
      const port = createPort();
      const result = await runtime.insertion.insert({ preset, target: choice.target }, port);
      if (!alive.current) return;
      if (!result.ok) { say(arsenalInsertFailureMessage(result)); return; }
      const pageIndex = port.getDocument().pages.findIndex((page) => page.id === result.pageId);
      const message = arsenalInsertedMessage(preset, {
        pageNumber: pageIndex >= 0 ? pageIndex + 1 : undefined,
        placeholders: result.placeholders.length,
        unchanged: result.unchanged,
      });
      setLastMessage(message);
      onInserted({ preset, result, message });
      // Nothing changed (a style already applied): not a use, and nothing to undo.
      if (result.unchanged) return;
      const usedId = preset.id;
      void runtime.repository.recordUse(usedId).then((usage) => {
        if (!usage.ok || !alive.current) return;
        setSummaries((current) => current.map((entry) => entry.id === usedId
          ? { ...entry, useCount: usage.value.useCount, lastUsedAt: usage.value.lastUsedAt } : entry));
      }, () => undefined);
    } catch {
      say('Não foi possível usar o modelo. Nada foi alterado.');
    } finally {
      busyRef.current = null;
      if (alive.current) setBusyId(null);
    }
  };

  const filterButton = (value: ArsenalCategoryFilter, label: string, count: number) => (
    <button key={value} type="button" aria-pressed={category === value} data-arsenal-category={value}
      onClick={() => setCategory(value)}>
      <span>{label}</span> <span className="vnext-arsenal-count">{count}<span className="sr-only"> {count === 1 ? 'modelo' : 'modelos'}</span></span>
    </button>
  );

  const resultsText = phase !== 'ready' ? ''
    : visible.length === 0 ? 'Nenhum modelo encontrado.'
      : `${visible.length} ${visible.length === 1 ? 'modelo' : 'modelos'}${query.trim() ? ` para “${query.trim()}”` : ''}.`;

  return (
    <aside ref={panelRef} id={ARSENAL_PANEL_ID} className="vnext-arsenal" aria-labelledby={headingId} hidden={!open}
      data-arsenal-panel={open ? 'open' : 'closed'}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.stopPropagation();
        onClose();
      }}>
      {mounted && <>
        <header className="vnext-arsenal-header">
          <div>
            <h2 id={headingId}><Boxes size={18} aria-hidden="true" />Arsenal</h2>
            <p>Modelos guardados pela equipe. Usar não gasta IA.</p>
          </div>
          <button type="button" className="vnext-arsenal-close" data-arsenal-action="close" onClick={onClose}
            aria-label="Fechar arsenal"><X size={18} aria-hidden="true" /><span>Fechar</span></button>
        </header>
        <div className="vnext-arsenal-tools">
          <label className="vnext-arsenal-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Buscar no arsenal</span>
            <input ref={searchRef} type="search" value={query} placeholder="Buscar por nome ou etiqueta"
              data-arsenal-search="" onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); setQuery(''); }
              }} />
          </label>
          <div className="vnext-arsenal-categories" role="group" aria-label="Categorias">
            {filterButton('all', 'Todos', summaries.length)}
            {ARSENAL_CATEGORIES.map((entry) => filterButton(entry, ARSENAL_CATEGORY_LABELS[entry], counts[entry]))}
          </div>
        </div>
        <div className="vnext-arsenal-body" data-arsenal-body="">
          <p className="sr-only" role="status" aria-live="polite">{resultsText}</p>
          {listProblem && (
            <div className="vnext-arsenal-problem" data-arsenal-problem="">
              <p>{listProblem}</p>
              <button type="button" onClick={() => { void reload(); }}>Tentar de novo</button>
            </div>
          )}
          {phase === 'loading' && <p className="vnext-arsenal-empty" data-arsenal-loading="">Abrindo o arsenal…</p>}
          {phase === 'ready' && visible.length === 0 && (
            <p className="vnext-arsenal-empty" data-arsenal-empty="">
              {summaries.length === 0
                ? 'O arsenal ainda está vazio. Selecione algo na página e use “Guardar no arsenal…”.'
                : query.trim()
                  ? `Nada encontrado para “${query.trim()}”. Tente outra palavra ou escolha “Todos”.`
                  : `Ainda não há modelos em ${category === 'all' ? 'nenhuma categoria' : ARSENAL_CATEGORY_LABELS[category]}.`}
            </p>
          )}
          {lastMessage && <p className="vnext-arsenal-last" data-arsenal-last-message="">{lastMessage}</p>}
          {sections.map((section) => (
            <section key={section.category} className="vnext-arsenal-section" aria-labelledby={`${headingId}-${section.category}`}>
              <h3 id={`${headingId}-${section.category}`}>{ARSENAL_CATEGORY_LABELS[section.category]}</h3>
              <ul className="vnext-arsenal-grid">
                {section.presets.map((summary) => (
                  <ArsenalCard key={summary.id} summary={summary} preset={presetFor(summary)} runtime={runtime}
                    document={document} assetUrls={runtime.previewAssetUrls ? mergedUrls(assetUrls, runtime.previewAssetUrls) : assetUrls}
                    busy={busyId === summary.id} disabled={busyId !== null}
                    onUse={() => { void use(summary); }}
                    onRename={(trigger) => setRenameTarget({ preset: summary, trigger })}
                    onDelete={(trigger) => setDeleteTarget({ preset: summary, trigger })} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </>}
      {renameTarget && (
        <ArsenalRenameDialog runtime={runtime} target={renameTarget.preset} returnFocus={renameTarget.trigger}
          onClose={() => setRenameTarget(null)}
          onDone={(message, refresh) => {
            setRenameTarget(null);
            say(message);
            if (refresh) void reload();
          }} />
      )}
      {deleteTarget && (
        <ArsenalDeleteDialog runtime={runtime} target={deleteTarget.preset}
          returnFocus={deleteTarget.trigger}
          onClose={() => setDeleteTarget(null)}
          onDone={(message, deleted) => {
            setDeleteTarget(null);
            say(message);
            if (deleted) {
              setSummaries((current) => current.filter((entry) => entry.id !== deleted));
              queueMicrotask(() => searchRef.current?.focus());
            }
            void reload();
          }} />
      )}
    </aside>
  );
}

const urlMerges = new WeakMap<ReadonlyMap<string, string>, WeakMap<ReadonlyMap<string, string>, ReadonlyMap<string, string>>>();
/** The open catalog's images and the arsenal's own, as one stable map (the pictures redraw only when it changes). */
function mergedUrls(own: ReadonlyMap<string, string>, extra: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
  let byExtra = urlMerges.get(own);
  if (!byExtra) { byExtra = new WeakMap(); urlMerges.set(own, byExtra); }
  let merged = byExtra.get(extra);
  if (!merged) { merged = new Map([...extra, ...own]); byExtra.set(extra, merged); }
  return merged;
}

interface ArsenalCardProps {
  readonly summary: ArsenalPresetSummary;
  readonly preset: ArsenalPreset | undefined;
  readonly runtime: ArsenalEditorRuntime;
  readonly document: PageThumbnailDocument;
  readonly assetUrls: ReadonlyMap<string, string>;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onUse: () => void;
  readonly onRename: (trigger: HTMLElement | null) => void;
  readonly onDelete: (trigger: HTMLElement | null) => void;
}

function ArsenalCard({ summary, preset, runtime, document, assetUrls, busy, disabled, onUse, onRename, onDelete }: ArsenalCardProps) {
  const id = React.useId();
  const supported = arsenalPresetCanBeInserted(summary);
  const badge = arsenalOriginBadge(summary, runtime.viewer);
  const styleTarget = arsenalStyleTargetOf(preset?.payload);
  const kindLabel = summary.kind === 'style' && styleTarget
    ? `Estilo para ${arsenalStyleNeedsWords(styleTarget).replace(/^(um|uma) /, '')}`
    : ARSENAL_KIND_LABELS[summary.kind];
  const manageable = canManageArsenalPreset(summary, runtime.viewer);
  const tags = summary.tags.slice(0, 4);
  return (
    <li className="vnext-arsenal-card" data-arsenal-preset={summary.id} data-arsenal-scope={summary.scope}>
      <div className="vnext-arsenal-card-picture">
        {preset
          ? <ArsenalPresetThumbnail preset={preset} document={document} assetUrls={assetUrls} builder={runtime.previewBuilder} />
          : <span className="vnext-arsenal-thumb is-empty" aria-hidden="true" data-arsenal-thumb={supported ? 'waiting' : 'unsupported'} />}
      </div>
      <h4 id={`${id}-name`} className="vnext-arsenal-card-name">{summary.name}</h4>
      <div id={`${id}-meta`} className="vnext-arsenal-card-meta">
        <p><span className="vnext-arsenal-origin" data-origin={badge}>{badge}</span> <span>{arsenalAuthorLabel(summary, runtime.viewer)}</span></p>
        <p>{kindLabel} · <span data-arsenal-usage="">{arsenalUsageLabel(summary.useCount)}</span></p>
        {summary.description && <p className="vnext-arsenal-card-description">{summary.description}</p>}
        {tags.length > 0 && <p className="vnext-arsenal-tags"><span className="sr-only">Etiquetas: </span>
          {tags.map((tag, index) => <span key={tag}>{tag}{index < tags.length - 1 ? <span className="sr-only">, </span> : null}</span>)}</p>}
        {!supported && <p className="vnext-arsenal-card-note">Precisa de uma versão mais nova do app.</p>}
      </div>
      <div className="vnext-arsenal-card-actions">
        <button type="button" className="vnext-arsenal-use" data-arsenal-action="use"
          aria-label={`Usar “${summary.name}”`} aria-describedby={`${id}-meta`} aria-busy={busy || undefined}
          disabled={!supported || disabled} onClick={onUse}>{busy ? 'Usando…' : 'Usar'}</button>
        {manageable && (
          <LibraryRowMenu label={`Mais ações de “${summary.name}”`} disabled={disabled} items={[
            { id: 'rename', label: 'Renomear…', icon: <Pencil size={16} aria-hidden="true" />, onSelect: onRename },
            { id: 'delete', label: 'Apagar…', icon: <Trash2 size={16} aria-hidden="true" />, onSelect: onDelete },
          ]} />
        )}
      </div>
    </li>
  );
}

function ArsenalRenameDialog({ runtime, target, returnFocus, onClose, onDone }: {
  readonly runtime: ArsenalEditorRuntime;
  readonly target: ArsenalPresetSummary;
  readonly returnFocus: HTMLElement | null;
  readonly onClose: () => void;
  readonly onDone: (message: string, refresh: boolean) => void;
}) {
  const titleId = React.useId();
  const [name, setName] = React.useState(target.name);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const mutationId = React.useRef<{ name: string; id: string } | null>(null);
  const clean = name.replace(/\s+/g, ' ').trim();
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !clean) return;
    if (clean === target.name) { onClose(); return; }
    if (mutationId.current?.name !== clean) mutationId.current = { name: clean, id: arsenalRandomId(runtime) };
    setBusy(true);
    setProblem(null);
    try {
      const result = await runtime.repository.updateCAS({
        presetId: target.id, expectedRevision: target.revision, mutationId: mutationId.current.id, patch: { name: clean },
      });
      if (result.ok) { onDone(`Modelo renomeado para “${result.value.name}”.`, true); return; }
      const message = arsenalRepositoryErrorMessage(result.error.code, 'renomear');
      if (['CONFLICT', 'NOT_FOUND', 'FORBIDDEN', 'READ_ONLY'].includes(result.error.code)) { onDone(message, true); return; }
      setProblem(message);
    } catch {
      setProblem(arsenalRepositoryErrorMessage('REMOTE_FAILURE', 'renomear'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ArsenalModal titleId={titleId} title="Renomear modelo" phase={busy ? 'busy' : 'edit'} onClose={onClose}
      returnFocus={returnFocus} onSubmit={(event) => { void submit(event); }} className="is-small">
      <label className="vnext-arsenal-field">
        <span>Nome do modelo</span>
        <input autoFocus value={name} maxLength={ARSENAL_LIMITS.nameMaxChars} onChange={(event) => setName(event.target.value)}
          data-arsenal-rename-input="" aria-invalid={!clean || undefined} />
      </label>
      {problem && <p className="vnext-arsenal-dialog-problem" role="alert">{problem}</p>}
      <div className="vnext-arsenal-dialog-actions">
        <button type="button" onClick={onClose}>Cancelar</button>
        <button type="submit" className="is-primary" disabled={busy || !clean}>{busy ? 'Salvando…' : 'Salvar nome'}</button>
      </div>
    </ArsenalModal>
  );
}

function ArsenalDeleteDialog({ runtime, target, returnFocus, onClose, onDone }: {
  readonly runtime: ArsenalEditorRuntime;
  readonly target: ArsenalPresetSummary;
  readonly returnFocus: HTMLElement | null;
  readonly onClose: () => void;
  readonly onDone: (message: string, deletedId: string | null) => void;
}) {
  const titleId = React.useId();
  const textId = React.useId();
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const mutationId = React.useRef(arsenalRandomId(runtime));
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await runtime.repository.deleteCAS({ presetId: target.id, expectedRevision: target.revision, mutationId: mutationId.current });
      if (result.ok) { onDone(`“${target.name}” foi apagado do arsenal.`, target.id); return; }
      const message = arsenalRepositoryErrorMessage(result.error.code, 'apagar');
      if (['CONFLICT', 'NOT_FOUND', 'FORBIDDEN', 'READ_ONLY'].includes(result.error.code)) { onDone(message, null); return; }
      setProblem(message);
    } catch {
      setProblem(arsenalRepositoryErrorMessage('REMOTE_FAILURE', 'apagar'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ArsenalModal titleId={titleId} descriptionId={textId} role="alertdialog" title={`Apagar “${target.name}”?`}
      phase={busy ? 'busy' : 'confirm'} onClose={onClose} returnFocus={returnFocus} className="is-small">
      <div id={textId}>
        <p>O modelo sai do arsenal para toda a equipe.</p>
        <p>Os catálogos que já usaram este modelo não mudam.</p>
      </div>
      {problem && <p className="vnext-arsenal-dialog-problem" role="alert">{problem}</p>}
      <div className="vnext-arsenal-dialog-actions">
        <button type="button" autoFocus onClick={onClose} data-arsenal-confirm="cancel">Cancelar</button>
        <button type="button" className="is-danger" disabled={busy} data-arsenal-confirm="delete" onClick={() => { void confirm(); }}>
          {busy ? 'Apagando…' : 'Apagar modelo'}
        </button>
      </div>
    </ArsenalModal>
  );
}

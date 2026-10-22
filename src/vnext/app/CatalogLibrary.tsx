import React from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowDownAZ,
  ArrowUpAZ,
  Clock3,
  Copy,
  FilePlus2,
  FolderOpen,
  LayoutTemplate,
  LogOut,
  Pencil,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { CatalogListItem } from '../persistence';
import { getTranslationLanguage } from '../translation/language-registry';
import {
  projectCatalogLibraryItems,
  type CatalogLibraryFailureCode,
  type CatalogLibraryService,
  type CatalogLibrarySort,
  type CatalogLibraryView,
} from '../library';
import {
  CATALOG_TITLE_MAX_LENGTH,
  DEFAULT_BLANK_CATALOG_TITLE,
  normalizeCatalogTitle,
} from '../library/service';
import { LibraryRowMenu } from './editor/LibraryRowMenu';
import { catalogEditorUrl } from '../ai-catalog/intake/assistant-link';
import './styles.css';
import './editor/entry-and-title.css';

/** Search filters the list already loaded, after the person pauses typing. */
export const LIBRARY_SEARCH_DEBOUNCE_MS = 300;

interface CatalogLibraryProps {
  readonly service: CatalogLibraryService;
  readonly onOpen: (catalogId: string) => void;
  /**
   * FR-64: opens a catalog with the assistant already open, to drop the files there. By default it goes to
   * `/v2?catalog=<id>&assistente=1` (the editor reads that parameter); the files never travel between the pages.
   */
  readonly onOpenWithAssistant?: (catalogId: string) => void;
  readonly onSignOut?: () => void | Promise<void>;
  readonly onUnauthorized?: () => void | Promise<void>;
}

interface LibraryActionError {
  readonly message: string;
  readonly retry?: () => void;
  readonly retryLabel?: string;
}

/** Confirmation shown above the list after an action, so the result never happens silently. */
interface LibraryNotice {
  readonly message: string;
  /** After archiving: the archived catalog is one click away in "Arquivados". */
  readonly showArchived?: boolean;
}

const ARCHIVED_NOTICE = 'Catálogo arquivado. Ele continua em Arquivados.';

function dateLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function localeLabel(locale: string): string {
  return getTranslationLanguage(locale)?.displayName ?? locale;
}

function editedLabel(item: CatalogListItem): string {
  const name = item.updatedByName?.trim();
  const author = name && !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(name)
    ? name
    : 'um colaborador';
  const elapsed = Math.max(0, Date.now() - new Date(item.updatedAt).getTime());
  if (!Number.isFinite(elapsed)) return `Editado por ${author}`;
  if (elapsed < 60_000) return `Editado agora por ${author}`;
  const units = [
    ['year', 365 * 24 * 60 * 60_000],
    ['month', 30 * 24 * 60 * 60_000],
    ['week', 7 * 24 * 60 * 60_000],
    ['day', 24 * 60 * 60_000],
    ['hour', 60 * 60_000],
    ['minute', 60_000],
  ] as const;
  const [unit, duration] = units.find(([, milliseconds]) => elapsed >= milliseconds)!;
  const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'always' }).format(-Math.floor(elapsed / duration), unit);
  return `Editado ${relative} por ${author}`;
}

function failureMessage(code: CatalogLibraryFailureCode, action: 'load' | 'create' | 'rename' | 'archive' | 'restore'): string {
  if (code === 'NOT_FOUND') return 'Este catálogo não foi encontrado. Atualize a lista e tente novamente.';
  if (code === 'UNAUTHORIZED') return 'Você não tem acesso a este catálogo. Entre novamente ou peça acesso à equipe.';
  if (code === 'OFFLINE') return 'Você está sem conexão. Conecte-se à internet e tente novamente.';
  if (code === 'REMOTE_FAILURE') return 'Não foi possível acessar seus catálogos agora. Tente novamente.';
  if (code === 'CONFLICT' || code === 'STALE_RESULT') {
    return action === 'rename'
      ? 'O catálogo mudou em outro lugar antes da renomeação. A versão atual foi preservada.'
      : 'O catálogo mudou em outro lugar antes desta ação. A versão atual foi preservada.';
  }
  if (code === 'ARCHIVED') return 'Este catálogo já está arquivado e não pode ser alterado como catálogo ativo.';
  if (code === 'INVALID_DOCUMENT' || code === 'UNSUPPORTED_VERSION' || code === 'ENVELOPE_MISMATCH') {
    return 'Este catálogo contém dados que não puderam ser validados com segurança.';
  }
  if (code === 'AMBIGUOUS_COMMIT_OUTCOME') return action === 'create'
    ? 'Não foi possível confirmar a criação. Tente novamente para verificar o mesmo catálogo.'
    : 'Não foi possível confirmar o resultado no servidor. Tente novamente.';
  if (code === 'INVALID_TITLE') return 'Digite um nome para o catálogo.';
  if (code === 'STARTER_NOT_FOUND') return 'Este modelo inicial não está mais disponível. Escolha outro modelo.';
  if (code === 'STARTER_DEPENDENCY_UNAVAILABLE') return 'Não foi possível preparar a imagem oficial. Nenhum catálogo foi criado. Confira a conexão e tente novamente.';
  if (action === 'create') return 'Não foi possível criar o catálogo. Tente novamente.';
  if (action === 'rename') return 'Não foi possível renomear este catálogo.';
  if (action === 'archive') return 'Não foi possível arquivar este catálogo.';
  if (action === 'restore') return 'Não foi possível restaurar este catálogo.';
  return 'Não foi possível carregar seus catálogos.';
}

function CatalogRow({
  item,
  view,
  onOpen,
  onRename,
  onDuplicate,
  onUseAsModel,
  onArchive,
  onRestore,
  disabled,
  duplicating,
  highlighted = false,
  translationSourceTitle,
}: {
  readonly item: CatalogListItem;
  readonly view: CatalogLibraryView;
  readonly onOpen: () => void;
  readonly onRename: (trigger?: HTMLElement | null) => void;
  readonly onDuplicate: () => void;
  readonly onUseAsModel: (trigger: HTMLElement | null) => void;
  readonly onArchive: (trigger: HTMLElement | null) => void;
  readonly onRestore: (trigger: HTMLElement | null) => void;
  readonly disabled: boolean;
  readonly duplicating: boolean;
  /** The copy just created by "Duplicar": marked until the next action, so it is easy to find. */
  readonly highlighted?: boolean;
  readonly translationSourceTitle?: string;
}) {
  const isTranslatedCopy = item.origin?.originKind === 'translation';
  const canOpen = view === 'active';

  return (
    <article
      className={highlighted ? 'vnext-library-row is-highlighted' : 'vnext-library-row'}
      data-library-catalog-id={item.catalogId}
      data-library-highlighted={highlighted ? '' : undefined}
      style={canOpen && !disabled ? { cursor: 'pointer' } : undefined}
      onClick={(event) => {
        // Buttons and the menu keep their own actions; clicking any other part opens the card.
        if (!canOpen || disabled || (event.target as Element).closest('button, a, input, select, [role="menu"]')) return;
        onOpen();
      }}
    >
      <div
        className="vnext-library-row-main"
        role={canOpen ? 'link' : undefined}
        tabIndex={canOpen && !disabled ? 0 : undefined}
        aria-label={canOpen ? `Abrir catálogo ${item.title}` : undefined}
        aria-disabled={canOpen && disabled ? true : undefined}
        onKeyDown={(event) => {
          if (!canOpen || disabled || event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          onOpen();
        }}
      >
        <div className="vnext-library-title-line">
          <h2>{item.title}</h2>
          {highlighted && <span className="vnext-library-origin-badge is-new">Cópia nova</span>}
          {isTranslatedCopy && <span className="vnext-library-origin-badge">Cópia traduzida</span>}
        </div>
        <div className="vnext-library-meta">
          <span>{localeLabel(item.locale)}</span>
          <span aria-hidden="true">·</span>
          <span title={`Última edição em ${dateLabel(item.updatedAt)}`}>{editedLabel(item)}</span>
          {view === 'archived' && item.archivedAt && <><span aria-hidden="true">·</span><span>Arquivado em {dateLabel(item.archivedAt)}</span></>}
          {isTranslatedCopy && (
            <>
              <span aria-hidden="true">·</span>
              <span>{translationSourceTitle ? `Origem: ${translationSourceTitle}` : 'Origem: catálogo original'}</span>
            </>
          )}
        </div>
      </div>
      {view === 'active' ? (
        <div className="vnext-library-row-actions" aria-label={`Ações de ${item.title}`}>
          <button type="button" className="is-primary" onClick={onOpen} disabled={disabled}><FolderOpen size={17} aria-hidden="true" />Abrir</button>
          <button type="button" className="is-quiet" onClick={onDuplicate} disabled={disabled}><Copy size={16} aria-hidden="true" />{duplicating ? 'Duplicando…' : 'Duplicar'}</button>
          <button type="button" className="is-quiet" onClick={(event) => onRename(event.currentTarget)} disabled={disabled}><Pencil size={16} aria-hidden="true" />Renomear</button>
          <LibraryRowMenu
            label={`Mais ações de ${item.title}`}
            disabled={disabled}
            items={[{
              id: 'duplicate',
              label: 'Duplicar',
              icon: <Copy size={16} aria-hidden="true" />,
              onSelect: onDuplicate,
            }, {
              id: 'rename',
              label: 'Renomear',
              icon: <Pencil size={16} aria-hidden="true" />,
              onSelect: onRename,
            }, {
              id: 'use-as-model',
              label: 'Usar como modelo',
              icon: <LayoutTemplate size={16} aria-hidden="true" />,
              onSelect: onUseAsModel,
            }, {
              id: 'archive',
              label: 'Arquivar',
              icon: <Archive size={16} aria-hidden="true" />,
              onSelect: (trigger) => onArchive(trigger),
            }]}
          />
        </div>
      ) : (
        <div className="vnext-library-row-actions is-archived" aria-label={`Ações de ${item.title}`}>
          <span className="vnext-library-archived-state">Arquivado</span>
          <button type="button" className="is-primary" onClick={(event) => onRestore(event.currentTarget)} disabled={disabled}>
            <ArchiveRestore size={16} aria-hidden="true" />Restaurar
          </button>
          <button
            type="button"
            className="is-primary"
            onClick={onDuplicate}
            disabled={disabled}
            title="Cria uma cópia ativa deste catálogo"
          >
            <Copy size={16} aria-hidden="true" />{duplicating ? 'Duplicando…' : 'Duplicar'}
          </button>
        </div>
      )}
    </article>
  );
}

const openWithAssistantByAddress = (catalogId: string) => {
  window.location.assign(catalogEditorUrl(catalogId, { assistant: true }));
};

export function CatalogLibrary({ service, onOpen, onOpenWithAssistant = openWithAssistantByAddress, onSignOut, onUnauthorized }: CatalogLibraryProps) {
  const [view, setView] = React.useState<CatalogLibraryView>('active');
  const [search, setSearch] = React.useState('');
  const [appliedSearch, setAppliedSearch] = React.useState('');
  const [sort, setSort] = React.useState<CatalogLibrarySort>('updated-desc');
  const [items, setItems] = React.useState<readonly CatalogListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [accessInvalidated, setAccessInvalidated] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | undefined>();
  const [actionError, setActionError] = React.useState<LibraryActionError | undefined>();
  const [renameTarget, setRenameTarget] = React.useState<CatalogListItem | undefined>();
  const [renameTitle, setRenameTitle] = React.useState('');
  const [archiveTarget, setArchiveTarget] = React.useState<CatalogListItem | undefined>();
  const [restoreTarget, setRestoreTarget] = React.useState<CatalogListItem | undefined>();
  const [modelTarget, setModelTarget] = React.useState<CatalogListItem | undefined>();
  const [modelTitle, setModelTitle] = React.useState('');
  const [createChooserOpen, setCreateChooserOpen] = React.useState(false);
  const [createTitle, setCreateTitle] = React.useState('');
  const [creatingTitle, setCreatingTitle] = React.useState<string | undefined>();
  const [notice, setNotice] = React.useState<LibraryNotice | undefined>();
  const [highlightId, setHighlightId] = React.useState<string | undefined>();
  const [duplicateTargetId, setDuplicateTargetId] = React.useState<string | undefined>();
  const loadGeneration = React.useRef(0);
  const noticeRef = React.useRef<HTMLDivElement | null>(null);
  const dialogTrigger = React.useRef<HTMLElement | null>(null);
  const renameDialog = React.useRef<HTMLFormElement | null>(null);
  const archiveDialog = React.useRef<HTMLElement | null>(null);
  const restoreDialog = React.useRef<HTMLElement | null>(null);
  const modelDialog = React.useRef<HTMLFormElement | null>(null);
  const createDialog = React.useRef<HTMLElement | null>(null);
  /** The creation still being verified was "Criar com IA a partir de arquivos": open it with the assistant too. */
  const createWithAssistant = React.useRef(false);
  const openCopyWhenVerified = React.useRef(false);
  const createPending = service.getCreateState() === 'pending-verification';
  const starters = service.listStarters();

  const invalidateUnauthorized = React.useCallback((code: CatalogLibraryFailureCode): boolean => {
    if (code !== 'UNAUTHORIZED' || !onUnauthorized) return false;
    setAccessInvalidated(true);
    void onUnauthorized();
    return true;
  }, [onUnauthorized]);

  React.useEffect(() => {
    if (createPending) {
      setCreateChooserOpen(false);
      setRenameTarget(undefined);
      setArchiveTarget(undefined);
      setRestoreTarget(undefined);
      setModelTarget(undefined);
    }
  }, [createPending]);

  React.useEffect(() => {
    if (!createPending) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [createPending]);

  const rememberDialogTrigger = (trigger?: HTMLElement | null) => {
    dialogTrigger.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  };

  React.useEffect(() => {
    if (renameTarget || archiveTarget || restoreTarget || modelTarget || createChooserOpen) return;
    const trigger = dialogTrigger.current;
    dialogTrigger.current = null;
    if (trigger?.isConnected) trigger.focus();
  }, [archiveTarget, restoreTarget, modelTarget, createChooserOpen, renameTarget]);

  const handleDialogKeyboard = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setRenameTarget(undefined);
      setArchiveTarget(undefined);
      setRestoreTarget(undefined);
      setModelTarget(undefined);
      setCreateChooserOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = renameDialog.current ?? archiveDialog.current ?? restoreDialog.current ?? modelDialog.current ?? createDialog.current;
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((element) => !element.hasAttribute('hidden'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  // One request per view (and after changes); search and sort only reorder what is already here.
  const load = React.useCallback(async (nextView = view) => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setLoadError(undefined);
    setActionError(undefined);
    const result = await service.list({ view: nextView });
    if (generation !== loadGeneration.current) return;
    if (result.ok) {
      setItems(result.value);
    } else {
      setItems([]);
      if (invalidateUnauthorized(result.error.code)) {
        setLoading(false);
        return;
      }
      setLoadError(failureMessage(result.error.code, 'load'));
    }
    setLoading(false);
  }, [service, view, invalidateUnauthorized]);

  React.useEffect(() => { void load(); }, [load]);

  React.useEffect(() => {
    if (search === appliedSearch) return undefined;
    const timer = window.setTimeout(() => setAppliedSearch(search), LIBRARY_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, appliedSearch]);

  // A new notice is brought into view: after acting on a row far down the list, it is not left above the screen.
  React.useEffect(() => {
    const element = noticeRef.current;
    if (!notice || !element || typeof element.scrollIntoView !== 'function') return;
    element.scrollIntoView({ block: 'nearest' });
  }, [notice]);

  const changeView = (nextView: CatalogLibraryView) => {
    setView(nextView);
    setSearch('');
    setAppliedSearch('');
    // A notice and a highlighted copy belong to the list where they were shown.
    setNotice(undefined);
    setHighlightId(undefined);
  };

  const beginAction = () => {
    setBusy(true);
    setActionError(undefined);
    setNotice(undefined);
    setHighlightId(undefined);
  };

  const verifyPendingCreate = async () => {
    if (busy) return;
    beginAction();
    const result = await service.verifyPendingCreate();
    setBusy(false);
    if (!result.ok) {
      if (invalidateUnauthorized(result.error.code)) return;
      setActionError({
        message: failureMessage(result.error.code, 'create'),
        retry: () => { void verifyPendingCreate(); },
        retryLabel: 'Verificar criação',
      });
      return;
    }
    if (!result.value || (result.value.origin?.originKind === 'duplicate' && !openCopyWhenVerified.current)) {
      await load();
      return;
    }
    openCopyWhenVerified.current = false;
    if (createWithAssistant.current) onOpenWithAssistant(result.value.catalogId);
    else onOpen(result.value.catalogId);
  };

  const createFailure = (code: CatalogLibraryFailureCode, retryCreate: () => void): LibraryActionError => {
    const pending = service.getCreateState() === 'pending-verification';
    return {
      message: failureMessage(code, 'create'),
      // While an attempt is unresolved, retrying only verifies that same attempt; it never starts another.
      retry: pending ? () => { void verifyPendingCreate(); } : retryCreate,
      retryLabel: pending ? 'Verificar criação' : 'Tentar novamente',
    };
  };

  const createBlank = async (title: string, options: { assistant?: boolean } = {}) => {
    if (busy) return;
    beginAction();
    createWithAssistant.current = Boolean(options.assistant);
    openCopyWhenVerified.current = false;
    setCreatingTitle(title || DEFAULT_BLANK_CATALOG_TITLE);
    const result = await service.createBlank(title || undefined);
    setBusy(false);
    setCreatingTitle(undefined);
    setCreateChooserOpen(false);
    if (!result.ok) {
      if (invalidateUnauthorized(result.error.code)) return;
      setActionError(createFailure(result.error.code, () => { void createBlank(title, options); }));
      return;
    }
    if (options.assistant) onOpenWithAssistant(result.value.catalogId);
    else onOpen(result.value.catalogId);
  };

  const createFromStarter = async (starterId: string, starterLabel: string, title: string) => {
    if (busy) return;
    beginAction();
    createWithAssistant.current = false;
    openCopyWhenVerified.current = false;
    setCreatingTitle(title || starterLabel);
    const result = title
      ? await service.createFromStarter(starterId, title)
      : await service.createFromStarter(starterId);
    setBusy(false);
    setCreatingTitle(undefined);
    setCreateChooserOpen(false);
    if (!result.ok) {
      if (invalidateUnauthorized(result.error.code)) return;
      setActionError(createFailure(result.error.code, () => { void createFromStarter(starterId, starterLabel, title); }));
      return;
    }
    onOpen(result.value.catalogId);
  };

  const duplicateCatalog = async (item: CatalogListItem) => {
    if (busy || createPending) return;
    const fromArchived = view === 'archived';
    beginAction();
    openCopyWhenVerified.current = false;
    setDuplicateTargetId(item.catalogId);
    const result = await service.duplicate(item.catalogId);
    setBusy(false);
    setDuplicateTargetId(undefined);
    if (!result.ok) {
      if (invalidateUnauthorized(result.error.code)) return;
      setActionError(createFailure(result.error.code, () => { void duplicateCatalog(item); }));
      return;
    }
    if (fromArchived) {
      // The copy is an active catalog: show it where the person can open and edit it.
      changeView('active');
      setHighlightId(result.value.catalogId);
      setNotice({ message: `Cópia criada em Ativos: “${result.value.title}”. O catálogo arquivado continua guardado.` });
      return;
    }
    await load();
    // The copy is not only one more row: it is named and marked in the list.
    setHighlightId(result.value.catalogId);
    setNotice({ message: `Cópia criada: “${result.value.title}”.` });
  };

  const requestNewCatalog = () => {
    if (createPending) {
      void verifyPendingCreate();
      return;
    }
    rememberDialogTrigger();
    setCreateTitle('');
    setCreateChooserOpen(true);
  };

  const submitUseAsModel = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!modelTarget || busy || createPending) return;
    const source = modelTarget;
    const title = normalizeCatalogTitle(modelTitle);
    if (!title) return;
    beginAction();
    createWithAssistant.current = false;
    openCopyWhenVerified.current = true;
    const result = await service.useAsModel(source.catalogId, title);
    setBusy(false);
    setModelTarget(undefined);
    if (!result.ok) {
      if (invalidateUnauthorized(result.error.code)) return;
      setActionError(createFailure(result.error.code, () => {
        rememberDialogTrigger();
        setModelTarget(source);
        setModelTitle(title);
      }));
      return;
    }
    openCopyWhenVerified.current = false;
    onOpen(result.value.catalogId);
  };

  const submitRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!renameTarget || busy || createPending) return;
    beginAction();
    const result = await service.rename(renameTarget.catalogId, renameTitle);
    setBusy(false);
    if (!result.ok) {
      if (invalidateUnauthorized(result.error.code)) return;
      const error = { message: failureMessage(result.error.code, 'rename') };
      if (result.error.code === 'CONFLICT' || result.error.code === 'STALE_RESULT' || result.error.code === 'ARCHIVED') {
        setRenameTarget(undefined);
        // Reload first: load() clears action errors, so the message is set after it to stay on screen.
        await load();
      }
      setActionError(error);
      return;
    }
    setRenameTarget(undefined);
    await load();
  };

  const confirmArchive = async () => {
    if (!archiveTarget || busy || createPending) return;
    const target = archiveTarget;
    beginAction();
    const result = await service.archive(target.catalogId);
    setBusy(false);
    setArchiveTarget(undefined);
    if (!result.ok) {
      if (invalidateUnauthorized(result.error.code)) return;
      // Reload first: load() clears action errors, so the message is set after it to stay on screen.
      await load();
      setActionError({ message: failureMessage(result.error.code, 'archive') });
      return;
    }
    setItems((current) => current.filter((item) => item.catalogId !== target.catalogId));
    // The row leaves the list: say where it went and offer to go there.
    setNotice({ message: ARCHIVED_NOTICE, showArchived: true });
  };

  const confirmRestore = async () => {
    if (!restoreTarget || busy || createPending) return;
    const target = restoreTarget;
    beginAction();
    const result = await service.restore(target.catalogId);
    setBusy(false);
    setRestoreTarget(undefined);
    if (!result.ok) {
      if (invalidateUnauthorized(result.error.code)) return;
      await load();
      setActionError({ message: failureMessage(result.error.code, 'restore') });
      return;
    }
    changeView('active');
    setNotice({ message: `Catálogo restaurado: “${target.title}”. Ele voltou para Ativos.` });
  };

  const titleById = React.useMemo(
    () => new Map(items.map((item) => [item.catalogId, item.title] as const)),
    [items]
  );
  const visibleItems = React.useMemo(
    () => projectCatalogLibraryItems(items, { view, search: appliedSearch, sort }),
    [items, view, appliedSearch, sort]
  );
  const hasItems = visibleItems.length > 0;
  const emptySearch = !loading && !hasItems && appliedSearch.trim().length > 0;
  const emptyView = !loading && !hasItems && !appliedSearch.trim();
  const createName = normalizeCatalogTitle(createTitle);

  if (accessInvalidated) {
    return (
      <main className="vnext-access-shell" data-library-access-invalidated="">
        <section className="vnext-access-card" role="status">Validando acesso…</section>
      </main>
    );
  }

  return (
    <main className="vnext-library-shell" data-catalog-library="" onKeyDown={handleDialogKeyboard}>
      <header className="vnext-library-header">
        <div className="vnext-brand">
          <div className="vnext-brand-mark" aria-hidden="true">P</div>
          <div>
            <div className="vnext-product-line">PRESYS · Catalog Builder</div>
            <h1>Meus catálogos</h1>
          </div>
        </div>
        <div className="vnext-library-header-actions">
          {!loading && !loadError && (
            <button
              type="button"
              className="vnext-library-create"
              onClick={requestNewCatalog}
              disabled={busy}
              aria-label={busy && (createChooserOpen || createPending) ? (createPending ? 'Verificando criação' : 'Criando catálogo') : (createPending ? 'Verificar criação' : 'Novo catálogo')}
            >
              <FilePlus2 size={18} aria-hidden="true" />
              <span>{busy && (createChooserOpen || createPending) ? (createPending ? 'Verificando…' : 'Criando…') : (createPending ? 'Verificar criação' : 'Novo catálogo')}</span>
            </button>
          )}
          {onSignOut && (
            <button type="button" className="vnext-library-secondary" onClick={() => { void onSignOut(); }} disabled={busy}>
              <LogOut size={17} aria-hidden="true" />
              <span>Sair</span>
            </button>
          )}
        </div>
      </header>

      <section className="vnext-library-content" aria-labelledby="library-heading">
        <div className="vnext-library-intro">
          <div>
            <h2 id="library-heading">Seus catálogos técnicos</h2>
            <p>Encontre um catálogo, continue o trabalho ou comece um novo.</p>
          </div>
        </div>

        <div className="vnext-library-toolbar">
          <div className="vnext-library-tabs" role="tablist" aria-label="Estado dos catálogos">
            <button type="button" role="tab" aria-selected={view === 'active'} className={view === 'active' ? 'is-selected' : undefined} onClick={() => changeView('active')} disabled={busy || createPending}>Ativos</button>
            <button type="button" role="tab" aria-selected={view === 'archived'} className={view === 'archived' ? 'is-selected' : undefined} onClick={() => changeView('archived')} disabled={busy || createPending}>Arquivados</button>
          </div>
          <div className="vnext-library-controls">
            <label className="vnext-library-search">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Buscar catálogos</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar catálogos" type="search" />
            </label>
            <label className="vnext-library-sort">
              <span className="sr-only">Ordenar catálogos</span>
              {sort === 'title-asc' ? <ArrowDownAZ size={17} aria-hidden="true" /> : sort === 'title-desc' ? <ArrowUpAZ size={17} aria-hidden="true" /> : <Clock3 size={17} aria-hidden="true" />}
              <select value={sort} onChange={(event) => setSort(event.target.value as CatalogLibrarySort)}>
                <option value="updated-desc">Mais recentes</option>
                <option value="title-asc">Título A–Z</option>
                <option value="title-desc">Título Z–A</option>
              </select>
            </label>
          </div>
        </div>

        {loadError ? (
          <div className="vnext-library-error" role="alert" data-library-list-error="">
            <span>{loadError}</span>
            <button type="button" onClick={() => { void load(); }}>Tentar novamente</button>
          </div>
        ) : (
          <>
            {notice && !actionError && (
              <div ref={noticeRef} className="vnext-library-notice" role="status" data-library-notice="">
                <span data-library-notice-text="">{notice.message}</span>
                {notice.showArchived && view === 'active' && (
                  <button type="button" onClick={() => changeView('archived')}>
                    <Archive size={16} aria-hidden="true" />Ver Arquivados
                  </button>
                )}
              </div>
            )}
            {actionError && (
              <div className="vnext-library-error" role="alert" data-library-action-error="">
                <span>{actionError.message}</span>
                {actionError.retry && (
                  <button type="button" onClick={actionError.retry}>
                    {actionError.retryLabel ?? 'Tentar novamente'}
                  </button>
                )}
              </div>
            )}

            {loading ? (
          <div className="vnext-library-loading" role="status">Carregando catálogos…</div>
        ) : hasItems ? (
          <>
          {view === 'archived' && (
            <p className="vnext-library-archived-hint">
              Para voltar a editar um catálogo, clique em “Restaurar”. Para criar uma cópia separada, clique em “Duplicar”.
            </p>
          )}
          <div className="vnext-library-list" aria-live="polite">
            {visibleItems.map((item) => (
              <CatalogRow
                key={item.catalogId}
                item={item}
                view={view}
                onOpen={() => { if (!busy && !createPending) onOpen(item.catalogId); }}
                onDuplicate={() => { void duplicateCatalog(item); }}
                onRename={(trigger) => { if (!busy && !createPending) { rememberDialogTrigger(trigger); setRenameTarget(item); setRenameTitle(item.title); } }}
                onUseAsModel={(trigger) => { if (!busy && !createPending) { rememberDialogTrigger(trigger); setModelTarget(item); setModelTitle(`Modelo de ${item.title}`.slice(0, CATALOG_TITLE_MAX_LENGTH)); } }}
                onArchive={(trigger) => { if (!busy && !createPending) { rememberDialogTrigger(trigger); setArchiveTarget(item); } }}
                onRestore={(trigger) => { if (!busy && !createPending) { rememberDialogTrigger(trigger); setRestoreTarget(item); } }}
                disabled={busy || createPending}
                duplicating={duplicateTargetId === item.catalogId}
                highlighted={view === 'active' && highlightId === item.catalogId}
                translationSourceTitle={item.origin?.originKind === 'translation' && item.origin.originId
                  ? titleById.get(item.origin.originId)
                  : undefined}
              />
            ))}
          </div>
          </>
        ) : emptySearch ? (
          <div className="vnext-library-empty is-search">
            <Search size={24} aria-hidden="true" />
            <h3>Nenhum catálogo encontrado</h3>
            <p>Tente outro termo de busca.</p>
          </div>
        ) : emptyView && view === 'active' ? (
          <div className="vnext-library-empty">
            <FilePlus2 size={30} aria-hidden="true" />
            <h3>Comece seu primeiro catálogo</h3>
            <p>Use uma ficha técnica pronta para editar ou comece com uma página em branco.</p>
            <button type="button" className="vnext-library-create" onClick={requestNewCatalog} disabled={busy}>
              {createPending ? 'Verificar criação' : 'Criar novo catálogo'}
            </button>
          </div>
        ) : (
          <div className="vnext-library-empty is-search">
            <Archive size={26} aria-hidden="true" />
            <h3>Nenhum catálogo arquivado</h3>
            <p>Catálogos arquivados aparecerão aqui, separados dos seus trabalhos ativos.</p>
          </div>
        )}
          </>
        )}
      </section>

      {createChooserOpen && (
        <div className="vnext-library-dialog-backdrop">
          <section ref={createDialog} className="vnext-library-dialog vnext-library-create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <button type="button" className="vnext-library-dialog-close" aria-label="Fechar" onClick={() => setCreateChooserOpen(false)}><X size={18} /></button>
            <h2 id="create-title">Novo catálogo</h2>
            <label className="vnext-library-create-name">
              Nome do catálogo
              <input
                autoFocus
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                onKeyDown={(event) => {
                  // Enter never creates by itself: it moves to the next step, choosing how to start.
                  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  const options = createDialog.current?.querySelector('.vnext-library-create-options');
                  const next = options?.querySelector<HTMLButtonElement>('button.is-recommended:not(:disabled)')
                    ?? options?.querySelector<HTMLButtonElement>('button:not(:disabled)');
                  next?.focus();
                }}
                maxLength={CATALOG_TITLE_MAX_LENGTH}
                placeholder="Ex.: TA-25N — Ficha técnica 2026"
                disabled={busy}
                aria-describedby="create-name-help"
              />
            </label>
            <p id="create-name-help">Depois escolha como começar. Sem nome, o catálogo fica com o nome do modelo escolhido. O nome muda depois clicando no título.</p>
            <div className="vnext-library-create-options">
              <button
                type="button"
                className="is-ai"
                aria-label="Criar com IA a partir de arquivos"
                aria-describedby="create-option-ai"
                data-library-create-option="ai-files"
                onClick={() => { void createBlank(createName, { assistant: true }); }}
                disabled={busy}
              >
                <Sparkles size={20} aria-hidden="true" />
                <span><strong>Criar com IA a partir de arquivos</strong><small id="create-option-ai">Abre o catálogo com o assistente, para você soltar PDFs, planilhas e fotos do produto.</small></span>
              </button>
              <button
                type="button"
                aria-label="Em branco"
                aria-describedby="create-option-blank"
                onClick={() => { void createBlank(createName); }}
                disabled={busy}
              >
                <FilePlus2 size={20} aria-hidden="true" />
                <span><strong>Em branco</strong><small id="create-option-blank">Comece com uma página vazia.</small></span>
              </button>
              {starters.map((starter) => {
                const recommended = starter.starterId === 'essential-technical-sheet';
                const descriptionId = `create-option-${starter.starterId}`;
                return (
                  <button key={starter.starterId} type="button" className={recommended ? 'is-recommended' : undefined}
                    aria-label={starter.label}
                    aria-describedby={descriptionId}
                    onClick={() => { void createFromStarter(starter.starterId, starter.label, createName); }} disabled={busy}>
                    <LayoutTemplate size={20} aria-hidden="true" />
                    <span id={descriptionId}>
                      <strong>{starter.label}</strong>
                      {recommended && <small className="vnext-create-recommendation">Recomendado para começar</small>}
                      {starter.description && <small>{starter.description}</small>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="vnext-library-create-status" role="status" data-library-create-status="">
              {busy && creatingTitle ? `Criando “${creatingTitle}”… Aguarde: o catálogo abre sozinho.` : ''}
            </div>
          </section>
        </div>
      )}

      {renameTarget && (
        <div className="vnext-library-dialog-backdrop">
          <form ref={renameDialog} className="vnext-library-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-title" onSubmit={(event) => { void submitRename(event); }}>
            <button type="button" className="vnext-library-dialog-close" aria-label="Fechar" onClick={() => setRenameTarget(undefined)}><X size={18} /></button>
            <h2 id="rename-title">Renomear catálogo</h2>
            <p>O novo nome também será o título oficial do catálogo.</p>
            <label>Nome do catálogo<input autoFocus value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} maxLength={180} /></label>
            <div className="vnext-library-dialog-actions">
              <button type="button" onClick={() => setRenameTarget(undefined)}>Cancelar</button>
              <button type="submit" className="is-primary" disabled={busy || !renameTitle.trim()}>{busy ? 'Salvando…' : 'Salvar nome'}</button>
            </div>
          </form>
        </div>
      )}

      {archiveTarget && (
        <div className="vnext-library-dialog-backdrop">
          <section ref={archiveDialog} className="vnext-library-dialog" role="dialog" aria-modal="true" aria-labelledby="archive-title">
            <button type="button" className="vnext-library-dialog-close" aria-label="Fechar" onClick={() => setArchiveTarget(undefined)}><X size={18} /></button>
            <h2 id="archive-title">Arquivar “{archiveTarget.title}”?</h2>
            <p>Ele sairá da lista de catálogos ativos e passará a aparecer em Arquivados. Ele não será excluído permanentemente. Para voltar a usá-lo depois, abra Arquivados e clique em “Restaurar”.</p>
            <div className="vnext-library-dialog-actions">
              <button type="button" autoFocus onClick={() => setArchiveTarget(undefined)}>Cancelar</button>
              <button type="button" className="is-danger" onClick={() => { void confirmArchive(); }} disabled={busy}>{busy ? 'Arquivando…' : 'Arquivar catálogo'}</button>
            </div>
          </section>
        </div>
      )}

      {restoreTarget && (
        <div className="vnext-library-dialog-backdrop">
          <section ref={restoreDialog} className="vnext-library-dialog" role="dialog" aria-modal="true" aria-labelledby="restore-title">
            <button type="button" className="vnext-library-dialog-close" aria-label="Fechar" onClick={() => setRestoreTarget(undefined)}><X size={18} /></button>
            <h2 id="restore-title">Restaurar “{restoreTarget.title}”?</h2>
            <p>O catálogo voltará para Ativos, com o mesmo nome e conteúdo, e poderá ser editado novamente.</p>
            <div className="vnext-library-dialog-actions">
              <button type="button" autoFocus onClick={() => setRestoreTarget(undefined)}>Cancelar</button>
              <button type="button" className="is-primary" onClick={() => { void confirmRestore(); }} disabled={busy}>{busy ? 'Restaurando…' : 'Restaurar catálogo'}</button>
            </div>
          </section>
        </div>
      )}

      {modelTarget && (
        <div className="vnext-library-dialog-backdrop">
          <form ref={modelDialog} className="vnext-library-dialog" role="dialog" aria-modal="true" aria-labelledby="model-title" onSubmit={(event) => { void submitUseAsModel(event); }}>
            <button type="button" className="vnext-library-dialog-close" aria-label="Fechar" onClick={() => setModelTarget(undefined)}><X size={18} /></button>
            <h2 id="model-title">Usar como modelo</h2>
            <p>Crie um novo catálogo a partir de “{modelTarget.title}”. As alterações na cópia não mudam o original.</p>
            <label>Nome do novo catálogo<input autoFocus value={modelTitle} onChange={(event) => setModelTitle(event.target.value)} maxLength={CATALOG_TITLE_MAX_LENGTH} disabled={busy} /></label>
            <div className="vnext-library-dialog-actions">
              <button type="button" onClick={() => setModelTarget(undefined)}>Cancelar</button>
              <button type="submit" className="is-primary" disabled={busy || !normalizeCatalogTitle(modelTitle)}>{busy ? 'Criando cópia…' : 'Criar e abrir catálogo'}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

export function CatalogOpenFailure({
  code,
  onBack,
  onRetry,
}: {
  readonly code: CatalogLibraryFailureCode;
  readonly onBack: () => void;
  readonly onRetry?: () => void;
}) {
  const retryable = code === 'OFFLINE' || code === 'REMOTE_FAILURE';
  // When trying again can work, it is the main action; going back stays one click away.
  const retryIsPrimary = retryable && Boolean(onRetry);
  return (
    <main className="vnext-library-shell vnext-open-failure" data-catalog-open-failure={code}>
      <section>
        <div className="vnext-brand-mark" aria-hidden="true">P</div>
        <h1>Não foi possível abrir o catálogo</h1>
        <p>{retryable ? 'Não foi possível abrir este catálogo agora. Tente novamente.' : failureMessage(code, 'load')}</p>
        <div className="vnext-open-failure-actions">
          {retryIsPrimary && <button type="button" className="vnext-library-create" onClick={onRetry}>Tentar novamente</button>}
          <button type="button" className={retryIsPrimary ? undefined : 'vnext-library-create'} onClick={onBack}>Voltar aos catálogos</button>
        </div>
      </section>
    </main>
  );
}

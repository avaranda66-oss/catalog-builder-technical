import React from 'react';
import {
  Archive,
  ArrowDownAZ,
  ArrowUpAZ,
  Clock3,
  Copy,
  FilePlus2,
  FolderOpen,
  LayoutTemplate,
  Pencil,
  Search,
  X,
} from 'lucide-react';
import type { CatalogListItem } from '../persistence';
import type {
  CatalogLibraryFailureCode,
  CatalogLibraryService,
  CatalogLibrarySort,
  CatalogLibraryView,
} from '../library';
import './styles.css';

interface CatalogLibraryProps {
  readonly service: CatalogLibraryService;
  readonly onOpen: (catalogId: string) => void;
}

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

function failureMessage(code: CatalogLibraryFailureCode, action: 'load' | 'create' | 'rename' | 'archive'): string {
  if (code === 'NOT_FOUND') return 'Este catálogo não foi encontrado. Atualize a lista e tente novamente.';
  if (code === 'UNAUTHORIZED') return 'Você não tem acesso a este catálogo. Entre novamente ou peça acesso à equipe.';
  if (code === 'OFFLINE') return 'Você está sem conexão. Conecte-se à internet e tente novamente.';
  if (code === 'REMOTE_FAILURE') return 'Não foi possível acessar a biblioteca agora. Tente novamente.';
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
  if (action === 'create') return 'Não foi possível criar o novo catálogo.';
  if (action === 'rename') return 'Não foi possível renomear este catálogo.';
  if (action === 'archive') return 'Não foi possível arquivar este catálogo.';
  return 'Não foi possível carregar a biblioteca.';
}

function CatalogRow({
  item,
  view,
  onOpen,
  onRename,
  onDuplicate,
  onArchive,
  disabled,
  duplicating,
}: {
  readonly item: CatalogListItem;
  readonly view: CatalogLibraryView;
  readonly onOpen: () => void;
  readonly onRename: () => void;
  readonly onDuplicate: () => void;
  readonly onArchive: () => void;
  readonly disabled: boolean;
  readonly duplicating: boolean;
}) {
  return (
    <article className="vnext-library-row" data-library-catalog-id={item.catalogId}>
      <div className="vnext-library-row-main">
        <h2>{item.title}</h2>
        <div className="vnext-library-meta">
          <span>{item.locale}</span>
          <span aria-hidden="true">·</span>
          <span>{view === 'archived' && item.archivedAt ? `Arquivado em ${dateLabel(item.archivedAt)}` : `Atualizado em ${dateLabel(item.updatedAt)}`}</span>
        </div>
      </div>
      {view === 'active' ? (
        <div className="vnext-library-row-actions" aria-label={`Ações de ${item.title}`}>
          <button type="button" className="is-primary" onClick={onOpen} disabled={disabled}><FolderOpen size={17} aria-hidden="true" />Abrir</button>
          <button type="button" onClick={onDuplicate} disabled={disabled}><Copy size={16} aria-hidden="true" />{duplicating ? 'Duplicando…' : 'Duplicar'}</button>
          <button type="button" onClick={onRename} disabled={disabled}><Pencil size={16} aria-hidden="true" />Renomear</button>
          <button type="button" onClick={onArchive} disabled={disabled}><Archive size={16} aria-hidden="true" />Arquivar</button>
        </div>
      ) : (
        <div className="vnext-library-archived-state">Arquivado</div>
      )}
    </article>
  );
}

export function CatalogLibrary({ service, onOpen }: CatalogLibraryProps) {
  const [view, setView] = React.useState<CatalogLibraryView>('active');
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState<CatalogLibrarySort>('updated-desc');
  const [items, setItems] = React.useState<readonly CatalogListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [renameTarget, setRenameTarget] = React.useState<CatalogListItem | undefined>();
  const [renameTitle, setRenameTitle] = React.useState('');
  const [archiveTarget, setArchiveTarget] = React.useState<CatalogListItem | undefined>();
  const [createChooserOpen, setCreateChooserOpen] = React.useState(false);
  const [duplicateTargetId, setDuplicateTargetId] = React.useState<string | undefined>();
  const loadGeneration = React.useRef(0);
  const dialogTrigger = React.useRef<HTMLElement | null>(null);
  const renameDialog = React.useRef<HTMLFormElement | null>(null);
  const archiveDialog = React.useRef<HTMLElement | null>(null);
  const createDialog = React.useRef<HTMLElement | null>(null);
  const createPending = service.getCreateState() === 'pending-verification';
  const starters = service.listStarters();

  React.useEffect(() => {
    if (createPending) {
      setCreateChooserOpen(false);
      setRenameTarget(undefined);
      setArchiveTarget(undefined);
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

  const rememberDialogTrigger = () => {
    dialogTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  React.useEffect(() => {
    if (renameTarget || archiveTarget || createChooserOpen) return;
    const trigger = dialogTrigger.current;
    dialogTrigger.current = null;
    if (trigger?.isConnected) trigger.focus();
  }, [archiveTarget, createChooserOpen, renameTarget]);

  const handleDialogKeyboard = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setRenameTarget(undefined);
      setArchiveTarget(undefined);
      setCreateChooserOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = renameDialog.current ?? archiveDialog.current ?? createDialog.current;
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

  const load = React.useCallback(async (nextView = view, nextSearch = search, nextSort = sort) => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError(undefined);
    const result = await service.list({ view: nextView, search: nextSearch, sort: nextSort });
    if (generation !== loadGeneration.current) return;
    if (result.ok) setItems(result.value);
    else {
      setItems([]);
      setError(failureMessage(result.error.code, 'load'));
    }
    setLoading(false);
  }, [service, sort, search, view]);

  React.useEffect(() => { void load(); }, [load]);

  const changeView = (nextView: CatalogLibraryView) => {
    setView(nextView);
    setSearch('');
  };

  const createBlank = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const result = await service.createBlank();
    setBusy(false);
    setCreateChooserOpen(false);
    if (!result.ok) {
      setError(failureMessage(result.error.code, 'create'));
      return;
    }
    onOpen(result.value.catalogId);
  };

  const createFromStarter = async (starterId: string) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const result = await service.createFromStarter(starterId);
    setBusy(false);
    setCreateChooserOpen(false);
    if (!result.ok) {
      setError(failureMessage(result.error.code, 'create'));
      return;
    }
    onOpen(result.value.catalogId);
  };

  const duplicateCatalog = async (item: CatalogListItem) => {
    if (busy || createPending) return;
    setBusy(true);
    setDuplicateTargetId(item.catalogId);
    setError(undefined);
    const result = await service.duplicate(item.catalogId);
    setBusy(false);
    setDuplicateTargetId(undefined);
    if (!result.ok) {
      setError(failureMessage(result.error.code, 'create'));
      return;
    }
    await load();
  };

  const verifyPendingCreate = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const result = await service.createBlank();
    setBusy(false);
    if (!result.ok) {
      setError(failureMessage(result.error.code, 'create'));
      return;
    }
    if (result.value.origin?.originKind === 'duplicate') {
      await load();
      return;
    }
    onOpen(result.value.catalogId);
  };

  const requestNewCatalog = () => {
    if (createPending) {
      void verifyPendingCreate();
      return;
    }
    rememberDialogTrigger();
    setCreateChooserOpen(true);
  };

  const submitRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!renameTarget || busy || createPending) return;
    setBusy(true);
    setError(undefined);
    const result = await service.rename(renameTarget.catalogId, renameTitle);
    setBusy(false);
    if (!result.ok) {
      setError(failureMessage(result.error.code, 'rename'));
      if (result.error.code === 'CONFLICT' || result.error.code === 'STALE_RESULT' || result.error.code === 'ARCHIVED') {
        setRenameTarget(undefined);
        await load();
      }
      return;
    }
    setRenameTarget(undefined);
    await load();
  };

  const confirmArchive = async () => {
    if (!archiveTarget || busy || createPending) return;
    const target = archiveTarget;
    setBusy(true);
    setError(undefined);
    const result = await service.archive(target.catalogId);
    setBusy(false);
    setArchiveTarget(undefined);
    if (!result.ok) {
      setError(failureMessage(result.error.code, 'archive'));
      await load();
      return;
    }
    setItems((current) => current.filter((item) => item.catalogId !== target.catalogId));
  };

  const hasItems = items.length > 0;
  const emptySearch = !loading && !hasItems && search.trim().length > 0;
  const emptyView = !loading && !hasItems && !search.trim();

  return (
    <main className="vnext-library-shell" data-catalog-library="" onKeyDown={handleDialogKeyboard}>
      <header className="vnext-library-header">
        <div className="vnext-brand">
          <div className="vnext-brand-mark" aria-hidden="true">P</div>
          <div>
            <div className="vnext-product-line">PRESYS · Catalog Builder</div>
            <h1>Catálogos</h1>
          </div>
        </div>
        <button
          type="button"
          className="vnext-library-create"
          onClick={requestNewCatalog}
          disabled={busy}
          aria-label={busy ? (createPending ? 'Verificando criação' : 'Criando catálogo') : (createPending ? 'Verificar criação' : 'Novo catálogo')}
        >
          <FilePlus2 size={18} aria-hidden="true" />
          <span>{busy ? (createPending ? 'Verificando…' : 'Criando…') : (createPending ? 'Verificar criação' : 'Novo catálogo')}</span>
        </button>
      </header>

      <section className="vnext-library-content" aria-labelledby="library-heading">
        <div className="vnext-library-intro">
          <div>
            <span className="vnext-library-eyebrow">Biblioteca</span>
            <h2 id="library-heading">Seus catálogos técnicos</h2>
            <p>Encontre um catálogo, continue o trabalho ou comece um novo.</p>
          </div>
        </div>

        <div className="vnext-library-toolbar">
          <div className="vnext-library-tabs" role="tablist" aria-label="Estado dos catálogos">
            <button type="button" role="tab" aria-selected={view === 'active'} className={view === 'active' ? 'is-selected' : undefined} onClick={() => changeView('active')}>Ativos</button>
            <button type="button" role="tab" aria-selected={view === 'archived'} className={view === 'archived' ? 'is-selected' : undefined} onClick={() => changeView('archived')}>Arquivados</button>
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

        {error && (
          <div className="vnext-library-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => { if (createPending) void verifyPendingCreate(); else void load(); }}>
              {createPending ? 'Verificar criação' : 'Tentar novamente'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="vnext-library-loading" role="status">Carregando catálogos…</div>
        ) : hasItems ? (
          <div className="vnext-library-list" aria-live="polite">
            {items.map((item) => (
              <CatalogRow
                key={item.catalogId}
                item={item}
                view={view}
                onOpen={() => { if (!busy && !createPending) onOpen(item.catalogId); }}
                onDuplicate={() => { void duplicateCatalog(item); }}
                onRename={() => { if (!busy && !createPending) { rememberDialogTrigger(); setRenameTarget(item); setRenameTitle(item.title); } }}
                onArchive={() => { if (!busy && !createPending) { rememberDialogTrigger(); setArchiveTarget(item); } }}
                disabled={busy || createPending}
                duplicating={duplicateTargetId === item.catalogId}
              />
            ))}
          </div>
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
            <p>Comece em branco ou use um modelo inicial preparado.</p>
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
      </section>

      {createChooserOpen && (
        <div className="vnext-library-dialog-backdrop">
          <section ref={createDialog} className="vnext-library-dialog vnext-library-create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <button type="button" className="vnext-library-dialog-close" aria-label="Fechar" onClick={() => setCreateChooserOpen(false)}><X size={18} /></button>
            <h2 id="create-title">Novo catálogo</h2>
            <p>Escolha um ponto de partida. Depois de criado, o catálogo será totalmente independente.</p>
            <div className="vnext-library-create-options">
              <button type="button" autoFocus onClick={() => { void createBlank(); }} disabled={busy}>
                <FilePlus2 size={20} aria-hidden="true" />
                <span><strong>Em branco</strong><small>Comece com uma página vazia.</small></span>
              </button>
              {starters.map((starter) => (
                <button key={starter.starterId} type="button" onClick={() => { void createFromStarter(starter.starterId); }} disabled={busy}>
                  <LayoutTemplate size={20} aria-hidden="true" />
                  <span><strong>{starter.label}</strong>{starter.description && <small>{starter.description}</small>}</span>
                </button>
              ))}
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
            <p>Ele sairá da lista de catálogos ativos e passará a aparecer em Arquivados. O catálogo não será excluído permanentemente.</p>
            <div className="vnext-library-dialog-actions">
              <button type="button" autoFocus onClick={() => setArchiveTarget(undefined)}>Cancelar</button>
              <button type="button" className="is-danger" onClick={() => { void confirmArchive(); }} disabled={busy}>{busy ? 'Arquivando…' : 'Arquivar catálogo'}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export function CatalogOpenFailure({ code, onBack }: { readonly code: CatalogLibraryFailureCode; readonly onBack: () => void }) {
  return (
    <main className="vnext-library-shell vnext-open-failure" data-catalog-open-failure={code}>
      <section>
        <div className="vnext-brand-mark" aria-hidden="true">P</div>
        <h1>Não foi possível abrir o catálogo</h1>
        <p>{failureMessage(code, 'load')}</p>
        <button type="button" className="vnext-library-create" onClick={onBack}>Voltar aos catálogos</button>
      </section>
    </main>
  );
}

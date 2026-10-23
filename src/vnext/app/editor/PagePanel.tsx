import React from 'react';
import { ArrowDown, ArrowUp, Copy, FileText, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import type { DocumentSession } from '../../application';
import type { Page } from '../../domain';
import { describePageObjects, pageHeadline, pageLabel } from '../../editor/page-summary';
import { pageTitle } from '../../editor/page-title';
import { PageThumbnail, pageThumbnailSignature, type PageThumbnailDocument } from './PageThumbnail';
import './PagePanel.css';

export const LAST_PAGE_MESSAGE = 'O catálogo precisa ter pelo menos uma página. Adicione outra página antes de excluir esta.';
const MENU_ESTIMATED_HEIGHT_PX = 200;

type PageAction = 'duplicate' | 'move-up' | 'move-down' | 'delete';

export type PagePanelProps = {
  readonly pages: readonly Page[];
  readonly currentPageId: string;
  readonly session: Pick<DocumentSession, 'execute' | 'getSnapshot'>;
  /** Concludes or settles any open edit; returns false when the edit must stay open. */
  readonly prepareForChange: () => boolean;
  readonly onSelectPage: (pageId: string) => void;
  readonly onAddPage: () => void;
  readonly onStatus: (message: string) => void;
  /** Extra controls under "Adicionar página" (page models). */
  readonly children?: React.ReactNode;
  /** FR-18: when given, each page shows a small picture of itself and its first title. */
  readonly thumbnails?: {
    readonly document: PageThumbnailDocument;
    readonly assetUrls: ReadonlyMap<string, string>;
  };
};

/**
 * Page list with a "⋯" menu per page: Duplicar, Mover para cima, Mover para
 * baixo and Excluir (with a confirmation that names the page and what is on
 * it). Every change goes through the existing page.* actions, so Desfazer
 * (Ctrl+Z) brings it back.
 */
export function PagePanel({ pages, currentPageId, session, prepareForChange, onSelectPage, onAddPage, onStatus, children, thumbnails }: PagePanelProps) {
  const [menuPageId, setMenuPageIdState] = React.useState<string | null>(null);
  const [menuPosition, setMenuPosition] = React.useState<React.CSSProperties>({});
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [focusRequest, setFocusRequest] = React.useState<{ pageId: string; target: 'trigger' | 'page' } | null>(null);
  const triggerRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const pageRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);
  const idPrefix = React.useId();
  const defaultText = thumbnails?.document.style.defaultText;
  const titles = React.useMemo(() => new Map(thumbnails ? pages.map((page) => [page.id, pageTitle(page, defaultText)] as const) : []),
    [defaultText, pages, thumbnails]);

  /** The menu is fixed-positioned next to its "⋯" so the scrolling page list never clips it. */
  const setMenuPageId = (pageId: string | null) => {
    const rect = pageId ? triggerRefs.current.get(pageId)?.getBoundingClientRect() : undefined;
    if (rect) {
      const opensUp = rect.bottom + MENU_ESTIMATED_HEIGHT_PX > window.innerHeight && rect.top > MENU_ESTIMATED_HEIGHT_PX;
      setMenuPosition(opensUp
        ? { position: 'fixed', left: rect.left, bottom: window.innerHeight - rect.top + 4 }
        : { position: 'fixed', left: rect.left, top: rect.bottom + 4 });
    }
    setMenuPageIdState(pageId);
  };

  React.useEffect(() => {
    if (!focusRequest) return;
    const refs = focusRequest.target === 'trigger' ? triggerRefs.current : pageRefs.current;
    (refs.get(focusRequest.pageId) ?? pageRefs.current.get(currentPageId))?.focus();
    setFocusRequest(null);
  }, [currentPageId, focusRequest]);

  React.useEffect(() => {
    if (!menuPageId) return undefined;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (menuRef.current?.contains(target) || triggerRefs.current.get(menuPageId)?.contains(target))) return;
      setMenuPageIdState(null);
    };
    window.document.addEventListener('pointerdown', closeOnOutside, true);
    return () => window.document.removeEventListener('pointerdown', closeOnOutside, true);
  }, [menuPageId]);

  React.useEffect(() => {
    if (pendingDeleteId) cancelRef.current?.focus();
  }, [pendingDeleteId]);

  React.useEffect(() => {
    if (menuPageId && !pages.some((page) => page.id === menuPageId)) setMenuPageIdState(null);
    if (pendingDeleteId && !pages.some((page) => page.id === pendingDeleteId)) setPendingDeleteId(null);
  }, [menuPageId, pages, pendingDeleteId]);

  const livePages = () => session.getSnapshot().document.pages;

  const closeMenu = (pageId: string) => {
    setMenuPageId(null);
    setFocusRequest({ pageId, target: 'trigger' });
  };

  const duplicatePage = (pageId: string) => {
    if (!prepareForChange()) return;
    const index = livePages().findIndex((page) => page.id === pageId);
    if (index < 0) return;
    const result = session.execute({ type: 'page.duplicate', pageId });
    if (!result.ok) {
      onStatus('Não foi possível duplicar a página. Nada foi alterado.');
      return;
    }
    const copyId = result.metadata.createdIds[0];
    if (copyId) onSelectPage(copyId);
    onStatus(`${pageLabel(index)} duplicada. A cópia é a ${pageLabel(index + 1)}. Para voltar, use Desfazer.`);
    setFocusRequest({ pageId: copyId ?? pageId, target: 'page' });
  };

  const movePage = (pageId: string, direction: 'up' | 'down') => {
    const index = livePages().findIndex((page) => page.id === pageId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= livePages().length) return;
    if (!prepareForChange()) return;
    const result = session.execute({ type: 'page.reorder', pageId, targetIndex });
    if (!result.ok) {
      onStatus('Não foi possível mover a página. Nada foi alterado.');
      return;
    }
    onStatus(`${pageLabel(index)} movida para ${direction === 'up' ? 'cima' : 'baixo'}. Agora ela é a ${pageLabel(targetIndex)}.`);
  };

  const requestDelete = (pageId: string) => {
    if (livePages().length <= 1) {
      onStatus(LAST_PAGE_MESSAGE);
      return;
    }
    setPendingDeleteId(pageId);
  };

  const cancelDelete = () => {
    const pageId = pendingDeleteId;
    setPendingDeleteId(null);
    if (pageId) setFocusRequest({ pageId, target: 'trigger' });
  };

  const confirmDelete = () => {
    const pageId = pendingDeleteId;
    if (!pageId) return;
    setPendingDeleteId(null);
    if (!prepareForChange()) return;
    const before = livePages();
    const index = before.findIndex((page) => page.id === pageId);
    if (index < 0) return;
    const result = session.execute({ type: 'page.delete', pageId });
    if (!result.ok) {
      onStatus(result.error.code === 'LAST_PAGE_REQUIRED'
        ? LAST_PAGE_MESSAGE
        : 'Não foi possível excluir a página. Nada foi alterado.');
      return;
    }
    const neighbor = before[index + 1] ?? before[index - 1];
    if (pageId === currentPageId && neighbor) onSelectPage(neighbor.id);
    onStatus(`${pageLabel(index)} excluída. Para recuperar, use Desfazer.`);
    const focusId = pageId === currentPageId ? neighbor?.id : currentPageId;
    if (focusId) setFocusRequest({ pageId: focusId, target: 'page' });
  };

  const runAction = (pageId: string, action: PageAction) => {
    setMenuPageId(null);
    if (action === 'duplicate') duplicatePage(pageId);
    else if (action === 'move-up') { movePage(pageId, 'up'); setFocusRequest({ pageId, target: 'trigger' }); }
    else if (action === 'move-down') { movePage(pageId, 'down'); setFocusRequest({ pageId, target: 'trigger' }); }
    else requestDelete(pageId);
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, pageId: string) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    const current = items.indexOf(window.document.activeElement as HTMLButtonElement);
    const focusAt = (index: number) => items[(index + items.length) % items.length]?.focus();
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(pageId); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); focusAt(current + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); focusAt(current - 1); }
    else if (event.key === 'Home') { event.preventDefault(); focusAt(0); }
    else if (event.key === 'End') { event.preventDefault(); focusAt(items.length - 1); }
    else if (event.key === 'Tab') setMenuPageId(null);
  };

  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelDelete(); return; }
    if (event.key !== 'Tab') return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.indexOf(window.document.activeElement as HTMLButtonElement);
    const next = event.shiftKey ? (index <= 0 ? buttons.length - 1 : index - 1) : (index + 1) % buttons.length;
    event.preventDefault();
    buttons[next]?.focus();
  };

  const pendingIndex = pendingDeleteId ? pages.findIndex((page) => page.id === pendingDeleteId) : -1;
  const pendingPage = pendingIndex >= 0 ? pages[pendingIndex] : undefined;
  const pendingHeadline = pendingPage ? pageHeadline(pendingPage) : '';

  return (
    <aside className="vnext-pages" aria-label="Páginas do catálogo">
      <div className="vnext-panel-heading"><span>Páginas</span><span>{pages.length}</span></div>
      <nav className="vnext-page-list" aria-label="Navegação de páginas">
        {pages.map((page, index) => {
          const current = page.id === currentPageId;
          const open = menuPageId === page.id;
          const label = pageLabel(index);
          const menuId = `${idPrefix}-menu-${index}`;
          const title = titles.get(page.id) ?? '';
          return (
            <div key={page.id} className={thumbnails ? 'vnext-page-row has-thumbnail' : 'vnext-page-row'} data-page-row={page.id}>
              <button
                ref={(node) => { if (node) pageRefs.current.set(page.id, node); else pageRefs.current.delete(page.id); }}
                type="button"
                data-page-nav-id={page.id}
                data-authoring-context-transition=""
                className={current ? 'is-current' : undefined}
                aria-current={current ? 'page' : undefined}
                title={title || undefined}
                onClick={() => onSelectPage(page.id)}
              >
                {thumbnails
                  ? <PageThumbnail page={page} document={thumbnails.document} assetUrls={thumbnails.assetUrls}
                    numbering={{ firstPageNumber: index + 1, pageCount: pages.length }}
                    signature={pageThumbnailSignature(page, thumbnails.document, { firstPageNumber: index + 1, pageCount: pages.length })} />
                  : <span className="vnext-page-icon" aria-hidden="true"><FileText size={16} /></span>}
                <span className="vnext-page-label">
                  <span>{label}</span>
                  {/* The title is drawn from an attribute so the page's own words are not repeated as text on screen readers or searches; the button's title attribute describes it. */}
                  {title && <span className="vnext-page-title" aria-hidden="true" data-page-title={title} />}
                </span>
              </button>
              <button
                ref={(node) => { if (node) triggerRefs.current.set(page.id, node); else triggerRefs.current.delete(page.id); }}
                type="button"
                className="vnext-page-menu-trigger"
                data-page-menu-trigger={page.id}
                aria-label={`Opções da ${label}`}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                title={`Opções da ${label}`}
                onClick={() => setMenuPageId(open ? null : page.id)}
              >
                <MoreHorizontal size={18} aria-hidden="true" />
              </button>
              {open && (
                <div
                  ref={menuRef}
                  id={menuId}
                  role="menu"
                  aria-label={`Opções da ${label}`}
                  className="vnext-page-menu"
                  style={menuPosition}
                  onKeyDown={(event) => onMenuKeyDown(event, page.id)}
                >
                  <button type="button" role="menuitem" data-page-action="duplicate" data-authoring-context-transition=""
                    onClick={() => runAction(page.id, 'duplicate')}>
                    <Copy size={16} aria-hidden="true" />Duplicar página
                  </button>
                  <button type="button" role="menuitem" data-page-action="move-up" data-authoring-context-transition=""
                    disabled={index === 0} onClick={() => runAction(page.id, 'move-up')}>
                    <ArrowUp size={16} aria-hidden="true" />Mover para cima
                  </button>
                  <button type="button" role="menuitem" data-page-action="move-down" data-authoring-context-transition=""
                    disabled={index === pages.length - 1} onClick={() => runAction(page.id, 'move-down')}>
                    <ArrowDown size={16} aria-hidden="true" />Mover para baixo
                  </button>
                  <button type="button" role="menuitem" data-page-action="delete" className="is-danger"
                    aria-disabled={pages.length <= 1 ? 'true' : undefined}
                    aria-describedby={pages.length <= 1 ? `${menuId}-note` : undefined}
                    onClick={() => runAction(page.id, 'delete')}>
                    <Trash2 size={16} aria-hidden="true" />Excluir página…
                  </button>
                  {pages.length <= 1 && (
                    <p id={`${menuId}-note`} className="vnext-page-menu-note">O catálogo precisa ter pelo menos uma página.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <button type="button" className="vnext-add-page" data-authoring-context-transition="" onClick={onAddPage} aria-label="Adicionar nova página após a página atual"><Plus size={17} aria-hidden="true" />Adicionar página</button>
      {children}
      {pendingPage && (
        <div className="vnext-page-confirm-backdrop">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`${idPrefix}-confirm-title`}
            aria-describedby={`${idPrefix}-confirm-text`}
            className="vnext-page-confirm"
            data-page-delete-confirmation={pendingPage.id}
            onKeyDown={onDialogKeyDown}
          >
            <h2 id={`${idPrefix}-confirm-title`}>Excluir a {pageLabel(pendingIndex)}?</h2>
            <div id={`${idPrefix}-confirm-text`}>
              {pendingHeadline && <p>Ela começa com “{pendingHeadline}”.</p>}
              <p>{describePageObjects(pendingPage)}</p>
              <p>Tudo o que está nela será excluído. Se mudar de ideia, use Desfazer (Ctrl+Z).</p>
            </div>
            <div className="vnext-page-confirm-actions">
              <button ref={cancelRef} type="button" data-page-confirm="cancel" onClick={cancelDelete}>Cancelar</button>
              <button type="button" className="is-danger" data-page-confirm="delete" onClick={confirmDelete}>
                Excluir {pageLabel(pendingIndex)}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

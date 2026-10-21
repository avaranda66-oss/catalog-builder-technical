import React from 'react';
import { findObjectInTree, walkPageObjects, type CatalogDocument, type Diagnostic } from '../../domain';
import { W2D_DIAGNOSTIC_CODES } from '../authoring-diagnostics';
import { projectLayoutDiagnostics, type ProjectedLayoutDiagnostic } from '../layout-diagnostics-projection';
import { publicationDiagnosticText } from '../publication-diagnostic-presentation';
import { ISSUE_FIXES } from './issue-fixes';

/** A request from outside the editor (the publication review) to show one problem. `id` makes repeats distinct. */
export interface EditorLocateRequest {
  readonly id: number;
  readonly diagnostic: Diagnostic;
  /**
   * Called once the editor has used the request, so the owner can drop it: an editor that mounts again later (for
   * example after the recovery check) must not jump to an old problem on its own.
   */
  readonly onHandled?: (id: number) => void;
}

/** What should receive keyboard focus once the editor shows the located object. */
interface PendingFocus {
  readonly objectId: string;
  readonly grid: boolean;
  /** The selection when the request started; any other selection change cancels the pending focus. */
  readonly from?: string;
}

function focusTarget(document: CatalogDocument, target: ProjectedLayoutDiagnostic, from?: string): PendingFocus | undefined {
  if (target.containerGroupId) return target.topLevelObjectId ? { objectId: target.topLevelObjectId, grid: false, from } : undefined;
  if (!target.objectId) return undefined;
  const page = document.pages.find((candidate) => candidate.id === target.pageId);
  const object = page?.objects.find((candidate) => candidate.id === target.objectId);
  return { objectId: target.objectId, grid: object?.type === 'table' && Boolean(target.cellId || target.rowId), from };
}

/**
 * Converts an engine diagnostic into the target the editor's existing "Localizar" logic understands.
 * Table diagnostics that only name the table get their table object; grouped children resolve to their group.
 */
export function locatableIssue(document: CatalogDocument, diagnostic: Diagnostic): ProjectedLayoutDiagnostic | undefined {
  const page = document.pages.find((candidate) => candidate.id === diagnostic.pageId);
  if (!page) return undefined;
  const objectId = diagnostic.objectId ?? (diagnostic.tableId
    ? walkPageObjects(page).find(({ object }) => object.type === 'table' && object.table.id === diagnostic.tableId)?.object.id
    : undefined);
  if (!objectId) return undefined;
  const entry = findObjectInTree(document, objectId);
  if (!entry || entry.page.id !== page.id) return undefined;
  const topLevelId = entry.parentGroup?.id ?? objectId;
  return projectLayoutDiagnostics(document, [{ ...diagnostic, objectId }], page.id, topLevelId)[0];
}

export interface IssueNavigationOptions {
  readonly document: CatalogDocument;
  readonly request?: EditorLocateRequest;
  /** Finishes any open text or cell edit; navigation is refused when it cannot. */
  readonly prepare: () => boolean;
  readonly locate: (target: ProjectedLayoutDiagnostic) => void;
  readonly showPage: (pageId: string) => void;
  readonly openDiagnostics: () => void;
  /** Shows a sentence in the editor's message area. */
  readonly announce: (message: string) => void;
  readonly selectedObjectId?: string;
  readonly selectedHasProblems: boolean;
}

/**
 * C-04: after "Corrigir este item" the review is closed. Arriving from it, the person is told how to check again.
 */
export const RETURN_TO_REVIEW_HINT = 'Depois de corrigir, clique em Publicar / PDF para verificar de novo.';

/** What to tell the person on arrival when the side panel cannot list the problem (content checks). */
export function arrivalMessage(diagnostic: Diagnostic): string {
  const fix = ISSUE_FIXES[diagnostic.code];
  const text = publicationDiagnosticText(diagnostic);
  return fix ? `${text} Para resolver de uma vez, abra a lista de problemas acima da página e use “${fix.label}”.` : text;
}

/**
 * FR-13: one way to reach a problem from the issues list or from "Corrigir este item", reusing the editor's locate
 * logic. Layout problems open the object's problem list; content problems (provisional text, empty rows, soft
 * images) are explained in the message area, since the side list only shows layout problems. The object's problem
 * list also opens by default when the selected object has problems (once per selection, so closing it stays closed).
 */
export function useIssueNavigation(options: IssueNavigationOptions): (diagnostic: Diagnostic) => void {
  const latest = React.useRef(options);
  latest.current = options;
  const pendingFocus = React.useRef<PendingFocus>();
  const goTo = React.useCallback((diagnostic: Diagnostic, fromReview = false) => {
    const { document, prepare, locate, showPage, openDiagnostics, announce, selectedObjectId } = latest.current;
    if (!prepare()) return;
    const listedBeside = W2D_DIAGNOSTIC_CODES.has(diagnostic.code);
    // Announce first: guidance from the locate logic itself (for example, a grouped table) must win.
    if (!listedBeside) announce(fromReview ? `${arrivalMessage(diagnostic)} ${RETURN_TO_REVIEW_HINT}` : arrivalMessage(diagnostic));
    else if (fromReview) announce(RETURN_TO_REVIEW_HINT);
    const target = locatableIssue(document, diagnostic);
    if (target) {
      pendingFocus.current = focusTarget(document, target, selectedObjectId);
      locate(target);
      if (listedBeside) openDiagnostics();
      return;
    }
    if (diagnostic.pageId && document.pages.some((page) => page.id === diagnostic.pageId)) showPage(diagnostic.pageId);
  }, []);

  const { request, selectedObjectId, selectedHasProblems } = options;
  const handledRequest = React.useRef<number>();
  React.useEffect(() => {
    if (!request || handledRequest.current === request.id) return;
    handledRequest.current = request.id;
    request.onHandled?.(request.id);
    goTo(request.diagnostic, true);
  }, [request, goTo]);

  // The locate logic focuses the object right away, but a request from the review changes the page outside a click,
  // so the new page is drawn later. Focus again once the editor shows the located object.
  React.useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    if (selectedObjectId !== pending.objectId) {
      if (selectedObjectId !== pending.from) pendingFocus.current = undefined;
      return;
    }
    pendingFocus.current = undefined;
    const root = globalThis.document;
    const element = (pending.grid ? root.querySelector<HTMLElement>('[data-table-grid-overlay]') : null)
      ?? root.querySelector<HTMLElement>(`[data-editor-object-id="${CSS.escape(pending.objectId)}"]`);
    if (element && root.activeElement !== element) element.focus();
  });

  const openedFor = React.useRef<string>();
  React.useEffect(() => {
    if (!selectedObjectId) {
      openedFor.current = undefined;
      return;
    }
    if (selectedHasProblems && openedFor.current !== selectedObjectId) {
      openedFor.current = selectedObjectId;
      latest.current.openDiagnostics();
    }
  }, [selectedObjectId, selectedHasProblems]);

  // The editor's own issue list never passes the "from the review" flag (an event as second argument must not either).
  return React.useCallback((diagnostic: Diagnostic) => goTo(diagnostic), [goTo]);
}

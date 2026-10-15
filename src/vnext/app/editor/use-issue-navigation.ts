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
  const goTo = React.useCallback((diagnostic: Diagnostic) => {
    const { document, prepare, locate, showPage, openDiagnostics, announce } = latest.current;
    if (!prepare()) return;
    const listedBeside = W2D_DIAGNOSTIC_CODES.has(diagnostic.code);
    // Announce first: guidance from the locate logic itself (for example, a grouped table) must win.
    if (!listedBeside) announce(arrivalMessage(diagnostic));
    const target = locatableIssue(document, diagnostic);
    if (target) {
      locate(target);
      if (listedBeside) openDiagnostics();
      return;
    }
    if (diagnostic.pageId && document.pages.some((page) => page.id === diagnostic.pageId)) showPage(diagnostic.pageId);
  }, []);

  const { request, selectedObjectId, selectedHasProblems } = options;
  React.useEffect(() => {
    if (request) goTo(request.diagnostic);
  }, [request, goTo]);

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

  return goTo;
}

import React from 'react';
import type { DocumentSession } from '../../application';
import type { CatalogDocument, Diagnostic } from '../../domain';
import type { FitHeightMeasurement } from '../../editor/table-fit-height-authoring';
import { contentDiagnostics } from '../../publication/preflight';
import { publicationDiagnosticLocation, publicationDiagnosticText } from '../publication-diagnostic-presentation';
import { issueFixFor } from './issue-fixes';
import './IssuesPanel.css';

const MEASURING_CODES = new Set(['RENDER_GEOMETRY_MISMATCH', 'LAYOUT_UNSTABLE']);

function issueKey(issue: Diagnostic): string {
  return [issue.code, issue.severity, issue.pageId, issue.objectId, issue.tableId, issue.rowId, issue.cellId, issue.annotationId]
    .map((part) => part ?? '').join('|');
}

/** Editor problems plus the content checks the PDF review applies (provisional text, empty rows, soft images). */
export function editorIssues(document: CatalogDocument, diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const unique = new Map<string, Diagnostic>();
  for (const issue of [...diagnostics, ...contentDiagnostics(document)]) if (!unique.has(issueKey(issue))) unique.set(issueKey(issue), issue);
  const pageOrder = new Map(document.pages.map((page, index) => [page.id, index]));
  const order = (issue: Diagnostic) => issue.pageId === undefined ? -1 : pageOrder.get(issue.pageId) ?? document.pages.length;
  return [...unique.values()].sort((left, right) => order(left) - order(right)
    || (left.severity === right.severity ? 0 : left.severity === 'ERROR' ? -1 : 1));
}

function issueText(issue: Diagnostic): string {
  return MEASURING_CODES.has(issue.code)
    ? 'A página ainda está sendo medida. Aguarde alguns segundos.'
    : publicationDiagnosticText(issue);
}

export interface IssuesPanelProps {
  document: CatalogDocument;
  /** Every editor diagnostic of the catalog (all pages). */
  diagnostics: readonly Diagnostic[];
  simple: boolean;
  onLocate: (diagnostic: Diagnostic) => void;
  session: DocumentSession;
  measurement?: FitHeightMeasurement | null;
  /** Finishes any open edit before a fix changes the catalog. */
  prepare: () => boolean;
  onMessage: (message: string) => void;
}

/** FR-13: the problem counter is a button; it opens the list of every page's problems with "Ir até lá". */
export function IssuesPanel({ document, diagnostics, simple, onLocate, session, measurement, prepare, onMessage }: IssuesPanelProps) {
  const [open, setOpen] = React.useState(false);
  const wrapper = React.useRef<HTMLDivElement>(null);
  const toggle = React.useRef<HTMLButtonElement>(null);
  const issues = React.useMemo(() => editorIssues(document, diagnostics), [document, diagnostics]);
  const errors = issues.filter((issue) => issue.severity === 'ERROR').length;
  const warnings = issues.length - errors;

  React.useEffect(() => {
    if (issues.length === 0) setOpen(false);
  }, [issues.length]);
  React.useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false);
    };
    globalThis.document.addEventListener('pointerdown', outside);
    return () => globalThis.document.removeEventListener('pointerdown', outside);
  }, [open]);

  if (issues.length === 0) return null;
  const close = () => { setOpen(false); toggle.current?.focus(); };
  const label = simple ? `${errors} a corrigir · ${warnings} para revisar` : `${errors} erro(s) · ${warnings} aviso(s)`;
  const groups = new Map<number, Diagnostic[]>();
  for (const issue of issues) {
    const index = document.pages.findIndex((page) => page.id === issue.pageId);
    groups.set(index, [...(groups.get(index) ?? []), issue]);
  }

  return (
    <div className="vnext-issues" ref={wrapper}>
      <button
        ref={toggle}
        type="button"
        className={'vnext-diagnostic-summary vnext-issues-toggle ' + (errors > 0 ? 'is-error' : 'is-warning')}
        data-page-diagnostic-summary=""
        data-editor-action="open-issues"
        aria-expanded={open}
        aria-controls="vnext-issues-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="vnext-visually-hidden">Problemas do catálogo: </span>{label}
      </button>
      {open && (
        <section
          id="vnext-issues-panel"
          className="vnext-issues-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="vnext-issues-heading"
          onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}
        >
          <header>
            <h2 id="vnext-issues-heading">Problemas do catálogo</h2>
            <button type="button" className="vnext-btn-secondary" onClick={close}>Fechar lista</button>
          </header>
          <p className="vnext-issues-summary">{errors > 0
            ? 'Os itens “Corrigir” impedem o PDF. Os itens “Revisar” não impedem, mas merecem atenção.'
            : 'Nada impede o PDF. Confira os pontos abaixo.'}</p>
          {[...groups.entries()].map(([pageIndex, pageIssues]) => (
            <section key={pageIndex} className="vnext-issues-page" aria-label={pageIndex >= 0 ? `Página ${pageIndex + 1}` : 'Catálogo'}>
              <h3>{pageIndex >= 0 ? `Página ${pageIndex + 1}` : 'Catálogo'}</h3>
              <ul>
                {pageIssues.map((issue) => {
                  const fix = issueFixFor({ document, session, diagnostic: issue, measurement });
                  return (
                    <li key={issueKey(issue)} className="vnext-publication-diagnostic" data-severity={issue.severity} data-issue-code={issue.code}>
                      <strong className="vnext-diagnostic-location">{publicationDiagnosticLocation(document, issue)}</strong>
                      <span className="vnext-diagnostic-kind">{issue.severity === 'ERROR' ? 'Corrigir' : 'Revisar'}</span>
                      <p className="vnext-diagnostic-message">{issueText(issue)}</p>
                      <div className="vnext-issues-actions">
                        {issue.pageId && (
                          <button type="button" className="vnext-btn-secondary" data-issue-action="locate" data-authoring-context-transition=""
                            onClick={() => { setOpen(false); onLocate(issue); }}>Ir até lá</button>
                        )}
                        {fix && (
                          <button type="button" className="vnext-btn-secondary" data-issue-action="fix"
                            onClick={() => {
                              if (!prepare()) return;
                              onMessage(fix.run({ document: session.getSnapshot().document, session, diagnostic: issue, measurement }).message);
                            }}>{fix.label}</button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </section>
      )}
    </div>
  );
}

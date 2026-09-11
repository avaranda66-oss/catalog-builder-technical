import React from 'react';
import { createPortal } from 'react-dom';
import type { CatalogDocument, Diagnostic } from '../domain';
import { captureSnapshot, compilePlans, DocumentRenderer, measureTables } from '../rendering';
import { authoredFrameDiagnostics, layoutReport } from '../publication';

export const W2D_DIAGNOSTIC_CODES = new Set([
  'SAFE_AREA_VIOLATION',
  'OBJECT_OUTSIDE_PAGE',
  'TEXT_OBJECT_OVERFLOW',
  'TABLE_CONTENT_OVERFLOW',
  'TABLE_WIDTH_INFEASIBLE',
]);

function diagnosticKey(diagnostic: Diagnostic): string {
  return [
    diagnostic.code,
    diagnostic.severity,
    diagnostic.pageId ?? '',
    diagnostic.objectId ?? '',
    diagnostic.tableId ?? '',
    diagnostic.rowId ?? '',
    diagnostic.cellId ?? '',
    diagnostic.annotationId ?? '',
    diagnostic.details,
  ].join('|');
}

export function mergeDiagnostics(...groups: readonly (readonly Diagnostic[])[]): Diagnostic[] {
  const byKey = new Map<string, Diagnostic>();
  for (const diagnostic of groups.flat()) byKey.set(diagnosticKey(diagnostic), diagnostic);
  return [...byKey.values()].sort((left, right) => diagnosticKey(left).localeCompare(diagnosticKey(right)));
}

export function immediateAuthoringDiagnostics(document: CatalogDocument): Diagnostic[] {
  const compiled = compilePlans(document);
  return mergeDiagnostics(authoredFrameDiagnostics(document), compiled.diagnostics);
}

export function isCurrentDiagnosticSource(current: CatalogDocument, source: CatalogDocument): boolean {
  return current === source;
}

export function diagnosticMessage(diagnostic: Diagnostic): string {
  switch (diagnostic.code) {
    case 'SAFE_AREA_VIOLATION':
      return 'O objeto cruza a área segura. A posição é permitida, mas revise a margem antes de publicar.';
    case 'OBJECT_OUTSIDE_PAGE':
      return 'Parte do objeto está fora da página física. Corrija a posição ou o tamanho para liberar a publicação.';
    case 'TEXT_OBJECT_OVERFLOW':
      return 'O texto não cabe no quadro criado. Ajuste o conteúdo ou redimensione o quadro manualmente.';
    case 'TABLE_CONTENT_OVERFLOW':
      return 'O conteúdo da tabela ultrapassa a altura criada. Redimensione o quadro ou ajuste o conteúdo manualmente.';
    case 'TABLE_WIDTH_INFEASIBLE':
      return 'A largura criada não comporta as restrições das colunas. A tabela continua com a largura escolhida até você corrigir.';
    default:
      return diagnostic.details;
  }
}

export interface EditorDiagnosticsProbeProps {
  document: CatalogDocument;
  assetUrls: ReadonlyMap<string, string>;
  onDiagnostics(source: CatalogDocument, diagnostics: readonly Diagnostic[]): void;
}

function probeRendererCss(): string {
  const rules: string[] = [];
  for (const sheet of [...window.document.styleSheets]) {
    try {
      for (const rule of [...sheet.cssRules]) {
        const cssText = rule.cssText;
        if (cssText.includes('[data-editorial-root]') || cssText.startsWith('@font-face')) rules.push(cssText);
      }
    } catch {
      // Same-origin Vite styles are readable; ignore unrelated opaque sheets.
    }
  }
  return rules.join('\n');
}

export function EditorDiagnosticsProbe({ document, assetUrls, onDiagnostics }: EditorDiagnosticsProbeProps) {
  const compiled = React.useMemo(() => compilePlans(document), [document]);
  const [, forceRender] = React.useReducer((value: number) => value + 1, 0);
  const hostRef = React.useRef<HTMLDivElement>(null);
  const probeRootRef = React.useRef<HTMLDivElement>(null);
  const shadowRootRef = React.useRef<ShadowRoot | null>(null);
  const [shadowRoot, setShadowRoot] = React.useState<ShadowRoot | null>(null);
  const [probeCss, setProbeCss] = React.useState('');

  React.useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || shadowRootRef.current) return;
    setProbeCss(probeRendererCss());
    const root = host.attachShadow({ mode: 'closed' });
    shadowRootRef.current = root;
    setShadowRoot(root);
  }, []);

  React.useLayoutEffect(() => {
    if (!shadowRoot) return;
    let cancelled = false;
    let frame = 0;
    const run = async () => {
      try {
        if (window.document.fonts?.ready) await window.document.fonts.ready;
        if (cancelled) return;
        const root = probeRootRef.current?.querySelector<HTMLElement>('[data-editorial-root]');
        if (!root) return;
        measureTables(document, compiled.plans, root);
        forceRender();
        frame = window.requestAnimationFrame(async () => {
          if (cancelled) return;
          try {
            const snapshot = await captureSnapshot(document, compiled.plans, root);
            if (cancelled) return;
            onDiagnostics(document, mergeDiagnostics(compiled.diagnostics, layoutReport(document, compiled.plans, snapshot, root)));
          } catch {
            if (!cancelled) onDiagnostics(document, immediateAuthoringDiagnostics(document));
          }
        });
      } catch {
        if (!cancelled) onDiagnostics(document, immediateAuthoringDiagnostics(document));
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [compiled, document, onDiagnostics, shadowRoot]);

  return (
    <div ref={hostRef} className="vnext-diagnostics-probe" data-editor-diagnostics-probe="" aria-hidden="true">
      {shadowRoot && createPortal(
        <div ref={probeRootRef}>
          <style>{probeCss}</style>
          <DocumentRenderer document={document} plans={compiled.plans} assetUrls={assetUrls} />
        </div>,
        shadowRoot
      )}
    </div>
  );
}

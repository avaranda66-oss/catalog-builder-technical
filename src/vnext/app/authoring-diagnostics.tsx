import React from 'react';
import { createPortal } from 'react-dom';
import type { CatalogDocument, Diagnostic } from '../domain';
import type { AssetRuntimeState } from '../asset';
import { captureSnapshot, compareSnapshots, compilePlans, DocumentRenderer, measureTables, type LayoutSnapshot, type TablePlan } from '../rendering';
import { authoredFrameDiagnostics, layoutReport } from '../publication';

export const W2D_DIAGNOSTIC_CODES = new Set([
  'SAFE_AREA_VIOLATION',
  'OBJECT_OUTSIDE_PAGE',
  'TEXT_OBJECT_OVERFLOW',
  'TABLE_CONTENT_OVERFLOW',
  'TABLE_WIDTH_INFEASIBLE',
  'ROW_CONTENT_OVERFLOW',
  'CELL_CONTENT_OVERFLOW',
  'CELL_CONTENT_BOX_NONPOSITIVE',
  'RENDER_GEOMETRY_MISMATCH',
  'LAYOUT_UNSTABLE',
  'BORDER_CONTENT_CLEARANCE',
  'ASSET_UNAVAILABLE',
  'ASSET_INTEGRITY_FAILED',
]);

export function runtimeAssetDiagnostics(
  document: CatalogDocument,
  assetRuntimeStates?: ReadonlyMap<string, AssetRuntimeState>
): Diagnostic[] {
  if (!assetRuntimeStates || assetRuntimeStates.size === 0) return [];
  const diagnostics: Diagnostic[] = [];

  for (const page of document.pages) {
    for (const object of page.objects) {
      if (object.type === 'image' || object.type === 'icon') {
        const state = assetRuntimeStates.get(object.assetId);
        if (state && state.status !== 'resolved') {
          const isIntegrity = state.status === 'integrity-failed';
          const details =
            state.status === 'integrity-failed'
              ? state.message
              : state.status === 'unavailable'
              ? state.error
              : 'Asset offline';
          diagnostics.push({
            code: isIntegrity ? 'ASSET_INTEGRITY_FAILED' : 'ASSET_UNAVAILABLE',
            severity: 'WARNING',
            pageId: page.id,
            objectId: object.id,
            details,
          });
        }
      } else if (object.type === 'table') {
        for (const cell of object.table.cells) {
          if (cell.content.type === 'image') {
            const state = assetRuntimeStates.get(cell.content.assetId);
            if (state && state.status !== 'resolved') {
              const isIntegrity = state.status === 'integrity-failed';
              const details =
                state.status === 'integrity-failed'
                  ? state.message
                  : state.status === 'unavailable'
                  ? state.error
                  : 'Asset offline';
              diagnostics.push({
                code: isIntegrity ? 'ASSET_INTEGRITY_FAILED' : 'ASSET_UNAVAILABLE',
                severity: 'WARNING',
                pageId: page.id,
                objectId: object.id,
                tableId: object.table.id,
                rowId: cell.rowId,
                cellId: cell.id,
                details,
              });
            }
          }
        }
      }
    }
  }

  return diagnostics;
}

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
    case 'ROW_CONTENT_OVERFLOW':
      return 'Linha fixa não comporta o conteúdo.';
    case 'CELL_CONTENT_OVERFLOW':
      return 'Conteúdo excede a largura da célula.';
    case 'CELL_CONTENT_BOX_NONPOSITIVE':
      return 'A célula não possui espaço útil suficiente para o conteúdo.';
    case 'RENDER_GEOMETRY_MISMATCH':
    case 'LAYOUT_UNSTABLE':
      return 'A medição da tabela ainda não está estável.';
    case 'BORDER_CONTENT_CLEARANCE':
      return 'A borda está muito próxima do conteúdo da célula.';
    case 'ASSET_UNAVAILABLE':
      return 'A imagem remota está temporariamente indisponível ou offline.';
    case 'ASSET_INTEGRITY_FAILED':
      return 'A imagem remota falhou na verificação de integridade dos bytes.';
    case 'ASSET_REFERENCE_DANGLING':
      return 'A referência da imagem não foi encontrada nos metadados do documento.';
    default:
      return diagnostic.details;
  }
}

export interface EditorDiagnosticsProbeProps {
  document: CatalogDocument;
  assetUrls: ReadonlyMap<string, string>;
  onDiagnostics(source: CatalogDocument, diagnostics: readonly Diagnostic[]): void;
  onMeasuredLayout?(
    source: CatalogDocument,
    plans: ReadonlyMap<string, TablePlan>,
    snapshot: LayoutSnapshot | undefined,
    diagnostics: readonly Diagnostic[]
  ): void;
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

async function waitForProbeResources(root: HTMLElement): Promise<void> {
  if (window.document.fonts?.ready) await window.document.fonts.ready;
  await Promise.all([...root.querySelectorAll<HTMLImageElement>('img')].map(async (image) => {
    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) return;
    await image.decode().catch(() => undefined);
  }));
}

function paintEdgeDomMatches(root: HTMLElement, plans: ReadonlyMap<string, TablePlan>): boolean {
  for (const plan of plans.values()) {
    const grid = root.querySelector<HTMLElement>('[data-table-id="' + CSS.escape(plan.tableId) + '"]');
    if (!grid) return false;
    const expected = plan.edges.map((edge) => edge.id).sort();
    const actual = [...grid.querySelectorAll('[data-paint-edge]')]
      .map((node) => node.getAttribute('data-paint-edge'))
      .filter((value): value is string => value !== null)
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) return false;
  }
  return true;
}

export function EditorDiagnosticsProbe({ document, assetUrls, onDiagnostics, onMeasuredLayout }: EditorDiagnosticsProbeProps) {
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
    const nextFrame = () => new Promise<void>((resolve) => {
      frame = window.requestAnimationFrame(() => resolve());
    });
    const run = async () => {
      try {
        const root = probeRootRef.current?.querySelector<HTMLElement>('[data-editorial-root]');
        if (!root) return;
        await waitForProbeResources(root);
        if (cancelled) return;
        measureTables(document, compiled.plans, root);
        forceRender();

        for (let attempt = 0; attempt < 4; attempt += 1) {
          await nextFrame();
          if (cancelled) return;
          if (paintEdgeDomMatches(root, compiled.plans)) break;
        }

        const firstSnapshot = await captureSnapshot(document, compiled.plans, root);
        await nextFrame();
        if (cancelled) return;
        const snapshot = await captureSnapshot(document, compiled.plans, root);
        const stabilityDiagnostics = compareSnapshots(firstSnapshot, snapshot);
        const diagnostics = mergeDiagnostics(
          compiled.diagnostics,
          layoutReport(document, compiled.plans, snapshot, root),
          stabilityDiagnostics
        );
        onDiagnostics(document, diagnostics);
        onMeasuredLayout?.(
          document,
          new Map(compiled.plans),
          stabilityDiagnostics.length === 0 ? snapshot : undefined,
          diagnostics
        );
      } catch {
        if (!cancelled) {
          const diagnostics = immediateAuthoringDiagnostics(document);
          onDiagnostics(document, diagnostics);
          onMeasuredLayout?.(document, new Map(compiled.plans), undefined, diagnostics);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [compiled, document, onDiagnostics, onMeasuredLayout, shadowRoot]);

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

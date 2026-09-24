import type { CatalogDocument, Diagnostic, Severity, TableObject } from '../domain';

export type LayoutDiagnosticAction = 'FIT_HEIGHT' | 'LOCATE' | 'NONE';

export interface ProjectedLayoutDiagnostic {
  key: string;
  sourceCodes: readonly string[];
  severity: Severity;
  message: string;
  pageId?: string;
  objectId?: string;
  tableId?: string;
  rowId?: string;
  cellId?: string;
  annotationId?: string;
  action: LayoutDiagnosticAction;
  publicationBlocked: boolean;
}

const fatherMessage = (diagnostic: Diagnostic): string => {
  switch (diagnostic.code) {
    case 'TABLE_CONTENT_OVERFLOW':
      return 'Conteúdo excede a altura da tabela';
    case 'ROW_CONTENT_OVERFLOW':
      return 'Linha fixa não comporta o conteúdo';
    case 'CELL_CONTENT_OVERFLOW':
      return 'Conteúdo excede a largura da célula';
    case 'CELL_CONTENT_BOX_NONPOSITIVE':
      return 'A célula não possui espaço útil suficiente para o conteúdo';
    case 'TABLE_WIDTH_INFEASIBLE':
      return 'A largura atual não comporta as restrições das colunas';    case 'OBJECT_OUTSIDE_PAGE':
      return 'Parte da tabela está fora da página';
    case 'SAFE_AREA_VIOLATION':
      return 'A tabela cruza a área segura';
    case 'LAYOUT_UNSTABLE':
      return 'A medição da tabela ainda não está estável';
    case 'RENDER_GEOMETRY_MISMATCH':
      return 'A geometria renderizada ainda não corresponde ao layout canônico';
    case 'BORDER_CONTENT_CLEARANCE':
      return 'A borda está muito próxima do conteúdo da célula';
    case 'ASSET_UNAVAILABLE':
      return 'Uma imagem da tabela está temporariamente indisponível';
    case 'ASSET_INTEGRITY_FAILED':
      return 'Uma imagem da tabela falhou na verificação de integridade';
    default:
      return diagnostic.details;
  }
};

function tableForDiagnostic(
  document: CatalogDocument,
  diagnostic: Diagnostic
): TableObject | undefined {
  if (!diagnostic.pageId || !diagnostic.objectId) return undefined;
  const object = document.pages.find((page) => page.id === diagnostic.pageId)
    ?.objects.find((entry) => entry.id === diagnostic.objectId);
  return object?.type === 'table' ? object : undefined;
}function actionFor(diagnostic: Diagnostic): LayoutDiagnosticAction {
  if (diagnostic.code === 'TABLE_CONTENT_OVERFLOW') return 'FIT_HEIGHT';
  if (
    diagnostic.objectId
    || diagnostic.tableId
    || diagnostic.rowId
    || diagnostic.cellId
    || diagnostic.annotationId
  ) return 'LOCATE';
  return 'NONE';
}

function resolvedRowId(
  document: CatalogDocument,
  diagnostic: Diagnostic
): string | undefined {
  if (diagnostic.rowId) return diagnostic.rowId;
  if (!diagnostic.cellId) return undefined;
  return tableForDiagnostic(document, diagnostic)?.table.cells
    .find((cell) => cell.id === diagnostic.cellId)?.rowId;
}

function semanticKey(
  diagnostic: Diagnostic,
  rowId: string | undefined,
  message: string
): string {
  return [
    diagnostic.severity,
    message,
    diagnostic.pageId ?? '',
    diagnostic.objectId ?? '',
    diagnostic.tableId ?? '',
    rowId ?? '',
    diagnostic.cellId ?? '',
    diagnostic.annotationId ?? '',
  ].join('|');
}export function projectLayoutDiagnostics(
  document: CatalogDocument,
  diagnostics: readonly Diagnostic[],
  pageId: string,
  objectId: string
): ProjectedLayoutDiagnostic[] {
  const grouped = new Map<string, ProjectedLayoutDiagnostic>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.pageId !== pageId || diagnostic.objectId !== objectId) continue;
    const rowId = resolvedRowId(document, diagnostic);
    const message = fatherMessage(diagnostic);
    const key = semanticKey(diagnostic, rowId, message);
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.sourceCodes.includes(diagnostic.code)) {
        grouped.set(key, {
          ...existing,
          sourceCodes: [...existing.sourceCodes, diagnostic.code],
        });
      }
      continue;
    }
    grouped.set(key, {
      key,
      sourceCodes: [diagnostic.code],
      severity: diagnostic.severity,
      message,
      pageId: diagnostic.pageId,
      objectId: diagnostic.objectId,
      tableId: diagnostic.tableId,
      rowId,
      cellId: diagnostic.cellId,
      annotationId: diagnostic.annotationId,
      action: actionFor(diagnostic),
      publicationBlocked: diagnostic.severity === 'ERROR',
    });
  }
  return [...grouped.values()].sort((left, right) =>
    left.severity === right.severity
      ? left.key.localeCompare(right.key)
      : left.severity === 'ERROR' ? -1 : 1
  );
}

import { describe, expect, it } from 'vitest';
import { createMinimalW2CTable, createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { publicationDiagnosticDetails, publicationDiagnosticLocation, publicationDiagnosticMessage } from '@/vnext/app/publication-diagnostic-presentation';
import type { Diagnostic } from '@/vnext/domain';

describe('P1.C publication diagnostic presentation', () => {
  it.each([
    ['TABLE_WIDTH_INFEASIBLE', 'larguras das colunas', 'Aumente a largura'],
    ['SPAN_OUT_OF_BOUNDS', 'mesclagem', 'desfaça a mesclagem'],
    ['ROW_CONTENT_OVERFLOW', 'altura das linhas', 'Aumente a altura'],
    ['RENDER_GEOMETRY_MISMATCH', 'medidas da página', 'abra a revisão novamente'],
    ['ASSET_HASH_MISMATCH', 'imagem', 'envie a imagem novamente'],
    ['FONT_READINESS_TIMEOUT', 'fonte', 'Confira a conexão'],
  ])('explains %s with a concrete next action', (code, problem, action) => {
    const message = publicationDiagnosticMessage(code);
    expect(message).toContain(problem);
    expect(message).toContain(action);
    expect(message).not.toContain(code);
  });

  it('locates a table cell in readable page/row/column order without showing IDs', () => {
    let id = 0;
    const document = createW2CDemoDocument(() => `diagnostic-${++id}`);
    const page = document.pages[0];
    const table = { id: 'table-object-a', type: 'table' as const, frame: { xMm: 20, yMm: 20, widthMm: 80, heightMm: 20 },
      zIndex: 0, table: createMinimalW2CTable() };
    page.objects = [{ id: 'shape-before-table', type: 'shape', frame: { xMm: 20, yMm: 10, widthMm: 20, heightMm: 5 },
      zIndex: 0, shape: 'rectangle', style: { fill: '#ffffff' } }, table];
    const cell = table.table.cells[0];
    const issue: Diagnostic = { code: 'CELL_CONTENT_OVERFLOW', severity: 'ERROR', details: 'intrinsicWidthQ=245, contentWidthQ=200',
      pageId: page.id, tableId: table.table.id, cellId: cell.id };
    const before = JSON.stringify(document);
    expect(publicationDiagnosticLocation(document, issue)).toBe('Página 1 · tabela 1 · linha 1, coluna 1');
    expect(publicationDiagnosticLocation(document, issue)).not.toContain('diagnostic-');
    expect(JSON.stringify(document)).toBe(before);
  });

  it('keeps unknown diagnostic evidence exact while giving safe general guidance', () => {
    const issue: Diagnostic = { code: 'FUTURE_LAYOUT_FAILURE', severity: 'WARNING', details: 'original=17\nexpected=21',
      pageId: 'page-a', objectId: 'object-a', tableId: 'table-a', rowId: 'row-a', cellId: 'cell-a', annotationId: 'note-a' };
    const before = JSON.stringify(issue);
    expect(publicationDiagnosticMessage(issue.code)).toContain('encaminhe os detalhes técnicos ao suporte');
    expect(publicationDiagnosticMessage(issue.code)).not.toContain(issue.details);
    expect(publicationDiagnosticDetails(issue).map(([, value]) => value)).toEqual([
      issue.code, issue.severity, issue.details, issue.pageId, issue.objectId, issue.tableId, issue.rowId, issue.cellId, issue.annotationId,
    ]);
    expect(JSON.stringify(issue)).toBe(before);
  });
});

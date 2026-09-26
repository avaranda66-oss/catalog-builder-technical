import { describe, expect, it } from 'vitest';
import { resolveCellStyle, resolveStyle } from '@/vnext/rendering/style';
import { buildPaint, chooseBorder } from '@/vnext/rendering/border-paint';
import { resolveRows } from '@/vnext/table/table-layout';
import { createW4F1Document, W4F1_OBJECT_ID } from '../proof/fixtures/w4f1-table-document';

function fixture() {
  const document = createW4F1Document();
  const object = document.pages[0].objects.find((entry) => entry.id === W4F1_OBJECT_ID);
  if (!object || object.type !== 'table') throw new Error('Expected Table');
  return { document, table: object.table };
}

describe('W4.F.2 canonical style cascade', () => {
  it('freezes precedence Document < Table < role < Column < Row < Cell', () => {
    const { document, table } = fixture();
    const cell = table.cells[5];
    document.style.defaultText.color = '#111111';
    table.style.base.color = '#222222';
    table.style.rowRoles.body = { ...(table.style.rowRoles.body ?? {}), color: '#333333' };
    table.columns[1].style = { color: '#444444' };
    table.rows[1].style = { color: '#555555' };
    cell.style = { color: '#666666' };

    expect(resolveCellStyle(document.style, table, cell).color).toBe('#666666');
    delete cell.style.color;
    expect(resolveCellStyle(document.style, table, cell).color).toBe('#555555');
    delete table.rows[1].style.color;
    expect(resolveCellStyle(document.style, table, cell).color).toBe('#444444');
    delete table.columns[1].style.color;
    expect(resolveCellStyle(document.style, table, cell).color).toBe('#333333');
    delete table.style.rowRoles.body!.color;
    expect(resolveCellStyle(document.style, table, cell).color).toBe('#222222');
    delete table.style.base.color;
    expect(resolveCellStyle(document.style, table, cell).color).toBe('#111111');
  });

  it('cascades verticalAlign and defaults unresolved placement to top', () => {
    const { document, table } = fixture();
    const cell = table.cells[5];
    delete document.style.defaultText.verticalAlign;
    delete table.style.base.verticalAlign;
    expect(resolveCellStyle(document.style, table, cell).verticalAlign).toBe('top');
    table.style.base.verticalAlign = 'middle';
    expect(resolveCellStyle(document.style, table, cell).verticalAlign).toBe('middle');
    table.rows[1].style = { verticalAlign: 'bottom' };
    expect(resolveCellStyle(document.style, table, cell).verticalAlign).toBe('bottom');
    cell.style = { verticalAlign: 'top' };
    expect(resolveCellStyle(document.style, table, cell).verticalAlign).toBe('top');
  });

  it('does not make verticalAlign an input to intrinsic row solving', () => {
    const { table } = fixture();
    const constraints = [
      { cellId: table.cells[4].id, row: 1, column: 0, span: 1, requiredQ: 1600 },
      { cellId: table.cells[8].id, row: 2, column: 0, span: 1, requiredQ: 1800 },
    ];
    const before = resolveRows(table.rows, constraints);
    table.style.base.verticalAlign = 'bottom';
    table.rows[1].style = { verticalAlign: 'middle' };
    table.cells[4].style = { verticalAlign: 'top' };
    const after = resolveRows(table.rows, constraints);
    expect(after).toEqual(before);
  });

  it('resolves padding side-by-side and keeps canonical border conflict authority', () => {
    const defaults = { fontFamily: 'Noto Sans', fontSizePt: 10, lineHeight: 1.2, paddingMm: { top: 1, right: 1, bottom: 1, left: 1 } };
    const resolved = resolveStyle(defaults, [
      { paddingMm: { left: 2 }, borders: { right: { pattern: 'solid', thicknessPt: .5, color: '#003366' } } },
      { paddingMm: { top: 3 }, borders: { right: { pattern: 'solid', thicknessPt: 1, color: '#172033' } } },
    ]);
    expect(resolved.paddingQ.left).toBeGreaterThan(0);
    expect(resolved.paddingQ.top).toBeGreaterThan(resolved.paddingQ.left);
    expect(resolved.edges.right.sourceLevel).toBe(1);
    expect(chooseBorder(
      { border: { pattern: 'solid', thicknessPt: .5, color: '#003366' }, sourceLevel: 5 },
      { border: { pattern: 'solid', thicknessPt: 1, color: '#172033' }, sourceLevel: 0 },
    )).toMatchObject({ thicknessPt: 1, color: '#172033' });
  });

  it('preserves BORDER_CONTENT_CLEARANCE from canonical paint', () => {
    const { document, table } = fixture();
    table.style.base.paddingMm = { top: 0, right: 0, bottom: 0, left: 0 };
    table.style.base.borders = {
      top: { pattern: 'solid', thicknessPt: 5, color: '#003366' },
      right: { pattern: 'solid', thicknessPt: 5, color: '#003366' },
      bottom: { pattern: 'solid', thicknessPt: 5, color: '#003366' },
      left: { pattern: 'solid', thicknessPt: 5, color: '#003366' },
    };
    const styles = new Map(table.cells.map((cell) => [cell.id, resolveCellStyle(document.style, table, cell)]));
    const rowQ = [5000, 5000, 5000, 5000];
    const trackQ = [5000, 5000, 5000, 5000];
    const result = buildPaint(table, trackQ, rowQ, styles);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'BORDER_CONTENT_CLEARANCE')).toBe(true);
  });
});

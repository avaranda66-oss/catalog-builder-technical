import { describe, expect, it } from 'vitest';
import { createSizedEmptyTable } from '../../../src/vnext/app/editor-defaults';
import { TableModelSchema } from '../../../src/vnext/domain/editorial-model';
import { applyNativeTableDesign, NativeTableDesignSchema } from '../../../src/vnext/ai-catalog/native-table-design';
import { applyNativeCompose, NativeComposePlanSchema } from '../../../src/vnext/ai-catalog/native-compose';
import { createCatalogDocument, createDocumentSession } from '../../../src/vnext/application';

describe('native Gemini catalog tables: three safe professional layouts', () => {
  const source = () => createSizedEmptyTable({ rows: 10, columns: 6 });
  it('offers three distinct styles with real native table schemas', () => {
    const table = source();
    const signatures = new Set<string>();
    for (const design of NativeTableDesignSchema.options) {
      const styled = applyNativeTableDesign(table, design);
      expect(TableModelSchema.safeParse(styled).success).toBe(true);
      expect(styled.columns).toHaveLength(6);
      expect(styled.rows).toHaveLength(10);
      expect(styled.cells).toHaveLength(60);
      expect(styled.rows[0].role).toBe('header');
      expect(styled.style.rowRoles.header?.fontWeight).toBe(700);
      expect(styled.cells.every(cell => cell.content.type === 'empty')).toBe(true);
      expect(styled.columns[0].width.mode).toBe('fixed');
      expect(styled.columns.slice(1).every(column => column.width.mode === 'flex')).toBe(true);
      // The exact minimum widths fit in the native A4 content width (176 mm).
      expect(styled.columns.reduce((n, column) => n + column.minMm, 0))
        .toBeLessThanOrEqual(176);
      expect(styled.rows.some(row => row.style?.background)).toBe(true);
      signatures.add(JSON.stringify({
        header: styled.style.rowRoles.header?.background,
        baseFont: styled.style.base.fontSizePt,
        padding: styled.style.base.paddingMm,
        firstColumnMm: styled.columns[0].minMm,
      }));
      expect(table.style.base.fontSizePt).toBeUndefined();
      expect(table.columns[0].width.mode).toBe('flex');
    }
    expect(signatures.size).toBe(3);
  });
  it('inserts a 6-column by 13-row dense native A4 table without inventing one numeric value', () => {
    const createId = () => crypto.randomUUID();
    const doc = createCatalogDocument(createId, 'Nova ficha técnica');
    const session = createDocumentSession(doc, { createId });
    const model = {
      version: 1 as const, status: 'proposal' as const,
      summary: 'Matriz técnica detalhada aguardando dados verificados.',
      pages: [{
        type: 'comparison' as const, heading: 'Quadro de informações por modelo',
        table: {
          design: 'matrix' as const,
          columns: ['Característica','Modelo A','Modelo B','Modelo C','Modelo D','Modelo E'],
          rowLabels: [
            'Descrição', 'Faixa', 'Exatidão', 'Resolução', 'Temperatura',
            'Umidade', 'Proteção', 'Interface', 'Instalação', 'Conexões',
            'Acessórios', 'Revisão',
          ],
        },
      }],
    };
    expect(NativeComposePlanSchema.safeParse(model).success).toBe(true);
    const result = applyNativeCompose(session, model, session.getSnapshot().localSequence);
    expect(result.pagesAdded).toBe(1);
    expect(session.getSnapshot().document.pages).toHaveLength(1);
    const inserted = session.getSnapshot().document.pages[0].objects.find(o => o.type === 'table');
    expect(inserted?.type).toBe('table');
    if (inserted?.type !== 'table') throw new Error('MISSING_TABLE');
    expect(inserted.table.rows).toHaveLength(13);
    expect(inserted.table.columns).toHaveLength(6);
    expect(inserted.table.cells).toHaveLength(78);
    const bodyValues = inserted.table.cells.filter(cell => {
      const r = inserted.table.rows.findIndex(row => row.id === cell.rowId);
      const c = inserted.table.columns.findIndex(column => column.id === cell.columnId);
      return r > 0 && c > 0;
    });
    expect(bodyValues).toHaveLength(60);
    expect(bodyValues.every(cell => cell.content.type === 'empty')).toBe(true);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(doc);
  });
  it('prevents arbitrary provider CSS, HTML and unknown designs', () => {
    const entry = {
      version: 1, status: 'proposal', summary: 'Estrutura de publicação técnica profissional.',
      pages: [{ type: 'comparison', heading: 'Ficha técnica comparativa',
        table: { columns: ['Característica', 'Modelo A'], rowLabels: ['Exatidão'],
          design: 'matrix' } }],
    };
    expect(NativeComposePlanSchema.safeParse(entry).success).toBe(true);
    for (const design of ['cyberpunk', '#ff0033', 'custom_css', '<script />']) {
      expect(NativeComposePlanSchema.safeParse({ ...entry,
        pages: [{...entry.pages[0], table:{...entry.pages[0].table, design}}] }).success).toBe(false);
    }
    expect(NativeComposePlanSchema.safeParse({ ...entry,
      pages:[{...entry.pages[0],table:{...entry.pages[0].table,
        style:{run:'arbitrary provider CSS'}}}] }).success).toBe(false);
  });
});

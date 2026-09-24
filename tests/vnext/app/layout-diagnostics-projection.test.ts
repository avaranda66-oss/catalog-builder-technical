import { describe, expect, it } from 'vitest';
import { projectLayoutDiagnostics } from '@/vnext/app/layout-diagnostics-projection';
import type { CatalogDocument, Diagnostic, TableObject } from '@/vnext/domain';
import {
  createW4DTableDocument,
  W4D_OBJECT_A_ID,
  W4D_PAGE_ID,
  W4D_TABLE_A_ID,
} from '../proof/fixtures/w4d-table-document';

function groupedDiagnosticsDocument(): {
  document: CatalogDocument;
  groupId: string;
  child: TableObject;
  otherGroupId: string;
  otherChild: TableObject;
} {
  const base = createW4DTableDocument();
  const source = base.pages[0].objects.find((object) => object.id === W4D_OBJECT_A_ID);
  if (!source || source.type !== 'table') throw new Error('Expected source Table');

  const child: TableObject = {
    ...structuredClone(source),
    id: 'grouped-table-object',
    frame: { xMm: 0, yMm: 0, widthMm: 88, heightMm: 8 },
    table: { ...structuredClone(source.table), id: 'grouped-table' },
  };
  const otherChild: TableObject = {
    ...structuredClone(source),
    id: 'other-grouped-table-object',
    frame: { xMm: 0, yMm: 0, widthMm: 88, heightMm: 8 },
    table: { ...structuredClone(source.table), id: 'other-grouped-table' },
  };

  const groupId = 'diagnostic-group';
  const otherGroupId = 'other-diagnostic-group';
  const document: CatalogDocument = {
    ...base,
    pages: [{
      ...base.pages[0],
      objects: [{
        id: groupId,
        type: 'group',
        frame: { xMm: 10, yMm: 20, widthMm: 88, heightMm: 12 },
        zIndex: 0,
        objects: [
          child,
          {
            id: 'group-shape',
            type: 'shape',
            frame: { xMm: 0, yMm: 8, widthMm: 4, heightMm: 4 },
            zIndex: 1,
            shape: 'rectangle',
            style: {},
          },
        ],
      }, {
        id: otherGroupId,
        type: 'group',
        frame: { xMm: 110, yMm: 20, widthMm: 88, heightMm: 12 },
        zIndex: 1,
        objects: [
          otherChild,
          {
            id: 'other-group-shape',
            type: 'shape',
            frame: { xMm: 0, yMm: 8, widthMm: 4, heightMm: 4 },
            zIndex: 1,
            shape: 'rectangle',
            style: {},
          },
        ],
      }],
    }],
  };

  return { document, groupId, child, otherGroupId, otherChild };
}

describe('W4.E Father-facing diagnostic projection', () => {
  it('maps canonical diagnostics to truthful actions and publication consequences', () => {
    const document = createW4DTableDocument();
    const diagnostics: Diagnostic[] = [
      {
        code: 'TABLE_CONTENT_OVERFLOW',
        severity: 'ERROR',
        pageId: W4D_PAGE_ID,
        objectId: W4D_OBJECT_A_ID,
        tableId: W4D_TABLE_A_ID,
        details: 'intrinsic > frame',
      },
      {
        code: 'ROW_CONTENT_OVERFLOW',
        severity: 'ERROR',
        pageId: W4D_PAGE_ID,
        objectId: W4D_OBJECT_A_ID,
        tableId: W4D_TABLE_A_ID,
        cellId: 'a-cell-1-0',
        details: 'fixed row',
      },
      {
        code: 'CELL_CONTENT_OVERFLOW',
        severity: 'ERROR',
        pageId: W4D_PAGE_ID,
        objectId: W4D_OBJECT_A_ID,
        tableId: W4D_TABLE_A_ID,
        cellId: 'a-cell-2-2',
        details: 'horizontal',
      },
      {
        code: 'SAFE_AREA_VIOLATION',
        severity: 'WARNING',
        pageId: W4D_PAGE_ID,
        objectId: W4D_OBJECT_A_ID,
        details: 'safe',
      },
    ];

    const entries = projectLayoutDiagnostics(document, diagnostics, W4D_PAGE_ID, W4D_OBJECT_A_ID);
    const byCode = new Map(entries.map((entry) => [entry.sourceCodes[0], entry]));
    expect(byCode.get('CELL_CONTENT_OVERFLOW')).toMatchObject({
      message: 'Conteúdo excede a largura da célula', action: 'LOCATE', publicationBlocked: true,
      groupedChild: false, topLevelObjectId: W4D_OBJECT_A_ID,
    });
    expect(byCode.get('ROW_CONTENT_OVERFLOW')).toMatchObject({
      message: 'Linha fixa não comporta o conteúdo', action: 'LOCATE', publicationBlocked: true, rowId: 'a-row-1',
      groupedChild: false,
    });
    expect(byCode.get('TABLE_CONTENT_OVERFLOW')).toMatchObject({
      message: 'Conteúdo excede a altura da tabela', action: 'FIT_HEIGHT', publicationBlocked: true,
      groupedChild: false,
    });
    expect(byCode.get('SAFE_AREA_VIOLATION')).toMatchObject({
      message: 'A tabela cruza a área segura', action: 'LOCATE', publicationBlocked: false,
      groupedChild: false,
    });
  });

  it('keeps unrelated object diagnostics out and preserves canonical codes for debug/test identity', () => {
    const document = createW4DTableDocument();
    const diagnostics: Diagnostic[] = [{
      code: 'OBJECT_OUTSIDE_PAGE',
      severity: 'ERROR',
      pageId: W4D_PAGE_ID,
      objectId: 'other-object',
      details: 'outside',
    }, {
      code: 'OBJECT_OUTSIDE_PAGE',
      severity: 'ERROR',
      pageId: W4D_PAGE_ID,
      objectId: W4D_OBJECT_A_ID,
      details: 'outside',
    }];
    const entries = projectLayoutDiagnostics(document, diagnostics, W4D_PAGE_ID, W4D_OBJECT_A_ID);
    expect(entries).toHaveLength(1);
    expect(entries[0].sourceCodes).toEqual(['OBJECT_OUTSIDE_PAGE']);
    expect(entries[0].message).toBe('Parte da tabela está fora da página');
  });

  it('surfaces a direct grouped-child Table diagnostic through its selected parent Group without Fit bypass', () => {
    const { document, groupId, child, otherChild } = groupedDiagnosticsDocument();
    const childCell = child.table.cells[0];
    const diagnostics: Diagnostic[] = [{
      code: 'TABLE_CONTENT_OVERFLOW',
      severity: 'ERROR',
      pageId: document.pages[0].id,
      objectId: child.id,
      tableId: child.table.id,
      cellId: childCell.id,
      details: 'grouped child intrinsic > frame',
    }, {
      code: 'TABLE_CONTENT_OVERFLOW',
      severity: 'ERROR',
      pageId: document.pages[0].id,
      objectId: otherChild.id,
      tableId: otherChild.table.id,
      details: 'different group',
    }];
    const before = structuredClone(diagnostics);

    const entries = projectLayoutDiagnostics(document, diagnostics, document.pages[0].id, groupId);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      sourceCodes: ['TABLE_CONTENT_OVERFLOW'],
      objectId: child.id,
      tableId: child.table.id,
      cellId: childCell.id,
      rowId: childCell.rowId,
      action: 'LOCATE',
      groupedChild: true,
      containerGroupId: groupId,
      topLevelObjectId: groupId,
      guidance: 'Desagrupe para editar esta tabela.',
    });
    expect(entries[0].action).not.toBe('FIT_HEIGHT');
    expect(diagnostics).toEqual(before);
  });

  it('does not surface child diagnostics from another Group when the selected Group changes', () => {
    const { document, groupId, child, otherGroupId, otherChild } = groupedDiagnosticsDocument();
    const diagnostics: Diagnostic[] = [{
      code: 'ROW_CONTENT_OVERFLOW',
      severity: 'ERROR',
      pageId: document.pages[0].id,
      objectId: child.id,
      tableId: child.table.id,
      cellId: child.table.cells[0].id,
      details: 'first group',
    }, {
      code: 'ROW_CONTENT_OVERFLOW',
      severity: 'ERROR',
      pageId: document.pages[0].id,
      objectId: otherChild.id,
      tableId: otherChild.table.id,
      cellId: otherChild.table.cells[0].id,
      details: 'second group',
    }];

    const first = projectLayoutDiagnostics(document, diagnostics, document.pages[0].id, groupId);
    const second = projectLayoutDiagnostics(document, diagnostics, document.pages[0].id, otherGroupId);

    expect(first).toHaveLength(1);
    expect(first[0].objectId).toBe(child.id);
    expect(second).toHaveLength(1);
    expect(second[0].objectId).toBe(otherChild.id);
  });
});

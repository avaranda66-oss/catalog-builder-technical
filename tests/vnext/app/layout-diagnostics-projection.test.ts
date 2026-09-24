import { describe, expect, it } from 'vitest';
import { projectLayoutDiagnostics } from '@/vnext/app/layout-diagnostics-projection';
import type { Diagnostic } from '@/vnext/domain';
import {
  createW4DTableDocument,
  W4D_OBJECT_A_ID,
  W4D_PAGE_ID,
  W4D_TABLE_A_ID,
} from '../proof/fixtures/w4d-table-document';

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
    });
    expect(byCode.get('ROW_CONTENT_OVERFLOW')).toMatchObject({
      message: 'Linha fixa não comporta o conteúdo', action: 'LOCATE', publicationBlocked: true, rowId: 'a-row-1',
    });
    expect(byCode.get('TABLE_CONTENT_OVERFLOW')).toMatchObject({
      message: 'Conteúdo excede a altura da tabela', action: 'FIT_HEIGHT', publicationBlocked: true,
    });
    expect(byCode.get('SAFE_AREA_VIOLATION')).toMatchObject({
      message: 'A tabela cruza a área segura', action: 'LOCATE', publicationBlocked: false,
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
});

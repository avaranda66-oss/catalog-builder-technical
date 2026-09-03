// tests/domain/table-core/table.merge.test.ts
// Testes de Invariantes de Mesclagem (ColSpan, RowSpan e Células Cobertas).

import { describe, it, expect } from 'vitest';
import {
  createTable,
  mergeCells,
  unmergeCell,
  removeRow,
  removeColumn,
  setCellContent,
  TableEngineError,
  getCellKey
} from '../../../src/domain/table-core';

describe('Table Core V2: Merge & Span Invariants', () => {
  it('TABLE-MERGE-1: Mesclagem retangular válida (2x2) atualiza âncora e marca cobertas', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c3', defaultLabel: 'C3', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 3
    });

    const r0 = table.rows[0].id;
    const c0 = table.columns[0].id;
    const r1 = table.rows[1].id;
    const c1 = table.columns[1].id;

    const merged = mergeCells(table, r0, c0, 2, 2);

    const anchorCell = merged.cells[getCellKey(r0, c0)];
    expect(anchorCell.colSpan).toBe(2);
    expect(anchorCell.rowSpan).toBe(2);
    expect(anchorCell.coveredBy).toBeUndefined();

    // As três células cobertas devem ter coveredBy === anchorCell.id e content kind === empty
    const covered1 = merged.cells[getCellKey(r0, c1)];
    const covered2 = merged.cells[getCellKey(r1, c0)];
    const covered3 = merged.cells[getCellKey(r1, c1)];

    expect(covered1.coveredBy).toBe(anchorCell.id);
    expect(covered1.content.kind).toBe('empty');

    expect(covered2.coveredBy).toBe(anchorCell.id);
    expect(covered2.content.kind).toBe('empty');

    expect(covered3.coveredBy).toBe(anchorCell.id);
    expect(covered3.content.kind).toBe('empty');
  });

  it('TABLE-MERGE-2: Sobreposição de mesclagens é estritamente rejeitada', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c3', defaultLabel: 'C3', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    const r0 = table.rows[0].id;
    const c0 = table.columns[0].id;
    const c1 = table.columns[1].id;

    // Mescla colunas 0 e 1 na linha 0
    const step1 = mergeCells(table, r0, c0, 2, 1);

    // Tenta mesclar colunas 1 e 2 na mesma linha (colisão na coluna 1)
    expect(() => {
      mergeCells(step1, r0, c1, 2, 1);
    }).toThrowError(TableEngineError);
  });

  it('TABLE-MERGE-3: Célula coberta não pode receber conteúdo independente', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    const r0 = table.rows[0].id;
    const c0 = table.columns[0].id;
    const c1 = table.columns[1].id;

    const merged = mergeCells(table, r0, c0, 2, 1);

    // Tentar setar conteúdo na célula coberta (r0, c1)
    expect(() => {
      setCellContent(merged, r0, c1, { kind: 'text', text: 'Conteúdo Proibido' });
    }).toThrowError(TableEngineError);
  });

  it('TABLE-MERGE-4: Desfazer mesclagem (unmerge) restaura grade individual válida', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    const r0 = table.rows[0].id;
    const c0 = table.columns[0].id;
    const c1 = table.columns[1].id;

    const merged = mergeCells(table, r0, c0, 2, 1);
    const unmerged = unmergeCell(merged, r0, c0);

    const anchorCell = unmerged.cells[getCellKey(r0, c0)];
    const previouslyCovered = unmerged.cells[getCellKey(r0, c1)];

    expect(anchorCell.colSpan).toBe(1);
    expect(anchorCell.rowSpan).toBe(1);

    expect(previouslyCovered.coveredBy).toBeUndefined();
    expect(previouslyCovered.colSpan).toBe(1);
    expect(previouslyCovered.rowSpan).toBe(1);
  });

  it('TABLE-MERGE-5: Remoção de linha ou coluna que corte mesclagem ativa é rejeitada', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    const r0 = table.rows[0].id;
    const c0 = table.columns[0].id;
    const c1 = table.columns[1].id;

    // Mescla horizontal c0 e c1
    const merged = mergeCells(table, r0, c0, 2, 1);

    // Tentar excluir a coluna c1 participante da mesclagem deve ser rejeitado (fail-closed)
    expect(() => {
      removeColumn(merged, c1);
    }).toThrowError(TableEngineError);

    // Tentar excluir a coluna c0 (âncora) também deve ser rejeitado
    expect(() => {
      removeColumn(merged, c0);
    }).toThrowError(TableEngineError);

    // Tentar excluir a linha r0 (âncora) após merge vertical deve ser rejeitado
    const vertMerged = mergeCells(table, r0, c0, 1, 2);
    expect(() => {
      removeRow(vertMerged, r0);
    }).toThrowError(TableEngineError);
  });
});

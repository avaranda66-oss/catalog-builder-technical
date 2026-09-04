import { describe, it, expect } from 'vitest';
import { isTableRowVisuallyEmpty } from '../../../src/domain/table-core/table.empty-row-policy';
import {
  TableRowModel,
  TableColumnModel,
  TableCellModel,
  getCellKey
} from '../../../src/domain/table-core/table.types';

describe('Table Core V2: Empty Row Detection & Ghost Row Prevention Policy (Emendas 2 e 3)', () => {
  const sampleColumns: TableColumnModel[] = [
    { id: 'c1', semanticKey: 'param', defaultLabel: 'Parâmetro', align: 'left', widthSpec: { mode: 'auto' } },
    { id: 'c2', semanticKey: 'value', defaultLabel: 'Valor', align: 'left', widthSpec: { mode: 'auto' } }
  ];

  const bodyRow: TableRowModel = {
    id: 'r1',
    kind: 'data',
    minHeightMm: 6
  };

  it('EMPTY-ROW-1: Linha com todas as células em branco é considerada visualmente vazia', () => {
    const cells: Record<string, TableCellModel> = {
      [getCellKey('r1', 'c1')]: {
        id: 'cell_1',
        rowId: 'r1',
        columnId: 'c1',
        content: { kind: 'text', text: '' }
      },
      [getCellKey('r1', 'c2')]: {
        id: 'cell_2',
        rowId: 'r1',
        columnId: 'c2',
        content: { kind: 'text', text: '   ' }
      }
    };

    expect(isTableRowVisuallyEmpty(bodyRow, sampleColumns, cells)).toBe(true);
  });

  it('EMPTY-ROW-2: Linha sem células no dicionário é considerada visualmente vazia', () => {
    expect(isTableRowVisuallyEmpty(bodyRow, sampleColumns, {})).toBe(true);
  });

  it('EMPTY-ROW-3: Linha com texto preenchido NÃO é considerada vazia', () => {
    const cells: Record<string, TableCellModel> = {
      [getCellKey('r1', 'c1')]: {
        id: 'cell_1',
        rowId: 'r1',
        columnId: 'c1',
        content: { kind: 'text', text: 'Faixa Operacional' }
      },
      [getCellKey('r1', 'c2')]: {
        id: 'cell_2',
        rowId: 'r1',
        columnId: 'c2',
        content: { kind: 'text', text: '' }
      }
    };

    expect(isTableRowVisuallyEmpty(bodyRow, sampleColumns, cells)).toBe(false);
  });

  it('EMPTY-ROW-4: Zero numérico (0) é conteúdo válido e NÃO pode ser considerado vazio', () => {
    const cells: Record<string, TableCellModel> = {
      [getCellKey('r1', 'c1')]: {
        id: 'cell_1',
        rowId: 'r1',
        columnId: 'c1',
        content: { kind: 'number', value: 0 }
      },
      [getCellKey('r1', 'c2')]: {
        id: 'cell_2',
        rowId: 'r1',
        columnId: 'c2',
        content: { kind: 'text', text: '' }
      }
    };

    expect(isTableRowVisuallyEmpty(bodyRow, sampleColumns, cells)).toBe(false);
  });

  it('EMPTY-ROW-5: Booleano falso (false) é conteúdo válido e NÃO pode ser considerado vazio', () => {
    const cells: Record<string, TableCellModel> = {
      [getCellKey('r1', 'c1')]: {
        id: 'cell_1',
        rowId: 'r1',
        columnId: 'c1',
        content: { kind: 'boolean', value: false, format: 'check_cross' }
      },
      [getCellKey('r1', 'c2')]: {
        id: 'cell_2',
        rowId: 'r1',
        columnId: 'c2',
        content: { kind: 'text', text: '' }
      }
    };

    expect(isTableRowVisuallyEmpty(bodyRow, sampleColumns, cells)).toBe(false);
  });

  it('EMPTY-ROW-6: Célula com binding PIM (datumKey) possui intenção semântica e NÃO é vazia', () => {
    const cells: Record<string, TableCellModel> = {
      [getCellKey('r1', 'c1')]: {
        id: 'cell_1',
        rowId: 'r1',
        columnId: 'c1',
        content: { kind: 'text', text: '' }
      },
      [getCellKey('r1', 'c2')]: {
        id: 'cell_2',
        rowId: 'r1',
        columnId: 'c2',
        content: {
          kind: 'datum_reference',
          productId: 'prod_1',
          datumKey: 'sensor_accuracy',
          bindingMode: 'live'
        }
      }
    };

    expect(isTableRowVisuallyEmpty(bodyRow, sampleColumns, cells)).toBe(false);
  });

  it('EMPTY-ROW-7: Linhas de cabeçalho e seções com rótulo nunca são suprimidas como vazias', () => {
    const headerRow: TableRowModel = { id: 'rh', kind: 'header', isHeader: true };
    const sectionRow: TableRowModel = { id: 'rs', kind: 'section' };
    const sectionCells: Record<string, TableCellModel> = {
      [getCellKey('rs', 'c1')]: {
        id: 'cell_s1',
        rowId: 'rs',
        columnId: 'c1',
        content: { kind: 'text', text: 'Seção de Sensores' }
      }
    };

    expect(isTableRowVisuallyEmpty(headerRow, sampleColumns, {})).toBe(false);
    expect(isTableRowVisuallyEmpty(sectionRow, sampleColumns, sectionCells)).toBe(false);
  });
});

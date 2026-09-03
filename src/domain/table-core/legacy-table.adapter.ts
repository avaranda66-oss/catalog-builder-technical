// src/domain/table-core/legacy-table.adapter.ts
// Adaptadores READ-ONLY para conversão determinística de blocos legados em TableCoreModel.
// Garante identidades 100% reproduzíveis sem persistência ou mutação do bloco original.
// Zero explicit any.

import { ContentBlock, TableColumnConfig, CatalogTableRow } from '../catalog.schema';
import {
  TableCoreModel,
  TableColumnModel,
  TableRowModel,
  TableCellModel,
  TableCellContent,
  TablePresetId
} from './table.types';
import { getCellKey, validateTableModel } from './table.validator';
import { getTablePreset } from './table.presets';
import { DEFAULT_TABLE_PAGINATION_POLICY } from './table.pagination';

export type LegacyAdapterUnsupportedReason =
  | 'unsupported_block_type'
  | 'missing_legacy_columns'
  | 'custom_data_headers_unsupported'
  | 'matrix_spec_table_deferred_to_t3'
  | 'ordering_codes_specialized_domain'
  | 'inserts_visual_hybrid_block';

export type LegacyAdapterResult =
  | {
      supported: true;
      table: TableCoreModel;
      warnings: string[];
    }
  | {
      supported: false;
      reason: LegacyAdapterUnsupportedReason;
      message: string;
    };

/**
 * Codificação segura e prefixada com comprimento para componentes de identificadores estáveis.
 * Garante ausência total de ambiguidade com delimitadores estruturais (Zero Delimiter Collision).
 */
function safeToken(value: string): string {
  const enc = encodeURIComponent(value).replace(/%/g, 'x');
  return `${enc.length}x${enc}`;
}

/**
 * Gera identificador estável determinístico para a tabela adaptada.
 */
export function generateDeterministicTableId(blockId: string): string {
  return `tbl_leg_${safeToken(blockId)}`;
}

/**
 * Gera identificador estável determinístico para a coluna adaptada.
 * Se a coluna possuir ID estável prévio, ele é preservado.
 */
export function generateDeterministicColumnId(blockId: string, colKey: string, existingColId?: string): string {
  if (existingColId && existingColId.trim() !== '') {
    return existingColId;
  }
  return `col_leg_${safeToken(blockId)}_${safeToken(colKey)}`;
}

/**
 * Gera identificador estável determinístico para a linha adaptada.
 */
export function generateDeterministicRowId(blockId: string, rowId: string): string {
  return `row_leg_${safeToken(blockId)}_${safeToken(rowId)}`;
}

/**
 * Gera identificador estável determinístico para a célula adaptada.
 */
export function generateDeterministicCellId(blockId: string, rowId: string, colKey: string): string {
  return `cell_leg_${safeToken(blockId)}_${safeToken(rowId)}_${safeToken(colKey)}`;
}

/**
 * Converte um ContentBlock legado suportado para TableCoreModel.
 * Suporta formas canônicas de: 'table', 'specs_table', 'electrical_table', 'accessories_table' e 'custom_table' canônico.
 */
export function adaptLegacyBlockToTableCore(block: ContentBlock): LegacyAdapterResult {
  // 1. Tratamento específico para custom_table
  if (block.type === 'custom_table') {
    if (block.customData?.headers || block.customData?.rows) {
      return {
        supported: false,
        reason: 'custom_data_headers_unsupported',
        message: 'O bloco custom_table utiliza customData.headers/rows não canônico e requer migração estruturada.'
      };
    }
    if (!block.tableColumns || block.tableColumns.length === 0) {
      return {
        supported: false,
        reason: 'missing_legacy_columns',
        message: 'O bloco custom_table canônico não possui tableColumns definidas.'
      };
    }
  }

  // 2. Rejeições com motivo explícito para blocos não suportados nesta fase
  if (block.type === 'matrix_spec_table') {
    return {
      supported: false,
      reason: 'matrix_spec_table_deferred_to_t3',
      message: 'O bloco matrix_spec_table possui modelo dimensional estendido e será adaptado na Fase T3.'
    };
  }

  if (block.type === 'ordering_codes') {
    return {
      supported: false,
      reason: 'ordering_codes_specialized_domain',
      message: 'O bloco ordering_codes é um configurador especializado de part number e mantém domínio próprio.'
    };
  }

  if (block.type === 'inserts_visual') {
    return {
      supported: false,
      reason: 'inserts_visual_hybrid_block',
      message: 'O bloco inserts_visual é um híbrido gráfico/tabela dependente de composição de página.'
    };
  }

  const supportedTypes = ['table', 'specs_table', 'electrical_table', 'accessories_table', 'custom_table'];
  if (!supportedTypes.includes(block.type)) {
    return {
      supported: false,
      reason: 'unsupported_block_type',
      message: `Tipo de bloco "${block.type}" não é uma tabela suportada pelo Table Core.`
    };
  }

  // 3. Validação de ausência de colunas (Zero Ghost Data: Não inventa coluna padrão "Item")
  const legacyColumns: TableColumnConfig[] = block.tableColumns || [];
  if (legacyColumns.length === 0) {
    return {
      supported: false,
      reason: 'missing_legacy_columns',
      message: 'Bloco legado não possui tableColumns definidas.'
    };
  }

  const warnings: string[] = [];
  const tableId = generateDeterministicTableId(block.id);

  // 4. Determinar Preset inicial
  let presetId: TablePresetId = 'presys_clean_technical';
  if (block.type === 'electrical_table') presetId = 'dense_spec_matrix';
  if (block.type === 'accessories_table') presetId = 'parameter_value';
  if (block.type === 'custom_table') presetId = 'presys_clean_technical';

  // 5. Extrair Colunas
  const columns: TableColumnModel[] = legacyColumns.map((col) => {
    const colId = generateDeterministicColumnId(block.id, col.key, col.id);
    const widthMm = typeof col.width === 'number' && col.width > 0 ? Number((col.width * 0.264583).toFixed(2)) : undefined;

    return {
      id: colId,
      semanticKey: col.key,
      defaultLabel: col.label || col.key,
      widthSpec: widthMm ? { mode: 'fixed_mm', widthMm } : { mode: 'auto' },
      align: 'left',
      isCustom: col.isCustom
    };
  });

  // 6. Extrair Linhas (Zero Ghost Data: Se 0 linhas, rows = [] e cells = {})
  const legacyRows: CatalogTableRow[] = block.tableRows || [];
  const rows: TableRowModel[] = legacyRows.map((row) => ({
    id: generateDeterministicRowId(block.id, row.id),
    kind: 'data'
  }));

  // 7. Construir Células
  const cells: Record<string, TableCellModel> = {};

  rows.forEach((row, rIdx) => {
    const legacyRow = legacyRows[rIdx];

    columns.forEach((col) => {
      const cellId = generateDeterministicCellId(block.id, legacyRow.id, col.semanticKey);
      const key = getCellKey(row.id, col.id);

      let content: TableCellContent = { kind: 'empty' };
      if (legacyRow.localOverrides && legacyRow.localOverrides[col.semanticKey] !== undefined) {
        const textVal = String(legacyRow.localOverrides[col.semanticKey]);
        content = textVal.trim() === '' ? { kind: 'empty' } : { kind: 'text', text: textVal };
      } else if (legacyRow.productRefId) {
        content = {
          kind: 'datum_reference',
          productId: legacyRow.productRefId,
          datumKey: col.semanticKey,
          bindingMode: 'live'
        };
      }

      cells[key] = {
        id: cellId,
        rowId: row.id,
        columnId: col.id,
        content,
        colSpan: 1,
        rowSpan: 1
      };
    });
  });

  const presentation = getTablePreset(presetId);

  const tableCore: TableCoreModel = {
    id: tableId,
    schemaVersion: 1,
    title: block.title,
    columns,
    rows,
    cells,
    presentation,
    paginationPolicy: structuredClone(DEFAULT_TABLE_PAGINATION_POLICY)
  };

  const validation = validateTableModel(tableCore);
  if (!validation.valid) {
    return {
      supported: false,
      reason: 'unsupported_block_type',
      message: `Falha na validação do modelo adaptado: ${validation.errors.join('; ')}`
    };
  }

  return {
    supported: true,
    table: tableCore,
    warnings
  };
}

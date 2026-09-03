// src/domain/table-core/legacy-table.adapter.ts
// Adaptadores READ-ONLY para conversão determinística de blocos legados em TableCoreModel.
// Garante identidades 100% reproduzíveis sem persistência ou mutação do bloco original.

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
 * Função de hash determinística rápida (FNV-1a de 32 bits) para gerar sufixos hexadecimais estáveis.
 * Garante que a mesma string sempre produza o mesmo identificador estável sem crypto assíncrono.
 */
function fnv1aHex(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Gera IDs determinísticos para elementos adaptados a partir de blocos legados.
 */
export function generateDeterministicTableId(blockId: string): string {
  return `tbl_${fnv1aHex('table_' + blockId)}`;
}

export function generateDeterministicColumnId(blockId: string, colKey: string, existingColId?: string): string {
  if (existingColId && existingColId.trim() !== '') {
    return existingColId;
  }
  return `col_${fnv1aHex(blockId + '_col_' + colKey)}`;
}

export function generateDeterministicRowId(blockId: string, rowId: string): string {
  return `row_${fnv1aHex(blockId + '_row_' + rowId)}`;
}

export function generateDeterministicCellId(blockId: string, rowId: string, colKey: string): string {
  return `cell_${fnv1aHex(blockId + '_cell_' + rowId + '_' + colKey)}`;
}

/**
 * Converte um ContentBlock legado suportado para TableCoreModel.
 * Suporta: 'table', 'specs_table', 'electrical_table', 'accessories_table'.
 */
export function adaptLegacyBlockToTableCore(block: ContentBlock): LegacyAdapterResult {
  // 1. Rejeição com motivo explícito para blocos não suportados nesta fase
  if (block.type === 'custom_table') {
    if (block.customData?.headers || block.customData?.rows) {
      return {
        supported: false,
        reason: 'custom_data_headers_unsupported',
        message: 'O bloco custom_table utiliza customData.headers/rows não canônico e requer migração estruturada.'
      };
    }
  }

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

  const supportedTypes = ['table', 'specs_table', 'electrical_table', 'accessories_table'];
  if (!supportedTypes.includes(block.type)) {
    return {
      supported: false,
      reason: 'unsupported_block_type',
      message: `Tipo de bloco "${block.type}" não é uma tabela suportada pelo Table Core.`
    };
  }

  const warnings: string[] = [];
  const tableId = generateDeterministicTableId(block.id);

  // 2. Determinar Preset inicial com base no tipo legado
  let presetId: TablePresetId = 'presys_clean_technical';
  if (block.type === 'electrical_table') presetId = 'dense_spec_matrix';
  if (block.type === 'accessories_table') presetId = 'parameter_value';

  // 3. Extrair Colunas
  const legacyColumns: TableColumnConfig[] = block.tableColumns || [];
  if (legacyColumns.length === 0) {
    warnings.push('Bloco legado não possui tableColumns definidas; utilizando coluna padrão.');
  }

  const columns: TableColumnModel[] = (legacyColumns.length > 0
    ? legacyColumns
    : [{ key: 'col_default', label: 'Item', visible: true }]
  ).map((col) => {
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

  // 4. Extrair Linhas
  const legacyRows: CatalogTableRow[] = block.tableRows || [];
  const rows: TableRowModel[] = legacyRows.map((row) => ({
    id: generateDeterministicRowId(block.id, row.id),
    kind: 'data'
  }));

  // Se não havia linhas, cria ao menos uma linha vazia
  if (rows.length === 0) {
    rows.push({
      id: generateDeterministicRowId(block.id, 'row_default_1'),
      kind: 'data'
    });
  }

  // 5. Construir Células
  const cells: Record<string, TableCellModel> = {};

  rows.forEach((row, rIdx) => {
    const legacyRow = legacyRows[rIdx];

    columns.forEach((col) => {
      const cellId = generateDeterministicCellId(block.id, legacyRow?.id || row.id, col.semanticKey);
      const key = getCellKey(row.id, col.id);

      // Conteúdo: extrai do override local ou deixa vazio
      let content: TableCellContent = { kind: 'empty' };
      if (legacyRow?.localOverrides && legacyRow.localOverrides[col.semanticKey] !== undefined) {
        const textVal = String(legacyRow.localOverrides[col.semanticKey]);
        content = textVal.trim() === '' ? { kind: 'empty' } : { kind: 'text', text: textVal };
      } else if (legacyRow?.productRefId) {
        // Se possui referência a produto, registra como bound datum placeholder
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

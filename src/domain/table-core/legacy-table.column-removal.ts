import {
  CatalogTableRow,
  ContentBlock,
  TableColumnConfig
} from '../catalog.schema';

export class LegacyTableColumnRemovalError extends Error {
  readonly code: 'COLUMN_NOT_FOUND' | 'MIN_COLUMNS_REACHED';

  constructor(code: 'COLUMN_NOT_FOUND' | 'MIN_COLUMNS_REACHED', message: string) {
    super(message);
    this.name = 'LegacyTableColumnRemovalError';
    this.code = code;
  }
}

function omitRecordKey<T>(
  record: Record<string, T> | undefined,
  key: string
): Record<string, T> | undefined {
  if (!record || !Object.prototype.hasOwnProperty.call(record, key)) {
    return record;
  }

  const next = { ...record };
  delete next[key];
  return next;
}

function removeColumnPayload(row: CatalogTableRow, columnKey: string): CatalogTableRow {
  const localOverrides = omitRecordKey(row.localOverrides, columnKey);
  const cellValues = omitRecordKey(row.cellValues, columnKey);
  const cellBindings = omitRecordKey(row.cellBindings, columnKey);

  if (
    localOverrides === row.localOverrides &&
    cellValues === row.cellValues &&
    cellBindings === row.cellBindings
  ) {
    return row;
  }

  return {
    ...row,
    localOverrides,
    cellValues,
    cellBindings
  };
}

function isStringMatrix(value: unknown): value is string[][] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string')
    )
  );
}

function deriveLegacyCustomRows(
  block: ContentBlock,
  columns: readonly TableColumnConfig[]
): CatalogTableRow[] | undefined {
  if (block.type !== 'custom_table') return block.tableRows;
  if (block.tableRows !== undefined) return block.tableRows;

  const customRowsValue = (block.customData as Record<string, unknown> | undefined)?.rows;
  if (!isStringMatrix(customRowsValue)) return undefined;

  return customRowsValue.map((legacyRow, rowIndex) => {
    const localOverrides: Record<string, string> = {};
    legacyRow.forEach((value, columnIndex) => {
      const column = columns[columnIndex];
      if (column) localOverrides[column.key] = value;
    });

    return {
      id: `crow-${rowIndex + 1}`,
      order: rowIndex,
      localOverrides
    };
  });
}

export interface LegacyTableColumnRemovalPatch {
  tableColumns: TableColumnConfig[];
  tableRows?: CatalogTableRow[];
  customData?: ContentBlock['customData'];
}

/**
 * Remove uma coluna do modelo editorial legado em uma única transição canônica.
 * Além da configuração da coluna, elimina qualquer payload da mesma chave em
 * localOverrides, cellValues e cellBindings. Custom tables posicionais são
 * canonicalizadas para tableRows antes da remoção para impedir ressurreição
 * após save/reload ou re-add de coluna.
 */
export function removeLegacyTableColumn(
  block: ContentBlock,
  columns: readonly TableColumnConfig[],
  columnKey: string
): LegacyTableColumnRemovalPatch {
  if (columns.length <= 1) {
    throw new LegacyTableColumnRemovalError(
      'MIN_COLUMNS_REACHED',
      'A tabela não pode ficar sem colunas.'
    );
  }

  const columnIndex = columns.findIndex((column) => column.key === columnKey);
  if (columnIndex === -1) {
    throw new LegacyTableColumnRemovalError(
      'COLUMN_NOT_FOUND',
      `Coluna "${columnKey}" não encontrada.`
    );
  }

  const tableColumns = columns.filter((column) => column.key !== columnKey);
  const sourceRows = deriveLegacyCustomRows(block, columns);
  const tableRows = sourceRows?.map((row) => removeColumnPayload(row, columnKey));

  const patch: LegacyTableColumnRemovalPatch = { tableColumns };
  if (tableRows) patch.tableRows = tableRows;

  if (
    block.type === 'custom_table' &&
    block.customData &&
    (Object.prototype.hasOwnProperty.call(block.customData, 'headers') ||
      Object.prototype.hasOwnProperty.call(block.customData, 'rows'))
  ) {
    const customData = { ...block.customData };
    delete customData.headers;
    delete customData.rows;
    patch.customData = customData;
  }

  return patch;
}

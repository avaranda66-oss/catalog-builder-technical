export class TableTsvError extends Error {
  constructor(
    readonly code: 'TSV_MALFORMED_QUOTE' | 'TSV_ROW_WIDTH_MISMATCH',
    message: string
  ) {
    super(message);
    this.name = 'TableTsvError';
  }
}

function serializeField(value: string): string {
  const normalized = value.replace(/\r\n?/g, '\n');
  if (!/[\t\n"]/.test(normalized)) return normalized;
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function serializeTsv(matrix: readonly (readonly string[])[]): string {
  if (matrix.length === 0) return '';
  const width = matrix[0]?.length ?? 0;
  if (matrix.some((row) => row.length !== width)) {
    throw new TableTsvError('TSV_ROW_WIDTH_MISMATCH', 'TSV matrix must be rectangular');
  }
  return matrix.map((row) => row.map(serializeField).join('\t')).join('\n');
}

export function parseTsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let quoteClosed = false;
  let fieldStarted = false;
  let endedWithRecordSeparator = false;

  const pushField = () => {
    row.push(field);
    field = '';
    quoted = false;
    quoteClosed = false;
    fieldStarted = false;
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          quoteClosed = true;
        }
        continue;
      }
      if (character === '\r') {
        if (input[index + 1] === '\n') index += 1;
        field += '\n';
      } else {
        field += character;
      }
      continue;
    }
    if (quoteClosed) {
      if (character === '\t') {
        pushField();
        endedWithRecordSeparator = false;
        continue;
      }
      if (character === '\r' || character === '\n') {
        if (character === '\r' && input[index + 1] === '\n') index += 1;
        pushRow();
        endedWithRecordSeparator = true;
        continue;
      }
      throw new TableTsvError(
        'TSV_MALFORMED_QUOTE',
        'Unexpected characters after a closing quoted field'
      );
    }

    if (character === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
      endedWithRecordSeparator = false;
      continue;
    }
    if (character === '\t') {
      pushField();
      endedWithRecordSeparator = false;
      continue;
    }
    if (character === '\r' || character === '\n') {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      pushRow();
      endedWithRecordSeparator = true;
      continue;
    }
    field += character;
    fieldStarted = true;
    endedWithRecordSeparator = false;
  }

  if (quoted) {
    throw new TableTsvError('TSV_MALFORMED_QUOTE', 'Unterminated quoted TSV field');
  }

  if (!endedWithRecordSeparator || row.length > 0 || field.length > 0 || quoteClosed || fieldStarted) {
    pushRow();
  }

  if (rows.length === 0) rows.push(['']);
  const width = rows[0].length;
  if (rows.some((candidate) => candidate.length !== width)) {
    throw new TableTsvError(
      'TSV_ROW_WIDTH_MISMATCH',
      'All pasted TSV rows must contain the same number of fields'
    );
  }
  return rows;
}

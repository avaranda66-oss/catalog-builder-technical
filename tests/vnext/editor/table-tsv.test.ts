import { describe, expect, it } from 'vitest';
import { parseTsv, serializeTsv, TableTsvError } from '@/vnext/editor/table-tsv';

describe('W4.D TSV parser/serializer', () => {
  it('round-trips rectangular 1x1 and 2x3 matrices including empty cells', () => {
    expect(parseTsv(serializeTsv([['A']]))).toEqual([['A']]);
    const matrix = [['A', '', 'C'], ['', 'E', '']];
    expect(parseTsv(serializeTsv(matrix))).toEqual(matrix);
  });

  it('normalizes CRLF/CR records and preserves trailing empty columns', () => {
    expect(parseTsv('A\t\r\nB\tC\rD\t')).toEqual([
      ['A', ''],
      ['B', 'C'],
      ['D', ''],
    ]);
  });

  it('does not create a phantom row for one trailing record separator', () => {
    expect(parseTsv('A\tB\n')).toEqual([['A', 'B']]);
    expect(parseTsv('A\tB\r\n')).toEqual([['A', 'B']]);
  });
  it('supports quoted tabs, embedded newlines and escaped double quotes without shifting cells', () => {
    const input = '"A\tB"\t"C\nD"\t"He said ""ok"""\nX\tY\tZ';
    expect(parseTsv(input)).toEqual([
      ['A\tB', 'C\nD', 'He said "ok"'],
      ['X', 'Y', 'Z'],
    ]);
    expect(serializeTsv([['A\tB', 'C\nD', 'He said "ok"']]))
      .toBe('"A\tB"\t"C\nD"\t"He said ""ok"""');
  });

  it('rejects malformed quoting and ragged rows instead of silently shifting cells', () => {
    expect(() => parseTsv('"unterminated')).toThrowError(TableTsvError);
    expect(() => parseTsv('"A"x\tB')).toThrowError(TableTsvError);
    expect(() => parseTsv('A\tB\nC')).toThrowError(TableTsvError);
    expect(() => serializeTsv([['A'], ['B', 'C']])).toThrowError(TableTsvError);
  });
});

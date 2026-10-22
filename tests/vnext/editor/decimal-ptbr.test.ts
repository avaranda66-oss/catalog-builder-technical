import { describe, expect, it } from 'vitest';
import { decimalDraftMatches, formatDecimalPtBr, parseDecimalPtBr, sameDecimal } from '@/vnext/editor/decimal-ptbr';
import {
  INSPECTOR_INVALID_NUMBER_MESSAGE,
  INSPECTOR_NON_POSITIVE_SIZE_MESSAGE,
  inspectorDraftFromFrame,
  inspectorDraftIsDirty,
  inspectorErrorStatus,
  planInspectorDraft,
  resolveInspectorField,
  sameInspectorFrame,
} from '@/vnext/editor/inspector-frame-draft';

const value = (raw: string) => {
  const parsed = parseDecimalPtBr(raw);
  return parsed.ok ? parsed.value : parsed.reason;
};

describe('parseDecimalPtBr (FR-10)', () => {
  it.each([
    ['88,5', 88.5],
    ['88.5', 88.5],
    ['88.0', 88],
    ['88,0', 88],
    ['88', 88],
    [' 12,5 ', 12.5],
    ['1,5', 1.5],
    [',5', 0.5],
    ['.5', 0.5],
    ['12,', 12],
    ['-3,25', -3.25],
    ['−3,25', -3.25],
    ['+7', 7],
    ['0,0001', 0.0001],
    ['12,5 mm', 12.5],
    ['12,5mm', 12.5],
    ['1.234,5', 1234.5],
    ['1.234.567', 1234567],
    ['1,234.5', 1234.5],
    ['-0', 0],
  ])('reads %j as %d', (raw, expected) => {
    expect(value(raw)).toBe(expected);
  });

  it('treats a single separator as the decimal mark (never as thousands)', () => {
    expect(value('1.234')).toBe(1.234);
    expect(value('1,234')).toBe(1.234);
  });

  it.each(['abc', '12,5cm', '1e3', '12..5', '1,2,3', '1.23,4.5', '-', ',', 'Infinity', 'NaN', '0x10'])(
    'rejects %j as INVALID',
    (raw) => expect(value(raw)).toBe('INVALID')
  );

  it.each(['', '   ', 'mm'])('reports %j as EMPTY', (raw) => expect(value(raw)).toBe('EMPTY'));
});

describe('formatDecimalPtBr', () => {
  it('uses a comma and drops trailing zeros', () => {
    expect(formatDecimalPtBr(88.5)).toBe('88,5');
    expect(formatDecimalPtBr(88)).toBe('88');
    expect(formatDecimalPtBr(25.125)).toBe('25,125');
    expect(formatDecimalPtBr(0.0001)).toBe('0,0001');
    expect(formatDecimalPtBr(-1)).toBe('-1');
    expect(formatDecimalPtBr(-0)).toBe('0');
    expect(formatDecimalPtBr(1 / 3)).toBe('0,3333');
    expect(formatDecimalPtBr(Number.NaN)).toBe('');
  });

  it('round-trips through the parser', () => {
    for (const n of [0, 1, 12.5, 88.25, 209.9999, -14.5]) {
      expect(value(formatDecimalPtBr(n))).toBe(n);
    }
  });
});

describe('numeric comparison', () => {
  it('compares numbers, not text', () => {
    expect(decimalDraftMatches('88.0', 88)).toBe(true);
    expect(decimalDraftMatches('88,0', 88)).toBe(true);
    expect(decimalDraftMatches('88', 88)).toBe(true);
    expect(decimalDraftMatches('88,5', 88)).toBe(false);
    expect(decimalDraftMatches('abc', 88)).toBe(false);
    expect(decimalDraftMatches('', 88)).toBe(false);
    expect(sameDecimal(0.1 + 0.2, 0.3)).toBe(true);
    expect(sameDecimal(25.12504, 25.125)).toBe(true);
    expect(sameDecimal(25.1251, 25.125)).toBe(false);
  });
});

describe('inspector frame draft', () => {
  it('compares position and size only', () => {
    const frame = { xMm: 12.5, yMm: 30, widthMm: 40, heightMm: 50 };
    expect(sameInspectorFrame(frame, { ...frame })).toBe(true);
    expect(sameInspectorFrame(frame, { ...frame, xMm: 12 })).toBe(false);
    expect(sameInspectorFrame(frame, { ...frame, heightMm: 51 })).toBe(false);
  });

  const frame = { xMm: 88, yMm: 30, widthMm: 40.5, heightMm: 50 };

  it('formats the canonical draft in pt-BR and is never dirty for an equivalent number', () => {
    const draft = inspectorDraftFromFrame(frame);
    expect(draft).toEqual({ x: '88', y: '30', width: '40,5', height: '50' });
    expect(inspectorDraftIsDirty(draft, frame)).toBe(false);
    expect(inspectorDraftIsDirty({ ...draft, x: '88.0' }, frame)).toBe(false);
    expect(inspectorDraftIsDirty({ ...draft, width: '40.50' }, frame)).toBe(false);
    expect(inspectorDraftIsDirty({ ...draft, x: '88,5' }, frame)).toBe(true);
    expect(inspectorDraftIsDirty({ ...draft, x: 'abc' }, frame)).toBe(true);
  });

  it('resolves typed values into changes or short, plain errors', () => {
    const draft = inspectorDraftFromFrame(frame);
    expect(resolveInspectorField({ ...draft, x: '88,5' }, frame, 'x')).toEqual({ kind: 'changed', valueMm: 88.5 });
    expect(resolveInspectorField({ ...draft, x: '88.0' }, frame, 'x')).toEqual({ kind: 'unchanged' });
    expect(resolveInspectorField({ ...draft, x: 'abc' }, frame, 'x')).toEqual({ kind: 'invalid', message: INSPECTOR_INVALID_NUMBER_MESSAGE });
    expect(resolveInspectorField({ ...draft, width: '0' }, frame, 'width')).toEqual({ kind: 'invalid', message: INSPECTOR_NON_POSITIVE_SIZE_MESSAGE });
    expect(resolveInspectorField({ ...draft, width: '-2' }, frame, 'width')).toEqual({ kind: 'invalid', message: INSPECTOR_NON_POSITIVE_SIZE_MESSAGE });
    expect(resolveInspectorField({ ...draft, x: '-1' }, frame, 'x')).toEqual({ kind: 'changed', valueMm: -1 });
    expect(resolveInspectorField({ ...draft, width: '99' }, frame, 'width', { sizeLocked: true })).toEqual({ kind: 'unchanged' });
  });

  it('plans all requested fields at once', () => {
    const plan = planInspectorDraft({ x: '10,5', y: 'abc', width: '40.5', height: '60' }, frame);
    expect(plan.changes).toEqual({ x: 10.5, height: 60 });
    expect(plan.errors).toEqual([{ field: 'y', message: INSPECTOR_INVALID_NUMBER_MESSAGE }]);
    expect(planInspectorDraft({ x: '10,5', y: 'abc', width: '40.5', height: '60' }, frame, ['x']).errors).toEqual([]);
  });

  it('names the field in the status sentence without jargon', () => {
    expect(inspectorErrorStatus({ field: 'x', message: INSPECTOR_INVALID_NUMBER_MESSAGE }))
      .toBe('X: digite um número em milímetros, como 12,5. O valor anterior foi mantido.');
    expect(inspectorErrorStatus({ field: 'height', message: INSPECTOR_NON_POSITIVE_SIZE_MESSAGE }))
      .toBe('Altura: a largura e a altura precisam ser maiores que zero. O valor anterior foi mantido.');
  });
});

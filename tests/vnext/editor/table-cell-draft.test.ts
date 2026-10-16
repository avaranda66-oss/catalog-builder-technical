import { describe, expect, it } from 'vitest';
import { plainRichText } from '@/vnext/domain';
import {
  changeTableCellDraftType,
  clearTableCellDraft,
  confirmTableCellDraftTypeChange,
  createTableCellDraft,
  CELL_TECHNICAL_SYMBOLS,
  insertIntoCellText,
  setTableCellDraftComposition,
  startTableCellDraftByTyping,
  tableCellDraftHasChanges,
  updateTableCellDraft,
  validateTableCellDraft,
} from '@/vnext/editor/table-cell-draft';

const identity = { pageId: 'p', objectId: 'o', tableId: 't', cellId: 'c' };

describe('W4.B table cell draft', () => {
  it('starts clean and edits ephemerally without touching original content', () => {
    const original = { type: 'technicalCode' as const, value: 'A' };
    const draft = createTableCellDraft(identity, original);
    const edited = updateTableCellDraft(draft, { technicalCode: 'B' });
    expect(draft.dirty).toBe(false);
    expect(edited.dirty).toBe(true);
    expect(original).toEqual({ type: 'technicalCode', value: 'A' });
    expect(validateTableCellDraft(edited)).toMatchObject({ ok: true, input: { value: 'B' } });
  });

  it('requires explicit confirmation for destructive type changes and clear', () => {
    const base = createTableCellDraft(identity, { type: 'technicalCode', value: 'A' });
    const switched = changeTableCellDraftType(base, 'measurement');
    expect(switched.requiresTypeChangeConfirmation).toBe(true);
    expect(validateTableCellDraft(switched).ok).toBe(false);
    expect(confirmTableCellDraftTypeChange(switched).requiresTypeChangeConfirmation).toBe(false);
    expect(clearTableCellDraft(base)).toMatchObject({ activeType: 'empty', requiresTypeChangeConfirmation: true });
  });
  it('allows empty-to-type choice without destructive confirmation and preserves measurement strings', () => {
    const base = createTableCellDraft(identity, { type: 'empty' });
    const measurement = updateTableCellDraft(changeTableCellDraftType(base, 'measurement'), {
      measurement: { valueText: '0.010', unit: 'V', qualifier: 'approx' },
    });
    expect(measurement.requiresTypeChangeConfirmation).toBe(false);
    expect(validateTableCellDraft(measurement)).toEqual({
      ok: true,
      input: { type: 'measurement', valueText: '0.010', unit: 'V', qualifier: 'approx' },
      allowTypeChange: true,
    });
  });

  it('keeps invalid code/measurement drafts open with Father-facing messages', () => {
    const code = updateTableCellDraft(createTableCellDraft(identity, { type: 'technicalCode', value: 'A' }), {
      technicalCode: 'A\nB',
    });
    expect(validateTableCellDraft(code)).toMatchObject({
      ok: false, message: 'O código precisa ser preenchido e não pode conter quebras de linha.',
    });
    const measurement = updateTableCellDraft(createTableCellDraft(identity, {
      type: 'measurement', valueText: '1', unit: 'V',
    }), { measurement: { valueText: '1,2' } });
    expect(validateTableCellDraft(measurement)).toMatchObject({
      ok: false, message: 'Informe um valor válido, como 12.5, -3 ou 1.2e-4.',
    });
  });
  it('fails closed for advanced RichText and leaves marker/image immutable', () => {
    const advanced = createTableCellDraft(identity, {
      type: 'richText',
      value: { paragraphs: [{ id: 'p', inlines: [
        { kind: 'text', id: 'a', text: 'A', marks: [] },
        { kind: 'text', id: 'b', text: 'B', marks: [] },
      ] }] },
    });
    expect(validateTableCellDraft(advanced)).toMatchObject({ ok: false, unsupportedRichText: true });
    for (const content of [
      { type: 'marker' as const, legendEntryId: 'l' },
      { type: 'image' as const, assetId: 'a' },
    ]) {
      const draft = createTableCellDraft(identity, content);
      expect(changeTableCellDraftType(draft, 'richText')).toEqual(draft);
      expect(clearTableCellDraft(draft)).toEqual(draft);
      expect(validateTableCellDraft(draft).ok).toBe(false);
    }
  });

  it('tracks IME composition independently and keeps simple RichText multiline lossless', () => {
    const draft = createTableCellDraft(identity, { type: 'richText', value: plainRichText('r', 'A') });
    expect(setTableCellDraftComposition(draft, true).composing).toBe(true);
    const edited = updateTableCellDraft(draft, { richText: 'A\nB' });
    expect(validateTableCellDraft(edited)).toEqual({
      ok: true, input: { type: 'richText', plainText: 'A\nB' }, allowTypeChange: false,
    });
  });
});

describe('FR-30 cell draft for typing inside the cell', () => {
  it('opens an empty cell as Texto, ready to type, and keeps it empty when nothing is typed', () => {
    const draft = createTableCellDraft(identity, { type: 'empty' });
    expect(draft.activeType).toBe('richText');
    expect(draft.dirty).toBe(false);
    expect(validateTableCellDraft(draft)).toEqual({ ok: true, input: { type: 'empty' }, allowTypeChange: false });
    const typed = updateTableCellDraft(draft, { richText: '±0,1 %' });
    expect(validateTableCellDraft(typed)).toEqual({
      ok: true, input: { type: 'richText', plainText: '±0,1 %' }, allowTypeChange: true,
    });
  });

  it('typing on a selected cell replaces the content, keeping a code a code and a measurement its unit', () => {
    const text = createTableCellDraft(identity, { type: 'richText', value: plainRichText('r', 'Antigo') });
    expect(startTableCellDraftByTyping(text, 'N')).toMatchObject({ activeType: 'richText', richText: 'N', dirty: true });
    const code = createTableCellDraft(identity, { type: 'technicalCode', value: 'TA-25N' });
    expect(startTableCellDraftByTyping(code, 'X')).toMatchObject({ activeType: 'technicalCode', technicalCode: 'X' });
    const measurement = createTableCellDraft(identity, { type: 'measurement', valueText: '12', unit: 'mm' });
    expect(startTableCellDraftByTyping(measurement, '3')).toMatchObject({
      activeType: 'measurement', measurement: { valueText: '3', unit: 'mm' },
    });
    // A dead key (accent) opens the cell empty; the browser then types the accented letter.
    expect(startTableCellDraftByTyping(text, '')).toMatchObject({ richText: '', dirty: true });
  });

  it('never replaces marks, images or text with advanced formatting by typing', () => {
    for (const content of [
      { type: 'marker' as const, legendEntryId: 'l' },
      { type: 'image' as const, assetId: 'a' },
    ]) {
      const draft = createTableCellDraft(identity, content);
      expect(startTableCellDraftByTyping(draft, 'x')).toEqual(draft);
    }
    const advanced = createTableCellDraft(identity, {
      type: 'richText',
      value: { paragraphs: [{ id: 'p', inlines: [
        { kind: 'text', id: 'a', text: 'A', marks: [] },
        { kind: 'text', id: 'b', text: 'B', marks: [] },
      ] }] },
    });
    expect(startTableCellDraftByTyping(advanced, 'x')).toEqual(advanced);
  });
});

describe('FR-22 a cell draft is dirty only while it differs', () => {
  it('opening, or typing and going back to the original value, is not an unsaved change', () => {
    const draft = createTableCellDraft(identity, { type: 'richText', value: plainRichText('r', 'Faixa') });
    expect(tableCellDraftHasChanges(draft)).toBe(false);
    const typed = updateTableCellDraft(draft, { richText: 'Faixas' });
    expect(typed.dirty).toBe(true);
    expect(updateTableCellDraft(typed, { richText: 'Faixa' }).dirty).toBe(false);
    const empty = createTableCellDraft(identity, { type: 'empty' });
    expect(updateTableCellDraft(updateTableCellDraft(empty, { richText: 'a' }), { richText: '' }).dirty).toBe(false);
  });

  it('type changes and clearing are changes; going back to the original type is not', () => {
    const code = createTableCellDraft(identity, { type: 'technicalCode', value: 'A' });
    const asText = changeTableCellDraftType(code, 'richText');
    expect(asText.dirty).toBe(true);
    expect(changeTableCellDraftType(asText, 'technicalCode').dirty).toBe(false);
    expect(clearTableCellDraft(code).dirty).toBe(true);
    expect(clearTableCellDraft(createTableCellDraft(identity, { type: 'empty' })).dirty).toBe(false);
    const measurement = createTableCellDraft(identity, { type: 'measurement', valueText: '1', unit: 'V', qualifier: 'max' });
    expect(updateTableCellDraft(measurement, { measurement: { unit: 'mV' } }).dirty).toBe(true);
    expect(updateTableCellDraft(measurement, { measurement: { qualifier: 'max' } }).dirty).toBe(false);
  });

  it('marks and images never become dirty', () => {
    const marker = createTableCellDraft(identity, { type: 'marker', legendEntryId: 'l' });
    expect(tableCellDraftHasChanges({ ...marker, activeType: 'richText', richText: 'x' })).toBe(false);
  });
});

describe('FR-30 technical symbols', () => {
  it('offers the symbols the father uses most, in order', () => {
    expect(CELL_TECHNICAL_SYMBOLS).toEqual(['±', '°C', '%', '³', '²', 'Ø', '×', 'Δ', 'µ', 'Ω']);
  });

  it('inserts at the caret or replaces the selected text', () => {
    expect(insertIntoCellText('25 C', 3, 3, '°')).toEqual({ text: '25 °C', caret: 4 });
    expect(insertIntoCellText('0,1 x', 4, 5, '%')).toEqual({ text: '0,1 %', caret: 5 });
    expect(insertIntoCellText('10', null, undefined, '²')).toEqual({ text: '10²', caret: 3 });
    expect(insertIntoCellText('ab', 9, -2, 'Ω')).toEqual({ text: 'abΩ', caret: 3 });
  });
});

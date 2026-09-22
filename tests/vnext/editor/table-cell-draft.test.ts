import { describe, expect, it } from 'vitest';
import { plainRichText } from '@/vnext/domain';
import {
  changeTableCellDraftType,
  clearTableCellDraft,
  confirmTableCellDraftTypeChange,
  createTableCellDraft,
  setTableCellDraftComposition,
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

import { describe, expect, it } from 'vitest';
import { reviewSuggestions } from '@/vnext/translation/review-suggestions';
import { requireReviewText } from '@/vnext/translation/candidate';

const suggest = (source: string, translated: string, target: 'en-US' | 'es-ES' = 'en-US', keep: readonly string[] = []) =>
  reviewSuggestions(source, translated, 'pt-BR', target, keep)!;

describe('FR-85 review-suggestions · what the screen may offer', () => {
  it('never suggests "1,500 → 1.500" when the source has the ambiguous "1.500" (the person typed the thousands reading)', () => {
    const typed = suggest('Pressão máxima 1.500 mbar', 'Maximum pressure 1,500 mbar');
    expect(typed.numberFix).toBeUndefined();
    expect(typed.format.changes).toEqual([]);
    expect(typed.questions).toEqual([]);
    expect(typed.total).toBe(0);
    expect(() => requireReviewText('Pressão máxima 1.500 mbar', 'Maximum pressure 1,500 mbar', 'en-US')).not.toThrow();
    // The same number left as in the source still gets the question.
    const untouched = suggest('Pressão máxima 1.500 mbar', 'Maximum pressure 1.500 mbar');
    expect(untouched.numberFix).toBeUndefined();
    expect(untouched.questions.map(question => question.token)).toEqual(['1.500']);
    expect(untouched.questions[0].apply(untouched.questions[0].options[0])).toBe('Maximum pressure 1,500 mbar');
    // After the person confirmed a reading, nothing is asked or suggested again.
    expect(suggest('Pressão máxima 1.500 mbar', 'Maximum pressure 1.500 mbar', 'en-US', ['1.500']).total).toBe(0);
    expect(suggest('Pressão máxima 1.500 mbar', 'Maximum pressure 1,500 mbar', 'en-US', ['1,500']).total).toBe(0);
  });

  it('does not turn a three-decimal value into a question after its own adjustment ("1,500 mm" → "1.500 mm")', () => {
    const before = suggest('Faixa: 0 a 1,500 mm', 'Range: 0 to 1,500 mm');
    expect(before.numberFix).toBe('Range: 0 to 1.500 mm');
    expect(before.format.settled).toEqual(['1.500']);
    expect(before.questions).toEqual([]);
    const after = suggest('Faixa: 0 a 1,500 mm', before.numberFix!);
    expect(after.questions).toEqual([]);
    expect(after.numberFix).toBeUndefined();
    expect(after.total).toBe(0);
    // Also with the readings the screen stores after applying the fix.
    expect(suggest('Faixa: 0 a 1,500 mm', before.numberFix!, 'en-US', before.format.settled).total).toBe(0);
    expect(() => requireReviewText('Faixa: 0 a 1,500 mm', 'Range: 0 to 1.500 mm', 'en-US')).not.toThrow();
  });

  it('offers "% FS"/"% FE" for "% do fundo de escala" and the guardian accepts what it offers', () => {
    const withSign = suggest('Exatidão: ±0,5 % do fundo de escala', 'Accuracy: ±0,5 % do fundo de escala');
    expect(withSign.numberFix).toBe('Accuracy: ±0.5 % FS');
    expect(withSign.format.changes.map(change => change.kind)).toEqual(['decimal', 'abbreviation']);
    expect(() => requireReviewText('Exatidão: ±0,5 % do fundo de escala', withSign.numberFix!, 'en-US')).not.toThrow();
    const plain = suggest('Exatidão: 0,5 % do fundo de escala', 'Accuracy: 0,5 % do fundo de escala');
    expect(plain.numberFix).toBe('Accuracy: 0.5 % FS');
    expect(() => requireReviewText('Exatidão: 0,5 % do fundo de escala', plain.numberFix!, 'en-US')).not.toThrow();
    const spanish = suggest('Exatidão: ±0,5 % do fundo de escala', 'Exactitud: ±0,5 % do fundo de escala', 'es-ES');
    expect(spanish.numberFix).toBe('Exactitud: ±0,5 % FE');
    expect(() => requireReviewText('Exatidão: ±0,5 % do fundo de escala', spanish.numberFix!, 'es-ES')).not.toThrow();
    const thread = suggest('Prensa-cabo M20x1,5', 'Cable gland M20x1,5');
    expect(thread.numberFix).toBe('Cable gland M20x1.5');
    expect(() => requireReviewText('Prensa-cabo M20x1,5', thread.numberFix!, 'en-US')).not.toThrow();
  });

  it('asks about both numbers of a hyphenated range and accepts each answer', () => {
    const range = suggest('Faixa: 1.500-2.000 mbar', 'Range: 1.500-2.000 mbar');
    expect(range.questions.map(question => question.token)).toEqual(['1.500', '2.000']);
    const first = range.questions[0].apply(range.questions[0].options[0]);
    expect(first).toBe('Range: 1,500-2.000 mbar');
    expect(() => requireReviewText('Faixa: 1.500-2.000 mbar', first, 'en-US')).not.toThrow();
    const second = suggest('Faixa: 1.500-2.000 mbar', first, 'en-US', ['1,500']);
    expect(second.questions.map(question => question.token)).toEqual(['2.000']);
    expect(second.numberFix).toBeUndefined();
    expect(second.questions[0].apply(second.questions[0].options[0])).toBe('Range: 1,500-2,000 mbar');
  });

  it('drops any suggestion whose result the guardian would refuse', () => {
    // The draft already carries an extra value; neither the number fix nor the question can make it valid.
    const extra = suggest('Pressão 1.500 mbar', 'Pressure 1.500 mbar at 0,5 bar');
    expect(extra.format.changes.map(change => change.from)).toEqual(['0,5']);
    expect(extra.numberFix).toBeUndefined();
    expect(extra.questions).toEqual([]);
    expect(extra.total).toBe(0);
    const spelling = suggest('Pressão 1.500 mbar', 'Pression 1.500 mbar at 0,5 bar');
    expect(spelling.spelling).toEqual([]);
    const glossary = suggest('Código de Encomenda 1.500 mbar', 'Ordering Code 1.500 mbar at 0,5 bar');
    expect(glossary.glossary).toEqual([{ hint: { sourceTerm: 'Código de Encomenda', expected: 'Order Code', found: 'Ordering Code' }, replacement: undefined }]);
    // Once the extra value is gone, the same suggestions come back with their buttons.
    expect(suggest('Pressão 1.500 mbar', 'Pression 1.500 mbar').spelling.map(item => item.replacement)).toEqual(['Pressure 1.500 mbar']);
    expect(suggest('Código de Encomenda 1.500 mbar', 'Ordering Code 1.500 mbar').glossary[0].replacement).toBe('Order Code 1.500 mbar');
  });

  it('returns undefined when the source is not Portuguese (Brazil)', () => {
    expect(reviewSuggestions('Accuracy 0.5 % FS', 'Accuracy 0.5 % FS', 'en-GB', 'es-ES')).toBeUndefined();
  });
});

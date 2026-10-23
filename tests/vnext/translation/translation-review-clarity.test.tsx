import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranslationReview, reviewSuggestionSummary } from '@/vnext/app/TranslationReview';
import { translationReviewKey, type TranslationReviewRun } from '@/vnext/translation/candidate';
import type { TranslationReviewCoordinator, TranslationReviewSnapshot } from '@/vnext/translation/review-coordinator';
import { sourceHighlightSegments } from '@/vnext/translation/review-highlights';

afterEach(cleanup);

const base = { kind: 'tableCell', pageLabel: 'Página 1', typeLabel: 'Célula da tabela', locationLabel: 'Página 1 · Célula da tabela' } as const;
const run = (index: number, sourceText: string, translatedText: string): TranslationReviewRun =>
  ({ ...base, unitId: `unit-${index}`, runId: 'run', sourceText, translatedText });

function setup(initial: Partial<TranslationReviewSnapshot>) {
  let snapshot: TranslationReviewSnapshot = { phase: 'review', pending: false, runs: [], targetLocale: 'en-US',
    reviewedRunKeys: [], correctedRunKeys: [], invalidRunKeys: [], correctionCount: 0, confirmedReadings: {}, ...initial };
  const listeners = new Set<() => void>();
  const coordinator = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel: vi.fn(() => true), generate: vi.fn(async () => {}), correct: vi.fn(() => true), confirmReading: vi.fn(),
    markReviewed: vi.fn(() => true), accept: vi.fn(async () => {}),
  };
  const view = render(<TranslationReview coordinator={coordinator as unknown as TranslationReviewCoordinator} sourceLocale="pt-BR"
    sourceTitle="PRESYS TA-25N" onClose={vi.fn()} onOpenCopy={vi.fn()} />);
  const publish = (change: Partial<TranslationReviewSnapshot>) => act(() => {
    snapshot = { ...snapshot, ...change }; listeners.forEach(listener => listener());
  });
  return { view, coordinator, publish };
}

describe('FR-85/FR-87 destaques do original', () => {
  it('splits the original into pieces that join back to it byte for byte', () => {
    for (const text of ['Exatidão: ±0,02 % FE no TA-25N', 'Linha Kompressor com MCS-XV e ST-501', 'Texto simples', '', 'Faixa: -25,5 a 140,5 °C']) {
      expect(sourceHighlightSegments(text).map(segment => segment.text).join('')).toBe(text);
    }
  });

  it('marks numbers, units, codes, brands and models as the parts that stay the same', () => {
    const kept = (text: string) => sourceHighlightSegments(text).filter(segment => segment.keep).map(segment => segment.text);
    expect(kept('Exatidão: ±0,02 % FE no TA-25N')).toEqual(['±0,02 % FE', 'TA-25N']);
    expect(kept('Linha Kompressor com MCS-XV e ST-501')).toEqual(['Kompressor', 'MCS-XV', 'ST-501']);
    expect(kept('Texto simples')).toEqual([]);
  });
});

describe('FR-85/FR-87 revisão da tradução mais clara', () => {
  it('summarizes only the warnings that exist, in plain words', () => {
    expect(reviewSuggestionSummary({ numbers: 0, questions: 0, glossary: 0, spelling: 0 })).toBe('Nenhum aviso de números, glossário ou grafia.');
    expect(reviewSuggestionSummary({ numbers: 1, questions: 0, glossary: 0, spelling: 0 })).toBe('Para conferir: 1 ajuste de números.');
    expect(reviewSuggestionSummary({ numbers: 2, questions: 1, glossary: 3, spelling: 1 }))
      .toBe('Para conferir: 2 ajustes de números · 1 número para confirmar · 3 termos do glossário · 1 grafia a corrigir.');
  });

  it('shows the highlighted original, calls a generated trecho "A revisar" and explains what keeps its value', () => {
    const { view } = setup({ runs: [run(0, 'Exatidão do Kompressor: ±0,02 °C', 'Accuracy of the Kompressor: ±0,02 °C')] });
    const marks = [...view.container.querySelectorAll('mark.vnext-translation-keep')].map(mark => mark.textContent);
    expect(marks).toEqual(['Kompressor', '±0,02 °C']);
    expect(view.container.querySelector('[data-translation-source-text]')).toHaveTextContent('Exatidão do Kompressor: ±0,02 °C');
    expect(view.getByText('A revisar')).toBeInTheDocument();
    expect(view.getByText(/Os destaques no original \(números, unidades, códigos, marcas e modelos\) mantêm o mesmo valor na tradução/)).toBeInTheDocument();
  });

  it('counts spelling warnings and walks the person through every trecho with a warning, in order and in a loop', () => {
    const runs = [
      run(0, 'Exatidão: ±0,02 % FE', 'Accuracy: ±0,02 % FE'),
      run(1, 'Garantia de 2 anos', 'Warranty of 2 years'),
      run(2, 'Exatidão do sensor', 'Acuracy of the sensor'),
    ];
    const { view } = setup({ runs });
    expect(view.container.querySelector('[data-translation-suggestions-summary]'))
      .toHaveTextContent('Para conferir: 1 ajuste de números · 1 termo do glossário · 1 grafia a corrigir.');
    const next = view.getByRole('button', { name: 'Próximo trecho com aviso (2)' });
    fireEvent.click(next);
    expect(document.activeElement).toBe(view.getByRole('textbox', { name: 'Tradução 1' }));
    fireEvent.click(next);
    expect(document.activeElement).toBe(view.getByRole('textbox', { name: 'Tradução 3' }));
    fireEvent.click(next);
    expect(document.activeElement).toBe(view.getByRole('textbox', { name: 'Tradução 1' }));
  });

  it('includes a trecho that needs correction and hides the shortcut when nothing is left', () => {
    const runs = [run(0, 'Garantia de 2 anos', 'Warranty of 2 years'), run(1, 'Peso 3 kg', 'Weight 3 kg')];
    const { view, publish } = setup({ runs, invalidRunKeys: [translationReviewKey('unit-1', 'run')] });
    expect(view.container.querySelector('[data-translation-suggestions-summary]')).toHaveTextContent('Nenhum aviso de números, glossário ou grafia.');
    fireEvent.click(view.getByRole('button', { name: 'Próximo trecho com aviso (1)' }));
    expect(document.activeElement).toBe(view.getByRole('textbox', { name: 'Tradução 2' }));
    publish({ invalidRunKeys: [] });
    expect(view.queryByRole('button', { name: /Próximo trecho com aviso/ })).toBeNull();
  });
});

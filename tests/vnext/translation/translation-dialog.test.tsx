import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranslationReview } from '@/vnext/app/TranslationReview';
import type { TranslationReviewCoordinator, TranslationReviewSnapshot } from '@/vnext/translation/review-coordinator';

afterEach(cleanup);

const runs = [{ unitId: 'unit-a', runId: 'run-a', kind: 'tableCell', sourceText: 'Precisão ±0,1 °C', translatedText: 'Precisión ±0,1 °C' }];

function setup(snapshot: TranslationReviewSnapshot, sourceLocale = 'pt-BR') {
  const coordinator = {
    getSnapshot: () => snapshot, subscribe: () => () => {},
    cancel: vi.fn(() => true), generate: vi.fn(async () => {}), correct: vi.fn(() => true), accept: vi.fn(async () => {}),
  };
  const close = vi.fn();
  const view = render(<TranslationReview coordinator={coordinator as unknown as TranslationReviewCoordinator} sourceLocale={sourceLocale}
    onClose={close} onOpenCopy={vi.fn()} />);
  return { view, coordinator, close };
}

describe('P1.C translation dialog presentation guards', () => {
  it('shows the actual source locale without enabling any additional target language', () => {
    const { view } = setup({ phase: 'idle', pending: false, runs: [] }, 'es-ES');
    expect(view.container.querySelector('.vnext-translation-languages strong')).toHaveTextContent('Espanhol');
    const target = view.getByRole('combobox', { name: 'Idioma de destino' });
    expect(target).toHaveValue('es-ES');
    expect(target.querySelectorAll('option')).toHaveLength(1);
    expect(view.getByText(/Abra um catálogo em português na Biblioteca/)).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Gerar tradução' })).toBeEnabled();
    expect(view.queryByRole('button', { name: 'Salvar cópia traduzida' })).toBeNull();
  });

  it('separates source and editable translation and sends corrections through the existing coordinator', () => {
    const { view, coordinator } = setup({ phase: 'review', pending: false, runs });
    expect(view.getByRole('heading', { name: 'Revise a tradução' })).toBeInTheDocument();
    expect(view.getByText('Original · Português')).toBeInTheDocument();
    expect(view.getByText('Precisão ±0,1 °C')).toBeInTheDocument();
    const translation = view.getByRole('textbox', { name: 'Tradução 1' });
    fireEvent.change(translation, { target: { value: 'Precisión revisada ±0,1 °C' } });
    fireEvent.blur(translation);
    expect(coordinator.correct).toHaveBeenCalledWith('unit-a', 'run-a', 'Precisión revisada ±0,1 °C');
  });

  it('keeps ambiguous-copy verification available while close, cancel and further edits remain blocked', () => {
    const { view, coordinator, close } = setup({ phase: 'error', pending: true, runs,
      message: 'Não foi possível confirmar a cópia. Tente verificar novamente; nenhuma nova cópia será preparada.' });
    expect(view.getByRole('alert')).toHaveTextContent('Tente verificar novamente');
    expect(view.getByRole('button', { name: 'Fechar' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(view.getByRole('textbox', { name: 'Tradução 1' })).toBeDisabled();
    expect(view.queryByRole('button', { name: 'Gerar tradução' })).toBeNull();
    fireEvent.keyDown(view.getByRole('dialog'), { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    expect(coordinator.cancel).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: 'Verificar cópia' }));
    expect(coordinator.accept).toHaveBeenCalledOnce();
  });

  it('prevents saving an invalid review and preserves cancellable generation', () => {
    const invalid = setup({ phase: 'review', pending: false, runs, reviewInvalid: true });
    expect(invalid.view.getByRole('button', { name: 'Salvar cópia traduzida' })).toBeDisabled();
    invalid.view.unmount();
    const generating = setup({ phase: 'generating', pending: false, runs: [] });
    expect(generating.view.getByRole('status')).toHaveTextContent('revisar os textos');
    fireEvent.keyDown(generating.view.getByRole('dialog'), { key: 'Escape' });
    expect(generating.coordinator.cancel).toHaveBeenCalledOnce();
    expect(generating.close).toHaveBeenCalledOnce();
  });
});

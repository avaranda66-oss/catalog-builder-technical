import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRANSLATION_SAVE_NEEDED_MESSAGE, TranslationReview } from '@/vnext/app/TranslationReview';
import type { ManualSaveResult } from '@/vnext/persistence/save-coordinator';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { translationReviewKey, type TranslationReviewRun } from '@/vnext/translation/candidate';
import type { TranslationReviewCoordinator, TranslationReviewSnapshot } from '@/vnext/translation/review-coordinator';
import type { CatalogPersistenceEnvelope } from '@/vnext/persistence';

afterEach(cleanup);

const runs: readonly TranslationReviewRun[] = [{ unitId: 'unit-a', runId: 'run-a', kind: 'tableCell',
  pageLabel: 'Página 1', typeLabel: 'Célula da tabela', locationLabel: 'Página 1 · Célula da tabela',
  sourceText: 'Precisão ±0,1 °C', translatedText: 'Precisión ±0,1 °C' }];
const firstKey = translationReviewKey(runs[0].unitId, runs[0].runId);

function setup(initial: Partial<TranslationReviewSnapshot>, sourceLocale = 'pt-BR', save?: () => Promise<ManualSaveResult>) {
  let snapshot: TranslationReviewSnapshot = { phase: 'idle', pending: false, runs: [], targetLocale: 'es-ES',
    reviewedRunKeys: [], correctedRunKeys: [], invalidRunKeys: [], correctionCount: 0, confirmedReadings: {}, ...initial };
  const listeners = new Set<() => void>();
  const coordinator = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel: vi.fn(() => true), generate: vi.fn(async () => {}), correct: vi.fn(() => true),
    markReviewed: vi.fn(() => true), accept: vi.fn(async () => {}),
  };
  const close = vi.fn(), openCopy = vi.fn();
  const view = render(<TranslationReview coordinator={coordinator as unknown as TranslationReviewCoordinator} sourceLocale={sourceLocale}
    sourceTitle="PRESYS TA-25N" onClose={close} onOpenCopy={openCopy} save={save} />);
  const publish = (change: Partial<TranslationReviewSnapshot>) => act(() => {
    snapshot = { ...snapshot, ...change }; listeners.forEach(listener => listener());
  });
  return { view, coordinator, close, openCopy, publish };
}

function savedCopy(): CatalogPersistenceEnvelope {
  let id = 0;
  const document = createW2CDemoDocument(() => `copy-${++id}`);
  document.locale = 'en-US';
  return { catalogId: document.id, documentSnapshot: document, title: document.title, locale: document.locale,
    remoteRevision: 1, lastMutationId: 'mutation-copy', createdAt: '2026-10-02T12:00:00.000Z', updatedAt: '2026-10-02T12:00:00.000Z',
    createdBy: 'user', updatedBy: 'user', archivedAt: null, documentSchemaVersion: 1,
    origin: { originKind: 'translation', originId: 'source-original', originRevision: 1 } };
}

describe('P2 Translation Center presentation and safety guards', () => {
  it('shows truthful batch progress and explains partial retry and reload without technical error codes', () => {
    const { view, publish, coordinator } = setup({ phase: 'generating', batchProgress: {
      totalBatches: 5, completedBatches: 2, cacheHits: 0, providerRequests: 2, eligibleUnits: 210, excludedSurfaces: 9,
    } });
    expect(view.getByRole('progressbar', { name: 'Progresso da tradução' })).toHaveAttribute('value', '2');
    expect(view.getByRole('progressbar')).toHaveAttribute('max', '5');
    expect(view.getByText(/2 de 5 etapas concluídas/)).toBeInTheDocument();
    expect(view.getByText(/Mantenha esta página aberta/)).toBeInTheDocument();
    publish({ phase: 'error', message: 'O serviço de tradução está ocupado. Aguarde um pouco e tente novamente; o original foi preservado.' });
    expect(view.getByText(/Tentar novamente reaproveita os textos já validados/)).toBeInTheDocument();
    expect(view.getByText(/Recarregar ou fechar o navegador reinicia a tradução/)).toBeInTheDocument();
    expect(view.container.textContent).not.toContain('PROVIDER_RATE_LIMIT');
    fireEvent.click(view.getByRole('button', { name: 'Tentar tradução novamente' }));
    expect(coordinator.generate).toHaveBeenCalledWith('es-ES');
    expect(coordinator.accept).not.toHaveBeenCalled();
  });

  it('puts original context before two regional targets and generates the selected active locale', () => {
    const { view, coordinator } = setup({});
    expect(view.getByRole('dialog', { name: 'Centro de Tradução' })).toBeInTheDocument();
    expect(view.getByText('PRESYS TA-25N')).toBeInTheDocument();
    expect(view.getByText('Português (Brasil)')).toBeInTheDocument();
    const target = view.getByRole('combobox', { name: 'Idioma de destino' });
    expect(target).toHaveValue('es-ES');
    expect([...target.querySelectorAll('option')].map(option => option.value)).toEqual(['es-ES', 'en-US']);
    expect(view.queryByRole('option', { name: /México|Reino Unido|Francês|Alemão|Italiano/ })).toBeNull();
    fireEvent.change(target, { target: { value: 'en-US' } });
    expect(view.getByText('English')).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Gerar tradução' }));
    expect(coordinator.generate).toHaveBeenCalledWith('en-US');
    expect(view.queryByRole('button', { name: 'Salvar cópia traduzida' })).toBeNull();
  });

  it('shows the actual source locale and directs translated copies back to the Portuguese original', () => {
    const { view, coordinator } = setup({}, 'es-ES');
    expect(view.container.querySelector('.vnext-translation-origin')).toHaveTextContent('Espanhol (Espanha)');
    expect(view.getByText(/Abra o catálogo original em português na Biblioteca/)).toBeInTheDocument();
    // The coordinator remains responsible for rejecting unsupported source/target pairs.
    fireEvent.click(view.getByRole('button', { name: 'Gerar tradução' }));
    expect(coordinator.generate).toHaveBeenCalledWith('es-ES');
  });

  it('groups fully visible source/translation pairs by page and type without exposing internal IDs', () => {
    const catalogRun: TranslationReviewRun = { ...runs[0], unitId: 'catalog-unit-hidden', runId: 'catalog-run-hidden', kind: 'catalogTitle',
      pageLabel: 'Catálogo', typeLabel: 'Título do catálogo', locationLabel: 'Catálogo · Título do catálogo', sourceText: 'Ficha técnica', translatedText: 'Technical data sheet' };
    const cellRun = { ...runs[0], translatedText: 'Accuracy ±0,1 °C' };
    const { view, coordinator } = setup({ phase: 'review', runs: [catalogRun, cellRun], targetLocale: 'en-US' });
    expect(view.getByRole('heading', { name: 'Revise a tradução' })).toBeInTheDocument();
    expect(view.getByRole('heading', { name: 'Catálogo' })).toBeInTheDocument();
    expect(view.getByRole('heading', { name: 'Página 1' })).toBeInTheDocument();
    expect(view.getAllByText('Original · Português')).toHaveLength(2);
    expect(view.getAllByText('Tradução · Inglês')).toHaveLength(2);
    // FR-85/87: o original continua inteiro, com o dado técnico destacado (fica igual na tradução).
    const sources = [...view.container.querySelectorAll('[data-translation-source-text]')];
    expect(sources.map(source => source.textContent)).toContain('Precisão ±0,1 °C');
    expect([...view.container.querySelectorAll('mark.vnext-translation-keep')].map(mark => mark.textContent)).toContain('±0,1 °C');
    expect(view.container.textContent).not.toContain('catalog-unit-hidden');
    expect(view.container.textContent).not.toContain('run-a');
    // F-09: na revisão o seletor some e os idiomas viram uma linha; a descrição fica só para leitores de tela.
    expect(view.queryByRole('combobox')).toBeNull();
    expect(view.container.querySelector('[data-translation-languages="compact"]')).toHaveTextContent(/PRESYS TA-25N·Português \(Brasil\) →.*Inglês \(Estados Unidos\)/);
    expect(view.getByText(/Gere e revise uma cópia/)).toHaveClass('vnext-translation-description-compact');
    expect(view.container.querySelector('[data-translation-suggestions-summary]')).toHaveTextContent('Para conferir: 1 ajuste de números.');
    const translation = view.getByRole('textbox', { name: 'Tradução 2' });
    expect(translation).toHaveAttribute('data-translation-run', '1');
    fireEvent.change(translation, { target: { value: 'Revised accuracy ±0,1 °C' } });
    fireEvent.blur(translation);
    expect(coordinator.correct).toHaveBeenCalledWith('unit-a', 'run-a', 'Revised accuracy ±0,1 °C');
  });

  it('discloses exact protected values and keeps review markings advisory for explicit acceptance', () => {
    const { view, coordinator, publish } = setup({ phase: 'review', runs });
    expect(view.getByText('Dados técnicos protegidos (1)')).toBeInTheDocument();
    const details = view.container.querySelector('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(details.querySelector('code')).toHaveTextContent('±0,1 °C');
    expect(view.getByText('0 de 1 trechos revisados')).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Salvar cópia traduzida' })).toBeEnabled();
    fireEvent.blur(view.getByRole('textbox', { name: 'Tradução 1' }));
    expect(coordinator.correct).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: 'Marcar trecho 1 como revisado' }));
    expect(coordinator.markReviewed).toHaveBeenCalledWith('unit-a', 'run-a');
    publish({ reviewedRunKeys: [firstKey] });
    expect(view.getByText('1 de 1 trechos revisados')).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Trecho 1 revisado' })).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Salvar cópia traduzida' }));
    expect(coordinator.accept).toHaveBeenCalledOnce();
  });

  it('locates an invalid correction inline, blocks acceptance and allows correction through the coordinator', () => {
    const { view, coordinator, publish } = setup({ phase: 'review', runs, reviewInvalid: true, invalidRunKeys: [firstKey],
      message: 'Mantenha os códigos e valores técnicos da origem ao revisar.' });
    const translation = view.getByRole('textbox', { name: 'Tradução 1' });
    expect(translation).toHaveAttribute('aria-invalid', 'true');
    expect(translation).toHaveAccessibleDescription(/preserve os códigos, números e unidades/);
    expect(view.getByRole('alert')).toHaveTextContent('Mantenha os códigos e valores técnicos');
    expect(view.getByRole('button', { name: 'Salvar cópia traduzida' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Marcar trecho 1 como revisado' })).toBeDisabled();
    fireEvent.change(translation, { target: { value: 'Precisión revisada ±0,1 °C' } });
    fireEvent.blur(translation);
    expect(coordinator.correct).toHaveBeenCalledWith('unit-a', 'run-a', 'Precisión revisada ±0,1 °C');
    publish({ reviewInvalid: false, invalidRunKeys: [], reviewedRunKeys: [firstKey], correctedRunKeys: [firstKey], correctionCount: 1,
      runs: [{ ...runs[0], translatedText: 'Precisión revisada ±0,1 °C' }], message: undefined });
    expect(translation).not.toHaveAttribute('aria-invalid');
    expect(view.getByText('Corrigido e revisado')).toBeInTheDocument();
    expect(view.getByText('1 correção')).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Salvar cópia traduzida' })).toBeEnabled();
  });

  it('commits visible drafts before acceptance even when a programmatic click has no preceding blur', () => {
    const { view, coordinator } = setup({ phase: 'review', runs, reviewedRunKeys: [firstKey] });
    fireEvent.change(view.getByRole('textbox', { name: 'Tradução 1' }), { target: { value: 'Precisión revisada ±0,1 °C' } });
    expect(view.getByText('Em edição')).toBeInTheDocument();
    expect(view.getByText('0 de 1 trechos revisados')).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Salvar cópia traduzida' }));
    expect(coordinator.correct).toHaveBeenCalledWith('unit-a', 'run-a', 'Precisión revisada ±0,1 °C');
    expect(coordinator.accept).toHaveBeenCalledOnce();
    expect(coordinator.correct.mock.invocationCallOrder[0]).toBeLessThan(coordinator.accept.mock.invocationCallOrder[0]);
  });

  it('does not accept a visible invalid draft and revalidates a restored generated value on blur', () => {
    const { view, coordinator, publish } = setup({ phase: 'review', runs });
    coordinator.correct.mockReturnValueOnce(false);
    const translation = view.getByRole('textbox', { name: 'Tradução 1' });
    fireEvent.change(translation, { target: { value: 'Precisión ±0,2 °C' } });
    fireEvent.click(view.getByRole('button', { name: 'Salvar cópia traduzida' }));
    expect(coordinator.correct).toHaveBeenCalledWith('unit-a', 'run-a', 'Precisión ±0,2 °C');
    expect(coordinator.accept).not.toHaveBeenCalled();
    publish({ reviewInvalid: true, invalidRunKeys: [firstKey] });
    fireEvent.change(translation, { target: { value: runs[0].translatedText } });
    fireEvent.blur(translation);
    expect(coordinator.correct).toHaveBeenLastCalledWith('unit-a', 'run-a', runs[0].translatedText);
  });

  it('starts a fresh draft for a regenerated candidate even if a cache response coalesces the generating render', () => {
    const { view, coordinator, publish } = setup({ phase: 'error', runs, message: 'Gere a tradução novamente.' });
    fireEvent.change(view.getByRole('textbox', { name: 'Tradução 1' }), { target: { value: 'Correção visível ainda não submetida' } });
    coordinator.generate.mockImplementationOnce(async () => {
      publish({ phase: 'review', runs: [{ ...runs[0], translatedText: 'Precisión generada nuevamente ±0,1 °C' }], message: undefined });
    });
    fireEvent.click(view.getByRole('button', { name: 'Gerar tradução' }));
    expect(view.getByRole('textbox', { name: 'Tradução 1' })).toHaveValue('Precisión generada nuevamente ±0,1 °C');
    expect(view.queryByText('Em edição')).toBeNull();
    expect(coordinator.correct).not.toHaveBeenCalled();
  });

  it('preserves an unsent draft when a different run receives a review update', () => {
    const other = { ...runs[0], unitId: 'unit-b', runId: 'run-b', sourceText: 'Ficha de medição', translatedText: 'Ficha de medición' };
    const { view, publish } = setup({ phase: 'review', runs: [...runs, other] });
    fireEvent.change(view.getByRole('textbox', { name: 'Tradução 1' }), { target: { value: 'Precisión en edición ±0,1 °C' } });
    publish({ runs: [runs[0], { ...other, translatedText: 'Ficha técnica de medición' }],
      reviewedRunKeys: [translationReviewKey(other.unitId, other.runId)], correctedRunKeys: [translationReviewKey(other.unitId, other.runId)], correctionCount: 1 });
    expect(view.getByRole('textbox', { name: 'Tradução 1' })).toHaveValue('Precisión en edición ±0,1 °C');
    expect(view.getByRole('textbox', { name: 'Tradução 2' })).toHaveValue('Ficha técnica de medición');
    expect(view.getByText('1 de 2 trechos revisados')).toBeInTheDocument();
  });

  it('keeps ambiguous-copy verification available while target, close, cancel and further edits remain blocked', () => {
    const { view, coordinator, close } = setup({ phase: 'error', pending: true, runs, targetLocale: 'en-US',
      message: 'Não foi possível confirmar a cópia. Tente verificar novamente; nenhuma nova cópia será preparada.' });
    expect(view.getByRole('alert')).toHaveTextContent('Tente verificar novamente');
    // F-09: com trechos na tela o idioma de destino é só informado (sem seletor).
    expect(view.queryByRole('combobox')).toBeNull();
    expect(view.container.querySelector('[data-translation-languages="compact"]')).toHaveTextContent('Inglês (Estados Unidos)');
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

  it('preserves cancellable generation while freezing its destination and naming progress accurately', () => {
    const { view, coordinator, close } = setup({ phase: 'generating', targetLocale: 'en-US' });
    expect(view.getByRole('status')).toHaveTextContent('Gerando tradução em inglês');
    expect(view.getByRole('status')).toHaveTextContent('revisar os textos');
    expect(view.getByRole('combobox')).toBeDisabled();
    expect(view.getByRole('combobox')).toHaveValue('en-US');
    fireEvent.keyDown(view.getByRole('dialog'), { key: 'Escape' });
    expect(coordinator.cancel).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('shows accepted copy locale and a single open-copy primary action after verified creation', () => {
    const copy = savedCopy();
    const { view, openCopy } = setup({ phase: 'created', targetLocale: 'en-US', copy });
    expect(view.getByRole('status')).toHaveTextContent('Cópia em inglês salva e aceita');
    expect(view.getByRole('combobox')).toBeDisabled();
    expect(view.queryByRole('button', { name: 'Salvar cópia traduzida' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Gerar tradução' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Cancelar' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Abrir cópia traduzida' }));
    expect(openCopy).toHaveBeenCalledWith(copy.catalogId);
  });

  it('contains keyboard focus before and after a pending async transition and restores the opening trigger', () => {
    const background = document.createElement('div'); background.setAttribute('data-vnext-shell', '');
    const trigger = document.createElement('button'); background.append(trigger); document.body.append(background); trigger.focus();
    const { view, publish } = setup({ phase: 'review', runs });
    expect(background.inert).toBe(true);
    const first = view.getByRole('button', { name: 'Fechar' }), last = view.getByRole('button', { name: 'Salvar cópia traduzida' });
    last.focus(); fireEvent.keyDown(view.getByRole('dialog'), { key: 'Tab' }); expect(document.activeElement).toBe(first);
    fireEvent.keyDown(view.getByRole('dialog'), { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(last);
    first.focus(); publish({ phase: 'error', pending: true });
    const verify = view.getByRole('button', { name: 'Verificar cópia' }), region = view.getByRole('region', { name: 'Textos para revisão' });
    expect(document.activeElement).toBe(region);
    verify.focus(); fireEvent.keyDown(view.getByRole('dialog'), { key: 'Tab' }); expect(document.activeElement).toBe(region);
    fireEvent.keyDown(view.getByRole('dialog'), { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(verify);
    view.unmount(); expect(background.inert).toBe(false); expect(document.activeElement).toBe(trigger); background.remove();
  });
});

describe('E-01 Gerar tradução saves first', () => {
  it('saves the catalog and only then generates, telling the person it is saving', async () => {
    let finish!: (result: ManualSaveResult) => void;
    const save = vi.fn(() => new Promise<ManualSaveResult>(resolve => { finish = resolve; }));
    const { view, coordinator } = setup({}, 'pt-BR', save);
    fireEvent.change(view.getByRole('combobox', { name: 'Idioma de destino' }), { target: { value: 'en-US' } });
    fireEvent.click(view.getByRole('button', { name: 'Gerar tradução' }));
    expect(save).toHaveBeenCalledOnce();
    expect(coordinator.generate).not.toHaveBeenCalled();
    expect(view.getByRole('status')).toHaveTextContent('Salvando o catálogo antes de traduzir…');
    const button = view.getByRole('button', { name: 'Salvando…' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(view.getByRole('combobox', { name: 'Idioma de destino' })).toBeDisabled();
    // A second click while saving does not save or translate twice.
    fireEvent.click(button);
    expect(save).toHaveBeenCalledOnce();
    await act(async () => { finish({ ok: true, acknowledged: true }); });
    expect(coordinator.generate).toHaveBeenCalledOnce();
    expect(coordinator.generate).toHaveBeenCalledWith('en-US');
    expect(view.queryByRole('alert')).toBeNull();
    expect(view.getByRole('button', { name: 'Gerar tradução' })).not.toHaveAttribute('aria-busy');
  });

  it('explains in plain words when the save did not work and does not translate', async () => {
    const save = vi.fn(async (): Promise<ManualSaveResult> => ({ ok: false, error: { code: 'OFFLINE' } as never }));
    const { view, coordinator } = setup({}, 'pt-BR', save);
    await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Gerar tradução' })); });
    expect(coordinator.generate).not.toHaveBeenCalled();
    expect(view.getByRole('alert')).toHaveTextContent(TRANSLATION_SAVE_NEEDED_MESSAGE);
    expect(TRANSLATION_SAVE_NEEDED_MESSAGE).not.toMatch(/OFFLINE|erro|error/i);
    // A thrown save is explained the same way.
    save.mockRejectedValueOnce(new Error('storage failed'));
    await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Gerar tradução' })); });
    expect(coordinator.generate).not.toHaveBeenCalled();
    expect(view.getByRole('alert')).toHaveTextContent(TRANSLATION_SAVE_NEEDED_MESSAGE);
  });

  it('does not translate after the review was closed while it was saving', async () => {
    let finish!: (result: ManualSaveResult) => void;
    const save = vi.fn(() => new Promise<ManualSaveResult>(resolve => { finish = resolve; }));
    const { view, coordinator } = setup({}, 'pt-BR', save);
    fireEvent.click(view.getByRole('button', { name: 'Gerar tradução' }));
    view.unmount();
    await act(async () => { finish({ ok: true, acknowledged: true }); });
    expect(coordinator.generate).not.toHaveBeenCalled();
  });
});

describe('E-02 closing the review with corrections asks first', () => {
  const corrected = { phase: 'review' as const, runs, correctionCount: 1, correctedRunKeys: [firstKey], reviewedRunKeys: [firstKey] };

  it('asks "Descartar as correções da tradução?" on Cancelar, Fechar and Esc, and keeps the review on "Continuar revisando"', () => {
    const { view, coordinator, close } = setup(corrected);
    const cancelButton = view.getByRole('button', { name: 'Cancelar' });
    cancelButton.focus();
    fireEvent.click(cancelButton);
    const confirm = view.getByRole('alertdialog', { name: 'Descartar as correções da tradução?' });
    expect(confirm).toHaveTextContent('O catálogo original não muda.');
    expect(coordinator.cancel).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    const keep = within(confirm).getByRole('button', { name: 'Continuar revisando' });
    expect(document.activeElement).toBe(keep);
    expect(within(confirm).getByRole('button', { name: 'Descartar correções e fechar' })).toBeInTheDocument();
    fireEvent.click(keep);
    expect(view.queryByRole('alertdialog')).toBeNull();
    expect(view.getByRole('textbox', { name: 'Tradução 1' })).toBeInTheDocument();

    fireEvent.click(view.getByRole('button', { name: 'Fechar' }));
    expect(view.getByRole('alertdialog')).toBeInTheDocument();
    // Esc while asking goes back to the review, it never discards.
    fireEvent.keyDown(view.getByRole('dialog'), { key: 'Escape' });
    expect(view.queryByRole('alertdialog')).toBeNull();
    fireEvent.keyDown(view.getByRole('textbox', { name: 'Tradução 1' }), { key: 'Escape' });
    expect(view.getByRole('alertdialog')).toBeInTheDocument();
    expect(coordinator.cancel).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('discards and closes only after "Descartar correções e fechar"', () => {
    const { view, coordinator, close } = setup(corrected);
    fireEvent.click(view.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(view.getByRole('button', { name: 'Descartar correções e fechar' }));
    expect(coordinator.cancel).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('counts a correction still being typed as work to protect', () => {
    const { view, coordinator } = setup({ phase: 'review', runs });
    fireEvent.change(view.getByRole('textbox', { name: 'Tradução 1' }), { target: { value: 'Precisión corregida ±0,1 °C' } });
    fireEvent.keyDown(view.getByRole('textbox', { name: 'Tradução 1' }), { key: 'Escape' });
    expect(view.getByRole('alertdialog', { name: 'Descartar as correções da tradução?' })).toBeInTheDocument();
    expect(coordinator.cancel).not.toHaveBeenCalled();
  });

  it('closes right away when nothing was corrected or reviewed yet', () => {
    const { view, coordinator, close } = setup({ phase: 'review', runs });
    fireEvent.click(view.getByRole('button', { name: 'Cancelar' }));
    expect(view.queryByRole('alertdialog')).toBeNull();
    expect(coordinator.cancel).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});

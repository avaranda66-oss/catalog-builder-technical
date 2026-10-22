import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogDocumentSchema } from '@/vnext';
import { TranslationReview } from '@/vnext/app/TranslationReview';
import {
  ControlledTranslationProvider, TranslationFoundationService, resolveTranslationProfile,
  type TranslationProviderRequest, type TranslationProviderResponse,
} from '@/vnext/translation';
import { TranslationReviewCoordinator, type TranslationSource } from '@/vnext/translation/review-coordinator';
import { createW5ATranslationDocument } from './w5a-fixture';
import { idSequence, StrictCasCatalogRepository } from '../persistence/w3h-fixtures';

afterEach(cleanup);

const ACCURACY = 'Exatidão: ±0,02 % FE';
const PRESSURE = 'Pressão máxima 1.500 mbar';
const RANGE = 'Faixa: -25 a 140 °C';
const ORDER = 'Código de Encomenda: 06.04.0121-00';
const FULL_SCALE = 'Exatidão: ±0,5 % do fundo de escala';
const THREAD = 'Prensa-cabo M20x1,5';
const DECIMAL = 'Faixa: 0 a 1,500 mm';

/** Realistic authored evaluation content, never approved PRESYS product specifications. */
function localeDocument() {
  const document = createW5ATranslationDocument();
  const text = document.pages[0].objects.find(object => object.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Fixture text missing');
  text.text = { paragraphs: [
    { id: 'loc-p1', inlines: [{ kind: 'text', id: 'loc-accuracy', text: ACCURACY, marks: [] }] },
    { id: 'loc-p2', inlines: [{ kind: 'text', id: 'loc-pressure', text: PRESSURE, marks: [] }] },
    { id: 'loc-p3', inlines: [{ kind: 'text', id: 'loc-range', text: RANGE, marks: [] }] },
    { id: 'loc-p4', inlines: [{ kind: 'text', id: 'loc-order', text: ORDER, marks: [] }] },
    { id: 'loc-p5', inlines: [{ kind: 'text', id: 'loc-full-scale', text: FULL_SCALE, marks: [] }] },
    { id: 'loc-p6', inlines: [{ kind: 'text', id: 'loc-thread', text: THREAD, marks: [] }] },
    { id: 'loc-p7', inlines: [{ kind: 'text', id: 'loc-decimal', text: DECIMAL, marks: [] }] },
  ] };
  return CatalogDocumentSchema.parse(document);
}

/** Protected text comes back as authored (like the real gateway); two runs imitate the father's English folders. */
function responseFor(request: TranslationProviderRequest): TranslationProviderResponse {
  const profile = resolveTranslationProfile(request.sourceLocale, request.targetLocale, request.profileVersion);
  const english = profile.targetLocale === 'en-US';
  return { contractVersion: profile.contractVersion, profileVersion: profile.profileVersion, requestId: request.requestId,
    targetLocale: profile.targetLocale, provider: { providerId: profile.providerId, modelId: profile.modelId },
    units: request.units.map(unit => ({ unitId: unit.unitId, runs: unit.runs.map(run => ({ runId: run.runId, translatedText:
      english && run.runId === 'loc-accuracy' ? run.protectedText.replace('Exatidão', 'Acuracy')
        : english && run.runId === 'loc-order' ? run.protectedText.replace('Código de Encomenda', 'Ordering Code')
          : `${english ? 'EN' : 'ES'}: ${run.protectedText}` })) })) };
}

function setup() {
  const document = localeDocument();
  const repository = new StrictCasCatalogRepository(document);
  const source: TranslationSource = { document, remoteRevision: 1, authLineage: 'user-a', authorityScopeId: 'scope-a', openSessionId: 'open-a' };
  const foundation = new TranslationFoundationService(new ControlledTranslationProvider(responseFor), { maxAttempts: 1 });
  const review = new TranslationReviewCoordinator({ foundation, repository, getSource: () => source,
    authLineage: () => 'user-a', authorityScopeId: () => 'scope-a', createId: idSequence(90000), createMutationId: idSequence(99000) });
  const mount = () => render(<TranslationReview coordinator={review} sourceLocale="pt-BR" sourceTitle="PRESYS TA-25N" onClose={vi.fn()} onOpenCopy={vi.fn()} />);
  let view = mount();
  const runFor = (sourceText: string) => {
    const run = view.getByText(sourceText).closest<HTMLElement>('.vnext-translation-run');
    if (!run) throw new Error(`Run not rendered: ${sourceText}`);
    return within(run);
  };
  const generate = async (target: 'en-US' | 'es-ES') => {
    fireEvent.change(view.getByRole('combobox', { name: 'Idioma de destino' }), { target: { value: target } });
    fireEvent.click(view.getByRole('button', { name: 'Gerar tradução' }));
    await waitFor(() => expect(view.getByRole('heading', { name: 'Revise a tradução' })).toBeInTheDocument());
  };
  /** Closes and reopens the dialog on the same coordinator (same review in progress). */
  const remount = () => { view.unmount(); view = mount(); };
  return { document, repository, review, get view() { return view; }, runFor, generate, remount };
}

describe('FR-85/FR-87 Translation Center · locale numbers, glossary and spelling suggestions', () => {
  it('suggests English number format, asks about ambiguous thousands, offers glossary and spelling fixes, and saves without TECHNICAL_TOKEN_MISMATCH', async () => {
    const f = setup();
    await f.generate('en-US');

    // Trecho 1: "Acuracy: ±0,02 % FE" → números + grafia; o glossário aponta "Accuracy" sem botão (forma usada não é conhecida).
    const accuracy = f.runFor(ACCURACY);
    expect(accuracy.getByRole('textbox')).toHaveValue('Acuracy: ±0,02 % FE');
    expect(accuracy.getByText(/Números e abreviações no formato do inglês/)).toHaveTextContent('0,02 → 0.02 · % FE → % FS');
    expect(accuracy.getByText("Glossário PRESYS: use 'Accuracy'.")).toBeInTheDocument();
    expect(accuracy.queryByRole('button', { name: "Usar 'Accuracy'" })).toBeNull();
    expect(accuracy.getByText("Grafia a corrigir: 'Acuracy' → 'Accuracy'")).toBeInTheDocument();
    fireEvent.click(accuracy.getByRole('button', { name: 'Corrigir grafia (Accuracy)' }));
    expect(accuracy.getByRole('textbox')).toHaveValue('Accuracy: ±0,02 % FE');
    expect(accuracy.queryByText(/Glossário PRESYS/)).toBeNull();
    expect(accuracy.queryByText(/Grafia a corrigir/)).toBeNull();
    fireEvent.click(accuracy.getByRole('button', { name: 'Aplicar ajuste de números (2)' }));
    expect(accuracy.getByRole('textbox')).toHaveValue('Accuracy: ±0.02 % FS');
    expect(accuracy.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
    expect(accuracy.getByText('Corrigido e revisado')).toBeInTheDocument();
    expect(accuracy.queryByRole('button', { name: /Aplicar ajuste de números/ })).toBeNull();
    expect(f.view.queryByRole('alert')).toBeNull();
    // O botão sumiu: o foco volta ao texto do mesmo trecho (usuário de teclado não cai no fundo do diálogo).
    expect(document.activeElement).toBe(accuracy.getByRole('textbox'));

    // Trecho 2: "1.500 mbar" nunca muda sozinho; a pessoa escolhe a leitura.
    const pressure = f.runFor(PRESSURE);
    expect(pressure.getByRole('textbox')).toHaveValue('EN: Pressão máxima 1.500 mbar');
    expect(pressure.queryByRole('button', { name: /Aplicar ajuste de números/ })).toBeNull();
    const question = pressure.getByText("Confirme: '1.500' é mil e quinhentos ou um vírgula cinco?");
    expect(question.id).toBeTruthy();
    for (const option of pressure.getAllByRole('button', { name: /\(1[.,]500\)$/ })) expect(option).toHaveAttribute('aria-describedby', question.id);
    fireEvent.click(pressure.getByRole('button', { name: 'mil e quinhentos (1,500)' }));
    expect(pressure.getByRole('textbox')).toHaveValue('EN: Pressão máxima 1,500 mbar');
    expect(pressure.queryByText(/Confirme:/)).toBeNull();
    expect(pressure.queryByRole('button', { name: /Aplicar ajuste de números/ })).toBeNull();
    expect(pressure.getByText('Corrigido e revisado')).toBeInTheDocument();
    expect(document.activeElement).toBe(pressure.getByRole('textbox'));

    // Trecho 3: inteiros e faixa não geram sugestão alguma.
    expect(f.runFor(RANGE).queryByRole('group', { name: /Sugestões/ })).toBeNull();

    // Trecho 4: glossário com troca determinística.
    const order = f.runFor(ORDER);
    expect(order.getByText("Glossário PRESYS: use 'Order Code' no lugar de 'Ordering Code'.")).toBeInTheDocument();
    fireEvent.click(order.getByRole('button', { name: "Usar 'Order Code'" }));
    expect(order.getByRole('textbox')).toHaveValue('Order Code: 06.04.0121-00');

    // Trecho 5: "% do fundo de escala" → "% FS" junta dois dados protegidos num só; o guardião aceita o que a tela oferece.
    const fullScale = f.runFor(FULL_SCALE);
    expect(fullScale.getByText(/Números e abreviações/)).toHaveTextContent('0,5 → 0.5 · % do fundo de escala → % FS');
    fireEvent.click(fullScale.getByRole('button', { name: 'Aplicar ajuste de números (2)' }));
    expect(fullScale.getByRole('textbox')).toHaveValue('EN: Exatidão: ±0.5 % FS');
    expect(fullScale.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
    expect(fullScale.getByText('Corrigido e revisado')).toBeInTheDocument();

    // Trecho 6: rosca métrica.
    const thread = f.runFor(THREAD);
    fireEvent.click(thread.getByRole('button', { name: 'Aplicar ajuste de números (1)' }));
    expect(thread.getByRole('textbox')).toHaveValue('EN: Prensa-cabo M20x1.5');
    expect(thread.getByRole('textbox')).not.toHaveAttribute('aria-invalid');

    // Trecho 7: decimal com três casas vira "1.500" e NÃO vira pergunta depois de aplicado.
    const decimal = f.runFor(DECIMAL);
    fireEvent.click(decimal.getByRole('button', { name: 'Aplicar ajuste de números (1)' }));
    expect(decimal.getByRole('textbox')).toHaveValue('EN: Faixa: 0 a 1.500 mm');
    expect(decimal.queryByText(/Confirme:/)).toBeNull();
    expect(decimal.queryByRole('group', { name: /Sugestões/ })).toBeNull();
    expect(f.view.queryByRole('alert')).toBeNull();

    expect(f.review.getSnapshot().reviewInvalid).toBeFalsy();
    expect(f.review.getSnapshot().correctionCount).toBe(6);
    fireEvent.click(f.view.getByRole('button', { name: 'Salvar cópia traduzida' }));
    await waitFor(() => expect(f.view.getByRole('status')).toHaveTextContent('Cópia em inglês salva e aceita'));
    const copy = f.review.getSnapshot().copy!;
    const saved = f.repository.current(copy.catalogId);
    const texts = JSON.stringify(saved.documentSnapshot);
    expect(texts).toContain('Accuracy: ±0.02 % FS');
    expect(texts).toContain('EN: Pressão máxima 1,500 mbar');
    expect(texts).toContain('Order Code: 06.04.0121-00');
    expect(texts).toContain('EN: Exatidão: ±0.5 % FS');
    expect(texts).toContain('EN: Prensa-cabo M20x1.5');
    expect(texts).toContain('EN: Faixa: 0 a 1.500 mm');
    expect(texts).toContain(RANGE);
    expect(JSON.stringify(f.repository.current(f.document.id).documentSnapshot)).toContain(ACCURACY);
  });

  it('never offers "1,500 → 1.500" when the person typed the thousands reading by hand for an ambiguous "1.500"', async () => {
    const f = setup();
    await f.generate('en-US');
    const pressure = f.runFor(PRESSURE);
    fireEvent.change(pressure.getByRole('textbox'), { target: { value: 'Maximum pressure 1,500 mbar' } });
    fireEvent.blur(pressure.getByRole('textbox'));
    expect(pressure.getByRole('textbox')).toHaveValue('Maximum pressure 1,500 mbar');
    expect(pressure.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
    expect(pressure.queryByText(/Números e abreviações/)).toBeNull();
    expect(pressure.queryByRole('button', { name: /Aplicar ajuste de números/ })).toBeNull();
    expect(pressure.queryByText(/Confirme:/)).toBeNull();
    expect(pressure.getByText('Corrigido e revisado')).toBeInTheDocument();
    expect(f.view.queryByRole('alert')).toBeNull();
    fireEvent.click(f.view.getByRole('button', { name: 'Salvar cópia traduzida' }));
    await waitFor(() => expect(f.view.getByRole('status')).toHaveTextContent('Cópia em inglês salva e aceita'));
    expect(JSON.stringify(f.repository.current(f.review.getSnapshot().copy!.catalogId).documentSnapshot)).toContain('Maximum pressure 1,500 mbar');
  });

  it('keeps the decimal reading unchanged after an explicit choice and still refuses a changed value typed by hand', async () => {
    const f = setup();
    await f.generate('en-US');
    const pressure = f.runFor(PRESSURE);
    fireEvent.click(pressure.getByRole('button', { name: 'um vírgula cinco (1.500)' }));
    expect(pressure.getByRole('textbox')).toHaveValue('EN: Pressão máxima 1.500 mbar');
    expect(pressure.queryByText(/Confirme:/)).toBeNull();
    expect(pressure.queryByRole('button', { name: /Aplicar ajuste de números/ })).toBeNull();
    expect(f.review.getSnapshot().correctionCount).toBe(0);

    const accuracy = f.runFor(ACCURACY);
    fireEvent.change(accuracy.getByRole('textbox'), { target: { value: 'Accuracy: ±0.2 % FS' } });
    fireEvent.blur(accuracy.getByRole('textbox'));
    expect(accuracy.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    expect(f.view.getByRole('alert')).toHaveTextContent('Mantenha os códigos e valores técnicos');
    expect(f.view.getByRole('button', { name: 'Salvar cópia traduzida' })).toBeDisabled();
    fireEvent.change(accuracy.getByRole('textbox'), { target: { value: 'Accuracy: ±0.02 % FS' } });
    fireEvent.blur(accuracy.getByRole('textbox'));
    expect(accuracy.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
    expect(f.view.getByRole('button', { name: 'Salvar cópia traduzida' })).toBeEnabled();
  });

  it('keeps confirmed readings in the coordinator, so closing and reopening the review does not ask again or undo them', async () => {
    const f = setup();
    await f.generate('en-US');
    fireEvent.click(f.runFor(PRESSURE).getByRole('button', { name: 'um vírgula cinco (1.500)' }));
    fireEvent.click(f.runFor(DECIMAL).getByRole('button', { name: 'Aplicar ajuste de números (1)' }));
    const key = (runId: string) => JSON.stringify([f.review.getSnapshot().runs.find(run => run.runId === runId)!.unitId, runId]);
    expect(f.review.getSnapshot().confirmedReadings[key('loc-pressure')]).toEqual(['1.500']);
    expect(f.review.getSnapshot().confirmedReadings[key('loc-decimal')]).toEqual(['1.500']);

    f.remount();
    await waitFor(() => expect(f.view.getByRole('heading', { name: 'Revise a tradução' })).toBeInTheDocument());
    const pressure = f.runFor(PRESSURE);
    expect(pressure.getByRole('textbox')).toHaveValue('EN: Pressão máxima 1.500 mbar');
    expect(pressure.queryByText(/Confirme:/)).toBeNull();
    expect(pressure.queryByRole('group', { name: /Sugestões/ })).toBeNull();
    // Escolher "um vírgula cinco" não muda o texto, então o trecho segue "Gerado" até a pessoa marcar como revisado.
    expect(pressure.getByText('Gerado')).toBeInTheDocument();
    const decimal = f.runFor(DECIMAL);
    expect(decimal.getByRole('textbox')).toHaveValue('EN: Faixa: 0 a 1.500 mm');
    expect(decimal.queryByRole('group', { name: /Sugestões/ })).toBeNull();
    expect(decimal.getByText('Corrigido e revisado')).toBeInTheDocument();
  });

  it('shows no number or spelling suggestions for Spanish, only "% FE" for the spelled-out full scale and glossary reminders', async () => {
    const f = setup();
    await f.generate('es-ES');
    expect(f.view.queryByText(/Confirme:/)).toBeNull();
    expect(f.view.queryByText(/Grafia a corrigir/)).toBeNull();
    expect(f.runFor(ACCURACY).getByRole('textbox')).toHaveValue('ES: Exatidão: ±0,02 % FE');
    expect(f.runFor(ACCURACY).queryByRole('button', { name: /Aplicar ajuste de números/ })).toBeNull();
    expect(f.runFor(ACCURACY).getByText("Glossário PRESYS: use 'Exactitud'.")).toBeInTheDocument();
    expect(f.runFor(PRESSURE).queryByRole('group', { name: /Sugestões/ })).toBeNull();
    expect(f.runFor(THREAD).queryByRole('group', { name: /Sugestões/ })).toBeNull();
    expect(f.runFor(DECIMAL).queryByRole('group', { name: /Sugestões/ })).toBeNull();
    expect(f.runFor(ORDER).getByText("Glossário PRESYS: use 'Código de Pedido'.")).toBeInTheDocument();
    expect(f.view.getAllByRole('button', { name: /Aplicar ajuste de números/ })).toHaveLength(1);
    const fullScale = f.runFor(FULL_SCALE);
    expect(fullScale.getByText(/Números e abreviações no formato do espanhol/)).toHaveTextContent('% do fundo de escala → % FE');
    fireEvent.click(fullScale.getByRole('button', { name: 'Aplicar ajuste de números (1)' }));
    expect(fullScale.getByRole('textbox')).toHaveValue('ES: Exatidão: ±0,5 % FE');
    expect(fullScale.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
    expect(f.view.queryByRole('alert')).toBeNull();
  });
});

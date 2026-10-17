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
  const view = render(<TranslationReview coordinator={review} sourceLocale="pt-BR" sourceTitle="PRESYS TA-25N" onClose={vi.fn()} onOpenCopy={vi.fn()} />);
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
  return { document, repository, review, view, runFor, generate };
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

    // Trecho 2: "1.500 mbar" nunca muda sozinho; a pessoa escolhe a leitura.
    const pressure = f.runFor(PRESSURE);
    expect(pressure.getByRole('textbox')).toHaveValue('EN: Pressão máxima 1.500 mbar');
    expect(pressure.queryByRole('button', { name: /Aplicar ajuste de números/ })).toBeNull();
    expect(pressure.getByText("Confirme: '1.500' é mil e quinhentos ou um vírgula cinco?")).toBeInTheDocument();
    fireEvent.click(pressure.getByRole('button', { name: 'mil e quinhentos (1,500)' }));
    expect(pressure.getByRole('textbox')).toHaveValue('EN: Pressão máxima 1,500 mbar');
    expect(pressure.queryByText(/Confirme:/)).toBeNull();
    expect(pressure.queryByRole('button', { name: /Aplicar ajuste de números/ })).toBeNull();
    expect(pressure.getByText('Corrigido e revisado')).toBeInTheDocument();

    // Trecho 3: inteiros e faixa não geram sugestão alguma.
    expect(f.runFor(RANGE).queryByRole('group', { name: /Sugestões/ })).toBeNull();

    // Trecho 4: glossário com troca determinística.
    const order = f.runFor(ORDER);
    expect(order.getByText("Glossário PRESYS: use 'Order Code' no lugar de 'Ordering Code'.")).toBeInTheDocument();
    fireEvent.click(order.getByRole('button', { name: "Usar 'Order Code'" }));
    expect(order.getByRole('textbox')).toHaveValue('Order Code: 06.04.0121-00');

    expect(f.review.getSnapshot().reviewInvalid).toBeFalsy();
    expect(f.review.getSnapshot().correctionCount).toBe(3);
    fireEvent.click(f.view.getByRole('button', { name: 'Salvar cópia traduzida' }));
    await waitFor(() => expect(f.view.getByRole('status')).toHaveTextContent('Cópia em inglês salva e aceita'));
    const copy = f.review.getSnapshot().copy!;
    const saved = f.repository.current(copy.catalogId);
    const texts = JSON.stringify(saved.documentSnapshot);
    expect(texts).toContain('Accuracy: ±0.02 % FS');
    expect(texts).toContain('EN: Pressão máxima 1,500 mbar');
    expect(texts).toContain('Order Code: 06.04.0121-00');
    expect(texts).toContain(RANGE);
    expect(JSON.stringify(f.repository.current(f.document.id).documentSnapshot)).toContain(ACCURACY);
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

  it('shows no number or spelling suggestions for Spanish, only glossary reminders', async () => {
    const f = setup();
    await f.generate('es-ES');
    expect(f.view.queryAllByRole('button', { name: /Aplicar ajuste de números/ })).toEqual([]);
    expect(f.view.queryByText(/Confirme:/)).toBeNull();
    expect(f.view.queryByText(/Grafia a corrigir/)).toBeNull();
    expect(f.runFor(ACCURACY).getByRole('textbox')).toHaveValue('ES: Exatidão: ±0,02 % FE');
    expect(f.runFor(ACCURACY).getByText("Glossário PRESYS: use 'Exactitud'.")).toBeInTheDocument();
    expect(f.runFor(PRESSURE).queryByRole('group', { name: /Sugestões/ })).toBeNull();
    expect(f.runFor(ORDER).getByText("Glossário PRESYS: use 'Código de Pedido'.")).toBeInTheDocument();
  });
});

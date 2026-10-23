import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_ACKNOWLEDGE_MESSAGE, PublicationReview } from '@/vnext/app/PublicationReview';
import { draftFileTitle, draftPrintHeadline, draftPrintSummary } from '@/vnext/app/publication-draft';
import { createCatalogDocument } from '@/vnext/application/document';
import { draftMarkText, plainRichText, type CatalogDocument, type Diagnostic } from '@/vnext/domain';
import type { PublicationReviewResult, PublicationSource } from '@/vnext/publication/review';

const checks = vi.hoisted(() => ({ review: vi.fn(), verify: vi.fn(), release: vi.fn() }));
vi.mock('@/vnext/publication/review', async original => ({ ...await original<object>(),
  reviewPublication: checks.review, verifyPublicationForPrint: checks.verify, releasePublicationResources: checks.release }));

/** What the page looked like at the moment the browser print window opened. */
interface PrintMoment { title: string; approval?: string; status?: string; pages: number; marks: string[]; marksPerPage: number[] }
let moments: PrintMoment[] = [];
const host = () => document.querySelector<HTMLElement>('[data-publication-host]')!;

function catalog(locale = 'pt-BR', footerCode?: string): CatalogDocument {
  let id = 0;
  const base = createCatalogDocument(() => `draft-${++id}`, 'Catálogo PCON');
  const pages = [1, 2, 3].map(number => ({ ...base.pages[0], id: `draft-page-${number}`, objects: [
    { id: `draft-text-${number}`, type: 'text' as const, frame: { xMm: 20, yMm: 20, widthMm: 150, heightMm: 10 }, zIndex: 0,
      text: plainRichText(`draft-run-${number}`, `Faixa de medição: A COMPLETAR (página ${number})`), style: {} },
  ] }));
  return { ...base, locale, pages,
    style: footerCode ? { ...base.style, pageFooter: { documentCode: footerCode, revision: '03', showOnFirstPage: true } } : base.style };
}

const placeholder = (document: CatalogDocument, page: number, token = 'A COMPLETAR'): Diagnostic => ({ code: 'UNRESOLVED_PLACEHOLDER', severity: 'ERROR',
  details: `surface=text; token=${token}`, pageId: document.pages[page].id, objectId: `draft-text-${page + 1}` });

/** The engine's review, reduced to its outcome: the pages are drawn in the preview, as in the real dialog. */
function reviewAs(status: 'READY' | 'BLOCKED', diagnostics: (document: CatalogDocument) => Diagnostic[]) {
  checks.review.mockImplementation(async (source: PublicationSource, _root: HTMLElement, draw: (value: PublicationReviewResult) => void) => {
    const result: PublicationReviewResult = { status, document: source.document, plans: new Map(), urls: new Map(),
      diagnostics: diagnostics(source.document), ...(status === 'READY' ? { snapshot: { facts: [], geometryDiagnostics: [] } } : {}) };
    draw({ ...result });
    return result;
  });
}

function setup(document = catalog()) {
  const source: PublicationSource = { document, openSessionId: 'open-a', remoteRevision: 1, authLineage: 'a', authorityScopeId: 'a', assetUrls: new Map() };
  const close = vi.fn(), locate = vi.fn();
  const view = render(<PublicationReview getSource={() => source} subscribe={() => () => {}} onClose={close} onLocateDiagnostic={locate} />);
  return { view, close, locate, source };
}

async function openConfirmation(view: ReturnType<typeof render>) {
  fireEvent.click(await view.findByRole('button', { name: 'Imprimir rascunho mesmo assim' }));
  return view.getByRole('region', { name: 'Imprimir um rascunho incompleto?' });
}

beforeEach(() => {
  vi.resetAllMocks();
  moments = [];
  checks.verify.mockResolvedValue(undefined);
  vi.spyOn(window, 'print').mockImplementation(() => {
    const pages = [...document.querySelectorAll('.vnext-publication-pages .editorial-page')];
    moments.push({ title: document.title, approval: host().dataset.printApproved, status: host().dataset.publicationStatus, pages: pages.length,
      marks: [...document.querySelectorAll('[data-draft-watermark]')].map(mark => mark.textContent ?? ''),
      marksPerPage: pages.map(page => page.querySelectorAll(':scope > [data-draft-watermark]').length) });
  });
  document.title = 'Editor de catálogos';
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Imprimir rascunho mesmo assim', () => {
  it('appears only when the review is blocked, under the list; the normal print stays locked', async () => {
    reviewAs('READY', () => []);
    const ready = setup();
    await waitFor(() => expect(ready.view.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeEnabled());
    expect(ready.view.queryByRole('button', { name: 'Imprimir rascunho mesmo assim' })).toBeNull();
    cleanup();

    reviewAs('BLOCKED', document => [placeholder(document, 0)]);
    const { view } = setup();
    const draft = await view.findByRole('button', { name: 'Imprimir rascunho mesmo assim' });
    expect(view.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeDisabled();
    const list = document.querySelector('.vnext-publication-diagnostics')!;
    expect(list.compareDocumentPosition(draft) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host()).toHaveAttribute('data-publication-status', 'BLOCKED');
  });

  it('is not offered while the check runs or when there are no pages to print', async () => {
    let finish = (_value: PublicationReviewResult) => {};
    checks.review.mockImplementation(() => new Promise<PublicationReviewResult>(resolve => { finish = resolve; }));
    const { view, source } = setup();
    await waitFor(() => expect(checks.review).toHaveBeenCalledOnce());
    expect(view.queryByRole('button', { name: 'Imprimir rascunho mesmo assim' })).toBeNull();
    // A catalog that could not even be read has no preview: nothing to print, so no draft.
    await act(async () => { finish({ status: 'BLOCKED', document: source.document, plans: new Map(), urls: new Map(),
      diagnostics: [{ code: 'PUBLICATION_CHECK_FAILED', severity: 'ERROR', details: 'x' }] }); });
    expect(host()).toHaveAttribute('data-publication-status', 'BLOCKED');
    expect(view.queryByRole('button', { name: 'Imprimir rascunho mesmo assim' })).toBeNull();
  });

  it('confirms with the count, a grouped summary, the required box and the watermark option on by default', async () => {
    reviewAs('BLOCKED', document => [
      ...Array.from({ length: 15 }, (_, index) => placeholder(document, index % 3)),
      placeholder(document, 1, 'a confirmar'), placeholder(document, 2, 'A CONFIRMAR'),
      { code: 'PAGE_FOOTER_INCOMPLETE', severity: 'ERROR', details: 'missing=revision' },
      { code: 'EMPTY_TABLE_ROW', severity: 'WARNING', details: 'emptyRows=2', pageId: document.pages[0].id },
    ]);
    const { view } = setup();
    const confirmation = await openConfirmation(view);
    expect(document.activeElement).toHaveTextContent('Imprimir um rascunho incompleto?');
    expect(confirmation).toHaveTextContent('Este PDF ainda tem 18 itens a corrigir:');
    const lines = [...confirmation.querySelectorAll('[data-publication-draft-summary] li')].map(item => item.textContent);
    expect(lines).toEqual(['15 textos ainda com “A COMPLETAR”', '2 textos ainda com “A CONFIRMAR”', 'Rodapé das páginas incompleto']);
    expect(confirmation.querySelector('[data-publication-draft-technical]')).toBeNull();
    const acknowledge = view.getByRole('checkbox', { name: 'Entendi: este PDF tem informações incompletas e não é o catálogo final' });
    expect(acknowledge).not.toBeChecked();
    expect(view.getByRole('checkbox', { name: 'Marcar todas as páginas como RASCUNHO' })).toBeChecked();
    expect(view.getByRole('button', { name: 'Imprimir rascunho' })).toBeEnabled();
    expect(view.getByRole('button', { name: 'Voltar' })).toBeEnabled();
  });

  it('does not print until "Entendi" is checked, and explains it inline', async () => {
    reviewAs('BLOCKED', document => [placeholder(document, 0)]);
    const { view } = setup();
    await openConfirmation(view);
    fireEvent.click(view.getByRole('button', { name: 'Imprimir rascunho' }));
    expect(window.print).not.toHaveBeenCalled();
    expect(view.getByRole('alert')).toHaveTextContent(DRAFT_ACKNOWLEDGE_MESSAGE);
    const acknowledge = view.getByRole('checkbox', { name: /Entendi/ });
    expect(acknowledge).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(acknowledge);
    expect(host()).not.toHaveAttribute('data-print-approved');
    fireEvent.click(acknowledge);
    expect(view.queryByRole('alert')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Imprimir rascunho' }));
    expect(window.print).toHaveBeenCalledOnce();
  });

  it('prints the same preview pages with one watermark inside every page, then removes it', async () => {
    reviewAs('BLOCKED', document => [placeholder(document, 0), placeholder(document, 2)]);
    const { view } = setup();
    await openConfirmation(view);
    fireEvent.click(view.getByRole('checkbox', { name: /Entendi/ }));
    expect(document.querySelectorAll('[data-draft-watermark]')).toHaveLength(0);
    fireEvent.click(view.getByRole('button', { name: 'Imprimir rascunho' }));
    expect(moments).toEqual([{ title: 'Catálogo PCON — RASCUNHO', approval: 'draft', status: 'BLOCKED', pages: 3,
      marks: ['RASCUNHO', 'RASCUNHO', 'RASCUNHO'], marksPerPage: [1, 1, 1] }]);
    const mark = document.querySelector('[data-draft-watermark]')!;
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark.closest('.editorial-page')).not.toBeNull();
    // The print guard keeps the confirmed draft approval.
    fireEvent(window, new Event('beforeprint'));
    expect(host()).toHaveAttribute('data-print-approved', 'draft');
    fireEvent(window, new Event('afterprint'));
    expect(document.querySelectorAll('[data-draft-watermark]')).toHaveLength(0);
    expect(host()).not.toHaveAttribute('data-print-approved');
    expect(document.title).toBe('Editor de catálogos');
  });

  it('prints without watermark when "Marcar todas as páginas como RASCUNHO" is turned off', async () => {
    reviewAs('BLOCKED', document => [placeholder(document, 0)]);
    const { view } = setup();
    await openConfirmation(view);
    fireEvent.click(view.getByRole('checkbox', { name: /Entendi/ }));
    fireEvent.click(view.getByRole('checkbox', { name: 'Marcar todas as páginas como RASCUNHO' }));
    fireEvent.click(view.getByRole('button', { name: 'Imprimir rascunho' }));
    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({ approval: 'draft', pages: 3, marks: [], title: 'Catálogo PCON — RASCUNHO' });
  });

  it('the normal print never has a watermark nor the draft title', async () => {
    reviewAs('READY', () => []);
    const { view } = setup();
    const print = view.getByRole('button', { name: 'Imprimir / salvar PDF' });
    await waitFor(() => expect(print).toBeEnabled());
    fireEvent.click(print);
    await waitFor(() => expect(window.print).toHaveBeenCalledOnce());
    expect(moments[0]).toMatchObject({ title: 'Catálogo PCON', approval: 'true', status: 'READY', pages: 3, marks: [], marksPerPage: [0, 0, 0] });
  });

  it('names the file after the footer code with " — RASCUNHO" in the catalog language', async () => {
    reviewAs('BLOCKED', document => [placeholder(document, 0)]);
    const { view } = setup(catalog('es-ES', 'MAN-PCON-XV'));
    await openConfirmation(view);
    expect(view.getByRole('checkbox', { name: 'Marcar todas as páginas como RASCUNHO (no idioma do catálogo: “BORRADOR”)' })).toBeChecked();
    fireEvent.click(view.getByRole('checkbox', { name: /Entendi/ }));
    fireEvent.click(view.getByRole('button', { name: 'Imprimir rascunho' }));
    expect(moments[0]).toMatchObject({ title: 'MAN-PCON-XV-03_ES — BORRADOR', marks: ['BORRADOR', 'BORRADOR', 'BORRADOR'] });
  });

  it('records nothing as published: no final check, no request, no storage, no edit, and the review stays blocked', async () => {
    reviewAs('BLOCKED', document => [placeholder(document, 0)]);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const { view, close, locate, source } = setup();
    const before = JSON.stringify(source.document);
    await openConfirmation(view);
    fireEvent.click(view.getByRole('checkbox', { name: /Entendi/ }));
    fireEvent.click(view.getByRole('button', { name: 'Imprimir rascunho' }));
    fireEvent(window, new Event('afterprint'));
    expect(window.print).toHaveBeenCalledOnce();
    expect(checks.verify).not.toHaveBeenCalled();
    expect(checks.review).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(local).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled(); expect(locate).not.toHaveBeenCalled();
    expect(JSON.stringify(source.document)).toBe(before);
    expect(source.document.pages.every(page => JSON.stringify(page).includes('RASCUNHO') === false)).toBe(true);
    expect(host()).toHaveAttribute('data-publication-status', 'BLOCKED');
    expect(view.getByRole('status')).toHaveTextContent('Publicação bloqueada');
    expect(view.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeDisabled();
    vi.unstubAllGlobals();
  });

  it('a draft approval is honoured only for the confirmed draft print', async () => {
    reviewAs('BLOCKED', document => [placeholder(document, 0)]);
    setup();
    await waitFor(() => expect(host()).toHaveAttribute('data-publication-status', 'BLOCKED'));
    host().dataset.printApproved = 'draft';
    fireEvent(window, new Event('beforeprint'));
    expect(host()).not.toHaveAttribute('data-print-approved');
    host().dataset.printApproved = 'true';
    fireEvent(window, new Event('beforeprint'));
    expect(host()).not.toHaveAttribute('data-print-approved');
  });

  it('highlights problems that can break the PDF, and still lets the draft print', async () => {
    reviewAs('BLOCKED', document => [placeholder(document, 0),
      { code: 'REQUIRED_FONT_MISSING', severity: 'ERROR', details: 'Noto Sans' },
      { code: 'IMAGE_DECODE_FAILED', severity: 'ERROR', details: 'a', pageId: document.pages[1].id },
      { code: 'ASSET_UNAVAILABLE', severity: 'ERROR', details: 'b', pageId: document.pages[2].id }]);
    const { view } = setup();
    const confirmation = await openConfirmation(view);
    expect(confirmation).toHaveTextContent('Este PDF ainda tem 4 itens a corrigir:');
    const technical = confirmation.querySelector('[data-publication-draft-technical]')!;
    expect(technical).toHaveAttribute('role', 'note');
    expect(technical).toHaveTextContent('Atenção: o PDF pode sair com defeito');
    expect([...technical.querySelectorAll('li')].map(item => item.textContent)).toEqual([
      'Uma fonte do catálogo não carregou: os textos podem sair com outra letra.',
      '2 imagens não carregaram: elas podem sair em branco no PDF.']);
    expect([...confirmation.querySelectorAll('[data-publication-draft-summary] li')].map(item => item.textContent)).toEqual(['1 texto ainda com “A COMPLETAR”']);
    fireEvent.click(view.getByRole('checkbox', { name: /Entendi/ }));
    fireEvent.click(view.getByRole('button', { name: 'Imprimir rascunho' }));
    expect(moments[0]).toMatchObject({ approval: 'draft', marks: ['RASCUNHO', 'RASCUNHO', 'RASCUNHO'] });
  });

  it('"Voltar" and Escape close only the confirmation and return to the offer', async () => {
    reviewAs('BLOCKED', document => [placeholder(document, 0)]);
    const { view, close } = setup();
    await openConfirmation(view);
    fireEvent.click(view.getByRole('button', { name: 'Voltar' }));
    expect(view.queryByRole('region', { name: 'Imprimir um rascunho incompleto?' })).toBeNull();
    const offer = view.getByRole('button', { name: 'Imprimir rascunho mesmo assim' });
    await waitFor(() => expect(document.activeElement).toBe(offer));
    await openConfirmation(view);
    fireEvent.keyDown(view.getByRole('checkbox', { name: /Entendi/ }), { key: 'Escape' });
    expect(view.queryByRole('region', { name: 'Imprimir um rascunho incompleto?' })).toBeNull();
    expect(close).not.toHaveBeenCalled();
    expect(window.print).not.toHaveBeenCalled();
  });
});

describe('draft wording', () => {
  it('prints the draft word in the catalog language', () => {
    expect(['pt-BR', 'en-US', 'es-ES', 'fr-FR', 'it-IT', 'de-DE', 'pl-PL', 'nl-NL'].map(draftMarkText))
      .toEqual(['RASCUNHO', 'DRAFT', 'BORRADOR', 'BROUILLON', 'BOZZA', 'ENTWURF', 'WERSJA ROBOCZA', 'DRAFT']);
    expect(draftFileTitle('MAN-PCON-XV-03_PL', 'pl-PL')).toBe('MAN-PCON-XV-03_PL — WERSJA ROBOCZA');
  });

  it.each([['en-US', 'DRAFT'], ['fr-FR', 'BROUILLON'], ['it-IT', 'BOZZA'], ['de-DE', 'ENTWURF'], ['pl-PL', 'WERSJA ROBOCZA']])(
    'the %s watermark and file name use "%s"', async (locale, word) => {
      reviewAs('BLOCKED', document => [placeholder(document, 0)]);
      const { view } = setup(catalog(locale));
      await openConfirmation(view);
      fireEvent.click(view.getByRole('checkbox', { name: /Entendi/ }));
      fireEvent.click(view.getByRole('button', { name: 'Imprimir rascunho' }));
      expect(moments[0]).toMatchObject({ title: `Catálogo PCON — ${word}`, marks: [word, word, word], marksPerPage: [1, 1, 1] });
    });

  it('counts only the items that need correction', () => {
    const summary = draftPrintSummary([
      { code: 'UNRESOLVED_PLACEHOLDER', severity: 'ERROR', details: 'surface=cell; token=xxx' },
      { code: 'TEXT_OBJECT_OVERFLOW', severity: 'ERROR', details: '' },
      { code: 'TEXT_OBJECT_OVERFLOW', severity: 'ERROR', details: '' },
      { code: 'SAFE_AREA_VIOLATION', severity: 'WARNING', details: '' },
      { code: 'LAYOUT_UNSTABLE', severity: 'ERROR', details: '' },
    ]);
    expect(summary.total).toBe(4);
    expect(summary.groups.map(group => group.text)).toEqual(['1 texto ainda com “XXX”', '2 textos que não cabem no quadro']);
    expect(summary.technical.map(group => group.text)).toEqual(['As medidas das páginas não puderam ser confirmadas: textos e tabelas podem sair fora do lugar.']);
    expect(draftPrintHeadline(1)).toBe('Este PDF ainda tem 1 item a corrigir:');
  });

  it('the print rules show a blocked catalog only for a confirmed draft, and the boxes are at least 24 px', () => {
    const css = readFileSync(resolve(__dirname, '../../../src/vnext/app/styles.css'), 'utf8');
    expect(css).toContain('body[data-vnext-print-policy] > [data-publication-status="BLOCKED"][data-print-approved="draft"]');
    expect(css).not.toContain('[data-publication-status="BLOCKED"][data-print-approved="true"]');
    expect(css).toMatch(/\.vnext-publication-draft-check > input \{[^}]*width: 24px; height: 24px;/);
  });
});

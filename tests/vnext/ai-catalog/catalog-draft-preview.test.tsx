import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '@/vnext/application';
import { CatalogNativeComposer } from '@/vnext/ai-catalog/CatalogNativeComposer';
import type { NativeComposeFunctionsClient } from '@/vnext/ai-catalog/native-compose-client';
import type { DraftClient } from '@/vnext/ai-catalog/draft-client';
import { clearByokCredential } from '@/vnext/ai-catalog/byok-session';
import { forgetSourceIntakeSessions } from '@/vnext/ai-catalog/intake/intake-store';
import { serverSpecTableGateway } from '@/vnext/ai-catalog/spec-table/spec-table-gateway';
import { CATALOG_DRAFT_ACTION, UNDO_WINDOW_MS } from '@/vnext/ai-catalog/useCatalogDraft';
import { TO_FILL } from '@/vnext/library/presys-archetypes';
import { createPresysPageTemplateRegistry } from '@/vnext/library/presys-ta25n-starter';
import type { CatalogDraftPlan } from '@/vnext/ai-catalog/contracts';
import { FOLDER_FILE, controlledAnswers, folderPdfBytes } from '../proof/father-journeys/fixtures/spec-table-facts.mjs';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { cleanup(); forgetSourceIntakeSessions(); localStorage.clear(); clearByokCredential(); vi.restoreAllMocks(); vi.useRealTimers(); });
afterAll(() => vi.unstubAllGlobals());

const USER = '0f8fad5b-d9cb-469f-a165-70867728950e';
const composerClient = { functions: { invoke: vi.fn(async () => ({ data: { code: 'OK', status: { enabled: true,
  mode: 'bounded-acceptance', serverKey: true, byok: false, remainingMicrousd: null, callReserveMicrousd: 7800 } }, error: null })) } } as unknown as NativeComposeFunctionsClient;

/** What a model could answer for the synthetic folder (page 9 prints "200 W" and "10.5 kg"). */
const PLAN: CatalogDraftPlan = {
  title: 'Série TA',
  pages: [
    { kind: 'capa', purpose: 'Capa da família TA.', sourcePages: [{ file: 'arquivo-1', page: 1 }], tables: [],
      texts: [{ slot: 'P1.family', text: 'Calibradores de temperatura' }, { slot: 'P1.model', text: 'TA-25N / TA-35N' },
        { slot: 'P1.tagline', text: 'Garantia de 5 anos' }] },
    { kind: 'visao_geral', purpose: 'O que o produto faz.', sourcePages: [{ file: 'arquivo-1', page: 9 }], tables: [],
      texts: [{ slot: 'P2.intro', text: 'Potência de [[VNEXT_TECH_0]] no modelo TA-25N e peso de [[VNEXT_TECH_1]].' },
        { slot: 'P2.highlights', text: 'Exatidão de [[VNEXT_TECH_2]]\nTela sensível ao toque' }] },
    { kind: 'especificacoes', purpose: 'Tabela dos modelos.', sourcePages: [{ file: 'arquivo-1', page: 9 }], texts: [], tables: [] },
    { kind: 'insertos', purpose: 'Insertos.', sourcePages: [], texts: [{ slot: 'P8.title', text: 'Insertos' }], tables: [] },
    { kind: 'contracapa', purpose: 'Contracapa.', sourcePages: [], texts: [], tables: [] },
  ],
  literals: [
    { id: 0, text: '200 W', file: 'arquivo-1', page: 9, fact: '' },
    { id: 1, text: '10.5 kg', file: 'arquivo-1', page: 9, fact: '' },
    { id: 2, text: '± 0.005 °C', file: 'arquivo-1', page: 9, fact: '' },
  ],
  questions: ['Qual modelo destacar na capa?'],
};

function draftClient(planning = true) {
  const answers = controlledAnswers().answers;
  const uploads: string[] = [];
  const invoke = vi.fn(async (_name: string, { body }: { body: { task: string; source?: { path: string; fileName: string } } }) => {
    if (body.task === 'status') {
      return { data: { code: 'OK', status: { serverKey: true, budget: 'ok', ...(planning ? { tasks: ['extract_facts', 'plan_draft'] } : {}) } }, error: null };
    }
    if (body.task === 'plan_draft') {
      return { data: { code: 'OK', plan: { plan: PLAN, trimmed: 0, model: 'controlado', modelVersion: null, promptVersion: 'p',
        usage: { inputTokens: 1, outputTokens: 1, estimatedUsd: 0.04 }, ms: 1 } }, error: null };
    }
    return { data: { code: 'OK', extraction: { promptVersion: 'p', model: 'controlado', sheet: answers[body.source!.fileName],
      trimmed: 0, usage: { inputTokens: 1, outputTokens: 1, estimatedUsd: 0 }, ms: 1 } }, error: null };
  });
  const upload = vi.fn(async (path: string) => { uploads.push(path); return { data: { path }, error: null }; });
  return { client: { functions: { invoke }, storage: { from: () => ({ upload }) } } as unknown as DraftClient, invoke };
}

function make(planning = true) {
  // Conversations are kept by catalog id, which is a UUID in the app.
  const createId = () => crypto.randomUUID();
  const doc = createCatalogDocument(createId, 'TA');
  const session = createDocumentSession(doc, { createId, templateRegistry: createPresysPageTemplateRegistry() });
  const draft = draftClient(planning);
  const onShowPage = vi.fn();
  render(<CatalogNativeComposer documentId={doc.id} session={session} ownerScope="user:01" client={composerClient}
    onBeforeMutation={() => true} activePageId={doc.pages[0].id} onShowPage={onShowPage}
    factExtraction={serverSpecTableGateway(draft.client, USER)} />);
  return { doc, session, draft, onShowPage };
}
const tasks = (invoke: ReturnType<typeof draftClient>['invoke']) => invoke.mock.calls.map(([, options]) => (options as { body: { task: string } }).body.task);
const pageTexts = (session: ReturnType<typeof createDocumentSession>) => session.getSnapshot().document.pages.map(page =>
  page.objects.flatMap(object => object.type === 'text'
    ? [object.text.paragraphs.map(paragraph => paragraph.inlines.map(inline => inline.kind === 'text' ? inline.text : '').join('')).join('\n')] : []));

async function openPreview() {
  const made = make();
  fireEvent.change(screen.getByLabelText('Escolher arquivos'), { target: { files: [new File([folderPdfBytes().slice().buffer as ArrayBuffer], FOLDER_FILE, { type: 'application/pdf' })] } });
  fireEvent.click(await screen.findByRole('button', { name: CATALOG_DRAFT_ACTION }, { timeout: 20000 }));
  const setup = await screen.findByRole('group', { name: 'Montar catálogo a partir dos arquivos' }, { timeout: 20000 });
  expect(within(setup).getByText(/As especificações parecem estar na página 9/)).toBeInTheDocument();
  expect(within(setup).getByText(/Nada muda no catálogo antes de você clicar em “Aplicar”/)).toBeInTheDocument();
  fireEvent.click(within(setup).getByRole('button', { name: 'Montar o catálogo' }));
  const preview = await screen.findByRole('group', { name: 'Prévia do catálogo' }, { timeout: 20000 });
  return { ...made, preview };
}

describe('"Montar catálogo a partir destes arquivos" in the chat (FR-70)', () => {
  it('says plainly when the deployed function cannot plan yet, before sending or paying anything', async () => {
    const { doc, session, draft } = make(false);
    fireEvent.change(screen.getByLabelText('Escolher arquivos'), { target: { files: [new File([folderPdfBytes().slice().buffer as ArrayBuffer], FOLDER_FILE, { type: 'application/pdf' })] } });
    fireEvent.click(await screen.findByRole('button', { name: CATALOG_DRAFT_ACTION }, { timeout: 20000 }));
    expect(await screen.findByText(/A montagem do catálogo inteiro pela IA ainda não chegou ao servidor/)).toBeInTheDocument();
    expect(tasks(draft.invoke)).toEqual(['status']);
    expect(session.getSnapshot().document).toEqual(doc);
  }, 40000);

  it('a typed "monte o catálogo a partir destes arquivos" opens the same flow as the button (FR-73, one assistant)', async () => {
    const { doc, session, draft } = make();
    fireEvent.change(screen.getByLabelText('Escolher arquivos'), { target: { files: [new File([folderPdfBytes().slice().buffer as ArrayBuffer], FOLDER_FILE, { type: 'application/pdf' })] } });
    await screen.findByRole('button', { name: CATALOG_DRAFT_ACTION }, { timeout: 20000 });
    fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), { target: { value: 'Monte o catálogo a partir destes arquivos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao Gemini' }));
    await screen.findByRole('group', { name: 'Montar catálogo a partir dos arquivos' }, { timeout: 20000 });
    expect(tasks(draft.invoke)).toEqual(['status']);
    const composerTasks = (composerClient.functions.invoke as ReturnType<typeof vi.fn>).mock.calls
      .map(([, options]) => (options as { body: { task: string } }).body.task);
    expect(composerTasks.filter(task => task !== 'status')).toEqual([]);
    expect(session.getSnapshot().document).toEqual(doc);
  }, 40000);

  it('reads the spec pages, plans, and shows every page with where each value came from — nothing changes yet', async () => {
    const { doc, session, draft, preview } = await openPreview();
    expect(tasks(draft.invoke)).toEqual(['status', 'extract_facts', 'plan_draft']);
    const planBody = draft.invoke.mock.calls.map(([, options]) => (options as { body: Record<string, unknown> }).body).find(body => body.task === 'plan_draft')!;
    // Only the page texts and the checked facts go; no credential, no file.
    expect(JSON.stringify(planBody)).not.toMatch(/key|credential|byok|path/i);
    expect(JSON.stringify(planBody)).toContain('Electric Power');
    expect(session.getSnapshot().document).toEqual(doc);

    expect(within(preview).getByText(/^5 páginas\. 2 valores conferidos no PDF\. 1 valor não foi achado e fica “A COMPLETAR”\. 1 campo não entrou/)).toBeInTheDocument();
    const pages = within(preview).getAllByRole('listitem').filter(item => item.hasAttribute('data-plan-page'));
    expect(pages.map(item => within(item).getByRole('heading').textContent)).toEqual([
      '1. Capa', '2. Visão geral e destaques', '3. Especificações técnicas', '4. Insertos e opções', '5. Contracapa']);
    expect(within(preview).getByRole('img', { name: 'Miniatura da página 1: Capa' })).toBeInTheDocument();
    expect(within(preview).getByRole('img', { name: 'Miniatura da página 3: Especificações técnicas' })).toBeInTheDocument();
    const overview = pages[1];
    expect(overview).toHaveTextContent('Potência de 200 W no modelo TA-25N e peso de 10.5 kg.');
    expect(overview).toHaveTextContent('200 W — presys-ta-folder.pdf · página 9');
    expect(overview).toHaveTextContent('± 0.005 °C — não achado em presys-ta-folder.pdf · página 9: fica “A COMPLETAR”');
    // A digit without a source: the field does not go in.
    expect(pages[0]).toHaveTextContent('Frase de destaque');
    expect(pages[0]).toHaveTextContent('Não entrou');
    expect(pages[0]).toHaveTextContent('A IA escreveu um número sem dizer de onde ele veio.');
    expect(pages[0]).toHaveTextContent('Fotos para escolher na página: Logotipo da PRESYS, Foto principal do produto');
    // The specification table's pending facts are shown before applying.
    expect(screen.getByRole('group', { name: 'Pendências da tabela de especificações' })).toBeInTheDocument();
  }, 40000);

  it('leaves a page out and moves another, then applies everything as ONE Desfazer', async () => {
    const { doc, session, draft, preview, onShowPage } = await openPreview();
    fireEvent.click(within(preview).getByRole('button', { name: 'Tirar Insertos e opções do catálogo' }));
    expect(within(preview).getByText('Fora do catálogo')).toBeInTheDocument();
    fireEvent.click(within(preview).getByRole('button', { name: 'Descer Visão geral e destaques' }));
    const order = () => within(preview).getAllByRole('listitem').filter(item => item.getAttribute('data-plan-kept') === 'sim')
      .map(item => within(item).getByRole('heading').textContent);
    expect(order()).toEqual(['1. Capa', '2. Especificações técnicas', '3. Visão geral e destaques', '4. Contracapa']);

    fireEvent.click(within(preview).getByRole('button', { name: 'Aplicar' }));
    const applied = await screen.findByRole('group', { name: 'Catálogo montado' });
    expect(within(applied).getByRole('status')).toHaveTextContent('Catálogo montado: 4 páginas nas páginas 1 a 4.');
    const texts = pageTexts(session);
    expect(session.getSnapshot().document.pages).toHaveLength(4);
    expect(texts[0]).toEqual(expect.arrayContaining(['Calibradores de temperatura', 'TA-25N / TA-35N']));
    expect(texts[2]).toContain(`Potência de 200 W no modelo TA-25N e peso de 10.5 kg.`);
    expect(texts[2]).toContain(`▸ Exatidão de ${TO_FILL}\n▸ Tela sensível ao toque`);
    expect(texts.flat().join(' ')).not.toContain('Garantia de');
    expect(onShowPage).toHaveBeenCalledWith(session.getSnapshot().document.pages[0].id);
    expect(tasks(draft.invoke).filter(task => task === 'plan_draft')).toHaveLength(1);

    // The conversation keeps its own Desfazer too, while the catalog is unchanged.
    expect(within(screen.getByRole('log')).getByRole('button', { name: 'Desfazer' })).toBeInTheDocument();
    fireEvent.click(within(applied).getByRole('button', { name: /^Desfazer \(\d+ s\)$/ }));
    expect(session.getSnapshot().document).toEqual(doc);
    expect(within(screen.getByRole('group', { name: 'Catálogo montado' })).getByRole('status')).toHaveTextContent('O catálogo voltou ao que era antes.');
  }, 40000);

  it('"Ajustar" sends the answers back without reading the PDF again; "Desfazer" leaves the card after 30 s', async () => {
    const { draft, preview } = await openPreview();
    fireEvent.change(within(preview).getByRole('textbox', { name: 'Qual modelo destacar na capa?' }), { target: { value: 'TA-50N' } });
    fireEvent.click(within(preview).getByRole('button', { name: 'Ajustar' }));
    await screen.findByRole('group', { name: 'Prévia do catálogo' }, { timeout: 20000 });
    await vi.waitFor(() => expect(tasks(draft.invoke)).toEqual(['status', 'extract_facts', 'plan_draft', 'plan_draft']));
    const second = draft.invoke.mock.calls.map(([, options]) => (options as { body: { task: string; brief?: { instructions: string } } }).body)
      .filter(body => body.task === 'plan_draft')[1];
    expect(second.brief?.instructions).toBe('Qual modelo destacar na capa? Resposta: TA-50N');

    const again = await screen.findByRole('group', { name: 'Prévia do catálogo' });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    fireEvent.click(within(again).getByRole('button', { name: 'Aplicar' }));
    const applied = screen.getByRole('group', { name: 'Catálogo montado' });
    expect(within(applied).getByRole('button', { name: /^Desfazer/ })).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(UNDO_WINDOW_MS + 1_500); });
    expect(within(applied).queryByRole('button', { name: /^Desfazer/ })).toBeNull();
  }, 40000);
});

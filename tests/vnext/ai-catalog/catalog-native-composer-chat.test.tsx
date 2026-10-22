import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '../../../src/vnext/application';
import { CatalogNativeComposer } from '../../../src/vnext/ai-catalog/CatalogNativeComposer';
import type { NativeComposeFunctionsClient } from '../../../src/vnext/ai-catalog/native-compose-client';
import type { NativeComposePlan } from '../../../src/vnext/ai-catalog/native-compose';
import { clearByokCredential } from '../../../src/vnext/ai-catalog/byok-session';
import { forgetSourceIntakeSessions } from '../../../src/vnext/ai-catalog/intake/intake-store';
import { createInsertSpec } from '../../../src/vnext/app/editor-defaults';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => {
  cleanup(); forgetSourceIntakeSessions(); localStorage.clear(); clearByokCredential(); vi.restoreAllMocks();
  document.head.querySelectorAll('style[data-test-css]').forEach((style) => style.remove());
});
afterAll(() => vi.unstubAllGlobals());

const id = () => crypto.randomUUID();
const plan: NativeComposePlan = {
  version: 1, status: 'proposal', summary: 'Capa e ficha técnica.',
  pages: [
    { type: 'cover', heading: 'Catálogo TA-25N', subtitle: 'Calibradores' },
    { type: 'comparison', heading: 'Ficha técnica', table: { columns: ['Característica', 'TA-25N'], rowLabels: ['Faixa'], design: 'datasheet' } },
  ],
};
const statusOk = { data: { code: 'OK', status: { enabled: true, mode: 'bounded-acceptance', serverKey: true, byok: false,
  remainingMicrousd: null, callReserveMicrousd: 7800 } }, error: null };
type Body = { task: string };
function make(generate: () => Promise<unknown> = async () => ({ data: { reply: plan }, error: null }), props: Record<string, unknown> = {}) {
  const doc = createCatalogDocument(id, 'Catálogo TA-25N');
  const session = createDocumentSession(doc, { createId: id });
  const invoke = vi.fn(async (_name: string, options: { body: Body }) => options.body.task === 'status' ? statusOk : generate());
  const client = { functions: { invoke } } as unknown as NativeComposeFunctionsClient;
  const element = (extra: Record<string, unknown> = {}) => <CatalogNativeComposer documentId={doc.id} session={session}
    ownerScope="user:01" client={client} onBeforeMutation={() => true} {...props} {...extra} />;
  const ui = render(element());
  const generationCalls = () => invoke.mock.calls.filter(([, options]) => options.body.task !== 'status');
  return { doc, session, invoke, ui, element, generationCalls };
}
const box = () => screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' });
const log = () => screen.getByRole('log', { name: 'Conversa com o assistente' });
function type(text: string) { fireEvent.change(box(), { target: { value: text } }); }
function send(text: string) { type(text); fireEvent.click(screen.getByRole('button', { name: 'Enviar ao Gemini' })); }
function chooseOption(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Opções do assistente' }));
  fireEvent.click(screen.getByRole('menuitem', { name }));
}

describe('the assistant reads like a chat app', () => {
  it('shows the conversation as one log: the person on the right, the assistant on the left; Enter sends, Shift+Enter does not', async () => {
    const f = make(async () => ({ data: { reply: { status: 'clarification', question: 'Quais modelos entram na tabela?' } }, error: null }));
    expect(screen.getByRole('heading', { name: 'Assistente' })).toBeInTheDocument();
    const sendButton = screen.getByRole('button', { name: 'Enviar ao Gemini' });
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveAttribute('title', 'Escreva um pedido para enviar');
    type('Crie uma tabela comparativa');
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
    expect(f.generationCalls()).toHaveLength(0);
    fireEvent.keyDown(box(), { key: 'Enter' });
    await waitFor(() => expect(log()).toHaveTextContent('Quais modelos entram na tabela?'));
    const [mine, reply] = within(log()).getAllByRole('article');
    expect(mine).toHaveClass('ai-chat-user');
    expect(mine).toHaveTextContent('Crie uma tabela comparativa');
    expect(reply).toHaveClass('ai-chat-assistant');
    expect(box()).toHaveValue('');
  });

  it('has ONE scroll area: the conversation (the header and the text box stay in place)', () => {
    for (const file of ['src/vnext/app/product-primitives.css', 'src/vnext/ai-catalog/chat/assistant-chat.css']) {
      const style = document.createElement('style');
      style.setAttribute('data-test-css', '');
      style.textContent = readFileSync(resolve(process.cwd(), file), 'utf8');
      document.head.append(style);
    }
    make();
    expect(getComputedStyle(log()).overflowY).toBe('auto');
    const root = screen.getByRole('region', { name: 'Assistente de criação do catálogo' });
    const scrolling = [...root.querySelectorAll<HTMLElement>('*')].filter((element) => ['auto', 'scroll'].includes(getComputedStyle(element).overflowY));
    expect(scrolling).toEqual([log()]);
  });

  it('follows the newest message, but not while the person scrolled up to read; "Ir para a última mensagem" brings them back', async () => {
    let answer!: (value: unknown) => void;
    make(() => new Promise((done) => { answer = done; }));
    const scrollTo = vi.fn();
    const element = log();
    Object.defineProperties(element, {
      scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 300 },
      scrollTo: { configurable: true, value: scrollTo },
    });
    send('Crie uma capa');
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000 });
    scrollTo.mockClear();
    element.scrollTop = 100;
    fireEvent.scroll(element);
    const jump = screen.getByRole('button', { name: 'Ir para a última mensagem' });
    await act(async () => { answer({ data: { reply: { status: 'clarification', question: 'Qual é o modelo?' } }, error: null }); });
    expect(log()).toHaveTextContent('Qual é o modelo?');
    // The new answer did not pull the person down.
    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.click(jump);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: 'smooth' });
    expect(screen.queryByRole('button', { name: 'Ir para a última mensagem' })).toBeNull();
  });

  it('turns each batch of files into ONE short message; the lists stay behind "Ver detalhes"; chips can be taken out', async () => {
    make();
    fireEvent.change(screen.getByLabelText('Escolher arquivos'), {
      target: { files: [new File(['Modelo;Faixa\nTA-25N;-25 a 140 °C\n'], 'lista.csv'), new File(['Modelo;Exatidão\nTA-25N;±0,1 °C\n'], 'outra.csv')] },
    });
    await waitFor(() => expect(log()).toHaveTextContent('Li 2 arquivos: lista.csv e outra.csv. Encontrei 2 tabelas.'));
    expect(within(log()).getAllByRole('article', { name: 'Arquivos lidos' })).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'O que encontrei em lista.csv' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes' }));
    expect(screen.getByRole('region', { name: 'O que encontrei em lista.csv' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ocultar detalhes' })).toHaveAttribute('aria-expanded', 'true');
    const chips = screen.getByRole('list', { name: 'Arquivos enviados' });
    expect(within(chips).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(within(chips).getByRole('button', { name: 'Tirar lista.csv da lista' }));
    expect(within(chips).getAllByRole('listitem')).toHaveLength(1);
    expect(log()).toHaveTextContent('Li 1 arquivo: outra.csv.');
  });

  it('shows a proposal as a card with Aplicar / Ajustar / Descartar, and "Desfazer" right after applying', async () => {
    const f = make();
    const before = f.session.getSnapshot().document;
    send('Crie a capa e a ficha técnica');
    const card = await screen.findByRole('group', { name: 'Proposta de páginas' });
    expect(card).toHaveTextContent('Página 1: Catálogo TA-25N · Capa');
    expect(card).toHaveTextContent('Página 2: Ficha técnica · Ficha técnica: 2 colunas × 2 linhas, dados ainda vazios');
    fireEvent.click(within(card).getByRole('button', { name: 'Ajustar' }));
    expect(box()).toHaveValue('Ajuste a proposta: ');
    expect(box()).toHaveFocus();
    expect(screen.getByRole('group', { name: 'Proposta de páginas' })).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Aplicar' }));
    expect(f.session.getSnapshot().document.pages).toHaveLength(2);
    expect(screen.queryByRole('group', { name: 'Proposta de páginas' })).toBeNull();
    fireEvent.click(within(log()).getByRole('button', { name: 'Desfazer' }));
    expect(f.session.getSnapshot().document).toEqual(before);
    expect(log()).toHaveTextContent('Desfiz a alteração.');
    expect(within(log()).queryByRole('button', { name: 'Desfazer' })).toBeNull();

    send('Crie de novo');
    fireEvent.click(within(await screen.findByRole('group', { name: 'Proposta de páginas' })).getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByRole('group', { name: 'Proposta de páginas' })).toBeNull();
    expect(f.session.getSnapshot().document).toEqual(before);
  });

  it('shows an error inside the conversation with "Tentar de novo", which sends the same request again', async () => {
    let turn = 0;
    const failure = { status: 503, clone() { return this; }, json: async () => ({ code: 'PROVIDER_UNAVAILABLE' }) };
    const f = make(async () => (++turn === 1
      ? { data: null, error: Object.assign(new Error('x'), { name: 'FunctionsHttpError', context: failure }), response: failure }
      : { data: { reply: { status: 'clarification', question: 'Pode repetir os modelos?' } }, error: null }));
    send('Crie uma capa');
    const alert = await screen.findByRole('alert');
    expect(log()).toContainElement(alert);
    expect(alert).toHaveTextContent('O serviço de IA não respondeu agora.');
    expect(screen.getByRole('article', { name: 'Mensagem não enviada' })).toHaveTextContent('Crie uma capa');
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(log()).toHaveTextContent('Pode repetir os modelos?'));
    expect(f.generationCalls()).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('"Nova conversa" starts empty; the history menu lists this catalog\'s conversations, kept after reopening', async () => {
    const f = make(async () => ({ data: { reply: { status: 'clarification', question: 'Para qual modelo?' } }, error: null }));
    expect(screen.getByRole('button', { name: 'Nova conversa' })).toBeDisabled();
    send('Crie uma capa para o TA-25N');
    await waitFor(() => expect(log()).toHaveTextContent('Para qual modelo?'));
    fireEvent.click(screen.getByRole('button', { name: 'Nova conversa' }));
    expect(log()).not.toHaveTextContent('Para qual modelo?');
    expect(screen.getByText('O que vamos fazer neste catálogo?')).toBeInTheDocument();
    expect(box()).toHaveFocus();
    f.ui.unmount();
    render(f.element());
    // Reopened: the empty new conversation is still the open one; the earlier one is in the history.
    expect(log()).not.toHaveTextContent('Para qual modelo?');
    fireEvent.click(screen.getByRole('button', { name: 'Conversas anteriores' }));
    const menu = screen.getByRole('menu', { name: 'Conversas deste catálogo' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Crie uma capa para o TA-25N/ }));
    expect(log()).toHaveTextContent('Para qual modelo?');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('runs the quick actions from the options menu and a typed "Desfaça" without the AI', () => {
    const f = make();
    expect(f.session.execute({ type: 'page.add' }).ok).toBe(true);
    chooseOption('Desfazer a última alteração');
    expect(f.session.getSnapshot().document.pages).toHaveLength(1);
    expect(log()).toHaveTextContent('Executei Desfazer.');
    send('Refaça');
    expect(f.session.getSnapshot().document.pages).toHaveLength(2);
    expect(log()).toHaveTextContent('Executei Refazer.');
    chooseOption('Deixar as tabelas mais compactas');
    expect(log()).toHaveTextContent('Ainda não há tabelas neste catálogo para compactar.');
    expect(f.generationCalls()).toHaveLength(0);
    // The menu has no "Ferramentas" tab to switch to and keeps the key option out of the way.
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('starts with a few suggestions in plain Portuguese; translating appears only with a text selected', () => {
    const doc = createCatalogDocument(id, 'Catálogo');
    const session = createDocumentSession(doc, { createId: id });
    expect(session.execute({ type: 'object.insert', pageId: doc.pages[0].id, object: createInsertSpec('text', doc.pages[0]) }).ok).toBe(true);
    const text = session.getSnapshot().document.pages[0].objects[0];
    if (text.type !== 'text') throw new Error('NO_TEXT');
    const element = (selected?: boolean) => <CatalogNativeComposer documentId={doc.id} session={session} onBeforeMutation={() => true}
      selected={selected ? { objectId: text.id, text: structuredClone(text.text) } : undefined} />;
    const ui = render(element());
    const suggestions = () => within(screen.getByText('O que vamos fazer neste catálogo?').parentElement!).getAllByRole('button')
      .filter((button) => !button.classList.contains('ai-chat-dropzone')).map((button) => button.textContent);
    expect(suggestions()).toEqual(['Montar uma ficha técnica a partir de um PDF', 'Comparar modelos', 'Criar uma capa e uma apresentação']);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar modelos' }));
    expect((box() as HTMLTextAreaElement).value).toMatch(/^Crie uma página comparando três modelos/);
    expect(box()).toHaveFocus();
    ui.rerender(element(true));
    fireEvent.click(screen.getByRole('button', { name: 'Traduzir o texto selecionado para inglês' }));
    expect((screen.getByRole('textbox', { name: 'Como deseja reescrever o texto selecionado?' }) as HTMLTextAreaElement).value)
      .toMatch(/^Traduza este texto para o inglês/);
    expect(screen.getByRole('button', { name: 'Voltar a criar páginas' })).toHaveAttribute('aria-pressed', 'true');
  });
});

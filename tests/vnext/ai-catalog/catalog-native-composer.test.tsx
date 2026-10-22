import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, afterEach, afterAll, describe, it, expect, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '../../../src/vnext/application';
import { CatalogNativeComposer, DAILY_LIMIT_SEND_EXPLANATION } from '../../../src/vnext/ai-catalog/CatalogNativeComposer';
import type { NativeComposeFunctionsClient } from '../../../src/vnext/ai-catalog/native-compose-client';
import type { NativeComposePlan } from '../../../src/vnext/ai-catalog/native-compose';
import { clearByokCredential, setByokCredential } from '../../../src/vnext/ai-catalog/byok-session';

vi.mock('../../../src/vnext/ai-catalog/ProviderCredentialsSettings', () => ({
  ProviderCredentialsSettings: ({ onUnlock }: {
    onUnlock: (provider: 'gemini', key: string) => void;
  }) => <button type="button" onClick={() => onUnlock('gemini', 'temporary-test-only-key')}>Desbloquear chave de teste</button>,
}));
beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { cleanup(); localStorage.clear(); clearByokCredential(); vi.restoreAllMocks(); });
afterAll(() => vi.unstubAllGlobals());
const plan: NativeComposePlan = {
  version: 1, status: 'proposal', summary: 'Estrutura editorial com capa e tabela editável.',
  pages: [
    { type: 'cover', heading: 'Catálogo de teste PRESYS', subtitle: 'Criação nativa no catálogo aberto' },
    { type: 'comparison', heading: 'Comparação de modelos', table: {
      columns: ['Característica','Modelo A','Modelo B'], rowLabels: ['Faixa','Exatidão','Alimentação'],
      design: 'datasheet',
    } },
  ],
};
type Body = { task: string; credential?: { apiKey: string } };
const id = () => crypto.randomUUID();
const make = (reply: unknown = plan) => {
  const doc = createCatalogDocument(id, 'Novo catálogo');
  const session = createDocumentSession(doc, { createId: id });
  const invoke = vi.fn(async (_name: string, options: { body: Body }) => options.body.task === 'status'
    ? { data: { code: 'OK', status: { enabled: true, mode: 'bounded-acceptance', serverKey: true, byok: true,
      remainingMicrousd: null, callReserveMicrousd: 7800 } }, error: null }
    : { data: { reply }, error: null });
  const client = { functions: { invoke } } as unknown as NativeComposeFunctionsClient;
  const element = <CatalogNativeComposer documentId={doc.id} session={session}
    ownerScope="user:01" client={client} onBeforeMutation={() => true} />;
  const ui = render(element);
  const generationCalls = () => invoke.mock.calls.filter(([, options]) => options.body.task !== 'status');
  return { doc, session, invoke, ui, element, generationCalls };
};
async function send(text = 'Crie um catálogo com capa e tabela comparativa profissional.') {
  fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Enviar ao Gemini/ }));
}
async function sendAndWaitProposal() {
  await send();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Aplicar' })).toBeInTheDocument());
}
/** The names in the options menu of the assistant (opened and closed again). */
function optionNames(): string[] {
  const trigger = screen.getByRole('button', { name: 'Opções do assistente' });
  fireEvent.click(trigger);
  const names = screen.queryAllByRole('menuitem').map((item) => item.textContent ?? '');
  fireEvent.click(trigger);
  return names;
}
function chooseOption(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Opções do assistente' }));
  fireEvent.click(screen.getByRole('menuitem', { name }));
}

describe('Gemini conversational creation, confirmation and native editor action boundary', () => {
  it('proposes with the server key (no personal key) and inserts native pages only after approval', async () => {
    const f = make();
    const baseline = structuredClone(f.session.getSnapshot().document);
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    await sendAndWaitProposal();
    expect(f.session.getSnapshot().document).toEqual(baseline);
    expect(screen.getByText(/Comparação de modelos/)).toBeInTheDocument();
    expect(screen.getByText(/Ficha técnica: 3 colunas/)).toBeInTheDocument();
    expect(f.generationCalls()).toHaveLength(1);
    const [name, options] = f.generationCalls()[0];
    expect(name).toBe('vnext-catalog-composer');
    expect(options.body.task).toBe('compose_scaffold');
    expect(options.body).not.toHaveProperty('credential');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(f.session.getSnapshot().document.pages).toHaveLength(2));
    expect(f.session.getSnapshot().document.pages[0].id).toBe(baseline.pages[0].id);
    expect(f.session.getSnapshot().document.pages[0].objects.length).toBeGreaterThan(0);
    expect(f.session.getSnapshot().document.pages.at(-1)!.objects.some(o => o.type === 'table')).toBe(true);
    expect(f.session.undo().ok).toBe(true);
    expect(f.session.getSnapshot().document).toEqual(baseline);
  });
  it('rejects proposals for stale document revisions without a single partial edit', async () => {
    const f = make();
    await sendAndWaitProposal();
    act(() => { expect(f.session.execute({ type: 'page.add' }).ok).toBe(true); });
    const before = structuredClone(f.session.getSnapshot().document);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(f.session.getSnapshot().document).toEqual(before);
    expect(screen.getByRole('alert')).toHaveTextContent('desatualizada');
  });
  it('refuses arbitrary provider actions and preserves the document', async () => {
    const malicious = { ...plan, extra: { shell: 'run arbitrary code' } };
    const f = make(malicious);
    await send('Crie um catálogo institucional técnico.');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('A IA respondeu de um jeito que não pôde ser usado'));
    expect(screen.getByRole('alert')).toHaveTextContent('O catálogo não foi alterado.');
    expect(f.session.getSnapshot().document).toEqual(f.doc);
  });
  it('supports a multi-turn clarification instead of always producing a fake PDF', async () => {
    const f = make({ status: 'clarification', question: 'Quais modelos devem aparecer na tabela comparativa?' });
    await send('Crie um catálogo complexo de produtos.');
    await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('Quais modelos devem aparecer'));
    expect(f.session.getSnapshot().document.pages).toHaveLength(1);
  });
  it('uses a personal key only from the options menu, keeps it after the panel closes, and can go back to the server key', async () => {
    const f = make();
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    chooseOption('Usar minha própria chave');
    expect(screen.getByRole('region', { name: 'Usar minha própria chave' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear chave de teste' }));
    expect(screen.queryByRole('region', { name: 'Usar minha própria chave' })).toBeNull();
    expect(screen.getByText('IA pronta, usando a sua chave própria nesta aba.')).toBeInTheDocument();
    await sendAndWaitProposal();
    expect(f.generationCalls()[0][1].body.credential).toEqual({ provider: 'gemini', apiKey: 'temporary-test-only-key' });
    expect(JSON.stringify(localStorage)).not.toContain('temporary-test-only-key');
    // Closing the assistant panel unmounts the composer; the unlocked key survives.
    f.ui.unmount();
    render(f.element);
    expect(screen.getByText('IA pronta, usando a sua chave própria nesta aba.')).toBeInTheDocument();
    chooseOption('Voltar a usar a IA do servidor');
    await send('Crie mais uma página de apresentação para o catálogo.');
    await waitFor(() => expect(f.generationCalls()).toHaveLength(2));
    expect(f.generationCalls()[1][1].body).not.toHaveProperty('credential');
  });
});

/** supabase-js functions.invoke failure: FunctionsHttpError whose context is the Response. */
const httpFailure = (status: number, body: unknown) => {
  const response = { status, clone() { return this; }, json: async () => body };
  return { data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'),
    { name: 'FunctionsHttpError', context: response }), response };
};
type Invoke = (name: string, options: { body: Body & { message?: string; history?: unknown[] } }) => Promise<unknown>;
const makeWith = (handler: Invoke) => {
  const doc = createCatalogDocument(id, 'Novo catálogo');
  const session = createDocumentSession(doc, { createId: id });
  const invoke = vi.fn(handler);
  const client = { functions: { invoke } } as unknown as NativeComposeFunctionsClient;
  const ui = render(<CatalogNativeComposer documentId={doc.id} session={session}
    ownerScope="user:01" client={client} onBeforeMutation={() => true} />);
  const generationCalls = () => invoke.mock.calls.filter(([, options]) => options.body.task !== 'status');
  return { doc, session, invoke, ui, generationCalls };
};
const statusOk = { data: { code: 'OK', status: { enabled: true, mode: 'bounded-acceptance', serverKey: true, byok: false,
  remainingMicrousd: null, callReserveMicrousd: 7800 } }, error: null };

describe('readiness, plain-Portuguese errors and a stable conversation (FR-60, FR-61)', () => {
  it('tolerates the composer deployed before the status task: shows "IA disponível" and still sends without a key', async () => {
    // The older composer answers the unknown status task with 400 INVALID_REQUEST.
    const f = makeWith(async (_name, options) => options.body.task === 'status'
      ? httpFailure(400, { code: 'INVALID_REQUEST' }) : { data: { reply: plan }, error: null });
    await waitFor(() => expect(screen.getByText('IA disponível.')).toBeInTheDocument());
    expect(optionNames()).toContain('Usar minha própria chave');
    await sendAndWaitProposal();
    expect(f.generationCalls()[0][1].body).not.toHaveProperty('credential');
  });

  it('offers "Usar minha própria chave" only when the server accepts a personal key, and no "↗" on the send button', async () => {
    makeWith(async (_name, options) => options.body.task === 'status' ? statusOk : { data: { reply: plan }, error: null });
    // Do not flash an unusable key option before the server has reported its capability.
    expect(optionNames()).not.toContain('Usar minha própria chave');
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    // The server says byok: false, so the key option remains hidden; no always-visible key buttons either.
    expect(optionNames()).not.toContain('Usar minha própria chave');
    expect(screen.queryByRole('button', { name: /Avançado|chave própria|IA do servidor/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Enviar ao Gemini' })).toBeInTheDocument();
    expect(screen.queryByText(/↗/)).toBeNull();
  });

  it('C-05: with the daily limit already known, switches "Enviar" off with the reason beside it and keeps the typed request', async () => {
    const f = makeWith(async () => httpFailure(429, { code: 'AGENT_DAILY_BUDGET_EXCEEDED' }));
    await waitFor(() => expect(document.querySelector('[data-ai-readiness="blocked"]')).toBeInTheDocument());
    expect(optionNames()).not.toContain('Usar minha própria chave');
    const box = screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' });
    fireEvent.change(box, { target: { value: 'Crie uma capa para o catálogo de calibradores.' } });
    const sendButton = screen.getByRole('button', { name: 'Enviar ao Gemini' });
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveAccessibleDescription(DAILY_LIMIT_SEND_EXPLANATION);
    expect(screen.getByText(DAILY_LIMIT_SEND_EXPLANATION)).toBeVisible();
    expect(DAILY_LIMIT_SEND_EXPLANATION).toMatch(/limite diário/);
    // Enter does not send either; the text stays in the box and nothing reaches the server.
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.click(sendButton);
    expect(box).toHaveValue('Crie uma capa para o catálogo de calibradores.');
    expect(f.generationCalls()).toHaveLength(0);
    expect(screen.queryByRole('article', { name: 'Mensagem não enviada' })).toBeNull();
    expect(f.session.getSnapshot().document).toEqual(f.doc);
  });

  it('C-05: when a request comes back with the daily limit, keeps the request and switches "Enviar" off from then on', async () => {
    const f = makeWith(async (_name, options) => options.body.task === 'status'
      ? statusOk : httpFailure(429, { code: 'AGENT_DAILY_BUDGET_EXCEEDED' }));
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    await send('Crie uma capa para o catálogo de calibradores.');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('O limite diário de uso da IA foi atingido.'));
    expect(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' })).toHaveValue('Crie uma capa para o catálogo de calibradores.');
    expect(screen.getByRole('button', { name: 'Enviar ao Gemini' })).toBeDisabled();
    expect(screen.getByText(DAILY_LIMIT_SEND_EXPLANATION)).toBeInTheDocument();
    expect(f.generationCalls()).toHaveLength(1);
  });

  it('keeps "Enviar" on when the server is ready with budget left', async () => {
    makeWith(async (_name, options) => options.body.task === 'status' ? statusOk : { data: { reply: plan }, error: null });
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), { target: { value: 'Crie uma capa.' } });
    expect(screen.getByRole('button', { name: 'Enviar ao Gemini' })).toBeEnabled();
    expect(screen.queryByText(DAILY_LIMIT_SEND_EXPLANATION)).toBeNull();
  });

  it('D-07: opens a new proposal from its beginning, not scrolled down to its buttons', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, writable: true, value: scrollTo });
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = this.matches('.ai-chat-card') ? 640 : this.matches('.ai-chat-thread') ? 200 : 0;
      return { top, bottom: top + 100, left: 0, right: 300, width: 300, height: 100, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });
    try {
      makeWith(async (_name, options) => options.body.task === 'status' ? statusOk : { data: { reply: plan }, error: null });
      await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
      await sendAndWaitProposal();
      // The last scroll puts the proposal's title at the top of the history (8 px of breathing room), after the
      // usual "follow the conversation" scroll to the bottom.
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 640 - 200 - 8 });
      expect(screen.getByRole('heading', { name: 'Proposta para revisar' })).toBeInTheDocument();
    } finally {
      rect.mockRestore();
      delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
    }
  });

  it.each([
    ['COMPOSER_DISABLED', 503],
    ['FORBIDDEN', 403],
  ])('keeps personal-key controls hidden when readiness is blocked by %s', async (code, status) => {
    const f = makeWith(async () => httpFailure(status, { code }));
    expect(optionNames()).not.toContain('Usar minha própria chave');
    await waitFor(() => expect(document.querySelector('[data-ai-readiness="blocked"]')).toBeInTheDocument());
    expect(optionNames()).not.toContain('Usar minha própria chave');
    await send('Crie uma capa para o catálogo de calibradores.');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('O catálogo não foi alterado.'));
    expect(screen.getByRole('article', { name: 'Mensagem não enviada' })).toHaveTextContent('Crie uma capa para o catálogo de calibradores.');
    expect(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' })).toHaveValue('Crie uma capa para o catálogo de calibradores.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('chave própria');
    expect(f.generationCalls()[0][1].body).not.toHaveProperty('credential');
    expect(f.session.getSnapshot().document).toEqual(f.doc);
  });

  it('keeps an already unlocked personal key usable while checking and after blocked readiness', async () => {
    setByokCredential('temporary-test-only-key', 'user:01');
    let resolveStatus!: (value: unknown) => void;
    const checking = new Promise(resolve => { resolveStatus = resolve; });
    const f = makeWith(async (_name, options) => options.body.task === 'status'
      ? checking : { data: { reply: plan }, error: null });
    expect(screen.getByText('IA pronta, usando a sua chave própria nesta aba.')).toBeInTheDocument();
    expect(optionNames()).toContain('Voltar a usar a IA do servidor');
    await act(async () => { resolveStatus(httpFailure(429, { code: 'AGENT_DAILY_BUDGET_EXCEEDED' })); });
    expect(optionNames()).toContain('Voltar a usar a IA do servidor');
    await sendAndWaitProposal();
    expect(f.generationCalls()[0][1].body.credential).toEqual({ provider: 'gemini', apiKey: 'temporary-test-only-key' });
  });

  it('offers no personal key option where the AI is not available at all', () => {
    const doc = createCatalogDocument(id, 'Novo catálogo');
    render(<CatalogNativeComposer documentId={doc.id} session={createDocumentSession(doc, { createId: id })}
      ownerScope="user:01" onBeforeMutation={() => true} />);
    expect(screen.getByText('A IA não está disponível nesta tela.')).toBeInTheDocument();
    expect(optionNames()).not.toContain('Usar minha própria chave');
  });

  it('keeps the first suggestions in view and only follows the conversation once it starts', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, writable: true, value: scrollTo });
    try {
      makeWith(async (_name, options) => options.body.task === 'status' ? statusOk : { data: { reply: plan }, error: null });
      await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Criar uma capa e uma apresentação' })).toBeInTheDocument();
      expect(scrollTo).not.toHaveBeenCalled();
      await sendAndWaitProposal();
      expect(scrollTo).toHaveBeenCalled();
    } finally {
      delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
    }
  });

  it('turns PROVIDER_NOT_CONFIGURED into Portuguese with an action and keeps the message as not sent', async () => {
    const f = makeWith(async (_name, options) => options.body.task === 'status'
      ? statusOk : httpFailure(503, { code: 'PROVIDER_NOT_CONFIGURED', detail: 'secret text from the server' }));
    await send('Crie uma capa para o catálogo de calibradores.');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('A IA do servidor ainda não foi configurada. Fale com o administrador.'));
    expect(screen.getByRole('alert')).toHaveTextContent('O catálogo não foi alterado.');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/secret|PROVIDER_NOT_CONFIGURED/);
    expect(screen.getByRole('article', { name: 'Mensagem não enviada' })).toHaveTextContent('Crie uma capa para o catálogo de calibradores.');
    expect(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' })).toHaveValue('Crie uma capa para o catálogo de calibradores.');
    // Nothing was stored as sent.
    expect(screen.getByRole('log').querySelectorAll('.ai-chat-turn')).toHaveLength(0);
    expect(f.session.getSnapshot().document).toEqual(f.doc);
  });

  it.each([
    [{ code: 'AGENT_DAILY_BUDGET_EXCEEDED' }, 429, 'O limite diário de uso da IA foi atingido. Continue editando manualmente hoje'],
    [{ code: 'INVALID_PROVIDER_RESPONSE', reason: 'MAX_TOKENS' }, 502, 'Peça menos páginas de cada vez'],
    [{ code: 'FORBIDDEN' }, 403, 'Sua conta não tem permissão para usar a IA. Fale com o administrador.'],
    [{ code: 'SOMETHING_NEW', message: 'raw provider text' }, 500, 'Não foi possível consultar a IA agora.'],
  ])('maps %o to a message with what to do next', async (body, status, expected) => {
    makeWith(async (_name, options) => options.body.task === 'status' ? statusOk : httpFailure(status, body));
    await send();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(expected));
    expect(screen.getByRole('alert')).not.toHaveTextContent(/raw provider text|SOMETHING_NEW|_/);
  });

  it('shows why the AI cannot answer before the first request (status says the composer is off)', async () => {
    makeWith(async (_name, options) => options.body.task === 'status'
      ? httpFailure(503, { code: 'COMPOSER_DISABLED' }) : { data: { reply: plan }, error: null });
    await waitFor(() => expect(screen.getByText(/A IA está desligada no servidor neste momento/)).toBeInTheDocument());
  });

  it('accepts a one-word answer ("Sim") to a clarification and sends the conversation with it', async () => {
    let turn = 0;
    const f = makeWith(async (_name, options) => {
      if (options.body.task === 'status') return statusOk;
      turn++;
      return { data: { reply: turn === 1
        ? { status: 'clarification', question: 'Deseja incluir uma tabela comparativa dos modelos?' } : plan }, error: null };
    });
    await send('Crie uma capa e uma apresentação para o catálogo de manômetros.');
    await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('Deseja incluir uma tabela comparativa'));
    await send('Sim');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Aplicar' })).toBeInTheDocument());
    const second = f.generationCalls()[1][1].body;
    expect(second.message).toBe('Resposta do usuário à pergunta anterior: Sim');
    expect(second.history).toHaveLength(2);
    // The author sees their own words, not the framing.
    expect(screen.getByRole('log')).toHaveTextContent('Sim');
    expect(screen.getByRole('log')).not.toHaveTextContent('Resposta do usuário à pergunta anterior');
  });

  it('keeps a paid proposal while the author types the next message, and still applies it', async () => {
    const f = make();
    await sendAndWaitProposal();
    fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), { target: { value: 'Depois quero uma página de contato.' } });
    expect(screen.getByRole('group', { name: 'Proposta de páginas' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(f.session.getSnapshot().document.pages).toHaveLength(2));
    expect(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' })).toHaveValue('Depois quero uma página de contato.');
  });
});

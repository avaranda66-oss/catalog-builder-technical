import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession, type DocumentSession } from '../../../src/vnext/application';
import type { CatalogDocument } from '../../../src/vnext/domain';
import { CatalogNativeComposer, EDIT_NOT_DEPLOYED } from '../../../src/vnext/ai-catalog/CatalogNativeComposer';
import type { NativeComposeFunctionsClient } from '../../../src/vnext/ai-catalog/native-compose-client';
import { buildDocumentOutline } from '../../../src/vnext/ai-catalog/document-outline';
import { clearByokCredential } from '../../../src/vnext/ai-catalog/byok-session';

/**
 * FR-72/FR-73 mounted in the assistant: a change typed about the open catalog goes to `edit_intent` and comes back as
 * the "Vou fazer isto" card (Aplicar = one Desfazer); new pages keep going to the composer.
 */
beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { cleanup(); localStorage.clear(); clearByokCredential(); vi.restoreAllMocks(); });
afterAll(() => vi.unstubAllGlobals());

const PCON = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/examples/presys-capa-pcon-hibrido.catalog.json'), 'utf8')) as CatalogDocument;
/** The conversation store keys by a uuid (the editor passes the saved catalog id). */
const STORAGE_ID = '8d6f3c1e-2b4a-4c7d-9e0f-1a2b3c4d5e6f';
const TITLE = 'capa-pcon-hibrido-titulo';
const ALL_TASKS = ['compose_scaffold', 'revise_selected_text', 'edit_intent'];
type Body = { task: string; message?: string; history?: unknown[] };
const pagesPlan = {
  version: 1, status: 'proposal', summary: 'Uma página de contato.',
  pages: [{ type: 'section', heading: 'Contato PRESYS', subtitle: 'Fale com a equipe de vendas' }],
};

function textOf(session: DocumentSession, objectId: string): string | undefined {
  const object = session.getSnapshot().document.pages.flatMap(page => page.objects).find(entry => entry.id === objectId);
  return object?.type === 'text' ? object.text.paragraphs.map(p => p.inlines.map(i => i.kind === 'text' ? i.text : '').join('')).join('\n') : undefined;
}

function make(options: { tasks?: readonly string[]; editReplies?: unknown[]; document?: CatalogDocument } = {}) {
  const document = options.document ?? structuredClone(PCON);
  const session = createDocumentSession(document, { createId: () => crypto.randomUUID() });
  const activePageId = document.pages[0].id;
  const outline = buildDocumentOutline(document, { activePageId });
  const titleRef = [...outline.objects].find(([, value]) => value.objectId === TITLE)?.[0] ?? '';
  const editReplies = [...(options.editReplies ?? [{ status: 'proposal', summary: 'Vou trocar o título da capa.',
    intents: [{ kind: 'set_text', target: titleRef, text: 'PCON-Y18' }], blocked: [] }])];
  const invoke = vi.fn(async (_name: string, { body }: { body: Body }) => {
    if (body.task === 'status') {
      return { data: { code: 'OK', status: { enabled: true, mode: 'bounded-acceptance', serverKey: true, byok: false,
        remainingMicrousd: null, callReserveMicrousd: 7800, ...(options.tasks ? { tasks: [...options.tasks] } : {}) } }, error: null };
    }
    if (body.task === 'edit_intent') return { data: { reply: editReplies.shift() }, error: null };
    return { data: { reply: pagesPlan }, error: null };
  });
  const client = { functions: { invoke } } as unknown as NativeComposeFunctionsClient;
  render(<CatalogNativeComposer documentId={STORAGE_ID} session={session} ownerScope="user:edit" client={client}
    activePageId={activePageId} onBeforeMutation={() => true} />);
  const tasksSent = () => invoke.mock.calls.map(([, { body }]) => body.task).filter(task => task !== 'status');
  const bodies = (task: string) => invoke.mock.calls.map(([, { body }]) => body).filter(body => body.task === task);
  return { session, invoke, tasksSent, bodies };
}
function send(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar ao Gemini' }));
}
const editCard = () => screen.queryByRole('group', { name: 'Mudanças pedidas na conversa' });

describe('the assistant routes a change on the open catalog to edit_intent (FR-72, FR-73)', () => {
  it('"troque o título da capa" shows "Vou fazer isto"; Aplicar changes the catalog as one Desfazer', async () => {
    const f = make({ tasks: ALL_TASKS });
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    const before = structuredClone(f.session.getSnapshot().document);
    send('Troque o título da capa para PCON-Y18');
    const card = await screen.findByRole('group', { name: 'Mudanças pedidas na conversa' });
    expect(f.tasksSent()).toEqual(['edit_intent']);
    expect(within(card).getByRole('heading', { name: 'Vou fazer isto' })).toBeInTheDocument();
    expect(card).toHaveTextContent('PCON HÍBRIDO');
    expect(card).toHaveTextContent('PCON-Y18');
    expect(screen.getByRole('log', { name: 'Conversa com o assistente' })).toHaveTextContent('Vou trocar o título da capa.');
    // Nothing changes before Aplicar.
    expect(f.session.getSnapshot().document).toEqual(before);
    fireEvent.click(within(card).getByRole('button', { name: 'Aplicar' }));
    expect(textOf(f.session, TITLE)).toBe('PCON-Y18');
    expect(editCard()).toBeNull();
    expect(screen.getByRole('log')).toHaveTextContent('Apliquei a mudança. Um Desfazer volta tudo');
    // One Desfazer, from the conversation, brings everything back.
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(f.session.getSnapshot().document).toEqual(before);
  });

  it('Descartar removes the card and changes nothing', async () => {
    const f = make({ tasks: ALL_TASKS });
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    const before = structuredClone(f.session.getSnapshot().document);
    send('Troque o título da capa para PCON-Y18');
    const card = await screen.findByRole('group', { name: 'Mudanças pedidas na conversa' });
    fireEvent.click(within(card).getByRole('button', { name: 'Descartar' }));
    expect(editCard()).toBeNull();
    expect(f.session.getSnapshot().document).toEqual(before);
  });

  it('a question from the edit lane keeps the short answer there; new pages still go to the composer', async () => {
    const f = make({ tasks: ALL_TASKS, editReplies: [
      { status: 'clarification', question: 'Qual faixa: os selos de faixa ou o fundo azul?' },
      { status: 'refusal', reason: 'Não encontrei selos de faixa na página aberta.' },
    ] });
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    send('Mude a cor da faixa para azul claro');
    await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('Qual faixa: os selos de faixa ou o fundo azul?'));
    send('os selos');
    await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('Não encontrei selos de faixa na página aberta.'));
    expect(f.tasksSent()).toEqual(['edit_intent', 'edit_intent']);
    // The follow-up carries the question and the first request as history.
    expect(f.bodies('edit_intent')[1].history).toEqual([
      { role: 'user', message: 'Mude a cor da faixa para azul claro' },
      { role: 'assistant', message: 'Qual faixa: os selos de faixa ou o fundo azul?' },
    ]);
    send('Crie uma página de contato');
    await screen.findByRole('group', { name: 'Proposta de páginas' });
    expect(f.tasksSent()).toEqual(['edit_intent', 'edit_intent', 'compose_scaffold']);
    expect(editCard()).toBeNull();
  });

  it('a server without edit_intent says so in the card, before anything is sent or charged', async () => {
    const f = make();
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    const before = structuredClone(f.session.getSnapshot().document);
    send('Apague a página 4');
    const card = await screen.findByRole('group', { name: 'Mudanças pedidas na conversa' });
    expect(card).toHaveTextContent(EDIT_NOT_DEPLOYED);
    expect(card).toHaveTextContent('Nada foi enviado à IA e nada foi cobrado');
    expect(within(card).queryByRole('button', { name: 'Aplicar' })).toBeNull();
    expect(f.tasksSent()).toEqual([]);
    expect(f.session.getSnapshot().document).toEqual(before);
    // The request stays in the conversation; "Entendi" closes the card.
    expect(screen.getByRole('log')).toHaveTextContent('Apague a página 4');
    fireEvent.click(within(card).getByRole('button', { name: 'Entendi' }));
    expect(editCard()).toBeNull();
  });

  it('an answer that fails the checks here changes nothing and puts the request back in the box', async () => {
    const f = make({ tasks: ALL_TASKS, editReplies: [{ status: 'proposal', summary: 'Vou apagar tudo.', intents: [{ kind: 'run_script', target: 'o1' }], blocked: [] }] });
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    const before = structuredClone(f.session.getSnapshot().document);
    send('Apague o título da capa');
    expect(await screen.findByRole('alert')).toHaveTextContent('A IA respondeu de um jeito que não pôde ser usado. Tente de novo, com outras palavras. O catálogo não foi alterado.');
    expect(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' })).toHaveValue('Apague o título da capa');
    expect(editCard()).toBeNull();
    expect(f.session.getSnapshot().document).toEqual(before);
  });

  it('keeps the suggestions and a blank catalog on the composer', async () => {
    const blank = createCatalogDocument(() => crypto.randomUUID(), 'Novo catálogo');
    const f = make({ tasks: ALL_TASKS, document: blank });
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Criar uma capa e uma apresentação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao Gemini' }));
    await screen.findByRole('group', { name: 'Proposta de páginas' });
    send('Troque o título para PCON-Y18');
    await waitFor(() => expect(f.tasksSent()).toEqual(['compose_scaffold', 'compose_scaffold']));
  });
});

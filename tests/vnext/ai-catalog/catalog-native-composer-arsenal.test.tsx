import { webcrypto } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDocumentSession } from '../../../src/vnext/application';
import { createPresysArchetypeTemplateRegistry } from '../../../src/vnext/library/presys-archetypes';
import { CatalogNativeComposer } from '../../../src/vnext/ai-catalog/CatalogNativeComposer';
import type { NativeComposeFunctionsClient } from '../../../src/vnext/ai-catalog/native-compose-client';
import { clearByokCredential } from '../../../src/vnext/ai-catalog/byok-session';
import { buildAssistantArsenalAiIndex, type AssistantArsenal } from '../../../src/vnext/arsenal/assistant-arsenal';
import { routerDocument, routerPresets } from '../arsenal/arsenal-ia-fixtures';

/**
 * Onda 4.5 mounted in the assistant: simple requests are answered from the arsenal or by the editor's own actions
 * WITHOUT the AI (zero calls); "Pedir à IA" sends the same request once; the AI may point at a preset of the short
 * index it received; what the AI built can be kept with "Guardar no arsenal?".
 */
beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { cleanup(); localStorage.clear(); clearByokCredential(); vi.restoreAllMocks(); });
afterAll(() => vi.unstubAllGlobals());

const STORAGE_ID = '8d6f3c1e-2b4a-4c7d-9e0f-1a2b3c4d5e6f';
const ALL_TASKS = ['compose_scaffold', 'revise_selected_text', 'edit_intent'];
type Body = { task: string; message?: string; history?: unknown[]; arsenal?: { ref: string; name: string }[] };
const pagesPlan = {
  version: 1, status: 'proposal', summary: 'Uma página de contato.',
  pages: [{ type: 'section', heading: 'Contato PRESYS', subtitle: 'Fale com a equipe de vendas' }],
};

function make(options: { replies?: unknown[]; features?: string[]; client?: boolean; arsenal?: boolean; selected?: string[] } = {}) {
  const document = routerDocument();
  const session = createDocumentSession(document, { createId: () => crypto.randomUUID(), templateRegistry: createPresysArchetypeTemplateRegistry() });
  const activePageId = document.pages[0].id;
  const replies = [...(options.replies ?? [pagesPlan])];
  const invoke = vi.fn(async (_name: string, { body }: { body: Body }) => {
    if (body.task === 'status') {
      return { data: { code: 'OK', status: { enabled: true, mode: 'bounded-acceptance', serverKey: true, byok: false,
        remainingMicrousd: null, callReserveMicrousd: 7800, tasks: ALL_TASKS, ...(options.features ? { features: options.features } : {}) } }, error: null };
    }
    return { data: { reply: replies.shift() }, error: null };
  });
  const presets = routerPresets();
  const arsenal: AssistantArsenal = {
    presets,
    use: vi.fn(async (presetId: string, context) => ({ ok: true as const, pageId: context.activePageId ?? activePageId, objectIds: [], newPage: false,
      text: `Usei “${presets.find(preset => preset.id === presetId)?.name}” do arsenal na página 1, sem usar IA. Um Desfazer volta tudo.` })),
    save: vi.fn(async (request) => ({ ok: true as const, presetId: '77777777-7777-4777-8777-777777777777',
      text: `Guardei “${request.name}” no arsenal, em Páginas. Toda a equipe já pode usar, sem gastar IA.` })),
    openGallery: vi.fn(),
  };
  const client = options.client === false ? undefined : { functions: { invoke } } as unknown as NativeComposeFunctionsClient;
  render(<CatalogNativeComposer documentId={STORAGE_ID} session={session} ownerScope="user:arsenal" client={client}
    activePageId={activePageId} onBeforeMutation={() => true} {...(options.arsenal === false ? {} : { arsenal })}
    selectedObjectIds={options.selected} />);
  const tasksSent = () => invoke.mock.calls.map(([, { body }]) => body.task).filter(task => task !== 'status');
  const bodies = (task: string) => invoke.mock.calls.map(([, { body }]) => body).filter(body => body.task === task);
  return { session, document, invoke, tasksSent, bodies, arsenal, presets };
}
function send(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar ao Gemini' }));
}
const arsenalCard = () => screen.findByRole('group', { name: 'Arsenal, sem usar IA' });
const log = () => screen.getByRole('log', { name: 'Conversa com o assistente' });
const userTurns = (text: string) => within(log()).getAllByText(text).filter(node => node.closest('.ai-chat-user'));

describe('answered without the AI (Onda 4.5)', () => {
  it('"bota uma tabela com 5 linhas": a card, zero AI calls; Aplicar adds the table as one Desfazer', async () => {
    const f = make();
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    const before = structuredClone(f.session.getSnapshot().document);
    send('bota uma tabela com 5 linhas');
    const card = await arsenalCard();
    expect(within(card).getByRole('heading', { name: 'Posso fazer isto sem usar IA' })).toBeInTheDocument();
    expect(card).toHaveTextContent('Tabela nova de 5 linhas × 3 colunas');
    expect(f.tasksSent()).toEqual([]);
    expect(f.session.getSnapshot().document).toEqual(before);
    fireEvent.click(within(card).getByRole('button', { name: 'Aplicar' }));
    const tables = f.session.getSnapshot().document.pages[0].objects.filter(object => object.type === 'table');
    expect(tables).toHaveLength(2);
    expect(log()).toHaveTextContent('Fiz sem usar IA');
    expect(screen.queryByRole('group', { name: 'Arsenal, sem usar IA' })).toBeNull();
    fireEvent.click(within(log()).getByRole('button', { name: 'Desfazer' }));
    expect(f.session.getSnapshot().document).toEqual(before);
    expect(f.tasksSent()).toEqual([]);
  });

  it('works with no AI on this screen at all', async () => {
    const f = make({ client: false });
    send('nova página de acessórios');
    const card = await arsenalCard();
    expect(card).toHaveTextContent('Página-modelo P7: Fornecimento padrão e acessórios');
    expect(within(card).queryByRole('button', { name: 'Pedir à IA' })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Aplicar' }));
    expect(f.session.getSnapshot().document.pages).toHaveLength(3);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('"insere o cabeçalho padrão": found in the arsenal; Usar inserts it through the arsenal, no AI', async () => {
    const f = make();
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    send('insere o cabeçalho padrão');
    const card = await arsenalCard();
    expect(within(card).getByRole('heading', { name: 'Achei no arsenal, sem usar IA' })).toBeInTheDocument();
    expect(card).toHaveTextContent('Cabeçalho padrão');
    expect(card).toHaveTextContent('guardado por Ana Autora');
    fireEvent.click(within(card).getByRole('button', { name: 'Usar' }));
    await waitFor(() => expect(log()).toHaveTextContent('Usei “Cabeçalho padrão” do arsenal na página 1, sem usar IA.'));
    expect(f.arsenal.use).toHaveBeenCalledWith(f.presets[0].id, expect.objectContaining({ activePageId: f.document.pages[0].id, selectedObjectIds: [] }));
    expect(f.tasksSent()).toEqual([]);
  });

  it('"Ver outros" lists the other headers and opens the arsenal filtered by the request', async () => {
    const f = make();
    send('põe o cabeçalho');
    const card = await arsenalCard();
    fireEvent.click(within(card).getByRole('button', { name: 'Ver outros' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Usar Cabeçalho azul' }));
    await waitFor(() => expect(f.arsenal.use).toHaveBeenCalledWith(f.presets[1].id, expect.anything()));
    send('põe o cabeçalho');
    const again = await arsenalCard();
    fireEvent.click(within(again).getByRole('button', { name: 'Ver outros' }));
    fireEvent.click(within(again).getByRole('button', { name: 'Abrir o arsenal' }));
    expect(f.arsenal.openGallery).toHaveBeenCalledWith('põe o cabeçalho');
  });

  it('"aumenta o título": the "Vou fazer isto" card of the conversation, made here; Aplicar = one Desfazer', async () => {
    const f = make();
    send('aumenta o título');
    const card = await screen.findByRole('group', { name: 'Mudanças pedidas na conversa' });
    expect(card).toHaveTextContent('Aumentar a letra, sem usar IA.');
    expect(card).toHaveTextContent('28 pt');
    expect(f.tasksSent()).toEqual([]);
    fireEvent.click(within(card).getByRole('button', { name: 'Aplicar' }));
    const title = f.session.getSnapshot().document.pages[0].objects.find(object => object.id === 'title');
    expect(title?.type === 'text' && title.style.fontSizePt).toBe(33.5);
  });
});

describe('the selection on the page', () => {
  it('"pinta de vermelho" with the band selected: changed without the AI, as one Desfazer', async () => {
    const f = make({ selected: ['band'] });
    send('pinta de vermelho');
    const card = await screen.findByRole('group', { name: 'Mudanças pedidas na conversa' });
    expect(card).toHaveTextContent('Mudar a cor para vermelho');
    fireEvent.click(within(card).getByRole('button', { name: 'Aplicar' }));
    const band = f.session.getSnapshot().document.pages[0].objects.find(object => object.id === 'band');
    expect(band?.type === 'shape' && band.style.fill).toBe('#C62828');
    expect(f.tasksSent()).toEqual([]);
  });
});

describe('the AI and the arsenal', () => {
  it('"Pedir à IA" sends the same request once, with the short index; the AI may answer "use preset"', async () => {
    const f = make({ features: ['arsenal_index'], replies: [{ status: 'use_preset', preset: 'a1', summary: 'Vou usar o Cabeçalho padrão.' }] });
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    send('insere o cabeçalho padrão');
    fireEvent.click(within(await arsenalCard()).getByRole('button', { name: 'Pedir à IA' }));
    const card = await screen.findByRole('heading', { name: 'A IA achou no arsenal' });
    expect(f.tasksSent()).toEqual(['compose_scaffold']);
    const body = f.bodies('compose_scaffold')[0];
    expect(body.message).toBe('insere o cabeçalho padrão');
    expect(body.arsenal?.map(entry => entry.ref)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']);
    expect(JSON.stringify(body.arsenal)).not.toContain(f.presets[0].id);
    // The request is not stored twice and does not travel as its own history.
    expect(userTurns('insere o cabeçalho padrão')).toHaveLength(1);
    expect(body.history).toEqual([]);
    expect(log()).toHaveTextContent('Vou usar o Cabeçalho padrão. Usar não gasta IA.');
    fireEvent.click(within(card.closest('[role="group"]') as HTMLElement).getByRole('button', { name: 'Usar' }));
    await waitFor(() => expect(f.arsenal.use).toHaveBeenCalledWith(f.presets[0].id, expect.anything()));
    expect(f.tasksSent()).toEqual(['compose_scaffold']);
  });

  it('the conversation that edits gets the index too and may point at a preset', async () => {
    // The ref the screen gives "Cabeçalho azul" in its index (categories take turns in the index).
    const blueHeader = buildAssistantArsenalAiIndex(routerPresets()).entries.find(entry => entry.name === 'Cabeçalho azul')!.ref;
    const f = make({ features: ['arsenal_index'], replies: [{ status: 'use_preset', preset: blueHeader }] });
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    send('troque o cabeçalho pelo azul que guardamos');
    await screen.findByRole('heading', { name: 'A IA achou no arsenal' });
    expect(f.tasksSent()).toEqual(['edit_intent']);
    expect(f.bodies('edit_intent')[0].arsenal).toHaveLength(8);
    expect(log()).toHaveTextContent('Achei no arsenal: “Cabeçalho azul”. Usar não gasta IA.');
  });

  it('a ref the screen did not send is refused; an older server gets no index', async () => {
    make({ features: ['arsenal_index'], replies: [{ status: 'use_preset', preset: 'a40' }] });
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    send('troque o cabeçalho pelo azul que guardamos');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('A IA respondeu de um jeito que não pôde ser usado.'));
    expect(screen.queryByRole('heading', { name: 'A IA achou no arsenal' })).toBeNull();
    cleanup();
    const older = make({ replies: [pagesPlan] });
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    send('Crie uma página de contato');
    await screen.findByRole('group', { name: 'Proposta de páginas' });
    expect('arsenal' in older.bodies('compose_scaffold')[0]).toBe(false);
  });

  it('after pages built by the AI are applied, it offers "Guardar no arsenal?" with name and category', async () => {
    const f = make({ features: ['arsenal_index'] });
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    send('Crie uma página de contato');
    const proposal = await screen.findByRole('group', { name: 'Proposta de páginas' });
    expect(f.tasksSent()).toEqual(['compose_scaffold']);
    fireEvent.click(within(proposal).getByRole('button', { name: 'Aplicar' }));
    // The offer is a link in the "Apliquei…" message (no card yet): the conversation keeps its messages in view.
    await waitFor(() => expect(log()).toHaveTextContent('Apliquei 1 página(s)'));
    const applied = within(log()).getByText(/^Apliquei 1 página\(s\)/).closest('article')!;
    expect(within(applied).getByRole('button', { name: 'Desfazer' })).toBeInTheDocument();
    const link = within(applied).getByRole('button', { name: 'Guardar no arsenal…' });
    expect(screen.queryByRole('group', { name: 'Guardar no arsenal' })).toBeNull();
    fireEvent.click(link);
    const offer = await screen.findByRole('group', { name: 'Guardar no arsenal' });
    expect(within(applied).queryByRole('button', { name: 'Guardar no arsenal…' })).toBeNull();
    expect(within(offer).getByRole('textbox', { name: 'Nome' })).toHaveFocus();
    expect(within(offer).getByRole('textbox', { name: 'Nome' })).toHaveValue('Contato PRESYS');
    expect(within(offer).getByRole('combobox', { name: 'Categoria' })).toHaveValue('paginas');
    fireEvent.change(within(offer).getByRole('textbox', { name: 'Nome' }), { target: { value: 'Página de contato' } });
    fireEvent.click(within(offer).getByRole('button', { name: 'Guardar no arsenal' }));
    await waitFor(() => expect(log()).toHaveTextContent('Guardei “Página de contato” no arsenal, em Páginas.'));
    // The composer adds its pages at the end of the catalog.
    const newPage = f.session.getSnapshot().document.pages.at(-1)!;
    expect(f.arsenal.save).toHaveBeenCalledWith(expect.objectContaining({ pageId: newPage.id, name: 'Página de contato', category: 'paginas' }));
    expect(screen.queryByRole('group', { name: 'Guardar no arsenal' })).toBeNull();
    // Saving never calls the AI.
    expect(f.tasksSent()).toEqual(['compose_scaffold']);
  });

  it('without the arsenal the router still answers simple actions, and nothing offers to save', async () => {
    const f = make({ arsenal: false, features: ['arsenal_index'] });
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    send('insere o cabeçalho padrão');
    await screen.findByRole('group', { name: 'Proposta de páginas' });
    expect('arsenal' in f.bodies('compose_scaffold')[0]).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.queryByRole('group', { name: 'Guardar no arsenal' })).toBeNull();
    send('insere uma tabela');
    expect(await arsenalCard()).toHaveTextContent('Tabela nova de 6 linhas × 3 colunas');
  });
});

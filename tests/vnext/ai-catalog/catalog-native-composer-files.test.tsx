import { webcrypto } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '../../../src/vnext/application';
import { CatalogNativeComposer } from '../../../src/vnext/ai-catalog/CatalogNativeComposer';
import type { NativeComposeFunctionsClient } from '../../../src/vnext/ai-catalog/native-compose-client';
import type { NativeComposePlan } from '../../../src/vnext/ai-catalog/native-compose';
import { clearByokCredential } from '../../../src/vnext/ai-catalog/byok-session';
import { DROP_ZONE_TEXT } from '../../../src/vnext/ai-catalog/intake/SourceDropZone';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { cleanup(); localStorage.clear(); clearByokCredential(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(() => vi.unstubAllGlobals());

const id = () => crypto.randomUUID();
const plan = (heading: string): NativeComposePlan => ({
  version: 1, status: 'proposal', summary: `Proposta: ${heading}.`,
  pages: [{ type: 'cover', heading, subtitle: 'Criação nativa no catálogo aberto' }],
});
const status = (overrides: Record<string, unknown> = {}) => ({ data: { code: 'OK', status: { enabled: true, mode: 'bounded-acceptance',
  serverKey: true, byok: false, remainingMicrousd: null, callReserveMicrousd: 7800, ...overrides } }, error: null });
const httpFailure = (code: number, body: unknown) => {
  const response = { status: code, clone() { return this; }, json: async () => body };
  return { data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'),
    { name: 'FunctionsHttpError', context: response }), response };
};
type Body = { task: string };
function make(generate: () => Promise<unknown>, statusReply: unknown = status(), props: Record<string, unknown> = {}) {
  const doc = createCatalogDocument(id, 'Novo catálogo');
  const session = createDocumentSession(doc, { createId: id });
  const invoke = vi.fn(async (_name: string, options: { body: Body }) => options.body.task === 'status' ? statusReply : generate());
  const client = { functions: { invoke } } as unknown as NativeComposeFunctionsClient;
  render(<CatalogNativeComposer documentId={doc.id} session={session} ownerScope="user:01" client={client}
    onBeforeMutation={() => true} {...props} />);
  return { doc, session };
}
async function send(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Enviar ao Gemini/ }));
}

describe('FR-64 the assistant takes files', () => {
  it('shows the drop zone above the conversation and says the files stay on this computer', () => {
    make(async () => ({ data: { reply: plan('Capa') }, error: null }));
    const section = screen.getByRole('region', { name: 'Assistente de criação do catálogo' });
    expect(section).toContainElement(screen.getByRole('button', { name: DROP_ZONE_TEXT }));
    expect(screen.getByRole('region', { name: 'Arquivos para o catálogo' })).toBeInTheDocument();
    expect(screen.getByText(/Os arquivos soltos acima são lidos aqui no computador e não vão para a IA/)).toBeInTheDocument();
    expect(screen.queryByText(/Ela não lê PDFs/)).toBeNull();
  });
});

describe('Onda 1 (1B) leftovers in the composer', () => {
  it('a new request keeps the earlier proposal until its answer arrives; after a failure it can still be applied', async () => {
    let turn = 0;
    const f = make(async () => (++turn === 1
      ? { data: { reply: plan('Capa do TA-25N') }, error: null }
      : httpFailure(503, { code: 'PROVIDER_UNAVAILABLE' })));
    await send('Crie uma capa para o TA-25N.');
    await waitFor(() => expect(screen.getByRole('group', { name: 'Proposta de páginas' })).toHaveTextContent('Capa do TA-25N'));
    await send('Agora crie uma página de especificações.');
    // While the new request runs, the proposal stays on screen (and cannot be applied twice meanwhile).
    expect(screen.getByRole('group', { name: 'Proposta de páginas' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('O serviço de IA não respondeu agora.'));
    expect(screen.getByRole('group', { name: 'Proposta de páginas' })).toHaveTextContent('Capa do TA-25N');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e inserir no catálogo' }));
    await waitFor(() => expect(f.session.getSnapshot().document.pages[0].objects.length).toBeGreaterThan(0));
    expect(screen.queryByRole('group', { name: 'Proposta de páginas' })).toBeNull();
  });

  it('a new proposal replaces the earlier one', async () => {
    let turn = 0;
    make(async () => ({ data: { reply: plan(++turn === 1 ? 'Primeira capa' : 'Segunda capa') }, error: null }));
    await send('Crie uma capa.');
    await waitFor(() => expect(screen.getByRole('group', { name: 'Proposta de páginas' })).toHaveTextContent('Primeira capa'));
    await send('Faça outra capa.');
    await waitFor(() => expect(screen.getByRole('group', { name: 'Proposta de páginas' })).toHaveTextContent('Segunda capa'));
    expect(screen.getAllByRole('group', { name: 'Proposta de páginas' })).toHaveLength(1);
  });

  it('PROVIDER_NOT_CONFIGURED names "Avançado" only where a personal key can be used', async () => {
    make(async () => httpFailure(503, { code: 'PROVIDER_NOT_CONFIGURED' }), status({ byok: false }));
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    await send('Crie uma capa.');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      'A IA do servidor ainda não foi configurada. Fale com o administrador. Enquanto isso, continue editando à mão. O catálogo não foi alterado.'));
    expect(screen.getByRole('alert')).not.toHaveTextContent('Avançado');
    cleanup();
    make(async () => httpFailure(503, { code: 'PROVIDER_NOT_CONFIGURED' }), status({ byok: true }));
    await waitFor(() => expect(screen.getByText('IA pronta.')).toBeInTheDocument());
    await send('Crie uma capa.');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('“Avançado (chave própria)”'));
    expect(screen.getByRole('button', { name: 'Avançado (chave própria)' })).toBeInTheDocument();
  });

  it('the readiness line says the server AI is not configured without pointing to a missing "Avançado"', async () => {
    make(async () => ({ data: { reply: plan('Capa') }, error: null }), status({ serverKey: false, byok: false }));
    await waitFor(() => expect(screen.getByText(/A IA do servidor ainda não foi configurada/)).toBeInTheDocument());
    expect(screen.getByText(/A IA do servidor ainda não foi configurada/)).not.toHaveTextContent('Avançado');
    expect(screen.queryByRole('button', { name: 'Avançado (chave própria)' })).toBeNull();
  });
});

describe('FR-03 the JSON manifest is not on the father\'s screen', () => {
  const selectedTable = { pageId: 'page-1', objectId: 'table-1' };
  it('the published app (not the dev server) has no "Manifesto" field even with a table selected', () => {
    vi.stubEnv('DEV', false);
    make(async () => ({ data: { reply: plan('Capa') }, error: null }), status(), { selectedTable });
    expect(screen.queryByText('Preencher tabela com PDFs (revisão técnica)')).toBeNull();
    expect(screen.queryByLabelText('Manifesto das fontes PDF')).toBeNull();
  });
  it('the technical review stays available where it is asked for (dev server and browser proofs)', () => {
    make(async () => ({ data: { reply: plan('Capa') }, error: null }), status(), { selectedTable, technicalPdfReview: true });
    expect(screen.getByText('Preencher tabela com PDFs (revisão técnica)')).toBeInTheDocument();
  });
});

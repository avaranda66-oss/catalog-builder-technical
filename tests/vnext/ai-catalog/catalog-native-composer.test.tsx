import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, afterEach, afterAll, describe, it, expect, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '../../../src/vnext/application';
import { CatalogNativeComposer } from '../../../src/vnext/ai-catalog/CatalogNativeComposer';
import type { NativeComposeFunctionsClient } from '../../../src/vnext/ai-catalog/native-compose-client';
import type { NativeComposePlan } from '../../../src/vnext/ai-catalog/native-compose';
import { clearByokCredential } from '../../../src/vnext/ai-catalog/byok-session';

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
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar e inserir no catálogo' })).toBeInTheDocument());
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
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e inserir no catálogo' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e inserir no catálogo' }));
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
  it('uses a personal key only from "Avançado", keeps it after the panel closes, and can go back to the server key', async () => {
    const f = make();
    fireEvent.click(screen.getByRole('button', { name: 'Avançado (chave própria)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear chave de teste' }));
    expect(screen.getByText('IA pronta, usando a sua chave própria nesta aba.')).toBeInTheDocument();
    await sendAndWaitProposal();
    expect(f.generationCalls()[0][1].body.credential).toEqual({ provider: 'gemini', apiKey: 'temporary-test-only-key' });
    expect(JSON.stringify(localStorage)).not.toContain('temporary-test-only-key');
    // Closing the assistant panel unmounts the composer; the unlocked key survives.
    f.ui.unmount();
    render(f.element);
    expect(screen.getByRole('button', { name: 'Voltar a usar a IA do servidor' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar a usar a IA do servidor' }));
    await send('Crie mais uma página de apresentação para o catálogo.');
    await waitFor(() => expect(f.generationCalls()).toHaveLength(2));
    expect(f.generationCalls()[1][1].body).not.toHaveProperty('credential');
  });
});

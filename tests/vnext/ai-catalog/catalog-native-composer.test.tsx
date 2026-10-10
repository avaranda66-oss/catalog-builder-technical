import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, afterEach, afterAll, describe, it, expect, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '../../../src/vnext/application';
import { CatalogNativeComposer } from '../../../src/vnext/ai-catalog/CatalogNativeComposer';
import type { NativeComposeFunctionsClient } from '../../../src/vnext/ai-catalog/native-compose-client';
import type { NativeComposePlan } from '../../../src/vnext/ai-catalog/native-compose';

vi.mock('../../../src/vnext/ai-catalog/ProviderCredentialsSettings', () => ({
  ProviderCredentialsSettings: ({ onUnlock }: {
    onUnlock: (provider: 'gemini', key: string) => void;
  }) => <button type="button" onClick={() => onUnlock('gemini', 'temporary-test-only-key')}>Desbloquear chave de teste</button>,
}));
beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
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
const id = () => crypto.randomUUID();
const make = (reply: unknown = plan) => {
  const doc = createCatalogDocument(id, 'Novo catálogo');
  const session = createDocumentSession(doc, { createId: id });
  const invoke = vi.fn(async (_name: string, _options: unknown) => ({
    data: { reply }, error: null,
  }));
  const client = { functions: { invoke } } as NativeComposeFunctionsClient;
  const ui = render(<CatalogNativeComposer documentId={doc.id} session={session}
    ownerScope="user:01" client={client} onBeforeMutation={() => true} />);
  return { doc, session, invoke, ui };
};
async function connectAndSend() {
  fireEvent.click(screen.getByRole('button', { name: 'Conectar Gemini' }));
  fireEvent.click(screen.getByRole('button', { name: 'Desbloquear chave de teste' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), {
    target: { value: 'Crie um catálogo com capa e tabela comparativa profissional.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Enviar ao Gemini/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar e inserir no catálogo' })).toBeInTheDocument());
}

describe('Gemini conversational creation, confirmation and native editor action boundary', () => {
  it('proposes via authenticated Edge adapter and inserts two native pages only after approval', async () => {
    const f = make();
    const baseline = structuredClone(f.session.getSnapshot().document);
    await connectAndSend();
    expect(f.session.getSnapshot().document).toEqual(baseline);
    expect(screen.getByText(/Comparação de modelos/)).toBeInTheDocument();
    expect(screen.getByText(/Ficha técnica: 3 colunas/)).toBeInTheDocument();
    expect(f.invoke).toHaveBeenCalledTimes(1);
    const [name, options] = f.invoke.mock.calls[0];
    expect(name).toBe('vnext-catalog-composer');
    expect(JSON.stringify(options)).toContain('compose_scaffold');
    expect(JSON.stringify(options)).toContain('temporary-test-only-key');
    expect(localStorage.getItem('temporary-test-only-key')).toBeNull();
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
    await connectAndSend();
    act(() => { expect(f.session.execute({ type: 'page.add' }).ok).toBe(true); });
    const before = structuredClone(f.session.getSnapshot().document);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e inserir no catálogo' }));
    expect(f.session.getSnapshot().document).toEqual(before);
    expect(screen.getByRole('alert')).toHaveTextContent('desatualizada');
  });
  it('refuses arbitrary provider actions and preserves the document', async () => {
    const malicious = { ...plan, extra: { shell: 'run arbitrary code' } };
    const f = make(malicious);
    fireEvent.click(screen.getByRole('button', { name: 'Conectar Gemini' }));
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear chave de teste' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), {
      target: { value: 'Crie um catálogo institucional técnico.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enviar ao Gemini/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível consultar'));
    expect(f.session.getSnapshot().document).toEqual(f.doc);
  });
  it('supports a multi-turn clarification instead of always producing a fake PDF', async () => {
    const f = make({ status: 'clarification', question: 'Quais modelos devem aparecer na tabela comparativa?' });
    fireEvent.click(screen.getByRole('button', { name: 'Conectar Gemini' }));
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear chave de teste' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), {
      target: { value: 'Crie um catálogo complexo de produtos.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enviar ao Gemini/ }));
    await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('Quais modelos devem aparecer'));
    expect(f.session.getSnapshot().document.pages).toHaveLength(1);
  });
});

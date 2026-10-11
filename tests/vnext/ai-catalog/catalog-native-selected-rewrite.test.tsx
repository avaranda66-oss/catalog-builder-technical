import { webcrypto } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '../../../src/vnext/application';
import { createInsertSpec } from '../../../src/vnext/app/editor-defaults';
import { CatalogNativeComposer } from '../../../src/vnext/ai-catalog/CatalogNativeComposer';
import type { NativeComposeFunctionsClient } from '../../../src/vnext/ai-catalog/native-compose-client';

vi.mock('../../../src/vnext/ai-catalog/ProviderCredentialsSettings', () => ({
  ProviderCredentialsSettings: ({ onUnlock }: {
    onUnlock: (provider: 'gemini', key: string) => void;
  }) => <button type="button" onClick={() => onUnlock('gemini', 'fake-temporary-test-key')}>Autorizar Gemini de teste</button>,
}));
beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
afterAll(() => vi.unstubAllGlobals());
const id = () => crypto.randomUUID();
function setup() {
  const doc = createCatalogDocument(id, 'Catálogo para revisão');
  const session = createDocumentSession(doc, { createId: id });
  expect(session.execute({ type:'object.insert', pageId:doc.pages[0].id,
    object: createInsertSpec('text', doc.pages[0]) }).ok).toBe(true);
  const object = session.getSnapshot().document.pages[0].objects[0];
  if (!object || object.type !== 'text') throw new Error('NO_TEXT');
  const selected = { objectId: object.id, text: structuredClone(object.text) };
  const invoke = vi.fn(async (_name: string, options: any) => ({
    data: { reply: options.body.task === 'revise_selected_text'
      ? {status:'proposal', revisedText:'Apresentação institucional dos instrumentos'}
      : {status:'clarification', question:'Qual é a finalidade da nova seção?' } },
    error: null,
  }));
  const ui = render(<CatalogNativeComposer session={session} documentId={doc.id}
    ownerScope="user:editor" selected={selected}
    client={{ functions: { invoke } } as NativeComposeFunctionsClient}
    onBeforeMutation={() => true} />);
  return { session, selected, invoke, ui, doc };
}
async function requestRewrite() {
  fireEvent.click(screen.getByRole('button', { name: 'Conectar Gemini' }));
  fireEvent.click(screen.getByRole('button', { name: 'Autorizar Gemini de teste' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reescrever este texto com Gemini' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Como deseja reescrever o texto selecionado?' }), {
    target: { value: 'Reescreva esta frase em linguagem institucional mais clara.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Pedir reescrita ao Gemini/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar reescrita selecionada' })).toBeInTheDocument());
}
describe('Selected-text Gemini editing in the same conversation and canonical document', () => {
  it('shows before/after and changes the selected text only after explicit approval', async () => {
    const f=setup();
    const original=structuredClone(f.session.getSnapshot().document);
    await requestRewrite();
    expect(f.session.getSnapshot().document).toEqual(original);
    expect(screen.getByRole('group', { name:'Revisão de texto selecionado' }))
      .toHaveTextContent('Novo texto');
    expect(screen.getByRole('group', { name:'Revisão de texto selecionado' }))
      .toHaveTextContent('Apresentação institucional dos instrumentos');
    const [name, request] = f.invoke.mock.calls[0];
    expect(name).toBe('vnext-catalog-composer');
    expect(request.body.task).toBe('revise_selected_text');
    expect(request.body.target.objectId).toBe(f.selected.objectId);
    expect(JSON.stringify(request.body)).not.toContain('schemaVersion');
    fireEvent.click(screen.getByRole('button', {name:'Confirmar reescrita selecionada'}));
    const changed=f.session.getSnapshot().document;
    expect(changed).not.toEqual(original);
    const text=changed.pages[0].objects[0];
    expect(text.type).toBe('text');
    if (text.type !== 'text') throw new Error('NOT_TEXT');
    expect(text.text.paragraphs[0].inlines[0]).toMatchObject({ text:'Apresentação institucional dos instrumentos' });
    expect(f.session.undo().ok).toBe(true);
    expect(f.session.getSnapshot().document).toEqual(original);
    expect(JSON.stringify(localStorage)).not.toContain('fake-temporary-test-key');
  });
  it('blocks revision-stale approval without partial change', async () => {
    const f=setup();
    await requestRewrite();
    expect(f.session.execute({type:'page.add'}).ok).toBe(true);
    const before=structuredClone(f.session.getSnapshot().document);
    fireEvent.click(screen.getByRole('button', {name:'Confirmar reescrita selecionada'}));
    expect(f.session.getSnapshot().document).toEqual(before);
    expect(screen.getByRole('alert')).toHaveTextContent('Nenhuma reescrita foi aprovada');
  });
});

import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CatalogWorkbenchChat } from '../../../src/vnext/ai-catalog/CatalogWorkbenchChat';
import { createDocumentSession } from '../../../src/vnext/application';
import { createSyntheticSpecifications } from '../../../src/vnext/ai-catalog/fixture';
import { compileCatalog } from '../../../src/vnext/ai-catalog/composition';
import { readWorkbenchDialogue } from '../../../src/vnext/ai-catalog/workbench-dialogue';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
afterAll(() => vi.unstubAllGlobals());
async function setup(canPublish = false) {
  const generated = await compileCatalog(await createSyntheticSpecifications());
  const session = createDocumentSession(generated.document, { createId: () => crypto.randomUUID() });
  const onPublication = vi.fn(), onEditor = vi.fn();
  const element = <CatalogWorkbenchChat documentId={generated.document.id} session={session}
    canPublish={canPublish} onPublication={onPublication} onEditor={onEditor} />;
  const view = render(element);
  return { generated, session, view, element, onPublication, onEditor };
}
function send(message: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Peça uma alteração' }), { target: { value: message } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar pedido seguro' }));
}
describe('side-by-side live A4 editing with an extended persistent chat', () => {
  it('applies compact layout immediately, then undo/redo without technical value loss', async () => {
    const { generated, session } = await setup();
    const before = session.getSnapshot().document;
    send('Deixe as tabelas mais compactas');
    expect(session.getSnapshot().document).not.toEqual(before);
    expect(screen.getByRole('log', { name: 'Histórico do catálogo' }).textContent).toContain('Apliquei uma alteração reversível');
    send('desfaça');
    expect(session.getSnapshot().document).toEqual(before);
    send('refaça');
    expect(session.getSnapshot().document).not.toEqual(before);
    expect(readWorkbenchDialogue(localStorage, generated.document.id)).toHaveLength(6);
  });
  it('reopens medium-length conversations in the original document and isolates another', async () => {
    const { generated, view, element } = await setup();
    for (let i = 0; i < 24; i++) send('Posso trocar um número para ' + i + '?');
    expect(readWorkbenchDialogue(localStorage, generated.document.id)).toHaveLength(48);
    view.unmount();
    render(element);
    expect(screen.getByRole('log', { name: 'Histórico do catálogo' }).textContent).toContain('Posso trocar um número para 23?');
    expect(screen.getByLabelText('Quantidade de mensagens').textContent).toBe('48');
  });
  it('refuses unsupported engineering modifications and does not publish unsaved edits', async () => {
    const { session, onPublication } = await setup(false);
    const before = session.getSnapshot().document;
    send('Altere a exatidão de corrente para 0,001% FS');
    expect(session.getSnapshot().document).toEqual(before);
    send('Revisar publicação PDF');
    expect(onPublication).not.toHaveBeenCalled();
    expect(screen.getByRole('log').textContent).toContain('Primeiro confira e salve');
  });
  it('opens publication on saved catalog and provides editor action', async () => {
    const { onPublication, onEditor } = await setup(true);
    send('Revisar publicação PDF');
    send('Abra o editor');
    expect(onPublication).toHaveBeenCalledTimes(1);
    expect(onEditor).toHaveBeenCalledTimes(1);
  });
  it('accepts reference PNG but never claims Gemini used or edited it', async () => {
    await setup();
    const image = new File([new Uint8Array([137, 80, 78, 71])], 'modelo-referencia.png', { type: 'image/png' });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn() });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-reference');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const upload = screen.getByLabelText('Anexar imagens de referência') as HTMLInputElement;
    await act(async () => { fireEvent.change(upload, { target: { files: [image] } }); });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByAltText('Referência: modelo-referencia.png')).toBeInTheDocument();
    expect(screen.getByRole('log').textContent).toContain('ainda NÃO foram interpretadas pelo Gemini');
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});

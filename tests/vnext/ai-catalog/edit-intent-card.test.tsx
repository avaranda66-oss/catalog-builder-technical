import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDocumentSession, type DocumentSession } from '../../../src/vnext/application';
import type { CatalogDocument } from '../../../src/vnext/domain';
import { EditIntentCard } from '../../../src/vnext/ai-catalog/EditIntentCard';
import { editIntentGateway, type NativeComposeFunctionsClient } from '../../../src/vnext/ai-catalog/native-compose-client';
import { useEditIntent, type EditIntentAnswer } from '../../../src/vnext/ai-catalog/useEditIntent';
import type { EditIntentRequest } from '../../../src/vnext/ai-catalog/edit-intents';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => cleanup());
afterAll(() => vi.unstubAllGlobals());

const PCON = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/examples/presys-capa-pcon-hibrido.catalog.json'), 'utf8')) as CatalogDocument;
const titleText = (session: DocumentSession) => {
  const object = session.getSnapshot().document.pages[0].objects.find(entry => entry.id === 'capa-pcon-hibrido-titulo');
  return object?.type === 'text' ? object.text.paragraphs[0].inlines.map(inline => inline.kind === 'text' ? inline.text : '').join('') : '';
};

/** A minimal assistant: one box, the card, and what the assistant says. */
function Harness({ session, client }: { session: DocumentSession; client: NativeComposeFunctionsClient }) {
  const gateway = React.useMemo(() => editIntentGateway(client), [client]);
  const edit = useEditIntent({ session, gateway });
  const [said, setSaid] = React.useState<string[]>([]);
  const say = (text: string) => setSaid(current => [...current, text]);
  return <div>
    <button type="button" onClick={() => { void edit.ask('Troque o título da capa para PCON-Y18 e o subtítulo para 0 a 999 psi.')
      .then((answer: EditIntentAnswer) => say(answer.text)); }}>Pedir</button>
    {edit.plan && <EditIntentCard plan={edit.plan} busy={edit.busy}
      onApply={() => say(edit.apply().text)} onAdjust={() => say('ajustar')} onDiscard={edit.discard} />}
    <ul>{said.map((text, index) => <li key={index}>{text}</li>)}</ul>
  </div>;
}

describe('EditIntentCard + useEditIntent (FR-72)', () => {
  it('shows "Vou fazer isto", highlights digits from the chat, lists what was refused, applies as one Desfazer', async () => {
    const session = createDocumentSession(structuredClone(PCON), { createId: () => crypto.randomUUID() });
    const before = structuredClone(session.getSnapshot().document);
    let sent: EditIntentRequest | undefined;
    const client: NativeComposeFunctionsClient = { functions: { invoke: vi.fn(async (_name, options) => {
      sent = options.body as EditIntentRequest;
      const ref = (suffix: string) => sent!.outline.pages[0].detail!.find(object => object.hint === suffix)!.ref;
      return { data: { reply: { status: 'proposal', summary: 'Vou trocar o título da capa.', intents: [
        { kind: 'set_text', target: ref('titulo'), text: 'PCON-Y18' },
        // A server that let it through: the browser refuses it again (999 was typed, 9999 was not).
        { kind: 'set_text', target: ref('subtitulo'), text: '0 a 9999 psi' },
      ], blocked: [] } }, error: null };
    }) } };
    render(<Harness session={session} client={client} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pedir' })); });
    expect(sent?.task).toBe('edit_intent');
    const card = await screen.findByRole('group', { name: 'Mudanças pedidas na conversa' });
    expect(card.textContent).toContain('Vou fazer isto');
    expect(card.textContent).toContain('Trocar o texto · Texto “PCON HÍBRIDO”');
    expect(card.querySelector('mark')?.textContent).toBe('18');
    expect(card.textContent).toContain('Isto eu não vou fazer:');
    expect(card.textContent).toContain('Valores técnicos só entram conferidos');
    expect(screen.getByText(/Confira o cartão antes de aplicar; uma parte eu não vou fazer/)).toBeTruthy();
    expect(titleText(session)).toBe('PCON HÍBRIDO');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Aplicar' })); });
    expect(titleText(session)).toBe('PCON-Y18');
    expect(screen.getByText(/Apliquei a mudança\. Um Desfazer volta tudo/)).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Mudanças pedidas na conversa' })).toBeNull();
    act(() => { session.undo(); });
    expect(session.getSnapshot().document).toEqual(before);
  });
  it('drops the card when the catalog changes before Aplicar', async () => {
    const session = createDocumentSession(structuredClone(PCON), { createId: () => crypto.randomUUID() });
    const client: NativeComposeFunctionsClient = { functions: { invoke: vi.fn(async (_name, options) => {
      const body = options.body as EditIntentRequest;
      const ref = body.outline.pages[0].detail!.find(object => object.hint === 'titulo')!.ref;
      return { data: { reply: { status: 'proposal', summary: 'Vou trocar o título.', blocked: [],
        intents: [{ kind: 'set_text', target: ref, text: 'Calibrador PCON' }] } }, error: null };
    }) } };
    render(<Harness session={session} client={client} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pedir' })); });
    expect(await screen.findByRole('group', { name: 'Mudanças pedidas na conversa' })).toBeTruthy();
    act(() => { session.execute({ type: 'page.add' }); });
    expect(screen.queryByRole('group', { name: 'Mudanças pedidas na conversa' })).toBeNull();
    expect(titleText(session)).toBe('PCON HÍBRIDO');
  });
});

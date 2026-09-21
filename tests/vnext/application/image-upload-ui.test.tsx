import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createDocumentSession } from '@/vnext/application';
import { createW2CDemoDocument, createInsertSpec } from '@/vnext/app/editor-defaults';
import { VNextApp } from '@/vnext/app/VNextApp';
import { VNextPersistenceRuntime, type CatalogRepository } from '@/vnext/persistence';

afterEach(cleanup);

it('real runtime without Bridge cannot insert or replace a demo asset', async () => {
  let n = 0;
  const createId = () => `ui-${++n}`;
  const document = createW2CDemoDocument(createId);
  const session = createDocumentSession(document, { createId });
  session.execute({ type: 'object.insert', pageId: document.pages[0].id, object: createInsertSpec('image', document.pages[0]) });
  const unavailable = async () => ({ ok: false as const, error: { code: 'OFFLINE' as const } });
  const repository: CatalogRepository = { getCatalog: unavailable, listCatalogs: unavailable, createCatalog: unavailable, saveCAS: unavailable, archiveCAS: unavailable };
  const runtime = new VNextPersistenceRuntime({ session, repository, applicationDependencies: { createId }, createMutationId: createId, createOpenSessionId: createId, authLineage: 'user', autosave: false });
  const before = session.getSnapshot();
  const view = render(<VNextApp runtime={runtime} />);
  const picker = view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const click = vi.spyOn(picker, 'click');
  fireEvent.click(view.getByText('Adicionar imagem'));
  expect(view.getByText('Envio de imagens indisponível neste ambiente.')).toBeTruthy();
  const id = before.document.pages[0].objects[0].id;
  fireEvent(view.container.querySelector(`[data-editor-object-id="${id}"]`)!, new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  await waitFor(() => expect(view.getAllByText('Substituir imagem')).toHaveLength(2));
  for (const button of view.getAllByText('Substituir imagem')) fireEvent.click(button);
  fireEvent.click(view.getByText('Upload imagem'));
  expect(click).not.toHaveBeenCalled();
  expect(session.getSnapshot()).toEqual(before);
  runtime.dispose();
});

describe('explicit in-memory demo', () => {
  it('retains fixture insertion separately from the production runtime', () => {
    let n = 0;
    const createId = () => `demo-${++n}`;
    const session = createDocumentSession(createW2CDemoDocument(createId), { createId });
    const view = render(<VNextApp session={session} />);
    fireEvent.click(view.getByText('Adicionar imagem'));
    expect(session.getSnapshot().document.pages[0].objects[0].type).toBe('image');
  });
});

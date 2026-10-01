import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authoredStructuralIdentityIds, createCatalogDocument, createDocumentSession } from '@/vnext/application';
import type { AssetPersistenceBridge, AssetRef, AssetResolutionResult } from '@/vnext/asset';
import { EditorWorkspace } from '@/vnext/app/EditorWorkspace';
import { bindPresysPageReuse, DefaultStarterDependencyPreparer, insertPresysPage } from '@/vnext/library/starter-dependencies';
import { createPresysPageTemplateRegistry, PRESYS_STARTER, PRESYS_PRESENTATION_PAGE_ID, PRESYS_SPECIFICATIONS_PAGE_ID } from '@/vnext/library/presys-ta25n-starter';
import { idSequence, uuid } from '../persistence/w3h-fixtures';

afterEach(cleanup);
const bytes = new Uint8Array(readFileSync('public/assets/presys/ta-25n-starter-v1.png'));
const asset: AssetRef = { ...PRESYS_STARTER.sourceDocument.assets[0], id: uuid(25) };
function fixture(collision = false) {
  const templates = createPresysPageTemplateRegistry();
  const doc = createCatalogDocument(idSequence(100), 'Blank destination');
  const session = createDocumentSession(doc, { createId: collision ? () => doc.id : idSequence(1000), templateRegistry: templates });
  const finalizeUpload = vi.fn(async () => ({ ok: true as const, asset }));
  const resolve = vi.fn(async (): Promise<AssetResolutionResult> => ({ ok: true, state: { status: 'resolved', asset, url: 'blob:test', expiresAt: Date.now() + 60000 } }));
  const preparer = new DefaultStarterDependencyPreparer({ finalizeUpload, resolve } as unknown as AssetPersistenceBridge, async () => bytes);
  let current = true;
  bindPresysPageReuse(session, { templates, preparer, getLineage: () => ({ authLineage: 'A:1', authorityScopeId: 'scope:A', openSessionId: 'open-A', catalogId: doc.id }), isCurrent: () => current, installRuntimeAsset: vi.fn() });
  return { session, doc, finalizeUpload, resolve, loseAuthority: () => { current = false; } };
}

describe('PILOT.C.1 production page reuse composition', () => {
  it('C1-10/11/12 UI exposes both official pages; insertion/duplication remap graph with no duplicate IDs', async () => {
    const f = fixture();
    const ui = render(<EditorWorkspace session={f.session} />);
    const choice = ui.getByRole('combobox', { name: 'Modelo de página PRESYS' });
    expect(ui.getByRole('option', { name: 'TA-25N · Apresentação' })).toBeInTheDocument();
    expect(ui.getByRole('option', { name: 'TA-25N · Especificações' })).toBeInTheDocument();
    fireEvent.change(choice, { target: { value: PRESYS_SPECIFICATIONS_PAGE_ID } });
    fireEvent.click(ui.getByRole('button', { name: 'Inserir modelo após a página atual' }));
    await waitFor(() => expect(f.session.getSnapshot().document.pages).toHaveLength(2));
    await waitFor(() => expect(ui.getByText('Modelo PRESYS inserido como página independente.')).toBeInTheDocument());
    ui.unmount();
    const inserted = f.session.getSnapshot().document.pages[1];
    expect(inserted.id).not.toBe(PRESYS_SPECIFICATIONS_PAGE_ID);
    const prior = authoredStructuralIdentityIds(f.session.getSnapshot().document);
    act(() => { expect(f.session.execute({ type: 'page.duplicate', pageId: inserted.id }).ok).toBe(true); });
    const doc = f.session.getSnapshot().document;
    const ids = authoredStructuralIdentityIds(doc);
    expect(new Set(ids).size).toBe(ids.length);
    const copy = doc.pages[2];
    expect(prior).not.toContain(copy.id);
    for (const page of doc.pages.slice(1)) for (const object of page.objects) if (object.type === 'table') {
      for (const cell of object.table.cells) {
        expect(object.table.rows.some(r => r.id === cell.rowId)).toBe(true);
        expect(object.table.columns.some(c => c.id === cell.columnId)).toBe(true);
      }
    }
    expect(doc.assets).toEqual([asset]);
    expect(f.finalizeUpload).toHaveBeenCalledTimes(1);
    act(() => { expect(f.session.undo().ok).toBe(true); });
    act(() => { expect(f.session.redo().ok).toBe(true); });
  });

  it('C1-04 unresolved dependency creates no page or dangling image', async () => {
    const f = fixture();
    f.resolve.mockResolvedValueOnce({ ok: false, state: { status: 'offline', asset } });
    expect(await insertPresysPage(f.session, PRESYS_PRESENTATION_PAGE_ID, f.doc.pages[0].id)).toMatchObject({ ok: false });
    expect(f.session.getSnapshot().document).toEqual(f.doc);
  });

  it('C1-11 deliberate structural collision creates no partial page; unused registered asset is allowed', async () => {
    const f = fixture(true);
    expect(await insertPresysPage(f.session, PRESYS_PRESENTATION_PAGE_ID, f.doc.pages[0].id)).toMatchObject({ ok: false });
    expect(f.session.getSnapshot().document.pages).toEqual(f.doc.pages);
    expect(f.session.getSnapshot().document.assets).toEqual([asset]);
  });

  it('C1-14 authority loss during resolution prevents registration/page insertion', async () => {
    const f = fixture();
    f.resolve.mockImplementationOnce(async () => { f.loseAuthority(); return { ok: true, state: { status: 'resolved', asset, url: 'blob:test', expiresAt: 1 } }; });
    expect(await insertPresysPage(f.session, PRESYS_PRESENTATION_PAGE_ID, f.doc.pages[0].id)).toMatchObject({ ok: false, code: 'STALE_RESULT' });
    expect(f.session.getSnapshot().document).toEqual(f.doc);
  });
});

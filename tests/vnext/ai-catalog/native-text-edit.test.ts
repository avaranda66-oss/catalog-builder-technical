import { beforeAll, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createCatalogDocument, createDocumentSession } from '../../../src/vnext/application';
import { createInsertSpec } from '../../../src/vnext/app/editor-defaults';
import {
  applyNativeTextEdit, plainSelectedEditorialText, prepareNativeTextEditRequest,
  proposeNativeTextEdit,
} from '../../../src/vnext/ai-catalog/native-text-edit';
import type { RichText } from '../../../src/vnext/domain';

beforeAll(() => { vi.stubGlobal('crypto', webcrypto); });
const id = () => crypto.randomUUID();
function fixture() {
  const doc = createCatalogDocument(id, 'Novo catálogo');
  const session = createDocumentSession(doc, { createId: id });
  const inserted = session.execute({ type: 'object.insert', pageId: doc.pages[0].id,
    object: createInsertSpec('text', doc.pages[0]) });
  expect(inserted.ok).toBe(true);
  const object = session.getSnapshot().document.pages[0].objects[0];
  if (!object || object.type !== 'text') throw new Error('NO_TEXT_OBJECT');
  return { session, selected: { objectId: object.id, text: structuredClone(object.text) } };
}
describe('selected-object editorial rewrite via guarded canonical action', () => {
  it('rewrites only the selected text after CAS approval; undo restores exact prior text', () => {
    const f = fixture();
    const before = structuredClone(f.session.getSnapshot().document);
    const revision = f.session.getSnapshot().localSequence;
    const revised = applyNativeTextEdit(f.session, f.selected,
      { status: 'proposal', revisedText: 'Apresentação profissional de instrumentos' }, revision);
    expect(revised.before).toBe('Novo texto');
    expect(revised.after).toBe('Apresentação profissional de instrumentos');
    const object = f.session.getSnapshot().document.pages[0].objects[0];
    expect(object.type).toBe('text');
    if (object.type !== 'text') throw new Error('NOT_TEXT');
    expect(object.text.paragraphs[0].inlines[0]).toMatchObject({
      kind: 'text', text: 'Apresentação profissional de instrumentos',
    });
    expect(f.session.undo().ok).toBe(true);
    expect(f.session.getSnapshot().document).toEqual(before);
  });
  it('never rewrites technical figures, model codes or multi-span rich text', () => {
    const f = fixture();
    const original = structuredClone(f.session.getSnapshot().document);
    for (const bad of [
      { status: 'proposal', revisedText: 'Exatidão 0,01%' },
      { status: 'proposal', revisedText: 'Modelo TA-25N' },
      { status: 'proposal', revisedText: '<script>boom</script>' },
      { status: 'proposal', revisedText: '' },
      { status: 'proposal', revisedText: 'Novo título', runShell: true },
    ]) {
      expect(() => applyNativeTextEdit(f.session, f.selected, bad,
        f.session.getSnapshot().localSequence)).toThrow();
      expect(f.session.getSnapshot().document).toEqual(original);
    }
    const formatted: RichText = {
      paragraphs: [{ id: id(), inlines: [
        { id: id(), kind: 'text', text: 'Duas', marks: [] },
        { id: id(), kind: 'text', text: 'partes', marks: [] },
      ] }],
    };
    expect(plainSelectedEditorialText({ ...f.selected, text: formatted })).toBeNull();
    expect(plainSelectedEditorialText({ ...f.selected, locked: true })).toBeNull();
  });
  it('rejects stale proposal and target changes without partial mutation', () => {
    const f = fixture();
    const revision = f.session.getSnapshot().localSequence;
    expect(f.session.execute({ type: 'page.add' }).ok).toBe(true);
    const after = structuredClone(f.session.getSnapshot().document);
    expect(() => applyNativeTextEdit(f.session, f.selected,
      {status:'proposal',revisedText:'Visão geral da família'},revision))
      .toThrow('TEXT_EDIT_STALE_REVISION');
    expect(f.session.getSnapshot().document).toEqual(after);
  });
  it('sends ONLY opted-in selected text, no PDF content, credentials or full catalog', async () => {
    const f = fixture();
    const req = prepareNativeTextEditRequest(f.selected,
      'Torne este título mais profissional.');
    expect(req.task).toBe('revise_selected_text');
    expect(req.target.text).toBe('Novo texto');
    expect(JSON.stringify(req)).not.toContain('apiKey');
    expect(JSON.stringify(req)).not.toContain('pdf');
    let seen: unknown;
    const reply = await proposeNativeTextEdit(f.selected, 'Melhore a redação deste título.',
      async request => {
        seen = request;
        return { status: 'proposal', revisedText: 'Visão geral dos produtos' };
      });
    expect(reply.status).toBe('proposal');
    expect(seen).toMatchObject({ task: 'revise_selected_text',
      target: { objectId: f.selected.objectId, text: 'Novo texto' } });
  });
  it('FR-72: rewrites a text with numbers through markers; the AI never sees or changes the digits', async () => {
    const f = fixture();
    const revision = f.session.getSnapshot().localSequence;
    const current = f.session.getSnapshot().document.pages[0].objects[0];
    if (current.type !== 'text') throw new Error('NOT_TEXT');
    expect(f.session.execute({ type: 'text.setContent', objectId: current.id, expectedText: current.text,
      plainText: 'Calibra de 0 a 250 psi com exatidão de 0,025%' }).ok).toBe(true);
    const updated = f.session.getSnapshot().document.pages[0].objects[0];
    if (updated.type !== 'text') throw new Error('NOT_TEXT');
    const selected = { objectId: updated.id, text: structuredClone(updated.text) };
    expect(plainSelectedEditorialText(selected)).toBe('Calibra de 0 a 250 psi com exatidão de 0,025%');
    expect(prepareNativeTextEditRequest(selected, 'Deixe mais profissional.').target.text)
      .toBe('Calibra de {{A}} a {{B}} psi com exatidão de {{C}}%');
    const reply = await proposeNativeTextEdit(selected, 'Deixe mais profissional.', async request => {
      expect(JSON.stringify(request)).not.toMatch(/250|0,025/);
      return { status: 'proposal', revisedText: 'Calibração de {{A}} a {{B}} psi, exatidão de {{C}}%' };
    });
    expect(reply).toEqual({ status: 'proposal', revisedText: 'Calibração de 0 a 250 psi, exatidão de 0,025%' });
    for (const bad of ['Calibração de {{A}} a {{B}} psi', 'Calibração de {{A}} a {{A}} psi, {{C}}%', 'De {{A}} a {{D}} psi {{B}} {{C}}']) {
      await expect(proposeNativeTextEdit(selected, 'Deixe mais profissional.', async () =>
        ({ status: 'proposal', revisedText: bad }))).rejects.toThrow();
    }
    const revisionNow = f.session.getSnapshot().localSequence;
    expect(revisionNow).toBe(revision + 1);
    expect(() => applyNativeTextEdit(f.session, selected,
      { status: 'proposal', revisedText: 'Calibração de 0 a 300 psi, exatidão de 0,025%' }, revisionNow)).toThrow('TEXT_EDIT_NUMBERS_CHANGED');
    const applied = applyNativeTextEdit(f.session, selected, reply, revisionNow);
    expect(applied.after).toBe('Calibração de 0 a 250 psi, exatidão de 0,025%');
    expect(f.session.undo().ok).toBe(true);
    expect(plainSelectedEditorialText({ ...selected, text: (f.session.getSnapshot().document.pages[0].objects[0] as { text: RichText }).text }))
      .toBe('Calibra de 0 a 250 psi com exatidão de 0,025%');
  });
});

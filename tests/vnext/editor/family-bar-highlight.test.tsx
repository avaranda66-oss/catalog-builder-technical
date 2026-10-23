import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createDocumentSession, parseCanonicalDocument, type DocumentSession } from '@/vnext/application';
import type { CatalogDocument, Page, TextObject } from '@/vnext/domain';
import { TextDecorationSection } from '@/vnext/app/editor/TextDecorationSection';
import { familyBarInsertSpecs } from '@/vnext/editor/native-element-authoring';
import { familyBarOf, highlightFamilyModel, planFamilyBarHighlight } from '@/vnext/editor/family-bar-highlight';
import { buildPresysPconCoverPage, createPconHibridoCoverExample, pconHibridoCoverFills } from '@/vnext/library/presys-cover-pcon';
import { createPresysPageTemplateRegistry } from '@/vnext/library/presys-ta25n-starter';

/**
 * Onda 4 (P, item 3): "Destacar este modelo" moves the highlight of the family bar (selo colours + the triangle) to the
 * selected model in ONE Desfazer step. Before, the cover audit (S16) needed 7 actions: 4 colour clicks and a drag.
 */

const PAGE = 'capa-pcon-hibrido';
const id = (name: string) => `${PAGE}-${name}`;
let counter = 0;
const nextId = () => `gerado-${++counter}`;
const tx = () => `tx-${++counter}`;

function coverSession(): { session: DocumentSession; initial: CatalogDocument } {
  const initial = parseCanonicalDocument(createPconHibridoCoverExample());
  return { session: createDocumentSession(initial, { createId: nextId }), initial };
}
const objectOf = (document: CatalogDocument, objectId: string, pageIndex = 0) =>
  document.pages[pageIndex].objects.find((object) => object.id === objectId)!;

afterEach(() => cleanup());

describe('Onda 4 (P) — the family bar is found by its shape', () => {
  const cover = parseCanonicalDocument(createPconHibridoCoverExample()).pages[0];

  it('finds the 6 model selos, the highlighted HÍBRIDO and the triangle over it', () => {
    const bar = familyBarOf(cover, id('modelo-2'))!;
    expect(bar.members.map((member) => member.id)).toEqual([1, 2, 3, 4, 5, 6].map((index) => id(`modelo-${index}`)));
    expect(bar.highlighted.id).toBe(id('modelo-6'));
    expect(bar.pointer?.id).toBe(id('modelo-atual-seta'));
  });

  it('does not take the pills, plain texts or callouts for a bar', () => {
    // Two groups of pills share one line, but they are two runs (2 blue, 4 gold) with no single highlighted selo.
    for (const name of ['pilula-a1', 'pilula-b2', 'titulo', 'chamada-1', 'fundo-azul']) expect(familyBarOf(cover, id(name)), name).toBeUndefined();
    expect(planFamilyBarHighlight(cover, id('pilula-b1'))).toEqual({ ok: false, reason: 'not-in-bar' });
    expect(planFamilyBarHighlight(cover, id('modelo-6'))).toEqual({ ok: false, reason: 'already-highlighted' });
  });
});

describe('Onda 4 (P) — "Destacar este modelo"', () => {
  it('gives DT the highlight exactly as the template draws it with DT as current model, in one Desfazer step', () => {
    const { session, initial } = coverSession();
    const outcome = highlightFamilyModel(session, PAGE, id('modelo-5'), tx());
    expect(outcome).toEqual({ ok: true, message: 'Modelo destacado. Use Desfazer se precisar.' });
    const after = session.getSnapshot().document;
    const expected = buildPresysPconCoverPage({ pageId: PAGE, fills: pconHibridoCoverFills(), currentModel: 5 });
    const want = (name: string) => expected.objects.find((object) => object.id === id(name))!;
    for (const name of ['modelo-5', 'modelo-6']) {
      const text = objectOf(after, id(name)) as TextObject;
      expect(text.box, name).toEqual((want(name) as TextObject).box);
      expect(text.style, name).toEqual((want(name) as TextObject).style);
    }
    const pointer = objectOf(after, id('modelo-atual-seta'));
    expect(pointer.frame.xMm).toBeCloseTo(want('modelo-atual-seta').frame.xMm, 3);
    expect(pointer.frame.yMm).toBe(want('modelo-atual-seta').frame.yMm);
    // Nothing else changed.
    const changed = after.pages[0].objects.filter((object, index) => JSON.stringify(object) !== JSON.stringify(initial.pages[0].objects[index]));
    expect(changed.map((object) => object.id).sort()).toEqual([id('modelo-5'), id('modelo-6'), id('modelo-atual-seta')].sort());
    // One Desfazer brings everything back.
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.getSnapshot().canUndo).toBe(false);
  });

  it('works on a cover inserted from "Usar modelo…" (new IDs) and from the far left model back', () => {
    const base: CatalogDocument = { ...parseCanonicalDocument(createPconHibridoCoverExample()), pages: [{ id: 'primeira', widthMm: 210, heightMm: 297, objects: [] }], assets: [] };
    const session = createDocumentSession(base, { createId: nextId, templateRegistry: createPresysPageTemplateRegistry() });
    expect(session.execute({ type: 'page.template.insert', templateId: 'presys-capa-produto-pcon', afterPageId: 'primeira' }, { transactionId: tx() }).ok).toBe(true);
    const page: Page = session.getSnapshot().document.pages[1];
    const bar = familyBarOf(page, page.objects.find((object) => object.type === 'text' && object.box && object.frame.yMm === 265)!.id)!;
    expect(bar.members).toHaveLength(6);
    const first = bar.members[0].id, last = bar.members[5].id;
    expect(bar.highlighted.id).toBe(last);
    expect(highlightFamilyModel(session, page.id, first, tx()).ok).toBe(true);
    const moved = familyBarOf(session.getSnapshot().document.pages[1], first)!;
    expect(moved.highlighted.id).toBe(first);
    const pointer = moved.pointer!;
    expect(pointer.frame.xMm + pointer.frame.widthMm / 2).toBeCloseTo(moved.members[0].frame.xMm + moved.members[0].frame.widthMm / 2, 3);
  });

  it('swaps only the colours when there is no triangle, and leaves a locked triangle where it is', () => {
    // An ungrouped "Barra da família" (inserted selos, no triangle).
    const doc = parseCanonicalDocument(createPconHibridoCoverExample());
    const session = createDocumentSession({ ...doc, pages: [{ id: 'p', widthMm: 210, heightMm: 297, objects: [] }], assets: [] }, { createId: nextId });
    const page0 = session.getSnapshot().document.pages[0];
    for (const object of familyBarInsertSpecs(page0, doc.style)) session.execute({ type: 'object.insert', pageId: 'p', object }, { transactionId: 'barra' });
    const selos = session.getSnapshot().document.pages[0].objects as TextObject[];
    expect(familyBarOf(session.getSnapshot().document.pages[0], selos[1].id)?.pointer).toBeUndefined();
    expect(highlightFamilyModel(session, 'p', selos[1].id, tx()).ok).toBe(true);
    expect(familyBarOf(session.getSnapshot().document.pages[0], selos[1].id)?.highlighted.id).toBe(selos[1].id);

    const cover = coverSession();
    expect(cover.session.execute({ type: 'object.setLocked', objectId: id('modelo-atual-seta'), expectedLocked: false, locked: true }, { transactionId: tx() }).ok).toBe(true);
    const before = objectOf(cover.session.getSnapshot().document, id('modelo-atual-seta')).frame;
    const outcome = highlightFamilyModel(cover.session, PAGE, id('modelo-1'), tx());
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain('A seta está travada');
    expect(objectOf(cover.session.getSnapshot().document, id('modelo-atual-seta')).frame).toEqual(before);
    expect((objectOf(cover.session.getSnapshot().document, id('modelo-1')) as TextObject).box?.fill).toBe('#8A642B');
  });

  it('changes nothing when a selo of the bar is locked', () => {
    const { session, initial } = coverSession();
    expect(session.execute({ type: 'object.setLocked', objectId: id('modelo-6'), expectedLocked: false, locked: true }, { transactionId: tx() }).ok).toBe(true);
    const locked = session.getSnapshot().document;
    expect(highlightFamilyModel(session, PAGE, id('modelo-2'), tx())).toEqual({ ok: false, message: 'Um dos selos da barra está travado. Destrave-o em Camadas e tente de novo.' });
    expect(session.getSnapshot().document).toBe(locked);
    expect(locked).not.toBe(initial);
  });

  it('rolls an unexpected late failure back with one Desfazer, so nothing is left half done', () => {
    const { session, initial } = coverSession();
    let calls = 0;
    const flaky: DocumentSession = {
      ...session,
      execute: (action, context) => (++calls === 3 ? { ok: false, error: { code: 'TARGET_STALE', details: 'teste' } } : session.execute(action, context)),
    };
    expect(highlightFamilyModel(flaky, PAGE, id('modelo-3'), tx())).toEqual({ ok: false, message: 'Não foi possível destacar este modelo. Nada foi alterado.' });
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.getSnapshot().canUndo).toBe(false);
  });
});

describe('Onda 4 (P) — the button in the "Selo" panel', () => {
  const panel = (session: DocumentSession, name: string, messages: string[]) => render(<TextDecorationSection
    object={objectOf(session.getSnapshot().document, id(name)) as TextObject} disabled={false} session={session}
    prepare={() => true} onMessage={(message) => { messages.push(message); }} />);

  it('offers "Destacar este modelo" on another model and moves the highlight with one click', () => {
    const { session } = coverSession();
    const messages: string[] = [];
    panel(session, 'modelo-5', messages);
    fireEvent.click(screen.getByRole('button', { name: 'Destacar este modelo' }));
    expect(messages).toEqual(['Modelo destacado. Use Desfazer se precisar.']);
    expect(familyBarOf(session.getSnapshot().document.pages[0], id('modelo-5'))?.highlighted.id).toBe(id('modelo-5'));
    // The panel follows the catalog: DT is now the highlighted model.
    expect(screen.queryByRole('button', { name: 'Destacar este modelo' })).toBeNull();
    expect(screen.getByText('Este é o modelo destacado da barra.')).toBeTruthy();
  });

  it('shows no such button on a pill', () => {
    const { session } = coverSession();
    panel(session, 'pilula-a1', []);
    expect(screen.queryByRole('button', { name: 'Destacar este modelo' })).toBeNull();
    expect(screen.queryByText('Este é o modelo destacado da barra.')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '@/vnext/application';
import { plainRichText, type CatalogDocument, type EditorialObject, type PageFooter } from '@/vnext/domain';
import {
  cleanPageFooter, DEFAULT_PAGE_FOOTER, isTypedPageNumber, normalizeFooterField, pageFooterAction, replaceTypedPageNumbers, todayIsoDate,
  typedPageNumbers,
} from '@/vnext/editor/page-footer-authoring';

function ids(prefix = 'generated') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

const text = (id: string, value: string, yMm: number, extra: Partial<EditorialObject> = {}): EditorialObject => ({
  id, type: 'text', frame: { xMm: 170, yMm, widthMm: 24, heightMm: 5 }, zIndex: 0, text: plainRichText(id, value), style: {}, ...extra,
} as EditorialObject);

/** An 11-page folder as the father has it today: "n / 11" typed at the bottom of pages 2–11. */
function typedFolder(): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'Folder');
  return {
    ...base,
    pages: Array.from({ length: 11 }, (_, index) => ({
      ...base.pages[0], id: `page-${index + 1}`,
      objects: index === 0 ? [text('cover-title', 'PCON-XV', 120)] : [
        text(`number-${index + 1}`, `${index + 1} / 11`, 281),
        text(`body-${index + 1}`, 'Faixa de 0 a 10 bar', 100),
      ],
    })),
  };
}

describe('FR-55 typed page numbers', () => {
  it('recognises only page-number texts', () => {
    for (const value of ['3', '3 / 11', '3/11', 'Página 3 de 11', 'Pág. 3', 'pag 3', 'Page 3 of 11', '- 3 -', 'Strona 3 z 11'])
      expect(isTypedPageNumber(value), value).toBe(true);
    for (const value of ['www.presys.com.br', '0 a 10 bar', 'MAN-PCON-XV Rev. 03', '3 de 11 modelos', '1234', 'Página'])
      expect(isTypedPageNumber(value), value).toBe(false);
  });

  it('finds the typed numbers near the bottom of the pages that show the footer (not the cover, not body text)', () => {
    const found = typedPageNumbers(typedFolder());
    expect(found.map((item) => item.objectId)).toEqual(Array.from({ length: 10 }, (_, index) => `number-${index + 2}`));
    expect(found[0]).toEqual({ pageId: 'page-2', pageNumber: 2, objectId: 'number-2', text: '2 / 11' });
  });

  it('leaves locked, hidden and high-up numbers alone', () => {
    const doc = typedFolder();
    doc.pages[1].objects[0] = { ...doc.pages[1].objects[0], locked: true };
    doc.pages[2].objects[0] = { ...doc.pages[2].objects[0], hidden: true };
    doc.pages[3].objects[0] = { ...doc.pages[3].objects[0], frame: { ...doc.pages[3].objects[0].frame, yMm: 200 } };
    expect(typedPageNumbers(doc).map((item) => item.pageNumber)).toEqual([5, 6, 7, 8, 9, 10, 11]);
  });

  it('turns the footer on and deletes the 10 typed numbers as ONE undo step (S21: ~100 actions → 2 clicks)', () => {
    const session = createDocumentSession(typedFolder(), { createId: ids() });
    const items = typedPageNumbers(session.getSnapshot().document);
    const outcome = replaceTypedPageNumbers(session, { ...DEFAULT_PAGE_FOOTER }, items, 'tx-footer');
    expect(outcome).toEqual({ ok: true, removed: 10 });
    const after = session.getSnapshot().document;
    expect(after.style.pageFooter).toEqual({ showOnFirstPage: false });
    expect(after.pages.flatMap((page) => page.objects.map((object) => object.id)).filter((id) => id.startsWith('number-'))).toEqual([]);
    expect(after.pages[1].objects.map((object) => object.id)).toEqual(['body-2']);
    session.undo();
    expect(session.getSnapshot().document).toEqual(typedFolder());
    expect(session.getSnapshot().canUndo).toBe(false);
  });

  it('keeps nothing when the catalog changed after the preview', () => {
    const session = createDocumentSession(typedFolder(), { createId: ids() });
    const items = typedPageNumbers(session.getSnapshot().document);
    session.execute({ type: 'object.delete', objectId: 'number-5' });
    const before = session.getSnapshot().document;
    const outcome = replaceTypedPageNumbers(session, { ...DEFAULT_PAGE_FOOTER }, items, 'tx-footer');
    expect(outcome.ok).toBe(false);
    expect(session.getSnapshot().document).toBe(before);
  });
});

describe('FR-55 footer fields', () => {
  it('stores one clean line, cut at the limit; empty means not filled', () => {
    expect(normalizeFooterField('  MAN-PCON   XV \n', 'documentCode')).toBe('MAN-PCON XV');
    expect(normalizeFooterField('   ', 'revision')).toBeUndefined();
    expect(normalizeFooterField('1234567890123456', 'revision')).toBe('123456789012');
  });

  it('drops empty fields and refuses an impossible date', () => {
    const footer: PageFooter = { documentCode: undefined, revision: '03', issuedOn: undefined, showOnFirstPage: true };
    expect(cleanPageFooter(footer)).toEqual({ revision: '03', showOnFirstPage: true });
    expect(cleanPageFooter({ showOnFirstPage: false, issuedOn: '2026-02-31' })).toBeUndefined();
  });

  it('prepares the change against the footer as it is now', () => {
    const doc = createCatalogDocument(ids('doc'));
    expect(pageFooterAction(doc, { showOnFirstPage: false })).toEqual({ type: 'document.setPageFooter', expectedFooter: null, footer: { showOnFirstPage: false } });
  });

  it('writes today as aaaa-mm-dd in the local calendar', () => {
    expect(todayIsoDate(new Date(2026, 9, 2, 23, 59))).toBe('2026-10-02');
  });
});

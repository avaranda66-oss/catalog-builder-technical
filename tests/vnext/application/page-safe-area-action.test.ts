import { describe, expect, it } from 'vitest';
import { createCatalogDocument, createDocumentSession, executeApplicationAction } from '../../../src/vnext/application';
import { ApplicationActionSchema } from '../../../src/vnext/application/contracts';

let next = 0;
const createId = () => `safe-area-${++next}`;

describe('page.setSafeArea (Onda 4.5, página do arsenal)', () => {
  it('troca a área segura da página em um passo de Desfazer', () => {
    const session = createDocumentSession(createCatalogDocument(createId), { createId });
    const page = session.getSnapshot().document.pages[0];
    const before = session.getSnapshot().document;
    const safeArea = { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 };
    const result = session.execute({ type: 'page.setSafeArea', pageId: page.id, expectedSafeArea: page.safeArea ?? null, safeArea }, { transactionId: 'arsenal' });
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().document.pages[0].safeArea).toEqual(safeArea);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);
  });

  it('recusa com TARGET_STALE quando a área mudou depois de preparado; null tira a área', () => {
    const document = createCatalogDocument(createId);
    const page = document.pages[0];
    const stale = executeApplicationAction(document, { type: 'page.setSafeArea', pageId: page.id, expectedSafeArea: null, safeArea: null }, { createId });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe('TARGET_STALE');
    const cleared = executeApplicationAction(document, { type: 'page.setSafeArea', pageId: page.id, expectedSafeArea: page.safeArea!, safeArea: null }, { createId });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.document.pages[0].safeArea).toBeUndefined();
    const same = executeApplicationAction(document, { type: 'page.setSafeArea', pageId: page.id, expectedSafeArea: page.safeArea!, safeArea: { ...page.safeArea! } }, { createId });
    expect(same.ok && same.metadata.changed).toBe(false);
    const missing = executeApplicationAction(document, { type: 'page.setSafeArea', pageId: 'nenhuma', expectedSafeArea: null, safeArea: null }, { createId });
    expect(!missing.ok && missing.error.code).toBe('PAGE_NOT_FOUND');
  });

  it('o esquema recusa área que não deixa espaço na folha A4', () => {
    expect(ApplicationActionSchema.safeParse({ type: 'page.setSafeArea', pageId: 'p', expectedSafeArea: null, safeArea: { topMm: 150, rightMm: 0, bottomMm: 150, leftMm: 0 } }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({ type: 'page.setSafeArea', pageId: 'p', expectedSafeArea: null, safeArea: { topMm: -1, rightMm: 0, bottomMm: 0, leftMm: 0 } }).success).toBe(false);
  });
});

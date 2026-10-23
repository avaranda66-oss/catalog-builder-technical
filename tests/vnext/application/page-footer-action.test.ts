import { describe, expect, it } from 'vitest';
import {
  ApplicationActionSchema, createCatalogDocument, createDocumentSession, executeApplicationAction, parseCanonicalDocument,
} from '@/vnext/application';
import type { PageFooter } from '@/vnext/domain';

function ids(prefix = 'generated') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

const FOOTER: PageFooter = { documentCode: 'MAN-PCON-XV', revision: '03', issuedOn: '2026-10-22', showOnFirstPage: false };

describe('FR-55 document.setPageFooter', () => {
  it('turns the footer on for the whole catalog as one undo step', () => {
    const session = createDocumentSession(createCatalogDocument(ids('doc')), { createId: ids() });
    const result = session.execute({ type: 'document.setPageFooter', expectedFooter: null, footer: FOOTER });
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().document.style.pageFooter).toEqual(FOOTER);
    expect(() => parseCanonicalDocument(session.getSnapshot().document)).not.toThrow();
    expect(session.getSnapshot().canUndo).toBe(true);
    session.undo();
    expect(session.getSnapshot().document.style.pageFooter).toBeUndefined();
    expect(session.getSnapshot().canUndo).toBe(false);
  });

  it('removes the key when turned off, so the document is exactly as before', () => {
    const base = createCatalogDocument(ids('doc'));
    const on = executeApplicationAction(base, { type: 'document.setPageFooter', expectedFooter: null, footer: FOOTER }, { createId: ids() });
    if (!on.ok) throw new Error(on.error.details);
    const off = executeApplicationAction(on.document, { type: 'document.setPageFooter', expectedFooter: FOOTER, footer: null }, { createId: ids() });
    if (!off.ok) throw new Error(off.error.details);
    expect('pageFooter' in off.document.style).toBe(false);
    expect(off.document.style).toEqual(base.style);
  });

  it('refuses a change prepared against another footer (TARGET_STALE) and ignores a no-op', () => {
    const base = createCatalogDocument(ids('doc'));
    const stale = executeApplicationAction(base, { type: 'document.setPageFooter', expectedFooter: FOOTER, footer: null }, { createId: ids() });
    expect(stale.ok ? '' : stale.error.code).toBe('TARGET_STALE');
    const same = executeApplicationAction(base, { type: 'document.setPageFooter', expectedFooter: null, footer: null }, { createId: ids() });
    expect(same.ok && same.metadata.changed).toBe(false);
  });

  it('validates the footer fields at the boundary', () => {
    expect(ApplicationActionSchema.safeParse({ type: 'document.setPageFooter', expectedFooter: null, footer: { ...FOOTER, revision: ' 03 ' } }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({ type: 'document.setPageFooter', expectedFooter: null, footer: { ...FOOTER, issuedOn: '2026-13-01' } }).success).toBe(false);
    const invalid = executeApplicationAction(createCatalogDocument(ids('doc')),
      { type: 'document.setPageFooter', expectedFooter: null, footer: { documentCode: 'X'.repeat(41), showOnFirstPage: false } }, { createId: ids() });
    expect(invalid.ok ? '' : invalid.error.code).toBe('ACTION_INVALID');
  });
});

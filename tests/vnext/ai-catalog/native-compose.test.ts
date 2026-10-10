import { beforeAll, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createCatalogDocument, createDocumentSession } from '../../../src/vnext/application';
import { applyNativeCompose, prepareNativeComposeRequest, requestNativeCompose,
  verifyNativeComposeReply, type NativeComposePlan } from '../../../src/vnext/ai-catalog/native-compose';

beforeAll(() => { vi.stubGlobal('crypto', webcrypto); });
const id = () => crypto.randomUUID();
const plan: NativeComposePlan = {
  version: 1, status: 'proposal', summary: 'Estrutura de capa, contextualização e comparação editorial.',
  pages: [
    { type: 'cover', heading: 'Catálogo de instrumentos PRESYS', subtitle: 'Edição técnica em elaboração' },
    { type: 'section', heading: 'Visão geral', subtitle: 'Apresentação editorial sujeita à revisão' },
    { type: 'comparison', heading: 'Família TA — tabela técnica', table: {
      columns: ['Característica', 'TA-25N', 'TA-35N', 'TA-50N'],
      rowLabels: ['Faixa', 'Exatidão', 'Condições', 'Alimentação', 'Dimensões'],
    } },
  ],
};

describe('Gemini conversational scaffold -> native document actions', () => {
  const doc = () => createCatalogDocument(id, 'Rascunho');

  it('generates THREE actual native A4 pages and a table whose data cells remain empty', () => {
    const session = createDocumentSession(doc(), { createId: id });
    const original = structuredClone(session.getSnapshot().document);
    const result = applyNativeCompose(session, plan, session.getSnapshot().localSequence);
    const next = session.getSnapshot().document;
    expect(result.pagesAdded).toBe(3);
    expect(result.tablesAdded).toBe(1);
    expect(next.pages).toHaveLength(3);
    expect(next.pages[0].id).toBe(original.pages[0].id);
    expect(next.pages[0].objects.length).toBeGreaterThan(0);
    const inserted = next.pages.at(-1)!.objects.find(o => o.type === 'table');
    expect(inserted?.type).toBe('table');
    if (inserted?.type !== 'table') throw new Error('NO_TABLE');
    expect(inserted.table.columns).toHaveLength(4);
    expect(inserted.table.rows).toHaveLength(6);
    for (const cell of inserted.table.cells) {
      const col = inserted.table.columns.findIndex(c => c.id === cell.columnId);
      const row = inserted.table.rows.findIndex(r => r.id === cell.rowId);
      if (col > 0 && row > 0) expect(cell.content).toEqual({ type: 'empty' });
    }
    expect(next.pages.at(-1)?.widthMm).toBe(210);
    expect(next.pages.at(-1)?.heightMm).toBe(297);
    // Undo must unwind coalesced native command, not AI-owned HTML or external DOM.
    const after = structuredClone(next);
    const undone = session.undo();
    expect(undone.ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(original);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(after);
  });
  it('never mutates on malformed, oversized or forged proposals', () => {
    const session = createDocumentSession(doc(), { createId: id });
    const original = session.getSnapshot().document;
    for (const bad of [
      { ...plan, pages: [{ ...plan.pages[2], table: {
        columns: ['Value', 'T'], rowLabels: Array(100).fill('Over limit'),
      } }] },
      { ...plan, pages: [{ ...plan.pages[0], table: {
        columns: ['A','B'], rowLabels: ['Foo'],
      } }] },
      { ...plan, pages: [{ type: 'comparison', heading: 'Table' }] },
      { ...plan, pages: [] },
      { ...plan, injected: { runShell: 'echo secret' } },
    ]) {
      expect(() => applyNativeCompose(session, bad, 0)).toThrow();
      expect(session.getSnapshot().document).toEqual(original);
    }
  });
  it('rejects a stale, concurrent document even if an old plan is valid', () => {
    const session = createDocumentSession(doc(), { createId: id });
    session.execute({ type: 'page.add' });
    const previous = structuredClone(session.getSnapshot().document);
    expect(() => applyNativeCompose(session, plan, 0)).toThrow('SCAFFOLD_STALE_DOCUMENT');
    expect(session.getSnapshot().document).toEqual(previous);
  });
  it('sends only bounded editorial metadata and request, not technical values or image assets', async () => {
    const document = doc();
    const request = prepareNativeComposeRequest(document, 'Crie uma capa e tabelas comparativas');
    expect(request.task).toBe('compose_scaffold');
    expect(request.document.pages).toBe(1);
    expect(JSON.stringify(request)).not.toContain('apiKey');
    const response = await requestNativeCompose(document,
      'Crie uma capa e tabelas comparativas', async (_request) => plan);
    expect(response.status).toBe('proposal');
    expect(() => verifyNativeComposeReply({ ...plan,
      pages: [{ ...plan.pages[2], table: { columns: ['A','B'], rowLabels: Array(100).fill('x') } }] })).toThrow();
  });
  it('extends a pre-existing catalog over four conversational rounds without erasing prior work', () => {
    const session = createDocumentSession(doc(), { createId: id });
    const firstId = session.getSnapshot().document.pages[0].id;
    for (let turn = 0; turn < 4; turn++) {
      const baseline = session.getSnapshot().document;
      const currentRevision = session.getSnapshot().localSequence;
      const receipt = applyNativeCompose(session, plan, currentRevision);
      expect(receipt.tablesAdded).toBe(1);
      const changed = session.getSnapshot().document;
      expect(changed.pages.slice(0, baseline.pages.length - (turn === 0 ? 1 : 0)))
        .toEqual(baseline.pages.slice(0, baseline.pages.length - (turn === 0 ? 1 : 0)));
      expect(changed.pages[0].id).toBe(firstId);
      expect(changed.pages.length).toBe(3 + 3 * turn);
      expect(changed.pages.some(p => p.objects.some(o => o.type === 'table'))).toBe(true);
    }
    expect(session.getSnapshot().document.pages).toHaveLength(12);
    expect(session.getSnapshot().document.pages.flatMap(page => page.objects)
      .filter(object => object.type === 'table')).toHaveLength(4);
  });
});

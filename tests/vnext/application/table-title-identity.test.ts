import { describe, expect, it } from 'vitest';
import {
  CatalogCloneService,
  authoredStructuralIdentityIds,
  canonicalIdentityIds,
  createCatalogDocument,
  createDocumentSession,
  type IdGenerator,
} from '@/vnext/application';
import { plainRichText, type CatalogDocument, type TableObject } from '@/vnext/domain';
import { emptyTable } from '../proof/test-data';

function ids(prefix = 'id'): IdGenerator {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

function titledDocument(): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'W4.F.3 identity');
  const table = emptyTable();
  table.title = plainRichText('title-source', 'Tabela TA');
  table.annotations = [{
    id: 'annotation-source',
    kind: 'note',
    text: plainRichText('annotation-source-text', 'Nota'),
  }];
  table.annotationIds = ['annotation-source'];
  table.legend = [{
    id: 'legend-source',
    markerCode: '*',
    text: plainRichText('legend-source-text', 'Legenda'),
  }];
  table.cells[0].content = { type: 'richText', value: plainRichText('cell-source-text', 'Célula') };
  table.cells[1].content = { type: 'marker', legendEntryId: 'legend-source' };
  return {
    ...base,
    pages: [{
      ...base.pages[0],
      objects: [{
        id: 'table-object',
        type: 'table',
        frame: { xMm: 10, yMm: 10, widthMm: 120, heightMm: 80 },
        zIndex: 0,
        table,
      }],
    }],
  };
}

function firstTable(document: CatalogDocument): TableObject {
  const object = document.pages[0].objects.find((entry) => entry.type === 'table');
  if (!object || object.type !== 'table') throw new Error('Expected Table');
  return object;
}

function titleIds(document: CatalogDocument): string[] {
  const title = firstTable(document).table.title;
  if (!title) return [];
  return title.paragraphs.flatMap((paragraph) => [
    paragraph.id,
    ...paragraph.inlines.map((inline) => inline.id),
  ]);
}

describe('W4.F.3 Table title identity and clone integration', () => {
  it('includes title RichText in authored closure but not canonical structural identity', () => {
    const document = titledDocument();
    const authored = authoredStructuralIdentityIds(document);
    const canonical = canonicalIdentityIds(document);
    expect(titleIds(document).every((id) => authored.includes(id))).toBe(true);
    expect(titleIds(document).every((id) => !canonical.includes(id))).toBe(true);
  });

  it('page duplication freshly remaps title RichText together with existing Table identities', () => {
    const session = createDocumentSession(titledDocument(), { createId: ids('dup') });
    const source = session.getSnapshot().document;
    const sourceTitleIds = titleIds(source);
    const result = session.execute({ type: 'page.duplicate', pageId: source.pages[0].id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const duplicatedPage = result.document.pages[1];
    const duplicatedTable = duplicatedPage.objects.find((entry) => entry.type === 'table');
    expect(duplicatedTable?.type).toBe('table');
    if (!duplicatedTable || duplicatedTable.type !== 'table') return;
    const duplicateTitleIds = duplicatedTable.table.title!.paragraphs.flatMap((paragraph) => [
      paragraph.id,
      ...paragraph.inlines.map((inline) => inline.id),
    ]);
    expect(new Set(duplicateTitleIds).size).toBe(duplicateTitleIds.length);
    expect(duplicateTitleIds.every((id) => !sourceTitleIds.includes(id))).toBe(true);
    expect(duplicatedTable.table.title).not.toEqual(firstTable(source).table.title);
    expect(duplicatedTable.table.title?.paragraphs.map((p) => p.inlines.map((i) => i.kind === 'text' ? i.text : '\n')))
      .toEqual(firstTable(source).table.title?.paragraphs.map((p) => p.inlines.map((i) => i.kind === 'text' ? i.text : '\n')));
  });

  it('object duplication freshly remaps title RichText and marker/annotation references remain valid', () => {
    const session = createDocumentSession(titledDocument(), { createId: ids('objdup') });
    const result = session.execute({ type: 'object.duplicate', objectId: 'table-object' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tables = result.document.pages[0].objects.filter((entry): entry is TableObject => entry.type === 'table');
    expect(tables).toHaveLength(2);
    const [source, duplicate] = tables;
    const sourceTitleIds = source.table.title!.paragraphs.flatMap((p) => [p.id, ...p.inlines.map((i) => i.id)]);
    const duplicateTitleIds = duplicate.table.title!.paragraphs.flatMap((p) => [p.id, ...p.inlines.map((i) => i.id)]);
    expect(duplicateTitleIds.every((id) => !sourceTitleIds.includes(id))).toBe(true);
    expect(duplicate.table.annotationIds?.every((id) => duplicate.table.annotations.some((entry) => entry.id === id))).toBe(true);
    const marker = duplicate.table.cells.find((cell) => cell.content.type === 'marker');
    expect(marker?.content.type).toBe('marker');
    const markerContent = marker?.content;
    if (markerContent?.type === 'marker') {
      expect(duplicate.table.legend.some((entry) => entry.id === markerContent.legendEntryId)).toBe(true);
    }
  });

  it('catalog clone remaps title RichText and retains no source authored identities', () => {
    const source = titledDocument();
    const clone = new CatalogCloneService(() => crypto.randomUUID()).clone(source, { title: 'Cópia' });
    const sourceIds = new Set(authoredStructuralIdentityIds(source));
    const cloneIds = authoredStructuralIdentityIds(clone);
    expect(clone.title).toBe('Cópia');
    expect(cloneIds.every((id) => !sourceIds.has(id))).toBe(true);
    expect(titleIds(clone).every((id) => !titleIds(source).includes(id))).toBe(true);
  });
});

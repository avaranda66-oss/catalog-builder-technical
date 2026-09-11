import { describe, expect, it } from 'vitest';
import {
  canonicalIdentityIds,
  canonicalObjectIdentityIds,
  createCatalogDocument,
  createDocumentSession,
  createStaticPageTemplateRegistry,
  executeApplicationAction,
  PageTemplateDefinitionError,
  type IdGenerator,
  type PageTemplateDefinition,
  type PageTemplateRegistry,
} from '@/vnext/application';
import { immediateAuthoringDiagnostics } from '@/vnext/app/authoring-diagnostics';
import { W2C_DEMO_ASSETS, W2C_PRIMARY_ASSET_ID } from '@/vnext/app/editor-defaults';
import { W2E_PAGE_TEMPLATE, W2E_PAGE_TEMPLATE_ID } from '@/vnext/app/page-template-fixtures';
import { resolveSnap } from '@/vnext/editor/snapping';
import { mmToU, plainRichText, type CatalogDocument, type EditorialObject, type Page, type RichText } from '@/vnext/domain';
import { compilePlans } from '@/vnext/rendering';

function sequenceIds(prefix = 'w2e'): IdGenerator {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function countedIds(prefix = 'counted') {
  let count = 0;
  return {
    createId: () => `${prefix}-${++count}`,
    count: () => count,
  };
}

function documentWithAssets(): CatalogDocument {
  const base = createCatalogDocument(sequenceIds('doc'), 'W2.E');
  return { ...base, assets: W2C_DEMO_ASSETS.map((asset) => ({ ...asset })) };
}

function registry(...templates: readonly PageTemplateDefinition[]): PageTemplateRegistry {
  return createStaticPageTemplateRegistry(templates);
}

function insertedPage(result: ReturnType<typeof executeApplicationAction>): Page {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.details}`);
  const pageId = result.metadata.createdIds[0];
  const page = result.document.pages.find((entry) => entry.id === pageId);
  if (!page) throw new Error('Inserted page missing');
  return page;
}

function canonicalPageIds(page: Page): string[] {
  return [page.id, ...page.objects.flatMap((object) => canonicalObjectIdentityIds(object))];
}

function richTextIds(value: RichText): string[] {
  return value.paragraphs.flatMap((paragraph) => [
    paragraph.id,
    ...paragraph.inlines.map((inline) => inline.id),
  ]);
}

function pageRichTextIds(page: Page): string[] {
  const ids: string[] = [];
  for (const object of page.objects) {
    if (object.type === 'text') ids.push(...richTextIds(object.text));
    if (object.type !== 'table') continue;
    for (const cell of object.table.cells) {
      if (cell.content.type === 'richText') ids.push(...richTextIds(cell.content.value));
    }
    for (const annotation of object.table.annotations) ids.push(...richTextIds(annotation.text));
    for (const entry of object.table.legend) ids.push(...richTextIds(entry.text));
  }
  return ids;
}

function templateObjects(...types: EditorialObject['type'][]): PageTemplateDefinition {
  const selected = W2E_PAGE_TEMPLATE.objects.filter((object) => types.includes(object.type));
  return { ...W2E_PAGE_TEMPLATE, id: `fixture-${types.join('-')}`, objects: structuredClone(selected) };
}

describe('W2.E page template insertion seam', () => {
  it('validates static definitions, rejects duplicate IDs, and keeps safeArea explicit', () => {
    const staticRegistry = registry(W2E_PAGE_TEMPLATE);
    expect(staticRegistry.get(W2E_PAGE_TEMPLATE_ID)).toEqual(W2E_PAGE_TEMPLATE);
    expect(staticRegistry.list()).toHaveLength(1);
    expect(Object.isFrozen(staticRegistry.list()[0])).toBe(true);
    expect(Object.isFrozen(staticRegistry.list()[0].objects)).toBe(true);
    expect(() => registry(W2E_PAGE_TEMPLATE, structuredClone(W2E_PAGE_TEMPLATE))).toThrow(PageTemplateDefinitionError);
    expect(() => createStaticPageTemplateRegistry([{
      id: 'invalid-static',
      label: 'Invalid',
      objects: [{ id: 'forbidden-root-id', type: 'shape', frame: { xMm: 1, yMm: 1, widthMm: 1, heightMm: 1 }, zIndex: 0, shape: 'rectangle', style: {} }],
    } as unknown as PageTemplateDefinition])).toThrow(PageTemplateDefinitionError);

    const noSafeArea: PageTemplateDefinition = {
      id: 'no-safe-area',
      label: 'Sem área segura',
      objects: [],
    };
    const result = executeApplicationAction(
      documentWithAssets(),
      { type: 'page.template.insert', templateId: noSafeArea.id },
      { createId: sequenceIds('no-safe'), templateRegistry: registry(noSafeArea) }
    );
    expect(result.ok).toBe(true);
    expect(insertedPage(result).safeArea).toBeUndefined();
  });

  it('inserts at the end or immediately after a middle page and reports canonical createdIds', () => {
    const base = documentWithAssets();
    const multi: CatalogDocument = {
      ...base,
      pages: [
        base.pages[0],
        { ...base.pages[0], id: 'middle-page', objects: [] },
        { ...base.pages[0], id: 'last-page', objects: [] },
      ],
    };
    const dependencies = { createId: sequenceIds('insert'), templateRegistry: registry(W2E_PAGE_TEMPLATE) };
    const afterMiddle = executeApplicationAction(
      multi,
      { type: 'page.template.insert', templateId: W2E_PAGE_TEMPLATE_ID, afterPageId: 'middle-page' },
      dependencies
    );
    expect(afterMiddle.ok).toBe(true);
    if (!afterMiddle.ok) return;
    const middleInserted = insertedPage(afterMiddle);
    expect(afterMiddle.document.pages.map((page) => page.id)).toEqual([
      base.pages[0].id,
      'middle-page',
      middleInserted.id,
      'last-page',
    ]);
    expect(afterMiddle.metadata.createdIds).toEqual(canonicalPageIds(middleInserted));
    expect(afterMiddle.metadata.createdIds).not.toContain(W2C_PRIMARY_ASSET_ID);
    expect(afterMiddle.metadata.createdIds.some((id) => pageRichTextIds(middleInserted).includes(id))).toBe(false);

    const atEnd = executeApplicationAction(
      multi,
      { type: 'page.template.insert', templateId: W2E_PAGE_TEMPLATE_ID },
      { createId: sequenceIds('end'), templateRegistry: registry(W2E_PAGE_TEMPLATE) }
    );
    expect(atEnd.ok).toBe(true);
    if (atEnd.ok) expect(atEnd.document.pages.at(-1)?.id).toBe(atEnd.metadata.createdIds[0]);
  });

  it('fails closed for missing/malformed templates, arbitrary action payload, and missing afterPageId before ID generation', () => {
    const ids = countedIds('never');
    const doc = documentWithAssets();
    const emptyRegistry = registry();
    expect(executeApplicationAction(
      doc,
      { type: 'page.template.insert', templateId: 'missing' },
      { createId: ids.createId, templateRegistry: emptyRegistry }
    )).toMatchObject({ ok: false, error: { code: 'TEMPLATE_NOT_FOUND' } });
    expect(ids.count()).toBe(0);

    const mismatchRegistry = {
      get: () => ({ ...W2E_PAGE_TEMPLATE, id: 'different-template' }),
      list: () => [],
    } as PageTemplateRegistry;
    expect(executeApplicationAction(
      doc,
      { type: 'page.template.insert', templateId: W2E_PAGE_TEMPLATE_ID },
      { createId: ids.createId, templateRegistry: mismatchRegistry }
    )).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });
    expect(ids.count()).toBe(0);

    const malformedRegistry = {
      get: () => ({
        id: 'malformed',
        label: 'Malformed',
        objects: [{ id: 'runtime-object-id', type: 'shape', frameU: { xU: 0, yU: 0, widthU: 1, heightU: 1 } }],
      }),
      list: () => [],
    } as unknown as PageTemplateRegistry;
    expect(executeApplicationAction(
      doc,
      { type: 'page.template.insert', templateId: 'malformed' },
      { createId: ids.createId, templateRegistry: malformedRegistry }
    )).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });
    expect(ids.count()).toBe(0);

    expect(executeApplicationAction(
      doc,
      { type: 'page.template.insert', templateId: W2E_PAGE_TEMPLATE_ID, objects: [], frameU: {} },
      { createId: ids.createId, templateRegistry: registry(W2E_PAGE_TEMPLATE) }
    )).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });
    expect(ids.count()).toBe(0);

    expect(executeApplicationAction(
      doc,
      { type: 'page.template.insert', templateId: W2E_PAGE_TEMPLATE_ID, afterPageId: 'missing-page' },
      { createId: ids.createId, templateRegistry: registry(W2E_PAGE_TEMPLATE) }
    )).toMatchObject({ ok: false, error: { code: 'PAGE_NOT_FOUND' } });
    expect(ids.count()).toBe(0);
  });

  it('validates root Image/Icon and image CellContent assets before materialization', () => {
    const noAssets = { ...documentWithAssets(), assets: [] };
    const imageTemplate = templateObjects('image');
    const iconTemplate: PageTemplateDefinition = {
      id: 'icon-template',
      label: 'Icon',
      objects: [{
        type: 'icon',
        frame: { xMm: 10, yMm: 10, widthMm: 10, heightMm: 10 },
        zIndex: 0,
        assetId: 'missing-icon',
      }],
    };
    const tableTemplate = templateObjects('table');
    const ids = countedIds('assets');

    expect(executeApplicationAction(
      noAssets,
      { type: 'page.template.insert', templateId: imageTemplate.id },
      { createId: ids.createId, templateRegistry: registry(imageTemplate) }
    )).toMatchObject({ ok: false, error: { code: 'ASSET_NOT_FOUND' } });
    expect(executeApplicationAction(
      noAssets,
      { type: 'page.template.insert', templateId: iconTemplate.id },
      { createId: ids.createId, templateRegistry: registry(iconTemplate) }
    )).toMatchObject({ ok: false, error: { code: 'ASSET_NOT_FOUND' } });
    const tableFailure = executeApplicationAction(
      noAssets,
      { type: 'page.template.insert', templateId: tableTemplate.id },
      { createId: ids.createId, templateRegistry: registry(tableTemplate) }
    );
    expect(tableFailure).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });
    if (!tableFailure.ok) expect(tableFailure.error.details).toContain('ASSET_REFERENCE_DANGLING');
    expect(ids.count()).toBe(0);
  });

  it('reuses W2.B Table remapping and freshens each independent RichText while preserving shared AssetRefs', () => {
    const doc = documentWithAssets();
    const dependencies = { createId: sequenceIds('fresh'), templateRegistry: registry(W2E_PAGE_TEMPLATE) };
    const first = executeApplicationAction(doc, { type: 'page.template.insert', templateId: W2E_PAGE_TEMPLATE_ID }, dependencies);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstPage = insertedPage(first);
    const second = executeApplicationAction(first.document, { type: 'page.template.insert', templateId: W2E_PAGE_TEMPLATE_ID }, dependencies);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const secondPage = insertedPage(second);

    expect(firstPage.id).not.toBe(secondPage.id);
    expect(new Set(canonicalPageIds(firstPage)).size).toBe(canonicalPageIds(firstPage).length);
    expect(new Set(canonicalPageIds(secondPage)).size).toBe(canonicalPageIds(secondPage).length);
    expect(canonicalPageIds(firstPage).some((id) => canonicalPageIds(secondPage).includes(id))).toBe(false);
    expect(pageRichTextIds(firstPage).some((id) => pageRichTextIds(secondPage).includes(id))).toBe(false);

    for (const page of [firstPage, secondPage]) {
      const tableObject = page.objects.find((object) => object.type === 'table');
      const imageObject = page.objects.find((object) => object.type === 'image');
      expect(tableObject?.type).toBe('table');
      expect(imageObject?.type).toBe('image');
      if (!tableObject || tableObject.type !== 'table' || !imageObject || imageObject.type !== 'image') continue;
      const anchor = tableObject.table.cells.find((cell) => cell.span);
      const covered = tableObject.table.cells.find((cell) => cell.coveredBy);
      const note = tableObject.table.annotations.find((annotation) => annotation.kind === 'note');
      const caption = tableObject.table.annotations.find((annotation) => annotation.kind === 'caption');
      const marker = tableObject.table.cells.find((cell) => cell.content.type === 'marker');
      const imageCell = tableObject.table.cells.find((cell) => cell.content.type === 'image');
      expect(covered?.coveredBy).toBe(anchor?.id);
      expect(tableObject.table.annotationIds).toEqual([caption?.id]);
      expect(tableObject.table.cells.find((cell) => cell.annotationIds)?.annotationIds).toEqual([note?.id]);
      expect(marker?.content.type === 'marker' ? marker.content.legendEntryId : undefined).toBe(tableObject.table.legend[0].id);
      expect(imageObject.assetId).toBe(W2C_PRIMARY_ASSET_ID);
      expect(imageCell?.content.type === 'image' ? imageCell.content.assetId : undefined).toBe(W2C_PRIMARY_ASSET_ID);
    }
  });

  it('keeps RichText seed identity local instead of rejecting equal IDs in separate RichTexts', () => {
    const shared = plainRichText('local', 'Mesmo escopo local');
    const localTemplate: PageTemplateDefinition = {
      id: 'local-richtext',
      label: 'RichText local',
      objects: [
        { type: 'text', frame: { xMm: 10, yMm: 10, widthMm: 40, heightMm: 10 }, zIndex: 0, text: shared, style: {} },
        { type: 'text', frame: { xMm: 10, yMm: 30, widthMm: 40, heightMm: 10 }, zIndex: 1, text: structuredClone(shared), style: {} },
      ],
    };
    const result = executeApplicationAction(
      documentWithAssets(),
      { type: 'page.template.insert', templateId: localTemplate.id },
      { createId: sequenceIds('local'), templateRegistry: registry(localTemplate) }
    );
    expect(result.ok).toBe(true);
    const page = insertedPage(result);
    const [left, right] = page.objects;
    expect(left.type).toBe('text');
    expect(right.type).toBe('text');
    if (left.type === 'text' && right.type === 'text') {
      expect(richTextIds(left.text).some((id) => richTextIds(right.text).includes(id))).toBe(false);
    }
  });

  it('reserves seed identities before first generation and fails malformed Table graph before allocator use', () => {
    const doc = documentWithAssets();
    const collision = executeApplicationAction(
      doc,
      { type: 'page.template.insert', templateId: W2E_PAGE_TEMPLATE_ID },
      { createId: () => 'w2e-table', templateRegistry: registry(W2E_PAGE_TEMPLATE) }
    );
    expect(collision).toMatchObject({ ok: false, error: { code: 'DUPLICATE_ID' } });

    const broken = structuredClone(templateObjects('table'));
    const table = broken.objects[0];
    if (table.type !== 'table') throw new Error('Expected table seed');
    table.table.cells[4].coveredBy = 'missing-cell';
    const ids = countedIds('broken');
    const brokenResult = executeApplicationAction(
      doc,
      { type: 'page.template.insert', templateId: broken.id },
      { createId: ids.createId, templateRegistry: { get: () => broken, list: () => [broken] } }
    );
    expect(brokenResult).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });
    expect(ids.count()).toBe(0);
  });

  it('is one atomic history step and redo restores exact identities without registry lookup or allocator calls', () => {
    let current: PageTemplateDefinition | undefined = W2E_PAGE_TEMPLATE;
    let registryCalls = 0;
    const mutableRegistry: PageTemplateRegistry = {
      get: () => { registryCalls += 1; return current; },
      list: () => current ? [current] : [],
    };
    const ids = countedIds('history');
    const session = createDocumentSession(documentWithAssets(), { createId: ids.createId, templateRegistry: mutableRegistry });
    const inserted = session.execute({ type: 'page.template.insert', templateId: W2E_PAGE_TEMPLATE_ID });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const insertedSnapshot = structuredClone(inserted.document);
    const generatedAtInsert = ids.count();
    expect(session.getSnapshot().canUndo).toBe(true);

    current = { ...W2E_PAGE_TEMPLATE, label: 'Registry changed', objects: [] };
    expect(session.getSnapshot().document).toEqual(insertedSnapshot);
    current = undefined;
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.pages).toHaveLength(1);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(insertedSnapshot);
    expect(ids.count()).toBe(generatedAtInsert);
    expect(registryCalls).toBe(1);
  });

  it('preserves document, undo, redo, and publication listeners on failed insertion', () => {
    let current: PageTemplateDefinition | undefined = W2E_PAGE_TEMPLATE;
    const mutableRegistry: PageTemplateRegistry = {
      get: () => current,
      list: () => current ? [current] : [],
    };
    const session = createDocumentSession(documentWithAssets(), { createId: sequenceIds('atomic'), templateRegistry: mutableRegistry });
    expect(session.execute({ type: 'page.template.insert', templateId: W2E_PAGE_TEMPLATE_ID }).ok).toBe(true);
    expect(session.undo().ok).toBe(true);
    const before = session.getSnapshot();
    let publications = 0;
    session.subscribe(() => { publications += 1; });
    current = undefined;

    expect(session.execute({ type: 'page.template.insert', templateId: W2E_PAGE_TEMPLATE_ID }))
      .toMatchObject({ ok: false, error: { code: 'TEMPLATE_NOT_FOUND' } });
    const after = session.getSnapshot();
    expect(after.document).toBe(before.document);
    expect(after.canUndo).toBe(before.canUndo);
    expect(after.canRedo).toBe(before.canRedo);
    expect(publications).toBe(0);
  });

  it('proves 100 repeated insertions reuse no generated identity', () => {
    const session = createDocumentSession(documentWithAssets(), {
      createId: sequenceIds('repeat'),
      templateRegistry: registry(W2E_PAGE_TEMPLATE),
    });
    const seen = new Set(canonicalIdentityIds(session.getSnapshot().document));
    const seenRichText = new Set<string>();
    for (let index = 0; index < 100; index += 1) {
      const result = session.execute({ type: 'page.template.insert', templateId: W2E_PAGE_TEMPLATE_ID });
      expect(result.ok).toBe(true);
      if (!result.ok) break;
      const page = result.document.pages.at(-1)!;
      const generated = [...canonicalPageIds(page), ...pageRichTextIds(page)];
      for (const id of generated) {
        expect(seen.has(id)).toBe(false);
        expect(seenRichText.has(id)).toBe(false);
        seen.add(id);
        seenRichText.add(id);
      }
    }
    expect(session.getSnapshot().document.pages).toHaveLength(101);
  });

  it('behaves as ordinary canonical content for move, resize, snapping, diagnostics, and compilePlans', () => {
    const dependencies = { createId: sequenceIds('ordinary'), templateRegistry: registry(W2E_PAGE_TEMPLATE) };
    const inserted = executeApplicationAction(
      documentWithAssets(),
      { type: 'page.template.insert', templateId: W2E_PAGE_TEMPLATE_ID },
      dependencies
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const page = insertedPage(inserted);
    const shape = page.objects.find((object) => object.type === 'shape')!;
    const table = page.objects.find((object) => object.type === 'table')!;

    const moved = executeApplicationAction(
      inserted.document,
      { type: 'object.move', objectId: shape.id, xU: mmToU(-1), yU: mmToU(shape.frame.yMm) },
      dependencies
    );
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(immediateAuthoringDiagnostics(moved.document)).toContainEqual(expect.objectContaining({
      code: 'OBJECT_OUTSIDE_PAGE',
      objectId: shape.id,
    }));

    const snap = resolveSnap({
      candidateFrameU: { xU: 3, yU: mmToU(20), widthU: mmToU(shape.frame.widthMm), heightU: mmToU(shape.frame.heightMm) },
      pageBoundsU: { xU: 0, yU: 0, widthU: mmToU(210), heightU: mmToU(297) },
      siblingFramesU: [],
      thresholdU: 5,
      axes: { x: true, y: false },
    });
    expect(snap.frameU.xU).toBe(0);
    expect(snap.guides).toContainEqual(expect.objectContaining({ axis: 'x', kind: 'page-edge' }));

    const tableFrame = table.frame;
    const resized = executeApplicationAction(
      moved.document,
      {
        type: 'object.resize',
        objectId: table.id,
        xU: mmToU(tableFrame.xMm),
        yU: mmToU(tableFrame.yMm),
        widthU: 1,
        heightU: mmToU(tableFrame.heightMm),
      },
      dependencies
    );
    expect(resized.ok).toBe(true);
    if (!resized.ok) return;
    expect(resized.document.pages.flatMap((entry) => entry.objects).find((object) => object.id === table.id)?.frame.widthMm).toBe(0.0001);
    expect(compilePlans(resized.document).diagnostics).toContainEqual(expect.objectContaining({
      code: 'TABLE_WIDTH_INFEASIBLE',
      objectId: table.id,
    }));
  });
});

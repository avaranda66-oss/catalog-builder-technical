// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDocumentSession, parseCanonicalDocument } from '@/vnext/application';
import { parsePageTemplateDefinition } from '@/vnext/application/template-registry';
import type { AssetRef, CatalogDocument, Page } from '@/vnext/domain';
import { walkPageObjects } from '@/vnext/domain';
import {
  buildPresysArchetypePage,
  createPresysArchetypeDocument,
  createPresysArchetypeTemplateRegistry,
  PRESYS_ARCHETYPES,
  PRESYS_COLOR_TOKENS,
  PRESYS_DATASHEET_SEQUENCE,
  PRESYS_FOLDER_SEQUENCE,
  PRESYS_PAGE_TOKENS,
  presysArchetype,
  presysArchetypePageTemplate,
  presysDocumentStyle,
  PresysArchetypeError,
  TO_FILL,
  type PresysArchetypeFills,
  type PresysArchetypeId,
} from '@/vnext/library/presys-archetypes';
import { createPresysPageTemplateRegistry } from '@/vnext/library/presys-ta25n-starter';
import { contentDiagnostics, placeholderDiagnostics, richTextPlainText } from '@/vnext/publication/preflight';
import { validateTable } from '@/vnext/table/table-model';

const EXAMPLE_ASSET: AssetRef = {
  id: 'example-photo', version: '1', sha256: 'a'.repeat(64), mime: 'image/png', widthPx: 3000, heightPx: 3000,
  name: 'Foto de exemplo', alt: 'Foto de exemplo',
};

function documentWith(pages: Page[], assets: AssetRef[] = []): CatalogDocument {
  return { schemaVersion: 1, id: 'archetype-test-doc', title: 'Teste', locale: 'pt-BR', style: presysDocumentStyle(), pages, assets };
}

function printedTexts(page: Page): string[] {
  const texts: string[] = [];
  for (const { object } of walkPageObjects(page)) {
    if (object.type === 'text') texts.push(richTextPlainText(object.text));
    if (object.type !== 'table') continue;
    for (const cell of object.table.cells) if (cell.content.type === 'richText') texts.push(richTextPlainText(cell.content.value));
    for (const note of object.table.annotations) texts.push(richTextPlainText(note.text));
  }
  return texts;
}

/** Example facts for every slot of an archetype: what a filled catalog page looks like. */
function exampleFills(id: PresysArchetypeId): PresysArchetypeFills {
  const fills: Record<string, PresysArchetypeFills[string]> = {};
  for (const slot of presysArchetype(id).slots) {
    if (slot.kind === 'text') fills[slot.id] = { kind: 'text', text: `${slot.label} de exemplo` };
    else if (slot.kind === 'image') fills[slot.id] = { kind: 'image', assetId: EXAMPLE_ASSET.id };
    else fills[slot.id] = { kind: 'table', header: ['Característica', 'Modelo X', 'Modelo Y'], rows: [['Faixa', '0 a 10', '0 a 20'], { section: 'Grupo' }, ['Peso', '1 kg', '2 kg']], notes: ['(*) Nota de exemplo'] };
  }
  return fills;
}

describe('FR-80 PRESYS archetypes P1–P9', () => {
  it('declares the nine blueprint archetypes in catalog order with stable, unique slot IDs', () => {
    expect(PRESYS_ARCHETYPES.map((archetype) => archetype.id)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9']);
    expect(PRESYS_ARCHETYPES.map((archetype) => archetype.label)).toEqual([
      'Capa', 'Visão geral e destaques', 'Recursos e aplicações', 'Especificações: comparação de modelos',
      'Faixas, entradas e dados gerais', 'Código de pedido', 'Fornecimento padrão e acessórios', 'Insertos e opções', 'Contracapa',
    ]);
    const slotIds = PRESYS_ARCHETYPES.flatMap((archetype) => archetype.slots.map((slot) => slot.id));
    expect(new Set(slotIds).size).toBe(slotIds.length);
    for (const archetype of PRESYS_ARCHETYPES) {
      for (const slot of archetype.slots) expect(slot.id.startsWith(`${archetype.id}.`)).toBe(true);
    }
    // The AI composition contract (blueprint §5) fills these exact IDs.
    expect(presysArchetype('P1').slots.map((slot) => slot.id)).toEqual(['P1.logo', 'P1.family', 'P1.series', 'P1.hero', 'P1.tagline', 'P1.model', 'P1.url']);
    expect(presysArchetype('P4').slots.find((slot) => slot.kind === 'table')?.id).toBe('P4.specs');
  });

  it('every archetype page and template validates in the canonical schema, with valid tables', () => {
    for (const archetype of PRESYS_ARCHETYPES) {
      const page = buildPresysArchetypePage(archetype.id, { pageId: `page-${archetype.id}` });
      expect(page).toMatchObject({ widthMm: 210, heightMm: 297, safeArea: PRESYS_PAGE_TOKENS.safeArea });
      expect(() => parseCanonicalDocument(documentWith([page]))).not.toThrow();
      for (const { object } of walkPageObjects(page)) {
        if (object.type === 'table') expect(validateTable(object.table).filter((issue) => issue.severity === 'ERROR')).toEqual([]);
        const right = object.frame.xMm + object.frame.widthMm, bottom = object.frame.yMm + object.frame.heightMm;
        expect(object.frame.xMm).toBeGreaterThanOrEqual(PRESYS_PAGE_TOKENS.safeArea.leftMm);
        expect(object.frame.yMm).toBeGreaterThanOrEqual(PRESYS_PAGE_TOKENS.safeArea.topMm);
        expect(right).toBeLessThanOrEqual(210 - PRESYS_PAGE_TOKENS.safeArea.rightMm);
        expect(bottom).toBeLessThanOrEqual(297 - PRESYS_PAGE_TOKENS.safeArea.bottomMm);
      }
      const template = presysArchetypePageTemplate(archetype.id);
      expect(parsePageTemplateDefinition(template).id).toBe(archetype.templateId);
    }
    expect(() => createPresysArchetypeTemplateRegistry()).not.toThrow();
    expect(createPresysArchetypeTemplateRegistry().list().map((template) => template.label)).toEqual(PRESYS_ARCHETYPES.map((archetype) => archetype.label));
  });

  it('an empty archetype carries no technical value, only "A COMPLETAR" markers that block publication', () => {
    const forbiddenValue = /\d+(?:[,.]\d+)?\s?(?:°C|°F|mm|kg|V\b|W\b|%|bar|psi|mA|Hz|ppm)/;
    for (const archetype of PRESYS_ARCHETYPES) {
      const page = buildPresysArchetypePage(archetype.id, { pageId: `page-${archetype.id}` });
      for (const text of printedTexts(page)) expect(text).not.toMatch(forbiddenValue);
      const placeholders = placeholderDiagnostics(documentWith([page]));
      expect(placeholders.length).toBeGreaterThan(0);
      expect(placeholders.every((issue) => issue.severity === 'ERROR' && issue.details.endsWith(`token=${TO_FILL}`))).toBe(true);
      // Every image slot is a framed box with a marker, never a stand-in picture.
      expect(page.objects.some((object) => object.type === 'image')).toBe(false);
    }
  });

  it('with example facts in every slot, each archetype passes the content preflight', () => {
    for (const archetype of PRESYS_ARCHETYPES) {
      const page = buildPresysArchetypePage(archetype.id, { pageId: `page-${archetype.id}`, fills: exampleFills(archetype.id) });
      const document = parseCanonicalDocument(documentWith([page], [EXAMPLE_ASSET]));
      expect(contentDiagnostics(document).filter((issue) => issue.severity === 'ERROR')).toEqual([]);
      expect(printedTexts(page).join('\n')).not.toContain(TO_FILL);
      const imageSlots = archetype.slots.filter((slot) => slot.kind === 'image').length;
      expect(page.objects.filter((object) => object.type === 'image')).toHaveLength(imageSlots);
    }
  });

  it('fills a table slot with any number of model columns and keeps section rows', () => {
    const page = buildPresysArchetypePage('P4', { pageId: 'specs', fills: { 'P4.specs': {
      kind: 'table', header: ['Característica', 'A', 'B', 'C', 'D', 'E'], rows: [{ section: 'Faixa avançada' }, ['Faixa', '1', '2', '3', '4', '5']],
    } } });
    const table = page.objects.find((object) => object.type === 'table');
    if (table?.type !== 'table') throw new Error('missing table');
    expect(table.table.columns).toHaveLength(6);
    expect(table.table.columns[0].width).toEqual({ mode: 'fixed', mm: 52 });
    expect(table.table.rows.map((row) => row.role)).toEqual(['header', 'section', 'body']);
    expect(validateTable(table.table).filter((issue) => issue.severity === 'ERROR')).toEqual([]);
  });

  it('rejects fills for unknown slots or of the wrong kind', () => {
    expect(() => buildPresysArchetypePage('P1', { pageId: 'x', fills: { 'P1.nope': { kind: 'text', text: 'a' } } })).toThrow(PresysArchetypeError);
    expect(() => buildPresysArchetypePage('P1', { pageId: 'x', fills: { 'P1.model': { kind: 'image', assetId: 'a' } } })).toThrow(PresysArchetypeError);
  });

  it('uses the blueprint tokens: navy headings, red accent band on the cover, header fill on tables', () => {
    const cover = buildPresysArchetypePage('P1', { pageId: 'cover' });
    expect(cover.objects.some((object) => object.type === 'shape' && object.style.fill === PRESYS_COLOR_TOKENS.red)).toBe(true);
    const specs = buildPresysArchetypePage('P4', { pageId: 'specs' });
    const title = specs.objects.find((object) => object.type === 'text');
    expect(title?.type === 'text' && title.style).toMatchObject({ fontSizePt: 24, fontWeight: 700, color: PRESYS_COLOR_TOKENS.navy });
    const table = specs.objects.find((object) => object.type === 'table');
    expect(table?.type === 'table' && table.table.style.rowRoles.header?.background).toBe(PRESYS_COLOR_TOKENS.headerFill);
    const datasheet = buildPresysArchetypePage('P2', { pageId: 'overview', variant: 'datasheet' });
    const intro = datasheet.objects.find((object) => object.type === 'text' && richTextPlainText(object.text).startsWith('Apresente'));
    expect(intro?.type === 'text' && intro.style.fontSizePt).toBe(9.5);
  });

  it('builds the datasheet (6 pages) and the folder (10 pages, ends with the back cover) as valid documents', () => {
    const sheet = parseCanonicalDocument(createPresysArchetypeDocument({ documentId: 'sheet', title: 'Ficha técnica', sequence: PRESYS_DATASHEET_SEQUENCE, variant: 'datasheet' }));
    expect(sheet.pages).toHaveLength(6);
    const folder = parseCanonicalDocument(createPresysArchetypeDocument({ documentId: 'folder', title: 'Folder', sequence: PRESYS_FOLDER_SEQUENCE }));
    expect(folder.pages).toHaveLength(10);
    expect(folder.pages[9].id).toContain('p9');
  });

  it('inserts every archetype through the production page-template registry, with Desfazer', () => {
    const base = documentWith([{ id: 'first', widthMm: 210, heightMm: 297, objects: [] }]);
    let next = 0;
    const session = createDocumentSession(base, { createId: () => `generated-${++next}`, templateRegistry: createPresysPageTemplateRegistry() });
    for (const archetype of PRESYS_ARCHETYPES) {
      const pages = session.getSnapshot().document.pages;
      const result = session.execute({ type: 'page.template.insert', templateId: archetype.templateId, afterPageId: pages[pages.length - 1].id });
      expect(result.ok).toBe(true);
    }
    expect(session.getSnapshot().document.pages).toHaveLength(10);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.pages).toHaveLength(9);
  });
});

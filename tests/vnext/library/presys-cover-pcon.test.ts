import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDocumentSession, parseCanonicalDocument } from '@/vnext/application';
import { parsePageTemplateDefinition } from '@/vnext/application/template-registry';
import type { CatalogDocument, EditorialObject, Page, TextObject } from '@/vnext/domain';
import { mmToU } from '@/vnext/domain/physical';
import { isPageBackground, layerName, objectsAtPoint, resolvePlainClickTarget, sendToBackTarget } from '@/vnext/editor/object-layers';
import { presysDocumentStyle } from '@/vnext/library/presys-archetypes';
import {
  buildPresysPconCoverPage, createPconHibridoCoverExample, PCON_HIBRIDO_COVER_TEXTS, PCON_HIBRIDO_PHOTO, pconCoverSlotObjectId,
  pconHibridoCoverFills, PRESYS_PCON_COVER, PRESYS_PCON_COVER_TEMPLATE_ID, presysPconCoverPageTemplate,
} from '@/vnext/library/presys-cover-pcon';
import { presysPageModelChoices } from '@/vnext/library/presys-page-models';
import { createPresysPageTemplateRegistry } from '@/vnext/library/presys-ta25n-starter';
import { authoredFrameDiagnostics, placeholderDiagnostics, richTextPlainText } from '@/vnext/publication/preflight';

const plain = (object: EditorialObject | undefined) => (object?.type === 'text' ? richTextPlainText(object.text) : '');
const byId = (page: Page, id: string) => page.objects.find((object) => object.id === id);
const texts = (page: Page) => page.objects.filter((object): object is TextObject => object.type === 'text');
const at = (xMm: number, yMm: number) => ({ xU: mmToU(xMm), yU: mmToU(yMm) });

describe('Onda 3.5 S3 — "Capa de produto — PCON" made only of native elements', () => {
  const example = parseCanonicalDocument(createPconHibridoCoverExample());
  const cover = example.pages[0];

  it('rebuilds the PCON-HIBRIDO cover without baked art: the only image is the official product photo', () => {
    const images = cover.objects.filter((object) => object.type === 'image');
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ assetId: PCON_HIBRIDO_PHOTO.id, fit: 'contain', frame: { xMm: 46, yMm: 58, widthMm: 120 } });
    expect(example.assets).toEqual([PCON_HIBRIDO_PHOTO]);
    // Diagonal background: gradient + pattern on each half, the white divider, and the family-bar pointer.
    const polygons = cover.objects.filter((object) => object.type === 'polygon');
    expect(polygons.map((object) => object.id.replace('capa-pcon-hibrido-', ''))).toEqual(
      ['fundo-azul', 'fundo-azul-padrao', 'fundo-dourado', 'fundo-dourado-padrao', 'divisa', 'modelo-atual-seta']);
    expect(polygons.map((object) => object.type === 'polygon' && object.style.fill?.kind)).toEqual(['linear', 'pattern', 'linear', 'pattern', 'solid', 'solid']);
    // Pills and family bar are selos; the two callouts carry their pointer.
    const selos = texts(cover).filter((object) => object.box);
    expect(selos.map(plain)).toEqual(['0 a 250 psi', '0 a 360 psi', '100 a 1500 psi', '100 a 3000 psi', '100 a 6000 psi', '100 a 10000 psi',
      'KOMPRESSOR-Y18', 'Y18-BP', 'Y18-LP', 'Y17', 'DT', 'HÍBRIDO']);
    expect(selos.every((object) => object.box?.fitText)).toBe(true);
    const callouts = texts(cover).filter((object) => object.leader);
    expect(callouts.map(plain)).toEqual(['Saída pneumática\n(PNEUMATIC OUTPUT)', 'BAROM. REF, como\nimpresso no painel']);
    // The pointers end on the photo (page mm), where the published overlay drew them.
    expect(callouts.map((object) => [object.frame.xMm + object.leader!.anchorXMm, object.frame.yMm + object.leader!.anchorYMm]))
      .toEqual([[71.4, 135.4], [84.6, 134.9]]);
    expect(cover.objects.find((object) => object.type === 'group')?.id).toBe('capa-pcon-hibrido-sombra');
  });

  it('keeps every slot at a stable object id, filled with the published texts', () => {
    for (const slot of PRESYS_PCON_COVER.slots) {
      const object = byId(cover, pconCoverSlotObjectId(cover.id, slot.id));
      expect(object, slot.id).toBeDefined();
      expect(object!.type).toBe(slot.kind);
      if (slot.kind === 'text') expect(plain(object)).toBe(PCON_HIBRIDO_COVER_TEXTS[slot.id]);
    }
    expect(PRESYS_PCON_COVER.slots.map((slot) => slot.id)).toEqual(expect.arrayContaining(
      ['C1.titulo', 'C1.subtitulo', 'C1.foto', 'C1.pilula-a1', 'C1.pilula-b4', 'C1.chamada-1', 'C1.chamada-2', 'C1.modelo-1', 'C1.modelo-6']));
    expect(new Set(PRESYS_PCON_COVER.slots.map((slot) => slot.id)).size).toBe(PRESYS_PCON_COVER.slots.length);
    expect(() => pconCoverSlotObjectId('p', 'C1.inexistente')).toThrow();
    expect(() => buildPresysPconCoverPage({ pageId: 'p', fills: { 'C1.titulo': { kind: 'image', assetId: 'x' } } })).toThrow('expects text');
    expect(() => buildPresysPconCoverPage({ pageId: 'p', currentModel: 7 })).toThrow();
  });

  it('highlights the chosen model in the family bar and moves the pointer over it', () => {
    const page = buildPresysPconCoverPage({ pageId: 'p', fills: pconHibridoCoverFills(), currentModel: 5 });
    const dt = byId(page, 'p-modelo-5') as TextObject, hybrid = byId(page, 'p-modelo-6') as TextObject;
    expect(dt.box?.fill).toBe('#8A642B');
    expect(dt.style.color).toBe('#FFFFFF');
    expect(hybrid.box?.fill).toBe('#FFFFFF');
    const pointer = byId(page, 'p-modelo-atual-seta')!;
    expect(pointer.frame.xMm + pointer.frame.widthMm / 2).toBeCloseTo(dt.frame.xMm + dt.frame.widthMm / 2, 3);
  });

  it('passes the static preflight: no placeholder, nothing outside the page or safe area', () => {
    expect(placeholderDiagnostics(example)).toEqual([]);
    expect(authoredFrameDiagnostics(example).filter((item) => item.severity === 'ERROR')).toEqual([]);
    expect(authoredFrameDiagnostics(example).filter((item) => item.code !== 'OBJECT_OUTSIDE_PAGE').map((item) => item.code)).toEqual([]);
  });

  it('is registered as a PRESYS page model, inserted in one undoable step with the fresh template', () => {
    const registry = createPresysPageTemplateRegistry();
    expect(registry.get(PRESYS_PCON_COVER_TEMPLATE_ID)?.label).toBe('Capa de produto — PCON');
    expect(() => parsePageTemplateDefinition(presysPconCoverPageTemplate())).not.toThrow();
    expect(presysPageModelChoices({ includeTa25n: false }).map((choice) => choice.templateId)).toContain(PRESYS_PCON_COVER_TEMPLATE_ID);
    const base: CatalogDocument = { schemaVersion: 1, id: 'doc', title: 'Teste', locale: 'pt-BR', style: presysDocumentStyle(), assets: [],
      pages: [{ id: 'first', widthMm: 210, heightMm: 297, objects: [] }] };
    let next = 0;
    const session = createDocumentSession(base, { createId: () => `generated-${++next}`, templateRegistry: registry });
    const inserted = session.execute({ type: 'page.template.insert', templateId: PRESYS_PCON_COVER_TEMPLATE_ID, afterPageId: 'first' }, { transactionId: 'tx-capa' });
    expect(inserted.ok).toBe(true);
    const page = session.getSnapshot().document.pages[1];
    expect(page.objects.filter((object) => object.type === 'polygon')).toHaveLength(6);
    // Without the real photo the slot says what is missing (no invented art).
    expect(page.objects.some((object) => object.type === 'image')).toBe(false);
    expect(texts(page).some((object) => plain(object) === 'Foto do produto (A COMPLETAR)')).toBe(true);
    expect(placeholderDiagnostics(session.getSnapshot().document).length).toBeGreaterThan(0);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(base);
  });

  it('is the example committed in docs/examples (only the official photo as asset)', () => {
    const file = JSON.parse(readFileSync(resolve(__dirname, '../../../docs/examples/presys-capa-pcon-hibrido.catalog.json'), 'utf8'));
    expect(file).toEqual(example);
  });

  it('clicks reach the half of the diagonal under the pointer, and "Enviar ao fundo" keeps texts in front of it', () => {
    const top = (xMm: number, yMm: number) => objectsAtPoint(cover, at(xMm, yMm))[0]?.id.replace('capa-pcon-hibrido-', '');
    expect(top(20, 120)).toBe('fundo-azul-padrao');
    expect(top(190, 120)).toBe('fundo-dourado-padrao');
    // The pattern is locked texture: a plain click reaches the colour of the half under the pointer.
    const pick = (xMm: number, yMm: number) => resolvePlainClickTarget(objectsAtPoint(cover, at(xMm, yMm)), () => false, at(xMm, yMm))?.id;
    expect(pick(20, 120)).toBe('capa-pcon-hibrido-fundo-azul');
    expect(pick(190, 120)).toBe('capa-pcon-hibrido-fundo-dourado');
    expect(pick(100, 100)).toBe('capa-pcon-hibrido-foto');
    // Same box, other half: the blue polygons are not under a point of the golden half.
    expect(objectsAtPoint(cover, at(190, 120)).some((object) => object.id.endsWith('fundo-azul'))).toBe(false);
    expect(isPageBackground(byId(cover, 'capa-pcon-hibrido-fundo-dourado')!, cover)).toBe(true);
    expect(isPageBackground(byId(cover, 'capa-pcon-hibrido-divisa')!, cover)).toBe(false);
    const back = sendToBackTarget(cover, 'capa-pcon-hibrido-titulo');
    expect(back.keptAbove?.id).toBe('capa-pcon-hibrido-fundo-dourado-padrao');
  });

  it('names every native element plainly in "Camadas"', () => {
    const name = (id: string) => layerName(byId(cover, `capa-pcon-hibrido-${id}`)!, example, cover);
    expect(name('fundo-azul')).toBe('Forma livre com degradê');
    expect(name('fundo-azul-padrao')).toBe('Forma livre com padrão');
    expect(name('modelo-atual-seta')).toBe('Triângulo');
    expect(name('pilula-a1')).toBe('Selo “0 a 250 psi”');
    expect(name('chamada-1')).toBe('Chamada “Saída pneumática (PNEUMATIC OUTPUT)”');
    expect(name('titulo')).toBe('Texto “PCON HÍBRIDO”');
    expect(name('foto')).toBe('Imagem …rid-official-trim');
  });

  it('names every empty piece of the template differently in "Camadas", and each one still asks to be filled (Onda 4, P)', () => {
    const page = buildPresysPconCoverPage({ pageId: 'vazia' });
    const document: CatalogDocument = { ...example, pages: [page], assets: [] };
    const pieces = texts(page).filter((object) => plain(object).includes('A COMPLETAR'));
    const names = pieces.map((object) => layerName(object, document, page));
    // Before: 6 × Texto “A COMPLETAR” and 12 × Selo “A COMPLETAR”. Now every name is different and short enough to be
    // shown whole (Camadas shows the first 5 words).
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((value) => value.endsWith('…'))).toEqual([]);
    expect(names).not.toContain('Texto “A COMPLETAR”');
    expect(names).not.toContain('Selo “A COMPLETAR”');
    expect(names).toEqual(expect.arrayContaining([
      'Texto “Azul (A COMPLETAR)”', 'Texto “Dourado (A COMPLETAR)”',
      'Texto “Legenda azul (A COMPLETAR)”', 'Texto “Legenda dourada (A COMPLETAR)”',
      'Texto “Faixas azuis (A COMPLETAR)”', 'Selo “Faixa azul 1 (A COMPLETAR)”', 'Selo “Faixa azul 2 (A COMPLETAR)”',
      'Texto “Faixas douradas (A COMPLETAR)”', 'Selo “Faixa dourada 4 (A COMPLETAR)”',
      'Selo “Modelo 1 (A COMPLETAR)”', 'Selo “Modelo 6 (A COMPLETAR)”',
      'Texto “Rodapé, linha 1 (A COMPLETAR)”', 'Texto “Rodapé, linha 2 (A COMPLETAR)”',
      'Chamada “Detalhe 1 (A COMPLETAR)”', 'Texto “Nome do produto (A COMPLETAR)”',
    ]));
    // Only the brand comes written; every other text (and the photo box) is reported by the publication review.
    expect(texts(page).filter((object) => !plain(object).includes('A COMPLETAR')).map((object) => object.id)).toEqual(['vazia-marca']);
    const reported = new Set(placeholderDiagnostics(document).map((item) => item.objectId));
    for (const object of pieces) expect(reported.has(object.id), object.id).toBe(true);
    // The narrow selos keep the marker on its own line, so the name stays readable inside them.
    expect(plain(byId(page, 'vazia-pilula-a1'))).toBe('Faixa azul 1\n(A COMPLETAR)');
    expect(plain(byId(page, 'vazia-modelo-6'))).toBe('Modelo 6\n(A COMPLETAR)');
  });
});

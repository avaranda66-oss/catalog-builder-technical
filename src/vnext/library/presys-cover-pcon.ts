import { createStaticPageTemplateRegistry, type PageTemplateDefinition, type PageTemplateRegistry } from '../application/template-registry';
import { objectInstantiationSeedFromObject } from '../application/document';
import type {
  AssetRef, CatalogDocument, DocumentStyle, EditorialObject, GroupObject, ImageObject, LineObject, Page, Paint, PolygonObject,
  ShapeObject, TextBox, TextLeader, TextObject,
} from '../domain';
import {
  PresysArchetypeError, richParagraphs, TO_FILL, toFill,
  type PresysArchetypeFills, type PresysArchetypeSlot, type PresysArchetypeSlotFill, type PresysArchetypeSlotKind,
} from './presys-archetypes';

/**
 * Onda 3.5 (S3): "Capa de produto — PCON", the PCON-HIBRIDO cover rebuilt ONLY with native elements, so every part
 * of it can be clicked and changed in the editor (nothing is baked into a PNG any more):
 *
 *   - two-colour diagonal background: 2 gradient polygons + 2 pattern polygons (dots / waves) + a thin white divider;
 *   - soft contact shadow under the product (3 transparent ellipses in one group);
 *   - the product photo (only the real official photo; without one the slot is an "A COMPLETAR" box);
 *   - callouts ("Chamada": the label text carries its own pointer, so moving the label moves the arrow);
 *   - pills ("Selo": the pill and its words are one object) and the model-family bar (6 selos + a pointer triangle);
 *   - every text, with the measured frames and styles of the published cover.
 *
 * Slots have stable IDs ("C1.<name>") and the object made for a slot is always `<pageId>-<name>`, so the editor, the
 * tests and the assistant (Onda 4) can fill the same template: `buildPresysPconCoverPage(..., { fills })`.
 */

export const PRESYS_PCON_COVER_TEMPLATE_ID = 'presys-capa-produto-pcon';

/** Colours measured on the published PCON-HIBRIDO cover (review PDF, 300 ppi). */
export const PCON_COVER_COLORS = Object.freeze({
  navyTop: '#173F65', navyBottom: '#0C2640', pillNavy: '#173F66',
  goldTop: '#996F32', goldBottom: '#644516', gold: '#8A642B', waves: '#E9CC92',
  ink: '#092D4D', text: '#20364C', muted: '#536778', sky: '#B7CDE2', cream: '#F3DDB8', rule: '#CDD9E1',
  white: '#FFFFFF', black: '#000000', slotFill: '#F2F5F8', slotStroke: '#9FB3C4',
});
const K = PCON_COVER_COLORS;
/** The cover bleeds its background to the edges; texts keep 8 mm (the footer ends at 288.7 mm). */
const COVER_SAFE_AREA = Object.freeze({ topMm: 8, rightMm: 8, bottomMm: 8, leftMm: 8 });
const FONT = 'Noto Sans';

/** The diagonal: x (mm) where it meets the top of the page and the bottom of the coloured area. */
export const PCON_COVER_GEOMETRY = Object.freeze({
  bandHeightMm: 196, diagonalTopXMm: 128, diagonalBottomXMm: 82.2,
  photo: Object.freeze([46, 58, 120, 116.494] as const),
  familyBar: Object.freeze({ xMm: 14, yMm: 265, widthMm: 29.083, pitchMm: 30.5834, heightMm: 7.8 }),
});
const G = PCON_COVER_GEOMETRY;

export interface PresysCoverTemplate {
  readonly id: 'C1';
  readonly templateId: string;
  readonly label: string;
  readonly description: string;
  readonly slots: readonly PresysArchetypeSlot[];
}

const slot = (id: string, kind: PresysArchetypeSlotKind, label: string): PresysArchetypeSlot => ({ id, kind, label });
const PILLS_A = ['a1', 'a2'] as const;
const PILLS_B = ['b1', 'b2', 'b3', 'b4'] as const;
const MODELS = [1, 2, 3, 4, 5, 6] as const;

export const PRESYS_PCON_COVER: PresysCoverTemplate = Object.freeze({
  id: 'C1', templateId: PRESYS_PCON_COVER_TEMPLATE_ID, label: 'Capa de produto — PCON',
  description: 'Fundo diagonal em duas cores com padrão, foto do produto com chamadas, pílulas de faixas e a barra de modelos da família. Tudo editável.',
  slots: Object.freeze([
    slot('C1.marca', 'text', 'Marca'), slot('C1.frase-topo', 'text', 'Frase do topo'),
    slot('C1.lado-a-titulo', 'text', 'Título do lado azul'), slot('C1.lado-a-legenda', 'text', 'Legenda do lado azul'),
    slot('C1.lado-b-titulo', 'text', 'Título do lado dourado'), slot('C1.lado-b-legenda', 'text', 'Legenda do lado dourado'),
    slot('C1.foto', 'image', 'Foto do produto'),
    slot('C1.chamada-1', 'text', 'Chamada 1 (texto da seta)'), slot('C1.chamada-2', 'text', 'Chamada 2 (texto da seta)'),
    slot('C1.titulo', 'text', 'Título'), slot('C1.subtitulo', 'text', 'Subtítulo'), slot('C1.destaque', 'text', 'Frase de destaque'),
    slot('C1.pilulas-a-titulo', 'text', 'Título das pílulas azuis'),
    ...PILLS_A.map((key, index) => slot(`C1.pilula-${key}`, 'text', `Pílula azul ${index + 1}`)),
    slot('C1.pilulas-b-titulo', 'text', 'Título das pílulas douradas'),
    ...PILLS_B.map((key, index) => slot(`C1.pilula-${key}`, 'text', `Pílula dourada ${index + 1}`)),
    slot('C1.nota', 'text', 'Nota técnica'),
    slot('C1.barra-modelos-titulo', 'text', 'Título da barra de modelos'),
    ...MODELS.map((index) => slot(`C1.modelo-${index}`, 'text', `Modelo ${index} da barra`)),
    slot('C1.rodape-1', 'text', 'Rodapé, linha 1'), slot('C1.rodape-2', 'text', 'Rodapé, linha 2'),
  ]),
});

/** Object ID made for a slot on a page built by `buildPresysPconCoverPage` (for example C1.titulo → `<pageId>-titulo`). */
export function pconCoverSlotObjectId(pageId: string, slotId: string): string {
  if (!PRESYS_PCON_COVER.slots.some((entry) => entry.id === slotId)) throw new PresysArchetypeError(`Unknown slot ${slotId} for C1`);
  return `${pageId}-${slotId.slice('C1.'.length)}`;
}

export interface BuildPresysPconCoverOptions {
  /** Page ID; object IDs are derived from it. */
  readonly pageId: string;
  readonly fills?: PresysArchetypeFills;
  /** Which model of the family bar is highlighted (1–6, default 6). */
  readonly currentModel?: number;
}

type Frame = readonly [xMm: number, yMm: number, widthMm: number, heightMm: number];
interface Style { readonly size: number; readonly bold?: boolean; readonly color: string; readonly align?: 'left' | 'center' | 'right' }

const frameOf = (frame: Frame) => ({ xMm: frame[0], yMm: frame[1], widthMm: frame[2], heightMm: frame[3] });
const round4 = (value: number) => Math.round(value * 10000) / 10000;

class CoverBuilder {
  readonly objects: EditorialObject[] = [];
  private z = 0;
  private readonly used = new Set<string>();

  constructor(private readonly pageId: string, private readonly fills: PresysArchetypeFills) {
    for (const slotId of Object.keys(fills)) {
      const declared = PRESYS_PCON_COVER.slots.find((entry) => entry.id === slotId);
      if (!declared) throw new PresysArchetypeError(`Unknown slot ${slotId} for C1`);
      if (declared.kind !== fills[slotId].kind) throw new PresysArchetypeError(`Slot ${slotId} expects ${declared.kind}`);
    }
  }

  id(name: string): string {
    const value = `${this.pageId}-${name}`;
    if (this.used.has(value)) throw new PresysArchetypeError(`Duplicate cover object ${value}`);
    this.used.add(value);
    return value;
  }

  fill(name: string): PresysArchetypeSlotFill | undefined {
    return this.fills[`C1.${name}`];
  }

  text(name: string, defaultValue: string, frame: Frame, style: Style, extra: { box?: TextBox; leader?: TextLeader } = {}): TextObject {
    const fill = this.fill(name);
    const id = this.id(name);
    const object: TextObject = {
      id, type: 'text', zIndex: this.z++, frame: frameOf(frame),
      text: richParagraphs(`${id}-rich`, fill?.kind === 'text' ? fill.text : defaultValue),
      style: {
        fontFamily: FONT, fontSizePt: style.size, lineHeight: 1.2, fontWeight: style.bold ? 700 : 400, color: style.color,
        ...(style.align && style.align !== 'left' ? { textAlign: style.align } : {}),
      },
      ...(extra.box ? { box: extra.box } : {}),
      ...(extra.leader ? { leader: extra.leader } : {}),
    };
    this.objects.push(object);
    return object;
  }

  polygon(name: string, frame: Frame, points: readonly (readonly [number, number])[], fill: Paint, opacity?: number, locked = false): void {
    const object: PolygonObject = {
      id: this.id(name), type: 'polygon', zIndex: this.z++, frame: frameOf(frame),
      points: points.map(([x, y]) => ({ x: round4(x), y: round4(y) })),
      style: { fill, ...(opacity === undefined ? {} : { opacity }) },
      ...(locked ? { locked: true } : {}),
    };
    this.objects.push(object);
  }

  shadow(name: string, frame: Frame): void {
    const id = this.id(name);
    // Three soft, transparent ellipses (largest first) read as a blurred contact shadow, on screen and in print.
    const rings: readonly [Frame, number][] = [
      [[0, 0, frame[2], frame[3]], 0.07],
      [[frame[2] * 0.08, frame[3] * 0.15, frame[2] * 0.84, frame[3] * 0.7], 0.09],
      [[frame[2] * 0.16, frame[3] * 0.3, frame[2] * 0.68, frame[3] * 0.45], 0.12],
    ];
    const group: GroupObject = {
      id, type: 'group', zIndex: this.z++, frame: frameOf(frame),
      objects: rings.map(([ring, opacity], index): ShapeObject => ({
        id: this.id(`${name}-${index + 1}`), type: 'shape', shape: 'ellipse', zIndex: index,
        frame: frameOf(ring.map(round4) as unknown as Frame), style: { fill: K.black, opacity },
      })),
    };
    this.objects.push(group);
  }

  photo(name: string, frame: Frame): void {
    const fill = this.fill(name);
    if (fill?.kind === 'image') {
      const image: ImageObject = { id: this.id(name), type: 'image', zIndex: this.z++, assetId: fill.assetId, fit: fill.fit ?? 'contain', frame: frameOf(frame) };
      this.objects.push(image);
      return;
    }
    // No invented art: without the real photo the slot is a light box that says what is missing.
    this.objects.push({
      id: this.id(`${name}-caixa`), type: 'shape', shape: 'rectangle', zIndex: this.z++, frame: frameOf(frame),
      style: { fill: K.slotFill, stroke: { pattern: 'solid', thicknessPt: 0.75, color: K.slotStroke } },
    });
    const height = 11;
    this.objects.push({
      id: this.id(`${name}-aviso`), type: 'text', zIndex: this.z++,
      frame: frameOf([frame[0] + 2, frame[1] + (frame[3] - height) / 2, frame[2] - 4, height]),
      text: richParagraphs(`${this.pageId}-${name}-aviso-rich`, toFill('Foto do produto')),
      style: { fontFamily: FONT, fontSizePt: 10, lineHeight: 1.2, fontWeight: 400, color: K.muted, textAlign: 'center' },
    });
  }

  line(name: string, frame: Frame, color: string): void {
    const line: LineObject = { id: this.id(name), type: 'line', axis: 'horizontal', color, thicknessPt: 0.75, zIndex: this.z++, frame: frameOf(frame) };
    this.objects.push(line);
  }
}

const pill = (fill: string): TextBox => ({ fill, paddingMm: 1.1, fitText: true });
/**
 * Onda 4 (P): what an empty selo says. Each piece names itself ("Faixa azul 1", "Modelo 6"), so "Camadas" lists
 * 12 different selos instead of 12 × "A COMPLETAR"; the marker goes on a second line, so the name stays readable
 * in the narrow selo, and the publication review still finds "A COMPLETAR".
 */
const pillPlaceholder = (name: string) => `${name}\n(${TO_FILL})`;
const callout = (anchorXMm: number, anchorYMm: number): TextLeader =>
  ({ anchorXMm, anchorYMm, head: 'dot', elbow: false, color: K.white, thicknessPt: 0.6 });

/** The PCON cover as a canonical A4 page with explicit, stable IDs. */
export function buildPresysPconCoverPage(options: BuildPresysPconCoverOptions): Page {
  const current = options.currentModel ?? 6;
  if (!Number.isInteger(current) || current < 1 || current > 6) throw new PresysArchetypeError(`Family bar has no model ${current}`);
  const b = new CoverBuilder(options.pageId, options.fills ?? {});
  const H = G.bandHeightMm, top = G.diagonalTopXMm / 210, bottom = G.diagonalBottomXMm / 210;
  const blueSide = [[0, 0], [top, 0], [bottom, 1], [0, 1]] as const;
  const goldSide = [[top, 0], [1, 0], [1, 1], [bottom, 1]] as const;
  // Background, back to front: each half is a gradient polygon with a pattern polygon over it. The patterns are
  // locked texture, so a click on a half reaches its colour (the pattern is changed after unlocking it in "Camadas").
  b.polygon('fundo-azul', [0, 0, 210, H], blueSide, { kind: 'linear', from: K.navyTop, to: K.navyBottom, angleDeg: 90 });
  b.polygon('fundo-azul-padrao', [0, 0, 210, H], blueSide, { kind: 'pattern', pattern: 'dots', color: K.white, spacingMm: 3.2 }, 0.16, true);
  b.polygon('fundo-dourado', [0, 0, 210, H], goldSide, { kind: 'linear', from: K.goldTop, to: K.goldBottom, angleDeg: 90 });
  b.polygon('fundo-dourado-padrao', [0, 0, 210, H], goldSide, { kind: 'pattern', pattern: 'waves', color: K.waves, spacingMm: 4.2 }, 0.32, true);
  const dx = G.diagonalBottomXMm - 0.3, dw = G.diagonalTopXMm + 0.3 - dx, at = (x: number) => (x - dx) / dw;
  b.polygon('divisa', [dx, 0, dw, H], [[at(G.diagonalTopXMm - 0.25), 0], [at(G.diagonalTopXMm + 0.25), 0],
    [at(G.diagonalBottomXMm + 0.25), 1], [at(G.diagonalBottomXMm - 0.25), 1]], { kind: 'solid', color: K.white }, 0.9);
  b.shadow('sombra', [64, 166.5, 100, 10]);
  b.photo('foto', G.photo);
  // Top of the coloured area.
  b.text('marca', 'PRESYS', [14, 14, 70, 10.859], { size: 19, bold: true, color: K.white });
  b.text('frase-topo', toFill('Frase do topo'), [120, 18, 76, 4.448], { size: 7.2, bold: true, color: K.cream, align: 'right' });
  // Empty pieces name themselves (Onda 4, P) in words that still fit their box: "Título dourado (A COMPLETAR)" would
  // not fit 70 mm at 15 pt, so the two side titles are just the colour of their half.
  b.text('lado-a-titulo', toFill('Azul'), [14, 34, 70, 8.573], { size: 15, bold: true, color: K.white });
  b.text('lado-b-titulo', toFill('Dourado'), [126, 34, 70, 8.573], { size: 15, bold: true, color: K.white, align: 'right' });
  b.text('lado-a-legenda', toFill('Legenda azul'), [14, 42.5, 64, 4.448], { size: 7.2, color: K.sky });
  b.text('lado-b-legenda', toFill('Legenda dourada'), [136, 42.5, 60, 7.496], { size: 7.2, color: K.cream, align: 'right' });
  // Callouts: the pointer is measured from the label's top-left corner and ends on the product photo.
  b.text('chamada-1', toFill('Detalhe 1'), [14, 158, 36, 7.496], { size: 7.2, bold: true, color: K.white, align: 'right' }, { leader: callout(57.4, -22.6) });
  b.text('chamada-2', toFill('Detalhe 2'), [14, 172, 36, 7.496], { size: 7.2, bold: true, color: K.white, align: 'right' }, { leader: callout(70.6, -37.1) });
  // White area: product name, pills and the family bar.
  b.text('titulo', toFill('Nome do produto'), [14, 202, 182, 16.003], { size: 28, bold: true, color: K.ink });
  b.text('subtitulo', toFill('Descrição do produto'), [14, 215.5, 182, 6.001], { size: 10.5, color: K.text });
  b.text('destaque', toFill('Frase de destaque'), [14, 221.5, 182, 5.21], { size: 9, bold: true, color: K.gold });
  b.text('pilulas-a-titulo', toFill('Faixas azuis'), [14, 230, 70, 4.194], { size: 6.6, bold: true, color: K.muted });
  PILLS_A.forEach((key, index) => b.text(`pilula-${key}`, pillPlaceholder(`Faixa azul ${index + 1}`), [14 + index * 18.65, 235.2, 16.85, 6.6],
    { size: 6.4, bold: true, color: K.white, align: 'center' }, { box: pill(K.pillNavy) }));
  b.text('pilulas-b-titulo', toFill('Faixas douradas'), [84, 230, 112, 4.194], { size: 6.6, bold: true, color: K.muted });
  PILLS_B.forEach((key, index) => b.text(`pilula-${key}`, pillPlaceholder(`Faixa dourada ${index + 1}`), [84 + index * 23.3, 235.2, index === 3 ? 23.05 : 21.5, 6.6],
    { size: 6.4, bold: true, color: K.white, align: 'center' }, { box: pill(K.gold) }));
  b.text('nota', toFill('Nota técnica'), [14, 245, 182, 7.158], { size: 6.8, color: K.muted });
  b.text('barra-modelos-titulo', toFill('Família'), [14, 259.4, 60, 4.11], { size: 6.4, bold: true, color: K.muted });
  const bar = G.familyBar;
  for (const index of MODELS) {
    const highlighted = index === current;
    b.text(`modelo-${index}`, pillPlaceholder(`Modelo ${index}`), [round4(bar.xMm + (index - 1) * bar.pitchMm), bar.yMm, bar.widthMm, bar.heightMm],
      { size: 6.6, bold: true, color: highlighted ? K.white : K.muted, align: 'center' },
      { box: { fill: highlighted ? K.gold : K.white, stroke: { pattern: 'solid', thicknessPt: 0.75, color: highlighted ? K.gold : K.rule },
        cornerRadiusMm: 1.2, paddingMm: 2.2, fitText: true } });
  }
  const pointerX = round4(bar.xMm + (current - 1) * bar.pitchMm + bar.widthMm / 2 - 1.5);
  b.polygon('modelo-atual-seta', [pointerX, 264.2, 3, 1.8], [[0, 0], [1, 0], [0.5, 1]], { kind: 'solid', color: K.ink });
  b.line('regua', [14, 278, 182, 0.3], K.rule);
  b.text('rodape-1', toFill('Rodapé, linha 1'), [14, 280.4, 182, 4.279], { size: 6.8, color: K.muted });
  b.text('rodape-2', toFill('Rodapé, linha 2'), [14, 284.4, 182, 4.279], { size: 6.8, color: K.muted });
  return {
    id: options.pageId, widthMm: 210, heightMm: 297,
    safeArea: { ...COVER_SAFE_AREA }, objects: b.objects,
  };
}

/** The cover as a page template ("Usar modelo…"): the same objects, without root IDs. */
export function presysPconCoverPageTemplate(fills?: PresysArchetypeFills, currentModel?: number): PageTemplateDefinition {
  const page = buildPresysPconCoverPage({ pageId: PRESYS_PCON_COVER.templateId, fills, currentModel });
  return {
    id: PRESYS_PCON_COVER.templateId, label: PRESYS_PCON_COVER.label, description: PRESYS_PCON_COVER.description,
    safeArea: { ...COVER_SAFE_AREA }, objects: page.objects.map(objectInstantiationSeedFromObject),
  };
}

export function createPresysCoverTemplateRegistry(): PageTemplateRegistry {
  return createStaticPageTemplateRegistry([presysPconCoverPageTemplate()]);
}

/** Texts of the published PCON-HIBRIDO cover (catalog PCON-HIBRIDO, collection pcon-family-2026-10-22). */
export const PCON_HIBRIDO_COVER_TEXTS: Readonly<Record<string, string>> = Object.freeze({
  'C1.marca': 'PRESYS',
  'C1.frase-topo': 'DOIS MEIOS · UMA PLATAFORMA',
  'C1.lado-a-titulo': 'PNEUMÁTICA',
  'C1.lado-a-legenda': 'exemplos publicados: 0–250 e 0–360 psi',
  'C1.lado-b-titulo': 'HIDRÁULICA',
  'C1.lado-b-legenda': 'exemplos publicados: 100–1500 a 100–10000\npsi',
  'C1.chamada-1': 'Saída pneumática\n(PNEUMATIC OUTPUT)',
  'C1.chamada-2': 'BAROM. REF, como\nimpresso no painel',
  'C1.titulo': 'PCON HÍBRIDO',
  'C1.subtitulo': 'Calibrador de pressão com pressurizador hidráulico e pneumático',
  'C1.destaque': 'Pressurização pneumática e hidráulica em um equipamento',
  'C1.pilulas-a-titulo': 'PNEUMÁTICA',
  'C1.pilula-a1': '0 a 250 psi',
  'C1.pilula-a2': '0 a 360 psi',
  'C1.pilulas-b-titulo': 'HIDRÁULICA',
  'C1.pilula-b1': '100 a 1500 psi',
  'C1.pilula-b2': '100 a 3000 psi',
  'C1.pilula-b3': '100 a 6000 psi',
  'C1.pilula-b4': '100 a 10000 psi',
  'C1.nota': 'Exatidão publicada ±0,025% FS (±0,05% FS na faixa 100–10000 psi). Valores do folder EF1038-01, que não detalha o desempenho de outras\nfaixas.',
  'C1.barra-modelos-titulo': 'FAMÍLIA PCON',
  'C1.modelo-1': 'KOMPRESSOR-Y18',
  'C1.modelo-2': 'Y18-BP',
  'C1.modelo-3': 'Y18-LP',
  'C1.modelo-4': 'Y17',
  'C1.modelo-5': 'DT',
  'C1.modelo-6': 'HÍBRIDO',
  'C1.rodape-1': 'Fotografia oficial PRESYS · arte gráfica vetorial desenhada por código, sem imagens de IA',
  'C1.rodape-2': 'PCON-HIBRIDO · Coleção experimental 22.10.2026 · rascunho para revisão técnica e comercial',
});

/** The official PCON-HIBRIDO product photo (transparent margins cropped, no retouch), as stored in the catalog. */
export const PCON_HIBRIDO_PHOTO: AssetRef = Object.freeze({
  id: '7e8ad13e-8bd3-5709-8e89-98870ee157bf', version: '1',
  sha256: '992f424b9238a3701ead99d2dba91d73c617d85d296f186f57657ab99c9f9a8a',
  mime: 'image/png', widthPx: 445, heightPx: 432, name: 'pcon-hibrido-hybrid-official-trim.png',
  alt: 'Fotografia oficial PRESYS PCON-HIBRIDO, recortada nas margens transparentes',
}) as AssetRef;

export function pconHibridoCoverFills(photo: AssetRef = PCON_HIBRIDO_PHOTO): PresysArchetypeFills {
  const fills: Record<string, PresysArchetypeSlotFill> = {};
  for (const [slotId, text] of Object.entries(PCON_HIBRIDO_COVER_TEXTS)) fills[slotId] = { kind: 'text', text };
  fills['C1.foto'] = { kind: 'image', assetId: photo.id, fit: 'contain' };
  return fills;
}

/** Style of the PCON family catalogs (palette with the cover's navy and gold). */
export function pconCoverDocumentStyle(): DocumentStyle {
  return {
    fonts: [
      { family: FONT, revision: '5.3.0', weight: 400, style: 'normal' },
      { family: FONT, revision: '5.3.0', weight: 700, style: 'normal' },
    ],
    defaultText: { fontFamily: FONT, fontSizePt: 9, lineHeight: 1.2, fontWeight: 400, color: K.text },
    palette: [K.ink, K.gold, K.text, K.muted, '#EDF3F7', K.white, K.rule],
  };
}

/** docs/examples/presys-capa-pcon-hibrido.catalog.json: the native cover with the real texts and only the official photo. */
export function createPconHibridoCoverExample(photo: AssetRef = PCON_HIBRIDO_PHOTO): CatalogDocument {
  return {
    schemaVersion: 1, id: 'presys-capa-pcon-hibrido', title: 'PCON HÍBRIDO — capa nativa', locale: 'pt-BR',
    style: pconCoverDocumentStyle(),
    pages: [buildPresysPconCoverPage({ pageId: 'capa-pcon-hibrido', fills: pconHibridoCoverFills(photo) })],
    assets: [{ ...photo }],
  };
}

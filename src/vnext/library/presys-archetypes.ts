import { createStaticPageTemplateRegistry, type PageTemplateDefinition, type PageTemplateRegistry } from '../application/template-registry';
import { objectInstantiationSeedFromObject } from '../application/document';
import type {
  CatalogDocument, Cell, Column, DocumentStyle, EditorialObject, LineObject, Page, RichText, Row, ShapeObject, TableModel, TableObject, TextObject,
} from '../domain';

/**
 * PRESYS page archetypes P1–P9 (FR-80), from the domain-audit blueprint
 * ("PRESYS Catalog Blueprint", A4, measured from the PRESYS TA / PCON folders).
 *
 * Every archetype is ordinary canonical content: text, shape, line and table
 * objects. Nothing here is a technical value: every field the father must
 * supply carries the literal "A COMPLETAR", which the content preflight
 * (FR-51) blocks with its exact location until it is replaced. Image slots are
 * a framed box with a marker text (no image object), because a template must
 * never print a stand-in picture; the father deletes the box and inserts the
 * real photo or logo.
 *
 * Slot IDs ("P1.model", "P4.specs"…) are stable: the AI composition contract
 * (blueprint §5) fills slots by these IDs through `buildPresysArchetypePage`.
 */

export const TO_FILL = 'A COMPLETAR';
const toFill = (label: string) => `${label} (${TO_FILL})`;

/** Blueprint §3 tokens. Margins are the layout grid; the safe area is the printer-safe frame. */
export const PRESYS_PAGE_TOKENS = Object.freeze({
  widthMm: 210,
  heightMm: 297,
  margins: Object.freeze({ topMm: 14, rightMm: 16, bottomMm: 16, leftMm: 18 }),
  safeArea: Object.freeze({ topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 }),
  contentLeftMm: 18,
  contentWidthMm: 176,
  footerRuleYMm: 278.5,
  footerYMm: 280,
});

export const PRESYS_COLOR_TOKENS = Object.freeze({
  navy: '#0B3A5B',
  navy2: '#09435E',
  brandBlue: '#0071BC',
  red: '#B8292F',
  text: '#231F20',
  muted: '#6D6E71',
  zebra: '#E3F1F8',
  bar: '#DCEFF8',
  sectionFill: '#C9D6E0',
  rule: '#9FB3C4',
  headerFill: '#0C426C',
  white: '#FFFFFF',
  slotFill: '#F2F5F8',
  coverWash: '#F4F6F8',
});

/** Point sizes. The primary condensed face is not licensed yet, so Noto Sans stands in. */
export const PRESYS_TYPE_SCALE = Object.freeze({
  coverModel: 36,
  coverFamily: 26,
  h1: 24,
  h2: 18,
  featureH2: 20,
  h3: 13,
  bodyFolder: 11,
  bodyDatasheet: 9.5,
  table: 9,
  note: 7.5,
  legal: 6.5,
});

const C = PRESYS_COLOR_TOKENS;
const T = PRESYS_TYPE_SCALE;
const FONT = 'Noto Sans';
const LEFT = PRESYS_PAGE_TOKENS.contentLeftMm;
const WIDTH = PRESYS_PAGE_TOKENS.contentWidthMm;

export type PresysArchetypeId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9';
export type PresysArchetypeSlotKind = 'text' | 'image' | 'table';
export type PresysArchetypeVariant = 'folder' | 'datasheet';

export interface PresysArchetypeSlot {
  /** Stable ID, "P<n>.<name>". */
  readonly id: string;
  readonly kind: PresysArchetypeSlotKind;
  /** Plain Portuguese name of the field, for review screens. */
  readonly label: string;
}

export interface PresysArchetype {
  readonly id: PresysArchetypeId;
  readonly templateId: string;
  readonly label: string;
  readonly description: string;
  readonly slots: readonly PresysArchetypeSlot[];
}

export type PresysTableFillRow = readonly string[] | { readonly section: string };
export type PresysArchetypeSlotFill =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'image'; readonly assetId: string; readonly fit?: 'contain' | 'cover' }
  | { readonly kind: 'table'; readonly header?: readonly string[]; readonly rows: readonly PresysTableFillRow[]; readonly notes?: readonly string[] };
export type PresysArchetypeFills = Readonly<Record<string, PresysArchetypeSlotFill>>;

export class PresysArchetypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PresysArchetypeError';
  }
}

type FrameTuple = readonly [xMm: number, yMm: number, widthMm: number, heightMm: number];
interface TextStyleSpec {
  readonly size: number;
  readonly bold?: boolean;
  readonly color?: string;
  readonly align?: 'left' | 'center' | 'right';
  readonly lineHeight?: number;
}
interface TableColumnSpec {
  readonly width: Column['width'];
  readonly bold?: boolean;
}
interface TableSpec {
  readonly columns: readonly TableColumnSpec[];
  readonly header?: readonly string[];
  readonly rows: readonly PresysTableFillRow[];
  readonly notes?: readonly string[];
  readonly zebra?: boolean;
}

/** One archetype page under construction: objects in paint order, slot IDs resolved to concrete objects. */
class PageBuilder {
  readonly objects: EditorialObject[] = [];
  private z = 0;
  private readonly used = new Set<string>();

  constructor(
    private readonly prefix: string,
    private readonly archetype: PresysArchetype,
    private readonly fills: PresysArchetypeFills,
    readonly variant: PresysArchetypeVariant,
  ) {
    for (const slotId of Object.keys(fills)) {
      const slot = archetype.slots.find((candidate) => candidate.id === slotId);
      if (!slot) throw new PresysArchetypeError(`Unknown slot ${slotId} for ${archetype.id}`);
      if (slot.kind !== fills[slotId].kind) throw new PresysArchetypeError(`Slot ${slotId} expects ${slot.kind}`);
    }
  }

  get body(): number {
    return this.variant === 'datasheet' ? T.bodyDatasheet : T.bodyFolder;
  }

  private id(name: string): string {
    const value = `${this.prefix}-${name}`;
    if (this.used.has(value)) throw new PresysArchetypeError(`Duplicate archetype object ${value}`);
    this.used.add(value);
    return value;
  }

  private slotFill(slotId: string, kind: PresysArchetypeSlotKind): PresysArchetypeSlotFill | undefined {
    if (!this.archetype.slots.some((slot) => slot.id === slotId && slot.kind === kind)) {
      throw new PresysArchetypeError(`Archetype ${this.archetype.id} does not declare ${kind} slot ${slotId}`);
    }
    return this.fills[slotId];
  }

  private text(name: string, value: string, frame: FrameTuple, style: TextStyleSpec): TextObject {
    const id = this.id(name);
    return {
      id, type: 'text', zIndex: this.z++,
      frame: { xMm: frame[0], yMm: frame[1], widthMm: frame[2], heightMm: frame[3] },
      text: richParagraphs(`${id}-rich`, value),
      style: {
        fontFamily: FONT, fontSizePt: style.size, lineHeight: style.lineHeight ?? 1.2,
        fontWeight: style.bold ? 700 : 400, color: style.color ?? C.text, textAlign: style.align ?? 'left',
      },
    };
  }

  /** Decorative text that is not a slot (section headings, the distributor label). */
  fixedText(name: string, value: string, frame: FrameTuple, style: TextStyleSpec): void {
    this.objects.push(this.text(name, value, frame, style));
  }

  textSlot(name: string, defaultValue: string, frame: FrameTuple, style: TextStyleSpec): void {
    const fill = this.slotFill(`${this.archetype.id}.${name}`, 'text');
    this.objects.push(this.text(name, fill?.kind === 'text' ? fill.text : defaultValue, frame, style));
  }

  box(name: string, frame: FrameTuple, fill?: string, stroke?: string): void {
    const shape: ShapeObject = {
      id: this.id(name), type: 'shape', shape: 'rectangle', zIndex: this.z++,
      frame: { xMm: frame[0], yMm: frame[1], widthMm: frame[2], heightMm: frame[3] },
      style: {
        ...(fill ? { fill } : {}),
        ...(stroke ? { stroke: { pattern: 'solid' as const, thicknessPt: 0.75, color: stroke } } : {}),
      },
    };
    this.objects.push(shape);
  }

  rule(name: string, xMm: number, yMm: number, widthMm: number, color: string = C.red): void {
    const line: LineObject = {
      id: this.id(name), type: 'line', axis: 'horizontal', color, zIndex: this.z++,
      frame: { xMm, yMm, widthMm, heightMm: 0.3 },
    };
    this.objects.push(line);
  }

  /** A framed box with a centred "A COMPLETAR" marker, or the filled image. */
  imageSlot(name: string, label: string, frame: FrameTuple, markerSize = 9): void {
    const fill = this.slotFill(`${this.archetype.id}.${name}`, 'image');
    if (fill?.kind === 'image') {
      this.objects.push({
        id: this.id(name), type: 'image', zIndex: this.z++, assetId: fill.assetId, fit: fill.fit ?? 'contain',
        frame: { xMm: frame[0], yMm: frame[1], widthMm: frame[2], heightMm: frame[3] },
      });
      return;
    }
    this.box(`${name}-box`, frame, C.slotFill, C.rule);
    const lineMm = markerSize * 1.2 * 0.3528;
    const height = Math.min(frame[3] - 2, Math.ceil(lineMm * 2 + 2));
    this.objects.push(this.text(`${name}-marker`, toFill(label),
      [frame[0] + 2, frame[1] + (frame[3] - height) / 2, frame[2] - 4, height],
      { size: markerSize, color: C.muted, align: 'center' }));
  }

  tableSlot(name: string, frame: FrameTuple, spec: TableSpec): void {
    const fill = this.slotFill(`${this.archetype.id}.${name}`, 'table');
    const resolved: TableSpec = fill?.kind === 'table'
      ? { ...spec, header: fill.header ?? spec.header, rows: fill.rows, notes: fill.notes ?? spec.notes }
      : spec;
    const object: TableObject = {
      id: this.id(`${name}-object`), type: 'table', zIndex: this.z++,
      frame: { xMm: frame[0], yMm: frame[1], widthMm: frame[2], heightMm: frame[3] },
      table: buildTable(`${this.prefix}-${name}`, resolved),
    };
    this.objects.push(object);
  }

  heading(title: string, slotName = 'title'): void {
    this.textSlot(slotName, title, [LEFT, 13.5, WIDTH, 13], { size: T.h1, bold: true, color: C.navy });
    this.rule('title-rule', LEFT, 27, 120);
  }

  footer(): void {
    this.rule('footer-rule', LEFT, PRESYS_PAGE_TOKENS.footerRuleYMm, WIDTH, C.rule);
    this.textSlot('footer', 'www.presys.com.br', [LEFT, PRESYS_PAGE_TOKENS.footerYMm, WIDTH, 5],
      { size: T.note, color: C.muted, align: 'right' });
  }
}

function richParagraphs(id: string, value: string): RichText {
  return {
    paragraphs: value.split('\n').map((line, index) => ({
      id: `${id}:p${index}`,
      inlines: line ? [{ kind: 'text' as const, id: `${id}:t${index}`, text: line, marks: [] }] : [],
    })),
  };
}

function cellText(id: string, value: string): Cell['content'] {
  return value ? { type: 'richText', value: richParagraphs(`${id}-rich`, value) } : { type: 'empty' };
}

function buildTable(id: string, spec: TableSpec): TableModel {
  const width = Math.max(spec.header?.length ?? 0, ...spec.rows.map((row) => ('section' in row ? 1 : row.length)));
  const columnSpecs: TableColumnSpec[] = width === spec.columns.length
    ? [...spec.columns]
    : [spec.columns[0], ...Array.from({ length: Math.max(0, width - 1) }, () => ({ width: { mode: 'flex' as const, weight: 1 } }))];
  const columns: Column[] = columnSpecs.map((column, index) => ({
    id: `${id}-c${index}`, width: column.width, minMm: 12,
    ...(column.bold ? { style: { fontWeight: 700 as const } } : {}),
  }));
  const rows: Row[] = [];
  const cells: Cell[] = [];
  const pushRow = (role: Row['role'], values: readonly string[], index: number, zebra: boolean) => {
    const rowId = `${id}-r${index}`;
    rows.push({ id: rowId, role, heightPolicy: { mode: 'AUTO' }, ...(zebra ? { style: { background: C.zebra } } : {}) });
    columns.forEach((column, columnIndex) => {
      const cellId = `${id}-r${index}c${columnIndex}`;
      cells.push({ id: cellId, rowId, columnId: column.id, content: cellText(cellId, values[columnIndex] ?? '') });
    });
  };
  let index = 0;
  if (spec.header) pushRow('header', spec.header, index++, false);
  let body = 0;
  for (const row of spec.rows) {
    if ('section' in row) {
      const rowId = `${id}-r${index}`;
      rows.push({ id: rowId, role: 'section', heightPolicy: { mode: 'AUTO' } });
      const anchorId = `${id}-r${index}c0`;
      columns.forEach((column, columnIndex) => {
        const cellId = `${id}-r${index}c${columnIndex}`;
        cells.push(columnIndex === 0
          ? { id: cellId, rowId, columnId: column.id, content: cellText(cellId, row.section), ...(columns.length > 1 ? { span: { rows: 1, columns: columns.length } } : {}) }
          : { id: cellId, rowId, columnId: column.id, content: { type: 'empty' }, coveredBy: anchorId });
      });
      index += 1;
      continue;
    }
    pushRow('body', row, index++, Boolean(spec.zebra) && body % 2 === 1);
    body += 1;
  }
  const annotations = (spec.notes ?? []).map((note, noteIndex) => ({
    id: `${id}-n${noteIndex}`, kind: 'note' as const, text: richParagraphs(`${id}-n${noteIndex}-rich`, note),
  }));
  return {
    id, columns, rows, cells,
    style: {
      base: {
        fontFamily: FONT, fontSizePt: T.table, lineHeight: 1.2, color: C.text,
        paddingMm: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
        borders: { bottom: { pattern: 'solid', thicknessPt: 0.5, color: C.rule } },
      },
      rowRoles: {
        header: { background: C.headerFill, color: C.white, fontWeight: 700, borders: { bottom: { pattern: 'solid', thicknessPt: 1, color: C.navy } } },
        section: { background: C.sectionFill, fontWeight: 700 },
      },
      annotation: { fontFamily: FONT, fontSizePt: T.note, lineHeight: 1.25, color: C.muted },
      annotationGapMm: 1.5,
    },
    ...(annotations.length ? { annotationIds: annotations.map((annotation) => annotation.id) } : {}),
    annotations,
    legend: [],
  };
}

const slot = (id: string, kind: PresysArchetypeSlotKind, label: string): PresysArchetypeSlot => ({ id, kind, label });
const fillRow = (label: string, columns: number) => [label, ...Array.from({ length: columns - 1 }, () => TO_FILL)];

/** The nine archetypes, in catalog order. */
export const PRESYS_ARCHETYPES: readonly PresysArchetype[] = Object.freeze([
  {
    id: 'P1', templateId: 'presys-p1-capa', label: 'Capa',
    description: 'Logotipo, família do produto, foto principal, frase de destaque e o modelo na faixa vermelha.',
    slots: [
      slot('P1.logo', 'image', 'Logotipo da PRESYS'), slot('P1.family', 'text', 'Família do produto'),
      slot('P1.series', 'text', 'Série ou linha'), slot('P1.hero', 'image', 'Foto principal do produto'),
      slot('P1.tagline', 'text', 'Frase de destaque'), slot('P1.model', 'text', 'Modelo'), slot('P1.url', 'text', 'Endereço do site'),
    ],
  },
  {
    id: 'P2', templateId: 'presys-p2-visao-geral', label: 'Visão geral e destaques',
    description: 'Texto de apresentação, uma foto e a lista de principais características.',
    slots: [
      slot('P2.title', 'text', 'Título'), slot('P2.intro', 'text', 'Texto de apresentação'), slot('P2.photo', 'image', 'Foto de detalhe'),
      slot('P2.highlights-title', 'text', 'Título dos destaques'), slot('P2.highlights', 'text', 'Principais características'), slot('P2.footer', 'text', 'Rodapé'),
    ],
  },
  {
    id: 'P3', templateId: 'presys-p3-recursos', label: 'Recursos e aplicações',
    description: 'Dois recursos com texto curto, fotos com legenda e um quadro de destaque.',
    slots: [
      slot('P3.feature-title', 'text', 'Título do recurso'), slot('P3.feature-text', 'text', 'Texto do recurso'),
      slot('P3.feature-image-1', 'image', 'Imagem do recurso'), slot('P3.feature-caption-1', 'text', 'Legenda da imagem'),
      slot('P3.feature-image-2', 'image', 'Segunda imagem do recurso'), slot('P3.feature-caption-2', 'text', 'Legenda da segunda imagem'),
      slot('P3.callout', 'text', 'Frase de destaque'), slot('P3.second-title', 'text', 'Título do segundo recurso'),
      slot('P3.second-text', 'text', 'Texto do segundo recurso'), slot('P3.second-image', 'image', 'Imagem do segundo recurso'),
      slot('P3.second-caption', 'text', 'Legenda da imagem do segundo recurso'), slot('P3.footer', 'text', 'Rodapé'),
    ],
  },
  {
    id: 'P4', templateId: 'presys-p4-especificacoes', label: 'Especificações: comparação de modelos',
    description: 'Tabela que compara os modelos lado a lado, com notas logo abaixo.',
    slots: [
      slot('P4.title', 'text', 'Título'), slot('P4.models', 'text', 'Lista de modelos'),
      slot('P4.specs', 'table', 'Tabela de comparação'), slot('P4.footer', 'text', 'Rodapé'),
    ],
  },
  {
    id: 'P5', templateId: 'presys-p5-faixas', label: 'Faixas, entradas e dados gerais',
    description: 'Tabela de faixas e exatidão, seguida das especificações gerais.',
    slots: [
      slot('P5.title', 'text', 'Título'), slot('P5.ranges', 'table', 'Tabela de faixas e entradas'),
      slot('P5.general-title', 'text', 'Título das especificações gerais'), slot('P5.general', 'table', 'Especificações gerais'), slot('P5.footer', 'text', 'Rodapé'),
    ],
  },
  {
    id: 'P6', templateId: 'presys-p6-codigo-pedido', label: 'Código de pedido',
    description: 'Estrutura do código, tabela de opções por campo e um exemplo de pedido.',
    slots: [
      slot('P6.title', 'text', 'Título'), slot('P6.skeleton', 'text', 'Estrutura do código'),
      slot('P6.options', 'table', 'Opções do código'), slot('P6.example', 'text', 'Exemplo de pedido'), slot('P6.footer', 'text', 'Rodapé'),
    ],
  },
  {
    id: 'P7', templateId: 'presys-p7-fornecimento', label: 'Fornecimento padrão e acessórios',
    description: 'O que acompanha o produto, foto do kit e tabela de acessórios com código.',
    slots: [
      slot('P7.title', 'text', 'Título'), slot('P7.delivery', 'text', 'Itens do fornecimento padrão'), slot('P7.kit-photo', 'image', 'Foto do kit fornecido'),
      slot('P7.accessories-title', 'text', 'Título dos acessórios'), slot('P7.accessories', 'table', 'Tabela de acessórios'), slot('P7.footer', 'text', 'Rodapé'),
    ],
  },
  {
    id: 'P8', templateId: 'presys-p8-insertos', label: 'Insertos e opções',
    description: 'Quatro desenhos de insertos com código e a tabela de furos.',
    slots: [
      slot('P8.title', 'text', 'Título'),
      ...[1, 2, 3, 4].flatMap((n) => [slot(`P8.insert-${n}`, 'image', `Desenho do inserto ${n}`), slot(`P8.insert-${n}-code`, 'text', `Código do inserto ${n}`)]),
      slot('P8.inserts', 'table', 'Tabela de insertos'), slot('P8.footer', 'text', 'Rodapé'),
    ],
  },
  {
    id: 'P9', templateId: 'presys-p9-contracapa', label: 'Contracapa',
    description: 'Texto institucional, logotipo, site, espaço do distribuidor e código do documento.',
    slots: [
      slot('P9.about', 'text', 'Texto institucional'), slot('P9.logo', 'image', 'Logotipo da PRESYS'), slot('P9.url', 'text', 'Endereço do site'),
      slot('P9.document-code', 'text', 'Código do documento e revisão'), slot('P9.legal', 'text', 'Aviso legal'),
    ],
  },
] satisfies readonly PresysArchetype[]);

const BUILDERS: Readonly<Record<PresysArchetypeId, (page: PageBuilder) => void>> = {
  P1: (page) => {
    page.box('wash', [10, 10, 190, 277], C.coverWash);
    page.imageSlot('logo', 'Logotipo da PRESYS', [LEFT, 16, 70, 22], 8);
    page.textSlot('family', toFill('Família do produto'), [LEFT, 48, WIDTH, 24], { size: T.coverFamily, bold: true, color: C.navy, align: 'right' });
    page.textSlot('series', toFill('Série ou linha'), [LEFT, 73, WIDTH, 10], { size: T.h2, color: C.navy2, align: 'right' });
    page.imageSlot('hero', 'Foto principal do produto', [64, 90, 130, 104], 10);
    page.textSlot('tagline', toFill('Frase de destaque do produto'), [LEFT, 202, WIDTH, 9], { size: 16 });
    page.rule('tagline-rule', LEFT, 212.5, 120);
    page.box('band', [10, 222, 190, 36], C.red);
    // Frames leave room for the font's full glyph height (about 1.4 em), which the layout preflight measures.
    page.textSlot('model', toFill('Modelo'), [LEFT, 229, WIDTH, 21], { size: T.coverModel, bold: true, color: C.white });
    page.textSlot('url', 'www.presys.com.br', [LEFT, 266, WIDTH, 8], { size: 14, color: C.navy, align: 'center' });
  },
  P2: (page) => {
    page.heading('Visão geral');
    page.textSlot('intro', toFill('Apresente o produto em 3 a 6 parágrafos curtos: para que serve, onde é usado e o que o diferencia.'),
      [LEFT, 33, 104, 100], { size: page.body, lineHeight: 1.35 });
    page.imageSlot('photo', 'Foto de detalhe', [128, 33, 66, 100]);
    page.textSlot('highlights-title', 'Principais características', [LEFT, 139, WIDTH, 8], { size: T.h3, bold: true, color: C.navy });
    page.box('highlights-panel', [LEFT, 149, WIDTH, 84], C.bar);
    page.textSlot('highlights', Array.from({ length: 12 }, (_, index) => `▸ ${toFill(`Destaque ${index + 1}`)}`).join('\n'),
      [22, 151, 168, 80], { size: 10.5, lineHeight: 1.75 });
    page.footer();
  },
  P3: (page) => {
    page.textSlot('feature-title', toFill('Recurso ou aplicação'), [LEFT, 14, WIDTH, 11], { size: T.featureH2, bold: true, color: C.navy });
    page.rule('feature-rule', LEFT, 26, 90);
    page.textSlot('feature-text', toFill('Descreva este recurso em 2 a 4 parágrafos curtos.'), [LEFT, 31, WIDTH, 34], { size: page.body, lineHeight: 1.35 });
    page.imageSlot('feature-image-1', 'Imagem do recurso', [LEFT, 69, 86, 58]);
    page.textSlot('feature-caption-1', toFill('Legenda da imagem'), [LEFT, 129, 86, 6], { size: 8, color: C.muted });
    page.imageSlot('feature-image-2', 'Segunda imagem do recurso', [108, 69, 86, 58]);
    page.textSlot('feature-caption-2', toFill('Legenda da imagem'), [108, 129, 86, 6], { size: 8, color: C.muted });
    page.box('callout-box', [LEFT, 140, WIDTH, 18], C.bar);
    page.textSlot('callout', toFill('Uma frase de destaque sobre o recurso'), [22, 144.5, 168, 9], { size: 12, bold: true, color: C.navy });
    page.textSlot('second-title', toFill('Outro recurso ou aplicação'), [LEFT, 166, WIDTH, 11], { size: T.featureH2, bold: true, color: C.navy });
    page.rule('second-rule', LEFT, 178, 90);
    page.textSlot('second-text', toFill('Descreva o recurso.'), [LEFT, 183, 104, 64], { size: page.body, lineHeight: 1.35 });
    page.imageSlot('second-image', 'Imagem do recurso', [128, 183, 66, 64]);
    page.textSlot('second-caption', toFill('Legenda da imagem'), [128, 249, 66, 6], { size: 8, color: C.muted });
    page.footer();
  },
  P4: (page) => {
    page.heading('Especificações técnicas');
    page.textSlot('models', toFill('Modelos'), [LEFT, 31, WIDTH, 9], { size: 16, color: C.navy2 });
    page.tableSlot('specs', [LEFT, 44, WIDTH, 96], {
      columns: [{ width: { mode: 'fixed', mm: 52 }, bold: true }, { width: { mode: 'flex', weight: 1 } }, { width: { mode: 'flex', weight: 1 } }, { width: { mode: 'flex', weight: 1 } }],
      header: ['Característica', TO_FILL, TO_FILL, TO_FILL],
      rows: ['Faixa', 'Exatidão', 'Resolução', 'Estabilidade', 'Dimensões', 'Peso'].map((label) => fillRow(label, 4)),
      notes: [toFill('Condições de referência das especificações')],
      zebra: true,
    });
    page.footer();
  },
  P5: (page) => {
    page.heading('Faixas e entradas');
    page.tableSlot('ranges', [LEFT, 33, WIDTH, 80], {
      columns: [{ width: { mode: 'fixed', mm: 38 }, bold: true }, ...Array.from({ length: 4 }, () => ({ width: { mode: 'flex' as const, weight: 1 } }))],
      header: ['Entrada ou função', 'Faixa', 'Resolução', 'Exatidão', 'Observações'],
      rows: Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => TO_FILL)),
      notes: [toFill('Validade da exatidão: período e temperatura ambiente')],
      zebra: true,
    });
    page.textSlot('general-title', 'Especificações gerais', [LEFT, 125, WIDTH, 9], { size: T.h2, bold: true, color: C.navy });
    page.tableSlot('general', [LEFT, 137, WIDTH, 70], {
      columns: [{ width: { mode: 'fixed', mm: 62 }, bold: true }, { width: { mode: 'flex', weight: 1 } }],
      rows: ['Alimentação', 'Condições de operação', 'Interfaces de comunicação', 'Display', 'Normas declaradas pelo fabricante'].map((label) => fillRow(label, 2)),
    });
    page.footer();
  },
  P6: (page) => {
    page.heading('Código de pedido');
    page.textSlot('skeleton', toFill('Modelo – [  ] – [  ] – [  ]'), [LEFT, 33, WIDTH, 8], { size: 14, bold: true, color: C.navy });
    page.tableSlot('options', [LEFT, 46, WIDTH, 110], {
      columns: [{ width: { mode: 'fixed', mm: 34 }, bold: true }, { width: { mode: 'flex', weight: 1 } }],
      header: ['Código', 'Significado'],
      rows: [1, 2, 3].flatMap((n) => [{ section: toFill(`Campo ${n} do código`) }, [TO_FILL, TO_FILL], [TO_FILL, TO_FILL]]),
      notes: [toFill('Observações sobre as opções')],
    });
    page.textSlot('example', `Exemplo de pedido: ${TO_FILL}`, [LEFT, 166, WIDTH, 8], { size: page.body });
    page.footer();
  },
  P7: (page) => {
    page.heading('Fornecimento padrão');
    page.textSlot('delivery', Array.from({ length: 3 }, () => `– ${toFill('Item fornecido com o produto')}`).join('\n'),
      [LEFT, 33, 104, 50], { size: page.body, lineHeight: 1.4 });
    page.imageSlot('kit-photo', 'Foto do kit fornecido', [128, 33, 66, 50], 8);
    page.textSlot('accessories-title', 'Acessórios', [LEFT, 92, WIDTH, 9], { size: T.h2, bold: true, color: C.navy });
    page.tableSlot('accessories', [LEFT, 104, WIDTH, 80], {
      columns: [{ width: { mode: 'flex', weight: 1 } }, { width: { mode: 'fixed', mm: 44 } }],
      header: ['Descrição', 'Código de pedido'],
      rows: Array.from({ length: 5 }, () => [TO_FILL, TO_FILL]),
      zebra: true,
    });
    page.footer();
  },
  P8: (page) => {
    page.heading('Insertos e opções');
    [0, 1, 2, 3].forEach((index) => {
      const x = LEFT + index * 45;
      page.imageSlot(`insert-${index + 1}`, 'Desenho', [x, 33, 41, 41], 7.5);
      page.textSlot(`insert-${index + 1}-code`, `Código: ${TO_FILL}`, [x, 76, 41, 6], { size: T.table, bold: true, color: C.navy, align: 'center' });
    });
    page.tableSlot('inserts', [LEFT, 90, WIDTH, 80], {
      columns: [{ width: { mode: 'fixed', mm: 36 }, bold: true }, { width: { mode: 'flex', weight: 1 } }, { width: { mode: 'fixed', mm: 44 } }],
      header: ['Código', 'Furos', 'Código de pedido'],
      rows: Array.from({ length: 4 }, () => [TO_FILL, TO_FILL, TO_FILL]),
      zebra: true,
    });
    page.footer();
  },
  P9: (page) => {
    // Left-aligned: a wrapped right-aligned paragraph keeps a hanging space past the frame, which the preflight flags.
    page.textSlot('about', toFill('Texto institucional da PRESYS: quem somos, laboratório e certificações confirmadas'),
      [60, 24, 134, 60], { size: 14, lineHeight: 1.35 });
    page.imageSlot('logo', 'Logotipo da PRESYS', [120, 120, 74, 24], 8);
    page.textSlot('url', 'www.presys.com.br', [LEFT, 150, WIDTH, 8], { size: 14, color: C.navy, align: 'right' });
    page.box('distributor-box', [74, 196, 120, 30], C.white, C.navy);
    page.fixedText('distributor-label', 'Seu distribuidor:', [78, 199, 112, 7], { size: 11, bold: true, color: C.navy });
    page.rule('closing-rule', LEFT, 245, WIDTH);
    page.textSlot('document-code', toFill('Código do documento e revisão'), [LEFT, 250, WIDTH, 6], { size: T.note, color: C.muted, align: 'right' });
    page.textSlot('legal', 'Devido ao nosso programa de desenvolvimento contínuo, as especificações podem ser alteradas sem aviso prévio.',
      [LEFT, 262, WIDTH, 10], { size: T.legal, color: C.muted, align: 'right' });
  },
};

export function presysArchetype(id: PresysArchetypeId): PresysArchetype {
  const archetype = PRESYS_ARCHETYPES.find((candidate) => candidate.id === id);
  if (!archetype) throw new PresysArchetypeError(`Unknown archetype ${id}`);
  return archetype;
}

export interface BuildPresysArchetypeOptions {
  /** Page ID; object IDs are derived from it, so every page in one document needs its own. */
  readonly pageId: string;
  readonly fills?: PresysArchetypeFills;
  readonly variant?: PresysArchetypeVariant;
}

/** One archetype as a canonical A4 page with explicit IDs. */
export function buildPresysArchetypePage(id: PresysArchetypeId, options: BuildPresysArchetypeOptions): Page {
  const archetype = presysArchetype(id);
  const builder = new PageBuilder(options.pageId, archetype, options.fills ?? {}, options.variant ?? 'folder');
  BUILDERS[id](builder);
  return {
    id: options.pageId, widthMm: PRESYS_PAGE_TOKENS.widthMm, heightMm: PRESYS_PAGE_TOKENS.heightMm,
    safeArea: { ...PRESYS_PAGE_TOKENS.safeArea }, objects: builder.objects,
  };
}

/** One archetype as a page template ("Usar modelo…"): the same objects, without root IDs. */
export function presysArchetypePageTemplate(id: PresysArchetypeId, fills?: PresysArchetypeFills, variant?: PresysArchetypeVariant): PageTemplateDefinition {
  const archetype = presysArchetype(id);
  const page = buildPresysArchetypePage(id, { pageId: archetype.templateId, fills, variant });
  return {
    id: archetype.templateId, label: archetype.label, description: archetype.description,
    safeArea: { ...PRESYS_PAGE_TOKENS.safeArea },
    objects: page.objects.map(objectInstantiationSeedFromObject),
  };
}

export const PRESYS_ARCHETYPE_TEMPLATE_IDS: readonly string[] = Object.freeze(PRESYS_ARCHETYPES.map((archetype) => archetype.templateId));

export function createPresysArchetypeTemplateRegistry(): PageTemplateRegistry {
  return createStaticPageTemplateRegistry(PRESYS_ARCHETYPES.map((archetype) => presysArchetypePageTemplate(archetype.id)));
}

/** Document style shared by the PRESYS starters (fresh object on every call). */
export function presysDocumentStyle(): DocumentStyle {
  return {
    fonts: [
      { family: FONT, revision: '5.3.0', weight: 400, style: 'normal' },
      { family: FONT, revision: '5.3.0', weight: 700, style: 'normal' },
    ],
    defaultText: { fontFamily: FONT, fontSizePt: 10, lineHeight: 1.25, fontWeight: 400, color: C.text },
    palette: [C.navy, C.red, C.brandBlue, C.text, C.muted, C.zebra, C.white],
  };
}

/** Blueprint §0 document types. */
export const PRESYS_DATASHEET_SEQUENCE: readonly PresysArchetypeId[] = Object.freeze(['P1', 'P2', 'P4', 'P5', 'P6', 'P7']);
export const PRESYS_FOLDER_SEQUENCE: readonly PresysArchetypeId[] = Object.freeze(['P1', 'P2', 'P3', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9']);

/** A whole product-agnostic document made of archetype pages, for the "Novo catálogo" starters. */
export function createPresysArchetypeDocument(input: {
  readonly documentId: string;
  readonly title: string;
  readonly sequence: readonly PresysArchetypeId[];
  readonly variant?: PresysArchetypeVariant;
}): CatalogDocument {
  return {
    schemaVersion: 1, id: input.documentId, title: input.title, locale: 'pt-BR',
    style: presysDocumentStyle(),
    pages: input.sequence.map((id, index) => buildPresysArchetypePage(id, {
      pageId: `${input.documentId}-${index + 1}-${id.toLowerCase()}`, variant: input.variant,
    })),
    assets: [],
  };
}

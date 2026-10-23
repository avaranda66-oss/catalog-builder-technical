import { draftMarkText, type Diagnostic } from '@/vnext/domain';

/**
 * "Imprimir rascunho mesmo assim": the plain summary shown before a draft PDF of a blocked catalog is printed.
 * Read-only: it groups the items that still need correction ("Correção necessária"); the review status, the print lock
 * of "Imprimir / salvar PDF" and the document are untouched. Review points ("Revisar") are not counted.
 */
export interface DraftPrintGroup {
  /** Stable key for the list (code family, or the provisional text). */
  readonly key: string;
  readonly count: number;
  /** One plain line, e.g. "15 textos ainda com “A COMPLETAR”". */
  readonly text: string;
}

export interface DraftPrintSummary {
  /** Items that still need correction. */
  readonly total: number;
  /** Content still to complete or adjust. */
  readonly groups: readonly DraftPrintGroup[];
  /** Problems that can make the PDF itself come out wrong (a font or image that did not load, unconfirmed measures). */
  readonly technical: readonly DraftPrintGroup[];
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const FONT_CODES = new Set(['REQUIRED_FONT_MISSING', 'FONT_READINESS_TIMEOUT']);
const IMAGE_CODES = new Set(['ASSET_UNAVAILABLE', 'ASSET_READINESS_TIMEOUT', 'ASSET_INTEGRITY_FAILED', 'ASSET_REFERENCE_DANGLING',
  'REQUIRED_ASSET_MISSING', 'ASSET_HASH_MISMATCH', 'ASSET_REVISION_CHANGED', 'ASSET_DIMENSIONS_MISMATCH', 'IMAGE_DECODE_TIMEOUT', 'IMAGE_DECODE_FAILED']);
const MEASURE_CODES = new Set(['RENDER_GEOMETRY_MISMATCH', 'LAYOUT_UNSTABLE', 'BORDER_PAINT_GEOMETRY_INVALID', 'TRACK_PROJECTION_INVARIANT',
  'TRACK_PROJECTION_NONPOSITIVE', 'ROW_PROJECTION_NONPOSITIVE', 'ROW_MEASUREMENT_INVALID', 'MEASUREMENT_ROOT_TRANSFORMED',
  'RENDER_ELEMENT_MISSING', 'TEXT_RUN_DOM_MISMATCH']);
const TABLE_SIZE_CODES = new Set(['TABLE_CONTENT_OVERFLOW', 'TABLE_WIDTH_INFEASIBLE', 'COLUMN_LIMIT_INVALID', 'COLUMN_WEIGHT_INVALID',
  'ROW_CONTENT_OVERFLOW', 'CELL_CONTENT_OVERFLOW', 'CELL_CONTENT_BOX_NONPOSITIVE', 'BORDER_CONTENT_CLEARANCE']);
const MERGE_CODES = new Set(['INVALID_SPAN', 'SPAN_OUT_OF_BOUNDS', 'ROWSPAN_CONSTRAINT_INVALID', 'MERGE_OVERLAP', 'MERGE_INTERSECTION',
  'MERGE_HEADER_BOUNDARY', 'COVERED_CELL_INVALID', 'COVERED_BY_DANGLING', 'COVERED_BY_INVALID']);

type Family = { key: string; technical: boolean; text: (count: number) => string };

function placeholderToken(issue: Diagnostic): string | undefined {
  for (const part of issue.details.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === 'token') return part.slice(separator + 1).trim().toLocaleUpperCase('pt-BR') || undefined;
  }
  return undefined;
}

function family(issue: Diagnostic): Family {
  const code = issue.code;
  if (code === 'UNRESOLVED_PLACEHOLDER') {
    const token = placeholderToken(issue);
    return token
      ? { key: `placeholder:${token}`, technical: false, text: count => `${plural(count, 'texto', 'textos')} ainda com “${token}”` }
      : { key: 'placeholder', technical: false, text: count => `${plural(count, 'texto provisório', 'textos provisórios')} para trocar` };
  }
  if (code === 'PAGE_FOOTER_INCOMPLETE') return { key: 'footer', technical: false, text: () => 'Rodapé das páginas incompleto' };
  if (code === 'TEXT_OBJECT_OVERFLOW') return { key: 'text-overflow', technical: false, text: count => `${plural(count, 'texto que não cabe', 'textos que não cabem')} no quadro` };
  if (TABLE_SIZE_CODES.has(code)) return { key: 'table-size', technical: false, text: count => `${plural(count, 'ajuste', 'ajustes')} de tamanho em tabelas` };
  if (MERGE_CODES.has(code)) return { key: 'merge', technical: false, text: count => `${plural(count, 'mesclagem', 'mesclagens')} de células para refazer` };
  if (code === 'PRINTABLE_CONTENT_OVERLAP' || code === 'PAGE_FOOTER_OVERLAP') {
    return { key: 'overlap', technical: false, text: count => `${plural(count, 'objeto', 'objetos')} por cima de outro conteúdo` };
  }
  if (code === 'OBJECT_OUTSIDE_PAGE' || code === 'SAFE_AREA_VIOLATION') {
    return { key: 'outside', technical: false, text: count => `${plural(count, 'objeto', 'objetos')} fora da página` };
  }
  if (FONT_CODES.has(code)) return { key: 'font', technical: true, text: () => 'Uma fonte do catálogo não carregou: os textos podem sair com outra letra.' };
  if (IMAGE_CODES.has(code)) {
    return { key: 'image', technical: true, text: count => count === 1
      ? 'Uma imagem não carregou: ela pode sair em branco no PDF.'
      : `${count} imagens não carregaram: elas podem sair em branco no PDF.` };
  }
  if (MEASURE_CODES.has(code)) return { key: 'measure', technical: true, text: () => 'As medidas das páginas não puderam ser confirmadas: textos e tabelas podem sair fora do lugar.' };
  return { key: 'unchecked', technical: true, text: count => count === 1
    ? 'Um item não pôde ser verificado: o PDF pode sair diferente da prévia.'
    : `${count} itens não puderam ser verificados: o PDF pode sair diferente da prévia.` };
}

export function draftPrintSummary(diagnostics: readonly Diagnostic[]): DraftPrintSummary {
  const blocking = diagnostics.filter(item => item.severity === 'ERROR');
  const counted = new Map<string, { entry: Family; count: number }>();
  for (const issue of blocking) {
    const entry = family(issue);
    const current = counted.get(entry.key);
    if (current) current.count++; else counted.set(entry.key, { entry, count: 1 });
  }
  const lines = [...counted.values()].map(({ entry, count }) => ({ technical: entry.technical, group: { key: entry.key, count, text: entry.text(count) } }));
  return {
    total: blocking.length,
    groups: lines.filter(line => !line.technical).map(line => line.group),
    technical: lines.filter(line => line.technical).map(line => line.group),
  };
}

/** "Este PDF ainda tem 17 itens a corrigir:" */
export function draftPrintHeadline(total: number): string {
  return `Este PDF ainda tem ${plural(total, 'item', 'itens')} a corrigir:`;
}

/** The suggested file name of a draft PDF: the normal one plus " — RASCUNHO" in the catalog's language. */
export function draftFileTitle(fileTitle: string, locale: string): string {
  return `${fileTitle} — ${draftMarkText(locale)}`;
}

import { createCatalogDocument, type ApplicationAction, type DocumentSession } from '../application';
import {
  findObjectInTree,
  frameToCanonicalU,
  minimumUForProjectedQ,
  mmToU,
  plainRichText,
  qToU,
  uToQ,
  type CatalogDocument,
  type Page,
  type RichText,
  type TableModel,
  type TableObject,
} from '../domain';
import { add, sum } from '../domain/physical';
import { deleteAxis, orderedAnchors, unmergeCell, validateTable } from '../table/table-model';
import {
  paginationMeasurementFromLayout,
  planTablePagination,
  type TablePageSlice,
  type TablePaginationPlan,
} from '../table/table-pagination';
import type { FitHeightMeasurement } from './table-fit-height-authoring';

/**
 * FR-35 "Continuar na próxima página": a table taller than its A4 page continues on new pages, as an explicit action
 * that one Desfazer undoes. The W4 contract forbids automatic re-layout, so nothing here runs by itself.
 *
 * Only existing application actions are composed, under one transactionId (the pattern of native-compose.ts):
 * - on the original table: the merged cells of the rows that leave are unmerged (those rows go away anyway, and the
 *   copies keep the merges), the rows that leave are removed (`table.axis.remove`), the notes under the table move
 *   to the last part (`table.annotation.detach` + `table.annotation.remove`), the legend keeps only what its markers
 *   use (`table.legend.remove`) and the frame takes the height of what stays (`object.resize`);
 * - for every continuation: `page.add` right after the previous part and `object.insert` of a new table with the
 *   header rows repeated, the rows of that part, and the title followed by "(continuação)". The engine gives every
 *   inserted row, cell and note a new ID.
 *
 * Where to cut comes from the pure A4 paginator (table/table-pagination.ts) fed by the row heights the editor already
 * measured. Tables that need three or more pages are cut in one go, so the action never has to be repeated.
 */

export type TableSplitUnavailableReason =
  | 'NO_TABLE'
  | 'GROUPED'
  | 'LOCKED'
  | 'MEASURING'
  | 'UNSTABLE'
  | 'FITS'
  | 'ABOVE_PAGE'
  | 'NO_BODY_ROWS'
  | 'HEADER_TOO_TALL'
  | 'ROW_TOO_TALL'
  | 'NO_ROOM'
  | 'MERGED_CELLS';

export type TableSplitUnavailable = {
  readonly ok: false;
  readonly reason: TableSplitUnavailableReason;
  readonly message: string;
  /** The table does not fit on its page: the panel shows why it cannot continue yet. */
  readonly overflows: boolean;
};

/** Geometry of the page that `page.add` creates (the continuation pages). */
export interface ContinuationPageGeometry {
  readonly heightMm: number;
  readonly safeTopMm: number;
  readonly safeBottomMm: number;
}

export interface TableSplitPlan {
  readonly pageId: string;
  readonly objectId: string;
  readonly tableId: string;
  readonly object: TableObject;
  readonly pagination: TablePaginationPlan;
  /** Number of new pages the action adds. */
  readonly newPages: number;
  /** Rows that leave the original table, in table order. */
  readonly movedRowIds: readonly string[];
  /** Height reserved for "(continuação)" above each continuation (domain U). */
  readonly continuationTitleU: number;
  /** Notes printed under the grid; every part reserves them when its cells point to notes or markers. */
  readonly footerQ: number;
  readonly footerOnEveryPart: boolean;
  readonly titleQ: number;
  readonly firstAvailableU: number;
  readonly nextAvailableU: number;
  readonly continuationPage: ContinuationPageGeometry;
}

export type TableSplitPlanning = { readonly ok: true; readonly plan: TableSplitPlan } | TableSplitUnavailable;

export interface FrameU {
  readonly xU: number;
  readonly yU: number;
  readonly widthU: number;
  readonly heightU: number;
}

export interface TableContinuationPart {
  /** The new table (header rows repeated, rows of this part, title with "(continuação)"). */
  readonly table: TableModel;
  readonly frameU: FrameU;
  readonly bodyRowIds: readonly string[];
}

export interface PreparedTableSplit {
  readonly plan: TableSplitPlan;
  /** Exact table the preparation saw; the session must still hold it. */
  readonly expectedTable: TableModel;
  /** New frame of the original table (same place and width, the height of what stays). */
  readonly originalFrameU: FrameU;
  /** What stays in the original table once every step ran (checked here, before anything changes). */
  readonly remainingTable: TableModel;
  readonly unmergeAnchorIds: readonly string[];
  readonly detachTableAnnotationIds: readonly string[];
  readonly removeAnnotationIds: readonly string[];
  readonly removeLegendEntryIds: readonly string[];
  readonly continuations: readonly TableContinuationPart[];
}

export type TableSplitPreparation = { readonly ok: true; readonly prepared: PreparedTableSplit } | TableSplitUnavailable;

export type TableSplitOutcome =
  | { readonly ok: true; readonly message: string; readonly pageIds: readonly string[]; readonly movedRows: number }
  | { readonly ok: false; readonly message: string };

export const CONTINUATION_LABEL = '(continuação)';
export const TABLE_SPLIT_ACTION_LABEL = 'Continuar na próxima página';
/** Kept free below each part, and added to its frame, so a rounding of the measurement never makes it overflow. */
const SAFETY_U = mmToU(1);
const PT_TO_MM = 25.4 / 72;

const unavailable = (reason: TableSplitUnavailableReason, message: string, overflows = false): TableSplitUnavailable =>
  ({ ok: false, reason, message, overflows });

const MESSAGES: Readonly<Record<TableSplitUnavailableReason, string>> = {
  NO_TABLE: 'Selecione uma tabela.',
  GROUPED: 'Desagrupe para editar esta tabela.',
  LOCKED: 'A tabela está bloqueada. Desbloqueie a tabela para continuar na próxima página.',
  MEASURING: 'Medindo a tabela…',
  UNSTABLE: 'A medição da tabela ainda não está estável. Aguarde alguns segundos.',
  FITS: 'A tabela já cabe nesta página.',
  ABOVE_PAGE: 'A tabela começa acima da página. Arraste a tabela para dentro da página e tente de novo.',
  NO_BODY_ROWS: 'A tabela só tem linhas de cabeçalho. Não há linhas para levar à próxima página.',
  HEADER_TOO_TALL: 'O cabeçalho da tabela é mais alto que uma página. Diminua o texto do cabeçalho e tente de novo.',
  ROW_TOO_TALL: 'Uma linha desta tabela, ou um grupo de linhas mescladas, é mais alta que uma página inteira. '
    + 'Diminua o texto dessa linha e tente de novo.',
  NO_ROOM: 'A tabela começa muito perto do fim da página e nenhuma linha cabe aqui. Suba a tabela e tente de novo.',
  MERGED_CELLS: 'Esta tabela tem células mescladas entre o cabeçalho e as outras linhas, e não pode ser dividida assim. '
    + 'Desfaça essa mesclagem e tente de novo.',
};

let blankPageGeometry: ContinuationPageGeometry | undefined;

/** The page `page.add` creates. Read from the application's own blank catalog, never hard-coded here. */
export function continuationPageGeometry(): ContinuationPageGeometry {
  if (!blankPageGeometry) {
    let next = 0;
    const page = createCatalogDocument(() => `table-split-probe-${++next}`).pages[0];
    blankPageGeometry = pageGeometry(page);
  }
  return blankPageGeometry;
}

function pageGeometry(page: Pick<Page, 'heightMm' | 'safeArea'>): ContinuationPageGeometry {
  return { heightMm: page.heightMm, safeTopMm: page.safeArea?.topMm ?? 0, safeBottomMm: page.safeArea?.bottomMm ?? 0 };
}

function richTextPlain(rich: RichText): string {
  return rich.paragraphs.map((paragraph) => paragraph.inlines.map((inline) => inline.kind === 'text' ? inline.text : '\n').join('')).join('\n');
}

/**
 * Title of a continuation: the table title followed by "(continuação)", or "(continuação)" alone for a table
 * without title. A title that already ends with it (a continuation cut again) is kept as it is.
 */
export function continuationTitle(title: RichText | undefined): RichText {
  const plain = title ? richTextPlain(title).trim() : '';
  if (!title || !plain) return plainRichText('table-split-continuation', CONTINUATION_LABEL);
  if (plain.endsWith(CONTINUATION_LABEL)) return title;
  const paragraphs = [...title.paragraphs];
  const lastIndex = paragraphs.length - 1;
  const last = paragraphs[lastIndex];
  const only = last.inlines.length === 1 ? last.inlines[0] : undefined;
  if (!last.list && only?.kind === 'text') {
    // A plain title stays a plain title, so it can still be changed in "Título da tabela".
    paragraphs[lastIndex] = { ...last, inlines: [{ ...only, text: `${only.text.trimEnd()} ${CONTINUATION_LABEL}` }] };
    return { paragraphs };
  }
  const used = new Set(title.paragraphs.flatMap((paragraph) => [paragraph.id, ...paragraph.inlines.map((inline) => inline.id)]));
  let id = `${last.id}:continuacao`;
  for (let suffix = 2; used.has(id); suffix += 1) id = `${last.id}:continuacao-${suffix}`;
  const text = last.inlines.length === 0 ? CONTINUATION_LABEL : ` ${CONTINUATION_LABEL}`;
  paragraphs[lastIndex] = { ...last, inlines: [...last.inlines, { kind: 'text', id, text, marks: [] }] };
  return { paragraphs };
}

/**
 * What to say after a click that could not run. While measuring, the panel's "Medindo a tabela…" would stay on screen
 * as work in progress, so the person is asked to try again instead.
 */
export function tableSplitClickMessage(unavailableSplit: TableSplitUnavailable): string {
  return unavailableSplit.reason === 'MEASURING' || unavailableSplit.reason === 'UNSTABLE'
    ? 'A tabela ainda está sendo medida. Aguarde alguns segundos e tente de novo.'
    : unavailableSplit.message;
}

/** "1 página nova" / "2 páginas novas". */
export function newPagesText(count: number): string {
  return count === 1 ? '1 página nova' : `${count} páginas novas`;
}

function pageListText(numbers: readonly number[]): string {
  if (numbers.length === 1) return `a página ${numbers[0]}`;
  return `as páginas ${numbers.slice(0, -1).join(', ')} e ${numbers.at(-1)}`;
}

/**
 * Success sentence of the split, in plain Portuguese: "34 linhas movidas para a página 3, com o cabeçalho repetido.
 * Use Desfazer se precisar."
 */
export function tableSplitSuccessMessage(movedRows: number, pageNumbers: readonly number[], headerRepeated: boolean): string {
  const rows = movedRows === 1 ? '1 linha movida' : `${movedRows} linhas movidas`;
  return `${rows} para ${pageListText(pageNumbers)}${headerRepeated ? ', com o cabeçalho repetido' : ''}. Use Desfazer se precisar.`;
}

function measurementUnavailable(measurement: FitHeightMeasurement | null | undefined, document: CatalogDocument): TableSplitUnavailable | undefined {
  const unstable = (diagnostics: FitHeightMeasurement['diagnostics']) => diagnostics?.some((diagnostic) =>
    diagnostic.code === 'LAYOUT_UNSTABLE' || diagnostic.code === 'RENDER_GEOMETRY_MISMATCH');
  if (!measurement || measurement.source !== document || !measurement.snapshot) {
    return unstable(measurement?.diagnostics) ? unavailable('UNSTABLE', MESSAGES.UNSTABLE) : unavailable('MEASURING', MESSAGES.MEASURING);
  }
  if (unstable(measurement.diagnostics) || measurement.snapshot.geometryDiagnostics.some((diagnostic) => diagnostic.severity === 'ERROR')) {
    return unavailable('UNSTABLE', MESSAGES.UNSTABLE);
  }
  return undefined;
}

/** Height of one line of the table's note text (the title style), from the editor's resolved table plan. */
function oneLineU(measurement: FitHeightMeasurement, table: TableModel, document: CatalogDocument): number {
  const style = measurement.plans.get(table.id)?.annotationStyle;
  const fontSizePt = style?.fontSizePt ?? table.style.annotation.fontSizePt ?? document.style.defaultText.fontSizePt ?? 10;
  const lineHeight = style?.lineHeight ?? table.style.annotation.lineHeight ?? document.style.defaultText.lineHeight ?? 1.25;
  // Rounded up to a tenth of a millimetre: the estimate must never be shorter than the printed line.
  return mmToU(Math.ceil(fontSizePt * lineHeight * PT_TO_MM * 10) / 10);
}

function cellUsesNotes(table: TableModel): boolean {
  return orderedAnchors(table).some((cell) => (cell.annotationIds?.length ?? 0) > 0 || cell.content.type === 'marker');
}

/**
 * Plans the cut without building anything: cheap enough for the panel and the problem list while they render.
 * Fails closed: no current measurement, a row taller than a page or no room under the table top means no action.
 */
export function planTableSplit(
  document: CatalogDocument,
  objectId: string,
  measurement: FitHeightMeasurement | null | undefined,
  continuationPage: ContinuationPageGeometry = continuationPageGeometry()
): TableSplitPlanning {
  const entry = findObjectInTree(document, objectId);
  if (!entry || entry.object.type !== 'table') return unavailable('NO_TABLE', MESSAGES.NO_TABLE);
  if (entry.parentGroup) return unavailable('GROUPED', MESSAGES.GROUPED);
  const object = entry.object;
  const page = entry.page;
  const table = object.table;
  const pending = measurementUnavailable(measurement, document);
  if (pending || !measurement?.snapshot) return pending ?? unavailable('MEASURING', MESSAGES.MEASURING);
  if (!measurement.plans.has(table.id)) return unavailable('MEASURING', MESSAGES.MEASURING);
  const facts = measurement.snapshot.facts;
  const tableFact = facts.find((fact) => fact.kind === 'table' && fact.pageId === page.id && fact.objectId === object.id && fact.tableId === table.id);
  if (!tableFact || tableFact.kind !== 'table') return unavailable('MEASURING', MESSAGES.MEASURING);
  const rowFacts = facts.flatMap((fact) => fact.kind === 'row' && fact.pageId === page.id && fact.tableId === table.id ? [fact] : []);
  const titleFact = facts.find((fact) => fact.kind === 'tableTitle' && fact.pageId === page.id && fact.tableId === table.id);

  const frame = frameToCanonicalU(object.frame);
  const source = pageGeometry(page);
  const bottomU = add(mmToU(source.heightMm), -mmToU(source.safeBottomMm));
  const nextBottomU = add(mmToU(continuationPage.heightMm), -mmToU(continuationPage.safeBottomMm));
  const firstAvailableU = Math.max(0, add(bottomU, -frame.yU));
  const nextAvailableU = Math.max(0, add(nextBottomU, -mmToU(continuationPage.safeTopMm)));
  const base = paginationMeasurementFromLayout(table, tableFact, rowFacts, {
    pageHeightMm: source.heightMm, safeTopMm: source.safeTopMm, safeBottomMm: source.safeBottomMm, frameYMm: object.frame.yMm,
  });
  const gridQ = sum(table.rows.map((row) => rowFacts.find((fact) => fact.rowId === row.id)?.heightQ ?? 0));
  const titleQ = Math.max(0, tableFact.gridOffsetYQ ?? 0);
  const footerQ = Math.max(0, add(add(tableFact.renderedIntrinsicHeightQ, -titleQ), -gridQ));
  const footerU = qToU(footerQ);
  // Notes or markers on cells print under the part that holds the cell: then every part keeps room for all notes.
  const footerOnEveryPart = cellUsesNotes(table);
  const lineU = oneLineU(measurement, table, document);
  const gapU = mmToU(table.style.annotationGapMm);
  // "(continuação)" may need a line more than the title it follows; reserve it, never less.
  const continuationTitleU = add(add(titleFact?.kind === 'tableTitle' && table.title ? qToU(titleFact.heightQ) : 0, lineU), gapU);
  const reserveU = add(SAFETY_U, footerOnEveryPart ? footerU : 0);
  const pagination = planTablePagination(table, {
    ...base,
    continuationTitleHeightU: continuationTitleU,
    footerHeightU: footerOnEveryPart ? 0 : footerU,
    firstPageAvailableU: Math.max(0, add(firstAvailableU, -reserveU)),
    nextPageAvailableU: Math.max(0, add(nextAvailableU, -reserveU)),
  });
  const codes = new Set(pagination.issues.map((issue) => issue.code));
  if (codes.has('MEASUREMENT_MISSING') || codes.has('MEASUREMENT_INVALID')) return unavailable('MEASURING', MESSAGES.MEASURING);
  // Whether it fits is decided on the real space left on the page, without the safety margin of the cut.
  const wholeU = add(add(base.titleHeightU ?? 0, sum(table.rows.map((row) => base.rowHeightsU[row.id] ?? 0))), footerU);
  if (pagination.fitsOnOnePage || wholeU <= firstAvailableU) return unavailable('FITS', MESSAGES.FITS);
  if (codes.has('NO_BODY_ROWS')) return unavailable('NO_BODY_ROWS', MESSAGES.NO_BODY_ROWS, true);
  if (codes.has('HEADER_TALLER_THAN_PAGE')) return unavailable('HEADER_TOO_TALL', MESSAGES.HEADER_TOO_TALL, true);
  if (codes.has('ROWS_TALLER_THAN_PAGE')) return unavailable('ROW_TOO_TALL', MESSAGES.ROW_TOO_TALL, true);
  if (frame.yU < 0) return unavailable('ABOVE_PAGE', MESSAGES.ABOVE_PAGE, true);
  if (pagination.slices.some((slice) => slice.overflowU > 0)) return unavailable('NO_ROOM', MESSAGES.NO_ROOM, true);
  if (pagination.slices.length < 2) return unavailable('FITS', MESSAGES.FITS);
  if (object.locked) return unavailable('LOCKED', MESSAGES.LOCKED, true);
  return {
    ok: true,
    plan: {
      pageId: page.id,
      objectId: object.id,
      tableId: table.id,
      object,
      pagination,
      newPages: pagination.slices.length - 1,
      movedRowIds: pagination.slices.slice(1).flatMap((slice) => slice.bodyRowIds),
      continuationTitleU,
      footerQ,
      footerOnEveryPart,
      titleQ,
      firstAvailableU,
      nextAvailableU,
      continuationPage,
    },
  };
}

/** IDs of the notes a set of rows points to (notes and footnotes on their cells), in the table's order. */
function cellAnnotationIds(table: TableModel, rowIds: ReadonlySet<string>): Set<string> {
  return new Set(table.cells.filter((cell) => rowIds.has(cell.rowId) && !cell.coveredBy).flatMap((cell) => cell.annotationIds ?? []));
}

function markerLegendIds(table: TableModel, rowIds: ReadonlySet<string>): Set<string> {
  return new Set(table.cells.flatMap((cell) => rowIds.has(cell.rowId) && !cell.coveredBy && cell.content.type === 'marker'
    ? [cell.content.legendEntryId] : []));
}

/** Frame height for a part: its title, its rows and (when printed there) its notes, plus the safety margin. */
function partHeightU(titleQ: number, rowsU: number, footerQ: number, availableU: number): number {
  const neededQ = add(add(titleQ, uToQ(rowsU)), footerQ);
  return Math.max(1, Math.min(availableU, add(minimumUForProjectedQ(neededQ), SAFETY_U)));
}

function continuationTable(
  table: TableModel,
  slice: TablePageSlice,
  isLast: boolean,
  orphanLegendIds: ReadonlySet<string>
): TableModel {
  const rows = new Set([...slice.headerRowIds, ...slice.bodyRowIds]);
  const tableNotes = (table.annotationIds ?? []).filter((id) => table.annotations.find((annotation) => annotation.id === id)?.kind !== 'caption');
  const used = cellAnnotationIds(table, rows);
  if (isLast) for (const id of tableNotes) used.add(id);
  const legend = markerLegendIds(table, rows);
  if (isLast) for (const id of orphanLegendIds) legend.add(id);
  const next: TableModel = {
    ...table,
    title: continuationTitle(table.title),
    rows: table.rows.filter((row) => rows.has(row.id)),
    cells: table.cells.filter((cell) => rows.has(cell.rowId)),
    annotations: table.annotations.filter((annotation) => used.has(annotation.id)),
    legend: table.legend.filter((entry) => legend.has(entry.id)),
  };
  if (isLast && tableNotes.length > 0) next.annotationIds = tableNotes;
  else delete next.annotationIds;
  return next;
}

/**
 * Builds everything the action will do and checks it on plain copies of the table, before the catalog changes:
 * the new tables must be valid and the original table must accept every removal.
 */
export function prepareTableSplit(
  document: CatalogDocument,
  objectId: string,
  measurement: FitHeightMeasurement | null | undefined,
  continuationPage: ContinuationPageGeometry = continuationPageGeometry()
): TableSplitPreparation {
  const planning = planTableSplit(document, objectId, measurement, continuationPage);
  if (!planning.ok) return planning;
  const plan = planning.plan;
  const table = plan.object.table;
  const heights = new Map<string, number>();
  for (const fact of measurement?.snapshot?.facts ?? []) {
    if (fact.kind === 'row' && fact.pageId === plan.pageId && fact.tableId === table.id) heights.set(fact.rowId, fact.resolvedHeightU);
  }
  const rowsU = (rowIds: readonly string[]) => sum(rowIds.map((id) => heights.get(id) ?? 0));
  const slices = plan.pagination.slices;
  const [first] = slices;
  const kept = new Set([...first.headerRowIds, ...first.bodyRowIds]);
  const moved = new Set(plan.movedRowIds);

  // Legend entries no marker uses travel with the notes, to the last part.
  const allMarkers = markerLegendIds(table, new Set(table.rows.map((row) => row.id)));
  const orphanLegendIds = new Set(table.legend.filter((entry) => !allMarkers.has(entry.id)).map((entry) => entry.id));

  const frame = frameToCanonicalU(plan.object.frame);
  const continuations: TableContinuationPart[] = [];
  for (const slice of slices.slice(1)) {
    const next = continuationTable(table, slice, slice.isLast, orphanLegendIds);
    if (validateTable(next, document.assets).some((diagnostic) => diagnostic.severity === 'ERROR')) {
      return unavailable('MERGED_CELLS', MESSAGES.MERGED_CELLS, true);
    }
    const footerQ = plan.footerOnEveryPart || slice.isLast ? plan.footerQ : 0;
    continuations.push({
      table: next,
      bodyRowIds: slice.bodyRowIds,
      frameU: {
        xU: frame.xU,
        yU: mmToU(continuationPage.safeTopMm),
        widthU: frame.widthU,
        heightU: partHeightU(uToQ(plan.continuationTitleU), rowsU([...slice.headerRowIds, ...slice.bodyRowIds]), footerQ, plan.nextAvailableU),
      },
    });
  }

  // The original table: unmerge what leaves, remove the rows, move the notes, keep the legend its markers use.
  const unmergeAnchorIds = orderedAnchors(table)
    .filter((cell) => moved.has(cell.rowId) && ((cell.span?.rows ?? 1) > 1 || (cell.span?.columns ?? 1) > 1))
    .map((cell) => cell.id);
  const detachTableAnnotationIds = (table.annotationIds ?? [])
    .filter((id) => table.annotations.find((annotation) => annotation.id === id)?.kind !== 'caption');
  let remaining = table;
  try {
    for (const anchorId of unmergeAnchorIds) remaining = unmergeCell(remaining, anchorId);
    // Once those merges are undone, no merge may cross the cut: the first row that leaves proves it, and the
    // others are removed in one go (removing them one by one here would cost as much as the action itself).
    const [firstMoved] = plan.movedRowIds;
    if (firstMoved) deleteAxis(remaining, 'row', firstMoved);
    remaining = {
      ...remaining,
      rows: remaining.rows.filter((row) => !moved.has(row.id)),
      cells: remaining.cells.filter((cell) => !moved.has(cell.rowId)),
    };
  } catch {
    return unavailable('MERGED_CELLS', MESSAGES.MERGED_CELLS, true);
  }
  const stillAttached = new Set([
    ...(remaining.annotationIds ?? []).filter((id) => !detachTableAnnotationIds.includes(id)),
    ...cellAnnotationIds(remaining, kept),
  ]);
  const wasAttached = new Set([...(table.annotationIds ?? []), ...cellAnnotationIds(table, new Set(table.rows.map((row) => row.id)))]);
  const removeAnnotationIds = table.annotations
    .filter((annotation) => wasAttached.has(annotation.id) && !stillAttached.has(annotation.id))
    .map((annotation) => annotation.id);
  const keptMarkers = markerLegendIds(remaining, kept);
  const removeLegendEntryIds = table.legend.filter((entry) => !keptMarkers.has(entry.id)).map((entry) => entry.id);
  const remainingTable: TableModel = {
    ...remaining,
    annotations: remaining.annotations.filter((annotation) => !removeAnnotationIds.includes(annotation.id)),
    legend: remaining.legend.filter((entry) => !removeLegendEntryIds.includes(entry.id)),
  };
  const attachedAfter = (remaining.annotationIds ?? []).filter((id) => !detachTableAnnotationIds.includes(id));
  if (attachedAfter.length > 0) remainingTable.annotationIds = attachedAfter;
  else delete remainingTable.annotationIds;
  if (validateTable(remainingTable, document.assets).some((diagnostic) => diagnostic.severity === 'ERROR')) {
    return unavailable('MERGED_CELLS', MESSAGES.MERGED_CELLS, true);
  }
  const keptFooterQ = plan.footerOnEveryPart ? plan.footerQ : 0;
  return {
    ok: true,
    prepared: {
      plan,
      expectedTable: table,
      originalFrameU: {
        ...frame,
        heightU: partHeightU(plan.titleQ, rowsU([...first.headerRowIds, ...first.bodyRowIds]), keptFooterQ, plan.firstAvailableU),
      },
      remainingTable,
      unmergeAnchorIds,
      detachTableAnnotationIds,
      removeAnnotationIds,
      removeLegendEntryIds,
      continuations,
    },
  };
}

function currentTableObject(session: DocumentSession, objectId: string): TableObject | undefined {
  const object = findObjectInTree(session.getSnapshot().document, objectId)?.object;
  return object?.type === 'table' ? object : undefined;
}

function sameTableObject(left: TableObject, right: TableObject): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

const FAILURE_MESSAGE ='Não foi possível levar a tabela para a próxima página. Nada foi alterado. Aguarde alguns segundos e tente de novo.';

/**
 * Runs the prepared split on the session, under one transactionId: a single Desfazer brings back the table exactly
 * as it was and removes the new pages. When the session no longer holds the prepared table, nothing changes. An
 * unexpected late failure is rolled back with one Desfazer (the same safety net as the other table actions).
 */
export function applyTableSplit(session: DocumentSession, prepared: PreparedTableSplit, transactionId: string): TableSplitOutcome {
  const before = session.getSnapshot().document;
  const { plan } = prepared;
  const identity = { pageId: plan.pageId, objectId: plan.objectId, tableId: plan.tableId };
  const failure = (): TableSplitOutcome => {
    if (session.getSnapshot().document !== before) session.undo();
    return { ok: false, message: FAILURE_MESSAGE };
  };
  // The cut was measured for this exact table at this exact place.
  const start = currentTableObject(session, plan.objectId);
  if (!start || !sameTableObject(start, plan.object)) return { ok: false, message: FAILURE_MESSAGE };

  const run = (build: (table: TableModel) => ApplicationAction | null): boolean => {
    const object = currentTableObject(session, plan.objectId);
    if (!object) return false;
    const action = build(object.table);
    if (!action) return true;
    return session.execute(action, { transactionId }).ok;
  };
  for (const anchorCellId of prepared.unmergeAnchorIds) {
    if (!run((table) => ({ type: 'table.cell.unmerge', ...identity, anchorCellId, expectedTable: table }))) return failure();
  }
  for (const axisId of plan.movedRowIds) {
    if (!run((table) => ({ type: 'table.axis.remove', ...identity, axis: 'row', axisId, expectedTable: table }))) return failure();
  }
  for (const annotationId of prepared.detachTableAnnotationIds) {
    if (!run((table) => ({
      type: 'table.annotation.detach', ...identity, annotationId,
      target: { kind: 'TABLE', expectedAnnotationIds: [...(table.annotationIds ?? [])] },
    }))) return failure();
  }
  for (const annotationId of prepared.removeAnnotationIds) {
    if (!run((table) => {
      const expectedAnnotation = table.annotations.find((annotation) => annotation.id === annotationId);
      return expectedAnnotation ? { type: 'table.annotation.remove', ...identity, annotationId, expectedAnnotation } : null;
    })) return failure();
  }
  for (const legendEntryId of prepared.removeLegendEntryIds) {
    if (!run((table) => {
      const expectedLegend = table.legend.find((entry) => entry.id === legendEntryId);
      return expectedLegend ? { type: 'table.legend.remove', ...identity, legendEntryId, expectedLegend } : null;
    })) return failure();
  }
  const resized = session.execute({ type: 'object.resize', objectId: plan.objectId, ...prepared.originalFrameU }, { transactionId });
  if (!resized.ok) return failure();

  const pageIds: string[] = [];
  let previousPageId = plan.pageId;
  for (const part of prepared.continuations) {
    if (!session.execute({ type: 'page.add', afterPageId: previousPageId }, { transactionId }).ok) return failure();
    const pages = session.getSnapshot().document.pages;
    const page = pages[pages.findIndex((entry) => entry.id === previousPageId) + 1];
    const geometry = page && pageGeometry(page);
    // The parts were measured for this page; a different blank page would need a new measurement.
    if (!page || geometry.heightMm !== plan.continuationPage.heightMm || geometry.safeTopMm !== plan.continuationPage.safeTopMm
      || geometry.safeBottomMm !== plan.continuationPage.safeBottomMm) return failure();
    const inserted = session.execute({
      type: 'object.insert',
      pageId: page.id,
      object: { type: 'table', frameU: part.frameU, zIndex: 0, table: part.table },
    }, { transactionId });
    if (!inserted.ok) return failure();
    pageIds.push(page.id);
    previousPageId = page.id;
  }
  const after = session.getSnapshot().document;
  const numbers = pageIds.map((id) => after.pages.findIndex((page) => page.id === id) + 1);
  const headerRepeated = plan.pagination.slices[0].headerRowIds.length > 0;
  return {
    ok: true,
    pageIds,
    movedRows: plan.movedRowIds.length,
    message: tableSplitSuccessMessage(plan.movedRowIds.length, numbers, headerRepeated),
  };
}

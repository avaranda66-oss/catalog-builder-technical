import type { ApplicationAction, CellStylePatch, TablePresetId } from '../application/contracts';
import { executeApplicationAction } from '../application/execute';
import {
  materializeTablePreset,
  NATIVE_TABLE_PROFILES,
  TABLE_PRESETS,
  TABLE_TEXT_SIZES,
  tablePresetAccents,
  tablePresetDefinition,
  tablePresetFirstColumnMm,
  type TableTextSizeId,
} from '../application/table-preset-registry';
import { mmToU } from '../domain/physical';
import type { CatalogDocument, Cell, CellStyle, DocumentStyle, TableModel, TableObject } from '../domain/editorial-model';
import { prepareColumnsSetProperties, rowHeightPolicyToU } from './table-dimension-authoring';
import { tableColumnSelection, type TableSelectionIdentity } from './table-selection';
import { prepareStyleAction, prepareTablePresetAction } from './table-style-authoring';

/**
 * FR-33: the "Estilo" part of the table panel — the four task presets, the three switches (Cabeçalho, Linhas
 * alternadas, Primeira coluna destacada) and the P/M/G text size.
 *
 * Nothing here adds an action type: every change is a list of existing actions (table.preset.apply,
 * table.rows.setProperties, table.rows.setStyle, table.cell.setProperties, table.columns.setProperties,
 * table.style.setBase) that the editor runs under one transactionId, so a single Desfazer undoes the whole look.
 * The list is first simulated on the document, so a look that cannot be applied changes nothing.
 */

/** Style of the highlighted first column: bold on a light tint (the colour of the text is kept when it has none). */
export interface TableLabelStyle {
  readonly fontWeight: 700;
  readonly background: string;
  readonly color?: string;
}

/** What the panel shows as "on" for the selected table, read from the table itself. */
export interface TableLook {
  /**
   * The task preset the table really has: its base and header/body/section looks match (the text size does not
   * count) and so do its switches (header, alternating rows, highlighted first column). The gallery marks it.
   */
  readonly presetId?: TablePresetId;
  /** The preset whose base and header/body/section looks match, whatever the switches; its colours are reused. */
  readonly basePresetId?: TablePresetId;
  readonly header: boolean;
  /** Every second ordinary row has the same colour and the others none (at least two ordinary rows). */
  readonly banded: boolean;
  readonly bandColor?: string;
  /**
   * The bands follow rows that are added, removed or turned into the header. Only when they are surely bands: two
   * banded rows or more, or the band colour of a style. A single row coloured by hand keeps its colour.
   */
  readonly bandsFollowRows: boolean;
  /** Every first-column cell of the ordinary rows has the same bold, tinted look. */
  readonly firstColumn: boolean;
  readonly labelStyle?: TableLabelStyle;
  readonly size?: TableTextSizeId;
}

export type TableLookRequest =
  | { readonly kind: 'preset'; readonly presetId: TablePresetId }
  | { readonly kind: 'header'; readonly on: boolean }
  | { readonly kind: 'banded'; readonly on: boolean }
  | { readonly kind: 'firstColumn'; readonly on: boolean }
  | { readonly kind: 'size'; readonly size: TableTextSizeId };

export interface TableStepContext {
  readonly identity: TableSelectionIdentity;
  readonly table: TableModel;
  readonly frameWidthMm: number;
  readonly documentStyle: DocumentStyle;
}

export interface TableStep {
  /** The next action for the table as it is now, or null when nothing needs to change. */
  readonly build: (context: TableStepContext) => ApplicationAction | null;
  /** An optional step that cannot be applied is skipped instead of cancelling the whole change. */
  readonly optional?: boolean;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function withoutSize(style: CellStyle): CellStyle {
  const { fontSizePt: _size, ...rest } = style;
  return rest;
}

const bodyRows = (table: TableModel) => table.rows.filter((row) => row.role === 'body');

/** Anchor cells of the first column, with their row. */
function firstColumnCells(table: TableModel): { cell: Cell; role: TableModel['rows'][number]['role'] }[] {
  const firstColumnId = table.columns[0]?.id;
  if (!firstColumnId) return [];
  const roles = new Map(table.rows.map((row) => [row.id, row.role]));
  return table.cells
    .filter((cell) => !cell.coveredBy && cell.columnId === firstColumnId)
    .map((cell) => ({ cell, role: roles.get(cell.rowId) ?? 'body' }));
}

/** The highlighted first column: the first-column cells of body rows. */
function labelCells(table: TableModel): Cell[] {
  return firstColumnCells(table).filter((entry) => entry.role === 'body').map((entry) => entry.cell);
}

function isLabelStyled(style: CellStyle | undefined): boolean {
  return style?.fontWeight === 700 && typeof style.background === 'string';
}

/** The cell has exactly the label look (same weight, tint and text colour). */
function hasLabelStyle(style: CellStyle | undefined, label: TableLabelStyle): boolean {
  return style?.fontWeight === 700 && style.background === label.background && style.color === label.color;
}

/**
 * Alternating rows, read with the same parity the "Linhas alternadas" switch paints: the 2nd, 4th... ordinary rows
 * share one colour and the 1st, 3rd... have none. Anything else (a row coloured by hand) is not a band.
 */
function readBands(table: TableModel): { readonly color: string; readonly count: number } | undefined {
  const rows = bodyRows(table);
  if (rows.length < 2) return undefined;
  const color = rows[1].style?.background;
  if (typeof color !== 'string') return undefined;
  const alternates = rows.every((row, index) => index % 2 === 1
    ? row.style?.background === color
    : row.style?.background === undefined);
  return alternates ? { color, count: Math.floor(rows.length / 2) } : undefined;
}

/** Band colours the product paints itself: the panel presets and the assistant designs. */
function isStyleBandColor(color: string, documentStyle: DocumentStyle): boolean {
  const wanted = color.toUpperCase();
  return TABLE_PRESETS.some((preset) => tablePresetAccents(documentStyle, preset.id).band.toUpperCase() === wanted)
    || Object.values(NATIVE_TABLE_PROFILES).some((profile) => profile.alternate.background?.toUpperCase() === wanted);
}

/** The highlighted first column: every ordinary first-column cell has the same bold, tinted look. */
function readLabelStyle(table: TableModel): TableLabelStyle | undefined {
  const labels = labelCells(table);
  const first = labels[0]?.style;
  if (!first || !isLabelStyled(first)) return undefined;
  const label: TableLabelStyle = {
    fontWeight: 700,
    background: first.background!,
    ...(first.color === undefined ? {} : { color: first.color }),
  };
  return labels.every((cell) => hasLabelStyle(cell.style, label)) ? label : undefined;
}

export function projectTableLook(table: TableModel, documentStyle: DocumentStyle): TableLook {
  const basePresetId = TABLE_PRESETS.find((preset) => {
    const expected = materializeTablePreset(table, documentStyle, preset.id).style;
    return same(withoutSize(expected.base), withoutSize(table.style.base)) && same(expected.rowRoles, table.style.rowRoles);
  })?.id;
  const header = table.rows[0]?.role === 'header';
  const bands = readBands(table);
  const labelStyle = readLabelStyle(table);
  const firstColumn = Boolean(labelStyle);
  const defaults = basePresetId ? tablePresetDefinition(basePresetId).defaults : undefined;
  const presetId = defaults
    && (defaults.header === 'keep' || defaults.header === header)
    && defaults.banded === Boolean(bands)
    && defaults.firstColumn === firstColumn
    ? basePresetId
    : undefined;
  return {
    ...(presetId ? { presetId } : {}),
    ...(basePresetId ? { basePresetId } : {}),
    header,
    banded: Boolean(bands),
    ...(bands ? { bandColor: bands.color } : {}),
    bandsFollowRows: Boolean(bands && (bands.count >= 2 || isStyleBandColor(bands.color, documentStyle))),
    firstColumn,
    ...(labelStyle ? { labelStyle } : {}),
    ...(() => {
      const size = TABLE_TEXT_SIZES.find((entry) => entry.fontSizePt === table.style.base.fontSizePt);
      return size ? { size: size.id } : {};
    })(),
  };
}

/* ----------------------------------------------------------------------------------------------------------- */
/* Steps                                                                                                       */
/* ----------------------------------------------------------------------------------------------------------- */

function presetStep(presetId: TablePresetId): TableStep {
  return { build: ({ identity, table }) => prepareTablePresetAction(identity, table, presetId) };
}

function sizeStep(fontSizePt: number): TableStep {
  return {
    build: ({ identity, table }) => table.style.base.fontSizePt === fontSizePt
      ? null
      : prepareStyleAction(identity, table, { kind: 'table' }, { fontSizePt }),
  };
}

function rowRoleAction(
  identity: TableSelectionIdentity,
  rows: readonly TableModel['rows'][number][],
  role: 'header' | 'body'
): ApplicationAction | null {
  const targets = rows.filter((row) => row.role !== role);
  if (targets.length === 0) return null;
  return {
    type: 'table.rows.setProperties',
    ...identity,
    targets: targets.map((row) => ({
      rowId: row.id,
      expected: { role: row.role, heightPolicy: rowHeightPolicyToU(row.heightPolicy) },
      next: { role },
    })),
  };
}

/** "Cabeçalho": the first row becomes the header, or every header row goes back to an ordinary row. */
function headerStep(on: boolean, optional = false): TableStep {
  return {
    optional,
    build: ({ identity, table }) => on
      ? (table.rows.length > 1 && table.rows[0] ? rowRoleAction(identity, [table.rows[0]], 'header') : null)
      : rowRoleAction(identity, table.rows.filter((row) => row.role === 'header'), 'body'),
  };
}

function rowsStyleAction(
  identity: TableSelectionIdentity,
  rows: readonly TableModel['rows'][number][],
  patch: CellStylePatch
): ApplicationAction | null {
  if (rows.length === 0) return null;
  return {
    type: 'table.rows.setStyle',
    ...identity,
    targets: rows.map((row) => ({ id: row.id, ...(row.style === undefined ? {} : { expectedStyle: row.style }) })),
    patch,
  };
}

/** "Linhas alternadas": every second ordinary row gets the band colour; the others none. */
function bandSteps(on: boolean, color: string | undefined): TableStep[] {
  const wanted = (table: TableModel) => new Set(on && color
    ? bodyRows(table).filter((_, index) => index % 2 === 1).map((row) => row.id)
    : []);
  return [
    {
      build: ({ identity, table }) => {
        const banded = wanted(table);
        return color
          ? rowsStyleAction(identity, table.rows.filter((row) => banded.has(row.id) && row.style?.background !== color), { background: color })
          : null;
      },
    },
    {
      build: ({ identity, table }) => {
        const banded = wanted(table);
        return rowsStyleAction(identity, bodyRows(table).filter((row) => !banded.has(row.id) && row.style?.background !== undefined), { background: null });
      },
    },
  ];
}

/** The label look as a patch; a label without a text colour clears the colour the cell had. */
function labelPatch(style: TableLabelStyle): CellStylePatch {
  return { fontWeight: 700, background: style.background, color: style.color ?? null };
}

/**
 * "Primeira coluna destacada": the first-column cells of ordinary rows get the label style (bold on a light tint).
 * It is set on those cells, like the assistant designs, so a header or section cell keeps its own look.
 * - `apply` gives every ordinary first-column cell the label style;
 * - `remove` takes the label style (bold on a tint) away; a cell that is only bold stays bold;
 * - `clean` changes no ordinary cell.
 * In every mode a header or section cell left with a label tint (the first row after "Cabeçalho") is cleaned.
 */
function labelStep(mode: 'apply' | 'remove' | 'clean', style: TableLabelStyle | undefined): TableStep {
  return {
    build: ({ identity, table }) => {
      const targets: { cellId: string; expectedStyle?: CellStyle; patch: CellStylePatch }[] = [];
      const clear: CellStylePatch = { fontWeight: null, color: null, background: null };
      for (const { cell, role } of firstColumnCells(table)) {
        const current = cell.style;
        const expected = current ? { expectedStyle: current } : {};
        if (role === 'body') {
          if (mode === 'apply' && style && !hasLabelStyle(current, style)) {
            targets.push({ cellId: cell.id, ...expected, patch: labelPatch(style) });
          } else if (mode === 'remove' && isLabelStyled(current)) {
            targets.push({ cellId: cell.id, ...expected, patch: clear });
          }
        } else if (isLabelStyled(current) && (!style || current?.background === style.background)) {
          targets.push({ cellId: cell.id, ...expected, patch: clear });
        }
      }
      return targets.length === 0 ? null : { type: 'table.cell.setProperties', ...identity, targets };
    },
  };
}

/** The first column gets the width of the preset, only while it is still flexible (a width set by hand stays). */
function firstColumnWidthStep(presetId: TablePresetId): TableStep {
  return {
    optional: true,
    build: ({ identity, table, frameWidthMm }) => {
      const column = table.columns[0];
      if (!column || column.width.mode !== 'flex') return null;
      const widthMm = tablePresetFirstColumnMm(presetId, table, frameWidthMm);
      if (widthMm === undefined) return null;
      const widthU = mmToU(widthMm);
      return prepareColumnsSetProperties(identity, table, mmToU(frameWidthMm), tableColumnSelection(identity, column.id), {
        width: { mode: 'fixed', widthU },
        ...(mmToU(column.minMm) > widthU ? { minU: widthU } : {}),
      });
    },
  };
}

/** The accents a switch uses: the colours already in the table, else the ones of its style, else "Especificações". */
function accentsFor(look: TableLook, documentStyle: DocumentStyle): { band: string; label: TableLabelStyle } {
  const accents = tablePresetAccents(documentStyle, look.basePresetId ?? TABLE_PRESETS[0].id);
  return { band: look.bandColor ?? accents.band, label: look.labelStyle ?? accents.label };
}

/** The steps of one click in the "Estilo" part of the panel. */
export function tableLookSteps(request: TableLookRequest, look: TableLook, documentStyle: DocumentStyle): TableStep[] {
  switch (request.kind) {
    case 'preset': {
      const preset = tablePresetDefinition(request.presetId);
      const accents = tablePresetAccents(documentStyle, preset.id);
      const keptSize = look.size && look.size !== 'medium'
        ? TABLE_TEXT_SIZES.find((entry) => entry.id === look.size)?.fontSizePt
        : undefined;
      return [
        presetStep(preset.id),
        ...(keptSize ? [sizeStep(keptSize)] : []),
        ...(preset.defaults.header === 'keep' ? [] : [headerStep(preset.defaults.header, true)]),
        // A style without bands only takes away bands the table had; a row coloured by hand keeps its colour.
        ...(preset.defaults.banded ? bandSteps(true, accents.band) : look.banded ? bandSteps(false, undefined) : []),
        labelStep(preset.defaults.firstColumn ? 'apply' : 'remove', accents.label),
        ...(preset.defaults.firstColumn ? [firstColumnWidthStep(preset.id)] : []),
      ];
    }
    case 'header': {
      const accents = accentsFor(look, documentStyle);
      // The ordinary rows change, so the bands and the highlighted first column follow them in the same step.
      return [
        headerStep(request.on),
        ...(look.bandsFollowRows ? bandSteps(true, accents.band) : []),
        labelStep(look.firstColumn ? 'apply' : 'clean', look.firstColumn ? accents.label : undefined),
      ];
    }
    case 'banded':
      return bandSteps(request.on, accentsFor(look, documentStyle).band);
    case 'firstColumn':
      return [labelStep(request.on ? 'apply' : 'remove', accentsFor(look, documentStyle).label)];
    case 'size': {
      const size = TABLE_TEXT_SIZES.find((entry) => entry.id === request.size);
      return size ? [sizeStep(size.fontSizePt)] : [];
    }
  }
}

/**
 * After rows were added or removed: keep the bands and the highlighted first column the table had before, so the
 * new rows follow the same look (in the same step as the change). Only real bands follow (`bandsFollowRows`); a row
 * coloured by hand stays as it is, and the label look only reaches the new first-column cells.
 */
export function tableLookMaintenanceSteps(lookBefore: TableLook): TableStep[] {
  return [
    ...(lookBefore.bandsFollowRows && lookBefore.bandColor ? bandSteps(true, lookBefore.bandColor) : []),
    ...(lookBefore.labelStyle ? [labelStep('apply', lookBefore.labelStyle)] : []),
  ];
}

/**
 * After a column was added: a column added before the highlighted first column becomes the highlighted one, and the
 * old first column (now the second) loses the label look, so "Primeira coluna destacada" stays true. A column added
 * anywhere else changes nothing.
 */
export function tableLookColumnMaintenanceSteps(lookBefore: TableLook, firstColumnIdBefore: string | undefined): TableStep[] {
  const label = lookBefore.labelStyle;
  if (!label || !firstColumnIdBefore) return [];
  const moved = (table: TableModel) => table.columns[0] !== undefined && table.columns[0].id !== firstColumnIdBefore;
  const apply = labelStep('apply', label);
  return [
    { build: (context) => moved(context.table) ? apply.build(context) : null },
    {
      build: ({ identity, table }) => {
        if (!moved(table)) return null;
        const roles = new Map(table.rows.map((row) => [row.id, row.role]));
        const clear: CellStylePatch = { fontWeight: null, color: null, background: null };
        const targets = table.cells
          .filter((cell) => !cell.coveredBy && cell.columnId === firstColumnIdBefore
            && roles.get(cell.rowId) === 'body' && hasLabelStyle(cell.style, label))
          .map((cell) => ({ cellId: cell.id, ...(cell.style ? { expectedStyle: cell.style } : {}), patch: clear }));
        return targets.length === 0 ? null : { type: 'table.cell.setProperties', ...identity, targets };
      },
    },
  ];
}

/* ----------------------------------------------------------------------------------------------------------- */
/* Planning                                                                                                    */
/* ----------------------------------------------------------------------------------------------------------- */

export type TableCompositionPlan =
  | { readonly ok: true; readonly actions: readonly ApplicationAction[]; readonly document: CatalogDocument }
  | { readonly ok: false; readonly code: string };

function tableIn(document: CatalogDocument, pageId: string, objectId: string): TableObject | undefined {
  return document.pages.find((page) => page.id === pageId)?.objects
    .find((object): object is TableObject => object.id === objectId && object.type === 'table');
}

/**
 * Builds and checks the actions of a change on a copy of the document. Steps that change nothing are left out;
 * an optional step that fails is skipped; any other failure cancels the whole plan (nothing is changed).
 */
export function planTableComposition(
  document: CatalogDocument,
  pageId: string,
  objectId: string,
  steps: readonly TableStep[]
): TableCompositionPlan {
  let simulated = document;
  let simulatedIds = 0;
  const dependencies = { createId: () => `table-composition-simulation-${++simulatedIds}` };
  const actions: ApplicationAction[] = [];
  for (const step of steps) {
    const object = tableIn(simulated, pageId, objectId);
    if (!object) return { ok: false, code: 'OBJECT_NOT_FOUND' };
    let action: ApplicationAction | null;
    try {
      action = step.build({
        identity: { pageId, objectId, tableId: object.table.id },
        table: object.table,
        frameWidthMm: object.frame.widthMm,
        documentStyle: simulated.style,
      });
    } catch {
      if (step.optional) continue;
      return { ok: false, code: 'ACTION_INVALID' };
    }
    if (!action) continue;
    const result = executeApplicationAction(simulated, action, dependencies);
    if (!result.ok) {
      if (step.optional) continue;
      return { ok: false, code: result.error.code };
    }
    if (!result.metadata.changed) continue;
    actions.push(action);
    simulated = result.document;
  }
  return { ok: true, actions, document: simulated };
}

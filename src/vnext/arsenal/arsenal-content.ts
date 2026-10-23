import type {
  AssetRef,
  DocumentStyle,
  EditorialObject,
  LeafEditorialObject,
  TableModel,
  TableStyle,
  TextStyle,
} from '../domain';
import type { CellStyle } from '../domain/editorial-model';
import {
  collectArsenalPayloadAssetIds,
  findArsenalTableValueViolations,
  stripArsenalTableValues,
  type ArsenalPayload,
  type ArsenalTableValuePolicy,
} from './contracts';

/**
 * Onda 4.5 — content rules of a preset that capture, insertion and preview share (ADR-arsenal §3 and
 * "Consequências"): the technical-value policy of tables, the asset list, and the font fallback. Pure.
 */

// ---------------------------------------------------------------------------------------------------------------
// Tables: technical values
// ---------------------------------------------------------------------------------------------------------------

export interface ArsenalTablePolicyResult {
  readonly objects: EditorialObject[];
  /** Table objects that lost values (empty when the policy keeps them or there were none). */
  readonly strippedIds: string[];
}

/** One table under the policy: `structure-only` empties it with `stripArsenalTableValues`. */
export function tableUnderPolicy(table: TableModel, policy: ArsenalTableValuePolicy): { table: TableModel; stripped: boolean } {
  if (policy !== 'structure-only' || findArsenalTableValueViolations(table).length === 0) return { table, stripped: false };
  return { table: stripArsenalTableValues(table), stripped: true };
}

/** Every table of the objects (group children included) under the policy. */
export function objectsUnderTablePolicy(objects: readonly EditorialObject[], policy: ArsenalTableValuePolicy): ArsenalTablePolicyResult {
  const strippedIds: string[] = [];
  const leaf = <T extends LeafEditorialObject>(object: T): T => {
    if (object.type !== 'table') return object;
    const result = tableUnderPolicy(object.table, policy);
    if (!result.stripped) return object;
    strippedIds.push(object.id);
    return { ...object, table: result.table };
  };
  const result = objects.map((object) => object.type === 'group'
    ? { ...object, objects: object.objects.map(leaf) }
    : leaf(object));
  return { objects: result, strippedIds };
}

// ---------------------------------------------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------------------------------------------

/** The `AssetRef` of every image the payload uses, taken from the source catalog (unknown ids are left out). */
export function payloadAssetsFrom(payload: ArsenalPayload, catalogAssets: readonly AssetRef[]): AssetRef[] {
  const wanted = new Set(collectArsenalPayloadAssetIds(payload));
  return catalogAssets.filter((asset) => wanted.has(asset.id)).map((asset) => ({ ...asset }));
}

// ---------------------------------------------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------------------------------------------

type FontFields = { fontFamily?: string; fontWeight?: 400 | 700 };

/**
 * A style read in another catalog: a family that catalog does not declare is dropped (the text falls back to the
 * document's own font, ADR "Consequências"), and so is a weight the resulting family does not have — the editor
 * refuses undeclared faces, and the PDF could not embed them.
 */
export function withDeclaredFonts<T extends FontFields>(style: T, documentStyle: DocumentStyle): T {
  const families = new Set(documentStyle.fonts.map((font) => font.family));
  let next: T = style;
  if (next.fontFamily !== undefined && !families.has(next.fontFamily)) {
    const { fontFamily: _dropped, ...rest } = next;
    next = rest as T;
  }
  if (next.fontWeight !== undefined) {
    const family = next.fontFamily ?? documentStyle.defaultText.fontFamily;
    const declared = documentStyle.fonts.some((font) => font.family === family && font.weight === next.fontWeight && font.style === 'normal');
    if (!declared) {
      const { fontWeight: _dropped, ...rest } = next;
      next = rest as T;
    }
  }
  return next;
}

const cellStyle = (style: CellStyle | undefined, documentStyle: DocumentStyle): CellStyle | undefined =>
  style === undefined ? undefined : withDeclaredFonts(style, documentStyle);

export function tableStyleWithDeclaredFonts(style: TableStyle, documentStyle: DocumentStyle): TableStyle {
  const rowRoles: TableStyle['rowRoles'] = {};
  for (const role of ['header', 'body', 'section'] as const) {
    const value = cellStyle(style.rowRoles[role], documentStyle);
    if (value !== undefined) rowRoles[role] = value;
  }
  return {
    ...style,
    base: withDeclaredFonts(style.base, documentStyle),
    rowRoles,
    annotation: withDeclaredFonts(style.annotation, documentStyle),
  };
}

function withOptionalStyle<T extends { style?: CellStyle }>(entry: T, documentStyle: DocumentStyle): T {
  if (entry.style === undefined) return entry;
  return { ...entry, style: withDeclaredFonts(entry.style, documentStyle) };
}

export function tableWithDeclaredFonts(table: TableModel, documentStyle: DocumentStyle): TableModel {
  return {
    ...table,
    style: tableStyleWithDeclaredFonts(table.style, documentStyle),
    rows: table.rows.map((row) => withOptionalStyle(row, documentStyle)),
    columns: table.columns.map((column) => withOptionalStyle(column, documentStyle)),
    cells: table.cells.map((cell) => withOptionalStyle(cell, documentStyle)),
  };
}

export function textStyleWithDeclaredFonts(style: TextStyle, documentStyle: DocumentStyle): TextStyle {
  return withDeclaredFonts(style, documentStyle);
}

/** A leaf object whose text or table styles only use faces the destination catalog declares. */
export function leafWithDeclaredFonts<T extends LeafEditorialObject>(object: T, documentStyle: DocumentStyle): T {
  if (object.type === 'text') return { ...object, style: textStyleWithDeclaredFonts(object.style, documentStyle) };
  if (object.type === 'table') return { ...object, table: tableWithDeclaredFonts(object.table, documentStyle) };
  return object;
}

export function objectWithDeclaredFonts(object: EditorialObject, documentStyle: DocumentStyle): EditorialObject {
  if (object.type !== 'group') return leafWithDeclaredFonts(object, documentStyle);
  return { ...object, objects: object.objects.map((child) => leafWithDeclaredFonts(child, documentStyle)) };
}

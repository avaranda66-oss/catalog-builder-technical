import { z } from 'zod';
import type { Border, CellStyle, DocumentStyle, TableModel } from '../domain/editorial-model';
import type { TablePresetId, TablePresetPresentationSnapshot } from './contracts';

/**
 * FR-33: one registry for every table look of the product.
 *
 * - The four task presets of the table panel ("Especificações", "Comparativo de modelos", "Códigos de pedido",
 *   "Acessórios") reuse the four engine preset IDs of `table.preset.apply` (base and header/body/section looks) and
 *   add the accents of the native designs below: alternating rows, a highlighted first column and its width.
 * - The native designs the assistant picks (`applyNativeTableDesign`) live here too, so the assistant and the panel
 *   share the same spacing, borders and first-column widths.
 */

/** The native design whose accents a task preset borrows; `specification` is the PRESYS label/value sheet. */
export type TablePresetDesign = 'specification' | NativeTableDesign;

/** What a task preset turns on: the first row as header, alternating rows and a highlighted first column. */
export interface TablePresetDefaults {
  /** `keep` leaves the current header row as it is (label/value tables usually have none). */
  readonly header: boolean | 'keep';
  readonly banded: boolean;
  readonly firstColumn: boolean;
}

export interface TablePresetDefinition {
  readonly id: TablePresetId;
  readonly label: string;
  readonly description: string;
  readonly design: TablePresetDesign;
  readonly defaults: TablePresetDefaults;
}

/** Gallery order of the table panel. The IDs are the engine IDs; the labels name the task. */
export const TABLE_PRESETS: readonly TablePresetDefinition[] = [
  {
    id: 'technical-specification', label: 'Especificações', design: 'specification',
    description: 'Nome da característica em negrito e o valor ao lado.',
    defaults: { header: 'keep', banded: false, firstColumn: true },
  },
  {
    id: 'comparison', label: 'Comparativo de modelos', design: 'comparison',
    description: 'Um modelo por coluna, com cabeçalho e linhas alternadas.',
    defaults: { header: true, banded: true, firstColumn: true },
  },
  {
    id: 'technical-grid', label: 'Códigos de pedido', design: 'matrix',
    description: 'Grade compacta para códigos e opções de pedido.',
    defaults: { header: true, banded: true, firstColumn: true },
  },
  {
    id: 'minimal', label: 'Acessórios', design: 'datasheet',
    description: 'Lista leve de itens, com o nome em destaque.',
    defaults: { header: true, banded: false, firstColumn: true },
  },
] as const;

export type TableTextSizeId = 'small' | 'medium' | 'large';

/** "P / M / G" of the table panel: the text size of the whole table. "M" is the house default. */
export const TABLE_TEXT_SIZES: readonly { readonly id: TableTextSizeId; readonly short: string; readonly name: string; readonly fontSizePt: number }[] = [
  { id: 'small', short: 'P', name: 'Texto pequeno', fontSizePt: 8 },
  { id: 'medium', short: 'M', name: 'Texto médio', fontSizePt: 10 },
  { id: 'large', short: 'G', name: 'Texto grande', fontSizePt: 12 },
] as const;

export function tablePresetDefinition(presetId: TablePresetId): TablePresetDefinition {
  return TABLE_PRESETS.find((preset) => preset.id === presetId) ?? TABLE_PRESETS[0];
}

/** WCAG 2.x AA minimum contrast for ordinary body text. */
export const MIN_TABLE_TEXT_CONTRAST = 4.5;
/** Neutral light blue used when the palette offers no light, legible section fill. */
export const SECTION_TINT_FALLBACK = '#E8EEF5';

const solid = (thicknessPt: number, color: string) => ({ pattern: 'solid' as const, thicknessPt, color });
const none = { pattern: 'none' as const };
const allPadding = (value: number) => ({ top: value, right: value, bottom: value, left: value });

function channel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16);
}

/** WCAG relative luminance of a canonical `#RRGGBB` colour. */
export function relativeLuminance(hex: string): number {
  const linear = [1, 3, 5].map((offset) => {
    const value = channel(hex, offset) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** WCAG contrast ratio between two canonical `#RRGGBB` colours (1 to 21). */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Keep the palette colour when it is legible; otherwise fall back to the
 * house navy, white or black so no preset can produce unreadable rows.
 */
function readableText(preferred: string, background: string): string {
  for (const candidate of [preferred, '#172033', '#FFFFFF', '#000000']) {
    if (contrastRatio(candidate, background) >= MIN_TABLE_TEXT_CONTRAST) return candidate;
  }
  return contrastRatio('#000000', background) >= contrastRatio('#FFFFFF', background) ? '#000000' : '#FFFFFF';
}

function mixWithWhite(hex: string, amount: number): string {
  const mixed = [1, 3, 5].map((offset) => {
    const value = channel(hex, offset);
    return Math.round(value + (255 - value) * amount).toString(16).padStart(2, '0');
  });
  return `#${mixed.join('').toUpperCase()}`;
}

/**
 * Section rows need a light tint (distinct from the white body) that keeps the
 * section label legible. The historical third palette slot is often the dark
 * text navy (#172033), which made section rows unreadable (FR-32).
 */
function sectionFill(style: DocumentStyle, text: string, body: string): string {
  const candidates = [style.palette[2], style.palette[4], style.palette[5], mixWithWhite(text, 0.88), SECTION_TINT_FALLBACK];
  return candidates.find((candidate): candidate is string => {
    if (!candidate || candidate.toUpperCase() === body.toUpperCase()) return false;
    const luminance = relativeLuminance(candidate);
    return luminance >= 0.55 && luminance <= 0.97 && contrastRatio(text, candidate) >= MIN_TABLE_TEXT_CONTRAST;
  }) ?? SECTION_TINT_FALLBACK;
}

function palette(style: DocumentStyle) {
  const first = style.palette[0] ?? '#172033';
  const second = style.palette[1] ?? first;
  const fourth = style.palette[3] ?? '#FFFFFF';
  const section = sectionFill(style, first, fourth);
  return { first, second, fourth, section, sectionText: readableText(first, section) };
}

function baseTypography(style: DocumentStyle): CellStyle {
  return {
    fontFamily: style.defaultText.fontFamily,
    fontSizePt: style.defaultText.fontSizePt,
    lineHeight: style.defaultText.lineHeight,
    fontWeight: style.defaultText.fontWeight ?? 400,
    color: style.defaultText.color ?? '#172033',
    textAlign: 'left',
    verticalAlign: 'top',
  };
}

/** Body rows only carry a colour when the inherited text would be illegible on the body fill. */
function bodyRole(typography: CellStyle, background: string): CellStyle {
  const color = typography.color ?? '#172033';
  const readable = readableText(color, background);
  return readable === color ? { background } : { color: readable, background };
}

export function tablePresetPresentationSnapshot(table: TableModel): TablePresetPresentationSnapshot {
  return {
    base: table.style.base,
    rowRoles: table.style.rowRoles,
    rows: table.rows.map((row) => ({ id: row.id, role: row.role })),
    columns: table.columns.map((column) => column.id),
  };
}

export function materializeTablePreset(
  table: TableModel,
  documentStyle: DocumentStyle,
  presetId: TablePresetId
): TableModel {
  const colors = palette(documentStyle);
  const typography = baseTypography(documentStyle);
  let base: CellStyle;
  let rowRoles: TableModel['style']['rowRoles'];

  switch (presetId) {
    case 'technical-specification':
      base = {
        ...typography,
        paddingMm: allPadding(1.5),
        borders: {
          bottom: solid(0.5, colors.first),
        },
      };
      rowRoles = {
        header: {
          fontWeight: 700,
          color: readableText(colors.fourth, colors.second),
          background: colors.second,
          textAlign: 'left',
          verticalAlign: 'middle',
          borders: { bottom: solid(1, colors.first) },
        },
        body: bodyRole(typography, colors.fourth),
        section: {
          fontWeight: 700,
          color: colors.sectionText,
          background: colors.section,
          borders: { bottom: solid(0.75, colors.first) },
        },
      };
      break;
    case 'technical-grid':
      base = {
        ...typography,
        paddingMm: allPadding(0.8),
        borders: {
          top: solid(0.5, colors.first),
          right: solid(0.5, colors.first),
          bottom: solid(0.5, colors.first),
          left: solid(0.5, colors.first),
        },
      };
      rowRoles = {
        header: { fontWeight: 700, color: readableText(colors.fourth, colors.second), background: colors.second, verticalAlign: 'middle' },
        body: bodyRole(typography, colors.fourth),
        section: { fontWeight: 700, color: colors.sectionText, background: colors.section },
      };
      break;
    case 'comparison':
      base = {
        ...typography,
        paddingMm: allPadding(1.2),
        borders: {
          bottom: solid(0.5, colors.first),
        },
      };
      rowRoles = {
        header: {
          fontWeight: 700,
          color: readableText(colors.fourth, colors.second),
          background: colors.second,
          textAlign: 'center',
          verticalAlign: 'middle',
          borders: { bottom: solid(1, colors.first) },
        },
        body: bodyRole(typography, colors.fourth),
        section: {
          fontWeight: 700,
          color: colors.sectionText,
          background: colors.section,
          textAlign: 'left',
          borders: {
            top: solid(0.75, colors.first),
            bottom: solid(0.75, colors.first),
          },
        },
      };
      break;
    case 'minimal':
      base = {
        ...typography,
        paddingMm: allPadding(1.4),
        borders: {
          top: none,
          right: none,
          bottom: solid(0.5, colors.first),
          left: none,
        },
      };
      rowRoles = {
        header: {
          fontWeight: 700,
          color: readableText(colors.first, colors.fourth),
          background: colors.fourth,
          borders: { bottom: solid(1, colors.first) },
        },
        body: bodyRole(typography, colors.fourth),
        section: {
          fontWeight: 700,
          color: readableText(colors.first, colors.fourth),
          background: colors.fourth,
          borders: { bottom: solid(0.75, colors.first) },
        },
      };
      break;
  }

  return {
    ...table,
    style: {
      ...table.style,
      base,
      rowRoles,
    },
  };
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Native designs (moved from ai-catalog/native-table-design.ts, which re-exports them).                         */
/* ------------------------------------------------------------------------------------------------------------ */

/**
 * Provider selects one of THREE audited native presentation profiles.
 * No arbitrary CSS or unverified technical values enter the contract.
 * All styles use the existing TableRenderer / physical-fit preflight.
 */
export const NativeTableDesignSchema = z.enum(['comparison', 'datasheet', 'matrix']);
export type NativeTableDesign = z.infer<typeof NativeTableDesignSchema>;

const line = (color: string, thicknessPt: number): Border =>
  ({ pattern: 'solid', thicknessPt, color });
const edges = (color: string, thicknessPt: number) =>
  ({ top: line(color, thicknessPt), bottom: line(color, thicknessPt),
    left: line(color, thicknessPt), right: line(color, thicknessPt) });

export interface NativeTableProfile {
  readonly base: CellStyle;
  readonly header: CellStyle;
  readonly label: CellStyle;
  readonly alternate: CellStyle;
  /** Width of the first (label) column for a table with `count` columns. */
  readonly columnMm: (count: number) => number;
  readonly minMm: number;
}

/** The native profiles; their first-column widths also size the panel presets. */
export const NATIVE_TABLE_PROFILES: Readonly<Record<NativeTableDesign, NativeTableProfile>> = {
  comparison: {
    base: { fontFamily: 'Noto Sans', fontSizePt: 9, lineHeight: 1.13,
      paddingMm: {top: 2.2, right: 1.6, bottom: 2.2, left: 1.6},
      verticalAlign: 'middle', color: '#26394f', borders: edges('#bbcbd9', 0.5) },
    header: { fontWeight: 700, color: '#ffffff', background: '#0c426c',
      verticalAlign: 'middle', paddingMm: {top: 3, bottom: 3} },
    label: { fontWeight: 700, color: '#124365', background: '#eef5fa' },
    alternate: { background: '#f7fafc' },
    columnMm: count => count >= 5 ? 41 : 51, minMm: 17,
  },
  datasheet: {
    base: { fontFamily: 'Noto Sans', fontSizePt: 9.5, lineHeight: 1.17,
      paddingMm: {top: 2.8, right: 2.4, bottom: 2.8, left: 2.4},
      color: '#243546', verticalAlign: 'middle', borders: edges('#cbd8e1', 0.45) },
    header: { fontWeight: 700, color: '#0b3556', background: '#dceaf3',
      paddingMm: {top: 3.4, bottom: 3.4} },
    label: { fontWeight: 700, color: '#133d61', background: '#f1f6f9' },
    alternate: { background: '#f7f9fb' },
    columnMm: count => count <= 3 ? 60 : count >= 5 ? 43 : 51, minMm: 17,
  },
  matrix: {
    base: { fontFamily: 'Noto Sans', fontSizePt: 8, lineHeight: 1.12,
      paddingMm: {top: 1.25, right: 1.1, bottom: 1.25, left: 1.1},
      color: '#253544', verticalAlign: 'middle', borders: edges('#d7dee5', 0.35) },
    header: { fontWeight: 700, color: '#172e41', background: '#e0e7ed',
      paddingMm: {top: 1.8, bottom: 1.8} },
    label: { fontWeight: 700, color: '#213e52', background: '#f0f4f7' },
    alternate: { background: '#f3f6f8' },
    columnMm: count => count >= 5 ? 37 : 43, minMm: 14,
  },
};

/** Preserve the complete, editable grid: presentation changes only. */
export function applyNativeTableDesign(input: TableModel, design: NativeTableDesign): TableModel {
  const variant = NativeTableDesignSchema.parse(design);
  const p = NATIVE_TABLE_PROFILES[variant];
  const firstMm = p.columnMm(input.columns.length);
  return {
    ...input,
    style: { ...input.style, base: p.base,
      rowRoles: { ...input.style.rowRoles, header: p.header } },
    columns: input.columns.map((column, index) => ({
      ...column,
      width: index === 0
        ? { mode: 'fixed' as const, mm: firstMm }
        : { mode: 'flex' as const, weight: 1 },
      minMm: index === 0 ? firstMm : p.minMm,
    })),
    rows: input.rows.map((row, index) => ({
      ...row, role: index === 0 ? 'header' as const : 'body' as const,
      ...(index > 0 && index % 2 === 0 ? { style: p.alternate } : {}),
    })),
    cells: input.cells.map(cell => {
      const columnIndex = input.columns.findIndex(column => column.id === cell.columnId);
      const rowIndex = input.rows.findIndex(row => row.id === cell.rowId);
      return {
        ...cell,
        ...(columnIndex === 0 && rowIndex > 0 ? { style: p.label } : {}),
      };
    }),
  };
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Accents of the panel presets, in the catalog palette.                                                         */
/* ------------------------------------------------------------------------------------------------------------ */

/** Colours the panel uses for alternating rows and for the highlighted first column. */
export interface TablePresetAccents {
  /** Background of every second body row ("Linhas alternadas"). */
  readonly band: string;
  /** Style of the first-column cells of body rows ("Primeira coluna destacada"). */
  readonly label: { readonly fontWeight: 700; readonly color: string; readonly background: string };
}

/** Tint toward white of the first palette colour, per design (close to the native profiles). */
const ACCENT_TINTS: Record<TablePresetDesign, { readonly label: number; readonly band: number }> = {
  specification: { label: 0.94, band: 0.965 },
  comparison: { label: 0.93, band: 0.975 },
  matrix: { label: 0.94, band: 0.96 },
  datasheet: { label: 0.95, band: 0.975 },
};

function isLightReadableTone(candidate: string | undefined, text: string): candidate is string {
  if (!candidate || !/^#[0-9A-Fa-f]{6}$/.test(candidate)) return false;
  const luminance = relativeLuminance(candidate);
  return luminance >= 0.7 && luminance < 0.99 && contrastRatio(text, candidate) >= MIN_TABLE_TEXT_CONTRAST;
}

/**
 * Accents of a panel preset in the catalog palette: a very light tint of the first palette colour for the bands
 * and for the first column, whose text keeps the first colour when it is legible (FR-32 rule, WCAG ≥ 4,5).
 * "Especificações" uses the light palette tone of the PRESYS sheet (#F2F6FA) when the catalog has one.
 */
export function tablePresetAccents(documentStyle: DocumentStyle, presetId: TablePresetId): TablePresetAccents {
  const { design } = tablePresetDefinition(presetId);
  const tint = ACCENT_TINTS[design];
  const first = palette(documentStyle).first;
  const tinted = mixWithWhite(first, tint.label);
  const paletteTone = documentStyle.palette[4]?.toUpperCase();
  const labelBackground = design === 'specification' && isLightReadableTone(paletteTone, readableText(first, paletteTone ?? tinted))
    ? paletteTone
    : tinted;
  return {
    band: mixWithWhite(first, tint.band),
    label: { fontWeight: 700, color: readableText(first, labelBackground), background: labelBackground },
  };
}

/** Width of the first column a panel preset proposes, or undefined when the other columns would not fit. */
export function tablePresetFirstColumnMm(
  presetId: TablePresetId,
  table: Pick<TableModel, 'columns'>,
  frameWidthMm: number
): number | undefined {
  const count = table.columns.length;
  if (count < 2) return undefined;
  const { design } = tablePresetDefinition(presetId);
  const preferred = design === 'specification' ? 68 : NATIVE_TABLE_PROFILES[design].columnMm(count);
  const othersMinMm = table.columns.slice(1).reduce((sum, column) => sum + column.minMm, 0);
  // Keep room for the other columns (at least 25 mm each, or their own minimum) and never take more than 45 %.
  const room = frameWidthMm - Math.max(othersMinMm, 25 * (count - 1));
  const width = Math.min(preferred, room, frameWidthMm * 0.45);
  return width >= 20 ? Math.round(width * 10) / 10 : undefined;
}

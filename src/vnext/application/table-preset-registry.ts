import type { CellStyle, DocumentStyle, TableModel } from '../domain/editorial-model';
import type { TablePresetId, TablePresetPresentationSnapshot } from './contracts';

export interface TablePresetDefinition {
  readonly id: TablePresetId;
  readonly label: string;
  readonly description: string;
}

export const TABLE_PRESETS: readonly TablePresetDefinition[] = [
  { id: 'technical-specification', label: 'Especificação Técnica', description: 'Leitura técnica equilibrada com cabeçalho destacado.' },
  { id: 'technical-grid', label: 'Grade Técnica', description: 'Grade completa e compacta para dados densos.' },
  { id: 'comparison', label: 'Comparação', description: 'Cabeçalho e seções fortes para comparar variantes.' },
  { id: 'minimal', label: 'Minimalista', description: 'Separação horizontal leve, sem ruído vertical.' },
] as const;

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

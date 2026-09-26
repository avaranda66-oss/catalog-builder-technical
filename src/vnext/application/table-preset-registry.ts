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

const solid = (thicknessPt: number, color: string) => ({ pattern: 'solid' as const, thicknessPt, color });
const none = { pattern: 'none' as const };
const allPadding = (value: number) => ({ top: value, right: value, bottom: value, left: value });

function palette(style: DocumentStyle) {
  const first = style.palette[0] ?? '#172033';
  const second = style.palette[1] ?? first;
  const third = style.palette[2] ?? first;
  const fourth = style.palette[3] ?? '#FFFFFF';
  return { first, second, third, fourth };
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
          color: colors.fourth,
          background: colors.second,
          textAlign: 'left',
          verticalAlign: 'middle',
          borders: { bottom: solid(1, colors.first) },
        },
        body: { background: colors.fourth },
        section: {
          fontWeight: 700,
          color: colors.first,
          background: colors.third,
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
        header: { fontWeight: 700, color: colors.fourth, background: colors.second, verticalAlign: 'middle' },
        body: { background: colors.fourth },
        section: { fontWeight: 700, background: colors.third },
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
          color: colors.fourth,
          background: colors.second,
          textAlign: 'center',
          verticalAlign: 'middle',
          borders: { bottom: solid(1, colors.first) },
        },
        body: { background: colors.fourth },
        section: {
          fontWeight: 700,
          color: colors.first,
          background: colors.third,
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
          color: colors.first,
          background: colors.fourth,
          borders: { bottom: solid(1, colors.first) },
        },
        body: { background: colors.fourth },
        section: {
          fontWeight: 700,
          color: colors.first,
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

import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  materializeTablePreset,
  MIN_TABLE_TEXT_CONTRAST,
  relativeLuminance,
  TABLE_PRESETS,
} from '@/vnext/application/table-preset-registry';
import { createCatalogDocument } from '@/vnext/application';
import { resolveCellStyle } from '@/vnext/domain/style-resolution';
import type { DocumentStyle, TableModel } from '@/vnext/domain';

let nextId = 0;
const base = createCatalogDocument(() => `contrast-${++nextId}`).style;
const withPalette = (palette: string[]): DocumentStyle => ({ ...base, palette });

/** Every palette the product ships plus hostile ones a user could pick. */
const PALETTES: Record<string, DocumentStyle> = {
  'padrão do catálogo novo': base,
  'PRESYS TA-25N': withPalette(['#003366', '#0072CE', '#172033', '#FFFFFF', '#F2F6FA', '#D9E2EC']),
  'composição por IA': withPalette(['#172033', '#003366', '#EDF5FF', '#FFFFFF']),
  'só uma cor': withPalette(['#003366']),
  'invertida (texto claro)': withPalette(['#FFFFFF', '#FFFF00', '#FFFFFF', '#000000']),
  'tons médios': withPalette(['#808080', '#7F7F7F', '#909090', '#777777']),
  'texto padrão claro': { ...withPalette(['#003366', '#0072CE', '#172033', '#FFFFFF']), defaultText: { ...base.defaultText, color: '#EEEEEE' } },
};

function threeRoleTable(): TableModel {
  const roles = ['header', 'body', 'section', 'body'] as const;
  const rows = roles.map((role, index) => ({ id: `row-${index}`, role, heightPolicy: { mode: 'AUTO' as const } }));
  const columns = [0, 1].map((index) => ({ id: `column-${index}`, width: { mode: 'flex' as const, weight: 1 }, minMm: 1 }));
  return {
    id: 'contrast-table',
    rows,
    columns,
    cells: rows.flatMap((row) => columns.map((column) => ({
      id: `${row.id}-${column.id}`, rowId: row.id, columnId: column.id, content: { type: 'empty' as const },
    }))),
    style: { base: {}, rowRoles: {}, annotation: {}, annotationGapMm: 1 },
    annotations: [],
    legend: [],
  };
}

describe('FR-32 legible table rows in every preset', () => {
  it('computes WCAG luminance and contrast like the specification', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBe(0);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#003366', '#172033')).toBeLessThan(1.5);
  });

  for (const [paletteName, style] of Object.entries(PALETTES)) {
    for (const preset of TABLE_PRESETS) {
      it(`${preset.label} × paleta ${paletteName}: cabeçalho, corpo e seção com contraste ≥ 4,5`, () => {
        const table = materializeTablePreset(threeRoleTable(), style, preset.id);
        for (const row of table.rows) {
          const cell = table.cells.find((entry) => entry.rowId === row.id)!;
          const resolved = resolveCellStyle(style, table, cell);
          const ratio = contrastRatio(resolved.color, resolved.background);
          expect(ratio, `${row.role}: ${resolved.color} sobre ${resolved.background}`).toBeGreaterThanOrEqual(MIN_TABLE_TEXT_CONTRAST);
        }
      });
    }
  }

  it('gives section rows a light tint distinct from the white body instead of the dark navy', () => {
    for (const presetId of ['technical-specification', 'technical-grid', 'comparison'] as const) {
      const table = materializeTablePreset(threeRoleTable(), base, presetId);
      const section = table.style.rowRoles.section!;
      expect(section.background).not.toBe('#172033');
      expect(section.background?.toUpperCase()).not.toBe('#FFFFFF');
      expect(relativeLuminance(section.background!)).toBeGreaterThan(0.55);
      expect(section.color).toBe('#003366');
    }
  });

  it('uses the PRESYS light palette tone and keeps the AI composition palette as it was', () => {
    const presys = materializeTablePreset(threeRoleTable(), PALETTES['PRESYS TA-25N'], 'technical-specification');
    expect(presys.style.rowRoles.section?.background).toBe('#F2F6FA');
    const composed = materializeTablePreset(threeRoleTable(), PALETTES['composição por IA'], 'comparison');
    expect(composed.style.rowRoles.section).toMatchObject({ color: '#172033', background: '#EDF5FF' });
    expect(composed.style.rowRoles.header).toMatchObject({ color: '#FFFFFF', background: '#003366' });
    expect(composed.style.rowRoles.body).toEqual({ background: '#FFFFFF' });
  });
});

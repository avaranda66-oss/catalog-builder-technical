import { describe, it, expect } from 'vitest';
import { TABLE_VISUAL_FAMILIES, DEFAULT_MARKER_LEGENDS, TechnicalMarkerType } from '../../src/components/technical-table/table-tokens';

describe('Technical Table System (TABLE-01)', () => {
  it('contém as 3 famílias visuais técnicas oficiais', () => {
    expect(TABLE_VISUAL_FAMILIES.monochrome).toBeDefined();
    expect(TABLE_VISUAL_FAMILIES.precision_blue).toBeDefined();
    expect(TABLE_VISUAL_FAMILIES.family_header).toBeDefined();
  });

  it('possui tokens de cantos retos e espessuras regulamentadas', () => {
    const mono = TABLE_VISUAL_FAMILIES.monochrome;
    expect(mono.borderOuter).toContain('border');
    expect(mono.headerBg).toBe('bg-slate-100');

    const blue = TABLE_VISUAL_FAMILIES.precision_blue;
    expect(blue.headerBg).toBe('bg-[#003366]');
    expect(blue.accentColor).toBe('#003366');
  });

  it('possui dicionário estruturado de legendas para todos os marcadores metrológicos', () => {
    const markers: TechnicalMarkerType[] = [
      'filled_square',
      'empty_square',
      'filled_circle',
      'empty_circle',
      'asterisk',
      'double_asterisk',
      'dash'
    ];

    markers.forEach((m) => {
      expect(DEFAULT_MARKER_LEGENDS[m]).toBeDefined();
      expect(DEFAULT_MARKER_LEGENDS[m].length).toBeGreaterThan(0);
    });
  });
});

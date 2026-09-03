// tests/domain/table-core/style-token.test.ts
// Testes do Contrato de Tokens Semânticos Fechados de Estilo e Presets do Table Core V2.

import { describe, it, expect } from 'vitest';
import {
  TableColorTokenSchema,
  TableCellStyleOverrideSchema,
  TablePresentationModelSchema
} from '../../../src/domain/table-core/table.schema';
import { TABLE_PRESETS } from '../../../src/domain/table-core/table.presets';

describe('Table Core V2: Closed Style Token Contract', () => {
  it('TABLE-TOKEN-1: Tokens semânticos homologados são aceitos pelo schema', () => {
    const validTokens = [
      'transparent',
      'surface',
      'surface_subtle',
      'surface_header',
      'text_primary',
      'text_secondary',
      'text_muted',
      'text_on_header',
      'brand_primary',
      'brand_secondary',
      'accent',
      'success',
      'warning',
      'critical',
      'white',
      'slate_900',
      'slate_100'
    ];

    validTokens.forEach((token) => {
      const res = TableColorTokenSchema.safeParse(token);
      expect(res.success).toBe(true);
    });

    const overrideRes = TableCellStyleOverrideSchema.safeParse({
      bold: true,
      textColorToken: 'text_primary',
      backgroundColorToken: 'surface_subtle'
    });
    expect(overrideRes.success).toBe(true);
  });

  it('TABLE-TOKEN-2: Cor hexadecimal arbitrária "#ff0000" é estritamente rejeitada', () => {
    const res = TableColorTokenSchema.safeParse('#ff0000');
    expect(res.success).toBe(false);

    const overrideRes = TableCellStyleOverrideSchema.safeParse({
      textColorToken: '#ff0000'
    });
    expect(overrideRes.success).toBe(false);
  });

  it('TABLE-TOKEN-3: Nome de cor CSS arbitrário "red" é estritamente rejeitado', () => {
    const res = TableColorTokenSchema.safeParse('red');
    expect(res.success).toBe(false);

    const overrideRes = TableCellStyleOverrideSchema.safeParse({
      backgroundColorToken: 'red'
    });
    expect(overrideRes.success).toBe(false);
  });

  it('TABLE-TOKEN-4: Injeção maliciosa "url(javascript...)" é estritamente rejeitada', () => {
    const res = TableColorTokenSchema.safeParse('url(javascript:alert(1))');
    expect(res.success).toBe(false);

    const overrideRes = TableCellStyleOverrideSchema.safeParse({
      backgroundColorToken: 'url(javascript:alert(1))'
    });
    expect(overrideRes.success).toBe(false);
  });

  it('TABLE-TOKEN-5: Todos os presets canônicos produzem exclusivamente tokens homologados', () => {
    Object.entries(TABLE_PRESETS).forEach(([presetKey, preset]) => {
      const bgRes = TableColorTokenSchema.safeParse(preset.headerBackgroundToken);
      expect(bgRes.success, `Preset ${presetKey} possui headerBackgroundToken inválido`).toBe(true);

      const textRes = TableColorTokenSchema.safeParse(preset.headerTextColorToken);
      expect(textRes.success, `Preset ${presetKey} possui headerTextColorToken inválido`).toBe(true);

      const presModelRes = TablePresentationModelSchema.safeParse(preset);
      expect(presModelRes.success, `Preset ${presetKey} falhou na validação de apresentação`).toBe(true);
    });
  });
});

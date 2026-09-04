import { describe, it, expect } from 'vitest';
import {
  TABLE_PRESETS,
  BUILTIN_TABLE_PRESET_IDS,
  getTablePreset,
  isBuiltinTablePresetId
} from '../../../src/domain/table-core/table.presets';
import {
  TablePresetIdSchema,
  TablePresentationModelSchema
} from '../../../src/domain/table-core/table.schema';
import { TablePresetId } from '../../../src/domain/table-core/table.types';
import { CURATED_PALETTES } from '../../../src/domain/appearance/catalog-appearance';

describe('Table Core V2: Preset Registry Safety & Immutability (Emendas 4, 5, 9, 11, 16, 17, 18, 24)', () => {
  // Emenda 17: Os 8 presets originais devem permanecer disponíveis
  const ORIGINAL_8_PRESETS: readonly TablePresetId[] = [
    'presys_clean_technical',
    'dense_spec_matrix',
    'model_comparison',
    'parameter_value',
    'presys_dark_navy',
    'presys_blue_comparison',
    'gray_technical',
    'corporate_slate'
  ];

  // Restored & New Presets (Emendas 5, 17, 18)
  const RESTORED_AND_NEW_PRESETS: readonly TablePresetId[] = [
    'precision_blue',
    'family_header',
    'minimal_light',
    'high_contrast'
  ];

  it('PRESET-1: Todos os 8 presets originais estão estritamente preservados no registry', () => {
    for (const id of ORIGINAL_8_PRESETS) {
      expect(TABLE_PRESETS[id]).toBeDefined();
      expect(BUILTIN_TABLE_PRESET_IDS).toContain(id);
      expect(TablePresetIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it('PRESET-2: Presets restaurados (precision_blue, family_header, minimal_light, high_contrast) estão disponíveis', () => {
    for (const id of RESTORED_AND_NEW_PRESETS) {
      expect(TABLE_PRESETS[id]).toBeDefined();
      expect(BUILTIN_TABLE_PRESET_IDS).toContain(id);
      expect(TablePresetIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it('PRESET-3: Total de built-in presets é exatamente 12 (8 originais + 4 restaurados/novos)', () => {
    expect(BUILTIN_TABLE_PRESET_IDS.length).toBe(12);
    expect(Object.keys(TABLE_PRESETS).length).toBe(12);
  });

  it('PRESET-4: Emenda 5 - precision_blue utiliza "technical_blue" (#003366) e a paleta correspondente é nomeada Precision Blue', () => {
    const precisionPreset = TABLE_PRESETS['precision_blue'];
    expect(precisionPreset).toBeDefined();
    expect(precisionPreset.headerBackgroundToken).toBe('technical_blue');
    const palette = CURATED_PALETTES.find((p) => p.id === 'precision_blue');
    expect(palette?.name).toMatch(/Precision Blue/i);
    expect(palette?.name).not.toMatch(/Presys Oficial/i);
  });

  it('PRESET-5: Todos os 12 presets passam na validação estrita do TablePresentationModelSchema', () => {
    for (const id of BUILTIN_TABLE_PRESET_IDS) {
      const preset = TABLE_PRESETS[id];
      const res = TablePresentationModelSchema.safeParse(preset);
      expect(res.success, `Preset ${id} falhou na validação de apresentação`).toBe(true);
    }
  });

  it('PRESET-6: Emenda 9 e 11 - Nomes ou IDs dinâmicos de usuário são estritamente rejeitados pelo TablePresetIdSchema', () => {
    const userPresetIds = [
      'user_preset_123',
      'Minha Paleta Personalizada',
      'Gabriel Azul 01',
      'custom_theme_v2',
      'custom-saved-style'
    ];

    for (const invalidId of userPresetIds) {
      expect(TablePresetIdSchema.safeParse(invalidId).success).toBe(false);
      expect(isBuiltinTablePresetId(invalidId)).toBe(false);
    }
  });

  it('PRESET-7: Emenda 16 - getTablePreset retorna clone seguro; mutações externas não alteram TABLE_PRESETS', () => {
    const preset = getTablePreset('precision_blue');
    expect(preset).toBeDefined();
    const originalHeaderBg = TABLE_PRESETS['precision_blue'].headerBackgroundToken;

    // Tentativa de mutação direta no clone retornado
    preset.headerBackgroundToken = '#ff0000';

    // A definição canônica no TABLE_PRESETS permanece inalterada
    expect(TABLE_PRESETS['precision_blue'].headerBackgroundToken).toBe(originalHeaderBg);
    expect(TABLE_PRESETS['precision_blue'].headerBackgroundToken).not.toBe('#ff0000');
  });

  it('PRESET-8: Emenda 19 - high_contrast possui stripeStyle "high_contrast_zebra" e validação estrita', () => {
    const highContrast = TABLE_PRESETS['high_contrast'];
    expect(highContrast.stripeStyle).toBe('high_contrast_zebra');
  });
});

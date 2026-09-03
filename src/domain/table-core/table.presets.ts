// src/domain/table-core/table.presets.ts
// Presets de Apresentação Canônicos do Table Core V2.
// Define estilos corporativos sem acoplamento com classes de frameworks CSS.
// Zero explicit any.

import { TableCoreModel, TablePresetId, TablePresentationModel } from './table.types';

export const TABLE_PRESETS: Record<TablePresetId, TablePresentationModel> = {
  presys_clean_technical: {
    presetId: 'presys_clean_technical',
    density: 'regular',
    borderStyle: 'all',
    stripeStyle: 'none',
    headerBackgroundToken: 'slate_900',
    headerTextColorToken: 'white',
    fontScale: 'normal',
    tableWidth: { mode: 'auto_fill' }
  },
  dense_spec_matrix: {
    presetId: 'dense_spec_matrix',
    density: 'compact',
    borderStyle: 'all',
    stripeStyle: 'subtle_zebra',
    headerBackgroundToken: 'slate_800',
    headerTextColorToken: 'white',
    fontScale: 'compact',
    tableWidth: { mode: 'auto_fill' }
  },
  model_comparison: {
    presetId: 'model_comparison',
    density: 'regular',
    borderStyle: 'horizontal_only',
    stripeStyle: 'subtle_zebra',
    headerBackgroundToken: 'brand_navy',
    headerTextColorToken: 'white',
    fontScale: 'normal',
    tableWidth: { mode: 'auto_fill' }
  },
  parameter_value: {
    presetId: 'parameter_value',
    density: 'compact',
    borderStyle: 'horizontal_only',
    stripeStyle: 'none',
    headerBackgroundToken: 'slate_100',
    headerTextColorToken: 'slate_900',
    fontScale: 'normal',
    tableWidth: { mode: 'auto_fill' }
  },
  presys_dark_navy: {
    presetId: 'presys_dark_navy',
    density: 'regular',
    borderStyle: 'horizontal_only',
    stripeStyle: 'none',
    headerBackgroundToken: 'brand_navy',
    headerTextColorToken: 'white',
    sectionBackgroundToken: 'surface_subtle',
    sectionTextColorToken: 'slate_900',
    fontScale: 'normal',
    tableWidth: { mode: 'auto_fill' }
  },
  presys_blue_comparison: {
    presetId: 'presys_blue_comparison',
    density: 'compact',
    borderStyle: 'all',
    stripeStyle: 'subtle_zebra',
    headerBackgroundToken: 'brand_primary',
    headerTextColorToken: 'white',
    sectionBackgroundToken: 'surface_subtle',
    sectionTextColorToken: 'brand_navy',
    fontScale: 'compact',
    tableWidth: { mode: 'auto_fill' }
  },
  gray_technical: {
    presetId: 'gray_technical',
    density: 'compact',
    borderStyle: 'all',
    stripeStyle: 'none',
    headerBackgroundToken: 'slate_800',
    headerTextColorToken: 'slate_100',
    sectionBackgroundToken: 'slate_100',
    sectionTextColorToken: 'slate_800',
    fontScale: 'compact',
    tableWidth: { mode: 'auto_fill' }
  },
  corporate_slate: {
    presetId: 'corporate_slate',
    density: 'regular',
    borderStyle: 'outer_only',
    stripeStyle: 'subtle_zebra',
    headerBackgroundToken: 'slate_900',
    headerTextColorToken: 'white',
    sectionBackgroundToken: 'surface_subtle',
    sectionTextColorToken: 'slate_900',
    fontScale: 'normal',
    tableWidth: { mode: 'auto_fill' }
  }
};

/**
 * Retorna a configuração de apresentação para o preset solicitado.
 */
export function getTablePreset(presetId: TablePresetId): TablePresentationModel {
  const preset = TABLE_PRESETS[presetId];
  if (!preset) {
    throw new Error(`Preset de tabela desconhecido: "${presetId}"`);
  }
  return structuredClone(preset);
}

/**
 * Aplica um preset de apresentação à tabela de forma puramente imutável.
 * Invariante: Garante que células, linhas, colunas e vínculos permanecem intocados.
 */
export function applyTablePreset(
  table: TableCoreModel,
  presetId: TablePresetId
): TableCoreModel {
  const presentation = getTablePreset(presetId);

  // Preserva largura fixa manual se a tabela anterior possuía uma configurada
  if (table.presentation.tableWidth.mode === 'fixed_mm') {
    presentation.tableWidth = { ...table.presentation.tableWidth };
  }

  return {
    ...table,
    presentation
  };
}

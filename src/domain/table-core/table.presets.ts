// src/domain/table-core/table.presets.ts
// Presets de Apresentação Canônicos do Table Core V2.
// Define estilos corporativos sem acoplamento com classes de frameworks CSS.

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
    tableWidthMode: 'auto_fill'
  },
  dense_spec_matrix: {
    presetId: 'dense_spec_matrix',
    density: 'compact',
    borderStyle: 'all',
    stripeStyle: 'subtle_zebra',
    headerBackgroundToken: 'slate_800',
    headerTextColorToken: 'white',
    fontScale: 'compact',
    tableWidthMode: 'auto_fill'
  },
  model_comparison: {
    presetId: 'model_comparison',
    density: 'regular',
    borderStyle: 'horizontal_only',
    stripeStyle: 'subtle_zebra',
    headerBackgroundToken: 'brand_navy',
    headerTextColorToken: 'white',
    fontScale: 'normal',
    tableWidthMode: 'auto_fill'
  },
  parameter_value: {
    presetId: 'parameter_value',
    density: 'compact',
    borderStyle: 'horizontal_only',
    stripeStyle: 'none',
    headerBackgroundToken: 'slate_100',
    headerTextColorToken: 'slate_900',
    fontScale: 'normal',
    tableWidthMode: 'auto_fill'
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
  if (table.presentation.tableWidthMode === 'fixed_mm' && table.presentation.fixedTableWidthMm) {
    presentation.tableWidthMode = 'fixed_mm';
    presentation.fixedTableWidthMm = table.presentation.fixedTableWidthMm;
  }

  return {
    ...table,
    presentation
  };
}

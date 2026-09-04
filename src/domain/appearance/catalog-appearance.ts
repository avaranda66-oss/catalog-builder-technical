// src/domain/appearance/catalog-appearance.ts
// Gerenciador de Aparência do Catálogo: Paletas Curadas, Paletas Salvas, Estilos de Tabela e Clipboard Interno (MISSÃO UX.TABLE.DESIGN.SYSTEM1).
// Zero dependência de Supabase, RPC ou APIs externas - armazenamento local versionado e materialização autossuficiente no documento.
// Zero explicit any.

import {
  TableCoreModel,
  TablePresentationModel,
  TableColorValue
} from '../table-core/table.types';
import { TablePresentationModelSchema } from '../table-core/table.schema';
import { getTablePreset, applyTablePreset } from '../table-core/table.presets';
import {
  calculateContrastRatio,
  getContrastStatus,
  autoFixContrast,
  ContrastStatus
} from '../color-contrast';

export interface CuratedPalette {
  id: string;
  name: string;
  description: string;
  headerBackground: TableColorValue;
  headerText: TableColorValue;
  sectionBackground?: TableColorValue;
  sectionText?: TableColorValue;
  bodyBackground?: TableColorValue;
  borderColor?: TableColorValue;
}

export interface SavedPalette {
  id: string;
  name: string;
  headerBackground: TableColorValue;
  headerText: TableColorValue;
  sectionBackground?: TableColorValue;
  sectionText?: TableColorValue;
  bodyBackground?: TableColorValue;
  borderColor?: TableColorValue;
  createdAt: string;
}

export interface SavedTableStyle {
  id: string;
  name: string;
  presentation: TablePresentationModel;
  createdAt: string;
  updatedAt: string;
}

/**
 * Paletas curadas de alto nível com garantia de contraste WCAG AA/AAA.
 * Preserva as identidades industriais e de metrologia (Emenda 17 e 20).
 */
export const CURATED_PALETTES: readonly CuratedPalette[] = [
  {
    id: 'presys_technical',
    name: 'Presys Technical (Navy)',
    description: 'Padrão corporativo Presys em azul marinho profundo e texto branco de alto contraste',
    headerBackground: 'brand_navy', // #001f3f
    headerText: 'white',
    sectionBackground: 'surface_subtle',
    sectionText: 'brand_navy',
    borderColor: 'slate_200'
  },
  {
    id: 'precision_blue',
    name: 'Precision Blue (Classic)',
    description: 'Azul metrológico clássico (#003366) calibrado para instrumentos de precisão',
    headerBackground: 'technical_blue', // #003366
    headerText: 'white',
    sectionBackground: 'surface_subtle',
    sectionText: 'technical_blue',
    borderColor: 'slate_200'
  },
  {
    id: 'slate_minimal',
    name: 'Slate Technical',
    description: 'Cinza ardósia neutro e sóbrio para folhas de dados de engenharia',
    headerBackground: 'slate_900', // #0f172a
    headerText: 'white',
    sectionBackground: 'slate_100',
    sectionText: 'slate_900',
    borderColor: 'slate_200'
  },
  {
    id: 'cool_gray',
    name: 'Cool Steel',
    description: 'Tons de aço frio para tabelas comparativas densas',
    headerBackground: 'slate_800',
    headerText: 'white',
    sectionBackground: 'surface_subtle',
    sectionText: 'slate_800',
    borderColor: 'slate_200'
  },
  {
    id: 'dark_graphite',
    name: 'Dark Graphite',
    description: 'Grafite escuro neutro com máximo contraste para impressão em alta definição',
    headerBackground: '#18181b',
    headerText: '#ffffff',
    sectionBackground: '#f4f4f5',
    sectionText: '#18181b',
    borderColor: 'slate_200'
  },
  {
    id: 'emerald_industrial',
    name: 'Emerald Process',
    description: 'Verde esmeralda escuro industrial para especificações de processo e controle',
    headerBackground: '#064e3b',
    headerText: '#ffffff',
    sectionBackground: '#f0fdf4',
    sectionText: '#064e3b',
    borderColor: 'slate_200'
  }
] as const;

// ----------------------------------------------------------------------------
// LocalStorage Keys
// ----------------------------------------------------------------------------
const STORAGE_KEY_SAVED_PALETTES = 'cb_saved_palettes_v1';
const STORAGE_KEY_SAVED_STYLES = 'cb_saved_table_styles_v1';

// ----------------------------------------------------------------------------
// Gerenciamento de Paletas do Usuário (Emenda 9 e 10)
// ----------------------------------------------------------------------------

export function getSavedPalettes(): SavedPalette[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_SAVED_PALETTES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUserPalette(palette: Omit<SavedPalette, 'id' | 'createdAt'>): SavedPalette {
  const current = getSavedPalettes();
  const newPalette: SavedPalette = {
    ...palette,
    id: `palette_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString()
  };
  const updated = [newPalette, ...current];
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY_SAVED_PALETTES, JSON.stringify(updated));
    } catch {
      // Falha silenciosa de storage
    }
  }
  return newPalette;
}

export function deleteSavedPalette(id: string): void {
  const current = getSavedPalettes();
  const filtered = current.filter((p) => p.id !== id);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY_SAVED_PALETTES, JSON.stringify(filtered));
    } catch {
      // Falha silenciosa de storage
    }
  }
}

// ----------------------------------------------------------------------------
// Gerenciamento de Estilos de Tabela Salvos (Emenda 11)
// ----------------------------------------------------------------------------

export function getSavedTableStyles(): SavedTableStyle[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_SAVED_STYLES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUserTableStyle(
  nameOrPayload: string | { name: string; presentation: TablePresentationModel },
  presentationArg?: TablePresentationModel
): SavedTableStyle | null {
  const name = typeof nameOrPayload === 'string' ? nameOrPayload : nameOrPayload.name;
  const presentation = typeof nameOrPayload === 'string' ? presentationArg : nameOrPayload.presentation;
  if (!presentation) {
    return null;
  }
  const parsed = TablePresentationModelSchema.safeParse(presentation);
  if (!parsed.success) {
    return null;
  }
  const current = getSavedTableStyles();
  const now = new Date().toISOString();
  const newStyle: SavedTableStyle = {
    id: `style_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name?.trim() || 'Estilo Personalizado',
    presentation: structuredClone(parsed.data),
    createdAt: now,
    updatedAt: now
  };
  const updated = [newStyle, ...current];
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY_SAVED_STYLES, JSON.stringify(updated));
    } catch {
      // Falha silenciosa de storage
    }
  }
  return newStyle;
}

export function deleteSavedTableStyle(id: string): void {
  const current = getSavedTableStyles();
  const filtered = current.filter((s) => s.id !== id);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY_SAVED_STYLES, JSON.stringify(filtered));
    } catch {
      // Falha silenciosa de storage
    }
  }
}

// ----------------------------------------------------------------------------
// Aplicação e Materialização de Paleta na Tabela (Emenda 9 e 10)
// ----------------------------------------------------------------------------

export function applyPaletteToTable(
  table: TableCoreModel,
  palette: CuratedPalette | SavedPalette
): TableCoreModel {
  const presentation: TablePresentationModel = {
    ...structuredClone(table.presentation),
    headerBackgroundToken: palette.headerBackground,
    headerTextColorToken: palette.headerText,
    sectionBackgroundToken: palette.sectionBackground ?? table.presentation.sectionBackgroundToken,
    sectionTextColorToken: palette.sectionText ?? table.presentation.sectionTextColorToken,
    borderColorToken: palette.borderColor ?? table.presentation.borderColorToken
  };

  return {
    ...table,
    presentation
  };
}

export function materializePaletteOnPresentation(
  presentation: TablePresentationModel,
  palette: CuratedPalette | SavedPalette
): TablePresentationModel {
  return {
    ...structuredClone(presentation),
    headerBackgroundToken: palette.headerBackground,
    headerTextColorToken: palette.headerText,
    sectionBackgroundToken: palette.sectionBackground ?? presentation.sectionBackgroundToken,
    sectionTextColorToken: palette.sectionText ?? presentation.sectionTextColorToken,
    bodyBackgroundToken: palette.bodyBackground ?? presentation.bodyBackgroundToken,
    borderColorToken: palette.borderColor ?? presentation.borderColorToken
  };
}

// ----------------------------------------------------------------------------
// Clipboard Interno de Aparência (Emenda 13)
// ----------------------------------------------------------------------------

let inMemoryAppearanceClipboard: TablePresentationModel | null = null;

export function copyTableAppearance(presentation: TablePresentationModel): void {
  const parsed = TablePresentationModelSchema.safeParse(presentation);
  if (parsed.success) {
    inMemoryAppearanceClipboard = structuredClone(parsed.data);
  }
}

export function getTableAppearanceClipboard(): TablePresentationModel | null {
  return inMemoryAppearanceClipboard ? structuredClone(inMemoryAppearanceClipboard) : null;
}

export function hasTableAppearanceInClipboard(): boolean {
  return inMemoryAppearanceClipboard !== null;
}

export function pasteTableAppearance(
  table: TableCoreModel,
  clipboardData?: TablePresentationModel | null
): TableCoreModel | null {
  const data = clipboardData || inMemoryAppearanceClipboard;
  if (!data) return null;

  const parsed = TablePresentationModelSchema.safeParse(data);
  if (!parsed.success) return null;

  const presentation = structuredClone(parsed.data);
  // Preserva largura fixa original da tabela receptora se aplicável
  if (table.presentation.tableWidth.mode === 'fixed_mm') {
    presentation.tableWidth = { ...table.presentation.tableWidth };
  }

  return {
    ...table,
    presentation
  };
}

// ----------------------------------------------------------------------------
// Ações de Reset com Semântica Explícita (Emenda 12)
// ----------------------------------------------------------------------------

export function resetToActivePreset(table: TableCoreModel): TableCoreModel {
  const cleanPreset = getTablePreset(table.presentation.presetId);
  if (table.presentation.tableWidth.mode === 'fixed_mm') {
    cleanPreset.tableWidth = { ...table.presentation.tableWidth };
  }
  return {
    ...table,
    presentation: cleanPreset
  };
}

export function resetToSystemDefault(table: TableCoreModel): TableCoreModel {
  return applyTablePreset(table, 'presys_clean_technical');
}

// ----------------------------------------------------------------------------
// Re-exportação de Contraste e Auto-Fix (Emenda 20)
// ----------------------------------------------------------------------------

export {
  calculateContrastRatio,
  getContrastStatus,
  autoFixContrast
};
export type { ContrastStatus };

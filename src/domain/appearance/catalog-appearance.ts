// src/domain/appearance/catalog-appearance.ts
// Gerenciador de Aparência do Catálogo: Paletas Curadas, Paletas Salvas, Estilos de Tabela e Clipboard Interno (MISSÃO UX.TABLE.DESIGN.SYSTEM1).
// Zero dependência de Supabase, RPC ou APIs externas - armazenamento local versionado e materialização autossuficiente no documento.
// Zero explicit any.

import { z } from 'zod';
import {
  TableCoreModel,
  TablePresentationModel,
  TableColorValue
} from '../table-core/table.types';
import { TablePresentationModelSchema, TableColorValueSchema } from '../table-core/table.schema';
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

export const SavedPaletteSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  headerBackground: TableColorValueSchema,
  headerText: TableColorValueSchema,
  sectionBackground: TableColorValueSchema.optional(),
  sectionText: TableColorValueSchema.optional(),
  bodyBackground: TableColorValueSchema.optional(),
  borderColor: TableColorValueSchema.optional(),
  createdAt: z.string()
});
export type SavedPalette = z.infer<typeof SavedPaletteSchema>;

export const SavedTableStyleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  presentation: TablePresentationModelSchema,
  createdAt: z.string(),
  updatedAt: z.string().optional()
});
export type SavedTableStyle = z.infer<typeof SavedTableStyleSchema>;

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
    if (!Array.isArray(parsed)) return [];

    const valid: SavedPalette[] = [];
    for (const item of parsed) {
      const check = SavedPaletteSchema.safeParse(item);
      if (check.success) {
        valid.push(check.data);
      }
    }
    return valid;
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
// Gerenciamento de Estilos de Tabela Salvos (Emenda 11) & Migração Unificada (Closure 9)
// ----------------------------------------------------------------------------
const LEGACY_STORAGE_KEY_TEMPLATES = 'cb_user_table_presentation_templates_v1';

export function getSavedTableStyles(): SavedTableStyle[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_SAVED_STYLES);
    let items: unknown[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        items = parsed;
      }
    }

    const valid: SavedTableStyle[] = [];
    const seenIds = new Set<string>();

    for (const item of items) {
      const check = SavedTableStyleSchema.safeParse(item);
      if (check.success) {
        valid.push(check.data);
        seenIds.add(check.data.id);
      }
    }

    // Migração transparente do legado cb_user_table_presentation_templates_v1 (Closure 9)
    try {
      const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY_TEMPLATES);
      if (legacyRaw) {
        const legacyParsed = JSON.parse(legacyRaw);
        if (Array.isArray(legacyParsed)) {
          let migratedAny = false;
          for (const lItem of legacyParsed) {
            if (lItem && typeof lItem === 'object' && typeof (lItem as Record<string, unknown>).name === 'string' && (lItem as Record<string, unknown>).presentation) {
              const presCheck = TablePresentationModelSchema.safeParse((lItem as Record<string, unknown>).presentation);
              if (presCheck.success) {
                const legacyId = typeof (lItem as Record<string, unknown>).id === 'string'
                  ? (lItem as Record<string, unknown>).id as string
                  : `style_migrated_${Date.now()}`;
                if (!seenIds.has(legacyId)) {
                  const now = new Date().toISOString();
                  const migrated: SavedTableStyle = {
                    id: legacyId,
                    name: ((lItem as Record<string, unknown>).name as string).trim() || 'Estilo Migrado',
                    presentation: presCheck.data,
                    createdAt: now,
                    updatedAt: now
                  };
                  valid.push(migrated);
                  seenIds.add(legacyId);
                  migratedAny = true;
                }
              }
            }
          }
          if (migratedAny) {
            try {
              window.localStorage.setItem(STORAGE_KEY_SAVED_STYLES, JSON.stringify(valid));
            } catch {
              // Ignore storage write error
            }
          }
        }
      }
    } catch {
      // Falha silenciosa de migração
    }

    return valid;
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
// Aplicação e Materialização Canônica de Paleta na Tabela (Emenda 9, 10 & Closure 6)
// ----------------------------------------------------------------------------

export function applyPaletteToTable(
  table: TableCoreModel,
  palette: CuratedPalette | SavedPalette
): TableCoreModel {
  return {
    ...table,
    presentation: materializePaletteOnPresentation(table.presentation, palette)
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

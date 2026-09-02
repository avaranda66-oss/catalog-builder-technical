// src/translation/font-manager.ts
// Gestor de Fontes e Tipografia Multiscript para Exportação de Catálogo
// Suporta Latin, Cyrillic, Greek, Thai, Han (SC), Japanese, Korean, Devanagari, Arabic RTL e Hebrew RTL.
// Lazy loading de Webfonts e validação de prontidão antes do PDF Export.

import { LanguageRegistry } from './language.registry';
import { ScriptType } from './types';

export interface ScriptFontConfig {
  script: ScriptType;
  fontFamily: string;
  googleFontFamily?: string;
  cssUrl?: string;
}

const SCRIPT_FONT_MAP: Record<ScriptType, ScriptFontConfig> = {
  Latin: {
    script: 'Latin',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    googleFontFamily: 'Inter:wght@400;500;600;700;800'
  },
  Cyrillic: {
    script: 'Cyrillic',
    fontFamily: "'Inter', 'Roboto', 'Noto Sans', sans-serif",
    googleFontFamily: 'Roboto:wght@400;500;700'
  },
  Greek: {
    script: 'Greek',
    fontFamily: "'Inter', 'Noto Sans Greek', sans-serif",
    googleFontFamily: 'Noto+Sans+Greek:wght@400;600;700'
  },
  Thai: {
    script: 'Thai',
    fontFamily: "'Noto Sans Thai', 'Sarabun', 'Prompt', sans-serif",
    googleFontFamily: 'Noto+Sans+Thai:wght@400;500;600;700',
    cssUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&display=swap'
  },
  Han: {
    script: 'Han',
    fontFamily: "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    googleFontFamily: 'Noto+Sans+SC:wght@400;500;700',
    cssUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap'
  },
  Japanese: {
    script: 'Japanese',
    fontFamily: "'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif",
    googleFontFamily: 'Noto+Sans+JP:wght@400;500;700',
    cssUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap'
  },
  Korean: {
    script: 'Korean',
    fontFamily: "'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif",
    googleFontFamily: 'Noto+Sans+KR:wght@400;500;700',
    cssUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap'
  },
  Devanagari: {
    script: 'Devanagari',
    fontFamily: "'Noto Sans Devanagari', sans-serif",
    googleFontFamily: 'Noto+Sans+Devanagari:wght@400;500;700',
    cssUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;700&display=swap'
  },
  Arabic: {
    script: 'Arabic',
    fontFamily: "'Noto Sans Arabic', 'Cairo', 'Tahoma', sans-serif",
    googleFontFamily: 'Noto+Sans+Arabic:wght@400;500;600;700',
    cssUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap'
  },
  Hebrew: {
    script: 'Hebrew',
    fontFamily: "'Noto Sans Hebrew', 'Arial Hebrew', sans-serif",
    googleFontFamily: 'Noto+Sans+Hebrew:wght@400;500;700',
    cssUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;500;700&display=swap'
  }
};

const loadedFontUrls = new Set<string>();

export class FontManager {
  /**
   * Obtém a família de fontes CSS apropriada para um determinado BCP-47 locale.
   */
  static getFontFamilyForLocale(locale: string): string {
    const lang = LanguageRegistry.getByCode(locale);
    const script = lang?.script || 'Latin';
    return SCRIPT_FONT_MAP[script]?.fontFamily || SCRIPT_FONT_MAP.Latin.fontFamily;
  }

  /**
   * Retorna a direção de leitura do texto (ltr ou rtl).
   */
  static getDirectionForLocale(locale: string): 'ltr' | 'rtl' {
    const lang = LanguageRegistry.getByCode(locale);
    return lang?.direction || 'ltr';
  }

  /**
   * Garante que a webfont do script esteja carregada no DOM do navegador antes da renderização e exportação PDF.
   */
  static async ensureFontsLoadedForLocale(locale: string): Promise<boolean> {
    if (typeof document === 'undefined') return true;

    const lang = LanguageRegistry.getByCode(locale);
    const script = lang?.script || 'Latin';
    const fontConfig = SCRIPT_FONT_MAP[script];

    if (fontConfig?.cssUrl && !loadedFontUrls.has(fontConfig.cssUrl)) {
      try {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = fontConfig.cssUrl;
        document.head.appendChild(link);
        loadedFontUrls.add(fontConfig.cssUrl);
      } catch {
        // Ignora silenciosamente falha de injeção em ambientes restritos
      }
    }

    if (typeof document.fonts !== 'undefined' && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // Prossegue mesmo se document.fonts.ready falhar
      }
    }

    return true;
  }
}

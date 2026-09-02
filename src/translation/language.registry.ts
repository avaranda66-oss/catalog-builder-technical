import { LanguageDefinition } from './types';

export const INITIAL_LANGUAGES: LanguageDefinition[] = [
  // 1. Américas / Lusofonia & Hispânica
  {
    code: 'pt-BR',
    nativeName: 'Português (Brasil)',
    englishName: 'Portuguese (Brazil)',
    region: 'Américas',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'pt-PT',
    nativeName: 'Português (Portugal)',
    englishName: 'Portuguese (Portugal)',
    region: 'Europa',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'en-US',
    nativeName: 'English (US)',
    englishName: 'English (United States)',
    region: 'Américas',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'en-GB',
    nativeName: 'English (UK)',
    englishName: 'English (United Kingdom)',
    region: 'Europa',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'es-ES',
    nativeName: 'Español (España)',
    englishName: 'Spanish (Spain)',
    region: 'Europa',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'es-MX',
    nativeName: 'Español (México)',
    englishName: 'Spanish (Mexico)',
    region: 'Américas',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },

  // 2. Europa Ocidental & Central
  {
    code: 'fr-FR',
    nativeName: 'Français',
    englishName: 'French (France)',
    region: 'Europa',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'de-DE',
    nativeName: 'Deutsch',
    englishName: 'German (Germany)',
    region: 'Europa',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'it-IT',
    nativeName: 'Italiano',
    englishName: 'Italian',
    region: 'Europa',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'nl-NL',
    nativeName: 'Nederlands',
    englishName: 'Dutch',
    region: 'Europa',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'pl-PL',
    nativeName: 'Polski',
    englishName: 'Polish',
    region: 'Europa',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'cs-CZ',
    nativeName: 'Čeština',
    englishName: 'Czech',
    region: 'Europa',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'ro-RO',
    nativeName: 'Română',
    englishName: 'Romanian',
    region: 'Europa',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'hu-HU',
    nativeName: 'Magyar',
    englishName: 'Hungarian',
    region: 'Europa',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },

  // 3. Países Nórdicos
  {
    code: 'sv-SE',
    nativeName: 'Svenska',
    englishName: 'Swedish',
    region: 'Europa',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'nb-NO',
    nativeName: 'Norsk (Bokmål)',
    englishName: 'Norwegian',
    region: 'Europa',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'da-DK',
    nativeName: 'Dansk',
    englishName: 'Danish',
    region: 'Europa',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'fi-FI',
    nativeName: 'Suomi',
    englishName: 'Finnish',
    region: 'Europa',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },

  // 4. Cirílico & Grego & Turco
  {
    code: 'ru-RU',
    nativeName: 'Русский',
    englishName: 'Russian',
    region: 'Europa / Ásia',
    script: 'Cyrillic',
    direction: 'ltr',
    fontProfile: 'sans-cyrillic',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'uk-UA',
    nativeName: 'Українська',
    englishName: 'Ukrainian',
    region: 'Europa',
    script: 'Cyrillic',
    direction: 'ltr',
    fontProfile: 'sans-cyrillic',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'el-GR',
    nativeName: 'Ελληνικά',
    englishName: 'Greek',
    region: 'Europa',
    script: 'Greek',
    direction: 'ltr',
    fontProfile: 'sans-greek',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'tr-TR',
    nativeName: 'Türkçe',
    englishName: 'Turkish',
    region: 'Europa / Ásia',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },

  // 5. Sudeste Asiático & Sul da Ásia
  {
    code: 'th-TH',
    nativeName: 'ไทย',
    englishName: 'Thai',
    region: 'Ásia',
    script: 'Thai',
    direction: 'ltr',
    fontProfile: 'sans-thai',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'vi-VN',
    nativeName: 'Tiếng Việt',
    englishName: 'Vietnamese',
    region: 'Ásia',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'id-ID',
    nativeName: 'Bahasa Indonesia',
    englishName: 'Indonesian',
    region: 'Ásia',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'ms-MY',
    nativeName: 'Bahasa Melayu',
    englishName: 'Malay',
    region: 'Ásia',
    script: 'Latin',
    direction: 'ltr',
    fontProfile: 'sans-latin',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'hi-IN',
    nativeName: 'हिन्दी',
    englishName: 'Hindi',
    region: 'Ásia',
    script: 'Devanagari',
    direction: 'ltr',
    fontProfile: 'sans-devanagari',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'experimental'
  },

  // 6. Leste Asiático (CJK)
  {
    code: 'zh-CN',
    nativeName: '中文（简体）',
    englishName: 'Chinese (Simplified)',
    region: 'Ásia',
    script: 'Han',
    direction: 'ltr',
    fontProfile: 'sans-cjk',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'zh-TW',
    nativeName: '中文（繁體）',
    englishName: 'Chinese (Traditional)',
    region: 'Ásia',
    script: 'Han',
    direction: 'ltr',
    fontProfile: 'sans-cjk',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'ja-JP',
    nativeName: '日本語',
    englishName: 'Japanese',
    region: 'Ásia',
    script: 'Japanese',
    direction: 'ltr',
    fontProfile: 'sans-cjk',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },
  {
    code: 'ko-KR',
    nativeName: '한국어',
    englishName: 'Korean',
    region: 'Ásia',
    script: 'Korean',
    direction: 'ltr',
    fontProfile: 'sans-korean',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'ready'
  },

  // 7. Oriente Médio (RTL)
  {
    code: 'ar-SA',
    nativeName: 'العربية',
    englishName: 'Arabic (Saudi Arabia)',
    region: 'Oriente Médio',
    script: 'Arabic',
    direction: 'rtl',
    fontProfile: 'sans-arabic',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'experimental'
  },
  {
    code: 'he-IL',
    nativeName: 'עברית',
    englishName: 'Hebrew',
    region: 'Oriente Médio',
    script: 'Hebrew',
    direction: 'rtl',
    fontProfile: 'sans-hebrew',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'experimental'
  },
  {
    code: 'fa-IR',
    nativeName: 'فارسی',
    englishName: 'Persian (Farsi)',
    region: 'Oriente Médio',
    script: 'Arabic',
    direction: 'rtl',
    fontProfile: 'sans-arabic',
    enabled: true,
    translationSupport: 'ready',
    layoutSupport: 'experimental'
  }
];

export class LanguageRegistry {
  private static languages: Map<string, LanguageDefinition> = new Map(
    INITIAL_LANGUAGES.map((l) => [l.code.toLowerCase(), l])
  );

  /**
   * Obtém todos os idiomas habilitados no sistema.
   */
  static getAllLanguages(): LanguageDefinition[] {
    return Array.from(this.languages.values()).filter((l) => l.enabled);
  }

  /**
   * Busca um idioma pelo código BCP-47 exato ou parcial.
   */
  static getLanguageByCode(code: string): LanguageDefinition | undefined {
    if (!code) return undefined;
    const clean = code.trim().toLowerCase();
    const exact = this.languages.get(clean);
    if (exact) return exact;

    // Fallback para código base (ex: 'en' para 'en-US')
    for (const [key, lang] of this.languages.entries()) {
      if (key.startsWith(clean) || key.split('-')[0] === clean.split('-')[0]) {
        return lang;
      }
    }
    return undefined;
  }

  /**
   * Alias de conveniência para getLanguageByCode.
   */
  static getByCode(code: string): LanguageDefinition | undefined {
    return this.getLanguageByCode(code);
  }

  /**
   * Busca dinâmica de idiomas por nome nativo, inglês ou código BCP-47.
   */
  static searchLanguages(query: string): LanguageDefinition[] {
    if (!query || !query.trim()) {
      return this.getAllLanguages();
    }
    const q = query.trim().toLowerCase();
    return this.getAllLanguages().filter(
      (l) =>
        l.code.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.englishName.toLowerCase().includes(q) ||
        (l.region && l.region.toLowerCase().includes(q))
    );
  }

  /**
   * Registra um novo idioma comercial dinamicamente em runtime.
   */
  static registerLanguage(definition: LanguageDefinition): void {
    this.languages.set(definition.code.toLowerCase(), definition);
  }
}

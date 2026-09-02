import { TranslationError } from './types';

export interface ProtectedTokenExtraction {
  maskedText: string;
  tokenMap: Map<string, string>; // placeholder -> originalToken
}

export class TechnicalTokenProtector {
  // Regex determinísticos ordenados do mais específico para o mais genérico
  private static readonly TOKEN_PATTERNS: RegExp[] = [
    // 1. Modelos específicos e marcas registradas
    /\b(PRESYS|ISOPLAN|TA-[\w.-]+|TT-[\w.-]+|PSV-[\w.-]+|T-[\w.-]+|PC-[\w.-]+|LC-[\w.-]+|PCON-[\w.-]+|Additel|Fluke)\b/gi,

    // 2. Normas e certificações industriais
    /\b(ISO\/IEC\s*17025|ISO\s*9001|IP6[5-8]|NEMA\s*\w+|HART\s*\d*|Modbus(\s*RTU|\s*TCP)?|Profibus|FOUNDATION\s*Fieldbus|Ethernet|USB|RS-?485|RS-?232|Bluetooth|Wi-?Fi)\b/gi,

    // 3a. Medições com unidades metrológicas multi-caractere (case-insensitive: bar, psi, kPa, Vdc, etc.)
    /([+-]?\d+(?:[.,]\d+)?\s*(?:°C|°F|bar|mbar|psi|kPa|MPa|Pa|mA|µA|uA|mV|Vcc|Vca|Vac|Vdc|Hz|kHz|MHz|% FS|% FE|FS|ppm|Ω|kΩ|MΩ))\b/gi,

    // 3b. Medições com unidades de caractere único (case-sensitive estrito: A, V, W, K — evita colisão com a preposição linguística 'a')
    /([+-]?\d+(?:[.,]\d+)?\s*(?:[AVWK]))\b/g,

    // 4. Incertezas e exatidão (ex: ±0.075% FS, ±0.1 °C, ±0.05 °C)
    /(±\s*\d+(?:[.,]\d+)?\s*(?:% FS|% FE|%|°C|°F|K|bar|psi|ppm|mA|mV|V)?)/gi,

    // 5. Conexões de processo e roscas padronizadas (ex: 1/2" NPT, 1/4" BSP, M20x1.5)
    /(\b\d+\/\d+["”]?\s*(?:NPT|BSP|BSPT|GAS|UNF|G\d*)\b)/gi,
    /(\bM\d+x\d+(?:[.,]\d+)?\b)/gi,

    // 6. Números isolados ou com sinal em faixas metrológicas (ex: 0, -0.9, +10)
    /(?:^|(?<=\s))[+-]?\d+(?:[.,]\d+)?(?=\s|$|[.,;:!])/g
  ];

  /**
   * Determina se um valor de célula técnica é misto (linguagem natural + números/unidades),
   * como "0 a 70 bar", "-0.9 a 40 bar", "sob encomenda", etc.
   * Valores puramente simbólicos (■, □, —) ou códigos/números com unidades isoladas (±0.025% FE)
   * são classificados como 'protect'.
   */
  static isMixedValue(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (!trimmed) return false;

    // Símbolos técnicos puros
    if (['■', '□', '●', '○', '—', '-', '•', '*', '**'].includes(trimmed)) {
      return false;
    }

    // Se for pura medição com unidade ou pura incerteza sem conectores de linguagem natural
    // ex: "±0.025% FE", "< 0.003% FE", "24Vdc", "IP67"
    const pureTechnicalOnly = /^(?:±|<|>|<=|>=|~)?\s*[+-]?\d+(?:[.,]\d+)?\s*(?:°C|°F|K|bar|mbar|psi|kPa|MPa|Pa|mA|mV|Vcc|Vca|Vac|Vdc|V|A|W|Hz|kHz|MHz|% FS|% FE|%|FS|ppm|Ω|kΩ|MΩ)?$/i;
    if (pureTechnicalOnly.test(trimmed)) {
      return false;
    }

    // Se contém conectores linguísticos comuns em faixas metrológicas (ex: " a ", " até ", " to ", " à ", " de ")
    const linguisticConnector = /\b(a|até|de|em|com|sem|ou|e|to|from|and|or|with|without|à|au|et|ou|jusqu'à)\b/i;
    if (linguisticConnector.test(trimmed)) {
      return true;
    }

    // Se contém palavras alfabéticas comuns (não unidades ou códigos padrão)
    const words = trimmed.match(/[a-zA-ZÀ-ÿ]{2,}/g);
    if (words) {
      const knownTechnicalWords = new Set([
        'HART', 'MODBUS', 'PROFIBUS', 'ETHERNET', 'BLUETOOTH', 'WIFI',
        'NPT', 'BSP', 'BSPT', 'GAS', 'UNF', 'NEMA', 'ISO', 'IEC', 'RBC',
        'FE', 'FS', 'PCON', 'ISOPLAN', 'PRESYS', 'BAR', 'PSI', 'KPA', 'MPA', 'PA',
        'MA', 'MV', 'VDC', 'VAC', 'VCC', 'HZ', 'KHZ', 'MHZ', 'PPM'
      ]);
      const hasNaturalWord = words.some((w) => !knownTechnicalWords.has(w.toUpperCase()));
      if (hasNaturalWord) {
        return true;
      }
    }

    return false;
  }

  /**
   * Alias de conveniência para protectTokens.
   */
  static protect(sourceText: string): { protectedText: string; tokenMap: Map<string, string> } {
    const { maskedText, tokenMap } = this.protectTokens(sourceText);
    return { protectedText: maskedText, tokenMap };
  }

  /**
   * Identifica tokens técnicos protegidos e substitui por marcadores seguros [[TECH_XXX]].
   */
  static protectTokens(sourceText: string): ProtectedTokenExtraction {
    if (!sourceText || typeof sourceText !== 'string') {
      return { maskedText: sourceText, tokenMap: new Map() };
    }

    const tokenMap = new Map<string, string>();
    let masked = sourceText;
    let tokenIndex = 1;

    // Encontra todos os matches únicos
    const matches: Array<{ start: number; end: number; token: string }> = [];

    for (const pattern of this.TOKEN_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(sourceText)) !== null) {
        const token = match[0];
        const start = match.index;
        const end = start + token.length;

        // Evita sobreposição com matches já encontrados
        const overlaps = matches.some((m) => !(end <= m.start || start >= m.end));
        if (!overlaps) {
          matches.push({ start, end, token });
        }
      }
    }

    // Ordena do final para o início para substituição por índice sem deslocamento
    matches.sort((a, b) => b.start - a.start);

    for (const m of matches) {
      const placeholder = `[[TECH_${String(tokenIndex).padStart(3, '0')}]]`;
      tokenIndex++;
      tokenMap.set(placeholder, m.token);

      masked = masked.slice(0, m.start) + placeholder + masked.slice(m.end);
    }

    return { maskedText: masked, tokenMap };
  }

  /**
   * Alias de conveniência para restoreTokens.
   */
  static restore(translatedMaskedText: string, tokenMap: Map<string, string>): string {
    return this.restoreTokens(translatedMaskedText, tokenMap);
  }

  /**
   * Restaura os tokens técnicos originais a partir dos marcadores [[TECH_XXX]] na resposta do provider.
   * Valida que nenhum placeholder foi corrompido, duplicado ou omitido.
   */
  static restoreTokens(translatedMaskedText: string, tokenMap: Map<string, string>): string {
    if (!tokenMap || tokenMap.size === 0) {
      return translatedMaskedText;
    }

    let restored = translatedMaskedText;

    for (const [placeholder, originalToken] of tokenMap.entries()) {
      if (!restored.includes(placeholder)) {
        // Tenta tolerar pequenas variações de espaçamento inseridas por LLM (ex: [[ TECH_001 ]] ou [[TECH_001 ]])
        const looseRegex = new RegExp(`\\[\\s*\\[\\s*${placeholder.slice(2, -2).trim()}\\s*\\]\\s*\\]`, 'g');
        if (looseRegex.test(restored)) {
          restored = restored.replace(looseRegex, originalToken);
          continue;
        }

        console.warn(`[TokenProtector] Placeholder ${placeholder} não encontrado na tradução. Token: "${originalToken}"`);
        throw new TranslationError(
          'TRANSLATION_INVALID_RESPONSE',
          `O provedor corrompeu ou omitiu o token técnico protegido ${placeholder} (${originalToken}).`
        );
      }

      // Substitui o placeholder pelo token literal exato original
      restored = restored.split(placeholder).join(originalToken);
    }

    // Verifica se ainda sobraram placeholders órfãos
    const remainingPlaceholders = restored.match(/\[\[TECH_\d{3}\]\]/g);
    if (remainingPlaceholders && remainingPlaceholders.length > 0) {
      throw new TranslationError(
        'TRANSLATION_INVALID_RESPONSE',
        `Restaram marcadores não resolvidos na tradução: ${remainingPlaceholders.join(', ')}`
      );
    }

    return restored;
  }
}

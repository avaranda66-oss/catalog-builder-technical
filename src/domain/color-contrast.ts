// src/domain/color-contrast.ts
// Helper puro de derivação de contraste de foreground para cores arbitrárias (CORE.E6A.1).
// Calcula contraste determinístico segundo o padrão WCAG 2.1 de luminância relativa.
// Zero dependência de DOM, React ou Tailwind.

export type ReadableForegroundTone = 'light' | 'dark';

/**
 * Converte um canal sRGB (0 a 255) em luminância linear sRGB.
 */
function sRgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Calcula a luminância relativa (0.0 a 1.0) de uma cor RGB conforme WCAG 2.1.
 */
export function calculateRelativeLuminance(r: number, g: number, b: number): number {
  const rLinear = sRgbToLinear(r);
  const gLinear = sRgbToLinear(g);
  const bLinear = sRgbToLinear(b);
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Normaliza e parseia um valor hexadecimal para tupla [r, g, b].
 * Suporta formatos #RGB e #RRGGBB (com ou sem #).
 * Retorna null para valores inválidos.
 */
export function parseHexColor(hex: string): [number, number, number] | null {
  if (typeof hex !== 'string') return null;

  const clean = hex.trim().replace(/^#/, '');

  if (clean.length === 3 && /^[0-9a-fA-F]{3}$/.test(clean)) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }

  if (clean.length === 6 && /^[0-9a-fA-F]{6}$/.test(clean)) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return [r, g, b];
  }

  return null;
}

/**
 * Deriva deterministicamente o tom de foreground mais legível ('light' ou 'dark')
 * para uma dada cor de fundo em formato hexadecimal.
 *
 * Em caso de valor inválido, retorna o fallback histórico seguro 'light'.
 */
export function resolveReadableForegroundTone(hex: string): ReadableForegroundTone {
  const rgb = parseHexColor(hex);
  if (!rgb) {
    return 'light'; // Fallback seguro/histórico
  }

  const bgLuminance = calculateRelativeLuminance(rgb[0], rgb[1], rgb[2]);

  // Contraste com branco (Luminância = 1.0)
  const contrastWithWhite = (1.0 + 0.05) / (bgLuminance + 0.05);

  // Contraste com preto (Luminância = 0.0)
  const contrastWithBlack = (bgLuminance + 0.05) / (0.0 + 0.05);

  return contrastWithBlack > contrastWithWhite ? 'dark' : 'light';
}

/**
 * Calcula a razão de contraste WCAG 2.1 entre duas cores hexadecimais (ex: 14.5 para 14.5:1).
 */
export function calculateContrastRatio(colorA: string, colorB: string): number {
  const rgbA = parseHexColor(colorA);
  const rgbB = parseHexColor(colorB);
  if (!rgbA || !rgbB) return 1.0;

  const lA = calculateRelativeLuminance(rgbA[0], rgbA[1], rgbA[2]);
  const lB = calculateRelativeLuminance(rgbB[0], rgbB[1], rgbB[2]);

  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export type ContrastStatus = 'AAA' | 'AA' | 'AA_LARGE' | 'FAIL';

/**
 * Classifica a conformidade WCAG a partir do ratio de contraste.
 */
export function getContrastStatus(ratio: number): ContrastStatus {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA_LARGE';
  return 'FAIL';
}

/**
 * Retorna a cor de texto (#ffffff ou #0f172a) que garante o contraste máximo seguro contra o fundo fornecido.
 */
export function autoFixContrast(bgHex: string): string {
  const tone = resolveReadableForegroundTone(bgHex);
  return tone === 'dark' ? '#0f172a' : '#ffffff';
}


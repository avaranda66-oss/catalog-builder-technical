// tests/domain/color-contrast.test.ts
// Testes unitários do helper puro de contraste (CORE.E6A.1).

import { describe, it, expect } from 'vitest';
import {
  resolveReadableForegroundTone,
  parseHexColor,
  calculateRelativeLuminance
} from '../../src/domain/color-contrast';

describe('Color Contrast Domain (CORE.E6A.1)', () => {
  it('COLOR-CONTRAST-1: #003366 (Azul Presys Padrão) deriva foreground "light"', () => {
    expect(resolveReadableForegroundTone('#003366')).toBe('light');
  });

  it('COLOR-CONTRAST-2: #FFC20E (Amarelo Presys Calibration) deriva foreground "dark"', () => {
    expect(resolveReadableForegroundTone('#FFC20E')).toBe('dark');
  });

  it('COLOR-CONTRAST-3: #FFFFFF (Branco) deriva foreground "dark"', () => {
    expect(resolveReadableForegroundTone('#FFFFFF')).toBe('dark');
    expect(resolveReadableForegroundTone('#FFF')).toBe('dark');
  });

  it('COLOR-CONTRAST-4: #000000 (Preto) deriva foreground "light"', () => {
    expect(resolveReadableForegroundTone('#000000')).toBe('light');
    expect(resolveReadableForegroundTone('#000')).toBe('light');
  });

  it('COLOR-CONTRAST-EDGE: valores inválidos ou nulos retornam fallback seguro "light"', () => {
    expect(resolveReadableForegroundTone('')).toBe('light');
    expect(resolveReadableForegroundTone('invalid-color')).toBe('light');
    expect(resolveReadableForegroundTone('#XYZ')).toBe('light');
    expect(resolveReadableForegroundTone(null as any)).toBe('light');
    expect(resolveReadableForegroundTone(undefined as any)).toBe('light');
  });

  it('COLOR-CONTRAST-LUMINANCE: cálculo de luminância relativa segue padrão WCAG', () => {
    // Branco = 1.0
    expect(calculateRelativeLuminance(255, 255, 255)).toBeCloseTo(1.0, 3);
    // Preto = 0.0
    expect(calculateRelativeLuminance(0, 0, 0)).toBeCloseTo(0.0, 3);
  });

  it('COLOR-CONTRAST-PARSE: parseHexColor faz parsing correto de #RGB e #RRGGBB', () => {
    expect(parseHexColor('#003366')).toEqual([0, 51, 102]);
    expect(parseHexColor('#FFF')).toEqual([255, 255, 255]);
    expect(parseHexColor('invalid')).toBeNull();
  });
});

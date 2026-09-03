// tests/domain/bottom-header-appearance.test.ts
// Testes unitários para o domínio de aparência do Bottom Header (CORE.E6A).

import { describe, it, expect } from 'vitest';
import {
  BOTTOM_HEADER_PALETTES,
  resolveBottomHeaderPaletteClass,
  resolveBottomHeaderPaletteId,
  resolveBottomHeaderForegroundTone,
  setBottomHeaderPalette
} from '../../src/domain/bottom-header.appearance';

describe('bottom-header.appearance (CORE.E6A)', () => {
  // ==========================================================================
  // 1. BOTTOM-CONTRAST-1: Amarelo Presys -> dark foreground tone
  // ==========================================================================
  it('BOTTOM-CONTRAST-1: paleta presys_yellow deriva foregroundTone dark', () => {
    const block = {
      style: { gradient: 'bg-[#FFC20E]' }
    };
    expect(resolveBottomHeaderPaletteId(block)).toBe('presys_yellow');
    expect(resolveBottomHeaderForegroundTone(block)).toBe('dark');
  });

  // ==========================================================================
  // 2. BOTTOM-CONTRAST-2: Azul Padrão e Paletas Escuras -> light foreground tone
  // ==========================================================================
  it('BOTTOM-CONTRAST-2: paleta padrão presys_navy_solid deriva foregroundTone light', () => {
    const block = {
      style: { gradient: 'bg-[#001f3f]' }
    };
    expect(resolveBottomHeaderPaletteId(block)).toBe('presys_navy_solid');
    expect(resolveBottomHeaderForegroundTone(block)).toBe('light');

    // Bloco vazio ou nulo também resolve para default light
    expect(resolveBottomHeaderPaletteClass(null)).toBe('bg-[#001f3f]');
    expect(resolveBottomHeaderForegroundTone(null)).toBe('light');
  });

  // ==========================================================================
  // 3. BOTTOM-CONTRAST-3: Todas as 9 paletas canônicas possuem foregroundTone definido
  // ==========================================================================
  it('BOTTOM-CONTRAST-3: todas as 9 paletas canônicas possuem foregroundTone válido', () => {
    expect(BOTTOM_HEADER_PALETTES.length).toBe(9);
    for (const pal of BOTTOM_HEADER_PALETTES) {
      expect(['light', 'dark']).toContain(pal.foregroundTone);
      expect(pal.className).toBeDefined();
      expect(pal.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  // ==========================================================================
  // 4. BOTTOM-CONTRAST-4: legacy_custom preserva comportamento histórico light
  // ==========================================================================
  it('BOTTOM-CONTRAST-4: legacy_custom gradiente arbitrário deriva foregroundTone light', () => {
    const block = {
      style: { gradient: 'bg-gradient-to-r from-red-500 to-purple-500' }
    };
    expect(resolveBottomHeaderPaletteId(block)).toBe('legacy_custom');
    expect(resolveBottomHeaderForegroundTone(block)).toBe('light');
  });

  // ==========================================================================
  // 5. BOTTOM-PALETTE-PATCH: setBottomHeaderPalette escreve style.gradient e limpa customData
  // ==========================================================================
  it('BOTTOM-PALETTE-PATCH: nova seleção escreve style.gradient e remove customData.gradient', () => {
    const legacyBlock = {
      style: { border: '1px solid black' },
      customData: { gradient: 'bg-legacy-grad', phone: '+55 11 9999' }
    };

    const patch = setBottomHeaderPalette(legacyBlock, 'presys_industrial');

    expect(patch.style.gradient).toBe('bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900');
    expect(patch.style.border).toBe('1px solid black');
    expect(patch.customData).toBeDefined();
    expect(patch.customData!.gradient).toBeUndefined();
    expect(patch.customData!.phone).toBe('+55 11 9999');
  });
});

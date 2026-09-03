// tests/domain/hero-banner-appearance.test.ts
// Testes unitários para o contrato de domínio de aparência e contraste do Hero Banner (CORE.E5B / CORE.E5B.1).

import { describe, it, expect } from 'vitest';
import {
  HERO_PALETTES,
  resolveHeroPaletteClass,
  resolveHeroPaletteId,
  resolveHeroForegroundTone,
  setHeroPalette
} from '../../src/domain/hero-banner.appearance';
import { ElementCapabilityRegistry } from '../../src/domain/capabilities/element-capability.registry';
import { CAPABILITY_IDS } from '../../src/domain/capabilities/capability.ids';

describe('Hero Banner Appearance Domain Engine (CORE.E5B / CORE.E5B.1)', () => {
  it('HERO-PALETTE-1: Hero sem style.gradient mantém aparência default histórica', () => {
    expect(resolveHeroPaletteClass(null)).toBe('bg-[#001f3f]');
    expect(resolveHeroPaletteClass({})).toBe('bg-[#001f3f]');
    expect(resolveHeroPaletteId({})).toBe('presys_navy_solid');
  });

  it('HERO-PALETTE-2: setHeroPalette define style.gradient com a classe mapeada', () => {
    const patch = setHeroPalette({}, 'presys_industrial');
    expect(patch.style.gradient).toBe('bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900');

    const blockAfter = { style: patch.style };
    expect(resolveHeroPaletteId(blockAfter)).toBe('presys_industrial');
    expect(resolveHeroPaletteClass(blockAfter)).toBe(
      'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900'
    );
  });

  it('HERO-PALETTE-3: setHeroPalette remove customData.gradient legado conflitante', () => {
    const legacyBlock = {
      style: { gradient: 'bg-[#001f3f]' },
      customData: { gradient: 'bg-legacy-test', extraProp: 123 }
    };

    const patch = setHeroPalette(legacyBlock, 'ruby');
    expect(patch.style.gradient).toBe('bg-gradient-to-br from-slate-900 via-rose-950 to-slate-900');
    expect(patch.customData).toBeDefined();
    expect(patch.customData?.gradient).toBeUndefined();
    expect(patch.customData?.extraProp).toBe(123);
  });

  it('HERO-PALETTE-4: legacy unknown gradient é preservado na leitura como legacy_custom', () => {
    const unknownBlock = {
      style: { gradient: 'bg-purple-900 via-pink-800' }
    };

    expect(resolveHeroPaletteClass(unknownBlock)).toBe('bg-purple-900 via-pink-800');
    expect(resolveHeroPaletteId(unknownBlock)).toBe('legacy_custom');

    // Fallback legado em customData quando style está vazio
    const legacyCustomDataBlock = {
      customData: { gradient: 'bg-custom-legacy-orange' }
    };
    expect(resolveHeroPaletteClass(legacyCustomDataBlock)).toBe('bg-custom-legacy-orange');
    expect(resolveHeroPaletteId(legacyCustomDataBlock)).toBe('legacy_custom');
  });

  it('HERO-CAP-PALETTE-1: Registry APPEARANCE_GRADIENT options equivalem aos HeroPalette IDs canônicos', () => {
    const heroDef = ElementCapabilityRegistry.hero_banner;
    const gradientCap = heroDef.capabilities.find(
      (c) => c.id === CAPABILITY_IDS.APPEARANCE_GRADIENT
    );

    expect(gradientCap).toBeDefined();
    expect(gradientCap?.valueKind).toBe('enum');
    expect(gradientCap?.constraints?.options).toBeDefined();

    const registryOptionValues = gradientCap?.constraints?.options?.map((o) => o.value);
    const domainOptionValues = HERO_PALETTES.map((p) => p.id);

    expect(registryOptionValues).toEqual(domainOptionValues);
  });

  // ==========================================================================
  // CORE.E5B.1: CONTRAST CONTRACT
  // ==========================================================================
  it('HERO-CONTRAST-1: presys_yellow deriva foregroundTone dark', () => {
    const yellowBlock = {
      style: { gradient: 'bg-[#FFC20E]' }
    };
    expect(resolveHeroForegroundTone(yellowBlock)).toBe('dark');
  });

  it('HERO-CONTRAST-2: presys_navy_solid deriva foregroundTone light', () => {
    const navyBlock = {
      style: { gradient: 'bg-[#001f3f]' }
    };
    expect(resolveHeroForegroundTone(navyBlock)).toBe('light');

    // Default sem style.gradient também é light
    expect(resolveHeroForegroundTone({})).toBe('light');
  });

  it('HERO-CONTRAST-3: todas as palettes canônicas possuem foregroundTone definido', () => {
    for (const palette of HERO_PALETTES) {
      expect(['light', 'dark']).toContain(palette.foregroundTone);
      if (palette.id === 'presys_yellow') {
        expect(palette.foregroundTone).toBe('dark');
      } else {
        expect(palette.foregroundTone).toBe('light');
      }
    }
  });

  it('HERO-CONTRAST-4: legacy_custom preserva fallback histórico light', () => {
    const legacyUnknown = {
      style: { gradient: 'bg-gradient-to-r from-purple-800 to-indigo-900' }
    };
    expect(resolveHeroForegroundTone(legacyUnknown)).toBe('light');
  });
});

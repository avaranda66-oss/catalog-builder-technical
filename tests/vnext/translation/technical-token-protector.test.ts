import { describe, expect, it } from 'vitest';
import {
  TranslationFoundationError,
  assertProtectedTokenIntegrity,
  protectTechnicalTokens,
  restoreTechnicalTokens,
  technicalProtectionNamespace,
} from '@/vnext/translation';

describe('W5.A technical-token protection', () => {
  it.each([
    'TA-25N',
    'TA-50N',
    'PCON-Y18',
    'PSV-10',
    'PRESYS',
    'ISO/IEC 17025',
    '4–20 mA',
    '±0.05 % FS',
    'RS-485',
    '23 °C',
    '70 bar',
    '100 psi',
    '1/2" NPT',
    '1/4" BSP',
  ])('protects and restores evidence-backed token %s exactly', (token) => {
    const source = `Texto técnico ${token} para aplicação industrial`;
    const protectedValue = protectTechnicalTokens(source);
    expect(protectedValue.protectedText).not.toContain(token);
    const translated = `ES ${protectedValue.protectedText}`;
    expect(restoreTechnicalTokens(translated, protectedValue)).toBe(`ES ${source}`);
  });

  it('preserves the Portuguese connector in "0 a 70 bar" and never confuses lowercase a with Ampere A', () => {
    const protectedValue = protectTechnicalTokens('Faixa de 0 a 70 bar com saída 12 A');
    expect(protectedValue.protectedText).toContain(' a ');
    expect(protectedValue.tokens.map((token) => token.value)).not.toContain('a');
    expect(protectedValue.tokens.map((token) => token.value)).toContain('70 bar');
    expect(protectedValue.tokens.map((token) => token.value)).toContain('12 A');
    expect(restoreTechnicalTokens(protectedValue.protectedText, protectedValue))
      .toBe('Faixa de 0 a 70 bar com saída 12 A');
  });

  it('binds placeholder identity to unitId and runId so equal local ordinals cannot alias', async () => {
    const namespaceA = await technicalProtectionNamespace('unit-a', 'run-a');
    const namespaceB = await technicalProtectionNamespace('unit-a', 'run-b');
    const namespaceC = await technicalProtectionNamespace('unit-b', 'run-a');
    const first = protectTechnicalTokens('TA-25N', namespaceA);
    const second = protectTechnicalTokens('70 bar', namespaceB);
    const third = protectTechnicalTokens('PSV-10', namespaceC);

    expect(first.tokens[0].placeholder).not.toBe(second.tokens[0].placeholder);
    expect(first.tokens[0].placeholder).not.toBe(third.tokens[0].placeholder);
    expect(second.tokens[0].placeholder).not.toBe(third.tokens[0].placeholder);
  });

  it('uses a collision-safe placeholder namespace when source text contains a placeholder-looking literal', () => {
    const source = 'Literal [[VNEXT_TECH_001]] e TA-25N';
    const protectedValue = protectTechnicalTokens(source);
    expect(protectedValue.namespace).toBe('VNEXT_TECH_1');
    expect(restoreTechnicalTokens(protectedValue.protectedText, protectedValue)).toBe(source);
  });

  it('fails closed for missing, extra, modified, and duplicated placeholders', () => {
    const protectedValue = protectTechnicalTokens('TA-25N em 70 bar');
    const placeholders = protectedValue.tokens.map((token) => token.placeholder);
    expect(placeholders.length).toBeGreaterThanOrEqual(2);

    const missing = protectedValue.protectedText.replace(placeholders[0], '');
    expect(() => assertProtectedTokenIntegrity(missing, protectedValue))
      .toThrow(expect.objectContaining<Partial<TranslationFoundationError>>({ code: 'TECHNICAL_TOKEN_MISMATCH' }));

    const extra = `${protectedValue.protectedText} [[${protectedValue.namespace}_999]]`;
    expect(() => assertProtectedTokenIntegrity(extra, protectedValue))
      .toThrow(expect.objectContaining<Partial<TranslationFoundationError>>({ code: 'TECHNICAL_TOKEN_MISMATCH' }));

    const modified = protectedValue.protectedText.replace(placeholders[0], placeholders[0].replace('001', '01'));
    expect(() => assertProtectedTokenIntegrity(modified, protectedValue))
      .toThrow(expect.objectContaining<Partial<TranslationFoundationError>>({ code: 'TECHNICAL_TOKEN_MISMATCH' }));

    const duplicated = `${protectedValue.protectedText} ${placeholders[0]}`;
    expect(() => assertProtectedTokenIntegrity(duplicated, protectedValue))
      .toThrow(expect.objectContaining<Partial<TranslationFoundationError>>({ code: 'TECHNICAL_TOKEN_MISMATCH' }));
  });
});

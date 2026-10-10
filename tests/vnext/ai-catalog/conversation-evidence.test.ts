import { describe, expect, it } from 'vitest';
import { buildConversationEvidence, redactConversationMessage } from '../../../src/vnext/ai-catalog/conversation-evidence';
import { createSyntheticSpecifications } from '../../../src/vnext/ai-catalog/fixture';

describe('catalogue agent complete conversation evidence', () => {
  it('exports exact ordered user and assistant messages plus counts and source hashes', async () => {
    const input = await createSyntheticSpecifications();
    const messages = [
      { role: 'user' as const, message: 'Crie o catálogo comparando equipamentos.', recordedAt: '2026-10-10T03:00:00.000Z' },
      { role: 'assistant' as const, message: 'Proposta preparada. Revise antes de publicar.', recordedAt: '2026-10-10T03:00:01.000Z' },
      { role: 'user' as const, message: 'Comece pela parte elétrica.', recordedAt: '2026-10-10T03:01:00.000Z' },
      { role: 'assistant' as const, message: 'Ajustei a organização proposta.', recordedAt: '2026-10-10T03:01:01.000Z' },
    ];
    const manifest = buildConversationEvidence(input, messages, {
      template: 'comparison-a4-v1', style: 'comparison', sectionOrder: ['electrical', 'thermal'],
    });
    expect(manifest.totals).toEqual({ messages: 4, user: 2, assistant: 2 });
    expect(manifest.messages.map(m => m.message)).toEqual(messages.map(m => m.message));
    expect(manifest.sourceHashes[0].sha256).toBe(input.sources[0].sha256);
    expect(manifest.pdfOutputSha256).toBeNull();
    expect(manifest.explicitlyNotProven).toContain('PDF_OUTPUT_IDENTITY');
  });
  it('redacts provider keys, bearer credentials and typed token values', () => {
    const message = 'api_key=THIS_IS_A_SYNTHETIC_FAKE_KEY Bearer JWT_TEST_FAKE_KEY sk-proj-THIS_IS_A_TEST_FAKE_SECRET_12345 AQ.TEST_FAKE_SECRET_123456789012345678901';
    const result = redactConversationMessage(message);
    expect(result).not.toContain('THIS_IS_A_SYNTHETIC');
    expect(result).not.toContain('JWT_TEST_FAKE_KEY');
    expect(result).not.toContain('TEST_FAKE_SECRET');
    expect(result).toContain('[CREDENCIAL_OCULTA]');
  });
  it('refuses invalid timestamp and excessive transcript length', async () => {
    const input = await createSyntheticSpecifications();
    expect(() => buildConversationEvidence(input,
      [{ role: 'user', message: 'x', recordedAt: 'wrong' }])).toThrow('TRANSCRIPT_INVALID');
    expect(() => buildConversationEvidence(input,
      Array.from({ length: 501 }, () => ({ role: 'user' as const, message: 'x', recordedAt: new Date().toISOString() })))).toThrow('TRANSCRIPT_LIMIT');
  });
});

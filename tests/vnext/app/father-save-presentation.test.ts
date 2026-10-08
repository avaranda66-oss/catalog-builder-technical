import { describe, expect, it } from 'vitest';
import type { SaveProjection } from '@/vnext/persistence';
import { fatherSaveExplanation } from '@/vnext/app/save-presentation';

describe('Father save explanations', () => {
  it.each([
    ['conflict', 'mudou em outro lugar'],
    ['ambiguous', 'não foi confirmado'],
    ['unavailable', 'Confira a conexão'],
    ['unauthorized', 'mesma conta'],
    ['blocked', 'Salvar antes de sair'],
  ] as const)('maps %s to an actionable message without rendering raw backend details', (phase, expected) => {
    const save: SaveProjection = { phase, label: 'Offline / unavailable', dirty: true, canSave: true, message: 'RPC error HTTP 500 VNEXT_UNAUTHORIZED secret internal stack' };
    expect(fatherSaveExplanation(save)).toContain(expected);
    expect(fatherSaveExplanation(save)).not.toMatch(/RPC|HTTP|VNEXT|secret|stack/);
  });
  it('preserves saved and saving state truth', () => {
    expect(fatherSaveExplanation({ phase: 'idle', label: 'Saved', dirty: false, canSave: true })).toBe('Salvo');
    expect(fatherSaveExplanation({ phase: 'saving', label: 'Saving…', dirty: true, canSave: false })).toBe('Salvando…');
  });
  it('keeps the trusted composition guidance so the user can complete the draft', () => {
    expect(fatherSaveExplanation({ phase: 'blocked', label: 'Unsaved changes', dirty: true, canSave: true,
      message: 'Conclua a composição de texto antes de salvar.' })).toBe('Conclua a composição de texto antes de salvar.');
  });
});

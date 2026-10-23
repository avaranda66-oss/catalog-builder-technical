import { describe, expect, it } from 'vitest';
import { createInMemoryArsenalStore } from '../../../src/vnext/arsenal/memory-repository';
import { runArsenalRepositoryContract } from './contract/arsenal-repository.contract';
import { builtinCoverPreset, teamPresetFromDraft, headerBlockDraft } from './contract/fixtures';

runArsenalRepositoryContract('referência em memória', () => {
  const store = createInMemoryArsenalStore({ builtins: [builtinCoverPreset()] });
  return { as: (actor) => store.as(actor), builtinId: builtinCoverPreset().id };
});

describe('arsenal em memória — fronteiras próprias', () => {
  it('recusa embutido inválido, de escopo da equipe ou repetido ao montar', () => {
    expect(() => createInMemoryArsenalStore({ builtins: [teamPresetFromDraft(headerBlockDraft())] })).toThrow('ARSENAL_BUILTIN_INVALID');
    expect(() => createInMemoryArsenalStore({ builtins: [builtinCoverPreset(), builtinCoverPreset()] })).toThrow('ARSENAL_BUILTIN_DUPLICATE');
  });

  it('não deixa quem chama mexer no que está guardado', async () => {
    const store = createInMemoryArsenalStore({ builtins: [builtinCoverPreset()] });
    const repository = store.as({ userId: '11111111-1111-4111-8111-111111111111', role: 'editor' });
    const loaded = await repository.getMany([builtinCoverPreset().id]);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    (loaded.value[0] as { name: string }).name = 'Trocado por fora';
    const again = await repository.getMany([builtinCoverPreset().id]);
    expect(again.ok && again.value[0].name).toBe(builtinCoverPreset().name);
  });
});

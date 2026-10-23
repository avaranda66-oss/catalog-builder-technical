import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createInMemoryArsenalStore,
  webStorageArsenalPersistence,
} from '../../../src/vnext/arsenal/memory-repository';
import { createPresysArsenalBuiltinSource } from '../../../src/vnext/arsenal/builtin-source';
import { runArsenalRepositoryContract } from './contract/arsenal-repository.contract';
import { CONTRACT_ACTORS, builtinCoverPreset, headerBlockDraft, specTableDraft } from './contract/fixtures';

/** A Web Storage stand-in shared by "tabs" (what localStorage is for the father harness). */
function memoryStorage(): Storage & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => { map.delete(key); },
    setItem: (key, value) => { map.set(key, String(value)); },
  };
}

const KEY = 'father-journeys:arsenal';

runArsenalRepositoryContract('memória com persistência em Web Storage (harness local)', () => {
  const storage = memoryStorage();
  // Each person gets a store of their own over the same storage, like two browser tabs.
  const stores = new Map<string, ReturnType<typeof createInMemoryArsenalStore>>();
  return {
    builtinId: builtinCoverPreset().id,
    as: (actor) => {
      let store = stores.get(actor.userId);
      if (!store) {
        store = createInMemoryArsenalStore({ builtins: [builtinCoverPreset()], persistence: webStorageArsenalPersistence(storage, KEY) });
        stores.set(actor.userId, store);
      }
      return store.as(actor);
    },
  };
});

describe('arsenal local que sobrevive a recarregar a página', () => {
  it('o que um guarda, o outro vê depois de recarregar, com autor e contagem de uso', async () => {
    const storage = memoryStorage();
    const open = () => createInMemoryArsenalStore({
      builtins: createPresysArsenalBuiltinSource().list(),
      persistence: webStorageArsenalPersistence(storage, KEY),
    });
    const presetId = randomUUID();
    const created = await open().as(CONTRACT_ACTORS.author).create({ presetId, mutationId: randomUUID(), draft: headerBlockDraft() });
    expect(created.ok).toBe(true);
    await open().as(CONTRACT_ACTORS.otherEditor).recordUse(presetId);
    await open().as(CONTRACT_ACTORS.otherEditor).recordUse('builtin:presys-p1-capa');

    const reloaded = open().as(CONTRACT_ACTORS.admin);
    const listed = await reloaded.list();
    if (!listed.ok) throw new Error(listed.error.code);
    expect(listed.value.find((item) => item.id === presetId)).toMatchObject({ createdBy: CONTRACT_ACTORS.author.userId, useCount: 1 });
    expect(listed.value.find((item) => item.id === 'builtin:presys-p1-capa')?.useCount).toBe(1);
    // Built-ins never go into the storage: only team rows and use counts.
    const saved = JSON.parse(storage.map.get(KEY) ?? '{}') as { presets: Array<{ preset: { id: string } }> };
    expect(saved.presets.map((entry) => entry.preset.id)).toEqual([presetId]);
  });

  it('duas abas: a segunda vê o que a primeira acabou de gravar, sem recarregar', async () => {
    const storage = memoryStorage();
    const tabA = createInMemoryArsenalStore({ persistence: webStorageArsenalPersistence(storage, KEY) }).as(CONTRACT_ACTORS.author);
    const tabB = createInMemoryArsenalStore({ persistence: webStorageArsenalPersistence(storage, KEY) }).as(CONTRACT_ACTORS.author);
    const presetId = randomUUID();
    await tabA.create({ presetId, mutationId: randomUUID(), draft: specTableDraft() });
    const renamed = await tabB.updateCAS({ presetId, expectedRevision: 1, mutationId: randomUUID(), patch: { name: 'Ficha técnica' } });
    expect(renamed.ok && renamed.value.revision).toBe(2);
    const stale = await tabA.updateCAS({ presetId, expectedRevision: 1, mutationId: randomUUID(), patch: { name: 'Outra' } });
    expect(!stale.ok && stale.error.code).toBe('CONFLICT');
  });

  it('dados estragados no armazenamento são ignorados, sem travar o arsenal', async () => {
    const storage = memoryStorage();
    storage.setItem(KEY, '{não é json');
    const store = createInMemoryArsenalStore({ persistence: webStorageArsenalPersistence(storage, KEY) });
    expect((await store.as(CONTRACT_ACTORS.author).list()).ok).toBe(true);
    storage.setItem(KEY, JSON.stringify({
      version: 1,
      presets: [{ preset: { id: 'lixo' }, lastMutationId: randomUUID(), deletedAt: null, deletedBy: null }, null],
      usage: [{ presetId: 'x', useCount: 'muitos' }],
    }));
    const listed = await store.as(CONTRACT_ACTORS.author).list();
    expect(listed.ok && listed.value).toEqual([]);
    storage.setItem(KEY, JSON.stringify({ version: 99, presets: [] }));
    expect((await store.as(CONTRACT_ACTORS.author).list()).ok).toBe(true);
  });

  it('uma falha não grava nada', async () => {
    const storage = memoryStorage();
    const repository = createInMemoryArsenalStore({ persistence: webStorageArsenalPersistence(storage, KEY) }).as(CONTRACT_ACTORS.viewer);
    await repository.create({ presetId: randomUUID(), mutationId: randomUUID(), draft: headerBlockDraft() });
    expect(storage.map.has(KEY)).toBe(false);
  });
});

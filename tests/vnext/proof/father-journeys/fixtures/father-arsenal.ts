import { createPresysArsenalBuiltinSource } from '@/vnext/arsenal/builtin-source';
import {
  createInMemoryArsenalStore,
  webStorageArsenalPersistence,
  type ArsenalMemorySnapshot,
} from '@/vnext/arsenal/memory-repository';
import type { ArsenalRepository } from '@/vnext/arsenal/repository';
import { ArsenalService } from '@/vnext/arsenal/service';

/**
 * Arsenal of the father-journeys harness (Onda 4.5): the same rules as migration 00031 over `localStorage`, which
 * plays the server as it does for catalogs. The key does not depend on the user, so A and B share one team arsenal
 * (author shown, rename/delete only by the author), and the PRESYS models are listed read-only.
 */

export const FATHER_ARSENAL_STORAGE_KEY = 'father-journeys:arsenal';

export interface FatherArsenal {
  readonly repository: ArsenalRepository;
  readonly service: ArsenalService;
  /** Team presets as stored (for the proofs): id, name, category, author and whether deleted. */
  storedTeamPresets(): Array<{ id: string; name: string; category: string; createdBy: string | null; deleted: boolean }>;
}

export function createFatherArsenal(options: {
  readonly userId: string;
  readonly user: 'A' | 'B';
  readonly createId: () => string;
  readonly storage?: Storage;
}): FatherArsenal {
  const storage = options.storage ?? localStorage;
  const store = createInMemoryArsenalStore({
    builtins: createPresysArsenalBuiltinSource().list(),
    persistence: webStorageArsenalPersistence(storage, FATHER_ARSENAL_STORAGE_KEY),
  });
  const actor = { userId: options.userId, role: 'editor' as const, name: `Usuário ${options.user}` };
  const repository = store.as(actor);
  return {
    repository,
    service: new ArsenalService({ repository, createId: options.createId, viewer: actor }),
    storedTeamPresets() {
      const raw = storage.getItem(FATHER_ARSENAL_STORAGE_KEY);
      if (!raw) return [];
      try {
        const snapshot = JSON.parse(raw) as ArsenalMemorySnapshot;
        return snapshot.presets.map(({ preset, deletedAt }) => ({
          id: preset.id, name: preset.name, category: preset.category, createdBy: preset.createdBy, deleted: deletedAt !== null,
        }));
      } catch {
        return [];
      }
    },
  };
}

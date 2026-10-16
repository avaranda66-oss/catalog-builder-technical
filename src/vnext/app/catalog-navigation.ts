import type { SaveProjection, VNextPersistenceRuntime } from '../persistence';
import { fatherSaveExplanation } from './save-presentation';

/** Plain-language reasons shown when "Catálogos" cannot leave the editor yet. */
export const LIBRARY_NAVIGATION_MESSAGES = {
  stillSaving: 'Ainda estamos salvando. Aguarde aparecer “Salvo” e clique em Catálogos de novo.',
  catalogChanged: 'O catálogo aberto mudou enquanto salvávamos. Confira seu trabalho e clique em Catálogos de novo.',
  accessChanged: 'Sua sessão mudou. Entre novamente para continuar; seu trabalho fica protegido neste computador.',
  unexpected: 'Não foi possível salvar antes de sair. Mantenha esta aba aberta e tente novamente.',
} as const;

const NOT_SAVED_PREFIX = 'Seu trabalho ainda não foi salvo, por isso você continua neste catálogo.';

export function librarySaveFailedMessage(save: SaveProjection): string {
  const reason = save.phase === 'idle' || save.phase === 'saving'
    ? 'Tente de novo em alguns segundos.'
    : fatherSaveExplanation(save);
  return `${NOT_SAVED_PREFIX} ${reason}`;
}

export interface LibraryNavigationNoticeStore {
  get(): string | undefined;
  set(message: string | undefined): void;
  subscribe(listener: () => void): () => void;
}

const noticeStores = new WeakMap<VNextPersistenceRuntime, LibraryNavigationNoticeStore>();

/** One notice per editor runtime, read by the editor top bar so a blocked "Catálogos" click is never silent. */
export function libraryNavigationNotice(runtime: VNextPersistenceRuntime): LibraryNavigationNoticeStore {
  const existing = noticeStores.get(runtime);
  if (existing) return existing;
  let message: string | undefined;
  const listeners = new Set<() => void>();
  const store: LibraryNavigationNoticeStore = {
    get: () => message,
    set: (next) => {
      if (next === message) return;
      message = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  noticeStores.set(runtime, store);
  return store;
}

export interface SaveBeforeLibraryNavigationOptions {
  /** Receives the reason whenever the click cannot leave; `undefined` clears an earlier reason. */
  readonly notify?: (message: string | undefined) => void;
  /** Save rounds tried before asking the person to wait (new typing during a save needs another round). */
  readonly maxSaveRounds?: number;
}

const DEFAULT_MAX_SAVE_ROUNDS = 3;
/** Save results that only mean "another save is still settling": wait and look again. */
const SETTLING_SAVE_CODES = new Set(['SAVE_IN_FLIGHT_NEWER_WORK', 'STALE_RESULT']);

/**
 * One Library click flushes the current draft and leaves only after a verified save.
 * Every path that stays in the editor explains why through `notify`.
 */
export function createSaveBeforeLibraryNavigation(
  runtime: VNextPersistenceRuntime,
  navigate: () => void,
  hasAuthority: () => boolean = () => true,
  options: SaveBeforeLibraryNavigationOptions = {}
): () => Promise<boolean> {
  const notify = options.notify ?? ((message: string | undefined) => libraryNavigationNotice(runtime).set(message));
  const maxSaveRounds = Math.max(1, options.maxSaveRounds ?? DEFAULT_MAX_SAVE_ROUNDS);
  let pending: Promise<boolean> | undefined;
  let navigated = false;

  const stay = (message: string): false => {
    notify(message);
    return false;
  };

  return () => {
    if (pending) return pending;
    if (navigated) return Promise.resolve(false);
    if (!hasAuthority()) return Promise.resolve(stay(LIBRARY_NAVIGATION_MESSAGES.accessChanged));
    notify(undefined);
    const before = runtime.workspace.getSnapshot();
    const leave = async (): Promise<boolean> => {
      try {
        for (let round = 0; round < maxSaveRounds; round += 1) {
          if (!hasAuthority()) return stay(LIBRARY_NAVIGATION_MESSAGES.accessChanged);
          const current = runtime.workspace.getSnapshot();
          if (current.binding.openSessionId !== before.binding.openSessionId
            || current.binding.authLineage !== before.binding.authLineage
            || current.activeAuthorityScopeId !== before.activeAuthorityScopeId) {
            return stay(LIBRARY_NAVIGATION_MESSAGES.catalogChanged);
          }
          if (!current.dirty
            && current.save.phase === 'idle'
            && !runtime.saveCoordinator.hasUnresolvedActiveMutation()) {
            navigated = true;
            navigate();
            return true;
          }
          const saved = await runtime.manualSave();
          if (saved.ok) continue;
          if (!SETTLING_SAVE_CODES.has(saved.error.code)) {
            return stay(librarySaveFailedMessage(runtime.workspace.getSnapshot().save));
          }
          await runtime.saveCoordinator.waitForActiveSave();
        }
        return stay(LIBRARY_NAVIGATION_MESSAGES.stillSaving);
      } catch {
        runtime.workspace.setPhase('unavailable', LIBRARY_NAVIGATION_MESSAGES.unexpected);
        return stay(LIBRARY_NAVIGATION_MESSAGES.unexpected);
      }
    };
    pending = leave().finally(() => { pending = undefined; });
    return pending;
  };
}

import type { VNextPersistenceRuntime } from '../persistence';

/** One Library click flushes the current draft and leaves only after a verified save. */
export function createSaveBeforeLibraryNavigation(
  runtime: VNextPersistenceRuntime,
  navigate: () => void,
  hasAuthority: () => boolean = () => true
): () => Promise<boolean> {
  let pending: Promise<boolean> | undefined;
  let navigated = false;
  return () => {
    if (pending) return pending;
    if (navigated || !hasAuthority()) return Promise.resolve(false);
    const before = runtime.workspace.getSnapshot();
    const leave = async (): Promise<boolean> => {
      try {
        if (before.dirty || runtime.saveCoordinator.hasUnresolvedActiveMutation()) {
          const saved = await runtime.manualSave();
          if (!saved.ok) return false;
        }
        const after = runtime.workspace.getSnapshot();
        if (!hasAuthority()
          || after.binding.openSessionId !== before.binding.openSessionId
          || after.binding.authLineage !== before.binding.authLineage
          || after.activeAuthorityScopeId !== before.activeAuthorityScopeId
          || after.dirty
          || after.save.phase !== 'idle'
          || runtime.saveCoordinator.hasUnresolvedActiveMutation()) return false;
        navigated = true;
        navigate();
        return true;
      } catch {
        runtime.workspace.setPhase('unavailable', 'Não foi possível salvar antes de sair. Mantenha esta aba aberta e tente novamente.');
        return false;
      }
    };
    pending = leave().finally(() => { pending = undefined; });
    return pending;
  };
}

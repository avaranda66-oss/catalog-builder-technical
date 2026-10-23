import type { AssetRef } from '../../../domain';
import type { AssetResolutionResult, AssetRuntimeState } from '../../../asset';
import { createArsenalCaptureService } from '../../../arsenal/arsenal-capture';
import { createArsenalInsertionService } from '../../../arsenal/arsenal-insertion';
import type { ArsenalRole, ArsenalViewer } from '../../../arsenal/contracts';
import type { ArsenalRepository } from '../../../arsenal/repository';
import { ArsenalService } from '../../../arsenal/service';
import { arsenalRandomId, type ArsenalEditorRuntime } from './arsenal-runtime';

/**
 * Onda 4.5 — the one place where the editor's arsenal is put together (integration of the slices): the repository
 * (Supabase in the app, the in-memory one in the harness and the tests), the capture and insertion services of the
 * engine slice, the person's role and the image check of the app. Using a preset never calls the AI.
 */
export interface ArsenalEditorRuntimeOptions {
  readonly repository: ArsenalRepository;
  readonly viewer: ArsenalViewer;
  /** Whether an image of a preset can be loaded now; without it every image enters as "Foto a escolher". */
  readonly isAssetAvailable?: (asset: AssetRef) => Promise<boolean>;
  readonly previewAssetUrls?: ReadonlyMap<string, string>;
  readonly createId?: () => string;
  /** An existing service over the same repository (the harness exposes it to the proofs). */
  readonly service?: ArsenalService;
}

export function createArsenalEditorRuntime(options: ArsenalEditorRuntimeOptions): ArsenalEditorRuntime {
  const { repository, viewer } = options;
  const createId = options.createId ?? (() => arsenalRandomId({}));
  return {
    repository,
    insertion: createArsenalInsertionService(),
    capture: createArsenalCaptureService(),
    viewer,
    service: options.service ?? new ArsenalService({ repository, createId, viewer }),
    ...(options.isAssetAvailable ? { isAssetAvailable: options.isAssetAvailable } : {}),
    ...(options.previewAssetUrls ? { previewAssetUrls: options.previewAssetUrls } : {}),
    ...(options.createId ? { createId: options.createId } : {}),
  };
}

/** The person as the arsenal sees them, from the login (`useAuthStore`): only admins and editors use it. */
export function arsenalViewerFromAuth(auth: { readonly userId: string | null; readonly role: string | null }): ArsenalViewer {
  const role: ArsenalRole | null = auth.role === 'admin' || auth.role === 'editor' || auth.role === 'viewer' ? auth.role : null;
  return { userId: auth.userId, role };
}

/**
 * "Can this image of a preset be loaded?" over the app's photo resolver. A photo that loads is installed in the
 * open catalog right away (it shows at once after "Usar"); one that does not becomes the "Foto a escolher" frame.
 * A resolver that throws counts as "não carrega" (never a reference to an image that may not load).
 */
export function arsenalAssetAvailability(
  resolve: (asset: AssetRef) => Promise<AssetResolutionResult>,
  install?: (asset: AssetRef, state: AssetRuntimeState & { readonly status: 'resolved' }) => void,
): (asset: AssetRef) => Promise<boolean> {
  return async (asset) => {
    try {
      const result = await resolve(asset);
      if (!result.ok || result.state.status !== 'resolved') return false;
      try { install?.(asset, result.state); } catch { /* the photo loader installs it later */ }
      return true;
    } catch {
      return false;
    }
  };
}

import React from 'react';
import type { AssetPersistenceBridge, AssetRuntimeState } from '../../asset';
import type { VNextPersistenceRuntime } from '../../persistence';
import { retryAssetLoad } from '../../persistence/asset-loading-coordinator';
import { imageUploadLineage } from '../image-upload';
import './ImageRepairIndicator.css';

export interface ImageRepairIndicatorProps {
  readonly objectId: string;
  readonly state?: AssetRuntimeState;
  /** FR-41: the photo is still being downloaded (the catalog opened before it). */
  readonly loading: boolean;
  /** FR-41: downloads the photo again; absent when the editor has no photo service (a draft only in this tab). */
  readonly onRetry?: () => void;
}

/** The photo's description (or file name) so each "Tentar novamente" says which photo it is. */
function photoLabel(state: AssetRuntimeState): string {
  return (state.asset.alt || state.asset.name || '').trim();
}

function failureText(state: AssetRuntimeState): { title: string; hint: string; canRetry: boolean } | undefined {
  switch (state.status) {
    case 'offline': return { title: 'Sem conexão', hint: 'A foto não carregou.', canRetry: true };
    case 'unavailable': return { title: 'Foto não carregou', hint: 'Pode ter sido a conexão.', canRetry: true };
    case 'integrity-failed': return { title: 'Foto com problema', hint: 'Envie a foto de novo.', canRetry: false };
    default: return undefined;
  }
}

/**
 * Editor-only mark over a photo that is loading or could not be loaded. It never goes to the PDF.
 * "Tentar novamente" downloads the photo again without uploading it; the object stays clickable
 * (the mark itself lets clicks through, only the button takes them). The texts and the button sit in
 * .repair-content, which undoes the page zoom so they keep their size on screen at any zoom.
 * "Carregando foto…" is not announced per photo; PhotoLoadingAnnouncer says it once for all of them.
 */
export function ImageRepairIndicator({ objectId, state, loading, onRetry }: ImageRepairIndicatorProps) {
  if (loading) {
    return (
      <div className="vnext-image-repair-indicator is-loading" data-editor-image-repair={objectId} data-asset-status="loading">
        <div className="repair-content"><span className="repair-title">Carregando foto…</span></div>
      </div>
    );
  }
  if (!state) return null;
  const text = failureText(state);
  if (!text) return null;
  const retry = text.canRetry ? onRetry : undefined;
  const label = photoLabel(state);
  return (
    <div
      className={'vnext-image-repair-indicator' + (retry ? ' has-retry' : '')}
      data-editor-image-repair={objectId}
      data-asset-status={state.status}
    >
      <div className="repair-content">
        <span className="repair-icon" aria-hidden="true">⚠️</span>
        <span className="repair-title">{text.title}</span>
        <span className="repair-hint">{text.hint}</span>
        {retry && (
          <button
            type="button"
            className="repair-retry"
            data-editor-action="retry-image"
            aria-label={label ? `Tentar novamente — foto “${label}”` : undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); retry(); }}
          >
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The mark for one photo of the open catalog: follows the "loading" state of the workspace and wires
 * "Tentar novamente" to a fresh download of the same photo (nothing is uploaded again).
 */
export function PhotoStatusMark({ objectId, assetId, state, runtime, bridge }: {
  readonly objectId: string;
  readonly assetId: string;
  readonly state?: AssetRuntimeState;
  readonly runtime: VNextPersistenceRuntime;
  readonly bridge?: Pick<AssetPersistenceBridge, 'resolve'>;
}) {
  const workspace = runtime.workspace;
  const loading = React.useSyncExternalStore(
    workspace.subscribe,
    () => workspace.getSnapshot().loadingAssetIds.has(assetId),
    () => false
  );
  const retry = bridge
    ? () => {
        void retryAssetLoad({
          workspace,
          resolve: (asset, context) => bridge.resolve(asset, context),
          assetId,
          context: imageUploadLineage(runtime),
        });
      }
    : undefined;
  return <ImageRepairIndicator objectId={objectId} state={state} loading={loading} onRetry={retry} />;
}

export const PHOTOS_LOADING_ANNOUNCEMENT = 'Carregando as fotos do catálogo…';

/**
 * One spoken message while photos of the open catalog are still downloading (instead of one per
 * photo). It is a polite live region that stays mounted, so the change is announced; it has no
 * "status" role, so it never competes with the editor's status messages.
 */
export function PhotoLoadingAnnouncer({ runtime }: { readonly runtime: VNextPersistenceRuntime }) {
  const workspace = runtime.workspace;
  const loading = React.useSyncExternalStore(
    workspace.subscribe,
    () => workspace.getSnapshot().loadingAssetIds.size > 0,
    () => false
  );
  return <p className="sr-only" aria-live="polite" data-photo-loading-announcer="">{loading ? PHOTOS_LOADING_ANNOUNCEMENT : ''}</p>;
}

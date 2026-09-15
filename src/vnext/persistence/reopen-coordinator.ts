import type { AssetRuntimeState } from '../asset/contracts';
import {
  createDocumentSession,
  type ApplicationExecutionDependencies,
} from '../application';
import type { CatalogDocument } from '../domain';
import type {
  CatalogPersistenceEnvelope,
  CatalogRepository,
  PersistenceErrorCode,
} from './contracts';
import { parsePersistenceEnvelope } from './snapshot';
import {
  persistedBindingFromEnvelope,
  type PersistenceWorkspace,
} from './workspace';

export type ReopenResult =
  | { readonly ok: true; readonly envelope: CatalogPersistenceEnvelope }
  | {
      readonly ok: false;
      readonly error: {
        readonly code:
          | PersistenceErrorCode
          | 'UNSAVED_CHANGES'
          | 'STALE_RESULT'
          | 'REQUESTED_ID_MISMATCH';
        readonly message?: string;
      };
    };

export interface ReopenAssetResolutionPayload {
  readonly urls: ReadonlyMap<string, string>;
  readonly states: ReadonlyMap<string, AssetRuntimeState>;
}

export type ReopenAssetResolutionResult =
  | ReadonlyMap<string, string>
  | ReopenAssetResolutionPayload;

function isReopenAssetPayload(
  payload: unknown
): payload is ReopenAssetResolutionPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'urls' in payload &&
    'states' in payload
  );
}

export interface CanonicalReopenCoordinatorOptions {
  readonly workspace: PersistenceWorkspace;
  readonly repository: CatalogRepository;
  readonly applicationDependencies: ApplicationExecutionDependencies;
  readonly createOpenSessionId: () => string;
  readonly resolveAssetUrls?: (
    document: CatalogDocument
  ) => ReopenAssetResolutionResult | Promise<ReopenAssetResolutionResult>;
  readonly canLeave?: () => boolean;
}

export class CanonicalReopenCoordinator {
  constructor(private readonly options: CanonicalReopenCoordinatorOptions) {}

  async open(
    catalogId: string,
    openOptions: { readonly allowDiscardUnsaved?: boolean } = {}
  ): Promise<ReopenResult> {
    const before = this.options.workspace.getSnapshot();
    if (
      !openOptions.allowDiscardUnsaved
      && (before.dirty || (this.options.canLeave && !this.options.canLeave()))
    ) {
      return {
        ok: false,
        error: {
          code: 'UNSAVED_CHANGES',
          message: 'Save or discard local changes before opening another catalog',
        },
      };
    }

    const authLineage = before.binding.authLineage;
    const authorityScopeId = before.activeAuthorityScopeId;
    const result = await this.options.repository.getCatalog(catalogId);
    const afterRead = this.options.workspace.getSnapshot();
    if (
      afterRead.binding.authLineage !== authLineage
      || afterRead.activeAuthorityScopeId !== authorityScopeId
      || afterRead.binding.openSessionId !== before.binding.openSessionId
      || afterRead.session !== before.session
    ) {
      return { ok: false, error: { code: 'STALE_RESULT' } };
    }
    if (
      !openOptions.allowDiscardUnsaved
      && (afterRead.dirty || (this.options.canLeave && !this.options.canLeave()))
    ) {
      return {
        ok: false,
        error: {
          code: 'UNSAVED_CHANGES',
          message: 'Save or discard local changes before opening another catalog',
        },
      };
    }
    if (!result.ok) return { ok: false, error: result.error };

    let envelope: CatalogPersistenceEnvelope;
    try {
      envelope = parsePersistenceEnvelope(result.value);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'INVALID_DOCUMENT',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
    if (envelope.catalogId !== catalogId || envelope.documentSnapshot.id !== catalogId) {
      return { ok: false, error: { code: 'REQUESTED_ID_MISMATCH' } };
    }
    if (envelope.archivedAt !== null) {
      return {
        ok: false,
        error: {
          code: 'ARCHIVED',
          message: 'Catalog is archived',
        },
      };
    }

    const session = createDocumentSession(
      envelope.documentSnapshot,
      this.options.applicationDependencies
    );
    const openSessionId = this.options.createOpenSessionId();
    const binding = persistedBindingFromEnvelope(
      envelope,
      openSessionId,
      authLineage,
      authorityScopeId,
      session.getSnapshot().localSequence
    );
    const resolved = this.options.resolveAssetUrls?.(envelope.documentSnapshot);
    const resolvedPayload =
      (resolved instanceof Promise ? await resolved : resolved)
      ?? new Map<string, string>();

    // Second authority/stale gate AFTER async asset resolution (Point 11)
    const afterResolve = this.options.workspace.getSnapshot();
    if (
      afterResolve.binding.authLineage !== authLineage ||
      afterResolve.activeAuthorityScopeId !== authorityScopeId ||
      afterResolve.binding.openSessionId !== before.binding.openSessionId ||
      afterResolve.session !== before.session
    ) {
      return { ok: false, error: { code: 'STALE_RESULT' } };
    }

    let assetUrls: ReadonlyMap<string, string>;
    let assetRuntimeStates: ReadonlyMap<string, AssetRuntimeState> = new Map();

    if (isReopenAssetPayload(resolvedPayload)) {
      assetUrls = resolvedPayload.urls;
      assetRuntimeStates = resolvedPayload.states;
    } else {
      assetUrls = resolvedPayload as ReadonlyMap<string, string>;
    }

    this.options.workspace.replaceActive(session, binding, assetUrls, assetRuntimeStates);
    return { ok: true, envelope };
  }
}

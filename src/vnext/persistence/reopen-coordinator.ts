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

export interface CanonicalReopenCoordinatorOptions {
  readonly workspace: PersistenceWorkspace;
  readonly repository: CatalogRepository;
  readonly applicationDependencies: ApplicationExecutionDependencies;
  readonly createOpenSessionId: () => string;
  readonly resolveAssetUrls?: (document: CatalogDocument) => ReadonlyMap<string, string>;
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
    const result = await this.options.repository.getCatalog(catalogId);
    const afterRead = this.options.workspace.getSnapshot();
    if (
      afterRead.binding.authLineage !== authLineage
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

    const session = createDocumentSession(
      envelope.documentSnapshot,
      this.options.applicationDependencies
    );
    const openSessionId = this.options.createOpenSessionId();
    const binding = persistedBindingFromEnvelope(
      envelope,
      openSessionId,
      authLineage,
      session.getSnapshot().localSequence
    );
    const assetUrls =
      this.options.resolveAssetUrls?.(envelope.documentSnapshot)
      ?? new Map<string, string>();
    this.options.workspace.replaceActive(session, binding, assetUrls);
    return { ok: true, envelope };
  }
}

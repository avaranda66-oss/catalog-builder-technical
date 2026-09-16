import { CatalogCloneService, type DocumentSession } from '../application';
import type { CatalogDocument } from '../domain';
import type { SessionRecoveryManager } from '../recovery/session-manager';
import { PreparedCatalogCreateCoordinator } from './create-coordinator';
import { canonicalDocumentEquivalence } from './equivalence';
import type { CanonicalReopenCoordinator } from './reopen-coordinator';
import type { PersistenceWorkspace } from './workspace';

export type ConflictResolutionFailureCode =
  | 'NOT_IN_CONFLICT'
  | 'STALE_RESULT'
  | 'LOCAL_PROTECTION_UNAVAILABLE'
  | 'REMOTE_DIVERGENCE'
  | 'INVALID_DOCUMENT'
  | 'UNSUPPORTED_VERSION'
  | 'UNAUTHORIZED'
  | 'ARCHIVED'
  | 'NOT_FOUND'
  | 'OFFLINE'
  | 'REMOTE_FAILURE'
  | 'AMBIGUOUS_COMMIT_OUTCOME'
  | 'ENVELOPE_MISMATCH'
  | 'CONFLICT';

export type ConflictResolutionResult =
  | { readonly ok: true; readonly catalogId: string; readonly kind: 'latest' | 'copy' }
  | {
      readonly ok: false;
      readonly error: { readonly code: ConflictResolutionFailureCode; readonly message?: string };
    };

interface ConflictGuard {
  readonly session: DocumentSession;
  readonly catalogId: string;
  readonly openSessionId: string;
  readonly authLineage: string;
  readonly authorityScopeId: string;
  readonly remoteRevision: number;
  readonly localSequence: number;
  readonly equivalence: string;
  readonly document: CatalogDocument;
}

export interface ConflictResolutionCoordinatorOptions {
  readonly workspace: PersistenceWorkspace;
  readonly reopenCoordinator: CanonicalReopenCoordinator;
  readonly createCoordinator: PreparedCatalogCreateCoordinator;
  readonly cloneService: CatalogCloneService;
  readonly recoveryManager?: SessionRecoveryManager;
}

function failure(
  code: ConflictResolutionFailureCode,
  message?: string
): ConflictResolutionResult {
  return { ok: false, error: { code, ...(message ? { message } : {}) } };
}

export class ConflictResolutionCoordinator {
  constructor(private readonly options: ConflictResolutionCoordinatorOptions) {}

  private capture(): ConflictGuard | undefined {
    const snapshot = this.options.workspace.getSnapshot();
    const binding = snapshot.binding;
    if (binding.kind !== 'PERSISTED' || snapshot.save.phase !== 'conflict') return undefined;
    const sessionSnapshot = snapshot.session.getSnapshot();
    return {
      session: snapshot.session,
      catalogId: binding.catalogId,
      openSessionId: binding.openSessionId,
      authLineage: binding.authLineage,
      authorityScopeId: snapshot.activeAuthorityScopeId,
      remoteRevision: binding.remoteRevision,
      localSequence: sessionSnapshot.localSequence,
      equivalence: canonicalDocumentEquivalence(sessionSnapshot.document),
      document: sessionSnapshot.document,
    };
  }

  private isCurrent(expected: ConflictGuard): boolean {
    const current = this.capture();
    return Boolean(
      current
      && current.session === expected.session
      && current.catalogId === expected.catalogId
      && current.openSessionId === expected.openSessionId
      && current.authLineage === expected.authLineage
      && current.authorityScopeId === expected.authorityScopeId
      && current.remoteRevision === expected.remoteRevision
      && current.localSequence === expected.localSequence
      && current.equivalence === expected.equivalence
    );
  }

  private async protectLocal(expected: ConflictGuard): Promise<ConflictResolutionResult | undefined> {
    if (!this.options.recoveryManager) return undefined;
    try {
      await this.options.recoveryManager.flush();
    } catch (error) {
      return failure(
        'LOCAL_PROTECTION_UNAVAILABLE',
        error instanceof Error ? error.message : 'Proteção local indisponível.'
      );
    }
    if (!this.isCurrent(expected)) return failure('STALE_RESULT');
    const snapshot = this.options.workspace.getSnapshot();
    if (snapshot.localProtection !== 'available') {
      return failure(
        'LOCAL_PROTECTION_UNAVAILABLE',
        snapshot.localProtectionMessage ?? 'Proteção local indisponível.'
      );
    }
    return undefined;
  }

  async openLatest(): Promise<ConflictResolutionResult> {
    const guard = this.capture();
    if (!guard) return failure('NOT_IN_CONFLICT');
    const protectionFailure = await this.protectLocal(guard);
    if (protectionFailure) return protectionFailure;
    if (!this.isCurrent(guard)) return failure('STALE_RESULT');

    const opened = await this.options.reopenCoordinator.open(
      guard.catalogId,
      { allowDiscardUnsaved: true }
    );
    if (!opened.ok) {
      return failure(opened.error.code as ConflictResolutionFailureCode, opened.error.message);
    }
    return { ok: true, catalogId: guard.catalogId, kind: 'latest' };
  }

  async saveAsCopy(): Promise<ConflictResolutionResult> {
    const guard = this.capture();
    if (!guard) return failure('NOT_IN_CONFLICT');
    const protectionFailure = await this.protectLocal(guard);
    if (protectionFailure) return protectionFailure;
    if (!this.isCurrent(guard)) return failure('STALE_RESULT');

    let clone: CatalogDocument;
    try {
      clone = this.options.cloneService.clone(guard.document, {
        title: `Cópia de ${guard.document.title}`,
      });
    } catch (error) {
      return failure('INVALID_DOCUMENT', error instanceof Error ? error.message : String(error));
    }
    const created = await this.options.createCoordinator.create(clone, {
      originKind: 'duplicate',
      originId: guard.catalogId,
      originRevision: guard.remoteRevision,
    });
    if (!created.ok) {
      return failure(created.error.code as ConflictResolutionFailureCode, created.error.message);
    }
    if (!this.isCurrent(guard)) return failure('STALE_RESULT');

    const opened = await this.options.reopenCoordinator.open(
      created.value.catalogId,
      { allowDiscardUnsaved: true }
    );
    if (!opened.ok) {
      return failure(opened.error.code as ConflictResolutionFailureCode, opened.error.message);
    }
    return { ok: true, catalogId: created.value.catalogId, kind: 'copy' };
  }
}

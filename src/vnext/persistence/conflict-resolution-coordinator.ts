import { CatalogCloneService, type DocumentSession } from '../application';
import type { CatalogDocument } from '../domain';
import type { SessionRecoveryManager } from '../recovery/session-manager';
import { PreparedCatalogCreateCoordinator } from './create-coordinator';
import { canonicalDocumentEquivalence } from './equivalence';
import type { CanonicalReopenCoordinator } from './reopen-coordinator';
import type { PersistenceWorkspace } from './workspace';

export type ConflictResolutionFailureCode =
  | 'NOT_IN_CONFLICT'
  | 'RESOLUTION_IN_PROGRESS'
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

export type ConflictResolutionState =
  | 'idle'
  | 'resolving-open-latest'
  | 'resolving-save-as-copy';

type ConflictResolutionKind = 'open-latest' | 'save-as-copy';

interface ActiveResolution {
  readonly kind: ConflictResolutionKind;
  readonly promise: Promise<ConflictResolutionResult>;
}

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
  private readonly listeners = new Set<() => void>();
  private activeResolution: ActiveResolution | undefined;

  constructor(private readonly options: ConflictResolutionCoordinatorOptions) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): ConflictResolutionState => {
    if (this.activeResolution?.kind === 'open-latest') return 'resolving-open-latest';
    if (this.activeResolution?.kind === 'save-as-copy') return 'resolving-save-as-copy';
    return 'idle';
  };

  private publish(): void {
    for (const listener of this.listeners) listener();
  }

  private runExclusive(
    kind: ConflictResolutionKind,
    operation: () => Promise<ConflictResolutionResult>
  ): Promise<ConflictResolutionResult> {
    if (this.activeResolution) {
      if (this.activeResolution.kind === kind) return this.activeResolution.promise;
      return Promise.resolve(failure(
        'RESOLUTION_IN_PROGRESS',
        'Outra escolha de conflito já está sendo concluída.'
      ));
    }

    const execution = operation();
    this.activeResolution = { kind, promise: execution };
    this.publish();
    const clear = () => {
      if (this.activeResolution?.promise !== execution) return;
      this.activeResolution = undefined;
      this.publish();
    };
    void execution.then(clear, clear);
    return execution;
  }

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

  private async openLatestOnce(): Promise<ConflictResolutionResult> {
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

  openLatest(): Promise<ConflictResolutionResult> {
    return this.runExclusive('open-latest', () => this.openLatestOnce());
  }

  private async saveAsCopyOnce(): Promise<ConflictResolutionResult> {
    const guard = this.capture();
    if (!guard) return failure('NOT_IN_CONFLICT');
    const protectionFailure = await this.protectLocal(guard);
    if (protectionFailure) return protectionFailure;
    if (!this.isCurrent(guard)) return failure('STALE_RESULT');

    const continued = await this.options.createCoordinator.continuePending();
    if (continued) {
      if (!continued.ok) {
        return failure(continued.error.code as ConflictResolutionFailureCode, continued.error.message);
      }
      if (!this.isCurrent(guard)) return failure('STALE_RESULT');
      const openedPending = await this.options.reopenCoordinator.open(
        continued.value.catalogId,
        { allowDiscardUnsaved: true }
      );
      if (!openedPending.ok) {
        return failure(openedPending.error.code as ConflictResolutionFailureCode, openedPending.error.message);
      }
      return { ok: true, catalogId: continued.value.catalogId, kind: 'copy' };
    }

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

  saveAsCopy(): Promise<ConflictResolutionResult> {
    return this.runExclusive('save-as-copy', () => this.saveAsCopyOnce());
  }
}

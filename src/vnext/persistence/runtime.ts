import type { ApplicationExecutionDependencies, DocumentSession } from '../application';
import type { CatalogDocument } from '../domain';
import {
  RecoveryCoordinator,
  SessionRecoveryManager,
  type RecoveryRepository,
  type RecoverySchedulerClock,
} from '../recovery';
import type { CatalogPersistenceEnvelope, CatalogRepository } from './contracts';
import { CanonicalReopenCoordinator } from './reopen-coordinator';
import { SaveCoordinator } from './save-coordinator';
import { parsePersistenceEnvelope } from './snapshot';
import {
  PersistenceWorkspace,
  createUnboundPersistenceBinding,
  persistedBindingFromEnvelope,
  type AuthoringBarrier,
} from './workspace';

export interface VNextPersistenceRuntimeOptions {
  readonly session: DocumentSession;
  readonly repository: CatalogRepository;
  readonly applicationDependencies: ApplicationExecutionDependencies;
  readonly createMutationId: () => string;
  readonly createOpenSessionId: () => string;
  readonly authLineage: string;
  readonly authorityScopeId?: string;
  readonly recoveryRepository?: RecoveryRepository;
  readonly recoveryClock?: RecoverySchedulerClock;
  readonly recoveryTrailingMs?: number;
  readonly recoveryMaxWaitMs?: number;
  readonly binding?: CatalogPersistenceEnvelope;
  readonly assetUrls?: ReadonlyMap<string, string>;
  readonly resolveAssetUrls?: (document: CatalogDocument) => ReadonlyMap<string, string>;
}

export class VNextPersistenceRuntime {
  readonly workspace: PersistenceWorkspace;
  readonly saveCoordinator: SaveCoordinator;
  readonly reopenCoordinator: CanonicalReopenCoordinator;
  readonly recoveryCoordinator: RecoveryCoordinator | undefined;
  readonly recoveryManager: SessionRecoveryManager | undefined;

  constructor(options: VNextPersistenceRuntimeOptions) {
    const openSessionId = options.createOpenSessionId();
    const authorityScopeId = options.authorityScopeId ?? options.authLineage.split(':')[0];
    const binding = options.binding
      ? persistedBindingFromEnvelope(
          parsePersistenceEnvelope(options.binding),
          openSessionId,
          options.authLineage,
          authorityScopeId,
          options.session.getSnapshot().localSequence
        )
      : createUnboundPersistenceBinding(
          options.session,
          openSessionId,
          options.authLineage,
          authorityScopeId
        );

    this.workspace = new PersistenceWorkspace(
      options.session,
      binding,
      options.assetUrls
    );
    this.recoveryCoordinator = options.recoveryRepository
      ? new RecoveryCoordinator({
          repository: options.recoveryRepository,
          applicationDependencies: options.applicationDependencies,
          createOpenSessionId: options.createOpenSessionId,
        })
      : undefined;
    this.recoveryManager = this.recoveryCoordinator
      ? new SessionRecoveryManager({
          coordinator: this.recoveryCoordinator,
          getSource: () => {
            const snapshot = this.workspace.getSnapshot();
            const { binding: activeBinding } = snapshot;
            const authoringRecoveryOverlay = this.workspace.captureRecoveryOverlay();
            return {
              ownerAuthorityScopeId: activeBinding.authorityScopeId,
              activeAuthorityScopeId: snapshot.activeAuthorityScopeId,
              catalogId: snapshot.session.getSnapshot().document.id,
              openSessionId: activeBinding.openSessionId,
              localEditSequence: snapshot.session.getSnapshot().localSequence,
              documentSnapshot: snapshot.session.getSnapshot().document,
              baseRemoteRevision: activeBinding.kind === 'PERSISTED' ? activeBinding.remoteRevision : 0,
              baseRemoteSnapshot: activeBinding.kind === 'PERSISTED'
                ? activeBinding.acknowledgedSnapshot
                : activeBinding.initialSnapshot,
              dirty: snapshot.dirty,
              ...(authoringRecoveryOverlay
                ? { authoringRecoveryOverlay }
                : {}),
            };
          },
          subscribe: this.workspace.subscribe,
          clock: options.recoveryClock,
          trailingMs: options.recoveryTrailingMs,
          maxWaitMs: options.recoveryMaxWaitMs,
          onProtectionAvailable: () => this.workspace.setLocalProtectionAvailable(),
          onProtectionUnavailable: () => this.workspace.setLocalProtectionUnavailable(),
        })
      : undefined;
    this.saveCoordinator = new SaveCoordinator({
      workspace: this.workspace,
      repository: options.repository,
      createMutationId: options.createMutationId,
      recoveryLifecycle: this.recoveryManager
        ? {
            beforeDispatch: (pending) => this.recoveryManager!.flushPendingMutation(pending),
            afterAcknowledged: (pending, envelope) => this.recoveryManager!.acknowledge(pending, envelope),
          }
        : undefined,
    });
    this.reopenCoordinator = new CanonicalReopenCoordinator({
      workspace: this.workspace,
      repository: options.repository,
      applicationDependencies: options.applicationDependencies,
      createOpenSessionId: options.createOpenSessionId,
      resolveAssetUrls: options.resolveAssetUrls,
      canLeave: () => !this.saveCoordinator.hasUnresolvedActiveMutation(),
    });
    this.recoveryManager?.start();
  }

  updateAuthLineage(authLineage: string): void {
    this.workspace.updateAuthLineage(authLineage);
  }

  updateAuthContext(authLineage: string, authorityScopeId: string): void {
    this.workspace.updateAuthContext(authLineage, authorityScopeId);
  }

  registerAuthoringBarrier(
    openSessionId: string,
    barrier: AuthoringBarrier
  ): () => void {
    return this.workspace.registerAuthoringBarrier(openSessionId, barrier);
  }
}

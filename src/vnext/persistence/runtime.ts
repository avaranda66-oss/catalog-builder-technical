import type { ApplicationExecutionDependencies, DocumentSession } from '../application';
import type { CatalogDocument } from '../domain';
import type { AuthoringRecoveryOverlay } from '../recovery/contracts';
import { RecoveryCoordinator } from '../recovery/coordinator';
import type { RecoveryRepository } from '../recovery/repository';
import type { RecoverySchedulerClock } from '../recovery/scheduler';
import { SessionRecoveryManager } from '../recovery/session-manager';
import { RecoveryStartupCoordinator, type RecoveryStartupCandidate } from '../recovery/startup';
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
  readonly recoveryStartup: RecoveryStartupCoordinator | undefined;
  private recoveredOverlay: { readonly openSessionId: string; readonly overlay: AuthoringRecoveryOverlay } | undefined;
  private readonly resolveAssetUrls: ((document: CatalogDocument) => ReadonlyMap<string, string>) | undefined;

  constructor(options: VNextPersistenceRuntimeOptions) {
    this.resolveAssetUrls = options.resolveAssetUrls;
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
            const authoringRecoveryOverlay = this.workspace.captureRecoveryOverlay()
              ?? this.getRecoveredOverlay(activeBinding.openSessionId);
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
    this.recoveryStartup = this.recoveryCoordinator
      ? new RecoveryStartupCoordinator({
          coordinator: this.recoveryCoordinator,
          repository: options.repository,
          getActiveAuthorityScopeId: () => this.workspace.getSnapshot().activeAuthorityScopeId,
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
    if (this.workspace.getSnapshot().activeAuthorityScopeId !== authorityScopeId) {
      this.recoveredOverlay = undefined;
    }
    this.workspace.updateAuthContext(authLineage, authorityScopeId);
  }

  getRecoveredOverlay(openSessionId: string): AuthoringRecoveryOverlay | undefined {
    return this.recoveredOverlay?.openSessionId === openSessionId
      ? this.recoveredOverlay.overlay
      : undefined;
  }

  consumeRecoveredOverlay(openSessionId: string): void {
    if (this.recoveredOverlay?.openSessionId === openSessionId) this.recoveredOverlay = undefined;
  }

  async recover(candidate: RecoveryStartupCandidate): Promise<boolean> {
    if (!this.recoveryCoordinator || !this.recoveryManager) return false;
    if (
      candidate.inspection.status !== 'VALID'
      || candidate.inspection.record.pendingRemoteMutation
      || candidate.decision.kind !== 'RECOVERABLE_OVER_SAME_REMOTE_BASE'
    ) return false;
    const before = this.workspace.getSnapshot();
    const accepted = await this.recoveryCoordinator.accept(
      candidate.inspection,
      before.activeAuthorityScopeId
    );
    this.recoveredOverlay = accepted.overlay
      ? { openSessionId: accepted.openSessionId, overlay: accepted.overlay }
      : undefined;
    this.workspace.replaceActive(
      accepted.session,
      persistedBindingFromEnvelope(
        candidate.decision.remote,
        accepted.openSessionId,
        before.binding.authLineage,
        before.activeAuthorityScopeId,
        accepted.session.getSnapshot().localSequence
      ),
      this.resolveAssetUrls?.(accepted.session.getSnapshot().document) ?? new Map()
    );
    await this.recoveryManager.flush();
    const cleanup = await this.recoveryCoordinator.deleteIfGeneration(
      candidate.inspection.key,
      candidate.inspection.record.recoveryGeneration
    );
    return cleanup.status === 'DELETED' || cleanup.status === 'NOT_FOUND';
  }

  registerAuthoringBarrier(
    openSessionId: string,
    barrier: AuthoringBarrier
  ): () => void {
    return this.workspace.registerAuthoringBarrier(openSessionId, barrier);
  }
}

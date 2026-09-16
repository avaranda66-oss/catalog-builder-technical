import type { ApplicationExecutionDependencies, DocumentSession } from '../application';
import type { CatalogDocument } from '../domain';
import type { AuthoringRecoveryOverlay } from '../recovery/contracts';
import { RecoveryCoordinator, type AcceptedRecovery } from '../recovery/coordinator';
import type { RecoveryRepository } from '../recovery/repository';
import type { RecoverySchedulerClock } from '../recovery/scheduler';
import { SessionRecoveryManager } from '../recovery/session-manager';
import { RecoveryStartupCoordinator, type RecoveryStartupCandidate } from '../recovery/startup';
import type { AssetRuntimeState } from '../asset/contracts';
import { CatalogCloneService } from '../application';
import { AutosaveCoordinator, type AutosaveClock } from './autosave-coordinator';
import { ConflictResolutionCoordinator } from './conflict-resolution-coordinator';
import { PreparedCatalogCreateCoordinator } from './create-coordinator';
import type { CatalogPersistenceEnvelope, CatalogRepository } from './contracts';
import { CanonicalReopenCoordinator } from './reopen-coordinator';
import { SaveCoordinator } from './save-coordinator';
import { canonicalDocumentEquivalence } from './equivalence';
import { parsePersistenceEnvelope } from './snapshot';
import {
  PersistenceWorkspace,
  createUnboundPersistenceBinding,
  persistedBindingFromEnvelope,
  type AuthoringBarrier,
} from './workspace';

export interface RuntimeAssetResolutionPayload {
  readonly urls: ReadonlyMap<string, string>;
  readonly states: ReadonlyMap<string, AssetRuntimeState>;
}

export type RuntimeAssetResolutionResult =
  | ReadonlyMap<string, string>
  | RuntimeAssetResolutionPayload;

function isRuntimeAssetPayload(payload: unknown): payload is RuntimeAssetResolutionPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'urls' in payload &&
    'states' in payload
  );
}

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
  readonly autosave?: false | {
    readonly debounceMs?: number;
    readonly clock?: AutosaveClock;
  };
  readonly binding?: CatalogPersistenceEnvelope;
  readonly assetUrls?: ReadonlyMap<string, string>;
  readonly resolveAssetUrls?: (
    document: CatalogDocument
  ) => RuntimeAssetResolutionResult | Promise<RuntimeAssetResolutionResult>;
}

interface RecoveryInstallGuard {
  readonly session: DocumentSession;
  readonly authoringBarrier: AuthoringBarrier;
  readonly openSessionId: string;
  readonly authLineage: string;
  readonly authorityScopeId: string;
  readonly remoteRevision: number;
  readonly lastMutationId: string;
  readonly localSequence: number;
  readonly documentEquivalence: string;
}

export class VNextPersistenceRuntime {
  readonly workspace: PersistenceWorkspace;
  readonly saveCoordinator: SaveCoordinator;
  readonly autosaveCoordinator: AutosaveCoordinator | undefined;
  readonly reopenCoordinator: CanonicalReopenCoordinator;
  readonly conflictResolutionCoordinator: ConflictResolutionCoordinator;
  readonly recoveryCoordinator: RecoveryCoordinator | undefined;
  readonly recoveryManager: SessionRecoveryManager | undefined;
  readonly recoveryStartup: RecoveryStartupCoordinator | undefined;
  private recoveredOverlay: { readonly openSessionId: string; readonly overlay: AuthoringRecoveryOverlay } | undefined;
  private readonly resolveAssetUrls:
    | ((document: CatalogDocument) => RuntimeAssetResolutionResult | Promise<RuntimeAssetResolutionResult>)
    | undefined;

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
            afterRejected: (pending) => this.recoveryManager!.reject(pending),
          }
        : undefined,
    });
    this.autosaveCoordinator = options.autosave
      ? new AutosaveCoordinator({
          workspace: this.workspace,
          saveCoordinator: this.saveCoordinator,
          ...(options.autosave.debounceMs === undefined
            ? {}
            : { debounceMs: options.autosave.debounceMs }),
          ...(options.autosave.clock === undefined ? {} : { clock: options.autosave.clock }),
        })
      : undefined;
    this.reopenCoordinator = new CanonicalReopenCoordinator({
      workspace: this.workspace,
      repository: options.repository,
      applicationDependencies: options.applicationDependencies,
      createOpenSessionId: options.createOpenSessionId,
      resolveAssetUrls: options.resolveAssetUrls,
      canLeave: () => !this.saveCoordinator.hasUnresolvedActiveMutation(),
    });
    this.conflictResolutionCoordinator = new ConflictResolutionCoordinator({
      workspace: this.workspace,
      reopenCoordinator: this.reopenCoordinator,
      createCoordinator: new PreparedCatalogCreateCoordinator({
        repository: options.repository,
        createMutationId: options.createMutationId,
        authLineage: () => this.workspace.getSnapshot().binding.authLineage,
        authorityScopeId: () => this.workspace.getSnapshot().activeAuthorityScopeId,
      }),
      cloneService: new CatalogCloneService(options.applicationDependencies.createId),
      ...(this.recoveryManager ? { recoveryManager: this.recoveryManager } : {}),
    });
    this.recoveryManager?.start();
  }

  updateAuthLineage(authLineage: string): void {
    this.workspace.updateAuthLineage(authLineage);
    this.autosaveCoordinator?.resumeAfterAuthorityChange();
  }

  updateAuthContext(authLineage: string, authorityScopeId: string): void {
    if (this.workspace.getSnapshot().activeAuthorityScopeId !== authorityScopeId) {
      this.recoveredOverlay = undefined;
    }
    this.workspace.updateAuthContext(authLineage, authorityScopeId);
    this.autosaveCoordinator?.resumeAfterAuthorityChange();
  }

  getRecoveredOverlay(openSessionId: string): AuthoringRecoveryOverlay | undefined {
    return this.recoveredOverlay?.openSessionId === openSessionId
      ? this.recoveredOverlay.overlay
      : undefined;
  }

  consumeRecoveredOverlay(openSessionId: string): void {
    if (this.recoveredOverlay?.openSessionId === openSessionId) this.recoveredOverlay = undefined;
  }

  private captureRecoveryInstallGuard(
    candidate: RecoveryStartupCandidate
  ): RecoveryInstallGuard | undefined {
    if (
      candidate.inspection.status !== 'VALID'
      || candidate.inspection.record.pendingRemoteMutation
      || candidate.decision.kind !== 'RECOVERABLE_OVER_SAME_REMOTE_BASE'
    ) return undefined;
    const snapshot = this.workspace.getSnapshot();
    const binding = snapshot.binding;
    const sessionSnapshot = snapshot.session.getSnapshot();
    const barrier = this.workspace.getAuthoringBarrier();
    const remote = candidate.decision.remote;
    const remoteEquivalence = canonicalDocumentEquivalence(remote.documentSnapshot);
    const currentEquivalence = canonicalDocumentEquivalence(sessionSnapshot.document);
    if (
      binding.kind !== 'PERSISTED'
      || snapshot.activeAuthorityScopeId !== candidate.inspection.key.authorityScopeId
      || binding.authorityScopeId !== candidate.inspection.key.authorityScopeId
      || binding.catalogId !== candidate.inspection.key.catalogId
      || sessionSnapshot.document.id !== candidate.inspection.key.catalogId
      || remote.catalogId !== candidate.inspection.key.catalogId
      || candidate.inspection.record.baseRemoteRevision !== remote.remoteRevision
      || binding.remoteRevision !== remote.remoteRevision
      || binding.lastMutationId !== remote.lastMutationId
      || binding.acknowledgedEquivalence !== remoteEquivalence
      || currentEquivalence !== remoteEquivalence
      || snapshot.dirty
      || barrier.hasPendingDraft()
      || this.getRecoveredOverlay(binding.openSessionId)
      || snapshot.save.phase !== 'idle'
      || this.saveCoordinator.hasUnresolvedActiveMutation()
    ) return undefined;
    return {
      session: snapshot.session,
      authoringBarrier: barrier,
      openSessionId: binding.openSessionId,
      authLineage: binding.authLineage,
      authorityScopeId: snapshot.activeAuthorityScopeId,
      remoteRevision: binding.remoteRevision,
      lastMutationId: binding.lastMutationId,
      localSequence: sessionSnapshot.localSequence,
      documentEquivalence: currentEquivalence,
    };
  }

  private recoveryInstallGuardIsCurrent(
    candidate: RecoveryStartupCandidate,
    expected: RecoveryInstallGuard
  ): boolean {
    const current = this.captureRecoveryInstallGuard(candidate);
    return Boolean(
      current
      && current.session === expected.session
      && current.authoringBarrier === expected.authoringBarrier
      && current.openSessionId === expected.openSessionId
      && current.authLineage === expected.authLineage
      && current.authorityScopeId === expected.authorityScopeId
      && current.remoteRevision === expected.remoteRevision
      && current.lastMutationId === expected.lastMutationId
      && current.localSequence === expected.localSequence
      && current.documentEquivalence === expected.documentEquivalence
    );
  }

  async recover(candidate: RecoveryStartupCandidate): Promise<boolean> {
    if (!this.recoveryCoordinator || !this.recoveryManager) return false;
    if (
      candidate.inspection.status !== 'VALID'
      || candidate.inspection.record.pendingRemoteMutation
      || candidate.decision.kind !== 'RECOVERABLE_OVER_SAME_REMOTE_BASE'
    ) return false;
    const guard = this.captureRecoveryInstallGuard(candidate);
    if (!guard) return false;
    let accepted: AcceptedRecovery;
    try {
      accepted = await this.recoveryCoordinator.accept(
        candidate.inspection,
        guard.authorityScopeId
      );
    } catch {
      return false;
    }
    if (!this.recoveryInstallGuardIsCurrent(candidate, guard)) return false;
    this.recoveredOverlay = accepted.overlay
      ? { openSessionId: accepted.openSessionId, overlay: accepted.overlay }
      : undefined;
    const resolvedUrls = this.resolveAssetUrls?.(accepted.session.getSnapshot().document);
    const resolvedPayload =
      (resolvedUrls instanceof Promise ? await resolvedUrls : resolvedUrls)
      ?? new Map<string, string>();

    // Recheck guard after async resolution
    if (!this.recoveryInstallGuardIsCurrent(candidate, guard)) return false;

    let assetUrls: ReadonlyMap<string, string>;
    let assetRuntimeStates: ReadonlyMap<string, AssetRuntimeState> = new Map();
    if (isRuntimeAssetPayload(resolvedPayload)) {
      assetUrls = resolvedPayload.urls;
      assetRuntimeStates = resolvedPayload.states;
    } else {
      assetUrls = resolvedPayload;
    }

    this.workspace.replaceActive(
      accepted.session,
      persistedBindingFromEnvelope(
        candidate.decision.remote,
        accepted.openSessionId,
        guard.authLineage,
        guard.authorityScopeId,
        accepted.session.getSnapshot().localSequence
      ),
      assetUrls,
      assetRuntimeStates
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

  manualSave(): Promise<import('./save-coordinator').ManualSaveResult> {
    return this.autosaveCoordinator?.flush() ?? this.saveCoordinator.save();
  }

  retryRemoteSave(): Promise<import('./save-coordinator').ManualSaveResult> {
    return this.autosaveCoordinator?.retryNow() ?? this.saveCoordinator.save();
  }

  async dispose(): Promise<void> {
    this.autosaveCoordinator?.dispose();
    await this.recoveryManager?.close();
  }
}

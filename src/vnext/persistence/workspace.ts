import type { DocumentSession } from '../application';
import type { AssetRuntimeState } from '../asset/contracts';
import type { AuthoringRecoveryOverlay } from '../recovery/contracts';
import type { CatalogPersistenceEnvelope } from './contracts';
import { canonicalDocumentEquivalence } from './equivalence';

export type AuthoringBarrierBlockReason =
  | 'COMPOSITION_ACTIVE'
  | 'INVALID_DRAFT'
  | 'STALE_DRAFT'
  | 'COMMIT_FAILED';

export type AuthoringBarrierResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: AuthoringBarrierBlockReason;
      readonly message: string;
    };

export interface AuthoringBarrier {
  prepareForSave(): AuthoringBarrierResult;
  hasPendingDraft(): boolean;
  captureRecoveryOverlay?(): AuthoringRecoveryOverlay | undefined;
}

const NO_AUTHORING_BARRIER: AuthoringBarrier = {
  prepareForSave: () => ({ ok: true }),
  hasPendingDraft: () => false,
  captureRecoveryOverlay: () => undefined,
};

export type PersistenceBinding =
  | {
      readonly kind: 'UNBOUND';
      readonly openSessionId: string;
      readonly authLineage: string;
      readonly authorityScopeId: string;
      readonly initialEquivalence: string;
      readonly initialSnapshot: CatalogPersistenceEnvelope['documentSnapshot'];
    }
  | {
      readonly kind: 'PERSISTED';
      readonly openSessionId: string;
      readonly authLineage: string;
      readonly authorityScopeId: string;
      readonly catalogId: string;
      readonly remoteRevision: number;
      readonly lastMutationId: string;
      readonly acknowledgedEquivalence: string;
      readonly acknowledgedSnapshot: CatalogPersistenceEnvelope['documentSnapshot'];
      readonly acknowledgedLocalSequence: number;
    };

export type SavePhase =
  | 'idle'
  | 'saving'
  | 'conflict'
  | 'ambiguous'
  | 'unavailable'
  | 'unauthorized'
  | 'blocked';

export interface SaveProjection {
  readonly phase: SavePhase;
  readonly label:
    | 'Save'
    | 'Saving…'
    | 'Saved'
    | 'Unsaved changes'
    | 'Conflict'
    | 'Could not verify save'
    | 'Offline / unavailable';
  readonly dirty: boolean;
  readonly canSave: boolean;
  readonly message?: string;
}

export interface PersistenceWorkspaceSnapshot {
  readonly session: DocumentSession;
  readonly binding: PersistenceBinding;
  readonly assetUrls: ReadonlyMap<string, string>;
  readonly assetRuntimeStates: ReadonlyMap<string, AssetRuntimeState>;
  readonly dirty: boolean;
  readonly save: SaveProjection;
  readonly activeAuthorityScopeId: string;
  readonly localProtection: 'available' | 'unavailable';
  readonly localProtectionMessage?: string;
}

export function createUnboundPersistenceBinding(
  session: DocumentSession,
  openSessionId: string,
  authLineage: string,
  authorityScopeId: string
): PersistenceBinding {
  return {
    kind: 'UNBOUND',
    openSessionId,
    authLineage,
    authorityScopeId,
    initialEquivalence: canonicalDocumentEquivalence(session.getSnapshot().document),
    initialSnapshot: session.getSnapshot().document,
  };
}

export function persistedBindingFromEnvelope(
  envelope: CatalogPersistenceEnvelope,
  openSessionId: string,
  authLineage: string,
  authorityScopeId: string,
  localSequence: number
): PersistenceBinding {
  return {
    kind: 'PERSISTED',
    openSessionId,
    authLineage,
    authorityScopeId,
    catalogId: envelope.catalogId,
    remoteRevision: envelope.remoteRevision,
    lastMutationId: envelope.lastMutationId,
    acknowledgedEquivalence: canonicalDocumentEquivalence(envelope.documentSnapshot),
    acknowledgedSnapshot: envelope.documentSnapshot,
    acknowledgedLocalSequence: localSequence,
  };
}

function projection(
  binding: PersistenceBinding,
  dirty: boolean,
  phase: SavePhase,
  message?: string
): SaveProjection {
  const withMessage = message ? { message } : {};
  if (phase === 'saving') return { phase, label: 'Saving…', dirty, canSave: false, ...withMessage };
  if (phase === 'conflict') return { phase, label: 'Conflict', dirty: true, canSave: false, ...withMessage };
  if (phase === 'ambiguous') return { phase, label: 'Could not verify save', dirty: true, canSave: true, ...withMessage };
  if (phase === 'unavailable' || phase === 'unauthorized') {
    return {
      phase,
      label: 'Offline / unavailable',
      dirty,
      canSave: binding.kind === 'PERSISTED',
      ...withMessage,
    };
  }
  if (phase === 'blocked') return { phase, label: 'Unsaved changes', dirty: true, canSave: true, ...withMessage };
  if (dirty) return { phase: 'idle', label: 'Unsaved changes', dirty: true, canSave: binding.kind === 'PERSISTED' };
  if (binding.kind === 'PERSISTED') return { phase: 'idle', label: 'Saved', dirty: false, canSave: true };
  return { phase: 'idle', label: 'Save', dirty: false, canSave: false };
}

export class PersistenceWorkspace {
  private readonly listeners = new Set<() => void>();
  private barrier: AuthoringBarrier = NO_AUTHORING_BARRIER;
  private phase: SavePhase = 'idle';
  private phaseMessage: string | undefined;
  private blockedSource: 'authoring' | 'non-authoring' | undefined;
  private unsubscribeSession: (() => void) | undefined;
  private session: DocumentSession;
  private binding: PersistenceBinding;
  private activeAuthorityScopeId: string;
  private localProtection: 'available' | 'unavailable' = 'available';
  private localProtectionMessage: string | undefined;
  private assetUrls: ReadonlyMap<string, string>;
  private assetRuntimeStates: ReadonlyMap<string, AssetRuntimeState>;
  private snapshot: PersistenceWorkspaceSnapshot;

  constructor(
    session: DocumentSession,
    binding: PersistenceBinding,
    assetUrls: ReadonlyMap<string, string> = new Map(),
    assetRuntimeStates: ReadonlyMap<string, AssetRuntimeState> = new Map()
  ) {
    this.session = session;
    this.binding = binding;
    this.activeAuthorityScopeId = binding.authorityScopeId;
    this.assetUrls = assetUrls;
    this.assetRuntimeStates = assetRuntimeStates;
    this.snapshot = this.buildSnapshot();
    this.bindSession();
  }

  private bindSession(): void {
    this.unsubscribeSession?.();
    this.unsubscribeSession = this.session.subscribe(() => {
      if (!['saving', 'conflict', 'ambiguous'].includes(this.phase)) {
        this.phase = 'idle';
        this.phaseMessage = undefined;
        this.blockedSource = undefined;
      }
      this.publish();
    });
  }

  private clearPhase(): void {
    this.phase = 'idle';
    this.phaseMessage = undefined;
    this.blockedSource = undefined;
  }

  private computeDirty(): boolean {
    if (this.barrier.hasPendingDraft()) return true;
    const current = canonicalDocumentEquivalence(this.session.getSnapshot().document);
    return this.binding.kind === 'PERSISTED'
      ? current !== this.binding.acknowledgedEquivalence
      : current !== this.binding.initialEquivalence;
  }

  private buildSnapshot(): PersistenceWorkspaceSnapshot {
    const dirty = this.computeDirty();
    return {
      session: this.session,
      binding: this.binding,
      assetUrls: this.assetUrls,
      assetRuntimeStates: this.assetRuntimeStates,
      dirty,
      save: projection(this.binding, dirty, this.phase, this.phaseMessage),
      activeAuthorityScopeId: this.activeAuthorityScopeId,
      localProtection: this.localProtection,
      ...(this.localProtectionMessage ? { localProtectionMessage: this.localProtectionMessage } : {}),
    };
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  getSnapshot = (): PersistenceWorkspaceSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getAuthoringBarrier(): AuthoringBarrier {
    return this.barrier;
  }

  captureRecoveryOverlay(): AuthoringRecoveryOverlay | undefined {
    return this.barrier.captureRecoveryOverlay?.();
  }

  registerAuthoringBarrier(openSessionId: string, barrier: AuthoringBarrier): () => void {
    if (this.binding.openSessionId !== openSessionId) return () => {};
    this.barrier = barrier;
    if (this.blockedSource === 'authoring') this.clearPhase();
    this.publish();
    return () => {
      if (this.barrier !== barrier) return;
      this.barrier = NO_AUTHORING_BARRIER;
      if (this.blockedSource === 'authoring') this.clearPhase();
      this.publish();
    };
  }

  notifyDraftStateChanged(): void {
    if (this.blockedSource === 'authoring') this.clearPhase();
    this.publish();
  }

  setAuthoringBlocked(message: string): void {
    this.phase = 'blocked';
    this.phaseMessage = message;
    this.blockedSource = 'authoring';
    this.publish();
  }

  setPhase(phase: SavePhase, message?: string): void {
    this.phase = phase;
    this.phaseMessage = message;
    this.blockedSource = phase === 'blocked' ? 'non-authoring' : undefined;
    this.publish();
  }

  updateAuthLineage(authLineage: string): void {
    if (this.binding.authLineage === authLineage) return;
    this.binding = { ...this.binding, authLineage };
    this.clearPhase();
    this.publish();
  }

  updateAuthContext(authLineage: string, authorityScopeId: string): void {
    const changedLineage = this.binding.authLineage !== authLineage;
    const changedScope = this.activeAuthorityScopeId !== authorityScopeId;
    if (!changedLineage && !changedScope) return;
    this.activeAuthorityScopeId = authorityScopeId;
    if (changedLineage) this.binding = { ...this.binding, authLineage };
    if (changedScope) {
      this.localProtection = 'available';
      this.localProtectionMessage = undefined;
    }
    this.clearPhase();
    this.publish();
  }

  setLocalProtectionAvailable(): void {
    if (this.localProtection === 'available' && !this.localProtectionMessage) return;
    this.localProtection = 'available';
    this.localProtectionMessage = undefined;
    this.publish();
  }

  setLocalProtectionUnavailable(message = 'Proteção local indisponível.'): void {
    if (this.localProtection === 'unavailable' && this.localProtectionMessage === message) return;
    this.localProtection = 'unavailable';
    this.localProtectionMessage = message;
    this.publish();
  }

  updateAssetUrls(urls: ReadonlyMap<string, string>): void {
    this.assetUrls = urls;
    this.publish();
  }

  setAssetUrl(assetId: string, url: string): void {
    const next = new Map(this.assetUrls);
    if (url) {
      next.set(assetId, url);
    } else {
      next.delete(assetId);
    }
    this.assetUrls = next;
    this.publish();
  }

  getAssetRuntimeStates(): ReadonlyMap<string, AssetRuntimeState> {
    return this.assetRuntimeStates;
  }

  setAssetRuntimeState(assetId: string, state: AssetRuntimeState): void {
    const next = new Map(this.assetRuntimeStates);
    next.set(assetId, state);
    this.assetRuntimeStates = next;
    this.publish();
  }

  updateAssetRuntimeStates(states: ReadonlyMap<string, AssetRuntimeState>): void {
    this.assetRuntimeStates = states;
    this.publish();
  }

  acknowledge(
    openSessionId: string,
    authLineage: string,
    envelope: CatalogPersistenceEnvelope,
    acknowledgedLocalSequence: number
  ): boolean {
    if (!this.matches(openSessionId, authLineage)) return false;
    this.binding = persistedBindingFromEnvelope(
      envelope,
      openSessionId,
      authLineage,
      this.binding.authorityScopeId,
      acknowledgedLocalSequence
    );
    this.clearPhase();
    this.publish();
    return true;
  }

  replaceActive(
    session: DocumentSession,
    binding: PersistenceBinding,
    assetUrls: ReadonlyMap<string, string> = new Map(),
    assetRuntimeStates: ReadonlyMap<string, AssetRuntimeState> = new Map()
  ): void {
    this.unsubscribeSession?.();
    this.session = session;
    this.binding = binding;
    this.activeAuthorityScopeId = binding.authorityScopeId;
    this.assetUrls = assetUrls;
    this.assetRuntimeStates = assetRuntimeStates;
    this.barrier = NO_AUTHORING_BARRIER;
    this.clearPhase();
    this.bindSession();
    this.publish();
  }

  matches(openSessionId: string, authLineage: string): boolean {
    return this.binding.openSessionId === openSessionId && this.binding.authLineage === authLineage;
  }
}

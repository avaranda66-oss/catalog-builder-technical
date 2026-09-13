import type { DocumentSession } from '../application';
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
}

const NO_AUTHORING_BARRIER: AuthoringBarrier = {
  prepareForSave: () => ({ ok: true }),
  hasPendingDraft: () => false,
};

export type PersistenceBinding =
  | {
      readonly kind: 'UNBOUND';
      readonly openSessionId: string;
      readonly authLineage: string;
      readonly initialEquivalence: string;
    }
  | {
      readonly kind: 'PERSISTED';
      readonly openSessionId: string;
      readonly authLineage: string;
      readonly catalogId: string;
      readonly remoteRevision: number;
      readonly lastMutationId: string;
      readonly acknowledgedEquivalence: string;
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
  readonly dirty: boolean;
  readonly save: SaveProjection;
}

export function createUnboundPersistenceBinding(
  session: DocumentSession,
  openSessionId: string,
  authLineage: string
): PersistenceBinding {
  return {
    kind: 'UNBOUND',
    openSessionId,
    authLineage,
    initialEquivalence: canonicalDocumentEquivalence(session.getSnapshot().document),
  };
}

export function persistedBindingFromEnvelope(
  envelope: CatalogPersistenceEnvelope,
  openSessionId: string,
  authLineage: string,
  localSequence: number
): PersistenceBinding {
  return {
    kind: 'PERSISTED',
    openSessionId,
    authLineage,
    catalogId: envelope.catalogId,
    remoteRevision: envelope.remoteRevision,
    lastMutationId: envelope.lastMutationId,
    acknowledgedEquivalence: canonicalDocumentEquivalence(envelope.documentSnapshot),
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
  private assetUrls: ReadonlyMap<string, string>;
  private snapshot: PersistenceWorkspaceSnapshot;

  constructor(
    session: DocumentSession,
    binding: PersistenceBinding,
    assetUrls: ReadonlyMap<string, string> = new Map()
  ) {
    this.session = session;
    this.binding = binding;
    this.assetUrls = assetUrls;
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
      dirty,
      save: projection(this.binding, dirty, this.phase, this.phaseMessage),
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
      acknowledgedLocalSequence
    );
    this.clearPhase();
    this.publish();
    return true;
  }

  replaceActive(
    session: DocumentSession,
    binding: PersistenceBinding,
    assetUrls: ReadonlyMap<string, string>
  ): void {
    this.unsubscribeSession?.();
    this.session = session;
    this.binding = binding;
    this.assetUrls = assetUrls;
    this.barrier = NO_AUTHORING_BARRIER;
    this.clearPhase();
    this.bindSession();
    this.publish();
  }

  matches(openSessionId: string, authLineage: string): boolean {
    return this.binding.openSessionId === openSessionId && this.binding.authLineage === authLineage;
  }
}

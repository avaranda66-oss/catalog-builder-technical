import type { CatalogDocument } from '../domain';
import type {
  CatalogOriginMetadata,
  CatalogPersistenceEnvelope,
  CatalogRepository,
  PersistenceErrorCode,
} from './contracts';
import { canonicalDocumentEquivalence } from './equivalence';
import { parseCanonicalSnapshot, parsePersistenceEnvelope } from './snapshot';

export type PreparedCreateFailureCode =
  | PersistenceErrorCode
  | 'REMOTE_DIVERGENCE'
  | 'STALE_RESULT';

export type PreparedCreateResult =
  | { readonly ok: true; readonly value: CatalogPersistenceEnvelope }
  | {
      readonly ok: false;
      readonly error: { readonly code: PreparedCreateFailureCode; readonly message?: string };
    };

export type PreparedCreateState = 'idle' | 'pending-verification';

interface CreateAuthority {
  readonly authLineage: string;
  readonly authorityScopeId: string;
}

interface PendingCreateAttempt {
  readonly authority: CreateAuthority;
  readonly documentSnapshot: CatalogDocument;
  readonly mutationId: string;
  readonly origin?: CatalogOriginMetadata;
}

export interface PreparedCatalogCreateCoordinatorOptions {
  readonly repository: CatalogRepository;
  readonly createMutationId: () => string;
  readonly authLineage: () => string;
  readonly authorityScopeId: () => string;
}

function failure(code: PreparedCreateFailureCode, message?: string): PreparedCreateResult {
  return { ok: false, error: { code, ...(message ? { message } : {}) } };
}

function sameOrigin(left: CatalogOriginMetadata | undefined, right: CatalogOriginMetadata | undefined): boolean {
  if (!left || !right) return left === right;
  return left.originKind === right.originKind
    && left.originId === right.originId
    && left.originRevision === right.originRevision;
}

export class PreparedCatalogCreateCoordinator {
  private pendingCreate: PendingCreateAttempt | undefined;

  constructor(private readonly options: PreparedCatalogCreateCoordinatorOptions) {}

  private captureAuthority(): CreateAuthority {
    return {
      authLineage: this.options.authLineage(),
      authorityScopeId: this.options.authorityScopeId(),
    };
  }

  private authorityIsCurrent(authority: CreateAuthority): boolean {
    return this.options.authLineage() === authority.authLineage
      && this.options.authorityScopeId() === authority.authorityScopeId;
  }

  private sameAuthority(left: CreateAuthority, right: CreateAuthority): boolean {
    return left.authLineage === right.authLineage
      && left.authorityScopeId === right.authorityScopeId;
  }

  private stale(): PreparedCreateResult {
    return failure('STALE_RESULT', 'The active account changed while the create operation was running');
  }

  getState(): PreparedCreateState {
    if (!this.pendingCreate) return 'idle';
    if (!this.authorityIsCurrent(this.pendingCreate.authority)) {
      this.pendingCreate = undefined;
      return 'idle';
    }
    return 'pending-verification';
  }

  private request(pending: PendingCreateAttempt) {
    return {
      mutationId: pending.mutationId,
      documentSnapshot: pending.documentSnapshot,
      ...(pending.origin ? { origin: pending.origin } : {}),
    };
  }

  private verify(
    input: CatalogPersistenceEnvelope,
    pending: PendingCreateAttempt
  ): PreparedCreateResult {
    let envelope: CatalogPersistenceEnvelope;
    try {
      envelope = parsePersistenceEnvelope(input);
    } catch (error) {
      return failure('INVALID_DOCUMENT', error instanceof Error ? error.message : String(error));
    }
    if (
      envelope.catalogId !== pending.documentSnapshot.id
      || envelope.documentSnapshot.id !== pending.documentSnapshot.id
      || envelope.lastMutationId !== pending.mutationId
      || envelope.remoteRevision !== 1
      || envelope.archivedAt !== null
      || canonicalDocumentEquivalence(envelope.documentSnapshot)
        !== canonicalDocumentEquivalence(pending.documentSnapshot)
      || !sameOrigin(envelope.origin, pending.origin)
    ) {
      return failure(
        'REMOTE_DIVERGENCE',
        'Create acknowledgement does not prove the requested catalog mutation'
      );
    }
    return { ok: true, value: envelope };
  }

  private async replay(pending: PendingCreateAttempt): Promise<PreparedCreateResult> {
    if (!this.authorityIsCurrent(pending.authority)) {
      this.pendingCreate = undefined;
      return this.stale();
    }
    const replay = await this.options.repository.createCatalog(this.request(pending));
    if (!this.authorityIsCurrent(pending.authority)) {
      this.pendingCreate = undefined;
      return this.stale();
    }
    if (!replay.ok) return failure(replay.error.code, replay.error.message);
    const verified = this.verify(replay.value, pending);
    if (verified.ok) this.pendingCreate = undefined;
    return verified;
  }

  private async reconcile(pending: PendingCreateAttempt): Promise<PreparedCreateResult> {
    if (!this.authorityIsCurrent(pending.authority)) {
      this.pendingCreate = undefined;
      return this.stale();
    }
    const verification = await this.options.repository.getCatalog(pending.documentSnapshot.id);
    if (!this.authorityIsCurrent(pending.authority)) {
      this.pendingCreate = undefined;
      return this.stale();
    }
    if (!verification.ok) {
      if (verification.error.code === 'NOT_FOUND') return this.replay(pending);
      if (
        verification.error.code === 'OFFLINE'
        || verification.error.code === 'REMOTE_FAILURE'
        || verification.error.code === 'AMBIGUOUS_COMMIT_OUTCOME'
      ) {
        return failure('AMBIGUOUS_COMMIT_OUTCOME', verification.error.message);
      }
      return failure(verification.error.code, verification.error.message);
    }
    const verified = this.verify(verification.value, pending);
    if (verified.ok) this.pendingCreate = undefined;
    return verified;
  }

  private async continuePending(authority: CreateAuthority): Promise<PreparedCreateResult | undefined> {
    if (!this.pendingCreate) return undefined;
    if (this.sameAuthority(this.pendingCreate.authority, authority)) {
      return this.reconcile(this.pendingCreate);
    }
    this.pendingCreate = undefined;
    return undefined;
  }

  async create(
    input: CatalogDocument,
    origin?: CatalogOriginMetadata
  ): Promise<PreparedCreateResult> {
    const authority = this.captureAuthority();
    const continued = await this.continuePending(authority);
    if (continued) return continued;

    let documentSnapshot: CatalogDocument;
    try {
      documentSnapshot = parseCanonicalSnapshot(input);
    } catch (error) {
      return failure('INVALID_DOCUMENT', error instanceof Error ? error.message : String(error));
    }
    if (!this.authorityIsCurrent(authority)) return this.stale();

    const pending: PendingCreateAttempt = {
      authority,
      documentSnapshot,
      mutationId: this.options.createMutationId(),
      ...(origin ? { origin } : {}),
    };
    this.pendingCreate = pending;
    const result = await this.options.repository.createCatalog(this.request(pending));
    if (!this.authorityIsCurrent(authority)) {
      this.pendingCreate = undefined;
      return this.stale();
    }
    if (!result.ok) {
      if (result.error.code !== 'AMBIGUOUS_COMMIT_OUTCOME') {
        this.pendingCreate = undefined;
        return failure(result.error.code, result.error.message);
      }
      return this.reconcile(pending);
    }
    const verified = this.verify(result.value, pending);
    if (verified.ok) this.pendingCreate = undefined;
    return verified;
  }
}

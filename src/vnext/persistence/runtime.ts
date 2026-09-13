import type { ApplicationExecutionDependencies, DocumentSession } from '../application';
import type { CatalogDocument } from '../domain';
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
  readonly binding?: CatalogPersistenceEnvelope;
  readonly assetUrls?: ReadonlyMap<string, string>;
  readonly resolveAssetUrls?: (document: CatalogDocument) => ReadonlyMap<string, string>;
}

export class VNextPersistenceRuntime {
  readonly workspace: PersistenceWorkspace;
  readonly saveCoordinator: SaveCoordinator;
  readonly reopenCoordinator: CanonicalReopenCoordinator;

  constructor(options: VNextPersistenceRuntimeOptions) {
    const openSessionId = options.createOpenSessionId();
    const binding = options.binding
      ? persistedBindingFromEnvelope(
          parsePersistenceEnvelope(options.binding),
          openSessionId,
          options.authLineage,
          options.session.getSnapshot().localSequence
        )
      : createUnboundPersistenceBinding(
          options.session,
          openSessionId,
          options.authLineage
        );

    this.workspace = new PersistenceWorkspace(
      options.session,
      binding,
      options.assetUrls
    );
    this.saveCoordinator = new SaveCoordinator({
      workspace: this.workspace,
      repository: options.repository,
      createMutationId: options.createMutationId,
    });
    this.reopenCoordinator = new CanonicalReopenCoordinator({
      workspace: this.workspace,
      repository: options.repository,
      applicationDependencies: options.applicationDependencies,
      createOpenSessionId: options.createOpenSessionId,
      resolveAssetUrls: options.resolveAssetUrls,
      canLeave: () => !this.saveCoordinator.hasUnresolvedActiveMutation(),
    });
  }

  updateAuthLineage(authLineage: string): void {
    this.workspace.updateAuthLineage(authLineage);
  }

  registerAuthoringBarrier(
    openSessionId: string,
    barrier: AuthoringBarrier
  ): () => void {
    return this.workspace.registerAuthoringBarrier(openSessionId, barrier);
  }
}

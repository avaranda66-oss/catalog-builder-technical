export {
  CURRENT_PERSISTED_DOCUMENT_SCHEMA_VERSION,
  PERSISTENCE_ERROR_CODES,
} from './contracts';
export type {
  ArchiveCatalogCasRequest,
  CatalogListItem,
  CatalogListQuery,
  CatalogOriginMetadata,
  CatalogPersistenceEnvelope,
  CatalogPersistenceHandle,
  CatalogPersistenceMetadata,
  CatalogRepository,
  CatalogRootPersistenceCompatibility,
  CreateCatalogRequest,
  PersistedDocumentSchemaVersion,
  PersistenceError,
  PersistenceErrorCode,
  PersistenceResult,
  SaveCatalogCasRequest,
} from './contracts';
export {
  PersistenceContractError,
  checkCatalogRootPersistenceCompatibility,
  parseCanonicalSnapshot,
  parsePersistenceEnvelope,
  persistenceHandleFromEnvelope,
  serializeCanonicalSnapshot,
} from './snapshot';
export { SupabaseCatalogRepository } from './supabase-repository';
export type {
  SupabaseCatalogRepositoryOptions,
  VNextPersistenceRpcClient,
  VNextPersistenceRpcError,
  VNextPersistenceRpcResponse,
} from './supabase-repository';
export { canonicalDocumentEquivalence } from './equivalence';
export { CanonicalReopenCoordinator } from './reopen-coordinator';
export type {
  CanonicalReopenCoordinatorOptions,
  ReopenResult,
} from './reopen-coordinator';
export { SaveCoordinator } from './save-coordinator';
export type {
  ManualSaveResult,
  SaveCoordinatorOptions,
  SaveFailureCode,
} from './save-coordinator';
export { VNextPersistenceRuntime } from './runtime';
export type { VNextPersistenceRuntimeOptions } from './runtime';
export {
  PersistenceWorkspace,
  createUnboundPersistenceBinding,
  persistedBindingFromEnvelope,
} from './workspace';
export type {
  AuthoringBarrier,
  AuthoringBarrierBlockReason,
  AuthoringBarrierResult,
  PersistenceBinding,
  PersistenceWorkspaceSnapshot,
  SavePhase,
  SaveProjection,
} from './workspace';

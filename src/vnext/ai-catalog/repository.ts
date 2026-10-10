import { z } from 'zod';
import { parsePersistenceEnvelope } from '../persistence/snapshot';
import type { CatalogRepository, CatalogPersistenceEnvelope, CatalogPersistenceMetadata, CreateCatalogRequest, SaveCatalogCasRequest, ArchiveCatalogCasRequest, CatalogListQuery, CatalogListItem, PersistenceResult } from '../persistence/contracts';
import { approveGeneration, generationHash, CatalogPlanSchema, type GeneratedCatalog } from './composition';
import { TechnicalInputSchema } from './contracts';
import { CatalogDocumentSchema } from '../domain';

export const PROTOTYPE_STORAGE_KEY = 'catalog-builder:ai-original-prototype:v1';
const GenerationSchema = z.object({ input: TechnicalInputSchema, decisions: z.record(z.union([z.number().int().nonnegative(), z.literal('missing')])), plan: CatalogPlanSchema, document: CatalogDocumentSchema }).strict();
const RecordSchema = z.object({ envelope: z.unknown(), generation: GenerationSchema, approval: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const StoreSchema = z.object({ version: z.literal(1), records: z.array(RecordSchema).max(20) }).strict();
export interface SavedGeneration { envelope: CatalogPersistenceEnvelope; generation: GeneratedCatalog; approval: string }
export interface PrototypeStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export type Exclusive = <T>(work: () => Promise<T>) => Promise<T>;
const browserExclusive: Exclusive = async work => {
  if (!navigator.locks) return Promise.reject(new Error('LOCAL_LOCK_UNAVAILABLE'));
  return await navigator.locks.request(PROTOTYPE_STORAGE_KEY, work);
};
const failure = <T>(code: 'INVALID_DOCUMENT' | 'NOT_FOUND' | 'CONFLICT' | 'REMOTE_FAILURE'): PersistenceResult<T> => ({ ok: false, error: { code } });

/** Local synthetic prototype only. One locked record commits canonical doc + source/review atomically. */
export class LocalGenerationRepository implements CatalogRepository {
  private staged = new Map<string, { generation: GeneratedCatalog; approval: string }>();
  constructor(private storage: PrototypeStorage, private exclusive: Exclusive = browserExclusive) {}
  async stage(generation: GeneratedCatalog, approval: string): Promise<void> {
    const captured = structuredClone(generation);
    if (await approveGeneration(captured) !== approval) throw new Error('APPROVAL_STALE');
    this.staged.set(captured.document.id, { generation: captured, approval });
  }
  private read(): SavedGeneration[] {
    const raw = this.storage.getItem(PROTOTYPE_STORAGE_KEY);
    if (!raw) return [];
    return StoreSchema.parse(JSON.parse(raw)).records.map(record => ({ ...record, envelope: parsePersistenceEnvelope(record.envelope) }));
  }
  private async verify(record: SavedGeneration): Promise<SavedGeneration> {
    if (JSON.stringify(record.generation.document) !== JSON.stringify(record.envelope.documentSnapshot) || record.envelope.catalogId !== record.generation.document.id || await approveGeneration(record.generation) !== record.approval) throw new Error('SAVED_GENERATION_MISMATCH');
    return record;
  }
  async getGeneration(catalogId: string): Promise<SavedGeneration> {
    const record = this.read().find(record => record.envelope.catalogId === catalogId);
    if (!record) throw new Error('NOT_FOUND');
    return this.verify(record);
  }
  async getCatalog(catalogId: string): Promise<PersistenceResult<CatalogPersistenceEnvelope>> {
    try { return { ok: true, value: (await this.getGeneration(catalogId)).envelope }; }
    catch (error) { return failure(error instanceof Error && error.message === 'NOT_FOUND' ? 'NOT_FOUND' : 'INVALID_DOCUMENT'); }
  }
  async listCatalogs(query?: CatalogListQuery): Promise<PersistenceResult<readonly CatalogListItem[]>> {
    try {
      const records = await Promise.all(this.read().map(record => this.verify(record)));
      return { ok: true, value: records.filter(record => query?.includeArchived || !record.envelope.archivedAt).map(record => {
        const { documentSnapshot: _snapshot, lastMutationId: _mutation, ...metadata } = record.envelope;
        return metadata;
      }) };
    } catch { return failure('INVALID_DOCUMENT'); }
  }
  createCatalog(request: CreateCatalogRequest) { return this.write(request, undefined); }
  saveCAS(request: SaveCatalogCasRequest) { return this.write(request, request.expectedRemoteRevision); }
  private async write(submitted: CreateCatalogRequest | SaveCatalogCasRequest, expectedRevision: number | undefined): Promise<PersistenceResult<CatalogPersistenceEnvelope>> {
    const request = structuredClone(submitted);
    try { return await this.exclusive(async () => {
      const staged = this.staged.get(request.documentSnapshot.id);
      if (!staged || JSON.stringify(staged.generation.document) !== JSON.stringify(request.documentSnapshot) || await generationHash(staged.generation) !== staged.approval) return failure('INVALID_DOCUMENT');
      // Read only after async hashing, inside a cross-tab Web Lock.
      const records = this.read(), index = records.findIndex(record => record.envelope.catalogId === request.documentSnapshot.id), current = records[index];
      if ('catalogId' in request && request.catalogId !== request.documentSnapshot.id) return failure('INVALID_DOCUMENT');
      if (current?.envelope.lastMutationId === request.mutationId) {
        await this.verify(current);
        if (current.approval !== staged.approval || JSON.stringify(current.envelope.documentSnapshot) !== JSON.stringify(request.documentSnapshot)) return failure('CONFLICT');
        return { ok: true, value: current.envelope };
      }
      if (expectedRevision === undefined ? Boolean(current) : !current || current.envelope.remoteRevision !== expectedRevision) return failure('CONFLICT');
      if (current) await this.verify(current);
      const now = new Date().toISOString();
      const envelope = parsePersistenceEnvelope({ catalogId: request.documentSnapshot.id, remoteRevision: (current?.envelope.remoteRevision ?? 0) + 1,
        lastMutationId: request.mutationId, title: request.documentSnapshot.title, locale: request.documentSnapshot.locale,
        createdAt: current?.envelope.createdAt ?? now, updatedAt: now, createdBy: null, updatedBy: null, archivedAt: null, documentSchemaVersion: 1,
        documentSnapshot: request.documentSnapshot, origin: { originKind: 'original-synthetic-prototype' },
      });
      const record = { envelope, ...staged };
      if (current) records[index] = record; else records.push(record);
      if (records.length > 20) return failure('REMOTE_FAILURE');
      this.storage.setItem(PROTOTYPE_STORAGE_KEY, JSON.stringify({ version: 1, records }));
      return { ok: true, value: envelope };
    }); } catch { return failure('REMOTE_FAILURE'); }
  }
  async archiveCAS(_request: ArchiveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceMetadata>> {
    return failure('REMOTE_FAILURE'); // No destructive operations exposed by this prototype.
  }
}

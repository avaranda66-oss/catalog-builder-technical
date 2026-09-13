import type { CatalogDocument } from '@/vnext/domain';
import type { RecoveryRecord } from '@/vnext/recovery';
import { digestCanonicalDocument, RECOVERY_DIGEST_ALGORITHM } from '@/vnext/recovery';
import { documentStyle } from '../proof/test-data';

export const CATALOG_ID = '11111111-1111-4111-8111-111111111111';
export const SESSION_A = '22222222-2222-4222-8222-222222222222';
export const SESSION_B = '33333333-3333-4333-8333-333333333333';
export const MUTATION_0 = '44444444-4444-4444-8444-444444444444';
export const MUTATION_1 = '55555555-5555-4555-8555-555555555555';

export function recoveryDocument(title = 'Recovered'): CatalogDocument {
  return {
    schemaVersion: 1,
    id: CATALOG_ID,
    title,
    locale: 'pt-BR',
    style: documentStyle,
    pages: [{ id: 'page-1', widthMm: 210, heightMm: 297, objects: [] }],
    assets: [],
  };
}

export async function recoveryRecord(
  overrides: Partial<RecoveryRecord> = {}
): Promise<RecoveryRecord> {
  const documentSnapshot = overrides.documentSnapshot ?? recoveryDocument();
  const snapshotDigest = await digestCanonicalDocument(documentSnapshot);
  return {
    recordFormatVersion: 1,
    authorityScopeId: 'deployment:workspace:user-a',
    catalogId: CATALOG_ID,
    openSessionId: SESSION_A,
    recoveryGeneration: 1,
    localEditSequence: 1,
    baseRemoteRevision: 7,
    baseRemoteSnapshotDigest: await digestCanonicalDocument(recoveryDocument('Cloud base')),
    documentSchemaVersion: 1,
    documentSnapshot,
    snapshotDigestAlgorithm: RECOVERY_DIGEST_ALGORITHM,
    snapshotDigest,
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    ...overrides,
  };
}

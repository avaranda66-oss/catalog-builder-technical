import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { SourceDocument } from '../../src/domain/product-workbook';
import {
  SupabaseProductSourceDocumentRepository,
  SourceDocumentAuthorizationError,
  SourceDocumentConflictError,
  classifySourceDocumentRealtimeMetadata,
  getSourceDocumentRealtimeMetadata
} from '../../src/services/product-workbook';

const draftPath = path.resolve(__dirname, '../../supabase/rehearsals/source_document_cas_v2_draft.sql');
const draftSql = fs.readFileSync(draftPath, 'utf-8');

const sourceDocument: SourceDocument = {
  id: 'doc-cas-1',
  title: 'Manual de Produto',
  documentType: 'manual',
  revision: 'Rev. editorial B',
  language: 'pt-BR',
  metadata: { author: 'Engenharia' }
};

function casResponse(version: number, document: SourceDocument = sourceDocument) {
  return {
    sourceDocumentId: document.id,
    version,
    document
  };
}

describe('H1B SourceDocument persistence CAS V2', () => {
  it('keeps editorial revision separate and defines BIGINT version with safe bounds', () => {
    expect(draftSql).toContain('ADD COLUMN IF NOT EXISTS version BIGINT');
    expect(draftSql).toContain('SET version = 1');
    expect(draftSql).toContain('ALTER COLUMN version SET DEFAULT 1');
    expect(draftSql).toContain('ALTER COLUMN version SET NOT NULL');
    expect(draftSql).toContain('CHECK (version >= 1 AND version <= 9007199254740991)');
    expect(draftSql).toContain('revision = p_document->>\'revision\'');
  });

  it('create: expected 0 produces version 1', async () => {
    const rpc = vi.fn().mockImplementation((name: string, args: Record<string, unknown>) => {
      expect(name).toBe('upsert_source_document_v2');
      expect(args.p_expected_version).toBe(0);
      return Promise.resolve({ data: casResponse(1), error: null });
    });
    const repo = new SupabaseProductSourceDocumentRepository({ rpc } as never);

    const saved = await repo.saveSourceDocument({ document: sourceDocument, expectedVersion: 0 });

    expect(saved.version).toBe(1);
    expect(saved.sourceDocumentId).toBe(sourceDocument.id);
    expect(saved.document.revision).toBe('Rev. editorial B');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('duplicate create returns 40001 SOURCE_DOCUMENT_CONFLICT with safe actualVersion', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '40001',
        message: 'SOURCE_DOCUMENT_CONFLICT',
        details: JSON.stringify({ sourceDocumentId: sourceDocument.id, expectedVersion: 0, actualVersion: 1 })
      }
    });
    const repo = new SupabaseProductSourceDocumentRepository({ rpc } as never);

    await expect(repo.saveSourceDocument({ document: sourceDocument, expectedVersion: 0 }))
      .rejects.toMatchObject({
        code: 'SOURCE_DOCUMENT_CONFLICT',
        expectedVersion: 0,
        actualVersion: 1
      });
  });

  it('update: expected 1 produces version 2', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: casResponse(2), error: null });
    const repo = new SupabaseProductSourceDocumentRepository({ rpc } as never);

    const saved = await repo.saveSourceDocument({ document: sourceDocument, expectedVersion: 1 });

    expect(saved.version).toBe(2);
    expect(draftSql).toContain('WHERE id = v_id');
    expect(draftSql).toContain('AND version = p_expected_version');
    expect(draftSql).toContain('version = version + 1');
  });

  it('two writers from base version 2: A reaches 3 and B receives 40001', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: casResponse(3), error: null })
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: '40001',
          message: 'SOURCE_DOCUMENT_CONFLICT',
          details: JSON.stringify({ sourceDocumentId: sourceDocument.id, expectedVersion: 2, actualVersion: 3 })
        }
      });
    const repo = new SupabaseProductSourceDocumentRepository({ rpc } as never);

    const writerA = await repo.saveSourceDocument({ document: sourceDocument, expectedVersion: 2 });
    expect(writerA.version).toBe(3);

    try {
      await repo.saveSourceDocument({ document: sourceDocument, expectedVersion: 2 });
      expect.fail('writer B should conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(SourceDocumentConflictError);
      expect(error).toMatchObject({ expectedVersion: 2, actualVersion: 3 });
    }
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('missing update fails as 40001 with actualVersion null', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '40001',
        message: 'SOURCE_DOCUMENT_CONFLICT',
        details: JSON.stringify({ sourceDocumentId: sourceDocument.id, expectedVersion: 4, actualVersion: null })
      }
    });
    const repo = new SupabaseProductSourceDocumentRepository({ rpc } as never);

    await expect(repo.saveSourceDocument({ document: sourceDocument, expectedVersion: 4 }))
      .rejects.toMatchObject({ actualVersion: null });
  });

  it('rejects null, negative, fractional and unsafe expected versions before network', async () => {
    const rpc = vi.fn();
    const repo = new SupabaseProductSourceDocumentRepository({ rpc } as never);

    for (const expectedVersion of [null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(repo.saveSourceDocument({
        document: sourceDocument,
        expectedVersion: expectedVersion as number
      })).rejects.toThrow(/INVALID_SOURCE_DOCUMENT_EXPECTED_VERSION/);
    }

    expect(rpc).not.toHaveBeenCalled();
    expect(draftSql).toContain('p_expected_version BIGINT');
    expect(draftSql).toContain('p_expected_version IS NULL');
    expect(draftSql).toContain('p_expected_version < 0');
    expect(draftSql).toContain('p_expected_version > 9007199254740991');
  });

  it('preserves unauthorized SQLSTATE 42501 as a typed authorization failure', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'SOURCE_DOCUMENT_WRITE_DENIED' }
    });
    const repo = new SupabaseProductSourceDocumentRepository({ rpc } as never);

    await expect(repo.saveSourceDocument({ document: sourceDocument, expectedVersion: 0 }))
      .rejects.toBeInstanceOf(SourceDocumentAuthorizationError);
    expect(draftSql).toContain("USING ERRCODE = '42501'");
  });

  it('rejects client-controlled version injection before network and in SQL', async () => {
    const rpc = vi.fn();
    const repo = new SupabaseProductSourceDocumentRepository({ rpc } as never);
    const injected = { ...sourceDocument, version: 9 } as SourceDocument;

    await expect(repo.saveSourceDocument({ document: injected, expectedVersion: 0 }))
      .rejects.toThrow(/CLIENT_CONTROLLED_SOURCE_DOCUMENT_VERSION/);
    expect(rpc).not.toHaveBeenCalled();
    expect(draftSql).toContain("IF p_document ? 'version'");
    expect(draftSql).toContain('CLIENT_CONTROLLED_SOURCE_DOCUMENT_VERSION');
  });

  it('fails closed when returned version is not expected + 1', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: casResponse(1), error: null });
    const repo = new SupabaseProductSourceDocumentRepository({ rpc } as never);

    await expect(repo.saveSourceDocument({ document: sourceDocument, expectedVersion: 1 }))
      .rejects.toThrow(/SOURCE_DOCUMENT_PROTOCOL_VIOLATION/);
  });

  it('fails closed on malformed CAS response metadata', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { sourceDocumentId: sourceDocument.id, document: sourceDocument },
      error: null
    });
    const repo = new SupabaseProductSourceDocumentRepository({ rpc } as never);

    await expect(repo.saveSourceDocument({ document: sourceDocument, expectedVersion: 0 }))
      .rejects.toThrow(/SOURCE_DOCUMENT_PROTOCOL_VIOLATION/);
  });

  it('blocks the legacy V1 application bypass by revoking authenticated EXECUTE', async () => {
    expect(draftSql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.upsert_source_document_v1(JSONB) FROM PUBLIC, anon, authenticated;'
    );
    expect(draftSql).not.toContain(
      'GRANT EXECUTE ON FUNCTION public.upsert_source_document_v1(JSONB) TO authenticated;'
    );

    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for function upsert_source_document_v1' }
    });
    const repo = new SupabaseProductSourceDocumentRepository({ rpc } as never);

    await expect(repo.upsertSourceDocument(sourceDocument))
      .rejects.toThrow(/LEGACY_SOURCE_DOCUMENT_WRITE_DISABLED/);
  });

  it('exposes own echo metadata without treating Realtime as ACK', () => {
    const metadata = getSourceDocumentRealtimeMetadata({
      eventType: 'UPDATE',
      new: { id: sourceDocument.id, version: 3 }
    });

    expect(metadata).toEqual({ sourceDocumentId: sourceDocument.id, resultingVersion: 3 });
    expect(classifySourceDocumentRealtimeMetadata(metadata!, 2, {
      sourceDocumentId: sourceDocument.id,
      targetVersion: 3
    })).toBe('OWN_ECHO');
    expect(metadata).not.toHaveProperty('acknowledged');
  });

  it('exposes higher third-party version metadata', () => {
    const metadata = getSourceDocumentRealtimeMetadata({
      eventType: 'UPDATE',
      new: { id: sourceDocument.id, version: 7 }
    });

    expect(metadata).toEqual({ sourceDocumentId: sourceDocument.id, resultingVersion: 7 });
    expect(classifySourceDocumentRealtimeMetadata(metadata!, 6, null)).toBe('THIRD_PARTY_HIGHER');
    expect(draftSql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.product_source_documents');
    expect(draftSql).toContain('ALTER TABLE public.product_source_documents REPLICA IDENTITY FULL');
  });
});

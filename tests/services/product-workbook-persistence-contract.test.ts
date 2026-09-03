// tests/services/product-workbook-persistence-contract.test.ts
// Testes de contrato estático, concorrência CAS e repositórios de persistência do Product Workbook (PIM.W2B)

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  createWorkbook,
  addModule,
  SourceDocument
} from '../../src/domain/product-workbook';
import {
  SupabaseProductWorkbookRepository,
  SupabaseProductSourceDocumentRepository,
  WorkbookConflictError
} from '../../src/services/product-workbook';

const VALID_PRODUCT_UUID = '11111111-1111-4111-8111-111111111111';
const VALID_FAMILY_UUID = '22222222-2222-4222-8222-222222222222';

describe('PIM.W2B — Product Workbook Persistence Hardening Suite', () => {
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations/00022_product_workbook_persistence.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  // =========================================================================
  // PIM-PERSIST-CAS-1: expectedRevision é obrigatório no TypeScript
  // =========================================================================
  it('PIM-PERSIST-CAS-1: expectedRevision é obrigatório no runtime/TypeScript e rejeita ausência/tipo inválido', async () => {
    const fakeClient = { rpc: vi.fn() } as any;
    const repo = new SupabaseProductWorkbookRepository(fakeClient);
    const wb = createWorkbook({ owner: { kind: 'product', id: VALID_PRODUCT_UUID }, revision: 0 });

    // Ausência / indefinido
    await expect(
      repo.saveWorkbook({
        workbook: wb,
        expectedRevision: undefined as any
      })
    ).rejects.toThrowError(/CAS_REVISION_REQUIRED/);

    // Número negativo
    await expect(
      repo.saveWorkbook({
        workbook: wb,
        expectedRevision: -1
      })
    ).rejects.toThrowError(/CAS_REVISION_REQUIRED/);

    // Decimal / Float
    await expect(
      repo.saveWorkbook({
        workbook: wb,
        expectedRevision: 1.5
      })
    ).rejects.toThrowError(/CAS_REVISION_REQUIRED/);
  });

  // =========================================================================
  // PIM-PERSIST-CAS-2: expectedRevision diferente de workbook.revision falha antes da rede
  // =========================================================================
  it('PIM-PERSIST-CAS-2: expectedRevision divergente de workbook.revision falha antes da rede', async () => {
    const mockRpc = vi.fn();
    const fakeClient = { rpc: mockRpc } as any;
    const repo = new SupabaseProductWorkbookRepository(fakeClient);

    // Workbook na revisão 0 mas caller informa expectedRevision: 2
    const wb = createWorkbook({ owner: { kind: 'product', id: VALID_PRODUCT_UUID }, revision: 0 });

    await expect(
      repo.saveWorkbook({
        workbook: wb,
        expectedRevision: 2
      })
    ).rejects.toThrowError(/REVISION_MISMATCH/);

    expect(mockRpc).not.toHaveBeenCalled();
  });

  // =========================================================================
  // PIM-PERSIST-CAS-3: primeiro save 0 -> 1
  // =========================================================================
  it('PIM-PERSIST-CAS-3: primeiro save de workbook com revision 0 avança formalmente para 1', async () => {
    let wb = createWorkbook({ owner: { kind: 'product', id: VALID_PRODUCT_UUID }, revision: 0 });
    wb = addModule(wb, { id: 'm1', semanticKey: 'spec.mod', label: 'Módulo', kind: 'key_value', order: 1 });

    const mockRpc = vi.fn().mockImplementation((_fn, args) => {
      expect(args.p_expected_revision).toBe(0);
      return Promise.resolve({
        data: {
          ...args.p_workbook,
          revision: 1
        },
        error: null
      });
    });

    const repo = new SupabaseProductWorkbookRepository({ rpc: mockRpc } as any);
    const result = await repo.saveWorkbook({ workbook: wb, expectedRevision: 0 });

    expect(result.success).toBe(true);
    expect(result.revision).toBe(1);
    expect(result.workbook.revision).toBe(1);
  });

  // =========================================================================
  // PIM-PERSIST-CAS-4: save existente N -> N+1
  // =========================================================================
  it('PIM-PERSIST-CAS-4: save subsequente com revision N avança formalmente para N+1', async () => {
    const N = 8;
    let wb = createWorkbook({ owner: { kind: 'product', id: VALID_PRODUCT_UUID }, revision: N });
    wb = addModule(wb, { id: 'm1', semanticKey: 'spec.mod', label: 'Módulo', kind: 'key_value', order: 1 });

    const mockRpc = vi.fn().mockImplementation((_fn, args) => {
      expect(args.p_expected_revision).toBe(N);
      return Promise.resolve({
        data: {
          ...args.p_workbook,
          revision: N + 1
        },
        error: null
      });
    });

    const repo = new SupabaseProductWorkbookRepository({ rpc: mockRpc } as any);
    const result = await repo.saveWorkbook({ workbook: wb, expectedRevision: N });

    expect(result.success).toBe(true);
    expect(result.revision).toBe(9);
    expect(result.workbook.revision).toBe(9);
  });

  // =========================================================================
  // PIM-PERSIST-CAS-5: mismatch gera WORKBOOK_CONFLICT
  // =========================================================================
  it('PIM-PERSIST-CAS-5: divergência concorrencial 40001 gera WorkbookConflictError estruturado', async () => {
    const wb = createWorkbook({ owner: { kind: 'product', id: VALID_PRODUCT_UUID }, revision: 3 });

    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '40001',
        message: 'WORKBOOK_CONFLICT: Conflito de concorrência no workbook (Esperado: 3, Atual: 5).'
      }
    });

    const repo = new SupabaseProductWorkbookRepository({ rpc: mockRpc } as any);

    try {
      await repo.saveWorkbook({ workbook: wb, expectedRevision: 3 });
      expect.fail('Deveria ter disparado WorkbookConflictError');
    } catch (err) {
      expect(err).toBeInstanceOf(WorkbookConflictError);
      const conflict = err as WorkbookConflictError;
      expect(conflict.code).toBe('WORKBOOK_CONFLICT');
      expect(conflict.expectedRevision).toBe(3);
      expect(conflict.actualRevision).toBe(5);
      expect(conflict.ownerIdentity).toBe(`product:${VALID_PRODUCT_UUID}`);
    }
  });

  // =========================================================================
  // PIM-PERSIST-CAS-6: NULL expected revision é rejeitado pelo SQL
  // =========================================================================
  it('PIM-PERSIST-CAS-6: o script SQL rejeita NULL em p_expected_revision e não possui DEFAULT NULL', () => {
    // Na assinatura da RPC: p_expected_revision não pode ter DEFAULT NULL
    expect(migrationSql).toMatch(/save_product_workbook_v1\(\s*p_workbook\s+JSONB,\s*p_expected_revision\s+INTEGER\s*\)/i);
    expect(migrationSql).not.toContain('p_expected_revision INTEGER DEFAULT NULL');

    // Validação explícita no corpo da RPC
    expect(migrationSql).toContain('CAS_REVISION_REQUIRED');
  });

  // =========================================================================
  // PIM-PERSIST-CREATE-RACE-1: contrato garante serialização de dois first-save concorrentes
  // =========================================================================
  it('PIM-PERSIST-CREATE-RACE-1: o script SQL obtém bloqueio FOR UPDATE na entidade owner antes do lookup de workbook', () => {
    expect(migrationSql).toContain('PERFORM 1 FROM public.products WHERE id = v_owner_id FOR UPDATE;');
    expect(migrationSql).toContain('PERFORM 1 FROM public.product_families WHERE id = v_owner_id FOR UPDATE;');
  });

  // =========================================================================
  // PIM-PERSIST-OWNER-1: owner inválido UUID rejeitado antes da rede
  // =========================================================================
  it('PIM-PERSIST-OWNER-1: owner.id não-UUID é rejeitado pelo repositório antes de chamar a rede', async () => {
    const mockRpc = vi.fn();
    const repo = new SupabaseProductWorkbookRepository({ rpc: mockRpc } as any);

    const wbInvalidOwner = createWorkbook({ owner: { kind: 'product', id: 'not-a-uuid-string' }, revision: 0 });

    await expect(
      repo.saveWorkbook({
        workbook: wbInvalidOwner,
        expectedRevision: 0
      })
    ).rejects.toThrowError(/INVALID_OWNER_ID/);

    // Também em getWorkbook
    await expect(
      repo.getWorkbook({ kind: 'product', id: 'invalid-id' })
    ).rejects.toThrowError(/INVALID_OWNER_ID/);

    // Valida que UUID válido de família é aceito pelo formato
    const wbFamily = createWorkbook({ owner: { kind: 'family', id: VALID_FAMILY_UUID }, revision: 0 });
    expect(wbFamily.owner.id).toBe(VALID_FAMILY_UUID);

    expect(mockRpc).not.toHaveBeenCalled();
  });

  // =========================================================================
  // PIM-PERSIST-OWNER-2: owner inexistente é rejeitado no banco
  // =========================================================================
  it('PIM-PERSIST-OWNER-2: RPC valida e aborta com OWNER_NOT_FOUND (23503) se entidade owner não existir', () => {
    expect(migrationSql).toContain('OWNER_NOT_FOUND');
    expect(migrationSql).toContain("USING ERRCODE = '23503'");
  });

  // =========================================================================
  // PIM-PERSIST-AUTH-1: não existe coalesce(team_role(), 'editor')
  // =========================================================================
  it('PIM-PERSIST-AUTH-1: o SQL não contém o padrão inseguro coalesce(team_role(), \'editor\')', () => {
    expect(migrationSql).not.toContain("coalesce(public.team_role(), 'editor')");
    expect(migrationSql).not.toContain("coalesce(team_role(), 'editor')");
    expect(migrationSql).toContain('public.require_document_editor_v1()');
  });

  // =========================================================================
  // PIM-PERSIST-AUTH-2: direct DML não é authority de escrita
  // =========================================================================
  it('PIM-PERSIST-AUTH-2: direct DML é revogado explicitamente nas tabelas de workbook e índice', () => {
    expect(migrationSql).toContain('REVOKE INSERT, UPDATE, DELETE ON public.product_workbooks FROM PUBLIC, anon, authenticated;');
    expect(migrationSql).toContain('REVOKE INSERT, UPDATE, DELETE ON public.product_source_documents FROM PUBLIC, anon, authenticated;');
    expect(migrationSql).toContain('REVOKE INSERT, UPDATE, DELETE ON public.product_technical_data_index FROM PUBLIC, anon, authenticated;');
  });

  // =========================================================================
  // PIM-PERSIST-AUTH-3: SECURITY DEFINER functions possuem REVOKE/GRANT explícitos
  // =========================================================================
  it('PIM-PERSIST-AUTH-3: RPCs SECURITY DEFINER revogam execução de PUBLIC/anon e concedem a authenticated', () => {
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.get_product_workbook_v1(TEXT, TEXT) FROM PUBLIC, anon;');
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.get_product_workbook_v1(TEXT, TEXT) TO authenticated;');
    expect(migrationSql).toContain('REVOKE EXECUTE ON FUNCTION public.save_product_workbook_v1(JSONB, INTEGER) FROM PUBLIC, anon;');
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.save_product_workbook_v1(JSONB, INTEGER) TO authenticated;');
    expect(migrationSql).toContain('SET search_path = pg_catalog, public, pg_temp');
  });

  // =========================================================================
  // PIM-PERSIST-SOURCE-1: SourceDocument enum é igual ao domínio
  // =========================================================================
  it('PIM-PERSIST-SOURCE-1: enum de document_type em product_source_documents espelha os 8 tipos do domínio', () => {
    const domainTypes = [
      'manual',
      'datasheet',
      'certificate',
      'drawing',
      'standard',
      'engineering_note',
      'website',
      'other'
    ];

    for (const dt of domainTypes) {
      expect(migrationSql).toContain(`'${dt}'`);
    }

    // Não contém tipos inventados fora do domínio
    expect(migrationSql).not.toContain("'test_report'");
    expect(migrationSql).not.toContain("'marketing'");
  });

  // =========================================================================
  // PIM-PERSIST-SOURCE-2: SourceDocument possui caminho real de persistência/leitura
  // =========================================================================
  it('PIM-PERSIST-SOURCE-2: SupabaseProductSourceDocumentRepository implementa upsert, get e list', async () => {
    const sampleDoc: SourceDocument = {
      id: 'doc-datasheet-1',
      title: 'Datasheet Válvula Globo',
      documentType: 'datasheet',
      revision: 'Rev. 2',
      language: 'pt-BR',
      publicationDate: '2026-05-15',
      checksum: 'sha256:abcd1234ef',
      metadata: { author: 'Engenharia de Produto' }
    };

    const mockRpc = vi.fn().mockImplementation((fnName: string, _args: any) => {
      if (fnName === 'upsert_source_document_v1') {
        return Promise.resolve({ data: sampleDoc, error: null });
      }
      if (fnName === 'get_source_document_v1') {
        return Promise.resolve({ data: sampleDoc, error: null });
      }
      if (fnName === 'list_source_documents_v1') {
        return Promise.resolve({ data: [sampleDoc], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const sourceRepo = new SupabaseProductSourceDocumentRepository({ rpc: mockRpc } as any);

    // Upsert
    const saved = await sourceRepo.upsertSourceDocument(sampleDoc);
    expect(saved.id).toBe(sampleDoc.id);
    expect(saved.documentType).toBe('datasheet');

    // Get
    const fetched = await sourceRepo.getSourceDocument('doc-datasheet-1');
    expect(fetched?.title).toBe('Datasheet Válvula Globo');

    // List
    const list = await sourceRepo.listSourceDocuments();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('doc-datasheet-1');
  });

  // =========================================================================
  // PIM-PERSIST-SOURCE-3: Evidence orphan falha
  // =========================================================================
  it('PIM-PERSIST-SOURCE-3: RPC e repositório abortam com ORPHAN_SOURCE_DOCUMENT quando evidência referencia documento inexistente', async () => {
    expect(migrationSql).toContain('ORPHAN_SOURCE_DOCUMENT');
    expect(migrationSql).toContain("USING ERRCODE = '23503'");

    const wb = createWorkbook({ owner: { kind: 'product', id: VALID_PRODUCT_UUID }, revision: 0 });
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '23503',
        message: 'ORPHAN_SOURCE_DOCUMENT: Evidência referencia sourceDocumentId "doc-non-existent" inexistente.'
      }
    });

    const repo = new SupabaseProductWorkbookRepository({ rpc: mockRpc } as any);

    await expect(
      repo.saveWorkbook({ workbook: wb, expectedRevision: 0 })
    ).rejects.toThrowError(/ORPHAN_SOURCE_DOCUMENT/);
  });

  // =========================================================================
  // PIM-PERSIST-INDEX-1: index rebuild ocorre no mesmo save transaction
  // =========================================================================
  it('PIM-PERSIST-INDEX-1: o índice analítico é limpo e reconstruído na mesma transação atômica do save', () => {
    expect(migrationSql).toContain('DELETE FROM public.product_technical_data_index');
    expect(migrationSql).toContain('WHERE workbook_id = v_saved_id;');
    expect(migrationSql).toContain('INSERT INTO public.product_technical_data_index');
  });

  // =========================================================================
  // PIM-PERSIST-INDEX-2: não existe has_conflicts = evidenceCount > 1
  // =========================================================================
  it('PIM-PERSIST-INDEX-2: has_conflicts foi removido do índice analítico para não conflitar com o domínio', () => {
    expect(migrationSql).not.toContain('has_conflicts BOOLEAN');
    expect(migrationSql).not.toContain('jsonb_array_length(COALESCE(value->\'evidence\'');
  });

  // =========================================================================
  // PIM-PERSIST-VALUE-1: cada TechnicalValue union não quebra projeção
  // =========================================================================
  it('PIM-PERSIST-VALUE-1: o SQL projeta campos específicos para os 10 tipos de TechnicalValue da união sem ghost data', () => {
    // 10 tipos do domínio: text, number, boolean, quantity, range, enum, technical_token, asset_reference, product_reference, unknown
    const projectionColumns = [
      'raw_value',
      'text_value',
      'numeric_value',
      'boolean_value',
      'lower_value',
      'upper_value',
      'unit',
      'enum_code',
      'technical_token',
      'asset_id',
      'target_product_id',
      'unknown_reason'
    ];

    for (const col of projectionColumns) {
      expect(migrationSql).toContain(col);
    }
  });

  // =========================================================================
  // PIM-PERSIST-PROTOCOL-1: returned revision inesperada é rejeitada pelo repository
  // =========================================================================
  it('PIM-PERSIST-PROTOCOL-1: repositório rejeita resposta do servidor cuja revisão viole expectedRevision + 1', async () => {
    let wb = createWorkbook({ owner: { kind: 'product', id: VALID_PRODUCT_UUID }, revision: 0 });
    wb = addModule(wb, { id: 'm1', semanticKey: 'spec.mod', label: 'Mod', kind: 'key_value', order: 1 });

    // Servidor erroneamente responde com a mesma revisão 0 em vez de 1
    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        ...wb,
        revision: 0
      },
      error: null
    });

    const repo = new SupabaseProductWorkbookRepository({ rpc: mockRpc } as any);

    await expect(
      repo.saveWorkbook({ workbook: wb, expectedRevision: 0 })
    ).rejects.toThrowError(/PERSISTENCE_PROTOCOL_VIOLATION/);
  });
});

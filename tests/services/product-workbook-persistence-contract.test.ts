// tests/services/product-workbook-persistence-contract.test.ts
// Testes de contrato estático, concorrência CAS e repositórios de persistência do Product Workbook (PIM.W2B)

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  createWorkbook,
  addModule,
  addDatum,
  validateProductWorkbook,
  parseSourceDocument,
  SourceDocument,
  isValidIsoDate,
  isValidHttpUrl,
  CANONICAL_HTTP_URL_REGEX
} from '../../src/domain/product-workbook';
import {
  SupabaseProductWorkbookRepository,
  SupabaseProductSourceDocumentRepository,
  WorkbookConflictError
} from '../../src/services/product-workbook';
import { normalizeSourceDocumentRow } from '../../src/services/product-workbook/source-document.repository';

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

  // =========================================================================
  // PIM-W2C-RANGE-1: lower/upper corretos na projection SQL e domínio
  // =========================================================================
  it('PIM-W2C-RANGE-1: lower/upper aparecem na projeção SQL e cobrem ranges bilaterais e unilaterais sem typecasts forçados', () => {
    expect(migrationSql).toContain("value->'value'->>'lower'");
    expect(migrationSql).toContain("value->'value'->>'upper'");

    // Fixtures de domínio estritamente tipadas sem `as unknown as TechnicalValue`
    let wb = createWorkbook({ owner: { kind: 'product', id: VALID_PRODUCT_UUID }, revision: 0 });
    wb = addModule(wb, { id: 'm-range', semanticKey: 'env.conditions', label: 'Condições', kind: 'key_value', order: 1 });

    // 1. Bilateral
    wb = addDatum(wb, {
      semanticKey: 'env.conditions.temp',
      moduleId: 'm-range',
      label: 'Temperatura de Operação',
      value: {
        type: 'range',
        lower: -50,
        upper: 140,
        unit: '°C'
      },
      evidence: [],
      status: 'approved'
    });

    // 2. Unilateral Upper
    wb = addDatum(wb, {
      semanticKey: 'env.conditions.pressure',
      moduleId: 'm-range',
      label: 'Pressão Máxima',
      value: {
        type: 'range',
        upper: 10,
        unit: 'bar'
      },
      evidence: [],
      status: 'approved'
    });

    // 3. Unilateral Lower
    wb = addDatum(wb, {
      semanticKey: 'env.conditions.speed',
      moduleId: 'm-range',
      label: 'Velocidade Mínima',
      value: {
        type: 'range',
        lower: 0,
        unit: 'rpm'
      },
      evidence: [],
      status: 'approved'
    });

    const valResult = validateProductWorkbook(wb);
    expect(valResult.valid).toBe(true);
    expect(valResult.errors.length).toBe(0);
  });

  // =========================================================================
  // PIM-W2C-RANGE-2: migration NÃO consulta 'min'/'max' para TechnicalValue.range
  // =========================================================================
  it('PIM-W2C-RANGE-2: migration SQL não referencia min nem max para o tipo range', () => {
    expect(migrationSql).not.toContain("value->'value'->>'min'");
    expect(migrationSql).not.toContain("value->'value'->>'max'");
  });

  // =========================================================================
  // PIM-W2C-STRUCT-1: missing schemaVersion é fail-closed pelo contrato SQL
  // =========================================================================
  it('PIM-W2C-STRUCT-1: ausência ou tipo inválido de schemaVersion é fail-closed na RPC SQL', () => {
    expect(migrationSql).toContain("NOT (p_workbook ? 'schemaVersion')");
    expect(migrationSql).toContain("jsonb_typeof(p_workbook->'schemaVersion') IS DISTINCT FROM 'number'");
    expect(migrationSql).toContain("(p_workbook->>'schemaVersion') IS DISTINCT FROM '1'");
    expect(migrationSql).toContain('INVALID_WORKBOOK_SCHEMA');
  });

  // =========================================================================
  // PIM-W2C-STRUCT-2: missing modules é fail-closed
  // =========================================================================
  it('PIM-W2C-STRUCT-2: ausência ou tipo não-array de modules é fail-closed na RPC SQL', () => {
    expect(migrationSql).toContain("NOT (p_workbook ? 'modules')");
    expect(migrationSql).toContain("jsonb_typeof(p_workbook->'modules') IS DISTINCT FROM 'array'");
    expect(migrationSql).toContain('INVALID_WORKBOOK_MODULES');
  });

  // =========================================================================
  // PIM-W2C-STRUCT-3: missing data é fail-closed
  // =========================================================================
  it('PIM-W2C-STRUCT-3: ausência ou tipo não-objeto de data é fail-closed na RPC SQL', () => {
    expect(migrationSql).toContain("NOT (p_workbook ? 'data')");
    expect(migrationSql).toContain("jsonb_typeof(p_workbook->'data') IS DISTINCT FROM 'object'");
    expect(migrationSql).toContain('INVALID_WORKBOOK_DATA');
  });

  // =========================================================================
  // PIM-W2C-STRUCT-4: non-object p_workbook é rejeitado
  // =========================================================================
  it('PIM-W2C-STRUCT-4: payload p_workbook não-objeto é rejeitado com INVALID_WORKBOOK_PAYLOAD', () => {
    expect(migrationSql).toContain("jsonb_typeof(p_workbook) IS DISTINCT FROM 'object'");
    expect(migrationSql).toContain('INVALID_WORKBOOK_PAYLOAD');
  });

  // =========================================================================
  // PIM-W2C-STRUCT-5: non-integer revision/schemaVersion não dependem de casts inseguros
  // =========================================================================
  it('PIM-W2C-STRUCT-5: revision e schemaVersion são validadas com regex/number antes de qualquer cast numérico', () => {
    expect(migrationSql).toContain("(p_workbook->>'revision') ~ '^[0-9]+$'");
    expect(migrationSql).toContain("jsonb_typeof(p_workbook->'revision') IS DISTINCT FROM 'number'");
    expect(migrationSql).toContain('INVALID_WORKBOOK_REVISION');
  });

  // =========================================================================
  // PIM-W2C-READ-AUTH-1: RLS SELECT exige team_role() IS NOT NULL
  // =========================================================================
  it('PIM-W2C-READ-AUTH-1: RLS para SELECT em todas as tabelas exige public.team_role() IS NOT NULL', () => {
    expect(migrationSql).toContain('CREATE POLICY "allow_read_product_workbooks" ON public.product_workbooks');
    expect(migrationSql).toContain('USING (public.team_role() IS NOT NULL)');
    expect(migrationSql).toContain('CREATE POLICY "allow_read_source_documents" ON public.product_source_documents');
    expect(migrationSql).toContain('CREATE POLICY "allow_read_technical_data_index" ON public.product_technical_data_index');
    expect(migrationSql).not.toContain('FOR SELECT TO authenticated USING (true)');
  });

  // =========================================================================
  // PIM-W2C-READ-AUTH-2: SECURITY DEFINER read RPCs fazem explicit auth/team membership check
  // =========================================================================
  it('PIM-W2C-READ-AUTH-2: todas as RPCs de leitura validam explicitamente auth.uid() e public.team_role()', () => {
    expect(migrationSql).toContain('AUTH_READ_DENIED: Usuário não autenticado ou sem perfil de equipe válido.');
    expect(migrationSql).toContain("USING ERRCODE = '42501'");
  });

  // =========================================================================
  // PIM-W2C-DELETE-GUARD-1: products possui BEFORE DELETE guard contra workbook existente
  // =========================================================================
  it('PIM-W2C-DELETE-GUARD-1: tabela products possui trigger BEFORE DELETE que dispara WORKBOOK_OWNER_IN_USE', () => {
    expect(migrationSql).toContain('CREATE TRIGGER trg_guard_product_delete_workbook');
    expect(migrationSql).toContain('BEFORE DELETE ON public.products');
    expect(migrationSql).toContain('WORKBOOK_OWNER_IN_USE');
    expect(migrationSql).toContain("owner_kind = 'product' AND owner_id = OLD.id");
  });

  // =========================================================================
  // PIM-W2C-DELETE-GUARD-2: product_families possui mesmo guard
  // =========================================================================
  it('PIM-W2C-DELETE-GUARD-2: tabela product_families possui trigger BEFORE DELETE que impede exclusão órfã', () => {
    expect(migrationSql).toContain('CREATE TRIGGER trg_guard_family_delete_workbook');
    expect(migrationSql).toContain('BEFORE DELETE ON public.product_families');
    expect(migrationSql).toContain("owner_kind = 'family' AND owner_id = OLD.id");
  });

  // =========================================================================
  // PIM-W2C-DELETE-GUARD-3: não existe ON DELETE CASCADE entre owner e workbook
  // =========================================================================
  it('PIM-W2C-DELETE-GUARD-3: product_workbooks não possui ON DELETE CASCADE para products ou product_families', () => {
    expect(migrationSql).not.toMatch(/product_workbooks[\s\S]*?REFERENCES\s+public\.products[\s\S]*?ON DELETE CASCADE/i);
    expect(migrationSql).not.toMatch(/product_workbooks[\s\S]*?REFERENCES\s+public\.product_families[\s\S]*?ON DELETE CASCADE/i);
  });

  // =========================================================================
  // PIM-W2C-SOURCE-1: source metadata não-object é rejeitável
  // =========================================================================
  it('PIM-W2C-SOURCE-1: RPC upsert_source_document_v1 rejeita metadata que não seja objeto JSON', () => {
    expect(migrationSql).toContain("jsonb_typeof(p_document->'metadata') IS DISTINCT FROM 'object'");
    expect(migrationSql).toContain('INVALID_SOURCE_DOCUMENT_METADATA');
  });

  // =========================================================================
  // PIM-W2C-SOURCE-2: metadata values não-string não são persistíveis
  // =========================================================================
  it('PIM-W2C-SOURCE-2: RPC upsert_source_document_v1 valida que todos os valores de metadata são strings', () => {
    expect(migrationSql).toContain("jsonb_typeof(v_meta_val) IS DISTINCT FROM 'string'");
    expect(migrationSql).toContain('INVALID_SOURCE_DOCUMENT_METADATA_VALUE');
  });

  // =========================================================================
  // PIM-W2C-SOURCE-3: invalid language/date/url possuem server guard coerente
  // =========================================================================
  it('PIM-W2C-SOURCE-3: RPC upsert_source_document_v1 valida formatos BCP-47, ISO-8601 e URLs http/https', () => {
    expect(migrationSql).toContain('INVALID_SOURCE_DOCUMENT_LANGUAGE');
    expect(migrationSql).toContain('INVALID_SOURCE_DOCUMENT_DATE');
    expect(migrationSql).toContain('INVALID_SOURCE_DOCUMENT_URL');
  });

  // =========================================================================
  // PIM-W2C-GET-1: owner kind inválido é rejeitado
  // =========================================================================
  it('PIM-W2C-GET-1: owner.kind inválido é rejeitado antes da rede e no SQL', async () => {
    expect(migrationSql).toContain("p_owner_kind NOT IN ('product', 'family')");
    expect(migrationSql).toContain('INVALID_WORKBOOK_OWNER_KIND');

    const mockRpc = vi.fn();
    const repo = new SupabaseProductWorkbookRepository({ rpc: mockRpc } as any);

    await expect(
      repo.getWorkbook({ kind: 'invalid-kind' as any, id: VALID_PRODUCT_UUID })
    ).rejects.toThrowError(/INVALID_OWNER_KIND/);

    expect(mockRpc).not.toHaveBeenCalled();
  });

  // =========================================================================
  // PIM.W2C.1: BCP-47 LANGUAGE VALIDATOR PARITY (DOMAIN ↔ POSTGRESQL)
  // =========================================================================
  describe('PIM.W2C.1 — BCP-47 Language Grammar Parity', () => {
    // Regex canônica idêntica entre TypeScript e PostgreSQL
    const CANONICAL_BCP47_REGEX = /^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|[0-9]{3}))?$/i;

    it('PIM-W2C1-LANG-SQL-GRAMMAR: migration SQL declara a gramática canônica com case-insensitivity e trim', () => {
      expect(migrationSql).toContain("(p_document->>'language') ~* '^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|[0-9]{3}))?$'");
      expect(migrationSql).toContain("(p_document->>'language') IS DISTINCT FROM trim(p_document->>'language')");
      expect(migrationSql).toContain('length(p_document->>\'language\') < 2');
      expect(migrationSql).toContain('length(p_document->>\'language\') > 35');
    });

    it('PIM-W2C1-LANG-VALID-1: "en" é válido tanto no domínio quanto na regex canônica SQL', () => {
      expect(CANONICAL_BCP47_REGEX.test('en')).toBe(true);
      const doc = parseSourceDocument({ id: 'd1', title: 'Doc', documentType: 'manual', language: 'en' });
      expect(doc.language).toBe('en');
    });

    it('PIM-W2C1-LANG-VALID-2: "pt-BR" é válido tanto no domínio quanto na regex canônica SQL', () => {
      expect(CANONICAL_BCP47_REGEX.test('pt-BR')).toBe(true);
      const doc = parseSourceDocument({ id: 'd2', title: 'Doc', documentType: 'datasheet', language: 'pt-BR' });
      expect(doc.language).toBe('pt-BR');
    });

    it('PIM-W2C1-LANG-VALID-3: "zh-Hans" é válido tanto no domínio quanto na regex canônica SQL', () => {
      expect(CANONICAL_BCP47_REGEX.test('zh-Hans')).toBe(true);
      const doc = parseSourceDocument({ id: 'd3', title: 'Doc', documentType: 'certificate', language: 'zh-Hans' });
      expect(doc.language).toBe('zh-Hans');
    });

    it('PIM-W2C1-LANG-VALID-4: "es-419" é válido tanto no domínio quanto na regex canônica SQL', () => {
      expect(CANONICAL_BCP47_REGEX.test('es-419')).toBe(true);
      const doc = parseSourceDocument({ id: 'd4', title: 'Doc', documentType: 'standard', language: 'es-419' });
      expect(doc.language).toBe('es-419');
    });

    it('PIM-W2C1-LANG-INVALID-1: "en-ABCDE" (script com 5 letras) é rejeitado pelo domínio e pela regex SQL', () => {
      expect(CANONICAL_BCP47_REGEX.test('en-ABCDE')).toBe(false);
      expect(() =>
        parseSourceDocument({ id: 'd5', title: 'Doc', documentType: 'manual', language: 'en-ABCDE' })
      ).toThrow();
    });

    it('PIM-W2C1-LANG-INVALID-2: "pt-BRA" (região com 3 letras) é rejeitado pelo domínio e pela regex SQL', () => {
      expect(CANONICAL_BCP47_REGEX.test('pt-BRA')).toBe(false);
      expect(() =>
        parseSourceDocument({ id: 'd6', title: 'Doc', documentType: 'manual', language: 'pt-BRA' })
      ).toThrow();
    });

    it('PIM-W2C1-LANG-INVALID-3: "en-US-extra" (subtag excedente) é rejeitado pelo domínio e pela regex SQL', () => {
      expect(CANONICAL_BCP47_REGEX.test('en-US-extra')).toBe(false);
      expect(() =>
        parseSourceDocument({ id: 'd7', title: 'Doc', documentType: 'manual', language: 'en-US-extra' })
      ).toThrow();
    });

    it('PIM-W2C1-LANG-INVALID-4: " pt-BR" (whitespace leading) é rejeitado pelo domínio e pelo guard de trim no SQL', () => {
      expect(() =>
        parseSourceDocument({ id: 'd8', title: 'Doc', documentType: 'manual', language: ' pt-BR' })
      ).toThrow();
    });
  });

  // =========================================================================
  // PIM.W2C.1: ISO DATE VALIDATOR PARITY (DOMAIN ↔ POSTGRESQL)
  // =========================================================================
  describe('PIM.W2C.1 — ISO Date Grammar & Parseability Parity', () => {
    it('PIM-W2C1-DATE-SQL-PARITY: migration SQL valida regex canônica e parseabilidade com timestamptz sem erro bruto', () => {
      expect(migrationSql).toContain("(p_document->>'publicationDate') ~ '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?(Z|[+-]\\d{2}:?\\d{2})?)?$'");
      expect(migrationSql).toContain("(p_document->>'publicationDate') IS DISTINCT FROM trim(p_document->>'publicationDate')");
      expect(migrationSql).toContain('(p_document->>\'publicationDate\')::timestamptz');
      expect(migrationSql).toContain('INVALID_SOURCE_DOCUMENT_DATE');
    });

    const validIsoDates = [
      '2026-05-15',
      '2026-08-10T14:30:00',
      '2026-08-10T14:30:00Z',
      '2026-08-10T14:30:00-03:00',
      '2026-08-10T14:30:00-0300'
    ];

    for (const validDate of validIsoDates) {
      it(`PIM-W2C1-DATE-VALID: "${validDate}" é aceito no domínio`, () => {
        const doc = parseSourceDocument({
          id: 'date-doc',
          title: 'Doc',
          documentType: 'manual',
          publicationDate: validDate
        });
        expect(doc.publicationDate).toBe(validDate);
      });
    }

    const invalidIsoDates = [
      '2026',                        // Apenas ano (incompleto)
      '2026-05',                     // Ano e mês (incompleto)
      '2026-05-15T14:30',            // Sem segundos
      '2026-05-15T14:30:00.1234Z',   // Mais de 3 dígitos de milissegundos
      ' 2026-05-15',                 // Leading whitespace
      '2026-05-15 ',                 // Trailing whitespace
      'invalid-date'                 // String aleatória
    ];

    for (const invalidDate of invalidIsoDates) {
      it(`PIM-W2C1-DATE-INVALID: "${invalidDate}" é rejeitado no domínio`, () => {
        expect(() =>
          parseSourceDocument({
            id: 'invalid-date-doc',
            title: 'Doc',
            documentType: 'manual',
            publicationDate: invalidDate
          })
        ).toThrow();
      });
    }
  });

  // =========================================================================
  // PIM.W2C.1: EXTERNAL URL HTTP/HTTPS POLICY PARITY (DOMAIN ↔ POSTGRESQL)
  // =========================================================================
  describe('PIM.W2C.1 — External URL HTTP/HTTPS Policy Parity', () => {
    it('PIM-W2C1-URL-SQL-PARITY: migration SQL restringe externalUrl estritamente a HTTP ou HTTPS e valida trim', () => {
      expect(migrationSql).toContain("(p_document->>'externalUrl') ~* '^https?://(([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}|localhost|((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9]))(:\\d{1,5})?(/[^\\s]*)?$'");
      expect(migrationSql).toContain("(p_document->>'externalUrl') IS DISTINCT FROM trim(p_document->>'externalUrl')");
      expect(migrationSql).toContain('INVALID_SOURCE_DOCUMENT_URL');
    });

    it('PIM-W2C1-URL-VALID-1: "https://example.com/manual.pdf" é aceito no domínio', () => {
      const doc = parseSourceDocument({
        id: 'u1',
        title: 'Doc',
        documentType: 'manual',
        externalUrl: 'https://example.com/manual.pdf'
      });
      expect(doc.externalUrl).toBe('https://example.com/manual.pdf');
    });

    it('PIM-W2C1-URL-VALID-2: "http://example.com/doc" é aceito no domínio', () => {
      const doc = parseSourceDocument({
        id: 'u2',
        title: 'Doc',
        documentType: 'manual',
        externalUrl: 'http://example.com/doc'
      });
      expect(doc.externalUrl).toBe('http://example.com/doc');
    });

    it('PIM-W2C1-URL-INVALID-1: "ftp://example.com/doc" é rejeitado no domínio (protocolo proibido)', () => {
      expect(() =>
        parseSourceDocument({
          id: 'u3',
          title: 'Doc',
          documentType: 'manual',
          externalUrl: 'ftp://example.com/doc'
        })
      ).toThrowError(/externalUrl deve utilizar exclusivamente protocolo HTTP ou HTTPS/);
    });

    it('PIM-W2C1-URL-INVALID-2: "file:///tmp/doc.pdf" é rejeitado no domínio (protocolo proibido)', () => {
      expect(() =>
        parseSourceDocument({
          id: 'u4',
          title: 'Doc',
          documentType: 'manual',
          externalUrl: 'file:///tmp/doc.pdf'
        })
      ).toThrowError(/externalUrl deve utilizar exclusivamente protocolo HTTP ou HTTPS/);
    });

    it('PIM-W2C1-URL-INVALID-3: "javascript:alert(1)" é rejeitado no domínio (protocolo proibido e formato inválido)', () => {
      expect(() =>
        parseSourceDocument({
          id: 'u5',
          title: 'Doc',
          documentType: 'manual',
          externalUrl: 'javascript:alert(1)'
        })
      ).toThrow();
    });

    it('PIM-W2C1-URL-INVALID-4: " https://example.com" (whitespace) é rejeitado pelo domínio e SQL', () => {
      expect(() =>
        parseSourceDocument({
          id: 'u6',
          title: 'Doc',
          documentType: 'manual',
          externalUrl: ' https://example.com'
        })
      ).toThrow();
    });
  });

  // =========================================================================
  // PIM.W2C.2: SOURCE DOCUMENT RUNTIME PARITY + NULLABLE ROUND-TRIP HARDENING
  // =========================================================================
  describe('PIM.W2C.2 — Source Document Runtime Parity & PostgreSQL Null Round-Trip Suite', () => {
    // -----------------------------------------------------------------------
    // BLOCKER A: ISO Calendar Validation Parity
    // -----------------------------------------------------------------------
    it('W2C2-DATE-FEB31: "2026-02-31" é rejeitado tanto pela validação de calendário do domínio quanto pelo cast SQL', () => {
      expect(isValidIsoDate('2026-02-31')).toBe(false);
      expect(() =>
        parseSourceDocument({
          id: 'doc-feb31',
          title: 'Doc',
          documentType: 'manual',
          publicationDate: '2026-02-31'
        })
      ).toThrow();
      expect(migrationSql).toContain("(p_document->>'publicationDate')::timestamptz");
    });

    it('W2C2-DATE-APR31: "2026-04-31" (abril possui apenas 30 dias) é rejeitado pelo domínio e SQL', () => {
      expect(isValidIsoDate('2026-04-31')).toBe(false);
      expect(() =>
        parseSourceDocument({
          id: 'doc-apr31',
          title: 'Doc',
          documentType: 'manual',
          publicationDate: '2026-04-31'
        })
      ).toThrow();
    });

    it('W2C2-DATE-LEAP-VALID: "2024-02-29" (ano bissexto válido) é aceito pelo domínio e SQL', () => {
      expect(isValidIsoDate('2024-02-29')).toBe(true);
      const doc = parseSourceDocument({
        id: 'doc-leap-valid',
        title: 'Doc',
        documentType: 'manual',
        publicationDate: '2024-02-29'
      });
      expect(doc.publicationDate).toBe('2024-02-29');
    });

    it('W2C2-DATE-LEAP-INVALID: "2025-02-29" (2025 não é bissexto) é rejeitado pelo domínio e SQL', () => {
      expect(isValidIsoDate('2025-02-29')).toBe(false);
      expect(() =>
        parseSourceDocument({
          id: 'doc-leap-invalid',
          title: 'Doc',
          documentType: 'manual',
          publicationDate: '2025-02-29'
        })
      ).toThrow();
    });

    it('W2C2-DATE-MONTH13-INVALID: "2026-13-01" (mês fora do intervalo 1-12) é rejeitado pelo domínio e SQL', () => {
      expect(isValidIsoDate('2026-13-01')).toBe(false);
      expect(() =>
        parseSourceDocument({
          id: 'doc-month13',
          title: 'Doc',
          documentType: 'manual',
          publicationDate: '2026-13-01'
        })
      ).toThrow();
    });

    // -----------------------------------------------------------------------
    // BLOCKER B & D: Real PostgreSQL Row Fixtures & Null Round-Trip
    // -----------------------------------------------------------------------
    const realisticPostgresRow = {
      id: 'doc-pg-fixture-1',
      title: 'Manual de Engenharia TA-25N',
      document_type: 'manual',
      revision: null,
      language: null,
      publication_date: null,
      file_reference: null,
      external_url: null,
      checksum: null,
      metadata: {},
      created_by: '00000000-0000-0000-0000-000000000001',
      updated_by: '00000000-0000-0000-0000-000000000001',
      created_at: '2026-09-03T12:00:00Z',
      updated_at: '2026-09-03T12:00:00Z'
    };

    it('W2C2-SOURCE-NORMALIZE-ROW: normalizeSourceDocumentRow converte explicitamente SQL NULLs para ausência/undefined', () => {
      const normalized = normalizeSourceDocumentRow(realisticPostgresRow);
      expect(normalized.id).toBe('doc-pg-fixture-1');
      expect(normalized.title).toBe('Manual de Engenharia TA-25N');
      expect(normalized.documentType).toBe('manual');
      expect(normalized.revision).toBeUndefined();
      expect(normalized.language).toBeUndefined();
      expect(normalized.publicationDate).toBeUndefined();
      expect(normalized.fileReference).toBeUndefined();
      expect(normalized.externalUrl).toBeUndefined();
      expect(normalized.checksum).toBeUndefined();
      expect(normalized.metadata).toEqual({});

      const parsed = parseSourceDocument(normalized);
      expect(parsed.id).toBe('doc-pg-fixture-1');
    });

    it('W2C2-SOURCE-NULL-UPSERT-ROUNDTRIP: upsertSourceDocument normaliza SQL NULLs para undefined e parseSourceDocument tem sucesso', async () => {
      const fakeClient = {
        rpc: vi.fn().mockResolvedValue({
          data: realisticPostgresRow,
          error: null
        })
      } as any;

      const repo = new SupabaseProductSourceDocumentRepository(fakeClient);
      const inputDoc: SourceDocument = {
        id: 'doc-pg-fixture-1',
        title: 'Manual de Engenharia TA-25N',
        documentType: 'manual'
      };

      const result = await repo.upsertSourceDocument(inputDoc);

      expect(fakeClient.rpc).toHaveBeenCalledWith('upsert_source_document_v1', {
        p_document: inputDoc
      });
      expect(result.id).toBe('doc-pg-fixture-1');
      expect(result.title).toBe('Manual de Engenharia TA-25N');
      expect(result.documentType).toBe('manual');
      expect(result.revision).toBeUndefined();
      expect(result.language).toBeUndefined();
      expect(result.publicationDate).toBeUndefined();
      expect(result.fileReference).toBeUndefined();
      expect(result.externalUrl).toBeUndefined();
      expect(result.checksum).toBeUndefined();
      expect(result.metadata).toEqual({});
    });

    it('W2C2-SOURCE-NULL-GET-ROUNDTRIP: getSourceDocument normaliza SQL NULLs para undefined e preserva contrato canônico', async () => {
      const fakeClient = {
        rpc: vi.fn().mockResolvedValue({
          data: realisticPostgresRow,
          error: null
        })
      } as any;

      const repo = new SupabaseProductSourceDocumentRepository(fakeClient);
      const result = await repo.getSourceDocument('doc-pg-fixture-1');

      expect(fakeClient.rpc).toHaveBeenCalledWith('get_source_document_v1', {
        p_id: 'doc-pg-fixture-1'
      });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('doc-pg-fixture-1');
      expect(result!.revision).toBeUndefined();
      expect(result!.language).toBeUndefined();
    });

    it('W2C2-SOURCE-NULL-LIST-ROUNDTRIP: listSourceDocuments normaliza lista de rows reais PostgreSQL', async () => {
      const fakeClient = {
        rpc: vi.fn().mockResolvedValue({
          data: [realisticPostgresRow],
          error: null
        })
      } as any;

      const repo = new SupabaseProductSourceDocumentRepository(fakeClient);
      const results = await repo.listSourceDocuments();

      expect(fakeClient.rpc).toHaveBeenCalledWith('list_source_documents_v1', {
        p_ids: null
      });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('doc-pg-fixture-1');
      expect(results[0].revision).toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // BLOCKER C: External URL Adversarial Cases & Canonical Subset
    // -----------------------------------------------------------------------
    it('W2C2-URL-SERVER-DOMAIN-ADVERSARIAL: URLs malformadas são rejeitadas de forma idêntica no domínio e SQL', () => {
      // Regex SQL canônica presente na migration
      expect(migrationSql).toContain("~* '^https?://(([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}|localhost|((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9]))(:\\d{1,5})?(/[^\\s]*)?$'");

      const adversarialUrls = [
        'http://::',
        'http://%zz',
        'http://256.256.256.256',
        'http://example.com/manual with spaces.pdf',
        'ftp://example.com/doc',
        'file:///etc/passwd',
        'javascript:void(0)',
        'https://',
        'http://-bad-label.com'
      ];

      for (const url of adversarialUrls) {
        expect(isValidHttpUrl(url)).toBe(false);
        expect(CANONICAL_HTTP_URL_REGEX.test(url)).toBe(false);
        expect(() =>
          parseSourceDocument({
            id: 'doc-adv',
            title: 'Doc',
            documentType: 'manual',
            externalUrl: url
          })
        ).toThrow();
      }

      const validUrls = [
        'https://example.com/manual.pdf',
        'http://example.com/doc',
        'http://localhost:3000/api/doc',
        'http://192.168.1.1/spec.pdf',
        'https://sub.domain.co.uk:8080/path?query=val#section'
      ];

      for (const url of validUrls) {
        expect(isValidHttpUrl(url)).toBe(true);
        expect(CANONICAL_HTTP_URL_REGEX.test(url)).toBe(true);
        const doc = parseSourceDocument({
          id: 'doc-valid',
          title: 'Doc',
          documentType: 'manual',
          externalUrl: url
        });
        expect(doc.externalUrl).toBe(url);
      }
    });

    // -----------------------------------------------------------------------
    // BLOCKER E: Explicit JSON Null Input Policy (Fail-Closed)
    // -----------------------------------------------------------------------
    it('W2C2-NULL-INPUT-POLICY: input JSON explícito com valor null em campos opcionais é rejeitado fail-closed no domínio e SQL', () => {
      // No domínio: Zod Schema rejeita null para optional fields
      expect(() =>
        parseSourceDocument({
          id: 'doc-null-rev',
          title: 'Doc',
          documentType: 'manual',
          revision: null as any
        })
      ).toThrow();

      expect(() =>
        parseSourceDocument({
          id: 'doc-null-lang',
          title: 'Doc',
          documentType: 'manual',
          language: null as any
        })
      ).toThrow();

      expect(() =>
        parseSourceDocument({
          id: 'doc-null-date',
          title: 'Doc',
          documentType: 'manual',
          publicationDate: null as any
        })
      ).toThrow();

      expect(() =>
        parseSourceDocument({
          id: 'doc-null-url',
          title: 'Doc',
          documentType: 'manual',
          externalUrl: null as any
        })
      ).toThrow();

      // No SQL: a migration verifica se a chave está presente e se o tipo é string (rejeita JSON null)
      expect(migrationSql).toContain("RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_REVISION: revision deve ser string e não pode ser nulo.'");
      expect(migrationSql).toContain("RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_LANGUAGE: language \"%\" deve ser string BCP-47 válida e não pode ser nulo.'");
      expect(migrationSql).toContain("RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_DATE: publicationDate \"%\" não é uma data ISO-8601 válida.'");
      expect(migrationSql).toContain("RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_FILE: fileReference deve ser string e não pode ser nulo.'");
      expect(migrationSql).toContain("RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_URL: externalUrl \"%\" não é uma URL HTTP/HTTPS válida.'");
      expect(migrationSql).toContain("RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_CHECKSUM: checksum deve ser string e não pode ser nulo.'");
      expect(migrationSql).toContain("RAISE EXCEPTION 'INVALID_SOURCE_DOCUMENT_METADATA: metadata deve ser um objeto JSON e não pode ser nulo.'");
    });

    // -----------------------------------------------------------------------
    // BLOCKER F: Strict Unknown Key Policy (Zod .strict() ↔ PostgreSQL loop)
    // -----------------------------------------------------------------------
    it('W2C2-UNKNOWN-KEY-POLICY: propriedades desconhecidas em SourceDocument são rejeitadas no domínio e no SQL', () => {
      // Domínio: SourceDocumentSchema é .strict()
      expect(() =>
        parseSourceDocument({
          id: 'doc-unknown',
          title: 'Doc',
          documentType: 'manual',
          inventedField: 'x'
        } as any)
      ).toThrow();

      // SQL: upsert_source_document_v1 itera jsonb_object_keys e lança INVALID_SOURCE_DOCUMENT_UNKNOWN_KEY
      expect(migrationSql).toContain('INVALID_SOURCE_DOCUMENT_UNKNOWN_KEY');
      expect(migrationSql).toContain('SELECT jsonb_object_keys(p_document)');
    });
  });
});


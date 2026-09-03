// tests/services/product-workbook-persistence-contract.test.ts
// Testes de contrato estático e repositório de persistência do Product Workbook (PIM.W2A)

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  createWorkbook,
  addModule,
  addDatum
} from '../../src/domain/product-workbook';
import {
  SupabaseProductWorkbookRepository
} from '../../src/services/product-workbook';

describe('PIM.W2A — Product Workbook Persistence Contract & Repository Suite', () => {
  // =========================================================================
  // CONTRACT-MIGRATION-1: Análise estática do arquivo de migração 00022
  // =========================================================================
  it('CONTRACT-MIGRATION-1: O arquivo 00022 define tabelas, RLS, CAS e auditoria conforme blueprint', () => {
    const migrationPath = path.resolve(__dirname, '../../supabase/migrations/00022_product_workbook_persistence.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sql = fs.readFileSync(migrationPath, 'utf-8');

    // Tabelas fundamentais
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.product_workbooks');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.product_source_documents');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.product_technical_data_index');

    // Constraints de ownership
    expect(sql).toContain("CHECK (owner_kind IN ('product', 'family'))");
    expect(sql).toContain('CONSTRAINT product_workbooks_owner_unique UNIQUE (owner_kind, owner_id)');

    // CAS com revision e SQLSTATE 40001
    expect(sql).toContain('p_expected_revision');
    expect(sql).toContain("ERRCODE = '40001'");
    expect(sql).toContain('WORKBOOK_CONFLICT');

    // Segurança editorial centralizada
    expect(sql).toContain('public.require_document_editor_v1()');

    // Trilha de auditoria imutável
    expect(sql).toContain('INSERT INTO public.library_change_events');
    expect(sql).toContain("'SAVE_WORKBOOK'");

    // Publicação Realtime
    expect(sql).toContain("pubname = 'supabase_realtime'");
    expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.product_workbooks');
    expect(sql).toContain('REPLICA IDENTITY FULL');
  });

  // =========================================================================
  // REPO-GET-1: Deserialização com validação no getWorkbook
  // =========================================================================
  it('REPO-GET-1: getWorkbook deserializa payload com sucesso e retorna nulo para registros inexistentes', async () => {
    let sampleWb = createWorkbook({ owner: { kind: 'product', id: 'prod-pers-1' } });
    sampleWb = addModule(sampleWb, { id: 'm1', semanticKey: 'spec.mod', label: 'Mod', kind: 'key_value', order: 1 });
    sampleWb = addDatum(
      sampleWb,
      {
        semanticKey: 'spec.mod.d1',
        moduleId: 'm1',
        label: 'Dado 1',
        value: { type: 'text', value: 'V1' },
        evidence: [],
        status: 'approved'
      },
      'd1'
    );

    const mockRpc = vi.fn().mockImplementation((_fnName: string, args: { p_owner_kind: string; p_owner_id: string }) => {
      if (args.p_owner_id === 'prod-pers-1') {
        return Promise.resolve({ data: sampleWb, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const fakeClient = { rpc: mockRpc } as any;
    const repo = new SupabaseProductWorkbookRepository(fakeClient);

    // Existente
    const loaded = await repo.getWorkbook({ kind: 'product', id: 'prod-pers-1' });
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(sampleWb.id);
    expect(loaded?.data['d1']?.label).toBe('Dado 1');

    // Inexistente
    const notFound = await repo.getWorkbook({ kind: 'product', id: 'prod-not-found' });
    expect(notFound).toBeNull();
  });

  // =========================================================================
  // REPO-SAVE-FAIL-CLOSED: Validação de invariantes antes da chamada de rede
  // =========================================================================
  it('REPO-SAVE-FAIL-CLOSED: saveWorkbook rejeita workbook inválido antes de chamar RPC', async () => {
    const mockRpc = vi.fn();
    const fakeClient = { rpc: mockRpc } as any;
    const repo = new SupabaseProductWorkbookRepository(fakeClient);

    // Cria um workbook com chave adulterada violando invariante DATA_KEY_ID_MISMATCH
    let wb = createWorkbook({ owner: { kind: 'product', id: 'prod-inv' } });
    wb = addModule(wb, { id: 'm1', semanticKey: 'spec.mod', label: 'Mod', kind: 'key_value', order: 1 });
    wb = addDatum(
      wb,
      {
        semanticKey: 'spec.mod.d1',
        moduleId: 'm1',
        label: 'Dado',
        value: { type: 'text', value: 'V' },
        evidence: [],
        status: 'draft'
      },
      'd1'
    );

    // Adultera propositalmente
    const adulterated = {
      ...wb,
      data: {
        'wrong-key': wb.data['d1']
      }
    };

    await expect(
      repo.saveWorkbook({
        workbook: adulterated as any,
        expectedRevision: 1
      })
    ).rejects.toThrowError(/WORKBOOK_VALIDATION_FAILED/);

    // RPC NUNCA deve ter sido chamado devido ao fail-closed local
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // =========================================================================
  // REPO-SAVE-CAS-CONFLICT: Identificação e empacotamento de erro 40001
  // =========================================================================
  it('REPO-SAVE-CAS-CONFLICT: saveWorkbook traduz erro 40001 em WorkbookConflictError estruturado', async () => {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'prod-cas' } });
    wb = addModule(wb, { id: 'm1', semanticKey: 'spec.mod', label: 'Mod', kind: 'key_value', order: 1 });

    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '40001',
        message: 'WORKBOOK_CONFLICT: Conflito de concorrência no workbook (Esperado: 1, Atual: 3).'
      }
    });

    const fakeClient = { rpc: mockRpc } as any;
    const repo = new SupabaseProductWorkbookRepository(fakeClient);

    try {
      await repo.saveWorkbook({
        workbook: wb,
        expectedRevision: 1
      });
      expect.fail('Deveria ter disparado WorkbookConflictError');
    } catch (err: any) {
      expect(err.code).toBe('WORKBOOK_CONFLICT');
      expect(err.expectedRevision).toBe(1);
      expect(err.message).toContain('Conflito de concorrência');
    }
  });

  // =========================================================================
  // REPO-SAVE-SUCCESS: Incremento atômico de revisão
  // =========================================================================
  it('REPO-SAVE-SUCCESS: saveWorkbook grava com sucesso e retorna revisão incrementada', async () => {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'prod-ok' } });
    wb = addModule(wb, { id: 'm1', semanticKey: 'spec.mod', label: 'Mod', kind: 'key_value', order: 1 });

    const savedPayload = {
      ...wb,
      revision: wb.revision + 1
    };

    const mockRpc = vi.fn().mockResolvedValue({
      data: savedPayload,
      error: null
    });

    const fakeClient = { rpc: mockRpc } as any;
    const repo = new SupabaseProductWorkbookRepository(fakeClient);

    const result = await repo.saveWorkbook({
      workbook: wb,
      expectedRevision: 1
    });

    expect(result.success).toBe(true);
    expect(result.revision).toBe(2);
    expect(result.workbook.revision).toBe(2);
  });
});

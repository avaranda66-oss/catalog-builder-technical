// tests/services/product-workbook-v2-persistence-contract.test.ts
// Contract tests for Migration 00023, save_product_workbook_v2, and V1/V2 RPC dispatching.

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  createWorkbook,
  ensureWorkbookV2
} from '../../src/domain/product-workbook';
import {
  SupabaseProductWorkbookRepository
} from '../../src/services/product-workbook';

const VALID_PRODUCT_UUID = '11111111-1111-4111-8111-111111111111';

describe('PIM Core V1 — Migration 00023 & V2 Persistence Contract', () => {
  const migration23Path = path.resolve(__dirname, '../../supabase/migrations/00023_product_dataset_search_index.sql');
  const migration23Sql = fs.readFileSync(migration23Path, 'utf-8');

  it('MIGRATION-23-1: migration 00023 define product_dataset_search_index com RLS e integridade', () => {
    expect(migration23Sql).toContain('CREATE TABLE IF NOT EXISTS public.product_dataset_search_index');
    expect(migration23Sql).toContain('workbook_id UUID NOT NULL REFERENCES public.product_workbooks(id) ON DELETE CASCADE');
    expect(migration23Sql).toContain('ALTER TABLE public.product_dataset_search_index ENABLE ROW LEVEL SECURITY');
    expect(migration23Sql).toContain('REVOKE INSERT, UPDATE, DELETE ON public.product_dataset_search_index FROM PUBLIC, anon, authenticated');
    expect(migration23Sql).toContain('public.team_role() IS NOT NULL');
  });

  it('MIGRATION-23-2: migration 00023 define save_product_workbook_v2 com schemaVersion 2 estrito e CAS', () => {
    expect(migration23Sql).toContain('CREATE OR REPLACE FUNCTION public.save_product_workbook_v2');
    expect(migration23Sql).toContain('schemaVersion deve ser o inteiro 2 para a API v2');
    expect(migration23Sql).toContain('CAS_REVISION_REQUIRED');
    expect(migration23Sql).toContain('WORKBOOK_CONFLICT');
    expect(migration23Sql).toContain('public.product_dataset_search_index');
    expect(migration23Sql).toContain('library_change_events');
  });

  it('MIGRATION-23-3: migration 00023 define get_product_workbook_v2 com upgrade transparente de V1 na leitura', () => {
    expect(migration23Sql).toContain('CREATE OR REPLACE FUNCTION public.get_product_workbook_v2');
    expect(migration23Sql).toContain('AUTH_REQUIRED');
    expect(migration23Sql).toContain("v_payload->>'schemaVersion') = '1'");
  });

  it('REPO-V2-ROUTING: saveWorkbook despacha para save_product_workbook_v2 quando schemaVersion = 2', async () => {
    const fakeRpc = vi.fn().mockImplementation((name, args) => {
      if (name === 'save_product_workbook_v2') {
        return Promise.resolve({
          data: {
            ...args.p_workbook,
            revision: args.p_expected_revision + 1
          },
          error: null
        });
      }
      return Promise.resolve({ data: null, error: new Error('Wrong RPC') });
    });

    const fakeClient = { rpc: fakeRpc } as any;
    const repo = new SupabaseProductWorkbookRepository(fakeClient);

    const baseWb = createWorkbook({ owner: { kind: 'product', id: VALID_PRODUCT_UUID }, revision: 0 });
    const wbV2 = ensureWorkbookV2(baseWb);

    const result = await repo.saveWorkbook({
      workbook: wbV2,
      expectedRevision: 0
    });

    expect(fakeRpc).toHaveBeenCalledTimes(1);
    expect(fakeRpc).toHaveBeenCalledWith('save_product_workbook_v2', {
      p_workbook: wbV2,
      p_expected_revision: 0
    });
    expect(result.success).toBe(true);
    expect(result.revision).toBe(1);
  });

  it('REPO-V1-ROUTING: saveWorkbook despacha para save_product_workbook_v1 quando schemaVersion = 1', async () => {
    const fakeRpc = vi.fn().mockImplementation((name, args) => {
      if (name === 'save_product_workbook_v1') {
        return Promise.resolve({
          data: {
            ...args.p_workbook,
            revision: args.p_expected_revision + 1
          },
          error: null
        });
      }
      return Promise.resolve({ data: null, error: new Error('Wrong RPC') });
    });

    const fakeClient = { rpc: fakeRpc } as any;
    const repo = new SupabaseProductWorkbookRepository(fakeClient);

    const wbV1 = createWorkbook({ owner: { kind: 'product', id: VALID_PRODUCT_UUID }, revision: 0 });
    expect(wbV1.schemaVersion).toBe(1);

    const result = await repo.saveWorkbook({
      workbook: wbV1,
      expectedRevision: 0
    });

    expect(fakeRpc).toHaveBeenCalledTimes(1);
    expect(fakeRpc).toHaveBeenCalledWith('save_product_workbook_v1', {
      p_workbook: wbV1,
      p_expected_revision: 0
    });
    expect(result.success).toBe(true);
    expect(result.revision).toBe(1);
  });

  it('REPO-GET-FALLBACK: getWorkbook tenta v2 e faz fallback gracioso para v1 se v2 ainda não existir', async () => {
    const fakeRpc = vi.fn().mockImplementation((name) => {
      if (name === 'get_product_workbook_v2') {
        return Promise.resolve({
          data: null,
          error: { code: '42883', message: 'function public.get_product_workbook_v2 does not exist' }
        });
      }
      if (name === 'get_product_workbook_v1') {
        return Promise.resolve({
          data: {
            id: 'wbk_v1_legacy',
            schemaVersion: 1,
            owner: { kind: 'product', id: VALID_PRODUCT_UUID },
            revision: 2,
            modules: [],
            data: {}
          },
          error: null
        });
      }
      return Promise.resolve({ data: null, error: new Error('Unknown RPC') });
    });

    const fakeClient = { rpc: fakeRpc } as any;
    const repo = new SupabaseProductWorkbookRepository(fakeClient);

    const wb = await repo.getWorkbook({ kind: 'product', id: VALID_PRODUCT_UUID });
    expect(wb).not.toBeNull();
    expect(wb?.id).toBe('wbk_v1_legacy');
    expect(fakeRpc).toHaveBeenCalledWith('get_product_workbook_v2', expect.any(Object));
    expect(fakeRpc).toHaveBeenCalledWith('get_product_workbook_v1', expect.any(Object));
  });
});

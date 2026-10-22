import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('FR-04 migração aditiva de restauração', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00030_vnext_catalog_unarchive.sql'), 'utf8');
  const restoreStart = sql.indexOf('CREATE FUNCTION public.unarchive_vnext_catalog_cas_v1(');
  const restore = sql.slice(restoreStart, sql.indexOf('$$;', restoreStart) + 3);
  const listStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.list_vnext_catalogs_v1(');
  const list = sql.slice(listStart, sql.indexOf('$$;', listStart) + 3);

  it('amplia somente as operações permitidas sem alterar o histórico ou RPCs de escrita existentes', () => {
    expect(sql).toContain("CHECK (operation IN ('create', 'save', 'archive', 'unarchive'))");
    expect(sql).not.toMatch(/(?:UPDATE|DELETE FROM) public\.vnext_catalog_revisions/);
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toMatch(/CREATE (?:OR REPLACE )?FUNCTION public\.(?:archive|save|create)_vnext_catalog/);
    expect(sql).toMatch(/BEGIN;[\s\S]+COMMIT;/);
  });

  it('exige autorização de editor, UUIDs canônicos e acesso autenticado', () => {
    expect(restoreStart).toBeGreaterThanOrEqual(0);
    expect(restore).toContain('public.require_document_editor_v1()');
    expect(restore).toContain("public.vnext_require_canonical_uuid_text_v1(p_catalog_id, 'catalogId')");
    expect(restore).toContain("public.vnext_require_canonical_uuid_text_v1(p_mutation_id, 'mutationId')");
    expect(restore).toContain('SECURITY DEFINER');
    expect(restore).toContain('SET search_path = pg_catalog, public');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.unarchive_vnext_catalog_cas_v1\(TEXT, BIGINT, TEXT\)\s+FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.unarchive_vnext_catalog_cas_v1\(TEXT, BIGINT, TEXT\)\s+TO authenticated/);
  });

  it('usa bloqueio e CAS sem sobrescrever identidade, origem ou snapshot', () => {
    expect(restore).toContain('FOR UPDATE;');
    expect(restore).toContain('p_expected_remote_revision < 1');
    expect(restore).toContain('IF v_current.archived_at IS NULL THEN');
    expect(restore).toContain('v_current.remote_revision <> p_expected_remote_revision');
    expect(restore).toContain('v_current.remote_revision + 1');
    expect(restore).toContain('archived_at = NULL');
    expect(restore).not.toMatch(/(?:document_snapshot|origin_kind|origin_id|origin_revision|created_at)\s*=/);
    expect(restore).toContain('updated_by = v_actor');
    expect(restore).toContain("v_mutation_id, 'unarchive', p_expected_remote_revision");
  });

  it('permite apenas replay idêntico da revisão mais recente antes de validar estado e revisão', () => {
    expect(restore).toContain('WHERE catalog_id = v_catalog_id AND mutation_id = v_mutation_id');
    expect(restore).toContain('v_replay.revision <> v_current.remote_revision');
    expect(restore).toContain("v_replay.operation <> 'unarchive'");
    expect(restore).toContain('v_replay.expected_remote_revision IS DISTINCT FROM p_expected_remote_revision');
    expect(restore).toContain('VNEXT_MUTATION_REUSE');
    expect(restore).toContain('VNEXT_MUTATION_REPLAY_STALE');
    expect(restore.indexOf('IF FOUND THEN')).toBeLessThan(restore.indexOf('IF v_current.archived_at IS NULL THEN'));
  });

  it('mantém a listagem leve e autorizada e acrescenta o nome por perfil sem expor dados de autenticação', () => {
    expect(listStart).toBeGreaterThanOrEqual(0);
    expect(list).toContain('PERFORM public.vnext_require_reader_v1()');
    expect(list).toContain('public.vnext_catalog_list_item_v1(c)');
    expect(list).toContain("jsonb_build_object('updatedByName', NULLIF(btrim(p.full_name), ''))");
    expect(list).toContain('LEFT JOIN public.profiles p ON p.id = c.updated_by');
    expect(list).toContain('WHERE p_include_archived OR c.archived_at IS NULL');
    expect(list).not.toMatch(/auth\.users|raw_user_meta_data|document_snapshot/);
  });
});

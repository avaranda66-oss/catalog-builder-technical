import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARSENAL_CATEGORIES,
  ARSENAL_KIND_CATEGORIES,
  ARSENAL_LIMITS,
  ARSENAL_PRESET_KINDS,
  ArsenalPresetSummarySchema,
} from '../../../src/vnext/arsenal/contracts';
import {
  ARSENAL_RPC,
  ARSENAL_SERVER_ERROR_PREFIXES,
  arsenalErrorCodeFromServerMessage,
} from '../../../src/vnext/arsenal/repository';

// core.autocrlf=true checks the file out with CRLF on Windows; compare with LF everywhere.
const sql = fs
  .readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00031_vnext_arsenal_presets.sql'), 'utf8')
  .replace(/\r\n/g, '\n');

function fn(name: string): string {
  const start = sql.indexOf(`CREATE FUNCTION public.${name}(`);
  expect(start, `${name} is created`).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf('$$;', start) + 3);
}

function quotedList(text: string): string[] {
  return [...text.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe('migração 00031 — arsenal da equipe', () => {
  it('é aditiva e transacional: não mexe em catálogos, assets nem RPCs existentes', () => {
    expect(sql).toMatch(/^[\s\S]*BEGIN;[\s\S]+COMMIT;\s*$/);
    expect(sql).not.toMatch(/DROP (?:TABLE|FUNCTION|POLICY)/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION/);
    expect(sql).not.toMatch(/ALTER TABLE public\.(?!vnext_preset)/);
    expect(sql).not.toMatch(/(?:UPDATE|INSERT INTO|DELETE FROM) public\.(?:vnext_catalogs|vnext_assets|profiles)/);
  });

  it('cria cada RPC do contrato como SECURITY DEFINER, com search_path fixo e só para authenticated', () => {
    for (const name of Object.values(ARSENAL_RPC)) {
      const body = fn(name);
      expect(body).toContain('SECURITY DEFINER');
      expect(body).toContain('SET search_path = pg_catalog, public');
      expect(body).toContain('public.require_document_editor_v1()');
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO authenticated;`));
    }
    for (const helper of ['vnext_preset_terms_valid_v1', 'vnext_preset_require_uuid_v1', 'vnext_validate_preset_input_v1', 'vnext_preset_envelope_v1']) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${helper}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated;`));
      expect(sql).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${helper}\\(`));
    }
  });

  it('RLS: ler admin/editor ativos; criar como autor; alterar e apagar só autor ou admin; escrita só por RPC', () => {
    expect(sql).toContain('ALTER TABLE public.vnext_presets ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE public.vnext_preset_usage ENABLE ROW LEVEL SECURITY;');
    const policy = (name: string) => {
      const start = sql.indexOf(`CREATE POLICY ${name}`);
      expect(start, name).toBeGreaterThanOrEqual(0);
      return sql.slice(start, sql.indexOf(';', start));
    };
    expect(policy('vnext_presets_editor_read')).toMatch(/FOR SELECT TO authenticated[\s\S]+team_role\(\) IN \('admin', 'editor'\)[\s\S]+deleted_at IS NULL/);
    expect(policy('vnext_presets_editor_insert')).toMatch(/FOR INSERT[\s\S]+team_role\(\) IN \('admin', 'editor'\)[\s\S]+created_by = auth\.uid\(\)/);
    for (const name of ['vnext_presets_author_or_admin_update', 'vnext_presets_author_or_admin_delete']) {
      expect(policy(name)).toMatch(/team_role\(\) = 'admin'\s+OR \(public\.team_role\(\) = 'editor' AND created_by = auth\.uid\(\)\)/);
    }
    expect(policy('vnext_preset_usage_editor_read')).toContain("team_role() IN ('admin', 'editor')");
    expect(sql).toContain('REVOKE ALL ON TABLE public.vnext_presets FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT SELECT ON TABLE public.vnext_presets TO authenticated;');
    expect(sql).not.toMatch(/GRANT (?:ALL|INSERT|UPDATE|DELETE)[^;]*ON TABLE public\.vnext_preset/);
  });

  it('tipos, categorias e a tabela tipo × categoria são os mesmos do cliente', () => {
    const kinds = /kind TEXT NOT NULL CHECK \(kind IN \(([^)]*)\)\)/.exec(sql)?.[1] ?? '';
    expect(quotedList(kinds)).toEqual([...ARSENAL_PRESET_KINDS]);
    const categories = /category TEXT NOT NULL CHECK \(category IN \(([^)]*)\)\)/.exec(sql)?.[1] ?? '';
    expect(quotedList(categories)).toEqual([...ARSENAL_CATEGORIES]);
    const matrix = sql.slice(sql.indexOf('CONSTRAINT vnext_presets_kind_category_check'), sql.indexOf('CONSTRAINT vnext_presets_payload_kind_check'));
    for (const kind of ARSENAL_PRESET_KINDS) {
      const clause = new RegExp(`\\(kind = '${kind}' AND category (?:IN \\(([^)]*)\\)|= '([^']+)')\\)`).exec(matrix);
      expect(clause, kind).not.toBeNull();
      const allowed = clause![1] ? quotedList(clause![1]) : [clause![2]];
      expect(allowed).toEqual([...ARSENAL_KIND_CATEGORIES[kind]]);
    }
    const validator = fn('vnext_validate_preset_input_v1');
    for (const kind of ARSENAL_PRESET_KINDS) {
      expect(validator).toContain(`(v_kind = '${kind}' AND v_category ${ARSENAL_KIND_CATEGORIES[kind].length === 1 ? '=' : 'IN'}`);
    }
  });

  it('limites do banco batem com ARSENAL_LIMITS', () => {
    expect(sql).toContain(`length(name) BETWEEN 1 AND ${ARSENAL_LIMITS.nameMaxChars}`);
    expect(sql).toContain(`length(description) BETWEEN 1 AND ${ARSENAL_LIMITS.descriptionMaxChars}`);
    expect(sql).toContain(`vnext_preset_terms_valid_v1(tags, ${ARSENAL_LIMITS.tagsMax}, ${ARSENAL_LIMITS.tagMaxChars})`);
    expect(sql).toContain(`vnext_preset_terms_valid_v1(synonyms, ${ARSENAL_LIMITS.synonymsMax}, ${ARSENAL_LIMITS.synonymMaxChars})`);
    expect(sql).toContain(`payload_bytes BETWEEN 2 AND ${ARSENAL_LIMITS.serverPayloadMaxBytes}`);
    expect(fn('vnext_validate_preset_input_v1')).toContain(`v_bytes > ${ARSENAL_LIMITS.serverPayloadMaxBytes}`);
    expect(fn('get_vnext_presets_v1')).toContain(`cardinality(p_preset_ids) > ${ARSENAL_LIMITS.getManyMax}`);
    expect(ARSENAL_LIMITS.payloadMaxBytes).toBeLessThan(ARSENAL_LIMITS.serverPayloadMaxBytes);
    expect(sql).toContain('CHECK (payload_schema_version = 1)');
  });

  it('o envelope devolve exatamente as chaves do resumo do cliente', () => {
    const envelope = fn('vnext_preset_envelope_v1');
    const keys = [...envelope.matchAll(/^\s+'([a-zA-Z]+)', /gm)].map((match) => match[1]);
    const optional = ['description', 'payload'];
    for (const key of optional) expect(envelope).toContain(`jsonb_build_object('${key}', p_preset.${key})`);
    const clientKeys = Object.keys(ArsenalPresetSummarySchema.innerType().shape);
    expect([...keys, 'description'].sort()).toEqual(clientKeys.sort());
    expect(envelope).not.toMatch(/last_mutation_id|deleted_|auth\.users/);
  });

  it('create é idempotente pela mutação e só o replay idêntico devolve o preset', () => {
    const create = fn('create_vnext_preset_v1');
    expect(create).toContain('PERFORM public.vnext_validate_preset_input_v1(p_preset);');
    expect(create).toContain('ON CONFLICT (id) DO NOTHING');
    expect(create).toContain('FOR UPDATE;');
    expect(create).toContain('VNEXT_DUPLICATE_PRESET');
    expect(create).toContain('VNEXT_MUTATION_REPLAY_STALE');
    expect(create).toContain('VNEXT_MUTATION_REUSE');
    expect(create).toContain('v_row.created_by IS DISTINCT FROM v_actor');
    expect(create).toContain('v_row.payload IS DISTINCT FROM p_preset->\'payload\'');
    expect(create.indexOf('VNEXT_DUPLICATE_PRESET')).toBeLessThan(create.indexOf('VNEXT_MUTATION_REUSE'));
  });

  it('update e delete: trava, autor ou admin, replay só da última mutação, CAS por revisão', () => {
    for (const name of ['update_vnext_preset_cas_v1', 'delete_vnext_preset_cas_v1']) {
      const body = fn(name);
      expect(body).toContain('FOR UPDATE;');
      expect(body).toContain("v_current.created_by IS DISTINCT FROM v_actor\n    AND public.team_role() IS DISTINCT FROM 'admin'::public.user_role");
      expect(body).toContain('VNEXT_FORBIDDEN');
      expect(body).toContain('v_current.revision <> p_expected_revision');
      expect(body).toContain('revision = v_current.revision + 1');
      expect(body).toContain('last_mutation_id = v_mutation_id');
      expect(body).toContain('VNEXT_MUTATION_REUSE');
      expect(body.indexOf('VNEXT_FORBIDDEN')).toBeLessThan(body.indexOf('VNEXT_CONFLICT'));
    }
    const update = fn('update_vnext_preset_cas_v1');
    expect(update).toContain('PERFORM public.vnext_validate_preset_input_v1(v_merged);');
    expect(update).toContain('payload kind cannot change');
    expect(update).not.toMatch(/\b(?:kind|origin|created_by)\s*=\s*v_merged/);
    const remove = fn('delete_vnext_preset_cas_v1');
    expect(remove).toContain('deleted_at = now()');
    expect(remove).toContain('deleted_by = v_actor');
    expect(sql).not.toMatch(/DELETE FROM public\.vnext_presets/);
  });

  it('uso: conta embutidos e da equipe sem mexer na revisão do preset', () => {
    const record = fn('record_vnext_preset_use_v1');
    expect(record).toContain('ON CONFLICT (preset_key) DO UPDATE');
    expect(record).toContain('use_count = usage_row.use_count + 1');
    expect(record).toContain("p_preset_key ~ '^builtin:[a-z0-9][a-z0-9._-]{0,79}$'");
    expect(record).toContain('deleted_at IS NULL');
    expect(record).not.toMatch(/UPDATE public\.vnext_presets/);
    const list = fn('list_vnext_presets_v1');
    expect(list).toContain("jsonb_build_object('presets', v_presets, 'builtinUsage', v_builtin_usage)");
    expect(list).toContain('public.vnext_preset_envelope_v1(p, false)');
    expect(list).toContain('p.deleted_at IS NULL');
    expect(fn('get_vnext_presets_v1')).toContain('public.vnext_preset_envelope_v1(p, true)');
  });

  it('todo prefixo de erro levantado tem código no repositório', () => {
    const raised = new Set([...sql.matchAll(/RAISE EXCEPTION '([A-Z_]+):/g)].map((match) => match[1]));
    expect(raised.size).toBeGreaterThan(5);
    for (const prefix of raised) expect(ARSENAL_SERVER_ERROR_PREFIXES[prefix], prefix).toBeDefined();
    expect(arsenalErrorCodeFromServerMessage('VNEXT_CONFLICT: expected revision 1, current revision 2')).toBe('CONFLICT');
    expect(arsenalErrorCodeFromServerMessage('AUTH_ROLE_FORBIDDEN: Perfil (viewer) não autorizado')).toBe('UNAUTHORIZED');
    expect(arsenalErrorCodeFromServerMessage('VNEXT_MUTATION_REPLAY_STALE: mutation is no longer latest')).toBe('CONFLICT');
    expect(arsenalErrorCodeFromServerMessage('erro qualquer')).toBe('REMOTE_FAILURE');
    expect(arsenalErrorCodeFromServerMessage(null)).toBe('REMOTE_FAILURE');
  });
});

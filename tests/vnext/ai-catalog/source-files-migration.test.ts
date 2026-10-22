// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DRAFT_LIMITS, SOURCE_FILES_BUCKET, SOURCE_MIME_TYPES } from '../../../src/vnext/ai-catalog/draft-contract';

// Static verification only: no database is available locally and the slice
// never applies migrations. The owner reviews and applies 00029.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const sql = read('supabase/migrations/00029_vnext_source_files.sql');
const code = sql.replace(/--.*$/gm, '');
const edge = read('supabase/functions/vnext-catalog-draft/index.ts');
const budget = read('supabase/migrations/00028_vnext_ai_budget_settlement.sql');

describe('migration 00029 (private source files and extraction cache)', () => {
  it('is additive: it never drops, alters, truncates or deletes anything', () => {
    expect(code).not.toMatch(/\bdrop\s/i);
    expect(code).not.toMatch(/\balter\s+(?!table public\.vnext_source_extractions enable row level security)/i);
    expect(code).not.toMatch(/\btruncate\b|\bdelete\s+from\b|\bupdate\s+public\./i);
  });

  it('creates a private bucket for PDFs and photos only, never spreadsheets', () => {
    expect(code).toMatch(/values \('vnext-source-files', 'vnext-source-files', false, 52428800,\s+array\['application\/pdf', 'image\/jpeg', 'image\/png', 'image\/webp'\]\)/);
    expect(code).toContain('on conflict (id) do update set public = false');
    expect(code).not.toMatch(/spreadsheet|text\/csv|excel/i);
    expect(SOURCE_FILES_BUCKET).toBe('vnext-source-files');
    expect([...SOURCE_MIME_TYPES]).toEqual(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    expect(DRAFT_LIMITS.maxSourceBytes).toBe(52428800);
  });

  it('lets active admins and editors read, write only into their own folder by sha256, and never overwrite', () => {
    const ownFolder = String.raw`name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{64}\.(pdf|jpg|png|webp)$')`;
    expect(code).toMatch(/create policy vnext_source_files_read on storage\.objects for select to authenticated\s+using \(bucket_id = 'vnext-source-files' and public\.team_role\(\) in \('admin', 'editor'\)\)/);
    expect(code.split(ownFolder)).toHaveLength(3); // permissive insert + restrictive insert
    expect(code).not.toMatch(/create policy vnext_source_files_\w+ on storage\.objects for update/);
    expect(code).toMatch(/as restrictive for update to authenticated\s+using \(bucket_id <> 'vnext-source-files'\) with check \(bucket_id <> 'vnext-source-files'\)/);
    expect(code).toMatch(/as restrictive for all to anon\s+using \(bucket_id <> 'vnext-source-files'\)/);
    expect(code).toMatch(/\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
  });

  it('keeps the cache private and reachable only through two hardened RPCs', () => {
    expect(code).toContain('alter table public.vnext_source_extractions enable row level security;');
    expect(code).toContain('revoke all on public.vnext_source_extractions from anon, authenticated;');
    expect(code).not.toMatch(/create policy[^;]*vnext_source_extractions/i);
    expect(code).toMatch(/primary key \(sha256, first_page, last_page, llm_model, prompt_version, models_key\)/);
    const functions = [...code.matchAll(/create or replace function (public\.\w+)\(/g)].map(match => match[1]);
    expect(functions).toEqual(['public.vnext_source_extraction_get_v1', 'public.vnext_source_extraction_put_v1']);
    expect(code.match(/security definer\s+set search_path = ''/g)).toHaveLength(2);
    expect(code.match(/coalesce\(public\.team_role\(\)::text, ''\) (not )?in \('admin', 'editor'\)/g)).toHaveLength(2);
    for (const signature of ['vnext_source_extraction_get_v1(text, integer, integer, text, text, text)',
      'vnext_source_extraction_put_v1(text, integer, integer, text, text, text, jsonb, integer, text, integer, integer)']) {
      expect(code).toContain(`revoke all on function public.${signature} from public, anon;`);
      expect(code).toContain(`grant execute on function public.${signature} to authenticated;`);
    }
    // Only for bytes stored in the bucket; the first answer of a key stays.
    expect(code).toContain("o.bucket_id = 'vnext-source-files'");
    expect(code).toContain('on conflict do nothing;');
  });

  it('declares exactly the RPCs and parameter names the Edge Function calls', () => {
    expect(edge).toContain("db.rpc('vnext_source_extraction_get_v1', args(key))");
    expect(edge).toContain("db.rpc('vnext_source_extraction_put_v1', { ...args(key), p_answer: entry.sheet, p_trimmed: entry.trimmed,");
    for (const parameter of ['p_sha256', 'p_first_page', 'p_last_page', 'p_llm_model', 'p_prompt_version', 'p_models_key',
      'p_answer', 'p_trimmed', 'p_model_version', 'p_input_tokens', 'p_output_tokens']) {
      expect(edge).toContain(parameter);
      expect(code).toContain(parameter);
    }
    for (const column of ['answer', 'trimmed', 'model_version', 'input_tokens', 'output_tokens']) expect(edge).toContain(`data.${column}`);
    // The budget feature the function reserves exists in 00028.
    expect(edge).toContain("p_feature: 'extraction'");
    expect(budget).toMatch(/feature in \('composer', 'draft', 'translation', 'extraction'\)/);
  });
});

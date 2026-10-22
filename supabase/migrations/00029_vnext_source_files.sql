-- 00029 · Arquivos de origem da IA e cache de extração (FR-66, plano father-ready 2026-10-15).
--
-- ADDITIVE ONLY. Not applied by the implementation slice: the owner reviews and
-- applies it. Preview and production share this database, so nothing here
-- changes or removes what the deployed client and functions use: no existing
-- bucket, table, policy or function is altered or dropped.
--
-- What it adds:
--   1. Bucket vnext-source-files, PRIVATE: only PDFs and photos (JPEG, PNG,
--      WebP) up to 50 MB. Spreadsheets (XLSX, CSV) never go there: they are
--      read only in the browser. Objects are named "<user id>/<sha256>.<ext>",
--      written only into the uploader's own folder, never overwritten.
--   2. vnext_source_extractions, the extraction cache: one answer per
--      (sha256, first page, last page, Gemini model, prompt version, products),
--      so trying again costs nothing. Private table, no client policies.
--   3. vnext_source_extraction_get_v1 / _put_v1, the only way in or out, for
--      active admins and editors (the same rule as the Edge Functions).
--
-- Who reads what (RLS by team and user): the company is one team. Active
-- admins and editors read the team's source files (the Edge Function reads
-- them with the caller's own token); each one writes only in their own
-- folder; an editor deletes only their own files, an admin any file.
--
-- Trust: the cached answer is the model's proposal, never a verified fact.
-- The browser verifies every value against the file's own text before use
-- (extraction-review.ts), so an answer written through put_v1 by hand is no
-- stronger than one from the model. put_v1 only accepts a key whose file is
-- in the bucket, and the first answer for a key stays (an admin can delete a
-- row in the SQL editor). Requires the usual independent review before applying.

-- 1. Private bucket -----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vnext-source-files', 'vnext-source-files', false, 52428800,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy vnext_source_files_read on storage.objects for select to authenticated
using (bucket_id = 'vnext-source-files' and public.team_role() in ('admin', 'editor'));
create policy vnext_source_files_insert on storage.objects for insert to authenticated
with check (bucket_id = 'vnext-source-files' and public.team_role() in ('admin', 'editor')
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{64}\.(pdf|jpg|png|webp)$'));
create policy vnext_source_files_delete on storage.objects for delete to authenticated
using (bucket_id = 'vnext-source-files' and (public.team_role() = 'admin'
  or (public.team_role() = 'editor' and (storage.foldername(name))[1] = (select auth.uid())::text)));

-- Restrictive policies also guard against pre-existing permissive Storage
-- rules. They leave other buckets untouched (same pattern as 00004).
create policy vnext_source_files_block_anon on storage.objects as restrictive for all to anon
using (bucket_id <> 'vnext-source-files') with check (bucket_id <> 'vnext-source-files');
create policy vnext_source_files_bound_read on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'vnext-source-files' or public.team_role() in ('admin', 'editor'));
create policy vnext_source_files_bound_insert on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'vnext-source-files' or (public.team_role() in ('admin', 'editor')
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{64}\.(pdf|jpg|png|webp)$')));
create policy vnext_source_files_bound_update on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'vnext-source-files') with check (bucket_id <> 'vnext-source-files');
create policy vnext_source_files_bound_delete on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'vnext-source-files' or public.team_role() = 'admin'
  or (public.team_role() = 'editor' and (storage.foldername(name))[1] = (select auth.uid())::text));

-- 2. Extraction cache ---------------------------------------------------------
create table if not exists public.vnext_source_extractions (
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  first_page integer not null check (first_page between 1 and 1000),
  last_page integer not null check (last_page between 1 and 1000),
  llm_model text not null check (llm_model ~ '^[a-z0-9.-]{3,60}$'),
  prompt_version text not null check (prompt_version ~ '^[a-z0-9.-]{3,60}$'),
  models_key text not null check (length(models_key) <= 400),
  answer jsonb not null check (jsonb_typeof(answer) = 'object' and octet_length(answer::text) <= 1048576),
  trimmed integer not null default 0 check (trimmed between 0 and 100000),
  model_version text check (model_version is null or length(model_version) <= 80),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  -- set null keeps the cached answer when a user is removed.
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (last_page >= first_page and last_page - first_page < 12),
  primary key (sha256, first_page, last_page, llm_model, prompt_version, models_key)
);
alter table public.vnext_source_extractions enable row level security;
revoke all on public.vnext_source_extractions from anon, authenticated;
-- No table policies. Only the hardened RPCs below read or write this table.

create or replace function public.vnext_source_extraction_get_v1(
  p_sha256 text, p_first_page integer, p_last_page integer,
  p_llm_model text, p_prompt_version text, p_models_key text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('answer', e.answer, 'trimmed', e.trimmed, 'model_version', e.model_version,
    'input_tokens', e.input_tokens, 'output_tokens', e.output_tokens)
  from public.vnext_source_extractions e
  where (select auth.uid()) is not null
    and coalesce(public.team_role()::text, '') in ('admin', 'editor')
    and e.sha256 = p_sha256 and e.first_page = p_first_page and e.last_page = p_last_page
    and e.llm_model = p_llm_model and e.prompt_version = p_prompt_version and e.models_key = p_models_key
$$;
revoke all on function public.vnext_source_extraction_get_v1(text, integer, integer, text, text, text) from public, anon;
grant execute on function public.vnext_source_extraction_get_v1(text, integer, integer, text, text, text) to authenticated;

create or replace function public.vnext_source_extraction_put_v1(
  p_sha256 text, p_first_page integer, p_last_page integer,
  p_llm_model text, p_prompt_version text, p_models_key text,
  p_answer jsonb, p_trimmed integer, p_model_version text, p_input_tokens integer, p_output_tokens integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_rows integer;
begin
  if v_user is null or coalesce(public.team_role()::text, '') not in ('admin', 'editor') then return false; end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then return false; end if;
  -- Only for bytes someone of the team really stored in the private bucket.
  if not exists (select 1 from storage.objects o where o.bucket_id = 'vnext-source-files'
      and o.name ~ ('^[0-9a-f-]{36}/' || p_sha256 || '\.(pdf|jpg|png|webp)$')) then return false; end if;
  insert into public.vnext_source_extractions (sha256, first_page, last_page, llm_model, prompt_version, models_key,
    answer, trimmed, model_version, input_tokens, output_tokens, created_by)
  values (p_sha256, p_first_page, p_last_page, p_llm_model, p_prompt_version, coalesce(p_models_key, ''),
    p_answer, coalesce(p_trimmed, 0), p_model_version, coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0), v_user)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
exception when check_violation or not_null_violation then
  return false;
end;
$$;
revoke all on function public.vnext_source_extraction_put_v1(text, integer, integer, text, text, text, jsonb, integer, text, integer, integer) from public, anon;
grant execute on function public.vnext_source_extraction_put_v1(text, integer, integer, text, text, text, jsonb, integer, text, integer, integer) to authenticated;

comment on table public.vnext_source_extractions is
  'FR-66 extraction cache: the model''s bounded proposal for one file and page range, never a verified fact. Private; RPC access only.';
comment on function public.vnext_source_extraction_get_v1(text, integer, integer, text, text, text) is
  'Cached extraction answer for active admins and editors, or null.';
comment on function public.vnext_source_extraction_put_v1(text, integer, integer, text, text, text, jsonb, integer, text, integer, integer) is
  'Stores the first extraction answer of a key whose file is in vnext-source-files; active admins and editors only.';

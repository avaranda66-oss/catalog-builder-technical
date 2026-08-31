import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../supabase/migrations/00004_document_workspace.sql', import.meta.url), 'utf8')

test('migration de workspace contém as entidades estruturais do editor', () => {
  for (const table of [
    'catalog_members',
    'catalog_pages',
    'page_sections',
    'catalog_versions',
    'catalog_reviews',
    'catalog_proposals',
    'catalog_product_links',
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\b`), `tabela ausente: ${table}`)
  }
})

test('migration preserva o baseline e faz backfill somente de vínculos legados explícitos', () => {
  assert.match(migration, /alter table public\.assets add column if not exists mime_type/)
  assert.match(migration, /insert into public\.catalog_product_links/)
  assert.match(migration, /where p\.catalog_id is not null/)
  assert.match(migration, /on conflict \(catalog_id, product_id\) do nothing/)
})

test('migration registra proteção de revisão e RLS de catálogo', () => {
  assert.match(migration, /check \(status <> 'approved' or reviewer_id is not null\)/)
  assert.match(migration, /check \(reviewer_id is null or reviewer_id <> author_id\)/)
  assert.match(migration, /create or replace function public\.is_catalog_member/)
  assert.match(migration, /alter table public\.catalog_pages enable row level security/)
  assert.match(migration, /create policy "catalog members can mutate sections"/)
})

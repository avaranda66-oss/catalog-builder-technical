import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('W3.G — Migration 00025 Static Verification', () => {
  const migrationPath = path.resolve(__dirname, '../../../supabase/migrations/00025_vnext_asset_persistence.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('MIG-01: creates public.vnext_assets table with composite PK (id, version)', () => {
    expect(sql).toMatch(/CREATE TABLE public\.vnext_assets/i);
    expect(sql).toMatch(/id UUID NOT NULL/i);
    expect(sql).toMatch(/version TEXT NOT NULL/i);
    expect(sql).toMatch(/sha256 TEXT NOT NULL/i);
    expect(sql).toMatch(/mime TEXT NOT NULL/i);
    expect(sql).toMatch(/width_px INTEGER NOT NULL/i);
    expect(sql).toMatch(/height_px INTEGER NOT NULL/i);
    expect(sql).toMatch(/storage_bucket TEXT NOT NULL DEFAULT 'product-assets'/i);
    expect(sql).toMatch(/storage_path TEXT NOT NULL/i);
    expect(sql).toMatch(/PRIMARY KEY \s*\(\s*id\s*,\s*version\s*\)/i);
  });

  it('MIG-02: enables RLS and defines restrictive client privileges (no direct UPDATE/DELETE)', () => {
    expect(sql).toMatch(/ALTER TABLE public\.vnext_assets ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/REVOKE UPDATE, DELETE ON public\.vnext_assets FROM/i);
  });

  it('MIG-03: narrows legacy admin storage policy to exclude vnext/% from UPDATE and DELETE', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "storage_product_assets_admin_write" ON storage\.objects/i);
    expect(sql).toMatch(/CREATE POLICY "storage_product_assets_admin_write" ON storage\.objects/i);
    expect(sql).toMatch(/name NOT LIKE 'vnext\/%'/i);
  });

  it('MIG-04: creates dedicated immutable VNext INSERT storage policy for document editors', () => {
    expect(sql).toMatch(/CREATE POLICY "storage_vnext_assets_editor_insert" ON storage\.objects/i);
    expect(sql).toMatch(/FOR INSERT/i);
    expect(sql).toMatch(/bucket_id = 'product-assets'/i);
    expect(sql).toMatch(/name LIKE 'vnext\/%'/i);
    expect(sql).toMatch(/public\.require_document_editor_v1\(\)/i);
  });

  it('MIG-05: finalize_vnext_asset_v1 RPC uses canonical require_document_editor_v1()', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.finalize_vnext_asset_v1/i);
    expect(sql).toMatch(/public\.require_document_editor_v1\(\)/i);
    expect(sql).not.toMatch(/vnext_require_editor_v1/i);
  });

  it('MIG-06: get_vnext_asset_v1 RPC uses canonical vnext_require_reader_v1()', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_vnext_asset_v1/i);
    expect(sql).toMatch(/public\.vnext_require_reader_v1\(\)/i);
  });

  it('MIG-07: enforces exact storage_path pattern vnext/<uuid>/<version>.<ext> in finalization RPC', () => {
    expect(sql).toMatch(/v_expected_path := 'vnext\/' \|\| p_asset_id/i);
    expect(sql).toMatch(/p_storage_path IS DISTINCT FROM v_expected_path/i);
  });

  it('MIG-08: guarantees idempotent replay for exact metadata and fails closed on divergent metadata', () => {
    expect(sql).toMatch(/IF FOUND THEN/i);
    expect(sql).toMatch(/v_existing\.sha256 <> p_sha256/i);
    expect(sql).toMatch(/v_existing\.file_size <> p_file_size/i);
    expect(sql).toMatch(/RAISE EXCEPTION 'VNEXT_CONFLICT: asset version already exists with divergent metadata'/i);
  });

  it('MIG-09: freezes W3.G version to exactly "1" in table constraint and RPC validation', () => {
    expect(sql).toMatch(/version TEXT NOT NULL CHECK \(version = '1'\)/i);
    expect(sql).toMatch(/p_version IS DISTINCT FROM '1'/i);
  });

  it('MIG-10: confirms durable storage object exists in storage.objects before finalization', () => {
    expect(sql).toMatch(/SELECT 1 FROM storage\.objects/i);
    expect(sql).toMatch(/bucket_id = 'product-assets'/i);
    expect(sql).toMatch(/VNEXT_STORAGE_OBJECT_NOT_FOUND/i);
  });

  it('MIG-11: enforces clean string semantics rejecting control characters in name and alt', () => {
    // Table constraint checks
    expect(sql).toMatch(/name TEXT NOT NULL CHECK \(length\(trim\(name\)\) > 0 AND name !~ '\[\\x00-\\x1F\\x7F\]'\)/i);
    expect(sql).toMatch(/alt TEXT NOT NULL CHECK \(length\(trim\(alt\)\) > 0 AND alt !~ '\[\\x00-\\x1F\\x7F\]'\)/i);
    // RPC validation checks
    expect(sql).toMatch(/p_name ~ '\[\\x00-\\x1F\\x7F\]'/i);
    expect(sql).toMatch(/p_alt ~ '\[\\x00-\\x1F\\x7F\]'/i);
  });

  it('MIG-12: freezes canonical JPEG storage path extension strictly to .jpeg (no .jpg)', () => {
    // Table storage_path constraint allows only png, jpeg, webp
    expect(sql).toMatch(/storage_path TEXT NOT NULL CHECK \(storage_path ~ '\^vnext\/\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\/1\\\.\(png\|jpeg\|webp\)\$'\)/i);
    // RPC derives 'jpeg' for image/jpeg without inspecting caller path for .jpg
    expect(sql).toMatch(/WHEN p_mime = 'image\/jpeg' THEN 'jpeg'/i);
    expect(sql).not.toMatch(/WHEN p_mime = 'image\/jpeg' THEN \(CASE WHEN/i);
  });
});

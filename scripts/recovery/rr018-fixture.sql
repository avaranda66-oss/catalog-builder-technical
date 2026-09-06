\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
VALUES (
  '98000000-0000-4000-8000-000000000001',
  'rr018-recovery@example.invalid',
  '{"full_name":"RR018 Recovery Fixture"}'::jsonb,
  '{"role":"admin"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, role, is_active)
VALUES ('98000000-0000-4000-8000-000000000001', 'RR018 Recovery Fixture', 'admin', true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, is_active = true;

INSERT INTO public.product_families (id, name, slug, description, created_by, updated_by)
VALUES (
  '98000000-0000-4000-8000-000000000010',
  'RR018 Deterministic Family',
  'rr018-deterministic-family',
  'Synthetic disposable recovery fixture',
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.product_family_fields (
  id, family_id, field_key, label, field_type, unit, sort_order, visible, is_system, created_by, updated_by
)
VALUES (
  '98000000-0000-4000-8000-000000000011',
  '98000000-0000-4000-8000-000000000010',
  'rr018_accuracy',
  'RR018 Accuracy',
  'number',
  'degC',
  0,
  true,
  false,
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.catalogs (id, name, locale, status, brand, version, updated_by)
VALUES (
  '98000000-0000-4000-8000-000000000020',
  'RR018 Recovery Catalog',
  'en-US',
  'draft',
  '{"fixture":"RR018","source":"synthetic"}'::jsonb,
  1,
  '98000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products (
  id, catalog_id, sku, name, family, family_id, status, sort_order, data, version, updated_by
)
VALUES (
  '98000000-0000-4000-8000-000000000030',
  '98000000-0000-4000-8000-000000000020',
  'RR018-SYNTH-001',
  'RR018 Synthetic Product',
  'RR018 Deterministic Family',
  '98000000-0000-4000-8000-000000000010',
  'draft',
  1,
  '{"rr018":{"accuracy":0.05,"unit":"degC"}}'::jsonb,
  1,
  '98000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.catalog_products (catalog_id, product_id, sort_order)
VALUES (
  '98000000-0000-4000-8000-000000000020',
  '98000000-0000-4000-8000-000000000030',
  1
)
ON CONFLICT DO NOTHING;

INSERT INTO public.catalog_versions (id, catalog_id, version, status, snapshot, summary, created_by)
VALUES (
  '98000000-0000-4000-8000-000000000021',
  '98000000-0000-4000-8000-000000000020',
  1,
  'draft',
  '{"fixture":"RR018","products":["98000000-0000-4000-8000-000000000030"]}'::jsonb,
  'RR018 deterministic catalog snapshot',
  '98000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.product_versions (id, product_id, version, snapshot, source, summary, created_by)
VALUES (
  '98000000-0000-4000-8000-000000000031',
  '98000000-0000-4000-8000-000000000030',
  1,
  '{"fixture":"RR018","sku":"RR018-SYNTH-001"}'::jsonb,
  'import',
  'RR018 deterministic product snapshot',
  '98000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.assets (
  id, product_id, storage_path, role, alt_text, sort_order,
  storage_bucket, original_filename, mime_type, file_size, sha256,
  kind, source_type, approval_status, created_by, updated_by
)
VALUES (
  '98000000-0000-4000-8000-000000000040',
  '98000000-0000-4000-8000-000000000030',
  'rr018/recovery-fixture.png',
  'hero',
  'RR018 synthetic recovery pixel',
  0,
  'product-assets',
  'recovery-fixture.png',
  'image/png',
  :'asset_size'::bigint,
  :'asset_sha',
  'image',
  'uploaded',
  'approved',
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.product_assets (
  id, product_id, asset_id, role, angle, sort_order, is_primary, is_official, caption, alt_text, created_by
)
VALUES (
  '98000000-0000-4000-8000-000000000041',
  '98000000-0000-4000-8000-000000000030',
  '98000000-0000-4000-8000-000000000040',
  'hero',
  'front',
  0,
  true,
  true,
  'RR018 synthetic asset',
  'RR018 synthetic recovery pixel',
  '98000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.asset_audit_logs (
  id, asset_id, product_id, action, actor_id, actor_email, actor_name, summary, details
)
VALUES (
  '98000000-0000-4000-8000-000000000042',
  '98000000-0000-4000-8000-000000000040',
  '98000000-0000-4000-8000-000000000030',
  'ASSET_UPLOAD',
  '98000000-0000-4000-8000-000000000001',
  'rr018-recovery@example.invalid',
  'RR018 Recovery Fixture',
  'Synthetic storage object created for disposable recovery drill',
  '{"fixture":"RR018"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.product_source_documents (
  id, title, document_type, revision, language, file_reference, checksum, metadata, created_by, updated_by
)
VALUES (
  'rr018-source-001',
  'RR018 Synthetic Evidence',
  'manual',
  'R1',
  'en-US',
  'storage://product-assets/rr018/recovery-fixture.png',
  :'asset_sha',
  '{"fixture":"RR018","synthetic":true}'::jsonb,
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.product_workbooks (
  id, owner_kind, owner_id, revision, full_payload, created_by, updated_by
)
VALUES (
  '98000000-0000-4000-8000-000000000050',
  'product',
  '98000000-0000-4000-8000-000000000030',
  1,
  '{
    "id":"rr018-workbook",
    "schemaVersion":2,
    "owner":{"kind":"product","id":"98000000-0000-4000-8000-000000000030"},
    "revision":1,
    "modules":[{"id":"rr018-module","semanticKey":"rr018.metrology","label":"RR018 Metrology","kind":"specification","order":0,"datumIds":["rr018-datum"]}],
    "data":{"rr018-datum":{"id":"rr018-datum","moduleId":"rr018-module","semanticKey":"rr018.accuracy","label":"Accuracy","value":{"type":"numeric","amount":0.05,"unit":"degC"},"evidence":[{"id":"rr018-evidence","sourceDocumentId":"rr018-source-001","locator":"synthetic"}],"status":"verified"}},
    "datasets":[{"id":"rr018-dataset","semanticKey":"rr018.dataset","moduleId":"rr018-module","label":"RR018 Dataset","kind":"matrix","order":0,"columns":[{"id":"rr018-column","semanticKey":"rr018.column","label":"Accuracy","valueType":"numeric","unit":"degC","order":0}],"rows":[{"id":"rr018-row","semanticKey":"rr018.row","label":"Synthetic Row","order":0}],"cells":{"r10:rr018-row|c12:rr018-column":{"rowId":"rr018-row","columnId":"rr018-column","datumId":"rr018-datum"}}}]
  }'::jsonb,
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.product_technical_data_index (
  id, workbook_id, datum_id, semantic_key, module_id, label, value_type, raw_value,
  numeric_value, unit, status
)
VALUES (
  '98000000-0000-4000-8000-000000000051',
  '98000000-0000-4000-8000-000000000050',
  'rr018-datum',
  'rr018.accuracy',
  'rr018-module',
  'Accuracy',
  'numeric',
  '{"type":"numeric","amount":0.05,"unit":"degC"}'::jsonb,
  0.05,
  'degC',
  'verified'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.product_dataset_search_index (
  id, workbook_id, dataset_id, dataset_semantic_key, module_id, dataset_label, dataset_kind,
  row_id, row_semantic_key, row_label, column_id, column_semantic_key, column_label,
  column_value_type, datum_id, datum_status, projected_numeric, projected_unit
)
VALUES (
  '98000000-0000-4000-8000-000000000052',
  '98000000-0000-4000-8000-000000000050',
  'rr018-dataset',
  'rr018.dataset',
  'rr018-module',
  'RR018 Dataset',
  'matrix',
  'rr018-row',
  'rr018.row',
  'Synthetic Row',
  'rr018-column',
  'rr018.column',
  'Accuracy',
  'numeric',
  'rr018-datum',
  'verified',
  0.05,
  'degC'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.library_change_events (
  id, entity_type, entity_id, family_id, product_id, field_key, action, summary,
  actor_id, actor_email, actor_name
)
VALUES (
  '98000000-0000-4000-8000-000000000060',
  'product_workbook',
  '98000000-0000-4000-8000-000000000050',
  '98000000-0000-4000-8000-000000000010',
  '98000000-0000-4000-8000-000000000030',
  'rr018.accuracy',
  'UPSERT',
  'RR018 synthetic workbook fixture',
  '98000000-0000-4000-8000-000000000001',
  'rr018-recovery@example.invalid',
  'RR018 Recovery Fixture'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.audit_log (
  actor_id, actor_type, entity_type, entity_id, action, before, after
)
VALUES (
  '98000000-0000-4000-8000-000000000001',
  'system',
  'products',
  '98000000-0000-4000-8000-000000000030',
  'INSERT',
  NULL,
  '{"fixture":"RR018"}'::jsonb
);

COMMIT;

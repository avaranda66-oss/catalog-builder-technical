-- Regression fixture: requires 00004_team_workspace.sql, executed as the database
-- owner in a dedicated transaction. All users, documents and media are rolled back.
-- For migration rehearsal concatenate the migration WITHOUT its final COMMIT,
-- followed by this file. Its final ROLLBACK then undoes the migration as well.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
('d0000000-0000-0000-0000-000000000001','catalog-editor-fixture@example.test','{"full_name":"Fixture editor"}'),
('d0000000-0000-0000-0000-000000000002','catalog-viewer-fixture@example.test','{"full_name":"Fixture viewer"}'),
('d0000000-0000-0000-0000-000000000003','catalog-admin-fixture@example.test','{"full_name":"Fixture reviewer"}');
do $$ begin
  if exists(select 1 from public.profiles where id in (
    'd0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000003') and (role<>'viewer' or is_active)) then
    raise exception 'New accounts must not receive editor/admin automatically'; end if;
end $$;
update public.profiles set role='editor',is_active=true where id='d0000000-0000-0000-0000-000000000001';
update public.profiles set role='admin',is_active=true where id='d0000000-0000-0000-0000-000000000003';
update public.profiles set is_active=true where id='d0000000-0000-0000-0000-000000000002';
create temporary table workspace_test_state(key text primary key,value jsonb);
grant select,insert,update on workspace_test_state to authenticated;

set local role anon;
set local request.jwt.claims='{"role":"anon"}';
do $$ begin
  begin perform id from public.catalogs limit 1; raise exception 'Anonymous catalog access was allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.get_catalog_workspace('a0000000-0000-0000-0000-000000000001'); raise exception 'Anonymous RPC access was allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims='{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  begin update public.profiles set role='admin' where id=auth.uid(); raise exception 'Self role escalation was allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.create_catalog_workspace('Viewer forbidden'); raise exception 'Viewer created a catalog';
  exception when insufficient_privilege then null; end;
end $$;

set local request.jwt.claims='{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare c jsonb; saved jsonb; p jsonb; fields jsonb; begin
  c := public.create_catalog_workspace('Security fixture');
  p := '[{"id":"e0000000-0000-0000-0000-000000000001","sku":"FIXTURE-DEVICE","name":"Fixture device","family":"Electrical","status":"draft","sort_order":0,"version":1,"data":{"specs":[{"param":"Voltage","value":"24 V"}]}}]'::jsonb;
  fields := '[{"id":"fixture-field","section":"specs","key":"voltage","label":"Voltage","field_type":"measurement","unit":"V","validation":{},"sort_order":0,"visible_in_catalog":true}]'::jsonb;
  saved := public.save_catalog_workspace((c->>'id')::uuid,(c->>'version')::int,c,p,fields,'Fixture initial save');
  if (saved->'catalog'->>'version')::int<>2 or jsonb_array_length(saved->'products')<>1 then
    raise exception 'Committed workspace acknowledgement is inconsistent'; end if;
  if (saved->'catalog'->>'updated_by')::uuid<>auth.uid() then raise exception 'Server actor was not recorded'; end if;
  begin
    perform public.save_catalog_workspace((c->>'id')::uuid,1,c,'[]','[]','Stale save');
    raise exception 'Stale catalog save was accepted';
  exception when serialization_failure then null; end;
  begin update public.catalogs set version=99 where id=(c->>'id')::uuid; raise exception 'Direct write bypassed CAS';
  exception when insufficient_privilege then null; end;
  c := jsonb_set(saved->'catalog','{status}','"review"');
  saved := public.save_catalog_workspace((c->>'id')::uuid,2,c,saved->'products',saved->'fieldDefinitions','Review requested');
  begin
    perform public.save_catalog_workspace((c->>'id')::uuid,3,jsonb_set(saved->'catalog','{status}','"approved"'),saved->'products',saved->'fieldDefinitions','Unauthorized approval');
    raise exception 'Editor approved a document';
  exception when insufficient_privilege then null; end;
  insert into workspace_test_state values('workspace',saved);
end $$;

set local request.jwt.claims='{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$ declare state jsonb; c jsonb; begin
  select value into state from workspace_test_state where key='workspace';
  c := jsonb_set(state->'catalog','{status}','"approved"');
  state := public.save_catalog_workspace((c->>'id')::uuid,(c->>'version')::int,c,state->'products',state->'fieldDefinitions','Independent approval');
  if state->'catalog'->>'status'<>'approved' then raise exception 'Independent approval was not retained'; end if;
  c := jsonb_set(state->'catalog','{status}','"published"');
  state := public.save_catalog_workspace((c->>'id')::uuid,(c->>'version')::int,c,state->'products',state->'fieldDefinitions','Publication');
  if state->'catalog'->>'status'<>'published' then raise exception 'Publication failed'; end if;
  begin delete from public.catalog_versions where catalog_id=(c->>'id')::uuid; raise exception 'Published snapshots were mutable';
  exception when insufficient_privilege then null; end;
  update workspace_test_state set value=state where key='workspace';
end $$;

set local request.jwt.claims='{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare state jsonb; c jsonb; second jsonb; saved jsonb; fixture_product_id uuid; begin
  select value into state from workspace_test_state where key='workspace';
  fixture_product_id := (state->'products'->0->>'id')::uuid;
  -- The same master product is linked into a second document without duplication.
  second := public.create_catalog_workspace('Shared product fixture');
  saved := public.save_catalog_workspace((second->>'id')::uuid,1,second,state->'products','[]','Link existing product');
  if (select count(*) from public.products where id=fixture_product_id)<>1 then raise exception 'Library product duplicated'; end if;
  c := jsonb_set(state->'catalog','{status}','"draft"');
  perform public.save_catalog_workspace((c->>'id')::uuid,(c->>'version')::int,c,'[]',state->'fieldDefinitions','Unlink product');
  if not exists(select 1 from public.products where id=fixture_product_id) then raise exception 'Unlink deleted the master product'; end if;
  if not exists(select 1 from public.catalog_products cp where cp.catalog_id=(second->>'id')::uuid and cp.product_id=fixture_product_id) then
    raise exception 'Unlink affected another document'; end if;
  -- Updating through the second document increments the global product revision.
  saved := public.save_catalog_workspace((second->>'id')::uuid,2,saved->'catalog',
    jsonb_set(saved->'products','{0,data,specs,0,value}','"48 V"'),'[]','Change master product');
  begin
    perform public.save_catalog_workspace((second->>'id')::uuid,3,saved->'catalog',
      jsonb_set(state->'products','{0,data,specs,0,value}','"12 V"'),'[]','Stale product overwrite');
    raise exception 'Stale shared product overwrite was accepted';
  exception when serialization_failure then null; end;
end $$;

reset role;
select 'workspace security, CAS, shared library, approval and publication assertions passed' as result;
rollback;

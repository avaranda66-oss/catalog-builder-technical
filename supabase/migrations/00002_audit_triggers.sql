-- ============================================================================
-- PCON CATALOG BUILDER — SUPABASE MIGRATION 00002: AUDIT TRIGGERS
-- ============================================================================

-- Generic trigger function for audit logging
create or replace function public.log_audit_change()
returns trigger
language plpgsql
security definer
as $$
declare
  current_actor uuid;
begin
  -- Get actor if auth context is available
  begin
    current_actor := auth.uid();
  exception when others then
    current_actor := null;
  end;

  insert into public.audit_log (
    actor_id,
    actor_type,
    entity_type,
    entity_id,
    action,
    before,
    after,
    source
  )
  values (
    current_actor,
    case when current_actor is null then 'system' else 'user' end,
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id),
    TG_OP,
    case when TG_OP <> 'INSERT' then to_jsonb(OLD) else null end,
    case when TG_OP <> 'DELETE' then to_jsonb(NEW) else null end,
    'trigger'
  );

  return coalesce(NEW, OLD);
end;
$$;

-- Trigger for products table
drop trigger if exists trg_products_audit on public.products;
create trigger trg_products_audit
  after insert or update or delete on public.products
  for each row execute function public.log_audit_change();

-- Trigger for catalogs table
drop trigger if exists trg_catalogs_audit on public.catalogs;
create trigger trg_catalogs_audit
  after insert or update or delete on public.catalogs
  for each row execute function public.log_audit_change();

-- Trigger for field_definitions table
drop trigger if exists trg_field_definitions_audit on public.field_definitions;
create trigger trg_field_definitions_audit
  after insert or update or delete on public.field_definitions
  for each row execute function public.log_audit_change();

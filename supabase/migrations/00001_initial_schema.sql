-- ============================================================================
-- PCON CATALOG BUILDER — SUPABASE MIGRATION 00001: INITIAL SCHEMA
-- ============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Enum types
create type user_role as enum ('admin', 'editor', 'viewer');
create type catalog_status as enum ('draft', 'review', 'approved', 'published');
create type product_status as enum ('draft', 'review', 'approved', 'published', 'archived');
create type ai_run_status as enum ('proposed', 'approved', 'rejected', 'applied', 'failed');

-- 1. Profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role user_role default 'editor',
  created_at timestamptz default now()
);

-- 2. Catalogs table
create table if not exists public.catalogs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  locale text default 'pt-BR',
  status catalog_status default 'draft',
  template_key text default 'presys-premium',
  brand jsonb default '{
    "primaryColor": "#003366",
    "darkColor": "#001A33",
    "accentColor": "#2563EB",
    "logoUrl": "/img/logo-presys.png",
    "companyName": "Presys Instrumentos",
    "website": "www.presys.com.br",
    "phone": "+55 (11) 3038-1300",
    "email": "vendas@presys.com.br"
  }'::jsonb,
  version int default 1,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 3. Field Definitions table (Customizable dynamic attributes)
create table if not exists public.field_definitions (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid references public.catalogs(id) on delete cascade,
  section text not null,               -- 'marketing', 'pressure_specs', 'electrical_specs', 'general_specs', etc.
  key text not null,                   -- 'control_range', 'display_accuracy', 'control_stability'
  label text not null,                 -- 'Faixa de Controle', 'Exatidão', 'Estabilidade'
  field_type text not null,            -- 'text', 'multiline', 'number', 'measurement', 'range', 'accuracy', 'select', 'multiselect', 'boolean', 'image', 'matrix'
  unit text,                           -- 'bar', 'psi', '%FS', 'Pa', 'mA', 'V'
  options jsonb,                       -- Enum options if field_type is select/multiselect
  validation jsonb default '{}'::jsonb,-- { min, max, pattern, required, enum, basis }
  sort_order int not null default 0,
  visible_in_catalog boolean default true,
  created_at timestamptz default now()
);

-- 4. Products table (JSONB technical document)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid references public.catalogs(id) on delete cascade,
  sku text not null,
  name text not null,
  family text default 'PCON',          -- 'PCON', 'TA', 'PSV'
  status product_status default 'draft',
  sort_order int default 0,
  data jsonb not null default '{}'::jsonb, -- Structured metrology specs
  version int default 1,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(catalog_id, sku)
);

-- 5. Product Assets / Images table
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  storage_path text not null,
  role text default 'gallery',          -- 'hero', 'gallery', 'diagram', 'certificate', 'variation'
  alt_text text,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- 6. Product Versions table (Snapshots for visual diff & rollback)
create table if not exists public.product_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  source text default 'user',           -- 'user', 'ai', 'import'
  summary text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- 7. Audit Log table (Captured automatically by SQL trigger)
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_type text default 'user',       -- 'user', 'ai', 'system'
  entity_type text not null,            -- 'products', 'catalogs', 'field_definitions'
  entity_id uuid not null,
  action text not null,                 -- 'INSERT', 'UPDATE', 'DELETE'
  before jsonb,
  after jsonb,
  source text default 'manual',         -- 'manual', 'ai', 'import'
  created_at timestamptz default now()
);

-- 8. AI Runs / Execution Log table (Guarantees human approval flow)
create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  product_id uuid references public.products(id) on delete set null,
  prompt text not null,
  audio_transcript text,
  tool_calls jsonb,
  proposed_patch jsonb not null,
  status ai_run_status default 'proposed',
  approved_by uuid references public.profiles(id),
  applied_at timestamptz,
  created_at timestamptz default now()
);

-- 9. Templates table
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_key text unique not null,   -- 'presys-premium', 'additel-clean', 'fluke-dense'
  design_tokens jsonb not null,
  layout_config jsonb not null,
  is_system boolean default true,
  created_at timestamptz default now()
);

-- Performance GIN Indexes for JSONB metrological queries
create index if not exists idx_products_data on public.products using gin (data);
create index if not exists idx_products_catalog_id on public.products(catalog_id);
create index if not exists idx_field_definitions_catalog on public.field_definitions(catalog_id, section, sort_order);
create index if not exists idx_audit_log_entity on public.audit_log(entity_type, entity_id, created_at desc);

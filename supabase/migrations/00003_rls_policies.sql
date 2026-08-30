-- ============================================================================
-- PCON CATALOG BUILDER — SUPABASE MIGRATION 00003: RLS POLICIES
-- ============================================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.catalogs enable row level security;
alter table public.field_definitions enable row level security;
alter table public.products enable row level security;
alter table public.assets enable row level security;
alter table public.product_versions enable row level security;
alter table public.audit_log enable row level security;
alter table public.ai_runs enable row level security;
alter table public.templates enable row level security;

-- Profiles: Authenticated users can read all profiles; users can update their own
create policy "Allow read profiles for authenticated"
  on public.profiles for select
  to authenticated using (true);

create policy "Allow update own profile"
  on public.profiles for update
  to authenticated using (auth.uid() = id);

-- Catalogs: Authenticated can CRUD
create policy "Allow read catalogs"
  on public.catalogs for select
  to authenticated, anon using (true);

create policy "Allow mutate catalogs for authenticated"
  on public.catalogs for all
  to authenticated using (true);

-- Field Definitions: Authenticated can CRUD, Anon can read
create policy "Allow read field_definitions"
  on public.field_definitions for select
  to authenticated, anon using (true);

create policy "Allow mutate field_definitions for authenticated"
  on public.field_definitions for all
  to authenticated using (true);

-- Products: Authenticated can CRUD, Anon can read
create policy "Allow read products"
  on public.products for select
  to authenticated, anon using (true);

create policy "Allow mutate products for authenticated"
  on public.products for all
  to authenticated using (true);

-- Assets: Authenticated can CRUD, Anon can read
create policy "Allow read assets"
  on public.assets for select
  to authenticated, anon using (true);

create policy "Allow mutate assets for authenticated"
  on public.assets for all
  to authenticated using (true);

-- Product Versions: Authenticated can CRUD
create policy "Allow read product_versions"
  on public.product_versions for select
  to authenticated using (true);

create policy "Allow insert product_versions"
  on public.product_versions for insert
  to authenticated with check (true);

-- Audit Log: Authenticated can read
create policy "Allow read audit_log"
  on public.audit_log for select
  to authenticated using (true);

-- AI Runs: Authenticated can CRUD
create policy "Allow all ai_runs for authenticated"
  on public.ai_runs for all
  to authenticated using (true);

-- Templates: Everyone can read, Authenticated can mutate
create policy "Allow read templates"
  on public.templates for select
  to authenticated, anon using (true);

create policy "Allow mutate templates for authenticated"
  on public.templates for all
  to authenticated using (true);

-- ============================================================================
-- PCON CATALOG BUILDER — SUPABASE MIGRATION 00004: DOCUMENT WORKSPACE
-- Draft local: revisar a matriz de papéis antes de aplicar no projeto remoto.
-- ============================================================================

begin;

create type catalog_member_role as enum ('admin', 'editor', 'reviewer', 'viewer');
create type catalog_proposal_status as enum ('proposed', 'approved', 'rejected', 'applied', 'conflicted');
create type catalog_review_status as enum ('pending', 'approved', 'rejected');

-- Membership is scoped to a catalog. Invitations are inserted by a trusted flow
-- after the user's profile has been provisioned.
create table if not exists public.catalog_members (
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role catalog_member_role not null default 'editor',
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (catalog_id, user_id)
);

create index if not exists idx_catalog_members_user on public.catalog_members(user_id, catalog_id);

-- One row per A4 page. Layout details that are not structural remain in config.
create table if not exists public.catalog_pages (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  title text not null,
  sort_order int not null default 0 check (sort_order >= 0),
  visible boolean not null default true,
  page_config jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_catalog_pages_order on public.catalog_pages(catalog_id, sort_order);

-- Sections are normalized so the editor can reorder or update one block without
-- rewriting a complete document snapshot.
create table if not exists public.page_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.catalog_pages(id) on delete cascade,
  type text not null check (type in (
    'hero_banner', 'features_list', 'specs_table', 'comparison_grid',
    'image_gallery', 'single_image', 'text_block', 'accessories_table',
    'ordering_codes', 'contact_footer', 'blank_spacer', 'electrical_table',
    'general_specs_table', 'custom_table'
  )),
  title text not null,
  config jsonb not null default '{}'::jsonb,
  content jsonb,
  style jsonb not null default '{}'::jsonb,
  sort_order int not null default 0 check (sort_order >= 0),
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_page_sections_order on public.page_sections(page_id, sort_order);

-- Immutable document snapshots used by publish, rollback and visual diff.
create table if not exists public.catalog_versions (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  version int not null check (version > 0),
  snapshot jsonb not null,
  source text not null default 'user' check (source in ('user', 'ai', 'import', 'system')),
  summary text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (catalog_id, version)
);

create index if not exists idx_catalog_versions_catalog on public.catalog_versions(catalog_id, version desc);

create table if not exists public.catalog_reviews (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  version int not null check (version > 0),
  status catalog_review_status not null default 'pending',
  author_id uuid not null references public.profiles(id),
  reviewer_id uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (reviewer_id is null or reviewer_id <> author_id),
  check (status <> 'approved' or reviewer_id is not null)
);

create index if not exists idx_catalog_reviews_catalog on public.catalog_reviews(catalog_id, version, created_at desc);

-- Unified persistence for manual, import and AI proposals. `changes` follows
-- the ChangeProposal contract and is intentionally JSONB for forward evolution.
create table if not exists public.catalog_proposals (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  source text not null check (source in ('manual', 'import', 'ai')),
  summary text not null,
  changes jsonb not null check (jsonb_typeof(changes) = 'array'),
  status catalog_proposal_status not null default 'proposed',
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_catalog_proposals_catalog on public.catalog_proposals(catalog_id, created_at desc);
create index if not exists idx_catalog_proposals_product on public.catalog_proposals(product_id, created_at desc);

-- A product belongs to the master library and can be included in many catalogs.
-- Existing products.catalog_id remains for backward compatibility during migration.
create table if not exists public.catalog_product_links (
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order int not null default 0 check (sort_order >= 0),
  visible boolean not null default true,
  included_by uuid references public.profiles(id) on delete set null,
  included_at timestamptz not null default now(),
  primary key (catalog_id, product_id)
);

create index if not exists idx_catalog_product_links_product on public.catalog_product_links(product_id, catalog_id);
create index if not exists idx_catalog_product_links_order on public.catalog_product_links(catalog_id, sort_order);

-- Backfill only explicit legacy relationships; no cross-catalog membership is inferred.
insert into public.catalog_product_links (catalog_id, product_id, sort_order, visible)
select p.catalog_id, p.id, coalesce(p.sort_order, 0), true
from public.products p
where p.catalog_id is not null
on conflict (catalog_id, product_id) do nothing;

alter table public.assets add column if not exists mime_type text;
alter table public.assets add column if not exists byte_size bigint check (byte_size is null or byte_size >= 0);
alter table public.assets add column if not exists checksum text;
alter table public.assets add column if not exists processing_status text not null default 'ready'
  check (processing_status in ('pending', 'ready', 'failed'));

-- Centralized membership predicate for the new tables. SECURITY DEFINER avoids
-- recursive policy evaluation while keeping the function narrowly scoped.
create or replace function public.is_catalog_member(target_catalog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.catalog_members cm
    where cm.catalog_id = target_catalog_id
      and cm.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_catalog_member(uuid) from public;
grant execute on function public.is_catalog_member(uuid) to authenticated;

alter table public.catalog_members enable row level security;
alter table public.catalog_pages enable row level security;
alter table public.page_sections enable row level security;
alter table public.catalog_versions enable row level security;
alter table public.catalog_reviews enable row level security;
alter table public.catalog_proposals enable row level security;
alter table public.catalog_product_links enable row level security;

create policy "catalog members can read their memberships"
  on public.catalog_members for select to authenticated
  using (user_id = auth.uid() or public.is_catalog_member(catalog_id));

create policy "catalog admins can manage memberships"
  on public.catalog_members for all to authenticated
  using (public.is_catalog_member(catalog_id))
  with check (public.is_catalog_member(catalog_id));

create policy "catalog members can read pages"
  on public.catalog_pages for select to authenticated
  using (public.is_catalog_member(catalog_id));
create policy "catalog members can mutate pages"
  on public.catalog_pages for all to authenticated
  using (public.is_catalog_member(catalog_id))
  with check (public.is_catalog_member(catalog_id));

create policy "catalog members can read sections"
  on public.page_sections for select to authenticated
  using (exists (select 1 from public.catalog_pages cp where cp.id = page_id and public.is_catalog_member(cp.catalog_id)));
create policy "catalog members can mutate sections"
  on public.page_sections for all to authenticated
  using (exists (select 1 from public.catalog_pages cp where cp.id = page_id and public.is_catalog_member(cp.catalog_id)))
  with check (exists (select 1 from public.catalog_pages cp where cp.id = page_id and public.is_catalog_member(cp.catalog_id)));

create policy "catalog members can read versions"
  on public.catalog_versions for select to authenticated
  using (public.is_catalog_member(catalog_id));
create policy "catalog members can create versions"
  on public.catalog_versions for insert to authenticated
  with check (public.is_catalog_member(catalog_id));

create policy "catalog members can read reviews"
  on public.catalog_reviews for select to authenticated
  using (public.is_catalog_member(catalog_id));
create policy "catalog members can create reviews"
  on public.catalog_reviews for insert to authenticated
  with check (public.is_catalog_member(catalog_id));
create policy "catalog members can decide reviews"
  on public.catalog_reviews for update to authenticated
  using (public.is_catalog_member(catalog_id))
  with check (public.is_catalog_member(catalog_id));

create policy "catalog members can read proposals"
  on public.catalog_proposals for select to authenticated
  using (public.is_catalog_member(catalog_id));
create policy "catalog members can mutate proposals"
  on public.catalog_proposals for all to authenticated
  using (public.is_catalog_member(catalog_id))
  with check (public.is_catalog_member(catalog_id));

create policy "catalog members can read product links"
  on public.catalog_product_links for select to authenticated
  using (public.is_catalog_member(catalog_id));
create policy "catalog members can mutate product links"
  on public.catalog_product_links for all to authenticated
  using (public.is_catalog_member(catalog_id))
  with check (public.is_catalog_member(catalog_id));

commit;

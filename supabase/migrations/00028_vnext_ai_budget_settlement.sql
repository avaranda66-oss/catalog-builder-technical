-- 00028 · Liquidação do orçamento de IA (FR-62, plano father-ready 2026-10-15).
--
-- ADDITIVE ONLY. Not applied by the implementation slice: the owner checks the
-- 00027 ledger and applies it. Preview and production share this database, so
-- nothing here changes or removes what the deployed client and functions use:
-- vnext_agent_daily_budget and vnext_agent_reserve_budget(bigint) from 00027
-- stay exactly as they are and keep working.
--
-- What it adds:
--   1. vnext_agent_budget_settings  one row with the ceilings. Defaults are the
--      plan proposal (§5 item 5), pending the owner's approval:
--      US$ 0.50 per call, US$ 3 per user per day, US$ 60 per month for the
--      organization. Change them with an UPDATE in the SQL editor.
--   2. vnext_agent_budget_reservations  one row per provider attempt.
--   3. vnext_agent_reserve_budget_v2(worst_case, feature) -> reservation id, or
--      null when a ceiling would be crossed.
--   4. vnext_agent_settle_budget_v1(id, actual) -> settles the reservation by the
--      real usage (Gemini usageMetadata); actual = 0 refunds a provider error.
--   5. vnext_agent_budget_status_v1() -> what is left, for the "IA pronta" line.
--
-- The composer uses 3-5 only when VNEXT_CATALOG_AGENT_BUDGET_MODE=settled, and
-- falls back to 00027 automatically while this migration is not applied.
-- Fail closed: a reservation that is never settled keeps its worst case, and
-- 00027 reservations of the same user/day and month also count.
-- Security note: the reservation id is generated here and only the Edge Function
-- sees it (the tables have no client policies), so an author cannot refund calls
-- made through the composer; settlement only ever lowers a reservation, once,
-- within one hour. Requires the usual independent review before applying.

create table if not exists public.vnext_agent_budget_settings (
  singleton boolean primary key default true check (singleton),
  max_call_microusd bigint not null default 500000
    check (max_call_microusd between 1 and 5000000),
  max_user_day_microusd bigint not null default 3000000
    check (max_user_day_microusd between 1 and 50000000),
  max_user_day_requests integer not null default 150
    check (max_user_day_requests between 1 and 5000),
  max_org_month_microusd bigint not null default 60000000
    check (max_org_month_microusd between 1 and 1000000000),
  updated_at timestamptz not null default now()
);
insert into public.vnext_agent_budget_settings (singleton) values (true)
  on conflict (singleton) do nothing;
alter table public.vnext_agent_budget_settings enable row level security;
revoke all on public.vnext_agent_budget_settings from anon, authenticated;

create table if not exists public.vnext_agent_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  -- set null keeps a removed user's spend inside the organization month.
  user_id uuid references auth.users(id) on delete set null,
  feature text not null check (feature in ('composer', 'draft', 'translation', 'extraction')),
  usage_day date not null,
  usage_month date not null check (extract(day from usage_month) = 1),
  reserved_microusd bigint not null check (reserved_microusd > 0),
  settled_microusd bigint check (settled_microusd >= 0 and settled_microusd <= reserved_microusd),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  check ((settled_microusd is null) = (settled_at is null))
);
create index if not exists vnext_agent_budget_reservations_user_day_idx
  on public.vnext_agent_budget_reservations (user_id, usage_day);
create index if not exists vnext_agent_budget_reservations_month_idx
  on public.vnext_agent_budget_reservations (usage_month);
alter table public.vnext_agent_budget_reservations enable row level security;
revoke all on public.vnext_agent_budget_reservations from anon, authenticated;
-- No table policies. Only the hardened RPCs below read or write these tables.

-- Internal: what was already charged (settled amount, or the whole reservation
-- while it is open), plus the 00027 ledger. Not callable by clients.
create or replace function public.vnext_agent_budget_spent_v1(p_user uuid, p_day date, p_month date)
returns table (user_day_microusd bigint, user_day_requests integer, org_month_microusd bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select sum(coalesce(r.settled_microusd, r.reserved_microusd))
      from public.vnext_agent_budget_reservations r
      where r.user_id = p_user and r.usage_day = p_day), 0)::bigint
    + coalesce((select b.reserved_microusd from public.vnext_agent_daily_budget b
      where b.user_id = p_user and b.usage_day = p_day), 0)::bigint,
    (select count(*) from public.vnext_agent_budget_reservations r
      where r.user_id = p_user and r.usage_day = p_day)::integer,
    coalesce((select sum(coalesce(r.settled_microusd, r.reserved_microusd))
      from public.vnext_agent_budget_reservations r
      where r.usage_month = p_month), 0)::bigint
    + coalesce((select sum(b.reserved_microusd) from public.vnext_agent_daily_budget b
      where b.usage_day >= p_month and b.usage_day < (p_month + interval '1 month')::date), 0)::bigint
$$;
revoke all on function public.vnext_agent_budget_spent_v1(uuid, date, date) from public, anon, authenticated;

create or replace function public.vnext_agent_reserve_budget_v2(
  p_worst_case_microusd bigint,
  p_feature text default 'composer'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_settings public.vnext_agent_budget_settings%rowtype;
  v_day date := (now() at time zone 'UTC')::date;
  v_month date := date_trunc('month', now() at time zone 'UTC')::date;
  v_spent record;
  v_id uuid;
begin
  if v_user is null then return null; end if;
  if p_feature is null or p_feature not in ('composer', 'draft', 'translation', 'extraction') then return null; end if;
  -- Only active admins and editors (same rule as the Edge Functions).
  if coalesce(public.team_role()::text, '') not in ('admin', 'editor') then return null; end if;
  select * into v_settings from public.vnext_agent_budget_settings s where s.singleton;
  if not found then return null; end if;
  if p_worst_case_microusd is null
     or p_worst_case_microusd < 1
     or p_worst_case_microusd > v_settings.max_call_microusd then return null; end if;
  -- Serialize reservations: two concurrent calls cannot both pass a ceiling.
  perform pg_advisory_xact_lock(hashtext('public.vnext_agent_reserve_budget_v2'));
  select * into v_spent from public.vnext_agent_budget_spent_v1(v_user, v_day, v_month);
  if v_spent.user_day_requests >= v_settings.max_user_day_requests
     or v_spent.user_day_microusd + p_worst_case_microusd > v_settings.max_user_day_microusd
     or v_spent.org_month_microusd + p_worst_case_microusd > v_settings.max_org_month_microusd then
    return null;
  end if;
  insert into public.vnext_agent_budget_reservations (user_id, feature, usage_day, usage_month, reserved_microusd)
  values (v_user, p_feature, v_day, v_month, p_worst_case_microusd)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.vnext_agent_reserve_budget_v2(bigint, text) from public, anon;
grant execute on function public.vnext_agent_reserve_budget_v2(bigint, text) to authenticated;

create or replace function public.vnext_agent_settle_budget_v1(p_reservation_id uuid, p_actual_microusd bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null or p_reservation_id is null
     or p_actual_microusd is null or p_actual_microusd < 0 then return false; end if;
  update public.vnext_agent_budget_reservations r
     set settled_microusd = least(p_actual_microusd, r.reserved_microusd),
         settled_at = now()
   where r.id = p_reservation_id
     and r.user_id = v_user
     and r.settled_at is null
     and r.created_at > now() - interval '1 hour'
  returning r.id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function public.vnext_agent_settle_budget_v1(uuid, bigint) from public, anon;
grant execute on function public.vnext_agent_settle_budget_v1(uuid, bigint) to authenticated;

create or replace function public.vnext_agent_budget_status_v1()
returns table (
  remaining_user_day_microusd bigint,
  remaining_org_month_microusd bigint,
  user_day_requests integer,
  max_user_day_requests integer,
  max_call_microusd bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    greatest(s.max_user_day_microusd - spent.user_day_microusd, 0)::bigint,
    greatest(s.max_org_month_microusd - spent.org_month_microusd, 0)::bigint,
    spent.user_day_requests,
    s.max_user_day_requests,
    s.max_call_microusd
  from public.vnext_agent_budget_settings s
  cross join lateral public.vnext_agent_budget_spent_v1(
    (select auth.uid()),
    (now() at time zone 'UTC')::date,
    date_trunc('month', now() at time zone 'UTC')::date) spent
  where s.singleton
    and (select auth.uid()) is not null
    and coalesce(public.team_role()::text, '') in ('admin', 'editor')
$$;
revoke all on function public.vnext_agent_budget_status_v1() from public, anon;
grant execute on function public.vnext_agent_budget_status_v1() to authenticated;

comment on table public.vnext_agent_budget_settings is
  'FR-62 ceilings for Catalog AI spend (micro-USD). Defaults are the plan proposal pending owner approval.';
comment on table public.vnext_agent_budget_reservations is
  'FR-62 one row per provider attempt: worst-case reservation, later settled by real usage (0 refunds a provider error).';
comment on function public.vnext_agent_reserve_budget_v2(bigint, text) is
  'Atomic per-call, per-user/day and organization/month reservation; returns the reservation id or null. Counts 00027 spend.';
comment on function public.vnext_agent_settle_budget_v1(uuid, bigint) is
  'Settles an open reservation of the caller once, within one hour, to min(actual, reserved).';
comment on function public.vnext_agent_budget_status_v1() is
  'Remaining Catalog AI budget of the caller (day) and organization (month), for the readiness line.';

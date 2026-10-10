-- Draft only. Requires independent security review and explicit deployment approval.
-- Bounded per-user worst-case reservation BEFORE any Catalog AI provider call.
-- The function consumes budget even if Google later fails: fail-closed, no refund.
create table if not exists public.vnext_agent_daily_budget (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  reserved_microusd bigint not null default 0 check (reserved_microusd >= 0),
  requests integer not null default 0 check (requests >= 0),
  updated_at timestamptz not null default now(),
  primary key(user_id, usage_day)
);
alter table public.vnext_agent_daily_budget enable row level security;
revoke all on public.vnext_agent_daily_budget from anon, authenticated;
-- No table policies. Only the hardened RPC can reserve budget.

create or replace function public.vnext_agent_reserve_budget(p_worst_case_microusd bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_updated uuid;
begin
  if v_user is null then return false; end if;
  if p_worst_case_microusd is null
     or p_worst_case_microusd < 1
     or p_worst_case_microusd > 10000 then return false; end if;
  insert into public.vnext_agent_daily_budget(user_id, usage_day, reserved_microusd, requests)
  values (v_user, (now() at time zone 'UTC')::date, p_worst_case_microusd, 1)
  on conflict (user_id, usage_day)
  do update set
    reserved_microusd = public.vnext_agent_daily_budget.reserved_microusd + excluded.reserved_microusd,
    requests = public.vnext_agent_daily_budget.requests + 1,
    updated_at = now()
  where public.vnext_agent_daily_budget.reserved_microusd + excluded.reserved_microusd <= 100000
    and public.vnext_agent_daily_budget.requests < 25
  returning user_id into v_updated;
  return v_updated is not null;
end;
$$;

revoke all on function public.vnext_agent_reserve_budget(bigint) from public, anon;
grant execute on function public.vnext_agent_reserve_budget(bigint) to authenticated;

comment on function public.vnext_agent_reserve_budget(bigint) is
  'Atomic per-auth.uid UTC daily worst-case AI spend reserve, maximum $0.10/day and 25 requests, no refunds. Draft migration.';

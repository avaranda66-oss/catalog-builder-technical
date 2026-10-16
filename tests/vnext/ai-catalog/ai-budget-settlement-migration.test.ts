// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPOSER_OUTPUT_TOKENS, composerReservationMicrousd } from '../../../src/vnext/ai-catalog/composer-contract';

// Static verification only: no database is available locally and the slice
// never applies migrations. The owner applies 00028 after checking the ledger.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const sql = read('supabase/migrations/00028_vnext_ai_budget_settlement.sql');
const legacy = read('supabase/migrations/00027_vnext_agent_daily_budget.sql');
const edge = read('supabase/functions/vnext-catalog-composer/index.ts');
const code = sql.replace(/--.*$/gm, '');
const defaultOf = (column: string) => Number(new RegExp(column + String.raw`\s+\w+\s+not null default (\d+)`, 'i').exec(code)?.[1]);

describe('migration 00028 (budget settlement) is additive and matches the composer', () => {
  it('never drops, renames or redefines what the deployed 00027 client and functions use', () => {
    expect(code).not.toMatch(/\bdrop\s/i);
    expect(code).not.toMatch(/\balter\s+(table|function)\s+public\.vnext_agent_daily_budget\b/i);
    expect(code).not.toMatch(/function\s+public\.vnext_agent_reserve_budget\s*\(/i);
    expect(code).not.toMatch(/\btruncate\b|\bdelete\s+from\b/i);
    // 00027 still defines the legacy reservation the composer falls back to.
    expect(legacy).toMatch(/function public\.vnext_agent_reserve_budget\(p_worst_case_microusd bigint\)/);
  });

  it('declares exactly the RPCs and parameter names the composer calls', () => {
    expect(edge).toContain("db.rpc('vnext_agent_reserve_budget_v2'");
    expect(edge).toContain('p_worst_case_microusd: microusd, p_feature: \'composer\'');
    expect(edge).toContain("db.rpc('vnext_agent_settle_budget_v1', { p_reservation_id: id, p_actual_microusd: actualMicrousd })");
    expect(edge).toContain("db.rpc('vnext_agent_budget_status_v1')");
    expect(code).toMatch(/function public\.vnext_agent_reserve_budget_v2\(\s*p_worst_case_microusd bigint,\s*p_feature text default 'composer'\s*\)\s*returns uuid/i);
    expect(code).toMatch(/function public\.vnext_agent_settle_budget_v1\(p_reservation_id uuid, p_actual_microusd bigint\)\s*returns boolean/i);
    expect(code).toMatch(/function public\.vnext_agent_budget_status_v1\(\)\s*returns table \(\s*remaining_user_day_microusd bigint,\s*remaining_org_month_microusd bigint/i);
    expect(edge).toContain('value.remaining_user_day_microusd');
    expect(edge).toContain('value.remaining_org_month_microusd');
  });

  it('keeps the tables private and every function hardened', () => {
    for (const table of ['vnext_agent_budget_settings', 'vnext_agent_budget_reservations']) {
      expect(code).toContain(`alter table public.${table} enable row level security;`);
      expect(code).toContain(`revoke all on public.${table} from anon, authenticated;`);
      expect(code).not.toMatch(new RegExp(`create policy[^;]*${table}`, 'i'));
    }
    const functions = [...code.matchAll(/create or replace function (public\.\w+)\(/g)].map(match => match[1]);
    expect(functions).toEqual(['public.vnext_agent_budget_spent_v1', 'public.vnext_agent_reserve_budget_v2',
      'public.vnext_agent_settle_budget_v1', 'public.vnext_agent_budget_status_v1']);
    expect(code.match(/security definer\s+set search_path = ''/g)).toHaveLength(4);
    // The internal sum is never callable by clients; the three RPCs only by signed-in users.
    expect(code).toContain('revoke all on function public.vnext_agent_budget_spent_v1(uuid, date, date) from public, anon, authenticated;');
    expect(code).not.toMatch(/grant execute on function public\.vnext_agent_budget_spent_v1/);
    for (const signature of ['vnext_agent_reserve_budget_v2(bigint, text)', 'vnext_agent_settle_budget_v1(uuid, bigint)', 'vnext_agent_budget_status_v1()']) {
      expect(code).toContain(`revoke all on function public.${signature} from public, anon;`);
      expect(code).toContain(`grant execute on function public.${signature} to authenticated;`);
    }
  });

  it('reserves atomically, for active editors only, and counts the 00027 ledger (fail closed)', () => {
    expect(code).toContain("pg_advisory_xact_lock(hashtext('public.vnext_agent_reserve_budget_v2'))");
    expect(code).toMatch(/public\.team_role\(\)::text, ''\) not in \('admin', 'editor'\)/);
    expect(code).toMatch(/from public\.vnext_agent_daily_budget b\s+where b\.user_id = p_user and b\.usage_day = p_day/);
    expect(code).toMatch(/sum\(coalesce\(r\.settled_microusd, r\.reserved_microusd\)\)/);
  });

  it('settles once, only downwards, only the caller\'s own open reservation', () => {
    expect(code).toMatch(/set settled_microusd = least\(p_actual_microusd, r\.reserved_microusd\)/);
    expect(code).toMatch(/r\.user_id = v_user\s+and r\.settled_at is null\s+and r\.created_at > now\(\) - interval '1 hour'/);
    expect(code).toMatch(/check \(settled_microusd >= 0 and settled_microusd <= reserved_microusd\)/);
  });

  it('defaults to the ceilings proposed in the plan, and a composer attempt fits the per-call ceiling', () => {
    expect(defaultOf('max_call_microusd')).toBe(500_000); // US$ 0.50 per call
    expect(defaultOf('max_user_day_microusd')).toBe(3_000_000); // US$ 3 per user per day
    expect(defaultOf('max_org_month_microusd')).toBe(60_000_000); // US$ 60 per month
    const first = composerReservationMicrousd('settled', 'first');
    expect(first).toBeLessThanOrEqual(defaultOf('max_call_microusd'));
    // About 10 father requests a day (each possibly with one repair) fit the daily ceiling with room to spare.
    const repair = composerReservationMicrousd('settled', 'retry');
    expect(15 * (first + repair)).toBeLessThan(defaultOf('max_user_day_microusd'));
    expect(15 * 2).toBeLessThanOrEqual(defaultOf('max_user_day_requests'));
    expect(COMPOSER_OUTPUT_TOKENS.settled.first).toBeGreaterThan(COMPOSER_OUTPUT_TOKENS.legacy.first);
  });
});

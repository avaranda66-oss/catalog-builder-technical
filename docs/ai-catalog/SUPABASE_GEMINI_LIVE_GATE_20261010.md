# Catalog Builder VNext — Supabase/Gemini Live Gate (auditoria conectada)
2026-10-10 · **READ-ONLY inspection; no migration, deployment, billing, secret update or real model call performed**

## Confirmed connection
- Supabase project `Catalogpresys`, ref `bjxqvrpbigwgabwbhtqa`, sa-east-1, `ACTIVE_HEALTHY`.
- Existing Edge Functions: `translation-provider-v1` and `vnext-translation-provider` (JWT enforced). **Neither** `vnext-catalog-agent` nor `vnext-catalog-composer` is deployed.
- Production main schema migration history ends with `00025_vnext_asset_persistence`; repo contains **draft** `supabase/migrations/00027_vnext_agent_daily_budget.sql` not applied.
- Read-only SQL verified both `public.vnext_agent_daily_budget` and `public.vnext_agent_reserve_budget(bigint)` are **ABSENT**. Thus the Gemini Edge route cannot presently reserve durable quota.
- `public.profiles` has `admin, editor, viewer` enum with RLS enabled; aggregate current result showed 3 active admins. The actual JWT/user role and edit rights must still be tested by authenticated acceptance, not inferred from schema.
- No separate Supabase dev branch exists. Do not run DDL or deploy an experimental function to production to approximate a test branch.

## Existing draft contract
- `supabase/migrations/00027_vnext_agent_daily_budget.sql`: explicit **draft only, independent security review and deployment approval**. Creates per-user/UTC-day reservation table with no direct authenticated table privileges, RLS enabled and definer RPC with restricted `search_path`. Explicit `revoke all from public, anon` then `grant execute to authenticated`. Caps worst-case reservation input at US$0.01, daily aggregate at US$0.10 per user, max 25 reservations/day. No refunds when Google fails.
- Compose route pinned `gemini-3.5-flash-lite`, official Google price as reviewed 2026-10-10: US$0.30/1M text input, US$2.50/1M text output. For max 12,000 input and 2,300 output tokens, reserves **US$0.00935** per model request. This is a conservative configured upper-bound quote, not observed user billing. Google documentation: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite and https://ai.google.dev/gemini-api/docs/pricing.
- The Supabase Auth Edge documentation recommends dual platform JWT verification plus `getUser` in handler with user-aware RLS context: https://supabase.com/docs/guides/functions/auth-legacy-jwt.

## Required order, not yet authorized
1. Obtain approval for **a non-production staging/acceptance environment and any branch costs**. The connected Supabase account currently exposes only production; do not silently create billable resources.
2. Independently review `00027` privileges, atomic UPSERT and auth.uid isolation. Execute/rollback tests on isolated branch with a test user and two concurrent reservations. Confirm second user separation, anon DENIED, daily cap and daily UTC rollover.
3. Only then migrate approved schema into the intended controlled environment. Re-query `pg_proc` and table privileges and run Supabase security advisors.
4. Deploy exactly the reviewed SHA of `vnext-catalog-composer` with `verify_jwt=true`; keep `VNEXT_CATALOG_COMPOSER_ENABLED` absent or `false`. First prove HTTP 503 without provider fetch or reservation.
5. In separate authorized acceptance window, set **explicit origin allowlist**, `VNEXT_CATALOG_AGENT_BUDGET_MODE=bounded-acceptance`, `VNEXT_CATALOG_AGENT_BYOK_ENABLED=true` and enable composer. Unlocked key must be **fresh and entered in-browser**, not in chat or a tool argument; rotate any historical pasted key.
6. Run one real authenticated test with production-like user role, real provider, verified countTokens, output JSON schema and app proposal, explicit approval, native A4 edit, save/reopen from VNext cloud and exported PDF; record exact commit, deployment ID, total tokens, estimated/actual cost, latency, remaining quota, failing requests and browser proof. Abort on failures or unexpected costs.
7. Complete PDF source-to-value grounding, dense institutional pagination and uncoached Marc pilot before any Father-ready/employee release claim.

## Security advisory (pre-existing, do not alter blindly)
Read-only Supabase security advisor reported **15** existing `SECURITY DEFINER` functions with `EXECUTE` available to `anon`. Some may deliberately protect own data with explicit `auth.uid()` checks. Conduct per-RPC review before revoking grants: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable.

## Automated proof included in PR
`tests/vnext/ai-catalog/composer-edge-bounded.test.ts` mocks all network/auth/DB and checks disabled-by-default, disallowed Origin, absence of authentication, inactive/viewer profile, disabled BYOK, quota rejection, ordering of quota before Google countTokens/generateContent, valid scaffold, explicit selected text, invalid specs/executable fields, malformed history and truncation. **No real Google call or production DB transaction**.

## Estado operacional posterior — atualização desta continuação

As seções anteriores são um snapshot histórico anterior à implantação, não o estado atual. O recibo externo `SUPABASE_GEMINI_DEPLOY_20261010.md` documenta a migration de orçamento já aplicada e a função `vnext-catalog-composer` ACTIVE versão 1, JWT obrigatório, fonte PR83 `fa2dfa86f490bfec4f0b039b3ebc0cade5ef2fbd`, bundle SHA256 `c7628f2fb4d48cbf7e8087aa8069e491d0d7eecbeaeb510ddf11a16cac3ea87f`. Não repetir esses procedimentos.

Com autorização direta do usuário, esta rodada habilitou somente `VNEXT_CATALOG_COMPOSER_ENABLED=true`, `VNEXT_CATALOG_AGENT_BYOK_ENABLED=true`, `VNEXT_CATALOG_AGENT_BUDGET_MODE=bounded-acceptance` e a lista explícita `VNEXT_CATALOG_ALLOWED_ORIGINS`. O CLI oficial reutilizou a autenticação existente; readback dos quatro digests conferiu e os outros nove permaneceram iguais. Nenhuma credencial aparece nos recibos. Sem nova migration, redeploy ou chamada Google nessa ativação. Quota existente e teto acumulado autorizado R$50 preservados. POST não autenticado continua HTTP401; isso não comprova o fluxo autenticado.

Origens verificadas: `https://catalog-builder-technical.vercel.app`, main imutável `https://catalog-builder-technical-8uxou80uo-gabriels-projects-46d997f6.vercel.app` e preview PR86 `https://catalog-builder-technical-bdtrmdfw9-gabriels-projects-46d997f6.vercel.app`. O alias móvel é a entrada `/v2`; sua associação ao novo HEAD será verificada depois da integração. Uma nova preview precisa entrar na lista explicitamente, sem wildcard.

Limite confirmado na fonte implantada: somente `compose_scaffold` e `revise_selected_text`; ela não recebe PDFs nem interpreta imagens e não tem o campo `design` acrescentado depois pela PR85. A ausência de design usa o comparativo padrão compatível. Habilitar flags não implanta a versão nova nem comprova extração industrial. A próxima operação bounded de extração depende de revisão e autorização separadas de redeploy.

O usuário autorizou a chave temporária já fornecida e R$50 acumulados; não pedir substituição ou novo orçamento como requisito desta prova. Continuam obrigatórios: uso em memória, ausência de credenciais em código/logs, reserva antes da chamada e ledger que mantém as quatro tentativas reais anteriores. O teste autenticado em `/v2`, cloud save/reopen e Gemini real desta versão continuam pendentes. Provas com fixtures e mocks não aprovam Marc.

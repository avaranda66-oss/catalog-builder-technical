# Story — Rollout remoto da plataforma corporativa

**Status:** In Progress  
**Origem:** briefing aprovado, `docs/briefing.md`, Supabase `00004_team_workspace`

## História

Como equipe Presys, quero publicar a implementação corporativa no repositório conectado à Vercel, para testar autenticação, persistência transacional e editor visual com o banco remoto real.

## Critérios de aceite

- [x] A implementação usa Auth individual, papéis e RLS já aplicados no Supabase remoto.
- [x] Salvamento e leitura usam as RPCs transacionais do workspace.
- [x] O modo local continua disponível sem inventar identidade autenticada.
- [x] O design do baseline antigo é preservado.
- [x] Lint, typecheck, testes e build passam localmente.
- [x] A branch de rollout é publicada no GitHub para Preview da Vercel.
- [x] O Site URL e os redirects do Auth remoto apontam para a Vercel e preservam localhost.
- [ ] Testar login, criação de senha, salvar, importar, revisar e exportar no Preview remoto depois de configurar as variáveis públicas no Vercel.
- [ ] Promover a branch para `main` somente após o teste remoto.

## Dados remotos verificados

- Projeto Supabase: `Catalogpresys` (`bjxqvrpbigwgabwbhtqa`), saudável.
- `00004_team_workspace` já aplicada; não reaplicar migration incompatível.
- Conta de teste `gabrielvantournhoudt@gmail.com` confirmada, ativa e com papel `admin`.
- Catálogo publicado existente preservado.

## Estado do deploy remoto

- PR aberto: `https://github.com/avaranda66-oss/catalog-builder-technical/pull/1`.
- Deploy publicado com as alterações até o commit `75414b3`\.
- Vercel marcou o deploy como pronto; o alias público é `https://catalog-builder-technical.vercel.app`.
- O HTML público responde, mas `/api/ai/chat` retorna `503` porque o projeto Vercel ainda não recebeu `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- O preview Netlify retorna `401` para a mesma rota, confirmando que a proteção de autenticação está ativa quando o ambiente remoto possui a configuração.
- Após preencher as variáveis no Vercel, é necessário fazer um novo deploy do PR antes de testar o fluxo autenticado.

## File list

- `app/`
- `components/`
- `features/editor/`
- `lib/`
- `supabase/README.md`
- `supabase/migrations/00004_team_workspace.sql`
- `.aiox-core/`
- `.codex/skills/aiox-*`
- `docs/briefing.md`
- `docs/prd.md`
- `docs/architecture.md`

## Dev Agent Record

### Completion notes

A branch separada reúne a implementação local corporativa e o framework AIOX. O Supabase foi consultado por Management API para confirmar o schema e a conta de teste; a URL do Auth foi ajustada para a Vercel e nenhum dado de catálogo foi alterado. O deploy remoto está pronto, aguardando apenas as variáveis públicas do Vercel para a validação autenticada.

### Validation

`npm test` passou com 47 casos; `npm run typecheck`, `npm run lint -- --quiet` e `npm run build` passaram. O deploy Vercel do PR ficou pronto; o teste autenticado depende de configurar as variáveis públicas do Supabase no ambiente Preview do projeto Vercel.

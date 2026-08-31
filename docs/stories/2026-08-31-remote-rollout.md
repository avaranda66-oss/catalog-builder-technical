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
- [ ] Testar login, criação de senha, salvar, importar, revisar e exportar no Preview remoto.
- [ ] Promover a branch para `main` somente após o teste remoto.

## Dados remotos verificados

- Projeto Supabase: `Catalogpresys` (`bjxqvrpbigwgabwbhtqa`), saudável.
- `00004_team_workspace` já aplicada; não reaplicar migration incompatível.
- Conta de teste `gabrielvantournhoudt@gmail.com` confirmada, ativa e com papel `admin`.
- Catálogo publicado existente preservado.

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

A branch separada reúne a implementação local corporativa e o framework AIOX. O Supabase foi consultado por Management API para confirmar o schema e a conta de teste; nenhuma alteração de dados foi feita nesta etapa.

### Validation

`npm test` passou com 47 casos; `npm run typecheck`, `npm run lint -- --quiet` e `npm run build` passaram. O build local usa um worker por limitação de subprocessos do ambiente; a configuração versionada continua sem esse override.

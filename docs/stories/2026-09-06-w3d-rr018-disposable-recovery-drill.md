# W3-D / RR018 — Disposable Full Recovery Drill

**Status:** Ready for Review
**Base:** `de6ed28ed184c8a0dbfd61b5985143eab8caf9ef`
**Branch:** `remediation/w3d-rr018-disposable-recovery-drill`

## Story

Como responsável por readiness, quero um recovery drill executável em infraestrutura descartável para provar que o schema, dados sintéticos representativos, referências/objeto de Storage, backup, destruição, restore e verificações críticas sobrevivem a um ciclo completo sem tocar produção.

## Acceptance Criteria

- [x] Inventário machine-checkable cobre as entidades críticas existentes, sem inventar tabelas.
- [x] Baseline descartável aplica o caminho histórico suportado e registra os bridges necessários.
- [x] Fixture sintética determinística cobre relações de catálogo, família, produtos, workbooks, evidência, índices, assets e auditoria.
- [x] Backup lógico separa schema, dados públicos e referência Auth sintética, com manifest SHA-256.
- [x] Storage local recebe objeto real quando o serviço local Supabase está disponível e o objeto é preservado no backup.
- [x] A primeira stack é destruída antes da criação da segunda stack.
- [x] A segunda stack é restaurada somente a partir dos artefatos de backup.
- [x] Verificação automática falha se entidade crítica, relação, policy/RLS, grant, função, trigger, referência DB↔Storage ou checksum obrigatório estiver ausente.
- [x] O drill mede `rehearsal restore duration` e duração total sem alegar RPO/PITR de produção.
- [x] Workflow GitHub Actions é isolado à branch RR018 (manual quando despachável e bootstrap por push da própria branch), sem secrets e sem operação destrutiva externa.
- [x] Limitações e evidências ainda dependentes da conta Supabase production ficam explicitamente não verificadas.

## Dev Agent Record

### Completion Notes

- Implementado runner CLI `scripts/recovery/rr018-disposable-recovery-drill.sh` com guard `RR018_DISPOSABLE=1` e conexão fixa em loopback.
- Baseline registra três bridges históricos já existentes: `db-release0-live-baseline.sql`, `db-release0-gap2-pre14.sql` e `db-release0-gap2-post14.sql`.
- Restore usa `public-schema.dump`, `public-data.dump`, `auth-users.sql` e objeto de Storage copiado do primeiro ambiente; a fixture original não é reaplicada no segundo ambiente.
- Workflow `.github/workflows/rr018-disposable-recovery-drill.yml` oferece `workflow_dispatch`; como workflows novos não podem ser despachados antes de existirem na default branch, o bootstrap de evidência também aceita `push` somente da branch RR018 e publica evidência por artifact.
- Follow-up do drill usa pg_dump/pg_restore do container PostgreSQL 17 descartável, captura supabase start sem expor credenciais efêmeras e publica evidence em diretório não oculto; a chain limpa continua dependendo explicitamente dos três bridges históricos acima.
- Restore closure remove `--clean` da Stack B fresh, materializa o TOC real com `pg_restore -l` no container PostgreSQL 17 e filtra somente as três `DEFAULT ACL` de plataforma de `supabase_admin`; ACLs explícitas da aplicação permanecem no restore e sob verificação pós-restore.
- Run 34065962861 confirmou PostgreSQL 17.6, exatamente três DEFAULT ACLs de `supabase_admin` e 68 ACLs explícitas preservadas; follow-up também exclui fail-closed a única criação TOC do schema `public`, já presente e com baseline owner/ACL idêntico na Stack B fresh.
- Run 34066930330 provou schema/auth restore com sucesso e expôs o próximo erro real no data restore: `--disable-triggers` tentou alterar triggers RI do PostgreSQL sem autoridade e o replay com triggers de auditoria ativos criou colisão em `audit_log`. O follow-up mantém FKs ativos, desabilita somente os três triggers de auditoria da aplicação durante o snapshot restore e exige que eles terminem habilitados.
- Run 34067488331 provou schema/auth/data/nonpublic/Storage restore sem erros de `pg_restore`, mas o verify-after detectou ACL efetiva divergente. O dump preservava todas as ACL entries da aplicação; a causa era a DEFAULT ACL de plataforma de `postgres` já ativa na Stack B fresh durante a criação dos objetos. O follow-up suspende apenas esses grants default não-owner durante a criação, preserva no TOC as três DEFAULT ACLs de `postgres` para recompor a baseline, compara as seis DEFAULT ACLs de plataforma before/fresh/after-schema/after e bloqueia qualquer DEFAULT ACL adicional ou classe esperada ausente.

### File List

- `.github/workflows/rr018-disposable-recovery-drill.yml`
- `docs/readiness/rr018-disposable-recovery-drill.md`
- `docs/stories/2026-09-06-w3d-rr018-disposable-recovery-drill.md`
- `scripts/recovery/rr018-critical-entities.json`
- `scripts/recovery/rr018-disposable-recovery-drill.sh`
- `scripts/recovery/rr018-fixture.sql`
- `scripts/recovery/rr018-verify.sql`
- `tests/readiness/rr018-disposable-recovery-drill.test.ts`

### Change Log

- 2026-09-06: RR018 disposable recovery drill implementado para auditoria do Principal.
- 2026-09-06: Follow-up de recovery corrige compatibilidade PostgreSQL 17, sanitização do startup local e publicação de artifacts sem alterar migrations históricas.
- 2026-09-06: Restore closure passa a usar restore list fail-closed para excluir somente DEFAULT ACLs de plataforma já presentes na Stack B fresh, preservando grants/policies/functions/triggers/RLS da aplicação.
- 2026-09-06: Evidência do run 34065962861 refinou o restore list para excluir também a única criação do schema `public` pertencente ao baseline fresh, com snapshot before/fresh/after de owner/ACL.
- 2026-09-06: Evidência do run 34066930330 removeu a dependência de `--disable-triggers` no data restore; apenas os três triggers de auditoria da aplicação são pausados durante o COPY, com FK checks preservados e restore transacional/fail-closed.
- 2026-09-06: Evidência do run 34067488331 isolou o desvio de grants na interação entre objetos criados por `postgres` e as DEFAULT ACLs já presentes na Stack B fresh; o restore passa a neutralizar temporariamente apenas os grants default não-owner, exige exatamente as seis classes de DEFAULT ACL esperadas e prova a recomposição da baseline de plataforma antes de seguir.

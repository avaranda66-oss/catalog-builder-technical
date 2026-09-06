# RR018 Disposable Full Recovery Drill

RR018 prova recovery somente em infraestrutura descartável. O runner recusa execução sem `RR018_DISPOSABLE=1`, fixa PostgreSQL em `127.0.0.1:54322` e o workflow não recebe secrets nem contém integração com projeto Supabase remoto. O workflow aceita `workflow_dispatch` e, enquanto o arquivo ainda não existe na default branch, possui bootstrap por `push` restrito exatamente a `remediation/w3d-rr018-disposable-recovery-drill`, pois o GitHub não permite despachar manualmente um workflow novo que só exista na feature branch.

## Architecture

1. **Stack A / clean environment:** inicia Supabase local com migrations `00001-00004`, aplica os bridges históricos já existentes, completa `00005-00023` e valida o schema resultante.
2. **Representative fixture:** cria usuário Auth sintético, profile, família/campo, catálogo/produto/versões, workbook, source document, índices projetados, asset/vínculo e eventos de auditoria. Um PNG determinístico é enviado ao bucket local `product-assets`.
3. **Backup:** gera dumps separados de schema e dados de `public`, dados de `auth.users`, buckets de Storage, controles não-`public` (trigger Auth + policies de Storage), cópia física do objeto Storage e manifest SHA-256. `pg_dump`/`pg_restore` rodam dentro do container PostgreSQL descartável para usar a mesma major version do servidor.
4. **Destroy:** executa `supabase stop --no-backup` somente no projeto temporário da Stack A.
5. **Stack B / fresh restore:** inicia um segundo Supabase local sem migrations da aplicação e restaura schema, Auth sintético, dados e Storage exclusivamente dos artefatos produzidos na fase de backup.
6. **Verify:** executa `rr018-verify.sql`, compara counts antes/depois e confirma o SHA-256 do objeto baixado após o restore.

## Baseline histórico observado

As migrations rastreadas não são autossuficientes como cadeia limpa. O próprio rehearsal existente do repositório já exige três bridges, preservados explicitamente por RR018:

| Bridge | O que falta sem ele | Por quê |
| --- | --- | --- |
| `scripts/db-release0-live-baseline.sql` | `public.media_library` antes da `00005` | A `00005_secure_shared_persistence.sql` referencia uma tabela que não nasce em `00001-00004`. |
| `scripts/db-release0-gap2-pre14.sql` | forma histórica reconciliada de assets/media | Prepara o estado esperado pela transição de asset hardening. |
| `scripts/db-release0-gap2-post14.sql` | forma reconciliada posterior | Restaura o shape histórico necessário depois da faixa `00014-00021`. |

RR018 não altera migrations históricas e não cria migration estrutural para esconder esses gaps. Uma futura correção do baseline deve ser decidida separadamente pelo Principal.

## Backup artifacts policy

Os artefatos de execução não são commitados. No GitHub Actions eles são publicados como `rr018-disposable-recovery-evidence` por 30 dias e incluem `public-schema.dump`, `public-data.dump`, `auth-users.sql`, `storage-buckets.sql`, `nonpublic-controls.sql`, cópia do objeto de Storage, `critical-entities.json`, `counts-before.tsv`, `counts-after.tsv`, `manifest.sha256`, `result.env` e `rr018-drill.log`.

O output normal de `supabase start` é capturado em arquivo temporário e não é enviado ao log do job, evitando exposição das chaves efêmeras geradas para a stack local. Em falha de startup, somente uma versão sanitizada do log é exibida.

O manifest usa SHA-256 e é verificado antes do restore. O objeto restaurado também é baixado novamente da segunda stack e seu SHA-256 precisa ser idêntico ao original.

## Verification matrix

| Área | Evidência automática |
| --- | --- |
| Entidades críticas | `to_regclass` + inventário JSON; falha se qualquer tabela crítica estiver ausente. |
| PK/FK | `pg_constraint` exige PK e FKs nas relações críticas. |
| Owner | workbook deve apontar para o produto sintético correto. |
| Catalog → products | `catalog_products` deve preservar o vínculo. |
| Versions | `catalog_versions` e `product_versions` preservados. |
| Workbook payload | schemaVersion, owner, revision e evidence source id verificados. |
| Source/evidence | `product_source_documents.file_reference` e checksum verificados. |
| Projected indexes | `product_technical_data_index` e `product_dataset_search_index` devem preservar `0.05 degC`. |
| Audit | `audit_log`, `library_change_events` e `asset_audit_logs` precisam conter evidência sintética. |
| RLS/policies | `relrowsecurity` e ao menos uma policy em cada tabela crítica. |
| Grants/functions | SELECT/INSERT de workbook e EXECUTE de `save_product_workbook_v2` verificados para `authenticated`/`anon`; funções críticas precisam existir. |
| Triggers | triggers de audit, guard de workbook e provisionamento `auth.users → profiles` precisam existir. |
| Storage policies | policies de leitura/escrita de `product-assets` em `storage.objects` precisam sobreviver ao restore. |
| DB ↔ Storage | `assets.storage_bucket/storage_path/sha256`, `product_assets` e `storage.objects` precisam concordar. |
| Counts | `counts-before.tsv` e `counts-after.tsv` devem ser idênticos. |
| Hashes | manifest de backup e download pós-restore usam SHA-256. |

## RPO/RTO scope

O runner mede `RR018_REHEARSAL_RESTORE_DURATION_SECONDS` e `RR018_TOTAL_DRILL_DURATION_SECONDS`. A primeira métrica é somente **rehearsal restore duration** em GitHub Actions/Supabase local; ela não é RTO de produção. RR018 não mede RPO real nem prova PITR de produção.

## Limitações e evidência ainda dependente da conta production

RR018 não responde e não deve inferir:

- PITR enabled? **NOT VERIFIED**
- retention? **NOT VERIFIED**
- last recovery point? **NOT VERIFIED**
- Storage backup policy? **NOT VERIFIED**
- secrets/config escrow? **NOT VERIFIED**

Esses itens exigem evidência futura da infraestrutura/conta Supabase production e permanecem fora do alcance deste drill descartável.

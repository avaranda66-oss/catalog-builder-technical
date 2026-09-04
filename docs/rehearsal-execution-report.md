# PostgreSQL Real Migration Rehearsal Execution Log (PIM.PRODUCTION.CORE1.2)

- **Data / Timestamp:** `2026-09-04T01:38:08Z`
- **Ambiente:** GitHub Actions Ubuntu Runner isolado / Supabase CLI 2.116.0 (Disposable Stack)
- **PostgreSQL Server Version:** `PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit`
- **PostgreSQL Client Version:** `psql (PostgreSQL) 16.15 (Ubuntu 16.15-1.pgdg24.04+2)`
- **GitHub Actions Run ID:** `33826227465`
- **Workflow Run URL:** [https://github.com/avaranda66-oss/catalog-builder-technical/actions/runs/33826227465](https://github.com/avaranda66-oss/catalog-builder-technical/actions/runs/33826227465)
- **Job ID:** `100879362429` (Duração: 4m50s)
- **Artefato Gerado no GitHub:** `rehearsal-execution-evidence` (ID: `9919996206`)
- **Download URL:** [https://github.com/avaranda66-oss/catalog-builder-technical/actions/runs/33826227465/artifacts/9919996206](https://github.com/avaranda66-oss/catalog-builder-technical/actions/runs/33826227465/artifacts/9919996206)

---

### MIGRATION CHECKSUMS
- **00022 SHA-256:** `74c6ce030fa139ce644ac87fbd87acb7ac8f109841b118dd4f9e1f0d6973ef87`
- **00023 SHA-256:** `fe0400c4eb01c035a84d118dc1fa38463199babf47eb6f4224d469748c197a57`

---

### MATRIZ OBRIGATÓRIA DE EXECUÇÃO REAL (28 / 28 PASS)

| # | Ponto da Matriz | Resultado | Detalhes da Execução Real |
|---|-----------------|-----------|---------------------------|
| 01 | FIRST APPLY 00023 | **PASS** | Migration `00023` aplicada com sucesso sobre o estado confirmado de `00022`. |
| 02 | SECOND APPLY / IDEMPOTENCE | **PASS** | Reaplicação idêntica de `00023` sem erros; objetos já existentes tratados com `IF NOT EXISTS` e idempotência. |
| 03 | save_product_workbook_v1 first save | **PASS** | Workbook V1 salvo com expectedRevision = 0; retornado revision = 1. |
| 04 | save_product_workbook_v1 update | **PASS** | Workbook V1 atualizado com expectedRevision = 1; retornado revision = 2. |
| 05 | get_product_workbook_v1 | **PASS** | Leitura confirma `schemaVersion: 1` e `revision: 2`. |
| 06 | save_product_workbook_v2 first save | **PASS** | Workbook V2 salvo com expectedRevision = 0; retornado revision = 1. |
| 07 | save_product_workbook_v2 update | **PASS** | Workbook V2 atualizado com expectedRevision = 1; retornado revision = 2. |
| 08 | get_product_workbook_v2 | **PASS** | Leitura confirma `schemaVersion: 2`, `revision: 2` e 1 dataset. |
| 09 | V2 payload enviado ao V1 | **REJECT** | Bloqueado: `schemaVersion deve ser o inteiro 1` (`INVALID_WORKBOOK_SCHEMA`). |
| 10 | V1 payload enviado ao V2 | **REJECT** | Bloqueado: `schemaVersion deve ser o inteiro 2 para a API v2` (`INVALID_WORKBOOK_SCHEMA`). |
| 11 | CAS conflict real | **PASS** | Concorrência bloqueada com `SQLSTATE 40001` (`WORKBOOK_CONFLICT`). |
| 12 | dataset module orphan | **REJECT** | Bloqueado com `DATASET_MODULE_NOT_FOUND` (`SQLSTATE 23503`). |
| 13 | datum module orphan | **REJECT** | Bloqueado com `DATUM_MODULE_NOT_FOUND` (`SQLSTATE 23503`). |
| 14 | dataset cell datum orphan | **REJECT** | Bloqueado com `DATASET_CELL_DATUM_NOT_FOUND` (`SQLSTATE 23503`). |
| 15 | dataset row orphan | **REJECT** | Bloqueado com `DATASET_CELL_ROW_NOT_FOUND` (`SQLSTATE 23503`). |
| 16 | dataset column orphan | **REJECT** | Bloqueado com `DATASET_CELL_COLUMN_NOT_FOUND` (`SQLSTATE 23503`). |
| 17 | cell-key mismatch | **REJECT** | Bloqueado com `DATASET_CELL_KEY_MISMATCH` (`SQLSTATE 22023`). |
| 18 | value type mismatch | **REJECT** | Bloqueado com `DATASET_CELL_TYPE_MISMATCH` (`SQLSTATE 22023`). |
| 19 | unit mismatch | **REJECT** | Bloqueado com `DATASET_CELL_UNIT_MISMATCH` (`SQLSTATE 22023`). |
| 20 | SourceDocument orphan | **REJECT** | Bloqueado com `ORPHAN_EVIDENCE_SOURCE_DOCUMENT` (`SQLSTATE 23503`). |
| 21 | search_product_knowledge_v2 | **PASS** | Retornou 2 resultados reais agregando fatos técnicos e células de datasets. |
| 22 | product_technical_data_index PROJECTION | **PASS** | 1 registro indexado na projeção analítica atômica. |
| 23 | product_dataset_search_index PROJECTION | **PASS** | 1 célula indexada na projeção dimensional de datasets. |
| 24 | authenticated direct write to index | **DENIED** | Privilégios `INSERT/UPDATE/DELETE` revogados para `authenticated`. |
| 25 | RLS | **PASS** | Row Level Security ativo e fail-closed em `product_dataset_search_index`. |
| 26 | GRANTS | **PASS** | `EXECUTE` concedido a `authenticated` e estritamente revogado para `anon`/`public`. |
| 27 | library_change_events | **PASS** | 2 eventos de auditoria transacionais gravados para as operações do workbook. |
| 28 | ROLLBACK / RECOVERY TEST | **PASS** | Transação desfeita com `ROLLBACK;` comprovando zero resíduos persistidos. |

---

### LOG BRUTO DA EXECUÇÃO NO RUNNER (POSTGRESQL 17.6)

```text
==================================================
PIM REAL POSTGRESQL REHEARSAL: 00022 -> 00023
==================================================
TIMESTAMP: 2026-09-04T01:38:08Z

--- 1. ENVIRONMENT & PLATFORM INFO ---
POSTGRESQL CLIENT:
psql (PostgreSQL) 16.15 (Ubuntu 16.15-1.pgdg24.04+2)
POSTGRESQL SERVER VERSION:
PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit
SUPABASE HOST: localhost:54322
SUPABASE DATABASE: postgres

--- 2. MIGRATION CHECKSUMS ---
00022 SHA-256: 74c6ce030fa139ce644ac87fbd87acb7ac8f109841b118dd4f9e1f0d6973ef87
00023 SHA-256: fe0400c4eb01c035a84d118dc1fa38463199babf47eb6f4224d469748c197a57

--- 3. VERIFYING 00022 STATE ---
NOTICE:  [STATE 00022 CONFIRMED] save_product_workbook_v1 presente; v2 e dataset index ausentes.
DO

--- 4. EXECUTING MATRIZ OBRIGATÓRIA DE EXECUÇÃO REAL ---
Running POINT 01: FIRST APPLY 00023...
psql:supabase/migrations/00023_product_dataset_search_index.sql:61: NOTICE:  policy "product_dataset_search_select_policy" for relation "public.product_dataset_search_index" does not exist, skipping
[REHEARSAL][POINT-01][OK] FIRST APPLY 00023: PASS
Running POINT 02: SECOND APPLY / IDEMPOTENCE 00023...
psql:supabase/migrations/00023_product_dataset_search_index.sql:43: NOTICE:  relation "product_dataset_search_index" already exists, skipping
psql:supabase/migrations/00023_product_dataset_search_index.sql:47: NOTICE:  relation "idx_dataset_search_wb" already exists, skipping
psql:supabase/migrations/00023_product_dataset_search_index.sql:50: NOTICE:  relation "idx_dataset_search_ds" already exists, skipping
psql:supabase/migrations/00023_product_dataset_search_index.sql:53: NOTICE:  relation "idx_dataset_search_datum" already exists, skipping
psql:supabase/migrations/00023_product_dataset_search_index.sql:56: NOTICE:  relation "idx_dataset_search_text" already exists, skipping
[REHEARSAL][POINT-02][OK] SECOND APPLY / IDEMPOTENCE: PASS
Running POINTS 03 TO 28: TRANSACTIONAL REHEARSAL SUITE...
BEGIN
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:51: NOTICE:  [REHEARSAL][SETUP][OK] Fixtures criadas com sucesso (User, Profile, Family, Products, SourceDocument).
DO
SET
SET
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:80: NOTICE:  [REHEARSAL][POINT-03][OK] save_product_workbook_v1 first save: PASS (Revision 1)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:105: NOTICE:  [REHEARSAL][POINT-04][OK] save_product_workbook_v1 update: PASS (Revision 2)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:123: NOTICE:  [REHEARSAL][POINT-05][OK] get_product_workbook_v1: PASS (SchemaVersion 1, Revision 2)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:185: NOTICE:  [REHEARSAL][POINT-06][OK] save_product_workbook_v2 first save: PASS (Revision 1)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:247: NOTICE:  [REHEARSAL][POINT-07][OK] save_product_workbook_v2 update: PASS (Revision 2)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:268: NOTICE:  [REHEARSAL][POINT-08][OK] get_product_workbook_v2: PASS (SchemaVersion 2, Revision 2, 1 Dataset)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:289: NOTICE:  [REHEARSAL][POINT-09][OK] V2 payload to V1 rejected: REJECT (INVALID_WORKBOOK_SCHEMA)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:310: NOTICE:  [REHEARSAL][POINT-10][OK] V1 payload to V2 rejected: REJECT (INVALID_WORKBOOK_SCHEMA)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:331: NOTICE:  [REHEARSAL][POINT-11][OK] CAS conflict real rejected: PASS (SQLSTATE 40001 WORKBOOK_CONFLICT)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:357: NOTICE:  [REHEARSAL][POINT-12][OK] Dataset module orphan rejected: REJECT (DATASET_MODULE_NOT_FOUND)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:382: NOTICE:  [REHEARSAL][POINT-13][OK] Datum module orphan rejected: REJECT (DATUM_MODULE_NOT_FOUND)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:412: NOTICE:  [REHEARSAL][POINT-14][OK] Dataset cell datum orphan rejected: REJECT (DATASET_CELL_DATUM_NOT_FOUND)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:442: NOTICE:  [REHEARSAL][POINT-15][OK] Dataset row orphan rejected: REJECT (DATASET_CELL_ROW_NOT_FOUND)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:472: NOTICE:  [REHEARSAL][POINT-16][OK] Dataset column orphan rejected: REJECT (DATASET_CELL_COLUMN_NOT_FOUND)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:502: NOTICE:  [REHEARSAL][POINT-17][OK] Cell-key mismatch rejected: REJECT (DATASET_CELL_KEY_MISMATCH)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:532: NOTICE:  [REHEARSAL][POINT-18][OK] Value type mismatch rejected: REJECT (DATASET_CELL_TYPE_MISMATCH)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:562: NOTICE:  [REHEARSAL][POINT-19][OK] Unit mismatch rejected: REJECT (DATASET_CELL_UNIT_MISMATCH)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:590: NOTICE:  [REHEARSAL][POINT-20][OK] SourceDocument orphan rejected: REJECT (ORPHAN_EVIDENCE_SOURCE_DOCUMENT)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:607: NOTICE:  [REHEARSAL][POINT-21][OK] search_product_knowledge_v2 returns real result: PASS (2 encontrados)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:625: NOTICE:  [REHEARSAL][POINT-22][OK] product_technical_data_index projection: PASS (1 registro indexado)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:643: NOTICE:  [REHEARSAL][POINT-23][OK] product_dataset_search_index projection: PASS (1 célula projetada)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:663: NOTICE:  [REHEARSAL][POINT-24][OK] Authenticated direct write to index denied: DENIED (Privilégios revogados)
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:681: NOTICE:  [REHEARSAL][POINT-25][OK] RLS enabled and fail-closed: PASS
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:703: NOTICE:  [REHEARSAL][POINT-26][OK] Grants fail-closed on RPCs: PASS
DO
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:721: NOTICE:  [REHEARSAL][POINT-27][OK] library_change_events audit record created: PASS (2 eventos gerados)
DO
ROLLBACK
psql:supabase/rehearsals/00023_migration_rehearsal_suite.sql:742: NOTICE:  [REHEARSAL][POINT-28][OK] Rollback and recovery total: PASS (Zero resíduos no banco)
DO

==================================================
ALL 28 REHEARSAL POINTS EXECUTED AND PASSED ON REAL POSTGRESQL!
==================================================
```

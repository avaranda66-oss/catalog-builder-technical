# PostgreSQL Migration Rehearsal Execution Log (PIM.PRODUCTION.CORE1.1)
**Data:** 2026-09-04T00:36:26.660Z  
**Arquivo de Rehearsal:** `supabase/rehearsals/00023_migration_rehearsal_suite.sql`  
**SHA-256:** `c1143d868390600416ca82ff518831eebfb730f0f2ac9d8546d400f5c2a4bd20`  
**Status do Rehearsal:** Executável, Validado e Isolado  
**Garantias Verificadas:**
1. BEGIN / ROLLBACK isolamento transacional estrito (Zero mutação persistida).
2. Fixtures completas (User editor, Product, Family, SourceDocument autorizado).
3. Direct DML negado para authenticated em `product_dataset_search_index`.
4. V1 first save e get preservados (sem regressão).
5. V2 save atômico com projeção em índice de busca.
6. 6 testes negativos de rejeição (CAS conflict, wrong schema, key coordinate mismatch, type mismatch, unit mismatch, orphan source document).
7. RPC search_product_knowledge_v2 integrada e segura.

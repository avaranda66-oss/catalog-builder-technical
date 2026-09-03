# CLEAN-SLATE REMEDIATION BLUEPRINT — PIM CANONICAL FOUNDATION
**Status**: DRAFT AUDITADO / PRE-FLIGHT (NÃO EXECUTADO LIVE NESTA MISSÃO)  
**Projeto Supabase**: `bjxqvrpbigwgabwbhtqa` ("Catalogpresys")  
**Data da Auditoria Forense**: 2026-09-03  
**Branch Canônica**: `feat/pim-production-core-v1`  
**Base Commit**: `8b234e8e130929a3b42eb26048a36c1d5291f905`

---

## 1. RESUMO DA AUDITORIA FORENSE (READ-ONLY)

A auditoria forense completa realizada em 2026-09-03 identificou:
- **7 Famílias**:
  - `28778e8c-a1d2-4e4a-89a9-46777fa93f9e` ("Calibradores de Temperatura"): **Única Família Legítima de Produção**.
  - `10000000-0000-0000-0000-000000000001` a `10000000-0000-0000-0000-000000000004`: Famílias Demo/Seed sintéticas.
  - `feb500eb-14b5-4b7f-8c38-89c0b11566cf` e `7f5f9923-2ee8-4d56-8575-cfdc1f855e9b`: Famílias criadas por testes E2E.
- **21 Produtos no total**, com duplicatas para os calibradores TA:
  - **Set A (Sementes Sintéticas)**: `a0000000-0000-0000-0000-000000000025`, `a0000000-0000-0000-0000-000000000035`, `a0000000-0000-0000-0000-000000000050`.
  - **Set B (Legítimos / Ativos em Produção)**:
    - `7c55db7c-8c01-4bbc-a632-452a010998a6` (TA-25) — 9 versões, 7 snapshots em catálogos reais.
    - `6deb7c6c-9e8b-4063-a732-4c87825f86fe` (TA-35) — 13 versões, asset ativo `e7ea764f-4d92-4fcf-8dc0-58c27bc37eb6`.
    - `034ec9a4-38bf-47f6-b0f7-e35f4846b53c` (TA-50) — 3 versões, 4 snapshots em catálogos reais.
- **Sobreviventes Canônicos Indiscutíveis**: Set B.

---

## 2. INVARIANTES DE PRESERVAÇÃO

1. **Zero DDL/DML Live Nesta Missão**: Nenhum registro foi excluído, modificado ou inserido no banco de produção.
2. **Preservação de Catálogos**: Todo catálogo existente referenciando TA-25, TA-35 ou TA-50 já aponta para os sobreviventes do Set B (`7c55db7c...`, `6deb7c6c...`, `034ec9a4...`).
3. **Nenhum Dado Sintético em Workbooks**: Os novos workbooks V2 para TA-25, TA-35 e TA-50 são inicializados sem dados técnicos inventados ou fabricados. Permanecem em status `draft`/`unknown` até que um SourceDocument oficial seja anexado.

---

## 3. ROTEIRO DE REMEDIAÇÃO CLEAN-SLATE (FUTURO / APÓS APROVAÇÃO)

O script SQL abaixo foi projetado para execução futura em uma janela de manutenção aprovada pelo DBA/Arquiteto. Ele é transacional, idempotente e seguro:

```sql
BEGIN;

-- PASSO 1: Repontar qualquer referência residual em catalog_versions
UPDATE public.catalog_versions
SET snapshot_data = jsonb_set(
    snapshot_data,
    '{productId}',
    '"7c55db7c-8c01-4bbc-a632-452a010998a6"'
)
WHERE snapshot_data->>'productId' = 'a0000000-0000-0000-0000-000000000025';

UPDATE public.catalog_versions
SET snapshot_data = jsonb_set(
    snapshot_data,
    '{productId}',
    '"6deb7c6c-9e8b-4063-a732-4c87825f86fe"'
)
WHERE snapshot_data->>'productId' = 'a0000000-0000-0000-0000-000000000035';

UPDATE public.catalog_versions
SET snapshot_data = jsonb_set(
    snapshot_data,
    '{productId}',
    '"034ec9a4-38bf-47f6-b0f7-e35f4846b53c"'
)
WHERE snapshot_data->>'productId' = 'a0000000-0000-0000-0000-000000000050';

-- PASSO 2: Remover versões antigas das sementes sintéticas
DELETE FROM public.product_versions
WHERE product_id IN (
    'a0000000-0000-0000-0000-000000000025',
    'a0000000-0000-0000-0000-000000000035',
    'a0000000-0000-0000-0000-000000000050'
);

-- PASSO 3: Remover sementes sintéticas da tabela products
DELETE FROM public.products
WHERE id IN (
    'a0000000-0000-0000-0000-000000000025',
    'a0000000-0000-0000-0000-000000000035',
    'a0000000-0000-0000-0000-000000000050'
);

-- PASSO 4: Remover produtos órfãos de famílias demo/e2e
DELETE FROM public.product_versions
WHERE product_id IN (
    SELECT id FROM public.products
    WHERE family_id IN (
        '10000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000004',
        'feb500eb-14b5-4b7f-8c38-89c0b11566cf',
        '7f5f9923-2ee8-4d56-8575-cfdc1f855e9b'
    )
);

DELETE FROM public.products
WHERE family_id IN (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000004',
    'feb500eb-14b5-4b7f-8c38-89c0b11566cf',
    '7f5f9923-2ee8-4d56-8575-cfdc1f855e9b'
);

-- PASSO 5: Remover famílias demo e de teste E2E
DELETE FROM public.product_families
WHERE id IN (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000004',
    'feb500eb-14b5-4b7f-8c38-89c0b11566cf',
    '7f5f9923-2ee8-4d56-8575-cfdc1f855e9b'
);

-- Auditoria
INSERT INTO public.library_change_events (
    entity_type,
    entity_id,
    action,
    user_name,
    details
) VALUES (
    'clean_slate',
    gen_random_uuid(),
    'remediation_executed',
    'DBA / Production Release',
    'Clean-slate executado: remoção de 3 sementes duplicadas e 6 famílias demo/teste'
);

COMMIT;
```

---

## 4. CONVERGÊNCIA E PRÓXIMOS PASSOS

1. A migração 00023 (`00023_product_dataset_search_index.sql`) deve ser aplicada via Supabase CLI em ambiente de staging primeiro.
2. Após validação em staging, aplicar na base de produção.
3. Executar o script de remediação acima apenas após a confirmação de que os Workbooks V2 dos produtos canônicos estão operacionais.

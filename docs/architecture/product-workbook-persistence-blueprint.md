# Blueprint de Persistência do Product Workbook (PIM.W2C Pre-Flight Hardened)

**Fase:** PIM.W2C — Pre-Flight PostgreSQL Contract Integrity  
**Status:** READY FOR ARCHITECT REVIEW (NÃO APLICADO EM PRODUÇÃO)  
**Branch:** `fix/product-workbook-persistence-w2c-preflight`  
**Data:** 2026-09-03  

---

## 1. Contexto e Objetivos

O domínio **Product Workbook** (PIM.W1 / PIM.W1.1 / PIM.W1.2 / PIM.W2B) estabelece o modelo de engenharia de conhecimento técnico de produto.
Na fase **PIM.W2C**, corrigimos lacunas pontuais de integridade no contrato PostgreSQL antes da integração conjunta com a frente de Table Core:
1. **Correção de Projeção Range:** Alinhamento com o domínio real (`TechnicalValue.range` utiliza `lower` e `upper`, e nunca `min`/`max`), suportando faixas bilaterais e unilaterais sem ghost data.
2. **Semântica de NULL e Validações Estruturais Fail-Closed no SQL:** Substituição de comparações vulneráveis a NULL por operadores seguros (`?` e `IS DISTINCT FROM`), validando `schemaVersion = 1` e tipos primitivos antes de casts numéricos.
3. **Read Authority Fail-Closed:** RLS para `SELECT` restrito a `public.team_role() IS NOT NULL`. RPCs `SECURITY DEFINER` de leitura validam explicitamente autenticação (`auth.uid()`) e papel ativo de equipe (`public.team_role()`).
4. **Proteção contra Exclusão de Owner Polimórfico:** Triggers `BEFORE DELETE` em `public.products` e `public.product_families` que bloqueiam exclusão caso exista um workbook associado (`WORKBOOK_OWNER_IN_USE` / `SQLSTATE 23503`), sem cascade destrutivo.
5. **Integridade de Servidor em Source Documents:** Validação fail-closed na RPC `upsert_source_document_v1` de tipos, metadados (todos valores string), formatos BCP-47, ISO-8601 e URLs.
6. **Validação de Entrada em Leitura:** `get_product_workbook_v1` valida `p_owner_kind IN ('product', 'family')`.

---

## 2. Invariantes de Persistência Atualizadas

### 2.1 Projeção Lossless de TechnicalValue.range
- O domínio define:
  ```typescript
  export interface RangeTechnicalValue {
    readonly type: 'range';
    readonly lower?: number;
    readonly upper?: number;
    readonly unit: UnitCode;
    readonly lowerInclusive?: boolean;
    readonly upperInclusive?: boolean;
  }
  ```
- O SQL de projeção no índice analítico extrai estritamente:
  - `lower_value = (value->'value'->>'lower')::numeric`
  - `upper_value = (value->'value'->>'upper')::numeric`
  - `unit = value->'value'->>'unit'`
- Se `lower` ou `upper` forem omitidos (faixas unilaterais como "até 10 bar" ou "acima de 0 rpm"), a coluna correspondente é mantida como `NULL` (zero ghost data).

### 2.2 Validação Estrutural e Semântica de NULL no PL/pgSQL
- Em PostgreSQL, comparações com `NULL` via `<>` ou `=` resultam em `UNKNOWN/NULL`, permitindo que campos ausentes passem despercebidos por blocos `IF`.
- Na migração 00022 endurecida, todas as checagens usam:
  - Verificação de chave existente: `p_workbook ? 'key'`
  - Tipo JSON exato: `jsonb_typeof(...) IS DISTINCT FROM 'type'`
  - Regex numérico antes de cast: `(val) ~ '^[0-9]+$'`
  - Rejeição fail-closed com erro canônico `22023` (*invalid_parameter_value*).

### 2.3 Autoridade de Leitura e Triggers de Deleção
- **Políticas RLS de Leitura:**
  `CREATE POLICY "allow_read_..." ... USING (public.team_role() IS NOT NULL);`
- **RPCs de Leitura:**
  `IF auth.uid() IS NULL OR public.team_role() IS NULL THEN RAISE EXCEPTION 'AUTH_READ_DENIED' USING ERRCODE = '42501'; END IF;`
- **Guardião de Integridade Referencial Polimórfica:**
  Triggers instalados em `public.products` e `public.product_families` impedem exclusão de registros que tenham `product_workbooks` ativos, emitindo erro `WORKBOOK_OWNER_IN_USE` com `SQLSTATE 23503`.

---

## 3. Contratos de RPC e Repositório

```sql
-- Leitura de Workbook (com validação de auth e owner_kind)
public.get_product_workbook_v1(p_owner_kind TEXT, p_owner_id TEXT) RETURNS JSONB;

-- Salvamento Atômico de Workbook com CAS e Rebuild de Índice
public.save_product_workbook_v1(p_workbook JSONB, p_expected_revision INTEGER) RETURNS JSONB;

-- Ciclo de Vida de Documentos Fonte (com validação de servidor)
public.upsert_source_document_v1(p_document JSONB) RETURNS JSONB;
public.get_source_document_v1(p_id TEXT) RETURNS JSONB;
public.list_source_documents_v1(p_ids TEXT[] DEFAULT NULL) RETURNS JSONB;
```

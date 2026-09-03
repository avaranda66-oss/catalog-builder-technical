# Blueprint de Persistência do Product Workbook (PIM.W2A)

**Fase:** PIM.W2A — Product Knowledge Persistence Design & Blueprint  
**Status:** DRAFT / PROPOSTA TÉCNICA (NÃO APLICADO EM PRODUÇÃO)  
**Branch:** `design/product-workbook-persistence` (Isolada de `main`)  
**Data:** 2026-09-03  

---

## 1. Contexto e Requisitos Fundamentais

O domínio **Product Workbook** (PIM.W1 / PIM.W1.1) estabelece o modelo puro de engenharia de conhecimento técnico de produto no Catalog Builder. Ele suporta:
- Workbooks de Produto e Workbooks de Família (`ProductWorkbookOwner`).
- Módulos técnicos tipados (`TechnicalModule`).
- Dados técnicos polimórficos (`TechnicalDatum`) com valores canônicos e evidências empíricas (`TechnicalEvidence`).
- Decisões canônicas estritas (`selected_evidence`, `engineering_decision`, `verified_consensus`).
- Resolução de herança pura via overrides (`DatumOverrideRule`: `override`, `extend`, `lock`, `hide`) sem mutação e sem cópia física entre tabelas.
- Visões salvas (`ProductDataView`).
- Fechamento referencial e validação estrita (`validateProductWorkbook`, `validateProductKnowledgeBundle`).

---

## 2. Comparativo de Arquiteturas de Armazenamento

Avaliamos três alternativas concretas no PostgreSQL / Supabase:

| Critério | Opção A: Full JSONB Puro | Opção B: 100% Relacional Normalizado | Opção C: Híbrido Relacional + Payload Mirror (Recomendada) |
| :--- | :--- | :--- | :--- |
| **Garantia de CAS** | Atômico trivial na linha do workbook (`revision = expected_revision`). | Complexo: requer lock pessimista na linha pai e transação em 5 tabelas. | Atômico no cabeçalho `product_workbooks` com atualização transacional. |
| **Velocidade de Leitura** | Extremamente rápida (1 query única, 1 deserialização Zod). | Lenta (joins em 5 tabelas: modules, data, evidence, overrides, views). | Extremamente rápida para carga do workbook (`full_payload`) + queries SQL ricas. |
| **Consultas SQL Analíticas** | Limitadas a operadores JSON (`->>`, `@>`). Não indexa bem chaves arbitrárias. | Excelente: `SELECT * FROM technical_data WHERE numeric_value > 100`. | Excelente: tabelas normalizadas indexadas sincronizadas transacionalmente. |
| **Integridade Referencial** | Validada apenas no runtime TypeScript / Zod. | Validada por Foreign Keys do PostgreSQL. | Validação Zod no runtime + Foreign Keys e Constraints nas tabelas espelho. |
| **Tamanho da Migração** | Mínimo (1 tabela). | Enorme (5 tabelas + 20 triggers). | Equilibrado (tabela raiz com `full_payload` + tabelas projetadas para busca). |

### Decisão de Arquitetura: Modelo Híbrido Relacional + Payload Mirror
A solução **Opção C** é a recomendada:
1. `product_workbooks`: Tabela raiz que armazena a identidade do workbook, dono (`product` ou `family`), `revision` atômica para CAS, metadados e `full_payload` JSONB contendo o workbook completo validado pelo schema Zod.
2. `product_technical_data_index`: Tabela de projeção e busca contendo linhas normalizadas dos dados técnicos com valores numéricos/texto indexados para busca cross-product no catálogo.
3. `product_source_documents`: Tabela normalizada de documentos de evidência anexados (datasheets, manuais, certificados).

---

## 3. Modelo de Dados PostgreSQL Proposto

### 3.1 Tabela Raiz: `product_workbooks`
```sql
CREATE TABLE IF NOT EXISTS public.product_workbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_kind TEXT NOT NULL CHECK (owner_kind IN ('product', 'family')),
    owner_id TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    full_payload JSONB NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT product_workbooks_owner_unique UNIQUE (owner_kind, owner_id)
);
```

### 3.2 Tabela de Documentos Fonte: `product_source_documents`
```sql
CREATE TABLE IF NOT EXISTS public.product_source_documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('datasheet', 'manual', 'drawing', 'certificate', 'test_report', 'marketing', 'other')),
    file_url TEXT,
    file_name TEXT,
    mime_type TEXT,
    sha256 TEXT,
    version TEXT,
    language TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### 3.3 Tabela de Projeção Analítica: `product_technical_data_index`
```sql
CREATE TABLE IF NOT EXISTS public.product_technical_data_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workbook_id UUID NOT NULL REFERENCES public.product_workbooks(id) ON DELETE CASCADE,
    datum_id TEXT NOT NULL,
    semantic_key TEXT NOT NULL,
    module_id TEXT NOT NULL,
    label TEXT NOT NULL,
    value_type TEXT NOT NULL,
    text_value TEXT,
    numeric_value NUMERIC,
    unit TEXT,
    status TEXT NOT NULL,
    has_conflicts BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT uq_workbook_datum_index UNIQUE (workbook_id, datum_id)
);
```

---

## 4. Concorrência Otimista (CAS)

O controle de concorrência é estritamente baseado no campo `revision` inteiro do domínio (e não em timestamps voláteis):
- A função RPC `save_product_workbook_v1(p_workbook jsonb, p_expected_revision integer)` recebe o payload e a revisão esperada.
- Se `existing.revision IS DISTINCT FROM p_expected_revision`, dispara exceção com SQLSTATE `'40001'`:
  `WORKBOOK_CONFLICT: Conflito de Concorrência: o workbook foi alterado em outro dispositivo (Esperado: %, Atual: %). Recarregue os dados.`
- Na gravação bem-sucedida, a revisão é incrementada: `revision := existing.revision + 1`.

---

## 5. Herança de Família Sem Duplicação Física

Conforme diretiva mandatória do Synkra AIOS:
- Workbooks de Família são persistidos com `owner_kind = 'family'` e `owner_id = <family_uuid>`.
- Workbooks de Produto são persistidos com `owner_kind = 'product'` e `owner_id = <product_uuid>`.
- O banco de dados **NUNCA** duplica ou clona linhas da família para dentro do produto.
- A resolução de valores efetivos é realizada deterministicamente no runtime através de `resolveEffectiveProductKnowledge(productWorkbook, familyWorkbook)`.

---

## 6. Segurança e Row Level Security (RLS)

O sistema reutiliza o modelo de segurança existente no projeto:
- `require_document_editor_v1()` (criado na migration 00019) valida se o usuário autenticado possui role `admin` ou `editor`.
- Usuários anônimos têm acesso bloqueado.
- Leitura permitida para qualquer usuário autenticado (`authenticated`).
- Escrita permitida apenas para `admin` e `editor`.

---

## 7. Trilha de Auditoria via `library_change_events`

As mutações no workbook gravam eventos de auditoria imutáveis na tabela existente `public.library_change_events`:
- `entity_type`: `'product_workbook'`
- `entity_id`: `workbook_id::text`
- `family_id`: Preenchido quando `owner_kind = 'family'`
- `product_id`: Preenchido quando `owner_kind = 'product'`
- `action`: `'SAVE_WORKBOOK'`
- `summary`: `format('Workbook gravado para %s (%s) — revisão %s', v_owner_kind, v_owner_id, v_new_revision)`
- `actor_id`: `auth.uid()`
- `actor_email`, `actor_name`: Extraídos de `auth.users`.

---

## 8. Estratégia de Tempo Real (Realtime)

- A tabela `product_workbooks` é adicionada à publicação `supabase_realtime`.
- Réplica identity definida como `FULL`: `ALTER TABLE public.product_workbooks REPLICA IDENTITY FULL;`.
- Os clientes se inscrevem via canal Postgres Changes escutando eventos de `UPDATE` na tabela `product_workbooks` com filtro por `id=eq.<workbook_id>`.
- Quando um evento de update é recebido com `revision > localWorkbook.revision`, o cliente notifica o usuário ou solicita recarga sem sobrescrever o rascunho local.

# Blueprint de Persistência do Product Workbook (PIM.W2B Hardened)

**Fase:** PIM.W2B — Product Knowledge Persistence Hardening  
**Status:** READY FOR ARCHITECT REVIEW (NÃO APLICADO EM PRODUÇÃO)  
**Branch:** `hardening/product-workbook-persistence-w2b`  
**Data:** 2026-09-03  

---

## 1. Contexto e Requisitos Fundamentais

O domínio **Product Workbook** (PIM.W1 / PIM.W1.1 / PIM.W1.2) estabelece o modelo puro de engenharia de conhecimento técnico de produto no Catalog Builder.
Na fase PIM.W1.2, consolidamos a semântica canônica de `ProductWorkbook.revision`:
- O campo `revision` representa a **revisão persistida autoritativa do servidor** (token CAS).
- Operações locais puras de edição preservam a revisão $N = N$.
- Apenas a autoridade de persistência avança $N \to N+1$.

Na fase **PIM.W2B**, endurecemos a arquitetura de persistência para eliminar qualquer possibilidade de desvios de concorrência, corridas de criação, mutações diretas não autorizadas, divergências de documentos fonte ou perda de tipagem analítica.

---

## 2. Invariantes Arquiteturais e Pilares de Segurança

### 2.1 CAS Estrito (Compare-And-Swap Inviolável)
- **TypeScript:** `SaveWorkbookParams.expectedRevision` é estritamente obrigatório (`number >= 0`).
- **Pré-rede:** Antes de qualquer requisição, o repositório valida que `expectedRevision === workbook.revision`. Caso contrário, fail-closed imediato (`REVISION_MISMATCH`).
- **PostgreSQL RPC:** `p_expected_revision INTEGER` não possui valor padrão (`DEFAULT NULL` proibido). Valores nulos geram exceção `CAS_REVISION_REQUIRED`.
- **Conflito de Concorrência:** Divergência entre a revisão armazenada e `p_expected_revision` dispara erro canônico `WORKBOOK_CONFLICT` com `SQLSTATE 40001`.

### 2.2 Semântica da Primeira Persistência e Avanço de Revisão
- Workbook local recém-criado: `revision = 0`.
- Primeiro save no banco de dados: transição atômica $0 \to 1$.
- Linhas persistidas no banco de dados possuem sempre `revision >= 1` (reforçado por `CHECK (revision >= 1)`).
- Saves subsequentes: transição atômica $N \to N+1$.
- Se o cliente tentar criar com `expectedRevision != 0`, ou salvar sobre registro existente com `expectedRevision != stored_revision`, o CAS aborta com `WORKBOOK_CONFLICT` (`40001`).

### 2.3 Prevenção de Race de Criação e Integridade de Owner
- O padrão ingênuo `SELECT ... FOR UPDATE` não previne dois clientes tentando criar concorrentemente o primeiro workbook para a mesma entidade.
- **Solução PIM.W2B:** A RPC obtém lock pessimista transacional (`FOR UPDATE`) diretamente na entidade proprietária antes de consultar a tabela de workbooks:
  - Para `owner.kind = 'product'`: `PERFORM 1 FROM public.products WHERE id = v_owner_id FOR UPDATE;`
  - Para `owner.kind = 'family'`: `PERFORM 1 FROM public.product_families WHERE id = v_owner_id FOR UPDATE;`
- Garante duas propriedades críticas:
  1. **Integridade Referencial Real:** Se a entidade proprietária não existir no catálogo, a transação aborta imediatamente com `OWNER_NOT_FOUND` (`23503`).
  2. **Serialização Atômica:** O segundo create aguarda a conclusão da transação do primeiro, encontrando em seguida a linha já criada na revisão 1, disparando `WORKBOOK_CONFLICT` de forma determinística.
- Validação pré-rede e no SQL garante que `owner.id` seja estritamente um UUID no formato RFC 4122.

### 2.4 Autoridade Única de Escrita (Single Write Authority)
- Direct DML (`INSERT`, `UPDATE`, `DELETE`) em `product_workbooks`, `product_source_documents` e `product_technical_data_index` é **explicitamente revogado** de `PUBLIC`, `anon` e `authenticated`.
- Toda e qualquer mutação ocorre exclusivamente através das RPCs autorizadas:
  - `save_product_workbook_v1`
  - `upsert_source_document_v1`
- A validação de perfil editorial é unificada na função canônica:
  `v_actor := public.require_document_editor_v1();`
  (Zero tolerância a padrões fail-open como `coalesce(team_role(), 'editor')`).

### 2.5 Lifecycle Completo de Documentos Fonte (Source Documents)
- `product_source_documents` espelha o enum canônico `SourceDocumentType` de 8 valores:
  `manual | datasheet | certificate | drawing | standard | engineering_note | website | other`.
- Fornecido repositório tipado `ProductSourceDocumentRepository` (`upsert`, `get`, `list`).
- **Validação de Evidências Órfãs:** Ao salvar um workbook, a RPC percorre todas as evidências (`datum.evidence` e `override.evidence`). Se qualquer `sourceDocumentId` apontar para um documento não persistido, a transação aborta com `ORPHAN_SOURCE_DOCUMENT` (`23503`).
- **Compartilhamento Seguro:** Workbooks distintos podem referenciar os mesmos documentos fonte. Exclusão de workbooks não apaga documentos fonte compartilhados.

### 2.6 Índice Analítico Lossless e Resolução de Conflitos
- O índice `product_technical_data_index` é uma **projeção pura** atualizada deterministicamente na mesma transação atômica do save do workbook.
- Cobre a união completa dos 10 tipos de `TechnicalValue` sem casts inseguros e sem ghost data:
  - `text`, `number`, `boolean`, `quantity`, `range`, `enum`, `technical_token`, `asset_reference`, `product_reference`, `unknown`.
- `has_conflicts` foi **removido** do índice analítico: o cálculo ingênuo `evidenceCount > 1` violava o domínio; a resolução de conflito pertence exclusivamente às engines puras de domínio (`detectEvidenceConflicts`).

### 2.7 Auditoria Transacional Imutável
- Toda persistência bem-sucedida registra um evento `SAVE_WORKBOOK` em `public.library_change_events` contendo `owner_kind`, `owner_id`, `new_revision` e metadados do ator autenticado.
- A auditoria faz parte da transação ACID; se o save falhar ou sofrer rollback, nenhum evento é emitido.

---

## 3. Modelo de Tabelas PostgreSQL

```sql
-- 1. Tabela Principal de Workbooks Técnicos
CREATE TABLE IF NOT EXISTS public.product_workbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_kind TEXT NOT NULL CHECK (owner_kind IN ('product', 'family')),
    owner_id UUID NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    full_payload JSONB NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT product_workbooks_owner_unique UNIQUE (owner_kind, owner_id)
);

-- 2. Tabela de Documentos Fonte
CREATE TABLE IF NOT EXISTS public.product_source_documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN (
        'manual', 'datasheet', 'certificate', 'drawing',
        'standard', 'engineering_note', 'website', 'other'
    )),
    revision TEXT,
    language TEXT,
    publication_date TEXT,
    file_reference TEXT,
    external_url TEXT,
    checksum TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Tabela de Projeção Analítica (Dados Técnicos)
CREATE TABLE IF NOT EXISTS public.product_technical_data_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workbook_id UUID NOT NULL REFERENCES public.product_workbooks(id) ON DELETE CASCADE,
    datum_id TEXT NOT NULL,
    semantic_key TEXT NOT NULL,
    module_id TEXT NOT NULL,
    label TEXT NOT NULL,
    value_type TEXT NOT NULL,
    raw_value JSONB NOT NULL,
    text_value TEXT,
    numeric_value NUMERIC,
    boolean_value BOOLEAN,
    lower_value NUMERIC,
    upper_value NUMERIC,
    unit TEXT,
    enum_code TEXT,
    technical_token TEXT,
    asset_id TEXT,
    target_product_id TEXT,
    unknown_reason TEXT,
    status TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT uq_workbook_datum_index UNIQUE (workbook_id, datum_id)
);
```

---

## 4. Assinaturas das RPCs e Contratos TypeScript

### 4.1 RPCs PostgreSQL
- `public.get_product_workbook_v1(p_owner_kind TEXT, p_owner_id TEXT) -> JSONB`
- `public.save_product_workbook_v1(p_workbook JSONB, p_expected_revision INTEGER) -> JSONB`
- `public.upsert_source_document_v1(p_document JSONB) -> JSONB`
- `public.get_source_document_v1(p_id TEXT) -> JSONB`
- `public.list_source_documents_v1(p_ids TEXT[]) -> JSONB`

### 4.2 Interfaces TypeScript
```typescript
export interface SaveWorkbookParams {
  readonly workbook: ProductWorkbook;
  readonly expectedRevision: number; // Obrigatório
  readonly actorRef?: string;
}

export interface SaveWorkbookResult {
  readonly success: boolean;
  readonly workbook: ProductWorkbook;
  readonly revision: number;
}

export interface ProductWorkbookRepository {
  getWorkbook(owner: WorkbookOwner): Promise<ProductWorkbook | null>;
  saveWorkbook(params: SaveWorkbookParams): Promise<SaveWorkbookResult>;
}

export interface ProductSourceDocumentRepository {
  getSourceDocument(id: string): Promise<SourceDocument | null>;
  upsertSourceDocument(document: SourceDocument): Promise<SourceDocument>;
  listSourceDocuments(ids?: string[]): Promise<SourceDocument[]>;
}
```

# ADR: Persistência do Mega Product Workspace Layout (PIM.MEGA.WORKSPACE)

- **Status:** APROVADO COMO ARQUITETURA ALVO (Entidade Separada)
- **Data:** 2026-09-04
- **Autor:** Architecture & Product Design Pair (Hardening Review)
- **Contexto:** Framework Synkra AIOS / PIM Core V2 / Mega Product Workspace Foundation 1B

---

## 1. Contexto & Princípio Fundamental

Com a evolução do PIM para o **Mega Product Workspace**, o sistema estabelece a separação estrita e inegociável entre:
1. **DATA TRUTH (Verdade Técnica dos Dados):** Mantida de forma canônica, tipada e imutável pelo `ProductWorkbookV2` (composto por `TechnicalDatum`, `TechnicalDataset`, `SourceDocument`, `Evidence` e herança metrológica via `ResolvedProductKnowledge`). Possui seu próprio contador de revisão técnica (`ProductWorkbook.revision`).
2. **HUMAN PRESENTATION (Apresentação Humana):** Projeção flexível, organizada e customizável pelo usuário comum (`WorkspaceLayoutV1`), contendo seções, blocos polimórficos (`fact_grid`, `technical_table`, `dataset_view`, `text_note`, `source_group`, `divider`), controles de tamanho (`size: small | medium | large | full`) e visibilidade (`visibility: visible | hidden`).

### A Invariante da Revisão Independente (Blocker 1)
Mover um bloco, redimensionar uma tabela, ocultar uma seção ou alterar o label cosmético de um card **NÃO é uma alteração da verdade técnica do produto**.

Portanto:
$$\text{ProductWorkbook.revision} \neq \text{WorkspaceLayout.revision}$$

Misturar o layout dentro do payload do `ProductWorkbook` poluiria o log de auditoria técnica da engenharia e provocaria falsos bumps na revisão canônica de calibração do produto.

---

## 2. Decisão Arquitetural Canônica: Entidade Separada (Opção B)

A arquitetura oficial aprovada estabelece que o Workspace Layout é uma **entidade relacional completamente separada**:

- **Tabela Alvo:** `product_workspace_layouts`
- **Ciclo de Vida:** Próprio, com CAS independente (`expected_revision`).
- **Impacto no PIM:** Zero mutação no `ProductWorkbook` e zero bump em `ProductWorkbook.revision`.
- **Status Operacional Nesta Fase:** **CONTRATO DEFINIDO EM DRAFT (ZERO DDL LIVE).** Nenhuma migration será aplicada live neste ciclo.

### Especificação Conceitual do Contrato Relacional:
1. `id (text / uuid primary key)`: Identificador único do layout.
2. `owner_product_id (text not null references products(id) on delete cascade)`: Produto ao qual o layout pertence.
3. `workspace_key (text not null default 'default')`: Permite múltiplas visões (ex: `'default'`, `'lab'`, `'commercial'`).
4. `schema_version (integer not null default 1)`: Versionamento do schema do layout (`WorkspaceLayoutV1`).
5. `revision (integer not null default 1)`: Contador de concorrência otimista (CAS) exclusivo do layout.
6. `layout_json (jsonb not null)`: Estrutura serializada conforme `WorkspaceLayoutV1Schema`.
7. `created_at (timestamptz not null default now())`: Timestamp de criação.
8. `updated_at (timestamptz not null default now())`: Timestamp da última modificação de layout.
9. Constraint única: `UNIQUE(owner_product_id, workspace_key)`.

---

## 3. Avaliação das Opções Consideradas

| Opção | Avaliação | Decisão | Motivo |
| :--- | :--- | :--- | :--- |
| **Opção A: No ProductWorkbook** | Mistura verdade técnica e apresentação visual. Incrementaria a revisão metrológica do produto a cada redimensionamento de bloco. | **REJEITADA** | Violação de responsabilidade única e contaminação de revisão. |
| **Opção B: Entidade Separada (`product_workspace_layouts`)** | Desacoplamento perfeito de revisões, CAS independente, auditoria isolada, zero impacto na engenharia. | **APROVADA** | Preserva a integridade da verdade técnica e permite evolução autônoma de UX. |
| **Opção C: Extensão de Saved Views** | `ProductDataView` destina-se a filtros simples de exportação, não a árvores de layout ricas. | **REJEITADA** | Impedance mismatch estrutural. |
| **Opção D: Reúso do Catálogo Gráfico** | O motor de catálogo é voltado para páginas físicas impressas em A4 (bounding boxes, mm). | **REJEITADA** | Forte acoplamento com motor de publicação gráfico. |

---

## 4. Estratégia de Migração e Rollout Controlado

1. **Fase Atual (Foundation 1B):**
   - Domínio `WorkspaceLayoutV1` implementado com `revision: number` independente.
   - Migration `00024_product_workspace_layouts.sql` mantida **estritamente como DRAFT de especificação**.
   - Zero execução de DDL no Supabase live.
   - Em memória e testes, o layout opera de forma pura e determinística via `autoOrganizeProductWorkspace` e transforms imutáveis.

2. **Fase de Ativação do Backend (Integration Cycle):**
   - Aprovação formal pré-flight para aplicação da migration `00024`.
   - RPC `save_product_workspace_layout` e `get_product_workspace_layout` com CAS dedicado.
   - RLS policies para isolamento de tenants e perfis (visualizadores vs editores de layout).

---

## 5. Garantias de Zero Data Loss & Zero Data Duplication

- **Referências Estritas:** O `layout_json` armazena apenas `datumId` e `datasetId`. Se o valor de um `TechnicalDatum` for alterado na engenharia, a projeção do workspace renderiza o novo valor instantaneamente sem necessidade de atualizar o layout.
- **Fail-Closed em Órfãos:** Se um datum for excluído do workbook pela engenharia, o motor de projeção ignora graciosamente a referência ausente sem quebrar a interface.
- **Remove != Delete:** Um usuário que remove um card de sua visão não deleta o `TechnicalDatum` da base.

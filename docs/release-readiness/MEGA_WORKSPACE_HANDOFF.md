# Mega Workspace Contract Summary & Handoff Specification

**Document Version:** 1.0.0-rc  
**Status:** FROZEN  
**Target Branch:** `integration/pim-mega-workspace-v1`  
**Head Commit:** `616ead76691a604a83b17e96a66cdb34c61acb31`  

---

## 1. Architecture Diagram

```mermaid
flowchart TD
    subgraph Storage["Persistência Segura (Read-Only)"]
        SPW[Supabase: product_workbooks]
        SSD[Supabase: product_source_documents]
        SPF[Supabase: product_families / products]
    end

    subgraph Container["MegaWorkspaceReadOnlyContainer"]
        Repo1[ProductWorkbookReadRepository\n.getWorkbook]
        Repo2[ProductSourceDocumentReadRepository\n.listSourceDocuments]
        Gate[ProductWorkspaceExperienceGate\n(Beta Opt-In / Zero LocalStorage)]
    end

    subgraph Domain["Motor de Domínio PIM (Imutável & Puro)"]
        Migrate[ensureWorkbookV2\nV1 -> V2 Normalizer]
        Inheritance[resolveEffectiveProductKnowledge\npolicy: effective_for_publishing]
        Semantics[resolveSemanticRegistry\nTarget Owner: Product]
        AutoOrg[autoOrganizeProductWorkspace\nStructural Layout Projection]
        VMBuilder[buildMegaWorkspaceViewModel\nProjection -> ViewModel]
    end

    subgraph UI["Apresentação Visual Mega Workspace"]
        Header[WorkspaceHeader\n(Search, Simple/Advanced, Badges)]
        Nav[WorkspaceNavOutline\n(Hierarquia e saltos)]
        Sections[WorkspaceSection\n(FactGrid, MegaTable, TextNotes)]
        Drawer[SourceDrawer\n(Auditoria de Evidência & Fontes)]
        SemDrawer[SemanticAdvancedDrawer\n(Inspeção Semântica Read-Only)]
        ConfBlock[ConflictsBlock\n(Divergências Documentais Oficiais)]
    end

    SPW -->|getWorkbook: product| Repo1
    SPW -->|getWorkbook: family| Repo1
    Repo1 --> Migrate
    Migrate --> Inheritance
    Inheritance -->|Referenced Source IDs| Repo2
    SSD -->|listSourceDocuments: batch| Repo2
    Repo2 --> VMBuilder
    Inheritance --> Semantics
    Semantics --> VMBuilder
    AutoOrg --> VMBuilder
    VMBuilder --> UI
```

---

## 2. Data Flow

1. **Bootstrap Seguro**:
   - `MegaWorkspaceReadOnlyContainer` recebe `product` (modelo, código, ID da família) e `family`.
   - O container invoca concorrentemente `effectiveWorkbookRepo.getWorkbook({ kind: 'product', id: product.id })` e `effectiveWorkbookRepo.getWorkbook({ kind: 'family', id: family.id })`.
2. **Normalização V1 $\rightarrow$ V2**:
   - Cada workbook recuperado passa por `ensureWorkbookV2()`, que converte schemas legados sem mutar o banco.
3. **Resolução de Conhecimento Efetivo**:
   - `resolveEffectiveProductKnowledge()` aplica a política canônica `effective_for_publishing`.
   - Identifica fatos locais, fatos herdados da família, overrides e conflitos técnicos.
4. **Coleta de Fontes Referenciadas**:
   - `collectReferencedSourceDocumentIds()` extrai com precisão todos os `sourceDocumentId` citados em evidências dos fatos ativos.
   - Dispara **uma única chamada em lote** (`listSourceDocuments([...referencedDocIds])`), garantindo carga estritamente finita (O(1) requisições na abertura).
5. **Projeção de Layout & Construção do ViewModel**:
   - Se um `layout` customizado não for fornecido, `autoOrganizeProductWorkspace()` estrutura seções canônicas em memória.
   - `buildMegaWorkspaceViewModel()` mapeia o estado factual normalizado para a interface visual.

---

## 3. Source Repositories & Interfaces

O container Mega Workspace consome estritamente interfaces segregadas de leitura (ISP):

```typescript
export type ProductWorkbookReadRepository = Pick<ProductWorkbookRepository, 'getWorkbook'>;

export type ProductSourceDocumentReadRepository = Pick<
  ProductSourceDocumentRepository,
  'getSourceDocument' | 'listSourceDocuments'
>;
```

- **Nenhum método mutável** (`saveWorkbook`, `upsertSourceDocument`, `deleteWorkbook`, etc.) é aceito ou instanciado.
- Repositórios padrão conectam-se ao Supabase via `SupabaseProductWorkbookRepository` e `SupabaseProductSourceDocumentRepository`, executando apenas `SELECT`.

---

## 4. Product Workbook V1 / V2 Handling

- Workbooks gravados sob o schema V1 (módulos sem datasets desacoplados ou sem metadados de auditoria completos) são transformados transparentemente em `ProductWorkbookV2` por `ensureWorkbookV2`.
- Produtos sem workbook próprio (`productWorkbook === null`) são tratados sob a salvaguarda **Family-Only**:
  - `hasProductWorkbook = false`.
  - `productRevision = undefined`.
  - Herança de 100% dos fatos e módulos da família.
  - Nenhum workbook efêmero com `revision: 0` é persistido ou exposto à API.

---

## 5. Family Inheritance & Effective Knowledge Policy

- **Política Canônica:** `effective_for_publishing`.
- **Regras de Resolução**:
  1. Se o produto possui um fato aprovado para a chave `K`, ele substitui o fato da família (`product_override`).
  2. Se o produto possui uma proposta não aprovada (`pendingOverride`), o **valor comprovado da família permanece ativo** na publicação e no Simple Mode, exibindo badge informativo.
  3. Se apenas a família possui o fato, o produto o herda legitimamente (`family_inherited`).
  4. Queda para `product.specs` legado é **estritamente proibida** (Zero Fallback Policy).

---

## 6. TechnicalDataset Rendering

- Datasets matriciais estruturados em `workbook.datasets` são projetados como blocos de tabela (`dataset_view` ou `technical_table`).
- Células que referenciam datums canônicos (`type: 'datum_ref'`) são resolvidas usando a chave de coordenada de alta precisão `getDatasetCellKey(row.id, col.id)`.
- Valores editoriais literais (`type: 'editorial_literal'`) são preservados sem inventar links semânticos.
- Identificadores de bloco (`block.id`) e identificadores de tabela/dataset (`table.id`) são explicitamente desacoplados no contrato do `SearchResultVM` (`blockId` vs `sourceTableId`), assegurando saltos DOM corretos.

---

## 7. Source & Evidence Trace

- Cada fato com evidências possui rastreabilidade granular exposta no `SourceDrawer`:
  - Documento comprobatório (`title`, `revision`, `documentType`, `externalUrl`, `fileReference`).
  - Coordenadas de citação: Página, Seção, Data de Captura.
  - Valor observado na fonte (`observedValue`).
  - Notas técnicas e trecho textual extraído (`excerpt`).
- Fontes não encontradas no catálogo de documentos são sinalizadas como "Documento de origem indisponível" sem quebrar o carregamento (Fail-Soft Provenance).

---

## 8. Conflict Policy & Strict Consensus

- Conflitos de evidência (`conflicting`) ocorrem quando fontes técnicas apresentam valores discrepantes.
- **Consenso Estrito para `multiple_agreeing`**:
  - `multiple_agreeing` é retornado **apenas** quando existem $\ge 2$ valores observados comparáveis **E todos** são estruturalmente equivalentes (`allAgree`).
  - Se houver divergência (`A=155, B=155, C=140`), o estado é categorizado como `multiple_sources` ou `conflicting_sources`.
  - Se um conflito histórico foi decidido arbitrariamente por `canonicalDecision`, o sistema reporta `multiple_sources` e nunca mente afirmando haver concordância unânime.

---

## 9. Search Scope

A busca global cobre de forma abrangente:
1. **Fatos Técnicos / Datums**: Rótulo exibido, chave canônica, aliases contextuais, valores formatados e fontes citadas.
2. **Fontes Comprobatórias / Documentos**: Título, tipo de documento, URL, referência de arquivo, notas e excertos de evidências.
3. **Tabelas Técnicas & Datasets**: Título da tabela, descrição, rótulos de linhas (`row.label`), IDs de linhas (`row.id`), rótulos de colunas (`col.label`) e IDs de colunas (`col.id`).
4. **Seções & Notas Editoriais**: Título e descrição de seções, além de notas textuais (`text_note`).

---

## 10. Simple vs Advanced Modes

| Dimensão | Simple Mode | Advanced Mode |
| :--- | :--- | :--- |
| **Foco** | Consumo rápido, legibilidade e clareza executiva | Engenharia técnica, auditoria e metrologia |
| **Vocabulário** | "Informações técnicas", "Informações da família" | "Fatos canônicos", chaves de módulo, semântica |
| **Chaves Semânticas**| Ocultas por padrão | Visíveis em monospace para integração de IA/API |
| **Overrides Pendentes**| Exibe o fato estável publicado com badge | Permite inspecionar a minuta concorrente |
| **Verdade Factual** | Idêntica (`effective_for_publishing`) | Idêntica (`effective_for_publishing`) |

---

## 11. Read-Only Boundary & Intentionally Disabled Persistence

- **Mutabilidade Desabilitada**:
  - Nenhuma escrita de layout (`WorkspaceLayoutV1`) em banco de dados.
  - Nenhuma escrita de dados técnicos (`ProductWorkbookV2`) pelo Mega Workspace.
  - Nenhuma escrita no Registro Semântico (`SemanticRegistryV1`).
  - Nenhuma ingestão de IA ativa no fluxo.
- **Autoridade Operacional**:
  - O Workspace Clássico (`ProductKnowledgeWorkspace`) permanece a autoridade operacional para edição e salvamento.
- **Beta Gate**:
  - O Mega Workspace opera sob chave de alternância voluntária em memória, sem persistência em `localStorage` para evitar armadilhas de sessão para o usuário.

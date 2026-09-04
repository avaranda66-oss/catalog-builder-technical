# MEGA WORKSPACE — PRODUCTION VIEW MODEL SPECIFICATION (V1)
> **Status:** RATIFIED BY UX1.3 (AMENDMENTS 1, 2, 3, 5, 6, 7, 8, 9, 13, 14, 15, 17, 18)  
> **Authority Level:** VALIDATED UI VIEW-MODEL CONTRACT (ZERO SECOND TRUTH)  
> **Related Documents:** `UX_TO_DOMAIN_TYPE_MAP.md`, `AGENT1_INTEGRATION_NOTES.md`, `PRODUCTION_COMPONENT_ADOPTION_MATRIX.md`

---

## 1. Visão Geral e Princípios Fundamentais

O **MegaWorkspaceViewModel** é a projeção normalizada e orientada à interface humana, posicionada entre os domínios internos do PIM (`ProductWorkbookV2`, `ResolvedProductKnowledge`, `TechnicalDatum`, `Evidence`) e a árvore de componentes visuais do React.

### Princípios Inegociáveis

1. **ZERO SECOND TRUTH (Identidade Canônica Única):**  
   Nenhum dado técnico é duplicado com authority própria. Se o mesmo fato técnico (ex: *Faixa de Temperatura*) aparece no Hero Summary, no Fact Grid, numa Mega Tabela Comparativa e nos Resultados de Busca, **todos apontam para a mesma entrada em `factsById[datumId]`**.
2. **TABLE ROW != FACT / TABLE CELL MAY REPRESENT A FACT:**  
   Linhas de tabela são agrupamentos estruturais de apresentação. Uma célula técnica com `type: 'fact_ref'` referencia um fato técnico estável (`datumId`). Células editoriais (`type: 'editorial_literal'`) contribuem zero fatos.
3. **DOIS EIXOS ORTOGONAIS DE INTERFACE:**  
   - `InteractionMode`: `view` | `edit_layout` | `edit_data`
   - `DetailLevel`: `simple` | `advanced`
   *"Meu pai pode editar em Simple Mode sem virar usuário de engenharia."* Advanced NÃO significa edição; Edição NÃO significa Advanced.
4. **UI-ORIENTED (Isolação de Internals):**  
   A UI nunca importa diretamente nem manipula `ProductWorkbookV2 raw`, `ResolvedProductKnowledge raw`, ou chamadas diretas ao Supabase. Toda interação passa por eventos tipados com rollback e staging local.

---

## 2. Estrutura Canônica do ViewModel Normalizado

```typescript
export interface MegaWorkspaceViewModel {
  /** Metadados de apresentação do produto */
  product: ProductPresentationVM;

  /** Métricas globais derivadas da projeção */
  metrics: WorkspaceMetricsVM;

  /** Mapa canônico de fatos técnicos normalizados indexados por datumId */
  factsById: Record<string, ProjectedFactVM>;

  /** Mapa de documentos comprobatórios indexados por documentId estável */
  sourcesById: Record<string, ProjectedSourceVM>;

  /** Conflitos técnicos detectados indexados por datumId */
  conflictsByFactId: Record<string, ProjectedConflictVM>;

  /** Seções editoriais contendo blocos e referências */
  sections: ProjectedSectionVM[];

  /** Estado da sessão e eixos ortogonais */
  session: WorkspaceSessionVM;
}
```

### 2.1 Detalhamento das Entidades

#### `ProjectedFactVM` (Fato Técnico Normalizado)
```typescript
export interface ProjectedFactVM {
  /** Identidade estável no domínio (TechnicalDatum.id) */
  datumId: string;
  /** Chave semântica canônica no registry */
  canonicalSemanticKey: string;
  /** Nome amigável padrão sugerido pelo registry */
  canonicalLabel: string;
  /** Valor técnico formatado para exibição */
  formattedValue: string;
  /** Valor técnico bruto tipado */
  rawValue: string | number | boolean;
  /** Unidade canônica */
  unit?: string;
  /** Tolerância ou incerteza */
  tolerance?: string;
  /** Dimensão física / metrológica */
  dimensionKind?: string;
  /** Estado de evidência documental puro */
  evidenceState: 'no_source' | 'single_source' | 'multiple_agreeing' | 'conflicting_sources';
  /** Origem de herança do conhecimento */
  originState: 'product_local' | 'family' | 'product_override';
  /** Rótulo legível da origem */
  originLabel: string;
  /** IDs dos documentos comprobatórios (apontam para sourcesById) */
  sourceDocumentIds: string[];
  /** Indica se há divergência oficial ativa */
  hasConflict: boolean;
}
```

#### `MegaTableCellVM` (Célula Estruturada de Tabela)
```typescript
export type MegaTableCellVM =
  | {
      type: 'fact_ref';
      /** Referência ao fato canônico em factsById */
      factId: string;
      /** Override visual local de apresentação da célula se houver */
      displayOverride?: string;
    }
  | {
      type: 'editorial_literal';
      /** Conteúdo textual editorial sem entidade técnica subjacente */
      value: string;
      highlight?: boolean;
    };
```

#### `WorkspaceMetricsVM` (Métricas Não-Ambíguas)
```typescript
export interface WorkspaceMetricsVM {
  /** Total de fatos técnicos disponíveis no produto (knowledge base) */
  knowledgeFactsCount: number;
  /** Fatos técnicos únicos referenciados pela visualização ativa */
  visibleUniqueFactsCount: number;
  /** Total de ocorrências visuais de fatos renderizadas */
  visibleFactOccurrences: number;
  /** Total de referências a fatos dentro de células de tabelas */
  tableFactReferencesCount: number;
  /** Quantidade de blocos de tabela */
  tablesCount: number;
  /** Quantidade de documentos únicos referenciados (por documentId) */
  sourcesCount: number;
  /** Quantidade de fatos únicos com divergência (por datumId) */
  conflictsCount: number;
}
```

---

## 3. Matriz de Classificação de Mapeamento do ViewModel (Amendment 18)

Cada campo exposto ao React é classificado estritamente em uma das 5 categorias:
1. `LOSSLESS DIRECT`: Passagem direta e fidedigna de entidade canônica do domínio.
2. `FORMAT ONLY`: Conversão determinística de formato (ex: número -> string com vírgula).
3. `DERIVED PRESENTATION`: Agregação de alto nível calculada sobre a coleção normalizada.
4. `LAYOUT PRESENTATION`: Configuração puramente visual/editorial (ordem, tamanho, overrides).
5. `NOT AVAILABLE`: Propriedade interna do backend não exposta à camada de UI.

| Campo do ViewModel | Origem no Domínio / Engine | Classificação | Justificativa Arquitetural |
| :--- | :--- | :--- | :--- |
| `fact.datumId` | `TechnicalDatum.id` | **LOSSLESS DIRECT** | Identidade imutável estável da entidade técnica |
| `fact.canonicalSemanticKey` | `TechnicalDatum.canonicalKey` | **LOSSLESS DIRECT** | Chave canônica semântica do registry |
| `fact.formattedValue` | `TechnicalDatum.value` + Locale | **FORMAT ONLY** | Formatação human-first (vírgula decimal pt-BR) |
| `fact.unit` | `TechnicalDatum.unit` | **LOSSLESS DIRECT** | Símbolo de unidade métrica oficial |
| `fact.evidenceState` | `Evidence[]` aggregation | **DERIVED PRESENTATION** | Estado puro derivado de fontes (`single`, `multiple`, etc.) |
| `fact.originState` | `KnowledgeScope` / Inheritance | **LOSSLESS DIRECT** | Origem pura (`product_local`, `family`, `override`) |
| `block.displayLabel` | `LayoutOverride` \| `canonical` | **LAYOUT PRESENTATION** | Label customizado no layout sem alterar chave técnica |
| `block.size` | `WorkspaceBlockDef.size` | **LAYOUT PRESENTATION** | Largura visual do bloco no grid (`small`, `half`, `full`) |
| `block.isHidden` | `WorkspaceBlockDef.isHidden` | **LAYOUT PRESENTATION** | Visibilidade local sem expurgar o fato do produto |
| `metrics.sourcesCount` | `Set(documentId)` | **DERIVED PRESENTATION** | Deduplicação exata de documentos por ID único |
| `metrics.conflictsCount` | `Set(datumId with conflict)`| **DERIVED PRESENTATION** | Deduplicação exata de divergências por fato |
| `table.cells[c].type` | Table cell definition | **DERIVED PRESENTATION** | Distinção entre `fact_ref` e `editorial_literal` |
| `searchResult.target` | Reference coordinates | **DERIVED PRESENTATION** | Aponta para `factId` e localização sem criar cópia |
| `dbInternalRevisionHash` | Supabase WAL sequence | **NOT AVAILABLE** | Jargão interno ocultado da UI humana |
| `casRegistryId` | Chemical Registry internal ID | **NOT AVAILABLE** | Proibido em Simple Mode e ocultado de visualizações |

---

## 4. Contrato de Eventos de Edição (Amendment 14 & 15)

Nenhum componente React chama mutações diretamente no banco de dados ou no `ProductWorkbook`. Todas as intenções de alteração do usuário são emitidas através do catálogo de eventos categorizados:

### 4.1 Eventos de Layout (`InteractionMode = 'edit_layout'`)
*Não alteram valores de TechnicalDatum.*
- `onRenameSection(sectionId: string, newTitle: string): void`
- `onMoveSection(fromIndex: number, toIndex: number): void`
- `onMoveBlock(sectionId: string, fromIndex: number, toIndex: number): void`
- `onResizeBlock(sectionId: string, blockId: string, size: 'small' | 'half' | 'full'): void`
- `onSetBlockVisibility(sectionId: string, blockId: string, isHidden: boolean): void`
- `onUpdateDisplayOverride(datumId: string, visualLabel: string): void`

### 4.2 Eventos de Dados Técnicos (`InteractionMode = 'edit_data'`)
*Tratam de valores, unidades e escopos de conhecimento.*
- `onStageFactEdit(datumId: string, patch: { value?: string; unit?: string }, targetScope?: 'model' | 'family'): void`
- `onStageAddTechnicalFact(sectionId: string, factDraft: NewFactDraft): void`

### 4.3 Eventos Semânticos e de Fontes
- `onRequestCanonicalRenamePreview(datumId: string, newCanonicalKey: string): Promise<ImpactPreview>`
- `onOpenSourceTrace(datumId: string): void`

### 4.4 Eventos Assistidos por IA
- `onRequestOrganizationProposal(): Promise<OrganizationDiff>`
- `onRequestDocumentExtractionReview(documentId: string): void`

---

## 5. Matriz de Combinação dos Eixos Ortogonais (Amendment 5)

```text
                        SIMPLE MODE                           ADVANCED MODE
            ┌────────────────────────────────────┬────────────────────────────────────┐
            │ • Zero jargões (datum, CAS, etc.) │ • Exibe chaves semânticas completas│
VIEW        │ • Badges amigáveis de fonte        │ • Auditoria detalhada de fontes    │
            │ • Modo de leitura limpo para todos │ • Hash de versões e revisões       │
            ├────────────────────────────────────┼────────────────────────────────────┤
EDIT        │ • Reorganizar blocos/seções        │ • Reorganização avançada           │
LAYOUT      │ • Renomear seções em linguagem pura│ • Ajuste fino de tamanhos e slots  │
            │ • Esconder/revelar blocos          │ • Configurações técnicas de grid   │
            ├────────────────────────────────────┼────────────────────────────────────┤
EDIT        │ • Editar valores (ex: Peso)        │ • Edição de valores e unidades     │
DATA        │ • Adicionar nova especificação     │ • Escolha de escopo (família/local)│
            │ • Salvar/Desfazer com 1 clique     │ • Resolução de divergências e chaves│
            └────────────────────────────────────┴────────────────────────────────────┘
```

---

## 6. Política de Busca e Destaque (Amendment 17)

Resultados de busca **nunca instanciam novos objetos de fato**.  
A estrutura de `SearchResultItem` apenas carrega coordenadas de referência:

```typescript
export interface SearchResultReference {
  factId: string;
  sectionId: string;
  blockId: string;
  tableCoordinates?: {
    rowId: string;
    columnId: string;
  };
  highlightQuery: string;
}
```
Ao clicar num resultado, o workspace executa foco e rolagem até o elemento alvo existente, garantindo **Zero Second Truth**.

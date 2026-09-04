# MEGA WORKSPACE — PRODUCTION VIEW MODEL SPECIFICATION (V1)
> **Status:** PRE-INTEGRATION CANDIDATE (REVISED AGAINST FOUNDATION1D `3bbbc3a960136e383055f37a3602541df01050b8`)  
> **Authority Level:** VALIDATED UI VIEW-MODEL CONTRACT (ZERO SECOND TRUTH)  
> **Related Documents:** `UX_TO_DOMAIN_TYPE_MAP.md`, `AGENT1_INTEGRATION_NOTES.md`, `PRODUCTION_COMPONENT_ADOPTION_MATRIX.md`

---

## 1. Visão Geral e Princípios Fundamentais

O **MegaWorkspaceViewModel** é a projeção normalizada e orientada à interface humana, posicionada entre os domínios internos do PIM (`ProductWorkbookV2`, `ResolvedProductKnowledge`, `TechnicalDatum`, `Evidence`, `AiProductKnowledgeEnvelope`) e a árvore de componentes visuais do React.

### Princípios Inegociáveis

1. **ZERO SECOND TRUTH (Identidade Canônica Única):**  
   Nenhum dado técnico é duplicado com autoridade própria. Se o mesmo fato técnico (ex: *Faixa de Temperatura*) aparece no Hero Summary, no Fact Grid, numa Mega Tabela Comparativa e nos Resultados de Busca, **todos apontam para a mesma entrada em `factsById[datumId]`**.
2. **TABLE ROW != FACT / TABLE CELL MAY REPRESENT A FACT:**  
   Linhas de tabela são agrupamentos estruturais de apresentação. Uma célula técnica com `type: 'fact_ref'` referencia um fato técnico estável (`datumId`). Células editoriais (`type: 'editorial_literal'`) contribuem zero fatos.
3. **DOIS EIXOS ORTOGONAIS DE INTERFACE (SEM MODOS LEGADOS NO VM):**  
   - `InteractionMode`: `'view' | 'edit_layout' | 'edit_data'`
   - `DetailLevel`: `'simple' | 'advanced'`  
   *Modos legados como `WorkspaceMode` e `WorkspacePerspective` pertencem estritamente à retrocompatibilidade temporária do LAB e NÃO fazem parte do contrato de produção.*
   *"Meu pai pode editar em Simple Mode sem virar usuário de engenharia."* Advanced NÃO significa edição; Edição NÃO significa Advanced.
4. **VALOR TÉCNICO LOSSLESS (PRESERVE FULL TECHNICAL VALUE):**  
   O ViewModel nunca achata `TechnicalValue` para a união primitiva `string | number | boolean`. Todos os fatos técnicos preservam a união discriminada completa de 10 variantes do domínio (`text`, `number`, `boolean`, `quantity`, `range`, `enum`, `technical_token`, `asset_reference`, `product_reference`, `unknown`).
5. **KNOWLEDGE FACTS COUNT É ESTRITAMENTE CANÔNICO:**  
   A métrica `knowledgeFactsCount` reflete exclusivamente a cardinalidade de `factsById` / base de conhecimento canônica do produto. **Nunca é calculada por inferência ou caminhada visual pela tela.** Na ausência de base canônica, o layout expõe `referencedFactsCount`.
6. **PROPRIEDADES CANÔNICAS DO DOMÍNIO:**  
   A entidade técnica do domínio chama-se `TechnicalDatum` e sua chave canônica no datum é `semanticKey` (nunca `canonicalKey`). O lookup canônico é resolvido contra o `SemanticRegistry`.
7. **GRID EDITORIAL PADRONIZADO (BLOCK SIZE & VISIBILITY):**  
   Tamanhos de blocos alinhados 1:1 com `WorkspaceBlockSize`: `'small' | 'medium' | 'large' | 'full'` (sem `'half'`). Visibilidade alinhada com `WorkspaceBlockVisibility`: `'visible' | 'hidden'` (`isHidden` é puramente apresentação derivada).
8. **ZERO CONFUSÃO COM CAS:**  
   Neste repositório, **CAS** refere-se exclusivamente a **Compare-And-Swap** (mecanismo de concorrência otimista e controle de revisão em saves de catálogo/template), sem qualquer relação com registros químicos ou bases moleculares.

---

## 2. Estrutura Canônica do ViewModel Normalizado

```typescript
export interface MegaWorkspaceViewModel {
  /** Metadados de apresentação do produto */
  readonly product: ProductPresentationVM;

  /** Métricas globais não-ambíguas derivadas da projeção */
  readonly metrics: WorkspaceMetricsVM;

  /** Mapa canônico de fatos técnicos normalizados indexados por datumId */
  readonly factsById: Readonly<Record<string, ProjectedFactVM>>;

  /** Mapa de documentos comprobatórios indexados por documentId estável */
  readonly sourcesById: Readonly<Record<string, ProjectedSourceVM>>;

  /** Conflitos técnicos detectados indexados por datumId */
  readonly conflictsByFactId: Readonly<Record<string, ProjectedConflictVM>>;

  /** Seções editoriais contendo blocos estruturados e referências */
  readonly sections: readonly ProjectedSectionVM[];

  /** Estado da sessão e eixos ortogonais de apresentação */
  readonly session: WorkspaceSessionVM;
}
```

### 2.1 Detalhamento das Entidades

#### `TechnicalValueDTO` (Lossless Discriminado)
```typescript
export type TechnicalValueDTO =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'boolean'; readonly value: boolean }
  | {
      readonly type: 'quantity';
      readonly amount: number;
      readonly unit: string;
      readonly qualifier?: string;
    }
  | {
      readonly type: 'range';
      readonly lower?: number;
      readonly upper?: number;
      readonly unit: string;
      readonly lowerInclusive?: boolean;
      readonly upperInclusive?: boolean;
    }
  | {
      readonly type: 'enum';
      readonly code: string;
      readonly label?: string;
    }
  | {
      readonly type: 'technical_token';
      readonly token: string;
      readonly category?: string;
    }
  | {
      readonly type: 'asset_reference';
      readonly assetId: string;
      readonly mimeType?: string;
      readonly label?: string;
    }
  | {
      readonly type: 'product_reference';
      readonly targetProductId: string;
      readonly relationKind?: string;
    }
  | {
      readonly type: 'unknown';
      readonly reason?: string;
    };
```

#### `ProjectedFactVM` (Fato Técnico Normalizado)
```typescript
export interface ProjectedFactVM {
  /** Identidade estável no domínio (TechnicalDatum.id) */
  readonly datumId: string;
  /** Chave semântica canônica do datum (TechnicalDatum.semanticKey) */
  readonly semanticKey: string;
  /** Nome amigável padrão sugerido pelo SemanticRegistry */
  readonly canonicalLabel: string;
  /** Valor técnico formatado para leitura humana (pt-BR locale) */
  readonly formattedValue: string;
  /** Valor técnico estruturado lossless (10 variantes discriminadas) */
  readonly technicalValue: TechnicalValueDTO;
  /** Unidade métrica oficial */
  readonly unit?: string;
  /** Tolerância ou incerteza metrológica */
  readonly tolerance?: string;
  /** Dimensão física / metrológica */
  readonly dimensionKind?: string;
  /** Estado puro de evidência documental */
  readonly evidenceState: 'no_source' | 'single_source' | 'multiple_agreeing' | 'conflicting_sources';
  /** Origem de herança do conhecimento */
  readonly originState: 'product_local' | 'family' | 'product_override';
  /** Rótulo legível da origem (ex: "Linha TA" ou "Calibrador TA-25N") */
  readonly originLabel: string;
  /** IDs dos documentos comprobatórios (apontam para sourcesById) */
  readonly sourceDocumentIds: readonly string[];
  /** Indica se há divergência oficial ativa */
  readonly hasConflict: boolean;
}
```

#### `MegaTableCellVM` (Célula Estruturada de Tabela)
```typescript
export type MegaTableCellVM =
  | {
      readonly type: 'fact_ref';
      /** Referência ao fato canônico em factsById */
      readonly factId: string;
      /** Override visual local de apresentação da célula se houver */
      readonly displayOverride?: string;
    }
  | {
      readonly type: 'editorial_literal';
      /** Conteúdo textual editorial sem entidade técnica subjacente */
      readonly value: string;
      readonly highlight?: boolean;
    };
```

#### `WorkspaceMetricsVM` (Política Não-Ambígua de Visibilidade e Contagem)
```typescript
export interface WorkspaceMetricsVM {
  /** Total canônico de fatos disponíveis no produto (cardinalidade de factsById; ZERO fallback para tela) */
  readonly knowledgeFactsCount?: number;
  /** Total de fatos únicos referenciados na árvore de layout (independente de visibilidade) */
  readonly referencedFactsCount: number;
  /** Fatos técnicos únicos referenciados pela visualização ativa (blocos visíveis) */
  readonly visibleUniqueFactsCount: number;
  /** Total de ocorrências visuais de fatos renderizadas */
  readonly visibleFactOccurrences: number;
  /** Total de referências a fatos dentro de células de tabelas */
  readonly tableFactReferencesCount: number;
  /** Quantidade de blocos de tabela */
  readonly tablesCount: number;
  /** Quantidade de documentos de fonte únicos (por documentId estável) */
  readonly sourcesCount: number;
  /** Total de conflitos canônicos conhecidos no produto */
  readonly knowledgeConflictsCount?: number;
  /** Total de fatos únicos em conflito apresentados na visualização ativa */
  readonly visibleConflictsCount: number;
}
```

#### `WorkspaceSessionVM` (Eixos Ortogonais de Apresentação)
```typescript
export interface WorkspaceSessionVM {
  readonly interactionMode: 'view' | 'edit_layout' | 'edit_data';
  readonly detailLevel: 'simple' | 'advanced';
  readonly activeSectionId?: string;
  readonly searchQuery?: string;
}
```

---

## 3. Matriz de Classificação de Mapeamento do ViewModel (5 Tiers)

Classificação estrita contra FOUNDATION1D (`3bbbc3a960136e383055f37a3602541df01050b8`):
1. `DIRECT`: Correspondência direta 1:1 sem transformação.
2. `FORMAT ONLY`: Conversão determinística de formato (ex: número -> string com vírgula).
3. `DERIVED PRESENTATION`: Agregação de alto nível calculada sobre a coleção normalizada.
4. `ADAPTER REQUIRED`: Estrutura requer adapter bidirecional para transpor o schema de domínio para UI.
5. `NOT AVAILABLE`: Propriedade interna de infraestrutura/backend não exposta à UI humana.

| Campo do ViewModel | Origem no Domínio / Engine | Classificação | Justificativa Arquitetural |
| :--- | :--- | :--- | :--- |
| `fact.datumId` | `TechnicalDatum.id` | **DIRECT** | Identidade imutável estável da entidade técnica |
| `fact.semanticKey` | `TechnicalDatum.semanticKey` | **DIRECT** | Chave canônica semântica no datum |
| `fact.technicalValue` | `TechnicalDatum.value` | **DIRECT** | União discriminada de 10 variantes preservada sem perda |
| `fact.formattedValue` | `TechnicalDatum.value` + Locale | **FORMAT ONLY** | Formatação human-first (vírgula decimal pt-BR) |
| `fact.unit` | `TechnicalDatum.value.unit` | **DIRECT** | Símbolo de unidade métrica canônica |
| `fact.evidenceState` | `Evidence[]` aggregation | **DERIVED PRESENTATION** | Estado puro derivado de fontes (`single`, `multiple`, etc.) |
| `fact.originState` | `DatumOrigin` (`local`\|`inherited`\|`override`) | **DIRECT** | Origem pura mapeada 1:1 com `KnowledgeScope` |
| `block.size` | `WorkspaceBlockDef.size` (`small`\|`medium`\|`large`\|`full`) | **DIRECT** | Sizing editorial idêntico ao contrato da FOUNDATION1D |
| `block.visibility` | `WorkspaceBlockDef.visibility` (`visible`\|`hidden`) | **DIRECT** | Visibilidade canônica idêntica ao contrato da FOUNDATION1D |
| `block.displayLabel` | `LayoutOverride` \| `SemanticRegistry` | **DERIVED PRESENTATION** | Label customizado no layout sem alterar `semanticKey` |
| `metrics.knowledgeFactsCount`| `factsById.size` / `stats.totalDatums` | **DIRECT** | Cardinalidade canônica pura da base de conhecimento |
| `metrics.visibleUniqueFactsCount`| `Set(datumId in visible blocks)` | **DERIVED PRESENTATION** | Fatos únicos apresentados no layout visível |
| `metrics.sourcesCount` | `Set(documentId)` | **DERIVED PRESENTATION** | Deduplicação exata de documentos por ID único |
| `table.cells[c].type` | Table cell definition (`fact_ref`\|`editorial_literal`) | **DERIVED PRESENTATION** | Distinção entre referência técnica e literal textual |
| `searchResult.target` | Reference coordinates | **DERIVED PRESENTATION** | Aponta para `factId` e localização sem criar nova cópia |
| `humanProvenance` | `ProjectedSourceTrace` + `HumanProvenanceItem` | **ADAPTER REQUIRED** | Adapter transpõe histórico do backend para o drawer visual |
| `aiKnowledgeEnvelope` | `AiProductKnowledgeEnvelope` | **ADAPTER REQUIRED** | Adapter consome envelope seguro de IA para staging editorial |
| `dbInternalRevisionHash` | Supabase WAL sequence / CAS token | **NOT AVAILABLE** | Tokens internos de Compare-And-Swap ocultados da UI |

---

## 4. Contrato de Eventos de Edição (InteractionMode)

Nenhum componente React chama mutações diretamente no Supabase ou no `ProductWorkbook`. Todas as intenções do usuário são emitidas através de eventos tipados categorizados:

### 4.1 Eventos de Layout (`InteractionMode = 'edit_layout'`)
*Não alteram valores de TechnicalDatum.*
- `onRenameSection(sectionId: string, newTitle: string): void`
- `onMoveSection(fromIndex: number, toIndex: number): void`
- `onMoveBlock(sectionId: string, fromIndex: number, toIndex: number): void`
- `onResizeBlock(sectionId: string, blockId: string, size: WorkspaceBlockSize): void`
- `onSetBlockVisibility(sectionId: string, blockId: string, visibility: WorkspaceBlockVisibility): void`
- `onUpdateDisplayOverride(datumId: string, visualLabel: string): void`

### 4.2 Eventos de Dados Técnicos (`InteractionMode = 'edit_data'`)
*Tratam de valores, unidades e escopos de conhecimento.*
- `onStageFactEdit(datumId: string, patch: { value?: string; unit?: string }, targetScope?: 'model' | 'family'): void`
- `onStageAddTechnicalFact(sectionId: string, factDraft: NewFactDraft): void`

### 4.3 Eventos Semânticos e de Fontes
- `onRequestCanonicalRenamePreview(datumId: string, newSemanticKey: string): Promise<ImpactPreview>`
- `onOpenSourceTrace(datumId: string): void`

### 4.4 Eventos Assistidos por IA
- `onRequestOrganizationProposal(): Promise<OrganizationDiff>`
- `onRequestDocumentExtractionReview(documentId: string): void`

---

## 5. Matriz de Combinação dos Eixos Ortogonais

```text
                        SIMPLE MODE                           ADVANCED MODE
            ┌────────────────────────────────────┬────────────────────────────────────┐
            │ • Zero jargões técnicos            │ • Exibe chaves semânticas completas│
VIEW        │ • Badges amigáveis de evidência    │ • Auditoria detalhada de fontes    │
            │ • Modo de leitura limpo para todos │ • Exibição de escopos e revisões   │
            ├────────────────────────────────────┼────────────────────────────────────┤
EDIT        │ • Reorganizar blocos/seções        │ • Reorganização avançada           │
LAYOUT      │ • Renomear seções em linguagem pura│ • Ajuste fino de tamanhos e slots  │
            │ • Ocultar/revelar blocos           │ • Configurações técnicas de grid   │
            ├────────────────────────────────────┼────────────────────────────────────┤
EDIT        │ • Editar valores (ex: Peso)        │ • Edição de valores e unidades     │
DATA        │ • Adicionar nova especificação     │ • Escolha de escopo (família/local)│
            │ • Salvar/Desfazer com 1 clique     │ • Resolução técnica de divergências│
            └────────────────────────────────────┴────────────────────────────────────┘
```

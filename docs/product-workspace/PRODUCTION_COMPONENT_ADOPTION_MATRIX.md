# PRODUCTION COMPONENT ADOPTION MATRIX (V1)
> **Status:** RATIFIED BY UX1.3 (AMENDMENTS 12, 13 & 14)  
> **Mission:** `PIM.MEGA.WORKSPACE.UX1.3`  
> **Scope:** Avaliação comparativa entre componentes existentes em produção (`src/components/library/product-workspace/**`) e os componentes validados no UX Lab (`src/labs/product-workspace-ux/components/**`).

---

## 1. Hierarquia de Autoridade do Projeto

Para evitar duplicidade, ambiguidades ou divergências arquiteturais entre os times de desenvolvimento, a seguinte hierarquia estrita é ratificada:

1. **DOMAIN AUTHORITY (`src/domain/product-workspace/**`):**  
   Autoridade absoluta sobre regras de negócio, integridade de `ProductWorkbook`, cálculo de `ResolvedProductKnowledge`, modelo de herança (`KnowledgeScope`) e consistência transacional com o Supabase.
2. **VALIDATED VISUAL & INTERACTION AUTHORITY (`UX Lab` — `src/labs/product-workspace-ux/**`):**  
   Autoridade absoluta sobre a experiência humana do usuário, layouts fluidos de seções e blocos, densidade de tabelas, eixos ortogonais de interação (`InteractionMode` x `DetailLevel`), affordances de evidência, neutralidade de divergências e usabilidade (The Father Test).
3. **IMPLEMENTATION CANDIDATES (`Agent 1 React Components`):**  
   Componentes tabulares e modais legados existentes em `src/components/library/product-workspace/**`. Não são "headless", são componentes React que devem ser adotados, mesclados, reescritos ou aposentados conforme a matriz abaixo.

**Regra de Ouro:** Não manter duas interfaces de usuário paralelas em produção após a integração.

---

## 2. Categorias de Decisão da Matriz

- **`ADOPT UX IMPLEMENTATION`**: O componente do UX Lab é adotado diretamente como a UI oficial de produção (com desacoplamento de fixtures para o ViewModel normalizado).
- **`REUSE EXISTING COMPONENT`**: O componente existente do Agente 1 já possui a lógica de domínio necessária e é integrado diretamente à casca do workspace.
- **`MERGE BEHAVIOR`**: Combina a interface validada do UX Lab com a lógica de negócio ou integração avançada existente no componente do Agente 1.
- **`REWRITE AGAINST VIEWMODEL`**: O componente existente tem utilidade, mas seus contratos internos devem ser reescritos para consumir exclusivamente o `MegaWorkspaceViewModel` normalizado.
- **`RETIRE`**: Componente legado ou duplicado que é descontinuado e substituído pela nova arquitetura unificada.

---

## 3. Matriz Completa de Adoção de Componentes

| Componente UX Lab | Componente Existente (Agente 1 / Legado) | Decisão de Adoção | Racional Arquitetural e Plano de Migração |
| :--- | :--- | :--- | :--- |
| `WorkspaceHeader.tsx` | `ProductKnowledgeWorkspace.tsx` (cabeçalho) | **ADOPT UX IMPLEMENTATION** | O header do UX Lab implementa seletor dinâmico, eixos ortogonais (`InteractionMode` e `DetailLevel`), métricas normalizadas sem drift e filtro em tempo real. Substitui o cabeçalho tabulado legado. |
| `WorkspaceNavOutline.tsx` | *Nenhum (novo no UX Lab)* | **ADOPT UX IMPLEMENTATION** | Navegação rápida sticky com contagem de fatos por seção e scroll suave, essencial para catálogos longos (>50 fatos). |
| `WorkspaceSection.tsx` | *Nenhum (novo no UX Lab)* | **ADOPT UX IMPLEMENTATION** | Container editorial com suporte a arrastar/mover seções, adicionar blocos, e colapso responsivo. |
| `FactGridBlock.tsx` | `WorkspaceTechnicalDataTab.tsx` | **ADOPT UX IMPLEMENTATION** | Exibição em cards/grid com suporte a Hero e Ficha Técnica, tags de fonte/conflito puras e isolamento total de jargão técnico em Simple Mode. |
| `MegaTableBlock.tsx` | `WorkspaceTechnicalTablesTab.tsx` | **MERGE BEHAVIOR** | O UX Lab traz layout human-first com alternância de densidade (`compact`/`spacious`), busca de linhas e modo tela cheia. O componente existente traz paginação e renderização virtualizada. Unificar adotando o visual do UX Lab com os algoritmos de virtualização do Agente 1. |
| `SourceDrawer.tsx` | `WorkspaceDocumentsEvidenceTab.tsx` (drawer) | **ADOPT UX IMPLEMENTATION** | Exibe trecho exato do PDF, página, data de extração, histórico de revisão e isolamento neutro de divergências. Totalmente auditado pelo Father Test. |
| `DocumentsBlock.tsx` | `WorkspaceDocumentsEvidenceTab.tsx` (lista) | **REWRITE AGAINST VIEWMODEL** | Reutilizar a visualização em grade de documentos do Agente 1, reescrevendo-a para consumir `sourcesById` do ViewModel normalizado. |
| `ConflictsBlock.tsx` | *Nenhum (novo no UX Lab)* | **ADOPT UX IMPLEMENTATION** | Painel de divergências neutro que trata desvios como fatos oficiais sem acusações de "erro de sistema", com 1 clique para inspeção. |
| `EditFactModal.tsx` | `CellEditorModal.tsx` | **MERGE BEHAVIOR** | O UX Lab oferece modal intuitivo com seleção de escopo (`model` vs `family`) e sanitização em Simple Mode. O modal existente possui histórico de auditoria (`CellHistoryModal`). Adotar o layout do UX Lab incorporando a aba de histórico. |
| `AddTechnicalInfoModal.tsx` | `NewDatasetModal.tsx` / `NewModuleModal.tsx` | **ADOPT UX IMPLEMENTATION** | Interface human-first para inclusão de novos fatos sem exigir conhecimento do usuário sobre datasets relacionais ou módulos internos. |
| `SemanticRenameModal.tsx` | *Nenhum (novo no UX Lab)* | **ADOPT UX IMPLEMENTATION** | Permite alterar o rótulo de exibição local (`displayOverride`) ou disparar preview de migração semântica canônica com impacto controlado. |
| `SemanticAdvancedDrawer.tsx`| *Nenhum (novo no UX Lab)* | **ADOPT UX IMPLEMENTATION** | Exclusivo para `DetailLevel === 'advanced'`, exibe a árvore de aliases e tokens do schema do Agente 1 sem poluir a interface do usuário comum. |
| `AIOrganizeModal.tsx` | *Nenhum (novo no UX Lab)* | **ADOPT UX IMPLEMENTATION** | Diálogo de pré-visualização de organização automática com diff antes/depois, garantindo zero exclusão acidental de fatos. |
| `AIImportModal.tsx` | *Nenhum (novo no UX Lab)* | **ADOPT UX IMPLEMENTATION** | Staging de extração documental assistida por IA com conferência humana prévia. |
| `UndoToast.tsx` | *Nenhum (novo no UX Lab)* | **ADOPT UX IMPLEMENTATION** | Feedback atômico de reversão de ações locais com teclado (Ctrl+Z) e botão visual. |
| *Nenhum* | `WorkspaceSummaryTab.tsx` | **RETIRE** | Substituído integralmente pela visualização contínua de blocos do Mega Workspace, eliminando a fragmentação por abas. |
| *Nenhum* | `CrossProductTransferModal.tsx` | **REUSE EXISTING COMPONENT** | Modal utilitário especializado do Agente 1 para clonagem/transferência entre produtos. Conectar como ação no menu secundário do Header. |
| *Nenhum* | `DeleteFamilyModal.tsx` | **REUSE EXISTING COMPONENT** | Modal administrativo do Agente 1 mantido para operações de nível de família. |
| *Nenhum* | `RenameFamilyModal.tsx` | **REUSE EXISTING COMPONENT** | Modal administrativo do Agente 1 mantido para operações de nível de família. |

---

## 4. Plano de Transição para Produção (PIM.MEGA.WORKSPACE.INTEGRATION1)

1. **Remoção de Mock/Fixtures:** Os componentes marcados como `ADOPT UX IMPLEMENTATION` receberão suas propriedades a partir do adapter `domainToMegaWorkspaceViewModel()`.
2. **Merge de Tabelas Técnicas:** Criar o componente consolidado `src/components/library/product-workspace/MegaTableUnified.tsx` contendo o cabeçalho/filtros do UX Lab e o grid virtualizado do Agente 1.
3. **Eliminação do Tab Layout:** A casca `ProductKnowledgeWorkspace.tsx` deixa de usar abas (`summary`, `technical_data`, `tables`, `evidence`) e passa a renderizar o fluxo contínuo estruturado em seções (`WorkspaceSection`).

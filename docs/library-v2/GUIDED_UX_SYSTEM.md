# Sistema de Ajuda Guiada (Guided UX System)

**Status**: Produção  
**Módulo**: `src/features/guided-help/` e `src/components/guided-help/`  
**Missão**: `LIBRARY.V2.GUIDED.UX1`

---

## 1. Filosofia e Níveis de Revelação Progressiva

A interface técnica de dados industriais não deve ser simplificada através da remoção de opções. O sistema de **Guided UX** implementa uma escada pedagógica de 6 níveis, onde o usuário recebe o suporte exato para seu momento:

```
┌─────────────────────────────────────────────────────────────────┐
│ Nível 6: Tutoriais de Tarefa Guiada (Passo a Passo Interativo)  │
├─────────────────────────────────────────────────────────────────┤
│ Nível 5: Glossário Terminológico & Dicionário de Engenharia     │
├─────────────────────────────────────────────────────────────────┤
│ Nível 4: Modo Aprender (Chave Global 🎓 ON / OFF)               │
├─────────────────────────────────────────────────────────────────┤
│ Nível 3: Painel Lateral Contextual ("Entenda esta área")        │
├─────────────────────────────────────────────────────────────────┤
│ Nível 2: Destaques de Termos Técnicos Canônicos (Sublinhado)    │
├─────────────────────────────────────────────────────────────────┤
│ Nível 1: Micro-tooltips não intrusivos em campos e rótulos      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Detalhamento dos 6 Níveis

### Nível 1: Micro-tooltips (`HelpTooltip.tsx`)
- **Comportamento**: Discreto ícone ou tooltip flutuante ativado por hover e acessível via foco de teclado (`Tab`).
- **Conteúdo**: Definição em 1 a 2 linhas sem jargão hermético.
- **Uso**: Rótulos de campos, códigos de produto, indicadores de status metrológico.

### Nível 2: Termos Canônicos Interativos (`TermHelp.tsx`)
- **Comportamento**: Termos técnicos são sublinhados com tracejado suave (`border-b border-dashed border-indigo-400`).
- **Ação**: Um clique abre imediatamente o detalhe no Painel Lateral ou no Glossário.
- **Exemplos**: "Decisão Canônica", "Override", "Fato Técnico", "Proveniência".

### Nível 3: Painel Contextual Lateral (`ContextHelpDrawer.tsx` & `ContextHelpTrigger.tsx`)
- **Comportamento**: Drawer deslizante à direita acionado pelo botão flutuante ou botão "Entenda esta área".
- **Estrutura didática obrigatória**:
  1. *O que é esta tela/conceito?*
  2. *Por que ela existe na engenharia de catálogos?*
  3. *Exemplo prático de uso real.*
  4. *O que você pode fazer agora (ações sugeridas).*

### Nível 4: Modo Aprender Global (`useLearnMode.tsx` & `LearnModeToggle.tsx`)
- **Comportamento**: Botão no cabeçalho (🎓 Modo Aprender).
- **Estado OFF**: Interface enxuta, de alta densidade visual e latência mínima para operadores seniores.
- **Estado ON**:
  - Exibe badges pedagógicos ("Herdado da Família", "Exceção do Modelo").
  - Torna visíveis caixas de explicação introdutória em todas as 8 seções.
  - Habilita botões de guia rápido em tabelas e formulários.
- **Persistência**: Lembrado automaticamente via `localStorage`.

### Nível 5: Glossário de Engenharia (`GlossaryDrawer.tsx`)
- **Comportamento**: Dicionário técnico completo pesquisável com 21 conceitos canônicos cadastrados.
- **Filtros**: Por categoria (Modelo PIM, Metrologia & Dados, Governança, Catálogo Editorial).
- **Busca em tempo real**: Localiza termos pelo nome em português, chave técnica em inglês ou sinônimos comuns.

### Nível 6: Tutoriais e Tour Guiado (`PageTour.tsx` & `TaskTutorialModal.tsx`)
- **Tour da Tela (7 Passos)**: Apresenta o cabeçalho, navegação lateral, métricas, modelos, dados técnicos, evidências e retorno ao modo clássico.
- **Tutoriais Orientados a Tarefas**:
  - "Como cadastrar um novo modelo de instrumento"
  - "Como sobrescrever uma especificação técnica em um modelo específico"
  - "Como resolver um conflito entre dois manuais de engenharia"
  - "Como configurar e exportar uma tabela técnica comparativa"

---

## 3. Contrato de Tipos do Registro Canônico

Todo o conhecimento pedagógico é centralizado em `src/features/guided-help/help-registry.ts`:

```typescript
export interface HelpConcept {
  id: HelpConceptId;
  title: string;
  category: HelpCategory;
  shortDescription: string;
  detailedDescription: string;
  example: string;
  whyItMatters: string;
  technicalTerm: string;
  aliases: string[];
}
```

Isso garante que nenhum texto de ajuda seja inventado de forma ad-hoc ou inconsistente entre as diferentes telas do sistema.

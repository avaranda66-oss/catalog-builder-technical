# Handoff Arquitetural: Sistema de Ajuda Guiada (Guided UX)

**Documento**: `docs/release-readiness/GUIDED_UX_HANDOFF.md`  
**Missão**: `LIBRARY.V2.GUIDED.FINALIZE1`  
**Status**: Congelado para Produção / Handoff Técnico  
**Módulos**: `src/features/guided-help/` e `src/components/guided-help/`

---

## 1. Princípios de Arquitetura e Limites de Responsabilidade

### 1.1. HelpRegistry é Exclusivamente Editorial e Educacional
O registro de ajuda (`HELP_CONCEPTS_REGISTRY` em `src/features/guided-help/help-registry.ts`) **não é autoridade de domínio PIM**. Ele não define modelos, esquemas ou tabelas do banco de dados. Sua finalidade é estritamente pedagógica e editorial: traduzir a terminologia complexa de engenharia industrial para operadores em treinamento, técnicos júnior e equipes de publicação.

### 1.2. O Princípio da Dupla Explicação (Simple vs Technical)
Cada conceito no HelpRegistry possui duas camadas explicativas:
- **`simpleExplanation`**: Linguagem natural, livre de jargões técnicos herméticos, voltada para novos operadores (ex: o pai do usuário, equipe comercial, novos redatores).
- **`technicalExplanation`**: Definição rigorosa de engenharia e metrologia (ex: normas ISO/IEC 17025, IEC 60529, integridade relacional de domínio).

---

## 2. Componentes e Níveis de Revelação Progressiva

```
┌─────────────────────────────────────────────────────────────────┐
│ Nível 6: Tutoriais Práticos de Tarefa (TaskTutorialModal)       │
├─────────────────────────────────────────────────────────────────┤
│ Nível 5: Central de Conhecimento e Glossário (GlossaryDrawer)   │
├─────────────────────────────────────────────────────────────────┤
│ Nível 4: Tour da Tela em 7 Passos (PageTour)                    │
├─────────────────────────────────────────────────────────────────┤
│ Nível 3: Modo Aprender Global 🎓 (LearnModeToggle & Hook)       │
├─────────────────────────────────────────────────────────────────┤
│ Nível 2: Painel Contextual Lateral (ContextHelpDrawer)          │
├─────────────────────────────────────────────────────────────────┤
│ Nível 1: Termos Interativos e Micro-tooltips (TermHelp/Tooltip) │
└─────────────────────────────────────────────────────────────────┘
```

### Nível 1: Micro-tooltips & Termos Interativos (`HelpTooltip.tsx` & `TermHelp.tsx`)
- Tooltip ativado por hover e foco de teclado (`Tab`).
- Fecha automaticamente com a tecla `Escape`.
- `TermHelp` adiciona um sublinhado tracejado sutil (`border-b border-dashed border-indigo-400`) sem alterar a tipografia. Ao ser clicado, abre o detalhe no painel lateral.

### Nível 2: Painel Contextual Lateral (`ContextHelpDrawer.tsx`)
- Drawer deslizante que responde a 4 perguntas obrigatórias:
  1. *O que é esta tela/conceito?*
  2. *Por que ela existe na engenharia de catálogos?*
  3. *Exemplo prático de aplicação real.*
  4. *Ações recomendadas para o usuário neste momento.*
- Acessível via tecla `Escape` e com barreira de clique no backdrop.

### Nível 3: Modo Aprender Global (`useLearnMode.tsx` & `LearnModeToggle.tsx`)
- Chave no cabeçalho com feedback visual claro: `🎓 Modo Aprender [ON / OFF]`.
- Quando `ON`: badges coloridos de herança (*Herdado da Família*, *Exceção do Modelo*) e caixas informativas ficam visíveis.
- Quando `OFF`: a interface reduz o consumo vertical, esconde banners didáticos e oferece máxima densidade de dados para operadores especialistas.
- A preferência é memorizada de forma segura em `localStorage['pim_library_v2_learn_mode']`.

### Nível 4: Tour da Tela em 7 Passos (`PageTour.tsx`)
- Apresenta o cabeçalho, a seleção de famílias, as 8 seções, o painel de integridade, a lista de modelos, a regra de herança e o botão de escape para o Modo Clássico.
- Suporta atalhos de teclado: `ArrowRight` ou `Enter` (Próximo), `ArrowLeft` (Voltar), `Escape` (Pular tour).

### Nível 5: Glossário Pesquisável (`GlossaryDrawer.tsx`)
- Dicionário com 20 conceitos didáticos indexados.
- Busca em tempo real por título, chave técnica em inglês ou trecho da explicação.
- Filtros por categoria: Estrutura PIM, Metrologia, Governança & Fontes, Publicação.
- Alternador entre modo Didático e modo Técnico Avançado.

### Nível 6: Tutoriais Práticos Orientados a Tarefas (`TaskTutorialModal.tsx`)
- 8 tutoriais operacionais com passos sequenciais numerados e dicas de boas práticas (ex: como cadastrar modelos, como criar exceções de especificações, como auditar fontes).

---

## 3. Comportamento para Operadores Especialistas (Expert Escape)

- **Zero Intrusão no Modo Padrão**: Com o Modo Aprender desligado (`OFF`), nenhum tour é disparado automaticamente e nenhum elemento flutuante obstrui o clique.
- **Escape Imediato para o Modo Clássico**: O botão "Modo Clássico" no topo e no rodapé permite alternar para a tabela densa a qualquer momento em 1 clique, sem recarregar a página e preservando a família e modelo selecionados.

---

## 4. Conformidade de Acessibilidade (a11y)

1. **Navegação por Teclado**: Todos os elementos interativos possuem indicador de foco visível e respondem a `Enter` e `Space`.
2. **Fechamento com Escape**: Todos os drawers laterais e modais escutam o evento `keydown` global e fecham ao pressionar `Escape`.
3. **Sem Informação Crítica Apenas no Hover**: Fatos técnicos e valores reais são sempre visíveis como texto; tooltips apenas detalham explicações adicionais.
4. **Semântica ARIA**:
   - `role="dialog"` e `aria-modal="true"` nos modais e drawers.
   - `role="switch"` e `aria-checked` no botão do Modo Aprender.
   - `aria-label` descritivo em todos os botões de ícone.

---

## 5. Roteiro para o Modo Clássico Adotar o Guided UX no Futuro

O pacote Guided UX foi arquitetado para ser **100% desacoplado da Library V2**. Para que a Library Classic adote o sistema no futuro:
1. Envolver a tela da Library Classic com `<LearnModeProvider>`:
   ```tsx
   <LearnModeProvider>
     <LibraryView />
     <ContextHelpDrawer />
     <GlossaryDrawer />
   </LearnModeProvider>
   ```
2. Inserir `<TermHelp helpId="inheritance" label="Herança" />` nos cabeçalhos de coluna ou tooltips das células.
3. Posicionar o `<LearnModeToggle />` na barra de ferramentas superior da Library Classic.

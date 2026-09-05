# Library V2 — Screenshot Index & Visual Validation Matrix

> **Status**: Frozen & Auditable  
> **Data Safety Principle**: Zero fabricated evidence. All sample mock views are explicitly demarcated as `[EXEMPLO DIDÁTICO]` and mock-driven. No live Playwright was executed for freeze.

---

## 1. Overview

Este documento cataloga os 10 screenshots de validação visual gerados para a homologação da **Library V2** e do sistema **Guided UX**. Todos os screenshots capturam a renderização real dos componentes React/DOM usando dados de teste estritamente isolados (`[EXEMPLO DIDÁTICO]`).

---

## 2. Screenshot Index

| # | Arquivo | Estado Mostrado | O Que Valida | Mock / Real | Observações |
|---|---------|-----------------|--------------|-------------|-------------|
| 1 | [`01-library-v2-overview.png`](../library-v2/screenshots/01-library-v2-overview.png) | Visão Geral da Library V2 com produto selecionado e sidebar expandida | Estrutura de layout de dois painéis, cabeçalho limpo com banner educativo, barra de ferramentas didática, seções sanfona e badges de contagem. | Mock (`[EXEMPLO DIDÁTICO]`) | Valida hierarquia visual, espaçamento de 8px e ausência de ruído cognitivo. |
| 2 | [`02-learn-mode-on.png`](../library-v2/screenshots/02-learn-mode-on.png) | **Modo de Aprendizado ATIVADO** (`learnMode = true`) | Exibição de cards explicativos, botões de ação rápida de tour/glossário, e explicações conceituais simplificadas. | Mock (`[EXEMPLO DIDÁTICO]`) | Demonstra linguagem acessível para operadores novatos sem esconder os dados técnicos. |
| 3 | [`03-learn-mode-off.png`](../library-v2/screenshots/03-learn-mode-off.png) | **Modo de Aprendizado DESATIVADO** (`learnMode = false`) — Fluxo Especialista | Supressão total de cards instrutivos, banners de aprendizado e badges intrusivas. Interface limpa e densa para especialistas. | Mock (`[EXEMPLO DIDÁTICO]`) | Garante que usuários experientes trabalham sem distrações ou cliques adicionais. |
| 4 | [`04-tooltip.png`](../library-v2/screenshots/04-tooltip.png) | **Tooltip Contextual Educativo** aberto sobre badge de Herança | Tooltip estruturado com explicação rápida ("O que é?") e link para aprofundamento ou glossário técnico. | Mock (`[EXEMPLO DIDÁTICO]`) | Valida acessibilidade via foco/teclado e `role="tooltip"`, sem exigir clique. |
| 5 | [`05-context-help.png`](../library-v2/screenshots/05-context-help.png) | **Gaveta Lateral de Ajuda Contextual** (`ContextHelpDrawer`) aberta à direita | Explicação profunda e estruturada do conceito selecionado (O que é, Para que serve, Exemplo prático, Onde uso, Posso ignorar?). | Mock (`[EXEMPLO DIDÁTICO]`) | Possui fechamento via tecla `Escape`, clique no backdrop ou botão Fechar. |
| 6 | [`06-glossary.png`](../library-v2/screenshots/06-glossary.png) | **Glossário Técnico Interativo** (`GlossaryDrawer`) | Busca em tempo real, filtros por categoria (Geral, Dados Técnicos, Famílias e Herança, Fontes e Evidências, Conflitos e Divergências) e visualização em duas abas: Linguagem Simples vs Linguagem Técnica. | Mock (`[EXEMPLO DIDÁTICO]`) | Exibe terminologias canônicas (UUID, semanticKey, CAS) somente no modo Técnico/Avançado. |
| 7 | [`07-tour.png`](../library-v2/screenshots/07-tour.png) | **Tour Guiado Passo a Passo** (`PageTour`) | Diálogo modal com foco no elemento destacado, barra de progresso visual (passo X de N), navegação anterior/próximo e atalhos de teclado. | Mock (`[EXEMPLO DIDÁTICO]`) | Suporta teclas `Escape` (sair), `Enter` / `ArrowRight` (avançar) e `ArrowLeft` (voltar). Nunca dispara espontaneamente com Learn Mode desativado. |
| 8 | [`08-capability-classic-escape.png`](../library-v2/screenshots/08-capability-classic-escape.png) | **Escape Hatch para Modo Clássico** em Seções Avançadas | Card de integração honesta ("Gerenciar no Modo Clássico" / "Auditar Fontes no Modo Clássico") para capacidades com paridade parcial ou mantidas no Clássico. | Mock (`[EXEMPLO DIDÁTICO]`) | Valida ausência de botões inertes (NO-OP) e transição perfeita em 1 clique para a tela Classic correspondente. |
| 9 | [`09-advanced-real-only.png`](../library-v2/screenshots/09-advanced-real-only.png) | **Aba Avançada & Inspeção Técnica** | Tabela detalhada de propriedades técnicas com dados brutos, chaves semânticas e identificadores estritamente demarcados como amostra. | Mock (`[EXEMPLO DIDÁTICO]`) | Zero notas de confiança fictícias; zero evidências forjadas. Exibição fiel dos metadados existentes. |
| 10 | [`10-empty-state.png`](../library-v2/screenshots/10-empty-state.png) | **Estado Vazio Construtivo** (Nenhum produto ou sem dados) | Mensagem clara e amigável orientando o operador a selecionar um produto ou utilizar os filtros de busca. | Mock (`[EXEMPLO DIDÁTICO]`) | Fornece orientação educativa inicial sem apresentar tela em branco ou mensagens de erro crípticas. |

---

## 3. Conformidade e Segurança

1. **Localização dos Arquivos**: Os arquivos de imagem residem em `docs/library-v2/screenshots/` e em `<artifactDir>`.
2. **Sem Execução Live de Playwright**: Nenhuma suíte de automação externa ou headless instável foi disparada contra ambientes live para preservação do banco de produção.
3. **Auditoria Visual Concluída**: Todas as 10 telas cobrem os requisitos de usabilidade, dualidade de modos de aprendizado e conformidade de escape.

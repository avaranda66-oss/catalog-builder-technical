# Matriz de Paridade de Capacidades: Classic vs V2 Guided

**Classificação de Status Canônica**:
- `IMPLEMENTED`: Funcionalidade implementada, interativa e validada por testes na V2.
- `PARTIAL`: Interface presente na V2 com capacidades fundamentais; recursos avançados direcionam para o Modo Clássico.
- `CLASSIC-ONLY FOR NOW`: Fluxo operacional completo disponível exclusivamente no Modo Clássico; V2 oferece atalho de escape contextual.
- `PLANNED`: Recurso no roadmap de evolução da V2; sem botão simulado ou no-op.
- `MISSING`: Lacuna conhecida a ser tratada nas próximas iterações.
- `NOT APPLICABLE`: Funcionalidade restrita ao ambiente legado ou não aplicável à proposta da V2.

---

## 1. Princípio de Preservação e Roteiro Honesto

A Library V2 Guided não finge paridade completa imediata. Seu propósito é prover uma experiência altamente didática e acessível, mantendo o **Modo Clássico como autoridade operacional e escape hatch contínuo** para fluxos profundos de edição e engenharia de esquemas.

---

## 2. Matriz de Auditoria de Capacidades

| Capacidade Operacional | Como é feito no Modo Clássico | Como é tratado na Library V2 | Status na V2 |
|---|---|---|---|
| **Seleção e Troca de Família de Produtos** | Dropdown no topo da Library | Seletor com chips de famílias e contadores na Visão Geral | `IMPLEMENTED` |
| **Visualização de Modelos Físicos** | Tabela densa com rolagem horizontal | Cards visuais com dados de identificação e seleção de modelo | `IMPLEMENTED` |
| **Cadastro Rápido de Novo Modelo Físico** | Botão na toolbar que abre drawer/modal | Botão "+ Novo Modelo" conectado diretamente à store | `IMPLEMENTED` |
| **Visualização de Especificações & Fatos Técnicos** | Células inline ou drawer com inputs agrupados | Seção 2 com agrupamento em Módulos (Metrologia, Elétrica, Mecânica) | `IMPLEMENTED` |
| **Distinção Didática de Herança vs Sobrescrita** | Ícones discretos de override em tabela PIM | Badges coloridos explícitos: *"Herdado da Família"* vs *"Exceção do Modelo"* | `IMPLEMENTED` |
| **Visualização de Matriz Comparativa** | Grid tabular configurável | Seção 3 com tabela matricial entre modelos da família ativa | `PARTIAL` |
| **Criação de Novas Tabelas Customizadas** | Criação e amarração de datasets no PIM | Botão "Configurar Tabelas no Modo Clássico" com transição fluida | `CLASSIC-ONLY FOR NOW` |
| **Edição Profunda de Esquema & Novas Colunas** | Modal e drawer de gerenciamento de colunas | Botão "Gerenciar Esquema no Modo Clássico" com transição fluida | `CLASSIC-ONLY FOR NOW` |
| **Edição Inline de Células de Dados Técnicos** | Células editáveis inline com persistência | Visualização transparente; atalho para edição no Modo Clássico | `CLASSIC-ONLY FOR NOW` |
| **Upload e Associação Real de PDFs/Manuais** | Drawer de upload e armazenamento de mídia | Visualização com marcação `[EXEMPLO DIDÁTICO]`; gestão real no Modo Clássico | `CLASSIC-ONLY FOR NOW` |
| **Extração de Snippets & Proveniência Real** | Painel de evidências do extrator de documentos | Visualização com marcação `[EXEMPLO DIDÁTICO]`; auditoria real no Modo Clássico | `PLANNED` |
| **Resolução de Conflitos & Decisões Canônicas** | Aba de auditoria de dados e conflitos | Trilha visual com marcação `[EXEMPLO DIDÁTICO]`; arbitragem no Modo Clássico | `PLANNED` |
| **Reorganização Drag-and-Drop de Módulos** | Reordenação estrutural no workspace | Seção 7 com estrutura descritiva; botão "Reorganizar no Modo Clássico" | `CLASSIC-ONLY FOR NOW` |
| **Inspeção de Esquema e Chaves de Domínio** | Guia técnica de depuração | Seção 8 com chaves reais da store (`familyColumns`, `syncStatus`) | `IMPLEMENTED` |
| **Exportação JSON-LD (Schema.org)** | Não implementado no domínio | Indicador explícito `[Planejado / Em Homologação]` sem botões no-op | `PLANNED` |
| **Alternância Fluida entre Modos (Gate)** | Banner de opt-in sobre a Library Classic | Botão no cabeçalho e rodapé para retorno imediato ao Modo Clássico | `IMPLEMENTED` |
| **Sistema de Aprendizado (6 Níveis de Ajuda)** | Inexistente no modo clássico | Micro-tooltips, TermHelp, Painel Contextual, Modo Aprender, Glossário e Tour | `IMPLEMENTED` |

---

## 3. Resumo de Cobertura

- **Capacidades Totalmente Implementadas (`IMPLEMENTED`)**: 8
- **Capacidades Parciais (`PARTIAL`)**: 1
- **Capacidades Mantidas no Modo Clássico com Escape Hatch (`CLASSIC-ONLY FOR NOW`)**: 5
- **Capacidades Planejadas no Roadmap (`PLANNED`)**: 3
- **Botões Sem Ação (NO-OP)**: **ZERO (0)** — cada botão executa ação real, aciona o Modo Clássico ou exibe estado disabled explicativo.

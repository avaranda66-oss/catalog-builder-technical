# Matriz de Auditoria de Botões e Controles da Library V2

**Documento**: `docs/release-readiness/LIBRARY_V2_BUTTON_MATRIX.md`  
**Missão**: `LIBRARY.V2.GUIDED.FINALIZE1`  
**Regra Absoluta**: **ZERO botões sem ação (NO-OP / click → nothing)**.  
**Taxonomia de Estados**:
- `FUNCTIONAL`: Executa ação interativa imediata no componente/store.
- `CLASSIC ESCAPE`: Transiciona instantaneamente para o Modo Clássico com contexto preservado.
- `DISABLED + EXPLANATION`: Controle inativo com tooltip/title explicativo do motivo e próximo passo.
- `PLANNED + NON-INTERACTIVE`: Indicador visual informativo de recurso futuro sem aparência de botão clicável.

---

## Tabela de Controles e Comportamentos

| CONTROL | SCREEN | STATUS | BEHAVIOR | CLASSIC FALLBACK | TESTED |
|---|---|---|---|---|---|
| **Botão "Biblioteca" (Breadcrumb)** | Header (Todas) | `FUNCTIONAL` | Limpa seleção de produto e retorna à Visão Geral da família | N/A | Sim (`v2-sections-rendering`) |
| **Campo de Busca Rápida** | Header (Todas) | `FUNCTIONAL` | Filtra modelos em tempo real por código, modelo ou descrição | N/A | Sim (`v2-sections-rendering`) |
| **Toggle "Modo Aprender" 🎓** | Header (Todas) | `FUNCTIONAL` | Alterna modo didático global (ON/OFF) e persiste preferência | N/A | Sim (`learn-mode.test.ts`) |
| **Botão "Glossário" (Central de Conhecimento)** | Header (Todas) | `FUNCTIONAL` | Abre o Drawer com o dicionário de 20 termos e pesquisa | N/A | Sim (`glossary-search.test.ts`) |
| **Botão "Modo Clássico" (Header)** | Header (Todas) | `CLASSIC ESCAPE` | Retorna imediatamente para a Library Classic (LibraryView) | Ativa Modo Clássico | Sim (`library-experience-gate`) |
| **Itens de Navegação (8 Seções)** | Sidebar | `FUNCTIONAL` | Alterna a seção ativa da V2 (`overview` a `advanced`) | N/A | Sim (`v2-sections-rendering`) |
| **Botão "Guia Rápido da Tela"** | Sidebar Footer | `FUNCTIONAL` | Inicia o tour interativo passo a passo de 7 passos | N/A | Sim (`father-learning-workflow`) |
| **Botão "+ Novo Modelo"** | Visão Geral | `FUNCTIONAL` | Abre prompt de código e adiciona produto à store da família | N/A | Sim (`useLibraryStore.test.ts`) |
| **Botão "Modo Clássico" (Banner)** | Visão Geral | `CLASSIC ESCAPE` | Alterna para a visualização clássica em tabela | Ativa Modo Clássico | Sim (`father-learning-workflow`) |
| **Cards de Métricas (Modelos/Fatos/Fontes/Conflitos)** | Visão Geral | `FUNCTIONAL` | Navegam diretamente para a respectiva seção especializada | N/A | Sim (`v2-sections-rendering`) |
| **Chips de Seleção de Família** | Visão Geral | `FUNCTIONAL` | Comuta a família ativa na store e atualiza os modelos | N/A | Sim (`v2-sections-rendering`) |
| **Cards de Modelos Físicos** | Visão Geral | `FUNCTIONAL` | Seleciona o modelo físico ativo e destaca na tela | N/A | Sim (`v2-sections-rendering`) |
| **Botão "Abrir Dados →"** | Visão Geral | `FUNCTIONAL` | Seleciona o modelo e navega para Informações Técnicas | N/A | Sim (`v2-sections-rendering`) |
| **Botão "Chaves Técnicas"** | Informações Técnicas | `FUNCTIONAL` | Exibe/oculta identificadores de computador (`metrology.range`) | N/A | Sim (`father-learning-workflow`) |
| **Botão "Gerenciar Esquema no Modo Clássico"** | Informações Técnicas | `CLASSIC ESCAPE` | Abre Modo Clássico para edição profunda de colunas e dados | Ativa Modo Clássico | Sim (`father-learning-workflow`) |
| **Botão "Ver Fontes" (Linha de Fato)** | Informações Técnicas | `FUNCTIONAL` | Navega diretamente para a Seção 5 (Fontes & Evidências) | Ativa Seção Fontes | Sim (`father-learning-workflow`) |
| **Abas de Tabela (Matriz / Pedido / Inserts)** | Tabelas Técnicas | `FUNCTIONAL` | Alterna entre matriz de modelos e gabaritos de acessórios | N/A | Sim (`v2-sections-rendering`) |
| **Botão "Configurar Tabelas no Modo Clássico"** | Tabelas Técnicas | `CLASSIC ESCAPE` | Abre Modo Clássico para criação/edição profunda de tabelas | Ativa Modo Clássico | Sim (`father-learning-workflow`) |
| **Botão "Configurar no Modo Clássico" (EmptyState)** | Tabelas Técnicas | `CLASSIC ESCAPE` | Abre Modo Clássico a partir do estado vazio de tabela | Ativa Modo Clássico | Sim (`father-learning-workflow`) |
| **Botão "Gerenciar Documentos no Modo Clássico"** | Documentos | `CLASSIC ESCAPE` | Abre Modo Clássico para upload e indexação de PDFs reais | Ativa Modo Clássico | Sim (`v2-sections-rendering`) |
| **Botão "Abrir no Modo Clássico" (Card Doc)** | Documentos | `CLASSIC ESCAPE` | Direciona para a inspeção de arquivos na tela clássica | Ativa Modo Clássico | Sim (`v2-sections-rendering`) |
| **Botão "Auditar Fontes no Modo Clássico"** | Fontes & Evidências | `CLASSIC ESCAPE` | Abre auditoria completa de fontes documentais na Classic | Ativa Modo Clássico | Sim (`father-learning-workflow`) |
| **Botão "Ver no Modo Clássico" (Card Evidência)** | Fontes & Evidências | `CLASSIC ESCAPE` | Abre o documento no leitor clássico de mídia | Ativa Modo Clássico | Sim (`v2-sections-rendering`) |
| **Botão "Gerenciar Conflitos no Modo Clássico"** | Conflitos / Revisões | `CLASSIC ESCAPE` | Abre tela de resolução de disputas no Modo Clássico | Ativa Modo Clássico | Sim (`father-learning-workflow`) |
| **Botão "Abrir Auditoria no Modo Clássico" (EmptyState)** | Conflitos / Revisões | `CLASSIC ESCAPE` | Abre histórico formal de arbitragens no Modo Clássico | Ativa Modo Clássico | Sim (`v2-sections-rendering`) |
| **Botão "Reorganizar Módulos no Modo Clássico"** | Organização | `CLASSIC ESCAPE` | Abre workspace clássico para reordenação estrutural | Ativa Modo Clássico | Sim (`v2-sections-rendering`) |
| **Botão "Reordenar" (Linha de Módulo)** | Organização | `CLASSIC ESCAPE` | Abre Modo Clássico para reorganizar posições | Ativa Modo Clássico | Sim (`v2-sections-rendering`) |
| **Botão "Gerenciar no Modo Clássico" (Topo)** | Avançado | `CLASSIC ESCAPE` | Abre Modo Clássico para depuração de baixo nível | Ativa Modo Clássico | Sim (`father-learning-workflow`) |
| **Link "Abrir Modo Clássico" (Card Planejado)** | Avançado | `CLASSIC ESCAPE` | Direciona para ferramentas de exportação do Modo Clássico | Ativa Modo Clássico | Sim (`v2-sections-rendering`) |
| **Banner "Exportador JSON-LD & Diagnósticos"** | Avançado | `PLANNED + NON-INTERACTIVE` | Caixa informativa com badge `[Planejado / Em Homologação]` sem botões fake | N/A | Sim (`v2-sections-rendering`) |
| **Botão "Entenda esta área" (Trigger)** | Todas as Seções | `FUNCTIONAL` | Abre o ContextHelpDrawer com explicação das 4 perguntas | N/A | Sim (`father-learning-workflow`) |
| **Botões "Fechar" / "✕" (Drawers/Modais)** | Drawers / Modais | `FUNCTIONAL` | Fecha drawer ou modal e devolve o foco acessível | N/A | Sim (`father-learning-workflow`) |
| **Navegação do Tour (Voltar / Próximo / Pular)** | Page Tour | `FUNCTIONAL` | Percorre os 7 passos do tour com atalhos de teclado | N/A | Sim (`father-learning-workflow`) |

---

## Auditoria de Não-Operação (NO-OP)
- **Total de Controles Auditados**: 33
- **Controles Funcionais Interativos**: 17
- **Controles com Escape Hatch para o Modo Clássico**: 15
- **Controles Informativos Planejados (Não-Interativos)**: 1
- **Controles sem Ação (NO-OP / Click → Nothing)**: **ZERO (0)**

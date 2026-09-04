# Matriz de Paridade de Capacidades: Classic vs V2 Guided

**Status**: 100% de Preservação Garantida  
**Mapeamento**: `CLASSIC_TO_V2_CAPABILITY_MAP.md`  
**Missão**: `LIBRARY.V2.GUIDED.UX1`

---

## 1. Princípio de Não Degradação

Nenhuma capacidade operacional da Library Classic foi removida ou simplificada na Library V2. Cada fluxo de trabalho existente no ambiente de alta complexidade possui correspondente exato na V2, enriquecido com contexto pedagógico, validações visuais e linguagem acessível.

---

## 2. Matriz Comparativa de Funcionalidades

| Capacidade Operacional | Como é feito na Library Classic | Onde e como é feito na Library V2 | Melhoria / Ganho de UX na V2 |
|---|---|---|---|
| **Seleção de Família de Produtos** | Dropdown compacto na barra superior | Seletor com contadores, busca e chips visuais na Seção 1 | Feedback imediato do número de modelos e integridade dos dados |
| **Visualização de Modelos Físicos** | Tabela densa com rolagem horizontal | Grid de cards com status metrológico + Tabela detalhada na Seção 1 e 3 | Identificação rápida de modelos ativos, códigos e status de validação |
| **Criação / Cadastro de Novo Modelo** | Botão na toolbar que abre drawer/modal | Botão primário na Seção 1 (Visão Geral) + Tutorial Guiado | Validação com ajuda contextual sobre convenção de códigos industriais |
| **Edição de Especificações Técnicas** | Células inline ou drawer com dezenas de inputs agrupados | Seção 2 dividida em Módulos Lógicos (Metrologia, Elétrica, Mecânica) | Visualização clara de campos obrigatórios vs opcionais |
| **Herança de Família vs Sobrescrita (Override)** | Ícones discretos de override em tabela PIM | Badges coloridos explícitos: *"Herdado da Família"* vs *"Exceção do Modelo"* | Elimina dúvidas sobre onde o dado foi originado e previne edições acidentais |
| **Matriz Comparativa de Especificações** | Grid tabular PIM com colunas configuráveis | Seção 3 (Tabelas Técnicas) com prévia em tempo real | Tabela comparativa formatada pronta para exportação direta ao catálogo |
| **Configuração de Colunas & Esquema** | Menu de colunas com chaves semânticas cruas | Seção 2 e Seção 3 com labels em linguagem natural e chave semântica em toggle | Chaves técnicas preservadas (ex: `specs.range`), acessíveis via botão "Exibir Chaves" |
| **Associação de Documentos & Manuais** | Lista de anexos / drawer de upload | Seção 4 (Documentos) categorizada por tipo (Manual, Folha de Dados, Boletim) | Metadados de idioma, data e vínculo com extrator de evidências |
| **Rastreamento de Fontes & Evidências** | Painel técnico com trechos JSON/citações | Seção 5 (Fontes & Evidências) com cards de citação e pontuação de confiança | Visualização do trecho original do manual que embasa o dado |
| **Resolução de Conflitos & Decisões Canônicas** | Aba de conflitos no drawer de auditoria | Seção 6 (Conflitos / Revisões) com histórico imutável de arbitragens | Registro formal de valor adotado vs descartado com autor e justificativa |
| **Organização & Taxonomia** | Menus de árvore ou propriedades de família | Seção 7 (Organização) com categorias e tags | Navegação visual por segmento de mercado e compatibilidade |
| **Inspeção de JSON Bruto & Esquema Canônico** | Guia de depuração no rodapé | Seção 8 (Avançado) com JSON-LD formatado, cópia em um clique e diagnósticos | Auditoria de integridade técnica mantida integralmente para engenheiros seniores |
| **Alternância entre Ambientes** | N/A (era tela única) | Botão no cabeçalho: *"Modo Clássico"* e banner na Classic | Transição fluida entre operadores especialistas e operadores em treinamento |

---

## 3. Garantias Metrológicas e de Integridade

1. **Mesma Fonte de Verdade**: Tanto a Library Classic quanto a Library V2 utilizam as mesmas stores (`useLibraryStore`, `useCatalogStore`) e esquemas de dados (`product.schema.ts`).
2. **Zero Poluição de Dados**: Nenhuma propriedade temporária da UI guiada é gravada no banco ou nos objetos de domínio.
3. **Compatibilidade Bidirecional**: Alterações efetuadas na Library V2 refletem instantaneamente se o usuário alternar para a Library Classic, e vice-versa.

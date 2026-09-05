# Library V2 — Known Limitations & Classic Fallback Guide

> **Status**: Frozen & Auditable  
> **Transparência Absoluta**: A Library V2 Guided adota o princípio de **divulgação honesta de capacidades**. Não reivindica substituição completa do Modo Clássico nem paridade de 100%. Abaixo estão documentadas todas as limitações conhecidas classificadas como `PARTIAL`, `CLASSIC-ONLY FOR NOW` ou `PLANNED`, com impacto ao usuário e atalho de resolução no Clássico.

---

## 1. Resumo Executivo das Limitações

A Library V2 foi arquitetada como uma experiência de **aprendizado guiado, navegação didática e consulta estruturada**. Ela não substitui o Modo Clássico como ambiente de autoria profunda de esquemas e engenharia de dados.

| Status de Capacidade | Quantidade | Postura da V2 |
|---|---|---|
| `PARTIAL` | 1 | Exibe visualização matricial básica; parametrizações profundas ocorrem no Clássico. |
| `CLASSIC-ONLY FOR NOW` | 5 | Atalho contextual em 1 clique direciona para a tela exata no Modo Clássico. |
| `PLANNED` | 3 | Indicadores informativos ou cards de roadmap sem botões simulados ou inertes. |

---

## 2. Tabela Detalhada de Limitações Conhecidas

### 2.1. Visualização de Matriz Comparativa
- **Status**: `PARTIAL`
- **USER IMPACT**: O operador visualiza a matriz comparativa entre modelos da mesma família (valores e atributos), mas não possui filtros dinâmicos de comparação cruzada multi-família ou exportação tabular direta nesta seção.
- **CLASSIC WORKAROUND**: Clicar em "Modo Clássico" no cabeçalho ou alternar para a visualização clássica em grade/tabela, onde filtros avançados e ordenações complexas estão disponíveis.
- **BLOCKS V2 DEFAULT?**: **NO**. A visualização comparativa na V2 atende integralmente ao fluxo de inspeção rápida e entendimento das diferenças entre modelos.

---

### 2.2. Criação de Novas Tabelas Customizadas
- **Status**: `CLASSIC-ONLY FOR NOW`
- **USER IMPACT**: O usuário não pode criar novos datasets ou entidades tabulares desacopladas diretamente na interface da V2.
- **CLASSIC WORKAROUND**: Clicar no botão **"Configurar Tabelas no Modo Clássico"** presente no card da Seção 3 (Tabelas de Especificação). A V2 comuta instantaneamente para o gerenciador de tabelas da interface clássica.
- **BLOCKS V2 DEFAULT?**: **YES** (para substituição total da Library como default). A V2 deve permanecer como opção guiada (`?library=v2` ou opt-in de sessão) até que a autoria completa de tabelas seja integrada ao fluxo guiado.

---

### 2.3. Edição Profunda de Esquema & Novas Colunas
- **Status**: `CLASSIC-ONLY FOR NOW`
- **USER IMPACT**: Adicionar colunas customizadas, alterar tipos semânticos (`familyColumns`), configurar regras de validação e redefinir esquemas de catálogo não é permitido na V2 para evitar corrupção de schema por operadores novatos.
- **CLASSIC WORKAROUND**: Clicar no botão **"Gerenciar Esquema no Modo Clássico"** na barra de ferramentas ou na Seção 8 (Esquema Técnico).
- **BLOCKS V2 DEFAULT?**: **YES** (para usuários administradores e engenheiros de dados). A V2 não deve ser o padrão para perfis de engenharia de catálogo até a maturação da autoria guiada.

---

### 2.4. Edição Inline de Células de Dados Técnicos
- **Status**: `CLASSIC-ONLY FOR NOW`
- **USER IMPACT**: A edição de valores de atributos técnicos na V2 é orientada à visualização e compreensão de herança/sobrescrita, sem suporte a edição de célula estilo planilha rápida com atalhos de teclado (tab/enter contínuo).
- **CLASSIC WORKAROUND**: Clicar no atalho de escape para o Modo Clássico, que provê o grid de planilha denso otimizado para preenchimento em lote.
- **BLOCKS V2 DEFAULT?**: **YES** (para tarefas de data entry massivo). Usuários em campanha de digitação acelerada devem usar o Modo Clássico.

---

### 2.5. Upload e Associação Real de PDFs / Manuais
- **Status**: `CLASSIC-ONLY FOR NOW`
- **USER IMPACT**: Na Seção 5 (Fontes e Documentação), a lista de documentos demonstra a vinculação didática com a etiqueta explícita `[EXEMPLO DIDÁTICO]`. O upload de novos arquivos binários/PDFs com pipeline de parsing real não reside no escopo desta branch.
- **CLASSIC WORKAROUND**: Utilizar o gerenciador de anexos e PDFs do Modo Clássico, clicando em **"Auditar Fontes no Modo Clássico"**.
- **BLOCKS V2 DEFAULT?**: **NO** (para operadores e consumidores de catálogo); **YES** (para administradores que precisam subir novos manuais).

---

### 2.6. Extração de Snippets & Proveniência Real
- **Status**: `PLANNED`
- **USER IMPACT**: A trilha de evidências (trechos de PDFs com bounding boxes e números de página) é renderizada de forma estritamente conceitual e educacional (`[EXEMPLO DIDÁTICO]`).
- **CLASSIC WORKAROUND**: Consultar a auditoria de extração do extrator de documentos na aba de auditoria clássica.
- **BLOCKS V2 DEFAULT?**: **NO** (recurso avançado de PIM com IA em desenvolvimento pelo Agente 1).

---

### 2.7. Resolução de Conflitos & Decisões Canônicas
- **Status**: `PLANNED`
- **USER IMPACT**: A Seção 6 apresenta como divergências entre fontes técnicas e manuais devem ser tratadas de forma didática com exemplos (`[EXEMPLO DIDÁTICO]`). O mecanismo de arbitragem canônica e escrita em banco de dados Supabase não foi conectado para evitar conflitos de concorrência com o domínio do Agente 1.
- **CLASSIC WORKAROUND**: Resolver divergências utilizando a ferramenta clássica de conciliação de fontes.
- **BLOCKS V2 DEFAULT?**: **NO** (operações de reconciliação são esporádicas e reservadas a super-usuários).

---

### 2.8. Reorganização Drag-and-Drop de Módulos
- **Status**: `CLASSIC-ONLY FOR NOW`
- **USER IMPACT**: A ordem das seções e módulos na visualização do produto na V2 é fixa e otimizada pedagogicamente. Reorganizar a hierarquia de blocos via arrastar e soltar não está disponível na V2.
- **CLASSIC WORKAROUND**: Clicar em **"Reorganizar no Modo Clássico"** na Seção 7 (Estrutura de Apresentação).
- **BLOCKS V2 DEFAULT?**: **NO**. A ordenação padrão atende a 95% das necessidades de inspeção.

---

### 2.9. Exportação JSON-LD (Schema.org)
- **Status**: `PLANNED`
- **USER IMPACT**: O badge `[Planejado / Em Homologação]` informa a disponibilidade futura da exportação padronizada para SEO técnico sem oferecer botões inoperantes.
- **CLASSIC WORKAROUND**: Exportações de dados no formato JSON ou CSV podem ser efetuadas via utilitários do sistema ou scripts de backend.
- **BLOCKS V2 DEFAULT?**: **NO**.

---

## 3. Critério de Gate: A Library V2 pode ser o Default Geral Hoje?

**Resposta Oficial**: **NÃO (NOT YET)**.

A Library V2 está pronta, congelada e auditável para atuar como:
1. **Ambiente Guiado de Onboarding e Treinamento** (`Learn Mode ON`).
2. **Ambiente Executivo / Leitura Limpa** para operadores que precisam consultar dados sem risco de quebrar esquemas (`Learn Mode OFF`).
3. **Alternativa em Paralelo** acessível via parâmetro de URL `?library=v2` ou toggle de sessão.

Ela **não deve** substituir o Modo Clássico como padrão silencioso imediato porque operadores de engenharia necessitam de:
- Autoria de esquemas e novas colunas;
- Preenchimento em lote de células (data entry intensivo);
- Gestão de storage de arquivos e extração PIM avançada.

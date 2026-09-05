# Library V2 Guided — Especificação de UX e Arquitetura

**Status**: Pronto para Produção  
**Versão**: 2.0.0-guided  
**Missão**: `LIBRARY.V2.GUIDED.UX1`  
**Princípio Central**: *"Não simplificar removendo capacidade. Simplificar ensinando, organizando e revelando a complexidade progressivamente."*

---

## 1. Visão Geral e Filosofia

O Catálogo Builder possui uma camada profunda de governança de dados metrológicos e industriais baseada no modelo canônico PIM (Product Information Management). No entanto, o nível de abstração técnico exigido por interfaces de dados densas costuma intimidar novos usuários, operadores de marketing e engenheiros júnior.

A **Library V2 Guided** nasce com a premissa fundamental de **nunca subtrair poder de fogo técnico**. Em vez de ocultar recursos avançados ou truncar tabelas técnicas, a V2 reorganiza a interface em 8 seções conceituais claras e introduz um ecossistema de aprendizado contextual contínuo (Modo Aprender, Dicionário Interativo, Micro-ajuda e Tutoriais passo a passo).

---

## 2. Arquitetura de Coexistência (Dual-Experience Gate)

Para garantir continuidade operacional absoluta e risco zero de quebra, a Library V2 funciona em modo paralelo à Library Classic através do componente `LibraryExperienceGate`:

```
                    ┌───────────────────────────────┐
                    │     App.tsx (Aba Library)     │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │     LibraryExperienceGate     │
                    └───────┬───────────────┬───────┘
                            │               │
        [Padrão / Pro]      │               │   [Opt-in / Guided]
     (localStorage="classic")│               │ (localStorage="v2" ou ?library=v2)
                            ▼               ▼
                 ┌─────────────────┐ ┌──────────────────┐
                 │  Library Classic│ │Library V2 Guided │
                 │  (LibraryView)  │ │(LibraryV2Container)
                 └─────────────────┘ └──────────────────┘
```

### Regras do Gate:
1. **Default Seguro**: O usuário padrão sempre abre a **Library Classic**.
2. **Opt-in Explícito**: O banner superior ou a URL `?library=v2` ativa a experiência guiada.
3. **Sem persistência invasiva de experiência**: Toda nova abertura inicia na Library Classic por padrão. O toggle é em memória (session-local) ou explícito via URL `?library=v2`. Nenhum localStorage de seleção Classic/V2 é utilizado durante a homologação.
4. **Retorno Imediato**: Um clique em "Modo Clássico" no topo da V2 devolve o usuário instantaneamente à Classic sem perda de contexto ou seleção.

---

## 3. As 8 Seções Funcionais da Library V2

A navegação lateral divide o universo da biblioteca em 8 domínios de trabalho:

### Seção 1: Visão Geral (`overview`)
- **Objetivo**: Panorama completo da família de produtos selecionada.
- **Recursos**:
  - Contadores de integridade (modelos ativos, fatos técnicos, tabelas, documentos e conflitos).
  - Cards visuais de modelos físicos cadastrados com status metrológico.
  - Ações rápidas: Cadastrar novo modelo, abrir matriz comparativa, exportar ficha técnica.
  - Acesso direto ao assistente de tour interativo.

### Seção 2: Informações Técnicas (`technical-data`)
- **Objetivo**: Gestão de especificações técnicas, módulos metrológicos e regras de herança.
- **Recursos**:
  - Agrupamento em módulos lógicos (Metrologia, Elétrica, Mecânica, Certificações).
  - Distinção visual clara entre **Valores Herdados** (definidos na Família) e **Sobrescritas Específicas** (definidas no Modelo Físico).
  - Indicador de proveniência por campo com atalho direto para o drawer de evidências.

### Seção 3: Tabelas Técnicas (`technical-tables`)
- **Objetivo**: Configuração e visualização de matrizes comparativas entre modelos da família.
- **Recursos**:
  - Tabela comparativa matricial gerada a partir das especificações.
  - Seletor de colunas visíveis e ordenação dinâmica.
  - Exportação direta para bloco do catálogo editorial ou planilha CSV.

### Seção 4: Documentos (`documents`)
- **Objetivo**: Biblioteca de arquivos técnicos de apoio (manuais de instrução, boletins de engenharia, folhas de dados e catálogos legados).
- **Recursos**:
  - Lista de documentos associados à família com metadados de versão e idioma.
  - Classificação por tipo e relevância documental.
  - Integração com extrator de evidências.

### Seção 5: Fontes & Evidências (`sources`)
- **Objetivo**: Rastreabilidade e cadeia de custódia dos dados (Source of Truth).
- **Recursos**:
  - Relação de fontes primárias auditadas pela engenharia.
  - Trechos citados (snippets) com indicação de página, data e nível de confiança.
  - Visualização de proveniência de cada fato técnico.

### Seção 6: Conflitos / Revisões (`conflicts`)
- **Objetivo**: Auditoria de divergências e registro de Decisões Canônicas.
- **Recursos**:
  - Lista de campos com dados conflitantes entre documentos.
  - Histórico imutável de Decisões Canônicas tomadas pela engenharia (valor adotado vs. valor descartado com justificativa técnica e autor).

### Seção 7: Organização (`organization`)
- **Objetivo**: Estruturação taxonômica da família de produtos.
- **Recursos**:
  - Hierarquia de categorias, tags de aplicação e segmentos de mercado.
  - Gestão de compatibilidade e acessórios vinculados.

### Seção 8: Avançado (`advanced`)
- **Objetivo**: Ferramentas de alta precisão para engenheiros seniores e desenvolvedores.
- **Recursos**:
  - Visualizador de esquema canônico e payload JSON-LD.
  - Diagnóstico de integridade relacional e chaves órfãs.
  - Log de auditoria e exportação de dados brutos.

---

## 4. Design System e Identidade Visual

- **Paleta de Cores**:
  - Primária: Slate / Indigo neutro profissional (`slate-900`, `indigo-600`, `indigo-50`).
  - Destaques de Aprendizado: Ambar / Dourado (`amber-500`, `amber-100`) para o Modo Aprender.
  - Sucesso Metrológico: Emerald (`emerald-600`, `emerald-50`).
  - Alertas de Conflito: Rose (`rose-600`, `rose-50`).
- **Tipografia**: Sans-serif limpa e moderna com monoespaçada para códigos de engenharia, modelos e tags de dados.
- **Micro-interações**: Transições suaves, animações de entrada (`fade-in`, `slide-in-right`) e tooltips com latência zero ao foco/hover.

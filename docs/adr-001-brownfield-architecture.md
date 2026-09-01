# ADR-001: Arquitetura Brownfield para Recuperação, Segurança e Liberação do Catalog Builder

- **Status:** Proposta para Aprovação Humana
- **Data:** 2026-09-01
- **Decisores:** @architect (Aria), @po (Morgan), Administrador do Projeto
- **Contexto Técnico:** Clone canônico `C:\Users\Usuario\Desktop\CONFIGURATOR PCON\catalog-builder` (`main` @ `0044411`)
- **Documentos de Referência:** 
  - `docs/brownfield-architecture.md`
  - `docs/prd-release-recovery.md`
  - `C:\Users\Usuario\Desktop\CONFIGURATOR PCON\meu-projeto\AUDITORIA_COMPLETA_SESSAO.md`
  - `.aiox-core/constitution.md`

---

## 1. Contexto e Problema

O **Catalog Builder** é uma aplicação voltada para a criação e manutenção de catálogos técnicos industriais em PDF, integrada a uma Biblioteca de produtos que funciona como fonte da verdade. O usuário principal é o Administrador (pai do solicitante), habituado à usabilidade simples e direta do Google Sheets, e a equipe de funcionários atuará como Colaboradores com permissões limitadas.

A auditoria brownfield revelou um abismo entre a arquitetura corporativa planejada nas migrations (`supabase/migrations/00001` a `00004`) e o código efetivamente executado no frontend (`src/`):
1. **Ausência de Autenticação/Autorização Efetiva**: O frontend é uma SPA Vite/React que opera em modo anônimo permanente; `isAdmin: true` é uma flag local de interface no store do Zustand, sem validação no servidor.
2. **Escrita Direta e Insegura no Supabase**: `src/services/supabase.service.ts` executa mutações diretas (`upsert`, `delete`) em tabelas públicas via chave anônima, sem controle transacional, gerando concorrência destrutiva ("last-writer-wins").
3. **Exposição de Credencial de IA no Cliente**: A chave de API do Gemini foi hardcoded no código fonte do frontend (`src/services/ai.service.ts:22-23`), exigindo revogação e isolamento em backend.
4. **Vazamento de Testes para Produção**: `tests/services/supabase.service.test.ts` e rotinas de teste executavam chamadas reais de rede contra o Supabase de produção, alterando registros reais.
5. **Exportação de PDF com Limitações**: A exportação atual rasteriza o DOM em imagens PNG via `html2canvas` e as insere no `jsPDF`, o que não garante saída 100% vetorial com texto selecionável e expõe sutilezas de alinhamento vertical.

Esta ADR define as decisões arquiteturais pragmáticas para recuperar o ambiente, proteger os dados de produção, isolar os testes e viabilizar a liberação segura do MVP.

---

## 2. Decisões Arquiteturais por Área

### 2.1. Autenticação e Papéis (Admin vs. Colaborador)

- **Decisão:** Adotar **Supabase Auth nativo (Email + Senha / Magic Link)** acoplado à tabela `user_profiles` e claims de autorização no backend.
- **Alternativas Rejeitadas:**
  - *Auth0 / Clerk externo*: Adiciona complexidade, custo e exige sincronização de tokens com o RLS do PostgreSQL.
  - *Flags locais no frontend*: Inseguras, violam os requisitos fundamentais de integridade e segurança (NFR-01, Gate G4).
- **Especificação Técnica:**
  - Tabela `user_profiles (id UUID references auth.users PRIMARY KEY, role TEXT NOT NULL CHECK (role IN ('admin', 'collaborator')), full_name TEXT, created_at TIMESTAMPTZ)`.
  - Função helper no PostgreSQL: `auth.user_role() RETURNS TEXT` consultando a sessão JWT autenticada.
  - No cliente React: `useAuthStore` com estado de sessão (`user`, `role`, `isAuthenticated`), tela de Login minimalista e Route Guards no carregamento da SPA.

---

### 2.2. Escrita Segura no Supabase (Eliminação de Escrita Anônima Direta)

- **Decisão:** Substituir chamadas `.from('table').upsert()` diretas no frontend por **RPCs Transacionais (PostgreSQL Functions) com validação de Role e Compare-And-Swap (CAS)**, protegidas por **Row Level Security (RLS) estrita**.
- **Alternativas Rejeitadas:**
  - *RLS direta por tabela simples sem RPC*: Não garante atomicidade na persistência de documentos compostos (catálogo + folhas + blocos) e não trata concorrência de versões.
  - *Servidor backend intermediário (Node.js/Express)*: Desnecessário para a escala atual, pois o PostgreSQL/Supabase com RPCs e RLS fornece segurança completa sem infraestrutura extra.
- **Especificação Técnica:**
  - RPC `save_official_product(p_product JSONB, p_expected_version INT)`: Apenas `admin` pode executar. Valida se a versão bate (CAS). Incrementa `version` e grava histórico de auditoria.
  - RPC `save_catalog_draft(p_catalog JSONB, p_expected_version INT)`: Executável pelo autor ou `admin`. Valida versionamento para impedir sobrescrita silenciosa.
  - RPC `publish_catalog_snapshot(p_catalog_id UUID)`: Apenas `admin` pode executar. Cria registro imutável em `publication_snapshots`.
  - Políticas de RLS: Todas as tabelas têm `DEFAULT DENY` para escritas diretas pela chave anônima.

---

### 2.3. Versionamento da Biblioteca, Catálogo, Overrides e Publicação

- **Decisão:** Implementar o **Modelo Híbrido de Referência Versionada + Local Overrides Estruturados + Snapshots Imutáveis de Publicação**.
- **Alternativas Rejeitadas:**
  - *Cópia Estática Desconectada*: Perde a rastreabilidade da fonte oficial e impossibilita alertas de divergência.
  - *Vínculo Dinâmico Puro sem Snapshot*: Alterações na Biblioteca quebram silenciosamente catálogos antigos já publicados.
- **Especificação Técnica:**
  1. **Produto Oficial (`products`)**: Possui `id` (UUID), `sku`, `name`, `version` (INT incremental), `verification_status` ('verified' | 'draft' | 'deprecated'), `specifications` (JSONB com proveniência por campo).
  2. **Vínculo no Catálogo (`CatalogTableRow`)**: Armazena `productRefId` (UUID) e `snapshotVersion` (INT).
  3. **Overrides Locais (`localOverrides`)**: Objeto estruturado por campo:
     ```typescript
     {
       [fieldKey: string]: {
         value: string | number | boolean;
         originalValue: string | number | boolean;
         sourceVersion: number;
         isDivergent: boolean;
         reason?: string;
         updatedAt: string;
         authorId: string;
       }
     }
     ```
  4. **Motor de Divergência (`divergence.ts`)**: Se `currentProduct.version > row.snapshotVersion`, a UI exibe badge discreto de divergência com opção explícita: *"Manter Override"* ou *"Atualizar para a Versão Oficial Atual"*.
  5. **Snapshot de Publicação (`publication_snapshots`)**: Tabela imutável que armazena o JSON completo do catálogo no momento exato em que o Administrador publicou.

---

### 2.4. Gestão de Mídia Real e Verificada

- **Decisão:** Criar **Bucket Controlado no Supabase Storage** associado à tabela `media_library`, com distinção obrigatória entre **Mídia Oficial Verificada** e **Mídia de Demonstração**.
- **Alternativas Rejeitadas:**
  - *Bucket público irrestrito sem tabela*: Permite uploads anônimos e exclusões acidentais.
  - *URLs assinadas efêmeras para tudo*: Adiciona latência e falhas de renderização no carregamento de PDF.
- **Especificação Técnica:**
  - Bucket `product-media` configurado com leitura pública para imagens aprovadas, mas upload restrito a usuários autenticados via RLS.
  - Tabela `media_library (id UUID, url TEXT, file_name TEXT, mime_type TEXT, is_verified BOOLEAN DEFAULT false, product_id UUID, uploaded_by UUID, created_at TIMESTAMPTZ)`.
  - Apenas o Administrador pode marcar uma mídia como `is_verified: true`.
  - Fotos genéricas ou de demonstração (ex.: Unsplash) recebem `is_verified: false` e badge de aviso no painel, impedindo publicação acidental como item oficial.

---

### 2.5. Isolamento Completo de Testes (Prevenção de Writes em Produção)

- **Decisão:** **Blindagem em Camadas no Ambiente de Teste (Mocking Estrito no Vitest + Proibição de Rede)**.
- **Alternativas Rejeitadas:**
  - *Testes com condicionais `if (process.env.SUPABASE_URL)`*: Falho, pois se a variável estiver no `.env`, o teste dispara mutações reais.
- **Especificação Técnica:**
  - No `vitest.config.ts` e `tests/setup.ts`: O cliente Supabase (`supabaseClient`) é 100% mockado via Vitest. Qualquer chamada que tente acessar a rede real durante a execução de testes unitários ou de componentes é interceptada e abortada com erro fatal (`Error: Live network call prohibited in unit test suite`).
  - Arquivo `tests/fixtures/` contendo dados estáticos em memória para produtos, catálogos e mídias.
  - Testes de integração de banco de dados (quando executados) rodam exclusivamente contra banco local (Supabase CLI / Docker) ou banco descartável de staging, nunca com a URL de produção.

---

### 2.6. Isolamento e Retirada da Chave Gemini do Cliente

- **Decisão:** **Remoção Imediata da Chave do Frontend + Execução de IA via Supabase Edge Function no Backend**.
- **Alternativas Rejeitadas:**
  - *Manter chave no frontend via `VITE_GEMINI_API_KEY`*: Inaceitável, pois qualquer variável `VITE_*` é compilada no bundle JavaScript público.
- **Especificação Técnica:**
  - **Fase 1 (P0 Imediato)**: Remover a chave e todas as chamadas diretas externas do `src/services/ai.service.ts`. O assistente no cliente operará exclusivamente no modo determinístico em memória (busca local, checagem de divergências, validação de regras).
  - **Fase 2 (P2)**: Criar a Supabase Edge Function `supabase/functions/ai-assistant/index.ts`. O frontend envia `POST /functions/v1/ai-assistant` com o JWT da sessão. A chave fica protegida no vault de segredos do Supabase. A IA retorna apenas propostas estruturadas (`{ diff, rationale, sources }`) para revisão humana, sem capacidade de escrita autônoma no banco.

---

### 2.7. Estratégia de PDF com Alta Qualidade Gráfica de Impressão

- **Decisão:** **Estratégia Dual com Primazia de Saída Vetorial Nativa A4 (`@media print`) e Renderizador Direto Ultra-HD (350+ DPI Lossless)**.
- **Alternativas Rejeitadas:**
  - *Apenas html2canvas rasterizado padrão*: Gera textos borrados e linhas com ruído de compressão JPEG.
  - *Reescrita total com `@react-pdf/renderer`*: Incompatível com o layout Tailwind/DOM atual e inviabilizaria o reaproveitamento dos blocos de edição.
- **Especificação Técnica:**
  1. **Motor Primário (PDF Vetorial Nativo A4)**: Regras de `@media print` no `index.css` fixadas em `210mm × 297mm`, `margin: 0`, `-webkit-print-color-adjust: exact`. Produz saída **100% vetorial com texto pesquisável, nítido em qualquer nível de zoom**, preservando a resolução nativa das imagens e ocultando ferramentas de edição via `.no-print`.
  2. **Motor Secundário (Download Direto .PDF)**: `PDFService.exportToPDF` operando em escala `3.5x` com formato `image/png` sem perdas, eliminando artefatos de compressão.
  3. **Garantia de Centralização Tipográfica**: Elementos de linha única (furos de insertos, selos metrológicos, badges de banner) usam `line-height: ${height}px` e `box-sizing: border-box`, garantindo centralização geométrica perfeita sem baseline drop.
  4. **Conjunto de 5 Fixtures de Teste Visual**:
     - *Fixture 1*: Capa Editorial Full-Bleed 100% A4 com imagem de fundo e selos.
     - *Fixture 2*: Ficha Técnica com Hero Banner, Tabela de Especificações e Rodapé.
     - *Fixture 3*: Matriz Comparativa de Modelos e Acessórios.
     - *Fixture 4*: Diagrama Visual de Insertos com Furos e Calibração.
     - *Fixture 5*: Tabela Longa Multipágina com Repetição de Cabeçalho.

---

## 3. Decisões que Exigem Confirmação do Usuário

As seguintes definições de produto precisam de confirmação humana do Administrador:

1. **Visibilidade entre Colaboradores**: Colaboradores podem visualizar os rascunhos criados por outros colegas de equipe, ou cada colaborador deve ter acesso estritamente aos seus próprios rascunhos? *(Recomendação padrão: visualizar todos em modo somente-leitura; editar apenas os próprios).*
2. **Exportação de Rascunhos**: Colaboradores podem exportar o PDF de seus rascunhos com marca d'água `"RASCUNHO - USO INTERNO"`, ou a exportação de PDF é reservada exclusivamente ao Administrador? *(Recomendação padrão: permitir com marca d'água de rascunho).*
3. **Fila de Fotos e Mídias**: Colaboradores podem enviar fotos para uma fila de aprovação da Biblioteca (ficando pendente até o Admin aprovar), ou somente o Administrador pode fazer upload? *(Recomendação padrão: permitir upload com status `pendente_aprovacao`).*
4. **Tratamento dos Dados de Demonstração Existentes**: Os produtos de exemplo (`initialProducts.ts`) e fotos Unsplash devem ser removidos da produção ou mantidos isolados sob a etiqueta `"DEMO / EXEMPLO"`? *(Recomendação padrão: marcar explicitamente como DEMO).*
5. **Procedimento Operacional de Rotação da Chave Gemini**: Confirmação de que a chave exposta foi revogada no console do Google Cloud / AI Studio.

---

## 4. Plano de Transição e Próximos Passos (Workflow AIOX)

A implementação desta ADR será dividida em entregas estritas conforme o framework AIOX:

```
[ADR-001 Aprovada]
       │
       ▼
[A. Validação PO (Morgan) do PRD + ADR]
       │
       ▼
[B. Criação de Épico e Stories pelo Scrum Master (Dex/Morgan)]
       │
       ▼
[C. Execução Sequencial Priorizada]:
    ├─ P0.1: Isolamento de Testes (Mock Vitest + Proibição de Rede)
    ├─ P0.2: Remoção Segura do Segredo de IA do Cliente
    ├─ P0.3: Supabase Auth + user_profiles (Admin / Colaborador)
    ├─ P0.4: RPCs Transacionais + RLS no Banco + Adaptação do Frontend
    ├─ P1.1: Gestão de Mídia Verificada vs Demo
    ├─ P1.2: Motor de Divergências e Overrides Locais
    ├─ P1.3: Fixtures de QA Visual do PDF
    └─ P1.4: Piloto Assistido com o Pai
```

---

## 5. Pedido de Aprovação

Esta decisão arquitetural sintetiza o diagnóstico do código real e as necessidades de negócio do projeto.

**Solicitação ao Usuário:**  
Por favor, revise esta ADR e as decisões pendentes da Seção 3. Caso esteja de acordo com a abordagem proposta, responda com **`APROVADO`** para avançarmos à fase de validação pelo Product Owner e escrita de stories pelo Scrum Master.

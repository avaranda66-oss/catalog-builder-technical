# ADR: Persistência do Mega Product Workspace Layout (PIM.MEGA.WORKSPACE)

- **Status:** Proposto / Em Avaliação Técnica
- **Data:** 2026-09-04
- **Autor:** Architecture & Product Design Pair
- **Contexto:** Framework Synkra AIOS / PIM Core V2 / Mega Product Workspace Foundation

---

## 1. Contexto & Desafio

Com a evolução do PIM para o **Mega Product Workspace**, o sistema introduz a separação estrita entre:
1. **Data Truth (Verdade dos Dados Técnicos):** Mantida de forma canônica, tipada e imutável pelo `ProductWorkbookV2` (composto por `TechnicalDatum`, `TechnicalDataset`, `SourceDocument`, `Evidence` e herança via `ResolvedProductKnowledge`);
2. **Human Presentation (Apresentação Humana):** Projeção flexível, organizada e editável pelo usuário leigo (`WorkspaceLayoutV1`), contendo seções colapsáveis, blocos de fatos (`fact_grid`), tabelas agrupadas (`technical_table`, `dataset_view`), anotações contextuais (`text_note`) e referências documentais (`source_group`).

### Invariantes Obrigatórios
- **Zero Copy of Truth:** O layout nunca armazena cópias dos valores técnicos como autoridade. Armazena apenas referências pontuais (`datumId`, `datasetId`).
- **Remove != Delete Datum:** Remover um dado ou bloco do layout visual remove apenas a sua exibição; o dado técnico subjacente permanece 100% íntegro no banco de dados e no workbook.
- **Transacionalidade e CAS:** O salvamento de alterações de layout não pode gerar inconsistência com o controle de concorrência otimista (CAS) do workbook de produto.
- **Zero Mutação Live Nesta Fase:** Esta decisão arquitetural não executa nenhuma DDL/DML em produção.

---

## 2. Opções Avaliadas

### Opção A: Persistir Layout no Próprio `ProductWorkbookV2`
Incorporar um campo opcional `workspaceLayout?: WorkspaceLayoutV1` dentro do payload JSONB canônico do `ProductWorkbookV2`.

- **Vantagens:**
  - **Zero DDL:** Não exige nenhuma nova migration de banco nem criação de tabelas. O payload JSONB de `product_workbooks.data` já acomoda o campo com validação Zod.
  - **Atomicidade Transacional Nativa:** O layout viaja no mesmo snapshot que os dados. A RPC `save_product_workbook_v2` com CAS (`expected_revision`) protege simultaneamente os dados e a estrutura de apresentação.
  - **Zero Órfãos:** Se um workbook for excluído ou revertido, o layout o acompanha perfeitamente.
  - **Exportação e Backup Triviais:** Um único backup do workbook contém tudo o que é necessário para reproduzir a tela fielmente offline.
- **Desvantagens:**
  - Se o usuário editar apenas um label humano de seção ou a ordem de um bloco, o contador de revisão técnica do workbook (`revision`) será incrementado no CAS.
  - Em ambientes com alto volume de concorrência entre engenharia (mudando specs) e marketing/catálogo (reorganizando layout), pode haver conflitos de CAS se não houver reconciliação client-side.

---

### Opção B: Entidade e Tabela Separada (`product_workspace_layouts`)
Criar uma tabela relacional independente no PostgreSQL (`product_workspace_layouts` com `id`, `product_id`, `schema_version`, `layout_json`, `revision`, `updated_at`).

- **Vantagens:**
  - Desacoplamento absoluto do ciclo de vida: salvar o layout nunca incrementa a revisão técnica dos dados do produto.
  - Controle de acesso fino: engenheiros podem ter permissão de escrita em specs, enquanto designers/técnicos podem ter permissão apenas na tabela de layout.
- **Desvantagens:**
  - **Exige DDL e Migrations:** Necessitaria de nova migration no Supabase, políticas de RLS, triggers de auditoria e índices.
  - **Quebra de Atomicidade:** Se o workbook for revertido ou restaurado, o layout pode ficar com referências órfãs apontando para `datumId` que deixaram de existir.
  - **Complexidade de Cache:** Exigiria duas requisições de rede ou join complexo para renderizar uma única tela de produto.

---

### Opção C: Extensão do `ProductDataView` (Saved Views)
Reaproveitar o array `savedViews?: readonly ProductDataView[]` existente no `ProductWorkbookV2`, criando um `viewKind: 'mega_workspace'` e estendendo `presentationHint`.

- **Vantagens:**
  - Aproveita a estrutura já existente no schema de workbook.
  - Permite que o produto tenha múltiplos "layouts" (ex: "Visão Ficha Técnica", "Visão Comercial", "Visão Laboratório").
- **Desvantagens:**
  - `ProductDataView` foi concebido para filtros simples e matrizes de exportação (`datumKeys: string[]`), não para hierarquias ricas de seções, blocos, custom tables e anotações.
  - Tentar "forçar" uma árvore complexa de layout dentro de uma Saved View criaria distorção conceitual e overhead de adaptação (impedance mismatch).

---

### Opção D: Reutilização do Motor de Layout do Catálogo (`CanvasLayoutEngine` / Document Blocks)
Utilizar a estrutura de blocos e colunas de publicação editorial do `meu-projeto/catalog-builder`.

- **Vantagens:**
  - Reutilização conceitual da ideia de "páginas" e "blocos".
- **Desvantagens:**
  - **Forte Acoplamento Indesejado:** O motor de catálogo é voltado para diagramação gráfica de páginas A4 impressas (bounding boxes, overflow guards, margens de sangria, mm e pontos de impressão).
  - Traz complexidade de paginação física desnecessária e prejudicial para uma interface web de gestão de conhecimento industrial.
  - Rejeitado sumariamente por violar a separação entre Gestão de Conhecimento e Publicação Gráfica.

---

## 3. Matriz Comparativa de Decisão

| Critério | Opção A (No Workbook) | Opção B (Tabela Separada) | Opção C (Saved View) | Opção D (Catálogo) |
| :--- | :---: | :---: | :---: | :---: |
| **Segurança e Zero DDL** | **Excelente (Zero DDL)** | Ruim (Exige Migration) | Boa | Ruim |
| **Integridade Referencial** | **Excelente (Snapshot único)** | Média (Risco de órfãos) | Média | Baixa |
| **Facilidade de Transação CAS** | **Excelente (RPC V2 existente)** | Complexa (2 transações) | Boa | Baixa |
| **Separação de Preocupações** | Média/Boa (Campo dedicado) | **Excelente** | Média | Péssima |
| **Desempenho de Leitura (RTT)** | **Excelente (1 roundtrip)** | Média (2 roundtrips) | Boa | Baixa |
| **Complexidade de Rollback** | **Trivial** | Média | Boa | Complexa |

---

## 4. Decisão Recomendada: Abordagem Híbrida Faseada (Fase 1: Opção A -> Futuro: Opção B se justificado)

### Recomendação Imediata para o Ciclo Atual (Fase 1): **Opção A**
Recomenda-se persistir o `WorkspaceLayoutV1` como o campo opcional `workspaceLayout?: WorkspaceLayoutV1` diretamente dentro de `ProductWorkbookV2`:

1. **Risco Zero em Produção:** Não requer aplicação de DDL, não altera tabelas live do Supabase e não exige novas migrations no PostgreSQL.
2. **Garantia de Integridade Imediata:** O layout é validado pelo Zod client-side e armazenado atomicamente junto ao workbook via RPC `save_product_workbook_v2` já existente e homologada.
3. **Se o layout não for persistido:** O motor puro `autoOrganizeProductWorkspace` deriva deterministicamente a projeção em tempo de execução sem perda de nenhuma informação.
4. **Isolamento de Mutação:** Como o `WorkspaceLayoutV1` armazena estritamente referências (`datumId`, `datasetId`), a verdade técnica dos calibradores Presys (TA-25N, TA-35N, TA-50N, PCON) permanece 100% pura e inalterada.

---

## 5. Plano de Convivência e Transição Futura

Caso futuras demandas de governança empresarial exijam que revisões de layout não incrementem a versão de dados técnicos, o modelo `WorkspaceLayoutV1` criado nesta fundação já está **totalmente isolado e versionado** (`schemaVersion: 1`), permitindo ser extraído para uma tabela independente no futuro com zero alteração nas suas interfaces e tipos de domínio.

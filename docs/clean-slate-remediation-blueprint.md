# REMEDIATION PLAN / READ-ONLY BLUEPRINT — PIM CANONICAL RECONCILIATION
**Classificação**: PLANEJAMENTO TÉCNICO / READ-ONLY BLUEPRINT (NÃO EXECUTAR LIVE)  
**Projeto Supabase**: `bjxqvrpbigwgabwbhtqa` ("Catalogpresys")  
**Data da Revisão**: 2026-09-03  
**Branch Canônica**: `feat/pim-production-core-v1`  
**Base Commit**: `8b234e8e130929a3b42eb26048a36c1d5291f905`  
**Estado Operacional**: LEITURA E PLANEJAMENTO APENAS — ZERO DML / ZERO DDL LIVE

---

## 1. RECONCILIAÇÃO CANÔNICA DE ENTIDADES

### 1.1 Família Canônica de Produção (Survivor Family)
- **ID Canônico**: `28778e8c-4f61-40b9-ab8c-e27654a3f49e`
- **Nome Canônico**: **"Banhos Térmicos tipo Bloco Seco"**
- **Justificativa de Sobrevivência**: É a família ativa no catálogo de calibração térmica de instrumentação industrial que congrega os calibradores portáteis e blocos secos da linha TA.

### 1.2 Produtos Canônicos Sobreviventes (Survivor Products)
Os três calibradores de temperatura canônicos de produção aprovados para sobrevivência no clean-slate são:

| Modelo / Identificador | UUID Canônico Sobrevivente | Família Vinculada | Status em Produção |
|---|---|---|---|
| **TA-25N / TA-25** | `7c55db7c-8c01-4bbc-a632-452a010998a6` | `28778e8c-4f61-40b9-ab8c-e27654a3f49e` | Ativo — Múltiplas versões históricas e catálogos reais |
| **TA-35N / TA-35** | `6deb7c6c-9e8b-4063-a732-4c87825f86fe` | `28778e8c-4f61-40b9-ab8c-e27654a3f49e` | Ativo — Assets técnicos vinculados e referências de engenharia |
| **TA-50N / TA-50** | `034ec9a4-38bf-47f6-b0f7-e35f4846b53c` | `28778e8c-4f61-40b9-ab8c-e27654a3f49e` | Ativo — Catálogos e snapshots consolidados |

---

## 2. DEPENDÊNCIAS CRÍTICAS E ESTRUTURA DE SNAPSHOTS

### 2.1 Alerta Estrutural: Snapshots de Catálogo (`catalog_versions`)
> [!CAUTION]
> **NUNCA assumir `snapshot_data.productId` na raiz do JSON.**
> 
> A estrutura de `catalog_versions.snapshot_data` varia conforme a versão do schema de catálogo (V1, V2, V3) e armazena os produtos dentro de árvores hierárquicas de blocos:
> - `snapshot_data->'blocks'[*]->'properties'->'productId'`
> - `snapshot_data->'items'[*]->'productId'`
> - `snapshot_data->'tables'[*]->'productRef'`
> 
> Uma tentativa cega de mutação via `jsonb_set(snapshot_data, '{productId}', ...)` é **inválida, ineficaz e causadora de corrupção silenciosa**.
> Qualquer remediação em snapshots legados requer:
> 1. Script analítico de introspecção profunda de caminhos JSON (deep-traversal).
> 2. Validação reversível de integridade referencial antes e depois da reescrita.
> 3. Homologação manual em ambiente de staging isolado.

### 2.2 Sementes e Resíduos Sintéticos Identificados para Descomissionamento Futuro
Registros que serão candidatos a descarte **após** homologação completa:
- Produtos sintéticos (Set A):
  - `a0000000-0000-0000-0000-000000000025`
  - `a0000000-0000-0000-0000-000000000035`
  - `a0000000-0000-0000-0000-000000000050`
- Famílias sintéticas/demo:
  - `10000000-0000-0000-0000-000000000001` a `10000000-0000-0000-0000-000000000004`
- Famílias geradas por pipelines efêmeros de teste:
  - `feb500eb-14b5-4b7f-8c38-89c0b11566cf`
  - `7f5f9923-2ee8-4d56-8575-cfdc1f855e9b`

---

## 3. PLANO DE REMEDIAÇÃO EM FASES (READ-ONLY BLUEPRINT)

Nenhum comando DDL ou DML está autorizado para execução direta. A remediação seguirá estritamente as fases abaixo:

### Fase 1: Pré-Requisitos e Infraestrutura de Conhecimento
- [x] Implementação do Schema V2 de Workbooks com suporte a tabelas técnicas (`datasets`) e validação server-side C9.
- [x] Contrato de busca hardenizado via RPC `search_product_knowledge_v2`.
- [ ] Conclusão do rehearsal de migração em PostgreSQL isolado (00022 -> 00023).
- [ ] Entrada em produção dos novos workbooks V2 dos produtos canônicos Set B.

### Fase 2: Auditoria Profunda de Dependências (Read-Only Analysis)
1. Mapear todas as chaves estrangeiras ativas apontando para produtos e famílias:
   - `catalog_products`
   - `product_assets`
   - `product_versions`
   - `product_workbooks`
   - `library_change_events`
2. Executar query de introspecção recursiva em `catalog_versions.snapshot_data` para catalogar cada ocorrência de UUID sintético e sua profundidade no documento JSON.
3. Gerar manifesto formal de impacto contendo:
   - Total de registros dependentes por tabela
   - Hash SHA-256 do estado anterior do banco de dados

### Fase 3: Homologação em Ambiente Isolado (Staging Rehearsal)
1. Restaurar dump de produção em banco de dados isolado.
2. Executar script de remediação transacional sob flag de teste.
3. Validar:
   - Zero perda de catálogos
   - Zero referências quebradas nos sobreviventes
   - Validação da integridade dos blocos de catálogo renderizados na interface
4. Emissão do laudo de homologação com aprovação explícita do Arquiteto e do DBA.

### Fase 4: Execução em Janela de Manutenção Produção (Futuro)
- Execução com backup snapshot prévio.
- Execução em bloco transacional (`BEGIN ... COMMIT`) com auditoria explícita em `library_change_events`.
- Zero tolerância a erros.

---

## 4. DIRETRIZES DE AUDITORIA FINAL

> [!IMPORTANT]
> **Este documento é exclusivamente um plano de remediação e especificação de referência.**  
> Nenhum código de alteração de banco (DML/DDL) deve ser promovido ou executado em ambiente live antes de concluídas todas as fases acima e emitido o laudo de homologação formal.

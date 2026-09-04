# ADR: Titularidade dos Descritores Semânticos — Camada Canônica vs Overrides de Layout (PIM.MEGA.WORKSPACE)

- **Status:** APROVADO
- **Data:** 2026-09-04
- **Autor:** Architecture & Product Design Pair (Hardening Review)
- **Contexto:** Framework Synkra AIOS / PIM Core V2 / Mega Product Workspace Foundation 1B

---

## 1. Problema & Questão Arquitetural

No design inicial do Foundation 1A, o mapa `semanticDescriptors` (contendo `canonicalKey`, `displayLabel`, `aliases` e `description`) foi alocado dentro de `WorkspaceLayoutV1`.

A auditoria técnica independente levantou a questão crucial:
> **Aliases e descrições para IA são personalização de apresentação visual ou semântica canônica do produto?**

Se aliases forem consumidos por:
- Agentes de IA e LLMs (reconhecimento de linguagem natural e sinônimos industriais),
- Motores de busca globais do catálogo,
- Integrações ERP/MES e exportações técnicas,
- Planejamento de compatibilidade e renomeação canônica (`planCanonicalRename`),

**Eles NÃO podem depender de um layout de tela individual**. Se um usuário redefinir seu layout, criar uma nova visão ou deletar uma seção, os aliases e o entendimento da IA sobre o produto não podem evaporar.

---

## 2. Decisão Arquitetural: Separação em Duas Camadas

Estabelece-se formalmente a divisão de responsabilidades:

### Camada A: Product Semantic Layer / Canonical Semantic Registry (Domínio Canônico)
- **Titularidade:** Engenharia de Produto / PIM Core.
- **Entidades:** `ProductSemanticRegistry` contendo `descriptors: Record<string, SemanticDescriptor>` (`canonicalKey`, `canonicalAliases`, `aiDescription`, `localeLabels`).
- **Finalidade:** Servir como autoridade soberana para IA, busca, integrações e resolução de entidades.
- **Ciclo de Vida:** Estável e associado ao produto/família.

### Camada B: Workspace Display Overrides (Apresentação Humana)
- **Titularidade:** Apresentação Humana / `WorkspaceLayoutV1`.
- **Entidades:** `WorkspaceDisplayOverride` (`customLabel`, `customDescription`).
- **Finalidade:** Permitir que o usuário ajuste o título cosmético de um card ou seção na sua visualização ("Nome amigável na tela"), sem alterar nem duplicar os aliases da IA.
- **Ciclo de Vida:** Pertence ao layout específico (`product_workspace_layouts`).

---

## 3. Comportamento de Resolução na Interface e na IA

1. **Na Interface do Workspace (`buildWorkspaceProjection`):**
   ```ts
   displayLabel =
     layout.displayOverrides?.[canonicalKey]?.customLabel ||
     semanticRegistry?.descriptors[canonicalKey]?.displayLabel ||
     datum.label ||
     canonicalKey;
   ```
   O usuário comum tem total liberdade para renomear rótulos cosméticos na tela, sem qualquer risco de fragmentar a semântica canônica.

2. **No Envelope da IA (`buildAiProductKnowledgeEnvelope`):**
   A IA consome os aliases canônicos da Camada A via `semanticRegistry.descriptors[canonicalKey].aliases`, garantindo que variações como *"temperatura de calibração"*, *"thermal stability"* e *"estabilidade"* continuem sendo mapeadas com precisão metrológica independente de como o usuário configurou suas abas no layout.
   O layout visual NÃO dita o entendimento factual da IA.

3. **No Grafo de Referências e Safe Rename (`SemanticReferenceGraph`):**
   O planejador audita o registro canônico de aliases (`semanticRegistry`) para garantir que nenhuma nova chave canônica colida com sinônimos já homologados.

---

## 4. Transição e Compatibilidade

Para garantir transição suave e zero breaking changes no código existente:
- O campo `layout.semanticDescriptors` é mantido apenas como fallback de leitura para layouts legados durante migração.
- Novos layouts gerados por `autoOrganizeProductWorkspace` NÃO gravam `semanticDescriptors`.
- O contrato canônico `ProductSemanticRegistry` assume a soberania dos descritores semânticos e aliases para IA.
- O campo `displayOverrides?: Record<string, WorkspaceDisplayOverride>` assume formalmente a titularidade de personalizações cosméticas de tela no schema estrito `WorkspaceLayoutV1Schema`.

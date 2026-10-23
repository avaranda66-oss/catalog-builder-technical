# Story — Onda 4, fatia 4A: Planejar, prévia e aplicar o catálogo inteiro pela IA (FR-70)

## Status

InReview

## Origem

Plano father-ready, §3 FR-70 e §4 Onda 4 (linha 4A). Base: `onda4/rascunho` (fatia R: `interpret_sketch`,
`sketch-plan`/`sketch-snap` e o ajuste da tabela T3).

## Critérios e checklist

- [x] Contrato `CatalogDraftPlan` (`contracts.ts`) e tarefa `plan_draft` em `vnext-catalog-draft` com os mesmos guardas,
      orçamento 00028 (reserva do pior caso) e limites de tamanho (só esta tarefa traz o texto das páginas).
- [x] Resposta do Gemini com schema limitado (maxLength em toda string, maxItems em toda lista de strings; listas de
      objetos limitadas no servidor porque o Gemini recusa maxItems nelas — sondado e documentado).
- [x] Valores técnicos só do texto conferido: token `[[VNEXT_TECH_n]]` por trecho, conferido como trecho impresso inteiro
      (com letras coladas e unidade) ou pelo fato conferido; algarismo fora de token recusa o campo; o que não bater
      fica “A COMPLETAR” com pendência. A tabela de especificações nunca vem da IA (compilador FR-69).
- [x] Prévia (`DraftPreview.tsx`): miniatura de cada página, o que entra em cada campo, de onde veio cada valor, o que fica
      para a pessoa, pendências FR-68 antes de aplicar; tirar, pôr de volta, subir e descer páginas; perguntas e notas.
- [x] Aplicar = UMA transação (ensaio numa cópia antes), Desfazer por 30 s no cartão e na conversa; Ajustar sem reler o PDF;
      Descartar.
- [x] Entrada no chat: “Montar catálogo a partir destes arquivos”, 5 passos visíveis.
- [x] Ponto de entrada reutilizável “aplicar plano de páginas” (`page-plan-apply.ts`) para a tela do rascunho (P1–P9, C1,
      tabela de especificações).
- [x] Prova real com o folder do TA e Gemini real: `docs/ai-catalog/CATALOGO_IA.md`.
- [x] Vitest dos arquivos afetados, `tsc --noEmit` e eslint nos arquivos alterados.

## File List

- `src/vnext/ai-catalog/catalog-plan-contract.ts` (novo) — pedido, prompt, schema, limites, execução no servidor.
- `src/vnext/ai-catalog/catalog-plan.ts` (novo) — resumo para a IA, conferência de cada valor, entradas, estimativa A4.
- `src/vnext/ai-catalog/page-plan-apply.ts` (novo) — compilar/aplicar/desfazer um plano de páginas numa transação.
- `src/vnext/ai-catalog/useCatalogDraft.ts` (novo) — fluxo no chat.
- `src/vnext/ai-catalog/DraftPreview.tsx`, `draft-preview.css` (novos) — cartões e prévia.
- `src/vnext/ai-catalog/contracts.ts` — `CatalogDraftPlanSchema`.
- `src/vnext/ai-catalog/draft-client.ts` — `requestCatalogPlan`, `planning` na prontidão.
- `src/vnext/ai-catalog/spec-table/spec-table-gateway.ts` — `plan` no gateway do servidor.
- `src/vnext/ai-catalog/CatalogNativeComposer.tsx` — botão, cartões, `onShowPage`.
- `src/vnext/ai-catalog/workbench-dialogue.ts` — ação `catalog-draft` na conversa.
- `src/vnext/app/EditorWorkspace.tsx` — `onShowPage={setActivePage}`.
- `supabase/functions/vnext-catalog-draft/index.ts` — ramo `plan_draft`, limite de corpo por tarefa, `tasks` no status.
- `scripts/live-catalog-plan.ts` (novo) — prova real.
- `tests/vnext/ai-catalog/catalog-plan.test.ts`, `catalog-draft-preview.test.tsx` (novos); `draft-edge.test.ts`.
- `docs/ai-catalog/CATALOGO_IA.md`, `docs/ai-catalog/catalogo-ia/rodada-{1,2,3}/` (novos).

## Change Log

- 2026-10-23 — @dev: fatia 4A implementada, testada (Vitest dos arquivos afetados) e provada com Gemini real; aguarda
  integração e deploy da função a partir do SHA integrado.

# Story — Onda 4, fatia R: Modo rascunho (servidor e módulos puros) + tabela do PDF

## Status

InReview

## Origem

Plano father-ready, Onda 4 (fatia "rascunho"); base técnica em `D:/spike-rascunho/RELATORIO.md`. Trabalho inicial
da Codex (`D:/codex-onda4/rascunho`, sobre o main da Onda 3) revisado e reaplicado sobre `origin/main` (ab39efc).
Sem tela nesta fatia.

## Critérios e checklist

- [x] Tarefa `interpret_sketch` em `vnext-catalog-draft` com os mesmos guardas (origem, sessão, perfil admin/editor
      ativo, tamanho do pedido) e o orçamento 00028 (reserva do pior caso de duas leituras antes do Google).
- [x] Uma imagem por página, até 1600 px no lado maior e 10 MB, lida pelos bytes; `gemini-3.8-flash`; schema limitado.
- [x] Caixas nativas `[ymin,xmin,ymax,xmax]` 0–1000 validadas no código, com UMA nova tentativa só se inválidas.
- [x] Todo dígito do rascunho marcado `confirmar`; nenhum fato técnico sai do rascunho.
- [x] Encaixe nos arquétipos P1–P9 e na "Capa de produto — PCON" (C1), caixa só para ordem e coluna.
- [x] Perguntas só de disposição real e da fonte dos dados de cada tabela.
- [x] Função cliente tipada (`sketch-client.ts`) no padrão do `draft-client.ts`.
- [x] Prova com Gemini real nos rascunhos limpos, "foto" e "estresse": `docs/ai-catalog/RASCUNHO_SERVIDOR.md`.
- [x] Tabela do PDF: característica repetida só por condição diferente por modelo vira uma linha, com nota por modelo.
- [x] Vitest dos arquivos afetados, `tsc --noEmit` e eslint nos arquivos alterados.

## File List

- `src/vnext/ai-catalog/sketch-plan.ts` (novo) — contrato do modelo, prompt, schema limitado, validação, confirmações.
- `src/vnext/ai-catalog/sketch-contract.ts` (novo) — execução no servidor (Deno/Node), dimensões pelos bytes, nova tentativa.
- `src/vnext/ai-catalog/sketch-snap.ts` (novo) — encaixe nos modelos PRESYS, perguntas.
- `src/vnext/ai-catalog/sketch-client.ts` (novo) — cliente tipado e mensagens.
- `src/vnext/ai-catalog/draft-contract.ts` — `parseDraftRequest` aceita `interpret_sketch`.
- `supabase/functions/vnext-catalog-draft/index.ts` — ramo `interpret_sketch`.
- `src/vnext/ai-catalog/draft-compiler.ts` — `joinConditionSplitRows`; divergência só na linha que tem a leitura.
- `scripts/live-sketch-interpretation.ts` (novo) — prova local com Gemini real.
- `docs/ai-catalog/RASCUNHO_SERVIDOR.md` e `docs/ai-catalog/rascunho-servidor/rodada-1/` (novos) — resultado da prova.
- Testes: `tests/vnext/ai-catalog/{sketch-plan,sketch-contract,sketch-snap,sketch-client,draft-compiler-split-rows}.test.ts`
  (novos), `tests/vnext/ai-catalog/draft-edge.test.ts`.

## Change Log

- 22/10/2026 — Codex: primeira versão (não commitada) em `D:/codex-onda4/rascunho`.
- 22/10/2026 — Claude: reaplicado sobre o main atual; limite de 10 MB por imagem; encaixe na capa PCON (C1), notas sob
  a tabela, notas de fonte ("do PDF"), perguntas de fonte por tabela e filtro de perguntas de conteúdo; ordem de leitura
  por linhas; cliente tipado; prova real; junção de linhas por condição no compilador.

# Story — Onda 4, fatia "rascunho-tela": tela do Modo rascunho (fotos de páginas desenhadas no papel)

## Status

InReview

## Origem

Plano father-ready, Onda 4 (segunda porta de entrada da IA). Base: `onda4/catalogo-ia` (fatia R: `interpret_sketch`,
`sketch-plan`/`sketch-snap`/`sketch-client`; fatia 4A: `page-plan-apply.ts`, prévia/aplicar em UMA transação).
Referência visual: `D:/spike-rascunho/Modo-Rascunho-PRESYS.pdf` (áreas numeradas e coloridas sobre a foto).

## Critérios e checklist

- [x] Entradas: no assistente (“Criar páginas a partir do rascunho em papel (fotos)” nas sugestões iniciais; “Esta foto
      é um rascunho: criar a página” nas fotos soltas na conversa) e no editor (“Página a partir de rascunho…” ao lado de
      “Usar modelo…”, sob “Adicionar página”, que abre o assistente com as fotos escolhidas).
- [x] 1+ fotos, uma por página (até 6 por vez); JPG, PNG e WebP; HEIC aceito na escolha e explicado com a mesma
      mensagem do editor (sem enviar nada).
- [x] Status do servidor antes de enviar: função publicada sem `interpret_sketch` é avisada em português simples,
      sem envio nem cobrança; aviso de envio no cartão antes de “Ler o rascunho”.
- [x] Foto deixada em pé (EXIF) e reduzida a 1600 px no computador (`sketch-image.ts`); a tela mostra exatamente a
      imagem que a IA leu, com as áreas entendidas por cima (numeradas na ordem de leitura, uma cor por tipo).
- [x] Tipo de página: sugestão + 2 alternativas; trocar o tipo reencaixa os campos (`snapSketchPlan(plan, { template })`).
- [x] Cada campo com o texto do rascunho, editável; todo dígito destacado; o campo com número só entra depois de
      “Os números estão certos” (texto alterado pede nova conferência); sem conferir, fica “A COMPLETAR”.
- [x] Tabela desenhada: “De onde vêm os dados da …?” — deixar para preencher (entra vazia, a tabela do modelo) ou só
      arquivo já conferido nesta conversa (planilha lida célula a célula aqui; tabela de especificações do PDF já
      conferida, que vira a tabela do compilador FR-69 com o título do rascunho). O desenho nunca preenche tabela.
- [x] Logotipo e faixa colorida = “já faz parte do modelo”; foto = escolher na página depois; notas “do PDF” lidas como
      fonte; o que o modelo não comporta aparece como “fica de fora”; dúvidas de disposição da IA aparecem como aviso.
- [x] Miniatura de como cada página vai ficar; “Não criar esta página”; foto que falhou pode ser lida de novo.
- [x] Aplicar pelo `applyPagePlan` da 4A: ensaio numa cópia, UMA transação, Desfazer por 30 s no cartão e na conversa.
- [x] Vitest da tela e do fluxo; `tsc --noEmit`; eslint nos arquivos alterados.
- [x] Prova de navegador `j14-rascunho.mjs` (harness local, resposta gravada da fatia R) em 1366 e VP=1280.

## File List

- `src/vnext/ai-catalog/useSketchDraft.ts` (novo) — estados do fluxo (verificação, envio, leitura por foto, revisão,
  aplicar, desfazer).
- `src/vnext/ai-catalog/SketchDraft.tsx` + `sketch-draft.css` (novos) — cartões da conversa, foto com áreas, campos.
- `src/vnext/ai-catalog/sketch-review.ts` (novo, puro) — campos, escolhas, números a conferir, fontes das tabelas,
  plano de páginas, mensagem final.
- `src/vnext/ai-catalog/sketch-image.ts` (novo) — foto em pé e ≤ 1600 px antes de enviar; HEIC explicado.
- `src/vnext/ai-catalog/sketch-snap.ts` — `snapSketchPlan(plan, { template })` e `suggestedArchetypeId`.
- `src/vnext/ai-catalog/draft-client.ts` — prontidão `sketching` (status lista `interpret_sketch`).
- `src/vnext/ai-catalog/spec-table/spec-table-gateway.ts` — `sketch(image)` no gateway do servidor.
- `src/vnext/ai-catalog/CatalogNativeComposer.tsx` — botões, cartões, fontes conferidas, `sketchRequest`.
- `src/vnext/app/EditorWorkspace.tsx` — “Página a partir de rascunho…” (só no modo simples, com a leitura do servidor).
- `tests/vnext/proof/father-journeys/fixtures/father-harness.tsx` — `interpret_sketch` controlado e `tasks` no status.
- `tests/vnext/proof/father-journeys/j14-rascunho.mjs` (novo) + `fixtures/photos/rascunho/*.jpg` (fotos do spike).
- Testes: `tests/vnext/ai-catalog/{sketch-review,sketch-image}.test.ts`, `sketch-draft-screen.test.tsx`,
  `sketch-fixtures.ts` (novos); `sketch-snap.test.ts`, `draft-client.test.ts`.

## Change Log

- 23/10/2026 — Claude: tela do Modo rascunho, entradas no assistente e no editor, prova j14 em 1366 e 1280.

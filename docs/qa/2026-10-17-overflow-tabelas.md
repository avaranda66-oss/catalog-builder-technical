# Correção local — espaços no fim de linha e transbordo de tabela

Data: 17/10/2026. Story: `docs/stories/2026-10-17-father-ready-continuacao.md` (In Progress).

## Problema e decisão

O checkpoint `2E-arquivos-assistente.fixed.json` relata cinco falsos `CELL_CONTENT_OVERFLOW` na J12. `RichTextRenderer` usa `white-space: pre-wrap`; os retângulos de um Range completo podem incluir os espaços pendurados no fim da linha. `intrinsicMetrics` considerava essa borda como largura de conteúdo, e o preflight bloqueava a publicação.

A alteração mantém `textFlowRecords` intacto, inclusive os retângulos completos usados nas assinaturas de estabilidade. Também mantém a altura original. Somente quando a largura do texto ultrapassa a caixa, a medição de largura consulta ranges de palavras nos parágrafos `pre-wrap`, sem os espaços ASCII. As posições absolutas das palavras preservam espaços internos e recuos; NBSP continua dentro dos ranges. Parágrafos `pre`/nowrap usam seu Range completo. Imagens continuam entrando na união de limites depois dessa medição. Nenhuma tolerância ou limite artificial é aplicado ao conteúdo visível.

## Arquivos

- `src/vnext/rendering/measurement.ts`: reavaliação da largura aparente excedida; assinaturas e altura preservadas.
- `tests/vnext/rendering/measurement-hanging-space.test.tsx`: oito casos com geometria de Range simulada, cobrindo espaço pendurado, palavra realmente larga, NBSP, pre/nowrap, imagem larga, espaços internos, limite esquerdo e caminho normal sem trabalho extra.
- `docs/qa/2026-10-17-overflow-tabelas.md`: este checkpoint.

## Evidência e estado da validação

Código e testes foram preparados por leitura do renderer e do preflight. Os novos testes ainda **não foram executados**: o integrador mantém testes e portões em uma fila serial. A geometria unitária é sintética e não confirma o comportamento real do Chromium.

Próximas verificações do integrador:

1. Executar o teste novo, `measurement-identity.test.tsx` e os testes de publicação afetados.
2. Executar `node tests/vnext/proof/export-proof.mjs`: paridade de fatos e texto em screen/print, DPR 1/2 e larguras 900/1500, PDF e casos adversários de transbordo real.
3. Executar `node tests/vnext/proof/editor-table-fit-height-proof.mjs` e a J12 integrada em navegador para confirmar que os cinco falsos bloqueios desaparecem sem liberar conteúdo realmente largo.
4. Concluir lint, typecheck, testes e build no estado final da integração.

Não houve commit, push, deploy, migração ou alteração de dependências nesta subtarefa. A atualização da story e da lista consolidada de arquivos fica com o integrador para evitar escrita concorrente.

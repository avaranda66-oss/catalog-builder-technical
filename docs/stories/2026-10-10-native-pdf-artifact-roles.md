# Papéis Artifact nativos no diagnóstico PDF

Status: In Progress — checkpoint local concluído; suíte completa, CI e Git pendentes.
Data: 2026-10-10. Branch: `codex/native-pdf-provenance-20261010`.
Worktree: `C:/Users/Usuario/.codex/worktrees/native-pdf-provenance-20261010/catalog-builder`.
Base: `a1b11b1fdd0dbe2872884a32da3cb9f077d6485b` / tree `13b7a5a8aa19fe88b6e29abf60c2e6aa817fc9b0`.

## Investigação e resultado delimitado

O [protótipo anterior](2026-10-10-native-pdf-cell-provenance.md) lê os runs corretamente, mas bloqueia as regiões p6–7 do manual PRESYS por texto rotado. A investigação read-only vinculou os runs p6:i325/p7:i1182 à operação de pintura por fonte, Unicode e matriz efetiva exata. Eles são `/Artifact`, modo fill e ca/CA=0,169998. O envelope afim intersecta a tabela: não há prova de que estejam fora das células, nem autorização para excluí-los pelo texto, nome da fonte ou opacidade.

O PDF.js 4.10.38 oferece marcadores nativos com `getTextContent({includeMarkedContent:true,disableNormalization:true})`. A investigação confirmou igualdade completa de todos os 326/1183 itens com a leitura sem marcadores, mantendo os índices originais. A profundidade de marcadores TEXT do manual é 1; o `/OC` interno aparece no operatorList, não nesses eventos. O worker silencia EMC excedente na leitura TEXT; o leitor também confere o balanceamento dos operadores brutos para não confiar numa sequência filtrada incompleta.

Acrescentar apenas papel e tags readonly aos runs; Artifact exato pode ser excluído do diagnóstico de região, preservando fonte e hashes completos. Nenhum fato, proposta, aprovação, canônico, chamada Google, UI ou publicação integra esta alteração.

## Acceptance criteria

- [x] **AC01 — Mapping exato.** Leitura com/sem marcadores compara quantidade e todos os atributos dos itens de texto. IDs contam os itens originais, ignorando marcadores. Divergência bloqueia a página, sem reassociar por conteúdo aproximado.
- [x] **AC02 — Metadata nativo readonly.** Cada run conserva `markedTags` e `evidenceRole` originados exclusivamente do parser dos bytes. Papel Artifact exige tag exata e sequência válida; strings, fontes, transforms, IDs e hashes anteriores permanecem intactos.
- [x] **AC03 — Exclusão diagnóstica delimitada.** Artifact nativo pode deixar o conjunto de reconstrução, mas permanece no snapshot/auditoria com recibo de exclusão. Texto rotado ordinário, tag Span ou nome parecido continuam BLOCKED. Não excluir por texto `presys`, fonte, alpha ou heurística espacial.
- [x] **AC04 — Marker malformado.** Begin/end de operadores e eventos devem estar balanceados. Tag ausente ou estruturalmente inválida, end excedente, começo não encerrado ou mapping fabricado bloqueiam; não confiar no EMC excedente filtrado pelo worker. Tags válidas diferentes de Artifact conservam papel content.
- [x] **AC05 — Nesting limitado.** MVP bloqueia qualquer nesting nos eventos TEXT, conservando todos os dados para diagnóstico. O balanceamento de operatorList permite o nesting nativo Artifact→OC do renderer; isso não atribui papéis ou autoriza exclusão por replay incompleto.
- [x] **AC06 — Fronteira de autoridade.** Metadata e snapshot profundamente congelados; cópia JSON/role forjado não vira snapshot nativo. Alterar bytes invalida SHA. Alterar tags por caller não altera resultado. Nenhum caminho aceita/aprova fatos.
- [x] **AC07 — Provas originais e QA.** Fixtures próprias cobrem Artifact rotado, rotado ordinário, Span, nesting, markers não balanceados e tamper; preservar split/minus/microgap/partial/columns/race/PUA/truncamento. Auditoria independente em arquivo próprio.
- [x] **AC08 — Reteste PRESYS.** Reexecutar as 11 regiões curadas p6–7 e registrar Artifact excluído sem apagar fonte. Registrar a primeira causa bloqueante de cada região, sem atribuir estados posteriores que o guard não alcançou. As regras de microgap/espaço heurístico UNCERTAIN e PUA/corte BLOCKED permanecem comprovadas pelas fixtures. LITERAL continua apenas concatenação de runs, sem associação de modelo/campo.
- [x] **AC09 — Gates e limite.** Focados, lint/typecheck/build atuais fecham o checkpoint técnico; suíte completa e Git/release continuam sob root/DevOps. Terceira proveniência de tabela precisa de contrato/story próprios antes da ponte ao canônico. Sem credenciais, chamada paga, merge, migração ou produção por esta etapa.

## Evidências anteriores ao código

- [Mapping integral plain/marked](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/native-prototype-cli/marked-content-diagnostic/result.json>)
- [Operadores, tags, alpha e matriz da marca](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/native-prototype-cli/paint-diagnostic/result.json>)
- [11 regiões antes da mudança, todas BLOCKED por rotação](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/native-prototype-cli/manual-regions/result.json>)

## Checklist / File List

- [x] Investigar paint state e mapping nativo antes de código.
- [x] Registrar esta story e coordenar QA independente.
- [x] Implementar papel/exclusão limitada e preservação da fonte.
- [x] Fixtures/QA/reteste real e gates atuais do checkpoint.
- [x] Atualizar evidências, limites e File List antes de handoff.
- [ ] Suíte completa e CI do futuro commit exato; autorização Git de root/DevOps.

Arquivos desta story: `docs/stories/2026-10-10-native-pdf-artifact-roles.md`, `src/vnext/ai-catalog/pdf-native-provenance.ts`, `scripts/native-pdf-provenance.mjs`, `tests/vnext/ai-catalog/native-pdf-fixture.ts`, `tests/vnext/ai-catalog/pdf-native-provenance.test.ts` e `tests/vnext/ai-catalog/qa-native-reader.test.ts` (autoria QA). A story de fundação abaixo compartilha esses arquivos. `pdf-intake.ts` permanece intacto. Não alterar a worktree de integridade ou o catálogo existente.

## Checkpoint congelado

2026-10-10: 30 testes PASS em 3 arquivos (11 reader, 15 QA, 4 intake); typecheck PASS; lint PASS com 0 erros e 269 warnings, nenhum nos arquivos novos do leitor; build PASS. [Recibo dos gates e hashes estáveis](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/native-prototype-cli/gates-artifact/result.json>). A suíte completa e CI atuais não foram executados. Não houve commit, push ou GO de merge.

O [CLI final do manual](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/native-prototype-cli/manual-final/result.json>) mantém 326/1183 runs e hashes literais idênticos aos iniciais. Dez Artifact por página permanecem no snapshot e são excluídos apenas do diagnóstico. Todas as 11 regiões são BLOCKED por `REGION_CUTS_RUN`: envelopes de métricas das fontes se sobrepõem entre linhas próximas. Esse resultado não prova corte de glifos e não autoriza redução heurística das caixas. O leitor não atesta text rendering mode, alpha, clipping, visibilidade efetiva ou associação de fato. [Resultados e limites](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/NATIVE_PDF_READER_RESULTS.md>).

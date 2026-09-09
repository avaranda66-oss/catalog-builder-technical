# FOUNDATION-PROOF-01 — EDITORIAL FOUNDATION PROOF

STATUS: PROPOSED / READY FOR SCOPED IMPLEMENTATION AFTER REVIEW
PRINCIPAL REVIEW: IN PROGRESS
FREEZE STATUS: NOT FROZEN

BASELINE EXPECTATION: `616332d6048a4259d2e2b562d8d5e781cea334bd` + este pacote documental

HISTORICAL FILENAME: `MVP-01-prova-editorial.md`. O filename permanece por compatibilidade; o nome canônico da tarefa é FOUNDATION-PROOF-01.

Risk: alto; implementação com agente competente em layout/tabelas e revisão independente. Nome de modelo não substitui aceite.

## Objetivo e motivo

Demonstrar que o núcleo escolhido representa e imprime G01–G05 antes de construir uma nova biblioteca, banco ou interface completa. Resultado é prova técnica local reproduzível, não editor de produção, migração do legado ou **FATHER-USABLE V1**.

Escopo FOUNDATION REQUIRED — PROPOSED: AI Translation OUT OF SCOPE; Sharing OUT OF SCOPE; PIM OUT OF SCOPE; Presence OUT OF SCOPE; AI authoring agent OUT OF SCOPE. Esses cortes não rebaixam a recomendação de produto: AI Translation e basic read-only sharing continuam V1 MUST-CANDIDATE, com decisão PROPOSED.

Requisitos: PAGE-01/02, TABLE-01/02/03/04/05/06, STYLE-01, PUB-01, TEST-01. Ler README, evidências, reaproveitamento, D3, D4, D5 e execução desta pasta. Referências visuais são os PDFs locais informados pelo usuário; se ausentes, registrar falta e usar especificação, sem inventar inspeção visual.

## Prerequisitos

- Confirmar SHA de main e diff da branch. Se main mudou em módulos selecionados, registrar novo baseline e revisar apenas impactos relevantes; nunca resetar trabalho de terceiros.
- `npm ci`; quatro gates; verificar acesso local a Chromium e fontes distribuíveis. Não copiar `.env` nem credenciais de outro projeto.
- Abrir story específica de implementação antes de código produtivo. A story desta análise não autoriza produção.
- Nenhuma dependência nova sem justificativa de necessidade e revisão do lockfile.

## Arquivos permitidos

Criar somente o laboratório isolado abaixo e atualizar esta pasta documental/story correspondente:

```text
src/labs/presys-editorial-proof/index.html
src/labs/presys-editorial-proof/main.tsx
src/labs/presys-editorial-proof/proof-model.ts
src/labs/presys-editorial-proof/proof-table.ts
src/labs/presys-editorial-proof/proof-layout.ts
src/labs/presys-editorial-proof/ProofDocument.tsx
src/labs/presys-editorial-proof/ProofPage.tsx
src/labs/presys-editorial-proof/ProofTable.tsx
src/labs/presys-editorial-proof/proof.css
tests/vnext/proof/model.test.ts
tests/vnext/proof/table.test.ts
tests/vnext/proof/geometry.test.ts
tests/vnext/proof/fixtures/*.json
tests/vnext/proof/export-proof.mjs
docs/vnext/presys-mvp-r0/evidence/proof-result.md
```

Vite pode servir a entrada HTML local sem modificar `src/main.tsx` ou `App.tsx`. Verificar que o build de produção não a incorpora. Arquivos PDF/PNG gerados vão a `scratch/presys-editorial-proof/` e não ao bundle. Não incluir dados de cliente ou branding de concorrente nos assets.

Proibidos: stores legados, rotas produtivas, catálogo/schema legado, export legado, `supabase/**`, `.env*`, Vercel/Netlify/Next configs, lockfile salvo necessidade aprovada pela revisão técnica do pacote, código de IA, auth, PIM, presence, sharing, publicação remota e quaisquer deletes/resets de worktrees. Também são proibidos como mecanismo PDF da prova: `html2canvas`, screenshot-as-PDF, PNG full-page, PNG full-table e o atual `PDFService.exportToPDF()`.

## Contratos de prova

O laboratório implementa um subconjunto coerente de D3/D4/D5 e não é um segundo motor de produção. A geometria autoral mínima é:

```text
Document -> pages[]
Page -> id, widthMm, heightMm, safeArea?, objects[]
Object -> id, type, frame{xMm,yMm,widthMm,heightMm}, zIndex
```

FOUNDATION-PROOF-01 usa página A4 `210 mm × 297 mm`. `safeArea` é explícita; o valor legado `8.4667 mm` não é default VNext. Safe-area violation é WARNING e nunca reposiciona; object outside physical page bounds é ERROR.

Regra inviolável: **MEASUREMENT NEVER MUTATES AUTHORED FRAME**. Measurement pode medir, produzir derived intrinsic metrics, diagnosticar e bloquear publicação. Não pode mover objetos, alterar x/y/width/height, empurrar vizinhos, criar página, mover objeto entre páginas, gerar continuation page, reduzir fonte ou alterar conteúdo.

Para tabela, `frame.heightMm` é autoral/fixo. O renderer produz `renderedIntrinsicHeightMm` DERIVED. `renderedIntrinsicHeightMm <= frame.heightMm` é OK; valor maior emite `TABLE_CONTENT_OVERFLOW / ERROR` e bloqueia GREEN/PDF final. Nunca auto-grow. Futuro `Fit height to content` somente como USER COMMAND explícita.

`RowHeightPolicy`: AUTO; MIN_MM; FIXED_MM. AUTO usa conteúdo; MIN_MM = `max(intrinsic,min)`; FIXED_MM é autoral. Conteúdo maior que FIXED_MM emite `ROW_CONTENT_OVERFLOW / ERROR`. Não reduzir font, aumentar row, cortar silenciosamente ou alterar conteúdo.

`resolveColumns(table, availableTrackWidthMm)` é função pura e retorna `{ok:true,widths}` ou `{ok:false,code,details}`, sem DOM. `availableTrackWidthMm === tableObject.frame.widthMm`: border/padding não são subtraídos e não aumentam frame. Invariantes: width > 0; minWidth respeitado; fixed respeitado; flex usa somente espaço restante; deterministic rounding; conservação de largura. Aritmética obrigatória: `PhysicalLengthU = 0.0001 mm`; mm autoral é normalizado pelo parser decimal normativo D3 + round-half-away-from-zero, cálculo usa inteiros seguros, flex weight é inteiro positivo seguro, sucesso exige `sum(widthsU) === availableTrackWidthU`, e resíduo é distribuído por largest remainder (resto decrescente; empate pela ordem estável das colunas) após aplicar caps. Toda soma/produto deve permanecer safe integer; overflow retorna `PHYSICAL_ARITHMETIC_OVERFLOW / ERROR`. Converter de volta a mm somente por `/10_000`; testes de domínio comparam `widthsU` exatamente, sem epsilon. Contraexemplo obrigatório: available 100 mm, fixed A 70, fixed B 50, flex C min 20 -> ERROR `TABLE_WIDTH_INFEASIBLE`; jamais valid+warning/C=0.

Renderer obrigatório da proof: `ProofTable` usa CSS Grid, não HTML `<table>` como autoridade geométrica. Projetar `frame.widthU/widthsU` para `PhysicalPixelQ = 1/64 CSS px` pela regra D4, com `sum(trackQ) === frameQ` exato; CSS recebe somente `frameQ/64 px` e `trackQ/64 px`, `gap:0`, sem border/padding no container. Edge segments de border têm owner único e são paint-only; outer paint fica totalmente inset, shared internal edge ocupa o lado trailing/direito ou trailing/abaixo, e full-grid + `coveredBy` suprime edges internos ao mesmo span. Padding reduz content box dentro do track; border paint não reduz track nem content box. `CELL_CONTENT_BOX_NONPOSITIVE` é ERROR. Viewport/DPR não alteram `Q`; zoom UI é externo à árvore medida.

`validateTable` verifica stable table/row/column/cell IDs, collision-safe cell key, ao menos uma coluna e uma linha total, topologia completa de células, spans, `coveredBy`, merge fail-closed, `MERGE_WOULD_DISCARD_CONTENT` e refs. Header row **não** é invariante estrutural: tabela headerless com rows body/section é válida quando preset/template/publication policy não exige header. O JSX/runtime de `TableCoreRenderer.tsx` é **DO NOT PORT AS VNEXT RENDERER** porque injeta header sintético quando `explicitHeaderRows` está vazio.

`CellContent` deve ser exatamente a união D4: `empty | richText | technicalCode | measurement | marker | image`, sem `any`/JSON arbitrário. `measurement.valueText` preserva o decimal lexeme byte-for-byte; marker referencia `legendEntryId`; image referencia `AssetRef.id`. `wrapPolicy`, image `fit/targetWidthMm/targetHeightMm` ficam em `CellContentPresentation`; caption é annotation table-scope. `cell.annotationIds` aceita note/footnote; `table.annotationIds` aceita caption/note/footnote; dangling = `ANNOTATION_REFERENCE_DANGLING`, wrong scope = `ANNOTATION_SCOPE_INVALID`.

Rowspan segue D4 sem floats: calcular `deficitU`, dividir entre rows AUTO/MIN_MM elegíveis com `baseU=floor(deficitU/K)` e `remainderU=deficitU mod K`, adicionando `+1 U` às primeiras `remainderU` em ordem top-to-bottom. FIXED_MM nunca cresce; anchors são processados por row index, column index, cell ID.

`ProofDocument → ProofPage → ProofTable` é a única árvore editorial. Screen usa essa árvore; editor futuro adiciona overlays externos; PDF usa a mesma árvore com `@media print`. `T-PARITY-01` rejeita `EditorRenderer != PDFRenderer`.

`ProofTable` recebe modelo e resolvers de assets/fontes, sem store. `layoutReport` identifica page/object/table/cell/annotation de cada defeito e a revisão/manifesto analisados. `textFlowSignature` segue D3: modelo semântico ordena paragraphs/inlines; `Range.getClientRects()` é lido por inline identificado, relativo a `data-flow-root`, normalizado para `PhysicalPixelQ` e serializado/hash canonicamente. Conteúdo `technicalCode` nunca muda para caber; G05 usa `cell.contentPresentation.wrapPolicy = 'nowrap'` com `content.value = '06.04.0121-00/IN1P/TA-50N-NH-PB-XXXXXXXXXXXX'`.

## Passos

1. Criar fixtures pequenas válidas/inválidas e RED para merge com dados, IDs duplicados, `coveredBy`/span inválido, annotation dangling, coluna inviável, row fixed overflow e table frame overflow.
2. Portar seletivamente operações/validações compatíveis do Table Core, sem imports de legacy adapter/bridge, specialized table engines, A4Canvas ou PageFlow. **Não portar JSX/runtime de `TableCoreRenderer.tsx`.** Reimplementar geometry resolver/render authority conforme D4.
3. Implementar solver e conteúdo RichText/technicalCode/measurement/marker/image/annotations necessários à prova.
4. Construir G01–G05 exatamente como propostos em `06-execucao.md`: dense grouped spec table; three independent tables; image/caption/notes; marker/compatibility matrix; adversarial.
5. Executar readiness na ordem: render → required fonts loaded → required assets resolved → images decoded successfully → measurement → layout report/preflight → stability check. `setTimeout` não prova readiness. Stability usa dois snapshots `PhysicalLayoutFact` normalizados conforme D3, da mesma árvore/revisão/manifesto, com preflight somente-leitura entre eles e sem timer.
6. Gerar PDF final com Chromium/browser PDF e a mesma árvore editorial do screen. Proibir html2canvas/screenshot/PNG integral/PDFService legado.
7. Inspecionar conteúdo do PDF obrigatoriamente com `pdfjs-dist` já disponível, validar dimensões/páginas/text layer/códigos/unidades/símbolos e confirmar que página/tabela não virou raster integral. Outra ferramenta existente pode complementar inspeção de objetos/visual, mas não substituir esse mínimo. Texto extraível sozinho não basta.
8. Renderizar PNGs **a partir do PDF final** e inspecioná-los. Screenshot de screen é evidência adicional somente para T-PARITY-01.
9. Repetir com safe area warning, physical page bounds error, note longa, image/asset failure, font failure, impossible columns, fixed row overflow, table overflow e geometry stability. Falha deve estar identificada, sem mutação de autoria.
10. Registrar métricas observadas e decisão de viabilidade. Atualizar estado da proposta com achados; qualquer mudança arquitetural segue para revisão Principal, sem ser congelada pelo implementador.

## RED e critérios GREEN

| Caso | Resultado exigido |
|---|---|
| T-PDF-01 | G01–G05 completos, Chromium PDF A4 com número esperado de páginas, text layer, codes, units, symbols, thin borders, page number, images e notes |
| T-PDF-02 | Inspeção do conteúdo PDF confirma ausência de PNG/full-page e PNG/full-table como mecanismo da prova; texto extraível isoladamente não conta como prova |
| T-PARITY-01 | Screen e print/PDF usam `ProofDocument → ProofPage → ProofTable`; mesmos frames/conteúdo semântico, sem renderer editorial paralelo |
| T-GEOMETRY-01 | G02 tem três table objects independentes; modificar A não altera frames B/C |
| T-GEOMETRY-02 | available=100, fixed 70+50, flex min 20 retorna ERROR; nenhuma coluna zero, warning-valid ou escala escondida |
| T-ARITH-01 | Inputs mm idênticos normalizam para os mesmos `PhysicalLengthU`; solver conserva largura em inteiro e produz o mesmo `widthsU` em zoom/viewport diferentes; nenhum epsilon participa |
| T-ARITH-02 | Decimal ordinário/científico, negativos permitidos e ties na quinta casa mm seguem parser D3; soma/produto unsafe falha com `PHYSICAL_ARITHMETIC_OVERFLOW / ERROR`; nenhum epsilon/fallback float |
| T-CELL-CONTENT-SCHEMA | União D4 roundtrip/valida sem `any`; decimal lexeme preservado; marker/asset refs resolvem; wrap/image presentation/caption não entram no valor semântico |
| T-PROJECTION-Q-01 | `frameQ`/`trackQ` seguem D3/D4 em inteiros, largest-remainder/tie-break estável fecha `sum(trackQ)=frameQ`; Q é renderer-only e nunca persistido |
| T-TABLE-BORDER-GEOMETRY-01 | 100 mm 50/50 sem border e com 1pt: tracks invariantes, padding interno, outer paint totalmente inset, nenhuma expansão do frame |
| T-TABLE-BORDER-GEOMETRY-02 | Tracks/rows desiguais e 0.25/1/2pt: thickness Q, outer right/bottom, trailing internal ownership e conflict resolution produzem bounds Q exatos |
| T-TABLE-SPAN-PAINT-01 | colSpan/rowSpan/combinação suprimem todo atomic edge interno cujo dois slots mapeiam ao mesmo anchor `coveredBy`; perímetro permanece |
| T-TABLE-BORDER-PARITY-01 | Screen/print, viewport 900/1500 e DPR 1/2 preservam frame/tracks/rows/paint Q; PDF tem text layer e vector path/fill, sem raster image-paint da tabela |
| T-TEXT-FLOW | Múltiplos runs na mesma linha, run multilinha, sub/sup, lineBreak, mixed styles e technicalCode nowrap produzem records/hash D3; reflow real muda signature |
| T-ROWSPAN-REMAINDER | Deficit inteiro distribui base + remainder nas primeiras rows AUTO/MIN_MM top-to-bottom; FIXED não cresce; overlaps seguem ordem canônica e são determinísticos |
| T-ANNOTATION-SCOPE | Cell aceita note/footnote e rejeita caption; table aceita caption/note/footnote; dangling/wrong-scope retornam códigos exatos D4 |
| T-TABLE-HEADERLESS | Tabela válida com ao menos uma coluna/linha body, zero header rows, roundtrip + validate + render sem `<thead>` ou header sintético quando policy permite |
| T-EDITOR-ZOOM-AUTHORITY-01 | Transform visual `scale(1.25)` pode alterar raw DOMRect da UI, mas measurement e `PhysicalLayoutFact` vêm somente do root transform-free e permanecem Q-idênticos; não corrigir por divisão de zoom |
| T-PAGE-01 | Object fora dos limites físicos da página é ERROR; safe-area violation é WARNING e não reposiciona |
| T-TABLE-HEIGHT-01 | `renderedIntrinsicHeightMm > frame.heightMm` gera `TABLE_CONTENT_OVERFLOW / ERROR` e impede GREEN/PDF final |
| T-ROW-01 | FIXED_MM com conteúdo maior gera `ROW_CONTENT_OVERFLOW / ERROR`; sem grow/shrink/clipping silencioso |
| T-MERGE-01 | Merge fail-closed não descarta dados; `coveredBy`/span inválido falha; unmerge/roundtrip preservam IDs e conteúdo da âncora |
| T-ASSET-01 | Required asset/font ausente é ERROR; broken image falha; nenhum placeholder vazio conta como sucesso |
| T-NOTE-01 | note/footnote/caption possuem IDs estáveis, refs válidas, participam da geometria e aparecem na página correta |
| T-CODE-01 | G05 mantém `06.04.0121-00/IN1P/TA-50N-NH-PB-XXXXXXXXXXXX` com nowrap; overflow diagnostica sem mudar o valor |
| T-STABILITY-01 | Dois snapshots com mesmos `PhysicalLayoutFact` normalizados são STABLE; ruído bruto só é estável se normalizar identicamente; qualquer fato normalizado diferente é `LAYOUT_UNSTABLE / ERROR` |
| T-STABILITY-02 | Reflow real de linha ou mudança de row height altera bounds/textFlowSignature e gera `LAYOUT_UNSTABLE / ERROR` |
| T-STABILITY-03 | Late image intrinsic-size change após readiness altera fato canônico e gera `LAYOUT_UNSTABLE / ERROR` |
| T-STABILITY-04 | Late font/layout change após readiness altera fato canônico e gera `LAYOUT_UNSTABLE / ERROR` |
| T-IMMUTABLE-01 | Hash do documento e todos os authored frames iguais antes/depois de measure, preflight, stability check e export |

No-op: chamar renderer/solver/measurement/preflight/stability/export não muda dados nem frames autorais. Entrada inválida: rejeição localizada, sem normalização criadora de conteúdo. Segurança: resolver somente assets conhecidos, não navegar URLs arbitrárias do JSON; nenhum service-role. Performance: registrar medição, não ocultar tabelas/linhas para atingir resultado.

## Comandos e evidência

```text
npx vitest run tests/vnext/proof
npm run lint:labs
npm run lint
npm run typecheck
npm test
npm run build
node tests/vnext/proof/export-proof.mjs
```

O runner novo deve documentar porta, forma de iniciar/parar o Vite que ele próprio criou, versão do Chromium, versão/uso de `pdfjs-dist` e paths de saída; não matar processos não pertencentes à prova. Se necessário, lintar explicitamente `tests/vnext/proof/export-proof.mjs` fora dos globs atuais.

Entregar: PDF final; PNGs renderizados desse PDF; screenshot screen opcional de parity; matriz conteúdo esperado/extraído; evidência anti-raster de página/tabela; relatório de erros adversariais; font/assets/version manifest; comandos/exit codes; métricas com máquina/condições e diff dos arquivos. Screenshot DOM aprovada sozinha não cumpre a prova do PDF.

## Model-routing review — PROPOSED

Classificação após a closure A–F: **GEMINI-SAFE IMPLEMENTATION PACKET — PRINCIPAL REVIEW REQUIRED.** O executor não escolhe shapes de CellContent, border accounting, layout engine authority, line-flow extraction, rowspan rounding, annotation scope nem decimal arithmetic semantics: D3/D4 fixam esses contratos. Isto não significa Principal GO nem arquitetura congelada. Se a implementação precisar alterar qualquer contrato acima, ampliar arquivos permitidos ou introduzir nova autoridade de domínio/renderização, **STOP** e registrar `SOL_HIGH_REQUIRED DECISION BEFORE IMPLEMENTATION`; nenhuma emenda arquitetural silenciosa é permitida.

## Condições de interrupção e handoff

Parar ampliação de escopo se precisar alterar legado, migrar banco, depender de JSON não tipado, criar renderizador por preset, perder dados em merge ou mudar requisito para caber na página. Registrar contraexemplo e proposta concreta de ajuste. Não “passar” omitindo a fixture difícil.

Handoff: SHA/base, arquivos alterados, decisões comprovadas/refutadas, G01–G05 aprovados/pendentes, gates, local dos artefatos e recomendação para MVP-02. Sem merge/deploy automático.

**LAB PROMOTION RULE — FOUNDATION REQUIRED, PROPOSED:** se FOUNDATION-PROOF-01 receber GO após revisão, MVP-02/próxima fase começa MOVENDO/PROMOVENDO o núcleo comprovado para `src/vnext/domain/`, `src/vnext/render/` e `src/vnext/editor/`. É proibido deixar um lab engine e um production VNext engine evoluírem em paralelo. O próximo pacote recebe o engine comprovado, não a obrigação de inventá-lo novamente.

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

`resolveColumns(table, availableInnerWidthMm)` é função pura e retorna `{ok:true,widths}` ou `{ok:false,code,details}`, sem DOM. Invariantes: width > 0; minWidth respeitado; fixed respeitado; flex usa somente espaço restante; deterministic rounding; conservação de largura. Aritmética obrigatória: `PhysicalLengthU = 0.0001 mm`; mm autoral é normalizado por parsing decimal + round-half-away-from-zero, cálculo usa inteiros seguros, flex weight é inteiro positivo seguro, sucesso exige `sum(widthsU) === availableInnerWidthU`, e resíduo é distribuído por largest remainder (resto decrescente; empate pela ordem estável das colunas) após aplicar caps. Toda soma/produto deve permanecer safe integer; overflow retorna `PHYSICAL_ARITHMETIC_OVERFLOW / ERROR`. Converter de volta a mm somente por `/10_000`; testes comparam `widthsU` exatamente, sem epsilon. Contraexemplo obrigatório: available 100 mm, fixed A 70, fixed B 50, flex C min 20 -> ERROR `TABLE_WIDTH_INFEASIBLE`; jamais valid+warning/C=0. D3/D4 são autoridade dos detalhes de conversão CSS px e das rodadas com max.

`validateTable` verifica stable table/row/column/cell IDs, collision-safe cell key, ao menos uma coluna e uma linha total, topologia completa de células, spans, `coveredBy`, merge fail-closed, `MERGE_WOULD_DISCARD_CONTENT` e annotation refs. Header row **não** é invariante estrutural: tabela headerless com rows body/section é válida quando preset/template/publication policy não exige header. `TableAnnotation {id, kind:'note'|'footnote'|'caption', text}` possui stable ID; cells/table podem referenciar IDs; dangling reference é ERROR; annotation participa da geometria e aparece na página correta.

`ProofDocument → ProofPage → ProofTable` é a única árvore editorial. Screen usa essa árvore; editor futuro adiciona overlays externos; PDF usa a mesma árvore com `@media print`. `T-PARITY-01` rejeita `EditorRenderer != PDFRenderer`.

`ProofTable` recebe modelo e resolvers de assets/fontes, sem store. `layoutReport` identifica page/object/table/cell/annotation de cada defeito e a revisão/manifesto analisados. Conteúdo `technicalCode` nunca muda para caber; G05 usa `wrapPolicy = nowrap` com `06.04.0121-00/IN1P/TA-50N-NH-PB-XXXXXXXXXXXX`.

## Passos

1. Criar fixtures pequenas válidas/inválidas e RED para merge com dados, IDs duplicados, `coveredBy`/span inválido, annotation dangling, coluna inviável, row fixed overflow e table frame overflow.
2. Portar seletivamente operações/validações compatíveis do Table Core, sem imports de legacy adapter/bridge, specialized table engines, A4Canvas ou PageFlow. Reimplementar geometry resolver from lessons.
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
| T-ARITH-02 | Qualquer soma/produto que exceda safe integer falha com `PHYSICAL_ARITHMETIC_OVERFLOW / ERROR`; nenhum fallback float muda o resultado |
| T-TABLE-HEADERLESS-01 | Tabela válida com ao menos uma coluna/linha body, zero header rows, roundtrip + validate + render sem header sintético quando policy permite |
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

Classificação deste pacote após fechamento dos contratos acima: **A. GEMINI-SAFE IMPLEMENTATION PACKET CANDIDATE**. A classificação significa apenas que FOUNDATION-PROOF-01 está bounded o bastante para implementação sem o agente escolher aritmética física, epsilon, igualdade de estabilidade, obrigatoriedade de header, código de erro do solver ou mecanismo mínimo de inspeção PDF. Não significa Principal GO nem arquitetura congelada. Se a implementação encontrar necessidade de alterar esses contratos, ampliar arquivos permitidos ou decidir nova autoridade de domínio/renderização, parar e registrar `SOL_HIGH_REQUIRED DECISION BEFORE IMPLEMENTATION` para revisão Principal.

## Condições de interrupção e handoff

Parar ampliação de escopo se precisar alterar legado, migrar banco, depender de JSON não tipado, criar renderizador por preset, perder dados em merge ou mudar requisito para caber na página. Registrar contraexemplo e proposta concreta de ajuste. Não “passar” omitindo a fixture difícil.

Handoff: SHA/base, arquivos alterados, decisões comprovadas/refutadas, G01–G05 aprovados/pendentes, gates, local dos artefatos e recomendação para MVP-02. Sem merge/deploy automático.

**LAB PROMOTION RULE — FOUNDATION REQUIRED, PROPOSED:** se FOUNDATION-PROOF-01 receber GO após revisão, MVP-02/próxima fase começa MOVENDO/PROMOVENDO o núcleo comprovado para `src/vnext/domain/`, `src/vnext/render/` e `src/vnext/editor/`. É proibido deixar um lab engine e um production VNext engine evoluírem em paralelo. O próximo pacote recebe o engine comprovado, não a obrigação de inventá-lo novamente.

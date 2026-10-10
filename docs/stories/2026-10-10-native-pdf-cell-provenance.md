# Proveniência verificável de células do PDF nativo

Status: In Progress — protótipo CLI somente leitura; validação e associação de fatos pendentes.
Data: 2026-10-10.
Responsáveis: @po/@sm (story), root/@dev (contrato e CLI), @qa (auditoria), @devops (gates/Git).
Base da worktree: main `a1b11b1fdd0dbe2872884a32da3cb9f077d6485b`, tree `13b7a5a8aa19fe88b6e29abf60c2e6aa817fc9b0`.
Worktree isolada: `C:/Users/Usuario/.codex/worktrees/native-pdf-provenance-20261010/catalog-builder`.
Branch: `codex/native-pdf-provenance-20261010`, criada após confirmar CLEAN na base acima. A worktree de integridade continua separada.

## Problema e investigação anterior ao código

O índice do intake acrescenta um espaço após cada item sem EOL. A leitura CLI dos bytes reais do manual PRESYS confirmou que isso quebra palavras, números, sinais e variantes: `Operating R` + `ange` vira `Operating R ange`; `25 to 1` + `55` vira `25 to 1 55`, mesmo com gap de 0,00096 unidade PDF. Páginas físicas 6/7: 326/1183 itens e 272/1138 operações de inserção de espaço; o join diagnóstico reproduz exatamente o índice atual. Fonte intake estável, PDF.js 4.10.38, PDF de 41 páginas não truncado.

Preservar tokens ainda não prova associação: o manual tem cabeçalhos de três modelos, células mescladas, multilinhas, nota externa e glifos PUA. O verifier atômico da [story de integridade](<C:/Users/Usuario/.codex/worktrees/real-pdf-agent-20261010/catalog-builder/docs/stories/2026-10-10-grounded-pdf-condition.md>) deve continuar bloqueando essa associação 2D até haver evidência específica.

[Justificativa completa, limites e recibos CLI](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/PRESYS_NATIVE_GEOMETRY_JUSTIFICATION.md>).

## Resultado e escopo

Acrescentar evidência de regiões/células a intake e proveniência, conferida deterministicamente contra bytes reais. Um fato precisa sustentar modelo exato, rótulo/campo, valor, unidade e condição preenchida por seus runs e vínculo inequívoco de linha/coluna. Não ampliar a tolerância do verifier atômico para aceitar tabelas por substrings.

Preservar modelo canônico, DocumentSession, templates, comandos, editor, persistência e pipeline PDF existentes. Sem extrator geral de tabelas, OCR, normalização de valores, paginação, backend novo, deploy, migração ou merge. Chamadas Google/PRESYS e orçamento R$50 pertencem à [story separada de execução real](<C:/Users/Usuario/.codex/worktrees/real-pdf-agent-20261010/catalog-builder/docs/stories/2026-10-10-real-google-presys-acceptance.md>); não integram esta prova local.

### Checkpoint de implementação somente leitura

Autorização posterior delimitou a primeira etapa: bytes próprios → SHA → páginas selecionadas → runs nativos/coordenadas/fontes/CropBox/rotação → diagnóstico de uma região de baseline única. `LITERAL` significa apenas concatenação intacta de runs touching/overlap; não aceita proposta, associa fatos, preenche canônico ou aprova catálogo. Gap positivo sem separador literal é `UNCERTAIN`, sem tolerância genérica de 0,15. Espaço emitido pelo parser com height zero permanece no snapshot e é `UNCERTAIN` porque pode vir da heurística de distância do PDF.js. Corte de run, PUA selecionado, scan, truncamento, rotação, múltiplas baselines e sobreposição com ordem ambígua são `BLOCKED`.

O leitor usa `disableNormalization:true`. IDs de run referenciam página/índice com SHA do documento; snapshots e estruturas internas são congelados. Hash e parse usam cópias dos bytes antes do primeiro await, e JSON reconstituído não adquire autoridade de snapshot nativo. Bounds são envelopes de métricas de fonte, não glifos/células atestados. AC04–06 e aprovação de fatos permanecem etapa futura.

## Acceptance criteria

- [x] **AC01 — CLI antes de UI.** Preservar diagnóstico inicial e criar prova repetível das páginas físicas 6–7 do manual real: SHA dos bytes, versão/configuração do parser, hash do intake/driver, itens literais e posições. Separar descoberta de aprovação. Nenhuma UI ou resposta de modelo substitui essa prova.
- [ ] **AC02 — Runs intactos.** Intake conserva IDs estáveis por página/ordem, string literal, transform, dimensões, direção, EOL e metadados necessários de página/fontes. Corrigir a fronteira de fragmentos sem inserir espaços artificiais dentro de tokens e sem remover espaços nativos. Não trocar decimal, sinal, símbolo, unidade ou variante. O limiar diagnóstico 0,15 não é regra de aceitação.
- [x] **AC03 — Coordenadas conferíveis.** Regiões/bounding boxes referenciam os runs e sistema de coordenadas declarado. Conferir transform, view/CropBox, rotação e UserUnit; rejeitar índices/caixas não finitos, fora de limites, sem texto ou incompatíveis com a leitura atual. Metadados de posicionamento não são anunciados como limites exatos de glifos sem prova.
- [ ] **AC04 — Proveniência delimitada.** Definir evidência tipada para região/célula e papéis modelo, rótulo, valor, unidade e condição, vinculada a SHA/página/IDs/literais reais. O verificador recompõe a evidência dos bytes; hash/quote/box auto declarados em JSON ou resposta livre não aprovam conteúdo. Importação de demonstração continua sintética.
- [ ] **AC05 — Relação única.** Aceitar apenas a associação de linha/coluna explicitamente comprovada dentro da região delimitada. Conferir cabeçalho de modelo e rótulo de campo contra célula de valor; troca de modelo/campo, sobreposição disputada, célula mesclada ou quebra multilinha não suportada bloqueiam. Não copiar dados de outra coluna/página nem hardcodar valores do manual.
- [ ] **AC06 — Condição e nota.** Condição preenchida deve ter região sustentada e vínculo com o mesmo fato. Uma nota externa exige referência/marcador verificável e inequívoco; se esse caso não for suportado, o fato dependente fica BLOCKED com motivo. Condição vazia continua permitida quando não omite um qualificador necessário à afirmação. Não inferir condição a partir do conhecimento do produto.
- [ ] **AC07 — Falha fechada e estado.** PDF scan, texto insuficiente, truncamento, glifo/unidade sem representação literal confiável ou geometria ambígua ficam BLOCKED. Known/conflict usam as mesmas regras; missing não ganha valor. Falha antecede criação/aplicação/salvamento, preservando documento/proposta anterior e sem fallback para resposta livre.
- [ ] **AC08 — Positivos e ataques.** Fixture original com tabela delimitada prova associação correta e fragmentos contíguos. Negativos cobrem SHA/bytes trocados, IDs/caixas fabricados, valor de outra linha/coluna, sinal/unidade/variante parciais, condição errada, modelo concorrente, mescla ambígua, scan e truncamento. As sete regressões da story de integridade permanecem válidas; nenhum PASS antigo fecha os novos casos.
- [ ] **AC09 — PDF real e limite honesto.** CLI demonstra pelo menos um fato por modelo na tabela real p6 com todos os qualificadores necessários comprovados, ou registra o bloqueio causal e mantém essa parte pendente. P7 distingue Input Ranges/Resolution/Accuracy/Remarks e preserva PUA sem substituição. Prova positiva não pode ser apenas valor curado digitado. Se houver seleção humana de regiões, declarar demonstração assistida, sem alegar extração autônoma.
- [ ] **AC10 — Auditoria e compatibilidade.** QA independente verifica os bytes/regiões e negativos; gates atuais lint/typecheck/testes/build passam antes de conclusão. Provar que a proveniência não muda valores canônicos, histórico, templates ou publicação existentes. Atualizar evidências/checklist/File List; composição editorial e piloto Marc seguem pendentes.

## Checklist

- [x] Investigar runs reais p6–7 e comprovar causa do espaço artificial sem alteração de produto.
- [x] Reinspecionar renders de referência e delimitar fronteiras 2D/multilinha/glifos.
- [x] Criar story antes do contrato/código de geometria.
- [x] Delimitar contrato read-only e positivos/negativos CLI antes de UI.
- [x] Implementar leitor separado, sem alterar intake atômico, proposta ou canônico.
- [x] Registrar os bloqueios das 11 regiões reais sem alegar fatos aprovados.
- [x] Auditoria independente focada; testes focados, lint, typecheck e build do SHA atual.
- [x] Atualizar evidências e lista real de arquivos.
- [ ] Associação de fatos e AC04–09 completos em contrato/story separados.
- [ ] Suíte completa, CI e GO Git do commit futuro; aprovação de publicação e piloto Marc.

## File List

Arquivos reais desta etapa, todos novos na worktree isolada:

- `docs/stories/2026-10-10-native-pdf-cell-provenance.md`
- `docs/stories/2026-10-10-native-pdf-artifact-roles.md`
- `src/vnext/ai-catalog/pdf-native-provenance.ts`
- `scripts/native-pdf-provenance.mjs`
- `tests/vnext/ai-catalog/native-pdf-fixture.ts`
- `tests/vnext/ai-catalog/pdf-native-provenance.test.ts`
- `tests/vnext/ai-catalog/qa-native-reader.test.ts` — QA independente, não editado pelo implementador.

Artefatos externos de investigação, sem mudança do produto:

- `C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/po-presys-native-geometry-diagnostic.mjs`
- `C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/PRESYS_NATIVE_GEOMETRY_JUSTIFICATION.md`
- `C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/presys-native-geometry/result.json` e dumps de runs/linhas p6–7.

`src/vnext/ai-catalog/pdf-intake.ts`, canônico, histórico, templates e publicação permaneceram intactos. O leitor novo importa apenas os limites e a configuração do worker desse intake existente. A associação revisável 2D pertence à nova story da worktree composition e não está implementada por este checkpoint.

## Checkpoint

2026-10-10: CLI e API read-only implementados na branch isolada, após esta story. O [checkpoint atual](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/native-prototype-cli/gates-artifact/result.json>) tem 30 testes focados PASS, typecheck PASS, lint PASS (0 erros, 269 warnings) e build PASS, com hashes estáveis antes/depois. Suíte completa e CI atuais continuam pendentes; nenhum commit/push/merge foi autorizado nesta etapa.

AC02 foi demonstrado no leitor diagnóstico e em fixtures, mas o índice do intake existente não foi alterado. AC04–08 de fatos não estão implementados. AC09 tem recibo causal de bloqueio, sem prova positiva por modelo: o [manual final](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/native-prototype-cli/manual-final/result.json>) preserva 326/1183 runs, mapping plain/marked exato e bytes originais. As 11 regiões curadas são BLOCKED por envelopes conservadores que cruzam runs de linhas vizinhas. A classificação de microgaps/PUA posteriores não foi alcançada nessas regiões; seus guards são cobertos pelas fixtures. [Resultados e limites completos](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/NATIVE_PDF_READER_RESULTS.md>).

O leitor não atesta clipping, invisibilidade ou limites de glifos; `LITERAL` em fixtures prova apenas concatenação íntegra de runs. Nenhuma chamada de modelo, aprovação de fatos ou catálogo ocorreu. Correção de integridade e futura ponte revisável estão separadas. A preferência por múltiplos blocos e melhor ocupação do espaço continua prioridade editorial futura; não há validação humana de Marc.

# Father-Ready — Onda 1 (vitórias visíveis)

Status: InReview — integração local concluída em 2026-10-16 com os portões verdes. Push, PR e merge aguardam o "OK onda 1" do dono; nada foi enviado.
Plano: [docs/plans/2026-10-15-plano-father-ready.md](../plans/2026-10-15-plano-father-ready.md), §4 "Onda 1".
Branch de integração: `claude/father-ready-20261014` (só local). Base das fatias: `dad3149`; plano em `66ab275`.
Substitui: `docs/stories/2026-10-13-father-ai-import.md`, `2026-10-13-father-authoring.md` e `2026-10-13-father-persistence.md`.

## Merges (ordem do plano, `git merge --no-ff`)

| # | Fatia | Cabeça da fatia | Merge | Conflitos |
|---|---|---|---|---|
| 1 | 1C Editor seguro | `a57dc94` | `d0fa252` | nenhum |
| 2 | 1F Tabelas rápidas | `ee19fe5` | `dd0719a` | nenhum |
| 3 | 1D Publicar confiável | `3d6a749` | `f6833db` | nenhum |
| 4 | 1I Zoom | `1084a74` | `df42fcc` | bloco de imports de `EditorWorkspace.tsx` (1D × 1I): mantidos os dois |
| 5 | 1A Entrada e criação | `240171b` | `31d7b46` | nenhum |
| 6 | 1B IA sem chave | `f4bf337` | `d166eec` | nenhum |
| 7 | 1E Fotos e recuperação | `9cf688c` | `a67b139` | nenhum |
| 8 | 1G Importação (módulo) | `e18ad82` | `a453c79` | nenhum |
| 9 | 1H Fatos e paginador (módulos) | `c09f272` | `00e6525` | nenhum |
| 10 | 1J Spike de extração | `08e8a9e` | `b986a2e` | nenhum (já continha a 1H) |

O `ZoomControl` (1I) ficou logo depois de "Página X de Y" em `.vnext-canvas-meta`, antes do contador de problemas (1D).

## Fatias e FRs

### 1C — Editor não trava, páginas e teclado
- [x] FR-10 (parte 1C) — X, Y, Largura e Altura aceitam vírgula; valor inválido volta ao anterior com aviso ao lado do campo; nenhum campo trava o editor.
- [x] FR-11 — menu "⋯" por página: Duplicar, Mover para cima/baixo, Excluir com confirmação; tudo volta com Desfazer.
- [x] FR-19 — Delete/Backspace, setas, Ctrl+D só agem com o objeto da página focado; Ctrl+S salva e explica quando não dá.
- Fica para a 2D: "Padding (mm)", "Redefinir todo padding", "Gesto cancelado." (jargão anterior à fatia).

### 1F — Tabelas rápidas
- [x] FR-31 — tabela nova 6 × 3 com cabeçalho, estilo "Especificação técnica" e largura útil; Ctrl+V do Excel cria a tabela; "Colar tabela do Excel"; "Adicionar N linhas e colar".
- [x] FR-32 — linhas de seção legíveis (contraste ≥ 4,5 em todos os estilos e paletas testados).
- [x] FR-22 (só o exemplo da caixa "Colar"; o resto do FR-22 é da 2A).
- Não conferido à mão: colar um bloco 12 × 4 do Excel real numa página vazia no navegador do pai.

### 1D — Publicar confiável
- [x] FR-12 — mensagens flutuam abaixo da barra de cima; sucesso some em 4 s, erro fica até fechar.
- [x] FR-13 — "Corrigir este item" leva à página e ao objeto, com foco; lista de problemas de todas as páginas.
- [x] FR-43 (texto seguro) — conflito mostra "Salvar meu trabalho como cópia" primeiro. O diálogo bloqueante é da 2G.
- [x] FR-50 — "Publicar / PDF" salva antes de abrir a revisão ("Salvando…").
- [x] FR-51 — "A COMPLETAR", "TBD", "XXX"… bloqueiam o PDF com o local exato.
- [x] FR-52 — instrução de impressão em 1 linha. Falta o checklist J8 no PC do pai.

### 1I — Zoom básico e medição de DPR
- [x] FR-16a — "Ajustar à largura" (padrão), 75 %, 100 %, 125 % e Ctrl+roda; a escolha fica guardada.
  Medição de DPR rodada na integração: `PROOF_DPR_MEASURE=1.25,1.5 node tests/vnext/proof/export-proof.mjs` → **NO_FALSE_BLOCK** (12 linhas: DPR 1 / 1,25 / 1,5 × larguras 900 / 1500 × tela / impressão, todas READY, 0 divergências de geometria). Chromium 151 com `deviceScaleFactor`; isso aproxima, mas não é igual à escala real do Windows. Insumo para decidir o FR-53.
- A 2C (FR-16b) deve partir de `use-stage-zoom.ts` e das regras `--vnext-stage-unzoom`, e decidir o tamanho final das alças (a integração limitou as bordas a 12 px e os seletores a 24 px, encolhendo abaixo de 100 %).

### 1A — Entrada e criação
- [x] FR-01 — com login, qualquer endereço leva a "Meus catálogos" (/v2); o clássico só com `?classico=1`.
- [x] FR-02 — "Nome do catálogo" primeiro; renomear clicando no título.
- [x] FR-04 (parte 1A) — "Arquivar" no menu "Mais"; arquivado tem "Duplicar". "Restaurar" é da 4D.
- [x] FR-06 — sair do editor sempre explica o motivo quando não dá.
- [x] FR-08 — "Verificar criação" nunca cria outro catálogo; busca local com 300 ms.
- [ ] FR-03 — feito o lado vite + CI (o protótipo saiu do build de produção). Falta o 404: `vercel.json` ainda reescreve `/ai-catalog-prototype.html` para o index (ação do dono).

### 1B — IA liga sem chave
- [x] FR-60 — composer usa a chave do servidor; "Avançado (chave própria)". Vale em produção só depois do deploy.
- [x] FR-61 — respostas limitadas, segunda tentativa curta, erros em português; sonda real 8/8.
- [ ] FR-62 — migração `00028` escrita e testada só estaticamente; **não aplicada**; tetos aguardam o dono.
- [x] FR-86 — tradução e composer em `gemini-3.5-flash-lite` (registro único). Vale em produção depois do deploy.
- [x] FR-73 (parte texto).

### 1E — Fotos e recuperação
- [x] FR-40 — foto de celular endireitada e reduzida; HEIC explicado. Na integração o seletor passou a aceitar `.heic/.heif`, para a mensagem aparecer sem trocar o filtro.
- [x] FR-41 (parte 1E) — o PDF só exige as fotos em uso.
- [x] FR-42 — a recuperação só bloqueia pelo catálogo aberto; textos de "cópia de segurança neste computador".

### 1G — Importação robusta (módulo, sem tela)
- [x] FR-65 — módulo pronto e testado. **Não verificado com o pai**: ele só vê isso quando a 2E (FR-64) ligar a área de soltar arquivos.

### 1H — Contrato, verificador e paginador (módulos)
- [x] FR-67 — valor só sai "conferido" quando o texto da página o liga ao modelo, à linha e à unidade.
- [x] FR-35 (porte do paginador, sem UI; o botão é da 2I).

### 1J — Spike de extração
- [x] FR-66a — GO: 0 valores errados como VERIFIED em 18 chamadas reais. Lacuna: a tabela comum aos 3 modelos (manual TA p. 6) não sai; condição 5 do relatório para a 2F.

## Correções feitas na integração

| Commit | O quê | Por quê |
|---|---|---|
| `0b4018c` | Seletor de foto aceita `.heic/.heif` (`EditorWorkspace.tsx`, 1 linha) + teste | A mensagem de HEIC da 1E não aparecia no fluxo normal |
| `209e50c` | Bordas de linha/coluna da tabela: 12 px na tela a partir de 100 %, no máximo 12 px da página abaixo disso; `w3i` busca o botão do modelo pelo nome exato | No celular a borda cobria a célula inteira (provas editor-table-cell, -merge, -bulk); o menu "Mais ações de …" da 1A casava com a busca da prova |
| `d577618` | Fixtures `w4f4`/`w4f5` resolvem fotos com `{ authLineage }`, como o `bootstrap.tsx` | Falhavam já na base `dad3149` (ASSET_REVISION_CHANGED depois de reabrir) |
| `a7e9a7e` | `PublishAction` marca "montado" a cada montagem; grupo da direita da linha de cima com largura reservada; seletores de linha/coluna encolhem abaixo de 100 % | Em StrictMode a revisão nunca abria ("Salvando…" para sempre); a linha de cima quebrava e a folha descia 36 px no meio de um arraste; seletores cobriam a linha vizinha no celular |
| `ba0365b` | `p2` busca o modelo PRESYS pelo nome exato | Mesmo caso do menu "Mais ações de …" |

## Evidência de testes

Rodado na integração, em sequência, em `ba0365b` (antes: espaço livre em C: 14 GB; no fim: 13 GB).

| Portão | Resultado |
|---|---|
| `npm run lint` | 0 erros, 268 avisos (base `dad3149`: 0 erros, 269 avisos → −1) |
| `npm run typecheck` | 0 erros |
| `npm test` (6 processos) | 372 arquivos, 4446 testes passaram, 1 pulado, 0 falhas (132 s) |
| `npm run build` | ok; `dist/ai-catalog-prototype.html` não existe (FR-03) |
| Build E2E (`VITE_E2E_BUILD=true BUILD_OUT_DIR=dist/e2e`) | ok; `dist/e2e/ai-catalog-prototype.html` existe |
| Sintaxe Edge (esbuild) | composer e tradução: PASS |

Depois de cada merge: `npx tsc --noEmit` sem erros e os testes da fatia (1C+1F: 11 arquivos/201; 1D: 27/320; 1I: 11/186; 1A: 20/286; 1B: 30/641; 1E: 34/346; 1G: 6/79; 1H: 19/280; 1J: 3/90 — todos passaram).

**Provas Chromium/Edge do `quality-gates.yml`: todas as 47 execuções do CI passaram**, uma por vez, sobre o código final (as do passo principal e `p2` depois de `ba0365b`; as demais depois de `a7e9a7e`, cujo commit seguinte só muda a prova `p2`):
- passo "VNext Chromium and PDF proofs" (29): editor-text, editor-direct-manipulation, editor-asset-insert, editor-snapping-diagnostics, editor-template-insertion, editor-group, group-export, export, w3g-asset-persistence, w3h-autosave-concurrency, w3i-father-browser-flow, editor-table-axis, editor-table-cell, editor-table-merge, editor-table-bulk, editor-table-fit-height, editor-table-professional-dimensions, editor-table-professional-style, editor-table-semantic-content, editor-standalone-image-professional-authoring, editor-object-arrangement-locking, editor-w4-wave4-closeout, productization-p1a, -p1b, -p1c, w5a, pilot-a, pilot-b, l1-authority-loss;
- pilot-c1, w5b, w5c, p2, father-large-catalog, father-translation-batching, six-model-comparison, gemini-multiturn, native-pdf-cell-fill, agent-native-full-workflow, inline-assistant, byok-agent-conversation, provider-byok-device, real-pdf-local-index, advanced-table-matrix (Chromium + Edge, 442 s);
- no build E2E final: ai-catalog-prototype (Chromium e Edge) e long-institutional (27 páginas, 1512 células).
- Fora do CI, pedidas pelas fatias: w3e-catalog-library, w3f-starter-duplicate, w3d-physical-recovery — passaram. Medição de DPR (1I) — NO_FALSE_BLOCK.

Falhas encontradas na primeira rodada e corrigidas (ver "Correções feitas na integração"): w3i e p2 (busca casava com o menu "Mais ações de …" da 1A); editor-table-cell, -merge, -bulk (bordas cobrindo a célula no celular); editor-table-professional-dimensions (folha descendo 36 px e seletores sobrepostos no celular); productization-p1c (revisão não abria em StrictMode); editor-standalone-image e editor-object-arrangement-locking (fixtures; já falhavam na base `dad3149`, conferido no worktree da 1G).

Nenhuma prova nova foi criada pelas fatias, então nada foi registrado a mais no `quality-gates.yml` (o modo de DPR da `export-proof` é opcional e só entra no CI depois da decisão do FR-53).

Não feito: jornadas no app real `/v2` com login e Supabase (Preview ou produção), checklist J8 de impressão, verificação com o pai.

## Desvios de escopo aceitos

- 1B tocou `src/vnext/translation/{response-validation,candidate,contracts}.ts` (1–2 linhas cada) para tolerar respostas `gemini-2.5-flash` do gateway ainda no ar. Remover `gemini-2.5-flash` de `GEMINI_RETIRED_TRANSLATION_MODELS` depois do deploy da tradução.
- 1E tocou `src/vnext/app/image-upload.ts` (2 linhas, mensagem HEIC).
- 1A tocou `src/vnext/app/bootstrap.tsx` (linhas 141-142, botão principal "Tentar novamente").
- 1C mexeu fora das faixas declaradas (imports, guardas do título da tabela, campos de padding), sem sobrepor outras fatias.
- Integração: 1 linha em `EditorWorkspace.tsx`, `styles.css` (dono 1I), `PublishAction.tsx` (1D), provas e fixtures.
- `EditorWorkspace.tsx`: +118 linhas líquidas na onda inteira contra `dad3149` (+326/−208); nenhuma fatia passou de 150.
- `application/contracts.ts` e `execute.ts` não foram tocados.

## O que fica para depois (achados menores das revisões)

- 1F: tabela aumentada por "Adicionar N linhas e colar" não ajusta a altura sozinha; cabeçalho detectado por engano quando a 1ª linha tem códigos de modelo; Ctrl+V fora da página é ignorado sem aviso; rótulo "… e 1 coluna e colar".
- 1D: o tom da mensagem ainda é deduzido da frase; a mensagem flutuante pode cobrir "Página X de Y" por 4 s.
- 1I: zoom não mantém o ponto sob o cursor; barra de texto pode passar da página em colunas da direita (16b/2C).
- 1A: renomear o botão "Catálogos" para "Meus catálogos" (costura 2.0); `&classico=1` no `ExportPDFModal`.
- 1B: um pedido novo descarta a proposta anterior antes da resposta; texto digitado some se o painel fechar com pedido em andamento; `aria-label` com jargão em `ProviderCredentialsSettings`; "Avançado" aparece mesmo com `byok:false`; RPCs da 00028 executáveis por editor (rever antes de aplicar).
- 1E: fotos de celular enviadas antes desta onda podem precisar de reenvio (medidas); nomes misturados na tela de recuperação.
- 1G: heurística de colunas de preço; ainda sem tela.
- 1H: motivos não aparecem na tela (FR-68); `vnext-catalog-agent` ainda exige 2 modelos (2F).
- 1J: condição 5 (tabela comum aos modelos, manual p. 6) e normalização da fonte Symbol só para trechos dessa fonte.

## Ações pendentes do dono (Gabriel)

1. Autorizar push, PR e merge da Onda 1 ("OK onda 1"). Merge em `main` publica produção pelo Vercel.
2. Seguir a sequência de deploy da 1B (abaixo).
3. Aprovar os tetos de IA (proposta: US$ 0,50 por chamada, US$ 3 por usuário por dia, US$ 60 por mês) e criar alerta de orçamento no Google Cloud.
4. Trocar a chave Gemini temporária por uma chave paga de produção e revogar a temporária **antes da primeira sessão com o pai**.
5. FR-03: em `vercel.json`, antes do catch-all, `{ "source": "/ai-catalog-prototype.html", "destination": "/__removido" }`; conferir com `curl -I` depois do deploy.
6. J8: imprimir no PC do pai (Chrome e Edge, 100 % e 125 %).
7. Jornadas sem IA no Preview (FR-93), depois do push: foto real de celular até o PDF READY (J6); sobra de recuperação no catálogo A e abrir o B (J7); criar com nome, renomear, arquivar e duplicar (J11); colar 12 × 4 do Excel; vírgula em X/Y; excluir/mover página com Ctrl+Z; Publicar → "Corrigir este item".
8. Informar o tempo máximo das Edge Functions do plano Supabase (FR-66; a chamada mais lenta do spike levou 27 s).
9. Indicar quem da engenharia PRESYS decide as divergências do TA (faixa 155 × 140 °C, ambiente 23 × 20 °C, alimentação 115/230 × 110/220 V).

## Sequência de deploy da 1B (só depois do merge em `main`)

1. Merge do cliente. Ele tolera o composer e a tradução antigos, então o merge pode vir antes do deploy.
2. Dono confere o ledger (`select version from supabase_migrations.schema_migrations order by version desc limit 5;`) e aplica a `00028` (de preferência antes num banco de teste). Ela é aditiva e compatível com o que está no ar. Só então ligar `VNEXT_CATALOG_AGENT_BUDGET_MODE=settled`.
3. Como a 0D concluiu que `GEMINI_API_KEY` já existe: gravar `VNEXT_COMPOSER_GEMINI_API_KEY` e `VNEXT_TRANSLATION_GEMINI_API_KEY` (opcional; sem eles as funções usam `GEMINI_API_KEY`). Não sobrescrever `GEMINI_API_KEY`.
4. Deploy de `vnext-catalog-composer` e `vnext-translation-provider` a partir do SHA mergeado: `functions deploy … --use-api`, sem `--no-verify-jwt` nem `--prune`; ler o hash de volta e conferir que o bundle inclui os imports relativos de `src/vnext/ai-catalog`.
5. J-IA1 em produção ("Criar com Gemini" sem chave pessoal, mostrando "IA pronta.") e uma tradução real PT→EN.

Se a `00028` atrasar, a 1B sai com o modo de orçamento atual (00027): cerca de 12 pedidos por dia por pessoa.

**Rollback** (definido antes do merge): front — o dono promove o deploy anterior no painel do Vercel; Edge — reimplantar o SHA anterior e ler o hash de volta; banco — migrações aditivas não exigem rollback.

## File List

Todos os arquivos alterados na onda (`git diff --name-status 66ab275 HEAD`), mais esta story. As 36 respostas salvas do spike em `docs/ai-catalog/spike-extracao/respostas/prompt-v{1,2}/raw/*.json` (novas, sem chave) foram omitidas da lista.

- `docs/stories/2026-10-15-father-ready-onda-1.md` (novo)
- `.github/workflows/quality-gates.yml` (alterado)
- `docs/ai-catalog/SPIKE_EXTRACAO_20261015.md` (novo)
- `docs/ai-catalog/spike-extracao/gabarito.json` (novo)
- `docs/ai-catalog/spike-extracao/plan.json` (novo)
- `scripts/extract-facts-eval.ts` (novo)
- `scripts/extract-facts.ts` (novo)
- `scripts/probe-composer.mjs` (novo)
- `src/App.tsx` (alterado)
- `src/components/auth/root-entry.ts` (novo)
- `src/components/common/Navbar.tsx` (alterado)
- `src/vnext/ai-catalog/CatalogNativeComposer.tsx` (alterado)
- `src/vnext/ai-catalog/CatalogWorkbenchChat.tsx` (alterado)
- `src/vnext/ai-catalog/ProviderCredentialsSettings.tsx` (alterado)
- `src/vnext/ai-catalog/byok-session.ts` (novo)
- `src/vnext/ai-catalog/composer-codes.ts` (novo)
- `src/vnext/ai-catalog/composer-contract.ts` (novo)
- `src/vnext/ai-catalog/composer-framing.ts` (novo)
- `src/vnext/ai-catalog/composer-messages.ts` (novo)
- `src/vnext/ai-catalog/contracts.ts` (alterado)
- `src/vnext/ai-catalog/excel-display-format.ts` (novo)
- `src/vnext/ai-catalog/fact-extraction.ts` (novo)
- `src/vnext/ai-catalog/fact-verifier.ts` (novo)
- `src/vnext/ai-catalog/gemini-models.ts` (novo)
- `src/vnext/ai-catalog/gemini-plan.ts` (alterado)
- `src/vnext/ai-catalog/native-compose-client.ts` (alterado)
- `src/vnext/ai-catalog/native-compose.ts` (alterado)
- `src/vnext/ai-catalog/native-text-edit.ts` (alterado)
- `src/vnext/ai-catalog/pdf-grounded-input.ts` (alterado)
- `src/vnext/ai-catalog/pdf-intake.ts` (alterado)
- `src/vnext/ai-catalog/pdf-layout-evidence.ts` (novo)
- `src/vnext/ai-catalog/pdf-literal-evidence.ts` (alterado)
- `src/vnext/ai-catalog/prototype-entry.tsx` (apagado)
- `src/vnext/ai-catalog/provider-vault.ts` (alterado)
- `src/vnext/ai-catalog/source-grid.ts` (novo)
- `src/vnext/ai-catalog/source-intake.ts` (alterado)
- `src/vnext/app/CatalogLibrary.tsx` (alterado)
- `src/vnext/app/EditorWorkspace.tsx` (alterado)
- `src/vnext/app/PublicationReview.tsx` (alterado)
- `src/vnext/app/RecoveryCenter.tsx` (alterado)
- `src/vnext/app/VNextApp.tsx` (alterado)
- `src/vnext/app/bootstrap.tsx` (alterado)
- `src/vnext/app/catalog-navigation.ts` (alterado)
- `src/vnext/app/editor-defaults.ts` (alterado)
- `src/vnext/app/editor/CatalogTitleButton.tsx` (novo)
- `src/vnext/app/editor/EditorNotices.css` (novo)
- `src/vnext/app/editor/EditorNotices.tsx` (novo)
- `src/vnext/app/editor/InspectorNumberField.css` (novo)
- `src/vnext/app/editor/InspectorNumberField.tsx` (novo)
- `src/vnext/app/editor/IssuesPanel.css` (novo)
- `src/vnext/app/editor/IssuesPanel.tsx` (novo)
- `src/vnext/app/editor/LibraryNavigationNotice.tsx` (novo)
- `src/vnext/app/editor/LibraryRowMenu.tsx` (novo)
- `src/vnext/app/editor/PagePanel.css` (novo)
- `src/vnext/app/editor/PagePanel.tsx` (novo)
- `src/vnext/app/editor/PasteTableArea.css` (novo)
- `src/vnext/app/editor/PasteTableArea.tsx` (novo)
- `src/vnext/app/editor/PublishAction.tsx` (novo)
- `src/vnext/app/editor/ZoomControl.tsx` (novo)
- `src/vnext/app/editor/entry-and-title.css` (novo)
- `src/vnext/app/editor/issue-fixes.ts` (novo)
- `src/vnext/app/editor/table-paste-actions.ts` (novo)
- `src/vnext/app/editor/use-issue-navigation.ts` (novo)
- `src/vnext/app/editor/use-stage-zoom.ts` (novo)
- `src/vnext/app/image-upload.ts` (alterado)
- `src/vnext/app/publication-diagnostic-presentation.ts` (alterado)
- `src/vnext/app/recovery-presentation.ts` (novo)
- `src/vnext/app/styles.css` (alterado)
- `src/vnext/application/table-preset-registry.ts` (alterado)
- `src/vnext/asset/bridge.ts` (alterado)
- `src/vnext/asset/exif-orientation.ts` (novo)
- `src/vnext/asset/normalize-image.ts` (novo)
- `src/vnext/asset/referenced-assets.ts` (novo)
- `src/vnext/asset/sniff.ts` (alterado)
- `src/vnext/editor/decimal-ptbr.ts` (novo)
- `src/vnext/editor/editor-keyboard.ts` (novo)
- `src/vnext/editor/editor-notices.ts` (novo)
- `src/vnext/editor/inspector-frame-draft.ts` (novo)
- `src/vnext/editor/page-summary.ts` (novo)
- `src/vnext/editor/stage-zoom.ts` (novo)
- `src/vnext/editor/table-paste-import.ts` (novo)
- `src/vnext/library/service.ts` (alterado)
- `src/vnext/publication/preflight.ts` (alterado)
- `src/vnext/recovery/session-manager.ts` (alterado)
- `src/vnext/recovery/startup.ts` (alterado)
- `src/vnext/rendering/resources.ts` (alterado)
- `src/vnext/table/table-pagination.ts` (novo)
- `src/vnext/translation/candidate.ts` (alterado)
- `src/vnext/translation/contracts.ts` (alterado)
- `src/vnext/translation/language-registry.ts` (alterado)
- `src/vnext/translation/response-validation.ts` (alterado)
- `supabase/functions/vnext-catalog-composer/index.ts` (alterado)
- `supabase/functions/vnext-translation-provider/index.ts` (alterado)
- `supabase/migrations/00028_vnext_ai_budget_settlement.sql` (novo)
- `tests/app/root-redirect.test.tsx` (novo)
- `tests/integration/active-editing-keyboard-composition-c23.test.tsx` (alterado)
- `tests/scripts/extract-facts-eval.test.ts` (novo)
- `tests/vnext/ai-catalog/ai-budget-settlement-migration.test.ts` (novo)
- `tests/vnext/ai-catalog/catalog-native-composer.test.tsx` (alterado)
- `tests/vnext/ai-catalog/catalog-native-selected-rewrite.test.tsx` (alterado)
- `tests/vnext/ai-catalog/catalog-workbench-chat.test.tsx` (alterado)
- `tests/vnext/ai-catalog/composer-client-contract.test.ts` (novo)
- `tests/vnext/ai-catalog/composer-edge-bounded.test.ts` (alterado)
- `tests/vnext/ai-catalog/excel-display-format.test.ts` (novo)
- `tests/vnext/ai-catalog/fact-extraction.test.ts` (novo)
- `tests/vnext/ai-catalog/fact-verifier.test.ts` (novo)
- `tests/vnext/ai-catalog/native-pdf-cell-fill.test.ts` (alterado)
- `tests/vnext/ai-catalog/own-key-settings-screen.test.tsx` (novo)
- `tests/vnext/ai-catalog/pdf-grounded-input.test.ts` (alterado)
- `tests/vnext/ai-catalog/pdf-grounding-boundary.test.ts` (alterado)
- `tests/vnext/ai-catalog/pdf-intake.test.ts` (alterado)
- `tests/vnext/ai-catalog/qa-native-ui-cancellation.test.tsx` (alterado)
- `tests/vnext/ai-catalog/qa-pdf-literal-ambiguity.test.ts` (alterado)
- `tests/vnext/ai-catalog/source-intake.test.ts` (novo)
- `tests/vnext/app/catalog-navigation.test.ts` (alterado)
- `tests/vnext/app/catalog-title-button.test.tsx` (novo)
- `tests/vnext/app/editor-notices.test.tsx` (novo)
- `tests/vnext/app/editor-zoom-integration.test.tsx` (novo)
- `tests/vnext/app/father-editor-safety.test.tsx` (novo)
- `tests/vnext/app/issues-panel.test.tsx` (novo)
- `tests/vnext/app/library-navigation-notice.test.tsx` (novo)
- `tests/vnext/app/page-panel.test.tsx` (novo)
- `tests/vnext/app/paste-table-area.test.tsx` (novo)
- `tests/vnext/app/publish-action.test.tsx` (novo)
- `tests/vnext/app/recovery-center-father.test.tsx` (novo)
- `tests/vnext/app/retry-primary-action.test.tsx` (novo)
- `tests/vnext/app/table-paste-actions.test.ts` (novo)
- `tests/vnext/app/zoom-control.test.tsx` (novo)
- `tests/vnext/application/editor-workspace.test.tsx` (alterado)
- `tests/vnext/application/image-upload-ui.test.tsx` (alterado)
- `tests/vnext/application/pilot-a-authorship-trust.test.tsx` (alterado)
- `tests/vnext/application/table-paste-create.test.tsx` (novo)
- `tests/vnext/application/table-preset-contrast.test.ts` (novo)
- `tests/vnext/application/w3c-editor-persistence.test.tsx` (alterado)
- `tests/vnext/application/w3d-startup-race.test.tsx` (alterado)
- `tests/vnext/asset/fixtures/phone-portrait-orientation-6.jpg` (novo)
- `tests/vnext/asset/fixtures/plain-landscape.jpg` (novo)
- `tests/vnext/asset/fixtures/upright-portrait.jpg` (novo)
- `tests/vnext/asset/image-normalization.test.ts` (novo)
- `tests/vnext/editor/decimal-ptbr.test.ts` (novo)
- `tests/vnext/editor/editor-keyboard.test.ts` (novo)
- `tests/vnext/editor/stage-zoom.test.ts` (novo)
- `tests/vnext/editor/table-paste-import.test.ts` (novo)
- `tests/vnext/library/catalog-library-entry.test.tsx` (novo)
- `tests/vnext/library/catalog-library-open-recovery.test.tsx` (alterado)
- `tests/vnext/library/catalog-library-service.test.ts` (alterado)
- `tests/vnext/library/catalog-library-ui.test.tsx` (alterado)
- `tests/vnext/proof/advanced-table-matrix-proof.mjs` (alterado)
- `tests/vnext/proof/agent-native-full-workflow-proof.mjs` (alterado)
- `tests/vnext/proof/ai-catalog-prototype-proof.mjs` (alterado)
- `tests/vnext/proof/editor-direct-manipulation-proof.mjs` (alterado)
- `tests/vnext/proof/editor-snapping-diagnostics-proof.mjs` (alterado)
- `tests/vnext/proof/editor-template-insertion-proof.mjs` (alterado)
- `tests/vnext/proof/editor-text-proof.mjs` (alterado)
- `tests/vnext/proof/export-proof.mjs` (alterado)
- `tests/vnext/proof/fixtures/agent-full-workflow-browser.tsx` (alterado)
- `tests/vnext/proof/fixtures/content-placeholders.mjs` (novo)
- `tests/vnext/proof/fixtures/inline-assistant-editor-entry.tsx` (alterado)
- `tests/vnext/proof/fixtures/w4f4-editor-browser.tsx` (alterado)
- `tests/vnext/proof/fixtures/w4f5-editor-browser.tsx` (alterado)
- `tests/vnext/proof/inline-assistant-browser-proof.mjs` (alterado)
- `tests/vnext/proof/p2-multilingual-translation-center-proof.mjs` (alterado)
- `tests/vnext/proof/pilot-a-authorship-trust-proof.mjs` (alterado)
- `tests/vnext/proof/pilot-c1-official-starter-proof.mjs` (alterado)
- `tests/vnext/proof/productization-p1c-product-coherence-proof.mjs` (alterado)
- `tests/vnext/proof/w3d-physical-recovery-proof.mjs` (alterado)
- `tests/vnext/proof/w3e-catalog-library-proof.mjs` (alterado)
- `tests/vnext/proof/w3h-autosave-concurrency-proof.mjs` (alterado)
- `tests/vnext/proof/w3i-father-browser-flow-proof.mjs` (alterado)
- `tests/vnext/proof/w5b-translation-review-copy-proof.mjs` (alterado)
- `tests/vnext/proof/w5c-publication-review-proof.mjs` (alterado)
- `tests/vnext/publication/content-preflight.test.ts` (novo)
- `tests/vnext/publication/publication-dialog.test.tsx` (alterado)
- `tests/vnext/publication/publication-editor-integration.test.tsx` (novo)
- `tests/vnext/publication/publication-presentation.test.ts` (alterado)
- `tests/vnext/recovery/recovery-open-catalog-scope.test.ts` (novo)
- `tests/vnext/rendering/resources-used-assets.test.ts` (novo)
- `tests/vnext/table/table-pagination.test.ts` (novo)
- `tests/vnext/translation/p2-server-gateway-runtime.test.ts` (alterado)
- `tests/vnext/translation/server-gateway-contract.test.ts` (alterado)
- `tests/vnext/translation/translation-model-registry.test.ts` (novo)
- `vite.config.ts` (alterado)

# Provas locais da integração — 2026-10-18

Story: `docs/stories/2026-10-17-father-ready-continuacao.md` (AC4–AC6).
Runner: `scripts/verify-father-ready-proof-gates.mjs`.

## Estado desta preparação

O runner foi preparado para a continuação local no worktree
`C:/Users/Usuario/.codex/worktrees/father-ready-continuacao/catalog-builder`.
Esta etapa não executou provas, navegador, build nem testes. A validação
`node --check scripts/verify-father-ready-proof-gates.mjs` passou, com código de
saída 0. O executor registra abaixo as execuções reais a partir dos recibos.

As provas são regressão em harness local, com fixtures, persistência controlada e
provedores simulados onde definidos pelos drivers. PDFs são gerados localmente.
Mesmo os drivers com `*_PRODUCTION=1` verificam um bundle E2E local; isso não
comprova produção, Gemini real, autenticação/Supabase reais, segunda conta nem
aceite observado. As jornadas em 1366/1280 permanecem uma rodada separada.

## Inventário derivado do workflow

Na preparação, `.github/workflows/quality-gates.yml` tem 47 chamadas diretas
`node tests/vnext/proof/*.mjs`, em 46 arquivos. O runner as descobre em ordem,
preserva o `env` literal de cada step e das atribuições antes de `node`, e
deduplica pelo arquivo e ambiente efetivo. Assim, mantém as duas variantes do
AI prototype (Chromium e Microsoft Edge).

Inclui também `fr54-bleed-print-proof.mjs` e `fr80-archetypes-layout-proof.mjs`,
presentes e ausentes do workflow. Com a medição FR-24 existente e a regressão
`hanging-space-browser-proof.mjs` preparada para a correção `001da19`, o
inventário preparado resulta em **51 gates, 50 arquivos**. Os drivers recentes `inline-assistant-browser-proof.mjs`,
`agent-native-full-workflow-proof.mjs` e `native-pdf-cell-fill-browser-proof.mjs`
já constam no workflow e não são duplicados. Nenhum `editor-scale*.mjs` existe
no momento desta preparação; se passar a existir no diretório de provas, o
runner o acrescenta ao inventário, junto dos demais prefixos recentes.

| Grupo | Provas / requisito |
|---|---|
| Editor e PDF do workflow | Texto, manipulação, assets, snapping, templates, grupos, exportação, persistência/autosave, tabelas e productization; executados em série. |
| FR-24 adicional | Dez páginas com miniaturas, três rodadas com/sem miniaturas, edição e long tasks; sem orçamento inventado. |
| FR-54 adicional | Sangria na tela/impressão, PDF e pixels; pode consumir memória na rasterização. |
| FR-80 adicional | Arquétipos, placeholders, miniaturas, galeria e PDFs. |
| Espaços pendurados adicional | Geometria real do Chromium com renderer e métricas reais, seis casos em screen/print; records, altura e fonte preservados. |
| Edge obrigatório | `father-large-catalog`, `father-translation-batching`, `advanced-table-matrix` e a variante `ai-catalog-prototype--msedge`. As três primeiras usam Edge dentro do próprio driver. |
| Bundle E2E obrigatório | Ambas as variantes `ai-catalog-prototype` e `long-institutional-catalog`, conforme o ambiente do workflow. |
| Fluxos recentes | Assistente inline, agente nativo, PDF para célula, conversa BYOK, cofre local e indexação de PDF; sem chamadas reais de modelo. |

## Requisitos e execução serial

Usar Node 22 e as dependências já instaladas do projeto, incluindo Playwright,
PDF.js e a dependência nativa de canvas requerida pelos drivers. Chromium e,
para os gates indicados, Microsoft Edge devem estar previamente instalados e
compatíveis com o Playwright do projeto. O runner não instala dependências ou
browsers, não executa build e não inicia/reutiliza servidor global. Cada prova
gerencia seu servidor local. Portas ocupadas resultam em falha da prova;
nenhum processo alheio é encerrado para liberar portas.

Primeiro, após a conclusão das jornadas, inspecionar o inventário:

```powershell
node scripts/verify-father-ready-proof-gates.mjs --list
```

O bundle E2E precisa ser construído separadamente **neste mesmo estado de
fontes**, antes da rodada completa, tal como no workflow:

```powershell
$env:VITE_E2E_BUILD = 'true'
$env:BUILD_OUT_DIR = 'dist/e2e'
node node_modules/vite/bin/vite.js build
Remove-Item Env:VITE_E2E_BUILD, Env:BUILD_OUT_DIR
```

O runner apenas verifica a presença de `dist/e2e/ai-catalog-prototype.html`;
não certifica a atualidade do bundle. O executor deve confirmar que o build
foi criado após as últimas mudanças. O bundle E2E não deve ser publicado.

Disparar somente depois de terminar a rodada pesada de jornadas:

```powershell
node scripts/verify-father-ready-proof-gates.mjs --timeout-ms 1200000
```

Para uma rodada focada, nomes e prefixos aceitam uma lista ou várias opções
`--only`. As opções `--skip-edge` e `--skip-e2e` registram exclusões explícitas:

```powershell
node scripts/verify-father-ready-proof-gates.mjs --only fr54,fr80,editor-table,inline-assistant,agent-native,native-pdf-cell-fill --timeout-ms 1200000
node scripts/verify-father-ready-proof-gates.mjs --skip-edge --skip-e2e
```

## Evidências e interpretação

Cada execução cria um diretório exclusivo
`scratch/continuacao/proof-gates/<runId>/`, com `summary.json` atualizado a cada
gate, `stdout.log`/`stderr.log` por prova executada e cópias pequenas de recibos
JSON reconhecíveis. O resumo inclui hash do workflow e de cada driver, opções,
ambiente literal do workflow, requisitos, horários, códigos de saída, erros de
spawn, timeout, stderr e caminhos originais dos artefatos. Não registra o
ambiente completo do processo nem segredos.

O runner remove do ambiente herdado os controles opcionais auditados nos
50 drivers: seleção de browser/fase/matriz, quantidades/rodadas, portas,
URLs/flags de fixture e destinos de saída. Depois reaplica o ambiente literal
do workflow, `CI=1` e o destino isolado quando suportado. Isso impede, por
exemplo, que `ADVANCED_TABLE_BROWSERS=chromium`, `FR24_ROUNDS=0` ou
`AI_PROOF_BROWSER=msedge` deixados no terminal reduzam silenciosamente um
gate completo. Variáveis de sistema do Windows, runtime e caches são mantidas.
O resumo registra apenas os nomes removidos e os overrides efetivos do gate;
campos cujo nome indicar chave/token/segredo/senha/credencial são redigidos.
Novos controles opcionais em drivers exigem revisão dessa lista auditada.

A prova adicional de espaços pendurados usa `RichTextRenderer`,
`intrinsicMetrics` e `textFlowRecords` reais. A pré-condição exige que o
`Range` real exceda a caixa no caso com espaço pendurado e que a palavra
impressa caiba. Confere também overflow verdadeiro de palavra longa, NBSP,
`pre`, `nowrap` e imagem larga/alta. Cada caso conserva a fonte e os records
inteiros, incluindo os espaços, e verifica a altura. As métricas/records de
screen e print devem coincidir. Salva `result.json`, captura e PDF nativo da
fixture; isso não certifica o fluxo completo de exportação do editor.
Foi preparada sem executar navegador; o resultado real continua pendente
até a rodada serial. Pode ser isolada com
`--only hanging-space-browser-proof`, o que mantém os outros gates como
`skipped` e `complete:false` nessa execução focada.

Quando o driver já suporta `*_OUTPUT`, o runner direciona seus artefatos ao
diretório desta execução. As provas antigas mantêm os caminhos `scratch/...`
definidos nos próprios drivers; o resumo aponta esses diretórios e registra
se já existiam e os hashes dos recibos anteriores. Uma nova rodada dessas
provas pode sobrescrever seus próprios PDFs/imagens; o runner não move nem
apaga evidências. Só copia recibos JSON reconhecidos, até 1 MiB por arquivo,
50 por prova e três níveis de diretórios. PDFs, imagens e recibos fora desse
limite permanecem no caminho original. Um recibo antigo inalterado não conta
como novo resultado.

`pass` exige saída zero e marcador explícito `PASS` ou um recibo JSON novo,
reconhecível e não vazio. Falhas de spawn, código diferente de zero, timeout,
erros fatais reconhecíveis em stderr, erro ao salvar logs, recibo com estado
fatal/incompleto ou saída zero sem resultado produzem `fail`. Avisos comuns
de stderr ficam visíveis sem transformar automaticamente o resultado da prova.
As verificações de browser são apenas presença de arquivos em caminhos
conhecidos; falhas reais de lançamento aparecem no log do driver. Um browser
ausente ou build E2E ausente é `skipped` com motivo, nunca `pass`.

O código de saída é 1 se houver falhas, 130 se interrompido e 0 nos demais
casos, incluindo rodadas com skips. Portanto, código zero com `complete:false`
não significa aprovação integral. `complete:true` requer todos os gates do
inventário aprovados, sem filtros/skips. O timeout padrão é de 15 minutos por
processo, configurável por `--timeout-ms`. Cancelamento/timeout encerra somente
a árvore de processo que o runner iniciou, por PID/grupo; não procura nem
encerra servidores por porta/nome. Se o encerramento ficar incerto, a execução
dos próximos gates é interrompida e registrada.

O parser se limita ao formato literal atual do workflow: steps com `env`,
comandos Node diretos e atribuições de ambiente antes do comando. Não pretende
executar YAML ou shell arbitrário. Mudanças de estrutura do workflow exigem
revisão do inventário antes de usar o resultado como gate de integração.

## Resultado da rodada

Pendente de execução serial pelo executor. Preencher com `<runId>`, contagens
`pass/fail/skipped`, falhas e limitações após conferir `summary.json` e os
recibos. Esta preparação não altera o status da story nem declara seus ACs
concluídos. Os portões lint, typecheck, testes, build e CodeRabbit continuam
sob responsabilidade do executor/revisor da continuação.

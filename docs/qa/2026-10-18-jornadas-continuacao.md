# Jornadas da continuação — 18–20/10/2026

Execução local autorizada no worktree `C:/Users/Usuario/.codex/worktrees/father-ready-continuacao/catalog-builder`, branch `codex/father-ready-continuacao`. A rodada inicial usou HEAD `063d996`; o produto corrigido está salvo em `2a0cd75017e3e620629fe708225811fcf90ea952`, e as provas de 20/10 identificam o checkpoint `25a5297857ed3ee8bf22aa72f3c70cec834c797b`, com `dirty:true`. Produto, fixture de UI, casos e assertivas permaneceram sem alteração nas rodadas finais. Durante a rodada 1280, o responsável acrescentou apenas uma guarda de espaço livre no utilitário e no runner de integração, para interromper carga pesada abaixo de 5 GiB; essa mudança operacional posterior ao checkpoint será incluída no fechamento. Chromium headless em série, um navegador de cada vez, a 1366×768 e 1280×720; sem login, Supabase ou Gemini reais. Cada execução tem servidor Vite próprio com identidade de worktree, commit e execução.

O arquivo empresarial real da J12 foi confirmado em `C:/Users/Usuario/Desktop/CONFIGURATOR PCON/PCON-MASTER-ENGLISHV2.xlsx` (333.366 bytes). As saídas completas e capturas ficam em `scratch/father-journeys/runs/<runId>/`; o resumo mais recente de cada largura também fica em `scratch/father-journeys/summary.json` ou `summary@1280.json`.

**Atualização QA de 20/10: FAIL, B-01/P1 aberto.** Uma leitura focada posterior
confirmou bloqueio de publicação por altura da tabela após editar Parâmetro e
Faixa. As duas rodadas abaixo não verificavam esse diagnóstico após a edição;
seus `pass` brutos conservam essa lacuna de cobertura e não aprovam a experiência
integrada. O reparo de produto e sua revalidação estão com o responsável.

## Resultados automatizados de 20/10, antes da checagem focada B-01

| Rodada | Scripts | pass | pending | fail | Passos funcionais vermelhos | Achados P2 / P3 | Duração |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1366×768 | 14 | 9 | 5 | 0 | 0 | 7 / 13 | 326.968 ms |
| 1280×720 | 14 | 9 | 5 | 0 | 0 | 7 / 14 | 286.559 ms |

Ambos os processos terminaram com saída zero. As contagens de achados são
ocorrências por rodada: o mesmo problema pode aparecer nas duas larguras ou em
duas jornadas. Não representam 41 defeitos distintos. Os roteiros então não
registraram P0/P1; o probe posterior confirmou B-01/P1, descrito abaixo.

- 1366: `2026-10-20T15-51-04-727Z-314abc6f-2369-47c4-815f-6e0126a6658e`.
- 1280: `2026-10-20T15-56-32-601Z-6022b6aa-4ce4-462a-9779-d81a6731e9e7`.
- FR-37: `2026-10-20T16-01-19-794Z-69f55313-c6b0-4fb8-9eac-b46faf037507`, resultado funcional `pass`.
- Runtime dos resultados individuais: Node `v24.13.0`, Chromium `151.0.7922.34`, escala de dispositivo 1.
- FR-24 passou em rodada dirigida separada, com medidas descritas abaixo. Isso não completa as 51 provas de integração.

Os 28 JSON foram relidos por @qa e comparados com run ID, execution ID, HEAD e
status de seus resumos. Console **bruto = 0, aplicativo = 0, filtrado = 0 e
pageErrors = 0** em cada rodada e no total. O filtro histórico aceita certos
HTTP 500/imports como ruído Vite; o conjunto final não depende dessa exceção,
pois os logs brutos estão vazios. Auditoria por resultado em
[`journey-audit.json`](evidence/2026-10-20-continuacao/journey-audit.json).

### Resultado por jornada

| Jornada | 1366 | 1280 | Ocorrências P2/P3 (1366 → 1280) | Escopo conferido / pendência |
|---|---|---|---|---|
| J00 — smoke | pass | pass | 0/0 → 0/0 | Biblioteca, criação, editor e salvamento locais. |
| J01 — entrada | pending | pending | 0/4 → 0/4 | Fluxo local concluído; login/redirecionamento autenticado real pendente. |
| J02/J03 — arquivos e conversa | pending | pending | 0/0 → 0/0 | Intake, duplicata, erro isolado, retenção e CSV conferidos; composição completa, fontes/conflitos e edição por conversa das Ondas 3/4 pendentes. |
| J04 — edição à mão | pass | pass | 3/1 → 3/2 | Enter, Tab, Esc, título, undo/redo, páginas, zoom e campos conferidos; ressalva visual abaixo. |
| J05 — tabela longa | pass | pass | 0/0 → 0/0 | Continuação, 40 faixas em ordem, cabeçalho repetido, undo/redo e PDF. |
| J06 — foto celular | pass | pass | 1/2 → 1/2 | Inserção, orientação, rejeição HEIC e publicação locais. |
| J07 — salvar/reabrir | pass | pass | 0/1 → 0/1 | Recuperação local, inclusive texto ainda em digitação; transporte controlado. |
| J08 — publicar/PDF | pass | pass | 0/1 → 0/1 | Salvamento antes de publicar, bloqueio, corrigir, PDF A4 pesquisável. |
| J09 — idiomas | pass | pass | 2/0 → 2/0 | Ajustes numéricos, decisão 1.500, glossário, cópia EN/PDF e ES com provedor controlado. |
| J10 — dois funcionários | pending | pending | 0/0 → 0/0 | Conflito, cópia, reload e confirmação de descarte conferidos; presença/identidade na abertura pendente, sem segunda conta remota real. |
| J11 — biblioteca | pending | pending | 1/2 → 1/2 | Busca, duplicar, renomear e arquivar; Restaurar depende da Onda 4. |
| J12 — planilha empresa | pass | pass | 0/0 → 0/0 | Arquivo real: 686 células comparadas no módulo; 68 sensores/sete colunas pela UI, divisão, cabeçalho repetido, READY e undo/redo. |
| J13 — falhas | pending | pending | 0/1 → 0/1 | Foto grande e mensagens de limite/servidor conferidas; queda de rede e sessão expirada reais pendentes. |
| J-IA1 — Assistente | pass | pass | 0/1 → 0/1 | Proposta, confirmação, undo em uma transação, rascunho ao Esc e mensagens controladas. |

As cinco jornadas `pending` conservam oito passos pendentes por largura. Uma
pendência não oculta falha funcional: o agregador dá prioridade a `fail`. Os
achados P2/P3 continuam `ok:false` e listados mesmo em jornadas `pass`.

### Achados preservados e limites de leitura

| Severidade do roteiro | Evidência nas duas larguras, salvo indicação | Situação |
|---|---|---|
| P2 | J4: aviso de localização sobre a tabela exige fechamento; botões de zoom reportados com fonte CSS 12 px; propriedades avançadas mostram `mm` sem explicação na heurística de linguagem. | Achados de usabilidade mantidos. O símbolo visual dos botões e a necessidade de explicar `mm` devem ser avaliados com a pessoa; a heurística não substitui essa avaliação. |
| P2 | C-03: instrução HEIC desaparece após 4.004 ms / 3.923 ms. | Tom informativo e tempo de leitura continuam a revisar. |
| P2 | E-01: Gerar tradução imediatamente após editar pede salvar/concluir e exige tentar novamente. | Proteção do documento cumprida; fricção de fluxo, sem perda de catálogo. |
| P2 | E-02: Esc/Fechar cancela revisão de tradução e suas correções preparadas, sem aviso adicional; ao reabrir há zero trechos. | Cancelamento da composição efêmera conforme contrato; não é corrupção/perda de catálogo salvo. Confirmar a expectativa de uso na sessão humana. |
| P2 | A-04: após arquivar, a linha some sem mensagem posterior nem Desfazer. | Restauração ainda depende da Onda 4; duplicar de Arquivados funciona no fluxo local. |
| P3 | A-01/A-02/A-03: ordenação com alvo 19 px, fontes 12 px e marca 11 px; linha da biblioteca também usa 12 px. | Preservar como pendência visual. |
| P3 | J4: aviso de 21 palavras some em 4.105 / 4.152 ms; em 1280 apenas, texto da tabela em Ajustar à largura foi medido em 11,7 px efetivos. | Esse é o achado adicional de 1280. A 100%/125%, as verificações funcionais de texto e zoom passaram. |
| P3 | C-01/C-02: moldura quadrada deixa cerca de 33% sem retrato; HEIC não explica o caminho da configuração do iPhone. | Sem redesenho nesta continuação. |
| P3 | J7: recuperação apresenta quatro ações; J11: duplicação retorna só pela nova linha. | Recomendações de simplificação/retorno visual. |
| P3 | C-04: bloqueio manda Verificar novamente, mas Corrigir fecha a revisão e a pessoa precisa voltar a Publicar/PDF. | Instrução ainda desencontrada do fluxo. |
| P3 | C-05: Enviar permanece ativo quando o limite diário já foi informado. | Pedido é preservado; aviso de limite aparece inteiro. |
| P3 | D-07: proposta abre rolada até os botões, ocultando título/Página 1 acima da área. | Confirmado visualmente em 1280; não foi corrigido. |

**B-01/P1 confirmado na checagem focada de J4:** a captura após Enter/Tab/Esc
mostrou “1 a corrigir · 1 para revisar”, enquanto o diagnóstico anterior à
digitação tinha zero itens a corrigir. O responsável acrescentou leitura do
diagnóstico após esses passos e executou um probe em 1280, run
`2026-10-20T16-09-20-962Z-e0fcdb7e-e93d-47cb-a9f6-cde17f359b8d`.
`measurements['issues:A2 após Enter, Tab e Esc'].panel` registrou:

> Os itens “Corrigir” impedem o PDF. […] Página 2 · tabela 1 Corrigir A tabela
> ultrapassa a altura reservada. Aumente o quadro da tabela ou reduza seu
> conteúdo.

Essa é evidência do bloqueio após Parâmetro/Faixa/Enter/Tab/Esc; não permite
afirmar em qual tecla surgiu. O JSON bruto ainda disse `pass`, pois essa versão
do probe apenas capturava o diagnóstico. Esse resultado não aprova a tabela.
O responsável acrescentou depois uma assertion explícita contra
`TABLE_CONTENT_OVERFLOW` e está corrigindo o produto. Até reparo e nova prova,
**o parecer QA é FAIL/P1**. A leitura/captura estão preservadas em
[`j04-diagnostic-probe/`](evidence/2026-10-20-continuacao/j04-diagnostic-probe/),
sem reescrever os 28 resultados anteriores. A investigação pontual revelou uma
falha de cobertura, não uma pendência de onda futura ou achado P2 não bloqueante.

### Inspeção visual em 1280

@qa inspecionou as capturas preservadas de J4 Enter/Tab/Esc, J5 cabeçalho da
segunda página, J7 recuperação, J9 aviso numérico e confirmação 1.500, J10
confirmação de descarte, J12 publicação e J13/J-IA1 limite diário/proposta.
As duas leituras numéricas e os botões estão inteiros no trecho rolado; o aviso
de limite vai até aproximadamente y=676, com campo e Enviar acima dele. A
recuperação mostra as quatro ações; a confirmação de descarte apresenta as duas
opções e informa sobre a cópia de segurança. J12 mostra READY e o botão de
imprimir, com a tabela na prévia rolável. J5 mostra “(continuação)”, cabeçalho e
faixas F35–F40. J4 e D-07 têm as ressalvas explícitas acima. O responsável
também inspecionou a confirmação J9 e a publicação J12 em 1366.

### FR-37 executada

Tabela sintética inteira de 69 linhas totais (1 cabeçalho + 68 sensores) × 7
colunas, 483 células, sem divisão, colada por Ctrl+V real. Cinco edições inline
conferiram a matriz inteira a cada alteração; cinco Desfazer e cinco Refazer
restauraram exatamente os estados original/editado. Nenhuma amostra expirou;
zero erros brutos de console/página.

| Medida — cinco amostras | Mediana | Máximo |
|---|---:|---:|
| Enter → documento e DOM confirmados | 228,0 ms | 251,1 ms |
| Enter → duas rAF, aproximação de pintura | 450,1 ms | 539,5 ms |

Long tasks foram suportadas; a soma das interseções com os cinco intervalos
medidos foi 2.099,5 ms. Build Vite de desenvolvimento com React StrictMode,
viewport 1366×768. Não inclui digitação, abertura da célula ou autosave; duas
rAF não são uma medição instrumentada do frame apresentado. Nenhum orçamento
numérico de aprovação foi definido no plano. Esses dados evidenciam custo de
edição nessa configuração e não prometem desempenho de produção ou do PC do
pai. Resultado e amostras em
[`measure-fr37.json`](evidence/2026-10-20-continuacao/fr37/measure-fr37.json).

### FR-24 executada e integração parcial

O medidor existente executou três rodadas com miniaturas e três sem miniaturas,
com dez páginas por contexto a 1366×768. A fixture contém título, texto, foto e
tabela de 23×8 por página. As cinco edições alteram o título pelo comando real
da sessão, aguardam duas rAF e observam a atualização da miniatura. Trata-se de
medição da sessão/renderer em fixture, não de cinco gestos de digitação pela UI.
As assertivas verificaram os dez thumbnails desenhados ao rolar no modo ligado,
zero no modo desligado e ausência de erros de browser.

| Medida — medianas de três rodadas por modo | Miniaturas ligadas | Desligadas |
|---|---:|---:|
| Alteração do título → duas rAF | 2.061 ms | 1.903 ms |
| Long tasks no conjunto de cinco edições | 13.940 ms | 11.304 ms |

Com miniaturas ligadas, as primeiras visíveis foram desenhadas 597 ms depois
da shell; as sete restantes, 388 ms ao rolar. O custo de render React das
miniaturas foi 29 ms para as três primeiras, 94 ms para as outras sete e 56 ms
nas cinco edições. A miniatura editada apareceu 412 ms após a aproximação de
pintura da edição. São resultados reais de desenvolvimento com React
StrictMode, não garantias de produção. Os tempos e long tasks são relevantes
para o perfil de desempenho futuro; ausência de limite numérico no plano não
os converte em aprovação de fluidez.

Recibo: [`FR-24 result.json`](evidence/2026-10-20-continuacao/proof-gates/2026-10-20T16-05-46-310Z-549f6d51/48-fr24-thumbnails-measure/receipts/result.json).

| Rodada de provas | pass | fail | skipped | `complete` | Interpretação |
|---|---:|---:|---:|---|---|
| `2026-10-20T16-01-50-708Z-f147df14` | 1 | 2 | 48 | false | Texto passou; manipulação direta falhou com fontes 403; guarda de disco interrompeu antes de iniciar a terceira prova. |
| `2026-10-20T16-05-39-583Z-5fd88974` | 1 | 0 | 50 | false | Espaços pendurados em Chromium: seis casos screen/print, records/altura preservados, captura e PDF da fixture. |
| `2026-10-20T16-05-46-310Z-549f6d51` | 2 | 0 | 49 | false | Manipulação direta repetida com allowlist corrigida; FR-24 medida. |

A falha 403 vinha das fontes no destino real da junção de `node_modules`, fora
da allowlist Vite do driver. O reparo inclui raiz e `realpath(node_modules)`
nessa lista; não altera o produto ou relaxa as assertivas. A falha original e o
recibo novo permanecem separados. A guarda de disco parou a carga abaixo de
5 GiB; o caso marcado fail por infraestrutura não executou o browser. Somando
as rodadas dirigidas, há **quatro IDs distintos aprovados e 47 sem aprovação**
do inventário de 51. Nenhum resumo tem `complete:true`; esta é evidência parcial,
não PASS integral de integração. Provas dirigidas não apagam os skips nem
alteram retroativamente a primeira rodada.

### Preservação e histórico

Em [`evidence/2026-10-20-continuacao/`](evidence/2026-10-20-continuacao/), foram
preservados os dois resumos, 28 resultados brutos, resultado FR-37, 24 capturas,
10 PDFs e a auditoria derivada. O manifesto registra origem, destino, run ID,
viewport, descrição, tamanho e SHA-256; todas as cópias brutas foram conferidas
contra a origem. São 69 artefatos de dados listados, 4.730.795 bytes (4,51 MiB),
além do próprio manifesto. A planilha empresarial bruta e a foto grande gerada
não foram copiadas para o repositório. Caminhos de imagens/PDFs não selecionados
continuam apontando ao scratch no JSON original; o manifesto mapeia as cópias
disponíveis sem reescrever recibos históricos. Posteriormente foram incluídos
20 arquivos das três rodadas parciais de integração: resumos, logs, recibos e
captura/PDF da fixture de espaços. O conjunto passa a 89 artefatos listados,
4.955.661 bytes (4,73 MiB), 25 PNG e 11 PDFs, além do manifesto. A captura dos
espaços foi inspecionada: o caso com espaço pendurado quebra a segunda palavra;
palavra longa, NBSP, nowrap e imagem larga continuam ultrapassando suas caixas
como casos adversariais esperados.

O probe posterior de B-01 acrescentou dois arquivos (JSON e captura), mantendo
as aprovações históricas separadas do diagnóstico novo: **91 artefatos listados,
5.104.951 bytes (4,87 MiB), 26 PNG e 11 PDFs**, além do manifesto.

A rodada de 18/10 `2026-10-18T16-52-51-460Z-bd5ba64a-58a1-4e0e-aa80-6b880d06c2a0`
terminou **7 pass / 5 pending / 2 fail**. Seu resumo e JSON falhos J4/J9 estão
na subpasta `historical-2026-10-18`; a primeira rodada anterior permanece no
checkpoint de 18/10 (**4 pass / 2 pending / 8 fail**, 324.986 ms, 19 achados,
11 passos funcionais vermelhos). Os resultados finais não apagam essas falhas.

Resultados com backend controlado são regressão automatizada, não aceite observado do pai. Login/redirecionamento real, segunda conta real, queda de rede, sessão expirada, provedores externos e recursos das Ondas 3/4 continuam pendentes quando não executados. Falhas funcionais têm prioridade sobre pendências; achados P2/P3 ficam registrados mesmo quando a jornada passa.

## Checkpoint durante a primeira rodada

As notas abaixo preservam o diagnóstico histórico de 18/10. “Reexecução
necessária” descreve o estado naquele momento; a execução nova e suas
limitações estão registradas acima.

Execução inicial 1366: `2026-10-18T16-30-58-540Z-4989c3f2-5029-49a2-a743-771fb4c23516`. As falhas iniciais continuam preservadas nessa pasta mesmo após novas execuções.

- J00 passou. J01 executou o fluxo local e manteve login real pendente, com quatro achados P3 de legibilidade/alvos.
- J02/J03 parou no drop: o script disparava o evento no ancestral do assistente, fora da região de arquivos. O alvo foi corrigido para a região `[data-source-intake]`; contagem, estados, timeout e demais critérios foram mantidos. Reexecução necessária.
- J4 parou no duplo clique depois que o próprio roteiro havia usado “Ir até lá”: isso abriu a grade e um aviso persistente por cima da tabela. A prova passou a medir e preservar essa sobreposição como P2 (FR-12/2C), fechar o aviso pelo botão visível e voltar ao objeto antes de testar o gesto. Nenhum clique forçado foi introduzido. Reexecução necessária.
- J5 passou, incluindo continuação de tabela, ordem das 40 faixas, cabeçalho repetido, undo/redo e PDF.
- J6 passou com três achados P2/P3; o aviso de HEIC desapareceu em cerca de quatro segundos, com instrução incompleta de onde fica a configuração.
- J7 passou, incluindo recuperação de texto ainda em digitação ao fechar a aba.
- J8 concluiu os fluxos e PDFs, mas o check antigo exigiu `details.open=false` quando a interface simples removeu “Detalhes técnicos”. Medida/captura confirmaram “Corrigir este item” visível, 159×44 px e fonte 15 px. Critério atualizado para detalhes ausentes ou fechados. Reexecução necessária.
- J9 executou tradução e PDF; preserva falhas reais de avisos com 12 px e primeiro aviso fora da janela sem rolar. A exigência de dados do aviso numérico foi atualizada para o texto atual com dois pares explícitos (`0,02 → 0.02` e `% FE → % FS`), sem exigir que apareçam adjacentes. Reexecução necessária.
- J10 preservou dados em conflito, cópia, reload e confirmação de descarte. A prova comparava literalmente “Salvo” em um passo; agora aceita também “Salvo às HH:MM”, como os demais passos e a FR-44 integrada. Reexecução necessária.
- J11 executou biblioteca, busca, cópia e arquivamento; “Restaurar” permanece dependência da Onda 4. Achados de falta de confirmação ao arquivar e fontes pequenas foram preservados.
- J12 parou antes de ler a planilha: o roteiro procurava “Cancelar” no diálogo de criação, cujo botão atual é “Fechar”. O seletor foi corrigido; a existência do arquivo não equivale à execução da importação. Reexecução necessária.
- J13 e J-IA1 observaram a mensagem de limite diário abaixo da janela depois de enviar. Na J13 a base do alerta ficou em y=787 para a janela de 768 px e foi cortada pelo painel; a captura `shots/j13-falhas-03-ia-limite-diario.png` confirma o problema. A J-IA1 concluiu proposta, confirmação, um Ctrl+Z e retenção do rascunho ao usar Esc; o alerta permaneceu falha funcional.

Metadados da rodada inicial: Node `v24.13.0`, Chromium `151.0.7922.34`; HEAD completo `063d9966defe94bd37f4e472986ba6b4a525c1fa`, árvore com alterações (`dirty=true`), servidor próprio `bd4215c3-bccb-4323-93d7-7c5cb73091a9`. Os resultados identificam cada processo por `executionId`. O HEAD sozinho não reproduz os arquivos locais; preservar o diff/checkpoint desta continuação.

Capturas inspecionadas visualmente nesta execução: erro de drop J02; aviso sobre a grade J4; cabeçalho repetido na segunda página J5; prévia de recuperação J7; publicação bloqueada J8; revisão inicial de tradução J9; alerta cortado J13 e proposta J-IA1. A segunda página da J5 mostra “(continuação)”, o cabeçalho e as faixas finais dentro da página. A revisão J9 começa no cartão do título, o que confirma a necessidade de rolar até Exatidão. A proposta J-IA1 aparece rolada para baixo e cortada no alto, preservada como achado P3 no resultado.

Após revisão do responsável, o check 9 de J9 foi corrigido: a sugestão de Exatidão fica depois do cartão do título, portanto o teste registra sua posição inicial, rola até a sugestão e exige aviso e botão totalmente visíveis naquele trecho. Não se declara que era visível inicialmente. Fonte mínima, valores e confirmação continuam obrigatórios.

## Preparação histórica das medidas de desempenho

- FR-24: encontrado o medidor existente `tests/vnext/proof/fr24-thumbnails-measure.mjs`, da 2H, que compara miniaturas ligadas/desligadas em catálogo de 10 páginas. Sua execução ainda não ocorreu nesta continuação.
- FR-37: preparado `tests/vnext/proof/father-journeys/measure-fr37.mjs`; `node --check` passou. Usa 69 linhas totais (cabeçalho e 68 sensores) × 7 colunas sintéticas, sem dividir; cinco edições inline e verificação de cinco Desfazer/Refazer. Registra amostras, mediana e máximo de Enter até documento/DOM confirmado e duas rAF como aproximação de pintura, além de long tasks quando disponíveis. Não mede a digitação inteira nem autosave, não usa PCON real e não estabelece um limite de desempenho. Execução ainda pendente; isso não substitui o perfil de produção nem o hardware do pai.

Esse era o estado de preparação em 18/10. FR-37 e FR-24 foram executadas em
20/10 conforme as seções finais acima, sem substituir perfil de produção.

## Evidências a preservar no fechamento

Os diretórios `scratch/` são locais e ignorados pelo Git. Para os dois chats poderem retomar, manter os caminhos absolutos/run IDs no handoff e preservar cópia dos artefatos selecionados junto ao checkpoint quando ele for produzido:

1. `summary.json` e os 14 resultados JSON da nova rodada 1366; `summary@1280.json` e os 14 resultados da nova rodada 1280. Manter também o resumo inicial, pois documenta a origem das correções.
2. Capturas de ambas as larguras: edição inline Enter/Tab/Esc da J4; cabeçalho e publicação da tabela continuada J5; recuperação e prévia de texto digitando da J7; revisão bloqueada e impressão da J8; aviso de Exatidão e confirmação de “1.500” da J9; conflito, cópia e confirmação de descarte da J10; planilha lida, colunas, tabela dividida e publicação da J12; limite diário da J13 e J-IA1.
3. PDFs gerados pelas J5/J6/J8/J9/J13, vinculados aos resultados e ao estado do documento que os originou. Impressão headless não é verificação da janela nativa Salvar como PDF no computador do pai.
4. Resultado, amostras e capturas da FR-37 em pasta própria da execução; resultado da FR-24 existente quando for executado. Manter viewport, Node/Chromium, HEAD/branch/dirty e método de medição, sem converter mediana de desenvolvimento em promessa de produção.
5. Diff/checkpoint dos ajustes de roteiro, do harness e do aplicativo. Guardar o manifesto já existente da preservação das origens e a story com suas pendências; não redistribuir o arquivo empresarial fora do escopo desta continuação.

# Jornadas da continuação — 18/10/2026

Execução local autorizada no worktree `C:/Users/Usuario/.codex/worktrees/father-ready-continuacao/catalog-builder`, branch `codex/father-ready-continuacao`. A rodada inicial usou HEAD `063d996`; após as correções verificadas pelo responsável, o conjunto final usa `2a0cd75017e3e620629fe708225811fcf90ea952`. O código do aplicativo e o harness ficam congelados durante cada rodada. Chromium headless em série, um navegador de cada vez, a 1366×768 e 1280×720; sem login, Supabase ou Gemini reais. Cada execução tem servidor Vite próprio com identidade de worktree, commit e execução.

O arquivo empresarial real da J12 foi confirmado em `C:/Users/Usuario/Desktop/CONFIGURATOR PCON/PCON-MASTER-ENGLISHV2.xlsx` (333.366 bytes). As saídas completas e capturas ficam em `scratch/father-journeys/runs/<runId>/`; o resumo mais recente de cada largura também fica em `scratch/father-journeys/summary.json` ou `summary@1280.json`.

## Estado

- Rodada inicial 1366 concluída: 14 scripts, **4 pass / 2 pending / 8 fail**, exit 1, **324.986 ms**. São **19 ocorrências de achados normalizados** (5 P2, 14 P3), 11 passos funcionais vermelhos e cinco dependências pendentes. Zero erros de console e zero erros de página. Contagens incluem falhas do roteiro depois adaptadas, ainda sem reexecução.
- Rodada final 1366 iniciada: `2026-10-18T16-52-51-460Z-bd5ba64a-58a1-4e0e-aa80-6b880d06c2a0`, após correções de legibilidade/alerta e os quatro gates finais do responsável. A J02/J03 já confirmou os arquivos, duplicata, erro isolado, retenção do intake e inserção de CSV; as dependências das Ondas 3/4 permanecem pendentes.
- Rodada 1280: aguardando a conclusão da nova rodada 1366, com execução serial autorizada.
- FR-24: não medido nesta primeira rodada; as jornadas atuais não exercitam explicitamente 10 páginas com miniaturas.
- FR-37: a J12 mede leitura, inserção e divisão; isso não substitui a medição da latência de edição de uma célula.

Resultados com backend controlado são regressão automatizada, não aceite observado do pai. Login/redirecionamento real, segunda conta real, queda de rede, sessão expirada, provedores externos e recursos das Ondas 3/4 continuam pendentes quando não executados. Falhas funcionais têm prioridade sobre pendências; achados P2/P3 ficam registrados mesmo quando a jornada passa.

## Checkpoint durante a primeira rodada

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

## Medidas de desempenho preparadas

- FR-24: encontrado o medidor existente `tests/vnext/proof/fr24-thumbnails-measure.mjs`, da 2H, que compara miniaturas ligadas/desligadas em catálogo de 10 páginas. Sua execução ainda não ocorreu nesta continuação.
- FR-37: preparado `tests/vnext/proof/father-journeys/measure-fr37.mjs`; `node --check` passou. Usa 69 linhas totais (cabeçalho e 68 sensores) × 7 colunas sintéticas, sem dividir; cinco edições inline e verificação de cinco Desfazer/Refazer. Registra amostras, mediana e máximo de Enter até documento/DOM confirmado e duas rAF como aproximação de pintura, além de long tasks quando disponíveis. Não mede a digitação inteira nem autosave, não usa PCON real e não estabelece um limite de desempenho. Execução ainda pendente; isso não substitui o perfil de produção nem o hardware do pai.

## Evidências a preservar no fechamento

Os diretórios `scratch/` são locais e ignorados pelo Git. Para os dois chats poderem retomar, manter os caminhos absolutos/run IDs no handoff e preservar cópia dos artefatos selecionados junto ao checkpoint quando ele for produzido:

1. `summary.json` e os 14 resultados JSON da nova rodada 1366; `summary@1280.json` e os 14 resultados da nova rodada 1280. Manter também o resumo inicial, pois documenta a origem das correções.
2. Capturas de ambas as larguras: edição inline Enter/Tab/Esc da J4; cabeçalho e publicação da tabela continuada J5; recuperação e prévia de texto digitando da J7; revisão bloqueada e impressão da J8; aviso de Exatidão e confirmação de “1.500” da J9; conflito, cópia e confirmação de descarte da J10; planilha lida, colunas, tabela dividida e publicação da J12; limite diário da J13 e J-IA1.
3. PDFs gerados pelas J5/J6/J8/J9/J13, vinculados aos resultados e ao estado do documento que os originou. Impressão headless não é verificação da janela nativa Salvar como PDF no computador do pai.
4. Resultado, amostras e capturas da FR-37 em pasta própria da execução; resultado da FR-24 existente quando for executado. Manter viewport, Node/Chromium, HEAD/branch/dirty e método de medição, sem converter mediana de desenvolvimento em promessa de produção.
5. Diff/checkpoint dos ajustes de roteiro, do harness e do aplicativo. Guardar o manifesto já existente da preservação das origens e a story com suas pendências; não redistribuir o arquivo empresarial fora do escopo desta continuação.

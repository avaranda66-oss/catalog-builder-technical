# Revisão QA da continuação — 20/10/2026

**Parecer atual: FAIL — B-01/P1 confirmado, reparo e revalidação pendentes.**
As 51 provas de integração também não têm aprovação integral; quatro IDs foram
aprovados nas rodadas parciais e 47 permanecem sem aprovação. O teste focado
revelou uma lacuna das rodadas de jornadas anteriores; seus números brutos não
equivalem a aceite da experiência integrada.

Revisor: @qa (Quinn). Story: `docs/stories/2026-10-17-father-ready-continuacao.md`.
Checkpoint revisado: `25a5297857ed3ee8bf22aa72f3c70cec834c797b`, branch
`codex/father-ready-continuacao`, produto `2a0cd75017e3e620629fe708225811fcf90ea952`.

Esta revisão lê fontes, contratos, recibos e logs existentes. Não executou teste,
browser, build, serviço externo ou alteração de produto. As rodadas finais de
jornadas e provas continuam sob execução serial do responsável. **Não há parecer
PASS de integração neste documento.**

## Evidência de gates conferida

- Os cinco arquivos de `evidence/2026-10-18-continuacao/gates/manifest.json`
  têm os tamanhos e hashes SHA-256 registrados no manifesto.
- O relatório bruto local `scratch/continuacao/full-tests-final.json` tem SHA-256
  `c6a9949c92fea2f527a8918be815a8da540c27ca9a6e05176a8b51da4fe12a15`, igual ao
  recibo versionado. Registra `success:true`, 430 arquivos, 5.152 casos no total:
  5.151 aprovados, 1 ignorado e 0 falhas. A soma do resumo versionado
  `vitest-files.json` confere com esses números.
- O caso ignorado está identificado por arquivo e nome completo no recibo de
  gates. Trata-se da jornada Chromium de aceite empresarial marcada como
  dependente de infraestrutura; o resultado unitário não comprova esse aceite.
- O lint preservado termina em 0 erros e 268 avisos. O build preservado termina
  com sucesso e registra aviso de chunks acima de 500 kB.
- Os três arquivos de produto em `productChanges` continuam com os hashes
  testados. O recibo informa corretamente que os reparos foram testados ainda
  sobre HEAD `063d996` com alterações locais e depois salvos em `2a0cd75`.
- As duas revisões CodeRabbit têm recibo `review_completed`, zero achados e
  listas explícitas de seis e quatro arquivos. Não cobrem automaticamente as
  nove integrações nem os scripts de prova de `25a5297`.

Os recibos de lint/typecheck/build E2E de 20/10 ficam separados do teste completo
de 18/10. Não converter a repetição desses três comandos em nova execução do
teste completo. Os caminhos em `scratch/` são locais e ignorados pelo Git;
preservar resultados selecionados no fechamento para que a retomada sobreviva
à limpeza dessas pastas.

## Ajustes J4 e J9

**J4 — zoom:** ajuste de seletor legítimo. `app/editor/ZoomControl.tsx` oferece um
`select` rotulado Zoom, dentro do grupo Zoom da página. A prova agora escolhe
100% e 125% por esse controle, conservando exigências de opções visíveis,
geometria aplicada, ausência de overflow da janela e crescimento do texto. O
teste de Ctrl+roda continua verificando subida, teto, descida e zoom do browser.
O fallback sintético de wheel permanece identificado no resultado; não deve
ser descrito como gesto físico comprovado se esse fallback for usado.

**J9 — precisão:** ajuste de expectativa legítimo. O contrato
`translation/locale-number-format.ts` e os casos existentes em
`tests/vnext/translation/locale-number-format.test.ts` mantêm `1.500` como leitura
decimal alternativa e oferecem `1,500` como milhar, exigindo decisão da pessoa.
J9 continua exigindo valor original intacto antes da escolha, pergunta explícita,
ausência de aplicação automática, duas opções legíveis e valor confirmado no
catálogo e no PDF. Substituir a expectativa antiga `1.5` por `1.500` conserva as
casas do texto original. As duas falhas históricas devem continuar preservadas;
alterar o roteiro não as aprova retroativamente.

## Falhas, pendências e achados

`lib.mjs:assessJourneyStatus` dá prioridade a falha funcional, código de saída
inválido e achados P0/P1 sobre `pending`. `run-all.mjs` confere run ID,
execution ID, worktree, HEAD e servidor antes de aceitar cada JSON. Ausência de
resultado novo e saída não zero produzem `fail`.

Achados P2/P3 podem coexistir com jornada `pass`; continuam como passos
`ok:false` e como `findingDetails` no resumo. Portanto `pass` descreve o critério
funcional exercitado e não significa ausência de defeitos ou aceite integral de
usabilidade. O relatório final precisa trazer separadamente pass/pending/fail,
falhas funcionais e achados por severidade.

A limpeza do aviso sobre a grade em J4 usa botões visíveis e mede a sobreposição
como P2 antes de fechar; não atravessa o aviso com clique forçado. É um desvio
adicional da pessoa, ainda registrado. Login real em J1, composição/revisão de
fontes e conversa das Ondas 3/4 em J2/J3, presença em J10, Restaurar em J11 e
rede/sessão reais em J13 são dependências declaradas; não equivalem a passos
executados com sucesso.

**Semântica do achado E-02:** Esc/Fechar em `TranslationReview.tsx` chama
`TranslationReviewCoordinator.cancel()`, que limpa a composição efêmera e
retorna a idle. O teste `translation-review-copy.test.ts` exige cancelamento sem
CREATE, mantendo o original. FR-85/87 não exige persistência dessa revisão.
Se a nova rodada confirmar E-02, registrar que correções preparadas no rascunho
de tradução são descartadas ao cancelar, sem aviso adicional. Isso é fricção de
UX a validar com a pessoa; não prova corrupção/perda de catálogo salvo nem
regressão do contrato de persistência. A recomendação de confirmação ou retomada
do rascunho depende de escopo futuro, não foi implementada nesta revisão.

## Limites concretos das provas

- O filtro histórico `DEV_SERVER_NOISE` inclui HTTP 500, erro de importação
  dinâmica, ERR_ABORTED e createRoot duplicado. Essas mensagens não comprovam
  edição concorrente e não devem ser tratadas como inofensivas automaticamente
  em rodada congelada. Conferir `log.consoleErrors` bruto, `pageErrors` e itens
  filtrados em todos os resultados finais. Um conjunto bruto vazio permite
  afirmar zero erros sem depender desse filtro.
- O runner de integração exige saída zero, ausência de erro fatal/timeout e
  marcador PASS ou recibo JSON novo. A validação de recibos é genérica, não um
  schema de todos os drivers; o código de saída e as assertivas de cada prova
  continuam fazendo parte da evidência. Examinar recibos/logs nos casos sem
  marcador explícito e não tomar mero arquivo JSON como aceite de produto.
- `complete:true` exige todos os gates do inventário sem falha ou skip. Exit 0
  também pode ocorrer com skips; isoladamente não aprova a integração. A
  atualidade do bundle E2E é responsabilidade do executor, pois o runner verifica
  sua presença, sem provar que foi construído após a última alteração.
- FR-24 e FR-37 são medidas descritivas de desenvolvimento. FR-37 usa 69 linhas
  totais (cabeçalho + 68 sensores), sete colunas sintéticas, cinco edições e duas
  rAF como aproximação de pintura. Isso não é o arquivo PCON real, não inclui
  digitação/autosave e não define orçamento de desempenho. J12 separadamente
  compara 686 células do arquivo real no módulo e os 68 sensores/sete colunas
  selecionadas pela interface, incluindo cabeçalhos repetidos e undo/redo.
- PDFs headless e provedores controlados são regressão local. Não comprovam
  impressão nativa no PC do pai, autenticação, duas contas remotas, Gemini ou
  Supabase reais, deploy nem sessão observada.

## Fechamento ainda necessário

Conferir os resultados finais de 1366/1280, FR-37 e os 51 gates em série;
identificar qualquer falha nova sem reclassificá-la como pendência; preservar os
artefatos; atualizar story, inventário, handoff e os ponteiros de retomada. Os
documentos históricos de 17/18 de outubro contêm estados antigos deliberados e
precisam de ligação clara para o resultado final, sem apagar a evidência antiga.

## Adendo — releitura das jornadas concluídas em 20/10

O executor concluiu as rodadas; @qa apenas releu seus resultados e inspecionou
capturas existentes, sem iniciar browsers ou testes.

| Evidência | 1366×768 | 1280×720 | Total |
|---|---:|---:|---:|
| JSON de jornadas conferidos | 14 | 14 | 28 |
| pass / pending / fail | 9 / 5 / 0 | 9 / 5 / 0 | 18 / 10 / 0 |
| Falhas funcionais registradas | 0 | 0 | 0 |
| Console bruto / app / filtrado | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Erros de página | 0 | 0 | 0 |
| Ocorrências P2 / P3 | 7 / 13 | 7 / 14 | 14 / 27 |

Todos os resultados conferem com os resumos quanto a run ID, execution ID,
HEAD `25a5297` e status. Os 41 achados são ocorrências e incluem repetições nas
duas larguras; não são 41 defeitos distintos. E-02 foi observado nas duas
larguras e mantém a interpretação de cancelamento efêmero explicada acima.
Os oito passos pendentes por largura conservam suas dependências externas ou
de ondas futuras; nenhuma falha funcional foi reclassificada como pendência.

FR-37 registra `pass` de correção, cinco edições da matriz 69×7/483 células e
cinco undo/redo exatos. Mediana/máximo de confirmação documento+DOM:
228,0/251,1 ms; duas rAF: 450,1/539,5 ms. É medição descritiva em desenvolvimento,
sem limiar de desempenho de produção.

**Lacuna adicional de J4 e B-01/P1:** a captura final após Enter/Tab/Esc mostrou
“1 a corrigir · 1 para revisar”; o JSON tinha zero itens a corrigir antes da
digitação. A prova não reabria o diagnóstico após essas três operações. A
primeira observação do chip isolado não permitia classificar a causa; a
investigação focada posterior do responsável confirmou o bloqueio de altura,
conforme o adendo final abaixo. As duas rodadas anteriores não verificaram esse
critério e seus `pass` brutos conservam essa falha de cobertura.

As capturas 1280 inspecionadas confirmam aviso da IA completo, campo/Enviar
visíveis, opções de leitura 1.500 inteiras, publicação READY da planilha,
confirmação de descarte, recuperação e cabeçalho repetido da tabela. Confirmam
também D-07: o histórico abre rolado até Rejeitar proposta e oculta seu título
acima da área. Não se converte o `pass` funcional em aprovação visual irrestrita.

A pasta `docs/qa/evidence/2026-10-20-continuacao/` preserva 69 artefatos listados
no manifesto (4.730.795 bytes), além do próprio manifesto: resultados, resumos,
auditoria, 24 PNG e 10 PDFs, com hashes conferidos. Inclui o resumo histórico
de 18/10 com duas falhas e os JSON J4/J9 correspondentes. A planilha bruta não
foi adicionada. A tabela detalhada, os achados e o método estão no relatório
`2026-10-18-jornadas-continuacao.md` atualizado.

A rodada de 51 provas de integração ainda não está aprovada. O recibo
`scratch/continuacao/proof-gates/2026-10-20T16-01-50-708Z-f147df14/summary.json`
registra 1 pass, 2 fail e 48 skipped, `complete:false`: uma falha de fonte/403
na allowlist da junção e uma interrupção por espaço livre abaixo de 5 GiB.
A allowlist foi corrigida apenas no driver, incluindo raiz e o destino real da
junção `node_modules`, sem alterar produto ou assertivas. A repetição dirigida
`2026-10-20T16-05-46-310Z-549f6d51` conferida registra 2 pass/49 skipped:
manipulação direta e FR-24. A prova de espaços
`2026-10-20T16-05-39-583Z-5fd88974` registra 1 pass/50 skipped, com seis casos
screen/print e PDF de fixture. Todos os resumos têm `complete:false`; os quatro
IDs únicos aprovados não substituem os outros 47. Resumos, logs, recibos e
captura/PDF foram copiados com hashes, preservando a falha 403 original.

FR-24 mediu três rodadas com/sem miniaturas, dez páginas e cinco edições via
comando da sessão. Medianas de alteração até duas rAF: 2.061 ms com miniaturas,
1.903 ms sem; long tasks das cinco edições: 13.940/11.304 ms. São custos de
desenvolvimento relevantes para investigação futura, não aprovação de fluidez
ou promessa de produção. Método e demais valores constam no relatório de
jornadas. A prova dos espaços usa os renderers e medidas reais, com records,
fonte e altura preservados; não certifica todo o caminho de exportação.

## Adendo final — B-01/P1 confirmado

Probe J4 em 1280, run
`2026-10-20T16-09-20-962Z-e0fcdb7e-e93d-47cb-a9f6-cde17f359b8d`.
O JSON novo registra em `measurements['issues:A2 após Enter, Tab e Esc'].panel`
que itens Corrigir impedem o PDF e que a tabela 1 da página 2 ultrapassa a
altura reservada. Isso ocorreu após os passos de Parâmetro/Faixa/Enter/Tab/Esc.
Não foi isolada a primeira tecla que introduz o problema, mas o bloqueio de
publicação após o fluxo foi demonstrado pelo diagnóstico fresco.

O status bruto desse probe ainda é `pass`: nessa versão ele só observava o
diagnóstico. Esse é um falso aceite para o critério de ausência de bloqueio;
não é necessário reescrever o JSON para reconhecê-lo. A versão seguinte do
roteiro acrescenta assertion explícita contra `TABLE_CONTENT_OVERFLOW`, e o
responsável está corrigindo o produto. @qa não alterou produto ou roteiro,
nem executou browsers/testes. JSON e captura do probe estão preservados em
`evidence/2026-10-20-continuacao/j04-diagnostic-probe/`.

**Gate: FAIL/P1 até o reparo ser verificado com a nova assertion de J4 e os
gates apropriados no novo estado de produto.** A lacuna não será convertida em
`pending` ou P2 não bloqueante. Mesmo após esse reparo, o fechamento deve manter
CONCERNS/parcial pelas provas de integração não executadas, pelo perfil de
desempenho e pelo aceite externo não realizado.

O conjunto preservado agora contém 91 artefatos listados no manifesto,
5.104.951 bytes (4,87 MiB), 26 PNG e 11 PDFs, além do manifesto. As 28 jornadas
anteriores e os resultados de 18/10 continuam inalterados.

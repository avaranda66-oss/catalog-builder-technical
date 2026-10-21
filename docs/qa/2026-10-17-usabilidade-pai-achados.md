# Teste de usabilidade "como o pai" · 2026-10-17 (fechado em 2026-10-21)

> Rebaseado em 21/10/2026 sobre `claude/father-ready-final` (668ce52). A consolidação histórica do Codex está em [2026-10-17-usabilidade-pai.md](2026-10-17-usabilidade-pai.md); este arquivo é o relatório de achados da Equipe B.

**Base testada:** `33cd5df` (head de `claude/father-ready-20261014` com a costura 2.0 da Onda 2) mais os commits da Equipe B na branch `equipe-b/usabilidade` (idiomas FR-85/87, FR-54, harness).
**Quem testou:** Equipe B, 5 grupos de testadores automatizados fazendo o papel do pai, com revisão do líder.
**Como:** harness local que replica o modo de produção (`tests/vnext/proof/father-journeys/fixtures/father-harness.html`): biblioteca, editor em modo simples, fotos, recuperação local, assistente de IA simulado, tradução com provedor controlado. Chromium sem janela, em 1366×768 e 1280×720. Só a interface visível. Sem rede, sem Supabase, sem Gemini real.
**O que não foi testado:** login real e o redirecionamento de `/` para `/v2`; salvamento no Supabase real; IA real; impressão no PC do pai (Chrome e Edge, 100 % e 125 %); escala do Windows.
**Régua:** P0 impede terminar um catálogo ou perde dados. P1 atrito sério ou saída errada que ele vai encontrar. P2 incômodo. P3 polimento.
**Evidência:** cada achado tem prova em `tests/vnext/proof/father-journeys/jNN-*.mjs`, resultado JSON em `scratch/father-journeys/results/` e captura em `docs/qa/evidence/2026-10-17-usabilidade-pai/`.

## 1. Resumo

O que a Onda 1 prometeu funciona no harness: biblioteca em português, criar com nome, salvar sozinho, reabrir sem tela bloqueante, colar do Excel, páginas, zoom, vírgula no campo X, foto de celular de pé, HEIC explicado, Publicar que salva antes e bloqueia "A COMPLETAR", assistente sem chave, conflito com "Salvar meu trabalho como cópia" primeiro. Zero erros de console em todas as execuções.

| Severidade | Achados | Dos quais já corrigidos pela Equipe B |
|---|---|---|
| P0 | 0 | 0 |
| P1 | 2 | 1 (F-02) |
| P2 | 8 | 1 (F-10) |
| P3 | 8 | 0 |

As três coisas que mais atrapalham o pai hoje, fora o que a Onda 2 já está fazendo:

1. **A primeira palavra numa tabela nova vira erro vermelho** "Bloqueia publicação" (F-01). Ele vai ver isso em toda tabela.
2. **Fechar o Centro de Tradução no meio da revisão apagava tudo** sem perguntar (F-02). Corrigido nesta branch.
3. **Mensagens que somem antes de serem lidas** ou que apontam para um botão que não existe (F-05, F-13, F-14, F-17).

Oito achados dos grupos foram descartados por já estarem registrados no plano, na story da Onda 1 ou nas fatias da Onda 2. Estão na seção 5.

## 2. Jornadas

Status: **passou** = critério do plano cumprido no harness. **pendente** = parte do critério depende de recurso ainda não feito ou de produção. **falhou** = recurso existe e não funciona como o pai precisa.

| Jornada | Status | Prova | Uma frase |
|---|---|---|---|
| J1 Entrar e ver "Meus catálogos" | pendente | j01-entrar-meus-catalogos.mjs | Biblioteca abre em ~350 ms, tudo em português, criar = 2 cliques + nome. Falta o redirecionamento real após login (só em produção). |
| J-IA1 Assistente sem chave | pendente | jia1-assistente.mjs | Painel abre sem chave, proposta chega, "Confirmar e inserir" cria 3 páginas, um Ctrl+Z desfaz. Falta Gemini real. |
| J2 Criar com IA a partir de arquivos | pendente (Onda 2E/2F, 4A) | j02-j03-ia-arquivos-conversa.mjs | Não há onde soltar PDF ou planilha. Soltar um arquivo não faz nada e não quebra. |
| J3 Ajustar por conversa | pendente (Onda 4B) | j02-j03-ia-arquivos-conversa.mjs | "Aumente a foto da capa" vai pelo caminho de criar páginas. |
| J4 Editar à mão sem travar | **falhou** (F-01) | j04-editar-a-mao.mjs | Colar 12×4, páginas, zoom e "12,5" passam. Célula na própria tabela e "Título" são Onda 2A/2B. |
| J5 Tabela longa | pendente (Onda 2I) | j05-tabela-longa.mjs | Tabela de 41 linhas é criada e bloqueia com aviso claro. Não existe "Continuar na próxima página". |
| J6 Foto de celular | **passou** | j06-foto-celular.mjs | JPEG retrato com EXIF entra de pé, PDF Pronto. HEIC dá mensagem. |
| J7 Salvar e reabrir | pendente (Supabase real) | j07-salvar-reabrir.mjs | Nada se perde, nenhuma tela de outro catálogo, recuperação em português simples. "Salvo às HH:MM" é Onda 2G. |
| J8 PDF | pendente (impressão no PC do pai) | j08-publicar-pdf.mjs | Publicar logo após editar salva sozinho e mostra Pronto. "Corrigir este item" leva ao texto. PDF A4 pesquisável gerado na prova. |
| J9 Idiomas | pendente (Gemini real) | j09-idiomas.mjs | EN com ponto e "% FS", "1.500" pede confirmação, ES mantém vírgula, cópias salvas, PDF EN pesquisável. |
| J10 Dois funcionários | pendente (Onda 2G) | j10-dois-funcionarios.mjs | Faixa de conflito em ~1,2 s, "Salvar meu trabalho como cópia" primeiro, nada se perde. Diálogo bloqueante é 2G. |
| J11 Biblioteca | pendente ("Restaurar" é Onda 4D) | j11-biblioteca.mjs | Buscar "Y18", duplicar, arquivar com confirmação e recuperar por "Duplicar" funcionam sem ajuda. |
| J12 Planilha da empresa | pendente (Onda 2E) | j12-planilha-empresa.mjs | Pela tela não existe importar planilha. O módulo de importação (FR-65) leu o PCON-MASTER real e deixou preços e AccessLogs de fora. |
| J13 Falhas | pendente (Onda 2G) | j13-falhas.mjs | Foto de 2 MB reduzida sozinha, limite de IA e servidor sem IA avisam em português sem rolar. Rede e sessão são 2G. |

## 3. Achados priorizados

Cada achado traz: jornada, passos, captura, impacto, correção proposta e onde foi verificado. "Arquivo da Onda 2" quer dizer que a Equipe B não pode editar; a proposta está em `wt-equipe-b/_state/PROPOSTAS.md`.

### P1

**F-01 · A primeira palavra numa célula de tabela nova vira erro vermelho "Bloqueia publicação"** · J4 · conhecido que continua falhando: FR-31 (1F) e FR-34 (2D)
- Passos: Novo catálogo, Em branco. Tabela. Dois cliques na tabela, dois cliques na célula "Linha 2, coluna 1". No painel lateral, Tipo de conteúdo = Texto, digitar "Parâmetro", Concluir.
- O que acontece: "!" vermelho na tabela, chip "1 a corrigir", painel "ERRO · Bloqueia publicação · Conteúdo excede a altura da tabela". "Ajustar altura" resolve, mas fica no fim do painel e nada manda clicar nele.
- Captura: `j04-editar-a-mao-1366-03-celula-erro-bloqueia-publicacao.png`
- Impacto: ele vai ver um erro em toda tabela que começar, em "Em branco" e no modelo. Vai achar que fez algo errado.
- Correção: a linha deve crescer sozinha ao concluir a célula, com a mesma medição de "Ajustar altura". Arquivo da Onda 2 (`EditorWorkspace.tsx`, `commitCellEdit`). Proposta P-06.
- Verificado em 1366 e 1280 pelo grupo B. Suposição: que Publicar bloqueia sem "Ajustar altura" (mesmo código visto na J5).

**F-02 · Esc, "Cancelar" ou "Fechar" no meio da revisão fechavam o Centro de Tradução e apagavam tudo** · J9 · novo · **corrigido pela G3 (E-02, commit 80d3511; a versão da Equipe B foi descartada no rebase)**
- Passos: Traduzir, Espanhol, Gerar tradução. Corrigir um trecho à mão. Com o cursor na caixa, apertar Esc.
- O que acontecia: o Centro fechava na hora, sem pergunta. Ao reabrir, voltava à etapa 1 com 0 trechos.
- Captura: `j09-idiomas-1366-09-espanhol-reaberto.png`
- Impacto: numa ficha de 4 a 6 páginas são dezenas de trechos e até meia hora de correções perdidas por uma tecla de hábito.
- Correção aplicada: `TranslationReview.tsx` agora pergunta "Descartar a tradução?" com "Continuar revisando" (padrão) e "Descartar tradução e fechar". Teste em `translation-dialog.test.tsx`.
- Verificado em 1366 e 1280 pelo grupo E e pela lente de reprodução.

### P2

**F-03 · "Avançado (chave própria)" aparece quando a IA está bloqueada pelo limite diário** · J-IA1, J13 · conhecido que continua falhando: FR-60 (1B)
- Passos: abrir o editor com o limite diário atingido. Assistente IA. Abaixo da caixa aparece "Avançado (chave própria)". Clicar: pede "Chave API do provedor", "Senha de proteção do cofre".
- Contraprova: com servidor sem IA o botão não aparece, embora a mensagem o cite. Ao abrir o painel, o botão pisca durante "Verificando a IA…".
- Captura: `jia1-assistente-1366-05-limite-diario.png`
- Impacto: no dia em que a IA acaba, o pai vê um botão novo que o leva ao fluxo de chave e senha que o FR-60 tirou dele.
- Correção: oferecer chave própria só quando o servidor respondeu `byok: true`. Arquivo da Onda 2 (`CatalogNativeComposer.tsx:76`). Proposta P-07.
- Verificado pelos grupos C e D em 1366 e 1280. A lente de reprodução observou que o estado depende de como o servidor real responde o status com 429. Em produção pode variar.

**F-05 · O aviso do HEIC some em 4 s e não diz onde fica "Mais compatível"** · J6 · conhecido que continua falhando: FR-12 (1D) e FR-40 (1E)
- Passos: Imagem, escolher um .heic. Ler a mensagem. Não clicar em nada.
- O que acontece: a mensagem desaparece sozinha em 3,96 s. Nada explica que "Mais compatível" fica em Ajustes, Câmera, Formatos do iPhone.
- Captura: `j06-foto-celular-1366-03-heic-mensagem.png`
- Impacto: ele não termina de ler e não sabe o que fazer com a foto.
- Correção: devolver a falha de envio com tom de erro (fica até fechar) e completar o texto com o caminho no iPhone e "peça a foto em JPEG". Arquivos da Onda 2 (`image-upload.ts` e `EditorNotices.tsx`). O texto em `asset/normalize-image.ts:22` não está na lista proibida, mas é código de outra equipe. Proposta P-08.
- Verificado pelo grupo C em 1366 e 1280 e pela lente de reprodução.

**F-06 · Depois de mudar "Largura" ou "X" com Enter e clicar na página, o salvamento automático não dispara** · J9 · novo
- Passos: Texto, digitar, Concluir, esperar "Salvo". Clicar no texto, Mais propriedades, Largura = 169, Enter. Clicar num ponto vazio e esperar 6 s.
- O que acontece: continua "Alterações não salvas". Só salva ao clicar "Salvar", sair do campo com Tab ou editar outra coisa.
- Captura: `j09-idiomas-1366-01b-nao-salva-depois-do-painel.png`
- Impacto: o estado da tela fica mentiroso. Não é P1 porque "Meus catálogos" e "Publicar" salvam antes e fechar a aba dispara o aviso do navegador.
- Correção: notificar o espaço de trabalho ao assentar o rascunho do inspetor. Arquivo da Onda 2 (`EditorWorkspace.tsx`, `settleInspectorDraft`). Proposta P-09.
- Verificado 8 vezes pelo grupo E (4 rodadas em 2 janelas). A causa no código é suposição.

**F-07 · "Gerar tradução" com o salvamento em andamento manda salvar, mas "Salvar" está cinza** · J9 · novo · **corrigido pela G3 (E-01, commit 80d3511: "Gerar tradução" salva antes; a espera no coordenador feita pela Equipe B foi descartada no rebase)**
- Passos: editar um texto e clicar "Traduzir" sem esperar "Salvo". Inglês. Gerar tradução enquanto a barra diz "Salvando…".
- O que acontece: faixa vermelha "Salve o catálogo e conclua as edições antes de traduzir". O botão Salvar está desativado.
- Captura: `j09-idiomas-1366-02b-gerar-com-salvamento-em-andamento.png`
- Impacto: ele é mandado fazer algo que não consegue. Publicar na mesma situação espera sozinho (FR-50).
- Correção: em `review-coordinator.ts` (arquivo da Equipe B), esperar o salvamento terminar antes de pedir a tradução, com "Salvando o catálogo antes de traduzir…". Entregue pela G3 na tela (`TranslationReview.tsx`, prop `save`).
- Verificado pelo grupo E em 1366 e 1280 com servidor lento simulado e pela lente de reprodução.

**F-08 · Esc na caixa "Seu pedido ao Gemini" fecha o painel e apaga o pedido** · J-IA1 · novo
- Passos: Assistente IA. Digitar um pedido longo sem enviar. Esc.
- O que acontece: o painel fecha. Ao reabrir, a caixa está vazia.
- Captura: `jia1-assistente-1366-01-painel-pronto.png`
- Impacto: no Word, Esc nunca apaga texto. Ele perde o pedido que redigiu com cuidado.
- Correção: Esc dentro de uma caixa com texto só tira o foco, ou guarda o rascunho como "não enviado". Arquivo da Onda 2 (`EditorWorkspace.tsx:4623`). Cabe na 2C. Proposta P-10.
- Verificado pelo grupo D em 1366 e 1280 e pela lente de reprodução.

**F-09 · A lista de trechos da revisão de tradução cabe numa caixa de 230 px** · J9 · novo · **parte da Equipe B corrigida nesta branch**
- Passos: Traduzir, Inglês, Gerar tradução com 7 trechos.
- O que acontece: a caixa que rola tem 230 px para 2.194 px de conteúdo. Nenhum trecho inteiro visível. O primeiro aviso de números fica em y = 966 numa janela de 768.
- Captura: `j09-idiomas-1366-03-revisao-com-avisos.png`
- Impacto: ele não sabe que existem avisos nem que a caixa rola. A descobribilidade do ajuste de números depende disso.
- Correção: em `TranslationReview.tsx` (Equipe B), na etapa de revisão esconder a descrição e compactar o painel de idiomas numa linha, com resumo "2 ajustes · 1 pergunta · 3 termos" junto do contador. A altura da caixa está em `styles.css:553` (Onda 2C). Proposta P-11. Parte da Equipe B feita: na revisão a descrição sai da tela (fica para leitores de tela), os idiomas viram uma linha "Título · Português (Brasil) → Inglês (Estados Unidos)" e o contador mostra "X ajustes de números · Y perguntas · Z termos do glossário".
- Verificado pelo grupo E em 1366 e 1280.

**F-10 · Os avisos da revisão de tradução tinham letra de 12 px e o código do ajuste 11 px** · J9 · novo · **corrigido (a base da Equipe A já traz 15 px no aviso, 13 px no código e botões de 44 px)**
- Captura: `j09-idiomas-1366-03b-aviso-exatidao.png`
- Impacto: é onde ele decide entre vírgula e ponto. Em 11 px, com óculos de leitura, vírgula e ponto se confundem.
- Correção aplicada: `translation-review-locale.css` passou a 14 px no aviso, 13 px no código e botões de 36 px com 14 px.
- Verificado pelo grupo E em 1366 e 1280 e pela lente de reprodução.

**F-11 · Depois de "Arquivar catálogo" não aparece mensagem nem "Desfazer"** · J11 · novo
- Passos: na linha do catálogo, Mais, Arquivar, confirmar.
- O que acontece: a linha some. Nenhum aviso. A explicação de como voltar ficou só no diálogo anterior.
- Captura: `j11-biblioteca-1366-05-arquivados.png`
- Impacto: quem arquivou por engano precisa descobrir sozinho a aba Arquivados. A volta por "Duplicar" funciona, mas gera "Cópia de…".
- Correção: em `confirmArchive` mostrar "X foi arquivado. Ele continua em Arquivados", com "Desfazer" quando a 4D trouxer "Restaurar". Arquivo da Onda 2 (`CatalogLibrary.tsx`). Proposta P-12.
- Verificado pelo grupo A em 1366 e 1280 e pela lente de reprodução no código.

### P3

**F-12 · Quando a proposta da IA chega, a conversa rola até os botões e corta o título e a capa** · J-IA1 · novo
- Captura: `jia1-assistente-1366-02-proposta.png`. Em 1280 ele vê praticamente só os botões.
- Correção: rolar até o topo da proposta em vez do fim (`CatalogNativeComposer.tsx:86`, Onda 2). Proposta P-13.

**F-13 · Com o limite diário avisado, "Enviar ao Gemini" continua ativo** · J13 · novo, FR-61
- Captura: `j13-falhas-1366-03-ia-limite-diario.png`. Ele digita o pedido inteiro e só então recebe o mesmo aviso. O pedido volta como "não enviado".
- Correção: desligar o botão quando bloqueado e mostrar a prontidão como faixa de aviso (`CatalogNativeComposer.tsx`, Onda 2). Proposta P-13.

**F-14 · O aviso de bloqueio manda clicar em "Verificar novamente", mas esse botão some depois de "Corrigir este item"** · J8 · novo, FR-13
- Captura: `j08-publicar-pdf-1366-03-bloqueado.png`. Depois de corrigir, só existe "Publicar / PDF".
- Correção: "Corrija os itens e clique em Publicar / PDF de novo" (`PublicationReview.tsx:122`, Onda 2). Proposta P-14.

**F-15 · O aviso de conflito diz "salvo em outro lugar", não "outra pessoa salvou"** · J10 · novo, FR-43
- Captura: `j10-dois-funcionarios-1366-01-aviso-de-conflito.png`. "Em outro lugar" soa como defeito do programa.
- Correção: "Outra pessoa salvou este catálogo enquanto você editava" (`EditorNotices.tsx:116`, Onda 2, junto do ConflictDialog da 2G). Proposta P-15.

**F-16 · A moldura da foto nova é sempre quadrada** · J6 · novo, FR-21 (Onda 5)
- Captura: `j06-foto-celular-1366-01-foto-inserida.png`. Foto retrato fica com faixas vazias dos lados e a seleção maior que a foto.
- Correção: moldura na proporção da imagem, 58 mm no lado maior (`editor-defaults.ts:320`, Onda 2). Proposta P-16.

**F-17 · A mensagem verde de sucesso some em 4,1 s, antes de dar tempo de ler** · J4 · novo, FR-12
- Captura: `j04-editar-a-mao-1366-01-colar-12x4.png`. 21 palavras pedem cerca de 8 s. Ele perde o fim "Para voltar, use Desfazer".
- Correção: tempo proporcional ao texto, mínimo 6 s, em `src/vnext/editor/editor-notices.ts:14` (não está na lista proibida, mas é código da Onda 1D). Proposta P-17.

**F-18 · Em 1280×720 o zoom "Ajustar à largura" fica em 90 % e as células caem para 12,1 px** · J4 · novo, FR-16a
- Captura: `j04-editar-a-mao-1280-01-colar-12x4.png`. Ele precisa clicar "100%" toda vez.
- Correção: piso de 100 % para "Ajustar à largura" ou lembrar o zoom por catálogo (`use-stage-zoom.ts`, Onda 2C). Proposta P-18.

**F-19 · No editor da cópia traduzida nada diz o idioma** · J9 · novo
- Captura: `j09-idiomas-1366-06-copia-en-aberta.png`. A biblioteca mostra "Inglês (Estados Unidos)" e "Cópia traduzida". O editor não.
- Correção: rótulo de idioma ao lado do título (`EditorWorkspace.tsx`, Onda 2). Proposta P-19. O impacto em produção é suposição: no harness o prefixo "EN:" do provedor de teste distingue as cópias.

## 4. Movido para a Onda 2 depois da verificação

**F-04 · No "Tem certeza?" de "Abrir versão mais recente", o botão destacado é o que descarta** · J10 · FR-43
- Captura: `j10-dois-funcionarios-1280-03-confirmar-descartar.png`. "Sim, descartar minhas alterações" é azul e à esquerda. "Não, voltar" fica apagado.
- A lente "já conhecido" rodou a prova sobre a fatia 2G e concluiu que o novo ConflictDialog já troca a ordem e o destaque. Fica como item de conferência na integração da 2G (proposta P-15, junto do F-15).

## 5. Já conhecidos, não repetidos

| Achado do grupo | Onde já está |
|---|---|
| Mensagem de servidor sem IA cita "Avançado (chave própria)" que não existe (C-06, D-04) | Story da Onda 1, "Ficou de fora" do FR-60 |
| Letras de 10 a 12 px no painel do assistente, nos diálogos e nas linhas da biblioteca, botões de 19 px (A-01, A-02, A-03, C-07) | FR-16b (2C) e FR-05 (4D) |
| Aviso verde cobre o contador "N a corrigir" por 4 s (B-04) | Story da Onda 1, FR-12; FR-35 (2I) |
| "Preencher tabela com PDFs" exige manifesto JSON | FR-64 (2E) |
| Célula editada no painel fora da janela, sem "Título", alças de 12 px, tabela de 41 linhas sem continuação, sem "Salvo às HH:MM" | 2A, 2B, 2C, 2I, 2G |

## 6. O que a suíte cobre e como rodar

```bash
node tests/vnext/proof/father-journeys/run-all.mjs
```

Com `VP=1280` roda em 1280×720. `BASE_URL` reutiliza um servidor já aberto na porta 5190. Resultados em `scratch/father-journeys/results/`, resumo em `summary.json`. O código de saída é 1 só com `fail`; `pending` não falha. Detalhes no README da pasta.

Pendente até as ondas chegarem: J2, J3 (2E, 2F, 4A, 4B), J5 (2I), J10 diálogo bloqueante (2G), J12 tela de importação (2E), J13 rede e sessão (2G), "Restaurar" (4D). As provas já marcam esses passos como pendentes e passam a cobrar quando o recurso existir.

## 7. Próximos passos para a sessão com o pai

- Antes da sessão, corrigir F-01 na integração da Onda 2 (proposta P-06). Sem isso, a tarefa 3 do roteiro vai travar na primeira tabela.
- Usar o roteiro e a folha de observação de `docs/qa/sessao-com-o-pai.md`. Observar de perto Esc, mensagens que somem e o botão "Ajustar altura".
- Na tarefa de tradução, ver se ele encontra os avisos de números dentro da caixa que rola (F-09).
- Registrar o tempo até ele clicar "100%" de zoom numa tela de 1280 (F-18).

# Teste de linguagem natural do assistente (Onda 4.5 — Arsenal)

Data: 23/10/2026. Ramo `onda45/linguagem` (base `claude/onda-45` @ 9172905). Modelo: `gemini-3.5-flash-lite`.

## Resumo

- Montamos **60 pedidos** escritos como o pai fala: informal, com erros leves ("tabla", "cabeçario", "tabelinha",
  "mais grande", "poe", "pé de pagina"). São 44 pedidos do dia a dia, 10 complexos que devem ir à IA e 6 que pedem
  valores técnicos que ninguém deu (devem ser recusados).
- **Roteador sem IA** (zero tokens): **44 de 44** pedidos simples na rota certa, com a ação certa. Antes das correções
  eram **32 de 44 (73 %)**. Nenhuma recusa indevida. Nenhum valor inventado. Os 6 pedidos técnicos vão para a conversa
  que edita, que recusa. Os 10 complexos vão para a IA.
- **IA de verdade** (26 pedidos que vão à IA, rodada final): **25 de 26** com a ação certa. Nenhuma pergunta
  desnecessária. **6 de 6** recusas certas. Nenhuma recusa indevida. Arsenal usado quando existia (1 de 1). Nenhum
  número inventado. Custo médio de **US$ 0,0012 por pedido** (cerca de 2 900 tokens de entrada e 140 de saída).
- Achamos **dois defeitos graves antes do deploy**. Os dois estão corrigidos:
  1. Com o índice do arsenal, o Gemini recusava **todo** pedido da conversa que edita (HTTP 400).
  2. De vez em quando a IA respondia certo, mas a função descartava a resposta ("fora do formato").
- Gasto total com o Gemini: **US$ 0,36**, dentro do teto de US$ 0,60 (10 rodadas e checagens).

## Como foi feito

| Peça | Arquivo |
|------|---------|
| Corpus (60 pedidos, resultado esperado, se pode perguntar) | `tests/vnext/arsenal/natural-requests.corpus.ts` |
| Decisão igual à do app (atalhos → roteador sem IA → IA), ação local executada numa cópia | `tests/vnext/arsenal/natural-requests.harness.ts` |
| Teste Vitest com as metas | `tests/vnext/arsenal/natural-requests.test.ts` |
| Rodada com Gemini real | `scripts/live-natural-requests.ts` |

- **Catálogo aberto:** a capa real do PCON HÍBRIDO, a página-modelo P2 ("Visão geral"), a P4 ("Especificações
  técnicas") e uma página em branco.
- **Arsenal:** 6 modelos da equipe e os 28 modelos PRESYS embutidos, 34 no total. Os 6 da equipe são: Cabeçalho
  padrão, Cabeçalho azul, Rodapé padrão, Capa azul simples, Especificações 3 modelos e Tabela de pressões.
- **No teste sem IA**, a resposta local é aplicada de verdade numa cópia do catálogo, para confirmar que o cartão
  funcionaria. A tabela nova é inserida e confere-se que as células estão vazias. A página-modelo é inserida. Para o
  estilo, monta-se o mesmo plano "Vou fazer isto" do cartão.
- **Na rodada com IA**, o pedido é montado pelo navegador com o índice do arsenal (`prepareEditIntentRequest` e
  `prepareNativeComposeRequest`). Ele vai para o handler **real** da função `vnext-catalog-composer`, carregado numa
  VM como nos scripts `live-*`. O Supabase é simulado: um usuário editor e o orçamento da migração 00028.
- **Conferência da resposta:** é a do navegador (`EditIntentReplySchema` + `planEditIntents` e
  `verifyNativeComposeReply`).
- **Custo:** é o que o próprio livro de orçamento da função cobrou.
- **Segurança da chave:** ela foi lida só da variável de ambiente. Nunca foi impressa nem gravada.

## Resultados por pedido

Legenda:

- **Rota:** a rota de agora (✓ = certa). Entre parênteses, a rota antes das correções, quando estava errada.
- **Resultado:** o que o roteador fez (rota local) ou o que a IA respondeu na rodada final.
- **Tokens:** entrada + saída.

| Pedido | Esperado | Rota | Resultado | Tokens | US$ |
|--------|----------|------|-----------|--------|-----|
| bota uma capa nova | local | local ✓ | Página-modelo P1: Capa | 0 | 0 |
| quero uma capa igual a do PCON | local | local ✓ | arsenal: Capa de produto — PCON | 0 | 0 |
| poe a contra capa no final | local | local ✓ | arsenal: Contracapa | 0 | 0 |
| faz uma capa pro TA-25N | composer | composer ✓ | capa "TA-25N" | 1383+75 | 0,0006 |
| usa a capa azul | local | local ✓ | arsenal: Capa azul simples | 0 | 0 |
| coloca a capa padrão da presys | local | local ✓ (antes: composer) | Página-modelo P1 | 0 | 0 |
| faz uma tabelinha com 4 linhas | local | local ✓ (antes: composer) | tabela 4 × 3 vazia | 0 | 0 |
| bota uma tabela de 3 colunas por 5 linhas | local | local ✓ | tabela 5 × 3 vazia | 0 | 0 |
| poe aquela tabela de especificaçoes dos 3 modelos | local | local ✓ | arsenal: Especificações 3 modelos | 0 | 0 |
| tabela 5x4 | local | local ✓ | tabela 5 × 4 vazia | 0 | 0 |
| põe a tabela de código de pedido | local | local ✓ | arsenal: Código de pedido (tabela) | 0 | 0 |
| mete uma tabela de acessorios | local | local ✓ | arsenal: Acessórios com código | 0 | 0 |
| preciso de uma tabela pra comparar os modelos | local | local ✓ | arsenal: Comparação de modelos | 0 | 0 |
| bota uma tabla com 6 linhas e 2 colunas | local | local ✓ (antes: composer) | tabela 6 × 2 vazia | 0 | 0 |
| poe o cabeçalho padrao | local | local ✓ | arsenal: Cabeçalho padrão | 0 | 0 |
| coloca aquele cabeçario com a linha vermelha | local | local ✓ (antes: estilo errado) | arsenal: Título com linha vermelha | 0 | 0 |
| insere o topo da pagina | local | local ✓ | arsenal: Título com linha vermelha | 0 | 0 |
| quero um cabeçalho azul | local | local ✓ | arsenal: Cabeçalho azul | 0 | 0 |
| poe o rodape com o site | local | local ✓ | arsenal: Rodapé com site | 0 | 0 |
| bota o pé de pagina padrao | local | local ✓ | arsenal: Rodapé padrão | 0 | 0 |
| coloca um rodapé | local | local ✓ | arsenal: Rodapé padrão (os outros em "Ver outros") | 0 | 0 |
| tira o rodapé dessa pagina | edit_intent | edit_intent ✓ | apaga o texto do site e a linha | 2917+86 | 0,0011 |
| faz uma pagina nova de acessorios | local | local ✓ | Página-modelo P7 | 0 | 0 |
| poe uma pagina em branco | local | local ✓ (antes: composer) | página em branco (ação nova) | 0 | 0 |
| duplica essa pagina | edit_intent | edit_intent ✓ (antes: composer) | duplica a página 3 | 2468+58 | 0,0009 |
| apaga a pagina 4 | edit_intent | edit_intent ✓ | apaga a página 4 | 2916+59 | 0,0010 |
| bota uma pagina de especificaçoes tecnicas | local | local ✓ | Página-modelo P4 | 0 | 0 |
| poe uma pagina pra como pedir | local | local ✓ | Página-modelo P6 | 0 | 0 |
| insere a pagina de faixas de mediçao | local | local ✓ (antes: composer) | Página-modelo P5 | 0 | 0 |
| aumenta o titulo | local | local ✓ | aumentar a letra do "PCON HÍBRIDO" | 0 | 0 |
| deixa isso em negrito (subtítulo selecionado) | local | local ✓ | negrito | 0 | 0 |
| aumenta a letra disso aí (texto selecionado) | local | local ✓ (antes: IA) | aumentar a letra | 0 | 0 |
| pinta essa faixa de vermelho (faixa selecionada) | local | local ✓ | cor vermelha | 0 | 0 |
| muda a cor do titulo pra azul claro | local | local ✓ | cor azul-claro no título | 0 | 0 |
| diminui um pouquinho a foto | local | local ✓ | diminuir o tamanho da foto | 0 | 0 |
| deixa o titulo mais grande | local | local ✓ (antes: estilo errado) | aumentar a letra | 0 | 0 |
| coloca o texto em negrito | edit_intent | edit_intent ✓ | negrito no texto principal (antes: "recusa") | 2917+71 | 0,0011 |
| aplica o estilo de titulo nesse texto (selecionado) | local | local ✓ (antes: "Texto corrido") | arsenal: Título de página | 0 | 0 |
| deixa a tabela com letra menor | local | local ✓ | diminuir a letra da tabela | 0 | 0 |
| deixa o subtitulo azul | edit_intent | edit_intent ✓ | cor azul no subtítulo | 4442+70 | 0,0015 |
| traduz essa pagina pro ingles | edit_intent | edit_intent ✓ | traduz os textos da página | 2916+412 | 0,0019 |
| passa o subtitulo pro espanhol | edit_intent | edit_intent ✓ (antes: composer) | traduz o subtítulo | 4444+76 | 0,0015 |
| coloca em ingles o texto de destaque | edit_intent | edit_intent ✓ (antes: composer) | traduz o destaque | 4443+90 | 0,0016 |
| traduz tudo pra frances | edit_intent | edit_intent ✓ | ✗ nada traduzido (ver "O que ficou") | 2469+196 | 0,0012 |
| monta um catalogo de 4 paginas pro PCON com capa, apresentação, especificações e acessorios | composer | composer ✓ | 4 páginas, tabelas vazias | 1398+326 | 0,0012 |
| cria uma pagina comparando o PCON e o TA com uma tabela pra eu preencher | composer | composer ✓ | página de comparação, células vazias | 1393+146 | 0,0008 |
| faz uma pagina de garantia e assistencia tecnica | composer | composer ✓ | seção "Garantia e Assistência Técnica" | 1383+77 | 0,0006 |
| troca o titulo por PCON Y18 e aumenta a foto | edit_intent | edit_intent ✓ | troca o texto + aumenta a foto ("18" para conferir) | 4449+114 | 0,0016 |
| sabe aquela tabela que a gente usa pra mostrar como pedir o equipamento? bota ela aqui | IA | edit_intent ✓ | **IA achou no arsenal:** Código de pedido | 2121+26 | 0,0007 |
| traduz a capa pro ingles mas deixa os codigos dos modelos como estão | edit_intent | edit_intent ✓ | traduz a capa, códigos iguais | 4450+1002 | 0,0038 |
| cria 3 paginas: uma de recursos, uma de faixas e uma de codigo de pedido | composer | composer ✓ | 3 páginas | 1395+227 | 0,0010 |
| apaga a pagina em branco e duplica a de especificações | edit_intent | edit_intent ✓ | duplica a página 3 e apaga a página 4 | 4448+94 | 0,0016 |
| deixa a foto da capa maior e o titulo menor | edit_intent | edit_intent ✓ (antes: arsenal "Capa") | foto maior + título menor | 4446+106 | 0,0016 |
| na pagina de especificaçoes poe uma tabela comparando 3 modelos com pressao, exatidao e alimentaçao nas linhas | composer | composer ✓ (antes: arsenal) | tabela Modelo A/B/C × Pressão, Exatidão, Alimentação, vazia | 1404+150 | 0,0008 |
| coloca a exatidao do TA-25N no rodape | recusa | edit_intent ✓ (antes: composer) | **recusa** | 2926+38 | 0,0010 |
| poe a faixa de pressao do TA-25N na tabela | recusa | edit_intent ✓ (antes: **local**, preset "Tabela de pressões") | **recusa** | 2479+35 | 0,0008 |
| preenche a tabela com os valores do PCON | recusa | edit_intent ✓ (antes: composer) | **recusa** | 2474+40 | 0,0008 |
| bota a pressão maxima de cada modelo embaixo do titulo | recusa | edit_intent ✓ (antes: composer) | **recusa** | 2475+34 | 0,0008 |
| poe o preço de cada modelo embaixo da foto | recusa | edit_intent ✓ (antes: composer) | **recusa** | 4445+35 | 0,0014 |
| escreve a certificaçao ISO e a classe de proteção IP no rodape | recusa | edit_intent ✓ (antes: composer) | **recusa** | 2927+33 | 0,0010 |

### Metas do roteador sem IA (teste Vitest)

| Meta | Antes | Agora |
|------|-------|-------|
| Simples na rota certa, com a ação certa (≥ 90 %) | 32/44 (73 %) | **44/44 (100 %)** |
| Recusa indevida (pedido simples tratado como valor técnico) | 2 | **0** |
| Valor inventado (resposta local com número que ninguém digitou) | 1 (tabela de pressões para "faixa de pressão do TA-25N") | **0** |
| Técnicos que chegam a quem pode recusar (edit_intent) | 0/6 | **6/6** |
| Complexos que vão à IA | 8/10 | **10/10** |

### IA de verdade, rodada por rodada (26 pedidos que vão à IA)

| Rodada | Ação certa | Perguntas desnecessárias | Recusas certas | Recusa indevida | US$ | O que mudou depois |
|--------|-----------|--------------------------|----------------|-----------------|-----|--------------------|
| teste inicial | — | — | — | — | 0 | todo edit_intent com índice do arsenal: **HTTP 400** → `preset` virou enum |
| r1 | 25/26 | 0 | 6/6 | 1 ("coloca o texto em negrito" virou recusa) | 0,031 | padrão "o texto", objeto incerto nunca é recusa, rótulos com letras |
| r2 | 25/26 | 0 | 6/6 | 0 | 0,031 | "duplica essa pagina" descartada (CONTRACT) → ref de preset sobrando é descartada |
| r3 | 25/26 | 0 | 6/6 | 1 (página não aberta, resposta em inglês) | 0,031 | páginas: apagar/duplicar valem para qualquer página |
| r4 | **26/26** | 0 | 6/6 | 0 | 0,032 | "esse/essa" = objeto selecionado |
| final | 26/26 | 0 | 6/6 | 0 | 0,032 | capa do TA-25N saiu "Capa": o código digitado deve ficar no título |
| final-2 | 25/26 | 0 | 6/6 | 0 | 0,031 | tradução só de textos (nunca tabela) |
| **final-3** | **25/26** | **0** | **6/6** | **0** | **0,032** | — |

Na rodada final-3, a conversa que edita (20 pedidos) usou em média 3 380 tokens de entrada e US$ 0,0013 por pedido.
O composer (6 pedidos) usou 1 390 tokens de entrada e US$ 0,0008 por pedido. O tempo médio foi de 2,2 s por pedido.

### Comparação: e se não houvesse o roteador?

Mandamos à IA os 34 pedidos que o roteador resolve sem IA, pela rota que teriam sem ele (`--sem-roteador`):

- **27 de 34** certos. O roteador acerta 34 de 34.
- O modelo salvo foi usado em 15 dos 21 casos em que havia um.
- Houve 1 recusa indevida: "pinta essa faixa de vermelho" com a faixa selecionada.
- Houve rótulos com números ("Característica 1…5").
- **Custo:** US$ 0,027, cerca de US$ 0,0008 e 2 s por pedido.

O roteador economiza esse custo e essa espera em todo pedido simples. Além disso, é mais previsível: sem o roteador, a
IA às vezes monta uma página própria em vez de usar a página-modelo PRESYS ("página de acessórios", "página de
especificações", "como pedir").

## Exemplos de erro e o que foi corrigido

### Roteador sem IA (`src/vnext/arsenal/local-router.ts`)

1. **"poe a faixa de pressao do TA-25N na tabela"** era respondido localmente com o modelo "Tabela de pressões". Um
   pedido de valor virava uma tabela vazia, sem recusa. **Correção:** um código de modelo (TA-25N, Y18) conta como
   número. O modelo salvo precisa tê-lo; senão, a IA decide.
2. **"deixa a foto da capa maior e o titulo menor"** virava o modelo "Capa". **Correção:** duas mudanças de tamanho
   ao mesmo tempo vão à conversa que edita.
3. **"na pagina de especificaçoes poe uma tabela comparando 3 modelos com pressao, exatidao…"** virava o modelo
   "Especificações 3 modelos". **Correção:** um modelo que cobre menos da metade do pedido não ganha. Ele ainda aparece
   em "Ver outros".
4. **Erros de digitação e diminutivos.** Agora estes são entendidos: "tabla", "tabelinha", "cabeçario", "pé de
   página", "contra capa", "mais grande" e "comparar". Também os femininos das cores ("vermelha", "clara") e as
   palavras "disso", "nesse", "igual" e "como".
   - A lista é explícita, sem correção "aproximada", para não trocar uma palavra por outra.
   - "presys" perdia o "s" ("presy") e quebrava "a capa padrão da presys".
5. **"aplica o estilo de titulo nesse texto"** escolhia "Texto corrido". **Correção:** a palavra depois de
   "esse/nesse" aponta a seleção, não o modelo.
6. **"poe uma pagina em branco"** ia à IA. **Correção:** nova ação local "Página em branco" (`page.add`, um
   Desfazer). Ela também vale para "bota uma página nova".
7. **"poe a contra capa no final".** **Correção:** com "no final/no fim", a página-modelo entra depois da última
   página.

### Rota entre a conversa que edita e o composer (`assistantLaneFor`)

8. **Cinco dos seis pedidos técnicos iam ao composer.** Exemplos: "coloca a exatidao… no rodape", "preenche a
   tabela…", "escreve a certificação…".
   - O composer não sabe recusar: montaria uma página.
   - **Correção:** "põe/bota/coloca X no Y" vai para a conversa que edita. O mesmo vale para "preenche", "escreve",
     "atualiza", "pinta" e "duplica", e para pedidos com idioma ("pro espanhol", "em inglês") ou com "estilo".
   - "uma tabela", "a página de…" e "o cabeçalho" continuam no composer ou no arsenal. São coisas novas.

### IA (função `vnext-catalog-composer` e navegador)

9. **HTTP 400 em todo pedido da conversa que edita com o índice do arsenal.**
   - O campo `preset` livre (até 5 caracteres) somado às 40 intenções deixava o schema grande demais para o Gemini.
     O Gemini respondia só "Request contains an invalid argument".
   - **Correção:** `preset` agora é um enum com as refs enviadas (a1…a24). Ele foi aceito com 30 refs e a IA não
     consegue inventar outra ref.
   - Isso não chegou à produção: a função publicada ainda não anuncia `arsenal_index`, então o app não manda o índice.
10. **Resposta descartada de vez em quando.**
    - Com o enum, a IA às vezes preenchia `preset` junto de uma proposta, por exemplo
      `{"status":"proposal","preset":"a5",…}`. A conferência rejeitava a chave extra.
    - **Correção:** essa ref sobrando é descartada antes da conferência. Ela não carrega ação nenhuma.
11. **O índice do arsenal deixava de fora categorias inteiras.**
    - Com 34 modelos e o limite de 2 400 caracteres, a ordem "mais usados e depois por nome" cortava "Rodapé com site"
      e "Título com linha vermelha". A IA então escolhia "Faixa vermelha" para o cabeçalho.
    - **Correção:** as categorias se revezam e as etiquetas caem de 3 para 1 antes de cortar modelos. Agora vão 24
      modelos, de todas as categorias.
12. **Ajustes de prompt.** A política de layout ficou mais flexível; as travas de valores continuam iguais:
    - "o texto" = o selecionado; se nada estiver selecionado, o texto principal da página.
    - "esse/essa + nome" = o objeto selecionado.
    - Objeto incerto nunca vira recusa: a IA usa um padrão ou pergunta.
    - Apagar e duplicar valem para qualquer página.
    - Tradução só de textos, nunca de tabela.
    - O composer usa rótulos com letras ("Modelo A") e mantém o código que a pessoa digitou ("TA-25N").
    - A regra do arsenal prefere o modelo salvo quando o pedido é de **um** item que ele fornece.

## O que ficou

- **"traduz tudo pra frances"** na página de especificações falha cerca de 1 vez em 4.
  - A IA devolve os textos sem traduzir e inclui a tabela.
  - O app bloqueia tudo: nada muda e aparece "Esse pedido não vale para este objeto". A falha é segura, mas a mensagem
    é pouco clara.
  - Próximo passo barato: quando tudo for bloqueado, dizer "Não traduzi nada; tabelas se traduzem pelo botão de
    idioma". Hoje a conversa não traduz células de tabela.
- **O índice leva 24 dos 34 modelos.**
  - Alguns estilos ("Título de página", "Texto corrido") ficam de fora. Sem o roteador, a IA escolheu "Subtítulo"
    para "aplica o estilo de título".
  - Aumentar o limite exige mudar o servidor (`ARSENAL_AI_LIMITS.indexChars`). Não foi feito.
- **Sem o roteador, a IA às vezes monta páginas próprias** em vez de usar as páginas-modelo PRESYS. Isso aconteceu em
  3 dos 7 pedidos de página-modelo; em outro, ela escolheu outra capa salva. A regra reforçada não bastou. No app, o
  roteador resolve esses pedidos antes.
- **Corpus escrito por nós.** As regras novas cobrem exatamente essas frases; há risco de sobreajuste. Vale colher
  20 a 30 frases reais do pai depois do deploy e rodar `natural-requests.test.ts` de novo.
- **Deploy pendente.** Os prompts, o schema (enum) e a limpeza da ref sobrando estão na função
  `vnext-catalog-composer`. Ela precisa de deploy, que aguarda o OK do Gabriel. Não há migração.

## Como rodar de novo

```bash
# Sem IA (zero custo): metas do roteador sobre os 60 pedidos; NATURAL_REQUESTS_OUT grava a tabela.
npx vitest run tests/vnext/arsenal/natural-requests.test.ts

# Com Gemini real (a chave só pela variável de ambiente; teto em US$):
GEMINI_API_KEY=... npx vite-node scripts/live-natural-requests.ts -- --out D:/tmp-proofs/linguagem --label rN --ceiling 0.1
# Comparação sem o roteador:
GEMINI_API_KEY=... npx vite-node scripts/live-natural-requests.ts -- --out D:/tmp-proofs/linguagem --label cmp --sem-roteador
```

Os resultados de cada rodada estão em `D:/tmp-proofs/linguagem/linguagem-natural-<rodada>.json`, fora do
repositório.

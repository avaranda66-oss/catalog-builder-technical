# Extração de fatos no servidor (FR-66, fatia 2F) — 17/10/2026

## Resumo

- **Pronto no código, provado localmente, sem deploy.** A função `vnext-catalog-draft` (tarefa `extract_facts`) roda de verdade contra o Gemini, com o Supabase simulado. Ela não foi implantada e a migração 00029 não foi aplicada.
- **Zero valor errado marcado como conferido**, nas duas rodadas ao vivo com o código final (3 PDFs reais por rodada). Também não houve nenhum valor conferido com caractere privado da fonte Symbol.
- **A p. 6 do manual TA (condição 5 do spike) agora entra.** A tabela de entradas (mV, mA, Pt-100, termopares) vale para os três modelos. Nas duas rodadas, 68 das 84 células saíram conferidas e certas, com "±", "Ω" e "°" corretos. Das 16 restantes, 4 ficam para o pai conferir olhando a página e 12 aparecem como "não confere", nunca como certas.
- **Nenhuma página lida some em silêncio.** Toda página do intervalo pedido ganha uma linha, com o motivo quando não deu valor (ex.: "Página 10: fala de outros modelos, que não foram pedidos; nada foi aproveitado.").
- **Custo e tempo por arquivo**, com o preço atual do gemini-3.8-flash (US$ 0,75 / 3,75 por milhão de tokens até 31/12/2026). A tabela abaixo usa a rodada 3; a rodada 2 deu números parecidos.

| Arquivo (páginas) | Tempo total na função | Chamada ao Gemini | Tokens entrada / saída | Custo |
|---|---|---|---|---|
| Folder TA (p. 9–13), 3,2 MB | 32 s | 27,5 s | 11 845 / 4 658 | US$ 0,026 |
| Manual TA PT (p. 5–8), 2,7 MB | 68 s | 63,3 s | 21 985 / 11 699 | US$ 0,060 |
| Folder PCON-Y17 (p. 11), 23 MB | 29 s (8,3 s só de envio) | 17,7 s | 7 579 / 2 784 | US$ 0,016 |
| Repetição de qualquer um (cache) | 1 ms | nenhuma | 0 | US$ 0 |

- Na rodada 2, os tempos totais foram 31 s, 63 s e 30 s, e os custos US$ 0,026, 0,065 e 0,015.
- O orçamento reserva o pior caso antes da chamada: US$ 0,22, pelo preço de 2027, para nunca contar a menos. Depois liquida pelo uso real. Na rodada 3, a liquidação ficou em US$ 0,053, 0,121 e 0,032, que é o dobro do custo de hoje, porque usa o preço de 2027.
- Gasto total desta sessão com a chave temporária: cerca de **US$ 0,41**. Entram aí as sondas do esquema, 1 sonda do manual e 3 rodadas completas.

## O que foi construído

| Peça | Arquivo | O que faz |
|---|---|---|
| Função Edge | `supabase/functions/vnext-catalog-draft/index.ts` | Faz as mesmas guardas do composer: origem, JWT, perfil admin/editor ativo e tamanho do pedido. Liga só com `VNEXT_CATALOG_DRAFT_ENABLED=true`. Usa a chave `VNEXT_DRAFT_GEMINI_API_KEY`, ou, se ela faltar, `VNEXT_COMPOSER_GEMINI_API_KEY` ou `GEMINI_API_KEY`. Não aceita chave pessoal. A tarefa `status` é grátis. |
| Contrato puro do servidor | `src/vnext/ai-catalog/draft-contract.ts` | Pedido estrito: só PDF ou foto, caminho `<usuário>/<sha256>.<ext>`, no máximo 12 páginas. A ordem é: cache → reserva do orçamento (00028, `feature 'extraction'`) → arquivo privado → confere o sha256 → envia ao Files API do Gemini sem base64 → countTokens → **uma** chamada `generateContent` → liquida pelo uso → grava no cache → apaga o arquivo no Google. Tem tempo limite total de 135 s. A resposta é limitada sem cortar nenhum texto, e o que fica de fora é contado. |
| Códigos | `src/vnext/ai-catalog/draft-codes.ts` | Lista fechada de códigos de erro. Nenhum texto do Google chega à tela. |
| Prompt e esquema | `src/vnext/ai-catalog/fact-extraction-prompt.ts` | Contém o prompt v2 validado no spike, palavra por palavra (movido de `fact-extraction.ts`, que só o reexporta), mais 4 regras v3: `sharedTables` (tabelas comuns a todos os modelos, com 1 trecho por linha e valores por coluna impressa) e `pages` (o que cada página lida tem). Todo texto do esquema tem `maxLength`. |
| Revisão no navegador | `src/vnext/ai-catalog/extraction-review.ts` | Confere cada valor contra o texto do próprio PDF, lido no navegador (`verifyFactProposal`, como no spike). Cada tabela comum é conferida como uma matriz cujas posições são as colunas impressas, e o verificador amarra o valor ao cabeçalho certo. Também lista todas as páginas, com o motivo quando uma página não deu valor. |
| Cliente | `src/vnext/ai-catalog/draft-client.ts` | Guarda o PDF ou a foto no bucket privado, recusa planilhas, pede a extração sem credencial, revisa localmente e traduz cada erro para português simples. |
| Migração (só o arquivo) | `supabase/migrations/00029_vnext_source_files.sql` | Cria o bucket privado `vnext-source-files` (PDF, JPEG, PNG e WebP até 50 MB; planilhas nunca entram). O usuário só grava na própria pasta e nunca sobrescreve um arquivo. Cria também o cache `vnext_source_extractions`, só acessível pelas RPCs `get_v1` e `put_v1` (admin e editor ativos). É aditiva. |
| Modelo | `src/vnext/ai-catalog/gemini-models.ts` | Acrescenta `GEMINI_EXTRACTION_MODEL = 'gemini-3.8-flash'`, com o preço de 2027 (US$ 1,50 / 7,50), para não contar a menos. |
| Prova ao vivo | `scripts/live-draft-extraction.ts` | Roda a função real (transpilada, como nos testes) contra o Gemini e compara o resultado com os dois gabaritos. Com `--replay`, refaz a revisão sobre as respostas salvas, sem chamar a API. |
| Gabarito novo | `gabarito-tabelas-comuns.json` | Manual TA p. 6 (21 linhas × 4 colunas), p. 8 (14 × 2) e PCON-Y17 p. 11 (7 × 5), conferidos à mão na imagem das páginas. |
| Respostas salvas | `respostas/rodada-2`, `respostas/rodada-3` | Contêm as respostas do Gemini (sem a chave), o log de cada execução e a avaliação com o código final. |

## As 6 condições do spike (§8 de SPIKE_EXTRACAO_20261015.md)

1. **Mesmo caminho do spike: cumprida.** O fluxo continua `toFactProposal` → `fitQuotesToPages` → `verifyFactProposal`, contra `withNormalizedSymbols(pdf)`. O prompt v2 é o mesmo, palavra por palavra, só com as regras novas no fim. Foi acrescentada só uma troca de "º" (indicador ordinal) por "°" quando vem antes de C, F ou K. Ela vale para os dois lados, o texto do PDF e a resposta, e troca um caractere por um. Motivo: na p. 6 o Gemini escreve "ºC" onde a fonte Symbol imprime "°C", e todos os valores de temperatura falhavam. A normalização dentro do `pdf-intake`, limitada à fonte Symbol, continua pendente com o dono do `pdf-intake` (1G).
2. **Mandar só o intervalo de páginas: não cumprida.** O arquivo inteiro vai ao Google, e o prompt manda ler só as páginas pedidas. Valores citados fora do intervalo ficam de fora e são contados. Cortar o PDF exige uma biblioteca nova, e nesta onda nenhuma fatia pode acrescentar dependência. O custo do arquivo inteiro ficou em US$ 0,03 a 0,07 por manual.
3. **Condição ao lado do valor: cumprida nos dados.** Cada valor traz a condição da linha. Numa tabela comum, a condição impressa só para uma célula ("using 2 σ method") fica junto do valor (`valueConditionText`) e não divide a linha em duas. A tela que mostra isso é da FR-68 (3C).
4. **Divergências vão para a revisão: cumprida nos dados.** `reviewSourceValues`, junto com `findSourceDivergences`, achou as 12 divergências entre o folder e o manual nas duas rodadas: faixa de operação e ambiente, estabilidade e dimensões. A tela que mostra isso é da 3C.
5. **Tabelas comuns a todos os modelos, provadas na p. 6: cumprida.** O resultado está na seção seguinte.
6. **Unidade uma vez só: cumprida.** `valueDisplayText` e `unitColumnText` não repetem a unidade quando o literal já a traz, e o literal nunca é editado. Nas tabelas comuns, a unidade que já está no literal sai da linha, o que evita "mm mm" e também evita dividir a linha.

## Página 6 do manual TA (condição 5)

| | Rodada 2 | Rodada 3 |
|---|---|---|
| Células conferidas e certas (gabarito de 84) | 68 | 68 |
| Conferidas e erradas | **0** | **0** |
| Conferidas com caractere privado | 0 | 0 |
| Para conferir olhando a página | 4 | 4 |
| "Não confere" (nunca usadas sem a pessoa) | 12 | 12 |

- **As 4 para conferir** são a segunda faixa do milivolt (150 a 2450 mV). Essa linha não tem nome próprio, então o texto não diz de quem ela é.
- **As 12 que não conferem:**
  - 4 da linha "mA". O nome da linha é também a unidade das células, e o verificador vê "mA" várias vezes no mesmo trecho e o recusa.
  - 8 da "resistência". A célula é impressa em várias linhas, e o trecho citado não aparece em sequência no texto do PDF.
  - Os valores dessas 12 estão certos, mas ficam com o pai.
- **Linhas com o mesmo nome** (TC-K, TC-T, TC-E, TC-N) são separadas pela própria linha impressa. Um trecho que passa por duas linhas da tabela nunca conta como conferido.

**Outras tabelas comuns:**
- **Manual p. 8 (acessórios):** 11 de 28 conferidas e certas, 9 para conferir (os códigos de encomenda, cuja coluna o texto não amarra) e 8 que não conferem (células em duas linhas). Nenhuma conferida errada.
- **PCON-Y17 p. 11 (faixas):** 28 de 35 conferidas e certas, 7 para conferir (o cabeçalho "Control* Stability" é impresso em duas linhas). Nenhuma conferida errada.
  - Os cabeçalhos "bar" e "psi" são também unidades das células ("1 bar", "0-15 psi"). Nesse caso, a coluna é conferida pela posição na página: só conta como conferido o valor que está debaixo do próprio cabeçalho.

## Tabelas por modelo, contra o gabarito do spike

| | Folder TA p. 9 | Manual p. 5 | PCON-Y17 p. 11 |
|---|---|---|---|
| Conferidos e errados (rodadas 2 e 3) | 0 / 0 | 0 / 0 | 0 / 0 |
| Posições do gabarito conferidas e certas | 36/36 · 36/36 | 17/39 · 20/39 | 3/12 · 4/12 |
| Erros do modelo barrados pelo verificador | 0 · 0 | 9 · 9 | 0 · 0 |

- O manual p. 5 repete o que o spike viu: o modelo larga o "±" em 9 valores, e o verificador barra todos.
- O PCON-Y17 cobre pouco porque os valores trazem a condição dentro do literal. É o mesmo comportamento do caminho do spike, e esta fatia não o mudou.

## Limites honestos (o que não foi verificado)

- **Sem deploy.** O teste roda a função transpilada em Node, com o Supabase simulado. Não testei:
  - o limite de 2 s de CPU da Edge com um PDF de 23 MB (o sha256 e o envio são nativos, mas não foram medidos na Edge);
  - o limite de 150 s do plano Supabase (a chamada mais lenta levou 68 s);
  - as RPCs reais das migrações 00028 e 00029;
  - o download do Storage com RLS.
- **`deno check`** passou no contrato puro (`draft-contract.ts`, sem imports remotos). No `index.ts`, passou só com stubs locais no lugar de `std/http` e `supabase-js`, porque o Deno 1.30.3 não tem esses módulos em cache e não baixei nada.
- **A tela do pai ainda não chama a extração.** Pelo plano, quem liga isso é a 3B ("J2-lite": soltar o PDF → `extract_facts` → pendências → compilador) e a 3C (painel de pendências). Esta fatia entrega o servidor, o cliente e a revisão prontos para isso.
- **O cache aceita gravação de qualquer editor ativo pela RPC `put_v1`**, e só para um arquivo que já está no bucket. Um editor mal-intencionado poderia gravar uma resposta falsa. Mesmo assim, ela passaria pela mesma conferência local, então não vale mais do que uma resposta do modelo. A primeira resposta de cada chave fica, e o admin pode apagar a linha no SQL.
- **Páginas escaneadas e fotos.** Esse caminho existe (`photoEvidence`: todo valor vai para a pessoa conferir), mas não foi testado ao vivo.
- **Foram 3 PDFs e 2 rodadas com o código final.** A rodada 1 usou o prompt anterior, em que o modelo renomeou "Entradas" para "Faixa". O verificador recusou essas 21 células, e o prompt agora proíbe renomear colunas.
- **A conferência à mão dos gabaritos novos foi feita só pelo agente.** Vale o Gabriel conferir por amostragem as linhas da p. 6.

## Como rodar de novo

```bash
# Ao vivo (a chave vem só da variável de ambiente; nunca é impressa nem gravada)
GEMINI_API_KEY="$(cat <arquivo-da-chave>)" npx vite-node scripts/live-draft-extraction.ts -- \
  --pdf-root "<pasta CONFIGURATOR PCON>" --out <pasta-de-saída>

# Sem API: refaz a revisão sobre as respostas salvas
npx vite-node scripts/live-draft-extraction.ts -- --pdf-root "<pasta CONFIGURATOR PCON>" \
  --out docs/ai-catalog/extracao-servidor/respostas/rodada-3 --replay
```

Testes:

```bash
npx vitest run tests/vnext/ai-catalog/draft-contract.test.ts tests/vnext/ai-catalog/draft-edge.test.ts \
  tests/vnext/ai-catalog/draft-client.test.ts tests/vnext/ai-catalog/extraction-review.test.ts \
  tests/vnext/ai-catalog/fact-extraction-prompt.test.ts tests/vnext/ai-catalog/source-files-migration.test.ts
```

## O que o dono precisa fazer para ligar

1. Revisar e aplicar a migração **00028**, se ainda não foi aplicada. Sem ela, a função responde "o controle de gastos da IA ainda não foi atualizado" e não chama o Google.
2. Revisar e aplicar a migração **00029** (bucket privado e cache).
3. Fazer o deploy de `vnext-catalog-draft` a partir do SHA já mergeado em `main`.
4. Configurar os secrets `VNEXT_CATALOG_DRAFT_ENABLED=true` e `VNEXT_CATALOG_ALLOWED_ORIGINS` (o mesmo valor do composer). `VNEXT_DRAFT_GEMINI_API_KEY` é opcional: sem ela, a função usa a chave do composer.
5. Confirmar o tempo máximo das Edge Functions no plano Supabase (§5 item 11 do plano).
6. Trocar a chave Gemini temporária por uma paga e revogar a temporária.
7. Atualizar o preço do gemini-3.8-flash em `gemini-models.ts` se o Google mudar a tabela.

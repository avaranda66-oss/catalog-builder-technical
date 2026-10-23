# Números, abreviações e glossário por idioma na tradução (FR-85 / FR-87)

**Onde:** `src/vnext/translation/locale-number-format.ts`, `src/vnext/translation/glossary.ts`,
`src/vnext/translation/review-suggestions.ts`, ligados em `src/vnext/app/TranslationReview.tsx`;
guardião em `src/vnext/translation/candidate.ts` (`requireReviewText`) e leituras confirmadas em
`src/vnext/translation/review-coordinator.ts` (`confirmReading`, `snapshot.confirmedReadings`).
**Testes:** `tests/vnext/translation/{locale-number-format,glossary,review-suggestions,review-guardian}.test.ts`
e `tests/vnext/translation/translation-review-locale.test.tsx`.

## O problema

O serviço de tradução devolve os dados técnicos exatamente como no original em português:
"Exatidão: ±0,02 % FE" vira "Accuracy: ±0,02 % FE" no catálogo em inglês. O leitor americano
espera "±0.02 % FS". Além disso, os folders antigos em inglês trazem termos inconsistentes
("Ordering Code" num lugar, "Order Code" em outro) e erros de grafia ("Acuracy", "secundary").

## Regra do produto

**Nenhum valor técnico muda sem confirmação explícita da pessoa.** O módulo só sugere; a tela só
mostra botões; o guardião (`requireReviewText`) é a barreira final e recusa qualquer valor que não
seja o original ou uma forma equivalente dele no idioma de destino. O provedor de tradução continua
obrigado a devolver os dados técnicos **exatamente como na origem** (verbatim): a equivalência por
idioma só vale para trechos que passaram pelo revisor.

## Regras (pt-BR → en-US)

| Original | Sugestão | Tipo |
|---|---|---|
| `0,02` / `±0,1 °C` / `1,5 kg` / `1,5kg` | `0.02` / `±0.1 °C` / `1.5 kg` / `1.5kg` | vírgula decimal → ponto |
| `1,500 mm` (três casas, Beamex/Fluke) | `1.500 mm` — e **não** vira pergunta depois (`settled`) | vírgula decimal → ponto |
| `0,1 %/0,2 % FE` / `0,5/1,0 bar` / `Exatidão:0,02` | `0.1 %/0.2 % FS` / `0.5/1.0 bar` / `Exatidão:0.02` | barra entre decimais e rótulo sem espaço |
| `M20x1,5` / `M12x1,5` | `M20x1.5` / `M12x1.5` | rosca métrica / prensa-cabo (`decimal`) |
| `-25,5 a 140,5 °C` / `−0,5 °C` / `Ø25,4 mm` | `-25.5 a 140.5 °C` / `−0.5 °C` / `Ø25.4 mm` | decimal com sinal ou diâmetro (Onda 4C) |
| `24 Vcc` / `230 Vca` | `24 Vdc` / `230 Vac` | mesma unidade, sigla do inglês (Onda 4C) |
| `1.500,5 Pa` / `1.000.000 Pa` | `1,500.5 Pa` / `1,000,000 Pa` | milhar + decimal (não é ambíguo) |
| `% FE`, `%FE`, `% F.E.` | `% FS`, `%FS`, `% F.S.` | abreviação |
| `% da leitura`, `% leitura`, `% da leit.`, `% of reading` | `% RDG` | abreviação |
| `% do fundo de escala`, `% of full scale` | `% FS` | abreviação |
| `% RDG`, `% rdg`, `% RDG.` (fim de frase) | iguais (o ponto final fica) | já abreviado |
| `-25 a 140 °C`, `4–20 mA`, `ISO 9001`, `70 bar` | iguais | inteiros não mudam |
| `TA-25N`, `06.04.0121-00/IN1P`, `RS-485`, `2.1.3`, `192.168.0.1` | iguais | códigos e versões nunca mudam |
| `15/10/2026`, `10:30` | iguais | datas e horários nunca mudam |
| `itens 1,2 e 3`, `páginas 3,4, 5 e 6`, `see items 1,2 and 3` | iguais | vírgula de enumeração, não decimal |
| `0.05 % FS`, `0.500 mm`, `M20x1.5` | iguais | já estão em formato inglês |

**Ambíguos:** `1.500`, `10.000`, `2.000`, `12.345` (um ponto seguido de três dígitos) **nunca** são
alterados. Em português isso pode ser mil e quinhentos ("1,500" em inglês) ou já estar em formato
inglês (um vírgula cinco). O módulo devolve a dúvida em `confirmations`, com as duas leituras por
extenso, e a tela pergunta: *"Confirme: '1.500' é mil e quinhentos ou um vírgula cinco?"*. Só a
pessoa decide; a escolha é aplicada a todas as ocorrências do mesmo número no trecho e fica guardada
no coordenador (`confirmReading`), então fechar e reabrir a revisão não pergunta de novo nem desfaz.

**Faixas com hífen e unidade:** `1.500-2.000 mbar`, `0-10.000 psi`, `1.500–2.000 mbar` são
reconhecidas como faixa (traço + número + unidade da lista do protetor) e **cada lado vira uma
confirmação**; a pessoa também pode digitar a forma inglesa (`0-10,000 psi`) e o guardião aceita.
Sem unidade (`1.500-2.000`, `Código 1.234-5`, `1.234-5.678`) o traço pode ser código: nada é
sugerido e só a forma original passa.

**Enumerações:** vírgula seguida de **um** dígito e depois ` e `/` and `/` y `/`, ` + inteiro sem
separador (`itens 1,2 e 3`, `páginas 3,4, 5 e 6`), ou antecedida por "itens/páginas/figuras/tabelas/
seções/capítulos/passos/etapas" (e os equivalentes em inglês), não é decimal. Listas de decimais
(`0,5 e 1,0 bar`, `1,5, mas…`) continuam sendo convertidas. `páginas 3,4` no fim do texto sem palavra
de lista antes ainda é lido como decimal (limite conhecido).

## Regras (pt-BR → es-ES)

Números ficam como estão (vírgula decimal e ponto de milhar valem nos dois idiomas), "% FE" fica.
Só "% da leitura" → "% de la lectura" e "% do fundo de escala" → "% FE". Não há perguntas.
`M20x1,5` fica.

## Glossário PRESYS (FR-87)

`glossaryTerms()` traz os pares fixos PT/EN/ES (Faixa de Operação / Operating Range / Rango de
Operación; Código de Encomenda / Order Code / Código de Pedido; Fornecimento Padrão / Standard
Delivery / Suministro Estándar; Exatidão / Accuracy / Exactitud; Poço Seco / Dry Block / Bloque
Seco; …). As grafias em inglês foram conferidas nos folders reais (TA-25N/35N/50N, PCON-Y17,
PCON-Y18 LP, Kompressor Y18).

- `findGlossaryHints(original, tradução, idioma)` devolve `{ sourceTerm, expected, found? }` quando
  o original contém um termo do glossário e a tradução **não** contém o termo esperado. A comparação
  ignora acentos, caixa e espaços duplos, exige palavra inteira e tolera singular/plural da última
  palavra, inclusive os irregulares dos termos: accessory/accessories, dimensão/dimensões,
  opcional/opcionais, dimensión/dimensiones ("Acessório incluso" → "Accessory included" não gera
  aviso). `found` aparece quando a tradução usou uma forma conhecida no lugar ("Ordering Code",
  "Precisión", "Dry Well", "Size"); só então a tela oferece o botão de troca, e só se a forma
  aparecer uma única vez no trecho (troca determinística). Fora disso é só aviso.
- `findKnownMisspellings(texto)` aponta erros vistos nos folders EN ("secundary", "Acuracy",
  "availables", "pression") e outros do mesmo tipo ("Choosen", "Ressolution", "Temperture",
  "Conection", …), palavra inteira, mantendo a caixa da ocorrência. Só para inglês.
- As expressões do glossário e das grafias são compiladas uma vez por módulo: a revisão recalcula
  as dicas a cada tecla.

## Como aparece na revisão

Em cada trecho da tela **Centro de Tradução**, abaixo das colunas original/tradução:

- *Números e abreviações no formato do inglês: `0,02 → 0.02 · % FE → % FS`* + botão
  **Aplicar ajuste de números (N)**.
- *Confirme: '1.500' é mil e quinhentos ou um vírgula cinco?* + dois botões com a leitura e o valor
  (os botões apontam para a pergunta com `aria-describedby`).
- *Glossário PRESYS: use 'Order Code' no lugar de 'Ordering Code'.* + botão **Usar 'Order Code'**
  (sem botão quando a forma usada não é reconhecida ou aparece mais de uma vez).
- *Grafia a corrigir: 'Acuracy' → 'Accuracy'* + botão **Corrigir grafia (Accuracy)**.

Todo botão passa pelo `coordinator.correct`, igual a uma correção digitada: o trecho fica
"Corrigido e revisado" e entra na contagem de correções. Depois do clique o foco volta ao texto do
trecho (o botão desaparece). Nada é aplicado sozinho; as sugestões são recalculadas sobre o
rascunho atual e desaparecem quando deixam de valer.

**A tela nunca oferece o que o guardião recusa:** `reviewSuggestions` testa cada texto resultante
(ajuste de números, cada leitura de uma pergunta, troca de glossário, correção de grafia) com
`technicalTextEquivalentForLocale`; o que falharia some antes de virar botão. Em especial:

- o ajuste de números nunca propõe "1,500 → 1.500" quando a origem tem o ambíguo "1.500": as duas
  leituras de cada número ambíguo da origem entram em `sourceReadings` e não recebem mudança
  (a pessoa pode ter digitado "1,500 mbar" à mão em vez de usar o botão);
- "1,500 mm" → "1.500 mm" devolve `settled: ['1.500']`; a tela guarda esse valor como leitura
  confirmada e a pergunta não aparece depois de aplicado (os `settled` da origem também entram em
  `keep`).

## Guarda de valores técnicos

`requireReviewText(origem, tradução, idioma)` continua exigindo os mesmos dados técnicos. Com o
idioma, aceita por dado as formas equivalentes calculadas **a partir do contexto da frase de origem**
(`localeTokenRenderingsInContext`): o original, cada aplicação parcial das mudanças ("0,02 % FS"
ainda vale) e cada leitura de um número ambíguo ("1.500 mbar" ou "1,500 mbar"). A comparação é
**por posição** (ordem no texto); se a tradução mudou a ordem dos dados, cada um ainda precisa casar
com uma forma de algum dado da origem. Duas formas iguais na tradução só podem vir de dados iguais
na origem ("1.500 mbar" e "1,500 mbar" nunca viram dois "1.500 mbar"). Quando uma abreviação junta
dois dados protegidos num só ("0,5 % do fundo de escala" → "0.5 % FS"; em espanhol "0,5 % FE"), a
origem é comparada de novo depois de aplicar só as abreviações. Qualquer outra diferença (`0.2`,
`TA-35N`, unidade trocada, dado a mais ou a menos, "Code 1,234-5" para "Código 1.234-5") continua
recusada com `TECHNICAL_TOKEN_MISMATCH`.

Sem o idioma, a comparação é exata como antes. `materializeTranslationCandidate` só passa o idioma
para trechos corrigidos pelo revisor: o texto do provedor precisa trazer os dados técnicos verbatim
("1,500 mbar" vindo do provedor para a origem "1.500 mbar" é recusado em `generate()` e em
`accept()`).

## O que NÃO faz

- Não traduz prosa nem inventa unidades; só mexe em números com separador e nas abreviações listadas.
- Não altera inteiros, códigos, normas, versões, datas, horários nem números colados a letras
  (exceto a rosca métrica `M20x1,5`) ou a hífen sem unidade (`1.500-2.000`, `1.234-5` ficam para a pessoa).
- Não decide números ambíguos; não aplica nada sem clique.
- Não lista erros de grafia em espanhol; o glossário em espanhol é só aviso + troca determinística.
- Não cobre pt-PT, en-GB, es-MX (sem perfil ativo).

## Limites conhecidos

- O protetor só protege "%" quando a abreviação está por extenso: para a origem "0,5 % do fundo de
  escala", o guardião não distingue "0.5 % FS" de "0.5 % RDG" (com "% FE"/"% FS" na origem ele
  distingue). Fechar isso exige o protetor reconhecer "% do fundo de escala"/"% of full scale"
  (muda os placeholders e a versão da política de tokens — fora desta etapa).
- A lista de unidades que fecham uma faixa é copiada do protetor (`RANGE_UNITS`); um teste cruza as
  duas listas para não divergirem.
- Se a mesma frase da origem tiver "1,500 mm" (decimal) e "1.500 mbar" (ambíguo), o "1.500" decidido
  pela origem cala a pergunta do ambíguo (comparação por valor, não por posição, dentro de `keep`).
- `páginas 3,4` no fim do texto, sem palavra de lista antes, ainda é tratado como decimal.
- A equivalência aceita aplicações parciais ("0,02 % FS") para não travar quem edita à mão.

## No servidor (Onda 4C, feito)

O glossário passou para `src/vnext/translation/presys-glossary.ts` (versionado, `presys-glossary-v1`,
sem imports) e `glossary.ts` lê os mesmos dados. O gateway `vnext-translation-provider`:

1. troca marcas e modelos (PRESYS, Kompressor, MCS-XV, ST-501, KOMPRESSOR-Y18 e qualquer código em
   MAIÚSCULAS com hífen e dígito) por `[[VNEXT_KEEP_nnn]]` antes do Gemini e os devolve byte a byte;
   marcador perdido, repetido ou inventado recusa a resposta;
2. manda no pedido só os termos do glossário presentes no lote (`glossary`, `glossaryVersion`);
3. limita a resposta com `responseSchema` (`maxItems`/`maxLength` em tudo).

A resposta continua com os dados protegidos exatamente como na origem: `changes`/`confirmations`
seguem calculados na tela de revisão, e a aplicação continua sendo da pessoa. Prova real e números:
`docs/ai-catalog/IDIOMAS.md`.

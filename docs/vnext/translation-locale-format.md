# Números, abreviações e glossário por idioma na tradução (FR-85 / FR-87)

**Onde:** `src/vnext/translation/locale-number-format.ts`, `src/vnext/translation/glossary.ts`,
`src/vnext/translation/review-suggestions.ts`, ligados em `src/vnext/app/TranslationReview.tsx`.
**Testes:** `tests/vnext/translation/{locale-number-format,glossary}.test.ts` e
`tests/vnext/translation/translation-review-locale.test.tsx`.

## O problema

O serviço de tradução devolve os dados técnicos exatamente como no original em português:
"Exatidão: ±0,02 % FE" vira "Accuracy: ±0,02 % FE" no catálogo em inglês. O leitor americano
espera "±0.02 % FS". Além disso, os folders antigos em inglês trazem termos inconsistentes
("Ordering Code" num lugar, "Order Code" em outro) e erros de grafia ("Acuracy", "secundary").

## Regras (pt-BR → en-US)

| Original | Sugestão | Tipo |
|---|---|---|
| `0,02` / `±0,1 °C` / `1,5 kg` | `0.02` / `±0.1 °C` / `1.5 kg` | vírgula decimal → ponto |
| `1.500,5 Pa` / `1.000.000 Pa` | `1,500.5 Pa` / `1,000,000 Pa` | milhar + decimal (não é ambíguo) |
| `% FE`, `%FE`, `% F.E.` | `% FS`, `%FS`, `% F.S.` | abreviação |
| `% da leitura`, `% leitura`, `% da leit.`, `% of reading` | `% RDG` | abreviação |
| `% do fundo de escala`, `% of full scale` | `% FS` | abreviação |
| `-25 a 140 °C`, `4–20 mA`, `ISO 9001`, `70 bar` | iguais | inteiros não mudam |
| `TA-25N`, `06.04.0121-00/IN1P`, `RS-485`, `2.1.3`, `192.168.0.1` | iguais | códigos e versões nunca mudam |
| `15/10/2026`, `10:30` | iguais | datas e horários nunca mudam |
| `0.05 % FS`, `0.500 mm` | iguais | já estão em formato inglês |

**Ambíguos:** `1.500`, `10.000`, `2.000`, `12.345` (um ponto seguido de três dígitos) **nunca** são
alterados. Em português isso pode ser mil e quinhentos ("1,500" em inglês) ou já estar em formato
inglês (um vírgula cinco). O módulo devolve a dúvida em `confirmations`, com as duas leituras por
extenso, e a tela pergunta: *"Confirme: '1.500' é mil e quinhentos ou um vírgula cinco?"*. Só a
pessoa decide; a escolha é aplicada a todas as ocorrências do mesmo número no trecho.

## Regras (pt-BR → es-ES)

Números ficam como estão (vírgula decimal e ponto de milhar valem nos dois idiomas), "% FE" fica.
Só "% da leitura" → "% de la lectura" e "% do fundo de escala" → "% FE". Não há perguntas.

## Glossário PRESYS (FR-87)

`glossaryTerms()` traz os pares fixos PT/EN/ES (Faixa de Operação / Operating Range / Rango de
Operación; Código de Encomenda / Order Code / Código de Pedido; Fornecimento Padrão / Standard
Delivery / Suministro Estándar; Exatidão / Accuracy / Exactitud; Poço Seco / Dry Block / Bloque
Seco; …). As grafias em inglês foram conferidas nos folders reais (TA-25N/35N/50N, PCON-Y17,
PCON-Y18 LP, Kompressor Y18).

- `findGlossaryHints(original, tradução, idioma)` devolve `{ sourceTerm, expected, found? }` quando
  o original contém um termo do glossário e a tradução **não** contém o termo esperado. A comparação
  ignora acentos, caixa e espaços duplos, exige palavra inteira e tolera plural simples.
  `found` aparece quando a tradução usou uma forma conhecida no lugar ("Ordering Code",
  "Precisión", "Dry Well"); só então a tela oferece o botão de troca, e só se a forma aparecer
  uma única vez no trecho (troca determinística). Fora disso é só aviso.
- `findKnownMisspellings(texto)` aponta erros vistos nos folders EN ("secundary", "Acuracy",
  "availables", "pression") e outros do mesmo tipo ("Choosen", "Ressolution", "Temperture",
  "Conection", …), palavra inteira, mantendo a caixa da ocorrência. Só para inglês.

## Como aparece na revisão

Em cada trecho da tela **Centro de Tradução**, abaixo das colunas original/tradução:

- *Números e abreviações no formato do inglês: `0,02 → 0.02 · % FE → % FS`* + botão
  **Aplicar ajuste de números (N)**.
- *Confirme: '1.500' é mil e quinhentos ou um vírgula cinco?* + dois botões com a leitura e o valor.
- *Glossário PRESYS: use 'Order Code' no lugar de 'Ordering Code'.* + botão **Usar 'Order Code'**
  (sem botão quando a forma usada não é reconhecida ou aparece mais de uma vez).
- *Grafia a corrigir: 'Acuracy' → 'Accuracy'* + botão **Corrigir grafia (Accuracy)**.

Todo botão passa pelo `coordinator.correct`, igual a uma correção digitada: o trecho fica
"Corrigido e revisado" e entra na contagem de correções. Nada é aplicado sozinho; as sugestões
são recalculadas sobre o rascunho atual e desaparecem quando deixam de valer.

## Guarda de valores técnicos

`requireReviewText(origem, tradução, idioma)` continua exigindo os mesmos dados técnicos, mas
agora aceita, por dado, as formas equivalentes do idioma (`localeTokenRenderings`): o original,
cada aplicação parcial das mudanças ("0,02 % FS" ainda vale) e cada leitura de um número ambíguo
("1.500 mbar" ou "1,500 mbar"). Qualquer outra diferença (`0.2`, `TA-35N`, unidade trocada,
dado a mais ou a menos) continua recusada com `TECHNICAL_TOKEN_MISMATCH`. Sem o idioma, a
comparação é exata como antes (compatível com os testes existentes).

## O que NÃO faz

- Não traduz prosa nem inventa unidades; só mexe em números com separador e nas abreviações listadas.
- Não altera inteiros, códigos, normas, versões, datas, horários nem números colados a letras ou a
  hífen de código (`1.500-2.000` fica para a pessoa).
- Não decide números ambíguos; não aplica nada sem clique.
- Não lista erros de grafia em espanhol; o glossário em espanhol é só aviso + troca determinística.
- Não cobre pt-PT, en-GB, es-MX (sem perfil ativo).

## Reuso no servidor (Onda 4C)

Os três módulos são puros (sem DOM, sem React, sem dependências do app). O gateway
`vnext-translation-provider` pode importá-los com caminho `.ts` explícito, como já faz com
`language-registry.ts`, para:

1. anexar `changes`/`confirmations` por trecho na resposta (sem alterar `translatedText`, que
   precisa continuar com os dados protegidos exatamente como na origem);
2. incluir no prompt o glossário fixo (`glossaryTerms()`) e a lista de erros conhecidos
   (`knownMisspellings()`), reduzindo o retrabalho na revisão.

A aplicação continua sendo da pessoa, na tela de revisão.

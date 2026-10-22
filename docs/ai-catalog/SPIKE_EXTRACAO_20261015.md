# Spike de extração de fatos com Gemini (FR-66a) — 15/10/2026

## Decisão: GO para a 2F, com 6 condições

- **Critério do plano (§3 FR-66a): zero valor errado marcado como VERIFIED.** Atendido na rodada final, para o que foi extraído.
  - Foram 18 chamadas reais: 3 modelos × 3 PDFs × 2 repetições.
  - Saíram 360 valores VERIFIED_TEXT, e todos conferem com o gabarito.
  - O gabarito tem 87 posições por rodada, conferidas à mão nas páginas renderizadas.
  - Além disso, 33 valores foram conferidos um a um na imagem da página (tabela na seção 6).
- **Antes das correções deste spike, o critério falhava.**
  - Houve 1 valor errado marcado como VERIFIED: o "±" do manual em português é um caractere privado da fonte Symbol (U+F0B1).
  - O modelo copiou esse caractere e o verificador achou o mesmo caractere na página. No catálogo, isso sairia como "□ 0,1 ºC".
  - A correção está na seção 4.
- **Modelo recomendado: `gemini-3.8-flash`** (seção 7).
- **Divergências conhecidas do TA-25N (155 x 140 °C e as outras):** detectadas nas 6 rodadas finais, nos 3 modelos (seção 5).
- **Lacuna: a p. 6 do manual não deu nenhum valor.**
  - O plano pede o manual TA-PT p. 5–6. A p. 6 é a tabela "1.1.1 - Especificações Técnicas da Entrada" (mV, mA, resistência, Pt-100, termopares; colunas Resolução e Exatidão).
  - Nas 36 respostas salvas (v1 e v2), essa página teve 0 valores. O motivo provável é o formato pedido: um valor por modelo e por linha. Essa tabela vale para os três modelos e não tem coluna de modelo, então não cabe nesse formato (seção 9).
  - Ela some sem aviso: não aparece como "não encontrado" nem como valor descartado.
  - O GO vale para as p. 9 do folder, 5 do manual e 11 do Y17. A p. 6 é a condição 5.
- **As 6 condições para a 2F estão na seção 8.**

## 1. O que foi rodado

| Item | Valor |
|---|---|
| Script | `scripts/extract-facts.ts`, ajudantes puros em `scripts/extract-facts-eval.ts`. Não entra no bundle: nada em `src/` importa esses arquivos |
| Contrato da extração | `src/vnext/ai-catalog/fact-extraction.ts`: prompt, `responseSchema` (ProductFactSheet), normalização para `FactProposal`, ajuste de trecho e divergências. É reaproveitável pela 2F e não é importado pela UI |
| Plano da rodada | `docs/ai-catalog/spike-extracao/plan.json` |
| Gabarito | `docs/ai-catalog/spike-extracao/gabarito.json` |
| Respostas salvas | `docs/ai-catalog/spike-extracao/respostas/prompt-v1/raw` e `respostas/prompt-v2/raw` (36 respostas, sem chave) |
| Prompt final | `fr66a-2026-10-15.2`, temperatura 0, `thinkingLevel: low` (0 tokens de raciocínio nos 3 modelos), `mediaResolution` médio, até 16 384 tokens de saída |
| Envio do PDF | `inline application/pdf` até 18 MB. Acima disso, Files API: o PCON-Y17 tem 23 MB e o upload levou 14,4 s, uma vez só |

**PDFs (reais, do disco):**

| Id | Arquivo | Páginas enviadas | Páginas que deram valores | sha256 (início) |
|---|---|---|---|---|
| ta-folder | `catalogospdf/presys-ta-folder (4).pdf` (20 p., 3,2 MB, inglês) | 9–13 | só a 9. As p. 10–13 são de outros modelos (TA-25NL, TA-35NLL, TA-350PL, TA-350P…) e foram ignoradas, como pedido | `9b71f3f7d92f` |
| ta-manual-pt | `banhos-termicos-tipo-bloco-seco-ta-25n-ta-35n-ta-50n-industrial-avancada-manual (1).pdf` (39 p., 2,7 MB) | 5–8 | só a 5. **A p. 6 (tabela de entradas) deu 0 valores** (seção 9). A p. 7 traz o código de encomenda como imagem e a p. 8, acessórios | `cfa15db3a434` |
| y17-folder | `presyspdfs/pressure-controller-pcon-y17-folder.pdf` (12 p., 23 MB) | 11 | 11 | `7fe22a45ea61` |

São 10 páginas enviadas; os valores vieram de 3 delas. Contagem nas 36 respostas: 432 leituras na p. 9 do folder, 468 na p. 5 do manual, 114 na p. 11 do Y17 e nenhuma em outra página.

**Caminho de cada valor (o mesmo que a 2F deve usar):**
1. `pdf-intake` lê o texto nativo.
2. `withNormalizedSymbols` normaliza esse texto.
3. `pdfEvidenceSource` monta a evidência.
4. A resposta do Gemini passa por `toFactProposal` e depois por `fitQuotesToPages`.
5. `verifyFactProposal` (FR-67) dá o status de cada valor.
6. O status é comparado com o gabarito.

O modelo nunca é confiado: só o texto do próprio arquivo decide o status.

## 2. Resultado por modelo (rodada final, prompt v2, 2 repetições)

| | gemini-3.5-flash-lite | gemini-3.5-flash | **gemini-3.8-flash** |
|---|---|---|---|
| Modelo que respondeu (`modelVersion`) | 3.5-flash-lite | **3.6-flash** (o 3.5 foi descontinuado e é redirecionado) | 3.8-flash |
| Chamadas ok | 6/6 | 6/6 | 6/6 |
| Tempo médio / máximo por chamada | 12,2 s / 16,7 s | 16,8 s / 22,9 s | 19,1 s / 27,0 s |
| Tokens (6 chamadas): entrada / saída / raciocínio | 80 420 / 19 257 / 0 | 80 420 / 19 591 / 0 | 80 420 / 19 281 / 0 |
| Custo das 6 chamadas (média por chamada) | US$ 0,072 (0,012) | US$ 0,134 (0,022) | US$ 0,133 (0,022) |
| VERIFIED_TEXT | 117 (73,6 %) | 119 (70,8 %) | **124 (72,9 %)** |
| VISUAL_ONLY (pessoa confere na página) | 16 (10,1 %) | 10 (6,0 %) | 13 (7,6 %) |
| UNVERIFIED | 26 (16,4 %) | 39 (23,2 %) | 33 (19,4 %) |
| **VERIFIED errados (go/no-go)** | **0** | **0** | **0** |
| Erros do modelo barrados pelo verificador | 0 | 9 | 1 |
| Cobertura: posições do gabarito com valor certo e VERIFIED | 119/174 | 119/174 | **123/174** |
| Cobertura: posições com valor certo, em qualquer status | 159/174 | 157/174 | **166/174** |
| Trechos ajustados por `fitQuotesToPages` | 6 | 0 | 6 |

As porcentagens contam só as posições em que o modelo leu um valor. Fica de fora o MISSING estrutural: a linha "Cooling Time" é dividida por condição, e cada parte deixa 2 modelos sem valor.

**Por arquivo, com o gemini-3.8-flash (média por chamada):**

| Arquivo | Tempo | Custo | Entrada / saída | VERIFIED / VISUAL_ONLY / UNVERIFIED |
|---|---|---|---|---|
| Folder TA (p. 9–13) | 21,6 s | US$ 0,023 | 11 444 / 3 774 | 36 / 0 / 0 |
| Manual TA PT (p. 5–8) | 26,3 s | US$ 0,034 | 21 586 / 4 768 | 21 / 6 / 12 |
| Folder PCON-Y17 (p. 11) | 9,4 s (+14,4 s de upload) | US$ 0,0095 | 7 180 / 1 099 | 5 / 0,5 / 4,5 |

**Por que o manual tem 12 UNVERIFIED por rodada:** na camada de texto, a tabela do manual quebra os rótulos em duas linhas, intercaladas com os valores. São as linhas "Uniformidade Axial / (40mm) Bloco Seco", "Tempo de / Resfriamento" e "Diâmetro / Profundidade do Poço". O trecho citado pelo modelo não aparece em sequência no texto. Esses valores estão certos (cobertura "qualquer status" de 166/174), mas vão para a pessoa conferir. Nada se perde, e nada é aceito sem prova.

## 3. Primeira rodada (prompt v1, antes das correções)

| | lite | 3.5-flash (3.6) | 3.8-flash |
|---|---|---|---|
| VERIFIED marcados como errados pelo gabarito | 4 | 0 | 3 |
| Errados de verdade, conferidos à mão | **1** | 0 | 0 |

A conferência à mão dos 7 alertas:
- **Erro real (lite, manual, TA-35N, "Exatidão do Display"):** o valor lido foi `" 0,1"`, com o "±" como caractere privado. Ele foi marcado como VERIFIED e no catálogo sairia um quadradinho.
- **Os outros 6 eram falha do próprio gabarito automático:**
  - unidade `°C*` (3 valores do 3.8-flash);
  - DT e RM juntos num valor só, exatamente como a página imprime (2 valores do lite);
  - unidade `Vac 50/60 Hz` (1 valor do lite).
  - O comparador passou a tratar esses casos, com testes.
- As mesmas respostas da v1, reprocessadas com o código final (sem chamar a API), dão **0 / 0 / 0** VERIFIED errados e cobertura de 121, 121 e 122 de 174.

## 4. Correções feitas no spike (em `fact-extraction.ts`, com testes)

1. **Sinais da fonte Symbol (`normalizeSymbolText`, `withNormalizedSymbols`).**
   - Troca feita: U+F0B1 → ±, U+F0B0 → °, U+F057 → Ω, U+F06D → µ e outros sinais de especificação.
   - Os sinais de diâmetro (U+F0C6, ∅, ⌀) viram "Ø", que a Noto Sans do catálogo tem; ∅ e ⌀ ela não tem.
   - Cada caractere vira um só, então as posições do texto não mudam.
   - A troca vale igual para a evidência (texto do PDF) e para a resposta do modelo. A verificação continua comparando texto exato.
   - **Limite: a troca não olha a fonte.** Wingdings e Wingdings 2 usam a mesma faixa de caracteres privados para marcadores e desenhos. Lá, U+F0B7, U+F06D e U+F057 não são sinais.
     - No manual TA, todos os caracteres trocados vêm da fonte Symbol. Conferi isso pelo nome da fonte no pdf.js, nas p. 5 a 8 e 32.
     - As marcas da Wingdings 2 na p. 32 (U+F050 x11 e U+F04F x4) não estão na tabela de troca.
     - No spike isso é inofensivo: um desenho trocado por engano só deixa de conferir.
     - No `pdf-intake`, a troca mudaria o texto do catálogo. Por isso, lá ela precisa valer só para trechos com fonte Symbol (condição 1). Hoje os trechos do `pdf-intake` não guardam o nome da fonte.
2. **Marcas de nota.** `°C*` vira `°C` na unidade, e `(*) Temperatura Ambiente: 20ºC.` vira `Temperatura Ambiente: 20ºC.` na condição. Expoentes continuam: `m²` não é nota.
3. **Prompt v2:**
   - pede só a primeira linha de um rótulo de duas linhas no trecho, e unidade sem asterisco;
   - o 3.6-flash obedeceu; o lite e o 3.8 não.
4. **`fitQuotesToPages`:**
   - **Situação:** o folder imprime "Operating Range" sobre "ambient temperature: 23 °C". O texto do PDF lê rótulo, valores, nota; o modelo cita rótulo, nota, valores, sequência que não existe no texto.
   - **O que faz:** se o trecho não está na página e a condição da linha está entre o rótulo e o valor, usa o trecho sem a condição, só se esse trecho menor estiver na página.
   - **O que nunca muda:** valor, unidade e condição. Um trecho que já está na página também não é tocado. O verificador confere tudo de novo.
   - **Efeito:** foram 6 ajustes por modelo (lite e 3.8), e com eles a faixa de operação do folder passou a ser verificada.
5. **Divergências (`findSourceDivergences`, `divergenceMessage`):**
   - o que só um arquivo acrescenta não conta como divergência: um parêntese como "(0,01 ºF)" ou "(25 °C to 140 °C)", ou uma alternativa depois de "ou"/"or";
   - um sinal perdido ou números diferentes contam;
   - cada leitura mantém o status que teve no próprio arquivo e no próprio idioma; não é verificada de novo sob o rótulo do outro idioma.
   - A versão anterior reverificava assim e perdia o conflito da faixa: "Faixa de Operação" não está no folder em inglês.
6. **Gabarito (`extract-facts-eval.ts`):**
   - aceita todas as versões num valor só, na ordem da página;
   - aceita a unidade que levou junto a condição impressa ao lado;
   - registra 3 leituras conferidas à mão na imagem (`adjudications` no `gabarito.json`).

## 5. Divergências entre o folder (inglês) e o manual PT do TA

Detectadas automaticamente nas **6 de 6 rodadas finais**, pelos 3 modelos. Antes do ajuste de trecho, a faixa aparecia em só 1 de 6 rodadas na v1 (3.8-flash, rodada 1) e em 2 de 6 na v2 (as duas do 3.6-flash).

| Item | Folder p. 9 | Manual PT p. 5 | Modelos |
|---|---|---|---|
| **Faixa de operação** | -25 / -35 / -50 °C to **+155 °C**, *ambient temperature: **23 °C*** | -25 / -35 / -50 a **140 °C**, *Temperatura Ambiente: **20ºC*** | TA-25N, 35N, 50N |
| **Dimensões** | **260 x 200 x 305 mm** (25N); **315 x 200 x 305 mm** (35N, 50N), "HxWxD" | **354,5 x 206 x 318 mm** (os três), "AxLxP" | TA-25N, 35N, 50N |
| **Estabilidade** (achado novo) | **± 0.02 °C** | **0,02 ºC** ou 0,04 ºF (sem "±") | TA-25N, 35N, 50N |

**Vistas à mão, mas não detectadas** (o modelo não extrai o código de encomenda, que no manual é imagem):
- alimentação "1 - 115 Vac / 2 - 230 Vac" no folder p. 9, contra "1 - 110 Vca / 2 - 220 Vca" no manual p. 7;
- o selo "-50 to 155 ºC" do folder.

O pai veria a mensagem assim (texto real do script, gemini-3.8-flash):

> TA-25N · Operating Range: As fontes divergem: -25 °C to +155 °C (ambient temperature: 23 °C) na página 9 de presys-ta-folder (4).pdf; -25 a 140 °C (Temperatura Ambiente: 20ºC.) na página 5 de banhos-termicos-tipo-bloco-seco-ta-25n-ta-35n-ta-50n-industrial-avancada-manual (1).pdf. Escolha o valor certo.

## 6. Conferência à mão: 33 valores

**Método:**
- Renderizei as páginas: folder p. 9, manual p. 5 e p. 7, PCON-Y17 p. 11.
- Li cada valor na imagem e comparei com o que o `gemini-3.8-flash` devolveu (rodada 1, prompt v2) e com o status dado pelo verificador.
- Os 360 VERIFIED das 18 chamadas também foram comparados com o gabarito, que eu conferi linha a linha nessas mesmas imagens.

| # | Página | Modelo | Linha | Lido pela IA | Status | Impresso na página | Confere |
|---|---|---|---|---|---|---|---|
| 1 | Folder p. 9 | TA-25N | Operating Range | -25 °C to +155 °C (ambient temperature: 23 °C) | VERIFIED | -25 °C to +155 °C, ambient temperature: 23 °C | sim |
| 2 | Folder p. 9 | TA-35N | Operating Range | -35 °C to +155 °C | VERIFIED | -35 °C to +155 °C | sim |
| 3 | Folder p. 9 | TA-50N | Operating Range | -50 °C to +155 °C | VERIFIED | -50 °C to +155 °C | sim |
| 4 | Folder p. 9 | TA-25N | Display Accuracy | ± 0.1 °C, Full range | VERIFIED | ± 0.1 °C Full range | sim |
| 5 | Folder p. 9 | TA-25N | Resolution | 0.01 °C | VERIFIED | 0.01 °C | sim |
| 6 | Folder p. 9 | TA-25N | Stability | ± 0.02 °C | VERIFIED | ± 0.02 °C | sim |
| 7 | Folder p. 9 | TA-25N | Axial Uniformity (40 mm) | ± 0.05 °C, Full range | VERIFIED | ± 0.05 °C Full range | sim |
| 8 | Folder p. 9 | TA-35N | Axial Uniformity (40 mm) | ± 0.06 °C | VERIFIED | ± 0.06 °C Full range | sim |
| 9 | Folder p. 9 | TA-50N | Axial Uniformity (40 mm) | ± 0.07 °C | VERIFIED | ± 0.07 °C Full range | sim |
| 10 | Folder p. 9 | TA-50N | Radial Uniformity | ± 0.02 °C | VERIFIED | ± 0.02 °C Full range | sim |
| 11 | Folder p. 9 | TA-35N | Heating Time | 16 min (condição: 25 °C to 140 °C) | VERIFIED | 16 min (25 °C to 140 °C) | sim |
| 12 | Folder p. 9 | TA-50N | Heating Time | 11 min (condição: 25 °C to 140 °C) | VERIFIED | 11 min (25 °C to 140 °C) | sim |
| 13 | Folder p. 9 | TA-50N | Cooling Time | 25 min (condição: 25 °C to -50 °C) | VERIFIED | 25 min (25 °C to -50 °C) | sim |
| 14 | Folder p. 9 | TA-35N | Electric Power | 300 W | VERIFIED | 300 W | sim |
| 15 | Folder p. 9 | TA-25N | Well Diameter x Depth | Ø 25.4 mm (1”) x 124 mm | VERIFIED | Ø 25.4 mm (1”) x 124 mm | sim |
| 16 | Folder p. 9 | TA-50N | Weight | 12.5 kg | VERIFIED | 12.5 kg | sim |
| 17 | Folder p. 9 | TA-25N | Dimension (HxWxD) | 260 x 200 x 305 mm | VERIFIED | 260 x 200 x 305 mm | sim |
| 18 | Folder p. 9 | TA-35N | Dimension (HxWxD) | 315 x 200 x 305 mm | VERIFIED | 315 x 200 x 305 mm | sim |
| 19 | Manual p. 5 | TA-25N | Faixa de Operação | -25 a 140 °C (Temperatura Ambiente: 20ºC.) | VERIFIED | -25 a 140 °C*, nota (*) Temperatura Ambiente: 20ºC. | sim |
| 20 | Manual p. 5 | TA-50N | Faixa de Operação | -50 a 140 °C | VERIFIED | -50 a 140 °C* | sim |
| 21 | Manual p. 5 | TA-35N | Exatidão do Display | ± 0,1 ºC | VERIFIED | ± 0,1 ºC (célula única para os 3) | sim |
| 22 | Manual p. 5 | TA-25N | Exatidão do Display | ± 0,1 ºC | VISUAL_ONLY | ± 0,1 ºC (célula única) | sim; o texto não diz a coluna, então vai para a pessoa |
| 23 | Manual p. 5 | TA-35N | Resolução | 0,01 ºC (0,01 ºF) | VERIFIED | 0,01 ºC (0,01 ºF) | sim |
| 24 | Manual p. 5 | TA-35N | Estabilidade | 0,02 ºC ou 0,04 ºF | VERIFIED | 0,02 ºC ou 0,04 ºF (sem ±) | sim |
| 25 | Manual p. 5 | TA-25N | Tempo de Aquecimento | 10 min (condição: 25 a 140 °C) | VERIFIED | 10 min (25 a 140 °C) | sim |
| 26 | Manual p. 5 | TA-50N | Potência Elétrica | 400 W | VERIFIED | 400 W | sim |
| 27 | Manual p. 5 | TA-50N | Peso | 12,5 kg | VERIFIED | 12,5 kg | sim |
| 28 | Manual p. 5 | TA-25N | Dimensões (AxLxP) | 354,5x206x318 mm | VERIFIED | 354,5x206x318mm | sim |
| 29 | Manual p. 5 | TA-25N | Garantia | 1 ano, exceto para elementos de efeito Peltier | VERIFIED | 1 ano, exceto para elementos de efeito Peltier | sim |
| 30 | Y17 p. 11 | PCON-Y17 | Accuracy (BR) | 0,16 mmHg / 0,2 mbar (BR - Barometric Reference…) | VERIFIED | Accuracy 0,16 mmHg / 0,2 mbar, sob "BR - Barometric Reference" | sim, com risco: mesmo rótulo da exatidão do controlador (± 0.012 % FS); a condição precisa aparecer na tabela |
| 31 | Y17 p. 11 | PCON-Y17 | Operating Ambient | 0 to 50 °C (90 % maximum relative humidity) | VERIFIED | 0 to 50 °C, 90 % maximum relative humidity | sim |
| 32 | Y17 p. 11 | PCON-Y17 | Dimensions (DT) | 125 mm x 300 mm x 265 mm (DT Version) | VERIFIED | 125 mm x 300 mm x 265 mm (DT Version) | sim |
| 33 | Y17 p. 11 | PCON-Y17 | Dimensions (RM) | 132 mm x 483 mm x 300 mm (RM Version) | VERIFIED | 132 mm x 483 mm x 300 mm (RM Version) | sim |

**Erros dos modelos que o verificador barrou** (nenhum chegou a VERIFIED):

| Erro | Onde | Status dado |
|---|---|---|
| "±" largado: "0,1", "0,05" etc., 9 valores | 3.6-flash, manual, rodada 2 | UNVERIFIED (o verificador recusa um valor que deixou o sinal para trás) |
| "±" posto na condição e o valor sem sinal, 9 valores | 3.8-flash, manual, v1 | UNVERIFIED |
| Nota "Temperatura Ambiente: 20ºC." colada nos tempos de aquecimento e resfriamento (ela vale só para a faixa) | lite, manual, v1 | VISUAL_ONLY / UNVERIFIED |
| "90 % maximum" com unidade "%" (sairia "90 % maximum %") | 3.8-flash, Y17 | UNVERIFIED |

**Instabilidade observada:**
- O lite, na rodada 1 da v2, devolveu só 2 valores do PCON-Y17 (366 tokens de saída). Na rodada 2 devolveu 7.
- Não é valor errado, mas é cobertura que oscila.

## 7. Recomendação de modelo: `gemini-3.8-flash`

- **Por que o 3.8-flash:**
  - é o mais estável e o de maior cobertura verificada (123/174) e total (166/174);
  - nas 6 chamadas finais, só 1 erro próprio, que foi barrado;
  - custa o mesmo que o 3.6-flash até 31/12/2026 (US$ 0,75 / 3,75 por milhão de tokens);
  - o tempo máximo por chamada, 27 s, fica bem abaixo do limite da Edge Function (cerca de 150 s, a confirmar com o plano Supabase);
  - é o modelo que o plano já previa para a 2F.
- **Por que não o `gemini-3.5-flash`:** está descontinuado (quem responde é o 3.6-flash) e foi o que mais errou o "±" (9 valores numa rodada).
- **Por que não o lite como padrão:** é o mais barato (cerca de US$ 0,012 por chamada) e o mais rápido, mas oscilou no PCON-Y17. Serve só como plano B por custo, e mesmo assim o verificador seguraria os erros.
- **Custo estimado com o 3.8-flash, inteiro (sem corte de páginas):**
  - folder + manual de um produto: cerca de US$ 0,057;
  - depois de 31/12/2026, quando o preço dobra: cerca de US$ 0,11.
  - Com o corte de páginas (condição 2), a entrada cai bastante.

## 8. Condições para a 2F (FR-66)

1. **Reusar o mesmo caminho do spike.**
   - Mesmo prompt `fr66a-2026-10-15.2` e mesmo `responseSchema`, usando `toFactProposal` e `fitQuotesToPages`, **com a extensão da condição 5** para tabelas que valem para todos os modelos.
   - Verificar contra `withNormalizedSymbols(pdf)`.
   - O ideal é que a normalização dos sinais da fonte Symbol entre no próprio `pdf-intake` (dono: 1G). Assim o navegador, o sidecar e o servidor veem o mesmo texto.
   - **Antes de mover para o `pdf-intake`:** limitar a troca aos trechos cuja fonte no pdf.js tenha "Symbol" no nome. Hoje `normalizeSymbolText` não olha a fonte (seção 4, item 1), e um marcador da Wingdings viraria "≤", "Ω" ou "µ" no catálogo.
   - Sem a normalização, a prova da seção 4 mostra que um "±" vira VERIFIED com o caractere errado, ou deixa de verificar.
2. **Mandar só o intervalo de páginas.**
   - Hoje o Gemini cobra o PDF inteiro: o folder (20 p.) custa cerca de 10,6 mil tokens de imagem para ler 5 páginas; o manual (39 p.) custa 21 mil para ler 4.
   - Cortar o PDF antes de enviar reduz a entrada várias vezes.
   - Isso pede uma biblioteca de PDF na Edge, ou outro meio. A decisão fica na 2F, e uma dependência nova segue a regra de `package.json`.
3. **Mostrar a condição ao lado do valor na revisão (FR-68).**
   - Exemplo: "Accuracy" do opcional BR (0,16 mmHg) contra "Accuracy" do controlador (± 0.012 % FS).
4. **Divergências entre arquivos vão para a revisão (FR-68), nunca são resolvidas em silêncio.**
   - Use `findSourceDivergences` e `divergenceMessage`; cada leitura mantém o status do próprio arquivo.
5. **Ler as tabelas que valem para todos os modelos, e provar isso no manual p. 6.**
   - Hoje o prompt (regras 5 e 6) e o `responseSchema` pedem um valor por modelo e por linha. Uma tabela comum aos três modelos, organizada por tipo de entrada (mV, mA, Pt-100, termopares) e com colunas Resolução e Exatidão, não tem onde entrar. Ela some sem aviso.
   - A 2F deve estender o schema ou o prompt. Por exemplo: uma posição "todos os modelos", ou um tipo de tabela próprio (linha x coluna).
   - Antes de reusar o prompt, a 2F deve provar isso no manual p. 6:
     - pôr as linhas da p. 6 no gabarito;
     - zero valor errado marcado como VERIFIED;
     - "±", "Ω" e "°" corretos. É a página com mais sinais da fonte Symbol: 39 "±", 6 "Ω" e 100 "°".
   - Enquanto isso não existir, uma página lida que não deu nenhum valor deve aparecer na revisão do pai. Ela nunca pode sumir em silêncio.
   - Sem isso, o intervalo padrão do FR-66 (TA-PT p. 5–8) deixa a tabela de entradas de todo manual de calibrador PRESYS fora do rascunho do pai.
6. **Mostrar a unidade uma vez só, sem editar o literal (FR-68 e FR-69).**
   - Muitas leituras já trazem a unidade dentro do valor. Na v2 são 31: 30 VERIFIED do lite e 1 do 3.8-flash, que ficou UNVERIFIED.
   - Exemplos: "260 x 200 x 305 mm" com unidade "mm"; "11 min (25 °C to -25 °C)" com "min"; "Ø 25.4 mm (1”) x 124 mm" com "mm".
   - Numa célula de valor ao lado de uma coluna de unidade, sairia "mm mm".
   - Regra: quando `literalHasUnit(literal, unidade)` for verdadeiro, a unidade não é repetida, e o literal fica como está.
   - O `toFactProposal` já põe na mesma linha uma leitura sem unidade cujo valor já traz a unidade da linha. Antes, a linha se dividia em duas, cada uma com posições "não encontrado". Nas respostas salvas, isso não mudou nada: o replay da v1 e da v2 deu valores idênticos.

## 9. O que não foi verificado (limites honestos)

- São só 3 PDFs. Foram enviadas 10 páginas, todas com texto nativo, mas os valores vieram só de 3: p. 9 do folder, p. 5 do manual e p. 11 do Y17 (seção 1).
  - Páginas escaneadas (caminho VISUAL_ONLY) não foram testadas.
  - A tabela de faixas do PCON-Y17 (bar / psi / Pa por faixa) quase não foi coberta, e o gabarito não a inclui.
- **A p. 6 do manual, pedida pelo plano (TA-PT p. 5–6), deu 0 valores nas 36 respostas** (v1 e v2, 3 modelos, 2 repetições).
  - É a tabela "1.1.1 - Especificações Técnicas da Entrada": entradas mV, mA, resistência, Pt-100, Pt-1000, Cu-10, Ni-100 e termopares J, K, T, E, N, L, com colunas Resolução, Exatidão e Remarks.
  - É também a página com mais sinais da fonte Symbol no texto nativo: 39 "±" (U+F0B1), 6 "Ω" (U+F057) e 100 "°" (U+F0B0). A p. 5 tem 7 "±". Ou seja, é justamente o caso que o spike achou com erro, e a correção da seção 4 não foi provada nessa página.
  - Causa provável: o prompt (regras 5 e 6) e o `responseSchema` pedem um valor por modelo e por linha. Essa tabela vale para os três modelos e é organizada por tipo de entrada, sem coluna de modelo.
  - Os modelos simplesmente não a devolveram. Nada foi descartado na normalização: `dropped` ficou vazio em todas as rodadas.
  - Como a tabela não entra na proposta, ela também não aparece como "não encontrado". Some sem aviso.
  - **O gabarito também não cobre a p. 6** (`coveredPages` 5 e 7). Os números deste relatório não dizem nada sobre ela.
  - Não incluí a p. 6 no gabarito agora. Sem as linhas dela, uma leitura certa da p. 6 seria julgada errada, com a nota "esta linha está na página 5" (`judgeValue`, em `scripts/extract-facts-eval.ts`). Ela deve entrar no gabarito junto com as linhas, quando a 2F estender o schema (condição 5).
- Foram 2 repetições por modelo. Mesmo com temperatura 0, houve variação (lite no Y17).
- **A conferência à mão foi feita por um revisor só (o agente)**, lendo as imagens renderizadas. Vale o Gabriel conferir por amostragem as linhas 19–33.
- **Os preços** são os da tabela em `scripts/extract-facts-eval.ts`, lidos na página de preços do Gemini em 15/10/2026 por uma sessão anterior. **Não foram reconferidos nesta sessão.** O custo vem do `usageMetadata` de cada resposta.
- O spike é só de linha de comando. Não há tela nem função implantada; a 2F faz isso.
- A extração foi feita por modelo e por arquivo, nunca com os dois arquivos juntos numa chamada só.

## 10. Como rodar de novo

```bash
# Ao vivo (a chave vem só da variável de ambiente; nunca é impressa nem gravada)
GEMINI_API_KEY="$(cat <arquivo-da-chave>)" npx vite-node scripts/extract-facts.ts -- \
  --plan docs/ai-catalog/spike-extracao/plan.json --pdf-root "<pasta CONFIGURATOR PCON>" --out <pasta-de-saída>

# Sem API: reprocessa respostas salvas (copie respostas/prompt-v2/raw para <pasta>/raw)
npx vite-node scripts/extract-facts.ts -- --plan docs/ai-catalog/spike-extracao/plan.json \
  --pdf-root "<pasta CONFIGURATOR PCON>" --out <pasta> --replay
```

Outras opções:
- `--only gemini-3.8-flash` roda só um modelo;
- `--concurrency 1..6` controla quantas chamadas correm ao mesmo tempo;
- `--dry-run` só lê os PDFs.

O script lê a resposta como texto antes de interpretar o JSON. Assim, um 429 ou 5xx com corpo em HTML, ou vazio, ainda ganha as 2 novas tentativas. O cliente da 2F deve seguir a mesma ordem.

Testes: `npx vitest run tests/vnext/ai-catalog/fact-extraction.test.ts tests/scripts/extract-facts-eval.test.ts`.

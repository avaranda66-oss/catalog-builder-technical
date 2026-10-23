# Modo rascunho — prova do servidor (Onda 4)

Data: 22/10/2026. Handler Edge real (`vnext-catalog-draft`, tarefa `interpret_sketch`) rodando no computador,
Supabase simulado (sessão, perfil editor ativo, Storage privado e orçamento) e **Gemini real** (`gemini-3.8-flash`).
Nada foi publicado, nenhum banco nem segredo foi alterado.

- Script: `scripts/live-sketch-interpretation.ts` (`--replay` refaz a pontuação sem chave e sem rede).
- Rascunhos: `D:/spike-rascunho/sketches` (limpo, "foto de celular" e "estresse"), reduzidos a no máximo 1600 px
  no lado maior (1131 × 1600; estresse 900 × 1273), como a tela fará antes de enviar.
- Evidências: `docs/ai-catalog/rascunho-servidor/rodada-1/` (`summary.json` e respostas brutas, sem a chave).
- Pontuação igual à do spike: tipo + IoU ≥ 0,4; na lista de acessórios, foto + "código" + rabisco vale como a linha.

## Resultado (8 páginas, 1 rodada)

| Rascunho | Áreas certas | Modelo escolhido | Dígitos marcados "confirmar" | Dígitos fora do rascunho | Tentativas | Tempo total | Custo (US$, preço atual) |
|---|---|---|---|---|---|---|---|
| capa (limpo) | 10/10 | Capa de produto — PCON (C1) | 7/7 | 0 | 1 | 13,0 s | 0,0050 |
| capa (foto) | 10/10 | C1 | 7/7 | 0 | 1 | 15,9 s | 0,0061 |
| capa (estresse) | 10/10 | C1 | 7/7 | 0 | 1 | 21,2 s | 0,0092 |
| especificações (limpo) | 3/3 | P4 Especificações | 3/3 | 0 | 1 | 14,0 s | 0,0030 |
| especificações (foto) | 3/3 | P4 | 3/3 | 0 | 1 | 12,0 s | 0,0041 |
| acessórios (limpo) | 9/9 (5 no tipo exato) | P7 Fornecimento e acessórios | — | 0 | 1 | 19,3 s | 0,0088 |
| acessórios (foto) | 9/9 (5 no tipo exato) | P7 | — | 0 | 1 | 17,4 s | 0,0073 |
| acessórios (estresse) | 9/9 (5 no tipo exato) | P7 | — | 0 | 1 | 19,7 s | 0,0084 |

- **Áreas:** 100% em todas (como no spike). Nos acessórios o modelo sempre decompõe a linha em foto + "código" +
  rabisco; o encaixe agrupa isso como uma linha da tabela de acessórios.
- **Modelo de página:** 8/8. A capa desenhada (pílulas, chamada com seta, barra "Y17 · Y18-LP · Y18-BP") vai para
  a Capa de produto — PCON, com as três pílulas da esquerda para a direita e a barra dividida em três modelos; a
  faixa azul fica como decoração do próprio modelo.
- **Nada inventado:** nenhum número fora do rascunho; a tabela vazia continuou vazia. Todo dígito lido ("0 a 200
  psi", "PCON-Y17", "TA-25N"…) volta marcado "confirmar".
- **Caixas:** todas válidas na primeira resposta; a nova tentativa (no máximo uma) não foi necessária.
- **Perguntas:** o Gemini fez 1 pergunta em 8 páginas (de disposição, na capa de estresse). O encaixe acrescenta uma
  pergunta por tabela: "De onde vêm os dados…?", já com a sugestão "PDF" quando o rascunho diz "do PDF".
- **Custo:** US$ 0,052 nas 8 páginas (≈ US$ 0,0065 por página; o dobro a partir de 01/01/2027). Reserva por página:
  US$ 0,17 (pior caso de duas leituras), liquidada pelo uso real.
- **Tempo:** 12–21 s por página (média 16,6 s), dos quais 7,6–16,4 s na geração; o resto é envio do arquivo e contagem.
  Para um catálogo, rodar páginas em paralelo e mostrar o progresso.

## Falhas e limites

- **Acessórios com foto pequena por linha:** o modelo P7 existente só tem a foto do kit. As 4 fotos de linha e a
  anotação "fotos pequenas à esquerda" ficam como pendências (aviso na revisão), sem campo inventado.
- **Rascunhos sintéticos** (fontes cursivas do spike), 3 dos 9 tipos de página e 1 rodada por caso: antes de prometer
  "lê qualquer rascunho", testar 10–15 rascunhos reais à mão.
- A tela ainda não existe (fica para a próxima fatia): ela deve reduzir a foto para 1600 px (`sketchFitSize`),
  chamar `interpretSketchFromFile` (`src/vnext/ai-catalog/sketch-client.ts`) e mostrar a proposta para confirmar.

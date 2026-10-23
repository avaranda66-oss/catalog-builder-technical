# Idiomas do catálogo — Onda 4C (FR-85, FR-87)

**Data:** 22/10/2026 · **Ramo:** `onda4/idiomas` (base `origin/main` ab39efc) · **Glossário:** `presys-glossary-v1`

## O que mudou

| Onde | O quê |
|---|---|
| `src/vnext/translation/presys-glossary.ts` (novo) | Glossário PRESYS **versionado no repositório** e fonte única para o navegador e o servidor: termos PT/EN/ES, grafias erradas conhecidas, marcas e modelos que não se traduzem. Arquivo puro e sem imports (o Deno empacota como está). Mudou um termo? Suba `PRESYS_GLOSSARY_VERSION`. |
| `supabase/functions/vnext-translation-provider/index.ts` | (1) Marcas e modelos (PRESYS, Kompressor, MCS-XV, ST-501, KOMPRESSOR-Y18, qualquer código em MAIÚSCULAS com hífen e dígito) viram `[[VNEXT_KEEP_001]]`… antes do Gemini e voltam **byte a byte** depois. Marcador perdido, repetido ou inventado recusa a resposta (502), nada é adivinhado. (2) O pedido leva **só** os termos do glossário que aparecem no lote, com `glossaryVersion`. (3) `responseSchema` limitado: número exato de unidades, `maxItems`/`maxLength` em tudo, texto traduzido até 3× o trecho (nunca acima de 4.000). A ponte antiga `w5-ptbr-eses-v1` mantém o prompt original. |
| `src/vnext/translation/locale-number-format.ts` | Correções achadas na prova: decimal com sinal (`-25,5`, `−0,5`) não era ajustado; `Ø25,4 mm` era tratado como código; `24 Vcc`/`230 Vca` → `24 Vdc`/`230 Vac` no inglês (mesma unidade, sigla do idioma). Espanhol continua igual ao português. Nada é convertido. |
| `src/vnext/app/TranslationReview.tsx` | Revisão mais clara: no original, números, unidades, códigos, marcas e modelos aparecem **destacados**; o resumo só cita o que existe ("Para conferir: 1 ajuste de números · 1 grafia a corrigir."); botão **Próximo trecho com aviso (N)** leva a cada trecho com aviso ou correção necessária; trecho não conferido aparece como **A revisar**. |

Princípios mantidos: o provedor continua devolvendo os dados técnicos **exatamente como no original**
(o guardião `requireReviewText` recusa qualquer outra coisa); a adaptação por idioma (`0,1` → `0.1`)
é só **sugestão** na revisão e só entra com o clique da pessoa.

## Prova real curta com o Gemini

`scripts/qa/live-translation-glossary-proof.ts` executa o **código real do gateway** (o mesmo arquivo
Deno, numa VM do Node, como nos testes) com Supabase simulado (editor ativo) e **Gemini real**
(`gemini-3.5-flash-lite`, o modelo do registro; modo `bounded-acceptance`). A página de origem tem
14 trechos com fatos reais do modelo inicial TA-25N e a nota do folder EF1038-01 da capa PCON.

```
VNEXT_LIVE_GEMINI_KEY=… npx vite-node scripts/qa/live-translation-glossary-proof.ts saida.json
```

**Resultado (22/10/2026, 2 chamadas, ~5 s cada, custo total US$ 0,011 nesta rodada; US$ 0,023 nas duas rodadas do dia):**

| Verificação | en-US | es-ES |
|---|---|---|
| HTTP do gateway / `responseSchema` enviado | 200 / sim | 200 / sim |
| Dados técnicos idênticos ao original (14/14 trechos) | sim | sim |
| Marcas e modelos idênticos (PRESYS, TA-25N, PCON, KOMPRESSOR-Y18, EF1038-01) | sim | sim |
| Glossário respeitado | Technical Specifications, Accuracy, Resolution, Stability, Weight, Order Code, Standard Delivery | Especificaciones Técnicas, Exactitud, Resolución, Estabilidad, Peso, Código de Pedido, Suministro Estándar |
| Avisos de glossário que sobraram para a revisão | 0 | 0 |
| Grafias erradas conhecidas | 0 | — |
| Sugestões de número na revisão (FR-85) | 9 trechos: `±0.1 °C`, `0.01 °C`, `±0.02 °C`, `±0.05 °C`, `Ø25.4 mm`, `10.5 kg`, `−1 to 24.5 mA`, `24 Vdc`, `±0.025% FS` | nenhuma (formato igual ao português) |
| Perguntas de milhar ambíguo | 0 (a página não tem "1.500") | 0 |

Exemplos (en-US): "Exatidão da referência interna: ±0,1 °C" → "Internal reference accuracy: ±0,1 °C"
(a revisão oferece "±0.1 °C"); "Código de Encomenda e Fornecimento Padrão — PCON KOMPRESSOR-Y18" →
"Order Code and Standard Delivery — PCON KOMPRESSOR-Y18". (es-ES): "Poço: Ø25,4 mm × 124 mm" →
"Pozo: Ø25,4 mm × 124 mm".

## Testes

`tests/vnext/translation/presys-glossary.test.ts` (glossário, marcas/modelos byte a byte, números com
sinal, diâmetro, Vcc/Vdc, esqueleto dos valores preservado), `translation-review-clarity.test.tsx`
(destaques, resumo, próximo aviso), `p2-server-gateway-runtime.test.ts` (gateway executado: marcadores,
glossário no pedido, recusas, `responseSchema` sem campo sem limite) e `server-gateway-contract.test.ts`.
A pasta `tests/vnext/translation` inteira passa.

## Limites conhecidos (não feitos nesta fatia)

- O protetor do navegador não protege o número em `Ø25,4 mm` (o "Ø" é letra para a expressão). O valor
  passou igual na prova, mas não há garantia de máquina para ele; corrigir muda os marcadores e a versão
  da política de tokens (`p2-tech-tokens-v2`) — fica para uma etapa própria.
- O provedor de tradução ainda não usa o orçamento da 00028 (`p_feature = 'translation'` já existe na
  migração); o limite atual é o de tamanho (60 unidades, 30.000 caracteres) e o papel editor/admin.
- Função Edge alterada: precisa de deploy aprovado depois do merge (`vnext-translation-provider`).

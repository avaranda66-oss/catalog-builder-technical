# P2 — Benchmark de fidelidade técnica da tradução

Este documento define a rubrica e casos sintéticos para es-ES e en-US. Nenhuma frase abaixo
constitui especificação aprovada de produto PRESYS, evidência de desempenho ou autorização
comercial. A fixture executável implementada consolida as classes abaixo em 8 referências
bilingues; os testes passaram pela mesma fundação/validação/candidato controlados.

## Camadas de prova distintas

**ESTRUTURAL:** cobertura completa de leaf/unit/run e identidades/hash/perfil/locale;
placeholders e tokens byte-equivalentes; original imutável; RichText, geometria, estilos,
tabelas e assets preservados; clone/cópia/reopen e preflight canônicos. Pode ser provada por
fixtures determinísticas e respostas adversariais, sem chamadas Gemini.

**LINGUÍSTICA:** sentido, condições/qualificadores, terminologia de engenharia/metrologia,
fluência e variante regional. Revisar as amostras concretas, registrar origem da resposta e
possíveis correções humanas. Saída controlada com texto pré-escrito é uma referência/rubrica,
não prova de competência do provider real. JSON válido e tokens intactos não garantem sentido.

**REAL PROVIDER/BACKEND:** resposta real Gemini e persistência real Supabase têm recibos
próprios e são separados. Se indisponíveis no ambiente já autorizado/capado, registrar
NOT_AVAILABLE; não fazer deployment, obter credenciais ou chamar serviço sem limites.

## Casos mínimos em ambos os destinos

| Caso | Texto sintético pt-BR / superfície | Invariantes estruturais | Questão linguística |
| --- | --- | --- | --- |
| B01 Prosa | "O calibrador pode ser usado nas condições descritas; confirme a configuração antes do uso." / texto | Sem facts acrescentados; preservar estrutura/run/marks | Preservar possibilidade e condição, sem transformar em garantia ou instrução omitida. |
| B02 Título | "Especificações e condições de ensaio" / título da tabela | Mesmo leaf e RichText | es: especificaciones/condiciones de ensayo; en: specifications/test conditions; sem título comercial inventado. |
| B03 Cabeçalhos | "Parâmetro", "Valor", "Condição", "Fonte" / células textuais | Mesmo conjunto/ordem/run/células | Rótulos curtos naturais e consistentes em cada idioma. |
| B04 Faixa/decimais | "Faixa: −10,0 °C a +50,0 °C; resolução 0,001 °C." / mixed text | Preservar −/+ e cada decimal/unidade/faixa, sem converter vírgulas ou unidades | Traduzir conectivos/rótulos; não mudar extremos/condições nem normalizar decimal por idioma. |
| B05 Exatidão | "Exatidão: ±0,05 °C em 23,0 °C, sob as condições informadas." | Tokens, sinal ± e condição preservados | Exatidão não vira resolução, estabilidade ou incerteza; manter condição associada. |
| B06 Incerteza | "Incerteza expandida: 0,10 °C, k = 2." | Valor/unidade/k/fator íntegros | es incertidumbre expandida; en expanded uncertainty; não inventar nível de confiança. |
| B07 Unidades | "Sinal de 4–20 mA; tensão de 24 V; pressão de 100 kPa; erro de 0,1 %." | Integração faixa/sinais/unidades/% e valores sem conversão | Tradução mantém cada parâmetro e não adiciona precisão/condição. |
| B08 Normas | "Referência IEC 61010-1:2020 e IEC61010-1; verificar aplicabilidade." | Identificadores/year/colon/hyphens/spaced e unspaced intactos | Referência não vira declaração de conformidade ou certificação. |
| B09 Protocolos | "Comunicação TCP/IP, HART e USB, conforme configuração." | TCP/IP/HART/USB intactos | Condição não vira disponibilidade universal ou acessório incluído. |
| B10 Modelos | "Modelo TA-25N; variante TA-35N a confirmar." | Modelos/hífen intactos | Manter lacuna/condição, não aprovar variante por plausibilidade. |
| B11 Marcadores | "Condição conforme nota *; valor † a confirmar." / texto/notas/legenda | * e † preservados; nota/legenda mantêm IDs e vinculação | Não apagar notas ou resolver a confirmação. |
| B12 Mixed tokens | "IEC61010-1, TCP/IP e ±0,05 °C para TA-35N: confirmar limites." | Todos os tokens coexistem sem transplante entre runs/units | Traduzir somente prosa; não remodelar norma/protocolo/faixa. |
| B13 RichText | Parágrafo/lista com negrito e dois runs: "Limite " + "±0,05 °C" | IDs/marks/quebras/listas/topologia; tokens pertencem ao run original | Frase permanece compreensível sem mover token para outro run. |
| B14 Tipados excluídos | Célula measurement/technical-code, imagem/marker tipados | Não enviados ao provider nem reescritos como texto | Nenhuma avaliação linguística atribuída a conteúdo excluído. |
| B15 Expansão | Prosa longa traduzida em quadro pequeno | Geometria inicial invariável; overflow BLOCKED, sem shrink/reflow | Correção editorial manual mantém facts e passa pela revisão novamente. |

Placeholders internos também são testados independentemente: manter exatamente uma ocorrência
no run/unit correto. Falhas intencionais incluem ausência, duplicação, alteração, transplante,
metadata/locale incorreto, unknown extra field, markup e output vazio. Candidato inteiro falha
fechado; não aceitar "quase correto" nem preencher trecho faltante por fallback em português.

## Rubrica linguística para cada idioma

| Dimensão | PASS | FAIL / requer correção |
| --- | --- | --- |
| Fidelidade | Mesmo sentido, condições e qualificadores | Omissão, garantia ampliada, fato/certificação inventado |
| Engenharia/metrologia | Termos distintos para resolução/exatidão/incerteza/estabilidade | Confusão de conceitos técnicos |
| Variante | Espanhol da Espanha ou inglês dos EUA consistente | Mistura regional substancial ou prosa traduzível em português |
| Rótulos | Cabeçalhos/títulos curtos coerentes | Rótulos ambíguos/inconsistentes ou prosa promocional |
| Naturalidade | Leitura clara sem alterar tokens | Frase incompreensível ou correção que modifica técnico |

Registrar por caso/idioma: fonte da resposta (controlled/real), texto observado, rubrica,
avaliador, correção se necessária e resultado final. Não exigir tradução idêntica byte a byte
à referência de prosa quando outras formas são equivalentes. Tokens protegidos, IDs e perfil
continuam exatos. Prova linguística de fixtures não é real-provider acceptance.

## Proteção técnica: mudança limitada permitida

Se B08/B09/B12 ou outros casos comprovarem que um identificador normativo/protocolo/faixa/
decimal/unidade/símbolo exigido está desprotegido, o protetor pode ser corrigido pontualmente.
Adicionar teste de regressão positivo/negativo, provar que prosa normal continua traduzível e
incrementar/registrar a política de tokens no perfil/cache. Não ampliar o protetor a texto
arbitrário, reescrever extração/sourceHash nem esconder falha do benchmark com mock perfeito.

## Limites da aceitação real

No máximo 2 invocações Gemini upstream em toda a sessão, idealmente uma por destino; fixture
sintética de um batch, no máximo 4k input/4k output tokens por chamada incluindo thinking e
teto US$0,05. O serviço existente oferece maxAttempts:1 para o probe; contar dispatch/timeout
e impedir terceira tentativa. Caps só valem se garantidos no transporte real antes da chamada.
Não registrar chaves, auth tokens, signed URLs ou pacote confidencial em artefatos.

Sem sessão/credencial/modelo autorizado ou sem caps garantidos: NOT_AVAILABLE, zero chamadas.
Gateway remoto anterior não aceita en-US; sem deployment autorizado, real en-US continua
NOT_AVAILABLE. Dois calls não autorizam bypass de gateway/auth nem implantação de P2.

## Prova integrada de layout/entrega

Para es-ES e en-US: gerar/revisar → aceitar cópia → save → reopen → confirmar locale/provenance
e source intacto → introduzir/verificar expansão longa → preflight BLOCKED → corrigir
manualmente no editor → save/reopen → READY → PDF da versão salva. Conferir todas as páginas
renderizadas e fontes/imagens/texto, não apenas DOM. Testes de source/authority drift e recurso
ausente permanecem fail-closed. Browser 1600/1280/820, foco/Tab/Escape/restore e P1 coherence.

## Resultado observado — revisão PO/QA 2026-10-03

`tests/vnext/translation/p2-technical-benchmark-fixture.ts` contém 8 fontes e 16 referências
es-ES/en-US: prosa/classe e sensores; exatidão versus incerteza; faixas e unidades; normas
e protocolos; resolução/estabilidade/símbolos; opcionalidade/lacunas; título de tabela;
cabeçalhos. São referências sintéticas revisadas, não fatos TA-25N/TA-35N aprovados.

Leitura das referências: termopares/termorresistências preservam as duas famílias; exatidão
usa exactitud/accuracy e incerteza usa incertidumbre/uncertainty; unidades/faixas/símbolos
permanecem exatos; normas/interfaces não viram certificação; configuração/opcional e não
confirmado continuam condicionais/editáveis; títulos e cabeçalhos preservam conceitos.
Para inglês, vírgulas decimais intencionalmente permanecem iguais à fonte conforme o contrato,
mesmo quando estilo editorial local preferiria outro separador. Nada foi "melhorado".

A revisão linguística independente das 16 referências controladas reportou PASS, sem mudança
de sentido identificada. Esse veredito pertence às amostras pré-escritas e à rubrica, não a
uma resposta Gemini real; não cria escore estatístico nem certificação de qualidade do modelo.

`p2-technical-benchmark.test.ts`: 5 testes PASS. Dois casos positivos usam extração/proteção,
provider controlado, validação e candidato para cada destino; dois negativos verificam
alteração de números/unidades/códigos/normas/protocolos/símbolos; o quinto confirma que a
rubrica/referências linguísticas estão identificadas separadamente. Também verificam fonte,
assets/styles/frames/eixos/células tipadas/RichText preservados. A rubrica de 15 áreas não
implica 15 chamadas Gemini nem um escore estatístico. Provas adicionais de placeholders,
freshness/cache/copy/handler são registradas nas suítes focadas e prova Chromium.

Correção limitada de proteção acrescentou padrões de normas/protocolos/símbolos detectados
pelas amostras, com regressões e tokenPolicyVersion `p2-tech-tokens-v2`. ES profile/prompt
avançam a v2; English v1; ver matriz de compatibilidade e dependência de gateway/registry.

O provider do proof de produto pode devolver prosa adversarial ou texto português conservado
para exercitar revisão, tokens e overflow. Essa prova é estrutural/de UX/layout e não é a
amostra linguística do benchmark nem comprova qualidade Gemini real.

| Camada | es-ES | en-US | Natureza da evidência |
| --- | --- | --- | --- |
| Estrutural | PASS | PASS | 5 testes benchmark + suítes focadas determinísticas |
| Linguística da amostra | PASS revisão independente | PASS revisão independente | 8 referências controladas por idioma; sem resultado real ou escore de provider |
| Chromium/PDF | PASS controlado | PASS controlado | bootstrap real, provider/transport controlados, 74 capturas e PDF 2 A4 por destino |
| Real Gemini | NOT AVAILABLE | NOT AVAILABLE | zero chamadas; não inferir de mock |
| Real Supabase | NOT AVAILABLE | NOT AVAILABLE | sem sessão/runtime autorizados verificados; nenhum readback real alegado |

`scratch/p2-real-acceptance.json` registra callsDispatched=0, actualCostUsd=0,
deploymentPerformed=false. Motivos: sessão/runtime Supabase autorizados não verificados,
gateway remoto anterior Spanish-only, caps declarados não garantidos por ele. Uma variável
Google nominal não configura gateway nem autoriza bypass. Full suite PASS 293 arquivos/3285
testes + 1 skip preexistente, 32/32 históricos PASS, typecheck/lint/build e QA final PASS são
evidências separadas registradas na story. PR/CI do head exato ainda não são alegados neste
congelamento; esses resultados não decorrem do benchmark nem comprovam provider/backend reais.

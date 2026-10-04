# P2 — Matriz de compatibilidade de idiomas

Contrato limitado em 02/10/2026. Origem única pt-BR; destinos es-ES e en-US. Esta matriz
documenta disponibilidade e metadados; não concede suporte a um par por semelhança de escrita,
por fonte disponível ou pelo registry Legacy. Implementação local e provas controladas P2
estão registradas abaixo; isso não declara implantação remota ou canonicidade.

## Pares ativos no contrato P2

| Locale | Nome nativo | Nome em inglês | Região | Script | Direção | Fonte metadata | Origem permitida | Destino permitido | Prova P2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pt-BR | Português | Portuguese (Brazil) | BR | Latn | ltr | noto-sans-latin-v1 / Noto Sans | SIM | NÃO | fonte preservada; prova controlada PASS |
| es-ES | Español | Spanish (Spain) | ES | Latn | ltr | noto-sans-latin-v1 / Noto Sans | NÃO | SIM, a partir de pt-BR | testes e prova controlada PASS |
| en-US | English | English (United States) | US | Latn | ltr | noto-sans-latin-v1 / Noto Sans | NÃO | SIM, a partir de pt-BR | testes e prova controlada PASS |

"Permitido" significa allowlist do contrato P2. Não comprova gateway remoto implantado nem
qualidade linguística de resposta Gemini real. O código main anterior a P2 suporta somente
pt-BR → es-ES; isso não confirma perfil/disponibilidade da função remota. Editar esta branch
não habilita inglês remotamente.

## Metadados futuros — NOT_AVAILABLE

| Locale | Nome nativo | Nome em inglês | Região | Script | Direção | Fonte metadata | Tradução P2 | Layout/PDF/prova dedicados |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en-GB | English (UK) | English (United Kingdom) | GB | Latn | ltr | noto-sans-latin-v1 / Noto Sans | NOT_AVAILABLE | NOT_VALIDATED |
| es-MX | Español (México) | Spanish (Mexico) | MX | Latn | ltr | noto-sans-latin-v1 / Noto Sans | NOT_AVAILABLE | NOT_VALIDATED |
| fr-FR | Français | French (France) | FR | Latn | ltr | noto-sans-latin-v1 / Noto Sans | NOT_AVAILABLE | NOT_VALIDATED |
| de-DE | Deutsch | German (Germany) | DE | Latn | ltr | noto-sans-latin-v1 / Noto Sans | NOT_AVAILABLE | NOT_VALIDATED |
| it-IT | Italiano | Italian (Italy) | IT | Latn | ltr | noto-sans-latin-v1 / Noto Sans | NOT_AVAILABLE | NOT_VALIDATED |
| pt-PT | Português (Portugal) | Portuguese (Portugal) | PT | Latn | ltr | noto-sans-latin-v1 / Noto Sans | NOT_AVAILABLE | NOT_VALIDATED |

Esses locales podem ter metadata tipada para preparação. Não aparecem no selector de idiomas
ativos; requests para esses destinos são rejeitados independentemente no cliente e servidor.
Os nomes nativos futuros da tabela são rótulos de planejamento, não novas opções executáveis.
Nenhuma capacidade RTL/CJK ou locale adicional é reivindicada nesta onda. O perfil
noto-sans-latin-v1 identifica a fonte canônica existente; cobertura e layout reais dependem
dos recursos e provas canônicos, sem adicionar fonte/font engine.

## Registry VNext independente

O novo registry VNext usa tipos e registros próprios, consumidos por UI/perfis/validação.
`src/translation/language.registry.ts` é apenas referência de nomes/região/script/direção/fonte;
não importar seu registry executável, tipos Legacy, modelos, stores ou engines. Seus campos
`enabled`/`translationSupport`/`layoutSupport` não são autoridade para VNext.

Fonte vem de CatalogDocument.locale, não de detecção automática. Cópia es-ES/en-US não é
fonte de nova tradução nesta onda. Original pt-BR salvo com revisão atual é o único input.

## Perfil e cache

Cada destino deve resolver um perfil explícito, com source/target/provider/model/prompt/política
de tokens/contrato/versão. Request e response precisam concordar com esse perfil. A chave de
cache já inclui source/target e metadata de perfil; provar que não reutiliza espanhol para inglês
ou uma política/prompt anterior. Não implementar Translation Memory durável.

Valores implementados:

| Campo | es-ES | en-US |
| --- | --- | --- |
| contractVersion | w5a-v1 | w5a-v1 |
| profileVersion | w5-ptbr-eses-v2 | p2-ptbr-enus-v1 |
| promptVersion | w5-technical-es-v2 | p2-technical-en-v1 |
| tokenPolicyVersion | p2-tech-tokens-v2 | p2-tech-tokens-v2 |
| provider / model | gemini / gemini-2.5-flash | gemini / gemini-2.5-flash |

O shape versionado w5a-v1 é mantido; target e perfil são allowlisted explicitamente.
Espanhol profile/prompt v1 passam a v2 porque a proteção técnica teve lacunas comprovadas
em normas/protocolos/símbolos, corrigidas pontualmente com testes. Cache inclui versão de
perfil/prompt/política; resultado antigo não é reutilizado nem aceito silenciosamente.
O alias W5 no cliente continua sendo default espanhol, agora v2.

## Compatibilidade de rollout — contrato de remediação, sem deploy

Auditoria QA do head inicial `5597514e1779c1efd43d22060446cc85ab0fe8c0` identificou HIGH:
gateway P2 Spanish-v2/English-v1 rejeita o request Spanish-v1 do cliente canônico `40b85d6`;
esse cliente também rejeita response v2. Um flag somente para inglês não torna o rollout
seguro. O gate `37095084780` do head inicial é histórico e não valida o próximo head.

A correção limitada aceita no servidor o perfil canônico Spanish-v1 exato, além dos
perfis P2. Não alterar o registry/UI/cache/validador P2 para aceitar v1. Não reescrever v1 em
v2: o envelope de resposta ecoa profileVersion/requestId/targetLocale do request validado.

| Contrato aceito no gateway corrigido | sourceLocale | targetLocale | contractVersion | profileVersion | Política do cliente |
| --- | --- | --- | --- | --- | --- |
| Canônico pré-P2, somente compatibilidade servidor | pt-BR | es-ES | w5a-v1 | w5-ptbr-eses-v1 | cliente canônico W5 v1; não aceito pelo cliente P2 |
| P2 espanhol | pt-BR | es-ES | w5a-v1 | w5-ptbr-eses-v2 | P2 tokenPolicy p2-tech-tokens-v2 |
| P2 inglês | pt-BR | en-US | w5a-v1 | p2-ptbr-enus-v1 | P2 tokenPolicy p2-tech-tokens-v2 |

O perfil antigo possui prompt `w5-technical-es-v1` e tokenPolicy `w5-tech-tokens-v1` no cliente
canônico; não recebe alegação de proteção P2 v2. Combinações de perfil/par/contract erradas
continuam rejeitadas, sem fallback nem expansão de idiomas suportados.

Após prova, gateway corrigido pode preceder o cliente P2: cliente canônico + gateway novo
deve passar v1, e cliente P2 + gateway novo deve passar Spanish-v2/English-v1. Cliente P2 +
gateway do código pré-P2 permanece incompatível. A ordem é condicionada a QA/gates/CI e autorização
futura, não a sucesso simulado ou a esta documentação. Nenhum deployment foi executado.

O handler importa o registry VNext puro como fonte de perfis P2/allowlists; esse arquivo é
dependência do bundle exato do gateway. Compatibilidade v1 é explícita somente no servidor;
nenhum alias permissivo é propagado ao cliente. Typecheck Deno e ESZip devem provar o
artefato/registry exatos antes de preparar implantação futura.

Auth, verify_jwt/config existentes, secrets, provider client/modelo/transporte e DB não mudam.
Management browser/CLI sem autorização verificável não fornecem versão/alias/config live:
esses dados permanecem NOT_AVAILABLE. Cliente P1/gateway remoto não são alterados nesta etapa;
zero chamadas reais e zero deploy. Packet futuro deve distinguir bundle provado de runtime
remoto não verificado, e registrar critérios/ordem/rollback antes de qualquer execução.

### Observação pública atual, sem management auth

`scratch/p2-rollout-public-live.json` (03/10/2026 14:35:08 UTC) observou login normal em
`https://catalog-builder-technical.vercel.app/vnext`, sem sessão autorizada. O bootstrap
público `/assets/bootstrap-Cpo4e8if.js` contém `w5-ptbr-eses-v1`, não contém os perfis P2 v2/
English-v1, e usa origem Supabase pública `https://bjxqvrpbigwgabwbhtqa.supabase.co`.
Asset SHA256 `aae3f2ee3faa7aba9ea76f9c2250bf7af879a1516d79f2f79d21118414f05dfe`;
binding exato do asset a um SHA de Git não verificado.

GET não autenticado da função conhecida `vnext-translation-provider` retornou 404,
`NOT_FOUND`, "Requested function was not found". Servidor remoto Spanish-only **NÃO
CONFIRMADO**. Fonte/versão/perfis/artefato de rollback da função são NOT_AVAILABLE sem
management auth. A premissa anterior de gateway remoto espanhol não é comprovada por esse
endpoint, e o 404 não autoriza inferir sucesso após uma implantação.

`scratch/p2-rollout-vercel-github-readonly.json` registra evidência histórica de deployment;
productionBranch, mapping exato de alias e settings efetivos atuais não foram autenticados.
A URL pública foi observada, mas não substitui prova do mapping/configuração de promoção.

`vercel.json` desabilita deployment automático somente para a branch
`codex/p2-multilingual-translation-center` por `git.deploymentEnabled`, sem alterar rewrites.
Esse guard atende NO_DEPLOY nesta entrega; não habilita gateway nem muda GitHub CI.
Uma implantação futura depende de autorização própria e da compatibilidade conjunta acima.
[Configuração oficial Vercel](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled).

## Evidência por camada

1. Estrutura: testes determinísticos de pares, identidade/tokens/hash, cópia/locale/provenance.
2. Linguística: revisão separada de sentido técnico, qualificadores e variante regional.
3. Browser/PDF: UI de ambos os pares, edição/salvamento/reabertura e preflight canônico.
4. Real Gemini: somente resposta real autorizada/capada; não confundir com mock.
5. Real Supabase: somente ACK/readback/reopen autenticados; não confundir com transporte controlado.

Real Gemini/Supabase e ambos os idiomas no gateway remoto são NOT_AVAILABLE nesta etapa:
endpoint conhecido 404, configuração não confirmada e sem sessão autorizada. Gateway segue
sem garantia dos caps output/thinking; não chamar até 4k input/4k output incluindo thinking,
máximo 2 upstream calls e teto US$0,05 serem impostos/verificados antes da primeira chamada.
Autorização de deployment isolada não remove esse bloqueio. Nesta etapa: 0 chamadas/US$0.
P2 continua sem merge/auto-merge/deploy; provas controladas não alteram essa fronteira.

## Estado de verificação P2 inicial — evidência histórica

- [x] Matriz limitada congelada após BEFORE 87 capturas/3 larguras.
- [x] Registry, allowlists e perfis implementados.
- [x] Estrutural es-ES/en-US PASS.
- [x] Revisão linguística independente es-ES/en-US PASS: 16 referências controladas, sem alegação de qualidade Gemini real.
- [x] Chromium/PDF e source/locale/lineage preservados em transporte controlado.
- [x] Real Gemini/Supabase: NOT AVAILABLE registrado separadamente, zero chamadas/zero deploy.

Evidência: `scratch/p2-kernel-focused.log`, testes `p2-technical-benchmark` (5 PASS),
`scratch/p2-multilingual-translation-center-proof/after/result.json` (74 capturas, três larguras,
zero erros) e `scratch/p2-real-acceptance.json`. Full suite PASS: 293 arquivos, 3285 testes e
1 skip preexistente, com workers limitados a 2; 32/32 históricos PASS, comandos/ordem mantidos.
Typecheck/lint/build e QA final PASS, sem HIGH/CRITICAL; lint tem 268 avisos e zero erros.
PR #64 e CI `37095084780` passaram para o head inicial; não comprovam rollout seguro nem a
remediação. Novo código exige focados de compatibilidade, lint/typecheck/full/build, 33 provas
(32 históricas + P2), Deno/ESZip e QA/CI do novo head. Não declarar P2 canônico.

- [x] Contrato da remediação congelado antes do código, com compatibilidade v1 somente servidor.
- [x] Canônico v1 e P2 v2/en-US passam contra gateway corrigido em transporte controlado; negativos e client P2 fail-closed.
- [x] Typecheck do código local Deno e roundtrip ESZip oficial genérico do gateway/registry exatos PASS; sem alegar writer/runtime remoto validado.
- [ ] Todos os gates/33 provas, QA sem HIGH/CRITICAL e novo CI do head exato PASS.
- [ ] Packet revisável com configuração conhecida/lacunas/ordem/rollback; sem merge/deploy ou chamada real.

Prova local corrigida: Deno 2.5.6/2.9.7 PASS; ESM graph/bundle de 25 módulos; ESZip
`denoland/eszip v0.109.0`, 26 módulos, 421988 bytes, ESZIP2.3, roundtrip PASS. SHA256 ESZip
`dde9737af20501d1aaf3728e78b5fc77f8613ef84b74d2801c2d5cf886b74005`; Git blob gateway
`b3d90ddd5a02263b5f4924d18a71c67e8a5e2091`, sem novo head/tree ainda. Recibo:
`scratch/p2-rollout-bundle/remediation-working/eszip-result.json`. Registry unchanged.
Arquivo gateway raw SHA256 `1b5fee72ba4396ea1cf97db6fa6c597587e956b2a414cfe0ff090efa9544691b`;
sourceHashes no ESZip é hash do módulo retornado pelo parser, não do .ts raw. Os hashes dos
arquivos raw antes/depois do bundle/QA são iguais, sem confundir esses domínios de identidade.
Deno --all FAIL com 39 erros de declarações externas Supabase WebAuthn/Node (zero locais);
writer otimizado Supabase via Docker NOT_VALIDATED, runtime deployed exato NOT_AVAILABLE.
O roundtrip genérico não substitui esses passos nem valida produção.

Focados atuais 184 testes/3 arquivos PASS; lint zero erros/268 avisos; typecheck/build PASS.
Full suite corrigida PASS 293 arquivos/3295 testes + 1 skip preexistente, workers2/min1,
240,67 s, `scratch/p2-rollout-full-tests.log`; QA final zero HIGH/CRITICAL. Prova canônica
executa service/GatewayClient/validador/proteção/cache/cobertura reais do 40b: 9 elegíveis/11
exclusões, prompt/envelope deep-equal, cache-hit/original imutável, três perfis 200 e 11
negativos sem dispatch. Evidência controlada, zero chamadas externas; recibo no packet
`P2_CANONICAL_CLIENT_GATEWAY_COMPATIBILITY_QA.json`. UI/fixtures de prova/dependências não
mudaram. As 33 provas no novo CI e o packet/head exatos permanecem externos e pendentes.

## Hard-Cap — contrato de remediação congelado em 03/10/2026

Contrato atual aprovado antes do código, baseado no head `3ef74a3`; resultados/404/rollout
anteriores acima são históricos. Não autoriza redeploy, secrets, merge ou chamada Gemini.
O usuário resolveu a divergência 4k/4096: **input <=4000, output <=4096 incluindo thinking**
somente no modo bounded. Perfis ESv1 exclusivamente servidor, ESv2/ENv1, prompts, identidade,
cache e auth permanecem intactos; modelo/REST/dependências/engines não mudam.

`VNEXT_TRANSLATION_BUDGET_MODE` é apenas servidor: ausente/`production` preserva batching
60 unidades/30000 caracteres e thinking dinâmico; envia `candidateCount=1`/`maxOutputTokens=65536`,
sem nova contagem. `bounded-acceptance` conta o generateContentRequest completo/modelo exato
antes da geração; totalTokens inteiro seguro <=4000, `candidateCount=1`/output 4096/`thinkingBudget=0`.
Config inválida, count inválido/falho/acima do limite impedem geração sem retry/fallback;
browser não controla config. Ambos exigem `finishReason=STOP` antes da validação estrita;
MAX_TOKENS/não STOP/ausente falham mesmo com JSON válido.
[countTokens](https://ai.google.dev/api/tokens),
[output/thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking).

Factory `createTranslationCenterFoundation` fixa `maxAttempts=1` no bootstrap; default genérico 3
histórico permanece. B lotes não cacheados implicam B tentativas, não uma por catálogo.
Fixture real eventual usa cache novo/1 lote por idioma/execução sequencial/ledger externo:
máximo 2 counts + 2 generations, falhas incluídas, US$0,05. A estimativa Standard para duas gerações
4000/4096 é US$0,02288; reserva US$0,02528 assume contagens cobradas como input, sem tarifa
oficial countTokens comprovada. Não alegar gratuitas/total garantido: billing precisa ser
verificado antes do real. Modelo 2.5 restrito a usuários anteriores, sem shutdown anunciado;
não mudar modelo/criar chave. Sem precondições existentes e autorizadas: REAL NOT_AVAILABLE,
zero chamadas. [Pricing](https://ai.google.dev/gemini-api/docs/pricing),
[modelo](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash),
[depreciações](https://ai.google.dev/gemini-api/docs/deprecations).

AC19–AC21 da story comprovados localmente: focados 481 testes/14 arquivos PASS; QA independente
398 PASS e nova prova com cliente/validador reais 40b contra gateway atual, production/bounded
ESv1, prompt canônico preservado, cache-hit e original imutável. Não confundir código canônico
executado em transporte controlado com chamada real. O frontend público 40b ainda usa default 3;
maxAttempts 1 é da nova factory P2 local. Real futuro exige novo cliente exato/sessão normal
autorizada/cache novo/um lote por idioma/ledger, não o retry do cliente público antigo.

AC22-local PASS: typecheck/lint/full/build novos, lint zero erros/268 avisos, full 3488 PASS e
1 skip/294 arquivos; Deno 2.9.7 check local e ESZip genérico 26 módulos/429781 bytes PASS.
Deno --all tem 39 erros externos/zero locais; check offline 2.5.6, writer otimizado Supabase e
runtime novo implantado NOT_VALIDATED. As 33 provas sequenciais atuais PASS, manifest completo
com quatro gates/33 provas, todos exitCode=0. AFTER fresco: 74 capturas, zero erros; root revisou
oito imagens atuais (quatro telas e quatro páginas PDF), visual PASS. Provider/transporte/auth
controlados; mistura deliberada PT/ES/EN não comprova qualidade Gemini ou persistência real.
Story Ready for Review local; commit/push/CI do novo head continuam pendentes e externos.
Resultados/checklist/file list exata na story e recibos externos. Nenhum resultado histórico
valida esta remediação, nenhuma chamada Gemini/redeploy está autorizada nesta etapa.

Retomada 04/10: revisão independente dos 20 adversariais do diff/evidência preservada PASS,
zero HIGH/CRITICAL; bindings de sources/registry, runtime test pós-correção readonly e 33
scripts confirmados. Root revisou mais 12 capturas atuais, visual PASS. Não houve nova
execução de teste/prova, Gemini, redeploy ou alteração de código; novo CI exato permanece
externo e pendente. Recibo final e limites de atribuição na story e no report QA externo.

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
qualidade linguística de resposta Gemini real. Hoje a main anterior a P2 suporta somente
pt-BR → es-ES; inglês não passa a estar disponível remotamente por editar esta branch.

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

## Compatibilidade de deployment — sem deploy nesta sessão

Cliente P2, gateway e registry precisam avançar juntos em uma implantação futura autorizada.
O handler importa o registry VNext puro como fonte única de perfis/allowlists; esse arquivo
é dependência de build/bundle do gateway. Não publicar só o handler nem duplicar mapas
divergentes. A revisão/testes de runtime exercitam essa dependência com fetch controlado.

Requests P2 Spanish-v2/English-v1 são incompatíveis com o gateway remoto anterior Spanish-v1,
e falham fechados. Isso também significa que abrir o cliente P2 contra gateway antigo não
prova regressão espanhola real. O cliente canônico P1 e seu gateway antigo não foram alterados
remotamente. Deployment, migração ou aceitação de perfis antigos não são simulados como sucesso.

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

Sem implantação autorizada de P2, gateway remoto English é NOT_AVAILABLE. P2 termina no PR,
sem merge/auto-merge/deploy; nenhuma tentativa para desbloquear real altera essa fronteira.

## Estado de verificação

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
PR/CI do head exato permanecem externos e pendentes neste congelamento. Não declarar P2 canônico.

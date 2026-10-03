# P2 — Multilingual Translation Center

## Status: Ready for Review

## Story

Como funcionário PRESYS, quero gerar e revisar uma cópia em espanhol ou inglês de um
catálogo salvo em português, preservando as especificações técnicas e reconhecendo idioma
e origem da cópia, para editá-la e publicar pelo fluxo canônico.

## Contrato congelado — 2026-10-02

- Repositório: `avaranda66-oss/catalog-builder-technical`.
- Base main: `40b85d68eec56673829ef24c3a42ea9cbd94d5b7`.
- Tree: `25c4a911bffe7822384f737b33f7d88d91f2cd77`.
- P1.C / PR #63 MERGED; gates `37071940901` e `37073629957` SUCCESS nos SHAs exatos.
- P1 decisão A, encerrado; P1.A / #61 e P1.B / #62 permanecem canônicos.
- Branch: `codex/p2-multilingual-translation-center`.
- Worktree: `C:\Users\Usuario\.codex\worktrees\p2-multilingual-translation-center\catalog-builder`.
- P2 termina em novo PR com CI do head exato: **STOP / NO MERGE / NO AUTO-MERGE / NO DEPLOY**.

O pedido humano novo autoriza implementar P2 neste worktree novo. A delegação de squash P1.C
não se transfere. Os handoffs externos anteriores são planejamento histórico; esta story
congela o contrato atual após inspeção BEFORE, antes da implementação.

BEFORE real capturado: `scratch/p1c-product-coherence-proof/before/result.json`, phase=before,
87 capturas, 1600/1280/820 px, zero erros. Root abriu geração/revisão no browser CUA a 1280.
O nome da pasta reutiliza o harness, não redefine o escopo como P1.C. Bootstrap/UI reais,
transporte/autorização controlados; não é comprovação Supabase/Gemini de produção.

## Escopo e comportamento

Origem única `pt-BR`; destinos ativos somente `es-ES` e `en-US`. O código canônico W5.A/B/C
integra Gemini por gateway servidor e restringe o par a `pt-BR → es-ES`; isso não comprova a
configuração ou disponibilidade de uma função remota.
Generalizar somente os contratos/perfis/allowlists necessários para dois destinos, mantendo
validação, proteção, freshness, clone, CREATE verificado e publicação canônicos.

Registry VNext tipado próprio contém locale, nomes nativo/inglês, região, script, direção,
perfil de fonte e disponibilidade. O registry Legacy é referência de metadados, sem importar
seus modelos, stores, registry executável ou engines. A matriz futura lista `en-GB`, `es-MX`,
`fr-FR`, `de-DE`, `it-IT`, `pt-PT` como NOT_AVAILABLE; não aparecem como opções suportadas.

Translation Center mantém a identidade visual P1, contexto antes de controles, comparação
Original/Tradução, edição segura, geração/revisão/aceitação claras e erros acionáveis.
Gerada/revisada/aceita são apresentação do fluxo existente, não novo estado persistido.
Aceitar explicitamente cria uma cópia independente; nenhuma tradução modifica o original.

Prompt técnico PRESYS de engenharia/metrologia traduz somente o texto elegível protegido,
mantém IDs/runs/placeholders e devolve texto simples. Preserva números, separadores decimais,
faixas, unidades, códigos/modelos, normas, protocolos, símbolos e qualificadores; nunca melhora,
corrige, completa ou inventa fatos. SourceHash/extração semântica não mudam fora do necessário
para destino/par. O protetor técnico pode receber apenas correção limitada de lacuna comprovada
pelo benchmark, com teste e versão de política explícita; isso não autoriza reescrita geral.

## Contrato de rollout limitado — 2026-10-03, antes da correção

O novo pedido humano permite alterar produto P2 somente para um defeito de segurança de
produção comprovado. QA identificou HIGH no head `5597514e1779c1efd43d22060446cc85ab0fe8c0`:
seu gateway rejeita o request espanhol v1 do cliente canônico main `40b85d6`; devolver v2
também seria rejeitado pelo cliente antigo. Habilitar/desabilitar apenas inglês não resolve
essa incompatibilidade. A auditoria desse head e o gate `37095084780` são evidência histórica,
não aprovação da correção nem CI do próximo head.

A remediação autoriza somente compatibilidade explícita no gateway para o par antigo
`pt-BR → es-ES`, `contractVersion=w5a-v1`, `profileVersion=w5-ptbr-eses-v1`, além dos perfis
P2 Spanish-v2/English-v1 existentes. A resposta deve conservar a identidade do request
validado, incluindo profileVersion/requestId/targetLocale; não promover silenciosamente v1
para v2. Nenhuma aceitação de perfil v1 é adicionada ao cliente P2, ao cache ou ao registry
de destinos da UI. A política antiga não é apresentada como a proteção P2 v2.

Essa compatibilidade poderá permitir implantação do servidor antes do cliente **somente
após provas** de que cliente canônico + gateway novo funciona e cliente P2 + gateway novo
mantém ambos os destinos e validação estrita. Cliente P2 + gateway do código pré-P2 continua
incompatível. Não há deployment, merge ou auto-merge autorizados por este contrato.

Auth, configuração existente, secrets, provider client/modelo/transporte, limites, fonte/hash,
engines e banco permanecem fora da correção. O ajuste local Deno TS2322 deve preservar a
mesma validação e servir exclusivamente ao typecheck/bundle exato do gateway. Não mudar
verify_jwt, obter credenciais, fazer login ou presumir configuração de produção.
Management browser/CLI sem sessão autorizada não comprova versão/alias/config remotos:
marcar esses dados como NOT_AVAILABLE enquanto não houver evidência verificável.

**Budget desta etapa: zero chamadas Gemini/Supabase reais e zero deployment.** Preparar
artefato e packet revisáveis; qualquer execução futura depende de autorização pontual,
configuração verificada e critérios do packet. Gates/provas/QA locais e CI precisam ser
reexecutados para o novo código/head, sem substituir o resultado novo pelo gate anterior.

### Evidência pública de rollout — somente leitura

`scratch/p2-rollout-public-live.json`, verificado em 03/10/2026 às 14:35:08 UTC, registra
entrada pública `https://catalog-builder-technical.vercel.app/vnext` com login normal e sem
sessão autorizada. O bootstrap servido `/assets/bootstrap-Cpo4e8if.js` contém o perfil
`w5-ptbr-eses-v1`, sem os perfis P2 Spanish-v2/English-v1, e origem Supabase pública
`https://bjxqvrpbigwgabwbhtqa.supabase.co`. O hash do asset é
`aae3f2ee3faa7aba9ea76f9c2250bf7af879a1516d79f2f79d21118414f05dfe`.
Isso identifica o contrato servido, não vincula por si só o asset a um SHA de Git.

GET não autenticado do endpoint conhecido `vnext-translation-provider` retornou HTTP 404,
`NOT_FOUND`, "Requested function was not found". Portanto, servidor remoto Spanish-only
**NÃO CONFIRMADO**; versão, fonte, perfis implantados e artefato de rollback da função são
NOT_AVAILABLE sem management auth. O 404 observado não é uma chamada de tradução nem
prova de que um deployment futuro funcione. Não fazer login/bypass para preencher lacunas.

`scratch/p2-rollout-vercel-github-readonly.json` distingue um deployment histórico do SHA
canônico de configurações atuais não verificadas. A entrada pública acima foi observada;
productionBranch, mapping exato de alias/deployment e settings efetivos de promoção/deploy
não foram autenticados. O guard local da branch P2 não comprova bloqueio efetivo de main.

QA também mantém o bloqueio de budget real: gateway existente não garante os caps de output/
thinking. Nenhuma chamada real até limite de 4k input e 4k output **incluindo thinking**,
máximo 2 chamadas upstream e US$0,05 serem impostos/verificados antes da primeira chamada.
Autorização de deploy isolada não remove esse bloqueio. Nesta etapa: 0 chamadas / US$0.

### Evidência local final da remediação — ainda sem novo head/CI

Focados atuais: 184 testes PASS em 3 arquivos (105 runtime gateway, 76 contratos, 3 estáticos),
em `scratch/p2-rollout-focused.log`. Typecheck PASS; lint zero erros/268 avisos; build PASS
em 17,68 s, com aviso existente de chunks. Full suite PASS: 293 arquivos/3295 testes e 1 skip
preexistente em 240,67 s, `npm test -- --maxWorkers=2 --minWorkers=1`, log
`scratch/p2-rollout-full-tests.log`. QA independente da remediação: zero HIGH/CRITICAL.
As 33 provas serão exigidas pelo CI do novo head exato após commit; a rodada/CI anterior
fica histórica. Nenhuma UI, fixture de prova ou dependência mudou nesta remediação, portanto
as 74 capturas e a revisão visual anteriores documentam a UI preservada, sem alegar rerun.

Gateway corrigido ainda não commitado: Git blob `b3d90ddd5a02263b5f4924d18a71c67e8a5e2091`,
SHA256 do arquivo raw `1b5fee72ba4396ea1cf97db6fa6c597587e956b2a414cfe0ff090efa9544691b`.
O hash `1979bb3140487c315b363934f7b4edaa71c5ff86efaa76d6463be3d7ce7ba15c` no recibo ESZip
pertence ao módulo retornado pelo parser do arquivo, não ao .ts raw; são domínios distintos.
Checks locais Deno 2.5.6/2.9.7 PASS; graph/bundle ESM de 25 módulos resolvido; ESZip oficial
genérico `denoland/eszip v0.109.0` fez escrita/leitura roundtrip de 26 módulos, 421988 bytes,
magic ESZIP2.3, SHA256 `dde9737af20501d1aaf3728e78b5fc77f8613ef84b74d2801c2d5cf886b74005`.
Registry unchanged; recibo `scratch/p2-rollout-bundle/remediation-working/eszip-result.json`
registra sourceCommit não commitado/sourceTree pendente. Não tratar blob como head promovido.

Deno `--all` FAIL: 39 erros de declarações externas Supabase WebAuthn/Node, zero erros locais.
Writer otimizado Supabase CLI/Edge Runtime via Docker **NOT_VALIDATED**, sem Docker; runtime
deployed exato **NOT_AVAILABLE**. ESZip genérico real não é aprovação desses dois passos.
Essa limitação deve continuar no packet; não trocar dependências/config/auth para escondê-la.

QA executou os módulos reais do cliente canônico `40b85d6` — service, GatewayClient, proteção,
cache, cobertura e validador — com fixture histórica de 9 unidades elegíveis/11 exclusões.
PASS: prompt e envelope upstream antigos deep-equal, segunda chamada cache-hit, resposta v1
aceita pelo validador antigo, rejeição de v2/inglês pelo antigo e original imutável. Os três
perfis permitidos devolveram 200 com identidade correspondente; 11 negativos devolveram
400/401/403 sem dispatch. Transporte/autorização controlados, zero chamadas externas.
Recibo preservado fora da branch:
`C:\Users\Usuario\Documents\Codex\2026-10-03\p2-rollout-preflight\P2_CANONICAL_CLIENT_GATEWAY_COMPATIBILITY_QA.json`.
Hashes raw antes/depois do bundle e da QA são iguais; fonte remota continua não verificada.

### Acceptance criteria adicionais de rollout

- [x] AC13 — Gateway aceita exatamente o request espanhol v1 canônico, Spanish-v2 e English-v1; combinações erradas de source/target/profile/contract e destinos não ativos continuam rejeitados independentemente do cliente. Não há fallback ou alias permissivo de perfil.
- [x] AC14 — Response ecoa somente a identidade do request validado e passa no validador canônico v1; cliente P2 continua rejeitando response v1, com isolamento de perfil/cache e proteção v2 intactos. Payload/output/IDs/placeholders inválidos continuam fail-closed.
- [x] AC15 — Auth/config/secrets/provider client/DB/engines não mudam. Nenhuma versão/alias/live config é inventada; 404 do endpoint e servidor Spanish-only não confirmado são explícitos, assim como fonte/versão/rollback remotos NOT_AVAILABLE. Auditoria do 559 preservada; QA da correção sem HIGH/CRITICAL e compatibilidade canônica provada em transporte controlado.
- [x] AC16 — Typecheck do código local Deno 2.5.6/2.9.7 e roundtrip ESZip oficial genérico do gateway/registry exatos PASS, com versões/artefato/hash verificáveis e correção TS2322 limitada. Deno --all com 39 erros externos, writer otimizado e runtime remoto exato não são alegados como PASS; limitações explícitas, sem deploy ou nova dependência de produto.
- [ ] AC17 — Focados de compatibilidade canônico-v1/P2-v2/en-US, rejeições e isolamento PASS; lint/typecheck/full/build, 32 históricos e nova prova P2 (33 provas) PASS após a correção; nova QA independente sem HIGH/CRITICAL e CI do novo head exato. Nenhum gate do 559 autoriza o novo código.
- [ ] AC18 — Packet registra head/tree/artefato/config disponíveis e lacunas, ordem servidor antes do cliente condicionada às provas, riscos e critérios de rollback verificáveis antes de execução futura. Autorização de deployment não autoriza Gemini sem caps/budget impostos e verificados antes da chamada. Encerrar sem merge/auto-merge/deploy e com zero chamadas reais nesta etapa.

Allowlist incremental da remediação: `supabase/functions/vnext-translation-provider/index.ts`,
testes focados `server-gateway-contract.test.ts`/`p2-server-gateway-runtime.test.ts` e esta story/
`p2-language-compatibility.md`/`p2-translation-quality-benchmark.md` (neste último, somente
correção da premissa remota). São seis arquivos já existentes no PR, sem ampliar sua file list.
Root possui código/testes; PO possui somente os três docs.
Prova Deno/ESZip e packet são evidência externa, sem ampliar produto nem modificar frontend.

## Acceptance criteria

- [x] AC1 — Registry independente e matriz de compatibilidade tipados; somente fonte pt-BR e destinos es-ES/en-US ativos. Metadata futura NOT_AVAILABLE e sem suporte herdado do Legacy.
- [x] AC2 — Allowlist explícita no cliente, coordinator e gateway; destino preservado por perfil/request/response/cache/candidate/review. Unsupported nunca é convertido silenciosamente para espanhol. Perfil/contrato/prompt/política de tokens versionados coerentemente; documentar compatibilidade dos valores W5 canônicos existentes.
- [x] AC3 — Gemini HTTP/gateway existente com credencial só no servidor, auth e limites preservados. Saída inválida, extra, incompleta, duplicada, IDs/hashes errados, markup ou token alterado falham fechados. Prompt técnico não altera fatos.
- [x] AC4 — Translation Center compara Original/Tradução, oferece correção segura e estados gerada/revisada/aceita, pending/cancel/erro; sem IDs ordinários, sem dados persistidos novos para revisão e com hierarquia P1.
- [x] AC5 — Original imutável; RichText/topologia/marks/IDs antes do clone, tipados excluídos, geometria, tabelas, estilos e assets preservados. Source/session/revision/auth freshness em async boundaries e accept; stale rejeitado.
- [x] AC6 — Aceitar usa clone/PreparedCatalogCreateCoordinator/ACK verificado existentes; uma cópia lógica por aceitação, inclusive double click e ACK ambíguo. Library e save/reopen preservam locale, originKind=translation, originId e originRevision; editar cópia não muda fonte.
- [x] AC7 — Benchmark es-ES e en-US cobre prosa, títulos/cabeçalhos, medição, faixas, exatidão/incerteza, unidades, normas, protocolos, modelos e mixed tokens. Prova ESTRUTURAL separada de avaliação LINGUÍSTICA; mock não comprova qualidade de Gemini real.
- [x] AC8 — Real Gemini e real Supabase separados e opcionais em ambiente já autorizado. Máximo 2 chamadas upstream na sessão, idealmente 1/par; fixture pequena de um batch, no máximo 4k tokens de entrada e 4k tokens de saída por chamada incluindo thinking, teto US$0,05 pré-declarado. maxAttempts:1 na opção existente e contador de dispatch fail-closed, incluindo timeout/retry. Sem credenciais/logs/novo deployment para provar configuração; indisponibilidade declarada.
- [x] AC9 — Tradução longa não faz auto resize/reflow/shrink. save → reopen → preflight BLOCKED → correção manual normal → save/reopen → READY → PDF da revisão exata. Publicação/recursos/geometria/estabilidade/autoridade mantêm fail-closed.
- [x] AC10 — Prova Chromium produção/controlada faz espanhol depois inglês em 1600/1280/820, BEFORE/AFTER reais e revisão visual; copy/reopen/locale/lineage, pending/disabled/erro/cancel, foco/Tab/trap/Escape/restore, sem overflow global; PDF verificado e original preservado.
- [ ] AC11 — Testes focados e gates locais lint/typecheck/full suite/build PASS após a remediação; todas as 32 provas históricas registradas mais prova P2 devem passar no novo CI do head exato. A rodada anterior é histórica da UI intacta, não satisfaz o novo CI. Somente a parte externa das 33 provas está pendente; não remover, reordenar nem relaxar cobertura histórica para passar.
- [ ] AC12 — QA e revisão adversarial visual/código sem HIGH/CRITICAL, commit/push/new PR pelo DevOps e CI do head exato. Encerrar no PR: sem merge, auto-merge ou deploy.

## Matriz adversarial obrigatória — 15 itens

| Item | Aceitação verificável |
| --- | --- |
| 1. Espanhol | Caminho pt-BR → es-ES continua funcional e protegido. |
| 2. Inglês | pt-BR → en-US usa a mesma fundação/validação/cópia canônica. |
| 3. Unsupported cliente | Par/locale não ativo rejeitado sem chamada provider. |
| 4. Unsupported servidor | Gateway rejeita independentemente de manipulação do cliente. |
| 5. Cache | Não há reutilização cruzada espanhol/inglês; chave inclui par e perfil/model/prompt/política/contrato. |
| 6. Original | Documento salvo original equivalente antes/depois de geração/revisão/aceitação. |
| 7. Técnico | Números/faixas/unidades/modelos/normas/protocolos/símbolos/placeholders intactos. |
| 8. Stale | Mudança de source/revisão/sessão/auth impede aceitação obsoleta. |
| 9. Uma cópia | Double accept e reconciliação de ACK ambíguo produzem uma cópia lógica. |
| 10. Reopen | Locale e provenance existentes sobrevivem save/reopen da cópia. |
| 11. Publicação | Somente fonte salva/revisão atual e readiness canônicos permitem PDF. |
| 12. Segredos | Chave nunca chega ao cliente/storage/documento/logs/artefatos. |
| 13. Evidência | Controlled/mock e real Gemini/Supabase identificados separadamente. |
| 14. Texto longo | Overflow bloqueia preflight; nenhuma correção geométrica silenciosa. |
| 15. Produto P1 | UI profissional/coerente e documento dominante, sem regressão de disclosures/reset/foco. |

## Modelo / transporte — decisão limitada e fontes primárias

Manter `gemini-2.5-flash` textual com HTTP fetch canônico se o projeto autorizado já tem acesso.
O modelo suporta saída estruturada, não tem shutdown anunciado, mas Google restringe acesso
2.5 a usuários que já o utilizaram. O shutdown de `gemini-2.5-flash-image` é de outro modelo.
Não trocar modelo/SDK por novidade, nem introduzir dependência sem necessidade demonstrada.
[Modelo](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash),
[depreciações](https://ai.google.dev/gemini-api/docs/deprecations).

Preço padrão consultado em 02/10/2026: input textual US$0,30/M tokens; output US$2,50/M incluindo
thinking. Duas chamadas com caps 4k/4k implicam até US$0,0224 pelos preços consultados; teto
delegado US$0,05. Revalidar preços/configuração e só executar se os caps reais forem garantidos.
[Pricing](https://ai.google.dev/gemini-api/docs/pricing).

Gemini REST continua documentado; Deno oferece fetch e Supabase Edge Functions usam runtime
compatível Deno. SDK Google GenAI é oficial/recomendado para bibliotecas, mas não é requisito
para o HTTP existente. JSON estruturado ajuda no formato, sem substituir validação semântica,
token/hash/freshness do projeto. Não migrar para outra API nem implementar grounding/tools.
[API REST](https://ai.google.dev/api/generate-content),
[Deno fetch](https://docs.deno.com/runtime/reference/web_platform_apis/),
[Supabase Edge Functions](https://supabase.com/docs/guides/functions),
[bibliotecas](https://ai.google.dev/gemini-api/docs/libraries),
[structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).

Não houve chamada real durante congelamento. Editar a branch não habilita inglês remoto:
real es-ES/en-US são NOT_AVAILABLE, com endpoint conhecido retornando 404 e configuração da
função não confirmada. Não fazer deploy para provar configuração. Sem caps/budget impostos
e verificados ou sessão/credencial autorizada, nenhuma chamada real é executada; autorização
de deployment não altera essa condição.

## Allowlist / ownership / file list planejada

PO/docs:
- `docs/stories/2026-10-02-p2-multilingual-translation-center.md`
- `docs/vnext/p2-language-compatibility.md`
- `docs/vnext/p2-translation-quality-benchmark.md`

Kernel, somente par/perfil/destino e proteção comprovada:
- `src/vnext/translation/language-registry.ts` (novo)
- `src/vnext/translation/contracts.ts`, `service.ts`, `response-validation.ts`, `request-cache.ts`
- `src/vnext/translation/candidate.ts`, `review-coordinator.ts`, `provider-client.ts`, `index.ts`
- `src/vnext/translation/technical-token-protector.ts` somente lacuna confirmada, teste e versão de política
- `supabase/functions/vnext-translation-provider/index.ts` somente allowlist/destino/perfil/prompt/validação; auth e credenciais preservadas

UI scoped Translation Center / locale:
- `src/vnext/app/TranslationReview.tsx`, `VNextApp.tsx`, `bootstrap.tsx`, `CatalogLibrary.tsx`, `styles.css`
- Integração de `EditorWorkspace.tsx` somente se callback/acesso ao Center exigir; nenhuma autoria/inspector/engine alterados

QA/root:
- `tests/vnext/translation/` testes focados/benchmark/fixtures
- `tests/vnext/library/catalog-library-ui.test.tsx`; `tests/vnext/publication/` regressões necessárias
- `tests/vnext/proof/architecture-boundary.test.ts`
- Nova prova P2 em `tests/vnext/proof/` e uma adição em `.github/workflows/quality-gates.yml`
- Adaptações limitadas de fixtures históricas P1.C/W5.A/W5.C para o contrato P2, preservando comandos, ordem e assertions de proteção
- `vercel.json` somente guard de deployment desabilitado para a branch P2, preservando rewrites

A lista final deve registrar exatamente os arquivos alterados; caminhos planejados não afirmam
mudança já feita. Mudança além da allowlist exige justificativa de escopo antes da edição.

### File list P2 inicial — 33 arquivos; remediação limitada ao subconjunto acima

Criados:
- `docs/stories/2026-10-02-p2-multilingual-translation-center.md`
- `docs/vnext/p2-language-compatibility.md`
- `docs/vnext/p2-translation-quality-benchmark.md`
- `src/vnext/translation/language-registry.ts`
- `tests/vnext/proof/p2-multilingual-translation-center-proof.mjs`
- `tests/vnext/translation/p2-multilingual-contracts.test.ts`
- `tests/vnext/translation/p2-review-target.test.ts`
- `tests/vnext/translation/p2-server-gateway-runtime.test.ts`
- `tests/vnext/translation/p2-technical-benchmark-fixture.ts`
- `tests/vnext/translation/p2-technical-benchmark.test.ts`

Modificados:
- `.github/workflows/quality-gates.yml`
- `src/vnext/app/CatalogLibrary.tsx`
- `src/vnext/app/TranslationReview.tsx`
- `src/vnext/app/VNextApp.tsx`
- `src/vnext/app/styles.css`
- `src/vnext/translation/candidate.ts`
- `src/vnext/translation/contracts.ts`
- `src/vnext/translation/index.ts`
- `src/vnext/translation/provider-client.ts`
- `src/vnext/translation/request-cache.ts`
- `src/vnext/translation/response-validation.ts`
- `src/vnext/translation/review-coordinator.ts`
- `src/vnext/translation/service.ts`
- `src/vnext/translation/technical-token-protector.ts`
- `supabase/functions/vnext-translation-provider/index.ts`
- `tests/vnext/library/catalog-library-ui.test.tsx`
- `tests/vnext/proof/fixtures/w5a-translation-foundation-browser.tsx`
- `tests/vnext/proof/productization-p1c-product-coherence-proof.mjs`
- `tests/vnext/proof/w5c-publication-review-proof.mjs`
- `tests/vnext/translation/server-gateway-contract.test.ts`
- `tests/vnext/translation/translation-dialog.test.tsx`
- `tests/vnext/translation/translation-foundation-service.test.ts`
- `vercel.json`

## Não-goals / fronteiras

Sem schema/migration/SQL/RLS/auth/BYOK/client key/Recovery-L1/CAS/renderer/table/asset/publication
engine; sem detecção automática, tradução de fonte traduzida, batch comercial, Translation
Memory durável, RTL/CJK, auto layout, redesenho global ou dependências por conveniência.
Não promover/copy/cherry-pick/merge lab TA-35N, nem iniciar A1 ou Father Pilot. Worktrees P1 e
snapshot preservado são somente leitura. Dados sintéticos de benchmark não são facts aprovados.

## Tasks / evidência a preencher

- [x] Ler Constitution, PO/UX, handoff e contratos/stories W5.A/B/C canônicos.
- [x] Revalidar base/tree/branch e concluir BEFORE/browser audit antes do código.
- [x] Congelar escopo, ACs, adversariais, decisão HTTP/modelo e limites reais.
- [x] Implementar registry/par/perfis/gateway e proteção limitada comprovada.
- [x] Implementar Translation Center/locale/Library preservando P1.
- [x] Executar benchmark estrutural e revisão linguística separadamente nos dois idiomas.
- [x] Real Gemini/Supabase somente se disponível/autorizado/capado; registrar resultado ou NOT_AVAILABLE.
- [x] Prova integrada Chromium/PDF, AFTER visual/a11y e tradução longa fail-closed.
- [x] Gates locais, históricas e QA/adversarial do head inicial, preservados como histórico.
- [x] Checklist e file list P2 inicial congelados para o primeiro commit.
- [x] Congelar contrato da remediação de rollout antes de alterar código.
- [x] Provar compatibilidade servidor/canônico/P2, Deno local/ESZip e reexecutar focados/lint/typecheck/full/build.
- [x] QA final da correção sem HIGH/CRITICAL e documentação congelada em Ready for Review.
- [ ] Novo CI do head exato com todas as 33 provas e packet final externo após commit.
- [ ] Registrar resultado/disponibilidade CodeRabbit e commit/push/new PR/CI exato pelo DevOps no handoff externo.
- [ ] Encerrar sem merge/auto-merge/deploy com decisão A/B/C/D e handoff exato.

## Decisão de encerramento

A — P2 pronto no PR, aguardando autorização pontual seguinte conforme pedido.
B — uma remediação limitada concreta necessária.
C — validação real bloqueada, implementação/provas controladas completas.
D — drift de base/contrato exige revalidação.

Nenhuma decisão declara P2 canônico nesta sessão: não há autorização de merge/deploy.

## Evidência P2 inicial / revisão de produto — histórico de 2026-10-03

Kernel: 259 testes em 10 arquivos PASS, incluindo 95 testes do handler gateway real com fetch
controlado. Review-target recebeu regressão adicional e seu rerun de 8 testes PASS.
UI: 30 testes em 4 arquivos PASS. Typecheck final PASS; lint final zero erros e 268 avisos.
Build PASS com aviso existente de chunks grandes. Full suite PASS: 293 arquivos, 3285 testes
e 1 skip preexistente, em 243,96 s, com `npm test -- --maxWorkers=2 --minWorkers=1`;
log `scratch/p2-full-tests-bounded-workers.log`. Duas tentativas anteriores com concorrência
padrão tiveram respectivamente dois e um timeouts de transição PILOT.A/table-grid antes dos
checks de tradução; o mesmo arquivo isolado passou seus 12 testes sem alteração. A primeira
tentativa coincidiu com Chromium concorrente, mas isso não comprova a causa das falhas.
Nenhuma assertion, timeout ou cobertura da suíte foi relaxada.

Históricos: 32/32 PASS em `scratch/p2-historical-results.json`, todos exitCode=0, mantendo
registro, comandos e ordem. Três adaptações de fixtures após falhas iniciais acomodam o novo
contrato sem enfraquecer proteção: P1.C verifica título da origem, locale es-ES e rótulo
regional Espanhol (Espanha), além de clicar geração e exigir erro sem novo request ou runs
para fonte traduzida; W5.A troca o negativo en-US, agora permitido, por fr-FR, ainda fora da
allowlist; W5.C mantém negativos de código/título, acrescenta bloqueio enquanto falta o token
numérico 1 da marca C.1 e restaura o texto protegido antes de exigir aceitação. Os registros
das tentativas anteriores são preservados. Nenhuma mudança de aplicação ocorreu depois do
full suite/build/prova P2; os últimos typecheck/lint cobrem a fixture TypeScript ajustada.

O guard `git.deploymentEnabled` em `vercel.json` é false apenas para
`codex/p2-multilingual-translation-center`, conforme o contrato NO_DEPLOY. Rewrites e demais
branches permanecem iguais; não houve alteração de GitHub CI por esse guard nem deployment.
[Contrato Vercel](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled).

Benchmark: 8 referências sintéticas bilingues revisadas; 5 testes PASS exercitam a mesma
extração/proteção/provider controlado/validação/candidato para es-ES e en-US. As referências
cobrem as classes da rubrica, não equivalem a 15 chamadas ou traduções Gemini reais.
Leitura linguística independente das 16 referências PASS, sem mudança de sentido identificada:
classe do instrumento, condições/opcionalidade, exatidão versus incerteza, nomes de
normas/protocolos e lacunas preservados. Essa conclusão avalia referências controladas,
sem nota estatística ou afirmação de qualidade do modelo real.
Ver `docs/vnext/p2-translation-quality-benchmark.md`.

O record mais recente `scratch/p2-multilingual-translation-center-proof/after/result.json`
contém 74 capturas em 1600/1280/820, zero erros, fluxos espanhóis e ingleses, cancelamento de
geração em 1600, cache isolado, unsupported/stale, fonte imutável, uma cópia por accept,
save/reopen/lineage/locale, BLOCKED → correção manual → READY e PDF de duas páginas A4 por
destino. Root executou a prova final PASS e inspecionou os quatro renders de páginas PDF;
UX revisou 27 imagens e reportou PASS. A revisão PO abriu seis imagens reais representativas de review,
seleção/aceitação, Library e publicação bloqueada em três larguras. Hierarquia P1 preservada.
O provider da prova é controlado e pode deliberadamente devolver texto adversarial/não
traduzido para testar proteção/layout; isso não é benchmark linguístico de Gemini.

Revisão independente dos 15 adversariais de código e dos deltas finais dos 33 arquivos PASS,
zero HIGH/CRITICAL. Fontes/modelo,
profile/compatibilidade e efeitos reais permanecem explícitos no documento de idiomas.
REAL_GEMINI e REAL_SUPABASE_PERSISTENCE são NOT AVAILABLE em
`scratch/p2-real-acceptance.json`: zero chamadas, custo zero, zero deploy. Sem sessão/runtime
autorizados verificados, inglês remoto habilitado ou caps garantidos, nenhuma chamada foi feita.

AC1–AC11 tiveram suporte em código/testes focados/gates/históricos/prova/visual no head inicial.
O PR #64 foi aberto nesse head e o CI `37095084780` passou, conforme os recibos externos;
esses resultados não validam o novo código da remediação. A story está Ready for Review
com gates locais, QA e AC13–AC16 comprovados; AC11 (33 provas no novo CI), AC12/AC17/AC18
aguardam novo CI e packet externo.
O próximo head/gate e a conclusão externa
do PR são registrados no packet/handoff, sem reescrever a tree para incluir seu próprio gate.
STOP / NO MERGE / NO AUTO-MERGE / NO DEPLOY continuam obrigatórios.

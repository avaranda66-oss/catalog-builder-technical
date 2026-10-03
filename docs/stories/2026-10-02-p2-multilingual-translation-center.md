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

Origem única `pt-BR`; destinos ativos somente `es-ES` e `en-US`. A fundação W5.A/B/C existente
já integra Gemini por gateway servidor e hoje restringe o par a `pt-BR → es-ES`.
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
- [x] AC11 — Testes focados registry/par/gateway/validação/cache/candidato/revisão/Library/publicação/arquitetura PASS; lint sem novos erros, typecheck, full suite, build e todas as 32 provas históricas registradas mais prova nova P2 PASS. Não remover, reordenar nem relaxar cobertura histórica para passar.
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

Não houve chamada real durante congelamento. Gateway remoto existente não passa a aceitar
inglês por editar a branch; sem deployment autorizado, real en-US é NOT_AVAILABLE. Não fazer
deploy para provar configuração. Se a gateway existente não permite garantir os caps ou não
há sessão/credencial autorizada, nenhuma chamada real é executada e a limitação é explícita.

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

### File list final congelada — 33 arquivos

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
- [x] Gates locais completos, todas as históricas e revisão QA/adversarial.
- [x] Atualizar checklist e file list e congelar documentação para commit.
- [ ] Registrar resultado/disponibilidade CodeRabbit e commit/push/new PR/CI exato pelo DevOps no handoff externo.
- [ ] Encerrar sem merge/auto-merge/deploy com decisão A/B/C/D e handoff exato.

## Decisão de encerramento

A — P2 pronto no PR, aguardando autorização pontual seguinte conforme pedido.
B — uma remediação limitada concreta necessária.
C — validação real bloqueada, implementação/provas controladas completas.
D — drift de base/contrato exige revalidação.

Nenhuma decisão declara P2 canônico nesta sessão: não há autorização de merge/deploy.

## Evidência implementada / revisão de produto — 2026-10-03

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

AC1–AC11 têm suporte em código/testes focados/gates/históricos/prova/visual e classificação
real acima. Documentação congelada em Ready for Review. AC12 permanece pendente somente
do registro externo de commit/push/PR/CI do head exato; sua conclusão e o resultado ou a
disponibilidade CodeRabbit serão registrados no handoff final, sem reescrever a tree para
incluir seu próprio head/gate. Nenhum resultado CodeRabbit, PR ou CI P2 aprovado é alegado
neste registro. STOP / NO MERGE / NO AUTO-MERGE / NO DEPLOY continuam obrigatórios.

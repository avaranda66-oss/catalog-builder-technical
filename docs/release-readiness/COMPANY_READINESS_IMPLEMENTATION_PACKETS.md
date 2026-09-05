# Company Readiness Audit 1 — Implementation Packets

Target de diagnóstico: 9843d51a1535ce867d3d5f337253c1d35497c8f0, branch local audit/company-readiness-v1. Estes são **planos para implementação posterior**, não patches executados. Um packet por finding aceito P0/P1/P2: 19/19. Ver diagnóstico/reprodução em COMPANY_READINESS_FINDINGS.md e evidências em COMPANY_READINESS_AUDIT1.md.

## Contrato de execução de todos os packets

1. Partir do candidato combinado ou de um sucessor revisado; confirmar SHA e dependências. Criar story em docs/stories com checklist/file list conforme regras do projeto, durante a missão futura de implementação.
2. Manter baseline visual e arquitetura existente; reparo/convergência incremental. Não alterar main diretamente, fazer push, executar migration ou acessar live sem escopo/autorização correspondente.
3. Começar pelo regression test que prova o comportamento esperado. Os probes de auditoria afirmam o defeito: não basta copiá-los e mantê-los verdes; inverter o contrato para assegurar ausência do defeito.
4. Fazer teste focal do packet e os quatro gates: npm run lint; npm run typecheck; npm test; npm run build. Até RR-016, registrar lint como indisponível, nunca PASS. Depois de RR-016, nenhum waiver silencioso.
5. Usar doubles/local fixtures sem URL/key live; zero chamadas externas nos testes. Ensaios SQL e de restore são uma tarefa distinta em ambiente descartável autorizado.
6. Revisão forte verifica invariantes, concorrência e integração no SHA final, não apenas diff e contagem de testes. Docs e evidências devem identificar quais cenários foram mock, browser isolado ou DB real.
7. “Arquivos a modificar” abaixo são allowlist funcional. Novos módulos/testes nomeados como propostos podem ser criados; não mover/renomear toda a feature. Se a implementação exigir ampliar fronteira, registrar a justificativa concreta na story antes da revisão.

Complexidade S/M/L é relativa, não estimativa em horas. Os caminhos são relativos ao worktree.

## Waves e ordem de integração

| Wave | Ordem/packets | Saída exigida |
|---|---|---|
| 0 — conter perda, mentira e crash | RR-005; RR-001→RR-003; RR-002; contenção RR-004; iniciar RR-016 | Help não derruba app; draft não se perde nem fica falsamente synced; fallback factual removido; gates executáveis |
| 1 — estado e persistência | RR-006; contrato/ensaio isolado RR-011 | Readiness por owner/dependência, ausência/erro corretos; fonte com CAS definido e testado |
| 2 — autoridade e integração | RR-007→RR-008→RR-009; completar RR-004; parte picker de RR-015 | Cold search insere; editor/audit/print compartilham publicação e snapshot |
| 3 — edição e contexto | RR-012→RR-010; RR-013; integrar RR-011 no editor | Correção/override/decisão com IDs estáveis; navegação preserva intenção e draft |
| 4 — interação e eficiência | RR-014; restante RR-015; RR-019 | Teclado, erro, loading e orçamento de requests consistentes |
| 5 — operação/aceitação | RR-018; RR-017; Gate A e depois Gate B do relatório | Rehearsal autorizado, backup/rollback, dados reais, multiusuário e piloto aceitos |
| 6 — polish | Nenhum P3 aceito nesta auditoria | Só melhorias opcionais após correção operacional |

RR-004 contenção não espera runtime novo: mostrar indisponível/vazio é suficiente para parar de inventar fatos. RR-016 configuração começa cedo; o gate só fecha depois das violações reais resolvidas. RR-011 envolve banco, mas a sua especificação e testes de contrato podem ocorrer sem live. Número da migração deve vir do ledger real: não assumir 00024 porque já há plano de layout com esse número em documentos.

## PACKET RR-001 — Ownership de fila de produtos

**Goal / Why:** eliminar CR-001: retry não pode declarar salvo sem reenviar a alteração que falhou.

**Files to modify:** src/stores/useLibraryStore.ts; testes em tests/stores/useLibraryStore.test.ts e/ou novo tests/stores/library-save-queue.test.ts.

**Files not to modify:** schemas/RPCs de Workbook e catálogo, migrações históricas, layout V2.

**Invariant:** só ACK da geração salva ou descarte explícito limpa o draft. Pending vazio com in-flight/failed não equivale a synced.

**Expected behavior / design:**

- Registrar generation/baseVersion/latest draft por produto; separar pending e in-flight sem perder ownership.
- flush simultâneo compartilha promise e resultado real. Falha retém geração mais nova e erro; não reenvia indefinidamente.
- ACK elimina apenas a geração reconhecida. Se nova edição ocorreu, ela continua pending.
- loadWorkspace/realtime não substitui draft não confirmado pelo snapshot remoto. Reconcile/conflict explícito preserva ambos.

**Regression test:** AUD-001 convertido para sucesso de retry com segundo RPC; flush durante in-flight; failure→reload; failed generation + edit novo; descarte explícito. Asserções no valor enviado, no persistido simulado e no dirty/status, não apenas no toast.

**Commands:** npx vitest run tests/stores/useLibraryStore.test.ts tests/stores/library-save-queue.test.ts (criar o segundo); depois quatro gates.

**Acceptance criteria:** último valor persiste após retry; nenhuma geração pendente/falha é anunciada clean; requests são limitados e observáveis.

**Dependencies / complexity:** nenhuma; M–L. RR-003 usa o mesmo estado, integrar em sequência.

## PACKET RR-002 — Sessão de draft do Workbook e guarda de saída

**Goal / Why:** eliminar CR-002 em ACK concorrente e troca de experiência.

**Files to modify:** src/components/library/product-workspace/ProductKnowledgeWorkspace.tsx; src/components/library/mega-workspace/ProductWorkspaceExperienceGate.tsx; src/components/library/LibraryView.tsx; src/stores/useUIStore.ts somente para navegação/saída; novo módulo pequeno de sessão de draft por owner, se necessário; testes focais.

**Files not to modify:** IDs/domínio de Workbook, schema SQL, catalog save engine, visual Mega.

**Invariant:** geração mais recente não é substituída por ACK anterior; toda saída dirty é preservada ou decidida pelo usuário.

**Expected behavior:** sessão keyed por owner com baseRevision, draftGeneration e saveGeneration; adotar revisão do ACK sem trocar edits posteriores. Guardar gate, seleção de produto/família e saída de Library. Save/discard/cancel explícitos; falha mantém draft e impede saída silenciosa. Não usar um confirm exclusivo do botão Voltar como autoridade.

**Regression test:** AUD-005 e AUD-012 com asserts de preservação; edit durante save e segundo save; cancel, discard e save que falha em cada saída; troca rápida de owner com load antigo atrasado.

**Commands:** criar e executar npx vitest run tests/integration/workbook-draft-lifecycle.test.tsx; executar também tests/integration/mega-workspace-integration.test.tsx; quatro gates.

**Acceptance criteria:** nenhum dos dois contraexemplos perde conteúdo; dirty só limpa na geração correta; owner errado nunca recebe load/ACK tardio.

**Dependencies / complexity:** nenhuma; L. RR-013 reutiliza a guarda.

## PACKET RR-003 — Revisão do sucessor local

**Goal / Why:** eliminar CR-003 sem mascarar conflito de outro usuário.

**Files to modify:** src/stores/useLibraryStore.ts; tests/stores/library-save-queue.test.ts.

**Files not to modify:** CAS server-side, identidade de produtos, retry global.

**Invariant:** sucessor derivado do próprio save confirmado usa a revisão retornada; conflito remoto não sofre rebase silencioso.

**Expected behavior:** reconciliar baseVersion do successor pending ligado à geração reconhecida, preservando valores novos. Erro 40001 conserva draft e exige resolução, sem loop.

**Regression test:** expectedVersions [1,2] para duas edições de um usuário; terceiro escritor entre ACK e segundo save mantém conflito e nenhum overwrite.

**Commands:** npx vitest run tests/stores/library-save-queue.test.ts; quatro gates.

**Acceptance criteria:** segundo save local chega ao servidor com revisão 2 e último valor; cenário remoto continua protegido.

**Dependencies / complexity:** RR-001; M.

## PACKET RR-004 — Verdade técnica da Library V2

**Goal / Why:** eliminar CR-004, separando exemplos didáticos de conhecimento operacional.

**Files to modify:** src/components/library-v2/LibraryV2Container.tsx; sections/TechnicalDataSection.tsx, ConflictsSection.tsx, OverviewSection.tsx; componente/projeção canônica reutilizável; tests/library-v2.

**Files not to modify:** baseline de design, domínio para acomodar fixtures, segundo banco/store de fatos.

**Invariant:** valor/status/origem/contagem deriva de registro real ou é explicitamente indisponível; zero exige consulta concluída, não fallback.

**Expected behavior:** primeiro remover defaults técnicos e contadores/sucesso fixos; depois consumir snapshot de RR-006 com IDs e policy de consulta. Distinguir legacy field, PIM, herdado, override, conflito, erro e vazio. Ver fontes abre a fonte/datum correspondente. Exemplo continua claramente exemplo.

**Regression test:** produto vazio de pressão não mostra temperatura; facts de família+override+conflict coincidem em V2/Classic/Mega; source click mantém ID; fetch failure não mostra “sem conflitos”.

**Commands:** npx vitest run tests/library-v2 tests/guided-help/father-learning-and-expert-workflow.test.tsx; quatro gates; browser local fixture para evidência real.

**Acceptance criteria:** nenhum fato inventado no caminho operacional; métricas e proveniência auditáveis por owner/revisão.

**Dependencies / complexity:** contenção nenhuma; integração RR-006 e RR-013; M/L.

## PACKET RR-005 — Hook lifecycle da ajuda

**Goal / Why:** corrigir CR-005 de forma pequena e verificável.

**Files to modify:** src/components/guided-help/ContextHelpDrawer.tsx; novo tests/guided-help/context-help-lifecycle.test.tsx.

**Files not to modify:** conteúdo/branding da ajuda, registry/schema sem necessidade.

**Invariant:** hooks incondicionais em ordem estável e effects com cleanup.

**Expected behavior:** declarar hooks antes de return null; condicionar efeito internamente a concept/open; abrir/fechar/trocar repetidamente sem exceção.

**Regression test:** AUD-004 invertido em StrictMode com console/pageerror assertions e estado fechado inicial; primeiro clique real no browser isolado.

**Commands:** npx vitest run tests/guided-help/context-help-lifecycle.test.tsx; quatro gates.

**Acceptance criteria:** app permanece renderizado em toda sequência; nenhuma violação Rules of Hooks.

**Dependencies / complexity:** nenhuma; S. É o primeiro packet indicado a um modelo leve.

## PACKET RR-006 — Snapshot e readiness de knowledge

**Goal / Why:** corrigir CR-006; uma autoridade comum para todos os consumidores.

**Files to modify:** src/domain/table-binding/product-knowledge.runtime.ts; src/stores/useCatalogStore.ts; integração de consumo/load do editor e save de Workbook; módulo de sessão comum se necessário; testes runtime/lifecycle.

**Files not to modify:** IDs de datum, parser/schema para aceitar lixo, conteúdo de catálogo, resolução legacy além da fronteira necessária.

**Invariant:** ready só com dependências atuais; ausência/falha nunca entrega cache anterior como atual.

**Expected behavior:** definir estados por owner e dependência (loading/ready/empty/error), snapshot por geração e revisão, evicção/tombstone na ausência, falha da família propagada. Epoch impede resposta antiga de publicar. Single-flight limita load. Editor/picker/print requerem conhecimento por sessão, não por abertura do modal Export. ACK/evento invalida owner e dependentes; consumidores recebem atualização.

**Regression test:** AUD-006/007 corrigidos; cold editor; present→null/500; family 500; owner switch; old response after new load; save→resolve nova revisão; unsubscribe/unmount; nenhuma chamada ilimitada.

**Commands:** criar npx vitest run tests/integration/knowledge-runtime-lifecycle.test.ts; rodar tests/domain/table-binding; quatro gates.

**Acceptance criteria:** getDatum/getDataset e status pertencem ao mesmo snapshot; stale pode ser mostrado só como stale explícito e não publicável. Ausência não vira erro; erro não vira vazio.

**Dependencies / complexity:** nenhuma; L. Revisão forte obrigatória do contrato antes de RR-007/008/009.

## PACKET RR-007 — Política explícita de publicação

**Goal / Why:** corrigir CR-007 sem alterar intenção de edição.

**Files to modify:** product-knowledge.runtime.ts; src/domain/table-core/publish-safety.audit.ts; tipos/sessão de knowledge; testes de publicação.

**Files not to modify:** precedence global de edição, approval status para fazer teste passar, layout PDF.

**Invariant:** snapshot publicável usa policy publishing; audit e render veem mesmo valor/status/proveniência.

**Expected behavior:** propósito explícito no resolver; usar regra existente da inheritance.engine para family approved/draft override. Preflight rejeita casos não elegíveis ou apresenta escolha explícita conforme política registrada. Não reutilizar cache de editing como publishing sem distinção de chave/purpose.

**Regression test:** AUD-008 invertido; matriz approved/draft/rejected/conflicted/missing e override removido; sem divergência entre audit e valor renderizado.

**Commands:** npx vitest run tests/domain/product-workbook/inheritance-and-overrides.test.ts; criar/executar tests/integration/publishing-knowledge-policy.test.ts; quatro gates.

**Acceptance criteria:** 99 draft nunca é publicado como aprovado; política aplicada em todos os pontos de export via RR-009.

**Dependencies / complexity:** RR-006; M–L; revisão forte.

## PACKET RR-008 — Search-to-insert em sessão fria

**Goal / Why:** corrigir CR-008 e remover dependência oculta de cache aquecido.

**Files to modify:** src/services/product-knowledge/supabase-product-knowledge.provider.ts; src/components/editor/picker/ProductKnowledgePickerModal.tsx; teste integrado do picker.

**Files not to modify:** bindings canônicos para substituí-los por texto sem identidade; schema de dataset.

**Invariant:** resultado habilitado é resolvível por owner/dataset ID ou falha visivelmente.

**Expected behavior:** search materializa/register na sessão comum ou ação resolve on-demand com fetch único; validar revisão/identidade antes de inserir. Ausente/falha exibe mensagem e mantém seleção para retry; sucesso insere estrutura e vínculos corretos.

**Regression test:** AUD-009 corrigido, cold provider→search→select→insert; dataset apagado/revisado, timeout e legacy result.

**Commands:** criar/executar npx vitest run tests/integration/cold-knowledge-picker.test.tsx; quatro gates.

**Acceptance criteria:** não existe no-op silencioso para resultado bindable; abrir export deixa de ser pré-requisito.

**Dependencies / complexity:** RR-006; M.

## PACKET RR-009 — Preparação única de export e snapshot fixo

**Goal / Why:** corrigir CR-009 para clean print, DOM PDF e Publications.

**Files to modify:** src/components/editor/ExportPDFModal.tsx; src/components/export/PrintDocumentView.tsx; src/components/publications/PublicationsView.tsx; novo serviço de preparação/snapshot de export; testes.

**Files not to modify:** CAS de catálogo/template, baseline de render, regras de aprovação enfraquecidas.

**Invariant:** export salvo depende de success=true e renderiza documento+knowledge exatos do preflight.

**Expected behavior:** barrar todo resultado save malsucedido; aguardar ACK correto; preparar publicação uma vez com identidade/versão/policy/fontes e audit. Print recebe snapshot seguro ou verifica versão solicitada e falha se mudou; latest sem pin não satisfaz. Unificar Publications. Se houver export local draft, ação e estado devem ser explicitamente distintos de “salvo”.

**Regression test:** AUD-010 corrigido; matriz offline/42501/500/40001/invalid ACK; outro usuário salva entre ACK e print; cold print com dados PIM; Publications sem bypass; igualdade exata de conteúdo e knowledge.

**Commands:** criar/executar npx vitest run tests/integration/export-snapshot-authority.test.tsx; tests/components/pdf-export-cleanliness.test.ts; quatro gates. Browser isolado de cada caminho, sem dados live.

**Acceptance criteria:** todos os botões usam o mesmo preflight; erro recuperável em vez de versão substituída; render coincide com versão/valor auditados.

**Dependencies / complexity:** RR-006/007; L; revisão forte de snapshot e concorrência.

## PACKET RR-010 — Lifecycle editável de datum e decisão canônica

**Goal / Why:** completar CR-010 na UI operacional, reutilizando domínio existente.

**Files to modify:** src/components/library/product-workspace/WorkspaceTechnicalDataTab.tsx; WorkspaceDocumentsEvidenceTab.tsx; novo detalhe/editor de datum no Classic; integração de edit intent em Mega; testes.

**Files not to modify:** lab/dormant workspace como atalho de produção, operações duplicadas, estrutura geral de layout.

**Invariant:** corrigir preserva datum ID e proveniência; owner/family/override é explícito; autorização é respeitada.

**Expected behavior:** abrir datum existente, editar valor tipado/status permitido, evidência e decisão via operations.ts; create/remove override sem apagar família; family-owner edit separado e explícito. Link read-only→edit seleciona mesmo datum e retorna contexto. Não “editar” excluindo/recriando ID.

**Regression test:** create/save/reload/update mesmo ID; competing evidence→canonical decision; inherited approved→override→remove; permissão negada; Mega→Classic detalhe exato. Combinar save com geração RR-002.

**Commands:** criar/executar npx vitest run tests/integration/datum-editing-lifecycle.test.tsx; tests/domain/product-workbook; quatro gates.

**Acceptance criteria:** engenharia completa correção, decisão e override pela UI sem manipulação manual do banco; contratos de approval testados.

**Dependencies / complexity:** RR-002/006/012/013, integração RR-011; L. Revisão forte de semântica de approval/owner.

## PACKET RR-011 — CAS de SourceDocument

**Goal / Why:** eliminar lost update estático de CR-011.

**Files to modify:** nova migração aditiva após consultar ledger do ambiente de ensaio; src/services/product-workbook/source-document.repository.ts; persistence.types.ts; UI de save/conflito de fonte; testes de contrato e SQL isolado.

**Files not to modify:** migração 00022 já histórica, revisão editorial usada como lock, live DB nesta missão.

**Invariant:** stale expectedVersion não sobrescreve source confirmado; source ID e evidências continuam válidos.

**Expected behavior:** token de concorrência server-managed separado de revision documental; contrato create/update explícito; retorno currentVersion/conflict; draft preservado. Compatibilidade de clientes antigos deve ser decidida de forma fail-closed e documentada. Não deixar endpoint antigo bypassar a proteção.

**Regression test:** dois leitores do mesmo source em banco descartável: A salva, B stale falha; UI guarda B. Create idempotente conforme contrato, missing, corrupt, denied, rollback/upgrade ensaiados.

**Commands:** testes de source repository com doubles e quatro gates. Especificar comando do rehearsal somente após ambiente descartável autorizado e revisão do script; nenhum comando SQL live neste packet.

**Acceptance criteria:** stale update nunca tem sucesso silencioso; migration e compatibilidade auditadas; rollback não perde metadados nem relações.

**Dependencies / complexity:** independente para contrato; coordena RR-010; L; revisão forte de SQL/concorrência obrigatória.

## PACKET RR-012 — Round-trip de valores tipados

**Goal / Why:** corrigir CR-012 mantendo validator estrito.

**Files to modify:** src/components/library/product-workspace/CellEditorModal.tsx; WorkspaceTechnicalTablesTab.tsx somente adaptação necessária; testes de células.

**Files not to modify:** validator para aceitar tipo errado; converter quantity em text; domínio inteiro.

**Invariant:** unchanged save preserva todas as variantes; unsupported é read-only explícito, nunca “—” coercido.

**Expected behavior:** quantity amount/unit/qualifier com parsing tipado; validar antes de onSaveCell; preservar status/evidence; auditar dez variantes do union e oferecer controles apenas onde suportados.

**Regression test:** AUD-013 invertido; tabela de todas as variantes open/save/cancel; edição amount/unit; invalid não chama callback; workbook final passa schema+invariants.

**Commands:** criar/executar npx vitest run tests/components/quantity-cell-editor.test.tsx; tests/domain/product-workbook/schema-and-values.test.ts; quatro gates.

**Acceptance criteria:** quantity 10 bar continua quantity 10 bar; erro aparece antes de injetar célula inválida no draft.

**Dependencies / complexity:** RR-002 para save integrado; M. Bom segundo packet focal para modelo leve.

## PACKET RR-013 — Contexto por identidade e navegação com intenção

**Goal / Why:** corrigir CR-013 e servir RR-004/010.

**Files to modify:** LibraryV2Container.tsx; LibraryView.tsx; useUIStore.ts; gates de experiência apenas contrato de navegação; testes.

**Files not to modify:** cópias de produto em novo store, IDs persistidos, redesign sidebar.

**Invariant:** seleção é ID atual; família/produto/datum/destino nunca divergem.

**Expected behavior:** derivar selectedProduct do store por ID; limpar seleção incompatível na troca/exclusão; remote ACK atualiza detalhe. Intent contém owner e datum/dataset opcional; Classic abre destino preciso; retornar preserva contexto válido. Toda saída usa RR-002.

**Regression test:** family A→B, remote product update, delete, deep-link datum, edit-and-return e cancel de saída dirty.

**Commands:** npx vitest run tests/library-v2; novo tests/integration/library-workspace-navigation.test.tsx; quatro gates.

**Acceptance criteria:** nenhuma tela mostra produto anterior sob família nova; escape é funcional e localizado.

**Dependencies / complexity:** RR-002; M.

## PACKET RR-014 — Contrato compartilhado de teclado/overlays

**Goal / Why:** corrigir CR-014 sem redesenho.

**Files to modify:** ContextHelpDrawer.tsx; GlossaryDrawer.tsx; mega-workspace/SourceDrawer.tsx; ExportPDFModal.tsx; utilitário pequeno de foco/dialog; testes.

**Files not to modify:** tokens de design, nova biblioteca UI ampla, tooltip já acessível sem necessidade.

**Invariant:** foco inicial/contido/devolvido, dialog nomeado, Escape seguro e ações de teclado.

**Expected behavior:** trap reutilizado, cleanup de timers/listeners, trigger restore inclusive aninhamento; div actions viram buttons; tour avança uma vez por tecla.

**Regression test:** Tab/Shift-Tab, Escape, Enter/Space, close/reopen, nested dialog; axe se disponível e teste manual de teclado documentado separadamente.

**Commands:** testes guided-help e novos testes keyboard de export/source; quatro gates; browser isolado manual.

**Acceptance criteria:** nenhuma ação identificada fica inacessível por teclado; foco não sai inadvertidamente do modal.

**Dependencies / complexity:** RR-005/009; M.

## PACKET RR-015 — Orçamento de requests de picker e realtime

**Goal / Why:** corrigir CR-015 com medidas de tráfego local.

**Files to modify:** ProductKnowledgePickerModal.tsx; provider batching; App.tsx e useLibraryStore.ts somente reconciliação realtime; testes de chamadas.

**Files not to modify:** retry global infinito, throttles/RLS do backend, observabilidade que imprime payloads.

**Invariant:** fechado=zero search; query/evento gera trabalho finito e coalescido; draft protegido.

**Expected behavior:** guard isOpen antes do efeito; debounce, cancel/supersession; tirar selectedResult da causa de busca; cache/batch por owner. Definir um dono para refresh de Library e coalescer bursts. Subscription cleanup e StrictMode contados.

**Regression test:** AUD-011 invertido; query estável, digitação rápida, seleção, close/unmount e event burst; medir chamadas reais ao double por componente montado, não chamar resolver manualmente e inferir tráfego UI.

**Commands:** novo tests/integration/knowledge-request-budget.test.tsx; tests/integration/incident1-supabase-storm-guard.test.ts; quatro gates.

**Acceptance criteria:** budgets declarados no teste e satisfeitos; ausência de loop/overwrite; load live continua não alegado.

**Dependencies / complexity:** RR-001/006/008; M.

## PACKET RR-016 — Gates reproduzíveis por SHA

**Goal / Why:** corrigir CR-016.

**Files to modify:** package.json; package-lock.json se dependência necessária; configuração lint; workflow de quality gates para PR/candidato/main.

**Files not to modify:** formatação massiva, migrations em generic CI, remoção de testes/regras para ficar verde.

**Invariant:** quatro comandos executáveis e CI valida exatamente o commit aprovado.

**Expected behavior:** lint compatível com React/TS/Vite e hooks; tratar violações reais de modo focal; lockfile install; gates sem secrets/live. Workflow rehearsal existente permanece separado.

**Regression test:** configuração detecta hook condicional; workflow executa quatro comandos e preserva logs/SHA.

**Commands:** npm ci --ignore-scripts --no-audit --no-fund; npm run lint; npm run typecheck; npm test; npm run build.

**Acceptance criteria:** todos os gates passam no mesmo SHA e são exigidos no fluxo de aprovação; não chamar lint inexistente de PASS.

**Dependencies / complexity:** configuração independente; RR-005 para erro conhecido; M.

## PACKET RR-017 — Documentação verificável

**Goal / Why:** corrigir CR-017 após estabilizar o comportamento.

**Files to modify:** README.md; handoffs afetados em docs/release-readiness; scripts/generate_v2_screenshots.mjs ou substituto de captura isolada.

**Files not to modify:** histórico apagado sem anotação, dados/secrets reais, código funcional fora da captura.

**Invariant:** claims distinguem intenção, ilustração, teste local e produção verificada, com SHA e caminhos reais.

**Expected behavior:** setup Vite/VITE_ correto; links existentes; handoffs antigos marcados superseded; screenshots de HTML sintético rotulados como ilustração; aceitação usa app React com fixtures declaradas.

**Regression test:** checar paths/commands/git refs; executar captura isolada sem live; revisar cada PASS contra evidência.

**Commands:** verificação focada de links/scripts e quatro gates se script/dependência mudar; docs-only exige sanity de caminhos e conteúdo.

**Acceptance criteria:** novo mantenedor sobe ambiente local seguindo README; nenhuma prova de readiness depende de mock visual estático.

**Dependencies / complexity:** finalização depois dos packets funcionais e rehearsal; M.

## PACKET RR-018 — Snapshot local e recuperação operacional

**Goal / Why:** corrigir CR-018 sem prometer backup completo pelo browser.

**Files to modify:** src/components/common/BackupModal.tsx; schema/parser versionado de snapshot; integração document-lifecycle; testes; runbook de backup/restore.

**Files not to modify:** restore automático sobre live, export de sessões/credenciais, bypass de CAS.

**Invariant:** escopo explícito e import validado atomicamente antes de mudar estado; recuperação integral é demonstrada separadamente.

**Expected behavior:** label parcial e exclusões PIM/source/assets; preview/staging de import, validação de todos os campos suportados; catálogo restaurado com contexto/save normal. Definir DB+storage recovery, RPO/RTO e rollback em ambiente autorizado, preservando relações.

**Regression test:** round-trip suportado; malformed/unknown version deixa estado idêntico; import válido entra dirty/save correto; drill isolado verifica workbook/evidence/assets, não só JSON abre.

**Commands:** novo tests/integration/backup-snapshot-restore.test.ts; quatro gates. Comando de restore somente após definir/revisar ambiente descartável.

**Acceptance criteria:** usuário sabe exatamente o que recuperará; dados inválidos não entram; relatório de drill satisfaz Gate B.

**Dependencies / complexity:** RR-001/002/009; M local/L operação.

## PACKET RR-019 — Criar produto com resultado e recuperação

**Goal / Why:** corrigir CR-019 reutilizando formulário/contrato existente.

**Files to modify:** LibraryV2Container.tsx; formulário compartilhado de produto se apropriado; testes V2.

**Files not to modify:** autorização de servidor para contornar denial, client-only role como controle final, redesign.

**Invariant:** sucesso apenas após resultado confirmado; erro preserva input e informa recuperação; um submit gera uma mutação.

**Expected behavior:** capability gate/explicação, pending, validação, erro visível, cancel sem write, selecionar produto só após ACK. Não ignorar resultado de addProduct.

**Regression test:** success/denied/offline/validation/cancel/repeated click e destino após criação.

**Commands:** tests/library-v2 e novo teste de create flow; quatro gates.

**Acceptance criteria:** nenhum silent failure e nenhum duplicate submit; backend continua autoridade de permissão.

**Dependencies / complexity:** RR-013 e save compartilhado; S–M.

## Encaminhamento recomendado

Primeiros packets pequenos para modelos leves: **RR-005**, **RR-012** (componente isolado), **RR-004 contenção**, **RR-016 configuração**. RR-001/003 e RR-002 também são prioritários, mas precisam revisão forte de interleavings antes da integração; não paralelizar edições no mesmo store sem coordenação.

Permanecem para investigação/revisão forte delimitada: snapshot/generation de RR-006, distinção publishing/editing de RR-007, versão imutável de RR-009, migração/compatibilidade CAS de RR-011 e lifecycle semântico RR-010. Não é necessário reabrir toda a auditoria; verificar os contraexemplos e contratos dessas fronteiras no novo SHA.

Próxima ação exata: abrir a wave 0 de implementação em escopo separado, iniciar RR-005 e a story conjunta RR-001→RR-003, preservar testes adversariais como regressões esperadas, submeter o diff e evidências ao auditor forte. **Este documento não executa nem autoriza acesso live.**

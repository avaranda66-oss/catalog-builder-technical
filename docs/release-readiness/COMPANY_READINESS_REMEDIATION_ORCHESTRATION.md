# COMPANY.READINESS.AUDIT1 — Remediation Orchestration Handoff

## Baseline congelado e decisão

**AUDIT1 BASELINE:** 9843d51a1535ce867d3d5f337253c1d35497c8f0. **NOT READY.**
**19 findings: P0=2, P1=10, P2=7, P3=0.** Nenhuma severidade foi alterada; nenhuma descoberta foi reaberta.

Este documento governa a ordem de execução futura, refinando as waves dos packets anteriores. Não muda seu diagnóstico ou critério funcional. Nenhum agente de implementação foi iniciado, nenhuma branch de remediation foi criada, nenhum fix foi escrito.

Fontes congeladas: COMPANY_READINESS_AUDIT1.md, COMPANY_READINESS_FINDINGS.md e COMPANY_READINESS_IMPLEMENTATION_PACKETS.md, neste diretório. Os 13 probes e respectivos hashes já estão preservados no relatório; não precisam ser publicados como arquivos de teste nesta entrega.

## Famílias, grupos arquiteturais e modelos

**Seis famílias de causa**, preservando o agrupamento da auditoria:

- F1 — Save / ACK / rascunho / concorrência.
- F2 — Cache / readiness / orçamento de requests.
- F3 — Autoridade PIM / fallback / lifecycle factual.
- F4 — Catálogo / inserção / exportação.
- F5 — Runtime UI / navegação / teclado / feedback.
- F6 — Tooling / documentação / recuperação operacional.

Um finding pode participar de uma fronteira secundária; a matriz registra sua família principal. Família causal não obriga unificar stores de entidades diferentes.

| Grupo de correção | Owner de arquitetura | Regra |
|---|---|---|
| G1 — RR-001 + RR-002 + RR-003 | Um agente STRONG | Um contrato de draft generation/baseRevision/ACK/failure/discard; adaptar Library e Workbook separadamente, sem três soluções independentes ou store genérico obrigatório |
| G2 — RR-006 + RR-007 + RR-008 + RR-009 + RR-004 completo + RR-015 | Um responsável STRONG por knowledge/publication | Contrato de owner/revision/purpose/readiness e snapshot auditado/renderizado; execução serial nos arquivos compartilhados. RR-008 pode ser implementado por MEDIUM após contrato congelado |
| G3 — RR-011 + RR-010 + RR-012 | Um responsável STRONG por lifecycle factual/source | Source CAS e decisões/edição preservam identidade; quantity é componente local delegável, não redesenho do domínio |
| G4 — RR-013 + RR-014 + RR-019 + RR-005 | MEDIUM para implementação, contratos de G1/G2 como entrada | Navegação/teclado/feedback não inventam autoridade ou política de save |
| G5 — RR-016 + RR-017 + RR-018 | STRONG apenas recuperação, MEDIUM tooling, LIGHT docs | Aceitação por SHA; backup integral não é confundido com snapshot local |

**Classificação do packet completo:**

- **STRONG MODEL REQUIRED (11):** RR-001, 002, 003, 004, 006, 007, 009, 010, 011, 015, 018.
- **MEDIUM MODEL SUFFICIENT (5):** RR-008, 013, 014, 016, 019, depois de suas dependências.
- **LIGHT IMPLEMENTATION SAFE (3):** RR-005, 012, 017.
- **Exceção delimitada:** RR-004C, contenção de fallback, é tarefa LIGHT dentro do RR-004 STRONG. RR-004C não fecha o finding inteiro. Mostrar indisponível não exige decidir projeção canônica.
- LIGHT aplica contrato e teste especificados. Se surgir decisão de cache, autoridade, migração, concorrência ou mudança de domínio, devolver ao owner STRONG; não “descobrir a solução” por tentativa.
- Astra é o papel de arquitetura/auditoria forte neste plano; nenhum modelo foi chamado automaticamente. Antes de auto-dispatch futuro: story válida, owner, limite de custo explícito e política de interrupção conforme Constitution. Nenhum orçamento numérico foi inventado aqui.

## Ownership de arquivos

Siglas usadas na matriz; caminhos relativos ao candidato:

| Owner de área | Arquivos principais e limite |
|---|---|
| SAVE | src/stores/useLibraryStore.ts; library/product-workspace/ProductKnowledgeWorkspace.tsx; library/LibraryView.tsx; mega-workspace/ProductWorkspaceExperienceGate.tsx; useUIStore.ts para dirty-leave; novos testes de lifecycle |
| HELP | src/components/guided-help/ContextHelpDrawer.tsx e testes de primeiro open |
| CELL | src/components/library/product-workspace/CellEditorModal.tsx e testes tipados; Wave 0 não altera WorkspaceTechnicalTablesTab |
| V2 | src/components/library-v2/LibraryV2Container.tsx e sections/TechnicalDataSection, ConflictsSection, OverviewSection; testes V2 |
| TOOL | package.json, package-lock.json, lint config, workflow de gates; nenhuma edição automática em src |
| KNOW | src/domain/table-binding/product-knowledge.runtime.ts; src/stores/useCatalogStore.ts; integração de invalidação após ACK do Workbook |
| PICK | src/services/product-knowledge/supabase-product-knowledge.provider.ts; editor/picker/ProductKnowledgePickerModal.tsx |
| EXPORT | src/domain/table-core/publish-safety.audit.ts; editor/ExportPDFModal.tsx; export/PrintDocumentView.tsx; publications/PublicationsView.tsx; serviço de snapshot proposto |
| SOURCE | source-document.repository.ts, persistence.types.ts, nova migração aditiva e testes isolados; não editar migration histórica 00022 |
| EDIT | WorkspaceTechnicalDataTab.tsx, WorkspaceDocumentsEvidenceTab.tsx, WorkspaceTechnicalTablesTab.tsx e editor/detail proposto |
| NAV | LibraryV2Container.tsx, LibraryView.tsx, useUIStore.ts e gates apenas navegação; lock sucede SAVE/V2 |
| A11Y | drawers de help/source e ExportPDFModal.tsx; lock sucede HELP/EXPORT |
| OPS | BackupModal.tsx, schema/import lifecycle e runbook de recuperação |
| DOC | README e handoffs/captura real, após comportamento estabilizado |

Prefixos abreviados de componentes/stores na tabela pertencem a src/components ou src/stores. O packet original contém o detalhe. Nenhum agente adquire ownership implícito de tests/setup.ts, configuração compartilhada ou arquivo de outro owner.

Cada branch usa worktree isolado, um escritor por arquivo. O integrador mantém lock de área e checklist de paths. Ao precisar de arquivo ocupado, entregar contrato/teste ao owner ou esperar; não fazer dois patches para reconciliar depois. Fixtures compartilhadas novas têm um dono e são integradas antes dos consumidores.

## Matriz completa de dependências

Dependências são de implementação/integração, não todas relações de reauditoria. C=contenção RR-004C; K=contrato integrado RR-006+007. R1–R5 são checkpoints definidos abaixo. “Paralelo” é permissão limitada aos paths/etapas indicados, não autorização geral.

| ID | Sev. / modelo | Família | Depends on | Blocks (diretos) | Can run in parallel with | Must be reaudited with | Likely ownership |
|---|---|---|---|---|---|---|---|
| RR-001 | P0 / STRONG | F1 | Contrato G1 | 003, 015, 018; fechamento G1 | 004C, 016 após 0A | 002,003 em R1 | SAVE, mesmo owner G1 |
| RR-002 | P0 / STRONG | F1 | Contrato G1 | 013,010,018; integração 012 | 004C,016, não outro writer SAVE | 001,003,012,013 | SAVE, mesmo owner G1 |
| RR-003 | P1 / STRONG | F1 | 001 | Fechamento G1 | 004C,016 | 001,002 em R1 | SAVE |
| RR-004 | P1 / STRONG; C LIGHT | F3 | C nenhuma; completo 006,007,013 | Aceite V2 e R2 completo | C com G1/016; completo com SOURCE | 006,007,008,009,013,015 | V2 |
| RR-005 | P1 / LIGHT | F5 | Nenhuma | 014, gate lint de hook conhecido | 012 e design G1 | 014; smoke app em R1 | HELP |
| RR-006 | P1 / STRONG | F2 | G1 integrado para ligação ACK | 007,008,004 completo,015,010 | 011 backend, sem UI EDIT | 004,007,008,009,015 em R2 | KNOW |
| RR-007 | P1 / STRONG | F3 | 006 | 009,004 completo | 011 backend | 006,008,009,004,010 | KNOW + EXPORT policy |
| RR-008 | P1 / MEDIUM | F4 | K congelado | 009 integrada,015 picker | 011 backend | 006,007,009,015 | PICK |
| RR-009 | P1 / STRONG | F4 | 006,007,008 integrado | 014 export,018; release | 011 backend, após contrato K | 006,007,008,004,015 em R2 | EXPORT |
| RR-010 | P1 / STRONG | F3 | 002,006,011,012,013 | Edição aceita / R3 | Nenhum writer EDIT; 016 já fechado | 011,012,013 e G1 | EDIT |
| RR-011 | P1 / STRONG | F1 | Contrato CAS aprovado; ambiente descartável autorizado para DB | 010 final,018 recovery | 006→009; backend apenas | 010,002 e source concorrente em R3 | SOURCE; UI depois com EDIT |
| RR-012 | P1 / LIGHT | F3 | Nenhuma no componente; 002 no save integrado | 010; jornada quantity | 005/design G1 em 0A | 002,010 em R1/R3 | CELL, teste próprio |
| RR-013 | P2 / MEDIUM | F5 | G1 integrado | 004 completo,010,019 | Após SAVE/V2 liberados; SOURCE backend | 002,004,010,019 | NAV |
| RR-014 | P2 / MEDIUM | F5 | 005,009 | Aceite keyboard / piloto | 015,019 se sem alteração NAV/A11Y cruzada | 005,009,013 em R4 | A11Y |
| RR-015 | P2 / STRONG | F2 | G1,K,008,009 integrados | R2 final, release | 014 e 019: PICK/KNOW/SAVE locks exclusivos | 001,006,008,009,004 | PICK+KNOW+App/SAVE eventos |
| RR-016 | P2 / MEDIUM | F6 | Config nenhuma; 005 para erro conhecido | Aceite de todas as waves | G1/004C, config-only | Gates de todos os SHAs | TOOL |
| RR-017 | P2 / LIGHT | F6 | Comportamento final,018/runbook e resultados reais | Gate B documental | Só redação sem bloquear código; final após freeze | R5, sem strong para copy trivial | DOC |
| RR-018 | P2 / STRONG | F6 | G1,009,011; arquitetura restore | 017 final; operação | Não com writer de lifecycle ativo | 001,002,009,011 em R5 | OPS |
| RR-019 | P2 / MEDIUM | F5 | 001,013,004 completo liberado | Aceite create V2 | 014,015 com locks distintos | 001,004,013 em R4 | V2 |

A matriz evita o ciclo aparente “V2 depende de navegação, navegação depende de V2”: 013 usa contrato de IDs e pode preceder 004 completo; 004C é independente. Reauditoria conjunta não cria dependência circular de implementação.

## Wave 0 — dispatch exato

Limite proposto: **três agentes de trabalho simultâneos**, mais integrador/auditor somente leitura. Nenhum dispatch foi executado agora.

### 0A — dois fixes locais e um design forte em paralelo

Todos partem de H0, definido na estratégia de branches.

1. **Agente A / LIGHT → RR-005.** Somente HELP + teste próprio. Resultado: primeiro open/reopen sem hook error.
2. **Agente B / LIGHT → RR-012.** Somente CELL + teste próprio. Quantity round-trip; outros tipos não suportados preservados/read-only. Sem mexer no parent/save/validator.
3. **Agente C / STRONG → design único G1 (RR-001/002/003).** Contrato de gerações, ACK, failure/retry, sucessor CAS, owner switch e saída dirty; plano de integração nas duas autoridades. Nesta subetapa escreve somente a story/decisão futura do grupo, não src.

Não há sobreposição de arquivos. Integração exata: A→B→contrato C. O coordenador congela **H0A**. Testes focais de A/B e revisão forte do contrato C; nenhum PASS de readiness atribuído ainda. RR-012 só fecha a jornada completa após R1.

### 0B — correção estrutural e duas tarefas disjuntas

Todos partem de H0A, em branches novas para esta subetapa; não continuar branch velha com base flutuante.

1. **Agente C / STRONG → implementar G1 inteiro.** Sequência interna: RR-001 ownership→RR-003 revisão sucessora→RR-002 sessão de Workbook/guarda, preservando contrato único. Não dividir entre três agentes.
2. **Agente A / LIGHT → RR-004C.** Remover fatos/counters/badges/conflito “verde” sem autoridade; apresentar vazio/indisponível. Não construir projeção PIM, não alterar navegação.
3. **Agente B / MEDIUM → RR-016.** Script/config lint+hooks e CI. Sem autofix, formatação ou alteração incidental em src. Violações encontradas são devolvidas ao owner correspondente.

Podem trabalhar em paralelo: SAVE, V2 containment e TOOL são áreas distintas. Merge exato: **G1→004C→016** no integrador Wave 0. Esse estado provisório é **H0B**, ainda não aprovado. Se lint encontrar erro, owner corrige em sua área; não desabilitar regra ou pular gate.

4. **Checkpoint R1 / STRONG** sobre H0B: adversários de fila/ACK/saída/CAS + quantity integrado + help smoke. Quatro gates no mesmo SHA.
5. Só após aprovação R1 registrar **H1 = SHA final aprovado da Wave 0**. Falha interrompe promoção; não rebasear main nem avançar para Wave 1.

RR-004 permanece aberto após contenção. RR-012 só é considerado corrigido quando save de Workbook com a célula foi validado. Prioridade dos P0 não foi rebaixada: o design começa no primeiro lote e a implementação entra antes das contenções no merge.

## Waves seguintes — ordem, base e paralelismo

| Wave | Base fixa | Ordem de execução / integração | Paralelismo permitido | Saída |
|---|---|---|---|---|
| 1 — cache + source CAS | H1 | KNOW: 006→007; SOURCE: 011 backend/contrato/ensaio isolado; integrar KNOW depois SOURCE | Dois responsáveis STRONG, áreas separadas; 011 não edita DocumentsEvidence UI nesta wave | H2 após revisão K/source contract e gates |
| 2 — contexto e autoridade ponta a ponta | H2 | 013→004 completo→008→009→015 | Execução conservadora serial: os consumers e locks se sobrepõem; não abrir quatro patches no runtime | H3 após R2 one-truth/export completo |
| 3 — ciclo de edição | H3 | 010 com 011 UI/source contract + regressões 012 e G1 | Um owner STRONG EDIT; nenhum outro writer nos mesmos tabs | H4 após R3 |
| 4 — interação | H4 | 014 e 019 em paralelo; integrar 014→019 | A11Y versus V2, desde que nenhum patch toque NAV compartilhado | H5 após R4 + gates |
| 5 — recuperação, documentação, validação autorizada | H5 | 018→ensaios operacionais autorizados→017 final | Docs podem ser preparados em paralelo, mas claims só fecham após evidência | H6 após R5; candidato a Gate A, não aprovação automática |
| 6 — polish | H6 | Nenhum P3 aceito; não há dispatch obrigatório | Não se aplica | Não é condição inventada para release |

RR-011 e RR-018 podem ter código/contratos locais verificados antes de qualquer live. DB descartável requer autorização de ambiente própria; se indisponível, manter essa parte NOT VERIFIED e não fechar o gate dependente. Produção/live continuam fora desta missão.

## Estratégia conservadora de branches e SHAs

**Nenhuma branch abaixo foi criada.** Branches propostas usam prefixo codex/. Um integrador por wave, sem force e sem merge em main nesta fase.

- **S0:** SHA auditado exato 9843d51a1535ce867d3d5f337253c1d35497c8f0.
- **H0:** commit documental desta entrega, filho direto de S0, contendo os quatro documentos. Resolver pelo hash do commit final informado ao usuário e registrar antes do primeiro dispatch. Source tree H0 = S0.
- H0A/H0B/H1…H6 são **slots para futuros SHAs completos**, não refs flutuantes nem hashes inventados. O integrador preenche o SHA de cada gate aprovado no manifesto da wave antes de criar branches dependentes.
- Nenhuma wave parte de origin/main, “latest” ou de branch individual não integrada. Cada base é o snapshot combinado explicitamente aprovado.
- Resolução conservadora de conflito inesperado: suspender merge e devolver ao owner; não inventar resolução no integrador. Rebase/cherry-pick não substituem reauditoria do novo SHA.

| Base | Branch proposta | Packets / paths esperados | Merge order |
|---|---|---|---|
| H0 | codex/remediation-company-wave0 | Integradora de 0A/0B, stories/evidências | Recebe a sequência abaixo; não implementação concorrente própria |
| H0 | codex/rr005-help | 005 / HELP | 0A #1 |
| H0 | codex/rr012-cell | 012 / CELL | 0A #2 |
| H0 | codex/g1-draft-design | Design 001/002/003 / story+contrato somente | 0A #3 → H0A |
| H0A | codex/g1-draft-implementation | 001→003→002 / SAVE | 0B #1 |
| H0A | codex/rr004-containment | 004C / V2 sem NAV | 0B #2 |
| H0A | codex/rr016-quality-gates | 016 / TOOL | 0B #3 → R1 → H1 |
| H1 | codex/remediation-company-wave1 | Integradora | KNOW→SOURCE → H2 |
| H1 | codex/g2-knowledge-contract | 006→007 / KNOW, policy EXPORT | Wave 1 #1 |
| H1 | codex/rr011-source-cas | 011 backend / SOURCE | Wave 1 #2, ensaio isolado obrigatório para fechar SQL |
| H2 | codex/remediation-company-wave2 | 013→004→008→009→015; NAV/V2/PICK/EXPORT/KNOW, ownership transferido serialmente | R2 → H3 |
| H3 | codex/remediation-company-wave3 | 010 + 011 UI / EDIT; regressões CELL/SAVE | R3 → H4 |
| H4 | codex/remediation-company-wave4 | Integradora | 014→019 |
| H4 | codex/rr014-keyboard | 014 / A11Y | Wave 4 #1 |
| H4 | codex/rr019-create-feedback | 019 / V2 | Wave 4 #2 → R4 → H5 |
| H5 | codex/remediation-company-wave5 | 018→017 / OPS→DOC, ensaios registrados | R5 → H6 |

Em waves seriais, handoff entre agentes troca owner apenas após commit integrado e testes focais, registrando sub-SHA. Não criar branches dependentes de H2 antes de H2 existir.

**Publicação documental desta entrega:** commit local somente dos quatro documentos de auditoria/handoff. Push opcional não executado: audit/company-readiness-v1 já contém o merge dos candidatos e difere de main em fonte de produção; publicar essa branch não satisfaz a condição literal de branch contendo apenas documentos. Não reescrever a história nem criar outra branch para contornar o limite. O commit documental, isoladamente, tem zero alteração de source. Publicação do candidato combinado é uma decisão distinta.

## Checkpoints fortes e gates por wave

**Q obrigatório para toda wave de implementação:** testes focais + adversários indicados + npm run lint + npm run typecheck + npm test + npm run build, todos no SHA integrado, com logs. Até RR-016, subetapa 0A registra lint indisponível; **Wave 0 não fecha assim**. Suite verde sozinha não é aceite. Nenhuma repetição da suite foi necessária nesta entrega exclusivamente documental.

| Checkpoint / wave | Targeted tests e probes | Invariante / trabalho do STRONG |
|---|---|---|
| Contrato G1 / 0A | Tabela de estados/interleavings AUD-001/002/005/012, sem escrever fix | Um modelo de ACK/draft aplicável às duas autoridades; nenhuma geração some entre pending/in-flight/failed |
| R1 / Wave 0 | Library queue, workbook lifecycle, quantity round-trip e help; AUD-001,002,003 contenção,004,005,012,013; Q | Retry envia último draft; ACK antigo não o apaga; successor usa versão correta; true remote conflict fica explícito; saída dirty preserva/cancela |
| Contrato K/source / Wave 1 | Runtime lifecycle AUD-006/007; policy AUD-008; repository/source CAS dois leitores em ambiente isolado; Q | Ausência≠erro≠ready; policy explícita; fonte não sofre stale overwrite. Não declarar export corrigido ainda |
| R2 / Wave 2 | Cold picker, navegação, V2 truth, export snapshot, request budgets; AUD-003/006/007/008/009/010/011; Q | Um datum: same owner/revision/value/status/source em consulta, binding e publicação; ACK salvo/snapshot/render iguais; closed picker=0 |
| R3 / Wave 3 | Datum/evidence/override lifecycle, source CAS UI, typed cell+reload, AUD-005/012/013; Q | Correção mantém ID/proveniência; family override não modifica família; save concorrente/decisão e retorno mantêm draft |
| R4 / Wave 4 | Help/source/export keyboard, V2 create denied/offline/repeated submit; AUD-004 smoke; Q | Ações semânticas e foco corretos; permissão e resultado não são inventados; nenhuma regressão de navegação/ACK |
| R5 / Wave 5 | Snapshot import atomicity, restore DB/storage autorizado, export equality, concorrência e roles; todos os 13 já como regressões; Q | Restore mantém relações e rollback é demonstrado; o ambiente corresponde ao SHA. STRONG avalia evidência/risco, não revisa copy trivial |

R1 é a **primeira reauditoria forte de implementação**, sobre o SHA integrado de toda Wave 0, não três aprovações isoladas de RR-001/002/003. Antes dela, STRONG já aprovou o design, o que não conta como validação de fix.

## Destino dos 13 probes

Todos: **PROMOTE TO PERMANENT REGRESSION TEST**, 13/13; **KEEP AS AUDIT PROBE exclusivo=0; DISCARD AFTER FIX=0**. A versão histórica que afirma o defeito permanece no relatório, não na suite permanente que deve afirmar o comportamento correto.

| Probe | Finding / promoção permanente | Critério que deve substituir o assert do defeito |
|---|---|---|
| AUD-001 | RR-001 / Library queue | Retry efetivamente reenvia e ACK confirma a geração final |
| AUD-002 | RR-003 / Library concurrency | Sequência expectedVersions [1,2], sem mascarar conflito de terceiro |
| AUD-003 | RR-004 / V2 truth | Produto vazio não recebe especificação/proveniência fictícia |
| AUD-004 | RR-005 / help lifecycle | Closed→open→reopen mantém hooks/app íntegros |
| AUD-005 | RR-002 / Workbook draft | Edit posterior ao save permanece após ACK anterior |
| AUD-006 | RR-006 / runtime lifecycle | Workbook removido não resolve fato antigo como atual |
| AUD-007 | RR-006 / dependencies | Falha da família nunca é ready/known-empty silencioso |
| AUD-008 | RR-007 / publishing policy | Draft override não passa como aprovado na publicação |
| AUD-009 | RR-008 / cold picker | Resultado bindable materializa/insere ou falha visivelmente |
| AUD-010 | RR-009 / export ACK | Save falho não abre export salvo; snapshot fixo é verificado |
| AUD-011 | RR-015 / request budget | Picker fechado não busca; reabertura/typing são limitados |
| AUD-012 | RR-002 / experience gate | Troca dirty exige decisão/preserva draft |
| AUD-013 | RR-012 / typed cell | Unchanged quantity mantém valor/tipo/unidade e valida |

Promover por área em arquivos de teste permanentes dos packets; evitar novo “mega arquivo adversarial” compartilhado por todos os agentes. Isolar estado dos stores, controlar timers/deferred promises, manter fetch externo bloqueado. Trocar o mock de Summary por interação real onde necessário para aceitar jornada completa, sem perder o teste unitário de race. Todos os P0/P1 corrigidos conservam contraexemplo; RR-010/011, estáticos, também recebem os testes novos de lifecycle/dois leitores previstos.

## Precisão dos P0

### CR/RR-001 — no máximo dez linhas

- P0 porque uma alteração do usuário perde ownership de persistência e retry anuncia sucesso falso.
- AUD-001 reproduziu falha de save, fila vazia e segundo flush synced/clean sem segundo RPC.
- O trabalho em risco são os edits de produto feitos via Library store.
- Podem sobreviver temporariamente em memória/cache, mas não foram confirmados no servidor; reload pode substituí-los.
- Não se afirma corrupção SQL nem perda de todos os produtos.
- O defeito de fila/falso ACK está provado localmente; sua classificação não depende de live.
- Live posterior valida o contrato completo, não é necessário para reconhecer essa perda de write.

### CR/RR-002 — no máximo dez linhas

- P0 porque rascunho posterior ao início do save é efetivamente descartado.
- AUD-005: draft com dois módulos volta a um após ACK da versão anterior, dirty=false.
- AUD-012: Classic dirty→Mega→Classic volta ao workbook inicial, sem confirmação.
- Módulos foram o instrumento; fatos/datasets/evidências compartilham a mesma sessão de draft.
- Parent e gate reais executaram; Summary foi um driver determinístico de edição.
- Há perda local reproduzida, sem prova de corrupção persistida.
- A classificação P0 está sustentada localmente e não depende de confirmação live.

## Gate A — READY FOR CONTROLLED INTERNAL PILOT

**Oito grupos de blockers, todos ainda abertos nesta entrega.** São grupos de aceitação, não oito findings novos nem oito bugs adicionais. O escopo proposto inclui as superfícies operacionais auditadas; restringi-lo exige bloqueio de acesso real e contrato explícito.

- [ ] **A1 — Correção:** zero P0/P1 no escopo piloto; nenhuma falsa verdade, perda de draft ou export divergente; exclusões realmente inacessíveis e documentadas.
- [ ] **A2 — Código integrado:** Q verde no mesmo SHA; 13 regressões promovidas + testes de findings estáticos; R1–R4 aceitos; journeys do piloto passam.
- [ ] **A3 — Dados representativos:** pressão/temperatura/vazio/family-only/override/evidence/dataset em browser isolado; artefato exportado igual ao snapshot; teclado dos participantes atendido.
- [ ] **A4 — Backend autorizado:** rehearsal descartável/staging de migrations/RLS/RPC/CAS/roles/duas sessões, incluindo source CAS, sem UNKNOWN no save/verdade/export disponibilizado.
- [ ] **A5 — Tráfego/diagnóstico:** orçamento de requests medido em montagem/eventos/falhas e telemetria de erro/save sem secrets; nenhum storm ou retry ilimitado.
- [ ] **A6 — Recuperação do piloto:** backup/restore/rollback ensaiados para seus dados; responsável e procedimento de incidente definidos.
- [ ] **A7 — Deploy de piloto:** staging/ambiente controlado identificado por SHA/env; flags, defaults e mecanismo de parada verificados.
- [ ] **A8 — Operação controlada:** participantes, fluxos, dados, dono de cada P2 aceito, canal de suporte, monitoramento e critérios de parada registrados.

Engineering hardening local pode começar sem live. Gate A exige backend real **isolado/autorizado** para o escopo que usará persistência; não exige acesso ao banco de produção. Não usar funcionários como teste inicial de segurança de save.

## Gate B — READY FOR DAILY COMPANY USE

**Dezesseis grupos cumulativos: A1–A8 + B1–B8.** Os oito abaixo são adicionais. Não converter uma passagem do piloto em aprovação empresarial automática.

- [ ] **B1 — Gate A e piloto concluídos:** aceite documentado e ciclo de trabalho acordado com engenharia/comercial/admin; evidências, não só tempo decorrido.
- [ ] **B2 — Jornada empresarial:** todas as jornadas necessárias aceitas; zero P0/P1; P2 remanescente tem aceitação específica e workaround praticável.
- [ ] **B3 — Integridade observada:** nenhum incidente aberto de draft perdido, false success, dado inelegível publicado, conflito sobrescrito ou snapshot divergente; regressões dos incidentes adicionadas.
- [ ] **B4 — Multiusuário real:** usuários/roles distintos, concorrência, revogação/expiração de sessão, reconnect e falha parcial exercitados no ambiente autorizado.
- [ ] **B5 — Produção verificada:** deploy SHA/env, ledger, RLS/grants, RPCs, assets/signed URLs e integrações efetivas conferidos; nenhuma alegação herdada apenas de staging.
- [ ] **B6 — Recuperação integral:** restore de Workbook/source/evidence/catalog/template/storage preserva relações; RPO/RTO acordados e medidos; rollback app/schema compatível demonstrado.
- [ ] **B7 — Operação e aprendizagem:** observabilidade/alertas/on-call e capacidade/performance reais adequados; documentação atual, treinamento e teclado com usuários; Classic não aposentada sem paridade aceita.
- [ ] **B8 — Aceite final:** strong auditor e donos engenharia/comercial/operação aprovam a evidência do SHA implantado; qualquer mudança posterior exige validação proporcional.

## Resultado desta entrega

- Baseline e severidades preservados; dependências de 19/19 packets mapeadas.
- Um owner para G1, um contrato para G2; sem concorrência de writers na mesma área.
- Wave 0 ordenada e SHAs futuros definidos por gates, sem inventar hashes.
- Commit local solicitado: somente os quatro documentos de auditoria/handoff.
- Push opcional: não executado pela condição docs-only da branch existente, explicada acima.
- Production source/main/live: nenhuma modificação; não houve testes live, novos probes de produção ou implementação.
- Próxima ação: despachar futuramente 0A a partir de H0 — A em RR-005, B em RR-012 e C forte no design conjunto RR-001/002/003 — sem iniciar 0B antes do contrato aprovado.

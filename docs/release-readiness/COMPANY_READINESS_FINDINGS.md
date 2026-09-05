# Company Readiness Audit 1 — Findings

Audit target: 9843d51a1535ce867d3d5f337253c1d35497c8f0. Local combined candidate only.

This ledger is an independent acceptance audit, not an implementation or a claim about deployed database behavior.

## Escopo e classificação

Veredito: **NOT READY**. Contagem: **P0 2 / P1 10 / P2 7 / P3 0**. Severidades usam impacto operacional da missão, não quantidade de testes. Perda de rascunho é P0 mesmo sem corrupção comprovada no servidor. O crash acionado pela ajuda é P1: bloqueia a sessão após uma ação específica, sem evidência de indisponibilidade permanente do serviço.

Evidência LOCAL significa execução com doubles de rede/repositório; BROWSER LOCAL significa React real em navegador isolado, com tráfego externo bloqueado; ESTÁTICA significa contrato/caminho de código confirmado, sem executar banco. Nenhum resultado comprova comportamento do ambiente implantado. Os 13 probes passam quando **reproduzem o defeito**, não quando aprovam a funcionalidade. Fontes e harness estão preservados no apêndice do relatório principal.

Os caminhos abaixo são relativos à raiz do candidato local. Linhas referem-se ao SHA auditado. Recomendações são trabalho futuro; nenhum fix foi aplicado.

| Família de causa | Findings | Contrato a convergir |
|---|---|---|
| Save / ACK / rascunho | CR-001, 002, 003, 011 | Geração local, ACK exato, revisão, conflito e descarte explícito |
| Cache / readiness | CR-006, 008, 015 | Snapshot por owner/revisão, dependências completas, ausência versus erro |
| Autoridade PIM / fallback | CR-004, 007, 010, 012 | Identidade, valor tipado, proveniência, política de publicação |
| Catálogo / exportação | CR-008, 009 | Seleção resolvível e mesmo snapshot auditado/renderizado |
| Runtime / interação / erro | CR-005, 013, 014, 019 | Lifecycle, contexto, teclado e conclusão visível da ação |
| Tooling / documentação / operação | CR-016, 017, 018 | Evidência por SHA, gates executáveis, recuperação demonstrada |

CR-002 agrupa duas perdas da mesma sessão de edição. CR-006 agrupa dois falsos estados de prontidão e a invalidação ausente. CR-009 agrupa os caminhos de exportação que precisam de um contrato comum. Não se contam seus sintomas novamente como findings independentes.

## CR-001 — Fila de Library perde saves falhos e retry declara sincronização falsa

- **Severity:** P0.
- **Affected user:** qualquer usuário que edita produtos via useLibraryStore.
- **User impact:** a alteração fica apenas no estado/cache local; um retry aparenta salvá-la, mas reload pode recuperar o valor antigo.
- **Reproduction:** AUD-001, LOCAL. Produto versão 1; editar célula; saveProduct retorna success:false/offline; primeiro flush falha e mantém dirty. Segundo flush retorna true, synced e clean, com apenas uma chamada total ao RPC. Não houve segunda tentativa.
- **Code evidence:** src/stores/useLibraryStore.ts:697–760; sucesso com fila vazia em 698–700; captura/clear da fila em 712–713; erros em 730–743 não reenfileiram.
- **Root cause:** o lote sai da fila antes do ACK e não volta em caso de erro. Fila vazia é confundida com persistência confirmada, inclusive antes da verificação de in-flight.
- **Broken invariant:** nenhum edit pode ficar clean/synced antes do ACK da sua geração ou de descarte explícito pelo usuário.
- **Blast radius:** autosave e retry de todos os produtos da Library; cache local não constitui outbox confiável.
- **Recommended fix:** RR-001. Manter ownership das gerações pending/in-flight/failed até ACK; preservar a versão local mais recente; segundo flush deve aguardar a mesma promise; erro exige retry limitado ou ação explícita.
- **Regression test:** falha→retry envia novo RPC; flush durante request não retorna sucesso antecipado; reload não apaga draft pendente; descarte explícito funciona.
- **Implementation complexity:** M–L.
- **Dependencies:** nenhuma; precede RR-003.

## CR-002 — ACK e troca Classic/Mega apagam rascunho do Workbook

- **Severity:** P0.
- **Affected user:** engenharia editando módulos, fatos, tabelas ou evidências no Classic Workspace.
- **User impact:** trabalho feito após o início de um save é substituído pelo snapshot anterior; trocar experiência desmonta e perde o draft sem perguntar.
- **Reproduction:** AUD-005, LOCAL: um módulo→save deferido→dois módulos→ACK do primeiro snapshot; UI volta a um e dirty=false. AUD-012: draft com um módulo→Mega→Classic; volta a zero e confirm nunca é chamado. O filho Summary foi substituído por botão determinístico de edição; parent e gate reais foram exercitados.
- **Code evidence:** src/components/library/product-workspace/ProductKnowledgeWorkspace.tsx:132–151 substitui workbook no ACK; apenas o botão Voltar tem guarda em 176–183. src/components/library/mega-workspace/ProductWorkspaceExperienceGate.tsx:62–87 desmonta o Classic.
- **Root cause:** geração de edição não é comparada ao ACK; dirty pertence a um filho que controles de navegação externos podem desmontar.
- **Broken invariant:** ACK liquida apenas a geração salva; qualquer saída deve preservar draft ou obter decisão explícita save/discard/cancel.
- **Blast radius:** toda a sessão de edição do Workbook, não apenas módulos usados como instrumento de reprodução.
- **Recommended fix:** RR-002. Sessão de draft por owner compartilhada com o gate; reconciliar revisão sem sobrescrever edits posteriores; contrato único de saída para experiência/produto/família/área.
- **Regression test:** editar durante ACK conserva ambos os edits e dirty; salvar novamente persiste a geração final; cancelar navegação permanece; falha no save não descarta; todas as saídas usam a mesma guarda.
- **Implementation complexity:** L, extração incremental de lifecycle, sem reescrever workspace.
- **Dependencies:** nenhuma; RR-013 consome esse contrato.

## CR-003 — Segundo save da Library conflita com o próprio ACK anterior

- **Severity:** P1.
- **Affected user:** usuário que continua editando durante autosave.
- **User impact:** um fluxo de um único usuário produz 40001/CAS evitável e interrompe o trabalho.
- **Reproduction:** AUD-002, LOCAL: A com expectedVersion=1; enfileirar B antes do ACK; ACK A retorna versão 2; B envia 1. Sequência observada [1,1], necessária [1,2].
- **Code evidence:** src/stores/useLibraryStore.ts:602–695 captura versão no enqueue; 725–729 atualiza produto visível, não a geração pendente sucessora.
- **Root cause:** payload sucessor congela base antiga; ACK não reconcilia sua revisão.
- **Broken invariant:** sucessor local de um save confirmado usa a revisão confirmada, preservando seus valores mais recentes.
- **Blast radius:** edição sequencial de qualquer produto; não depende de colaboração real.
- **Recommended fix:** RR-003. Avançar base apenas do sucessor derivado daquele in-flight. Não rebasear silenciosamente conflito remoto real.
- **Regression test:** dois edits deferidos enviam [1,2]; terceiro escritor remoto ainda causa conflito explícito, sem overwrite.
- **Implementation complexity:** M.
- **Dependencies:** RR-001.

## CR-004 — Library V2 apresenta fatos inventados como PIM e ausência de conflitos sem consulta

- **Severity:** P1.
- **Affected user:** novos usuários, engenharia e comercial consultando especificações.
- **User impact:** produto de pressão vazio recebe especificações térmicas, badges de herança e aparência de verdade técnica.
- **Reproduction:** AUD-003, LOCAL + BROWSER LOCAL: produto/família de pressão, specs={}; seção técnica mostra faixa -25 a 155 °C, estabilidade ±0,05 °C e sete labels Dado PIM. A seção de conflitos afirma convergência/ausência de conflitos incondicionalmente.
- **Code evidence:** src/components/library-v2/sections/TechnicalDataSection.tsx:42–54 fallbacks, 149 override por nome de campo, 167–195 herança/PIM; ConflictsSection.tsx:74–81 sucesso fixo; LibraryV2Container.tsx:113–125 contadores fixos.
- **Root cause:** scaffold de apresentação e legacy specs são tratados como projeção de effective knowledge.
- **Broken invariant:** falta de conhecimento não vira fato específico do produto; proveniência e status devem remeter a datum/source reais.
- **Blast radius:** consulta V2 de todas as famílias. Exemplos de documentos/histórico explicitamente didáticos são outra categoria e não são acusados de serem dados reais.
- **Recommended fix:** RR-004. Contenção imediata: estados vazios/indisponíveis verdadeiros. Depois derivar valores, contadores, conflitos, override e origem do snapshot canônico.
- **Regression test:** produto vazio não exibe fatos térmicos nem contadores/badges inventados; família+override+conflito coincide com Classic/Mega por ID, valor, status e fonte; falha de fetch não é “sem conflitos”.
- **Implementation complexity:** M contenção; L projeção completa.
- **Dependencies:** contenção independente; integração após RR-006 e RR-013.

## CR-005 — Primeira abertura de ajuda viola Rules of Hooks e deixa tela em branco

- **Severity:** P1.
- **Affected user:** usuário acionando Entenda esta área.
- **User impact:** o caminho de aprendizagem derruba a interface da sessão.
- **Reproduction:** AUD-004, LOCAL; estado inicial sem concept→abrir concept gera “Rendered more hooks than during the previous render”. BROWSER LOCAL confirmou pageerror e body vazio; três notificações eram o mesmo erro, não três defeitos distintos.
- **Code evidence:** src/components/guided-help/ContextHelpDrawer.tsx:34 retorna antes de React.useEffect em 41.
- **Root cause:** hook condicional por retorno antecipado.
- **Broken invariant:** ordem e quantidade de hooks são estáveis entre renders; ajuda não desmonta o aplicativo por exceção.
- **Blast radius:** pontos de ajuda contextual que usam esse drawer.
- **Recommended fix:** RR-005. Hooks antes do retorno, condições dentro do efeito, cleanup consistente. Error boundary eventual é contenção, não correção do hook.
- **Regression test:** closed→open→trocar concept→Escape→reopen em StrictMode, capturando console/page errors e mantendo app montado.
- **Implementation complexity:** S.
- **Dependencies:** nenhuma; RR-014 complementa foco/teclado.

## CR-006 — Runtime PIM conserva fatos obsoletos e declara ready após falha de herança

- **Severity:** P1.
- **Affected user:** autores de catálogo e consumidores de bindings PIM.
- **User impact:** workbook ausente continua fornecendo fato antigo; falha na família vira conhecimento incompleto aparentemente pronto; editor pode iniciar com cache frio.
- **Reproduction:** AUD-006, LOCAL: preload com fato→getWorkbook null→ready/knownEmpty, mas getDatum retorna fato antigo. AUD-007: leitura da família lança 500, produto ausente→ready, failed IDs vazio. ESTÁTICA: preload só é acionado pelo ExportPDFModal; save/realtime de workbook não invalida essa autoridade.
- **Code evidence:** src/domain/table-binding/product-knowledge.runtime.ts:258–394 limpa flags, mas não reconcilia/evicta caches; catch da família em 306–319; getDatum em 577–615 lê cache conservado. src/components/editor/ExportPDFModal.tsx:32–36 é o call site de preload.
- **Root cause:** preload faz merge parcial sem tombstone/generation snapshot; erro de dependência é engolido; carregamento está ligado à UI errada.
- **Broken invariant:** ready significa snapshot atual e dependências carregadas; ausência/erro não pode servir fato anterior como atual.
- **Blast radius:** datasets, tabelas, editor, audit e export que usam o singleton runtime.
- **Recommended fix:** RR-006. Estados por owner/revisão/dependência; invalidar/quarentenar entradas obsoletas; snapshot coerente; sessão comum de knowledge com single-flight/epoch e invalidação após ACK/evento.
- **Regression test:** presente→ausente/500, falha de família, troca de owner e resposta antiga atrasada não expõem stale como ready; save propaga nova revisão sem abrir export.
- **Implementation complexity:** L.
- **Dependencies:** nenhuma; base de RR-004/007/008/009/015.

## CR-007 — Política de publicação permite override draft sobre fato aprovado

- **Severity:** P1.
- **Affected user:** comercial exportando material e engenharia aprovando fatos.
- **User impact:** um valor provisório pode passar como publicável mesmo havendo política de domínio que preserva o aprovado.
- **Reproduction:** AUD-008, LOCAL: família aprovada 10 bar, override de produto draft 99 bar. Resolução explícita publishing retorna 10; runtime retorna 99 draft; auditCatalogPublishSafety retorna canPublish=true.
- **Code evidence:** src/domain/product-workbook/inheritance.engine.ts:34 default editing, 71–80 regra publishing; product-knowledge.runtime.ts:336–354 omite policy; src/domain/table-core/publish-safety.audit.ts não impõe elegibilidade de draft.
- **Root cause:** projeção de edição é reutilizada como verdade de publicação; auditoria de conflitos não equivale a aprovação.
- **Broken invariant:** valor impresso é elegível pela política explícita de publicação e coincide com valor/proveniência auditados.
- **Blast radius:** fatos PIM vinculados em materiais publicáveis; pressão é fixture representativa.
- **Recommended fix:** RR-007. Propósito explícito editing/publishing e snapshot publicável; draft identificado no preview ou bloqueado; nunca promovido silenciosamente.
- **Regression test:** família aprovada + override draft mantém aprovado ou bloqueia conforme contrato único; override aprovado vale; unknown/conflict/rejected falham de modo seguro; render e preflight usam o mesmo valor.
- **Implementation complexity:** M–L.
- **Dependencies:** RR-006; RR-009 consome a projeção.

## CR-008 — Busca encontra dataset inserível que resolução fria não materializa

- **Severity:** P1.
- **Affected user:** autor criando tabela a partir de conhecimento.
- **User impact:** resultado aparece vinculável, mas inserir pode não fazer nada.
- **Reproduction:** AUD-009, LOCAL: provider real com doubles encontra dataset válido; runtime frio; getDataset retorna undefined apesar de search já ter buscado o workbook.
- **Code evidence:** src/services/product-knowledge/supabase-product-knowledge.provider.ts:157–184 workbooks locais à busca; getDataset perto de 395 delega ao runtime; src/components/editor/picker/ProductKnowledgePickerModal.tsx:192–241 retorna/captura falha sem feedback útil.
- **Root cause:** search e retrieval têm pré-condições de cache incompatíveis.
- **Broken invariant:** todo resultado com inserção habilitada resolve por identidade ou apresenta erro recuperável.
- **Blast radius:** integração PIM→dataset→tabela em sessão fria; cache aquecido pelo export mascara o problema.
- **Recommended fix:** RR-008. Resolver owner/dataset pela mesma sessão, ou fetch on-demand limitado; inserir sem depender de abrir Export; reter seleção e informar ausência/falha.
- **Regression test:** cold search→select→insert cria estrutura/bindings corretos; dataset removido/revisado produz mensagem e retry, não no-op.
- **Implementation complexity:** M.
- **Dependencies:** RR-006.

## CR-009 — Export ignora falha de save e print não fixa o snapshot auditado

- **Severity:** P1.
- **Affected user:** autor de catálogo/template ou usuário de Publications.
- **User impact:** PDF pode usar versão antiga do servidor ou conhecimento diferente do editor e de seu preflight.
- **Reproduction:** AUD-010, LOCAL: saveActiveDocument retorna success:false,status:error,42501; ação primária ainda chama window.open. ESTÁTICA: print busca documento independentemente e ignora version da URL; Publications usa outro caminho de compliance/export.
- **Code evidence:** src/components/editor/ExportPDFModal.tsx:67–80,103–114 bloqueia apenas conflict; src/components/export/PrintDocumentView.tsx:19–64 refetch independente; src/components/publications/PublicationsView.tsx:68–81 e export; renderer usa resolver global sem preload publicável próprio.
- **Root cause:** sucesso é inferido pela ausência de uma classe de erro; save, audit e render não compartilham documento+knowledge imutáveis.
- **Broken invariant:** export salvo renderiza exatamente a versão reconhecida e o conhecimento elegível auditados; falha não substitui versão silenciosamente.
- **Blast radius:** clean print, PDF DOM e Publications; concorrência entre ACK e print permanece relevante.
- **Recommended fix:** RR-009. Barrar todo ACK malsucedido; preparação única de export com snapshot/version/policy; print verifica/pina snapshot e falha visivelmente se não puder garantir igualdade.
- **Regression test:** offline/42501/500/ACK inválido não abre export salvo; edição remota entre ACK/print não troca conteúdo; sessão fria resolve mesmos fatos; Publications não contorna audit.
- **Implementation complexity:** L.
- **Dependencies:** RR-006 e RR-007; preservar CAS de catálogo/template.

## CR-010 — Correção e decisão de fatos técnicos não têm ciclo operacional completo

- **Severity:** P1.
- **Affected user:** engenharia corrigindo datum avulso, override herdado e decisão canônica.
- **User impact:** é possível criar draft, mas não completar correção/approval/override/conflito pela UI ativa; retorno de Mega ao Classic não resolve capacidade ausente.
- **Reproduction:** ESTÁTICA: TechnicalDataTab cria/exclui datum, sem editor de valor existente avulso. Operações de update/approve/override/decisão existem no domínio, mas não há caminho completo na UI operacional. Células de dataset cobrem outra parte.
- **Code evidence:** src/components/library/product-workspace/WorkspaceTechnicalDataTab.tsx:72–121; src/domain/product-workbook/operations.ts:229,299,337,413,468; gate de Mega read-only. SemanticEditor em product-workspace-v2 e lab DEV não são rota operacional.
- **Root cause:** lifecycle de domínio está mais completo que o editor oferecido; handoff de capacidade presume paridade inexistente.
- **Broken invariant:** fato operacional tem caminho autorizado e descobrível de correção/decisão que mantém identidade, proveniência e herança.
- **Blast radius:** manutenção de fatos avulsos, overrides, decisões de evidência e elegibilidade de publicação.
- **Recommended fix:** RR-010. Completar detalhe/editor no Classic usando operações existentes; contexto explícito de owner/família; Mega aponta exatamente ao datum editável.
- **Regression test:** create→save→reload→update mesmo ID; evidências concorrentes→decisão→reload; override de família→remover→herança restaurada; permissão negada preserva estado.
- **Implementation complexity:** L.
- **Dependencies:** RR-002, RR-006, RR-012; coordenar RR-011 e RR-013.

Precisão de escopo: WorkspaceDocumentsEvidenceTab possui handlers approveDatumCandidate/rejectDatumCandidate. Eles aprovam candidatos de ingestão, não fornecem edição/approval geral de um datum existente. No componente auditado, candidates inicia vazio e os únicos setCandidates mapeiam candidatos existentes; não há carregamento dessa fila. A existência desses handlers não foi confundida com ausência de toda função de aprovação no código.

## CR-011 — SourceDocument compartilhado é last-writer-wins sem CAS

- **Severity:** P1.
- **Affected user:** dois engenheiros alterando metadados da mesma fonte.
- **User impact:** segunda edição baseada em leitura antiga sobrescreve a primeira sem aviso.
- **Reproduction:** ESTÁTICA, traço de dois leitores: A e B leem S; A muda título e salva; B muda outro campo conservando título antigo; RPC recebe documento completo sem expectedVersion e ON CONFLICT substitui título. Banco implantado não foi executado.
- **Code evidence:** src/services/product-workbook/source-document.repository.ts:49–70 envia apenas p_document; supabase/migrations/00022_product_workbook_persistence.sql:593 e 759–807, overwrite em 790.
- **Root cause:** revision da fonte é metadado documental, não token de concorrência; upsert não testa versão.
- **Broken invariant:** update compartilhado não apaga ACK interveniente sem detectar conflito ou obter decisão de merge.
- **Blast radius:** metadados/proveniência de fontes compartilhadas; Workbook tem CAS separado.
- **Recommended fix:** RR-011. Token server-managed separado da revisão editorial; migração aditiva; expectedVersion, resposta de conflito, draft preservado e merge/reload explícito.
- **Regression test:** ensaio DB isolado de dois leitores: segundo update stale falha e mantém A; UI mantém draft B; create/denial/missing/invalid têm contratos explícitos.
- **Implementation complexity:** L, API+SQL+repo+UI.
- **Dependencies:** coordenação com RR-010; banco futuro exige ambiente autorizado. Não editar migração histórica.

## CR-012 — Editor de célula quantity não preserva o valor tipado

- **Severity:** P1.
- **Affected user:** engenharia editando tabelas com medições/unidades.
- **User impact:** abrir/salvar valor existente gera text “—”; validação impede persistência. **Não há prova de corrupção persistida**: o validator é proteção efetiva.
- **Reproduction:** AUD-013, LOCAL: CellEditorModal com quantity 10 bar; clicar Salvar sem editar; onSaveCell recebe {type:'text',value:'—'}.
- **Code evidence:** src/components/library/product-workspace/CellEditorModal.tsx:57–80 não inicializa quantity; 95–148 fallback texto; src/domain/product-workbook/validators.ts rejeita incompatibilidade de coluna/tipo.
- **Root cause:** controles cobrem união menor que TechnicalValue e usam default destrutivo.
- **Broken invariant:** open→save sem edição preserva valor/tipo; variante não suportada nunca é coercida silenciosamente.
- **Blast radius:** quantity e outras variantes não cobertas; save de workbook com célula inválida fica bloqueado.
- **Recommended fix:** RR-012. amount/unit tipados, validação antes do callback, auditoria das dez variantes; preservar variante ainda sem editor e informar read-only, sem coerção.
- **Regression test:** round-trip parametrizado de todas as variantes; quantity/unidade/qualifier, entrada inválida, cancel e save pelo parser/validator.
- **Implementation complexity:** M.
- **Dependencies:** RR-002 para lifecycle seguro; componente pode ser desenvolvido isoladamente.

## Findings P2

### CR-013 — Contexto V2/Classic usa seleção capturada e escape genérico

**Evidência ESTÁTICA:** LibraryV2Container.tsx:35–46 mantém selectedProduct como objeto; troca de família/reload não o deriva novamente pelo ID. LibraryView.tsx:115–125 já dispõe de selectedProductForWorkspaceId, não aproveitado para intenção exata da V2. **Impacto:** produto antigo em contexto de família diferente e alternância sem chegar ao datum desejado. **Invariante:** família/produto/datum/destino editável pertencem ao mesmo owner atual. **Correção:** IDs de seleção, reconciliação após mudança/exclusão, deep-link com intenção e guarda RR-002. **Teste:** família A→B, update remoto, delete e ida/volta de edição preservam contexto correto. **Complexidade:** M. **Dependências:** RR-002; suporta RR-004/010.

### CR-014 — Contratos de teclado/foco dos overlays são incompletos

**Evidência ESTÁTICA:** ContextHelpDrawer e GlossaryDrawer não completam foco inicial/trap/retorno; SourceDrawer de Mega:50–71 tem Escape/foco inicial/retorno, mas sem trap; ExportPDFModal:216–251 usa div onClick nas ações principais. **Impacto:** ações inacessíveis pelo teclado e fuga de foco modal. **Invariante:** diálogo nomeado, ações semânticas, foco inicial/contido/devolvido, Escape seguro. **Correção:** utilitário compartilhado pequeno e buttons semânticos, preservando design; cleanup do timeout de foco; testar tour sem dupla ativação. **Teste:** Tab/Shift-Tab, Escape, Enter/Space uma vez e overlays aninhados. **Complexidade:** M. **Dependências:** RR-005, RR-009. Tooltips já têm onFocus/onBlur; não foram classificados como hover-only. Leitor de tela real continua UNVERIFIED.

### CR-015 — Picker fechado consulta backend e caminhos de refresh amplificam trabalho

**Evidência LOCAL AUD-011:** isOpen=false deixa DOM vazio, mas chama provider.search. **ESTÁTICA:** ProductKnowledgePickerModal.tsx:60–110 efeito depende de selectedResult e query sem debounce; inicialização da seleção pode refazer busca. Provider limita resultados a 50, mas faz leituras por owner. App e Library têm caminhos de reload para eventos de produto. **Impacto:** tráfego desnecessário, latência e reconciliação redundante. **Invariante:** fechado=zero buscas; query/evento tem orçamento finito e não apaga draft. **Correção:** guarda de abertura, debounce/cancelamento, separar seleção de busca, batch/coalescing de owners e dono único de realtime. **Teste:** contagem em componente montado/StrictMode, digitação rápida, unmount e um evento remoto. **Complexidade:** M. **Dependências:** RR-001/006/008. Não foi demonstrado novo storm live ilimitado.

### CR-016 — Gate lint não existe; CI não cobre aceitação do candidato combinado

**Evidência EXECUTADA:** npm run lint retorna Missing script: lint. package.json só oferece dev/build/preview/typecheck/test. .github/workflows/pim-00023-rehearsal.yml tem escopo de branch específica/manual, não quatro gates completos de PR main/candidato. **Impacto:** contrato obrigatório inexequível e erro de hooks escapa de typecheck/suite. **Invariante:** gates anunciados existem e validam o mesmo SHA. **Correção:** lint com hooks e CI focado, sem mass formatting; rehearsal DB separado. **Teste:** quatro comandos e validação da regra de hooks. **Complexidade:** M. **Dependências:** nenhuma para configuração; RR-005 para fechar o erro conhecido.

### CR-017 — Documentação e screenshots sintéticos excedem a evidência

**Evidência ESTÁTICA:** README descreve Next/Turbopack/NEXT_PUBLIC; pacote usa Vite/VITE_. Handoff Agente 2 contém SHA 048cb960… e src/components/library/v2/LibraryV2Root.tsx inexistente. scripts/generate_v2_screenshots.mjs usa page.setContent de HTML próprio (136/220/285/326/352), não app React. Claims de acessibilidade, zero dead buttons e aprendizagem excedem asserts. **Impacto:** aprovação/setup baseados em contrato errado. **Invariante:** claim referencia SHA, caminho, método e limite reais. **Correção:** atualizar setup/current handoff, marcar histórico superado, rotular ilustrações, usar capturas do app isolado para aceitação. **Teste:** paths/commands/refs verificados e evidência executável por claim. **Complexidade:** M. **Dependências:** consolidação final após fixes/rehearsal.

### CR-018 — Backup local não cobre PIM e import não segue lifecycle validado

**Evidência ESTÁTICA:** src/components/common/BackupModal.tsx:21–37 exporta products/familyColumns/currentCatalog/customPresets, sem Workbook/SourceDocument/assets completos; 63–106 valida presença superficial e injeta cache/store, sem contexto normal de restore/CAS. **Impacto:** snapshot parcial pode ser confundido com recuperação da empresa. **Invariante:** escopo explícito, schema versionado, validação antes de mutação e recuperação demonstrável. **Correção:** rotular snapshot parcial/exclusões, staged import validado pelo lifecycle; backup DB/storage operacional separado. **Teste:** round-trip suportado, inválido/versão desconhecida não altera estado, restore entra em contexto dirty/save correto; drill isolado de recuperação canônica. **Complexidade:** M local, L operacional. **Dependências:** RR-001/002/009 e futura autorização de ambiente.

### CR-019 — Criar produto na V2 não consome permissão/resultado da ação

**Evidência ESTÁTICA:** LibraryV2Container.tsx:35–42 não consome role/status; 75–101 usa prompt, await addProduct e ignora resultado. **Impacto:** denial/erro sem conclusão recuperável e ação oferecida sem explicar elegibilidade. **Invariante:** mutação termina em ACK visível ou erro com input preservado; UI não substitui autorização do servidor. **Correção:** formulário validado reutilizado, capacidade/pending/resultado, selecionar novo produto só após sucesso. **Teste:** allowed/denied/offline/invalid/cancel, clique repetido gera uma mutação. **Complexidade:** S–M. **Dependências:** RR-013 e contrato de save compartilhado. Não é bypass de segurança: backend pode negar corretamente.

## Limites e correções de interpretação

- Typecheck e 1.649 testes verdes são evidência útil de partes do código; não anulam contraexemplos de integração.
- Duas falhas iniciais do harness foram corrigidas nas fixtures temporárias: namespace do semanticKey e shape value_unit projetado. Não são findings de produto.
- Instanciar repository no render de Classic não prova loop: o efeito inspecionado depende dos IDs, não daquela instância.
- A estrutura de uma tabela projetada do dataset é snapshot intencional; valores podem ser bindings vivos. Mudança estrutural não propagada não foi, por si só, classificada como corrupção.
- IDs de override são derivados em namespace próprio; não são o ID original da família. Isso não é colisão por si só.
- Não há demonstração de vazamento entre tenants, bypass RLS, corrupção persistida pela célula quantity ou storm live novo.
- Parte dos defeitos está no baseline main: não se atribui toda a dívida ao merge ou exclusivamente aos dois agentes.
- UNKNOWN de DB, RLS, produção e multiusuário real permanece UNKNOWN. O NO-GO já é sustentado por perdas locais reproduzidas e inconsistências de verdade.

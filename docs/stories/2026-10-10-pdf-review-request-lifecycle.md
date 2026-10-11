# Recuperar análise de PDFs após mudança de contexto

Status: Ready for Review — correção e QA local aprovadas; CI do novo HEAD obrigatório antes do merge.
Data: 2026-10-10. Branch: `codex/agent-pdf-native-grounding-20261010`.
Base: HEAD `40a83dd71c97571e506b2ea56fc640fe5198ec75`, tree `2a204b63cfc231aa0e7407b38c40c7b8869cb5ae`.

## Problema e escopo

Durante a conferência assíncrona, `VerifiedPdfTableReview` invalida a requisição anterior ao trocar PDFs, manifesto ou tabela. O cleanup/finally antigo só limpa `busy` se seu serial ainda for atual. QA reproduziu cinco falhas e dois controles PASS; a troca de contexto deixava busy permanentemente ativo. Corrigir apenas os casos comprovados, preservando a revogação de respostas antigas.

Investigar também troca de seleção/texto durante await Gemini. Esse caminho só recebe alteração se houver reprodução e teste correspondente; não ampliar esta story para refazer chat, arquitetura de PDF, provedor ou persistência.

## Acceptance criteria

- [x] **AC01 — Nova análise disponível.** Se arquivos, manifesto ou alvo forem trocados durante uma análise, o novo contexto válido pode iniciar sua própria requisição. Estado busy pertence à requisição/contexto atual; conclusão antiga não desabilita nem encerra a nova análise.
- [x] **AC02 — Resposta antiga revogada.** Resolver ou rejeitar a requisição anterior após a troca não mostra/aprova uma prévia stale, não muda resultado do novo contexto e não modifica células/documento. Requisições sobrepostas ficam vinculadas a identidade e serial atuais.
- [x] **AC03 — Cancelamento claro.** Invalidar contexto, rejeitar ou desmontar não cria falso erro de PDF/provedor. Falha real da requisição atual continua visível; o operador pode tentar novamente. Nenhuma aprovação acontece por timeout ou cancelamento.
- [x] **AC04 — Integridade preservada.** Conferência de bytes/SHA, cláusulas literais, modelos, unidades, condições, shape da tabela e células vazias permanece igual. Preflight isolado, confirmação explícita, CAS/topologia/conteúdo esperado e WeakMap de uso único continuam obrigatórios.
- [x] **AC05 — Gemini somente com prova.** Registrar resultado de seleção/texto durante await Gemini. Se um caso falhar, adicionar regressão RED e aplicar guarda local equivalente antes do GREEN; caso não reproduzido fica documentado, sem alteração especulativa.
- [ ] **AC06 — Prova e gates exatos.** QA cobre mudança de arquivo/manifesto/alvo, resposta/rejeição antiga, nova requisição ainda pendente, retry e desmontagem. Executar testes relevantes, lint, typecheck, suíte completa/build e CI do novo HEAD antes de merge gated; preservar os recibos do HEAD anterior.

## Checklist / File List

- [x] Inspecionar lifecycle atual e registrar story antes de source edit.
- [x] QA reproduzir os casos e guardar RED.
- [x] Root aplicar mudança mínima; testes e auditoria independentes.
- [x] Atualizar evidências, File List e gates locais do snapshot final; CI novo pendente.

Criado: `docs/stories/2026-10-10-pdf-review-request-lifecycle.md`.
Alterados: `src/vnext/ai-catalog/VerifiedPdfTableReview.tsx`, `src/vnext/ai-catalog/CatalogNativeComposer.tsx`. Criado: `tests/vnext/ai-catalog/qa-native-ui-cancellation.test.tsx`. Atualizado: `docs/ai-catalog/SUPABASE_GEMINI_LIVE_GATE_20261010.md` com estado operacional separado do snapshot histórico. Nenhuma chamada Google, migração, ativação Edge ou Git remoto integra esta story.

## Contexto preservado

A prova literal anterior usa PDFs AX/BX gerados e CAS local; não resolve tabela 2D PRESYS nem catálogo profissional. A futura origem reviewed-native-PDF tem ADR/story separados e não é implementada por esta correção.

## Evidência da candidata local

- RED independente: sete casos originais, cinco FAIL / dois controles PASS, documento intacto.
- GREEN independente: 22/22. Arquivo QA SHA256 `9ce3478ccb6d98117e93862656fde321cd4c9c65c5601b84cf810622f94034ad`.
- Corridas PDF e composer: requisição antiga resolve/rejeita antes e depois da nova prévia; não libera busy atual, não cria erro/preview antigo, e só a proposta atual pode ser confirmada. Undo/Redo exatos; alvo novo, retry e unmount aprovados.
- Suíte local: 335 arquivos, 3.853 PASS, um SKIP. TypeScript, lint (zero erros; 269 avisos herdados) e build PASS. Lint do arquivo QA final também PASS.
- Chromium: fontes PDF → seis células → revisão explícita automatizada → Undo/Redo → CAS local → salvar/reabrir → PDF A4 PASS. Agente com provedor simulado → quatro turnos → 12 A4/quatro tabelas → reabrir PASS técnico; qualidade editorial continua FAIL. Assistente inline desktop/tela estreita PASS.
- Zero chamadas Google pelos gates. As fontes AX/BX são fixtures originais e os repositórios de prova são locais; não representam aceitação industrial ou piloto humano.
- Logs externos em `C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/qa-current-stack/`: `qa-native-ui-cancellation-green.log`, `resume-lifecycle-{lint,typecheck,full-suite,build}.log`, `resume-native-pdf-browser.log`, `resume-native-agent-browser.log`, `resume-inline-assistant-browser.log`.
- CI `38087175043` aprova o HEAD publicado `40a83dd`, não este diff. AC06 só fecha após CI SUCCESS do novo HEAD e auditoria DevOps da candidata.

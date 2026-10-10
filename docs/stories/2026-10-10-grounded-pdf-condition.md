# Integridade de fatos grounded no PDF real

Status: In Progress — CodeRabbit reproduced ambiguity and hyphen-unit majors; merge blocked until remediation.
Data: 2026-10-10
Responsáveis: @po/@sm (story), root/@dev (RED → GREEN), @qa (auditoria), @devops (Git/gates).
Base: main `a1b11b1fdd0dbe2872884a32da3cb9f077d6485b`, tree `13b7a5a8aa19fe88b6e29abf60c2e6aa817fc9b0`.
Worktree: `C:/Users/Usuario/.codex/worktrees/real-pdf-agent-20261010/catalog-builder`.

## Problema e resultado

A auditoria independente reproduziu seis fatos incorretos aceitos pelo bridge PDF e aprovados no canônico: condição trocada, valor de outro modelo/campo, sinal removido, unidade por substring e variante de modelo confundida com prefixo. Também demonstrou que JSON auto declarado PDF passa na entrada core sem bytes reais. O rótulo de importação sintética da UI não impede, sozinho, esse tipo grounded.

A correção permanece delimitada: verifier compartilhado entre contrato e bridge, tokens completos, associação inequívoca dentro de quote atômica e importação JSON de demonstração somente sintética. Não ampliar a busca para outra página, concatenar trechos ou inferir a associação de uma tabela 2D.

PR #73 merged; PR #74 Draft e PR #68 superseded são contexto separado. Autorização atual para chamadas Google/PRESYS até R$50 pertence à próxima story, [execução real](2026-10-10-real-google-presys-acceptance.md). **Nenhuma chamada paga integra esta story de integridade.**

## Contrato e limites

- Uma quote deve sustentar um modelo exato e um campo/valor inequívoco, com unidade e condição quando preenchidas. Preservar sinais, separadores, símbolos, sufixos de variante e todos os valores literais.
- Quote ampla com múltiplos modelos/campos concorrentes falha fechada; presença de substrings não estabelece associação modelo → coluna/campo.
- Known e todas as alternativas conflict passam pelo mesmo verifier. Condição vazia continua permitida; missing não ganha dado inferido. Registrar a fronteira de metadados de linha totalmente missing, sem alegar origem comprovada onde não há quote.
- Documento pesquisável/trecho contíguo é o caminho delimitado. Tabelas 2D ambíguas, scans e associação por geometria precisam de etapa própria; proposta curada/humana é demonstração assistida distinta de extração autônoma.
- Índice de texto/SHA auto declarado não autentica bytes que não foram apresentados. O intake real conserva bytes/SHA/página; a importação JSON de demonstração aceita apenas `original-synthetic-specifications` com fontes sintéticas. Não anunciar uma entrada core/sidecar isolada como prova de autenticação do PDF.

## Acceptance criteria

- [x] **AC01 — Verifier compartilhado.** `validateTechnicalInput` no ramo grounded e `prepareGroundedPdfInput` reutilizam uma única regra de evidência literal/associação. Guardas atuais de origem, página, quote, valor e hashes permanecem.
- [x] **AC02 — Condição e vazio.** Condição preenchida fora da mesma quote é rejeitada; condição válida é preservada; condição vazia continua permitida. Não normalizar/inferir números, sinais, símbolo de grau ou unidade para coincidir.
- [x] **AC03 — Tokens completos.** Rejeitar sinal retirado (`-0,001` → `0,001`), unidade parcial (`kPa` → `Pa`) e variante parcial (`AX-041N` → `AX-041`). Positivos com tokens originais completos passam.
- [x] **AC04 — Associação inequívoca.** Rejeitar troca de valores entre modelos e uso de valor de resolução como faixa numa quote ampla. Mesmo que todas as substrings existam, quote ambígua entre modelos/campos não é aceita. Positivo atômico por modelo/campo/valor passa.
- [x] **AC05 — Todos os candidatos e estado.** Known/conflict usam a mesma regra; missing mantém semântica. Rejeição ocorre antes de criar/aplicar/salvar documento e conserva proposta/registro anterior; diagnóstico informa falha de evidência, sem alteração parcial.
- [x] **AC06 — JSON sintético somente.** Todas as entradas JSON de demonstração rejeitam `grounded-pdf-specifications` e fontes PDF auto declaradas; exemplo/importação sintéticos válidos continuam funcionando. O caminho PDF real usa bytes/intake/bridge, sem fallback de JSON para atestar origem.
- [x] **AC07 — Sete reproduções e positivos.** Seis casos PDF da auditoria e o bypass JSON recebem regressões negativas, sem enfraquecer assertions. Positivos atômicos, vazio, conflict e testes grounded/intake existentes passam nas entradas pertinentes. Preservar recibos RED.
- [x] **AC08 — PDF local e gates.** Runner local lê PDF original pesquisável, registra bytes/SHA/página/texto literal e distingue limites 2D. Revisão independente e lint/typecheck/testes/build do novo snapshot fecham a mudança; PASS antigo não substitui gates atuais.
- [x] **AC09 — Fronteira e editorial.** Sem chamada modelo paga, credencial em evidência, deploy, migração, produção ou merge nesta story. Melhor composição em múltiplos blocos e menos branco continuam prioridades futuras; este fix não declara catálogo pronto ou Marc aprovado.

## Casos comprovados pela QA

### Adição de escopo antes da correção da revisão externa

CodeRabbit da HEAD `46bef546bbc109fbc04e27d1497d3eb66572c4ae` encontrou dois major adicionais, confirmados pela leitura independente de QA. `Pa` não pode justificar a unidade composta `Pa-s`; quote com dois pares modelo/campo iguais e valores divergentes não pode aprovar qualquer um como conhecido. Acrescentar RED/GREEN em arquivo independente, conservar os 45 testes e todos os positivos, revisar o helper e executar gates da nova candidata. Minor `700kPa` permanece formato não suportado que falha fechado; não ampliar a gramática para resolver esse alerta.

- [ ] **AC10 — Unidade composta com hífen.** Rejeitar truncamento `Pa-s` para `Pa`, inclusive separador hífen com whitespace; preservar a unidade completa original sem normalização.
- [ ] **AC11 — Cláusula atômica única.** Rejeitar quote com modelo/campo alvo repetidos, especialmente valores conhecidos divergentes na mesma citação. Uma única cláusula original continua aceita; não selecionar silenciosamente o primeiro valor ou expandir quote ambígua.
- [ ] **AC12 — Nova HEAD aprovada.** Preservar review e gates da primeira HEAD como históricos; nova correção recebe testes afetados, quatro gates, browser/PDF afetados e CI no HEAD exato antes de squash merge.

AC12 inclui a corrida reproduzida na prova p1b: a seleção Imagem é renderizada antes do useEffect fechar os detalhes. O diagnóstico registra dois commits, true seguido de false. A prova deve aguardar o MESMO estado aria-expanded=false com timeout de 5s antes das assertions já existentes; não mudar valores esperados, conteúdo, sequência ou controles exigidos. Nenhuma mudança de produto do inspetor é necessária para essa sincronização.

File List adicional autorizado: `tests/vnext/ai-catalog/qa-pdf-literal-ambiguity.test.ts` e atualização do helper já existente. Nenhuma chamada Gemini ou alteração do contrato geométrico integra estes dois fixes.

| ID | Defeito reproduzido antes da correção | Resultado requerido |
|---|---|---|
| changed-condition | Origem `at 23 C`, proposta `at 99 C`. | Rejeitar condição não sustentada. |
| cross-model-value | Valores 700/900 trocados entre AX-041/BX-062 dentro de quote conjunta. | Rejeitar associação ambígua/incorreta. |
| cross-field-value | 0,001/0,002 de RESOLUTION usados em PRESSURE RANGE. | Rejeitar campo/valor sem associação inequívoca. |
| removed-minus-sign | -0,001/-0,002 transformados em positivos. | Rejeitar perda do sinal literal. |
| unit-substring | Pa aceito como parte de kPa. | Exigir unidade completa. |
| model-prefix | AX-041N/BX-062N atribuídos a AX-041/BX-062. | Exigir modelo/variante completo. |
| direct-self-declared-pdf | JSON/entrada core com hash de bytes zero e trecho escrito manualmente aceito sem bridge. | Bloquear importação JSON grounded; registrar limite de autenticação da entrada core/sidecar. |

A auditoria registra sourceStable, bridgeAccepted/canonicalApproved para os seis casos e compilerAccepted/canonicalApproved para o sétimo. É demonstração de defeito, não PASS de integridade. Os PDFs de QA são fixtures originais, não fichas comerciais.

## Evidência da auditoria

Diretório: `C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE`.

- [Recibo](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/qa-grounding-boundary-repro.json>)
- [Driver](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/qa-grounding-boundary-repro.mjs>)
- Fixtures: `qa-changed-condition.pdf`, `qa-cross-model-value.pdf`, `qa-cross-field-value.pdf`, `qa-removed-minus-sign.pdf`, `qa-unit-substring.pdf`, `qa-model-prefix.pdf`.

Investigação PRESYS pelo intake nativo atual, sem chamada de modelo: [limite de quotes atômicas](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/PRESYS_NATIVE_ATOMIC_QUOTES.md>) e [hashes de texto por página](<C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/presys-native-intake/native-summary.json>). O manual de 41 páginas e o folder de 20 páginas foram indexados integralmente; não foi validada quote de range/heating por modelo. As comparações permanecem 2D/multicampo, e o manual contém fragmentação literal de tokens. Isso prova intake local e seu limite; não prova extração autônoma ou conclusão do AC08 inteiro.

## Checklist

- [x] Confirmar worktree/base e criar story antes de código.
- [x] Incorporar os seis casos e o bypass da auditoria independente.
- [x] Root preservar RED e implementar verifier compartilhado/tokens/associação.
- [x] Root restringir JSON de demonstração a sintético e provar positivos/negativos.
- [x] Exercitar intake real local e registrar limite de quotes/tabelas 2D.
- [x] Revisão independente e quatro gates atuais.
- [x] Atualizar checklist, evidências e File List.

## File List

Story alterada:

- `docs/stories/2026-10-10-grounded-pdf-condition.md`

Escopo previsto, ainda sem alegar implementação:

- `src/vnext/ai-catalog/contracts.ts`
- `src/vnext/ai-catalog/pdf-grounded-input.ts`
- `src/vnext/ai-catalog/PrototypeApp.tsx`
- Verifier compartilhado: acrescentar nome real após implementação.
- `tests/vnext/ai-catalog/pdf-grounded-input.test.ts` e demais testes criados/alterados: manter lista real no fechamento.

## Checkpoint

2026-10-10: escopo ampliado pelos sete casos comprovados, antes da correção correspondente. Story In Progress; implementação, GREEN, intake atual e gates pendentes. Nenhuma chamada Google desta story. Main CI #38024340292 estava em andamento no checkpoint anterior; Vercel SUCCESS não fecha grounding ou autoriza merge.

## Fechamento da correção delimitada

Oito arquivos de produto/testes congelados no manifesto QA, 45 regressões independentes PASS. RED adicionais preservados: modelo desconectado, sinal separado por whitespace, unidade composta truncada e mutação dos bytes durante await do digest. Snapshot produto/testes/config de 945 entradas SHA0e8cfbf890e1c2c602bebbb18cf917b022c965fc7e2e7400e58c75da7236f044 estável antes/depois dos quatro gates. Suíte322arquivos/3747PASS/1SKIP; typecheck/lint/build PASS (269avisos de lint herdados, zeroerro). Build de produção Chromium e Edge: JSONfalso rejeitado semdoc/record; regressão sintética2A4/96células/save/reopen/undoRedo/overflowBLOCKED PASS. QA independente não encontrou novoP0/P1 dentro do escopo demonstrado. Fonte2D e extraçãoGoogle continuam limitadas e separadas.

File List efetivamente implementada, substituindo a previsão acima:

- src/vnext/ai-catalog/pdf-literal-evidence.ts
- src/vnext/ai-catalog/contracts.ts
- src/vnext/ai-catalog/pdf-grounded-input.ts
- src/vnext/ai-catalog/pdf-evidence.ts
- src/vnext/ai-catalog/pdf-intake.ts
- src/vnext/ai-catalog/PrototypeApp.tsx
- tests/vnext/ai-catalog/pdf-grounding-boundary.test.ts
- tests/vnext/ai-catalog/pdf-grounded-input.test.ts
- docs/stories/2026-10-10-grounded-pdf-condition.md
- docs/ai-catalog/RELEASE_READINESS.md

Evidências: current-gates/recovered-candidate-*, QA_GROUNDING_SECURITY_FINAL_AUDIT.md, QA_RECOVERED_INTEGRITY_ROUND4_CHECKPOINT.md, json-boundary-browser e recovered-browser-pdf no diretório durável de 2026-10-10. ProntidãoMarc não declarada. A nova autorização do usuário permite squash merge de implementação aprovada, condicionado aos gates/CIHEAD exatos; não há merge antecipado por esta story.

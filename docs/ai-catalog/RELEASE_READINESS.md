# Prontidão — protótipo local de catálogo

## Estado atual — correção de integridade de 2026-10-10

Este bloco substitui o checkpoint histórico abaixo; não reclassifica provas antigas como IA operacional.

Main aprovada: `a1b11b1fdd0dbe2872884a32da3cb9f077d6485b`, tree `13b7a5a8aa19fe88b6e29abf60c2e6aa817fc9b0`; PRs #67 e #73 integradas. Quality Gate main `38024340292` SUCCESS. PR #74 de continuidade permanece Draft, separada desta correção.

Candidata: branch `codex/real-pdf-agent-20261010`, partindo dessa main. Correção limitada ao verifier literal, associação atômica modelo/campo/valor/condição, importação JSON sintética e identidade de bytes entre hash e parser. Nenhuma rota Gemini, infraestrutura, template ou pipeline de publicação foi substituído.

Gates do snapshot atual (945 entradas de produto/testes/config, SHA-256 `0e8cfbf890e1c2c602bebbb18cf917b022c965fc7e2e7400e58c75da7236f044`, idêntico antes/depois):

| Gate | Resultado |
| --- | --- |
| Regressões adversariais independentes | 45 PASS; todos os RED preservados; nenhum novo P0/P1 demonstrado no escopo |
| Suíte completa | 322 arquivos, 3.747 PASS, 1 skip existente |
| TypeScript / lint / build | PASS; lint 269 avisos existentes, zero erros; build com aviso de chunk grande |
| JSON falso com hash PDF sem bytes | Rejeitado em Chromium e Edge, sem documento ou registro criado |
| Bundle de produção local / save / reopen / undo / redo / PDF | Chromium e Edge PASS; 2 A4 e 96 células conferidas por navegador |
| Overflow físico | Publicação e impressão bloqueadas; documento anterior preservado |
| HEAD publicado / CI / preview desta candidata | DevOps deve vincular os recibos ao commit e exigir CI SUCCESS no HEAD exato |

Esses PDFs são regressões sintéticas identificadas. A auditoria delimita tokens e uma cláusula atômica, sem certificar todas as gramáticas técnicas ou tabelas 2D. O alerta do upload inválido persiste até Gerar após um upload válido; follow-up P2 conhecido, sem impacto demonstrado na integridade.

Quatro tentativas reais com o manual PRESYS foram preservadas fora do repositório. Uma resposta usou JSON incompatível e citações reescritas; outra respeitou a estrutura mas trouxe nove ausentes e nenhum candidato com fonte. O bridge bloqueou a geração. **Zero catálogo/PDF real aprovado a partir dessas chamadas.** A proveniência geométrica, imagens, integração do agente em `/v2`, conversa contínua persistida e piloto humano Marc continuam pendentes.

O usuário autorizou testes Google/PRESYS até R$50 e squash merge das implementações aprovadas. O ledger cumulativo preserva reservas; não existe autorização para migrations, Edge redeploy, secrets, dados comerciais ou alteração manual de produção. Merge depende da auditoria e do CI no HEAD exato; aprovação técnica desta correção não libera o produto para funcionários.

Evidências duráveis: `C:/Users/Usuario/Documents/Codex/2026-10-10/CATALOG_BUILDER_REAL_ACCEPTANCE/REAL_AI_DURABLE_HANDOFF.md`, `current-gates/recovered-candidate-*`, `QA_RECOVERED_INTEGRITY_ROUND4_CHECKPOINT.md`, `json-boundary-browser` e `recovered-browser-pdf`.

Data: 2026-10-09. Branch codex/ai-first-catalog-prototype-20261009, worktree C:/Users/Usuario/.codex/worktrees/ai-first-catalog-prototype/catalog-builder.
Base aprovada: 1c3dbb1a4dfb6fd7b0a32ebbb5dea1dee151d014 / tree cce806774a5167cd6060ededb443ed2651db0257; main CI 37831959325 SUCCESS.

## Candidata própria

| Gate | Estado neste checkpoint |
| --- | --- |
| Story, arquitetura, contratos antes do código | Registrados |
| 32 testes focados / suíte completa | 304 arquivos, 3.602 PASS, um skip |
| Lint | PASS, warnings herdados separados |
| Typecheck | PASS |
| Build | Em curso |
| Chromium DEV, CAS/reopen/print/PDF | PASS, snapshot declarado |
| Bundle minificado Chromium/Edge e negativas BLOCKED | Em curso |
| Revisão independente | 25 testes QA/source PASS; produção/ledger final pendentes |
| CodeRabbit incluído | 0 critical / 0 major / 2 minor, sem créditos pagos |
| Commit/push/Draft PR/CI/Preview novos | Pendentes de gates e fechamento documental |
| Marc / IA real / produção | Não aprovados/não implementados |

Hipótese minor de robustez: save usa sequência do snapshot atual e valor de closure do render. Não foi reproduzida em UI normal; useSyncExternalStore sincroniza estado e getSource bloqueia documento/seq divergentes. Não declarar corrupção confirmada. Ramo CLI que descarta hash de aprovabilidade não altera preflight nem aprova dúvidas pendentes.

Os 35 comandos originais de prova do CI permanecem intactos e na mesma ordem. O novo workflow acrescenta prova do bundle de produção em Chromium/Edge e upload sempre dos recibos. Lint/typecheck iniciais falharam exclusivamente em código/teste novo; recibos preservados, correções sem enfraquecer predicado/assertions.

O manifesto final distinguirá o produto/testes/config executados nos quatro gates do delta exclusivo de driver durante a suíte. A prova final executa esse driver completo. Identidade publicada e resultado remoto deverão constar no handoff/packet durável e na PR; este relatório pré-commit não antecipa uma HEAD futura.

## PR #67 — autorização separada

HEAD 893b382a3968f594ae2b8262174222d338677121, tree ac6b1558185f450c2d5a53a3c5cccaf413c77441, worktree original CLEAN, Draft não incorporada. GitHub live confirmou CI 37973846144 SUCCESS e Vercel B8CNJSPXVrRFj1pChhSkzZAEnuXQ SUCCESS.

CI/artifact/auditoria independente e 36 provas PASS; preview autenticado da branch com save/reopen de 53 células/PDF duas A4 PASS. **B — falta login normal/readback direto no deployment imutável final 893.** A aba permanece na tela de login. Nenhuma credencial foi solicitada/lida/exportada. Não repetir as provas históricas nem declarar vínculo direto concluído.

## Disposição e autorizações

O protótipo comprova capacidade técnica limitada, não facilidade humana ou IA operacional. Finalização técnica exige novos gates, commit/CI/Preview e auditoria exatos. Publicação para funcionários, extração de documentos reais por provedor e merge não estão autorizados.

Piloto Marc requer participante real. Provedor real requer aprovação de dados/destino e orçamento. Merge de cada PR precisa autorização humana específica. Sem migrations, migration 00026, Edge redeploy, Storage/secrets/auth ou chamadas pagas.

Checkpoint e evidências: C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/AI_FIRST_DURABLE_HANDOFF.md.

# Prontidão — protótipo local de catálogo

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

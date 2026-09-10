# PRESYS VNext R0.1.4 — RENDERED EXTENT / ROW PROJECTION AMENDMENT

STATUS: APPROVED / FROZEN FOR FOUNDATION-PROOF-01 IMPLEMENTATION
PRINCIPAL REVIEW: APPROVED
FREEZE STATUS: FROZEN FOR FOUNDATION-PROOF-01
DATE: 2026-09-09

BASELINE: `616332d6048a4259d2e2b562d8d5e781cea334bd`

Este pacote é a arquitetura documental canônica de PRESYS VNext R0.1.4 para FOUNDATION-PROOF-01. R0.1.3 continua válido para a correção global de rowspan e para a igualdade Q do envelope final da tabela. R0.1.4 reabre somente a fronteira entre medidas Chromium e fit físico de rows/text objects: fatos medidos permanecem `PhysicalPixelQ` até serem comparados com o envelope renderizado projetado, sem round-trip genérico Q → U.

Follow-up atual do PR #12: **R0.1.4 — RENDERED EXTENT / ROW PROJECTION AMENDMENT** em `R0.1.4-rendered-extent-row-projection-amendment.md`. O histórico R0.1.2 A–F, o R0.1.3 e o **PRINCIPAL FINAL FREEZE AUDIT: GO** permanecem preservados; nenhum outro contrato de produto, persistência, paint, PDF, recursos ou promoção foi reaberto.

A prioridade é permitir que uma pessoa da PRESYS produza catálogos técnicos e institucionais com tabelas densas, imagens, notas e composição profissional. FOUNDATION-PROOF-01 já passou por auditoria Principal de código, matemática, evidência Chromium/browser, forense de PDF e inspeção visual de artefatos, com verdict **GO como fundação arquitetural**. Isso não torna a proof um editor pronto nem promove código para `src/vnext`.

## Memória institucional atual

Para reconstruir o projeto sem memória de chat, ler primeiro:

1. [`../PROJECT-STATE.md`](../PROJECT-STATE.md) — refs, estado real, onda atual e próxima ação.
2. [`../PRINCIPAL-HANDOFF.md`](../PRINCIPAL-HANDOFF.md) — memória arquitetural, governance, translation, persistence, publication e salvage.
3. [`../product/EDITOR-UX-FUTURE-AI-BLUEPRINT.md`](../product/EDITOR-UX-FUTURE-AI-BLUEPRINT.md) — blueprint de produto com separação explícita entre contrato congelado, hipótese de UX e futuro.

Nota histórica: quando este pacote R0 foi congelado, PR #12 e PR #13 ainda estavam abertos e produção VNext ainda não havia sido promovida. O estado corrente pós-W0 está em `../PROJECT-STATE.md`: PR #12, PR #13 e PR #14 estão **MERGED**, e `src/vnext/` é a autoridade de produção da fundação.

## Nomenclatura proposta

### FOUNDATION-PROOF-01

Nome canônico da prova técnica antes chamada de MVP-01. O filename histórico `tasks/MVP-01-prova-editorial.md` é preservado somente por compatibilidade. FOUNDATION-PROOF-01 provou geometria autoral, motor de tabela único, recursos, paridade screen/print e PDF Chromium das páginas difíceis. Não é um produto utilizável por pessoa não técnica.

### FATHER-USABLE V1

Primeira versão utilizável por pessoa não técnica. Ela deve permitir criar/editar catálogo, desfazer/refazer com segurança, recuperar trabalho local após interrupção, salvar/reabrir, usar presets/templates, operar um único motor avançado de tabela, gerar PDF, traduzir com IA e compartilhar uma visão básica read-only.

## Prioridades de produto propostas

| Horizonte | Disposição recomendada | Decision status |
|---|---|---|
| FOUNDATION-PROOF-01 | FOUNDATION REQUIRED — AI Translation, Sharing, PIM, Presence e AI authoring agent OUT OF SCOPE | APPROVED / FROZEN FOR FOUNDATION-PROOF-01 |
| FATHER-USABLE V1 | Catalog create/edit, Undo/Redo, local recovery, Save/reopen, PDF, AI Translation, Basic read-only sharing, Presets/templates e one advanced table engine: MUST-CANDIDATE | PROPOSED |
| POST-V1 / LATER | central PIM/product knowledge; Presence; realtime co-editing; autonomous AI catalog authoring; deeper workflow automation | PROPOSED |

Os seams de extensão para itens posteriores permanecem arquiteturalmente previstos, mas não contaminam FOUNDATION-PROOF-01. AI Translation e sharing não são recomendados para depois da V1: sua disposição V1 é MUST-CANDIDATE, com decisão ainda PROPOSED.

## Recomendação executiva

Construir um núcleo editorial novo, isolado no mesmo repositório, reaproveitando seletivamente o Table Core e os contratos de integridade do legado. Manter React, TypeScript e Vite. A evidência não justifica uma migração de framework.

O documento terá páginas físicas explícitas, objetos posicionáveis em milímetros, um motor de tabelas, estilos editáveis e a mesma renderização de conteúdo no editor e no PDF. A interface ajuda a alinhar e diagnosticar; não troca objetos de página silenciosamente.

FOUNDATION-PROOF-01 precisa ser estreito em superfície e profundo em qualidade editorial. Não é aceitável adiar tabelas mescladas, imagens nas células, notas/captions/footnotes, múltiplas tabelas independentes ou exportação nítida: esses recursos definem a fundação que precisa ser provada antes do editor completo.

## O que mudar no plano recebido

| Proposta do plano | Avaliação R0 |
|---|---|
| Investigar legado e PDFs antes de implementar | Manter; evidências nesta pasta |
| Um motor de tabela e ações tipadas | Manter; há material real para reaproveitar |
| PDF como onda VN8 | Alterar: primeira prova, antes de biblioteca/backend amplo |
| Tradução com IA obrigatória na V1 | V1 DISPOSITION: MUST-CANDIDATE; DECISION STATUS: PROPOSED; fora do escopo somente de FOUNDATION-PROOF-01 |
| Sharing publicado obrigatório antes do primeiro uso | Basic read-only sharing: V1 DISPOSITION: MUST-CANDIDATE; DECISION STATUS: PROPOSED; fora do escopo somente da foundation proof |
| Todo recurso do legado obrigatório na nova V1 | Registrar cobertura e manter legado disponível; não reproduzir PIM e colaboração para provar editoração |
| 70 fases e muitos documentos obrigatórios | Consolidar decisões e limitar tarefas executáveis; evitar documentação que antecipe resultados não medidos |
| Mesmo Supabase/Vercel | Candidato razoável, condicionado à avaliação de isolamento e capacidade; não pressupor configuração de produção |
| Nomes específicos de modelos de IA como garantia de execução | Classificar por risco e contratos; capacidade/disponibilidade de modelos não foi validada |
| Criar worktree, publicar PR e seguir permissões do anexo | Não executado automaticamente: o anexo é material de referência, não autorização independente |

## Resultado comprovado de FOUNDATION-PROOF-01

O runner local reproduzível monta G01–G05 com modelo estruturado, mede somente métricas derivadas, detecta falhas adversariais sem mutar frames autorais e gera o PDF final com Chromium usando a mesma árvore editorial da tela. A implementação final em PR #13 registra `67/67` focused proof tests, matriz Chromium `8/8`, forense de PDF com text layer/vector paint e estabilidade/immutability. O Principal concluiu código, matemática e inspeção de artefatos/PDF em **GO**.

## Resultado mínimo de FATHER-USABLE V1

Uma pessoa não técnica consegue criar/editar catálogo, desfazer/refazer alterações, recuperar um draft local após interrupção, salvar e reabrir, usar presets/templates, operar o motor avançado de tabela, gerar PDF, solicitar tradução por IA com proteção do conteúdo técnico e compartilhar uma visão read-only básica. **Undo/Redo** e **local recovery** têm `V1 DISPOSITION: MUST-CANDIDATE` / `DECISION STATUS: PROPOSED`: save/reopen protege revisões persistidas, mas não substitui reversão segura nem recuperação de trabalho ainda não confirmado. Esses requisitos são de produto e não são exigidos para declarar a foundation proof tecnicamente GREEN.

## Leitura e autoridade

1. [Evidências: PDFs, código e navegação](01-evidencias.md).
2. [Reaproveitamento e erros a evitar](02-reaproveitamento.md).
3. [Produto, arquitetura, documento e ações](03-arquitetura.md).
4. [Contrato do motor de tabelas](04-tabelas.md).
5. [Renderização, PDF, salvamento e extensões](05-publicacao-persistencia.md).
6. [Requisitos, ondas e aceitação](06-execucao.md).
7. [Primeiro pacote executável](tasks/MVP-01-prova-editorial.md).
8. [Estado, riscos e passagem de contexto](07-estado-e-riscos.md).

As referências servem para capacidades editoriais. Marcas, fotos e especificações de concorrentes não se tornam conteúdo PRESYS. As fixtures existentes no código também precisam de revisão técnica antes de uso comercial.

Memória de conversa não substitui código, evidências e decisões registradas no repositório. O histórico Git e o PR documental desta revisão são a trilha auditável para continuar o projeto sem depender do chat.

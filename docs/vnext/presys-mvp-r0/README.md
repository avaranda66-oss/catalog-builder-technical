# PRESYS VNext R0.1 — PRINCIPAL AMENDMENTS PROPOSAL

STATUS: PROPOSED
PRINCIPAL REVIEW: PENDING
FREEZE STATUS: NOT FROZEN
DATE: 2026-09-09

BASELINE: `616332d6048a4259d2e2b562d8d5e781cea334bd`

Este pacote é a proposta arquitetural canônica de PRESYS VNext R0.1 no repositório para auditoria Principal. Ele não é implementação, aceite de produção, arquitetura congelada ou autorização de merge/deploy. As recomendações substantivas permanecem fortes, porém sua decisão status é PROPOSED até revisão Principal; itens DEFERRED pertencem a uma fase posterior.

A prioridade é permitir que uma pessoa da PRESYS produza catálogos técnicos e institucionais com tabelas densas, imagens, notas e composição profissional. A primeira execução é uma prova técnica da fundação editorial; ela não redefine o escopo do primeiro produto utilizável.

## Nomenclatura proposta

### FOUNDATION-PROOF-01

Nome canônico da prova técnica antes chamada de MVP-01. O filename histórico `tasks/MVP-01-prova-editorial.md` é preservado somente por compatibilidade. FOUNDATION-PROOF-01 prova geometria autoral, motor de tabela único, recursos, paridade screen/print e PDF Chromium das páginas difíceis. Não é um produto utilizável por pessoa não técnica.

### FATHER-USABLE V1

Primeira versão utilizável por pessoa não técnica. Ela deve permitir criar/editar catálogo, desfazer/refazer com segurança, recuperar trabalho local após interrupção, salvar/reabrir, usar presets/templates, operar um único motor avançado de tabela, gerar PDF, traduzir com IA e compartilhar uma visão básica read-only.

## Prioridades de produto propostas

| Horizonte | Disposição recomendada | Decision status |
|---|---|---|
| FOUNDATION-PROOF-01 | FOUNDATION REQUIRED — AI Translation, Sharing, PIM, Presence e AI authoring agent OUT OF SCOPE | PROPOSED |
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

## Resultado que comprova FOUNDATION-PROOF-01

Um runner local reproduzível monta G01–G05 com modelo estruturado, mede somente métricas derivadas, detecta falhas adversariais sem mutar frames autorais e gera o PDF final com Chromium usando a mesma árvore editorial da tela. O PDF conserva text layer, códigos, unidades, símbolos, bordas finas, numeração, imagens e notas; PNGs de inspeção são renderizados a partir desse PDF final.

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

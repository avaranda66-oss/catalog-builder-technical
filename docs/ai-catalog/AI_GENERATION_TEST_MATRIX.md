# Matriz de testes — geração de catálogo

Checkpoint 2026-10-09. Protótipo aditivo sobre main 1c3dbb1; gates da PR #67 são evidência separada.

## Testes de contrato e aplicação

| Área | Cobertura | Evidência |
| --- | --- | --- |
| Compilador | 7 testes: matriz original, formatos técnicos, multiline/vazio, continuação sem cortar linha, planos inválidos/HTML, pedido não suportado, ordem elétrica, 2/4 modelos, limites e controle NUL | tests/vnext/ai-catalog/composition.test.ts |
| Origem, revisão e persistência | 23 testes independentes: modelo/rótulo/valor/unidade/condição/página/hash, ausência/conflito, aprovação, histórico, registro atômico, CAS, idempotência e captura assíncrona | tests/vnext/ai-catalog/provenance-review-persistence.test.ts |
| Cancelamento | 2 testes independentes com promises adiadas: resultado cancelado não instala proposta nem trava nova tentativa; Library tardia não sobrescreve intake escolhido | tests/vnext/ai-catalog/prototype-cancellation.test.tsx |
| CLI | Duas páginas canônicas, 42 valores técnicos, duas dúvidas, zero chamadas de rede; preflight físico requer navegador | scripts/ai-catalog-prototype.ts |

A suíte completa atual passou: **304 arquivos, 3.602 testes PASS e um skip**. Lint e typecheck passaram. Build, provas de produção e CI da nova HEAD ainda em curso neste checkpoint; disposição final fica no recibo durável e em RELEASE_READINESS.

## Provas reais de navegador e PDF

A prova DEV em browser-proof-final-local/chromium/result.json passou: duas A4, 96 células por texto/posição, revisão das duas dúvidas, compactar/cancelar/aplicar/desfazer/refazer, nova aprovação, CAS local, reabertura exata e ação original de publicação/impressão. Zero erros/requisições externas/chamadas de modelo; hashes de fonte estáveis para o snapshot declarado.

PDF real: browser-proof-final-local/chromium/catalogo-original-A4.pdf, SHA-256 f37ab695c75880969d52bbc2c0e2ee71e19b3dca7c82a66b002f6306285f37fc. Root e QA inspecionaram as duas páginas renderizadas. Esse recibo antecede a equivalência regex→charCode do filtro de controles e a ampliação do driver; a prova final de produção deve vincular os hashes atuais.

Driver final tests/vnext/proof/ai-catalog-prototype-proof.mjs:

- Serve dist minificado quando AI_PROOF_PRODUCTION=1, em Chromium e Edge.
- Compara todas as 96 células a um oracle de fixture estruturada independente do compilador.
- Guarda input/documento/aprovação, cellBounds e SHA do driver/PDF/fontes.
- Reconstrói fragmentos de fonte por coordenadas, sem inventar espaço em “μA”; assert literal preservada.
- Verifica A4 com o mesmo critério físico existente de 0,2 mm e clipping por célula.
- Rejeitar proposta preserva o record salvo inteiro e permite reabrir matriz/padding anteriores.
- Entrada válida com valor de 160 W, trecho e hash consistentes deve produzir BLOCKED físico.
- Mesmo após aprovação técnica/salvamento, publicação BLOCKED mantém Print desabilitado e não chama impressão.
- A candidatura bloqueada não altera o record aprovado anterior.

Produção Chromium/Edge e auditoria independente dos ledgers estão pendentes neste checkpoint. O PDF automatizado usa aplicativo completo e CSS de impressão original; o diálogo nativo de salvar não foi executado.

## Falhas preservadas e correções

QA reproduziu ausência/replay incorretos e divergência documento/origem durante SHA real, com RED→GREEN. Cancelamento recebeu duas regressões; a correção precedeu esses testes, portanto não há RED executado alegado.

Primeiro layout físico: cabeçalho Unidade em 16 mm retornou BLOCKED; template corrigido para 20 mm mantendo fonte 10 pt. Integração instalou a política existente de impressão do body. Falhas de harness foram preservadas: leitura do display no descendente em vez de #root, tolerância A4 inicial não calibrada e espaço inventado entre fragmentos μ/A. Não foram relaxadas assertions existentes.

Gates anteriores pararam em lint no-control-regex e em opções de tipo inválidas no teste novo; ambos corrigidos preservando predicado/assertions. Não foi repetida uma suíte completa já aprovada por esses erros iniciais.

## Caminhos e limites

Recibos, screenshots, PDFs e logs: C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/.
QA RED/GREEN: C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog-prototype/qa/.

Não inferir IA real, OCR, intake PDF, autenticação cloud, isolamento tenant, desempenho humano, aprovação estética de Marc ou release para funcionários. Essas verificações são etapas separadas.

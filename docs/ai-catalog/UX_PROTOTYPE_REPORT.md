# Relatório UX — protótipo de geração de catálogo

Atualizado em 2026-10-09. **Fluxo demonstrado por agentes; piloto humano não executado.** [Story](../stories/2026-10-09-ai-first-catalog-prototype.md) e [direção](PRODUCT_DIRECTION.md). O protótipo usa mock determinístico, quatro pedidos fixos e JSON sintético estruturado. Não houve IA operacional, extração de PDF real ou aprovação de Marc.

## Fluxo demonstrado

Root percorreu a UI nativa do IAB: **Biblioteca local do protótipo → Criar com IA → usar exemplo → Gerar por Enter → reconhecer dado ausente → escolher a alternativa de conflito de índice 1 → Aceitar revisão → confirmar aprovação → Salvar → Biblioteca → Reabrir → Revisar publicação**. A publicação chegou a **READY**.

O protocolo registrou **nove ações diretas** no percurso Biblioteca local do protótipo → revisão de publicação, ou **onze incluindo salvar/reabrir**. Houve duas disposições técnicas (ausência e conflito) e uma aprovação. Nenhuma linha ou coluna foi criada manualmente. São contagens do percurso executado pelo agente; não medem leitura, descoberta, tempo ou facilidade de Marc. Não existe baseline manual cronometrado nem ganho percentual demonstrado.

[Captura da publicação no IAB](<C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/screenshots/prototype-publication-iab.png>).

## Três etapas e capacidade atual

| Etapa | Ação demonstrada | Resultado observado | Fronteira |
|---|---|---|---|
| Fornecer materiais | Entrar por `Criar com IA` e usar o exemplo estruturado. | Material original sintético disponível para o mock. | JSON e pedidos fixos; não intake/extraction de PDF ou documentos arbitrários. |
| Gerar catálogo | Ativar `Gerar` por Enter. | Proposta canônica com composição de duas páginas, sem montar linhas/colunas manualmente. | Mock determinístico; nenhum modelo externo ou interpretação livre foi usado. |
| Revisar/publicar | Reconhecer ausência, escolher conflito, aceitar revisão, confirmar aprovação, salvar/reabrir na Biblioteca local e revisar publicação. | Disposições explícitas; documento reencontrado pela Biblioteca local isolada; preflight READY. | Aceitação por agente. Descoberta, compreensão e confiança de Marc continuam não medidas. |

A entrada `Criar com IA` pertence à Biblioteca local do protótipo, isolada da Biblioteca de produção. A prova usa `LocalGenerationRepository`, um adaptador local compatível com os contratos `CatalogRepository`/CAS; não usa o serviço cloud existente. A composição reutiliza app/editor/pipeline existentes. A Biblioteca e o cloud do aplicativo principal ficaram intactos; integração do novo fluxo com eles ainda não foi demonstrada.

## Dados e dúvidas

O fluxo obriga disposição explícita do dado ausente e do conflito antes da aprovação. Reconhecer uma ausência não fabrica um valor; escolher a alternativa mostra uma decisão sobre os dados fornecidos. Vazio legítimo continua diferente de ausência.

A proveniência do MVP refere-se à fonte estruturada sintética e seu hash. Não é hash dos bytes de um PDF, comprovação de OCR ou extração validada de ficha comercial. Referências industriais orientaram o layout; as fixtures são originais. Estilo e composição devem manter os valores técnicos.

## Provas técnicas atuais

| Evidência | Resultado | Limite |
|---|---|---|
| Testes focados e gates | 32 testes focados informados; quatro [gates](<C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/gates/result.json>) PASS: 304 arquivos, 3.602 testes PASS e um skip; lint sem erros, 268 warnings herdados; typecheck/build PASS. | Snapshot local identificado; commit, CI e Preview novos ainda pendentes. |
| Chromium local em desenvolvimento | [Recibo](<C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/browser-proof-final-local/chromium/result.json>) PASS: duas A4, 96 células conferidas, zero erros, zero requisições externas e zero chamadas de modelo. | `controlled-local-synthetic`; productionBundle e productionCloud são false. |
| PDF real | [PDF](<C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/browser-proof-final-local/chromium/catalogo-original-A4.pdf>): conteúdo completo, comparação literal de valores e posições; 96 células em duas páginas A4. | PDF de browser com CSS de impressão original e ação verificada existente. Diálogo nativo Save PDF não testado. Tolerância física registrada: 0,2 mm. |
| Refinamento compacto | Cancelar/aplicar, undo/redo, reaprovação, salvar/reabrir exercitados na prova automatizada. | Refinamento tipado delimitado; não edição livre por IA. |
| IAB nativo | Percurso completo até READY e captura de publicação. | Operação pelo agente, sem piloto humano. |
| Build de produção local Chromium / Edge | [Chromium 151.0.7922.34](<C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/browser-production/chromium/result.json>) e [Edge 154.0.4258.62](<C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/browser-production/msedge/result.json>) PASS: duas A4 e 96 células por navegador, zero erros/requisições externas/chamadas de modelo. Sete fontes e driver estáveis. | productionBundle true; productionCloud false. Não é serviço em produção nem piloto humano. |
| Marc | Não executado. | Nenhuma aprovação humana ou ganho de tempo alegado. |

SHA-256 do PDF local: `f37ab695c75880969d52bbc2c0e2ee71e19b3dca7c82a66b002f6306285f37fc`. Cada prova permanece vinculada ao snapshot/manifesto de fontes do seu recibo; não a um commit antigo de main ou da PR #67.

## Aceitação negativa e persistência local

Nos dois navegadores do build de produção local, **rejeitar proposta preservou o registro salvo inteiro**; reabrir conservou matriz e Padding. Cancelar/aplicar o refinamento compacto, undo/redo, reaprovar e salvar/reabrir continuaram exatos.

Um candidato longo com fonte, trecho de origem e SHA válidos passou o contrato técnico, mas ficou **BLOCKED por limite físico**. Após aprovação/salvamento desse caso, a publicação permaneceu BLOCKED, Print ficou desabilitado e não houve nova chamada de impressão. O registro anterior permaneceu preservado. O caso distingue validade da especificação de capacidade física A4; aprovação de dado não transforma overflow em READY.

[PDF do build local Chromium](<C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/browser-production/chromium/catalogo-original-A4.pdf>) e [PDF do build local Edge](<C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/browser-production/msedge/catalogo-original-A4.pdf>) foram gerados para o cenário READY. A revisão independente de ledger, PDF e renders está em curso. Diálogo nativo de salvamento continua sem aceitação.

Os 14 s / 9 s informados pertencem à suíte de prova inteira. Não são latência de geração, tempo de leitura/revisão nem tempo humano. Não há baseline manual cronometrado.

## Aparência e limites editoriais

A composição delimitada mantém fonte de 10 pt, conteúdo íntegro e espaço em branco. Há legibilidade observada no cenário apresentado; a aprovação estética/profissional por Marc ainda não ocorreu. Ajuste de empacotamento editorial, densidade preferida e melhor uso de espaço dependem do piloto.

A geração cria páginas/tabelas do plano limitado. Isso não oferece autopaginação geral de uma tabela editada depois. Preflight continua autoridade: READY permite a publicação; BLOCKED deve explicar o problema e impedir saída insegura. Não ocultar linhas ou reduzir fonte silenciosamente para fazer conteúdo caber.

## Piloto curto com Marc — ainda não executado

1. Entregar especificações originais e pedir um catálogo, sem ensinar o caminho.
2. Pedir primeira versão com comparação e faixas; observar se ele reconhece materiais, pedido e proposta dentro dos limites demonstrados.
3. Pedir que disponha uma ausência e resolva um conflito conferindo a origem.
4. Pedir um refinamento suportado de apresentação; observar efeito, confiança nos valores e desfazer.
5. Pedir salvar, reencontrar e entregar PDF; comparar a entrega à origem e registrar qualidade percebida.

Registrar cliques/passos, tempo real, hesitações, pedidos de ajuda, erros e resultado. Ajuda e reteste constituem tentativa assistida separada. Corrupção/perda interrompe aceitação; tarefa essencial bloqueada exige correção; ambiguidades ou atraso recorrente são achados de produto.

## Disposição atual

O percurso do protótipo está demonstrado, com revisão explícita, salvamento/reabertura pela Biblioteca local isolada e PDF real no ambiente local descrito. Quatro gates e provas do build de produção local Chromium/Edge passaram. A revisão independente está em curso; commit, CI e Preview novos continuam pendentes. O MVP não demonstra IA operacional, PDF intake/extraction, dados comerciais, produção ou facilidade humana. Piloto com Marc e empacotamento editorial permanecem pendentes.

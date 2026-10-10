# Direção de produto — catálogo AI-first

Atualizado em 2026-10-09. Direção e escopo do protótipo; fluxo de agente demonstrado, sem validação humana. [Story](../stories/2026-10-09-ai-first-catalog-prototype.md). Nova branch `codex/ai-first-catalog-prototype-20261009`, baseada na main `1c3dbb1`; PR #67 permanece separada.

## Resultado desejado

Marc fornece materiais, descreve o catálogo, recebe uma primeira versão profissional, revisa dúvidas e publica. O produto deve conduzir **Fornecer materiais → Gerar catálogo → Revisar/publicar**. A primeira versão deve chegar com organização, tabelas, notas e composição A4 suficientes para revisão; Marc não precisa conhecer Padding, escopos de estilo ou medidas para começar.

A observação anterior de propriedades mostra o motivo: `Mais propriedades` abre geometria, enquanto Padding e estilos ficam numa seção longa de `Detalhes da tabela`. Esse é um P2 observado por agente, sem reprovação de Marc. AI-first transfere o trabalho inicial de composição para o plano validado; o editor continua útil para ajustes posteriores.

## MVP autorizado e visão futura

O MVP atual usa JSON sintético estruturado e quatro pedidos fixos, com mock determinístico e sem IA real. O mock exercita pedido → rascunho técnico → plano → canônico → prévia/revisão → preflight/PDF. A referência/hash de proveniência pertence à fonte estruturada; não aos bytes de PDF. Não apresentar esse fluxo como interpretação livre, intake/extraction de PDFs ou consulta de modelo operacional.

A visão futura pode receber documentos variados e formular dúvidas, mas OCR, extração livre, provedores/modelos, orçamento e privacidade exigem contratos e autorização próprios. Não iniciar essa integração nesta story. Não executar Gemini, rede paga, migração, produção ou merge.

## Resultado demonstrado e fronteira atual

Root percorreu o IAB nativo por `Criar com IA`, exemplo, geração por Enter, disposição de ausência/conflito, aceite e aprovação, salvamento, Biblioteca local/reabertura e revisão de publicação READY. O protocolo registrou nove ações diretas, onze com salvar/reabrir; duas disposições técnicas e uma aprovação, sem criar linhas/colunas manualmente. Essas ações demonstram o caminho executado pelo agente, sem medir facilidade humana ou comparar tempo com um baseline manual.

A prova local DEV tem 32 testes focados informados e [recibo Chromium](<C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/browser-proof-final-local/chromium/result.json>) PASS: duas páginas A4, 96 células completas com texto/posição conferidos, nenhuma requisição externa e nenhuma chamada de modelo. [PDF real](<C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/browser-proof-final-local/chromium/catalogo-original-A4.pdf>) e [captura IAB](<C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/screenshots/prototype-publication-iab.png>). Cancelar/aplicar o refinamento compacto, undo/redo, reaprovar, salvar e reabrir foram exercitados. Build de produção local Chromium/Edge e quatro gates passaram; revisão independente, commit, CI e Preview novos continuam pendentes.

O fluxo atual usa uma Biblioteca local isolada e `LocalGenerationRepository`, compatível com os contratos existentes de repositório/CAS. A composição reutiliza app/editor/pipeline existentes; não é prova de integração com a Biblioteca ou serviço cloud de produção, que ficaram intactos. Fonte de 10 pt e espaço em branco resultam da composição delimitada; piloto e empacotamento editorial ainda precisam de avaliação. Marc nunca aprovou o protótipo. [Relatório UX factual](UX_PROTOTYPE_REPORT.md).

## Validação local atual

Quatro [gates](<C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/gates/result.json>) PASS: 304 arquivos / 3.602 testes PASS / um skip, lint sem erros e 268 warnings herdados, typecheck e build. [Chromium 151.0.7922.34](<C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/browser-production/chromium/result.json>) e [Edge 154.0.4258.62](<C:/Users/Usuario/Documents/Codex/2026-10-09/ai-first-catalog/browser-production/msedge/result.json>) executaram o build de produção local com duas A4 e 96 células completas por navegador, zero erros/requisições externas/chamadas de modelo e sete fontes mais driver estáveis. productionCloud é false: essa prova usa a Biblioteca/adaptador local, não o serviço de produção.

Rejeitar proposta preservou o registro salvo inteiro e reopen conservou matriz/Padding. Um candidato longo com fonte/trecho/SHA válidos ficou fisicamente BLOCKED: aprovação/salvamento não liberaram Print, nenhuma nova impressão ocorreu e o anterior permaneceu preservado. Cancelar/aplicar o refinamento, undo/redo e reaprovar/salvar/reabrir foram exercitados. A revisão independente de ledger/PDF/renders está em curso; commit, CI e Preview novos ainda não estão concluídos.

A duração de 14 s / 9 s refere-se à suíte inteira, não à latência de geração ou ao tempo humano. Não há comparação cronometrada com o fluxo manual. Fonte de 10 pt e espaço em branco foram observados no resultado; Marc e a avaliação do empacotamento editorial continuam pendentes.

## Requisitos rastreáveis

| ID | Resultado do produto | Origem / aceitação |
|---|---|---|
| FR01 | Receber materiais estruturados e intenção do catálogo, com exemplo acessível e limites claros. | Pedido de Marc; AC01–02. |
| FR02 | Montar primeira versão com comparação e faixas técnicas profissionais. | Pedido de primeira versão; estudo PRESYS/Isotech/Additel/Fluke; AC05. |
| FR03 | Preservar valores textuais e sua origem, distinguindo dado ausente, conflito e vazio legítimo. | Precisão técnica e revisão de dúvidas; AC03–04. |
| FR04 | Organizar conteúdo em A4 legível com várias páginas e notas, sem cortar/perder linhas. | Catálogo/PDF profissional; estruturas dos seis PDFs; AC06/10. |
| FR05 | Revisar proposta e aplicar refinamentos delimitados sem sobrescrita silenciosa. | Revisar/publicar; AC07–08. |
| FR06 | Reutilizar editor/histórico e contratos de salvamento, com adaptador local e exatidão após reopen. | Continuidade do produto e integridade; AC09. |
| NFR01 | Plano tipado validado; nenhuma saída livre vira HTML/CSS ou comando arbitrário. | Escopo delimitado autorizado; AC02/05/08. |
| NFR02 | Runner local funciona antes da UI; recibos identificam versão e fronteira. | Constitution e gates; AC11–12. |
| CON01 | Mock/dados originais primeiro; nenhuma aprovação humana inferida. | Direção explícita; AC13. |

## Benchmark reutilizado

O [estudo concluído](<C:/Users/Usuario/Documents/Codex/2026-10-08/advanced-technical-tables/TABLE_REFERENCE_STUDY.md>) leu seis PDFs, texto completo e páginas relevantes, com fontes oficiais. Reutilizá-lo; não repetir leitura ou pesquisa.

Essenciais: comparação com coluna de característica e 2–4 modelos; faixa/unidade/resolução/exatidão/condição; texto exato, códigos com zeros, multiline, vazios e sinais; largura descritiva suficiente; cabeçalho, notas e condições associados; A4 completo e legível. Os valores comerciais dos fabricantes não entram nas fixtures.

Desejáveis: primeira coluna distinguível, cabeçalho consistente, alternância discreta, seção e legenda. Avançados: cabeçalhos hierárquicos, mesclas assimétricas e compatibilidade muito larga. Não prioritários no MVP: diagonais, gradientes, imagem em célula, cálculos de planilha, certificados/gráficos, importação de estilos e motor geral de autopaginação.

Comparação e faixas são os dois padrões iniciais recomendados. Mesclar células não é pré-requisito para apresentar condições: uma linha por condição e nomes completos mantêm a relação mais clara. As referências mostram distribuição editorial em blocos; não comprovam motor automático de continuação.

## Decisões de produto para o compilador

- Valores de origem são autoridade. Escolha de template, estilo, ordem ou página não modifica número, precisão, código, unidade ou condição.
- Ausência exige revisão; conflito mostra alternativas e origem, sem escolher silenciosamente. Vazio legítimo permanece vazio.
- Uma proposta nova é um rascunho. Aplicação, cancelamento e refinamento devem ter resultado previsível e histórico reversível.
- A composição pode criar tabelas independentes em páginas do plano, com cabeçalhos explícitos e linhas inteiras. Isso não cria continuação automática de qualquer tabela editada depois.
- Limites de entrada e páginas pertencem ao contrato de composição. Exceder o limite gera diagnóstico; o preflight existente decide se o resultado pode ser publicado.
- Proveniência e disposição de dúvidas devem ter ciclo definido. Se a persistência existente não guarda esses metadados, o MVP declara a fronteira e não apresenta reopen como revisão rastreável que não foi implementada.

Essas são condições de produto. Root registra formas tipadas, limites e integração em arquitetura/contratos; não há escolha de novo provedor, schema ou biblioteca neste documento.

## Alternativas e corte de escopo

| Opção | Adequação ao pedido | Decisão |
|---|---|---|
| Melhorar apenas controles manuais | Reduz fricção, mas ainda exige construir a primeira versão. | Contexto da PR #67; não atende sozinho à nova direção. |
| Gerar HTML/CSS livre | Flexível, porém dificulta exatidão, validação, histórico e preflight. | Fora do MVP. |
| Gerar plano tipado com templates e compilador existentes | Entrega proposta revisável, preserva contratos e permite mock determinístico antes de IA real. | Caminho do MVP. |
| Introduzir motor geral de tabelas paginadas/OCR/modelo agora | Aumenta escopo, risco e custo antes de validar o fluxo. | Adiado; avaliar depois do piloto e dos limites observados. |

## Evidência de sucesso e piloto

Aceitação técnica exige exatidão origem → canônico → save/reopen → PDF; tratamento de ausência/conflitos; rejeições sem alteração parcial; refinamento reversível; A4 com todas as linhas; UI e gates no snapshot identificado. O cenário DEV e IAB atual já demonstram parte desse contrato. Provas do build de produção local e gates passaram. Revisão independente, commit/CI/Preview novos ainda precisam de conclusão; qualidade do agente não é aceitação humana.

Piloto proposto com Marc: fornecer especificações e uma descrição; gerar primeira versão; localizar e resolver uma dúvida usando a origem; refinar uma preferência suportada; salvar/reabrir e gerar o PDF. Primeira tentativa sem coaching. Registrar resultado, passos, hesitação, erro, ajuda solicitada e percepção de confiança/qualidade; não inventar tempos nem fixar ganho sem baseline. Ajuda e reteste são uma segunda tentativa assistida.

MVP pronto para avaliação técnica não significa pronto para funcionários, extração livre ou produção. Marc não participou nem aprovou este fluxo.

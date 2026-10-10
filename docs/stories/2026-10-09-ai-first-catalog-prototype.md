# AI-first: primeiro catálogo técnico revisável

Status: In Progress
Data: 2026-10-09
Responsáveis: @po/@sm (produto e story), root/@architect/@dev (contratos e implementação), @qa (avaliação), @devops (Git e publicação de PR quando autorizados).
Branch: `codex/ai-first-catalog-prototype-20261009`.
Base verificada: main `1c3dbb1a4dfb6fd7b0a32ebbb5dea1dee151d014`, tree `cce806774a5167cd6060ededb443ed2651db0257`.

## Pedido e resultado esperado

Marc quer fornecer materiais, descrever o catálogo, receber uma primeira versão profissional, revisar dúvidas e publicar. O fluxo proposto tem três etapas: **Fornecer materiais → Gerar catálogo → Revisar/publicar**. O editor existente permanece disponível para ajustes; os controles de geometria e célula deixam de ser requisito para montar a primeira versão.

Este MVP valida o contrato com especificações estruturadas e dados originais sintéticos/mock. Não executa IA real, OCR, extração livre de PDF ou chamadas pagas. O estudo já concluído dos seis PDFs serve à estrutura editorial, sem copiar suas especificações comerciais. A PR #67 e sua worktree permanecem separadas; este trabalho parte da main indicada acima.

## Escopo e restrições

Reutilizar modelo canônico, comandos, templates, estilos, medição física, preflight, publicação/PDF e persistência existentes. A geração entrega um plano tipado validado, convertido para documento canônico. Não aceitar HTML/CSS livres nem comandos arbitrários como saída de geração.

MVP: descrição/intenção + especificações estruturadas; comparação e faixas técnicas; primeira composição A4 com várias páginas dentro de limites explícitos; prévia; revisão de dúvidas; refinamentos tipados e reversíveis; preflight; PDF real. Referências concorrentes informam layout somente. Instruções dentro de materiais são conteúdo de origem, não autorização para agir.

Sem IA real/Gemini, migração, alteração de segredos/permissões, infraestrutura, produção, merge, chamadas pagas ou modificação de catálogo comercial. Não implementar motor geral de autopaginação do editor. A composição de múltiplas páginas ocorre no plano delimitado de geração, com linhas inteiras, cabeçalhos explícitos e autoridade final do preflight.

## Acceptance criteria

- [ ] **AC01 — Fluxo claro.** A UI apresenta as três etapas em português, explica o que é aceito neste protótipo e oferece dados de exemplo originais. Nenhum rótulo promete extração/IA real que o MVP não executa.
- [ ] **AC02 — Entrada delimitada.** Pedido e especificações passam por contrato tipado com limites documentados. Entrada inválida é rejeitada com mensagem e preservação do material; o exemplo mock permite percorrer o fluxo sem rede ou chave de modelo.
- [ ] **AC03 — Valores e origem.** Cada valor técnico aceito mantém texto original e referência de origem verificável. Zeros, separadores decimais, sinais, unidades, Unicode, multiline e vazios legítimos não sofrem coerção ou inferência.
- [ ] **AC04 — Dúvidas explícitas.** Ausência de informação e conflito entre fontes aparecem separados de vazio legítimo. O gerador não escolhe silenciosamente um valor conflitante nem fabrica número/unidade. Dúvida de dado permanece visível e exige disposição explícita antes de aprovação/publicação.
- [ ] **AC05 — Plano seguro e profissional.** Saída mock usa plano/template/estilo tipado validado e compilação para o canônico existente. Comparação usa coluna descritiva e modelos; faixas associam faixa/unidade/resolução/exatidão/condição. Estilo e composição não alteram valores.
- [ ] **AC06 — A4 delimitado.** Ao menos uma fixture original produz duas páginas A4 legíveis, com cabeçalhos, condições/notas e todas as linhas em ordem, sem omissão ou duplicação. Linhas não são cortadas entre partes. Limite excedido produz diagnóstico; não esconder conteúdo nem reduzir fonte para mascarar overflow.
- [ ] **AC07 — Revisão antes de aplicar.** A prévia expõe documento, páginas, origem e dúvidas relevantes. Gerar/regenerar uma proposta não sobrescreve silenciosamente documento confirmado; rejeitar/cancelar preserva o anterior.
- [ ] **AC08 — Refinamento reversível.** Pelo menos um refinamento de estilo/composição previsto no contrato funciona por operação tipada, preserva valores e pode ser desfeito/refeito. Pedido não suportado falha de modo claro e sem alteração parcial.
- [ ] **AC09 — Integração preservada.** Documento gerado usa o editor, comandos, histórico e persistência existentes; salvar/reabrir controlado conserva conteúdo e estilo. Proveniência/dúvidas têm ciclo de revisão explicitamente documentado, sem alegar persistência que não foi implementada.
- [ ] **AC10 — Publicação honesta.** Preflight existente permanece autoridade: READY permite o caminho PDF e BLOCKED impede saída insegura. Um PDF real do catálogo original é comparado à origem por página/célula e inspecionado visualmente. Modo de impressão e fronteira de autenticação ficam registrados.
- [ ] **AC11 — CLI antes da UI.** Contrato/compilador mock é exercitável pelo runner local sem UI; mensagens/recibos distinguem validação, compilação, composição e preflight. Depois, o fluxo completo é verificado na UI real, sem seed como substituto da descoberta humana.
- [ ] **AC12 — Gates e identidade.** Lint, typecheck, testes relevantes/completos e build passam no snapshot identificado. Fonte/branch/base, recibos e File List são mantidos. Nenhum PASS antigo da PR #67 certifica este novo MVP.
- [ ] **AC13 — Piloto separado.** Documentação contém protocolo curto de piloto com Marc, sem coaching na primeira tentativa. Resultado de agente não é aprovação de Marc; tempos, cliques, confiança e qualidade percebida não são inventados.

## Tarefas

- [x] Confirmar direção AI-first e nova worktree baseada na main.
- [x] Reutilizar estudo existente e definir proposta/limites de produto antes do código.
- [x] Criar esta story antes da implementação.
- [ ] Root registrar arquitetura e contratos de extração/composição com limites e decisões explícitos.
- [ ] Root implementar runner/compilador determinístico mock e fixtures originais.
- [ ] Root implementar o fluxo de três etapas e integrações delimitadas.
- [ ] Verificar exatidão, ausência/conflito, refinamento, histórico, persistência e A4/PDF.
- [ ] Registrar provas da UI e atualizar o relatório UX.
- [ ] Executar gates e avaliação independente; preparar disposição final do MVP.
- [ ] Atualizar checklist/File List e limitações restantes.
- [ ] Propor piloto Marc; marcar execução somente quando houver participante real.

## Evidência e estudo reutilizados

Estudo concluído: `C:/Users/Usuario/Documents/Codex/2026-10-08/advanced-technical-tables/TABLE_REFERENCE_STUDY.md`. Achados de UX, prontidão humana e lacunas anteriores são contexto; as provas têm identidades próprias e não se transferem automaticamente para a nova branch. Folder PRESYS tem page boxes de spread; nome Fluke 9140 contém modelos 9142/9143/9144. Não repetir a pesquisa.

## File List

Criados nesta etapa:

- `docs/stories/2026-10-09-ai-first-catalog-prototype.md`
- `docs/ai-catalog/PRODUCT_DIRECTION.md`
- `docs/ai-catalog/UX_PROTOTYPE_REPORT.md`

Documentos restantes previstos, a registrar quando existirem: `AI_CATALOG_ARCHITECTURE.md`, `TECHNICAL_EXTRACTION_CONTRACT.md`, `CATALOG_COMPOSITION_CONTRACT.md`, `AI_GENERATION_TEST_MATRIX.md`, `MVP_VALIDATION.md` e `RELEASE_READINESS.md` em `docs/ai-catalog/`. Arquivos de source/testes serão acrescentados por root após implementação; nenhum nome de módulo é presumido nesta story.

## Checkpoint

2026-10-09: story e direção delimitada criadas; implementação, UI, gates e piloto ainda pendentes. Status In Progress não é aceitação do MVP, da PR #67 ou do uso diário por funcionários.

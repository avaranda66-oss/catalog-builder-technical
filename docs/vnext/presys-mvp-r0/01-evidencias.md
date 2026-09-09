# Evidências da investigação

STATUS: PROPOSED
PRINCIPAL REVIEW: PENDING
FREEZE STATUS: NOT FROZEN
EVIDENCE STATE: R0 EVIDENCE + R0.1 VERIFIED AMENDMENT FACTS
DATE: 2026-09-09

BASELINE: `616332d6048a4259d2e2b562d8d5e781cea334bd`

FACT = leitura verificável de arquivo/comando. OBSERVATION = comportamento visto nesta sessão. INFERENCE = interpretação limitada pela evidência. PROPOSAL = decisão recomendada, ainda sem prova de implementação.

## Baseline e método

- FACT: `git ls-remote origin refs/heads/main` confirmou o SHA acima; HEAD local igual.
- FACT: árvore `26b21e6a06247823c80826e4855ee477a44db2de`.
- FACT: `gh pr list --state merged` confirmou PRs #6 a #11 integrados em 2026-09-09. O trabalho A4 não deve ser tratado como inexistente ou automaticamente reaberto.
- FACT: scripts de `package.json`: Vite, React 18, TypeScript, Vitest. Next.js não consta nas dependências. Arquivos residuais de Next não justificam escrever uma nova aplicação Next.
- FACT R0.1: `package.json`/lockfile já incluem `pdfjs-dist` `4.10.38`; `tests/render_pdf_to_image.mjs` e `tests/security/pdfjs-security.test.ts` comprovam uso existente no repositório. A foundation proof pode inspecionar/renderizar PDFs sem criar uma dependência nova para isso.
- FACT R0.1: `src/services/pdf.service.ts` importa `html2canvas` e rasteriza cada elemento de página para canvas antes de adicioná-lo ao PDF; esse caminho legado não satisfaz o contrato PDF de FOUNDATION-PROOF-01.
- FACT R0.1: `src/domain/page-geometry.ts` documenta `8.4667 mm` como conversão histórica de 32 CSS px (`32 * 25.4 / 96`). Esse valor é fato de compatibilidade do legado, não regra/default VNext.
- FACT: checkout inicialmente limpo, em HEAD destacado. Não havia `node_modules`; `npm ci --no-audit --no-fund` instalou as dependências do lockfile.
- Método PDF: pypdf para contagem, dimensões e texto; Poppler para renderização das 24 páginas; visão geral das 24 e revisão ampliada de Additel 875 pp. 6–7, Additel 761A pp. 3–4, Europa p. 2 e Fluke p. 4. Não foi feita conferência metrológica de todos os valores.
- Fontes locais: os quatro arquivos fornecidos em `C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalogospdf/`. Nenhum PDF foi alterado, enviado a serviço externo ou copiado para o Git.
- O plano de terceiro foi lido como proposta. Não se adotaram suas instruções de publicação, identidade de modelo ou aprovações como autoridade.

## Anatomia editorial das referências

| Arquivo | Páginas / tamanho medido | Composições relevantes | Consequência para o produto |
|---|---|---|---|
| Additel-761A-Datasheet.pdf | 6; 210 × 285 mm | p. 3 duas tabelas densas, células horizontais/verticais mescladas, notas; p. 4 matriz de compatibilidade de 11 colunas com pontos e sobrescritos; p. 5 larguras mistas; p. 6 pedido e acessórios com imagens | Mesclagem real, marcador semântico, notas ligadas e vários objetos independentes |
| Additel-875-Dry-Well-Calibrator-Datasheet (1).pdf | 8; 210 × 285 mm | pp. 3–4 tabelas com imagens grandes; p. 5 comparação; p. 6 três tabelas, uma longa à esquerda e duas à direita; p. 7 pedido, três tabelas de acessórios e matriz de insertos | Tabela deve aceitar imagem como conteúdo; composição não pode depender de um componente especial por página |
| Europa-Venus-Calisto-datasheet.pdf | 4; 210 × 297 mm | p. 1 foto, narrativa e três variantes; p. 2 comparativo com seções, valores compartilhados e imagens; p. 3 acessórios em coluna; p. 4 gráficos e diagramas | Texto rico, grupos reutilizáveis, tabela comparativa e diagramas importáveis |
| Fluke-9140-datasheet.pdf | 6; 209,55 × 279,4 mm | pp. 1–3 texto editorial em colunas e imagens; p. 4 duas tabelas estreitas, alturas independentes; p. 5 insertos e pedido | Controle de tipografia e largura; composição editorial não se resume a tabela de planilha |

OBSERVATION: o conteúdo do arquivo rotulado Fluke-9140 é “Field Metrology Wells”, com modelos 9142/9143/9144. Usar o conteúdo identificado, não deduzir fatos do nome do arquivo.

As dimensões Additel e Fluke não são A4. O alvo proposto PRESYS continua A4 retrato; reconstruir proporções e conteúdo em 210 × 297 mm, sem esticar a página original. Uma comparação visual bruta por pixel entre formatos diferentes seria um critério incorreto.

## O que significa riqueza visual, concretamente

- Uma hierarquia clara entre título, seção, cabeçalho de tabela, rótulo, valor e nota.
- Bordas finas consistentes, alternância de preenchimento e espaçamento controlado.
- Células mescladas que agrupam valores repetidos, sem imitar isso com espaços ou texto sobreposto.
- Condições de ensaio, unidades e incertezas junto do valor; sobrescritos vinculados à nota correta.
- Fotografia nítida e proporcional; não reduzir toda a tabela a uma imagem.
- Liberdade de posição entre objetos com organização interna previsível em cada tabela.
- Área reservada para marca e rodapé. Densidade é uma escolha editorial, não redução automática de toda a página.

## Operação real nesta sessão

URL de desenvolvimento: `http://127.0.0.1:5199/`.

| Superfície | Ação/resultado observado | Limite da evidência |
|---|---|---|
| Aplicação normal | Exibiu “Acesso não disponível” e falha de validação | Sem configuração Supabase neste checkout; não é prova de indisponibilidade em produção |
| `/__a4-physical-proof` | Fixture TA-25N mostrou PASS:0; adição de linhas produziu continuação; troca para Manual mostrou BLOCKED:4 | Laboratório existente, estado em memória; não é jornada autenticada |
| EditorView + A4Canvas + PropertiesPanel | Montados em harness temporário com `buildPresysTechnicalCatalog('TA-25N')` | Componentes reais, sem App/bootstrap e sem backend; nenhuma sessão foi falsificada |
| Tabela customizada | Seleção; inspector com nomes/adição de colunas; “Nova Coluna” criou “Nova Coluna 3” | Editabilidade básica confirmada; ausência de X/Y universal confirmada por código e inspector |
| Tabela V2 | Menu “Tabela em Branco — V2”; inserção; seleção; densidade Regular → Compacta; “Linha Manual” passou de 0 para 1 linha | Não foi comprovado roundtrip no servidor |
| Composição | Workspace com rolagem horizontal no viewport observado e menus repetidos por folha | Observação desse viewport; não equivale a análise completa de responsividade |
| Numeração | No harness, sidebar indicou 8 folhas autorais e canvas 13 renderizadas; apareceu “Página 13 de 8” | Indício concreto de duas contagens; reproduzir em app autenticado antes de classificar como bug de produção |

Não operados de ponta a ponta: login válido, biblioteca remota, duplicação persistida, upload, tradução externa, exportação final autenticada, publicação compartilhada, conflito entre dois usuários e presence. Não há afirmação de cobertura dessas jornadas.

Os valores metrológicos mostrados nas fixtures são conteúdo do repositório, não valores certificados nesta investigação. Foram observados campos “A COMPLETAR”; um preflight físico aprovado não equivale a conteúdo comercial aprovado.

## Verificação do baseline

| Comando | Resultado |
|---|---|
| `npm run lint` | Exit 0; 0 erros, 268 warnings |
| `npm run typecheck` | Exit 0 |
| `npm test` | Exit 0; 196 arquivos; 2.046 testes passaram, 1 ignorado |
| `npm run build` | Exit 0; aviso de chunk grande; JS principal 2.590,64 kB, gzip 690,51 kB |

São gates do código legado, executados sem alterar produção. Não certificam o novo editor, ainda não implementado, nem a qualidade gráfica por si só. As suítes contêm testes de domínio, integração e componentes; não confundir sua contagem com 2.046 jornadas no navegador.

## Fontes técnicas externas consultadas

A proposta de impressão controlada considera `page.pdf()`, mídia print, `preferCSSPageSize` e `printBackground`, documentados no [Playwright](https://playwright.dev/docs/api/class-page#page-pdf). Geometria de página e margens são fundamentadas em [CSS Paged Media](https://www.w3.org/TR/css-page-3/). Essas referências não provam suporte de hospedagem, equivalência total de CSS ou conformidade PDF/X; isso exige experimento.

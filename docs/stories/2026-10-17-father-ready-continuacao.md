# Story — Continuação local father-ready e entrega da Equipe B

## Status

In Progress

## Referências e origem

- Plano de origem: `docs/plans/2026-10-15-plano-father-ready.md`, especialmente Onda 2, ordem de integração, portões e riscos.
- Solicitação do usuário em 2026-10-17: continuar o trabalho dos dois chats e salvar o progresso para a retomada pelos responsáveis.
- Escopo desta retomada: integração local da Onda 2 e da entrega da Equipe B, preservando os trabalhos de origem.

## Story

Como responsável pela continuidade do projeto, quero reunir e validar localmente as entregas já produzidas pelos dois chats, corrigir regressões da integração e registrar o estado verificável, para que as equipes retomem o trabalho sem perder alterações nem confundir evidências automatizadas com aceite real.

## Acceptance Criteria

- [ ] AC1 — As branches e os worktrees de origem, incluindo alterações não commitadas e arquivos untracked, permanecem preservados. A integração ocorre no worktree de continuação e registra os pontos de partida necessários para retomada.
- [ ] AC2 — As nove fatias 2A–2I da Onda 2 e a entrega disponível da Equipe B são integradas localmente, respeitando a costura 2.0 e a ordem do plano: 2B → 2D → 2I → 2A → 2C → 2G → 2H → 2E → 2F. Fatias indisponíveis ou incompletas são identificadas explicitamente, sem declarar integração inexistente.
- [ ] AC3 — Conflitos e regressões decorrentes da integração são corrigidos com rastreabilidade; o baseline visual `catalog-builder-technical` é preservado, sem redesign ou funcionalidades fora do plano.
- [ ] AC4 — As jornadas automatizáveis afetadas são executadas em navegador nas larguras 1366 e 1280, com resultados e limitações registrados. Harness ou backend simulado é identificado como regressão automatizada; autenticação, segunda conta, Gemini/Supabase reais e aceite observado que não forem executados permanecem pendentes explícitos.
- [ ] AC5 — `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` são executados no estado final integrado, com resultado verificável. Falhas ou bloqueios remanescentes impedem declarar a entrega integralmente validada.
- [ ] AC6 — A story mantém checklists e File List atualizados, e o handoff registra branch/worktree, checkpoints locais, evidências, pendências, bloqueios e próximo passo para os dois chats retomarem.
- [ ] AC7 — Não são realizados push, publicação, deploy, aplicação de migrações ou alterações de segredos nesta continuação local.

## Tasks / Subtasks

- [x] Preservar e inventariar as entregas de origem (AC1, AC6).
  - [x] Registrar branches, SHAs, worktrees e alterações locais relevantes.
  - [x] Confirmar que arquivos untracked das origens permanecem intactos.
- [ ] Integrar as entregas locais seguindo dependências do plano (AC2, AC3).
  - [x] Confirmar a costura 2.0 de base.
  - [x] Integrar 2B — texto com estilo.
  - [x] Integrar 2D — painel de tabela, presets e eixos.
  - [x] Integrar 2I — continuar tabela na próxima página.
  - [x] Integrar 2A — célula inline, “+” e menu da grade.
  - [x] Integrar 2C — escala e assistente em aba.
  - [x] Integrar 2G — persistência P1.
  - [x] Integrar 2H — arquétipos e miniaturas.
  - [x] Integrar 2E — arquivos no assistente.
  - [x] Integrar 2F — servidor de extração, somente código local disponível.
  - [x] Integrar a entrega disponível da Equipe B e registrar seu escopo.
  - [ ] Resolver conflitos e regressões com testes focados quando necessários.
- [ ] Verificar a experiência integrada e os portões (AC4, AC5).
  - [x] Conferir espaço livre antes da rodada de portões, conforme risco do plano.
  - [ ] Executar jornadas automatizadas afetadas em 1366.
  - [ ] Executar jornadas automatizadas afetadas em 1280.
  - [ ] Registrar FR-24 (10 páginas com miniaturas) e FR-37 (tabela de 69 linhas da J12) quando o ambiente permitir, ou indicar a medição pendente.
  - [x] Executar `npm run lint`.
  - [x] Executar `npm run typecheck`.
  - [x] Executar `npm test`.
  - [x] Executar `npm run build`.
  - [ ] Separar evidência automatizada de jornadas reais ainda pendentes.
- [ ] Salvar checkpoints e preparar retomada (AC6, AC7).
  - [ ] Atualizar File List com os arquivos efetivamente alterados na continuação.
  - [ ] Registrar checkpoints locais e resultado final dos portões.
  - [ ] Registrar pendências que dependem do dono ou de ambiente externo.
  - [ ] Confirmar ausência de push, publicação, deploy, migrações aplicadas e alterações de segredos.

## Dev Notes

O plano exige integrações pequenas, respeito aos donos de arquivos e resolução serial das áreas compartilhadas. As entradas de `issue-fixes.ts` das fatias 2B e 2I devem coexistir; a adição da continuação de tabela no `TableInspectorPanel.tsx` deve preservar o painel da 2D. O `EditorWorkspace.tsx` deve continuar enxuto, sem crescimento desnecessário ou reescrita do baseline.

As correções devem partir dos contratos e comportamentos já entregues, mantendo os fatos técnicos e sua proveniência. A integração de código de extração ou de migrações versionadas não autoriza execução em serviços externos.

## CodeRabbit Integration / Quality Gates

- Revisão prevista: @dev para implementação e correções; @qa para avaliação das evidências e pendências; @devops apenas se houver autorização futura de operação remota.
- Revisão focada: regressões de contratos de comandos, edição/continuação de tabelas, persistência e ligações entre módulos e telas.
- CodeRabbit: duas revisões focadas concluídas com zero achados (6 arquivos dos reparos `001da19`/`063d996` e 4 arquivos do reparo `2a0cd75`). Escopo e resultados em docs/qa/2026-10-18-coderabbit-continuacao.json; não cobre automaticamente todos os merges/provas.
- Portões obrigatórios: lint, typecheck, testes e build; jornadas automatizadas nas duas larguras; aceite real permanece pendente quando não executado.

## Dev Agent Record

### Checkpoints e evidências

Produto integrado e corrigido até `2a0cd75`. Quatro gates aprovados: lint com 0 erros e 268 avisos; typecheck; 430 arquivos com 5.151 testes aprovados, 1 ignorado e 0 falhas; build. A rodada de 1366 de 18/10 concluiu 7 pass, 5 pending e 2 fail. As duas falhas de roteiro foram corrigidas e aguardam repetição. Jornadas completas nas duas larguras, FR-24/FR-37 e 51 provas de integração seguem em validação na retomada de 20/10. Não equivale a aceite real.

### Pendências / handoff

- Preencher os checkpoints locais e os resultados dos portões após a integração.
- Indicar as jornadas reais e dependências externas não executadas, conforme o plano.

### File List

- `docs/stories/2026-10-17-father-ready-continuacao.md` — story de rastreamento da continuação local.
- `docs/qa/2026-10-17-continuacao-inventario.json` — File List completa da integração e continuação, derivada do Git; inclui os scripts, fixtures, evidências e documentos preservados.
- `src/vnext/ai-catalog/CatalogNativeComposer.tsx`, `src/vnext/app/styles.css`, `src/vnext/app/translation-review-locale.css` e `tests/vnext/ai-catalog/catalog-native-composer.test.tsx` — reparos de controles e legibilidade em `2a0cd75`.
- `docs/qa/2026-10-20-checkpoint-retomada.md` — último checkpoint e próximos comandos.

## Change Log

| Data | Versão | Alteração | Responsável |
|---|---|---|---|
| 2026-10-17 | 1.0 | Story criada com escopo, critérios, checklists e handoff para a continuação autorizada. | @sm |

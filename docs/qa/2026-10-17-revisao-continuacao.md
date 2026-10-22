# Revisão manual da continuação father-ready — 2026-10-17

## Parecer manual condicionado

**CONCERNS — revisão de código concluída sem novo P0/P1 comprovável no escopo examinado; aceite da integração condicionado aos portões e jornadas finais.**

O executor confirmou a integração das nove fatias e da Equipe B em `1859373`. A leitura final observou `063d9966defe94bd37f4e472986ba6b4a525c1fa`, que acrescenta as correções `001da19` (medição de largura de texto) e `063d996` (draft na cópia de conflito). Os scripts de prova ainda tinham alterações locais durante a leitura. Esta revisão é manual e independente; CodeRabbit local está indisponível e não foi executado nem declarado verde.

Após autorização adicional do executor, este revisor executou somente a rodada focada do reparo de persistência descrita abaixo. Nenhum build, navegador ou serviço externo foi executado por este revisor. Os portões completos e as jornadas ficam sob execução do responsável pela integração.

## Escopo lido

- Integração 2A/2B/2C/2D/2G em `src/vnext/app/EditorWorkspace.tsx`.
- Correções de altura de texto e continuação de tabela em `src/vnext/app/editor/issue-fixes.ts` e testes de ligação.
- Edição inline, seleção e foco da grade; barra de texto e abas do assistente.
- Modal de conflito, coordenador de resolução, reabertura e descarte dos registros de recuperação da 2G.
- Composição final 2C + 2E: abertura por endereço, dock/abas, composer, intake, barreira de autoria, medição e seleção da tabela inserida.
- Correção de espaços pendentes em `src/vnext/rendering/measurement.ts` e regressões sintéticas em `tests/vnext/rendering/measurement-hanging-space.test.tsx`.
- Identidade, resultados, estados e limites declarados do runner `father-journeys`.

## Achado P1 — cópia de conflito perdia o rascunho visível

Quando o salvamento automático já estava em voo, o usuário podia iniciar um novo rascunho de célula ou texto antes da resposta de conflito. “Salvar meu trabalho como cópia” clonava apenas o documento canônico, sem preparar a barreira de autoria. O texto visível continuava somente no `authoringRecoveryOverlay`. Depois de abrir a cópia, a limpeza do registro da sessão anterior podia apagar também esse overlay, causando perda do rascunho.

Evidência estática: `saveAsCopyOnce()` clonava `guard.document` sem `prepareForSave()`; a reabertura permitia descartar alterações presentes; `releaseReplacedBackup()` acionava a limpeza de registros do catálogo anterior no gerenciador de recuperação. Os testes anteriores cobriam renomeações canônicas, sem draft pendente.

### Correção autorizada e regressões focadas verificadas

- `src/vnext/persistence/conflict-resolution-coordinator.ts`: prepara e valida a autoria antes da cópia; recaptura o documento incluindo o draft; recusa mudança de sessão, catálogo, autoridade ou revisão durante o commit; mantém o conflito e o trabalho quando a autoria não pode ser concluída. O guard passou a incluir o estado do draft/overlay durante operações assíncronas.
- A operação exclusiva passa a ser registrada antes de executar callbacks de autoria, protegendo contra reentrada síncrona durante a publicação do commit.
- `tests/vnext/persistence/conflict-fr43.test.ts`: quatro regressões adicionadas para texto digitado durante autosave em voo, draft inválido preservado com recuperação, autoridade alterada durante commit e reentrada síncrona da resolução.

O revisor assumiu o papel @dev somente para a correção solicitada pelo responsável pela integração. Não houve commit nem alteração de outros módulos ou da story.

### Resultado exato da rodada focada

A primeira execução pelo responsável pela integração teve **34 testes aprovados e 3 falhas** em quatro arquivos. Duas falhas aguardavam exatamente quatro microtasks antes de observar o início da criação; foram corrigidas em `tests/vnext/persistence/conflict-resolution.test.ts` aguardando `createCatalog` com `vi.waitFor`, sem alterar as assertions funcionais de exclusão mútua, identidade ou quantidade de cópias. A terceira falha era montagem do novo cenário: a revisão remota tinha sido avançada antes de criar a aba B, então seu binding já conhecia essa revisão. O teste passou a avançar a revisão depois de abrir a aba B, produzindo um conflito real no repositório CAS em memória.

Rodada de confirmação executada pelo revisor:

```text
npm test -- tests/vnext/persistence/conflict-fr43.test.ts tests/vnext/persistence/conflict-resolution.test.ts tests/vnext/persistence/recovery-lifecycle.test.ts tests/vnext/app/conflict-dialog.test.tsx --minWorkers=1 --maxWorkers=2
```

**4 arquivos aprovados; 37 testes aprovados; 0 falhas.** Duração reportada pelo Vitest: 7,32 s. Log: `scratch/continuacao/conflict-fix-retest.log`.

A regressão nova usa uma requisição CAS suspensa, digitação de draft antes da resposta de conflito, overlay realmente persistido na recuperação e leitura posterior do texto no documento da cópia salva e no documento reaberto. O texto do catálogo original permanece intacto. Os demais cenários confirmam preservação do draft inválido, recusa de autoridade alterada no commit e reentrada segura. As verificações existentes de recuperação e diálogo também passaram na rodada.

## Resultado da leitura final

A resolução de `issue-fixes.ts` preserva a correção de texto e a continuação de tabela, inclusive o fallback que substitui “Ajustar altura da tabela” por “Continuar na próxima página” quando necessário. Há testes que exercitam essas ligações no editor e no painel. Esta leitura não confirma execução ou sucesso desses testes nesta continuação.

A composição 2C + 2E mantém `AssistantDock`, abertura por `assistente=1` e posterior limpeza desse parâmetro. Os dados e callbacks `selectedTable`, `onBeforeMutation`, `measurement`, `activePageId` e `onShowTable` seguem ligados do workspace ao composer e ao fluxo de inserção. A mudança de página atualiza a referência de página antes da seleção funcional do objeto. Não foi encontrado callback perdido nessa ligação. Arquivos permanecem em store por catálogo quando a aba do painel muda; a análise de código não substitui as jornadas de navegador.

A correção de largura reavalia somente aparente transbordo horizontal. Mede posições das palavras para excluir espaços de final de linha em `pre-wrap`, preservando as posições dos espaços internos, NBSP, o caminho `pre`/nowrap e a largura de imagens. Os registros completos de texto e a medição vertical continuam no caminho anterior. Os testes lidos verificam esses limites com geometria sintética; a confirmação do comportamento real do Chromium fica pendente nesta revisão.

O runner passa a vincular resultados a execução/processo, raiz, HEAD e servidor. Resultado ausente, processo não zero, falha funcional ou achado P0/P1 prevalece sobre `pending`. A documentação declara o backend controlado, a IA simulada, os limites de autenticação e a diferença entre impressão automatizada e diálogo nativo. Essa estrutura sustenta relato honesto, desde que o executor preserve o diff/commit e registre explicitamente as pendências retornadas. A leitura do runner não comprova que suas jornadas foram executadas.

## Evidências finais informadas pelo executor

- Lint final: exit 0, 0 erros e 268 avisos (informação do executor).
- Typecheck final: exit 0 (informação do executor).
- Regressão focada de conflito/recuperação/diálogo: 4 arquivos, 37 testes, 0 falhas (executada por este revisor e registrada acima).
- Full Vitest: em execução pelo responsável na emissão deste parecer.
- Build final e jornadas Chromium 1366/1280: ainda não confirmados ao revisor.

## Condições de aceite ainda abertas

- Resultado da suíte completa e do build sobre o estado integrado (a regressão focada do P1 está aprovada).
- Evidências das jornadas em 1366 e 1280 e identificação dos limites de harness versus ambiente real.
- Validação real de autenticação, segunda conta, provedores externos, impressão no ambiente do pai e sessão observada quando não cobertas pelo harness.

O parecer não autoriza publicação nem equivale a aceite em produção. Não há novo bloqueio P0/P1 identificado pela leitura final; falhas dos portões ou jornadas posteriores devem ser registradas e avaliadas antes de encerrar os critérios correspondentes da story.

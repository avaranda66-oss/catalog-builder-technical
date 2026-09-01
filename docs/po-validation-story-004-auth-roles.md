# Validação PO — STORY-004-P0: Auth e papéis

- **Data:** 2026-09-01
- **Validador:** @po (Pax)
- **Artefato validado:** `docs/stories/story-004-p0-auth-roles.md`
- **Fontes confrontadas:** `docs/prd-release-recovery.md`, `docs/brownfield-architecture.md`, `docs/adr-001-brownfield-architecture.md`, `docs/stories/epic-001-brownfield-recovery.md`, `.aiox-core/product/templates/story-tmpl.yaml` e o código/migrations existentes.
- **Veredito atual:** **GO / APPROVED FOR DEV**
- **Prontidão atual:** 8/10

> **Revalidação — 2026-09-01:** o Administrador confirmou o método único de MVP: contas internas já criadas e confirmadas manualmente, com login por e-mail + senha; sem auto-signup, e-mail/Magic Link ou recuperação autônoma. A Story foi atualizada com esse limite. Esse bloqueador foi removido. O veredito permanece **NO-GO**: o contrato real de perfis/papéis continua indispensável e há correções formais AIOX pendentes descritas abaixo. Portanto, não é correto afirmar que ela está bloqueada *apenas* pelo contrato `profiles`/`role`.

## Resumo executivo

A story descreve bem a fronteira visual de autenticação, a falha fechada no cliente e deixa explícito que UI não substitui RLS/RPC. Ela está alinhada com o objetivo confirmado: pai como Administrador, funcionários como Colaboradores limitados e edição oficial exclusiva do Administrador.

Ela não está pronta para desenvolvimento porque o contrato de identidade que pede para consumir ainda não foi decidido nem demonstrado no ambiente alvo. Implementar uma tela de login antes de resolver esse contrato criaria código especulativo e pode produzir uma interface incompatível com a futura autorização de servidor da STORY-005.

## Resultado por critério de validação

| Área | Resultado | Evidência |
|---|---|---|
| Valor e escopo | PASS | §§1–2 preservam a fonte oficial e delimitam que RLS/RPC não fazem parte desta story. |
| Critérios de aceite | PARTIAL | ACs 1–9 são testáveis com mocks, mas dependem de método de login e contrato de perfil ainda indeterminados. |
| Segurança/fail-closed | PARTIAL | A regra está correta na interface; a story reconhece que a segurança de servidor é responsabilidade posterior. |
| Sequência | BLOCKED | A pré-condição de contrato remoto é necessária para Tasks 1–2, porém não tem resultado/evidência nem responsável de resolução. |
| Testes isolados | PASS (planejamento) | §7 exige mocks e proíbe rede/produção; execução e revalidação de STORY-001 continuam fora deste parecer. |
| File List | PARTIAL | Os caminhos prováveis são úteis, mas faltam os arquivos de contrato/mocks concretos e o componente/integração de autenticação só pode ser finalizado após a decisão do método. |
| Template/AIOX | FAIL | Faltam os campos obrigatórios `quality_gate_tools` e a seção/aviso literal de CodeRabbit do template. O status não usa uma das escolhas do template (`Draft`, `Approved`, `InProgress`, `Review`, `Done`) e o Change Log usa `0.1`, que não é versão semântica completa. |

## Bloqueadores críticos — corrigir antes de nova validação

1. **Escolher um único método inicial de autenticação.** A ADR admite Email+Senha ou Magic Link; a Story §3.2 exige que o PO/Administrador escolha um antes de codificar. O PRD não fixa essa escolha. Registrar a decisão e o fluxo de recuperação/erro correspondente; não implementar ambos por conveniência.

2. **Resolver o contrato de perfil real sem inventar schema.** A ADR fala em `user_profiles` e em papéis `admin|collaborator`. A migration local `supabase/migrations/00004_team_workspace.sql` usa `public.profiles`, `public.team_role()` e o enum legado com `admin`, `editor`, `viewer`; isso não demonstra nem o nome de tabela nem o conjunto de papéis que a Story pretende consumir. A Story deve declarar uma dependência formal de uma decisão/contrato para STORY-005, ou uma pré-story de dados/arquitetura, que responda:
   - qual tabela/função é a fonte de papel no ambiente alvo;
   - como `admin` e `collaborator` serão representados sem ampliar permissões pendentes;
   - qual consulta/RPC de leitura a SPA poderá usar;
   - quais estados de perfil inativo/ausente são falha fechada.

   A confirmação deve ser feita em modo leitura ou especificada em migration aprovada na story de dados; esta story não pode criar o contrato por conta própria.

3. **Deixar a dependência de servidor explícita no épico.** STORY-004 pode implementar somente a fronteira de cliente depois que o contrato estiver estabelecido, mas G4 não pode ser fechado nem o app liberado antes da STORY-005 aplicar e provar RLS/RPC/CAS. A dependência deve ser anotada como bloqueadora de release, não apenas como nota de risco.

4. **Corrigir a estrutura AIOX antes de executar.** O Scrum Master/PO deve:
   - padronizar o campo Status para `Draft` enquanto bloqueada;
   - incluir `executor`, `quality_gate` e `quality_gate_tools` no formato exigido pelo template; manter o parecer final de qualidade com @qa conforme a Constituição, mas definir também o gate técnico compatível e distinto do executor;
   - inserir o aviso de CodeRabbit desabilitado exatamente como prescrito, já que `coderabbit_integration.enabled` não está configurado;
   - corrigir o Change Log para versão semântica, por exemplo `0.1.0` para o draft original e `0.1.1` para a revisão;
   - listar arquivos de testes de Auth e o mock/fixture de perfil com caminhos determinados após o levantamento da estrutura de testes.

## Melhorias importantes antes do desenvolvimento

- Especificar no Task 2 como o cliente deve invalidar qualquer cache de perfil quando ocorrer troca de usuário, inclusive quando a primeira busca termina depois de `SIGNED_OUT` (evita reidratação tardia de privilégio anterior).
- Definir a semântica de "Biblioteca em leitura" enquanto as queries atuais ainda podem falhar por RLS; o estado deve permanecer bloqueado/explicativo, nunca voltar ao fallback de dados iniciais como se fossem oficiais.
- Mapear cada controle oficial existente que deve desaparecer para Colaborador — criação/edição/arquivamento/restauração/exclusão de produto, colunas de Biblioteca e mídia — após inventário de componentes. Isso evita deixar atalhos por teclado ou modais acessíveis.
- Substituir o campo "provável criação/alteração `tests/**`" por arquivos e testes determinados antes da implementação. A File List final deve refletir somente arquivos reais.

## Itens que **não** são requisitos desta story

Não foram assumidas permissões ainda pendentes para Colaboradores — visibilidade de rascunhos de colegas, exportação de rascunho, submissão para revisão e envio de mídia. Também não foi aprovada qualquer migração, RLS, RPC, convite, usuário Auth ou deploy.

## Próximo handoff

1. O Administrador escolhe o método único de login inicial.
2. @architect e @data-engineer especificam/confirmam o contrato de identidade compatível com produção e com a futura STORY-005, sem mutar o ambiente nesta validação.
3. @sm revisa STORY-004 com os quatro bloqueadores acima e solicita nova validação PO.

Após um **GO** PO, @dev pode implementar somente a fronteira de cliente descrita pela story revisada; @qa emite o único veredito de qualidade da implementação. A liberação colaborativa permanece bloqueada até a STORY-005 provar autorização de servidor.

## Resultado da revalidação após decisão de login

| Item reavaliado | Resultado |
|---|---|
| Método de login | **PASS.** A Story §§2–4 e 7 agora fixa e-mail + senha para contas internas pré-criadas/confirmadas e proíbe explicitamente os fluxos não aprovados. |
| Limites de permissão | **PASS.** Não concede permissões pendentes a Colaborador e mantém UI sem pretensão de autorização de servidor. |
| Contrato real de perfil/papel | **BLOCKED.** A Story ainda referencia `user_profiles` + `admin|collaborator`, enquanto a migration existente define `profiles` + `team_role()` e o modelo legado `admin|editor|viewer`. Falta a decisão/contrato que o cliente pode de fato consumir. |
| Estrutura de story AIOX | **BLOCKED.** Status `Draft — Ready for PO validation` não é valor de Status do template; faltam os campos de atribuição exigidos, `quality_gate_tools` e o aviso literal CodeRabbit; versões `0.1`/`0.2` não são semver completo. |
| File List/testes determinados | **PARTIAL.** O plano é seguro, mas ainda traz `tests/**` indeterminado e fixtures de `user_profiles` que podem não corresponder ao contrato que existir. |

### Veredito de revalidação

**NO-GO / BLOCKED.** A decisão de login está completa. Para chegar a **GO**, o Scrum Master deve corrigir a estrutura formal indicada e o arquiteto/data engineer deve disponibilizar uma decisão de contrato que resolva `profiles` versus `user_profiles` e `admin|editor|viewer` versus `admin|collaborator`. Sem esse segundo item, não há implementação de Auth que possa ser considerada fiel à futura STORY-005.

## Revalidação final — ADR-002 e Story revisada

**Data:** 2026-09-01  
**Veredito:** **GO / APPROVED FOR DEV**

ADR-002 substitui explicitamente, para identidade e papéis, a divergência que bloqueava a story: o contrato persistido é `public.profiles` + `public.user_role`; somente `admin` ativo entra como Administrador e `editor` ativo entra com o rótulo de produto Colaborador limitado. `viewer`, perfil ausente, inativo ou inválido falham fechados. O método de acesso também está decidido: e-mail + senha para contas internas provisionadas pelo Administrador, sem os fluxos de conta não aprovados.

### Critérios de aprovação verificados

| Critério | Resultado | Evidência na story revisada |
|---|---|---|
| Fonte de papel e mapeamento de produto | PASS | §§2–4 e 6 implementam `profiles`/`admin|editor|viewer` conforme ADR-002, sem criar `user_profiles` nem persistir `collaborator`. |
| Falha fechada e mudança de sessão | PASS | ACs e Task 2 cobrem sessão ausente, perfil ausente/inativo/`viewer`, expiração, troca de usuário e resposta tardia. |
| Limite de login interno | PASS | ACs 2–3 e Task 2 restringem a UI a e-mail + senha e proíbem auto-signup, Magic Link, confirmação e reset autônomo. |
| Sincronização insegura na transição | PASS | Escopo, ACs, Tasks e plano de testes exigem que pull/push/upload/delete legados fiquem inativos para todos os papéis até STORY-005. |
| Isolamento de testes | PASS | §7 e File List determinam mocks locais de sessão/perfil, testes de gates e spies para não chamar os métodos remotos legados. |
| Acessibilidade, rollback e limite de release | PASS | §§6, 8–11 definem linguagem de erro, foco/teclado, rollback sem restaurar privilégio local e bloqueio explícito de G4/release. |
| Estrutura AIOX | PASS para execução | Status está em `Draft`; a atribuição possui executor, quality gate e ferramentas; o aviso CodeRabbit desabilitado é literal; Change Log usa semver. O parecer final de implementação continua sendo exclusivo de @qa, conforme a Constituição. |

### Condições obrigatórias para a execução

1. @dev só pode executar esta Story; não deve criar/editar Auth users, migrations, RLS, RPCs, Storage, ambiente remoto, Git remoto ou deploy.
2. A confirmação de leitura do login e de `public.profiles` é uma primeira subtarefa. Se o ambiente alvo divergir de ADR-002, @dev deve parar, registrar o desvio e devolver a story para arquitetura/PO — sem fallback local ou adaptação de schema.
3. Nenhuma escrita remota, inclusive como Administrador, pode permanecer ativa no caminho de boot, edição ou mídia. A autorização de servidor, RLS/RPC/CAS, permissões reais de Colaborador e liberação de G4 pertencem à STORY-005.
4. A story só pode ser considerada pronta para QA depois de seus testes locais isolados, typecheck e build, com File List e checklist reais. `lint` continua um gap a registrar, não um sucesso.

### Handoff aprovado

**@dev — desenvolver `STORY-004-P0` em branch local, sob as condições acima.**  
**@qa — validar exclusivamente a implementação concluída; não fechar G4 nem autorizar release.**

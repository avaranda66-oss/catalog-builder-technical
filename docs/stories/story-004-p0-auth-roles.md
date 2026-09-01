# STORY-004-P0: Sessão Supabase Auth e papéis de Administrador/Colaborador na SPA

- **Épico:** `EPIC-001 — Brownfield Recovery, Security, Test Isolation & Core Reliability`
- **Status:** InReview
- **Prioridade:** P0
- **Gate relacionado:** G4 — Identidade e autorização (parcial; não fecha o gate isoladamente)
- **Executor proposto:** `@dev`
- **Quality gate proposto:** `@qa`
- **Dependências:** STORY-001 (testes isolados), STORY-002 (segredo de IA removido) e ADR-002 (contrato de identidade). RLS/RPC/CAS e autorização de servidor permanecem responsabilidade da STORY-005.
- **Fontes normativas:** `docs/prd-release-recovery.md` §§ 3, 4, 6 e 10–11; `docs/brownfield-architecture.md` §§ 1, 4.1, 5–6 e 9; `docs/adr-001-brownfield-architecture.md` §§ 2.1–2.2 e 4; `docs/adr-002-identity-contract.md` §§ Decisão, Contrato de sessão e bootstrap do cliente, Transição segura do legado e Requisitos vinculantes para a Story 004.

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools:
  - "Vitest com mocks locais e barreira de rede"
  - "npm run typecheck"
  - "npm run build"
  - "revisão manual de estados de sessão e papel"
```

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only.
> To enable, set `coderabbit_integration.enabled: true` in `core-config.yaml`.

## 1. História e valor

**Como** pai/Administrador ou funcionário/Colaborador autorizado,  
**quero** entrar na aplicação com uma sessão Supabase autenticada e receber uma interface coerente com meu papel,  
**para que** a Biblioteca oficial não pareça administrável por qualquer navegador e o fluxo de colaboração comece com uma identidade explícita.

O produto atual é uma SPA Vite/React sem login efetivo: `App` inicializa módulos de dados no carregamento e `useLibraryStore` fixa `isAdmin: true` no navegador. Isso contradiz a matriz de permissões do PRD e não é aceitável para o pai operar uma fonte da verdade com colaboradores. Esta story cria apenas a primeira barreira de identidade e de interface; ela não substitui a autorização no banco.

## 2. Escopo e limites rigorosos

### Incluído

- Exigir sessão Supabase Auth resolvida antes de montar ou inicializar Biblioteca, A4 Studio, Publications e mídia que consultem dados.
- Oferecer somente login interno por **e-mail + senha** para contas já criadas e confirmadas manualmente pelo Administrador no Supabase; não expor auto-signup, confirmação/ativação por e-mail, Magic Link ou redefinição de senha na aplicação.
- Restaurar a sessão ao abrir a SPA e reagir às mudanças de sessão emitidas pelo cliente Supabase, incluindo saída/expiração.
- Derivar o papel efetivo exclusivamente de `public.profiles` associado a `auth.uid()`, usando o contrato persistido `public.user_role`: somente `(admin, is_active=true)` e `(editor, is_active=true)` podem entrar. A UI apresenta `editor` como **Colaborador limitado**; `viewer`, perfil ausente/inativo ou papel inesperado são bloqueados.
- Falhar fechado: ausência de sessão, perfil ausente, papel desconhecido, erro ao buscar perfil ou atualização de sessão incompleta não podem liberar módulos de dados nem controles oficiais.
- Exibir ao Administrador os controles de Biblioteca oficial já existentes; exibir ao Colaborador a Biblioteca em leitura, sem controles de criação, edição, aprovação, arquivamento, restauração, remoção ou mídia oficial.
- Desabilitar, para todos os papéis durante a transição, a sincronização automática legada e as escritas diretas remotas de produtos, catálogos e mídia. Até STORY-005 validar RLS/RPC/CAS, a SPA não pode puxar, reenviar, fazer upload, `upsert` ou `delete` no Supabase pelo caminho ativo — nem para Administrador.
- Cobrir o comportamento com testes locais e mocks, sem tráfego real de Supabase e sem dados/credenciais de produção.

### Explicitamente fora de escopo

- Criar/alterar migrations, tabelas, enum, RLS, RPCs, policies, buckets, funções, usuários Auth, convites ou papéis no Supabase.
- Substituir `upsert`/`delete` diretos, implementar CAS, salvamento seguro, conflito, auditoria, catálogo compartilhado, publicação, exportação de colaborador, mídia ou overrides. Esses itens pertencem a stories posteriores, sobretudo STORY-005 e STORY-006/007.
- Conceder qualquer direito que o PRD marca como **Pendente de decisão**, incluindo edição de catálogo de outra pessoa, submissão para revisão, exportação de rascunho e upload de fotos por colaborador.
- Declarar G4 ou a aplicação pronta para release. A proteção visual/cliente não impede uma chamada forjada ao Supabase e, portanto, não é autorização de servidor.

## 3. Pré-condições e decisões a validar antes de codificar

1. **Contrato canônico resolvido por ADR-002:** esta story lê somente `public.profiles` do usuário autenticado; `profiles.role` é `public.user_role` com `admin|editor|viewer`, e `profiles.is_active` define se há acesso. Não criar `user_profiles`, não persistir `collaborator` e não criar um terceiro papel de produto.
2. **Método confirmado:** o método do MVP é **e-mail + senha**. Contas internas são criadas manualmente pelo Administrador no Supabase e chegam ao login já confirmadas. Auto-signup, ativação/confirmação por e-mail, Magic Link e recuperação de senha dentro do app são proibidos nesta story. Redefinição de senha é procedimento operacional do Administrador/Supabase fora da SPA.
3. **Usuários piloto:** a criação/confirmação, ativação, suspensão e mudança de papel das contas do pai/Admin e dos colaboradores são operações administrativas externas a esta story. Não colocar nomes, e-mails, IDs, senhas, tokens ou chaves em código, fixtures, documentos ou logs.
4. **Estado inseguro atual:** enquanto STORY-005 não substituir as escritas diretas por RLS/RPC/CAS, nenhum deploy pode alegar autorização efetiva de escrita. STORY-004 deve desligar o caminho ativo de sync/mutação remota legado; se não houver sessão/perfil efetivo, a entrega mantém a SPA de trabalho bloqueada e não usa fallback local privilegiado.

## 4. Critérios de aceite (Given / When / Then)

1. **Sessão é obrigatória antes dos módulos de dados**
   - **Given** um navegador sem sessão Supabase válida,
   - **When** abre ou recarrega a SPA,
   - **Then** vê somente o estado de autenticação apropriado e nenhum módulo Biblioteca, A4 Studio, Publications ou mídia é montado/inicializado.

2. **Login de conta interna ativa já confirmada**
   - **Given** uma conta interna previamente criada e confirmada pelo Administrador no Supabase, com `public.profiles` ativo e papel persistido `admin` ou `editor`,
   - **When** o titular informa e-mail e senha corretos na tela de entrada,
   - **Then** a SPA inicia sessão por e-mail+senha, lê o próprio perfil canônico e somente então libera a interface Administrador ou Colaborador limitado correspondente.
   - **Given** credenciais inválidas, conta não confirmada, perfil inativo ou falha de Auth,
   - **When** o usuário tenta entrar,
   - **Then** a SPA mostra um erro compreensível sem revelar se um e-mail existe, não monta módulos de dados e não oferece privilégio local alternativo.

3. **Auto-signup e fluxos de e-mail permanecem desabilitados**
   - **Given** qualquer pessoa na tela de entrada,
   - **When** procura criar conta, confirmar e-mail, pedir Magic Link ou redefinir senha,
   - **Then** a SPA não apresenta esses controles nem chama operações equivalentes do Supabase; a orientação de suporte para senha remete ao Administrador, sem expor dados de contato ou credenciais.

4. **Sessão restaurada somente com perfil efetivo**
   - **Given** um usuário com sessão Supabase previamente válida,
   - **When** recarrega a SPA,
   - **Then** a sessão é resolvida antes do conteúdo protegido e o papel efetivo é obtido de `public.profiles`; não há breve exposição de interface administrativa durante o carregamento.

5. **Mudança e término de sessão**
   - **Given** a SPA já aberta com sessão autenticada,
   - **When** o cliente Supabase comunica saída, expiração ou mudança de usuário,
   - **Then** o estado de autenticação é atualizado, o conteúdo protegido deixa de ficar acessível e nenhuma permissão do usuário anterior permanece no estado do cliente.

6. **Papel efetivo é derivado do contrato canônico, não presumido**
   - **Given** uma sessão autenticada e o próprio perfil ativo com `role = admin`,
   - **When** a Biblioteca é exibida,
   - **Then** os controles oficiais previstos na interface podem ser apresentados ao Administrador.
   - **Given** a mesma sessão sem perfil, com `is_active = false`, com `role = viewer`, com papel fora de `admin|editor|viewer`, ou com erro de perfil,
   - **When** a resolução de identidade termina,
   - **Then** a aplicação entra em estado bloqueado com mensagem compreensível e não usa `isAdmin`, localStorage, e-mail, metadados editáveis no cliente ou outro fallback de permissão.

7. **Colaborador não recebe controles oficiais**
   - **Given** uma sessão autenticada com perfil ativo `role = editor`,
   - **When** abre a Biblioteca,
   - **Then** pode consultar a Biblioteca em modo leitura, mas não encontra nem consegue acionar pela interface ações oficiais de criar, editar, aprovar, arquivar, restaurar, excluir ou alterar mídia oficial.

8. **Remoção do privilégio local**
   - **Given** qualquer estado persistido anterior do navegador,
   - **When** a versão da story é carregada,
   - **Then** não existe flag local fixa que conceda administração (`isAdmin: true` ou equivalente), e trocar armazenamento local não torna a interface administrativa sem um perfil `admin` válido.

9. **Falhas recuperáveis e sem falso sucesso**
   - **Given** erro de rede, sessão inválida ou falha de busca do perfil,
   - **When** o usuário tenta entrar ou restaurar a sessão,
   - **Then** vê estado claro de erro e ação de tentar novamente/sair, sem inicialização de sincronização de dados e sem mensagem de acesso concedido.

10. **Sincronização e escritas diretas legadas ficam desativadas**
   - **Given** uma sessão válida de Administrador ou Colaborador limitado,
   - **When** a SPA inicia, carrega Biblioteca/catálogos/mídia ou o usuário altera conteúdo local,
   - **Then** o caminho ativo não chama os métodos legados de pull/push, upload, `upsert` ou `delete` do Supabase; o estado não afirma sincronização concluída e nenhuma operação remota é reativada como compensação.

11. **Testes isolados e negativos de segurança**
   - **Given** a suíte desta story,
   - **When** é executada no ambiente de testes isolado estabelecido pela STORY-001,
   - **Then** usa cliente Supabase mockado, não faz chamadas de rede e cobre pelo menos: login válido `admin` ativo, login válido `editor` ativo, falha de login, ausência de auto-signup/recuperação/Magic Link, sem sessão, perfil ausente, perfil inativo, `viewer` bloqueado, restauração de sessão, evento de saída/expiração, bloqueio dos controles oficiais ao Colaborador e ausência de chamadas ao adaptador legado de sync/escrita.

12. **Limite de autorização documentado**
   - **Given** a story pronta para revisão,
   - **When** QA verifica a entrega,
   - **Then** a documentação e os testes afirmam explicitamente que o bloqueio de UI não substitui RLS/RPC e que G4 só poderá ser fechado após a STORY-005 comprovar as regras de leitura/escrita usadas pelo cliente.

## 5. Tarefas / subtarefas de implementação

- [x] **Task 1 — Preparar fronteira de autenticação a partir do contrato ADR-002 (AC: 1–6, 9)**
  - [x] Confirmar em leitura a disponibilidade de login por e-mail+senha e de consulta do próprio `public.profiles`; tratar `admin`/`editor` ativo como únicos pares aceitos, e perfil ausente/inativo/`viewer` como bloqueio de acesso, sem criar dados ou migrations.
  - [x] Mapear o ponto de entrada atual (`src/main.tsx` → `src/App.tsx`) e impedir a inicialização dos stores/módulos de dados antes da resolução da sessão e do papel.
  - [x] Definir estados explícitos de `loading`, `unauthenticated`, `authenticated`, `profile-error` e `forbidden/unknown-role`, sem default privilegiado.

- [x] **Task 2 — Implementar sessão e papel efetivo de cliente (AC: 1–6, 8–9)**
  - [x] Criar o estado de autenticação proposto pela ADR (`useAuthStore` ou equivalente), usando o cliente Supabase existente e o evento de mudança de sessão; limpar estado sensível ao encerrar sessão.
  - [x] Obter o papel exclusivamente a partir do próprio `public.profiles` após sessão autenticada e aceitar somente `admin` ativo ou `editor` ativo; mapear `editor` somente para o rótulo de UI **Colaborador limitado**.
  - [x] Implementar a tela de entrada por e-mail+senha e seus estados de falha, tentativa de novo carregamento de perfil e saída; não incluir `signUp`, Magic Link, confirmação/ativação por e-mail ou recuperação de senha.
  - [x] Invalidar leitura/cache de perfil de forma segura em troca de usuário, `SIGNED_OUT`, expiração e resposta tardia: resultado associado ao usuário anterior não pode reidratar privilégio no novo estado.
  - [x] Remover/refatorar o uso de `isAdmin: true` como fonte de permissão; nenhuma store de Biblioteca deve estabelecer autoridade por si própria.

- [x] **Task 3 — Aplicar modo de Biblioteca por papel (AC: 4–6)**
  - [x] Exibir a Biblioteca oficial para ambos os papéis apenas depois da fronteira de Auth.
  - [x] Encapsular atrás do papel efetivo todos os controles oficiais hoje presentes em `LibraryView`: adicionar produto, editar células, excluir produto, criar/renomear/remover coluna e criar família; garantir que elementos inacessíveis não possam ser disparados por teclado, modal ou atalho da interface.
  - [x] Para Colaborador, manter a grade em leitura sem fallback para dados iniciais como se fossem oficiais quando a consulta permitida falhar; mostrar estado bloqueado/explicativo em vez disso.
  - [x] Manter todos os direitos ambíguos de colaboradores fora desta story; não criar fluxos de convite, exportação ou publicação.

- [x] **Task 4 — Desativar sync e mutações remotas legadas no caminho ativo (AC: 10)**
  - [x] Remover/desativar chamadas de pull/push de produtos em `useLibraryStore`, pull/push de catálogos em `useCatalogStore` e pull/push/upload/delete de mídia em `useMediaStore`/`MediaGalleryModal` enquanto STORY-005 não tiver contrato de servidor validado.
  - [x] Garantir que Administrador e Colaborador recebam estado claro de trabalho local/transição, sem rótulo de sincronização confirmada e sem reenvio automático de conteúdo local.
  - [x] Não remover dados, não alterar o serviço/banco remoto e não reativar nenhum método legado por fallback; qualquer novo contrato de persistência é escopo de STORY-005.

- [x] **Task 5 — Testes e verificação isolada (AC: 1–12)**
  - [x] Usar as fixtures/mocks locais estabelecidos pela STORY-001; nenhuma credencial, URL ou teste depende do ambiente de produção.
  - [x] Adicionar fixtures explícitas de perfil `admin` ativo, `editor` ativo, `viewer`, inativo e ausente; não usar `collaborator` como valor persistido de fixture.
  - [x] Adicionar testes de store/componentes para os doze cenários de aceite, incluindo login de conta confirmada, ausência de auto-signup/recuperação/Magic Link, perfil inativo, `viewer` bloqueado, resposta tardia após troca de sessão e encerramento de sessão.
  - [x] Confirmar que nenhum teste desta story importa serviço que faça escrita direta remota; se a arquitetura atual impedir a prova, registrar bloqueio para QA em vez de relaxar o mock.
  - [x] Espionar o adaptador legado para provar zero chamadas a pull/push/upload/delete no boot, edição e manipulação de mídia.
  - [x] Executar somente os gates locais comprovadamente isolados e existentes; se `lint` ainda não existir, registrar a ausência como dívida/gate não executado, nunca como sucesso.

- [x] **Task 6 — Documentação e handoff (AC: 12)**
  - [x] Atualizar esta story com checklist, File List real, evidências e quaisquer desvios antes de solicitar QA.
  - [x] Preparar handoff para STORY-005 indicando todos os acessos que continuam dependentes de RLS/RPC/CAS no servidor.


## 6. Notas técnicas para o desenvolvedor

### Estado real a substituir

- A SPA Vite/React parte de `src/main.tsx` e renderiza `App`; no fluxo analisado, `src/App.tsx` inicializa produtos, catálogo e mídia na montagem. A fronteira de sessão deve impedir essa sequência quando a identidade não estiver resolvida. [Fonte: `docs/brownfield-architecture.md` §3]
- `useLibraryStore` inicia `isAdmin: true` permanentemente. É um recurso visual local e deve deixar de ser a fonte de autorização. [Fonte: `docs/brownfield-architecture.md` §4.1]
- A análise não encontrou `signIn`, `getSession` ou `rpc(` no `src/` do commit auditado; não presumir uma integração existente. [Fonte: `docs/brownfield-architecture.md` §1]

### Contrato de identidade canônico — ADR-002

- ADR-002 prevalece sobre ADR-001 somente em identidade e papéis: o contrato persistido é `public.profiles` + enum existente `public.user_role`, não `user_profiles`. `admin` ativo é Administrador; `editor` ativo é apresentado apenas como **Colaborador limitado**; `viewer`, perfil inativo, ausente ou inválido não entram no aplicativo. [Fonte: `docs/adr-002-identity-contract.md` §§ Decisão e Contrato de sessão e bootstrap do cliente]
- **Decisão de produto confirmada em 2026-09-01:** para a primeira versão, usar somente contas internas pré-criadas e já confirmadas pelo Administrador, com login por e-mail+senha. Não implementar auto-signup, confirmação/ativação por e-mail, Magic Link ou reset de senha na SPA; reset permanece operação do Administrador/Supabase. [Fonte: `docs/adr-002-identity-contract.md` §§ Contexto e Ciclo de vida de contas internas]
- Esta story consome o contrato somente em leitura e não cria tabela, enum, trigger, policy ou papel no banco. STORY-005 deve fazer a autorização de servidor e restringir permissões legadas mais amplas de `editor` antes de qualquer escrita remota. [Fonte: `docs/adr-002-identity-contract.md` §§ O que a interface garante e o que exige servidor; Requisitos vinculantes para a Story 005]

### Segurança e produto

- O PRD permite a ambos entrar; permite ao Colaborador consultar a Biblioteca em leitura; e nega a ele criar/editar/aprovar/arquivar produto oficial, alterar mídia oficial e gerenciar acesso. A autorização de servidor é obrigatória. [Fonte: `docs/prd-release-recovery.md` §6]
- A regra de segurança é falhar fechado: a ausência de evidência de papel não concede acesso. Não usar e-mail, localStorage ou flag do navegador como critério de Admin. Isso atende NFR-01 e NFR-03, mas não dispensa a proteção de banco. [Fonte: `docs/prd-release-recovery.md` §§10–11]
- O adaptador atual ainda usa escrita direta e `last writer wins`; nesta transição a SPA deve desligar os caminhos ativos de sync/mutação remota de produtos, catálogos e mídia, inclusive para Admin. Esta story não corrige persistência/conflitos nem libera uso colaborativo. [Fonte: `docs/brownfield-architecture.md` §§4.1–4.4, 5–6; `docs/adr-002-identity-contract.md` § Contrato de sessão e bootstrap do cliente]

### Estrutura e acessibilidade

- A nova entrada deve manter linguagem em português consistente, foco visível e ação de recuperação compreensível para uma pessoa habituada a planilhas. Não usar uma tela decorativa que esconda erro de sessão. [Fonte: `docs/prd-release-recovery.md` §§3, 7 e 11]
- Não introduzir dependência de roteador apenas para este guard; o estado atual usa navegação em memória, e a escolha de roteamento é fora do escopo desta story. [Fonte: `docs/brownfield-architecture.md` §3]

## 7. Plano de testes estritamente isolado

| Área | Casos mínimos | Isolamento obrigatório |
|---|---|---|
| Estado de sessão | login e-mail+senha de conta confirmada; falha de login; sem sessão; sessão restaurada; evento de saída/troca; resposta tardia; erro | mock do cliente Supabase; sem URL/credencial real |
| Fluxos proibidos | não renderiza/aciona auto-signup, confirmação por e-mail, Magic Link ou reset de senha | spies no cliente mockado; nenhuma operação Auth remota |
| Resolução de perfil | `admin` ativo; `editor` ativo; `viewer`; inativo; ausente; papel inválido; erro | fixture em memória para `public.profiles`; sem consulta remota |
| Fronteira da SPA | módulos de dados não montam antes de Auth; estados de loading/erro | spies/mocks das inicializações de stores |
| Biblioteca | Admin vê controles oficiais; Colaborador vê leitura e não aciona ações oficiais | teste de componente/integração local; teclado incluído quando houver ação focável |
| Regressão de privilégio | localStorage/estado antigo não confere Admin | fixture de armazenamento local; sem banco |
| Sync remoto legado | boot, edição e mídia não chamam pull/push/upload/delete legado | spies no `SupabaseService`; sem banco |

Não executar scripts E2E não rastreados nem qualquer teste que possa chamar o projeto Supabase de produção. G4 só terá prova completa depois de testes de políticas/RPC em ambiente isolado na STORY-005. [Fonte: `docs/brownfield-architecture.md` §§1, 5 e 7]

## 8. Riscos, rollback e release

- **Risco crítico — proteção só de UI:** um cliente malicioso ainda pode chamar tabelas enquanto não houver RLS/RPC. **Mitigação:** não liberar, não declarar G4 aprovado e tratar STORY-005 como bloqueadora.
- **Risco crítico — perfil ausente/divergente:** fallback local criaria privilégio indevido. **Mitigação:** tela bloqueada, evidência de erro sem dado sensível e correção de contrato por story de dados/segurança aprovada.
- **Risco alto — regressão de inicialização:** mover a fronteira pode impedir carregamento de módulos ou deixar stores com estado de usuário anterior. **Mitigação:** testes de montagem, limpeza em `SIGNED_OUT`/troca de usuário e revisão manual com mocks.
- **Rollback local:** entregar em branch/PR; se a fronteira impedir acesso ou ocorrer erro de perfil em piloto, reverter a mudança de cliente pelo processo de DevOps. Não usar rollback para restaurar `isAdmin: true`; manter o aplicativo fechado até o contrato correto ser corrigido.
- **Release:** nenhum push, deploy ou alteração de Supabase faz parte desta story. Um eventual deploy só pode ocorrer após revisão QA e gates de DevOps; não habilitar colaboradores até STORY-005 e os demais gates de release aplicáveis.

## 9. Definition of Done

- [ ] Todos os critérios de aceite 1–12 passam em ambiente local isolado, com evidências anexadas à story.
- [ ] Não há `isAdmin: true` nem fallback equivalente que conceda papel pela persistência local.
- [ ] Sessão e perfil bloqueiam a montagem/inicialização de módulos protegidos até resolução determinística.
- [ ] Somente `admin` ativo e `editor` ativo entram; `editor` é apresentado como Colaborador limitado e `viewer`/inativo/ausente falham fechados.
- [ ] Interface de Colaborador impede ações oficiais na camada de apresentação e fornece mensagens compreensíveis para estados bloqueados.
- [ ] Sync automático e mutações diretas remotas legadas estão desligados no caminho ativo, inclusive para Admin; nenhuma escrita remota é reativada antes da STORY-005.
- [ ] O escopo excluído permanece excluído: sem migrations/RLS/RPC/alteração remota, sem convites e sem decisões pendentes implementadas.
- [ ] `npm run typecheck`, a suíte de testes isolada e `npm run build` passam; a inexistência de `npm run lint` permanece registrada como gap, não mascarada.
- [ ] Checklist, Change Log e File List estão atualizados com os arquivos realmente modificados.
- [ ] QA emite parecer **somente sobre a story**, reconhecendo explicitamente que G4/release continuam bloqueados por STORY-005.

## 10. File List inicial (planejada; atualizar durante a implementação)

| Estado | Arquivo | Finalidade |
|---|---|---|
| Criado | `docs/stories/story-004-p0-auth-roles.md` | Esta especificação e evidências da story |
| Provável criação | `src/stores/useAuthStore.ts` | Sessão e papel efetivo derivados do próprio `public.profiles` |
| Provável criação | `src/components/auth/LoginView.tsx` | Entrada interna e-mail+senha e estados fail-closed; sem auto-signup/reset/Magic Link |
| Provável alteração | `src/App.tsx` | Fronteira de Auth antes da inicialização dos módulos protegidos |
| Provável alteração | `src/stores/useLibraryStore.ts` | Remover `isAdmin` local e pull/push automático legado de produtos |
| Provável alteração | `src/stores/useCatalogStore.ts` | Desligar pull/push automático legado de catálogos |
| Provável alteração | `src/stores/useMediaStore.ts` | Desligar pull/push/upload/delete remoto legado de mídia no caminho ativo |
| Provável alteração | `src/components/library/LibraryView.tsx` | Modo de leitura de Colaborador e bloqueio dos controles oficiais mapeados |
| Provável alteração | `src/components/common/MediaGalleryModal.tsx` | Remover/desabilitar fluxo remoto de upload/edição/exclusão de mídia durante a transição |
| Provável alteração | `src/services/supabase.service.ts` | Expor somente integração de sessão/perfil necessária ao cliente e impedir uso ativo dos métodos legados de sync/mutação |
| Provável alteração | `tests/setup.ts` | Completar mock do Auth e do query builder para sessão, perfil e evento de mudança |
| Provável criação | `tests/fixtures/mockAuth.ts` | Fixtures determinísticas de `public.profiles` e sessões Admin/Editor/Viewer/Inativo/Ausente |
| Provável criação | `tests/stores/useAuthStore.test.ts` | Sessão, perfil efetivo, fail-closed e invalidação após troca/saída |
| Provável criação | `tests/components/auth-gate.test.ts` | Fronteira da SPA, LoginView, ausência de fluxos proibidos e Biblioteca por papel |
| Provável alteração | `tests/stores/useLibraryStore.test.ts` | Ausência de `isAdmin` e de sync remoto automático de produtos |
| Provável alteração | `tests/stores/useCatalogStore.test.ts` | Ausência de pull/push remoto automático de catálogos |
| Provável alteração | `tests/stores/useMediaStore.test.ts` | Ausência de pull/push/upload/delete remoto de mídia no caminho ativo |
| Provável alteração | `tests/services/supabase.service.test.ts` | Contrato do adaptador de sessão/perfil e bloqueio do caminho legado |

Não incluir migrations, policies, RPCs, buckets, funções ou arquivos de deploy nesta File List desta story.

### File List real da implementação

| Estado | Arquivo | Finalidade entregue |
|---|---|---|
| Criado | `src/stores/useAuthStore.ts` | Sessão, resolução de `profiles`, papéis e falha fechada |
| Criado | `src/components/auth/LoginView.tsx` | Entrada interna e-mail+senha |
| Criado | `src/services/local-image.service.ts` | Conversão de imagem local sem Storage remoto |
| Criado | `tests/fixtures/mockAuth.ts` | Sessões e perfis determinísticos |
| Criado | `tests/stores/useAuthStore.test.ts` | Sessão, perfil, falha de login e resposta tardia |
| Criado | `tests/components/auth-gate.test.tsx` | Fronteira de Auth e Biblioteca em leitura |
| Alterado | `src/App.tsx` | Guard de Auth antes da carga dos stores |
| Alterado | `src/components/common/{Navbar,BackupModal,MediaGalleryModal}.tsx` | Papel/sair e remoção do fluxo de nuvem legado |
| Alterado | `src/components/editor/PropertiesPanel.tsx` e `src/components/editor/blocks/*` | Uploads de editor exclusivamente locais |
| Alterado | `src/components/library/{LibraryView,ProductDrawer}.tsx` | Controles de Biblioteca por papel e guardas de ação |
| Alterado | `src/services/supabase.service.ts` | Adaptador legado inerte; Auth permanece disponível |
| Alterado | `src/stores/{useCatalogStore,useLibraryStore,useMediaStore}.ts` | Fluxos locais sem pull/push remoto |
| Alterado | `tests/{setup.ts,services/supabase.service.test.ts,stores/useLibraryStore.test.ts}` e `vitest.config.ts` | Isolamento e cobertura de regressão |

## 11. Handoff para QA

QA deve validar os critérios de aceite contra mocks estritos e testar manualmente, em ambiente local, login e-mail+senha de conta confirmada, falha de login, ausência de auto-signup/recuperação/Magic Link, estados sem sessão, `admin` ativo, `editor` ativo apresentado como Colaborador, `viewer` bloqueado, perfil inativo/ausente, troca/saída e sync remoto legado desligado. O parecer deve responder separadamente:

1. a interface falha fechada e não inicia módulos de dados sem identidade?
2. o Colaborador não consegue acionar controles oficiais de Biblioteca pela interface?
3. há qualquer resto de autoridade local persistida?
4. os testes provaram ausência de rede/produção?
5. o caminho ativo fez zero chamadas aos métodos legados de pull/push/upload/delete?
6. o time documentou que nenhuma dessas provas substitui RLS/RPC/CAS na STORY-005?

Se a resposta às perguntas 5 ou 6 não for afirmativa, ou se o contrato de perfil não estiver demonstrável, o parecer deve ser **FAIL/BLOCKED**, sem compensar com sucesso visual.

## 12. Resultado da checklist de draft

| Categoria | Resultado | Observação |
|---|---|---|
| Objetivo e contexto | PASS | valor, fluxo e dependências explícitos |
| Orientação técnica | PASS | fronteira SPA, contrato `profiles/user_role`, sync legado desligado e limites documentados |
| Referências | PASS | referências por seção e resumo crítico no corpo da story |
| Autocontenção | PASS | inclui negativos, decisões pendentes, riscos e rollback |
| Testes | PASS | arquivos de testes/fixtures determinados e matriz de mocks locais incluída |
| CodeRabbit | N/A | aviso literal de integração desabilitada incluído; revisão manual obrigatória |

**Avaliação final:** READY FOR PO VALIDATION. ADR-002 resolve o contrato de perfil/papel e o método de login está confirmado; a implementação só deve parar se a leitura autorizada do contrato ou a disponibilidade de Auth por e-mail+senha divergirem da ADR.

## 13. Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-09-01 | 0.1.0 | Draft inicial de STORY-004-P0 a partir do PRD, arquitetura brownfield e ADR-001 | @sm (River) |
| 2026-09-01 | 0.1.1 | Método do MVP confirmado: contas internas manuais já confirmadas e login por e-mail+senha; excluídos auto-signup, e-mail/Magic Link e reset na SPA | @sm (River) |
| 2026-09-01 | 0.2.0 | Incorpora ADR-002: `public.profiles`/`public.user_role`, `admin`/`editor`, `viewer` bloqueado, sync legado desativado, estrutura AIOX e File List determináveis | @sm (River) |
| 2026-09-01 | 0.2.1 | Validação PO GO: autorizada somente a implementação local da Story 004 sob ADR-002; G4/release permanecem bloqueados por STORY-005 | @po (Pax) |
| 2026-09-01 | 0.3.0 | Implementação local concluída e reenviada para QA: Auth/papéis, caminhos legados removidos do fluxo ativo, helper local de mídia e testes negativos; nenhuma mutação/deploy remoto | @dev (Dex) |

## 14. Dev Agent Record

### Implementação 2026-09-01

- Autenticação interna por e-mail+senha, sessão restaurada e perfil resolvido exclusivamente por `profiles`.
- `admin` e `editor` ativos são os únicos papéis liberados; os demais estados bloqueiam antes dos módulos de dados.
- O estado local de administração foi removido; Biblioteca expõe somente leitura para `editor`.
- Pull/push/upload/delete legados foram removidos dos caminhos ativos. Mídias editadas nesta transição são data URLs locais; não há afirmação de sincronização.
- Validação local em tree final: `npm test` (**13 arquivos, 51 testes**), `npm run typecheck`, `npm run build` e `git diff --check` passaram. Não existe script `npm run lint`; permanece gap explícito. Build mantém avisos conhecidos de `pdfjs-dist`/tamanho de bundle, sem falha.
- Nenhuma migration, RLS, RPC, Storage, conta Auth, dado remoto, push ou deploy foi executado.
- A story permanece **InReview**: o FAIL QA anterior refere-se ao snapshot antes da remoção final dos adaptadores e precisa de re-QA independente. G4/release seguem bloqueados por STORY-005.

## 15. QA Results

### Review Date: 2026-09-01

### Reviewed By: Quinn (Test Architect & Quality Advisor)

**Veredito da Story: FAIL.** A fronteira de Auth implementada é majoritariamente fail-closed: sessão/perfil são resolvidos antes da área protegida, `admin`/`editor` ativo são os únicos papéis aceitos, `isAdmin` local foi removido e produtos/catálogos/mídia deixaram de sincronizar remotamente pelos stores. Os gates locais executados foram: `npm test` (**13 arquivos / 49 testes aprovados**), `npm run typecheck` (**aprovado**) e `npm run build` (**aprovado**, com avisos de chunk e `pdfjs-dist`). Não existe script `npm run lint`; isto permanece um gap, não um sucesso.

O FAIL não decorre de banco, RLS ou deploy — nada remoto foi executado nesta revisão. Ele decorre de critérios desta própria story ainda não atendidos: o fluxo ativo do editor ainda chama `SupabaseService.pushMediaAssetToCloud` em `PropertiesPanel` e continua chamando o adaptador legado de upload em componentes do editor. O adaptador foi transformado em no-op/local, portanto a revisão não identificou tráfego Supabase nesses caminhos, mas AC 10 exige **zero chamadas** a pull/push/upload/delete legados antes da STORY-005. A suíte tampouco demonstra resposta tardia após troca/saída, login inválido, expiração/troca de usuário, ou tentativa de disparar controles oficiais de Colaborador por teclado/modal; por isso AC 11 não está provado.

Também não foi aplicada a transição automática FAIL → InProgress: o Status atual da story é `Approved`, enquanto o protocolo AIOX exige `InReview` antes de @qa alterar o ciclo de vida. O responsável de desenvolvimento deve corrigir o status/checklist/File List/Dev Agent Record quando reenviar a story.

**Limite de release:** G4 e qualquer release continuam bloqueados pela STORY-005. Esta revisão de UI e testes locais não substitui RLS/RPC/CAS, nem autoriza sincronização remota ou colaboração entre dispositivos.

### Gate Status

Gate: FAIL → docs/qa/gates/epic-001.story-004-p0-auth-roles.yml

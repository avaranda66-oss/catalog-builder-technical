# ADR-002: Contrato Canônico de Identidade Interna e Papéis

- **Status:** Proposta para aprovação humana antes da implementação da Story 004.
- **Data:** 2026-09-01
- **Decisor:** @architect (Aria)
- **Escopo:** identidade, sessão e autorização do primeiro piloto interno. Esta ADR não aplica migration, não altera o Supabase e não habilita sincronização.

## Contexto

O piloto será usado pelo pai como **Administrador** e por funcionários como **Colaboradores limitados**. O método de entrada confirmado é **e-mail e senha**, com contas internas pré-criadas administrativamente. Não haverá cadastro público, confirmação por e-mail, Magic Link nem recuperação autônoma de senha no primeiro piloto.

O estado de produção inventariado possui `public.profiles` e ao menos um Administrador ativo. As migrations rastreadas definem o enum `public.user_role` como `admin | editor | viewer`, usam `public.team_role()` para ler `profiles.role` apenas quando `profiles.is_active` é verdadeiro, e provisionam novos usuários inicialmente como `viewer` inativo (`supabase/migrations/00001_initial_schema.sql:9-20`; `supabase/migrations/00004_team_workspace.sql:7-31`). O mesmo contrato já é usado por políticas e RPCs legadas (`00004_team_workspace.sql:114-190`).

Documentos anteriores divergem desse estado: ADR-001 menciona uma tabela inexistente no contrato rastreado (`user_profiles`) e o papel `collaborator`; o cliente atual não possui login e usa `isAdmin: true` somente como estado local (`docs/adr-001-brownfield-architecture.md:34-41`; `src/stores/useLibraryStore.ts:65-84`). Criar outra tabela ou outro enum ampliaria a divergência e não resolveria a autorização no banco.

## Decisão

O contrato persistido canônico será **`public.profiles` + `public.user_role` existente**, sem nova tabela de perfis e sem novo enum. O produto exibirá somente dois papéis:

| Papel apresentado | Valor persistido | Condição para acesso | Escopo confirmado |
|---|---|---|---|
| Administrador | `admin` | `is_active = true` | pode alterar a Biblioteca oficial; administra acesso interno |
| Colaborador limitado | `editor` | `is_active = true` | consulta a Biblioteca e trabalha apenas nos rascunhos/catálogos que lhe forem autorizados; não altera a Biblioteca oficial |

`viewer` **não é um terceiro papel do produto**. É exclusivamente um estado legado de provisionamento seguro: uma conta em `viewer`, ou qualquer perfil inativo, não recebe acesso ao aplicativo até que um Administrador a converta explicitamente para `admin` ou `editor` e a ative. O aplicativo não exibirá, concederá nem criará uma opção “viewer” no piloto.

Esta escolha conserva as identidades e os helpers já presentes e traduz `editor` apenas como o rótulo de produto **Colaborador limitado**. Ela não aceita as permissões mais amplas de `editor` existentes em migrations antigas como política final: a Story 005 deverá restringir RPCs/RLS ao escopo desta ADR antes de reativar qualquer escrita remota.

## Contrato de sessão e bootstrap do cliente

1. O ponto de entrada do aplicativo pede e-mail e senha e chama somente o fluxo de sessão do Supabase Auth; não oferece `signUp`, Magic Link, reset de senha ou confirmação por e-mail.
2. Após uma sessão autenticada, o cliente obtém o próprio perfil canônico em `public.profiles`. A identidade do usuário é `auth.uid()`; o papel efetivo depende de `profiles.role` e `profiles.is_active`, nunca de `localStorage`, Zustand, metadados editáveis no cliente ou de uma flag de interface.
3. O bootstrap aceita somente os pares `(admin, ativo)` e `(editor, ativo)`. Eles são apresentados respectivamente como Administrador e Colaborador limitado.
4. Sem sessão, perfil ausente, perfil inativo, valor de papel inesperado, falha de leitura do perfil ou expiração de sessão, o aplicativo entra em estado **fail-closed**: mostra uma mensagem simples de acesso não liberado ou sessão expirada, não carrega a área de trabalho e não tenta sincronizar, salvar ou reenviar dados locais. O usuário pode sair e tentar entrar novamente; a concessão de acesso continua sendo ação administrativa externa.
5. O cliente deve remover a flag local `isAdmin` e não pode permitir que alterações locais a transformem em uma permissão. Durante a transição, a sincronização automática legada e toda mutação direta para Supabase permanecem desabilitadas, inclusive para Administrador, até a Story 005.

## O que a interface garante e o que exige servidor

| Camada | Garantia nesta decisão | Não pode ser considerada garantia de segurança |
|---|---|---|
| Interface e estado React | Mostra apenas ações pertinentes ao papel efetivo; bloqueia tela de trabalho sem sessão/perfil ativo; exibe estado claro de sessão, carregamento e acesso negado. | Ocultar um botão, proteger rota SPA ou manter papel no Zustand não impede chamadas diretas à API. |
| Supabase Auth + `profiles` | Vincula a sessão a `auth.uid()` e disponibiliza o perfil ativo que o cliente consulta. | Sozinho, não limita escrita nas tabelas legadas nem resolve conflito entre dispositivos. |
| Story 005: RLS/RPC/CAS | Será a autoridade de autorização e integridade: negar anon, validar `auth.uid()` e papel ativo no servidor, limitar Colaborador aos rascunhos autorizados e negar mudança oficial da Biblioteca fora de RPC autorizada. | Não é entregue por esta ADR nem pela Story 004; nenhuma escrita de produção deve ser reativada antes de sua validação. |

## Ciclo de vida de contas internas

1. Um Administrador cria uma conta interna por procedimento administrativo no Supabase, definindo e-mail e senha sem expor a senha ao repositório, chat ou frontend.
2. A conta nasce sem acesso de trabalho: o gatilho/contrato legado a deixa em `viewer` inativo, ou um perfil equivalente inexistente/inativo é tratado como bloqueado.
3. O Administrador conclui a liberação atribuindo somente `admin` ou `editor` e `is_active = true`, por mecanismo administrativo que será validado na Story 005. Esta ação precisa ser auditável.
4. Para suspender acesso, o Administrador desativa o perfil. Suspensão, remoção ou inconsistência de papel invalida o acesso em novo bootstrap e em toda operação protegida no servidor. O cliente não deve tentar preservar privilégio em cache.
5. Alteração de senha e reativação são procedimentos administrativos na primeira liberação. Não haverá recuperação autônoma por e-mail, logo uma conta deve usar e-mail que a organização controla mesmo que não exija confirmação no dia a dia.

## Transição segura do legado

Antes de qualquer migration ou mudança de policy, a Story 004/005 deve inventariar os perfis existentes apenas com acesso administrativo autorizado e produzir um plano de mapeamento revisável. A regra de mapeamento é:

| Estado legado | Resultado de transição |
|---|---|
| `admin` ativo | permanece Administrador, salvo decisão explícita do administrador do projeto. |
| `editor` ativo | é candidato a Colaborador limitado, mas só recebe acesso após confirmação administrativa do vínculo e das permissões de catálogo. |
| `viewer` ou inativo | permanece sem acesso; não é promovido automaticamente. |
| perfil ausente, papel inválido ou duplicidade/inconsistência | sem acesso; exige correção administrativa documentada antes de liberar. |

Não se deve criar `user_profiles`, converter `editor` para um valor que não existe no enum, remover perfis, ativar todos os usuários nem aplicar `00004` às cegas. Migrations e policies atuais são evidência de intenção, não prova de que a produção está alinhada a elas.

## Requisitos vinculantes para a Story 004 — autenticação e papéis

- Usar `public.profiles` e os valores persistidos acima; não adicionar `user_profiles`, `collaborator` persistido ou um terceiro papel de interface.
- Implementar apenas login e sessão de contas internas e-mail+senha; excluir auto-signup, confirmação por e-mail, Magic Link e reset autônomo da UI.
- Não criar usuários automaticamente a partir do navegador.
- Derivar o papel efetivo do perfil ativo pós-sessão; remover `isAdmin: true` e qualquer atalho de autorização local.
- Bloquear a SPA de trabalho e toda tentativa de sync/escrita no bootstrap enquanto a sessão/perfil não atender ao contrato.
- Especificar e testar, com mocks locais, ao menos: sem sessão, sessão expirada, perfil ausente, perfil inativo, `viewer`, `admin` ativo e `editor` ativo.
- Não afirmar que o papel protege o banco enquanto RLS/RPC não estiverem efetivamente aplicadas e validadas na Story 005.

## Requisitos vinculantes para a Story 005 — persistência e autorização no servidor

- Aplicar "default deny" para anônimo e remover do caminho ativo as mutações diretas do navegador somente depois de plano de rollback e autorização.
- Toda RPC de leitura/escrita deve verificar `auth.uid()`, perfil ativo e papel no servidor; a decisão não pode depender da UI.
- Administrador é o único autorizado a alterar a Biblioteca oficial. `editor` pode somente atuar nos rascunhos/catálogos que o servidor reconhecer como autorizados; permissões não confirmadas permanecem negadas.
- Converter ou substituir com migration versionada qualquer comportamento legado que permita a `editor` alterar produtos oficiais, templates, mídias oficiais ou conteúdo de outra pessoa sem autorização explícita.
- Implementar versionamento/CAS e auditoria para escrita remota antes de reativar sincronização entre dispositivos.
- Testar a matriz Admin/Colaborador e tentativas de bypass com um ambiente isolado, sem projeto de produção.

## Consequências e limitações aceitas

- A experiência para o pai continua simples: uma tela de e-mail, senha e Entrar, sem confirmação por e-mail no fluxo diário.
- Contas precisam ser criadas e liberadas administrativamente; isso é deliberado para impedir cadastro não autorizado.
- A Story 004 melhora identificação e UX, mas não é suficiente para colaboração segura enquanto a persistência legada ainda puder escrever diretamente. A liberação colaborativa permanece bloqueada até Story 005 e seus testes.
- ADR-001 permanece um registro histórico de alternativas, mas sua referência a `user_profiles`, `collaborator` persistido e Magic Link não é o contrato a implementar. Esta ADR prevalece exclusivamente para identidade e papéis.

## Aprovação necessária

Esta decisão fixa somente o contrato Admin/Colaborador limitado e a transição segura. Após aprovação humana, o Product Owner e Scrum Master podem ajustar a Story 004 para este contrato. A implementação de banco, policies, RPCs, criação de usuários e deploy exige a Story 005, backup/rollback e autorização específica.

```yaml
step_output:
  artifact: docs/adr-002-identity-contract.md
  status: proposed_for_human_approval
  decision:
    persisted_identity: public.profiles plus existing public.user_role
    product_roles:
      administrator: admin
      limited_collaborator: editor
    legacy_viewer: inactive_and_denied_until_explicit_admin_activation
    login: internal_email_password_only
  story_004_constraints:
    - no_public_signup_or_email_confirmation_ui
    - derive_role_from_active_profile_after_session
    - fail_closed_and_disable_legacy_sync
  story_005_constraints:
    - server_enforced_rls_rpc_and_cas_before_remote_writes
    - administrator_only_for_official_library
  remote_mutations_performed: false
  approval_required: true
```

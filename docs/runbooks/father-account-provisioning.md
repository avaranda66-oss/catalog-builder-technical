# Catalog Builder — conta operacional PRESYS

Referência: 2026-10-07. Projeto Supabase de produção: `bjxqvrpbigwgabwbhtqa`. O owner confirmou login normal nesta rodada; isso não identifica sozinho a conta do Father ou comprova um piloto sem ajuda. Não copie credenciais ou sessão do navegador.

## Provisionar ou verificar uma conta

1. O responsável identifica diretamente a pessoa e o UUID Auth no painel Supabase. Se necessário, usa o fluxo normal de convite/reset do projeto para criar acesso. A pessoa recebe/define a senha fora do chat. Não crie uma conta fictícia para representar o Father.
2. Confirme que `public.profiles.id` corresponde ao mesmo `auth.users.id`. O trigger `provision_team_profile` cria um novo profile como viewer inativo; criação no Auth por si só não libera o workspace.
3. Para operação de catálogo, conceda `editor` com `is_active=true`. Conceda `admin` somente se gestão administrativa for parte do papel da pessoa. A RPC existente `set_team_member_role(p_user_id,p_role)` exige uma sessão de outro admin ativo e impede alterar o próprio role.
4. Se o responsável usa SQL Editor owner em vez de sessão admin da aplicação, confira o UUID individual e execute uma alteração transacional estreita. Não rode update por nome parcial, email genérico ou lista inteira. Não altere todos os usuários.
5. A pessoa faz login normal no domínio público e abre Library. Confirme visualmente que pode criar, editar e salvar, e que reopen/refresh retêm a edição. Não use service role como sessão da pessoa.

Exemplo owner-only para uma identidade já existente, com UUID a substituir conscientemente; não executar como está:

```sql
BEGIN;
DO $$
DECLARE target_user uuid := '<UUID_AUTH_VERIFICADO>'::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user) THEN
    RAISE EXCEPTION 'Identidade Auth não encontrada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user) THEN
    RAISE EXCEPTION 'Profile ausente: investigar trigger/provisionamento antes de conceder acesso';
  END IF;
  UPDATE public.profiles SET role = 'editor', is_active = true WHERE id = target_user;
END $$;
SELECT id, role, is_active FROM public.profiles WHERE id = '<UUID_AUTH_VERIFICADO>'::uuid;
COMMIT;
```

O readback necessário contém somente UUID/role/active, sem email, senha ou metadata pessoal. Guarde a associação pessoa↔UUID em local operacional privado do responsável; a evidência pública da release pode registrar apenas que a identidade correspondente foi verificada e qual autoridade estava ativa.

## Suspensão, mudança e diagnóstico

Para suspender, o owner deve alterar somente o profile escolhido para `is_active=false` e confirmar readback; não delete a pessoa ou seus catálogos para revogar acesso. A função server `team_role()` retorna NULL para inativo/profile ausente. Novas operações devem ser negadas; o smoke deve incluir refresh/reentrada, pois uma aba antiga pode ainda exibir estado anterior durante a revalidação.

Ao trocar admin/editor/viewer, registre quem autorizou e revalide acesso server. Não deduza autoridade por badge antigo da UI. A candidata corrige respostas de profile atrasadas após account change/logout; os quatro testes de auth reproduzem transições, e o smoke pós-deploy deve observar o mesmo contrato com contas normais de teste, sem guardar tokens.

Se o login é aceito mas Library não abre, confira projeto/domínio correto, profile correspondente, `is_active`, role e `team_role()`. Sessão inválida/expirada exige novo login normal; profile inativo/ausente exige ação do administrador. Não peça senha ao usuário e não desative RLS/JWT para contornar o erro.

## Piloto humano

Depois dos gates e do smoke pós-deploy, a pessoa real percorre login→Library→create→text/table/image→save/reopen→translation/review→publication/PDF sem receber instruções de clique do agente. Registre tarefas, tempo, hesitação, intervenção e resultado; uma intervenção invalida o trecho como prova sem ajuda até o reteste. Use cópia técnica de teste e teto de custo declarado para tradução. A conta admin/editor usada na aceitação de engenharia não substitui esse piloto.

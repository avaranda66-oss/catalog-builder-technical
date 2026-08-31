# Banco corporativo

O cliente usa Supabase Auth com e-mail e senha individuais. Uma entrada no navegador não concede permissão no banco. Novas contas recebem perfil `viewer` **inativo**, mesmo quando o cadastro público estiver habilitado no provedor. Um administrador da empresa precisa ativá-las explicitamente.

## Implantação

1. Faça backup de `catalogs`, `products`, `field_definitions`, `profiles`, `assets`, histórico e configuração de Storage antes de migrar.
2. Para uma instalação nova, execute `migrations/00001` a `00004` em ordem. Para uma instalação existente, execute somente as migrations ainda não aplicadas.
3. Antes de confirmar `00004`, ensaie a migration sem seu `COMMIT` final, seguida de `tests/workspace_security.sql`. O `ROLLBACK` final remove todas as fixtures e desfaz o ensaio inteiro.
4. Aplique a migration somente depois que o ensaio terminar sem falhas; implante o cliente atualizado junto com ela. O cliente anterior não tem sessão autenticada nem usa as novas transações.
5. Convide a primeira conta pelo painel administrativo do Supabase. Em uma sessão SQL confiável, confira o UUID e o e-mail em `auth.users`; atualize **somente esse UUID** em `profiles`, atribuindo `role='admin'` e `is_active=true`. Não existe primeiro usuário administrador automático.
6. Outros administradores podem ativar e atribuir papéis pela RPC `set_team_member_role`. A conta em questão deve existir em Auth. A RPC não permite promover ou alterar a própria conta. Para suspender uma conta, um operador autorizado deve definir `is_active=false` via SQL confiável.

### Estado da instalação Catalogpresys (31/08/2026)

A migration `00004_team_workspace` já foi ensaiada com rollback e aplicada no projeto remoto. O backup lógico foi salvo localmente em `.local-backups/` (fora do Git), com os registros de catálogo, produtos, definições, templates e 64 eventos de auditoria. O primeiro convite foi enviado pelo Auth e o perfil correspondente está `admin`/`is_active=true`; a pessoa deve concluir o convite e definir a própria senha pelo e-mail recebido.

Nenhuma chave `service_role` deve entrar em variável `NEXT_PUBLIC_*`, navegador ou logs. O aplicativo utiliza a chave pública e o token individual; as regras do banco validam cada operação.

## Preservação do legado

`00004` mantém os registros de produto, importa os produtos que antes estavam em `catalogs.brand.products` e cria `catalog_products` para reutilização. Se o mesmo UUID tiver conteúdo divergente, as duas versões são preservadas como registros distintos. Se houver conflito de SKU no catálogo de origem, a importação recebe um sufixo `LEGACY`; essas duplicatas precisam de revisão humana, sem fusão automática. O campo `legacy_id` conserva a identidade anterior.

O payload `brand` original não é apagado durante a migração. O primeiro salvamento moderno remove a coleção duplicada do estado corrente; o trigger de auditoria preserva a imagem anterior. Consulte também o backup externo. Remover um produto de um documento exclui apenas a associação: o cadastro mestre e seus outros vínculos permanecem.

## Revisões e publicação

Gravações de catálogo e produtos passam por `save_catalog_workspace`, em uma única transação. A versão do documento e a versão de cada produto alterado são conferidas no banco; conflito usa SQLSTATE `40001`. Não habilite gravação direta nas tabelas para contornar conflitos.

As revisões ficam em `catalog_versions`, somente leitura para os usuários, com autoria derivada de `auth.uid()`. O fluxo é `draft → review → approved → published`. A aprovação exige administrador diferente do autor do conteúdo e dos produtos, sem alterações simultâneas. A publicação exige revisão aprovada; mudanças em produtos compartilhados invalidam a tentativa de publicar a revisão antiga. Edições em conteúdo aprovado/publicado retornam o documento a rascunho. Restaurar conteúdo antigo deve gerar uma revisão nova, nunca substituir um snapshot histórico.

Os estados `published` legados não ganham retroativamente uma revisão aprovada: só novos snapshots originados desse fluxo possuem essa garantia. As regras de revisão não substituem validação e análise técnica dos dados elétricos.

## Mídia e acesso

`catalog-images` é privado, aceita JPEG/PNG/WebP até 8 MB e exige usuário ativo. URLs assinadas duram uma hora; a aplicação renova os links no carregamento e antes de exportar. O banco persiste referências `storage://catalog-images/...`, sem tokens temporários. Policies restritivas protegem o bucket mesmo se houver policies permissivas antigas; outros buckets não são alterados.

O modelo atende uma empresa: usuários ativos consultam a biblioteca completa; editores alteram documentos; administradores aprovam e publicam. Isolamento entre departamentos ou empresas exigiria vínculos e policies adicionais.

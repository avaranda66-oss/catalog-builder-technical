# Minha chave de IA (uma chave por usuário)

## Para o usuário

1. Abra [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e entre com sua conta Google.
2. Clique em **Criar chave de API** e copie o código.
3. No aplicativo, volte à tela **Meus catálogos**, clique em **Minha conta** e depois em **Minha chave de IA**.
4. Cole o código (o botão **Mostrar chave** deixa conferir), clique em **Salvar chave** e depois em **Testar**.
5. Se a IA disser que está ocupada várias vezes seguidas, a cota diária da sua chave pode ter acabado; confira no Google AI Studio.

## Como funciona

- Cada pessoa cadastra a **sua** chave do Gemini em **Meus catálogos → Minha conta → Minha chave de IA**
  (ou pelo atalho "Cadastrar minha chave de IA" no menu ⚙ do assistente).
- A chave vai uma única vez para o servidor (RPC `vnext_ai_key_save_v1`) e fica **criptografada no Supabase Vault**.
  A tabela `vnext_user_ai_keys` guarda só o id do segredo, os 4 últimos caracteres e o resultado do último teste.
- A tela mostra apenas `Chave de IA (Gemini) cadastrada, termina em 1234. Funcionando.` (ou recusada/ainda não testada). A chave nunca volta ao navegador.
- RLS: cada pessoa só vê a própria linha (sem `secret_id`). Ninguém, nem admin, lê a chave de outra pessoa.
  Ler o segredo em texto (`vnext_ai_key_secret_for_v1`) é permitido **só** ao `service_role`, dentro das funções Edge.
- Apagar a linha (Remover, ou a exclusão da conta em `auth.users` via CASCADE) apaga também o segredo do Vault
  (gatilho `vnext_user_ai_keys_drop_secret`): nenhuma chave fica órfã.
- Falha ao ler o Vault responde `PROVIDER_UNAVAILABLE` (503, temporário), nunca `USER_AI_KEY_MISSING`.
  Só a resposta do servidor marca a aba como "sem chave" (a tabela sozinha não sabe se `VNEXT_AI_SERVER_KEY_FALLBACK` está ligado).
- Na tradução, chave própria recusada pelo Google responde `PROVIDER_REJECTED_KEY` (orienta a trocar em Minha conta).
- As funções `vnext-catalog-draft`, `vnext-catalog-composer` e `vnext-translation-provider` usam **só a chave de quem chamou**.
  Sem chave: respondem `USER_AI_KEY_MISSING` sem chamar o Google; o app mostra "Cadastre sua chave de IA em Minha conta."
  e, quando já sabe que falta a chave, nem chega a chamar a função.
- **Testar**: `vnext-catalog-composer` com `{ "version": 1, "task": "test_user_key" }` lista 1 modelo do Google
  (chamada gratuita, sem gerar texto) e grava ok/erro.
- O modo antigo "chave nesta aba" saiu: chave no corpo do pedido agora é recusada (`INVALID_REQUEST`).
- O segredo `GEMINI_API_KEY` (e os específicos `VNEXT_*_GEMINI_API_KEY`) **não é mais usado pelas pessoas**.
  Para reativá-lo como reserva para quem não tem chave: `VNEXT_AI_SERVER_KEY_FALLBACK=true` (desligado por padrão).

## O que publicar (nesta ordem, só quando o Gabriel aprovar)

1. Migração: `supabase/migrations/00032_vnext_user_ai_key.sql` (`supabase db push`). Requer a extensão `supabase_vault` (já vem no Supabase).
2. Deploy das 3 funções: `supabase functions deploy vnext-catalog-draft vnext-catalog-composer vnext-translation-provider`.
   `SUPABASE_SERVICE_ROLE_KEY` já existe nas funções Edge; não é preciso criar segredo novo.
3. Publicar o app (front-end).
4. Avisar a equipe: cada pessoa cadastra a própria chave em Minha conta e clica em "Testar".

Ordem importa: com o app novo e a migração ausente, o status da chave fica "desconhecido" e o servidor decide;
com as funções novas antes da migração, ninguém tem chave e a IA pede o cadastro.

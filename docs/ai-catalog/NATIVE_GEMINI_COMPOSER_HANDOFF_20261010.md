# PRESYS Catalog Builder VNext — Criar catálogos conversando com Gemini

Data: 2026-10-10. **Estado: implementação incremental em PR draft, sem liberação ao Marc.**

## Produto desejado
No editor `/v2`, o agente será a entrada principal do trabalho. O operador poderá começar de uma página em branco, conversar por várias rodadas, apresentar material de referência, receber páginas e tabelas nativas editáveis em tempo real, solicitar revisões de seções ou tabelas específicas e produzir PDF com o motor oficial, nunca como captura HTML improvisada.

## O que esta etapa efetivamente implementa
- Alternância de abas: **Criar com Gemini** (principal) e **Ferramentas** (comandos nativos reversíveis existentes).
- Cadastro de chave de provedor por dispositivo no cofre já existente. Apenas Gemini tem adaptador de criação nesta etapa, embora o cofre admita também outros provedores. A chave deve ser desbloqueada pela pessoa no navegador; não entra no histórico nem em arquivos PDF.
- Solicitação conversacional estruturada `compose_scaffold` (até oito turnos anteriores e metadados mínimos de documento). A resposta é uma proposta de até quatro páginas por solicitação, com capa, seção editorial e/ou esqueleto de tabela comparativa (2–6 colunas, até 12 características, até 156 células na proposta).
- O aplicativo mostra a proposta, exige confirmação, preflight em sessão isolada e só então executa comandos oficiais `page.add` e `object.insert` em transação reversível. Propostas antigas, malformadas ou executáveis são bloqueadas. O fluxo pode ser repetido ao longo de uma conversa.
- Todas as **células de valores técnicos** criadas pela IA ficam vazias; nenhum texto arbitrário de modelo vira exatidão, faixa ou certificação. Revisão de fontes PDF, imagens, tabelas densas e autorização de valores dependem de outras etapas.
- Novo endpoint experimental Supabase `vnext-catalog-composer`: autenticação JWT e papel editor/admin, CORS por origem permitida, limites estritos de payload e tokens, reserva atômica de orçamento via RPC existente, chamada Google via backend, resposta JSON validada, sem logs de credenciais. Bloqueado por padrão.

## Evidências até agora
- 8 testes focados dos contratos / fluxo de composição aprovados, além de regressões do editor e navegador Chromium.
- Prova Chromium do editor A4 + diálogo + cadastro temporário de chave **FALSA** + confirmação + inserção real de páginas nativas. Isso **não** equivale a chamada Gemini real.
- PR #81 é a base anterior de UI, com CI aguardando novo HEAD exato; PR de composição deve ser aberta como branch dependente e não fundida antes da base.

## O que ainda NÃO existe
- Extração automática confiável de especificações de PDFs PRESYS e evidência por célula no aplicativo.
- Modelos de tabela densos arbitrários, células mescladas e paginação automática geral por conversas livres.
- Geração/remoção de fundo/edição de fotos pelo Gemini e reprodução fiel de referências visuais.
- Modificações gerais de páginas existentes via IA: atualmente o endpoint só **acrescenta** rascunhos estruturais; ferramentas reversíveis do editor são outra aba.
- Persistência em nuvem da conversa, testes humanos reais com Marc, custo/latência reais para novo endpoint.
- Deploy/ativação da nova Supabase Edge Function. Chave desbloqueada no browser não comprova serviço disponível.

## Gates para ativar chamadas reais
1. Revisar código de Supabase Function e migração RPC de reserva cumulativa; sem contornar a checagem de papel/autenticação/origem.
2. Subir função em ambiente de acceptance com `VNEXT_CATALOG_COMPOSER_ENABLED=true`, `VNEXT_CATALOG_AGENT_BUDGET_MODE=bounded-acceptance`, allowlist de origens e `VNEXT_CATALOG_AGENT_BYOK_ENABLED=true`. Respeitar teto financeiro aprovado anteriormente, conservar recibos de uso, **não registrar segredos**.
3. Rodar pedido real com Gemini: registrar input, resposta estruturada completa (sem credencial), latência, custo, turnos, páginas, valores vazios, histórico e PDF assinado pelo motor oficial; reproduzir no mesmo HEAD.
4. Validar salvamento CAS, reabertura no catálogo real, conflito entre abas, limite de mensagens, acessibilidade e fluxo humano sem instrução.
5. Só depois considerar merge para main e uso cotidiano; o aceite técnico deve distinguir scaffold editorial de catálogo técnico com dados verificados.

O sucesso dos mocks e da versão prévia não autoriza chamá-lo de **agente totalmente autônomo**.

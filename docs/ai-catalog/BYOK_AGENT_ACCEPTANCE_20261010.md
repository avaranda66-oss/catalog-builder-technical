# Catalog Builder — Agente BYOK, conversa e PDF: evidências limitadas
Data: 2026-10-10 (Brasil). Este documento é um registro técnico, **não uma aprovação de produção**.

## Objetivo real de uso
Uma pessoa não técnica descreve em português um catálogo a partir de materiais de origem, revisa proposta, valores, tabelas, títulos, imagens, publica e recebe PDF editável/reutilizável, com histórico fiel de diálogos, comandos, fonte e saída.

## Implementado neste incremento (branch audit/agent-proposal-boundary-20261009)
- Cofre local existente: chave própria Gemini/OpenAI/Anthropic criptografada no navegador; desbloqueio por senha, bloqueio e remoção sem persistir valor plaintext.
- Conector BYOK limitado ao Gemini, transporta a credencial desbloqueada apenas durante ação explícita ao gateway Supabase autenticado. Nenhum envio direto navegador→Google.
- Composição root injecta dependência Supabase; código VNext não importa serviços legados. Modo server-key legada permanece explicitamente opt-in.
- Contrato Edge Deno proposto exige flag de serviço e BYOK, token JWT, papel admin/editor ativo, validação de payload/locale e plano, CORS, limites countTokens e configuração estática de modelo.
- Migração SQL **DRAFT NÃO APLICADA** com reserva atômica por auth.uid e dia UTC: US$0,10/dia, até 25 reservas, sem reembolso após falha. O Edge reserva o pior caso US$0,00488 ANTES da primeira requisição Google; falha da RPC bloqueia quaisquer chamadas.
- Desativação de proposta obsoleta ao mudar fonte, gateway ou texto do pedido; aprovação humana explícita obrigatória.
- Exportação de histórico JSON: mensagens e datas, contagem user/assistant, IDs/hashes da fonte, plano aprovado, sanitização de padrões de tokens. Não alega transcrição do provedor assinada nem hash de PDF na interface.

## Prova de navegador concluída — modelo SIMULADO (não Gemini)
Script: `node tests/vnext/proof/byok-agent-conversation-browser-proof.mjs`.
- Cofre: cadastrar senha/chave falsas, desbloquear, solicitar proposta 1 vez ao endpoint HTTPS interceptado por Playwright, sem rede Google.
- Entrada: ficha técnica inteiramente SINTÉTICA (duas seções/3 modelos, fonte com falta e conflito).
- Conversa: 1 mensagem do operador e 1 resposta simulada; aprovação da mudança de ordem de seções.
- Ações humanas: reconhecer informação não informada, selecionar revisão correta (±0,0130), aprovar, salvar, revisar READY, publicar, reabrir após F5.
- Saída física: PDF real do Chromium com 2 páginas A4. SHA256 `8b304e0dbcdb9771e6081f8d3582a3cf56e0ccc578a2b7d813b6957e16c72f5f` (32528 bytes). Nenhuma chamada real Gemini ou escrita cloud.
- Arquivos em `scratch/byok-agent-conversation-proof/`: PDF, `dialogue-receipt.json`, `conversation-to-pdf-receipt.json`, `result.json`, capturas do catálogo e do reopen. Em CI, artefato BYOK da HEAD exata.
- Testes locais: `tests/vnext/ai-catalog/agent-edge-bounded.test.ts` (6), `byok-catalog-gateway.test.ts` (4), `agent-proposal-lifecycle.test.tsx` (5), `conversation-evidence.test.ts` (3). Mais suíte arquitetural VNext (18).

## Bloqueios para uso autônomo PRESYS
1. O modelo efetivamente responde apenas por **planejamento da estrutura**, não edita livremente objetos, imagens, tabelas complexas, fontes ou publica sozinho.
2. PDFs reais podem ser indexados com hash/texto por página, mas não existe extração confiável multimodal de tabelas densas, desenhos, valores por célula e evidência visual. O catálogo sintético não comprova materiais reais PRESYS.
3. A persistência do protótipo é localStorage, **não** a Library compartilhada/cloud autenticada, com isolamento por equipe/usuário.
4. O gateway/SQL estão DESABILITADOS/NÃO PUBLICADOS. Custos e isolamento entre tenants exigem revisão independente e testes em preview real. Envio transitório de chave BYOK através da API do app tem superfície XSS e precisa de CSP, auditoria de logs e tratamento de requisições.
5. OpenAI e Anthropic: somente registro de chaves no cofre, **nenhum adaptador real** testado; nunca mostrar status como disponíveis.
6. Faltam imagens de produto com direitos/proveniência, tratamento de fontes e tabelas longas, revisão editorial comparável a catálogos institucionais profissionais, controles de cópia/consentimento de PDF de terceiros.
7. Faltam testes humanos SEM AJUDA com Marc, evidência de número real de mensagens até PDF aceitável, screenshots, PDF aprovado pelo dono e regressões em Windows/Chrome/Edge e Linux.
8. Não há prova de que a chave publicada no chat funcionaria; não copiar credenciais de conversas para comandos. O operador deve usar a interface autenticada em ambiente autorizadamente habilitado. Recomendada revogação após testes.

## Gate seguinte seguro
- Exigir CI da HEAD exata no branch isolado; as PRs #71/#72 ainda têm ancestral antigo da #70. Não fazer merge ou alterar deploy/secret/migration para corrigir isso.
- Auditoria SQL/CSP/RLS/tenant e revisão de custo real/contabilidade cumulativa; habilitar em preview controlado, explicitamente autorizado.
- Chave temporária inserida PELO DONO no cofre do navegador, em preview seguro: no máximo 1 planejamento Gemini real, contar chamadas reais/tokens/erros. Proibir retries silenciosos e capturar prova sanitizada.
- Ingestão de PDF técnico real com revisão humana por campo (arquivo SHA, página, bounding box e célula), direitos confirmados.
- Rodadas de 2/10/27/40+ páginas com fotos, diagramas e tabelas densas, mais preservação de célula e PDF visual. Relatório input+mensagens+ações+PDF SHA sem armazenar chave.
- Só após testes de papéis/autenticação/cloud/falhas/recovery/backup e piloto Marc não orientado, classificar READY FOR PRESYS EMPLOYEE USE.

## Critério de aceite
Não afirmar 100% de certeza; declarar um teste específico PASS apenas quando houver entrada/oráculo, saída real e recibo reproduzível. A decisão de liberação exige risco residual, falhas conhecidas, plano de recuperação e aprovação humana.

## Continuação de 2026-10-10 — estudo real de seis PDFs e protótipo de workbench
- Corpus REAL inspecionado FORA do aplicativo: seis PDFs do proprietário, 85 páginas no total. Conteúdo inclui manual PRESYS de 41p, folder PRESYS de 20p, Isotech de 4p, Fluke de 6p, Additel 761A de 6p, Additel 875 de 8p. Não adicionar os bytes dos arquivos de terceiros a este repositório.
- O Additel 761A página 3 exige coluna por seis variantes; houve bloqueio do esquema anterior de até quatro. Entrada expandida a seis modelos; compilador físico divide tabelas 5–6 modelos em painéis balanceados (3+2 ou 3+3), sem reduzir fonte ou misturar colunas, com trilha de integridade preservada.
- Novo teste local `six-model-partition.test.ts` confere 84 posições, duas páginas por seção, rejeição de dados alterados e prova de aprovação bloqueada por conflitos.
- Nova prova Chromium `six-model-comparison-browser-proof.mjs` passa: 4 páginas A4 para 6 variantes sintéticas, 84 valores preservados, PDF SHA256 `932feca7831fdc75613340588c12325c84e432b138ae7f53e91ba11bd806cb3f`, nenhuma chamada Gemini. PDF e PNG em `scratch/six-model-a4-proof/`.
- `CatalogWorkbenchChat.tsx`: painel de chat lateral conectado ao DocumentSession, compactação, desfazer/refazer, abrir editor ou revisão do PDF, mensagens por documento localStorage, export JSON, limite explícito 500 mensagens, nenhum truncamento silencioso. Upload de até quatro imagens PNG/JPEG/WebP para consulta visual temporária (NÃO processadas pelo provedor).
- Prova ampliada `byok-agent-conversation-browser-proof.mjs`: após plano simulado, 31 mensagens de revisão, 1 foto referencial, PDF A4 e reabertura em navegador. IA real NÃO testada.
- Ingestão de PDFs ampliada de cinco para seis, sem ampliar a capacidade factual automática. PDFs reais enviados ao modelo, imagens de produto, remoção de fundo, transformação visual e equivalência a referências NÃO foram implementados. A UI não deve afirmar suporte já funcional.
- Fix herdado da PR70 (larguras da tabela quatro-modelos) incluído no branch de integração para garantir aprovação física em CI.

### Limitação explícita quanto a Vercel
O branch novo contém código experimental com flags desabilitadas. Não habilitar chamadas externas, funções de IA, uploads automáticos dos PDFs do cliente, migrações ou segredos sem validação/auth/quota e QA de preview.
Merges de PRs draft em pilha devem respeitar árvore de dependências; preferir consolidação de PR única revisada em main, com HEAD exato e CI atualizado. Marc ainda não fez piloto humano sem assistência.

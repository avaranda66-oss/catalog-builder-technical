# Catalog Builder — operação e release Father-ready

Data de referência: 2026-10-07, America/Sao_Paulo. Responsável técnico: @devops / @data-engineer. Story: `docs/stories/2026-10-07-father-ready-finalization.md`.

Este documento descreve a sequência de release. Ele não confirma deploy ou encerramento da falha em produção. Consulte o packet de autorização e os recibos em `08-release` e `06-production` da pasta de evidências antes de agir.

## Ambientes e autoridade

| Ambiente | Identidade | Uso |
| --- | --- | --- |
| Local controlado | branch `release/father-ready-finalization` | Regressões, falhas induzidas, datasets, browser e PDFs locais |
| Preview | Deploy da mesma head do PR, quando disponível | Smoke da candidata; não equivale a produção |
| Produção pública | `https://catalog-builder-technical.vercel.app/v2` | Conta PRESYS real e persistência/serviços reais |
| Supabase produção | `bjxqvrpbigwgabwbhtqa`, Catalogpresys / presyscatalog | Banco, Storage e `vnext-translation-provider` |

O main conhecido no preflight é `a183d67407058545102aaf06efcd7af28cbeb2e7`. Reconsulte GitHub live antes da release. Não suponha que o SHA continue atual. A aplicação deste repositório é Vite/React; as instruções históricas Next.js não determinam o deploy atual.

O humano autorizou preparação, commit, push, PR e CI. Merge em main exige autorização explícita nesta rodada. Não habilite auto-merge. Só @devops executa push/PR. Não faça deploy casual de código não mergeado em produção. Essas fronteiras derivam das seções 13–14 do pedido de retomada.

## Packet antes do merge

Registre URL do único PR final, head completa, base main completa, estado OPEN, MERGEABLE, CI da head exata, auditoria independente e CodeRabbit. Lint, typecheck, full suite, build, proofs Chromium/PDF/P2 e os dois novos proofs Father devem passar. Um commit posterior invalida o recibo da head anterior.

```powershell
git status --short
git diff --check
git rev-parse HEAD
gh pr view <NUMERO_DO_PR> --repo avaranda66-oss/catalog-builder-technical --json url,state,isDraft,mergeable,headRefOid,baseRefOid,statusCheckRollup
```

O relatório deve distinguir problemas corrigidos na candidata de falhas ainda presentes no deploy público. A falha P0 de escrita anônima em `product-images` permanece aberta até aplicar 00026, obter readback e provar os caminhos autorizados.

## Depois de autorização explícita

1. Revalide a head autorizada, MERGEABLE e CI antes de merge. Anote o SHA resultante de main.
2. Aguarde CI de main e o deploy Vercel ligado àquele SHA. Anote deployment ID, URL imutável e alias público. Login da Vercel retornando HTTP 200 não prova a aplicação. Compare fingerprint do bundle público e metadata do deploy.
3. Preserve snapshot das policies e o source anterior da Edge Function. Confirme backup/recovery do projeto no painel do responsável. Não rode varredura de migrations pendentes sem conferir o ledger e seu escopo.
4. Aplique somente `supabase/migrations/00026_product_image_write_authority.sql`, em sua transação, pelo owner legítimo do projeto. Não muda bucket, objeto, SELECT público ou outro RPC/policy. Registre recibo sem dados sensíveis. Se o processo usa ledger Supabase, registre 00026 conforme a disciplina existente e confira que a próxima execução não reaplique migrações históricas.
5. Faça deploy direcionado somente de `vnext-translation-provider` a partir do commit mergeado. Inclua sua dependência local `src/vnext/translation/language-registry.ts`. Preserve JWT verification ON e os segredos existentes.
6. Leia novamente policies, source completo da função e dependência; compare SHA256 normalizado LF com o commit exato. Verifique JWT ON, OPTIONS/CORS do domínio público e rejeição do POST sem sessão.
7. Faça smoke autorizado no domínio público: login, Library, create/edit/save/reopen/refresh, text/table/image, navegação com dirty edit e translation/review/copy/publication/PDF. Preserve os IDs próprios de teste e original. Depois conduza o piloto humano sem orientação.

O CLI Supabase não estava instalado/autenticado no preflight; há sessão owner legítima no painel. Quando o CLI estiver provisionado por login normal, o comando direcionado é:

```powershell
supabase functions deploy vnext-translation-provider --project-ref bjxqvrpbigwgabwbhtqa --use-api
```

Não acrescente `--no-verify-jwt` ou `--prune`. O deploy de uma função e `--use-api` são documentados na [referência oficial Supabase](https://supabase.com/docs/reference/cli/supabase-functions-deploy). O owner pode usar o editor de função do painel se preservar todos os arquivos exatos, incluindo a dependência local; um paste isolado de `index.ts` não basta.

## Verificação Storage somente leitura

Execute no SQL Editor owner do projeto correto antes e depois. Preserve ambos os resultados na evidência da release.

```sql
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('product-images', 'product-assets', 'catalog-images')
ORDER BY id;

SELECT pg_get_functiondef('public.team_role()'::regprocedure);
```

Esperado: `Upload imagens` INSERT e `Update imagens` UPDATE TO authenticated, bucket `product-images`, `auth.uid() IS NOT NULL` e `team_role() IN ('admin','editor')`; UPDATE deve possuir USING e WITH CHECK. `team_role()` deve considerar `is_active`. `Imagens publicas` SELECT permanece igual. Compare todas as outras policies/buckets com o snapshot. Policies permissivas se combinam com OR: revise qualquer policy INSERT/UPDATE/ALL adicional capaz de permitir `product-images`, não apenas os dois nomes conhecidos.

A prova PostgreSQL descartável carrega as 14 policies live e testa anônimo, sessão sem subject, viewer, editor inativo, profile ausente, editor ativo e admin ativo. INSERT/UPDATE devem ser negados nos cinco primeiros e permitidos nos dois últimos; DELETE permanece negado nos sete. Isto não substitui smoke Storage API em produção. Faça os testes de API com uma chave de objeto descartável identificada; nunca sobrescreva imagem existente para testar negação. A limpeza deve seguir a autoridade de owner do Storage, pois 00026 não concede DELETE.

O VNext envia imagens a `product-assets` em caminhos `vnext/...`, com upload `upsert:false`, finalização autoritativa e signed URL. A função legacy `uploadProductImage` atual converte localmente e não escreve em `product-images`. Preserve leitura de URLs históricas. 00026 não impõe path por usuário ao bucket compartilhado legacy porque não há esse contrato; exige a mesma autoridade editorial ativa da aplicação.

### Smoke Storage API após aplicar 00026

Use clientes com a chave pública e sessões normais das contas de teste; o cliente de teste anônimo fica sem sessão. Não use service role para provar RLS. Reserve uma chave nova como `father-ready-smoke/<ID_DA_RELEASE>/authority.png`, valide que não existe antes e use uma imagem pequena própria. Registre apenas timestamp, identidade funcional, operação, resultado e hash do objeto; não registre headers/tokens.

| Identidade / operação | Resultado esperado |
| --- | --- |
| Editor ativo e admin ativo: upload novo (`upsert:false`) e update do próprio objeto descartável | Upload/update funcionam; bytes/hash correspondem à imagem esperada |
| Anônimo: upload para outra chave nova, update/overwrite e remove do objeto descartável | Nenhuma criação, alteração ou remoção; confira estado/hash por leitura após cada tentativa |
| Sessão sem subject, viewer, editor inativo e profile ausente: upload/update | Nenhuma mutação; confirme também resposta da API e estado do objeto |
| Todas as sete identidades: remove | DELETE segue negado; esta migration não concede limpeza ao usuário |
| Sem sessão: leitura de imagem pública histórica e da fixture autorizada | Conteúdo continua acessível; URLs anteriores permanecem válidas |
| Editor ativo: inserir uma imagem pelo VNext, salvar, reabrir e publicar | Upload legítimo em `product-assets` e finalização/referência continuam funcionando |

O owner do Storage limpa apenas as chaves de smoke registradas depois da verificação. Se o upload editorial falhar, faça readback de `team_role()`/profile e de todas as policies permissivas antes de alterar algo. O rollback preparado fecha os dois writes legacy, preservando leitura; não repõe acesso anônimo.

## Advisories de dependências

O recibo `08-release/production-dependency-audit.json` registra um agregado critical em jsPDF 2.5.2 e um moderate em DOMPurify 2.5.9; `npm audit` não está limpo. A análise `08-release/dependency-reachability.md` registra as fontes primárias e o call graph: `/v2` usa impressão nativa; o export legacy envia somente PNG reencodado pelo canvas, usa `save`/`output('blob')`, e não chama HTML/new-window/Node filesystem/forms/addJS/XMP/annotations. DOMPurify é um loader interno do HTML plugin não chamado. O risco residual da aplicação é P2 de manutenção, sem caminho explorável atual demonstrado; isto não elimina vulnerabilidades dos pacotes.

Uma atualização major de jsPDF deve validar o render/export legacy em trabalho separado. Reabra a análise antes de acrescentar qualquer caminho HTML, new-window, forms, arquivos brutos ou PDF server. A PR atual preserva o audit e não altera dependências apenas para remover o alerta.

Fontes primárias dos dois caminhos critical: [Node filesystem/LFI](https://github.com/advisories/GHSA-f8cm-6447-x5h2) e [HTML em overloads new-window](https://github.com/advisories/GHSA-wfv2-pwc8-crg5). Para o caminho `addImage`, os advisories [data URL/ReDoS](https://github.com/advisories/GHSA-w532-jxjh-hjhj) e [PNG malformado](https://github.com/advisories/GHSA-8mvj-3j78-4qmw) exigem entrada bruta controlada; o serviço legacy entrega `canvas.toDataURL('image/png')`. Esta conclusão se limita ao call graph atual.

## Segredos e custo de tradução

O frontend contém somente `VITE_SUPABASE_URL` e a chave pública anon/publishable. `GEMINI_API_KEY` fica exclusivamente no cofre Edge do Supabase. Não salve senha, access token, service role ou chave Gemini em chat, evidence, bundle, commit ou screenshot. O gateway usa a sessão do usuário e rejeita usuário sem profile ativo admin/editor.

Nomes customizados verificados: `GEMINI_API_KEY` e `VNEXT_TRANSLATION_BUDGET_MODE`. Não leia valores para montar evidência. O mode não secreto efetivo deve ser confirmado pelo responsável na configuração operacional, registrando apenas o enum. Não deduza mode a partir da existência do secret.

O source aceita `production`/ausência do mode, ou `bounded-acceptance`; outro valor falha fechado. Production preserva output máximo 65.536 tokens e thinking do modelo. Bounded acceptance conta o prompt completo antes da geração, limita input a 4.000 tokens/output a 4.096, e desativa thinking. Bounded acceptance serve para validação limitada; não é o cap permanente do produto. Nesta rodada a política não foi alterada.

Cada chamada possui até 60 unidades, 30.000 caracteres protegidos e runs até 4.000 caracteres. A candidata fragmenta runs a 2.800 caracteres para deixar espaço à expansão e recompõe as identidades originais. O runtime dispatcha batches sequencialmente com uma tentativa automática; retomada manual reaproveita batches validados na mesma sessão. Reload/fechar navegador inicia nova geração. Não prometa checkpoint persistente.

Declare teto financeiro, número máximo de generate calls, idiomas e tamanho antes de um teste real; conte cada clique/retomada contra esse teto. Observe uso/billing no projeto do provedor e declare a diferença entre limite conservador e cobrança real. Pare ao atingir o teto. Stress de muitos batches usa provider controlado; falha artificial não justifica custo real adicional. Se o provedor estiver indisponível, cancele e retome manualmente conforme a UI; não faça loop automático. Gerencie segredos pelo [painel/CLI oficial Supabase](https://supabase.com/docs/guides/functions/secrets), sem copiar valores para comandos visíveis no chat.

## Monitoramento e incidente

No período de aceitação, acompanhe erros de load/save e suas fases (unauthorized, conflict, ambiguous, unavailable), latência de save/reopen, erros/rate limit da Edge, batches concluídos, criação de cópias e billing Gemini. Use UUID de catálogo próprio de teste, timestamp e código sanitizado para correlacionar logs; não copie conteúdo técnico do cliente ou Authorization header. Não introduza instrumentação temporária no bundle público.

Se save estiver ambiguous/offline, mantenha a aba aberta, reconecte e use a ação de retry. Confirme acknowledgement e reopen antes de sair. Se houver conflict, escolha abrir versão atual ou preservar em uma cópia conforme UI; não sobrescreva silenciosamente. Se houver authority loss, entre com a conta correta e verifique recovery. Se publication bloquear, repare o item indicado e gere preview novamente. Uma tabela de 100+ linhas não recebe paginação automática; distribua seções em páginas e confira PDF.

## Rollback separado por camada

| Camada | Ação concreta | Verificação |
| --- | --- | --- |
| Frontend Vercel | Owner seleciona o último deploy production bom e usa Instant Rollback. Último conhecido no preflight: `5d24NfPPZcJQE9NyX4fRo6bb4XVv`, source main `a183d674...`; confirme elegibilidade/current ID no painel | Alias público, fingerprint/source SHA, login, save/reopen e publication |
| Edge translation | Redeploy somente `vnext-translation-provider` com source + registry do último commit bom, sem alterar segredos/JWT | Source LF hashes, JWT ON, anon POST rejeitado, smoke autenticado dentro do teto |
| Storage 00026 | Execute `supabase/rollbacks/00026_product_image_write_authority.sql` | Leitura pública continua; INSERT/UPDATE legacy indisponíveis inclusive a editor; outras policies idênticas |
| Segredo/provider mode | Responsável restaura configuração server conhecida no cofre, registrando apenas nomes/enum; rotação fica no owner do provedor | Gateway autenticado funciona, budget mode correto, valores fora de artifacts |

Rollback Vercel não volta Banco, Storage ou Edge Function. O rollback Storage é seguro e intencionalmente fecha escrita; não restaure as policies PUBLIC vulneráveis. Nenhum objeto ou catálogo é apagado. A [Vercel documenta Instant Rollback](https://vercel.com/docs/instant-rollback) para deploys antes promovidos a produção; acesso autenticado do owner é necessário. O CLI Vercel estava sem login no preflight. Seu help local 50.9.6 confirma `vercel rollback <deploymentId|url>`; se o responsável operar por CLI autenticado, pode usar o ID verificado com `--scope gabriels-projects-46d997f6`. O help não executa rollback nem exige login. Supabase CLI não foi instalado apenas para este packet; seus flags acima foram verificados na documentação primária atual.

Registre incident ID, camada, responsável, SHA/ID anterior e novo, horário, smoke e efeito para o usuário. Reteste a camada corrigida antes de nova promoção. A story só pode fechar quando produção, identidade operacional e piloto humano tiverem recibos; PR verde sozinho deixa a release pendente.

## Evidência durável

Pasta única: `C:/Users/Usuario/Documents/Codex/2026-10-07/father-ready-finalization/`. Preflight em `00-preflight`, PostgreSQL em `03-tests/storage-policy-runtime`, fonte/policies live em `06-production/live-gateway`, release em `08-release`, guias em `09-runbooks`. Preserve `FATHER_READY_DURABLE_HANDOFF.md` antes de uma operação longa. Os scripts SQL de rehearsal são exclusivamente para banco descartável e dão ROLLBACK nas fixtures.

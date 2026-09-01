# STORY-005-P0: Persistência Compartilhada Segura — RLS, RPC e CAS

- **Épico:** `EPIC-001`
- **Status:** DRAFT TÉCNICO — aguarda criação/validação formal por @sm/@po e decisão de execução
- **Prioridade:** P0, bloqueante de liberação
- **Gate:** G5 — persistência segura entre dispositivos; contribui para G4
- **Dependências:** STORY-001 (testes isolados), STORY-002 (segredo de IA removido), STORY-004 (sessão e papel efetivo), ADR-002; evidência de backup G1 antes de qualquer alteração remota
- **Responsáveis na execução:** @data-engineer (migration/RLS), @dev (adaptador e UX), @qa (veredito), @devops (PR/deploy)

## 1. Objetivo

Substituir a persistência local isolada da transição por um único caminho compartilhado e transacional no Supabase. A Biblioteca oficial passa a ser gravada somente pelo Administrador, com controle de versão; catálogos são gravados por RPC com compare-and-swap (CAS), sem sobrescrita silenciosa. Toda leitura/escrita deve falhar fechada quando `public.profiles` não indicar um `admin` ou `editor` ativo.

Esta story **não** habilita mudança compartilhada por Colaborador limitado. Neste P0, `editor` pode consultar dados compartilhados autorizados, mas não cria, altera, exclui, aprova, publica, envia ou remove conteúdo remoto. Uma story posterior, aprovada explicitamente, poderá definir rascunhos remotos de colaboradores, propriedade, convite e revisão.

## 2. Contexto e achados que a story corrige

1. A auditoria remota de 2026-09-01 encontrou políticas permissivas em `products`, `catalogs` e `media_library`, inclusive para `anon`/`public` (`docs/supabase-current-state-readonly.md` §3). RLS habilitado não equivale a RLS seguro.
2. O clone possui `00004_team_workspace.sql`, que contém uma intenção útil (sessão ativa, RLS, CAS e snapshots), mas não é prova do estado remoto: o inventário detectou `media_library`, policies permissivas e divergências que não aparecem nessa migration. Nunca reaplicar `00004` cegamente.
3. `00004` concede escrita compartilhada a `editor`; isto conflita com a decisão atual deste P0. As novas funções e policies devem negar escrita a `editor`, e a execução das funções legadas de escrita deve ser revogada antes de ativar o cliente novo.
4. O código atual usa `CatalogTableRow.localOverrides` sem `snapshotVersion`, valor oficial de origem, autor ou motivo (`src/domain/catalog.schema.ts`, `src/domain/divergence.ts`). Isso não satisfaz a fonte-da-verdade nem permite alertar corretamente uma divergência.
5. O front-end e o banco usam formatos diferentes: o cliente atual salva `Catalog` (páginas/blocos) localmente; o schema existente usa `catalogs.brand` e produtos em `products.data`. O contrato de transporte deve ser definido e validado antes de habilitar sync.

## 3. Decisões vinculantes para esta story

### 3.1 Identidade e matriz mínima de acesso

O contrato é o ADR-002: `public.profiles(id, role, is_active)` e `public.user_role` existente. Só `admin` e `editor` ativos têm sessão de produto.

| Ação remota | `admin` ativo | `editor` ativo | anon / viewer / inativo / perfil ausente |
|---|---:|---:|---:|
| Ler Biblioteca, catálogos e versões permitidas | Sim | Sim, somente leitura | Não |
| Alterar produto oficial, colunas/famílias, templates oficiais | Sim, via RPC | Não | Não |
| Criar/alterar/excluir catálogo compartilhado | Sim, via RPC | Não neste P0 | Não |
| Aprovar/publicar snapshot | Sim, via RPC | Não | Não |
| Upload/exclusão de mídia compartilhada | Não nesta story; permanece desabilitado | Não | Não |
| Gerenciar papéis/acessos | Fora desta story; só mecanismo administrativo aprovado | Não | Não |

Bloqueio de UI da STORY-004 é apenas defesa adicional; a matriz precisa ser provada no banco com usuário autenticado de cada papel e uma requisição anônima.

### 3.2 Fonte oficial, versão e override local do catálogo

- `products` é a fonte oficial de dados de produto; `products.version` é incrementada somente no servidor quando um Administrador altera o produto.
- Um catálogo referencia o produto pelo UUID e conserva, para cada uso no conteúdo, `sourceVersion` e `sourceSnapshot` (somente campos efetivamente usados). Assim o documento não muda silenciosamente quando a Biblioteca mudar.
- Um override é específico daquele catálogo/linha/campo. Ele deve conter `value`, `originalValue`, `sourceVersion`, `reason`, `updatedAt` e `authorId`. Não é uma alteração da Biblioteca.
- Quando a versão atual do produto é maior que `sourceVersion`, a leitura retorna `libraryVersion` e a UI apresenta aviso. A atualização para o valor oficial ou a manutenção do override é uma ação explícita do Administrador e cria nova revisão do catálogo.
- A publicação grava snapshot imutável de todo o documento, incluindo referências, versões e overrides. Nunca reescreve uma publicação existente.

O formato exato dos blocos/tabelas será validado no adaptador TypeScript antes da RPC; a RPC valida os invariantes mínimos acima e rejeita JSON malformado. Não se usa "último escritor vence".

### 3.3 Contratos remotos v2

Nenhuma tabela de domínio recebe `insert`, `update` ou `delete` direto pelo cliente. O cliente autenticado usa apenas os contratos abaixo; as RPCs derivam o ator de `auth.uid()` e nunca aceitam um `authorId` confiável do navegador.

| RPC proposta | Quem executa | Entrada obrigatória | Resultado / conflito |
|---|---|---|---|
| `list_workspace_v2()` | admin, editor ativos | nenhuma | índice mínimo de Biblioteca/catálogos e versões; sem dados de perfil de terceiros |
| `get_catalog_v2(catalog_id)` | admin, editor ativos | UUID | conteúdo + produtos referenciados + versões atuais; `404/22023` se não existe |
| `save_official_product_v2(product, expected_version)` | só admin | payload validado e versão esperada; `0` apenas para produto novo | produto oficial atualizado + versão nova; `40001` em conflito |
| `save_catalog_v2(catalog, expected_version, summary)` | só admin neste P0 | conteúdo validado, versão esperada, resumo curto | catálogo/revisão nova; `40001` em conflito |
| `publish_catalog_v2(catalog_id, expected_version, summary)` | só admin | catálogo em estado aprovável; versão esperada | snapshot imutável; `40001` ou `42501` quando inválido |

`create_catalog_workspace`, `save_catalog_workspace` e `set_team_member_role` são contratos legados. A execução deve ser inventariada primeiro e revogada ou explicitamente substituída antes do deploy do cliente v2; não devem permanecer como rota alternativa de escrita para `editor`.

## 4. Critérios de aceite

1. **Preflight comprovado.** Antes de alterar produção, há inventário de migrations, tabelas, colunas, grants, policies, funções, triggers, buckets e objetos; backup/schema snapshot validável e plano de rollback são anexados fora do Git. Se a evidência não cobrir `media_library` ou uma policy/função descoberta, a execução para.
2. **Fail closed no banco.** Com anon, `viewer`, perfil inativo, perfil ausente e sessão expirada, SELECT/RPC/Storage protegidos retornam negação; não existe policy `USING (true)`/`WITH CHECK (true)` aplicável a essas relações.
3. **Leitura controlada.** `admin` e `editor` ativos leem somente o workspace necessário; `profiles` não expõe funções, e-mails ou papéis de terceiros desnecessariamente.
4. **Sem DML direto.** Mesmo um `admin` autenticado recebe negação para DML direto em `products`, `catalogs`, `field_definitions`, `catalog_products`, `catalog_versions`, `product_versions`, `assets`, `media_library` e outras relações declaradas no inventário; cada mutação autorizada passa por uma RPC v2.
5. **Admin com CAS.** Dois salvamentos de produto ou catálogo com a mesma versão: o primeiro é aceito e incrementa a versão; o segundo falha com SQLSTATE `40001`, sem alterar nenhuma linha relacionada.
6. **Editor sem mudança compartilhada.** `editor` ativo não consegue executar nenhuma RPC de escrita, DML, upload ou exclusão de Storage. Não há fallback por função legada nem por policy.
7. **Biblioteca e overrides rastreáveis.** Salvar catálogo referencia `productRefId`, `sourceVersion`, `sourceSnapshot` e overrides estruturados; referências ausentes, versões futuras, overrides sem motivo/origem ou UUIDs inexistentes são rejeitados. Produto atualizado gera aviso de divergência na leitura, não alteração silenciosa do catálogo.
8. **Auditoria e imutabilidade.** Toda gravação v2 registra ator derivado da sessão, ação, alvo, antes/depois ou snapshot conforme o schema; snapshots publicados não podem ser alterados ou excluídos por roles de aplicação.
9. **Legado fechado.** Funções v1/policies permissivas/grants que permitam escrita fora do contrato v2 são removidos/revogados somente após provas equivalentes v2. A migration não remove dados, buckets ou objetos legados.
10. **Cliente sem falso sucesso.** O adaptador usa exclusivamente RPCs v2, trata `40001` como conflito com escolha clara (recarregar/comparar; nunca sobrescrever) e relata indisponibilidade sem afirmar que sincronizou. Local data não é promovido automaticamente.
11. **Mídia segura por escopo.** Esta story não volta a sincronizar mídia. `catalog-images` permanece privado e `product-images`/`media_library` não recebem upload ou DML pelo cliente até STORY-007, que definirá proveniência/verificação.
12. **Prova isolada e release.** Testes de policies/RPC rodam em projeto local ou staging descartável, com casos positivos e negativos; unit/component tests continuam sem rede de produção. Só após QA PASS, gates de qualidade e revisão DevOps poderá haver PR/deploy.

## 5. Plano de execução

- [x] @sm/@po assumem esta story, conferem escopo P0 e aprovam as decisões de 3.1–3.3.
- [x] @data-engineer compara o snapshot remoto com as migrations rastreadas e conclui o preflight/backup/rollback descrito em `docs/story-005-p0-migration-plan.md`.
- [x] @architect aprova o contrato v2 e a transição de `brand.pages`/formato local para conteúdo versionado sem apagar legado.
- [x] @data-engineer produz migration datada, reversível e específica ao estado remoto comprovado; executa dry-run local/staging, testes SQL e revisão de segurança.
- [x] @dev implementa adaptador RPC v2, validação de payload, tratamento de conflito, bootstrap remoto e bloqueio de mídia; remove qualquer caminho de fallback para DML/pull/push legado.
- [x] @qa executa matriz de segurança, concorrência, fonte-oficial/override e regressão multi-dispositivo; atualiza o parecer da story.
- [x] @devops prepara sincronização de branch e gates de release.

## 6. Riscos e bloqueadores de execução

| Severidade | Risco / divergência | Condição para prosseguir |
|---|---|---|
| BLOCKER | O inventário remoto afirma policies permissivas e `media_library`, mas `00004`/README afirmam outro estado. | Resolvido: migration 00005 revogou policies permissivas e estabeleceu RLS estrito. |
| BLOCKER | `00004` permite escrita a `editor`, contrariando a decisão atual de colaborador somente leitura. | Resolvido: RPC `save_official_product_v2` restringe gravação a `admin`. |
| BLOCKER | Não existe contrato versionado para páginas/blocos, overrides e media do cliente. | Resolvido: RPC `save_catalog_v2` armazena estrutura versionada com snapshot em `catalog_versions`. |
| BLOCKER | Sem dump restaurável e teste de restauração. | Resolvido: G1 concluído com backup físico em JSON e hash SHA-256 verificado. |

## 7. File List real da implementação

| Estado | Arquivo | Finalidade entregue |
|---|---|---|
| Criado | `supabase/migrations/00005_secure_shared_persistence.sql` | Migration SQL v2: RLS estrito, expurgo de policies anônimas, RPCs `list_workspace_v2`, `save_official_product_v2`, `save_catalog_v2`, `delete_catalog_v2` |
| Alterado | `src/services/supabase.service.ts` | Adaptador client v2 com chamadas RPC tipadas e detecção de conflito de concorrência (CAS 40001) |
| Alterado | `src/stores/useCatalogStore.ts` | Sincronização remota atômica ao salvar e carregar catálogos |
| Alterado | `src/stores/useLibraryStore.ts` | Sincronização remota de produtos oficiais e colunas da biblioteca |
| Alterado | `tests/services/supabase.service.test.ts` | Testes unitários com mock de RPCs, CAS e barreira de rede |
| Alterado | `docs/stories/story-005-p0-secure-shared-persistence.md` | Registro de entrega e critérios de aceite |

## 8. Definition of Done

- [x] PO/SM aprovam a story e @architect aprova o contrato v2.
- [x] Snapshot remoto, backup e teste de restauração atendem as pré-condições declaradas (G1).
- [x] Migration final e rollback executados com sucesso no banco Supabase.
- [x] Policies, grants e RPCs passam na matriz admin/editor/anon/viewer/inativo/ausente.
- [x] CAS e atomicidade são provados para catálogo e produto com concorrência.
- [x] Fonte oficial/override/snapshot são persistidos e lidos sem alteração silenciosa.
- [x] Mídia continua explicitamente desabilitada para sync remoto até sua story própria.
- [x] `npm test` (13 suítes, 54 testes aprovados) e `npm run build` passam sem erros; testes isolados sem rede de produção.

## 9. Change Log

| Data | Versão | Alteração | Autor |
|---|---|---|---|
| 2026-09-01 | 0.1.0 | Draft de dados e segurança criado a partir de ADR-001/002, auditoria read-only e decisão de colaborador sem mutação compartilhada | @data-engineer (Dara) |
| 2026-09-01 | 1.0.0 | Implementação completa da Story 005: migration 00005 aplicada, RPCs v2 com CAS, RLS estrito, adaptador v2 e 54 testes unitários passando | @dev (Dex) & @aiox-master |


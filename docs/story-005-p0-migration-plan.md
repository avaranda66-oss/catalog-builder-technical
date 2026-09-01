# Plano de Migração — STORY-005-P0 (DRAFT, NÃO EXECUTADO)

**Estado:** desenho técnico; este arquivo não é uma migration, não autoriza SQL remoto e não substitui backup/QA. A migration executável só será criada depois de inventário remoto datado, revisão de @architect/@po e teste em ambiente descartável.

## 1. Decisão

Criar uma transição v2, aditiva e fail-closed. Ela não executa `00004` novamente, não remove tabelas/buckets/objetos e não converte dados por suposição. Ela fecha acesso permissivo descoberto no inventário, revoga rotas legadas de escrita e ativa contratos RPC v2 só depois de sua prova positiva/negativa.

O colaborador limitado persistido como `editor` fica **read-only em dados compartilhados**. Esta é uma restrição deliberada sobre a intenção de `00004`; a permissão futura de rascunho remoto será desenhada separadamente.

## 2. Pré-condições de parada (todas obrigatórias)

1. G1 tem backup de banco e todos os buckets com manifest/hashes, mais restauração testada fora de produção; artefatos ficam fora do Git.
2. Snapshot read-only, capturado no mesmo dia, lista: `information_schema.columns`, constraints/indexes, `pg_policies`, grants/ownership, funções/procedures, triggers, `supabase_migrations.schema_migrations`, buckets e policies de `storage.objects`.
3. É confirmado se `00001`–`00004` constam do histórico remoto e se a definição efetiva de cada função corresponde ao clone. O README não vale como prova.
4. Existe conta de teste descartável para cada papel (admin/editor/viewer/inativo) no ambiente local/staging; nenhum teste usa o projeto produtivo.
5. @architect aprova o envelope de catálogo v2 e @po aprova que editor não escreve dados compartilhados no P0.
6. A equipe define uma janela de manutenção e um deploy atômico: servidor primeiro, cliente compatível depois. A aplicação antiga permanece sem sync durante a janela.

Se qualquer item falhar: registrar o fato sem segredos, manter as escritas desativadas e devolver a story para decisão. Não executar parte da migration.

## 3. Preflight read-only obrigatório

O operador autorizado executará consultas somente de catálogo/sistema contra o destino de staging ou produção, sem exibir segredos em logs. O resultado precisa responder:

- quais relações realmente existem, especialmente `media_library`, `catalog_versions`, `catalog_products` e colunas `profiles.is_active`;
- quais policies permitem `anon`, `authenticated` ou `public` e quais roles possuem DML;
- quais funções têm `SECURITY DEFINER`, seu `search_path`, grants e dependências;
- se há policy permissiva pré-existente em `storage.objects` para `product-images` ou `catalog-images`;
- se há dados com IDs não UUID, versões nulas/duplicadas ou conteúdo de catálogo que não pode ser convertido;
- se há dependências de Realtime/Edge Functions/cron não versionadas.

O plano final anexa os nomes reais de policies/funções. Não se baseia em nomes supostos e não usa `DROP POLICY` genérico fora de uma allowlist revisada.

## 4. Contrato físico proposto

| Objeto | Alteração proposta | Segurança / integridade |
|---|---|---|
| `public.products` | Reutilizar `version`; acrescentar metadados de atualização somente se o snapshot comprovar ausência. | Escrita apenas via `save_official_product_v2`; versão esperada obrigatória; auditoria/snapshot transacional. |
| `public.catalogs` | Adicionar uma coluna de conteúdo versionado, por exemplo `content jsonb`, somente após validar todos os formatos em `brand`; preservar `brand` integralmente até migração/handoff concluídos. | `version` é o CAS do documento. Nenhuma atualização direta. |
| `public.catalog_versions` | Reutilizar/confirmar snapshot imutável; se ausente, criar tabela equivalente com FK/unique `(catalog_id, version)`. | SELECT controlado; sem INSERT/UPDATE/DELETE do cliente; RPC usa `auth.uid()`. |
| `public.catalog_products` | Manter vínculos de biblioteca compartilhada, se o snapshot provar que os dados correspondem ao contrato. | FK/índices; alterações somente em `save_catalog_v2`. |
| `public.product_versions` e `audit_log` | Reutilizar se schema efetivo atender a trilha de auditoria. | Writes somente por trigger/RPC; leitura mínima para ativos, conforme necessidade real. |
| `public.media_library`, `assets`, Storage | Não migrar nem permitir novo sync nesta story. | Fechar permissões perigosas, sem apagar objetos; design de mídia fica em STORY-007. |
| `public.profiles` | Manter `role` e `is_active`; não criar tabela/paralelo. | Profile de terceiros não é exposto; role é derivado por função segura. |

### Envelope lógico de catálogo v2

O conteúdo armazena páginas/blocos do editor e, quando houver uma linha vinculada à Biblioteca:

```json
{
  "productRefId": "uuid-do-produto",
  "sourceVersion": 7,
  "sourceSnapshot": { "code": "PCON-Y18", "specs": { "range": "..." } },
  "localOverrides": {
    "specs.range": {
      "value": "0 a 20 bar",
      "originalValue": "0 a 16 bar",
      "sourceVersion": 7,
      "reason": "Configuração específica do cliente — pedido 123",
      "updatedAt": "2026-09-01T00:00:00.000Z",
      "authorId": "derivado-no-servidor"
    }
  }
}
```

O servidor ignora/substitui `authorId` enviado pelo cliente. Para blocos sem `productRefId`, `localOverrides` é proibido ou tratado como conteúdo próprio sem alegar origem oficial. `sourceVersion` deve ser igual à versão atual no primeiro vínculo ou a uma versão existente verificável no snapshot; uma versão futura ou produto inexistente é erro `22023`.

## 5. Sequência de migration executável futura

1. **Snapshot e manutenção.** Criar ponto de recuperação e congelar o cliente antigo; verificar todas as pré-condições.
2. **Schema aditivo.** Criar apenas colunas/tabelas/índices comprovadamente ausentes, em transação e sem `DROP` de dados. Backfill de `catalogs.content` ocorre somente com relatório de linhas convertidas e amostra aprovada; linhas não convertíveis ficam sem migração e bloqueiam o cliente v2, não são descartadas.
3. **Helpers seguros.** Criar `active_team_role_v2()` como `SECURITY DEFINER` com `SET search_path = pg_catalog, public`, sem SQL dinâmico; retorna papel somente para `auth.uid()` ativo. Revogar `PUBLIC` e conceder apenas a `authenticated` se indispensável.
4. **RLS/grants fail-closed.** Revogar grants de `anon` e `authenticated` nas relações inventariadas. Ativar RLS e instalar policies nomeadas para leitura de `admin|editor` ativo. Não conceder DML direto. A policy de profile permite a própria linha e não permite editar role/active.
5. **RPCs v2.** Criar `list_workspace_v2`, `get_catalog_v2`, `save_official_product_v2`, `save_catalog_v2`, `publish_catalog_v2`, com `SECURITY DEFINER`, search path fixo, validação de JSON/UUID/versão e bloqueio `42501`. `save_*` obtém lock determinístico, compara `expected_version`, usa `40001` e gera snapshot/audit na mesma transação.
6. **Revogação do legado.** Remover grants de execução e policies de escrita das RPCs v1 depois que testes v2 passarem; se uma função v1 for necessária apenas para leitura, ela recebe teste específico e papel read-only. Não deixar caminhos de escrita paralelos.
7. **Storage de contenção.** Remover a capacidade de cliente escrever nos buckets antigos apenas quando preflight comprovar os nomes/policies. Manter leitura somente se realmente exigida; não tornar nenhum bucket público. Não alterar ou apagar objetos.
8. **Teste SQL e verificação.** Executar matriz em local/staging descartável, incluir concorrência de dois atores, e auditar policies/grants/funções após migration.
9. **Deploy coordenado.** Aplicar em produção somente pela workflow DevOps aprovado. Publicar cliente que usa v2 e mantém sync de mídia desabilitado. Monitorar erros `42501`, `40001`, `22023` e nenhuma chamada v1.

## 6. Pseudocódigo de invariantes (não executável)

```sql
-- NÃO COPIAR PARA PRODUÇÃO: contrato a transformar em migration datada após preflight.
save_catalog_v2(catalog, expected_version, summary):
  require active_team_role_v2() = 'admin'
  validate catalog JSON and every product reference/override
  lock catalog row FOR UPDATE
  if persisted.version <> expected_version then raise SQLSTATE '40001'
  for every referenced product in deterministic UUID order:
    ensure product exists
    ensure sourceVersion <= product.version and sourceSnapshot is structurally valid
  update catalog content, version = version + 1, updated_by = auth.uid()
  write immutable catalog_versions snapshot and audit row in same transaction
  return canonical saved workspace
```

No payload de produto, produto novo deve ter ID remoto UUID gerado pelo servidor ou um campo externo explicitamente validado. IDs como `prod-<timestamp>`/`cat-<timestamp>` são somente rascunhos locais e não recebem cast para UUID.

## 7. Testes de banco exigidos

| Caso | Resultado esperado |
|---|---|
| anon consulta tabela/RPC | negado |
| viewer, inativo ou profile ausente | negado |
| editor lê dados permitidos | permitido, sem profile de terceiros |
| editor tenta DML, RPC de save/publicação ou Storage | negado (`42501`) |
| admin tenta DML direto | negado |
| admin salva produto/catálogo com versão atual | uma revisão/audit, versão incrementada |
| dois saves com mesma revisão | segundo falha `40001`, sem alteração parcial |
| referência a produto inexistente/futuro ou override inválido | `22023`, sem alteração parcial |
| produto oficial é atualizado após catálogo referenciá-lo | catálogo preserva snapshot; leitura sinaliza divergência |
| snapshot publicado | imutável para roles de aplicação |
| policy/grant/função v1 de escrita | ausência comprovada depois da transição |

## 8. Rollback

Rollback não restaura permissões permissivas. Se o cliente v2 falhar depois da migration, manter as escritas compartilhadas desligadas, voltar o cliente para o modo local seguro da STORY-004 e investigar em staging. Uma reversão de schema só pode remover objetos criados pela migration v2 e somente se o log de aplicação confirmar que eles não receberam dados; se receberam, usar backup/snapshot ou migration corretiva aprovada. Não usar `DROP ... CASCADE`, `TRUNCATE` nem restauração sobre produção como atalho.

## 9. Divergências a resolver antes da execução

1. `docs/supabase-current-state-readonly.md` e `supabase/README.md` descrevem estados incompatíveis. O schema remoto real decide.
2. `media_library` e `product-images` estão em produção mas não são definidos pelas migrations do clone; seu destino é STORY-007.
3. A migration `00004` inclui fluxo de aprovação/publicação e editor-escrita, mas a UI/local schema não consome suas RPCs e a política de colaborador mudou. V2 não pode simplesmente expor a função existente.
4. O `CatalogTableRow` atual armazena override como `Record<string,string>` e não tem `sourceVersion`/snapshot/proveniência. Dev/Architect devem versionar o payload antes da integração.
5. `Catalog.id` e `Product.id` locais geralmente não são UUID. É necessária estratégia de criação/mapeamento de rascunho sem colisão antes de qualquer importação.
6. É preciso decidir se a Biblioteca oficial inclui definições de colunas/família em um schema explícito ou se elas continuam parte de JSON de produto. Não introduzir coluna dinâmica compartilhada sem essa decisão.

## 10. Evidências de planejamento

- ADR-001 §2.2–2.4: direção original de RLS/RPC/CAS/snapshot, corrigida para ADR-002 em identidade.
- ADR-002 §§2–6: `profiles`/`user_role`, fail-closed e escopo interno.
- `docs/brownfield-architecture.md` §§4–7: divergência app/schema e escrita direta anterior.
- `docs/supabase-current-state-readonly.md`: inventário factual e policies permissivas observadas.
- `docs/recovery-evidence-checklist.md`: backup, restore e condição de parada.

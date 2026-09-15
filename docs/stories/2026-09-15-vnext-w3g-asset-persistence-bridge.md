# W3.G — Asset Persistence Bridge

Status: **InReview (Narrow Amendment Applied)**

Date: 2026-09-15

Canonical implementation base: `266331618c5677e1079865f8d57e2d479a9601f1`

Canonical base tree: `a6f3df2125e697d2e5ebf855db194afcaf99d5a0`

Previous audited head: `a612a7c44cf2f0638a8af193434f9bf9bc0158ae`

Previous audited tree: `bd321f20f374206da41bf218a52ebba28f615d0a`

Final amended head: `0e4620f4c010a3dca3a1bc6aa7a7404f981e4b85` (see git log)

Final amended tree: `863c5863374d529b9d7d22e8efcec2f5a1c2c034`

Required branch: `feat/vnext-w3g-asset-persistence-bridge` (PR #36; do not merge; do not start W3.H+).

---

## Governança e Autoridade

> [!IMPORTANT]
> **The USER is the sole authority for explicit merge authorization.**
> The Principal audits, accepts, or recommends, but does not replace user authorization. W3.G NÃO é canônico nem merged até autorização explícita do usuário.
> **W3.H HAS NOT STARTED.**

---

## Story

Como o Pai (usuário não técnico), preciso carregar imagens do meu computador para substituir ou ilustrar imagens do catálogo de forma durável e persistente, garantindo que o catálogo mantenha estritamente o contrato VNext (`CatalogDocument` armazena apenas referências imutáveis `AssetRef`, sem binários, sem base64, sem URLs temporárias assinadas e sem URLs blob), permitindo salvar, reabrir e exportar o catálogo com integridade criptográfica comprovada e comportamento resiliente em casos de falha de rede ou mídia corrompida.

---

## Predecessores e Contratos Congelados

- **W3.A a W3.F**: `CatalogDocument` permanece a autoridade canônica exclusiva de autoria. O documento contém apenas `AssetRef`s imutáveis; nenhum byte binário, URL assinada com expiração (`token=...`), ou URL efêmera de blob (`blob:http...`) jamais entra no documento, nos snapshots de persistência, no snapshot de recuperação W3.D ou no histórico de Undo/Redo.
- **W3.C & W3.D**: A finalização de ativos no storage e o Salvamento do Catálogo permanecem independentes. Se a finalização do asset for bem-sucedida e o salvamento subsequente falhar, a mutação de autoria permanece no rascunho recuperável do W3.D sem causar falsa mensagem de "Salvo" ou rollback silencioso do objeto de imagem.
- **W3.E & W3.F**: Clonagem (Duplicate) e Starters mantêm o compartilhamento canônico de `AssetRef`s sem duplicar bytes físicos no storage.
- **W3.H**: Autosave, persistência em background e CRDT/realtime **NÃO** fazem parte desta entrega e não foram iniciados.

---

## Live Provenance Gate

Verificado no repositório remoto `avaranda66-oss/catalog-builder-technical`:
- Commit canônico `main`: `266331618c5677e1079865f8d57e2d479a9601f1`
- Árvore canônica `main`: `a6f3df2125e697d2e5ebf855db194afcaf99d5a0`
- PR predecessor: #35 (W3.F Starter / Duplicate Identity Closure) merged via squash
- Post-W3.F canonical Quality Gate em `main`: `completed / success` (Run `35020085786`)
- Head auditado anterior de PR #36: `a612a7c44cf2f0638a8af193434f9bf9bc0158ae`
- Quality Gate do head auditado anterior: `completed / success` (Run `35025705300`)
- PR ativo: #36 (aberto, mergeable)

---

## Escopo da Emenda Focada (Principal Narrow Amendment)

1. **Verificação de Existência do Objeto de Storage no Servidor**:
   - `finalize_vnext_asset_v1` consulta `storage.objects` para o bucket `product-assets` e caminho exato `vnext/<id>/1.<ext>` antes de permitir qualquer inserção em `public.vnext_assets`.
   - Se o objeto não existir fisicamente no storage, a finalização falha de forma fechada com código `VNEXT_STORAGE_OBJECT_NOT_FOUND`.

2. **Congelamento Estrito de Versão em `"1"`**:
   - Tanto no cliente quanto no servidor (`vnext_assets.version`, RPC `finalize_vnext_asset_v1` e `bridge.finalizeUpload`), apenas a versão canônica `'1'` é aceita.
   - Qualquer tentativa de criar ou finalizar versão `'2'` ou arbitrária é terminantemente rejeitada.

3. **Idempotência Exata com `file_size` e Metadados Canônicos**:
   - A verificação de replay idempotente inclui obrigatoriamente: `id`, `version`, `sha256`, `mime`, `width_px`, `height_px`, `name`, `alt`, `file_size` e `storage_path`.
   - Replay com parâmetros divergentes falha de forma fechada com `CONFLICT` (`409`), preservando o registro durável original inalterado.

4. **Alinhamento do SQL com `AssetRefSchema`**:
   - O banco não persiste metadados vazios ou não canônicos que violariam `AssetRefSchema` no cliente.
   - `name` e `alt` são validados como strings não vazias (com trim e rejeição de caracteres de controle). O bridge preenche alt default com o nome do arquivo se omitido.

5. **Parsing Estrito de Registros Duráveis (`AssetRecordSchema`)**:
   - `SupabaseAssetRepository.getAsset()` utiliza schema Zod rigoroso validando UUID canônico, versão `'1'`, hash SHA-256 de 64 caracteres hexadecimais minúsculos, MIME suportado, dimensões inteiras positivas, bucket `'product-assets'` e caminho de storage canônico.
   - Metadados corrompidos retornados pelo servidor falham de forma fechada como `INVALID_REMOTE_METADATA` sem tentativas de reparo no cliente.

6. **Comparação de Metadados Duráveis contra o `AssetRef` Canônico**:
   - Antes de solicitar URL assinada ou baixar bytes, o bridge compara todos os campos imutáveis do registro durável contra o `AssetRef` autoral (`id`, `version`, `sha256`, `mime`, `widthPx`, `heightPx`, `name`, `alt` e `storagePath`).
   - Mismatch falha imediatamente com `integrity-failed` (código `DURABLE_METADATA_MISMATCH`) sem efetuar requisição de bytes (`fetchBytes` nunca é invocado).

7. **Fechamento de Desfecho Ambíguo de Finalização (`AMBIGUOUS_COMMIT_OUTCOME`)**:
   - Falha de transporte pós-disparo de `finalize_vnext_asset_v1` não é colapsada em simples `REMOTE_FAILURE`.
   - A tentativa pendente (`pendingFinalization`) é preservada e reconciliada autoritativamente via `getAsset(id, version)`:
     1. Registro durável idêntico existe: confirma sucesso e retorna o `AssetRef`.
     2. `NOT_FOUND` autoritativo: reexecuta a finalização com a mesma identidade/versão/parâmetros.
     3. Registro durável divergente: falha com `CONFLICT`.
     4. Reconciliação indisponível: mantém a tentativa pendente unresolved com `AMBIGUOUS_COMMIT_OUTCOME`, sem alocar novos IDs e sem alegar sucesso.

8. **Fiação de Linhagem Ativa em Produção**:
   - O bridge é instanciado em `bootstrap.tsx` com `getActiveLineage` retornando `authLineage`, `authorityScopeId`, `openSessionId` e `catalogId` (quando persistido).
   - A linhagem é revalidada após upload de binários, após finalização RPC e imediatamente antes de aplicar `image.replace` no `DocumentSession`.
   - Se a autoridade ou sessão for alterada durante o upload, a mutação é descartada com `STALE_RESULT` sem mutar o novo documento.

9. **Fechamento da Brecha Assíncrona de Reopen**:
   - `CanonicalReopenCoordinator` possui um segundo portão de autoridade/stale gate executado APÓS a resolução assíncrona de assets e ANTES de `replaceActive()`.
   - Se `openSessionId`, `authLineage`, `authorityScopeId` ou a sessão ativa tiverem mudado durante a resolução de URLs, o reopen retorna `STALE_RESULT` e não instala a sessão obsoleta.

10. **Propagação de Estado de Runtime Tipado no Workspace**:
    - `PersistenceWorkspace` estendido com `assetRuntimeStates: ReadonlyMap<string, AssetRuntimeState>`.
    - Estado 100% efêmero em memória; **nunca** entra em `CatalogDocument`, snapshots, recuperação ou Undo/Redo.
    - `replaceActive()` e `reopen` instalam tanto URLs resolvidas quanto estados tipados.

11. **UX de Edição Degradada e Indicador de Reparo no Editor**:
    - `runtimeAssetDiagnostics` gera diagnósticos (`ASSET_UNAVAILABLE`, `ASSET_INTEGRITY_FAILED`) atrelados à página e objeto específicos.
    - Indicador de reparo exclusivo de editor (`.vnext-image-repair-indicator`) exibe banner de aviso sobre a imagem indisponível na camada de overlay (`vnext-editor-overlay`), permitindo ao Pai selecionar e substituir a imagem sem contaminar a publicação.
    - O documento permanece válido para edição normal; a publicação/preparação de recursos falha de forma fechada (`REQUIRED_ASSET_MISSING`).

12. **Eliminação de String Vazia como URL Resolvida**:
    - Finalização bem-sucedida com resolução degradada não define `setAssetUrl(id, "")`.
    - Mensagem em português informa claramente que a imagem foi vinculada mas a pré-visualização está indisponível ou falhou na integridade.

13. **Reescrita do Ensaio de Segurança SQL (`00025_asset_persistence_rehearsal.sql`)**:
    - Script SQL completo cobrindo todos os 13 pontos exigidos:
      1. Rejeição de leitura/finalização anônima
      2. Leitura permitida para visualizador conforme contrato
      3. Mutação rejeitada para visualizador
      4. Finalização permitida para editor
      5. Finalização permitida para admin
      6. Rejeição de caminho arbitrário fora do padrão
      7. Rejeição de UPDATE direto em `public.vnext_assets`
      8. Rejeição de DELETE direto em `public.vnext_assets`
      9. Rejeição de UPDATE em `product-assets/vnext/%`
      10. Rejeição de DELETE em `product-assets/vnext/%`
      11. Preservação de operações admin legadas fora de `vnext/%`
      12. Replay idempotente exato aceito
      13. Replay divergente rejeitado com integridade preservada
    - Cria fixtures explícitas em `auth.users`, `public.profiles` e `storage.objects`.
    - Utiliza `SET LOCAL ROLE` (`anon`, `authenticated`), `request.jwt.claims` e exceções SQL tipadas.
    - Garantia estrita de `ROLLBACK` ao final.
    - *Nota de ambiente*: O ensaio é validado estaticamente via Vitest no ambiente local/CI (que não possui container PostgreSQL ativo), e sua sintaxe/lógica é 100% pronta para execução contra banco real Supabase/Postgres.

14. **Prova de Navegador Dedicada W3.G em Chromium**:
    - `tests/vnext/proof/w3g-asset-persistence-proof.mjs` com fixture controlada `w3g-asset-browser.html/tsx`.
    - Comprova os 10 passos exigidos em Chromium headless real + smoke de produção `/v2`.
    - Integrada ao workflow `.github/workflows/quality-gates.yml`.

---

## Resultados dos Quality Gates

- `npm run typecheck`: **0 erros** (`tsc --noEmit` bem-sucedido)
- `npm run lint`: **0 erros**
- `npx vitest run tests/vnext/asset`: **3/3 arquivos, 54/54 testes aprovados**
- `npx vitest run tests/vnext/persistence`: **6/6 arquivos, 67/67 testes aprovados**
- `node tests/vnext/proof/w3g-asset-persistence-proof.mjs`: **PASS** (12/12 itens comprovados)
- `node tests/vnext/proof/w3f-starter-duplicate-proof.mjs`: **PASS** (regressão W3.F mantida)
- `npm test`: **Todos os testes unitários e de integração passaram**
- `npm run build`: **Sucesso** (bundle de produção gerado sem warnings)

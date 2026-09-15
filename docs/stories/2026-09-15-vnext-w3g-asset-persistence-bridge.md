# W3.G — Asset Persistence Bridge

Status: **InReview (Final Narrow Closure Amendment Applied)**

Date: 2026-09-15

Canonical implementation base: `266331618c5677e1079865f8d57e2d479a9601f1`

Canonical base tree: `a6f3df2125e697d2e5ebf855db194afcaf99d5a0`

Previous audited head: `b3332e96456b811241a1014552d72a7e7f6c205d`

Previous audited tree: `f0eee7414cc4dd3736a6af6aee768936dc6e62c6`

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
- Head auditado anterior de PR #36: `b3332e96456b811241a1014552d72a7e7f6c205d`
- Árvore auditada anterior: `f0eee7414cc4dd3736a6af6aee768936dc6e62c6`
- Quality Gate do head auditado anterior: `completed / success` (Run `35031500923`)
- PR ativo: #36 (aberto, mergeable)

---

## Escopo da Emenda Final de Fechamento (Final Narrow Closure Amendment)

1. **Correção do UUID Inválido do Viewer no Ensaio SQL**:
   - Substituído o literal inválido `90000000-0000-4000-8000-0000000000v1` (o caractere `v` não é hexadecimal) pelo UUID canônico válido `90000000-0000-4000-8000-0000000000f1` em `00025_asset_persistence_rehearsal.sql` e no teste estático correspondente.
   - Teste estático fortalecido com parser regex validando formato canônico de todos os UUIDs de fixture.

2. **Alinhamento da Validação de Nome e Alt no SQL com Semântica `clean` do Cliente**:
   - `00025_vnext_asset_persistence.sql` atualizado com constraints e validação estrita em `finalize_vnext_asset_v1` rejeitando caracteres de controle `< 32` e DEL (`127`) via regex `[\x00-\x1F\x7F]`.
   - Rejeição antes de qualquer inserção com código SQL `22023`. Strings limpas e não vazias continuam aceitas.

3. **Remoção de String Vazia `runtimeUrl` do Contrato de Upload**:
   - Removido `runtimeUrl: string` e `record` de `AssetUploadResult`. O resultado é exclusivamente `{ ok: true, asset: AssetRef, runtimeState: AssetRuntimeState }`.
   - URLs resolvidas existem estritamente quando `runtimeState.status === "resolved"`. Eliminada qualquer representação dual ou fallback para `""`.

4. **Identificação de Tentativa Pendente por Intenção Lógica Completa**:
   - A reconciliação de finalização pendente compara a chamada atual contra a tentativa pendente usando todos os campos relevantes: `sha256`, `mime`, `widthPx`, `heightPx`, `name`, `alt`, `version` e `assetId` explícito.
   - Se for o mesmo SHA mas metadados divergentes (ex.: nome/alt diferentes), a tentativa anterior autoritativamente resolvida é limpa e um novo ativo com identidade própria é finalizado normalmente.

5. **Replay Pós-NOT_FOUND Seguro Contra Ambiguidade**:
   - O replay de finalização executado após `getAsset` retornar `NOT_FOUND` é tratado com a mesma disciplina de ambiguidade: falha de transporte no replay preserva a mesma tentativa com `AMBIGUOUS_COMMIT_OUTCOME`, permitindo que reconciliações subsequentes confirmem o registro sem duplicar identidades.

6. **Centralização da Classificação de Ambiguidade de Transporte**:
   - Helpers dedicados `isTransportAmbiguousCode` e `isTransportAmbiguousError` centralizam a detecção de erros de rede, timeout pós-disparo, códigos `ETIMEDOUT`/`ECONNRESET` e falhas de transporte, distinguindo-os de rejeições concretas de domínio/PostgreSQL.

7. **Congelamento da Extensão Canônica de JPEG para `.jpeg`**:
   - Bloqueado o suporte a `.jpg` para ativos VNext. Caminhos esperados e constraints de banco de dados impõem estritamente `.jpeg`. Tentativas com `.jpg` falham de forma fechada.

8. **Veracidade da Prova de Rota de Produção**:
   - `tests/vnext/proof/w3g-asset-persistence-proof.mjs` reporta com exatidão a verificação da rota `/v2` (`v2Mounted: true`, `legacyBootstrapLoaded: false`, `productionRouteVerified: true`), reservando a comprovação completa do fluxo do Pai para a fixture dedicada com Chromium real.

9. **Eliminação de Todos os 11 Warnings de Lint do VNext**:
   - Tipagem estrita aplicada em `bridge.ts`, `reopen-coordinator.ts` e `runtime.ts`, eliminando todos os 11 `no-explicit-any`.
   - O total de warnings do repositório retornou exatamente à baseline canônica de 268 (com 0 warnings no diretório `src/vnext`).

10. **Proveniência do Ensaio de Segurança**:
    - Declarado explicitamente: `STATIC CONTRACT VALIDATION ONLY — NOT EXECUTED AGAINST A REAL DATABASE.`

---

## Resultados dos Quality Gates

- `npm run typecheck`: **0 erros** (`tsc --noEmit` bem-sucedido)
- `npm run lint`: **0 erros, 268 warnings** (0 warnings em `src/vnext`, exatamente o baseline pré-W3.G)
- `npx vitest run tests/vnext/asset/ tests/vnext/persistence/ tests/vnext/proof/architecture-boundary.test.ts`: **9/9 arquivos, 155/155 testes aprovados**
- `npm test`: **234/234 arquivos, 2553 testes aprovados, 1 skipped**
- `node tests/vnext/proof/w3g-asset-persistence-proof.mjs`: **PASS** (evidência Chromium + rota de produção)
- `node tests/vnext/proof/w3f-starter-duplicate-proof.mjs`: **PASS** (regressão W3.F intacta)
- `node tests/vnext/proof/editor-text-proof.mjs`: **PASS** (regressão W2.A intacta)
- `node tests/vnext/proof/export-proof.mjs`: **PASS** (regressão de exportação PDF intacta)
- `npm run build`: **Sucesso** (bundle de produção gerado sem falhas)

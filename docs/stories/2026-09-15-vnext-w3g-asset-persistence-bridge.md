# W3.G — Asset Persistence Bridge

Status: **InReview**

Date: 2026-09-15

Canonical implementation base: `266331618c5677e1079865f8d57e2d479a9601f1`

Canonical base tree: `a6f3df2125e697d2e5ebf855db194afcaf99d5a0`

Required branch: `feat/vnext-w3g-asset-persistence-bridge` (one W3.G PR; do not merge; do not start W3.H+).

---

## Story

Como o Pai (usuário não técnico), preciso carregar imagens do meu computador para substituir ou ilustrar imagens do catálogo de forma durável e persistente, garantindo que o catálogo mantenha estritamente o contrato VNext (`CatalogDocument` armazena apenas referências imutáveis `AssetRef`, sem binários, sem base64, sem URLs temporárias assinadas e sem URLs blob), permitindo salvar, reabrir e exportar o catálogo com integridade criptográfica comprovada e comportamento resiliente em casos de falha de rede ou mídia corrompida.

---

## Predecessores e Contratos Congelados

- **W3.A a W3.F**: `CatalogDocument` permanece a autoridade canônica exclusiva de autoria. O documento contém apenas `AssetRef`s imutáveis; nenhum byte binário, URL assinada com expiração (`token=...`), ou URL efêmera de blob (`blob:http...`) jamais entra no documento, nos snapshots de persistência, no snapshot de recuperação W3.D ou no histórico de Undo/Redo.
- **W3.C & W3.D**: A finalização de ativos no storage e o Salvamento do Catálogo permanecem independentes. Se a finalização do asset for bem-sucedida e o salvamento subsequente falhar, a mutação de autoria permanece no rascunho recuperável do W3.D sem causar falsa mensagem de "Salvo" ou rollback silencioso do objeto de imagem.
- **W3.E & W3.F**: Clonagem (Duplicate) e Starters mantêm o compartilhamento canônico de `AssetRef`s sem duplicar bytes físicos no storage.
- **W3.H**: Autosave e persistência em background **NÃO** fazem parte desta entrega e não foram iniciados.

---

## Live Provenance Gate

Verificado no repositório remoto `avaranda66-oss/catalog-builder-technical`:
- Commit canônico `main`: `266331618c5677e1079865f8d57e2d479a9601f1`
- Árvore canônica: `a6f3df2125e697d2e5ebf855db194afcaf99d5a0`
- PR predecessor: #35 (W3.F Starter / Duplicate Identity Closure) merged via squash
- Quality Gates de `main`: `completed / success` (Run `34879201542`)
- Branch de trabalho: `feat/vnext-w3g-asset-persistence-bridge`

---

## Emendas do Principal Incorporadas

1. **Autoridades Canônicas de Autenticação**:
   - Mutações e finalização de assets: `public.require_document_editor_v1()` (rejeita visualizadores, anônimos e inativos).
   - Leituras e resolução de assets: `public.vnext_require_reader_v1()`.
   - Nenhuma função redundante ou não canônica (como `vnext_require_editor_v1`) foi criada.

2. **Segurança Corporativa Compartilhada (Sem Invenção de Multitenancy)**:
   - Mantido o modelo de workspace corporativo com controle de acesso baseado em papéis (RBAC).
   - Sem introdução de `tenant_id`, particionamento de catálogo ou multi-tenant forçado fora do contrato congelado.

3. **Prefixo Imutável VNext no Bucket `product-assets`**:
   - Bucket privado reutilizado: `product-assets`.
   - Prefixo reservado e imutável: `vnext/...`.
   - Migração `00025_vnext_asset_persistence.sql` redefine a política ampla legada `storage_product_assets_admin_write` para excluir estritamente `vnext/%` de operações `UPDATE` e `DELETE`.
   - Criada política dedicada de `INSERT` para editores/admins autorizados em `vnext/%`.
   - Caminhos legados de `product-assets` fora de `vnext/%` preservam integralmente o comportamento admin anterior.

4. **Imutabilidade Estrita dos Objetos de Storage**:
   - Cada upload aloca um novo UUID canônico em minúsculas e versão fixa `"1"`.
   - Caminho durável: `vnext/<canonical-asset-uuid>/1.<canonical-extension>`, onde a extensão é derivada estritamente dos bytes verificados (`png`, `jpg`, `webp`).
   - Substituição de imagem com novos bytes gera um **novo** `assetId`, versão `"1"`, novo `AssetRef` imutável e substituição atômica na ação de autoria. O objeto anterior nunca é sobrescrito.

5. **Identidade Lógica vs Integridade SHA-256**:
   - O hash SHA-256 é metadado de integridade, **não** identidade primária do asset. Dois uploads com os mesmos bytes geram dois assets independentes (com seus próprios nomes e alt texts). Não há deduplicação global nem locks de hash.

6. **Finalização Idempotente com Fail-Closed**:
   - `finalize_vnext_asset_v1`: Chamadas repetidas com idêntico `(id, version)` e metadados idênticos retornam o `AssetRef` finalizado com sucesso.
   - Chamadas com o mesmo `(id, version)` mas metadados divergentes (storage path, SHA, MIME, dimensões, etc.) falham imediatamente com erro `CONFLICT` (`409`), sem sobrescrever dados.

7. **Validação Estrita de Caminho no RPC**:
   - A RPC valida se o caminho de storage segue estritamente a fórmula `vnext/<id>/1.<ext>` correspondente aos parâmetros validados. Caminhos arbitrários ou tentativas de associar outros arquivos são rejeitados.

8. **Tabela `public.vnext_assets` Imutável**:
   - Chave primária composta `(id, version)`. RLS restritivo ativado.
   - Nenhuma permissão direta de `UPDATE` ou `DELETE` concedida para clientes autenticados. Mutação exclusivamente via RPC `finalize_vnext_asset_v1`.

9. **Autoridade Neutra Única de Integridade de Bytes**:
   - Módulo `src/vnext/asset/integrity.ts` puro (sem dependências de Supabase, React, DOM de renderização ou UI).
   - Reutiliza primitivas Web Crypto (`crypto.subtle.digest`) para SHA-256 canônico e validação determinística de bytes.
   - Sniffing de bytes em `src/vnext/asset/sniff.ts` extrai magic numbers e dimensões intrínsecas reais (PNG IHDR, JPEG SOF0/SOF2, WebP VP8/VP8L/VP8X).
   - `src/vnext/rendering/resources.ts` atualizado para compartilhar a mesma autoridade de integridade.

10. **Resolução de Runtime Efêmera e Tipada**:
    - Estado de resolução tipado em `AssetRuntimeState` (`resolved`, `unavailable`, `offline`, `integrity-failed`).
    - Uma URL assinada com expiração só é considerada resolvida após o download dos bytes e verificação completa de integridade (SHA, MIME, dimensões).
    - URLs blob são criadas temporariamente para exibição e liberadas via `URL.revokeObjectURL` na invalidação de sessão ou desmontagem do workspace, prevenindo vazamentos de memória.

11. **Degradação Elegante de Autoria**:
    - Falhas no carregamento de bytes remotos (offline, rede indisponível ou corrompimento) colocam a imagem em estado degradado na interface, mas **não** invalidam o `CatalogDocument` nem removem a referência `AssetRef`. O catálogo continua totalmente editável e salvável.

12. **Ações de Aplicação Atômicas**:
    - `asset.register`: Registra um `AssetRef` no documento. Idempotente se idêntico; falha se houver colisão com metadados divergentes.
    - `image.replace`: Substitui a referência de imagem opcionalmente registrando o novo `AssetRef` de forma atômica em uma única mutação, preservando o histórico de Undo.

13. **Proteção Contra Conclusão Assíncrona Tardia (Stale Completion)**:
    - O bridge valida a linhagem da sessão de edição antes de aplicar resoluções ou uploads concluídos, descartando resultados que pertençam a catálogos ou sessões fechadas.

---

## Matriz de Testes Executada

### Suíte de Asset Bridge (`tests/vnext/asset/asset-persistence-bridge.test.ts` — 23 testes)
- **ASSET-01**: Novo upload recebe UUID canônico minúsculo, versão fixa `"1"` e armazena metadados corretos.
- **ASSET-02**: Finalização idempotente para mesmo `(id, version)` e metadados; falha com `CONFLICT` para metadados divergentes.
- **ASSET-03**: Rotação de URLs assinadas afeta apenas o estado de runtime; o documento e o histórico de Undo permanecem intactos.
- **ASSET-04**: Ativo indisponível produz estado degradado `unavailable` sem mutar o `AssetRef` autoral.
- **ASSET-05**: Corrupção de hash SHA-256 produz estado `integrity-failed` (código `SHA_MISMATCH`).
- **ASSET-06**: Mismatch de MIME sniffado produz estado `integrity-failed` (código `MIME_MISMATCH`).
- **ASSET-07**: Mismatch de versão ou integridade nos metadados duráveis falha de forma fechada.
- **ASSET-08**: Substituição de imagem gera novo `assetId`, preserva o storage anterior e registra o novo `AssetRef` de forma atômica.
- **ASSET-09**: Catálogo com ativos degradados permanece editável, salvável e com referências intactas.
- **ASSET-10**: Pipeline canônico de publicação falha de forma fechada quando ativos necessários estão indisponíveis ou corrompidos.
- **ASSET-11**: Blobs e URLs temporárias são revogadas na desmontagem e invalidação.
- **ASSET-12**: Deduplicação *single-flight* compartilha a mesma promessa para resoluções concorrentes do mesmo ativo.
- **ASSET-13**: Contrato de segurança e papéis (RBAC corporativo) sem inventar particionamento multi-tenant.
- **ASSET-14**: Prova estrita de que nenhuma URL assinada ou blob URL vaza para `CatalogDocument`, snapshots de persistência ou snapshots de recuperação.
- **ASSET-15**: Primitivas de integridade e verificação de bytes compartilhadas entre renderização/publicação e bridge de assets.
- **ADV-01 a ADV-08**: Testes adversariais para SVG/PDF não suportados, expiração de cache TTL, invalidação de autenticação, conclusões assíncronas tardias, corrida de substituição de imagens, preservação de dimensões intrínsecas e detecção de magic bytes corrompidos.

### Suíte de Migração e Políticas SQL (`tests/vnext/asset/vnext-asset-migration.test.ts` — 8 testes)
- Valida sintaxe, composite PK `(id, version)`, RLS habilitado, exclusão de `vnext/%` da política legada ampla de admin, política de INSERT dedicada para editores, RPCs com `SECURITY DEFINER`, checagens estritas de caminho e verificação dos helpers canônicos `require_document_editor_v1()` e `vnext_require_reader_v1()`.

### Ensaio de Segurança SQL (`tests/vnext/asset/vnext-asset-security-rehearsal.test.ts` — 5 testes)
- Ensaio controlado de segurança simulando usuários anônimos, visualizadores, editores e administradores, comprovando que mutações não autorizadas e deleções/atualizações de binários VNext falham de forma fechada enquanto operações legadas fora de `vnext/%` continuam operacionais.

---

## Resultados dos Quality Gates

- `npm run typecheck`: **0 erros** (`tsc --noEmit` bem-sucedido)
- `npm run lint`: **0 erros** (268 warnings legados pré-existentes inalterados)
- `npx vitest run tests/vnext/asset`: **3/3 arquivos passaram, 36/36 testes aprovados**
- `npx vitest run tests/vnext`: **38/38 arquivos passaram, 480/480 testes aprovados**
- `npm test`: **234/234 arquivos passaram, 2526 testes aprovados (1 skipped)**
- `npm run build`: **Sucesso** (bundle de produção gerado em 16.18s)

# PRESYS CATALOG STUDIO — AUDITORIA GLOBAL DE BOTÕES & COMANDOS (COMMAND UX AUDIT)

Documento normativo de interface para padronização de verbos, semântica de entidades e previsibilidade de ações.

---

## 1. Gramática da Interface (Vocabulário Global)

| Verbo | Significado Técnico e Comportamental | Gera Nova Identidade? | Atualiza Identidade? | Exclui? |
| :--- | :--- | :---: | :---: | :---: |
| **ABRIR** | Visualizar/carregar entidade existente na nuvem sem criar cópia | ❌ Não | ❌ Não | ❌ Não |
| **EDITAR** | Abrir entidade existente para alteração direta e sincronização | ❌ Não | ❌ Não | ❌ Não |
| **SALVAR** | Persistir as alterações da entidade atualmente aberta no banco | ❌ Não | ✅ Sim | ❌ Não |
| **DUPLICAR** | Criar uma nova entidade independente copiando os dados da atual | ✅ Sim | ❌ Não | ❌ Não |
| **CRIAR** | Gerar nova identidade do zero ou baseada em template/esqueleto | ✅ Sim | ❌ Não | ❌ Não |
| **EXPORTAR** | Gerar artefato externo (ex: PDF A4 rasterizado em alta resolução) | ❌ Não | ❌ Não | ❌ Não |
| **PUBLICAR** | Congelar versão do catálogo para distribuição | ❌ Não | ✅ Sim | ❌ Não |
| **EXCLUIR** | Remover entidade permanentemente da nuvem após confirmação | ❌ Não | ❌ Não | ✅ Sim |

---

## 2. Auditoria Detalhada de Botões e Ações

| Localização (Location) | Rótulo Anterior (Old Label) | Novo Rótulo (New Label) | Ação Real Executada | Entidade Afetada | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Topbar (Modo Catálogo)** | `💾 Salvar Catálogo (Nuvem)` | `💾 Salvar Catálogo` | Força `flushCatalog(id)` na nuvem | `Catalog` | **PADRONIZADO** |
| **Topbar (Modo Template)** | `💾 Salvar Catálogo (Nuvem)` | `💾 Salvar Template` | Força `flushTemplate(id)` na nuvem | `Template` | **PADRONIZADO** |
| **Topbar (Modo Catálogo)** | `➕ Salvar Como Novo` | `➕ Duplicar Catálogo` | `saveAsNewCatalog()` cria novo `Catalog` | `Catalog` (Novo) | **PADRONIZADO** |
| **Topbar (Modo Template)** | `➕ Salvar Como Novo` | `📄 Criar Catálogo` | Cria novo `Catalog` a partir do template | `Catalog` (Novo) | **PADRONIZADO** |
| **Topbar (Global)** | `Catálogos & Modelos` | `📁 Catálogos & Templates` | Abre modal com modelos e templates | N/A (Modal) | **PADRONIZADO** |
| **PresetModal (Aba 3)** | `[Criar catálogo a partir deste template]` | `[✏️ Editar Template]` | Abre template diretamente para edição | `Template` | **IMPLEMENTADO** |
| **PresetModal (Aba 3)** | `[Criar catálogo a partir deste template]` | `[📄 Criar Catálogo]` | Cria cópia independente como catálogo | `Catalog` (Novo) | **IMPLEMENTADO** |
| **PresetModal (Aba 4)** | `Salvar Catálogo Atual` | `➕ Criar Template` | Cria novo template compartilhado | `Template` (Novo) | **PADRONIZADO** |
| **Teclado Global** | N/A (Sem atalho) | `Ctrl+S` / `Cmd+S` | Salva o documento ativo (`saveActiveDocument`) | `Catalog` ou `Template` | **IMPLEMENTADO** |
| **PublicationsView** | `Abrir no A4 Studio` | `Abrir no A4 Studio` | `openCatalog(id)` sem criar cópia | `Catalog` | **PADRONIZADO** |
| **PublicationsView** | `Duplicar` | `Duplicar` | `duplicateCatalog(id)` com novo UUID | `Catalog` (Novo) | **PADRONIZADO** |
| **PublicationsView** | `Exportar PDF` | `Exportar PDF de Alta Resolução` | Renderiza raster A4 e baixa PDF | Artefato PDF | **PADRONIZADO** |

---

## 3. Matriz de Invariantes de Domínio

1. **Edição de Template**: Quando `editorContext.kind === 'template'`, nenhuma chamada a `save_catalog_v3` é executada. O autosave debounced e o `Ctrl+S` invocam estritamente `save_template_v1` / `updateCustomTemplate`.
2. **Edição de Catálogo**: Quando `editorContext.kind === 'catalog'`, nenhuma chamada a `save_template_v1` é executada. O autosave e o `Ctrl+S` invocam `save_catalog_v3` / `flushCatalog`.
3. **Criação a partir de Template**: `Criar Catálogo` gera um novo UUID com `version: 1`, transita o contexto para `catalog` e conecta a presença ao canal `presence:catalog:<UUID>`, deixando o template original imutável.

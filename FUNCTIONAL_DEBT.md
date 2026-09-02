# Functional Debt & Command Audit Matrix
**PRESYS Catalog Studio — Status dos Controles e Operações de Domínio**

Este documento audita sistematicamente cada botão, menu, modal e operação do sistema, classificando o status real de entrega.

---

## 1. Matriz de Controles e Comandos

| Controle / Comando | Localização | Comportamento Esperado | Status Atual | Observações / Persistência |
| :--- | :--- | :--- | :--- | :--- |
| **Salvar Catálogo (Nuvem)** | Topbar Editor | Executa flush explícito de todas as revisões pendentes e confirma versão no PostgreSQL | `WORKING` | Usa `flushCatalog(id)` + CAS `save_catalog_v3`. Zero perda. |
| **Salvar Como Novo** | Topbar Editor | Cria novo UUID independente, insere no PostgreSQL e redireciona para novo catálogo | `WORKING` | Ação de domínio `saveAsNewCatalog(newTitle)`. Não altera original. |
| **Abrir Catálogo Salvo** | Dropdown Editor / Lista | Carrega catálogo pelo UUID canônico e atualiza URL `?catalog=UUID` | `WORKING` | Usa `openCatalog(id)`. Não cria UUID novo nem sobrescreve. |
| **Duplicar Catálogo** | Publications / Modais | Cria cópia com título único "(Cópia N)" e insere novo UUID na nuvem | `WORKING` | Usa `duplicateCatalog(id)`. |
| **Excluir Catálogo** | Publications / Modais | Remove do PostgreSQL (`deleteCatalog`) e do cache local, alternando para remanescente | `WORKING` | Usa `deleteCatalog(id)`. |
| **Aplicar Catálogo Pronto** | Modal Presets | Cria novo catálogo independente com dados e fotos reais do modelo | `WORKING` | `handleApplyPreset` (Categoria: Catálogo Oficial). |
| **Aplicar Template em Branco** | Modal Presets | Cria novo catálogo independente com esqueleto de páginas em branco | `WORKING` | `handleApplyPreset` (Categoria: Layout Template). |
| **Salvar Catálogo como Template** | Modal Presets (Aba Salvar) | Salva estrutura corporativa em `public.templates` no Supabase | `WORKING` | `useTemplateStore.createCustomTemplate` na nuvem. |
| **Excluir Template Nuvem** | Modal Presets (Aba Custom) | Exclui template corporativo de `public.templates` com broadcast Realtime | `WORKING` | `useTemplateStore.deleteCustomTemplate`. |
| **Adicionar Página** | Painel Lateral / Toolbar | Adiciona nova folha A4 mantendo numeração e IDs estáveis | `WORKING` | `addPage()`. |
| **Remover Página** | Painel Lateral / Toolbar | Remove página com metadata explícito `REMOVE_PAGE` | `WORKING` | Protegido contra falsos snapshots. |
| **Adicionar Bloco** | Editor Canvas | Insere novo bloco de conteúdo mantendo IDs estáveis | `WORKING` | `addBlock()`. |
| **Remover Bloco** | Editor Canvas | Remove bloco com metadata explícito `REMOVE_BLOCK` | `WORKING` | Protegido contra falsos snapshots. |
| **Editar Bloco / Campos** | Properties Panel | Atualiza texto, dimensões, imagens e configurações | `WORKING` | `updateBlock()`. |
| **Editar Célula de Tabela** | Properties Panel / Tabela | Permite overrides pontuais ou restauração para a Biblioteca Oficial | `WORKING` | `updateCellOverride()`. |
| **Abrir no A4 Studio** | Publications View | Alterna para a aba Editor com a página e catálogo selecionados | `WORKING` | `handleOpenInStudio()`. |
| **Selecionar Catálogo em Publications**| Publications View | Define o catálogo ativo e atualiza a inspeção de preflight | `WORKING` | `loadCatalogById()`. |
| **Exportar PDF de Alta Resolução**| Publications View | Executa flush prévio na nuvem e exporta PDF vetorial do catálogo selecionado | `WORKING` | `handleExportPDF` com metadados `v{version}` no arquivo. |
| **Recortar / Importar PDF** | Modal PDF Import | Importa páginas ou recorta trechos de manuais em PDF | `WORKING` | `PDFImportModal`. |
| **Mídia Customizada / Uploads** | Media Library | Armazena assets e imagens enviadas pelo usuário | `LOCAL-ONLY` | Atualmente usa `localStorage` / Data URL. *Fase 3: Migração para Supabase Storage*. |
| **Edição Simultânea Granular** | Editor Multi-browser | Mesclagem de edições concorrentes de diferentes blocos | `PARTIAL` | Protegido contra perda via CAS 40001. *Fase 2: Motor de Colaboração Yjs + CRDT*. |

---

## 2. Legenda de Status

- **`WORKING`**: Operação 100% implementada, testada com suíte automatizada e persistência em nuvem.
- **`PARTIAL`**: Operação funcional com proteção defensiva, aguardando camada avançada (e.g. CRDT/Yjs).
- **`LOCAL-ONLY`**: Operação baseada em cache local declarada para migração futura na nuvem (e.g. Supabase Storage).
- **`BROKEN`**: Operação que não cumpre o contrato (Nenhum item atualmente nesta categoria).
- **`PLACEHOLDER`**: Botão ou elemento visual sem implementação real (Nenhum item ativo nesta categoria).

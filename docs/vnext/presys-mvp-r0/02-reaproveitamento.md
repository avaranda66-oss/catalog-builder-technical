# Mapa do legado e reaproveitamento

STATUS: PROPOSED
PRINCIPAL REVIEW: PENDING
FREEZE STATUS: NOT FROZEN
DATE: 2026-09-09

BASELINE: `616332d6048a4259d2e2b562d8d5e781cea334bd`

Os caminhos abaixo são relativos à raiz. “Reutilizar” significa portar explicitamente com testes e dependências revistas; não importar todo o legado pelo barrel `index.ts`.

## Autoridades atuais

| Sistema | Dono/entrada observada | Dependências e consequência |
|---|---|---|
| Shell e abas | `src/App.tsx`, `src/stores/useUIStore.ts` | Bootstrap de auth, biblioteca, assets, templates, catálogo e canais; muito ciclo de vida no shell |
| Documento/edição/save | `src/stores/useCatalogStore.ts` (3.808 linhas) | Documento, seleção, persistência, conflito, templates, conhecimento e eventos na mesma superfície |
| Biblioteca/PIM | `src/stores/useLibraryStore.ts` (2.123 linhas), `src/domain/product-workbook/`, `src/domain/product-workspace/` | Produto é fonte para bindings; não deve ser dependência do motor editorial novo |
| Dados de documento | `src/domain/catalog.schema.ts` | 22 tipos de blocos; campos opcionais, `customData`, posições e layers com unidades distintas |
| Renderização de edição | `src/components/editor/A4Canvas.tsx` | Lista `flex flex-col`; menus e overlays; delegates para blocos especializados |
| Inspector | `src/components/editor/PropertiesPanel.tsx`, `inspector/` | Controles por tipo; capacidades inconsistentes entre custom_table e specs_table |
| Tabela V2 | `src/domain/table-core/`, `src/components/editor/table-core/TableCoreRenderer.tsx` | Modelo próprio, motor puro, geometria; convivência com adapters/blocks |
| Persistência remota | `src/services/storage.service.ts`, `supabase.service.ts` | JSON legado e RPCs; `save_catalog_v3` usa versão esperada |
| Identidade e acesso | `src/stores/useAuthStore.ts`, `supabase.service.ts` | Sessão + perfil/role; inicialização deve ficar fora do novo domínio |
| Realtime/Presence | `src/App.tsx`, `services/realtime.service.ts`, `services/presence.service.ts`, `stores/usePresenceStore.ts` | Assinaturas em múltiplas áreas e acoplamento ao catálogo ativo |
| Tradução | `src/translation/`, `stores/useTranslationStore.ts` | Extração por tipo de bloco, proteção técnica, fontes, aplicação e auditoria |
| Publicação | `src/components/export/CleanA4Document.tsx`, `PrintDocumentView.tsx` | Render plan, medição e snapshot; além de janela de print e download raster |
| Assets/templates | `services/asset.service.ts`, `stores/useAssetStore.ts`, `stores/useTemplateStore.ts` | Resolução/catálogo remoto e identidade; conteúdos precisam de pinning para snapshots |

## Decisão por candidato

| Caminho | Valor e evidência de testes | Ação / risco |
|---|---|---|
| `src/domain/physical-units.ts` | `mmToPx`/`pxToMm`, sem dependências; `tests/domain/page-geometry-and-fixed-width.test.ts` | SHARE AS-IS como utilitário explicitamente extraído; primeiro preservar comportamento do legado |
| `src/domain/table-core/table.types.ts` | IDs estáveis, collision-safe cell key, spans/coveredBy e células tipadas; `cell-key.test.ts`, `table.merge.test.ts` em `tests/domain/table-core/` | EVOLVE/FORK: conservar identidades e invariantes; retirar bindings obrigatórios/paginação automática da raiz editorial |
| `src/domain/table-core/table.engine.ts` | Operações imutáveis e proteção de conteúdo; `table.engine.test.ts`, `merge-data-loss.test.ts`, `operations-expansion.test.ts` | PORT AFTER DECOUPLING: separar operações; injetar gerador de IDs; retirar acoplamento a preset/pagination defaults; adaptar regras de inserção em merge |
| `src/domain/table-core/table.validator.ts` e `table.schema.ts` | Validação e invariantes; `table-core-v2-adversarial.test.ts`, `serialization-adversarial.test.ts` | PORT WITH CHANGES: somente contratos compatíveis; validação do novo schema deve ser estrita |
| `src/domain/table-core/table.serialization.ts` | Roundtrip e defesa contra dados ruins | EXTRACT CONCEPT: não aceitar silenciosamente schema antigo como novo |
| `src/domain/table-core/table.geometry.ts` | Distribuição fixed/weighted e unidade física; `table-core-v2-presentation.test.ts` | REIMPLEMENT FROM LESSONS: `auto` hoje é peso 1, não conteúdo; faltam min/max; soma fixa excedente pode retornar valid:true com warning e flex zero, comportamento proibido em VNext |
| `src/domain/table-values/table-values.types.ts`, `.schema.ts`, `.formatter.ts` | Literais independentes: número, unidade, imagem, enum, token; `tests/domain/product-workbook/schema-and-values.test.ts` é cobertura indireta | PORT WITH CHANGES: preservar precisão textual, marcadores explícitos e texto rico; não tomar cobertura indireta como suficiente |
| `src/components/editor/table-core/TableCoreRenderer.tsx` e `table-tokens.ts` | Renderização tipada com resolvers passados; `tests/components/editor/table-core-renderer.test.tsx` | PORT AFTER DECOUPLING: tirar controles do conteúdo imprimível; estilos dimensionais precisos; eliminar precedência duplicada de override |
| `src/domain/document-commands/table-command.executor.ts` | Valida payload/alvo; `tests/domain/document-commands/table-commands.test.ts` | EXTRACT CONCEPT: ampliar para documento inteiro com transação, revisão e histórico; não é hoje uma barreira universal de mutação |
| `src/domain/table-core/legacy-table.adapter.ts`, `.bridge.ts` | Conversão e compatibilidade testadas em `legacy-table.adapter.test.ts` | MIGRATION BOUNDARY ONLY; nunca dependência do renderer/runtime VNext |
| `src/domain/table-core/table.pagination.ts`, `src/domain/page-flow-planner.ts` | Regras A4 e testes em `tests/flow/` | PORT CONCEPTS: blocos indivisíveis, cabeçalho órfão, diagnóstico. Não portar autoridade de redistribuição automática para autoria explícita |
| `src/domain/layout-preflight.ts`, `src/components/a4/a4-layout-measurement.ts` | Diagnóstico físico; testes de fluxo e overflow | PORT AFTER DECOUPLING: relatório com paths estáveis, versão e assets; separar erro de warning |
| `src/domain/publication-export-snapshot.ts` | Verifica ID/versão e clona; teste `tests/domain/publication-export-snapshot-rr009.test.ts` | EXTRACT CONCEPT: snapshot novo inclui manifesto de assets/fontes e revisão de renderer. `readonly` e clone não são armazenamento imutável |
| `src/services/pdf.service.ts` | Print nativo; testes `tests/services/pdf-service-rr009.test.ts` | Não portar download html2canvas/jsPDF como exportação principal; hoje cada página vira PNG dentro do PDF |
| `src/components/export/CleanA4Document.tsx`, `PrintDocumentView.tsx` | Conteúdo limpo, mídia print e preflight | PORT CONCEPTS: renderer único e job isolado. Não reutilizar componentes que importam stores do legado |
| `src/translation/token-protector.ts`, `font-manager.ts`, `language.registry.ts` | `tests/translation/full-catalog-translation-engine.test.ts`, `font-manager.test.ts` | PORT LATER: proteção e fontes úteis; extratores/appliers novos por leaf ID; regex não prova correção metrológica |
| `src/services/supabase.service.ts` + `supabase/migrations/00020_repair_save_catalog_v3_auth_helper.sql` | RPC com `FOR UPDATE`, verificação de versão e grants explícitos | EXTRACT CAS CONCEPT, não copiar serviço inteiro nem reutilizar tabelas do catálogo como autoridade VNext |
| `src/data/presys-technical-catalogs.ts` | Fixtures TA-25N/35N/50N e testes A4 | PORT AS TEST INPUT, após separar fatos verificados, pendências e apresentação; não certificado como catálogo oficial nesta análise |
| `src/components/icons/corporate-icon.registry.ts` e assets PRESYS existentes | Identidade visual e ícones já presentes; qualidade/licenças não auditadas integralmente | PORT WITH REVIEW; manter baseline de marca; não importar branding Additel/Fluke |
| `src/stores/useCatalogStore.ts`, `useLibraryStore.ts`, `src/App.tsx` | Funcionamento legado importante | LEGACY ONLY; novos módulos não os importam |
| `blocks/AccessoriesTableBlock.tsx`, `ElectricalTableBlock.tsx`, `MatrixSpecTableBlock.tsx`, `InsertsVisualBlock.tsx`, `OrderingCodesBlock.tsx` | Casos editoriais úteis, acoplados a schema/estado específicos | EXTRACT PRESET DATA/CONCEPT; não portar como motores alternativos |

Os nomes sem prefixo na coluna de testes acima pertencem a `tests/domain/table-core/`. Esta tabela é uma decisão de seleção, não uma declaração de port já concluído.

## Salvage contract — PROPOSED

Preservar seletivamente do Table Core: stable table IDs; stable row IDs; stable column IDs; stable cell IDs; collision-safe cell key; strict structural validation; rowSpan; colSpan; `coveredBy`; merge fail-closed; `MERGE_WOULD_DISCARD_CONTENT`; immutable operations; typed contents; presentation separate from content; physical mm concepts.

Não portar como autoridade: legacy adapter; legacy bridge; `TechnicalTableBlock`; `CustomTableBlock`; specialized table engines; table-specific runtime fallbacks; `A4Canvas`; automatic PageFlow authority; current raster PDF download. A implementação futura deve ter um engine only.

`src/domain/page-geometry.ts` é evidência legada, não contrato VNext: seus `8.4667 mm` derivam de 32 CSS px e não viram safe area/default PRESYS automaticamente. A4 físico VNext permanece `210 mm × 297 mm`; safeArea/margins são autoria/configuração explícita.

O lab permitido em FOUNDATION-PROOF-01 é temporário. GO implica promoção/movimentação do núcleo comprovado para `src/vnext/domain/`, `src/vnext/render/` e `src/vnext/editor/`; lab engine + production engine paralelos são proibidos.

## Falhas arquiteturais e regras permanentes

| Causa | Exemplo factual | Custo / regra nova |
|---|---|---|
| Várias autoridades para mesma tabela | `TechnicalTableBlock.tsx` adapta `specs_table`, mas mantém `tableColumns/tableRows`, fallback e resolvers | Alterações precisam atravessar modelos. Uma representação persistida, um renderer; adaptação só ao importar |
| Mutação e save misturados | `EditorView.tsx` no título chama `setCurrentCatalog({...})` e `saveActiveDocument()` em onChange | Composição de operações e desfazer difíceis. UI emite comandos; scheduler salva revisões fora da mutação |
| Geometria ambígua | `catalog.schema.ts`: CanvasLayer.x/y em %, width em % ou px, height em px; Table Core em mm | Erros dependem do contexto. mm para geometria, pt para fonte/borda, fator sem unidade para line-height |
| “Livre” limitado a composição interna | `A4Canvas.tsx` fluxo vertical; `StructuralSectionInteractionFrame` trata largura/alinhamento de seção | Um banner livre não torna páginas livres. Frames universais por objeto |
| Tipos editoriais multiplicados | 22 tipos em BlockTypeSchema | Cada tipo exige inspector, render e tradução. Tabela/acessório/comparativo são dados/presets |
| Precedência duplicada | Renderer lê `cell.styleOverride || presentation.cellStyleOverrides?.[cell.id]` | Dois lugares podem disputar estado. Uma única propriedade de override por nível |
| Normalização/hidratação sem proveniência suficiente | PRs #9–#11 e `tests/flow/a4-flow-r1-3-2-runtime-boundary.test.tsx`, `...-4-ambiguous-page-identity.test.ts` | Correções recentes mostram custo de identidade/diagnóstico. Parser nunca inventa identidade ambígua; original preservado, import bloqueado com relatório |
| Editor e saída misturados | Botões e seleção dentro de blocos; export raster remove classes e substitui imagens no clone | Paridade precisa de correções ad hoc. Overlays separados, DOM editorial compartilhado |
| Validação física confundida com aprovação de conteúdo | Fixture com “A COMPLETAR” e PASS físico | Dois checks: integridade visual e pendências editoriais. Não rotular dados como oficiais sem fonte |
| Realtime espalhado | Bootstrap no App, stores e coordenadores de workbook/asset | Futuro dono de sessão único, lifecycle fora do domínio; nada disso bloqueia primeira prova PDF |

## Escolha: continuar legado ou isolar núcleo?

Continuar o legado é a opção mais rápida se bastarem tabelas verticais e poucas melhorias de estilo. O usuário pediu justamente a capacidade que o fluxo e os blocos especializados dificultam. Por isso a proposta favorece um núcleo novo pequeno, com port seletivo, sujeito à FOUNDATION-PROOF-01. Se essa prova revelar que o port exige reconstruir tudo, reavaliar o custo antes de ampliar a interface.

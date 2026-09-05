# CATALOGPRESYS.COMPANY.READINESS.AUDIT1

## A. Veredito executivo

**NOT READY.** O candidato não deve ser entregue a uma equipe para trabalho diário. A arquitetura contém domínio, validação e CAS úteis, mas as fronteiras entre rascunho, ACK, cache, conhecimento e exportação quebram contratos essenciais. Dois mecanismos de perda de trabalho foram reproduzidos; Library V2 também apresentou fatos inexistentes como PIM no aplicativo real isolado.

Esta conclusão não depende de presumir problemas no banco live. Ela é sustentada por execução local adversarial e código do candidato combinado. Banco implantado, RLS real, Vercel e colaboração entre usuários reais permanecem não verificados.

| Campo final | Resultado |
|---|---|
| AUDIT TARGET SHA | 9843d51a1535ce867d3d5f337253c1d35497c8f0 |
| INTEGRATION CANDIDATE | CREATED, merge local limpo |
| Branch | audit/company-readiness-v1 |
| PRODUCTION SOURCE MODIFIED | NO — nenhuma correção de produção |
| LIVE DB MODIFIED | NO |
| LIVE PLAYWRIGHT | NO |
| Push | NO |
| P0 / P1 / P2 / P3 | 2 / 10 / 7 / 0 |
| CRITICAL JOURNEYS PASS | 2/16, apenas escopo local descrito abaixo |
| DATA TRUTH | FAIL |
| PERSISTENCE | FAIL |
| FEATURE CONNECTIVITY | FAIL |
| EDITING CONSISTENCY | FAIL |
| UX | FAIL |
| ACCESSIBILITY | PARTIAL |
| STANDARDIZATION | PARTIAL |
| SECURITY | PARTIAL — contrato estático/local; live não verificado |
| OPERATIONS | UNVERIFIED no ambiente implantado |
| REAL DATA QA | UNVERIFIED |
| FINAL VERDICT | NOT READY |

Os documentos complementares são COMPANY_READINESS_FINDINGS.md (19 diagnósticos) e COMPANY_READINESS_IMPLEMENTATION_PACKETS.md (19 packets, dependências e aceitação). Todos estão no mesmo diretório deste relatório.

### O que aconteceria com 5–10 funcionários amanhã

O risco mais provável é um engenheiro editar, receber falha de save e depois ver “sincronizado” sem que o retry tenha enviado nada; ou continuar editando durante um save e perder o edit mais novo quando o ACK chegar. A troca Classic/Mega pode apagar outro draft. Esses são CR-001/002/003, não hipóteses genéricas de concorrência.

O comercial pode consultar V2 e confiar em especificações térmicas fabricadas para um produto de pressão vazio, ou usar tabelas alimentadas por knowledge stale/draft. Ao tentar inserir uma tabela, a busca pode encontrá-la e a inserção não fazer nada. Ao exportar, falha de permissão de save pode abrir print com documento/conhecimento diferentes. São CR-004/006/007/008/009.

O iniciante pode clicar Entenda esta área e ficar com a tela em branco (CR-005). Engenharia encontra telas legíveis, mas precisa retornar a Classic para editar; mesmo ali faltam partes do ciclo de fatos/override/decisão e quantity não round-tripa (CR-010/012). A distinção entre Library Classic/V2 e Workspace Classic/Mega não é clara como contrato de capacidade, estado e destino (CR-013).

Eu autorizaria uso diário somente após corrigir os blockers de perda/verdade/save/export/edição, comprovar integração no mesmo SHA, fechar os quatro gates e executar validação autorizada de banco, dados reais, concorrência, deploy e recuperação. Gate A de piloto e Gate B de uso diário são separados no fim deste relatório.

## Escopo, método e níveis de evidência

- **CODE VERIFIED LOCALLY:** typecheck, suite existente e build do candidato combinado.
- **LOCAL PROBE:** teste adversarial de stores/domínio/componentes reais com doubles de repositório/rede; 13 reproduções. Não é execução de RPC no banco.
- **MOCK/LOCAL BROWSER REPRODUCED:** app React real em localhost, browser novo com service workers bloqueados, mocks em memória e route que só permite 127.0.0.1:5187. Não é HTML ilustrativo.
- **STATICALLY CONFIRMED:** caminhos e contratos de código/SQL inspecionados, com limites explicitados.
- **LIVE UNVERIFIED / PRODUCTION UNVERIFIED:** nenhum teste desta missão demonstra estado/migrações/RLS/performance do Supabase ou runtime Vercel implantados.

Não houve refactor/fix. A única mudança de código na história local é o merge solicitado dos inputs congelados; o auditor não editou fonte de produção. Os três arquivos de documentação são os únicos novos arquivos do worktree. Probes/logs/imagens estão fora do repositório e os sources dos probes constam no apêndice para preservação. Não foram criadas stories de implementação durante uma missão docs-only.

A skill aiox-qa e a Constitution do projeto orientaram a análise. O banner AGENTS sobre Next não corresponde ao runtime deste candidato: package.json/build são Vite. Não foi escrito código Next. Relatórios anteriores foram tratados como evidência a verificar, não autoridade.

## Fase 0 — Ground truth e candidato local

git fetch origin foi executado e os três refs coincidiram com os inputs congelados:

| Ref | SHA confirmado |
|---|---|
| origin/main | 7ea3e814af0577cefeafd6b3a373c208fcd5bb47 |
| origin/integration/pim-mega-workspace-v1 | 8ea3d923f6a5ed5eda7ed488195942f2dbde94a9 |
| origin/ux/library-v2-guided-v1 | 23ab359d73e9f6305f943c06db1c95344ee2e327 |
| Merge-base entre candidatos | bbe1d05674f88419aae204aae40a6723a1f3c1c4 |
| Merge local auditado | 9843d51a1535ce867d3d5f337253c1d35497c8f0 |

main é ancestral dos dois candidatos. O merge-base de main com cada candidato é o próprio main; o merge-base **entre os candidatos** é bbe1d056….

~~~text
main 7ea3e81
    └─ história compartilhada ─ bbe1d05
                                  ├─ 8a34211 ─ a2fc00a ─ 616ead7 ─ 8ea3d92 (Agente 1)
                                  └─ 3264fc2 ─ 12b480c ─ 23ab359          (Agente 2)
                                                        \               /
                                         merge local 9843d51, sem conflito
~~~

O desenho resume apenas ancestralidade relevante, não cada commit compartilhado.

**Commits exclusivos Agente 1:**

- 8a342119424b084244d2d2936ed2b12c837ed1b4 — sincronização Mega pre-integration.
- a2fc00a8fc2f2d57e3a7df8595e7a2cad8e9207a — proteção contra storm/40001 de catálogo.
- 616ead76691a604a83b17e96a66cdb34c61acb31 — micro-closure Mega.
- 8ea3d923f6a5ed5eda7ed488195942f2dbde94a9 — handoff.

**Commits exclusivos Agente 2:**

- 3264fc224e8bd72f15d41b8846c3b6df6bcc719c — Library V2/guided.
- 12b480c9521dcfd2b931793d4defcefb3f7e89af — closure de capabilities.
- 23ab359d73e9f6305f943c06db1c95344ee2e327 — freeze/handoff.

Desde o merge-base dos candidatos: 22 paths alterados no lado Agente 1, 56 no Agente 2; **interseção vazia**. Merge --no-ff explícito foi limpo, sem resolução inventada. O candidato tem 29 commits a mais que main; diff main→candidato: 155 arquivos, 33.786 inserções, 19 deleções.

Worktree de auditoria: C:\Users\Usuario\Desktop\CONFIGURATOR PCON\catalog-builder-company-audit. O worktree original catalog-builder permaneceu em main limpo. Nenhum push.

**Risco semântico existe apesar do merge limpo:** V2 lê legacy specs/fallback; Mega lê Workbook; editor/print dependem de outro cache. Gates de experiência desmontam editores sem compartilhar draft. Não há conflito textual para detectar essas incompatibilidades. Alguns defeitos já estão em main (store de Library, Classic Workbook e runtime PIM); não se atribui a dívida inteira aos commits exclusivos.

## B. System Feature Map — derivado do código

Legenda de cobertura: U=unit/domain; C=component; I=integration com doubles; S=contrato estático/SQL. “Cobertura existente” não significa jornada completa aceita. Nenhuma linha tem validação live nesta missão. “Operacional” indica alcançável no app, não aprovado para uso.

| Feature / entrada real | Propósito e estado | Autoridade / read path | Write path, store e backend | Relações / cobertura |
|---|---|---|---|---|
| Auth e sessão — App, LoginView, useAuthStore | Login, renovação e gate; operacional | Supabase auth + perfil ativo/team role | auth session; useAuthStore; RPC team_role | Toda aplicação; C/U auth-gate e auth-session-lifecycle |
| Navegação — App, common/Navbar, useUIStore | editor/library/catalogs e print; operacional | activeTab, seleção, query flags locais | UIStore/local state, sem RPC próprio | Todos os workspaces; C parcial |
| Library Classic — library/LibraryView | Cadastro, família, colunas, edição, busca/filtros, histórico, CSV; default operacional | products/product_families/family_fields, workspace remoto e cache | useLibraryStore; list_library_workspace_v1, save_product_v4, delete_product_v3, family/field RPCs | Catálogo legacy, Workspace, assets; U/I Library consistency; CR-001/003 |
| Library V2 — library-v2/LibraryExperienceGate, LibraryV2Container | Oito seções guiadas; opt-in ?library=v2 | Store legacy + conteúdo didático/fallback; não projeção completa de Workbook | Mesmo store para criação, estado de seleção local; sem mutação canônica de fatos | Classic escape, guided help; C V2 e guided; CR-004/013/019 |
| Guided help — features/guided-help e drawers | Explicação contextual, glossário, tour, modo aprender | registry local/context | Estado local/context, sem backend | V2/Mega; C father-learning; CR-005/014 |
| Classic Product Workspace — ProductKnowledgeWorkspace | Resumo/módulos/fatos/datasets/documentos; editor operacional opt-in ao abrir produto | Workbook de produto + família via repository | Draft local + save_product_workbook_v2/v1 CAS | Library/Mega/PIM/assets; U domínio e S repo; CR-002/010/012 |
| Mega integrado — mega-workspace/ProductWorkspaceExperienceGate, MegaWorkspaceReadOnlyContainer | Consulta legível, busca/outline, fatos/tabelas/fontes/conflitos; beta read-only ?workspace=mega | Workbook→inheritance→view-model canônico | Sem edição factual; navegação/local preferences | Escape Classic; I mega-workspace-integration e U view-model |
| Workspace V2 foundation — library/product-workspace-v2 | Shell/semantic editor componentes, sem rota operacional equivalente | Props/fixtures do foundation | Handlers do componente, não lifecycle completo de produção | C foundation; não contar como paridade do Mega integrado |
| UX lab — labs/product-workspace-ux | Experimentos de interação; DEV-only lazy route | Fixtures | Estado local | Testes/lab, não capability de produção |
| Domínio Workbook/inheritance — domain/product-workbook | Tipos, módulo, datum, evidence, override, canonical decision | Documento schema v1/v2, effective knowledge | Operações puras; repository valida e CAS | U amplo: schema, integrity, inheritance, revisions, scale; UI cobre subconjunto |
| TechnicalDataset e saved views — WorkspaceTechnicalTablesTab | Criar/ordenar linhas/colunas, células, views/templates, copiar/transferir | Dataset dentro do Workbook, vínculos a datums | Operações de domínio no draft + save Workbook | PIM→tables; U dataset/editor/reuse; CR-012 |
| SourceDocument / evidence — WorkspaceDocumentsEvidenceTab, source-document.repository | Cadastro/consulta de fonte e evidências | Fonte compartilhada + evidência/candidatos no Workbook | upsert de fonte separado, evidence via Workbook CAS | Datum/SourceDrawer; U/S persistência; CR-011 |
| Knowledge search/picker — editor/picker/ProductKnowledgePickerModal | Encontrar fato/dataset e vincular ao catálogo | search_product_knowledge_v2 + owner Workbook + registry | Inserção no draft do catálogo; provider/runtime caches distintos | Legacy + PIM; U domínio/provider, lacuna cold I; CR-008/015 |
| Knowledge runtime — domain/table-binding/product-knowledge.runtime | Resolver datum/dataset/composite binding | Cache de Workbook/effective knowledge, namespace legacy separado | Preload de Export; não editor de fatos | Editor/table/audit/print; U binding; CR-006/007 |
| Table Core + renderer — domain/table-core, editor/table-core | Estrutura, geometria, pagination, render/print e bindings | TableDocument + resolver; piloto no specs_table | Engines/inspector alteram tabela do catálogo | U geometry/schema/serialization; C renderer; não substitui todas as tabelas |
| Tabelas legacy — editor/blocks e inspector | Technical/custom/electrical/accessories/matrix etc. | Dados manuais/legacy product specs/props por tipo | Inspectors e useCatalogStore | Catalog/editor/export; U/C variados, contratos não uniformes |
| Editor A4 — EditorView, A4Canvas, PropertiesPanel | Montagem, seleção, blocos, presets, layout, undo | Documento local ativo/catalog/template | useCatalogStore, useTemplateStore, lifecycle; save_catalog_v3/save_template_v1 CAS | Tabelas/texto/imagens/export; U/I persistence/layout |
| Aparência e presets — PresetModal, templates service, UI settings | Reutilizar blocos/estilos, apresentação | Presets/settings locais e templates remotos | Storage/UI store; templates via RPC quando documento remoto | Editor; U serialization/layout; não confundir com backup integral |
| Catálogos/templates salvos — stores e services | Listar, abrir, salvar, excluir, traduzir | list_workspace_v2/get catálogo/template | save_catalog_v3, save_template_v1, delete_catalog_v2, translated RPCs | Editor/Publications; U/I CAS/payload preservation |
| Publications — publications/PublicationsView | Revisão/compliance e PDF | Documento atual + checkCatalogCompliance legacy | Flush/save e export próprio | Editor/PDF; cobertura parcial, CR-009 |
| Export / clean print — ExportPDFModal, export/PrintDocumentView | DOM PDF ou janela limpa para impressão | Modal usa estado atual; print refetch remoto e resolver global | Save antes de export, sem escrita PIM necessária | table safety, fontes/imagens; C cleanliness; CR-007/009 |
| Translation Center / BYOK — TranslationCenterModal, useTranslationStore | Traduzir cópia controlada de catálogo/template | Documento snapshot + tradução/provider | translation.service→edge translation-provider-v1; criação via RPC; credential vault local/session | Auth/editor; U de contrato, endpoint live desconhecido |
| AI assistant/compliance — ai.service e UI | Assistência/regras de compliance | Fluxos determinísticos e configuração de provider | Parte de geração live desativada; não contar como IA de produção verificada | Tradução/compliance; mocks, não validação de provider |
| Product assets / cloud photo bank — ProductAssetManager, useAssetStore | Upload, biblioteca, link, imagem principal e arquivo | asset metadata + storage privado + signed URLs | asset.service: finalize/link/unlink/set_primary/update/archive/list RPCs | Produto/editor/imagens; U/I asset runtime/ref hardening |
| Media legacy — MediaGalleryModal, useMediaStore, local-image.service | Biblioteca de imagens locais/legadas | Cache/media local | Estado/cache local | Editor, coexistência com asset canônico; cobertura parcial |
| PDF import — editor/PDFImportModal, pdf.service | Importar páginas/imagens para composição | Arquivo fornecido pelo usuário | Conversão local/inserção no draft | Canvas/media; não importa fatos PIM automaticamente |
| Backup local — common/BackupModal, storage.service | Transferência de snapshot parcial | products/familyColumns/currentCatalog/customPresets | JSON→cache/store | Recuperação incompleta; CR-018 |
| Presence/realtime/debug — services/presence/realtime, stores, HUD | Colaboradores, atualização remota, diagnóstico | Canais Supabase/events/status | Subscribe/unsubscribe/reload, não merge humano automático | Library/catalog/assets; U/I, multiusuário real UNVERIFIED |

### Autoridades e persistência

Há quatro famílias de autoridade que precisam continuar explícitas:

1. **Registro comercial/legacy:** products/families/fields no Supabase, acessados por useLibraryStore. specs não é automaticamente TechnicalDatum canônico.
2. **Conhecimento técnico:** Workbook canônico por owner (product/family), TechnicalDatum/dataset/evidence dentro do documento e SourceDocument compartilhado separado. Índices técnicos/de dataset são projeções de busca, não segunda autoridade de edição.
3. **Composição:** catálogo/template com blocos, tabela estrutural, bindings e valores manuais; save/CAS próprios. Inserir dataset copia estrutura e referencia valores conforme binding.
4. **Mídia/estado local:** assets+storage privados versus media legacy; cache IndexedDB/localStorage e UI/preferences não comprovam ACK remoto nem recuperação integral.

RPCs principais observados: get/save_product_workbook_v2 com compatibilidade v1; search_product_knowledge_v2; RPCs de fonte; list_library_workspace_v1; save_product_v4; save_catalog_v3; save_template_v1; family/field CRUD; asset finalize/link/unlink/set_primary/update/archive/list. SupabaseService contém também caminhos legacy como save_official_product_v2. Não se assume que todo método antigo é usado pela UI corrente.

## E. Feature Connectivity Matrix

FULLY CONNECTED abaixo é avaliação de caminho local/static delimitado, nunca aprovação live. BROKEN significa contraexemplo ou invariante violado; STALE-RISK tem causa concreta de lifecycle.

| Fronteira | Classificação | Evidência/limite |
|---|---|---|
| Library→Product Workspace | PARTIALLY CONNECTED | Classic abre owner; V2 não leva intent exato; CR-013 |
| Library Classic↔V2 | DUPLICATED | Mesmo registro legacy, projeções/seleção/capacidades distintas; CR-004/013/019 |
| Workspace Classic↔Mega | BROKEN | Leitura canônica comum, mas unmount perde draft; CR-002 |
| Product↔Family registry | PARTIALLY CONNECTED | Rename/delete protegidos no contrato; V2 seleção por objeto/nome inconsistente |
| Workbook↔inheritance | FULLY CONNECTED no domínio | Regras de overlay/publishing testadas; consumidores runtime falham em load/policy |
| PIM↔TechnicalDataset | PARTIALLY CONNECTED | IDs/validators/operations fortes; quantity editor quebra round-trip |
| TechnicalDataset↔Tables | BROKEN em cold path | Search encontra, getDataset não materializa; CR-008 |
| Tables↔Catalog | PARTIALLY CONNECTED | TableDocument e bindings persistíveis; snapshots estruturais não são live views |
| Catalog↔Editor | FULLY CONNECTED no escopo local de documento | Active document/lifecycle/undo/CAS com testes; não inclui garantia de export |
| Editor↔persistence | PARTIALLY CONNECTED | Catalog CAS existe; Workbook/Library draft e ACK quebrados |
| Editor↔Export | BROKEN | ACK falho e snapshot/version divergentes; CR-009 |
| Documents↔Evidence | PARTIALLY CONNECTED | Source refs e repository; fonte sem CAS; live inexistente |
| Evidence↔Datum | FULLY CONNECTED no domínio | Candidates/provenance/decision; UI operacional incompleta CR-010 |
| Datum↔Workspace | PARTIALLY CONNECTED | Mega lê, Classic cria/remove; lifecycle de correção incompleto |
| Datum↔Tables | STALE-RISK | Runtime conserva fatos obsoletos/ready incorreto; CR-006/007 |
| Local state↔Supabase | BROKEN em Library/Workbook | Perda de queue/ACK e draft; CR-001/002/003 |
| User action↔visual feedback | BROKEN | False synced, insert no-op, create sem erro, help crash |
| User A↔User B | UNKNOWN live / PARTIALLY CONNECTED static | CAS protege documentos; Source last-writer-wins; realtime não comprova merge seguro |
| Assets↔Editor | PARTIALLY CONNECTED | Refs/signed URL e fontes canônicas testadas; storage real/expiração não verificados |
| Translation↔persistence | PARTIALLY CONNECTED | Cópia traduzida e contratos locais; edge/provider/deploy desconhecidos |

## Fase 3 — One datum / one truth

Exemplo representativo: família aprova pressão 10 bar; produto tem override draft 99 bar; dataset referencia o datum efetivo; tabela de catálogo usa binding.

| Salto | Identidade / valor | Cópia, autoridade e risco |
|---|---|---|
| DB→Workbook | Owner + workbook ID + revision; datum ID estável | Repository parse/validate; contrato SQL preserva payload e índices na transação |
| Família→effective knowledge | Datum herdado mantém referência; override ganha ID derivado ovr_workbookId_familyDatumId | Derivação determinística, não colisão por si só; policy editing e publishing diferem |
| Effective→Mega | View-model conserva dado/proveniência | Consulta canônica local; não editor de semântica |
| Effective→Library V2 | Não há esse caminho completo | specs/fallback gera outra “verdade”; CR-004 |
| Datum→Dataset | Cell/value refs e semantic key | Tipo/unidade/qualifier precisam round-trip; CR-012 |
| Dataset→Table projection | IDs/bindings de valor + estrutura de linhas/colunas | Estrutura é snapshot; binding pode ser vivo. Refresh estrutural deve ser explícito, não prometido implicitamente |
| Table→Catalog binding | ID, owner/revisão/metadados de origem | Resolver composite separa namespace legacy/PIM, mas cache pode estar frio/stale |
| Catalog→Editor | Documento salva referência/estrutura | Only export preloads PIM atualmente; uma edição de Workbook não invalida todos os leitores |
| Editor→Export | Deveria ser a mesma autoridade publicável | Runtime editing oferece draft 99; publishing de domínio retorna 10; audit permite 99. Print refetch não fixa versão |

**Conclusão factual:** ID estável no domínio não garante verdade ponta a ponta. A quebra está nos consumidores e lifecycle de snapshots. Reload preserva payload pelo contrato do repository, mas não prova que UI/draft/cache usam a revisão correta. Não foi observado banco corrompido; foi observada possibilidade de publicar/mostrar valor incorreto.

Outros contraexemplos: workbook antes presente e depois null continua resolvendo fato antigo; produto vazio de pressão adquire fatos térmicos na V2; cold dataset é pesquisável mas não inserível. Esses cenários cobrem ausência, tipo, herança/política e resolução, além do happy path.

## D. Capability Symmetry Matrix

Legenda: Y=caminho alcançável; P=parcial; R=read-only intencional; —=não é propósito da superfície; X=quebrado no cenário identificado. Não exige botões iguais em todas as telas.

| Intent | Library Classic | Library V2 | Classic WS | Mega WS | Dataset/Table tools | Catalog editor |
|---|---|---|---|---|---|---|
| Consultar | Y legacy | X verdade CR-004 | Y Workbook | Y canônico | Y, tipos/caches limitam | Y, binding stale possível |
| Editar produto/valor | Y legacy | P escape | P fatos, Y subset cells | R | P CR-012 / tipos diversos | Y composição, não fato fonte |
| Adicionar | Y registro | P CR-019 | Y módulo/datum/dataset | R | Y | Y |
| Excluir | Y com guards | P escape | Y subset | R | Y estrutura | Y |
| Restaurar | P histórico/backup | P escape | P reload, não undo completo | — | P conforme tool | Y undo; restore parcial |
| Buscar/filtrar | Y | Y registro | P por aba | Y view-model | P por tool/view | P picker CR-008 |
| Organizar | Y famílias/colunas | P scaffold | Y módulos/datasets | R/consulta | Y rows/cols/views | Y blocos/layout |
| Ver fonte | P legacy history | X sem datum real completo | Y refs | Y SourceDrawer | P por binding/tool | P resolver |
| Adicionar evidência | — | P escape | Y parcial | R | Via Workbook | — |
| Resolver conflito factual | — | X claim fixo | P domínio sem ciclo UI | R consulta | P | P bloqueio/audit |
| Undo | P diferenças por ação | P escape | P sem undo unificado | — | P por implementação | Y histórico composição |
| Save | X CR-001/003 | P mesmo store | X CR-002 | — read-only | Via Workbook/catalog | Y CAS, export usa mal falhas |
| Reload | P risco draft | P seleção stale | P draft/load | Y leitura local validada | P cache | Y documento, P knowledge |
| Bulk edit | P grid/CSV | P escape | P transfer/copy | R | P row/column operations | P composição |
| Export | P CSV/entrada catálogo | P escape | P ligação catálogo | R | P projeção/print | X garantia CR-007/009 |

**Assimetrias intencionais/justificadas:** Mega consulta read-only; edição de composição no catálogo não deve alterar fato canônico; estrutura tabular de publicação pode ser snapshot. **Temporary / missing capability:** datum correction/approval/override no Classic, projeção V2 incompleta, Table Core piloto. **Discoverability / inconsistent UX:** escapes genéricos e linguagem “salvar” para autoridades distintas. **Bugs:** perdas, falso PIM, quantity, insertion e export.

### Decisões de default e aposentadoria

- **Library V2 pode ser default? Não neste SHA.** Clareza visual não compensa CR-004/005/013/019 e retorno frequente a Classic. A aprendizagem alegada não foi medida com pessoas.
- **Library Classic pode ser aposentada? Não.** Concentra edição, administração e fluxos ausentes em V2; também precisa corrigir seus próprios saves.
- **Mega pode substituir o Classic Workspace? Não.** Consulta canônica/legibilidade são valiosas; read-only é honesto, mas edição/decisão/organização não têm paridade e a troca perde draft.
- **Mega como consulta opt-in futura?** Pode ser opção após corrigir guarda/verdade/runtime e passar Gate A. Isso não autoriza aposentadoria do editor Classic.

## Fase 5 — Onde mora a edição

C/R/U/D=criar/ler/atualizar/excluir. “Conflito” refere-se ao contrato implementado, não à validação live.

| Entidade | C/R/U/D operacionais | Undo / save / cancel | Autoridade e conflito |
|---|---|---|---|
| Product | Classic C/R/U/D; V2 criação/consulta parcial | Autosave/debounce; retry quebrado; undo não universal | Library store→save_product_v4 CAS; CR-001/003 |
| Family/fields | Classic administração; V2 consulta | Modais específicos e ACK | RPCs family/field, rename/delete integrity; ambiente não verificado |
| TechnicalDatum avulso | Classic C/R/D; U/approval/decisão incompletos | Draft Workbook, sem undo global; save CR-002 | operations.ts + Workbook CAS; CR-010 |
| Dataset | Classic C/R/U/D estrutural/células/views | Draft, dialogs cancel; save Workbook | Tipo validado; quantity editor CR-012; herdado não é dataset local editável implicitamente |
| Catalog Table | Editor C/R/U/D por tipo/piloto | Undo composição; save catálogo | TableDocument/bindings, não owner do fato fonte |
| Source/Evidence | Fonte upsert; evidence no Workbook | Saves separados, cancel conforme modal | Source sem CAS; Workbook com CAS; não prometer transação cruzada |
| Module | Classic C/R/U/D | Draft/save Workbook; CR-002 | Domínio valida organização/referências |
| Catalog/template | Editor C/R/U/D conforme documento | Undo/lifecycle/save CAS | SupabaseService/store; export precisa contrato RR-009 |
| Workspace layout | Organização de consulta/preferences; lab tem experiências adicionais | Local conforme superfície; persistência layout server apenas planejada | Não confundir documento de migration draft com feature implantada |
| Semantic descriptor | Domínio/foundation avançado; ciclo ativo incompleto | Não há paridade de editor operacional | CR-010; não contar SemanticEditor não roteado como solução |
| Asset | Cloud bank/upload/link/update/archive | ACK/erro serviço; ações separadas | Asset metadata/storage/RPC; exclusão/refs protegidas por contrato |

Ctrl+S global em Library flusha Library, não torna automaticamente o draft PIM salvo. Classic Library também tem handler; dois handlers podem invocar flush. Não foi inferido save duplicate server irrestrito sem teste: o finding é o ownership/lifecycle da fila. RR-001/002 e contrato de save visível devem eliminar ambiguidade.

## C. Critical User Journeys

**2/16 PASS_LOCAL**, com escopo estreito; não “duas jornadas live aprovadas”. Status parcial não entra no numerador. As demais têm quebra concreta ou validação incompleta.

| # / persona / jornada | Status | Breakpoint / severidade | Evidência |
|---|---|---|---|
| J01 novo: aguardar resolução de autenticação antes de carregar workspace | PASS_LOCAL | Nenhum bootstrap de dados antes de auth resolver, escopo mock | tests/components/auth-gate + auth/session store suite |
| J02 novo: achar produto e confiar na especificação V2 | FAIL | Fatos inventados, P1 | AUD-003 + browser; CR-004 |
| J03 novo: abrir explicação contextual | FAIL | Tela branca, P1 | AUD-004 + browser; CR-005 |
| J04 engenharia: consultar fato canônico e origem no Mega | PASS_LOCAL | Leitura/source path, sem promessa de escrita/live | mega-workspace-integration + view-model/domain tests |
| J05 engenharia: editar produto, falhar rede, retry, reload | FAIL | Fila perdida/falso synced, P0 | AUD-001; CR-001 |
| J06 engenharia: continuar editando durante ACK Library | FAIL | Self-conflict, P1 | AUD-002; CR-003 |
| J07 engenharia: editar Workbook enquanto save ocorre | FAIL | Edit posterior descartado, P0 | AUD-005; CR-002 |
| J08 engenharia: draft Classic→Mega→Classic | FAIL | Draft descartado sem guarda, P0 | AUD-012; CR-002 |
| J09 engenharia: corrigir/decidir fato e override herdado | PARTIAL | Ciclo UI incompleto, P1 | call-path operations/TechnicalDataTab; CR-010 |
| J10 engenharia: editar medição em tabela e salvar | FAIL | Quantity vira text inválido, P1 | AUD-013; CR-012 |
| J11 comercial: search PIM→inserir dataset no catálogo | FAIL | Cold retrieval undefined, P1 | AUD-009; CR-008 |
| J12 comercial: atualizar conhecimento e rever catálogo | FAIL | Stale/ready ou dependência ausente, P1 | AUD-006/007; CR-006 |
| J13 comercial: aprovar/usar fato→salvar→exportar | FAIL | Draft elegível indevido e falha save ignorada, P1 | AUD-008/010; CR-007/009 |
| J14 admin: dois usuários corrigem fonte compartilhada | FAIL_STATIC | Last-writer-wins, P1 | RPC sem CAS; CR-011; live desconhecido |
| J15 admin: backup→restore trabalho completo | PARTIAL | Snapshot não cobre PIM/assets, P2 | BackupModal; CR-018 |
| J16 power user: teclado, criação V2 e recuperação erro | PARTIAL | Foco/actions/create feedback, P2 | CR-014/019; manual amplo não executado |

Contagem de fricção observável: abrir ajuda requer um clique para falhar; a alternância Classic→Mega→Classic exige duas trocas e reproduz perda; retornar de V2 para Classic exige pelo menos uma troca de superfície, sem garantir chegada ao datum. Cold search→select→insert termina em um dead end. Não foram inventadas médias de cliques, tempos de tarefa ou avaliações de facilidade por pessoas.

## G. Standardization Map e contrato de interação

| Padrão atual | Divergência concreta | Contrato mínimo proposto |
|---|---|---|
| Buttons / ações primárias | Buttons semânticos versus div onClick no export | Button real, disabled/pending, Enter/Space e resultado único |
| Inputs / selects / modal cells | Tipos de domínio mais amplos que controles | Round-trip tipado; validação antes de mutar; unsupported explícito |
| Menus/context menus | Operações/tabular shortcuts variam por tool | Nome/atalho/escopo consistentes para mesmo intent; não exigir mesma feature em toda tabela |
| Drawers/modals | Escape/foco/retorno/trap implementados separadamente | Utilitário de foco/dialog pequeno, nome acessível e cleanup |
| Toast/banner/error | Alert/prompt, inline error, retorno ignorado e falso green | Erro com causa legível, draft preservado, ação recuperável; success só após ACK |
| Loading/empty | Readiness pode ser false; V2 inventa fallback | loading, known-empty, unavailable, failed e stale distintos |
| Search/filter | Query oculta/sem debounce; selectedResult refaz efeito | Closed=0, query coalescida, seleção não é busca, cancel de request anterior |
| Tabs/outline/inspectors | Contexto em objetos locais e escape genérico | IDs estáveis + owner/intent; dirty guard em toda saída |
| Save/dirty/conflict | Autosave Library, save Workbook, CAS catálogo, fonte LWW | Autoridade visível; generation ACK; conflito distinto de offline; nenhum clean prematuro |
| Undo/cancel/restore | Undo composição ≠ cancelar modal ≠ recarregar servidor | Nomear escopo; cancel não salva; reload não descarta sem decisão |
| Tables | Legacy, Core, Dataset e catálogo com controles próprios | Row/column selection/keyboard básicos comuns; edição estrutural versus factual explícita |
| Icons/tooltips/help | Tooltips têm foco; drawer help quebra hooks | Manter foco existente, corrigir lifecycle; tour opcional/dismissível |
| Terminologia | Product specs/PIM/dataset/table e Classic/V2/Mega misturam capacidade | “Dado PIM” só com identidade canônica; “Editar origem” aponta owner; “salvo” indica ACK da autoridade correta |

Não se recomenda redesign ou troca global de framework UI. Reutilizar componentes de campo/inspector já presentes e consolidar apenas os contratos que afetam os fluxos encontrados.

## Fases 8–10 — Persistência, concorrência, tráfego e falhas

### Proteções concretas já existentes

SQL de Workbook (00022/00023) exige editor autorizado, owner existente, revisão esperada, lock de owner/workbook, payload consistente e atualização atômica de documento/índice/audit. Direct INSERT/UPDATE/DELETE de workbook/source/index é revogado para papéis genéricos. Há unique owner, índices por owner/workbook/semantic/status/numeric e índice de dataset para busca. Repositórios validam UUID, schema/invariantes e ACK/revisão. Isso é evidência estática favorável; ledger/aplicação e planos de query reais não foram verificados.

Catalog/template têm CAS e preservação de payload; existem testes de consistência e incident guard 40001. Esses mecanismos não garantem preservação do draft nos consumidores e não cobrem SourceDocument LWW. StorageService usa IndexedDB com fallback localStorage e parsing em caminhos específicos, mas não implementa outbox de produto confirmada pelo servidor.

Realtime existe para produtos/famílias/fields/assets/catalogs/templates. Workbook runtime não tem invalidação equivalente após save/evento; App pode recarregar produtos enquanto Library também trata evento. Presença mostra colaboradores; não prova resolução de conflito ou isolamento de writes.

### Orçamento de requests estimado por código

P=owners de produto necessários, F=famílias distintas, H=owners dos hits da busca. São estimativas de chamadas lógicas, sem medir load Supabase live.

| Tela/ação | Ordem esperada | Amplificação/limite observado |
|---|---|---|
| App bootstrap autenticado | O(1) conjuntos de workspace/assets/templates + subscriptions | StrictMode pode refazer setup; cleanup/coalescing precisam testes de montagem, não apenas service unit |
| Library edição de um produto | O(1) save por lote debounce; série finita se há novos edits | CR-001/003; falhas descartadas não são otimização segura |
| Classic Workbook open | Até produto + família, O(1) por owner selecionado | Instância repository no render não está em deps do load; não prova loop |
| Mega read | O(1) workbooks para owner/família + fonte conforme interação | Guards/single-flight existentes testados localmente; tráfego live desconhecido |
| Knowledge preload do catálogo | O(P+F) leituras, dedupe por identidade | Cache/dependências quebrados CR-006; não é O(1) para catálogo com muitos produtos |
| PIM search | RPC de search + registry/batch + O(H) workbooks | p_limit=50 limita hits, não necessariamente produtos de família expandida; efeito sem debounce e selectedResult repete |
| Picker fechado | Deveria ser 0 | AUD-011 mostra >=1 busca |
| Export modal + janela print | Save + preload O(P+F) + print fetch e assets/fonts | Caminhos duplicam preparo e não fixam autoridade; App effects também existem antes do branch print |
| Evento remoto de produto | Deveria reconciliar/coalescer entidade | Caminhos App/Library podem refazer listagem O(N dados) para evento individual |
| Asset signed URL | Por asset distinto com single-flight/cache | Expiração/storage e grandes volumes não medidos |

Não há evidência nesta auditoria de um novo loop ilimitado de requests. Há tráfego oculto/redundante concreto. Limites de bundle: Vite alertou chunk principal 2.707,25 kB (gzip 673,74 kB). É sinal de custo de startup, não P1 automático sem medição em dispositivo/rede representativos.

### Matriz de falhas

| Condição | Segurança / mensagem / recuperação atual |
|---|---|
| Offline/timeout/500 de produto | Draft pode perder ownership e retry mentir; CR-001. Timeout/lentidão exige teste deferido, não polling infinito |
| 40001 | Server CAS útil; Library pode autogerar conflito; catalog tem guard. Recuperação humana e multiusuário real não aprovados |
| 23505 | Repositories/services têm contratos de erro; feedback por superfície varia. Criação V2 ignora resultado; não assumido PASS ponta a ponta |
| 42501 | Gate/SQL negam; Export pode continuar e V2 create não expõe resultado; CR-009/019 |
| Payload inválido/corrupto | Parsers/validators falham fechado em Workbook; list de fontes pode pular row corrupta. Erro deve aparecer como erro, não ausência de conhecimento |
| Workbook ausente | Bootstrap/known-empty existe; cache anterior não é evictado CR-006 |
| Family-only / família ausente | Domínio suporta herança; falha fetch família é engolida pelo runtime CR-006 |
| Fonte ausente / proveniência parcial | Resolver pode representar unknown; não inventar source. Falta teste de jornada inteira edit/source/export |
| Dataset vazio | Domínio/validação tratam estrutura; UI de estado vazio precisa manter insert elegível só se resolvível |
| Binding quebrado | Audit cobre unknown/conflict em parte; cold/stale e draft escapam em outros caminhos |
| Stale revision / dois usuários | Workbook/catalog CAS estático protege servidor; Source não; draft local e UI precisam preservar intenção |
| Tabela grande | Testes de domínio/scale existem; scroll/sticky/keyboard/export/browser com volume real não medidos |
| Reload durante edit | Library reload pode sobrescrever draft; Workbook ACK/troca já reproduzidos; guard/reconcile obrigatório |
| Fonte salva + Workbook falha | Saves são separados; não prometer atomicidade cruzada. Recuperação deve preservar referência/draft e apresentar estado parcial |

## Fases 11–14 — Qualidade da evidência, runtime, acessibilidade e documentação

### Gates executados no candidato

| Comando/ensaio | Resultado e limite |
|---|---|
| npm ci --ignore-scripts --no-audit --no-fund | PASS, 347 pacotes; sem copiar .env real |
| npm run typecheck | PASS |
| npm test | PASS: 1.649 testes, 154 arquivos; zero failed/pending |
| npm run build | PASS, tsc + Vite 5.4.21; build Vite 13,26 s, warning de chunk |
| npm run lint | NÃO EXECUTÁVEL: Missing script lint; CR-016 |
| Probes adversariais finais | 13/13 reproduziram defeitos, 2 arquivos; não contados como jornada PASS |
| Browser local | Reproduziu V2 falsa verdade e hook crash; demais fluxos não validados nele |
| DB/live/produção | NÃO EXECUTADOS |

Node 24.13.0, Vitest 2.1.9. O JSON da suite apresenta 424 suites aninhadas; isso não são 424 arquivos. O contador correto de arquivos é 154.

tests/setup.ts faz mock de createClient e bloqueia fetch externo. Vitest inclui tests/**/*.test.ts/tsx; scripts .mjs de rehearsal/live não foram executados pela suite. 1.649 PASS comprovam asserts locais existentes, não RPCs implantados ou jornada humana.

**Testar os testes:** o domínio tem cobertura útil de invariantes, revision, inheritance, payload preservation, IDs/cell keys e scale. Mas father-learning verifica render/textos esperados, não compreensão de um usuário novo; fixtures térmicas coincidem com fallback e escondem o caso pressão vazia. Captura de UI estática não executa hooks. O incident test de três chamadas que chama repo/resolver diretamente não mede sozinho um app montado em StrictMode; há também testes de integração Mega, mas não prova de carga live. Faltavam cold cache→insert, ausência após cache aquecido, family fetch error, ACK após edit, saída dirty, abertura inicial de help, quantity round-trip e failure→export. Os probes adicionaram exatamente esses contraexemplos.

**React/TS:** hook condicional é comprovado. Stale closures/draft, load sem cancelamento por owner no Classic e selectedProduct capturado exigem o contrato RR-002/013. Runtime tem epoch guard positivo, mas cache merge incorreto. Casts/any por si só não viraram finding; fronteiras de valor e parser foram verificadas onde há consequência. Null/undefined de source são normalizados no repository; batch pode excluir inválidos, o que precisa ser visível. Não foi inventada colisão de ID no override.

**Acessibilidade:** Escape existe em vários drawers; Mega SourceDrawer tem captura/retorno de foco; tooltips têm foco/blur. Falta trap/consistência e export tem div clicável. Tours são opcionais; teste de Enter deve garantir uma transição por tecla. Sem leitor de tela real ou teste amplo de tab order, ACCESSIBILITY não é PASS.

### Documentation truth

| Artefato/claim | Classificação | Evidência |
|---|---|---|
| README Next/Turbopack, porta 3000 e NEXT_PUBLIC | INCORRECT para candidato | package.json/Vite e VITE_SUPABASE_ |
| Handoff Agente 2 com SHA 048cb960… e LibraryV2Root em caminho inexistente | INCORRECT / STALE | git ref real 23ab359… e src/components/library-v2 |
| Agente 1 “final remote head” 616ead7 | STALE como head, válido como último commit de código antes do handoff | ref final 8ea3d92 adiciona documentação |
| Mega read-only e escape Classic | ACCURATE em capacidade de consulta | Código integrado; “safe switch” é OVERCLAIMED devido CR-002 |
| V2 “zero fabricated metrics” / verdade operacional | OVERCLAIMED | Contadores e fallbacks fixos, CR-004 |
| “ACCESSIBILITY PASS”, “zero dead buttons”, aprendizagem 10/10 | OVERCLAIMED | Hook crash, cold no-op, contratos de foco e testes só de texto |
| Screenshots produzidos por generate_v2_screenshots.mjs | Ilustração; INCORRECT se usados como QA do app | page.setContent de HTML próprio |
| “Typecheck/test/build passaram” | ACCURATE para execução local repetida | Logs desta auditoria; não inclui lint nem live |

## Fases 15–16 — Segurança e operações

**Segurança estática/local favorável:** perfil ativo e papel validado, gate fail-closed, helper require_document_editor_v1 no SQL, grants/revokes explícitos, CAS/owner locks e validação de IDs/payload. Negação no servidor é necessária mesmo com botão oculto. V2 criar produto sem tratar denial é UX, não bypass comprovado.

Sessão auth tem renovação/revalidação; signout reset de catálogo não equivale à limpeza de todos os caches técnicos. O problema de cache foi registrado sem afirmar vazamento multi-tenant inexistente. O app trabalha com equipe compartilhada; modelo de isolamento implantado não foi verificado. Nenhum secret foi impresso ou copiado. Credential vault de tradução usa IndexedDB/AES-GCM/chave não extraível por usuário e modo session; endpoint edge e política de segredo implantados continuam desconhecidos.

**Operação:** 23 arquivos de migrations versionados; desenho de 00024 layout em documentos não comprova aplicação. Workflow de rehearsal 00023 tem branch específica/manual. Não há evidência de CI completo por PR/main neste candidato. vercel.json contém rewrite SPA; não demonstra projeto, env, build command, headers, deploy SHA ou saúde real. VITE_SUPABASE_URL/KEY é o contrato de frontend; README precisa corrigir nomenclatura.

Não foram executados scripts de baseline/gap/migration rehearsal que façam DDL/DML, mesmo que estejam rotulados “rehearsal”. Observabilidade Supabase, logs/alertas, plano de incidentes, backup/PITR/storage, RPO/RTO e rollback implantados não foram auditados live. BackupModal não supre isso (CR-018). Feature flags ?library=v2 e ?workspace=mega deixam Classic default; trocar flag não é rollback de migration nem mecanismo seguro de preservar draft.

**CODE READY não implica PRODUCTION DEPLOYED & VERIFIED.** Neste caso nem o gate de código está completo: lint ausente e contraexemplos P0/P1 ativos.

## Fases 19–20 — Família de tabelas e workflow de catálogo

A família tabular inclui datasets do Workbook, projeção PIM, Table Core/piloto specs_table, TechnicalTableBlock e blocos legacy custom/electrical/accessories/matrix. Não são todas instâncias do mesmo editor.

| Aspecto | Situação |
|---|---|
| Edição/selection/keyboard | Dataset tem modal e operações de rows/cols; Core tem modelo/engine; legacy inspectors variam. Quantity falha; paridade de keyboard amplo não demonstrada |
| Rows/cols/order | Operações de domínio testadas; estrutura inserida no catálogo pode ser snapshot |
| Formatting | Tokens/renderer Core coexistem com styles/inspectors por bloco; reusar contratos, sem exigir migração global agora |
| Binding/source | IDs/projeção úteis, mas cold runtime e invalidation quebram uso; source/decision precisam cadeia completa |
| Saved views | Views pertencem ao dataset e persistem no Workbook; não assumir que todas as tabelas legacy oferecem o mesmo filtro/view |
| Large data/scroll/sticky | Scale de domínio não mede experiência no browser, sticky/scroll ou PDF real; UNVERIFIED onde não exercitado |
| Export | Reuso de render não garante reuso de autoridade; política/snapshot divergem CR-007/009 |

O usuário ainda não recebe uma família de ferramentas com contratos inteiramente coerentes. A correção deve padronizar intent (seleção, edição de valor, estrutura, cancel/save, fonte) e tornar fronteiras explícitas. Não é necessário reescrever todas as tabelas.

Fluxo knowledge→select→table/text/image→editor→save→reload→export: domínio e editor compõem dados, mas knowledge→select pode estar frio; select→table pode ser no-op; dado muda e runtime não invalida; save falha e export continua; print refaz leitura sem pin. Imagens têm uma cadeia própria de assets/signed URLs, cuja operação live não foi testada. A aceitação deve verificar o artefato final contra o snapshot, não só um preview visualmente correto.

## H/I. Remediation waves, packets e revisão

Todos os accepted findings têm packet RR de mesmo número em COMPANY_READINESS_IMPLEMENTATION_PACKETS.md.

1. **Wave 0:** RR-005; RR-001→003; RR-002; contenção RR-004; iniciar RR-016. Impedir perda/falso sucesso/crash e remover fatos fictícios.
2. **Wave 1:** RR-006 e contrato/ensaio isolado RR-011. Readiness e persistência compartilhada.
3. **Wave 2:** RR-007→008→009, completar RR-004 e picker RR-015. Autoridade de ponta a ponta.
4. **Wave 3:** RR-012→010, RR-013 e integração de source CAS. Edição e navegação coerentes.
5. **Wave 4:** RR-014, restante RR-015 e RR-019. Teclado, feedback, requests.
6. **Wave 5:** RR-018, RR-017, operação autorizada e gates de piloto/empresa.
7. **Wave 6:** polish opcional; nenhum P3 aceito foi usado para inflar backlog.

Modelos leves podem começar RR-005, RR-012 focal, RR-004 contenção e configuração RR-016. Save queue/workbook draft têm prioridade igual ou maior de negócio, mas exigem revisão forte de interleavings. RR-006/007/009/011 e semântica RR-010 exigem revisão forte de contrato e integração. Não delegar “consertar tudo” sem as invariantes dos packets.

## J. Release gates objetivos

### Gate A — READY FOR CONTROLLED INTERNAL PILOT

- Zero P0/P1 abertos nos fluxos disponibilizados. Funcionalidade não corrigida só pode ser excluída do piloto por bloqueio real de acesso e escopo escrito; link visível que leva a falha não conta como exclusão.
- Quatro gates passam no mesmo SHA: lint/typecheck/test/build. Probes de defeito viram regressões de comportamento correto e passam em estado frio/quente, ACK atrasado, falha/retry e mudança de owner.
- Todas as 16 jornadas são reavaliadas; as incluídas no piloto passam com evidência local integrada e, em fase autorizada, ambiente de staging com auth/DB reais. Zero UNKNOWN em save/reload/verdade/export do escopo piloto.
- Rehearsal isolado autorizado de migrations, RLS/grants/RPC, CAS de Workbook/catalog/source, concorrência de dois clientes, índice coerente com payload e fail-closed.
- Browser com dados representativos de pressão/temperatura/empty/family-only/override/evidence/dataset, keyboard e artefato de export comparado ao snapshot.
- Request budgets medidos, sem storm em StrictMode/events/falhas; telemetria mínima de erro/save latency/request count com correlação sem conteúdo sensível.
- Backup/rollback ensaiado para o escopo e responsável definido. Deploy de staging associado ao SHA, env correta e kill switch operacional de funcionalidades beta.
- Piloto explicitamente controlado: pequena equipe, dados/fluxos definidos, canal de incidentes, monitoramento e critério de parada. Não usar piloto para descobrir se save perde dados.

P2 remanescente pode ser aceito somente com workaround específico e responsável, sem ocultar blocker de segurança/dados/acessibilidade de um participante.

### Gate B — READY FOR DAILY COMPANY USE

- Gate A concluído e piloto executado em dados representativos, por pelo menos um ciclo de trabalho acordado; sugestão operacional: cinco dias úteis com os papéis engenharia/comercial/admin e 5–10 usuários. Critério é evidência, não só decurso de tempo.
- Zero perda de draft, false success, publicação de dado não elegível, conflito sobrescrito ou discrepância snapshot→export em cenários automatizados e no piloto. Incidentes encontrados corrigidos e regressões adicionadas.
- Todas as jornadas necessárias à empresa aceitas; P0/P1 zero. Cada P2 restante tem aceitação explícita do dono do processo e workaround praticável, sem depender de intervenção manual de banco.
- Multiusuário real: edições simultâneas, permissão revogada/expirada, reconnect, stale version, falha parcial e recuperação comprovados.
- DB/Storage backup restore testado com workbooks, fontes/evidências, catálogos/templates e assets relacionados; RPO/RTO aprovados pela empresa e medidos no drill. Snapshot de browser não substitui esse requisito.
- Deploy Vercel/ambiente equivalente verificado no SHA final; migration ledger conferido; rollback app+schema compatível ensaiado; alertas/rate/observabilidade e responsável de incidente operacionais.
- Documentação atual, roles/limites/defaults claros, onboarding com pessoas e teclado de usuários reais. Não aposentar Classic antes de paridade aceita por jornada.
- Aceite final do auditor forte sobre evidências da versão implantada e dos donos engenharia/comercial/operação. Não reutilizar PASS de outro SHA.

## K. UNVERIFIED items e próxima ação

Permanecem não verificados: estado/ledger do DB live; RLS/grants efetivos; planos/latência de queries e volume real; transações/CAS no servidor implantado; produtos/fontes reais e semântica aprovada; comportamento multiusuário; Vercel SHA/env/runtime; edge translation/provider; upload/signed URL/expiração/storage reais; auth revocation no ambiente; backup/PITR/restore/rollback e RPO/RTO; performance em hardware/rede de usuários; leitor de tela e tab order completo; PDFs finais com dados/fontes reais; aprendizagem por pessoas; observabilidade/alertas/incident response.

**Próxima ação exata:** iniciar missão de implementação da Wave 0 com os packets RR-005 e RR-001→RR-003, além da sessão de draft RR-002; remover os fallbacks CR-004 e habilitar lint RR-016. Re-auditar esses contraexemplos no novo SHA antes de avançar às fronteiras PIM/export. Nenhuma autorização live é inferida desta auditoria.

## Evidências locais e reprodução

Arquivos temporários preservados em C:\Users\Usuario\AppData\Local\Temp\catalog-company-readiness-audit1:

- adversarial.test.tsx; integration-probes.test.tsx; vitest.config.mts.
- probes-final.json e probes-final.log: 13 passed, zero failed, significando defeitos reproduzidos.
- v2-fabricated.png e help-crash.png: browser local real isolado. O primeiro mostra família/produto de pressão com fatos térmicos; o segundo registra tela vazia.
- probes.log contém iterações do harness, não o resultado final consolidado.

Logs gerais em C:\Users\Usuario\AppData\Local\Temp: catalog-company-audit-tests.json/log e catalog-company-audit-build.log. Esses arquivos são locais/temporários, não evidência portátil garantida; os sources dos probes são preservados abaixo.

Comando usado para os probes: node node_modules/vitest/vitest.mjs run --config C:\Users\Usuario\AppData\Local\Temp\catalog-company-readiness-audit1\vitest.config.mts. O harness depende do node_modules do worktree via junction e do tests/setup.ts que bloqueia rede. Para reproduzir em outra máquina, ajustar apenas paths/alias, mantendo doubles e isolamento. Nenhum .env live deve ser usado.

No browser, primeira navegação local fria excedeu 3 segundos; segunda tentativa, limite 4 segundos, abriu. Não houve terceira tentativa. Interações seguintes foram breves. Única tentativa externa observada foi fonts.googleapis.com, bloqueada pelo route. App recebeu fixtures e ações de bootstrap substituídas em memória. Não foi feito Playwright conectado a Supabase live.

### Checklist de conclusão da auditoria

- [x] Inputs/ancestralidade/candidato combinados confirmados, sem alterar main.
- [x] Mapa de features/autoridade/conectividade e edição derivados do código.
- [x] Jornadas, simetria, tabelas e export avaliados com limites explícitos.
- [x] 19 findings com evidência; P0/P1 possuem todos os campos exigidos.
- [x] 19 packets com invariant, arquivos, testes, gates e dependências.
- [x] Gates A/B e itens UNVERIFIED separados.
- [x] Apenas os três documentos de auditoria adicionados ao worktree; nenhum fix ou push.


### Probe source — vitest.config.mts

~~~tsx
import { defineConfig } from 'vitest/config';
export default defineConfig({
 resolve: { alias: { '@': 'C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder-company-audit/src' } },
 test: { root: 'C:/Users/Usuario/AppData/Local/Temp/catalog-company-readiness-audit1', environment: 'jsdom', globals: true, setupFiles: ['C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder-company-audit/tests/setup.ts'], include: ['*.test.tsx'], fileParallelism:false }
});

~~~

### Probe source — adversarial.test.tsx

~~~tsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { SupabaseService } from '@/services/supabase.service';
import { StorageService } from '@/services/storage.service';
import { ProductKnowledgeRuntime } from '@/domain/table-binding/product-knowledge.runtime';
import { createWorkbook, ensureWorkbookV2, addModule, addDatum } from '@/domain/product-workbook';
import { TechnicalDataSection } from '@/components/library-v2/sections/TechnicalDataSection';
import { LearnModeProvider, useLearnMode } from '@/features/guided-help';
import { ContextHelpDrawer } from '@/components/guided-help/ContextHelpDrawer';
import { ProductKnowledgeWorkspace } from '@/components/library/product-workspace/ProductKnowledgeWorkspace';
import { SupabaseProductWorkbookRepository } from '@/services/product-workbook/product-workbook.repository';

vi.mock('@/components/library/product-workspace/WorkspaceSummaryTab', () => ({
 WorkspaceSummaryTab: ({workbook,onUpdateWorkbook}:any) => <div>
  <span data-testid="module-count">{workbook.modules.length}</span>
  <button onClick={()=>onUpdateWorkbook({...workbook,modules:[...workbook.modules,{id:'m'+workbook.modules.length,semanticKey:'m'+workbook.modules.length,label:'M',kind:'key_value',order:workbook.modules.length}]})}>audit edit</button>
 </div>
}));
const pid='11111111-1111-4111-8111-111111111111';
const product:any={id:pid,model:'Pressure-only',code:'PRESSURE',family:'Pressure',specs:{},version:1};
const catalog:any={id:'c',pages:[{id:'p',blocks:[{id:'b',tableRows:[{id:'r',productRefId:pid}]}]}]};
const freshWb=()=>ensureWorkbookV2(createWorkbook({owner:{kind:'product',id:pid},revision:1}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
describe('Independent adversarial probes — PASS means observed defect reproduced',()=>{
 it('AUD-001 failed Library write is discarded and retry reports synced without RPC',async()=>{
  vi.useFakeTimers();
  vi.spyOn(StorageService,'saveProducts').mockResolvedValue(undefined as any);
  const save=vi.spyOn(SupabaseService,'saveProduct').mockResolvedValue({success:false,error:'offline'} as any);
  useLibraryStore.setState({products:[product],isDirty:false,syncStatus:'synced'});
  useLibraryStore.getState().updateProductCell(pid,'range','NEW');
  expect(await useLibraryStore.getState().flushLibraryEdits()).toBe(false);
  expect(useLibraryStore.getState().isDirty).toBe(true);
  expect(await useLibraryStore.getState().flushLibraryEdits()).toBe(true);
  expect(save).toHaveBeenCalledTimes(1);
  expect(useLibraryStore.getState().syncStatus).toBe('synced');
  expect(useLibraryStore.getState().isDirty).toBe(false);
  vi.clearAllTimers();
 });
 it('AUD-002 Library edit during ACK sends stale expectedVersion for next batch',async()=>{
  vi.useFakeTimers();
  vi.spyOn(StorageService,'saveProducts').mockResolvedValue(undefined as any);
  let ack:any;
  const save=vi.spyOn(SupabaseService,'saveProduct')
   .mockImplementationOnce(()=>new Promise(r=>{ack=r;}) as any)
   .mockResolvedValueOnce({success:false,conflict:true} as any);
  useLibraryStore.setState({products:[product],isDirty:false,syncStatus:'synced'});
  useLibraryStore.getState().updateProductCell(pid,'range','A');
  const flight=useLibraryStore.getState().flushLibraryEdits();
  useLibraryStore.getState().updateProductCell(pid,'range','B');
  ack({success:true,data:{version:2}});
  await flight;
  expect(save.mock.calls.map(c=>c[1])).toEqual([1,1]);
  expect(useLibraryStore.getState().syncStatus).toBe('conflict');
  vi.clearAllTimers();
 });
 it('AUD-003 empty pressure product is assigned fabricated thermal facts and inheritance',()=>{
  render(<LearnModeProvider><TechnicalDataSection currentFamily="Pressure" selectedProduct={product} familyColumns={[]}/></LearnModeProvider>);
  expect(screen.getByText('-25 °C a 155 °C')).toBeTruthy();
  expect(screen.getByText('± 0,05 °C')).toBeTruthy();
  expect(screen.getAllByText('Dado PIM')).toHaveLength(7);
  expect(screen.getAllByText('Herdado da Família').length).toBeGreaterThan(0);
 });
 it('AUD-004 first contextual-help opening throws Rules-of-Hooks runtime failure',()=>{
  class Boundary extends React.Component<any,{error:string}>{state={error:''};static getDerivedStateFromError(e:Error){return {error:e.message};}render(){return this.state.error?<span>{this.state.error}</span>:this.props.children;}}
  const Trigger=()=>{const c=useLearnMode();return <button onClick={()=>c.openContextHelp('family')}>audit help</button>;};
  vi.spyOn(console,'error').mockImplementation(()=>{});
  render(<Boundary><LearnModeProvider><Trigger/><ContextHelpDrawer/></LearnModeProvider></Boundary>);
  fireEvent.click(screen.getByText('audit help'));
  expect(screen.getByText(/Rendered more hooks/)).toBeTruthy();
 });
 it('AUD-005 Workbook ACK overwrites later local edit and clears dirty',async()=>{
  vi.spyOn(window,'alert').mockImplementation(()=>{});
  vi.spyOn(SupabaseProductWorkbookRepository.prototype,'getWorkbook').mockResolvedValue(freshWb());
  let ack:any;let sent:any;
  vi.spyOn(SupabaseProductWorkbookRepository.prototype,'saveWorkbook').mockImplementation(p=>{sent=p.workbook;return new Promise(r=>{ack=r;});});
  render(<ProductKnowledgeWorkspace product={product} onClose={()=>{}}/>);
  await waitFor(()=>expect(screen.queryByText('Sincronizando...')).toBeNull(),{timeout:2500});
  fireEvent.click(screen.getByText('audit edit'));
  expect(screen.getByTestId('module-count').textContent).toBe('1');
  fireEvent.click(screen.getByText('Salvar Conhecimento'));
  fireEvent.click(screen.getByText('audit edit'));
  expect(screen.getByTestId('module-count').textContent).toBe('2');
  await act(async()=>ack({success:true,workbook:{...sent,revision:2},revision:2}));
  expect(screen.getByTestId('module-count').textContent).toBe('1');
  expect(screen.queryByText(/Alterações não salvas/)).toBeNull();
 });
 it('AUD-006 runtime retains removed workbook while claiming ready/known-empty',async()=>{
  let wb:any=freshWb();
  wb=addModule(wb,{id:'m',semanticKey:'metrology.general',label:'M',kind:'key_value',order:0});
  wb=addDatum(wb,{semanticKey:'pressure.max',moduleId:'m',label:'Pressure',value:{type:'quantity',amount:10,unit:'bar'},status:'approved',evidence:[]},'d');
  const fetcher={getWorkbook:vi.fn().mockResolvedValueOnce(wb).mockResolvedValueOnce(null)};
  const runtime=new ProductKnowledgeRuntime({workbookFetcher:fetcher});
  await runtime.preloadCatalogProductKnowledge(catalog);
  expect(await runtime.getDatum(pid,'pressure.max')).toBeTruthy();
  await runtime.preloadCatalogProductKnowledge(catalog);
  expect(runtime.getStatus()).toBe('ready');
  expect(runtime.getKnownEmptyProductIds()).toContain(pid);
  expect(await runtime.getDatum(pid,'pressure.max')).toBeTruthy();
 });
 it('AUD-007 family fetch failure becomes ready/known-empty instead of failed',async()=>{
  const runtime=new ProductKnowledgeRuntime({
   registryReader:{getProductsByIds:async()=>[{id:pid,familyId:'f'}]} as any,
   workbookFetcher:{getWorkbook:async(o:any)=>{if(o.kind==='family')throw new Error('500');return null;}}
  });
  await runtime.preloadCatalogProductKnowledge(catalog);
  expect(runtime.getStatus()).toBe('ready');
  expect(runtime.getFailedProductIds()).toHaveLength(0);
  expect(runtime.getKnownEmptyProductIds()).toContain(pid);
 });
});


import {ProductWorkspaceExperienceGate} from '@/components/library/mega-workspace/ProductWorkspaceExperienceGate';
it('AUD-012 switching dirty classic workspace to Mega discards draft without confirmation',async()=>{
 vi.spyOn(SupabaseProductWorkbookRepository.prototype,'getWorkbook').mockResolvedValue(freshWb());
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 render(<ProductWorkspaceExperienceGate product={product} onClose={()=>{}} workbookRepo={{getWorkbook:async()=>freshWb()}} sourceRepo={{getSourceDocument:async()=>null,listSourceDocuments:async()=>[]}}/>);
 await waitFor(()=>expect(screen.queryByText('Sincronizando...')).toBeNull(),{timeout:2500});
 fireEvent.click(screen.getByText('audit edit'));
 expect(screen.getByTestId('module-count').textContent).toBe('1');
 fireEvent.click(screen.getByText('✨ Testar Mega Workspace'));
 await waitFor(()=>expect(screen.getByTitle('Alternar para o Workspace Clássico')).toBeTruthy(),{timeout:2500});
 fireEvent.click(screen.getByTitle('Alternar para o Workspace Clássico'));
 await waitFor(()=>expect(screen.queryByText('Sincronizando...')).toBeNull(),{timeout:2500});
 expect(screen.getByTestId('module-count').textContent).toBe('0');
 expect(confirm).not.toHaveBeenCalled();
});

~~~

### Probe source — integration-probes.test.tsx

~~~tsx
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {ProductKnowledgeRuntime} from '@/domain/table-binding/product-knowledge.runtime';
import {createWorkbook,ensureWorkbookV2,addModule,addDatum,createOverride,resolveEffectiveProductKnowledge} from '@/domain/product-workbook';
import {auditCatalogPublishSafety} from '@/domain/table-core/publish-safety.audit';
import {SupabaseProductKnowledgeProvider} from '@/services/product-knowledge/supabase-product-knowledge.provider';
import {useCatalogStore} from '@/stores/useCatalogStore';
import {useUIStore} from '@/stores/useUIStore';
import {ExportPDFModal} from '@/components/editor/ExportPDFModal';
import {ProductKnowledgePickerModal} from '@/components/editor/picker/ProductKnowledgePickerModal';
import {PDFService} from '@/services/pdf.service';
const pid='11111111-1111-4111-8111-111111111111',fid='22222222-2222-4222-8222-222222222222';
const cat:any={id:'c',title:'Audit',version:1,pages:[{id:'page',pageNumber:1,blocks:[]}]};
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('AUD-008 runtime exports draft override while publishing policy protects approved family fact',async()=>{
 let fw:any=ensureWorkbookV2(createWorkbook({owner:{kind:'family',id:fid},revision:1}));
 fw=addModule(fw,{id:'m',semanticKey:'metrology.general',label:'M',kind:'key_value',order:0});
 fw=addDatum(fw,{moduleId:'m',semanticKey:'pressure.max',label:'P',value:{type:'quantity',amount:10,unit:'bar'},status:'approved',evidence:[]},'d');
 let pw:any=createWorkbook({owner:{kind:'product',id:pid},revision:1});
 pw=createOverride(pw,{targetSemanticKey:'pressure.max',mode:'override',overriddenValue:{type:'quantity',amount:99,unit:'bar'},overriddenStatus:'draft'});
 const binding:any={sourceKind:'pim_datum',productId:pid,semanticKey:'pressure.max',bindingMode:'live'};
 const c:any={...cat,pages:[{id:'page',pageNumber:1,blocks:[{id:'b',type:'specs_table',tableColumns:[{key:'v',label:'V'}],tableRows:[{id:'r',productRefId:pid,cellBindings:{v:binding}}]}]}]};
 const runtime=new ProductKnowledgeRuntime({registryReader:{getProductsByIds:async()=>[{id:pid,familyId:fid}]} as any,workbookFetcher:{getWorkbook:async(o:any)=>o.kind==='family'?fw:pw}});
 await runtime.preloadCatalogProductKnowledge(c);
 expect(resolveEffectiveProductKnowledge({productId:pid,familyWorkbook:fw,productWorkbook:pw,policy:'effective_for_publishing'}).effectiveData.get('pressure.max')?.datum.value).toEqual({type:'quantity',amount:10,unit:'bar'});
 const resolved=runtime.getCompositeDatumResolver()({kind:'datum_reference',productId:pid,datumKey:'pressure.max',bindingMode:'live'} as any);
 expect(resolved?.status).toBe('draft');
 expect(resolved?.value).toEqual({kind:'value_unit',amount:99,unit:'bar',qualifier:undefined});
 expect(auditCatalogPublishSafety({catalog:c,syncStatus:'synced',runtimeStatus:runtime.getStatus(),resolveDatum:runtime.getCompositeDatumResolver()}).canPublish).toBe(true);
});
it('AUD-009 cold global dataset search finds result but getDataset cannot materialize it',async()=>{
 const wb:any={...ensureWorkbookV2(createWorkbook({owner:{kind:'product',id:pid},revision:1})),datasets:[{id:'ds',semanticKey:'pressure.table',label:'P',rows:[],columns:[],cells:{}}]};
 const repo:any={getWorkbook:vi.fn().mockResolvedValue(wb)};
 const provider=new SupabaseProductKnowledgeProvider({client:{rpc:async()=>({data:[{owner_kind:'product',owner_id:pid,source_index:'technical_dataset',dataset_id:'ds'}],error:null})} as any,repository:repo,registryReader:{getProductsByIds:async()=>[{id:pid,model:'P'}],getProductsByFamilyIds:async()=>[]} as any});
 const hits=await provider.search(undefined,'P');
 expect(hits).toHaveLength(1);expect(hits[0].bindable).toBe(true);
 expect(repo.getWorkbook).toHaveBeenCalledTimes(1);
 expect(await provider.getDataset(pid,'ds')).toBeUndefined();
});
it('AUD-010 non-conflict save failure still opens clean server print view',async()=>{
 useCatalogStore.setState({currentCatalog:cat,syncStatus:'synced',editorContext:{kind:'catalog',catalogId:'c'},preloadProductKnowledge:async()=>{},saveActiveDocument:async()=>({success:false,status:'error',errorCode:'42501'})});
 useUIStore.setState({isExportPDFModalOpen:true});
 const open=vi.spyOn(window,'open').mockImplementation(()=>null);
 render(<ExportPDFModal/>);fireEvent.click(screen.getByText('Gerar PDF de Alta Qualidade'));
 await waitFor(()=>expect(open).toHaveBeenCalledTimes(1),{timeout:2500});
 expect(open.mock.calls[0][0]).toContain('catalog=c');
});
it('AUD-011 closed knowledge picker performs search anyway',async()=>{
 useCatalogStore.setState({currentCatalog:cat});
 useUIStore.setState({isProductKnowledgePickerModalOpen:false,knowledgePickerTarget:null});
 const search=vi.fn().mockResolvedValue([]);
 const p:any={isAvailable:()=>true,search};
 render(<ProductKnowledgePickerModal provider={p}/>);
 await waitFor(()=>expect(search).toHaveBeenCalledTimes(1),{timeout:2500});
 expect(document.body.textContent).toBe('');
});


import {CellEditorModal} from '@/components/library/product-workspace/CellEditorModal';
it('AUD-013 quantity cell editor returns text dash instead of original typed measurement',()=>{
 const save=vi.fn();
 render(<CellEditorModal isOpen={true} onClose={()=>{}} dataset={{id:'ds',label:'Pressure'} as any} row={{id:'r',label:'Row'} as any} column={{id:'col',label:'Pressure',valueType:'quantity',unit:'bar'} as any} currentDatum={{id:'d',label:'Pressure',status:'approved',value:{type:'quantity',amount:10,unit:'bar'}} as any} onSaveCell={save} onClearCell={()=>{}}/>);
 fireEvent.click(screen.getByText('Salvar Célula'));
 expect(save).toHaveBeenCalledWith({type:'text',value:'—'},'Pressure','approved');
});

~~~

### Manifesto de integridade das evidências locais

Hashes SHA-256 calculados na conferência final; permitem identificar os arquivos usados, sem transformar evidência local em validação live.

| Arquivo | SHA-256 |
|---|---|
| adversarial.test.tsx | 05F4FC8E63DC4B700BF305E53A8A08B3DAD1C0861080EF634DE166EC7E2DEB32 |
| integration-probes.test.tsx | 25E99AA4D6E947FEE185F58D50C94684FAB99CC2168923B71EC9B1BE0EBF080E |
| vitest.config.mts | 8033773BC4CE5C6D9DD0826E05F1588F039EEC9584B00B1279ED89DA954D367A |
| probes-final.json | 1F352CAD501047BEB9052996649DD504C39FF8FC578ACA6DA5A040B739F173C4 |
| v2-fabricated.png | 57465E050815560A4A5FD928ADEEC0695D96F41F7D39CD078322A848C578067E |
| help-crash.png | D20BA3CA5C02D5679D52E8525123632462D068D4D34A586D04869166F6DE8B69 |

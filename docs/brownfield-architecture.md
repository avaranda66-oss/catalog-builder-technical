# Catalog Builder — Arquitetura Brownfield (estado real)

> Escopo: clone canônico `C:\Users\Usuario\Desktop\CONFIGURATOR PCON\catalog-builder`, commit `004441194294b8f077443f0c0a0727e1b6036a4a` (`main`, 2026-09-01).  
> Data da análise: 2026-09-01.  
> Finalidade: orientar a recuperação do incidente e a preparação de release para uso interno. Este documento descreve o que o código faz hoje; não valida nem pressupõe o estado ao vivo de Supabase, Vercel ou GitHub.

## 1. Resumo executivo e decisão de release

O produto atual é uma SPA Vite/React que funciona principalmente como editor local no navegador, com sincronização direta opcional para Supabase. Ela oferece Biblioteca, A4 Studio e Publications/PDF no mesmo cliente, mas não implementa a arquitetura corporativa documentada no repositório (Auth, papéis efetivos, RPC transacional, RLS corporativa, revisão/publicação e snapshots).

**Decisão arquitetural atual: não liberar para dados técnicos reais ou uso colaborativo até concluir a trilha de segurança e recuperação.** Os motivos são objetivos:

1. a chave Gemini está embutida no bundle fonte em `src/services/ai.service.ts:22-23`;
2. o frontend não realiza login nem usa as RPCs protegidas das migrations (`rg` não encontra `signIn`, `getSession` ou `rpc(` em `src/`);
3. o cliente faz `upsert`, `delete`, `getPublicUrl` e upload direto por uma chave pública em `src/services/supabase.service.ts:53-75`, `157-188`, `260-290` e `415-420`;
4. o carregamento inicial pode trazer dados da nuvem e reenviar dados somente locais sem conflito ou aprovação (`src/stores/useLibraryStore.ts:240-260`; `src/stores/useCatalogStore.ts:333-352` e `361-403`);
5. a geração de PDF produz uma imagem PNG por página; não é PDF vetorial, apesar de a interface afirmar fidelidade vetorial (`src/services/pdf.service.ts:61-66`, `79-141`; `src/components/publications/PublicationsView.tsx:330-337`).

Há evidência histórica de alteração indevida de dados de produção em testes, registrada na auditoria da sessão. O código atual explica o risco: `tests/services/supabase.service.test.ts:11-36` invoca o serviço real e chama push de produtos/catálogos se as variáveis `VITE_*` estiverem disponíveis. **Não executar `npm test` contra esse checkout até isolar o ambiente de teste.**

## 2. Escopo de produto e requisitos que orientam as mudanças

O briefing consolidado em `C:\Users\Usuario\Desktop\CONFIGURATOR PCON\meu-projeto\AUDITORIA_COMPLETA_SESSAO.md:23`, `:143`, `:1473` e `:1271-1274` estabelece:

- biblioteca de produtos como fonte da verdade, simples de operar para uma pessoa habituada a planilhas;
- catálogo com exceções locais preservadas e comparáveis à biblioteca, nunca sobrescritas silenciosamente;
- páginas técnicas e páginas editoriais/ilustrativas na mesma publicação;
- tabelas técnicas retas, de linhas finas, com marcadores quadrado/círculo/asterisco, notas e legendas editáveis;
- presets realmente distintos e reutilizáveis;
- IA que só use informação verificável da biblioteca e mídia real autorizada;
- um percurso integrado: Biblioteca → Studio A4 → revisão/publicação → PDF limpo.

O núcleo de overrides locais existe: `CatalogTableRow.localOverrides` em `src/domain/catalog.schema.ts:81-87`, resolvido por `src/domain/divergence.ts:28-46` e comparado em `:51-107`. Porém, ele não registra a versão do produto de referência nem a proveniência de campo; portanto, é insuficiente como trilha de auditoria de uma fonte da verdade.

## 3. Inventário técnico real

| Área | Implementação atual | Evidência |
|---|---|---|
| Runtime e UI | Vite 5, React 18, TypeScript, Tailwind; SPA com rewrite global Vercel | `package.json:6-31`, `vite.config.ts:1-17`, `vercel.json:1-8` |
| Estado no cliente | Zustand, IndexedDB via `idb`, `localStorage` para colunas, mídia e presets | `src/stores/`, `src/services/storage.service.ts:6-27`, `src/components/editor/PresetModal.tsx:20-30` |
| Domínio | Zod; produto simplificado; catálogo/página/bloco/tabela; `customData` sem contrato rígido | `src/domain/product.schema.ts:11-36`, `src/domain/catalog.schema.ts:3-283` |
| Backend chamado pela SPA | Supabase JS direto, em tabelas e Storage | `src/services/supabase.service.ts:1-25` |
| IA | consulta local determinística e tradução Gemini diretamente do navegador | `src/services/ai.service.ts:22-217`, `:281-324` |
| PDF | `html2canvas` → PNG → `jsPDF` por página | `src/services/pdf.service.ts:38-148` |
| Testes | Vitest de schemas/stores/tokens; dois scripts Playwright não rastreados | `tests/`; `git status --short` no commit analisado |

O ponto de entrada é `src/main.tsx:1-10`, que renderiza `App`. No carregamento, `App` dispara produtos, catálogo e mídia (`src/App.tsx:18-23`). A navegação é estado em memória — não há roteador nem URLs por módulo — e escolhe três telas (`src/App.tsx:30-36`):

```text
Browser
  └─ React SPA / App
      ├─ LibraryView     ← useLibraryStore ← IndexedDB + Supabase tables
      ├─ EditorView      ← useCatalogStore ← IndexedDB + Supabase tables
      ├─ PublicationsView← catálogo local atual + exportação PDF
      └─ MediaGallery    ← localStorage + Supabase Storage/table
```

## 4. Módulos e fluxo de dados atual

### 4.1 Biblioteca

`useLibraryStore` começa com seis produtos de demonstração em `src/data/initialProducts.ts:3-151`, incluindo URLs Unsplash (`:24`, `:49`, `:74`, `:99`, `:123`, `:147`) e especificações sem campos de origem, aprovação ou evidência. A store inicia `isAdmin: true` permanentemente (`src/stores/useLibraryStore.ts:76-84`), portanto isso é um flag de interface, não uma autorização.

Ao carregar, a biblioteca lê IndexedDB/localStorage e depois busca todos os produtos da nuvem. Ela mescla itens por `id`; o que só existe localmente é enviado de volta em segundo plano (`src/stores/useLibraryStore.ts:240-260`). As operações de edição chamam apenas `StorageService.saveProducts` (`:138-220`); não há versionamento remoto, compare-and-swap nem confirmação de gravação no estado exibido.

### 4.2 Studio e catálogos

`useCatalogStore` guarda um `Catalog` em IndexedDB. Cada alteração chama `saveCurrentCatalog`; esta salva localmente e inicia, sem aguardar, um `upsert` na nuvem (`src/stores/useCatalogStore.ts:333-358`). No boot, seleciona o catálogo com `updatedAt` mais recente entre o local e o primeiro retorno remoto (`:361-403`). Isso implementa "last writer wins" do cliente e pode trocar a cópia local de outro navegador por uma versão remota sem revisão de conteúdo.

Os identificadores locais são gerados com `Date.now()` em vários lugares, por exemplo `src/stores/useCatalogStore.ts:274-284`, `:437-444` e `:464-475`. Eles não são UUIDs. O adaptador Supabase tenta omitir um `id` não UUID e faz `upsert` por `sku` ou `name` (`src/services/supabase.service.ts:166-188`, `269-290`), enquanto a migration corporativa usa UUID/RPC. Esta é uma incompatibilidade de identidade e de concorrência, não um detalhe visual.

### 4.3 Tabelas, vínculo com a biblioteca e composição

O motor `TechnicalTable` contém células editáveis, divergência e SVGs para quadrado/círculo (`src/components/technical-table/TechnicalTable.tsx:53-218`, `TechnicalCell.tsx:18-155`, `TechnicalMarker.tsx:29-90`). Os valores dos marcadores ainda são serializados como strings de apresentação (`"■"`, `"□"`, `"*"`, etc.; `TechnicalCell.tsx:28-35`), não como um tipo de negócio por célula. Cor, estado, nota, semântica e variante não têm contrato próprio no domínio.

Há um motor parcialmente compartilhado. `TechnicalTableBlock`, `CustomTableBlock`, `ElectricalTableBlock` e `AccessoriesTableBlock` o usam, mas `MatrixSpecTableBlock` e a matriz em `InsertsVisualBlock` ainda renderizam `<table>` próprias (`src/components/editor/blocks/MatrixSpecTableBlock.tsx:167`; `InsertsVisualBlock.tsx:433`). Portanto, o projeto não possui um contrato comum que cubra matrizes, células mescladas, grupos, notas, paginação e marcadores em todos os blocos.

Há suporte a blocos variados e `customData` para composições ricas (`src/domain/catalog.schema.ts:103-128`; `src/components/editor/EditorView.tsx`), porém a maior parte do conteúdo se organiza por fluxo vertical, não por uma camada livre universal. `CanvasLayer` está declarado em `catalog.schema.ts:36-69`, mas não faz parte de `ContentBlockSchema` como campo formal; é usado livremente dentro de `customData`. As garantias de posicionamento/alinhamento são, assim, específicas de blocos e não de toda página.

### 4.4 Mídia

O Media Store usa a galeria inicial de fotos genéricas e combina localStorage com `media_library` (`src/stores/useMediaStore.ts:14-47`, `146-175`). O serviço usa o bucket público `product-images` e obtém URLs públicas (`src/services/supabase.service.ts:50-83`, `120-151`); registra mídias numa tabela `media_library` (`:349-420`). Não há migration versionada no clone que crie essa tabela ou esse bucket. A migration `00004` cria o bucket **privado** `catalog-images` com URLs assinadas (`supabase/migrations/00004_team_workspace.sql:295-317`), logo o frontend e a arquitetura de banco documentada não falam o mesmo protocolo.

### 4.5 Publications e PDF

Publications é uma tela funcional de listagem local e exportação, não um domínio de publicação. Ela lê o catálogo atual e `savedCatalogs` do navegador (`src/components/publications/PublicationsView.tsx:27-96`, `363-494`), calcula métricas e usa uma verificação limitada às tabelas do tipo `table` (`src/services/ai.service.ts:236-278`). Ela não muda status, não cria versão imutável, não registra autor e não guarda o PDF exportado.

O exportador esconde seletores de edição somente no clone DOM (`src/services/pdf.service.ts:90-137`) e rasteriza uma área fixa de 794×1123 em PNG (`:79-141`). Isso não garante que controles introduzidos por futuros blocos estejam marcados como `no-print`, não trata paginação de tabela longa e não permite afirmar vetor/300 DPI verificável. O argumento `quality` é exposto, mas não é usado em `exportToPDF`.

### 4.6 IA

O drawer chamado "Assistente de IA Factual" executa localmente a comparação e a busca textual (`src/components/ai/AIAssistantDrawer.tsx:20-30`); não há agente com permissões, propostas versionadas ou aprovação humana. A tradução, por outro lado, envia todo o texto do catálogo diretamente à API Google e aplica o resultado ao catálogo corrente, seguido de salvamento (`src/components/common/Navbar.tsx:42-65`; `src/services/ai.service.ts:30-217`).

Isso viola o requisito de propostas revisáveis: não há confirmação por trecho, registro de prompt/resultado, política de quais campos podem ser alterados, nem bloqueio de alteração de especificações por tradução. Também expõe a chave no frontend em vez de usar um proxy de servidor ou gateway (`src/services/ai.service.ts:22-23`).

## 5. Banco e migrations: intenção versus caminho realmente usado

As migrations `00001`–`00004` descrevem uma arquitetura corporativa sólida em intenção:

- `00001_initial_schema.sql:14-145`: profiles, produtos, catálogo, auditoria, versões e runs de IA;
- `00003_rls_policies.sql:5-87`: primeira geração de RLS permissiva a usuários autenticados e leitura anônima;
- `00004_team_workspace.sql:105-135`: remove políticas permissivas e impõe leitura corporativa;
- `00004_team_workspace.sql:148-293`: RPCs `get_catalog_workspace`, `create_catalog_workspace`, `save_catalog_workspace`, CAS e fluxo de aprovação/publicação;
- `00004_team_workspace.sql:295-317`: Storage privado com regras por papel.

Nada em `src/` chama essas RPCs. Em vez disso, `SupabaseService` acessa diretamente `products`, `catalogs` e `media_library`; serializa o catálogo inteiro dentro de `catalogs.brand.pages` (`src/services/supabase.service.ts:269-340`) e serializa os specs em `products.data` (`:166-251`). Essa ponte não tem `expected_version`, `auth.uid()`, status de revisão ou snapshots.

Também não existe prova no checkout de que `00004` foi aplicada no projeto Supabase. As declarações do transcript dizem que políticas públicas/anônimas foram liberadas para a sincronização, inclusive para `product-images` (`AUDITORIA_COMPLETA_SESSAO.md:4293-4295`, `:4644-4663`), mas isso precisa ser confirmado por uma auditoria de banco read-only antes de qualquer migration. Não aplicar migrations às cegas: elas removem políticas existentes (`00004_team_workspace.sql:105-110`) e alteram o modelo de acesso.

## 6. Segurança, integridade e riscos prioritários

| Prioridade | Risco factual | Evidência | Consequência para release |
|---|---|---|---|
| P0 | Chave Gemini hardcoded | `src/services/ai.service.ts:22-23` | Revogar/rotacionar e remover antes de novo deploy; tratar histórico Git e transcript como potencial exposição. |
| P0 | Sem autenticação/autorizações efetivas no cliente | `src/main.tsx`, `src/App.tsx`; ausência de Auth/RPC em `src/`; `isAdmin: true` em `useLibraryStore.ts:79` | Não há identidade confiável para fonte oficial, equipe ou IA. |
| P0 | Escritas diretas e não transacionais na nuvem | `supabase.service.ts:157-188`, `:260-290`, `:415-420` | Risco de sobrescrever/excluir dados e bypassar fluxo corporativo. |
| P0 | Testes podem usar produção | `tests/services/supabase.service.test.ts:11-36` chama rede/push sem mock; incidentes registrados no histórico | Não rodar gates até separar env, mocks e projeto Supabase de teste. |
| P0 | XSS persistente de conteúdo editorial | `TextBlock.tsx:31-41`, `BoxBlock.tsx:35-44` usam `dangerouslySetInnerHTML` sem sanitização | Conteúdo salvo/sincronizado pode executar HTML em outro navegador. |
| P1 | Conflitos entre dispositivos | auto pull/push em `useLibraryStore.ts:240-260` e `useCatalogStore.ts:333-403` | Perda silenciosa de trabalho e dados oficiais. |
| P1 | Mídia pública e schema não versionado | serviço em `supabase.service.ts:50-83`, `:349-420`; migration privada em `00004:295-317` | Acesso e persistência de fotos não são previsíveis/auditáveis. |
| P1 | Dados e imagens de demonstração tratados como PRESYS | `initialProducts.ts:3-151`, `presets.ts:3-563`, `useMediaStore.ts:14-47` | Risco de publicar especificações/fotos não verificadas. |
| P1 | PDF raster e sem QA visual rastreado | `pdf.service.ts:61-141`; scripts PDF não rastreados em `tests/` | Qualidade, cortes e ausência de controles não estão comprovadas. |
| P2 | Documentação e scripts divergem do app real | `README.md`, `docs/architecture.md`, `docs/stories/` descrevem Next.js/API/Auth; `package.json` é Vite | Próximos agentes podem implementar no caminho inexistente. |
| P2 | Presets/estilos não são entidades compartilhadas | `PresetModal.tsx:20-74` usa `localStorage`; cinco presets levam conteúdo e imagens | Não há governança, versionamento ou separação entre receita, tema e dados. |

## 7. Qualidade e observabilidade atuais

`package.json:6-12` oferece `typecheck`, `test` e `build`, mas **não possui** script `lint`, embora README/AGENTS o exijam. A suíte atual testa schemas, divergência, stores e tokens; ela não cobre Auth/RLS, RPC, conflito real, upload autenticado, um PDF renderizado, acessibilidade nem fluxo de um usuário.

Os dois scripts de PDF (`tests/e2e_pdf_test.mjs`, `tests/render_pdf_to_image.mjs`) estão sem rastreamento Git e fazem ações de interface/artefatos fora do repositório. Não são uma gate reprodutível. A própria documentação de rollout antiga afirma fluxos de Next.js/API e resultados que não correspondem ao tree atual; por exemplo `docs/stories/2026-08-31-remote-rollout.md:34-60`.

Não há logging de aplicação, métricas, Sentry, trilha de erro de sync nem correlação de exportação. Mensagens de sucesso representam frequentemente o término local ou um `Promise` fire-and-forget, não um commit confirmado pelo servidor.

## 8. Impacto das mudanças de recuperação

### Mudanças que exigem decisão/backup explícito do usuário

1. **Recuperação de dados:** comparar os backups do Supabase e do navegador antes de alterar tabelas, buckets, policies ou IDs. O incidente relatado impede assumir que a nuvem é a fonte correta.
2. **Rotação da chave Gemini e auditoria de histórico:** deve ser feita no provedor e nas variáveis da Vercel; não se deve copiar valores secretos para commits, docs ou clientes.
3. **Estratégia de acesso:** decidir se a primeira liberação é somente para o pai/admin ou já para equipe. Isso determina convites, papéis, RLS e fluxo de aprovação.
4. **Migração de mídia:** escolher entre migrar os arquivos existentes para `catalog-images` privado ou manter temporariamente `product-images` público. É uma mudança de visibilidade e exige inventário/backup.
5. **Dados de demonstração:** confirmar quais produtos, fotos e especificações são verdadeiros e autorizados. Itens não verificados devem ser rotulados como demo ou removidos antes de publicação externa.

### Decisões arquiteturais recomendadas para a próxima etapa

1. Definir o Supabase como fonte compartilhada única e IndexedDB como cache/rascunho explícito, não como um segundo master.
2. Implementar sessão Auth antes de qualquer write e usar somente as RPCs versionadas (ou uma nova API server-side equivalente) para salvar workspace com revisão esperada.
3. Criar um contrato de produto com proveniência por campo, status de verificação, versão e mídias associadas. Um override de catálogo deve guardar `sourceProductId`, `sourceProductVersion`, valor local, motivo e estado de revisão.
4. Separar `TemplateRecipe` (blocos/layout), `ThemeTokens` (estilo) e `Content` (dados/mídia), com presets versionados no backend. Não salvar um catálogo inteiro como preset local sem classificação.
5. Centralizar todas as tabelas em um modelo tabular capaz de grupos, merge, tipos de célula, marker estruturado, notas, regras de quebra e renderização de impressão; blocos específicos tornam-se presets desse motor.
6. Trocar a saída final por impressão nativa/servidor baseada num snapshot de publicação, validar em fixtures e manter o exportador raster apenas como prévia/opção explicitamente nomeada.
7. Mover Gemini para servidor/edge function, usar allowlist de operações, registrar proposta/diff, exigir aprovação e nunca conceder à IA write direto no banco.

## 9. Sequência mínima de release (não é implementação ainda)

1. **Congelar escrita e preservar evidências:** backup verificável de banco, Storage e cópias locais; inventário de dados afetados pelo incidente.
2. **Fechar exposição:** revogar a chave Gemini, remover a constante e impedir escrita anônima; confirmar policies efetivas do projeto remoto sem as substituir às cegas.
3. **Unificar o contrato de persistência:** alinhar frontend com o schema corporativo ou criar migrations novas e versionadas para o contrato escolhido. Não misturar o adaptador legado com as RPCs.
4. **Isolar testes:** projeto/credenciais de teste, mocks de Supabase no Vitest, testes sem write para produção, e gate lint/typecheck/test/build.
5. **Concluir qualidade de publicação:** fixture de tabela longa, capa, imagem real e controles de edição; comparar Studio/PDF renderizado; bloquear exportação quando houver corte, mídia ausente ou dados não verificados.
6. **Piloto assistido:** um roteiro de tarefa real com o pai (editar biblioteca, criar catálogo, interromper, retomar, comparar override, exportar) antes de ativar equipe/IA autônoma.

## 10. Critérios obrigatórios para qualquer mudança posterior

- Não alterar dados reais, policies, bucket ou deploy sem backup, plano de reversão e aprovação explícita.
- Não usar `.env`, histórico do transcript ou console como meio de transportar segredos.
- Não introduzir escrita direta à tabela se o fluxo escolhido requer versionamento/RPC.
- Toda mudança em dados deve declarar alcance: biblioteca oficial, override do documento ou proposta pendente.
- Tabelas e PDF devem ter teste visual reprodutível e rastreado no Git.
- Toda afirmação de "salvo", "homologado", "AI factual" ou "alta resolução" deve corresponder a uma confirmação verificável, não somente ao estado local da UI.
- Atualizar este documento, PRD e stories com file list e evidências sempre que a arquitetura real mudar.

## 11. Referências primárias usadas

- Código canônico no commit `004441194294b8f077443f0c0a0727e1b6036a4a` e histórico local `git log`.
- `docs/prd.md` e `docs/architecture.md` foram lidos como intenção histórica, não como descrição atual.
- `supabase/migrations/00001_initial_schema.sql` a `00004_team_workspace.sql` e `supabase/tests/workspace_security.sql` foram comparados ao adaptador atual.
- Histórico de requisitos, deploy e incidente: `C:\Users\Usuario\Desktop\CONFIGURATOR PCON\meu-projeto\AUDITORIA_COMPLETA_SESSAO.md`.


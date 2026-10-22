# Plano Father-Ready

**Base:** branch `claude/father-ready-20261014` (42ffb60, só local), sobre `main` e932e87 (PR #86), que é o que está em produção. **Data:** 2026-10-15. **Revisão:** esta versão incorpora a crítica de 38 itens. O que não foi aplicado, ou foi aplicado com ajuste, está na última seção.

**Evidência.** VERIFICADO quer dizer que foi visto no código com `arquivo:linha`, rodado ou observado em produção. ALEGADO quer dizer que só aparece em docs ou recibos. "Harness" quer dizer que foi visto em navegador real, mas numa página local com backend simulado ou persistência local, não em produção. Os 12 relatórios de auditoria são citados como [entrada] [editor] [tabelas] [persist.] [IA] [intake] [export] [domínio] [web] [walkthrough] [portões] [ao vivo].

**Severidade.** P0 = impede o pai de terminar um catálogo ou faz perder dados. P1 = atrito sério ou saída errada que ele vai encontrar. P2 = incômodo. P3 = polimento.

**Esforço.** S ≤ 4 h. M = uma passada focada (4–8 h). L = duas passadas, dividir em a/b. XL = épico já quebrado em FRs.

**Caminhos.** Componentes de UI novos ficam em `src/vnext/app/editor/`, que ainda não existe. Módulos puros ficam em `src/vnext/editor/`, que já existe e guarda `table-cell-draft.ts`, `table-selection.ts` e `table-fit-height-authoring.ts`.

---

## 1. Diagnóstico honesto

**O que funciona de verdade**

1. **O núcleo técnico é sólido (VERIFICADO).** Inclui:
   - `CatalogDocument` canônico e ações tipadas com checagem de revisão (CAS);
   - desfazer por `transactionId` (`application/session.ts:76-81`);
   - motor de tabela estrito (spans, seções, notas, células de imagem);
   - autosave de 1,2 s com CAS e recuperação em IndexedDB (`persistence/autosave-coordinator.ts:16`, `save-coordinator.ts:164-189`);
   - renderizador único;
   - PDF vetorial pesquisável com Noto Sans embutida. A prova W5C é real, mas rodou com backend simulado ([export], `result.json:92`).
2. **No navegador funciona, mas só em harness.** Foram dois harness locais: `agent-full-workflow-browser.html`, que replica o modo de produção, e `w3i-father-browser.html`, com biblioteca e ponte de assets reais mas **persistência local** ([walkthrough]). Funcionaram:
   - colar do Excel numa grade existente (mantém `±0,1 °C` exato);
   - mesclar, notas de tabela, desfazer e refazer;
   - envio de imagem;
   - salvar → reabrir → recarregar, **visto só no w3i**; com Supabase real ainda falta (J7 da Onda 1);
   - a revisão "Publicar / PDF" com status "Pronto".

   Zero erros de console em cerca de 15 execuções.
3. **Produção roda e932e87 e o CI de `main` está verde (VERIFICADO, [ao vivo]).** Os bloqueios determinísticos dos portões foram corrigidos em 42ffb60. Restam 5 testes instáveis por timeout ([portões]).

**O que bloqueia o pai**

4. **Ele nem chega ao editor novo.** Ao entrar em `/`, cai no app clássico: em inglês, com outro banco de catálogos e exportação raster. O `/v2` só abre se ele digitar o endereço (`src/main.tsx:5-10`, `src/App.tsx:55-61`; VERIFICADO em produção).
5. **A IA não funciona para ele.**
   - Exige uma chave Gemini pessoal e uma senha de 12+ caracteres por dispositivo, e trava de novo ao fechar o painel (`CatalogNativeComposer.tsx:40,65-68,91-95`). O servidor já aceitaria a chave dele próprio: `request.key ?? GEMINI_API_KEY` (`vnext-catalog-composer/index.ts:153-155`). Ainda assim exige `VNEXT_CATALOG_COMPOSER_ENABLED`, `BUDGET_MODE=bounded-acceptance`, origem permitida e `profiles.role` admin ou editor com `is_active` (`:132-146`).
   - Mesmo com chave, ela só gera esqueletos: até 4 páginas, com títulos e tabelas vazias (`index.ts:167-175`).
   - A saída é cortada em 2.300 tokens (`:8`), sem `thinkingConfig` (`:181`). Qualquer `finishReason` diferente de STOP vira 502 (`:202`).
   - São cerca de 10 chamadas por dia (`00027:37-38`, reserva de 9.350 µUSD por chamada), e qualquer falha mostra a mesma mensagem genérica.
   - **O secret `GEMINI_API_KEY` é compartilhado** (VERIFICADO). Leem o mesmo secret: a tradução (`vnext-translation-provider/index.ts:330`, fixada em `gemini-2.5-flash` em `:16`), o `translation-provider-v1` (`:40`, também na 2.5) e o `vnext-catalog-agent` (`:89`). Hoje não se sabe se ele existe.
   - Nunca houve uma chamada real autenticada ao Gemini em `/v2`: todas as provas usaram Gemini falso ([IA]). A função implantada é a do PR83, sem os designs de tabela ([ao vivo]).
6. **Nenhum arquivo chega à IA.**
   - `source-intake.ts` existe, mas nada o importa.
   - O único caminho de PDF pede um "Manifesto JSON" escrito à mão (`VerifiedPdfTableReview.tsx:104-108`).
   - A verificação é tudo ou nada, com citação de uma linha só. Tabelas 2D reais nunca passam (`pdf-literal-evidence.ts:50-74`, `pdf-grounded-input.ts:93-98`), e o mínimo é de 2 modelos (`ai-catalog/contracts.ts:32-36`).
7. **Os arquivos reais do pai quebrariam a importação (VERIFICADO com os arquivos dele):**
   - o PCON-MASTER tem 12 abas, acima do limite de 10 (`source-intake.ts:160`);
   - a DB_SENSORS tem 69 linhas × 12 colunas, acima do limite de 10 colunas (`source-intake.ts:163,215`) e das cerca de 7 que cabem em A4 retrato;
   - o folder do PCON-Y17 tem 24,1 MB, acima do limite de 20 MB;
   - abas ocultas, preços e AccessLogs (com cliente e e-mail) entrariam;
   - um CSV brasileiro com vírgula no cabeçalho corta decimais sem avisar ([intake], [domínio]).
8. **As fontes do próprio pai divergem.**
   - TA-25N: faixa 140 vs 155 °C, ambiente 20 vs 23 °C, dimensões diferentes, exatidão em mA de 0,02 vs 0,01 % FS.
   - PCON-Y17: estabilidade e esquema de código de pedido diferentes.
   - Escolher em silêncio produz uma ficha técnica errada ([domínio]).
9. **O editor trava e é pequeno demais para ele.**
   - Digitar "12,5" em X/Y bloqueia cliques, Desfazer e Salvar (VERIFICADO em navegador). A vírgula também é recusada no padding da célula (`EditorWorkspace.tsx:3165-3185`) e no `TableStyleInspector.tsx:110-130,325-361`. HEX inválido é ignorado sem aviso (`TableStyleInspector.tsx:121-128`).
   - Não dá para excluir, duplicar ou reordenar páginas.
   - Não há estilo de texto: todo texto novo sai em 16 pt negrito (`editor-defaults.ts:208-221`).
   - A página fica fixa em zoom 0,62 (`styles.css:61,491`): texto com cerca de 7 px e alças de 6 px.
   - As mensagens aparecem em y≈2596 numa tela de 768 px ([editor]).
10. **As tabelas não parecem planilha.**
    - A célula é editada no painel lateral, que fica fora da tela em 1280×720. Começa como "Vazio", e digitar sobre a célula não faz nada (VERIFICADO).
    - Tabela nova é 1×1 (`editor-defaults.ts:204`), e colar não cria nem aumenta a tabela.
    - Há cerca de 75 controles, com duplicatas. Os presets ficam escondidos, e 3 de 4 presets deixam as linhas de seção ilegíveis.
    - **Uma tabela maior que uma página A4 não publica** ([tabelas], [walkthrough]).
11. **Foto de celular com rotação EXIF bloqueia o PDF para sempre** (VERIFICADO no Chrome 155; `rendering/resources.ts:75`). HEIC de iPhone nem é aceito (`asset/sniff.ts:1-7` só reconhece PNG, JPEG e WebP). A lista de fotos do catálogo só cresce, e a tela de recuperação bloqueia o editor por sobras de qualquer catálogo ([persist.]).
12. **Gerar o PDF é sofrido.**
    - O diálogo fica preso em "Salve o catálogo…" se ele clicar logo depois de editar.
    - "Corrigir este item" nunca aparece, porque `VNextApp.tsx:112` não passa `onLocateDiagnostic`.
    - O diálogo de impressão pede 6 ajustes.
    - "A COMPLETAR" passa como READY ([export]).
13. **O conteúdo é pobre.**
    - Há 2 modelos iniciais, e o do TA-25N traz 6 campos "A COMPLETAR" e notas impressas na página.
    - As referências (Additel, Fluke, Isotech, PRESYS) usam cerca de 9 arquétipos de página.
    - O protótipo carimba "MATERIAL SINTÉTICO DE TESTE" (`institutional-pages.ts:45`) ([domínio]).
14. **Há trabalho em risco.** Cerca de 1.587 linhas de revisão de fontes PRESYS existem só num worktree Codex não commitado, e o `native-table-proposal.ts` só existe no rascunho #77 ([ao vivo]). Hoje nenhum desses arquivos tem consumidor.
15. **O processo gerou "prova" em vez de produto.**
    - Houve provas com mocks marcadas como verdes, um E2E de jornada completa pulado, stories "Ready for Dev" com tudo desmarcado e docs contraditórios (a 00026 aparece como aplicada e como pendente).
    - O CI roda cerca de 30 provas Chromium que o portão local não roda (`quality-gates.yml:50-106`). Cinco delas preenchem "A COMPLETAR" e esperam o PDF liberado: `w5c-publication-review-proof.mjs:247`, `pilot-c1-official-starter-proof.mjs:205`, `w5b-translation-review-copy-proof.mjs:221`, `p2-multilingual-translation-center-proof.mjs:321` e `productization-p1c-product-coherence-proof.mjs:403`.
    - `EditorWorkspace.tsx` tem 5.450 linhas e 115 botões, e concentra bugs e conflitos.

---

## 2. Definição de pronto

**Regra.** Uma jornada só conta como pronta quando é executada:
- em produção, ou num Preview com Supabase real. Jornadas de IA rodam em produção depois do merge e do deploy da função, ou em Preview se a origem estiver liberada;
- com Gemini real;
- sem console aberto e sem ajuda;
- primeiro por Gabriel fazendo o papel do pai, depois em **sessões observadas com o próprio pai (30 min)**: uma ao fim da Onda 1 e outra ao fim da Onda 4, mais o aceite final na Onda 5.

Na Onda 0, Gabriel levanta o ambiente real do pai: resolução, escala do Windows, navegador, celular (iPhone ou Android) e mouse.

Se o pai travar, o ponto vira P0/P1. A coluna "Onda" indica quando a jornada passa a ser possível.

| # | Jornada que o pai completa sozinho | Critério objetivo | Onda |
|---|---|---|---|
| J1 | Abre `catalog-builder-technical.vercel.app`, entra e vê "Meus catálogos" do `/v2`. | Não digita `/v2`; tudo em português; no máximo 1 redirecionamento. | 1 |
| J-IA1 | Abre o Assistente sem chave pessoal e pede "capa e especificações do TA-25N". | Recebe uma proposta com o design datasheet. Hoje ela é um esqueleto: títulos e tabela sem valores. Ele clica em Aplicar, e um único Ctrl+Z desfaz tudo. Com o limite diário atingido, aparece uma mensagem em português dizendo o que fazer. | 1 |
| J2 | **Cria com IA:** "Novo catálogo" → nome "TA-25N — Ficha técnica 2026" → "Criar com IA a partir de arquivos" → solta o PDF do folder TA, o manual PT, a planilha e 3 fotos → pede "Monte a ficha técnica do TA-25N em português". | Prévia de 4–6 páginas A4: capa com foto, visão geral com destaques, especificações comparativas, códigos de pedido e acessórios, contracapa. Antes de aplicar, o painel "Pendências (N)" mostra os conflitos (140 vs 155 °C, dimensões, exatidão em mA) com o trecho de cada fonte. Ele escolhe e clica em Aplicar, e um único Ctrl+Z desfaz tudo. Nenhum número da página fica sem fonte; o que não foi decidido sai como "A COMPLETAR" e bloqueia o PDF. | 4 (parcial: na 2, planilha → tabela sem IA; na 3, tabela de especificações verificada a partir do PDF) |
| J3 | **Ajusta por conversa:** "aumente a foto da capa", "deixe a tabela mais compacta", "separe as especificações elétricas". | Cada pedido mostra um cartão antes/depois com Aplicar / Ajustar / Descartar, e Desfazer funciona. | 4 |
| J4 | **Edita à mão sem travar:** digita direto na célula (Enter desce, Tab anda); cola uma tabela do Excel numa página vazia; transforma um texto em "Título"; exclui uma página extra e reordena; põe zoom de 100%; digita "12,5" no campo X. | Nada trava. A tabela colada já tem cabeçalho e estilo. Alvos na tela ≥ 24 px. | 1 (zoom, páginas, "12,5", colar) / 2 (célula inline, estilo) |
| J5 | **Tabela longa:** tabela de faixas com 40 linhas → "Continuar na próxima página". | Duas páginas com cabeçalho repetido; o PDF sai. | 2 |
| J6 | **Foto de celular:** insere um JPEG retrato tirado no celular e, depois, uma foto HEIC de iPhone. | O JPEG aparece na orientação certa e o PDF não bloqueia. O HEIC mostra uma mensagem clara de como converter. | 1 |
| J7 | **Salvar e reabrir (Supabase real):** fecha a aba no meio da edição, reabre outro catálogo e depois o mesmo. | Nenhuma tela bloqueante vinda de outro catálogo. Tudo está lá. Status "Salvo às HH:MM". Recuperação em linguagem simples. | 1 |
| J8 | **PDF:** clica "Publicar / PDF" logo depois de editar. | O app salva sozinho e mostra "Pronto", ou uma lista com "Corrigir este item" que leva ao objeto. **Onda 1:** o agente valida até "Pronto" ou "Corrigir este item"; a impressão é um checklist humano do Gabriel (Chrome e Edge, 100% e 125%, no PC do pai) mais a prova automatizada `page.pdf`. O PDF sai A4, pesquisável e sem "A COMPLETAR". **1 clique:** só se o FR-53 entrar. | 1 / 3 (condicional) |
| J9 | **Idiomas:** gera as cópias EN e ES, revisa e baixa o PDF EN. | EN com ponto decimal e "% FS"; "1.500" ambíguo pede confirmação. | 4 |
| J10 | **Dois funcionários no mesmo catálogo.** | O segundo vê um diálogo claro com "Salvar meu trabalho como cópia" como padrão; o endereço é atualizado; nada se perde. | 2 (texto seguro já na 1) |
| J11 | **Biblioteca:** acha o catálogo buscando "Y18", duplica como modelo, arquiva por engano e recupera. | Funciona sem ajuda. | 1 (nome; recuperar via "Duplicar" na linha arquivada) / 4 ("Restaurar") |
| J12 | **Planilha da empresa:** importa `PCON-MASTER-ENGLISHV2.xlsx` e escolhe DB_SENSORS. | Preços, AccessLogs e abas ocultas ficam fora por padrão. Ele escolhe as colunas (até 7 sugeridas em A4 retrato). Vírgulas e decimais idênticos ao Excel. As 69 linhas viram uma tabela dividida em páginas, com cabeçalho repetido. | 2 |
| J13 | **Falhas:** rede desligada por 30 s durante a edição (emulação offline), sessão expirada, limite de IA atingido, envio de foto grande. | Em todos os casos a mensagem fica visível sem rolar a tela, nada se perde e o salvamento é retomado sozinho. | 1 (IA, foto) / 2 (rede, sessão) |

---

## 3. Backlog deduplicado e priorizado

As tags entre colchetes mostram quais auditorias foram fundidas em cada item.

### 3.1 P0 — bloqueiam o pai ou perdem dados

**FR-01 · Login leva direto a "Meus catálogos" (`/v2`); app clássico só com `?classico=1`**
P0 · S · Onda 1 (1A) · Dep.: nenhuma · [entrada][walkthrough][export]
- **Pai:** hoje cai no "A4 Studio (Editor)" clássico, em inglês e com PDF raster (`src/stores/useUIStore.ts:65`, `Navbar.tsx:47-201`, `src/services/pdf.service.ts:84-155`). **Decisão:** não haverá conversor clássico→v2, porque não existem catálogos reais (UPDATE). O clássico vira modo de administrador.
- **Como:** em `src/App.tsx:55-61`, usar `consumeTrustedV2ReturnTarget() ?? (querClassico() ? null : '/v2')`, onde `querClassico()` lê `?classico=1`. Adicionar o link "Abrir editor de catálogos" em `src/components/common/Navbar.tsx`. Manter `bootstrap.tsx:75-78` como está (usuário não autenticado vai para `/`).
- **Teste:** unitário em `tests/app/root-redirect.test.tsx`: sem alvo → `/v2`; `?classico=1` permanece; sem laço. No navegador: produção logada → biblioteca `/v2`.

**FR-10 · Campos numéricos aceitam vírgula e não travam o editor**
P0 · S · Onda 1 (1C) + Onda 2 (2D) · [editor] (VERIFICADO em navegador)
- **Pai:** digita "88,5" ou "88.0" em X e passa a não conseguir clicar, desfazer nem salvar ("Conclua ou reverta a edição do Inspector…"). Padding "1,5" é recusado. HEX inválido é ignorado sem aviso.
- **Como:**
  - novo módulo puro `src/vnext/editor/decimal-ptbr.ts`, usado em **todos** os campos numéricos;
  - na 1C, em `EditorWorkspace.tsx`: `commitInspector` (`:2875-2891`) e padding e propriedades de célula (`:3160-3200`);
  - comparar números, não texto, ao decidir se há edição pendente (`:632-640`, `:1019-1030`);
  - valor inválido volta ao valor atual e mostra o erro ao lado do campo (`:4242-4264`);
  - Esc reverte;
  - clicar fora reverte em vez de bloquear (`:1044-1046`, `:3073-3080`);
  - na 2D: `TableStyleInspector.tsx:110-130,325-361` e amostras de cor no lugar do campo HEX.
- **Teste:** unitário de `decimal-ptbr` + novo `tests/vnext/app/father-editor-safety.test.tsx` com "88,5", "88.0", "abc" e padding "1,5". Navegador: harness `p1a-productization-browser.html`.

**FR-11 · Páginas: duplicar, excluir, mover**
P0 · S · Onda 1 (1C) · [editor][walkthrough]
- **Pai:** uma página criada por engano, ou páginas a mais vindas da IA, vão para o PDF. O motor já tem `page.duplicate`, `page.delete` e `page.reorder` (`application/execute.ts:786-826`), mas a tela não os usa.
- **Como:**
  - extrair o painel de páginas (`EditorWorkspace.tsx:3717-3748`) para `src/vnext/app/editor/PagePanel.tsx`;
  - cada página ganha um menu ⋯ com Duplicar, Mover para cima, Mover para baixo e Excluir;
  - a confirmação de exclusão cita o nome da página e o número de objetos;
  - reusar `prepareAuthoringForContextChangeRef`, como em `addPage` (`:2300-2308`);
  - transformar `LAST_PAGE_REQUIRED` em mensagem clara.
- **Teste:** unitário do PagePanel (ações + Desfazer). Navegador: catálogo de 3 páginas → excluir, mover, Ctrl+Z.

**FR-30 · Editar dentro da própria célula, como no Excel**
P0 · L · Onda 2 (2A) · Dep.: FR-92, FR-16a · [walkthrough P0][editor][tabelas]
- **Pai:** dá duplo clique, digita e nada aparece. O editor fica no painel lateral (y=1154 numa tela de 720 px), começa em "Vazio" e só salva com Ctrl+Enter ou "Concluir" (`table-cell-draft.ts:39`, `EditorWorkspace.tsx:4790-4923`, `table-grid-overlay.tsx:316-336,475-484`).
- **Como:**
  - novo `src/vnext/app/editor/CellInlineEditor.tsx`, posicionado pelas trilhas x/y de `table-grid-overlay.tsx:94-98,464-469` e renderizado fora do zoom, consumindo `useStageZoom()` (FR-16a);
  - reusar `createTableCellDraft`, `validateTableCellDraft` e `applyCellDraft` (`EditorWorkspace.tsx:1387-1398`);
  - célula vazia começa como texto (`changeTableCellDraftType`, `table-cell-draft.ts:55`);
  - teclas, no keymap puro `src/vnext/editor/editor-keyboard.ts` criado pela 1C:
    - tecla imprimível começa a edição e substitui o conteúdo; F2 mantém o conteúdo;
    - Enter salva e desce (`table-selection.ts:291`); Tab anda para a direita;
    - Tab na última célula cria uma linha (`table.axis.insert`);
    - Alt+Enter quebra linha; Esc cancela só o que foi digitado nesta edição;
  - **"+" ao passar o mouse e menu de contexto da grade** (vindos do FR-34), porque ficam em `table-grid-overlay.tsx`, perto de `:408-445`;
  - barra de símbolos (`EditorWorkspace.tsx:150`) acima do editor;
  - Código técnico e Medição passam para "Avançado".
- **Teste:** unitário do keymap e do overlay. Navegador em 1280×720: preencher uma tabela 10×4 só pelo teclado, sem rolar a página.

**FR-35 · Tabela maior que uma página A4: "Continuar na próxima página"**
P0 · M · Onda 2 (2I) · Dep.: FR-67 (porte do paginador, 1H), FR-33 (2D) · [tabelas P0][export][domínio]
- **Pai:** tabelas de faixas e de códigos com 30–69 linhas (PCON-Y17 p11, TA p10, DB_SENSORS) dão `TABLE_CONTENT_OVERFLOW` (`publication/preflight.ts:70-72`), e o editor diz que a divisão é manual (`EditorWorkspace.tsx:3846`).
- **Como:** só compondo ações que já existem, **sem tocar `contracts.ts` nem `execute.ts`**:
  - novo módulo puro `src/vnext/editor/table-split-authoring.ts`, que usa `src/vnext/table/table-pagination.ts` (portado na 1H a partir de `src/domain/table-core/table.pagination.ts:73-238`) para achar o ponto de corte;
  - numa única transação, no padrão de `native-compose.ts:126-165`:
    - `page.add{afterPageId}` (`contracts.ts:38-41`);
    - `object.insert` de uma TableModel com os cabeçalhos clonados (IDs novos), as linhas restantes e as anotações;
    - `table.axis.remove` das linhas movidas;
    - legenda "(continuação)";
  - a ação é explícita e desfazível, porque o contrato W4 proíbe re-layout automático (`docs/vnext/W4-ADVANCED-TABLE-EDITOR-CONTRACT.md:26`);
  - botão como correção no IssuesPanel (registro `issue-fixes.ts`) e no painel da tabela;
  - o intake (FR-64) e o compilador (FR-69) usam o mesmo módulo ao inserir tabelas longas.
- **Teste:** unitário `tests/vnext/editor/table-split-authoring.test.ts`: 40 linhas → 2 páginas, cabeçalho repetido, Desfazer volta a 1 tabela. Navegador: J5 e J12.

**FR-40 · Foto de celular (EXIF) normalizada no envio; HEIC com mensagem clara**
P0 · M · Onda 1 (1E) · [persist.] (VERIFICADO no Chrome 155)
- **Pai:** um JPEG retrato com Orientation=6 é medido como 40×20 no envio e exibido como 20×40. O PDF dá `ASSET_DIMENSIONS_MISMATCH` (`rendering/resources.ts:75`), e reenviar não resolve. HEIC é recusado sem explicação.
- **Como:** em `DefaultAssetPersistenceBridge.finalizeUpload` (`asset/bridge.ts:120-160`), antes de medir:
  - ler a orientação EXIF com um parser puro novo em `asset/normalize-image.ts`, também usado como alternativa em `asset/sniff.ts` (troca largura e altura nas orientações 5–8);
  - **só reencodar quando a orientação for diferente de 1 ou o lado maior passar de 3000 px**: decodificar com `createImageBitmap(...,{imageOrientation:'from-image'})`, redesenhar em OffscreenCanvas, reencodar (JPEG q≈0,9, ou PNG se houver transparência) e reduzir para 3000 px no lado maior;
  - nos outros casos, manter os bytes originais, que hoje chegam ao PDF sem reamostragem ([export]);
  - calcular hash e medidas sobre os bytes finais;
  - HEIC e `.jfif`: mensagem "Esta foto está em HEIC. No iPhone, use 'Mais compatível' ou envie como JPEG."
- **Teste:** unitário com fixture JPEG Orientation=6, um JPEG normal (bytes inalterados) e uma assinatura HEIC, em `tests/vnext/asset/`. Prova Chromium do envio até o PDF READY. Navegador: foto real de celular (J6).

**FR-60 · IA sem chave pessoal: chave do servidor como padrão; chave própria em "Avançado"**
P0 · S · Onda 1 (1B) · Dep.: sonda da Onda 0 (FR-63) · [ao vivo][IA][entrada][walkthrough]
- **Pai:** hoje recebe "Primeiro conecte e desbloqueie sua chave Gemini neste dispositivo."
- **Como:**
  - `CatalogNativeComposer.tsx:91-95` envia sem credencial por padrão; `native-compose-client.ts:16-28` já omite a credencial;
  - `ProviderCredentialsSettings.tsx` fica atrás de "Usar minha própria chave (avançado)";
  - **sem flag VITE**, para não depender de acesso ao Vercel;
  - o composer lê `VNEXT_COMPOSER_GEMINI_API_KEY ?? GEMINI_API_KEY`, para **nunca** precisar sobrescrever o secret compartilhado com a tradução;
  - nova tarefa `status` no composer (`supabase/functions/vnext-catalog-composer/index.ts`), que devolve `{enabled, mode, remainingMicrousd}`; a UI mostra "IA pronta" ou o motivo;
  - o cliente aceita o composer antigo e o novo: sem `status`, mostra "IA disponível".
- **Teste:** unitário do componente: envia sem credencial; `PROVIDER_NOT_CONFIGURED` vira mensagem em português; composer antigo é tolerado. Real: J-IA1 em produção depois do merge e do deploy, com o custo registrado na tabela de orçamento.

**FR-64 · Arquivos chegam ao assistente (zona de soltar + "Criar com IA a partir de arquivos")**
P0 · L · Onda 2 (2E) · Dep.: FR-65, FR-01, FR-60, FR-35 · [intake P0][IA][entrada][walkthrough]
- **Pai:** não tem como entregar PDFs, planilhas ou fotos. O composer avisa "Não interpreta PDFs" (`CatalogNativeComposer.tsx:276-278`).
- **Como:**
  - novos `src/vnext/ai-catalog/intake/{SourceDropZone.tsx, SourceReviewPanel.tsx, useSourceIntake.ts}`, montados dentro do composer;
  - cada arquivo ganha um chip: Lendo… / Pronto / Precisa da sua ajuda / Não foi possível: motivo;
  - um arquivo ruim não derruba o lote; duplicatas são detectadas por sha256; limite de 10 arquivos;
  - painel "O que encontrei", agrupado por arquivo;
  - antes de "Inserir como tabela", o passo **"Escolher colunas"**, com até 7 sugeridas em A4 retrato. A inserção é determinística, usa o FR-31 numa transação e divide tabelas longas pelo FR-35;
  - na Biblioteca (`CatalogLibrary.tsx:523-548`), o primeiro cartão é "Criar com IA a partir de arquivos". Ele faz só `createBlank(título)` e abre `/v2?catalog=<id>&assistente=1`. A criação recarrega a página (`bootstrap.tsx:314`), então **não há passagem de arquivos via IndexedDB**: o `EditorWorkspace.tsx:373` lê `assistente=1` e inicia com o assistente aberto, e o pai solta os arquivos ali;
  - o manifesto JSON (`VerifiedPdfTableReview.tsx:104-108`) passa para "Avançado".
- **Teste:** unitário de `useSourceIntake` (lote misto com 1 arquivo corrompido; escolha de colunas). Navegador: J12 e a parte de soltar arquivos da J2.

**FR-66 · Extração de fatos no servidor: o Gemini lê o PDF, inclusive páginas escaneadas**
P0 · L · Onda 2 (2F) · Dep.: go do spike FR-66a (1J), FR-67, FR-62, migração 00029 (dono) · [IA][intake][web]
- **Pai:** é isto que transforma folder e manual em especificação. Hoje nenhuma Edge Function envia PDF ou imagem ao Gemini (grep = 0).
- **Como:**
  - nova `supabase/functions/vnext-catalog-draft/index.ts`, tarefa `extract_facts`;
  - copia as guardas do composer: origem, JWT, papel, tamanho do payload e orçamento (`index.ts:128-159`);
  - **só PDFs e imagens sobem** para um bucket privado (00029). XLSX e CSV são lidos só no navegador e nunca sobem. Ao servidor e ao Gemini vão apenas as células já filtradas (sem preços nem AccessLogs);
  - os PDFs sobem para a Files API do Gemini em fluxo, sem base64 (limite de 2 s de CPU da Edge);
  - **extração por intervalo de páginas.** O padrão são as páginas de especificação (Y17 p7-8, TA-PT p5-8). Assim manuais de 39–80 páginas não estouram o tempo máximo da Edge Function (cerca de 150 s, a confirmar com o plano Supabase);
  - modelo `gemini-3.8-flash`, temperatura 0, raciocínio baixo, `mediaResolution` médio;
  - `responseSchema` = o contrato adaptado no FR-67 (`ai-catalog/contracts.ts`), em que cada valor traz `sourceRef{sha256, page, quote, box_2d?}`;
  - cache por (sha256, intervalo, modelo, versão do prompt);
  - prompt e schema são os mesmos validados no spike FR-66a;
  - cliente em `src/vnext/ai-catalog/draft-client.ts`.
- **Teste:** unitário da normalização e do schema. Real: os mesmos 30 valores do spike, agora pela função implantada, com custo e tempo registrados.

**FR-66a · Spike de extração local, sem deploy (go/no-go)**
P0 · S · Onda 1 (1J) · Dep.: FR-67 (1H)
- **Por quê:** o valor da IA a partir de arquivos não pode aparecer só na Onda 4.
- **Como:**
  - `scripts/extract-facts.ts` chama a API do Gemini (`generativelanguage.googleapis.com`) com a chave temporária, lida de um arquivo de ambiente fora do repo, que nunca é impresso;
  - roda sobre os PDFs reais em `Desktop/CONFIGURATOR PCON/presyspdfs` e `catalogospdf`: TA folder p9, manual TA-PT p5-6 e PCON-Y17 folder p11.
- **Go/no-go:** comparar com 30 valores conferidos à mão. **Zero valor errado marcado como VERIFIED.** Registrar custo e tempo. Se der no-go, a 2F muda o prompt ou o modelo antes de ser implantada.

**FR-69 · Compilador determinístico de rascunho (fatos + plano → ações)**
P0 · L · Onda 3 (3A) · Dep.: FR-67, FR-80, FR-33, FR-35 · [IA][domínio]
- **Pai:** garante que a IA nunca "inventa" layout nem números; ela só preenche arquétipos.
- **Como:**
  - novo `src/vnext/ai-catalog/draft-compiler.ts`, generalizando `composition.ts:76-125` (`page.template.insert` em sessão isolada) e `assertGeneratedIntegrity` (`:128-162`);
  - remover o `rowsPerPage` fixo em 8 (`:12`), as colunas forçadas Unidade/Condição (`:69`) e a divisão 3+3 (`:54`);
  - tabelas divididas pelo `table-split-authoring.ts`; imagens via `asset.register` + `image.replace`;
  - fato ausente, não verificado ou em conflito não resolvido entra como o literal "A COMPLETAR" (convenção do modelo inicial), que o FR-51 bloqueia com ERRO e localização;
  - um único `transactionId`;
  - CLI `npx vite-node scripts/compile-draft.ts <fatos.json>` gera JSON validado por `CatalogDocumentSchema`.
- **Teste:** unitário: cada célula de valor aponta para o id de um fato; nenhum número fora dos fatos. Prova Chromium: documento compilado → `reviewPublication` sem erro além dos "A COMPLETAR" esperados.

**FR-70 · IA planeja o catálogo + prévia de todas as páginas + Aplicar / Ajustar / Descartar**
P0 · L · Onda 4 (4A) · Dep.: FR-64, FR-66, FR-69, FR-68 · [IA][web][domínio]
- **Pai:** é a promessa central da J2.
- **Como:**
  - tarefa `plan_draft` (`gemini-3.5-flash-lite`, raciocínio mínimo) em `vnext-catalog-draft`;
  - devolve um `CatalogDraftPlan`, acrescentado a `ai-catalog/contracts.ts`, com ids de arquétipo e preenchimento de slots: títulos ≤ 150 caracteres, visão geral ≤ 900, destaques ≤ 15×150, legendas;
  - os slots só referenciam ids de fatos; números na prosa viram `[[VNEXT_TECH_n]]` e são conferidos (padrão de `vnext-translation-provider/index.ts:199,252-253`);
  - novo `DraftPreview.tsx` com miniaturas de todas as páginas (FR-18) e o painel de pendências do FR-68 **antes** de Aplicar;
  - três botões de mesmo peso: Aplicar, Ajustar, Descartar;
  - Aplicar = uma transação, com "Desfazer" visível por 30 s;
  - progresso em 5 passos: Lendo arquivos, Gemini lendo PDFs, Conferindo números, Montando páginas, Medindo A4.
- **Teste:** unitário: plano com dígito fora dos fatos é rejeitado. Real: J2 completa em produção.

### 3.2 P1 — atrito sério ou saída errada

**Entrada e Biblioteca**

**FR-02 · Nome na criação e no editor; diálogo seguro**
S · 1A · [entrada][walkthrough]
- **Pai:** a biblioteca de produção tem 4× "Novo catálogo", 2 TA-25N idênticos e itens "QA DESCARTÁVEL". A busca só olha o título (`library/service.ts:112-118`). Enter no "Em branco" com foco automático cria um catálogo indesejado (`CatalogLibrary.tsx:530`).
- **Como:**
  - primeiro campo do diálogo: "Nome do catálogo", com foco automático;
  - `createBlank(title)` + novo parâmetro `title` em `createFromStarter` (`service.ts:240`);
  - status com `role=status` "Criando…" dentro do modal;
  - `aria-label` nas opções (`:532-540`);
  - título do editor clicável (`app/editor/CatalogTitleButton.tsx`), despachando `document.rename` **na sessão viva** (`contracts.ts:34`, `execute.ts:736`), nunca pelo serviço da biblioteca (`service.ts:318-340` salva por fora e gera conflito).
- **Teste:** unitário `tests/vnext/library/catalog-library-ui.test.tsx`. Navegador: J11 (buscar "Y18").

**FR-04 · Arquivar com volta**
S (1A) + M (4D) · Dep. da 4D: migração 00030 (dono) · [entrada]
- **Pai:** as linhas arquivadas mostram só "Arquivado", sem nenhuma ação (`CatalogLibrary.tsx:130-132`), embora o diálogo prometa "não será excluído".
- **Como:**
  - **1A:** "Arquivar" vai para o menu ⋯. A linha arquivada ganha "Duplicar", que recupera o catálogo como cópia ativa sem migração. O RPC de criação não recusa origem arquivada: `VNEXT_ARCHIVED` só aparece em `00024:542,676`;
  - **4D:** RPC `unarchive_vnext_catalog_cas_v1` (espelho do archive) + `CatalogRepository.unarchive` + botão "Restaurar".
- **Teste:** unitário do serviço. Navegador: arquivar e duplicar (1A); arquivar e restaurar (4D).

**Editor**

**FR-12 · Mensagens visíveis**
S · 1D · [editor][walkthrough]
- **Pai:** o `statusMessage` aparece no fim da barra lateral (`EditorWorkspace.tsx:5392`, medido em y≈2596). Conflito (`:5341-5386`) e envio (`:2724`) também aparecem lá.
- **Como:** novo `src/vnext/app/editor/EditorNotices.tsx`, fixo sob a barra superior:
  - sucesso some em 4 s; erro fica até ser fechado;
  - envio, falha e conflito viram faixa acima da página;
  - remover as cópias do rodapé.
- **Teste:** unitário. Navegador em 1366×768: excluir um objeto e ver a mensagem sem rolar.

**FR-13 · Problemas acionáveis**
S · 1D · [editor][export]
- **Pai:** o chip "1 a corrigir" é um `<span>` (`:3754-3761`), e "Corrigir este item" nunca aparece (`VNextApp.tsx:112`).
- **Como:**
  - o chip vira botão que abre o novo `src/vnext/app/editor/IssuesPanel.tsx`, com todas as páginas e "Ir até lá" via `locateLayoutDiagnostic` (`:3594-3644`);
  - correções de 1 clique ficam num registro `src/vnext/app/editor/issue-fixes.ts` (código do diagnóstico → ação). Assim a 2B (altura do texto) e a 2I (continuar tabela) acrescentam uma entrada cada, sem conflito;
  - `VNextApp` passa `onLocateDiagnostic`: fecha o diálogo, vai para a página e seleciona o objeto;
  - "Verificar novamente" em `PublicationReview.tsx:36-50`;
  - diagnósticos abertos por padrão quando o objeto selecionado tem problemas.
- **Teste:** integração em `tests/vnext/publication/`. Navegador: texto estourado → Publicar → Corrigir → chega ao objeto.

**FR-14 · Estilo de texto: Título / Subtítulo / Corpo / Nota, negrito, cor, alinhamento**
M · 2B · Dep.: aprovação do @architect, pedida na Onda 1 · [editor][walkthrough]
- **Pai:** não consegue fazer um título; só existe `text.setContent` (`contracts.ts:253-258`). O schema já tem os campos (`domain/editorial-model.ts:64-68`).
- **Como:**
  - nova ação `text.setStyle`, com checagem do estilo esperado (como `SetTextContentActionSchema`);
  - bloco "Básico" no `app/editor/TextInspectorSection.tsx`: Título 16 / Subtítulo 12 / Corpo 10 / Nota 8 pt, negrito, amostras de cor (`paletteOptions`) e 3 alinhamentos;
  - texto novo passa a 10 pt e peso 400 (`editor-defaults.ts:208-221`). A 2B atualiza os testes e provas que dependem de 16 pt/700.
- **Teste:** unitário de `execute` (CAS, Desfazer). Navegador → PDF.

**FR-15 · "Ajustar altura ao texto"**
M · 2B · [editor]
- **Pai:** texto que não cabe na caixa dá `TEXT_OBJECT_OVERFLOW` com ERRO e bloqueia o PDF (`preflight.ts:84`).
- **Como:** novo `src/vnext/editor/text-fit-height-authoring.ts`, no padrão de `table-fit-height-authoring.ts`. Botão no painel de texto + entrada em `issue-fixes.ts`.
- **Teste:** unitário. Navegador: parágrafo longo → 1 clique → READY.

**FR-16 · Zoom da página + escala para 60+**
FR-16a: S · 1I · FR-16b: M · 2C · [editor][walkthrough][web]
- **Pai:** zoom fixo de 0,62 (`styles.css:61`; 0,62/0,5/0,38 nas media queries `:491,496,501`), com texto de cerca de 7 px e alças de 6 px. Há 122 declarações de fonte entre 10 e 12 px.
- **Como (16a, Onda 1, antes da primeira sessão com o pai):**
  - variável `--vnext-stage-zoom` no lugar dos `zoom` fixos;
  - hook estável `src/vnext/app/editor/use-stage-zoom.ts`, cuja API a 2A e a 2C só consomem;
  - novo `app/editor/ZoomControl.tsx` em `.vnext-canvas-meta` (`EditorWorkspace.tsx:3751-3752`), com Ajustar à largura, 100% e 125%;
  - lembrado em localStorage, sempre dentro de try/catch;
  - os gestos já medem a página renderizada (`EditorWorkspace.tsx:2832-2841`);
  - medição: rodar a prova de PDF com DPR 1,25 e 1,5. Hoje `export-proof.mjs:204` só cobre 1 e 2, e `measurement.ts:127` compara com `!==`. O resultado decide o FR-53.
- **Como (16b, Onda 2):**
  - Página inteira, 75%, Ctrl+roda;
  - controles da página contra-escalados para ≥ 24 px na tela; barra de edição de texto fora do zoom (`:3947-3983`);
  - interface ≥ 15 px, ações principais ≥ 44 px;
  - barras de ferramentas fixas no topo (`styles.css:64,71`);
  - sem mudar o visual navy/branco.
- **Teste:** prova Chromium (alças ≥ 24 px; paridade de `export-proof.mjs` mantida). Navegador em 1366×768 e na resolução e escala reais do PC do pai.

**FR-17 · Assistente como aba ao lado de "Propriedades"**
S · 2C · [editor][walkthrough]
- **Pai:** em telas até 1420 px o painel cobre a barra lateral inteira (`styles.css:850-863`; VERIFICADO em 1366).
- **Como:** abas "Propriedades | Assistente" na região `EditorWorkspace.tsx:5394-5437`, que é da 2C. Sobreposição só abaixo de 900 px.
- **Teste:** navegador em 1366 e 1440.

**FR-18 · Miniaturas nomeadas no painel de páginas**
M · 2H · [editor]
- **Pai:** depois que a IA gera 6–10 páginas, ele vê "Página 1…N", todas com o mesmo ícone (`:3720-3724`).
- **Como:** novo `src/vnext/app/editor/PageThumbnail.tsx` (`DocumentRenderer` em ~0,15, como em `RecoveryCenter`), só para páginas visíveis e com cache. O rótulo é o primeiro título da página.
- **Teste:** navegador com catálogo de 10 páginas; o desempenho é medido no portão da Onda 2.

**Tabelas**

**FR-31 · Colar do Excel cria ou aumenta a tabela; tabela nova útil**
M · 1F · [tabelas][walkthrough]
- **Pai:** tabela nova é 1×1 e 118 mm (`EditorWorkspace.tsx:383-384`, `editor-defaults.ts:204-245`). Colar além da capacidade dá erro (`table-bulk-authoring.ts:117-126`).
- **Como:**
  - novo módulo puro `src/vnext/editor/table-paste-import.ts`: matriz → TableModel, detecção de cabeçalho, linhas irregulares sinalizadas;
  - padrão 6×3 com cabeçalho, largura da área útil e altura ajustada (`table.fitHeight`, `execute.ts:1057`). A 1F atualiza `tests/vnext/editor/table-bulk-authoring.test.ts`, `tests/vnext/application/table-merge-actions.test.ts` e `tests/vnext/proof/advanced-table-matrix-proof.mjs`, que dependem do 1×1;
  - colagem grande demais oferece "Adicionar N linhas e colar" (`table.axis.insert{count}` + `setContents` no mesmo `transactionId`);
  - o botão "Colar tabela do Excel" abre uma área "Cole aqui (Ctrl+V)". **Não usar `navigator.clipboard.readText`**, que dispara um pedido de permissão do Chrome;
  - Ctrl+V de um bloco TSV na página sem tabela selecionada cria a tabela: handler de paste em `.vnext-document-preview` (`EditorWorkspace.tsx:3937`).
- **Teste:** unitário (cabeçalho; `±0,1 °C` preservado). Navegador: colar 12×4 numa página vazia.

**FR-32 · Linhas de seção legíveis em todos os presets**
S · 1F · [tabelas]
- **Pai:** contraste de 1:1 a 1,3:1 (`table-preset-registry.ts:21-27,78-84,101,121-131`; `palette[2]=#172033`).
- **Como:** fundo de seção com tom claro + `colors.first` no texto.
- **Teste:** unitário de contraste WCAG ≥ 4,5 para todo papel × preset × paleta.

**FR-33 · Painel de tabela único e presets por tarefa (unifica 3 sistemas de preset)**
M · 2D · [tabelas][editor][walkthrough][domínio]
- **Pai:** cerca de 75 controles, com duplicatas ("Propriedades da seleção" em `:5200-5266` vs `TableStyleInspector.tsx:216-365`; "Legenda" em `:3907`). Os presets ficam cerca de 2000 px abaixo, e os bons designs só existem no caminho da IA (`native-table-design.ts:18-83`).
- **Como:**
  - galeria no topo: Especificações (rótulo de 68 mm em negrito + valor, `presys-ta25n-starter.ts:160-177`), Comparativo de modelos, Códigos de pedido, Acessórios;
  - mover `applyNativeTableDesign` para `application/table-preset-registry.ts`;
  - 3 chaves: Cabeçalho, Linhas alternadas, Primeira coluna destacada;
  - o preset marca a linha 0 como cabeçalho compondo ações existentes no mesmo `transactionId`, **sem tocar `execute.ts`**;
  - "Especificações" é aplicado automaticamente em tabela nova;
  - "Adicionar nota" em 1 clique (`contracts.ts:513-543`);
  - campos numéricos com `decimal-ptbr` e amostras de cor no lugar do HEX (parte do FR-10);
  - "Avançado" recolhido.
- **Teste:** unitário dos presets. Navegador: no máximo cerca de 20 controles visíveis por padrão no modo tabela.

**FR-34 · Linhas e colunas a partir da célula selecionada, excluir várias, altura que cresce**
M · 2D (o "+" e o menu de contexto ficam na 2A, FR-30) · [tabelas]
- **Pai:** `explicitTableAxisIds` devolve `[]` com célula selecionada (`table-selection.ts:243-253`). Só se remove 1 eixo por vez (`EditorWorkspace.tsx:1528-1531`), e inserir linha gera ERRO.
- **Como:** derivar os eixos da seleção; exclusão múltipla = laço de `table.axis.remove` num só `transactionId`; ajuste de altura automático quando cabe, senão oferecer o FR-35.
- **Teste:** unitário. Navegador: excluir 5 linhas e um Ctrl+Z restaura.

**Persistência e fotos**

**FR-41 · O PDF exige só as fotos em uso; "Tentar novamente"; abrir sem esperar todas as fotos**
M · 1E + 2G · [persist.]
- **Pai:** uma foto antiga quebrada bloqueia o PDF (`resources.ts:50-52`). A lista de fotos só cresce (`execute.ts:936,1309,1382,1847`), e a reabertura baixa as fotos uma por vez (`bridge.ts:623-629`).
- **Como:**
  - 1E: resolver só os assets referenciados (páginas + células de imagem) em `resources.ts` e `bridge.resolveDocumentAssets`;
  - 2G: botão de nova tentativa no indicador (`EditorWorkspace.tsx:4041-4060`), até 4 downloads em paralelo, catálogo exibido antes das fotos.
- **Teste:** unitário (asset órfão quebrado → READY). Navegador.

**FR-42 · Recuperação local só do catálogo aberto, em linguagem simples**
M · 1E · [persist.][entrada]
- **Pai:** a tela cheia aparece por sobras de outro catálogo (`RecoveryCenter.tsx:115-140`), com JSON cru (`:75,80-81`), e o autosave para (`:125-130`).
- **Como:**
  - filtrar candidatos pelo catálogo aberto em `recovery/startup.ts:60-98`;
  - resumos legíveis; "cópia de segurança neste computador";
  - estado ambíguo só para o registro correspondente;
  - corrigir a exclusão que mira a chave nova (`recovery/session-manager.ts:96-110`).
- **Teste:** unitário do startup. Navegador: sobra no catálogo A, abrir B (J7).

**FR-43 · Conflito entre duas pessoas: diálogo bloqueante e endereço atualizado**
S (1D) + M (2G) · Dep. da 2G: 2ª conta (dono) · [persist.]
- **Pai:** os botões ficam no rodapé lateral. "Abrir versão mais recente" descarta as mudanças dele (`conflict-resolution-coordinator.ts:178-181`). Depois de "Salvar como cópia", F5 reabre o catálogo antigo.
- **Como:**
  - **1D (texto seguro, na faixa `:5341-5386`):** "Salvar meu trabalho como cópia" vem primeiro; "Abrir versão mais recente" diz claramente "descarta suas alterações" e pede confirmação;
  - **2G:** novo `src/vnext/app/editor/ConflictDialog.tsx` (padrão `review-dialog.ts`) com "Salvar meu trabalho como cópia" como padrão; `history.replaceState` para `/v2?catalog=<id>` (o único ponto é `bootstrap.tsx:393`, por isso `bootstrap.tsx` é da 2G); apagar o registro de recuperação antigo; texto exato do que fica onde;
  - presença em tempo real fica opcional, na Onda 5.
- **Teste:** unitário do coordenador. Navegador: J10.

**Publicação**

**FR-50 · Publicar salva antes e nunca fica preso**
S · 1D · [export][persist.]
- **Pai:** `EditorWorkspace.tsx:3711-3712` abre a revisão com o documento sujo; `bootstrap.tsx:455-461` devolve `undefined`; `PublicationReview.tsx:19` lê a fonte uma única vez.
- **Como:** `await persistence.runtime.manualSave()` (`runtime.ts:364-372`) antes de abrir, com "Salvando…". A revisão assina atualizações enquanto a fonte for `undefined`.
- **Teste:** teste do diálogo (sujo → salvo). Navegador: digitar e clicar Publicar na hora.

**FR-51 · Preflight de conteúdo**
S · 1D · [export][walkthrough]
- **Pai:** "A COMPLETAR" sai como READY (prova `result.json:49,75`), linha vazia é impressa e a foto do modelo inicial tem cerca de 145 ppi.
- **Como:** em `publication/preflight.ts`:
  - `placeholderDiagnostics` (A COMPLETAR, A CONFIRMAR, TBD, XXX, "revisar com engenharia") com ERRO e localização;
  - `EMPTY_TABLE_ROW` como aviso, com botão "Remover linhas vazias";
  - aviso de baixa resolução abaixo de 150 ppi;
  - mensagens em `app/publication-diagnostic-presentation.ts`;
  - **atualizar as provas do CI que preenchem "A COMPLETAR" e esperam READY:** `tests/vnext/proof/{w5c-publication-review-proof,pilot-c1-official-starter-proof,w5b-translation-review-copy-proof,p2-multilingual-translation-center-proof,productization-p1c-product-coherence-proof}.mjs`, além das fixtures delas.
- **Teste:** unitário + as 5 provas rodadas localmente antes do push. Navegador: o modelo inicial TA-25N bloqueia e lista os 6 campos.

**FR-53 · "Baixar PDF" em 1 clique (Vercel Function + Chromium headless) — condicional**
L · 3F · Dep.: medição da 1I + checklist de impressão da Onda 1 + plano Vercel (dono) · [export][web][walkthrough]
- **Entra só se** a prova com DPR 1,25 ou 1,5 mostrar falso bloqueio de geometria, ou se o pai errar o diálogo de impressão na sessão observada da Onda 1.
- **Pai:** hoje são 4–6 cliques mais 6 ajustes, e o resultado depende da máquina (`PublicationReview.tsx:64-84,117-121`).
- **Como:**
  - `publication-print.html` + `src/vnext/publication/print-entry.tsx` (`DocumentRenderer` + `reviewPublication`);
  - `api/publication-pdf.ts`:
    - valida o JWT e carrega `get_vnext_catalog_v1` sob RLS na revisão exigida;
    - gera URLs assinadas como `bridge.ts:450-506`;
    - usa `@sparticuz/chromium-min` e bloqueia os demais hosts;
    - chama `page.pdf` com as mesmas opções de `w5c-publication-review-proof.mjs:408-409`;
    - re-checa o PDF com pdfjs;
    - acima de 4 MB, grava no Storage e devolve URL assinada;
  - `vercel.json` (functions + rewrite que exclui `/api`);
  - `download-client.ts`; a impressão do navegador fica como alternativa;
  - **não** criar um segundo renderizador no cliente (proibido pela W5C).
- **Teste:** unitário da função com fixture. Real: J8 em 1 clique, inspecionando A4, fontes embutidas e texto pesquisável.

**IA**

**FR-61 · Erros claros e conversa estável**
S · 1B · [IA]
- **Pai:**
  - todo erro vira `NATIVE_COMPOSER_UNAVAILABLE` (`native-compose-client.ts:31-34`);
  - o turno é salvo antes da chamada (`CatalogNativeComposer.tsx:103`);
  - "Sim" é recusado (mínimo de 8 caracteres, `native-compose.ts:37`, `index.ts:69`);
  - clicar na página descarta uma proposta já paga (`:62-63,247`);
  - chaves exatas recusam respostas válidas (`index.ts:96,101-102`, PLAUSÍVEL);
  - o raciocínio do modelo consome os 2.300 tokens de saída (`index.ts:8`), e `finishReason≠STOP` vira 502 (`:202`).
- **Como:**
  - códigos de erro numa lista permitida, mapeados para português com uma ação ("limite diário atingido — continue manualmente", "peça menos páginas", "fale com o administrador");
  - `thinkingConfig` explícito no mínimo; o `finishReason` vai no código de erro (por exemplo `INVALID_PROVIDER_RESPONSE:MAX_TOKENS`);
  - turno com falha marcado "não enviado";
  - mínimo de 1 caractere quando há histórico;
  - invalidar a proposta só ao rejeitá-la ou quando o documento muda;
  - normalizar a resposta (descartar chaves opcionais vazias), com schemas separados para proposta e pergunta e 1 nova tentativa de reparo;
  - corrigir os textos conflitantes da aba Ferramentas (`CatalogWorkbenchChat.tsx:147,178-180`).
- **Teste:** unitário do mapeamento + fixtures de normalização (subtítulo vazio, `MAX_TOKENS`). Real: J-IA1.

**FR-62 · Orçamento de IA realista (migração 00028)**
M · 1B · Dep.: ledger conferido (FR-95) e tetos aprovados · [IA][ao vivo]
- **Pai:** cerca de 10 chamadas por dia; falhas também contam; o teto por chamada (`00027:27-29`) recusaria qualquer extração.
- **Como:**
  - 00028, aditiva e compatível com o cliente e o composer que estão no ar: a reserva devolve um id; `vnext_agent_settle_budget(id, actual)` devolve a diferença e estorna falhas do provedor;
  - novo modo `settled`, com os tetos que o dono aprovar;
  - composer e draft liquidam pelo `usageMetadata`;
  - enquanto o modo não for ligado, o comportamento atual continua.
- **Teste:** unitário da lógica de liquidação. Real: 15 chamadas num dia sem bloqueio; leitura da tabela.

**FR-63 · Sonda real da IA e deploy de `main` (sem código)**
S · Onda 0 (0D) · Dep.: OK do dono · [ao vivo][IA]
- **Pai:** o composer ativo é o do PR83 (ezbr `c7628f2f…`), sem os designs comparison/datasheet/matrix. A tradução é anterior à correção #65. Ninguém sabe se a IA responde de fato.
- **Como:**
  1. Com OK do dono, `supabase.exe secrets list --project-ref bjxqvrpbigwgabwbhtqa` (só nomes e digests).
  2. A partir da sessão já logada em produção no navegador embutido, `functions.invoke('vnext-catalog-composer')` sem credencial, com um pedido mínimo válido. O código devolvido é registrado na story:
     - 503 `COMPOSER_DISABLED`: ligar as flags;
     - 503 `PROVIDER_NOT_CONFIGURED`: secret ausente;
     - 403 `FORBIDDEN`: papel do perfil;
     - 403 `INVALID_ORIGIN`: origem fora da lista;
     - 429: problema na 00027 ou no orçamento, o que também informa o FR-95;
     - 502 `INVALID_PROVIDER_RESPONSE`: o FR-61 sobe de prioridade.
  3. Secret: se `GEMINI_API_KEY` **não** existir, gravar a chave temporária nele (não há o que sobrescrever). Se existir, **não sobrescrever**; a 1B passa a usar `VNEXT_COMPOSER_GEMINI_API_KEY`.
  4. Deploy de `vnext-catalog-composer` e `vnext-translation-provider` **a partir de `main` (e932e87), como está**, com `supabase.exe functions deploy … --project-ref bjxqvrpbigwgabwbhtqa --use-api`, sem `--no-verify-jwt` nem `--prune`. Ler o hash de volta e repetir a sonda.
  - **Não** implantar `vnext-catalog-agent` (ver FR-03).
  - **Regra daqui em diante:** código novo de função só é implantado a partir do SHA já mergeado em `main`.
- **Teste:** hash lido de volta + uma proposta real mostrando o design "datasheet".

**FR-65 · Importação aguenta os arquivos reais**
M · 1G · [intake][domínio]
- **Pai:** casos VERIFICADOS por execução: CSV com vírgula no cabeçalho corta decimais; linhas só com formatação, aba oculta, um `#N/A` ou 11 colunas rejeitam o arquivo inteiro; a coluna oculta "Custo interno" entra; 12 abas e 24,1 MB são recusados; 30 páginas densas derrubam o PDF inteiro.
- **Como:** em `ai-catalog/source-intake.ts`:
  - separador escolhido por consistência nos ~20 primeiros registros; `.tsv` e `.txt` forçam tab; linhas irregulares viram aviso com o número da linha;
  - intervalo usado por aba (`actualRowCount` / `actualColumnCount`);
  - ocultos excluídos por padrão, com opção de incluir;
  - excluir por padrão as abas AccessLogs, HELPER, CONFIGURADOR, ORIGINAL_* e PENDING_ITEMS, e as colunas Price, USD, EUR, markup, Email e User Agent;
  - **os limites de abas, linhas e colunas valem depois das exclusões padrão e do intervalo usado** (`:160,163`); a escolha final de colunas é do FR-64;
  - erro de fórmula marcado na célula, não no arquivo;
  - limites por aba, com o nome da aba em toda mensagem;
  - PDF até 50 MB, com resultado parcial e escolha de páginas;
  - formatador de `numFmt` com o decimal do idioma (o valor bruto fica guardado como proveniência); datas dd/mm/aaaa; booleanos Sim/Não; hyperlink em rich text;
  - `mod.default ?? mod` para o ExcelJS; aceitar `.xlsm`;
  - assinatura CFB → "remova a senha";
  - em `pdf-intake.ts:72`: triagem de página escaneada (< 200 caracteres, imagem cobrindo a página, glifos de uso privado).
- **Teste:** `tests/vnext/ai-catalog/source-intake.test.ts` com pelo menos 20 dos 39 casos de [intake]. CLI local sobre `PCON-MASTER-ENGLISHV2.xlsx` (DB_SENSORS passa) e os PDFs PRESYS.

**FR-67 · Contrato de fatos adaptado + verificação por valor; mínimo de 1 modelo**
M · 1H · [IA][web][intake]
- **Pai:** hoje uma célula ruim derruba a tabela inteira, tabelas 2D nunca passam (no PDF da Isotech o valor fica em outra linha de texto) e uma ficha de produto único é recusada (`ai-catalog/contracts.ts:32-36`, `pdf-grounded-input.ts:27`, `gemini-plan.ts:22`).
- **Como (ADAPT, sem contrato paralelo):**
  - estender o modelo que já existe em `ai-catalog/contracts.ts:10-40,88-110`: fatos `known/missing/conflict` com `candidates`, `Decisions`, `reviewIssues` e `selectedValue`;
  - `SourceReferenceSchema` ganha `sha256`, `box_2d?` e `cell?` (aba + endereço);
  - cada candidato ganha um status de verificação:
    - VERIFIED_TEXT: o literal está na página citada (`literalEvidencePositions` + checagem de unidade em `pdf-evidence.ts:226-249`; modelo e rótulo não precisam estar na mesma linha);
    - VERIFIED_CELL: igual à célula do XLSX/CSV no endereço citado;
    - VISUAL_ONLY;
    - UNVERIFIED;
  - `models.min(1)` e `values.min(1)`;
  - trocar o `throw` de `pdf-grounded-input.ts:93-98` por status;
  - novo `ai-catalog/fact-verifier.ts`, só para orquestrar a verificação. Justificativa para criar: não existe verificador de célula de planilha. Ele compõe as funções de `pdf-literal-evidence.ts`;
  - portar o paginador para `src/vnext/table/table-pagination.ts`.
- **Teste:** unitário com fixtures jsPDF: tabela 2D → VERIFIED_TEXT; TA-25N PT vs EN → `conflict`; os testes atuais de `contracts.ts` continuam verdes.

**FR-68 · Pendências e conflitos de fonte, resolvidos antes de aplicar, com recorte da página**
M · 3C · Dep.: FR-66 · [domínio][IA][web]
- **Pai:** decide 140 vs 155 °C vendo os dois trechos lado a lado, em vez de a ferramenta escolher por ele.
- **Como:**
  - novo `src/vnext/ai-catalog/PendingFactsPanel.tsx`: Fonte A (arquivo, página, revisão) vs Fonte B, com recorte pdf.js em 2x (reaproveita `source-materials-render.ts` se a 0A decidir portá-lo);
  - grava as escolhas em `Decisions` (`contracts.ts`);
  - é usado no fluxo J2-lite (3B) e no `DraftPreview` (4A), **antes** de Aplicar;
  - o que ficar sem decisão entra como "A COMPLETAR", que o FR-51 já bloqueia. Não há diagnóstico novo no preflight, que continua puro;
  - **sem tabela lateral de decisões**: a 00029 fica só com bucket e cache de extração;
  - se for preciso guardar proveniência no documento, depende do campo opcional `metadata` que o @architect decide na Onda 1.
- **Teste:** unitário do painel e das decisões. Navegador: J2 com o manual PT e o folder EN.

**FR-71 · Fotos ligadas aos produtos**
M · 3D · [intake]
- **Pai:** não precisa posicionar cada foto à mão. Hoje a foto é aceita só pela extensão (`source-intake.ts:141-142`).
- **Como:**
  - novo `ai-catalog/photo-matching.ts`: normaliza o nome do arquivo e casa com os códigos de modelo extraídos dos fatos; 1 correspondência é automática, mais de uma vira pergunta de 1 clique;
  - `sniffImageMime` / `sniffImageDimensions` (`asset/sniff.ts:8,48`);
  - mensagem do FR-40 para HEIC e `.jfif`;
  - persistir pela ponte de assets já normalizada (FR-40).
- **Teste:** unitário com 'PCON-Y17_frente.jpg', 'pcony17.jpg', 'TA-25N e TA-35N.jpg' e 'IMG_2034.jpg'.

**FR-72 · IA edita páginas existentes por conversa (sustenta a J3)**
L · 4B · [IA]
- **Pai:** "aumente a foto" é impossível hoje, e a reescrita recusa dígitos (`native-text-edit.ts:10-18`).
- **Como:**
  - tarefa `edit_intent` no composer, com um outline compacto do documento;
  - intenções mapeadas para ações existentes ("mais compacto", "separar especificações elétricas", "trocar foto");
  - números como marcadores;
  - cartão antes/depois com Aplicar / Ajustar / Descartar;
  - Desfazer em 1 transação.
- **Teste:** unitário dos mapeamentos. Real: J3.

**FR-86 · Sair da família 2.5 na tradução**
S · 1B · [web][ao vivo]
- **Pai:** o Google restringe a família 2.5, e a tradução está fixa nela. Se a chave temporária ou a de produção não tiver acesso à 2.5, a tradução para.
- **Como:**
  - `language-registry.ts:43,49`, `vnext-translation-provider/index.ts:16` e `provider-vault.ts:14` → `gemini-3.5-flash-lite` (ou `3.8-flash` para revisão);
  - a tradução lê `VNEXT_TRANSLATION_GEMINI_API_KEY ?? GEMINI_API_KEY`;
  - testar com a chave temporária;
  - o `translation-provider-v1` (app clássico, só admin) fica como está e é registrado como risco.
- **Teste:** uma tradução real PT→EN em produção depois do deploy a partir do SHA mergeado.

**Conteúdo e idiomas**

**FR-80 · Arquétipos PRESYS P1–P9 + modelos de ficha e folder**
M · 2H · [domínio][web][entrada][walkthrough]
- **Pai:** a opção "Recomendado" hoje é um título e uma tabela de 2 linhas (`starter-registry.ts:70-147`).
- **Como:**
  - novo `library/presys-archetypes.ts` com os 9 arquétipos do blueprint: Capa, Visão geral + destaques, Recursos, Especificações comparativas, Faixas e gerais, Código de pedido, Fornecimento + acessórios, Insertos, Contracapa;
  - slots com ids estáveis e tokens do blueprint;
  - registro em `application/template-registry.ts` (padrão de `presys-ta25n-starter.ts:214-221`);
  - modelos iniciais "Ficha técnica (4–6 p)" e "Folder (8–12 p)", independentes de produto;
  - galeria "Usar modelo…" com miniaturas.
- **Teste:** unitário: cada arquétipo valida no schema e passa no preflight com fatos de exemplo. Navegador → PDF.

**FR-81 · Nenhum texto de demonstração impresso**
S · 2H · [domínio]
- **Pai:** risco de sair "MATERIAL SINTÉTICO DE TESTE" (`institutional-pages.ts:45,80`) ou "Dados sintéticos" (`composition.ts:100-106`) num catálogo de cliente, além das notas de fonte do modelo inicial (`presys-ta25n-starter.ts:188,196`).
- **Como:** tirar esses textos das páginas; a proveniência vai para a UI de revisão.
- **Teste:** unitário que procura as strings proibidas em todos os templates renderizados.

**FR-85 · Números e abreviações por idioma**
M · 4C · [web]
- **Pai:** "0,02 % FE" sairia igual no catálogo EN (`vnext-translation-provider/index.ts:351`, `technical-token-protector.ts:19-25`).
- **Como:** novo módulo puro `translation/locale-number-format.ts`, aplicado depois da tradução:
  - pt→en: vírgula decimal vira ponto, "% FE" vira "% FS", "% da leitura" vira "% RDG";
  - es mantém;
  - "1.500" e "10.000" vão para confirmação no TranslationReview.
- **Teste:** unitário com strings Beamex, Additel e Isotech. Navegador: J9.

**Plataforma**

**FR-91 · Resgatar o trabalho em risco e decidir o destino**
S · 0A · [ao vivo]
- **Como:**
  - em `C:/Users/Usuario/.codex/worktrees/presys-source-review-20261011/catalog-builder`, criar a branch local `codex/presys-source-review-wip` e commitar os 14 arquivos + o `EditorWorkspace.tsx` modificado. O push depende do dono. Custa minutos e evita perda;
  - **decisão na Onda 0** (dono, §5 item 12). Recomendação: portar só `source-materials-render.ts` (+ teste) para a 3C; declarar o resto e o `native-table-proposal.ts` do #77 substituídos pelo FR-66/68, e fechar o #77.
- **Teste:** `git log` mostra o commit; a lista de arquivos confere com as 1.587 linhas; a decisão fica registrada na story da Onda 0.

**FR-93 · Aceite em navegador real a cada onda**
M · todas as ondas · [portões][IA][export]
- **Pai:** confiança vem de provas reais, não de mocks. O E2E está pulado (`tests/acceptance/company-acceptance-critical-journeys.test.tsx`), as provas de IA usaram Gemini falso e a W5C usou backend simulado.
- **Como:**
  - jornadas da onda no navegador embutido, com a sessão do dono em Preview ou produção;
  - capturas no scratchpad; lista de passou/falhou na story da onda;
  - pelo menos 1 chamada Gemini real por fatia de IA, com custo registrado;
  - J8 da Onda 1: o agente valida até "Pronto" ou "Corrigir este item". `window.print` abre um diálogo nativo, então a impressão é checklist humano do Gabriel mais a prova automatizada `page.pdf`;
  - **regressão:** cada jornada ganha uma versão harness em Playwright (padrão `steps.mjs` do [walkthrough]), com backend simulado, registrada no `quality-gates.yml`. Harness verde é regressão, **não** aceite.

**FR-95 · Conferir o ledger de migrações antes de qualquer `db push`**
S · 0 (dono) · [ao vivo][persist.]
- **Pai:** a 00026 aparece como aplicada e como pendente; o gate de 10-10 diz que o histórico termina na 00025.
- **Como:** o dono roda `select version from supabase_migrations.schema_migrations order by version desc limit 5;` e confere as policies de `product-images` (runbook `:53-71`). A sonda do FR-63 informa parte disso: um 429 indica problema na 00027.

### 3.3 Habilitador

**FR-92 · Costura enxuta do `EditorWorkspace.tsx`**
M · 2.0 (serial)
- **Por quê:** a Onda 2 tem fatias que tocam o inspetor e a barra de ferramentas.
- **Como:** extrair para `src/vnext/app/editor/`, sem mudar comportamento nem textos, **só o que as fatias da Onda 2 usam**:
  - `TableCellEditorSection.tsx` (`:4790-4923`);
  - `TableInspectorPanel.tsx` e `TableGridToolbar.tsx` (`:3842-3935`);
  - `TextInspectorSection.tsx`;
  - `CanvasHeader.tsx` (`:3751-3764`), já com o `ZoomControl` e o `useStageZoom()` da 1I.
- **Pronto quando:** provas do CI verdes e contagem de controles visíveis inalterada (15/28/34/62, [editor]). Não há meta de número de linhas.

### 3.4 P2/P3 — compacto

| ID | Título | Sev | Por quê (pai) | Como (arquivos) | Esf | Onda | Teste |
|---|---|---|---|---|---|---|---|
| FR-03 | Remover superfícies mortas | P2 | Página pública `/ai-catalog-prototype.html` com "geração simulada"; agente nunca implantado | `vite.config.ts:18`: entrada aiPrototype só em build E2E; apagar `prototype-entry.tsx`; **a 1A adapta ou remove o passo do protótipo no `quality-gates.yml:100-106,226-230`**, que abre a página no build de produção (`ai-catalog-prototype-proof.mjs:15-16`); manifesto JSON em "Avançado" (2E); na Onda 5, aposentar `vnext-catalog-agent`, `gemini-client.ts` e `byok-catalog-gateway.ts` | S | 1A / 2E / 5 | curl → 404; CI verde |
| FR-05 | Biblioteca em cartões | P2 | 19 linhas, 76 botões de 12 px; título não clica | Cartão clicável, menu ⋯, "editado há 2 h por Fulano" (join de profiles na 00030), miniatura, filtro local (`service.ts:107`), banner de recuperação de outros catálogos | M | 4D | navegador |
| FR-06 | "Catálogos" nunca falha calado; termos | P2 | Clica e nada acontece (`catalog-navigation.ts:17-28`) | Mensagem em todo `return false`; "Meus catálogos"; "Tentar novamente" como ação primária (`bootstrap.tsx:141-142`, só leitura do texto via `catalog-navigation`) | S | 1A | unitário |
| FR-07 | Login dentro do `/v2` | P2 | "Validando acesso…" duas vezes; carrega o bundle clássico | `LoginView` dentro de `mountVNextApp` (`bootstrap.tsx:180-193`); `/` monta o VNext | M | 5 | navegador |
| FR-08 | Criação e busca sem efeitos colaterais | P2 | `verifyPendingCreate` chama `createBlank` de novo e pode criar um catálogo em branco extra (`CatalogLibrary.tsx:310-334`, `create-coordinator.ts:168-175`); a busca faz 1 RPC por tecla (`CatalogLibrary.tsx:225-245`) | Verificar a criação pendente sem criar outra; debounce de 300 ms na busca | S | 1A | unitário |
| FR-19 | Teclado de Word | P2 | Delete e setas não fazem nada; Ctrl+S abre "Salvar página como" (VERIFICADO) | Novo `src/vnext/editor/editor-keyboard.ts`: Delete, setas de 1/5 mm, Ctrl+D, Ctrl+S → `manualSave`; Esc em caixa de texto conclui | S | 1C | unitário |
| FR-20 | Linguagem | P2 | "Inspector", "Gesto", "RichText", "TSV", IDs internos | Reescrever (lista em [editor]); IDs → "linha N, coluna M" (`:5313-5318`); teste de palavras proibidas | S | 2D / 5 | unitário |
| FR-21 | Imagens sem atrito | P2 | Sem progresso nem arrastar/colar; envio descartado ao trocar de página (`image-upload.ts:59-69`) | Marcador de progresso; soltar/colar; checar só se a página existe; um botão "Trocar imagem…"; "Fotos já enviadas" | L | 5 | navegador |
| FR-22 | Pequenos bugs | P3 | Exemplo mostra "\t\n" (`:3927`); "não salvo" sem mudança | Template literal; sujo só se o rascunho difere | S | 1F / 2A | unitário |
| FR-23 | Mover vários objetos | P2 | Arrastar desfaz a seleção múltipla (`:2823`) | Mover em 1 transação; Shift+clique; caixa de seleção | M | 5 | navegador |
| FR-24 | Diagnósticos em segundo plano | P2 | Lentidão PLAUSÍVEL (`authoring-diagnostics.tsx:198-268`) | **Medir no portão da Onda 2** (catálogo de 10 páginas com miniaturas); otimizar na Onda 5 só se passar do limite | M | 2 (medir) / 5 | perf |
| FR-36 | Tabela fina | P2 | Colunas sem ajuste; mesclar exige limpar valores iguais; Medição recusa "0,015" | "Ajustar colunas" (`measurement.ts:98,173`); "Mesclar mantendo o primeiro valor"; vírgula aceita em `table-cell-draft.ts` | M | 5 | unitário |
| FR-37 | Latência em tabela 150×10 | P2 | ALEGADO 1,4 s por edição | **Medir no portão da Onda 2** (tabela de 69 linhas da J12); validar 1× por ação (`table-model.ts:181-182`) na Onda 5 se confirmado | M | 2 (medir) / 5 | perf |
| FR-44 | Autosave com novas tentativas | P2 | Fica "Sem conexão" até editar | Espera crescente 5/15/60 s (`autosave-coordinator.ts`); "Sessão expirada" (`persistence/workspace.ts:138-145`); "Salvo às HH:MM" | S | 2G | unitário + J13 |
| FR-45 | Resíduos do bridge | P3 | Erros engolidos | Log de código (`bridge.ts:594-602`); ligar `isOffline` (`bridge.ts:27`) e `invalidateAuth` (`:691`) na construção do bridge (`bootstrap.tsx:284-294`) | S | 2G | unitário |
| FR-52 | Instrução de impressão em 1 linha | P2 | Lê 6 ajustes que o CSS já força | `PublicationReview.tsx:117-121`; Gabriel confere Chrome e Edge a 100% e 125% no PC do pai (checklist da J8) | S | 1D | navegador |
| FR-54 | Faixas decorativas e sangria | P2 | Falso bloqueio (`preflight.ts:11-24`) | Pular a área segura para formas, linhas e imagens sangradas; aviso até 3 mm | S | 5 | unitário |
| FR-55 | Rodapé de controle | P2 | Sem código, revisão, data e idioma | Slots no rodapé dos arquétipos; arquivo `<código>-<rev>_<idioma>.pdf`; metadados no PDF do servidor se o FR-53 existir; depende da decisão sobre `metadata` (@architect, Onda 1) | M | 4E | navegador |
| FR-73 | Um assistente só | P3 | Abas com mensagens contraditórias e histórico misturado | Textos corrigidos na 1B; Ferramentas vira ações rápidas; registro único de modelos | S | 1B / 4B | unitário |
| FR-82 | Marca PRESYS | P3 | Saída genérica | Paleta do blueprint + fonte condensada OFL fixada (`rendering/resources.ts:31-45`) | M | 4E | paridade |
| FR-87 | Glossário PT/EN/ES | P3 | Termos inconsistentes; erros dos folders EN ("Acuracy", "secundary") | Glossário fixo + grafias sinalizadas | S | 4C | unitário |
| FR-90 | Portões estáveis | P2 | CI vermelho por timeout | `father-translation-batching.test.ts:116` (15 s); `editor-workspace.test.tsx:286` e `pilot-a-authorship-trust.test.tsx:167` (waitFor de 5 s) | S | 0B | CI 2× |
| FR-94 | Higiene | P2 | Rascunhos já integrados; catálogos QA na biblioteca; runbook errado | Fechar #68–#72 e #82–#85; arquivar catálogos QA em produção; reescrever `docs/runbooks/father-operations-guide.md` | S | 0C / 5 | — |

---

## 4. Fatias de implementação (por onda)

### Regras de paralelismo (valem para todas as ondas)

1. **`application/contracts.ts` e `application/execute.ts`:** um dono por onda. Na Onda 2 é a 2B (`text.setStyle`). Nas outras ondas, nenhuma fatia os toca: todas compõem ações existentes sob um `transactionId`, inclusive a divisão de tabela (2I).
2. **`src/vnext/app/styles.css`:** um dono por onda (Onda 1: 1I; Onda 2: 2C). As outras fatias criam CSS ao lado do componente (`src/vnext/app/editor/*.css`).
3. **`EditorWorkspace.tsx`:**
   - na Onda 1, cinco fatias o tocam (1A, 1C, 1D, 1F, 1I), em faixas declaradas abaixo, com ordem de merge fixa;
   - entre a Onda 1 e a Onda 2 roda a costura 2.0, serial;
   - nenhuma fatia adiciona mais de 150 linhas líquidas a esse arquivo; UI nova vai em arquivo novo.
4. **Testes:** cada fatia cria testes novos para o que é novo **e atualiza os testes e provas existentes que quebrar**, listando-os na story. O integrador resolve os conflitos na ordem de merge. Preferir seletores por role e label.
5. **Funções Supabase:** um dono por função por onda. **Deploy só a partir do SHA já mergeado em `main`.** O cliente tolera a versão antiga e a nova da função.
6. **Migrações:** Preview e produção usam o mesmo banco. Toda migração (00028–00030) é aditiva e compatível com o cliente de `main` que está no ar.
7. **`package.json` e lock:** só uma fatia por onda adiciona dependência (Onda 3: 3F, se entrar).
8. **`.github/workflows/quality-gates.yml`:** na Onda 1 o dono é a 1A (remove o passo do protótipo e registra as provas novas das outras fatias na integração). Nas outras ondas, o integrador acrescenta as provas novas no fechamento.
9. **Caminhos:** UI em `src/vnext/app/editor/`; módulos puros em `src/vnext/editor/`.
10. **Fluxo:**
    - cada fatia roda num worktree próprio criado a partir da base da onda;
    - o integrador faz rebase na ordem listada;
    - depois de cada merge: typecheck + testes afetados;
    - no fim da onda: o **portão da onda**, descrito abaixo.

**Portão da onda:**
1. `npm run lint`, `typecheck`, `test` e `build` verdes. Antes, conferir o espaço livre em C:.
2. **Provas Chromium afetadas do `quality-gates.yml` rodadas localmente** antes do push, porque o CI leva 17–25 min.
3. Jornadas sem IA da onda executadas no navegador real, no Preview (FR-93).
4. Push, PR e merge autorizados pelo dono.
5. Deploys Edge da onda a partir do SHA mergeado, com hash lido de volta. Depois, as jornadas de IA rodam em produção.
6. Smoke em produção depois do deploy automático do Vercel.
7. **Rollback definido antes do merge.** Front: o dono promove o deploy anterior no painel do Vercel, porque um `git revert` passa pelos 17–25 min do CI. Edge: reimplantar o SHA anterior e ler o hash de volta. Banco: migrações aditivas não exigem rollback.
8. Story da onda (`docs/stories/2026-10-15-father-ready-onda-N.md`) com as caixas marcadas. As três stories de 2026-10-13 são marcadas como substituídas.

### Onda 0 — Preparação (≈ meio dia; frentes em paralelo)

| Fatia | FRs | Toca | Pronto quando |
|---|---|---|---|
| 0A Resgate + destino | FR-91 | Só o worktree Codex `presys-source-review-20261011` (commit local) | Commit criado; decisão "portar `source-materials-render.ts` / substituir o resto" registrada; push com OK do dono |
| 0B Portões verdes | FR-90 | Os 3 testes instáveis; story da Onda 1 | Portões verdes 2× seguidas; push e PR de `claude/father-ready-20261014` → CI + Preview |
| 0C Higiene + estado do banco | FR-94, FR-95 | Produção (arquivar catálogos QA pela UI, permitido); `gh pr close` dos rascunhos já integrados (com OK) | Biblioteca limpa; ledger informado pelo dono |
| 0D Sonda de IA + deploy de `main` | FR-63 | Nenhum código; `secrets list`, uma chamada real, deploy de composer e tradução de e932e87 | Código da sonda registrado; hash lido de volta; proposta real com design datasheet |
| 0E Ambiente e contas (dono/Gabriel) | — | Fora do repo | Ambiente do pai levantado (resolução, escala, navegador, celular, mouse); contas do pai e da equipe criadas com papel editor; proteção de Preview conferida |

### Onda 1 — Vitórias visíveis (10 fatias em paralelo)

**O pai passa a ver:**
- login direto nos catálogos, com nome na criação e recuperação por "Duplicar";
- IA que responde sem chave pessoal, com os 3 designs de tabela e erros em português;
- editor que não trava com vírgula; páginas que se excluem e se movem; Delete e Ctrl+S funcionando;
- **zoom de 100% e 125%**;
- mensagens visíveis e problemas clicáveis;
- Publicar que nunca fica preso, e "A COMPLETAR" barrado;
- foto de celular funcionando, HEIC explicado, recuperação que não bloqueia;
- tabela nova útil, colar do Excel que cria a tabela, seções legíveis.

| Fatia | FRs | Arquivos exclusivos | Faixas do `EditorWorkspace.tsx` | Esf | Dep |
|---|---|---|---|---|---|
| **1A** Entrada e criação | FR-01, 02, 04 (parte 1A), 06, 08, 03 (vite + CI) | `src/App.tsx`, `components/common/Navbar.tsx`, `vnext/app/CatalogLibrary.tsx`, `vnext/library/service.ts`, `vnext/library/create-coordinator.ts`, `vnext/app/catalog-navigation.ts`, `vite.config.ts`, **`.github/workflows/quality-gates.yml`**, novo `app/editor/CatalogTitleButton.tsx` | 3660-3668 (título) | M | — |
| **1B** IA liga sem chave | FR-60, 61, 62, 86, 73 (texto) | `ai-catalog/{CatalogNativeComposer,ProviderCredentialsSettings,CatalogWorkbenchChat}.tsx`, `native-compose-client.ts`, `native-compose.ts`, `native-text-edit.ts`, `ai-catalog/provider-vault.ts`, `translation/language-registry.ts`, `supabase/functions/{vnext-catalog-composer,vnext-translation-provider}/index.ts`, nova `supabase/migrations/00028_vnext_ai_budget_settlement.sql` | nenhuma | M | 0D; 00028 (dono, opcional) |
| **1C** Editor não trava + páginas + teclado | FR-10 (parte 1C), 11, 19 | Novos `src/vnext/editor/{decimal-ptbr,editor-keyboard}.ts`, `app/editor/PagePanel.tsx`, `tests/vnext/app/father-editor-safety.test.tsx` | 632-640, 1019-1061, 1156, 2875-3080 (inspetor e teclado), 3160-3200 (campos numéricos de célula), 3717-3748 (painel de páginas), 4242-4264 | M | — |
| **1D** Publicar confiável | FR-12, 13, 43 (texto seguro), 50, 51, 52 | `app/PublicationReview.tsx`, `app/VNextApp.tsx`, `publication/preflight.ts`, `app/publication-diagnostic-presentation.ts`, novos `app/editor/{EditorNotices,IssuesPanel}.tsx` e `app/editor/issue-fixes.ts`, **as 5 provas do FR-51** e suas fixtures | 3711-3712, 3754-3761, 5341-5392, nova prop de localização | M | — |
| **1E** Fotos e recuperação | FR-40, 41 (só fotos em uso), 42 | `asset/{bridge,sniff}.ts`, novo `asset/normalize-image.ts`, `rendering/resources.ts`, `recovery/{startup,session-manager}.ts`, `app/RecoveryCenter.tsx` | nenhuma | M | — |
| **1F** Tabelas rápidas | FR-31, 32, 22 (exemplo) | `application/table-preset-registry.ts`, `app/editor-defaults.ts`, novo `src/vnext/editor/table-paste-import.ts`, novo `app/editor/PasteTableArea.tsx`; testes do 1×1 (`table-bulk-authoring.test.ts`, `table-merge-actions.test.ts`, `advanced-table-matrix-proof.mjs`) | 383-384, 1658-1694, 2361-2386, 3767-3848, 3927, 3937 (paste na página) | M | — |
| **1G** Importação robusta (módulo puro) | FR-65 | `ai-catalog/source-intake.ts`, `ai-catalog/pdf-intake.ts`, novo teste | nenhuma | M | — |
| **1H** Contrato adaptado + verificador + paginador (módulos puros) | FR-67 + porte para o FR-35 | `ai-catalog/{contracts,pdf-grounded-input,pdf-literal-evidence,gemini-plan}.ts`, novos `ai-catalog/fact-verifier.ts` e `src/vnext/table/table-pagination.ts` | nenhuma | M | — |
| **1I** Zoom básico + medição de DPR | FR-16a | **`app/styles.css`**, novos `app/editor/{ZoomControl.tsx,use-stage-zoom.ts}`, parâmetro de DPR em `tests/vnext/proof/export-proof.mjs` (medição; não entra no CI até a decisão do FR-53) | 3751-3752 (controle no `.vnext-canvas-meta`) | S | — |
| **1J** Spike de extração | FR-66a | Novo `scripts/extract-facts.ts` (não vai para o bundle) | nenhuma | S | 1H |

**Conflitos e ordem de merge:**
- Ordem: **1C → 1F → 1D → 1I → 1A**. 1B, 1E, 1G e 1H entram a qualquer momento; a 1J entra depois da 1H.
- A 1I e a 1D tocam linhas vizinhas do cabeçalho do canvas (3751-3761): a 1I insere uma linha, e o integrador resolve.
- `VNextApp.tsx` só é tocado pela 1D. A 1E filtra a recuperação em `startup.ts` justamente para não tocar o `VNextApp`.
- `preflight.ts` é só da 1D; `bridge.ts` é só da 1E; `styles.css` é só da 1I.
- Ninguém toca `contracts.ts` (application) nem `execute.ts` nesta onda.

**Sequência de deploy da 1B (só depois do merge):**
1. Merge do cliente, que tolera o composer antigo.
2. Dono confere o ledger e aplica a 00028 (compatível com o que está no ar).
3. Se a 0D concluiu que `GEMINI_API_KEY` já existia: gravar `VNEXT_COMPOSER_GEMINI_API_KEY` e `VNEXT_TRANSLATION_GEMINI_API_KEY`.
4. Deploy de composer e tradução a partir do SHA mergeado; hash lido de volta.
5. J-IA1 e uma tradução real em produção.

Se a 00028 atrasar, a 1B sai com o modo de orçamento atual.

**Decisões do @architect durante a Onda 1** (enquanto só há dados de teste):
- aprovar `text.setStyle` (FR-14), para não travar a 2B;
- decidir sobre um campo opcional `metadata` em `CatalogDocumentSchema`, hoje estrito (`editorial-model.ts:162-165`). O FR-55 precisa dele para código, revisão e idioma, e o FR-68 pode usá-lo para proveniência.

**Fim da Onda 1:** primeira sessão observada com o pai (30 min), depois que a chave paga de produção estiver ativa (§5 item 13).

### Onda 2 — Autoria fluida e arquivos na IA (costura serial + 9 fatias em paralelo)

| Fatia | FRs | Arquivos exclusivos | Resíduo no `EditorWorkspace.tsx` | Esf | Dep |
|---|---|---|---|---|---|
| **2.0** Costura enxuta (serial, primeiro) | FR-92 | Novos `app/editor/{TableCellEditorSection,TableInspectorPanel,TableGridToolbar,TextInspectorSection,CanvasHeader}.tsx` | Só remoção e movimentação | M | Onda 1 integrada |
| **2A** Célula inline + "+" e menu da grade | FR-30, 34 ("+" e menu), 22 (sujo) | `app/table-grid-overlay.tsx`, novo `app/editor/CellInlineEditor.tsx`, `app/editor/TableCellEditorSection.tsx`, `src/vnext/editor/{table-cell-draft,editor-keyboard}.ts` | Callbacks da grade, 1345-1418 | L | 2.0 |
| **2B** Texto com estilo | FR-14, 15 | **`application/contracts.ts`, `application/execute.ts`**, `app/editor/TextInspectorSection.tsx`, `app/editor-defaults.ts`, novo `src/vnext/editor/text-fit-height-authoring.ts`, 1 entrada em `app/editor/issue-fixes.ts` | nenhum | M | 2.0, aprovação do @architect |
| **2C** Escala 60+ e assistente em aba | FR-16b, 17 | **`app/styles.css`**, `app/product-primitives.css`, `app/editor/{CanvasHeader,ZoomControl}.tsx`, `app/editor/use-stage-zoom.ts` | 3947-3983 (barra de texto fora do zoom), 5394-5437 (dock do assistente) | M | 2.0 |
| **2D** Painel de tabela + presets + eixos | FR-33, 34 (eixos), 10 (parte 2D), 20 (tabela) | `app/editor/{TableInspectorPanel,TableGridToolbar}.tsx`, `app/TableStyleInspector.tsx`, `application/table-preset-registry.ts`, `ai-catalog/native-table-design.ts` (re-export), `src/vnext/editor/table-selection.ts` | 1470-1557 (eixos) | M | 2.0 |
| **2I** Continuar na próxima página | FR-35 | Novo `src/vnext/editor/table-split-authoring.ts` + teste, 1 entrada em `app/editor/issue-fixes.ts`, 1 botão em `app/editor/TableInspectorPanel.tsx` (depois da 2D) | nenhum | M | 1H, 2D |
| **2G** Persistência P1 | FR-41 (tentar de novo / paralelo), 43, 44, 45 | `persistence/{conflict-resolution-coordinator,autosave-coordinator,workspace,reopen-coordinator}.ts`, `app/save-presentation.ts`, `asset/bridge.ts`, **`app/bootstrap.tsx`** (`:284-294`, `:393`), novo `app/editor/ConflictDialog.tsx`, `app/editor/EditorNotices.tsx` | 4041-4060 | M | 2.0, 2ª conta (dono) |
| **2H** Arquétipos e miniaturas | FR-80, 81, 18 | `library/{starter-registry,presys-ta25n-starter}.ts`, novo `library/presys-archetypes.ts`, `application/template-registry.ts`, `app/page-template-fixtures.ts`, `ai-catalog/{institutional-pages,composition}.ts`, novo `app/editor/PageThumbnail.tsx`, `app/editor/PagePanel.tsx` | nenhum | M | 2.0 |
| **2E** Arquivos no assistente | FR-64, 03 (manifesto) | Novos `ai-catalog/intake/*`, `ai-catalog/{CatalogNativeComposer,VerifiedPdfTableReview}.tsx`, `app/CatalogLibrary.tsx` | 373 (assistente aberto com `assistente=1`) | L | 1G, 1A, 1B, 2I |
| **2F** Servidor de extração | FR-66 | Nova `supabase/functions/vnext-catalog-draft/`, nova migração `00029_vnext_source_files.sql` (só bucket privado de PDFs e imagens + cache de extração), novo `ai-catalog/draft-client.ts` | nenhum | L | 1H, go da 1J, 00028/00029 (dono) |

**Conflitos e ordem de merge:**
- Ordem: **2.0 → 2B → 2D → 2I → 2A → 2C → 2G → 2H → 2E → 2F**.
- `table-grid-overlay.tsx` é só da 2A, inclusive o "+" e o menu de contexto do FR-34.
- `useStageZoom()` vem da 1I: a 2A só consome, e a 2C é a única que o altera.
- `bootstrap.tsx` é só da 2G. A 2E não o toca: o assistente abre por `assistente=1`, lido em `EditorWorkspace.tsx:373`.
- `CatalogLibrary.tsx` é só da 2E nesta onda. O banner de recuperação da biblioteca ficou para a 4D.
- `bridge.ts` é só da 2G nesta onda.
- `issue-fixes.ts`: a 2B e a 2I acrescentam uma entrada cada (conflito trivial). `TableInspectorPanel.tsx`: a 2I acrescenta 1 botão depois da 2D.
- **No portão:** medir o FR-24 (10 páginas com miniaturas) e o FR-37 (tabela de 69 linhas da J12).

### Onda 3 — Peças do catálogo com IA (até 5 fatias em paralelo)

| Fatia | FRs | Arquivos exclusivos | Esf | Dep |
|---|---|---|---|---|
| **3A** Compilador de rascunho | FR-69 | Novos `ai-catalog/draft-compiler.ts`, `scripts/compile-draft.ts` | L | 1H, 2H, 2D, 2I |
| **3C** Pendências e conflitos | FR-68 | Novo `ai-catalog/PendingFactsPanel.tsx`; `source-materials-render.ts` (se portado na 0A) | M | 2F |
| **3B** J2-lite: "Inserir tabela de especificações verificada" | — (liga FR-66 + FR-69 + FR-68) | `ai-catalog/CatalogNativeComposer.tsx`, `ai-catalog/intake/SourceReviewPanel.tsx` | M | 3A, 3C, 2E, 2F |
| **3D** Fotos → produtos | FR-71 | Novo `ai-catalog/photo-matching.ts`, `ai-catalog/intake/useSourceIntake.ts`, `ai-catalog/source-intake.ts` | M | 1G, 1E |
| **3F** Baixar PDF em 1 clique (condicional) | FR-53 | Novos `api/publication-pdf.ts`, `publication-print.html`, `publication/{print-entry.tsx,download-client.ts}`; `vite.config.ts`, `vercel.json`, **`package.json`/lock**, `app/PublicationReview.tsx` | L | Medição da 1I + sessão da Onda 1; plano Vercel (dono) |

Ordem de merge: 3A → 3C → 3B → 3D → 3F.

**J2-lite (3B):** o pai solta o PDF e pede a tabela de especificações. Primeiro roda `extract_facts`, depois o painel de pendências e depois o compilador, e uma tabela verificada entra numa transação. É o primeiro valor real da IA a partir de arquivos, antes da 4A.

### Onda 4 — IA de ponta a ponta + idiomas + biblioteca (5 fatias)

| Fatia | FRs | Arquivos exclusivos | Esf | Dep |
|---|---|---|---|---|
| **4A** Planejar, prévia e aplicar | FR-70 | `supabase/functions/vnext-catalog-draft/index.ts` (`plan_draft`), novo `ai-catalog/DraftPreview.tsx`, `ai-catalog/contracts.ts` (`CatalogDraftPlan`), **`ai-catalog/CatalogNativeComposer.tsx`** | L | 3A, 3B, 3C, 2E, 2F |
| **4B** Conversa que edita | FR-72 (P1), 73 | `supabase/functions/vnext-catalog-composer/index.ts` (`edit_intent`), `ai-catalog/native-text-edit.ts`, novos `ai-catalog/{document-outline,edit-intents}.ts` | L | A 4A entra antes; a 4B expõe um hook e um cartão montados depois |
| **4C** Idiomas | FR-85, 87 | Novo `translation/locale-number-format.ts`, `app/TranslationReview.tsx`, `supabase/functions/vnext-translation-provider/index.ts` (glossário) | M | Deploy a partir do SHA mergeado |
| **4D** Biblioteca | FR-04 (Restaurar), 05, 02 ("Usar como modelo") | `app/CatalogLibrary.tsx`, `library/service.ts`, `persistence/supabase-repository.ts`, nova migração 00030 | M | 00030 (dono) |
| **4E** Rodapé de controle + marca | FR-55, 82 | `library/presys-archetypes.ts`, `rendering/resources.ts` (fontes), tokens de estilo | M | 2H, decisão do @architect sobre `metadata` |

**Fim da Onda 4:** segunda sessão observada com o pai (30 min), com J2, J3 e J9.

### Onda 5 — Aceite final e polimento

- J1–J13 e J-IA1 executadas por Gabriel; com o pai, numa sessão observada, só as jornadas que falharam ou mudaram desde a Onda 4.
- Polimento: FR-07, 20 (varredura com teste de palavras proibidas), 21, 23, 24 e 37 (só se a medição da Onda 2 pedir), 36, 54, presença opcional do FR-43, limpeza do FR-03.
- Runbook reescrito a partir das telas reais.
- Sem features novas.

---

## 5. O que depende do Gabriel (mínimo, já descontando as decisões do UPDATE)

| # | O quê | Quando | Como | Tempo |
|---|---|---|---|---|
| 1 | Autorizar o @devops a fazer push, PR e merge **por onda**. Merge em `main` publica produção pelo Vercel Git, e a proteção de branch só exige o CI. | Onda 0 e uma vez por onda | Responder "OK onda N" | 1 min |
| 2 | Conferir o ledger de migrações (00026 e 00027 aplicadas?) e as policies de `product-images` | Onda 0, antes da 00028 | SQL Editor: `select version from supabase_migrations.schema_migrations order by version desc limit 5;`, ou fornecer a senha do Postgres para `supabase link` | 5 min |
| 3 | Aprovar `secrets list` (só nomes e digests). Se `GEMINI_API_KEY` não existir, permitir gravá-lo com a chave temporária; se existir, **não sobrescrever** e usar `VNEXT_COMPOSER_GEMINI_API_KEY` / `VNEXT_TRANSLATION_GEMINI_API_KEY`. Informar **validade e tier** da chave temporária (no tier grátis os dados vão para treino). | Onda 0 | O orquestrador roda `supabase.exe secrets set --env-file <arquivo no scratchpad, fora do repo>` e apaga o arquivo. Usar o exe em `C:/Users/Usuario/AppData/Local/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-windows-x64/bin/supabase.exe`, porque o `npx` trava. A CLI já está autenticada. | 5 min |
| 4 | Aprovar deploys Edge: composer e tradução de `main` como estão (Onda 0); depois, sempre a partir do SHA mergeado (Ondas 1, 2 e 4) | Ondas 0–4 | `functions deploy … --use-api`, sem `--no-verify-jwt` nem `--prune` | 1 min cada |
| 5 | Aprovar os tetos de gasto de IA. Proposta: ≤ US$ 0,50 por chamada, US$ 3 por usuário por dia, US$ 60 por mês para a organização. Criar alerta de orçamento no Google Cloud do projeto da chave (só ele tem acesso). | Onda 1 | Responder com os números | 5 min |
| 6 | Aplicar migrações aditivas: 00028 (orçamento), 00029 (bucket e cache de extração), 00030 (restaurar e nome de quem editou) | Ondas 1, 2 e 4 | Senha do banco para `db push`, ou colar o SQL no SQL Editor | 5 min cada |
| 7 | Conferir a Deployment Protection do Preview. Para testar IA em Preview, incluir o **alias da branch** (`…-git-<branch>-gabriels-projects-46d997f6.vercel.app`, estável entre deploys) em `VNEXT_CATALOG_ALLOWED_ORIGINS`. Alternativa: IA só em produção, depois do merge. | Onda 0 | Painel do Vercel + secret | 5 min |
| 8 | Entrar uma vez no domínio de Preview pelo navegador embutido (a sessão é por origem). Agentes não digitam senha. | Por onda | — | 1 min |
| 9 | Criar as contas do pai e da equipe com papel **editor** e `is_active` (o composer exige isso, `index.ts:144-146`), mais uma 2ª conta para a J10. Agentes não criam contas. | Onda 0 | Supabase Auth + `profiles` | 10 min |
| 10 | Levantar o ambiente real do pai: resolução, escala do Windows, navegador, iPhone ou Android, mouse. Na Onda 1, imprimir a J8 no PC dele (Chrome e Edge, 100% e 125%). | Ondas 0 e 1 | Checklist na story | 20 min |
| 11 | Informar o plano Supabase (tempo máximo das Edge Functions, para a extração do FR-66) | Onda 1 | Uma linha | 1 min |
| 12 | Confirmar: app clássico só para admin (`?classico=1`); PR #5 e rascunhos #68–#72 e #82–#85 podem ser fechados; destino do código resgatado e do #77 (recomendação no FR-91) | Onda 0 | Uma linha | 2 min |
| 13 | **Trocar a chave temporária por uma chave de produção paga** (na camada paga os dados não vão para treino) e revogar a temporária | **Antes da primeira sessão com o pai (fim da Onda 1)** | Console Google + item 3 | 5 min |
| 14 | Rollback: promover o deploy anterior no painel do Vercel quando o portão pedir | Sob demanda | Painel do Vercel | 2 min |
| 15 | Vercel, só se o FR-53 entrar: decidir o plano (Hobby é não comercial, provável Pro) e rodar `vercel login` ou fornecer um token do escopo `gabriels-projects-46d997f6` | Onda 3 | — | 10 min |
| 16 | Conteúdo e decisões PRESYS: logo vetorial, texto da contracapa, certificações que pode declarar (17025 RBC, ISO 9001), contato e distribuidor, direito de uso das fotos, e **quem da engenharia decide** as divergências (TA-25N 140 vs 155 °C etc.; esquema de código de pedido do PCON-Y17) | Ondas 2–3 | Arquivos + um nome | — |

Para as Ondas 1 e 2 **não é preciso acesso ao Vercel pela CLI**: o modo chave do servidor não usa flag `VITE_`. O painel só é usado para rollback e para conferir a proteção de Preview.

---

## 6. Riscos e o que NÃO fazer

**Armadilhas já vistas neste repositório**
- **Teatro de prova.** Gemini falso, backend simulado e E2E pulado já foram contados como "verde". Nenhuma fatia de usuário fecha sem navegador real; nenhuma fatia de IA fecha sem pelo menos uma chamada real com custo registrado. Harness verde é regressão, não aceite.
- **Feature meio ligada.** Exemplos: `source-intake.ts` sem nenhum importador, "Corrigir este item" sem a prop, flags VITE que só valem no protótipo, designs que só existem no caminho da IA. Toda fatia termina ligada a uma tela, ou é um módulo puro com o consumidor nomeado na onda seguinte.
- **Backend diferente de `main`.** A função implantada já divergiu do repositório (PR83 vs #86). Só implantar a partir do SHA mergeado e ler o hash de volta.
- **CI com provas que o portão local não roda.** Rodar localmente as provas afetadas antes do push.
- **Documento em vez de tela.** Nada de novos ADRs, recibos ou "gates" em markdown. Só a story da onda (caixas marcadas + lista de arquivos) e, no fim, o runbook reescrito a partir das telas reais.
- **Redesign não pedido.** O visual navy/branco fica. Os arquétipos (FR-80) são modelos de página, não um redesign do app.

**Não fazer**
- Não criar um segundo renderizador de PDF no cliente (pdfmake, react-pdf, jsPDF): a W5C proíbe. Também não adotar Paged.js, Handsontable (licença comercial) nem Univer.
- Não deixar a IA escrever números. Valor técnico só vem de fato com fonte e status. Prosa com dígito fora dos fatos é rejeitada. Fato não verificado ou não decidido entra como "A COMPLETAR" e bloqueia o PDF no preflight.
- Não fazer re-layout automático escondido. A continuação de tabela é uma ação explícita e desfazível (contrato W4).
- Não mudar o `CatalogDocumentSchema` v1 por conveniência, nem guardar decisões numa tabela lateral, que se perderia com Desfazer, Duplicar e cópia traduzida. Campo opcional `metadata` só com decisão do @architect.
- Não enviar ao servidor, ao Gemini nem às páginas abas ou colunas de preço, markup, CONFIGURADOR, ORIGINAL_*, PENDING_ITEMS ou AccessLogs (clientes e e-mails). **XLSX e CSV nunca sobem**; só sobem células já filtradas. A exclusão é o padrão.
- Não sobrescrever `GEMINI_API_KEY`: ele é compartilhado com a tradução (as duas versões) e com o agente.
- Não usar `navigator.clipboard.readText` para colar tabela, porque dispara um pedido de permissão. Use a área "Cole aqui (Ctrl+V)".
- Não ressuscitar `vnext-catalog-agent` nem o protótipo. O caminho é composer + draft.
- Não construir o conversor clássico→v2 nem colaboração em tempo real completa. Não há dados reais para migrar, e presença é opcional (Onda 5).
- Não subir o orçamento sem liquidação e estorno (00028). Reservar sempre o pior caso é o que hoje limita a IA a cerca de 10 chamadas por dia.
- Não usar modelos preview nem a família 2.5. Os preços do 3.6/3.8-flash dobram em 2027-01-01 e os do 4-argon em 2026-12-01.
- Não dar `supabase db push` antes de conferir o ledger (FR-95), nem aplicar migração que quebre o cliente que está no ar.
- Não commitar nem imprimir a chave temporária. O arquivo de ambiente fica fora do repo e é apagado depois do uso.
- Não deixar o `EditorWorkspace.tsx` crescer: no máximo 150 linhas líquidas por fatia, e UI nova em arquivo novo.

**Riscos residuais**
- A IA ao vivo ainda não foi vista funcionando. A sonda da Onda 0 (FR-63) responde isso com um código concreto antes de qualquer linha de código. Se vier 502, o FR-61 (normalização, `thinkingConfig`, reparo) vira prioridade imediata da 1B.
- A chave temporária pode expirar ou estar no tier grátis. Por isso a chave paga entra antes da primeira sessão com o pai (§5 item 13).
- O `translation-provider-v1` (app clássico) continua fixo na família 2.5 e lê o mesmo secret. Ele é aceitável porque o clássico vira só admin, mas pode parar de traduzir.
- Nenhum modelo extrai tabelas com perfeição (cerca de 81–90 em benchmarks, [web]). Por isso existem o spike com go/no-go, a verificação por valor, o status VISUAL_ONLY com recorte e a confirmação humana. Para páginas difíceis há escalonamento opcional para 3.8-flash com resolução alta.
- Manuais longos podem estourar o tempo da Edge Function. A extração por intervalo de páginas reduz o risco; o plano Supabase define o teto (§5 item 11).
- As fontes do pai divergem. O app pode mostrar o conflito, mas a decisão é da engenharia PRESYS (§5 item 16).
- A paridade de geometria com escala do Windows em 125% e 150% não está provada. A medição é exata (`measurement.ts:127`) e pode gerar um falso "não foi possível confirmar as medidas". A medição da 1I decide se o FR-53 entra.
- Preview e produção compartilham o banco. Toda migração precisa ser aditiva (regra 6).
- O disco C: já encheu antes. Conferir o espaço livre antes de cada rodada de portões.
- Em 42ffb60, `source-intake.ts`, `bridge.ts` e `reopen-coordinator.ts` vieram do WIP do Codex. As auditorias acharam o bridge e o reopen corretos (693 testes passaram), e o intake está coberto pelo FR-65.

---

## Correções não aplicadas

Inclui as correções aplicadas só em parte ou com ajuste. As demais foram aplicadas como propostas.

- **19 (botão "Abrir" na linha arquivada):** não aplicada. `save_vnext_catalog_cas_v1` recusa catálogo arquivado (`00024:542-543`), então abrir geraria erro de salvamento. Fica só o "Duplicar".
- **14 (valor não resolvido como "célula vazia"):** aplicada com ajuste. O valor entra como "A COMPLETAR", porque o FR-51 bloqueia esse literal com ERRO, enquanto uma célula vazia isolada não gera diagnóstico (`EMPTY_TABLE_ROW` vale só para linha inteira e é aviso).
- **7 (a 2.0 cria `useStageZoom()`):** aplicada com ajuste. Com a correção 21, quem cria o hook e a variável é a 1I, na Onda 1; a 2.0 só os move junto com o CanvasHeader.
- **36 (cada jornada como script Playwright no `quality-gates.yml`):** aplicada só para versões harness com backend simulado. Jornadas com Supabase e Gemini reais não rodam no CI e continuam como aceite manual (FR-93).
- **28:** aplicada pela opção "subir o FR-72 para P1". Tirar a J3 foi descartado porque ajustar por conversa é pedido explícito do dono ("IA que cria catálogos como deveria").
- **38:** aplicada com ajuste. O commit local de resgate (0A) foi mantido porque custa minutos e evita perda irreversível; o destino (portar ou substituir) é decidido na Onda 0.
- **8:** aplicada pela opção "`bootstrap.tsx` na 2G". O FR-45 não foi adiado para a Onda 5, porque ligar `isOffline` e `invalidateAuth` é pequeno e serve à J13.

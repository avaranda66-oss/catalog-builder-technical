# Contrato editorial de tabelas

STATUS: APPROVED FOR FOUNDATION-PROOF-01 IMPLEMENTATION
PRINCIPAL REVIEW: APPROVED
FREEZE STATUS: FROZEN FOR FOUNDATION-PROOF-01
DATE: 2026-09-09

BASELINE: `616332d6048a4259d2e2b562d8d5e781cea334bd`

Decisão Principal para FOUNDATION-PROOF-01 — FROZEN: **um único motor de tabela**. Evoluir seletivamente as lições do Table Core sem carregar sua autoridade runtime legada. Preservar stable table/row/column/cell IDs, collision-safe cell key, validação estrutural estrita, rowSpan, colSpan, `coveredBy`, merge fail-closed, `MERGE_WOULD_DISCARD_CONTENT`, operações imutáveis, conteúdos tipados, apresentação separada de conteúdo e conceitos físicos em mm.

Não portar como autoridade VNext: legacy adapter/bridge, `TechnicalTableBlock`, `CustomTableBlock`, motores especializados, fallbacks runtime por tipo de tabela, `A4Canvas`, PageFlow automático ou o download PDF raster atual. O geometry resolver é **REIMPLEMENTED FROM LESSONS**: testes e contraexemplos do legado servem de evidência, mas o solver novo obedece o contrato desta revisão.

## Correspondência de campos

| Campo legado | Novo contrato |
|---|---|
| table.id, row.id, column.id, cell.id | Conservar identidades estáveis; geração injetada |
| column.semanticKey | Proveniência opcional; não obrigatório em uma tabela manual |
| column.defaultLabel | Cabeçalhos são células das linhas header; label auxiliar não compete com o conteúdo |
| cells indexadas por row/column | Manter coordenadas por IDs, índice derivado; uma célula por interseção |
| colSpan/rowSpan e coveredBy | Span persistido na âncora e `coveredBy` explícito nas células cobertas; estado cruzado validado fail-closed |
| literal e datum_reference | MVP materializa conteúdo literal; referência de origem opcional, sem resolver PIM em render |
| row.minHeightMm | `RowHeightPolicy = AUTO | MIN_MM | FIXED_MM`, com valor em mm quando aplicável |
| presentation.tableWidth | Remover duplicação; largura vem do frame do objeto |
| density/fontScale/padding tokens | Atalhos aplicam valores explícitos em pt/mm; não limitam usuário a três tamanhos |
| cell.styleOverride e presentation.cellStyleOverrides | Um único override na célula |
| paginação automática | Divisão explícita do usuário; nenhuma criação de página durante medição |
| title | `TableAnnotation(kind:'caption')` referenciada pela tabela |
| legendas/notas em customData/blocos auxiliares | `TableAnnotation` tipada e markers semânticos com IDs estáveis |

## Forma candidata

```ts
type Column = {
  id: string;
  width: {mode:'fixed'; mm:number} | {mode:'flex'; weight:number};
  minMm: number;
  maxMm?: number;
  style?: CellStyle;
};
type Row = {
  id: string;
  role: 'header' | 'body' | 'section';
  heightPolicy:
    | {mode:'AUTO'}
    | {mode:'MIN_MM'; minMm:number}
    | {mode:'FIXED_MM'; heightMm:number};
  style?: CellStyle;
};
type Cell = {
  id: string; rowId: string; columnId: string;
  content: CellContent;
  contentPresentation?: CellContentPresentation;
  span?: { rows:number; columns:number };
  coveredBy?: string;
  annotationIds?: string[];
  style?: CellStyle;
};
type TableAnnotation = {
  id: string;
  kind: 'note' | 'footnote' | 'caption';
  text: RichText;
};
type TableModel = {
  id: string;
  columns: Column[]; rows: Row[]; cells: Cell[];
  style: TableStyle;
  annotationIds?: string[];
  annotations: TableAnnotation[];
  legend: TableLegendEntry[];
};

type TextMark = 'bold' | 'italic' | 'subscript' | 'superscript';
type RichTextInline =
  | { kind:'text'; id:string; text:string; marks:TextMark[] }
  | { kind:'lineBreak'; id:string };
type RichTextParagraph = {
  id:string;
  inlines:RichTextInline[];
  list?: { kind:'ordered'|'unordered'; level:0|1|2|3 };
};
type RichText = { paragraphs:RichTextParagraph[] };

type MeasurementQualifier = 'approx' | 'min' | 'max';
type CellContent =
  | { type:'empty' }
  | { type:'richText'; value:RichText }
  | { type:'technicalCode'; value:string }
  | { type:'measurement'; valueText:string; unit:string; qualifier?:MeasurementQualifier }
  | { type:'marker'; legendEntryId:string }
  | { type:'image'; assetId:string };

type CellContentPresentation = {
  wrapPolicy?: 'wrap' | 'nowrap';
  image?: {
    fit:'contain' | 'cover';
    targetWidthMm:number;
    targetHeightMm:number;
  };
};

type TableLegendEntry = {
  id:string;
  markerCode:string;
  text:RichText;
};
```

### Contrato exato de CellContent — FOUNDATION REQUIRED, FROZEN FOR FOUNDATION-PROOF-01

`CellContent` é semântico; apresentação não entra nessa união. Regras de validação:

- `empty`: somente `{type:'empty'}`; qualquer payload adicional é inválido.
- `richText`: `value` é obrigatório. `paragraph.id` e `inline.id` são IDs estáveis e únicos dentro daquele RichText. `text` de inline textual é string não vazia; parágrafo vazio é representado por `inlines:[]`. `marks` não tem duplicatas, usa ordem canônica `bold, italic, subscript, superscript` e não permite `subscript` + `superscript` simultaneamente. Quebra explícita é inline `lineBreak` com ID próprio; não inserir `\n` escondido em `text` para simular estrutura.
- `technicalCode`: `value` obrigatório, não vazio, sem CR/LF/NUL; preservar exatamente o texto sem float-normalization, soft break, case folding ou trimming sem comando autoral. A política de wrap não pertence ao valor.
- `measurement`: `valueText` e `unit` obrigatórios; `qualifier` é opcional e somente `approx|min|max`. `valueText` é um **decimal lexeme autoral preservado byte-for-byte** e deve satisfazer `^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$`; não fazer parse/serialize por `number`, não remover zeros finais e não reescrever notação científica. `unit` deve ser não vazia após validação, sem caracteres de controle; o texto armazenado permanece o texto autoral. Faixa/expressão composta continua `richText` com runs técnicos protegidos, sem linguagem de fórmula implícita.
- `marker`: `legendEntryId` obrigatório e deve resolver exatamente um `TableLegendEntry.id` da mesma tabela; `markerCode` e legenda são derivados dessa entrada, não duplicados na célula. Referência inexistente é `MARKER_LEGEND_REFERENCE_DANGLING / ERROR`.
- `image`: `assetId` obrigatório e deve resolver exatamente um `AssetRef.id` estável do documento; URL temporária nunca é identidade. Asset ausente é `ASSET_REFERENCE_DANGLING / ERROR`; falha de readiness/decode continua bloqueante. Alt text vem do `AssetRef`; um override contextual futuro exige contrato semântico próprio, não campo JSON livre.

`wrapPolicy`, `fit` e dimensões visuais pertencem a `CellContentPresentation`, portanto não alteram o valor semântico. Para `richText`, `technicalCode` e `measurement`, o estilo resolvido antes do render deve possuir `wrapPolicy` explícito; default canônico de base é `wrap` para richText/measurement e `nowrap` para technicalCode. Para `image`, `contentPresentation.image` é obrigatório em FOUNDATION-PROOF-01: `fit` é `contain|cover` e `targetWidthMm/targetHeightMm` são finitos, positivos e normalizados pelo contrato físico. `image` presentation em conteúdo não-image é inválido. Caption não pertence a `CellContent` nem a image presentation: em FOUNDATION-PROOF é `TableAnnotation(kind:'caption')` de escopo da tabela.

Essa capacidade produz especificações, comparação, compatibilidade, acessórios, fornecimento, insertos e pedidos sem sete motores. Diagonal de canto é apresentação de cabeçalho, não célula de negócio nova; pode ser adiada sem perder agrupamentos e conteúdo.

## Geometria externa, tracks e bordas — FOUNDATION REQUIRED, FROZEN FOR FOUNDATION-PROOF-01

`frame.xMm`, `frame.yMm`, `frame.widthMm` e `frame.heightMm` pertencem ao objeto tabela e são autoria. Para largura, `frame.widthU` é **a largura total do plano de tracks**: `sum(columnTrackWidthsU) === frame.widthU`. Bordas e padding não são subtraídos antes do solver e não podem aumentar o frame. O renderer mantém `renderedIntrinsicHeightQ` como fato espacial Chromium. **R0.1.3:** o overflow do envelope final da tabela compara esse fato diretamente com `uToQ(frame.heightU)` no mesmo espaço Q; igualdade em Q é OK. `qToU` continua disponível para RowHeightPolicy/diagnóstico quando um algoritmo de domínio realmente precisa consumir uma medição Chromium, mas não decide essa comparação final. Caption/notes/footnotes, grid e espaçamentos participam da altura intrínseca, e measurement jamais escreve no frame.

### Autoridade de renderização para FOUNDATION-PROOF-01

Escolha congelada para FOUNDATION-PROOF-01 após counterproof Chromium: **CSS Grid é a única autoridade de layout visual da proof; HTML `<table>` é rejeitado como autoridade física**. `table-layout:fixed` não impede border/collapse/spacing de alterar o border box e não garante que o vetor físico resolvido seja o vetor final do Chromium. Nenhum `<table>`, `border-collapse`, `border-spacing`, width auto ou algoritmo de redistribuição de tabela participa de `ProofTable`.

### Semântica/acessibilidade sem ceder geometria ao browser

O mesmo DOM editorial preserva base semântica de tabela: root `role="table"` com `aria-rowcount`/`aria-colcount`; cada linha lógica possui wrapper `role="row"`, `aria-rowindex` e `display:contents`; anchors aparecem em ordem lógica row-major e usam `role="columnheader"` quando `Row.role === 'header'`, caso contrário `role="cell"`, além de `aria-rowindex`, `aria-colindex`, `aria-rowspan`/`aria-colspan` quando maiores que 1. Células `coveredBy` não geram item visual/semântico independente. `grid-row`/`grid-column` posicionam anchors sem alterar a ordem lógica do DOM.

Isso promete structured DOM, reading order determinístico, foundation de acessibilidade em screen e text layer no PDF Chromium. **Não** promete PDF/UA, tagged-PDF completo ou equivalência automática entre ARIA e estrutura interna do PDF; esses requisitos permanecem fora de FOUNDATION-PROOF-01.

### PhysicalPixelQ e projeção conservativa

O contrato de domínio permanece `PhysicalLengthU = 10_000 U/mm`. O renderer usa somente como projeção efêmera `PhysicalPixelQ = 1/64 CSS px`, conforme D3; `Q` nunca é persistido.

Para `frameU > 0`, `frameQ = roundHalfAway(frameU * 384 / 15_875)`. Dado o vetor canônico `widthsU` já validado com `sum(widthsU) === frameU`, para cada coluna `i` calcular `numerator_i = widthsU[i] * 384`, `baseQ_i = floor(numerator_i / 15_875)` e `remainder_i = numerator_i mod 15_875`. Então `deltaQ = frameQ - sum(baseQ)`. Como a soma ideal dos tracks é a ideal do frame, `0 <= deltaQ <= columnCount`; se não, falhar `TRACK_PROJECTION_INVARIANT / ERROR`. Ordenar colunas por `remainder` decrescente, empate pela ordem estável do modelo, e somar `+1 Q` às primeiras `deltaQ`. Resultado obrigatório: todo `trackQ > 0` e `sum(trackQ) === frameQ` exatamente; track que projetar para zero gera `TRACK_PROJECTION_NONPOSITIVE / ERROR`.

CSS recebe **o vetor Q final**, nunca mm: root `width = frameQ/64 px`; `grid-template-columns = trackQ[i]/64 px`; `gap:0`. A string px é produzida exatamente a partir do inteiro Q. O browser não recebe sobra para redistribuir. Viewport e `devicePixelRatio` não entram na projeção.

### Cell box e padding

O root usa `position:relative; display:grid; box-sizing:border-box; gap:0; margin:0; border:0; padding:0`. Cells usam `box-sizing:border-box; min-width:0; min-height:0; margin:0; border:0; overflow:visible`. Não há CSS border nem gap na grade da proof.

`trackQ` é a largura total canônica do grid area. Padding autoral permanece em mm/U, é projetado pela conversão **escalar** D3 para `paddingQ` e aplicado **dentro** do track. O content box é o span de tracks menos padding esquerdo/direito e a row span menos padding superior/inferior; border paint não é subtraído. Se padding tornar largura/altura de conteúdo `<= 0`, `CELL_CONTENT_BOX_NONPOSITIVE / ERROR`.

Paint pode sobrepor a faixa de padding. Não existe um mínimo universal inventado: se o padding do lado que recebe paint for menor que `thicknessQ`, emitir `BORDER_CONTENT_CLEARANCE / WARNING`. Os presets G01–G05 devem declarar padding suficiente para suas linhas aprovadas. Esse warning nunca cresce track/row nem move conteúdo automaticamente.

### Border é paint, não box geometry

FOUNDATION-PROOF-01 suporta `none` ou `solid` como padrão físico de edge; `hidden`, `double`, `dashed`, `dotted` ou outro pattern não podem ser mapeados silenciosamente e são `UNSUPPORTED_BORDER_PATTERN / ERROR` nesta proof. `none` significa ausência de candidato, não a semântica especial de CSS `hidden`.

Para `solid`, `thicknessPt` é autoral e positivo. Interpretar `Number.toString(thicknessPt)` pelo parser decimal racional D3 e converter diretamente pela relação exata `1 pt = 4/3 CSS px = 256/3 Q`: `idealThicknessQ = thicknessPt * 256 / 3`, round-half-away-from-zero, com safe-integer checks. Não passar por CSS `border-width` e não fazer dupla quantização pt -> U -> Q. Exemplos normativos: `0.25 pt -> 21 Q`, `1 pt -> 85 Q`, `2 pt -> 171 Q`. `solid` que projeta para `0 Q` é `BORDER_THICKNESS_PROJECTS_TO_ZERO / ERROR`.

Cada linha final é um paint segment absolutamente posicionado (`position:absolute`, `pointer-events:none`, `margin:0`, `border:0`, background/color resolvido) com `xQ`, `yQ`, `widthQ`, `heightQ`; CSS recebe esses valores como Q/64 px. O paint layer não participa de grid sizing, não altera row/column/frame, é o mesmo em screen/print e permanece conteúdo vetorial/paint no PDF Chromium. Horizontal segments são emitidos primeiro e vertical segments depois; em crossings, vertical pinta por cima, tornando a interseção determinística sem duplicar shared edge.

### Outer edge placement — completamente inset

Outer paint fica **inteiramente dentro do authored frame**. Para espessura `tQ`: left `xQ=0,widthQ=tQ`; top `yQ=0,heightQ=tQ`; right `xQ=frameQ-tQ,widthQ=tQ`; bottom `yQ=gridHeightQ-tQ,heightQ=tQ`. Logo um frame válido dentro dos limites físicos não ganha ink extent externo por causa de border. Se `tQ` não cabe no frame/row/track proprietário, `BORDER_PAINT_GEOMETRY_INVALID / ERROR`.

### Internal edge ownership, conflitos e spans

A topologia usa **atomic edges** da full grid: vertical `(columnBoundaryIndex,rowIndex)` por um row track e horizontal `(rowBoundaryIndex,columnIndex)` por um column track. Shared edge é resolvido uma vez pelo VNext, nunca por CSS collapse.

- Vertical interna no boundary `xQ = cumulativeTrackQ[k]` é pintada toda no lado trailing/direito: `[xQ, xQ+tQ)`, owner lógico = célula/anchor à direita.
- Horizontal interna no boundary `yQ = cumulativeRowQ[k]` é pintada toda no lado trailing/abaixo: `[yQ, yQ+tQ)`, owner lógico = célula/anchor abaixo.
- Outer left/top começam no boundary e entram no frame; outer right/bottom são recuadas por `tQ` como acima. Nunca centralizar linha na boundary.

Antes de paint, cada lado interior produz candidate já resolvido pela cascata `table -> row role -> column -> row -> cell`, carregando `sourceLevel`. Em **outer edge** existe somente o candidato do lado interior adjacente; não há candidato fictício “fora” da tabela. Se esse candidato final for `none`, não há outer segment; se for `solid`, ele é o vencedor e usa o placement inset acima. Para cada atomic **shared internal edge**: se ambos são `none`, não há segment; se apenas um é `solid`, ele vence; se ambos são `solid`, maior `thicknessQ` vence; em empate Q, maior espessura pt racional vence; persistindo empate, maior `sourceLevel` vence (`cell > row > column > rowRole > table`); persistindo empate, trailing side vence (direita para vertical, abaixo para horizontal). Cor vem do candidato vencedor. Não existe CSS conflict resolution implícita.

Span suppression deriva somente de full-grid + `coveredBy`: para cada atomic edge interna, descobrir o anchor que ocupa o slot de cada lado. Se ambos os slots pertencem ao **mesmo anchor span**, o edge é `SUPPRESSED` e não produz paint. Se pertencem a anchors diferentes, resolver normalmente. Isso cobre `colSpan`, `rowSpan` e combinação dos dois; somente o perímetro do merged anchor permanece. Segmentos contíguos com propriedades idênticas podem ser agregados como otimização, mas a lista atomic é a autoridade testável.

### Rows e horizontal paint

Paint horizontal é downstream da row geometry e jamais mede/muta rows. O renderer trabalha em duas fases do **mesmo componente/árvore**, não em dois engines: (1) transform-free measurement grid com column `trackQ`, padding Q, sem paint, mede conteúdo após fonts/assets/images ready; todo browser rect normaliza primeiro para Q e, quando RowHeightPolicy precisa de U, converte Q -> U pelo contrato D3; (2) aplicar AUTO/MIN_MM/FIXED_MM e o solver global de intervalos/prefixos R0.1.3 em U. Com resolved row heights `rowHeightU`, formar boundaries cumulativas `boundaryU[0]=0`, `boundaryU[i+1]=boundaryU[i]+rowHeightU[i]`; projetar cada boundary por U -> Q e definir `rowQ[i]=boundaryQ[i+1]-boundaryQ[i]`. Todo `rowQ > 0`.

O final grid recebe `grid-template-rows` explícito em Q. Só então gerar paint a partir de `trackQ`, `rowQ` e edge topology. Como paint é absolute/pointer-events none, sua criação não pode provocar semantic reflow. O paint layer já existe antes de layout report/preflight e dos dois snapshots de estabilidade.

### Zoom/pan e measurement authority

Editor zoom/pan fica **fora** do root editorial autoritativo. FOUNDATION-PROOF mede em render root isolado, transform-free; publicação também é transform-free. Não dividir `DOMRect` por “current zoom”. Um transform de UI pode alterar o rect visual da cópia/viewport, mas `PhysicalLayoutFact` é capturado somente do root sem transform.

### Counterproof Chromium local

Chromium `151.0.7922.34`, Playwright já presente no baseline:

| Caso | Evidência observada |
|---|---|
| HTML table 100 mm, 50/50, border 0 | border box ~`99.9960 mm` |
| HTML table `border-collapse:collapse`, 1 pt | border box ~`100.2605 mm` |
| HTML table `border-collapse:separate; border-spacing:0`, 1 pt | border box ~`100.5251 mm` |
| CSS Grid mm ingênuo 50/50 | ~`99.9960 mm`; expõe quantização Blink |
| Q Grid 100 mm, 50/50, sem paint | `frameQ=24189`, `trackQ=[12095,12094]`; actual Q exatamente igual |
| Q Grid 100 mm, 50/50, paint 1 pt | `thicknessQ=85`; todos os segment bounds iguais ao esperado |
| Q Grid 100 mm, 20/30/50, paint 1 pt | `trackQ=[4838,7257,12094]`; soma `24189`; segments exatos |
| CSS `border-width:1.328125px` | Chromium canonicalizou para `1px`; CSS border-width não serve como autoridade física |
| Paint rectangle `width:1.328125px` | geometria posicionada reteve aproximadamente `1.33px`; confirma separação track geometry / border paint |
| Paint 0.25 pt / 2 pt | `21 Q` / `171 Q`, bounds exatos |
| colSpan / rowSpan / rowSpan+colSpan | internal atomic edges cobertos ausentes; perimeter/remaining edges exatos |
| screen/print, viewport 900/1500, DPR 1/2 | 4 runs com geometria final idêntica; `0` mismatches expected vs actual |
| UI wrapper `scale(1.25)` | raw visual DOMRect mudou ~100 -> ~125 mm; transform não é autoridade |
| Chromium PDF final | text layer presente (`42` text items no probe); `111` constructPath / `110` fill; `0` PDF.js image-paint ops |

O counterproof prova a invariância exigida: a projeção Q é exata/repetível e Chromium não redistribui track/paint geometry. Não afirma que `frameQ` representa matematicamente exatamente os mm autorais; U continua sendo a autoridade física do documento.

Contrato de altura do objeto em FOUNDATION-PROOF-01, amendado por R0.1.3:

```text
renderedIntrinsicHeightQ <= uToQ(frame.heightU)  -> OK
renderedIntrinsicHeightQ >  uToQ(frame.heightU)  -> TABLE_CONTENT_OVERFLOW / ERROR
```

`frame.heightU` permanece autoridade autoral e persistida; `Q` permanece projeção efêmera do renderer. Igualdade já observada em Q não pode virar overflow por round-trip `Q -> U`. `qToU(renderedIntrinsicHeightQ)` pode aparecer apenas como diagnóstico derivado. `TABLE_CONTENT_OVERFLOW` bloqueia GREEN e PDF final. Nunca auto-grow no renderer. Um futuro comando explícito `Fit height to content`/`FitTableHeightToContent` pode gravar novo `frame.heightMm`; isso é USER COMMAND, não side effect de measurement.

`RowHeightPolicy` também é FOUNDATION REQUIRED — FROZEN FOR FOUNDATION-PROOF-01. `AUTO`: conteúdo define a altura derivada da linha. `MIN_MM`: altura derivada = `max(intrinsic, minMm)`. `FIXED_MM`: altura autoral exata. Se conteúdo exceder `FIXED_MM`, emitir `ROW_CONTENT_OVERFLOW / ERROR`. Não reduzir fonte, aumentar a linha, cortar silenciosamente nem alterar conteúdo. CSS `height` em `<tr>` sozinho não prova teto; a prova deve medir e detectar overflow real.

Arrastar lateral da tabela é user command que muda `frame.widthMm` e re-resolve colunas flex. Ajustar altura do frame também é user command. Measurement pode diagnosticar o efeito, mas não mover vizinhos, alterar o frame ou paginar.

Mesclas verticais: a altura do conteúdo da âncora precisa caber na soma das linhas cobertas. Primeiro calcular a altura-base de cada row (`AUTO = intrinsic`, `MIN_MM = max(intrinsic,min)`, `FIXED_MM = authored`) sem usar rowspan para crescer linhas. **R0.1.3 substitui a distribuição sequencial R0.1.2 por uma solução global de mínimo total extra.**

Considere somente rows growable (`AUTO`/`MIN_MM`) em ordem semântica, com extras inteiros `x[k] >= 0`. Para cada rowspan, calcule `deficitU = max(0, requiredSpanContentHeightU - sum(baseCoveredRowHeightsU))` usando as alturas-base, nunca alturas já incrementadas. As growable rows tocadas por um span formam um intervalo `[l,r]` nessa sequência e impõem `sum(x[l..r]) >= deficitU`. Se `deficitU > 0` e o span não contém growable row, emitir `ROW_CONTENT_OVERFLOW / ERROR`; `FIXED_MM` nunca cresce.

Defina `P[0]=0` e `P[k+1]=P[k]+x[k]`. Não-negatividade produz edges `P[k+1] >= P[k]`; cada rowspan produz `P[r+1] >= P[l] + deficitU`. Todos os edges apontam para frente, então formam DAG. Calcular cada prefixo como o maior valor exigido por seus predecessores (longest path em ordem semântica) e derivar `x[k]=P[k+1]-P[k]`. Qualquer solução factível precisa dominar todo path e portanto tem `P[m]` ao menos igual ao longest path final; a solução construída atinge esse limite e minimiza exatamente o total extra. Como todos os pesos são `PhysicalLengthU` inteiros, não há divisão, remainder ou float. A forma componentwise-minimum do vetor de prefixos é a canonicalização determinística quando existem múltiplos vetores de row heights com o mesmo total mínimo; ordem de constraints/DOM não altera o resultado.

**HISTÓRICO R0.1.2 PRESERVADO:** no counterexample reproduzido, requirements `[407789,407789] U` sobre base `[100000,100000,100000] U` produziram `[203895,255842,151947] U` (`611684 U`) pelo algoritmo antigo, enquanto `[100000,307789,100000] U` (`507789 U`) satisfaz ambos e cabe no frame `550000 U`. A expansão artificial `103895 U` (~`10.3895 mm`, ~`20.46%`) confirmou o watch e falsificou somente a decisão de alocação de rowspan.

Se o conteúdo intrínseco exceder o frame, objetos vizinhos permanecem no lugar e a prova falha com overflow. A UI futura pode oferecer ampliar/mover, reduzir padding/fonte por escolha explícita, ajustar colunas ou dividir após uma linha. Nunca esconder linhas, diminuir tudo silenciosamente, anexar folhas sem ação ou transformar measurement em autoria.

## Largura de colunas, solver puro — FOUNDATION REQUIRED, FROZEN FOR FOUNDATION-PROOF-01

```ts
resolveColumns(table, availableTrackWidthMm)
  => { ok: true, widths }
   | { ok: false, code, details }
```

Invariantes: cada width > 0; `minWidth` respeitado; fixed respeitado; flex distribui somente espaço restante; arredondamento determinístico; conservação da largura; zero DOM authority. `availableTrackWidthMm` é o `frame.widthMm` autoral da tabela; border/padding não o alteram. Para o mesmo modelo e largura a saída é independente de viewport, zoom e renderer. O solver usa obrigatoriamente `PhysicalLengthU` (`0.0001 mm`) e a normalização definida em D3; `weight` deve ser inteiro positivo seguro; igualdade e conservação são inteiras, sem epsilon. Overflow de qualquer soma/produto inteiro retorna `PHYSICAL_ARITHMETIC_OVERFLOW / ERROR`.

MVP persiste fixed ou flex com min/max. Não existe `auto` persistido que varie de significado entre browsers. “Ajustar ao conteúdo” é ação explícita que mede com fontes prontas, mostra preview e grava larguras fixed. Assim cobre a intenção de auto sem tornar a medição autoridade oculta do documento.

1. Normalizar `availableTrackWidthMm`, min/max e fixed para `PhysicalLengthU`; validar limites e `weight` inteiro positivo seguro.
2. Reservar fixed. Para flex, começar no minMm.
3. Se fixed + mínimos flex exceder disponível: `TABLE_WIDTH_INFEASIBLE`; não retornar sucesso com coluna zero.
4. Distribuir o residual entre flex proporcionalmente a weight em inteiros; para cada rodada usar `q=floor(remainingU*weight/totalWeight)` e resto inteiro. Congelar as que atingirem max e repetir com as restantes.
5. Se todas atingirem max e sobrar largura, informar inviabilidade da largura exata. Não inserir espaço invisível na grade nem esticar fixed.
6. Se só há fixed, a soma deve fechar `availableTrackWidthU`. “Ajustar tabela às colunas” altera o frame explicitamente; “Ajustar colunas à largura” propõe novas larguras respeitando limites.
7. Distribuir unidades residuais por resto decrescente; empate pela ordem estável das colunas no modelo. Em sucesso `sum(widthsU) === availableTrackWidthU` exatamente. Converter para mm apenas na fronteira de saída por `/ 10_000`; a projeção Chromium em `Q` acontece depois e não altera `widthsU`. Testes de domínio comparam o vetor `U`; testes de render comparam `frameQ`/`trackQ` exatamente.

Contraexemplo obrigatório: `available = 100 mm`, fixed A = 70, fixed B = 50, flex C min = 20. Resultado: ERROR `TABLE_WIDTH_INFEASIBLE`. É proibido retornar valid + warning ou `C = 0`.

Arraste de divisor interno preserva largura total e modifica o par adjacente. Preview limitado por min/max; ao soltar, as duas colunas viram fixed nas medidas escolhidas. Se inviável, rejeitar sem alterar. Redimensionar frame preserva fixed e redistribui flex; com todas fixed, orientar “Ajustar colunas à largura”, não inventar escala de fonte.

Não há largura mínima universal de leitura. Preset fornece limites explícitos; FOUNDATION-PROOF-01 mede legibilidade com código, unidade, imagem e textos reais. Esses valores são decisões editoriais a validar impressas, não constantes de negócio baseadas em chute.

## Mesclagem e integridade

- Região deve ser retangular, contígua, dentro da tabela; spans inteiros positivos. Âncora no canto superior esquerdo.
- Uma região não cruza outra mescla nem atravessa limite entre header e body. Header/section pertencem à estrutura da grade.
- Mescla comum só cobre células vazias. Se há dados, retornar `MERGE_WOULD_DISCARD_CONTENT`. UI explica e permite cancelar ou editar o conteúdo antes; nunca perder valores para simplificar aparência.
- Cobertas conservam seus IDs, conteúdo empty e estilos; `coveredBy` aponta para a âncora e deve ser consistente com o span. `coveredBy` pendente, cíclico, fora da região ou em conflito com `span` é ERROR. Unmerge libera a grade e mantém conteúdo na âncora. Undo de merge recupera exatamente a versão anterior.
- Inserir linha/coluna estritamente dentro de um span o expande e cria células vazias; fora do span desloca a região pelo deslocamento das linhas/colunas, preservando IDs. Inserir imediatamente antes da primeira ou depois da última linha não expande.
- MVP rejeita excluir/reordenar uma linha/coluna que intersecte uma mescla: `MERGE_INTERSECTION`. Inspector oferece desfazer mesclagem e tentar novamente. Operação conjunta Unmerge + Delete pode ser uma transação explícita, sem silenciosamente transferir valores.
- Copiar região inteira remapeia IDs e spans; seleção parcial de merge é rejeitada com orientação de selecionar toda a região. Colar TSV em região com merge é rejeitado na V1; valores existentes não são apagados sem transação reversível.
- Validação estrutural canônica exige IDs válidos/únicos, ao menos uma coluna, ao menos uma linha total, topologia completa de células para a grade e integridade de spans/`coveredBy`/mesclas. **Nenhuma linha `header` é obrigatória.** Uma tabela só com linhas `body`/`section` pode ser estruturalmente válida. Preset, template ou policy de publicação/conteúdo pode exigir um ou mais headers, mas essa exigência fica fora do Table Engine canônico. Remover a última coluna ou a última linha total requer remover a tabela explicitamente.

Essas regras alteram algumas operações existentes. Reutilizar testes de perda de dados, mas escrever testes novos para a política documentada; não afirmar que o legado já faz tudo isso.

## Estilos, cabeçalhos e annotations

Precedência por propriedade: base da tabela → papel da linha (header/section) → coluna → linha → célula → marca de run. Undefined herda; remover override restaura herança. Somente uma fonte por nível. Bordas seguem exclusivamente o edge-candidate/paint conflict contract acima; CSS border/collapse não resolve conflitos. Densidade é preset de tamanho/padding/line-height, não fator scale CSS.

Cabeçalhos agrupados são linhas header com spans, não grupos mantidos em estrutura paralela. `TableAnnotation` cobre `note`, `footnote` e `caption`; IDs são estáveis e annotation não é row, “fake row” nem célula sintética: não participa de row/column indexing e só entra na geometria pelo contrato tipado de annotations.

Escopo canônico: `cell.annotationIds` pode referenciar somente `note` ou `footnote`; `caption` em cell scope é inválida. `table.annotationIds` pode referenciar `caption`, `note` ou `footnote`, portanto notas/footnotes de tabela são permitidas. Todo ID deve existir exatamente uma vez em `table.annotations`. ID inexistente em qualquer scope gera `ANNOTATION_REFERENCE_DANGLING / ERROR`; kind incompatível com o scope gera `ANNOTATION_SCOPE_INVALID / ERROR`. A annotation participa da geometria intrínseca e deve aparecer na página do objeto tabela correto. Remover annotation referenciada é erro; remover a última referência não apaga annotation automaticamente. Caption usada em FOUNDATION-PROOF é table-scope e nunca campo de image content/presentation. Legenda explica os markers; texto alternativo não deve depender de cor.

## Conteúdo técnico — FOUNDATION REQUIRED, FROZEN FOR FOUNDATION-PROOF-01

Conteúdo semântico nunca é alterado para caber. Para `technicalCode`, a política visual fica em `cell.contentPresentation.wrapPolicy`, separada de `content.value`. Para G05 usar `wrapPolicy = 'nowrap'` com o valor adversarial `06.04.0121-00/IN1P/TA-50N-NH-PB-XXXXXXXXXXXX`. Se não couber, emitir diagnóstico bloqueante; é proibido inserir soft break no valor, reduzir fonte automaticamente, expandir frame/row escondidamente ou fazer clipping silencioso. Outras células podem permitir `wrap` visual sem alterar o valor semântico original.

`SplitTable(afterRowId, targetPageId, targetFrame)` cria duas tabelas independentes em uma transação. Não divide linha nem rowspan. Linhas de corpo movidas preservam IDs; headers copiados ganham IDs novos, com refs remapeadas; notas/legendas necessárias são copiadas e refs remapeadas na segunda tabela. Caption da segunda recebe indicação explícita de continuação. Não há vínculo de sincronização posterior implícito entre as duas.

## Provas mínimas

Roundtrip de schema; preservação de IDs e collision-safe cell key; merge/unmerge sem perda; `coveredBy` fail-closed; inserção interior ao span; rejeição de exclusão/reorder conflitante; **tabela headerless válida roundtrip/renderiza sem header sintético quando policy permite**; coluna inviável sem zero; conservação inteira exata de largura; bordas; `ROW_CONTENT_OVERFLOW`; `TABLE_CONTENT_OVERFLOW`; captions/notes/footnotes participando da geometria; imagem lenta/falha; decimal/código nowrap intacto; três tabelas independentes; Undo atômico; paridade screen/print. As referências e critérios estão no plano de execução.

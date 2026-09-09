# Contrato editorial de tabelas

STATUS: PROPOSED
PRINCIPAL REVIEW: PENDING
FREEZE STATUS: NOT FROZEN
DATE: 2026-09-09

BASELINE: `616332d6048a4259d2e2b562d8d5e781cea334bd`

Decisão recomendada — PROPOSED: **um único motor de tabela**. Evoluir seletivamente as lições do Table Core sem carregar sua autoridade runtime legada. Preservar stable table/row/column/cell IDs, collision-safe cell key, validação estrutural estrita, rowSpan, colSpan, `coveredBy`, merge fail-closed, `MERGE_WOULD_DISCARD_CONTENT`, operações imutáveis, conteúdos tipados, apresentação separada de conteúdo e conceitos físicos em mm.

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
  legend: {id:string; markerCode:string; text:RichText}[];
};
```

CellContent é união estrita: empty; richText; technicalCode; measurement; marker; image. RichText e AssetRef seguem o documento. Measurement guarda representação decimal como string validada, unidade e qualificador; não converter automaticamente para float nem alterar casas significativas. Faixas/expressões compostas podem ser RichText com runs técnicos protegidos na V1; não construir uma linguagem de fórmulas agora. Marker guarda código e referência à legenda, não um glifo sem significado. Image guarda assetId, dimensões pretendidas em mm, fit, alt e caption opcional.

Essa capacidade produz especificações, comparação, compatibilidade, acessórios, fornecimento, insertos e pedidos sem sete motores. Diagonal de canto é apresentação de cabeçalho, não célula de negócio nova; pode ser adiada sem perder agrupamentos e conteúdo.

## Geometria externa e interna — FOUNDATION REQUIRED, PROPOSED

`frame.xMm`, `frame.yMm`, `frame.widthMm` e `frame.heightMm` pertencem ao objeto tabela e são autoria. Width é largura externa total, incluindo borda. O solver recebe somente a largura interna disponível, após bordas e espaçamento contabilizados uma única vez. O renderer produz `renderedIntrinsicHeightMm` como métrica DERIVED: caption/notes/footnotes, grid e espaçamentos participam dessa altura, mas jamais escrevem no frame.

Contrato de altura do objeto em FOUNDATION-PROOF-01:

```text
renderedIntrinsicHeightMm <= frame.heightMm  -> OK
renderedIntrinsicHeightMm >  frame.heightMm  -> TABLE_CONTENT_OVERFLOW / ERROR
```

`TABLE_CONTENT_OVERFLOW` bloqueia GREEN e PDF final. Nunca auto-grow no renderer. Um futuro comando explícito `Fit height to content`/`FitTableHeightToContent` pode gravar novo `frame.heightMm`; isso é USER COMMAND, não side effect de measurement.

`RowHeightPolicy` também é FOUNDATION REQUIRED — PROPOSED. `AUTO`: conteúdo define a altura derivada da linha. `MIN_MM`: altura derivada = `max(intrinsic, minMm)`. `FIXED_MM`: altura autoral exata. Se conteúdo exceder `FIXED_MM`, emitir `ROW_CONTENT_OVERFLOW / ERROR`. Não reduzir fonte, aumentar a linha, cortar silenciosamente nem alterar conteúdo. CSS `height` em `<tr>` sozinho não prova teto; a prova deve medir e detectar overflow real.

Arrastar lateral da tabela é user command que muda `frame.widthMm` e re-resolve colunas flex. Ajustar altura do frame também é user command. Measurement pode diagnosticar o efeito, mas não mover vizinhos, alterar o frame ou paginar.

Mesclas verticais: a altura do conteúdo da âncora precisa caber na soma das linhas cobertas. Primeiro calcular mínimos de células sem rowspan; depois processar restrições de spans em ordem estável (row inicial, col inicial), distribuindo déficit igualmente entre linhas AUTO/MIN_MM do span. Como apenas aumenta alturas derivadas, restrições satisfeitas permanecem satisfeitas. Se todas são FIXED_MM e falta espaço, `ROW_CONTENT_OVERFLOW`. Medições de texto/imagem são entrada do layout, não mutação das linhas ou frames persistidos.

Se o conteúdo intrínseco exceder o frame, objetos vizinhos permanecem no lugar e a prova falha com overflow. A UI futura pode oferecer ampliar/mover, reduzir padding/fonte por escolha explícita, ajustar colunas ou dividir após uma linha. Nunca esconder linhas, diminuir tudo silenciosamente, anexar folhas sem ação ou transformar measurement em autoria.

## Largura de colunas, solver puro — FOUNDATION REQUIRED, PROPOSED

```ts
resolveColumns(table, availableInnerWidthMm)
  => { ok: true, widths }
   | { ok: false, code, details }
```

Invariantes: cada width > 0; `minWidth` respeitado; fixed respeitado; flex distribui somente espaço restante; arredondamento determinístico; conservação da largura; zero DOM authority. Para o mesmo modelo e largura a saída é independente de viewport, zoom e renderer.

MVP persiste fixed ou flex com min/max. Não existe `auto` persistido que varie de significado entre browsers. “Ajustar ao conteúdo” é ação explícita que mede com fontes prontas, mostra preview e grava larguras fixed. Assim cobre a intenção de auto sem tornar a medição autoridade oculta do documento.

1. Validar largura disponível, min/max, pesos, fixed dentro dos limites; todos finitos e positivos.
2. Reservar fixed. Para flex, começar no minMm.
3. Se fixed + mínimos flex exceder disponível: `TABLE_WIDTH_INFEASIBLE`; não retornar sucesso com coluna zero.
4. Distribuir o residual entre flex proporcionalmente a weight; congelar as que atingirem max e repetir com as restantes.
5. Se todas atingirem max e sobrar largura, informar inviabilidade da largura exata. Não inserir espaço invisível na grade nem esticar fixed.
6. Se só há fixed, a soma deve fechar a largura interna. “Ajustar tabela às colunas” altera o frame explicitamente; “Ajustar colunas à largura” propõe novas larguras respeitando limites.
7. Cálculo em precisão plena; arredondamento determinístico somente na saída. O resíduo numérico é atribuído de modo estável a flex elegível sem violar limites, preservando a largura disponível dentro da precisão contratada.

Contraexemplo obrigatório: `available = 100 mm`, fixed A = 70, fixed B = 50, flex C min = 20. Resultado: ERROR (`TABLE_WIDTH_INFEASIBLE` ou código equivalente). É proibido retornar valid + warning ou `C = 0`.

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
- Última linha de corpo/última coluna: manter ao menos uma coluna e uma linha de corpo, ou remover a tabela explicitamente. Header vazio não é uma tabela comercial válida.

Essas regras alteram algumas operações existentes. Reutilizar testes de perda de dados, mas escrever testes novos para a política documentada; não afirmar que o legado já faz tudo isso.

## Estilos, cabeçalhos e annotations

Precedência por propriedade: base da tabela → papel da linha (header/section) → coluna → linha → célula → marca de run. Undefined herda; remover override restaura herança. Somente uma fonte por nível. Bordas compartilhadas: maior espessura vence, empate favorece célula à direita/abaixo; documentar direção e garantir mesma saída em print. Densidade é preset de tamanho/padding/line-height, não fator scale CSS.

Cabeçalhos agrupados são linhas header com spans, não grupos mantidos em estrutura paralela. `TableAnnotation` cobre `note`, `footnote` e `caption`; IDs são estáveis e cells/table podem referenciá-los. Annotation não é row, “fake row” nem célula sintética: não participa de row/column indexing e só entra na geometria pelo contrato tipado de annotations. Referência dangling é ERROR. A annotation participa da geometria intrínseca e deve aparecer na página do objeto tabela correto. Remover annotation referenciada é erro; remover a última referência não apaga annotation automaticamente. Legenda explica os marcadores; texto alternativo não deve depender de cor.

## Conteúdo técnico — FOUNDATION REQUIRED, PROPOSED

Conteúdo semântico nunca é alterado para caber. `technicalCode` possui política visual explícita. Para G05 usar `wrapPolicy = nowrap` com o valor adversarial `06.04.0121-00/IN1P/TA-50N-NH-PB-XXXXXXXXXXXX`. Se não couber, emitir diagnóstico bloqueante; é proibido inserir soft break no valor, reduzir fonte automaticamente, expandir frame/row escondidamente ou fazer clipping silencioso. Outras células podem futuramente permitir wrap visual sem alterar o valor semântico original.

`SplitTable(afterRowId, targetPageId, targetFrame)` cria duas tabelas independentes em uma transação. Não divide linha nem rowspan. Linhas de corpo movidas preservam IDs; headers copiados ganham IDs novos, com refs remapeadas; notas/legendas necessárias são copiadas e refs remapeadas na segunda tabela. Caption da segunda recebe indicação explícita de continuação. Não há vínculo de sincronização posterior implícito entre as duas.

## Provas mínimas

Roundtrip de schema; preservação de IDs e collision-safe cell key; merge/unmerge sem perda; `coveredBy` fail-closed; inserção interior ao span; rejeição de exclusão/reorder conflitante; coluna inviável sem zero; conservação de largura; bordas; `ROW_CONTENT_OVERFLOW`; `TABLE_CONTENT_OVERFLOW`; captions/notes/footnotes participando da geometria; imagem lenta/falha; decimal/código nowrap intacto; três tabelas independentes; Undo atômico; paridade screen/print. As referências e critérios estão no plano de execução.

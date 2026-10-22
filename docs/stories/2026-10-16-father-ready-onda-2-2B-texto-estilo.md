# Father-Ready — Onda 2 · 2B Texto com estilo (FR-14, FR-15)

**Status:** InReview (implementado na fatia; falta a integração da Onda 2)
**Branch:** `onda2/2B-texto-estilo` (base `33cd5df`)
**Plano:** `docs/plans/2026-10-15-plano-father-ready.md` §3 FR-14 e FR-15, §4 Onda 2

## Decisão de arquitetura (@architect, sem ADR novo)

- Uma ação mínima `text.setStyle { objectId, expectedStyle, patch }` em `application/contracts.ts` e `execute.ts`.
- `patch` aceita só `fontSizePt`, `fontWeight`, `color` e `textAlign` (campos do `TextStyleSchema`). Família e entrelinha ficam com o documento. Patch vazio é recusado.
- `expectedStyle` é o estilo de onde o comando saiu, como o `expectedText` do `text.setContent`: se a caixa mudou nesse meio tempo, `TARGET_STALE` e nada muda. A comparação é campo a campo (não depende da ordem das chaves).
- Na tela, `expectedStyle` é o estilo que o painel mostrava no clique (o patch foi escolhido a partir dele).
- Cor só da paleta do documento. Negrito só se a fonte 700 da família estiver declarada (sem ela o PDF não sai). Caixa bloqueada, agrupada ou que não é texto: recusada.
- Uma ação = um passo do histórico. A tela manda um `transactionId` novo por clique, então um Desfazer volta exatamente um clique ("Tipo" muda tamanho e peso juntos, num passo só).
- FR-15 não cria ação nova: é um `object.resize` (só a altura) sob um `transactionId`, preparado da última medição estável, como o `prepareTableFitHeight`.

## O que mudou para o pai

- Ao selecionar um texto, o painel lateral (modo simples) mostra o bloco **Básico**:
  - **Tipo:** Título 16 pt, Subtítulo 12 pt, Corpo 10 pt, Nota 8 pt (Título e Subtítulo em negrito);
  - **Negrito** (liga e desliga);
  - **Cor:** amostras da paleta do catálogo, com nomes simples (Azul-marinho, Azul, Preto, Branco; as outras "Cor N");
  - **Alinhamento:** Esquerda, Centro, Direita.
  - No modo completo o mesmo bloco se chama "Estilo do texto".
- Texto novo nasce como **Corpo** (10 pt, peso normal), não mais 16 pt negrito.
- **Ajustar altura ao texto** (FR-15):
  - botão no mesmo painel; quando o texto não cabe, aparece o aviso "O texto não cabe na caixa…";
  - correção de 1 clique para `TEXT_OBJECT_OVERFLOW` na lista de problemas (`issue-fixes.ts`);
  - a caixa cresce até a altura medida do texto, nunca além da margem de baixo da página (área segura). Se não cabe, o botão explica o que fazer (diminuir a letra, encurtar o texto ou subir a caixa);
  - palavra mais larga que a caixa: não oferece, explica;
  - medição antiga ou ainda em andamento: espera, com o motivo em português.

## Critérios de aceite

- [x] FR-14 · ação `text.setStyle` com checagem do estilo esperado (CAS) e Desfazer de um passo — `tests/vnext/application/text-style-actions.test.ts`
- [x] FR-14 · bloco "Básico" no `TextInspectorSection.tsx`, ligado ao editor real no modo simples — `tests/vnext/app/text-inspector-section.test.tsx` (VNextApp: Título pelo painel, Desfazer volta ao Corpo)
- [x] FR-14 · texto novo com 10 pt e peso 400 (`editor-defaults.ts`) — mesmo arquivo de teste
- [x] FR-15 · `src/vnext/editor/text-fit-height-authoring.ts` no padrão do `table-fit-height-authoring.ts` — `tests/vnext/editor/text-fit-height-authoring.test.ts`
- [x] FR-15 · botão no painel de texto + entrada `TEXT_OBJECT_OVERFLOW` em `issue-fixes.ts` — `tests/vnext/app/text-inspector-section.test.tsx`
- [ ] Navegador → PDF (FR-14) e "parágrafo longo → 1 clique → READY" (FR-15): não rodado na fatia (regra de recursos); fica com o integrador.

## Mudança fora da lista da fatia (aditiva)

- `src/vnext/rendering/measurement.ts`: o fato `object` de um texto passa a levar `intrinsicContentWidthQ`/`intrinsicContentHeightQ`, a mesma medida que gera `TEXT_OBJECT_OVERFLOW` no preflight. A assinatura do fluxo do texto (`textFlowSignature`) não muda (mesmos registros). Sem isso, a altura do texto só seria medida de novo pelo DOM. Teste: `tests/vnext/rendering/text-object-measurement.test.tsx`.

## Testes atualizados por causa da mudança

- `tests/vnext/app/editor-costura.test.tsx`: a seção de texto deixou de ser vazia.
- `tests/vnext/app/issues-panel.test.tsx`: o registro de correções tem a nova entrada.
- Nenhuma prova Playwright depende de texto novo com 16 pt/700 (procurado em `tests/vnext/proof/*.mjs`: as provas de texto usam só o conteúdo "Novo texto" ou textos de fixture).

## File List

- `src/vnext/application/contracts.ts`
- `src/vnext/application/execute.ts`
- `src/vnext/app/editor-defaults.ts`
- `src/vnext/app/editor/TextInspectorSection.tsx`
- `src/vnext/app/editor/TextInspectorSection.css` (novo)
- `src/vnext/app/editor/issue-fixes.ts`
- `src/vnext/editor/text-fit-height-authoring.ts` (novo)
- `src/vnext/editor/text-style-authoring.ts` (novo)
- `src/vnext/rendering/measurement.ts`
- `tests/vnext/application/text-style-actions.test.ts` (novo)
- `tests/vnext/app/text-inspector-section.test.tsx` (novo)
- `tests/vnext/editor/text-fit-height-authoring.test.ts` (novo)
- `tests/vnext/editor/text-style-authoring.test.ts` (novo)
- `tests/vnext/rendering/text-object-measurement.test.tsx` (novo)
- `tests/vnext/app/editor-costura.test.tsx`
- `tests/vnext/app/issues-panel.test.tsx`
- `docs/stories/2026-10-16-father-ready-onda-2-2B-texto-estilo.md` (esta story)

`EditorWorkspace.tsx`: não foi tocado (0 linhas).

## Change Log

- 2026-10-16 · @dev · FR-14 e FR-15 implementados na fatia 2B; decisão de `text.setStyle` registrada acima.

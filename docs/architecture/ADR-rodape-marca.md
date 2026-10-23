# ADR — Rodapé de controle e marca PRESYS (Onda 4, fatia 4E: FR-55, FR-82, S21)

**Data:** 22/10/2026 · **Estado:** aceita (decisão da fatia, no lugar da decisão pendente do @architect sobre `metadata`)

## Problema

O pai precisa de um rodapé de controle igual em todas as páginas: código do documento, revisão, data, idioma e "Página x de y".
Hoje cada catálogo tem rodapés digitados à mão em cada página (auditoria das capas, S21: ~100 ações para mudar a numeração de
um folder de 11 páginas). O plano (§4, Onda 1) deixou aberta a pergunta: criar um campo opcional `metadata` em
`CatalogDocumentSchema` para guardar código, revisão e idioma?

## Decisão

1. **Sem `metadata` no topo do documento.** Os dados do rodapé ficam em `style.pageFooter` (opcional):

   ```ts
   pageFooter?: { documentCode?: string /* ≤ 40 */, revision?: string /* ≤ 12 */, issuedOn?: 'aaaa-mm-dd', showOnFirstPage: boolean }
   ```

   - O **idioma** não é guardado: vem de `document.locale` (um catálogo traduzido mostra "EN" e "Page 2 of 11" sozinho).
   - O **número da página** não é guardado: é calculado ao desenhar ("Página 2 de 11"; a capa conta como página 1).
   - Código, revisão e data são digitados pela pessoa. A IA não preenche esses campos.

2. **O rodapé é uma propriedade do catálogo, desenhada pelo renderizador**, como o número de página de uma página-mestra.
   Ele não é um objeto da página, então não dá para clicar, mover ou apagar por engano. `PageRenderer` desenha em todas as
   telas (editor, miniaturas, revisão, PDF) com as mesmas funções puras de `domain/page-footer.ts`. Por isso tela e PDF
   são iguais. Uma prova de impressão confere isso.

3. **Um só lugar para editar:** a seção "Rodapé de todas as páginas", que aparece com a página quando nada está selecionado.
   Cada mudança é uma ação `document.setPageFooter`. A ação confere o rodapé esperado (TARGET_STALE se ele mudou antes) e
   vale um passo de Desfazer.

4. **Troca dos rodapés digitados (S21):** a seção encontra os textos que só têm número de página ("3", "3 / 11",
   "Página 3 de 11"…) perto do pé das páginas que mostram o rodapé. Mostra a lista antes (prévia). Depois liga o rodapé e
   apaga esses textos em **uma** transação, ou seja, um Desfazer. Textos bloqueados, ocultos ou dentro de grupo não são tocados.

## Por que não `metadata` no topo

- O banco recusa chaves novas no topo do documento: `vnext_validate_catalog_document` (migração 00024) aceita só
  `schemaVersion, id, title, locale, style, pages, assets, source`. Um campo novo pediria a migração 00035 e um deploy em
  ordem certa. Se o front chegasse antes da migração, todo salvamento com rodapé falharia em produção ("documento
  inválido"). `style` só é conferido como objeto, então `style.pageFooter` não precisa de migração nem de mudança no servidor.
- O rodapé é a "página-mestra" do catálogo inteiro, ou seja, a forma como toda página é impressa. Isso combina com `style`.
  Os dados que ele mostra (código, revisão, data) são do documento impresso e não de proveniência.
- O FR-68 (proveniência) ainda pode pedir um `metadata` próprio. Se pedir, a decisão é dele, com a sua migração. Esta ADR
  não fecha essa porta e não depende dela.
- Documentos antigos continuam válidos e são desenhados exatamente como antes, porque o campo é opcional e
  `schemaVersion` continua 1.

## Desenho do rodapé

- Uma linha de 5 mm, de 18 mm a 194 mm, com o topo em 280 mm. É a linha de rodapé dos arquétipos PRESYS
  (`PRESYS_PAGE_TOKENS.footerYMm`). Se a página pedir uma área segura maior, a linha entra para dentro e fica sempre dentro
  dela (no mínimo 10 mm).
- À esquerda: `<código> · Rev. <rev> · <data> · <IDIOMA>`, só com o que foi preenchido, e o idioma sempre. À direita:
  "Página x de y" no idioma do catálogo (pt/es "Página 2 de 11", en "Page 2 of 11", fr "Page 2 sur 11", it, de, pl; outros
  idiomas mostram "2 / 11"). As datas saem como dd/mm/aaaa (pt, es, fr, it), dd.mm.aaaa (de, pl) ou ISO (outros).
- Tipografia da marca: face regular da família padrão do catálogo, 7,5 pt (`PRESYS_TYPE_SCALE.note`), cor `#6D6E71`
  (`PRESYS_COLOR_TOKENS.muted`).
- Fica acima dos objetos e não recebe clique. Nos modelos PRESYS o endereço do site passou para o centro da mesma linha,
  então os três não se encostam.
- A capa não mostra o rodapé por padrão ("Mostrar também na capa" liga), mas conta como página 1.
- O nome do PDF passa a ser `<código>-<rev>_<IDIOMA>.pdf` (ex.: `MAN-PCON-XV-03_PT.pdf`) quando há código. Sem código,
  continua sendo o título.

## Verificação (preflight)

- `PAGE_FOOTER_OVERLAP` (bloqueia): as letras de um texto ou tabela visível encostam nas letras do rodapé. Compara caixas
  de letras impressas, como `PRINTABLE_CONTENT_OVERLAP`, e aponta o objeto, para "Corrigir este item" levar até ele.
- `PAGE_FOOTER_INCOMPLETE` (só revisar): o rodapé está ligado, mas falta código, revisão ou data.
- O rodapé nunca precisa da verificação de borda, porque sua caixa é calculada dentro da área segura.
- "Continuar na próxima página" (tabelas) agora para 1 mm acima do rodapé nas páginas que o mostram.

## Marca e fontes (FR-82)

- `rendering/resources.ts` tem a lista fechada das faces embutidas (`BUNDLED_FONT_FACES`): Noto Sans 5.3.0 400/700,
  normal/itálico, e Noto Sans JP 400. Todas vêm do @fontsource fixado, com licença SIL OFL 1.1, importadas por
  `rendering/styles.css`. Um documento que peça outra face é bloqueado antes de imprimir, e não sai com uma fonte trocada.
- `loadFonts` carrega também os glifos das palavras calculadas do rodapé ("Página", data). Antes só carregava o JSON do
  documento. A verificação de fontes (`verifyFontManifest`) cobre o rodapé, porque cada parte é um `data-flow-root` com a
  face declarada.
- A prova `tests/vnext/proof/fr55-page-footer-print-proof.mjs` confere no PDF de 3 páginas: "Página n de 3" em todas, tudo
  dentro da área segura, a mesma posição da tela, e só `NotoSans` embutida (`missingFile=false`).
- Os modelos PRESYS (Ficha técnica e Folder, revisão 2) já nascem com o rodapé ligado, fora da capa, com os tokens de cor e
  tipo do blueprint.

## Pendências (fora desta fatia)

- **Fonte condensada da marca:** não há face condensada OFL instalada no projeto. Instalar uma (ex.: Noto Sans com eixo de
  largura, ou Barlow Condensed) pede um pacote novo e uma aprovação de licença. Quando for aprovada: importar os arquivos em
  `rendering/styles.css`, acrescentar as linhas em `BUNDLED_FONT_FACES` e usar a família nos tokens dos arquétipos.
- **Logotipo oficial:** os modelos mantêm o espaço "A COMPLETAR" do logo. Não há arquivo oficial no repositório, e a
  biblioteca de logotipos (S17) é outra frente.
- **Rascunho da IA (4A):** `ai-catalog/draft-compiler.ts` calcula a altura útil só pela área segura. Quando o documento
  base tiver `style.pageFooter`, ele deve usar `pageFooterReserveBottomMm` (domain) para não pôr tabela debaixo do rodapé.
  Até lá, o preflight bloqueia a sobreposição e mostra o objeto.
- **PDF do servidor (FR-53):** ainda não existe. Quando existir, deve gravar código, revisão e idioma nos metadados do PDF,
  a partir do mesmo `style.pageFooter`.

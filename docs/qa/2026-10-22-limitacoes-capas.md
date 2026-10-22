# Limitações na edição de capas complexas (Onda 3.5, passo 1 — medição)

Data: 2026-10-22 · Branch: `onda35/audit-capas` · Só medição: nenhum código de produto foi alterado.

Pergunta: o que torna difícil, para uma pessoa de 60 anos sem formação técnica, editar capas complexas como as dos
catálogos feitos por outra IA em `D:/catalogos-exemplo/pcon-family-2026-10-22/` (6 catálogos PCON)?

## 1. Resumo

1. As 6 capas são **imagem de fundo (PNG de página inteira) + foto + 26 a 41 textos** soltos por cima. Em 5 das 6 há ainda
   um **segundo PNG de página inteira por cima da foto** (linhas de chamada). Fundo diagonal, texturas, pílulas, barra da
   família, setas, sombras, faixas e gráficos de faixa **não existem como objetos**: estão dentro dos PNGs.
2. O editor não deixa o usuário nem **alcançar** esses PNGs: o de cima captura todo clique, e **o objeto selecionado vira a
   camada mais alta** (hit-target com `z-index = MAX_SAFE_INTEGER`), então depois de pegar o PNG de cima não se consegue mais
   clicar em texto algum. `Esc`, clicar fora ou clicar na margem não soltam; só `Ctrl+clique` no mesmo objeto ou trocar de página.
3. Mesmo o que existe como objeto nativo é pobre: **Forma e Linha não têm painel de estilo** (nascem `#edf5ff`/borda
   `#003f78` e `#003366` e ficam assim), não há rotação, opacidade, raio de canto, degradê, padrão, polígono, linha com
   espessura, nem cor de fundo da página. Texto: 4 tamanhos fixos e 7 cores (a paleta do catálogo; as cores da capa não estão nela).
4. Das 21 edições típicas testadas (S01–S21) só **4 são fáceis** (selecionar texto sobre imagem, redimensionar caixa grande, alinhar depois de
   selecionar, editar o texto de uma pílula) — e uma delas (a pílula) **quebra o desenho**.

## 2. Como foi medido

- **Harness** (reutilizável, sem login/Supabase/rede): `tests/vnext/proof/fixtures/cover-audit-browser.{html,tsx}` monta o
  `VNextApp` real em **modo simples** (`simpleByDefault`, como a produção) com um `*.catalog.json` + pasta `assets/` locais
  (`?catalog=PCON-HIBRIDO&dir=/scratch/cover-audit`). O Vite só serve o repositório, por isso o catálogo é copiado para `scratch/cover-audit/`.
- **Medição**: `node tests/vnext/proof/fixtures/cover-audit-measure.mjs` (Chromium headless, Playwright, **1366×768**). Toda
  edição é feita **só pelo que está visível na tela** (clique, arraste, duplo clique, teclas, envio de arquivo). Cada cenário
  reinicia a página, executa, mede o documento antes/depois (`window.__COVER_AUDIT__.state()`), tira captura, aperta
  **Desfazer** até o fim e confere se o documento voltou idêntico.
- **"Ações"** = cliques, arrastos, teclas/digitação, rolagens e envios de arquivo (rolar até o ponto conta 1).
- **Fácil** = até ~3 ações e rota óbvia. **Difícil** = possível, mas com rota de contorno, ≥ 6 ações ou resultado visual quebrado.
  **Impossível** = não há rota pela interface (ou o resultado não é o pedido).
- Resultados brutos: `scratch/cover-audit/results.json`; capturas: `scratch/cover-audit/shots/*.png`
  (pasta ignorada pelo git; rodar o script a recria).
- Limites: um só navegador/tamanho; pontos de clique escolhidos pelo script (25% da largura do texto, para não cair nas alças);
  o número de ações é uma medida de ordem de grandeza, não de tempo de uma pessoa real.

## 3. Inventário das capas (página 1) e de duas páginas internas

| Catálogo | Objetos | Imagens (PNG tela cheia + foto) | Textos | Formas | Tabela | Z distintos | Estilos de texto distintos | Cores de texto fora da paleta | Objetos sob outro |
|---|---|---|---|---|---|---|---|---|---|
| PCON-HIBRIDO | 32 | 3 (plate, foto, overlay) | 29 | 0 | 0 | 4 | 14 | 2 de 7 | 2 |
| PCON-DT | 44 | 3 (plate, foto, overlay) | 41 | 0 | 0 | 4 | 16 | 1 de 6 | 2 |
| PCON-KOMPRESSOR-Y18 | 34 | 2 (plate, foto) | 32 | 0 | 0 | 3 | 14 | 3 de 7 | 0 |
| PCON-Y17 | 42 | 3 (plate, foto, overlay) | 38 | 0 | 1 | 4 | 15 | 5 de 6 | 2 |
| PCON-Y18-BP | 29 | 3 (plate, foto, overlay) | 26 | 0 | 0 | 4 | 14 | 0 de 5 | 2 |
| PCON-Y18-LP | 37 | 3 (plate, foto, overlay) | 34 | 0 | 0 | 4 | 16 | 4 de 9 | 2 |

- **Empilhamento da capa**: `z=0` plate (210×297 mm) → `z=1` foto → `z=2` overlay (210×297 mm) → `z=3` **todos os textos com o mesmo z**.
  Nenhum grupo, nenhum objeto travado, nenhuma rotação (o modelo não tem rotação).
- **Todo texto está sobre imagem** (26–41 por capa). "Sob outro objeto" = a foto e o plate ficam sob o overlay.
- 14–16 estilos de texto distintos por capa (tamanhos como 6,4 / 6,6 / 7,2 / 19 pt), mas o painel só oferece 16/12/10/8 pt.
- **Páginas internas** (HIBRIDO p.2: 18 objetos = 2 imagens de faixa, 10 textos, 5 formas, 1 tabela; DT p.2: 13 = 3 formas,
  7 textos, 2 imagens, 1 tabela): cabeçalho, régua, rodapé e número de página são objetos soltos **repetidos em cada
  página** (sem página-mestra). Nos 6 catálogos há **275 formas** (todas retângulos de uma cor, sem contorno) e **99 páginas
  com faixa de cabeçalho em PNG**.

### O que está "assado" em PNG (confirmado em `cover-lab/*.html` e em `manifest.json`)

| Catálogo | Plate (fundo) | Overlay | Faixa de cabeçalho (páginas internas) |
|---|---|---|---|
| HIBRIDO | divisão diagonal azul/dourado, padrão de pontos, padrão de ondas, linha branca de divisão, sombra de contato, **6 pílulas** (2 azuis + 4 douradas), **barra da família (6 caixas + destaque dourado + triângulo)**, régua | 2 linhas de chamada + 5 pontos | 2 faixas (pontos / onda) |
| DT | degradê, faixa de cabeçalho, **laje em perspectiva** da bancada, sombra, caixa "pílula", **anatomia do código de pedido** (caixas + colchetes), tiles, barra da família (no plate inteiro: 28 retângulos, 11 paths, 1 elipse) | 2 linhas + 4 pontos | faixa com degradê |
| KOMPRESSOR-Y18 | degradê linear + 2 radiais, **trilho lateral**, **anel de marcas + arco**, aba da marca, sombra, **escada de faixas logarítmicas**, pilha de números, barra da família (no plate inteiro: 29 retângulos, 7 círculos, 3 paths) | — (sem overlay) | faixa com degradê |
| Y17 | **grade de projeto (blueprint)**, coluna lateral, **marcas de corte**, **sumário numerado**, bloco de título, tiles, barra da família | 3 linhas + 6 pontos | faixa |
| Y18-BP | **isóbaras (elipses concêntricas)**, régua dupla, **eixo de faixa de pressão**, tiles, barra da família (no plate inteiro: 43 retângulos, 16 paths) | 3 linhas + 6 pontos | faixa |
| Y18-LP | **campo dividido**, **"±" gigante (marca d'água de texto)**, **gráfico de faixas em borboleta**, barra da família | 3 linhas + 6 pontos | faixa (28 retângulos) |

Total de primitivas vetoriais assadas por capa (plate + overlay): HIBRIDO ~31, DT ~46, KOMPRESSOR ~40, Y17 ~37, BP ~69, LP ~36.

## 4. O que o editor oferece hoje (lido do código e confirmado na tela)

- **Modelo** (`src/vnext/domain/editorial-model.ts`): `text`, `image`, `table`, `shape` (`rectangle|ellipse`, `fill` + `stroke` sólido),
  `line` (só `horizontal|vertical`, só `color`), `icon`, `group`. Página fixa 210×297 mm, **sem campo de fundo**.
- **Comandos** (`application/contracts.ts`): mover, redimensionar, reordenar, travar, duplicar, excluir, alinhar, distribuir,
  agrupar, desagrupar, trocar imagem, estilo de texto… **Não existe** comando de estilo de forma/linha, rotação, opacidade,
  fundo de página.
- **Texto** (painel simples): 4 tipos (16/12/10/8 pt), negrito, 7 cores da paleta do catálogo, 3 alinhamentos. X/Y/L/A só em "Mais propriedades".
- **Seleção** (`EditorWorkspace.tsx`): clique; `Ctrl+clique` ou "Selecionar vários" (em "Mais opções"); **sem laço**, sem Alt+clique,
  sem painel de camadas, sem teclas para ciclar objetos. Agrupar, ordem das camadas, forma, linha: tudo atrás de "Mais opções".

## 5. Edições testadas

Todas sobre PCON-HIBRIDO (capa e página 2), exceto S22. Desfazer restaurou o documento **idêntico** em todas as edições
que o alteraram (de 1 a 6 cliques; S17 = 6, S02 = 3, S14 = 3, S09 = 2).

| # | Edição | Resultado | Ações | Causa | Evidência |
|---|---|---|---|---|---|
| S01 | Mudar a cor do fundo diagonal | **Impossível** | 6 | elemento inexistente + camadas | 1º clique pega o overlay. Só "Enviar ao fundo" + `Ctrl+clique` + novo clique chega ao plate, que é uma **imagem**: painel só tem Ajuste/Posição/Imagem do catálogo/Enviar nova imagem, nenhuma cor. O overlay fica sob o plate e some. `shots/S01-fundo.png` |
| S02 | Trocar a foto da capa | **Difícil** | 11 | seleção/camadas (+ chamadas assadas) | Clicar na foto pega o overlay. Rota: abrir "Mais opções" → Recuar camada → `Ctrl+clique` (soltar) → clicar na foto → Enviar nova imagem → selecionar o overlay fora da foto → Avançar camada. A foto nova não casa com as linhas de chamada (`shots/S02-foto.png`: pontos brancos apontam para o lugar da foto antiga). |
| S03 | Mover uma pílula ("0 a 250 psi") | **Impossível** (como unidade) | 5 | elemento inexistente + seleção | Arrastar o texto direto move só o texto; o fundo azul da pílula (PNG) fica e o texto branco cai na página branca. Se o texto já estava selecionado, arrastar pelo meio **redimensiona** (altura 4,11 → 1,41 mm): 8 alças de 24 px cobrem a caixa de 62×15 px. Clicar e arrastar logo em seguida (< 0,5 s) não move: o código trata como duplo clique e abre a edição de texto. `S03-pilula-*.png` |
| S04 | Editar o texto da pílula ("0 a 25000 psi") | **Fácil** (texto) / **quebra o desenho** | 5 | elemento inexistente | Edição ok, mas a caixa segue com 16,85 mm e a pílula (PNG) não cresce: o texto vaza/quebra. `S04-pilula-texto.png` |
| S05 | Mudar rótulo da chamada e mover a seta | **Impossível** (seta) | 6 | elemento inexistente | Rótulo (texto) edita bem. Clicar sobre a seta seleciona o **overlay inteiro**; arrastar moveria todas as chamadas juntas. |
| S06 | Selecionar texto que está sobre imagem | **Fácil** | 1 | — | Texto é o topo da pilha. |
| S07 | Selecionar o objeto de baixo sem reordenar | **Impossível** | 6 | camadas | Alt+clique, Shift+clique, clique direito, duplo clique, `Tab`, `Esc`: sempre o overlay. Não existe painel "Camadas". |
| S08 | Selecionar 3 elementos e mover juntos | **Impossível** | 4 | seleção | `Ctrl+clique` seleciona 3, mas arrastar um **descarta os outros** e só ele anda (deslocamentos 0, 0, 20 mm; seleção cai para 1). Com vários selecionados o painel só mostra Alinhar/Distribuir. |
| S09 | Agrupar / desagrupar | **Difícil** | 11 | camadas + UI escondida | Agrupar exige objetos **contíguos na pilha** (`execute.ts`: "must form one contiguous visual block"). PNEUMÁTICA + legenda (1 objeto entre eles) falha com "Não foi possível agrupar os objetos." sem dizer o motivo. PRESYS + DOIS MEIOS (vizinhos) funciona. |
| S10 | Alinhar à esquerda / centralizar | **Fácil** (depois de selecionar) | 6 | seleção (os 3 `Ctrl+clique`) | Alinha bem (x = 14, 14, 14; centros 105 mm), mas o trabalho está em selecionar os 3 com `Ctrl+clique`. |
| S11 | Mudar a ordem (camada) de um texto | **Difícil** | 4 | camadas | "Enviar ao fundo" põe o texto **atrás do plate: ele desaparece** (z 3 → 0). Os 29 textos têm o mesmo z=3. `S11-enviar-ao-fundo.png` |
| S12 | Duplicar um bloco (título + legenda) | **Impossível** | 4 | seleção/camadas | Com 2 selecionados o botão Duplicar **some**; o caminho Agrupar + Duplicar falha por não serem vizinhos. |
| S13 | Redimensionar caixa de texto | **Fácil** (caixa grande) | 3 | — | Largura 182 → 146 mm; altura não acompanha (existe "Ajustar altura ao texto"). Em caixas pequenas ver S03. |
| S14 | Mudar cor, tamanho e peso | **Difícil** (parcial) | 4 | propriedade faltante | Peso: fácil. Cor: 7 amostras da paleta, sem seletor/hex; o dourado `#F3DDB8` da capa não está nelas. Tamanho: só 16/12/10/8 pt, sem campo numérico (original 7,2 pt → 8 pt). |
| S15 | Travar o fundo | **Impossível** (não ajuda) | 6 | camadas | Overlay travado continua capturando o clique na foto ("Objeto bloqueado. Desbloqueie…"). |
| S16 | Editar a barra da família | **Impossível** | 5 | elemento inexistente | Os 6 textos editam; o retângulo dourado + triângulo do modelo atual (HÍBRIDO) é PNG: não dá para destacar outro modelo nem reordenar. |
| S17 | Trocar o logotipo (hoje é o texto "PRESYS") | **Difícil** | 10 | muitos passos / camadas | Imagem → arquivo → imagem entra em posição padrão (20, 52 mm, 58 mm) → digitar X/Y/L/A → o 1º clique no "PRESYS" pegou a imagem nova por cima → apagar. Não há biblioteca de logotipos; o arquivo tem de existir no computador. |
| S18 | Mudar a cor de fundo da página | **Impossível** | 4 | propriedade faltante | Clicar no fundo vazio pega o overlay. Não há cor de fundo de página. "Forma" nasce `#edf5ff` com borda `#003f78` 1 pt e **nenhum painel muda cor/contorno**. |
| S19 | Soltar a seleção do overlay | **Difícil** | 11 | seleção | `Esc`, clicar na margem cinza, clicar no texto: continua no overlay. Funcionam: `Ctrl+clique` no mesmo objeto e trocar de página e voltar. |
| S20 | Página 2: cor da faixa, da régua, do painel | **Impossível** | 5 | elemento inexistente / propriedade faltante | Faixa = imagem; régua (0,8 mm) e painel = Forma, selecionáveis mas **sem controle de cor**. |
| S21 | Mudar rodapé/numeração em todas as páginas | **Difícil** | ~100 | elemento inexistente (sem página-mestra) | 10 rodapés + 10 "n / 11" digitados = 20 edições ≈ 100 ações; 99 faixas PNG repetidas nos 6 catálogos. |
| S22 | Clicar na foto e no fundo vazio de cada capa | **Foto inalcançável em 5/6** | 1–2 | camadas | DT, HIBRIDO, Y17, BP, LP: clique na foto e no fundo vazio selecionam o overlay. Só KOMPRESSOR-Y18 (sem overlay) deixa clicar na foto (o fundo vazio pega o plate). `S22-*.png` |
| S23 | Área útil da página (1366×768) | **Difícil** | 2 | UI escondida/espaço | Barra fechada: 52% da altura da página visível; com "Mais opções" e um objeto selecionado: **32%** (354 px de 1100). Avisos ("Ordem do objeto atualizada.") deslocam e cobrem a página. |

## 6. Principais bloqueios (ordenados por impacto)

1. **PNG de tela cheia por cima captura tudo** (5/6 capas): foto, fundo e setas inalcançáveis; sem Alt+clique, camadas ou "clicar através".
2. **Selecionado = camada mais alta** (`zIndex: Number.MAX_SAFE_INTEGER` no hit-target, `EditorWorkspace.tsx`): ao pegar o overlay não dá mais para clicar em nenhum texto; `Esc` e a margem não soltam.
3. **Arte assada em PNG** (6/6): diagonal, padrões, pílulas, barra da família, chamadas, sombras, faixas: sem seleção, sem propriedade, sem como mover junto com o texto que está sobre elas.
4. **Forma/Linha sem estilo** e sem recursos básicos: sem painel de cor/contorno (275 formas nos catálogos), sem raio de canto, opacidade, rotação, degradê, padrão, polígono, espessura de linha, fundo de página.
5. **Seleção múltipla só pela metade**: sem laço; arrastar um item descarta os demais; Duplicar some; Agrupar exige vizinhos na pilha e erra sem explicar.
6. **Texto com tamanhos e cores fixos** (4 tamanhos, 7 cores da paleta): a capa usa 14–16 estilos, até 5 de 6 cores fora da paleta (Y17).
7. **Camadas sem painel e com z repetido** (29 textos em z=3): "Enviar ao fundo" faz o objeto sumir sob o plate.
8. **UI escondida e pequena demais**: ferramentas em "Mais opções" consomem 68% da altura em 1366×768; X/Y/L/A em "Mais propriedades"; alças de 24 px cobrem caixas de 15 px (pílulas), arrastar vira redimensionar; avisos deslocam o layout.

## 7. O que construir (priorizado)

### P0 — Destravar a seleção (sem isso nenhuma capa atual é editável)

| Item | Desbloqueia (edições / capas) |
|---|---|
| **P0.1** Hit-target do selecionado **não** sobe ao topo; alças em camada própria acima de tudo | S19, S01, S02, S15; as 5 capas com overlay |
| **P0.2** Conceito de **"Fundo da página"**: objeto de ≥ 90% da página (ou marcado) é fundo, **não captura clique** por padrão; botão "Selecionar fundo" | S01, S02, S05, S18, S22; DT, HIB, Y17, BP, LP |
| **P0.3** **Painel de Camadas** (lista com nome/tipo/miniatura, olho, cadeado, arrastar para reordenar, clicar para selecionar) | S01, S02, S07, S11, S15, S22; todas as 6 capas |
| **P0.4** Clique repetido / Alt+clique **cicla pelos objetos sob o ponteiro**; "Enviar ao fundo" nunca esconde atrás de fundo (limita ao teto do fundo) | S07, S11 |
| **P0.5** Seleção múltipla: **laço**, Shift+clique, **arrastar move todos**, **Duplicar vários**, Agrupar sem exigir vizinhança (reordena sozinho) e com mensagem de motivo | S08, S09, S10, S12 |
| **P0.6** Alças fora da caixa/proporcionais: em caixa pequena o corpo sempre move; alças só nos cantos | S03, S13 |

### P1 — Propriedades que faltam (barato, desbloqueia o que já existe)

| Item | Desbloqueia |
|---|---|
| **P1.1** Painel de **Forma e Linha**: preenchimento, contorno (cor/espessura), opacidade, raio de canto, espessura/cor/ângulo da linha | S18, S20; 275 formas dos 6 catálogos; régua dupla (BP), marcas de corte (Y17) |
| **P1.2** **Cor de fundo da página** (e "imagem de fundo" tratando o PNG do plate) | S18; todas as capas |
| **P1.3** Texto: **tamanho numérico**, **cor livre** (seletor/hex + cores recentes + "adicionar à paleta"), opacidade (marca d'água "±" do LP), itálico/sublinhado | S14; 14–16 estilos por capa; 1–5 cores fora da paleta por capa |
| **P1.4** Barra de ferramentas compacta/recolhível; X/Y/L/A visíveis; avisos como faixa que não desloca a página | S23 |

### P2 — Elementos nativos novos (o que substitui os PNGs)

| Elemento | Substitui (em quais catálogos) |
|---|---|
| **E1 Polígono** (n vértices, preenchimento sólido/degradê/padrão, opacidade) | divisão diagonal azul/dourado (HIBRIDO), campo dividido (LP), laje em perspectiva (DT), trilho/aba (KOMPRESSOR), coluna lateral (Y17) |
| **E2 Pílula/selo**: retângulo com raio + **texto dentro**, largura automática | 6 pílulas (HIBRIDO), pill-chip (DT), tiles de números-chave (KOMPRESSOR, BP, Y17, DT), **barra da família: 6 caixas × 6 capas = 36** |
| **E3 Chamada (callout)**: linha/polilinha + ponto de ancoragem + rótulo, **move como unidade** e prende na foto | 13 linhas e 27 pontos no overlay das 5 capas |
| **E4 Preenchimento por padrão** (pontos, ondas, grade, textura/imagem repetida) | pontos e ondas (HIBRIDO), grade de projeto (Y17) |
| **E5 Degradê linear/radial e sombra suave** (elipse radial como propriedade da foto/forma) | degradês e sombra de contato nas 6 capas |
| **E6 Elipse/arco sem preenchimento** com contorno, marcas de ângulo | isóbaras (BP), anel e arco (KOMPRESSOR) |
| **E7 Linha com espessura, tracejado e ângulo livre** | régua dupla (BP), marcas de corte (Y17), colchetes do código de pedido (DT) |
| **E8 Gráfico de faixas simples** (barras com rótulo) ou, no mínimo, retângulos estilizáveis (P1.1) + texto | escada logarítmica (KOMPRESSOR), eixo de faixa (BP), gráfico borboleta (LP) |

### P3 — Estrutura

- **Página-mestra** (cabeçalho, faixa, rodapé, número de página automático): S21 (~100 ações → 1) e as 99 faixas PNG.
- **Capa em "modelo com espaços"** (título, foto, chamadas, pílulas, barra da família) para trocar sem mexer em camadas.
- **Biblioteca de logotipos/imagens da empresa** (S17).
- Enquanto E1–E3 não existem, uma **tabela de 1 linha** serve para a barra da família e pílulas retangulares (a tabela já tem fundo por célula e bordas), mas sem cantos arredondados.

## 8. Artes PNG que podem virar elementos nativos

| Arte atual | Vira | Observação |
|---|---|---|
| plate HIBRIDO (diagonal, pontos, ondas, 6 pílulas, barra, régua) | 2 polígonos + 2 padrões + 6 pílulas + 6 caixas + 1 triângulo + régua + sombra | substituiria 1 PNG de 2481×3509 por ~25 objetos editáveis |
| overlay (chamadas) de HIBRIDO, DT, Y17, BP, LP | 13 chamadas (linha + ponto + rótulo ligado) | rótulos já são texto; falta o conector |
| barra da família (6 catálogos) | 6 pílulas por capa, 1 destacada | a mais repetida: 36 caixas |
| faixa de cabeçalho (99 páginas internas) | retângulo/polígono com degradê ou padrão + página-mestra | elimina 99 PNGs repetidos |
| plate DT (laje em perspectiva, tiles, código de pedido) | polígono (trapézio) + retângulos com texto + colchetes | |
| plate Y17 (grade, coluna, marcas de corte, sumário) | padrão de grade + retângulo + 8 linhas + 7 pílulas numeradas | |
| plate BP (isóbaras, eixo de faixa, régua dupla) | elipses concêntricas + retângulos + linhas | |
| plate LP ("±" gigante, campo dividido, borboleta) | texto com opacidade + polígono + retângulos | |
| plate KOMPRESSOR (anel/arco, escada log, trilho) | arco + retângulos + retângulo lateral | |
| Podem **continuar PNG** | fotografias do produto; textura realista (se houver); sombra de contato complexa (até existir E5) | |

## 9. Observações

- O objeto de maior risco para a pessoa é **qualquer imagem de tela cheia**: ela é o objeto mais fácil de pegar por engano e o mais difícil de soltar; um arrasto de 1–2 cm moveria todas as chamadas juntas.
- A criação de catálogos por outra IA (ou por modelos de página) tende a repetir esse desenho (fundo + foto + overlay + textos soltos). **Sem P0, qualquer capa gerada assim nasce não editável** — mesmo antes de existirem os elementos nativos.
- Para reproduzir: `node tests/vnext/proof/fixtures/cover-audit-measure.mjs` (variável `COVER_AUDIT_SRC` aponta para a pasta com `*.catalog.json` e `assets/`).

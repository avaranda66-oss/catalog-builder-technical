# Evidência e Relatório de UX — VNext Editor UX Lab

STATUS: **PROTÓTIPO EXPERIMENTAL DE INTERAÇÃO (LAB)**
DESTINATÁRIO: Principal & Equipes VNext W1 / W2
DATA: 2026-09-09
PERSONA PRIMÁRIA: Pai do usuário (Profissional técnico não-programador)

---

## 1. Proveniência e Contexto de Execução

- **Repositório**: `avaranda66-oss/catalog-builder-technical`
- **Branch**: `lab/vnext-editor-ux-astra`
- **Worktree**: `C:/Users/Usuario/Desktop/CONFIGURATOR PCON/catalog-builder-vnext-editor-ux-astra`
- **Ponto de partida herdado (Astra remote HEAD)**: `d67cc3c06f8c7ccb26c327e89cbcd6a3c17fbbac`
- **Recuperação local pós-Astra**: 2 arquivos não-comitados (`Editor.tsx`, `editor.css`) identificados, preservados via patch em scratch e comitados como `c30566f`.
- **Checkpoint 1 (Tabela & Seletores)**: `a36bc53` (`lab(ux): refine table authoring interaction workflow`)
- **Limites respeitados**: Nenhuma alteração em código de produção, W0, Supabase, schemas canônicos ou dependências de pacote.

---

## 2. Resolução dos Problemas Conhecidos da Astra

### Problema 1: Seletores de coluna sobrepondo / competindo com Cabeçalho Agrupado
- **Causa Raiz Identificada**: No protótipo inicial, `.column-selectors` tinha `margin-top: -23px` em fluxo normal e ficava acima do `<table>`, mas abaixo de `table-group`/`table-title`. Isso fazia o bloco de botões de coluna invadir diretamente o cabeçalho agrupado (`CONDIÇÕES DE OPERAÇÃO`). Na tentativa posterior de usar `position: absolute; top: -23px`, os seletores saltavam para o topo do quadro todo (acima do título), ficando a mais de 100px de distância das colunas reais e desalinhados dos seletores de linha.
- **Correção Implementada**: 
  1. Inserção dos seletores de coluna diretamente sobre o grid da tabela em fluxo hierárquico limpo (`Título -> Cabeçalho Agrupado -> Seletores A, B, C -> Grid -> Notas`).
  2. Alinhamento 1:1 de largura de cada seletor (`width: w%`) e alças de redimensionamento (`.column-resizer`) exatamente nas divisórias de coluna.
  3. Deslocamento do handle de arraste do objeto para `left: -26px; top: -24px`, eliminando qualquer colisão com a coluna A.
- **Resultado Visual**: Validado no browser (`verify-issue1-grouped-header-selectors.png` e `03-table-selected.png`). O cabeçalho agrupado mantém respiro e elegância, e as colunas A, B, C indicam diretamente seus campos subordinados.

### Problema 2: Conteúdo da tabela vazando visivelmente fora do quadro de autoria
- **Causa Raiz Identificada**: O container `.table-frame` usava `overflow: visible` para permitir que botões de linha (`left: -22px`) e seletores ficassem visíveis. Consequentemente, ao adicionar linhas, as células excedentes pintavam descontroladamente sobre outros objetos e rodapé da página.
- **Correção Implementada**:
  1. Separação explícita entre **Content Viewport** e **Interaction Chrome**:
     - `.table-content-viewport` com `overflow-y: clip; overflow-x: visible;`. O corte vertical no limite `h` impede matematicamente qualquer vazamento de conteúdo catalográfico.
     - As alças de linha e coluna permanecem visíveis horizontalmente e contextualizadas.
  2. **Banner de Feedback de Transbordamento**: Quando a altura do conteúdo excede a altura autoral `h`, um banner sutil surge no limite inferior com a mensagem `"Conteúdo excede a altura do quadro"` e um botão direto de ação: `[ Ajustar altura ]`.
  3. **Auto-fit 1-clique**: Ao clicar em "Ajustar altura", a altura `h` da tabela é recalculada para acomodar perfeitamente todas as linhas sem exigir adivinhação do usuário.
- **Resultado Visual**: Validado no browser (`verify-issue2-table-overflow-fixed.png` e `verify-table-autofit-height.png`).

---

## 3. Experimento de Margens de Segurança (A / B / C)

Três abordagens foram implementadas, testadas com arraste real e capturadas:
1. **Opção A (Sempre visível · `margin-a-always.png`)**:
   - *Comportamento*: Linha tracejada em azul sutil visível continuamente no A4 a 36px das bordas.
   - *Avaliação*: Garante que o usuário sempre sabe onde fica o limite seguro, mas em páginas com imagens de fundo sangradas ou cabeçalhos institucionais gera ruído constante de "modo rascunho".
2. **Opção B (Contextual · `margin-b-context.png`)**:
   - *Comportamento*: 100% invisível em repouso. Só aparece quando um objeto é selecionado ou movido.
   - *Avaliação*: Reduz o ruído a zero em leitura, porém para o perfil do pai (não-técnico), a falta de qualquer dica em repouso diminui a confiança na diagramação inicial.
3. **Opção C (Híbrida · `margin-c-hybrid.png`)**:
   - *Comportamento*: Linha fantasma quase imperceptível (~15% opacidade) em repouso. Ao selecionar ou mover um objeto, acende com destaque ciano intenso e guias magnéticas de alinhamento.
   - **Recomendação Firme**: **Opção C (Híbrida)**. Equilibra a limpeza visual necessária para apreciar o catálogo com a proteção pedagógica contínua para um usuário não-técnico.

---

## 4. Avaliação dos Fluxos de Trabalho (Workflows)

### Fluxo de Tabelas (Missão 1)
- **Barra Contextual Rápida vs Inspector**:
  - *Contextual*: Ações estruturais frequentes (`+ Linha`, `+ Coluna`, `Mesclar`, `Separar`, `Cor da Célula`, `Bordas`, `Alinhamento`) ficam a 1 clique na barra acima da página.
  - *Inspector Profundo*: Propriedades editoriais e dimensionais (`Título`, `Cabeçalho Agrupado`, `Seção`, `Notas`, `Padding`, `Tamanho de Fonte`).
  - *Feedback de Seleção*: Tradução humana imediata (ex.: `Linha 3 selecionada`, `Coluna B selecionada`, `Célula B4`, `4 células selecionadas (A1–B2)`). Nunca expor coordenadas brutas (como `4:2–4:2`).
- **Mesclagem**: Botão "Mesclar" só é habilitado para intervalos >= 2 células. "Separar" reverte a mesclagem.

### Fluxo de Textos (Missão 3)
- Duplo clique ativa `contentEditable` com foco imediato in-situ.
- A barra rápida oferece controles diretos de formatação (`B`, `I`, `A-`, `A+`, `Cor`, `Alinhamento`), reduzindo viagens desnecessárias ao Inspector para formatações triviais.

### Fluxo de Imagens (Missão 4)
- Botão direto "Substituir imagem" na barra rápida e no Inspector com alta visibilidade.
- Controles de enquadramento (`Conter` / `Cobrir`), opacidade e cantos arredondados.

### Cores (Missão 5)
- Popover unificado com: Paleta Oficial PRESYS, Cores presentes no Documento, Cores Recentes, Color Picker nativo e código HEX direto.
- Posicionamento protegido para evitar estouro em viewports menores.

### Componentes / Blocos (Missão 6)
- **Nomenclatura**: Termo "Blocos" / "Salvar Bloco" é drasticamente superior a "Componente" para a persona alvo.
- Inserção com 1 clique de blocos padrão (Cabeçalho PRESYS, Banner Técnico, Rodapé, etc.) e blocos personalizados salvos pelo usuário.

### Modelo de Capa (Missão 7)
- Capa baseada puramente em objetos canônicos padrão (Text, Shape, Image). Sem nenhum motor de capa segregado.
- Validação: `TEMPLATE -> EDITABLE OBJECTS`.

---

## 5. Simulação do Father Workflow (21 Passos)

| Passo | Ação | Resultado | Observações |
|---|---|---|---|
| 01 | Abrir catálogo | **PASS** | Catálogo TA-25N abre com capa e página 2 prontas. |
| 02 | Adicionar página | **PASS** | Nova página criada e adicionada à barra lateral. |
| 03 | Inserir título | **PASS** | Objeto de texto inserido no centro com foco imediato. |
| 04 | Inserir imagem do produto | **PASS** | Painel lateral de imagens permite inserção com 1 clique. |
| 05 | Inserir tabela técnica | **PASS** | Tabela padrão inserida com dimensões e estilo institucional. |
| 06 | Adicionar duas linhas | **PASS** | Botão rápido "+ Linha" adiciona linhas abaixo com facilidade. |
| 07 | Adicionar cabeçalho agrupado | **PASS** | Cabeçalho exibido acima das colunas sem colisão visual. |
| 08 | Alterar cor do cabeçalho | **PASS** | 1 clique na paleta PRESYS do seletor de cores. |
| 09 | Adicionar título da tabela | **PASS** | Título exibido no topo da tabela, editável diretamente. |
| 10 | Adicionar nota de rodapé | **PASS** | Nota inserida no rodapé da tabela com tipografia técnica. |
| 11 | Redimensionar tabela | **PASS** | Alça inferior direita permite ajuste suave de tamanho. |
| 12 | Mover tabela | **PASS** | Alça de arraste dedicada no canto superior esquerdo. |
| 13 | Duplicar objeto | **PASS** | Botão "Duplicar" / Ctrl+D clona com offset de 16px. |
| 14 | Excluir duplicata | **PASS** | Botão "Excluir" / Del remove objeto selecionado. |
| 15 | Desfazer exclusão | **PASS** | Desfazer (Ctrl+Z) restaura perfeitamente o estado. |
| 16 | Mover próximo à margem | **PASS (Alerta)** | Margem acende e badge "!" surge alertando proximidade. |
| 17 | Inserir banner reutilizável | **PASS** | Painel de Blocos insere banner pré-formatado instantaneamente. |
| 18 | Abrir modelo de capa | **PASS** | Miniatura na barra lateral leva à capa com 1 clique. |
| 19 | Editar título da capa | **PASS** | Duplo clique in-situ edita texto diretamente no canvas. |
| 20 | Localizar Prévia | **PASS** | Botão "Prévia" no topo limpa controles e mostra folha final. |
| 21 | Localizar Exportar | **PASS** | Botão "Exportar" em destaque azul abre pré-voo e PDF. |

---

## 6. Registro de Fricções (Friction Register)

- **P1**: Seletores de coluna sobrepondo cabeçalho agrupado *(RESOLVIDO)*.
- **P1**: Conteúdo de tabela vazando fora do quadro físico *(RESOLVIDO)*.
- **P2**: Quebra de linha na barra contextual em telas de laptop 1366x768 *(RESOLVIDO com layout compacto e `overflow-x: auto`)*.
- **P2**: Notação de intervalo de células técnica demais (ex.: `4:2–4:2`) *(RESOLVIDO com notação legível: `Linha 3`, `Coluna B`, `Célula B4`, `4 células`)*.
- **P3**: Termo "Componente" vs "Bloco" *(Recomendado adotar "Bloco" em toda a interface em português)*.

---

## 7. Invariantes de Interação para W1 / W2

O que o backend e os motores oficiais VNext **DEVEM** garantir:
1. **Autoridade do Usuário sobre o Quadro**: O frame autoral do objeto não deve crescer ou se mover silenciosamente. Transbordamentos devem ser sinalizados como diagnósticos/warnings e resolvidos com ferramentas de auto-fit ou decisão explícita do autor.
2. **Separação de Clipping de Conteúdo vs Chrome de Edição**: O corte de overflow do documento nunca deve cortar as alças ou seletores de manipulação.
3. **Identidade Canônica dos Elementos de Capa**: Capas devem ser páginas comuns contendo objetos editáveis canônicos (`Text`, `Shape`, `Image`), nunca uma entidade de dados segregada.
4. **Mutabilidade Unificada via Ações Tipadas**: Todas as ações rápidas da barra de contexto e do Inspector devem disparar as mesmas `Application Actions` que um futuro assistente de IA usará.

---

## 8. O que W1 / W2 NÃO DEVE Copiar Deste Lab

- O estado em memória simulado e clonagem estruturada em hooks de React.
- A tabela em HTML nativo com strings simples em vez do motor de células tipadas do Table Engine W0.
- Algoritmos improvisados de quebra de texto e cálculo aproximado de overflow.
- Estrutura de persistência efêmera em `useState`.

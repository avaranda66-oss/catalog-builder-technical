# Conversa que edita (FR-72, FR-73) — Onda 4, fatia 4B

**Data:** 22/10/2026 · **Ramo:** `onda4/conversa` (base `origin/main` ab39efc) · **Modelo:** `gemini-3.5-flash-lite` (o mesmo do composer, registro único em `gemini-models.ts`)

## O que o pai consegue fazer

Com um catálogo aberto, ele escreve no assistente pedidos como:

- "Troque o título da capa para PCON-Y18"
- "Traduza esta página para o inglês"
- "Aumente a foto do produto", "Diminua a letra do texto de destaque", "Deixe o subtítulo em negrito"
- "Mude a cor da faixa para azul claro", "Apague a página 4"

A IA lê um resumo da página aberta e devolve **intenções tipadas**. O app mostra o cartão **"Vou fazer isto"**, item por item, com antes e depois. **Aplicar** faz tudo como **um passo só de Desfazer**. Pedido ambíguo vira pergunta. Pedido que exigiria inventar valor técnico é recusado, com explicação.

## Como funciona

1. `document-outline.ts` monta o resumo: todas as páginas numa linha cada (p1, p2…), e os objetos da página aberta (o1, o2…) na ordem de **Camadas**, com o mesmo nome que o pai vê lá, o apelido do id quando ele significa algo ("titulo", "foto"), textos curtos, tamanho da letra, cores e posição. Cabe em ~9 000 caracteres (capa PCON: 41 objetos, ~4 100 tokens de entrada).
2. **Números viram marcadores:** "0 a 250 psi" vai para a IA como `{{A}} a {{B}} psi`, com `nums: ["0","250"]`. A IA não precisa escrever dígitos para manter um número.
3. A tarefa `edit_intent` do `vnext-catalog-composer` (contrato em `edit-intent-contract.ts`, chamado por `composer-contract.ts`) passa pelas **mesmas guardas** das outras tarefas: origem, login, papel admin/editor ativo, reserva de orçamento (00027/00028), limite de corpo e de tokens. O schema de resposta é **limitado em tudo** (maxLength em todo texto, maxItems em toda lista).
4. O servidor confere cada intenção: o objeto existe na página aberta, o tipo serve (cor não vale para foto), objeto travado fica intocado e **nenhum número é inventado**. Um número escrito pela IA precisa estar no próprio texto (marcador), ou ter sido digitado pelo pai na conversa, ou estar em outro texto do catálogo. O resto é bloqueado no servidor (`INVENTED_NUMBER`) e nem chega ao navegador. Na tradução, os números têm de ser exatamente os mesmos, e códigos de modelo ("PCON-HIBRIDO", "KOMPRESSOR-Y18") não podem mudar.
5. `edit-intents.ts` repete as mesmas checagens no navegador e transforma cada intenção em **ações que o editor já tem**. Nenhuma ação nova foi criada:

| Intenção | Ação existente |
|---|---|
| `set_text`, `translate_text` | `text.setContent` |
| `text_size` (texto) | `text.setStyle` (+ `object.resize` da caixa, para a última linha não cortar) |
| `text_size` (tabela) | tamanho P/M/G do painel da tabela (`tableLookSteps` + `planTableComposition`) |
| `text_weight` | `text.setStyle` (só se a fonte tiver negrito) |
| `set_color` | `text.setStyle`, `shape.setStyle`, `polygon.setStyle` (degradê vira degradê da nova cor), `line.setStyle` |
| `resize` | `object.resize` (pelo centro, dentro da página; foto mantém a proporção) |
| `delete_object`, `delete_page`, `duplicate_page` | `object.delete`, `page.delete`, `page.duplicate` |

6. Antes de mexer no catálogo, a lista inteira roda numa **cópia**. Se algo falhar, nada muda. No catálogo real, tudo entra com o mesmo `transactionId`, então **um Desfazer volta tudo**. Se o catálogo mudou depois da prévia, a proposta fica velha e não é aplicada.
7. No cartão, um número que veio da conversa aparece **destacado** ("Confira o número 18: veio da conversa…"), e um número que sai do texto é listado ("Sai do texto: 360").

A reescrita do texto selecionado (`native-text-edit.ts`) também passou a aceitar textos com números: eles vão como marcadores e voltam iguais. Se a IA mudar, tirar ou repetir um número, a reescrita é recusada.

## Prova real com o Gemini (capa PCON híbrido + 3 páginas em branco)

Script: `scripts/probe-edit-intent.ts`. Ele usa o mesmo código da produção (resumo, contrato, schema, checagens, segunda tentativa e planejador do navegador). Só o Supabase é trocado por um orçamento em memória. A chave temporária vem da variável de ambiente e nunca é impressa.

**Versão final: 30 acertos em 30 (3 rodadas × 10 pedidos), sem segunda tentativa.**

| # | Pedido | Esperado | Resultado (3 rodadas) |
|---|---|---|---|
| 1 | Troque o título da capa para PCON-Y18 | `set_text` no título; "18" destacado | 3/3: "PCON HÍBRIDO" → "PCON-Y18", "18" para conferir |
| 2 | Deixe a tabela de especificações com letra maior | a capa não tem tabela: recusa ou pergunta | 3/3 recusa: "Não foi encontrada uma tabela de especificações na página atual…" |
| 3 | Traduza esta página para o inglês | tradução dos textos com os mesmos números | 3/3: 22–23 textos traduzidos; marcas e códigos mantidos; números iguais |
| 4 | Mude a cor da faixa para azul claro | ambíguo: pergunta | 3/3 pergunta, com as opções (selos de faixa, títulos, fundo azul) |
| 5 | Apague a página 4 | `delete_page` p4 | 3/3 |
| 6 | Aumente a foto do produto | `resize` na foto | 3/3: 120 × 116 → 144 × 140 mm |
| 7 | Deixe o subtítulo em negrito | `text_weight` | 3/3 |
| 8 | Coloque a exatidão do PCON-Y18 no rodapé | recusa: seria valor inventado | 3/3 nada inventado: 2 recusas ("O valor exato da exatidão do PCON-Y18 não foi fornecido") e 1 pergunta sobre em qual rodapé (sem sugerir valor) |
| 9 | Diminua a letra do texto de destaque | `text_size` smaller | 3/3: 9 pt → 7,5 pt |
| 10 | Mude a faixa de 0 a 360 psi para 0 a 400 psi | `set_text` na pílula; 400 destacado, 360 sai | 3/3: "0 a 360 psi" → "0 a 400 psi" |

- **Custo:** cerca de US$ 0,016 por rodada de 10 pedidos (~US$ 0,0016 por pedido; ~4 100 tokens de entrada, 35 a 1 200 de saída). **Total gasto na fatia, com todas as rodadas de ajuste: ~US$ 0,26** (teto: US$ 0,50).
- **Tempo:** 1,6 a 4 s por pedido (tradução da página inteira: ~3,7 s).

### O que a prova ensinou (e foi corrigido)

1. **O Gemini recusa um schema "grande demais" (HTTP 400 "invalid argument").** Uma lista de intenções com 8 campos passava com 16 itens e falhava com 24. A intenção na resposta virou plana, com 4 campos (`kind`, `ref`, `text`, `value`), e passa com 40 itens. O servidor converte para a forma tipada. Vale para qualquer schema novo: testar com uma chamada real curta antes.
2. Na primeira rodada (8/10), o modelo usava o marcador velho onde devia escrever o número novo. Exemplos concretos no prompt resolveram.
3. O modelo às vezes não manda o `summary`, ou manda um item vazio. O servidor tolera os dois (o navegador escreve "Preparei N mudanças."). Nada é inventado.
4. Uma tradução trocou "PCON-HIBRIDO" por "PCON-HYBRID". Agora código de modelo em maiúsculas com hífen precisa continuar igual; senão a tradução daquele texto é recusada (`CODE_CHANGED`).
5. Pergunta ou recusa: o prompt agora diz a ordem. Primeiro recusa se faltar valor técnico; depois pergunta se o objeto não estiver claro. E nunca mostrar refs (o1, p2) ao pai.

## Limites e riscos conhecidos

- Só a **página aberta** é detalhada. Para mexer em objeto de outra página, a IA pede para abrir a página. Apagar ou duplicar páginas vale para qualquer página.
- Texto longo demais para o resumo (mais de 320 caracteres) ou com formatação mista não é reescrito pela conversa (`TEXT_CUT`, `NOT_EDITABLE`).
- A tradução mantém o número como está no original ("±0,025%" continua com vírgula em inglês). Adaptar o formato dos números ao idioma é da fatia 4C (`locale-number-format`).
- Nome de produto sem hífen pode ser traduzido ("PCON HÍBRIDO" → "PCON HYBRID"). O cartão mostra o antes e o depois, e o pai decide.
- O nome do objeto vem de Camadas. Na capa PCON, a foto aparece como "Imagem …rid-official-trim". A fatia P está dando nomes melhores às peças da capa, e o cartão aproveita sozinho.
- "Separar especificações elétricas" (J3) ainda não é uma intenção. Hoje a IA responde com pergunta ou recusa, e a divisão de tabela continua no menu da tabela.

## Montado no assistente (23/10/2026, ramo `claude/onda-4-provas`)

`CatalogNativeComposer.tsx` já usa as peças abaixo. No `send()`, `assistantRouteFor(mensagem, documento, contexto)` decide:

1. Ação rápida ("Desfaça", "Deixe a tabela mais compacta") e reescrita do texto selecionado continuam como antes.
2. "Monte o catálogo a partir destes arquivos" com PDFs enviados nesta conversa → o mesmo fluxo do botão da 4A (`plan_draft`). "Crie a página deste rascunho" com fotos enviadas → Modo rascunho.
3. Pedido de mudança num catálogo com conteúdo (troque, mude, apague, aumente, traduza…) → `edit_intent` e o cartão "Vou fazer isto". Depois de uma pergunta ou de um cartão da conversa que edita, a resposta curta ("os selos") continua lá.
4. O resto (criar páginas, catálogo em branco, sugestões da tela inicial) → composer.

Antes de enviar, o `status` gratuito do composer precisa listar `edit_intent` em `tasks` (`COMPOSER_TASKS`). Um servidor mais antigo mostra o cartão "Ainda não dá para mudar o catálogo pela conversa", sem enviar nem cobrar nada. Testes: `tests/vnext/ai-catalog/catalog-native-composer-edit.test.tsx`.

Peças (contrato original da fatia):

- `useEditIntent({ session, gateway: editIntentGateway(client, ownKey), activePageId, selectedObjectIds, onBeforeMutation })` → `{ plan, busy, ask(message, history), apply(), discard() }`. `ask` devolve o texto que o assistente diz (`kind: plan | clarification | refusal | error`). `apply()` devolve "Apliquei… Um Desfazer volta tudo".
- `<EditIntentCard plan onApply onAdjust onDiscard busy />` usa o `ChatCard` do assistente (Aplicar / Ajustar / Descartar).
- `assistantLaneFor(message, document)` → `'edit' | 'compose'`: um assistente só (FR-73). Pedidos de mudança num catálogo com conteúdo vão para `edit_intent`, e pedidos de páginas novas continuam no composer.
- No `send()` do composer: se `assistantLaneFor(...) === 'edit'`, chame `ask` e guarde o texto como turno do assistente. No `items` da conversa, mostre `<EditIntentCard>` quando `plan` existir. Ao aplicar, use `rememberUndo(saveTurn(...))` como nos outros cartões.

## Como rodar

```bash
# testes (sem rede; tests/setup.ts bloqueia qualquer fetch)
npx vitest run tests/vnext/ai-catalog/edit-intents.test.ts tests/vnext/ai-catalog/edit-intent-card.test.tsx \
  tests/vnext/ai-catalog/composer-edge-bounded.test.ts tests/vnext/ai-catalog/native-text-edit.test.ts
# prova real (chave só em variável de ambiente; resultado fora do repositório)
GEMINI_API_KEY=... EDIT_INTENT_LIVE_OUT=D:/tmp-proofs/edit-intent-live.json npx vite-node scripts/probe-edit-intent.ts
```

**Deploy:** o `vnext-catalog-composer` muda (o contrato vai junto no pacote). Não precisa de migração. Para publicar, é preciso deploy aprovado pelo Gabriel a partir do SHA mergeado.

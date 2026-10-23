# Catálogo inteiro pela IA (FR-70, Onda 4 — fatia 4A)

**Data:** 22–23/10/2026 · **Ramo:** `onda4/catalogo-ia` (base `onda4/rascunho`) · **Função Edge:** `vnext-catalog-draft`, tarefa nova `plan_draft`

## O que o pai vê

1. Solta o PDF do produto (e fotos, se quiser) no chat do assistente.
2. Na mensagem dos arquivos aparece **“Montar catálogo a partir destes arquivos”** (ao lado de “Montar tabela de especificações…”).
3. Um cartão mostra a página das especificações que o app achou sozinho (pode mudar), o campo opcional de modelos e o aviso do que vai para o servidor.
4. **“Montar o catálogo”** mostra 5 passos: Lendo arquivos → Gemini lendo PDFs → Conferindo números → Montando páginas → Medindo A4.
5. A **prévia** mostra cada página com miniatura (desenhada a partir da própria página que o Aplicar vai inserir), o que entra em cada campo, **de onde veio cada valor** (“200 W — presys-ta-folder.pdf · página 9”), o que fica “A COMPLETAR”, as fotos a escolher e os textos que podem não caber. As pendências da tabela de especificações (FR-68) aparecem antes.
6. Ele pode **tirar, pôr de volta, subir e descer** páginas, responder às perguntas da IA e escrever “o que mudar”.
7. Três botões: **Aplicar** (tudo entra de uma vez; um Desfazer tira o catálogo inteiro; “Desfazer” fica no cartão por 30 s e na conversa depois), **Ajustar** (as respostas voltam para a IA; o PDF não é lido de novo) e **Descartar**.

Num catálogo novo (uma página vazia), as páginas entram no lugar da página vazia; num catálogo com conteúdo, entram depois da página aberta.

## Como funciona

| Peça | Arquivo | Papel |
|---|---|---|
| Contrato do servidor | `src/vnext/ai-catalog/catalog-plan-contract.ts` | Pedido estrito, prompt, schema limitado, limites da resposta, reserva e liquidação. Puro (Deno + Node). |
| Função Edge | `supabase/functions/vnext-catalog-draft/index.ts` | Ramo `plan_draft` com os mesmos guardas (origem, JWT, perfil admin/editor ativo, tamanho, orçamento 00028). |
| Contrato do navegador | `src/vnext/ai-catalog/contracts.ts` (`CatalogDraftPlanSchema`) | A resposta do servidor checada de novo (zod). |
| Cliente | `src/vnext/ai-catalog/draft-client.ts` (`requestCatalogPlan`) e `spec-table/spec-table-gateway.ts` (`plan`) | Sem credencial e sem arquivo: só o resumo limitado. |
| Conferência | `src/vnext/ai-catalog/catalog-plan.ts` | Monta o resumo (texto das páginas + só fatos conferidos) e confere cada valor da resposta. |
| Aplicar plano de páginas | `src/vnext/ai-catalog/page-plan-apply.ts` | Porta reutilizável: lista de páginas → ações tipadas numa transação. |
| Fluxo e tela | `src/vnext/ai-catalog/useCatalogDraft.ts`, `DraftPreview.tsx`, `draft-preview.css`, `CatalogNativeComposer.tsx` | Cartões no chat, prévia, Aplicar/Ajustar/Descartar, Desfazer. |

### Nada inventado

- O que vai para a IA: o texto das páginas lido **no computador** (pdf-intake) e **só os fatos já conferidos** contra esse texto (FR-67). Fotos vão só pelo nome.
- A IA não pode escrever algarismos. Todo trecho com algarismo vira `[[VNEXT_TECH_n]]` e `literals[n]` traz o trecho copiado como impresso, com arquivo e página — ou o id de um fato conferido.
- O navegador confere **cada** token: o trecho tem de estar impresso no arquivo como trecho inteiro (“IN2” não vale dentro de “IN20”), junto com as letras coladas (“TA-” + “25N”) e a unidade depois do número (“1” + “GHz”). Fato: o valor escrito é o do próprio fato conferido, nunca o da IA.
- Trecho não achado → “A COMPLETAR” no lugar, listado na prévia (o FR-51 bloqueia a publicação até alguém preencher). Algarismo fora de token → o campo **não entra** (fica o “A COMPLETAR” do modelo) e a prévia diz por quê. Em listas (destaques, fornecimento) a conferência é por item.
- A tabela de especificações **nunca** vem da IA: é compilada dos fatos conferidos (`compileDraft`, FR-69), com pendências do FR-68.
- Tabelas que a IA monta a partir do texto (faixas, código de pedido, acessórios, insertos) têm cada valor conferido no texto, mas **não a posição de cada valor na linha**; por isso a prévia sempre diz “Confira se cada código está na linha certa”.

### Servidor: guardas, limites e custo

- Mesmos guardas das outras tarefas. Só `plan_draft` pode trazer o texto das páginas (corpo até 120 000 caracteres; as outras tarefas seguem com 4 000). Pedido com chave, credencial, caractere de controle, id repetido ou texto acima do limite → `INVALID_REQUEST`, sem orçamento nem chamada ao Google.
- `gemini-3.8-flash` (o modelo que esta função já usa), pensamento baixo, temperatura 0, `maxOutputTokens` 16 384, `countTokens` ≤ 40 000.
- Orçamento 00028 (feature `extraction`): reserva do pior caso **182 880 µUSD** (US$ 0,18, preço de 2027) antes da chamada; liquidação pelo uso real; erro HTTP não é cobrado; timeout mantém a reserva.
- **Schema limitado:** toda string tem `maxLength` e toda lista de strings tem `maxItems`. O Gemini recusa (400 “invalid argument”) `maxItems` em listas de **objetos** quando a gramática cresce — sondado nesta fatia: só `pages` com `maxItems` 12, ou só `literals` com 60, já é recusado (com 20 passa). Então cada lista de objetos é limitada **no servidor** antes de a resposta sair (`PLAN_ANSWER_ARRAY_LIMITS`: 12 páginas, 14 textos e 2 tabelas por página, 24 linhas, 120 literais; o que passar fica de fora e é contado em `trimmed`), o prompt diz cada limite e o `maxOutputTokens` limita o todo.

### Aplicar plano de páginas (porta reutilizável)

```ts
compilePagePlan(document, entries, { afterPageId?, replaceEmptyAnchor?, transactionId? }) // não muda nada
applyPagePlan(session, compiled, { templateRegistry? })   // ensaio numa cópia; depois UMA transação
undoPagePlan(session, applied)                            // só se ainda for a última mudança
type PagePlanEntry =
  | { kind: 'template'; key; template: 'P1'…'P9' | 'C1'; fills: PresysArchetypeFills }
  | { kind: 'spec-table'; key; set: DraftFactSet; layout?: 'T1' | 'T3' | 'auto' };
```

Cada página de modelo entra por `page.template.insert` (os mesmos modelos de “Usar modelo…”, com a área segura e o visual do modelo); cada texto preenchido entra por `text.setContent`; tabela ou foto preenchida substitui o espaço do modelo (`object.delete` + `object.insert`; a foto precisa já estar registrada no catálogo). A tela do Modo rascunho usa a mesma porta com o encaixe de `sketch-snap.ts`. `compiled.previews` traz cada página como vai ficar (miniaturas e estimativa de A4).

## Prova real com o folder do TA

`presys-ta-folder (4).pdf` (20 páginas, inglês), especificações na página 9, modelos TA-25N/35N/50N. Handler real da função num VM (como os testes), Supabase simulado, **Gemini real**. Cadeia completa do app: PDF lido aqui → `extract_facts` (p. 9) → conferência → `plan_draft` → conferência de cada valor → compilação → Aplicar num catálogo vazio → um Desfazer. Depois, uma auditoria independente: todo trecho com algarismo nas páginas aplicadas precisa estar impresso no PDF.

| Rodada | Prompt | Páginas | Valores conferidos | Não achados | Campos recusados | Auditoria (trechos com algarismo no PDF) | Tokens plano (entrada/saída) | Tempo do plano | Custo (preço atual) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | v1 | 9 | 130 | 3 | 1 | 196 de 197 — “IN2” fora do PDF | 16 555 / 10 234 | 61 s | US$ 0,051 (plano) |
| 2 | v2 | 9 | 83 | 0 | 0 | 212 de 212 | 16 699 / 9 728 | 58 s | US$ 0,049 (plano) |
| 3 (final, cadeia inteira) | v3 | 8 | 125 | 1 | 0 | **210 de 210** | 16 879 / 10 076 | 59 s | US$ 0,077 (leitura + plano) |

- O “IN2” da rodada 1 (a IA partiu “IN” + “2”, e “2” existia solto na página) levou à conferência do trecho inteiro; com ela, o mesmo caso vira “A COMPLETAR” (teste unitário cobre). Rodada 2: o prompt passou a pedir o trecho inteiro e “[ ]” na estrutura do código. Rodada 3: palavras comuns (“years”, “wires”) ficam fora do token e em português (“20 anos”).
- Rodada 3: 36 valores da tabela conferidos (0 pendência), 8 páginas (capa, visão geral, especificações, faixas e entradas, código de pedido, fornecimento e acessórios, insertos, contracapa), documento válido, aplicação em 1,5 s, **um Desfazer volta ao catálogo vazio**. O único valor não achado: a IA escreveu “EURAMET/cg-” antes do token do trecho “EURAMET/cg-13/V03”, a conferência do trecho recusou e o campo ficou com “A COMPLETAR” e o aviso.
- A estimativa de A4 avisou: “Modelo” da capa (TA-25N / TA-35N / TA-50N em 36 pt) e as tabelas longas de faixas, código de pedido e insertos podem não caber no espaço do modelo.
- Gasto real de IA nesta fatia: cerca de **US$ 0,23** (2 leituras extras da p. 9 durante o ajuste do script, 3 planos, 1 cadeia completa e ~15 sondagens de schema de poucos tokens). Teto da fatia: US$ 0,50.

Evidências: `docs/ai-catalog/catalogo-ia/rodada-{1,2,3}/` (`relatorio.json` com cada página, campo, valor e origem; `plano-bruto.json` com a resposta limitada do servidor; `extracao-bruta.json` da rodada 3). Nenhuma chave nos arquivos (conferido).

Rodar de novo:

```bash
GEMINI_API_KEY=... npx vite-node scripts/live-catalog-plan.ts -- --pdf "<presys-ta-folder (4).pdf>" --out <pasta> [--pages 9-9] [--reuse-extraction | --replay]
```

## O que ainda falta (fora desta fatia ou decisão)

- **Deploy** da função `vnext-catalog-draft` a partir do SHA integrado (aprovação do Gabriel). A verificação grátis (`status`) agora diz quais tarefas a versão publicada sabe fazer (`tasks`); com a função antiga (ou sem função), o cartão diz que a montagem do catálogo ainda não chegou ao servidor **antes** de enviar ou cobrar qualquer coisa, e nada muda.
- **Fotos** anexadas não são colocadas nas páginas (precisam do registro do asset pelo editor); a prévia lista “Fotos para escolher na página”. A porta já aceita `image` quando o asset existe.
- **Planilhas** não entram no plano (só PDFs); fotos vão só pelo nome.
- **Posição na linha** das tabelas que a IA monta (P5–P8) não é conferida (só o valor no texto). Na rodada 3, a linha IN1E dos insertos saiu com o código de pedido na coluna “Furos”; a prévia avisa para conferir. Ligar essas tabelas ao `extract_facts` (posições do texto) seria o próximo passo.
- **Medindo A4** é estimativa (largura média de letra), não a medição do editor; “Ajustar altura” das tabelas fica para a pessoa.
- A página de especificações é a tabela do compilador (J2-lite), sem o cabeçalho e o rodapé do modelo P4.
- A IA às vezes deixa de fora uma página possível (rodada 3 sem “Recursos”); a pessoa pede em “Ajustar”.
- Não rodei a suíte completa nem Playwright (regra da fatia).

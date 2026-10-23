# Arsenal no assistente: roteador sem IA + IA que usa e alimenta o arsenal — Onda 4.5, fatia "arsenal-ia"

**Data:** 23/10/2026 · **Ramo:** `onda45/arsenal-ia` (base `onda45/contrato`) · Contrato: `docs/architecture/ADR-arsenal.md`

## O que o pai vê

Ele escreve no assistente do jeito dele. Pedido simples é resolvido **aqui, sem IA (zero tokens)**, num cartão:

| Pedido | Cartão |
|---|---|
| "bota uma tabela com 5 linhas", "põe uma tabela 4x3", "mete uma tabela com cinco linhas e duas colunas" | **Posso fazer isto sem usar IA**: tabela nova vazia (a 1ª linha é o cabeçalho), com o visual de tabela nova do editor |
| "nova página de acessórios", "insere uma capa", "põe a contracapa", "página P4" | **Posso fazer isto sem usar IA**: página-modelo PRESYS P1–P9 depois da página aberta (uma página em branco aberta é substituída) |
| "insere o cabeçalho padrão", "põe aquela tabela de especificações de 3 modelos", "usa a capa azul" | **Achei no arsenal, sem usar IA**: o modelo guardado, com autor e categoria |
| "aumenta o título", "deixa em negrito", "pinta de vermelho" (seleção), "aumenta a foto" | o cartão **Vou fazer isto** da conversa que edita, montado aqui, com antes e depois |

Botões: **Usar** (ou **Aplicar**) · **Ver outros** (outros modelos do arsenal e a página-modelo/tabela equivalente; "Abrir o arsenal" quando a galeria existe) · **Pedir à IA** (o mesmo pedido vai uma vez para a IA, sem repetir a mensagem) · **Descartar**. Tudo entra como **um passo só de Desfazer**.

Vai para a IA, como antes: escrever ou trocar texto, traduzir, apagar, mover; arquivos e o catálogo inteiro; perguntas; duas coisas ao mesmo tempo ("uma capa e uma apresentação"); palavras que o modelo não expressa ("capa para o TA-25N", "página de contato", "tabela comparativa" sem tamanho); e **qualquer número que não seja contagem de linhas/colunas/modelos** ("0,1%", "página 3", "24 pt") — o roteador nunca decide valor técnico.

## Como funciona

- `src/vnext/arsenal/local-router.ts` (puro): normaliza (sem acento, plural → singular, "bota/põe/coloca/mete…" → inserir, números por extenso → dígitos, "4x3"), casa com nomes/etiquetas/sinônimos/categoria do arsenal e com três ações determinísticas, e dá uma confiança. Limiares em `LOCAL_ROUTER_THRESHOLDS` (mínimo 0,6; depois de pergunta da conversa que edita, 0,85). Modelo do arsenal só ganha de uma ação quando o pedido cita algo dele além da categoria ("cabeçalho **padrão**"); "aquela/aquele…" sem nada parecido vai para a IA.
- `assistantDecisionFor` (`edit-intents.ts`): arquivos (catálogo/rascunho) → **roteador sem IA** → `edit_intent` → composer. `assistantRouteFor` continua igual quando não recebe o contexto `local`.
- `src/vnext/ai-catalog/local-assistant-actions.ts`: tabela (`object.insert` + visual de tabela nova), página-modelo (`page.template.insert`), estilo (plano da conversa que edita, `planEditIntents`).
- `src/vnext/arsenal/assistant-arsenal.ts`: `AssistantArsenal` (lista, `use`, `save`, galeria, miniatura) e `createAssistantArsenal` sobre `ArsenalRepository` + `ArsenalInsertionService` + `ArsenalCaptureService` (estilo exige 1 objeto selecionado do tipo certo; uso contado com `recordUse`).

## A IA e o arsenal

- `edit_intent` e `compose_scaffold` podem levar `arsenal`: **índice curto** (`buildAssistantArsenalAiIndex`): até 30 itens, 3 etiquetas, 2 400 caracteres, os mais usados primeiro, com refs locais `a1…` no lugar dos ids (UUID custa tokens e pode ser inventado). Só vai para servidor que anuncia `features: ['arsenal_index']` no `status` gratuito.
- Resposta nova `use_preset {status, preset: "a3", summary?}` (schema limitado: `preset` é um enum só com as refs enviadas — com texto livre de 5 caracteres o Gemini recusava o schema do edit_intent com HTTP 400, ver `LINGUAGEM_NATURAL.md`; uma ref deixada junto de outra resposta é descartada). O servidor só aceita ref enviada (`verifyArsenalChoice`); o navegador confere de novo e se o modelo ainda existe. O cartão **A IA achou no arsenal** usa o mesmo **Usar** (zero IA).
- Depois de **Aplicar** páginas criadas pela IA, o chat oferece **Guardar no arsenal?** com nome (título da página) e categoria (Capas/Páginas) sugeridos; a pessoa confirma e o cliente cria com `origin: 'ai'` (tabelas vão sem valores, como manda o contrato).
- Política (`LAYOUT_DEFAULTS_POLICY`, nos dois prompts): layout/estilo usa padrões sensatos sem perguntar ("o título" = letra maior; cor sem tom = cor da marca; página nova depois da aberta); só pergunta quando dois resultados diferentes são igualmente prováveis. Valor técnico continua bloqueado (`INVENTED_NUMBER` no servidor e no navegador).

## Para a integração

- `CatalogNativeComposer` ganhou `arsenal?: AssistantArsenal` e `selectedObjectIds?` (o editor já passa a seleção).
- **Montado (integração `claude/onda-45`):** `mountVNextApp` cria o arsenal com `createArsenalEditorRuntime` (`SupabaseArsenalRepository` + `createPresysArsenalBuiltinSource()` + `browserIsOffline`, `ArsenalService`, inserção e captura do motor, `viewer` do login, `isAssetAvailable` pelo resolvedor de fotos do app, que já instala a foto no catálogo aberto) e passa ao `VNextApp`. O `EditorWorkspace` usa `useAssistantArsenal` (uma lista só, lida ao abrir, depois de guardar e ao fechar o painel; miniatura do painel nos cartões; "Abrir o arsenal" abre o painel com as palavras do pedido na busca). O harness das provas monta igual.
- Estilo que o objeto já tinha: a inserção devolve `unchanged: true`; painel e chat dizem "Nada mudou", não contam uso e não oferecem Desfazer.
- **Deploy:** muda o `vnext-catalog-composer` (contrato no pacote; `maxBodyChars` 27 000). Sem migração. Servidor antigo: o navegador não manda o índice e tudo segue como antes.

## Testes

```bash
npx vitest run tests/vnext/arsenal/local-router.test.ts tests/vnext/arsenal/assistant-arsenal.test.ts \
  tests/vnext/ai-catalog/arsenal-ai-contract.test.ts tests/vnext/ai-catalog/local-assistant-actions.test.ts \
  tests/vnext/ai-catalog/catalog-native-composer-arsenal.test.tsx   tests/vnext/app/arsenal/arsenal-integration.test.tsx tests/vnext/app/arsenal/arsenal-assistant-editor.test.tsx
```

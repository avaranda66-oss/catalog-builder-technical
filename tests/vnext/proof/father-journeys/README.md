# Provas "father-journeys" (jornadas do pai)

Suíte de provas de uso real do Catalog Builder, vistas pelos olhos de quem vai usar o produto no dia a dia
(o "pai"). Cada jornada abre o aplicativo num navegador de verdade (Chromium sem janela), clica como uma
pessoa clicaria e grava o que viu: capturas de tela, nomes dos botões, textos, erros de console.

Tudo roda **local**: sem internet, sem Supabase, sem login, sem chave de IA. Nada toca produção.

## Como rodar

```bash
# todas as jornadas, em série (um Chromium por vez), com tabela e resumo no final
node tests/vnext/proof/father-journeys/run-all.mjs

# só algumas (prefixo do arquivo)
node tests/vnext/proof/father-journeys/run-all.mjs j00 j03

# uma prova só
node tests/vnext/proof/father-journeys/j00-smoke.mjs

# janela menor (1280×720; padrão 1366×768). As capturas ganham o sufixo @1280
VP=1280 node tests/vnext/proof/father-journeys/j00-smoke.mjs

# reutilizar um servidor vite já aberto (por exemplo, o que outra pessoa deixou de pé)
BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/run-all.mjs
```

- **Porta:** `127.0.0.1:5190`. Se já houver algo respondendo ali (ou em `BASE_URL`), a prova reutiliza;
  senão sobe o `vite` sozinha, na raiz do repositório, e fecha ao terminar.
- `node_modules` pode ser uma junção (link) do Windows: o servidor já libera o caminho real
  (`fs.allow` com `realpathSync`), não precisa configurar nada.
- `run-all.mjs` devolve código de saída 1 **só** se alguma jornada estiver `fail`. `pending` não falha.

## Onde ficam os resultados

Tudo em `scratch/father-journeys/` (pasta ignorada pelo git):

| Caminho | O que é |
|---|---|
| `results/<jornada>.json` | passos (ok/falhou + detalhe), evidências, achados, log de console, nomes acessíveis vistos |
| `results/<jornada>@1280.json` | o mesmo, quando rodou com `VP=1280` |
| `shots/<nome>.png` / `shots/<nome>@1280.png` | capturas de tela |
| `summary.json` / `summary@1280.json` | agregado do `run-all.mjs`: estado por jornada + arquivo de evidência |

## O harness (`fixtures/father-harness.html` + `.tsx`)

Réplica do modo de produção (`src/vnext/app/bootstrap.tsx`) com persistência local:

- Biblioteca (`CatalogLibrary`) com os modelos oficiais e o editor (`VNextApp`, modo simples) exatamente
  como o pai vê em `/v2`; voltar e abrir recarregam a página, como na produção.
- O "servidor" é o `localStorage` desta origem. Imagens ficam em memória + `localStorage`. A recuperação
  local usa um banco com o nome passado em `?db=` (use um nome novo por prova).
- IA: um composer **falso**, que nunca pede chave. `?ia=limite` responde como o servidor responde quando o
  limite diário acabou; `?ia=off` responde como um servidor sem IA configurada.
- Tradução: provedor controlado (resposta padrão, local).
- `?user=B` muda a identidade do "funcionário". Duas abas no mesmo navegador com `?user=A` e `?user=B`
  compartilham o mesmo `localStorage` = mesma empresa, mesmo servidor.
- `window.__FATHER__` expõe `state()`, `holdSaves(true|false)`, `releaseHeld()`, `flushRecovery()`,
  `recoveryRecords()`, `open(id)`, `library()`, `dispose()` para as provas inspecionarem sem depender
  da tela.

## Como escrever uma nova jornada

1. Crie `jNN-nome-curto.mjs` nesta pasta (o `run-all.mjs` pega tudo que começa com `j` + número).
2. Use `lib.mjs`:

```js
import { ensureServer, launch, harnessUrl, freshDb, journey, shot, state, waitSaved, createCatalog } from './lib.mjs';

const server = await ensureServer();
const { browser, page, log } = await launch();
const j = journey('j05-renomear', 'Renomear um catálogo pelo título');
let status = 'fail';
try {
  await page.goto(harnessUrl({ db: freshDb('j05') }));
  await createCatalog(page, { name: 'Meu primeiro catálogo' });
  j.step('editor abre salvo', (await state(page)).runtime.saveLabel === 'Saved');
  j.addEvidence(await shot(page, 'j05-01-editor'));
  j.finding('o botão X não explica o que faz', { severity: 'medium', where: 'barra de cima' });
} catch (error) {
  j.step('execução sem exceção', false, String(error));
} finally {
  status = await j.finish(log);      // ou j.finish(log, { pending: 'depende de FR-85' })
  await browser.close();
  await server.close();
}
process.exit(status === 'fail' ? 1 : 0);
```

3. Prefira seletores por papel e nome (`getByRole('button', { name: 'Novo catálogo' })`), nunca por classe.
4. Cada passo (`j.step`) é uma afirmação que a pessoa confere na tela. Guarde uma captura por tela importante.
5. Achados de usabilidade vão em `j.finding(...)`, não derrubam a prova; eles alimentam a síntese.

## Convenções de estado

| Estado | Significa |
|---|---|
| `pass` | todos os passos rodaram e ficaram verdes **nesta execução** |
| `fail` | algum passo falhou ou a prova quebrou |
| `pending` | a jornada depende de um recurso que ainda não existe (ex.: uma FR não implementada); a prova roda até onde dá e declara o motivo |

**Nunca marque verde o que não rodou.** Se uma prova não foi executada, ela não tem resultado. Se foi
executada e falhou, fica `fail` com o detalhe. `pending` é só para dependência declarada, com o motivo
no JSON (`pendingReason`).

## Limites conhecidos

- O harness replica a montagem de produção, mas o servidor é local: latência, quedas de rede e permissões
  reais do Supabase não acontecem aqui. Para simular salvamento lento use `__FATHER__.holdSaves(true)`.
- O aviso do navegador ao fechar a aba com trabalho não salvo existe (como na produção); `lib.mjs` aceita
  esse diálogo automaticamente e registra no log, para a navegação não travar.

# Assistente — chave própria e alertas completos

Data: 18/10/2026. Story: [continuação father-ready](../stories/2026-10-17-father-ready-continuacao.md), AC3/AC4, FR-60 e FR-12.

## Problema e correção

`ownKeyOffered` aceitava qualquer estado diferente de `ready`, inclusive a consulta inicial sem resposta e os estados `blocked`. Isso fazia o botão “Avançado (chave própria)” aparecer durante a consulta e quando a consulta de orçamento retornava 429, mesmo sem o servidor ter informado que aceitava BYOK. O botão ocupava outra linha e ajudava a empurrar o alerta para fora da janela.

`CatalogNativeComposer.tsx` passou a oferecer uma nova chave somente quando o servidor retorna `ready` com `byok: true` ou no estado legado `available`. Uma chave previamente desbloqueada continua disponível durante a consulta e após `blocked`. A ausência de client continua sem oferecer chave. O envio e o texto de erro permanecem completos; o pedido volta para a caixa e permanece marcado como não enviado.

Apenas remover o botão resolveu o alerta diário em 1366 e 1280. Porém, a J13 em 1280 ainda encontrou o alerta mais longo “servidor sem IA” terminando em **y=731 numa janela de 720 px**, cortado pelos contêineres do assistente. Por isso foi aplicado um ajuste restrito ao estado de erro: atributo `data-has-error` no composer e uma regra no histórico do assistente para permitir que ele ceda altura ao aviso e aos controles. A primeira tentativa com mínimo zero deixou pouca área legível de histórico. O ajuste final usa **`min-height: 64px`**, o mesmo mínimo já utilizado no histórico quando há arquivos, em vez de 96 px nesse caminho. O histórico mantém `overflow-y: auto`; não recebe `display: none`. Nenhum CSS de tradução foi alterado nesta subtarefa.

Arquivos de produto/teste alterados:

- `src/vnext/ai-catalog/CatalogNativeComposer.tsx`.
- `src/vnext/app/styles.css` — uma regra restrita ao histórico no estado de erro.
- `tests/vnext/ai-catalog/catalog-native-composer.test.tsx`.

## Vitest focado

Comando:

```powershell
npm test -- tests/vnext/ai-catalog/catalog-native-composer.test.tsx --minWorkers=1 --maxWorkers=2
```

**Exit 0; um arquivo aprovado, 21 testes aprovados, zero falhas; duração 14,55 s.** Log: `scratch/continuacao/assistente-vitest-1.log`.

Cobertura relevante: ausência de oferta durante consulta e bloqueios por limite/desativação/permissão; preservação de pedido não enviado e documento; envio com chave previamente desbloqueada apesar do status bloqueado; aceitação de BYOK declarado; compatibilidade com o servidor legado `available`; persistência da chave ao fechar/reabrir o painel e volta à chave do servidor. Houve um aviso React `act` no teste existente de chave própria; não houve falha. A rodada focada ocorreu após a correção de capacidade e antes do atributo/regra de layout; as jornadas finais abaixo exercitaram o estado de erro com o ajuste de layout.

## Chromium, sem serviços externos

Executado um Chromium por vez, em série, usando o runner existente e sem alterar scripts de jornadas ou harness:

```powershell
node tests/vnext/proof/father-journeys/run-all.mjs j13 jia1
$env:VP='1280'
node tests/vnext/proof/father-journeys/run-all.mjs j13 jia1
Remove-Item Env:VP
```

Todos os resultados registram worktree `father-ready-continuacao/catalog-builder`, branch `codex/father-ready-continuacao`, HEAD `063d9966defe94bd37f4e472986ba6b4a525c1fa`, **dirty=true**, Node `v24.13.0` e Chromium `151.0.7922.34`. O HEAD sozinho não reproduz os arquivos locais; o integrador deve salvar o diff/checkpoint final.

| Rodada | Viewport | runId | Resultado |
|---|---|---|---|
| Só correção da oferta de chave | 1366×768 | `2026-10-18T16-39-53-644Z-f1d68fa4-d640-41d1-84a5-c102872bce3e` | Exit 0; J13 `pending`, J-IA1 `pass`; alertas completos. |
| Só correção da oferta de chave | 1280×720 | `2026-10-18T16-40-23-308Z-94378533-f03f-467d-ab74-9f916261b229` | **Exit 1; J13 `fail`**, J-IA1 `pass`: O3 “servidor sem IA” cortado em y=731. Alerta diário y=631–711 já completo. |
| Histórico com mínimo zero, intermediário | 1366×768 | `2026-10-18T16-41-27-490Z-565cf501-b4b3-4292-a572-34522e742307` | Exit 0; J13 `pending` (10.213 ms), J-IA1 `pass` (7.221 ms); zero falhas funcionais. |
| Histórico com mínimo zero, intermediário | 1280×720 | `2026-10-18T16-41-52-530Z-ab4589f4-8019-4753-832e-99327248c708` | Exit 0; J13 `pending` (10.024 ms), J-IA1 `pass` (7.232 ms); zero falhas funcionais. Inspeção visual pediu preservar mais área de histórico. |
| **Estado final, histórico mínimo 64 px** | 1366×768 | `2026-10-18T16-43-42-129Z-8052bfc5-78d0-4f5f-91a3-288c36b8a3b1` | Exit 0; J13 `pending` (10.546 ms), J-IA1 `pass` (7.439 ms); zero falhas funcionais. |
| **Estado final, histórico mínimo 64 px** | 1280×720 | `2026-10-18T16-44-06-298Z-d2aced81-efdf-4d27-ae46-cb8a4aa45878` | Exit 0; J13 `pending` (10.337 ms), J-IA1 `pass` (7.365 ms); zero falhas funcionais. |

Os diretórios completos são `scratch/father-journeys/runs/<runId>/`. Cada um contém seus próprios `results`, `shots` e resumo; os JSON em 1280 usam o sufixo `@1280`. Os logs desta subtarefa são `scratch/continuacao/assistente-browser-1366-1.log`, `assistente-browser-1280-1.log`, `assistente-browser-1366-2.log`, `assistente-browser-1280-2.log`, `assistente-browser-1366-3.log` e `assistente-browser-1280-3.log`. A falha intermediária permanece preservada.

Medições da J13 após o ajuste:

| Viewport | Alerta diário | Alerta servidor sem IA | Fonte e recorte |
|---|---|---|---|
| 1366×768 | y=623–703 | y=623–723 | 15 px; ambos `visibleWithoutScrolling=true`, sem clippers. |
| 1280×720 | y=599–679 | y=599–699 | 15 px; ambos `visibleWithoutScrolling=true`, sem clippers. |

A J-IA1 também confirmou ausência de oferta de chave durante a consulta, com servidor pronto sem BYOK e no limite diário; preservação do pedido; alerta diário inteiro; e explicação de servidor sem IA que não aponta para um botão inexistente. As quatro jornadas finais registraram o passo de zero erros de console/aplicativo/página como aprovado.

O alerta completo de servidor sem IA continua: “A IA do servidor ainda não foi configurada. Fale com o administrador. Enquanto isso, continue editando à mão. O catálogo não foi alterado.” Não foi abreviado para caber nem houve desativação do envio para evitar a mensagem.

## Pendências e limites

- J13 continua `pending` por **queda real de rede** e **sessão expirada real**, ausentes no harness de persistência local. Mantém o achado **C-05/P3/FR-61**: o envio permanece ativo mesmo após a prontidão informar orçamento esgotado.
- J-IA1 continua `pass` com **D-07/P3**: o histórico rola até os controles e pode iniciar a proposta abaixo do título/Página 1. Não foi corrigido nesta subtarefa nem escondido no resultado.
- Uma inspeção visual da captura final 1280 confirmou input, Enviar e alerta completos, e uma faixa legível do histórico com rolagem preservada. O espaço é reduzido enquanto há erro, sem esconder a conversa; o mínimo normal retorna quando o erro é limpo.
- Serviços externos, credenciais reais, Gemini, produção, autenticação real e aceite observado do pai não foram exercitados. Não houve instalação, commit, push, deploy ou execução de migração nesta subtarefa.
- Os quatro gates completos sobre o estado final consolidado ficam com o integrador. A revisão CodeRabbit anterior dos commits `001da19`/`063d996` não cobre automaticamente estas alterações posteriores.

Os resultados em `scratch` são ignorados pelo Git. O responsável pela integração deve preservar os JSON/capturas relevantes no checkpoint rastreável e atualizar a story/File List.

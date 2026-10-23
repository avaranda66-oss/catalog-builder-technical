# ADR — Arsenal de modelos salvos (Onda 4.5, fatia "contrato")

**Data:** 23/10/2026 · **Estado:** aceita (base das fatias persistência, captura/inserção, galeria e IA)

## Problema

O dono quer um "arsenal": capas, tabelas, cabeçalhos, rodapés, páginas e estilos guardados uma vez e reusados em
qualquer catálogo, cada um com miniatura. Quem guarda pode ser a pessoa ou a IA do chat ("Guardar no arsenal?").
Usar um modelo **não chama a IA** (zero tokens): vira ações tipadas com um só Desfazer.

## Decisão

1. **Um preset = metadados + conteúdo (payload) versionado.** Código: `src/vnext/arsenal/contracts.ts`.

   | Campo | Regra |
   |---|---|
   | `id` | UUID minúsculo (equipe) ou `builtin:<slug>` (embutido) |
   | `scope` | `team` (banco, todos da equipe veem) ou `builtin` (modelos PRESYS do código, **somente leitura**) |
   | `origin` | `person`, `ai` (a IA propôs e a pessoa confirmou) ou `builtin` |
   | `kind` | `page` (página inteira), `block` (objetos/grupo: cabeçalho, capa, chamada…), `table` (estrutura + estilo), `style` (texto, forma, polígono, linha ou tabela) |
   | `category` | Capas, Tabelas, Cabeçalhos, Rodapés, Páginas, Estilos (valores `capas`, `tabelas`, `cabecalhos`, `rodapes`, `paginas`, `estilos`) |
   | `name` / `description` | ≤ 80 / ≤ 280 caracteres, sem espaços nas pontas |
   | `tags` / `synonyms` | etiquetas visíveis (≤ 12 × 32) e sinônimos só para busca (≤ 24 × 40), sem repetição (acentos e maiúsculas não contam) |
   | `useCount` / `lastUsedAt` | contagem de uso, também para os embutidos |
   | `createdBy` / `createdByName` | autor (mostrado na galeria) |
   | `payloadSchemaVersion` | hoje `1`; versão maior aparece na lista como "precisa de app mais novo" e não é inserida |

   Tipo × categoria: `page` → Capas ou Páginas; `block` → Capas, Cabeçalhos, Rodapés ou Páginas (uma chamada solta fica
   em Páginas com a etiqueta "chamada"); `table` → Tabelas; `style` → Estilos. Banco e cliente conferem a mesma tabela.

2. **Payload por tipo** (objetos canônicos do editor, com os ids do catálogo de origem; quem insere gera ids novos):
   - `page`: `objects`, `background?`, `safeArea?`, `tableValues`, `assets`.
   - `block`: `frame` (onde estava na página de origem) + `objects` com posição relativa a esse quadro, `tableValues`, `assets`.
     Inserir "no mesmo lugar" devolve cabeçalho e rodapé à posição certa.
   - `table`: `sizeMm`, `table` (modelo completo), `tableValues`, `assets`.
   - `style`: `{ target: 'text' | 'shape' | 'polygon' | 'line' | 'table', … }`, sem imagens.

   Limites: até 400 objetos (contando os de dentro de grupos), 40 imagens, payload ≤ 768 KiB no cliente
   (`JSON.stringify`) e ≤ 1 MiB no banco (texto do `jsonb`, que tem espaços a mais).

3. **Valores técnicos em tabelas.** `tableValues` vale para toda tabela do payload:
   - `structure-only` (padrão): guarda colunas, linhas, mesclagens, larguras e estilo. Fica só o texto das linhas de
     **cabeçalho**. Todo o resto fica vazio ("valores vêm do PDF"). Saem códigos, medidas, imagens, marcadores, notas,
     legenda e título. O validador **recusa** um payload `structure-only` que ainda tenha valores
     (`findArsenalTableValueViolations`). `stripArsenalTableValues` faz a limpeza.
   - `generic-values`: só por escolha explícita da pessoa, para conteúdo genérico (ex.: "Fornecimento padrão").
   Textos soltos de página/bloco são guardados como estão. Os embutidos usam "A COMPLETAR", que a revisão de conteúdo
   (FR-51) bloqueia até ser trocado.

4. **Imagens.** `vnext_assets` é global e imutável (migração 00025): o preset guarda o `AssetRef` completo (id, versão,
   sha256…) de cada imagem/ícone/fundo que usa, e o validador exige que a lista bata exatamente com as referências.
   Ao inserir em outro catálogo, a inserção registra o mesmo asset (`asset.register` ou o campo `asset` de
   `object.insert`) — não copia bytes. Se o asset não
   carrega mais (`isAssetAvailable` falso), a imagem vira a moldura "Foto a escolher (A COMPLETAR)" do padrão dos
   arquétipos, e o resultado avisa. Na captura, a pessoa pode pedir moldura no lugar de uma foto específica do produto.

5. **Miniatura = desenho ao vivo** do payload com o `PageThumbnail` que já existe (página sintética A4; bloco no lugar de
   origem; tabela no topo; estilo aplicado a uma amostra). Sem bucket de imagens, sem PNG guardado.

6. **Banco** (`supabase/migrations/00031_vnext_arsenal_presets.sql`, só o arquivo):
   - `vnext_presets`: RLS — ler: admin/editor ativos; criar: admin/editor; alterar/apagar: autor ou admin. A tabela só
     tem `SELECT` para `authenticated`; toda escrita passa por RPCs `SECURITY DEFINER`, como `vnext_catalogs`.
   - RPCs: `list_vnext_presets_v1` (sem payload), `get_vnext_presets_v1` (até 50 ids, com payload),
     `create_vnext_preset_v1` (idempotente pelo `mutationId`), `update_vnext_preset_cas_v1` e
     `delete_vnext_preset_cas_v1` (CAS por `revision`, replay só da última mutação), `record_vnext_preset_use_v1`.
   - Apagar é lógico (`deleted_at`): some da galeria, e um admin recupera pelo banco se foi engano.
   - Uso em `vnext_preset_usage` (chave = UUID ou `builtin:<slug>`): contar uso não mexe na revisão do preset nem
     gera conflito com quem está renomeando.
   - O banco confere só a casca (chaves, tipos, categoria, versão, tamanho). A validação profunda é a do cliente
     (`parseArsenalPresetDraft`), como nos catálogos.

7. **IA.** Recebe só o índice compacto (`buildArsenalCompactIndex`: id, nome, categoria, tipo, até 4 etiquetas;
   ≤ 120 itens e ≤ 12 000 caracteres, mais usados primeiro). Ela nunca grava direto: propõe "Guardar no arsenal?",
   a pessoa confirma nome/categoria, e o cliente cria com `origin: 'ai'`. Pedido simples de layout/estilo usa um preset
   com padrões sensatos sem perguntar; valores técnicos continuam vindo só de PDF/planilha conferidos.

8. **Contratos para as fatias paralelas.**
   - Persistência implementa `ArsenalRepository` (`repository.ts`) e passa a suíte
     `tests/vnext/arsenal/contract/arsenal-repository.contract.ts` (a referência em memória já passa).
   - Captura/inserção implementa `ArsenalCaptureService` (`capture.ts`) e `ArsenalInsertionService` (`insertion.ts`)
     e passa `tests/vnext/arsenal/contract/arsenal-insertion.contract.ts`: todas as ações com o mesmo `transactionId`
     (um Desfazer), falha no meio desfaz tudo, versão desconhecida ou alvo errado não executa nada, nenhuma chamada à IA.

## Consequências

- Nova categoria ou tipo pede migração (CHECK do banco) e mudança em `ARSENAL_KIND_CATEGORIES`. Um teste compara os dois.
- Payload v2 pede migração que amplie o CHECK de `payload_schema_version` e um leitor que converta v1.
- Fontes: um estilo com `fontFamily` que o catálogo de destino não tem cai na fonte padrão do documento.
- Pendente: ensaio em Postgres real da migração 00031 (o teste da fatia é estático, como o de 00030).
- Fatia arsenal-motor (captura/inserção/miniatura, `src/vnext/arsenal/arsenal-*.ts`): uma ação nova, `page.setSafeArea`
  (CAS por `expectedSafeArea` → `TARGET_STALE`, um Desfazer), para a página do arsenal voltar com a área segura com que
  foi desenhada (`page.add` cria 12 mm; os arquétipos PRESYS usam 10 mm). Todo o resto reusa ações existentes; modelos
  embutidos `builtin:<templateId>` entram por `page.template.insert` quando o editor conhece o modelo. Posição sem
  ponto: cabeçalho/rodapé no lugar de origem; o resto no meio da maior área livre (tabela: no topo), sempre dentro da
  área segura e acima do rodapé de controle (FR-55). Estilo de texto não troca a família (fica a do documento, como no
  inspetor). Um embutido com tabelas "A COMPLETAR" precisa de `tableValues: 'generic-values'` (senão é inválido).

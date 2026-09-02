# FASE 2 — ARCHITECTURAL DESIGN: REALTIME COLLABORATION ENGINE (Yjs + Presence + Broadcast)

**Projeto:** PRESYS Catalog Studio  
**Data:** 01/09/2026  
**Status:** PROPOSTA ARQUITETURAL PARA REVISÃO  

---

## 1. Diagnóstico do Modelo Atual vs. Modelo Colaborativo

### Limitação do Modelo Atual (Document-Level CAS)
No modelo atual (Fase 1), o catálogo inteiro é tratado como um único JSON versionado (`v1, v2, v3...`). O mecanismo de CAS (`expected_version`) é fundamental e protege com sucesso contra *lost updates* silenciosos, mas não possui semântica de mesclagem interna:
- Se o **Navegador A** edita o Bloco 1 da Capa e salva, a versão avança para `v11`.
- Se o **Navegador B** edita o Bloco 2 da Folha 2 concorrentemente na versão `v10`, a tentativa de save de B recebe conflito `40001` e exige resolução manual.

### Modelo Alvo (FASE 2: CRDT Granular via Yjs)
A colaboração multiusuário em tempo real moderna desacopla o estado da interface da camada de dados compartilhados:

```text
┌────────────────────────────────────────────────────────┐
│               ZUSTAND (Local-Only UI State)            │
│  - Zoom, activePageIndex, selectedBlockId, sidebars    │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│            Y.Doc (CRDT Shared Document Layer)          │
│  - Y.Map("catalogMetadata")                            │
│  - Y.Array("pages") -> Y.Map("page")                   │
│  - Y.Array("blocks") -> Y.Map("block") -> Y.Text()     │
└────────────────────────────────────────────────────────┘
          │                                 │
          ▼                                 ▼
┌──────────────────────┐       ┌────────────────────────┐
│  Supabase Broadcast  │       │   Supabase Presence    │
│  - Yjs Uint8Array    │       │   - User avatar & name │
│    deltas (Websocket)│       │   - Active page index  │
└──────────────────────┘       │   - Selected block ID  │
                               └────────────────────────┘
                                            │
                                            ▼
                               ┌────────────────────────┐
                               │  PostgreSQL Snapshots  │
                               │  - save_catalog_v3     │
                               │  - Version audit trail │
                               └────────────────────────┘
```

---

## 2. Estrutura de Tipos Yjs para o Catálogo

Cada entidade do catálogo terá um identificador UUID imutável e estável:

1. **`doc.getMap('catalog')`**:
   - `id: string` (UUID imutável)
   - `title: Y.Text` (Título colaborativo com edição caractere a caractere)
   - `subtitle: Y.Text`
   - `themeId: string`

2. **`doc.getArray('pages')`**:
   - Lista ordenada de `Y.Map`:
     - `id: string` (UUID da página)
     - `pageNumber: number`
     - `pageType: string`
     - `title: Y.Text`
     - `blocks: Y.Array<Y.Map>`

3. **`Y.Map('block')`**:
   - `id: string` (UUID estável do bloco)
   - `type: string`
   - `title: Y.Text`
   - `config: Y.Map`
   - `overrides: Y.Map` (para células e overrides de tabelas)

---

## 3. Resolução de Cenários Concorrentes

| Cenário Concorrente | Comportamento Yjs / CRDT | Resultado Final |
| :--- | :--- | :--- |
| **A edita Bloco 1, B edita Bloco 2** | Operações ocorrem em nós independentes do `Y.Doc`. | Ambos os blocos são atualizados instantaneamente sem conflito. |
| **A e B editam o título do mesmo bloco** | `Y.Text` resolve com inserções/deleções baseadas em Lamport timestamps. | Texto mesclado de forma determinística em ambos os navegadores. |
| **A remove um bloco enquanto B edita o mesmo bloco** | A deleção do nó no `Y.Array` vence ou é descartada conforme regra de tombstone. | O bloco é removido; se B salvar nova alteração, o nó é reinserido ou notificado. |
| **A adiciona Folha 4, B adiciona Folha 4** | `Y.Array.push()` intercala ordenadamente por client ID determinístico. | Ambas as folhas são preservadas (Folha 4 e Folha 5). |

---

## 4. Estratégia de Persistência Híbrida (Debounced Snapshot)

1. **Em tempo real**: Edições são transmitidas via canal Supabase Realtime Broadcast (`broadcast: { event: 'yjs-update' }`) em pacotes binários compactados (`Uint8Array`). Latência típica: 50-150ms.
2. **Presença em tempo real**: Supabase Presence sincroniza quem está online, em qual folha está trabalhando e qual bloco está focado.
3. **Persistência no PostgreSQL**: Um debounced snapshot (e.g. 1000ms de inatividade ou no botão manual) converte o `Y.Doc` para o formato canônico `Catalog` e executa a RPC `save_catalog_v3` no banco relacional para persistência de longo prazo e geração de PDFs.

---

## 5. Próximos Passos (Fase 2)
1. Instalação das dependências oficiais: `yjs` e `y-indexeddb`.
2. Criação do provedor `SupabaseYjsProvider` integrado ao canal `catalogs:<catalog_id>`.
3. Conexão do `useCatalogStore` com o `Y.Doc` mantendo compatibilidade com os seletores React existentes.

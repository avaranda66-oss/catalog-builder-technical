# PRESYS COLLABORATION ENGINE — ARCHITECTURAL DESIGN NOTE
**Status:** Proposta de Engenharia para Fase 2 (Alvo Colaborativo Futuro)  
**Objetivo:** Evoluir o PRESYS Catalog Studio de um modelo de "Documento Integral JSON" para um motor de **Coedição Granular Concorrente (CRDT / Yjs)**.

---

## 1. Visão Geral e Motivação

Atualmente, o catálogo é persistido como um único documento estruturado (árvore de páginas e blocos em JSONB no PostgreSQL) protegido por controle de versão otimista (**CAS**). Embora o CAS previna colisões silenciosas, ele adota uma semântica de *document-level lock*: quem salva primeiro valida a versão, e o segundo participante deve recarregar ou forçar envio.

O **PRESYS Collaboration Engine** tem como meta habilitar a experiência colaborativa estilo *Figma / Google Docs*, onde engenheiros e redatores técnicos (ex.: Gabriel e Marc) possam trabalhar no mesmo catálogo técnico simultaneamente sem que um sobrescreva ou bloqueie o trabalho do outro.

---

## 2. Níveis de Colaboração

```
┌─────────────────────────────────────────────────────────────┐
│                   PRESYS CATALOG STUDIO                     │
│  [TA-35N Datasheet]       🟢 Gabriel (Pág 1)  🔵 Marc (Pág 2)│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Página 1 (Capa / Hero)                                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 🟢 Gabriel editando Título / Subtítulo Comercial      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Página 2 (Tabela Metrológica)                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 🔵 Marc editando Faixa de Temperatura e Exatidão     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Nível 1: Presence & Awareness (Presença em Tempo Real)
- **Mecanismo:** Supabase Realtime Presence (`channel.track({ user, activePage, activeBlock, cursor })`).
- **Comportamento Visual:**
  - Avatares no cabeçalho indicando quais colaboradores estão com o catálogo aberto.
  - Indicador de foco nos blocos (bordas coloridas com badge do colaborador que está com o cursor ativo).

### Nível 2: Edição Granular por Elemento (Block-Level Independence)
- Mutações em blocos distintos (ex.: Gabriel altera o Hero na Página 1 e Marc altera a Tabela de Especificações na Página 2) são transmitidas como **deltas operacionais independentes**.
- Nenhuma operação sobre o Bloco A substitui ou afeta os dados do Bloco B.

### Nível 3: Coedição Concorrente no Mesmo Elemento (CRDT / Yjs)
- Quando dois usuários editam simultaneamente o mesmo texto ou célula de tabela:
  - O **Yjs** resolve a convergência matemática através de tipos de dados replicados livres de conflito (**CRDT**).
  - Sem perdas de caracteres ou reversões de estado.

---

## 3. Arquitetura de Componentes

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CAMADA DE CLIENTE                             │
│                                                                         │
│   ┌────────────────────┐   ┌────────────────────────────────────────┐  │
│   │    React 18 UI     │   │              Zustand Store             │  │
│   │ (Editor / Canvas)  │◄──┤ (UI State: Zoom, Modais, Seleção Local)│  │
│   └─────────┬──────────┘   └────────────────────────────────────────┘  │
│             │                                                           │
│             ▼                                                           │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                      Yjs Shared Document (Y.Doc)                │  │
│   │  • yCatalog: Y.Map (id, themeId)                                │  │
│   │  • yPages: Y.Array<Y.Map> (páginas estruturadas)                │  │
│   │  • yBlocks: Y.Map<Y.Map> (blocos independentes com Y.Text)      │  │
│   └────────────────────────┬────────────────────────────────────────┘  │
└────────────────────────────┼────────────────────────────────────────────┘
                             │
                             ▼ WebSockets (Broadcast / Presence)
┌─────────────────────────────────────────────────────────────────────────┐
│                      SUPABASE REALTIME ENGINE                           │
│  • Canal de Broadcast: Transmissão de updates binários Yjs (Uint8Array) │
│  • Canal de Presence: Estado de cursores e blocos selecionados          │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼ Debounced Persist (ex.: 2s de inatividade)
┌─────────────────────────────────────────────────────────────────────────┐
│                     SUPABASE CLOUD POSTGRESQL                           │
│  • Tabela public.catalogs (Snapshot JSON consolidado para leitura/PDF)  │
│  • Tabela public.catalog_versions (Histórico de auditoria / reversões)  │
│  • RPCs com CAS e RLS para transações oficiais                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Estrutura do Documento Yjs

```typescript
// Modelo Conceitual do Y.Doc para o PRESYS Catalog Studio
import * as Y from 'yjs';

export function createCatalogYDoc(catalogId: string): Y.Doc {
  const doc = new Y.Doc({ guid: catalogId });

  // Metadados Globais
  const yMeta = doc.getMap('meta');
  // yMeta.set('title', new Y.Text('TA-25N'));
  // yMeta.set('subtitle', new Y.Text('...'));

  // Lista Ordenada de Páginas
  const yPages = doc.getArray('pages');

  // Mapa Global de Blocos (Chave: blockId)
  const yBlocks = doc.getMap('blocks');

  return doc;
}
```

---

## 5. Plano de Transição Seguro (Zero Risco para o Editor Atual)

1. **Fase Atual (1.2 / 1.3):** Garantir 100% de estabilidade na persistência e na sincronização atômica, eliminando totalmente qualquer possibilidade de reversão de snapshot ou perda de edição local.
2. **Fase 2A (Presence):** Adicionar canal de Presence via Supabase Realtime para visualização de usuários online e foco de página/bloco.
3. **Fase 2B (Yjs Provider):** Implementar provider Yjs conectado ao Supabase Realtime Broadcast para coedição em tempo real de textos e blocos.
4. **Fase 2C (Snapshot Persistence):** Integrar o autosave periódico do estado Yjs consolidado diretamente na tabela `public.catalogs` do PostgreSQL para geração de PDFs e histórico auditável.

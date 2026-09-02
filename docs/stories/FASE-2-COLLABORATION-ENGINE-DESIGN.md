# FASE 2 — ARCHITECTURAL DESIGN: REALTIME COLLABORATION & AWARENESS ENGINE

**Projeto:** PRESYS Catalog Studio  
**Data:** 02/09/2026  
**Status:** PROPOSTA ARQUITETURAL MODULAR (Fases 2A, 2B, 2C, 2D)

---

## 1. Visão Geral e Estratégia de Entrega Incremental

A implementação de colaboração em tempo real no PRESYS Catalog Studio é dividida em 4 marcos progressivos para garantir estabilidade, clareza diagnóstica e zero regressão:

```text
┌──────────────────────────────────────────────────────────────┐
│ FASE 2A: Presence & Collaborator Awareness (Atual)           │
│  - Supabase Realtime Presence por catálogo                   │
│  - Visualização de colaboradores online, página e bloco ativo│
│  - Zero alteração no JSON do catálogo, zero salvamento no BD │
└──────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ FASE 2B: Soft Locking & Awareness Refinado                   │
│  - Indicadores visuais de edição ("Marcos editando")         │
│  - Soft warning não bloqueante de edição concorrente         │
│  - Detecção automática de inatividade (editing -> viewing)   │
└──────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ FASE 2C: Granular CRDT Collaboration (Yjs + Broadcast)       │
│  - Y.Doc desacoplado para nós de páginas, blocos e células   │
│  - Supabase Realtime Broadcast de deltas binários            │
│  - Mesclagem determinística de edições concorrentes          │
└──────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ FASE 2D: Snapshot Persistence & Hybrid Authority             │
│  - Debounced Snapshot no PostgreSQL (save_catalog_v3)        │
│  - Histórico de revisões e auditoria de autoria              │
│  - PDF A4 rasterizado em alta resolução (com export canônico)│
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Fase 2A: Presence & Awareness (Sem Yjs, Sem Modificação de Conteúdo)

### 2.1 Princípios Fundamentais
- **Canal Dedicado**: `catalog-presence:<catalogId>` (isolado do canal global de banco).
- **Chave de Presença por Sessão**: `${userId}:${clientInstanceId}`, permitindo que o mesmo usuário em dois navegadores/abas opere como duas sessões distintas sem sobreposição.
- **Invariante Crítico**: Presence **NÃO** chama `saveCurrentCatalog()`, **NÃO** chama `save_catalog_v3`, **NÃO** incrementa `catalog.version` e **NÃO** altera o estado de persistência.
- **Estado Efêmero**: Dados de presença residem na memória (`usePresenceStore`) e no cluster Realtime do Supabase.

### 2.2 Estrutura da Sessão do Participante (`ParticipantSession`)
```typescript
export interface ParticipantSession {
  presenceKey: string;
  userId: string;
  clientInstanceId: string;
  displayLabel: string;
  catalogId: string;
  pageId?: string;
  pageNumber?: number;
  blockId?: string | null;
  blockType?: string | null;
  activity: 'viewing' | 'editing';
  lastInteractionAt: string;
  color: string;
}
```

---

## 3. Fase 2C: Motor CRDT (Yjs) — Planejamento Futuro

Quando aprovada a Fase 2A e 2B, o modelo de dados compartilhado será mapeado em `Y.Doc`:
- `Y.Map("catalogMetadata")`
- `Y.Array("pages")` -> `Y.Map("page")`
- `Y.Array("blocks")` -> `Y.Map("block")` -> `Y.Text("title")`

---

## 4. Esclarecimento sobre Geração e Exportação de PDF

> **Nota Técnica de Nomenclatura:**  
> O método atual `PDFService.exportToPDF()` utiliza o pipeline `html2canvas → Canvas DOM → PNG → jsPDF.addImage()`.  
> Portanto, trata-se de um **PDF A4 rasterizado em alta resolução** (e não de um PDF vetorial nativo).  
> A refatoração para um motor de renderização vetorial nativo está planejada para uma fase subsequente de infraestrutura de exportação.

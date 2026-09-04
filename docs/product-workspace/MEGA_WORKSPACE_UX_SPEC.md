# MEGA PRODUCT WORKSPACE — UX SPECIFICATION
**Document ID:** DOC-PIM-MEGA-WORKSPACE-UX-SPEC-V1  
**Mission:** PIM.MEGA.WORKSPACE.UX1  
**Target Product:** Presys Calibration Instruments (Pilot: TA-25N Dry Block Calibrator)  
**Author:** Agent 2 (Senior Product Designer + Senior UX Engineer + Design Systems Architect)  
**Status:** Approved & Implemented in UX Lab (`src/labs/product-workspace-ux/`)

---

## 1. Executive Summary & Mental Model

### 1.1 The Problem
Historical technical catalog software and PIM systems force complex engineering data into flat, uniform card grids or rigid relational tables. For complex industrial equipment such as the **Presys TA-25N Dry Block Temperature Calibrator** (~129 effective facts across metrology, sensors, construction, electrical inputs, accessories, and conflicts):
- Card-based layouts collapse under density (e.g. 19+ electrical sensor ranges produce unusable scrolling walls of badges).
- Relational spreadsheets expose cryptographic IDs, datum UUIDs, CAS hashes, and raw database mechanics that alienate engineers and technical product specialists.
- Users hesitate to reorganize data for fear of destroying underlying catalog specifications.

### 1.2 The Paradigm: Human-First Editorial Structured Grid
The **Mega Product Workspace** bridges industrial depth with consumer-grade software calmness (inspired by Notion + Airtable + Linear + Industrial PIM).
- **Not a Freeform Canvas (Figma):** Layouts must never rely on absolute `x`, `y`, `width px`, `height px`. Instead, content lives in an **Editorial Structured Grid** with responsive conceptual block sizing (`small`, `medium`, `large`, `full`).
- **Data vs. Presentation Decoupling:** Reorganizing a section, resizing a block, or hiding a specification never alters the underlying canonical product datum.
- **Progressive Disclosure:** Essential information is visible in 0–1 click. Advanced technical identities (canonical keys, aliases, audit trails) remain accessible within secondary drawers without polluting daily workflows.

---

## 2. Navigation Architecture

### 2.1 Dual-Pane Layout (Desktop) & Collapsible Rail (Mobile)
1. **Sticky Navigation Rail (Desktop - Left 64):**
   - Renders the product section outline with real-time fact and item counters.
   - Smooth-scrolls to the target section on click.
   - Highlights the active section based on scroll spy / viewport intersection.
   - Offers top-level actions: **"Recolher todas"** / **"Expandir todas"** to manage visual density across long products.
2. **Mobile Quick Selector:**
   - Horizontally scrollable capsule navigation bar fixed below the workspace header on viewports `< 768px`.
   - Touch-friendly tap targets (minimum 44px height).

### 2.2 Global Product Search (`Buscar neste produto...`)
- Real-time search indexing all facets of the product:
  - Technical facts (labels, values, units);
  - Mega table sensor rows (RTD, Thermocouples, mA, mV);
  - Verified source documents (codes, titles, manuals);
  - Canonical semantic keys and aliases (e.g. searching "Pt100" or "estabilidade" finds canonical targets).
- Dropdown categorizes matches by kind (`[Fato]`, `[Sensor]`, `[Documento]`, `[Alias]`) with direct click-to-scroll focus.

---

## 3. View Mode vs. Edit Workspace Mode

A primary cognitive barrier in technical workspaces is visual noise from persistent edit controls (drag handles, delete buttons, drop zones).

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        MODO DE VISUALIZAÇÃO                            │
│                                                                        │
│  [Visualização Padrão]     [ ✨ Organizar ]  [ + Adicionar ]  [✎ Editar]│
└────────────────────────────────────────────────────────────────────────┘
                                    │
                       clique em [ ✎ Organizar Workspace ]
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        MODO DE ORGANIZAÇÃO                             │
│                                                                        │
│  ⠿ Seção: Metrologia   [ ⇡ Subir ] [ ⇣ Descer ] [ Renomear ] [ + Bloco ]│
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ ⠿ Bloco: Especificações   [ Tam: Médio ▼ ] [ Ocultar ] [ Remover ] │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                              [ Concluir Organização ]  │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Clean Read Mode (Default):**
   - Zero visual clutter.
   - Clean typography, high contrast, discrete source affordances (`[Fonte: EM0291-04 · pág. 5]`).
   - Clicking a fact value opens the **Edit Fact Modal** directly.
2. **Edit Workspace Mode:**
   - Activated via `[Organizar Workspace]`.
   - Subtle dashed structural borders and drag-affordance handles (`⠿`).
   - Section controls: Move Up (`⇡`), Move Down (`⇣`), Inline Title Rename (`✎`), Add Block (`+`).
   - Block controls: Conceptual size dropdown (`Pequeno (1/3)`, `Médio (1/2)`, `Grande (2/3)`, `Largura Total (Full)`), Hide (`👁`), Remove (`✕`).

---

## 4. Block & Table Taxonomy

### 4.1 Block Sizing Rules
To prevent layout degradation under varying translations, dynamic data, or viewports:
- `small` (col-span-1 / 33% width on large screens): Ideal for high-level KPIs, single metric cards.
- `medium` (col-span-2 / 50% width): Ideal for compact key-value fact grids (5–12 facts).
- `large` (col-span-2 / 66% width): Ideal for complex multi-column feature comparisons.
- `full` (col-span-3 / 100% width): Mandatory for Mega Tables, document registers, and side-by-side conflict comparisons.

### 4.2 Density Rules
- **1–4 facts:** Hero Highlights Card (large typography, bold value, muted unit, discrete source icon).
- **5–12 facts:** Compact Key-Value Grid (two-column row layout with subtle border separation).
- **13+ facts / Tabular:** Dedicated Table with sticky header and column sorting.
- **Long text:** Markdown Narrative Block.
- **Documents & Manuals:** Verified Document Cards with verification badges and page deep-links.

### 4.3 Mega Table Taxonomy
Engineered specifically for dense industrial matrices (e.g. Presys sensor inputs):
1. **Sticky Header:** Retains column names (`Tipo / Sensor`, `Faixa de Trabalho`, `Resolução`, `Exatidão`, `Conexão / Norma`, `Fonte`) during vertical scrolling.
2. **Row Grouping:** Visually segregates categories (e.g. *Termorresistências (RTD)*, *Termopares (IEC / NIST)*, *Sinais Elétricos e Instrumentação*) with distinct background headers and item tallies.
3. **Density Switcher:**
   - `Compacta`: 28px row height, 11px typography — maximum data per viewport.
   - `Normal`: 40px row height, 13px typography — default balanced view.
   - `Confortável`: 52px row height, 14px typography — relaxed touchscreen review.
4. **In-Table Filter & Search:** Instantly isolates rows without collapsing group context.
5. **Column Visibility Control:** Dropdown to show/hide optional columns (e.g. standard norms, auxiliary connections).
6. **Expanded / Fullscreen View:** Expands table into a high-focus overlay with sticky pagination and maximum horizontal width.

---

## 5. Source, Provenance & Family Inheritance UX

### 5.1 Discrete Source Affordance
Every datum tied to an engineering manual displays a discreet document tag or icon:
- Hover: Tooltip displays document code, revision, and exact page (`EM0291-04 · pág. 5`).
- Click: Opens the **Source Drawer** slide-over.

### 5.2 Source Drawer Content
- **Header:** Document title and official reference code (`Manual Técnico de Operação e Calibração — EM0291-04`).
- **Location:** Specific page number (`Página 5, Seção 2.1 — Especificações Técnicas`).
- **Excerpt:** Exact quotation from the manual verifying the specification.
- **Verification Status:** `Verificado por Engenharia` (Green badge).
- **Actions:** `[Abrir Documento PDF]` and `[Ver Todas as 84 Informações Deste Manual]`.
- **Audit Details (Collapsible):** Ingestion timestamp, extraction confidence, and document checksum (relegated to secondary disclosure).

### 5.3 Family Inheritance Without "Override" Jargon
When a fact is inherited from a product family (e.g. `Linha TA`):
- Clean view: Displays normal value with a discreet subtle indicator (`Linha TA`).
- On Edit Fact: Presents an intuitive choice dialog:
  - `(•) Alterar somente neste modelo (TA-25N)` — creates a model-specific specification without breaking family rules.
  - `( ) Alterar em todos os modelos desta linha (TA-25N, TA-35N, TA-50N)` — updates parent family specification.
  - **No technical jargon:** Terms like *override*, *CAS hash*, *polymorphic inheritance*, or *datum UUID* are strictly forbidden from user-facing copy.

---

## 6. Conflict Resolution UX

When ingested manuals contain conflicting specifications (e.g. Manual PT reports 140 °C vs. Manual EN reports 155 °C):
1. **Isolated Alert Section:** Highlighted under `⚠ Revisões Necessárias` at the bottom or top of the workspace.
2. **Side-by-Side Comparison Card:**
   - Value A: `140 °C` — Manual PT (EM0291-04, pág. 5).
   - Value B: `155 °C` — Manual EN (EM0314-01, pág. 5).
3. **Reconciliation Modal (`[Revisar Divergência]`):**
   - Provides one-click selection: `[Manter 140 °C]`, `[Adotar 155 °C]`, or `[Digitar Valor Corrigido]`.
   - Optional justification field (`"Especificação corrigida conforme boletim de engenharia rev. 04"`).
   - Resolving removes the alert and immediately unifies the product workspace.

---

## 7. Semantic Identity & Safe Rename UX

Future-proof PIM architectures require semantic keys (`semanticKey`) for cross-catalog aggregation and AI query routing.

### 7.1 Simple vs. Advanced Mode
- **Simple Mode (Default):** The user only sees and edits the human label (`Nome: Estabilidade Térmica`).
- **Advanced Mode (Expandable Accordion):**
  - Displays canonical key (`temperature.stability`).
  - Lists registered aliases (`estabilidade`, `thermal stability`, `estabilidade da temperatura`).
  - Allows adding aliases inline (`[+ Adicionar Alias]`).

### 7.2 Safe Semantic Rename Workflow
When renaming a canonical key (e.g. `temperature.stability` → `thermal.stability`):
1. User enters the proposed key and clicks `[Renomear com Segurança]`.
2. **Impact Preview Dialog:**
   - Displays blast-radius analysis:
     - `3 produtos afetados`
     - `2 tabelas vinculadas`
     - `1 visualização ativa`
     - `4 referências de catálogo`
   - Informs: *"A chave antiga continuará funcionando como alias de compatibilidade sem quebrar catálogos legados."*
3. On confirmation, the key is updated while preserving old keys as backward-compatible aliases.

---

## 8. AI Organization & Smart Ingestion UX

### 8.1 "Organizar Automaticamente" (Layout Optimization)
- **Clear User Expectation:** AI optimizes *layout and grouping*, never mutates, fabricates, or removes technical data.
- **Before / After Preview Modal:**
  - `+ 2 seções criadas` (e.g. separating Electrical Inputs from Metrology)
  - `+ 1 mega tabela estruturada` (19 sensor rows transformed from scattered cards)
  - `12 cartões agrupados em grade compacta`
  - `0 informações removidas` (100% data preservation guarantee)
- User confirms with `[Aplicar Organização]` or cancels safely.

### 8.2 AI Document Ingestion Preview
- Upon uploading a technical PDF:
  - System extracts facts, tables, and schematics.
  - Presents discovery summary: `84 especificações encontradas`, `3 tabelas estruturadas`, `7 recursos`, `2 possíveis divergências`.
  - Displays suggested destination sections with confidence indicators (`98% Alta`, `85% Média`).
  - User can review and uncheck individual items before batch applying.

---

## 9. Delete vs. Hide Distinction & Undo Architecture

1. **Ocultar desta Visualização (`Hide`):**
   - Removes the block or fact from the active catalog view/sheet.
   - Retains the datum in the product knowledge base.
   - Reversible anytime via the `[Gerenciar Informações Ocultas]` tray.
2. **Excluir Informação Técnica (`Delete`):**
   - High-friction destructive action requiring explicit confirmation modal.
   - Warns if the fact is shared by other models or catalogs.
3. **In-Memory Undo Architecture:**
   - Every layout operation (move section, move block, resize, rename, hide, AI organize) pushes a snapshot onto an undo stack.
   - An interactive toast appears: `"Organização atualizada · [Desfazer]"`.
   - Clicking `[Desfazer]` instantly restores previous workspace layout.

---

## 10. The Father Test: Validation & Click Metrics

The defining benchmark for this UX: **Can an experienced industrial instrumentation specialist (e.g. a senior Presys engineer without web software expertise) perform all essential operations effortlessly?**

| # | User Scenario | Target Metric | Achieved Metric | Status |
|---|---------------|---------------|-----------------|--------|
| 1 | "Quero descobrir a faixa do TA-25N" | 0–1 clicks | **0 clicks** (Hero Highlight) | **PASS** |
| 2 | "Quero saber a exatidão" | 0–1 clicks | **0 clicks** (Hero Highlight) | **PASS** |
| 3 | "Quero ver todos os sensores" | ≤ 2 clicks | **1 click** (Nav to Entradas e Sensores) | **PASS** |
| 4 | "Quero achar Pt100" | 1 search | **1 search** (Global or in-table filter) | **PASS** |
| 5 | "Quero alterar o peso" | ≤ 2 clicks | **1 click** (Direct click on fact card) | **PASS** |
| 6 | "Quero descobrir de qual manual veio a faixa" | 1 click | **1 click** (Click source tag on fact) | **PASS** |
| 7 | "Quero adicionar uma informação" | ≤ 2 clicks | **1 click** (`[+ Adicionar]` → `Informação`) | **PASS** |
| 8 | "Quero criar uma tabela" | ≤ 2 clicks | **1 click** (`[+ Adicionar]` → `Tabela`) | **PASS** |
| 9 | "Quero mudar o nome de uma seção" | ≤ 2 actions | **2 actions** (`[Editar]` → inline edit) | **PASS** |
| 10 | "Quero mover a tabela para cima" | ≤ 2 actions | **2 actions** (`[Editar]` → click `⇡ Subir`) | **PASS** |
| 11 | "Existem duas fontes conflitantes; consigo perceber que o sistema não sabe qual é verdadeira?" | 1 click | **1 click** (Abre `SourceDrawer` com alerta de divergência e neutralidade) | **PASS** |
| 12 | "Quero esconder Peso do Resumo sem apagar Peso do produto." | ≤ 2 clicks | **1 click** (Clique no ícone de visibilidade sem exclusão de dados) | **PASS** |
| 13 | "Quero mudar o nome visual Estabilidade sem alterar a identidade técnica." | ≤ 2 clicks | **2 clicks** (Altera displayLabel preservando canonicalKey) | **PASS** |

---

## 11. Conclusion & Next Phase Integration

The UX Lab in `src/labs/product-workspace-ux/` demonstrates that industrial-grade density can coexist with visual elegance, human calmness, and strict data safety. With the interaction contract and type maps formalised, the interface is ready to be bound to Agent 1's domain foundation in `PIM.MEGA.WORKSPACE.INTEGRATION1`.

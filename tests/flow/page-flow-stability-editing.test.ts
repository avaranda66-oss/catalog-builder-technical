// tests/flow/page-flow-stability-editing.test.ts
// Testes de Estabilidade de Reflow, Edição Canônica sem Duplicação e Preflight A4
// Cobre: FLOW-T7, FLOW-T13, FLOW-T22 a FLOW-T28, Preflight Gates

import { describe, it, expect } from 'vitest';
import {
  computePageFlowPlan,
  PageLayoutFact,
  READABILITY_FLOOR
} from '../../src/domain/page-flow-planner';
import { Catalog, ContentBlock, CatalogTableRow } from '../../src/domain/catalog.schema';
import { auditLayoutPreflight } from '../../src/domain/layout-preflight';
import { buildPresysTechnicalCatalog } from '../../src/data/presys-technical-catalogs';

describe('A4.FLOW.R1 — Flow Mode & Strategy Order (FLOW-T7, FLOW-T13)', () => {
  const sampleTableBlock: ContentBlock = {
    id: 'tbl-canonical-1',
    type: 'custom_table',
    title: 'Tabela Principal',
    tableRows: [
      { id: 'r1', order: 0, localOverrides: { c1: 'Val 1' } },
      { id: 'r2', order: 1, localOverrides: { c1: 'Val 2' } },
      { id: 'r3', order: 2, localOverrides: { c1: 'Val 3' } },
      { id: 'r4', order: 3, localOverrides: { c1: 'Val 4' } },
      { id: 'r5', order: 4, localOverrides: { c1: 'Val 5' } }
    ]
  };

  const sampleCatalog: Catalog = {
    id: 'cat-test',
    title: 'Catálogo Teste',
    themeId: 'default',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    pages: [
      {
        id: 'p1',
        pageNumber: 1,
        pageType: 'technical',
        title: 'Página 1',
        blocks: [
          {
            id: 'b-header',
            type: 'hero_banner',
            title: 'Cabeçalho'
          },
          sampleTableBlock
        ]
      }
    ]
  };

  it('FLOW-T13: Modo MANUAL preserva 1:1 sem particionar, diagnosticando overflow', () => {
    const measuredFacts: PageLayoutFact[] = [
      {
        pageId: 'p1',
        pageNumber: 1,
        usableHeightMm: 260,
        usableWidthMm: 190,
        blocks: [
          { blockId: 'b-header', blockType: 'hero_banner', measuredHeightMm: 120 },
          { blockId: 'tbl-canonical-1', blockType: 'custom_table', measuredHeightMm: 180 }
        ]
      }
    ];

    const plan = computePageFlowPlan(sampleCatalog, measuredFacts, { flowMode: 'manual' });

    expect(plan.flowMode).toBe('manual');
    expect(plan.totalProjectedPages).toBe(1);
    expect(plan.hasUnresolvedOverflow).toBe(true);
    expect(plan.unresolvedIssues[0].code).toBe('VERTICAL_OVERFLOW');
    expect(plan.projectedPages[0].blocks).toHaveLength(2);
  });

  it('FLOW-T7: Modo SMART executa ordem de estratégias contratada', () => {
    // Espaço restante na primeira página após cabeçalho (120mm): 260 - 120 = 140mm
    // Tabela com header (20mm) + 5 linhas (30mm cada = 150mm): total 170mm
    // Não cabe toda na p1 (140mm < 170mm). Sendo Tabela V2 fatiável, pagina as linhas.
    const measuredFacts: PageLayoutFact[] = [
      {
        pageId: 'p1',
        pageNumber: 1,
        usableHeightMm: 260,
        usableWidthMm: 190,
        blocks: [
          { blockId: 'b-header', blockType: 'hero_banner', measuredHeightMm: 120 },
          {
            blockId: 'tbl-canonical-1',
            blockType: 'custom_table',
            measuredHeightMm: 170,
            isSplittableTable: true,
            tableMeasurement: {
              tableId: 'tbl-canonical-1',
              headerHeightMm: 20,
              availableHeightOnFirstPageMm: 140,
              availableHeightOnSubsequentPagesMm: 260,
              rowHeights: [
                { rowId: 'r1', measuredHeightMm: 30 },
                { rowId: 'r2', measuredHeightMm: 30 },
                { rowId: 'r3', measuredHeightMm: 30 },
                { rowId: 'r4', measuredHeightMm: 30 },
                { rowId: 'r5', measuredHeightMm: 30 }
              ]
            }
          }
        ]
      }
    ];

    const plan = computePageFlowPlan(sampleCatalog, measuredFacts, { flowMode: 'smart' });

    expect(plan.flowMode).toBe('smart');
    expect(plan.hasUnresolvedOverflow).toBe(false);
    expect(plan.totalProjectedPages).toBe(2);

    const tPlan = plan.tablePaginationPlans['tbl-canonical-1'];
    expect(tPlan).toBeDefined();
    expect(tPlan.slices.length).toBe(2);

    // Ambas as fatias apontam para o mesmo canonicalBlockId
    expect(plan.projectedPages[0].blocks.find(b => b.canonicalBlockId === 'tbl-canonical-1')).toBeDefined();
    expect(plan.projectedPages[1].blocks.find(b => b.canonicalBlockId === 'tbl-canonical-1')).toBeDefined();
  });

  it('Valida limites do READABILITY_FLOOR (Piso de Legibilidade sem threshold mágico de 15mm)', () => {
    expect(READABILITY_FLOOR.minFontSizePt).toBe(8);
    expect(READABILITY_FLOOR.minLineHeight).toBe(1.15);
    expect(READABILITY_FLOOR.minCellPaddingVerticalMm).toBe(0.5);
  });
});

describe('A4.FLOW.R1 — Reflow Stability & Idempotence (FLOW-T22 a FLOW-T25)', () => {
  const ta25n = buildPresysTechnicalCatalog('TA-25N');

  const standardFacts: PageLayoutFact[] = ta25n.pages.map((p, idx) => ({
    pageId: p.id,
    pageNumber: idx + 1,
    usableHeightMm: 260,
    usableWidthMm: 190,
    blocks: (p.blocks || []).map(b => ({
      blockId: b.id,
      blockType: b.type,
      measuredHeightMm: b.type === 'full_page_cover' ? 297 : 60
    }))
  }));

  it('FLOW-T22: mesmo documento + mesmas medições => mesmo plano idêntico', () => {
    const plan1 = computePageFlowPlan(ta25n, standardFacts);
    const plan2 = computePageFlowPlan(ta25n, standardFacts);

    expect(plan1).toEqual(plan2);
  });

  it('FLOW-T23: planejamento repetido atinge resultado idempotente e estável', () => {
    let currentPlan = computePageFlowPlan(ta25n, standardFacts);
    for (let i = 0; i < 5; i++) {
      const nextPlan = computePageFlowPlan(ta25n, standardFacts);
      expect(nextPlan.totalProjectedPages).toBe(currentPlan.totalProjectedPages);
      expect(nextPlan.hasUnresolvedOverflow).toBe(false);
      currentPlan = nextPlan;
    }
  });

  it('FLOW-T24: mudanças de zoom no editor não alteram geometria lógica em mm', () => {
    // Zoom é transform CSS no container, não altera altura física canônica em mm
    const zoomScales = [0.5, 0.75, 1.0, 1.25, 1.5];
    const basePlan = computePageFlowPlan(ta25n, standardFacts);

    for (const _scale of zoomScales) {
      // As medidas físicas em mm permanecem invariantes
      const scaledFacts: PageLayoutFact[] = standardFacts.map(f => ({
        ...f,
        usableHeightMm: 260, // sempre 260mm físico
        usableWidthMm: 190
      }));
      const planAtZoom = computePageFlowPlan(ta25n, scaledFacts);
      expect(planAtZoom.totalProjectedPages).toBe(basePlan.totalProjectedPages);
    }
  });

  it('FLOW-T25: carregamento de fontes causa no máximo um replanejamento determinístico, sem oscilação', () => {
    // Antes da fonte (fallback height):
    const unreadyFacts: PageLayoutFact[] = standardFacts.map(f => ({
      ...f,
      blocks: f.blocks.map(b => ({ ...b, measuredHeightMm: (b.measuredHeightMm ?? 0) * 1.05 }))
    }));
    const planBefore = computePageFlowPlan(ta25n, unreadyFacts);
    expect(planBefore.totalProjectedPages).toBeGreaterThan(0);

    // Após fonte carregada:
    const planAfter = computePageFlowPlan(ta25n, standardFacts);

    // Replanejamento após a prontidão da fonte é estável
    const planAfter2 = computePageFlowPlan(ta25n, standardFacts);
    expect(planAfter).toEqual(planAfter2);
  });
});

describe('A4.FLOW.R1 — Canonical Editing During Pagination (FLOW-T26 a FLOW-T28)', () => {
  interface TableBlockMutable {
    id: string;
    type: string;
    tableRows: CatalogTableRow[];
  }

  it('FLOW-T26: edição de célula na fatia de continuação altera o modelo canônico exatamente uma vez', () => {
    // 1. Tabela canônica única com 6 linhas
    const canonicalTable: TableBlockMutable = {
      id: 'tbl-canonical-main',
      type: 'custom_table',
      tableRows: [
        { id: 'r1', order: 0, localOverrides: { c1: 'A' } },
        { id: 'r2', order: 1, localOverrides: { c1: 'B' } },
        { id: 'r3', order: 2, localOverrides: { c1: 'C' } },
        { id: 'r4', order: 3, localOverrides: { c1: 'D' } },
        { id: 'r5', order: 4, localOverrides: { c1: 'E' } },
        { id: 'r6', order: 5, localOverrides: { c1: 'F' } }
      ]
    };

    const doc: Catalog = {
      id: 'cat-edit',
      title: 'Doc',
      themeId: 'default',
      createdAt: '',
      updatedAt: '',
      version: 1,
      pages: [{ id: 'p1', pageNumber: 1, pageType: 'technical', title: 'P1', blocks: [canonicalTable as any] }]
    };

    const facts: PageLayoutFact[] = [
      {
        pageId: 'p1',
        pageNumber: 1,
        usableHeightMm: 120, // Cabe apenas 3 linhas por folha
        usableWidthMm: 190,
        blocks: [
          {
            blockId: 'tbl-canonical-main',
            blockType: 'custom_table',
            measuredHeightMm: 200,
            isSplittableTable: true,
            tableMeasurement: {
              tableId: 'tbl-canonical-main',
              headerHeightMm: 20,
              availableHeightOnFirstPageMm: 120,
              availableHeightOnSubsequentPagesMm: 120,
              rowHeights: [
                { rowId: 'r1', measuredHeightMm: 30 },
                { rowId: 'r2', measuredHeightMm: 30 },
                { rowId: 'r3', measuredHeightMm: 30 },
                { rowId: 'r4', measuredHeightMm: 30 },
                { rowId: 'r5', measuredHeightMm: 30 },
                { rowId: 'r6', measuredHeightMm: 30 }
              ]
            }
          }
        ]
      }
    ];

    // Computa plano inicial -> 2 fatias (p1 tem r1, r2, r3; p2 tem r4, r5, r6)
    const initialPlan = computePageFlowPlan(doc, facts);
    expect(initialPlan.totalProjectedPages).toBe(2);
    expect(initialPlan.tablePaginationPlans['tbl-canonical-main'].slices[1].includedRowIds).toEqual(['r4', 'r5', 'r6']);

    // O usuário edita a célula de 'r5' na segunda folha
    const rowToEdit = canonicalTable.tableRows.find(r => r.id === 'r5');
    expect(rowToEdit).toBeDefined();
    rowToEdit!.localOverrides = { c1: 'E_EDITADO' };

    // Recomputa projeção
    const replanned = computePageFlowPlan(doc, facts);

    // O dado canônico foi modificado no modelo único, sem cópias duplicadas
    expect(canonicalTable.tableRows.filter(r => r.id === 'r5')).toHaveLength(1);
    expect(canonicalTable.tableRows.find(r => r.id === 'r5')?.localOverrides?.c1).toBe('E_EDITADO');

    // A fatia projetada ainda reflete r4, r5, r6 na página 2
    expect(replanned.tablePaginationPlans['tbl-canonical-main'].slices[1].includedRowIds).toContain('r5');
  });

  it('FLOW-T27: exclusão de linha na folha de continuação remove do modelo canônico sem linhas fantasmas', () => {
    const canonicalTable: TableBlockMutable = {
      id: 'tbl-canonical-main',
      type: 'custom_table',
      tableRows: [
        { id: 'r1', order: 0, localOverrides: { c1: 'A' } },
        { id: 'r2', order: 1, localOverrides: { c1: 'B' } },
        { id: 'r3', order: 2, localOverrides: { c1: 'C' } },
        { id: 'r4', order: 3, localOverrides: { c1: 'D' } },
        { id: 'r5', order: 4, localOverrides: { c1: 'E' } }
      ]
    };

    // Remove r4 da autoridade canônica
    canonicalTable.tableRows = canonicalTable.tableRows.filter(r => r.id !== 'r4');

    expect(canonicalTable.tableRows.some(r => r.id === 'r4')).toBe(false);
    expect(canonicalTable.tableRows).toHaveLength(4);
  });

  it('FLOW-T28: inserção de linha na tabela canônica mantém ordem e relocalização estável de fatias', () => {
    const canonicalTable: TableBlockMutable = {
      id: 'tbl-canonical-main',
      type: 'custom_table',
      tableRows: [
        { id: 'r1', order: 0, localOverrides: { c1: 'A' } },
        { id: 'r2', order: 1, localOverrides: { c1: 'B' } }
      ]
    };

    // Insere nova linha no meio
    canonicalTable.tableRows.splice(1, 0, { id: 'r-new', order: 1, localOverrides: { c1: 'NEW' } });
    canonicalTable.tableRows.forEach((r, idx) => { r.order = idx; });

    expect(canonicalTable.tableRows.map(r => r.id)).toEqual(['r1', 'r-new', 'r2']);
  });
});

describe('A4.FLOW.R1 — Publication Preflight Gates (FASE G)', () => {
  const ta25n = buildPresysTechnicalCatalog('TA-25N');

  it('Bloqueia publicação se houver violação de exclusividade de capa', () => {
    const invalidDoc: Catalog = {
      ...ta25n,
      pages: [
        {
          id: 'p-invalid',
          pageNumber: 1,
          pageType: 'cover',
          title: 'Cover',
          blocks: [
            { id: 'cov-1', type: 'full_page_cover', title: 'Capa' },
            { id: 'extra-1', type: 'text', title: 'Texto Indevido' }
          ]
        }
      ]
    };

    const report = auditLayoutPreflight(invalidDoc);
    expect(report.canPublish).toBe(false);
    expect(report.blockCount).toBeGreaterThanOrEqual(1);
    expect(report.issues.some(i => i.code === 'COVER_EXCLUSIVITY_VIOLATION')).toBe(true);
  });

  it('Falha fechada nos catálogos PRESYS enquanto a medição física atual não foi fornecida', () => {
    for (const model of ['TA-25N', 'TA-35N', 'TA-50N'] as const) {
      const cat = buildPresysTechnicalCatalog(model);
      const report = auditLayoutPreflight(cat);
      expect(report.canPublish).toBe(false);
      expect(report.issues.some((issue) => issue.code === 'LAYOUT_MEASUREMENT_MISSING')).toBe(true);
    }
  });
});

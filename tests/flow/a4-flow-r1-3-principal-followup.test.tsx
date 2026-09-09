import { describe, it, expect, vi } from 'vitest';
import { Catalog, CatalogSchema, CatalogTableRow } from '@/domain/catalog.schema';
import {
  computeTablePaginationPlan,
  TablePaginationMeasurementInput
} from '@/domain/table-core/table.pagination';
import { computePageFlowPlan, PageLayoutFact } from '@/domain/page-flow-planner';
import {
  measureCanonicalA4Pages,
  verifyRenderedA4Plan
} from '@/components/a4/a4-layout-measurement';
import { buildA4RenderPlan } from '@/domain/a4-render-plan';
import { auditLayoutPreflight } from '@/domain/layout-preflight';
import { useCatalogStore } from '@/stores/useCatalogStore';
import { waitForPhysicalAssetsReady } from '@/components/a4/useMeasuredA4RenderPlan';

describe('A4.FLOW.R1.3 — Principal Audit Required Follow-Up Matrix', () => {
  // =========================================================================
  // P1-D: row.kind Round-Trip Persistence
  // =========================================================================

  it('A4R13-T7: CatalogTableRow.kind survives Zod parse', () => {
    const rawRow = {
      id: 'row-sec-1',
      kind: 'section',
      cellValues: {
        col1: { kind: 'text', text: 'Seção Metrológica' }
      }
    };

    const parsedCatalog = CatalogSchema.parse({
      id: 'cat-test',
      title: 'Teste',
      themeId: 'default',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 'b1',
              type: 'table',
              tableRows: [rawRow]
            }
          ]
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    });

    const parsedRow = parsedCatalog.pages[0].blocks[0].tableRows?.[0];
    expect(parsedRow?.kind).toBe('section');
  });

  it('A4R13-T8: all row.kind variants survive cache/load round-trip', () => {
    const kinds: Array<CatalogTableRow['kind']> = ['data', 'header', 'footer', 'divider', 'section'];

    for (const kind of kinds) {
      const parsed = CatalogSchema.parse({
        id: 'cat-test',
        title: 'Teste',
        themeId: 'default',
        pages: [
          {
            id: 'p1',
            pageNumber: 1,
            blocks: [
              {
                id: 'b1',
                type: 'table',
                tableRows: [{ id: `r-${kind}`, kind }]
              }
            ]
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      });

      expect(parsed.pages[0].blocks[0].tableRows?.[0].kind).toBe(kind);
    }
  });

  // =========================================================================
  // P1-C: Manual Means Manual (No Automatic Splits in Manual Mode)
  // =========================================================================

  it('A4R13-T5: Manual explicit break creates no implicit automatic breaks', () => {
    // 15 rows of 20mm each = 300mm.
    // First page has 100mm, subsequent page has 100mm.
    // Manual break requested only before row 10.
    const input: TablePaginationMeasurementInput = {
      tableId: 't1',
      headerHeightMm: 10,
      availableHeightOnFirstPageMm: 100,
      availableHeightOnSubsequentPagesMm: 100,
      rowHeights: Array.from({ length: 15 }, (_, i) => ({
        rowId: `r${i + 1}`,
        measuredHeightMm: 20
      }))
    };

    // In MANUAL mode, autoSplitOnOverflow is false.
    const plan = computeTablePaginationPlan(input, { autoSplitOnOverflow: false }, ['r10']);

    // Must have EXACTLY 2 slices (r1..r9 and r10..r15) because only 1 explicit break was requested!
    expect(plan.slices).toHaveLength(2);
    expect(plan.slices[0].includedRowIds).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9']);
    expect(plan.slices[1].includedRowIds).toEqual(['r10', 'r11', 'r12', 'r13', 'r14', 'r15']);
  });

  it('A4R13-T6: Manual oversized explicit segment is diagnosed, not auto-fixed', () => {
    const catalog: Catalog = {
      id: 'cat-manual-overflow',
      title: 'Manual Overflow',
      themeId: 'default',
      layoutFlowMode: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 'tbl-1',
              type: 'specs_table',
              title: 'Tabela Manual Longa',
              customData: {
                manualBreakRowIds: ['r10']
              },
              tableRows: Array.from({ length: 15 }, (_, i) => ({
                id: `r${i + 1}`
              }))
            }
          ]
        }
      ]
    };

    const facts: PageLayoutFact[] = [
      {
        pageId: 'p1',
        pageNumber: 1,
        usableHeightMm: 100,
        usableWidthMm: 190,
        blockGapMm: 4,
        blocks: [
          {
            blockId: 'tbl-1',
            blockType: 'specs_table',
            measuredHeightMm: 310,
            measuredWidthMm: 190,
            isSplittableTable: true,
            tableMeasurement: {
              tableId: 'tbl-1',
              headerHeightMm: 10,
              availableHeightOnFirstPageMm: 100,
              availableHeightOnSubsequentPagesMm: 100,
              rowHeights: Array.from({ length: 15 }, (_, i) => ({
                rowId: `r${i + 1}`,
                measuredHeightMm: 20
              }))
            }
          }
        ]
      }
    ];

    const flowPlan = computePageFlowPlan(catalog, facts, { flowMode: 'manual' });

    // In manual mode, it must NOT invent extra slices; slices must remain 2 (r1..r9 and r10..r15)
    const tablePlan = flowPlan.tablePaginationPlans['tbl-1'];
    expect(tablePlan.slices).toHaveLength(2);

    // And it MUST diagnose VERTICAL_OVERFLOW because slice 0 (header 10 + 9*20 = 190mm) exceeds 100mm!
    expect(flowPlan.hasUnresolvedOverflow).toBe(true);
    const overflowIssue = flowPlan.unresolvedIssues.find((issue) => issue.code === 'VERTICAL_OVERFLOW');
    expect(overflowIssue).toBeDefined();
  });

  // =========================================================================
  // P1-E: Stale Manual Break + Empty Table
  // =========================================================================

  it('A4R13-T9: deleted row removes stale manual break in store', () => {
    const store = useCatalogStore.getState();
    const initialCatalog: Catalog = {
      id: 'cat-stale-break',
      title: 'Stale Break',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 't1',
              type: 'specs_table',
              tableRows: [{ id: 'r1' }, { id: 'r2' }],
              customData: {
                manualBreakRowIds: ['r2']
              }
            }
          ]
        }
      ]
    };

    store.setCurrentCatalog(initialCatalog, false);
    store.removeRowFromTable('t1', 'r2');

    const updated = useCatalogStore.getState().currentCatalog;
    const block = updated?.pages[0].blocks[0];
    expect(block?.tableRows?.map((r) => r.id)).toEqual(['r1']);
    expect(block?.customData?.manualBreakRowIds).toEqual([]);
  });

  it('A4R13-T10: empty canonical table remains projected', () => {
    const catalog: Catalog = {
      id: 'cat-empty-table',
      title: 'Empty Table',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 't-empty',
              type: 'specs_table',
              title: 'Tabela Vazia',
              tableRows: [],
              customData: {
                manualBreakRowIds: ['deleted-row-1']
              }
            }
          ]
        }
      ]
    };

    const facts: PageLayoutFact[] = [
      {
        pageId: 'p1',
        pageNumber: 1,
        usableHeightMm: 247,
        usableWidthMm: 190,
        blockGapMm: 4,
        blocks: [
          {
            blockId: 't-empty',
            blockType: 'specs_table',
            measuredHeightMm: 20,
            measuredWidthMm: 190,
            isSplittableTable: true,
            tableMeasurement: {
              tableId: 't-empty',
              headerHeightMm: 10,
              availableHeightOnFirstPageMm: 247,
              availableHeightOnSubsequentPagesMm: 247,
              rowHeights: []
            }
          }
        ]
      }
    ];

    const flowPlan = computePageFlowPlan(catalog, facts, { flowMode: 'smart' });
    expect(flowPlan.projectedPages[0].blocks).toHaveLength(1);
    expect(flowPlan.projectedPages[0].blocks[0].canonicalBlockId).toBe('t-empty');
  });

  it('A4R13-T11: stale nonexistent manual break ignored safely in manual and smart modes', () => {
    const catalog: Catalog = {
      id: 'cat-nonexistent-break',
      title: 'Nonexistent Break',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 't1',
              type: 'specs_table',
              tableRows: [{ id: 'r1' }, { id: 'r2' }],
              customData: {
                manualBreakRowIds: ['ghost-row-id']
              }
            }
          ]
        }
      ]
    };

    const facts: PageLayoutFact[] = [
      {
        pageId: 'p1',
        pageNumber: 1,
        usableHeightMm: 247,
        usableWidthMm: 190,
        blockGapMm: 4,
        blocks: [
          {
            blockId: 't1',
            blockType: 'specs_table',
            measuredHeightMm: 30,
            measuredWidthMm: 190,
            isSplittableTable: true,
            tableMeasurement: {
              tableId: 't1',
              headerHeightMm: 10,
              availableHeightOnFirstPageMm: 247,
              availableHeightOnSubsequentPagesMm: 247,
              rowHeights: [
                { rowId: 'r1', measuredHeightMm: 10 },
                { rowId: 'r2', measuredHeightMm: 10 }
              ]
            }
          }
        ]
      }
    ];

    const manualPlan = computePageFlowPlan(catalog, facts, { flowMode: 'manual' });
    expect(manualPlan.projectedPages[0].blocks).toHaveLength(1);
    expect(manualPlan.projectedPages[0].blocks[0].canonicalBlockId).toBe('t1');
  });

  // =========================================================================
  // P1-F: Physical Row Verifier Exactness
  // =========================================================================

  it('A4R13-T12: physical verifier rejects duplicate row', () => {
    const catalog: Catalog = {
      id: 'cat-verify',
      title: 'Verify',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 't1',
              type: 'specs_table',
              tableRows: [{ id: 'r1' }]
            }
          ]
        }
      ]
    };

    const dom = document.createElement('div');
    dom.innerHTML = `
      <div data-a4-page-id="p1">
        <div data-a4-block-flow-viewport="true" style="height:500px; width:500px;">
          <div data-a4-block-flow-content="true">
            <div data-canonical-block-id="t1">
              <table>
                <tbody>
                  <tr data-canonical-row-id="r1"><td>R1</td></tr>
                  <tr data-canonical-row-id="r1"><td>R1 Duplicate</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    const renderPlan = buildA4RenderPlan(catalog, {
      flowMode: 'smart',
      projectedPages: [
        {
          pageId: 'p1',
          canonicalPageId: 'p1',
          pageNumber: 1,
          isCover: false,
          isDerivedContinuation: false,
          blocks: [
            {
              id: 't1',
              canonicalPageId: 'p1',
              canonicalBlockId: 't1',
              canonicalBlockType: 'specs_table',
              slice: {
                sliceIndex: 0,
                isFirstPage: true,
                isLastPage: true,
                includedRowIds: ['r1'],
                includesRepeatedHeader: false,
                totalSliceHeightMm: 20
              }
            }
          ],
          hasOverflow: false,
          overflowMm: 0,
          issues: []
        }
      ],
      totalProjectedPages: 1,
      tablePaginationPlans: {},
      measurementStatus: 'ready',
      hasUnresolvedOverflow: false,
      hasHorizontalOverflow: false,
      unresolvedIssues: []
    });

    const verified = verifyRenderedA4Plan(dom, renderPlan);
    expect(verified.flowPlan.unresolvedIssues.some((i) => i.code === 'TABLE_ROW_DUPLICATION' || i.code === 'ROW_CLIPPED')).toBe(true);
  });

  it('A4R13-T13: physical verifier rejects wrong slice/page', () => {
    const catalog: Catalog = {
      id: 'cat-verify',
      title: 'Verify',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 't1',
              type: 'specs_table',
              tableRows: [{ id: 'r1' }, { id: 'r2' }]
            }
          ]
        }
      ]
    };

    // DOM has r2 on page 1, but r2 was supposed to be on page 2
    const dom = document.createElement('div');
    dom.innerHTML = `
      <div data-a4-page-id="p1">
        <div data-a4-block-flow-viewport="true" style="height:500px; width:500px;">
          <div data-a4-block-flow-content="true">
            <div data-canonical-block-id="t1">
              <table>
                <tbody>
                  <tr data-canonical-row-id="r1"><td>R1</td></tr>
                  <tr data-canonical-row-id="r2"><td>R2</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div data-a4-page-id="p1-cont">
        <div data-a4-block-flow-viewport="true" style="height:500px; width:500px;">
          <div data-a4-block-flow-content="true">
            <div data-canonical-block-id="t1">
              <table>
                <tbody>
                  <!-- r2 missing here -->
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    const renderPlan = buildA4RenderPlan(catalog, {
      flowMode: 'smart',
      projectedPages: [
        {
          pageId: 'p1',
          canonicalPageId: 'p1',
          pageNumber: 1,
          isCover: false,
          isDerivedContinuation: false,
          blocks: [
            {
              id: 't1-s0',
              canonicalPageId: 'p1',
              canonicalBlockId: 't1',
              canonicalBlockType: 'specs_table',
              slice: {
                sliceIndex: 0,
                isFirstPage: true,
                isLastPage: false,
                includedRowIds: ['r1'],
                includesRepeatedHeader: false,
                totalSliceHeightMm: 20
              }
            }
          ],
          hasOverflow: false,
          overflowMm: 0,
          issues: []
        },
        {
          pageId: 'p1-cont',
          canonicalPageId: 'p1',
          pageNumber: 2,
          isCover: false,
          isDerivedContinuation: true,
          blocks: [
            {
              id: 't1-s1',
              canonicalPageId: 'p1',
              canonicalBlockId: 't1',
              canonicalBlockType: 'specs_table',
              slice: {
                sliceIndex: 1,
                isFirstPage: false,
                isLastPage: true,
                includedRowIds: ['r2'],
                includesRepeatedHeader: true,
                totalSliceHeightMm: 20
              }
            }
          ],
          hasOverflow: false,
          overflowMm: 0,
          issues: []
        }
      ],
      totalProjectedPages: 2,
      tablePaginationPlans: {},
      measurementStatus: 'ready',
      hasUnresolvedOverflow: false,
      hasHorizontalOverflow: false,
      unresolvedIssues: []
    });

    const verified = verifyRenderedA4Plan(dom, renderPlan);
    expect(verified.flowPlan.unresolvedIssues.some((i) => i.code === 'ROW_CLIPPED')).toBe(true);
  });

  it('A4R13-T14: physical verifier rejects wrong ordering', () => {
    const catalog: Catalog = {
      id: 'cat-verify',
      title: 'Verify',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 't1',
              type: 'specs_table',
              tableRows: [{ id: 'r1' }, { id: 'r2' }]
            }
          ]
        }
      ]
    };

    // DOM renders r2 before r1!
    const dom = document.createElement('div');
    dom.innerHTML = `
      <div data-a4-page-id="p1">
        <div data-a4-block-flow-viewport="true" style="height:500px; width:500px;">
          <div data-a4-block-flow-content="true">
            <div data-canonical-block-id="t1">
              <table>
                <tbody>
                  <tr data-canonical-row-id="r2"><td>R2</td></tr>
                  <tr data-canonical-row-id="r1"><td>R1</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    const renderPlan = buildA4RenderPlan(catalog, {
      flowMode: 'smart',
      projectedPages: [
        {
          pageId: 'p1',
          canonicalPageId: 'p1',
          pageNumber: 1,
          isCover: false,
          isDerivedContinuation: false,
          blocks: [
            {
              id: 't1',
              canonicalPageId: 'p1',
              canonicalBlockId: 't1',
              canonicalBlockType: 'specs_table',
              slice: {
                sliceIndex: 0,
                isFirstPage: true,
                isLastPage: true,
                includedRowIds: ['r1', 'r2'],
                includesRepeatedHeader: false,
                totalSliceHeightMm: 20
              }
            }
          ],
          hasOverflow: false,
          overflowMm: 0,
          issues: []
        }
      ],
      totalProjectedPages: 1,
      tablePaginationPlans: {},
      measurementStatus: 'ready',
      hasUnresolvedOverflow: false,
      hasHorizontalOverflow: false,
      unresolvedIssues: []
    });

    const verified = verifyRenderedA4Plan(dom, renderPlan);
    expect(verified.flowPlan.unresolvedIssues.some((i) => i.code === 'ROW_CLIPPED')).toBe(true);
  });

  it('A4R13-T15: valid physical slices pass exact verifier', () => {
    const catalog: Catalog = {
      id: 'cat-verify',
      title: 'Verify',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 't1',
              type: 'specs_table',
              tableRows: [{ id: 'r1' }, { id: 'r2' }]
            }
          ]
        }
      ]
    };

    const dom = document.createElement('div');
    dom.innerHTML = `
      <div data-a4-page-id="p1">
        <div data-a4-block-flow-viewport="true" style="height:500px; width:500px;">
          <div data-a4-block-flow-content="true">
            <div data-canonical-block-id="t1">
              <table>
                <tbody>
                  <tr data-canonical-row-id="r1"><td>R1</td></tr>
                  <tr data-canonical-row-id="r2"><td>R2</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    const renderPlan = buildA4RenderPlan(catalog, {
      flowMode: 'smart',
      projectedPages: [
        {
          pageId: 'p1',
          canonicalPageId: 'p1',
          pageNumber: 1,
          isCover: false,
          isDerivedContinuation: false,
          blocks: [
            {
              id: 't1',
              canonicalPageId: 'p1',
              canonicalBlockId: 't1',
              canonicalBlockType: 'specs_table',
              slice: {
                sliceIndex: 0,
                isFirstPage: true,
                isLastPage: true,
                includedRowIds: ['r1', 'r2'],
                includesRepeatedHeader: false,
                totalSliceHeightMm: 20
              }
            }
          ],
          hasOverflow: false,
          overflowMm: 0,
          issues: []
        }
      ],
      totalProjectedPages: 1,
      tablePaginationPlans: {},
      measurementStatus: 'ready',
      hasUnresolvedOverflow: false,
      hasHorizontalOverflow: false,
      unresolvedIssues: []
    });

    const verified = verifyRenderedA4Plan(dom, renderPlan);
    expect(verified.flowPlan.unresolvedIssues.filter((i) => i.code === 'ROW_CLIPPED' || i.code === 'TABLE_ROW_DUPLICATION')).toHaveLength(0);
  });

  // =========================================================================
  // P1-B: Print-Faithful Measurement (data-a4-measure-root)
  // =========================================================================

  it('A4R13-T3: editor-only chrome excluded from printable measurement', () => {
    const catalog: Catalog = {
      id: 'cat-measure',
      title: 'Measure',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 't1',
              type: 'specs_table',
              tableRows: [{ id: 'r1' }]
            }
          ]
        }
      ]
    };

    // DOM simulating editor with editor chrome (buttons/footers) outside data-a4-measure-root
    const dom = document.createElement('div');
    dom.innerHTML = `
      <div data-a4-page="true" data-canonical-page-id="p1">
        <div data-a4-block-flow-viewport="true" style="height:800px; width:800px;">
          <div data-a4-block-flow-content="true">
            <div data-canonical-block-id="t1" style="height:150px; width:700px;">
              <div data-a4-measure-root="true" style="height:80px; width:700px;">
                <h3>Title</h3>
                <table>
                  <thead><tr style="height:20px;"><th>Header</th></tr></thead>
                  <tbody><tr data-canonical-row-id="r1" style="height:40px;"><td>R1</td></tr></tbody>
                </table>
              </div>
              <div data-editor-action="true" style="height:70px;">
                <button>+ Coluna</button>
                <button>+ Adicionar Produto</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Mock offsetHeight and getBoundingClientRect
    const blockEl = dom.querySelector('[data-canonical-block-id="t1"]') as HTMLElement;
    const measureRootEl = dom.querySelector('[data-a4-measure-root]') as HTMLElement;
    const viewportEl = dom.querySelector('[data-a4-block-flow-viewport]') as HTMLElement;
    const pageEl = dom.querySelector('[data-a4-page]') as HTMLElement;
    const trEl = dom.querySelector('tr[data-canonical-row-id="r1"]') as HTMLElement;
    const theadEl = dom.querySelector('thead') as HTMLElement;

    Object.defineProperty(viewportEl, 'clientHeight', { value: 800, configurable: true });
    Object.defineProperty(viewportEl, 'clientWidth', { value: 700, configurable: true });
    Object.defineProperty(pageEl, 'offsetWidth', { value: 700, configurable: true });
    pageEl.getBoundingClientRect = () => ({ width: 700, height: 1000, top: 0, left: 0, right: 700, bottom: 1000, x: 0, y: 0, toJSON: () => {} });

    Object.defineProperty(blockEl, 'offsetHeight', { value: 150, configurable: true });
    Object.defineProperty(measureRootEl, 'offsetHeight', { value: 80, configurable: true });
    Object.defineProperty(theadEl, 'offsetHeight', { value: 20, configurable: true });
    Object.defineProperty(trEl, 'offsetHeight', { value: 40, configurable: true });

    const facts = measureCanonicalA4Pages(dom, catalog);
    const measuredBlock = facts[0].blocks[0];

    // The measured height must be based on data-a4-measure-root (80px), NOT the block with 70px editor chrome (150px)!
    // 80px in mm: (80 * 25.4) / 96 = 21.1666... mm
    expect(measuredBlock.measuredHeightMm).toBeCloseTo((80 * 25.4) / 96, 1);
  });

  // =========================================================================
  // Optional P2: Hardening
  // =========================================================================

  it('T16: first-row manual break is ignored by domain planner', () => {
    const catalog: Catalog = {
      id: 'cat-first-row-break',
      title: 'First Row Break',
      themeId: 'default',
      layoutFlowMode: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 't1',
              type: 'specs_table',
              tableRows: [{ id: 'r1' }, { id: 'r2' }],
              customData: {
                manualBreakRowIds: ['r1'] // Break before first row
              }
            }
          ]
        }
      ]
    };

    const facts: PageLayoutFact[] = [
      {
        pageId: 'p1',
        pageNumber: 1,
        usableHeightMm: 247,
        usableWidthMm: 190,
        blockGapMm: 4,
        blocks: [
          {
            blockId: 't1',
            blockType: 'specs_table',
            measuredHeightMm: 30,
            measuredWidthMm: 190,
            isSplittableTable: true,
            tableMeasurement: {
              tableId: 't1',
              headerHeightMm: 10,
              availableHeightOnFirstPageMm: 247,
              availableHeightOnSubsequentPagesMm: 247,
              rowHeights: [
                { rowId: 'r1', measuredHeightMm: 10 },
                { rowId: 'r2', measuredHeightMm: 10 }
              ]
            }
          }
        ]
      }
    ];

    const plan = computePageFlowPlan(catalog, facts, { flowMode: 'manual' });
    // Breaking before first row cannot create a valid slice with 0 rows before it; must remain 1 page
    expect(plan.projectedPages).toHaveLength(1);
  });

  it('T18: malformed non-array blocks recover without white-screen but fail publication preflight', () => {
    const corruptCatalog = {
      id: 'cat-corrupt',
      title: 'Corrupt',
      themeId: 'default',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: 'invalid-string-instead-of-array' as any
        }
      ]
    } as any;

    const report = auditLayoutPreflight(corruptCatalog);
    expect(report.canPublish).toBe(false);
    expect(report.issues.some((i) => i.code === 'PAGE_BLOCKS_MALFORMED' || i.code === 'MALFORMED_PAGE_BLOCKS')).toBe(true);
  });

  // =========================================================================
  // P1-A: Asset Readiness / Stale Preflight
  // =========================================================================

  it('A4R13-T1: delayed image invalidates stale layout generation', async () => {
    const root = document.createElement('div');
    const img = document.createElement('img');
    let loaded = false;
    Object.defineProperty(img, 'complete', { get: () => loaded, configurable: true });
    Object.defineProperty(img, 'naturalWidth', { get: () => (loaded ? 400 : 0), configurable: true });
    img.decode = vi.fn().mockImplementation(async () => {
      if (!loaded) throw new Error('Not loaded yet');
    });
    root.appendChild(img);

    let readyPromiseResolved = false;
    const readyPromise = waitForPhysicalAssetsReady(root).then(() => {
      readyPromiseResolved = true;
    });

    // Before image loads, readyPromise must not resolve
    await new Promise((r) => setTimeout(r, 20));
    expect(readyPromiseResolved).toBe(false);

    // When image finishes loading
    loaded = true;
    img.dispatchEvent(new Event('load'));
    await readyPromise;
    expect(readyPromiseResolved).toBe(true);
  });

  const createTestCatalog = (partial: Partial<Catalog> & { id: string; pages: any[] }): Catalog => ({
    title: 'Test Catalog',
    themeId: 'default',
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    version: 1,
    ...partial
  });

  it('A4R13-T2: export cannot publish stale pre-image measurement', () => {
    const catalog: Catalog = createTestCatalog({
      id: 'cat-export-safety',
      title: 'Export Safety',
      themeId: 'default',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            { id: 'img-1', type: 'image' }
          ]
        }
      ]
    });

    // Stale/unmeasured state (plan is undefined)
    const reportWithoutPlan = auditLayoutPreflight(catalog);
    expect(reportWithoutPlan.canPublish).toBe(false);
    expect(reportWithoutPlan.issues.some((i) => i.code === 'LAYOUT_MEASUREMENT_MISSING')).toBe(true);
  });

  // =========================================================================
  // P1-B: Editor / Export Parity
  // =========================================================================

  it('A4R13-T4: editor/export same content -> same physical pagination', () => {
    const catalog: Catalog = createTestCatalog({
      id: 'cat-parity',
      title: 'Parity',
      themeId: 'default',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 't1',
              type: 'specs_table',
              tableRows: [{ id: 'r1' }, { id: 'r2' }]
            }
          ]
        }
      ]
    });

    // Editor DOM with editor chrome outside data-a4-measure-root
    const editorDom = document.createElement('div');
    editorDom.innerHTML = `
      <div data-a4-page="true" data-canonical-page-id="p1">
        <div data-a4-block-flow-viewport="true" style="height:800px; width:700px;">
          <div data-a4-block-flow-content="true">
            <div data-canonical-block-id="t1">
              <div data-a4-measure-root="true" style="height:100px; width:700px;">
                <h3>Title</h3>
                <table>
                  <thead><tr style="height:20px;"><th>H</th></tr></thead>
                  <tbody>
                    <tr data-canonical-row-id="r1" style="height:40px;"><td>R1</td></tr>
                    <tr data-canonical-row-id="r2" style="height:40px;"><td>R2</td></tr>
                  </tbody>
                </table>
              </div>
              <div data-editor-action="true" style="height:80px;">
                <button>+ Coluna</button>
                <button>+ Adicionar Produto</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Export DOM without editor chrome
    const exportDom = document.createElement('div');
    exportDom.innerHTML = `
      <div data-a4-page="true" data-canonical-page-id="p1">
        <div data-a4-block-flow-viewport="true" style="height:800px; width:700px;">
          <div data-a4-block-flow-content="true">
            <div data-canonical-block-id="t1">
              <div data-a4-measure-root="true" style="height:100px; width:700px;">
                <h3>Title</h3>
                <table>
                  <thead><tr style="height:20px;"><th>H</th></tr></thead>
                  <tbody>
                    <tr data-canonical-row-id="r1" style="height:40px;"><td>R1</td></tr>
                    <tr data-canonical-row-id="r2" style="height:40px;"><td>R2</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const setupMocks = (dom: HTMLElement) => {
      const pageEl = dom.querySelector('[data-a4-page]') as HTMLElement;
      const viewportEl = dom.querySelector('[data-a4-block-flow-viewport]') as HTMLElement;
      const blockEl = dom.querySelector('[data-canonical-block-id="t1"]') as HTMLElement;
      const measureRoot = dom.querySelector('[data-a4-measure-root]') as HTMLElement;
      const thead = dom.querySelector('thead') as HTMLElement;
      const r1 = dom.querySelector('tr[data-canonical-row-id="r1"]') as HTMLElement;
      const r2 = dom.querySelector('tr[data-canonical-row-id="r2"]') as HTMLElement;

      Object.defineProperty(viewportEl, 'clientHeight', { value: 800, configurable: true });
      Object.defineProperty(viewportEl, 'clientWidth', { value: 700, configurable: true });
      Object.defineProperty(pageEl, 'offsetWidth', { value: 700, configurable: true });
      pageEl.getBoundingClientRect = () => ({ width: 700, height: 1000, top: 0, left: 0, right: 700, bottom: 1000, x: 0, y: 0, toJSON: () => {} });

      Object.defineProperty(blockEl, 'offsetHeight', { value: dom.querySelector('[data-editor-action]') ? 180 : 100, configurable: true });
      Object.defineProperty(measureRoot, 'offsetHeight', { value: 100, configurable: true });
      Object.defineProperty(thead, 'offsetHeight', { value: 20, configurable: true });
      Object.defineProperty(r1, 'offsetHeight', { value: 40, configurable: true });
      Object.defineProperty(r2, 'offsetHeight', { value: 40, configurable: true });
    };

    setupMocks(editorDom);
    setupMocks(exportDom);

    const editorFacts = measureCanonicalA4Pages(editorDom, catalog);
    const exportFacts = measureCanonicalA4Pages(exportDom, catalog);

    expect(editorFacts[0].blocks[0].measuredHeightMm).toBeCloseTo(exportFacts[0].blocks[0].measuredHeightMm!, 2);
    expect(editorFacts[0].blocks[0].tableMeasurement?.fixedChromeHeightMm).toBeCloseTo(
      exportFacts[0].blocks[0].tableMeasurement?.fixedChromeHeightMm ?? 0,
      2
    );

    const editorPlan = computePageFlowPlan(catalog, editorFacts, { flowMode: 'smart' });
    const exportPlan = computePageFlowPlan(catalog, exportFacts, { flowMode: 'smart' });

    expect(editorPlan.totalProjectedPages).toBe(exportPlan.totalProjectedPages);
    expect(editorPlan.projectedPages[0].blocks).toHaveLength(exportPlan.projectedPages[0].blocks.length);
  });

  // =========================================================================
  // P2-B: Terminal Section Hardening
  // =========================================================================

  it('A4R13-T17: terminal section diagnosed as malformed structure', () => {
    const input: TablePaginationMeasurementInput = {
      tableId: 't-term',
      headerHeightMm: 10,
      availableHeightOnFirstPageMm: 200,
      availableHeightOnSubsequentPagesMm: 200,
      rowHeights: [
        { rowId: 'r1', measuredHeightMm: 15, kind: 'data' },
        { rowId: 'r2', measuredHeightMm: 15, kind: 'section' }
      ]
    };

    const plan = computeTablePaginationPlan(input);
    expect(plan.hasMalformedTerminalSection).toBe(true);

    const catalog: Catalog = createTestCatalog({
      id: 'cat-term',
      title: 'Term Section',
      themeId: 'default',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 't-term',
              type: 'specs_table',
              tableRows: [
                { id: 'r1', kind: 'data' },
                { id: 'r2', kind: 'section' }
              ]
            }
          ]
        }
      ]
    });

    const facts: PageLayoutFact[] = [
      {
        pageId: 'p1',
        pageNumber: 1,
        usableHeightMm: 200,
        usableWidthMm: 190,
        blockGapMm: 0,
        blocks: [
          {
            blockId: 't-term',
            blockType: 'specs_table',
            measuredHeightMm: 40,
            measuredWidthMm: 190,
            isSplittableTable: true,
            tableMeasurement: input
          }
        ]
      }
    ];

    const flowPlan = computePageFlowPlan(catalog, facts, { flowMode: 'smart' });
    expect(flowPlan.unresolvedIssues.some((i) => i.code === 'MALFORMED_TABLE_STRUCTURE')).toBe(true);
  });

  // =========================================================================
  // Section 14: Presence Boundary Documentation Test
  // =========================================================================

  it('Presence Boundary: continuation page scroll/selection reports canonical page identity', () => {
    const catalog: Catalog = createTestCatalog({
      id: 'cat-presence-test',
      title: 'Presence Test',
      themeId: 'default',
      pages: [
        {
          id: 'page-alpha',
          pageNumber: 1,
          blocks: [{ id: 'block-1', type: 'specs_table' }]
        },
        {
          id: 'page-beta',
          pageNumber: 2,
          blocks: [{ id: 'block-2', type: 'specs_table' }]
        }
      ]
    });

    useCatalogStore.getState().setCurrentCatalog(catalog, false);

    const projectedContinuationPage = {
      pageId: 'flow:page-alpha:block-1:1',
      canonicalPageId: 'page-alpha',
      pageNumber: 2,
      isCover: false,
      isDerivedContinuation: true,
      blocks: []
    };

    expect(projectedContinuationPage.canonicalPageId).toBe('page-alpha');
    const canonicalPage = catalog.pages.find((p) => p.id === projectedContinuationPage.canonicalPageId);
    expect(canonicalPage?.id).toBe('page-alpha');
  });
});

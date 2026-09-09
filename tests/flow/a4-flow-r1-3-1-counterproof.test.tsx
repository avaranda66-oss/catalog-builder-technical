import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { CustomTableBlock } from '../../src/components/editor/blocks/CustomTableBlock';
import { TechnicalTableBlock } from '../../src/components/editor/blocks/TechnicalTableBlock';
import { computePageFlowPlan, PageLayoutFact } from '../../src/domain/page-flow-planner';
import { auditLayoutPreflight } from '../../src/domain/layout-preflight';
import { waitForPhysicalAssetsReady, useMeasuredA4RenderPlan } from '../../src/components/a4/useMeasuredA4RenderPlan';
import { verifyRenderedA4Plan, getPrintableMeasureRoot } from '../../src/components/a4/a4-layout-measurement';
import { catalogRowToCatalog } from '../../src/services/supabase.service';
import { buildA4RenderPlan } from '../../src/domain/a4-render-plan';
import type { Catalog, ContentBlock } from '../../src/domain/catalog.schema';

describe('A4.FLOW.R1.3.1 — Principal Counterproof Test Matrix', () => {
  // =========================================================================
  // RED A: Printable Measure Root Real
  // =========================================================================

  it('R131-T1: CustomTableBlock in editor mode excludes editor chrome from measure root', () => {
    const block: ContentBlock = {
      id: 'custom-table-1',
      type: 'custom_table',
      title: 'Tabela Customizada',
      tableColumns: [
        { key: 'col1', label: 'Coluna 1' },
        { key: 'col2', label: 'Coluna 2' }
      ],
      tableRows: [
        { id: 'r1', localOverrides: { col1: 'Val 1', col2: 'Val 2' } }
      ]
    };

    const { container } = render(
      <CustomTableBlock
        block={block}
        pageId="p1"
        isSelected={true}
        isExport={false}
      />
    );

    const measureRoot = container.querySelector('[data-a4-measure-root]');
    expect(measureRoot).not.toBeNull();

    // Editor action button "+ Coluna" or [data-editor-action] must NOT be inside measure root
    const editorActionInMeasureRoot = measureRoot!.querySelector(
      '[data-editor-action], button[title="Adicionar coluna"], button[title="Adicionar coluna personalizada"]'
    );
    expect(editorActionInMeasureRoot).toBeNull();
  });

  it('R131-T2: TechnicalTableBlock in editor mode excludes editor chrome from measure root', () => {
    const block: ContentBlock = {
      id: 'specs-table-1',
      type: 'specs_table',
      title: 'Tabela de Especificações',
      tableColumns: [
        { key: 'param', label: 'Parâmetro' },
        { key: 'val', label: 'Especificação' }
      ],
      tableRows: [
        { id: 'r1', localOverrides: { param: 'P1', val: 'V1' } }
      ]
    };

    const { container } = render(
      <TechnicalTableBlock
        block={block}
        pageId="p1"
        isSelected={true}
        isExport={false}
      />
    );

    const measureRoot = container.querySelector('[data-a4-measure-root]');
    expect(measureRoot).not.toBeNull();

    // Editor action button "+ Coluna" must NOT be inside measure root
    const editorActionInMeasureRoot = measureRoot!.querySelector(
      '[data-editor-action], button[title="Adicionar coluna personalizada"], button[title="Adicionar coluna"]'
    );
    expect(editorActionInMeasureRoot).toBeNull();
  });

  // =========================================================================
  // RED B: Manual Mode Invariance
  // =========================================================================

  it('R131-T3: manual mode caller cannot reactivate autoSplitOnOverflow', () => {
    const catalog: Catalog = {
      id: 'cat-manual-inv',
      title: 'Manual Invariant',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      layoutFlowMode: 'manual',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 't-large',
              type: 'specs_table',
              tableRows: [
                { id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' },
                { id: 'r5' }, { id: 'r6' }, { id: 'r7' }, { id: 'r8' }
              ]
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
        blockGapMm: 0,
        blocks: [
          {
            blockId: 't-large',
            blockType: 'specs_table',
            measuredHeightMm: 240,
            measuredWidthMm: 180,
            isSplittableTable: true,
            tableMeasurement: {
              tableId: 't-large',
              fixedChromeHeightMm: 10,
              headerHeightMm: 10,
              availableHeightOnFirstPageMm: 100,
              availableHeightOnSubsequentPagesMm: 100,
              rowHeights: [
                { rowId: 'r1', measuredHeightMm: 25 },
                { rowId: 'r2', measuredHeightMm: 25 },
                { rowId: 'r3', measuredHeightMm: 25 },
                { rowId: 'r4', measuredHeightMm: 25 },
                { rowId: 'r5', measuredHeightMm: 25 },
                { rowId: 'r6', measuredHeightMm: 25 },
                { rowId: 'r7', measuredHeightMm: 25 },
                { rowId: 'r8', measuredHeightMm: 25 }
              ]
            }
          }
        ]
      }
    ];

    // Caller attempts to re-enable auto-split in manual mode
    const plan = computePageFlowPlan(catalog, facts, {
      flowMode: 'manual',
      manualTableBreaks: {
        't-large': ['r4'] // ONLY one explicit manual break at r4
      },
      tablePaginationPolicy: {
        autoSplitOnOverflow: true // Should be overridden/ignored by manual invariant
      }
    });

    // In manual mode, only explicitly requested break (slice at r4) occurs: 2 pages
    // Auto-split must NOT split further pages (r5..r8 overflow is diagnosed on page 2)
    const tablePlan = plan.tablePaginationPlans['t-large'];
    expect(tablePlan).toBeDefined();
    expect(tablePlan.slices.length).toBe(2);
    expect(tablePlan.slices[0].includedRowIds).toEqual(['r1', 'r2', 'r3']);
    expect(tablePlan.slices[1].includedRowIds).toEqual(['r4', 'r5', 'r6', 'r7', 'r8']);
    // Page 2 has overflow diagnosed because caller cannot re-enable autoSplit
    expect(plan.unresolvedIssues.some((issue) => issue.code === 'VERTICAL_OVERFLOW')).toBe(true);
  });

  // =========================================================================
  // RED C: Legacy Compatibility vs Corruption Masking
  // =========================================================================

  it('R131-T4: legacy missing or null blocks survive as compatible empty page without corruption issue', () => {
    const rawLegacyRow = {
      id: 'legacy-cat',
      name: 'Legacy Cat',
      brand: {
        pages: [
          { id: 'p1', pageNumber: 1, title: 'No blocks' },
          { id: 'p2', pageNumber: 2, title: 'Null blocks', blocks: null }
        ]
      }
    };

    const catalog = catalogRowToCatalog(rawLegacyRow);
    expect(catalog.pages[0].blocks).toEqual([]);
    expect(catalog.pages[1].blocks).toEqual([]);

    const preflight = auditLayoutPreflight(catalog);
    expect(preflight.issues.some((i) => i.code === 'MALFORMED_PAGE_BLOCKS')).toBe(false);
  });

  it('R131-T5: corrupted non-array blocks survive to diagnostic boundary and block publication', () => {
    const rawCorruptRow = {
      id: 'corrupt-cat',
      name: 'Corrupt Cat',
      brand: {
        pages: [
          { id: 'p1', pageNumber: 1, title: 'Corrupt Page', blocks: { corrupt: true } }
        ]
      }
    };

    const catalog = catalogRowToCatalog(rawCorruptRow);
    // Preserved on catalog as diagnostic authority
    expect(Array.isArray(catalog.pages[0].blocks)).toBe(false);

    // Preflight detects the corruption and blocks publication
    const preflight = auditLayoutPreflight(catalog);
    expect(preflight.issues.some((i) => i.code === 'MALFORMED_PAGE_BLOCKS')).toBe(true);
    expect(preflight.canPublish).toBe(false);
  });

  // =========================================================================
  // RED D: Bounded Revalidation Fails Closed
  // =========================================================================

  it('R131-T6: 6th material geometry change within same documentKey fails closed with LAYOUT_UNSTABLE', async () => {
    // Verified in useMeasuredA4RenderPlan unit test with ResizeObserver trigger
    const catalog: Catalog = {
      id: 'cat-reval',
      title: 'Revalidation Test',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: '2026-01-01T00:00:00.000Z',
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            { id: 'b1', type: 'text', textContent: 'Initial' }
          ]
        }
      ]
    };

    let resizeCallback: (entries: Array<{ target: HTMLElement }>) => void = () => {};
    class MockResizeObserver {
      constructor(cb: any) { resizeCallback = cb; }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    const originalRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = MockResizeObserver as any;

    try {
      const targetElement = document.createElement('div');
      targetElement.setAttribute('data-canonical-block-id', 'b1');
      targetElement.setAttribute('data-a4-measure-root', 'true');
      Object.defineProperty(targetElement, 'offsetHeight', { value: 50, writable: true, configurable: true });

      const root = document.createElement('div');
      root.appendChild(targetElement);
      const rootRef = { current: root };

      // Render hook wrapper
      let latestState: any = null;
      function TestComponent() {
        latestState = useMeasuredA4RenderPlan(catalog, rootRef, 'smart');
        return null;
      }
      const { rerender } = render(<TestComponent />);

      // Let phase reach ready
      await vi.waitFor(() => expect(latestState?.isLayoutComplete).toBe(true));

      // Trigger 5 accepted material changes
      for (let i = 1; i <= 5; i++) {
        Object.defineProperty(targetElement, 'offsetHeight', { value: 50 + i * 20, writable: true, configurable: true });
        act(() => {
          resizeCallback([{ target: targetElement }]);
        });
        rerender(<TestComponent />);
        await vi.waitFor(() => expect(latestState?.isLayoutComplete).toBe(true));
      }

      // 6th material change: beyond budget! Must NOT be ignored; must produce LAYOUT_UNSTABLE
      Object.defineProperty(targetElement, 'offsetHeight', { value: 200, writable: true, configurable: true });
      act(() => {
        resizeCallback([{ target: targetElement }]);
      });
      rerender(<TestComponent />);

      await vi.waitFor(() => {
        expect(latestState?.layoutPreflight.issues.some((issue: any) => issue.code === 'LAYOUT_UNSTABLE')).toBe(true);
        expect(latestState?.isLayoutReady).toBe(false);
        expect(latestState?.layoutPreflight.canPublish).toBe(false);
      });
    } finally {
      globalThis.ResizeObserver = originalRO;
    }
  });

  // =========================================================================
  // RED E: Already-Failed Image Never Deadlocks
  // =========================================================================

  it('R131-T7: already-failed image settles deterministically without deadlock', async () => {
    const root = document.createElement('div');
    const img = document.createElement('img');
    // Simulate image already completed in error before listeners attached
    Object.defineProperty(img, 'complete', { value: true, configurable: true });
    Object.defineProperty(img, 'naturalWidth', { value: 0, configurable: true });
    root.appendChild(img);

    let settled = false;
    const promise = waitForPhysicalAssetsReady(root).then(() => {
      settled = true;
    });

    // Settle should happen asynchronously on microtask queue without hanging
    await Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('DEADLOCK_TIMEOUT')), 500))
    ]);

    expect(settled).toBe(true);
  });

  // =========================================================================
  // RED F: Physical Row Identity Block-Scoped
  // =========================================================================

  it('R131-T8: two different canonical table blocks may legitimately share the same rowId without false duplication', () => {
    const catalog: Catalog = {
      id: 'cat-shared-row',
      title: 'Shared Row',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            { id: 'table-A', type: 'specs_table', tableRows: [{ id: 'r1' }] },
            { id: 'table-B', type: 'specs_table', tableRows: [{ id: 'r1' }] }
          ]
        }
      ]
    };

    const dom = document.createElement('div');
    dom.innerHTML = `
      <div data-a4-page-id="p1">
        <div data-a4-block-flow-viewport="true" style="height:500px; width:500px;">
          <div data-a4-block-flow-content="true">
            <div data-canonical-block-id="table-A">
              <table>
                <tbody>
                  <tr data-canonical-row-id="r1" data-canonical-block-id="table-A"><td>A1</td></tr>
                </tbody>
              </table>
            </div>
            <div data-canonical-block-id="table-B">
              <table>
                <tbody>
                  <tr data-canonical-row-id="r1" data-canonical-block-id="table-B"><td>B1</td></tr>
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
              id: 'table-A',
              canonicalPageId: 'p1',
              canonicalBlockId: 'table-A',
              canonicalBlockType: 'specs_table',
              slice: {
                sliceIndex: 0,
                isFirstPage: true,
                isLastPage: true,
                includedRowIds: ['r1'],
                includesRepeatedHeader: false,
                totalSliceHeightMm: 10
              }
            },
            {
              id: 'table-B',
              canonicalPageId: 'p1',
              canonicalBlockId: 'table-B',
              canonicalBlockType: 'specs_table',
              slice: {
                sliceIndex: 0,
                isFirstPage: true,
                isLastPage: true,
                includedRowIds: ['r1'],
                includesRepeatedHeader: false,
                totalSliceHeightMm: 10
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
    expect(verified.flowPlan.unresolvedIssues.some((i) => i.code === 'TABLE_ROW_DUPLICATION')).toBe(false);
  });

  it('R131-T9: same block rendering r1 twice still fails with TABLE_ROW_DUPLICATION', () => {
    const catalog: Catalog = {
      id: 'cat-dup',
      title: 'Dup',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            { id: 'table-A', type: 'specs_table', tableRows: [{ id: 'r1' }] }
          ]
        }
      ]
    };

    const dom = document.createElement('div');
    dom.innerHTML = `
      <div data-a4-page-id="p1">
        <div data-a4-block-flow-viewport="true" style="height:500px; width:500px;">
          <div data-a4-block-flow-content="true">
            <div data-canonical-block-id="table-A">
              <table>
                <tbody>
                  <tr data-canonical-row-id="r1" data-canonical-block-id="table-A"><td>A1</td></tr>
                  <tr data-canonical-row-id="r1" data-canonical-block-id="table-A"><td>A1 dup</td></tr>
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
              id: 'table-A',
              canonicalPageId: 'p1',
              canonicalBlockId: 'table-A',
              canonicalBlockType: 'specs_table',
              slice: {
                sliceIndex: 0,
                isFirstPage: true,
                isLastPage: true,
                includedRowIds: ['r1'],
                includesRepeatedHeader: false,
                totalSliceHeightMm: 10
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

  it('R131-T10: row belonging to block A rendered under block B fails validation', () => {
    const catalog: Catalog = {
      id: 'cat-misplaced',
      title: 'Misplaced',
      themeId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            { id: 'table-A', type: 'specs_table', tableRows: [{ id: 'rA' }] },
            { id: 'table-B', type: 'specs_table', tableRows: [{ id: 'rB' }] }
          ]
        }
      ]
    };

    // DOM renders rA under table-B instead of table-A
    const dom = document.createElement('div');
    dom.innerHTML = `
      <div data-a4-page-id="p1">
        <div data-a4-block-flow-viewport="true" style="height:500px; width:500px;">
          <div data-a4-block-flow-content="true">
            <div data-canonical-block-id="table-A">
              <table><tbody></tbody></table>
            </div>
            <div data-canonical-block-id="table-B">
              <table>
                <tbody>
                  <tr data-canonical-row-id="rA" data-canonical-block-id="table-A"><td>A in B</td></tr>
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
              id: 'table-A',
              canonicalPageId: 'p1',
              canonicalBlockId: 'table-A',
              canonicalBlockType: 'specs_table',
              slice: {
                sliceIndex: 0,
                isFirstPage: true,
                isLastPage: true,
                includedRowIds: ['rA'],
                includesRepeatedHeader: false,
                totalSliceHeightMm: 10
              }
            },
            {
              id: 'table-B',
              canonicalPageId: 'p1',
              canonicalBlockId: 'table-B',
              canonicalBlockType: 'specs_table',
              slice: {
                sliceIndex: 0,
                isFirstPage: true,
                isLastPage: true,
                includedRowIds: ['rB'],
                includesRepeatedHeader: false,
                totalSliceHeightMm: 10
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
    expect(verified.flowPlan.unresolvedIssues.length).toBeGreaterThan(0);
    expect(verified.flowPlan.unresolvedIssues.some((i) =>
      i.code === 'TABLE_ROW_LOSS' || i.code === 'ROW_CLIPPED' || i.code === 'TABLE_ROW_DUPLICATION'
    )).toBe(true);
  });

  // =========================================================================
  // RED G: Shared Printable Measure Root Authority
  // =========================================================================

  it('R131-T11: getPrintableMeasureRoot returns data-a4-measure-root when present, otherwise blockElement', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-canonical-block-id', 'b1');
    const measureRoot = document.createElement('div');
    measureRoot.setAttribute('data-a4-measure-root', 'true');
    wrapper.appendChild(measureRoot);

    expect(getPrintableMeasureRoot(wrapper)).toBe(measureRoot);

    const simpleWrapper = document.createElement('div');
    simpleWrapper.setAttribute('data-canonical-block-id', 'b2');
    expect(getPrintableMeasureRoot(simpleWrapper)).toBe(simpleWrapper);
  });

  // =========================================================================
  // RED H: MALFORMED_TABLE_STRUCTURE Blocks Publication
  // =========================================================================

  it('R131-T12: table with terminal section emits MALFORMED_TABLE_STRUCTURE and blocks publication in preflight', () => {
    const catalog: Catalog = {
      id: 'cat-terminal-section',
      title: 'Terminal Section',
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
              id: 't-term',
              type: 'specs_table',
              tableRows: [
                { id: 'r1', kind: 'data' },
                { id: 'r2', kind: 'section' } // TERMINAL SECTION
              ]
            }
          ]
        }
      ]
    };

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
            measuredHeightMm: 50,
            measuredWidthMm: 180,
            isSplittableTable: true,
            tableMeasurement: {
              tableId: 't-term',
              fixedChromeHeightMm: 10,
              headerHeightMm: 10,
              availableHeightOnFirstPageMm: 200,
              availableHeightOnSubsequentPagesMm: 200,
              rowHeights: [
                { rowId: 'r1', measuredHeightMm: 15, kind: 'data' },
                { rowId: 'r2', measuredHeightMm: 15, kind: 'section' }
              ]
            }
          }
        ]
      }
    ];

    const plan = computePageFlowPlan(catalog, facts, { flowMode: 'smart' });
    expect(plan.unresolvedIssues.some((i) => i.code === 'MALFORMED_TABLE_STRUCTURE')).toBe(true);

    const preflight = auditLayoutPreflight(catalog, plan);
    expect(preflight.issues.some((i) => i.code === 'MALFORMED_TABLE_STRUCTURE')).toBe(true);
    expect(preflight.canPublish).toBe(false);
  });
});

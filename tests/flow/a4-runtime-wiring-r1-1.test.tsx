import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Catalog } from '../../src/domain/catalog.schema';
import { auditLayoutPreflight } from '../../src/domain/layout-preflight';
import { computePageFlowPlan, type PageLayoutFact } from '../../src/domain/page-flow-planner';
import { computeTablePaginationPlan } from '../../src/domain/table-core/table.pagination';

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const catalog = (pages: Catalog['pages']): Catalog => ({
  id: 'r1-1-catalog',
  title: 'R1.1',
  themeId: 'default',
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
  version: 1,
  pages
});

describe('A4.FLOW.R1.1 — factual RED/GREEN runtime contracts', () => {
  it('R1.1-T1: A4Canvas consumes projected pages from a PageFlowPlan', () => {
    const canvas = source('src/components/editor/A4Canvas.tsx');
    expect(canvas).toContain('projectedPages');
    expect(canvas).toContain('buildA4RenderPlan');
  });

  it('R1.1-T2: CleanA4Document consumes the shared A4 render plan', () => {
    const clean = source('src/components/export/CleanA4Document.tsx');
    expect(clean).toContain('A4RenderPlan');
    expect(clean).toContain('renderPlan.pages');
  });

  it('R1.1-T3: editor and export deliver slices to slice-capable table blocks', () => {
    const canvas = source('src/components/editor/A4Canvas.tsx');
    const clean = source('src/components/export/CleanA4Document.tsx');
    expect(canvas).toMatch(/TechnicalTableBlock[\s\S]{0,300}slice=/);
    expect(canvas).toMatch(/CustomTableBlock[\s\S]{0,300}slice=/);
    expect(clean).toMatch(/TechnicalTableBlock[\s\S]{0,400}slice=/);
    expect(clean).toMatch(/CustomTableBlock[\s\S]{0,400}slice=/);
  });

  it('R1.1-T4: every final publication entry point invokes layout preflight', () => {
    for (const file of [
      'src/components/editor/ExportPDFModal.tsx',
      'src/components/export/PrintDocumentView.tsx',
      'src/components/publications/PublicationsView.tsx'
    ]) {
      expect(source(file), file).toContain('auditLayoutPreflight');
    }
  });

  it('R1.1-T5: layout preflight without a current measured plan fails closed', () => {
    const report = auditLayoutPreflight(catalog([]));
    expect(report.canPublish).toBe(false);
    expect(report.issues.some((issue) => issue.code === 'LAYOUT_MEASUREMENT_MISSING')).toBe(true);
  });

  it('R1.1-T6: overflow recovery targets the measured offending block, never the last block heuristic', () => {
    const canvas = source('src/components/editor/A4Canvas.tsx');
    expect(canvas).toContain('firstOffendingBlockId');
    expect(canvas).not.toContain('page.blocks[page.blocks.length - 1].id');
  });

  it('R1.1-T7: full-page cover geometry cannot become technical-page capacity', () => {
    const doc = catalog([
      { id: 'cover', pageNumber: 1, pageType: 'cover', blocks: [{ id: 'cover-block', type: 'full_page_cover' }] },
      {
        id: 'technical',
        pageNumber: 2,
        pageType: 'technical',
        blocks: [
          { id: 'a', type: 'text' },
          { id: 'b', type: 'text' }
        ]
      }
    ]);
    const facts: PageLayoutFact[] = [
      { pageId: 'cover', pageNumber: 1, usableHeightMm: 297, usableWidthMm: 210, blocks: [{ blockId: 'cover-block', blockType: 'full_page_cover', measuredHeightMm: 297 }] },
      { pageId: 'technical', pageNumber: 2, usableHeightMm: 100, usableWidthMm: 190, blocks: [
        { blockId: 'a', blockType: 'text', measuredHeightMm: 60 },
        { blockId: 'b', blockType: 'text', measuredHeightMm: 60 }
      ] }
    ];
    const plan = computePageFlowPlan(doc, facts);
    expect(plan.totalProjectedPages).toBe(3);
  });

  it('R1.1-T8: missing block measurement is unresolved instead of a fake safe height', () => {
    const doc = catalog([{ id: 'p1', pageNumber: 1, pageType: 'technical', blocks: [{ id: 'unmeasured', type: 'text' }] }]);
    const plan = computePageFlowPlan(doc, [{ pageId: 'p1', pageNumber: 1, usableHeightMm: 260, usableWidthMm: 190, blocks: [] }]);
    expect(plan.hasUnresolvedOverflow).toBe(true);
    expect(plan.unresolvedIssues.some((issue) => issue.code === 'LAYOUT_MEASUREMENT_MISSING')).toBe(true);
  });

  it('R1.1-T9: fixed table chrome participates in pagination capacity', () => {
    const plan = computeTablePaginationPlan({
      tableId: 'chrome-table',
      headerHeightMm: 10,
      fixedChromeHeightMm: 30,
      rowHeights: [
        { rowId: 'r1', measuredHeightMm: 30 },
        { rowId: 'r2', measuredHeightMm: 30 },
        { rowId: 'r3', measuredHeightMm: 20 }
      ],
      availableHeightOnFirstPageMm: 100,
      availableHeightOnSubsequentPagesMm: 100
    } as Parameters<typeof computeTablePaginationPlan>[0]);
    expect(plan.totalPagesRequired).toBe(2);
  });

  it('R1.1-T10: manual table break is exposed as a real editor action', () => {
    expect(source('src/components/editor/blocks/TechnicalTableBlock.tsx')).toContain('Quebrar página antes desta linha');
  });

  it('R1.1-T11: Smart and Manual are explicit editor layout modes', () => {
    const canvas = source('src/components/editor/A4Canvas.tsx');
    expect(canvas).toContain('Modo de Fluxo');
    expect(canvas).toContain('Inteligente');
    expect(canvas).toContain('Manual');
  });

  it('R1.1-T12: projected continuation blocks retain canonical page provenance', () => {
    const doc = catalog([{ id: 'canonical-page', pageNumber: 1, pageType: 'technical', blocks: [{ id: 'block', type: 'text' }] }]);
    const plan = computePageFlowPlan(doc, [{
      pageId: 'canonical-page',
      pageNumber: 1,
      usableHeightMm: 260,
      usableWidthMm: 190,
      blocks: [{ blockId: 'block', blockType: 'text', measuredHeightMm: 10 }]
    }]);
    expect(plan.projectedPages[0].blocks[0]).toMatchObject({ canonicalPageId: 'canonical-page', canonicalBlockId: 'block' });
  });

  it('R1.1-T13: PDF service requires a successful layout gate token', () => {
    const pdf = source('src/services/pdf.service.ts');
    expect(pdf).toContain('layoutPreflight');
    expect(pdf).toContain('LAYOUT_PREFLIGHT_REQUIRED');
  });

  it('R1.1-T14: real-browser PRESYS physical acceptance exists', () => {
    const browserTests = fs.existsSync(path.join(root, 'tests/browser'))
      ? fs.readdirSync(path.join(root, 'tests/browser')).join('\n')
      : '';
    expect(browserTests).toContain('presys-a4-physical');
  });

  it('R1.1-T15: compaction is either measured end to end or explicitly deferred', () => {
    const planner = source('src/domain/page-flow-planner.ts');
    expect(planner).toMatch(/densityCandidates|COMPACTION_DEFERRED/);
  });
});

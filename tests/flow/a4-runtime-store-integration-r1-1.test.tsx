import { act } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomTableBlock } from '../../src/components/editor/blocks/CustomTableBlock';
import { CatalogSchema, type Catalog, type ContentBlock } from '../../src/domain/catalog.schema';
import { auditLayoutPreflight } from '../../src/domain/layout-preflight';
import type { PageFlowIssueCode, PageFlowPlan } from '../../src/domain/page-flow-planner';
import type { TablePaginationSlice } from '../../src/domain/table-core/table.pagination';
import { useCatalogStore } from '../../src/stores/useCatalogStore';

const tableBlock = (): ContentBlock => ({
  id: 'canonical-table',
  type: 'custom_table',
  title: 'Tabela canônica',
  tableColumns: [{ key: 'value', label: 'Valor', visible: true }],
  tableRows: [
    { id: 'row-1', order: 0, localOverrides: { value: 'Primeira' } },
    { id: 'row-2', order: 1, localOverrides: { value: 'Segunda' } },
    { id: 'row-3', order: 2, localOverrides: { value: 'Terceira' } }
  ]
});

const catalog = (pages?: Catalog['pages']): Catalog => ({
  id: 'runtime-store-catalog',
  title: 'Runtime store integration',
  themeId: 'default',
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
  version: 1,
  layoutFlowMode: 'smart',
  pages: pages ?? [{
    id: 'canonical-page',
    pageNumber: 1,
    pageType: 'technical',
    blocks: [tableBlock()]
  }]
});

const continuationSlice: TablePaginationSlice = {
  sliceIndex: 1,
  isFirstPage: false,
  isLastPage: true,
  includedRowIds: ['row-2'],
  includesRepeatedHeader: true,
  totalSliceHeightMm: 18,
  footnoteNotice: '(Continuação)'
};

const CanonicalTableHarness = ({ slice = continuationSlice }: { slice?: TablePaginationSlice }) => {
  const block = useCatalogStore((state) => state.currentCatalog?.pages
    .flatMap((page) => page.blocks)
    .find((candidate) => candidate.id === 'canonical-table'));
  if (!block) return null;
  return <CustomTableBlock block={block} pageId="canonical-page" slice={slice} />;
};

const resetStore = (nextCatalog = catalog()) => {
  useCatalogStore.setState({
    currentCatalog: structuredClone(nextCatalog),
    activePageIndex: 0,
    selectedBlockId: null,
    localRevision: 0,
    isDirty: false,
    syncStatus: 'synced',
    saveCurrentCatalog: vi.fn(async () => ({ success: true })) as never
  });
};

describe('A4.FLOW.R1.1 — integração real de continuação, edição e persistência', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('edita uma linha renderizada na continuação e muta a linha canônica exatamente uma vez', () => {
    const view = render(<CanonicalTableHarness />);
    expect(view.container.querySelectorAll('[data-canonical-row-id]')).toHaveLength(1);
    expect(view.container.querySelector('[data-canonical-row-id="row-2"]')).not.toBeNull();
    expect(view.container.querySelector('[data-canonical-row-id="row-1"]')).toBeNull();

    const cell = view.container.querySelector<HTMLElement>(
      '[data-printable-field="row_row-2_ov_value"] [contenteditable="true"]'
    );
    expect(cell).not.toBeNull();
    cell!.textContent = 'Segunda editada';
    fireEvent.blur(cell!);

    const state = useCatalogStore.getState();
    const canonicalTables = state.currentCatalog!.pages
      .flatMap((page) => page.blocks)
      .filter((block) => block.id === 'canonical-table');
    const rows = canonicalTables[0].tableRows!;
    expect(canonicalTables).toHaveLength(1);
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.id === 'row-2')?.localOverrides?.value).toBe('Segunda editada');
    expect(rows.find((row) => row.id === 'row-1')?.localOverrides?.value).toBe('Primeira');
    expect(state.localRevision).toBe(1);
  });

  it('adiciona e remove pela continuação sem perder linhas canônicas fora da fatia', () => {
    const view = render(<CanonicalTableHarness />);
    fireEvent.click(view.getByRole('button', { name: '+ Inserir Linha' }));

    let rows = useCatalogStore.getState().currentCatalog!.pages[0].blocks[0].tableRows!;
    expect(rows).toHaveLength(4);
    expect(rows.slice(0, 3).map((row) => row.id)).toEqual(['row-1', 'row-2', 'row-3']);
    expect(rows[3].order).toBe(3);

    const renderedRow = view.container.querySelector('[data-canonical-row-id="row-2"]');
    const remove = renderedRow?.querySelector<HTMLButtonElement>('button[title="Remover esta linha da tabela"]');
    expect(remove).not.toBeNull();
    fireEvent.click(remove!);

    rows = useCatalogStore.getState().currentCatalog!.pages[0].blocks[0].tableRows!;
    expect(rows.map((row) => row.id)).toEqual(['row-1', 'row-3', expect.stringMatching(/^crow-/)]);
    expect(useCatalogStore.getState().localRevision).toBe(2);
  });

  it('persiste modo Manual e quebra de linha no contrato serializado do catálogo', () => {
    act(() => useCatalogStore.getState().setLayoutFlowMode('manual'));
    const view = render(<CanonicalTableHarness />);
    const renderedRow = view.container.querySelector('[data-canonical-row-id="row-2"]');
    const breakButton = renderedRow?.querySelector<HTMLButtonElement>(
      'button[aria-label="Quebrar página antes desta linha"]'
    );
    expect(breakButton).not.toBeNull();
    fireEvent.click(breakButton!);

    const serialized = JSON.stringify(useCatalogStore.getState().currentCatalog);
    const reloaded = CatalogSchema.parse(JSON.parse(serialized));
    expect(reloaded.layoutFlowMode).toBe('manual');
    expect(reloaded.pages[0].blocks[0].customData?.manualBreakRowIds).toEqual(['row-2']);
  });

  it('impede mover conteúdo normal para a capa e mantém seleção/números ao criar folha seguinte', () => {
    const coverAndTechnical = catalog([
      {
        id: 'cover-page',
        pageNumber: 1,
        pageType: 'cover',
        blocks: [{ id: 'cover-block', type: 'full_page_cover', title: 'Capa' }]
      },
      {
        id: 'technical-page',
        pageNumber: 2,
        pageType: 'technical',
        blocks: [tableBlock()]
      }
    ]);
    resetStore(coverAndTechnical);

    expect(useCatalogStore.getState().moveBlockToPreviousPage('technical-page', 'canonical-table')).toBe(false);
    expect(useCatalogStore.getState().currentCatalog!.pages[0].blocks).toHaveLength(1);

    expect(useCatalogStore.getState().moveBlockToNextPage('technical-page', 'canonical-table')).toBe(true);
    const state = useCatalogStore.getState();
    expect(state.currentCatalog!.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
    expect(state.currentCatalog!.pages[2].blocks.map((block) => block.id)).toEqual(['canonical-table']);
    expect(state.activePageIndex).toBe(2);
    expect(state.selectedBlockId).toBe('canonical-table');
  });
});

describe('A4.FLOW.R1.1 — publicação final falha fechada para todo defeito físico contratado', () => {
  const planWith = (code: PageFlowIssueCode): PageFlowPlan => ({
    flowMode: 'smart',
    projectedPages: [],
    totalProjectedPages: 0,
    tablePaginationPlans: {},
    measurementStatus: 'ready',
    hasUnresolvedOverflow: true,
    hasHorizontalOverflow: code === 'HORIZONTAL_OVERFLOW',
    unresolvedIssues: [{ pageNumber: 1, code, message: `Defeito ${code}` }]
  });

  it.each([
    'VERTICAL_OVERFLOW',
    'HORIZONTAL_OVERFLOW',
    'UNRESOLVED_OVERSIZED_BLOCK',
    'UNRESOLVED_OVERSIZED_ROW',
    'LAYOUT_MEASUREMENT_MISSING',
    'ROW_CLIPPED',
    'TABLE_ROW_LOSS',
    'TABLE_ROW_DUPLICATION'
  ] as PageFlowIssueCode[])('bloqueia %s', (code) => {
    const report = auditLayoutPreflight(catalog(), planWith(code));
    expect(report.canPublish).toBe(false);
    expect(report.issues.some((issue) => issue.code === code)).toBe(true);
  });

  it('bloqueia MIXED_FULL_PAGE_COVER pela composição canônica real', () => {
    const mixed = catalog([{
      id: 'mixed-cover',
      pageNumber: 1,
      pageType: 'cover',
      blocks: [
        { id: 'cover', type: 'full_page_cover' },
        { id: 'flow', type: 'text', textContent: 'Conteúdo indevido' }
      ]
    }]);
    const report = auditLayoutPreflight(mixed, planWith('MIXED_FULL_PAGE_COVER'));
    expect(report.canPublish).toBe(false);
    expect(report.issues.some((issue) => issue.code === 'MIXED_FULL_PAGE_COVER')).toBe(true);
  });
});

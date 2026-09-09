import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../../src/domain/catalog.schema';
import { getTablePreset } from '../../src/domain/table-core/table.presets';

const mocks = vi.hoisted(() => {
  const catalogState = { current: {} as any };
  const uiState = { current: {} as any };
  const libraryState = { current: { products: [] } as any };

  return {
    catalogState,
    uiState,
    libraryState,
    exportToPDF: vi.fn(),
    getCatalog: vi.fn(),
    getTemplate: vi.fn(),
    auditCatalogPublishSafety: vi.fn(),
    checkCatalogCompliance: vi.fn(),
    ensureFontsLoadedForLocale: vi.fn(),
    openWindow: vi.fn()
  };
});

vi.mock('../../src/stores/useCatalogStore', () => {
  const useCatalogStore = Object.assign(
    vi.fn(() => mocks.catalogState.current),
    { getState: vi.fn(() => mocks.catalogState.current) }
  );
  return { useCatalogStore };
});

vi.mock('../../src/stores/useUIStore', () => ({
  useUIStore: vi.fn(() => mocks.uiState.current)
}));

vi.mock('../../src/stores/useLibraryStore', () => ({
  useLibraryStore: vi.fn(() => mocks.libraryState.current)
}));

vi.mock('../../src/services/pdf.service', () => ({
  PDFService: {
    exportToPDF: mocks.exportToPDF,
    printNative: vi.fn()
  }
}));

vi.mock('../../src/services/supabase.service', () => ({
  SupabaseService: {
    getCatalog: mocks.getCatalog,
    getTemplate: mocks.getTemplate
  }
}));

vi.mock('../../src/domain/table-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/domain/table-core')>()),
  auditCatalogPublishSafety: mocks.auditCatalogPublishSafety
}));

vi.mock('../../src/services/ai.service', () => ({
  AIService: {
    checkCatalogCompliance: mocks.checkCatalogCompliance
  }
}));

vi.mock('../../src/translation/font-manager', () => ({
  FontManager: {
    ensureFontsLoadedForLocale: mocks.ensureFontsLoadedForLocale,
    getDirectionForLocale: vi.fn(() => 'ltr'),
    getFontFamilyForLocale: vi.fn(() => 'sans-serif')
  }
}));

vi.mock('../../src/components/export/CleanA4Document', async () => {
  const React = await import('react');
  const measuredPlan = {
    flowPlan: {
      flowMode: 'smart',
      projectedPages: [],
      totalProjectedPages: 0,
      tablePaginationPlans: {},
      measurementStatus: 'ready',
      hasUnresolvedOverflow: false,
      hasHorizontalOverflow: false,
      unresolvedIssues: []
    },
    pages: [],
    hasIntegrityDefect: false
  };
  const measuredReport = { canPublish: true, blockCount: 0, warnCount: 0, issues: [] };
  return {
  CleanA4Document: ({
    document: catalog,
    className = '',
    resolveDatum,
    onLayoutPreflightChange
  }: {
    document: Catalog;
    className?: string;
    resolveDatum?: (reference: any) => { value?: { kind?: string; text?: string } } | undefined;
    onLayoutPreflightChange?: (report: any, plan: any, isComplete: boolean) => void;
  }) => {
    React.useEffect(() => {
      onLayoutPreflightChange?.(measuredReport, measuredPlan, true);
    }, [onLayoutPreflightChange]);

    const technicalValue = resolveDatum?.({
      kind: 'datum_reference',
      productId: 'product-rr009',
      datumKey: 'spec.pressure',
      bindingMode: 'live'
    })?.value?.text;

    return (
      <div className={`clean-export-root ${className}`} data-testid="clean-document">
        {catalog.pages.map((page, index) => (
          <div
            key={page.id || index}
            className="clean-export-page a4-page-container"
            data-testid="clean-page"
            data-document-id={catalog.id}
            data-document-version={catalog.version}
          >
            {catalog.title} v{catalog.version}{technicalValue ? ` | ${technicalValue}` : ''}
          </div>
        ))}
      </div>
    );
  }
  };
});

import { ExportPDFModal } from '../../src/components/editor/ExportPDFModal';
import { TechnicalTableBlock } from '../../src/components/editor/blocks/TechnicalTableBlock';
import { PrintDocumentView } from '../../src/components/export/PrintDocumentView';
import { PublicationsView } from '../../src/components/publications/PublicationsView';

function createCatalog(version = 2, overrides: Partial<Catalog> = {}): Catalog {
  return {
    id: 'cat-rr009',
    title: 'RR009 Catalog',
    version,
    pages: [
      {
        id: 'page-rr009-1',
        pageNumber: 1,
        title: 'Page 1',
        blocks: []
      }
    ],
    ...overrides
  } as Catalog;
}

function createKnowledgeRuntime() {
  return {
    getStatus: vi.fn(() => 'ready'),
    subscribe: vi.fn(() => () => undefined),
    getFailedProductIds: vi.fn(() => []),
    preloadCatalogProductKnowledge: vi.fn(async () => undefined)
  };
}

function configureCatalogState(catalog: Catalog) {
  const knowledgeRuntime = createKnowledgeRuntime();
  const resolveDatum = vi.fn();

  mocks.catalogState.current = {
    currentCatalog: catalog,
    savedCatalogs: [catalog],
    loadAllCatalogs: vi.fn(async () => undefined),
    loadCatalogById: vi.fn(async () => undefined),
    duplicateCatalog: vi.fn(async () => undefined),
    deleteCatalog: vi.fn(async () => undefined),
    setActivePageIndex: vi.fn(),
    flushCatalog: vi.fn(async () => ({ success: true, status: 'synced', version: catalog.version })),
    saveActiveDocument: vi.fn(async () => ({ success: true, status: 'synced', version: catalog.version })),
    editorContext: { kind: 'catalog', catalogId: catalog.id },
    syncStatus: 'synced',
    isDirty: false,
    localRevision: 0,
    lastAcknowledgedLocalRevision: 0,
    knowledgeRuntime,
    getTableDatumResolver: vi.fn(() => resolveDatum),
    preloadProductKnowledge: vi.fn(async () => undefined)
  };

  return mocks.catalogState.current;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
  Object.defineProperty(window, 'open', {
    configurable: true,
    writable: true,
    value: mocks.openWindow
  });
  Object.defineProperty(window, 'print', {
    configurable: true,
    writable: true,
    value: vi.fn()
  });

  mocks.uiState.current = {
    isExportPDFModalOpen: true,
    setExportPDFModalOpen: vi.fn(),
    setActiveTab: vi.fn(),
    openAIAssistant: vi.fn()
  };
  mocks.libraryState.current = { products: [] };
  mocks.auditCatalogPublishSafety.mockReturnValue({
    canPublish: true,
    blockCount: 0,
    warnCount: 0,
    issues: []
  });
  mocks.checkCatalogCompliance.mockReturnValue({
    isFullyCompliant: true,
    divergenceCount: 0,
    totalRowsChecked: 0
  });
  mocks.ensureFontsLoadedForLocale.mockResolvedValue({ success: true });
  mocks.exportToPDF.mockResolvedValue({ success: true, blob: new Blob() });
});

afterEach(() => {
  cleanup();
});

describe('RR009 — export snapshot and version consistency', () => {
  it('W2-B.1: transient table presentation draft stays editor-only and cannot alter clean export', async () => {
    const persistedPresentation = {
      ...getTablePreset('presys_clean_technical'),
      tableWidth: { mode: 'fixed_mm' as const, widthMm: 100 }
    };
    const draftPresentation = {
      ...persistedPresentation,
      tableWidth: { mode: 'fixed_mm' as const, widthMm: 140 }
    };
    const block = {
      id: 'specs-presentation-rr009',
      type: 'specs_table',
      title: 'Snapshot presentation authority',
      tableColumns: [{ key: 'pressure', label: 'Pressure', visible: true }],
      tableRows: [
        {
          id: 'row-presentation-rr009',
          localOverrides: { pressure: '10 bar' }
        }
      ],
      customData: {
        tablePresentation: persistedPresentation
      }
    } as any;
    const catalog = createCatalog(2, {
      pages: [
        {
          id: 'page-presentation-rr009',
          pageNumber: 1,
          title: 'Page 1',
          blocks: [block]
        }
      ]
    });
    configureCatalogState(catalog);
    mocks.uiState.current = {
      ...mocks.uiState.current,
      isExportPDFModalOpen: false,
      tablePresentationDraft: {
        blockId: block.id,
        presentation: draftPresentation
      },
      openAddProductToTableModal: vi.fn()
    };

    const editorRender = render(
      <TechnicalTableBlock block={block} pageId="page-presentation-rr009" isExport={false} />
    );
    expect(editorRender.container.querySelector('[data-table-mode="editor"]')).toHaveStyle({ width: '140mm' });
    editorRender.unmount();

    const { CleanA4Document: RealCleanA4Document } = await vi.importActual<
      typeof import('../../src/components/export/CleanA4Document')
    >('../../src/components/export/CleanA4Document');
    const exportRender = render(<RealCleanA4Document document={catalog} />);

    expect(exportRender.container.querySelector('[data-table-mode="export"]')).toHaveStyle({ width: '100mm' });
  });

  it('T1/A: PublicationsView materializes a real clean publication target before PDF capture', async () => {
    const catalog = createCatalog(2);
    const state = configureCatalogState(catalog);
    let capturedTargetCount = -1;
    mocks.exportToPDF.mockImplementation(async (selector: string) => {
      const count = document.querySelectorAll(selector).length;
      capturedTargetCount = count;
      return count > 0
        ? { success: true, blob: new Blob() }
        : { success: false, message: 'Nenhuma página A4 encontrada para exportar o PDF.' };
    });

    render(<PublicationsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Export High-Resolution PDF' }));

    await waitFor(() => expect(mocks.exportToPDF).toHaveBeenCalledTimes(1));
    const selector = mocks.exportToPDF.mock.calls[0][0] as string;

    expect(capturedTargetCount).toBeGreaterThan(0);
    expect(selector).toContain('rr009');
    expect(state.getTableDatumResolver).toHaveBeenCalledWith('effective_for_publishing');
    expect(mocks.auditCatalogPublishSafety).toHaveBeenCalledWith(
      expect.objectContaining({ catalog: expect.objectContaining({ id: 'cat-rr009', version: 2 }) })
    );
    expect(mocks.exportToPDF.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        fileName: expect.stringContaining('_v2_'),
        metadata: {
          snapshotIdentity: 'catalog:cat-rr009:v2',
          documentId: 'cat-rr009',
          version: 2
        }
      })
    );
  });

  it('T3: PrintDocumentView renders when requested and loaded catalog versions match', async () => {
    const catalog = createCatalog(2);
    const state = configureCatalogState(catalog);
    mocks.getCatalog.mockResolvedValue({ success: true, data: catalog });
    window.history.replaceState({}, '', '/?print=1&catalog=cat-rr009&version=2');

    render(<PrintDocumentView />);

    const rendered = await screen.findByTestId('clean-page');
    expect(rendered).toHaveAttribute('data-document-version', '2');
    expect(mocks.getCatalog).toHaveBeenCalledWith('cat-rr009');
    await waitFor(() => expect(state.getTableDatumResolver).toHaveBeenCalledWith('effective_for_publishing'));
  });

  it('T4/B: PrintDocumentView fails closed when requested catalog version differs from loaded latest', async () => {
    const latestCatalog = createCatalog(3);
    configureCatalogState(latestCatalog);
    mocks.getCatalog.mockResolvedValue({ success: true, data: latestCatalog });
    window.history.replaceState({}, '', '/?print=1&catalog=cat-rr009&version=2');

    render(<PrintDocumentView />);

    expect(await screen.findByText(/vers[aã]o solicitada.*2.*3/i)).toBeInTheDocument();
    expect(screen.queryByTestId('clean-document')).not.toBeInTheDocument();
  });

  it.each([
    '/?print=1&catalog=cat-rr009',
    '/?print=1&catalog=cat-rr009&version=abc',
    '/?print=1&catalog=cat-rr009&version=0',
    '/?print=1&catalog=cat-rr009&version=2.5'
  ])('T5: PrintDocumentView fails closed for missing or malformed required version (%s)', async (url) => {
    const catalog = createCatalog(2);
    configureCatalogState(catalog);
    mocks.getCatalog.mockResolvedValue({ success: true, data: catalog });
    window.history.replaceState({}, '', url);

    render(<PrintDocumentView />);

    expect(await screen.findByText(/vers[aã]o.*inv[aá]lida|vers[aã]o.*obrigat[oó]ria/i)).toBeInTheDocument();
    expect(screen.queryByTestId('clean-document')).not.toBeInTheDocument();
  });

  it('T7/C: direct raster export does not continue after a non-conflict save failure', async () => {
    const catalog = createCatalog(2);
    const state = configureCatalogState(catalog);
    state.saveActiveDocument = vi.fn(async () => ({
      success: false,
      status: 'error',
      error: 'network failure'
    }));

    render(<ExportPDFModal />);
    fireEvent.click(screen.getByText('PDF de Compatibilidade (Raster)').closest('div[class*="cursor-pointer"]')!);

    await waitFor(() => expect(state.saveActiveDocument).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.exportToPDF).not.toHaveBeenCalled());
    expect(await screen.findByText(/network failure|n[aã]o foi poss[ií]vel confirmar/i)).toBeInTheDocument();
  });

  it('T7/C: clean print view does not open after an offline save failure', async () => {
    const catalog = createCatalog(2);
    const state = configureCatalogState(catalog);
    state.saveActiveDocument = vi.fn(async () => ({
      success: false,
      status: 'offline',
      error: 'offline'
    }));

    render(<ExportPDFModal />);
    fireEvent.click(screen.getByText('Gerar PDF de Alta Qualidade').closest('div[class*="cursor-pointer"]')!);

    await waitFor(() => expect(state.saveActiveDocument).toHaveBeenCalledTimes(1));
    expect(mocks.openWindow).not.toHaveBeenCalled();
    expect(await screen.findByText(/offline|n[aã]o foi poss[ií]vel confirmar/i)).toBeInTheDocument();
  });

  it('T6: direct export remains fail-closed on save conflict', async () => {
    const catalog = createCatalog(2);
    const state = configureCatalogState(catalog);
    state.saveActiveDocument = vi.fn(async () => ({
      success: false,
      status: 'conflict',
      error: 'conflict'
    }));

    render(<ExportPDFModal />);
    fireEvent.click(screen.getByText('PDF de Compatibilidade (Raster)').closest('div[class*="cursor-pointer"]')!);

    await waitFor(() => expect(state.saveActiveDocument).toHaveBeenCalledTimes(1));
    expect(mocks.exportToPDF).not.toHaveBeenCalled();
    expect(await screen.findByText(/conflict|n[aã]o foi poss[ií]vel confirmar/i)).toBeInTheDocument();
  });

  it('T8/T9/T10/T13: modal audits, renders and exports one detached confirmed snapshot identity', async () => {
    const catalog = createCatalog(2, { title: 'Confirmed Snapshot' });
    const state = configureCatalogState(catalog);
    let renderedBeforeMutation = '';
    let renderedAfterMutation = '';

    mocks.exportToPDF.mockImplementation(async (selector: string) => {
      const target = document.querySelector(selector);
      renderedBeforeMutation = target?.textContent || '';
      catalog.title = 'REMOTE MUTATION';
      catalog.version = 3;
      renderedAfterMutation = target?.textContent || '';
      return { success: true, blob: new Blob() };
    });

    render(<ExportPDFModal />);
    fireEvent.click(screen.getByText('PDF de Compatibilidade (Raster)').closest('div[class*="cursor-pointer"]')!);

    await waitFor(() => expect(mocks.exportToPDF).toHaveBeenCalledTimes(1));
    expect(renderedBeforeMutation).toContain('Confirmed Snapshot v2');
    expect(renderedAfterMutation).toBe(renderedBeforeMutation);
    expect(state.getTableDatumResolver).toHaveBeenCalledWith('effective_for_publishing');

    const confirmedAuditCall = mocks.auditCatalogPublishSafety.mock.calls.find(
      ([arg]) => arg.catalog?.title === 'Confirmed Snapshot' && arg.catalog !== catalog
    );
    expect(confirmedAuditCall).toBeDefined();

    const [selector, options] = mocks.exportToPDF.mock.calls[0];
    expect(selector).toContain('rr009-modal-export-snapshot');
    expect(options).toEqual(
      expect.objectContaining({
        fileName: expect.stringMatching(/^Confirmed_Snapshot_v2_/),
        metadata: {
          snapshotIdentity: 'catalog:cat-rr009:v2',
          documentId: 'cat-rr009',
          version: 2
        }
      })
    );
  });

  it('T12/D-E: technical datum rendered for export stays equal to the value that passed confirmed preflight', async () => {
    const catalog = createCatalog(2, {
      title: 'Pinned technical snapshot',
      pages: [
        {
          id: 'page-rr009-1',
          pageNumber: 1,
          title: 'Page 1',
          blocks: [
            {
              id: 'specs-rr009',
              type: 'specs_table',
              tableColumns: [{ key: 'pressure', label: 'Pressure', visible: true }],
              tableRows: [
                {
                  id: 'row-rr009',
                  productRefId: 'product-rr009',
                  cellBindings: {
                    pressure: {
                      sourceKind: 'pim_datum',
                      productId: 'product-rr009',
                      semanticKey: 'spec.pressure',
                      bindingMode: 'live'
                    }
                  }
                }
              ]
            } as any
          ]
        }
      ]
    });
    const state = configureCatalogState(catalog);
    let liveValue = 'AUDITED R1';
    const liveResolver = vi.fn(() => ({
      value: { kind: 'text', text: liveValue },
      status: 'approved'
    }));
    state.getTableDatumResolver = vi.fn(() => liveResolver);

    mocks.auditCatalogPublishSafety.mockImplementation((context: any) => {
      if (context.catalog !== catalog) {
        expect(context.resolveDatum?.({
          kind: 'datum_reference',
          productId: 'product-rr009',
          datumKey: 'spec.pressure',
          bindingMode: 'live'
        })?.value?.text).toBe('AUDITED R1');
        liveValue = 'REMOTE R2 AFTER PREFLIGHT';
      }
      return { canPublish: true, blockCount: 0, warnCount: 0, issues: [] };
    });

    let capturedText = '';
    mocks.exportToPDF.mockImplementation(async (selector: string) => {
      capturedText = document.querySelector(selector)?.textContent || '';
      return { success: true, blob: new Blob() };
    });

    render(<ExportPDFModal />);
    fireEvent.click(screen.getByText('PDF de Compatibilidade (Raster)').closest('div[class*="cursor-pointer"]')!);

    await waitFor(() => expect(mocks.exportToPDF).toHaveBeenCalledTimes(1));
    expect(capturedText).toContain('AUDITED R1');
    expect(capturedText).not.toContain('REMOTE R2 AFTER PREFLIGHT');
    expect(state.getTableDatumResolver).toHaveBeenCalledWith('effective_for_publishing');
  });

  it('T8: save acknowledgement and confirmed store document must name the same version', async () => {
    const catalog = createCatalog(2);
    const state = configureCatalogState(catalog);
    state.saveActiveDocument = vi.fn(async () => ({ success: true, status: 'synced', version: 3 }));

    render(<ExportPDFModal />);
    fireEvent.click(screen.getByText('PDF de Compatibilidade (Raster)').closest('div[class*="cursor-pointer"]')!);

    await waitFor(() => expect(state.saveActiveDocument).toHaveBeenCalledTimes(1));
    expect(mocks.exportToPDF).not.toHaveBeenCalled();
    expect(await screen.findByText(/vers[aã]o solicitada.*3.*2/i)).toBeInTheDocument();
  });

  it('T11/F: template print path also fails closed on requested/loaded version mismatch', async () => {
    const templateCatalog = createCatalog(4, { id: 'template-rr009', title: 'Template body' });
    configureCatalogState(templateCatalog);
    mocks.getTemplate.mockResolvedValue({
      success: true,
      data: {
        id: 'template-rr009',
        name: 'RR009 Template',
        version: 4,
        catalog: templateCatalog
      }
    });
    window.history.replaceState({}, '', '/?print=1&template=template-rr009&version=3');

    render(<PrintDocumentView />);

    expect(await screen.findByText(/vers[aã]o solicitada.*3.*4/i)).toBeInTheDocument();
    expect(screen.queryByTestId('clean-document')).not.toBeInTheDocument();
  });
});

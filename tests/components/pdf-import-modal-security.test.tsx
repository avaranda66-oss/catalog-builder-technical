import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUntrustedPdfDocument: vi.fn(),
  setCurrentCatalog: vi.fn(),
  saveCurrentCatalog: vi.fn().mockResolvedValue(undefined),
  addBlock: vi.fn(),
  insertContentOnNewPageAfter: vi.fn()
}));

vi.mock('@/services/pdfjs.service', () => ({
  getUntrustedPdfDocument: mocks.getUntrustedPdfDocument
}));

vi.mock('@/stores/useCatalogStore', () => {
  const useCatalogStore = Object.assign(
    vi.fn(() => ({
      currentCatalog: {
        id: 'catalog-1',
        title: 'Catálogo de teste',
        pages: [],
        createdAt: '2026-09-05T00:00:00.000Z',
        updatedAt: '2026-09-05T00:00:00.000Z'
      },
      addBlock: mocks.addBlock,
      activePageIndex: 0,
      setCurrentCatalog: mocks.setCurrentCatalog,
      insertContentOnNewPageAfter: mocks.insertContentOnNewPageAfter
    })),
    {
      getState: vi.fn(() => ({
        saveCurrentCatalog: mocks.saveCurrentCatalog
      }))
    }
  );

  return { useCatalogStore };
});

import { PDFImportModal } from '@/components/editor/PDFImportModal';

const makePdfFile = (name = 'benign.pdf') => {
  const file = new File(['harmless-pdf-fixture'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: vi.fn().mockResolvedValue(new ArrayBuffer(32))
  });
  return file;
};

describe('PDFImportModal security regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,benign');
    vi.stubGlobal('alert', vi.fn());
  });

  it('renders one benign page and imports the rendered page into the catalog', async () => {
    const renderPage = vi.fn().mockReturnValue({ promise: Promise.resolve() });
    const pdfDocument = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ width: 200, height: 300 }),
        render: renderPage
      })
    };
    mocks.getUntrustedPdfDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });
    const onClose = vi.fn();
    const { container } = render(<PDFImportModal isOpen onClose={onClose} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [makePdfFile()] } });

    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));
    expect(mocks.getUntrustedPdfDocument).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Adicionar Página 1 Inteira ao Catálogo/i }));

    expect(mocks.setCurrentCatalog).toHaveBeenCalledTimes(1);
    const savedCatalog = mocks.setCurrentCatalog.mock.calls[0][0];
    expect(savedCatalog.pages).toHaveLength(1);
    expect(savedCatalog.pages[0].blocks[0].imageUrl).toBe('data:image/png;base64,benign');
    expect(mocks.saveCurrentCatalog).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('handles an invalid PDF without crashing or closing the modal', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.getUntrustedPdfDocument.mockReturnValue({
      promise: Promise.reject(new Error('Invalid PDF structure'))
    });
    const onClose = vi.fn();
    const { container } = render(<PDFImportModal isOpen onClose={onClose} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [makePdfFile('invalid.pdf')] } });

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Não foi possível ler o arquivo PDF selecionado.');
    });
    expect(screen.getByText('Nenhum documento PDF aberto')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });
});

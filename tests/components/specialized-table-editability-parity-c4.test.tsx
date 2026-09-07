import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { AccessoriesTableBlock } from '@/components/editor/blocks/AccessoriesTableBlock';
import { CustomTableBlock } from '@/components/editor/blocks/CustomTableBlock';
import { ElectricalTableBlock } from '@/components/editor/blocks/ElectricalTableBlock';
import { TechnicalTableBlock } from '@/components/editor/blocks/TechnicalTableBlock';
import { CleanA4Document } from '@/components/export/CleanA4Document';
import type { Catalog, ContentBlock } from '@/domain/catalog.schema';
import { useCatalogStore } from '@/stores/useCatalogStore';
import { useLibraryStore } from '@/stores/useLibraryStore';

type SpecializedKind = 'electrical_table' | 'accessories_table';

const originalCatalogActions = {
  updateBlock: useCatalogStore.getState().updateBlock,
  updateCellOverride: useCatalogStore.getState().updateCellOverride,
  setSelectedBlockId: useCatalogStore.getState().setSelectedBlockId
};
const originalGetProduct = useLibraryStore.getState().getProduct;

const updateBlock = vi.fn();
const updateCellOverride = vi.fn();
const setSelectedBlockId = vi.fn();

const createBlock = (type: SpecializedKind): ContentBlock => {
  if (type === 'electrical_table') {
    return {
      id: 'electrical-c4',
      type,
      title: 'Electrical facts C4',
      tableColumns: [
        { key: 'signal', label: 'Signal', visible: true, isCustom: true },
        { key: 'supply', label: 'Supply', visible: true }
      ],
      tableRows: [
        {
          id: 'electrical-row-c4',
          localOverrides: { signal: '4-20 mA HART', supply: '24 Vdc' },
          order: 0
        }
      ]
    };
  }

  return {
    id: 'accessories-c4',
    type,
    title: 'Accessory facts C4',
    tableColumns: [
      { key: 'code', label: 'Code', visible: true, isCustom: true },
      { key: 'description', label: 'Description', visible: true }
    ],
    tableRows: [
      {
        id: 'accessories-row-c4',
        localOverrides: { code: 'MNF-2V', description: '316 stainless manifold' },
        order: 0
      }
    ]
  };
};

const createCatalog = (block: ContentBlock): Catalog => ({
  id: `catalog-${block.id}`,
  title: 'C4 parity catalog',
  themeId: 'default-technical',
  pages: [
    {
      id: 'page-c4',
      pageNumber: 1,
      blocks: [block]
    }
  ],
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
  version: 1
});

const renderEditorBlock = (block: ContentBlock) => {
  if (block.type === 'electrical_table') {
    return render(<ElectricalTableBlock block={block} pageId="page-c4" isSelected={false} />);
  }

  return render(<AccessoriesTableBlock block={block} pageId="page-c4" isSelected={false} />);
};

const printableFacts = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-printable-field]')).map((element) => ({
    field: element.dataset.printableField,
    text: element.textContent?.trim()
  }));

describe('C4 — specialized table editor/export editability parity', () => {
  beforeEach(() => {
    updateBlock.mockReset();
    updateCellOverride.mockReset();
    setSelectedBlockId.mockReset();
    useCatalogStore.setState({ updateBlock, updateCellOverride, setSelectedBlockId });
    useLibraryStore.setState({ getProduct: vi.fn(() => undefined) });
  });

  afterEach(() => {
    cleanup();
    useCatalogStore.setState(originalCatalogActions);
    useLibraryStore.setState({ getProduct: originalGetProduct });
    vi.restoreAllMocks();
  });

  it.each<SpecializedKind>(['electrical_table', 'accessories_table'])(
    'C4-T1/T3: %s remains editable in the editor path',
    (type) => {
      const block = createBlock(type);
      const { container } = renderEditorBlock(block);

      expect(container.querySelector('[data-printable-field="title"]')).toHaveAttribute(
        'contenteditable',
        'true'
      );
      expect(container.querySelectorAll('[contenteditable="true"]').length).toBeGreaterThan(1);
      expect(container.querySelectorAll('[data-editor-action="true"]').length).toBeGreaterThan(0);

      const insertRow = Array.from(container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('+ Inserir Linha')
      );
      expect(insertRow).toBeDefined();
      fireEvent.click(insertRow!);
      expect(updateBlock).toHaveBeenCalledTimes(1);
    }
  );

  it.each<SpecializedKind>(['electrical_table', 'accessories_table'])(
    'C4-T2/T4/T6/T9/T10: CleanA4Document renders %s as inert read-only DOM',
    (type) => {
      const block = createBlock(type);
      const { container } = render(<CleanA4Document document={createCatalog(block)} />);
      const exportBlock = container.querySelector<HTMLElement>(`[data-block-type="${type}"]`);

      expect(exportBlock).not.toBeNull();
      expect(exportBlock!.querySelectorAll('button')).toHaveLength(0);
      expect(exportBlock!.querySelectorAll('[contenteditable="true"]')).toHaveLength(0);
      expect(exportBlock!.querySelectorAll('[data-editor-action="true"]')).toHaveLength(0);
      expect(exportBlock!.querySelectorAll('[class*="ring-2"]')).toHaveLength(0);
      expect(exportBlock!.querySelectorAll('thead:last-of-type tr th')).toHaveLength(
        block.tableColumns!.length
      );
      expect(exportBlock!.querySelectorAll('tbody tr:first-child td')).toHaveLength(
        block.tableColumns!.length
      );
      expect(exportBlock!.textContent).not.toContain('#');

      fireEvent.click(exportBlock!);
      exportBlock!.querySelectorAll<HTMLElement>('[data-printable-field]').forEach((element) => {
        fireEvent.blur(element);
      });

      expect(setSelectedBlockId).not.toHaveBeenCalled();
      expect(updateBlock).not.toHaveBeenCalled();
      expect(updateCellOverride).not.toHaveBeenCalled();
    }
  );

  it.each<SpecializedKind>(['electrical_table', 'accessories_table'])(
    'C4-T5: %s preserves the same printable facts between editor and export',
    (type) => {
      const block = createBlock(type);
      const editor = renderEditorBlock(block);
      const editorFacts = printableFacts(editor.container);
      editor.unmount();

      const exported = render(<CleanA4Document document={createCatalog(block)} />);
      const exportFacts = printableFacts(exported.container);

      expect(exportFacts).toEqual(editorFacts);
    }
  );

  it('C4-T7/T8: existing generic and custom table read-only contracts remain inert', () => {
    const genericBlock: ContentBlock = {
      ...createBlock('electrical_table'),
      id: 'generic-c4',
      type: 'table'
    };
    const customBlock: ContentBlock = {
      ...createBlock('accessories_table'),
      id: 'custom-c4',
      type: 'custom_table'
    };

    const generic = render(
      <TechnicalTableBlock block={genericBlock} pageId="page-c4" isExport={true} />
    );
    expect(generic.container.querySelectorAll('button')).toHaveLength(0);
    expect(generic.container.querySelectorAll('[contenteditable="true"]')).toHaveLength(0);
    generic.unmount();

    const custom = render(
      <CustomTableBlock block={customBlock} pageId="page-c4" isExport={true} />
    );
    expect(custom.container.querySelectorAll('button')).toHaveLength(0);
    expect(custom.container.querySelectorAll('[contenteditable="true"]')).toHaveLength(0);
  });
});

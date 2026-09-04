import { create } from 'zustand';

export type ActiveTab = 'editor' | 'library' | 'catalogs';

export type KnowledgePickerTarget =
  | {
      kind: 'cell';
      blockId: string;
      legacyRowId: string;
      legacyColKey: string;
      tableCoreCellId?: string;
      productId?: string;
      productModel?: string;
    }
  | {
      kind: 'table';
      blockId: string;
      productId?: string;
      productModel?: string;
    };

interface UIState {
  activeTab: ActiveTab;
  isProductDrawerOpen: boolean;
  editingProductId: string | null;
  isAddProductToTableModalOpen: boolean;
  targetTableBlockId: string | null;
  isExportPDFModalOpen: boolean;
  isAIAssistantOpen: boolean;
  isProductKnowledgePickerModalOpen: boolean;
  knowledgePickerTarget: KnowledgePickerTarget | null;
  zoomLevel: number;
  selectedProductForWorkspaceId: string | null;
  
  // Actions
  setActiveTab: (tab: ActiveTab) => void;
  openProductDrawer: (productId?: string) => void;
  closeProductDrawer: () => void;
  openAddProductToTableModal: (blockId: string) => void;
  closeAddProductToTableModal: () => void;
  openProductKnowledgePickerModal: (target: KnowledgePickerTarget) => void;
  closeProductKnowledgePickerModal: () => void;
  openProductKnowledgeWorkspace: (productId: string) => void;
  closeProductKnowledgeWorkspace: () => void;
  setExportPDFModalOpen: (open: boolean) => void;
  setAIAssistantOpen: (open: boolean) => void;
  openAIAssistant: () => void;
  openExportModal: () => void;
  setZoomLevel: (zoom: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'editor',
  isProductDrawerOpen: false,
  editingProductId: null,
  isAddProductToTableModalOpen: false,
  targetTableBlockId: null,
  isExportPDFModalOpen: false,
  isAIAssistantOpen: false,
  isProductKnowledgePickerModalOpen: false,
  knowledgePickerTarget: null,
  zoomLevel: 100,
  selectedProductForWorkspaceId: null,

  setActiveTab: (activeTab) => set({ activeTab }),
  openProductDrawer: (editingProductId) => set({ isProductDrawerOpen: true, editingProductId: editingProductId || null }),
  closeProductDrawer: () => set({ isProductDrawerOpen: false, editingProductId: null }),
  openAddProductToTableModal: (targetTableBlockId) => set({ isAddProductToTableModalOpen: true, targetTableBlockId }),
  closeAddProductToTableModal: () => set({ isAddProductToTableModalOpen: false, targetTableBlockId: null }),
  openProductKnowledgePickerModal: (target) => set({ isProductKnowledgePickerModalOpen: true, knowledgePickerTarget: target }),
  closeProductKnowledgePickerModal: () => set({ isProductKnowledgePickerModalOpen: false, knowledgePickerTarget: null }),
  openProductKnowledgeWorkspace: (productId) => set({ activeTab: 'library', selectedProductForWorkspaceId: productId }),
  closeProductKnowledgeWorkspace: () => set({ selectedProductForWorkspaceId: null }),
  setExportPDFModalOpen: (isExportPDFModalOpen) => set({ isExportPDFModalOpen }),
  setAIAssistantOpen: (isAIAssistantOpen) => set({ isAIAssistantOpen }),
  openAIAssistant: () => set({ isAIAssistantOpen: true }),
  openExportModal: () => set({ isExportPDFModalOpen: true }),
  setZoomLevel: (zoomLevel) => set({ zoomLevel })
}));

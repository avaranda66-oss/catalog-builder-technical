import { create } from 'zustand';

export type ActiveTab = 'editor' | 'library' | 'catalogs';

interface UIState {
  activeTab: ActiveTab;
  isProductDrawerOpen: boolean;
  editingProductId: string | null;
  isAddProductToTableModalOpen: boolean;
  targetTableBlockId: string | null;
  isExportPDFModalOpen: boolean;
  isAIAssistantOpen: boolean;
  zoomLevel: number;
  
  // Actions
  setActiveTab: (tab: ActiveTab) => void;
  openProductDrawer: (productId?: string) => void;
  closeProductDrawer: () => void;
  openAddProductToTableModal: (blockId: string) => void;
  closeAddProductToTableModal: () => void;
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
  zoomLevel: 100,

  setActiveTab: (activeTab) => set({ activeTab }),
  openProductDrawer: (editingProductId) => set({ isProductDrawerOpen: true, editingProductId: editingProductId || null }),
  closeProductDrawer: () => set({ isProductDrawerOpen: false, editingProductId: null }),
  openAddProductToTableModal: (targetTableBlockId) => set({ isAddProductToTableModalOpen: true, targetTableBlockId }),
  closeAddProductToTableModal: () => set({ isAddProductToTableModalOpen: false, targetTableBlockId: null }),
  setExportPDFModalOpen: (isExportPDFModalOpen) => set({ isExportPDFModalOpen }),
  setAIAssistantOpen: (isAIAssistantOpen) => set({ isAIAssistantOpen }),
  openAIAssistant: () => set({ isAIAssistantOpen: true }),
  openExportModal: () => set({ isExportPDFModalOpen: true }),
  setZoomLevel: (zoomLevel) => set({ zoomLevel })
}));

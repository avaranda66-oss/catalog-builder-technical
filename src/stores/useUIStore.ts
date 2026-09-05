import { create } from 'zustand';
import { TablePresentationModel } from '../domain/table-core';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useWorkbookDraftStore } from '@/stores/useWorkbookDraftStore';

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
  tablePresentationDraft: { blockId: string; presentation: TablePresentationModel } | null;
  navigationEpoch: number;
  
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
  setTablePresentationDraft: (draft: { blockId: string; presentation: TablePresentationModel } | null) => void;
  advanceNavigationEpoch: () => number;
}

const invalidatePersistenceDiscardTokens = () => {
  useLibraryStore.getState().invalidateDiscardTokens();
  useWorkbookDraftStore.getState().invalidateDiscardTokens();
};

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
  tablePresentationDraft: null,
  navigationEpoch: 0,

  setActiveTab: (activeTab) => {
    invalidatePersistenceDiscardTokens();
    set((state) => ({ activeTab, navigationEpoch: state.navigationEpoch + 1 }));
  },
  openProductDrawer: (editingProductId) => set({ isProductDrawerOpen: true, editingProductId: editingProductId || null }),
  closeProductDrawer: () => set({ isProductDrawerOpen: false, editingProductId: null }),
  openAddProductToTableModal: (targetTableBlockId) => set({ isAddProductToTableModalOpen: true, targetTableBlockId }),
  closeAddProductToTableModal: () => set({ isAddProductToTableModalOpen: false, targetTableBlockId: null }),
  openProductKnowledgePickerModal: (target) => set({ isProductKnowledgePickerModalOpen: true, knowledgePickerTarget: target }),
  closeProductKnowledgePickerModal: () => set({ isProductKnowledgePickerModalOpen: false, knowledgePickerTarget: null }),
  openProductKnowledgeWorkspace: (productId) => {
    invalidatePersistenceDiscardTokens();
    set((state) => ({
      activeTab: 'library',
      selectedProductForWorkspaceId: productId,
      navigationEpoch: state.navigationEpoch + 1
    }));
  },
  closeProductKnowledgeWorkspace: () => {
    invalidatePersistenceDiscardTokens();
    set((state) => ({ selectedProductForWorkspaceId: null, navigationEpoch: state.navigationEpoch + 1 }));
  },
  setExportPDFModalOpen: (isExportPDFModalOpen) => set({ isExportPDFModalOpen }),
  setAIAssistantOpen: (isAIAssistantOpen) => set({ isAIAssistantOpen }),
  openAIAssistant: () => set({ isAIAssistantOpen: true }),
  openExportModal: () => set({ isExportPDFModalOpen: true }),
  setZoomLevel: (zoomLevel) => set({ zoomLevel }),
  setTablePresentationDraft: (tablePresentationDraft) => set({ tablePresentationDraft }),
  advanceNavigationEpoch: () => {
    invalidatePersistenceDiscardTokens();
    let next = 0;
    set((state) => {
      next = state.navigationEpoch + 1;
      return { navigationEpoch: next };
    });
    return next;
  }
}));

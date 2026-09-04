import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Trash2,
  Download,
  History,
  Check,
  X,
  AlertCircle,
  Clock,
  Users,
  ShieldCheck,
  RefreshCw,
  Lock,
  Pencil,
  Image as ImageIcon,
  MoreHorizontal,
  Layers,
  BookOpen
} from 'lucide-react';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useAssetStore } from '../../stores/useAssetStore';
import { Product, ProductFamily } from '../../domain/product.schema';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import { LibraryHistoryDrawer } from './LibraryHistoryDrawer';
import { CellHistoryModal } from './CellHistoryModal';
import { ProductAssetManager } from './ProductAssetManager';
import { DeleteFamilyModal } from './DeleteFamilyModal';
import { RenameFamilyModal } from './RenameFamilyModal';
import { ProductKnowledgeWorkspace } from './product-workspace/ProductKnowledgeWorkspace';

export const LibraryView: React.FC = () => {
  const {
    products,
    families,
    changeEvents,
    selectedFamily,
    setSelectedFamily,
    getColumnsForFamily,
    createFamily,
    addFamilyColumn,
    renameFamilyColumn,
    removeFamilyColumn,
    addProduct,
    deleteProduct,
    updateProductCell,
    flushLibraryEdits,
    loadWorkspace,
    initRealtimeSubscription,
    setFocusedCell,
    cellPresence,
    familyPresence,
    recentEditedCells,
    syncStatus,
    syncError,
    workspaceLoaded,
    workspaceSource,
    renameFamily,
    deleteFamily
  } = useLibraryStore();

  const isAdmin = useAuthStore((state) => state.role === 'admin');
  const currentUserId = useAuthStore((state) => state.userId);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeCellInfo, setActiveCellInfo] = useState<{ rowIdx: number; colKey: string; value: string; productId: string } | null>(null);

  // Modais de Criação / Edição de Colunas
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const [editingColKey, setEditingColKey] = useState<string | null>(null);
  const [editingColLabel, setEditingColLabel] = useState('');

  // Modo de Inserção de Novo Produto (Sem defaults sintéticos)
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [newProductCode, setNewProductCode] = useState('');
  const [newProductModel, setNewProductModel] = useState('');

  // Modais de Gestão de Famílias (Criação, Rename, Safe Delete)
  const [isAddingFamily, setIsAddingFamily] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [newFamilyDesc, setNewFamilyDesc] = useState('');

  const [familyToRename, setFamilyToRename] = useState<ProductFamily | null>(null);
  const [isRenamingFamily, setIsRenamingFamily] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [familyToDelete, setFamilyToDelete] = useState<ProductFamily | null>(null);
  const [isDeletingFamily, setIsDeletingFamily] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [openMenuFamilyId, setOpenMenuFamilyId] = useState<string | null>(null);

  // Drawer de Histórico Geral e Modal de Célula
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [cellHistoryTarget, setCellHistoryTarget] = useState<{
    productId: string;
    productModel: string;
    fieldKey: string;
    fieldLabel: string;
    currentValue: string;
  } | null>(null);

  // Modal de Fotos & Arquivos Corporativos
  const [selectedProductForAssets, setSelectedProductForAssets] = useState<Product | null>(null);
  const [selectedProductForWorkspace, setSelectedProductForWorkspace] = useState<Product | null>(null);
  const selectedProductForWorkspaceId = useUIStore((state) => state.selectedProductForWorkspaceId);
  const closeProductKnowledgeWorkspace = useUIStore((state) => state.closeProductKnowledgeWorkspace);
  const { loadWorkspaceAssets, productAssets } = useAssetStore();

  // Sincroniza abertura do Product Knowledge Workspace disparado pelo Inspector (Emenda 14)
  useEffect(() => {
    if (selectedProductForWorkspaceId && products.length > 0) {
      const found = products.find((p) => p.id === selectedProductForWorkspaceId);
      if (found) {
        setSelectedProductForWorkspace(found);
      }
    }
  }, [selectedProductForWorkspaceId, products]);

  // Fecha o dropdown de opções da família ao clicar fora
  useEffect(() => {
    const handleClickOutside = () => setOpenMenuFamilyId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Inicialização e Assinatura Realtime
  useEffect(() => {
    void loadWorkspace();
    void loadWorkspaceAssets();
    const unsubLib = initRealtimeSubscription();
    return () => {
      unsubLib();
    };
  }, [loadWorkspace, loadWorkspaceAssets, initRealtimeSubscription, currentUserId]);

  // Listener para Ctrl+S na Biblioteca
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void flushLibraryEdits();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flushLibraryEdits]);

  // Handlers para Renomear e Excluir Família
  const handleConfirmRenameFamily = async (newName: string) => {
    if (!familyToRename) return;
    setIsRenamingFamily(true);
    setRenameError(null);
    const res = await renameFamily(familyToRename.id, newName);
    setIsRenamingFamily(false);
    if (res.success) {
      setFamilyToRename(null);
    } else {
      setRenameError(res.error || 'Erro ao renomear família');
    }
  };

  const handleConfirmDeleteFamily = async () => {
    if (!familyToDelete) return;
    setIsDeletingFamily(true);
    setDeleteError(null);
    const res = await deleteFamily(familyToDelete.id);
    setIsDeletingFamily(false);
    if (res.success) {
      setFamilyToDelete(null);
    } else {
      setDeleteError(res.error || 'Erro ao excluir família');
    }
  };

  const isCloudEmpty = workspaceLoaded && workspaceSource === 'cloud' && families.length === 0;

  // Lista de famílias (do banco ou fallback offline)
  const availableFamilies = families.length > 0
    ? families.map(f => f.name)
    : (isCloudEmpty ? [] : Array.from(new Set(products.map(p => p.family || 'Geral'))));

  const currentFamily = selectedFamily || availableFamilies[0] || '';
  const activeFamilyObj = families.find(
    f => f.name === currentFamily || f.slug === currentFamily || f.id === currentFamily
  );
  const columnsForFamily = currentFamily ? getColumnsForFamily(currentFamily) : [];

  // Produtos filtrados da família ativa (ID First: match primário por family_id)
  const familyProducts = products.filter((p) => {
    const matchesFamily = activeFamilyObj
      ? p.family_id === activeFamilyObj.id || (!p.family_id && p.family?.trim().toLowerCase() === activeFamilyObj.name.trim().toLowerCase())
      : (p.family === currentFamily || p.family?.toLowerCase() === currentFamily.toLowerCase());

    return (
      matchesFamily &&
      (p.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  // Inserir Novo Produto com Identidade Mínima Válida e SEM Defaults Sintéticos
  const handleAddNewRow = async (customCode?: string, customModel?: string) => {
    const code = customCode?.trim();
    if (!code) {
      setIsAddingProduct(true);
      return;
    }
    const model = customModel?.trim() || code;
    const newProd: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'version'> = {
      code,
      family: currentFamily,
      model,
      description: '',
      specs: {
        range: '',
        unit: '',
        accuracy: '',
        output: '',
        powerSupply: '',
        processConnection: '',
        protectionDegree: '',
        customSpecs: {}
      },
      imageUrl: ''
    };
    await addProduct(newProd);
  };

  const handleConfirmAddProduct = async () => {
    if (!newProductCode.trim()) {
      alert('O código do produto é obrigatório.');
      return;
    }
    await handleAddNewRow(newProductCode, newProductModel);
    setNewProductCode('');
    setNewProductModel('');
    setIsAddingProduct(false);
  };

  // Criar Nova Coluna
  const handleConfirmAddColumn = async () => {
    if (!newColumnLabel.trim()) return;
    const key = `spec_${Date.now()}`;
    const res = await addFamilyColumn(currentFamily, key, newColumnLabel.trim());
    if (res.success) {
      setNewColumnLabel('');
      setIsAddingColumn(false);
    } else {
      alert(res.error || 'Erro ao criar coluna no servidor');
    }
  };

  // Renomear Coluna
  const handleConfirmRenameColumn = async () => {
    if (!editingColKey || !editingColLabel.trim()) return;
    const targetCol = columnsForFamily.find(c => c.key === editingColKey);
    const res = await renameFamilyColumn(targetCol?.id || '', currentFamily, editingColLabel.trim());
    if (res.success) {
      setEditingColKey(null);
      setEditingColLabel('');
    } else {
      alert(res.error || 'Erro ao renomear coluna no servidor');
    }
  };

  // Excluir Coluna
  const handleDeleteColumn = async (col: any) => {
    if (col.isSystem) return;
    if (confirm(`Remover a coluna "${col.label}" desta família?\n\nOs valores existentes serão preservados no histórico/dados e poderão ser recuperados.`)) {
      const res = await removeFamilyColumn(col.id || '', currentFamily, col.key);
      if (!res.success) {
        alert(res.error || 'Erro ao excluir coluna no servidor');
      }
    }
  };

  // Criar Nova Família
  const handleConfirmAddFamily = async () => {
    if (!newFamilyName.trim()) return;
    await createFamily(newFamilyName.trim(), newFamilyDesc.trim());
    setNewFamilyName('');
    setNewFamilyDesc('');
    setIsAddingFamily(false);
  };

  // Exportar CSV
  const handleExportCSV = () => {
    const headers = ['#', ...columnsForFamily.map((c) => c.label)];
    const rows = familyProducts.map((p, idx) => [
      idx + 1,
      ...columnsForFamily.map((c) => {
        if (c.key in p) return (p as any)[c.key] || '';
        if (c.key in p.specs) return (p.specs as any)[c.key] || '';
        return p.specs?.customSpecs?.[c.key] || '';
      })
    ]);

    const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `presys_biblioteca_${currentFamily.toLowerCase().replace(/\s+/g, '_')}.csv`;
    link.click();
  };

  // Formatação do Sync Banner
  const renderSyncBanner = () => {
    if (syncStatus === 'saving') {
      return (
        <span className="text-[10px] text-amber-700 font-mono font-medium flex items-center gap-1">
          <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
          Salvando alterações...
        </span>
      );
    }
    if (syncStatus === 'dirty') {
      return (
        <span className="text-[10px] text-blue-700 font-mono font-medium flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          Alterações pendentes (Ctrl+S para salvar)
        </span>
      );
    }
    if (syncStatus === 'conflict') {
      return (
        <span className="text-[10px] text-rose-700 font-mono font-bold flex items-center gap-1">
          <AlertCircle className="w-3 h-3 text-rose-600" />
          {syncError || 'Conflito detectado! Verifique seus dados.'}
        </span>
      );
    }
    if (syncStatus === 'error') {
      return (
        <span className="text-[10px] text-rose-700 font-mono font-medium flex items-center gap-1">
          <AlertCircle className="w-3 h-3 text-rose-600" />
          {syncError || 'Erro ao sincronizar.'}
        </span>
      );
    }
    return (
      <span className="text-[10px] text-emerald-700 font-mono font-medium flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Sincronizado
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white select-none overflow-hidden text-xs">
      {/* 1. Banner Superior com Informação de Sincronização e Auditoria */}
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-700 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          Biblioteca Corporativa em Nuvem: {isAdmin ? 'Todas as edições são persistidas via CAS no PostgreSQL e auditadas em tempo real.' : 'Como Colaborador, a Biblioteca oficial está em modo somente-leitura.'}
        </span>
        {renderSyncBanner()}
      </div>

      {/* 2. Barra de Fórmulas / Célula Ativa Estilo Excel */}
      <div className="h-9 bg-[#f8fafc] border-b border-slate-300 px-3 flex items-center justify-between shrink-0 gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-mono font-bold text-slate-700 bg-white px-2 py-0.5 border border-slate-300 rounded text-[11px] shrink-0">
            {activeCellInfo ? `R${activeCellInfo.rowIdx + 1}:${activeCellInfo.colKey}` : 'A1'}
          </span>
          <span className="text-slate-400 font-mono text-[11px]">|</span>
          <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-white border border-slate-300 rounded px-2 py-0.5">
            <span className="text-slate-400 text-[10px] font-mono shrink-0">fx:</span>
            <span className="text-slate-800 font-mono text-[11px] truncate">
              {activeCellInfo?.value !== undefined ? activeCellInfo.value : 'Clique em qualquer célula para editar diretamente'}
            </span>
          </div>
        </div>

        {/* Busca e Ações Rápidas */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar código ou modelo..."
              className="pl-7 pr-2 py-0.5 text-xs bg-white border border-slate-300 rounded-none focus:border-[#003366] focus:outline-none w-48 font-sans"
            />
          </div>

          <button
            onClick={() => setIsHistoryDrawerOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-300 rounded-none transition-colors shadow-2xs"
            title="Ver histórico de alterações recentes"
          >
            <History className="w-3.5 h-3.5 text-[#003366]" />
            <span>Histórico</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setIsAddingColumn(true)}
              className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-300 rounded-none transition-colors shadow-2xs"
              title="Adicionar coluna customizada para esta família"
            >
              <Plus className="w-3 h-3 text-[#003366]" />
              <span>+ Coluna</span>
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-300 rounded-none transition-colors shadow-2xs"
            title="Exportar tabela como CSV"
          >
            <Download className="w-3 h-3 text-slate-600" />
            <span>Exportar CSV</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => {
                setIsAddingProduct((prev) => !prev);
                setIsAddingColumn(false);
              }}
              className="flex items-center gap-1 px-3 py-1 bg-[#003366] hover:bg-[#002244] text-white text-xs font-bold rounded-none shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Adicionar Produto</span>
            </button>
          )}
        </div>
      </div>

      {/* Formulário Inline para Novo Produto */}
      {isAdmin && isAddingProduct && (
        <div className="bg-emerald-50/90 border-b border-emerald-300 px-4 py-2 flex items-center gap-3 animate-in fade-in duration-100">
          <span className="font-bold text-xs text-emerald-950">Novo Produto na Família:</span>
          <input
            type="text"
            value={newProductCode}
            onChange={(e) => setNewProductCode(e.target.value)}
            placeholder="Código * (ex: TA-650)"
            className="px-2 py-1 bg-white border border-emerald-300 rounded text-xs w-48 font-mono focus:outline-none focus:border-[#003366]"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && void handleConfirmAddProduct()}
          />
          <input
            type="text"
            value={newProductModel}
            onChange={(e) => setNewProductModel(e.target.value)}
            placeholder="Modelo (ex: TA-650-Advanced)"
            className="px-2 py-1 bg-white border border-emerald-300 rounded text-xs w-56 focus:outline-none focus:border-[#003366]"
            onKeyDown={(e) => e.key === 'Enter' && void handleConfirmAddProduct()}
          />
          <button
            onClick={() => void handleConfirmAddProduct()}
            className="px-3 py-1 bg-[#003366] hover:bg-[#002244] text-white text-xs font-bold rounded shadow-xs"
          >
            Adicionar
          </button>
          <button
            onClick={() => {
              setIsAddingProduct(false);
              setNewProductCode('');
              setNewProductModel('');
            }}
            className="px-2 py-1 text-slate-500 hover:text-slate-700 text-xs"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Formulário Inline para Nova Coluna */}
      {isAdmin && isAddingColumn && (
        <div className="bg-blue-50/80 border-b border-blue-200 px-4 py-2 flex items-center gap-3 animate-in fade-in duration-100">
          <span className="font-bold text-xs text-blue-900">Nova Coluna:</span>
          <input
            type="text"
            value={newColumnLabel}
            onChange={(e) => setNewColumnLabel(e.target.value)}
            placeholder="Nome da coluna (ex: Conexão de Processo)"
            className="px-2 py-1 bg-white border border-blue-300 rounded text-xs w-64 focus:outline-none focus:border-[#003366]"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && void handleConfirmAddColumn()}
          />
          <button
            onClick={() => void handleConfirmAddColumn()}
            className="px-2.5 py-1 bg-[#003366] text-white font-bold rounded text-xs hover:bg-[#002244]"
          >
            Confirmar
          </button>
          <button
            onClick={() => { setIsAddingColumn(false); setNewColumnLabel(''); }}
            className="px-2 py-1 bg-white border border-slate-300 text-slate-600 rounded text-xs hover:bg-slate-100"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Formulário Inline para Nova Família */}
      {isAdmin && isAddingFamily && (
        <div className="bg-emerald-50/80 border-b border-emerald-200 px-4 py-2 flex items-center gap-3 animate-in fade-in duration-100">
          <span className="font-bold text-xs text-emerald-900">Nova Família:</span>
          <input
            type="text"
            value={newFamilyName}
            onChange={(e) => setNewFamilyName(e.target.value)}
            placeholder="Nome da família (ex: Calibradores de Vazão)"
            className="px-2 py-1 bg-white border border-emerald-300 rounded text-xs w-64 focus:outline-none focus:border-emerald-700"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && void handleConfirmAddFamily()}
          />
          <input
            type="text"
            value={newFamilyDesc}
            onChange={(e) => setNewFamilyDesc(e.target.value)}
            placeholder="Descrição opcional"
            className="px-2 py-1 bg-white border border-emerald-300 rounded text-xs w-64 focus:outline-none focus:border-emerald-700"
          />
          <button
            onClick={() => void handleConfirmAddFamily()}
            className="px-2.5 py-1 bg-emerald-700 text-white font-bold rounded text-xs hover:bg-emerald-800"
          >
            Criar Família
          </button>
          <button
            onClick={() => { setIsAddingFamily(false); setNewFamilyName(''); setNewFamilyDesc(''); }}
            className="px-2 py-1 bg-white border border-slate-300 text-slate-600 rounded text-xs hover:bg-slate-100"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* 3. Tabela Principal de Produtos ou Estado Vazio Real */}
      {isCloudEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50/50 text-center select-none">
          <div className="w-14 h-14 rounded-full bg-slate-200/80 flex items-center justify-center text-slate-500 mb-3 shadow-2xs">
            <Layers className="w-7 h-7 text-[#003366]" />
          </div>
          <h2 className="text-base font-bold text-slate-800 mb-1">
            Nenhuma família cadastrada na biblioteca
          </h2>
          <p className="text-xs text-slate-500 max-w-sm mb-5 leading-relaxed">
            Crie a primeira família de produtos para começar a organizar as especificações técnicas e o catálogo da sua empresa.
          </p>
          {isAdmin && (
            <button
              onClick={() => setIsAddingFamily(true)}
              className="px-4 py-2 bg-[#003366] hover:bg-[#002244] text-white text-xs font-bold rounded shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Criar Primeira Família</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-slate-100 p-2">
        <table className="w-full border-collapse bg-white border border-slate-300 shadow-xs">
          <thead>
            <tr className="bg-[#f1f5f9] border-b border-slate-300 text-slate-700 text-left font-bold select-none sticky top-0 z-10 shadow-2xs">
              <th className="w-12 p-2 border-r border-slate-300 text-center font-mono text-[11px] bg-slate-200/80">#</th>
              {columnsForFamily.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width ? `${col.width}px` : 'auto', minWidth: '120px' }}
                  className="p-2 border-r border-slate-300 text-slate-800 group relative hover:bg-slate-200/50 transition-colors"
                >
                  {editingColKey === col.key ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editingColLabel}
                        onChange={(e) => setEditingColLabel(e.target.value)}
                        className="w-full px-1 py-0.5 bg-white border border-[#003366] text-xs font-bold text-slate-900 rounded focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && void handleConfirmRenameColumn()}
                      />
                      <button onClick={() => void handleConfirmRenameColumn()} className="p-0.5 text-emerald-600 hover:text-emerald-800" title="Confirmar">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingColKey(null)} className="p-0.5 text-rose-600 hover:text-rose-800" title="Cancelar">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pr-7">
                      <span className="truncate block font-bold" title={col.label}>{col.label}</span>
                      {col.isSystem && (
                        <span className="text-slate-400 shrink-0" title="Campo obrigatório universal">
                          <Lock className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  )}

                  {/* Ações de Coluna em Overlay Absoluto (Zero Layout Shift / Zero Jitter) */}
                  {!editingColKey && isAdmin && col.isCustom && (
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-slate-200/95 backdrop-blur-2xs px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-2xs">
                      <button
                        onClick={() => { setEditingColKey(col.key); setEditingColLabel(col.label); }}
                        className="p-1 text-slate-600 hover:text-[#003366] rounded hover:bg-white transition-colors"
                        title="Renomear coluna"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => void handleDeleteColumn(col)}
                        className="p-1 text-slate-600 hover:text-rose-600 rounded hover:bg-white transition-colors"
                        title="Excluir coluna"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </th>
              ))}
              <th className="w-28 p-2 text-center text-slate-700 font-bold border-r border-slate-200">PIM / Conhecimento</th>
              <th className="w-28 p-2 text-center text-slate-500 font-bold border-r border-slate-200">Fotos & Assets</th>
              {isAdmin && <th className="w-10 p-2 text-center text-slate-500">Ações</th>}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {familyProducts.map((product, rowIdx) => {
              const rowPresence = Object.entries(cellPresence).filter(([k]) => k.startsWith(product.id));
              const isRecentEdited = recentEditedCells[product.id] && (Date.now() - recentEditedCells[product.id].timestamp < 4000);
              const productAssetCount = productAssets.filter((pa) => pa.product_id === product.id).length;

              return (
                <tr
                  key={product.id}
                  className={`hover:bg-blue-50/40 transition-colors ${
                    isRecentEdited ? 'bg-emerald-50/80 duration-500' : 'bg-white'
                  }`}
                >
                  {/* Número da Linha + Indicador de Presença */}
                  <td className="p-1.5 border-r border-slate-300 text-center font-mono text-slate-500 bg-slate-50/80 relative">
                    <span>{rowIdx + 1}</span>
                    {rowPresence.length > 0 && (
                      <span
                        className="absolute right-0.5 top-1 w-2 h-2 rounded-full bg-blue-500"
                        title="Colaborador ativo nesta linha"
                      />
                    )}
                  </td>

                  {/* Células de Dados */}
                  {columnsForFamily.map((col) => {
                    let currentValue = '';
                    if (col.key in product) currentValue = (product as any)[col.key] || '';
                    else if (col.key in product.specs) currentValue = (product.specs as any)[col.key] || '';
                    else currentValue = product.specs?.customSpecs?.[col.key] || '';

                    const cellKey = `${product.id}:${col.key}`;
                    const activePresences = (cellPresence[cellKey] || []).filter(p => p.userId !== currentUserId);
                    const isConcurrentEditing = activePresences.some(p => p.activity === 'editing');

                    return (
                      <td
                        key={col.key}
                        className={`p-0 border-r border-slate-200 relative group ${
                          isConcurrentEditing ? 'bg-amber-50 ring-1 ring-amber-400' : ''
                        }`}
                      >
                        <input
                          type="text"
                          value={currentValue}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateProductCell(product.id, col.key, val);
                            setActiveCellInfo({ rowIdx, colKey: col.key, value: val, productId: product.id });
                            setFocusedCell(product.id, col.key, true);
                          }}
                          onFocus={() => {
                            setActiveCellInfo({ rowIdx, colKey: col.key, value: currentValue, productId: product.id });
                            setFocusedCell(product.id, col.key, false);
                          }}
                          onBlur={() => {
                            void flushLibraryEdits();
                            setFocusedCell(null, null, false);
                          }}
                          className={`w-full h-full px-2.5 py-1.5 bg-transparent border border-transparent focus:border-[#003366] focus:bg-white focus:outline-none text-xs text-slate-800 ${
                            col.key === 'code' || col.key === 'model'
                              ? 'font-bold font-mono text-slate-900'
                              : 'font-normal'
                          }`}
                          readOnly={!isAdmin}
                        />

                        {/* Botão de Histórico da Célula */}
                        <button
                          onClick={() => {
                            setCellHistoryTarget({
                              productId: product.id,
                              productModel: product.model,
                              fieldKey: col.key,
                              fieldLabel: col.label,
                              currentValue
                            });
                          }}
                          className="hidden group-hover:flex absolute right-1 top-1 p-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-[#003366] transition-colors"
                          title="Ver histórico desta célula"
                        >
                          <Clock className="w-3 h-3" />
                        </button>

                        {/* Presença na Célula */}
                        {activePresences.length > 0 && (
                          <div
                            className="absolute -top-2 right-1 flex items-center gap-0.5 bg-blue-600 text-white text-[9px] font-bold px-1 rounded-full shadow-xs z-20 pointer-events-none"
                            title={`${activePresences.map(p => p.userName).join(', ')} está ${isConcurrentEditing ? 'editando' : 'nesta célula'}`}
                          >
                            <span>{activePresences[0].userName?.slice(0, 2).toUpperCase()}</span>
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* PIM / Conhecimento Técnico */}
                  <td className="p-1 border-r border-slate-200 text-center">
                    <button
                      onClick={() => setSelectedProductForWorkspace(product)}
                      className="px-2 py-1 bg-[#003366] hover:bg-[#002244] text-white rounded text-[11px] font-bold transition-colors flex items-center justify-center gap-1 mx-auto shadow-2xs cursor-pointer"
                      title="Abrir Workspace de Conhecimento Técnico (PIM)"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Workspace</span>
                    </button>
                  </td>

                  {/* Fotos & Arquivos */}
                  <td className="p-1 border-r border-slate-200 text-center">
                    <button
                      onClick={() => setSelectedProductForAssets(product)}
                      className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors flex items-center justify-center gap-1 mx-auto ${
                        productAssetCount > 0
                          ? 'bg-blue-50 text-[#003366] border-blue-200 hover:bg-blue-100 shadow-2xs'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                      title="Gerenciar fotos, vistas e documentos deste produto"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-[#003366]" />
                      <span>{productAssetCount > 0 ? `${productAssetCount} ${productAssetCount === 1 ? 'foto' : 'fotos'}` : '+ Foto'}</span>
                    </button>
                  </td>

                  {/* Excluir Linha */}
                  {isAdmin && (
                    <td className="p-1.5 text-center">
                      <button
                        onClick={() => {
                          if (confirm(`Deseja realmente excluir o produto "${product.model}"?`)) {
                            void deleteProduct(product.id);
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                        title="Excluir produto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}

            {familyProducts.length === 0 && (
              <tr>
                <td
                  colSpan={columnsForFamily.length + (isAdmin ? 3 : 2)}
                  className="p-8 text-center text-slate-400 italic text-xs"
                >
                  Nenhum produto cadastrado nesta família. Clique em "+ Adicionar Produto" para cadastrar o primeiro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* 4. Barra Inferior com Abas de Famílias Estilo Excel / Google Sheets */}
      <div className="h-8 bg-[#f1f5f9] border-t border-slate-300 px-2 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-1 overflow-x-auto h-full py-0.5">
          {availableFamilies.map((fam) => {
            const isActive = fam === currentFamily;
            const famObj = families.find(f => f.name === fam || f.slug === fam);
            const famPresences = famObj ? (familyPresence[famObj.id] || []).filter(p => p.userId !== currentUserId) : [];

            return (
              <div
                key={fam}
                onClick={() => setSelectedFamily(fam)}
                className={`group relative px-3 py-1 text-xs font-semibold rounded-t border-t border-l border-r transition-all flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? 'bg-white text-[#003366] border-slate-300 shadow-2xs -mb-1 z-10'
                    : 'bg-slate-200/70 text-slate-600 hover:bg-slate-200 border-transparent'
                }`}
              >
                <span>{fam}</span>
                {famPresences.length > 0 && (
                  <span className="flex items-center gap-0.5 bg-blue-100 text-blue-800 text-[9px] px-1 py-0.2 rounded-full font-bold">
                    <Users className="w-2.5 h-2.5" />
                    <span>{famPresences.length}</span>
                  </span>
                )}

                {isAdmin && famObj && (
                  <div className="relative inline-flex items-center ml-0.5">
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={openMenuFamilyId === famObj.id}
                      aria-label={`Opções da família ${fam}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuFamilyId(openMenuFamilyId === famObj.id ? null : famObj.id);
                      }}
                      className={`p-0.5 rounded hover:bg-slate-300/60 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer ${
                        openMenuFamilyId === famObj.id ? 'bg-slate-300/80 text-slate-900' : 'opacity-60 group-hover:opacity-100'
                      }`}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>

                    {openMenuFamilyId === famObj.id && (
                      <div
                        role="menu"
                        className="absolute bottom-full mb-1 left-0 bg-white border border-slate-200 rounded shadow-lg py-1 w-36 z-50 animate-in fade-in zoom-in-95 duration-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenMenuFamilyId(null);
                            setFamilyToRename(famObj);
                            setRenameError(null);
                          }}
                          className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2 transition-colors font-normal cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5 text-slate-500" />
                          <span>Renomear</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenMenuFamilyId(null);
                            setFamilyToDelete(famObj);
                            setDeleteError(null);
                          }}
                          className="w-full px-3 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors font-normal cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          <span>Excluir família</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {isAdmin && (
            <button
              onClick={() => setIsAddingFamily(true)}
              className="px-2 py-0.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded text-xs font-bold flex items-center gap-0.5 ml-1 cursor-pointer"
              title="Criar nova família de produtos"
            >
              <Plus className="w-3 h-3" />
              <span>Nova Família</span>
            </button>
          )}
        </div>

        <div className="text-[10px] text-slate-500 font-mono pr-2">
          Total: {familyProducts.length} itens listados
        </div>
      </div>

      {/* Drawer de Histórico de Atividades */}
      <LibraryHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        events={changeEvents}
        currentFamilyName={currentFamily}
        selectedProductId={activeCellInfo?.productId}
      />

      {/* Modal de Histórico de Célula */}
      {cellHistoryTarget && (
        <CellHistoryModal
          isOpen={Boolean(cellHistoryTarget)}
          onClose={() => setCellHistoryTarget(null)}
          productModel={cellHistoryTarget.productModel}
          fieldKey={cellHistoryTarget.fieldKey}
          fieldLabel={cellHistoryTarget.fieldLabel}
          currentValue={cellHistoryTarget.currentValue}
          events={changeEvents.filter(ev => ev.product_id === cellHistoryTarget.productId || ev.entity_id === cellHistoryTarget.productId)}
        />
      )}

      {/* Modal de Gestão de Fotos & Arquivos do Produto */}
      {selectedProductForAssets && (
        <ProductAssetManager
          product={selectedProductForAssets}
          onClose={() => setSelectedProductForAssets(null)}
        />
      )}

      {/* Modal de Renomear Família */}
      {familyToRename && (
        <RenameFamilyModal
          isOpen={Boolean(familyToRename)}
          family={familyToRename}
          existingFamilies={families}
          onClose={() => {
            setFamilyToRename(null);
            setRenameError(null);
          }}
          onConfirm={handleConfirmRenameFamily}
          isRenaming={isRenamingFamily}
          errorMessage={renameError}
        />
      )}

      {/* Modal de Excluir Família */}
      {familyToDelete && (
        <DeleteFamilyModal
          isOpen={Boolean(familyToDelete)}
          family={familyToDelete}
          productCount={
            products.filter(
              (p) =>
                p.family_id === familyToDelete.id ||
                (p.family && p.family.trim().toLowerCase() === familyToDelete.name.trim().toLowerCase())
            ).length
          }
          onClose={() => {
            setFamilyToDelete(null);
            setDeleteError(null);
          }}
          onConfirm={handleConfirmDeleteFamily}
          isDeleting={isDeletingFamily}
          errorMessage={deleteError}
        />
      )}

      {/* Modal / Workspace de Conhecimento Técnico Canônico PIM */}
      {selectedProductForWorkspace && (
        <ProductKnowledgeWorkspace
          product={selectedProductForWorkspace}
          family={families.find((f) => f.id === selectedProductForWorkspace.family_id)}
          onClose={() => {
            setSelectedProductForWorkspace(null);
            closeProductKnowledgeWorkspace();
          }}
          availableProducts={products}
        />
      )}
    </div>
  );
};

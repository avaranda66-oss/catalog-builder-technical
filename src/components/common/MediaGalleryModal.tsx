import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Image as ImageIcon,
  Trash2,
  Loader2,
  Link2,
  Search,
  Edit2,
  Check
} from 'lucide-react';
import { useMediaStore, MediaAsset } from '../../stores/useMediaStore';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useAuthStore } from '../../stores/useAuthStore';

export const MediaGalleryModal: React.FC = () => {
  const {
    assets,
    isGalleryOpen,
    galleryTargetCallback,
    closeGallery,
    addAsset,
    addUrlAsset,
    updateAsset,
    deleteAsset,
    isUploading
  } = useMediaStore();
  const { products } = useLibraryStore();
  const canManageMedia = useAuthStore((state) => state.role === 'admin');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'all' | 'products' | 'covers' | 'upload'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newUrlName, setNewUrlName] = useState('');
  const [newCategory, setNewCategory] = useState<MediaAsset['category']>('cover');

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadCategory, setUploadCategory] = useState<MediaAsset['category']>('cover');

  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<MediaAsset['category']>('cover');
  const [editTags, setEditTags] = useState('');

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isGalleryOpen) return null;

  const handleSelectImage = (url: string) => {
    if (galleryTargetCallback) {
      galleryTargetCallback(url);
      closeGallery();
    }
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadName(file.name.replace(/\.[^/.]+$/, ''));
  };

  const handleExecuteUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    const created = await addAsset(uploadFile, uploadCategory, uploadName.trim());
    if (created) {
      setSuccessMessage(`Foto "${created.name}" adicionada somente neste dispositivo.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      setUploadFile(null);
      setUploadName('');
      setActiveTab('all');
    }
  };

  const handleAddUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    addUrlAsset(newUrl.trim(), newUrlName.trim() || 'Imagem Externa', newCategory);
    setSuccessMessage(`Imagem adicionada com sucesso!`);
    setTimeout(() => setSuccessMessage(null), 4000);
    setNewUrl('');
    setNewUrlName('');
    setActiveTab('all');
  };

  const handleStartEdit = (asset: MediaAsset, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAssetId(asset.id);
    setEditName(asset.name);
    setEditCategory(asset.category);
    setEditTags(asset.tags?.join(', ') || '');
  };

  const handleSaveEdit = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tagsArray = editTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    updateAsset(id, {
      name: editName.trim() || 'Sem Título',
      category: editCategory,
      tags: tagsArray
    });

    setEditingAssetId(null);
    setSuccessMessage('Informações da imagem atualizadas com sucesso!');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleDelete = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Tem certeza que deseja excluir a imagem "${name}" do banco de dados?`)) {
      deleteAsset(id);
      setSuccessMessage(`Imagem "${name}" removida com sucesso.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  // Coleta imagens dos produtos da biblioteca
  const productImages: MediaAsset[] = products
    .filter((p) => Boolean(p.imageUrl))
    .map((p) => ({
      id: `prod-img-${p.id}`,
      name: `${p.code} (${p.model})`,
      url: p.imageUrl!,
      category: 'product',
      tags: [p.code.toLowerCase(), p.family.toLowerCase()],
      createdAt: p.updatedAt || new Date().toISOString()
    }));

  const allCombinedAssets = [
    ...assets,
    ...productImages.filter((pi) => !assets.some((a) => a.url === pi.url))
  ];

  const filteredAssets = allCombinedAssets.filter((item) => {
    if (activeTab === 'covers' && item.category !== 'cover') return false;
    if (activeTab === 'products' && item.category !== 'product') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchTags = item.tags?.some((t) => t.toLowerCase().includes(q));
      return matchName || matchTags;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-none shadow-2xl border border-slate-400 max-w-5xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-3.5 border-b border-slate-300 flex items-center justify-between bg-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#003366] text-white rounded-none flex items-center justify-center shadow-xs">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-mono">
                Galeria local de fotografias e mídia
              </h2>
              <p className="text-[10px] text-slate-500 font-mono">
                Sincronização segura em preparação · o conteúdo ainda não é compartilhado
              </p>
            </div>
          </div>
          <button onClick={closeGallery} className="text-slate-400 hover:text-slate-700 p-1 rounded-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notificação de Sucesso */}
        {successMessage && (
          <div className="bg-emerald-50 border-b border-emerald-300 px-4 py-2 text-xs font-bold text-emerald-800 flex items-center gap-1.5 font-mono animate-fade-in">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Abas e Filtros */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-2.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-1 w-full sm:w-auto">
            {canManageMedia && <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 text-xs font-bold rounded-none transition-colors border ${
                activeTab === 'all'
                  ? 'bg-[#003366] text-white border-[#003366]'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Todas ({allCombinedAssets.length})
            </button>}
            <button
              type="button"
              onClick={() => setActiveTab('covers')}
              className={`px-3 py-1 text-xs font-bold rounded-none transition-colors border ${
                activeTab === 'covers'
                  ? 'bg-[#003366] text-white border-[#003366]'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Capas & Banners
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('products')}
              className={`px-3 py-1 text-xs font-bold rounded-none transition-colors border ${
                activeTab === 'products'
                  ? 'bg-[#003366] text-white border-[#003366]'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Fotos de Produtos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`px-3 py-1 text-xs font-bold rounded-none transition-colors flex items-center gap-1 border ${
                activeTab === 'upload'
                  ? 'bg-[#003366] text-white border-[#003366]'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>+ Enviar Foto Nova</span>
            </button>
          </div>

          {/* Busca */}
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, modelo ou tag..."
              className="w-full pl-8 pr-3 py-1 bg-white border border-slate-300 rounded-none text-xs font-sans focus:outline-none focus:border-[#003366]"
            />
          </div>
        </div>

        {/* Conteúdo da Galeria */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-100/50">
          {canManageMedia && activeTab === 'upload' ? (
            <div className="max-w-xl mx-auto py-2 space-y-4">
              {/* Formulário de Upload Completo */}
              <form onSubmit={handleExecuteUpload} className="p-4 bg-white border border-slate-300 rounded-none space-y-3 shadow-xs">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Upload className="w-4 h-4 text-[#003366]" />
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider font-mono">
                    Carregar Foto do Computador para a Nuvem
                  </h3>
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-5 bg-slate-50 border-2 border-dashed border-slate-300 hover:border-[#003366] hover:bg-blue-50/30 rounded-none text-center cursor-pointer transition-all"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChosen}
                    accept="image/*"
                    className="hidden"
                  />
                  <ImageIcon className="w-8 h-8 mx-auto mb-2 text-[#003366]" />
                  {uploadFile ? (
                    <div>
                      <p className="font-bold text-slate-900 text-xs font-mono">{uploadFile.name}</p>
                      <p className="text-[10px] text-slate-500">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB · Clique para trocar</p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-bold text-slate-800 text-xs">Clique para selecionar a imagem</p>
                      <p className="text-[10px] text-slate-500">Formatos JPG, PNG, WebP em alta resolução</p>
                    </div>
                  )}
                </div>

                {uploadFile && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Nome / Descrição da Imagem *</label>
                      <input
                        type="text"
                        value={uploadName}
                        onChange={(e) => setUploadName(e.target.value)}
                        placeholder="Ex: Capa PCON-Y18 em Bancada Industrial"
                        required
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-none text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Categoria</label>
                      <select
                        value={uploadCategory}
                        onChange={(e) => setUploadCategory(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-none text-xs bg-white"
                      >
                        <option value="cover">Capa / Banner Full Page</option>
                        <option value="product">Foto de Produto / Equipamento</option>
                        <option value="diagram">Diagrama Técnico / Esquema</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={isUploading}
                      className="w-full py-2 bg-[#003366] hover:bg-[#002244] text-white font-bold text-xs rounded-none shadow-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Enviando para o Supabase Storage...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Salvar Imagem no Banco de Fotos</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </form>

              {/* Inserir por URL Externa */}
              <form onSubmit={handleAddUrl} className="p-4 bg-white border border-slate-300 rounded-none space-y-3 shadow-xs">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Link2 className="w-4 h-4 text-slate-600" />
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider font-mono">
                    Ou Adicionar por Link Direto (URL Externa)
                  </h4>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Nome / Descrição da Foto</label>
                  <input
                    type="text"
                    value={newUrlName}
                    onChange={(e) => setNewUrlName(e.target.value)}
                    placeholder="Ex: Foto de Campo PCON"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-none text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Categoria</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-none text-xs bg-white"
                  >
                    <option value="cover">Capa / Banner Full Page</option>
                    <option value="product">Foto de Produto / Equipamento</option>
                    <option value="diagram">Diagrama Técnico / Esquema</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">URL Pública da Imagem *</label>
                  <input
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://..."
                    required
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-none text-xs font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-none transition-colors"
                >
                  Salvar Link na Galeria
                </button>
              </form>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredAssets.length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-400 font-mono text-xs">
                  Nenhuma imagem encontrada com o termo "{searchQuery}".
                </div>
              ) : (
                filteredAssets.map((asset) => {
                  const isEditing = editingAssetId === asset.id;

                  return (
                    <div
                      key={asset.id}
                      onClick={() => !isEditing && handleSelectImage(asset.url)}
                      className="group relative bg-white border border-slate-300 hover:border-[#003366] rounded-none overflow-hidden cursor-pointer shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
                    >
                      {/* Container da Foto */}
                      <div className="w-full h-36 bg-slate-950 overflow-hidden relative flex items-center justify-center">
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        {/* Overlay para Usar */}
                        {!isEditing && (
                          <div className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center">
                            <span className="px-3 py-1 bg-[#003366] text-white rounded-none font-bold text-[10px] shadow-sm font-mono uppercase tracking-wider">
                              Usar no Catálogo
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Informações e Modo de Edição */}
                      <div className="p-2 bg-white space-y-1 border-t border-slate-200">
                        {isEditing ? (
                          <div onClick={(e) => e.stopPropagation()} className="space-y-1.5 pt-0.5">
                            <div>
                              <label className="block text-[9px] font-mono text-slate-500">Nome / Título:</label>
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full p-1 border border-slate-300 text-xs font-bold"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-mono text-slate-500">Categoria:</label>
                              <select
                                value={editCategory}
                                onChange={(e) => setEditCategory(e.target.value as any)}
                                className="w-full p-1 border border-slate-300 text-[10px] bg-white"
                              >
                                <option value="cover">Capa</option>
                                <option value="product">Produto</option>
                                <option value="diagram">Diagrama</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[9px] font-mono text-slate-500">Tags (separadas por vírgula):</label>
                              <input
                                type="text"
                                value={editTags}
                                onChange={(e) => setEditTags(e.target.value)}
                                placeholder="pcon, pressao, calibração"
                                className="w-full p-1 border border-slate-300 text-[10px]"
                              />
                            </div>
                            <div className="flex items-center gap-1 pt-1">
                              <button
                                type="button"
                                onClick={(e) => handleSaveEdit(asset.id, e)}
                                className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-none flex items-center justify-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                <span>Salvar</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingAssetId(null);
                                }}
                                className="px-2 py-1 bg-slate-200 text-slate-700 text-[10px] rounded-none"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="font-bold text-slate-900 text-xs truncate" title={asset.name}>
                              {asset.name}
                            </p>
                            <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
                              <span className="capitalize px-1 bg-slate-100 border border-slate-200">
                                {asset.category}
                              </span>

                              {/* Ações de Edição e Exclusão */}
                              {canManageMedia && <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => handleStartEdit(asset, e)}
                                  className="text-slate-400 hover:text-blue-600 p-0.5"
                                  title="Editar nome e tags da foto"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDelete(asset.id, asset.name, e)}
                                  className="text-slate-400 hover:text-red-600 p-0.5"
                                  title="Excluir foto do banco de dados"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-2.5 border-t border-slate-300 flex items-center justify-between bg-slate-100">
          <span className="text-[10px] text-slate-600 font-mono">
            {allCombinedAssets.length} foto(s) disponíveis neste dispositivo
          </span>
          <button
            onClick={closeGallery}
            className="px-4 py-1 text-xs font-bold bg-white hover:bg-slate-200 border border-slate-300 text-slate-800 rounded-none"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

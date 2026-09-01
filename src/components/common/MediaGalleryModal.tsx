import React, { useState, useRef } from 'react';
import { X, Upload, Image, Trash2, Loader2, Link2, Search } from 'lucide-react';
import { useMediaStore, MediaAsset } from '../../stores/useMediaStore';
import { useLibraryStore } from '../../stores/useLibraryStore';

export const MediaGalleryModal: React.FC = () => {
  const {
    assets,
    isGalleryOpen,
    galleryTargetCallback,
    closeGallery,
    addAsset,
    addUrlAsset,
    deleteAsset,
    isUploading
  } = useMediaStore();
  const { products } = useLibraryStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'all' | 'products' | 'covers' | 'upload'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newUrlName, setNewUrlName] = useState('');
  const [selectedAssetUrl, setSelectedAssetUrl] = useState<string | null>(null);

  if (!isGalleryOpen) return null;

  const handleSelectImage = (url: string) => {
    setSelectedAssetUrl(url);
    if (galleryTargetCallback) {
      galleryTargetCallback(url);
      closeGallery();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const created = await addAsset(file, 'cover');
    if (created && galleryTargetCallback) {
      galleryTargetCallback(created.url);
      closeGallery();
    }
  };

  const handleAddUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    addUrlAsset(newUrl.trim(), newUrlName.trim() || 'Imagem Externa', 'cover');
    if (galleryTargetCallback) {
      galleryTargetCallback(newUrl.trim());
      closeGallery();
    }
    setNewUrl('');
    setNewUrlName('');
  };

  // Coleta também imagens que já estão cadastradas nos produtos da biblioteca
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

  const allCombinedAssets = [...assets, ...productImages.filter((pi) => !assets.some((a) => a.url === pi.url))];

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
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-4xl w-full flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#003366] text-white rounded-lg flex items-center justify-center shadow-xs">
              <Image className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Banco Central de Imagens & Fotografias</h2>
              <p className="text-[11px] text-slate-500 font-mono">
                Acervo de fotos em alta resolução para Capas, Fichas Técnicas e Produtos
              </p>
            </div>
          </div>
          <button onClick={closeGallery} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas e Filtros */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-3 border-b border-slate-200 bg-slate-100/70">
          <div className="flex items-center gap-1 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'all' ? 'bg-white text-[#003366] shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todas ({allCombinedAssets.length})
            </button>
            <button
              onClick={() => setActiveTab('covers')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'covers' ? 'bg-white text-[#003366] shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Capas & Banners
            </button>
            <button
              onClick={() => setActiveTab('products')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'products' ? 'bg-white text-[#003366] shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Fotos dos Produtos
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                activeTab === 'upload' ? 'bg-white text-[#003366] shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Nova Imagem</span>
            </button>
          </div>

          {/* Busca */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome ou tag..."
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-[#003366]"
            />
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
          {activeTab === 'upload' ? (
            <div className="max-w-md mx-auto py-4 space-y-4">
              {/* Upload direto para o Supabase */}
              <div className="p-6 bg-white border-2 border-dashed border-slate-300 hover:border-[#003366] rounded-xl text-center space-y-3 transition-colors">
                <div className="w-12 h-12 bg-blue-50 text-[#003366] rounded-full flex items-center justify-center mx-auto">
                  {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-xs">Fazer Upload de Fotografia Real (Nuvem)</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Formatos JPG, PNG, WebP em alta resolução. A foto será salva no Supabase Storage.
                  </p>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="px-4 py-2 bg-[#003366] hover:bg-[#002244] text-white rounded-lg font-bold text-xs shadow-xs transition-colors"
                >
                  {isUploading ? 'Enviando Imagem...' : 'Selecionar Arquivo do Computador'}
                </button>
              </div>

              {/* Inserir via URL externa */}
              <form onSubmit={handleAddUrl} className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-2xs">
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Adicionar por Link de Imagem (URL)</span>
                </h4>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Nome / Descrição da Foto</label>
                  <input
                    type="text"
                    value={newUrlName}
                    onChange={(e) => setNewUrlName(e.target.value)}
                    placeholder="Ex: Capa PSV Portable Studio"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">URL Pública da Imagem *</label>
                  <input
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://..."
                    required
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs shadow-xs transition-colors"
                >
                  Salvar Imagem na Galeria
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
                  const isSelected = selectedAssetUrl === asset.url;
                  return (
                    <div
                      key={asset.id}
                      onClick={() => handleSelectImage(asset.url)}
                      className={`group relative bg-white border rounded-xl overflow-hidden cursor-pointer shadow-2xs hover:shadow-md transition-all flex flex-col justify-between ${
                        isSelected ? 'border-[#003366] ring-2 ring-[#003366]' : 'border-slate-200 hover:border-[#003366]'
                      }`}
                    >
                      {/* Container da Imagem */}
                      <div className="w-full h-36 bg-slate-900 overflow-hidden relative flex items-center justify-center">
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center">
                          <span className="px-3 py-1 bg-white text-[#003366] rounded-md font-bold text-[11px] shadow-sm">
                            Usar esta Foto
                          </span>
                        </div>
                      </div>

                      {/* Informações da Imagem */}
                      <div className="p-2.5 bg-white space-y-1">
                        <p className="font-bold text-slate-900 text-xs truncate" title={asset.name}>
                          {asset.name}
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span className="capitalize">{asset.category}</span>
                          {asset.isCustom && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteAsset(asset.id);
                              }}
                              className="text-slate-400 hover:text-red-600 p-0.5"
                              title="Remover da galeria"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
          <span className="text-[11px] text-slate-500 font-mono">
            {allCombinedAssets.length} imagem(ns) no acervo PRESYS
          </span>
          <button
            onClick={closeGallery}
            className="px-4 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  Image as ImageIcon,
  Loader2,
  Search,
  Star,
  Check,
  AlertTriangle,
  FileText,
  Layers
} from 'lucide-react';
import { useMediaStore, INITIAL_DEMO_MEDIA_ASSETS } from '../../stores/useMediaStore';
import { useAssetStore } from '../../stores/useAssetStore';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { ProductAssetRole, ROLE_LABELS, MediaSelection } from '@/domain/asset.schema';

type GalleryTab = 'all' | 'hero' | 'views' | 'application' | 'diagram' | 'demo' | 'upload';

export const MediaGalleryModal: React.FC = () => {
  const {
    isGalleryOpen,
    galleryTargetCallback,
    closeGallery,
    targetProductId
  } = useMediaStore();

  const {
    assets,
    productAssets,
    resolvedUrls,
    isUploading,
    uploadAndLinkAsset,
    loadWorkspaceAssets
  } = useAssetStore();

  const { products } = useLibraryStore();
  const isAdmin = useAuthStore((state) => state.role === 'admin');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<GalleryTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleForUpload, setSelectedRoleForUpload] = useState<ProductAssetRole>('hero');
  const [selectedProductForUpload, setSelectedProductForUpload] = useState<string>(targetProductId || '');
  const [captionForUpload, setCaptionForUpload] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<{ type: 'success' | 'error' | 'duplicate'; text: string } | null>(null);

  useEffect(() => {
    if (isGalleryOpen) {
      void loadWorkspaceAssets();
    }
  }, [isGalleryOpen, loadWorkspaceAssets]);

  if (!isGalleryOpen) return null;

  const handleSelectAsset = (assetId: string, url: string, originalFilename?: string, role?: ProductAssetRole) => {
    if (galleryTargetCallback) {
      // Entrega o contrato MediaSelection compatível
      const selection: MediaSelection = {
        assetId,
        url,
        originalFilename,
        role
      };
      galleryTargetCallback(selection);
      closeGallery();
    }
  };

  const handleSelectDemo = (url: string) => {
    if (galleryTargetCallback) {
      galleryTargetCallback(url);
      closeGallery();
    }
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadFeedback(null);
  };

  const handleExecuteUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setUploadFeedback(null);

    const res = await uploadAndLinkAsset(uploadFile, {
      productId: selectedProductForUpload || null,
      role: selectedRoleForUpload,
      isPrimary: selectedRoleForUpload === 'hero',
      caption: captionForUpload.trim() || undefined
    });

    if (res.success) {
      setUploadFeedback({ type: 'success', text: `Asset "${uploadFile.name}" salvo no banco corporativo com sucesso!` });
      setUploadFile(null);
      setCaptionForUpload('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => {
        setUploadFeedback(null);
        setActiveTab('all');
      }, 1500);
    } else if (res.isDuplicate) {
      setUploadFeedback({ type: 'duplicate', text: 'Este arquivo já existe no banco corporativo.' });
    } else {
      setUploadFeedback({ type: 'error', text: res.message || 'Falha ao realizar upload' });
    }
  };

  // Filtragem dos assets corporativos ativos (não arquivados)
  const activeAssets = assets.filter((a) => a.approval_status !== 'archived');

  const filteredAssets = activeAssets.filter((asset) => {
    const linked = productAssets.filter((pa) => pa.asset_id === asset.id);
    const linkedProducts = linked.map((pa) => products.find((p) => p.id === pa.product_id)).filter(Boolean);

    // Tab filter
    if (activeTab === 'hero') {
      const isHero = linked.some((pa) => pa.role === 'hero' || pa.is_primary);
      if (!isHero) return false;
    } else if (activeTab === 'views') {
      const isView = linked.some((pa) => ['front', 'rear', 'left', 'right', 'top', 'detail', 'display'].includes(pa.role));
      if (!isView) return false;
    } else if (activeTab === 'application') {
      const isApp = linked.some((pa) => pa.role === 'application');
      if (!isApp) return false;
    } else if (activeTab === 'diagram') {
      const isDiag = asset.kind === 'diagram' || asset.kind === 'document' || linked.some((pa) => ['diagram', 'datasheet'].includes(pa.role));
      if (!isDiag) return false;
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchFilename = asset.original_filename?.toLowerCase().includes(query);
      const matchCaption = linked.some((pa) => pa.caption?.toLowerCase().includes(query));
      const matchProduct = linkedProducts.some((p) => p?.model.toLowerCase().includes(query) || p?.code.toLowerCase().includes(query));
      if (!matchFilename && !matchCaption && !matchProduct) return false;
    }

    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-none shadow-2xl border border-slate-300 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#003366] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded">
              <Layers className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Banco de Imagens & Photo Bank Cloud</h3>
              <p className="text-xs text-blue-100/90 font-mono mt-0.5">
                Biblioteca Corporativa Oficial de Instrumentação e Metrologia
              </p>
            </div>
          </div>

          <button
            onClick={closeGallery}
            className="p-1 text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="Fechar galeria"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs & Search */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                activeTab === 'all'
                  ? 'bg-white text-[#003366] border border-slate-300 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({activeAssets.length})
            </button>
            <button
              onClick={() => setActiveTab('hero')}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                activeTab === 'hero'
                  ? 'bg-white text-[#003366] border border-slate-300 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Fotos Principais
            </button>
            <button
              onClick={() => setActiveTab('views')}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                activeTab === 'views'
                  ? 'bg-white text-[#003366] border border-slate-300 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vistas & Detalhes
            </button>
            <button
              onClick={() => setActiveTab('application')}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                activeTab === 'application'
                  ? 'bg-white text-[#003366] border border-slate-300 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Aplicações
            </button>
            <button
              onClick={() => setActiveTab('diagram')}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                activeTab === 'diagram'
                  ? 'bg-white text-[#003366] border border-slate-300 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Diagramas & Docs
            </button>
            <button
              onClick={() => setActiveTab('demo')}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                activeTab === 'demo'
                  ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
                  : 'text-amber-800/80 hover:text-amber-900 hover:bg-amber-50'
              }`}
            >
              Demonstração (Demo)
            </button>
            {isAdmin && (
              <button
                onClick={() => setActiveTab('upload')}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                  activeTab === 'upload'
                    ? 'bg-[#003366] text-white shadow-2xs'
                    : 'text-blue-900 hover:bg-blue-50'
                }`}
              >
                <Upload className="w-3.5 h-3.5 inline mr-1" />
                + Novo Upload
              </button>
            )}
          </div>

          {activeTab !== 'upload' && activeTab !== 'demo' && (
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por modelo, código, nome..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:border-[#003366] focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Aba de Demonstração (Estática / Isolada) */}
          {activeTab === 'demo' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 p-3 rounded text-xs text-amber-900 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Estas são fotos ilustrativas para fins de prototipagem e demonstração. Elas não constituem fotos oficiais corporativas da PRESYS.
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {INITIAL_DEMO_MEDIA_ASSETS.map((demo) => (
                  <div
                    key={demo.id}
                    onClick={() => handleSelectDemo(demo.url)}
                    className="group border border-amber-200 rounded overflow-hidden bg-white hover:border-[#003366] hover:shadow-md cursor-pointer transition-all flex flex-col justify-between"
                  >
                    <div className="h-36 bg-slate-100 flex items-center justify-center p-2 relative">
                      <img src={demo.url} alt={demo.name} className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-200" />
                      <span className="absolute top-2 left-2 bg-amber-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                        DEMO
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-50 border-t border-slate-200">
                      <p className="text-xs font-bold text-slate-800 truncate" title={demo.name}>{demo.name}</p>
                      <button className="mt-2 w-full py-1 bg-slate-200 group-hover:bg-[#003366] group-hover:text-white text-slate-700 text-[11px] font-bold rounded transition-colors">
                        Inserir Imagem
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aba de Upload Corporativo */}
          {activeTab === 'upload' && isAdmin && (
            <div className="max-w-xl mx-auto bg-slate-50 border border-slate-300 p-6 rounded shadow-2xs space-y-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-[#003366]" />
                Upload de Foto / Asset Oficial para a Nuvem
              </h4>

              {uploadFeedback && (
                <div
                  className={`p-3 text-xs font-semibold rounded border flex items-center gap-2 ${
                    uploadFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : uploadFeedback.type === 'duplicate'
                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                      : 'bg-rose-50 text-rose-800 border-rose-300'
                  }`}
                >
                  {uploadFeedback.type === 'success' && <Check className="w-4 h-4 text-emerald-600" />}
                  {uploadFeedback.type === 'duplicate' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                  {uploadFeedback.type === 'error' && <X className="w-4 h-4 text-rose-600" />}
                  <span>{uploadFeedback.text}</span>
                </div>
              )}

              <form onSubmit={handleExecuteUpload} className="space-y-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded p-6 text-center cursor-pointer transition-colors ${
                    uploadFile ? 'border-[#003366] bg-blue-50/50' : 'border-slate-300 hover:border-slate-400 bg-white'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleFileChosen}
                    className="hidden"
                  />
                  {uploadFile ? (
                    <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#003366]">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>{uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-600">
                      <span className="font-bold text-[#003366]">Clique ou arraste a imagem aqui</span>
                      <p className="text-[11px] text-slate-400 mt-1">Formatos aceitos: JPG, PNG, WEBP, PDF (Até 50MB)</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Papel da Imagem:</label>
                    <select
                      value={selectedRoleForUpload}
                      onChange={(e) => setSelectedRoleForUpload(e.target.value as ProductAssetRole)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded focus:border-[#003366] focus:outline-none"
                    >
                      {Object.entries(ROLE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Vincular a Produto (Opcional):</label>
                    <select
                      value={selectedProductForUpload}
                      onChange={(e) => setSelectedProductForUpload(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded focus:border-[#003366] focus:outline-none"
                    >
                      <option value="">Nenhum (Asset Geral)</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} — {p.model} ({p.family})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Legenda Editorial (Opcional):</label>
                  <input
                    type="text"
                    value={captionForUpload}
                    onChange={(e) => setCaptionForUpload(e.target.value)}
                    placeholder="Ex: Calibrador de bancada com acessórios montados"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded focus:border-[#003366] focus:outline-none"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={!uploadFile || isUploading}
                    className="px-5 py-2 bg-[#003366] text-white text-xs font-bold rounded shadow-2xs hover:bg-[#002244] disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Enviando para o Storage...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Enviar Foto Corporativa</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Grid de Assets Cloud */}
          {activeTab !== 'demo' && activeTab !== 'upload' && (
            <div>
              {filteredAssets.length === 0 ? (
                <div className="border border-dashed border-slate-300 rounded p-12 text-center bg-slate-50">
                  <ImageIcon className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700">Nenhum asset corporativo encontrado para este filtro.</p>
                  <p className="text-[11px] text-slate-500 mt-1">Faça o upload de imagens oficiais pela aba "+ Novo Upload" ou na Biblioteca de Produtos.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredAssets.map((asset) => {
                    const url = resolvedUrls[asset.id] || asset.storage_path;
                    const links = productAssets.filter((pa) => pa.asset_id === asset.id);
                    const primaryLink = links.find((pa) => pa.is_primary);
                    const linkedProds = links.map((pa) => products.find((p) => p.id === pa.product_id)).filter(Boolean);

                    return (
                      <div
                        key={asset.id}
                        onClick={() => handleSelectAsset(asset.id, url, asset.original_filename || '', primaryLink?.role)}
                        className="group border border-slate-300 hover:border-[#003366] rounded overflow-hidden bg-white shadow-2xs hover:shadow-md cursor-pointer transition-all flex flex-col justify-between"
                      >
                        {/* Imagem Preview */}
                        <div className="h-40 bg-slate-100 relative flex items-center justify-center p-2 border-b border-slate-200">
                          {asset.kind === 'document' || asset.mime_type === 'application/pdf' ? (
                            <div className="text-center">
                              <FileText className="w-10 h-10 text-rose-600 mx-auto mb-1" />
                              <span className="text-[10px] font-mono text-slate-600 block truncate max-w-[150px]">{asset.original_filename}</span>
                            </div>
                          ) : url ? (
                            <img
                              src={url}
                              alt={asset.original_filename || ''}
                              className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-200"
                            />
                          ) : (
                            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                          )}

                          {primaryLink && (
                            <div className="absolute top-2 left-2 bg-[#003366] text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs flex items-center gap-1">
                              <Star className="w-2.5 h-2.5 fill-amber-300 text-amber-300" />
                              <span>Principal</span>
                            </div>
                          )}

                          {links.length > 0 && (
                            <div className="absolute top-2 right-2 bg-slate-800/80 backdrop-blur-2xs text-white text-[9px] font-semibold px-1.5 py-0.5 rounded">
                              {ROLE_LABELS[links[0].role] || links[0].role}
                            </div>
                          )}
                        </div>

                        {/* Metadados & Ação */}
                        <div className="p-2.5 bg-slate-50/80 flex flex-col justify-between flex-1 space-y-1.5">
                          <div>
                            <p className="text-xs font-bold text-slate-900 truncate" title={asset.original_filename || ''}>
                              {asset.original_filename || 'Foto sem título'}
                            </p>
                            {linkedProds.length > 0 && (
                              <p className="text-[10px] text-blue-700 font-mono font-semibold truncate mt-0.5">
                                {linkedProds.map((p) => p?.model).join(', ')}
                              </p>
                            )}
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                              <span>{asset.width_px && asset.height_px ? `${asset.width_px}x${asset.height_px}` : asset.mime_type}</span>
                              <span>·</span>
                              <span>{asset.file_size ? `${(asset.file_size / 1024).toFixed(0)}KB` : ''}</span>
                            </div>
                          </div>

                          <button className="w-full py-1 bg-slate-200 group-hover:bg-[#003366] group-hover:text-white text-slate-800 text-[11px] font-bold rounded transition-colors shadow-2xs">
                            Selecionar no Catálogo
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>{filteredAssets.length} assets disponíveis no Photo Bank Cloud</span>
          <button
            onClick={closeGallery}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

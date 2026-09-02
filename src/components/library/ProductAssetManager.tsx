import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Image as ImageIcon,
  Star,
  Trash2,
  Loader2,
  Link2,
  AlertTriangle,
  Check,
  FileText,
  Layers
} from 'lucide-react';
import { Product } from '@/domain/product.schema';
import {
  ProductAssetRole,
  AssetAngle,
  ROLE_LABELS,
  ANGLE_LABELS
} from '@/domain/asset.schema';
import { useAssetStore } from '@/stores/useAssetStore';
import { useAuthStore } from '../../stores/useAuthStore';

interface ProductAssetManagerProps {
  product: Product;
  onClose: () => void;
}

const QUICK_ROLES: { role: ProductAssetRole; label: string }[] = [
  { role: 'hero', label: 'Foto Principal (Hero)' },
  { role: 'front', label: 'Frente' },
  { role: 'rear', label: 'Traseira' },
  { role: 'display', label: 'Painel / Display' },
  { role: 'application', label: 'Aplicação' },
  { role: 'diagram', label: 'Diagrama' },
  { role: 'datasheet', label: 'Certificado / Datasheet' }
];

export const ProductAssetManager: React.FC<ProductAssetManagerProps> = ({ product, onClose }) => {
  const isAdmin = useAuthStore((state) => state.role === 'admin');
  const {
    assets,
    productAssets,
    resolvedUrls,
    isUploading,
    uploadAndLinkAsset,
    linkExistingAsset,
    unlinkProductAsset,
    setPrimaryProductAsset,
    archiveAsset
  } = useAssetStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados de Upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedRole, setSelectedRole] = useState<ProductAssetRole>('hero');
  const [selectedAngle, setSelectedAngle] = useState<AssetAngle>('unknown');
  const [caption, setCaption] = useState('');
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error' | 'duplicate'; text: string; existingAssetId?: string } | null>(null);

  // Tab interna: 'product_assets' | 'photo_bank_picker'
  const [activeTab, setActiveTab] = useState<'product' | 'bank'>('product');
  const [bankSearch, setBankSearch] = useState('');

  // Assets vinculados a este produto
  const linkedProductAssets = productAssets
    .filter((pa) => pa.product_id === product.id)
    .map((pa) => ({
      ...pa,
      asset: assets.find((a) => a.id === pa.asset_id)
    }))
    .filter((pa) => pa.asset && pa.asset.approval_status !== 'archived');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadMessage(null);
  };

  const handleExecuteUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploadMessage(null);

    const res = await uploadAndLinkAsset(selectedFile, {
      productId: product.id,
      role: selectedRole,
      isPrimary: selectedRole === 'hero' || linkedProductAssets.length === 0,
      caption: caption.trim() || undefined,
      angle: selectedAngle
    });

    if (res.success) {
      setUploadMessage({ type: 'success', text: `Arquivo "${selectedFile.name}" enviado e vinculado com sucesso!` });
      setSelectedFile(null);
      setCaption('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setUploadMessage(null), 4000);
    } else if (res.isDuplicate && res.existingAssetId) {
      setUploadMessage({
        type: 'duplicate',
        text: 'Este arquivo já existe no banco de assets corporativo.',
        existingAssetId: res.existingAssetId
      });
    } else {
      setUploadMessage({ type: 'error', text: res.message || 'Erro ao realizar upload' });
    }
  };

  const handleLinkExisting = async (assetId: string) => {
    const res = await linkExistingAsset(product.id, assetId, selectedRole, false, caption.trim() || undefined, selectedAngle);
    if (res.success) {
      setUploadMessage({ type: 'success', text: 'Asset existente vinculado com sucesso!' });
      setSelectedFile(null);
      setActiveTab('product');
      setTimeout(() => setUploadMessage(null), 3000);
    } else {
      setUploadMessage({ type: 'error', text: res.error || 'Erro ao vincular asset' });
    }
  };

  const handleSetPrimary = async (productAssetId: string) => {
    await setPrimaryProductAsset(productAssetId);
  };

  const handleUnlink = async (productAssetId: string, modelName: string) => {
    if (confirm(`Desvincular esta foto do produto "${modelName}"? (O arquivo original permanecerá preservado no banco corporativo)`)) {
      await unlinkProductAsset(productAssetId);
    }
  };

  const handleArchive = async (assetId: string) => {
    if (confirm('Arquivar este asset no banco corporativo? (Ele deixará de aparecer para novas seleções)')) {
      await archiveAsset(assetId, 'Arquivado pelo operador na Biblioteca de Produtos');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-none shadow-2xl border border-slate-300 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#003366] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded">
              <ImageIcon className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base leading-tight">Fotos & Arquivos Corporativos</h3>
                <span className="bg-blue-800 text-blue-100 text-[11px] font-mono px-2 py-0.5 rounded font-semibold">
                  {product.code}
                </span>
              </div>
              <p className="text-xs text-blue-100/90 font-mono mt-0.5">
                {product.model} · <span className="font-sans">{product.family}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-200 font-mono bg-blue-950/40 px-2.5 py-1 rounded">
              {linkedProductAssets.length} {linkedProductAssets.length === 1 ? 'arquivo vinculado' : 'arquivos vinculados'}
            </span>
            <button
              onClick={onClose}
              className="p-1 text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors"
              title="Fechar painel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Workspace Subtabs */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('product')}
              className={`px-3 py-1.5 text-xs font-bold rounded-none transition-colors ${
                activeTab === 'product'
                  ? 'bg-white text-[#003366] border border-slate-300 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Galeria do Produto ({linkedProductAssets.length})
            </button>
            <button
              onClick={() => setActiveTab('bank')}
              className={`px-3 py-1.5 text-xs font-bold rounded-none transition-colors ${
                activeTab === 'bank'
                  ? 'bg-white text-[#003366] border border-slate-300 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 inline mr-1" />
              Vincular do Photo Bank Cloud
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {uploadMessage && (
            <div
              className={`p-3 text-xs font-semibold rounded border flex items-center justify-between ${
                uploadMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : uploadMessage.type === 'duplicate'
                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                  : 'bg-rose-50 text-rose-800 border-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {uploadMessage.type === 'success' && <Check className="w-4 h-4 text-emerald-600" />}
                {uploadMessage.type === 'duplicate' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                {uploadMessage.type === 'error' && <X className="w-4 h-4 text-rose-600" />}
                <span>{uploadMessage.text}</span>
              </div>
              {uploadMessage.type === 'duplicate' && uploadMessage.existingAssetId && (
                <button
                  onClick={() => handleLinkExisting(uploadMessage.existingAssetId!)}
                  className="px-2.5 py-1 bg-amber-600 text-white rounded text-[11px] font-bold hover:bg-amber-700 transition-colors shadow-2xs"
                >
                  Vincular Foto Existente ao {product.model}
                </button>
              )}
            </div>
          )}

          {activeTab === 'product' && (
            <>
              {/* Formulário de Upload Amigável */}
              {isAdmin && (
                <div className="bg-slate-50 border border-slate-300 p-4 rounded shadow-2xs">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-[#003366]" />
                    Adicionar Nova Foto ou Arquivo Oficial
                  </h4>

                  <form onSubmit={handleExecuteUpload} className="space-y-3">
                    {/* File Dropzone */}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded p-4 text-center cursor-pointer transition-colors ${
                        selectedFile ? 'border-[#003366] bg-blue-50/50' : 'border-slate-300 hover:border-slate-400 bg-white'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      {selectedFile ? (
                        <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#003366]">
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                          <span className="text-slate-500 font-normal">Clique para alterar</span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-600">
                          <span className="font-bold text-[#003366]">Arraste o arquivo aqui</span> ou clique para escolher do computador
                          <p className="text-[11px] text-slate-400 mt-0.5">Formatos: JPG, PNG, WEBP, PDF (Máx: 50MB)</p>
                        </div>
                      )}
                    </div>

                    {/* Chips de Seleção Rápida de Papel */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-tight mb-1.5">
                        Tipo / Papel da Imagem no Produto:
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_ROLES.map(({ role, label }) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => setSelectedRole(role)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                              selectedRole === role
                                ? 'bg-[#003366] text-white shadow-2xs font-bold'
                                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Descrição Opcional */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Legenda / Descrição da Imagem (Opcional):
                        </label>
                        <input
                          type="text"
                          value={caption}
                          onChange={(e) => setCaption(e.target.value)}
                          placeholder="Ex: Transmissor com flange sanitária montado"
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded focus:border-[#003366] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Ângulo / Perspectiva:
                        </label>
                        <select
                          value={selectedAngle}
                          onChange={(e) => setSelectedAngle(e.target.value as AssetAngle)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded focus:border-[#003366] focus:outline-none"
                        >
                          {Object.entries(ANGLE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Botão de Enviar */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={!selectedFile || isUploading}
                        className="px-4 py-2 bg-[#003366] text-white text-xs font-bold rounded shadow-2xs hover:bg-[#002244] disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Processando e salvando na nuvem...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>Salvar Foto no Produto</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Grid de Assets Vinculados */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                  Fotos e Documentos Vinculados ({linkedProductAssets.length})
                </h4>

                {linkedProductAssets.length === 0 ? (
                  <div className="border border-dashed border-slate-300 rounded p-8 text-center bg-slate-50">
                    <ImageIcon className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-700">Nenhum arquivo corporativo vinculado a este produto.</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Faça o upload da foto oficial acima para alimentar catálogos e tabelas técnicas.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {linkedProductAssets.map((item) => {
                      const asset = item.asset!;
                      const url = resolvedUrls[asset.id] || asset.storage_path;
                      const isLowRes = asset.width_px && asset.width_px < 800;

                      return (
                        <div
                          key={item.id}
                          className={`bg-white border rounded shadow-2xs flex flex-col overflow-hidden transition-all ${
                            item.is_primary ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-300'
                          }`}
                        >
                          {/* Imagem Preview */}
                          <div className="h-40 bg-slate-100 relative flex items-center justify-center p-2 border-b border-slate-200">
                            {asset.kind === 'document' || asset.mime_type === 'application/pdf' ? (
                              <div className="text-center">
                                <FileText className="w-10 h-10 text-rose-600 mx-auto mb-1" />
                                <span className="text-[10px] font-mono text-slate-600 block">{asset.original_filename}</span>
                              </div>
                            ) : url ? (
                              <img
                                src={url}
                                alt={item.caption || asset.original_filename || ''}
                                className="max-h-full max-w-full object-contain"
                              />
                            ) : (
                              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                            )}

                            {/* Badge de Foto Principal */}
                            {item.is_primary && (
                              <div className="absolute top-2 left-2 bg-[#003366] text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-xs flex items-center gap-1">
                                <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                                <span>Principal</span>
                              </div>
                            )}

                            {/* Badge do Role */}
                            <div className="absolute top-2 right-2 bg-slate-800/80 backdrop-blur-2xs text-white text-[10px] font-semibold px-2 py-0.5 rounded">
                              {ROLE_LABELS[item.role] || item.role}
                            </div>
                          </div>

                          {/* Metadados e Ações */}
                          <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                            <div>
                              <p className="text-xs font-bold text-slate-900 truncate" title={item.caption || asset.original_filename || ''}>
                                {item.caption || asset.original_filename || 'Foto sem legenda'}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                                <span>{asset.width_px && asset.height_px ? `${asset.width_px}x${asset.height_px}px` : asset.mime_type}</span>
                                <span>·</span>
                                <span>{asset.file_size ? `${(asset.file_size / 1024).toFixed(0)} KB` : ''}</span>
                              </div>
                              {isLowRes && (
                                <p className="text-[10px] text-amber-700 font-semibold flex items-center gap-1 mt-1">
                                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>Baixa resolução para impressão A4</span>
                                </p>
                              )}
                            </div>

                            {/* Controles de Ação */}
                            {isAdmin && (
                              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                                {!item.is_primary ? (
                                  <button
                                    onClick={() => handleSetPrimary(item.id)}
                                    className="px-2 py-1 text-[11px] font-bold text-[#003366] hover:bg-blue-50 rounded transition-colors flex items-center gap-1"
                                    title="Tornar foto principal deste papel"
                                  >
                                    <Star className="w-3 h-3" />
                                    <span>Tornar Principal</span>
                                  </button>
                                ) : (
                                  <span className="text-[11px] font-bold text-blue-700 flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Foto Principal</span>
                                  </span>
                                )}

                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleUnlink(item.id, product.model)}
                                    className="p-1 text-slate-400 hover:text-amber-700 rounded transition-colors"
                                    title="Desvincular deste produto (preserva arquivo)"
                                  >
                                    <Link2 className="w-3.5 h-3.5 rotate-45" />
                                  </button>
                                  <button
                                    onClick={() => handleArchive(asset.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                    title="Arquivar asset"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'bank' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  placeholder="Buscar asset corporativo por nome, código ou legenda..."
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:border-[#003366] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto">
                {assets
                  .filter((a) => a.approval_status !== 'archived')
                  .filter((a) => !bankSearch || a.original_filename?.toLowerCase().includes(bankSearch.toLowerCase()))
                  .map((a) => {
                    const isAlreadyLinked = linkedProductAssets.some((pa) => pa.asset_id === a.id);
                    const url = resolvedUrls[a.id] || a.storage_path;

                    return (
                      <div key={a.id} className="border border-slate-200 rounded p-2 bg-white flex flex-col justify-between text-center">
                        <div className="h-24 bg-slate-50 flex items-center justify-center mb-1.5">
                          {url ? (
                            <img src={url} alt={a.original_filename || ''} className="max-h-full max-w-full object-contain" />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-slate-400" />
                          )}
                        </div>
                        <p className="text-[11px] font-bold text-slate-800 truncate" title={a.original_filename || ''}>
                          {a.original_filename || 'Sem nome'}
                        </p>
                        <button
                          onClick={() => handleLinkExisting(a.id)}
                          disabled={isAlreadyLinked}
                          className={`mt-2 w-full py-1 text-[11px] font-bold rounded transition-colors ${
                            isAlreadyLinked
                              ? 'bg-slate-100 text-slate-400 cursor-default'
                              : 'bg-[#003366] text-white hover:bg-[#002244]'
                          }`}
                        >
                          {isAlreadyLinked ? 'Já Vinculado' : '+ Vincular'}
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between">
          <p className="text-[11px] text-slate-500 font-mono">
            Originais imutáveis armazenados no bucket corporativo <span className="font-bold">product-assets</span>
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Trash2, AlertCircle, Upload, Image, Loader2 } from 'lucide-react';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useUIStore } from '../../stores/useUIStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAssetStore } from '../../stores/useAssetStore';

export const ProductDrawer: React.FC = () => {
  const { isProductDrawerOpen, editingProductId, closeProductDrawer } = useUIStore();
  const { getProduct, addProduct, updateProduct, deleteProduct } = useLibraryStore();
  const isAdmin = useAuthStore((state) => state.role === 'admin');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAndLinkAsset = useAssetStore((state) => state.uploadAndLinkAsset);

  const [code, setCode] = useState('');
  const [family, setFamily] = useState('Transmissores de Pressão Relativa');
  const [model, setModel] = useState('');
  const [description, setDescription] = useState('');
  const [range, setRange] = useState('');
  const [unit, setUnit] = useState('bar');
  const [accuracy, setAccuracy] = useState('±0.075% FS');
  const [output, setOutput] = useState('4-20 mA + HART');
  const [powerSupply, setPowerSupply] = useState('12 a 45 Vcc');
  const [processConnection, setProcessConnection] = useState('1/2" NPT');
  const [protectionDegree, setProtectionDegree] = useState('IP67');
  const [customSpecs, setCustomSpecs] = useState<{ key: string; value: string }[]>([]);
  const [newCustomKey, setNewCustomKey] = useState('');
  const [newCustomVal, setNewCustomVal] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  const initialProduct = editingProductId ? getProduct(editingProductId) : undefined;

  useEffect(() => {
    if (initialProduct) {
      setCode(initialProduct.code || '');
      setFamily(initialProduct.family || 'Transmissores de Pressão Relativa');
      setModel(initialProduct.model || '');
      setDescription(initialProduct.description || '');
      setRange(initialProduct.specs?.range || '');
      setUnit(initialProduct.specs?.unit || 'bar');
      setAccuracy(initialProduct.specs?.accuracy || '±0.075% FS');
      setOutput(initialProduct.specs?.output || '4-20 mA + HART');
      setPowerSupply(initialProduct.specs?.powerSupply || '12 a 45 Vcc');
      setProcessConnection(initialProduct.specs?.processConnection || '1/2" NPT');
      setProtectionDegree(initialProduct.specs?.protectionDegree || 'IP67');
      setImageUrl(initialProduct.imageUrl || '');
      setCreatedAt(initialProduct.createdAt || null);
      setVersion(initialProduct.version || 1);

      if (initialProduct.specs?.customSpecs) {
        setCustomSpecs(
          Object.entries(initialProduct.specs.customSpecs).map(([key, value]) => ({
            key,
            value: String(value)
          }))
        );
      } else {
        setCustomSpecs([]);
      }
    } else {
      setCode('');
      setFamily('Transmissores de Pressão Relativa');
      setModel('');
      setDescription('');
      setRange('');
      setUnit('bar');
      setAccuracy('±0.075% FS');
      setOutput('4-20 mA + HART');
      setPowerSupply('12 a 45 Vcc');
      setProcessConnection('1/2" NPT');
      setProtectionDegree('IP67');
      setImageUrl('');
      setCreatedAt(null);
      setVersion(1);
      setCustomSpecs([]);
    }
    setError(null);
  }, [initialProduct, isProductDrawerOpen]);

  if (!isProductDrawerOpen) return null;

  const handleAddCustomSpec = () => {
    if (!newCustomKey.trim()) return;
    setCustomSpecs([...customSpecs, { key: newCustomKey.trim(), value: newCustomVal.trim() }]);
    setNewCustomKey('');
    setNewCustomVal('');
  };

  const handleRemoveCustomSpec = (idx: number) => {
    setCustomSpecs(customSpecs.filter((_, i) => i !== idx));
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!isAdmin || !file) return;

    setIsUploadingImage(true);
    setError(null);
    try {
      const res = await uploadAndLinkAsset(file, {
        productId: initialProduct?.id || null,
        role: 'hero',
        isPrimary: true,
        caption: model || 'Foto do Produto'
      });
      if (res.success) {
        setImageUrl(res.assetId || '');
      } else {
        setError(res.message || 'Falha ao processar upload corporativo.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro inesperado no upload.');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!code.trim() || !model.trim() || !range.trim()) {
      setError('Código, Modelo e Faixa são obrigatórios.');
      return;
    }

    const customSpecsRecord: Record<string, string> = {};
    for (const item of customSpecs) {
      if (item.key.trim()) {
        customSpecsRecord[item.key.trim()] = item.value.trim();
      }
    }

    const payload = {
      code: code.trim(),
      family: family.trim(),
      model: model.trim(),
      description: description.trim(),
      specs: {
        range: range.trim(),
        unit: unit.trim(),
        accuracy: accuracy.trim(),
        output: output.trim(),
        powerSupply: powerSupply.trim(),
        processConnection: processConnection.trim(),
        protectionDegree: protectionDegree.trim(),
        customSpecs: customSpecsRecord
      },
      imageUrl: imageUrl.trim()
    };

    if (editingProductId) {
      updateProduct(editingProductId, payload);
    } else {
      addProduct(payload);
    }

    closeProductDrawer();
  };

  const handleDelete = () => {
    if (isAdmin && editingProductId && confirm('Tem certeza que deseja excluir este produto oficial da biblioteca?')) {
      deleteProduct(editingProductId);
      closeProductDrawer();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-end">
      <div className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {editingProductId ? `Editar Produto: ${code}` : 'Cadastrar Novo Produto Oficial'}
            </h2>
            <p className="text-xs text-slate-500">Biblioteca Central de Produtos (Fonte da Verdade)</p>
          </div>
          <button onClick={closeProductDrawer} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-4 text-xs">
          {!isAdmin && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
              <span>Atenção: Apenas o Administrador (O Pai) pode alterar os dados oficiais da biblioteca.</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Código do Produto *</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex: PCON-200"
                disabled={!isAdmin}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-brand-500 font-mono text-xs disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Modelo Comercial *</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Ex: PCON-200-G"
                disabled={!isAdmin}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-brand-500 font-mono text-xs disabled:bg-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Família / Categoria *</label>
            <select
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              disabled={!isAdmin}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-brand-500 text-xs disabled:bg-slate-100"
            >
              <option value="Transmissores de Pressão Relativa">Transmissores de Pressão Relativa</option>
              <option value="Transmissores de Pressão Diferencial">Transmissores de Pressão Diferencial</option>
              <option value="Transmissores de Temperatura">Transmissores de Temperatura</option>
              <option value="Válvulas de Controle & Posicionadores">Válvulas de Controle & Posicionadores</option>
              <option value="Acessórios & Conexões Industriais">Acessórios & Conexões Industriais</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Descrição Técnica</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição sumária das principais características..."
              disabled={!isAdmin}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-brand-500 text-xs disabled:bg-slate-100"
            />
          </div>

          <div className="pt-2 border-t border-slate-200">
            <h3 className="font-bold text-slate-900 mb-2">Especificações Técnicas Oficiais</h3>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Faixa Medição *</label>
                <input
                  type="text"
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  placeholder="0 a 100"
                  disabled={!isAdmin}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-brand-500 font-mono text-xs disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Unidade *</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="bar, psi, °C"
                  disabled={!isAdmin}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-brand-500 font-mono text-xs disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Precisão</label>
                <input
                  type="text"
                  value={accuracy}
                  onChange={(e) => setAccuracy(e.target.value)}
                  placeholder="±0.075% FS"
                  disabled={!isAdmin}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-brand-500 font-mono text-xs disabled:bg-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Sinal de Saída</label>
                <input
                  type="text"
                  value={output}
                  onChange={(e) => setOutput(e.target.value)}
                  placeholder="4-20 mA + HART"
                  disabled={!isAdmin}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-brand-500 font-mono text-xs disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Alimentação</label>
                <input
                  type="text"
                  value={powerSupply}
                  onChange={(e) => setPowerSupply(e.target.value)}
                  placeholder="12 a 45 Vdc"
                  disabled={!isAdmin}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-brand-500 font-mono text-xs disabled:bg-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Conexão de Processo</label>
                <input
                  type="text"
                  value={processConnection}
                  onChange={(e) => setProcessConnection(e.target.value)}
                  placeholder='1/2" NPT Macho Inox 316L'
                  disabled={!isAdmin}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-[#003366] font-mono text-xs disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Grau de Proteção</label>
                <input
                  type="text"
                  value={protectionDegree}
                  onChange={(e) => setProtectionDegree(e.target.value)}
                  placeholder="IP67 / NEMA 4X"
                  disabled={!isAdmin}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-[#003366] font-mono text-xs disabled:bg-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Especificações Dinâmicas Adicionais (Custom Specs) */}
          <div className="pt-2 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-900 block">Especificações Especiais (Custom Specs)</label>
              <span className="text-[10px] text-slate-400 font-mono">{customSpecs.length} campo(s)</span>
            </div>

            {customSpecs.length > 0 && (
              <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                {customSpecs.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] font-semibold text-slate-700 w-1/3 truncate" title={item.key}>
                      {item.key}:
                    </span>
                    <span className="font-mono text-[11px] text-slate-900 flex-1 truncate" title={item.value}>
                      {item.value}
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomSpec(idx)}
                        className="text-slate-400 hover:text-red-600 p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isAdmin && (
              <div className="flex items-center gap-1.5 pt-1">
                <input
                  type="text"
                  value={newCustomKey}
                  onChange={(e) => setNewCustomKey(e.target.value)}
                  placeholder="Nome (ex: Material)"
                  className="w-1/3 px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-[#003366]"
                />
                <input
                  type="text"
                  value={newCustomVal}
                  onChange={(e) => setNewCustomVal(e.target.value)}
                  placeholder="Valor (ex: Inox 316L)"
                  className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-[#003366]"
                />
                <button
                  type="button"
                  onClick={handleAddCustomSpec}
                  className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-semibold text-xs transition-colors"
                >
                  + Adicionar
                </button>
              </div>
            )}
          </div>

          {/* Fotografia Real do Produto */}
          <div className="pt-2 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-semibold text-slate-700">Fotografia Real do Produto</label>
              {isAdmin && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#003366] border border-blue-200 rounded text-xs font-semibold shadow-2xs transition-colors"
                  >
                    {isUploadingImage ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Enviando Foto...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        <span>Fazer Upload (Nuvem)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Ou cole a URL pública da foto (https://...)"
              disabled={!isAdmin}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-[#003366] text-xs disabled:bg-slate-100 font-mono"
            />

            {imageUrl && (
              <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={imageUrl}
                    alt="Prévia do Produto"
                    className="w-14 h-14 object-contain rounded border border-slate-200 bg-white"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="text-[11px] text-slate-500 font-mono">
                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                      <Image className="w-3 h-3" />
                      <span>Foto Vinculada</span>
                    </span>
                    <span className="truncate max-w-xs block text-slate-600">{imageUrl}</span>
                  </div>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="text-slate-400 hover:text-red-600 p-1 text-xs"
                    title="Remover foto"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Metadados Técnicos */}
          {editingProductId && (
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>ID: {editingProductId}</span>
              <span>Rev: v{version}</span>
              {createdAt && <span>Cadastrado em: {new Date(createdAt).toLocaleDateString('pt-BR')}</span>}
            </div>
          )}

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            {editingProductId && isAdmin ? (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-1 px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Excluir</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeProductDrawer}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium transition-colors"
              >
                Cancelar
              </button>
              {isAdmin && (
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#003366] hover:bg-[#002244] text-white rounded-md font-bold transition-colors shadow-xs"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Produto Oficial</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

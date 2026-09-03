import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, AlertCircle, Image, Layers } from 'lucide-react';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useUIStore } from '../../stores/useUIStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAssetStore } from '../../stores/useAssetStore';
import { useResolvedAssetUrl } from '../../hooks/useResolvedAssetUrl';
import { ProductAssetManager } from './ProductAssetManager';

const ProductHeroPreview: React.FC<{ productId: string; legacyUrl?: string }> = ({ productId, legacyUrl }) => {
  const primary = useAssetStore((state) => state.getPrimaryAssetForProduct(productId, 'hero'));
  const assetId = primary?.asset_id || primary?.asset?.id;
  const displayUrl = useResolvedAssetUrl(assetId, legacyUrl);

  if (!displayUrl) {
    return (
      <div className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center gap-2.5 text-xs text-slate-500">
        <Image className="w-4 h-4 text-slate-400 shrink-0" />
        <span>Nenhuma foto principal associada a este produto.</span>
      </div>
    );
  }

  return (
    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <img
          src={displayUrl}
          alt="Foto Principal do Produto"
          className="w-12 h-12 object-contain rounded border border-slate-200 bg-white"
        />
        <div className="text-[11px] text-slate-600">
          <span className="text-emerald-700 font-semibold flex items-center gap-1">
            <Image className="w-3 h-3" />
            <span>Foto Principal ({primary ? 'Acervo Corporativo' : 'Legado'})</span>
          </span>
          <span className="text-slate-500 block truncate max-w-[220px]">
            {primary?.asset?.original_filename || 'Foto de Identificação'}
          </span>
        </div>
      </div>
    </div>
  );
};

export const ProductDrawer: React.FC = () => {
  const { isProductDrawerOpen, editingProductId, closeProductDrawer } = useUIStore();
  const { getProduct, addProduct, updateProduct, deleteProduct } = useLibraryStore();
  const isAdmin = useAuthStore((state) => state.role === 'admin');

  const [code, setCode] = useState('');
  const [family, setFamily] = useState('');
  const [model, setModel] = useState('');
  const [description, setDescription] = useState('');
  const [range, setRange] = useState('');
  const [unit, setUnit] = useState('');
  const [accuracy, setAccuracy] = useState('');
  const [output, setOutput] = useState('');
  const [powerSupply, setPowerSupply] = useState('');
  const [processConnection, setProcessConnection] = useState('');
  const [protectionDegree, setProtectionDegree] = useState('');
  const [customSpecs, setCustomSpecs] = useState<{ key: string; value: string }[]>([]);
  const [newCustomKey, setNewCustomKey] = useState('');
  const [newCustomVal, setNewCustomVal] = useState('');
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [isAssetManagerOpen, setIsAssetManagerOpen] = useState(false);

  const initialProduct = editingProductId ? getProduct(editingProductId) : undefined;

  useEffect(() => {
    if (initialProduct) {
      setCode(initialProduct.code || '');
      setFamily(initialProduct.family || '');
      setModel(initialProduct.model || '');
      setDescription(initialProduct.description || '');
      setRange(initialProduct.specs?.range || '');
      setUnit(initialProduct.specs?.unit || '');
      setAccuracy(initialProduct.specs?.accuracy || '');
      setOutput(initialProduct.specs?.output || '');
      setPowerSupply(initialProduct.specs?.powerSupply || '');
      setProcessConnection(initialProduct.specs?.processConnection || '');
      setProtectionDegree(initialProduct.specs?.protectionDegree || '');
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
      setFamily('');
      setModel('');
      setDescription('');
      setRange('');
      setUnit('');
      setAccuracy('');
      setOutput('');
      setPowerSupply('');
      setProcessConnection('');
      setProtectionDegree('');
      setCreatedAt(null);
      setVersion(1);
      setCustomSpecs([]);
    }
    setError(null);
    setIsAssetManagerOpen(false);
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
      imageUrl: initialProduct?.imageUrl || ''
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
          <button
            onClick={closeProductDrawer}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Dados de Identificação */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Código do Produto *</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex: PRESYS-TA-25N"
                disabled={!isAdmin}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-[#003366] text-xs font-mono disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Família / Categoria *</label>
              <input
                type="text"
                value={family}
                onChange={(e) => setFamily(e.target.value)}
                placeholder="Ex: Calibradores Térmicos"
                disabled={!isAdmin}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-[#003366] text-xs disabled:bg-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Modelo Comercial *</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Ex: TA-25N"
              disabled={!isAdmin}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-[#003366] text-xs font-bold disabled:bg-slate-100"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Descrição Comercial & Aplicação</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição técnica detalhada para uso em catálogos..."
              disabled={!isAdmin}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-[#003366] text-xs disabled:bg-slate-100"
            />
          </div>

          {/* Especificações Técnicas Fundamentais */}
          <div className="pt-2 border-t border-slate-200">
            <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2">
              Especificações Técnicas Oficiais
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Faixa de Medição *</label>
                <input
                  type="text"
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  placeholder="Ex: -25 a 140"
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-[#003366] text-xs disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Unidade de Engenharia *</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="Ex: °C ou bar"
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-[#003366] text-xs font-mono disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Exatidão / Incerteza *</label>
                <input
                  type="text"
                  value={accuracy}
                  onChange={(e) => setAccuracy(e.target.value)}
                  placeholder="Ex: ±0.1 °C ou ±0.075% FS"
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-[#003366] text-xs font-mono disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sinal de Saída / Protocolo</label>
                <input
                  type="text"
                  value={output}
                  onChange={(e) => setOutput(e.target.value)}
                  placeholder="Ex: 4-20 mA + HART"
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-[#003366] text-xs disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alimentação Elétrica</label>
                <input
                  type="text"
                  value={powerSupply}
                  onChange={(e) => setPowerSupply(e.target.value)}
                  placeholder="Ex: 110/220 Vca ou 24 Vcc"
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-[#003366] text-xs disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Conexão ao Processo</label>
                <input
                  type="text"
                  value={processConnection}
                  onChange={(e) => setProcessConnection(e.target.value)}
                  placeholder="Ex: 1/2 NPT ou Poço Térmico"
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-[#003366] text-xs disabled:bg-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Especificações Customizadas Dinâmicas */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <label className="block font-semibold text-slate-700">Campos Técnicos Personalizados</label>
              <span className="text-[10px] text-slate-500 font-mono">({customSpecs.length} adicionais)</span>
            </div>

            {customSpecs.length > 0 && (
              <div className="space-y-2 mb-2">
                {customSpecs.map((spec, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={spec.key}
                      onChange={(e) => {
                        const updated = [...customSpecs];
                        updated[idx].key = e.target.value;
                        setCustomSpecs(updated);
                      }}
                      placeholder="Nome do Campo"
                      disabled={!isAdmin}
                      className="w-1/3 px-2 py-1 border border-slate-300 rounded text-xs font-semibold focus:ring-1 focus:ring-[#003366] disabled:bg-slate-100"
                    />
                    <input
                      type="text"
                      value={spec.value}
                      onChange={(e) => {
                        const updated = [...customSpecs];
                        updated[idx].value = e.target.value;
                        setCustomSpecs(updated);
                      }}
                      placeholder="Valor Técnico"
                      disabled={!isAdmin}
                      className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-[#003366] disabled:bg-slate-100"
                    />
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomSpec(idx)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                        title="Remover especificação"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isAdmin && (
              <div className="flex items-center gap-2 p-2 bg-slate-50 border border-dashed border-slate-300 rounded">
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

          {/* Gestão de Fotos e Arquivos Corporativos */}
          <div className="pt-2 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-semibold text-slate-700">Fotos & Arquivos Corporativos</label>
              {initialProduct && isAdmin && (
                <button
                  type="button"
                  onClick={() => setIsAssetManagerOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#003366] hover:bg-[#002244] text-white rounded text-xs font-semibold shadow-2xs transition-colors"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Gerenciar Fotos & Arquivos</span>
                </button>
              )}
            </div>

            {initialProduct ? (
              <ProductHeroPreview productId={initialProduct.id} legacyUrl={initialProduct.imageUrl} />
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Salve o produto primeiro para adicionar fotos e arquivos ao acervo corporativo.</span>
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
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-md font-medium transition-colors"
              >
                Cancelar
              </button>
              {isAdmin && (
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#003366] hover:bg-[#002244] text-white rounded-md font-bold shadow-sm transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingProductId ? 'Salvar Alterações' : 'Cadastrar Produto'}</span>
                </button>
              )}
            </div>
          </div>
        </form>

        {/* Modal de Gestão de Fotos do Produto aberto a partir do Drawer */}
        {isAssetManagerOpen && initialProduct && (
          <ProductAssetManager
            product={initialProduct}
            onClose={() => setIsAssetManagerOpen(false)}
          />
        )}
      </div>
    </div>
  );
};

// src/components/editor/inspector/FullPageCoverInspector.tsx
// Inspector Contextual Canônico da Capa A4 Página Inteira (CORE.E4).
// Utiliza estritamente as primitives do design system (CORE.E3), elimina controles NO-OP
// e integra a Pure Domain Engine para materialização e operações de camadas seguras.

import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Image as ImageIcon,
  SlidersHorizontal,
  Layers,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Upload,
  Sparkles,
  Type,
  Minus,
  Square
} from 'lucide-react';
import { ContentBlock, CanvasLayer, CanvasLayerType } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useMediaStore } from '../../../stores/useMediaStore';
import { useAssetStore } from '../../../stores/useAssetStore';
import {
  getEffectiveCoverLayers,
  materializeCoverLayers,
  createCoverLayer,
  updateCoverLayer,
  removeCoverLayer,
  duplicateCoverLayer,
  reorderCoverLayer,
  getEffectiveSemanticCoverContent,
  buildSemanticCoverContentPatch,
  resolveCoverBackgroundSource,
  setCoverBackgroundAsset,
  setCoverBackgroundUrl,
  removeCoverBackground
} from '../../../domain/full-page-cover.engine';
import {
  InspectorSection,
  InspectorField,
  InspectorTextInput,
  InspectorTextArea,
  InspectorActionRow
} from './components';

export interface FullPageCoverInspectorProps {
  block: ContentBlock;
  pageId: string;
}

export const FullPageCoverInspector: React.FC<FullPageCoverInspectorProps> = ({
  block,
  pageId
}) => {
  const updateBlock = useCatalogStore((state) => state.updateBlock);
  const openGallery = useMediaStore((state) => state.openGallery);
  const uploadAndLinkAsset = useAssetStore((state) => state.uploadAndLinkAsset);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const layerImageInputRef = useRef<HTMLInputElement>(null);
  const [activeLayerImageTargetId, setActiveLayerImageTargetId] = useState<string | null>(null);

  // Leitura segura do conteúdo semântico efetivo
  const semanticContent = getEffectiveSemanticCoverContent(block);
  const bgSource = resolveCoverBackgroundSource(block);
  const layers = getEffectiveCoverLayers(block);

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  // ==========================================================================
  // ESTADO TRANSIENTE DE OVERLAY (Zero Save-Storm + Idempotência de Commit)
  // ==========================================================================
  const persistedOverlay = block.customData?.overlayOpacity ?? 45;
  const [localOverlay, setLocalOverlay] = useState<number>(persistedOverlay);
  const lastCommittedOverlayRef = useRef<number>(persistedOverlay);

  useEffect(() => {
    setLocalOverlay(persistedOverlay);
    lastCommittedOverlayRef.current = persistedOverlay;
  }, [persistedOverlay]);

  const commitOverlay = (val: number) => {
    // Idempotência estrita: se já comitado ou idêntico ao persistido, NO-OP (COVER-OVERLAY-COMMIT-1)
    if (val === lastCommittedOverlayRef.current && val === persistedOverlay) {
      return;
    }
    lastCommittedOverlayRef.current = val;
    updateBlock(pageId, block.id, {
      customData: { ...(block.customData || {}), overlayOpacity: val }
    });
  };

  // ==========================================================================
  // HANDLERS SEMÂNTICOS DE CONTEÚDO (Materialização Segura na Primeira Ação)
  // ==========================================================================
  const handleSemanticUpdate = (
    field: 'brand' | 'badge' | 'title' | 'subtitle',
    value: string
  ) => {
    const patch = buildSemanticCoverContentPatch(block, field, value);
    updateBlock(pageId, block.id, patch);
  };

  // ==========================================================================
  // HANDLERS DE BACKGROUND (Acervo, Upload, URL, Remoção)
  // ==========================================================================
  const handleSelectAsset = (assetId: string) => {
    const patch = setCoverBackgroundAsset(block, assetId);
    updateBlock(pageId, block.id, patch);
  };

  const handleSelectUrl = (url: string) => {
    const patch = setCoverBackgroundUrl(block, url);
    updateBlock(pageId, block.id, patch);
  };

  const handleRemoveBg = () => {
    const patch = removeCoverBackground(block);
    updateBlock(pageId, block.id, patch);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const res = await uploadAndLinkAsset(file);
      if (res?.assetId) {
        handleSelectAsset(res.assetId);
      }
    } catch (err) {
      console.error('Falha ao fazer upload da fotografia de fundo:', err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ==========================================================================
  // HANDLERS DE CAMADAS VIA ENGINE PURA
  // ==========================================================================
  const handleAddLayer = (type: CanvasLayerType) => {
    const baseLayers = materializeCoverLayers(block);
    const newLayer = createCoverLayer(type, baseLayers.length);
    const updated = [...baseLayers, newLayer];

    updateBlock(pageId, block.id, {
      customData: { ...(block.customData || {}), canvasLayers: updated }
    });
    setSelectedLayerId(newLayer.id);
  };

  const handleUpdateLayerProps = (layerId: string, patch: Partial<CanvasLayer>) => {
    const baseLayers = materializeCoverLayers(block);
    const updated = updateCoverLayer(baseLayers, layerId, patch);

    updateBlock(pageId, block.id, {
      customData: { ...(block.customData || {}), canvasLayers: updated }
    });
  };

  const handleToggleVisibility = (layer: CanvasLayer) => {
    handleUpdateLayerProps(layer.id, { visible: layer.visible === false ? true : false });
  };

  const handleDuplicate = (layerId: string) => {
    const baseLayers = materializeCoverLayers(block);
    const updated = duplicateCoverLayer(baseLayers, layerId);

    updateBlock(pageId, block.id, {
      customData: { ...(block.customData || {}), canvasLayers: updated }
    });
  };

  const handleRemove = (layerId: string) => {
    const baseLayers = materializeCoverLayers(block);
    const updated = removeCoverLayer(baseLayers, layerId);

    updateBlock(pageId, block.id, {
      customData: { ...(block.customData || {}), canvasLayers: updated }
    });
    if (selectedLayerId === layerId) {
      setSelectedLayerId(null);
    }
  };

  const handleReorder = (layerId: string, direction: 'up' | 'down') => {
    const baseLayers = materializeCoverLayers(block);
    const updated = reorderCoverLayer(baseLayers, layerId, direction);

    // Se for NO-OP (limite de borda atingido), não dispara updateBlock (COVER-REORDER-NOOP-1)
    if (updated === baseLayers) {
      return;
    }

    updateBlock(pageId, block.id, {
      customData: { ...(block.customData || {}), canvasLayers: updated }
    });
  };

  // Upload específico para Image Layer funcional (COVER-IMAGE-LAYER-1)
  const handleLayerImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeLayerImageTargetId) return;

    try {
      const res = await uploadAndLinkAsset(file);
      if (res?.assetId) {
        handleUpdateLayerProps(activeLayerImageTargetId, {
          assetId: res.assetId,
          imageUrl: undefined,
          legacyUrl: undefined
        });
      }
    } catch (err) {
      console.error('Falha no upload da camada de imagem:', err);
    } finally {
      if (layerImageInputRef.current) layerImageInputRef.current.value = '';
      setActiveLayerImageTargetId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* 1. SEÇÃO CONTEÚDO (defaultOpen = true) */}
      <InspectorSection
        id="inspector-cover-section-content"
        title="Conteúdo Principal da Capa"
        icon={<FileText className="w-3.5 h-3.5" />}
        description="Marca, Selo, Título e Subtítulo"
        defaultOpen={true}
      >
        <InspectorField label="Nome da Empresa / Marca">
          <InspectorTextInput
            id="cover-field-brand"
            value={semanticContent.brand}
            onChange={(e) => handleSemanticUpdate('brand', e.target.value)}
            placeholder="Ex: PRESYS"
          />
        </InspectorField>

        <InspectorField label="Selo Metrológico / Badge">
          <InspectorTextInput
            id="cover-field-badge"
            value={semanticContent.badge}
            onChange={(e) => handleSemanticUpdate('badge', e.target.value)}
            placeholder="Ex: CALIBRAÇÃO RBC · ISO/IEC 17025"
          />
        </InspectorField>

        <InspectorField label="Título Principal da Capa">
          <InspectorTextInput
            id="cover-field-title"
            value={semanticContent.title}
            onChange={(e) => handleSemanticUpdate('title', e.target.value)}
            placeholder="Ex: PCON-Y18-LP / CALIBRADOR"
          />
        </InspectorField>

        <InspectorField label="Subtítulo Descritivo">
          <InspectorTextArea
            id="cover-field-subtitle"
            rows={2}
            value={semanticContent.subtitle}
            onChange={(e) => handleSemanticUpdate('subtitle', e.target.value)}
            placeholder="Ex: Calibrador Automático de Pressão de Alta Estabilidade"
          />
        </InspectorField>
      </InspectorSection>

      {/* 2. SEÇÃO MÍDIA (defaultOpen = false) */}
      <InspectorSection
        id="inspector-cover-section-media"
        title="Fotografia de Fundo (Full-Bleed)"
        icon={<ImageIcon className="w-3.5 h-3.5" />}
        description="Acervo, Upload do Computador ou URL"
        defaultOpen={false}
      >
        <div className="space-y-2.5">
          {/* Indicador da Fonte de Fundo Atual */}
          <div className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-md">
            <span className="text-xs font-semibold text-slate-700">Fonte Ativa:</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-white border border-slate-200 text-[#003366]">
              {bgSource.kind === 'asset'
                ? 'Acervo Interno (Asset)'
                : bgSource.kind === 'url'
                ? 'URL Externa Direta'
                : 'Nenhuma Fotografia'}
            </span>
          </div>

          {/* Ações de Seleção de Background */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() =>
                openGallery((selection) => {
                  if (typeof selection === 'string') {
                    handleSelectUrl(selection);
                  } else if (selection?.assetId) {
                    handleSelectAsset(selection.assetId);
                  }
                })
              }
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold rounded transition-colors cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Abrir Acervo</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded border border-slate-300 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>Upload do PC</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Campo de URL Externa Direta */}
          <InspectorField label="Ou Cole URL Externa Direta">
            <InspectorTextInput
              id="cover-field-bg-url"
              value={bgSource.kind === 'url' ? bgSource.url : ''}
              onChange={(e) => handleSelectUrl(e.target.value)}
              placeholder="https://exemplo.com/fotografia.jpg"
            />
          </InspectorField>

          {/* Ação Explícita de Remoção de Background */}
          {bgSource.kind !== 'none' && (
            <InspectorActionRow
              actions={[
                {
                  label: 'Remover Fotografia de Fundo',
                  onClick: handleRemoveBg,
                  variant: 'danger',
                  title: 'Remover fotografia e limpar todos os fallbacks'
                }
              ]}
            />
          )}
        </div>
      </InspectorSection>

      {/* 3. SEÇÃO APARÊNCIA (defaultOpen = false) */}
      <InspectorSection
        id="inspector-cover-section-appearance"
        title="Aparência e Contraste"
        icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
        description="Escurecimento da Foto (Overlay)"
        defaultOpen={false}
      >
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <label htmlFor="cover-overlay-slider" className="font-semibold text-slate-700">
              Escurecimento da Foto
            </label>
            <span className="font-mono font-bold text-[#003366] text-xs">
              {localOverlay}%
            </span>
          </div>

          <input
            id="cover-overlay-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={localOverlay}
            onChange={(e) => setLocalOverlay(Number(e.target.value))}
            onPointerUp={(e) => commitOverlay(Number(e.currentTarget.value))}
            onKeyUp={(e) => commitOverlay(Number(e.currentTarget.value))}
            onBlur={(e) => commitOverlay(Number(e.currentTarget.value))}
            className="w-full accent-[#003366] cursor-pointer"
          />
          <p className="text-[10.5px] text-slate-500">
            Aumente o escurecimento para conferir alto contraste e legibilidade a textos brancos.
          </p>
        </div>
      </InspectorSection>

      {/* 4. SEÇÃO CAMADAS (defaultOpen = false) */}
      <InspectorSection
        id="inspector-cover-section-layers"
        title="Camadas no Canvas"
        badge={layers.length}
        icon={<Layers className="w-3.5 h-3.5" />}
        description="Gerencie e personalize elementos gráficos"
        defaultOpen={false}
      >
        <div className="space-y-3">
          {/* Barra de Inserção Canônica */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              + Adicionar Novo Elemento
            </label>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => handleAddLayer('text')}
                className="p-1.5 bg-white hover:bg-blue-50 border border-slate-300 hover:border-blue-400 text-slate-800 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <Type className="w-3 h-3 text-blue-600" />
                <span>+ Texto</span>
              </button>

              <button
                type="button"
                onClick={() => handleAddLayer('badge')}
                className="p-1.5 bg-white hover:bg-amber-50 border border-slate-300 hover:border-amber-400 text-slate-800 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-amber-600" />
                <span>+ Selo</span>
              </button>

              <button
                type="button"
                onClick={() => handleAddLayer('image')}
                className="p-1.5 bg-white hover:bg-emerald-50 border border-slate-300 hover:border-emerald-400 text-slate-800 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <ImageIcon className="w-3 h-3 text-emerald-600" />
                <span>+ Foto / Logo</span>
              </button>

              <button
                type="button"
                onClick={() => handleAddLayer('line')}
                className="p-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <Minus className="w-3 h-3 text-blue-600" />
                <span>+ Linha</span>
              </button>

              <button
                type="button"
                onClick={() => handleAddLayer('shape')}
                className="p-1.5 bg-white hover:bg-purple-50 border border-slate-300 text-slate-800 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <Square className="w-3 h-3 text-purple-600" />
                <span>+ Moldura</span>
              </button>
            </div>
          </div>

          <input
            ref={layerImageInputRef}
            type="file"
            accept="image/*"
            onChange={handleLayerImageUpload}
            className="hidden"
          />

          {/* Lista de Camadas Efetivas */}
          {layers.length === 0 ? (
            <p className="text-[10px] text-slate-500 italic p-3 bg-slate-50 border border-dashed border-slate-200 text-center">
              Nenhuma camada configurada na capa.
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {layers.map((layer, idx) => {
                const isSelected = selectedLayerId === layer.id;

                return (
                  <div
                    key={layer.id}
                    data-cover-layer-id={layer.id}
                    className={`p-2 bg-white border rounded transition-all space-y-2 ${
                      isSelected ? 'border-blue-400 ring-1 ring-blue-300 bg-blue-50/20' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Header da Camada */}
                    <div className="flex items-center justify-between gap-1 border-b border-slate-100 pb-1">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="text-slate-400 font-mono text-[9px]">#{idx + 1}</span>
                        <input
                          type="text"
                          value={layer.label || 'Elemento'}
                          onChange={(e) => handleUpdateLayerProps(layer.id, { label: e.target.value })}
                          className="font-bold text-slate-800 text-xs bg-transparent outline-none focus:bg-amber-50 px-1 border-b border-transparent focus:border-amber-400 flex-1 truncate"
                        />
                        <span className="text-[8.5px] font-mono uppercase px-1 py-0.2 bg-slate-100 text-slate-600 rounded">
                          {layer.type}
                        </span>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        {/* Reorder Up / Down */}
                        <button
                          type="button"
                          onClick={() => handleReorder(layer.id, 'up')}
                          disabled={idx === 0}
                          title="Mover para cima"
                          aria-label="Mover camada para cima"
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReorder(layer.id, 'down')}
                          disabled={idx === layers.length - 1}
                          title="Mover para baixo"
                          aria-label="Mover camada para baixo"
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>

                        {/* Visibility Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleVisibility(layer)}
                          className={`p-1 text-xs rounded cursor-pointer ${
                            layer.visible !== false ? 'text-blue-600 bg-blue-50' : 'text-slate-400 bg-slate-100'
                          }`}
                          title={layer.visible !== false ? 'Ocultar elemento' : 'Exibir elemento'}
                          aria-label={layer.visible !== false ? 'Ocultar elemento' : 'Exibir elemento'}
                        >
                          {layer.visible !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>

                        {/* Duplicate */}
                        <button
                          type="button"
                          onClick={() => handleDuplicate(layer.id)}
                          className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                          title="Duplicar camada"
                          aria-label="Duplicar camada"
                        >
                          <Copy className="w-3 h-3" />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleRemove(layer.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Excluir camada"
                          aria-label="Excluir camada"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Conteúdo de Texto se for Text ou Badge */}
                    {(layer.type === 'text' || layer.type === 'badge') && (
                      <div>
                        <label className="block text-[9.5px] font-semibold text-slate-600 mb-0.5">
                          Conteúdo do Texto
                        </label>
                        <input
                          type="text"
                          value={layer.content || ''}
                          onChange={(e) => handleUpdateLayerProps(layer.id, { content: e.target.value })}
                          className="w-full p-1.5 border border-slate-300 rounded text-xs bg-slate-50 focus:bg-white"
                        />
                      </div>
                    )}

                    {/* Controles Funcionais de Image Layer (COVER-IMAGE-LAYER-1) */}
                    {layer.type === 'image' && (
                      <div className="space-y-1.5 p-2 bg-emerald-50/50 border border-emerald-200 rounded">
                        <span className="block text-[9.5px] font-bold text-emerald-800 uppercase">
                          Fonte da Imagem
                        </span>
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              openGallery((sel) => {
                                if (typeof sel === 'string') {
                                  handleUpdateLayerProps(layer.id, { imageUrl: sel, assetId: undefined });
                                } else if (sel?.assetId) {
                                  handleUpdateLayerProps(layer.id, { assetId: sel.assetId, imageUrl: undefined });
                                }
                              })
                            }
                            className="py-1 px-1.5 bg-[#003366] text-white text-[10px] font-semibold rounded text-center cursor-pointer"
                          >
                            Acervo
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveLayerImageTargetId(layer.id);
                              layerImageInputRef.current?.click();
                            }}
                            className="py-1 px-1.5 bg-white border border-slate-300 text-slate-700 text-[10px] font-semibold rounded text-center cursor-pointer"
                          >
                            Upload
                          </button>
                        </div>
                        <input
                          type="text"
                          value={layer.imageUrl || ''}
                          onChange={(e) => handleUpdateLayerProps(layer.id, { imageUrl: e.target.value, assetId: undefined })}
                          placeholder="Ou cole URL direta..."
                          className="w-full p-1 border border-slate-300 rounded text-[10px] font-mono bg-white"
                        />
                      </div>
                    )}

                    {/* Dimensões e Posição X / Y */}
                    <div className="grid grid-cols-2 gap-1.5 bg-slate-50 p-1.5 border border-slate-200 rounded text-[10px]">
                      <div>
                        <div className="flex justify-between text-[9px] font-mono text-slate-600 mb-0.5">
                          <span>Posição X</span>
                          <span className="font-bold text-[#003366]">{layer.x}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={95}
                          value={layer.x || 0}
                          onChange={(e) => handleUpdateLayerProps(layer.id, { x: Number(e.target.value) })}
                          className="w-full accent-[#003366] cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[9px] font-mono text-slate-600 mb-0.5">
                          <span>Posição Y</span>
                          <span className="font-bold text-[#003366]">{layer.y}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={95}
                          value={layer.y || 0}
                          onChange={(e) => handleUpdateLayerProps(layer.id, { y: Number(e.target.value) })}
                          className="w-full accent-[#003366] cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </InspectorSection>
    </div>
  );
};

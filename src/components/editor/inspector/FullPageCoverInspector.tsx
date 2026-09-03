// src/components/editor/inspector/FullPageCoverInspector.tsx
// Inspector Canônico da Capa A4 Página Inteira (CORE.E4 / E4.1).
// Padrão WAI-ARIA com Primitives CORE.E3.
// Refinamentos E4.1:
// - Eliminação de nested scroll (lista compacta de camadas)
// - Edição focada na camada selecionada (selectedLayerDetails)
// - Poder de edição real restaurado (fontSize, width, height, backgroundColor, borderColor, borderWidth)
// - Save-storm eliminado em controles contínuos de geometria (preview transiente local)
// - Draft em campos de URL (background e imagem) com commit no blur/enter
// - Helpers puros de autoridade de imagem (setCoverLayerImageAsset, setCoverLayerImageUrl, removeCoverLayerImage)
// - Type contract estrito usando CoverLayerPatch

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
  removeCoverBackground,
  setCoverLayerImageAsset,
  setCoverLayerImageUrl,
  removeCoverLayerImage,
  CoverLayerPatch
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

  // Leitura segura do conteúdo semântico efetivo (obedecendo à autoridade soberana de canvasLayers)
  const semanticContent = getEffectiveSemanticCoverContent(block);
  const bgSource = resolveCoverBackgroundSource(block);
  const layers = getEffectiveCoverLayers(block);

  // Seleção local da camada ativa no Inspector (Item 10)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const selectedLayer = layers.find((l) => l.id === selectedLayerId) || null;

  // ==========================================================================
  // 1. ESTADO TRANSIENTE DE OVERLAY (Zero Save-Storm + Idempotência de Commit)
  // ==========================================================================
  const persistedOverlay = block.customData?.overlayOpacity ?? 45;
  const [localOverlay, setLocalOverlay] = useState<number>(persistedOverlay);
  const lastCommittedOverlayRef = useRef<number>(persistedOverlay);

  useEffect(() => {
    setLocalOverlay(persistedOverlay);
    lastCommittedOverlayRef.current = persistedOverlay;
  }, [persistedOverlay]);

  const commitOverlay = (val: number) => {
    if (val === lastCommittedOverlayRef.current && val === persistedOverlay) {
      return;
    }
    lastCommittedOverlayRef.current = val;
    updateBlock(pageId, block.id, {
      customData: { ...(block.customData || {}), overlayOpacity: val }
    });
  };

  // ==========================================================================
  // 2. ESTADO TRANSIENTE DE BACKGROUND URL (Item 17: Commit no Blur/Enter)
  // ==========================================================================
  const persistedBgUrl = bgSource.kind === 'url' ? bgSource.url : '';
  const [localBgUrl, setLocalBgUrl] = useState<string>(persistedBgUrl);

  useEffect(() => {
    setLocalBgUrl(bgSource.kind === 'url' ? bgSource.url : '');
  }, [persistedBgUrl]);

  const commitBgUrl = () => {
    const trimmed = localBgUrl.trim();
    if (trimmed && trimmed !== persistedBgUrl) {
      handleSelectUrl(trimmed);
    }
  };

  // ==========================================================================
  // 3. ESTADO TRANSIENTE DE IMAGE LAYER URL (Item 18: Commit no Blur/Enter)
  // ==========================================================================
  const persistedLayerImageUrl = selectedLayer?.imageUrl || '';
  const [localImageUrl, setLocalImageUrl] = useState<string>(persistedLayerImageUrl);

  useEffect(() => {
    setLocalImageUrl(persistedLayerImageUrl);
  }, [selectedLayerId, persistedLayerImageUrl]);

  const commitLayerImageUrl = () => {
    if (!selectedLayer) return;
    const trimmed = localImageUrl.trim();
    if (trimmed && trimmed !== persistedLayerImageUrl) {
      handleUpdateLayerProps(selectedLayer.id, setCoverLayerImageUrl(trimmed));
    }
  };

  // ==========================================================================
  // 4. ESTADO TRANSIENTE DE GEOMETRIA DA CAMADA SELECIONADA (Itens 14, 15, 16)
  // ==========================================================================
  const [geometryDraft, setGeometryDraft] = useState<{
    x: number;
    y: number;
    width?: number;
    height?: number;
    fontSize?: number;
    borderWidth?: number;
  }>({ x: 0, y: 0 });

  const lastCommittedGeometryRef = useRef<Record<string, any>>({});

  useEffect(() => {
    if (selectedLayer) {
      const initial = {
        x: selectedLayer.x ?? 0,
        y: selectedLayer.y ?? 0,
        width: selectedLayer.width,
        height: selectedLayer.height,
        fontSize: selectedLayer.fontSize,
        borderWidth: selectedLayer.borderWidth
      };
      setGeometryDraft(initial);
      lastCommittedGeometryRef.current = { ...initial };
    }
  }, [
    selectedLayerId,
    selectedLayer?.x,
    selectedLayer?.y,
    selectedLayer?.width,
    selectedLayer?.height,
    selectedLayer?.fontSize,
    selectedLayer?.borderWidth
  ]);

  const commitGeometryField = (
    field: 'x' | 'y' | 'width' | 'height' | 'fontSize' | 'borderWidth',
    value: number
  ) => {
    if (!selectedLayer) return;
    const persistedVal = selectedLayer[field];
    if (value === lastCommittedGeometryRef.current[field] && value === persistedVal) {
      return;
    }
    lastCommittedGeometryRef.current[field] = value;
    handleUpdateLayerProps(selectedLayer.id, { [field]: value });
  };

  // ==========================================================================
  // HANDLERS SEMÂNTICOS DE CONTEÚDO (Recria se ausente via Engine)
  // ==========================================================================
  const handleSemanticUpdate = (
    field: 'brand' | 'badge' | 'title' | 'subtitle',
    value: string
  ) => {
    const patch = buildSemanticCoverContentPatch(block, field, value);
    updateBlock(pageId, block.id, patch);
  };

  // ==========================================================================
  // HANDLERS DE BACKGROUND
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
  // HANDLERS DE CAMADAS VIA ENGINE PURA (Contrato Type-Safe com CoverLayerPatch)
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

  const handleUpdateLayerProps = (layerId: string, patch: CoverLayerPatch) => {
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
    const duplicated = updated[updated.length - 1];
    if (duplicated) setSelectedLayerId(duplicated.id);
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

    if (updated === baseLayers) {
      return;
    }

    updateBlock(pageId, block.id, {
      customData: { ...(block.customData || {}), canvasLayers: updated }
    });
  };

  // Upload específico para Image Layer funcional (com helpers puros)
  const handleLayerImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeLayerImageTargetId) return;

    try {
      const res = await uploadAndLinkAsset(file);
      if (res?.assetId) {
        handleUpdateLayerProps(activeLayerImageTargetId, setCoverLayerImageAsset(res.assetId));
      }
    } catch (err) {
      console.error('Falha no upload da camada de imagem:', err);
    } finally {
      if (layerImageInputRef.current) layerImageInputRef.current.value = '';
      setActiveLayerImageTargetId(null);
    }
  };

  const getLayerIcon = (type: CanvasLayerType) => {
    switch (type) {
      case 'text':
        return <Type className="w-3.5 h-3.5 text-blue-600 shrink-0" />;
      case 'badge':
        return <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />;
      case 'image':
        return <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
      case 'line':
        return <Minus className="w-3.5 h-3.5 text-blue-600 shrink-0" />;
      case 'shape':
        return <Square className="w-3.5 h-3.5 text-purple-600 shrink-0" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
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
        <div className="space-y-2.5">
          <InspectorField
            label="Nome da Empresa / Marca"
            description="Exibido na camada institucional superior"
          >
            <InspectorTextInput
              id="cover-field-brand"
              value={semanticContent.brand}
              onChange={(e) => handleSemanticUpdate('brand', e.target.value)}
              placeholder="Ex: PRESYS INSTRUMENTOS"
            />
          </InspectorField>

          <InspectorField
            label="Selo de Qualidade / Metrologia"
            description="Badge institucional em destaque"
          >
            <InspectorTextInput
              id="cover-field-badge"
              value={semanticContent.badge}
              onChange={(e) => handleSemanticUpdate('badge', e.target.value)}
              placeholder="Ex: CALIBRAÇÃO RBC · ISO/IEC 17025"
            />
          </InspectorField>

          <InspectorField
            label="Título Principal da Capa"
            description="Identificação comercial destacada do produto"
          >
            <InspectorTextInput
              id="cover-field-title"
              value={semanticContent.title}
              onChange={(e) => handleSemanticUpdate('title', e.target.value)}
              placeholder="Ex: PCON-Y18-LP / CALIBRADOR"
            />
          </InspectorField>

          <InspectorField
            label="Subtítulo Comercial / Resumo"
            description="Linha auxiliar descritiva da aplicação"
          >
            <InspectorTextArea
              id="cover-field-subtitle"
              value={semanticContent.subtitle}
              onChange={(e) => handleSemanticUpdate('subtitle', e.target.value)}
              rows={2}
              placeholder="Ex: Calibrador Automático de Pressão de Alta Estabilidade"
            />
          </InspectorField>
        </div>
      </InspectorSection>

      {/* 2. SEÇÃO MÍDIA: FOTOGRAFIA DE FUNDO (defaultOpen = false) */}
      <InspectorSection
        id="inspector-cover-section-media"
        title="Fotografia de Fundo"
        icon={<ImageIcon className="w-3.5 h-3.5" />}
        description="Imagem Full-Bleed A4 (Acervo ou Upload)"
        defaultOpen={false}
      >
        <div className="space-y-3">
          {/* Indicador de Fonte Ativa */}
          <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-700">Fonte Ativa:</span>
              <span className="font-mono text-[11px] px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded uppercase font-bold">
                {bgSource.kind}
              </span>
            </div>
            {bgSource.kind === 'asset' && (
              <p className="text-[11px] text-slate-500 font-mono truncate">
                Asset ID: {bgSource.assetId}
              </p>
            )}
            {bgSource.kind === 'url' && (
              <p className="text-[11px] text-slate-500 truncate">
                URL: {bgSource.url}
              </p>
            )}
            {bgSource.kind === 'none' && (
              <p className="text-[11px] text-amber-700 font-medium">
                Nenhuma fotografia definida (fundo sólido escuro padrão).
              </p>
            )}
          </div>

          {/* Botões de Ação: Acervo e Upload do Computador */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                openGallery((selection) => {
                  if (typeof selection === 'string') {
                    handleSelectUrl(selection);
                  } else if (selection?.assetId) {
                    handleSelectAsset(selection.assetId);
                  }
                }, null)
              }
              className="px-3 py-2 bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Abrir Acervo</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
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

          {/* Campo de URL Externa Direta com Draft e Commit no Blur/Enter (Item 17) */}
          <InspectorField label="Ou Cole URL Externa Direta">
            <InspectorTextInput
              id="cover-field-bg-url"
              value={localBgUrl}
              onChange={(e) => setLocalBgUrl(e.target.value)}
              onBlur={commitBgUrl}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitBgUrl();
                }
              }}
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
            Ajusta o contraste sobre a fotografia full-bleed para máxima legibilidade metrológica.
          </p>
        </div>
      </InspectorSection>

      {/* 4. SEÇÃO CAMADAS (defaultOpen = false) — UX Refinada E4.1 */}
      <InspectorSection
        id="inspector-cover-section-layers"
        title="Camadas no Canvas"
        icon={<Layers className="w-3.5 h-3.5" />}
        description="Inserção e Detalhes da Camada Selecionada"
        defaultOpen={false}
      >
        <div className="space-y-3">
          {/* Quick Toolbar de Inserção */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              + Inserir Elemento
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

          {/* Lista Compacta de Camadas (Item 9: sem nested max-height scroll) */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Camadas ({layers.length})
            </label>

            {layers.length === 0 ? (
              <p className="text-[10px] text-slate-500 italic p-3 bg-slate-50 border border-dashed border-slate-200 text-center">
                Nenhuma camada configurada na capa.
              </p>
            ) : (
              <div className="space-y-1">
                {layers.map((layer, idx) => {
                  const isSelected = selectedLayerId === layer.id;

                  return (
                    <div
                      key={layer.id}
                      data-cover-layer-id={layer.id}
                      onClick={() => setSelectedLayerId(layer.id)}
                      className={`px-2 py-1.5 bg-white border text-xs flex items-center justify-between gap-1.5 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[#003366] bg-blue-50/50 ring-1 ring-[#003366]/30 font-semibold'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      {/* Tipo e Identificador */}
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {getLayerIcon(layer.type)}
                        <span className="text-slate-400 font-mono text-[9px] shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="truncate text-xs text-slate-800">
                          {layer.label || 'Elemento'}
                        </span>
                        <span className="text-[8.5px] font-mono uppercase px-1 py-0.2 bg-slate-100 text-slate-500 rounded shrink-0">
                          {layer.type}
                        </span>
                      </div>

                      {/* Botões de Ação Rápida */}
                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleReorder(layer.id, 'up')}
                          disabled={idx === 0}
                          title="Mover para cima"
                          aria-label="Mover camada para cima"
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReorder(layer.id, 'down')}
                          disabled={idx === layers.length - 1}
                          title="Mover para baixo"
                          aria-label="Mover camada para baixo"
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleVisibility(layer)}
                          className={`p-1 text-xs rounded cursor-pointer ${
                            layer.visible !== false
                              ? 'text-blue-600 bg-blue-50'
                              : 'text-slate-400 bg-slate-100'
                          }`}
                          title={layer.visible !== false ? 'Ocultar elemento' : 'Exibir elemento'}
                          aria-label={layer.visible !== false ? 'Ocultar elemento' : 'Exibir elemento'}
                        >
                          {layer.visible !== false ? (
                            <Eye className="w-3 h-3" />
                          ) : (
                            <EyeOff className="w-3 h-3" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDuplicate(layer.id)}
                          className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                          title="Duplicar camada"
                          aria-label="Duplicar camada"
                        >
                          <Copy className="w-3 h-3" />
                        </button>

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
                  );
                })}
              </div>
            )}
          </div>

          {/* Painel de Detalhes da Camada Selecionada (Itens 9 e 11) */}
          {selectedLayer ? (
            <div className="mt-3 p-2.5 bg-slate-50 border border-slate-300 rounded space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <div className="flex items-center gap-1.5">
                  {getLayerIcon(selectedLayer.type)}
                  <span className="text-xs font-bold text-slate-800 truncate">
                    Detalhes: {selectedLayer.label}
                  </span>
                </div>
                <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded font-bold shrink-0">
                  {selectedLayer.type}
                </span>
              </div>

              {/* Rótulo / Nome */}
              <InspectorField label="Rótulo da Camada">
                <InspectorTextInput
                  value={selectedLayer.label || ''}
                  onChange={(e) =>
                    handleUpdateLayerProps(selectedLayer.id, { label: e.target.value })
                  }
                  placeholder="Nome identificador da camada"
                />
              </InspectorField>

              {/* Controles Específicos: Texto / Badge */}
              {(selectedLayer.type === 'text' || selectedLayer.type === 'badge') && (
                <div className="space-y-2.5">
                  <InspectorField label="Conteúdo do Texto">
                    <InspectorTextInput
                      id="selected-layer-content-input"
                      value={selectedLayer.content || ''}
                      onChange={(e) =>
                        handleUpdateLayerProps(selectedLayer.id, { content: e.target.value })
                      }
                      placeholder="Texto da camada..."
                    />
                  </InspectorField>

                  <InspectorField
                    label="Tamanho da Fonte"
                    description="Tamanho tipográfico em pixels (px)"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        id="selected-layer-fontsize-slider"
                        type="range"
                        min={8}
                        max={72}
                        step={1}
                        value={geometryDraft.fontSize ?? selectedLayer.fontSize ?? 16}
                        onChange={(e) =>
                          setGeometryDraft((prev) => ({
                            ...prev,
                            fontSize: Number(e.target.value)
                          }))
                        }
                        onPointerUp={(e) =>
                          commitGeometryField('fontSize', Number(e.currentTarget.value))
                        }
                        onKeyUp={(e) =>
                          commitGeometryField('fontSize', Number(e.currentTarget.value))
                        }
                        onBlur={(e) =>
                          commitGeometryField('fontSize', Number(e.currentTarget.value))
                        }
                        className="w-full accent-[#003366] cursor-pointer"
                      />
                      <span className="font-mono text-xs font-bold text-slate-700 w-12 text-right">
                        {geometryDraft.fontSize ?? selectedLayer.fontSize ?? 16}px
                      </span>
                    </div>
                  </InspectorField>
                </div>
              )}

              {/* Controles Específicos: Image Layer (Itens 5, 6, 11, 22) */}
              {selectedLayer.type === 'image' && (
                <div className="space-y-2.5 p-2 bg-emerald-50/60 border border-emerald-200 rounded">
                  <span className="block text-[10px] font-bold text-emerald-900 uppercase">
                    Fonte da Imagem
                  </span>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        openGallery((sel) => {
                          if (typeof sel === 'string') {
                            handleUpdateLayerProps(selectedLayer.id, setCoverLayerImageUrl(sel));
                          } else if (sel?.assetId) {
                            handleUpdateLayerProps(
                              selectedLayer.id,
                              setCoverLayerImageAsset(sel.assetId)
                            );
                          }
                        })
                      }
                      className="py-1.5 px-2 bg-[#003366] text-white text-[10.5px] font-semibold rounded text-center cursor-pointer hover:bg-[#002244]"
                    >
                      Acervo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveLayerImageTargetId(selectedLayer.id);
                        layerImageInputRef.current?.click();
                      }}
                      className="py-1.5 px-2 bg-white border border-slate-300 text-slate-700 text-[10.5px] font-semibold rounded text-center cursor-pointer hover:bg-slate-50"
                    >
                      Upload
                    </button>
                  </div>

                  <InspectorField label="URL da Imagem">
                    <InspectorTextInput
                      id="selected-layer-image-url-input"
                      value={localImageUrl}
                      onChange={(e) => setLocalImageUrl(e.target.value)}
                      onBlur={commitLayerImageUrl}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          commitLayerImageUrl();
                        }
                      }}
                      placeholder="https://exemplo.com/logo.png"
                    />
                  </InspectorField>

                  {/* Ação clara: Remover imagem da layer sem apagar a camada (Item 22) */}
                  {(selectedLayer.assetId || selectedLayer.imageUrl || selectedLayer.legacyUrl) && (
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateLayerProps(selectedLayer.id, removeCoverLayerImage())
                      }
                      className="w-full py-1 text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded cursor-pointer transition-colors"
                    >
                      Remover Imagem da Camada
                    </button>
                  )}

                  {/* Largura e Altura da Imagem */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-200/60">
                    <InspectorField label="Largura (px)">
                      <input
                        id="selected-layer-width-slider"
                        type="range"
                        min={20}
                        max={600}
                        step={5}
                        value={geometryDraft.width ?? selectedLayer.width ?? 200}
                        onChange={(e) =>
                          setGeometryDraft((prev) => ({
                            ...prev,
                            width: Number(e.target.value)
                          }))
                        }
                        onPointerUp={(e) =>
                          commitGeometryField('width', Number(e.currentTarget.value))
                        }
                        onKeyUp={(e) =>
                          commitGeometryField('width', Number(e.currentTarget.value))
                        }
                        onBlur={(e) =>
                          commitGeometryField('width', Number(e.currentTarget.value))
                        }
                        className="w-full accent-[#003366] cursor-pointer"
                      />
                      <span className="font-mono text-[11px] font-bold text-slate-700 block text-right">
                        {geometryDraft.width ?? selectedLayer.width ?? 200}px
                      </span>
                    </InspectorField>

                    <InspectorField label="Altura (px)">
                      <input
                        id="selected-layer-height-slider"
                        type="range"
                        min={20}
                        max={600}
                        step={5}
                        value={geometryDraft.height ?? selectedLayer.height ?? 140}
                        onChange={(e) =>
                          setGeometryDraft((prev) => ({
                            ...prev,
                            height: Number(e.target.value)
                          }))
                        }
                        onPointerUp={(e) =>
                          commitGeometryField('height', Number(e.currentTarget.value))
                        }
                        onKeyUp={(e) =>
                          commitGeometryField('height', Number(e.currentTarget.value))
                        }
                        onBlur={(e) =>
                          commitGeometryField('height', Number(e.currentTarget.value))
                        }
                        className="w-full accent-[#003366] cursor-pointer"
                      />
                      <span className="font-mono text-[11px] font-bold text-slate-700 block text-right">
                        {geometryDraft.height ?? selectedLayer.height ?? 140}px
                      </span>
                    </InspectorField>
                  </div>
                </div>
              )}

              {/* Controles Específicos: Linha (Item 11 e 21) */}
              {selectedLayer.type === 'line' && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <InspectorField label="Comprimento (px)">
                      <input
                        id="selected-layer-line-width"
                        type="range"
                        min={10}
                        max={700}
                        step={5}
                        value={geometryDraft.width ?? selectedLayer.width ?? 80}
                        onChange={(e) =>
                          setGeometryDraft((prev) => ({
                            ...prev,
                            width: Number(e.target.value)
                          }))
                        }
                        onPointerUp={(e) =>
                          commitGeometryField('width', Number(e.currentTarget.value))
                        }
                        onKeyUp={(e) =>
                          commitGeometryField('width', Number(e.currentTarget.value))
                        }
                        onBlur={(e) =>
                          commitGeometryField('width', Number(e.currentTarget.value))
                        }
                        className="w-full accent-[#003366] cursor-pointer"
                      />
                      <span className="font-mono text-[11px] font-bold text-slate-700 block text-right">
                        {geometryDraft.width ?? selectedLayer.width ?? 80}px
                      </span>
                    </InspectorField>

                    <InspectorField label="Espessura (px)">
                      <input
                        id="selected-layer-line-height"
                        type="range"
                        min={1}
                        max={20}
                        step={1}
                        value={geometryDraft.height ?? selectedLayer.height ?? 3}
                        onChange={(e) =>
                          setGeometryDraft((prev) => ({
                            ...prev,
                            height: Number(e.target.value)
                          }))
                        }
                        onPointerUp={(e) =>
                          commitGeometryField('height', Number(e.currentTarget.value))
                        }
                        onKeyUp={(e) =>
                          commitGeometryField('height', Number(e.currentTarget.value))
                        }
                        onBlur={(e) =>
                          commitGeometryField('height', Number(e.currentTarget.value))
                        }
                        className="w-full accent-[#003366] cursor-pointer"
                      />
                      <span className="font-mono text-[11px] font-bold text-slate-700 block text-right">
                        {geometryDraft.height ?? selectedLayer.height ?? 3}px
                      </span>
                    </InspectorField>
                  </div>

                  <InspectorField label="Cor da Linha">
                    <InspectorTextInput
                      value={selectedLayer.backgroundColor || '#3b82f6'}
                      onChange={(e) =>
                        handleUpdateLayerProps(selectedLayer.id, {
                          backgroundColor: e.target.value
                        })
                      }
                      placeholder="#3b82f6"
                    />
                  </InspectorField>
                </div>
              )}

              {/* Controles Específicos: Shape / Moldura (Item 11 e 21) */}
              {selectedLayer.type === 'shape' && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <InspectorField label="Largura (px)">
                      <input
                        id="selected-layer-shape-width"
                        type="range"
                        min={20}
                        max={700}
                        step={5}
                        value={geometryDraft.width ?? selectedLayer.width ?? 250}
                        onChange={(e) =>
                          setGeometryDraft((prev) => ({
                            ...prev,
                            width: Number(e.target.value)
                          }))
                        }
                        onPointerUp={(e) =>
                          commitGeometryField('width', Number(e.currentTarget.value))
                        }
                        onKeyUp={(e) =>
                          commitGeometryField('width', Number(e.currentTarget.value))
                        }
                        onBlur={(e) =>
                          commitGeometryField('width', Number(e.currentTarget.value))
                        }
                        className="w-full accent-[#003366] cursor-pointer"
                      />
                      <span className="font-mono text-[11px] font-bold text-slate-700 block text-right">
                        {geometryDraft.width ?? selectedLayer.width ?? 250}px
                      </span>
                    </InspectorField>

                    <InspectorField label="Altura (px)">
                      <input
                        id="selected-layer-shape-height"
                        type="range"
                        min={20}
                        max={700}
                        step={5}
                        value={geometryDraft.height ?? selectedLayer.height ?? 100}
                        onChange={(e) =>
                          setGeometryDraft((prev) => ({
                            ...prev,
                            height: Number(e.target.value)
                          }))
                        }
                        onPointerUp={(e) =>
                          commitGeometryField('height', Number(e.currentTarget.value))
                        }
                        onKeyUp={(e) =>
                          commitGeometryField('height', Number(e.currentTarget.value))
                        }
                        onBlur={(e) =>
                          commitGeometryField('height', Number(e.currentTarget.value))
                        }
                        className="w-full accent-[#003366] cursor-pointer"
                      />
                      <span className="font-mono text-[11px] font-bold text-slate-700 block text-right">
                        {geometryDraft.height ?? selectedLayer.height ?? 100}px
                      </span>
                    </InspectorField>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <InspectorField label="Cor de Fundo">
                      <InspectorTextInput
                        value={selectedLayer.backgroundColor || 'rgba(15, 23, 42, 0.8)'}
                        onChange={(e) =>
                          handleUpdateLayerProps(selectedLayer.id, {
                            backgroundColor: e.target.value
                          })
                        }
                      />
                    </InspectorField>

                    <InspectorField label="Cor da Borda">
                      <InspectorTextInput
                        value={selectedLayer.borderColor || '#475569'}
                        onChange={(e) =>
                          handleUpdateLayerProps(selectedLayer.id, {
                            borderColor: e.target.value
                          })
                        }
                      />
                    </InspectorField>
                  </div>

                  <InspectorField label="Espessura da Borda (px)">
                    <div className="flex items-center gap-2">
                      <input
                        id="selected-layer-shape-borderwidth"
                        type="range"
                        min={0}
                        max={20}
                        step={1}
                        value={geometryDraft.borderWidth ?? selectedLayer.borderWidth ?? 1}
                        onChange={(e) =>
                          setGeometryDraft((prev) => ({
                            ...prev,
                            borderWidth: Number(e.target.value)
                          }))
                        }
                        onPointerUp={(e) =>
                          commitGeometryField('borderWidth', Number(e.currentTarget.value))
                        }
                        onKeyUp={(e) =>
                          commitGeometryField('borderWidth', Number(e.currentTarget.value))
                        }
                        onBlur={(e) =>
                          commitGeometryField('borderWidth', Number(e.currentTarget.value))
                        }
                        className="w-full accent-[#003366] cursor-pointer"
                      />
                      <span className="font-mono text-xs font-bold text-slate-700 w-12 text-right">
                        {geometryDraft.borderWidth ?? selectedLayer.borderWidth ?? 1}px
                      </span>
                    </div>
                  </InspectorField>
                </div>
              )}

              {/* Controles de Geometria Contínua X (%) e Y (%) com Proteção de Save-Storm (Itens 13, 14, 15, 16) */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                <div>
                  <div className="flex justify-between text-[10px] font-mono text-slate-600 mb-0.5">
                    <span>Posição X</span>
                    <span className="font-bold text-[#003366]">{geometryDraft.x}%</span>
                  </div>
                  <input
                    id="selected-layer-x-slider"
                    type="range"
                    min={0}
                    max={95}
                    step={1}
                    value={geometryDraft.x}
                    onChange={(e) =>
                      setGeometryDraft((prev) => ({ ...prev, x: Number(e.target.value) }))
                    }
                    onPointerUp={(e) => commitGeometryField('x', Number(e.currentTarget.value))}
                    onKeyUp={(e) => commitGeometryField('x', Number(e.currentTarget.value))}
                    onBlur={(e) => commitGeometryField('x', Number(e.currentTarget.value))}
                    className="w-full accent-[#003366] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] font-mono text-slate-600 mb-0.5">
                    <span>Posição Y</span>
                    <span className="font-bold text-[#003366]">{geometryDraft.y}%</span>
                  </div>
                  <input
                    id="selected-layer-y-slider"
                    type="range"
                    min={0}
                    max={95}
                    step={1}
                    value={geometryDraft.y}
                    onChange={(e) =>
                      setGeometryDraft((prev) => ({ ...prev, y: Number(e.target.value) }))
                    }
                    onPointerUp={(e) => commitGeometryField('y', Number(e.currentTarget.value))}
                    onKeyUp={(e) => commitGeometryField('y', Number(e.currentTarget.value))}
                    onBlur={(e) => commitGeometryField('y', Number(e.currentTarget.value))}
                    className="w-full accent-[#003366] cursor-pointer"
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-slate-500 italic p-2 bg-slate-100 border border-slate-200 rounded text-center">
              Selecione uma camada acima para editar seus detalhes.
            </p>
          )}
        </div>
      </InspectorSection>
    </div>
  );
};

// src/domain/full-page-cover.engine.ts
// Motor puro de domínio para Capa A4 Página Inteira (full_page_cover).
// Centraliza operações de camadas (materialização segura, manipulação imutável),
// autoridade de fontes de fotografia de fundo e binds semânticos para o Inspector (CORE.E4).
// ZERO React, ZERO Zustand, ZERO Supabase.

import { ContentBlock, CanvasLayer, CanvasLayerType } from './catalog.schema';

// ============================================================================
// 1. TIPOS DE BACKGROUND E FONTES DE MÍDIA
// ============================================================================

export type CoverBackgroundSource =
  | { kind: 'asset'; assetId: string }
  | { kind: 'url'; url: string }
  | { kind: 'none' };

/**
 * Resolve a fonte autoritativa de fotografia de fundo da capa segundo a precedência canônica:
 * 1. assetId válido (autoridade primária do acervo)
 * 2. customData.backgroundImageUrl (fallback legado de cover)
 * 3. block.legacyUrl (fallback legado global)
 * 4. block.imageUrl (URL externa direta)
 * 5. none (sem fotografia de fundo)
 */
export function resolveCoverBackgroundSource(block: ContentBlock): CoverBackgroundSource {
  if (typeof block.assetId === 'string' && block.assetId.trim() !== '') {
    return { kind: 'asset', assetId: block.assetId.trim() };
  }

  const customBg = block.customData?.backgroundImageUrl;
  if (typeof customBg === 'string' && customBg.trim() !== '') {
    return { kind: 'url', url: customBg.trim() };
  }

  if (typeof block.legacyUrl === 'string' && block.legacyUrl.trim() !== '') {
    return { kind: 'url', url: block.legacyUrl.trim() };
  }

  if (typeof block.imageUrl === 'string' && block.imageUrl.trim() !== '') {
    return { kind: 'url', url: block.imageUrl.trim() };
  }

  return { kind: 'none' };
}

/**
 * Define um asset do acervo interno como autoridade de fundo,
 * limpando explicitamente todas as URLs e fallbacks legados concorrentes.
 */
export function setCoverBackgroundAsset(block: ContentBlock, assetId: string): Partial<ContentBlock> {
  const custom = { ...(block.customData || {}) };
  delete custom.backgroundImageUrl;

  return {
    assetId: assetId.trim(),
    imageUrl: undefined,
    legacyUrl: undefined,
    customData: custom
  };
}

/**
 * Define uma URL externa como autoridade de fundo,
 * limpando explicitamente o assetId e fallbacks legados concorrentes.
 */
export function setCoverBackgroundUrl(block: ContentBlock, url: string): Partial<ContentBlock> {
  const custom = { ...(block.customData || {}) };
  delete custom.backgroundImageUrl;

  return {
    assetId: undefined,
    imageUrl: url.trim(),
    legacyUrl: undefined,
    customData: custom
  };
}

/**
 * Remove a fotografia de fundo da capa por completo,
 * limpando todas as fontes (assetId, imageUrl, legacyUrl e customData.backgroundImageUrl).
 */
export function removeCoverBackground(block: ContentBlock): Partial<ContentBlock> {
  const custom = { ...(block.customData || {}) };
  delete custom.backgroundImageUrl;

  return {
    assetId: undefined,
    imageUrl: undefined,
    legacyUrl: undefined,
    customData: custom
  };
}

// ============================================================================
// 2. CONTRATO CANÔNICO DE MODOS DE CAMADAS
// ============================================================================

/**
 * Verifica se o bloco possui camadas canônicas materializadas.
 * IMPORTANTE: customData.canvasLayers = [] é CANÔNICO (o usuário tem uma capa sem layers).
 */
export function hasCanonicalCoverLayers(block: ContentBlock): boolean {
  return Array.isArray(block.customData?.canvasLayers);
}

/**
 * Deriva as 5 camadas legadas da capa a partir de ContentBlock e configs de customData.
 * IDs estáveis: layer-logo, layer-badge, layer-title, layer-subtitle, layer-line.
 */
export function deriveLegacyCoverLayers(block: ContentBlock): CanvasLayer[] {
  const custom = block.customData || {};
  const legacyLayers: CanvasLayer[] = [];

  // 1. Logotipo / Marca
  const logoCfg = custom.logoConfig || { x: 5, y: 3.5, size: 22, visible: true };
  if (logoCfg.visible !== false) {
    legacyLayers.push({
      id: 'layer-logo',
      type: 'text',
      label: 'Logotipo / Marca',
      x: logoCfg.x ?? 5,
      y: logoCfg.y ?? 3.5,
      fontSize: logoCfg.size || 22,
      fontWeight: 'black',
      fontFamily: 'sans',
      color: '#ffffff',
      letterSpacing: 'wide',
      content: custom.brandName || 'PRESYS',
      visible: true,
      zIndex: 10
    });
  }

  // 2. Selo Metrológico / Badge RBC
  const badgeCfg = custom.badgeConfig || { x: 58, y: 3.8, size: 10, visible: true };
  if (badgeCfg.visible !== false) {
    legacyLayers.push({
      id: 'layer-badge',
      type: 'badge',
      label: 'Selo Metrológico / Badge',
      x: badgeCfg.x ?? 58,
      y: badgeCfg.y ?? 3.8,
      fontSize: badgeCfg.size || 10,
      fontWeight: 'bold',
      fontFamily: 'mono',
      color: '#93c5fd',
      backgroundColor: 'rgba(30, 58, 138, 0.4)',
      borderColor: 'rgba(96, 165, 250, 0.5)',
      borderWidth: 1,
      content: block.badgeText || 'CALIBRAÇÃO RBC · ISO/IEC 17025',
      visible: true,
      zIndex: 11
    });
  }

  // 3. Título Comercial Principal
  const titleCfg = custom.titleConfig || { x: 5, y: 22, size: 42, visible: true };
  if (titleCfg.visible !== false) {
    legacyLayers.push({
      id: 'layer-title',
      type: 'text',
      label: 'Título Comercial',
      x: titleCfg.x ?? 5,
      y: titleCfg.y ?? 22,
      fontSize: titleCfg.size || 42,
      fontWeight: 'black',
      fontFamily: 'sans',
      color: '#ffffff',
      content: block.title || 'PCON-Y18-LP / CALIBRADOR',
      visible: true,
      zIndex: 12
    });
  }

  // 4. Subtítulo
  const subCfg = custom.subtitleConfig || { x: 5, y: 29, size: 16, visible: true };
  if (subCfg.visible !== false) {
    legacyLayers.push({
      id: 'layer-subtitle',
      type: 'text',
      label: 'Subtítulo',
      x: subCfg.x ?? 5,
      y: subCfg.y ?? 29,
      fontSize: subCfg.size || 16,
      fontWeight: 'medium',
      fontFamily: 'sans',
      color: '#cbd5e1',
      content: block.subtitle || 'Calibrador Automático de Pressão de Alta Estabilidade',
      visible: true,
      zIndex: 13
    });
  }

  // 5. Linha de Destaque
  const lineCfg = custom.accentLineConfig || { x: 5, y: 34, width: 80, visible: true };
  if (lineCfg.visible !== false) {
    legacyLayers.push({
      id: 'layer-line',
      type: 'line',
      label: 'Linha de Destaque',
      x: lineCfg.x ?? 5,
      y: lineCfg.y ?? 34,
      width: lineCfg.width || 80,
      backgroundColor: '#3b82f6',
      height: 3,
      visible: true,
      zIndex: 14
    });
  }

  return legacyLayers;
}

/**
 * Retorna a lista efetiva de camadas visíveis/ativas para renderização ou inspeção.
 * NÃO muta o documento nem persiste nada no catálogo.
 */
export function getEffectiveCoverLayers(block: ContentBlock): CanvasLayer[] {
  if (hasCanonicalCoverLayers(block)) {
    return block.customData!.canvasLayers!;
  }
  return deriveLegacyCoverLayers(block);
}

/**
 * Materializa o conjunto integral de camadas para mutação segura.
 * Retorna uma cópia independente das camadas.
 */
export function materializeCoverLayers(block: ContentBlock): CanvasLayer[] {
  if (hasCanonicalCoverLayers(block)) {
    return [...block.customData!.canvasLayers!];
  }
  return deriveLegacyCoverLayers(block);
}

// ============================================================================
// 3. OPERAÇÕES PURAS SOBRE CAMADAS (LAYER OPERATIONS)
// ============================================================================

export type CoverLayerPatch = Partial<Omit<CanvasLayer, 'id' | 'type'>>;

/**
 * Helper puro de autoridade para Image Layer: define novo Asset e limpa URLs legadas/externas.
 */
export function setCoverLayerImageAsset(assetId: string): CoverLayerPatch {
  return {
    assetId,
    imageUrl: undefined,
    legacyUrl: undefined
  };
}

/**
 * Helper puro de autoridade para Image Layer: define nova URL externa e limpa assetId e legacyUrl.
 */
export function setCoverLayerImageUrl(url: string): CoverLayerPatch {
  return {
    assetId: undefined,
    imageUrl: url,
    legacyUrl: undefined
  };
}

/**
 * Helper puro de autoridade para Image Layer: remove a imagem preservando a camada.
 */
export function removeCoverLayerImage(): CoverLayerPatch {
  return {
    assetId: undefined,
    imageUrl: undefined,
    legacyUrl: undefined
  };
}

/**
 * Normaliza deterministicamente o zIndex das camadas mantendo sua ordem relativa no array.
 */
export function normalizeCoverZIndex(layers: CanvasLayer[]): CanvasLayer[] {
  return layers.map((layer, index) => ({
    ...layer,
    zIndex: 10 + index
  }));
}

/**
 * Gera um ID único e estável para nova camada.
 */
export function generateCoverLayerId(idFactory?: () => string): string {
  if (idFactory) {
    return idFactory();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `layer-${crypto.randomUUID()}`;
  }
  return `layer-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Cria uma nova camada com propriedades padrão canônicas tipadas.
 */
export function createCoverLayer(
  type: CanvasLayerType,
  currentLayersCount: number,
  idFactory?: () => string
): CanvasLayer {
  const newId = generateCoverLayerId(idFactory);
  const nextZIndex = 10 + currentLayersCount;

  switch (type) {
    case 'text':
      return {
        id: newId,
        type: 'text',
        label: `Texto Livre ${currentLayersCount + 1}`,
        content: 'Novo Texto Técnico',
        x: 10,
        y: Math.min(85, 20 + currentLayersCount * 5),
        fontSize: 22,
        fontWeight: 'bold',
        fontFamily: 'sans',
        color: '#ffffff',
        visible: true,
        zIndex: nextZIndex
      };

    case 'badge':
      return {
        id: newId,
        type: 'badge',
        label: `Selo / Badge ${currentLayersCount + 1}`,
        content: 'CERTIFICADO RBC ISO 17025',
        x: 10,
        y: 10,
        fontSize: 10,
        fontWeight: 'bold',
        fontFamily: 'mono',
        color: '#93c5fd',
        backgroundColor: 'rgba(30, 58, 138, 0.5)',
        borderColor: 'rgba(96, 165, 250, 0.5)',
        borderWidth: 1,
        visible: true,
        zIndex: nextZIndex
      };

    case 'line':
      return {
        id: newId,
        type: 'line',
        label: `Linha Técnica ${currentLayersCount + 1}`,
        x: 10,
        y: 35,
        width: 80,
        height: 3,
        backgroundColor: '#3b82f6',
        visible: true,
        zIndex: nextZIndex
      };

    case 'image':
      return {
        id: newId,
        type: 'image',
        label: `Imagem / Logo ${currentLayersCount + 1}`,
        x: 10,
        y: 40,
        width: 200,
        height: 140,
        objectFit: 'contain',
        visible: true,
        zIndex: nextZIndex
      };

    case 'shape':
      return {
        id: newId,
        type: 'shape',
        label: `Moldura Técnica ${currentLayersCount + 1}`,
        x: 10,
        y: 30,
        width: 80,
        height: 60,
        backgroundColor: 'transparent',
        borderColor: '#3b82f6',
        borderWidth: 2,
        borderRadius: 4,
        visible: true,
        zIndex: nextZIndex
      };
  }
}

/**
 * Atualiza propriedades de uma camada existente de forma imutável e type-safe.
 * Impede mutação acidental de id e type.
 */
export function updateCoverLayer(
  layers: CanvasLayer[],
  layerId: string,
  patch: CoverLayerPatch
): CanvasLayer[] {
  return layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l));
}

/**
 * Remove uma camada existente pelo id.
 */
export function removeCoverLayer(layers: CanvasLayer[], layerId: string): CanvasLayer[] {
  return layers.filter((l) => l.id !== layerId);
}

/**
 * Duplica uma camada com deslocamento visual seguro e normalização de zIndex.
 */
export function duplicateCoverLayer(
  layers: CanvasLayer[],
  layerId: string,
  idFactory?: () => string
): CanvasLayer[] {
  const target = layers.find((l) => l.id === layerId);
  if (!target) return layers;

  const newLayer: CanvasLayer = {
    ...target,
    id: generateCoverLayerId(idFactory),
    label: `${target.label} (Cópia)`,
    x: Math.min(95, target.x + 2),
    y: Math.min(95, target.y + 2)
  };

  return normalizeCoverZIndex([...layers, newLayer]);
}

/**
 * Reordena uma camada para cima ('up') ou para baixo ('down') no z-order.
 * Se a movimentação for impossível (limites de topo ou base), retorna o array original sem alteração.
 */
export function reorderCoverLayer(
  layers: CanvasLayer[],
  layerId: string,
  direction: 'up' | 'down'
): CanvasLayer[] {
  const index = layers.findIndex((l) => l.id === layerId);
  if (index === -1) return layers;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= layers.length) {
    return layers; // Limite atingido: NO-OP
  }

  const updated = [...layers];
  const [moved] = updated.splice(index, 1);
  updated.splice(targetIndex, 0, moved);

  return normalizeCoverZIndex(updated);
}

// ============================================================================
// 4. INTEGRAÇÃO SEMÂNTICA DE CONTEÚDO (INSPECTOR ↔ CANVAS)
// ============================================================================

export type SemanticCoverField = 'brand' | 'badge' | 'title' | 'subtitle';

/**
 * Retorna o conteúdo semântico efetivo para os campos principais do Inspector.
 * Lê das camadas se canônico, ou dos campos legados/defaults se legacy.
 */
export function getEffectiveSemanticCoverContent(block: ContentBlock): {
  brand: string;
  badge: string;
  title: string;
  subtitle: string;
} {
  const layers = getEffectiveCoverLayers(block);

  const logoLayer = layers.find((l) => l.id === 'layer-logo');
  const badgeLayer = layers.find((l) => l.id === 'layer-badge');
  const titleLayer = layers.find((l) => l.id === 'layer-title');
  const subtitleLayer = layers.find((l) => l.id === 'layer-subtitle');

  // Em modo CANONICAL_LAYERS (hasCanonicalCoverLayers === true), canvasLayers é soberano.
  // Se uma camada semântica foi excluída, NÃO faz fallback para os campos legados de block (COVER-CANONICAL-MISSING-SEMANTIC-1).
  if (hasCanonicalCoverLayers(block)) {
    return {
      brand: logoLayer?.content ?? '',
      badge: badgeLayer?.content ?? '',
      title: titleLayer?.content ?? '',
      subtitle: subtitleLayer?.content ?? ''
    };
  }

  // Em modo LEGACY_DERIVED, pode ler brandName/badgeText/title/subtitle e defaults
  return {
    brand: logoLayer?.content ?? block.customData?.brandName ?? 'PRESYS',
    badge: badgeLayer?.content ?? block.badgeText ?? 'CALIBRAÇÃO RBC · ISO/IEC 17025',
    title: titleLayer?.content ?? block.title ?? '',
    subtitle: subtitleLayer?.content ?? block.subtitle ?? ''
  };
}

/**
 * Constrói o patch documental para atualizar um campo semântico da capa.
 * Se em modo LEGACY_DERIVED, materializa todas as 5 camadas legadas e altera a camada alvo.
 * Se em modo CANONICAL_LAYERS, altera a camada correspondente (ou recria com default se foi excluída).
 * Retorna Partial<ContentBlock> pronto para uma ÚNICA chamada de updateBlock().
 */
export function buildSemanticCoverContentPatch(
  block: ContentBlock,
  field: SemanticCoverField,
  value: string
): Partial<ContentBlock> {
  const baseLayers = materializeCoverLayers(block);

  const targetIdMap: Record<SemanticCoverField, string> = {
    brand: 'layer-logo',
    badge: 'layer-badge',
    title: 'layer-title',
    subtitle: 'layer-subtitle'
  };

  const targetId = targetIdMap[field];
  const targetIndex = baseLayers.findIndex((l) => l.id === targetId);

  let updatedLayers: CanvasLayer[];

  if (targetIndex !== -1) {
    updatedLayers = baseLayers.map((l) => (l.id === targetId ? { ...l, content: value } : l));
  } else {
    // Camada semântica havia sido removida anteriormente: recria com defaults seguros
    let recreatedLayer: CanvasLayer;
    switch (field) {
      case 'brand':
        recreatedLayer = {
          id: 'layer-logo',
          type: 'text',
          label: 'Logotipo / Marca',
          x: 5,
          y: 3.5,
          fontSize: 22,
          fontWeight: 'black',
          fontFamily: 'sans',
          color: '#ffffff',
          letterSpacing: 'wide',
          content: value,
          visible: true,
          zIndex: 10
        };
        break;
      case 'badge':
        recreatedLayer = {
          id: 'layer-badge',
          type: 'badge',
          label: 'Selo Metrológico / Badge',
          x: 58,
          y: 3.8,
          fontSize: 10,
          fontWeight: 'bold',
          fontFamily: 'mono',
          color: '#93c5fd',
          backgroundColor: 'rgba(30, 58, 138, 0.4)',
          borderColor: 'rgba(96, 165, 250, 0.5)',
          borderWidth: 1,
          content: value,
          visible: true,
          zIndex: 11
        };
        break;
      case 'title':
        recreatedLayer = {
          id: 'layer-title',
          type: 'text',
          label: 'Título Comercial',
          x: 5,
          y: 22,
          fontSize: 42,
          fontWeight: 'black',
          fontFamily: 'sans',
          color: '#ffffff',
          content: value,
          visible: true,
          zIndex: 12
        };
        break;
      case 'subtitle':
        recreatedLayer = {
          id: 'layer-subtitle',
          type: 'text',
          label: 'Subtítulo',
          x: 5,
          y: 29,
          fontSize: 16,
          fontWeight: 'medium',
          fontFamily: 'sans',
          color: '#cbd5e1',
          content: value,
          visible: true,
          zIndex: 13
        };
        break;
    }
    updatedLayers = normalizeCoverZIndex([...baseLayers, recreatedLayer]);
  }

  return {
    customData: {
      ...(block.customData || {}),
      canvasLayers: updatedLayers
    }
  };
}

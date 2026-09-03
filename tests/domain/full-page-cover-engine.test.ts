// tests/domain/full-page-cover-engine.test.ts
// Testes unitários para o motor puro de domínio da Capa A4 Página Inteira (CORE.E4).
// Valida materialização segura de camadas, resolução canônica de backgrounds,
// preservação P0 de conteúdo histórico e isolamento contra save-storm.

import { describe, it, expect } from 'vitest';
import { ContentBlock } from '../../src/domain/catalog.schema';
import {
  hasCanonicalCoverLayers,
  deriveLegacyCoverLayers,
  getEffectiveCoverLayers,
  materializeCoverLayers,
  createCoverLayer,
  updateCoverLayer,
  removeCoverLayer,
  duplicateCoverLayer,
  reorderCoverLayer,
  normalizeCoverZIndex,
  getEffectiveSemanticCoverContent,
  buildSemanticCoverContentPatch,
  resolveCoverBackgroundSource,
  setCoverBackgroundAsset,
  setCoverBackgroundUrl,
  removeCoverBackground
} from '../../src/domain/full-page-cover.engine';

describe('Full Page Cover Pure Domain Engine (CORE.E4)', () => {
  const sampleLegacyBlock: ContentBlock = {
    id: 'block-cover-legacy',
    type: 'full_page_cover',
    title: 'PCON-Y18-LP / CALIBRADOR',
    subtitle: 'Calibrador Automático de Pressão de Alta Estabilidade',
    badgeText: 'CALIBRAÇÃO RBC · ISO/IEC 17025',
    customData: {
      brandName: 'PRESYS INSTRUMENTOS'
    }
  };

  // ==========================================================================
  // 1. CONTRATO CANÔNICO DE MODOS (LEGACY_DERIVED vs CANONICAL_LAYERS)
  // ==========================================================================
  it('identifica corretamente LEGACY_DERIVED quando canvasLayers não é array', () => {
    expect(hasCanonicalCoverLayers(sampleLegacyBlock)).toBe(false);

    const blockWithNull: ContentBlock = {
      ...sampleLegacyBlock,
      customData: { canvasLayers: null }
    };
    expect(hasCanonicalCoverLayers(blockWithNull)).toBe(false);
  });

  it('COVER-CANONICAL-EMPTY-1: identifica CANONICAL_LAYERS quando canvasLayers é array, inclusive [] vazio', () => {
    const emptyCanonicalBlock: ContentBlock = {
      ...sampleLegacyBlock,
      customData: { canvasLayers: [] }
    };
    expect(hasCanonicalCoverLayers(emptyCanonicalBlock)).toBe(true);

    const effective = getEffectiveCoverLayers(emptyCanonicalBlock);
    expect(effective).toEqual([]);
    expect(effective.length).toBe(0);
  });

  // ==========================================================================
  // 2. DERIVAÇÃO LEGADA DAS 5 CAMADAS ESTÁVEIS
  // ==========================================================================
  it('COVER-LEGACY-DERIVE-1: deriva exatamente 5 camadas com IDs estáveis e tipagem estrita de letterSpacing', () => {
    const layers = deriveLegacyCoverLayers(sampleLegacyBlock);
    expect(layers.length).toBe(5);

    const [logo, badge, title, subtitle, line] = layers;

    expect(logo.id).toBe('layer-logo');
    expect(logo.content).toBe('PRESYS INSTRUMENTOS');
    expect(logo.letterSpacing).toBe('wide'); // Zero 'wider as any'

    expect(badge.id).toBe('layer-badge');
    expect(badge.content).toBe('CALIBRAÇÃO RBC · ISO/IEC 17025');

    expect(title.id).toBe('layer-title');
    expect(title.content).toBe('PCON-Y18-LP / CALIBRADOR');

    expect(subtitle.id).toBe('layer-subtitle');
    expect(subtitle.content).toBe('Calibrador Automático de Pressão de Alta Estabilidade');

    expect(line.id).toBe('layer-line');
    expect(line.type).toBe('line');
  });

  // ==========================================================================
  // 3. P0: PRESERVAÇÃO DE CAMADAS HISTÓRICAS AO ADICIONAR NOVA CAMADA
  // ==========================================================================
  it('COVER-LEGACY-ADD-1: adicionar uma camada em capa legacy preserva todas as 5 camadas legadas + a nova camada', () => {
    // 1. Estado inicial é legacy
    expect(hasCanonicalCoverLayers(sampleLegacyBlock)).toBe(false);

    // 2. Ao adicionar camada, materializa o conjunto integral
    const baseLayers = materializeCoverLayers(sampleLegacyBlock);
    expect(baseLayers.length).toBe(5);

    const newLayer = createCoverLayer('text', baseLayers.length, () => 'layer-custom-1');
    const updatedLayers = [...baseLayers, newLayer];

    // 3. O resultado canônico possui 6 camadas: as 5 legadas + a nova
    expect(updatedLayers.length).toBe(6);
    expect(updatedLayers.map((l) => l.id)).toEqual([
      'layer-logo',
      'layer-badge',
      'layer-title',
      'layer-subtitle',
      'layer-line',
      'layer-custom-1'
    ]);
  });

  // ==========================================================================
  // 4. INTEGRAÇÃO SEMÂNTICA (INSPECTOR ↔ CANVAS)
  // ==========================================================================
  it('COVER-SEMANTIC-UPSERT-1: edição de título em capa legacy materializa o conjunto integral e atualiza layer-title', () => {
    const patch = buildSemanticCoverContentPatch(sampleLegacyBlock, 'title', 'NOVO TÍTULO CALIBRADOR');
    const persistedLayers = patch.customData?.canvasLayers;

    expect(persistedLayers).toBeDefined();
    expect(persistedLayers.length).toBe(5);

    const titleLayer = persistedLayers.find((l: any) => l.id === 'layer-title');
    expect(titleLayer?.content).toBe('NOVO TÍTULO CALIBRADOR');

    const logoLayer = persistedLayers.find((l: any) => l.id === 'layer-logo');
    expect(logoLayer?.content).toBe('PRESYS INSTRUMENTOS');
  });

  it('COVER-SEMANTIC-UPSERT-2: se camada semântica foi excluída, upsert a recria com defaults seguros', () => {
    // Capa canônica onde layer-title foi excluída anteriormente
    const canonicalWithoutTitle: ContentBlock = {
      ...sampleLegacyBlock,
      customData: {
        canvasLayers: [
          { id: 'layer-logo', type: 'text', label: 'Marca', content: 'PRESYS', x: 5, y: 3.5, zIndex: 10, visible: true }
        ]
      }
    };

    const patch = buildSemanticCoverContentPatch(canonicalWithoutTitle, 'title', 'TÍTULO RECRIADO');
    const layers = patch.customData?.canvasLayers;

    expect(layers.length).toBe(2);
    const recreated = layers.find((l: any) => l.id === 'layer-title');
    expect(recreated).toBeDefined();
    expect(recreated.content).toBe('TÍTULO RECRIADO');
    expect(recreated.type).toBe('text');
  });

  it('getEffectiveSemanticCoverContent lê corretamente de effective layers', () => {
    const content = getEffectiveSemanticCoverContent(sampleLegacyBlock);
    expect(content.brand).toBe('PRESYS INSTRUMENTOS');
    expect(content.badge).toBe('CALIBRAÇÃO RBC · ISO/IEC 17025');
    expect(content.title).toBe('PCON-Y18-LP / CALIBRADOR');
    expect(content.subtitle).toBe('Calibrador Automático de Pressão de Alta Estabilidade');
  });

  // ==========================================================================
  // 5. OPERAÇÕES PURAS SOBRE CAMADAS (UPDATE, REMOVE, DUPLICATE, REORDER)
  // ==========================================================================
  it('updateCoverLayer atualiza propriedades de forma imutável sem alterar id ou type', () => {
    const initialLayers = deriveLegacyCoverLayers(sampleLegacyBlock);
    const updated = updateCoverLayer(initialLayers, 'layer-title', {
      content: 'Título Modificado',
      fontSize: 50,
      visible: false
    });

    expect(updated).not.toBe(initialLayers);
    const target = updated.find((l) => l.id === 'layer-title')!;
    expect(target.content).toBe('Título Modificado');
    expect(target.fontSize).toBe(50);
    expect(target.visible).toBe(false);
    expect(target.type).toBe('text'); // Preservado
  });

  it('removeCoverLayer remove a camada especificada de forma imutável', () => {
    const initialLayers = deriveLegacyCoverLayers(sampleLegacyBlock);
    const updated = removeCoverLayer(initialLayers, 'layer-line');
    expect(updated.length).toBe(4);
    expect(updated.find((l) => l.id === 'layer-line')).toBeUndefined();
  });

  it('duplicateCoverLayer duplica camada com deslocamento seguro e zIndex normalizado', () => {
    const initialLayers = deriveLegacyCoverLayers(sampleLegacyBlock);
    const duplicated = duplicateCoverLayer(initialLayers, 'layer-logo', () => 'layer-logo-copy');

    expect(duplicated.length).toBe(6);
    const copy = duplicated.find((l) => l.id === 'layer-logo-copy')!;
    expect(copy).toBeDefined();
    expect(copy.label).toBe('Logotipo / Marca (Cópia)');
    expect(copy.content).toBe('PRESYS INSTRUMENTOS');
    expect(copy.x).toBe(7); // 5 + 2
    expect(copy.y).toBe(5.5); // 3.5 + 2
  });

  it('reorderCoverLayer reordena e normaliza zIndex determinístico', () => {
    const initialLayers = deriveLegacyCoverLayers(sampleLegacyBlock);
    // Move 'layer-badge' (index 1) para cima (index 0)
    const movedUp = reorderCoverLayer(initialLayers, 'layer-badge', 'up');
    expect(movedUp[0].id).toBe('layer-badge');
    expect(movedUp[1].id).toBe('layer-logo');
    expect(movedUp[0].zIndex).toBe(10);
    expect(movedUp[1].zIndex).toBe(11);
  });

  it('COVER-REORDER-NOOP-1: reordenar elemento no topo para cima ou na base para baixo é NO-OP estrito', () => {
    const initialLayers = deriveLegacyCoverLayers(sampleLegacyBlock);
    // Tenta mover o primeiro (index 0) para cima
    const noopUp = reorderCoverLayer(initialLayers, 'layer-logo', 'up');
    expect(noopUp).toBe(initialLayers); // Mesma referência, zero mutação

    // Tenta mover o último (index 4) para baixo
    const noopDown = reorderCoverLayer(initialLayers, 'layer-line', 'down');
    expect(noopDown).toBe(initialLayers); // Mesma referência, zero mutação
  });

  it('normalizeCoverZIndex normaliza zIndex com sequência contínua a partir de 10', () => {
    const initialLayers = deriveLegacyCoverLayers(sampleLegacyBlock);
    const normalized = normalizeCoverZIndex(initialLayers);
    expect(normalized.map((l) => l.zIndex)).toEqual([10, 11, 12, 13, 14]);
  });

  // ==========================================================================
  // 6. RESOLUÇÃO CANÔNICA DE BACKGROUNDS E ESCRITAS PURAS
  // ==========================================================================
  it('COVER-BACKGROUND-SOURCE-1: respeita rigorosamente a precedência de fontes de background', () => {
    // 1. assetId vence todos os fallbacks
    const blockWithAll: ContentBlock = {
      ...sampleLegacyBlock,
      assetId: 'asset-hero-123',
      imageUrl: 'https://externa.com/foto.jpg',
      legacyUrl: 'https://legado.com/foto.jpg',
      customData: { backgroundImageUrl: 'https://custom.com/foto.jpg' }
    };
    expect(resolveCoverBackgroundSource(blockWithAll)).toEqual({
      kind: 'asset',
      assetId: 'asset-hero-123'
    });

    // 2. customData.backgroundImageUrl vence legacyUrl e imageUrl
    const blockWithCustomBg: ContentBlock = {
      ...sampleLegacyBlock,
      imageUrl: 'https://externa.com/foto.jpg',
      legacyUrl: 'https://legado.com/foto.jpg',
      customData: { backgroundImageUrl: 'https://custom.com/foto.jpg' }
    };
    expect(resolveCoverBackgroundSource(blockWithCustomBg)).toEqual({
      kind: 'url',
      url: 'https://custom.com/foto.jpg'
    });

    // 3. legacyUrl vence imageUrl externa direta
    const blockWithLegacyUrl: ContentBlock = {
      ...sampleLegacyBlock,
      imageUrl: 'https://externa.com/foto.jpg',
      legacyUrl: 'https://legado.com/foto.jpg'
    };
    expect(resolveCoverBackgroundSource(blockWithLegacyUrl)).toEqual({
      kind: 'url',
      url: 'https://legado.com/foto.jpg'
    });

    // 4. imageUrl externa direta
    const blockWithImageUrl: ContentBlock = {
      ...sampleLegacyBlock,
      imageUrl: 'https://externa.com/foto.jpg'
    };
    expect(resolveCoverBackgroundSource(blockWithImageUrl)).toEqual({
      kind: 'url',
      url: 'https://externa.com/foto.jpg'
    });

    // 5. none quando vazio
    expect(resolveCoverBackgroundSource(sampleLegacyBlock)).toEqual({ kind: 'none' });
  });

  it('COVER-BACKGROUND-SETTERS-1: setCoverBackgroundAsset limpa todas as fontes externas e fallbacks legados', () => {
    const dirtyBlock: ContentBlock = {
      ...sampleLegacyBlock,
      imageUrl: 'https://antiga.com/foto.jpg',
      legacyUrl: 'https://legado.com/foto.jpg',
      customData: { backgroundImageUrl: 'https://custom.com/foto.jpg' }
    };

    const patch = setCoverBackgroundAsset(dirtyBlock, 'asset-novo-456');
    const resolved = resolveCoverBackgroundSource({ ...dirtyBlock, ...patch });

    expect(resolved).toEqual({ kind: 'asset', assetId: 'asset-novo-456' });
    expect(patch.imageUrl).toBeUndefined();
    expect(patch.legacyUrl).toBeUndefined();
    expect(patch.customData?.backgroundImageUrl).toBeUndefined();
  });

  it('COVER-BACKGROUND-SETTERS-2: setCoverBackgroundUrl limpa assetId e fallbacks legados', () => {
    const dirtyBlock: ContentBlock = {
      ...sampleLegacyBlock,
      assetId: 'asset-velho-123',
      legacyUrl: 'https://legado.com/foto.jpg',
      customData: { backgroundImageUrl: 'https://custom.com/foto.jpg' }
    };

    const patch = setCoverBackgroundUrl(dirtyBlock, 'https://nova-imagem.com/capa.png');
    const resolved = resolveCoverBackgroundSource({ ...dirtyBlock, ...patch });

    expect(resolved).toEqual({ kind: 'url', url: 'https://nova-imagem.com/capa.png' });
    expect(patch.assetId).toBeUndefined();
    expect(patch.legacyUrl).toBeUndefined();
    expect(patch.customData?.backgroundImageUrl).toBeUndefined();
  });

  it('COVER-BACKGROUND-SETTERS-3: removeCoverBackground limpa todas as fontes e resulta em kind: none', () => {
    const dirtyBlock: ContentBlock = {
      ...sampleLegacyBlock,
      assetId: 'asset-123',
      imageUrl: 'https://externa.com/foto.jpg',
      legacyUrl: 'https://legado.com/foto.jpg',
      customData: { backgroundImageUrl: 'https://custom.com/foto.jpg' }
    };

    const patch = removeCoverBackground(dirtyBlock);
    const resolved = resolveCoverBackgroundSource({ ...dirtyBlock, ...patch });

    expect(resolved).toEqual({ kind: 'none' });
    expect(patch.assetId).toBeUndefined();
    expect(patch.imageUrl).toBeUndefined();
    expect(patch.legacyUrl).toBeUndefined();
    expect(patch.customData?.backgroundImageUrl).toBeUndefined();
  });
});

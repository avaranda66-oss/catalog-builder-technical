// tests/domain/primary-image-engine.test.ts
// Testes unitários do motor puro de imagem primária (CORE.E5A).

import { describe, it, expect } from 'vitest';
import {
  resolvePrimaryImageSource,
  setPrimaryImageAsset,
  setPrimaryImageUrl,
  removePrimaryImage
} from '../../src/domain/primary-image.engine';

describe('Primary Image Domain Engine (CORE.E5A)', () => {
  it('IMG-SOURCE-1: assetId + imageUrl + legacyUrl -> asset authority', () => {
    const block = {
      assetId: 'asset-123',
      imageUrl: 'https://exemplo.com/nova.jpg',
      legacyUrl: 'https://exemplo.com/legada.jpg'
    };
    const resolved = resolvePrimaryImageSource(block);
    expect(resolved).toEqual({ kind: 'asset', assetId: 'asset-123' });
  });

  it('IMG-SOURCE-2: imageUrl + legacyUrl -> imageUrl authority', () => {
    const block = {
      assetId: undefined,
      imageUrl: 'https://exemplo.com/nova.jpg',
      legacyUrl: 'https://exemplo.com/legada.jpg'
    };
    const resolved = resolvePrimaryImageSource(block);
    expect(resolved).toEqual({ kind: 'url', url: 'https://exemplo.com/nova.jpg' });
  });

  it('IMG-SOURCE-3: legacy only -> legacy fallback', () => {
    const block = {
      assetId: undefined,
      imageUrl: undefined,
      legacyUrl: 'https://exemplo.com/legada.jpg'
    };
    const resolved = resolvePrimaryImageSource(block);
    expect(resolved).toEqual({ kind: 'url', url: 'https://exemplo.com/legada.jpg' });
  });

  it('IMG-SOURCE-NONE: sem fontes válidas retorna kind: none', () => {
    expect(resolvePrimaryImageSource(null)).toEqual({ kind: 'none' });
    expect(resolvePrimaryImageSource({})).toEqual({ kind: 'none' });
    expect(resolvePrimaryImageSource({ assetId: '   ', imageUrl: '', legacyUrl: null })).toEqual({
      kind: 'none'
    });
  });

  it('IMG-SOURCE-4: setPrimaryImageAsset limpa imageUrl e legacyUrl', () => {
    const patch = setPrimaryImageAsset('asset-novo-456');
    expect(patch).toEqual({
      assetId: 'asset-novo-456',
      imageUrl: undefined,
      legacyUrl: undefined
    });
  });

  it('IMG-SOURCE-5: setPrimaryImageUrl limpa assetId e legacyUrl', () => {
    const patch = setPrimaryImageUrl('https://externa.com/foto.png');
    expect(patch).toEqual({
      assetId: undefined,
      imageUrl: 'https://externa.com/foto.png',
      legacyUrl: undefined
    });
  });

  it('IMG-SOURCE-6: removePrimaryImage limpa todas as fontes e resulta em kind: none', () => {
    const patch = removePrimaryImage();
    expect(patch).toEqual({
      assetId: undefined,
      imageUrl: undefined,
      legacyUrl: undefined
    });

    const blockAfterRemove = {
      assetId: patch.assetId,
      imageUrl: patch.imageUrl,
      legacyUrl: patch.legacyUrl
    };
    expect(resolvePrimaryImageSource(blockAfterRemove)).toEqual({ kind: 'none' });
  });
});

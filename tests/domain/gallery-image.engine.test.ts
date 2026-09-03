// tests/domain/gallery-image.engine.test.ts
// Testes unitários para o motor puro de mídia de galeria (CORE.E6B).

import { describe, it, expect } from 'vitest';
import {
  resolveGalleryImageSource,
  setGalleryItemAsset,
  setGalleryItemUrl,
  removeGalleryItemSource,
  createEmptyGalleryItem,
  GalleryItem
} from '../../src/domain/gallery-image.engine';

describe('gallery-image.engine', () => {
  describe('resolveGalleryImageSource', () => {
    it('prioritizes assetId over url', () => {
      const item: GalleryItem = {
        assetId: 'asset-123',
        url: 'https://example.com/legacy.jpg',
        caption: 'Sample'
      };
      const source = resolveGalleryImageSource(item);
      expect(source).toEqual({
        kind: 'asset',
        assetId: 'asset-123'
      });
    });

    it('falls back to url if assetId is missing or empty', () => {
      const item: GalleryItem = {
        assetId: '',
        url: 'https://example.com/direct.jpg',
        caption: 'Sample'
      };
      const source = resolveGalleryImageSource(item);
      expect(source).toEqual({
        kind: 'url',
        url: 'https://example.com/direct.jpg'
      });
    });

    it('returns none if both are absent or whitespace', () => {
      const item: GalleryItem = {
        assetId: '  ',
        url: '   ',
        caption: 'Sample'
      };
      const source = resolveGalleryImageSource(item);
      expect(source).toEqual({ kind: 'none' });
    });
  });

  describe('setGalleryItemAsset', () => {
    it('sets assetId and clears url and legacy fields', () => {
      const item: GalleryItem = {
        url: 'https://example.com/old.jpg',
        caption: 'Keep Caption'
      };
      const updated = setGalleryItemAsset(item, 'asset-999');
      expect(updated.assetId).toBe('asset-999');
      expect(updated.url).toBe('');
      expect(updated.caption).toBe('Keep Caption');
    });
  });

  describe('setGalleryItemUrl', () => {
    it('sets url and clears assetId', () => {
      const item: GalleryItem = {
        url: '',
        assetId: 'asset-888',
        caption: 'Keep Caption'
      };
      const updated = setGalleryItemUrl(item, 'https://example.com/new.jpg');
      expect(updated.url).toBe('https://example.com/new.jpg');
      expect(updated.assetId).toBeUndefined();
      expect(updated.caption).toBe('Keep Caption');
    });
  });

  describe('removeGalleryItemSource', () => {
    it('clears both assetId and url while preserving caption', () => {
      const item: GalleryItem = {
        assetId: 'asset-777',
        url: 'https://example.com/image.jpg',
        caption: 'Important Caption'
      };
      const cleared = removeGalleryItemSource(item);
      expect(cleared.assetId).toBeUndefined();
      expect(cleared.url).toBe('');
      expect(cleared.caption).toBe('Important Caption');
    });
  });

  describe('createEmptyGalleryItem', () => {
    it('creates an empty slot without demo or placeholder URLs', () => {
      const item = createEmptyGalleryItem();
      expect(item).toEqual({
        url: '',
        caption: ''
      });
      expect(resolveGalleryImageSource(item).kind).toBe('none');
    });
  });
});

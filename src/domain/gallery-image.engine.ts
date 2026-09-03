// src/domain/gallery-image.engine.ts
// Domínio puro para itens de galeria fotográfica (CORE.E6B).
// Trata a autoridade de fonte de imagem: assetId > url > none.
// Desacoplado de React, Store ou DOM.

export interface GalleryItem {
  assetId?: string;
  url: string;
  caption?: string;
}

export type GalleryImageSource =
  | { kind: 'asset'; assetId: string }
  | { kind: 'url'; url: string }
  | { kind: 'none' };

/**
 * Resolve a fonte fotográfica ativa de um item de galeria conforme a hierarquia:
 * assetId válido > url não-vazia > none.
 */
export function resolveGalleryImageSource(
  item: Partial<GalleryItem> | null | undefined
): GalleryImageSource {
  if (!item || typeof item !== 'object') {
    return { kind: 'none' };
  }

  if (typeof item.assetId === 'string' && item.assetId.trim().length > 0) {
    return { kind: 'asset', assetId: item.assetId.trim() };
  }

  if (typeof item.url === 'string' && item.url.trim().length > 0) {
    return { kind: 'url', url: item.url.trim() };
  }

  return { kind: 'none' };
}

/**
 * Define o assetId de um item de galeria, limpando a URL conflitante e preservando a legenda.
 */
export function setGalleryItemAsset(item: GalleryItem, assetId: string): GalleryItem {
  return {
    ...item,
    assetId: assetId.trim(),
    url: ''
  };
}

/**
 * Define uma URL externa para o item de galeria, limpando o assetId conflitante e preservando a legenda.
 */
export function setGalleryItemUrl(item: GalleryItem, url: string): GalleryItem {
  return {
    ...item,
    assetId: undefined,
    url: url.trim()
  };
}

/**
 * Remove a fonte de imagem do item, mantendo o item e a legenda intactos.
 */
export function removeGalleryItemSource(item: GalleryItem): GalleryItem {
  return {
    ...item,
    assetId: undefined,
    url: ''
  };
}

/**
 * Cria um novo item de galeria vazio, seguro e sem URLs fictícias.
 */
export function createEmptyGalleryItem(): GalleryItem {
  return {
    url: '',
    caption: ''
  };
}

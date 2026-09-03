// src/domain/primary-image.engine.ts
// Motor puro de domínio para autoridade de imagem primária de blocos (CORE.E5A).
// Usado por blocos individuais com fotografia principal (image, e posteriormente hero_banner).
// Zero dependências de React, Zustand ou Supabase.

export type PrimaryImageSource =
  | { kind: 'asset'; assetId: string }
  | { kind: 'url'; url: string }
  | { kind: 'none' };

export type PrimaryImagePatch = {
  assetId: string | undefined;
  imageUrl: string | undefined;
  legacyUrl: string | undefined;
};

export interface PrimaryImageTarget {
  assetId?: string | null;
  imageUrl?: string | null;
  legacyUrl?: string | null;
}

/**
 * Resolve a fonte autoritativa de imagem primária seguindo estritamente a precedência:
 * 1. assetId válido
 * 2. imageUrl explícita
 * 3. legacyUrl histórica
 * 4. none
 */
export function resolvePrimaryImageSource(block: PrimaryImageTarget | null | undefined): PrimaryImageSource {
  if (!block) {
    return { kind: 'none' };
  }

  if (typeof block.assetId === 'string' && block.assetId.trim()) {
    return { kind: 'asset', assetId: block.assetId.trim() };
  }

  if (typeof block.imageUrl === 'string' && block.imageUrl.trim()) {
    return { kind: 'url', url: block.imageUrl.trim() };
  }

  if (typeof block.legacyUrl === 'string' && block.legacyUrl.trim()) {
    return { kind: 'url', url: block.legacyUrl.trim() };
  }

  return { kind: 'none' };
}

/**
 * Define um asset do acervo/upload como autoridade primária e anula URLs e fallbacks legados.
 */
export function setPrimaryImageAsset(assetId: string): PrimaryImagePatch {
  return {
    assetId: assetId.trim() || undefined,
    imageUrl: undefined,
    legacyUrl: undefined
  };
}

/**
 * Define uma URL externa explícita como autoridade primária e anula assetId e fallbacks legados.
 */
export function setPrimaryImageUrl(url: string): PrimaryImagePatch {
  return {
    assetId: undefined,
    imageUrl: url.trim() || undefined,
    legacyUrl: undefined
  };
}

/**
 * Remove a imagem primária, limpando todas as fontes (assetId, imageUrl, legacyUrl).
 */
export function removePrimaryImage(): PrimaryImagePatch {
  return {
    assetId: undefined,
    imageUrl: undefined,
    legacyUrl: undefined
  };
}

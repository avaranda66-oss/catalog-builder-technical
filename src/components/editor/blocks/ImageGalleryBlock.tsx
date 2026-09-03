// src/components/editor/blocks/ImageGalleryBlock.tsx
// Bloco Galeria de Fotos Industriais canônico (CORE.E6B).
// Elimina fotografias demo do Unsplash, overlay de upload no Canvas e contentEditable.

import React from 'react';
import { GalleryHorizontalEnd, Image as ImageIcon } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import {
  GalleryItem,
  resolveGalleryImageSource
} from '../../../domain/gallery-image.engine';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useResolvedAssetUrl } from '../../../hooks/useResolvedAssetUrl';

interface ImageGalleryBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
  isExport?: boolean;
}

const GalleryCardItem: React.FC<{
  item: GalleryItem;
  index: number;
  isExport?: boolean;
}> = ({ item, index, isExport }) => {
  const source = resolveGalleryImageSource(item);
  const displayUrl = useResolvedAssetUrl(
    source.kind === 'asset' ? source.assetId : undefined,
    source.kind === 'url' ? source.url : undefined
  );

  const hasCaption = typeof item.caption === 'string' && item.caption.trim().length > 0;

  // Se não houver fonte válida:
  if (source.kind === 'none' || !displayUrl) {
    if (isExport) {
      return null;
    }
    return (
      <div className="flex flex-col space-y-1 bg-slate-50 border border-dashed border-slate-300 p-2 rounded-none text-center no-print">
        <div className="w-full aspect-video bg-slate-100 flex flex-col items-center justify-center text-slate-400 gap-1">
          <ImageIcon className="w-5 h-5" />
          <span className="text-[10px]">Sem imagem vinculada</span>
        </div>
        {hasCaption ? (
          <span className="text-[10px] text-slate-600 font-sans italic truncate">
            {item.caption}
          </span>
        ) : (
          <span className="text-[10px] text-slate-400 italic">Legenda vazia</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-1 bg-slate-50 border border-slate-200 p-1.5 rounded-none">
      <div className="w-full aspect-video overflow-hidden bg-slate-950 flex items-center justify-center">
        <img
          src={displayUrl}
          alt={item.caption || 'Foto de Aplicação'}
          className="w-full h-full object-cover object-center"
        />
      </div>

      {hasCaption ? (
        <span
          data-printable-field={`img_${index}_caption`}
          className="text-[10px] text-slate-700 font-sans leading-tight block px-0.5"
        >
          {item.caption}
        </span>
      ) : !isExport ? (
        <span className="text-[10px] text-slate-400 italic px-0.5 no-print">
          Legenda opcional...
        </span>
      ) : null}
    </div>
  );
};

export const ImageGalleryBlock: React.FC<ImageGalleryBlockProps> = ({
  block,
  isSelected,
  isExport
}) => {
  const setSelectedBlockId = useCatalogStore((state) => state.setSelectedBlockId);

  const rawImages: GalleryItem[] = Array.isArray(block.images) ? block.images : [];

  // Em modo exportação, só renderiza itens que possuem imagem válida (CORE.E6B Req 26/31)
  const images = isExport
    ? rawImages.filter((img) => resolveGalleryImageSource(img).kind !== 'none')
    : rawImages;

  const hasTitle = typeof block.title === 'string' && block.title.trim().length > 0;

  return (
    <div
      onClick={(e) => {
        if (isExport) return;
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-3 bg-white rounded-none border border-slate-300 transition-all ${
        !isExport && isSelected ? 'ring-2 ring-blue-600' : ''
      } ${!isExport ? 'hover:border-slate-400' : ''}`}
    >
      {/* Header Técnico */}
      {(hasTitle || !isExport) && (
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 mb-2">
          <h3
            data-printable-field="title"
            className="text-xs font-bold text-slate-900 uppercase tracking-wider rounded-none px-1 flex items-center gap-1.5"
          >
            <GalleryHorizontalEnd className="w-3.5 h-3.5 text-[#003366] shrink-0" />
            {hasTitle ? (
              <span>{block.title}</span>
            ) : !isExport ? (
              <span className="text-slate-400 italic no-print">
                Galeria de Fotos Industriais...
              </span>
            ) : null}
          </h3>
        </div>
      )}

      {/* Grid de Fotos */}
      {images.length > 0 ? (
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${Math.min(Math.max(images.length, 1), 4)}, minmax(0, 1fr))`
          }}
        >
          {images.map((img, idx) => (
            <GalleryCardItem
              key={idx}
              item={img}
              index={idx}
              isExport={isExport}
            />
          ))}
        </div>
      ) : !isExport ? (
        <div className="p-2 text-center text-xs text-slate-400 italic border border-dashed border-slate-200 no-print">
          Nenhuma fotografia cadastrada. Adicione imagens pelo Inspector.
        </div>
      ) : null}
    </div>
  );
};

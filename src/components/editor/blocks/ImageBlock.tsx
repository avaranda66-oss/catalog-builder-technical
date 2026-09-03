import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useResolvedAssetUrl } from '../../../hooks/useResolvedAssetUrl';
import { resolvePrimaryImageSource } from '../../../domain/primary-image.engine';

interface ImageBlockProps {
  block: ContentBlock;
  pageId?: string;
  isSelected?: boolean;
  isExport?: boolean;
}

export const ImageBlock: React.FC<ImageBlockProps> = ({ block, isSelected, isExport }) => {
  const { setSelectedBlockId } = useCatalogStore();
  const source = resolvePrimaryImageSource(block);

  const assetId = source.kind === 'asset' ? source.assetId : undefined;
  const fallbackUrl = source.kind === 'url' ? source.url : undefined;
  const displayUrl = useResolvedAssetUrl(assetId, fallbackUrl);

  return (
    <div
      onClick={(e) => {
        if (isExport) return;
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-2 rounded transition-all ${
        isSelected && !isExport
          ? 'ring-2 ring-brand-500 bg-brand-50/20'
          : isExport
          ? 'shadow-none'
          : 'cursor-pointer hover:ring-1 hover:ring-slate-300'
      }`}
    >
      {displayUrl ? (
        <div className="flex flex-col items-center justify-center w-full py-1">
          <img
            src={displayUrl}
            alt={block.imageCaption || 'Product Image'}
            className="max-w-full max-h-[420px] h-auto object-contain rounded-none border border-slate-300 shadow-2xs"
          />
          {block.imageCaption && (
            <p data-printable-field="imageCaption" className="text-[11px] text-slate-500 italic mt-1.5 text-center font-sans">
              {block.imageCaption}
            </p>
          )}
        </div>
      ) : (
        <div className="w-full h-48 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 bg-slate-50 no-print">
          <ImageIcon className="w-8 h-8 mb-1" />
          <span className="text-xs">Clique no painel direito para configurar a imagem</span>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface ImageBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const ImageBlock: React.FC<ImageBlockProps> = ({ block, isSelected }) => {
  const { setSelectedBlockId } = useCatalogStore();

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-2 rounded transition-all cursor-pointer ${
        isSelected ? 'ring-2 ring-brand-500 bg-brand-50/20' : 'hover:ring-1 hover:ring-slate-300'
      }`}
    >
      {block.imageUrl ? (
        <div className="flex flex-col items-center">
          <img
            src={block.imageUrl}
            alt={block.imageCaption || 'Imagem do Catálogo'}
            className="w-full max-h-[480px] object-cover rounded-lg border border-slate-200 shadow-sm"
          />
          {block.imageCaption && (
            <p className="text-[11px] text-slate-500 italic mt-2 text-center font-sans">
              {block.imageCaption}
            </p>
          )}
        </div>
      ) : (
        <div className="w-full h-48 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 bg-slate-50">
          <ImageIcon className="w-8 h-8 mb-1" />
          <span className="text-xs">Clique no painel direito para configurar a imagem</span>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface BoxBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const BoxBlock: React.FC<BoxBlockProps> = ({ block, pageId, isSelected }) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    updateBlock(pageId, block.id, { textContent: e.currentTarget.innerText });
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative rounded-lg transition-all ${
        isSelected ? 'ring-2 ring-brand-500' : 'hover:ring-1 hover:ring-slate-300'
      }`}
      style={{
        backgroundColor: block.style?.backgroundColor || '#f8fafc',
        borderColor: block.style?.borderColor || '#e2e8f0',
        borderWidth: block.style?.borderWidth || '1px',
        padding: block.style?.padding || '16px',
        borderStyle: 'solid'
      }}
    >
      <div
        contentEditable
        suppressContentEditableWarning
        onBlur={handleBlur}
        className="outline-none text-xs font-sans text-slate-800 leading-relaxed whitespace-pre-wrap"
        dangerouslySetInnerHTML={{
          __html: (block.textContent || 'Digite observações ou caixas conceituais...')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
        }}
      />
    </div>
  );
};

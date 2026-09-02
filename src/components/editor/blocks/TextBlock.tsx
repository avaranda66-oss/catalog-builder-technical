import React from 'react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface TextBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected?: boolean;
  isExport?: boolean;
}

export const TextBlock: React.FC<TextBlockProps> = ({ block, pageId, isSelected, isExport }) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (isExport) return;
    updateBlock(pageId, block.id, { textContent: e.currentTarget.innerText });
  };

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
          : 'cursor-text hover:ring-1 hover:ring-slate-300'
      }`}
      style={{
        ...block.style
      }}
    >
      <div
        data-printable-field="textContent"
        contentEditable={!isExport}
        suppressContentEditableWarning
        onBlur={handleBlur}
        className="outline-none whitespace-pre-wrap font-sans text-slate-900 leading-relaxed"
        dangerouslySetInnerHTML={{
          __html: (block.textContent || (isExport ? '' : 'Digite o texto aqui...'))
            .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mb-2 text-slate-900">$1</h1>')
            .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mb-1.5 text-slate-900">$1</h2>')
            .replace(/^### (.*$)/gim, '<h3 class="text-base font-semibold mb-1 text-slate-700">$1</h3>')
        }}
      />
    </div>
  );
};

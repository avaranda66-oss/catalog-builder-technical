import React from 'react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface BoxBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

const renderInlineMarkup = (text: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  const markupPattern = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = markupPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      nodes.push(<strong key={`strong-${key++}`}>{match[1]}</strong>);
    } else {
      nodes.push(<em key={`em-${key++}`}>{match[2]}</em>);
    }

    lastIndex = markupPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
};

export const BoxBlock: React.FC<BoxBlockProps> = ({ block, pageId, isSelected }) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();
  const displayText = block.textContent || 'Digite notas técnicas ou advertências metrológicas...';

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    updateBlock(pageId, block.id, { textContent: e.currentTarget.innerText.trim() });
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative rounded-none transition-all ${
        isSelected ? 'ring-2 ring-blue-600' : 'hover:border-slate-400'
      }`}
      style={{
        backgroundColor: block.style?.backgroundColor || '#f8fafc',
        borderColor: block.style?.borderColor || '#cbd5e1',
        borderWidth: block.style?.borderWidth || '1px',
        padding: block.style?.padding || '12px',
        borderStyle: 'solid'
      }}
    >
      <div
        data-printable-field="textContent"
        contentEditable
        suppressContentEditableWarning
        onBlur={handleBlur}
        className="outline-none text-xs font-sans text-slate-800 leading-relaxed whitespace-pre-wrap cursor-text"
      >
        {renderInlineMarkup(displayText)}
      </div>
    </div>
  );
};

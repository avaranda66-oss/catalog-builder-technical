// src/components/editor/blocks/TextBlock.tsx
// Bloco de Texto Livre (CORE.E5A.1).
// Canvas = representação visual segura + seleção.
// Inspector = autoridade de edição.
// Zero contentEditable, zero dangerouslySetInnerHTML, zero mutações documentais no canvas.

import React from 'react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface TextBlockProps {
  block: ContentBlock;
  pageId?: string;
  isSelected?: boolean;
  isExport?: boolean;
}

export const TextBlock: React.FC<TextBlockProps> = ({ block, isSelected, isExport }) => {
  const setSelectedBlockId = useCatalogStore((state) => state.setSelectedBlockId);

  const rawText = block.textContent || '';
  const isEmpty = !rawText.trim();

  const renderContent = () => {
    if (isEmpty) {
      if (isExport) {
        return null;
      }
      return (
        <span className="italic text-slate-400 select-none">
          Digite o texto aqui...
        </span>
      );
    }

    const lines = rawText.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('### ')) {
        return (
          <h3 key={idx} className="text-base font-semibold mb-1 text-slate-700">
            {line.slice(4)}
          </h3>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h2 key={idx} className="text-xl font-bold mb-1.5 text-slate-900">
            {line.slice(3)}
          </h2>
        );
      }
      if (line.startsWith('# ')) {
        return (
          <h1 key={idx} className="text-2xl font-bold mb-2 text-slate-900">
            {line.slice(2)}
          </h1>
        );
      }
      return (
        <p key={idx} className="min-h-[1.5em] m-0">
          {line}
        </p>
      );
    });
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
          : 'cursor-pointer hover:ring-1 hover:ring-slate-300'
      }`}
      style={{
        ...block.style
      }}
    >
      <div
        data-printable-field="textContent"
        className="outline-none whitespace-pre-wrap font-sans text-slate-900 leading-relaxed"
      >
        {renderContent()}
      </div>
    </div>
  );
};

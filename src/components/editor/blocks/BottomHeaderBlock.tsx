import React from 'react';
import { Phone, Mail, Globe } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface BottomHeaderBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const BottomHeaderBlock: React.FC<BottomHeaderBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();

  const custom = block.customData || {};
  const gradientClass =
    block.style?.gradient ||
    custom.gradient ||
    'bg-[#001f3f]';

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
  };

  const handleSubtitleBlur = (e: React.FocusEvent<HTMLParagraphElement>) => {
    updateBlock(pageId, block.id, { subtitle: e.currentTarget.innerText.trim() });
  };

  const handleBadgeBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, { badgeText: e.currentTarget.innerText.trim() });
  };

  const handlePhoneBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, {
      customData: { ...custom, phone: e.currentTarget.innerText.trim() }
    });
  };

  const handleEmailBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, {
      customData: { ...custom, email: e.currentTarget.innerText.trim() }
    });
  };

  const handleWebsiteBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, {
      customData: { ...custom, website: e.currentTarget.innerText.trim() }
    });
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-3.5 rounded-none ${gradientClass} text-white transition-all border border-slate-700 ${
        isSelected ? 'ring-2 ring-blue-500' : 'hover:border-slate-500'
      }`}
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={handleBadgeBlur}
              className="inline-flex items-center justify-center text-[9px] font-mono font-bold tracking-widest uppercase bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2.5 py-1 leading-none rounded-none outline-none focus:bg-white/20 cursor-text box-border"
            >
              {block.badgeText || 'PRESYS METROLOGIA'}
            </span>
          </div>

          <h2
            contentEditable
            suppressContentEditableWarning
            onBlur={handleTitleBlur}
            className="text-lg font-black tracking-tight text-white outline-none focus:bg-white/10 rounded-none px-1 -ml-1 cursor-text leading-tight"
          >
            {block.title || 'ESPECIFICAÇÕES TÉCNICAS E SISTEMAS DE CALIBRAÇÃO'}
          </h2>

          <p
            contentEditable
            suppressContentEditableWarning
            onBlur={handleSubtitleBlur}
            className="text-xs text-slate-300 font-medium outline-none focus:bg-white/10 rounded-none px-1 -ml-1 cursor-text"
          >
            {block.subtitle || 'Instrumentos de alta precisão para laboratório e controle em processos contínuos.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 text-[10px] text-slate-300 font-mono pt-2 md:pt-0 border-t md:border-t-0 md:border-l border-white/10 md:pl-4">
          <div className="flex items-center gap-1.5">
            <Phone className="w-3 h-3 text-blue-400 shrink-0" />
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={handlePhoneBlur}
              className="outline-none focus:bg-white/20 rounded-none px-0.5 cursor-text"
            >
              {custom.phone || '+55 (11) 3038-1300'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Mail className="w-3 h-3 text-blue-400 shrink-0" />
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={handleEmailBlur}
              className="outline-none focus:bg-white/20 rounded-none px-0.5 cursor-text"
            >
              {custom.email || 'vendas@presys.com.br'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Globe className="w-3 h-3 text-blue-400 shrink-0" />
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={handleWebsiteBlur}
              className="outline-none focus:bg-white/20 rounded-none px-0.5 cursor-text"
            >
              {custom.website || 'www.presys.com.br'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

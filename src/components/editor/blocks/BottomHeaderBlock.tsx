import React from 'react';
import { Building2, Phone, Mail, Globe } from 'lucide-react';
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
    'bg-gradient-to-r from-slate-900 via-[#002244] to-slate-900';

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
      className={`relative p-5 rounded-2xl ${gradientClass} text-white shadow-lg transition-all ${
        isSelected ? 'ring-3 ring-brand-400 shadow-xl' : 'hover:ring-1 hover:ring-slate-400'
      }`}
    >
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Lado Esquerdo: Identidade e Resumo */}
        <div className="space-y-1 text-left flex-1">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-brand-400 shrink-0" />
            <h3
              contentEditable
              suppressContentEditableWarning
              onBlur={handleTitleBlur}
              className="text-sm font-extrabold tracking-wide uppercase outline-none focus:bg-white/10 rounded px-1 -ml-1 cursor-text"
            >
              {block.title || 'PRESYS INSTRUMENTOS & SISTEMAS LTDA'}
            </h3>
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={handleBadgeBlur}
              className="text-[9px] bg-brand-500/30 border border-brand-400/40 text-brand-200 px-2 py-0.5 rounded font-mono outline-none focus:bg-white/20 cursor-text"
            >
              {block.badgeText || 'ISO 9001 / RBC'}
            </span>
          </div>

          <p
            contentEditable
            suppressContentEditableWarning
            onBlur={handleSubtitleBlur}
            className="text-xs text-slate-300 outline-none focus:bg-white/10 rounded px-1 -ml-1 cursor-text"
          >
            {block.subtitle ||
              'Soluções completas para calibração de pressão, temperatura e sinais de processo.'}
          </p>
        </div>

        {/* Lado Direito: Contatos e Certificação 100% Editáveis */}
        <div className="flex items-center gap-4 text-[10px] text-slate-300 font-mono flex-shrink-0">
          <div className="flex flex-col gap-1 text-right">
            <span className="flex items-center gap-1 justify-end">
              <Phone className="w-3 h-3 text-brand-400" />
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={handlePhoneBlur}
                className="outline-none focus:bg-white/20 rounded px-0.5 cursor-text"
              >
                {custom.phone || '+55 (11) 3038-1300'}
              </span>
            </span>
            <span className="flex items-center gap-1 justify-end">
              <Mail className="w-3 h-3 text-brand-400" />
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={handleEmailBlur}
                className="outline-none focus:bg-white/20 rounded px-0.5 cursor-text"
              >
                {custom.email || 'vendas@presys.com.br'}
              </span>
            </span>
            <span className="flex items-center gap-1 justify-end">
              <Globe className="w-3 h-3 text-brand-400" />
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={handleWebsiteBlur}
                className="outline-none focus:bg-white/20 rounded px-0.5 cursor-text"
              >
                {custom.website || 'www.presys.com.br'}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

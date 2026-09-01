import React from 'react';
import { Phone, Mail, Globe, MapPin, Building2 } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface ContactFooterBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const ContactFooterBlock: React.FC<ContactFooterBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();

  const contact = block.contactInfo || {
    companyName: 'PCON Instrumentação e Automação Industrial Ltda.',
    phone: '(11) 4000-0000',
    email: 'vendas@pcon-instrumentacao.com.br',
    website: 'www.pcon-instrumentacao.com.br',
    address: 'Atendimento Nacional'
  };

  const handleFieldBlur = (field: string, text: string) => {
    updateBlock(pageId, block.id, {
      contactInfo: {
        ...contact,
        [field]: text
      }
    });
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-3.5 rounded-xl border border-slate-200 bg-slate-900 text-white shadow-sm transition-all ${
        isSelected ? 'ring-2 ring-brand-500' : 'hover:ring-1 hover:ring-slate-400'
      }`}
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-brand-300">
            <Building2 className="w-4 h-4" />
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleFieldBlur('companyName', e.currentTarget.innerText)}
              className="outline-none focus:bg-slate-800 rounded px-1"
            >
              {contact.companyName}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <MapPin className="w-3.5 h-3.5 text-slate-500" />
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleFieldBlur('address', e.currentTarget.innerText)}
              className="outline-none focus:bg-slate-800 rounded px-1"
            >
              {contact.address}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-300 font-mono">
          <div className="flex items-center gap-1">
            <Phone className="w-3.5 h-3.5 text-brand-400" />
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleFieldBlur('phone', e.currentTarget.innerText)}
              className="outline-none focus:bg-slate-800 rounded px-1"
            >
              {contact.phone}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Mail className="w-3.5 h-3.5 text-brand-400" />
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleFieldBlur('email', e.currentTarget.innerText)}
              className="outline-none focus:bg-slate-800 rounded px-1"
            >
              {contact.email}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Globe className="w-3.5 h-3.5 text-brand-400" />
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleFieldBlur('website', e.currentTarget.innerText)}
              className="outline-none focus:bg-slate-800 rounded px-1"
            >
              {contact.website}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

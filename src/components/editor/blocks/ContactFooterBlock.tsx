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
    companyName: 'PRESYS Instrumentos & Sistemas Ltda.',
    phone: '+55 (11) 3038-1300',
    email: 'vendas@presys.com.br',
    website: 'www.presys.com.br',
    address: 'São Paulo - SP · Brasil'
  };

  const handleFieldBlur = (field: string, text: string) => {
    updateBlock(pageId, block.id, {
      contactInfo: {
        ...contact,
        [field]: text.trim()
      }
    });
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-3 rounded-none border border-slate-700 bg-slate-950 text-white transition-all ${
        isSelected ? 'ring-2 ring-blue-500' : 'hover:border-slate-500'
      }`}
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 font-bold text-white tracking-wide">
            <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleFieldBlur('companyName', e.currentTarget.innerText)}
              className="outline-none focus:bg-slate-800 rounded-none px-1 cursor-text"
            >
              {contact.companyName}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
            <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleFieldBlur('address', e.currentTarget.innerText)}
              className="outline-none focus:bg-slate-800 rounded-none px-1 cursor-text"
            >
              {contact.address}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-300 font-mono">
          {contact.phone && (
            <div className="flex items-center gap-1">
              <Phone className="w-3 h-3 text-blue-400 shrink-0" />
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleFieldBlur('phone', e.currentTarget.innerText)}
                className="outline-none focus:bg-slate-800 rounded-none px-0.5 cursor-text"
              >
                {contact.phone}
              </span>
            </div>
          )}

          {contact.email && (
            <div className="flex items-center gap-1">
              <Mail className="w-3 h-3 text-blue-400 shrink-0" />
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleFieldBlur('email', e.currentTarget.innerText)}
                className="outline-none focus:bg-slate-800 rounded-none px-0.5 cursor-text"
              >
                {contact.email}
              </span>
            </div>
          )}

          {contact.website && (
            <div className="flex items-center gap-1">
              <Globe className="w-3 h-3 text-blue-400 shrink-0" />
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleFieldBlur('website', e.currentTarget.innerText)}
                className="outline-none focus:bg-slate-800 rounded-none px-0.5 cursor-text"
              >
                {contact.website}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

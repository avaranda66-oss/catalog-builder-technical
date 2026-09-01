import React from 'react';
import { Laptop, Wifi, Usb, Database, Plus, Trash2 } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface SoftwareConnectivityBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const SoftwareConnectivityBlock: React.FC<SoftwareConnectivityBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();

  const custom = block.customData || {};
  const items = custom.items || [
    {
      title: 'Software ISOPLAN®',
      desc: 'Integração direta para emissão automatizada de certificados de calibração RBC e relatórios de conformidade.',
      icon: 'Laptop',
      badge: 'Software'
    },
    {
      title: 'Comunicação HART® & Modbus',
      desc: 'Configuração de transmissores inteligentes com leitura de PV, loop de corrente e ajuste de zero/span.',
      icon: 'Wifi',
      badge: 'Protocolos'
    },
    {
      title: 'Conexão USB & Ethernet',
      desc: 'Exportação de dados em tempo real para SCADA, CLP ou pendrive em formato CSV e PDF criptografado.',
      icon: 'Usb',
      badge: 'Hardware'
    },
    {
      title: 'Datalogger Interno',
      desc: 'Memória para mais de 100.000 pontos com gravação de tendências e rastreabilidade total.',
      icon: 'Database',
      badge: 'Memória'
    }
  ];

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
  };

  const handleBadgeBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, { badgeText: e.currentTarget.innerText.trim() });
  };

  const handleUpdateItem = (idx: number, field: 'title' | 'desc' | 'badge', val: string) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: val };
    updateBlock(pageId, block.id, {
      customData: { ...custom, items: updated }
    });
  };

  const handleAddItem = () => {
    const newItem = {
      title: 'Novo Recurso Digital',
      desc: 'Descrição da funcionalidade ou protocolo industrial.',
      icon: 'Laptop',
      badge: 'Recurso'
    };
    updateBlock(pageId, block.id, {
      customData: { ...custom, items: [...items, newItem] }
    });
  };

  const handleRemoveItem = (idx: number) => {
    if (items.length <= 1) return;
    const updated = items.filter((_: any, i: number) => i !== idx);
    updateBlock(pageId, block.id, {
      customData: { ...custom, items: updated }
    });
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-5 rounded-2xl bg-white border border-slate-200 shadow-md transition-all ${
        isSelected ? 'ring-3 ring-brand-500 shadow-xl' : 'hover:border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-3 gap-2">
        <h3
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-amber-100 rounded px-1 flex items-center gap-2 flex-1 cursor-text"
        >
          <Laptop className="w-4 h-4 text-[#003366] shrink-0" />
          <span>{block.title || 'SOFTWARE DE CALIBRAÇÃO & CONECTIVIDADE INDUSTRIAL'}</span>
        </h3>

        <div className="flex items-center gap-2">
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBadgeBlur}
            className="text-[10px] text-brand-700 font-bold bg-brand-50 px-2 py-0.5 rounded border border-brand-200 outline-none focus:bg-amber-50 cursor-text"
          >
            {block.badgeText || custom.badgeText || 'Digital Factory 4.0'}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAddItem();
            }}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded"
          >
            <Plus className="w-3 h-3" />
            <span>+ Card</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((item: any, idx: number) => (
          <div
            key={idx}
            className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between space-y-2 hover:bg-brand-50/20 hover:border-brand-300 transition-colors relative group"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveItem(idx);
              }}
              className="absolute top-2 right-2 p-0.5 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Excluir card"
            >
              <Trash2 className="w-3 h-3" />
            </button>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between pr-4">
                <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-2xs">
                  {idx % 4 === 0 && <Laptop className="w-4 h-4 text-brand-400" />}
                  {idx % 4 === 1 && <Wifi className="w-4 h-4 text-brand-400" />}
                  {idx % 4 === 2 && <Usb className="w-4 h-4 text-brand-400" />}
                  {idx % 4 === 3 && <Database className="w-4 h-4 text-brand-400" />}
                </div>
                <span
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => handleUpdateItem(idx, 'badge', e.currentTarget.innerText.trim())}
                  className="text-[9px] font-mono text-slate-500 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200 outline-none focus:bg-amber-50 cursor-text"
                >
                  {item.badge}
                </span>
              </div>

              <h4
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleUpdateItem(idx, 'title', e.currentTarget.innerText.trim())}
                className="font-bold text-slate-900 text-xs outline-none focus:bg-amber-100 rounded px-0.5 cursor-text"
              >
                {item.title}
              </h4>

              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleUpdateItem(idx, 'desc', e.currentTarget.innerText.trim())}
                className="text-[10px] text-slate-600 leading-relaxed outline-none focus:bg-amber-50 rounded px-0.5 cursor-text"
              >
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

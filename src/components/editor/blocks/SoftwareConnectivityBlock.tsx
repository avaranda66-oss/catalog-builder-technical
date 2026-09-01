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
    updated[idx] = { ...updated[idx], [field]: val.trim() };
    updateBlock(pageId, block.id, {
      customData: { ...custom, items: updated }
    });
  };

  const handleAddItem = () => {
    const newItem = {
      title: 'Novo Recurso de Conectividade',
      desc: 'Descrição técnica da integração digital e recursos metrológicos.',
      icon: 'Laptop',
      badge: 'Digital'
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

  const renderIcon = (iconName: string) => {
    switch (iconName) {
      case 'Wifi':
        return <Wifi className="w-4 h-4 text-[#003366]" />;
      case 'Usb':
        return <Usb className="w-4 h-4 text-[#003366]" />;
      case 'Database':
        return <Database className="w-4 h-4 text-[#003366]" />;
      default:
        return <Laptop className="w-4 h-4 text-[#003366]" />;
    }
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-3 bg-white rounded-none border border-slate-300 transition-all ${
        isSelected ? 'ring-2 ring-blue-600' : 'hover:border-slate-400'
      }`}
    >
      {/* Header Técnico */}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 mb-2 gap-2">
        <h3
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-slate-100 rounded-none px-1 flex items-center gap-1.5 flex-1 cursor-text"
          title="Clique para editar o título"
        >
          <Laptop className="w-3.5 h-3.5 text-[#003366] shrink-0" />
          <span>{block.title || 'SOFTWARE DE CALIBRAÇÃO & CONECTIVIDADE INDUSTRIAL'}</span>
        </h3>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBadgeBlur}
            className="inline-flex items-center justify-center text-[9px] text-[#003366] font-mono font-bold bg-blue-50 px-2.5 py-1 leading-none rounded-none border border-blue-200 outline-none focus:bg-amber-100 cursor-text box-border"
          >
            {block.badgeText || 'Digital Factory 4.0'}
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAddItem();
            }}
            className="flex items-center gap-0.5 px-2 py-0.5 text-[9px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-none no-print"
            data-editor-action="true"
          >
            <Plus className="w-3 h-3" />
            <span>+ Card</span>
          </button>
        </div>
      </div>

      {/* Grid de Cards de Conectividade (Cantos Retos) */}
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))`
        }}
      >
        {items.map((item: any, idx: number) => (
          <div
            key={idx}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-none flex flex-col justify-between space-y-1 hover:border-slate-400 transition-colors group relative"
          >
            {items.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveItem(idx);
                }}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-600 no-print"
                data-editor-action="true"
                title="Excluir"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            )}

            <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1">
              <div className="w-7 h-7 bg-white border border-slate-300 flex items-center justify-center">
                {renderIcon(item.icon)}
              </div>

              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleUpdateItem(idx, 'badge', e.currentTarget.innerText)}
                className="text-[8px] font-mono text-slate-500 uppercase tracking-wider outline-none focus:bg-amber-100 px-0.5"
              >
                {item.badge}
              </span>
            </div>

            <div>
              <h4
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleUpdateItem(idx, 'title', e.currentTarget.innerText)}
                className="font-bold text-slate-900 text-[11px] outline-none focus:bg-amber-100 leading-snug cursor-text"
              >
                {item.title}
              </h4>
              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleUpdateItem(idx, 'desc', e.currentTarget.innerText)}
                className="text-[9px] text-slate-600 leading-relaxed outline-none focus:bg-amber-50 mt-1 cursor-text"
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

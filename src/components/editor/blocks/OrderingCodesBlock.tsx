import React from 'react';
import { Barcode, Trash2 } from 'lucide-react';
import { ContentBlock, OrderingSegment } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface OrderingCodesBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const OrderingCodesBlock: React.FC<OrderingCodesBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();
  const segments: OrderingSegment[] = block.orderingSegments || [
    { id: 's1', code: 'MODELO', name: 'Código Básico', options: ['PCON-200', 'PCON-500'] },
    { id: 's2', code: '[FAIXA]', name: 'Faixa Nominal', options: ['1 (0-1 bar)', '2 (0-10 bar)', '3 (0-100 bar)'] },
    { id: 's3', code: '[SAÍDA]', name: 'Protocolo', options: ['A (4-20mA)', 'H (HART 7)'] }
  ];

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText });
  };

  const handleAddSegment = () => {
    const newSeg: OrderingSegment = {
      id: `seg-${Date.now()}`,
      code: `[OPC-${segments.length + 1}]`,
      name: 'Novo Campo',
      options: ['Opção 1', 'Opção 2']
    };
    updateBlock(pageId, block.id, { orderingSegments: [...segments, newSeg] });
  };

  const handleRemoveSegment = (id: string) => {
    updateBlock(pageId, block.id, { orderingSegments: segments.filter((s) => s.id !== id) });
  };

  const handleSegmentCodeBlur = (id: string, text: string) => {
    const updated = segments.map((s) => (s.id === id ? { ...s, code: text } : s));
    updateBlock(pageId, block.id, { orderingSegments: updated });
  };

  const handleSegmentNameBlur = (id: string, text: string) => {
    const updated = segments.map((s) => (s.id === id ? { ...s, name: text } : s));
    updateBlock(pageId, block.id, { orderingSegments: updated });
  };

  const handleOptionsBlur = (id: string, text: string) => {
    const opts = text.split(',').map((o) => o.trim()).filter(Boolean);
    const updated = segments.map((s) => (s.id === id ? { ...s, options: opts } : s));
    updateBlock(pageId, block.id, { orderingSegments: updated });
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-3.5 rounded-xl border border-slate-200 bg-white shadow-sm transition-all ${
        isSelected ? 'ring-2 ring-brand-500 bg-brand-50/20' : 'hover:ring-1 hover:ring-slate-300'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-slate-100 rounded px-1 flex items-center gap-1.5"
        >
          <Barcode className="w-4 h-4 text-purple-600" />
          <span>{block.title || 'Estrutura do Código de Encomenda'}</span>
        </h3>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAddSegment();
          }}
          className="text-[10px] text-purple-700 hover:text-purple-900 font-medium px-2 py-0.5 border border-purple-200 bg-purple-50 rounded"
        >
          + Bloco de Código
        </button>
      </div>

      {/* Visual Part Number Box */}
      <div className="flex items-center gap-1.5 bg-slate-900 text-white p-2.5 rounded-lg overflow-x-auto shadow-inner mb-3">
        {segments.map((seg, idx) => (
          <React.Fragment key={seg.id}>
            <div className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-center min-w-[70px]">
              <span className="block font-mono font-bold text-xs text-brand-300">{seg.code}</span>
              <span className="block text-[9px] text-slate-400 truncate">{seg.name}</span>
            </div>
            {idx < segments.length - 1 && <span className="text-slate-500 font-mono font-bold">-</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Grid de Opções Detalhadas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-left">
        {segments.map((seg) => (
          <div key={seg.id} className="p-2 bg-slate-50 border border-slate-200 rounded-lg group relative">
            <div className="flex items-center justify-between">
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleSegmentCodeBlur(seg.id, e.currentTarget.innerText)}
                className="font-mono font-bold text-[11px] text-purple-700 outline-none focus:bg-white rounded px-0.5"
              >
                {seg.code}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveSegment(seg.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-0.5"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>

            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleSegmentNameBlur(seg.id, e.currentTarget.innerText)}
              className="block text-[10px] font-semibold text-slate-800 outline-none focus:bg-white rounded px-0.5 mt-0.5"
            >
              {seg.name}
            </span>

            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleOptionsBlur(seg.id, e.currentTarget.innerText)}
              className="mt-1 text-[9px] text-slate-600 font-mono bg-white p-1 rounded border border-slate-200 outline-none focus:ring-1 focus:ring-purple-400"
              title="Edite as opções separadas por vírgula"
            >
              {(seg.options || []).join(', ')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

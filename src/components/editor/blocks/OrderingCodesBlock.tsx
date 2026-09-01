import React from 'react';
import { Barcode, Plus, Trash2 } from 'lucide-react';
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
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
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
    const updated = segments.map((s) => (s.id === id ? { ...s, code: text.trim() } : s));
    updateBlock(pageId, block.id, { orderingSegments: updated });
  };

  const handleSegmentNameBlur = (id: string, text: string) => {
    const updated = segments.map((s) => (s.id === id ? { ...s, name: text.trim() } : s));
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
      className={`relative p-3 bg-white rounded-none border border-slate-300 transition-all ${
        isSelected ? 'ring-2 ring-blue-600' : 'hover:border-slate-400'
      }`}
    >
      {/* Header Técnico */}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 mb-2">
        <h3
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-slate-100 rounded-none px-1 flex items-center gap-1.5 cursor-text"
        >
          <Barcode className="w-3.5 h-3.5 text-[#003366]" />
          <span>{block.title || 'ESTRUTURA DO CÓDIGO DE ENCOMENDA PRESYS (PART NUMBER)'}</span>
        </h3>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAddSegment();
          }}
          className="flex items-center gap-0.5 px-2 py-0.5 text-[9px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-none no-print"
          data-editor-action="true"
        >
          <Plus className="w-3 h-3" />
          <span>+ Bloco de Código</span>
        </button>
      </div>

      {/* Caixa do Código de Encomenda Montado (Cantos Retos) */}
      <div className="bg-slate-900 text-white p-2.5 rounded-none flex items-center gap-1 overflow-x-auto mb-2.5 font-mono text-xs border border-slate-800">
        {segments.map((seg, idx) => (
          <React.Fragment key={seg.id}>
            <div className="bg-slate-800 border border-slate-700 px-2 py-1 text-center shrink-0">
              <span className="font-bold text-blue-300 block text-[10px]">{seg.code}</span>
              <span className="text-[8px] text-slate-400 block truncate max-w-[80px]">{seg.name}</span>
            </div>
            {idx < segments.length - 1 && <span className="text-slate-500 font-bold px-0.5 select-none">-</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Matriz de Opções (Cantos Retos, Linhas 0.25pt) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {segments.map((seg) => (
          <div key={seg.id} className="p-2 border border-slate-200 bg-slate-50 rounded-none text-[10px] relative group">
            <div className="flex items-center justify-between mb-1 pb-1 border-b border-slate-200">
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleSegmentCodeBlur(seg.id, e.currentTarget.innerText)}
                className="font-bold text-[#003366] font-mono outline-none focus:bg-amber-100 px-0.5"
              >
                {seg.code}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveSegment(seg.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-0.5 no-print"
                data-editor-action="true"
                title="Remover campo"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>

            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleSegmentNameBlur(seg.id, e.currentTarget.innerText)}
              className="text-slate-800 font-bold mb-1 outline-none focus:bg-amber-100 px-0.5"
            >
              {seg.name}
            </div>

            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleOptionsBlur(seg.id, e.currentTarget.innerText)}
              className="text-slate-600 font-mono text-[9px] bg-white p-1 border border-slate-200 outline-none focus:bg-amber-50"
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

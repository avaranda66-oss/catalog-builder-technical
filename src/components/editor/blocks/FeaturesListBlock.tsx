import React from 'react';
import { Award, Plus, Trash2 } from 'lucide-react';
import { ContentBlock, FeatureItem } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface FeaturesListBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const FeaturesListBlock: React.FC<FeaturesListBlockProps> = ({ block, pageId, isSelected }) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();
  const features: FeatureItem[] = block.features || [];

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
  };

  const handleItemTitleBlur = (id: string, text: string) => {
    const updated = features.map((f) => (f.id === id ? { ...f, title: text.trim() } : f));
    updateBlock(pageId, block.id, { features: updated });
  };

  const handleItemDescBlur = (id: string, text: string) => {
    const updated = features.map((f) => (f.id === id ? { ...f, description: text.trim() } : f));
    updateBlock(pageId, block.id, { features: updated });
  };

  const handleAddFeature = () => {
    const newItem: FeatureItem = {
      id: `feat-${Date.now()}`,
      title: 'Novo Destaque Técnico',
      description: 'Descrição sucinta do benefício ou especificação diferencial.',
      icon: 'Award'
    };
    updateBlock(pageId, block.id, { features: [...features, newItem] });
  };

  const handleRemoveFeature = (id: string) => {
    updateBlock(pageId, block.id, { features: features.filter((f) => f.id !== id) });
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
          data-printable-field="title"
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-slate-100 rounded-none px-1 flex items-center gap-1.5 cursor-text"
        >
          <Award className="w-3.5 h-3.5 text-[#003366]" />
          <span>{block.title || 'DESTAQUES & RECURSOS TÉCNICOS DO CALIBRADOR'}</span>
        </h3>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAddFeature();
          }}
          className="flex items-center gap-0.5 px-2 py-0.5 text-[9px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-none no-print"
          data-editor-action="true"
        >
          <Plus className="w-3 h-3" />
          <span>+ Adicionar Destaque</span>
        </button>
      </div>

      {/* Grid de Destaques (Cantos Retos) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {features.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-2 p-2 bg-slate-50 border border-slate-200 rounded-none hover:border-slate-400 transition-colors group relative"
          >
            <span className="text-[#003366] font-bold text-xs shrink-0 mt-0.5 select-none" data-printable-policy="protect">■</span>

            <div className="flex-1 min-w-0 pr-4">
              <h4
                data-printable-field={`feature:${item.id}:title`}
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleItemTitleBlur(item.id, e.currentTarget.innerText)}
                className="text-[11px] font-bold text-slate-900 leading-snug outline-none focus:bg-amber-100 rounded-none cursor-text"
              >
                {item.title}
              </h4>
              <p
                data-printable-field={`feature:${item.id}:desc`}
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleItemDescBlur(item.id, e.currentTarget.innerText)}
                className="text-[10px] text-slate-600 leading-normal outline-none focus:bg-amber-50 rounded-none mt-0.5 cursor-text"
              >
                {item.description}
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveFeature(item.id);
              }}
              className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-0.5 no-print"
              data-editor-action="true"
              title="Excluir destaque"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

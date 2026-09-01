import React from 'react';
import { CheckCircle2, Shield, Zap, Award, Plus, Trash2 } from 'lucide-react';
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
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText });
  };

  const handleItemTitleBlur = (id: string, text: string) => {
    const updated = features.map((f) => (f.id === id ? { ...f, title: text } : f));
    updateBlock(pageId, block.id, { features: updated });
  };

  const handleItemDescBlur = (id: string, text: string) => {
    const updated = features.map((f) => (f.id === id ? { ...f, description: text } : f));
    updateBlock(pageId, block.id, { features: updated });
  };

  const handleAddFeature = () => {
    const newItem: FeatureItem = {
      id: `feat-${Date.now()}`,
      title: 'Novo Destaque Técnico',
      description: 'Descrição sucinta do benefício ou especificação diferencial.',
      icon: 'CheckCircle2'
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
      className={`relative p-3.5 rounded-xl border border-slate-200 bg-white shadow-sm transition-all ${
        isSelected ? 'ring-2 ring-brand-500 bg-brand-50/20' : 'hover:ring-1 hover:ring-slate-300'
      }`}
    >
      <h3
        contentEditable
        suppressContentEditableWarning
        onBlur={handleTitleBlur}
        className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2.5 outline-none focus:bg-slate-100 rounded px-1 flex items-center gap-1.5"
      >
        <Award className="w-4 h-4 text-brand-600" />
        <span>{block.title || 'Destaques e Recursos Principais'}</span>
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {features.map((feat, idx) => (
          <div
            key={feat.id}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5 group relative hover:border-slate-300 transition-all text-left"
          >
            <div className="p-1 rounded bg-brand-100 text-brand-700 flex-shrink-0 mt-0.5">
              {idx % 3 === 0 ? (
                <Shield className="w-3.5 h-3.5" />
              ) : idx % 3 === 1 ? (
                <Zap className="w-3.5 h-3.5" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h4
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleItemTitleBlur(feat.id, e.currentTarget.innerText)}
                className="text-[11px] font-bold text-slate-900 outline-none focus:bg-white rounded"
              >
                {feat.title}
              </h4>
              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleItemDescBlur(feat.id, e.currentTarget.innerText)}
                className="text-[10px] text-slate-500 font-normal leading-relaxed outline-none focus:bg-white rounded mt-0.5"
              >
                {feat.description}
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveFeature(feat.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 rounded transition-opacity"
              title="Remover destaque"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex justify-start">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAddFeature();
          }}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-md transition-colors"
        >
          <Plus className="w-3 h-3" />
          <span>Adicionar Destaque</span>
        </button>
      </div>
    </div>
  );
};

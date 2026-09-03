// src/components/editor/inspector/FeaturesListInspector.tsx
// Inspector canônico para o bloco FeaturesList (CORE.E6B).
// Zero inline editing no Canvas, autoridade pura de dados, delete-last permitido gerando [].

import React, { useState } from 'react';
import { Plus, Trash2, Zap } from 'lucide-react';
import { ContentBlock, FeatureItem } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import {
  InspectorSection,
  InspectorField,
  InspectorTextInput,
  InspectorTextArea,
  InspectorActionRow
} from './components';

export interface FeaturesListInspectorProps {
  block: ContentBlock;
  pageId: string;
}

export const FeaturesListInspector: React.FC<FeaturesListInspectorProps> = ({
  block,
  pageId
}) => {
  const updateBlock = useCatalogStore((state) => state.updateBlock);

  const features: FeatureItem[] = Array.isArray(block.features) ? block.features : [];

  // Estado local para item selecionado na UI (não persistido no catálogo)
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(
    features.length > 0 ? features[0].id : null
  );

  const activeFeature = features.find((f) => f.id === selectedFeatureId) || null;

  const handleTitleChange = (title: string) => {
    updateBlock(pageId, block.id, { title });
  };

  const handleAddFeature = () => {
    const newId = crypto.randomUUID();
    const newFeature: FeatureItem = {
      id: newId,
      title: '',
      description: ''
    };
    const updated = [...features, newFeature];
    updateBlock(pageId, block.id, { features: updated });
    setSelectedFeatureId(newId);
  };

  const handleRemoveFeature = (id: string) => {
    const updated = features.filter((f) => f.id !== id);
    updateBlock(pageId, block.id, { features: updated });
    if (selectedFeatureId === id) {
      setSelectedFeatureId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const handleUpdateActiveFeature = (patch: Partial<FeatureItem>) => {
    if (!activeFeature) return;
    const updated = features.map((f) =>
      f.id === activeFeature.id ? { ...f, ...patch } : f
    );
    updateBlock(pageId, block.id, { features: updated });
  };

  return (
    <div className="space-y-4">
      {/* Seção 1: Conteúdo Principal */}
      <InspectorSection id="features-content" title="Conteúdo Principal" defaultOpen={true}>
        <InspectorField label="Título da Seção">
          <InspectorTextInput
            id="features-title-input"
            value={block.title || ''}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Ex: Destaques e Recursos Técnicos"
          />
        </InspectorField>
      </InspectorSection>

      {/* Seção 2: Coleção de Destaques Técnicos */}
      <InspectorSection
        id="features-collection"
        title={`Destaques Técnicos (${features.length})`}
        defaultOpen={true}
      >
        <div className="space-y-3">
          {/* Botão Adicionar */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAddFeature}
              className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>+ Adicionar Destaque</span>
            </button>
          </div>

          {/* Lista Compacta de Itens */}
          {features.length > 0 ? (
            <div className="space-y-1">
              {features.map((item, idx) => {
                const isSelected = item.id === selectedFeatureId;
                const displayTitle = item.title.trim() || `Destaque ${idx + 1} (sem título)`;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedFeatureId(item.id)}
                    className={`flex items-center justify-between p-2 rounded text-xs cursor-pointer border transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-300 font-semibold text-blue-900'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                      <Zap className="w-3 h-3 text-[#003366] shrink-0" />
                      <span className="truncate">{displayTitle}</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFeature(item.id);
                      }}
                      className="text-slate-400 hover:text-red-600 p-1 ml-1 cursor-pointer transition-colors"
                      title="Excluir este destaque"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic p-2 bg-slate-50 border border-slate-200 rounded">
              Nenhum destaque adicionado. O documento não exibirá diferenciais vazios.
            </p>
          )}

          {/* Detalhes do Destaque Selecionado */}
          {activeFeature && (
            <div className="p-3 bg-white border border-slate-300 rounded space-y-2.5 pt-2 mt-2">
              <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block border-b border-slate-200 pb-1">
                Editar Destaque Selecionado
              </span>

              <InspectorField label="Título do Destaque">
                <InspectorTextInput
                  id={`feature-${activeFeature.id}-title`}
                  value={activeFeature.title}
                  onChange={(e) => handleUpdateActiveFeature({ title: e.target.value })}
                  placeholder="Ex: Alta Exatidão"
                />
              </InspectorField>

              <InspectorField label="Descrição Técnica">
                <InspectorTextArea
                  id={`feature-${activeFeature.id}-desc`}
                  value={activeFeature.description || ''}
                  onChange={(e) => handleUpdateActiveFeature({ description: e.target.value })}
                  placeholder="Ex: Exatidão de até 0,01% da faixa com sensor PT-100..."
                  rows={2}
                />
              </InspectorField>

              <InspectorActionRow
                actions={[
                  {
                    label: 'Excluir Destaque',
                    onClick: () => handleRemoveFeature(activeFeature.id),
                    variant: 'danger',
                    title: 'Remove este destaque da lista'
                  }
                ]}
              />
            </div>
          )}
        </div>
      </InspectorSection>
    </div>
  );
};

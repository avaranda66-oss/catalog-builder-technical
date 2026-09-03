// src/components/editor/inspector/SoftwareConnectivityInspector.tsx
// Inspector canônico para o bloco SoftwareConnectivity (CORE.E6B).
// Desacoplado do renderer, gerencia cards de conectividade sem fake technical defaults.

import React, { useState } from 'react';
import { Plus, Trash2, Laptop } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import {
  SoftwareConnectivityItem,
  getSoftwareConnectivityItems,
  buildSoftwareConnectivityItemsPatch
} from '../../../domain/composite-content.engine';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import {
  InspectorSection,
  InspectorField,
  InspectorTextInput,
  InspectorTextArea,
  InspectorActionRow
} from './components';

export interface SoftwareConnectivityInspectorProps {
  block: ContentBlock;
  pageId: string;
}

export const SoftwareConnectivityInspector: React.FC<SoftwareConnectivityInspectorProps> = ({
  block,
  pageId
}) => {
  const updateBlock = useCatalogStore((state) => state.updateBlock);

  const items = getSoftwareConnectivityItems(block);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    items.length > 0 ? 0 : null
  );

  const activeItem = selectedIndex !== null && selectedIndex < items.length
    ? items[selectedIndex]
    : null;

  const handleTitleChange = (title: string) => {
    updateBlock(pageId, block.id, { title });
  };

  const handleBadgeTextChange = (badgeText: string) => {
    updateBlock(pageId, block.id, { badgeText });
  };

  const handleAddItem = () => {
    const newItem: SoftwareConnectivityItem = {
      badge: '',
      title: '',
      desc: ''
    };
    const updated = [...items, newItem];
    updateBlock(pageId, block.id, buildSoftwareConnectivityItemsPatch(block, updated));
    setSelectedIndex(updated.length - 1);
  };

  const handleRemoveItem = (idx: number) => {
    const updated = items.filter((_, i) => i !== idx);
    updateBlock(pageId, block.id, buildSoftwareConnectivityItemsPatch(block, updated));
    if (selectedIndex === idx) {
      setSelectedIndex(updated.length > 0 ? 0 : null);
    } else if (selectedIndex !== null && selectedIndex > idx) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleUpdateActiveItem = (patch: Partial<SoftwareConnectivityItem>) => {
    if (selectedIndex === null || !activeItem) return;
    const updated = items.map((it, i) =>
      i === selectedIndex ? { ...it, ...patch } : it
    );
    updateBlock(pageId, block.id, buildSoftwareConnectivityItemsPatch(block, updated));
  };

  return (
    <div className="space-y-4">
      {/* Seção 1: Conteúdo Principal */}
      <InspectorSection id="software-content" title="Conteúdo Principal" defaultOpen={true}>
        <InspectorField label="Título da Seção">
          <InspectorTextInput
            id="software-title-input"
            value={block.title || ''}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Ex: SOFTWARE DE CALIBRAÇÃO & CONECTIVIDADE"
          />
        </InspectorField>

        <InspectorField label="Selo / Badge Superior">
          <InspectorTextInput
            id="software-badge-input"
            value={block.badgeText || ''}
            onChange={(e) => handleBadgeTextChange(e.target.value)}
            placeholder="Ex: Indústria 4.0"
          />
        </InspectorField>
      </InspectorSection>

      {/* Seção 2: Cards de Conectividade */}
      <InspectorSection
        id="software-collection"
        title={`Recursos de Conectividade (${items.length})`}
        defaultOpen={true}
      >
        <div className="space-y-3">
          {/* Botão Adicionar Item */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAddItem}
              className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>+ Adicionar Recurso</span>
            </button>
          </div>

          {/* Lista Compacta de Recursos */}
          {items.length > 0 ? (
            <div className="space-y-1">
              {items.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const displayTitle = item.title.trim() || `Recurso ${idx + 1} (sem título)`;

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between p-2 rounded text-xs cursor-pointer border transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-300 font-semibold text-blue-900'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                      <Laptop className="w-3.5 h-3.5 text-[#003366] shrink-0" />
                      <span className="truncate">{displayTitle}</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveItem(idx);
                      }}
                      className="text-slate-400 hover:text-red-600 p-1 ml-1 cursor-pointer transition-colors"
                      title="Excluir este recurso"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic p-2 bg-slate-50 border border-slate-200 rounded">
              Nenhum recurso configurado. O documento não exibirá dados técnicos falsos.
            </p>
          )}

          {/* Detalhes do Recurso Selecionado */}
          {activeItem && selectedIndex !== null && (
            <div className="p-3 bg-white border border-slate-300 rounded space-y-2.5 pt-2 mt-2">
              <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block border-b border-slate-200 pb-1">
                Editar Recurso Selecionado
              </span>

              <InspectorField label="Tag / Badge do Recurso">
                <InspectorTextInput
                  id={`software-item-${selectedIndex}-badge`}
                  value={activeItem.badge || ''}
                  onChange={(e) => handleUpdateActiveItem({ badge: e.target.value })}
                  placeholder="Ex: Protocolos, Software, Hardware..."
                />
              </InspectorField>

              <InspectorField label="Título do Recurso">
                <InspectorTextInput
                  id={`software-item-${selectedIndex}-title`}
                  value={activeItem.title}
                  onChange={(e) => handleUpdateActiveItem({ title: e.target.value })}
                  placeholder="Ex: Comunicação HART & Modbus"
                />
              </InspectorField>

              <InspectorField label="Descrição Técnica">
                <InspectorTextArea
                  id={`software-item-${selectedIndex}-desc`}
                  value={activeItem.desc}
                  onChange={(e) => handleUpdateActiveItem({ desc: e.target.value })}
                  placeholder="Ex: Configuração de transmissores inteligentes..."
                  rows={2}
                />
              </InspectorField>

              <InspectorActionRow
                actions={[
                  {
                    label: 'Excluir Recurso',
                    onClick: () => handleRemoveItem(selectedIndex),
                    variant: 'danger',
                    title: 'Remove este recurso da lista'
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

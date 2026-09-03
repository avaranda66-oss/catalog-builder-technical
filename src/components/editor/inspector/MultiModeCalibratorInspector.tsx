// src/components/editor/inspector/MultiModeCalibratorInspector.tsx
// Inspector canônico para o bloco MultiModeCalibrator (CORE.E6B).
// Desacoplado do renderer, gerencia modos com IDs estáveis e gravação estrita em desc.

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import {
  CalibratorModeItem,
  getMultiModeItems,
  buildMultiModeItemsPatch
} from '../../../domain/composite-content.engine';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import {
  InspectorSection,
  InspectorField,
  InspectorTextInput,
  InspectorTextArea,
  InspectorActionRow
} from './components';

export interface MultiModeCalibratorInspectorProps {
  block: ContentBlock;
  pageId: string;
}

export const MultiModeCalibratorInspector: React.FC<MultiModeCalibratorInspectorProps> = ({
  block,
  pageId
}) => {
  const updateBlock = useCatalogStore((state) => state.updateBlock);

  const modes = getMultiModeItems(block);

  const [selectedModeId, setSelectedModeId] = useState<string | null>(
    modes.length > 0 ? modes[0].id : null
  );

  const activeMode = modes.find((m) => m.id === selectedModeId) || null;

  const handleTitleChange = (title: string) => {
    updateBlock(pageId, block.id, { title });
  };

  const handleBadgeTextChange = (badgeText: string) => {
    updateBlock(pageId, block.id, { badgeText });
  };

  const handleAddMode = () => {
    const newId = crypto.randomUUID();
    const newSeqBadge = String(modes.length + 1).padStart(2, '0');
    const newMode: CalibratorModeItem = {
      id: newId,
      badge: newSeqBadge,
      title: '',
      desc: ''
    };
    const updated = [...modes, newMode];
    updateBlock(pageId, block.id, buildMultiModeItemsPatch(block, updated));
    setSelectedModeId(newId);
  };

  const handleRemoveMode = (id: string) => {
    const updated = modes.filter((m) => m.id !== id);
    updateBlock(pageId, block.id, buildMultiModeItemsPatch(block, updated));
    if (selectedModeId === id) {
      setSelectedModeId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const handleUpdateActiveMode = (patch: Partial<CalibratorModeItem>) => {
    if (!activeMode) return;
    const updated = modes.map((m) =>
      m.id === activeMode.id ? { ...m, ...patch } : m
    );
    updateBlock(pageId, block.id, buildMultiModeItemsPatch(block, updated));
  };

  return (
    <div className="space-y-4">
      {/* Seção 1: Conteúdo Principal */}
      <InspectorSection id="multimode-content" title="Conteúdo Principal" defaultOpen={true}>
        <InspectorField label="Título do Bloco">
          <InspectorTextInput
            id="multimode-title-input"
            value={block.title || ''}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Ex: SISTEMA MULTIFUNÇÃO DE CALIBRAÇÃO"
          />
        </InspectorField>

        <InspectorField label="Selo / Badge Superior">
          <InspectorTextInput
            id="multimode-badge-input"
            value={block.badgeText || ''}
            onChange={(e) => handleBadgeTextChange(e.target.value)}
            placeholder="Ex: Multifunctional Series"
          />
        </InspectorField>
      </InspectorSection>

      {/* Seção 2: Modos de Calibração */}
      <InspectorSection
        id="multimode-collection"
        title={`Modos de Calibração (${modes.length})`}
        defaultOpen={true}
      >
        <div className="space-y-3">
          {/* Botão Adicionar Modo */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAddMode}
              className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>+ Adicionar Modo</span>
            </button>
          </div>

          {/* Lista Compacta de Modos */}
          {modes.length > 0 ? (
            <div className="space-y-1">
              {modes.map((mode, idx) => {
                const isSelected = mode.id === selectedModeId;
                const displayTitle = mode.title.trim() || `Modo ${idx + 1} (sem título)`;

                return (
                  <div
                    key={mode.id}
                    onClick={() => setSelectedModeId(mode.id)}
                    className={`flex items-center justify-between p-2 rounded text-xs cursor-pointer border transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-300 font-semibold text-blue-900'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                      <span className="w-5 h-4 bg-[#003366] text-white text-[9px] font-mono font-bold flex items-center justify-center shrink-0">
                        {mode.badge || String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="truncate">{displayTitle}</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveMode(mode.id);
                      }}
                      className="text-slate-400 hover:text-red-600 p-1 ml-1 cursor-pointer transition-colors"
                      title="Excluir este modo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic p-2 bg-slate-50 border border-slate-200 rounded">
              Nenhum modo configurado. O documento não exibirá modos demonstrativos falsos.
            </p>
          )}

          {/* Detalhes do Modo Selecionado */}
          {activeMode && (
            <div className="p-3 bg-white border border-slate-300 rounded space-y-2.5 pt-2 mt-2">
              <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block border-b border-slate-200 pb-1">
                Editar Modo Selecionado
              </span>

              <InspectorField label="Código / Badge Numérica">
                <InspectorTextInput
                  id={`mode-${activeMode.id}-badge`}
                  value={activeMode.badge}
                  onChange={(e) => handleUpdateActiveMode({ badge: e.target.value })}
                  placeholder="Ex: 01, 02, DB..."
                />
              </InspectorField>

              <InspectorField label="Título do Modo">
                <InspectorTextInput
                  id={`mode-${activeMode.id}-title`}
                  value={activeMode.title}
                  onChange={(e) => handleUpdateActiveMode({ title: e.target.value })}
                  placeholder="Ex: Bloco Seco (Dry Block)"
                />
              </InspectorField>

              <InspectorField label="Descrição da Aplicação">
                <InspectorTextArea
                  id={`mode-${activeMode.id}-desc`}
                  value={activeMode.desc}
                  onChange={(e) => handleUpdateActiveMode({ desc: e.target.value })}
                  placeholder="Ex: Calibração rápida de sensores retos..."
                  rows={2}
                />
              </InspectorField>

              <InspectorActionRow
                actions={[
                  {
                    label: 'Excluir Modo',
                    onClick: () => handleRemoveMode(activeMode.id),
                    variant: 'danger',
                    title: 'Remove este modo da coleção'
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

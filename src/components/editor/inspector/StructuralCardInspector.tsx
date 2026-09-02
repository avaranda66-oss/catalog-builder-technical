// src/components/editor/inspector/StructuralCardInspector.tsx
// Inspector Contextual do Card Filho (Fase 3A.2)
// Permite editar Título, Corpo, Badge e Ênfase Técnica com garantia de mutação imutável por child.id.

import React, { useState } from 'react';
import {
  ArrowLeft,
  FileEdit,
  Sparkles,
  Trash2
} from 'lucide-react';
import { ContentBlock } from '@/domain/catalog.schema';
import { updateStructuralChildById } from '@/domain/canvas-layout.engine';
import { useCatalogStore } from '@/stores/useCatalogStore';
import { CorporateIcon, CorporateIconPicker, getCorporateIcon } from '@/components/icons';
import { InspectorGroup } from './components/InspectorGroup';
import { InspectorField } from './components/InspectorField';
import { InspectorTextInput } from './components/InspectorTextInput';
import { InspectorTextArea } from './components/InspectorTextArea';
import { InspectorSegmentedControl } from './components/InspectorSegmentedControl';

interface StructuralCardInspectorProps {
  sectionBlock: ContentBlock;
  pageId: string;
  cardId: string;
  onBackToSection: () => void;
}

export const StructuralCardInspector: React.FC<StructuralCardInspectorProps> = ({
  sectionBlock,
  pageId,
  cardId,
  onBackToSection
}) => {
  const updateBlock = useCatalogStore((state) => state.updateBlock);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const rawStructuralData = sectionBlock.structuralData;
  const card = rawStructuralData?.children?.find((c) => c.id === cardId);

  // Stale child self-healing: se o card não for encontrado, retorna para a seção
  if (!rawStructuralData || !card) {
    onBackToSection();
    return null;
  }

  // Helper de mutação imutável por childId
  const handleCardUpdate = (patch: {
    title?: string;
    body?: string;
    badge?: string;
    iconId?: string;
    emphasis?: 'normal' | 'highlight' | 'informative' | 'technical';
  }) => {
    const { data, found } = updateStructuralChildById(rawStructuralData, cardId, patch);
    if (found) {
      updateBlock(pageId, sectionBlock.id, { structuralData: data });
    }
  };

  const handleSelectIcon = (iconId: string) => {
    handleCardUpdate({ iconId });
  };

  const handleClearIcon = () => {
    const child = rawStructuralData?.children?.find((c) => c.id === cardId);
    if (!child) return;
    const { iconId: _removed, ...clearedChild } = child;
    const newChildren = rawStructuralData.children.map((c) =>
      c.id === cardId ? clearedChild : c
    );
    updateBlock(pageId, sectionBlock.id, {
      structuralData: {
        ...rawStructuralData,
        children: newChildren
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Botão de retorno e Breadcrumb de Contexto */}
      <div className="pb-2 border-b border-slate-200">
        <button
          type="button"
          onClick={onBackToSection}
          className="flex items-center gap-1 text-xs font-semibold text-[#003366] hover:text-blue-900 transition-colors cursor-pointer py-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Voltar para Seção</span>
        </button>
        <div className="mt-1">
          <div className="text-[10px] font-mono text-slate-500 uppercase">
            Seção: {sectionBlock.title || 'Seção Estrutural'}
          </div>
          <div className="text-xs font-bold text-slate-900 truncate">
            Card: {card.title || 'Sem título'}
          </div>
        </div>
      </div>

      {/* 1. GRUPO CONTEÚDO DO CARD */}
      <InspectorGroup
        title="Conteúdo do Card"
        icon={<FileEdit className="w-3.5 h-3.5" />}
        description="Textos Técnicos"
      >
        <InspectorField label="Título do Card">
          <InspectorTextInput
            value={card.title || ''}
            onChange={(e) => handleCardUpdate({ title: e.target.value })}
            placeholder="Ex: Comunicação Ethernet"
          />
        </InspectorField>

        <InspectorField label="Descrição Técnica (Corpo)">
          <InspectorTextArea
            rows={3}
            value={card.body || ''}
            onChange={(e) => handleCardUpdate({ body: e.target.value })}
            placeholder="Ex: Suporte a protocolos Modbus TCP/IP para integração com SCADA."
          />
        </InspectorField>

        <InspectorField label="Badge do Card">
          <InspectorTextInput
            value={card.badge || ''}
            onChange={(e) => handleCardUpdate({ badge: e.target.value })}
            placeholder="Ex: OPCIONAL"
          />
        </InspectorField>
      </InspectorGroup>

      {/* 2. GRUPO ÊNFASE SEMÂNTICA */}
      <InspectorGroup
        title="Ênfase Visual"
        icon={<Sparkles className="w-3.5 h-3.5" />}
        description="Variante do Card"
      >
        <InspectorField label="Estilo de Destaque">
          <InspectorSegmentedControl
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'highlight', label: 'Destaque' },
              { value: 'informative', label: 'Informativo' },
              { value: 'technical', label: 'Técnico' }
            ]}
            value={card.emphasis || 'normal'}
            onChange={(val) => handleCardUpdate({ emphasis: val })}
          />
        </InspectorField>
      </InspectorGroup>

      {/* 3. GRUPO ÍCONE DO CARD */}
      <InspectorGroup
        title="Ícone do Card"
        icon={<Sparkles className="w-3.5 h-3.5" />}
        description="Símbolo Semântico"
      >
        <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex items-center gap-2 min-w-0">
            {card.iconId ? (
              <>
                <div className="w-7 h-7 rounded-md bg-blue-50 border border-blue-200 flex items-center justify-center text-[#003366] shrink-0">
                  <CorporateIcon iconId={card.iconId} size="sm" />
                </div>
                <div className="truncate">
                  <span className="text-xs font-semibold text-slate-800 block truncate">
                    {getCorporateIcon(card.iconId)?.label || card.iconId}
                  </span>
                  <span className="text-[9px] font-mono text-slate-400 block truncate">
                    {card.iconId}
                  </span>
                </div>
              </>
            ) : (
              <span className="text-xs text-slate-400 italic">Nenhum ícone selecionado</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsPickerOpen(true)}
              className="px-2.5 py-1 text-xs font-semibold text-[#003366] hover:bg-blue-50 border border-blue-300 rounded-md transition-all cursor-pointer"
            >
              {card.iconId ? 'Alterar' : 'Selecionar'}
            </button>
            {card.iconId && (
              <button
                type="button"
                onClick={handleClearIcon}
                title="Remover ícone do card"
                aria-label="Remover ícone do card"
                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </InspectorGroup>

      <CorporateIconPicker
        isOpen={isPickerOpen}
        currentIconId={card.iconId}
        onSelect={handleSelectIcon}
        onClear={handleClearIcon}
        onClose={() => setIsPickerOpen(false)}
        title="Ícone do Card Estrutural"
      />
    </div>
  );
};

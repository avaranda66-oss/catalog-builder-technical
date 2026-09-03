// src/components/editor/inspector/StructuralCardInspector.tsx
// Inspector Contextual do Card Filho (Fase 3A.2 / Primitives CORE.E3 / E3.1 UX & Hardening).
// Permite editar Título, Corpo, Badge, Ênfase Técnica e Ícone Semântico com garantia de mutação imutável por child.id.

import React, { useState } from 'react';
import {
  ArrowLeft,
  FileEdit,
  Sparkles,
  Trash2,
  Copy,
  X
} from 'lucide-react';
import { ContentBlock } from '@/domain/catalog.schema';
import { updateStructuralChildById } from '@/domain/canvas-layout.engine';
import { useCatalogStore } from '@/stores/useCatalogStore';
import { CorporateIcon, CorporateIconPicker, getCorporateIcon } from '@/components/icons';
import {
  InspectorSection,
  InspectorField,
  InspectorTextInput,
  InspectorTextArea,
  InspectorSegmentedControl
} from './components';

export interface StructuralCardInspectorProps {
  sectionBlock: ContentBlock;
  pageId: string;
  cardId: string;
  onBackToSection: () => void;
  defaultOpenSections?: {
    content?: boolean;
    emphasis?: boolean;
    icon?: boolean;
  };
}

export const StructuralCardInspector: React.FC<StructuralCardInspectorProps> = ({
  sectionBlock,
  pageId,
  cardId,
  onBackToSection,
  defaultOpenSections
}) => {
  const updateBlock = useCatalogStore((state) => state.updateBlock);
  const duplicateStructuralChild = useCatalogStore((state) => state.duplicateStructuralChild);
  const removeStructuralChild = useCatalogStore((state) => state.removeStructuralChild);

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rawStructuralData = sectionBlock.structuralData;
  const card = rawStructuralData?.children?.find((c) => c.id === cardId);

  // Defensivo sem side-effect durante render: se o card não for encontrado, retorna null
  if (!rawStructuralData || !card) {
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
    handleCardUpdate({ iconId: undefined });
  };

  return (
    <div className="space-y-3">
      {/* Botão de retorno e Breadcrumb de Contexto com Ações do Card */}
      <div className="pb-2 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToSection}
            className="flex items-center gap-1 text-xs font-semibold text-[#003366] hover:text-blue-900 transition-colors cursor-pointer py-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar para Seção</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => duplicateStructuralChild(pageId, sectionBlock.id, card.id)}
              title="Duplicar este card"
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded transition-all cursor-pointer"
            >
              <Copy className="w-3 h-3" />
              <span>Duplicar</span>
            </button>

            {confirmDelete ? (
              <div className="flex items-center gap-0.5 bg-rose-50 p-0.5 rounded border border-rose-200">
                <button
                  type="button"
                  onClick={() => {
                    removeStructuralChild(pageId, sectionBlock.id, card.id);
                  }}
                  title="Confirmar exclusão"
                  className="px-1.5 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100 rounded cursor-pointer"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  title="Cancelar"
                  className="p-0.5 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                title="Excluir este card"
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded transition-all cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Excluir</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-1">
          <div className="text-[10px] font-mono text-slate-500 uppercase">
            Seção: {sectionBlock.title || 'Seção Estrutural'}
          </div>
          <div className="text-xs font-bold text-slate-900 truncate">
            Card: {card.title || 'Sem título'}
          </div>
        </div>
      </div>

      {/* 1. SEÇÃO CONTEÚDO DO CARD (defaultOpen = true) */}
      <InspectorSection
        id="inspector-card-section-content"
        title="Conteúdo do Card"
        icon={<FileEdit className="w-3.5 h-3.5" />}
        description="Textos Técnicos"
        defaultOpen={defaultOpenSections?.content ?? true}
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
      </InspectorSection>

      {/* 2. SEÇÃO ÊNFASE VISUAL (defaultOpen = false) */}
      <InspectorSection
        id="inspector-card-section-emphasis"
        title="Ênfase Visual"
        icon={<Sparkles className="w-3.5 h-3.5" />}
        description="Variante do Card"
        defaultOpen={defaultOpenSections?.emphasis ?? false}
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
      </InspectorSection>

      {/* 3. SEÇÃO ÍCONE DO CARD (defaultOpen = false) */}
      <InspectorSection
        id="inspector-card-section-icon"
        title="Ícone do Card"
        icon={<Sparkles className="w-3.5 h-3.5" />}
        description="Símbolo Semântico"
        defaultOpen={defaultOpenSections?.icon ?? false}
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
      </InspectorSection>

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

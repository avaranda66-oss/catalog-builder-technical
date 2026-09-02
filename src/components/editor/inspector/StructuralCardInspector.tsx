// src/components/editor/inspector/StructuralCardInspector.tsx
// Inspector Contextual do Card Filho (Fase 3A.2)
// Permite editar Título, Corpo, Badge e Ênfase Técnica com garantia de mutação imutável por child.id.

import React from 'react';
import {
  ArrowLeft,
  FileEdit,
  Sparkles,
  Info
} from 'lucide-react';
import { ContentBlock } from '@/domain/catalog.schema';
import { updateStructuralChildById } from '@/domain/canvas-layout.engine';
import { useCatalogStore } from '@/stores/useCatalogStore';
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
    emphasis?: 'normal' | 'highlight' | 'informative' | 'technical';
  }) => {
    const { data, found } = updateStructuralChildById(rawStructuralData, cardId, patch);
    if (found) {
      updateBlock(pageId, sectionBlock.id, { structuralData: data });
    }
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

      {/* 3. GRUPO ÍCONE DO CARD (READ-ONLY CORPORATIVO) */}
      <div className="p-2.5 bg-slate-100/70 border border-slate-200 rounded-lg flex items-start gap-2">
        <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <div className="text-[10px] text-slate-600 leading-snug">
          <span className="font-bold text-slate-700 block">Ícone do Card</span>
          Será configurado na Biblioteca de Ícones Corporativa (Fase 3A.3).
        </div>
      </div>
    </div>
  );
};

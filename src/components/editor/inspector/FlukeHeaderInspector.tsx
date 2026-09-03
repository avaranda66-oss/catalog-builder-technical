// src/components/editor/inspector/FlukeHeaderInspector.tsx
// Inspector canônico para o bloco fluke_header (Header Metrológico Industrial).
// Construído com as Primitives CORE.E3 e integrado à Primary Image Engine.

import React from 'react';
import { Sparkles, Image as ImageIcon, Palette } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import {
  InspectorSection,
  InspectorField,
  InspectorTextInput,
  InspectorTextArea,
  InspectorColorInput
} from './components';
import { InspectorStringListEditor } from './content/InspectorStringListEditor';
import { PrimaryImageSourceControl } from './media/PrimaryImageSourceControl';
import { PrimaryImagePatch } from '../../../domain/primary-image.engine';

export interface FlukeHeaderInspectorProps {
  block: ContentBlock;
  pageId: string;
}

export const FlukeHeaderInspector: React.FC<FlukeHeaderInspectorProps> = ({
  block,
  pageId
}) => {
  const updateBlock = useCatalogStore((state) => state.updateBlock);
  const custom = block.customData || {};

  const handleFieldChange = (field: string, value: unknown) => {
    updateBlock(pageId, block.id, { [field]: value });
  };

  const handleCustomFieldChange = (field: string, value: unknown) => {
    updateBlock(pageId, block.id, {
      customData: {
        ...(block.customData || {}),
        [field]: value
      }
    });
  };

  const handleMediaPatch = (patch: PrimaryImagePatch) => {
    updateBlock(pageId, block.id, patch);
  };

  const highlights = Array.isArray(custom.highlights) ? custom.highlights : [];

  return (
    <div className="space-y-4">
      {/* 1. SEÇÃO CONTEÚDO */}
      <InspectorSection
        id="fluke-inspector-content"
        title="Conteúdo Técnico"
        icon={<Sparkles className="w-4 h-4 text-amber-500" />}
        defaultOpen={true}
      >
        <div className="space-y-3">
          <InspectorField
            htmlFor="fluke-field-badge-text"
            label="Texto Principal do Badge"
            description="Ex: PRESYS, Calibration, Metrologia"
          >
            <InspectorTextInput
              id="fluke-field-badge-text"
              value={block.badgeText || ''}
              placeholder="PRESYS"
              onChange={(e) => handleFieldChange('badgeText', e.target.value)}
            />
          </InspectorField>

          <InspectorField
            htmlFor="fluke-field-badge-secondary"
            label="Texto Secundário do Badge"
            description="Complemento ou certificação do badge"
          >
            <InspectorTextInput
              id="fluke-field-badge-secondary"
              value={typeof custom.badgeSecondary === 'string' ? custom.badgeSecondary : ''}
              placeholder="Calibration"
              onChange={(e) => handleCustomFieldChange('badgeSecondary', e.target.value)}
            />
          </InspectorField>

          <InspectorField
            htmlFor="fluke-field-title"
            label="Título Principal"
            description="Nome do instrumento ou série do equipamento"
          >
            <InspectorTextInput
              id="fluke-field-title"
              value={block.title || ''}
              placeholder="Field Metrology Wells / Presys Série T"
              onChange={(e) => handleFieldChange('title', e.target.value)}
            />
          </InspectorField>

          <InspectorField
            htmlFor="fluke-field-subtitle"
            label="Subtítulo"
            description="Descrição da linha de produtos ou categoria metrológica"
          >
            <InspectorTextInput
              id="fluke-field-subtitle"
              value={block.subtitle || ''}
              placeholder="Especificações Técnicas e Dados Metrológicos"
              onChange={(e) => handleFieldChange('subtitle', e.target.value)}
            />
          </InspectorField>

          <InspectorField
            htmlFor="fluke-field-description"
            label="Descrição Técnica"
            description="Resumo do instrumento exibido abaixo da imagem"
          >
            <InspectorTextArea
              id="fluke-field-description"
              value={typeof custom.description === 'string' ? custom.description : ''}
              placeholder="Descreva a aplicação, portabilidade e faixas de operação..."
              rows={3}
              onChange={(e) => handleCustomFieldChange('description', e.target.value)}
            />
          </InspectorField>

          <div className="pt-2 border-t border-slate-200">
            <InspectorStringListEditor
              idPrefix="fluke-highlight"
              title="Destaques Metrológicos"
              items={highlights}
              addButtonLabel="+ Destaque"
              emptyLabel="Nenhum destaque metrológico cadastrado."
              placeholder="Ex: Resfria até -25 °C e aquece até 660 °C"
              onChange={(newHighlights) => handleCustomFieldChange('highlights', newHighlights)}
            />
          </div>
        </div>
      </InspectorSection>

      {/* 2. SEÇÃO MÍDIA */}
      <InspectorSection
        id="fluke-inspector-media"
        title="Fotografia do Equipamento"
        icon={<ImageIcon className="w-4 h-4 text-blue-500" />}
        defaultOpen={false}
      >
        <PrimaryImageSourceControl
          block={block}
          onPatch={handleMediaPatch}
          uploadRole="front"
          uploadCaption={block.title || 'Foto do Instrumento'}
          urlInputId="fluke-field-image-url"
        />
      </InspectorSection>

      {/* 3. SEÇÃO APARÊNCIA */}
      <InspectorSection
        id="fluke-inspector-appearance"
        title="Aparência & Cores"
        icon={<Palette className="w-4 h-4 text-purple-500" />}
        defaultOpen={false}
      >
        <InspectorField
          htmlFor="fluke-field-badge-bg"
          label="Cor de Fundo do Badge"
          description="Cor personalizada em formato #RRGGBB"
        >
          <InspectorColorInput
            id="fluke-field-badge-bg"
            value={typeof custom.badgeBg === 'string' ? custom.badgeBg : '#003366'}
            onChange={(hex) => handleCustomFieldChange('badgeBg', hex)}
          />
        </InspectorField>
      </InspectorSection>
    </div>
  );
};

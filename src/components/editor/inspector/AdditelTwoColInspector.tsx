// src/components/editor/inspector/AdditelTwoColInspector.tsx
// Inspector canônico para o bloco additel_two_col_hero (Header Dual-Column Presys).
// Construído com as Primitives CORE.E3 e integrado à Primary Image Engine.

import React from 'react';
import { LayoutTemplate, Image as ImageIcon, Palette } from 'lucide-react';
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

export interface AdditelTwoColInspectorProps {
  block: ContentBlock;
  pageId: string;
}

export const AdditelTwoColInspector: React.FC<AdditelTwoColInspectorProps> = ({
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

  // Leitura com fallback retrocompatível para customData.bulletList legacy
  const bullets = Array.isArray(custom.bullets)
    ? custom.bullets
    : Array.isArray(custom.bulletList)
    ? custom.bulletList
    : [];

  // Novas escritas sempre vão para customData.bullets canônico
  const handleBulletsChange = (newBullets: string[]) => {
    updateBlock(pageId, block.id, {
      customData: {
        ...(block.customData || {}),
        bullets: newBullets
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* 1. SEÇÃO CONTEÚDO */}
      <InspectorSection
        id="additel-inspector-content"
        title="Conteúdo Dual-Column"
        icon={<LayoutTemplate className="w-4 h-4 text-blue-600" />}
        defaultOpen={true}
      >
        <div className="space-y-3">
          <InspectorField
            htmlFor="additel-field-badge-text"
            label="Selo / Marca Superior"
            description="Ex: PRESYS, PRESYS Metrology"
          >
            <InspectorTextInput
              id="additel-field-badge-text"
              value={block.badgeText || ''}
              placeholder="PRESYS"
              onChange={(e) => handleFieldChange('badgeText', e.target.value)}
            />
          </InspectorField>

          <InspectorField
            htmlFor="additel-field-badge-subtitle"
            label="Slogan do Selo"
            description="Complemento exibido abaixo do selo"
          >
            <InspectorTextInput
              id="additel-field-badge-subtitle"
              value={typeof custom.badgeSubtitle === 'string' ? custom.badgeSubtitle : ''}
              placeholder="Precision Metrology"
              onChange={(e) => handleCustomFieldChange('badgeSubtitle', e.target.value)}
            />
          </InspectorField>

          <InspectorField
            htmlFor="additel-field-title"
            label="Título Principal"
            description="Nome do instrumento ou calibrador"
          >
            <InspectorTextInput
              id="additel-field-title"
              value={block.title || ''}
              placeholder="Série Presys PCON-Y18"
              onChange={(e) => handleFieldChange('title', e.target.value)}
            />
          </InspectorField>

          <InspectorField
            htmlFor="additel-field-subtitle"
            label="Subtítulo"
            description="Definição funcional do instrumento"
          >
            <InspectorTextInput
              id="additel-field-subtitle"
              value={block.subtitle || ''}
              placeholder="Calibrador Automático de Pressão"
              onChange={(e) => handleFieldChange('subtitle', e.target.value)}
            />
          </InspectorField>

          <InspectorField
            htmlFor="additel-field-overview"
            label="Visão Geral / Overview"
            description="Texto descritivo posicionado abaixo da fotografia"
          >
            <InspectorTextArea
              id="additel-field-overview"
              value={typeof custom.overview === 'string' ? custom.overview : ''}
              placeholder="Descreva as funções principais do calibrador..."
              rows={3}
              onChange={(e) => handleCustomFieldChange('overview', e.target.value)}
            />
          </InspectorField>

          <div className="pt-2 border-t border-slate-200">
            <InspectorStringListEditor
              idPrefix="additel-bullet"
              title="Recursos Técnicos de Destaque"
              items={bullets}
              addButtonLabel="+ Recurso"
              emptyLabel="Nenhum recurso técnico cadastrado."
              placeholder="Ex: Geração de pressão até 100 bar"
              onChange={handleBulletsChange}
            />
          </div>
        </div>
      </InspectorSection>

      {/* 2. SEÇÃO MÍDIA */}
      <InspectorSection
        id="additel-inspector-media"
        title="Fotografia do Produto"
        icon={<ImageIcon className="w-4 h-4 text-blue-500" />}
        defaultOpen={false}
      >
        <PrimaryImageSourceControl
          block={block}
          onPatch={handleMediaPatch}
          uploadRole="hero"
          uploadCaption={block.title || 'Foto de Apresentação'}
          urlInputId="additel-field-image-url"
        />
      </InspectorSection>

      {/* 3. SEÇÃO APARÊNCIA */}
      <InspectorSection
        id="additel-inspector-appearance"
        title="Aparência & Cores"
        icon={<Palette className="w-4 h-4 text-purple-500" />}
        defaultOpen={false}
      >
        <InspectorField
          htmlFor="additel-field-theme-color"
          label="Cor Temática de Destaque"
          description="Cor personalizada do selo lateral (#RRGGBB)"
        >
          <InspectorColorInput
            id="additel-field-theme-color"
            value={typeof custom.themeColor === 'string' ? custom.themeColor : '#003366'}
            onChange={(hex) => handleCustomFieldChange('themeColor', hex)}
          />
        </InspectorField>
      </InspectorSection>
    </div>
  );
};

// src/components/editor/inspector/HeroBannerInspector.tsx
// Inspector Canônico do Bloco Hero Banner Corporativo (CORE.E5B).
// Baseado estritamente nas capabilities validadas do ElementCapabilityRegistry:
// CONTENT_BADGE, CONTENT_TITLE, CONTENT_SUBTITLE, MEDIA_PRIMARY_ASSET, MEDIA_CAPTION, APPEARANCE_GRADIENT.
// Zero controles aspiracionais (sem dimensões, crop, alinhamento ou opacidade não declaradas).

import React from 'react';
import { Type, Image as ImageIcon, Palette, AlertCircle } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { PrimaryImagePatch } from '../../../domain/primary-image.engine';
import {
  HERO_PALETTES,
  HeroPaletteId,
  resolveHeroPaletteId,
  setHeroPalette
} from '../../../domain/hero-banner.appearance';
import { PrimaryImageSourceControl } from './media/PrimaryImageSourceControl';
import {
  InspectorSection,
  InspectorField,
  InspectorTextInput,
  InspectorTextArea
} from './components';

export interface HeroBannerInspectorProps {
  block: ContentBlock;
  pageId: string;
}

export const HeroBannerInspector: React.FC<HeroBannerInspectorProps> = ({ block, pageId }) => {
  const updateBlock = useCatalogStore((state) => state.updateBlock);

  const handleMediaPatch = (patch: PrimaryImagePatch) => {
    updateBlock(pageId, block.id, patch);
  };

  const handlePaletteSelect = (paletteId: HeroPaletteId) => {
    const patch = setHeroPalette(block, paletteId);
    updateBlock(pageId, block.id, patch);
  };

  const activePaletteId = resolveHeroPaletteId(block);

  return (
    <div className="space-y-3">
      {/* 1. SEÇÃO CONTEÚDO (Default OPEN) */}
      <InspectorSection
        id="inspector-hero-section-content"
        title="Conteúdo do Hero"
        icon={<Type className="w-3.5 h-3.5" />}
        description="Identificação, títulos e descritivo técnico"
        defaultOpen={true}
      >
        <div className="space-y-3">
          <InspectorField
            label="Selo / Badge Superior"
            description="Identificador corporativo ou linha do produto"
          >
            <InspectorTextInput
              id="hero-field-badge"
              value={block.badgeText || ''}
              onChange={(e) => updateBlock(pageId, block.id, { badgeText: e.target.value })}
              placeholder="Ex: PRESYS — INSTRUMENTAÇÃO DE PRECISÃO"
            />
          </InspectorField>

          <InspectorField
            label="Título Principal"
            description="Nome do produto ou solução em destaque"
          >
            <InspectorTextInput
              id="hero-field-title"
              value={block.title || ''}
              onChange={(e) => updateBlock(pageId, block.id, { title: e.target.value })}
              placeholder="Ex: Presys PCON-Y18 / Série T"
            />
          </InspectorField>

          <InspectorField
            label="Subtítulo / Descritivo"
            description="Resumo dos diferenciais técnicos e faixa de operação"
          >
            <InspectorTextArea
              id="hero-field-subtitle"
              rows={3}
              value={block.subtitle || ''}
              onChange={(e) => updateBlock(pageId, block.id, { subtitle: e.target.value })}
              placeholder="Ex: Faixas de pressão configuráveis até 300 bar..."
            />
          </InspectorField>
        </div>
      </InspectorSection>

      {/* 2. SEÇÃO MÍDIA (Default CLOSED) */}
      <InspectorSection
        id="inspector-hero-section-media"
        title="Mídia do Hero"
        icon={<ImageIcon className="w-3.5 h-3.5" />}
        description="Fotografia de destaque e legenda técnica"
        defaultOpen={false}
      >
        <div className="space-y-3">
          <PrimaryImageSourceControl
            block={block}
            onPatch={handleMediaPatch}
            uploadRole="hero"
            isPrimary={true}
            uploadCaption={block.title || 'Foto de Destaque'}
            urlInputId="hero-field-image-url"
          />

          <InspectorField
            label="Legenda da Fotografia"
            description="Exibida abaixo da imagem no editor e no documento exportado"
          >
            <InspectorTextInput
              id="hero-field-caption"
              value={block.imageCaption || ''}
              onChange={(e) => updateBlock(pageId, block.id, { imageCaption: e.target.value })}
              placeholder="Ex: Estação portátil em gabinete industrial"
            />
          </InspectorField>
        </div>
      </InspectorSection>

      {/* 3. SEÇÃO APARÊNCIA (Default CLOSED) */}
      <InspectorSection
        id="inspector-hero-section-appearance"
        title="Aparência Visual"
        icon={<Palette className="w-3.5 h-3.5" />}
        description="Paleta cromática corporativa e gradiente de fundo"
        defaultOpen={false}
      >
        <div className="space-y-3">
          {activePaletteId === 'legacy_custom' && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs flex items-center gap-1.5 text-amber-800">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-amber-600" />
              <span>Estilo personalizado legado em uso. Selecionar uma paleta abaixo atualizará para o padrão canônico.</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-1.5" id="hero-palette-grid">
            {HERO_PALETTES.map((pal) => {
              const isSelected = activePaletteId === pal.id;
              return (
                <button
                  key={pal.id}
                  type="button"
                  data-palette-id={pal.id}
                  onClick={() => handlePaletteSelect(pal.id)}
                  className={`p-2 rounded border text-center flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#003366] bg-blue-50/50 ring-1 ring-[#003366]'
                      : 'border-slate-200 hover:border-slate-400 bg-white'
                  }`}
                  title={pal.label}
                >
                  <div
                    style={{ backgroundColor: pal.hex }}
                    className="w-5 h-5 rounded-full border border-slate-300 shadow-2xs"
                  />
                  <span className="text-[10px] font-medium text-slate-700 leading-tight line-clamp-2">
                    {pal.label.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </InspectorSection>
    </div>
  );
};

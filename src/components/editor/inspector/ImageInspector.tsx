// src/components/editor/inspector/ImageInspector.tsx
// Inspector Canônico do Bloco de Imagem Individual (CORE.E5A / CORE.E5B).
// Baseado estritamente nas capabilities validadas MEDIA_PRIMARY_ASSET e MEDIA_CAPTION.
// Reutiliza o PrimaryImageSourceControl compartilhado.
// Zero controles aspiracionais (sem crop, border-radius, opacidade ou dimensões não declaradas).

import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { PrimaryImagePatch } from '../../../domain/primary-image.engine';
import { PrimaryImageSourceControl } from './media/PrimaryImageSourceControl';
import {
  InspectorSection,
  InspectorField,
  InspectorTextInput
} from './components';

export interface ImageInspectorProps {
  block: ContentBlock;
  pageId: string;
}

export const ImageInspector: React.FC<ImageInspectorProps> = ({ block, pageId }) => {
  const updateBlock = useCatalogStore((state) => state.updateBlock);

  const handlePatch = (patch: PrimaryImagePatch) => {
    updateBlock(pageId, block.id, patch);
  };

  const handleCaptionChange = (caption: string) => {
    updateBlock(pageId, block.id, { imageCaption: caption });
  };

  return (
    <div className="space-y-3">
      <InspectorSection
        id="inspector-image-section-media"
        title="Mídia da Imagem"
        icon={<ImageIcon className="w-3.5 h-3.5" />}
        description="Arquivo fotográfico e identificação técnica"
        defaultOpen={true}
      >
        <div className="space-y-3">
          {/* Controle Compartilhado de Imagem Primária */}
          <PrimaryImageSourceControl
            block={block}
            onPatch={handlePatch}
            uploadRole="application"
            urlInputId="image-field-url"
          />

          {/* Legenda Técnica */}
          <InspectorField
            label="Legenda Técnica"
            description="Exibida abaixo da imagem no editor e no documento exportado"
          >
            <InspectorTextInput
              id="image-field-caption"
              value={block.imageCaption || ''}
              onChange={(e) => handleCaptionChange(e.target.value)}
              placeholder="Ex: Figura 1 — Vista frontal do instrumento"
            />
          </InspectorField>
        </div>
      </InspectorSection>
    </div>
  );
};

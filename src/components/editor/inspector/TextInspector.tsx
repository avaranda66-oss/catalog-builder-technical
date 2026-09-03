// src/components/editor/inspector/TextInspector.tsx
// Inspector Canônico do Bloco de Texto Livre (CORE.E5A).
// Baseado estritamente na capability validada CONTENT_BODY do ElementCapabilityRegistry.
// Zero controles aspiracionais (sem font size, cores ou alinhamento não declarados).

import React from 'react';
import { Type } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import {
  InspectorSection,
  InspectorField,
  InspectorTextArea
} from './components';

export interface TextInspectorProps {
  block: ContentBlock;
  pageId: string;
}

export const TextInspector: React.FC<TextInspectorProps> = ({ block, pageId }) => {
  const updateBlock = useCatalogStore((state) => state.updateBlock);

  const handleContentChange = (value: string) => {
    updateBlock(pageId, block.id, { textContent: value });
  };

  return (
    <div className="space-y-3">
      <InspectorSection
        id="inspector-text-section-content"
        title="Conteúdo Textual"
        icon={<Type className="w-3.5 h-3.5" />}
        description="Texto do bloco e hierarquia documental"
        defaultOpen={true}
      >
        <InspectorField
          label="Conteúdo de Texto"
          description="Use # para título principal, ## para subtítulo, ### para seção técnica"
        >
          <InspectorTextArea
            id="text-field-content"
            rows={8}
            value={block.textContent || ''}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Digite o texto aqui. Use # para título, ## para subtítulo..."
          />
        </InspectorField>
      </InspectorSection>
    </div>
  );
};

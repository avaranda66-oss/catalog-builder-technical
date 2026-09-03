// src/components/editor/inspector/ImageGalleryInspector.tsx
// Inspector canônico para o bloco ImageGallery (CORE.E6B).
// Desacoplado do renderer, elimina Unsplash demo images e uploads inline no Canvas.

import React, { useState } from 'react';
import { Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import {
  GalleryItem,
  createEmptyGalleryItem,
  removeGalleryItemSource,
  resolveGalleryImageSource
} from '../../../domain/gallery-image.engine';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { GalleryImageSourceControl } from './media/GalleryImageSourceControl';
import {
  InspectorSection,
  InspectorField,
  InspectorTextInput,
  InspectorActionRow
} from './components';

export interface ImageGalleryInspectorProps {
  block: ContentBlock;
  pageId: string;
}

export const ImageGalleryInspector: React.FC<ImageGalleryInspectorProps> = ({
  block,
  pageId
}) => {
  const updateBlock = useCatalogStore((state) => state.updateBlock);

  const images: GalleryItem[] = Array.isArray(block.images) ? block.images : [];

  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    images.length > 0 ? 0 : null
  );

  const activeItem = selectedIndex !== null && selectedIndex < images.length
    ? images[selectedIndex]
    : null;

  const handleTitleChange = (title: string) => {
    updateBlock(pageId, block.id, { title });
  };

  const handleAddImage = () => {
    const newItem = createEmptyGalleryItem();
    const updated = [...images, newItem];
    updateBlock(pageId, block.id, { images: updated });
    setSelectedIndex(updated.length - 1);
  };

  const handleRemoveItem = (idx: number) => {
    const updated = images.filter((_, i) => i !== idx);
    updateBlock(pageId, block.id, { images: updated });
    if (selectedIndex === idx) {
      setSelectedIndex(updated.length > 0 ? 0 : null);
    } else if (selectedIndex !== null && selectedIndex > idx) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handlePatchActiveItem = (patchedItem: GalleryItem) => {
    if (selectedIndex === null) return;
    const updated = images.map((im, i) =>
      i === selectedIndex ? patchedItem : im
    );
    updateBlock(pageId, block.id, { images: updated });
  };

  const handleRemoveActiveSource = () => {
    if (selectedIndex === null || !activeItem) return;
    const updated = images.map((im, i) =>
      i === selectedIndex ? removeGalleryItemSource(im) : im
    );
    updateBlock(pageId, block.id, { images: updated });
  };

  return (
    <div className="space-y-4">
      {/* Seção 1: Conteúdo Principal */}
      <InspectorSection id="gallery-content" title="Conteúdo Principal" defaultOpen={true}>
        <InspectorField label="Título da Galeria">
          <InspectorTextInput
            id="gallery-title-input"
            value={block.title || ''}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Ex: APLICAÇÕES EM BANCADA & CAMPO"
          />
        </InspectorField>
      </InspectorSection>

      {/* Seção 2: Fotografias da Galeria */}
      <InspectorSection
        id="gallery-collection"
        title={`Fotografias (${images.length})`}
        defaultOpen={true}
      >
        <div className="space-y-3">
          {/* Botão Adicionar Foto */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAddImage}
              className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>+ Adicionar Foto</span>
            </button>
          </div>

          {/* Lista Compacta de Fotografias */}
          {images.length > 0 ? (
            <div className="space-y-1">
              {images.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const source = resolveGalleryImageSource(item);
                const captionText = item.caption?.trim() || `Foto ${idx + 1}`;

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
                      <ImageIcon className="w-3.5 h-3.5 text-[#003366] shrink-0" />
                      <span className="truncate">{captionText}</span>
                      {source.kind === 'none' && (
                        <span className="text-[10px] text-amber-600 italic shrink-0">
                          (sem foto)
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveItem(idx);
                      }}
                      className="text-slate-400 hover:text-red-600 p-1 ml-1 cursor-pointer transition-colors"
                      title="Excluir este item da galeria"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic p-2 bg-slate-50 border border-slate-200 rounded">
              Nenhuma fotografia cadastrada. O documento não exibirá fotos demonstrativas aleatórias.
            </p>
          )}

          {/* Detalhes da Foto Selecionada */}
          {activeItem && selectedIndex !== null && (
            <div className="p-3 bg-white border border-slate-300 rounded space-y-2.5 pt-2 mt-2">
              <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block border-b border-slate-200 pb-1">
                Editar Foto Selecionada
              </span>

              {/* Feature Control de Mídia */}
              <GalleryImageSourceControl
                item={activeItem}
                onPatchItem={handlePatchActiveItem}
                onRemoveSource={handleRemoveActiveSource}
                urlInputId={`gallery-item-${selectedIndex}-url`}
                uploadCaption={activeItem.caption}
              />

              {/* Legenda da Fotografia */}
              <InspectorField label="Legenda da Fotografia">
                <InspectorTextInput
                  id={`gallery-item-${selectedIndex}-caption`}
                  value={activeItem.caption || ''}
                  onChange={(e) =>
                    handlePatchActiveItem({
                      ...activeItem,
                      caption: e.target.value
                    })
                  }
                  placeholder="Ex: Operação em bancada de calibração..."
                />
              </InspectorField>

              {/* Ação: Excluir Item da Galeria */}
              <InspectorActionRow
                actions={[
                  {
                    label: 'Excluir Item da Galeria',
                    onClick: () => handleRemoveItem(selectedIndex),
                    variant: 'danger',
                    title: 'Exclui este slot da galeria por completo'
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

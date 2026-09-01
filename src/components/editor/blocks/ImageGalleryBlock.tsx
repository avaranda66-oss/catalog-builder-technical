import React, { useRef } from 'react';
import { GalleryHorizontalEnd, Trash2, Upload, Plus } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface ImageGalleryBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const ImageGalleryBlock: React.FC<ImageGalleryBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeImageIdxRef = useRef<number | null>(null);

  const images = block.images || [
    { url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80', caption: 'Montagem em bancada de calibração' },
    { url: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=400&q=80', caption: 'Operação em campo industrial' },
    { url: 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=400&q=80', caption: 'Comunicação via protocolo HART' }
  ];

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
  };

  const handleCaptionBlur = (index: number, text: string) => {
    const updated = [...images];
    updated[index] = { ...updated[index], caption: text.trim() };
    updateBlock(pageId, block.id, { images: updated });
  };

  const handleAddImage = () => {
    const newImg = {
      url: 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?auto=format&fit=crop&w=400&q=80',
      caption: 'Nova fotografia de aplicação'
    };
    updateBlock(pageId, block.id, { images: [...images, newImg] });
  };

  const handleRemoveImage = (index: number) => {
    if (images.length <= 1) return;
    updateBlock(pageId, block.id, { images: images.filter((_, i) => i !== index) });
  };

  const triggerUploadForIndex = (idx: number) => {
    activeImageIdxRef.current = idx;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || activeImageIdxRef.current === null) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        const updated = [...images];
        updated[activeImageIdxRef.current!] = {
          ...updated[activeImageIdxRef.current!],
          url: base64
        };
        updateBlock(pageId, block.id, { images: updated });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-3 bg-white rounded-none border border-slate-300 transition-all ${
        isSelected ? 'ring-2 ring-blue-600' : 'hover:border-slate-400'
      }`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* Header Técnico */}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 mb-2">
        <h3
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-slate-100 rounded-none px-1 flex items-center gap-1.5 cursor-text"
          title="Clique para editar o título da galeria"
        >
          <GalleryHorizontalEnd className="w-3.5 h-3.5 text-[#003366]" />
          <span>{block.title || 'APLICAÇÕES EM BANCADA DE CALIBRAÇÃO & CAMPO'}</span>
        </h3>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAddImage();
          }}
          className="flex items-center gap-0.5 px-2 py-0.5 text-[9px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-none no-print"
          data-editor-action="true"
        >
          <Plus className="w-3 h-3" />
          <span>+ Foto</span>
        </button>
      </div>

      {/* Grid de Imagens com Legendas Claras (Cantos Retos) */}
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${Math.min(images.length, 3)}, minmax(0, 1fr))`
        }}
      >
        {images.map((img, idx) => (
          <div
            key={idx}
            className="flex flex-col bg-white border border-slate-300 rounded-none overflow-hidden group relative hover:border-slate-500 transition-colors"
          >
            {/* Foto com Altura Padronizada */}
            <div className="h-28 overflow-hidden bg-slate-900 relative group/img flex items-center justify-center">
              <img src={img.url} alt={img.caption || 'Foto'} className="w-full h-full object-cover" />

              <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover/img:opacity-100 flex items-center justify-center gap-1.5 transition-opacity p-2 no-print" data-editor-action="true">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerUploadForIndex(idx);
                  }}
                  className="px-2 py-1 bg-[#003366] text-white font-bold rounded-none text-[9px] flex items-center gap-1 hover:bg-blue-700 no-print"
                  data-editor-action="true"
                >
                  <Upload className="w-3 h-3" />
                  <span>Trocar</span>
                </button>
              </div>
            </div>

            {/* Legenda Técnica com Texto Nítido e Completo */}
            <div className="p-1.5 bg-slate-50 border-t border-slate-200 flex items-start justify-between gap-1 min-h-[36px]">
              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleCaptionBlur(idx, e.currentTarget.innerText)}
                className="text-[9px] text-slate-700 font-sans leading-normal outline-none focus:bg-amber-100 rounded-none flex-1 px-0.5 cursor-text"
              >
                {img.caption}
              </p>

              {images.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveImage(idx);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-0.5 shrink-0 no-print"
                  data-editor-action="true"
                  title="Excluir foto"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

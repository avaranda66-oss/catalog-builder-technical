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
    updated[index] = { ...updated[index], caption: text };
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
      if (base64 && activeImageIdxRef.current !== null) {
        const updated = [...images];
        updated[activeImageIdxRef.current] = {
          ...updated[activeImageIdxRef.current],
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
      className={`relative p-4 rounded-xl border border-slate-200 bg-white shadow-sm transition-all ${
        isSelected ? 'ring-3 ring-brand-500 bg-brand-50/20' : 'hover:border-slate-300'
      }`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      <div className="flex items-center justify-between mb-3">
        <h3
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-amber-100 rounded px-1 flex items-center gap-1.5"
          title="Clique para editar o título da galeria"
        >
          <GalleryHorizontalEnd className="w-4 h-4 text-brand-600" />
          <span>{block.title || 'APLICAÇÕES EM BANCADA DE CALIBRAÇÃO & CAMPO'}</span>
        </h3>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAddImage();
          }}
          className="flex items-center gap-1 text-[10px] text-brand-700 font-semibold px-2 py-0.5 border border-brand-200 bg-brand-50 hover:bg-brand-100 rounded"
        >
          <Plus className="w-3 h-3" />
          <span>+ Foto</span>
        </button>
      </div>

      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${Math.min(images.length, 3)}, minmax(0, 1fr))`
        }}
      >
        {images.map((img, idx) => (
          <div
            key={idx}
            className="flex flex-col bg-slate-50 border border-slate-200 rounded-lg overflow-hidden group relative hover:border-brand-400 transition-colors"
          >
            {/* Foto com Botão de Troca Rápida */}
            <div className="h-28 overflow-hidden bg-slate-200 relative group/img">
              <img src={img.url} alt={img.caption || 'Foto'} className="w-full h-full object-cover" />

              {/* Botão de Trocar Foto no Hover */}
              <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover/img:opacity-100 flex items-center justify-center gap-2 transition-opacity p-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerUploadForIndex(idx);
                  }}
                  className="px-2.5 py-1 bg-white text-slate-900 font-bold rounded text-[10px] flex items-center gap-1 shadow-md hover:bg-slate-100"
                  title="Carregar foto local do computador"
                >
                  <Upload className="w-3 h-3 text-brand-600" />
                  <span>Trocar Foto</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newUrl = prompt('Insira a URL da nova imagem:', img.url);
                    if (newUrl && newUrl.trim()) {
                      const updated = [...images];
                      updated[idx] = { ...updated[idx], url: newUrl.trim() };
                      updateBlock(pageId, block.id, { images: updated });
                    }
                  }}
                  className="px-2 py-1 bg-slate-800 text-white rounded text-[10px] hover:bg-slate-700"
                  title="Colar URL da imagem"
                >
                  URL
                </button>
              </div>
            </div>

            {/* Legenda e Ações */}
            <div className="p-1.5 flex items-center justify-between gap-1 bg-white border-t border-slate-100">
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleCaptionBlur(idx, e.currentTarget.innerText.trim())}
                className="text-[10px] text-slate-600 italic outline-none focus:bg-amber-50 rounded px-1 flex-1 truncate"
                title="Clique para editar a legenda da foto"
              >
                {img.caption || 'Legenda da foto'}
              </span>

              {images.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveImage(idx);
                  }}
                  className="p-1 text-slate-400 hover:text-red-600 rounded"
                  title="Remover esta foto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

import React, { useRef } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface HeroBannerBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const HeroBannerBlock: React.FC<HeroBannerBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBadgeBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, { badgeText: e.currentTarget.innerText.trim() });
  };

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
  };

  const handleSubtitleBlur = (e: React.FocusEvent<HTMLParagraphElement>) => {
    updateBlock(pageId, block.id, { subtitle: e.currentTarget.innerText.trim() });
  };

  const handleCaptionBlur = (e: React.FocusEvent<HTMLParagraphElement>) => {
    updateBlock(pageId, block.id, { imageCaption: e.currentTarget.innerText.trim() });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        updateBlock(pageId, block.id, { imageUrl: base64 });
      }
    };
    reader.readAsDataURL(file);
  };

  const gradientClass =
    block.style?.gradient ||
    'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900';

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-6 rounded-2xl ${gradientClass} text-white shadow-xl overflow-hidden transition-all ${
        isSelected ? 'ring-4 ring-brand-400/80 shadow-2xl' : 'hover:ring-2 hover:ring-slate-400/50'
      }`}
    >
      {/* Luz ambiente de fundo */}
      <div className="absolute -right-16 -top-16 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Lado Esquerdo: Textos Institucionais 100% Editáveis */}
        <div className="flex-1 space-y-2.5">
          {/* Badge Superior */}
          <div className="inline-block">
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={handleBadgeBlur}
              className="px-3 py-1 bg-brand-600/30 border border-brand-400/40 rounded-full text-[10px] font-mono font-bold tracking-widest text-brand-200 uppercase outline-none focus:bg-brand-500/40 focus:ring-1 focus:ring-brand-300 block cursor-text"
              title="Clique para editar o selo da empresa"
            >
              {block.badgeText || 'PRESYS — INSTRUMENTAÇÃO INDUSTRIAL DE PRECISÃO'}
            </span>
          </div>

          {/* Título Principal */}
          <h1
            contentEditable
            suppressContentEditableWarning
            onBlur={handleTitleBlur}
            className="text-2xl font-extrabold tracking-tight text-white outline-none focus:bg-white/10 rounded px-1 -ml-1 cursor-text leading-tight"
            title="Clique para editar o título principal"
          >
            {block.title || 'Linha Industrial Presys PCON & Série T'}
          </h1>

          {/* Subtítulo */}
          <p
            contentEditable
            suppressContentEditableWarning
            onBlur={handleSubtitleBlur}
            className="text-xs text-slate-300 font-normal outline-none focus:bg-white/10 rounded px-1 -ml-1 cursor-text leading-relaxed max-w-md"
            title="Clique para editar a descrição do produto"
          >
            {block.subtitle ||
              'Calibradores de processos, transmissores inteligentes e padrões metrológicos para controle rigoroso de plantas industriais.'}
          </p>
        </div>

        {/* Lado Direito: Foto do Produto com Suporte a Upload Local */}
        <div className="w-full md:w-56 flex flex-col items-center flex-shrink-0 group relative">
          <div className="w-full h-36 rounded-xl overflow-hidden bg-slate-800 border-2 border-white/20 shadow-lg relative group">
            {block.imageUrl ? (
              <img
                src={block.imageUrl}
                alt="Produto Presys"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 space-y-1">
                <ImageIcon className="w-8 h-8 text-slate-500" />
                <span className="text-[10px]">Sem fotografia</span>
              </div>
            )}

            {/* Overlay com Botão de Troca de Foto Local */}
            <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-2xs opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center gap-1.5 cursor-pointer">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-[10px] font-bold shadow-md flex items-center gap-1.5 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Carregar Foto do PC</span>
              </button>
              <span className="text-[9px] text-slate-300">PNG, JPG, WEBP</span>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />
          </div>

          {/* Legenda da Fotografia Editável */}
          <p
            contentEditable
            suppressContentEditableWarning
            onBlur={handleCaptionBlur}
            className="text-[10px] text-slate-400 text-center italic mt-1.5 outline-none focus:bg-white/10 rounded px-1 cursor-text truncate max-w-full"
            title="Clique para editar a legenda da fotografia"
          >
            {block.imageCaption || 'Calibrador Presys com comunicação HART.'}
          </p>
        </div>
      </div>
    </div>
  );
};

import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useAssetStore } from '../../../stores/useAssetStore';

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const { readImageAsLocalDataUrl } = await import('../../../services/local-image.service');
    const imageUrl = await readImageAsLocalDataUrl(file);
    if (imageUrl) {
      updateBlock(pageId, block.id, { imageUrl });
    }
  };

  const gradientClass =
    block.style?.gradient ||
    'bg-[#001f3f]';

  const resolvedUrl = useAssetStore((state) => (block.assetId ? state.resolvedUrls[block.assetId] : undefined)) || block.imageUrl || (block as any).legacyUrl;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-5 rounded-none text-white ${gradientClass} transition-all cursor-pointer ${
        isSelected ? 'ring-2 ring-blue-400' : 'hover:ring-1 hover:ring-slate-400'
      }`}
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
        <div className="md:col-span-8 space-y-2">
          {block.badgeText && (
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={handleBadgeBlur}
              className="inline-block px-2.5 py-0.5 bg-blue-600/80 text-white text-[10px] font-bold tracking-wider uppercase rounded-none outline-none focus:bg-blue-600 cursor-text"
            >
              {block.badgeText}
            </span>
          )}

          <h2
            contentEditable
            suppressContentEditableWarning
            onBlur={handleTitleBlur}
            className="text-lg font-black tracking-tight leading-tight outline-none focus:bg-white/10 rounded-none px-1 -ml-1 cursor-text"
          >
            {block.title || 'PSV Portable — Sistema Pneumático e Hidrostático'}
          </h2>

          <p
            contentEditable
            suppressContentEditableWarning
            onBlur={handleSubtitleBlur}
            className="text-xs text-slate-300 font-normal leading-relaxed outline-none focus:bg-white/10 rounded-none px-1 -ml-1 cursor-text"
          >
            {block.subtitle ||
              'Faixas de pressão configuráveis até 300 bar, fixação universal de flanges e aquisição automática de dados para calibração de válvulas de segurança.'}
          </p>
        </div>

        <div className="md:col-span-4 flex flex-col items-center justify-center">
          <div className="w-full h-32 rounded-none overflow-hidden bg-slate-900 border border-slate-700 relative group flex items-center justify-center p-2">
            <img
              src={
                resolvedUrl ||
                'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80'
              }
              alt="Produto Destaque"
              className="max-h-full max-w-full object-contain filter drop-shadow"
            />

            <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center no-print" data-editor-action="true">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-2.5 py-1 bg-[#003366] hover:bg-blue-700 text-white rounded-none text-[10px] font-bold flex items-center gap-1 no-print"
                data-editor-action="true"
              >
                <Upload className="w-3 h-3" />
                <span>Trocar Foto</span>
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />
          </div>

          <p
            contentEditable
            suppressContentEditableWarning
            onBlur={handleCaptionBlur}
            className="text-[9px] text-slate-400 font-mono text-center mt-1 outline-none focus:bg-white/10 rounded-none px-1 cursor-text"
          >
            {block.imageCaption || 'Calibrador Presys com comunicação HART'}
          </p>
        </div>
      </div>
    </div>
  );
};

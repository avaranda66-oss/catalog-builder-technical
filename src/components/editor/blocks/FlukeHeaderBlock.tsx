import React, { useRef } from 'react';
import { Upload, Plus, Trash2 } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface FlukeHeaderBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const FlukeHeaderBlock: React.FC<FlukeHeaderBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const custom = block.customData || {};
  const highlights: string[] = custom.highlights || [
    'Lightweight, portable, and extremely fast',
    'Cool to -25 °C in 15 minutes and heat to 660 °C in 15 minutes',
    'Built-in two-channel readout for PRT, RTD, thermocouple, 4-20 mA current',
    'True reference thermometry with accuracy to ±0.01 °C',
    'On-board automation and documented calibration test routines',
    'Metrology performance in accuracy, stability, uniformity, and loading'
  ];

  const badgeBg = custom.badgeBg || '#FFC20E';
  const badgeTextColor = custom.badgeTextColor || '#000000';
  const badgeBorderColor = custom.badgeBorderColor || '#E5A900';
  const boxBg = custom.boxBg || '#FFF9E6';
  const boxBorder = custom.boxBorder || '#FFE082';

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
  };

  const handleSubtitleBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, { subtitle: e.currentTarget.innerText.trim() });
  };

  const handleBadgeMainBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, { badgeText: e.currentTarget.innerText.trim() });
  };

  const handleBadgeSecondaryBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, {
      customData: { ...custom, badgeSecondary: e.currentTarget.innerText.trim() }
    });
  };

  const handleDescBlur = (e: React.FocusEvent<HTMLParagraphElement>) => {
    updateBlock(pageId, block.id, {
      customData: { ...custom, description: e.currentTarget.innerText.trim() }
    });
  };

  const handleHighlightBlur = (index: number, text: string) => {
    const updated = [...highlights];
    updated[index] = text.trim();
    updateBlock(pageId, block.id, {
      customData: { ...custom, highlights: updated }
    });
  };

  const handleAddHighlight = () => {
    const updated = [...highlights, 'Novo diferencial metrológico'];
    updateBlock(pageId, block.id, {
      customData: { ...custom, highlights: updated }
    });
  };

  const handleRemoveHighlight = (index: number) => {
    if (highlights.length <= 1) return;
    const updated = highlights.filter((_, idx) => idx !== index);
    updateBlock(pageId, block.id, {
      customData: { ...custom, highlights: updated }
    });
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

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-5 rounded-2xl bg-white border border-slate-200 shadow-md transition-all ${
        isSelected ? 'ring-3 ring-amber-500 shadow-xl' : 'hover:border-slate-300'
      }`}
    >
      {/* Header com Tarja Colorida Customizável */}
      <div className="flex items-center justify-between pb-3 border-b-2 border-slate-900 mb-4 gap-4">
        <div>
          <h1
            contentEditable
            suppressContentEditableWarning
            onBlur={handleTitleBlur}
            className="text-2xl font-black text-slate-900 tracking-tight outline-none focus:bg-amber-100 rounded px-1 -ml-1 cursor-text"
          >
            {block.title || 'Field Metrology Wells / Presys Série T'}
          </h1>
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={handleSubtitleBlur}
            className="text-xs font-bold text-slate-600 uppercase tracking-widest block outline-none focus:bg-amber-50 rounded px-1 -ml-1 cursor-text"
          >
            {block.subtitle || 'Technical Data & Metrology Specifications'}
          </span>
        </div>

        {/* Tarja Metrológica 100% Editável (Texto Principal e Secundário) */}
        <div
          style={{
            backgroundColor: badgeBg,
            color: badgeTextColor,
            borderColor: badgeBorderColor
          }}
          className="px-4 py-1.5 rounded font-black text-sm tracking-wider shadow-sm flex items-center gap-2 border flex-shrink-0"
        >
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBadgeMainBlur}
            className="font-extrabold outline-none focus:bg-white/30 rounded px-0.5 cursor-text"
          >
            {block.badgeText || 'PRESYS'}
          </span>
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBadgeSecondaryBlur}
            className="text-[10px] font-normal outline-none focus:bg-white/30 rounded px-0.5 cursor-text opacity-90"
          >
            {custom.badgeSecondary || 'Calibration'}
          </span>
        </div>
      </div>

      {/* Imagem do Bloco Seco e Destaques */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
        {/* Coluna Esquerda: Imagem e Texto Explicativo */}
        <div className="md:col-span-7 space-y-3 flex flex-col justify-between">
          <div className="w-full h-44 rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center p-2 relative group shadow-inner">
            <img
              src={
                block.imageUrl ||
                'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80'
              }
              alt="Bloco Seco"
              className="max-h-full max-w-full object-contain"
            />

            <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-3 py-1.5 bg-[#FFC20E] hover:bg-amber-400 text-black font-bold rounded-lg text-xs shadow flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Trocar Imagem Local</span>
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
            onBlur={handleDescBlur}
            className="text-[11px] text-slate-700 leading-relaxed outline-none focus:bg-amber-50 rounded px-1 cursor-text"
          >
            {custom.description ||
              'Os blocos secos de calibração metrológica combinam máxima portabilidade e velocidade térmica com desempenho de laboratório primário. Com compensação de gradiente térmico integrada e canais de medição de processo para leitura de Pt100, termopares e loop de 24V.'}
          </p>
        </div>

        {/* Coluna Direita: Caixa de Destaques Customizável */}
        <div
          style={{
            backgroundColor: boxBg,
            borderColor: boxBorder
          }}
          className="md:col-span-5 border rounded-xl p-4 flex flex-col justify-between space-y-2.5 shadow-xs"
        >
          <div className="flex items-center justify-between border-b border-amber-300 pb-1">
            <span className="text-[11px] font-black text-slate-900 uppercase tracking-wide">
              Destaques de Performance
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAddHighlight();
              }}
              className="p-0.5 text-amber-900 hover:text-black rounded"
              title="Adicionar novo item"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            {highlights.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 text-[11px] text-slate-900 leading-tight group">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-1.5 flex-shrink-0" />
                <span
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => handleHighlightBlur(idx, e.currentTarget.innerText)}
                  className="outline-none focus:bg-white rounded px-0.5 flex-1 cursor-text"
                >
                  {item}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveHighlight(idx);
                  }}
                  className="p-0.5 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Excluir item"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

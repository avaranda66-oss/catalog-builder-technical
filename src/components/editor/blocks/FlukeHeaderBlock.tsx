import React from 'react';
import { Upload, Plus, Trash2 } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useAssetStore } from '../../../stores/useAssetStore';
import { useResolvedAssetUrl } from '../../../hooks/useResolvedAssetUrl';

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
  const uploadAndLinkAsset = useAssetStore((state) => state.uploadAndLinkAsset);
  const displayUrl = useResolvedAssetUrl(block.assetId, block.legacyUrl || block.imageUrl);

  const custom = block.customData || {};
  const highlights: string[] = custom.highlights || [
    'Leve, portátil e de resposta térmica ultrarrápida',
    'Resfria até -25 °C e aquece até 660 °C em poucos minutos',
    'Dois canais de medição para PRT, RTD, termopar e 4-20 mA',
    'Exatidão metrológica com estabilidade térmica de ±0.01 °C',
    'Rotinas automáticas de calibração com emissão de relatórios',
    'Homogeneidade radial e axial certificada conforme normas internacionais'
  ];

  const badgeBg = custom.badgeBg || '#003366';
  const badgeTextColor = custom.badgeTextColor || '#ffffff';
  const badgeBorderColor = custom.badgeBorderColor || '#002244';
  const boxBg = custom.boxBg || '#f8fafc';
  const boxBorder = custom.boxBorder || '#cbd5e1';

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const res = await uploadAndLinkAsset(file, {
      role: 'front',
      caption: block.title || 'Foto do Instrumento'
    });
    if (res.success && res.assetId) {
      updateBlock(pageId, block.id, { assetId: res.assetId });
    }
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
      {/* Header com Tarja Metrológica Retilínea */}
      <div className="flex items-center justify-between pb-2 border-b-2 border-slate-900 mb-3 gap-3">
        <div>
          <h1
            data-printable-field="title"
            contentEditable
            suppressContentEditableWarning
            onBlur={handleTitleBlur}
            className="text-xl font-black text-slate-900 tracking-tight outline-none focus:bg-slate-100 rounded-none px-1 -ml-1 cursor-text leading-tight"
          >
            {block.title || 'SÉRIE DE CALIBRAÇÃO TÉRMICA PRESYS'}
          </h1>
          <span
            data-printable-field="subtitle"
            contentEditable
            suppressContentEditableWarning
            onBlur={handleSubtitleBlur}
            className="text-[11px] font-bold text-slate-600 uppercase tracking-widest block outline-none focus:bg-slate-100 rounded-none px-1 -ml-1 cursor-text mt-0.5"
          >
            {block.subtitle || 'Technical Specifications & Performance Data'}
          </span>
        </div>

        {/* Tarja Metrológica Cantos Retos */}
        <div
          style={{
            backgroundColor: badgeBg,
            color: badgeTextColor,
            borderColor: badgeBorderColor
          }}
          className="px-3 py-1 rounded-none font-bold text-xs tracking-wider flex items-center gap-1.5 border shrink-0 uppercase font-mono select-none"
        >
          <span
            data-printable-field="badgeText"
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBadgeMainBlur}
            className="outline-none focus:bg-white/30 rounded-none px-0.5 cursor-text"
          >
            {block.badgeText || 'PRESYS'}
          </span>
          <span
            data-printable-field="badgeSecondary"
            data-printable-policy="protect"
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBadgeSecondaryBlur}
            className="text-[9px] outline-none focus:bg-white/30 rounded-none px-0.5 cursor-text opacity-90"
          >
            {custom.badgeSecondary || 'Calibration'}
          </span>
        </div>
      </div>

      {/* Grid Principal do Bloco */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
        {/* Coluna Esquerda: Imagem e Descrição */}
        <div className="md:col-span-7 space-y-2 flex flex-col justify-between">
          {displayUrl ? (
            <div className="relative group border border-slate-200 bg-slate-50 p-2 flex items-center justify-center min-h-[140px] max-h-[180px] overflow-hidden">
              <img
                src={displayUrl}
                alt={block.title || 'Product Image'}
                className="max-h-[160px] w-auto object-contain"
              />
              <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity text-white text-xs font-bold gap-1 no-print">
                <Upload className="w-4 h-4" />
                <span>Alterar Imagem</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <label className="border-2 border-dashed border-slate-300 hover:border-[#003366] bg-slate-50 hover:bg-blue-50/40 p-4 rounded-none flex flex-col items-center justify-center cursor-pointer transition-colors min-h-[140px] no-print">
              <Upload className="w-6 h-6 text-slate-400 mb-1" />
              <span className="text-xs font-bold text-slate-600">Carregar Imagem Frontal</span>
              <span className="text-[10px] text-slate-400">PNG / JPG transparente</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          )}

          <p
            data-printable-field="description"
            contentEditable
            suppressContentEditableWarning
            onBlur={handleDescBlur}
            className="text-[11px] text-slate-700 leading-normal outline-none focus:bg-amber-50 rounded-none px-1 cursor-text"
          >
            {custom.description ||
              'Os calibradores metrológicos combinam máxima portabilidade e velocidade com estabilidade de laboratório primário. Com compensação de gradiente térmico integrada e canais para medição de Pt100, termopares e loop de 24V.'}
          </p>
        </div>

        {/* Coluna Direita: Box de Destaques Técnicos */}
        <div
          style={{ backgroundColor: boxBg, borderColor: boxBorder }}
          className="md:col-span-5 p-2.5 rounded-none border flex flex-col justify-between space-y-1.5"
        >
          <div>
            <div className="flex items-center justify-between border-b border-slate-300 pb-1 mb-1.5">
              <span data-print-string-key="features_overview" className="font-bold text-[10px] text-slate-900 uppercase tracking-wider font-mono">
                Destaques Metrológicos
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddHighlight();
                }}
                className="flex items-center gap-0.5 text-[9px] font-bold text-slate-700 bg-white border border-slate-300 px-1.5 py-0.5 rounded-none hover:bg-slate-100 no-print"
                data-editor-action="true"
              >
                <Plus className="w-2.5 h-2.5" />
                <span>+ Item</span>
              </button>
            </div>

            <ul className="space-y-1 text-[10px] text-slate-800">
              {highlights.map((h, idx) => (
                <li key={idx} className="flex items-start gap-1.5 group relative">
                  <span className="text-[#003366] font-bold shrink-0 mt-0.5 select-none" data-printable-policy="protect">■</span>
                  <span
                    data-printable-field={`hl_${idx}`}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => handleHighlightBlur(idx, e.currentTarget.innerText)}
                    className="outline-none focus:bg-amber-100 rounded-none flex-1 leading-snug cursor-text"
                  >
                    {h}
                  </span>
                  {highlights.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveHighlight(idx);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-0.5 no-print"
                      data-editor-action="true"
                      title="Excluir item"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useRef } from 'react';
import { Upload, Check, Plus, Trash2 } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface AdditelTwoColBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const AdditelTwoColBlock: React.FC<AdditelTwoColBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const custom = block.customData || {};
  const bulletList: string[] = custom.bullets || [
    'Automated and self-contained pressure generation and control to 1,500 psi (100 bar)',
    'Precision accuracy models to 0.01% FS with high stability',
    'Two removable internal pressure modules for multi-range selection',
    'Control stability better than 0.003% FS',
    'Full HART and Profibus field communicator on-board',
    'Data logging, task management and automated calibration report generation',
    'Patented electric pump technology with fast response'
  ];

  const themeColor = custom.themeColor || '#2563EB';

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
  };

  const handleSubtitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { subtitle: e.currentTarget.innerText.trim() });
  };

  const handleBadgeMainBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, { badgeText: e.currentTarget.innerText.trim() });
  };

  const handleBadgeSubBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, {
      customData: { ...custom, badgeSubtitle: e.currentTarget.innerText.trim() }
    });
  };

  const handleOverviewBlur = (e: React.FocusEvent<HTMLParagraphElement>) => {
    updateBlock(pageId, block.id, {
      customData: { ...custom, overview: e.currentTarget.innerText.trim() }
    });
  };

  const handleBulletBlur = (index: number, text: string) => {
    const updated = [...bulletList];
    updated[index] = text.trim();
    updateBlock(pageId, block.id, {
      customData: { ...custom, bullets: updated }
    });
  };

  const handleAddBullet = () => {
    const updated = [...bulletList, 'Novo diferencial técnico'];
    updateBlock(pageId, block.id, {
      customData: { ...custom, bullets: updated }
    });
  };

  const handleRemoveBullet = (index: number) => {
    if (bulletList.length <= 1) return;
    const updated = bulletList.filter((_, idx) => idx !== index);
    updateBlock(pageId, block.id, {
      customData: { ...custom, bullets: updated }
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
        isSelected ? 'ring-3 ring-blue-500 shadow-xl' : 'hover:border-slate-300'
      }`}
    >
      {/* Faixa Superior com Título Estilo Dual-Column */}
      <div
        style={{ borderColor: themeColor }}
        className="flex items-center justify-between pb-3 border-b-2 mb-4 gap-4"
      >
        <div>
          <h2
            contentEditable
            suppressContentEditableWarning
            onBlur={handleTitleBlur}
            className="text-2xl font-black text-slate-900 tracking-tight outline-none focus:bg-amber-50 rounded px-1 -ml-1 cursor-text"
          >
            {block.title || 'Presys PCON-Y18'}
          </h2>
          <h3
            contentEditable
            suppressContentEditableWarning
            onBlur={handleSubtitleBlur}
            style={{ color: themeColor }}
            className="text-sm font-bold tracking-normal outline-none focus:bg-amber-50 rounded px-1 -ml-1 cursor-text"
          >
            {block.subtitle || 'Series Automated Pressure Calibrators'}
          </h3>
        </div>

        <div className="text-right">
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBadgeMainBlur}
            style={{ color: themeColor }}
            className="font-extrabold text-lg font-serif italic tracking-wide block outline-none focus:bg-amber-50 rounded px-1 cursor-text"
          >
            {block.badgeText || 'PRESYS Metrology'}
          </span>
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBadgeSubBlur}
            className="text-[10px] text-slate-500 font-mono block outline-none focus:bg-amber-50 rounded px-1 cursor-text"
          >
            {custom.badgeSubtitle || 'Metrology Made Simple'}
          </span>
        </div>
      </div>

      {/* Grid 2 Colunas Assimétricas (Foto à Esquerda | Recursos à Direita) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Coluna Esquerda: Imagem do Equipamento com Overlay para Troca de Foto */}
        <div className="md:col-span-5 flex flex-col items-center group relative">
          <div className="w-full h-56 rounded-xl overflow-hidden bg-slate-50 border border-slate-200 flex items-center justify-center p-2 relative shadow-inner">
            <img
              src={
                block.imageUrl ||
                'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80'
              }
              alt="Calibrador"
              className="max-h-full max-w-full object-contain"
            />

            <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-2 text-white">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-[10px] font-bold shadow flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Trocar Foto Local</span>
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
          <span className="text-[10px] text-slate-500 mt-1.5 italic text-center">
            {block.imageCaption || 'Instrumento autônomo com bomba elétrica e módulos duplos.'}
          </span>
        </div>

        {/* Coluna Direita: Bullets de Destaque Estilo Additel */}
        <div className="md:col-span-7 space-y-2">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Diferenciais de Engenharia ({bulletList.length})
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAddBullet();
              }}
              className="flex items-center gap-1 text-[10px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200"
            >
              <Plus className="w-3 h-3" />
              <span>+ Diferencial</span>
            </button>
          </div>

          {bulletList.map((bullet, idx) => (
            <div key={idx} className="flex items-start gap-2 text-[11px] text-slate-800 group">
              <div
                style={{ backgroundColor: themeColor }}
                className="w-3.5 h-3.5 rounded text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs"
              >
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </div>
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleBulletBlur(idx, e.currentTarget.innerText)}
                className="outline-none focus:bg-amber-50 rounded px-1 flex-1 leading-snug cursor-text"
              >
                {bullet}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveBullet(idx);
                }}
                className="p-0.5 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Excluir bullet"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Caixa de Overview / Visão Geral no Rodapé do Bloco */}
      <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
        <span
          style={{ color: themeColor }}
          className="text-[11px] font-extrabold uppercase tracking-wider block"
        >
          OVERVIEW / VISÃO GERAL
        </span>
        <p
          contentEditable
          suppressContentEditableWarning
          onBlur={handleOverviewBlur}
          className="text-[11px] text-slate-700 leading-relaxed outline-none focus:bg-white rounded px-1 cursor-text"
        >
          {custom.overview ||
            'O calibrador automático representa um avanço metrológico completo com geração de pressão autônoma de vácuo até 100 bar (1.500 psi). Totalmente integrado com bomba elétrica de velocidade controlada, módulos intercambiáveis de alta exatidão (0.01% FE) e comunicação com protocolo HART e Profibus.'}
        </p>
      </div>
    </div>
  );
};

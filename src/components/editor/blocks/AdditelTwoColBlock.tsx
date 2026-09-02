import React, { useRef } from 'react';
import { Upload, Plus, Trash2 } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useAssetStore } from '../../../stores/useAssetStore';
import { useResolvedAssetUrl } from '../../../hooks/useResolvedAssetUrl';

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
  const uploadAndLinkAsset = useAssetStore((state) => state.uploadAndLinkAsset);
  const displayUrl = useResolvedAssetUrl(block.assetId, block.legacyUrl || block.imageUrl);

  const custom = block.customData || {};
  const bulletList: string[] = custom.bullets || [
    'Geração e controle automático de pressão até 100 bar (1.500 psi)',
    'Modelos de alta exatidão metrológica até 0.01% FE com estabilidade térmica',
    'Dois módulos internos intercambiáveis para seleção de múltiplas faixas',
    'Estabilidade de controle superior a 0.003% FE',
    'Comunicador de campo HART e Modbus integrado na placa principal',
    'Datalogger, gerenciador de tarefas e emissão automática de relatórios'
  ];

  const themeColor = custom.themeColor || '#003366';

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
    const updated = [...bulletList, 'Novo diferencial metrológico'];
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const res = await uploadAndLinkAsset(file, {
      role: 'hero',
      caption: block.title || 'Foto de Apresentação'
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
      {/* Header Estilo Metrologia */}
      <div className="flex items-center justify-between pb-2 border-b-2 border-slate-900 mb-3 gap-3">
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <h1
              contentEditable
              suppressContentEditableWarning
              onBlur={handleTitleBlur}
              className="text-xl font-black text-slate-900 tracking-tight outline-none focus:bg-slate-100 rounded-none px-1 -ml-1 cursor-text leading-tight"
            >
              {block.title || 'SÉRIE PRESYS PCON'}
            </h1>
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={handleSubtitleBlur}
              className="text-sm font-bold text-slate-600 outline-none focus:bg-slate-100 rounded-none px-1 cursor-text"
            >
              {block.subtitle || 'Calibrador Automático de Pressão'}
            </span>
          </div>
        </div>

        {/* Badge Lateral */}
        <div
          style={{ backgroundColor: themeColor }}
          className="px-3 py-1 text-white text-right rounded-none border border-slate-900 shrink-0 select-none"
        >
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBadgeMainBlur}
            className="font-mono font-bold text-xs tracking-wider block outline-none focus:bg-white/20 px-0.5 cursor-text leading-none uppercase"
          >
            {block.badgeText || 'PRESYS'}
          </span>
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBadgeSubBlur}
            className="text-[8px] font-mono text-blue-200 block outline-none focus:bg-white/20 px-0.5 cursor-text uppercase tracking-widest mt-0.5"
          >
            {custom.badgeSubtitle || 'Precision Metrology'}
          </span>
        </div>
      </div>

      {/* Grid 2 Colunas */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
        {/* Coluna Esquerda: Imagem e Visão Geral */}
        <div className="md:col-span-6 space-y-2 flex flex-col justify-between">
          <div className="w-full h-44 rounded-none overflow-hidden bg-slate-900 border border-slate-300 flex items-center justify-center p-2 relative group">
            {displayUrl ? (
              <img
                src={displayUrl}
                alt="Produto Metrológico"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="text-slate-500 text-[10px] font-sans flex flex-col items-center gap-1 text-center p-2">
                <Upload className="w-5 h-5 text-slate-600 no-print" />
                <span className="no-print">Clique para trocar a imagem do produto</span>
              </div>
            )}

            <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center no-print" data-editor-action="true">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-3 py-1.5 bg-[#003366] hover:bg-blue-700 text-white font-bold rounded-none text-xs flex items-center gap-1.5 no-print"
                data-editor-action="true"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Trocar Imagem</span>
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
            onBlur={handleOverviewBlur}
            className="text-[11px] text-slate-700 leading-normal outline-none focus:bg-amber-50 rounded-none px-1 cursor-text"
          >
            {custom.overview ||
              'A linha de calibradores automáticos de pressão oferece geração autônoma e medição com exatidão metrológica. Ideal para testes automatizados de transmissores, manômetros e pressostatos em laboratório e campo.'}
          </p>
        </div>

        {/* Coluna Direita: Lista de Recursos Técnicos */}
        <div className="md:col-span-6 p-2.5 bg-slate-50 border border-slate-200 rounded-none flex flex-col justify-between space-y-1.5">
          <div>
            <div className="flex items-center justify-between border-b border-slate-300 pb-1 mb-1.5">
              <span className="font-bold text-[10px] text-slate-900 uppercase tracking-wider font-mono">
                Recursos Técnicos de Destaque
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddBullet();
                }}
                className="flex items-center gap-0.5 text-[9px] font-bold text-slate-700 bg-white border border-slate-300 px-1.5 py-0.5 rounded-none hover:bg-slate-100 no-print"
                data-editor-action="true"
              >
                <Plus className="w-2.5 h-2.5" />
                <span>+ Item</span>
              </button>
            </div>

            <ul className="space-y-1 text-[10px] text-slate-800">
              {bulletList.map((bullet, idx) => (
                <li key={idx} className="flex items-start gap-1.5 group relative">
                  <span className="text-[#003366] font-bold shrink-0 mt-0.5 select-none">■</span>
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => handleBulletBlur(idx, e.currentTarget.innerText)}
                    className="outline-none focus:bg-amber-100 rounded-none flex-1 leading-snug cursor-text"
                  >
                    {bullet}
                  </span>
                  {bulletList.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveBullet(idx);
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

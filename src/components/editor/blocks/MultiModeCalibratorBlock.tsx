import React from 'react';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface MultiModeCalibratorBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export interface CalibratorModeItem {
  id: string;
  badge: string; // Identificador técnico limpo (ex: 01, 02, DB, AB)
  title: string;
  desc: string;
}

export const DEFAULT_CALIBRATOR_MODES: CalibratorModeItem[] = [
  {
    id: 'mode-1',
    badge: '01',
    title: 'Bloco Seco (Dry Block)',
    desc: 'Calibração rápida de sensores retos, termopares e termorresistências em insertos metálicos de equalização térmica.'
  },
  {
    id: 'mode-2',
    badge: '02',
    title: 'Banho Líquido Agitado',
    desc: 'Com o kit agitador magnético, converte o bloco em banho líquido homogêneo para termômetros de vidro e sensores curvos.'
  },
  {
    id: 'mode-3',
    badge: '03',
    title: 'Sensor de Superfície',
    desc: 'Inserto especial com sensor de referência embutido na superfície para calibração de sensores de contato e fitas térmicas.'
  },
  {
    id: 'mode-4',
    badge: '04',
    title: 'Corpo Negro (Blackbody)',
    desc: 'Cavidade de alta emissividade (ε = 0.99) para calibração óptica de termômetros infravermelhos e termovisores.'
  }
];

export const MultiModeCalibratorBlock: React.FC<MultiModeCalibratorBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();

  const modes: CalibratorModeItem[] = block.customData?.modes || DEFAULT_CALIBRATOR_MODES;
  const badgeText = block.badgeText !== undefined ? block.badgeText : 'Multifunctional Series';

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
  };

  const handleBadgeBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, { badgeText: e.currentTarget.innerText.trim() });
  };

  const handleModeUpdate = (index: number, field: keyof CalibratorModeItem, val: string) => {
    const updated = [...modes];
    updated[index] = { ...updated[index], [field]: val };
    updateBlock(pageId, block.id, {
      customData: { ...(block.customData || {}), modes: updated }
    });
  };

  const handleAddMode = () => {
    const newNum = String(modes.length + 1).padStart(2, '0');
    const newMode: CalibratorModeItem = {
      id: `mode-${Date.now()}`,
      badge: newNum,
      title: `Novo Modo ${newNum}`,
      desc: 'Descrição técnica da aplicação e metodologia metrológica.'
    };
    updateBlock(pageId, block.id, {
      customData: { ...(block.customData || {}), modes: [...modes, newMode] }
    });
  };

  const handleRemoveMode = (index: number) => {
    if (modes.length <= 1) return;
    const updated = modes.filter((_, i) => i !== index);
    updateBlock(pageId, block.id, {
      customData: { ...(block.customData || {}), modes: updated }
    });
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
      {/* Header Técnico do Bloco */}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 mb-2 gap-2">
        <h3
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-slate-100 rounded-none px-1 flex items-center gap-1.5 flex-1"
          title="Clique para editar o título"
        >
          <Layers className="w-3.5 h-3.5 text-[#003366] shrink-0" />
          <span>{block.title || 'SISTEMA MULTIFUNÇÃO — 4 MODOS DE CALIBRAÇÃO TÉRMICA'}</span>
        </h3>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBadgeBlur}
            className="text-[9px] text-[#003366] font-mono font-bold bg-blue-50 px-2 py-0.5 rounded-none border border-blue-200 outline-none focus:bg-amber-100 cursor-text uppercase tracking-wider"
            title="Clique para editar o badge"
          >
            {badgeText || 'Multifunctional Series'}
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAddMode();
            }}
            className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-none"
            title="Adicionar novo modo"
          >
            <Plus className="w-3 h-3" />
            <span>+ Modo</span>
          </button>
        </div>
      </div>

      {/* Grid Técnico de Modos de Calibração (Zero Emojis, Cantos Retos) */}
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${Math.min(modes.length, 4)}, minmax(0, 1fr))`
        }}
      >
        {modes.map((mode, idx) => (
          <div
            key={mode.id || idx}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-none flex flex-col justify-between space-y-1.5 hover:bg-slate-100/70 transition-colors group relative"
          >
            <div className="space-y-1">
              {/* Badge Numérica Técnica */}
              <div className="flex items-center justify-between">
                <span
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => handleModeUpdate(idx, 'badge', e.currentTarget.innerText.trim())}
                  className="w-6 h-5 rounded-none bg-[#003366] text-white flex items-center justify-center font-mono font-bold text-[10px] outline-none focus:ring-1 focus:ring-amber-400 cursor-text"
                  title="Clique para mudar o código"
                >
                  {mode.badge || String(idx + 1).padStart(2, '0')}
                </span>

                {modes.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveMode(idx);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-600 transition-opacity"
                    title="Excluir este modo"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Título do Modo */}
              <h4
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleModeUpdate(idx, 'title', e.currentTarget.innerText.trim())}
                className="font-bold text-slate-900 text-[11px] outline-none focus:bg-amber-100 rounded-none px-0.5 leading-snug"
                title="Clique para editar o título"
              >
                {mode.title}
              </h4>

              {/* Descrição Técnica */}
              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleModeUpdate(idx, 'desc', e.currentTarget.innerText.trim())}
                className="text-[10px] text-slate-600 leading-relaxed outline-none focus:bg-amber-50 rounded-none px-0.5 font-sans"
                title="Clique para editar a descrição"
              >
                {mode.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

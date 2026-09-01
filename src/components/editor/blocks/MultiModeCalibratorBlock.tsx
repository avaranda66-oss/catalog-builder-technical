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
  badge: string; // Emoji, ícone ou texto de identificação (ex: 🔥, 💧, 📈, 🎯, A, B)
  title: string;
  desc: string;
}

export const DEFAULT_CALIBRATOR_MODES: CalibratorModeItem[] = [
  {
    id: 'mode-1',
    badge: '🔥',
    title: '1. Bloco Seco (Dry Block)',
    desc: 'Calibração rápida de sensores retos, termopares e termorresistências em insertos metálicos de equalização térmica.'
  },
  {
    id: 'mode-2',
    badge: '💧',
    title: '2. Banho Líquido Agitado',
    desc: 'Com o kit agitador magnético, converte o bloco em banho líquido homogêneo para termômetros de vidro e sensores curvos.'
  },
  {
    id: 'mode-3',
    badge: '📈',
    title: '3. Sensor de Superfície',
    desc: 'Inserto especial com sensor de referência embutido na superfície para calibração de sensores de contato e fitas térmicas.'
  },
  {
    id: 'mode-4',
    badge: '🎯',
    title: '4. Corpo Negro (Blackbody)',
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
    const newNum = modes.length + 1;
    const newMode: CalibratorModeItem = {
      id: `mode-${Date.now()}`,
      badge: '⚡',
      title: `${newNum}. Novo Modo de Operação`,
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
      className={`relative p-5 rounded-2xl bg-white border border-slate-200 shadow-md transition-all ${
        isSelected ? 'ring-3 ring-brand-500 shadow-xl' : 'hover:border-slate-300'
      }`}
    >
      {/* Header do Bloco */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-3 gap-2">
        <h3
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-amber-100 rounded px-1 flex items-center gap-2 flex-1"
          title="Clique para editar o título"
        >
          <Layers className="w-4 h-4 text-brand-600 shrink-0" />
          <span>{block.title || 'SISTEMA MULTIFUNÇÃO — 4 MODOS DE CALIBRAÇÃO TÉRMICA EM 1 ÚNICO INSTRUMENTO'}</span>
        </h3>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBadgeBlur}
            className="text-[10px] text-brand-700 font-bold bg-brand-50 px-2 py-0.5 rounded border border-brand-200 outline-none focus:bg-amber-100 cursor-text"
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
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded"
            title="Adicionar novo modo de calibração"
          >
            <Plus className="w-3 h-3" />
            <span>+ Modo</span>
          </button>
        </div>
      </div>

      {/* Grid Dinâmico de Modos de Calibração */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${Math.min(modes.length, 4)}, minmax(0, 1fr))`
        }}
      >
        {modes.map((mode, idx) => (
          <div
            key={mode.id || idx}
            className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between space-y-2 hover:bg-brand-50/20 hover:border-brand-300 transition-colors group relative"
          >
            <div className="space-y-1.5">
              {/* Badge / Ícone / Emoji Editável */}
              <div className="flex items-center justify-between">
                <span
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => handleModeUpdate(idx, 'badge', e.currentTarget.innerText.trim())}
                  className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-2xs text-sm outline-none focus:ring-2 focus:ring-amber-400 cursor-text"
                  title="Clique para mudar o emoji/ícone"
                >
                  {mode.badge || '🔥'}
                </span>

                {modes.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveMode(idx);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 rounded transition-opacity"
                    title="Excluir este modo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Título do Modo Editável */}
              <h4
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleModeUpdate(idx, 'title', e.currentTarget.innerText.trim())}
                className="font-bold text-slate-900 text-xs outline-none focus:bg-amber-100 rounded px-0.5"
                title="Clique para editar o título deste modo"
              >
                {mode.title}
              </h4>

              {/* Descrição do Modo Editável */}
              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleModeUpdate(idx, 'desc', e.currentTarget.innerText.trim())}
                className="text-[10px] text-slate-600 leading-relaxed outline-none focus:bg-amber-50 rounded px-0.5"
                title="Clique para editar a descrição técnica deste modo"
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

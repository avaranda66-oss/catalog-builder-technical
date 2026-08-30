'use client'

import React from 'react'
import { PageSection, SectionStyle } from '@/lib/types/catalog-builder'
import { useEditorStore } from '@/features/editor/editor-store'
import {
  X,
  Palette,
  Type,
  LayoutGrid,
  Sliders,
  RotateCcw,
  Check,
} from 'lucide-react'

interface BlockInspectorProps {
  pageId: string
  section: PageSection | null
  onClose: () => void
}

const PRESET_COLORS = [
  { label: 'Azul Presys', value: '#003366' },
  { label: 'Azul Escuro', value: '#001A33' },
  { label: 'Azul Royal', value: '#2563EB' },
  { label: 'Cinza Escuro', value: '#1A1A2E' },
  { label: 'Cinza Metálico', value: '#525252' },
  { label: 'Verde Metrológico', value: '#059669' },
  { label: 'Vermelho Alerta', value: '#DC2626' },
  { label: 'Preto Técnico', value: '#171717' },
]

const PRESET_BG_COLORS = [
  { label: 'Branco', value: '#FFFFFF' },
  { label: 'Cinza Claro', value: '#FAFAFA' },
  { label: 'Cinza Suave', value: '#F5F5F5' },
  { label: 'Azul Bem Claro', value: '#F8FAFC' },
  { label: 'Azul Noturno', value: '#1A1A2E' },
  { label: 'Transparente', value: 'transparent' },
]

export const BlockInspector: React.FC<BlockInspectorProps> = ({ pageId, section, onClose }) => {
  const { updateSection } = useEditorStore()

  if (!section) return null

  const style: SectionStyle = section.style || {}

  const handleStyleChange = (updates: Partial<SectionStyle>) => {
    updateSection(pageId, section.id, {
      style: {
        ...style,
        ...updates,
      },
    })
  }

  const handleReset = () => {
    updateSection(pageId, section.id, {
      style: {},
    })
  }

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white border-l border-[#D4D4D4] shadow-2xl z-50 flex flex-col select-none animate-in slide-in-from-right duration-200">
      {/* Inspector Header */}
      <div className="px-4 py-3 border-b border-[#D4D4D4] bg-[#FAFAFA] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-[#2563EB]" />
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#171717] block">
              Personalizar Bloco
            </span>
            <span className="text-[10px] text-[#737373] truncate block max-w-[180px]">
              {section.title}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-[#E5E5E5] text-[#525252]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
        {/* 1. TÍTULO E CABEÇALHO DO BLOCO */}
        <div className="space-y-2">
          <span className="font-bold uppercase tracking-wider text-[10px] text-[#737373] block border-b border-[#E5E5E5] pb-1">
            Nome & Visibilidade
          </span>
          <div className="space-y-1">
            <label className="text-[11px] text-[#525252]">Título do Bloco:</label>
            <input
              type="text"
              value={section.title}
              onChange={(e) => updateSection(pageId, section.id, { title: e.target.value })}
              className="w-full h-8 px-2 border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="text-[11px] text-[#525252]">Ocultar Título no PDF:</label>
            <input
              type="checkbox"
              checked={style.hideHeader || false}
              onChange={(e) => handleStyleChange({ hideHeader: e.target.checked })}
              className="h-4 w-4 text-[#2563EB]"
            />
          </div>
        </div>

        {/* 2. CORES DO BLOCO */}
        <div className="space-y-2">
          <span className="font-bold uppercase tracking-wider text-[10px] text-[#737373] block border-b border-[#E5E5E5] pb-1 flex items-center gap-1">
            <Palette className="w-3 h-3 text-[#2563EB]" /> Cores & Fundo
          </span>

          {/* Cor de Destaque / Título */}
          <div className="space-y-1">
            <label className="text-[11px] text-[#525252] block">Cor de Destaque / Título:</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={style.accentColor || '#003366'}
                onChange={(e) => handleStyleChange({ accentColor: e.target.value })}
                className="w-8 h-8 p-0 border border-[#D4D4D4] cursor-pointer"
              />
              <input
                type="text"
                value={style.accentColor || '#003366'}
                onChange={(e) => handleStyleChange({ accentColor: e.target.value })}
                className="flex-1 h-8 px-2 font-mono-data text-xs border border-[#D4D4D4]"
              />
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => handleStyleChange({ accentColor: c.value })}
                  style={{ backgroundColor: c.value }}
                  className="w-5 h-5 rounded-full border border-[#D4D4D4] hover:scale-110 transition-transform"
                />
              ))}
            </div>
          </div>

          {/* Cor de Fundo */}
          <div className="space-y-1 pt-2">
            <label className="text-[11px] text-[#525252] block">Cor de Fundo do Bloco:</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : '#FFFFFF'}
                onChange={(e) => handleStyleChange({ backgroundColor: e.target.value })}
                className="w-8 h-8 p-0 border border-[#D4D4D4] cursor-pointer"
              />
              <input
                type="text"
                value={style.backgroundColor || '#FFFFFF'}
                onChange={(e) => handleStyleChange({ backgroundColor: e.target.value })}
                className="flex-1 h-8 px-2 font-mono-data text-xs border border-[#D4D4D4]"
              />
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {PRESET_BG_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => handleStyleChange({ backgroundColor: c.value })}
                  className={`px-2 py-0.5 text-[10px] border ${
                    style.backgroundColor === c.value
                      ? 'border-[#2563EB] bg-[#EFF6FF] text-[#2563EB] font-bold'
                      : 'border-[#D4D4D4] bg-white text-[#525252]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. TIPOGRAFIA & TAMANHOS DE FONTE */}
        <div className="space-y-2">
          <span className="font-bold uppercase tracking-wider text-[10px] text-[#737373] block border-b border-[#E5E5E5] pb-1 flex items-center gap-1">
            <Type className="w-3 h-3 text-[#2563EB]" /> Tipografia & Fontes
          </span>

          {/* Tamanho do Título */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-[#525252]">Tamanho do Título:</span>
              <span className="font-mono-data font-bold text-[#171717]">
                {style.titleFontSizePx || 12}px
              </span>
            </div>
            <input
              type="range"
              min="9"
              max="24"
              step="1"
              value={style.titleFontSizePx || 12}
              onChange={(e) => handleStyleChange({ titleFontSizePx: parseInt(e.target.value) })}
              className="w-full h-2 bg-[#E5E5E5] rounded-xs appearance-none cursor-pointer accent-[#2563EB]"
            />
          </div>

          {/* Tamanho do Corpo/Tabela */}
          <div className="space-y-1 pt-2">
            <div className="flex justify-between text-[11px]">
              <span className="text-[#525252]">Tamanho do Texto / Tabela:</span>
              <span className="font-mono-data font-bold text-[#171717]">
                {style.fontSizePx || 10.5}px
              </span>
            </div>
            <input
              type="range"
              min="8"
              max="16"
              step="0.5"
              value={style.fontSizePx || 10.5}
              onChange={(e) => handleStyleChange({ fontSizePx: parseFloat(e.target.value) })}
              className="w-full h-2 bg-[#E5E5E5] rounded-xs appearance-none cursor-pointer accent-[#2563EB]"
            />
          </div>

          {/* Alinhamento */}
          <div className="space-y-1 pt-2">
            <label className="text-[11px] text-[#525252] block">Alinhamento do Texto:</label>
            <div className="grid grid-cols-4 gap-1">
              {(['left', 'center', 'right', 'justify'] as const).map((align) => (
                <button
                  key={align}
                  type="button"
                  onClick={() => handleStyleChange({ align })}
                  className={`py-1 text-center text-[10px] capitalize border ${
                    (style.align || 'left') === align
                      ? 'border-[#2563EB] bg-[#EFF6FF] text-[#2563EB] font-bold'
                      : 'border-[#D4D4D4] bg-white text-[#525252]'
                  }`}
                >
                  {align === 'left' ? 'Esq.' : align === 'center' ? 'Centro' : align === 'right' ? 'Dir.' : 'Just.'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4. LAYOUT, LARGURA & ESPAÇAMENTO */}
        <div className="space-y-2">
          <span className="font-bold uppercase tracking-wider text-[10px] text-[#737373] block border-b border-[#E5E5E5] pb-1 flex items-center gap-1">
            <LayoutGrid className="w-3 h-3 text-[#2563EB]" /> Layout & Dimensões
          </span>

          {/* Largura da Coluna */}
          <div className="space-y-1">
            <label className="text-[11px] text-[#525252] block">Largura do Bloco na Página:</label>
            <div className="grid grid-cols-3 gap-1">
              {[
                { label: '100% (Total)', value: 100 },
                { label: '50% (Meia)', value: 50 },
                { label: '33% (1/3)', value: 33 },
              ].map((w) => (
                <button
                  key={w.value}
                  type="button"
                  onClick={() => handleStyleChange({ widthPercent: w.value })}
                  className={`py-1.5 text-center text-[10px] border ${
                    (style.widthPercent || 100) === w.value
                      ? 'border-[#2563EB] bg-[#EFF6FF] text-[#2563EB] font-bold'
                      : 'border-[#D4D4D4] bg-white text-[#525252]'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* Espaçamento Interno (Padding) */}
          <div className="space-y-1 pt-2">
            <div className="flex justify-between text-[11px]">
              <span className="text-[#525252]">Padding Interno:</span>
              <span className="font-mono-data font-bold text-[#171717]">{style.paddingMm || 0} mm</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              step="1"
              value={style.paddingMm || 0}
              onChange={(e) => handleStyleChange({ paddingMm: parseInt(e.target.value) })}
              className="w-full h-2 bg-[#E5E5E5] rounded-xs appearance-none cursor-pointer accent-[#2563EB]"
            />
          </div>

          {/* Margem Inferior (Gap) */}
          <div className="space-y-1 pt-2">
            <div className="flex justify-between text-[11px]">
              <span className="text-[#525252]">Margem Abaixo do Bloco:</span>
              <span className="font-mono-data font-bold text-[#171717]">{style.marginBottomMm || 6} mm</span>
            </div>
            <input
              type="range"
              min="0"
              max="30"
              step="1"
              value={style.marginBottomMm ?? 6}
              onChange={(e) => handleStyleChange({ marginBottomMm: parseInt(e.target.value) })}
              className="w-full h-2 bg-[#E5E5E5] rounded-xs appearance-none cursor-pointer accent-[#2563EB]"
            />
          </div>

          {/* Bordas */}
          <div className="space-y-1 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-[#525252]">Borda Externa do Bloco:</label>
              <input
                type="checkbox"
                checked={style.showBorder || false}
                onChange={(e) => handleStyleChange({ showBorder: e.target.checked })}
                className="h-4 w-4 text-[#2563EB]"
              />
            </div>
            {style.showBorder && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="color"
                  value={style.borderColor || '#D4D4D4'}
                  onChange={(e) => handleStyleChange({ borderColor: e.target.value })}
                  className="w-6 h-6 p-0 border border-[#D4D4D4]"
                />
                <select
                  value={style.borderStyle || 'solid'}
                  onChange={(e) => handleStyleChange({ borderStyle: e.target.value as any })}
                  className="flex-1 h-7 text-[11px] border border-[#D4D4D4] bg-white"
                >
                  <option value="solid">Linha Contínua</option>
                  <option value="dashed">Tracejada</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inspector Footer */}
      <div className="p-3 border-t border-[#D4D4D4] bg-[#FAFAFA] flex items-center justify-between">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 text-[11px] text-[#737373] hover:text-[#171717]"
        >
          <RotateCcw className="w-3 h-3" />
          Restaurar Padrão
        </button>

        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 px-3 py-1 bg-[#1A1A2E] text-white text-xs font-semibold hover:bg-[#2D2D44]"
        >
          <Check className="w-3 h-3" />
          Aplicar
        </button>
      </div>
    </div>
  )
}

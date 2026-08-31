'use client'

import React, { useState } from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import { CatalogPreset } from '../../lib/types/catalog-builder'
import {
  Palette,
  Check,
  Plus,
  Save,
  Building,
  Globe,
  Phone,
  Mail,
  Sliders,
  Sparkles,
} from 'lucide-react'

export const PresetManager: React.FC = () => {
  const {
    presets,
    loadPreset,
    saveCurrentAsPreset,
    designTokens,
    setDesignTokens,
    contact,
    setContact,
  } = useEditorStore()

  const [activeSubTab, setActiveSubTab] = useState<'themes' | 'custom' | 'contact'>('themes')
  const [newPresetName, setNewPresetName] = useState('')
  const [newPresetDesc, setNewPresetDesc] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [appliedPresetId, setAppliedPresetId] = useState<string | null>(null)

  const handleApplyPreset = (preset: CatalogPreset) => {
    loadPreset(preset)
    setAppliedPresetId(preset.id)
    setTimeout(() => setAppliedPresetId(null), 2500)
  }

  const handleSavePreset = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPresetName.trim()) return

    saveCurrentAsPreset(newPresetName.trim(), newPresetDesc.trim() || 'Preset personalizado')
    setNewPresetName('')
    setNewPresetDesc('')
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  const handleColorChange = (key: string, value: string) => {
    setDesignTokens({
      ...designTokens,
      colors: {
        ...designTokens.colors,
        [key]: value,
      },
    })
  }

  const handleContactChange = (key: string, value: string) => {
    setContact({
      ...contact,
      [key]: value,
    })
  }

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF] overflow-hidden select-none">
      {/* Header Subtabs */}
      <div className="flex border-b border-[#D4D4D4] bg-[#FAFAFA] text-[10.5px] sm:text-xs font-semibold shrink-0">
        <button
          type="button"
          onClick={() => setActiveSubTab('themes')}
          className={`flex-1 py-2.5 px-1 sm:px-2 text-center border-b-2 transition-colors flex items-center justify-center gap-1 sm:gap-1.5 ${
            activeSubTab === 'themes'
              ? 'border-[#003366] text-[#003366] bg-[#FFFFFF]'
              : 'border-transparent text-[#737373] hover:text-[#171717]'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          <span>Temas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('custom')}
          className={`flex-1 py-2.5 px-1 sm:px-2 text-center border-b-2 transition-colors flex items-center justify-center gap-1 sm:gap-1.5 ${
            activeSubTab === 'custom'
              ? 'border-[#003366] text-[#003366] bg-[#FFFFFF]'
              : 'border-transparent text-[#737373] hover:text-[#171717]'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Cores</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('contact')}
          className={`flex-1 py-2.5 px-1 sm:px-2 text-center border-b-2 transition-colors flex items-center justify-center gap-1 sm:gap-1.5 ${
            activeSubTab === 'contact'
              ? 'border-[#003366] text-[#003366] bg-[#FFFFFF]'
              : 'border-transparent text-[#737373] hover:text-[#171717]'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>Marca</span>
        </button>
      </div>

      {/* Tab 1: Galeria de Temas */}
      {activeSubTab === 'themes' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#525252] block">
              Galeria de Presets Visuais
            </span>
            <span className="text-[10px] text-[#737373]">
              Clique em qualquer tema para aplicar paleta de cores e tipografia instantaneamente.
            </span>
          </div>

          <div className="space-y-2.5">
            {presets.map((preset) => {
              const isApplied = appliedPresetId === preset.id
              const isCurrent =
                designTokens.colors.primary === preset.design_tokens.colors.primary &&
                designTokens.colors.headerBg === preset.design_tokens.colors.headerBg

              return (
                <div
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset)}
                  className={`p-3 border rounded-xs cursor-pointer transition-all ${
                    isCurrent
                      ? 'border-[#003366] bg-[#F0FDF4] shadow-xs'
                      : 'border-[#D4D4D4] bg-[#FAFAFA] hover:border-[#2563EB] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs text-[#171717]">
                      {preset.name}
                    </span>
                    {isApplied ? (
                      <span className="text-[10px] bg-[#22C55E] text-white font-bold px-1.5 py-0.5 rounded-xs flex items-center gap-1">
                        <Check className="w-3 h-3" /> Aplicado!
                      </span>
                    ) : isCurrent ? (
                      <span className="text-[10px] bg-[#E2E8F0] text-[#003366] font-bold px-1.5 py-0.5 rounded-xs">
                        Ativo
                      </span>
                    ) : null}
                  </div>

                  <p className="text-[10.5px] text-[#525252] leading-tight mb-2.5">
                    {preset.description}
                  </p>

                  {/* Color Palette Preview Strip */}
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-5 h-5 rounded-xs border border-black/10 shadow-xs"
                      style={{ backgroundColor: preset.design_tokens.colors.primary }}
                      title="Cor Primária"
                    />
                    <div
                      className="w-5 h-5 rounded-xs border border-black/10 shadow-xs"
                      style={{ backgroundColor: preset.design_tokens.colors.headerBg }}
                      title="Cabeçalho"
                    />
                    <div
                      className="w-5 h-5 rounded-xs border border-black/10 shadow-xs"
                      style={{ backgroundColor: preset.design_tokens.colors.accent }}
                      title="Destaque"
                    />
                    <div
                      className="w-5 h-5 rounded-xs border border-black/10 shadow-xs"
                      style={{ backgroundColor: preset.design_tokens.colors.surface }}
                      title="Superfície"
                    />
                    <span className="text-[9px] font-mono-data text-[#737373] ml-auto">
                      {preset.design_tokens.colors.primary}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Customizador de Cores */}
      {activeSubTab === 'custom' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#525252] block">
              Paleta de Cores da Marca
            </span>
            <span className="text-[10px] text-[#737373]">
              Personalize os tons exatos para refletir sua identidade visual.
            </span>
          </div>

          <div className="space-y-3">
            {/* Cor Primária */}
            <div className="flex items-center justify-between p-2 border border-[#E5E5E5] bg-[#FAFAFA]">
              <div>
                <label className="text-xs font-bold text-[#171717] block">Cor Primária</label>
                <span className="text-[10px] text-[#737373]">Logo, títulos e bordas</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={designTokens.colors.primary}
                  onChange={(e) => handleColorChange('primary', e.target.value)}
                  className="w-8 h-8 rounded-xs cursor-pointer border border-[#D4D4D4] p-0.5 bg-white"
                />
                <span className="text-xs font-mono-data font-semibold text-[#171717] w-18">
                  {designTokens.colors.primary}
                </span>
              </div>
            </div>

            {/* Cabeçalho */}
            <div className="flex items-center justify-between p-2 border border-[#E5E5E5] bg-[#FAFAFA]">
              <div>
                <label className="text-xs font-bold text-[#171717] block">Cabeçalho de Tabelas</label>
                <span className="text-[10px] text-[#737373]">Fundo das linhas de título</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={designTokens.colors.headerBg}
                  onChange={(e) => handleColorChange('headerBg', e.target.value)}
                  className="w-8 h-8 rounded-xs cursor-pointer border border-[#D4D4D4] p-0.5 bg-white"
                />
                <span className="text-xs font-mono-data font-semibold text-[#171717] w-18">
                  {designTokens.colors.headerBg}
                </span>
              </div>
            </div>

            {/* Cor de Destaque */}
            <div className="flex items-center justify-between p-2 border border-[#E5E5E5] bg-[#FAFAFA]">
              <div>
                <label className="text-xs font-bold text-[#171717] block">Cor de Destaque</label>
                <span className="text-[10px] text-[#737373]">Subtítulos e ícones</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={designTokens.colors.accent}
                  onChange={(e) => handleColorChange('accent', e.target.value)}
                  className="w-8 h-8 rounded-xs cursor-pointer border border-[#D4D4D4] p-0.5 bg-white"
                />
                <span className="text-xs font-mono-data font-semibold text-[#171717] w-18">
                  {designTokens.colors.accent}
                </span>
              </div>
            </div>

            {/* Superfície */}
            <div className="flex items-center justify-between p-2 border border-[#E5E5E5] bg-[#FAFAFA]">
              <div>
                <label className="text-xs font-bold text-[#171717] block">Fundo de Blocos</label>
                <span className="text-[10px] text-[#737373]">Superfície das caixas</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={designTokens.colors.surface}
                  onChange={(e) => handleColorChange('surface', e.target.value)}
                  className="w-8 h-8 rounded-xs cursor-pointer border border-[#D4D4D4] p-0.5 bg-white"
                />
                <span className="text-xs font-mono-data font-semibold text-[#171717] w-18">
                  {designTokens.colors.surface}
                </span>
              </div>
            </div>
          </div>

          {/* Form Salvar como Novo Preset */}
          <div className="pt-3 border-t border-[#E5E5E5] space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#525252] block">
              Salvar Estilo Atual como Preset
            </span>
            <form onSubmit={handleSavePreset} className="space-y-2">
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Nome do Preset (ex: Minha Empresa V1)"
                className="w-full h-8 px-2 text-xs bg-white border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
              />
              <input
                type="text"
                value={newPresetDesc}
                onChange={(e) => setNewPresetDesc(e.target.value)}
                placeholder="Descrição (opcional)"
                className="w-full h-8 px-2 text-xs bg-white border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newPresetName.trim()}
                className="w-full h-8 bg-[#003366] hover:bg-[#002244] disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar Preset
              </button>
            </form>

            {saveSuccess && (
              <div className="p-2 bg-[#F0FDF4] border border-[#86EFAC] text-[#166534] text-xs font-semibold flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                Preset salvo com sucesso na galeria!
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Dados de Contato e Marca */}
      {activeSubTab === 'contact' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#525252] block">
              Informações da Empresa
            </span>
            <span className="text-[10px] text-[#737373]">
              Estes dados são exibidos automaticamente no cabeçalho e rodapés dos catálogos.
            </span>
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="text-[10px] font-bold uppercase text-[#737373] block mb-1">
                Nome da Empresa
              </label>
              <div className="flex items-center gap-2 border border-[#D4D4D4] bg-white px-2 h-8">
                <Building className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                <input
                  type="text"
                  value={contact.companyName || ''}
                  onChange={(e) => handleContactChange('companyName', e.target.value)}
                  placeholder="Nome da sua empresa"
                  className="flex-1 text-xs outline-none bg-transparent"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-[#737373] block mb-1">
                Website
              </label>
              <div className="flex items-center gap-2 border border-[#D4D4D4] bg-white px-2 h-8">
                <Globe className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                <input
                  type="text"
                  value={contact.website || ''}
                  onChange={(e) => handleContactChange('website', e.target.value)}
                  placeholder="www.suaempresa.com.br"
                  className="flex-1 text-xs outline-none bg-transparent"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-[#737373] block mb-1">
                Telefone Comercial
              </label>
              <div className="flex items-center gap-2 border border-[#D4D4D4] bg-white px-2 h-8">
                <Phone className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                <input
                  type="text"
                  value={contact.phone || ''}
                  onChange={(e) => handleContactChange('phone', e.target.value)}
                  placeholder="+55 (11) 0000-0000"
                  className="flex-1 text-xs outline-none bg-transparent"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-[#737373] block mb-1">
                E-mail Comercial
              </label>
              <div className="flex items-center gap-2 border border-[#D4D4D4] bg-white px-2 h-8">
                <Mail className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                <input
                  type="text"
                  value={contact.email || ''}
                  onChange={(e) => handleContactChange('email', e.target.value)}
                  placeholder="vendas@suaempresa.com.br"
                  className="flex-1 text-xs outline-none bg-transparent"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

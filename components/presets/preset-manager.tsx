'use client'

import { useState } from 'react'
import { useEditorStore } from '@/features/editor/editor-store'
import type { CatalogPreset } from '@/lib/types/catalog-builder'
import { DOCUMENT_TEMPLATES, orderTemplatePages } from '@/lib/catalog/templates'
import { ImageUploader } from '../ui/image-uploader'

const input = 'w-full rounded border border-gray-300 bg-white px-2 py-2 text-xs'

export function PresetManager() {
  const { presets, loadPreset, saveCurrentAsPreset, designTokens, setDesignTokens, contact, setContact } = useEditorStore()
  const [tab, setTab] = useState('templates')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [notice, setNotice] = useState('')
  const applyStructure = (preset: CatalogPreset) => {
    if (!window.confirm(`Substituir as páginas pelo modelo "${preset.name}"? Os dados dos produtos não serão alterados. Você poderá desfazer.`)) return
    loadPreset(preset)
    setNotice(`Estrutura ${preset.name} aplicada.`)
  }
  return <div className="flex h-full flex-col overflow-hidden bg-white">
    <nav className="flex shrink-0 border-b" aria-label="Configuração do documento">{[['templates','Modelos'],['design','Estilo'],['brand','Marca']].map(([value,label]) => <button type="button" key={value} onClick={() => setTab(value)} className={`flex-1 py-3 text-xs font-semibold ${tab === value ? 'border-b-2 border-blue-700 text-blue-800' : 'text-gray-500'}`}>{label}</button>)}</nav>
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {notice && <p role="status" className="rounded bg-green-50 p-2 text-xs text-green-800">{notice}</p>}
      {tab === 'templates' && <>
        <p className="text-xs text-gray-600">Modelos reutilizam a estrutura. Dados técnicos permanecem vinculados ao cadastro do produto.</p>
        {DOCUMENT_TEMPLATES.map(template => <article key={template.id} className="space-y-2 rounded border bg-gray-50 p-3"><h3 className="text-xs font-bold">{template.name}</h3><p className="text-[11px] text-gray-600">{template.description}</p><button type="button" className="rounded bg-slate-900 px-3 py-2 text-xs text-white" onClick={() => applyStructure({ id: template.id, name: template.name, description: template.description, default_pages: orderTemplatePages(template.createPages()), design_tokens: designTokens, contact, is_system: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })}>Usar estrutura</button></article>)}
        <h3 className="border-t pt-3 text-xs font-bold">Presets salvos</h3>
        {presets.map(preset => <article key={preset.id} className="space-y-2 rounded border p-3"><h4 className="text-xs font-semibold">{preset.name}</h4><p className="text-[11px] text-gray-600">{preset.description}</p><div className="flex gap-1">{Object.values(preset.design_tokens.colors).slice(0,5).map((color,index) => <span key={index} className="h-4 w-4 rounded border" style={{ backgroundColor: color }} />)}</div><div className="flex flex-wrap gap-2"><button type="button" className="rounded border px-2 py-1 text-[11px]" onClick={() => { setDesignTokens(preset.design_tokens); setNotice('Estilo aplicado. Páginas e conteúdo preservados.') }}>Aplicar só estilo</button><button type="button" className="rounded border px-2 py-1 text-[11px]" onClick={() => applyStructure(preset)}>Usar estrutura completa</button></div></article>)}
        <form className="space-y-2 border-t pt-3" onSubmit={event => { event.preventDefault(); if (!name.trim()) return; saveCurrentAsPreset(name.trim(), description.trim()); setName(''); setDescription(''); setNotice('Preset adicionado ao workspace. A sincronização segue o status de salvamento.') }}><h3 className="text-xs font-bold">Salvar documento como modelo</h3><input aria-label="Nome do modelo" className={input} placeholder="Nome do modelo" required value={name} onChange={event => setName(event.target.value)} /><input aria-label="Descrição do modelo" className={input} placeholder="Descrição" value={description} onChange={event => setDescription(event.target.value)} /><button type="submit" className="rounded bg-blue-800 px-3 py-2 text-xs text-white">Salvar modelo atual</button></form>
      </>}
      {tab === 'design' && <>
        <h3 className="text-xs font-bold">Cores corporativas</h3>
        {Object.entries({primary:'Cor principal',dark:'Títulos escuros',accent:'Destaque',headerBg:'Fundo do cabeçalho',headerText:'Texto do cabeçalho',surface:'Fundo dos blocos',border:'Bordas'}).map(([key,label]) => <label key={key} className="flex items-center justify-between gap-2 text-xs">{label}<input aria-label={label} type="color" value={designTokens.colors[key] ?? '#ffffff'} onChange={event => setDesignTokens({ ...designTokens, colors: { ...designTokens.colors, [key]: event.target.value } })} /></label>)}
        <h3 className="border-t pt-3 text-xs font-bold">Tipografia</h3>
        {Object.entries({heading:'Títulos',body:'Texto',data:'Dados técnicos'}).map(([key,label]) => <label key={key} className="block space-y-1 text-xs">{label}<select className={input} value={designTokens.fonts[key]} onChange={event => setDesignTokens({ ...designTokens, fonts: { ...designTokens.fonts, [key]: event.target.value } })}>{[...new Set([designTokens.fonts[key],'Arial, sans-serif','Calibri, sans-serif','Georgia, serif','Consolas, monospace'])].map(font => <option key={font} value={font}>{font}</option>)}</select></label>)}
        <h3 className="border-t pt-3 text-xs font-bold">Dimensões reais do documento</h3>
        {[{key:'pageMarginMm',label:'Margens da página (mm)',min:5,max:30},{key:'sectionGapMm',label:'Espaço entre blocos (mm)',min:0,max:15},{key:'cellHeightPx',label:'Altura mínima de célula (px)',min:16,max:64}].map(item => <label key={item.key} className="block space-y-1 text-xs">{item.label}<input className={input} type="number" min={item.min} max={item.max} value={designTokens.spacing[item.key]} onChange={event => setDesignTokens({ ...designTokens, spacing: { ...designTokens.spacing, [item.key]: Math.max(item.min, Math.min(item.max, Number(event.target.value))) } })} /></label>)}
      </>}
      {tab === 'brand' && <>
        <p className="text-xs text-gray-600">Identidade e contatos comuns aos documentos. Rodapés podem ter uma substituição editorial explícita.</p>
        {[['companyName','Empresa'],['website','Website'],['phone','Telefone'],['email','E-mail'],['address','Endereço']].map(([key,label]) => <label key={key} className="block space-y-1 text-xs">{label}<input className={input} value={contact[key] ?? ''} onChange={event => setContact({ ...contact, [key]: event.target.value })} /></label>)}
        <ImageUploader images={contact.logoUrl ? [contact.logoUrl] : []} onChange={images => setContact({ ...contact, logoUrl: images[0] ?? '' })} maxImages={1} label="Logo corporativo" productSku="brand" />
      </>}
    </div>
  </div>
}

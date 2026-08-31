'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, Copy, X } from 'lucide-react'
import { useEditorStore } from '@/features/editor/editor-store'
import { SECTION_TYPE_CATALOG, createSectionId } from '@/lib/types/catalog-builder'
import { moveSectionIndices } from '@/lib/catalog/section-data'

export function PageManager() {
  const { pages, selectedPageId, setSelectedPageId, addPage, removePage, reorderPages, updatePage, addSection, removeSection, reorderSections, updateSection } = useEditorStore()
  const [pickerPageId, setPickerPageId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  return <div className="flex h-full flex-col overflow-hidden bg-white">
    <header className="flex items-center justify-between border-b p-3"><h2 className="text-xs font-bold">Páginas ({pages.length})</h2><button type="button" onClick={() => addPage()} className="flex items-center gap-1 rounded bg-slate-900 px-2 py-1 text-xs text-white"><Plus size={12} />Página</button></header>
    <div className="flex-1 divide-y overflow-auto">{pages.map((page,index) => <section key={page.id} className={`p-3 ${selectedPageId === page.id ? 'bg-blue-50' : ''}`}>
      <button type="button" onClick={() => setSelectedPageId(page.id)} className="mb-2 text-left text-xs font-bold">{index+1}. {page.title}{!page.visible && ' (oculta)'}</button>
      <input aria-label={`Título da página ${index+1}`} value={page.title} onChange={event => updatePage(page.id,{title:event.target.value})} className="mb-2 w-full rounded border border-gray-300 bg-white p-1 text-xs" />
      <div className="mb-2 flex items-center gap-3 text-gray-600">
        <button type="button" aria-label={page.visible ? 'Ocultar página' : 'Mostrar página'} onClick={() => updatePage(page.id,{visible:!page.visible})}>{page.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
        <button type="button" disabled={!index} aria-label="Subir página" onClick={() => reorderPages(index,index-1)} className="disabled:opacity-25"><ChevronUp size={15} /></button>
        <button type="button" disabled={index===pages.length-1} aria-label="Descer página" onClick={() => reorderPages(index,index+1)} className="disabled:opacity-25"><ChevronDown size={15} /></button>
        <button type="button" aria-label="Duplicar página" onClick={() => addPage(`${page.title} (cópia)`,page.sections.map(section => ({...structuredClone(section),id:createSectionId()})))}><Copy size={13} /></button>
        <button type="button" aria-label="Remover página" onClick={() => removePage(page.id)} className="text-red-700"><Trash2 size={13} /></button>
      </div>
      {selectedPageId === page.id && <div className="space-y-2 border-t pt-2">{page.sections.toSorted((a,b) => a.sort_order-b.sort_order).map((section,sectionIndex,ordered) => {
        const move = (offset: number) => { const target=ordered[sectionIndex+offset]; if (!target) return; const indices=moveSectionIndices(page.sections,section.id,target.id); if(indices)reorderSections(page.id,...indices) }
        return <div key={section.id} className="rounded border bg-white p-2 text-xs"><span className="block truncate font-medium">{section.title}</span><div className="mt-2 flex items-center gap-3 text-gray-500"><button type="button" aria-label={section.visible?'Ocultar bloco':'Mostrar bloco'} onClick={() => updateSection(page.id,section.id,{visible:!section.visible})}>{section.visible?<Eye size={12}/>:<EyeOff size={12}/>}</button><button type="button" disabled={!sectionIndex} aria-label="Subir bloco" onClick={() => move(-1)} className="disabled:opacity-25"><ChevronUp size={13}/></button><button type="button" disabled={sectionIndex===ordered.length-1} aria-label="Descer bloco" onClick={() => move(1)} className="disabled:opacity-25"><ChevronDown size={13}/></button><button type="button" aria-label="Duplicar bloco" onClick={() => updatePage(page.id,{sections:[...page.sections,{...structuredClone(section),id:createSectionId(),sort_order:page.sections.length}]})}><Copy size={12}/></button><button type="button" aria-label="Remover bloco" onClick={() => removeSection(page.id,section.id)} className="text-red-700"><Trash2 size={12}/></button></div></div>
      })}<button type="button" onClick={() => {setSearch('');setPickerPageId(page.id)}} className="w-full rounded border border-blue-200 p-2 text-xs font-semibold text-blue-800">+ Adicionar bloco</button></div>}
    </section>)}</div>
    {pickerPageId && createPortal(<div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-label="Biblioteca de blocos" className="flex max-h-[85vh] w-full max-w-xl flex-col rounded bg-white shadow-xl"><header className="flex items-center justify-between border-b p-4"><h2 className="text-sm font-bold">Biblioteca de blocos</h2><button type="button" aria-label="Fechar biblioteca" onClick={() => setPickerPageId(null)}><X size={18}/></button></header><input autoFocus aria-label="Buscar bloco" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar bloco por nome ou finalidade" className="m-4 rounded border p-2 text-sm"/><div className="grid grid-cols-1 gap-2 overflow-y-auto p-4 sm:grid-cols-2">{SECTION_TYPE_CATALOG.filter(info => `${info.label} ${info.description}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(info => <button type="button" key={info.type} onClick={() => {addSection(pickerPageId,info.type);setPickerPageId(null)}} className="rounded border p-3 text-left hover:border-blue-400 hover:bg-blue-50"><strong className="text-xs">{info.label}</strong><p className="mt-1 text-[11px] text-gray-600">{info.description}</p></button>)}</div></section></div>,document.body)}
  </div>
}

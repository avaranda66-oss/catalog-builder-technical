'use client'

import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useEditorStore } from '@/features/editor/editor-store'
import type { PageSection, SectionStyle } from '@/lib/types/catalog-builder'

interface Props { pageId: string; section: PageSection | null; onClose: () => void }
const control = 'w-full rounded border border-gray-300 bg-white px-2 py-2 text-xs'

export function BlockInspector({ pageId, section, onClose }: Props) {
  const { updateSection } = useEditorStore()
  if (!section) return null
  const style = section.style ?? {}
  const update = (patch: Partial<SectionStyle>) => updateSection(pageId, section.id, { style: { ...style, ...patch } })
  return createPortal(<aside aria-label="Personalizar bloco" className="no-print fixed inset-y-0 right-0 z-50 flex w-80 max-w-full flex-col border-l bg-white shadow-2xl">
    <header className="flex items-center justify-between border-b p-4"><h2 className="text-sm font-bold">Personalizar bloco</h2><button type="button" aria-label="Fechar painel" onClick={onClose}><X size={18} /></button></header>
    <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
      <label className="block space-y-1">Título<input className={control} value={section.title} onChange={event => updateSection(pageId,section.id,{title:event.target.value})} /></label>
      <label className="flex gap-2"><input type="checkbox" checked={style.hideHeader ?? false} onChange={event => update({hideHeader:event.target.checked})} />Ocultar título do bloco</label>
      {[['accentColor','Destaque','#003366'],['textColor','Texto','#262626'],['backgroundColor','Fundo','#ffffff']].map(([key,label,fallback]) => <label key={key} className="flex items-center justify-between">{label}<input type="color" aria-label={label} value={String(style[key as keyof SectionStyle] ?? fallback)} onChange={event => update({[key]:event.target.value})} /></label>)}
      <button type="button" className="text-blue-800 underline" onClick={() => update({backgroundColor:'transparent'})}>Fundo transparente</button>
      {[{key:'titleFontSizePx',label:'Tamanho do título (px)',min:8,max:48,value:12},{key:'fontSizePx',label:'Tamanho do texto (px)',min:6,max:32,value:11},{key:'paddingMm',label:'Espaço interno (mm)',min:0,max:30,value:0},{key:'marginBottomMm',label:'Margem inferior (mm)',min:0,max:40,value:0}].map(item => <label key={item.key} className="block space-y-1">{item.label}<input className={control} type="number" min={item.min} max={item.max} value={Number(style[item.key as keyof SectionStyle] ?? item.value)} onChange={event => update({[item.key]:Math.max(item.min,Math.min(item.max,Number(event.target.value)))})} /></label>)}
      <label className="block space-y-1">Largura do bloco<select className={control} value={style.widthPercent ?? 100} onChange={event => update({widthPercent:Number(event.target.value)})}><option value={100}>Página inteira</option><option value={50}>Metade (2 colunas)</option><option value={33}>Um terço (3 colunas)</option></select></label>
      <label className="block space-y-1">Alinhamento<select className={control} value={style.align ?? 'left'} onChange={event => update({align:event.target.value as SectionStyle['align']})}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option><option value="justify">Justificado</option></select></label>
      <label className="flex gap-2"><input type="checkbox" checked={style.showBorder ?? false} onChange={event => update({showBorder:event.target.checked})} />Borda externa</label>
      {style.showBorder && <div className="space-y-2"><label className="flex justify-between">Cor da borda<input aria-label="Cor da borda" type="color" value={style.borderColor ?? '#d4d4d4'} onChange={event => update({borderColor:event.target.value})} /></label><label className="block">Espessura (px)<input className={control} type="number" min={0} max={10} value={style.borderWidthPx ?? 1} onChange={event => update({borderWidthPx:Math.max(0,Math.min(10,Number(event.target.value)))})} /></label><select aria-label="Estilo da borda" className={control} value={style.borderStyle ?? 'solid'} onChange={event => update({borderStyle:event.target.value as SectionStyle['borderStyle']})}><option value="solid">Contínua</option><option value="dashed">Tracejada</option></select></div>}
      <button type="button" className="rounded border px-3 py-2" onClick={() => updateSection(pageId,section.id,{style:{}})}>Restaurar estilo herdado</button>
    </div>
  </aside>, document.body)
}

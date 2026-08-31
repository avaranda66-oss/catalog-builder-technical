'use client'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore,type SaveStatus } from '../../features/editor/editor-store'
import { AlertCircle,CheckCircle2,Database } from 'lucide-react'
const labels:Record<SaveStatus,string>={saved:'Sincronizado com a equipe',local:'Salvo somente neste dispositivo',saving:'Gravando revisão…',unsaved:'Alterações pendentes',error:'Falha ao salvar — dados mantidos no editor',conflict:'Conflito com outra revisão — requer reconciliação'}
export function StatusBar(){
  const {status,time,product,revision}=useEditorStore(useShallow(s=>({status:s.saveStatus,time:s.lastSavedAt,product:s.products.find(p=>p.id===s.selectedProductId),revision:s.catalog?.version})))
  const formatted=time?new Date(time).toLocaleTimeString('pt-BR'):''
  return <footer className="no-print flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2 text-[11px] text-slate-500"><span className="flex items-center gap-2"><Database size={13}/>{product?.sku??'Sem produto selecionado'} · Revisão {revision??0}</span><span role="status" className={'flex items-center gap-1.5 '+(status==='saved'?'text-emerald-700':status==='error'||status==='conflict'?'text-red-700':'text-slate-600')}>{status==='saved'?<CheckCircle2 size={13}/>:<AlertCircle size={13}/>} {labels[status]}{formatted?' · '+formatted:''}</span></footer>
}

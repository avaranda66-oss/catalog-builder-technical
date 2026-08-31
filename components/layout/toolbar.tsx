'use client'
import { useShallow } from 'zustand/react/shallow'
import { Save,Undo2,Redo2,Printer,Upload,Bot,History,Menu,Globe,LayoutDashboard,RefreshCw,LogOut,FileSpreadsheet,FormInput } from 'lucide-react'
import { useEditorStore } from '../../features/editor/editor-store'
import { saveWorkspace } from '../../features/editor/save-workspace'
interface Props {
  onOpenAiPanel:()=>void;onImportClick:()=>void;onOpenPdfImport:()=>void;onExportPdfClick:()=>void
  onOpenAuditModal?:()=>void;onOpenTranslate?:()=>void;onSyncCloud?:()=>void;onLogout?:()=>void
  onToggleSidebarMobile?:()=>void;onOpenDashboard?:()=>void
  mobileView?:'editor'|'preview';onChangeMobileView?:(v:'editor'|'preview')=>void
}
export function Toolbar(p:Props){
  const {catalog,mode,saveStatus,currentUser,localMode,canUndo,canRedo}=useEditorStore(useShallow(s=>({catalog:s.catalog,mode:s.mode,saveStatus:s.saveStatus,currentUser:s.currentUser,localMode:s.localMode,canUndo:s.history.length>0,canRedo:s.future.length>0})))
  const editable=localMode||!!currentUser&&currentUser.role!=='viewer'
  const clearError=()=>useEditorStore.getState().setLastError(null)
  const navigate=(callback?:()=>void)=>{clearError();callback?.()}
  const btn='inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium hover:bg-slate-50 disabled:opacity-40'
  return <header className="no-print shrink-0 border-b border-slate-200 bg-white">
    <div className="flex min-h-16 items-center justify-between gap-3 px-4">
      <div className="flex min-w-0 items-center gap-3"><button className={btn+' lg:hidden'} onClick={()=>navigate(p.onToggleSidebarMobile)} aria-label="Abrir navegação"><Menu size={17}/></button><button onClick={()=>navigate(p.onOpenDashboard)} className="rounded-md bg-[#003366] p-2 text-white" aria-label="Abrir dashboard"><LayoutDashboard size={22}/></button><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Catalog Builder</p><p className="max-w-80 truncate text-sm font-semibold">{catalog?.name??'Novo documento'}</p></div></div>
      <div className="flex items-center gap-2"><span className="hidden text-xs text-slate-500 md:block">{currentUser?currentUser.name+' · '+currentUser.role:localMode?'Modo local · sem sincronização':'Acesso restrito'}</span><button className={btn} onClick={p.onSyncCloud} disabled={!currentUser||localMode} aria-label="Atualizar da nuvem"><RefreshCw size={15}/></button><button className={btn} onClick={p.onLogout} aria-label={localMode?'Entrar na conta':'Sair da conta'}><LogOut size={15}/></button><button className="flex items-center gap-2 rounded-md bg-[#003366] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" onClick={()=>void saveWorkspace()} disabled={!editable||saveStatus==='saving'}><Save size={15}/>{saveStatus==='saving'?'Salvando…':'Salvar'}</button></div>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2">
      <button className={btn} onClick={()=>navigate(p.onOpenDashboard)}><LayoutDashboard size={14}/>Dashboard</button>
      <button className={btn+(mode==='form'?' border-blue-300 bg-blue-50':'')} onClick={()=>useEditorStore.getState().setMode('form')}><FormInput size={14}/>Formulário</button>
      <button className={btn+(mode==='grid'?' border-blue-300 bg-blue-50':'')} onClick={()=>useEditorStore.getState().setMode('grid')}><FileSpreadsheet size={14}/>Planilha</button>
      <span className="mx-1 h-5 border-l border-slate-200"/>
      <button className={btn} onClick={()=>useEditorStore.getState().undo()} disabled={!editable||!canUndo} aria-label="Desfazer"><Undo2 size={15}/></button><button className={btn} onClick={()=>useEditorStore.getState().redo()} disabled={!editable||!canRedo} aria-label="Refazer"><Redo2 size={15}/></button>
      <button className={btn} disabled={!editable} onClick={()=>navigate(p.onImportClick)}><Upload size={14}/>Excel / CSV</button><button className={btn} disabled={!editable} onClick={()=>navigate(p.onOpenPdfImport)}>Importar PDF</button>
      <button className={btn} disabled={!editable} onClick={()=>navigate(p.onOpenAiPanel)}><Bot size={14}/>Assistente</button><button className={btn} disabled={!editable} onClick={()=>navigate(p.onOpenTranslate)}><Globe size={14}/>Idiomas</button>
      <button className={btn} onClick={()=>navigate(p.onOpenAuditModal)}><History size={14}/>Atividade</button><button className={btn+' ml-auto'} onClick={()=>navigate(p.onExportPdfClick)}><Printer size={14}/>Prévia de impressão</button>
    </div>
  </header>
}

'use client'
import { useCallback,useEffect,useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '../features/editor/editor-store'
import { saveWorkspace,pullWorkspace,workspaceSnapshot } from '../features/editor/save-workspace'
import { getAuthenticatedUser,subscribeToAuth,signOutUser } from '../lib/supabase/auth'
import { openPrintDocument } from '../lib/pdf/print-document'
import { Toolbar } from '../components/layout/toolbar'
import { Sidebar } from '../components/layout/sidebar'
import { StatusBar } from '../components/layout/status-bar'
import { WorkspaceDashboard } from '../components/dashboard/workspace-dashboard'
import { ProductForm } from '../components/forms/product-form'
import { CatalogGrid } from '../components/data-grid/catalog-grid'
import { CatalogDocument } from '../components/preview/catalog-document'
import { AiPanel } from '../components/ai/ai-panel'
import { StagedChangesModal } from '../components/ai/staged-changes'
import { ExcelImportModal } from '../components/forms/excel-import-modal'
import { PdfImporterModal } from '../components/ai/pdf-importer-modal'
import { UserGateModal } from '../components/auth/user-gate-modal'
import { PasswordSetupModal } from '../components/auth/password-setup-modal'
import { AuditLogModal } from '../components/audit/audit-log-modal'
import { TranslationModal } from '../components/ai/translation-modal'
import { Loader2,AlertCircle,X } from 'lucide-react'
function getPasswordFlow(): 'invite' | 'recovery' | null {
  if (typeof window === 'undefined') return null
  const hashType = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type')
  const queryType = new URLSearchParams(window.location.search).get('type')
  const type = hashType || queryType
  return type === 'recovery' || type === 'invite' ? type : null
}
export default function CatalogBuilderApp(){
  const {mode,saveStatus,localRevision,currentUser,localMode,lastError,auditLogs}=useEditorStore(useShallow(s=>({mode:s.mode,saveStatus:s.saveStatus,localRevision:s.localRevision,currentUser:s.currentUser,localMode:s.localMode,lastError:s.lastError,auditLogs:s.auditLogs})))
  const [ready,setReady]=useState(false)
  const [view,setView]=useState<'dashboard'|'editor'>('dashboard')
  const [mobileView,setMobileView]=useState<'editor'|'preview'>('editor')
  const [modal,setModal]=useState<'ai'|'excel'|'pdf'|'audit'|'translate'|null>(null)
  const [sidebar,setSidebar]=useState(false)
  const [passwordFlow,setPasswordFlow]=useState(getPasswordFlow)
  const close=()=>setModal(null)
  useEffect(()=>{
    let active=true
    const accept=(user:Awaited<ReturnType<typeof getAuthenticatedUser>>)=>{
      if(!active)return
      useEditorStore.getState().setCurrentUser(user);setReady(true)
      if(user)void pullWorkspace()
    }
    void getAuthenticatedUser().then(accept).catch(()=>accept(null))
    const unsubscribe=subscribeToAuth(accept)
    return ()=>{active=false;unsubscribe()}
  },[])
  useEffect(()=>{
    if(saveStatus!=='unsaved'||(!currentUser&&!localMode))return
    const timer=setTimeout(()=>void saveWorkspace(),1800)
    return ()=>clearTimeout(timer)
  },[saveStatus,localRevision,currentUser,localMode])
  useEffect(()=>{
    if(!currentUser||localMode)return
    const sync=()=>{void pullWorkspace()}
    const online=()=>{const s=useEditorStore.getState();if(s.localRevision!==s.syncedRevision)void saveWorkspace();else sync()}
    const interval=setInterval(sync,60000)
    window.addEventListener('focus',sync);window.addEventListener('online',online)
    return ()=>{clearInterval(interval);window.removeEventListener('focus',sync);window.removeEventListener('online',online)}
  },[currentUser,localMode])
  useEffect(()=>{
    const leave=(e:BeforeUnloadEvent)=>{if(['unsaved','saving','error','conflict'].includes(useEditorStore.getState().saveStatus)){e.preventDefault();e.returnValue=''}}
    const keyboard=(e:KeyboardEvent)=>{if(!(e.ctrlKey||e.metaKey))return;if(e.key.toLowerCase()==='s'){e.preventDefault();void saveWorkspace()}else if(e.key.toLowerCase()==='z'&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){e.preventDefault();if(e.shiftKey)useEditorStore.getState().redo();else useEditorStore.getState().undo()}}
    window.addEventListener('beforeunload',leave);window.addEventListener('keydown',keyboard)
    return ()=>{window.removeEventListener('beforeunload',leave);window.removeEventListener('keydown',keyboard)}
  },[])
  const print=useCallback(async()=>{
    try{const s=useEditorStore.getState();await openPrintDocument({...workspaceSnapshot(),selectedProductId:s.selectedProductId})}
    catch(e){useEditorStore.getState().setLastError(e instanceof Error?e.message:'Falha ao preparar impressão.')}
  },[])
  const logout=async()=>{
    const s=useEditorStore.getState()
    if(s.localMode){s.setLocalMode(false);return}
    if(s.saveStatus==='unsaved'||s.saveStatus==='saving'){
      const result=await saveWorkspace();if(result.status==='error'||result.status==='conflict')return
    }
    try{await signOutUser();s.setCurrentUser(null);s.setLocalMode(false)}
    catch(e){s.setLastError(e instanceof Error?e.message:'Não foi possível sair.')}
  }
  const finishInvite=()=>{
    window.history.replaceState({}, document.title, window.location.pathname)
    setPasswordFlow(null)
  }
  if(!ready)return <div className="flex h-screen items-center justify-center gap-3 bg-slate-50 text-sm text-slate-600"><Loader2 className="animate-spin" size={20}/>Preparando workspace seguro…</div>
  const readOnly=!localMode&&currentUser?.role==='viewer'
  return <div className="flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-900">
    <Toolbar onOpenDashboard={()=>{useEditorStore.getState().setLastError(null);setView('dashboard')}} onOpenAiPanel={()=>setModal('ai')} onImportClick={()=>setModal('excel')} onOpenPdfImport={()=>setModal('pdf')} onExportPdfClick={()=>void print()} onOpenAuditModal={()=>setModal('audit')} onOpenTranslate={()=>setModal('translate')} onSyncCloud={()=>void pullWorkspace()} onLogout={()=>void logout()} onToggleSidebarMobile={()=>{setView('editor');setSidebar(v=>!v)}}/>
    {lastError&&<div role="alert" className="no-print flex flex-wrap items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900"><AlertCircle size={16}/><span className="flex-1">{lastError}</span>{currentUser&&<button className="rounded border border-red-200 px-2 py-1" onClick={()=>void saveWorkspace()}>Tentar salvar</button>}{currentUser&&<button className="rounded border border-red-200 px-2 py-1" onClick={()=>void pullWorkspace({preserveLocalCopy:true})}>Preservar cópia local e carregar nuvem</button>}<button aria-label="Fechar aviso" onClick={()=>useEditorStore.getState().setLastError(null)}><X size={15}/></button></div>}
    {view==='dashboard'?<WorkspaceDashboard onEdit={()=>setView('editor')} onImport={()=>setModal('excel')} onAi={()=>setModal('ai')}/>:<div className="flex min-h-0 flex-1">
      <Sidebar isOpenMobile={sidebar} onCloseMobile={()=>setSidebar(false)}/>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="no-print flex border-b bg-white p-2 lg:hidden"><button className={'flex-1 p-2 text-xs '+(mobileView==='editor'?'font-bold text-blue-800':'')} onClick={()=>setMobileView('editor')}>Editar conteúdo</button><button className={'flex-1 p-2 text-xs '+(mobileView==='preview'?'font-bold text-blue-800':'')} onClick={()=>setMobileView('preview')}>Visualizar páginas</button></div>
        <div className="flex min-h-0 flex-1"><fieldset disabled={readOnly} className={'min-w-0 flex-1 overflow-auto border-r border-slate-200 bg-white lg:w-[45%] lg:flex-none '+(mobileView==='editor'?'flex':'hidden lg:flex')}>{mode==='form'?<ProductForm/>:<CatalogGrid/>}</fieldset><div className={'min-w-0 flex-1 flex-col '+(mobileView==='preview'?'flex':'hidden lg:flex')}><CatalogDocument/></div></div>
      </main>
    </div>}
    <StatusBar/>
    {!localMode&&<UserGateModal currentUser={currentUser} onLogin={user=>{useEditorStore.getState().setCurrentUser(user);void pullWorkspace()}} onLocalMode={()=>useEditorStore.getState().setLocalMode(true)}/>}
    <AuditLogModal isOpen={modal==='audit'} onClose={close} logs={auditLogs}/>
    <AiPanel isOpen={modal==='ai'} onClose={close} onOpenPdfImport={()=>setModal('pdf')}/>
    <StagedChangesModal/>
    <ExcelImportModal isOpen={modal==='excel'} onClose={close}/>
    <PdfImporterModal isOpen={modal==='pdf'} onClose={close}/>
    <TranslationModal isOpen={modal==='translate'} onClose={close}/>
    {passwordFlow&&currentUser&&<PasswordSetupModal variant={passwordFlow} onComplete={finishInvite}/>}
  </div>
}

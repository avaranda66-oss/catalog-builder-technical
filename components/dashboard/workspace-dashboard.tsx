'use client'
import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { useShallow } from 'zustand/react/shallow'
import { ArrowRight, Plus, Search, FileText, Package, Images, CheckCircle2, AlertCircle, LayoutDashboard, MessageSquare, RefreshCw, Download, Sparkles } from 'lucide-react'
import { useEditorStore, type WorkspaceData } from '../../features/editor/editor-store'
import { saveWorkspace, pullWorkspace, workspaceSnapshot } from '../../features/editor/save-workspace'
import { createCatalog, fetchCatalogs, fetchProductLibrary, fetchCatalogVersions, type CatalogVersion } from '../../lib/supabase/api'
import { productQuality, documentIssues } from '../../lib/catalog/product-quality'
import { createPage, createSection } from '../../lib/types/catalog-builder'
import type { Catalog, ProductMedia } from '../../lib/types/database'
import type { CatalogPage, ContactInfo, DesignTokens } from '../../lib/types/catalog-builder'
import { ImageUploader } from '../ui/image-uploader'
import { openPrintDocument } from '../../lib/pdf/print-document'

const statuses: Record<string,string>={draft:'Rascunho',review:'Em revisão',approved:'Aprovado',published:'Publicado',archived:'Arquivado'}
const input='w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
const button='inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40'
const primary='inline-flex items-center justify-center gap-2 rounded-md bg-[#003366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#064778] disabled:opacity-40'
interface Props {onEdit:()=>void;onImport:()=>void;onAi:()=>void}
export function WorkspaceDashboard({onEdit,onImport,onAi}:Props) {
  const {catalog,products,libraryProducts,localDocuments,pages,currentUser,localMode,dashboard,localRevision,syncedRevision}=useEditorStore(useShallow(s=>({catalog:s.catalog,products:s.products,libraryProducts:s.libraryProducts,localDocuments:s.localDocuments,pages:s.pages,currentUser:s.currentUser,localMode:s.localMode,dashboard:s.dashboard,localRevision:s.localRevision,syncedRevision:s.syncedRevision})))
  const [catalogs,setCatalogs]=useState<Catalog[]>([])
  const [versions,setVersions]=useState<CatalogVersion[]>([])
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [documentName,setDocumentName]=useState('')
  const [newProduct,setNewProduct]=useState({sku:'',name:'',family:''})
  const [comment,setComment]=useState('')
  const [commentSection,setCommentSection]=useState('')
  const [mediaProductId,setMediaProductId]=useState('')
  const [mediaKind,setMediaKind]=useState<ProductMedia['kind']>('photo')
  const [mediaTitle,setMediaTitle]=useState('')
  const editable=localMode||!!currentUser&&currentUser.role!=='viewer'
  const admin=currentUser?.role==='admin'&&!localMode
  const catalogId=catalog?.id
  const refresh=useCallback(async()=>{
    if(!currentUser||localMode)return
    try{
      const [docs,library]=await Promise.all([fetchCatalogs(),fetchProductLibrary({limit:500})])
      setCatalogs(docs);useEditorStore.getState().setLibraryProducts(library)
      if(catalogId)setVersions(await fetchCatalogVersions(catalogId))
    }catch(e){setMessage(e instanceof Error?e.message:'Falha ao consultar a equipe.')}
  },[currentUser,localMode,catalogId])
  useEffect(()=>{const timer=window.setTimeout(()=>void refresh(),0);return()=>window.clearTimeout(timer)},[refresh])
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await action()}catch(e){setMessage(e instanceof Error?e.message:'Operação não concluída.')}finally{setBusy(false)}}
  const quality=products.map(p=>({product:p,...productQuality(p)}))
  const incomplete=quality.filter(q=>q.missing.length||q.warnings.length)
  const issues=documentIssues(products)
  const docs=[...new Map([...catalogs,...localDocuments.flatMap(d=>d.catalog?[d.catalog]:[]),...(catalog?[catalog]:[])].map(c=>[c.id,c])).values()]
  const families=[...new Set(libraryProducts.map(p=>p.family).filter(Boolean))].sort()
  const filtered=libraryProducts.filter(p=>(p.sku+' '+p.name+' '+p.family).toLowerCase().includes(dashboard.search.toLowerCase())&&(!dashboard.family||p.family===dashboard.family)&&(!dashboard.status||p.status===dashboard.status))
  const workflow=catalog?.brand.workflow??{assignee:'',comments:[]}
  const mediaProduct=products.find(p=>p.id===mediaProductId)??products[0]
  const allMedia=products.flatMap(p=>{
    const assets=p.data.media??[]
    const refs=new Set(assets.map(a=>a.url))
    return [...assets,...(p.data.marketing?.images??[]).filter(url=>!refs.has(url)).map((url,i)=>({id:p.id+'-'+i,url,kind:'photo' as const,title:p.name,locale:catalog?.locale??'pt-BR',revision:String(p.version)}))].map(asset=>({product:p,asset}))
  })
  const openDocument=async(doc:Catalog)=>{
    if(doc.id===catalog?.id){onEdit();return}
    const s=useEditorStore.getState()
    if(s.saveStatus==='unsaved'||s.localRevision!==s.syncedRevision){
      const saved=await saveWorkspace()
      if(saved.status==='error'||saved.status==='conflict')throw Error(saved.error?.message??'Salve antes de trocar de documento.')
    }
    s.archiveCurrentDocument()
    const cached=s.localDocuments.find(d=>d.catalog?.id===doc.id)
    if(localMode&&cached)s.hydrateWorkspace(cached,'local')
    else if(!await pullWorkspace({catalogId:doc.id,preserveLocalCopy:true}))throw Error('Não foi possível abrir o documento.')
    onEdit()
  }
  const createDocument=async()=>{
    if(!documentName.trim())throw Error('Informe o nome do documento.')
    const s=useEditorStore.getState()
    if(s.saveStatus==='unsaved'){const r=await saveWorkspace();if(r.status==='error'||r.status==='conflict')throw Error('Salve o documento atual antes de criar outro.')}
    s.archiveCurrentDocument()
    const now=new Date().toISOString()
    const next=localMode?{...s.catalog!,id:crypto.randomUUID(),name:documentName.trim(),status:'draft' as const,version:0,created_at:now,updated_at:now,updated_by:null}:await createCatalog(documentName.trim())
    const data:WorkspaceData={catalog:next,products:[],fieldDefinitions:[],pages:[createPage('Apresentação',[createSection('text_block',{title:'Apresentação institucional',content:{text:''}})])],designTokens:s.designTokens,contact:s.contact,presets:s.presets}
    s.hydrateWorkspace(data,'local');setDocumentName('');onEdit()
  }
  const exportBackup=()=>{
    const blob=new Blob([JSON.stringify(workspaceSnapshot(),null,2)],{type:'application/json'})
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='catalog-builder-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  const submitStatus=async(status:Catalog['status'])=>{
    if(['approved','published'].includes(status)&&issues.length)throw Error('Resolva os problemas de dados antes de aprovar/publicar.')
    useEditorStore.getState().updateCatalog({status})
    const r=await saveWorkspace()
    if(r.status!=='cloud')throw Error(r.error?.message??'A transição foi guardada localmente; ainda não foi confirmada pela equipe.')
    setMessage('Etapa confirmada no servidor.');await refresh()
  }
  const addComment=()=>{
    if(!comment.trim()||!catalog)return
    useEditorStore.getState().updateCatalog({brand:{...catalog.brand,workflow:{...workflow,comments:[...workflow.comments,{id:crypto.randomUUID(),body:comment.trim(),authorId:currentUser?.id??null,authorName:currentUser?.name??'Edição local',createdAt:new Date().toISOString(),resolved:false,...(commentSection?{sectionId:commentSection}:{})}]}}})
    setComment('')
  }
  const printVersion=(v:CatalogVersion)=>{
    const s=v.snapshot
    if(!s.catalog)return
    const brand=s.catalog.brand as Record<string,unknown>
    const pages=Array.isArray(brand.pages)?brand.pages as CatalogPage[]:[]
    const designTokens=typeof brand.designTokens==='object'&&brand.designTokens?brand.designTokens as DesignTokens:useEditorStore.getState().designTokens
    const contact=typeof brand.contact==='object'&&brand.contact?brand.contact as ContactInfo:useEditorStore.getState().contact
    void openPrintDocument({catalog:s.catalog,products:s.products,pages,designTokens,contact,selectedProductId:s.products[0]?.id??null})
  }
  return <div className="flex-1 overflow-y-auto bg-[#f4f6f9]">
    <div className="mx-auto max-w-[1500px] px-5 py-7 lg:px-9">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-2 text-[11px] font-bold uppercase tracking-[.2em] text-slate-500">Presys · Publicações técnicas</p><h1 className="text-3xl font-semibold tracking-tight text-slate-900">Workspace da equipe</h1><p className="mt-2 text-sm text-slate-600">Produtos bem documentados. Publicações consistentes.</p></div>
        <div className="flex gap-2"><button className={button} onClick={onImport} disabled={!editable}><Download size={16}/>Importar dados</button><button className={primary} onClick={onEdit}><FileText size={16}/>Abrir editor<ArrowRight size={15}/></button></div>
      </div>
      {message&&<div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"><AlertCircle size={17}/>{message}<button className="ml-auto underline" onClick={()=>setMessage('')}>Fechar</button></div>}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[{label:'Produtos no documento',value:products.length,detail:libraryProducts.length+' no cadastro disponível',icon:Package},{label:'Páginas de conteúdo',value:pages.filter(p=>p.visible).length,detail:docs.length+' documento(s) disponível(is)',icon:FileText},{label:'Pendências de cadastro',value:incomplete.length,detail:'Completude e origem dos dados',icon:AlertCircle},{label:'Imagens e diagramas',value:allMedia.length,detail:localMode?'Armazenamento local explícito':'Biblioteca vinculada aos produtos',icon:Images}].map(card=><div key={card.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-xs font-medium text-slate-500">{card.label}<card.icon size={18} className="text-[#003366]"/></div><div className="mt-3 text-3xl font-semibold text-slate-900">{card.value}</div><p className="mt-2 text-xs text-slate-500">{card.detail}</p></div>)}
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <nav className="flex flex-wrap gap-1" aria-label="Áreas do workspace">{[{id:'overview',label:'Visão geral',icon:LayoutDashboard},{id:'products',label:'Produtos',icon:Package},{id:'media',label:'Mídia',icon:Images},{id:'review',label:'Revisão e versões',icon:CheckCircle2}].map(t=><button key={t.id} onClick={()=>useEditorStore.getState().setDashboard({view:t.id as typeof dashboard.view})} className={'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold '+(dashboard.view===t.id?'border-[#003366] text-[#003366]':'border-transparent text-slate-500 hover:text-slate-900')}><t.icon size={16}/>{t.label}</button>)}</nav>
        <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={dashboard.compact} onChange={e=>useEditorStore.getState().setDashboard({compact:e.target.checked})}/>Visualização compacta</label>
      </div>
      {dashboard.view==='overview'&&<div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold">Seus documentos</h2><button className={button} onClick={()=>void run(refresh)} disabled={busy||localMode}><RefreshCw size={14}/>Atualizar</button></div>
          <div className="space-y-2">{docs.map(doc=><button key={doc.id} disabled={busy} onClick={()=>void run(()=>openDocument(doc))} className={'flex w-full items-center gap-3 rounded-lg border text-left hover:border-blue-400 '+(dashboard.compact?'p-3':'p-4')+' '+(doc.id===catalog?.id?'border-blue-200 bg-blue-50/50':'border-slate-200')}><span className="rounded-lg bg-white p-3 text-[#003366]"><FileText size={22}/></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{doc.name}</strong><span className="mt-1 block text-xs text-slate-500">{statuses[doc.status]} · Revisão {doc.version}{doc.id===catalog?.id?' · Em edição':''}</span></span><ArrowRight size={17}/></button>)}</div>
          <form onSubmit={e=>{e.preventDefault();void run(createDocument)}} className="mt-5 flex gap-2"><input aria-label="Nome do novo documento" value={documentName} onChange={e=>setDocumentName(e.target.value)} className={input} placeholder="Nome do novo catálogo ou documento"/><button className={primary} disabled={!editable||busy}><Plus size={17}/>Criar</button></form>
        </section>
        <div className="space-y-5">
          <section className="rounded-xl bg-[#003366] p-6 text-white"><Sparkles size={23} className="mb-4 text-cyan-200"/><h2 className="text-lg font-semibold">Assistência com revisão humana</h2><p className="mt-2 text-sm leading-6 text-blue-100">Importe informações da fonte, revise propostas e mantenha as especificações sob controle.</p><button className="mt-5 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#003366]" onClick={onAi} disabled={!editable}>Abrir assistente</button></section>
          <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Qualidade do cadastro</h2><input aria-label="Exibir qualidade do cadastro" type="checkbox" checked={dashboard.showQuality} onChange={e=>useEditorStore.getState().setDashboard({showQuality:e.target.checked})}/></div>
          {dashboard.showQuality&&<div className="mt-4 space-y-4">{quality.length?quality.slice(0,6).map(q=><button key={q.product.id} className="block w-full text-left" onClick={()=>{useEditorStore.getState().setSelectedProductId(q.product.id);onEdit()}}><div className="flex justify-between text-xs"><strong>{q.product.sku}</strong><span>{q.score}% preenchido</span></div><div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-100"><div className="h-full bg-teal-600" style={{width:q.score+'%'}}/></div><p className="mt-1 text-[11px] text-slate-500">{q.missing.join(', ')||q.warnings[0]||'Campos básicos preenchidos'}</p></button>):<p className="text-sm text-slate-500">Adicione produtos para acompanhar a completude.</p>}</div>}</section>
        </div>
      </div>}
      {dashboard.view==='products'&&<section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap gap-3"><div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={17}/><input aria-label="Pesquisar produtos" className={input+' pl-9'} placeholder="Buscar por SKU, nome ou família" value={dashboard.search} onChange={e=>useEditorStore.getState().setDashboard({search:e.target.value})}/></div><select aria-label="Filtrar família" className={input+' max-w-52'} value={dashboard.family} onChange={e=>useEditorStore.getState().setDashboard({family:e.target.value})}><option value="">Todas as famílias</option>{families.map(f=><option key={f}>{f}</option>)}</select><select aria-label="Filtrar status" className={input+' max-w-48'} value={dashboard.status} onChange={e=>useEditorStore.getState().setDashboard({status:e.target.value})}><option value="">Todos os status</option>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
        <div className="overflow-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs text-slate-500"><tr><th className="p-3">SKU / Produto</th><th>Família</th><th>Situação</th><th>Completude</th><th className="text-right">Documento</th></tr></thead><tbody>{filtered.map(p=>{const linked=products.some(row=>row.id===p.id);return <tr key={p.id} className="border-b border-slate-100"><td className={dashboard.compact?'p-2':'p-4'}><strong className="block">{p.sku}</strong><span className="text-xs text-slate-500">{p.name}</span></td><td>{p.family}</td><td><span className="rounded bg-slate-100 px-2 py-1 text-xs">{statuses[p.status]}</span></td><td>{productQuality(p).score}%</td><td className="text-right"><button className={button} disabled={!linked&&!editable} onClick={()=>{if(!linked)useEditorStore.getState().linkProduct(p);useEditorStore.getState().setSelectedProductId(p.id);onEdit()}}>{linked?'Editar':'Vincular'}</button></td></tr>})}</tbody></table>{!filtered.length&&<p className="p-8 text-center text-sm text-slate-500">Nenhum produto com esses filtros.</p>}</div>
        <form className="mt-5 grid gap-2 md:grid-cols-[1fr_2fr_1fr_auto]" onSubmit={e=>{e.preventDefault();if(!catalog)return;useEditorStore.getState().addProduct({...newProduct,catalog_id:catalog.id,status:'draft',sort_order:products.length,data:{marketing:{title:newProduct.name,overview:'',features:[],images:[]},specs:[],electrical:[],general:[],accessories:[]}});if(!useEditorStore.getState().lastError){setNewProduct({sku:'',name:'',family:''});onEdit()}}}>
          <input required aria-label="SKU do produto" placeholder="SKU" className={input} value={newProduct.sku} onChange={e=>setNewProduct({...newProduct,sku:e.target.value})}/><input required aria-label="Nome do produto" placeholder="Nome do produto" className={input} value={newProduct.name} onChange={e=>setNewProduct({...newProduct,name:e.target.value})}/><input required aria-label="Família do produto" placeholder="Família" className={input} value={newProduct.family} onChange={e=>setNewProduct({...newProduct,family:e.target.value})}/><button className={primary} disabled={!editable}><Plus size={16}/>Cadastrar</button>
        </form>
        <p className="mt-3 text-xs text-slate-500">Vincular reutiliza o cadastro mestre. Remover do documento não exclui o produto da biblioteca.</p>
      </section>}
      {dashboard.view==='media'&&<section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Biblioteca dos produtos deste documento</h2>
        {allMedia.length?<div className={'grid gap-4 '+(dashboard.compact?'grid-cols-2 md:grid-cols-6':'grid-cols-2 md:grid-cols-4')}>{allMedia.map(({product,asset})=><article key={product.id+asset.id} className="overflow-hidden rounded-lg border border-slate-200"><div className="relative h-36 bg-slate-50"><Image src={asset.url} alt={asset.title||product.name} fill unoptimized className="object-contain p-3"/></div><div className="p-3"><strong className="block truncate text-xs">{asset.title||product.name}</strong><p className="mt-1 text-[11px] text-slate-500">{product.sku} · {asset.kind} · {asset.locale}</p><p className="text-[11px] text-slate-500">Revisão {asset.revision}</p></div></article>)}</div>:<p className="py-6 text-sm text-slate-500">Nenhuma imagem vinculada. Cadastre fotos e diagramas abaixo.</p>}
        {mediaProduct&&editable&&<div className="mt-6 space-y-3 border-t pt-5"><div className="grid gap-3 md:grid-cols-3"><select aria-label="Produto da mídia" className={input} value={mediaProduct.id} onChange={e=>setMediaProductId(e.target.value)}>{products.map(p=><option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}</select><select aria-label="Tipo de mídia" className={input} value={mediaKind} onChange={e=>setMediaKind(e.target.value as ProductMedia['kind'])}><option value="photo">Foto</option><option value="diagram">Diagrama</option><option value="drawing">Desenho</option><option value="certificate">Imagem de certificado</option></select><input aria-label="Título da mídia" className={input} placeholder="Legenda / identificação" value={mediaTitle} onChange={e=>setMediaTitle(e.target.value)}/></div><ImageUploader images={[]} label="Adicionar imagens classificadas" productSku={mediaProduct.sku} onChange={urls=>{const p=useEditorStore.getState().products.find(p=>p.id===mediaProduct.id);if(!p)return;const media=[...(p.data.media??[]),...urls.map(url=>({id:crypto.randomUUID(),url,title:mediaTitle,kind:mediaKind,locale:catalog?.locale??'pt-BR',revision:String(p.version)}))];useEditorStore.getState().updateProductData(p.id,'media',media);if(mediaKind==='photo')useEditorStore.getState().updateProductData(p.id,'marketing.images',[...(p.data.marketing?.images??[]),...urls])}}/></div>}
      </section>}
      {dashboard.view==='review'&&<div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Revisão do documento</h2><p className="text-sm text-slate-600">{catalog?.name} · <strong>{statuses[catalog?.status??'draft']}</strong></p><label className="block text-xs font-medium">Responsável<input className={input+' mt-1'} disabled={!editable} value={workflow.assignee} onChange={e=>catalog&&useEditorStore.getState().updateCatalog({brand:{...catalog.brand,workflow:{...workflow,assignee:e.target.value}}})} placeholder="Nome ou área responsável"/></label>
        {issues.length>0&&<ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>}
        <div className="flex flex-wrap gap-2"><button className={button} disabled={!editable||busy} onClick={()=>void run(()=>submitStatus('review'))}>Enviar para revisão</button><button className={button} disabled={!admin||busy||catalog?.status!=='review'} onClick={()=>void run(()=>submitStatus('approved'))}>Aprovar</button><button className={primary} disabled={!admin||busy||catalog?.status!=='approved'} onClick={()=>void run(()=>submitStatus('published'))}>Publicar versão</button></div><p className="text-xs leading-5 text-slate-500">Aprovação e publicação são confirmadas no servidor. O autor da última alteração não pode aprovar a própria revisão. Alterar conteúdo aprovado inicia novo rascunho.</p>
        <div className="border-t pt-4"><h3 className="mb-3 flex items-center gap-2 font-semibold"><MessageSquare size={16}/>Comentários</h3><div className="max-h-64 space-y-3 overflow-auto">{workflow.comments.map(c=><article key={c.id} className="rounded-md bg-slate-50 p-3"><div className="flex justify-between text-xs"><strong>{c.authorName}</strong><span>{c.resolved?'Resolvido':'Aberto'}</span></div><p className="mt-2 whitespace-pre-wrap text-sm">{c.body}</p>{c.sectionId&&<p className="mt-1 text-xs text-slate-500">Bloco: {pages.flatMap(p=>p.sections).find(b=>b.id===c.sectionId)?.title??c.sectionId}</p>}{editable&&!c.resolved&&<button className="mt-2 text-xs text-blue-700" onClick={()=>catalog&&useEditorStore.getState().updateCatalog({brand:{...catalog.brand,workflow:{...workflow,comments:workflow.comments.map(row=>row.id===c.id?{...row,resolved:true}:row)}}})}>Marcar como resolvido</button>}</article>)}</div><select aria-label="Bloco do comentário" className={input+' mt-3'} value={commentSection} onChange={e=>setCommentSection(e.target.value)}><option value="">Documento inteiro</option>{pages.flatMap(p=>p.sections).map(b=><option key={b.id} value={b.id}>{b.title}</option>)}</select><textarea className={input+' mt-2'} aria-label="Novo comentário" placeholder="Registre uma observação para a equipe" value={comment} onChange={e=>setComment(e.target.value)}/><button className={button+' mt-2'} disabled={!editable||!comment.trim()} onClick={addComment}>Adicionar comentário</button></div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Versões preservadas</h2><button className={button} disabled={localMode||busy} onClick={()=>void run(refresh)}><RefreshCw size={14}/></button></div><p className="mb-4 text-xs leading-5 text-slate-500">Cada revisão confirmada conserva os dados do documento. Imprimir uma versão histórica não altera o cadastro atual.</p>{versions.length?<div className="space-y-3">{versions.map(v=><div key={v.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><div><strong className="text-sm">Revisão {v.version} · {statuses[v.status]}</strong><p className="mt-1 text-xs text-slate-500">{new Date(v.created_at).toLocaleString('pt-BR')}</p><p className="text-xs text-slate-500">{v.summary}</p></div><button className={button} onClick={()=>void run(async()=>printVersion(v))}>Visualizar PDF</button></div>)}</div>:<p className="py-6 text-sm text-slate-500">{localMode?'Versões da equipe exigem conexão autenticada.':'Nenhuma revisão registrada ainda.'}</p>}<button className={button+' mt-5'} onClick={exportBackup}><Download size={15}/>Baixar cópia de segurança</button><p className="mt-3 text-xs text-slate-500">{localRevision!==syncedRevision?'Existem alterações locais ainda não confirmadas na nuvem.':'Nenhuma revisão local pendente.'}</p></section>
      </div>}
    </div>
  </div>
}

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { enablePatches, produceWithPatches, applyPatches, type Patch, type Draft } from 'immer'
import type { Product, Catalog, FieldDefinition, AiRun } from '../../lib/types/database'
import type { TeamUser, AuditLogItem } from '../../lib/types/auth-user'
import { type CatalogPage, type PageSection, type CatalogPreset, type DesignTokens, type ContactInfo, createSection, createPage, type SectionType } from '../../lib/types/catalog-builder'
import { PRESYS_DESIGN_TOKENS, PRESYS_CONTACT, DEFAULT_PAGES, SYSTEM_PRESETS, INITIAL_CATALOG, INITIAL_PRODUCTS, INITIAL_FIELD_DEFINITIONS } from '../../lib/data/initial-data'
import { validatePageSection, validateCatalogPage } from '../../lib/validators/catalog-schemas'
import { createQuotaTolerantStorage } from '../../lib/storage/safe-storage'
enablePatches()
export type EditorMode = 'form' | 'grid'
export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'local' | 'conflict'
export interface StagedPatch {
  id?: string; productId: string; baseVersion: number; summary: string
  changes: Array<{path: string; fieldLabel: string; oldValue: unknown; newValue: unknown; reason?: string; accepted?: boolean}>
}
export type NewProductPayload = Omit<Product, 'id'|'created_at'|'updated_at'|'version'|'updated_by'> & {updated_by?: string|null}
export interface WorkspaceData {
  catalog: Catalog|null; products: Product[]; fieldDefinitions: FieldDefinition[]
  pages: CatalogPage[]; designTokens: DesignTokens; contact: ContactInfo; presets: CatalogPreset[]
}
export interface EditorSnapshot extends WorkspaceData {selectedProductId: string|null; selectedPageId: string|null}
interface HistoryEntry {patches: Patch[]; inverse: Patch[]}
export interface DashboardPreferences {view:'overview'|'products'|'media'|'review';search:string;family:string;status:string;compact:boolean;showQuality:boolean}
interface EditorState extends EditorSnapshot {
  mode:EditorMode;isVisualEditMode:boolean;saveStatus:SaveStatus;lastSavedAt:string|null;lastError:string|null
  dirtyProductIds:string[];localRevision:number;syncedRevision:number;localMode:boolean;history:HistoryEntry[];future:HistoryEntry[]
  stagedPatch:StagedPatch|null;isAiLoading:boolean;aiLogs:AiRun[];currentUser:TeamUser|null;auditLogs:AuditLogItem[]
  lastCloudSync:string|null;lastUpdatedBy:{name:string;area:string;timestamp:string}|null
  libraryProducts:Product[];localDocuments:WorkspaceData[];dashboard:DashboardPreferences
  setCurrentUser:(u:TeamUser|null)=>void;setLocalMode:(b:boolean)=>void;setAuditLogs:(l:AuditLogItem[])=>void
  addAuditLog:(action:string,type?:AuditLogItem['entity_type'],name?:string,details?:string)=>void
  setLastCloudSync:(v:string)=>void;setLastUpdatedBy:(v:EditorState['lastUpdatedBy'])=>void
  setCatalog:(c:Catalog)=>void;updateCatalog:(v:Partial<Catalog>)=>void;setProducts:(p:Product[])=>void
  setSelectedProductId:(id:string|null)=>void;setMode:(m:EditorMode)=>void;setFieldDefinitions:(d:FieldDefinition[])=>void
  updateProductData:(id:string,path:string,value:unknown)=>void;updateProductField:(id:string,u:Partial<Product>)=>void
  addProduct:(p:NewProductPayload)=>void;linkProduct:(p:Product)=>void;deleteProduct:(id:string)=>void
  setLibraryProducts:(p:Product[])=>void;setPages:(p:CatalogPage[])=>void;setSelectedPageId:(id:string|null)=>void
  addPage:(title?:string,sections?:PageSection[])=>void;removePage:(id:string)=>void;reorderPages:(from:number,to:number)=>void
  updatePage:(id:string,u:Partial<CatalogPage>)=>void;addSection:(page:string,type:SectionType)=>void
  removeSection:(page:string,id:string)=>void;reorderSections:(page:string,from:number,to:number)=>void
  updateSection:(page:string,id:string,u:Partial<PageSection>)=>void
  updateSectionContent:(page:string,id:string,content:PageSection['content'])=>void
  setDesignTokens:(t:DesignTokens)=>void;setContact:(c:ContactInfo)=>void;setIsVisualEditMode:(b:boolean)=>void
  loadPreset:(p:CatalogPreset)=>void;saveCurrentAsPreset:(name:string,description:string)=>void
  undo:()=>void;redo:()=>void;canUndo:()=>boolean;canRedo:()=>boolean;setSaveStatus:(s:SaveStatus)=>void
  setLastError:(error:string|null)=>void;markSaved:()=>void
  acknowledgeSave:(revision:number,result:{cloud:boolean;catalog?:Catalog;products?:Product[]})=>void
  hydrateWorkspace:(data:WorkspaceData,source:'cloud'|'local')=>void;archiveCurrentDocument:()=>void
  setDashboard:(p:Partial<DashboardPreferences>)=>void;setStagedPatch:(p:StagedPatch|null)=>void
  setIsAiLoading:(v:boolean)=>void;applyStagedPatch:()=>void;rejectStagedPatch:()=>void;toggleChangeAccepted:(i:number)=>void
}
function snapshot(s:EditorSnapshot):EditorSnapshot {
  return {catalog:s.catalog,products:s.products,pages:s.pages,fieldDefinitions:s.fieldDefinitions,designTokens:s.designTokens,contact:s.contact,presets:s.presets,selectedProductId:s.selectedProductId,selectedPageId:s.selectedPageId}
}
const canEdit=(s:EditorState)=>s.localMode||!!s.currentUser&&s.currentUser.role!=='viewer'
function mergeProducts(a:Product[],b:Product[]) {const m=new Map(a.map(p=>[p.id,p]));b.forEach(p=>m.set(p.id,p));return [...m.values()]}
function safeKeys(path:string) {
  const keys=path.replace(/\[(\d+)\]/g,'.$1').split('.')
  if(keys.length>12||keys.some(k=>!k||['__proto__','prototype','constructor'].includes(k)))throw Error('Caminho inválido.')
  return keys
}
export function readProductPath(data:unknown,path:string):unknown {
  return safeKeys(path).reduce<unknown>((o,k)=>o&&typeof o==='object'?(o as Record<string,unknown>)[k]:undefined,data)
}
function writePath(data:unknown,path:string,value:unknown) {
  const keys=safeKeys(path);let o=data as Record<string,unknown>
  for(let i=0;i<keys.length-1;i++){const k=keys[i];if(!o[k]||typeof o[k]!=='object')o[k]=/^\d+$/.test(keys[i+1])?[]:{};o=o[k] as Record<string,unknown>}
  const k=keys.at(-1)!;o[k]=typeof o[k]==='number'&&typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value))?Number(value):value
}
function reorder<T extends {sort_order:number}>(items:T[],from:number,to:number){
  if(from===to||from<0||to<0||from>=items.length||to>=items.length)return
  const [item]=items.splice(from,1);items.splice(to,0,item);items.forEach((v,i)=>{v.sort_order=i})
}
const defaults:EditorSnapshot={catalog:{...INITIAL_CATALOG,status:'draft'},products:INITIAL_PRODUCTS.map(p=>({...p,status:'draft'})),fieldDefinitions:INITIAL_FIELD_DEFINITIONS,pages:DEFAULT_PAGES,designTokens:PRESYS_DESIGN_TOKENS,contact:PRESYS_CONTACT,presets:SYSTEM_PRESETS,selectedProductId:INITIAL_PRODUCTS[0]?.id??null,selectedPageId:DEFAULT_PAGES[0]?.id??null}
export const useEditorStore=create<EditorState>()(persist((set,get)=>{
  const edit=(recipe:(s:Draft<EditorSnapshot>)=>void,id?:string)=>{
    const current=get();if(!canEdit(current)){set({lastError:'Entre com uma conta de edição ou escolha o modo local.'});return}
    try{
      const [next,patches,inverse]=produceWithPatches(snapshot(current),recipe)
      if(!patches.length)return
      const catalog=next.catalog&&current.catalog?.status===next.catalog.status&&['approved','published'].includes(next.catalog.status)?{...next.catalog,status:'draft' as const}:next.catalog
      set({...next,catalog,history:[...current.history,{patches,inverse}].slice(-100),future:[],localRevision:current.localRevision+1,saveStatus:'unsaved',lastError:null,
        dirtyProductIds:id?[...new Set([...current.dirtyProductIds,id])]:current.dirtyProductIds,libraryProducts:mergeProducts(current.libraryProducts,next.products)})
    }catch(e){set({lastError:e instanceof Error?e.message:'Não foi possível aplicar a alteração.'})}
  }
  const block=(page:string,id:string,recipe:(s:Draft<PageSection>)=>void)=>edit(s=>{const b=s.pages.find(p=>p.id===page)?.sections.find(b=>b.id===id);if(b)recipe(b)})
  const travel=(direction:'undo'|'redo')=>{
    const s=get(),source=direction==='undo'?s.history:s.future,entry=source.at(-1);if(!entry||!canEdit(s))return
    const next=applyPatches(snapshot(s),direction==='undo'?entry.inverse:entry.patches)
    // Server versions are concurrency tokens, never part of an undo operation.
    const versions=new Map(s.libraryProducts.map(p=>[p.id,p.version]))
    const products=next.products.map(p=>({...p,version:versions.get(p.id)??p.version}))
    set({...next,products,catalog:next.catalog?{...next.catalog,version:s.catalog?.version??next.catalog.version,status:'draft'}:null,
      history:direction==='undo'?s.history.slice(0,-1):[...s.history,entry],future:direction==='undo'?[...s.future,entry]:s.future.slice(0,-1),
      localRevision:s.localRevision+1,saveStatus:'unsaved',lastError:null,libraryProducts:mergeProducts(s.libraryProducts,products)})
  }
  return {
    ...defaults,mode:'form',isVisualEditMode:false,saveStatus:'local',lastSavedAt:null,lastError:null,dirtyProductIds:[],localRevision:0,syncedRevision:0,localMode:false,history:[],future:[],stagedPatch:null,isAiLoading:false,aiLogs:[],currentUser:null,auditLogs:[],lastCloudSync:null,lastUpdatedBy:null,libraryProducts:defaults.products,localDocuments:[],
    dashboard:{view:'overview',search:'',family:'',status:'',compact:false,showQuality:true},
    setCurrentUser:u=>set({currentUser:u,...(u?{localMode:false}:{})}),setLocalMode:b=>set({localMode:b,...(b?{currentUser:null,saveStatus:'local' as const}:{})}),
    setAuditLogs:auditLogs=>set({auditLogs}),
    addAuditLog:(action,entity_type='general',entity_name,details)=>set(s=>({auditLogs:[{id:crypto.randomUUID(),user_name:s.currentUser?.name??'Edição local',user_area:s.currentUser?.area??'Local',action,entity_type,entity_name,details,timestamp:new Date().toISOString()},...s.auditLogs].slice(0,100)})),
    setLastCloudSync:lastCloudSync=>set({lastCloudSync}),setLastUpdatedBy:lastUpdatedBy=>set({lastUpdatedBy}),
    setCatalog:catalog=>set({catalog}),updateCatalog:u=>{
      if(u.status&&['approved','published'].includes(u.status)&&get().currentUser?.role!=='admin'){set({lastError:'Aprovação e publicação exigem administrador autenticado.'});return}
      edit(s=>{if(s.catalog)Object.assign(s.catalog,u,{id:s.catalog.id,version:s.catalog.version})})
    },
    setProducts:products=>set(s=>({products,selectedProductId:products.some(p=>p.id===s.selectedProductId)?s.selectedProductId:products[0]?.id??null,history:[],future:[],libraryProducts:mergeProducts(s.libraryProducts,products)})),
    setSelectedProductId:selectedProductId=>set({selectedProductId}),setMode:mode=>set({mode,lastError:null}),
    setFieldDefinitions:d=>edit(s=>{s.fieldDefinitions=d}),
    updateProductData:(id,path,value)=>edit(s=>{const p=s.products.find(p=>p.id===id);if(p){writePath(p.data,path,value);p.updated_at=new Date().toISOString();p.status='draft'}},id),
    updateProductField:(id,u)=>{
      if(u.status&&['approved','published'].includes(u.status)&&get().currentUser?.role!=='admin'){set({lastError:'Aprovação técnica exige administrador autenticado.'});return}
      edit(s=>{const p=s.products.find(p=>p.id===id);if(p)Object.assign(p,u,{id:p.id,version:p.version,updated_at:new Date().toISOString(),status:u.status??'draft'})},id)
    },
    addProduct:p=>{const id=crypto.randomUUID();edit(s=>{if(s.products.some(row=>row.sku.trim().toLowerCase()===p.sku.trim().toLowerCase()))throw Error('SKU já vinculado ao documento.');const now=new Date().toISOString();s.products.push({...p,id,status:'draft',version:0,created_at:now,updated_at:now,updated_by:null});s.selectedProductId=id},id)},
    linkProduct:p=>edit(s=>{if(!s.products.some(row=>row.id===p.id))s.products.push(p);s.selectedProductId=p.id}),
    deleteProduct:id=>edit(s=>{s.products=s.products.filter(p=>p.id!==id);if(s.selectedProductId===id)s.selectedProductId=s.products[0]?.id??null}),
    setLibraryProducts:p=>set(s=>({libraryProducts:mergeProducts(p,s.products)})),
    setPages:pages=>edit(s=>{s.pages=pages;if(!pages.some(p=>p.id===s.selectedPageId))s.selectedPageId=pages[0]?.id??null}),
    setSelectedPageId:selectedPageId=>set({selectedPageId}),
    addPage:(title,sections)=>edit(s=>{const page=createPage(title||'Página '+(s.pages.length+1),sections??[],{sort_order:s.pages.length});s.pages.push(page);s.selectedPageId=page.id}),
    removePage:id=>edit(s=>{s.pages=s.pages.filter(p=>p.id!==id);s.pages.forEach((p,i)=>{p.sort_order=i});if(s.selectedPageId===id)s.selectedPageId=s.pages[0]?.id??null}),
    reorderPages:(a,b)=>edit(s=>reorder(s.pages,a,b)),
    updatePage:(id,u)=>edit(s=>{const p=s.pages.find(p=>p.id===id);if(p){const candidate={...p,...u,id},v=validateCatalogPage(candidate);if(!v.success)throw Error(v.errors?.join('; '));Object.assign(p,candidate)}}),
    addSection:(page,type)=>edit(s=>{const p=s.pages.find(p=>p.id===page);if(p)p.sections.push(createSection(type,{sort_order:p.sections.length}))}),
    removeSection:(page,id)=>edit(s=>{const p=s.pages.find(p=>p.id===page);if(p){p.sections=p.sections.filter(b=>b.id!==id);p.sections.forEach((b,i)=>{b.sort_order=i})}}),
    reorderSections:(page,a,b)=>edit(s=>{const p=s.pages.find(p=>p.id===page);if(p)reorder(p.sections,a,b)}),
    updateSection:(page,id,u)=>block(page,id,s=>{const candidate={...s,...u,id},v=validatePageSection(candidate);if(!v.success)throw Error(v.errors?.join('; '));Object.assign(s,candidate)}),
    updateSectionContent:(page,id,content)=>block(page,id,s=>{s.content=content}),
    setDesignTokens:t=>edit(s=>{s.designTokens=t}),setContact:c=>edit(s=>{s.contact=c}),setIsVisualEditMode:isVisualEditMode=>set({isVisualEditMode}),
    loadPreset:p=>edit(s=>{s.pages=structuredClone(p.default_pages);s.designTokens=structuredClone(p.design_tokens);s.contact=structuredClone(p.contact);s.selectedPageId=s.pages[0]?.id??null}),
    saveCurrentAsPreset:(name,description)=>edit(s=>{if(!name.trim())return;const now=new Date().toISOString();s.presets.push({id:crypto.randomUUID(),name:name.trim(),description,design_tokens:structuredClone(get().designTokens),contact:structuredClone(get().contact),default_pages:structuredClone(get().pages),is_system:false,created_at:now,updated_at:now})}),
    undo:()=>travel('undo'),redo:()=>travel('redo'),canUndo:()=>get().history.length>0,canRedo:()=>get().future.length>0,
    setSaveStatus:saveStatus=>set({saveStatus}),setLastError:lastError=>set({lastError}),
    markSaved:()=>set({saveStatus:'local',lastSavedAt:new Date().toISOString()}),
    acknowledgeSave:(revision,result)=>set(s=>{
      const versions=new Map((result.products??[]).map(p=>[p.id,p])),products=s.products.map(p=>{const c=versions.get(p.id);return c?{...p,version:c.version,updated_by:c.updated_by}:p})
      return {catalog:s.catalog&&result.catalog?{...s.catalog,version:result.catalog.version,updated_by:result.catalog.updated_by}:s.catalog,products,
        syncedRevision:result.cloud?revision:s.syncedRevision,lastSavedAt:new Date().toISOString(),lastCloudSync:result.cloud?new Date().toISOString():s.lastCloudSync,
        saveStatus:s.localRevision===revision?(result.cloud?'saved':'local'):'unsaved',lastError:null,dirtyProductIds:result.cloud&&s.localRevision===revision?[]:s.dirtyProductIds,libraryProducts:mergeProducts(s.libraryProducts,products)}
    }),
    hydrateWorkspace:(d,source)=>set(s=>({...d,selectedProductId:d.products.some(p=>p.id===s.selectedProductId)?s.selectedProductId:d.products[0]?.id??null,selectedPageId:d.pages.some(p=>p.id===s.selectedPageId)?s.selectedPageId:d.pages[0]?.id??null,
      history:[],future:[],stagedPatch:null,localRevision:source==='cloud'?0:1,syncedRevision:0,dirtyProductIds:[],saveStatus:source==='cloud'?'saved':'local',lastError:null,libraryProducts:mergeProducts(s.libraryProducts,d.products),lastCloudSync:source==='cloud'?new Date().toISOString():s.lastCloudSync})),
    archiveCurrentDocument:()=>set(s=>({localDocuments:[...s.localDocuments.filter(d=>d.catalog?.id!==s.catalog?.id),snapshot(s)]})),
    setDashboard:p=>set(s=>({dashboard:{...s.dashboard,...p},lastError:null})),
    setStagedPatch:p=>set({stagedPatch:p?{...p,changes:p.changes.map(c=>({...c,accepted:c.accepted===true}))}:null,lastError:null}),
    setIsAiLoading:isAiLoading=>set({isAiLoading}),
    toggleChangeAccepted:index=>set(s=>({stagedPatch:s.stagedPatch?{...s.stagedPatch,changes:s.stagedPatch.changes.map((c,i)=>i===index?{...c,accepted:c.accepted!==true}:c)}:null})),
    applyStagedPatch:()=>{
      const state=get(),patch=state.stagedPatch;if(!patch)return
      const p=state.products.find(p=>p.id===patch.productId),accepted=patch.changes.filter(c=>c.accepted===true)
      if(!p||p.version!==patch.baseVersion){set({lastError:'O produto mudou. Solicite uma nova proposta.'});return}
      if(!accepted.length){set({lastError:'Selecione explicitamente as alterações.'});return}
      for(const c of accepted){
        if(!/^marketing\.(title|subtitle|overview|features(?:\.\d+)?)$/.test(c.path)){set({lastError:'Campo não autorizado na proposta.'});return}
        if(JSON.stringify(readProductPath(p.data,c.path)??null)!==JSON.stringify(c.oldValue??null)){set({lastError:'Conflito no valor original. Nenhuma alteração aplicada.'});return}
      }
      edit(s=>{const p=s.products.find(p=>p.id===patch.productId)!;accepted.forEach(c=>writePath(p.data,c.path,c.newValue));p.status='draft';p.updated_at=new Date().toISOString()},patch.productId)
      if(!get().lastError){set({stagedPatch:null});get().addAuditLog('Aplicou proposta revisada de IA','product',p.sku,patch.summary)}
    },
    rejectStagedPatch:()=>set({stagedPatch:null}),
  }
},{
  name:'pcon-catalog-builder-v3',version:4,storage:createJSONStorage(()=>createQuotaTolerantStorage(localStorage)),
  partialize:s=>({...snapshot(s),libraryProducts:s.libraryProducts,localDocuments:s.localDocuments,dashboard:s.dashboard,localRevision:s.localRevision,syncedRevision:s.syncedRevision,dirtyProductIds:s.dirtyProductIds,saveStatus:s.saveStatus==='saving'?'unsaved':s.saveStatus,lastSavedAt:s.lastSavedAt,lastCloudSync:s.lastCloudSync}),
  merge:(persisted,current)=>{
    const persistedState=persisted&&typeof persisted==='object'?persisted as Partial<EditorState>:{}
    const merged={...current,...persistedState} as EditorState
    if(!Array.isArray(merged.libraryProducts)||merged.libraryProducts.length===0)merged.libraryProducts=Array.isArray(merged.products)?merged.products:current.libraryProducts
    return merged
  },
  migrate:p=>({...p as Partial<EditorState>,currentUser:null,localMode:false,history:[],future:[],localRevision:1,syncedRevision:0,saveStatus:'local',lastError:'Dados locais preservados. Revise antes de sincronizar.'}),
}))

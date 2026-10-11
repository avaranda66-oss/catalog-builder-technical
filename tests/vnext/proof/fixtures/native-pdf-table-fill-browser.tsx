import React from 'react';
import { createRoot } from 'react-dom/client';
import { createCatalogDocument,createDocumentSession } from '../../../../src/vnext/application';
import { applyNativeCompose } from '../../../../src/vnext/ai-catalog/native-compose';
import { tableMatrix } from '../../../../src/vnext/ai-catalog/composition';
import { VNextApp } from '../../../../src/vnext/app/VNextApp';
import { VNextPersistenceRuntime,type CatalogPersistenceEnvelope,
  type CatalogRepository,type SaveCatalogCasRequest } from '../../../../src/vnext/persistence';
import type { PublicationSource } from '../../../../src/vnext/publication/review';
import '../../../../src/vnext/app/styles.css';
const createId=()=>crypto.randomUUID();
const catalogDoc=createCatalogDocument(createId,'Catálogo com ficha técnica de duas famílias');
const preparedSession=createDocumentSession(catalogDoc,{createId});
applyNativeCompose(preparedSession,{version:1,status:'proposal',
  summary:'Quadro inicial aguardando PDFs de especificações.',
  pages:[{type:'comparison',heading:'Quadro técnico revisável',
    table:{columns:['Característica','AX-041','BX-062'],
      rowLabels:['PRESSURE RANGE','RESOLUTION','PRODUCT CODE'],design:'datasheet'}}]},
  preparedSession.getSnapshot().localSequence);
const doc=preparedSession.getSnapshot().document;
const time='2026-10-10T12:00:00Z';
const original:CatalogPersistenceEnvelope={
  catalogId:doc.id,remoteRevision:1,lastMutationId:createId(),
  title:doc.title,locale:doc.locale,createdAt:time,updatedAt:time,
  createdBy:'99999999-9999-4999-8999-999999999999',
  updatedBy:'99999999-9999-4999-8999-999999999999',
  archivedAt:null,documentSchemaVersion:1,documentSnapshot:doc,
};
let stored:CatalogPersistenceEnvelope=structuredClone(original);
let saves=0;
const repository:CatalogRepository={
  listCatalogs:async()=>({ok:true,value:[]}),
  createCatalog:async()=>({ok:false,error:{code:'REMOTE_FAILURE'}}),
  archiveCAS:async()=>({ok:false,error:{code:'REMOTE_FAILURE'}}),
  getCatalog:async id=>id===stored.catalogId
    ? {ok:true,value:structuredClone(stored)} : {ok:false,error:{code:'NOT_FOUND'}},
  saveCAS:async (request:SaveCatalogCasRequest)=>{
    if(request.catalogId!==stored.catalogId||
       request.expectedRemoteRevision!==stored.remoteRevision)
      return {ok:false,error:{code:'CONFLICT'}};
    saves++;
    stored={...stored,remoteRevision:stored.remoteRevision+1,
      lastMutationId:request.mutationId,title:request.documentSnapshot.title,
      locale:request.documentSnapshot.locale,updatedAt:new Date().toISOString(),
      documentSnapshot:structuredClone(request.documentSnapshot)};
    return {ok:true,value:structuredClone(stored)};
  },
};
const dependencies={createId};
const runtime=new VNextPersistenceRuntime({
  session:createDocumentSession(doc,dependencies),repository,
  applicationDependencies:dependencies,createMutationId:createId,
  createOpenSessionId:createId,authLineage:'pdf-literal-acceptance',
  authorityScopeId:'pdf-literal-acceptance-editor',binding:original,
  assetUrls:new Map(),resolveAssetUrls:()=>new Map(),autosave:{debounceMs:150},
});
const getSource=():PublicationSource|undefined=>{
  const s=runtime.workspace.getSnapshot();
  if(s.dirty||s.binding.kind!=='PERSISTED')return undefined;
  return {document:s.session.getSnapshot().document,
    openSessionId:s.binding.openSessionId,remoteRevision:s.binding.remoteRevision,
    authLineage:s.binding.authLineage,authorityScopeId:s.activeAuthorityScopeId,
    assetUrls:s.assetUrls};
};
declare global {
  interface Window {
    __PDF_NATIVE_UI_PROOF__?:{
      state:()=>{revision:number;pageCount:number;tableMatrix:string[][];
        objectId:string;saves:number;remoteRevision:number;dirty:boolean;document:typeof doc};
      undo:()=>boolean;
      redo:()=>boolean;
      reopen:()=>Promise<unknown>;
    };
  }
}
window.__PDF_NATIVE_UI_PROOF__={
  state:()=>{
    const s=runtime.workspace.getSnapshot();
    const page=s.session.getSnapshot().document.pages[0];
    const table=page.objects.find(o=>o.type==='table');
    if(!table||table.type!=='table')throw new Error('NO_TABLE');
    return {revision:s.session.getSnapshot().localSequence,
      pageCount:s.session.getSnapshot().document.pages.length,
      tableMatrix:tableMatrix(table.table),objectId:table.id,saves,dirty:s.dirty,
      remoteRevision:s.binding.kind==='PERSISTED'?s.binding.remoteRevision:0,
      document:s.session.getSnapshot().document};
  },
  undo:()=>runtime.workspace.getSnapshot().session.undo().ok,
  redo:()=>runtime.workspace.getSnapshot().session.redo().ok,
  reopen:()=>runtime.reopenCoordinator.open(stored.catalogId),
};
createRoot(document.getElementById('root')!).render(<React.StrictMode>
  <VNextApp runtime={runtime} simpleByDefault getPublicationSource={getSource}/>
</React.StrictMode>);

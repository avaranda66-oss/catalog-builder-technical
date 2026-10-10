import React from 'react';
import ReactDOM from 'react-dom/client';
import { createCatalogDocument, createDocumentSession } from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import { VNextPersistenceRuntime, type CatalogPersistenceEnvelope,
  type CatalogRepository, type SaveCatalogCasRequest } from '@/vnext/persistence';
import type { NativeComposeFunctionsClient } from '@/vnext/ai-catalog/native-compose-client';
import type { PublicationSource } from '@/vnext/publication/review';
import '@/vnext/app/styles.css';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/700.css';

const createId = () => crypto.randomUUID();
const catalogDoc = createCatalogDocument(createId, 'Catálogo conversacional de demonstração');
const time = '2026-10-10T10:00:00Z';
const original: CatalogPersistenceEnvelope = {
  catalogId: catalogDoc.id, remoteRevision: 1, lastMutationId: createId(),
  title: catalogDoc.title, locale: catalogDoc.locale, createdAt: time, updatedAt: time,
  createdBy: '99999999-9999-4999-8999-999999999999',
  updatedBy: '99999999-9999-4999-8999-999999999999',
  archivedAt: null, documentSchemaVersion: 1, documentSnapshot: catalogDoc,
};
let stored: CatalogPersistenceEnvelope = structuredClone(original);
let saves = 0, modelRequests = 0, lastHistoryLength = 0;
const repository: CatalogRepository = {
  listCatalogs: async () => ({ok: true, value: []}),
  createCatalog: async () => ({ok: false, error: {code:'REMOTE_FAILURE'}}),
  archiveCAS: async () => ({ok: false, error: {code:'REMOTE_FAILURE'}}),
  getCatalog: async (id: string) => id === stored.catalogId
    ? {ok: true, value: structuredClone(stored)} : {ok: false, error: {code:'NOT_FOUND'}},
  saveCAS: async (request: SaveCatalogCasRequest) => {
    if (request.catalogId !== stored.catalogId ||
        request.expectedRemoteRevision !== stored.remoteRevision) {
      return {ok: false, error: {code:'CONFLICT'}};
    }
    saves++;
    stored = { ...stored, remoteRevision: stored.remoteRevision + 1,
      lastMutationId: request.mutationId, title: request.documentSnapshot.title,
      locale: request.documentSnapshot.locale, updatedAt: new Date().toISOString(),
      documentSnapshot: structuredClone(request.documentSnapshot) };
    return {ok: true, value: structuredClone(stored)};
  },
};
const dependencies = {createId};
const runtime = new VNextPersistenceRuntime({
  session: createDocumentSession(catalogDoc, dependencies), repository,
  applicationDependencies: dependencies, createMutationId: createId,
  createOpenSessionId: createId, authLineage: 'controlled-agent-local',
  authorityScopeId: 'controlled-agent-editor', binding: original,
  assetUrls: new Map(), resolveAssetUrls: () => new Map(),
  autosave: {debounceMs: 150},
});
const getSource = (): PublicationSource | undefined => {
  const snap = runtime.workspace.getSnapshot();
  if (snap.dirty || snap.binding.kind !== 'PERSISTED') return undefined;
  return {
    document: snap.session.getSnapshot().document,
    openSessionId: snap.binding.openSessionId, remoteRevision: snap.binding.remoteRevision,
    authLineage: snap.binding.authLineage,
    authorityScopeId: snap.activeAuthorityScopeId,
    assetUrls: snap.assetUrls,
  };
};
const composer = {functions: {invoke: async (name, {body}) => {
  if (name !== 'vnext-catalog-composer' || body.task !== 'compose_scaffold' ||
      body.credential?.provider !== 'gemini' ||
      body.credential.apiKey !== 'FAKE_TEST_ONLY_GEMINI_KEY_NO_EXTERNAL_CALL') {
    return {data: null,error:{code:'FAKE_PROVIDER_REJECTED'}};
  }
  modelRequests++;
  lastHistoryLength = body.history.length;
  const turn = modelRequests;
  const plan = turn === 1 ? [
    {type:'cover', heading:'Catálogo institucional PRESYS',
      subtitle:'Demonstração de autoria conversacional revisável'},
    {type:'section', heading:'Visão geral dos instrumentos',
      subtitle:'Estrutura editorial sujeita a validação humana'},
    {type:'comparison', heading:'Famílias de produtos e modelos',
      table:{columns:['Característica','Modelo A','Modelo B','Modelo C'],
        rowLabels:['Faixa de medição','Exatidão','Conexão','Proteção','Aplicações'],
        design:'comparison'}},
  ] : [
    {type:'section', heading:'Capítulo editorial '+['','', 'dois','três','quatro'][turn],
      subtitle:'Conteúdo em elaboração sem valores técnicos inventados'},
    {type:'comparison', heading:'Quadro comparativo do capítulo '+turn,
      table:{columns:['Parâmetro','Modelo A','Modelo B','Modelo C'],
        rowLabels:['Condições','Acessórios','Conectividade','Documentação'],
        design:turn===2?'datasheet':turn===3?'matrix':'comparison'}},
    {type:'section', heading:'Notas de revisão do capítulo '+turn,
      subtitle:'Rever manual de origem antes de completar especificações'},
  ];
  return {data:{reply:{status:'proposal',version:1,
    summary:'Estrutura editorial de três páginas, com campos técnicos em branco.',
    pages:plan}},error:null};
}}} as NativeComposeFunctionsClient;
declare global {
  interface Window {
    __AGENT_FULL_PROOF__?: {state: () => {
      document: typeof catalogDoc; stored: typeof stored;
      pageCount: number; tableCount: number; emptyEngineeringCells: number;
      saves: number; modelRequests: number; lastHistoryLength: number;
      dirty: boolean; phase: string; remoteRevision: number;
    }; reopen: () => Promise<unknown>};
  }
}
window.__AGENT_FULL_PROOF__ = {
  state: () => {
    const s = runtime.workspace.getSnapshot();
    const objects = s.session.getSnapshot().document.pages.flatMap(p=>p.objects);
    const tables=objects.filter(o=>o.type==='table');
    let emptyEngineeringCells=0;
    for (const t of tables) if (t.type==='table') for(const cell of t.table.cells) {
      const r=t.table.rows.findIndex(row=>row.id===cell.rowId);
      const c=t.table.columns.findIndex(column=>column.id===cell.columnId);
      if(r>0 && c>0 && cell.content.type==='empty') emptyEngineeringCells++;
    }
    return {document:s.session.getSnapshot().document,stored:structuredClone(stored),
      pageCount:s.session.getSnapshot().document.pages.length,
      tableCount:tables.length,emptyEngineeringCells,saves,modelRequests,lastHistoryLength,
      dirty:s.dirty,phase:s.save.phase,
      remoteRevision:s.binding.kind==='PERSISTED' ? s.binding.remoteRevision : 0};
  },
  reopen: async () => runtime.reopenCoordinator.open(stored.catalogId),
};
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <VNextApp runtime={runtime} simpleByDefault composerClient={composer}
      getPublicationSource={getSource}/>
  </React.StrictMode>);

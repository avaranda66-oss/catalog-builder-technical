import { describe, expect, it } from 'vitest';
import {
  ApplicationActionSchema,
  createCatalogDocument,
  createDocumentSession,
  executeApplicationAction,
  type IdGenerator,
} from '@/vnext/application';
import { plainRichText, type CatalogDocument, type TableModel } from '@/vnext/domain';
import { emptyTable } from '../proof/test-data';

function ids(prefix='id'): IdGenerator { let n=0; return () => `${prefix}-${++n}`; }
function docWith(table: TableModel, options: { locked?: boolean; grouped?: boolean } = {}): CatalogDocument {
  const base=createCatalogDocument(ids('base'),'W4.C');
  const tableObject={id:'table-object',type:'table' as const,frame:{xMm:10,yMm:10,widthMm:120,heightMm:80},zIndex:0,...(options.locked?{locked:true}:{}),table};
  const objects=options.grouped?[{id:'group',type:'group' as const,frame:{xMm:10,yMm:10,widthMm:120,heightMm:90},zIndex:0,objects:[{...tableObject,frame:{xMm:0,yMm:10,widthMm:120,heightMm:80}},{id:'shape',type:'shape' as const,frame:{xMm:0,yMm:0,widthMm:10,heightMm:10},zIndex:1,shape:'rectangle' as const,style:{fill:'#FFFFFF'}}]}]:[tableObject];
  return {...base,pages:[{...base.pages[0],objects}]};
}
function tableOf(doc: CatalogDocument): TableModel { const o=doc.pages[0].objects[0]; if(o.type!=='table') throw new Error('table expected'); return o.table; }
function mergeAction(table: TableModel, extra: Record<string,unknown>={}) { return {type:'table.cells.merge' as const,pageId:'base-2',objectId:'table-object',tableId:table.id,anchorCellId:'cell0-0',rows:2,columns:2,expectedTable:table,...extra}; }
function unmergeAction(table: TableModel, anchorCellId='cell0-0', extra: Record<string,unknown>={}) { return {type:'table.cell.unmerge' as const,pageId:'base-2',objectId:'table-object',tableId:table.id,anchorCellId,expectedTable:table,...extra}; }

describe('W4.C merge/unmerge action contracts',()=>{
  it('is strict and rejects unknown fields',()=>{
    const t=emptyTable();
    expect(ApplicationActionSchema.safeParse(mergeAction(t)).success).toBe(true);
    expect(ApplicationActionSchema.safeParse(unmergeAction(t)).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({...mergeAction(t),wat:true}).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({...unmergeAction(t),wat:true}).success).toBe(false);
  });
});

describe('W4.C structural merge actions',()=>{
  it('merges horizontal, vertical and rectangular regions with stable IDs and metadata',()=>{
    for(const [rows,columns] of [[1,2],[2,1],[2,2]] as const){
      const t=emptyTable(); const beforeIds=t.cells.map(c=>c.id);
      const r=executeApplicationAction(docWith(t),mergeAction(t,{rows,columns}),{createId:ids()});
      expect(r.ok).toBe(true); if(!r.ok) continue;
      const next=tableOf(r.document); expect(next.cells.map(c=>c.id)).toEqual(beforeIds);
      expect(next.cells[0].span).toEqual({rows,columns}); expect(r.metadata.createdIds).toEqual([]);
      expect(r.metadata.affectedIds).toEqual(expect.arrayContaining(['table-object',t.id,'cell0-0']));
    }
  });
  it('preserves anchor content and latent covered style/presentation exactly through unmerge',()=>{
    const t=emptyTable();
    t.cells[0].content={type:'image',assetId:'asset'}; t.cells[0].contentPresentation={image:{fit:'contain',targetWidthMm:4,targetHeightMm:5},wrapPolicy:'nowrap'};
    t.cells[1].style={background:'#AABBCC',paddingMm:{top:1,right:2,bottom:3,left:4},textAlign:'right',fontWeight:700,color:'#112233'};
    t.cells[1].contentPresentation={wrapPolicy:'wrap'};
    const source={...docWith(t),assets:[{id:'asset',version:'1',sha256:'a'.repeat(64),mime:'image/png' as const,widthPx:10,heightPx:10,name:'a.png',alt:'A'}]};
    const merged=executeApplicationAction(source,mergeAction(t,{rows:1,columns:2}),{createId:ids()});
    expect(merged.ok).toBe(true); if(!merged.ok)return;
    const mt=tableOf(merged.document); expect(mt.cells[0].content).toEqual(t.cells[0].content); expect(mt.cells[1].style).toEqual(t.cells[1].style); expect(mt.cells[1].contentPresentation).toEqual(t.cells[1].contentPresentation);
    const unmerged=executeApplicationAction(merged.document,unmergeAction(mt),{createId:ids()});
    expect(unmerged.ok).toBe(true); if(!unmerged.ok)return;
    expect(tableOf(unmerged.document)).toEqual(t); expect(unmerged.metadata.createdIds).toEqual([]);
  });
  it('rejects every non-anchor authored content kind, annotations, spans, header crossing and stale CAS atomically',()=>{
    const contents=[
      {type:'richText' as const,value:plainRichText('r','x')},
      {type:'technicalCode' as const,value:'X'},
      {type:'measurement' as const,valueText:'1.0',unit:'V'},
      {type:'marker' as const,legendEntryId:'legend'},
      {type:'image' as const,assetId:'asset'},
    ];
    for(const content of contents){
      const t=emptyTable(); t.cells[1].content=content;
      if(content.type==='marker') t.legend=[{id:'legend',markerCode:'*',text:plainRichText('l','legend')}];
      if(content.type==='image') t.cells[1].contentPresentation={image:{fit:'contain',targetWidthMm:2,targetHeightMm:2}};
      let d=docWith(t); if(content.type==='image') d={...d,assets:[{id:'asset',version:'1',sha256:'b'.repeat(64),mime:'image/png',widthPx:2,heightPx:2,name:'a',alt:'a'}]};
      const r=executeApplicationAction(d,mergeAction(t,{rows:1,columns:2}),{createId:ids()}); expect(r).toEqual(expect.objectContaining({ok:false,error:expect.objectContaining({code:'MERGE_WOULD_DISCARD_CONTENT'})}));
    }
    const ann=emptyTable(); ann.annotations=[{id:'note',kind:'note',text:plainRichText('n','N')}]; ann.cells[1].annotationIds=['note']; expect(executeApplicationAction(docWith(ann),mergeAction(ann,{rows:1,columns:2}),{createId:ids()}).ok).toBe(false);
    const span=emptyTable(); span.cells[4].span={rows:1,columns:2}; span.cells[5].coveredBy=span.cells[4].id; expect(executeApplicationAction(docWith(span),mergeAction(span),{createId:ids()}).ok).toBe(false);
    const header=emptyTable(); header.rows[0].role='header'; const hr=executeApplicationAction(docWith(header),mergeAction(header,{rows:2,columns:1}),{createId:ids()}); expect(hr).toEqual(expect.objectContaining({ok:false,error:expect.objectContaining({code:'MERGE_HEADER_BOUNDARY'})}));
    const expected=emptyTable(); const live=structuredClone(expected); live.cells[8].style={color:'#112233'}; const stale=executeApplicationAction(docWith(live),mergeAction(expected),{createId:ids()}); expect(stale).toEqual(expect.objectContaining({ok:false,error:expect.objectContaining({code:'TARGET_STALE'})}));
  });
  it('fails closed for invalid/out-of-bounds spans and wrong object type',()=>{
    const t=emptyTable();
    const invalid=executeApplicationAction(docWith(t),mergeAction(t,{rows:0}),{createId:ids()}); expect(invalid).toEqual(expect.objectContaining({ok:false,error:expect.objectContaining({code:'ACTION_INVALID'})}));
    const bounds=executeApplicationAction(docWith(t),mergeAction(t,{anchorCellId:'cell2-2',rows:2,columns:2}),{createId:ids()}); expect(bounds).toEqual(expect.objectContaining({ok:false,error:expect.objectContaining({code:'ACTION_INVALID'})}));
    const d=docWith(t); const wrong={...d,pages:[{...d.pages[0],objects:[{id:'table-object',type:'shape' as const,frame:{xMm:1,yMm:1,widthMm:10,heightMm:10},zIndex:0,shape:'rectangle' as const,style:{fill:'#FFFFFF'}}]}]};
    const type=executeApplicationAction(wrong,mergeAction(t),{createId:ids()}); expect(type).toEqual(expect.objectContaining({ok:false,error:expect.objectContaining({code:'OBJECT_TYPE_MISMATCH'})}));
  });
  it('protects wrong identity, lock/group and direct covered target',()=>{
    const t=emptyTable();
    for(const [doc,action,code] of [[docWith(t,{locked:true}),mergeAction(t),'OBJECT_LOCKED'],[docWith(t,{grouped:true}),mergeAction(t),'ACTION_INVALID'],[docWith(t),mergeAction(t,{pageId:'wrong'}),'PAGE_NOT_FOUND'],[docWith(t),mergeAction(t,{objectId:'wrong'}),'OBJECT_NOT_FOUND'],[docWith(t),mergeAction(t,{tableId:'wrong'}),'TABLE_IDENTITY_MISMATCH']] as const){ const r=executeApplicationAction(doc,action,{createId:ids()}); expect(r).toEqual(expect.objectContaining({ok:false,error:expect.objectContaining({code})})); }
    const m=executeApplicationAction(docWith(t),mergeAction(t,{rows:1,columns:2}),{createId:ids()}); expect(m.ok).toBe(true); if(!m.ok)return; const mt=tableOf(m.document); const r=executeApplicationAction(m.document,unmergeAction(mt,'cell0-1'),{createId:ids()}); expect(r.ok).toBe(false);
  });
  it('treats 1x1 and unmerged unmerge as no-op with no history increment; merge/unmerge each form one undoable command',()=>{
    const t=emptyTable(); const session=createDocumentSession(docWith(t),{createId:ids()});
    const noop=session.execute(mergeAction(t,{rows:1,columns:1})); expect(noop.ok&&noop.metadata.changed).toBe(false); expect(session.getSnapshot().localSequence).toBe(0);
    const unnoop=session.execute(unmergeAction(t)); expect(unnoop.ok&&unnoop.metadata.changed).toBe(false); expect(session.getSnapshot().localSequence).toBe(0);
    const merged=session.execute(mergeAction(t)); expect(merged.ok).toBe(true); expect(session.getSnapshot().localSequence).toBe(1); const afterMerge=session.getSnapshot().document;
    expect(session.undo().ok).toBe(true); expect(session.getSnapshot().document).toEqual(docWith(t)); expect(session.redo().ok).toBe(true); expect(session.getSnapshot().document).toEqual(afterMerge);
    const mt=tableOf(afterMerge); const un=session.execute(unmergeAction(mt)); expect(un.ok).toBe(true); expect(session.getSnapshot().localSequence).toBe(4); const afterUn=session.getSnapshot().document; expect(tableOf(afterUn)).toEqual(t); expect(session.undo().ok).toBe(true); expect(session.getSnapshot().document).toEqual(afterMerge);
  });
});

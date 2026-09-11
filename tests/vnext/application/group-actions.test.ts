import { describe, expect, it } from 'vitest';
import {
  ApplicationActionSchema,
  canonicalIdentityIds,
  canonicalObjectIdentityIds,
  createDocumentSession,
  createStaticPageTemplateRegistry,
  executeApplicationAction,
  type IdGenerator,
  type PageTemplateDefinition,
} from '@/vnext/application';
import {
  CatalogDocumentSchema,
  GroupObjectSchema,
  mmToU,
  plainRichText,
  walkPageObjects,
  visualPageObjects,
  type CatalogDocument,
  type EditorialObject,
  type GroupObject,
  type LeafEditorialObject,
  type TableObject,
} from '@/vnext/domain';
import { compilePlans } from '@/vnext/rendering';
import { validateDocument } from '@/vnext/table';
import { documentStyle, emptyTable } from '../proof/test-data';

const asset={
  id:'asset',version:'1',sha256:'a'.repeat(64),mime:'image/png' as const,
  widthPx:100,heightPx:100,name:'asset.png',alt:'Asset',
};

function sequenceIds(prefix='generated'):IdGenerator {
  let next=0;
  return ()=>`${prefix}-${++next}`;
}

function countedIds(prefix='generated') {
  let count=0;
  return { createId:()=>`${prefix}-${++count}`, count:()=>count };
}

function shape(id:string,xMm:number,zIndex:number,locked=false):LeafEditorialObject {
  return {id,type:'shape',frame:{xMm,yMm:10,widthMm:10,heightMm:10},zIndex,...(locked?{locked:true}:{}),shape:'rectangle',style:{fill:'#173F52'}};
}

function text(id:string,xMm:number,zIndex:number):LeafEditorialObject {
  return {id,type:'text',frame:{xMm,yMm:10,widthMm:20,heightMm:10},zIndex,text:plainRichText(`${id}-rich`,'Texto'),style:{fontSizePt:9}};
}

function tableObject(id:string,xMm:number,zIndex:number,imageAssetId='asset'):TableObject {
  const table=emptyTable(1,1);
  table.id=`${id}-table`;
  table.columns[0].id=`${id}-column`;
  table.rows[0].id=`${id}-row`;
  table.cells[0]={
    id:`${id}-cell`,rowId:table.rows[0].id,columnId:table.columns[0].id,
    content:{type:'image',assetId:imageAssetId},contentPresentation:{image:{fit:'contain',targetWidthMm:5,targetHeightMm:5}},
  };
  return {id,type:'table',frame:{xMm,yMm:10,widthMm:20,heightMm:10},zIndex,table};
}

function documentWith(objects:EditorialObject[],extraPages:CatalogDocument['pages']=[]):CatalogDocument {
  return {
    schemaVersion:1,id:'document',title:'Group fixture',locale:'pt-BR',style:documentStyle,assets:[asset],
    pages:[{id:'page',widthMm:210,heightMm:297,safeArea:{topMm:12,rightMm:12,bottomMm:12,leftMm:12},objects},...extraPages],
  };
}

function groupFixture(children:LeafEditorialObject[],frame={xMm:20,yMm:30,widthMm:30,heightMm:10},zIndex=1):GroupObject {
  return {id:'group',type:'group',frame,zIndex,objects:children};
}

function createGroup(document:CatalogDocument,objectIds:string[],createId:IdGenerator=sequenceIds('group')) {
  const result=executeApplicationAction(document,{type:'group.create',pageId:'page',objectIds},{createId});
  expect(result.ok).toBe(true);
  if(!result.ok)throw new Error(result.error.details);
  const group=result.document.pages[0].objects.find((object)=>object.type==='group');
  if(!group||group.type!=='group')throw new Error('Group missing');
  return {result,group};
}

describe('W2.F Group domain contract',()=>{
  it('accepts a strict leaf-only tight Group and rejects undersized, nested, extra-field, negative-local, and loose envelopes',()=>{
    const valid=groupFixture([
      {...shape('a',0,0),frame:{xMm:0,yMm:0,widthMm:10,heightMm:10}},
      {...shape('b',20,1),frame:{xMm:20,yMm:0,widthMm:10,heightMm:10}},
    ]);
    expect(GroupObjectSchema.safeParse(valid).success).toBe(true);
    expect(GroupObjectSchema.safeParse({...valid,objects:[valid.objects[0]]}).success).toBe(false);
    expect(GroupObjectSchema.safeParse({...valid,extra:true}).success).toBe(false);
    expect(GroupObjectSchema.safeParse({...valid,objects:[{...valid.objects[0],frame:{...valid.objects[0].frame,xMm:-1}},valid.objects[1]]}).success).toBe(false);
    expect(GroupObjectSchema.safeParse({...valid,frame:{...valid.frame,widthMm:31}}).success).toBe(false);
    const nested={...valid,objects:[valid.objects[0],valid]} as unknown;
    expect(GroupObjectSchema.safeParse(nested).success).toBe(false);
    expect(CatalogDocumentSchema.safeParse(documentWith([valid])).success).toBe(true);
  });

  it('validates descendant canonical identities, assets, grouped Table assets, and malformed grouped Tables',()=>{
    const grouped=groupFixture([
      {...shape('dup',0,0),frame:{xMm:0,yMm:0,widthMm:10,heightMm:10}},
      {id:'image',type:'image',frame:{xMm:10,yMm:0,widthMm:10,heightMm:10},zIndex:1,assetId:'missing',fit:'contain'},
    ],{xMm:20,yMm:20,widthMm:20,heightMm:10});
    const doc=documentWith([{...shape('dup',0,0),frame:{xMm:1,yMm:1,widthMm:10,heightMm:10}},grouped]);
    expect(validateDocument(doc)).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'DUPLICATE_ID'}),
      expect.objectContaining({code:'ASSET_REFERENCE_DANGLING',objectId:'image'}),
    ]));

    const table=tableObject('grouped-table',0,0,'missing-cell-asset');
    const groupedTable=groupFixture([
      {...table,frame:{...table.frame,xMm:0,yMm:0}},
      {...shape('right',20,1),frame:{xMm:20,yMm:0,widthMm:10,heightMm:10}},
    ],{xMm:20,yMm:20,widthMm:30,heightMm:10});
    expect(validateDocument(documentWith([groupedTable]))).toContainEqual(expect.objectContaining({code:'ASSET_REFERENCE_DANGLING',objectId:'grouped-table'}));
    const malformed=structuredClone(groupedTable);
    const malformedTable=malformed.objects[0];
    if(malformedTable.type!=='table')throw new Error('Expected table');
    malformedTable.table.cells[0].rowId='missing-row';
    expect(validateDocument(documentWith([malformed]))).toContainEqual(expect.objectContaining({objectId:'grouped-table'}));
  });

  it('resolves grouped child geometry to Page-absolute U through the canonical traversal authority',()=>{
    const group=groupFixture([
      {...shape('left',0,0),frame:{xMm:0,yMm:0,widthMm:10,heightMm:10}},
      {...shape('right',20,1),frame:{xMm:20,yMm:0,widthMm:10,heightMm:10}},
    ],{xMm:100,yMm:50,widthMm:30,heightMm:10});
    const entries=walkPageObjects(documentWith([group]).pages[0]);
    const child=entries.find((entry)=>entry.object.id==='right');
    expect(child).toMatchObject({
      depth:1,
      topLevelIndex:0,
      childIndex:1,
      parentGroup:{id:'group'},
      localFrameU:{xU:mmToU(20),yU:0,widthU:mmToU(10),heightU:mmToU(10)},
      resolvedFrameU:{xU:mmToU(120),yU:mmToU(50),widthU:mmToU(10),heightU:mmToU(10)},
    });
  });
});

describe('W2.F group.create and z-order',()=>{
  it('creates from two leaves with exact U envelope, preserved identities/content, and one new root ID',()=>{
    const source=documentWith([text('text',10,5),tableObject('table',35,7)]);
    const beforeText=structuredClone(source.pages[0].objects[0]);
    const beforeTable=structuredClone(source.pages[0].objects[1]);
    const ids=countedIds('fresh-group');
    const {result,group}=createGroup(source,['text','table'],ids.createId);
    expect(ids.count()).toBe(1);
    expect(result.metadata.createdIds).toEqual([group.id]);
    expect(group.frame).toEqual({xMm:10,yMm:10,widthMm:45,heightMm:10});
    expect(group.objects.map((child)=>child.id)).toEqual(['text','table']);
    expect(group.objects.map((child)=>mmToU(child.frame.xMm))).toEqual([0,mmToU(25)]);
    expect(group.objects[0]).toMatchObject({...beforeText,frame:{...beforeText.frame,xMm:0,yMm:0},zIndex:0});
    expect(group.objects[1]).toMatchObject({...beforeTable,frame:{...beforeTable.frame,xMm:25,yMm:0},zIndex:1});
    if(group.objects[1].type!=='table'||beforeTable.type!=='table')throw new Error('Expected table');
    expect(group.objects[1].table).toEqual(beforeTable.table);
  });

  it('groups 100 contiguous leaves without losing identities',()=>{
    const objects=Array.from({length:100},(_,index)=>shape(`s-${index}`,index, index));
    const {group}=createGroup(documentWith(objects),objects.map((object)=>object.id));
    expect(group.objects).toHaveLength(100);
    expect(group.objects.map((object)=>object.id)).toEqual(objects.map((object)=>object.id));
    expect(group.frame).toEqual({xMm:0,yMm:10,widthMm:109,heightMm:10});
  });

  it('fails before allocation for duplicate, missing, cross-page, locked, Group, and grouped-child sources',()=>{
    const validGroup=groupFixture([
      {...shape('inside-a',0,0),frame:{xMm:0,yMm:0,widthMm:10,heightMm:10}},
      {...shape('inside-b',10,1),frame:{xMm:10,yMm:0,widthMm:10,heightMm:10}},
    ],{xMm:50,yMm:20,widthMm:20,heightMm:10},5);
    const other={id:'other',widthMm:210 as const,heightMm:297 as const,objects:[shape('other-object',10,0)]};
    const source=documentWith([shape('a',0,0),shape('locked',10,1,true),validGroup], [other]);
    const cases=[
      {type:'group.create',pageId:'page',objectIds:['a','a']},
      {type:'group.create',pageId:'page',objectIds:['a','missing']},
      {type:'group.create',pageId:'page',objectIds:['a','other-object']},
      {type:'group.create',pageId:'page',objectIds:['a','locked']},
      {type:'group.create',pageId:'page',objectIds:['a','group']},
      {type:'group.create',pageId:'page',objectIds:['a','inside-a']},
    ];
    for(const action of cases) {
      const ids=countedIds('never');
      const result=executeApplicationAction(source,action,{createId:ids.createId});
      expect(result.ok).toBe(false);
      expect(ids.count()).toBe(0);
    }
    expect(ApplicationActionSchema.safeParse(cases[0]).success).toBe(false);
  });

  it('rejects visual non-contiguity even when selected raw array indexes are adjacent',()=>{
    const source=documentWith([
      shape('a',0,0),
      shape('b',20,2),
      shape('x',10,1),
    ]);
    expect(source.pages[0].objects.map((object)=>object.id)).toEqual(['a','b','x']);
    expect(visualPageObjects(source.pages[0]).map(({object})=>object.id)).toEqual(['a','x','b']);
    const ids=countedIds('never');
    const result=executeApplicationAction(source,{type:'group.create',pageId:'page',objectIds:['a','b']},{createId:ids.createId});
    expect(result).toMatchObject({ok:false,error:{code:'ACTION_INVALID',details:'Selected objects must form one contiguous visual block'}});
    expect(ids.count()).toBe(0);
  });

  it('uses zIndex then array index ties and preserves locked external siblings without zIndex normalization',()=>{
    const x=shape('x',0,4,true),a=shape('a',20,4),b=shape('b',30,4),y=shape('y',50,4,true);
    const source=documentWith([x,a,b,y]);
    const {result,group}=createGroup(source,['a','b']);
    expect(visualPageObjects(result.document.pages[0]).map(({object})=>object.id)).toEqual(['x',group.id,'y']);
    expect(result.document.pages[0].objects.find((object)=>object.id==='x')).toEqual(x);
    expect(result.document.pages[0].objects.find((object)=>object.id==='y')).toEqual(y);
    expect(group.zIndex).toBe(4);
  });
});

describe('W2.F Group structural actions',()=>{
  it('moves only the Group frame and rejects Group resize without mutation',()=>{
    const {result:created,group}=createGroup(documentWith([shape('a',10,0),shape('b',20,1)]),['a','b']);
    const childrenBefore=JSON.stringify(group.objects);
    const moved=executeApplicationAction(created.document,{type:'object.move',objectId:group.id,xU:mmToU(50),yU:mmToU(60)},{createId:sequenceIds()});
    expect(moved.ok).toBe(true);
    if(!moved.ok)return;
    const movedGroup=moved.document.pages[0].objects.find((object)=>object.id===group.id);
    expect(movedGroup?.type).toBe('group');
    if(movedGroup?.type!=='group')return;
    expect(movedGroup.frame).toMatchObject({xMm:50,yMm:60,widthMm:20,heightMm:10});
    expect(JSON.stringify(movedGroup.objects)).toBe(childrenBefore);
    const beforeResize=moved.document;
    const resized=executeApplicationAction(beforeResize,{type:'object.resize',objectId:group.id,xU:0,yU:0,widthU:1,heightU:1},{createId:sequenceIds()});
    expect(resized).toMatchObject({ok:false,error:{code:'ACTION_INVALID'}});
    expect(beforeResize).toEqual(moved.document);
  });

  it('rejects every direct grouped-child mutation atomically and preserves redo in DocumentSession',()=>{
    const {result:created,group}=createGroup(documentWith([shape('a',10,0),{id:'image',type:'image',frame:{xMm:20,yMm:10,widthMm:10,heightMm:10},zIndex:1,assetId:'asset',fit:'contain'}]),['a','image']);
    const actions=[
      {type:'object.move',objectId:'a',xU:1,yU:1},
      {type:'object.resize',objectId:'a',xU:1,yU:1,widthU:1,heightU:1},
      {type:'object.delete',objectId:'a'},
      {type:'object.duplicate',objectId:'a'},
      {type:'object.reorder',objectId:'a',targetIndex:0},
      {type:'image.replace',objectId:'image',assetId:'asset'},
    ] as const;
    for(const action of actions) {
      const result=executeApplicationAction(created.document,action,{createId:sequenceIds('unused')});
      expect(result).toMatchObject({ok:false,error:{code:'ACTION_INVALID'}});
    }

    const session=createDocumentSession(created.document,{createId:sequenceIds('session')});
    expect(session.execute({type:'object.move',objectId:group.id,xU:mmToU(40),yU:mmToU(10)}).ok).toBe(true);
    expect(session.undo().ok).toBe(true);
    const before=session.getSnapshot();
    expect(before.canRedo).toBe(true);
    expect(session.execute({type:'object.delete',objectId:'a'})).toMatchObject({ok:false,error:{code:'ACTION_INVALID'}});
    const after=session.getSnapshot();
    expect(after.document).toBe(before.document);
    expect(after.canRedo).toBe(true);
  });

  it('deletes a Group closure atomically and Undo/Redo restores exact IDs and frames',()=>{
    const {result:created,group}=createGroup(documentWith([shape('a',10,0),shape('b',20,1)]),['a','b']);
    const session=createDocumentSession(created.document,{createId:sequenceIds('history')});
    const snapshot=structuredClone(session.getSnapshot().document);
    expect(session.execute({type:'object.delete',objectId:group.id}).ok).toBe(true);
    expect(session.getSnapshot().document.pages[0].objects).toHaveLength(0);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(snapshot);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.pages[0].objects).toHaveLength(0);
  });

  it('duplicates the full closure with fresh Group/child/Table/RichText IDs, preserved assets, exact default frame, and explicit coordinates',()=>{
    const source=documentWith([text('text',10,0),tableObject('table',30,1),{id:'image',type:'image',frame:{xMm:50,yMm:10,widthMm:10,heightMm:10},zIndex:2,assetId:'asset',fit:'contain'}]);
    const {result:created,group}=createGroup(source,['text','table','image']);
    const duplicated=executeApplicationAction(created.document,{type:'object.duplicate',objectId:group.id},{createId:sequenceIds('dup')});
    expect(duplicated.ok).toBe(true);
    if(!duplicated.ok)return;
    const copy=duplicated.document.pages[0].objects.find((object)=>object.id===duplicated.metadata.createdIds[0]);
    expect(copy?.type).toBe('group');
    if(copy?.type!=='group')return;
    expect(copy.frame).toEqual(group.frame);
    expect(copy.id).not.toBe(group.id);
    expect(copy.objects.map((child)=>child.id).some((id)=>group.objects.some((child)=>child.id===id))).toBe(false);
    const sourceText=group.objects.find((child)=>child.type==='text');
    const copyText=copy.objects.find((child)=>child.type==='text');
    expect(sourceText?.type).toBe('text');expect(copyText?.type).toBe('text');
    if(sourceText?.type==='text'&&copyText?.type==='text')expect(copyText.text.paragraphs[0].id).not.toBe(sourceText.text.paragraphs[0].id);
    const sourceTable=group.objects.find((child)=>child.type==='table');
    const copyTable=copy.objects.find((child)=>child.type==='table');
    expect(sourceTable?.type).toBe('table');expect(copyTable?.type).toBe('table');
    if(sourceTable?.type==='table'&&copyTable?.type==='table') {
      expect(canonicalObjectIdentityIds(copyTable).some((id)=>canonicalObjectIdentityIds(sourceTable).includes(id))).toBe(false);
      expect(copyTable.table.cells[0].content.type==='image'&&copyTable.table.cells[0].content.assetId).toBe('asset');
    }
    const copyImage=copy.objects.find((child)=>child.type==='image');
    expect(copyImage?.type==='image'&&copyImage.assetId).toBe('asset');

    const positioned=executeApplicationAction(created.document,{type:'object.duplicate',objectId:group.id,xU:mmToU(80),yU:mmToU(90)},{createId:sequenceIds('positioned')});
    expect(positioned.ok).toBe(true);
    if(positioned.ok) {
      const positionedGroup=positioned.document.pages[0].objects.find((object)=>object.id===positioned.metadata.createdIds[0]);
      expect(positionedGroup?.frame).toMatchObject({xMm:80,yMm:90,widthMm:group.frame.widthMm,heightMm:group.frame.heightMm});
    }
  });

  it('duplicates a Group 100 times without identity reuse and rejects an allocator collision',()=>{
    const {result:created,group}=createGroup(documentWith([text('text',10,0),shape('shape',30,1)]),['text','shape']);
    const session=createDocumentSession(created.document,{createId:sequenceIds('repeat')});
    const seen=new Set(canonicalIdentityIds(created.document));
    for(let index=0;index<100;index+=1) {
      const result=session.execute({type:'object.duplicate',objectId:group.id});
      expect(result.ok).toBe(true);
      if(!result.ok)break;
      for(const id of result.metadata.createdIds) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    expect(session.getSnapshot().document.pages[0].objects).toHaveLength(101);
    const collision=executeApplicationAction(created.document,{type:'object.duplicate',objectId:group.id},{createId:()=>group.id});
    expect(collision).toMatchObject({ok:false,error:{code:'DUPLICATE_ID'}});
  });

  it('enforces lock closure for move/delete/duplicate/reorder/ungroup',()=>{
    const lockedGroup=groupFixture([
      {...shape('a',0,0),frame:{xMm:0,yMm:0,widthMm:10,heightMm:10}},
      {...shape('b',10,1,true),frame:{xMm:10,yMm:0,widthMm:10,heightMm:10}},
    ],{xMm:20,yMm:20,widthMm:20,heightMm:10},1);
    const doc=documentWith([shape('x',0,0),lockedGroup,shape('y',60,2)]);
    const actions=[
      {type:'object.move',objectId:'group',xU:1,yU:1},
      {type:'object.delete',objectId:'group'},
      {type:'object.duplicate',objectId:'group'},
      {type:'object.reorder',objectId:'group',targetIndex:0},
      {type:'group.ungroup',groupId:'group'},
    ] as const;
    for(const action of actions)expect(executeApplicationAction(doc,action,{createId:sequenceIds()})).toMatchObject({ok:false,error:{code:'OBJECT_LOCKED'}});
  });
});

describe('W2.F group.ungroup',()=>{
  it('preserves child IDs/content, resolves exact U geometry after move, and is one Undo/Redo step',()=>{
    const {result:created,group}=createGroup(documentWith([shape('a',10,0),text('b',20,1)]),['a','b']);
    const moved=executeApplicationAction(created.document,{type:'object.move',objectId:group.id,xU:mmToU(100),yU:mmToU(50)},{createId:sequenceIds()});
    expect(moved.ok).toBe(true);
    if(!moved.ok)return;
    const session=createDocumentSession(moved.document,{createId:sequenceIds('history')});
    const before=structuredClone(session.getSnapshot().document);
    const ungrouped=session.execute({type:'group.ungroup',groupId:group.id});
    expect(ungrouped.ok).toBe(true);
    if(!ungrouped.ok)return;
    expect(ungrouped.document.pages[0].objects.map((object)=>object.id)).toEqual(['a','b']);
    expect(ungrouped.document.pages[0].objects.map((object)=>object.frame.xMm)).toEqual([100,110]);
    expect(ungrouped.document.pages[0].objects.map((object)=>object.frame.yMm)).toEqual([50,50]);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(ungrouped.document);
  });

  it('emerges in the Group current visual slot after reorder without moving external visual siblings',()=>{
    const source=documentWith([shape('x',0,0),shape('a',20,1),shape('b',30,2),shape('y',60,3)]);
    const {result:created,group}=createGroup(source,['a','b']);
    const reordered=executeApplicationAction(created.document,{type:'object.reorder',objectId:group.id,targetIndex:0},{createId:sequenceIds()});
    expect(reordered.ok).toBe(true);
    if(!reordered.ok)return;
    expect(visualPageObjects(reordered.document.pages[0]).map(({object})=>object.id)).toEqual([group.id,'x','y']);
    const ungrouped=executeApplicationAction(reordered.document,{type:'group.ungroup',groupId:group.id},{createId:sequenceIds()});
    expect(ungrouped.ok).toBe(true);
    if(ungrouped.ok)expect(visualPageObjects(ungrouped.document.pages[0]).map(({object})=>object.id)).toEqual(['a','b','x','y']);
  });
});

describe('W2.F Group templates and Table planning',()=>{
  it('materializes Group-bearing templates twice with independent closure IDs and preserved AssetRefs',()=>{
    const table=tableObject('seed-table',20,1);
    const definition:PageTemplateDefinition={
      id:'group-template',label:'Group template',objects:[{
        type:'group',frame:{xMm:10,yMm:20,widthMm:40,heightMm:10},zIndex:0,objects:[
          {type:'text',frame:{xMm:0,yMm:0,widthMm:20,heightMm:10},zIndex:0,text:plainRichText('seed-text','Template'),style:{}},
          {type:'table',frame:{xMm:20,yMm:0,widthMm:20,heightMm:10},zIndex:1,table:table.table},
        ],
      }],
    };
    const registry=createStaticPageTemplateRegistry([definition]);
    const session=createDocumentSession(documentWith([]),{createId:sequenceIds('template'),templateRegistry:registry});
    const first=session.execute({type:'page.template.insert',templateId:definition.id});
    const second=session.execute({type:'page.template.insert',templateId:definition.id});
    expect(first.ok).toBe(true);expect(second.ok).toBe(true);
    if(!first.ok||!second.ok)return;
    const firstGroup=first.document.pages.at(-1)?.objects[0];
    const secondGroup=second.document.pages.at(-1)?.objects[0];
    expect(firstGroup?.type).toBe('group');expect(secondGroup?.type).toBe('group');
    if(firstGroup?.type!=='group'||secondGroup?.type!=='group')return;
    expect(canonicalObjectIdentityIds(firstGroup).some((id)=>canonicalObjectIdentityIds(secondGroup).includes(id))).toBe(false);
    const firstText=firstGroup.objects.find((child)=>child.type==='text');
    const secondText=secondGroup.objects.find((child)=>child.type==='text');
    if(firstText?.type==='text'&&secondText?.type==='text')expect(firstText.text.paragraphs[0].id).not.toBe(secondText.text.paragraphs[0].id);
    expect(compilePlans(second.document).plans.size).toBe(2);
  });

  it('rejects missing nested assets, invalid envelopes, and nested Groups before first ID generation',()=>{
    const missingAsset:PageTemplateDefinition={id:'missing',label:'Missing',objects:[{
      type:'group',frame:{xMm:10,yMm:10,widthMm:20,heightMm:10},zIndex:0,objects:[
        {type:'image',frame:{xMm:0,yMm:0,widthMm:10,heightMm:10},zIndex:0,assetId:'missing',fit:'contain'},
        {type:'shape',frame:{xMm:10,yMm:0,widthMm:10,heightMm:10},zIndex:1,shape:'rectangle',style:{}},
      ],
    }]};
    const ids=countedIds('never');
    const missingResult=executeApplicationAction(documentWith([]),{type:'page.template.insert',templateId:'missing'},{createId:ids.createId,templateRegistry:createStaticPageTemplateRegistry([missingAsset])});
    expect(missingResult).toMatchObject({ok:false,error:{code:'ASSET_NOT_FOUND'}});
    expect(ids.count()).toBe(0);

    const loose=structuredClone(missingAsset) as unknown as PageTemplateDefinition;
    (loose.objects[0] as {frame:{widthMm:number}}).frame.widthMm=21;
    expect(()=>createStaticPageTemplateRegistry([loose])).toThrow();
    const nested={id:'nested',label:'Nested',objects:[{
      type:'group',frame:{xMm:0,yMm:0,widthMm:20,heightMm:10},zIndex:0,objects:[
        {type:'group',frame:{xMm:0,yMm:0,widthMm:10,heightMm:10},zIndex:0,objects:[]},
        {type:'shape',frame:{xMm:10,yMm:0,widthMm:10,heightMm:10},zIndex:1,shape:'rectangle',style:{}},
      ],
    }]} as unknown as PageTemplateDefinition;
    expect(()=>createStaticPageTemplateRegistry([nested])).toThrow();
  });
});

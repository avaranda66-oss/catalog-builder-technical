import { plainRichText, type CatalogDocument, type TableModel } from '@/vnext/domain';

export const W4C_CATALOG_ID = '88888888-8888-4888-8888-888888888888';
export const W4C_OTHER_CATALOG_ID = '99999999-9999-4999-8999-999999999998';
export const W4C_PAGE_ID = 'w4c-page';
export const W4C_OBJECT_ID = 'w4c-table-object';
export const W4C_TABLE_ID = 'w4c-table';

function tableFixture(): TableModel {
  const columns=[0,1,2,3].map((i)=>({id:`w4c-col-${i}`,width:{mode:'fixed' as const,mm:30},minMm:12}));
  const rows=[
    {id:'w4c-row-0',role:'header' as const,heightPolicy:{mode:'AUTO' as const}},
    {id:'w4c-row-1',role:'body' as const,heightPolicy:{mode:'AUTO' as const}},
    {id:'w4c-row-2',role:'body' as const,heightPolicy:{mode:'AUTO' as const}},
    {id:'w4c-row-3',role:'section' as const,heightPolicy:{mode:'AUTO' as const}},
  ];
  const cells:TableModel['cells']=[];
  for(let r=0;r<4;r+=1) for(let c=0;c<4;c+=1) cells.push({id:`w4c-cell-${r}-${c}`,rowId:rows[r].id,columnId:columns[c].id,content:{type:'empty'}});
  const at=(r:number,c:number)=>cells[r*4+c];
  at(1,0).style={background:'#FFF3CD',paddingMm:{top:1,right:1,bottom:1,left:1},textAlign:'left'};
  at(1,1).style={background:'#DCEEFF',paddingMm:{top:2,right:3,bottom:4,left:5},textAlign:'right',fontWeight:700,color:'#112233'};
  at(1,1).contentPresentation={wrapPolicy:'nowrap'};
  at(1,2).content={type:'technicalCode',value:'BLOCK-CONTENT'};
  at(1,3).annotationIds=['w4c-note'];
  at(2,0).span={rows:1,columns:2};
  at(2,1).coveredBy=at(2,0).id;
  at(2,0).content={type:'technicalCode',value:'EXISTING-MERGE'};
  return {
    id:W4C_TABLE_ID,columns,rows,cells,
    style:{
      base:{fontFamily:'Noto Sans',fontSizePt:9,lineHeight:1.2,color:'#172033',textAlign:'left',paddingMm:{top:1,right:1,bottom:1,left:1},borders:{top:{pattern:'solid',thicknessPt:0.75,color:'#003366'},right:{pattern:'solid',thicknessPt:0.75,color:'#003366'},bottom:{pattern:'solid',thicknessPt:0.75,color:'#003366'},left:{pattern:'solid',thicknessPt:0.75,color:'#003366'}}},
      rowRoles:{header:{background:'#DCEEFF',fontWeight:700},section:{background:'#F3F5F8'}},
      annotation:{fontSizePt:8,color:'#33445A'},annotationGapMm:1,
    },
    annotations:[{id:'w4c-note',kind:'note',text:plainRichText('w4c-note-text','Nota preservada')}],
    legend:[],
  };
}

export function createW4CTableDocument(id=W4C_CATALOG_ID,title='Catálogo W4.C'):CatalogDocument {
  return {
    schemaVersion:1,id,title,locale:'pt-BR',
    style:{fonts:[{family:'Noto Sans',revision:'5.3.0',weight:400,style:'normal'},{family:'Noto Sans',revision:'5.3.0',weight:700,style:'normal'}],defaultText:{fontFamily:'Noto Sans',fontSizePt:10,lineHeight:1.2,fontWeight:400,color:'#172033',textAlign:'left'},palette:['#172033','#003366','#DCEEFF','#FFF3CD']},
    pages:[{id:id===W4C_CATALOG_ID?W4C_PAGE_ID:'w4c-other-page',widthMm:210,heightMm:297,safeArea:{topMm:10,rightMm:10,bottomMm:10,leftMm:10},objects:id===W4C_CATALOG_ID?[{id:W4C_OBJECT_ID,type:'table',frame:{xMm:30,yMm:45,widthMm:120,heightMm:80},zIndex:0,table:tableFixture()}]:[]}],
    assets:[],
  };
}

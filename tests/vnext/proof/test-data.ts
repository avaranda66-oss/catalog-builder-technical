import type { TableModel, DocumentStyle } from '@/labs/presys-editorial-proof/proof-model';
export const documentStyle:DocumentStyle={fonts:[{family:'Noto Sans',revision:'5.3.0',weight:400,style:'normal'}],
  defaultText:{fontFamily:'Noto Sans',fontSizePt:8,lineHeight:1.2,paddingMm:{top:1,right:1,bottom:1,left:1}},palette:['#173F52']};
export function emptyTable(rows=3,columns=3):TableModel {
  return {id:'table',columns:Array.from({length:columns},(_,i)=>({id:'c'+i,width:{mode:'flex',weight:1},minMm:1})),
    rows:Array.from({length:rows},(_,i)=>({id:'r'+i,role:'body',heightPolicy:{mode:'AUTO'}})),
    cells:Array.from({length:rows},(_,r)=>Array.from({length:columns},(_,c)=>({id:`cell${r}-${c}`,rowId:'r'+r,columnId:'c'+c,content:{type:'empty' as const}}))).flat(),
    style:{base:{borders:{top:{pattern:'solid',thicknessPt:1,color:'#173F52'},right:{pattern:'solid',thicknessPt:1,color:'#173F52'},bottom:{pattern:'solid',thicknessPt:1,color:'#173F52'},left:{pattern:'solid',thicknessPt:1,color:'#173F52'}}},rowRoles:{},annotation:{},annotationGapMm:1},
    annotations:[],legend:[]};
}

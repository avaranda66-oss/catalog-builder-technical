import { describe,expect,it } from 'vitest';
import { jsPDF } from 'jspdf';
import { createCatalogDocument,createDocumentSession } from '../../../src/vnext/application';
import { applyNativeCompose } from '../../../src/vnext/ai-catalog/native-compose';
import { extractPdfText } from '../../../src/vnext/ai-catalog/pdf-intake';
import {
  prepareNativePdfCellFill,approveNativePdfCellFill,type NativePdfCellFillPreview,
} from '../../../src/vnext/ai-catalog/native-pdf-cell-fill';
import { tableMatrix } from '../../../src/vnext/ai-catalog/composition';
import type { LocalPdfMaterial,RealPdfExtractionProposal } from '../../../src/vnext/ai-catalog/pdf-grounded-input';

const id=()=>crypto.randomUUID();
const models=['AX-041','BX-062'];
type Fixture=Awaited<ReturnType<typeof make>>;
async function make() {
  const doc=createCatalogDocument(id,'Novo catálogo');
  const session=createDocumentSession(doc,{createId:id});
  applyNativeCompose(session,{version:1,status:'proposal',
    summary:'Quadro inicial esperando PDF do fabricante',
    pages:[{type:'comparison',heading:'Quadro técnico das famílias',
      table:{columns:['Característica',...models],
        rowLabels:['PRESSURE RANGE','RESOLUTION','PRODUCT CODE'], design:'datasheet'}}]},
  session.getSnapshot().localSequence);
  const tables=session.getSnapshot().document.pages.flatMap(page=>
    page.objects.filter(o=>o.type==='table').map(o=>({pageId:page.id,objectId:o.id})));
  if(tables.length!==1)throw new Error('TEST_TABLE_MISSING');
  const materials:LocalPdfMaterial[]=[];
  const values=[['0...700','0.001','00017'],['0...900','0.002','00024']];
  const quotes:string[][]=[];
  for(let m=0;m<models.length;m++){
    const pdf=new jsPDF({format:'a4'});
    const rows=[
      models[m]+' PRESSURE RANGE '+values[m][0]+' kPa',
      models[m]+' RESOLUTION '+values[m][1]+' kPa',
      models[m]+' PRODUCT CODE '+values[m][2],
    ];
    rows.forEach((line,i)=>pdf.text(line,20,30+i*14));
    const bytes=pdf.output('arraybuffer');
    materials.push({sourceId:models[m].toLowerCase(),fileName:models[m]+'.pdf',
      revision:'1',bytes});
    const text=(await extractPdfText(models[m]+'.pdf',bytes)).pages[0].text;
    quotes.push(rows.map(line=>text.split('\n').find(x=>x.includes(line))?.trim()??text));
  }
  const rowLabels=['PRESSURE RANGE','RESOLUTION','PRODUCT CODE'];
  const proposal:RealPdfExtractionProposal={
    version:1,title:'Quadro técnico referenciado',models,
    sections:[{id:'technical',title:'Especificações',rows:rowLabels.map((label,row)=>({
      id:'item-'+row,label,unit:row<2?'kPa':'',condition:'',
      values:models.map((_,col)=>({status:'known' as const,
        candidate:{value:values[col][row],source:{
          sourceId:models[col].toLowerCase(),page:1,quote:quotes[col][row]}}})),
    }))}],
  };
  return {doc,session,target:tables[0],materials,proposal};
}
function tableOf(f:Fixture) {
  const object=f.session.getSnapshot().document.pages[0].objects
    .find(o=>o.type==='table');
  if(!object || object.type!=='table')throw new Error('NO_TABLE');
  return object.table;
}

describe('Actual PDF bytes -> reviewed preflight -> one atomic native table commit',()=>{
  it('fills exact cells only AFTER human approval, preserving decimals and source quotes and Undo',async()=>{
    const f=await make();
    const before=structuredClone(f.session.getSnapshot().document);
    const preview=await prepareNativePdfCellFill(f.session,f.target,f.materials,f.proposal);
    expect(preview.verifiedCells).toBe(6);
    expect(preview.missingCells).toBe(0);
    expect(preview.pdfHashes).toHaveLength(2);
    expect(preview.pdfHashes.every(ref=>/^[a-f0-9]{64}$/.test(ref.sha256))).toBe(true);
    expect(preview.cells.map(cell=>cell.displayValue))
      .toEqual(['0...700 kPa','0...900 kPa','0.001 kPa','0.002 kPa','00017','00024']);
    expect(preview.cells[0].source?.quote).toContain('AX-041 PRESSURE RANGE 0...700 kPa');
    expect(f.session.getSnapshot().document).toEqual(before);
    const receipt=approveNativePdfCellFill(f.session,preview);
    expect(receipt.filled).toBe(6);
    expect(tableMatrix(tableOf(f))).toEqual([
      ['Característica','AX-041','BX-062'],
      ['PRESSURE RANGE','0...700 kPa','0...900 kPa'],
      ['RESOLUTION','0.001 kPa','0.002 kPa'],
      ['PRODUCT CODE','00017','00024'],
    ]);
    expect(()=>approveNativePdfCellFill(f.session,preview)).toThrow('PDF_FILL_PREVIEW_NOT_ISSUED');
    expect(f.session.undo().ok).toBe(true);
    expect(f.session.getSnapshot().document).toEqual(before);
  });

  it('fails closed on wrong existing model/row, edited cells, stale revisions and forged approval',async()=>{
    const f=await make();
    const incorrect=structuredClone(f.proposal);
    incorrect.models[0]='NOT-AX-041';
    await expect(prepareNativePdfCellFill(f.session,f.target,f.materials,incorrect)).rejects.toThrow();
    const before=f.session.getSnapshot().document;
    const preview=await prepareNativePdfCellFill(f.session,f.target,f.materials,f.proposal);
    expect(()=>approveNativePdfCellFill(f.session,{...preview} as NativePdfCellFillPreview))
      .toThrow('PDF_FILL_PREVIEW_NOT_ISSUED');
    expect(f.session.getSnapshot().document).toEqual(before);
    expect(f.session.execute({type:'page.add'}).ok).toBe(true);
    const next=structuredClone(f.session.getSnapshot().document);
    expect(()=>approveNativePdfCellFill(f.session,preview)).toThrow('PDF_FILL_STALE_APPROVAL');
    expect(f.session.getSnapshot().document).toEqual(next);
  });

  it('rejects substituted figures, changed signs, swapped models and non-atomic quotes',async()=>{
    for(const action of ['change-value','swap-source','splice-quote','change-unit'] as const){
      const f=await make(), p=structuredClone(f.proposal);
      const fact=p.sections[0].rows[0].values[0];
      if(fact.status!=='known')throw new Error('BAD_FIXTURE');
      if(action==='change-value')fact.candidate.value='0...999';
      if(action==='swap-source')fact.candidate.source.sourceId='bx-062';
      if(action==='splice-quote')fact.candidate.source.quote='PRESSURE RANGE 0...700 kPa';
      if(action==='change-unit')p.sections[0].rows[0].unit='Pa';
      await expect(prepareNativePdfCellFill(f.session,f.target,f.materials,p)).rejects.toThrow();
      expect(tableMatrix(tableOf(f))[1].slice(1)).toEqual(['','']);
    }
  });

  it('keeps reported missing facts empty; conflicts block entire batch and conditions cannot vanish',async()=>{
    const f=await make(), p=structuredClone(f.proposal);
    p.sections[0].rows[1].values[1]={status:'missing',reason:'Não informado'};
    const preview=await prepareNativePdfCellFill(f.session,f.target,f.materials,p);
    expect(preview.verifiedCells).toBe(5);
    expect(preview.missingCells).toBe(1);
    approveNativePdfCellFill(f.session,preview);
    expect(tableMatrix(tableOf(f))[2][2]).toBe('');
    const other=await make(),conflict=structuredClone(other.proposal);
    const known=conflict.sections[0].rows[0].values[0];
    if(known.status!=='known')throw new Error('BAD_FIXTURE');
    conflict.sections[0].rows[0].values[0]={status:'conflict',
      candidates:[known.candidate,{...known.candidate}]};
    await expect(prepareNativePdfCellFill(other.session,other.target,other.materials,conflict))
      .rejects.toThrow('PDF_FILL_UNRESOLVED_SOURCE_CONFLICT');
    conflict.sections[0].rows[0].values[0]=known;
    conflict.sections[0].rows[0].condition='at 23 C';
    await expect(prepareNativePdfCellFill(other.session,other.target,other.materials,conflict))
      .rejects.toThrow();
  });
});

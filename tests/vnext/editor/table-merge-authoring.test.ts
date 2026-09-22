import { describe, expect, it } from 'vitest';
import { mergeEligibility, selectionAfterMerge, selectionAfterUnmerge, unmergeEligibility } from '@/vnext/editor/table-merge-authoring';
import { tableCellSelection, tableColumnSelection, tableRangeSelection, tableRowSelection, tableSelectionIdentity, wholeTableSelection } from '@/vnext/editor/table-selection';
import { mergeCells, unmergeCell } from '@/vnext/table';
import { plainRichText } from '@/vnext/domain';
import { emptyTable } from '../proof/test-data';

const identity=tableSelectionIdentity('page','object','table');
const point=(r:number,c:number)=>({rowId:`r${r}`,columnId:`c${c}`});

describe('W4.C merge authoring helpers',()=>{
  it('normalizes forward/reverse ranges to the same top-left structural action',()=>{
    const t=emptyTable(); const a=mergeEligibility(t,tableRangeSelection(identity,point(0,0),point(1,1))); const b=mergeEligibility(t,tableRangeSelection(identity,point(1,1),point(0,0)));
    expect(a).toEqual(b); expect(a.prepared).toEqual({anchorCellId:'cell0-0',rows:2,columns:2});
  });
  it('allows only ranges and gives Father-facing reasons',()=>{
    const t=emptyTable();
    expect(mergeEligibility(t,tableCellSelection(identity,point(0,0))).reason).toContain('duas ou mais');
    expect(mergeEligibility(t,tableRowSelection(identity,'r0')).enabled).toBe(false);
    expect(mergeEligibility(t,tableColumnSelection(identity,'c0')).enabled).toBe(false);
    expect(mergeEligibility(t,wholeTableSelection(identity)).enabled).toBe(false);
    t.cells[1].content={type:'technicalCode',value:'X'}; expect(mergeEligibility(t,tableRangeSelection(identity,point(0,0),point(0,1))).reason).toContain('conteúdo');
    t.cells[1].content={type:'empty'}; t.annotations=[{id:'n',kind:'note',text:plainRichText('n','N')}]; t.cells[1].annotationIds=['n']; expect(mergeEligibility(t,tableRangeSelection(identity,point(0,0),point(0,1))).reason).toContain('anotação');
  });
  it('rejects existing topology and header crossing before action execution',()=>{
    let t=mergeCells(emptyTable(),'cell1-0',1,2); expect(mergeEligibility(t,tableRangeSelection(identity,point(1,0),point(2,1))).reason).toContain('Desmescle');
    t=emptyTable(); t.rows[0].role='header'; expect(mergeEligibility(t,tableRangeSelection(identity,point(0,0),point(1,0))).reason).toContain('cabeçalho');
  });
  it('resolves a covered visual slot to owner for unmerge and creates post selections',()=>{
    const merged=mergeCells(emptyTable(),'cell0-0',2,2);
    const covered=tableCellSelection(identity,point(1,1)); const eligible=unmergeEligibility(merged,covered); expect(eligible).toEqual({enabled:true,anchorCellId:'cell0-0'});
    expect(selectionAfterMerge(identity,merged,'cell0-0')).toEqual(tableCellSelection(identity,point(0,0)));
    const flat=unmergeCell(merged,'cell0-0'); expect(selectionAfterUnmerge(identity,flat,0,0,2,2,'cell0-0')).toEqual(tableRangeSelection(identity,point(0,0),point(1,1)));
  });
});

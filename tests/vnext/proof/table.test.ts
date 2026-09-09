import {describe,it,expect} from 'vitest';
import {emptyTable} from './test-data';
import {plainRichText,TableModelSchema} from '@/vnext/domain/editorial-model';
import {validateTable,mergeCells,unmergeCell,getCellKey,deleteAxis,reorderAxis,insertAxis} from '@/vnext/table/table-model';

describe('table topology, immutable operations and references',()=>{
  it('accepts headerless full grid and collision-safe coordinates',()=>{
    const table=emptyTable();
    expect(validateTable(TableModelSchema.parse(JSON.parse(JSON.stringify(table))))).toEqual([]);
    expect(getCellKey('a::b','c')).not.toBe(getCellKey('a','b::c'));
  });
  it('roundtrips a rectangular merge without losing IDs, styles or anchor data',()=>{
    const table=emptyTable();
    table.cells[0].content={type:'technicalCode',value:'06.04.0121-00'};
    table.cells[1].style={background:'#ABCDEF'};
    const before=JSON.stringify(table),merged=mergeCells(table,'cell0-0',2,2);
    expect(merged.cells.map(c=>c.id)).toEqual(table.cells.map(c=>c.id));
    expect(merged.cells[1].coveredBy).toBe('cell0-0');
    expect(unmergeCell(merged,'cell0-0')).toEqual(table);
    expect(JSON.stringify(table)).toBe(before);
  });
  it('rejects data loss, partial manipulation, overlap and out-of-bounds without mutating input',()=>{
    const table=emptyTable();table.cells[1].content={type:'richText',value:plainRichText('x','critical')};
    const before=JSON.stringify(table);
    expect(()=>mergeCells(table,'cell0-0',1,2)).toThrow('MERGE_WOULD_DISCARD_CONTENT');
    expect(JSON.stringify(table)).toBe(before);
    const merged=mergeCells(emptyTable(),'cell0-0',2,2);
    expect(()=>mergeCells(merged,'cell0-0',3,3)).toThrow('MERGE_OVERLAP');
    expect(()=>unmergeCell(merged,'cell0-1')).toThrow('MERGE_INTERSECTION');
    expect(()=>deleteAxis(merged,'row','r0')).toThrow('MERGE_INTERSECTION');
    expect(()=>reorderAxis(merged,'column',['c1','c0','c2'])).toThrow('MERGE_INTERSECTION');
    expect(()=>mergeCells(emptyTable(),'cell2-2',2,2)).toThrow('SPAN_OUT_OF_BOUNDS');
    expect(()=>mergeCells(emptyTable(),'cell0-0',1.5,2)).toThrow('INVALID_SPAN');
  });
  it('rejects orphan, cycle, outside-span and overlapping coverage',()=>{
    for(const ref of ['missing','cell0-1']) {
      const table=emptyTable();table.cells[1].coveredBy=ref;
      expect(validateTable(table).some(d=>d.code.startsWith('COVERED_BY'))).toBe(true);
    }
    const merged=mergeCells(emptyTable(),'cell0-0',2,2);
    merged.cells[8].coveredBy='cell0-0';
    expect(validateTable(merged)).toContainEqual(expect.objectContaining({code:'COVERED_BY_INVALID'}));
    const overlap=emptyTable();overlap.cells[0].span={rows:2,columns:2};overlap.cells[1].span={rows:2,columns:2};
    expect(validateTable(overlap)).toContainEqual(expect.objectContaining({code:'MERGE_OVERLAP'}));
  });
  it('rejects duplicate IDs, missing grid cells and a header/body crossing',()=>{
    const table=emptyTable();table.cells[1].id=table.cells[0].id;
    expect(validateTable(table)).toContainEqual(expect.objectContaining({code:'DUPLICATE_ID'}));
    expect(validateTable({...emptyTable(),cells:emptyTable().cells.slice(1)})).toContainEqual(expect.objectContaining({code:'TABLE_GRID_INCOMPLETE'}));
    const mixed=emptyTable();mixed.rows[0].role='header';
    expect(()=>mergeCells(mixed,'cell0-0',2,1)).toThrow('MERGE_HEADER_BOUNDARY');
  });
  it('expands only strict interior insertions, retaining authored cell identities',()=>{
    const merged=mergeCells(emptyTable(),'cell0-0',2,2);
    const cells=merged.columns.map(c=>({id:'new-'+c.id,rowId:'new',columnId:c.id,content:{type:'empty' as const}}));
    const row={id:'new',role:'body' as const,heightPolicy:{mode:'AUTO' as const}};
    const inside=insertAxis(merged,'row',1,row,cells);
    expect(inside.cells[0].span).toEqual({rows:3,columns:2});
    expect(inside.cells.find(c=>c.id==='new-c0')?.coveredBy).toBe('cell0-0');
    const before=insertAxis(merged,'row',0,row,cells);
    expect(before.cells[0].span).toEqual({rows:2,columns:2});
    expect(before.cells.find(c=>c.id==='new-c0')?.coveredBy).toBeUndefined();
  });
  it('enforces annotation scope, marker and asset references',()=>{
    const table=emptyTable();
    table.annotations=[{id:'caption',kind:'caption',text:plainRichText('caption-text','Title')},{id:'note',kind:'note',text:plainRichText('note-text','Note')}];
    table.annotationIds=['caption','note'];table.cells[0].annotationIds=['note'];
    expect(validateTable(table)).toEqual([]);
    table.cells[0].annotationIds=['caption','missing'];
    expect(validateTable(table).map(d=>d.code)).toEqual(expect.arrayContaining(['ANNOTATION_SCOPE_INVALID','ANNOTATION_REFERENCE_DANGLING']));
    table.cells[1].content={type:'marker',legendEntryId:'missing'};
    table.cells[2].content={type:'image',assetId:'missing'};
    table.cells[2].contentPresentation={image:{fit:'contain',targetWidthMm:10,targetHeightMm:10}};
    expect(validateTable(table,[]).map(d=>d.code)).toEqual(expect.arrayContaining(['MARKER_LEGEND_REFERENCE_DANGLING','ASSET_REFERENCE_DANGLING']));
  });
});

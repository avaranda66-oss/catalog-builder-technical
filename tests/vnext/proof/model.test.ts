import {describe,it,expect} from 'vitest';
import {CellContentSchema,CellSchema,CatalogDocumentSchema,RichTextSchema,plainRichText} from '@/labs/presys-editorial-proof/proof-model';
import {makeFixture} from '@/labs/presys-editorial-proof/fixtures';
import {validateDocument} from '@/labs/presys-editorial-proof/proof-table';
describe('strict canonical document and semantic content',()=>{
  it.each(['+01.2300','-0.0000','.0500','1.230e+03','-1E-9'])('preserves measurement lexeme %s byte-for-byte',valueText=>{
    const input={type:'measurement',valueText,unit:' µV ',qualifier:'approx'};
    expect(CellContentSchema.parse(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });
  it.each(['1.','1,23','NaN','Infinity',' 1','1e','1\n'])('rejects invalid decimal lexeme %s',valueText=>{
    expect(CellContentSchema.safeParse({type:'measurement',valueText,unit:'V'}).success).toBe(false);
  });
  it('rejects unknown payloads, semantic presentation, invalid marks and hidden breaks',()=>{
    for(const value of [{type:'empty',text:''},{type:'technicalCode',value:'A',wrapPolicy:'nowrap'},
      {type:'measurement',valueText:'1',unit:'V',image:{}},{type:'marker',value:'●'},{type:'image',url:'https://example.com'}])
      expect(CellContentSchema.safeParse(value).success).toBe(false);
    const rich=plainRichText('a','a');
    const run=rich.paragraphs[0].inlines[0];if(run.kind!=='text')throw Error('Fixture');
    for(const marks of [['bold','bold'],['italic','bold'],['subscript','superscript']]) {
      expect(RichTextSchema.safeParse({...rich,paragraphs:[{id:'p',inlines:[{...run,marks}]}]}).success).toBe(false);
    }
    expect(RichTextSchema.safeParse(plainRichText('x','hidden\nbreak')).success).toBe(false);
  });
  it('requires image presentation, rejects it on text and preserves technical whitespace',()=>{
    const base={id:'a',rowId:'r',columnId:'c'};
    expect(CellSchema.safeParse({...base,content:{type:'image',assetId:'photo'}}).success).toBe(false);
    expect(CellSchema.safeParse({...base,content:{type:'technicalCode',value:' A/B '},contentPresentation:{image:{fit:'contain',targetWidthMm:1,targetHeightMm:1}}}).success).toBe(false);
    expect(CellContentSchema.parse({type:'technicalCode',value:' A/B ' })).toEqual({type:'technicalCode',value:' A/B '});
  });
  it.each(['G01','G02','G03','G04','G05','rowspan-watch'] as const)('roundtrips %s with stable IDs and no hidden runtime state',name=>{
    const doc=makeFixture(name),before=JSON.stringify(doc);
    expect(validateDocument(doc)).toEqual([]);
    expect(CatalogDocumentSchema.parse(JSON.parse(before))).toStrictEqual(doc);
    expect(JSON.stringify(doc)).toBe(before);
    expect(CatalogDocumentSchema.safeParse({...doc,trackQ:[1],zoom:2}).success).toBe(false);
  });
  it('rejects authored geometry outside the proof page shape, duplicate document IDs and dangling assets',()=>{
    const doc=makeFixture('G03');
    expect(CatalogDocumentSchema.safeParse({...doc,pages:[{...doc.pages[0],widthMm:216}]}).success).toBe(false);
    doc.assets=[];
    expect(validateDocument(doc).map(d=>d.code)).toContain('ASSET_REFERENCE_DANGLING');
    doc.pages[0].objects[1].id=doc.pages[0].objects[0].id;
    expect(validateDocument(doc).map(d=>d.code)).toContain('DUPLICATE_ID');
  });
});

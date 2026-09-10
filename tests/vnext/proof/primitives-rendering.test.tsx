import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CatalogDocumentSchema,
  EditorialObjectSchema,
  TextStyleSchema,
  plainRichText,
  validateDocument,
  type CatalogDocument,
  type EditorialObject,
} from '@/vnext';
import { layoutReport } from '@/vnext/publication';
import { DocumentRenderer, compilePlans, imageObjectPosition } from '@/vnext/rendering';
import { documentStyle, emptyTable } from './test-data';

const frame=(xMm:number,yMm:number,widthMm=20,heightMm=20)=>({xMm,yMm,widthMm,heightMm});
const asset=(id:string,mime:'image/png'|'image/jpeg'='image/png')=>({
  id,
  version:'w2a-test',
  sha256:'a'.repeat(64),
  mime,
  widthPx:100,
  heightPx:80,
  name:id,
  alt:`Asset ${id}`,
});

function representativeDocument():CatalogDocument {
  const table=emptyTable(1,1);
  const objects:EditorialObject[]=[
    {id:'image',type:'image',frame:frame(20,20),zIndex:2,assetId:'photo',fit:'cover',focalPoint:{x:0.25,y:0.75}},
    {id:'text',type:'text',frame:frame(10,10,50,12),zIndex:0,text:plainRichText('local','Texto PRESYS'),style:{}},
    {id:'shape',type:'shape',frame:frame(70,10),zIndex:0,shape:'ellipse',style:{fill:'#173F52',stroke:{pattern:'solid',thicknessPt:1,color:'#FFFFFF'}}},
    {id:'table-object',type:'table',frame:frame(10,40,80,35),zIndex:1,table},
    {id:'line',type:'line',frame:frame(10,80,80,1),zIndex:3,axis:'horizontal',color:'#173F52'},
    {id:'icon',type:'icon',frame:frame(95,40,12,12),zIndex:4,assetId:'asset-icon'},
  ];
  return {
    schemaVersion:1,
    id:'w2a-document',
    title:'W2.A primitives',
    locale:'pt-BR',
    style:documentStyle,
    pages:[{id:'page',widthMm:210,heightMm:297,objects}],
    assets:[asset('photo','image/jpeg'),asset('asset-icon')],
  };
}

describe('W2.A primitive domain contracts',()=>{
  it('accepts only standalone Text typography/alignment style fields',()=>{
    const accepted={fontFamily:'Noto Sans',fontSizePt:10,lineHeight:1.25,fontWeight:700 as const,color:'#173F52',textAlign:'center' as const};
    expect(TextStyleSchema.parse(accepted)).toEqual(accepted);
    for(const rejected of [
      {...accepted,background:'#FFFFFF'},
      {...accepted,paddingMm:{top:1}},
      {...accepted,borders:{top:{pattern:'solid',thicknessPt:1,color:'#173F52'}}},
      {...accepted,unknownField:true},
    ])expect(TextStyleSchema.safeParse(rejected).success).toBe(false);

    const base={id:'text-style',type:'text',frame:frame(1,2,30,17),zIndex:0,text:plainRichText('text-style','Estilo canônico')} as const;
    expect(EditorialObjectSchema.safeParse({...base,style:accepted}).success).toBe(true);
    expect(EditorialObjectSchema.safeParse({...base,style:{background:'#FFFFFF'}}).success).toBe(false);
    expect(EditorialObjectSchema.safeParse({...base,style:{paddingMm:{top:1}}}).success).toBe(false);
    expect(EditorialObjectSchema.safeParse({...base,style:{borders:{top:{pattern:'none'}}}}).success).toBe(false);
    expect(EditorialObjectSchema.safeParse({...base,style:{surprise:true}}).success).toBe(false);
  });

  it('uses frame.heightMm as the sole authored Text physical height authority',()=>{
    const text={id:'text',type:'text',frame:frame(1,2,30,17),zIndex:0,text:plainRichText('text','Altura canônica'),style:{}} as const;
    expect(EditorialObjectSchema.safeParse(text).success).toBe(true);
    expect(EditorialObjectSchema.safeParse({...text,height:{mode:'fixed',mm:17}}).success).toBe(false);
    const parsed=EditorialObjectSchema.parse(JSON.parse(JSON.stringify(text)));
    expect(parsed.frame.heightMm).toBe(17);
    expect('height' in parsed).toBe(false);
  });

  it('keeps paragraph and inline identity local to each independent RichText',()=>{
    const doc=representativeDocument();
    const page=doc.pages[0];
    const first:EditorialObject={id:'text-a',type:'text',frame:frame(10,100,50,12),zIndex:5,text:plainRichText('shared','Primeiro'),style:{}};
    const second:EditorialObject={id:'text-b',type:'text',frame:frame(10,115,50,12),zIndex:6,text:plainRichText('shared','Segundo'),style:{}};
    const candidate={...doc,pages:[{...page,objects:[...page.objects,first,second]}]};
    expect(CatalogDocumentSchema.safeParse(candidate).success).toBe(true);
    expect(validateDocument(candidate).filter(diagnostic=>diagnostic.severity==='ERROR')).toEqual([]);
  });

  it('validates normalized Image focal points and resolves deterministic fit positioning',()=>{
    const base={id:'image',type:'image',frame:frame(0,0),zIndex:0,assetId:'photo',fit:'cover'} as const;
    expect(EditorialObjectSchema.safeParse(base).success).toBe(true);
    expect(imageObjectPosition(base)).toBe('50% 50%');
    for(const focalPoint of [{x:0,y:0},{x:1,y:1},{x:0,y:1},{x:1,y:0}])
      expect(EditorialObjectSchema.safeParse({...base,focalPoint}).success).toBe(true);
    for(const focalPoint of [{x:-0.001,y:0.5},{x:1.001,y:0.5},{x:0.5,y:-1},{x:0.5,y:2},{x:Number.NaN,y:0.5}])
      expect(EditorialObjectSchema.safeParse({...base,focalPoint}).success).toBe(false);
    expect(imageObjectPosition({...base,focalPoint:{x:0,y:1}})).toBe('0% 100%');
    expect(imageObjectPosition({...base,fit:'contain',focalPoint:{x:0,y:1}})).toBe('50% 50%');
    const explicit={...base,focalPoint:{x:0.2,y:0.8}};
    expect(EditorialObjectSchema.parse(JSON.parse(JSON.stringify(explicit)))).toEqual(explicit);
  });

  it('accepts exactly the W2.A primitive variants and keeps Frame as geometry authority',()=>{
    const doc=representativeDocument();
    for(const object of doc.pages[0].objects)expect(EditorialObjectSchema.safeParse(object).success).toBe(true);
    expect(EditorialObjectSchema.safeParse({id:'group',type:'group',frame:frame(0,0),zIndex:0,children:[]}).success).toBe(false);
    expect(EditorialObjectSchema.safeParse({...doc.pages[0].objects[2],xMm:40}).success).toBe(false);
    expect(EditorialObjectSchema.safeParse({id:'shape-path',type:'shape',frame:frame(0,0),zIndex:0,shape:'path',style:{}}).success).toBe(false);
    expect(EditorialObjectSchema.safeParse({id:'line-diagonal',type:'line',frame:frame(0,0),zIndex:0,axis:'diagonal',color:'#173F52'}).success).toBe(false);
    expect(EditorialObjectSchema.safeParse({id:'icon-html',type:'icon',frame:frame(0,0),zIndex:0,assetId:'asset-icon',html:'<svg/>'}).success).toBe(false);
  });

  it('fails closed when standalone Image or Icon asset references dangle',()=>{
    const doc=representativeDocument();
    const broken={...doc,assets:[]};
    const diagnostics=validateDocument(broken);
    expect(diagnostics.filter(diagnostic=>diagnostic.code==='ASSET_REFERENCE_DANGLING').map(diagnostic=>diagnostic.objectId).sort())
      .toEqual(['icon','image']);
  });
});

describe('W2.A publication-safe primitive rendering',()=>{
  it('renders every supported primitive through the production renderer in deterministic z-order',()=>{
    const doc=representativeDocument();
    const beforeTable=JSON.stringify(doc.pages[0].objects.find(object=>object.type==='table'));
    const {plans,diagnostics}=compilePlans(doc);
    expect(diagnostics).toEqual([]);
    const html=renderToStaticMarkup(<DocumentRenderer document={doc} plans={plans} assetUrls={new Map([['photo','/photo.jpg'],['asset-icon','/icon.png']])}/>);
    expect(html).toContain('data-primitive-type="text"');
    expect(html).toContain('data-primitive-type="image"');
    expect(html).toContain('data-table-id="table"');
    expect(html).toContain('data-primitive-type="shape"');
    expect(html).toContain('data-primitive-type="line"');
    expect(html).toContain('data-primitive-type="icon"');
    expect(html.indexOf('data-object-id="text"')).toBeLessThan(html.indexOf('data-object-id="shape"'));
    expect(html.indexOf('data-object-id="shape"')).toBeLessThan(html.indexOf('data-object-id="table-object"'));
    expect(html.indexOf('data-object-id="table-object"')).toBeLessThan(html.indexOf('data-object-id="image"'));
    expect(JSON.stringify(doc.pages[0].objects.find(object=>object.type==='table'))).toBe(beforeTable);
  });

  it('does not emit universal publication noise for ordinary intentional overlap',()=>{
    const doc=representativeDocument();
    doc.pages[0].objects=[
      {id:'background',type:'shape',frame:frame(20,20,60,30),zIndex:0,shape:'rectangle',style:{fill:'#173F52'}},
      {id:'badge',type:'shape',frame:frame(30,25,20,15),zIndex:1,shape:'ellipse',style:{fill:'#FFFFFF'}},
    ];
    const diagnostics=layoutReport(doc,new Map(),{facts:[],geometryDiagnostics:[]},document.createElement('div'));
    expect(diagnostics).not.toContainEqual(expect.objectContaining({code:'OBJECT_OVERLAP'}));
    expect(diagnostics).toEqual([]);
  });
});

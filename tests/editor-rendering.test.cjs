const test = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { installTsHook, memoryStorage } = require('./helpers/load-ts.cjs')
const mockModules = {
  'next/image': function TestImage({ unoptimized, ...props }) { void unoptimized; return React.createElement('img', props) },
}
const restore = installTsHook({ mockModules })
const data = require('../lib/catalog/section-data.ts')
mockModules['@/lib/catalog/section-data'] = data
mockModules['@/lib/ai/translations'] = require('../lib/ai/translations.ts')
const types = require('../lib/types/catalog-builder.ts')
const renderers = require('../components/preview/sections/catalog-sections.tsx')
const { CatalogPages } = require('../components/preview/catalog-pages.tsx')
const { createPrintSnapshot, preflightDocument, preflightLayout, readPrintSnapshot } = require('../lib/pdf/print-document.ts')
const { validateImageFile, mediaUploadPath } = require('../lib/catalog/media.ts')
test.after(restore)

const tokens = { colors: { primary:'#003366', dark:'#001a33', accent:'#2563eb', headerBg:'#003366', headerText:'#fff', border:'#ddd', surface:'#fafafa' }, fonts:{ body:'Arial', heading:'Arial', data:'monospace' }, spacing:{pageMarginMm:12,sectionGapMm:5,cellHeightPx:25} }
const contact = { companyName:'Empresa', logoUrl:'', website:'example.test', phone:'123', email:'team@example.test' }
const product = (id, specs) => ({id,catalog_id:'catalog',sku:id,name:`Produto ${id}`,family:'Instrumentos',status:'approved',sort_order:0,data:{specs,marketing:{title:`Produto ${id}`,images:[]}},version:1,created_at:'2026-08-31',updated_at:'2026-08-31',updated_by:null})
const A = product('A',[{param:'Faixa',value:'0 a 10 V'}])
const B = product('B',[{param:'Faixa',value:'0 a 24 V'},{param:'Corrente',value:0}])
const render = (name, section, selected=B) => renderToStaticMarkup(React.createElement(renderers[name],{section,product:selected,tokens,contact,allProducts:[A,B]}))
const documentInput = (sections) => ({ catalog:{id:'catalog',name:'Ficha técnica',locale:'pt-BR'},products:[A,B],pages:[types.createPage('Dados técnicos',sections)],designTokens:tokens,contact,selectedProductId:'B' })

test('product binding ignores stale template values and preserves the complete second product', () => {
  const section = types.createSection('specs_table',{content:{rows:A.data.specs}})
  const before = JSON.stringify(B)
  const html = render('SpecsTableSection',section)
  assert.match(html,/0 a 24 V/)
  assert.match(html,/Corrente/)
  assert.doesNotMatch(html,/0 a 10 V/)
  assert.equal(JSON.stringify(B),before)
  assert.deepEqual(data.sectionContent(section,B).rows,B.data.specs)
  assert.equal(data.productPath('specs_table','rows'),'specs')
})

test('editorial tables and text never implicitly borrow data from a product', () => {
  const section = types.createSection('specs_table',{config:{dataSource:'section'},content:{rows:A.data.specs}})
  assert.match(render('SpecsTableSection',section),/0 a 10 V/)
  assert.equal(data.sectionContent(types.createSection('text_block',{content:{text:'Empresa independente'}}),B).text,'Empresa independente')
  assert.equal(data.productPath('text_block','text'),'marketing.overview')
})

test('fixed product reference resolves by id and missing products do not fall back silently', () => {
  assert.equal(data.sectionProduct(types.createSection('specs_table',{config:{productId:'A'}}),B,[A,B]),A)
  assert.equal(data.sectionProduct(types.createSection('specs_table',{config:{productId:'deleted'}}),B,[A,B]),null)
})

test('custom table follows declared columns, preserving zero and false', () => {
  const html = render('CustomTableSection',types.createSection('custom_table',{config:{columns:['A','B','C']},content:{rows:[{B:0,A:'first',C:false}]}}))
  const cells = [...html.matchAll(/<td\b[^>]*>(.*?)<\/td>/g)].map(match=>match[1])
  assert.deepEqual(cells,['first','0','false'])
  assert.deepEqual(data.tableCells(['first',0,false],['A','B','C']),['first',0,false])
})

test('ordering codes display editorial content even with empty default config', () => {
  const html = render('OrderingCodesSection',types.createSection('ordering_codes',{content:{segments:[{segment:'ABC-123',description:'Opção aprovada'}]}}))
  assert.match(html,/ABC-123/)
})

test('removing a diagram never displays an unrelated commercial photo', () => {
  const withPhoto={...B,data:{...B.data,marketing:{images:['https://example.test/photo.jpg']}}}
  const html=render('SingleImageSection',types.createSection('single_image',{content:{imageUrl:'',url:''}}),withPhoto)
  assert.doesNotMatch(html,/photo.jpg/)
  assert.match(html,/Nenhuma imagem/)
})

test('section reorder resolves visible identities against the canonical array', () => {
  const sections=[types.createSection('text_block',{id:'hidden',visible:false}),types.createSection('text_block',{id:'first'}),types.createSection('text_block',{id:'second'})]
  const [from,to]=data.moveSectionIndices(sections,'second','first')
  const [moved]=sections.splice(from,1); sections.splice(to,0,moved)
  assert.deepEqual(sections.map(item=>item.id),['hidden','second','first'])
  assert.equal(data.moveSectionIndices(sections,'missing','first'),null)
})

test('defaults are independent and merge configuration overrides', () => {
  const first=types.createSection('ordering_codes'),second=types.createSection('ordering_codes')
  first.config.segments.push({segment:'ONLY-FIRST'})
  assert.deepEqual(second.config.segments,[])
  assert.equal(types.createSection('hero_banner',{config:{showImage:false}}).config.showLogo,true)
})

test('pure document uses real margins, gaps and half-width grid without editor controls', () => {
  const page=types.createPage('Editorial',[types.createSection('text_block',{style:{widthPercent:50},content:{text:'Nota institucional'}})])
  const html=renderToStaticMarkup(React.createElement(CatalogPages,{pages:[page],product:B,allProducts:[A,B],tokens,contact}))
  assert.match(html,/padding:12mm/)
  assert.match(html,/gap:5mm/)
  assert.match(html,/grid-column:span 6/)
  assert.doesNotMatch(html,/<button|<input|transform:/)
})

test('comparison includes specifications absent from first model and filters model ids', () => {
  assert.match(render('ComparisonGridSection',types.createSection('comparison_grid')),/Corrente/)
  const selected=types.createSection('comparison_grid',{config:{models:['B']}})
  assert.match(render('ComparisonGridSection',selected),/pelo menos dois/)
})

test('print snapshot stays immutable while live workspace changes and is consumed once', () => {
  const input=documentInput([types.createSection('specs_table')])
  const snapshot=createPrintSnapshot(input)
  const storage=memoryStorage()
  storage.setItem('catalog-builder-print:example',JSON.stringify(snapshot))
  input.pages[0].title='Changed after export'
  assert.equal(snapshot.pages[0].title,'Dados técnicos')
  assert.equal(readPrintSnapshot(storage,'example').pages[0].title,'Dados técnicos')
  assert.throws(()=>readPrintSnapshot(storage,'example'),/expirou/)
})

test('preflight rejects incomplete technical fields and missing diagram but accepts numeric zero', () => {
  assert.deepEqual(preflightDocument(documentInput([types.createSection('specs_table')])),[])
  const issues=preflightDocument(documentInput([types.createSection('single_image'),types.createSection('specs_table',{config:{dataSource:'section'},content:{rows:[{param:'Faixa',value:''}]}})]))
  assert.equal(issues.filter(issue=>issue.severity==='error').length,2)
})

test('layout preflight flags overflow and broken media rather than exporting silently', () => {
  const page={dataset:{pageId:'page'},scrollHeight:1200,clientHeight:1122,scrollWidth:794,clientWidth:794,getAttribute:()=> 'Página',querySelectorAll:()=>[{complete:true,naturalWidth:0,clientWidth:120,alt:'Diagrama'}],querySelector:()=>null}
  const result=preflightLayout({querySelectorAll:()=>[page]})
  assert.equal(result.filter(issue=>issue.severity==='error').length,2)
})

test('media validation rejects unsupported format, oversize local data and unsafe path characters', () => {
  assert.match(validateImageFile({name:'drawing.svg',size:100,type:'image/svg+xml'},false),/JPEG/)
  assert.match(validateImageFile({name:'photo.png',size:600000,type:'image/png'},true),/500 KB/)
  assert.equal(validateImageFile({name:'photo.webp',size:1000,type:'image/webp'},false),null)
  assert.equal(mediaUploadPath('../A/B','image/png','safe-id'),'products/---A-B/safe-id.png')
})

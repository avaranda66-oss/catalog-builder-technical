import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root=process.cwd(), port=5394, folder=resolve(root,'scratch/six-model-a4-proof');
await mkdir(folder,{recursive:true});
const server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port,strictPort:true}});
await server.listen();
let browser;
try {
  const { createSixModelSyntheticSpecifications } =
    await server.ssrLoadModule('/src/vnext/ai-catalog/six-model-fixture.ts');
  const source=await createSixModelSyntheticSpecifications();
  const expected=source.sections.flatMap(section => [source.models.slice(0,3),source.models.slice(3,6)].map(models => [
    ['Característica',...models,'Unidade','Condição / observação'],
    ...section.rows.map(row=>[row.label,...models.map(model=>row.values[source.models.indexOf(model)].status==='known'
      ?row.values[source.models.indexOf(model)].candidate.value
      :row.values[source.models.indexOf(model)].status==='conflict'?'Revisar conflito':'Não informado'),row.unit,row.condition])
  ]));
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:960},acceptDownloads:true});
  const page=await context.newPage();page.setDefaultTimeout(40000);
  const errors=[],external=[];
  page.on('pageerror',err=>errors.push(String(err)));
  page.on('request',req=>{
    if (![ 'http://127.0.0.1:'+port+'/', 'data:', 'blob:' ].some(prefix=>req.url().startsWith(prefix)))
      external.push(new URL(req.url()).hostname);
  });
  await page.addInitScript(()=>{window.__QA_PRINT__=0;window.print=()=>{window.__QA_PRINT__++;};});
  await page.goto('http://127.0.0.1:'+port+'/ai-catalog-prototype.html');
  await page.getByRole('button',{name:'Criar com IA',exact:true}).click();
  await page.getByLabel('Arquivo de especificações sintéticas').setInputFiles({
    name:'synthetic-six-variant-technical-benchmark.json',
    mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))
  });
  await page.getByLabel('Descreva o catálogo').fill('Crie uma comparação por seção.');
  await page.getByRole('button',{name:'Gerar catálogo',exact:true}).click();
  await page.waitForFunction(()=>['READY','BLOCKED'].includes(
    document.querySelector('[data-prototype-layout]')?.getAttribute('data-prototype-layout')));
  const status=await page.locator('[data-prototype-layout]').first().getAttribute('data-prototype-layout');
  const diagnostics=await page.locator('[data-prototype-diagnostic]').allTextContents();
  if(status!=='READY') {
    await page.screenshot({path:resolve(folder,'blocked.png')});
    await writeFile(resolve(folder,'blocked-receipt.json'),JSON.stringify({status,diagnostics}));
    throw new Error('SIX_MODEL_PHYSICAL_PUBLICATION_BLOCKED '+diagnostics.slice(0,12).join(' / '));
  }
  const getMatrices=()=>page.locator('.ai-pages [data-table-id]').evaluateAll(tables=>tables.map(table=>
    [...table.querySelectorAll('[role=row]')].map(row=>[...row.querySelectorAll('[data-cell-id]')].map(cell=>
      [...cell.querySelectorAll('[data-flow-root] [data-paragraph-id]')].map(p=>p.textContent).join('\n')))));
  assert.deepEqual(await getMatrices(),expected);
  await page.screenshot({path:resolve(folder,'six-models-split-across-a4-preview.png')});
  await page.getByRole('combobox',{name:'Resolver TX-062 Exatidão de corrente'}).selectOption('1');
  await page.getByRole('checkbox',{name:'Manter “Não informado” e reconhecer a ausência'}).check();
  await page.getByRole('button',{name:'Aceitar catálogo para revisão'}).click();
  await page.getByRole('checkbox',{name:'Conferi os dados e a disposição das dúvidas desta versão'}).check();
  await page.getByRole('button',{name:'Salvar versão aprovada'}).click();
  await page.getByRole('button',{name:'Revisar publicação / PDF'}).click();
  await page.locator('[data-publication-status="READY"]').waitFor();
  await page.getByRole('button',{name:'Imprimir / salvar PDF',exact:true}).click();
  await page.waitForFunction(()=>window.__QA_PRINT__===1);
  await page.emulateMedia({media:'print'});
  const file=resolve(folder,'six-models-split-A4.pdf');
  await page.pdf({path:file,format:'A4',preferCSSPageSize:true,printBackground:true,
    margin:{top:'0',right:'0',bottom:'0',left:'0'},displayHeaderFooter:false});
  const bytes=await readFile(file);const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:false}).promise;
  assert.equal(pdf.numPages,4);
  const text=[];
  for(let n=1;n<=pdf.numPages;n++){
    const p=await pdf.getPage(n),v=p.getViewport({scale:1});
    assert(Math.abs(v.width*25.4/72-210)<0.25);
    assert(Math.abs(v.height*25.4/72-297)<0.25);
    text.push((await p.getTextContent()).items.filter(x=>'str'in x).map(x=>x.str).join(' '));
  }
  await pdf.destroy();
  for(const model of source.models)assert(text.join(' ').includes(model),'Missing model in PDF: '+model);
  const hash=createHash('sha256').update(bytes).digest('hex');
  const receipt={status:'PASS',scenario:'SIX_VARIANTS_SPLIT_3_AND_3',
    input:'SYNTHETIC_ORIGINAL_NOT_REAL_ADDITEL',
    modelCount:source.models.length,rowCount:source.sections.reduce((sum,sec)=>sum+sec.rows.length,0),
    auditedValuePositions:source.models.length*14,a4Pages:pdf.numPages,
    modelGroups:[source.models.slice(0,3),source.models.slice(3,6)],
    pdfSha256:hash,pdfBytes:bytes.length,actualGeminiCalls:0,externalRequests:external,errors};
  assert.deepEqual(errors,[]);
  assert.deepEqual(external,[]);
  await writeFile(resolve(folder,'receipt.json'),JSON.stringify(receipt,null,2));
  console.log('SIX_VARIANT_PDF_PROOF_PASS',JSON.stringify(receipt));
  await context.close();
}finally{await browser?.close();await server.close();}

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root=process.cwd(), port=5395;
const out=resolve(root,'scratch/gemini-multiturn-browser-proof');
await mkdir(out,{recursive:true});
const KEY='SYNTHETIC_NEVER_VALID_FOR_GOOGLE_12345';
process.env.VITE_SUPABASE_URL='https://gemini-mock.example.invalid';
process.env.VITE_SUPABASE_ANON_KEY='FAKE_PUBLIC_SUPABASE_ANON';
process.env.VITE_VNEXT_CATALOG_AGENT_ENABLED='true';
const server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port,strictPort:true}});
await server.listen();
let browser;
try {
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1420,height:930}});
  const page=await context.newPage();
  const errors=[], network=[], requests=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{
    if(!r.url().startsWith('http://127.0.0.1:'+port+'/') &&
      !r.url().startsWith('blob:') && !r.url().startsWith('data:'))
      network.push({host:new URL(r.url()).hostname,method:r.method()});
  });
  await page.route('https://gemini-mock.example.invalid/**',async route=>{
    if(route.request().method()==='OPTIONS'){
      return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*',
        'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
        'Access-Control-Allow-Methods':'POST, OPTIONS'}});
    }
    if(new URL(route.request().url()).pathname!=='/functions/v1/vnext-catalog-agent')
      return route.fulfill({status:401,body:'{}'});
    const body=route.request().postDataJSON();
    assert.equal(body.credential?.apiKey,KEY);
    assert.equal(body.credential?.provider,'gemini');
    assert.equal(body.task,'plan_catalog');
    assert.equal(body.history===undefined || Array.isArray(body.history),true);
    assert.equal(JSON.stringify(body).includes('±0,0100'),false);
    requests.push({message:body.message,history:body.history??[],models:body.models,sections:body.sections});
    const result=requests.length===1 ? {
      status:'clarification',question:'Devo começar pelas especificações elétricas?'
    } : {
      status:'proposal',
      plan:{version:1,template:'comparison-a4-v1',style:'comparison',
        sectionOrder:['electrical','thermal'],rowsPerPage:8}
    };
    return route.fulfill({status:200,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'},
      body:JSON.stringify({code:'OK',reply:result})});
  });
  await page.goto('http://127.0.0.1:'+port+'/ai-catalog-prototype.html');
  await page.getByText('Configurar provedores de IA no dispositivo').click();
  await page.getByRole('textbox',{name:'Chave API do provedor'}).fill(KEY);
  await page.getByRole('textbox',{name:'Senha de proteção do cofre'}).fill('Only-Local-Fake-Password-2026');
  await page.getByRole('button',{name:'Salvar chave criptografada'}).click();
  await page.getByRole('textbox',{name:'Desbloquear cofre'}).fill('Only-Local-Fake-Password-2026');
  await page.getByRole('button',{name:'Desbloquear para esta sessão'}).click();
  await page.getByRole('button',{name:'Criar com IA',exact:true}).click();
  await page.getByRole('button',{name:'Usar especificações de exemplo'}).click();
  await page.getByRole('button',{name:'Propor organização com Gemini'}).click();
  await page.getByRole('log',{name:'Conversa sobre o catálogo'}).getByText(
    'Devo começar pelas especificações elétricas?',{exact:false}).waitFor();
  await page.getByRole('textbox',{name:'Seu pedido para o Gemini'})
    .fill('Sim, comece por elétrica, mantenha a seção térmica.');
  await page.getByRole('button',{name:'Propor organização com Gemini'}).click();
  await page.getByRole('button',{name:'Confirmar proposta e gerar catálogo'}).waitFor();
  assert.equal(requests.length,2);
  assert.equal(requests[0].history.length,0);
  assert.deepEqual(requests[1].history,[
    {role:'user',message:'Crie um catálogo profissional comparando estes modelos.'},
    {role:'assistant',message:'Devo começar pelas especificações elétricas?'},
  ]);
  await page.getByRole('button',{name:'Confirmar proposta e gerar catálogo'}).click();
  await page.getByRole('button',{name:'Aceitar catálogo para revisão'}).waitFor();
  await page.screenshot({path:resolve(out,'approved-two-turn-plan.png'),fullPage:false});
  assert.deepEqual(errors,[]);
  assert.equal(network.filter(x=>x.method==='POST').length,2);
  const receipt={status:'PASS',mode:'MOCK_GEMINI_NOT_REAL',
    userTurns:2,assistantTurns:2,requestCount:2,
    firstClarification:true,secondPlanApproved:true,
    historySentOnFollowUp:requests[1].history,
    pdfTechnicalValuesSentToModel:false,customerPdfBytesUploaded:false,
    actualModelCalls:0,errors};
  await writeFile(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2));
  console.log('GEMINI_TWO_TURN_BROWSER_PASS',JSON.stringify(receipt));
  await context.close();
}finally{await browser?.close();await server.close();}

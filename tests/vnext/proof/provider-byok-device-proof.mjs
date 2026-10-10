import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const dest=resolve(root,'scratch/provider-local-byok-proof');
await mkdir(dest,{recursive:true});
const port=Number(process.env.BYOK_PROOF_PORT||5498);
const server=await createServer({root,logLevel:'error',server:{
 host:'127.0.0.1',port,strictPort:true,fs:{allow:[root,realpathSync(resolve(root,'node_modules'))]},
}});
await server.listen();
let browser;
const fake='TEST_ONLY_PROVIDER_CREDENTIAL_DO_NOT_USE_AS_REAL_API_KEY_0123456789';
const pass='unit-only-long-unique-passphrase';
const providerRows=[];
try {
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:840}});
 const page=await context.newPage();
 const errors=[],external=[];
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:'+port+'/')&&
 !request.url().startsWith('data:')&&!request.url().startsWith('blob:'))external.push(request.url());});
 await page.goto('http://127.0.0.1:'+port+'/ai-catalog-prototype.html');
 await page.getByText('Configurar provedores de IA no dispositivo').click();
 await page.locator('#vnext-provider').selectOption('gemini');
 await page.getByLabel('Chave API do provedor').fill(fake);
 await page.getByLabel('Senha de proteção do cofre').fill(pass);
 await page.getByRole('button',{name:'Salvar chave criptografada'}).click();
 await page.getByText('Status: Salvo e bloqueado').waitFor();
 const records=await page.evaluate(async()=>{
  return await new Promise((resolve,reject)=>{
   const open=indexedDB.open('vnext-device-provider-vault-v1');
   open.onsuccess=()=>{
    const db=open.result,query=db.transaction('provider-credentials').objectStore('provider-credentials').getAll();
    query.onsuccess=()=>{resolve(query.result);db.close();};
    query.onerror=()=>reject(new Error('VAULT_QUERY'));
   };open.onerror=()=>reject(new Error('VAULT_OPEN'));
  });
 });
 assert.equal(records.length,1);
 assert.equal(records[0].provider,'gemini');
 assert(!JSON.stringify(records).includes(fake));
 assert(!JSON.stringify(records).includes(pass));
 assert.match(records[0].ciphertext,/^[A-Za-z0-9+/]+=*$/);
 await page.getByLabel('Desbloquear cofre').fill('wrong-password');
 await page.getByRole('button',{name:'Desbloquear para esta sessão'}).click();
 await page.getByRole('alert').getByText(/Não foi possível desbloquear/).waitFor();
 await page.getByLabel('Desbloquear cofre').fill(pass);
 await page.getByRole('button',{name:'Desbloquear para esta sessão'}).click();
 await page.getByText('Status: Desbloqueado nesta sessão').waitFor();
 await page.reload();
 await page.getByText('Configurar provedores de IA no dispositivo').click();
 await page.getByText('Status: Salvo e bloqueado').waitFor();
 await page.screenshot({path:resolve(dest,'vault-locked-after-reload.png')});
 await page.getByRole('button',{name:'Remover chave do dispositivo'}).click();
 await page.getByText('Status: Sem chave cadastrada').waitFor();
 const countAfter=await page.evaluate(async()=>await new Promise((resolve,reject)=>{
  const open=indexedDB.open('vnext-device-provider-vault-v1');
  open.onsuccess=()=>{const db=open.result,req=db.transaction('provider-credentials').objectStore('provider-credentials').count();
    req.onsuccess=()=>{resolve(req.result);db.close();}; req.onerror=()=>reject(new Error('COUNT'));};
  open.onerror=()=>reject(new Error('OPEN'));
 }));
 assert.equal(countAfter,0);
 assert.deepEqual(errors,[]);
 assert.deepEqual(external,[]);
 const receipt={result:'PASS',scenarios:['encrypt-and-store','no-plaintext-at-rest','wrong-password-rejected','unlock','lock-after-reload','delete'],savedProviders:['gemini'],providerNetworkCalls:0,errors,external,browser:browser.version()};
 await writeFile(resolve(dest,'result.json'),JSON.stringify(receipt,null,2));
 console.log('BYOK_DEVICE_VAULT_BROWSER_PASS',JSON.stringify(receipt));
 await context.close();
} finally {await browser?.close();await server.close();}

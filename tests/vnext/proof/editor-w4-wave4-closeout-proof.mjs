import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const output=resolve(root,'scratch/w4g-wave4-closeout-proof'); await mkdir(output,{recursive:true});
const port=Number(process.env.W4G_PROOF_PORT??5251);
const server=await createServer({root,server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[root,realpathSync(resolve(root,'node_modules'))]}},logLevel:'error'});
const url=`http://127.0.0.1:${port}/tests/vnext/proof/fixtures/w4g-wave4-closeout-browser.html`;
const errors={consoleErrors:[],pageErrors:[],failedResources:[],requestFailures:[]};
const watch=p=>{p.on('console',m=>{if(m.type()==='error')errors.consoleErrors.push(m.text())});p.on('pageerror',e=>errors.pageErrors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.failedResources.push({status:r.status(),url:r.url()})});p.on('requestfailed',r=>errors.requestFailures.push(r.url()))};
const state=p=>p.evaluate(()=>window.__W4G_PROOF__.state());
const settle=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function seq(p,n){await p.waitForFunction(s=>window.__W4G_PROOF__.state().localSequence>s,n,{timeout:15000});await settle(p)}
const main=s=>{const o=s.document.pages[0].objects.find(x=>x.id==='w4f1-table-object');assert.equal(o?.type,'table');return o};
const obj=(s,id)=>{const o=s.document.pages[0].objects.find(x=>x.id===id);assert(o);return o};
async function enter(p){if(!await p.locator('[data-table-grid-overlay]').count()){await p.locator('[data-editor-object-id="w4f1-table-object"]').click();await p.locator('[data-editor-action="edit-table"]').click();await p.locator('[data-table-grid-overlay]').waitFor({timeout:20000})}}
async function noOverflow(p,w){const g=await p.evaluate(()=>({v:innerWidth,d:document.documentElement.scrollWidth,b:document.body.scrollWidth}));assert.equal(g.v,w);assert(g.d<=w&&g.b<=w,JSON.stringify(g));return g}

async function desktop(browser){
 const c=await browser.newContext({viewport:{width:1500,height:1100}}),p=await c.newPage();watch(p);await p.goto(url,{waitUntil:'domcontentloaded'});await p.locator('[data-vnext-shell]').waitFor({timeout:30000});
 const ids=await p.evaluate(()=>({primary:window.__W4G_PROOF__.primaryId,other:window.__W4G_PROOF__.otherId,image:window.__W4G_PROOF__.imageId,text:window.__W4G_PROOF__.textId,line:window.__W4G_PROOF__.lineId}));
 // W4.E diagnostic navigation + W4.A real Table entry/measured grid.
 await p.locator('[data-editor-object-id="w4f1-table-object"]').click();await p.locator('[data-diagnostic-code="TABLE_CONTENT_OVERFLOW"]').waitFor({timeout:30000});
 await p.locator('[data-editor-action="edit-table"]').click();await p.locator('[data-table-grid-overlay]').waitFor();
 const cellBox=await p.locator('[data-table-cell="0:0"]').boundingBox();assert(cellBox?.width>0&&cellBox?.height>0);
 // W4.E Table-mode diagnostic navigation is zero-history: induce a real fixed-row overflow, Localizar, then restore.
 const originalRowHeightPolicy=structuredClone(main(await state(p)).table.rows[0].heightPolicy);await p.locator('[data-table-row-selector="0"]').click();const rowHeight=p.locator('[data-row-property="height-mm"]');let diagnosticBefore=(await state(p)).localSequence;
 await rowHeight.fill('2');await rowHeight.blur();await seq(p,diagnosticBefore);const rowDiagnostic=p.locator('[data-diagnostic-code="ROW_CONTENT_OVERFLOW"]').first();await rowDiagnostic.waitFor({timeout:30000});
 const locateBefore=(await state(p)).localSequence;await rowDiagnostic.locator('[data-diagnostic-action="locate"]').click();await settle(p);assert.equal((await state(p)).localSequence,locateBefore);assert(await p.locator('[data-table-grid-overlay]').isVisible());
 const diagnosticUndoBefore=(await state(p)).localSequence;await p.locator('[data-editor-action="undo"]').click();await seq(p,diagnosticUndoBefore);assert.deepEqual(main(await state(p)).table.rows[0].heightPolicy,originalRowHeightPolicy);
 const a0=await state(p);await p.locator('[data-table-row-selector="3"]').click();await p.locator('[data-editor-action="insert-row-after"]').click();await seq(p,a0.localSequence);assert.equal(main(await state(p)).table.rows.length,5);
 // W4.B local draft is ephemeral until canonical commit.
 await p.locator('[data-table-cell="1:0"]').click();await p.locator('[data-table-grid-overlay]').press('Enter');await p.locator('[data-cell-edit-session]').waitFor();
 const b0=await state(p), beforeCell=structuredClone(main(b0).table.cells.find(x=>x.id==='w4f1-cell-1-0').content);await p.locator('[data-cell-rich-text]').fill('Integração W4.G');
 assert.deepEqual(main(await state(p)).table.cells.find(x=>x.id==='w4f1-cell-1-0').content,beforeCell);
 await p.locator('[data-editor-action="commit-cell-content"]').click();await seq(p,b0.localSequence);
 // W4.C merge/unmerge established semantics.
 await p.locator('[data-table-cell="3:0"]').click();await p.locator('[data-table-cell="3:1"]').click({modifiers:['Shift']});let n=(await state(p)).localSequence;
 await p.locator('[data-editor-action="merge-cells"]').click();await seq(p,n);assert.equal(main(await state(p)).table.cells.find(x=>x.id==='w4f1-cell-3-0').span.columns,2);
 n=(await state(p)).localSequence;await p.locator('[data-editor-action="unmerge-cell"]').click();await seq(p,n);
 // W4.D TSV fallback + Marker/Legend.
 await p.locator('[data-table-cell="2:0"]').click();await p.locator('[data-table-cell="2:1"]').click({modifiers:['Shift']});n=(await state(p)).localSequence;
 await p.locator('[data-editor-action="paste-table-cells"]').click();await p.locator('[data-table-paste-textarea]').fill('BULK-A\tBULK-B');await p.locator('[data-editor-action="apply-native-table-paste"]').click();await seq(p,n);
 await p.locator('[data-table-cell="2:2"]').click();await p.locator('[data-editor-action="marker-panel"]').click();await p.locator('[data-marker-picker]').selectOption('w4f3-legend-a');n=(await state(p)).localSequence;await p.locator('[data-editor-action="apply-existing-marker"]').click();await seq(p,n);
 // W4.F.1 dimension/semantic row control.
 await p.locator('[data-table-row-selector="1"]').click();await p.locator('[data-table-row-dimensions]').waitFor();n=(await state(p)).localSequence;await p.locator('[data-row-property="role"]').selectOption('section');await seq(p,n);assert.equal(main(await state(p)).table.rows[1].role,'section');
 // W4.F.2 preset/cascade.
 await p.locator('[data-table-selector="table"]').click();await p.locator('[data-table-style-inspector]').waitFor();n=(await state(p)).localSequence;await p.locator('[data-table-preset="technical-specification"]').click();await seq(p,n);
 // W4.F.3 title semantic surface.
 await p.locator('[data-table-title-input]').fill('Tabela integrada W4.G');n=(await state(p)).localSequence;await p.locator('[data-editor-action="set-table-title"]').click();await seq(p,n);assert(main(await state(p)).table.title);
 // W4.E explicit Fit only.
 const h0=main(await state(p)).frame.heightMm;await p.locator('[data-editor-action="fit-table-height"]').waitFor({timeout:30000});n=(await state(p)).localSequence;await p.locator('[data-editor-action="fit-table-height"]').click();await seq(p,n);assert(main(await state(p)).frame.heightMm>h0);
 // Cross-feature lifecycle: a valid dirty Cell draft commits exactly once when Father legitimately switches to object editing.
 await p.locator('[data-table-cell="1:0"]').click();await p.locator('[data-table-grid-overlay]').press('Enter');await p.locator('[data-cell-edit-session]').waitFor();const contextBefore=await state(p);
 await p.locator('[data-cell-rich-text]').fill('Integração W4.G via contexto');assert.equal((await state(p)).localSequence,contextBefore.localSequence);
 await p.locator(`[data-editor-object-id="${ids.image}"]`).click();await p.locator('[data-cell-edit-session]').waitFor({state:'detached'});await seq(p,contextBefore.localSequence);assert.equal(await p.locator(`[data-editor-object-id="${ids.image}"]`).getAttribute('data-selected'),'true');assert.equal(await p.locator('[data-table-grid-overlay]').count(),0);assert(JSON.stringify(main(await state(p)).table.cells.find(x=>x.id==='w4f1-cell-1-0').content).includes('Integração W4.G via contexto'));
 assert.equal((await state(p)).localSequence,contextBefore.localSequence+1);
 // W4.F.4 standalone Image.
 await p.locator('[data-image-professional-authoring]').waitFor();n=(await state(p)).localSequence;await p.locator('[data-image-fit]').selectOption('cover');await seq(p,n);
 n=(await state(p)).localSequence;await p.locator('[data-image-focal-axis="x"]').focus();await p.locator('[data-image-focal-axis="x"]').press('ArrowRight');await seq(p,n);assert.equal(obj(await state(p),ids.image).fit,'cover');
 // W4.F.5 modifier-free multi selection + arrangement; pure selection has no history.
 await p.locator('[data-editor-overlay]').click({position:{x:5,y:5}});const s0=await state(p);const multi=p.locator('[data-editor-action="toggle-multi-select"]');await multi.click();
 for(const id of [ids.image,ids.text,ids.line])await p.locator(`[data-editor-object-id="${id}"]`).click();assert.equal((await state(p)).localSequence,s0.localSequence);n=(await state(p)).localSequence;
 await p.locator('[data-editor-action="align-left"]').click();await seq(p,n);const aligned=structuredClone((await state(p)).document);
 assert.equal((await state(p)).localSequence,n+1);
 n=(await state(p)).localSequence;await p.locator('[data-editor-action="undo"]').click();await seq(p,n);assert.notDeepEqual((await state(p)).document,aligned);
 n=(await state(p)).localSequence;await p.locator('[data-editor-action="redo"]').click();await seq(p,n);assert.deepEqual((await state(p)).document,aligned);
 // Cross-feature lifecycle: leave real multi-selection through Father controls, enter singular Table mode, then lock collapses Table authoring without extra history.
 assert.equal(await p.locator('[data-editor-object-id][data-selected="true"]').count(),3);await multi.click();assert.equal(await multi.getAttribute('aria-pressed'),'false');const multiExitSequence=(await state(p)).localSequence;
 await p.locator('[data-editor-object-id="w4f1-table-object"]').click();assert.equal((await state(p)).localSequence,multiExitSequence);assert.equal(await p.locator('[data-editor-object-id][data-selected="true"]').count(),1);assert.equal(await p.locator('[data-editor-object-id="w4f1-table-object"]').getAttribute('data-selected'),'true');
 await p.locator('[data-editor-action="edit-table"]').click();await p.locator('[data-table-grid-overlay]').waitFor({timeout:20000});assert.equal((await state(p)).localSequence,multiExitSequence);
 const tableLock=p.locator('[data-editor-action="toggle-object-lock"]');n=(await state(p)).localSequence;await tableLock.click();await seq(p,n);await p.locator('[data-table-grid-overlay]').waitFor({state:'detached'});assert.equal(obj(await state(p),'w4f1-table-object').locked,true);assert.equal(await p.locator('[data-editor-object-id="w4f1-table-object"]').getAttribute('data-selected'),'true');assert(await p.locator('[data-editor-action="edit-table"]').isDisabled());
 assert.equal((await state(p)).localSequence,n+1);
 n=(await state(p)).localSequence;await tableLock.click();await seq(p,n);assert.equal(obj(await state(p),'w4f1-table-object').locked,undefined);assert.equal(await p.locator('[data-table-grid-overlay]').count(),0);
 assert.equal((await state(p)).localSequence,n+1);
 await p.locator(`[data-editor-object-id="${ids.text}"]`).click();const lock=p.locator('[data-editor-action="toggle-object-lock"]');n=(await state(p)).localSequence;await lock.click();await seq(p,n);assert.equal(obj(await state(p),ids.text).locked,true);
 n=(await state(p)).localSequence;await lock.click();await seq(p,n);assert.equal(obj(await state(p),ids.text).locked,undefined);
 n=(await state(p)).localSequence;await lock.click();await seq(p,n);assert.equal(obj(await state(p),ids.text).locked,true);
 // Real controlled Save/reopen through VNextPersistenceRuntime.
 await p.locator('[data-editor-action="save"]').click();await p.waitForFunction(()=>{const s=window.__W4G_PROOF__.state();return !s.dirty&&s.savePhase==='idle'},undefined,{timeout:30000});
 const saved=await state(p);assert(saved.saved);await p.getByRole('button',{name:'Abrir outro catálogo'}).click();await p.waitForFunction(id=>window.__W4G_PROOF__.state().catalogId===id,ids.other);
 await p.getByRole('button',{name:'Reabrir catálogo original'}).click();await p.waitForFunction(id=>window.__W4G_PROOF__.state().catalogId===id,ids.primary);await settle(p);
 const reopened=await state(p);assert.deepEqual(reopened.document,saved.saved);assert.equal(reopened.canUndo,false);assert.equal(obj(reopened,ids.text).locked,true);assert.equal(obj(reopened,ids.image).fit,'cover');
 const persistedImage=obj(reopened,ids.image),persistedAsset=reopened.document.assets.find(asset=>asset.id===persistedImage.assetId);assert(persistedAsset);assert.equal(persistedAsset.id,'asset-ta25n');assert.equal(persistedAsset.version,'repo-616332d');assert.equal(persistedAsset.sha256,'9a3b009caa49f76df16f59b8733dda1c1c5d8459479006c1bcc4b37e7071c067');
 const persistedJson=JSON.stringify(reopened.document);assert(!persistedJson.includes('blob:'));assert(!persistedJson.includes('/src/labs/presys-editorial-proof/assets/ta-25n.jpg'));assert(!/"(?:url|signedUrl|blobUrl)"\s*:/.test(persistedJson));
 const t=main(reopened);assert.equal(t.table.rows[1].role,'section');assert.equal(t.table.cells.find(x=>x.id==='w4f1-cell-2-2').content.legendEntryId,'w4f3-legend-a');
 // Publication purity + real diagnostics + native Chromium PDF/PDF.js.
 const beforePub=JSON.stringify(reopened.document);await p.getByRole('button',{name:'Publicar prova'}).click();await p.locator('[data-publication] [data-editorial-root]').waitFor({timeout:30000});
 const publication=await p.evaluate(()=>window.__W4G_PROOF__.publication());assert.deepEqual(publication.diagnostics.filter(x=>x.severity==='ERROR'),[]);
 assert.equal(await p.locator('[data-publication] [data-editor-action], [data-publication] [data-table-grid-overlay]').count(),0);assert((await p.locator('[data-publication]').innerText()).includes('Tabela integrada W4.G'));
 const px=mm=>mm*96/25.4;for(const id of [ids.image,ids.text,ids.line]){const canonical=obj(reopened,id),facts=await p.locator(`[data-publication] [data-object-id="${id}"]`).evaluate(node=>({left:parseFloat(node.style.left),top:parseFloat(node.style.top),width:parseFloat(node.style.width),height:parseFloat(node.style.height)}));assert(Math.abs(facts.left-px(canonical.frame.xMm))<.03);assert(Math.abs(facts.top-px(canonical.frame.yMm))<.03);assert(Math.abs(facts.width-px(canonical.frame.widthMm))<.03);assert(Math.abs(facts.height-px(canonical.frame.heightMm))<.03)}
 const publishedHeader=p.locator('[data-publication] [data-cell-id="w4f1-cell-0-0"]');await publishedHeader.waitFor();const headerStyle=await publishedHeader.evaluate(cell=>{const style=getComputedStyle(cell);return {color:style.color,background:style.backgroundColor,textAlign:style.textAlign}});assert.equal(headerStyle.color,'rgb(255, 255, 255)');assert.equal(headerStyle.background,'rgb(0, 51, 102)');assert.equal(headerStyle.textAlign,'left');
 const pdfPath=resolve(output,'w4g-wave4-closeout.pdf');await p.emulateMedia({media:'print'});await p.pdf({path:pdfPath,format:'A4',printBackground:true,preferCSSPageSize:true,margin:{top:'0',right:'0',bottom:'0',left:'0'}});
 assert.equal(JSON.stringify((await state(p)).document),beforePub);const pdf=await getDocument({data:new Uint8Array(await readFile(pdfPath)),isEvalSupported:false,useSystemFonts:false}).promise;assert.equal(pdf.numPages,1);
 const pg=await pdf.getPage(1),txt=(await pg.getTextContent()).items.filter(x=>'str'in x).map(x=>x.str).join(' '),ops=await pg.getOperatorList();assert(txt.includes('Tabela integrada W4.G'));assert(ops.fnArray.some(x=>[OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageXObjectRepeat].includes(x)));
 assert(Math.abs((pg.view[2]-pg.view[0])*25.4/72-210)<.2&&Math.abs((pg.view[3]-pg.view[1])*25.4/72-297)<.2);await pdf.destroy();await c.close();
 return {w4a:true,w4b:true,w4c:true,w4d:true,w4e:true,w4f1:true,w4f2:true,w4f3:true,w4f4:true,w4f5:true,crossFeatureLifecycle:true,diagnosticNavigation:true,assetIntegrity:true,history:true,saveReopen:true,publication:true,pdf:true};
}

async function mobile(browser,width){
 const c=await browser.newContext({viewport:{width,height:900},isMobile:true,hasTouch:true}),p=await c.newPage();watch(p);await p.goto(url,{waitUntil:'domcontentloaded'});await p.locator('[data-vnext-shell]').waitFor();
 const ids=await p.evaluate(()=>({image:window.__W4G_PROOF__.imageId,line:window.__W4G_PROOF__.lineId,text:window.__W4G_PROOF__.textId}));
 await p.locator('[data-editor-object-id="w4f1-table-object"]').tap();await p.locator('[data-diagnostic-code="TABLE_CONTENT_OVERFLOW"]').waitFor({timeout:30000});const edit=p.locator('[data-editor-action="edit-table"]');await edit.scrollIntoViewIfNeeded();await edit.tap();await p.locator('[data-table-grid-overlay]').waitFor();
 assert(await p.locator('[data-table-row-selector="0"]').isVisible());const fit=p.locator('[data-editor-action="fit-table-height"]');await fit.scrollIntoViewIfNeeded();let n=(await state(p)).localSequence;await fit.tap();await seq(p,n);await p.locator('[data-editor-action="leave-table-grid"]').tap();
 await p.locator('[data-editor-overlay]').tap({position:{x:5,y:5}});
 const multi=p.locator('[data-editor-action="toggle-multi-select"]');await multi.scrollIntoViewIfNeeded();await multi.tap();await p.locator(`[data-editor-object-id="${ids.image}"]`).tap();await p.locator(`[data-editor-object-id="${ids.line}"]`).tap();assert.equal(await p.locator('[data-editor-object-id][data-selected="true"]').count(),2);assert(await p.locator('[data-editor-action="align-left"]').isVisible());
 await multi.tap();await p.locator(`[data-editor-object-id="${ids.text}"]`).tap();const lock=p.locator('[data-editor-action="toggle-object-lock"]');await lock.scrollIntoViewIfNeeded();n=(await state(p)).localSequence;await lock.tap();await seq(p,n);n=(await state(p)).localSequence;await lock.tap();await seq(p,n);assert.equal(await lock.getAttribute('aria-pressed'),'false');
 for(const a of ['save','undo','redo']){const b=p.locator(`[data-editor-action="${a}"]`);await b.scrollIntoViewIfNeeded();assert(await b.isVisible())}
 const overflow=await noOverflow(p,width);await c.close();return {width,overflow,tableControls:true,multiSelect:true,lockUnlock:true,fitHeight:true,saveUndoRedo:true};
}

let browser;
try{
 await server.listen();browser=await chromium.launch({headless:Boolean(process.env.CI||process.env.W4G_PROOF_HEADLESS)});
 const desktopResult=await desktop(browser),mobileResult=[];for(const w of [320,360,390])mobileResult.push(await mobile(browser,w));
 assert.deepEqual(errors.consoleErrors,[]);assert.deepEqual(errors.pageErrors,[]);assert.deepEqual(errors.failedResources,[]);assert.deepEqual(errors.requestFailures,[]);
 const result={status:'PASS',browser:browser.version(),controlledPersistence:true,productionSupabaseE2E:false,representativeCoverage:desktopResult,mobile:mobileResult,accessibilitySanity:{nativeSemanticButtons:true,ariaPressed:true,keyboardTableAndCellEditing:true,noTrappedTableMode:true,touchFlows:true,formalWcagCertification:false},errors};
 await writeFile(resolve(output,'report.json'),JSON.stringify(result,null,2));console.log('W4.G Wave 4 Closeout Chromium proof: PASS');console.log(JSON.stringify(result,null,2));
}finally{await browser?.close();await server.close()}

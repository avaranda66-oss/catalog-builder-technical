import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const output=resolve(root,'scratch/w2f-editor-proof');
await mkdir(output,{recursive:true});
const port=Number(process.env.W2F_PROOF_PORT??5201);
const server=await createServer({
  root,
  server:{
    host:'127.0.0.1',
    port,
    strictPort:true,
    fs:{allow:[root,realpathSync(resolve(root,'node_modules'))]},
  },
  logLevel:'error',
});
let browser;

const rounded=(value)=>Math.round(value*1000)/1000;
const rect=async(locator)=>{
  const value=await locator.boundingBox();
  assert(value,'Expected visible bounding box');
  return Object.fromEntries(Object.entries(value).map(([key,number])=>[key,rounded(number)]));
};
const sameRect=(left,right,tolerance=.75)=>{
  for(const key of ['x','y','width','height'])assert(Math.abs(left[key]-right[key])<=tolerance,`${key}: ${left[key]} vs ${right[key]}`);
};
const selected=(page)=>page.locator('[data-editor-object-id][data-selected="true"]');
const rootObjectIds=(page)=>page.locator('[data-editorial-root] [data-page-id] > [data-object-id]')
  .evaluateAll((nodes)=>nodes.map((node)=>node.getAttribute('data-object-id')));
const selectTwo=async(page,firstId,secondId)=>{
  await page.locator(`[data-editor-object-id="${firstId}"]`).click();
  await page.locator(`[data-editor-object-id="${secondId}"]`).click({modifiers:['Control']});
  assert.equal(await selected(page).count(),2,'Ctrl-click must create a two-object top-level selection');
};

try {
  await server.listen();
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1500,height:1100},deviceScaleFactor:1});
  const page=await context.newPage();
  const consoleErrors=[];
  const pageErrors=[];
  const requests=[];
  page.on('console',(message)=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('pageerror',(error)=>pageErrors.push(error.message));
  page.on('request',(request)=>requests.push(request.url()));

  await page.goto(`http://127.0.0.1:${port}/v2`,{waitUntil:'networkidle'});
  await page.locator('[data-vnext-shell]').waitFor();
  assert.equal(requests.some((url)=>url.includes('/src/legacy-main')),false,'Legacy bootstrap must not load on /v2');

  await page.locator('[data-editor-action="add-text"]').click();
  const textId=await selected(page).getAttribute('data-editor-object-id');
  assert(textId);
  await page.locator('[data-editor-action="add-shape"]').click();
  const shapeId=await selected(page).getAttribute('data-editor-object-id');
  assert(shapeId);
  await selectTwo(page,textId,shapeId);
  assert.equal(await page.locator('[data-editor-action="group"]').isEnabled(),true);
  await page.locator('[data-editor-action="group"]').click();

  assert.equal(await selected(page).count(),1);
  const groupId=await selected(page).getAttribute('data-editor-object-id');
  assert(groupId&&groupId!==textId&&groupId!==shapeId);
  const group=page.locator(`[data-editorial-root] [data-object-id="${groupId}"][data-object-type="group"]`);
  await group.waitFor();
  assert.equal(await page.locator(`[data-object-id="${groupId}"]`).count(),1);
  assert.equal(await page.locator(`[data-object-id="${textId}"]`).count(),1);
  assert.equal(await page.locator(`[data-object-id="${shapeId}"]`).count(),1);
  assert.equal(await group.locator(`[data-object-id="${textId}"]`).count(),1);
  assert.equal(await group.locator(`[data-object-id="${shapeId}"]`).count(),1);
  assert.equal(await page.locator(`[data-editorial-root] [data-page-id] > [data-object-id="${textId}"]`).count(),0);
  assert.equal(await page.locator('[data-resize-handle]').count(),0,'Closed Group must expose zero resize handles');
  assert.equal(await page.locator('[data-inspector-field="width"]').getAttribute('readonly'),'');
  assert.equal(await page.locator('[data-inspector-field="height"]').getAttribute('readonly'),'');
  assert.equal(await page.locator('[data-inspector-field="x"]').getAttribute('readonly'),null);
  assert.equal(await page.locator('[data-inspector-field="y"]').getAttribute('readonly'),null);

  const groupChromeInside=await page.locator(
    '[data-editorial-root] [data-editor-action="group"], [data-editorial-root] [data-editor-action="ungroup"], [data-editorial-root] [data-resize-handle], [data-editorial-root] [data-selection-outline]'
  ).count();
  assert.equal(groupChromeInside,0,'Group editor chrome must remain outside canonical rendering');

  const pageBox=await page.locator('[data-editorial-root] [data-page-id]').first().boundingBox();
  assert(pageBox);
  const pxPerMm=pageBox.width/210;
  const groupBeforeMove=await rect(group);
  const overlay=page.locator(`[data-editor-object-id="${groupId}"][data-selected="true"]`);
  const childLocalBefore=await group.locator(':scope > [data-object-id]').evaluateAll((nodes)=>nodes.map((node)=>({
    id:node.getAttribute('data-object-id'),
    left:node.style.left,
    top:node.style.top,
    width:node.style.width,
    height:node.style.height,
  })));
  let box=await overlay.boundingBox();
  assert(box);
  const startX=box.x+box.width/2;
  const startY=box.y+box.height/2;
  await page.mouse.move(startX,startY);
  await page.mouse.down();
  await page.mouse.move(startX-19*pxPerMm,startY,{steps:8});
  sameRect(await rect(group),groupBeforeMove);
  assert((await rect(overlay)).x<groupBeforeMove.x-10,'Group overlay must preview movement without canonical writes');
  assert.equal(await page.locator('[data-snap-guide="x"][data-snap-guide-kind="page-edge"]').count(),1,'Group frame must snap to page edge');
  await page.mouse.up();
  await page.waitForFunction(()=>{
    const input=document.querySelector('[data-inspector-field="x"]');
    return input instanceof HTMLInputElement&&Number.parseFloat(input.value)===0;
  });
  const groupAfterMove=await rect(group);
  assert(groupAfterMove.x<groupBeforeMove.x-10,'Pointerup must commit Group move');
  const childLocalAfter=await group.locator(':scope > [data-object-id]').evaluateAll((nodes)=>nodes.map((node)=>({
    id:node.getAttribute('data-object-id'),
    left:node.style.left,
    top:node.style.top,
    width:node.style.width,
    height:node.style.height,
  })));
  assert.deepEqual(childLocalAfter,childLocalBefore,'Group move must not rewrite child-local frames');

  await page.locator('[data-editor-action="add-line"]').click();
  const lineId=await selected(page).getAttribute('data-editor-object-id');
  assert(lineId);
  await page.locator(`[data-editor-object-id="${groupId}"]`).click();
  await page.locator('[data-editor-action="bring-front"]').click();
  assert.deepEqual(await rootObjectIds(page),[lineId,groupId],'Reordered Group must occupy its current visual slot');

  const groupedChildRects={
    [textId]:await rect(page.locator(`[data-object-id="${textId}"]`)),
    [shapeId]:await rect(page.locator(`[data-object-id="${shapeId}"]`)),
  };
  await page.locator('[data-editor-action="ungroup"]').click();
  assert.equal(await page.locator(`[data-object-id="${groupId}"]`).count(),0);
  assert.deepEqual(await rootObjectIds(page),[lineId,textId,shapeId]);
  assert.equal(await selected(page).count(),2,'Ungroup must select the emitted children');
  sameRect(await rect(page.locator(`[data-object-id="${textId}"]`)),groupedChildRects[textId]);
  sameRect(await rect(page.locator(`[data-object-id="${shapeId}"]`)),groupedChildRects[shapeId]);

  await page.locator('[data-editor-action="undo"]').click();
  await group.waitFor();
  assert.equal(await group.locator(`[data-object-id="${textId}"]`).count(),1);
  assert.equal(await group.locator(`[data-object-id="${shapeId}"]`).count(),1);
  await page.locator('[data-editor-action="redo"]').click();
  await page.waitForFunction((id)=>!document.querySelector(`[data-object-id="${id}"]`),groupId);
  assert.deepEqual(await rootObjectIds(page),[lineId,textId,shapeId]);

  await selectTwo(page,textId,shapeId);
  await page.locator('[data-editor-action="group"]').click();
  const regroupedId=await selected(page).getAttribute('data-editor-object-id');
  assert(regroupedId&&regroupedId!==groupId);
  const sourceGroup=page.locator(`[data-object-id="${regroupedId}"][data-object-type="group"]`);
  const sourceRect=await rect(sourceGroup);
  const sourceChildIds=await sourceGroup.locator(':scope > [data-object-id]').evaluateAll((nodes)=>nodes.map((node)=>node.getAttribute('data-object-id')));
  await page.locator('[data-editor-action="duplicate"]').click();
  const duplicateId=await selected(page).getAttribute('data-editor-object-id');
  assert(duplicateId&&duplicateId!==regroupedId);
  const duplicateGroup=page.locator(`[data-object-id="${duplicateId}"][data-object-type="group"]`);
  sameRect(await rect(duplicateGroup),sourceRect);
  const duplicateChildIds=await duplicateGroup.locator(':scope > [data-object-id]').evaluateAll((nodes)=>nodes.map((node)=>node.getAttribute('data-object-id')));
  assert(sourceChildIds.every((id)=>id&&!duplicateChildIds.includes(id)),'Duplicate Group must regenerate every child root ID');
  assert.equal(await page.locator('[data-object-type="group"]').count(),2);

  await page.locator('[data-editor-action="delete"]').click();
  assert.equal(await page.locator('[data-object-type="group"]').count(),1);
  await page.locator('[data-editor-action="undo"]').click();
  assert.equal(await page.locator('[data-object-type="group"]').count(),2);
  await page.locator('[data-editor-action="redo"]').click();
  assert.equal(await page.locator('[data-object-type="group"]').count(),1);

  await page.screenshot({path:resolve(output,'w2f-v2.png'),fullPage:true});
  const evidence={
    chromiumVersion:browser.version(),
    pxPerMm,
    textId,
    shapeId,
    groupId,
    regroupedId,
    duplicateId,
    lineId,
    groupBeforeMove,
    groupAfterMove,
    childLocalBefore,
    childLocalAfter,
    groupedChildRects,
    sourceChildIds,
    duplicateChildIds,
    groupChromeInside,
    legacyBootstrapLoaded:requests.some((url)=>url.includes('/src/legacy-main')),
    consoleErrors,
    pageErrors,
  };
  await writeFile(resolve(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n','utf8');
  assert.deepEqual(consoleErrors,[]);
  assert.deepEqual(pageErrors,[]);
  console.log('W2.F Chromium /v2 Group proof: PASS');
  console.log(JSON.stringify(evidence,null,2));
  await context.close();
} finally {
  if(browser)await browser.close();
  await server.close();
}

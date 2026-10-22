/* global window, document, getComputedStyle, matchMedia */
// FR-54 — a bleed is visible in the editor, but the printed sheet is cut at the page box.
//
// Question: a footer band on page 1 that bleeds 2 mm downwards (y 257..299 mm; the preflight releases it as a
// WARNING) must NOT print a 2 mm strip on top of page 2 of the PDF.
//
// What this proof does (one Vite dev server on 127.0.0.1:5191, one headless Chromium, both closed at the end):
//   1. Renders a 2-page document with the real DocumentRenderer (production CSS from src/vnext/rendering/styles.css).
//   2. Screen media (pages separated by the same 16px gap as the app's page list): the band's box overshoots page 1 by
//      2 mm and elementFromPoint 1 mm below page 1 hits the band (the editor keeps showing the bleed).
//   3. Print media (page.emulateMedia): the band's box is unchanged (geometry untouched), .editorial-page is
//      overflow:hidden, and the same point now hits page 2, not the band (the bleed is clipped).
//   4. page.pdf(): pdf.js + @napi-rs/canvas rasterize both sheets; the top 2 mm of page 2 are pure white, the bottom
//      2 mm of page 1 are band-coloured, and page 2's own text is still printed.
//   5. Control: the same page with `overflow: visible !important` injected for print is rasterized again, so the
//      evidence records whether the strip really appears without the fix (sensitivity of the pixel check).
//   6. Onda 3.5 native elements: a one-page document with a PAGE BACKGROUND colour and a native POLYGON (SVG) that bleeds 2 mm
//      below the last page. Screen: the bleed is painted and hit by the polygon. Print: the page is clipped at its box, the PDF
//      has exactly one sheet, the background colour covers the sheet and the polygon prints down to the bottom edge.
//
// Run: node tests/vnext/proof/fr54-bleed-print-proof.mjs   (FR54_PROOF_PORT overrides the port; 5190/5185/5186 are taken)
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/fr54-bleed-print-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.FR54_PROOF_PORT ?? 5191);
const origin = `http://127.0.0.1:${port}`;
const route = '/fr54-bleed-print';
const BAND = { id: 'footer-band', fill: '#173F52', rgb: [23, 63, 82] };
const NATIVE_ROUTE = '/fr54-bleed-print-native';
const NATIVE = { id: 'native-band', page: 'fr54-native-page', background: '#EAF1F4', backgroundRgb: [234, 241, 244], fill: '#173F52' };
const PAGE_ONE = 'fr54-page-1';
const PAGE_TWO = 'fr54-page-2';
const MM_PER_CSS_PX = 25.4 / 96;

// Production renderer, production stylesheet. Only the harness (mount + fixture) lives here.
const htmlFor = (fixture) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;background:#ffffff;} @page { size: A4; margin: 0; }
/* Onda 3.5: every page is its own stacking context (isolation), so a later page paints over the bleed of the previous one
   when the two touch. The app never shows touching pages on screen (the editor draws one page; the publication list
   leaves 16px between pages, see .vnext-publication-pages), so the screen harness leaves the same gap. In print the
   production stylesheet butts the pages (margin 0) and clips each one at its box. */
@media screen { [data-editorial-root] .editorial-page { margin-bottom: 16px; } }</style></head>
<body><div id="root"></div><script type="module">
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createElement } from 'react';
import { DocumentRenderer } from '/src/vnext/rendering/DocumentRenderer.tsx';
import { createCatalogDocument } from '/src/vnext/application/document.ts';
import { plainRichText } from '/src/vnext/domain/editorial-model.ts';
import { authoredFrameDiagnostics } from '/src/vnext/publication/preflight.ts';
let n = 0;
const base = createCatalogDocument(() => 'fr54-' + (++n), 'Prova FR-54 · sangria na impressão');
const pages = ${fixture === 'native'
  ? `[{ ...base.pages[0], id: '${NATIVE.page}', background: { color: '${NATIVE.background}' }, objects: [
  { id: '${NATIVE.id}', type: 'polygon', frame: { xMm: 0, yMm: 257, widthMm: 210, heightMm: 42 }, zIndex: 1,
    points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], style: { fill: { kind: 'solid', color: '${NATIVE.fill}' } } },
] }]`
  : `[{ ...base.pages[0], id: '${PAGE_ONE}', objects: [
  { id: '${BAND.id}', type: 'shape', frame: { xMm: 0, yMm: 257, widthMm: 210, heightMm: 42 }, zIndex: 1, shape: 'rectangle', style: { fill: '${BAND.fill}' } },
] }, { ...base.pages[0], id: '${PAGE_TWO}', objects: [
  { id: 'page-two-text', type: 'text', frame: { xMm: 12, yMm: 12, widthMm: 150, heightMm: 10 }, zIndex: 1, text: plainRichText('page-two-text', 'Topo da página 2'), style: {} },
] }]`};
const catalog = { ...base, pages };
window.__FR54__ = { document: catalog, diagnostics: authoredFrameDiagnostics(catalog), ready: false };
flushSync(() => createRoot(document.getElementById('root')).render(createElement(DocumentRenderer, { document: catalog, plans: new Map(), assetUrls: new Map() })));
window.__FR54__.ready = true;
</script></body></html>`;

const server = await createServer({
  root,
  plugins: [{ name: 'fr54-bleed-print-page', configureServer(devServer) {
    devServer.middlewares.use(async (req, res, next) => {
      const path = (req.url ?? '').split('?')[0];
      if (path !== route && path !== NATIVE_ROUTE) return next();
      try {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(await devServer.transformIndexHtml(req.url, htmlFor(path === NATIVE_ROUTE ? 'native' : 'shape')));
      } catch (error) { next(error); }
    });
  } }],
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } },
  logLevel: 'error',
});

const evidence = { feature: 'FR-54', question: 'Does a 2 mm downward bleed print a strip on the next sheet?', startedAt: new Date().toISOString(), port };
const errors = [];
const near = (actual, expected, toleranceMm, label) => assert(Math.abs(actual - expected) <= toleranceMm, `${label}: ${actual} vs ${expected} (±${toleranceMm} mm)`);

async function openFixture(context, label, path = route) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push({ label, message: error.message }));
  page.on('console', message => { if (message.type() === 'error') errors.push({ label, message: message.text() }); });
  await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__FR54__?.ready === true, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

/** DOM facts in the current media: boxes in mm relative to page 1, plus a hit test 1 mm below page 1's bottom edge. */
async function probe(page) {
  return page.evaluate(({ bandId, mmPerPx }) => {
    const mm = px => Math.round(px * mmPerPx * 1000) / 1000;
    const pages = [...document.querySelectorAll('[data-editorial-root] .editorial-page')];
    const [one, two] = pages.map(element => element.getBoundingClientRect());
    const band = document.querySelector(`[data-object-id="${bandId}"]`);
    const box = band.getBoundingClientRect();
    const x = (one.left + one.right) / 2;
    const probeY = one.bottom + 1 / mmPerPx;
    const hit = document.elementFromPoint(x, probeY);
    return {
      media: matchMedia('print').matches ? 'print' : 'screen',
      pageOverflow: getComputedStyle(pages[0]).overflow,
      pageCount: pages.length,
      pageOne: { widthMm: mm(one.width), heightMm: mm(one.height) },
      pageTwoStartsAfterPageOneMm: mm(two.top - one.bottom),
      band: { topMm: mm(box.top - one.top), bottomMm: mm(box.bottom - one.top), overshootBelowPageMm: mm(box.bottom - one.bottom), leftMm: mm(box.left - one.left), rightMm: mm(box.right - one.left) },
      probe: { belowPageOneMm: mm(probeY - one.bottom), hitObject: hit?.closest('[data-object-id]')?.getAttribute('data-object-id') ?? null, hitPage: hit?.closest('[data-page-id]')?.getAttribute('data-page-id') ?? null },
    };
  }, { bandId: BAND.id, mmPerPx: MM_PER_CSS_PX });
}

/** Rasterizes every sheet of the PDF and samples horizontal bands of rows, in mm from the top of the sheet. */
async function rasterize(bytes, label) {
  const pdf = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false }).promise;
  const sheets = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const sheet = await pdf.getPage(number);
    const viewport = sheet.getViewport({ scale: 8 });
    const { canvas, context } = pdf.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await sheet.render({ canvasContext: context, viewport }).promise;
    const widthMm = viewport.width / 8 * 25.4 / 72, heightMm = viewport.height / 8 * 25.4 / 72, pxPerMm = viewport.width / widthMm;
    const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const sample = (fromMm, toMm) => {
      const fromRow = Math.max(0, Math.ceil(fromMm * pxPerMm)), toRow = Math.min(canvas.height, Math.floor(toMm * pxPerMm));
      let pixels = 0, nonWhite = 0, bandColoured = 0, backgroundColoured = 0;
      for (let row = fromRow; row < toRow; row++) for (let column = 0; column < canvas.width; column++) {
        const offset = (row * canvas.width + column) * 4, r = image[offset], g = image[offset + 1], b = image[offset + 2];
        pixels++;
        if (r < 250 || g < 250 || b < 250) nonWhite++;
        if (Math.abs(r - BAND.rgb[0]) <= 12 && Math.abs(g - BAND.rgb[1]) <= 12 && Math.abs(b - BAND.rgb[2]) <= 12) bandColoured++;
        if (Math.abs(r - NATIVE.backgroundRgb[0]) <= 6 && Math.abs(g - NATIVE.backgroundRgb[1]) <= 6 && Math.abs(b - NATIVE.backgroundRgb[2]) <= 6) backgroundColoured++;
      }
      return { fromMm, toMm, rows: toRow - fromRow, pixels, nonWhite, bandColoured, bandShare: pixels ? bandColoured / pixels : 0, backgroundShare: pixels ? backgroundColoured / pixels : 0 };
    };
    await writeFile(resolve(output, `${label}-sheet-${number}.png`), canvas.toBuffer('image/png'));
    sheets.push({ sheet: number, widthMm, heightMm, top0to2mm: sample(0, 2), top0to5mm: sample(0, 5), text10to20mm: sample(10, 20), bottom2mm: sample(heightMm - 2, heightMm) });
    pdf.canvasFactory.destroy({ canvas, context });
  }
  await pdf.destroy();
  return { pageCount: pdf.numPages, sheets };
}

async function printToPdf(page, label) {
  const bytes = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, margin: { top: '0', right: '0', bottom: '0', left: '0' }, scale: 1 });
  await writeFile(resolve(output, `${label}.pdf`), bytes);
  return rasterize(bytes, label);
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  evidence.chromiumVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 1 });
  const page = await openFixture(context, 'fixed');

  // 0. The preflight releases the band as a bleed WARNING (no ERROR anywhere): this is exactly the document the review lets through.
  const preflight = await page.evaluate(() => window.__FR54__.diagnostics);
  assert.deepEqual(preflight.map(issue => `${issue.objectId}:${issue.code}:${issue.severity}:${issue.details}`), [`${BAND.id}:OBJECT_OUTSIDE_PAGE:WARNING:bleedMm=2; toleranceMm=3`]);
  evidence.preflight = preflight;

  // 1. Screen: the bleed is visible — box overshoots page 1 by 2 mm and the point below page 1 hits the band.
  const screen = await probe(page);
  assert.equal(screen.media, 'screen');
  assert.equal(screen.pageCount, 2);
  assert.equal(screen.pageOverflow, 'visible', 'screen keeps overflow visible so the editor shows the bleed');
  near(screen.pageOne.widthMm, 210, 0.05, 'page width'); near(screen.pageOne.heightMm, 297, 0.05, 'page height');
  near(screen.band.topMm, 257, 0.05, 'band top'); near(screen.band.bottomMm, 299, 0.05, 'band bottom');
  near(screen.band.overshootBelowPageMm, 2, 0.05, 'band overshoot below page 1');
  assert.equal(screen.probe.hitObject, BAND.id, 'on screen the bleed below page 1 is painted (and hit) by the band');
  assert.equal(screen.probe.hitPage, PAGE_ONE, 'the band that bleeds belongs to page 1 (not covered by page 2) on screen');
  assert(screen.pageTwoStartsAfterPageOneMm > 1.5, `on screen the probe point lies in the gap between pages (gap ${screen.pageTwoStartsAfterPageOneMm} mm)`);
  evidence.screen = screen;

  // 2. Print media: same geometry, page clipped, the band no longer paints below page 1.
  await page.emulateMedia({ media: 'print' });
  const print = await probe(page);
  assert.equal(print.media, 'print');
  assert.equal(print.pageOverflow, 'hidden', 'print clips the page at its box');
  assert.deepEqual(print.band, screen.band, 'print must not move or resize the authored band (geometry untouched)');
  assert.deepEqual(print.pageOne, screen.pageOne, 'print must not change the page box');
  assert.notEqual(print.probe.hitObject, BAND.id, 'in print the band must not be hit below page 1');
  assert.equal(print.probe.hitPage, PAGE_TWO, 'in print the point below page 1 belongs to page 2');
  evidence.print = print;

  // 3. PDF pixels with the fix.
  const fixed = await printToPdf(page, 'fixed');
  evidence.fixedPdf = fixed;
  assert.equal(fixed.pageCount, 2, 'the two pages print as exactly two sheets (no blank sheet from the clip)');
  const [sheetOne, sheetTwo] = fixed.sheets;
  near(sheetOne.widthMm, 210, 0.3, 'sheet width'); near(sheetOne.heightMm, 297, 0.3, 'sheet height');
  assert(sheetOne.bottom2mm.bandShare >= 0.98, `the band must still print down to the bottom edge of sheet 1 (band share ${sheetOne.bottom2mm.bandShare})`);
  assert.equal(sheetTwo.top0to2mm.nonWhite, 0, `top 2 mm of sheet 2 must be pure white, found ${sheetTwo.top0to2mm.nonWhite} non-white pixels`);
  assert.equal(sheetTwo.top0to5mm.nonWhite, 0, `top 5 mm of sheet 2 must be pure white, found ${sheetTwo.top0to5mm.nonWhite} non-white pixels`);
  assert(sheetTwo.text10to20mm.nonWhite > 0, 'page 2 text (y = 12 mm) must still be printed: clipping removes only what is outside the page box');
  assert.equal(sheetOne.top0to5mm.nonWhite, 0, 'sheet 1 has nothing in its top 5 mm');
  await context.close();

  // 4. Control: the same fixture without the clip, to show the pixel check sees the strip when it exists.
  const controlContext = await browser.newContext({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 1 });
  const controlPage = await openFixture(controlContext, 'control');
  await controlPage.addStyleTag({ content: '@media print { [data-editorial-root] .editorial-page { overflow: visible !important; } }' });
  await controlPage.emulateMedia({ media: 'print' });
  const controlProbe = await probe(controlPage);
  const control = await printToPdf(controlPage, 'control-overflow-visible');
  evidence.control = { probe: controlProbe, pdf: control, stripOnSheetTwo: control.sheets[1]?.top0to2mm.nonWhite > 0, stripBandShare: control.sheets[1]?.top0to2mm.bandShare ?? null };
  await controlContext.close();

  // 6. Native elements (Onda 3.5): a page background colour and an SVG-painted polygon bleeding below the LAST page.
  const nativeContext = await browser.newContext({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 1 });
  const nativePage = await openFixture(nativeContext, 'native', NATIVE_ROUTE);
  const nativePreflight = await nativePage.evaluate(() => window.__FR54__.diagnostics);
  assert.deepEqual(nativePreflight.map(issue => `${issue.objectId}:${issue.code}:${issue.severity}`), [`${NATIVE.id}:OBJECT_OUTSIDE_PAGE:WARNING`], 'the bleeding polygon is released as a bleed WARNING only');
  const nativeProbe = () => nativePage.evaluate(({ id, mmPerPx }) => {
    const mm = px => Math.round(px * mmPerPx * 1000) / 1000;
    const sheet = document.querySelector('[data-editorial-root] .editorial-page');
    const box = sheet.getBoundingClientRect(), object = document.querySelector(`[data-object-id="${id}"]`).getBoundingClientRect();
    const hit = document.elementFromPoint((box.left + box.right) / 2, box.bottom + 1 / mmPerPx);
    return {
      media: matchMedia('print').matches ? 'print' : 'screen', overflow: getComputedStyle(sheet).overflow, background: getComputedStyle(sheet).backgroundColor,
      svg: Boolean(document.querySelector(`[data-object-id="${id}"] svg`)),
      page: { widthMm: mm(box.width), heightMm: mm(box.height) },
      object: { topMm: mm(object.top - box.top), bottomMm: mm(object.bottom - box.top), overshootBelowPageMm: mm(object.bottom - box.bottom) },
      hitObject: hit?.closest('[data-object-id]')?.getAttribute('data-object-id') ?? null,
    };
  }, { id: NATIVE.id, mmPerPx: MM_PER_CSS_PX });
  const nativeScreen = await nativeProbe();
  assert.equal(nativeScreen.media, 'screen');
  assert.equal(nativeScreen.overflow, 'visible', 'screen keeps overflow visible so the editor shows the polygon bleed');
  assert.equal(nativeScreen.background, 'rgb(234, 241, 244)', 'the page background colour is painted on the page box');
  assert.equal(nativeScreen.svg, true, 'the polygon is drawn as SVG');
  near(nativeScreen.object.overshootBelowPageMm, 2, 0.05, 'polygon overshoot below the page');
  assert.equal(nativeScreen.hitObject, NATIVE.id, 'on screen the polygon bleed below the page is painted (and hit) by the polygon');
  await nativePage.emulateMedia({ media: 'print' });
  const nativePrint = await nativeProbe();
  assert.equal(nativePrint.overflow, 'hidden', 'print clips the page at its box');
  assert.deepEqual(nativePrint.object, nativeScreen.object, 'print must not move or resize the authored polygon');
  assert.deepEqual(nativePrint.page, nativeScreen.page, 'print must not change the page box');
  assert.equal(nativePrint.background, nativeScreen.background, 'print keeps the page background colour');
  assert.notEqual(nativePrint.hitObject, NATIVE.id, 'in print the polygon must not be painted below the page');
  const nativePdf = await printToPdf(nativePage, 'native');
  evidence.native = { preflight: nativePreflight, screen: nativeScreen, print: nativePrint, pdf: nativePdf };
  assert.equal(nativePdf.pageCount, 1, 'the bleed of the last page does not add a sheet');
  const [nativeSheet] = nativePdf.sheets;
  assert(nativeSheet.top0to5mm.backgroundShare >= 0.98, `the page background colour must print on the sheet (share ${nativeSheet.top0to5mm.backgroundShare})`);
  assert(nativeSheet.text10to20mm.backgroundShare >= 0.98, `the page background colour must print all over the sheet (share ${nativeSheet.text10to20mm.backgroundShare})`);
  assert(nativeSheet.bottom2mm.bandShare >= 0.98, `the polygon must still print down to the bottom edge of the sheet (share ${nativeSheet.bottom2mm.bandShare})`);
  await nativeContext.close();

  assert.deepEqual(errors, [], 'no page/console errors');
  evidence.errors = errors;
  evidence.finishedAt = new Date().toISOString();
  evidence.verdict = 'PASS';
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('PASS FR-54 bleed print proof');
  console.log(`  screen: band overshoots page 1 by ${screen.band.overshootBelowPageMm} mm, hit below page 1 = ${screen.probe.hitObject}`);
  console.log(`  print : overflow=${print.pageOverflow}, hit below page 1 = ${print.probe.hitObject ?? 'none'} on ${print.probe.hitPage}`);
  console.log(`  pdf   : ${fixed.pageCount} sheets; sheet 2 top 2 mm non-white = ${sheetTwo.top0to2mm.nonWhite}/${sheetTwo.top0to2mm.pixels}; sheet 1 bottom 2 mm band share = ${sheetOne.bottom2mm.bandShare.toFixed(4)}`);
  console.log(`  control (overflow visible in print): strip on sheet 2 = ${evidence.control.stripOnSheetTwo} (non-white ${control.sheets[1]?.top0to2mm.nonWhite}, band share ${evidence.control.stripBandShare?.toFixed(4)})`);
  console.log(`  native: polygon bleeds ${nativeScreen.object.overshootBelowPageMm} mm on screen (hit = ${nativeScreen.hitObject}), print overflow=${nativePrint.overflow}; ${nativePdf.pageCount} sheet; background share ${nativeSheet.top0to5mm.backgroundShare.toFixed(4)}, polygon share at the bottom edge ${nativeSheet.bottom2mm.bandShare.toFixed(4)}`);
  console.log('  evidence:', resolve(output, 'evidence.json'));
} catch (error) {
  evidence.verdict = 'FAIL';
  evidence.error = error instanceof Error ? error.message : String(error);
  evidence.errors = errors;
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}

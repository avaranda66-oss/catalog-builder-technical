/* global window, document, getComputedStyle, matchMedia */
// FR-55 / FR-82 — the automatic control footer prints on every page, numbered, inside the safe area, with the
// bundled font, exactly where the screen shows it.
//
// What this proof does (one Vite dev server on 127.0.0.1:5197, one headless Chromium, both closed at the end):
//   1. Renders a 3-page catalog with the real DocumentRenderer and production CSS, footer
//      { MAN-PCON-XV, Rev. 03, 22/10/2026, shown on the cover too }, and runs the production font check (loadFonts)
//      and the footer preflight in the page.
//   2. Screen media: each page has one footer; its two parts sit inside the page safe area; texts are
//      "MAN-PCON-XV · Rev. 03 · 22/10/2026 · PT" and "Página n de 3".
//   3. Print media: the very same boxes (to 0.01 mm): screen = PDF.
//   4. page.pdf(): 3 sheets; pdf.js reads the footer text of every sheet at the same place, inside the safe area;
//      every font in the PDF is an embedded Noto Sans (no system stand-in).
//
// Run: node tests/vnext/proof/fr55-page-footer-print-proof.mjs   (FR55_PROOF_PORT overrides the port)
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
const output = resolve(root, 'scratch/fr55-page-footer-print-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.FR55_PROOF_PORT ?? 5197);
const origin = `http://127.0.0.1:${port}`;
const route = '/fr55-page-footer-print';
const MM_PER_CSS_PX = 25.4 / 96;
const PT_TO_MM = 25.4 / 72;
const CONTROL = 'MAN-PCON-XV · Rev. 03 · 22/10/2026 · PT';

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;background:#ffffff;} @page { size: A4; margin: 0; }
@media screen { [data-editorial-root] .editorial-page { margin-bottom: 16px; } }</style></head>
<body><div id="root"></div><script type="module">
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createElement } from 'react';
import { DocumentRenderer } from '/src/vnext/rendering/DocumentRenderer.tsx';
import { loadFonts } from '/src/vnext/rendering/resources.ts';
import { createCatalogDocument } from '/src/vnext/application/document.ts';
import { plainRichText } from '/src/vnext/domain/editorial-model.ts';
import { authoredFrameDiagnostics } from '/src/vnext/publication/preflight.ts';
import { pageFooterOverlapDiagnostics } from '/src/vnext/publication/page-footer-preflight.ts';
let n = 0;
const base = createCatalogDocument(() => 'fr55-' + (++n), 'Prova FR-55 · rodapé de controle');
const pages = [1, 2, 3].map(number => ({ ...base.pages[0], id: 'fr55-page-' + number, objects: [
  { id: 'fr55-text-' + number, type: 'text', frame: { xMm: 20, yMm: 20, widthMm: 150, heightMm: 10 }, zIndex: 0,
    text: plainRichText('fr55-text-' + number, 'Conteúdo da página ' + number), style: {} },
] }));
const catalog = { ...base, pages, style: { ...base.style, pageFooter: { documentCode: 'MAN-PCON-XV', revision: '03', issuedOn: '2026-10-22', showOnFirstPage: true } } };
window.__FR55__ = { document: catalog, ready: false };
flushSync(() => createRoot(document.getElementById('root')).render(createElement(DocumentRenderer, { document: catalog, plans: new Map(), assetUrls: new Map() })));
const rendered = document.querySelector('[data-editorial-root]');
try {
  window.__FR55__.fonts = await loadFonts(catalog, rendered);
} catch (error) { window.__FR55__.fontError = String(error); }
window.__FR55__.diagnostics = [...authoredFrameDiagnostics(catalog), ...pageFooterOverlapDiagnostics(catalog, rendered)];
window.__FR55__.ready = true;
</script></body></html>`;

const server = await createServer({
  root,
  plugins: [{ name: 'fr55-page-footer-print-page', configureServer(devServer) {
    devServer.middlewares.use(async (req, res, next) => {
      if ((req.url ?? '').split('?')[0] !== route) return next();
      try {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(await devServer.transformIndexHtml(req.url, html));
      } catch (error) { next(error); }
    });
  } }],
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } },
  logLevel: 'error',
});

const evidence = { feature: 'FR-55 / FR-82', question: 'Does the automatic footer print on every page, numbered, inside the safe area, with the bundled font, where the screen shows it?', startedAt: new Date().toISOString(), port };
const errors = [];
const near = (actual, expected, toleranceMm, label) => assert(Math.abs(actual - expected) <= toleranceMm, `${label}: ${actual} vs ${expected} (±${toleranceMm} mm)`);

/** Footer boxes in mm, relative to their page, in the current media. */
async function probe(page) {
  return page.evaluate(({ mmPerPx }) => {
    const mm = px => Math.round(px * mmPerPx * 1000) / 1000;
    return {
      media: matchMedia('print').matches ? 'print' : 'screen',
      pages: [...document.querySelectorAll('[data-editorial-root] .editorial-page')].map(section => {
        const box = section.getBoundingClientRect();
        const footers = [...section.querySelectorAll('[data-page-footer]')];
        const part = name => {
          const node = section.querySelector(`[data-page-footer-part="${name}"]`);
          const range = document.createRange(); range.selectNodeContents(node);
          const glyphs = range.getBoundingClientRect();
          return { text: node.textContent, font: getComputedStyle(node).fontFamily, leftMm: mm(glyphs.left - box.left), rightMm: mm(glyphs.right - box.left), topMm: mm(glyphs.top - box.top), bottomMm: mm(glyphs.bottom - box.top) };
        };
        return { id: section.getAttribute('data-page-id'), widthMm: mm(box.width), heightMm: mm(box.height), footers: footers.length, control: part('control'), number: part('number') };
      }),
    };
  }, { mmPerPx: MM_PER_CSS_PX });
}

/** pdf.js: footer text items per sheet (mm from the top-left corner) and the fonts the sheet uses. */
async function readPdf(bytes) {
  const pdf = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false }).promise;
  const sheets = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const sheet = await pdf.getPage(number);
    const [, , widthPt, heightPt] = sheet.view;
    const content = await sheet.getTextContent();
    const items = content.items.filter(item => item.str.trim()).map(item => ({
      str: item.str, xMm: item.transform[4] * PT_TO_MM, baselineMm: (heightPt - item.transform[5]) * PT_TO_MM, widthMm: item.width * PT_TO_MM, fontName: item.fontName,
    }));
    await sheet.getOperatorList();
    const fonts = [...new Set(items.map(item => item.fontName))].map(id => {
      const font = sheet.commonObjs.has(id) ? sheet.commonObjs.get(id) : undefined;
      return { id, name: font?.name ?? null, missingFile: font?.missingFile ?? null };
    });
    sheets.push({ sheet: number, widthMm: widthPt * PT_TO_MM, heightMm: heightPt * PT_TO_MM, items, fonts });
  }
  await pdf.destroy();
  return { pageCount: pdf.numPages, sheets };
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  evidence.chromiumVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__FR55__?.ready === true, { timeout: 30000 });
  const state = await page.evaluate(() => ({ fonts: window.__FR55__.fonts, fontError: window.__FR55__.fontError, diagnostics: window.__FR55__.diagnostics, safe: window.__FR55__.document.pages[0].safeArea }));
  assert.equal(state.fontError, undefined, `production font check (loadFonts) must pass: ${state.fontError}`);
  assert(state.fonts.every(font => font.family === 'Noto Sans' && font.loadedFaces > 0), 'every declared face is loaded');
  assert.deepEqual(state.diagnostics, [], 'no frame or footer problem in the preflight');
  evidence.fonts = state.fonts;
  const safe = state.safe;
  evidence.safeArea = safe;

  const checkInside = (part, label) => {
    assert(part.leftMm >= safe.leftMm - 0.01, `${label} left ${part.leftMm} inside safe ${safe.leftMm}`);
    assert(part.rightMm <= 210 - safe.rightMm + 0.01, `${label} right ${part.rightMm} inside safe ${210 - safe.rightMm}`);
    assert(part.bottomMm <= 297 - safe.bottomMm + 0.01, `${label} bottom ${part.bottomMm} inside safe ${297 - safe.bottomMm}`);
    assert(part.topMm >= 297 - safe.bottomMm - 10, `${label} sits at the bottom of the page (${part.topMm} mm)`);
  };

  // 2. Screen.
  const screen = await probe(page);
  assert.equal(screen.media, 'screen');
  assert.equal(screen.pages.length, 3);
  screen.pages.forEach((sheet, index) => {
    near(sheet.widthMm, 210, 0.05, 'page width'); near(sheet.heightMm, 297, 0.05, 'page height');
    assert.equal(sheet.footers, 1, `page ${index + 1} has exactly one footer`);
    assert.equal(sheet.control.text, CONTROL);
    assert.equal(sheet.number.text, `Página ${index + 1} de 3`);
    assert.match(sheet.control.font, /Noto Sans/);
    checkInside(sheet.control, `page ${index + 1} control`); checkInside(sheet.number, `page ${index + 1} number`);
  });
  evidence.screen = screen;

  // 3. Print media: the same boxes.
  await page.emulateMedia({ media: 'print' });
  const print = await probe(page);
  assert.equal(print.media, 'print');
  assert.deepEqual(print.pages, screen.pages, 'print draws the footer exactly where the screen shows it');
  evidence.print = print;

  // 4. The PDF.
  const bytes = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, margin: { top: '0', right: '0', bottom: '0', left: '0' }, scale: 1 });
  await writeFile(resolve(output, 'fr55-footer.pdf'), bytes);
  const pdf = await readPdf(bytes);
  assert.equal(pdf.pageCount, 3, 'three pages print as three sheets');
  pdf.sheets.forEach((sheet, index) => {
    near(sheet.widthMm, 210, 0.3, 'sheet width'); near(sheet.heightMm, 297, 0.3, 'sheet height');
    const footerItems = sheet.items.filter(item => item.baselineMm > 270);
    const text = footerItems.map(item => item.str).join('');
    assert(text.replace(/\s+/g, ' ').includes(CONTROL.replace(/\s+/g, ' ')), `sheet ${index + 1} prints the control text (got "${text}")`);
    assert(text.includes(`Página ${index + 1} de 3`), `sheet ${index + 1} prints "Página ${index + 1} de 3" (got "${text}")`);
    for (const item of footerItems) {
      assert(item.xMm >= safe.leftMm - 0.05, `sheet ${index + 1} "${item.str}" starts inside the safe area (${item.xMm} mm)`);
      assert(item.xMm + item.widthMm <= 210 - safe.rightMm + 0.05, `sheet ${index + 1} "${item.str}" ends inside the safe area (${item.xMm + item.widthMm} mm)`);
      assert(item.baselineMm <= 297 - safe.bottomMm, `sheet ${index + 1} "${item.str}" baseline inside the safe area (${item.baselineMm} mm)`);
    }
    const screenSheet = screen.pages[index];
    const first = footerItems.reduce((a, b) => (a.xMm <= b.xMm ? a : b));
    const last = footerItems.reduce((a, b) => (a.xMm + a.widthMm >= b.xMm + b.widthMm ? a : b));
    near(first.xMm, screenSheet.control.leftMm, 0.5, `sheet ${index + 1} control starts where the screen shows it`);
    near(last.xMm + last.widthMm, screenSheet.number.rightMm, 0.5, `sheet ${index + 1} page number ends where the screen shows it`);
    for (const item of footerItems) assert(item.baselineMm >= screenSheet.control.topMm && item.baselineMm <= screenSheet.control.bottomMm + 0.05,
      `sheet ${index + 1} baseline ${item.baselineMm} within the screen line box ${screenSheet.control.topMm}–${screenSheet.control.bottomMm}`);
    for (const font of sheet.fonts) {
      assert.match(font.name ?? '', /NotoSans/, `sheet ${index + 1} font ${font.id} is the bundled Noto Sans (got ${font.name})`);
      assert.equal(font.missingFile, false, `sheet ${index + 1} font ${font.name} is embedded in the PDF`);
    }
  });
  evidence.pdf = pdf;
  await context.close();

  assert.deepEqual(errors, [], 'no page/console errors');
  evidence.errors = errors;
  evidence.finishedAt = new Date().toISOString();
  evidence.verdict = 'PASS';
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('PASS FR-55 page footer print proof');
  for (const sheet of pdf.sheets) console.log(`  sheet ${sheet.sheet}: ${sheet.items.filter(item => item.baselineMm > 270).map(item => item.str).join(' | ')} — fonts ${sheet.fonts.map(font => font.name).join(', ')}`);
  console.log(`  screen = print boxes; safe area ${JSON.stringify(safe)}`);
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

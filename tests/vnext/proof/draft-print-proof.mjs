/* global window, document, getComputedStyle, matchMedia, Image, Event */
// "Imprimir rascunho mesmo assim" — a blocked catalog (texts still "A COMPLETAR") can be printed as a draft PDF with
// "RASCUNHO" on every page, while the normal "Imprimir / salvar PDF" stays locked.
//
// What this proof does (one Vite dev server on 127.0.0.1:5198, one headless Chromium, both closed at the end):
//   1. Mounts the real PublicationReview (real reviewPublication: fonts, preflight, layout) with the production app CSS
//      and print policy, for a 3-page catalog whose 3 texts still say "A COMPLETAR". window.print is recorded instead
//      of opening the browser dialog; page.pdf() prints the very same DOM with the same print CSS.
//   2. The review is BLOCKED by exactly those 3 items; "Imprimir / salvar PDF" is disabled. A PDF taken now (even with
//      a forged print approval) contains only the "Use Publicar / PDF…" notice: the normal print stays locked.
//   3. "Imprimir rascunho mesmo assim" → confirmation (3 items, grouped), the "Entendi" box (≥ 24 px) is required.
//   4. "Imprimir rascunho": title "… — RASCUNHO"; in print media every A4 page holds one diagonal watermark inside its
//      box; page.pdf(): 3 sheets, each with one "RASCUNHO" (fill + outline) and its "A COMPLETAR" text readable.
//   5. afterprint: the watermark is gone and printing is locked again; with "Marcar todas as páginas" off the draft
//      prints without the word.
//   6. Page 2 has the navy of the PCON cover as its background: the word must still stand out there (pixels compared
//      with and without the watermark, in print media), not only on white pages.
//
// Run: node tests/vnext/proof/draft-print-proof.mjs   (DRAFT_PROOF_PORT overrides the port)
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
const output = resolve(root, 'scratch/draft-print-proof');
await mkdir(output, { recursive: true });
const port = Number(process.env.DRAFT_PROOF_PORT ?? 5198);
const origin = `http://127.0.0.1:${port}`;
const route = '/draft-print-proof';
const MM_PER_CSS_PX = 25.4 / 96;
const PT_TO_MM = 25.4 / 72;
const NOTICE = 'Use Publicar / PDF no catálogo';

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;background:#ffffff;}</style></head>
<body><div id="root"></div><script type="module">
import '/src/vnext/app/styles.css';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { PublicationReview } from '/src/vnext/app/PublicationReview.tsx';
import { createCatalogDocument } from '/src/vnext/application/document.ts';
import { plainRichText } from '/src/vnext/domain/editorial-model.ts';
let n = 0;
const base = createCatalogDocument(() => 'draft-' + (++n), 'Prova rascunho');
// Page 2 is navy like the PCON cover (PCON_COVER_COLORS.navyTop): the watermark must not vanish on dark pages.
const pages = [1, 2, 3].map(number => ({ ...base.pages[0], id: 'draft-page-' + number, ...(number === 2 ? { background: { color: '#173F65' } } : {}), objects: [
  { id: 'draft-text-' + number, type: 'text', frame: { xMm: 20, yMm: 20, widthMm: 150, heightMm: 10 }, zIndex: 0,
    text: plainRichText('draft-run-' + number, 'Faixa da página ' + number + ': A COMPLETAR'), style: {} },
] }));
const catalog = { ...base, pages };
const source = { document: catalog, openSessionId: 'proof', remoteRevision: 1, authLineage: 'proof', authorityScopeId: 'proof', assetUrls: new Map() };
document.body.setAttribute('data-vnext-print-policy', '');
document.title = 'Editor de catálogos';
const prints = [];
window.print = () => {
  const host = document.querySelector('[data-publication-host]');
  prints.push({ title: document.title, approval: host?.dataset.printApproved ?? null, status: host?.dataset.publicationStatus ?? null,
    marks: document.querySelectorAll('[data-draft-watermark]').length });
};
window.__DRAFT__ = { prints, saved: JSON.stringify(catalog), current: () => JSON.stringify(source.document) };
createRoot(document.getElementById('root')).render(createElement(PublicationReview, {
  getSource: () => source, subscribe: () => () => {}, onClose: () => { window.__DRAFT__.closed = true; }, onLocateDiagnostic: () => {},
}));
</script></body></html>`;

const server = await createServer({
  root,
  plugins: [{ name: 'draft-print-proof-page', configureServer(devServer) {
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

const evidence = { feature: 'Imprimir rascunho mesmo assim', question: 'Can a blocked catalog print as a draft with "RASCUNHO" on every page while the normal print stays locked?', startedAt: new Date().toISOString(), port };
const errors = [];
const pdfOptions = { format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, margin: { top: '0', right: '0', bottom: '0', left: '0' }, scale: 1 };

/** pdf.js: the text of every sheet, with positions in mm from the top-left corner. */
async function readPdf(bytes) {
  const pdf = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false }).promise;
  const sheets = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const sheet = await pdf.getPage(number);
    const [, , widthPt, heightPt] = sheet.view;
    const content = await sheet.getTextContent();
    const items = content.items.filter(item => item.str.trim()).map(item => ({
      str: item.str, xMm: item.transform[4] * PT_TO_MM, yMm: (heightPt - item.transform[5]) * PT_TO_MM,
    }));
    sheets.push({ sheet: number, widthMm: widthPt * PT_TO_MM, heightMm: heightPt * PT_TO_MM, text: items.map(item => item.str).join(' ').replace(/\s+/g, ' '), items });
  }
  await pdf.destroy();
  return { pageCount: pdf.numPages, sheets };
}
const count = (text, word) => text.split(word).length - 1;

/** In the current media: each page box and the watermark boxes inside it (mm, relative to the page). */
async function probePages(page) {
  return page.evaluate(({ mmPerPx }) => {
    const mm = px => Math.round(px * mmPerPx * 100) / 100;
    return { media: matchMedia('print').matches ? 'print' : 'screen', pages: [...document.querySelectorAll('.vnext-publication-pages .editorial-page')].map(section => {
      const box = section.getBoundingClientRect();
      const marks = [...section.querySelectorAll(':scope > [data-draft-watermark]')].map(mark => {
        const area = mark.getBoundingClientRect(), word = mark.querySelector('span');
        return { text: mark.textContent, leftMm: mm(area.left - box.left), topMm: mm(area.top - box.top), widthMm: mm(area.width), heightMm: mm(area.height),
          color: getComputedStyle(word).color, transform: getComputedStyle(word).transform, overflow: getComputedStyle(mark).overflow };
      });
      return { id: section.getAttribute('data-page-id'), widthMm: mm(box.width), heightMm: mm(box.height), marks };
    }) };
  }, { mmPerPx: MM_PER_CSS_PX });
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  evidence.chromiumVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(origin + route, { waitUntil: 'domcontentloaded' });

  // 2. Real review: blocked by the three "A COMPLETAR" texts; the normal print stays locked.
  await page.waitForSelector('[data-publication-host][data-publication-status="BLOCKED"]', { timeout: 60000 });
  const blocking = await page.$$eval('.vnext-publication-diagnostic[data-severity="ERROR"]', items => items.map(item => item.getAttribute('data-publication-diagnostic')));
  assert.deepEqual(blocking, ['UNRESOLVED_PLACEHOLDER', 'UNRESOLVED_PLACEHOLDER', 'UNRESOLVED_PLACEHOLDER'], 'blocked only by the 3 provisional texts');
  const normalPrint = page.locator('[data-publication-action="print"]');
  assert.equal(await normalPrint.isDisabled(), true, '"Imprimir / salvar PDF" is disabled');
  evidence.blocking = blocking;

  const lockedBytes = await page.pdf(pdfOptions);
  await writeFile(resolve(output, 'locked-before.pdf'), lockedBytes);
  const locked = await readPdf(lockedBytes);
  assert(locked.sheets.every(sheet => !sheet.text.includes('A COMPLETAR') && !sheet.text.includes('RASCUNHO')), 'no catalog page prints while blocked');
  assert(locked.sheets[0].text.includes(NOTICE), `the print policy notice prints instead (got "${locked.sheets[0].text}")`);
  // Even a forged normal approval cannot print a blocked catalog: the guard drops it and the CSS ignores it.
  await page.evaluate(() => { const host = document.querySelector('[data-publication-host]'); host.dataset.printApproved = 'true'; window.dispatchEvent(new Event('beforeprint')); });
  assert.equal(await page.evaluate(() => document.querySelector('[data-publication-host]').dataset.printApproved ?? null), null, 'beforeprint drops a forged approval');
  await page.evaluate(() => { document.querySelector('[data-publication-host]').dataset.printApproved = 'true'; });
  const forged = await readPdf(await page.pdf(pdfOptions));
  assert(forged.sheets.every(sheet => !sheet.text.includes('A COMPLETAR')) && forged.sheets[0].text.includes(NOTICE), 'a forged "true" approval still prints only the notice');
  await page.evaluate(() => document.querySelector('[data-publication-host]').removeAttribute('data-print-approved'));
  evidence.lockedPdf = { pageCount: locked.pageCount, text: locked.sheets.map(sheet => sheet.text), forgedText: forged.sheets.map(sheet => sheet.text) };

  // 3. The confirmation.
  await page.getByRole('button', { name: 'Imprimir rascunho mesmo assim' }).click();
  const confirmation = page.locator('[data-publication-draft-confirm]');
  await confirmation.waitFor();
  assert.equal((await confirmation.locator('[data-publication-draft-total]').textContent()).trim(), 'Este PDF ainda tem 3 itens a corrigir:');
  assert.deepEqual(await confirmation.locator('[data-publication-draft-summary] li').allTextContents(), ['3 textos ainda com “A COMPLETAR”']);
  const acknowledge = page.getByRole('checkbox', { name: 'Entendi: este PDF tem informações incompletas e não é o catálogo final' });
  const markOption = page.getByRole('checkbox', { name: 'Marcar todas as páginas como RASCUNHO' });
  assert.equal(await acknowledge.isChecked(), false); assert.equal(await markOption.isChecked(), true);
  const box = await acknowledge.boundingBox(), label = await page.locator('.vnext-publication-draft-check').first().boundingBox();
  assert(box.width >= 24 && box.height >= 24, `"Entendi" box is at least 24 px (${box.width}×${box.height})`);
  assert(label.height >= 44, `"Entendi" line is a 44 px target (${label.height})`);
  evidence.target = { boxPx: [box.width, box.height], labelHeightPx: label.height };
  await page.getByRole('button', { name: 'Imprimir rascunho', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__DRAFT__.prints.length), 0, 'no print before "Entendi"');
  assert.match(await confirmation.getByRole('alert').textContent(), /marque antes a caixa “Entendi”/);

  // 4. The draft print.
  await acknowledge.check();
  await confirmation.screenshot({ path: resolve(output, 'confirmation.png') });
  await page.getByRole('button', { name: 'Imprimir rascunho', exact: true }).click();
  const prints = await page.evaluate(() => window.__DRAFT__.prints);
  assert.deepEqual(prints, [{ title: 'Prova rascunho — RASCUNHO', approval: 'draft', status: 'BLOCKED', marks: 3 }], 'one draft print, titled for the file, 3 marks');
  evidence.printCall = prints[0];
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: 'print' });
  const printed = await probePages(page);
  assert.equal(printed.media, 'print');
  assert.equal(printed.pages.length, 3);
  printed.pages.forEach((sheet, index) => {
    assert.equal(sheet.marks.length, 1, `page ${index + 1} has exactly one watermark`);
    const [mark] = sheet.marks;
    assert.equal(mark.text, 'RASCUNHO');
    assert(Math.abs(mark.leftMm) < 0.05 && Math.abs(mark.topMm) < 0.05 && Math.abs(mark.widthMm - sheet.widthMm) < 0.05 && Math.abs(mark.heightMm - sheet.heightMm) < 0.05,
      `page ${index + 1} watermark fills exactly its A4 page (${JSON.stringify(mark)})`);
    assert.equal(mark.overflow, 'hidden', 'the word is clipped to the page');
    assert.match(mark.color, /rgba\(110, 110, 110, 0\.16\)/, 'light grey, see-through');
    assert.notEqual(mark.transform, 'none', 'diagonal');
  });
  evidence.printMedia = printed;
  await page.locator('.vnext-publication-pages .editorial-page').first().screenshot({ path: resolve(output, 'draft-page-1.png') });
  const navyMarked = await page.locator('.vnext-publication-pages .editorial-page').nth(1).screenshot({ path: resolve(output, 'draft-page-2-navy.png') });
  const draftBytes = await page.pdf(pdfOptions);
  await writeFile(resolve(output, 'draft.pdf'), draftBytes);
  const draft = await readPdf(draftBytes);
  assert.equal(draft.pageCount, 3, 'three pages print as three sheets');
  draft.sheets.forEach((sheet, index) => {
    assert(Math.abs(sheet.widthMm - 210) < 0.3 && Math.abs(sheet.heightMm - 297) < 0.3, 'A4 sheet');
    // One watermark per sheet: Chromium writes its grey fill and its white outline as two draws of the same word, at
    // the same place, so the text layer may hold "RASCUNHO" twice, never at two different positions.
    const words = sheet.items.filter(item => item.str.includes('RASCUNHO'));
    assert(words.length >= 1 && words.length <= 2 && count(sheet.text, 'RASCUNHO') === words.length, `sheet ${index + 1} has one "RASCUNHO" (got "${sheet.text}")`);
    assert(words.every(word => Math.abs(word.xMm - words[0].xMm) < 0.5 && Math.abs(word.yMm - words[0].yMm) < 0.5),
      `sheet ${index + 1}: the fill and outline draws are the same word in the same place (${JSON.stringify(words)})`);
    assert(sheet.text.includes(`Faixa da página ${index + 1}: A COMPLETAR`), `sheet ${index + 1} still shows its content (got "${sheet.text}")`);
    assert(!sheet.text.includes(NOTICE), 'no policy notice in the draft');
    const [word] = words;
    assert(word.xMm >= 0 && word.xMm <= 210 && word.yMm >= 0 && word.yMm <= 297, `sheet ${index + 1} watermark inside the sheet (${word.xMm}, ${word.yMm})`);
  });
  evidence.draftPdf = { pageCount: draft.pageCount, sheets: draft.sheets.map(sheet => ({ sheet: sheet.sheet, text: sheet.text })) };

  // 5. After printing: no watermark, locked again, nothing saved; without the option the draft has no word.
  // Back to default media: page.pdf() prints with the print CSS, as the browser does (screen media would bypass it).
  await page.emulateMedia({ media: null });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  const after = await page.evaluate(() => ({ marks: document.querySelectorAll('[data-draft-watermark]').length,
    approval: document.querySelector('[data-publication-host]').dataset.printApproved ?? null, title: document.title,
    unchanged: window.__DRAFT__.current() === window.__DRAFT__.saved, closed: Boolean(window.__DRAFT__.closed) }));
  assert.deepEqual(after, { marks: 0, approval: null, title: 'Editor de catálogos', unchanged: true, closed: false });
  const relocked = await readPdf(await page.pdf(pdfOptions));
  assert(relocked.sheets.every(sheet => !sheet.text.includes('A COMPLETAR')) && relocked.sheets[0].text.includes(NOTICE), `locked again after the draft (got ${JSON.stringify(relocked.sheets.map(sheet => sheet.text))}, approval ${await page.evaluate(() => document.querySelector('[data-publication-host]').dataset.printApproved ?? null)})`);
  assert.equal(await normalPrint.isDisabled(), true, '"Imprimir / salvar PDF" still disabled');
  await markOption.uncheck();
  await page.getByRole('button', { name: 'Imprimir rascunho', exact: true }).click();
  // The navy page in print media, now without the word (taken before page.pdf(), whose afterprint ends the draft).
  await page.emulateMedia({ media: 'print' });
  const navyPlain = await page.locator('.vnext-publication-pages .editorial-page').nth(1).screenshot();
  await page.emulateMedia({ media: null });
  const plain = await readPdf(await page.pdf(pdfOptions));
  assert.equal(plain.pageCount, 3);
  assert(plain.sheets.every((sheet, index) => !sheet.text.includes('RASCUNHO') && sheet.text.includes(`Faixa da página ${index + 1}: A COMPLETAR`)), 'without the option: no word, same pages');
  // 6. The watermark must have changed a visible share of the navy page's pixels (same print media, same page).
  const navy = await page.evaluate(async ({ marked, plain }) => {
    const pixels = async base64 => {
      const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    };
    const [a, b] = await Promise.all([pixels(marked), pixels(plain)]);
    let max = 0, visible = 0;
    for (let index = 0; index < a.length; index += 4) {
      const difference = Math.max(Math.abs(a[index] - b[index]), Math.abs(a[index + 1] - b[index + 1]), Math.abs(a[index + 2] - b[index + 2]));
      max = Math.max(max, difference); if (difference >= 40) visible++;
    }
    return { max, visiblePixels: visible, totalPixels: a.length / 4 };
  }, { marked: navyMarked.toString('base64'), plain: navyPlain.toString('base64') });
  assert(navy.visiblePixels >= 2000, `the watermark stands out on the navy page (${JSON.stringify(navy)})`);
  evidence.navyPage = navy;
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  evidence.after = after;
  evidence.unmarkedDraft = plain.sheets.map(sheet => sheet.text);
  await context.close();

  assert.deepEqual(errors, [], 'no page/console errors');
  evidence.errors = errors;
  evidence.finishedAt = new Date().toISOString();
  evidence.verdict = 'PASS';
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('PASS draft print proof');
  console.log(`  blocked by ${blocking.length} × UNRESOLVED_PLACEHOLDER; normal PDF = "${locked.sheets[0].text.slice(0, 70)}…"`);
  for (const sheet of draft.sheets) console.log(`  draft sheet ${sheet.sheet}: ${sheet.text}`);
  console.log(`  print call: ${JSON.stringify(prints[0])}`);
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

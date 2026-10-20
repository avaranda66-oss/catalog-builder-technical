// J5 — "Tabela longa": o pai cola uma tabela de faixas com 40 linhas (cabeçalho + 40) numa página vazia.
// O pai continua pela interface, confere os cabeçalhos, desfaz e publica um PDF real no harness local.
//   1 catálogo "Em branco" → Ctrl+V de 41 linhas × 4 colunas na página vazia → o que aparece?
//   2 "Continuar na próxima página" preserva as 40 linhas e repete o cabeçalho
//   3 um Desfazer restaura tudo; Refazer devolve todas as partes
//   4 Publicar / PDF fica Pronto; PDF A4 com cabeçalho repetido e as 40 faixas pesquisáveis
//   5 tudo salvo; zero erros de console (backend simulado do harness)
//   node tests/vnext/proof/father-journeys/j05-tabela-longa.mjs
//   VP=1280 node tests/vnext/proof/father-journeys/j05-tabela-longa.mjs
import { mkdir, readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OUT, VP_SUFFIX, rel, baseUrl, consoleErrors, createCatalog, ensureServer, freshDb, harnessUrl, journey, launch, shot, state, visibleText, waitSaved,
  writeJourneyResult,
} from './lib.mjs';
import { scanJargon as eyesScanJargon, unexplainedMm } from './fixtures/father-eyes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TSV_40 = await readFile(resolve(HERE, 'fixtures/tsv/faixas-40.tsv'), 'utf8');
const TSV_LINES = TSV_40.trim().split(/\r?\n/).length;
/** "Zoom" é corrente em português; "Catalog Builder" é a marca do produto. */
const JARGON_ALLOW = ['Zoom', 'Catalog', 'Builder'];

const server = await ensureServer();
const { browser, context, page, log, viewport } = await launch();
page.setDefaultTimeout(8000);
const j = journey('j05-tabela-longa', 'J5 — continuar tabela de 40 linhas, repetir cabeçalho, desfazer e publicar PDF A4 pesquisável');
const measurements = {};
const jargonSeen = [];
const clicks = {};
const countClick = (task, n = 1) => { clicks[task] = (clicks[task] ?? 0) + n; };
let status = 'fail';

// Recarga do servidor de desenvolvimento (outro processo salvando src/ no worktree faz o vite recarregar a página):
// invalida a execução. Marca a janela depois da abertura e confere se a marca sobreviveu.
const viteEvents = [];
page.on('console', (m) => { if (/\[vite\]/.test(m.text())) viteEvents.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
const mark = () => page.evaluate(() => { window.__PROOF_MARK = true; }).catch(() => {});
let reloadDetected = false;
async function checkReload(where) {
  const gone = await page.evaluate(() => window.__PROOF_MARK !== true).catch(() => false);
  if (gone) { reloadDetected = true; (measurements.reloads ??= []).push(where); }
}

/** Passo de usabilidade: quando falha vira ACHADO (ok: false, finding: severidade). Só P0/P1 derrubam a jornada. */
function findingStep(name, ok, detail, severity) {
  const passed = j.step(name, ok, detail);
  if (!passed) j.steps[j.steps.length - 1].finding = severity;
  return passed;
}

const pageObjects = (st, index = 0) => st.runtime.document.pages[index]?.objects ?? [];
const allObjects = (st) => st.runtime.document.pages.flatMap((p) => p.objects);

async function notices() {
  return page.evaluate(() => {
    const root = document.querySelector('[data-editor-notices]');
    const notice = root?.querySelector('[data-editor-notice]');
    if (!notice) return { text: '', visible: false, tone: null };
    const rect = notice.getBoundingClientRect();
    const text = notice.innerText.replace(/\s+/g, ' ').trim();
    return { text, visible: text.length > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0, tone: notice.getAttribute('data-tone') };
  });
}

async function noticeTimeline(action, { appearTimeout = 4000 } = {}) {
  const t0 = Date.now();
  await action();
  while (Date.now() - t0 < appearTimeout) {
    const n = await notices();
    if (n.text) return { ...n, afterMs: Date.now() - t0 };
    await page.waitForTimeout(25);
  }
  return null;
}

async function issuesChip() {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-vnext-shell] button, [data-vnext-shell] [role=status], [data-vnext-shell] span')]
      .find((node) => /a corrigir|para revisar/.test(node.textContent ?? ''));
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  });
}

async function scanJargon(where, selector = '[data-vnext-shell]') {
  const text = await visibleText(page, selector).catch(() => '');
  const hits = eyesScanJargon(text, { allow: JARGON_ALLOW });
  const mm = unexplainedMm(text);
  if (hits.length || mm.length) jargonSeen.push({ where, words: hits.map((h) => h.term), context: hits.map((h) => h.context).slice(0, 4), mm });
  return hits.map((h) => h.term);
}

async function realPaste(text) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl() });
  const written = await page.evaluate(async (t) => {
    try { await navigator.clipboard.writeText(t); return true; } catch (error) { return String(error.message); }
  }, text);
  await page.keyboard.press('Control+v');
  return written;
}

async function syntheticPaste(text) {
  return page.evaluate((t) => {
    const data = new DataTransfer();
    data.setData('text/plain', t);
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
    target.dispatchEvent(event);
    return { target: target.tagName, prevented: event.defaultPrevented };
  }, text);
}

async function clickEmptyPageSpot() {
  const region = page.getByRole('region', { name: /^Página \d+$/ }).first();
  const box = await region.boundingBox();
  await page.mouse.click(box.x + box.width / 2, Math.min(box.y + box.height - 40, viewport.height - 20));
  await page.waitForTimeout(150);
}

function tableSummary(object) {
  if (!object || object.type !== 'table') return null;
  const t = object.table;
  return {
    rows: t.rows.length, columns: t.columns.length,
    headerRows: t.rows.filter((row) => row.role === 'header').length,
    headerStyled: Boolean(t.style?.rowRoles?.header),
    frame: object.frame,
    bottomMm: Math.round((object.frame.yMm + object.frame.heightMm) * 10) / 10,
    fitsPage: object.frame.yMm + object.frame.heightMm <= 297 && object.frame.xMm + object.frame.widthMm <= 210,
  };
}

/** O que está desenhado: quantas linhas aparecem dentro da folha, quantas passam do fim, há "!" no objeto? */
async function drawnTable(tableId, objectId) {
  return page.evaluate(({ tableId, objectId }) => {
    const grid = document.querySelector(`[data-table-id="${tableId}"]`);
    const pageEl = grid?.closest('section[data-page-id]');
    if (!grid || !pageEl) return { error: 'tabela não desenhada' };
    const pageRect = pageEl.getBoundingClientRect();
    // .logical-row é display:contents (sem caixa própria): a posição da linha vem da primeira célula dela.
    const rows = [...grid.querySelectorAll('[role=row]')];
    const rowBottom = (row) => row.querySelector('[role=cell], [role=columnheader]')?.getBoundingClientRect().bottom ?? Infinity;
    const inside = rows.filter((row) => rowBottom(row) <= pageRect.bottom + 0.5).length;
    const gridRect = grid.getBoundingClientRect();
    const hit = document.querySelector(`[data-editor-object-id="${objectId}"]`);
    const badge = hit?.querySelector('[data-editor-diagnostic-badge]');
    const cell = grid.querySelector('[role=cell] [data-flow-root]');
    const cs = cell ? getComputedStyle(cell) : null;
    const ratio = cell && cell.offsetWidth ? cell.getBoundingClientRect().width / cell.offsetWidth : 1;
    const overflowClipped = getComputedStyle(pageEl).overflow !== 'visible' || getComputedStyle(pageEl.parentElement).overflow !== 'visible';
    return {
      rowsDrawn: rows.length, rowsInsidePage: inside, rowsBeyondPage: rows.length - inside,
      beyondPagePx: Math.round(gridRect.bottom - pageRect.bottom),
      badge: badge ? { severity: badge.getAttribute('data-editor-diagnostic-badge'), label: badge.getAttribute('aria-label') } : null,
      cellFontPx: cs ? Math.round(parseFloat(cs.fontSize) * ratio * 10) / 10 : null,
      overflowClipped,
    };
  }, { tableId, objectId }).catch((error) => ({ error: String(error.message).slice(0, 160) }));
}

/** Procura, em tudo o que está na tela, um botão ou item de menu que fale em continuar/dividir em outra página. */
async function continuationControl() {
  return page.evaluate(() => {
    const re = /continuar na próxima página|continuar na página seguinte|dividir (a )?tabela|quebrar (a )?tabela/i;
    const nodes = [...document.querySelectorAll('button, [role=button], [role=menuitem], [role=option], label, summary')];
    const hit = nodes.find((el) => re.test(el.textContent ?? '') || re.test(el.getAttribute('aria-label') ?? ''));
    return hit ? (hit.getAttribute('aria-label') ?? hit.textContent ?? '').trim().slice(0, 80) : null;
  });
}

try {
  measurements.chromium = browser.version();
  measurements.tsvLines = TSV_LINES;
  const db = freshDb('j05');
  await page.goto(harnessUrl({ db }));
  await createCatalog(page, { name: 'J5 — tabela longa', starter: 'Em branco' });
  await mark();
  await clickEmptyPageSpot();
  let written;
  const notice1 = await noticeTimeline(async () => { written = await realPaste(TSV_40); });
  await page.waitForTimeout(1500);
  let st = await state(page);
  let longTable = pageObjects(st).find((o) => o.type === 'table');
  let method = 'Ctrl+V real';
  if (!longTable) {
    await syntheticPaste(TSV_40);
    await page.waitForTimeout(1500);
    st = await state(page);
    longTable = pageObjects(st).find((o) => o.type === 'table');
    method = `evento paste sintético; clipboard real: ${written}`;
  }
  const original = tableSummary(longTable);
  measurements.pasteMethod = method;
  measurements.notice1 = notice1;
  j.step('1 colar cria 41 linhas (cabeçalho + 40) e quatro colunas',
    Boolean(longTable) && original.rows === TSV_LINES && original.columns === 4 && original.headerRows === 1, JSON.stringify(original));
  await waitSaved(page, 20000);
  st = await state(page);
  longTable = pageObjects(st).find((o) => o.id === longTable.id);
  const sourceDocument = structuredClone(st.runtime.document);
  j.step('1 a tabela original fica salva antes da continuação', !(await state(page)).runtime.dirty);
  j.addEvidence(await shot(page, 'j05-tabela-longa-01-antes-de-continuar'));

  const cellText = (content) => content.type === 'richText'
    ? content.value.paragraphs.map((p) => p.inlines.map((i) => i.text ?? '\n').join('')).join('\n')
    : content.type === 'technicalCode' ? content.value : content.type === 'measurement' ? content.valueText : '';
  const rowsOf = (table, role) => table.rows.filter((r) => role === 'header' ? r.role === 'header' : r.role !== 'header')
    .map((row) => table.columns.map((column) => cellText(table.cells.find((c) => c.rowId === row.id && c.columnId === column.id)?.content ?? { type: 'empty' })));
  const expectedHeader = rowsOf(longTable.table, 'header'), expectedBody = rowsOf(longTable.table, 'body');
  await page.locator(`[data-editor-object-id="${longTable.id}"]`).click({ position: { x: 10, y: 10 } });
  const continueButton = page.getByRole('button', { name: 'Continuar na próxima página', exact: true });
  await continueButton.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => {
    const b = document.querySelector('[data-editor-action="continue-table-next-page"]');
    return b && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
  }, null, { timeout: 15000 });
  j.step('2 a tabela longa oferece Continuar na próxima página', await continueButton.isEnabled());
  const splitStarted = Date.now();
  await continueButton.click(); countClick('2 continuar tabela', 1);
  await page.waitForFunction(() => window.__FATHER__.state().runtime.document.pages.length > 1, null, { timeout: 20000 });
  await waitSaved(page, 20000);
  st = await state(page);
  const splitDocument = structuredClone(st.runtime.document);
  const parts = st.runtime.document.pages.flatMap((p) => p.objects.filter((o) => o.type === 'table').map((o) => ({ pageId: p.id, object: o })));
  const actualBody = parts.flatMap(({ object }) => rowsOf(object.table, 'body'));
  measurements.continuation = { ms: Date.now() - splitStarted, pages: st.runtime.document.pages.length, parts: parts.map(({ pageId, object }) => ({ pageId, ...tableSummary(object) })) };
  j.step('2 a tabela continua em páginas seguintes e cada parte cabe no A4',
    parts.length >= 2 && parts.length === st.runtime.document.pages.length && parts.every(({ object }) => tableSummary(object).fitsPage),
    JSON.stringify(measurements.continuation));
  j.step('2 todas as 40 linhas permanecem na mesma ordem, sem perda ou duplicação',
    actualBody.length === 40 && JSON.stringify(actualBody) === JSON.stringify(expectedBody));
  j.step('2 cada continuação repete o cabeçalho e o seu estilo',
    parts.every(({ object }) => JSON.stringify(rowsOf(object.table, 'header')) === JSON.stringify(expectedHeader)
      && JSON.stringify(object.table.style.rowRoles?.header) === JSON.stringify(longTable.table.style.rowRoles?.header)));
  j.addEvidence(await shot(page, 'j05-tabela-longa-02-continuada'));
  await page.getByRole('button', { name: 'Página 2', exact: true }).click();
  await page.waitForTimeout(300);
  const headerDrawn = await page.locator(`[data-table-id="${parts[1].object.table.id}"] [role=columnheader]`).allTextContents();
  j.step('2 o cabeçalho repetido aparece também na página desenhada', JSON.stringify(headerDrawn.map((t) => t.trim())) === JSON.stringify(expectedHeader[0]));
  j.addEvidence(await shot(page, 'j05-tabela-longa-03-cabecalho-segunda-pagina'));

  await page.getByRole('button', { name: 'Desfazer última alteração' }).click();
  st = await state(page);
  j.step('3 um Desfazer restaura a tabela inteira e remove as páginas de continuação',
    JSON.stringify(st.runtime.document) === JSON.stringify(sourceDocument));
  await page.getByRole('button', { name: 'Refazer última alteração' }).click();
  st = await state(page);
  j.step('3 Refazer restaura todas as partes e os cabeçalhos',
    JSON.stringify(st.runtime.document) === JSON.stringify(splitDocument));
  await waitSaved(page, 20000);

  const publishStarted = Date.now();
  await page.getByRole('button', { name: 'Publicar / PDF', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisar e publicar' });
  await dialog.waitFor({ timeout: 15000 });
  await page.waitForFunction(() => ['READY', 'BLOCKED'].includes(document.querySelector('[data-publication-host]')?.getAttribute('data-publication-status')),
    null, { timeout: 30000 });
  const publicationStatus = await page.locator('[data-publication-host]').getAttribute('data-publication-status');
  const diagnostics = await dialog.locator('[data-publication-diagnostic]').evaluateAll((nodes) => nodes.map((n) => ({ code: n.dataset.publicationDiagnostic, text: n.innerText })));
  const print = dialog.getByRole('button', { name: 'Imprimir / salvar PDF', exact: true });
  measurements.publication = { status: publicationStatus, ms: Date.now() - publishStarted, diagnostics };
  j.step('4 a publicação fica Pronto e permite imprimir depois de continuar a tabela',
    publicationStatus === 'READY' && await print.isEnabled(), JSON.stringify(measurements.publication));
  j.addEvidence(await shot(page, 'j05-tabela-longa-04-publicacao'));
  if (publicationStatus !== 'READY') throw new Error('A tabela continuada ainda bloqueia a publicação; PDF não gerado.');
  await page.evaluate(() => { window.__J5_PRINTS = 0; window.print = () => { window.__J5_PRINTS += 1; }; });
  await print.click();
  await page.waitForFunction(() => window.__J5_PRINTS === 1 && document.querySelector('[data-publication-host]')?.getAttribute('data-print-approved') === 'true', null, { timeout: 15000 });
  const pdfDir = resolve(OUT, 'pdf'); await mkdir(pdfDir, { recursive: true });
  const pdfPath = resolve(pdfDir, `j05-tabela-longa${VP_SUFFIX}.pdf`);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false,
    margin: { top: '0', right: '0', bottom: '0', left: '0' }, scale: 1 });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  const pdf = await getDocument({ data: new Uint8Array(await readFile(pdfPath)), isEvalSupported: false, useSystemFonts: false }).promise;
  const pdfPages = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const p = await pdf.getPage(n), content = await p.getTextContent();
    pdfPages.push({ widthPt: p.view[2] - p.view[0], heightPt: p.view[3] - p.view[1], text: content.items.map((item) => item.str ?? '').join(' ') });
  }
  const pdfText = pdfPages.map((p) => p.text).join(' '), pdfCodes = pdfText.match(/\bF\d{2}\b/g) ?? [];
  await pdf.destroy();
  measurements.pdf = { path: rel(pdfPath), pages: pdfPages, codes: pdfCodes };
  j.step('4 o PDF contém todas as partes em A4, cabeçalho em cada página e 40 faixas pesquisáveis',
    pdfPages.length === parts.length && pdfPages.every((p) => Math.abs(p.widthPt - 595.28) < 1.5 && Math.abs(p.heightPt - 841.89) < 1.5 && p.text.includes('Faixa'))
      && pdfCodes.length === 40 && new Set(pdfCodes).size === 40 && pdfText.includes('F01') && pdfText.includes('F40')
      && !/A COMPLETAR|Voltar ao editor|Imprimir \/ salvar PDF/.test(pdfText), rel(pdfPath));
  await dialog.getByRole('button', { name: 'Voltar ao editor', exact: true }).click();
  await waitSaved(page, 20000);
  await checkReload('fim');
  const errors = consoleErrors(log);
  j.step('5 zero erros de console e de página', errors.length === 0 && log.pageErrors.length === 0,
    JSON.stringify({ errors, pageErrors: log.pageErrors }));

} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 900));
  await shot(page, 'j05-tabela-longa-99-erro').then((p) => j.addEvidence(p)).catch(() => {});
} finally {
  measurements.viteEvents = viteEvents;
  if (reloadDetected || viteEvents.some((e) => /page reload|full reload/i.test(e))) {
    j.step('ambiente: nenhuma recarga do servidor de desenvolvimento durante a prova (sem isso o resultado não vale; rode de novo)', false,
      `recarga detectada em: ${(measurements.reloads ?? []).join(', ') || '-'} · eventos vite: ${viteEvents.join(' | ').slice(0, 400) || '-'}`);
  }
  // fail = passo funcional ou achado P0/P1 falhou; pending = depende da Onda 2; achados P2/P3 ficam ok:false no passo
  // (e no checkpoint) sem derrubar a jornada. Nunca verde o que não rodou.
  const failed = j.steps.some((s) => s.ok === false && !(s.finding === 'P2' || s.finding === 'P3'));
  const pendingSteps = j.steps.filter((s) => s.pending).map((s) => s.detail);
  const softFindings = j.steps.filter((s) => s.ok === false && s.finding).map((s) => ({ name: s.name, severity: s.finding, detail: s.detail }));
  status = failed ? 'fail' : pendingSteps.length ? 'pending' : 'pass';
  const path = await writeJourneyResult(j.name, {
    status, title: j.title, steps: j.steps, evidence: j.evidence, findings: j.findings, log,
    extra: {
      pendingReason: pendingSteps.length ? pendingSteps.join(' | ') : undefined, pendingSteps, softFindings,
      durationMs: j.steps.reduce((max, s) => Math.max(max, s.atMs ?? 0), 0),
      viewportUsed: viewport, server: server.baseUrl, measurements, jargonSeen, clicks,
    },
  });
  console.log(`${j.name}: ${status.toUpperCase()} → ${path}`);
  await browser.close();
  await server.close();
}
process.exit(status === 'fail' ? 1 : 0);

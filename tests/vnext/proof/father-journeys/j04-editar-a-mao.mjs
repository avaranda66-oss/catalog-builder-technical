// J4 — "Edita à mão sem travar", pelos olhos do pai, só pela interface visível.
// Dois catálogos: um "Em branco" (A) e um "Ficha técnica essencial" (B).
//   A1 colar bloco 12 × 4 do Excel numa página vazia (Ctrl+V de verdade; se o navegador não deixar, evento paste)
//   A2 inserir "Tabela", dois cliques na célula, digitar "Parâmetro" + Enter (Conteúdo da célula + Enter, Tab e Esc)
//   B1 "Tabela" + dois cliques na célula (mesma checagem no modelo Ficha técnica)
//   B2 colar pelo botão "Colar tabela do Excel" / caixa "Cole aqui" numa página nova vazia
//   B3 transformar um texto em "Título" (aplicar, Desfazer e Refazer)
//   B4 adicionar página, excluir pelo menu ⋯ (texto da confirmação), mover, Ctrl+Z
//   B5 zoom 100 % e 125 % pelo controle e Ctrl+roda; tamanho do texto em px
//   B6 campo X com "12,5" e "abc": nada trava; Desfazer e Salvar continuam funcionando
//   Alvos na tela (botões e alças), letras dos botões e jargão no texto visível, em cada etapa.
//   node tests/vnext/proof/father-journeys/j04-editar-a-mao.mjs
//   VP=1280 node tests/vnext/proof/father-journeys/j04-editar-a-mao.mjs
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aria, baseUrl, consoleErrors, createCatalog, ensureServer, freshDb, harnessUrl, journey, launch,
  shot, state, visibleText, waitSaved, writeJourneyResult,
} from './lib.mjs';
import { scanJargon as eyesScanJargon, unexplainedMm } from './fixtures/father-eyes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TSV_12x4 = await readFile(resolve(HERE, 'fixtures/tsv/excel-12x4.tsv'), 'utf8');

const MIN_TARGET_PX = 24;
const MIN_BUTTON_FONT_PX = 15; // escala 60+ (Onda 2, 2C)
const MIN_BODY_FONT_PX = 13;
/** Palavras que a varredura de inglês confundiria: "Zoom" é corrente em português; "Catalog Builder" é a marca do produto. */
const JARGON_ALLOW = ['Zoom', 'Catalog', 'Builder'];

const server = await ensureServer();
const { browser, context, page, log, viewport } = await launch();
page.setDefaultTimeout(8000);
const j = journey('j04-editar-a-mao', 'J4 — edita à mão sem travar (tabela, colar do Excel, título, páginas, zoom, campo X)');
const measurements = {};
const jargonSeen = [];
const clicks = {};
const countClick = (task, n = 1) => { clicks[task] = (clicks[task] ?? 0) + n; };
let status = 'fail';
const inspector = page.getByRole('complementary', { name: /Inspector|Propriedades/ });

// Recarga do servidor de desenvolvimento (outro processo salvando src/ no worktree faz o vite recarregar a página):
// invalida a execução. Marca a janela depois de cada abertura e confere se a marca sobreviveu.
const viteEvents = [];
page.on('console', (m) => { if (/\[vite\]/.test(m.text())) viteEvents.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
const mark = () => page.evaluate(() => { window.__PROOF_MARK = true; }).catch(() => {});
let reloadDetected = false;
async function checkReload(where) {
  const gone = await page.evaluate(() => window.__PROOF_MARK !== true).catch(() => false);
  if (gone) { reloadDetected = true; (measurements.reloads ??= []).push(where); }
}

/**
 * Passo de usabilidade: quando falha vira ACHADO (ok: false, finding: severidade). Só P0/P1 derrubam a jornada;
 * P2/P3 ficam vermelhos no passo e no checkpoint, mas a jornada segue pelo que o pai consegue terminar.
 */
function findingStep(name, ok, detail, severity) {
  const passed = j.step(name, ok, detail);
  if (!passed) j.steps[j.steps.length - 1].finding = severity;
  return passed;
}

const pageObjects = (st, index = 0) => st.runtime.document.pages[index]?.objects ?? [];
const allObjects = (st) => st.runtime.document.pages.flatMap((p) => p.objects);
const pageIds = async () => (await state(page)).runtime.document.pages.map((p) => p.id);

/** A mensagem flutuante do editor (FR-12) e se está dentro da janela sem rolar. */
async function notices() {
  return page.evaluate(() => {
    const root = document.querySelector('[data-editor-notices]');
    const notice = root?.querySelector('[data-editor-notice]');
    const bands = root?.querySelector('[data-editor-notice-bands]');
    if (!notice) return { text: '', visible: false, tone: null, bands: bands?.innerText.replace(/\s+/g, ' ').trim() ?? '' };
    const rect = notice.getBoundingClientRect();
    const text = notice.innerText.replace(/\s+/g, ' ').trim();
    return {
      text,
      visible: text.length > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0,
      tone: notice.getAttribute('data-tone'),
      bands: bands?.innerText.replace(/\s+/g, ' ').trim() ?? '',
    };
  });
}

/** Executa a ação e cronometra quando a mensagem apareceu (e, se pedido, quando sumiu sozinha). */
async function noticeTimeline(action, { appearTimeout = 4000, watchVanish = false, vanishTimeout = 9000 } = {}) {
  const t0 = Date.now();
  await action();
  let first = null;
  while (Date.now() - t0 < appearTimeout) {
    const n = await notices();
    if (n.text) { first = { ...n, afterMs: Date.now() - t0 }; break; }
    await page.waitForTimeout(25);
  }
  let vanishedAfterMs = null;
  if (first && watchVanish) {
    while (Date.now() - t0 < vanishTimeout) {
      const n = await notices();
      if (!n.text || n.text !== first.text) { vanishedAfterMs = Date.now() - t0; break; }
      await page.waitForTimeout(100);
    }
  }
  return { first, vanishedAfterMs };
}

/** O chip "N a corrigir · M para revisar" acima da página. */
async function issuesChip() {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-vnext-shell] button, [data-vnext-shell] [role=status], [data-vnext-shell] span')]
      .find((node) => /a corrigir|para revisar/.test(node.textContent ?? ''));
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  });
}

/** Abre o chip → "Problemas do catálogo", lê o texto e usa "Localizar" para descobrir a que objeto o aviso se refere. */
async function inspectIssues(label) {
  const chip = await issuesChip();
  const out = { chip, panel: null, issues: [], located: null };
  const chipButton = page.locator('[data-page-diagnostic-summary]');
  if (await chipButton.count() && chip && !/0 a corrigir · 0 para revisar$/.test(chip)) {
    await chipButton.click();
    await page.waitForTimeout(300);
    const dialog = page.getByRole('dialog', { name: 'Problemas do catálogo' });
    if (await dialog.count()) {
      out.panel = (await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 1600);
      out.issues = await dialog.locator('[data-issue-code]').evaluateAll((nodes) => nodes.map((node) => ({
        code: node.getAttribute('data-issue-code'), severity: node.getAttribute('data-severity'),
      })));
      const locate = dialog.locator('[data-issue-action="locate"]').first();
      if (await locate.count()) {
        await locate.click();
        await page.waitForTimeout(400);
        out.located = await page.evaluate(() => document.querySelector('[data-editor-object-id][data-selected="true"]')?.getAttribute('data-editor-object-id') ?? null);
      }
      if (await dialog.count()) await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      // "Ir até lá" abre a grade e um aviso persistente. Restaura a superfície
      // antes de testar os gestos do pai; não clicar através desse aviso.
      const overlap = await page.evaluate(() => {
        const notice = document.querySelector('[data-editor-notices] [data-editor-notice]')?.getBoundingClientRect();
        const table = document.querySelector('[data-editor-object-id][data-selected="true"]')?.getBoundingClientRect();
        return notice && table ? Math.max(0, Math.min(notice.right, table.right) - Math.max(notice.left, table.left))
          * Math.max(0, Math.min(notice.bottom, table.bottom) - Math.max(notice.top, table.top)) : 0;
      });
      if (overlap > 0) findingStep(`${label}: aviso de localização cobre parte da tabela e exige fechar antes de editar`, false,
        `sobreposição medida: ${Math.round(overlap)} px²; conhecido FR-12/2C; botão Fechar usado sem force`, 'P2');
      const closeNotice = page.locator('[data-editor-notices]').getByRole('button', { name: 'Fechar', exact: true });
      out.cleanup = { closedNotice: await closeNotice.count() > 0, returnedToObject: false };
      if (out.cleanup.closedNotice) await closeNotice.first().click();
      const backToObject = page.getByRole('button', { name: 'Voltar ao objeto', exact: true });
      if (await backToObject.count() > 0) {
        await backToObject.click();
        out.cleanup.returnedToObject = true;
      }
    }
  }
  measurements[`issues:${label}`] = out;
  return out;
}

/**
 * Mede o texto desenhado: fonte CSS, zoom efetivo da página (rect / offsetWidth, independe da versão do Chromium),
 * fonte efetiva em px na tela e a altura real de uma linha de texto.
 */
async function measureText(locator, label) {
  const info = await locator.first().evaluate((el) => {
    const r1 = (n) => Math.round(n * 10) / 10;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const ratio = el.offsetWidth ? rect.width / el.offsetWidth : 1;
    const fontPx = parseFloat(cs.fontSize);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let textNode = null;
    while (walker.nextNode()) { if (walker.currentNode.textContent.trim()) { textNode = walker.currentNode; break; } }
    let lineBoxPx = null;
    if (textNode) {
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const rects = range.getClientRects();
      if (rects.length) lineBoxPx = r1(rects[0].height);
    }
    return {
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
      fontPx: r1(fontPx), zoomRatio: r1(ratio), effectiveFontPx: r1(fontPx * ratio), lineBoxPx,
      w: Math.round(rect.width), h: Math.round(rect.height),
      inViewport: rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth,
    };
  }).catch((error) => ({ error: String(error.message).slice(0, 160) }));
  measurements[label] = info;
  return info;
}

/** Mede um botão/campo fora da página: caixa, menor lado, fonte. */
async function measure(locator, label) {
  const info = await locator.first().evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      w: Math.round(rect.width), h: Math.round(rect.height), minSide: Math.round(Math.min(rect.width, rect.height)),
      fontPx: Math.round(parseFloat(cs.fontSize) * 10) / 10, top: Math.round(rect.top),
      inViewport: rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth,
    };
  }).catch((error) => ({ error: String(error.message).slice(0, 160) }));
  measurements[label] = info;
  return info;
}

async function scanJargon(where) {
  const text = await visibleText(page, '[data-vnext-shell]').catch(() => '');
  const hits = eyesScanJargon(text, { allow: JARGON_ALLOW });
  const mm = unexplainedMm(text);
  if (hits.length || mm.length) jargonSeen.push({ where, words: hits.map((h) => h.term), context: hits.map((h) => h.context).slice(0, 4), mm });
  return hits.map((h) => h.term);
}

/** Ctrl+V de verdade: escreve no clipboard do navegador e tecla Ctrl+V. */
async function realPaste(text) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl() });
  const written = await page.evaluate(async (t) => {
    try { await navigator.clipboard.writeText(t); return true; } catch (error) { return String(error.message); }
  }, text);
  await page.keyboard.press('Control+v');
  return written;
}

/** Evento paste sintético (como os testes de table-paste fazem), com text/plain em TSV. */
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
    rows: t.rows.length,
    columns: t.columns.length,
    headerRows: t.rows.filter((row) => row.role === 'header').length,
    headerStyled: Boolean(t.style?.rowRoles?.header),
    styleKeys: Object.keys(t.style ?? {}),
    frame: object.frame,
    fitsPage: object.frame.yMm + object.frame.heightMm <= 297 && object.frame.xMm + object.frame.widthMm <= 210,
  };
}

/**
 * B-01: altura da moldura (documento) e do conteúdo desenhado da tabela na página do editor, em mm. Usa medidas
 * de layout (offsetHeight e grid-template-rows), que não mudam com o zoom; rowsMm mostra a altura de cada linha.
 */
async function tableGeometry(object) {
  if (!object || object.type !== 'table') return null;
  const frameMm = object.frame.heightMm;
  const dom = await page.evaluate(({ objectId, tableId }) => {
    const root = document.querySelector('[data-editorial-root]');
    const node = root?.querySelector(`[data-object-id="${CSS.escape(objectId)}"]`);
    const intrinsic = node?.querySelector(`[data-table-intrinsic="${CSS.escape(tableId)}"]`);
    const grid = node?.querySelector(`[data-table-id="${CSS.escape(tableId)}"]`);
    if (!node || !intrinsic || !grid || !node.offsetHeight) return null;
    return {
      framePx: node.offsetHeight,
      contentPx: intrinsic.offsetHeight,
      rowsPx: getComputedStyle(grid).gridTemplateRows.split(' ').map((value) => parseFloat(value)),
    };
  }, { objectId: object.id, tableId: object.table.id });
  if (!dom) return { frameMm, contentMm: null, rowsMm: [] };
  const mmPerPx = frameMm / dom.framePx;
  const r2 = (n) => Math.round(n * 100) / 100;
  return { frameMm: r2(frameMm), contentMm: r2(dom.contentPx * mmPerPx), rowsMm: dom.rowsPx.map((px) => r2(px * mmPerPx)) };
}

/** O que está desenhado na página para a tabela (cabeçalho em destaque? textos iguais?). */
async function tableCells(tableId) {
  return page.locator(`[data-table-id="${tableId}"]`).first().evaluate((grid) => {
    const headers = [...grid.querySelectorAll('[role=columnheader]')].map((el) => el.innerText.trim());
    const rows = [...grid.querySelectorAll('[role=row]')];
    const firstBodyRow = rows.find((row) => row.querySelector('[role=cell]'));
    const firstBody = firstBodyRow ? [...firstBodyRow.querySelectorAll('[role=cell]')].map((el) => el.innerText.trim()) : [];
    const h = grid.querySelector('[role=columnheader]');
    const b = firstBodyRow?.querySelector('[role=cell]');
    const hs = h ? getComputedStyle(h) : null;
    const bs = b ? getComputedStyle(b) : null;
    const gridRect = grid.getBoundingClientRect();
    const pageRect = grid.closest('section[data-page-id]')?.getBoundingClientRect();
    return {
      headers, firstBody, rowCount: rows.length,
      headerBg: hs?.backgroundColor ?? null, bodyBg: bs?.backgroundColor ?? null,
      headerColor: hs?.color ?? null, headerWeight: hs?.fontWeight ?? null, bodyWeight: bs?.fontWeight ?? null,
      bottomBeyondPagePx: pageRect ? Math.round(gridRect.bottom - pageRect.bottom) : null,
    };
  }).catch((error) => ({ error: String(error.message).slice(0, 160) }));
}

/** Alvos na tela: menor lado de cada botão/alça/campo visível; lista os < 24 px e as letras < 15 px. */
async function measureTargets(label) {
  const result = await page.evaluate(({ minSide, minFont }) => {
    const seen = [];
    const name = (el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const selector = '[data-vnext-shell] button, [data-vnext-shell] [role=button], [data-vnext-shell] [role=gridcell], [data-vnext-shell] [data-resize-handle], '
      + '[data-vnext-shell] [role=menuitem], [data-vnext-shell] input:not([type=hidden]), [data-vnext-shell] select';
    for (const el of document.querySelectorAll(selector)) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const fontPx = Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10;
      seen.push({ name: name(el) || el.getAttribute('data-resize-handle') || el.tagName, w: Math.round(rect.width), h: Math.round(rect.height), minSide: Math.round(Math.min(rect.width, rect.height)), fontPx });
    }
    const small = seen.filter((t) => t.minSide < minSide);
    const tinyText = seen.filter((t) => t.fontPx < minFont && (t.name ?? '').length > 1 && !/^Redimensionar/.test(t.name));
    return { total: seen.length, small, tinyText: tinyText.slice(0, 20), smallest: [...seen].sort((a, b) => a.minSide - b.minSide).slice(0, 8) };
  }, { minSide: MIN_TARGET_PX, minFont: MIN_BUTTON_FONT_PX });
  measurements[`alvos:${label}`] = result;
  return result;
}

try {
  measurements.chromium = browser.version();
  // =============================== Catálogo A: "Em branco" ===============================
  const dbA = freshDb('j04a');
  await page.goto(harnessUrl({ db: dbA }));
  await createCatalog(page, { name: 'J4 — em branco', starter: 'Em branco' });
  await mark();
  let st = await state(page);
  j.step('A0 catálogo "Em branco" abre salvo, com uma página vazia',
    st.runtime.saveLabel === 'Saved' && st.runtime.document.pages.length === 1 && pageObjects(st).length === 0,
    `páginas: ${st.runtime.document.pages.length} · objetos: ${pageObjects(st).length}`);
  measurements.fitZoomA = await page.locator('[data-stage-zoom]').getAttribute('data-stage-zoom');

  // ---- A1: colar 12 × 4 do Excel na página vazia (Ctrl+V) ----
  await clickEmptyPageSpot();
  countClick('A1 colar (Ctrl+V)');
  let written;
  const timelineA1 = await noticeTimeline(async () => { written = await realPaste(TSV_12x4); }, { watchVanish: true });
  await page.waitForTimeout(300);
  st = await state(page);
  let pasted = pageObjects(st).find((o) => o.type === 'table');
  let pasteMethod = 'Ctrl+V real';
  if (!pasted) {
    const synthetic = await syntheticPaste(TSV_12x4);
    await page.waitForTimeout(1200);
    st = await state(page);
    pasted = pageObjects(st).find((o) => o.type === 'table');
    pasteMethod = `evento paste sintético (${JSON.stringify(synthetic)}; clipboard real: ${written})`;
  }
  measurements.pasteMethodA = pasteMethod;
  measurements.noticeTimelineA1 = timelineA1;
  const pastedSummary = tableSummary(pasted);
  j.step('A1 Ctrl+V do bloco 12 × 4 cria uma tabela na página vazia',
    Boolean(pasted) && pastedSummary.rows === 12 && pastedSummary.columns === 4, `${pasteMethod} · ${JSON.stringify(pastedSummary)}`);
  const noticeA1 = timelineA1.first;
  j.step('A1 aparece uma mensagem visível (sem rolar) dizendo o que aconteceu, em menos de 1 s',
    Boolean(noticeA1) && noticeA1.visible && /Tabela criada com 12 linhas e 4 colunas/.test(noticeA1.text) && noticeA1.afterMs < 1000,
    noticeA1 ? `${noticeA1.afterMs} ms · ${noticeA1.tone} · "${noticeA1.text.slice(0, 160)}"` : 'nenhuma mensagem em 4 s');
  j.step('A1 a mensagem é de sucesso (verde), não parece erro', noticeA1?.tone === 'success', `tom: ${noticeA1?.tone}`);
  // Tempo de leitura: ~19 palavras. A 150 palavras/min (leitor de 60 anos, sem pressa) são ~7,6 s.
  const wordsA1 = (noticeA1?.text ?? '').split(/\s+/).length;
  const readingNeededMs = Math.round((wordsA1 / 150) * 60000);
  measurements.noticeReading = { words: wordsA1, readingNeededMs, vanishedAfterMs: timelineA1.vanishedAfterMs };
  findingStep('A1 a mensagem fica na tela tempo suficiente para ler (some só depois do tempo de leitura)',
    timelineA1.vanishedAfterMs === null || timelineA1.vanishedAfterMs >= readingNeededMs,
    `sumiu sozinha após ${timelineA1.vanishedAfterMs ?? '> 9000'} ms; ${wordsA1} palavras pedem ~${readingNeededMs} ms a 150 palavras/min`, 'P3');
  const cellsA1 = pasted ? await tableCells(pasted.table.id) : null;
  measurements.cellsA1 = cellsA1;
  j.step('A1 a tabela colada tem cabeçalho (primeira linha em destaque, fundo diferente do corpo) e estilo próprio',
    Boolean(cellsA1) && !cellsA1.error && cellsA1.headers.length === 4 && pastedSummary.headerRows === 1 && pastedSummary.headerStyled
      && cellsA1.headerBg !== cellsA1.bodyBg,
    JSON.stringify({ headers: cellsA1?.headers, headerBg: cellsA1?.headerBg, bodyBg: cellsA1?.bodyBg, headerStyled: pastedSummary?.headerStyled, error: cellsA1?.error }));
  const bodyA1 = cellsA1?.firstBody?.join('|') ?? '';
  j.step('A1 valores com vírgula, ±, ° e ponto de milhar chegaram iguais ("±0,1 °C", "-25 a 140 °C", "1.500")',
    bodyA1.includes('-25 a 140 °C') && bodyA1.includes('±0,1 °C') && bodyA1.includes('1.500'), `1ª linha do corpo: ${bodyA1}`);
  j.step('A1 "0,02 % FE" preservado', pasted ? JSON.stringify(pasted.table.cells).includes('0,02 % FE') : false);
  await waitSaved(page, 20000);
  st = await state(page);
  j.step('A1 a tabela colada cabe na página e foi salva sozinha', pastedSummary?.fitsPage && st.runtime.saveLabel === 'Saved',
    `frame: ${JSON.stringify(allObjects(st).find((o) => o.id === pasted?.id)?.frame)} · salvo: ${st.runtime.saveLabel}`);
  const cellFontA1 = pasted
    ? await measureText(page.locator(`[data-table-id="${pasted.table.id}"] [role=cell] [data-flow-root]`), 'A1 fonte da célula (Ajustar à largura)')
    : { error: 'sem tabela' };
  findingStep(`A1 texto da célula legível no zoom "Ajustar à largura" (≥ ${MIN_BODY_FONT_PX} px efetivos)`,
    (cellFontA1.effectiveFontPx ?? 0) >= MIN_BODY_FONT_PX, `${JSON.stringify(cellFontA1)} · janela ${viewport.width}×${viewport.height}`, 'P3');
  j.addEvidence(await shot(page, 'j04-editar-a-mao-01-colar-12x4'));
  const jargonA1 = await scanJargon('A1 depois de colar');
  j.step('A1 sem jargão/inglês na tela depois de colar', jargonA1.length === 0, jargonA1.join(', ') || '-');

  // ---- A2: "Tabela" numa página nova + dois cliques na célula + digitar ----
  await page.getByRole('button', { name: 'Adicionar nova página após a página atual' }).click();
  countClick('A2 inserir tabela', 1);
  await page.waitForTimeout(400);
  const timelineA2 = await noticeTimeline(() => page.getByRole('button', { name: 'Tabela', exact: true }).click());
  countClick('A2 inserir tabela', 1);
  await page.waitForTimeout(400);
  st = await state(page);
  const newTable = pageObjects(st, 1).find((o) => o.type === 'table');
  const newSummary = tableSummary(newTable);
  j.step('A2 botão "Tabela" cria uma tabela pronta (6 × 3, com cabeçalho) na página nova',
    Boolean(newTable) && newSummary.rows === 6 && newSummary.columns === 3 && newSummary.headerRows === 1, JSON.stringify(newSummary));
  j.step('A2 mensagem visível logo depois de inserir, dizendo como escrever nela',
    Boolean(timelineA2.first) && timelineA2.first.visible && /Editar tabela/.test(timelineA2.first.text),
    timelineA2.first ? `${timelineA2.first.afterMs} ms · "${timelineA2.first.text.slice(0, 160)}"` : 'nenhuma mensagem');
  // Aviso amarelo logo depois de inserir? A que objeto se refere?
  // Um aviso amarelo logo depois de inserir é aceitável só se for sobre algo que o pai entende e não assusta
  // ("linhas vazias", "Nada impede o PDF"); um aviso de área segura/fora da página numa tabela que ele acabou de inserir não.
  const issuesA2 = await inspectIssues('A2 logo após inserir Tabela');
  const scaryA2 = issuesA2.located === newTable?.id && /cruza|segura|fora da página/i.test(issuesA2.panel ?? '');
  const reassuringA2 = !issuesA2.panel || (/Nada impede o PDF/.test(issuesA2.panel) && /linhas vazias/.test(issuesA2.panel));
  findingStep('A2 o aviso amarelo que aparece ao inserir "Tabela" (se houver) é sobre linhas vazias, diz que nada impede o PDF e não fala de área segura',
    !scaryA2 && reassuringA2, `chip: "${issuesA2.chip || '-'}" · painel: "${issuesA2.panel ?? '-'}" · "Localizar" selecionou: ${issuesA2.located === newTable?.id ? 'a tabela nova' : (issuesA2.located ?? '-')}`, 'P2');
  await waitSaved(page, 20000);
  measurements.tableGeometryA2 = { beforeTyping: await tableGeometry(allObjects(await state(page)).find((o) => o.id === newTable?.id)) };
  const hit = page.locator(`[data-editor-object-id="${newTable?.id}"]`);
  await hit.dblclick({ position: { x: 30, y: 30 } });
  countClick('A2 editar célula (caminho esperado)', 2);
  await page.waitForTimeout(400);
  const gridOpen = await page.locator('[data-table-grid-overlay]').isVisible().catch(() => false);
  j.step('A2 dois cliques na tabela abrem a grade de edição ("Editar tabela")', gridOpen);
  measurements.gridHintVisible = await page.locator('main').getByText(/Dê dois cliques ou pressione Enter para editar/).first().isVisible().catch(() => false);
  const cell = page.getByRole('gridcell', { name: 'Linha 2, coluna 1' });
  await measure(cell, 'A2 célula da grade (alvo)');
  await cell.dblclick();
  countClick('A2 editar célula (caminho esperado)', 2);
  await page.waitForTimeout(400);
  const inline = page.getByRole('textbox', { name: 'Conteúdo da célula, linha 2, coluna 1', exact: true });
  await inline.waitFor({ state: 'visible' });
  const inlineBox = await inline.boundingBox();
  j.step('A2 o campo Conteúdo da célula abre sobre a grade, visível e com foco',
    Boolean(inlineBox) && inlineBox.y >= 0 && inlineBox.y + inlineBox.height <= viewport.height
      && await inline.evaluate((el) => el === document.activeElement), JSON.stringify(inlineBox));
  j.step('A2 abrir a célula sem digitar não altera o documento',
    !(await state(page)).runtime.dirty, (await page.locator('[data-save-state]').first().innerText()).trim());
  await inline.fill('Parâmetro');
  await inline.press('Enter');
  await page.waitForTimeout(300);
  st = await state(page);
  const textAt = (snapshot, row, column) => {
    const table = allObjects(snapshot).find((o) => o.id === newTable.id)?.table;
    const content = table?.cells.find((c) => c.rowId === table.rows[row]?.id && c.columnId === table.columns[column]?.id)?.content;
    return content?.type === 'richText' ? content.value.paragraphs.map((p) => p.inlines.map((i) => i.text ?? '\n').join('')).join('\n')
      : content?.type === 'technicalCode' ? content.value : '';
  };
  j.step('A2 Enter salva Parâmetro na linha 2, coluna 1', textAt(st, 1, 0) === 'Parâmetro');
  await page.keyboard.type('Faixa');
  const below = page.getByRole('textbox', { name: 'Conteúdo da célula, linha 3, coluna 1', exact: true });
  await below.waitFor({ state: 'visible' });
  j.step('A2 Enter desce para a linha seguinte e uma tecla inicia a edição', await below.inputValue() === 'Faixa');
  await below.press('Tab');
  await page.waitForTimeout(250);
  st = await state(page);
  j.step('A2 Tab salva Faixa na linha 3, coluna 1', textAt(st, 2, 0) === 'Faixa');
  const beforeCancel = textAt(st, 2, 1);
  await page.keyboard.type('Descartar');
  const right = page.getByRole('textbox', { name: 'Conteúdo da célula, linha 3, coluna 2', exact: true });
  await right.waitFor({ state: 'visible' });
  j.step('A2 Tab avança para a coluna da direita', await right.inputValue() === 'Descartar');
  await right.press('Escape');
  st = await state(page);
  j.step('A2 Esc cancela apenas a digitação da célula atual e mantém as anteriores',
    textAt(st, 2, 1) === beforeCancel && textAt(st, 1, 0) === 'Parâmetro' && textAt(st, 2, 0) === 'Faixa'
      && await page.locator('[data-cell-inline-editor]').count() === 0);
  measurements.inlineKeyboard = { enter: textAt(st, 1, 0), tab: textAt(st, 2, 0), escaped: textAt(st, 2, 1), inlineBox };
  j.addEvidence(await shot(page, 'j04-editar-a-mao-02-celula-enter-tab-esc'));
  j.step('A2 o editor segue responsivo após Enter, Tab e Esc',
    log.pageErrors.length === 0 && await page.getByRole('button', { name: 'Tabela', exact: true }).isEnabled());

  const jargonA2 = await scanJargon('A2 edição de célula');
  j.step('A2 sem jargão/inglês na tela durante a edição da célula', jargonA2.length === 0, jargonA2.join(', ') || '-');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await waitSaved(page, 20000).catch(() => {});
  st = await state(page);
  j.step('A2 tudo salvo sozinho ao fim (Salvo)', st.runtime.saveLabel === 'Saved' && !st.runtime.dirty, `saveLabel: ${st.runtime.saveLabel}`);
  // B-01: linhas com texto ficam mais altas que linhas vazias; a moldura precisa acompanhar o conteúdo digitado.
  const geometryA2 = measurements.tableGeometryA2;
  geometryA2.afterTyping = await tableGeometry(allObjects(st).find((o) => o.id === newTable?.id));
  const { beforeTyping, afterTyping } = geometryA2;
  j.step('A2 a moldura da tabela cresce sozinha com o texto digitado e o conteúdo cabe nela (B-01)',
    Boolean(beforeTyping?.contentMm && afterTyping?.contentMm) && afterTyping.frameMm >= beforeTyping.frameMm
      && afterTyping.contentMm <= afterTyping.frameMm + 0.05,
    JSON.stringify(geometryA2));
  // Preserve the actual publication diagnostic after typing, not only the one from an empty table.
  const afterInlineIssues = await inspectIssues('A2 após Enter, Tab e Esc');
  j.step('A2 digitar Parâmetro/Faixa numa tabela nova não introduz bloqueio de altura para publicar (B-01)',
    !afterInlineIssues.issues.some((issue) => issue.code === 'TABLE_CONTENT_OVERFLOW'), JSON.stringify(afterInlineIssues));
  j.addEvidence(await shot(page, 'j04-editar-a-mao-02b-diagnostico-apos-editar'));
  const errorsA = consoleErrors(log);
  j.step('A console limpo no catálogo "Em branco"', errorsA.length === 0 && log.pageErrors.length === 0,
    `console: ${errorsA.map((e) => e.text).join(' | ') || '-'} · página: ${log.pageErrors.join(' | ') || '-'}`);
  await checkReload('fim do catálogo A');

  // =============================== Catálogo B: "Ficha técnica essencial" ===============================
  const dbB = freshDb('j04b');
  await page.goto(harnessUrl({ db: dbB }));
  await createCatalog(page, { name: 'J4 — ficha técnica', starter: 'Ficha técnica essencial' });
  await mark();
  st = await state(page);
  const textObj = pageObjects(st).find((o) => o.type === 'text');
  const templateTable = pageObjects(st).find((o) => o.type === 'table');
  j.step('B0 catálogo "Ficha técnica essencial" abre salvo, com texto e tabela de exemplo',
    st.runtime.saveLabel === 'Saved' && Boolean(textObj) && Boolean(templateTable),
    `objetos: ${pageObjects(st).map((o) => o.type).join(', ')}`);
  measurements.chipB0 = await issuesChip();
  const targetsB0 = await measureTargets('B0 editor recém-aberto');
  findingStep('Alvos na tela ≥ 24 px (botões principais)', targetsB0.small.length === 0,
    JSON.stringify(targetsB0.small.slice(0, 8)), 'P2');
  findingStep(`Letras dos botões ≥ ${MIN_BUTTON_FONT_PX} px`, targetsB0.tinyText.length === 0,
    JSON.stringify(targetsB0.tinyText.slice(0, 8)), 'P2');

  // ---- B1: "Tabela" + dois cliques na célula no modelo ----
  const timelineB1 = await noticeTimeline(() => page.getByRole('button', { name: 'Tabela', exact: true }).click());
  await page.waitForTimeout(500);
  st = await state(page);
  const tablesB = pageObjects(st).filter((o) => o.type === 'table');
  const tableB1 = tablesB[tablesB.length - 1];
  const sumB1 = tableSummary(tableB1);
  j.step('B1 "Tabela" no modelo cria 6 × 3 com cabeçalho', Boolean(tableB1) && sumB1.rows === 6 && sumB1.columns === 3 && sumB1.headerRows === 1, JSON.stringify(sumB1));
  measurements.noticeB1 = timelineB1.first ? `${timelineB1.first.afterMs} ms · ${timelineB1.first.text.slice(0, 200)}` : null;
  // Aviso amarelo logo depois de inserir? A que objeto se refere?
  const issuesB1 = await inspectIssues('B1 logo após inserir Tabela no modelo');
  const scaryB1 = issuesB1.located === tableB1?.id && /cruza|segura|fora da página/i.test(issuesB1.panel ?? '');
  const reassuringB1 = !issuesB1.panel || (/Nada impede o PDF/.test(issuesB1.panel) && /linhas vazias/.test(issuesB1.panel));
  findingStep('B1 o aviso amarelo que aparece ao inserir "Tabela" no modelo (se houver) é sobre linhas vazias, diz que nada impede o PDF e não fala de área segura',
    !scaryB1 && reassuringB1, `chip antes: "${measurements.chipB0 || '-'}" · depois: "${issuesB1.chip || '-'}" · painel: "${issuesB1.panel ?? '-'}" · "Localizar" selecionou: ${issuesB1.located === tableB1?.id ? 'a tabela nova' : (issuesB1.located ?? '-')}`, 'P2');
  await page.locator(`[data-editor-object-id="${tableB1?.id}"]`).dblclick({ position: { x: 30, y: 30 } });
  await page.waitForTimeout(400);
  await page.getByRole('gridcell', { name: 'Linha 2, coluna 2' }).dblclick();
  await page.waitForTimeout(400);
  const inlineB = page.getByRole('textbox', { name: 'Conteúdo da célula, linha 2, coluna 2', exact: true });
  await inlineB.waitFor({ state: 'visible' });
  await inlineB.fill('Parâmetro');
  await inlineB.press('Enter');
  await page.waitForTimeout(300);
  st = await state(page);
  const landedB = JSON.stringify(allObjects(st).find((o) => o.id === tableB1?.id)?.table.cells ?? []).includes('Parâmetro');
  j.step('B1 digitar na célula + Enter escreve no modelo Ficha técnica', landedB);
  j.step('B1 nada travou (sem erro de página; botão Tabela ativo)',
    log.pageErrors.length === 0 && await page.getByRole('button', { name: 'Tabela', exact: true }).isEnabled());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // ---- B2: colar pelo botão "Colar tabela do Excel" numa página nova vazia ----
  await page.getByRole('button', { name: 'Adicionar nova página após a página atual' }).click();
  countClick('B2 colar pelo botão', 1);
  await page.waitForTimeout(400);
  const pasteButton = page.getByRole('button', { name: 'Colar tabela do Excel', exact: true });
  j.step('B2 botão "Colar tabela do Excel" visível na barra', await pasteButton.isVisible());
  await measure(pasteButton, 'B2 botão Colar tabela do Excel');
  await pasteButton.click();
  countClick('B2 colar pelo botão', 1);
  const pasteArea = page.getByRole('region', { name: 'Colar tabela do Excel' });
  await pasteArea.waitFor({ timeout: 5000 });
  const box = pasteArea.getByRole('textbox', { name: 'Cole aqui (Ctrl+V)' });
  j.step('B2 a caixa "Cole aqui (Ctrl+V)" abre já com o cursor dentro', await box.evaluate((el) => document.activeElement === el));
  const helpText = await pasteArea.innerText();
  j.step('B2 a caixa explica em português o que fazer (Excel → Ctrl+C → Ctrl+V)', /Ctrl\+C/.test(helpText) && /Ctrl\+V/.test(helpText), helpText.replace(/\s+/g, ' ').slice(0, 200));
  await measureText(pasteArea.locator('p').first(), 'B2 fonte da explicação da caixa');
  j.addEvidence(await shot(page, 'j04-editar-a-mao-04-caixa-colar-vazia'));
  const writtenB = await realPaste(TSV_12x4);
  await page.waitForTimeout(600);
  let boxValue = await box.inputValue();
  let boxMethod = 'Ctrl+V real';
  if (!boxValue.includes('\t')) {
    await box.fill(TSV_12x4);
    boxValue = await box.inputValue();
    boxMethod = `fill (clipboard real: ${writtenB})`;
  }
  measurements.pasteMethodB = boxMethod;
  const summaryText = await pasteArea.locator('[data-paste-table-summary]').first().innerText().catch(() => '');
  const headerCheck = pasteArea.getByRole('checkbox', { name: 'A primeira linha é o cabeçalho (fica em destaque)' });
  j.step('B2 a caixa mostra "12 linhas × 4 colunas", prévia e cabeçalho marcado',
    /12 linhas × 4 colunas/.test(summaryText) && await headerCheck.isChecked() && await pasteArea.getByRole('table', { name: 'Prévia da tabela' }).isVisible(),
    `${boxMethod} · resumo: "${summaryText}"`);
  j.addEvidence(await shot(page, 'j04-editar-a-mao-05-caixa-colar-previa'));
  const timelineB2 = await noticeTimeline(() => pasteArea.getByRole('button', { name: 'Criar tabela' }).click(), { watchVanish: true, vanishTimeout: 7000 });
  countClick('B2 colar pelo botão', 1);
  measurements.noticeTimelineB2 = timelineB2;
  await page.waitForTimeout(300);
  st = await state(page);
  const pastedB = pageObjects(st, 1).find((o) => o.type === 'table');
  const sumB2 = tableSummary(pastedB);
  const cellsB2 = pastedB ? await tableCells(pastedB.table.id) : null;
  j.step('B2 "Criar tabela" põe a tabela 12 × 4 na página nova, com cabeçalho em destaque e estilo',
    Boolean(pastedB) && sumB2.rows === 12 && sumB2.columns === 4 && sumB2.headerRows === 1 && sumB2.headerStyled && cellsB2 && !cellsB2.error && cellsB2.headerBg !== cellsB2.bodyBg,
    JSON.stringify({ ...sumB2, headers: cellsB2?.headers, headerBg: cellsB2?.headerBg, bodyBg: cellsB2?.bodyBg }));
  j.step('B2 a caixa fecha sozinha depois de criar', (await pasteArea.count()) === 0);
  j.step('B2 mensagem de sucesso visível logo depois de "Criar tabela" (em menos de 1 s)',
    Boolean(timelineB2.first) && timelineB2.first.visible && timelineB2.first.tone === 'success' && /12 linhas e 4 colunas/.test(timelineB2.first.text) && timelineB2.first.afterMs < 1000,
    timelineB2.first ? `${timelineB2.first.afterMs} ms · ${timelineB2.first.tone} · "${timelineB2.first.text.slice(0, 160)}" · sumiu após ${timelineB2.vanishedAfterMs ?? '> 7000'} ms` : 'nenhuma mensagem apareceu em 4 s');
  await waitSaved(page, 20000);
  j.step('B2 cabe na página e foi salvo', sumB2?.fitsPage && (await state(page)).runtime.saveLabel === 'Saved', JSON.stringify(sumB2?.frame));
  j.addEvidence(await shot(page, 'j04-editar-a-mao-06-tabela-colada-pelo-botao'));

  // ---- B3: transformar um texto em "Título" ----
  await page.getByRole('button', { name: 'Página 1', exact: true }).click();
  await page.waitForTimeout(400);
  const textHit = page.locator(`[data-editor-object-id="${textObj.id}"]`);
  await textHit.click();
  await page.waitForTimeout(300);
  const inspectorText = (await inspector.innerText().catch(() => '')).replace(/\s+/g, ' ');
  const more = inspector.getByRole('button', { name: 'Mais propriedades' });
  if (await more.count()) await more.click();
  await page.waitForTimeout(300);
  const moreOptions = page.getByRole('button', { name: /^(Mais opções|Ocultar opções)$/ });
  if (await moreOptions.count() && (await moreOptions.getAttribute('aria-expanded')) !== 'true') await moreOptions.click();
  await page.waitForTimeout(300);
  const styleControls = await page.evaluate(() => {
    const text = document.querySelector('[data-vnext-shell]')?.innerText ?? '';
    return { hits: ['Título', 'Subtítulo', 'Corpo', 'Negrito', 'Tamanho', 'Estilo do texto', 'Cor do texto', 'Alinhamento'].filter((w) => text.includes(w)) };
  });
  const titleControl = inspector.getByRole('button', { name: /^Título(?:\s|$)/ });
  const bodyControl = inspector.getByRole('button', { name: /^Corpo(?:\s|$)/ });
  j.step('B3 há controles Título e Corpo para o texto selecionado',
    await titleControl.isVisible() && await bodyControl.isVisible(), `controles: ${styleControls.hits.join(', ')}`);
  const originalText = JSON.stringify(textObj.text);
  await bodyControl.click();
  const bodyStyle = allObjects(await state(page)).find((o) => o.id === textObj.id).style;
  await titleControl.click();
  st = await state(page);
  const titleObject = allObjects(st).find((o) => o.id === textObj.id);
  j.step('B3 clicar Título aplica 16 pt e negrito, sem alterar o texto',
    titleObject.style.fontSizePt === 16 && titleObject.style.fontWeight === 700
      && JSON.stringify(titleObject.text) === originalText && await titleControl.getAttribute('aria-pressed') === 'true',
    JSON.stringify(titleObject.style));
  await page.getByRole('button', { name: 'Desfazer última alteração' }).click();
  const undoneStyle = allObjects(await state(page)).find((o) => o.id === textObj.id).style;
  j.step('B3 um Desfazer devolve o estilo Corpo', JSON.stringify(undoneStyle) === JSON.stringify(bodyStyle));
  await page.getByRole('button', { name: 'Refazer última alteração' }).click();
  j.step('B3 Refazer restaura Título', allObjects(await state(page)).find((o) => o.id === textObj.id).style.fontSizePt === 16);
  measurements.textStyleControls = { ...styleControls, bodyStyle, titleStyle: titleObject.style, undoneStyle };
  j.addEvidence(await shot(page, 'j04-editar-a-mao-07-texto-com-estilo-titulo'));
  await textHit.dblclick();
  await page.waitForTimeout(300);
  const textArea = page.getByRole('textbox', { name: 'Editar conteúdo do texto' });
  const textEditOpen = await textArea.isVisible().catch(() => false);
  j.step('B3 dois cliques no texto abrem a edição do texto (sem travar)', textEditOpen);
  if (textEditOpen) {
    await measureText(textArea, 'B3 fonte da caixa de edição de texto');
    measurements.textEditToolbar = (await page.locator('.vnext-text-edit-toolbar').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).first().click();
    await page.waitForTimeout(200);
  }
  const jargonB3 = await scanJargon('B3 texto selecionado + Mais propriedades + Mais opções');
  j.step('B3 sem jargão/inglês com o texto selecionado e os painéis abertos', jargonB3.length === 0, jargonB3.join(', ') || '-');
  if (await moreOptions.count() && (await moreOptions.getAttribute('aria-expanded')) === 'true') await moreOptions.click();
  await page.keyboard.press('Escape');

  // ---- B4: páginas — adicionar, excluir pelo menu ⋯ (confirmação), mover, Ctrl+Z ----
  await clickEmptyPageSpot();
  let ids = await pageIds();
  const pagesBefore = ids.length;
  await page.getByRole('button', { name: 'Adicionar nova página após a página atual' }).click();
  countClick('B4 adicionar página', 1);
  await page.waitForTimeout(400);
  ids = await pageIds();
  j.step('B4 "Adicionar página" cria uma página extra', ids.length === pagesBefore + 1, `${pagesBefore} → ${ids.length}`);
  const lastIndex = ids.length;
  const nav = page.getByRole('navigation', { name: 'Navegação de páginas' });
  const optionsButton = nav.getByRole('button', { name: `Opções da Página ${lastIndex}` });
  await measure(optionsButton, 'B4 botão ⋯ Opções da Página');
  await optionsButton.click();
  countClick('B4 excluir página', 1);
  await page.waitForTimeout(250);
  const menu = page.getByRole('menu').first();
  const menuSnap = await aria(page, menu).catch(() => '');
  j.step('B4 o menu ⋯ da página oferece Duplicar, Mover e Excluir em português',
    /Duplicar página/.test(menuSnap) && /Mover para cima/.test(menuSnap) && /Excluir página/.test(menuSnap), menuSnap.replace(/\s+/g, ' ').slice(0, 200));
  await measure(page.getByRole('menuitem', { name: /Excluir página/ }), 'B4 item de menu Excluir página');
  await page.getByRole('menuitem', { name: /Excluir página/ }).click();
  countClick('B4 excluir página', 1);
  await page.waitForTimeout(300);
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog')).first();
  const confirmSnap = await aria(page, confirm).catch(() => '');
  const confirmText = (await confirm.innerText().catch(() => '')).replace(/\s+/g, ' ');
  measurements.deleteConfirmText = confirmText;
  j.step('B4 aparece uma confirmação clara antes de excluir ("Excluir a Página N?", diz que dá para desfazer com Ctrl+Z)',
    new RegExp(`Excluir a Página ${lastIndex}\\?`).test(confirmText) && /Desfazer \(Ctrl\+Z\)/.test(confirmText) && /Cancelar/.test(confirmSnap),
    confirmText.slice(0, 220));
  await measureText(confirm.locator('p').first(), 'B4 fonte do texto da confirmação');
  j.addEvidence(await shot(page, 'j04-editar-a-mao-08-confirmar-excluir-pagina'));
  const confirmButton = confirm.getByRole('button', { name: new RegExp(`^Excluir Página ${lastIndex}$`) });
  await measure(confirmButton, 'B4 botão confirmar exclusão');
  const timelineDel = await noticeTimeline(() => confirmButton.click());
  countClick('B4 excluir página', 1);
  await page.waitForTimeout(300);
  ids = await pageIds();
  const noticeDel = timelineDel.first;
  j.step('B4 a página some e a mensagem diz como recuperar',
    ids.length === pagesBefore && Boolean(noticeDel) && /excluída/.test(noticeDel.text) && /Desfazer/.test(noticeDel.text) && noticeDel.visible,
    `páginas: ${ids.length} · ${noticeDel ? `${noticeDel.afterMs} ms · "${noticeDel.text.slice(0, 160)}"` : 'sem mensagem'}`);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  ids = await pageIds();
  j.step('B4 Ctrl+Z traz a página excluída de volta', ids.length === pagesBefore + 1, `páginas: ${ids.length}`);
  const orderBefore = ids.join();
  await nav.getByRole('button', { name: 'Opções da Página 1' }).click();
  countClick('B4 mover página', 1);
  await page.waitForTimeout(250);
  const timelineMove = await noticeTimeline(() => page.getByRole('menuitem', { name: /Mover para baixo/ }).click());
  countClick('B4 mover página', 1);
  await page.waitForTimeout(300);
  ids = await pageIds();
  const noticeMove = timelineMove.first;
  j.step('B4 "Mover para baixo" troca a ordem e avisa', ids[1] === orderBefore.split(',')[0] && Boolean(noticeMove) && /movida/.test(noticeMove.text) && noticeMove.visible,
    noticeMove ? `${noticeMove.afterMs} ms · "${noticeMove.text.slice(0, 160)}"` : 'sem mensagem');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  ids = await pageIds();
  j.step('B4 Ctrl+Z desfaz a mudança de ordem', ids.join() === orderBefore);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  ids = await pageIds();
  j.step('B4 outro Ctrl+Z remove a página extra adicionada', ids.length === pagesBefore, `páginas: ${ids.length}`);
  j.addEvidence(await shot(page, 'j04-editar-a-mao-09-paginas-depois-dos-ctrl-z'));

  // ---- B5: zoom 100 % / 125 % pelo controle e Ctrl+roda ----
  await page.getByRole('button', { name: 'Página 1', exact: true }).click();
  await page.waitForTimeout(300);
  const zoomGroup = page.getByRole('group', { name: 'Zoom da página' });
  const zoomSelect = zoomGroup.getByRole('combobox', { name: 'Zoom', exact: true });
  const zoomOptions = await zoomSelect.locator('option').allTextContents();
  j.step('B5 o controle de zoom está visível com Ajustar à largura / 75% / 100% / 125% e botões de aproximar/afastar',
    await zoomGroup.isVisible() && await zoomSelect.isVisible()
      && ['Ajustar à largura', '75%', '100%', '125%'].every((label) => zoomOptions.includes(label))
      && await zoomGroup.getByRole('button', { name: 'Diminuir o zoom', exact: true }).isVisible()
      && await zoomGroup.getByRole('button', { name: 'Aumentar o zoom', exact: true }).isVisible());
  await measure(zoomSelect, 'B5 seletor de zoom');
  const textProbe = page.locator(`section[data-page-id] [data-object-id="${textObj.id}"] [data-flow-root]`).first();
  const bodyCellProbe = page.locator(`[data-table-id="${templateTable?.table.id}"] [role=cell] [data-flow-root]`).first();
  const zoomMetrics = {};
  const fitText = await measureText(textProbe, 'B5 fonte do título a Ajustar à largura');
  const fitCell = await measureText(bodyCellProbe, 'B5 fonte da célula do modelo a Ajustar à largura');
  zoomMetrics.fit = { zoom: Number(await page.locator('[data-stage-zoom]').getAttribute('data-stage-zoom')), textPx: fitText.effectiveFontPx, cellPx: fitCell.effectiveFontPx, cellLineBoxPx: fitCell.lineBoxPx };
  for (const label of ['100%', '125%']) {
    await zoomSelect.selectOption({ label });
    countClick(`B5 zoom ${label}`, 1);
    await page.waitForTimeout(500);
    const z = await page.evaluate(() => ({
      zoom: Number(document.querySelector('[data-stage-zoom]')?.getAttribute('data-stage-zoom')),
      choice: document.querySelector('[data-stage-zoom-choice]')?.getAttribute('data-stage-zoom-choice'),
      windowOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      pageWidthPx: Math.round(document.querySelector('section[data-page-id]')?.getBoundingClientRect().width ?? 0),
      canvasScrollable: (() => { const c = document.querySelector('.vnext-canvas-area'); return c ? c.scrollWidth > c.clientWidth + 1 : null; })(),
    }));
    const t = await measureText(textProbe, `B5 fonte do título a ${label}`);
    const c = await measureText(bodyCellProbe, `B5 fonte da célula do modelo a ${label}`);
    zoomMetrics[label] = { ...z, textPx: t.effectiveFontPx, cellPx: c.effectiveFontPx, cellLineBoxPx: c.lineBoxPx };
    j.step(`B5 escolher ${label} aplica o zoom (página com ${z.pageWidthPx} px de largura; a janela não ganha rolagem horizontal)`,
      Math.abs(z.zoom - parseInt(label, 10) / 100) < 0.01 && !z.windowOverflow && z.pageWidthPx > 0, JSON.stringify(zoomMetrics[label]));
    j.addEvidence(await shot(page, `j04-editar-a-mao-10-zoom-${label.replace('%', '')}`));
  }
  measurements.zoomMetrics = zoomMetrics;
  j.step(`B5 texto de célula legível a 100 % (≥ ${MIN_BODY_FONT_PX} px) e maior a 125 %`,
    (zoomMetrics['100%'].cellPx ?? 0) >= MIN_BODY_FONT_PX && (zoomMetrics['125%'].cellPx ?? 0) > (zoomMetrics['100%'].cellPx ?? 0), JSON.stringify(zoomMetrics));
  // Ctrl+roda: a partir de 75 %, cada dente para cima sobe um degrau (75 → 100 → Ajustar à largura, se ficar entre
  // 100 e 125 nesta janela → 125); cada dente para baixo desce um degrau. Os degraus são ordenados pelo valor do zoom.
  await zoomSelect.selectOption({ label: '75%' });
  await page.waitForTimeout(300);
  const canvas = page.locator('.vnext-canvas-area');
  const canvasBox = await canvas.boundingBox();
  const readZoom = () => page.evaluate(() => ({
    choice: document.querySelector('[data-stage-zoom-choice]')?.getAttribute('data-stage-zoom-choice'),
    zoom: Number(document.querySelector('[data-stage-zoom]')?.getAttribute('data-stage-zoom')),
  }));
  async function ctrlWheel(deltaY) {
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, deltaY);
    await page.keyboard.up('Control');
    await page.waitForTimeout(500);
    return readZoom();
  }
  const wheel = { method: 'Ctrl + roda (mouse do Playwright)', steps: [await readZoom()] };
  wheel.steps.push(await ctrlWheel(-120));
  if (wheel.steps[1].zoom === wheel.steps[0].zoom) {
    await canvas.evaluate((el) => el.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, bubbles: true, cancelable: true })));
    await page.waitForTimeout(500);
    wheel.steps[1] = await readZoom();
    wheel.method = 'evento wheel sintético com ctrlKey';
  }
  for (let i = 0; i < 3; i++) wheel.steps.push(await ctrlWheel(-120)); // mais 3 dentes para cima: deve chegar a 125 e parar
  wheel.steps.push(await ctrlWheel(120)); // um dente para baixo
  wheel.browserZoomUnchanged = await page.evaluate(() => Math.abs(window.devicePixelRatio - 1) < 0.01);
  const zooms = wheel.steps.map((s) => s.zoom);
  const upOk = zooms[1] > zooms[0] && zooms[2] > zooms[1];
  const reached125 = zooms[4] === 1.25 && zooms[3] === 1.25 || zooms[4] === 1.25;
  const downOk = zooms[5] < zooms[4];
  measurements.wheelZoom = wheel;
  j.step('B5 Ctrl + roda sobre a página sobe o zoom em degraus até 125 % e desce um degrau na volta (e não mexe no zoom do navegador)',
    upOk && reached125 && downOk && wheel.browserZoomUnchanged, `${wheel.method} · ${wheel.steps.map((s) => `${s.choice}=${s.zoom}`).join(' → ')}`);
  await zoomSelect.selectOption({ label: 'Ajustar à largura' });
  await page.waitForTimeout(400);

  // ---- B6: campo X com "12,5" e "abc" ----
  await textHit.click();
  await page.waitForTimeout(300);
  const more2 = inspector.getByRole('button', { name: 'Mais propriedades' });
  if (await more2.count()) { await more2.click(); countClick('B6 abrir campo X', 1); }
  await page.waitForTimeout(300);
  const xField = inspector.getByRole('textbox', { name: 'X mm' });
  j.step('B6 o campo X aparece em "Mais propriedades", com a explicação "Posição e tamanho em milímetros"',
    await xField.isVisible() && /milímetros/.test(await inspector.innerText()));
  await measure(xField, 'B6 campo X');
  const xBefore = allObjects(await state(page)).find((o) => o.id === textObj.id).frame.xMm;
  await xField.click();
  await xField.fill('12,5');
  await xField.press('Enter');
  await page.waitForTimeout(400);
  st = await state(page);
  const xAfterComma = allObjects(st).find((o) => o.id === textObj.id).frame.xMm;
  j.step('B6 "12,5" com vírgula é aceito (X passa a 12,5 mm)', Math.abs(xAfterComma - 12.5) < 0.001, `X: ${xBefore} → ${xAfterComma} · campo: "${await xField.inputValue()}"`);
  await xField.fill('abc');
  await xField.press('Enter');
  await page.waitForTimeout(400);
  st = await state(page);
  const xAfterAbc = allObjects(st).find((o) => o.id === textObj.id).frame.xMm;
  const fieldErr = await inspector.locator('[data-inspector-error]').first().innerText().catch(() => '');
  const fieldErrVisible = await inspector.locator('[data-inspector-error]').first().isVisible().catch(() => false);
  if (fieldErrVisible) await measureText(inspector.locator('[data-inspector-error]').first(), 'B6 fonte do aviso do campo X');
  j.step('B6 "abc" não é aceito: o valor anterior volta e uma frase curta explica, logo abaixo do campo',
    Math.abs(xAfterAbc - 12.5) < 0.001 && fieldErrVisible && fieldErr.length > 0, `X: ${xAfterAbc} · campo: "${await xField.inputValue()}" · aviso: "${fieldErr}"`);
  j.addEvidence(await shot(page, 'j04-editar-a-mao-11-campo-x-abc'));
  const undoButton = page.getByRole('button', { name: 'Desfazer última alteração' });
  const undoEnabled = await undoButton.isEnabled();
  await undoButton.click();
  await page.waitForTimeout(400);
  st = await state(page);
  const xAfterUndo = allObjects(st).find((o) => o.id === textObj.id).frame.xMm;
  j.step('B6 Desfazer continua funcionando depois do "abc" (X volta ao valor original)', undoEnabled && Math.abs(xAfterUndo - xBefore) < 0.001, `X: ${xAfterUndo} (original ${xBefore})`);
  j.step('B6 o aviso vermelho some depois de Desfazer', (await inspector.locator('[data-inspector-error]').count()) === 0);
  await page.getByRole('button', { name: 'Refazer última alteração' }).click();
  await page.waitForTimeout(300);
  const saveCountBefore = (await state(page)).saveDispatchCount;
  await page.keyboard.press('Control+s');
  await waitSaved(page, 20000);
  st = await state(page);
  j.step('B6 Salvar (Ctrl+S) continua funcionando: "Salvo", sem diálogo do navegador',
    st.runtime.saveLabel === 'Saved' && !st.runtime.dirty && st.saveDispatchCount > saveCountBefore && log.dialogs.length === 0,
    `salvamentos: ${saveCountBefore} → ${st.saveDispatchCount} · diálogos: ${log.dialogs.length}`);
  const storedX = st.runtime.stored.pages.flatMap((p) => p.objects).find((o) => o.id === textObj.id)?.frame.xMm;
  j.step('B6 o X salvo no servidor é o que está na tela', Math.abs((storedX ?? -1) - 12.5) < 0.001, `salvo: ${storedX}`);
  await page.locator(`[data-editor-object-id="${tableB1?.id}"]`).click({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(300);
  const headingAfter = await inspector.getByRole('heading', { level: 2 }).first().innerText().catch(() => '');
  j.step('B6 o editor não travou: clicar na tabela troca o painel para "Tabela"', /Tabela/.test(headingAfter), `painel: "${headingAfter}"`);
  await textHit.click();
  await page.waitForTimeout(300);
  const handles = await page.locator('[data-resize-handle]').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return { handle: el.getAttribute('data-resize-handle'), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
  }));
  measurements.resizeHandles = handles;
  const minHandle = Math.min(...handles.map((h) => Math.min(h.w, h.h)), Infinity);
  if (handles.length === 0) j.step('Alças de redimensionar visíveis ao selecionar o texto', false, 'nenhuma alça [data-resize-handle] encontrada');
  else if (minHandle >= MIN_TARGET_PX) j.step('Alças de redimensionar ≥ 24 px', true, `${handles.length} alças, menor lado ${minHandle} px`);
  else findingStep('Alças de redimensionar ≥ 24 px', false, `${handles.length} alças de ${minHandle} px`, 'P2');
  await measureTargets('B6 fim, texto selecionado');
  measurements.clicks = clicks;
  const jargonEnd = await scanJargon('B6 fim');
  j.step('B6 sem jargão/inglês na tela ao fim', jargonEnd.length === 0, jargonEnd.join(', ') || '-');
  j.addEvidence(await shot(page, 'j04-editar-a-mao-12-fim'));
  await checkReload('fim do catálogo B');

  // Ruído do servidor de desenvolvimento (outro agente salvando src/ no mesmo worktree → HMR/500 do vite) não é erro do
  // aplicativo, mas fica registrado por inteiro para quem ler julgar.
  const errors = consoleErrors(log);
  const isDevServerNoise = (e) => /\[hmr\]|\[vite\]|server responded with a status of 500/.test(e.text);
  const appErrors = errors.filter((e) => !isDevServerNoise(e));
  const noise = errors.filter(isDevServerNoise);
  measurements.devServerNoise = noise.map((e) => e.text.slice(0, 200));
  j.step('zero erros de console (do aplicativo) e de página em toda a jornada', appErrors.length === 0 && log.pageErrors.length === 0,
    `console: ${appErrors.map((e) => e.text).join(' | ') || '-'} · página: ${log.pageErrors.join(' | ') || '-'} · ruído do vite (HMR/500) ignorado: ${noise.length}`);
  if (noise.length) j.finding(`ruído do servidor vite durante a prova (${noise.length} mensagens HMR/500; outro processo salvou src/ no worktree)`, { severity: 'low', where: 'ambiente' });
  if (jargonSeen.length) j.finding(`palavras técnicas/inglês vistas: ${JSON.stringify(jargonSeen)}`, { severity: 'medium', where: 'editor' });
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 900));
  await shot(page, 'j04-editar-a-mao-99-erro').then((p) => j.addEvidence(p)).catch(() => {});
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

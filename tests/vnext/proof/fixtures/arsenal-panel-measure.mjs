/* global document, window, console, process, getComputedStyle */
// Onda 4.5 (Arsenal): numa janela estreita (626 x 753 px CSS) o painel "Arsenal" abria com cabeçalho, busca e
// categorias, mas a lista de cartões tinha 1 px de altura: os 28 cartões existiam e não apareciam. Esta medição abre
// o editor real (harness das jornadas do pai, modelos PRESYS no arsenal) em larguras de 360 a 1920 px e alturas de 600
// a 1080 (e 1366 a 125% do Windows = 1093 x 614 px CSS) e exige: lista com pelo menos 200 px de altura visível, que
// rola (scrollHeight > clientHeight quando há mais cartões), primeiro cartão visível e por cima, painel dentro da
// janela, sem rolagem lateral, e categorias quebrando linha em vez de vazar.
//
//   node tests/vnext/proof/fixtures/arsenal-panel-measure.mjs
//   TEMP=TMP=D:\tmp-proofs
//
// Grava scratch/arsenal-panel/results.json + shots/arsenal-<largura>x<altura>.png. ARSENAL_CHAIN=1 imprime a altura
// de cada caixa da lista até o body (para achar quem não passa a altura adiante).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, createCatalog, ensureServer, freshDb, harnessUrl, launch, state, waitEditor } from '../father-journeys/lib.mjs';

const OUT = resolve(ROOT, 'scratch/arsenal-panel');
const SHOTS = resolve(OUT, 'shots');
mkdirSync(SHOTS, { recursive: true });

/** Width x height in CSS px. The four of the bug report first, then the edges of the range. */
const VIEWPORTS = [
  { width: 626, height: 753 }, { width: 800, height: 600 }, { width: 1280, height: 720 }, { width: 1366, height: 768 },
  { width: 360, height: 600 }, { width: 900, height: 600 }, { width: 1024, height: 768 }, { width: 1100, height: 700 },
  { width: 1101, height: 600 }, { width: 1093, height: 614, label: '1366 a 125%' }, { width: 1920, height: 600 }, { width: 1920, height: 1080 },
];
const MIN_LIST = 200;

const server = await ensureServer();
const { browser, page, log } = await launch({ width: 1366, height: 768 });
const db = freshDb('arsenal-panel');
const results = [];
try {
  await page.goto(harnessUrl({ db }), { timeout: 180000 });
  const catalog = await createCatalog(page, { name: 'Arsenal — janela estreita', starter: 'Ficha técnica essencial' });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    // A fresh load at this size: nothing measured at the previous size survives.
    await page.goto(harnessUrl({ db, catalog }), { timeout: 60000 });
    await waitEditor(page);
    const open = page.getByRole('button', { name: 'Arsenal…', exact: true });
    await open.scrollIntoViewIfNeeded();
    await open.click();
    const panel = page.getByRole('complementary', { name: 'Arsenal' });
    await panel.waitFor({ state: 'attached' });
    await page.waitForTimeout(300);
    await panel.locator('[data-arsenal-loading]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    await panel.locator('li[data-arsenal-preset]').first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(300);
    if (process.env.ARSENAL_CHAIN) console.log(JSON.stringify(await page.evaluate(() => {
      const out = [];
      for (let el = document.querySelector('[data-arsenal-body]'); el && el !== document.documentElement; el = el.parentElement) {
        const s = getComputedStyle(el); const r = el.getBoundingClientRect();
        out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} h=${Math.round(r.height)} top=${Math.round(r.top)} disp=${s.display} pos=${s.position} flex=${s.flex} minH=${s.minHeight} ov=${s.overflow}`);
      }
      return out;
    }), null, 1));
    const measured = await page.evaluate(() => {
      const panel = document.querySelector('.vnext-arsenal:not([hidden])');
      const list = panel?.querySelector('[data-arsenal-body]');
      if (!panel || !list) return { error: 'painel ou lista não encontrados' };
      const box = (element) => { const r = element.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), height: Math.round(r.height) }; };
      const cards = [...list.querySelectorAll('li[data-arsenal-preset]')];
      const first = cards[0];
      const listBox = list.getBoundingClientRect();
      let firstCard = null;
      if (first) {
        const r = first.getBoundingClientRect();
        // The first card's top-left area (picture) must be on screen, inside the list and the element on top.
        const x = r.left + Math.min(40, r.width / 2);
        const y = r.top + Math.min(40, r.height / 2);
        const top = document.elementFromPoint(x, y);
        firstCard = {
          ...box(first),
          insideList: r.top >= listBox.top - 0.5 && r.top + Math.min(80, r.height) <= listBox.bottom + 0.5,
          insideWindow: r.left >= -0.5 && r.right <= window.innerWidth + 0.5 && r.top >= -0.5 && r.top < window.innerHeight,
          onTop: Boolean(top && (top === first || first.contains(top))),
        };
      }
      const chips = panel.querySelector('.vnext-arsenal-categories');
      const chipRows = new Set([...chips.querySelectorAll('button')].map((button) => Math.round(button.getBoundingClientRect().top))).size;
      const before = list.scrollTop;
      list.scrollTop = 120;
      const scrolls = list.scrollTop > before;
      list.scrollTop = before;
      return {
        panel: box(panel), list: { ...box(list), clientHeight: list.clientHeight, scrollHeight: list.scrollHeight },
        cards: cards.length, firstCard, scrolls, chipRows,
        chipsOverflowX: Math.round(chips.scrollWidth - chips.clientWidth),
        panelOverflowX: Math.round(panel.scrollWidth - panel.clientWidth),
        listOverflowY: getComputedStyle(list).overflowY,
        window: { width: window.innerWidth, height: window.innerHeight },
      };
    });
    const label = viewport.label ?? `${viewport.width}x${viewport.height}`;
    const problems = [];
    if (measured.error) problems.push(measured.error);
    else {
      if (measured.list.clientHeight < MIN_LIST) problems.push(`lista com ${measured.list.clientHeight} px (< ${MIN_LIST})`);
      if (measured.list.bottom > measured.window.height + 0.5) problems.push(`lista termina em ${measured.list.bottom} px, abaixo da janela`);
      if (measured.panel.right > measured.window.width + 0.5 || measured.panel.left < -0.5) problems.push('painel fora da janela');
      if (!measured.cards) problems.push('nenhum cartão');
      else if (!measured.firstCard.insideList || !measured.firstCard.insideWindow || !measured.firstCard.onTop) problems.push(`primeiro cartão não visível ${JSON.stringify(measured.firstCard)}`);
      if (measured.list.scrollHeight > measured.list.clientHeight + 1 && !measured.scrolls) problems.push('lista não rola');
      if (measured.chipsOverflowX > 0 || measured.panelOverflowX > 0) problems.push('rolagem lateral');
    }
    const shot = resolve(SHOTS, `arsenal-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: shot });
    const entry = { viewport: label, ok: problems.length === 0, problems, ...measured, screenshot: shot.replace(ROOT, '').replace(/^[\\/]/, '').replace(/\\/g, '/') };
    results.push(entry);
    console.log(`${entry.ok ? 'OK   ' : 'FALHA'} ${label.padEnd(12)} lista=${measured.list?.clientHeight}/${measured.list?.scrollHeight}px cartões=${measured.cards} 1º=${measured.firstCard ? `${measured.firstCard.top}px` : '-'} chips=${measured.chipRows} linha(s)${problems.length ? ' ' + problems.join('; ') : ''}`);
  }
  const errors = [...log.pageErrors, ...log.console.filter((entry) => entry.type === 'error').map((entry) => entry.text)];
  if (errors.length) console.log(`erros de console: ${JSON.stringify(errors.slice(0, 5))}`);
  writeFileSync(resolve(OUT, 'results.json'), JSON.stringify({ results, errors, finalState: Boolean((await state(page)).runtime) }, null, 2));
  await browser.close();
  await server.close();
  process.exit(results.every((entry) => entry.ok) && errors.length === 0 ? 0 : 1);
} catch (error) {
  console.error(error);
  await browser.close();
  await server.close();
  process.exit(1);
}

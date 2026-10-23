/* global document, console, process, getComputedStyle */
// Onda 4 (fatia P, item 1): mede a linha acima da página ("Página N de M", zoom, "Camadas", problemas) no editor
// real (modo simples, como a produção) em larguras de 900 a 1920 px e em 125% de escala do Windows a 1366 px
// (1093 x 614 px CSS). Cada controle da linha precisa estar inteiro dentro da área da página e ser o elemento de
// cima em vários pontos (nada encoberto pela coluna de páginas nem pelo painel da direita).
//
//   node tests/vnext/proof/fixtures/cover-capa-pcon-measure.mjs   (não é preciso; este script prepara o catálogo)
//   node tests/vnext/proof/fixtures/canvas-header-measure.mjs
//   CANVAS_HEADER_PORT=5244   TEMP=TMP=D:\tmp-proofs
//
// Grava scratch/canvas-header/results.json + shots/header-<largura>.png (capturas recortadas na linha do cabeçalho).
import { copyFileSync, cpSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const AUDIT = resolve(root, 'scratch/cover-audit');
const OUT = resolve(root, 'scratch/canvas-header');
const SHOTS = resolve(OUT, 'shots');
for (const dir of [resolve(AUDIT, 'catalogs'), resolve(AUDIT, 'assets'), SHOTS]) mkdirSync(dir, { recursive: true });
const N = 'PCON-CAPA-NATIVA';
copyFileSync(resolve(root, 'docs/examples/presys-capa-pcon-hibrido.catalog.json'), resolve(AUDIT, 'catalogs', `${N}.catalog.json`));
cpSync(resolve(root, 'docs/examples/assets'), resolve(AUDIT, 'assets'), { recursive: true });

const PORT = Number(process.env.CANVAS_HEADER_PORT ?? 5244);
const server = await createServer({
  root,
  server: { host: '127.0.0.1', port: PORT, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch({ headless: true });

/** width x height in CSS px; scale = Windows display scale (deviceScaleFactor). */
const VIEWPORTS = [
  { width: 900, height: 768 }, { width: 961, height: 768 }, { width: 1024, height: 768 }, { width: 1100, height: 768 },
  { width: 1101, height: 768 }, { width: 1180, height: 768 }, { width: 1280, height: 720 }, { width: 1366, height: 768 },
  { width: 1093, height: 614, scale: 1.25, label: '1366 a 125%' }, { width: 1440, height: 900 }, { width: 1536, height: 864, scale: 1.25, label: '1920 a 125%' },
  { width: 1600, height: 900 }, { width: 1920, height: 1080 },
];
const SHOT_WIDTHS = new Set([961, 1280, 1366, 1093]);
// The advanced editor (?mode=full) also shows "Salvo"/"Rascunho nesta aba" in the same group: a few widths of it too.
const RUNS = [...VIEWPORTS.map((viewport) => ({ ...viewport, mode: 'simple' })),
  ...[961, 1100, 1280, 1366].map((width) => ({ width, height: 768, mode: 'full', label: `${width} avançado` }))];

const results = [];
for (const viewport of RUNS) {
  const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.scale ?? 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${PORT}/tests/vnext/proof/fixtures/cover-audit-browser.html?catalog=${N}&mode=${viewport.mode}`, { waitUntil: 'load', timeout: 180000 });
  await page.locator('[data-vnext-shell]').waitFor({ timeout: 180000 });
  await page.waitForTimeout(900);
  const measured = await page.evaluate(() => {
    const meta = document.querySelector('.vnext-canvas-meta');
    const area = document.querySelector('.vnext-canvas-area');
    if (!meta || !area) return { error: 'cabeçalho não encontrado' };
    const clip = area.getBoundingClientRect();
    const controls = [...meta.querySelectorAll('button, select, [data-save-state]')].filter((element) => element.getClientRects().length > 0);
    const rows = new Set();
    const items = controls.map((element) => {
      const r = element.getBoundingClientRect();
      rows.add(Math.round(r.top));
      const inside = r.left >= clip.left - 0.5 && r.right <= clip.right + 0.5 && r.top >= clip.top - 0.5;
      const samples = [0.06, 0.5, 0.94].map((fx) => [r.left + r.width * fx, r.top + r.height / 2]);
      const covered = samples.filter(([x, y]) => { const top = document.elementFromPoint(x, y); return !top || !(top === element || element.contains(top)); }).length;
      return {
        name: (element.getAttribute('aria-label') || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
        left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), inside, covered,
      };
    });
    const layers = meta.querySelector('[data-editor-action="show-layers"]')?.getBoundingClientRect();
    // What each part of the line needs (its items side by side) against the room it got.
    const parts = [...meta.children].map((child) => {
      const kids = [...child.children].filter((kid) => kid.getClientRects().length > 0);
      const gap = parseFloat(getComputedStyle(child).columnGap) || 0;
      const need = kids.reduce((sum, kid) => sum + kid.getBoundingClientRect().width, 0) + gap * Math.max(0, kids.length - 1);
      return { box: Math.round(child.getBoundingClientRect().width), need: Math.round(need) };
    });
    return {
      area: { left: Math.round(clip.left), right: Math.round(clip.right) },
      meta: { left: Math.round(meta.getBoundingClientRect().left), right: Math.round(meta.getBoundingClientRect().right), height: Math.round(meta.getBoundingClientRect().height) },
      lines: rows.size, parts, layers: layers && { left: Math.round(layers.left), right: Math.round(layers.right) },
      overflowX: Math.round(meta.scrollWidth - meta.clientWidth),
      items,
    };
  });
  const bad = measured.items?.filter((item) => !item.inside || item.covered > 0) ?? [];
  const label = viewport.label ?? `${viewport.width}`;
  const entry = { viewport: label, cssWidth: viewport.width, ok: !measured.error && bad.length === 0 && measured.overflowX <= 0, bad, ...measured, errors };
  if (viewport.mode === 'simple' && SHOT_WIDTHS.has(viewport.width)) {
    const box = await page.locator('.vnext-canvas-meta').boundingBox();
    const shot = resolve(SHOTS, `header-${viewport.width}${viewport.scale ? '-125' : ''}.png`);
    await page.screenshot({ path: shot, clip: { x: 0, y: Math.max(0, box.y - 70), width: viewport.width, height: Math.min(viewport.height, box.height + 150) } });
    entry.screenshot = shot.replace(root, '').replace(/^[\\/]/, '').replace(/\\/g, '/');
  }
  results.push(entry);
  console.log(`${entry.ok ? 'OK ' : 'FALHA'} ${label.padEnd(14)} partes=${JSON.stringify(measured.parts)} camadas=${JSON.stringify(measured.layers)} área=${JSON.stringify(measured.area)}${bad.length ? ' ' + JSON.stringify(bad) : ''}`);
  await ctx.close();
}
writeFileSync(resolve(OUT, 'results.json'), JSON.stringify(results, null, 2));
await browser.close();
await server.close();
process.exit(results.every((entry) => entry.ok) ? 0 : 1);

// Onda 3.5 · S1: re-medição das edições de capa destravadas pela seleção/camadas (reaproveita o harness cover-audit).
//   node tests/vnext/proof/fixtures/cover-selection-measure.mjs   (TEMP/TMP em D: no Windows)
// Medição (Onda 3.5, passo 1): ~22 edições típicas de CAPA, feitas SÓ pela interface visível do editor real
// (modo simples, 1366x768), sobre catálogos reais de outra IA. Não altera código de produto.
//
//   node tests/vnext/proof/fixtures/cover-audit-measure.mjs
//   COVER_AUDIT_SRC=D:/catalogos-exemplo/pcon-family-2026-10-22  (pasta com *.catalog.json + assets/)
//
// Copia o catálogo para scratch/cover-audit (o Vite só serve o repositório), sobe um Vite próprio e um Chromium,
// executa os cenários e grava scratch/cover-audit/results.json + capturas em scratch/cover-audit/shots.
// "cliques" = ações de interface (clique, duplo clique, tecla/digitação, arraste, rolagem, envio de arquivo).
import { cpSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SRC = process.env.COVER_AUDIT_SRC ?? 'D:/catalogos-exemplo/pcon-family-2026-10-22';
const OUT = resolve(root, 'scratch/cover-audit');
const SHOTS = resolve(OUT, 'shots');
mkdirSync(resolve(OUT, 'catalogs'), { recursive: true });
mkdirSync(resolve(OUT, 'assets'), { recursive: true });
mkdirSync(SHOTS, { recursive: true });
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.catalog.json'))) cpSync(resolve(SRC, f), resolve(OUT, 'catalogs', f));
cpSync(resolve(SRC, 'assets'), resolve(OUT, 'assets'), { recursive: true });

const catalog = (name) => JSON.parse(readFileSync(resolve(OUT, 'catalogs', `${name}.catalog.json`), 'utf8'));
const PORT = Number(process.env.COVER_AUDIT_PORT ?? 5231);
const server = await createServer({
  root,
  server: { host: '127.0.0.1', port: PORT, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];

class Probe {
  constructor(page, name) { this.page = page; this.name = name; this.n = 0; this.notes = []; this.mm = 1; }
  note(t) { this.notes.push(t); }
  async state() { return this.page.evaluate(() => window.__COVER_AUDIT__.state()); }
  async objs(pageIndex = 0) { return (await this.state()).document.pages[pageIndex].objects; }
  async selected() {
    return this.page.evaluate(() => [...document.querySelectorAll('[data-editor-object-id][data-selected="true"]')]
      .map((e) => e.getAttribute('data-editor-object-id')));
  }
  async stage() { return this.page.locator('[data-vnext-page-stage]').boundingBox(); }
  async rectOf(id) { return this.page.locator(`[data-editor-object-id="${id}"]`).first().boundingBox(); }
  /** Rola o painel de páginas até o ponto (mm) ficar visível; conta 1 ação quando precisou. */
  async reveal(yMm) {
    // Rola o painel de páginas até o ponto (mm) cair na parte LIVRE da tela (abaixo da barra fixa de ferramentas).
    for (let i = 0; i < 3; i += 1) {
      const st = await this.stage();
      const scale = st.width / 210;
      const y = st.y + yMm * scale;
      const x = st.x + 105 * scale;
      const free = await this.page.evaluate(({ x: px }) => {
        for (let yy = 120; yy < 768; yy += 6) {
          const e = document.elementFromPoint(px, yy);
          if (e && e.closest("[data-editor-overlay]")) return yy;
        }
        return 768;
      }, { x });
      const lo = free + 14, hi = 745;
      if (y >= lo && y <= hi) return;
      const desired = lo + (hi - lo) / 2;
      await this.page.evaluate(({ delta }) => {
        const stage = document.querySelector("[data-vnext-page-stage]");
        let el = stage.parentElement;
        while (el && el.scrollHeight <= el.clientHeight + 2) el = el.parentElement;
        if (el) el.scrollBy(0, delta); else window.scrollBy(0, delta);
      }, { delta: y - desired });
      await this.page.waitForTimeout(150);
      this.n += 1;
    }
  }
  async clickMm(xMm, yMm, label = '', opts = {}) {
    await this.reveal(yMm);
    const st = await this.stage();
    const s = st.width / 210;
    if (opts.ctrl) await this.page.keyboard.down('Control');
    await this.page.mouse.click(st.x + xMm * s, st.y + yMm * s);
    if (opts.ctrl) await this.page.keyboard.up('Control');
    await this.page.waitForTimeout(200);
    this.n += 1;
    if (label) this.note(`clique em ${label}`);
  }
  async clickObj(id, label = '', opts = {}) {
    const o = (await this.objs(opts.pageIndex ?? 0)).find((x) => x.id === id);
    // 25% da largura: o centro de caixas pequenas fica sob as alças de redimensionar (ver S03)
    await this.clickMm(o.frame.xMm + o.frame.widthMm * (opts.fx ?? 0.25), o.frame.yMm + Math.min(o.frame.heightMm / 2, 4), label, opts);
  }
  async dblClickObj(id) {
    const fx = 0.25;
    const o = (await this.objs()).find((x) => x.id === id);
    await this.reveal(o.frame.yMm + o.frame.heightMm / 2);
    const st = await this.stage();
    const s = st.width / 210;
    await this.page.mouse.dblclick(st.x + (o.frame.xMm + o.frame.widthMm * fx) * s, st.y + (o.frame.yMm + o.frame.heightMm / 2) * s);
    await this.page.waitForTimeout(250);
    this.n += 1;
  }
  async drag(id, dxMm, dyMm, fx = 0.25) {
    const o = (await this.objs()).find((x) => x.id === id);
    await this.reveal(o.frame.yMm + o.frame.heightMm / 2);
    const st = await this.stage();
    const s = st.width / 210;
    const cx = st.x + (o.frame.xMm + o.frame.widthMm * fx) * s;
    const cy = st.y + (o.frame.yMm + Math.min(o.frame.heightMm / 2, 4)) * s;
    await this.page.mouse.move(cx, cy);
    await this.page.mouse.down();
    await this.page.mouse.move(cx + dxMm * s / 2, cy + dyMm * s / 2, { steps: 4 });
    await this.page.mouse.move(cx + dxMm * s, cy + dyMm * s, { steps: 4 });
    await this.page.mouse.up();
    await this.page.waitForTimeout(250);
    this.n += 1;
  }
  async act(action) {
    const loc = this.page.locator(`[data-editor-action="${action}"]`).first();
    if (!(await loc.count()) || !(await loc.isVisible())) await this.openMore();
    if (!(await loc.count())) { this.note(`botão ${action} não existe na barra com a seleção atual`); return false; }
    await loc.scrollIntoViewIfNeeded();
    const disabled = await loc.isDisabled();
    if (disabled) { this.note(`botão ${action} desabilitado`); return false; }
    await loc.click();
    await this.page.waitForTimeout(200);
    this.n += 1;
    return true;
  }
  async openMore() {
    const t = this.page.locator('[data-editor-action="toggle-advanced-tools"]');
    await t.scrollIntoViewIfNeeded();
    if ((await t.textContent()).includes('Mais')) { await t.click(); this.n += 1; this.note('abriu "Mais opções"'); await this.page.waitForTimeout(250); }
  }
  async details() {
    const t = this.page.locator('[data-editor-action="toggle-inspector-details"]');
    if (await t.count() && (await t.textContent()).includes('Mais')) { await t.click(); this.n += 1; this.note('abriu "Mais propriedades"'); await this.page.waitForTimeout(250); }
  }
  async panel() {
    return this.page.evaluate(() => document.querySelector('aside.vnext-info')?.innerText.replace(/\s+/g, ' ') ?? '');
  }
  async controls() {
    return this.page.evaluate(() => [...document.querySelectorAll('aside.vnext-info button, aside.vnext-info input, aside.vnext-info select')]
      .filter((e) => e.offsetParent).map((e) => (e.getAttribute('data-editor-action') || e.getAttribute('aria-label') || e.textContent.trim()).slice(0, 30)));
  }
  async notice() { return this.page.evaluate(() => [...document.querySelectorAll('[role="status"],[role="alert"]')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ').slice(0, 200)); }
  async ctrlClickMm(x, y) { await this.clickMm(x, y, '', { ctrl: true }); }
  async shot(name) { await this.page.screenshot({ path: resolve(SHOTS, `${name}.png`) }); return `scratch/cover-audit/shots/${name}.png`; }
  async undoAll() {
    let c = 0;
    const undo = this.page.locator('[data-editor-action="undo"]');
    while (c < 15 && await undo.isEnabled()) { await undo.click(); await this.page.waitForTimeout(150); c += 1; }
    return c;
  }
}

async function open(name, extra = '') {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/tests/vnext/proof/fixtures/cover-audit-browser.html?catalog=${name}${extra}`, { waitUntil: 'networkidle' });
  await page.locator('[data-vnext-shell]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  const p = new Probe(page, name);
  p.errs = errs;
  p.ctx = ctx;
  p.initial = JSON.stringify((await p.state()).document);
  return p;
}

async function scenario(id, edit, name, fn, { undo = true } = {}) {
  const p = await open(name);
  const r = { id, edit, catalog: name };
  try {
    const out = await fn(p);
    Object.assign(r, out);
    r.clicks = p.n;
    r.notes = p.notes;
    if (undo) {
      const stateNow = JSON.stringify((await p.state()).document);
      const changed = stateNow !== p.initial;
      const u = await p.undoAll();
      const back = JSON.stringify((await p.state()).document) === p.initial;
      r.undo = { documentChanged: changed, undoClicks: u, restoredExactly: back };
    }
  } catch (e) {
    r.outcome = 'erro-do-harness';
    r.error = String(e).slice(0, 300);
    try { r.screenshot = await p.shot(`${id}-erro`); } catch { /* ignore */ }
  }
  if (p.errs.length) r.consoleErrors = p.errs.slice(0, 3);
  results.push(r);
  console.log(`${id} ${r.outcome} (${r.clicks ?? '?'} ações) ${edit}`);
  await p.ctx.close();
}

const find = (objs, pred) => objs.find(pred);
const textOf = (o) => o.text?.paragraphs?.map((pp) => pp.inlines.map((i) => i.text ?? '').join('')).join('\n') ?? '';
const byText = (objs, s) => objs.find((o) => o.type === 'text' && textOf(o).includes(s));
const asset = (doc, o) => doc.assets.find((a) => a.id === o.assetId)?.name;

// ---------------------------------------------------------------------------------------------------------------
// Onda 3.5 · S1 (seleção e camadas): as mesmas edições, refeitas pela interface nova.
const H = 'PCON-HIBRIDO';
const named = (doc, o) => (asset(doc, o) ?? '');
const pick = async (p) => {
  const doc = (await p.state()).document;
  const o = doc.pages[0].objects;
  return {
    doc, o,
    plate: o.find((x) => x.type === 'image' && named(doc, x).includes('plate')),
    overlay: o.find((x) => x.type === 'image' && named(doc, x).includes('overlay')),
    photo: o.find((x) => x.type === 'image' && !/plate|overlay|band/.test(named(doc, x))),
  };
};
const nameOf = (ids, refs) => ids.map((i) => Object.entries(refs).find(([, v]) => v?.id === i)?.[0] ?? i.slice(0, 6)).join(',') || 'nada';
async function openLayers(p) {
  if (await p.page.locator('[data-layers-panel] [role="tree"]').count()) return;
  await p.page.locator('[data-editor-action="show-layers"]').click(); p.n += 1; await p.page.waitForTimeout(200);
}
async function layerButton(p, id, action) {
  await openLayers(p);
  const b = p.page.locator(`[data-layer-id="${id}"] [data-layer-action="${action}"]`).first();
  await b.scrollIntoViewIfNeeded(); await b.click(); p.n += 1; await p.page.waitForTimeout(200);
}
async function layerRow(p, id) {
  await openLayers(p);
  const row = p.page.locator(`[data-layer-id="${id}"] .vnext-layer-name`).first();
  await row.scrollIntoViewIfNeeded(); await row.click(); p.n += 1; await p.page.waitForTimeout(200);
}
async function altClickMm(p, x, y) {
  await p.page.keyboard.down('Alt'); await p.clickMm(x, y); await p.page.keyboard.up('Alt');
}
async function dragClient(p, x1, y1, x2, y2) {
  await p.page.mouse.move(x1, y1); await p.page.mouse.down();
  await p.page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 }); await p.page.mouse.move(x2, y2, { steps: 4 });
  await p.page.mouse.up(); await p.page.waitForTimeout(250); p.n += 1;
}
const visualIndex = (objs, id) => objs.map((x, i) => ({ x, i })).sort((a, b) => a.x.zIndex - b.x.zIndex || a.i - b.i).findIndex((e) => e.x.id === id);

await scenario('S07', 'Selecionar o elemento de baixo SEM reordenar', H, async (p) => {
  const r = await pick(p);
  await p.clickMm(106, 120);
  const plain = nameOf(await p.selected(), r);
  const plainClicks = p.n;
  const cycle = [];
  for (let i = 0; i < 4; i += 1) { await altClickMm(p, 106, 120); cycle.push(nameOf(await p.selected(), r)); }
  await p.page.keyboard.press('Escape'); p.n += 1;
  const before = p.n;
  await layerRow(p, r.plate.id);
  const viaLayers = nameOf(await p.selected(), r);
  const zUnchanged = JSON.stringify((await p.objs()).map((x) => x.zIndex)) === JSON.stringify(r.o.map((x) => x.zIndex));
  return {
    outcome: plain === 'photo' && viaLayers === 'plate' && zUnchanged ? 'fácil' : 'difícil',
    evidence: `clique simples na foto (atravessa o PNG transparente): ${plain} (${plainClicks} ação); Alt+clique repetido: ${cycle.join(' → ')}; Camadas → fundo: ${viaLayers} (${p.n - before} ações); camadas inalteradas: ${zUnchanged}`,
    screenshot: await p.shot('S1-S07-camadas'),
  };
});

await scenario('S08', 'Selecionar 3 elementos e mover juntos', H, async (p) => {
  const o = await p.objs();
  const a = byText(o, 'PNEUMÁTICA'), b = o.find((x) => x.type === 'text' && textOf(x).startsWith('exemplos publicados: 0–250')), c = byText(o, 'PRESYS');
  await p.clickObj(a.id); await p.clickObj(b.id, '', { ctrl: true }); await p.clickObj(c.id, '', { ctrl: true });
  const selN = (await p.selected()).length;
  const before = Object.fromEntries([a, b, c].map((x) => [x.id, { ...x.frame }]));
  await p.drag(c.id, 0, 20);
  const after = await p.objs();
  const deltas = [a, b, c].map((x) => +(after.find((y) => y.id === x.id).frame.yMm - before[x.id].yMm).toFixed(1));
  const together = selN === 3 && deltas.every((d) => Math.abs(d - deltas[0]) < 0.01 && Math.abs(d) > 1);
  const selAfter = (await p.selected()).length;
  const undo = p.page.locator('[data-editor-action="undo"]');
  await undo.click(); await p.page.waitForTimeout(200);
  const back = await p.objs();
  const oneUndo = [a, b, c].every((x) => back.find((y) => y.id === x.id).frame.yMm === before[x.id].yMm);
  await p.page.locator('[data-editor-action="redo"]').click(); await p.page.waitForTimeout(150);
  return {
    outcome: together && oneUndo ? 'fácil' : 'impossível',
    evidence: `Ctrl/Shift+clique: ${selN} de 3; deslocamento y após arrastar um deles 20 mm: ${deltas.join(', ')} mm; seleção depois do arraste: ${selAfter}; 1 Desfazer volta os 3: ${oneUndo}`,
    screenshot: await p.shot('S1-S08-multi'),
  };
});

await scenario('S09', 'Agrupar objetos que não são vizinhos na pilha', H, async (p) => {
  const o = await p.objs();
  const a = byText(o, 'PNEUMÁTICA'), b = o.find((x) => x.type === 'text' && textOf(x).startsWith('exemplos publicados: 0–250'));
  await p.clickObj(a.id); await p.clickObj(b.id, '', { ctrl: true });
  const ok = await p.act('group');
  const groups = (await p.objs()).filter((x) => x.type === 'group');
  return { outcome: groups.length === 1 ? 'fácil' : 'difícil', evidence: `Agrupar ${ok ? 'clicado' : 'indisponível'}; grupos: ${groups.length}; aviso: ${await p.notice()}`, screenshot: await p.shot('S1-S09-agrupar') };
});

await scenario('S11', 'Enviar um texto ao fundo sem que ele suma', H, async (p) => {
  const r = await pick(p);
  const t = byText(r.o, 'PRESYS');
  await p.clickObj(t.id);
  await p.act('send-back');
  const objs = await p.objs();
  const visible = visualIndex(objs, t.id) > visualIndex(objs, r.overlay.id);
  return { outcome: visible ? 'fácil' : 'difícil', evidence: `texto ficou ${visible ? 'na frente' : 'atrás'} do fundo; aviso: ${await p.notice()}`, screenshot: await p.shot('S1-S11-fundo') };
});

await scenario('S12', 'Duplicar um bloco (título HIDRÁULICA + legenda)', H, async (p) => {
  const o = await p.objs();
  const a = byText(o, 'HIDRÁULICA'), b = o.find((x) => x.type === 'text' && textOf(x).startsWith('exemplos publicados: 100'));
  await p.clickObj(a.id); await p.clickObj(b.id, '', { ctrl: true });
  const nBefore = (await p.objs()).length;
  const dup = p.page.locator('[data-editor-action="duplicate"]').first();
  const enabled = (await dup.count()) > 0 && await dup.isEnabled();
  if (enabled) { await dup.click(); p.n += 1; await p.page.waitForTimeout(200); }
  const added = (await p.objs()).length - nBefore;
  return { outcome: added === 2 ? 'fácil' : 'impossível', evidence: `Duplicar com 2 selecionados: ${enabled ? 'disponível' : 'indisponível'}; objetos novos: ${added}; seleção agora: ${(await p.selected()).length}; aviso: ${await p.notice()}`, screenshot: await p.shot('S1-S12-duplicar') };
});

await scenario('S15', 'Travar o fundo para não pegar sem querer', H, async (p) => {
  const r = await pick(p);
  await layerButton(p, r.overlay.id, 'toggle-locked');
  await layerButton(p, r.plate.id, 'toggle-locked');
  const lockClicks = p.n;
  await p.clickMm(106, 120);
  const onPhoto = nameOf(await p.selected(), r);
  const t = byText(r.o, 'PRESYS');
  await p.clickObj(t.id);
  const onText = (await p.selected())[0] === t.id;
  await p.clickMm(8, 292);
  const onBackground = nameOf(await p.selected(), r);
  const moved = JSON.stringify((await p.objs()).map((x) => x.frame)) === JSON.stringify(r.o.map((x) => x.frame));
  return {
    outcome: onPhoto === 'photo' && onText ? 'fácil' : 'difícil',
    evidence: `travar overlay + plate em Camadas: ${lockClicks} ações; clique na foto: ${onPhoto}; clique no texto: ${onText ? 'texto' : 'outro'}; clique no fundo travado: ${onBackground}; nada saiu do lugar: ${moved}`,
    screenshot: await p.shot('S1-S15-travar'),
  };
});

await scenario('S16', 'Barra da família: selecionar os 6 modelos com uma caixa e mover/agrupar', H, async (p) => {
  const o = await p.objs();
  const bar = o.filter((x) => x.type === 'text' && Math.abs(x.frame.yMm - 266.9) < 1);
  await p.reveal(268);
  const st = await p.stage(); const s = st.width / 210;
  await dragClient(p, st.x - 12, st.y + 264.5 * s, st.x + 205 * s, st.y + 272.5 * s);
  const sel = await p.selected();
  const all = bar.every((x) => sel.includes(x.id)) && sel.length === bar.length;
  const okG = all ? await p.act('group') : false;
  const groups = (await p.objs()).filter((x) => x.type === 'group');
  return {
    outcome: all && groups.length === 1 ? 'fácil (seleção)' : 'difícil',
    evidence: `caixa de seleção a partir da margem cinza: ${sel.length} selecionados (${bar.length} modelos); agrupar: ${okG && groups.length === 1 ? 'ok' : 'não'}; o destaque dourado + triângulo continuam no PNG (frente S2)`,
    screenshot: await p.shot('S1-S16-barra'),
  };
});

await scenario('S18', 'Fundo da página: alcançar e soltar (a cor é da frente S2)', H, async (p) => {
  const r = await pick(p);
  await layerRow(p, r.plate.id);
  const reached = nameOf(await p.selected(), r);
  const clicks = p.n;
  await p.page.keyboard.press('Escape'); p.n += 1;
  const released = (await p.selected()).length === 0;
  return { outcome: reached === 'plate' && released ? 'fácil (seleção)' : 'difícil', evidence: `Camadas → fundo: ${reached} (${clicks} ações); Esc solta: ${released}; cor de fundo da página: não existe ainda (S2)`, screenshot: await p.shot('S1-S18-fundo') };
});

await scenario('S19', 'Soltar a seleção do overlay de tela cheia', H, async (p) => {
  const r = await pick(p);
  await layerRow(p, r.overlay.id);
  const t = byText(r.o, 'PRESYS');
  const before = p.n;
  await p.clickObj(t.id);
  const toText = (await p.selected())[0] === t.id;
  await p.page.keyboard.press('Escape'); p.n += 1;
  const released = (await p.selected()).length === 0;
  return { outcome: toText && released ? 'fácil' : 'difícil', evidence: `com o overlay selecionado, 1 clique no texto pega o texto: ${toText}; Esc solta: ${released} (${p.n - before} ações)`, screenshot: await p.shot('S1-S19-soltar') };
});

await scenario('S03', 'Mover uma pílula pequena (alças não cobrem a caixa)', H, async (p) => {
  const o = await p.objs();
  const pill = o.find((x) => x.type === 'text' && textOf(x).includes('0 a 250 psi'));
  await p.clickObj(pill.id, '', { fx: 0.5 });
  const handles = await p.page.locator('[data-resize-handle]').count();
  await p.drag(pill.id, 10, 0, 0.5);
  const after = (await p.objs()).find((x) => x.id === pill.id);
  const moved = +(after.frame.xMm - pill.frame.xMm).toFixed(1);
  const sameSize = after.frame.widthMm === pill.frame.widthMm && after.frame.heightMm === pill.frame.heightMm;
  return { outcome: moved > 5 && sameSize ? 'fácil' : 'difícil', evidence: `alças visíveis: ${handles}; arrastar pelo meio moveu ${moved} mm; tamanho mantido: ${sameSize}`, screenshot: await p.shot('S1-S03-pilula') };
});

await scenario('S23', 'Área útil da página com "Mais opções" aberto (1366x768)', H, async (p) => {
  const measure = () => p.page.evaluate(() => {
    const bar = document.querySelector('.vnext-authoring-toolbar').getBoundingClientRect();
    const stage = document.querySelector('[data-vnext-page-stage]').getBoundingClientRect();
    return { toolbarBottom: Math.round(bar.bottom), visibleCanvasPx: Math.round(768 - bar.bottom), pageHeightPx: Math.round(stage.height), toolbarHeight: Math.round(bar.height) };
  });
  const closed = await measure();
  await p.openMore();
  const t = byText(await p.objs(), 'PRESYS');
  await p.clickObj(t.id);
  const opened = await measure();
  return {
    // "Mais opções" may add at most ONE row of buttons (it used to wrap into several and push the page down).
    outcome: opened.toolbarHeight - closed.toolbarHeight <= 70 ? 'melhorou (uma linha)' : 'difícil',
    evidence: `barra fechada: ${closed.toolbarHeight}px de altura, ${closed.visibleCanvasPx}px úteis; com "Mais opções" e um objeto: ${opened.toolbarHeight}px, ${opened.visibleCanvasPx}px úteis (${Math.round(100 * opened.visibleCanvasPx / opened.pageHeightPx)}% da página)`,
    screenshot: await p.shot('S1-S23-area-util'),
  };
});

const cross = [];
for (const name of ['PCON-DT', 'PCON-HIBRIDO', 'PCON-KOMPRESSOR-Y18', 'PCON-Y17', 'PCON-Y18-BP', 'PCON-Y18-LP']) {
  const p = await open(name);
  const r = await pick(p);
  const cx = r.photo.frame.xMm + r.photo.frame.widthMm / 2, cy = r.photo.frame.yMm + r.photo.frame.heightMm / 2;
  await p.clickMm(cx, cy);
  const first = nameOf(await p.selected(), r);
  let alt = first;
  for (let i = 0; i < 3 && alt !== 'photo'; i += 1) { await altClickMm(p, cx, cy); alt = nameOf(await p.selected(), r); }
  cross.push({ catalog: name, plainClickOnPhoto: first, photoReachable: first === 'photo' || alt === 'photo', clicks: p.n, shot: await p.shot(`S1-S22-${name}`) });
  console.log('S22', name, first, alt);
  await p.ctx.close();
}
results.push({ id: 'S22', edit: 'Clicar na foto de cada capa', catalog: 'todos', cross });

writeFileSync(resolve(OUT, 'results-s1.json'), JSON.stringify(results, null, 2));
await browser.close();
await server.close();
console.log('ok -> scratch/cover-audit/results-s1.json');

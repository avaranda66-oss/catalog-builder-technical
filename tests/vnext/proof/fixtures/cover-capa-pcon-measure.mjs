/* global window, document, Image, atob, Buffer, console, process */
// Re-medição das 21 edições da auditoria (docs/qa/2026-10-22-limitacoes-capas.md) na CAPA NATIVA "Capa de produto —
// PCON" (Onda 3.5, S3): docs/examples/presys-capa-pcon-hibrido.catalog.json, só com elementos nativos e a foto oficial.
// Tudo pela interface visível do editor real (modo simples, 1366x768), como o pai usaria. Cada cenário abre o editor
// limpo e, no fim, desfaz tudo e confere que o documento voltou exatamente ao original.
//
//   node tests/vnext/proof/fixtures/cover-capa-pcon-measure.mjs
//   COVER_AUDIT_SRC=D:/catalogos-exemplo/pcon-family-2026-10-22  (só para a 2ª foto oficial usada em S02)
//   COVER_AUDIT_PORT=5243   TEMP=TMP=D:\tmp-proofs
//
// Também: T01 insere o modelo pela galeria "Usar modelo…"; N00 roda a revisão de publicação real (READY?) e compara a
// tela com o PDF impresso do mesmo DOM (pdf.js). Grava scratch/cover-audit/capa-pcon-results.json + shots/C*.png.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SRC = process.env.COVER_AUDIT_SRC ?? 'D:/catalogos-exemplo/pcon-family-2026-10-22';
const OUT = resolve(root, 'scratch/cover-audit');
const SHOTS = resolve(OUT, 'shots');
for (const dir of [resolve(OUT, 'catalogs'), resolve(OUT, 'assets'), SHOTS]) mkdirSync(dir, { recursive: true });
const N = 'PCON-CAPA-NATIVA';
copyFileSync(resolve(root, 'docs/examples/presys-capa-pcon-hibrido.catalog.json'), resolve(OUT, 'catalogs', `${N}.catalog.json`));
cpSync(resolve(root, 'docs/examples/assets'), resolve(OUT, 'assets'), { recursive: true });
const SECOND_PHOTO = 'pcon-dt-calibrador-automatico-de-pressao-pcon-dt-desktop-version-presys-1-trim.png';
if (existsSync(resolve(SRC, 'assets', SECOND_PHOTO))) copyFileSync(resolve(SRC, 'assets', SECOND_PHOTO), resolve(OUT, 'assets', SECOND_PHOTO));

const PORT = Number(process.env.COVER_AUDIT_PORT ?? 5243);
const server = await createServer({
  root,
  server: { host: '127.0.0.1', port: PORT, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];
const oid = (name) => `capa-pcon-hibrido-${name}`;
const textOf = (o) => o?.text?.paragraphs?.map((pp) => pp.inlines.map((i) => i.text ?? '').join('')).join('\n') ?? '';

class Probe {
  constructor(page) { this.page = page; this.n = 0; }
  async state() { return this.page.evaluate(() => window.__COVER_AUDIT__.state()); }
  async objs(pageIndex = 0) { return (await this.state()).document.pages[pageIndex].objects; }
  async obj(id, pageIndex = 0) { return (await this.objs(pageIndex)).find((o) => o.id === id); }
  async selected() {
    return this.page.evaluate(() => [...document.querySelectorAll('[data-editor-object-id][data-selected="true"]')].map((e) => e.getAttribute('data-editor-object-id')));
  }
  async notice() { return this.page.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((e) => e.textContent.trim()).filter(Boolean).join(' | ').slice(0, 220)); }
  async stage() { return this.page.locator('[data-vnext-page-stage]').boundingBox(); }
  async reveal(yMm) {
    for (let i = 0; i < 3; i += 1) {
      const st = await this.stage();
      const scale = st.width / 210;
      const y = st.y + yMm * scale, x = st.x + 105 * scale;
      const free = await this.page.evaluate(({ x: px }) => {
        for (let yy = 120; yy < 768; yy += 6) { const e = document.elementFromPoint(px, yy); if (e && e.closest('[data-editor-overlay]')) return yy; }
        return 768;
      }, { x });
      const lo = free + 14, hi = 745;
      if (y >= lo && y <= hi) return;
      const desired = lo + (hi - lo) / 2;
      await this.page.evaluate(({ delta }) => {
        const stage = document.querySelector('[data-vnext-page-stage]');
        let el = stage.parentElement;
        while (el && el.scrollHeight <= el.clientHeight + 2) el = el.parentElement;
        if (el) el.scrollBy(0, delta); else window.scrollBy(0, delta);
      }, { delta: y - desired });
      await this.page.waitForTimeout(150);
      this.n += 1;
    }
  }
  async point(xMm, yMm) { await this.reveal(yMm); const st = await this.stage(); const s = st.width / 210; return [st.x + xMm * s, st.y + yMm * s, s]; }
  async clickMm(xMm, yMm, opts = {}) {
    const [x, y] = await this.point(xMm, yMm);
    const mod = opts.ctrl ? 'Control' : opts.alt ? 'Alt' : null;
    if (mod) await this.page.keyboard.down(mod);
    await this.page.mouse.click(x, y);
    if (mod) await this.page.keyboard.up(mod);
    await this.page.waitForTimeout(220);
    this.n += 1;
  }
  async clickObj(id, opts = {}) {
    const o = await this.obj(id);
    await this.clickMm(o.frame.xMm + o.frame.widthMm * (opts.fx ?? 0.25), o.frame.yMm + Math.min(o.frame.heightMm / 2, 4), opts);
  }
  async dblClickObj(id, fx = 0.25) {
    const o = await this.obj(id);
    const [x, y] = await this.point(o.frame.xMm + o.frame.widthMm * fx, o.frame.yMm + Math.min(o.frame.heightMm / 2, 4));
    await this.page.mouse.dblclick(x, y);
    await this.page.waitForTimeout(300);
    this.n += 1;
  }
  async drag(id, dxMm, dyMm, fx = 0.5) {
    const o = await this.obj(id);
    const [cx, cy, s] = await this.point(o.frame.xMm + o.frame.widthMm * fx, o.frame.yMm + Math.min(o.frame.heightMm / 2, 4));
    await this.page.mouse.move(cx, cy); await this.page.mouse.down();
    await this.page.mouse.move(cx + dxMm * s / 2, cy + dyMm * s / 2, { steps: 5 });
    await this.page.mouse.move(cx + dxMm * s, cy + dyMm * s, { steps: 5 });
    await this.page.mouse.up(); await this.page.waitForTimeout(300);
    this.n += 1;
  }
  async typeText(id, value) {
    await this.dblClickObj(id);
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.type(value);
    this.n += 2;
    const commit = this.page.locator('[data-editor-action="commit-text"]').first();
    if (await commit.count() && await commit.isVisible()) await commit.click(); else await this.page.keyboard.press('Escape');
    this.n += 1;
    await this.page.waitForTimeout(400);
  }
  async panelClick(selector) {
    const loc = this.page.locator(`aside.vnext-info ${selector}`).first();
    await loc.scrollIntoViewIfNeeded(); await loc.click(); await this.page.waitForTimeout(200);
    this.n += 1;
  }
  async panelType(selector, value) {
    const loc = this.page.locator(`aside.vnext-info ${selector}`).first();
    await loc.scrollIntoViewIfNeeded(); await loc.fill(value); await loc.press('Enter'); await this.page.waitForTimeout(200);
    this.n += 2;
  }
  async panelPickColor(selector, hex) {
    const loc = this.page.locator(`aside.vnext-info ${selector}`).first();
    await loc.scrollIntoViewIfNeeded(); await loc.fill(hex); await loc.dispatchEvent('change'); await this.page.waitForTimeout(200);
    this.n += 2;
  }
  async act(action) {
    const loc = this.page.locator(`[data-editor-action="${action}"]`).first();
    if (!(await loc.count()) || !(await loc.isVisible())) await this.openMore();
    if (!(await loc.count()) || !(await loc.isEnabled())) return false;
    await loc.scrollIntoViewIfNeeded(); await loc.click(); await this.page.waitForTimeout(220);
    this.n += 1;
    return true;
  }
  async openMore() {
    const t = this.page.locator('[data-editor-action="toggle-advanced-tools"]');
    if (!(await t.count())) return;
    await t.scrollIntoViewIfNeeded();
    if ((await t.textContent()).includes('Mais')) { await t.click(); this.n += 1; await this.page.waitForTimeout(250); }
  }
  async details() {
    const t = this.page.locator('[data-editor-action="toggle-inspector-details"]').first();
    if (await t.count() && (await t.getAttribute('aria-expanded')) === 'false') { await t.click(); this.n += 1; await this.page.waitForTimeout(200); }
  }
  async openLayers() {
    if (await this.page.locator('[data-layers-panel] [role="tree"]').count()) return;
    await this.page.locator('[data-editor-action="show-layers"]').click(); this.n += 1; await this.page.waitForTimeout(200);
  }
  async layerButton(id, action) {
    await this.openLayers();
    const b = this.page.locator(`[data-layer-id="${id}"] [data-layer-action="${action}"]`).first();
    await b.scrollIntoViewIfNeeded(); await b.click(); this.n += 1; await this.page.waitForTimeout(200);
  }
  async layerRow(id) {
    await this.openLayers();
    const row = this.page.locator(`[data-layer-id="${id}"] .vnext-layer-name`).first();
    await row.scrollIntoViewIfNeeded(); await row.click(); this.n += 1; await this.page.waitForTimeout(200);
  }
  async shot(name) { await this.page.screenshot({ path: resolve(SHOTS, `${name}.png`) }); return `scratch/cover-audit/shots/${name}.png`; }
  async undoAll() {
    let c = 0;
    const undo = this.page.locator('[data-editor-action="undo"]');
    while (c < 25 && await undo.isEnabled()) { await undo.click(); await this.page.waitForTimeout(150); c += 1; }
    return c;
  }
}

async function open(name = N) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/tests/vnext/proof/fixtures/cover-audit-browser.html?catalog=${name}`, { waitUntil: 'networkidle' });
  await page.locator('[data-vnext-shell]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  const p = new Probe(page);
  p.errs = errs; p.ctx = ctx;
  p.initial = JSON.stringify((await p.state()).document);
  return p;
}

/** Audit verdict from the measured result: easy (≤ 6 actions, no workaround), possible (it works, with more steps), or not. */
const verdict = (ok, actions, limit = 6) => (!ok ? 'impossível' : actions <= limit ? 'fácil' : 'possível');

const ONLY = process.env.CAPA_ONLY ? process.env.CAPA_ONLY.split(',') : undefined;
async function scenario(id, edit, fn, { undo = true } = {}) {
  if (ONLY && !ONLY.includes(id)) return;
  const p = await open();
  const r = { id, edit };
  try {
    const out = await fn(p);
    r.clicks = out.clicks ?? p.n;
    r.outcome = out.outcome ?? verdict(out.ok, r.clicks, out.limit);
    Object.assign(r, { evidence: out.evidence, screenshot: out.screenshot });
    if (undo) {
      const changed = JSON.stringify((await p.state()).document) !== p.initial;
      const u = await p.undoAll();
      r.undo = { documentChanged: changed, undoClicks: u, restoredExactly: JSON.stringify((await p.state()).document) === p.initial };
    }
  } catch (e) {
    r.outcome = 'erro-do-harness';
    r.error = String(e).slice(0, 400);
    try { r.screenshot = await p.shot(`C-${id}-erro`); } catch { /* ignore */ }
  }
  if (p.errs.length) r.consoleErrors = p.errs.slice(0, 3);
  results.push(r);
  console.log(`${id} ${r.outcome} (${r.clicks ?? '?'} ações) ${edit}${r.undo ? ` · desfazer exato: ${r.undo.restoredExactly}` : ''}`);
  await p.ctx.close();
}

// ---- As 21 edições da auditoria ------------------------------------------------------------------------------------
await scenario('S01', 'Mudar a cor do fundo diagonal', async (p) => {
  await p.clickMm(20, 120);
  const picked = (await p.selected())[0];
  await p.panelClick('[data-native-fill-kind="solid"]');
  await p.panelPickColor('[data-native-fill-picker]', '#1f4e79');
  const fill = (await p.obj(oid('fundo-azul'))).style.fill;
  const ok = picked === oid('fundo-azul') && fill.kind === 'solid' && fill.color === '#1F4E79';
  return { ok, evidence: `1º clique no lado azul pegou ${picked === oid('fundo-azul') ? 'o polígono azul (o padrão de pontos por cima está travado)' : picked}; preenchimento → ${JSON.stringify(fill)}`, screenshot: await p.shot('C-S01') };
});

await scenario('S02', 'Trocar a foto da capa (e as setas acompanham)', async (p) => {
  await p.clickMm(110, 110);
  const reached = (await p.selected())[0] === oid('foto');
  await p.details();
  const [chooser] = await Promise.all([
    p.page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
    (async () => { const b = p.page.locator('[data-editor-action="upload-image-inspector"]'); await b.scrollIntoViewIfNeeded(); await b.click(); })().catch(() => null),
  ]);
  let replaced = false;
  if (chooser) {
    await chooser.setFiles(resolve(OUT, 'assets', existsSync(resolve(OUT, 'assets', SECOND_PHOTO)) ? SECOND_PHOTO : 'pcon-hibrido-hybrid-official-trim.png'));
    p.n += 2; await p.page.waitForTimeout(1500);
    replaced = (await p.obj(oid('foto'))).assetId !== '7e8ad13e-8bd3-5709-8e89-98870ee157bf';
  }
  // A chamada aponta para a foto nova: ponta da seta por X/Y (2 campos).
  await p.clickObj(oid('chamada-1'));
  await p.panelType('[data-text-leader-x]', '80');
  await p.panelType('[data-text-leader-y]', '140');
  const c = await p.obj(oid('chamada-1'));
  const tip = [+(c.frame.xMm + c.leader.anchorXMm).toFixed(2), +(c.frame.yMm + c.leader.anchorYMm).toFixed(2)];
  const ok = reached && replaced && tip[0] === 80 && tip[1] === 140;
  return { ok, limit: 10, evidence: `clique direto na foto: ${reached}; foto trocada: ${replaced}; ponta da chamada 1 → (${tip.join(', ')}) mm (as setas são do documento, não do PNG)`, screenshot: await p.shot('C-S02') };
});

await scenario('S03', 'Mover uma pílula ("0 a 250 psi") como uma peça só', async (p) => {
  const before = await p.obj(oid('pilula-a1'));
  await p.drag(oid('pilula-a1'), 20, -6);
  const now = await p.obj(oid('pilula-a1'));
  const ok = Math.abs(now.frame.xMm - before.frame.xMm - 20) < 1.5 && now.frame.widthMm === before.frame.widthMm && JSON.stringify(now.box) === JSON.stringify(before.box);
  return { ok, evidence: `(${before.frame.xMm}, ${before.frame.yMm}) → (${now.frame.xMm}, ${now.frame.yMm}); tamanho mantido; o fundo da pílula é o mesmo objeto`, screenshot: await p.shot('C-S03') };
});

await scenario('S04', 'Editar o texto da pílula ("0 a 25000 psi (ar)") sem vazar', async (p) => {
  await p.typeText(oid('pilula-a1'), '0 a 25000 psi (ar)');
  const id = oid('pilula-a1');
  const scale = await p.page.evaluate((x) => document.querySelector(`[data-object-id="${x}"] [data-text-fit-scale]`)?.getAttribute('data-text-fit-scale'), id);
  const overflow = await p.page.evaluate((x) => {
    const node = document.querySelector(`[data-object-id="${x}"]`); const flow = node?.querySelector('[data-flow-root]');
    if (!node || !flow) return null;
    const range = document.createRange(); range.selectNodeContents(flow);
    return Math.round((range.getBoundingClientRect().width - (flow.parentElement?.clientWidth ?? 0)) * 10) / 10;
  }, id);
  const edited = textOf(await p.obj(id)) === '0 a 25000 psi (ar)';
  return { ok: edited && overflow !== null && overflow <= 0.5, evidence: `texto editado: ${edited}; escala do texto no selo: ${scale}; sobra (px, ≤ 0 = cabe): ${overflow}`, screenshot: await p.shot('C-S04') };
});

await scenario('S05', 'Mudar o rótulo da chamada e mover a seta', async (p) => {
  await p.typeText(oid('chamada-2'), 'Referência barométrica');
  await p.clickObj(oid('chamada-2'));
  await p.panelType('[data-text-leader-x]', '95');
  await p.panelType('[data-text-leader-y]', '128');
  const c = await p.obj(oid('chamada-2'));
  const tip = [+(c.frame.xMm + c.leader.anchorXMm).toFixed(2), +(c.frame.yMm + c.leader.anchorYMm).toFixed(2)];
  await p.drag(oid('chamada-2'), 0, 6, 0.3);
  const moved = await p.obj(oid('chamada-2'));
  const ok = textOf(c) === 'Referência barométrica' && tip[0] === 95 && tip[1] === 128 && moved.frame.yMm !== c.frame.yMm && moved.leader.anchorXMm === c.leader.anchorXMm;
  return { ok, limit: 10, evidence: `rótulo editado; ponta → (${tip.join(', ')}) mm; arrastar o rótulo levou a seta junto (y ${c.frame.yMm} → ${moved.frame.yMm})`, screenshot: await p.shot('C-S05') };
});

await scenario('S06', 'Selecionar um texto que está sobre uma imagem/fundo ("PRESYS")', async (p) => {
  await p.clickObj(oid('marca'));
  const ok = (await p.selected())[0] === oid('marca');
  return { ok, evidence: `1 clique selecionou ${ok ? 'o texto' : (await p.selected())[0]}`, screenshot: await p.shot('C-S06') };
}, { undo: false });

await scenario('S07', 'Selecionar o objeto de baixo sem reordenar', async (p) => {
  const z0 = JSON.stringify((await p.objs()).map((o) => o.zIndex));
  await p.clickMm(110, 110);
  const first = (await p.selected())[0];
  const cycle = [];
  for (let i = 0; i < 3; i += 1) { await p.clickMm(110, 110, { alt: true }); cycle.push((await p.selected())[0]?.replace('capa-pcon-hibrido-', '')); }
  await p.page.keyboard.press('Escape'); p.n += 1;
  const before = p.n;
  await p.layerRow(oid('sombra'));
  const viaLayers = (await p.selected())[0];
  const same = JSON.stringify((await p.objs()).map((o) => o.zIndex)) === z0;
  return { ok: first === oid('foto') && viaLayers === oid('sombra') && same, clicks: p.n - before,
    evidence: `clique na foto: ${first?.replace('capa-pcon-hibrido-', '')}; Alt+clique: ${cycle.join(' → ')}; Camadas → sombra em ${p.n - before} ações; ordem das camadas intacta: ${same}`, screenshot: await p.shot('C-S07') };
});

await scenario('S08', 'Selecionar 3 elementos e mover juntos', async (p) => {
  const ids = [oid('lado-a-titulo'), oid('lado-a-legenda'), oid('marca')];
  await p.clickObj(ids[0]); await p.clickObj(ids[1], { ctrl: true }); await p.clickObj(ids[2], { ctrl: true });
  const before = await Promise.all(ids.map((id) => p.obj(id)));
  await p.drag(ids[2], 0, 20, 0.25);
  const after = await Promise.all(ids.map((id) => p.obj(id)));
  const d = after.map((o, i) => +(o.frame.yMm - before[i].frame.yMm).toFixed(1));
  return { ok: d.every((x) => Math.abs(x - d[0]) < 0.01 && Math.abs(x) > 1), evidence: `deslocamentos: ${d.join(', ')} mm`, screenshot: await p.shot('C-S08') };
});

await scenario('S09', 'Agrupar / desagrupar', async (p) => {
  await p.clickObj(oid('lado-a-titulo')); await p.clickObj(oid('lado-a-legenda'), { ctrl: true });
  const grouped = await p.act('group');
  const g = (await p.objs()).filter((o) => o.type === 'group' && o.id !== oid('sombra'));
  const ungrouped = g.length === 1 ? await p.act('ungroup') : false;
  const after = (await p.objs()).filter((o) => o.type === 'group' && o.id !== oid('sombra')).length;
  return { ok: grouped && g.length === 1 && ungrouped && after === 0, evidence: `agrupar: ${g.length === 1 ? 'ok' : 'falhou'}; desagrupar: ${ungrouped && after === 0 ? 'ok' : 'falhou'}; pílulas/chamadas já são 1 objeto cada (não precisam de grupo)`, screenshot: await p.shot('C-S09') };
});

await scenario('S10', 'Alinhar à esquerda / centralizar (3 textos)', async (p) => {
  const ids = [oid('lado-a-titulo'), oid('titulo'), oid('barra-modelos-titulo')];
  await p.clickObj(ids[0]); await p.clickObj(ids[1], { ctrl: true }); await p.clickObj(ids[2], { ctrl: true });
  const okL = await p.act('align-left');
  const xs = (await Promise.all(ids.map((id) => p.obj(id)))).map((o) => o.frame.xMm);
  const okC = await p.act('align-horizontal-center');
  const cs = (await Promise.all(ids.map((id) => p.obj(id)))).map((o) => +(o.frame.xMm + o.frame.widthMm / 2).toFixed(1));
  return { ok: okL && okC && new Set(xs).size === 1 && new Set(cs).size === 1, evidence: `x após alinhar: ${xs.join(', ')}; centros após centralizar: ${cs.join(', ')}`, screenshot: await p.shot('C-S10') };
});

await scenario('S11', 'Mudar a ordem (camada) de um texto sem que ele suma', async (p) => {
  await p.clickObj(oid('lado-b-titulo'), { fx: 0.75 });
  await p.act('send-back');
  const visible = await p.page.evaluate((id) => {
    const node = document.querySelector(`.editorial-page [data-object-id="${id}"]`);
    if (!node) return false;
    const r = node.getBoundingClientRect();
    const hits = document.elementsFromPoint(r.left + r.width * 0.8, r.top + r.height / 2).filter((e) => e.closest('.editorial-page'));
    const first = hits.find((e) => e.closest('[data-object-id]'))?.closest('[data-object-id]');
    return first?.getAttribute('data-object-id') === id;
  }, oid('lado-b-titulo'));
  return { ok: visible, evidence: `"Enviar ao fundo" parou na frente do fundo diagonal: ${visible}; aviso: ${await p.notice()}`, screenshot: await p.shot('C-S11') };
});

await scenario('S12', 'Duplicar um bloco (título HIDRÁULICA + legenda)', async (p) => {
  await p.clickObj(oid('lado-b-titulo'), { fx: 0.75 }); await p.clickObj(oid('lado-b-legenda'), { ctrl: true, fx: 0.75 });
  const n0 = (await p.objs()).length;
  const ok = await p.act('duplicate');
  const added = (await p.objs()).length - n0;
  return { ok: ok && added === 2, evidence: `objetos novos: ${added}`, screenshot: await p.shot('C-S12') };
});

await scenario('S13', 'Redimensionar uma caixa de texto (alça)', async (p) => {
  await p.clickObj(oid('subtitulo'));
  const h = p.page.locator('[data-resize-handle="e"]').first();
  const box = await h.boundingBox();
  const before = (await p.obj(oid('subtitulo'))).frame;
  if (box) {
    await p.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.page.mouse.down();
    await p.page.mouse.move(box.x - 120, box.y + box.height / 2, { steps: 6 }); await p.page.mouse.up(); p.n += 1;
  }
  const after = (await p.obj(oid('subtitulo'))).frame;
  return { ok: after.widthMm < before.widthMm - 5, evidence: `largura ${before.widthMm} → ${after.widthMm} mm`, screenshot: await p.shot('C-S13') };
});

await scenario('S14', 'Mudar cor, tamanho e peso (cor fora da paleta, 8,4 pt)', async (p) => {
  await p.clickObj(oid('frase-topo'), { fx: 0.75 });
  await p.panelPickColor('[data-text-color-picker]', '#a8803f');
  await p.panelType('[data-text-size]', '8,4');
  await p.panelClick('[data-text-bold]');
  const st = (await p.obj(oid('frase-topo'))).style;
  return { ok: st.color === '#A8803F' && st.fontSizePt === 8.4, limit: 8, evidence: `#F3DDB8 7,2 pt 700 → ${st.color} ${st.fontSizePt} pt ${st.fontWeight}`, screenshot: await p.shot('C-S14') };
});

await scenario('S15', 'Travar o fundo para não pegar sem querer', async (p) => {
  await p.layerButton(oid('fundo-azul'), 'toggle-locked');
  await p.layerButton(oid('fundo-dourado'), 'toggle-locked');
  const lockActions = p.n;
  await p.clickMm(110, 110);
  const onPhoto = (await p.selected())[0] === oid('foto');
  await p.clickObj(oid('lado-a-titulo'));
  const onText = (await p.selected())[0] === oid('lado-a-titulo');
  const z0 = JSON.parse(p.initial).pages[0].objects.map((o) => JSON.stringify(o.frame)).join();
  const same = (await p.objs()).map((o) => JSON.stringify(o.frame)).join() === z0;
  return { ok: onPhoto && onText && same, clicks: lockActions, evidence: `travar os 2 lados em Camadas: ${lockActions} ações; depois, clique na foto: ${onPhoto}; no texto: ${onText}; nada saiu do lugar: ${same}`, screenshot: await p.shot('C-S15') };
});

await scenario('S16', 'Barra da família: destacar outro modelo (DT) e mover a barra', async (p) => {
  // Destaque: HÍBRIDO volta a branco, DT fica dourado (cor do selo + cor do texto), a seta vai para cima do DT.
  // Onda 4 (P): "Destacar este modelo" no painel do selo faz os três num passo de Desfazer (antes: 4 cores + arrastar a seta).
  await p.clickObj(oid('modelo-5'), { fx: 0.5 });
  await p.panelClick('[data-family-bar-highlight]');
  const highlight = p.n;
  const m5 = await p.obj(oid('modelo-5')), m6 = await p.obj(oid('modelo-6')), seta = await p.obj(oid('modelo-atual-seta'));
  const centered = Math.abs(seta.frame.xMm + seta.frame.widthMm / 2 - (m5.frame.xMm + m5.frame.widthMm / 2)) < 1;
  // Mover a barra inteira: caixa de seleção a partir da margem cinza.
  const [, y1, s] = await p.point(0, 263.8);
  const st = await p.stage();
  await p.page.mouse.move(st.x - 12, y1); await p.page.mouse.down();
  await p.page.mouse.move(st.x + 100 * s, st.y + 273.3 * s, { steps: 4 }); await p.page.mouse.move(st.x + 205 * s, st.y + 273.3 * s, { steps: 4 });
  await p.page.mouse.up(); await p.page.waitForTimeout(250); p.n += 1;
  const sel = await p.selected();
  const ok = m5.box.fill === '#8A642B' && m5.style.color === '#FFFFFF' && m6.box.fill === '#FFFFFF' && centered;
  return { ok, clicks: highlight, evidence: `destaque em DT com ${highlight} ações (selo ${m5.box.fill}, texto ${m5.style.color}; HÍBRIDO ${m6.box.fill}); seta centrada no DT: ${centered}; caixa de seleção a partir da margem pegou ${sel.length}: ${sel.map((id) => id.replace('capa-pcon-hibrido-', '')).join(', ')}`, screenshot: await p.shot('C-S16') };
});

await scenario('S17', 'Trocar o logotipo (texto "PRESYS") — cor e tamanho; imagem de logotipo', async (p) => {
  await p.clickObj(oid('marca'));
  await p.panelPickColor('[data-text-color-picker]', '#f3ddb8');
  await p.panelType('[data-text-size]', '22');
  const st = (await p.obj(oid('marca'))).style;
  return { ok: st.color === '#F3DDB8' && st.fontSizePt === 22, evidence: `PRESYS: #FFFFFF 19 pt → ${st.color} ${st.fontSizePt} pt. Trocar por uma IMAGEM de logotipo continua pelo botão Imagem (sem biblioteca de logotipos: P3)`, screenshot: await p.shot('C-S17') };
});

await scenario('S18', 'Mudar a cor de fundo da página (área branca)', async (p) => {
  await p.clickMm(200, 292);
  const none = (await p.selected()).length === 0;
  await p.panelPickColor('[data-page-background-picker]', '#f7f3ea');
  const bg = (await p.state()).document.pages[0].background;
  return { ok: none && bg?.color === '#F7F3EA', evidence: `clique no branco: ${none ? 'nada selecionado, painel Fundo da página' : 'selecionou algo'}; fundo → ${JSON.stringify(bg)}`, screenshot: await p.shot('C-S18') };
});

await scenario('S19', 'Soltar a seleção do fundo e voltar a um texto', async (p) => {
  await p.clickMm(20, 120);
  const bg = (await p.selected())[0] === oid('fundo-azul');
  const before = p.n;
  await p.clickObj(oid('lado-a-titulo'));
  const toText = (await p.selected())[0] === oid('lado-a-titulo');
  await p.page.keyboard.press('Escape'); p.n += 1;
  const released = (await p.selected()).length === 0;
  return { ok: bg && toText && released, clicks: p.n - before, evidence: `fundo selecionado: ${bg}; 1 clique no texto pega o texto: ${toText}; Esc solta: ${released}`, screenshot: await p.shot('C-S19') };
}, { undo: false });

await scenario('S20', 'Cor da faixa (lado dourado), da régua e do selo da barra', async (p) => {
  await p.clickMm(195, 100);
  const band = (await p.selected())[0] === oid('fundo-dourado');
  await p.panelClick('[aria-label="Cor inicial do degradê #092D4D"]');
  await p.clickMm(150, 278.1);
  const rule = (await p.selected())[0] === oid('regua');
  await p.panelClick('[aria-label="Cor da linha #8A642B"]');
  await p.clickObj(oid('modelo-1'), { fx: 0.5 });
  await p.panelClick('[aria-label="Cor do selo #EDF3F7"]');
  const f = (await p.obj(oid('fundo-dourado'))).style.fill, r = (await p.obj(oid('regua'))).color, m = (await p.obj(oid('modelo-1'))).box.fill;
  return { ok: band && rule && f.from === '#092D4D' && r === '#8A642B' && m === '#EDF3F7', limit: 6,
    evidence: `faixa ${band ? 'selecionada' : 'NÃO'} → início ${f.from}; régua ${rule ? 'selecionada' : 'NÃO'} → ${r}; selo → ${m} (página 2 do catálogo: medida em S2/N20)`, screenshot: await p.shot('C-S20') };
});

await scenario('S21', 'Mudar o rodapé (nesta capa)', async (p) => {
  await p.typeText(oid('rodape-2'), 'PCON-HIBRIDO · Edição 2026');
  const ok = textOf(await p.obj(oid('rodape-2'))) === 'PCON-HIBRIDO · Edição 2026';
  return { ok, evidence: `rodapé da capa editado em ${p.n} ações; em TODAS as páginas de um catálogo (página-mestra, numeração automática) continua P3`, screenshot: await p.shot('C-S21') };
});

await scenario('S22', 'Clicar na foto e no fundo vazio da capa', async (p) => {
  await p.clickMm(110, 110);
  const photo = (await p.selected())[0];
  await p.clickMm(8, 60);
  const blue = (await p.selected())[0];
  await p.clickMm(205, 60);
  const gold = (await p.selected())[0];
  const ok = photo === oid('foto') && blue === oid('fundo-azul') && gold === oid('fundo-dourado');
  return { ok, evidence: `foto → ${photo?.replace('capa-pcon-hibrido-', '')}; vazio azul → ${blue?.replace('capa-pcon-hibrido-', '')}; vazio dourado → ${gold?.replace('capa-pcon-hibrido-', '')}`, screenshot: await p.shot('C-S22') };
}, { undo: false });

await scenario('T01', 'Inserir "Capa de produto — PCON" pela galeria "Usar modelo…"', async (p) => {
  const n0 = (await p.state()).document.pages.length;
  await p.page.locator('[data-editor-action="toggle-page-reuse"]').click(); p.n += 1; await p.page.waitForTimeout(300);
  const card = p.page.locator('[data-page-model="presys-capa-produto-pcon"]');
  await card.scrollIntoViewIfNeeded(); await card.click(); p.n += 1;
  await p.page.locator('[data-editor-action="insert-template"]').click(); p.n += 1; await p.page.waitForTimeout(800);
  const doc = (await p.state()).document;
  const page = doc.pages[doc.pages.length === n0 + 1 ? 1 : 0];
  const kinds = page.objects.reduce((acc, o) => ({ ...acc, [o.type]: (acc[o.type] ?? 0) + 1 }), {});
  return { ok: doc.pages.length === n0 + 1 && kinds.polygon === 6, evidence: `páginas ${n0} → ${doc.pages.length}; objetos da página nova: ${JSON.stringify(kinds)}; aviso: ${await p.notice()}`, screenshot: await p.shot('C-T01') };
});

// ---- N00: revisão de publicação real + tela = PDF ------------------------------------------------------------------
if (!ONLY || ONLY.includes('N00')) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/tests/vnext/proof/fixtures/cover-capa-pcon-print.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__READY__ === true, null, { timeout: 60000 });
  const review = await page.evaluate(() => window.__CAPA__);
  const element = page.locator('.editorial-page').first();
  const screen = await element.screenshot();
  writeFileSync(resolve(SHOTS, 'C-N00-tela.png'), screen);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  writeFileSync(resolve(OUT, 'C-N00-capa-pcon.pdf'), pdf);
  const comparison = await page.evaluate(async ({ pdfBase64, shot }) => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
    const data = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
    const doc = await pdfjs.getDocument({ data }).promise;
    const img = new Image(); img.src = `data:image/png;base64,${shot}`; await img.decode();
    const pdfPage = await doc.getPage(1);
    const viewport = pdfPage.getViewport({ scale: img.width / pdfPage.getViewport({ scale: 1 }).width });
    const printed = document.createElement('canvas'); printed.width = img.width; printed.height = img.height;
    await pdfPage.render({ canvasContext: printed.getContext('2d'), viewport }).promise;
    const grid = (source) => {
      const small = document.createElement('canvas'); small.width = 42; small.height = 59;
      const g = small.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(source, 0, 0, 42, 59); return g.getImageData(0, 0, 42, 59).data;
    };
    const sample = (source, xMm, yMm, size = 5) => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(source, 0, 0);
      const px = Math.round(xMm * img.width / 210), py = Math.round(yMm * img.width / 210), half = Math.floor(size / 2);
      const d = g.getImageData(px - half, py - half, size, size).data;
      return [0, 1, 2].map((ch) => { let t = 0; for (let k = ch; k < d.length; k += 4) t += d[k]; return Math.round(t / (size * size)); });
    };
    // Pontos dos elementos nativos; nos padrões a janela cobre ~2 desenhos para não depender de onde cai o 1º ponto.
    const probes = [['diagonal azul + pontos', 20, 120, 23], ['diagonal dourada + ondas', 195, 100, 23], ['pílula azul', 15.6, 238.5], ['pílula dourada', 85.6, 238.5],
      ['barra: HÍBRIDO', 170, 266.5], ['barra: borda', 14.2, 268.9, 3], ['título', 20, 212, 3]];
    const probeDiffs = probes.map(([name, x, y, size]) => {
      const a = sample(img, x, y, size), b = sample(printed, x, y, size);
      return { name, screen: a, pdf: b, diff: Math.max(...a.map((v, k) => Math.abs(v - b[k]))) };
    });
    const a = grid(img), b = grid(printed);
    let max = 0, sum = 0, over = 0;
    for (let k = 0; k < a.length; k += 4) {
      const d = (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2])) / 3;
      max = Math.max(max, d); sum += d; if (d > 24) over += 1;
    }
    return { pdfPages: doc.numPages, sizePx: `${img.width}x${img.height}`, cells: a.length / 4, meanCellDiff: Math.round(sum / (a.length / 4) * 100) / 100,
      maxCellDiff: Math.round(max * 10) / 10, cellsOver24: over, probes: probeDiffs, render: printed.toDataURL('image/png').split(',')[1] };
  }, { pdfBase64: pdf.toString('base64'), shot: screen.toString('base64') });
  writeFileSync(resolve(SHOTS, 'C-N00-pdf.png'), Buffer.from(comparison.render, 'base64'));
  delete comparison.render;
  const same = comparison.pdfPages === 1 && comparison.probes.every((probe) => probe.diff <= 8) && comparison.meanCellDiff < 5 && comparison.cellsOver24 <= comparison.cells * 0.05;
  const errors = review.diagnostics.filter((d) => d.severity === 'ERROR');
  results.push({ id: 'N00', edit: 'Revisão de publicação real + tela = PDF (mesmo DOM, PDF rasterizado com pdf.js)',
    outcome: review.status === 'READY' && same ? 'READY e igual' : `${review.status} / ${same ? 'igual' : 'diferente'}`,
    review: { status: review.status, errors, warnings: review.diagnostics.filter((d) => d.severity !== 'ERROR').map((d) => `${d.code} ${d.objectId ?? ''} ${d.details}`) },
    comparison, pdf: 'scratch/cover-audit/C-N00-capa-pcon.pdf', screenshot: 'scratch/cover-audit/shots/C-N00-tela.png', screenshot2: 'scratch/cover-audit/shots/C-N00-pdf.png',
    consoleErrors: errs.slice(0, 3) });
  console.log('N00', review.status, same ? 'tela = PDF' : 'tela ≠ PDF', JSON.stringify({ ...comparison, probes: comparison.probes.map((x) => `${x.name}:${x.diff}`) }));
  await ctx.close();
}

const resultsFile = resolve(OUT, 'capa-pcon-results.json');
// A partial run (CAPA_ONLY=S16,N00) replaces only its own entries in the last full run.
const merged = ONLY && existsSync(resultsFile)
  ? JSON.parse(readFileSync(resultsFile, 'utf8')).map((entry) => results.find((item) => item.id === entry.id) ?? entry)
  : results;
writeFileSync(resultsFile, JSON.stringify(merged, null, 2));
await browser.close();
await server.close();
console.log('ok -> scratch/cover-audit/capa-pcon-results.json');

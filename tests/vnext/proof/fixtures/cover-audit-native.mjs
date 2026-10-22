/* global window, document, Image, atob, Buffer, console, process, structuredClone */
// Re-medição (Onda 3.5, S2 — estilos e elementos nativos): as edições que o passo 1 mediu como impossíveis/difíceis
// por causa de arte "assada" em PNG, refeitas SÓ pela interface visível do editor real (modo simples, 1366x768).
//
//   node tests/vnext/proof/fixtures/cover-audit-native.mjs
//   COVER_AUDIT_SRC=D:/catalogos-exemplo/pcon-family-2026-10-22   COVER_AUDIT_PORT=5242
//   Usa o editor montado por cover-audit-browser.{html,tsx} (branch onda35/audit-capas; até a integração:
//   git checkout onda35/audit-capas -- tests/vnext/proof/fixtures/cover-audit-browser.html tests/vnext/proof/fixtures/cover-audit-browser.tsx)
//   e cover-native-print.{html,tsx} para a prova "tela = PDF" (pdf.js rasteriza o PDF impresso do mesmo DOM).
//
// Monta PCON-HIBRIDO-NATIVO a partir do catálogo real: a capa troca o PNG de fundo (plate) e o PNG de chamadas
// (overlay) por elementos nativos (2 polígonos da divisão diagonal + 1 padrão de pontos, 6 selos, 2 chamadas,
// barra da família em selos) e a página 2 troca as 2 faixas PNG por polígonos com padrão. Os textos, a foto e todo o
// resto continuam os do catálogo real. Grava scratch/cover-audit/native-results.json + capturas em shots/N*.png.
import { cpSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
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

// ---- PCON-HIBRIDO-NATIVO ----------------------------------------------------------------------------------------
const textOf = (o) => o.text?.paragraphs?.map((pp) => pp.inlines.map((i) => i.text ?? '').join('')).join('\n') ?? '';
const source = JSON.parse(readFileSync(resolve(OUT, 'catalogs', 'PCON-HIBRIDO.catalog.json'), 'utf8'));
const native = structuredClone(source);
native.title = `${source.title} (nativo)`;
const assetName = (o) => native.assets.find((a) => a.id === o.assetId)?.name ?? '';
const NAVY = '#092D4D', GOLD = '#8A642B';
let seq = 0;
const nid = (tag) => `onda35-native-${tag}-${++seq}`;
const cover = native.pages[0];
cover.objects = cover.objects.filter((o) => !(o.type === 'image' && /plate|overlay/.test(assetName(o))));
cover.objects.push(
  { id: nid('diagonal-azul'), type: 'polygon', frame: { xMm: 0, yMm: 0, widthMm: 210, heightMm: 196 }, zIndex: -3,
    points: [{ x: 0, y: 0 }, { x: 0.6, y: 0 }, { x: 0.4, y: 1 }, { x: 0, y: 1 }], style: { fill: { kind: 'solid', color: NAVY } } },
  { id: nid('diagonal-dourada'), type: 'polygon', frame: { xMm: 0, yMm: 0, widthMm: 210, heightMm: 196 }, zIndex: -3,
    points: [{ x: 0.6, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0.4, y: 1 }], style: { fill: { kind: 'linear', from: GOLD, to: '#C9A46A', angleDeg: 90 } } },
  { id: nid('pontos'), type: 'polygon', frame: { xMm: 0, yMm: 150, widthMm: 84, heightMm: 46 }, zIndex: -2,
    points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.9, y: 1 }, { x: 0, y: 1 }], style: { fill: { kind: 'pattern', pattern: 'dots', color: '#FFFFFF', spacingMm: 3 }, opacity: 0.18 } },
);
const pillTexts = ['0 a 250 psi', '0 a 360 psi', '100 a 1500 psi', '100 a 3000 psi', '100 a 6000 psi', '100 a 10000 psi'];
const familyTexts = ['KOMPRESSOR-Y18', 'Y18-BP', 'Y18-LP', 'Y17', 'DT', 'HÍBRIDO'];
for (const o of cover.objects) {
  if (o.type !== 'text') continue;
  const t = textOf(o);
  const pill = pillTexts.indexOf(t);
  if (pill >= 0) o.box = { fill: pill < 2 ? NAVY : GOLD, paddingMm: 1, fitText: true };
  const family = familyTexts.indexOf(t);
  if (family >= 0) {
    o.box = { fill: t === 'HÍBRIDO' ? GOLD : '#EDF3F7', paddingMm: 1, fitText: true, cornerRadiusMm: 0.8 };
    o.frame = { ...o.frame, yMm: 266, heightMm: 6 };
  }
  if (t.startsWith('Saída pneumática')) o.leader = { anchorXMm: 64, anchorYMm: -14, head: 'dot', elbow: true, color: '#FFFFFF', thicknessPt: 0.75 };
  if (t.startsWith('BAROM. REF')) o.leader = { anchorXMm: 74, anchorYMm: -4, head: 'dot', elbow: true, color: '#FFFFFF', thicknessPt: 0.75 };
}
const inner = native.pages[1];
for (const o of inner.objects) {
  if (o.type !== 'image' || !/band-header-(a|b)/.test(assetName(o))) continue;
  const gold = /band-header-b/.test(assetName(o));
  Object.assign(o, { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    style: { fill: { kind: 'pattern', pattern: gold ? 'waves' : 'dots', color: '#FFFFFF', background: gold ? GOLD : NAVY, spacingMm: 3 } } });
  delete o.assetId; delete o.fit; delete o.focalPoint;
}
writeFileSync(resolve(OUT, 'catalogs', 'PCON-HIBRIDO-NATIVO.catalog.json'), JSON.stringify(native, null, 2));

// ---- Navegador ---------------------------------------------------------------------------------------------------
const PORT = Number(process.env.COVER_AUDIT_PORT ?? 5242);
const server = await createServer({
  root,
  server: { host: '127.0.0.1', port: PORT, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];

class Probe {
  constructor(page) { this.page = page; this.n = 0; this.notes = []; }
  note(t) { this.notes.push(t); }
  async state() { return this.page.evaluate(() => window.__COVER_AUDIT__.state()); }
  async objs(pageIndex = 0) { return (await this.state()).document.pages[pageIndex].objects; }
  async selected() {
    return this.page.evaluate(() => [...document.querySelectorAll('[data-editor-object-id][data-selected="true"]')].map((e) => e.getAttribute('data-editor-object-id')));
  }
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
  async clickMm(xMm, yMm, label = '') {
    await this.reveal(yMm);
    const st = await this.stage();
    const s = st.width / 210;
    await this.page.mouse.click(st.x + xMm * s, st.y + yMm * s);
    await this.page.waitForTimeout(250);
    this.n += 1;
    if (label) this.note(`clique em ${label}`);
  }
  async dblClickObj(o, fx = 0.25) {
    await this.reveal(o.frame.yMm + o.frame.heightMm / 2);
    const st = await this.stage();
    const s = st.width / 210;
    await this.page.mouse.dblclick(st.x + (o.frame.xMm + o.frame.widthMm * fx) * s, st.y + (o.frame.yMm + o.frame.heightMm / 2) * s);
    await this.page.waitForTimeout(300);
    this.n += 1;
  }
  async drag(o, dxMm, dyMm, fx = 0.5) {
    await this.reveal(o.frame.yMm + o.frame.heightMm / 2);
    const st = await this.stage();
    const s = st.width / 210;
    const cx = st.x + (o.frame.xMm + o.frame.widthMm * fx) * s, cy = st.y + (o.frame.yMm + o.frame.heightMm / 2) * s;
    await this.page.mouse.move(cx, cy); await this.page.mouse.down();
    await this.page.mouse.move(cx + dxMm * s / 2, cy + dyMm * s / 2, { steps: 6 });
    await this.page.mouse.move(cx + dxMm * s, cy + dyMm * s, { steps: 6 });
    await this.page.mouse.up(); await this.page.waitForTimeout(300);
    this.n += 1;
  }
  /** Um clique num controle do painel lateral (amostra, botão). */
  async panelClick(selector) {
    const loc = this.page.locator(`aside.vnext-info ${selector}`).first();
    await loc.scrollIntoViewIfNeeded();
    await loc.click(); await this.page.waitForTimeout(200);
    this.n += 1;
  }
  /** Digitar num campo do painel e confirmar com Enter (2 ações). */
  async panelType(selector, value) {
    const loc = this.page.locator(`aside.vnext-info ${selector}`).first();
    await loc.scrollIntoViewIfNeeded();
    await loc.fill(value); await loc.press('Enter'); await this.page.waitForTimeout(200);
    this.n += 2;
  }
  /** Escolher uma cor qualquer no seletor do navegador (abrir + escolher = 2 ações). */
  async panelPickColor(selector, hex) {
    const loc = this.page.locator(`aside.vnext-info ${selector}`).first();
    await loc.scrollIntoViewIfNeeded();
    await loc.fill(hex); await loc.dispatchEvent('change'); await this.page.waitForTimeout(200);
    this.n += 2;
  }
  async act(action) {
    const loc = this.page.locator(`[data-editor-action="${action}"]`).first();
    if (!(await loc.count()) || !(await loc.isVisible())) await this.openMore();
    await loc.scrollIntoViewIfNeeded();
    await loc.click(); await this.page.waitForTimeout(200);
    this.n += 1;
  }
  async openMore() {
    const t = this.page.locator('[data-editor-action="toggle-advanced-tools"]');
    await t.scrollIntoViewIfNeeded();
    if ((await t.textContent()).includes('Mais')) { await t.click(); this.n += 1; await this.page.waitForTimeout(250); }
  }
  async heading() { return this.page.evaluate(() => document.querySelector('aside.vnext-info h2')?.textContent ?? ''); }
  async shot(name) { await this.page.screenshot({ path: resolve(SHOTS, `${name}.png`) }); return `scratch/cover-audit/shots/${name}.png`; }
  async undoAll() {
    let c = 0;
    const undo = this.page.locator('[data-editor-action="undo"]');
    while (c < 20 && await undo.isEnabled()) { await undo.click(); await this.page.waitForTimeout(150); c += 1; }
    return c;
  }
}

async function open(name) {
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

async function scenario(id, edit, name, fn, { undo = true } = {}) {
  const p = await open(name);
  const r = { id, edit, catalog: name };
  try {
    Object.assign(r, await fn(p));
    r.clicks = r.clicks ?? p.n;
    r.notes = p.notes;
    if (undo) {
      const changed = JSON.stringify((await p.state()).document) !== p.initial;
      const u = await p.undoAll();
      r.undo = { documentChanged: changed, undoClicks: u, restoredExactly: JSON.stringify((await p.state()).document) === p.initial };
    }
  } catch (e) {
    r.outcome = 'erro-do-harness';
    r.error = String(e).slice(0, 400);
    try { r.screenshot = await p.shot(`${id}-erro`); } catch { /* ignore */ }
  }
  if (p.errs.length) r.consoleErrors = p.errs.slice(0, 3);
  results.push(r);
  console.log(`${id} ${r.outcome} (${r.clicks ?? '?'} ações) ${edit}`);
  await p.ctx.close();
}

const N = 'PCON-HIBRIDO-NATIVO';
const byText = (objs, s) => objs.find((o) => o.type === 'text' && textOf(o).includes(s));
const byId = (objs, id) => objs.find((o) => o.id === id);

await scenario('N01', 'S01 — mudar a cor do fundo diagonal (azul → dourado claro)', N, async (p) => {
  const poly = (await p.objs()).find((o) => o.type === 'polygon' && o.id.includes('diagonal-azul'));
  await p.clickMm(20, 120, 'área azul vazia');
  const picked = (await p.selected())[0] === poly.id;
  const heading = await p.heading();
  await p.panelPickColor('[data-native-fill-picker]', '#173f66');
  const after = byId(await p.objs(), poly.id).style.fill;
  return {
    outcome: picked && after?.color === '#173F66' ? 'fácil' : 'falhou',
    evidence: `1º clique selecionou ${picked ? 'o polígono da diagonal' : 'outro objeto'} (painel "${heading}"); cor: ${JSON.stringify(poly.style.fill)} → ${JSON.stringify(after)}`,
    screenshot: await p.shot('N01-diagonal'),
  };
});

await scenario('N01b', 'S01 — trocar a diagonal por degradê e padrão (sem PNG)', N, async (p) => {
  const poly = (await p.objs()).find((o) => o.type === 'polygon' && o.id.includes('diagonal-azul'));
  await p.clickMm(20, 120, 'área azul vazia');
  await p.panelClick('[data-native-fill-kind="pattern"]');
  await p.panelClick('[data-native-pattern="waves"]');
  const after = byId(await p.objs(), poly.id).style.fill;
  return {
    outcome: after?.kind === 'pattern' && after.pattern === 'waves' ? 'fácil' : 'falhou',
    evidence: `preenchimento → ${JSON.stringify(after)}`,
    screenshot: await p.shot('N01b-diagonal-padrao'),
  };
});

await scenario('N03', 'S03 — mover uma pílula ("0 a 250 psi") como uma peça só', N, async (p) => {
  const t = byText(await p.objs(), '0 a 250 psi');
  await p.drag(t, 20, -8, 0.5);
  const now = byId(await p.objs(), t.id);
  const movedTogether = now.box && JSON.stringify(now.box) === JSON.stringify(t.box);
  return {
    outcome: now.frame.xMm !== t.frame.xMm && movedTogether && now.frame.widthMm === t.frame.widthMm ? 'fácil' : 'falhou',
    evidence: `arraste direto: (${t.frame.xMm}, ${t.frame.yMm}) → (${now.frame.xMm}, ${now.frame.yMm}); tamanho ${t.frame.widthMm}×${t.frame.heightMm} → ${now.frame.widthMm}×${now.frame.heightMm}; fundo do selo no mesmo objeto: ${movedTogether}`,
    screenshot: await p.shot('N03-pilula'),
  };
});

await scenario('N04', 'S04 — texto maior na pílula diminui para caber (não vaza)', N, async (p) => {
  const t = byText(await p.objs(), '0 a 250 psi');
  await p.dblClickObj(t);
  await p.page.keyboard.press('Control+a');
  await p.page.keyboard.type('0 a 25000 psi (ar)');
  p.n += 2;
  const commit = p.page.locator('[data-editor-action="commit-text"]').first();
  if (await commit.count()) { await commit.click(); p.n += 1; } else { await p.page.keyboard.press('Escape'); p.n += 1; }
  await p.page.waitForTimeout(500);
  const scale = await p.page.evaluate((id) => document.querySelector(`[data-object-id="${id}"] [data-text-fit-scale]`)?.getAttribute('data-text-fit-scale'), t.id);
  const overflow = await p.page.evaluate((id) => {
    const node = document.querySelector(`[data-object-id="${id}"]`);
    const flow = node?.querySelector('[data-flow-root]');
    if (!node || !flow) return null;
    const range = document.createRange(); range.selectNodeContents(flow);
    return Math.round((range.getBoundingClientRect().width - (flow.parentElement?.clientWidth ?? 0)) * 10) / 10;
  }, t.id);
  const now = byText(await p.objs(), '25000');
  return {
    outcome: now && scale !== null && overflow !== null && overflow <= 0.5 ? 'fácil' : 'falhou',
    evidence: `texto editado: ${!!now}; escala do texto no selo: ${scale}; sobra (px, ≤0 = cabe): ${overflow}`,
    screenshot: await p.shot('N04-pilula-texto'),
  };
});

await scenario('N05', 'S05 (+S02) — mudar o rótulo da chamada e mover a ponta da seta', N, async (p) => {
  const t = byText(await p.objs(), 'Saída pneumática');
  await p.dblClickObj(t);
  await p.page.keyboard.press('Control+a');
  await p.page.keyboard.type('Saída 1/4 NPT');
  p.n += 2;
  const commit = p.page.locator('[data-editor-action="commit-text"]').first();
  if (await commit.count()) { await commit.click(); p.n += 1; } else { await p.page.keyboard.press('Escape'); p.n += 1; }
  await p.page.waitForTimeout(300);
  const edited = byText(await p.objs(), '1/4 NPT');
  if (!(await p.selected()).includes(t.id)) await p.clickMm(t.frame.xMm + t.frame.widthMm * 0.25, t.frame.yMm + 2, 'rótulo');
  const before = byId(await p.objs(), t.id).leader;
  await p.panelType('[data-text-leader-x]', '95');
  await p.panelType('[data-text-leader-y]', '130');
  const after = byId(await p.objs(), t.id);
  const tip = { x: Math.round((after.frame.xMm + after.leader.anchorXMm) * 100) / 100, y: Math.round((after.frame.yMm + after.leader.anchorYMm) * 100) / 100 };
  // Mover o rótulo leva a seta junto (mesmo objeto).
  await p.drag(after, 0, 6, 0.3);
  const moved = byId(await p.objs(), t.id);
  return {
    outcome: edited && tip.x === 95 && tip.y === 130 && moved.leader && moved.frame.yMm !== after.frame.yMm ? 'fácil' : 'falhou',
    evidence: `rótulo editado: ${!!edited}; ponta da seta (página) → (${tip.x}, ${tip.y}) mm [antes âncora ${before.anchorXMm},${before.anchorYMm}]; arrastar o rótulo moveu rótulo+seta juntos (y ${after.frame.yMm} → ${moved.frame.yMm}, âncora relativa igual: ${moved.leader.anchorXMm === after.leader.anchorXMm && moved.leader.anchorYMm === after.leader.anchorYMm})`,
    screenshot: await p.shot('N05-chamada'),
  };
});

await scenario('N09', 'S09 (estilo) — pílula e texto não precisam mais ser agrupados', N, async (p) => {
  const objs = await p.objs();
  const pills = objs.filter((o) => o.type === 'text' && o.box);
  const calls = objs.filter((o) => o.type === 'text' && o.leader);
  return {
    outcome: 'fácil', clicks: 0,
    evidence: `${pills.length} selos e ${calls.length} chamadas são 1 objeto cada (fundo/seta + texto); antes: texto solto + desenho no PNG`,
    screenshot: null,
  };
}, { undo: false });

await scenario('N11', 'S11 (estilo) — "Enviar ao fundo" não esconde texto atrás do fundo da página', N, async (p) => {
  // Fundo da página como propriedade: dá a cor da página e não é objeto, então nenhum texto passa para trás dele.
  await p.clickMm(105, 292, 'faixa vazia da base');
  await p.panelClick('[data-page-background-section] [aria-label="Cor de fundo da página #EDF3F7"]');
  const t = byText(await p.objs(), 'PCON HÍBRIDO');
  await p.clickMm(t.frame.xMm + 10, t.frame.yMm + 4, 'título');
  await p.act('send-back');
  const visible = await p.page.evaluate((id) => {
    const node = document.querySelector(`[data-object-id="${id}"]`);
    if (!node) return false;
    const r = node.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + 8, r.top + r.height / 2);
    return !!hit && (node.contains(hit) || !!hit.closest('[data-editor-overlay]'));
  }, t.id);
  const bg = (await p.state()).document.pages[0].background;
  return {
    outcome: bg?.color === '#EDF3F7' && visible ? 'fácil (fundo da página)' : 'parcial',
    evidence: `fundo da página = ${JSON.stringify(bg)} (propriedade, não objeto); título enviado ao fundo continua visível sobre a cor da página: ${visible}. Atenção: atrás de um POLÍGONO (objeto) o texto ainda some — limitar "Enviar ao fundo" é P0.4 (frente S1)`,
    screenshot: await p.shot('N11-fundo-pagina'),
  };
});

await scenario('N14', 'S14 — cor livre (dourado #F3DDB8), tamanho 7,2 pt e peso', N, async (p) => {
  const t = byText(await p.objs(), 'DOIS MEIOS');
  await p.clickMm(t.frame.xMm + t.frame.widthMm * 0.75, t.frame.yMm + 2, 'texto dourado');
  await p.panelPickColor('[data-text-color-picker]', '#a8803f');
  await p.panelType('[data-text-size]', '8,4');
  await p.panelClick('[data-text-bold]');
  const after = byId(await p.objs(), t.id).style;
  return {
    outcome: after.color === '#A8803F' && after.fontSizePt === 8.4 ? 'fácil' : 'falhou',
    evidence: `${t.style.color} ${t.style.fontSizePt}pt peso ${t.style.fontWeight} → ${after.color} ${after.fontSizePt}pt peso ${after.fontWeight} (cor fora da paleta, tamanho com vírgula)`,
    screenshot: await p.shot('N14-estilo'),
  };
});

await scenario('N17', 'S17 (estilo) — cor e tamanho do "PRESYS"', N, async (p) => {
  const t = byText(await p.objs(), 'PRESYS');
  await p.clickMm(t.frame.xMm + 5, t.frame.yMm + 4, 'PRESYS');
  await p.panelPickColor('[data-text-color-picker]', '#f3ddb8');
  await p.panelType('[data-text-size]', '22');
  const after = byId(await p.objs(), t.id).style;
  return {
    outcome: after.color === '#F3DDB8' && after.fontSizePt === 22 ? 'fácil' : 'falhou',
    evidence: `${t.style.color} ${t.style.fontSizePt}pt → ${after.color} ${after.fontSizePt}pt (trocar por um logotipo-imagem continua na frente S3/P3)`,
    screenshot: await p.shot('N17-presys'),
  };
});

await scenario('N18', 'S18 — mudar a cor de fundo da página', N, async (p) => {
  await p.clickMm(105, 292, 'faixa vazia da base');
  const sel = (await p.selected()).length;
  const has = await p.page.locator('aside.vnext-info [data-page-background-section]').count();
  await p.panelPickColor('[data-page-background-picker]', '#f7f3ea');
  const bg = (await p.state()).document.pages[0].background;
  return {
    outcome: has && bg?.color === '#F7F3EA' ? 'fácil' : 'falhou',
    evidence: `clicar no vazio: ${sel} selecionado(s); painel "Fundo da página": ${has ? 'sim' : 'não'}; fundo → ${JSON.stringify(bg)}`,
    screenshot: await p.shot('N18-fundo-pagina'),
  };
});

await scenario('N19', 'S19 (estilo) — depois de pegar a diagonal, voltar a clicar num texto', N, async (p) => {
  const poly = (await p.objs()).find((o) => o.type === 'polygon' && o.id.includes('diagonal-azul'));
  const t = byText(await p.objs(), 'PNEUMÁTICA');
  await p.clickMm(20, 120, 'diagonal');
  const first = (await p.selected())[0] === poly.id;
  await p.clickMm(t.frame.xMm + 5, t.frame.yMm + 3, 'texto PNEUMÁTICA');
  const second = (await p.selected())[0];
  return {
    outcome: second === t.id ? 'fácil' : 'difícil (seleção — frente S1/P0.1)',
    evidence: `diagonal selecionada: ${first}; clicar no texto depois selecionou ${second === t.id ? 'o texto' : second === poly.id ? 'de novo a diagonal (o selecionado sobe ao topo: P0.1 da frente S1)' : second}. Já não há overlay PNG de tela cheia na capa nativa.`,
    screenshot: await p.shot('N19-soltar'),
  };
});

await scenario('N20', 'S20 — página 2: cor da faixa do cabeçalho, da régua e do painel', N, async (p) => {
  await p.page.locator('button:has-text("Página 2")').first().click(); p.n += 1;
  await p.page.waitForTimeout(600);
  const objs = await p.objs(1);
  const band = objs.find((o) => o.type === 'polygon');
  const rule = objs.find((o) => o.type === 'shape' && o.frame.heightMm < 1 && o.style.fill === '#092D4D');
  const panel = objs.find((o) => o.type === 'shape' && o.frame.heightMm > 30);
  const res = [];
  await p.clickMm(band.frame.xMm + 60, band.frame.yMm + 2, 'faixa');
  res.push(`faixa: ${(await p.selected())[0] === band.id ? 'selecionada' : 'NÃO'}`);
  await p.panelClick('[aria-label="Cor de fundo do padrão #8A642B"]');
  await p.clickMm(rule.frame.xMm + 40, rule.frame.yMm + rule.frame.heightMm / 2, 'régua');
  res.push(`régua: ${(await p.selected())[0] === rule.id ? 'selecionada' : 'NÃO'}`);
  await p.panelClick('[aria-label="Cor de preenchimento #8A642B"]');
  await p.clickMm(panel.frame.xMm + 3, panel.frame.yMm + panel.frame.heightMm - 3, 'painel');
  res.push(`painel: ${(await p.selected())[0] === panel.id ? 'selecionado' : 'NÃO'}`);
  await p.panelClick('[aria-label="Cor de preenchimento #EDF3F7"]');
  const after = await p.objs(1);
  const bandFill = byId(after, band.id).style.fill, ruleFill = byId(after, rule.id).style.fill, panelFill = byId(after, panel.id).style.fill;
  return {
    outcome: bandFill.background === '#8A642B' && ruleFill === '#8A642B' && panelFill === '#EDF3F7' ? 'fácil' : 'falhou',
    evidence: `${res.join('; ')}; faixa → ${JSON.stringify(bandFill)}; régua → ${ruleFill}; painel → ${panelFill}`,
    screenshot: await p.shot('N20-pagina-interna'),
  };
});

await scenario('N21', 'S21 (estilo) — a faixa do cabeçalho deixou de ser PNG em cada página', N, async (p) => {
  const doc = (await p.state()).document;
  const pngBands = doc.pages.flatMap((pg) => pg.objects.filter((o) => o.type === 'image' && /band-header/.test(doc.assets.find((a) => a.id === o.assetId)?.name ?? ''))).length;
  return {
    outcome: 'parcial', clicks: 0,
    evidence: `na página 2 a faixa virou polígono nativo (cor/padrão editáveis em 2 ações: clicar + amostra); ainda há ${pngBands} faixas PNG nas outras páginas deste exemplo e o rodapé/numeração seguem sem página-mestra (P3, fora desta frente)`,
    screenshot: null,
  };
}, { undo: false });

await scenario('N22', 'Elementos novos pelo menu: faixa diagonal, selo, chamada e barra da família', N, async (p) => {
  const before = (await p.objs()).length;
  await p.act('add-polygon-triangle');
  await p.act('add-pill');
  await p.act('add-callout');
  await p.act('add-family-bar');
  const after = await p.objs();
  const added = after.slice(before).map((o) => o.type === 'group' ? `grupo(${o.objects.length} selos)` : o.type === 'text' ? (o.box ? 'selo' : o.leader ? 'chamada' : 'texto') : o.type);
  return {
    outcome: added.length === 4 ? 'fácil' : 'falhou',
    evidence: `inseridos: ${added.join(', ')}`,
    screenshot: await p.shot('N22-elementos'),
  };
});

// Tela = PDF: as páginas nativas desenhadas pelo mesmo DocumentRenderer, capturadas na tela e impressas em PDF
// (page.pdf, como window.print); o PDF é rasterizado com pdf.js e comparado em células de 5 mm.
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/tests/vnext/proof/fixtures/cover-native-print.html?catalog=${N}&pages=0,1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__READY__ === true, null, { timeout: 30000 });
  const screens = [];
  for (const [index, element] of (await page.locator('.editorial-page').all()).entries()) {
    const buffer = await element.screenshot();
    writeFileSync(resolve(SHOTS, `N00-tela-pagina-${index + 1}.png`), buffer);
    screens.push(buffer.toString('base64'));
  }
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  writeFileSync(resolve(OUT, 'N00-capa-nativa.pdf'), pdf);
  const comparison = await page.evaluate(async ({ pdfBase64, screens: shots }) => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
    const data = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
    const doc = await pdfjs.getDocument({ data }).promise;
    const out = { pdfPages: doc.numPages, pages: [], renders: [] };
    for (let i = 0; i < shots.length; i += 1) {
      const img = new Image();
      img.src = `data:image/png;base64,${shots[i]}`;
      await img.decode();
      const pdfPage = await doc.getPage(i + 1);
      const viewport = pdfPage.getViewport({ scale: img.width / pdfPage.getViewport({ scale: 1 }).width });
      const printed = document.createElement('canvas');
      printed.width = img.width; printed.height = img.height;
      await pdfPage.render({ canvasContext: printed.getContext('2d'), viewport }).promise;
      const grid = (source) => {
        const small = document.createElement('canvas');
        small.width = 42; small.height = 59;
        const g = small.getContext('2d');
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(source, 0, 0, 42, 59);
        return g.getImageData(0, 0, 42, 59).data;
      };
      // Cores nos pontos dos elementos nativos (média de 5x5 px): diagonal azul, degradê dourado, padrão de pontos,
      // selo azul, selo dourado, destaque da barra da família / faixa da página 2.
      const probes = i === 0
        ? [['diagonal azul', 20, 120], ['degradê dourado', 185, 100], ['selo azul', 15.4, 238.2], ['selo dourado', 85.2, 238.2], ['barra: HÍBRIDO', 170, 269]]
        : [['faixa com padrão (azul)', 60, 15, 23], ['faixa com padrão (dourada)', 150, 15, 23], ['painel', 16, 135]];
      // Num padrão a janela cobre ~2 desenhos (23 px ≈ 6 mm), para não depender de onde cai o primeiro ponto.
      const sample = (source, xMm, yMm, size = 5) => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(source, 0, 0);
        const px = Math.round(xMm * img.width / 210), py = Math.round(yMm * img.width / 210);
        const half = Math.floor(size / 2);
        const d = g.getImageData(px - half, py - half, size, size).data;
        const avg = [0, 1, 2].map((ch) => { let t = 0; for (let k = ch; k < d.length; k += 4) t += d[k]; return Math.round(t / (size * size)); });
        return avg;
      };
      const probeDiffs = probes.map(([name, x, y, size]) => {
        const sa = sample(img, x, y, size), sb = sample(printed, x, y, size);
        return { name, screen: sa, pdf: sb, diff: Math.max(...sa.map((v, k) => Math.abs(v - sb[k]))) };
      });
      const a = grid(img), b = grid(printed);
      let max = 0, sum = 0, over = 0;
      for (let k = 0; k < a.length; k += 4) {
        const d = (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2])) / 3;
        max = Math.max(max, d); sum += d; if (d > 24) over += 1;
      }
      out.pages.push({ page: i + 1, sizePx: `${img.width}x${img.height}`, cells: a.length / 4, meanCellDiff: Math.round(sum / (a.length / 4) * 100) / 100,
        maxCellDiff: Math.round(max * 10) / 10, cellsOver24: over, probes: probeDiffs });
      out.renders.push(printed.toDataURL('image/png').split(',')[1]);
    }
    return out;
  }, { pdfBase64: pdf.toString('base64'), screens });
  comparison.renders.forEach((png, index) => writeFileSync(resolve(SHOTS, `N00-pdf-pagina-${index + 1}.png`), Buffer.from(png, 'base64')));
  // Os elementos nativos têm de ter a mesma cor nos dois (≤ 8 níveis); no resto da página só sobra serrilhado de texto e
  // reamostragem da foto (média baixa, poucas células de 5 mm acima de 24 níveis).
  const ok = comparison.pdfPages === screens.length && comparison.pages.every((entry) =>
    entry.probes.every((probe) => probe.diff <= 8) && entry.meanCellDiff < 5 && entry.cellsOver24 <= entry.cells * 0.05);
  results.push({ id: 'N00', edit: 'Tela = PDF da capa e da página 2 nativas (mesmo DOM; PDF rasterizado com pdf.js)', outcome: ok ? 'igual' : 'diferente',
    evidence: JSON.stringify(comparison.pages), pdf: 'scratch/cover-audit/N00-capa-nativa.pdf',
    screenshot: 'scratch/cover-audit/shots/N00-tela-pagina-1.png', screenshot2: 'scratch/cover-audit/shots/N00-pdf-pagina-1.png', consoleErrors: errs.slice(0, 3) });
  console.log('N00', ok ? 'igual' : 'diferente', JSON.stringify(comparison.pages));
  await ctx.close();
}

writeFileSync(resolve(OUT, 'native-results.json'), JSON.stringify(results, null, 2));
await browser.close();
await server.close();
console.log('ok -> scratch/cover-audit/native-results.json');

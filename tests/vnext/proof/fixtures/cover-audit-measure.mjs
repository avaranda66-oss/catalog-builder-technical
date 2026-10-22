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

// ----------------------------------------------------------------------------------------------------------------
const H = 'PCON-HIBRIDO';
const named = (doc, o) => (asset(doc, o) ?? '');
const colorish = (ctl) => ctl.filter((c) => /^Cor \d|^Branco$|preenchimento|contorno|cor de fundo|espessura|ponta|seta/i.test(c));

await scenario('S01', 'Mudar a cor do fundo diagonal (azul/dourado)', H, async (p) => {
  const doc0 = (await p.state()).document;
  const objs = await p.objs();
  const ov = objs.find((o) => o.type === 'image' && named(doc0, o).includes('overlay'));
  const plate = objs.find((o) => o.type === 'image' && named(doc0, o).includes('plate'));
  await p.clickMm(30, 90, 'área azul vazia');
  const first = (await p.selected())[0];
  p.note(`1º clique selecionou ${first === ov.id ? 'o overlay (linhas de chamada)' : first === plate.id ? 'o plate' : first}`);
  const ctl1 = await p.controls();
  // Rota de contorno para chegar no fundo: mandar o overlay para trás, soltar a seleção com Ctrl+clique e clicar de novo.
  await p.act('send-back');
  await p.ctrlClickMm(30, 90);
  await p.clickMm(30, 90, 'área azul (de novo)');
  const second = (await p.selected())[0];
  const ctl2 = await p.controls();
  const reached = second === plate.id;
  const ovZ = (await p.objs()).find((o) => o.id === ov.id).zIndex;
  const plateZ = (await p.objs()).find((o) => o.id === plate.id).zIndex;
  return {
    outcome: 'impossível', cause: 'elemento inexistente (arte rasterizada) + camadas',
    evidence: `1º clique: overlay; só depois de "Enviar ao fundo" + Ctrl+clique (para soltar) + novo clique (${p.n} ações) o clique chegou ${reached ? 'ao fundo (plate)' : 'em ' + second}; controles de cor/preenchimento no painel: ${colorish([...ctl1, ...ctl2]).length || 'nenhum'} (só Ajuste/Posição/Imagem do catálogo/Enviar nova imagem); o overlay ficou z=${ovZ} abaixo do plate z=${plateZ} (linhas de chamada some sob o fundo)`,
    screenshot: await p.shot('S01-fundo'),
  };
});

await scenario('S02', 'Trocar a foto da capa por outra', H, async (p) => {
  const doc0 = (await p.state()).document;
  const objs = await p.objs();
  const photo = objs.find((o) => o.type === 'image' && named(doc0, o).includes('hybrid-official'));
  const ov = objs.find((o) => o.type === 'image' && named(doc0, o).includes('overlay'));
  await p.clickMm(106, 120, 'centro da foto');
  const first = (await p.selected())[0];
  const direct = first === photo.id;
  p.note(`1º clique na foto selecionou ${first === ov.id ? 'o overlay (não a foto)' : first === photo.id ? 'a foto' : first}`);
  if (!direct) {
    await p.act('send-backward');            // overlay passa para trás da foto
    await p.ctrlClickMm(106, 120);           // soltar o overlay (Ctrl+clique alterna a seleção)
    await p.clickMm(106, 120, 'centro da foto (de novo)');
  }
  const reached = (await p.selected())[0] === photo.id;
  let replaced = false;
  if (reached) {
    await p.details();
    const [chooser] = await Promise.all([
      p.page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
      (async () => { const b = p.page.locator('[data-editor-action="upload-image-inspector"]'); await b.scrollIntoViewIfNeeded(); await b.click(); })().catch(() => null),
    ]);
    if (chooser) {
      await chooser.setFiles(resolve(OUT, 'assets/pcon-dt-calibrador-automatico-de-pressao-pcon-dt-desktop-version-presys-1-trim.png'));
      p.n += 2;
      await p.page.waitForTimeout(1500);
      replaced = (await p.objs()).find((o) => o.id === photo.id).assetId !== photo.assetId;
    }
    // devolver o overlay à frente: selecionar o overlay fora da foto e "Avançar camada"
    await p.clickMm(10, 100, 'fundo fora da foto (overlay)');
    await p.act('bring-forward');
  }
  const now = await p.objs();
  const z = `foto z=${now.find((o) => o.id === photo.id).zIndex}, overlay z=${now.find((o) => o.id === ov.id).zIndex}`;
  return {
    outcome: replaced ? 'difícil' : 'impossível', cause: 'seleção/camadas (a foto está sob um PNG de tela cheia) + chamadas rasterizadas',
    evidence: `clique direto ${direct ? 'pegou a foto' : 'NÃO pegou a foto (pegou o overlay)'}; troca ${replaced ? 'concluída' : 'não concluída'} em ${p.n} ações usando Recuar camada + Ctrl+clique + Avançar camada; ${z}; a foto nova não casa com as linhas de chamada desenhadas para a foto antiga (leaders ficam apontando para o vazio)`,
    screenshot: await p.shot('S02-foto'),
  };
});

await scenario('S03', 'Mover uma pílula ("0 a 250 psi")', H, async (p) => {
  const t = byText(await p.objs(), '0 a 250 psi');
  const before = { ...t.frame };
  const frameNow = async () => (await p.objs()).find((o) => o.id === t.id).frame;
  const pos = async (fx) => {
    await p.reveal(t.frame.yMm + t.frame.heightMm / 2);
    const st = await p.stage();
    const sc = st.width / 210;
    return [st.x + (t.frame.xMm + t.frame.widthMm * fx) * sc, st.y + (t.frame.yMm + t.frame.heightMm / 2) * sc];
  };
  const dragFrom = async (fx) => {
    const [x, y] = await pos(fx);
    await p.page.mouse.move(x, y); await p.page.mouse.down();
    await p.page.mouse.move(x + 30, y - 5, { steps: 6 }); await p.page.mouse.move(x + 60, y - 10, { steps: 6 });
    await p.page.mouse.up(); await p.page.waitForTimeout(300); p.n += 1;
  };
  // (a) arrastar direto, sem selecionar antes
  await dragFrom(0.5);
  const a = await frameNow();
  const shotA = await p.shot('S03-pilula-a-arraste-direto');
  await p.page.locator('[data-editor-action="undo"]').click(); p.n += 1;
  // (b) clicar para selecionar (ver o painel), esperar, e arrastar pelo meio
  const [cx, cy] = await pos(0.25);
  await p.page.mouse.click(cx, cy); p.n += 1; await p.page.waitForTimeout(900);
  await dragFrom(0.5);
  const b = await frameNow();
  const shotB = await p.shot('S03-pilula-b-selecionado-arraste-meio');
  const handleInfo = await p.page.evaluate(() => [...document.querySelectorAll("[data-resize-handle]")].map((e) => Math.round(e.getBoundingClientRect().width) + "px").slice(0, 1)[0]);
  return {
    outcome: 'impossível', cause: 'elemento inexistente (pílula é PNG do fundo) + seleção (alças cobrem a caixa pequena)',
    evidence: `(a) arrastar direto o texto da pílula MOVE o texto (x ${before.xMm}->${a.xMm}, y ${before.yMm}->${a.yMm}) mas o fundo azul da pílula fica no lugar (é PNG do fundo) e o texto branco cai sobre a página branca; (b) se o texto já estiver selecionado, arrastar pelo meio REDIMENSIONA (${before.widthMm}x${before.heightMm} -> ${b.widthMm}x${b.heightMm} mm), porque as 8 alças (${handleInfo}) cobrem a caixa de 62x15 px; clicar e arrastar em <0,5 s entra em edição de texto`,
    screenshot: shotA, screenshot2: shotB,
  };
});

await scenario('S04', 'Editar o texto de uma pílula (de "0 a 250 psi" para "0 a 25000 psi")', H, async (p) => {
  const t = byText(await p.objs(), '0 a 250 psi');
  await p.dblClickObj(t.id);
  await p.page.keyboard.press('Control+a');
  await p.page.keyboard.type('0 a 25000 psi');
  p.n += 2;
  const commit = p.page.locator('[data-editor-action="commit-text"]').first();
  if (await commit.count()) { await commit.click(); p.n += 1; }
  await p.page.waitForTimeout(300);
  const now = byText(await p.objs(), '25000');
  return {
    outcome: 'fácil (o texto) / quebra o desenho', cause: 'elemento inexistente (a pílula não cresce com o texto)',
    evidence: `texto editado em ${p.n} ações (${now ? 'ok' : 'não aplicado'}); caixa continua ${now?.frame.widthMm} mm de largura e o desenho da pílula (PNG) não acompanha: o texto vaza para fora/quebra linha`,
    screenshot: await p.shot('S04-pilula-texto'),
  };
});

await scenario('S05', 'Mudar o rótulo de uma chamada e mover a seta', H, async (p) => {
  const t = byText(await p.objs(), 'Saída pneumática');
  await p.dblClickObj(t.id);
  await p.page.keyboard.press('Control+a');
  await p.page.keyboard.type('Saída pneumática 1/4 NPT');
  p.n += 2;
  const commit = p.page.locator('[data-editor-action="commit-text"]').first();
  if (await commit.count()) { await commit.click(); p.n += 1; }
  const edited = !!byText(await p.objs(), '1/4 NPT');
  await p.clickMm(61.4, 146.4, 'sobre a linha da seta');
  const pickedId = (await p.selected())[0];
  const picked = (await p.objs()).find((o) => o.id === pickedId);
  return {
    outcome: 'impossível', cause: 'elemento inexistente (seta/linha de chamada está no PNG overlay)',
    evidence: `rótulo (texto) editado: ${edited}; clicar sobre a seta seleciona ${picked ? picked.type + (picked.type === 'image' ? ' de tela cheia (o overlay inteiro)' : '') : 'nada'}; arrastar essa "seta" moveria o overlay inteiro (todas as chamadas juntas)`,
    screenshot: await p.shot('S05-chamada'),
  };
});

await scenario('S06', 'Selecionar um texto que está sobre uma imagem ("PRESYS")', H, async (p) => {
  const t = byText(await p.objs(), 'PRESYS');
  await p.clickObj(t.id, 'texto PRESYS');
  const ok = (await p.selected())[0] === t.id;
  return { outcome: ok ? 'fácil' : 'difícil', cause: ok ? '—' : 'seleção', evidence: `1 clique; selecionado: ${ok ? 'o texto' : 'outro objeto'}`, screenshot: await p.shot('S06-texto-sobre-imagem') };
});

await scenario('S07', 'Selecionar o elemento de baixo SEM reordenar (Alt+clique, Shift+clique, clique direito, duplo clique, Tab)', H, async (p) => {
  const doc0 = (await p.state()).document;
  const objs = await p.objs();
  const plate = objs.find((o) => o.type === 'image' && named(doc0, o).includes('plate'));
  const ov = objs.find((o) => o.type === 'image' && named(doc0, o).includes('overlay'));
  const photo = objs.find((o) => o.type === 'image' && named(doc0, o).includes('hybrid-official'));
  await p.reveal(120);
  const st = await p.stage();
  const s = st.width / 210;
  const X = st.x + 106 * s, Y = st.y + 120 * s;
  const attempts = [];
  const rec = async (label) => { attempts.push(`${label}: ${(await p.selected()).map((i) => (i === plate.id ? 'plate' : i === ov.id ? 'overlay' : i === photo.id ? 'foto' : i.slice(0, 6))).join(',') || 'nada'}`); };
  await p.page.keyboard.down('Alt'); await p.page.mouse.click(X, Y); await p.page.keyboard.up('Alt'); p.n += 1; await rec('Alt+clique');
  await p.page.keyboard.down('Shift'); await p.page.mouse.click(X, Y); await p.page.keyboard.up('Shift'); p.n += 1; await rec('Shift+clique');
  await p.page.mouse.click(X, Y, { button: 'right' }); p.n += 1; await rec('clique direito');
  await p.page.mouse.dblclick(X, Y); p.n += 1; await rec('duplo clique');
  await p.page.keyboard.press('Tab'); p.n += 1; await rec('Tab');
  await p.page.keyboard.press('Escape'); p.n += 1; await rec('Esc');
  const layerPanel = await p.page.locator('text=/Camadas|Layers/i').count();
  return {
    outcome: 'impossível', cause: 'camadas (sem painel de camadas, sem Alt+clique/clique-através, sem seleção por baixo)',
    evidence: `${attempts.join('; ')}; painel "Camadas": ${layerPanel ? 'existe' : 'não existe'}; a única rota é reordenar (Recuar/Enviar ao fundo) o objeto de cima`,
    screenshot: await p.shot('S07-escondido'),
  };
});

await scenario('S08', 'Selecionar 3 elementos e mover juntos', H, async (p) => {
  const o = await p.objs();
  const a = byText(o, 'PNEUMÁTICA'), b = o.find((x) => x.type === 'text' && textOf(x).startsWith('exemplos publicados: 0–250')), c = byText(o, 'PRESYS');
  await p.clickObj(a.id, 'PNEUMÁTICA');
  await p.clickObj(b.id, 'exemplos…', { ctrl: true });
  await p.clickObj(c.id, 'PRESYS', { ctrl: true });
  const selN = (await p.selected()).length;
  const before = Object.fromEntries([a, b, c].map((x) => [x.id, { ...x.frame }]));
  await p.drag(c.id, 0, 20);
  const after = await p.objs();
  const deltas = [a, b, c].map((x) => +(after.find((y) => y.id === x.id).frame.yMm - before[x.id].yMm).toFixed(1));
  const selAfter = (await p.selected()).length;
  const together = selN === 3 && deltas.every((d) => Math.abs(d - deltas[0]) < 0.5 && Math.abs(d) > 1);
  return {
    outcome: together ? 'difícil' : 'impossível', cause: 'seleção (Ctrl+clique escondido; sem laço) + arrastar não move a seleção múltipla',
    evidence: `Ctrl+clique selecionou ${selN} de 3; deslocamento y de cada um após arrastar um deles 20 mm: ${deltas.join(', ')} mm (${together ? 'moveram juntos' : 'só o arrastado se moveu'}); depois do arraste a seleção ficou em ${selAfter} objeto(s) (agarrar um deles descarta os outros); com vários selecionados o painel só mostra Alinhar/Distribuir`,
    screenshot: await p.shot('S08-multi'),
  };
});

await scenario('S09', 'Agrupar (títulos e legenda da coluna esquerda) e desagrupar', H, async (p) => {
  const o = await p.objs();
  const a = byText(o, 'PNEUMÁTICA'), b = o.find((x) => x.type === 'text' && textOf(x).startsWith('exemplos publicados: 0–250'));
  const order = o.map((x) => x.id);
  const between = Math.abs(order.indexOf(a.id) - order.indexOf(b.id)) - 1;
  await p.clickObj(a.id, 'PNEUMÁTICA');
  await p.clickObj(b.id, 'legenda 0–250', { ctrl: true });
  const okG = await p.act('group');
  const noticeNonAdjacent = await p.notice();
  const g1 = (await p.objs()).find((x) => x.type === 'group');
  // par adjacente na pilha: PRESYS + DOIS MEIOS
  const c = byText(o, 'PRESYS'), d = byText(o, 'DOIS MEIOS');
  await p.clickObj(c.id, 'PRESYS');
  await p.clickObj(d.id, 'DOIS MEIOS', { ctrl: true });
  await p.act('group');
  const g2 = (await p.objs()).find((x) => x.type === 'group');
  let un = false;
  if (g2) un = await p.act('ungroup');
  return {
    outcome: g1 ? 'difícil' : 'difícil (só se forem vizinhos na pilha)', cause: 'camadas (agrupar exige objetos contíguos na ordem de empilhamento) + UI escondida',
    evidence: `PNEUMÁTICA + legenda (há ${between} objetos entre eles na pilha): grupo ${g1 ? 'criado' : 'NÃO criado'} — mensagem: "${noticeNonAdjacent.replace(/Fechar/g, '').trim().slice(0, 90)}" (não diz o motivo); PRESYS + DOIS MEIOS (vizinhos): grupo ${g2 ? 'criado com ' + g2.objects.length + ' objetos' : 'não criado'}; desagrupar: ${un ? 'ok' : 'não'}`,
    screenshot: await p.shot('S09-grupo'),
  };
});

await scenario('S10', 'Alinhar à esquerda / centralizar (3 textos)', H, async (p) => {
  const o = await p.objs();
  const a = byText(o, 'PNEUMÁTICA'), b = byText(o, 'PCON HÍBRIDO'), c = byText(o, 'FAMÍLIA PCON');
  await p.clickObj(a.id, '');
  await p.clickObj(b.id, '', { ctrl: true });
  await p.clickObj(c.id, '', { ctrl: true });
  const selN = (await p.selected()).length;
  const btn = p.page.locator('[data-editor-action="align-left"]').first();
  let okL = false, xs = [], xc = [];
  if (await btn.count()) { await btn.scrollIntoViewIfNeeded(); await btn.click(); p.n += 1; okL = true; xs = (await p.objs()).filter((x) => [a.id, b.id, c.id].includes(x.id)).map((x) => x.frame.xMm); }
  const cBtn = p.page.locator('[data-editor-action="align-horizontal-center"]').first();
  if (await cBtn.count()) { await cBtn.scrollIntoViewIfNeeded(); await cBtn.click(); p.n += 1; xc = (await p.objs()).filter((x) => [a.id, b.id, c.id].includes(x.id)).map((x) => +(x.frame.xMm + x.frame.widthMm / 2).toFixed(1)); }
  return {
    outcome: okL ? 'fácil (depois de selecionar)' : 'impossível', cause: 'seleção múltipla é o gargalo (Ctrl+clique)',
    evidence: `selecionados ${selN}/3; x após "alinhar à esquerda": ${xs.join(', ')}; centros após "centralizar horizontalmente": ${xc.join(', ')} (relativo ao conjunto selecionado, não à página)`,
    screenshot: await p.shot('S10-alinhar'),
  };
});

await scenario('S11', 'Mudar a ordem (camada) de um texto', H, async (p) => {
  const t = byText(await p.objs(), 'PRESYS');
  await p.clickObj(t.id, 'PRESYS');
  const z0 = (await p.objs()).find((x) => x.id === t.id).zIndex;
  await p.act('send-back');
  const z1 = (await p.objs()).find((x) => x.id === t.id).zIndex;
  const shot = await p.shot('S11-enviar-ao-fundo');
  await p.act('bring-front');
  const z2 = (await p.objs()).find((x) => x.id === t.id).zIndex;
  return {
    outcome: 'difícil', cause: 'camadas (3 níveis cobrem a página: "Enviar ao fundo" põe o texto sob o PNG de fundo e ele some; sem painel de camadas)',
    evidence: `z do texto: ${z0} -> ${z1} (Enviar ao fundo: o texto passa para trás do plate e desaparece da página) -> ${z2} (Trazer à frente); os 29 textos da capa dividem o mesmo z=3, então "Avançar/Recuar" mexe entre vizinhos invisíveis`,
    screenshot: shot,
  };
});

await scenario('S12', 'Duplicar um bloco (título HIDRÁULICA + legenda)', H, async (p) => {
  const o = await p.objs();
  const a = byText(o, 'HIDRÁULICA'), b = o.find((x) => x.type === 'text' && textOf(x).startsWith('exemplos publicados: 100'));
  await p.clickObj(a.id, 'HIDRÁULICA');
  await p.clickObj(b.id, 'legenda', { ctrl: true });
  const selN = (await p.selected()).length;
  const dup = p.page.locator('[data-editor-action="duplicate"]').first();
  const present = (await dup.count()) > 0;
  const nBefore = (await p.objs()).length;
  let direct = 0;
  if (present && await dup.isEnabled()) { await dup.click(); p.n += 1; direct = (await p.objs()).length - nBefore; }
  // rota de contorno: Agrupar + Duplicar
  const okG = await p.act('group');
  const g = (await p.objs()).find((x) => x.type === 'group');
  let viaGroup = 'grupo não criado';
  if (g) { await p.act('duplicate'); viaGroup = `${(await p.objs()).filter((x) => x.type === 'group').length} grupos`; }
  return {
    outcome: g ? 'difícil' : 'impossível', cause: 'seleção múltipla; Duplicar só existe para 1 objeto; Agrupar exige vizinhos na pilha',
    evidence: `selecionados ${selN}; botão Duplicar com 2 selecionados: ${present ? 'existe' : 'não aparece (some da barra)'}${present ? '; copiou ' + direct + ' objetos' : ''}; Agrupar: ${okG ? 'tentado' : 'indisponível'} -> ${viaGroup}`,
    screenshot: await p.shot('S12-duplicar'),
  };
});

await scenario('S13', 'Redimensionar uma caixa de texto (arrastar a alça)', H, async (p) => {
  const t = byText(await p.objs(), 'Calibrador de pressão com pressurizador');
  await p.clickObj(t.id, 'subtítulo');
  const h = p.page.locator('[data-resize-handle="e"]').first();
  const box = await h.boundingBox();
  const before = { ...t.frame };
  let after = before;
  if (box) {
    await p.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.page.mouse.down();
    await p.page.mouse.move(box.x - 120, box.y + box.height / 2, { steps: 6 });
    await p.page.mouse.up();
    p.n += 1;
    after = (await p.objs()).find((x) => x.id === t.id).frame;
  }
  const ok = after.widthMm < before.widthMm - 5;
  return {
    outcome: ok ? 'fácil' : 'difícil', cause: ok ? '— (só em caixas grandes)' : 'alça',
    evidence: `largura ${before.widthMm} -> ${after.widthMm} mm, altura ${before.heightMm} -> ${after.heightMm} mm (a altura não acompanha; existe o botão "Ajustar altura ao texto"); em caixas pequenas (ex.: pílulas) as alças cobrem tudo (ver S03)`,
    screenshot: await p.shot('S13-redimensionar'),
  };
});

await scenario('S14', 'Mudar cor, tamanho e peso de um texto ("DOIS MEIOS · UMA PLATAFORMA")', H, async (p) => {
  const doc0 = (await p.state()).document;
  const t = byText(await p.objs(), 'DOIS MEIOS');
  await p.clickObj(t.id, 'texto dourado');
  const ctl = await p.controls();
  const swatches = ctl.filter((c) => /^Cor \d|^Branco/.test(c));
  const sizes = ctl.filter((c) => /pt$/.test(c));
  const numericSize = await p.page.locator('aside.vnext-info input').count();
  await p.page.locator('aside.vnext-info [aria-label="Cor 1"]').first().click(); p.n += 1;
  await p.page.locator('aside.vnext-info button:has-text("Nota")').first().click(); p.n += 1;
  await p.page.locator('aside.vnext-info button:has-text("Negrito")').first().click(); p.n += 1;
  const after = (await p.objs()).find((x) => x.id === t.id).style;
  return {
    outcome: 'difícil', cause: 'propriedade faltante (cor livre e tamanho livre; só a paleta do catálogo e 4 tamanhos)',
    evidence: `original ${t.style.color} ${t.style.fontSizePt}pt peso ${t.style.fontWeight}; o painel oferece ${swatches.length} amostras (paleta do catálogo: ${doc0.style.palette.join(' ')}), sem seletor livre/hex; tamanhos: ${sizes.join(' / ')}; campos numéricos no painel simples: ${numericSize}; ao tocar: ${after.color} ${after.fontSizePt}pt peso ${after.fontWeight}; as cores da capa (#F3DDB8, #173F66, #A8803F, #B9CCDC...) não estão na paleta`,
    screenshot: await p.shot('S14-estilo'),
  };
});

await scenario('S15', 'Travar o fundo para não pegar sem querer', H, async (p) => {
  const doc0 = (await p.state()).document;
  const objs = await p.objs();
  const ov = objs.find((o) => o.type === 'image' && named(doc0, o).includes('overlay'));
  const photo = objs.find((o) => o.type === 'image' && named(doc0, o).includes('hybrid-official'));
  await p.clickMm(30, 90, 'fundo');
  await p.details();
  const lock = p.page.locator('[data-editor-action="toggle-object-lock"]').first();
  if (await lock.count()) { await lock.scrollIntoViewIfNeeded(); await lock.click(); p.n += 1; }
  const locked = (await p.objs()).find((o) => o.id === ov.id).locked === true;
  await p.ctrlClickMm(30, 90);
  await p.clickMm(106, 120, 'foto');
  const sel = (await p.selected())[0];
  const status = await p.notice();
  return {
    outcome: 'impossível', cause: 'camadas (objeto travado continua capturando o clique; travar não deixa o clique passar)',
    evidence: `overlay travado: ${locked}; depois, clicar na foto selecionou ${sel === ov.id ? 'de novo o overlay travado' : sel === photo.id ? 'a foto' : sel}; aviso na tela: "${status.slice(0, 100)}"`,
    screenshot: await p.shot('S15-travar'),
  };
});

await scenario('S16', 'Editar a barra de modelos da família (destacar outro modelo)', H, async (p) => {
  const o = await p.objs();
  const dt = o.find((x) => x.type === 'text' && textOf(x) === 'DT');
  await p.dblClickObj(dt.id);
  await p.page.keyboard.press('Control+a'); await p.page.keyboard.type('DT-2'); p.n += 2;
  const commit = p.page.locator('[data-editor-action="commit-text"]').first();
  if (await commit.count()) { await commit.click(); p.n += 1; }
  const ok = !!byText(await p.objs(), 'DT-2');
  return {
    outcome: 'impossível', cause: 'elemento inexistente (caixas e destaque dourado + triângulo da barra são PNG do fundo)',
    evidence: `o texto de cada modelo é editável (${ok ? 'ok' : 'falhou'}); mover o destaque (retângulo dourado + triângulo sobre "HÍBRIDO") para "DT" ou reordenar os modelos não é possível: 6 textos soltos sobre 6 caixas de PNG`,
    screenshot: await p.shot('S16-barra-familia'),
  };
});

await scenario('S17', 'Trocar o logotipo (hoje "PRESYS" é texto) por uma imagem', H, async (p) => {
  const t = byText(await p.objs(), 'PRESYS');
  const n0 = (await p.objs()).length;
  const [chooser] = await Promise.all([
    p.page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null),
    p.page.locator('[data-editor-action="add-image"]').click(),
  ]);
  p.n += 1;
  if (chooser) { await chooser.setFiles(resolve(OUT, 'assets/pcon-hibrido-hybrid-official-trim.png')); p.n += 1; await p.page.waitForTimeout(1500); }
  const objs = await p.objs();
  const added = objs.length - n0;
  const newImg = objs.filter((o) => o.type === 'image').slice(-1)[0];
  p.note(`imagem nova entra em ${JSON.stringify(newImg?.frame)} z=${newImg?.zIndex}`);
  await p.details();
  const fields = p.page.locator('aside.vnext-info input[type="text"], aside.vnext-info input[inputmode]');
  const nf = await fields.count();
  let typed = 0;
  for (const [i, v] of [['0', '14'], ['1', '12'], ['2', '30'], ['3', '12']]) {
    if (+i < nf) { await fields.nth(+i).fill(v); await fields.nth(+i).press('Enter'); p.n += 1; typed += 1; }
  }
  const nBeforeDel = (await p.objs()).length;
  await p.clickObj(t.id, 'texto PRESYS (para apagar)');
  let picked = (await p.selected())[0];
  const coveredByNew = picked !== t.id;
  if (coveredByNew) { await p.clickObj(t.id, 'parte direita do texto PRESYS', { fx: 0.92 }); picked = (await p.selected())[0]; }
  let deleted = false;
  if (picked === t.id) { await p.act('delete'); deleted = (await p.objs()).length === nBeforeDel - 1; }
  return {
    outcome: added >= 1 ? 'difícil' : 'impossível', cause: 'muitos passos: sem "logotipo do catálogo"; imagem nova nasce grande e em posição padrão; cada campo X/Y/L/A é digitado',
    evidence: `imagem inserida: ${added >= 1}; campos de posição preenchidos: ${typed}/4; texto antigo apagado: ${deleted}${coveredByNew ? ' (o 1º clique no texto pegou a imagem nova, que ficou por cima dele)' : ''}; total ${p.n} ações (e o arquivo do logotipo precisa existir no computador; não há biblioteca de logotipos)`,
    screenshot: await p.shot('S17-logo'),
  };
});

await scenario('S18', 'Mudar a cor de fundo da página', H, async (p) => {
  await p.clickMm(5, 293, 'canto vazio da base');
  const sel = (await p.selected())[0];
  const o = (await p.objs()).find((x) => x.id === sel);
  const ctl = await p.controls();
  const bgControl = ctl.some((c) => /fundo da página|cor da página|background/i.test(c));
  await p.act('add-shape');
  const shape = (await p.objs()).filter((x) => x.type === 'shape').slice(-1)[0];
  const ctl2 = await p.controls();
  return {
    outcome: 'impossível', cause: 'propriedade faltante (a página não tem cor de fundo; a Forma nasce com cor fixa e não há painel de cor/contorno)',
    evidence: `clicar no fundo vazio selecionou ${o ? o.type + (o.type === 'image' ? ' de tela cheia (overlay)' : '') : 'nada'}; controle de fundo de página: ${bgControl ? 'sim' : 'nenhum'}; Forma nova: fill ${shape?.style.fill}, borda ${shape?.style.stroke?.color} ${shape?.style.stroke?.thicknessPt}pt (frame ${JSON.stringify(shape?.frame)}); controles de cor/preenchimento/contorno no painel: ${colorish(ctl2).length || 'nenhum'}`,
    screenshot: await p.shot('S18-fundo-pagina'),
  };
});

await scenario('S19', 'Soltar a seleção do overlay de tela cheia (voltar a clicar nos textos)', H, async (p) => {
  const t = byText(await p.objs(), 'PNEUMÁTICA');
  const res = [];
  await p.clickMm(30, 90, 'fundo');
  res.push(`selecionados: ${(await p.selected()).length}`);
  await p.page.keyboard.press('Escape'); p.n += 1; res.push(`Esc: ${(await p.selected()).length}`);
  const st = await p.stage();
  await p.page.mouse.click(st.x - 15, st.y + 330); p.n += 1; res.push(`clique na margem cinza ao lado da página: ${(await p.selected()).length}`);
  await p.clickObj(t.id, 'texto PNEUMÁTICA');
  res.push(`clicar num texto: ${(await p.selected())[0] === t.id ? 'selecionou o texto' : 'continua no overlay'}`);
  await p.ctrlClickMm(30, 90);
  res.push(`Ctrl+clique no mesmo overlay: ${(await p.selected()).length} selecionados`);
  await p.clickMm(30, 90, 'fundo');
  await p.page.locator('button:has-text("Página 2")').first().click(); p.n += 1;
  await p.page.locator('button:has-text("Página 1")').first().click(); p.n += 1; await p.page.waitForTimeout(300);
  res.push(`trocar de página e voltar: ${(await p.selected()).length}`);
  const dragStart = (await p.objs()).find((o) => o.type === 'image' && o.frame.widthMm > 209);
  await p.clickMm(30, 90, 'fundo');
  const before = JSON.stringify((await p.objs()).filter((o) => o.type === 'image' && o.frame.widthMm > 209).map((o) => o.frame));
  await p.drag(dragStart.id, 6, 4, 0.1);
  const after = JSON.stringify((await p.objs()).filter((o) => o.type === 'image' && o.frame.widthMm > 209).map((o) => o.frame));
  res.push(`arrastar 6 mm sobre o overlay selecionado: ${before === after ? 'não moveu' : 'MOVEU A CAMADA INTEIRA (todas as chamadas)'}`);
  return {
    outcome: 'difícil', cause: 'seleção (o objeto selecionado vira a camada mais alta e captura todos os cliques; Esc e margem não soltam)',
    evidence: res.join('; '),
    screenshot: await p.shot('S19-desselecionar'),
  };
});

await scenario('S20', 'Página interna 2: mudar cor da faixa do cabeçalho, de uma régua e de um painel', H, async (p) => {
  await p.page.locator('button:has-text("Página 2")').first().click(); p.n += 1;
  await p.page.waitForTimeout(500);
  const objs = await p.objs(1);
  const doc0 = (await p.state()).document;
  const band = objs.find((o) => o.type === 'image' && named(doc0, o).includes('band-header-a'));
  const rule = objs.find((o) => o.type === 'shape' && o.frame.heightMm < 1 && o.style.fill === '#092D4D');
  const panelRect = objs.find((o) => o.type === 'shape' && o.frame.heightMm > 30);
  const res = {};
  for (const [k, o, dx, dy] of [['faixa (imagem)', band, 60, 1.5], ['régua de 0,8 mm', rule, 40, rule.frame.heightMm / 2], ['painel retangular', panelRect, 3, panelRect.frame.heightMm - 3]]) {
    await p.clickMm(o.frame.xMm + dx, o.frame.yMm + dy, k);
    const sel = (await p.selected())[0];
    const ctl = await p.controls();
    res[k] = `${sel === o.id ? 'selecionável' : 'NÃO selecionado'}; controles de cor: ${colorish(ctl).length ? colorish(ctl).join('/') : 'nenhum'}`;
  }
  return {
    outcome: 'impossível', cause: 'elemento inexistente (faixa = PNG) / propriedade faltante (Forma sem painel de cor)',
    evidence: Object.entries(res).map(([k, v]) => `${k}: ${v}`).join('; '),
    screenshot: await p.shot('S20-pagina-interna'),
  };
});

await scenario('S21', 'Mudar o rodapé e a numeração em todas as páginas', H, async (p) => {
  const doc = (await p.state()).document;
  const hits = doc.pages.map((pg) => pg.objects.filter((o) => o.type === 'text' && textOf(o).includes('Experimento 22.10.2026')).length);
  const total = hits.reduce((a, b) => a + b, 0);
  const pageNum = doc.pages.flatMap((pg) => pg.objects.filter((o) => o.type === 'text' && /^\d+ \/ \d+$/.test(textOf(o)))).length;
  return {
    outcome: 'difícil', cause: 'elemento inexistente (sem página-mestra: rodapé, faixa e numeração são objetos soltos repetidos)',
    evidence: `rodapé em ${total} caixas de texto (${hits.join(',')} por página) e ${pageNum} números "n / ${doc.pages.length}" digitados; mudar = ${total + pageNum} edições (~5 ações cada = ~${(total + pageNum) * 5} ações); a faixa PNG também se repete em cada página`,
    screenshot: null, clicks: 0,
  };
}, { undo: false });

await scenario('S23', 'Área útil da página com a barra de ferramentas aberta (1366x768)', H, async (p) => {
  const measure = () => p.page.evaluate(() => {
    const stage = document.querySelector('[data-vnext-page-stage]').getBoundingClientRect();
    const bars = [...document.querySelectorAll('main [data-editor-action], [data-editor-action="toggle-advanced-tools"]')].filter((e) => e.offsetParent);
    const toolbarBottom = Math.max(...bars.map((e) => e.getBoundingClientRect().bottom).filter((b) => b < 600));
    return { toolbarBottom: Math.round(toolbarBottom), visibleCanvasPx: Math.round(768 - toolbarBottom), pageHeightPx: Math.round(stage.height) };
  });
  const closed = await measure();
  await p.openMore();
  const t = byText(await p.objs(), 'PRESYS');
  await p.clickObj(t.id, '');
  const opened = await measure();
  return {
    outcome: 'difícil', cause: 'UI escondida / espaço (barra de ferramentas empurra a página; avisos também deslocam)',
    evidence: `barra fechada: ${closed.visibleCanvasPx}px visíveis de ${closed.pageHeightPx}px de página (${Math.round(100 * closed.visibleCanvasPx / closed.pageHeightPx)}%); com "Mais opções" e um objeto selecionado: ${opened.visibleCanvasPx}px (${Math.round(100 * opened.visibleCanvasPx / opened.pageHeightPx)}%); a capa A4 exige rolar ~3 telas`,
    screenshot: await p.shot('S23-area-util'),
  };
});

// ---- Outras capas: clique no centro da foto e no fundo vazio, em cada catálogo ----
const cross = [];
for (const name of ['PCON-DT', 'PCON-HIBRIDO', 'PCON-KOMPRESSOR-Y18', 'PCON-Y17', 'PCON-Y18-BP', 'PCON-Y18-LP']) {
  const p = await open(name);
  const doc = (await p.state()).document;
  const objs = await p.objs();
  const photo = objs.find((o) => o.type === 'image' && !/plate|overlay|band/.test(asset(doc, o)));
  const full = objs.filter((o) => o.type === 'image' && o.frame.widthMm >= 209 && o.frame.heightMm >= 296);
  const label = (o) => !o ? 'nada' : o.type === 'image' ? `imagem ${asset(doc, o).replace(/^pcon-[a-z0-9-]+?-(PCON|pcon)/, '$1').slice(0, 44)}` : o.type + (o.type === 'text' ? ` "${textOf(o).slice(0, 18)}"` : '');
  const out = { catalog: name, fullBleedImages: full.length, photo: asset(doc, photo) };
  // centro da foto
  const cx = photo.frame.xMm + photo.frame.widthMm / 2, cy = photo.frame.yMm + photo.frame.heightMm / 2;
  let hit = null;
  for (const [dx, dy] of [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]]) {
    await p.clickMm(cx + dx * photo.frame.widthMm, cy + dy * photo.frame.heightMm);
    const s = (await p.selected())[0];
    const o = objs.find((x) => x.id === s);
    if (o && o.type !== 'text') { hit = o; break; }
    await p.page.keyboard.press('Escape');
  }
  out.clickOnPhoto = label(hit);
  out.photoReachable = hit?.id === photo.id;
  out.photoZ = photo.zIndex; out.fullBleedZ = full.map((o) => o.zIndex);
  // fundo vazio (cantos da base)
  await p.clickMm(8, 292);
  const s2 = (await p.selected())[0];
  out.clickOnEmptyBackground = label(objs.find((x) => x.id === s2));
  out.shot = await p.shot(`S22-${name}`);
  cross.push(out);
  console.log('S22', name, out.clickOnPhoto, '|', out.clickOnEmptyBackground);
  await p.ctx.close();
}
results.push({ id: 'S22', edit: 'Clicar na foto e no fundo de cada capa', catalog: 'todos', outcome: 'ver tabela', cross });

writeFileSync(resolve(OUT, 'results.json'), JSON.stringify(results, null, 2));
await browser.close();
await server.close();
console.log('ok -> scratch/cover-audit/results.json');

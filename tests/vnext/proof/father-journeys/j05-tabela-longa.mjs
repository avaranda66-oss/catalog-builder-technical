// J5 — "Tabela longa": o pai cola uma tabela de faixas com 40 linhas (cabeçalho + 40) numa página vazia.
// "Continuar na próxima página" é Onda 2 (2I, FR-35): a prova registra o que aparece HOJE, se o pai entende
// o que fazer, e exige que Publicar / PDF bloqueie com explicação clara, sem travar e sem perder trabalho.
//   1 catálogo "Em branco" → Ctrl+V de 41 linhas × 4 colunas na página vazia → o que aparece?
//   2 a tabela passa do fim da página? há aviso? existe algum "Continuar na próxima página"?
//   3 Publicar / PDF → "Revisar e publicar" → bloqueado com item claro; "Imprimir / salvar PDF" desligado
//   4 "Corrigir este item" leva à tabela; "Voltar ao editor" devolve um editor que responde
//   5 o mesmo pelo botão "Colar tabela do Excel" numa página nova (mensagem igual?)
//   6 Ctrl+Z tira a tabela longa; tudo salvo; zero erros de console
//   node tests/vnext/proof/father-journeys/j05-tabela-longa.mjs
//   VP=1280 node tests/vnext/proof/father-journeys/j05-tabela-longa.mjs
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  baseUrl, consoleErrors, createCatalog, ensureServer, freshDb, harnessUrl, journey, launch, shot, state, visibleText, waitSaved,
  writeJourneyResult,
} from './lib.mjs';
import { pendingStep as eyesPendingStep, scanJargon as eyesScanJargon, unexplainedMm } from './fixtures/father-eyes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TSV_40 = await readFile(resolve(HERE, 'fixtures/tsv/faixas-40.tsv'), 'utf8');
const TSV_LINES = TSV_40.trim().split(/\r?\n/).length;
/** "Zoom" é corrente em português; "Catalog Builder" é a marca do produto. */
const JARGON_ALLOW = ['Zoom', 'Catalog', 'Builder'];

const server = await ensureServer();
const { browser, context, page, log, viewport } = await launch();
page.setDefaultTimeout(8000);
const j = journey('j05-tabela-longa', 'J5 — tabela de faixas com 40 linhas: o que aparece hoje; Publicar / PDF bloqueia com explicação');
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

function pendingStep(name, reason, detail) {
  eyesPendingStep(j, name, detail ? `${reason} · HOJE: ${detail}` : reason);
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
  let st = await state(page);
  j.step('0 catálogo "Em branco" abre salvo, com uma página vazia',
    st.runtime.saveLabel === 'Saved' && st.runtime.document.pages.length === 1 && pageObjects(st).length === 0);

  // ---- 1. Colar as 40 linhas (Ctrl+V) na página vazia ----
  await clickEmptyPageSpot();
  countClick('1 colar 40 linhas (Ctrl+V)', 1);
  let written;
  const notice1 = await noticeTimeline(async () => { written = await realPaste(TSV_40); });
  await page.waitForTimeout(1500); // dá tempo para a altura ser medida e ajustada (pendingTableFit)
  st = await state(page);
  let longTable = pageObjects(st).find((o) => o.type === 'table');
  let method = 'Ctrl+V real';
  if (!longTable) {
    const synthetic = await syntheticPaste(TSV_40);
    await page.waitForTimeout(1500);
    st = await state(page);
    longTable = pageObjects(st).find((o) => o.type === 'table');
    method = `evento paste sintético (${JSON.stringify(synthetic)}; clipboard real: ${written})`;
  }
  measurements.pasteMethod = method;
  const sum1 = tableSummary(longTable);
  measurements.table1 = sum1;
  j.step(`1 Ctrl+V cria a tabela com ${TSV_LINES} linhas (cabeçalho + 40) e 4 colunas, sem travar`,
    Boolean(longTable) && sum1.rows === TSV_LINES && sum1.columns === 4 && sum1.headerRows === 1 && log.pageErrors.length === 0,
    `${method} · ${JSON.stringify(sum1)}`);
  measurements.notice1 = notice1;
  j.step('1 aparece uma mensagem visível em menos de 1 s dizendo o que aconteceu',
    Boolean(notice1) && notice1.visible && notice1.afterMs < 1000, notice1 ? `${notice1.afterMs} ms · ${notice1.tone} · "${notice1.text.slice(0, 220)}"` : 'nenhuma mensagem em 4 s');
  const drawn1 = longTable ? await drawnTable(longTable.table.id, longTable.id) : { error: 'sem tabela' };
  measurements.drawn1 = drawn1;
  const chip1 = await issuesChip();
  measurements.chip1 = chip1;
  await waitSaved(page, 20000).catch(() => {});
  st = await state(page);
  j.step('1 o trabalho não se perdeu: a tabela longa foi salva sozinha ("Salvo")',
    st.runtime.saveLabel === 'Saved' && !st.runtime.dirty && Boolean(st.runtime.stored?.pages?.[0]?.objects?.some((o) => o.id === longTable?.id)),
    `saveLabel: ${st.runtime.saveLabel} · salvo no servidor: ${Boolean(st.runtime.stored?.pages?.[0]?.objects?.some((o) => o.id === longTable?.id))}`);
  j.addEvidence(await shot(page, 'j05-tabela-longa-01-colada-40-linhas'));

  // ---- 2. O que o pai vê: passa do fim da folha? há aviso? dá para continuar na próxima página? ----
  const overflowSeen = (drawn1.rowsBeyondPage ?? 0) > 0 || !(sum1?.fitsPage ?? true);
  j.step('2 a tabela de 41 linhas não cabe numa folha A4 (linhas passam do fim da página)', overflowSeen,
    `linhas desenhadas: ${drawn1.rowsDrawn} · dentro da folha: ${drawn1.rowsInsidePage} · além: ${drawn1.rowsBeyondPage} (${drawn1.beyondPagePx} px) · fim do quadro: ${sum1?.bottomMm} mm de 297`);
  const inspector = page.getByRole('complementary', { name: /Inspector|Propriedades/ });
  const showDiag = inspector.getByRole('button', { name: /^(Mostrar|Diagnósticos)$/ }).first();
  if (await showDiag.count()) { await showDiag.click(); countClick('2 ver o aviso', 1); }
  await page.waitForTimeout(300);
  const diagText = (await inspector.innerText().catch(() => '')).replace(/\s+/g, ' ');
  measurements.diagnosticsPanel = diagText.slice(0, 500);
  const warnedOnPage = Boolean(drawn1.badge) || /a corrigir/.test(chip1) && !/^0 a corrigir/.test(chip1) || /fora da página|ultrapassa/i.test(diagText);
  j.step('2 o editor avisa, sem o pai procurar, que parte da tabela está fora da página (chip "a corrigir", "!" no objeto ou painel)',
    warnedOnPage, `chip: "${chip1}" · marca no objeto: ${JSON.stringify(drawn1.badge)} · painel: "${diagText.slice(0, 200)}"`);
  const tellsWhatToDo = /próxima página|outra página|várias páginas|dividir|continuar/i.test(`${notice1?.text ?? ''} ${diagText}`);
  const continuation = await continuationControl();
  measurements.continuationControl = continuation;
  if (continuation) {
    j.step('2 existe um controle "Continuar na próxima página" para a tabela longa', true, continuation);
  } else {
    pendingStep('2 "Continuar na próxima página" divide a tabela em duas páginas com cabeçalho repetido',
      'pendente Onda 2 (2I): "Continuar na próxima página" para tabela maior que A4 (FR-35)',
      `nenhum botão/menu com esse nome na tela; a mensagem de hoje ${tellsWhatToDo ? 'fala' : 'NÃO fala'} em outra página; o pai lê: "${(notice1?.text ?? '').slice(0, 160)}" e, no painel, "${diagText.slice(0, 160)}"`);
  }
  const jargon2 = await scanJargon('2 tabela longa + diagnósticos');
  j.step('2 sem jargão/inglês na tela com a tabela longa e o painel de diagnósticos aberto', jargon2.length === 0, jargon2.join(', ') || '-');
  j.addEvidence(await shot(page, 'j05-tabela-longa-02-aviso-e-diagnostico'));

  // ---- 3. Publicar / PDF deve bloquear com explicação clara, sem travar ----
  const publish = page.getByRole('button', { name: /^(Publicar \/ PDF|Salvando…)$/ });
  j.step('3 botão "Publicar / PDF" visível no topo', await publish.isVisible());
  const t0 = Date.now();
  await publish.click();
  countClick('3 publicar', 1);
  const dialog = page.getByRole('dialog', { name: 'Revisar e publicar' });
  await dialog.waitFor({ timeout: 15000 });
  const openedMs = Date.now() - t0;
  const statusLine = dialog.locator('p[role=status], p[role=alert]').first();
  await page.waitForFunction(() => {
    const el = document.querySelector('.vnext-publication-dialog p[role=status], .vnext-publication-dialog p[role=alert]');
    return el && /bloqueada|Pronto para imprimir|mudou/.test(el.textContent ?? '');
  }, null, { timeout: 30000 });
  const verdictMs = Date.now() - t0;
  const verdict = (await statusLine.innerText()).replace(/\s+/g, ' ').trim();
  const publicationStatus = await page.locator('[data-publication-host]').getAttribute('data-publication-status');
  const items = await dialog.locator('[data-publication-diagnostic]').evaluateAll((lis) => lis.map((li) => ({
    code: li.getAttribute('data-publication-diagnostic'), severity: li.getAttribute('data-severity'),
    location: li.querySelector('.vnext-diagnostic-location')?.textContent?.trim() ?? '',
    kind: li.querySelector('.vnext-diagnostic-kind')?.textContent?.trim() ?? '',
    message: li.querySelector('.vnext-diagnostic-message')?.textContent?.trim() ?? '',
    hasFixButton: Boolean([...li.querySelectorAll('button')].find((b) => /Corrigir este item/.test(b.textContent ?? ''))),
  })));
  const printButton = dialog.getByRole('button', { name: 'Imprimir / salvar PDF' });
  const printDisabled = await printButton.isDisabled();
  measurements.publication = { openedMs, verdictMs, verdict, publicationStatus, items, printDisabled };
  j.step('3 "Revisar e publicar" abre e dá o veredito em menos de 15 s', verdictMs < 15000, `abriu em ${openedMs} ms · veredito em ${verdictMs} ms`);
  j.step('3 Publicar bloqueia (não trava): "Publicação bloqueada. Corrija os itens abaixo…" e "Imprimir / salvar PDF" desligado',
    publicationStatus === 'BLOCKED' && /Publicação bloqueada/.test(verdict) && printDisabled, `${publicationStatus} · "${verdict}" · imprimir desligado: ${printDisabled}`);
  const tableItem = items.find((item) => /tabela/i.test(item.location) || /tabela|objeto/i.test(item.message));
  j.step('3 o item bloqueante aponta a tabela (onde) e explica em português o que está errado',
    Boolean(tableItem) && tableItem.severity === 'ERROR' && /Página 1/.test(tableItem.location) && tableItem.message.length > 20,
    JSON.stringify(items).slice(0, 500));
  const tellsSplit = items.some((item) => /próxima página|outra página|várias páginas|dividir|continuar/i.test(item.message));
  if (!continuation) {
    pendingStep('3 a explicação do bloqueio diz ao pai o caminho (continuar/dividir em outra página)',
      'pendente Onda 2 (2I): sem "Continuar na próxima página" a mensagem só pode mandar mover/reduzir (FR-35)',
      `o pai lê: "${tableItem?.message ?? '-'}"; fala em outra página: ${tellsSplit}`);
  } else {
    j.step('3 a explicação do bloqueio diz ao pai o caminho (continuar/dividir em outra página)', tellsSplit, tableItem?.message ?? '-');
  }
  const dialogText = (await dialog.innerText()).replace(/\s+/g, ' ');
  const jargon3 = eyesScanJargon(dialogText, { allow: JARGON_ALLOW }).map((h) => h.term);
  if (jargon3.length) jargonSeen.push({ where: '3 Revisar e publicar', words: jargon3 });
  j.step('3 sem jargão/inglês na janela "Revisar e publicar"', jargon3.length === 0, jargon3.join(', ') || '-');
  const dialogFont = await dialog.locator('.vnext-diagnostic-message').first().evaluate((el) => Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10).catch(() => null);
  measurements.publicationMessageFontPx = dialogFont;
  j.step('3 a explicação do bloqueio tem letra legível (≥ 13 px)', (dialogFont ?? 0) >= 13, `${dialogFont} px`);
  j.addEvidence(await shot(page, 'j05-tabela-longa-03-publicar-bloqueado'));

  // ---- 4. "Corrigir este item" leva à tabela; "Voltar ao editor" devolve um editor que responde ----
  const fixButton = dialog.getByRole('button', { name: 'Corrigir este item' }).first();
  const fixVisible = await fixButton.isVisible().catch(() => false);
  if (fixVisible) {
    await fixButton.click();
    countClick('4 corrigir este item', 1);
    await page.waitForTimeout(600);
    const afterFix = await page.evaluate(() => ({
      dialogOpen: Boolean(document.querySelector('[data-publication-host]')),
      selected: document.querySelector('[data-editor-object-id][data-selected="true"]')?.getAttribute('data-editor-object-id') ?? null,
      panel: document.querySelector('[data-vnext-shell] aside h2')?.textContent?.trim() ?? null,
    }));
    measurements.afterFix = afterFix;
    j.step('4 "Corrigir este item" fecha a revisão e deixa a tabela selecionada no editor',
      !afterFix.dialogOpen && afterFix.selected === longTable?.id && /Tabela/.test(afterFix.panel ?? ''), JSON.stringify(afterFix));
  } else {
    j.step('4 há um botão "Corrigir este item" no bloqueio', false, 'botão não encontrado');
  }
  // Reabrir e voltar pelo botão "Voltar ao editor".
  await publish.click();
  countClick('4 voltar ao editor', 1);
  await dialog.waitFor({ timeout: 15000 });
  await dialog.getByRole('button', { name: 'Voltar ao editor' }).click();
  countClick('4 voltar ao editor', 1);
  await page.waitForTimeout(400);
  const dialogGone = (await page.locator('[data-publication-host]').count()) === 0;
  const objectsBefore = allObjects(await state(page)).length;
  await page.getByRole('button', { name: 'Texto', exact: true }).click();
  await page.waitForTimeout(500);
  st = await state(page);
  const objectsAfter = allObjects(st).length;
  j.step('4 "Voltar ao editor" fecha a janela e o editor continua respondendo (inserir "Texto" cria um objeto)',
    dialogGone && objectsAfter === objectsBefore + 1, `janela fechada: ${dialogGone} · objetos: ${objectsBefore} → ${objectsAfter}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);

  // ---- 4b. O pai clica no único botão oferecido, "Ajustar altura": o que acontece? ----
  await page.locator(`[data-editor-object-id="${longTable.id}"]`).click({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(300);
  let adjust = page.getByRole('button', { name: 'Ajustar altura', exact: true }).first();
  if (!(await adjust.isVisible().catch(() => false))) {
    const show = inspector.getByRole('button', { name: /^(Mostrar|Diagnósticos)$/ }).first();
    if (await show.count()) await show.click();
    await page.waitForTimeout(300);
    adjust = page.getByRole('button', { name: 'Ajustar altura', exact: true }).first();
  }
  const adjustVisible = await adjust.isVisible().catch(() => false);
  measurements.adjustHeightOffered = adjustVisible;
  if (adjustVisible) {
    const noticeAdjust = await noticeTimeline(() => adjust.click());
    countClick('4b ajustar altura', 1);
    await page.waitForTimeout(600);
    st = await state(page);
    const afterAdjust = tableSummary(allObjects(st).find((o) => o.id === longTable.id));
    const chipAdjust = await issuesChip();
    const drawnAdjust = await drawnTable(longTable.table.id, longTable.id);
    measurements.afterAdjustHeight = { notice: noticeAdjust?.text ?? null, tone: noticeAdjust?.tone ?? null, frame: afterAdjust?.frame, bottomMm: afterAdjust?.bottomMm, fitsPage: afterAdjust?.fitsPage, chip: chipAdjust, drawn: drawnAdjust };
    j.step('4b "Ajustar altura" responde sem travar e sem perder a tabela (mensagem visível, tabela continua lá)',
      Boolean(afterAdjust) && Boolean(noticeAdjust) && log.pageErrors.length === 0,
      `mensagem: "${noticeAdjust?.text?.slice(0, 160) ?? '-'}" · quadro: ${afterAdjust?.bottomMm} mm de 297 (cabe: ${afterAdjust?.fitsPage}) · chip: "${chipAdjust}"`);
    // Publicar de novo: continua bloqueado? com que explicação?
    await publish.click();
    countClick('4b publicar de novo', 1);
    await dialog.waitFor({ timeout: 15000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('.vnext-publication-dialog p[role=status], .vnext-publication-dialog p[role=alert]');
      return el && /bloqueada|Pronto para imprimir|mudou/.test(el.textContent ?? '');
    }, null, { timeout: 30000 });
    const items2 = await dialog.locator('[data-publication-diagnostic]').evaluateAll((lis) => lis.map((li) => ({
      code: li.getAttribute('data-publication-diagnostic'), severity: li.getAttribute('data-severity'),
      location: li.querySelector('.vnext-diagnostic-location')?.textContent?.trim() ?? '',
      message: li.querySelector('.vnext-diagnostic-message')?.textContent?.trim() ?? '',
    })));
    const status2 = await page.locator('[data-publication-host]').getAttribute('data-publication-status');
    measurements.publicationAfterAdjust = { status: status2, items: items2 };
    j.addEvidence(await shot(page, 'j05-tabela-longa-03b-publicar-depois-de-ajustar-altura'));
    if (!continuation) {
      pendingStep('4b depois de "Ajustar altura" o pai consegue publicar (tabela continua na página seguinte)',
        'pendente Onda 2 (2I) (FR-35)',
        `"Ajustar altura" leva o quadro a ${afterAdjust?.bottomMm} mm (folha: 297) e Publicar fica ${status2} com: ${items2.map((i) => `"${i.message}"`).join(' / ') || '-'}`);
    } else {
      j.step('4b depois de "Ajustar altura" o pai consegue publicar', status2 === 'READY', JSON.stringify(items2));
    }
    await dialog.getByRole('button', { name: 'Voltar ao editor' }).click();
    await page.waitForTimeout(400);
    await clickEmptyPageSpot();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    st = await state(page);
    const reverted = tableSummary(allObjects(st).find((o) => o.id === longTable.id));
    j.step('4b Ctrl+Z desfaz o "Ajustar altura" (quadro volta a caber na folha) sem travar', Boolean(reverted) && reverted.fitsPage, `quadro: ${reverted?.bottomMm} mm`);
  } else {
    j.step('4b há um botão "Ajustar altura" oferecido no painel da tabela', false, 'não encontrado');
  }

  // ---- 5. O mesmo pelo botão "Colar tabela do Excel", numa página nova ----
  await clickEmptyPageSpot();
  await page.getByRole('button', { name: 'Adicionar nova página após a página atual' }).click();
  countClick('5 colar pelo botão', 1);
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Colar tabela do Excel', exact: true }).click();
  countClick('5 colar pelo botão', 1);
  const pasteArea = page.getByRole('region', { name: 'Colar tabela do Excel' });
  await pasteArea.waitFor({ timeout: 5000 });
  const box = pasteArea.getByRole('textbox', { name: 'Cole aqui (Ctrl+V)' });
  await realPaste(TSV_40);
  await page.waitForTimeout(600);
  if (!(await box.inputValue()).includes('\t')) await box.fill(TSV_40);
  const summaryText = await pasteArea.locator('[data-paste-table-summary]').first().innerText().catch(() => '');
  const areaText = (await pasteArea.innerText()).replace(/\s+/g, ' ');
  measurements.pasteAreaSummary = summaryText;
  const warnsBeforeCreate = /não cabe|várias páginas|outra página|mais de uma página|passa|ultrapassa/i.test(areaText);
  measurements.pasteAreaWarnsBeforeCreate = warnsBeforeCreate;
  j.step(`5 a caixa "Cole aqui" reconhece "${TSV_LINES} linhas × 4 colunas" com prévia`,
    new RegExp(`${TSV_LINES} linhas × 4 colunas`).test(summaryText) && await pasteArea.getByRole('table', { name: 'Prévia da tabela' }).isVisible(), `resumo: "${summaryText}"`);
  j.addEvidence(await shot(page, 'j05-tabela-longa-04-caixa-colar-40-linhas'));
  const notice5 = await noticeTimeline(() => pasteArea.getByRole('button', { name: 'Criar tabela' }).click());
  countClick('5 colar pelo botão', 1);
  await page.waitForTimeout(1500);
  st = await state(page);
  const longTable2 = pageObjects(st, 1).find((o) => o.type === 'table');
  const sum5 = tableSummary(longTable2);
  measurements.notice5 = notice5;
  measurements.table5 = sum5;
  j.step(`5 "Criar tabela" põe a tabela de ${TSV_LINES} linhas na página nova e avisa (sem travar)`,
    Boolean(longTable2) && sum5.rows === TSV_LINES && Boolean(notice5) && notice5.visible && log.pageErrors.length === 0,
    `${JSON.stringify(sum5)} · mensagem: ${notice5 ? `${notice5.afterMs} ms · "${notice5.text.slice(0, 200)}"` : 'nenhuma'}`);
  if (!continuation) {
    pendingStep('5 ao colar 41 linhas, a caixa ou a mensagem avisa que não cabe numa folha e oferece continuar na próxima página',
      'pendente Onda 2 (2I) (FR-35)',
      `antes de criar, a caixa ${warnsBeforeCreate ? 'avisa' : 'NÃO avisa'} que não cabe; depois, a mensagem é: "${(notice5?.text ?? '-').slice(0, 160)}"`);
  }
  await waitSaved(page, 20000).catch(() => {});

  // ---- 6. Ctrl+Z tira a tabela longa; tudo salvo; console limpo ----
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await clickEmptyPageSpot();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  st = await state(page);
  const undone = !pageObjects(st, 1).some((o) => o.id === longTable2?.id);
  j.step('6 Ctrl+Z tira a tabela longa colada pelo botão (sem travar)', undone, `objetos na página 2: ${pageObjects(st, 1).length}`);
  await waitSaved(page, 20000).catch(() => {});
  st = await state(page);
  j.step('6 tudo salvo ao fim ("Salvo")', st.runtime.saveLabel === 'Saved' && !st.runtime.dirty, `saveLabel: ${st.runtime.saveLabel}`);
  const chipEnd = await issuesChip();
  measurements.chipEnd = chipEnd;
  measurements.clicks = clicks;
  const jargonEnd = await scanJargon('6 fim');
  j.step('6 sem jargão/inglês na tela ao fim', jargonEnd.length === 0, jargonEnd.join(', ') || '-');
  j.addEvidence(await shot(page, 'j05-tabela-longa-05-fim'));
  await checkReload('fim');

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
  if (jargonSeen.length) j.finding(`palavras técnicas/inglês vistas: ${JSON.stringify(jargonSeen)}`, { severity: 'medium', where: 'editor/publicação' });
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

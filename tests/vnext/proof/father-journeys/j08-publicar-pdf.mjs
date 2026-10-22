// J8 — Publicar / PDF (grupo C, Equipe B). O pai digita um texto e clica "Publicar / PDF" NA HORA, sem esperar
// salvar: o app tem de salvar sozinho ("Salvando…") e mostrar "Pronto para imprimir ou salvar PDF." (a), ou a lista
// com "Corrigir este item" que leva ao objeto certo, com foco (b). Depois de corrigir, publica de novo → "Pronto".
// O PDF sai pela visualização de impressão (page.pdf A4) e é conferido com pdfjs: N páginas A4, texto pesquisável,
// sem "A COMPLETAR". A impressão em si (janela do navegador) continua sendo checklist humano do Gabriel (FR-52).
//   BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j08-publicar-pdf.mjs
//   VP=1280 BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j08-publicar-pdf.mjs
import { mkdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  OUT, VP_SUFFIX, createCatalog, ensureServer, freshDb, harnessUrl, journey, launch, rel, shot, state, waitSaved,
} from './lib.mjs';
import {
  MIN_TARGET_PX, classifyConsole, clickCounter, findingStep, finishJourneyGraded, measure, scanJargon, unexplainedMm,
  waitMs,
} from './fixtures/father-eyes.mjs';

const server = await ensureServer();
const { browser, page, log, viewport } = await launch();
page.setDefaultTimeout(10000);
const j = journey('j08-publicar-pdf', 'J8 — Publicar / PDF logo depois de editar: salva sozinho; Pronto ou "Corrigir este item" com foco; PDF A4 pesquisável');
const db = freshDb('j08');
const ALLOW = [/^(Catalog|Builder)$/, /^Zoom$/, /^(PDF|A4)$/i];
const PDF_DIR = resolve(OUT, 'pdf');
const clicks = clickCounter();
const timings = {};
const measures = {};
const texts = {};
let status = 'fail';

const viteEvents = [];
page.on('console', (m) => { if (/\[vite\]/.test(m.text())) viteEvents.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
const mark = () => page.evaluate(() => { window.__PROOF_MARK = true; }).catch(() => {});
const reloads = [];
const checkReload = async (where) => { if (await page.evaluate(() => window.__PROOF_MARK !== true).catch(() => false)) reloads.push(where); };

const shell = () => page.locator('[data-vnext-shell]');
const host = () => page.locator('[data-publication-host]');
const review = () => page.getByRole('dialog', { name: 'Revisar e publicar' });
const publishButton = () => page.getByRole('button', { name: /^(Publicar \/ PDF|Salvando…)$/ });
const notice = () => page.locator('[data-editor-notice]').first();
const textObjects = (snapshot, pageIndex) => (snapshot.runtime.document.pages[pageIndex]?.objects ?? []).filter((o) => o.type === 'text');
const docText = (snapshot) => JSON.stringify(snapshot.runtime.document);
const pageLabel = () => page.locator('.vnext-canvas-meta strong').first().innerText().catch(() => '');
const hostStatus = () => host().getAttribute('data-publication-status').catch(() => null);
const waitReviewDone = (timeout = 30000) => waitMs(async () => ['READY', 'BLOCKED'].includes((await hostStatus()) ?? ''), { timeout });
/** O seletor pode casar vários blocos (cabeçalho + controles do diálogo): junta o texto visível de todos. */
const jargonStep = async (label, selector) => {
  const text = (await page.locator(selector).allInnerTexts()).join('\n');
  const hits = scanJargon(text, { allow: ALLOW });
  texts[label] = { hits, mm: unexplainedMm(text), sample: text.replace(/\s+/g, ' ').slice(0, 400) };
  j.step(`${label}: tudo em português, sem jargão`, hits.length === 0, hits.map((h) => `${h.term} («${h.context}»)`).join(' | ') || '-');
};

/** Grava, a cada mudança do DOM, o texto do botão Publicar e o estado/mensagem da revisão (para ver "Salvando…"). */
const startTrace = () => page.evaluate(() => {
  window.__J8_TRACE = [];
  const t0 = performance.now();
  const read = () => ({
    button: document.querySelector('[data-editor-action="publish"]')?.textContent?.trim() ?? null,
    hostStatus: document.querySelector('[data-publication-host]')?.getAttribute('data-publication-status') ?? null,
    dialogStatus: document.querySelector('[data-publication-host] .vnext-publication-controls .vnext-status')?.textContent?.trim() ?? null,
  });
  let last = JSON.stringify(read());
  window.__J8_TRACE.push({ ms: 0, ...JSON.parse(last) });
  const observer = new MutationObserver(() => {
    const now = read(); const key = JSON.stringify(now);
    if (key !== last) { last = key; window.__J8_TRACE.push({ ms: Math.round(performance.now() - t0), ...now }); }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-publication-status', 'aria-busy'] });
  window.__J8_STOP = () => observer.disconnect();
});
const stopTrace = () => page.evaluate(() => { window.__J8_STOP?.(); return window.__J8_TRACE ?? []; });

/** "Texto" → dois cliques no texto novo → digita (sem Concluir, a não ser que peçam). Devolve o id do objeto. */
async function insertText(task, pageIndex, value, { conclude = false } = {}) {
  const before = new Set(textObjects(await state(page), pageIndex).map((o) => o.id));
  await clicks.click(task, page.getByRole('button', { name: 'Texto', exact: true }));
  await page.waitForTimeout(300);
  const created = textObjects(await state(page), pageIndex).find((o) => !before.has(o.id));
  if (!created) throw new Error(`"Texto" não criou um texto na página ${pageIndex + 1}`);
  await editText(task, created.id, value, { conclude });
  return created.id;
}

async function editText(task, objectId, value, { conclude = false } = {}) {
  const hit = page.locator(`[data-editor-object-id="${objectId}"]`);
  await hit.scrollIntoViewIfNeeded();
  await hit.dblclick();
  clicks.counts[task] = (clicks.counts[task] ?? 0) + 2;
  const box = page.getByRole('textbox', { name: 'Editar conteúdo do texto' });
  await box.waitFor({ timeout: 5000 });
  await box.fill(value);
  if (conclude) await clicks.click(task, page.getByRole('button', { name: 'Concluir', exact: true }).first());
}

/** Clica "Imprimir / salvar PDF" com window.print falso, gera o PDF da visualização de impressão e inspeciona com pdfjs. */
async function producePdf(task, name) {
  await page.evaluate(() => { window.__J8_PRINTS = 0; window.print = () => { window.__J8_PRINTS += 1; }; });
  const titleBefore = await page.title();
  const printButton = review().getByRole('button', { name: 'Imprimir / salvar PDF' });
  await clicks.click(task, printButton);
  const printed = await waitMs(() => page.evaluate(() => window.__J8_PRINTS === 1), { timeout: 10000 });
  const approved = await host().getAttribute('data-print-approved');
  const suggestedTitle = await page.title();
  await page.emulateMedia({ media: 'print' });
  await mkdir(PDF_DIR, { recursive: true });
  const pdfPath = resolve(PDF_DIR, `${name}${VP_SUFFIX}.pdf`);
  await page.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, margin: { top: '0', right: '0', bottom: '0', left: '0' }, scale: 1 });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  const titleAfter = await page.title();
  const bytes = new Uint8Array(await readFile(pdfPath));
  const pdf = await getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const pdfPage = await pdf.getPage(i);
    const [x0, y0, x1, y1] = pdfPage.view;
    const content = await pdfPage.getTextContent();
    pages.push({ widthPt: Math.round((x1 - x0) * 100) / 100, heightPt: Math.round((y1 - y0) * 100) / 100, text: content.items.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim() });
  }
  await pdf.destroy();
  const isA4 = (p) => Math.abs(p.widthPt - 595.28) < 1.5 && Math.abs(p.heightPt - 841.89) < 1.5;
  return {
    path: rel(pdfPath), bytes: (await stat(pdfPath)).size, printed, approved, suggestedTitle, titleBefore, titleAfter,
    numPages: pdf.numPages, pages, allA4: pages.every(isA4), text: pages.map((p) => p.text).join(' ¶ '),
  };
}

try {
  // 0. Catálogo "Em branco".
  await page.goto(harnessUrl({ db }));
  await createCatalog(page, { name: 'TA-25N — Ficha para publicar', starter: 'Em branco' });
  await mark();
  let st = await state(page);
  j.step('0 catálogo "Em branco" aberto e salvo', st.mode === 'editor' && st.runtime?.saveLabel === 'Saved');
  measures.publishButton = await measure(publishButton());
  j.step('0 botão "Publicar / PDF" visível sem rolar, em destaque na barra de cima', measures.publishButton.fullyVisible && measures.publishButton.heightPx >= MIN_TARGET_PX,
    `${measures.publishButton.widthPx}×${measures.publishButton.heightPx} px · letra ${measures.publishButton.fontPx} px`);

  // ---- (a) Texto digitado e "Publicar / PDF" na hora, sem Concluir nem esperar salvar ----
  // Texto curto, que cabe no quadro padrão (82×22 mm, 16 pt negrito): o caminho "limpo". A frase real fica na (a3).
  const TEXT_A = 'Termômetro TA-25N';
  const textA = await insertText('a: escrever texto', 0, TEXT_A);
  st = await state(page);
  measures.beforePublishA = { dirty: st.runtime.dirty, savePhase: st.runtime.savePhase, textInDocument: docText(st).includes(TEXT_A) };
  await startTrace();
  const tA = Date.now();
  await clicks.click('a: publicar', publishButton());
  await review().waitFor({ timeout: 20000 });
  const openedMsA = Date.now() - tA;
  const doneA = await waitReviewDone();
  timings.a = { reviewOpenMs: openedMsA, readyMs: doneA >= 0 ? Date.now() - tA : -1 };
  const traceA = await stopTrace();
  measures.traceA = traceA;
  st = await state(page);
  const statusA = (await review().getByRole('status').first().innerText().catch(() => '')).trim();
  const itemsA = await review().getByRole('listitem').allInnerTexts();
  const previewTextA = await review().locator('[data-editorial-root]').innerText().catch(() => '');
  measures.reviewA = { hostStatus: await hostStatus(), statusText: statusA, items: itemsA, previewHasText: previewTextA.includes('TA-25N') };
  j.step('a o texto digitado NÃO se perdeu: Publicar concluiu a edição aberta e salvou o texto', docText(st).includes(TEXT_A) && JSON.stringify(st.runtime.stored ?? {}).includes(TEXT_A),
    `no documento: ${docText(st).includes(TEXT_A)} · no servidor: ${JSON.stringify(st.runtime.stored ?? {}).includes(TEXT_A)}`);
  const sawSaving = traceA.some((t) => t.button === 'Salvando…' || /Salvando/.test(t.dialogStatus ?? ''));
  j.step('a o app salvou sozinho e abriu a revisão sem travar (nenhum "Salve o catálogo…" preso)', doneA >= 0 && !/Salve o catálogo/.test(statusA) && st.runtime.dirty === false,
    `revisão aberta em ${openedMsA} ms · estado final em ${timings.a.readyMs} ms · "Salvando…" visível: ${sawSaving} · sequência: ${traceA.map((t) => `${t.ms}ms ${t.button ?? '-'} / ${t.hostStatus ?? '-'}`).join(' → ').slice(0, 300)}`);
  j.step('a catálogo limpo → "Pronto para imprimir ou salvar PDF." e a prévia mostra o texto', measures.reviewA.hostStatus === 'READY' && /Pronto para imprimir/.test(statusA) && itemsA.length === 0 && measures.reviewA.previewHasText,
    `estado: ${measures.reviewA.hostStatus} · "${statusA}" · itens: ${itemsA.length} · prévia tem o texto: ${measures.reviewA.previewHasText}`);
  // O que o diálogo pede do pai (FR-52: instrução de impressão em 1 linha).
  const instruction = page.locator('[data-publication-print-instruction]');
  measures.instruction = { count: await instruction.count(), ...(await instruction.count() ? await measure(instruction) : {}), text: (await instruction.innerText().catch(() => '')).trim() };
  measures.printButton = await measure(review().getByRole('button', { name: 'Imprimir / salvar PDF' }));
  measures.reviewStatus = await measure(review().getByRole('status').first());
  measures.recheckButton = await measure(review().getByRole('button', { name: 'Verificar novamente' }));
  j.step('a instrução de impressão é UMA linha, visível sem rolar, e diz o que escolher na janela do navegador', measures.instruction.count === 1 && measures.instruction.fullyVisible && /Salvar como PDF/.test(measures.instruction.text) && /Salvar\.?$/.test(measures.instruction.text),
    `"${measures.instruction.text}" · letra ${measures.instruction.fontPx} px · y=${measures.instruction.top}`);
  j.step('a "Imprimir / salvar PDF" ativo, visível sem rolar, alvo ≥ 24 px', measures.printButton.fullyVisible && measures.printButton.heightPx >= MIN_TARGET_PX && await review().getByRole('button', { name: 'Imprimir / salvar PDF' }).isEnabled(),
    `${measures.printButton.widthPx}×${measures.printButton.heightPx} px · letra ${measures.printButton.fontPx} px · status letra ${measures.reviewStatus.fontPx} px`);
  await jargonStep('a diálogo "Revisar e publicar"', '[data-publication-host] .vnext-publication-controls, [data-publication-host] header');
  j.addEvidence(await shot(page, 'j08-publicar-pdf-01-pronto'));

  // PDF (a): 1 página A4, texto pesquisável.
  const pdfA = await producePdf('a: imprimir / salvar PDF', 'j08-a-pronto');
  measures.pdfA = { ...pdfA, text: pdfA.text.slice(0, 300) };
  j.step('a "Imprimir / salvar PDF" aprova a impressão (1 chamada a imprimir, título do PDF = nome do catálogo)', pdfA.printed >= 0 && pdfA.approved === 'true' && pdfA.suggestedTitle === 'TA-25N — Ficha para publicar' && pdfA.titleAfter === pdfA.titleBefore,
    `print(): ${pdfA.printed >= 0 ? 1 : 0} · aprovado: ${pdfA.approved} · título sugerido: "${pdfA.suggestedTitle}" · restaurado: ${pdfA.titleAfter === pdfA.titleBefore}`);
  j.step('a PDF: 1 página A4 (595×842 pt), texto pesquisável com o que foi digitado, sem textos do diálogo', pdfA.numPages === 1 && pdfA.allA4 && pdfA.text.includes('TA-25N') && !pdfA.text.includes('Imprimir / salvar PDF') && !pdfA.text.includes('Voltar ao editor'),
    `${pdfA.path} · ${pdfA.bytes} bytes · páginas: ${pdfA.numPages} · ${JSON.stringify(pdfA.pages.map((p) => [p.widthPt, p.heightPt]))} · texto: "${pdfA.text.slice(0, 120)}"`);
  await clicks.click('a: voltar ao editor', review().getByRole('button', { name: 'Voltar ao editor' }));
  await host().waitFor({ state: 'detached', timeout: 5000 });
  const focusBack = await publishButton().evaluate((b) => b === document.activeElement);
  j.step('a "Voltar ao editor" devolve o foco ao botão "Publicar / PDF" (o pai não se perde)', focusBack);
  await checkReload('depois de (a)');

  // ---- (a2) Servidor lento: dá para VER "Salvando…"; a revisão continua sozinha quando o salvamento termina ----
  await editText('a2: editar texto', textA, `${TEXT_A} (2)`);
  await page.evaluate(() => window.__FATHER__.holdSaves(true));
  await startTrace();
  const tA2 = Date.now();
  await clicks.click('a2: publicar', publishButton());
  await page.waitForTimeout(400);
  const whileHeld = {
    button: (await publishButton().innerText().catch(() => '')).trim(),
    dialogOpen: await host().count() > 0,
    dialogStatus: (await host().locator('.vnext-publication-controls .vnext-status').innerText().catch(() => '')).trim(),
    waitingMarker: await host().locator('[data-publication-waiting]').count(),
  };
  measures.whileHeld = whileHeld;
  j.addEvidence(await shot(page, 'j08-publicar-pdf-02-salvando'));
  const released = await page.evaluate(() => { window.__FATHER__.holdSaves(false); return window.__FATHER__.releaseHeld(); });
  const doneA2 = await waitReviewDone();
  timings.a2 = { readyAfterReleaseMs: doneA2, released };
  const traceA2 = await stopTrace();
  measures.traceA2 = traceA2;
  const statusA2 = (await review().getByRole('status').first().innerText().catch(() => '')).trim();
  const sawSavingA2 = whileHeld.button === 'Salvando…' || /Salvando/.test(whileHeld.dialogStatus) || traceA2.some((t) => t.button === 'Salvando…' || /Salvando/.test(t.dialogStatus ?? ''));
  j.step('a2 com o servidor lento o pai vê "Salvando…" (no botão ou na revisão) e nada trava', sawSavingA2,
    `botão: "${whileHeld.button}" · diálogo aberto: ${whileHeld.dialogOpen} · status: "${whileHeld.dialogStatus}" · salvamentos liberados: ${released}`);
  j.step('a2 quando o salvamento termina a revisão segue SOZINHA até "Pronto" (sem clique extra)', doneA2 >= 0 && (await hostStatus()) === 'READY' && /Pronto para imprimir/.test(statusA2),
    `${doneA2} ms depois de liberar · "${statusA2}" · sequência: ${traceA2.map((t) => `${t.ms}ms ${t.button ?? '-'} / ${t.hostStatus ?? '-'}`).join(' → ').slice(0, 300)}`);
  await clicks.click('a2: voltar ao editor', review().getByRole('button', { name: 'Voltar ao editor' }));
  await host().waitFor({ state: 'detached', timeout: 5000 });
  await waitSaved(page, 15000);
  await checkReload('depois de (a2)');

  const savedAfterEdit = ((await page.locator('[data-vnext-shell] header [data-save-phase]').first().textContent()) ?? '').replace(/\s+/g, ' ').trim();
  j.step('a2 depois da edição e da confirmação o status mostra "Salvo às HH:MM" (FR-44)',
    /^Salvo às \d{2}:\d{2}$/.test(savedAfterEdit), savedAfterEdit);

  // ---- (a3) FR-14/15 integrada: a frase precisa caber no texto novo em Corpo (10 pt, sem negrito). ----
  const TEXT_REAL = 'Termômetro TA-25N: faixa de -25 °C a 140 °C';
  const textReal = await insertText('a3: escrever frase real', 0, TEXT_REAL, { conclude: true });
  await waitSaved(page, 15000);
  const textRealObject = (await state(page)).runtime.document.pages[0].objects.find((object) => object.id === textReal);
  j.step('a3 texto novo começa em Corpo, 10 pt, sem negrito (FR-14)',
    textRealObject?.style?.fontSizePt === 10 && textRealObject.style.fontWeight === 400,
    JSON.stringify(textRealObject?.style));
  const tA3 = Date.now();
  await clicks.click('a3: publicar', publishButton());
  await review().waitFor({ timeout: 20000 });
  const doneA3 = await waitReviewDone();
  timings.a3 = { resultMs: doneA3 >= 0 ? Date.now() - tA3 : -1 };
  const statusA3 = (await review().getByRole('status').first().innerText().catch(() => '')).trim();
  const overflowItem = review().locator('[data-publication-diagnostic="TEXT_OBJECT_OVERFLOW"]');
  const overflowCount = await overflowItem.count();
  measures.reviewA3 = {
    hostStatus: await hostStatus(), statusText: statusA3, items: await review().getByRole('listitem').allInnerTexts(), overflowCount,
    location: overflowCount ? (await overflowItem.first().locator('.vnext-diagnostic-location').innerText()).trim() : null,
    message: overflowCount ? (await overflowItem.first().locator('.vnext-diagnostic-message').innerText()).trim() : null,
  };
  if (measures.reviewA3.hostStatus === 'READY') {
    j.step('a3 uma frase real de uma linha ("Termômetro TA-25N: faixa de -25 °C a 140 °C") cabe no quadro padrão e publica', true, `${timings.a3.resultMs} ms`);
    await clicks.click('a3: voltar ao editor', review().getByRole('button', { name: 'Voltar ao editor' }));
    await host().waitFor({ state: 'detached', timeout: 5000 });
  } else {
    j.step('a3 a frase real cabe no quadro padrão e publica (FR-14/15)', false,
      `regressão após 2B: ${measures.reviewA3.hostStatus} em ${timings.a3.resultMs} ms · "${measures.reviewA3.location}" · "${measures.reviewA3.message}"`);
    if (overflowCount === 0) {
      await clicks.click('a3: voltar após outro bloqueio', review().getByRole('button', { name: 'Voltar ao editor' }));
      await host().waitFor({ state: 'detached', timeout: 5000 });
    } else {
    j.step('a3 o bloqueio explica em português, sem jargão, o que fazer ("Aumente o quadro de texto ou reduza o conteúdo")',
      overflowCount === 1 && /não cabe/.test(measures.reviewA3.message ?? '') && /Aumente o quadro|reduza/.test(measures.reviewA3.message ?? ''), `"${measures.reviewA3.message}"`);
    j.addEvidence(await shot(page, 'j08-publicar-pdf-02b-bloqueado-texto-nao-cabe'));
    const tFixA3 = Date.now();
    await clicks.click('a3: corrigir este item', overflowItem.first().getByRole('button', { name: 'Corrigir este item' }));
    await host().waitFor({ state: 'detached', timeout: 5000 });
    const focusedA3 = await waitMs(() => page.evaluate((id) => document.activeElement?.closest?.(`[data-editor-object-id="${id}"]`) !== null, textReal), { timeout: 5000 });
    timings.a3.locateMs = focusedA3 >= 0 ? Date.now() - tFixA3 : -1;
    j.step('a3 "Corrigir este item" leva ao texto que não cabe (página 1), com foco nele', focusedA3 >= 0 && /Página 1 de 1/.test(await pageLabel()), `${timings.a3.locateMs} ms · ${await pageLabel()}`);
    await editText('a3: encurtar o texto', textReal, 'Faixa: -25 a 140 °C', { conclude: true });
    await waitSaved(page, 15000);
    await clicks.click('a3: publicar de novo', publishButton());
    await review().waitFor({ timeout: 20000 });
    const doneA3b = await waitReviewDone();
    const statusA3b = (await review().getByRole('status').first().innerText().catch(() => '')).trim();
    j.step('a3 depois de encurtar o texto, Publicar / PDF → "Pronto"', doneA3b >= 0 && (await hostStatus()) === 'READY' && /Pronto para imprimir/.test(statusA3b), `"${statusA3b}"`);
    await clicks.click('a3: voltar ao editor', review().getByRole('button', { name: 'Voltar ao editor' }));
    await host().waitFor({ state: 'detached', timeout: 5000 });
    }
  }
  await checkReload('depois de (a3)');

  // ---- (b) "A COMPLETAR" num texto da página 2 → bloqueado → "Corrigir este item" leva ao texto, com foco ----
  await clicks.click('b: adicionar página', page.getByRole('button', { name: 'Adicionar nova página após a página atual' }));
  await page.waitForTimeout(400);
  st = await state(page);
  j.step('b página 2 adicionada', st.runtime.document.pages.length === 2 && /Página 2 de 2/.test(await pageLabel()), await pageLabel());
  const TEXT_B = 'Exatidão: A COMPLETAR';
  const textB = await insertText('b: escrever texto', 1, TEXT_B, { conclude: true });
  await waitSaved(page, 15000);
  await clicks.click('b: voltar à página 1', page.getByRole('navigation', { name: 'Navegação de páginas' }).getByRole('button', { name: 'Página 1', exact: true }));
  await page.waitForTimeout(300);
  j.step('b de volta à página 1 antes de publicar (o problema está na página 2)', /Página 1 de 2/.test(await pageLabel()), await pageLabel());
  const tB = Date.now();
  await clicks.click('b: publicar', publishButton());
  await review().waitFor({ timeout: 20000 });
  const doneB = await waitReviewDone();
  timings.b = { blockedMs: doneB >= 0 ? Date.now() - tB : -1 };
  const statusB = (await review().getByRole('status').first().innerText().catch(() => '')).trim();
  const itemsB = review().getByRole('listitem');
  const itemCount = await itemsB.count();
  const itemLocation = (await itemsB.first().locator('.vnext-diagnostic-location').innerText().catch(() => '')).trim();
  const itemMessage = (await itemsB.first().locator('.vnext-diagnostic-message').innerText().catch(() => '')).trim();
  const fixButton = itemsB.first().getByRole('button', { name: 'Corrigir este item' });
  const printB = review().getByRole('button', { name: 'Imprimir / salvar PDF' });
  measures.reviewB = {
    hostStatus: await hostStatus(), statusText: statusB, itemCount, itemLocation, itemMessage,
    fixButton: await fixButton.count() ? await measure(fixButton) : null, printDisabled: await printB.isDisabled().catch(() => null),
    detailsCount: await itemsB.first().locator('details').count(),
    detailsOpen: await itemsB.first().locator('details').evaluate((d) => d.open).catch(() => null),
    location: await itemsB.first().locator('.vnext-diagnostic-location').count() ? await measure(itemsB.first().locator('.vnext-diagnostic-location')) : null,
    message: await itemsB.first().locator('.vnext-diagnostic-message').count() ? await measure(itemsB.first().locator('.vnext-diagnostic-message')) : null,
  };
  j.step('b "A COMPLETAR" bloqueia: "Publicação bloqueada…", 1 item com o local exato e "Imprimir" desligado', measures.reviewB.hostStatus === 'BLOCKED' && /Publicação bloqueada/.test(statusB) && itemCount === 1 && /Página 2/.test(itemLocation) && /A COMPLETAR/.test(itemMessage) && measures.reviewB.printDisabled === true,
    `${timings.b.blockedMs} ms · "${statusB}" · local: "${itemLocation}" · mensagem: "${itemMessage}" · imprimir desligado: ${measures.reviewB.printDisabled}`);
  j.step('b "Corrigir este item" visível sem rolar, alvo ≥ 24 px; "Detalhes técnicos" ausente ou fechado', Boolean(measures.reviewB.fixButton?.fullyVisible) && (measures.reviewB.fixButton?.heightPx ?? 0) >= MIN_TARGET_PX
      && (measures.reviewB.detailsCount === 0 || measures.reviewB.detailsOpen === false),
    `botão: ${JSON.stringify(measures.reviewB.fixButton)} · detalhes: ${measures.reviewB.detailsCount} · abertos: ${measures.reviewB.detailsOpen} · local ${measures.reviewB.location?.fontPx} px · mensagem ${measures.reviewB.message?.fontPx} px`);
  await jargonStep('b diálogo bloqueado', '[data-publication-host] .vnext-publication-controls');
  j.addEvidence(await shot(page, 'j08-publicar-pdf-03-bloqueado'));
  // "Verificar novamente" roda de novo (e continua bloqueado, porque nada mudou).
  const tRecheck = Date.now();
  await clicks.click('b: verificar novamente', review().getByRole('button', { name: 'Verificar novamente' }));
  const recheckDone = await waitReviewDone();
  timings.b.recheckMs = recheckDone >= 0 ? Date.now() - tRecheck : -1;
  j.step('b "Verificar novamente" roda a verificação de novo sem travar (continua bloqueado, nada mudou)', recheckDone >= 0 && (await hostStatus()) === 'BLOCKED' && (await review().getByRole('listitem').count()) === 1, `${timings.b.recheckMs} ms`);
  // "Corrigir este item" → fecha a revisão, vai à página 2, seleciona o texto e dá foco.
  const tFix = Date.now();
  await clicks.click('b: corrigir este item', review().getByRole('listitem').first().getByRole('button', { name: 'Corrigir este item' }));
  await host().waitFor({ state: 'detached', timeout: 5000 });
  const focusedMs = await waitMs(() => page.evaluate((id) => document.activeElement?.closest?.(`[data-editor-object-id="${id}"]`) !== null
    || document.activeElement?.getAttribute?.('data-editor-object-id') === id, textB), { timeout: 5000 });
  timings.b.locateMs = focusedMs >= 0 ? Date.now() - tFix : -1;
  const afterFix = await page.evaluate((id) => {
    const active = document.activeElement;
    const target = document.querySelector(`[data-editor-object-id="${id}"]`);
    const rect = target?.getBoundingClientRect();
    return {
      activeTag: active?.tagName ?? null,
      activeObjectId: active?.getAttribute?.('data-editor-object-id') ?? active?.closest?.('[data-editor-object-id]')?.getAttribute('data-editor-object-id') ?? null,
      activeLabel: active?.getAttribute?.('aria-label') ?? null,
      targetSelected: target?.getAttribute('aria-selected') ?? target?.getAttribute('data-selected') ?? target?.className ?? null,
      targetInViewport: rect ? rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth : null,
    };
  }, textB);
  const arrival = await notice().count() ? { text: (await notice().locator('p').first().innerText().catch(() => '')).trim(), ...(await measure(notice())) } : null;
  const inspectorHeading = (await page.getByRole('complementary', { name: /Propriedades/ }).getByRole('heading').first().innerText().catch(() => '')).trim();
  measures.afterFix = { ...afterFix, pageLabel: await pageLabel(), inspectorHeading, arrival };
  j.step('b "Corrigir este item" fecha a revisão e leva à PÁGINA 2 com o texto selecionado', /Página 2 de 2/.test(measures.afterFix.pageLabel) && /Texto/i.test(inspectorHeading),
    `${timings.b.locateMs} ms · ${measures.afterFix.pageLabel} · painel: "${inspectorHeading}"`);
  j.step('b o FOCO vai para o texto com o problema (teclado continua dali)', afterFix.activeObjectId === textB, JSON.stringify({ ...afterFix, textB }));
  j.step('b ao chegar, uma mensagem explica o problema, visível sem rolar', Boolean(arrival?.text) && /A COMPLETAR/.test(arrival.text) && Boolean(arrival.fullyVisible), `"${arrival?.text ?? '-'}" · letra ${arrival?.fontPx} px`);
  j.addEvidence(await shot(page, 'j08-publicar-pdf-04-corrigir-leva-ao-texto'));
  // O status dizia "clique em Verificar novamente", mas a revisão fechou: depois de corrigir o pai precisa achar "Publicar / PDF" de novo.
  if (/Verificar novamente/.test(statusB)) {
    findingStep(j, 'b o aviso bloqueado manda "clicar em Verificar novamente", mas "Corrigir este item" fecha a revisão: depois de corrigir não existe "Verificar novamente" na tela — o pai tem de descobrir que é "Publicar / PDF" de novo',
      `status: "${statusB}" · depois de Corrigir: revisão fechada, botões visíveis na barra: Publicar / PDF (sem "Verificar novamente")`,
      { id: 'C-04', severity: 'P3', knownFR: 'FR-13' });
  }
  await checkReload('depois de Corrigir');

  // Corrige o texto (dois cliques, digita, Concluir) e publica de novo → Pronto; PDF com 2 páginas.
  await editText('b: corrigir o texto', textB, 'Exatidão: ±0,1 °C', { conclude: true });
  await waitSaved(page, 15000);
  const tB2 = Date.now();
  await clicks.click('b: publicar de novo', publishButton());
  await review().waitFor({ timeout: 20000 });
  const doneB2 = await waitReviewDone();
  timings.b.readyAfterFixMs = doneB2 >= 0 ? Date.now() - tB2 : -1;
  const statusB2 = (await review().getByRole('status').first().innerText().catch(() => '')).trim();
  j.step('b depois da correção, Publicar / PDF → "Pronto para imprimir ou salvar PDF." (sem itens)', (await hostStatus()) === 'READY' && /Pronto para imprimir/.test(statusB2) && (await review().getByRole('listitem').count()) === 0,
    `${timings.b.readyAfterFixMs} ms · "${statusB2}"`);
  const pdfB = await producePdf('b: imprimir / salvar PDF', 'j08-b-2-paginas');
  measures.pdfB = { ...pdfB, text: pdfB.text.slice(0, 400) };
  j.step('b PDF: 2 páginas A4, texto pesquisável nas duas, sem "A COMPLETAR"', pdfB.numPages === 2 && pdfB.allA4 && pdfB.pages[0].text.includes('TA-25N') && /Exatidão/.test(pdfB.pages[1].text) && !pdfB.text.includes('A COMPLETAR'),
    `${pdfB.path} · ${pdfB.bytes} bytes · páginas: ${pdfB.numPages} · ${JSON.stringify(pdfB.pages.map((p) => [p.widthPt, p.heightPt]))} · p1: "${pdfB.pages[0]?.text.slice(0, 80)}" · p2: "${pdfB.pages[1]?.text.slice(0, 80)}"`);
  j.addEvidence(await shot(page, 'j08-publicar-pdf-05-pronto-2-paginas'));
  await clicks.click('b: voltar ao editor', review().getByRole('button', { name: 'Voltar ao editor' }));
  await host().waitFor({ state: 'detached', timeout: 5000 });
  await checkReload('fim');

  // Console e cliques.
  const { appErrors, devServerNoise } = classifyConsole(log);
  measures.devServerNoise = devServerNoise.map((e) => e.text.slice(0, 200));
  j.step('zero erros de console (do aplicativo) e de página em toda a jornada', appErrors.length === 0 && log.pageErrors.length === 0,
    `console: ${appErrors.map((e) => e.text).join(' | ') || '-'} · página: ${log.pageErrors.join(' | ') || '-'} · ruído do vite ignorado: ${devServerNoise.length}`);
  measures.clicks = clicks.counts;
  measures.clicksToPdfInApp = 2; // Publicar / PDF + Imprimir / salvar PDF (o resto é a janela do navegador: humano)
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 900));
  await shot(page, 'j08-publicar-pdf-99-erro').then((p) => j.addEvidence(p)).catch(() => {});
} finally {
  if (reloads.length || viteEvents.some((e) => /page reload|full reload/i.test(e))) {
    j.step('ambiente: nenhuma recarga do servidor de desenvolvimento durante a prova (sem isso o resultado não vale; rode de novo)', false,
      `recarga em: ${reloads.join(', ') || '-'} · eventos vite: ${viteEvents.join(' | ').slice(0, 400) || '-'}`);
  }
  status = await finishJourneyGraded(j, log, { extra: { viewportUsed: viewport, server: server.baseUrl, timings, measures, texts, clicks: clicks.counts, viteEvents } });
  await browser.close();
  await server.close();
}
process.exit(status === 'fail' ? 1 : 0);

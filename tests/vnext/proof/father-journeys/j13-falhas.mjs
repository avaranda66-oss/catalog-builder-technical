// J13 — Falhas (grupo C, Equipe B): a parte que dá para testar nesta base.
//   (1) Foto grande: um JPEG 6000×4000 (2–4 MB, gerado num <canvas>) entra pelo botão "Imagem". Quanto tempo leva,
//       que mensagem aparece (sem rolar), se a foto é reduzida (3000 px) sem travar, e se "Publicar / PDF" fica Pronto
//       e o PDF A4 sai com a foto.
//   (2) IA com limite diário (?ia=limite): abrir o Assistente e enviar um pedido → mensagem em português dizendo o que
//       fazer, visível sem rolar; o pedido não se perde.
//   (3) Servidor sem IA (?ia=off): mensagem clara ao abrir e ao enviar.
//   Rede real e sessão expirada continuam pendentes neste harness local sem login, mesmo com 2G integrada.
//   BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j13-falhas.mjs
//   VP=1280 BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j13-falhas.mjs
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  OUT, VP_SUFFIX, createCatalog, ensureServer, freshDb, harnessUrl, journey, launch, rel, shot, state, visibleText, waitEditor,
  waitSaved,
} from './lib.mjs';
import {
  MIN_BODY_FONT_PX, MIN_TARGET_PX, classifyConsole, clickCounter, findingStep, finishJourneyGraded, measure, pendingStep,
  scanJargon, unexplainedMm, waitMs,
} from './fixtures/father-eyes.mjs';
import { inspectJpeg, makeLargeJpegOnPage } from './fixtures/photos/make-photos.mjs';

const server = await ensureServer();
const { browser, context, page, log, viewport } = await launch();
page.setDefaultTimeout(10000);
const j = journey('j13-falhas', 'J13 — falhas: foto grande (6000×4000) sem travar e com PDF; IA indisponível avisa em português; rede/sessão reais fora do harness');
const db = freshDb('j13');
/** "Zoom" é corrente em português; "Catalog Builder" é a marca; PDF/A4/JPEG/Gemini/IA são nomes que o pai conhece. */
const ALLOW = [/^(Catalog|Builder)$/, /^Zoom$/, /^(PDF|A4|JPEG|HEIC|JPG|PNG)$/i, /^Gemini$/];
/** A foto grande (2–4 MB) NÃO vai para fixtures/ (é pesada): fica em scratch/, gerada na primeira execução. */
const PHOTOS_OUT = resolve(OUT, 'photos');
const LARGE_JPEG = resolve(PHOTOS_OUT, 'foto-grande-6000x4000.jpg');
const PDF_DIR = resolve(OUT, 'pdf');
const PEDIDO = 'Crie uma capa e uma página de especificações para o termômetro TA-25N.';
const MSG_LIMITE = 'O limite diário de uso da IA foi atingido. Continue editando manualmente hoje; amanhã o limite renova.';
const MSG_SEM_IA = 'A IA do servidor ainda não foi configurada. Fale com o administrador.';
const clicks = clickCounter();
const timings = {};
const measures = {};
const texts = {};
let status = 'fail';

// Recarga do vite (outro agente salvando src/ no worktree) invalida a execução: marca a janela e confere no fim.
const viteEvents = [];
page.on('console', (m) => { if (/\[vite\]/.test(m.text())) viteEvents.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
const mark = () => page.evaluate(() => { window.__PROOF_MARK = true; }).catch(() => {});
const reloads = [];
const checkReload = async (where) => { if (await page.evaluate(() => window.__PROOF_MARK !== true).catch(() => false)) reloads.push(where); };

const shell = () => page.locator('[data-vnext-shell]');
const notice = () => page.locator('[data-editor-notice]').first();
const host = () => page.locator('[data-publication-host]');
const review = () => page.getByRole('dialog', { name: 'Revisar e publicar' });
const publishButton = () => page.getByRole('button', { name: /^(Publicar \/ PDF|Salvando…)$/ });
const dock = () => page.getByRole('complementary', { name: 'Assistente do catálogo atual', exact: true });
const hostStatus = () => host().getAttribute('data-publication-status').catch(() => null);
const imageObjects = (snapshot) => snapshot.runtime.document.pages.flatMap((p) => p.objects).filter((o) => o.type === 'image');
const noticeInfo = async () => {
  if (!(await notice().count())) return null;
  const m = await measure(notice());
  return { ...m, tone: await notice().getAttribute('data-tone'), text: (await notice().locator('p').first().innerText().catch(() => '')).trim() };
};
const jargonStep = async (label, selector) => {
  const text = await visibleText(page, selector);
  const hits = scanJargon(text, { allow: ALLOW });
  texts[label] = { hits, mm: unexplainedMm(text) };
  j.step(`${label}: tudo em português, sem jargão`, hits.length === 0, hits.map((h) => `${h.term} («${h.context}»)`).join(' | ') || '-');
};

/** Mede um elemento E confere se ele está visível dentro dos ancestrais com rolagem (o painel do assistente rola). */
async function measureInScroll(locator) {
  const base = await measure(locator);
  const inScroll = await locator.first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    let node = element.parentElement;
    let clipped = false; const clippers = [];
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (/(auto|scroll|hidden)/.test(style.overflowY + style.overflowX)) {
        const box = node.getBoundingClientRect();
        const inside = rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1 && rect.left >= box.left - 1 && rect.right <= box.right + 1;
        if (!inside) { clipped = true; clippers.push(`${node.className || node.tagName} (${Math.round(box.top)}–${Math.round(box.bottom)})`); }
      }
      node = node.parentElement;
    }
    return { clippedByScroll: clipped, clippers, bottom: Math.round(rect.bottom) };
  });
  return { ...base, ...inScroll, visibleWithoutScrolling: base.fullyVisible && !inScroll.clippedByScroll };
}

/** Grava cada mudança do aviso do editor ([data-editor-notice]) com o instante, para ver "Enviando imagem…" → "Imagem adicionada.". */
const startNoticeTrace = () => page.evaluate(() => {
  window.__J13_TRACE = [];
  const t0 = performance.now();
  const read = () => {
    const el = document.querySelector('[data-editor-notice]');
    return { text: el?.querySelector('p')?.textContent?.trim() ?? null, tone: el?.getAttribute('data-tone') ?? null };
  };
  let last = JSON.stringify(read());
  window.__J13_TRACE.push({ ms: 0, ...JSON.parse(last) });
  const observer = new MutationObserver(() => {
    const now = read(); const key = JSON.stringify(now);
    if (key !== last) { last = key; window.__J13_TRACE.push({ ms: Math.round(performance.now() - t0), ...now }); }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-tone'] });
  window.__J13_STOP = () => observer.disconnect();
});
const stopNoticeTrace = () => page.evaluate(() => { window.__J13_STOP?.(); return window.__J13_TRACE ?? []; });

/**
 * Espera `predicate()` e, enquanto espera, mede a maior pausa entre duas voltas (se a página trava no
 * processamento da foto, `evaluate` demora e a pausa cresce). Devolve { ms, longestGapMs }.
 */
async function waitMeasuringStalls(predicate, { timeout = 60000, every = 50 } = {}) {
  const startedAt = Date.now();
  let longestGapMs = 0; let last = Date.now();
  while (Date.now() - startedAt < timeout) {
    const ok = await predicate();
    const now = Date.now(); longestGapMs = Math.max(longestGapMs, now - last); last = now;
    if (ok) return { ms: now - startedAt, longestGapMs };
    await new Promise((r) => setTimeout(r, every));
  }
  return { ms: -1, longestGapMs };
}

/** "Imagem" → seletor do sistema → arquivo. Devolve o instante em que o arquivo foi entregue. */
async function chooseImage(task, filePath) {
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 8000 });
  await clicks.click(task, page.getByRole('button', { name: 'Imagem', exact: true }));
  const chooser = await chooserPromise;
  clicks.counts[task] += 1; // escolher o arquivo na janela do sistema também é um clique do pai
  await chooser.setFiles(filePath);
  return Date.now();
}

/** Clica "Imprimir / salvar PDF" com window.print falso, gera o PDF da visualização de impressão e inspeciona com pdfjs. */
async function producePdf(task, name) {
  await page.evaluate(() => { window.__J13_PRINTS = 0; window.print = () => { window.__J13_PRINTS += 1; }; });
  await clicks.click(task, review().getByRole('button', { name: 'Imprimir / salvar PDF' }));
  const printed = await waitMs(() => page.evaluate(() => window.__J13_PRINTS === 1), { timeout: 15000 });
  const approved = await host().getAttribute('data-print-approved');
  await page.emulateMedia({ media: 'print' });
  await mkdir(PDF_DIR, { recursive: true });
  const pdfPath = resolve(PDF_DIR, `${name}${VP_SUFFIX}.pdf`);
  const t0 = Date.now();
  await page.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, margin: { top: '0', right: '0', bottom: '0', left: '0' }, scale: 1 });
  const pdfMs = Date.now() - t0;
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  const pdf = await getDocument({ data: new Uint8Array(await readFile(pdfPath)), isEvalSupported: false, useSystemFonts: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const pdfPage = await pdf.getPage(i);
    const [x0, y0, x1, y1] = pdfPage.view;
    const content = await pdfPage.getTextContent();
    const operators = await pdfPage.getOperatorList();
    const images = operators.fnArray.filter((op) => [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat].includes(op)).length;
    pages.push({ widthPt: Math.round((x1 - x0) * 100) / 100, heightPt: Math.round((y1 - y0) * 100) / 100, images, text: content.items.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim() });
  }
  await pdf.destroy();
  const isA4 = (p) => Math.abs(p.widthPt - 595.28) < 1.5 && Math.abs(p.heightPt - 841.89) < 1.5;
  return { path: rel(pdfPath), bytes: (await stat(pdfPath)).size, pdfMs, printed, approved, numPages: pdf.numPages, pages, allA4: pages.every(isA4) };
}

/** Abre o Assistente IA pelo botão da barra e espera a prontidão sair de "Verificando a IA…". */
async function openAssistant(task) {
  const t0 = Date.now();
  await clicks.click(task, page.getByRole('button', { name: 'Abrir assistente de edição' }));
  await dock().waitFor({ timeout: 10000 });
  const readiness = dock().locator('.ai-readiness');
  await waitMs(async () => (await readiness.count()) > 0 && !/Verificando a IA/.test(await readiness.innerText().catch(() => 'Verificando a IA')), { timeout: 10000 });
  const text = (await readiness.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  return {
    ms: Date.now() - t0, readiness: text, readinessMeasure: await measureInScroll(readiness),
    keyInputs: await dock().locator('input[type="password"]').count(),
    advanced: await dock().getByRole('button', { name: 'Avançado (chave própria)' }).count(),
  };
}

try {
  // ================================================================ (1) FOTO GRANDE
  // Fixture pesada em scratch/: 6000×4000, 2–4 MB (gerada num <canvas> de uma aba em branco, uma vez só).
  await mkdir(PHOTOS_OUT, { recursive: true });
  let largeInfo;
  if (existsSync(LARGE_JPEG) && (await stat(LARGE_JPEG)).size >= 2_000_000 && (await stat(LARGE_JPEG)).size <= 4_000_000) {
    largeInfo = { reused: true, bytes: (await stat(LARGE_JPEG)).size };
  } else {
    const blank = await context.newPage();
    await blank.goto('about:blank');
    const made = await makeLargeJpegOnPage(blank, { width: 6000, height: 4000 });
    await blank.close();
    await writeFile(LARGE_JPEG, made.bytes);
    largeInfo = { reused: false, bytes: made.bytes.length, quality: made.quality, noise: made.noise, attempts: made.attempts, generateMs: made.ms };
  }
  const largeBytes = await readFile(LARGE_JPEG);
  const largeJpeg = inspectJpeg(largeBytes);
  measures.largeFixture = { path: rel(LARGE_JPEG), ...largeInfo, sof: largeJpeg.sof, mb: Math.round(largeBytes.length / 1024 / 1024 * 100) / 100 };
  j.step('F0 fixture: JPEG 6000×4000 com 2–4 MB (como uma foto real de celular)',
    largeJpeg.sof?.width === 6000 && largeJpeg.sof?.height === 4000 && largeBytes.length >= 2_000_000 && largeBytes.length <= 4_000_000,
    JSON.stringify(measures.largeFixture));

  await page.goto(harnessUrl({ db }));
  const catalogId = await createCatalog(page, { name: 'TA-25N — Ficha com foto grande', starter: 'Em branco' });
  await mark();
  let st = await state(page);
  j.step('F0 catálogo "Em branco" aberto e salvo', st.mode === 'editor' && st.runtime?.saveLabel === 'Saved' && imageObjects(st).length === 0);

  await startNoticeTrace();
  const tChosen = await chooseImage('foto grande', LARGE_JPEG);
  // Primeiro retorno visível (qualquer aviso) e conclusão ("Imagem adicionada.").
  const firstNotice = await waitMeasuringStalls(async () => (await notice().count()) > 0, { timeout: 15000, every: 25 });
  const firstInfo = await noticeInfo();
  const done = await waitMeasuringStalls(async () => /Imagem adicionada/.test((await notice().innerText().catch(() => ''))), { timeout: 60000, every: 50 });
  const doneAt = Date.now();
  const trace = await stopNoticeTrace();
  const doneInfo = await noticeInfo();
  timings.largePhoto = { firstNoticeMs: firstNotice.ms, firstNoticeText: firstInfo?.text ?? null, addedMs: done.ms >= 0 ? doneAt - tChosen : -1, longestStallMs: Math.max(firstNotice.longestGapMs, done.longestGapMs) };
  measures.largeNoticeTrace = trace;
  measures.largeFirstNotice = firstInfo;
  measures.largeDoneNotice = doneInfo;
  const sawProgress = trace.some((t) => /Enviando imagem/.test(t.text ?? '')) || /Enviando imagem/.test(firstInfo?.text ?? '');
  j.step('F1 em menos de 1 s aparece um retorno visível sem rolar ("Enviando imagem…" ou já "Imagem adicionada.")',
    firstNotice.ms >= 0 && firstNotice.ms < 1000 && Boolean(firstInfo?.fullyVisible),
    `${firstNotice.ms} ms · "${firstInfo?.text ?? '-'}" · tom: ${firstInfo?.tone ?? '-'} · visível: ${firstInfo?.fullyVisible} · andamento visto: ${sawProgress} · sequência: ${trace.map((t) => `${t.ms}ms "${t.text ?? '-'}"`).join(' → ').slice(0, 300)}`);
  j.step('F1 "Imagem adicionada." em menos de 15 s, sem travar a tela (maior pausa < 2 s)',
    timings.largePhoto.addedMs >= 0 && timings.largePhoto.addedMs < 15000 && timings.largePhoto.longestStallMs < 2000 && Boolean(doneInfo?.fullyVisible) && (doneInfo?.fontPx ?? 0) >= MIN_BODY_FONT_PX,
    `${timings.largePhoto.addedMs} ms · maior pausa ${timings.largePhoto.longestStallMs} ms · letra ${doneInfo?.fontPx} px · visível: ${doneInfo?.fullyVisible}`);
  st = await state(page);
  const inserted = imageObjects(st);
  measures.largeFinalized = st.finalized[0] ?? null;
  measures.largeUpload = st.uploads[0] ?? null;
  const reduced = st.finalized[0]?.widthPx === 3000 && st.finalized[0]?.heightPx === 2000 && (st.uploads[0]?.size ?? Infinity) < largeBytes.length;
  j.step('F2 a foto grande entrou (1 objeto) e foi reduzida sozinha para 3000×2000, mais leve que o original — sem pedir nada ao pai',
    inserted.length === 1 && reduced,
    `objetos: ${inserted.length} · guardada: ${JSON.stringify(st.finalized[0] ?? null)} · enviada: ${st.uploads[0]?.size ?? '-'} bytes (original ${largeBytes.length})`);
  const pageImage = shell().locator('main [data-editor-object-id] img, main img').first();
  const imgReady = await waitMs(async () => (await pageImage.count()) > 0 && await pageImage.evaluate((el) => el.complete && el.naturalWidth > 0).catch(() => false), { timeout: 15000 });
  const natural = imgReady >= 0 ? await pageImage.evaluate((el) => [el.naturalWidth, el.naturalHeight]) : null;
  measures.largeNatural = natural;
  j.step('F2 a foto aparece na página (3000×2000)', Boolean(natural) && natural[0] === 3000 && natural[1] === 2000, `${imgReady} ms · ${JSON.stringify(natural)}`);
  j.addEvidence(await shot(page, 'j13-falhas-01-foto-grande-inserida'));
  const savedMs = await waitMs(async () => { const s = await state(page); return s.runtime.dirty === false && s.runtime.savePhase === 'idle'; }, { timeout: 20000 });
  timings.largePhoto.savedMs = savedMs;
  st = await state(page);
  j.step('F2 "Salvo" volta sozinho depois da foto grande (nada se perde)', savedMs >= 0 && st.runtime.saveLabel === 'Saved', `${savedMs} ms · ${st.runtime.saveLabel}`);
  const savedAfterPhoto = ((await page.locator('[data-vnext-shell] header [data-save-phase]').first().textContent()) ?? '').replace(/\s+/g, ' ').trim();
  j.step('F2 o salvamento confirmado da foto mostra "Salvo às HH:MM" (FR-44)',
    /^Salvo às \d{2}:\d{2}$/.test(savedAfterPhoto), savedAfterPhoto);
  await jargonStep('F2 editor com a foto grande', '[data-vnext-shell]');
  // Nenhum aviso de "foto reduzida": o pai não precisa saber, mas se a nitidez importar (impressão A4 a 300 dpi
  // pede ~2480 px na largura), 3000 px bastam. Só registramos.
  await checkReload('depois da foto grande');

  // Publicar / PDF com a foto grande → Pronto; PDF A4 com a imagem.
  const closeNotice = page.getByRole('button', { name: 'Fechar aviso' });
  if (await closeNotice.count()) await closeNotice.first().click();
  const tPub = Date.now();
  await clicks.click('publicar', publishButton());
  await review().waitFor({ timeout: 20000 });
  const pubDone = await waitMs(async () => ['READY', 'BLOCKED'].includes((await hostStatus()) ?? ''), { timeout: 60000 });
  timings.largePhoto.publishReadyMs = pubDone >= 0 ? Date.now() - tPub : -1;
  const pubStatus = (await review().getByRole('status').first().innerText().catch(() => '')).trim();
  const pubItems = await review().getByRole('listitem').allInnerTexts();
  measures.largeReview = { hostStatus: await hostStatus(), statusText: pubStatus, items: pubItems };
  j.step('F3 Publicar / PDF com a foto grande → "Pronto para imprimir ou salvar PDF." (a foto não bloqueia nem demora)',
    measures.largeReview.hostStatus === 'READY' && /Pronto para imprimir/.test(pubStatus) && pubItems.length === 0 && timings.largePhoto.publishReadyMs < 15000,
    `${timings.largePhoto.publishReadyMs} ms · ${measures.largeReview.hostStatus} · "${pubStatus}" · itens: ${pubItems.length}`);
  const pdf = await producePdf('imprimir / salvar PDF', 'j13-foto-grande');
  measures.largePdf = pdf;
  j.step('F3 PDF: 1 página A4 com a foto dentro (imagem embutida), gerado em menos de 15 s',
    pdf.printed >= 0 && pdf.approved === 'true' && pdf.numPages === 1 && pdf.allA4 && pdf.pages[0].images > 0 && pdf.pdfMs < 15000,
    `${pdf.path} · ${pdf.bytes} bytes · ${pdf.pdfMs} ms · páginas: ${pdf.numPages} · ${JSON.stringify(pdf.pages.map((p) => [p.widthPt, p.heightPt, `${p.images} img`]))}`);
  j.addEvidence(await shot(page, 'j13-falhas-02-publicar-pronto-foto-grande'));
  await clicks.click('voltar ao editor', review().getByRole('button', { name: 'Voltar ao editor' }));
  await host().waitFor({ state: 'detached', timeout: 5000 });
  await checkReload('depois do PDF');

  // ================================================================ (2) IA COM LIMITE DIÁRIO (?ia=limite)
  await page.goto(harnessUrl({ db, ia: 'limite', catalog: catalogId }));
  await waitEditor(page);
  await waitSaved(page);
  await mark();
  const assistButton = page.getByRole('button', { name: 'Abrir assistente de edição' });
  measures.assistButton = await measure(assistButton);
  j.step('L0 o botão "Assistente IA" está visível sem rolar', measures.assistButton.fullyVisible, `${measures.assistButton.widthPx}×${measures.assistButton.heightPx} px · letra ${measures.assistButton.fontPx} px`);
  const limite = await openAssistant('abrir assistente (limite)');
  texts.prontidaoLimite = limite.readiness;
  measures.prontidaoLimite = limite.readinessMeasure;
  timings.limite = { openMs: limite.ms };
  j.step('L1 ao abrir, o painel JÁ avisa do limite diário em português, antes de o pai digitar (sem pedir chave)',
    limite.readiness === MSG_LIMITE && limite.keyInputs === 0,
    `"${limite.readiness}" · em ${limite.ms} ms · campos de chave: ${limite.keyInputs} · letra ${limite.readinessMeasure.fontPx} px · visível sem rolar: ${limite.readinessMeasure.visibleWithoutScrolling}`);
  const boxL = dock().getByRole('textbox', { name: 'Seu pedido ao Gemini' });
  await boxL.fill(PEDIDO);
  const sendL = dock().getByRole('button', { name: 'Enviar ao Gemini' });
  measures.sendButtonLimite = { ...(await measure(sendL)), enabled: await sendL.isEnabled() };
  const tL = Date.now();
  await clicks.click('enviar (limite)', sendL);
  const alertL = dock().locator('[role="alert"]').first();
  const alertLms = await waitMs(async () => (await alertL.count()) > 0, { timeout: 10000 });
  timings.limite.alertMs = alertLms >= 0 ? Date.now() - tL : -1;
  texts.alertaLimite = (await alertL.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  measures.alertaLimite = alertLms >= 0 ? await measureInScroll(alertL) : null;
  const unsentL = await dock().locator('.ai-chat-unsent').count();
  const boxValueL = await boxL.inputValue();
  // A mensagem completa termina com " O catálogo não foi alterado." (composer-messages.ts): por isso startsWith.
  j.step('L2 ao enviar, a mensagem diz O QUE FAZER ("Continue editando manualmente hoje; amanhã o limite renova") em menos de 2 s',
    timings.limite.alertMs >= 0 && timings.limite.alertMs < 2000 && texts.alertaLimite.startsWith(MSG_LIMITE),
    `${timings.limite.alertMs} ms · "${texts.alertaLimite}"`);
  j.step('L2 a mensagem está visível SEM ROLAR (nem a página nem o painel)',
    Boolean(measures.alertaLimite?.visibleWithoutScrolling),
    `visível: ${measures.alertaLimite?.fullyVisible} · cortada pelo painel: ${measures.alertaLimite?.clippedByScroll} ${JSON.stringify(measures.alertaLimite?.clippers ?? [])} · base y=${measures.alertaLimite?.bottom} (janela ${viewport.height})`);
  // FR-16b integrada: o tamanho da instrução precisa passar, não depender de uma fatia já entregue.
  if ((measures.alertaLimite?.fontPx ?? 0) < MIN_BODY_FONT_PX) {
    j.step('L2 a mensagem de limite tem letra legível (FR-16b)', false,
      `${measures.alertaLimite?.fontPx} px (< ${MIN_BODY_FONT_PX}); prontidão: ${limite.readinessMeasure.fontPx} px`);
  } else {
    j.step('L2 a mensagem de limite tem letra legível (≥ 13 px)', true, `${measures.alertaLimite?.fontPx} px`);
  }
  j.step('L2 o pedido NÃO se perde: volta para a caixa, marcado como "não enviado"', unsentL === 1 && boxValueL === PEDIDO, `não enviado: ${unsentL} · caixa: "${boxValueL}"`);
  st = await state(page);
  j.step('L2 o catálogo não foi alterado pela tentativa (0 páginas novas, continua "Salvo")', st.runtime.document.pages.length === 1 && st.runtime.saveLabel === 'Saved', `páginas: ${st.runtime.document.pages.length} · ${st.runtime.saveLabel}`);
  await jargonStep('L2 painel do assistente (limite)', '[data-vnext-assistant="open"]');
  j.addEvidence(await shot(page, 'j13-falhas-03-ia-limite-diario'));
  // O botão "Enviar" continua ativo mesmo com o painel avisando do limite: o pai digita, envia e só então leva o "não".
  if (measures.sendButtonLimite.enabled && limite.readiness === MSG_LIMITE) {
    findingStep(j, 'L3 com o limite diário já avisado no topo do painel, "Enviar ao Gemini" continua ativo: o pai digita o pedido inteiro e só depois recebe o mesmo aviso (trabalho em vão)',
      `prontidão: "${limite.readiness}" · botão Enviar ativo: ${measures.sendButtonLimite.enabled} · caixa de texto aceita digitar`,
      { id: 'C-05', severity: 'P3', knownFR: 'FR-61' });
  } else {
    j.step('L3 com o limite avisado, o envio fica desligado ou explica antes de digitar', true);
  }
  await checkReload('depois do limite');

  // ================================================================ (3) SERVIDOR SEM IA (?ia=off)
  await page.goto(harnessUrl({ db, ia: 'off', catalog: catalogId }));
  await waitEditor(page);
  await waitSaved(page);
  await mark();
  const off = await openAssistant('abrir assistente (sem IA)');
  texts.prontidaoSemIA = off.readiness;
  measures.prontidaoSemIA = off.readinessMeasure;
  timings.semIA = { openMs: off.ms };
  j.step('O1 com o servidor sem IA, o painel avisa em português ao abrir, sem pedir chave nem senha',
    off.readiness.startsWith(MSG_SEM_IA) && off.keyInputs === 0,
    `"${off.readiness}" · em ${off.ms} ms · campos de chave: ${off.keyInputs} · letra ${off.readinessMeasure.fontPx} px · visível sem rolar: ${off.readinessMeasure.visibleWithoutScrolling}`);
  // Mesmo problema D-04 do grupo D: a mensagem cita um botão ausente.
  if (/Avançado \(chave própria\)/.test(off.readiness) && off.advanced === 0) {
    findingStep(j, 'O2 a mensagem "servidor sem IA" manda usar "Avançado (chave própria)", mas esse botão não existe na tela (D-04)',
      `"${off.readiness}" · botões "Avançado (chave própria)": ${off.advanced}`, { id: 'C-06', severity: 'P2', knownFR: 'FR-60' });
  } else {
    j.step('O2 a mensagem "servidor sem IA" não cita botão inexistente', true, `"${off.readiness}"`);
  }
  const boxO = dock().getByRole('textbox', { name: 'Seu pedido ao Gemini' });
  await boxO.fill(PEDIDO);
  const tO = Date.now();
  await clicks.click('enviar (sem IA)', dock().getByRole('button', { name: 'Enviar ao Gemini' }));
  const alertO = dock().locator('[role="alert"]').first();
  const alertOms = await waitMs(async () => (await alertO.count()) > 0, { timeout: 10000 });
  timings.semIA.alertMs = alertOms >= 0 ? Date.now() - tO : -1;
  texts.alertaSemIA = (await alertO.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  measures.alertaSemIA = alertOms >= 0 ? await measureInScroll(alertO) : null;
  j.step('O3 ao enviar, a mesma explicação aparece como aviso visível sem rolar e o pedido volta para a caixa',
    timings.semIA.alertMs >= 0 && texts.alertaSemIA.startsWith(MSG_SEM_IA) && Boolean(measures.alertaSemIA?.visibleWithoutScrolling) && (await boxO.inputValue()) === PEDIDO,
    `${timings.semIA.alertMs} ms · "${texts.alertaSemIA}" · visível sem rolar: ${measures.alertaSemIA?.visibleWithoutScrolling} · letra ${measures.alertaSemIA?.fontPx} px`);
  await jargonStep('O3 painel do assistente (sem IA)', '[data-vnext-assistant="open"]');
  j.addEvidence(await shot(page, 'j13-falhas-04-servidor-sem-ia'));
  await checkReload('depois do sem IA');

  // ================================================================ (4) LIMITES DO HARNESS
  pendingStep(j, 'R1 rede desligada por 30 s durante a edição: "Sem conexão" visível, nada se perde, salvamento retomado sozinho',
    'FR-44/FR-45 integradas; a prova de rede real permanece pendente porque este harness salva em localStorage e não emula o transporte remoto. Os testes de persistência verificam as retentativas, sem substituir esta jornada real.');
  pendingStep(j, 'R2 sessão expirada: aviso "Sessão expirada" com o que fazer, sem perder o trabalho',
    'FR-44 integrada; o harness não tem autenticação, portanto não exercita expiração de sessão real. Validar em ambiente autenticado sem fechar a aba com alterações.');

  // ================================================================ console e cliques
  const { appErrors, devServerNoise } = classifyConsole(log);
  measures.devServerNoise = devServerNoise.map((e) => e.text.slice(0, 200));
  j.step('zero erros de console (do aplicativo) e de página em toda a jornada', appErrors.length === 0 && log.pageErrors.length === 0,
    `console: ${appErrors.map((e) => e.text).join(' | ') || '-'} · página: ${log.pageErrors.join(' | ') || '-'} · ruído do vite ignorado: ${devServerNoise.length}`);
  measures.clicks = clicks.counts;
  measures.clicksTotal = Object.values(clicks.counts).reduce((a, b) => a + b, 0);
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 900));
  await shot(page, 'j13-falhas-99-erro').then((p) => j.addEvidence(p)).catch(() => {});
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

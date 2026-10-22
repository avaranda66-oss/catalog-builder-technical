// J6 — Foto de celular (grupo C, Equipe B). O pai cria um catálogo "Em branco", clica "Imagem" e escolhe um
// JPEG retrato tirado no celular (EXIF Orientation=6): a foto tem de aparecer DE PÉ (vermelho em cima, azul
// embaixo — a borda esquerda da paisagem original vai para o topo) e a mensagem "Imagem adicionada." tem de
// aparecer sem rolar. Depois escolhe uma foto HEIC de iPhone: mensagem clara, em português, dizendo como
// converter. Por fim "Publicar / PDF": a foto não bloqueia e a prévia mostra a foto de pé.
//   BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j06-foto-celular.mjs
//   VP=1280 BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j06-foto-celular.mjs
import { readFile } from 'node:fs/promises';
import {
  createCatalog, ensureServer, freshDb, harnessUrl, journey, launch, shot, state, visibleText, waitSaved,
} from './lib.mjs';
import {
  MIN_TARGET_PX, classifyConsole, clickCounter, findingStep, finishJourneyGraded, measure, scanJargon, unexplainedMm,
  waitMs,
} from './fixtures/father-eyes.mjs';
import { EXIF6_JPEG, FAKE_HEIC, ensurePhotoFixtures, inspectJpeg } from './fixtures/photos/make-photos.mjs';

const fixtures = await ensurePhotoFixtures();
const server = await ensureServer();
const { browser, page, log, viewport } = await launch();
page.setDefaultTimeout(10000);
const j = journey('j06-foto-celular', 'J6 — foto de celular: JPEG retrato (EXIF 6) de pé, HEIC explicado, Publicar / PDF não bloqueia');
const db = freshDb('j06');
/** "Zoom" é corrente em português; "Catalog Builder" é a marca; PDF/A4/JPEG/HEIC são os nomes que o pai conhece. */
const ALLOW = [/^(Catalog|Builder)$/, /^Zoom$/, /^(PDF|A4|JPEG|HEIC|JPG|PNG|WebP)$/i];
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
const noticeInfo = async () => {
  if (!(await notice().count())) return null;
  const m = await measure(notice());
  return { ...m, tone: await notice().getAttribute('data-tone'), text: (await notice().locator('p').first().innerText().catch(() => '')).trim() };
};
const pageImage = () => shell().locator('main [data-editor-object-id] img, main img').first();
const imageObjects = (snapshot) => snapshot.runtime.document.pages.flatMap((p) => p.objects).filter((o) => o.type === 'image');
const jargonStep = async (label) => {
  const text = await visibleText(page, '[data-vnext-shell]');
  const hits = scanJargon(text, { allow: ALLOW });
  const mm = unexplainedMm(text);
  texts[label] = { hits, mm };
  j.step(`${label}: tudo em português, sem jargão`, hits.length === 0, hits.map((h) => `${h.term} («${h.context}»)`).join(' | ') || '-');
};

/** Pixels da imagem como ela é mostrada: topo, base, esquerda, direita (RGB). */
async function samplePixels(locator) {
  return locator.evaluate(async (el) => {
    await el.decode().catch(() => {});
    const canvas = document.createElement('canvas');
    canvas.width = el.naturalWidth; canvas.height = el.naturalHeight;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(el, 0, 0);
    const at = (x, y) => Array.from(g.getImageData(Math.floor(x * canvas.width), Math.floor(y * canvas.height), 1, 1).data).slice(0, 3);
    const rect = el.getBoundingClientRect();
    return {
      natural: [el.naturalWidth, el.naturalHeight], box: [Math.round(rect.width), Math.round(rect.height)],
      top: at(0.5, 0.1), bottom: at(0.5, 0.9), left: at(0.1, 0.5), right: at(0.9, 0.5),
      objectFit: getComputedStyle(el).objectFit, imageOrientation: getComputedStyle(el).imageOrientation,
    };
  });
}
const isRed = ([r, g, b]) => r > 150 && g < 90 && b < 90;
const isBlue = ([r, g, b]) => b > 140 && r < 90 && g < 140;

/** "Imagem" → seletor do sistema → arquivo. Devolve o instante em que o arquivo foi entregue. */
async function chooseImage(task, filePath) {
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 8000 });
  await clicks.click(task, page.getByRole('button', { name: 'Imagem', exact: true }));
  const chooser = await chooserPromise;
  measures.chooserAccept = await chooser.element().getAttribute('accept');
  clicks.counts[task] += 1; // escolher o arquivo na janela do sistema também é um clique do pai
  await chooser.setFiles(filePath);
  return Date.now();
}

try {
  const jpegBytes = await readFile(EXIF6_JPEG);
  const jpegInfo = inspectJpeg(jpegBytes);
  const heicBytes = await readFile(FAKE_HEIC);
  measures.fixtures = {
    jpeg: { path: fixtures.jpeg, bytes: jpegBytes.length, sof: jpegInfo.sof, orientationEntry: jpegInfo.orientationEntry },
    heic: { path: fixtures.heic, bytes: heicBytes.length, signature: heicBytes.subarray(4, 12).toString('latin1') },
  };
  j.step('0 fixtures: JPEG paisagem 3000×2000 com EXIF Orientation=6 e HEIC com assinatura "ftypheic"',
    jpegInfo.sof?.width === 3000 && jpegInfo.sof?.height === 2000 && jpegInfo.orientationEntry?.[9] === 6
      && heicBytes.subarray(4, 12).toString('latin1') === 'ftypheic',
    JSON.stringify(measures.fixtures));

  // 0. Catálogo "Em branco" pela interface.
  await page.goto(harnessUrl({ db }));
  await createCatalog(page, { name: 'Catálogo com foto', starter: 'Em branco' });
  await mark();
  let st = await state(page);
  j.step('0 catálogo "Em branco" aberto e salvo', st.mode === 'editor' && st.runtime?.saveLabel === 'Saved' && imageObjects(st).length === 0);

  // 1. O botão "Imagem" existe, está visível sem rolar e tem tamanho de alvo razoável.
  const imageButton = page.getByRole('button', { name: 'Imagem', exact: true });
  measures.imageButton = await measure(imageButton);
  j.step('1 botão "Imagem" visível sem rolar na barra acima da página', measures.imageButton.fullyVisible,
    `${measures.imageButton.widthPx}×${measures.imageButton.heightPx} px · letra ${measures.imageButton.fontPx} px · y=${measures.imageButton.top}`);
  if (measures.imageButton.heightPx < MIN_TARGET_PX) {
    findingStep(j, '1 botão "Imagem" é um alvo pequeno', `altura ${measures.imageButton.heightPx} px (< ${MIN_TARGET_PX})`, { id: 'C-xx', severity: 'P3', knownFR: 'FR-16b' });
  }

  // 2. JPEG retrato de celular.
  await chooseImage('inserir foto', EXIF6_JPEG);
  const noticeMs = await waitMs(async () => (await notice().count()) > 0 && /Imagem/.test((await notice().innerText().catch(() => ''))), { timeout: 15000 });
  timings.jpegNoticeMs = noticeMs;
  const jpegNotice = await noticeInfo();
  measures.jpegNotice = jpegNotice;
  j.step('2 mensagem "Imagem adicionada." aparece em menos de 2 s', noticeMs >= 0 && noticeMs < 2000 && /Imagem adicionada/.test(jpegNotice?.text ?? ''),
    `${noticeMs} ms · "${jpegNotice?.text ?? '-'}" · tom: ${jpegNotice?.tone ?? '-'}`);
  j.step('2 a mensagem fica visível sem rolar, com letra legível (≥ 13 px)', Boolean(jpegNotice?.fullyVisible) && (jpegNotice?.fontPx ?? 0) >= 13,
    `visível: ${jpegNotice?.fullyVisible} · letra ${jpegNotice?.fontPx} px · y=${jpegNotice?.top}`);
  const imgMs = await waitMs(async () => (await pageImage().count()) > 0 && await pageImage().evaluate((el) => el.complete && el.naturalWidth > 0).catch(() => false), { timeout: 15000 });
  timings.jpegImageMs = imgMs;
  st = await state(page);
  const inserted = imageObjects(st);
  measures.jpegFinalized = st.finalized;
  measures.jpegUploads = st.uploads;
  measures.jpegFrame = inserted[0]?.frame ?? null;
  j.step('2 a foto entrou no catálogo (1 objeto de imagem, salvo em 2000×3000 — retrato)',
    inserted.length === 1 && st.finalized[0]?.widthPx === 2000 && st.finalized[0]?.heightPx === 3000 && st.finalized[0]?.mime === 'image/jpeg',
    `objetos: ${inserted.length} · guardada: ${JSON.stringify(st.finalized[0] ?? null)} · enviada: ${st.uploads[0]?.size ?? '-'} bytes (original ${jpegBytes.length})`);
  const pixels = imgMs >= 0 ? await samplePixels(pageImage()) : null;
  measures.jpegPixels = pixels;
  j.step('2 a foto aparece DE PÉ na página (vermelho em cima, azul embaixo; 2000×3000)',
    Boolean(pixels) && pixels.natural[0] === 2000 && pixels.natural[1] === 3000 && isRed(pixels.top) && isBlue(pixels.bottom),
    `${imgMs} ms · ${JSON.stringify(pixels)}`);
  j.addEvidence(await shot(page, 'j06-foto-celular-01-foto-inserida'));
  // Moldura × foto: a moldura nova é quadrada (58×58 mm); a foto retrato fica "contida" com faixas vazias dos lados.
  if (pixels && measures.jpegFrame) {
    const frame = measures.jpegFrame;
    const drawnWidth = pixels.box[1] * (pixels.natural[0] / pixels.natural[1]);
    const emptyShare = 1 - drawnWidth / pixels.box[0];
    measures.frameFit = { frameMm: `${frame.widthMm}×${frame.heightMm}`, boxPx: pixels.box, drawnWidthPx: Math.round(drawnWidth), emptyShare: Math.round(emptyShare * 100) / 100, objectFit: pixels.objectFit };
    if (pixels.objectFit === 'contain' && Math.abs(frame.widthMm - frame.heightMm) < 0.5 && emptyShare > 0.25) {
      findingStep(j, '2 a moldura da foto nova é quadrada: a foto retrato aparece com faixas vazias dos lados (seleção maior que a foto)',
        `moldura ${frame.widthMm}×${frame.heightMm} mm · foto desenhada com ${Math.round(drawnWidth)} de ${pixels.box[0]} px de largura (${Math.round(emptyShare * 100)} % vazio)`,
        { id: 'C-01', severity: 'P3', knownFR: null });
    } else {
      j.step('2 a moldura acompanha a proporção da foto', true, JSON.stringify(measures.frameFit));
    }
  }
  const imgBox = await pageImage().boundingBox().catch(() => null);
  if (imgBox) {
    j.addEvidence(await shot(page, 'j06-foto-celular-02-foto-close', {
      clip: { x: Math.max(0, imgBox.x - 40), y: Math.max(0, imgBox.y - 40), width: Math.min(viewport.width, imgBox.width + 80), height: Math.min(viewport.height, imgBox.height + 80) },
    }));
  }
  const savedMs = await waitMs(async () => { const s = await state(page); return s.runtime.dirty === false && s.runtime.savePhase === 'idle'; }, { timeout: 15000 });
  timings.jpegSavedMs = savedMs;
  st = await state(page);
  j.step('2 "Salvo" volta sozinho depois da foto', savedMs >= 0 && st.runtime.saveLabel === 'Saved', `${savedMs} ms · ${st.runtime.saveLabel}`);
  await jargonStep('2 editor com a foto');
  await checkReload('depois do JPEG');

  // 3. HEIC de iPhone.
  const closeNotice = page.getByRole('button', { name: 'Fechar aviso' });
  if (await closeNotice.count()) await closeNotice.first().click();
  const objectsBefore = imageObjects(await state(page)).length;
  await chooseImage('tentar HEIC', FAKE_HEIC);
  const heicMs = await waitMs(async () => (await notice().count()) > 0 && /HEIC/i.test((await notice().innerText().catch(() => ''))), { timeout: 15000 });
  timings.heicNoticeMs = heicMs;
  const heicNotice = await noticeInfo();
  measures.heicNotice = heicNotice;
  const heicText = heicNotice?.text ?? '';
  j.step('3 HEIC: mensagem aparece em menos de 2 s, visível sem rolar', heicMs >= 0 && heicMs < 2000 && Boolean(heicNotice?.fullyVisible),
    `${heicMs} ms · visível: ${heicNotice?.fullyVisible} · tom: ${heicNotice?.tone} · letra ${heicNotice?.fontPx} px`);
  j.step('3 HEIC: a mensagem diz que é HEIC e COMO resolver ("Mais compatível" ou JPEG), em português',
    /HEIC/.test(heicText) && /Mais compat[ií]vel/.test(heicText) && /JPEG/.test(heicText) && !/unsupported|format not|error/i.test(heicText),
    `"${heicText}"`);
  st = await state(page);
  j.step('3 HEIC: nada foi inserido nem enviado por engano', imageObjects(st).length === objectsBefore && st.uploads.length === 1,
    `objetos de imagem: ${imageObjects(st).length} (antes ${objectsBefore}) · envios: ${st.uploads.length}`);
  j.addEvidence(await shot(page, 'j06-foto-celular-03-heic-mensagem'));
  // Quanto tempo a mensagem fica? Um aviso que exige ação deveria ficar até o pai fechar (tom "error", FR-12).
  const heicShownAt = Date.now();
  const goneAfterMs = await waitMs(async () => !((await notice().count()) > 0 && /HEIC/.test(await notice().innerText().catch(() => ''))), { timeout: 8000, every: 100 });
  measures.heicNoticeVisibleMs = goneAfterMs >= 0 ? goneAfterMs : `> ${Date.now() - heicShownAt}`;
  if (goneAfterMs >= 0 && goneAfterMs < 6000) {
    findingStep(j, '3 HEIC: a mensagem some sozinha em ~4 s, antes de o pai terminar de ler (tom "info" em vez de "error")',
      `sumiu depois de ${goneAfterMs} ms sem ninguém clicar em Fechar · tom: ${heicNotice?.tone} · texto: "${heicText}"`,
      { id: 'C-03', severity: 'P2', knownFR: null });
  } else {
    j.step('3 HEIC: a mensagem continua na tela até ser fechada (dá tempo de ler)', true, `visível por ${measures.heicNoticeVisibleMs} ms`);
  }
  // O que falta para o pai: ONDE fica "Mais compatível" no iPhone, e o que fazer se a foto veio de outra pessoa.
  if (/Mais compat[ií]vel/.test(heicText) && !/Ajustes|Configura[çc]/.test(heicText)) {
    findingStep(j, '3 HEIC: a mensagem cita "Mais compatível" sem dizer onde fica (Ajustes › Câmera › Formatos) nem como pedir a foto em JPEG',
      `"${heicText}" — o pai não sabe o que é "Mais compatível" nem que é um ajuste do iPhone de quem tirou a foto`,
      { id: 'C-02', severity: 'P3', knownFR: null });
  }
  await checkReload('depois do HEIC');

  // 4. Publicar / PDF não bloqueia por causa da foto; a prévia mostra a foto de pé.
  if (await closeNotice.count()) await closeNotice.first().click();
  await waitSaved(page, 15000).catch(() => {});
  const publishButton = page.getByRole('button', { name: /^(Publicar \/ PDF|Salvando…)$/ });
  measures.publishButton = await measure(publishButton);
  const t2 = Date.now();
  await clicks.click('publicar', publishButton);
  const review = page.getByRole('dialog', { name: 'Revisar e publicar' });
  await review.waitFor({ timeout: 20000 });
  const readyMs = await waitMs(async () => ['READY', 'BLOCKED'].includes((await page.locator('[data-publication-host]').getAttribute('data-publication-status')) ?? ''), { timeout: 30000 });
  timings.publishReadyMs = readyMs >= 0 ? Date.now() - t2 : -1;
  const publicationStatus = await page.locator('[data-publication-host]').getAttribute('data-publication-status');
  const statusText = (await review.getByRole('status').first().innerText().catch(() => '')).trim();
  const items = await review.getByRole('listitem').allInnerTexts();
  const printButton = review.getByRole('button', { name: 'Imprimir / salvar PDF' });
  measures.reviewStatus = { publicationStatus, statusText, items, printEnabled: await printButton.isEnabled().catch(() => null) };
  j.step('4 Publicar / PDF com a foto: "Pronto para imprimir ou salvar PDF." e botão de imprimir ativo (foto não bloqueia)',
    publicationStatus === 'READY' && /Pronto para imprimir/.test(statusText) && items.length === 0 && measures.reviewStatus.printEnabled === true,
    `${timings.publishReadyMs} ms · estado: ${publicationStatus} · "${statusText}" · itens: ${items.length}`);
  const previewImage = review.locator('[data-editorial-root] img').first();
  const previewReady = await waitMs(async () => (await previewImage.count()) > 0 && await previewImage.evaluate((el) => el.complete && el.naturalWidth > 0).catch(() => false), { timeout: 10000 });
  const previewPixels = previewReady >= 0 ? await samplePixels(previewImage) : null;
  measures.previewPixels = previewPixels;
  j.step('4 a prévia de impressão mostra a foto de pé (vermelho em cima, azul embaixo)',
    Boolean(previewPixels) && isRed(previewPixels.top) && isBlue(previewPixels.bottom) && previewPixels.natural[0] === 2000,
    JSON.stringify(previewPixels));
  j.addEvidence(await shot(page, 'j06-foto-celular-04-publicar-pronto'));
  await clicks.click('voltar ao editor', review.getByRole('button', { name: 'Voltar ao editor' }));
  await page.locator('[data-publication-host]').waitFor({ state: 'detached', timeout: 5000 });
  const shellInert = await shell().evaluate((el) => el.inert);
  j.step('4 "Voltar ao editor" devolve um editor que responde (sem travar)', shellInert === false);
  await checkReload('fim');

  // 5. Console limpo e contagem de cliques.
  const { appErrors, devServerNoise } = classifyConsole(log);
  measures.devServerNoise = devServerNoise.map((e) => e.text.slice(0, 200));
  j.step('5 zero erros de console (do aplicativo) e de página em toda a jornada', appErrors.length === 0 && log.pageErrors.length === 0,
    `console: ${appErrors.map((e) => e.text).join(' | ') || '-'} · página: ${log.pageErrors.join(' | ') || '-'} · ruído do vite ignorado: ${devServerNoise.length}`);
  measures.clicks = clicks.counts;
  measures.clicksTotal = Object.values(clicks.counts).reduce((a, b) => a + b, 0);
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 900));
  await shot(page, 'j06-foto-celular-99-erro').then((p) => j.addEvidence(p)).catch(() => {});
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

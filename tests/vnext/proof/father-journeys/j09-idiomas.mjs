// J9 — Idiomas (grupo E, Equipe B). O pai tem uma ficha em português com textos técnicos reais e quer a cópia em
// inglês: "Traduzir" → Centro de Tradução → escolhe Inglês → "Gerar tradução" → revisa → "Salvar cópia traduzida" →
// "Abrir cópia traduzida" → "Publicar / PDF" da cópia EN. Depois gera o espanhol e confere que a vírgula fica.
// O provedor do harness é controlado (devolve "EN: <texto>" / "ES: <texto>"), então o que se julga aqui é a TELA de
// revisão (FR-85/FR-87 desta branch): aviso "Aplicar ajuste de números" em EN ("0,02 % FE" → "0.02 % FS"), pergunta
// explícita para o "1.500" ambíguo, glossário PRESYS ("Order Code", "Operating Range", "Standard Delivery") e ES
// mantendo a vírgula — nunca a qualidade da tradução.
//   BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j09-idiomas.mjs
//   VP=1280 BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j09-idiomas.mjs
import { mkdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  OUT, VP_SUFFIX, createCatalog, ensureServer, freshDb, harnessUrl, journey, launch, rel, shot, state, waitEditor,
  waitLibrary, waitSaved,
} from './lib.mjs';
import {
  classifyConsole, clickCounter, findingStep, finishJourneyGraded, measure, measureAll, pendingStep, scanJargon,
  unexplainedMm, waitMs, MIN_BODY_FONT_PX, MIN_TARGET_PX,
} from './fixtures/father-eyes.mjs';

const CATALOG = 'TA-25N — Ficha técnica 2026';
/** Textos técnicos reais de uma ficha PRESYS (um por caixa de texto). */
const TEXTS = {
  exatidao: 'Exatidão: ±0,02 % FE',
  estabilidade: 'Estabilidade: ±0,02 °C',
  faixa: 'Faixa de Operação: -25 a 140 °C',
  encomenda: 'Código de Encomenda',
  fornecimento: 'Fornecimento Padrão',
  pressao: 'Pressão máxima: 1.500 mbar',
};
/** Siglas técnicas que o pai conhece e que o Centro de Tradução precisa mostrar. */
const ALLOW = [/^(EN|ES|FS|FE|RDG|PDF|A4)$/, /^(Catalog|Builder)$/];
const PDF_DIR = resolve(OUT, 'pdf');

const server = await ensureServer();
const { browser, page, log, viewport } = await launch();
const j = journey('j09-idiomas', 'J9 — Idiomas: Traduzir → Centro de Tradução → inglês com ponto decimal e "% FS", "1.500" pede confirmação, glossário PRESYS → cópia EN salva, aberta e publicada; espanhol mantém a vírgula');
const db = freshDb('j09');
const clicks = clickCounter();
const timings = {};
const measures = {};
const texts = {};
const observations = {};
let status = 'fail';

const shell = () => page.locator('[data-vnext-shell]');
const inspector = () => page.getByRole('complementary', { name: /Inspector|Propriedades/ });
const dialog = () => page.getByRole('dialog', { name: 'Centro de Tradução' });
const runs = () => dialog().locator('.vnext-translation-run');
const runWith = (source) => runs().filter({ has: page.locator('.vnext-translation-source', { hasText: source }) }).first();
const runText = (run) => run.locator('textarea').inputValue();
const runState = (run) => run.getAttribute('data-translation-run-state');
const runStatus = (run) => run.locator('.vnext-translation-run-status').innerText();
const textObjects = (snapshot) => snapshot.runtime.document.pages.flatMap((p) => p.objects).filter((o) => o.type === 'text');
const docText = (document) => JSON.stringify(document);
const review = () => page.getByRole('dialog', { name: 'Revisar e publicar' });
const host = () => page.locator('[data-publication-host]');
const hostStatus = () => host().getAttribute('data-publication-status').catch(() => null);
const storedCatalog = (id) => page.evaluate((catalogId) => JSON.parse(localStorage.getItem(`father-journeys:catalog:${catalogId}`) ?? 'null'), id);

/** Varre o texto visível de um bloco e registra jargão/inglês e "mm" sem explicação. */
async function jargonStep(label, locator) {
  const text = (await locator.allInnerTexts()).join('\n');
  const hits = scanJargon(text, { allow: ALLOW });
  texts[label] = { hits, mm: unexplainedMm(text), sample: text.replace(/\s+/g, ' ').slice(0, 500) };
  j.step(`${label}: tudo em português, sem jargão`, hits.length === 0, hits.map((h) => `${h.term} («${h.context}»)`).join(' | ') || '-');
}

/** Creates a real text, commits each frame field on blur and waits for this text's automatic save. */
async function insertText(task, value) {
  const before = new Set(textObjects(await state(page)).map((o) => o.id));
  await clicks.click(task, page.getByRole('button', { name: 'Texto', exact: true }));
  await page.waitForTimeout(250);
  const created = textObjects(await state(page)).find((o) => !before.has(o.id));
  if (!created) throw new Error(`"Texto" não criou um texto: ${value}`);
  const hit = page.locator(`[data-editor-object-id="${created.id}"]`);
  await hit.scrollIntoViewIfNeeded();
  await hit.dblclick();
  clicks.counts[task] = (clicks.counts[task] ?? 0) + 2;
  const box = page.getByRole('textbox', { name: 'Editar conteúdo do texto' });
  await box.waitFor({ timeout: 5000 });
  await box.fill(value);
  await clicks.click(task, page.getByRole('button', { name: 'Concluir', exact: true }).first());
  await page.locator('[data-text-edit-session]').waitFor({ state: 'detached', timeout: 5000 });
  await page.waitForTimeout(150);
  // O texto continua selecionado depois de Concluir; o painel "Propriedades" mostra X/Y/Largura/Altura em "Mais propriedades".
  const more = inspector().getByRole('button', { name: 'Mais propriedades' });
  const xField = inspector().getByRole('textbox', { name: /^X\b/ });
  if ((await more.count()) === 0 && (await xField.count()) === 0) { await hit.click(); await page.waitForTimeout(200); }
  if (await more.count()) { await clicks.click(task, more); await page.waitForTimeout(200); }
  // Six separate, non-overlapping boxes: this journey tests translation, while J4 covers text styling.
  // Enter deliberately keeps an inspector field active; Tab commits and leaves it before the next action.
  for (const [field, property, mm] of [['X', 'xMm', 20], ['Y', 'yMm', 20 + before.size * 28], ['Largura', 'widthMm', 170]]) {
    const input = inspector().getByRole('textbox', { name: new RegExp(`^${field}\\b`) });
    await input.waitFor({ timeout: 5000 });
    await input.click();
    await input.fill(String(mm));
    await input.press('Tab');
    clicks.counts[task] = (clicks.counts[task] ?? 0) + 1;
    await page.waitForFunction(({ id, property, mm }) => {
      const object = window.__FATHER__.state().runtime.document.pages.flatMap((p) => p.objects).find((o) => o.id === id);
      return object && Math.abs(object.frame[property] - mm) < 0.01;
    }, { id: created.id, property, mm }, { timeout: 5000 });
  }
  await hit.click();
  await page.keyboard.press('Escape');
  await waitSaved(page, 20000);
  const saved = await state(page);
  const object = textObjects(saved).find((candidate) => candidate.id === created.id);
  j.step(`0 texto ${before.size + 1} foi confirmado automaticamente no catálogo`,
    docText(saved.runtime.stored).includes(value) && saved.runtime.saveLabel === 'Saved', value);
  (observations.preparacao ??= []).push({ id: created.id, frame: object.frame, dirty: saved.runtime.dirty, phase: saved.runtime.savePhase, saveDispatchCount: saved.saveDispatchCount });
  return created.id;
}

/** Clica "Imprimir / salvar PDF" com window.print falso, gera o PDF da visualização de impressão e lê com pdfjs. */
async function producePdf(task, name) {
  await page.evaluate(() => { window.__J9_PRINTS = 0; window.print = () => { window.__J9_PRINTS += 1; }; });
  await clicks.click(task, review().getByRole('button', { name: 'Imprimir / salvar PDF' }));
  const printed = await waitMs(() => page.evaluate(() => window.__J9_PRINTS === 1), { timeout: 10000 });
  const approved = await host().getAttribute('data-print-approved');
  const suggestedTitle = await page.title();
  await page.emulateMedia({ media: 'print' });
  await mkdir(PDF_DIR, { recursive: true });
  const pdfPath = resolve(PDF_DIR, `${name}${VP_SUFFIX}.pdf`);
  await page.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, margin: { top: '0', right: '0', bottom: '0', left: '0' }, scale: 1 });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
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
  return { path: rel(pdfPath), bytes: (await stat(pdfPath)).size, printed, approved, suggestedTitle, numPages: pdf.numPages, pages, allA4: pages.every(isA4), text: pages.map((p) => p.text).join(' ¶ ') };
}

try {
  // ------------------------------------------------------------------ 0. Ficha em português com os textos reais
  await page.goto(harnessUrl({ db }));
  await createCatalog(page, { name: CATALOG, starter: 'Em branco' });
  const originalId = (await state(page)).runtime.catalogId;
  for (const value of Object.values(TEXTS)) await insertText('escrever a ficha', value);
  await waitSaved(page, 20000);
  let st = await state(page);
  const written = Object.values(TEXTS).filter((t) => docText(st.runtime.document).includes(t));
  j.step('0 os 6 textos técnicos estão na página e salvos', written.length === 6 && st.runtime.saveLabel === 'Saved', `${written.length}/6 · ${st.runtime.saveLabel}`);
  j.addEvidence(await shot(page, 'j09-01-ficha-em-portugues'));

  // ------------------------------------------------------------------ 1. Descobrir onde se traduz
  const translateButton = page.getByRole('button', { name: 'Traduzir', exact: true });
  const topButtons = await shell().locator('header').getByRole('button').allInnerTexts().catch(() => []);
  const languageWords = topButtons.map((t) => t.trim()).filter((t) => /tradu|idioma|ingl|espanhol|language/i.test(t));
  measures.traduzir = await measure(translateButton);
  observations.nomeRealDoBotao = measures.traduzir.text;
  j.step('1 há UM botão de idiomas na barra de cima, chamado "Traduzir", visível sem rolar, alvo ≥ 24 px', (await translateButton.count()) === 1 && languageWords.length === 1 && measures.traduzir.fullyVisible && measures.traduzir.heightPx >= MIN_TARGET_PX,
    `botões com tradu/idioma: ${JSON.stringify(languageWords)} · ${measures.traduzir.widthPx}×${measures.traduzir.heightPx} px · letra ${measures.traduzir.fontPx} px`);

  // O pai acaba de digitar e clica "Traduzir" NA HORA (sem esperar o "Salvo"): o que acontece?
  const lastText = textObjects(st).at(-1);
  await page.locator(`[data-editor-object-id="${lastText.id}"]`).dblclick();
  const box = page.getByRole('textbox', { name: 'Editar conteúdo do texto' });
  await box.waitFor({ timeout: 5000 });
  await box.fill(`${TEXTS.pressao} `);
  await page.getByRole('button', { name: 'Concluir', exact: true }).first().click();
  const tOpen = Date.now();
  await clicks.click('traduzir', translateButton);
  await dialog().waitFor({ timeout: 10000 });
  timings.abrirCentroMs = Date.now() - tOpen;
  const saveWhenOpened = (await state(page)).runtime;
  observations.estadoAoAbrir = { dirty: saveWhenOpened.dirty, savePhase: saveWhenOpened.savePhase };
  j.step('2 "Traduzir" logo depois de editar abre o Centro de Tradução (a edição aberta é concluída, nada se perde)', (await dialog().isVisible()) && docText(saveWhenOpened.document).includes(TEXTS.pressao),
    `aberto em ${timings.abrirCentroMs} ms · ao abrir: ${saveWhenOpened.dirty ? 'ainda salvando' : 'salvo'} (${saveWhenOpened.savePhase})`);

  // ------------------------------------------------------------------ 2. O Centro de Tradução como o pai vê
  const select = dialog().getByRole('combobox', { name: 'Idioma de destino' });
  const generate = dialog().getByRole('button', { name: 'Gerar tradução', exact: true });
  measures.centro = await measureAll({
    titulo: dialog().getByRole('heading', { name: 'Centro de Tradução' }),
    descricao: dialog().locator('#translation-description'),
    etapas: dialog().getByRole('list', { name: 'Etapas da tradução' }),
    idioma: select,
    gerar: generate,
    fechar: dialog().getByRole('button', { name: 'Fechar', exact: true }),
  });
  observations.idiomaPadrao = await select.inputValue();
  observations.opcoesDeIdioma = await select.locator('option').allInnerTexts();
  texts.etapas = (await dialog().getByRole('list', { name: 'Etapas da tradução' }).innerText()).replace(/\s+/g, ' ');
  j.step('3 o Centro explica o que vai acontecer ("Gere e revise uma cópia… O catálogo original será preservado"), em 3 etapas nomeadas, letra ≥ 13 px',
    /original será preservado/.test(measures.centro.descricao?.text ?? '') && /Idioma.*Revisão.*Cópia salva/.test(texts.etapas) && measures.centro.descricao.fontPx >= MIN_BODY_FONT_PX,
    `descrição ${measures.centro.descricao?.fontPx} px · etapas: "${texts.etapas}" · título ${measures.centro.titulo?.fontPx} px`);
  j.step('4 "Idioma de destino" é uma lista com Espanhol e Inglês; "Gerar tradução" é o botão principal, ≥ 24 px, visível sem rolar',
    observations.opcoesDeIdioma.length === 2 && /Inglês/.test(observations.opcoesDeIdioma.join()) && measures.centro.gerar.fullyVisible && measures.centro.gerar.heightPx >= MIN_TARGET_PX && measures.centro.idioma.heightPx >= MIN_TARGET_PX,
    `opções: ${JSON.stringify(observations.opcoesDeIdioma)} · padrão: ${observations.idiomaPadrao} · Gerar ${measures.centro.gerar.widthPx}×${measures.centro.gerar.heightPx} px letra ${measures.centro.gerar.fontPx} px · lista ${measures.centro.idioma.heightPx} px letra ${measures.centro.idioma.fontPx} px`);
  await jargonStep('5 Centro de Tradução antes de gerar', dialog());
  j.addEvidence(await shot(page, 'j09-02-centro-de-traducao'));

  // ------------------------------------------------------------------ 3. Gerar o inglês
  await select.selectOption('en-US');
  clicks.counts['escolher inglês'] = 1;
  const tGen = Date.now();
  await clicks.click('gerar tradução', generate);
  const sawGenerating = await waitMs(() => dialog().getByText(/Gerando tradução em inglês/).isVisible().catch(() => false), { timeout: 3000 });
  const firstMessage = (await dialog().getByRole('alert').allInnerTexts()).join(' ');
  const runsReady = await waitMs(async () => (await runs().count()) > 0, { timeout: 30000 });
  timings.gerarMs = runsReady >= 0 ? Date.now() - tGen : -1;
  observations.mensagemAoGerar = firstMessage.trim() || null;
  if (/Salve o catálogo/.test(firstMessage)) {
    findingStep(j, '6 "Gerar tradução" logo depois de editar mostra "Salve o catálogo e conclua as edições antes de traduzir." em vez de salvar sozinho (como "Publicar / PDF" faz)',
      `mensagem: "${firstMessage.trim()}" · o pai precisa esperar o "Salvo" e clicar de novo`, { id: 'E-01', severity: 'P2', knownFR: null });
    if (runsReady < 0) {
      await waitSaved(page, 20000);
      await clicks.click('gerar tradução', dialog().getByRole('button', { name: /^(Gerar tradução|Tentar tradução novamente)$/ }));
      await waitMs(async () => (await runs().count()) > 0, { timeout: 30000 });
    }
  } else {
    j.step('6 "Gerar tradução" funciona na hora, sem pedir para salvar antes', runsReady >= 0, `${timings.gerarMs} ms · "Gerando…" visível: ${sawGenerating >= 0} · mensagem: "${firstMessage.trim() || '-'}"`);
  }
  const runCount = await runs().count();
  observations.trechos = runCount;
  texts.progresso = (await dialog().locator('.vnext-translation-review-progress').innerText().catch(() => '')).replace(/\s+/g, ' ');
  j.step('7 aparece a revisão com um trecho por texto (6 textos + título), lado a lado "Original · Português" / "Tradução · Inglês", e o contador "0 de N trechos revisados"',
    runCount === 7 && /0 de 7 trechos revisados/.test(texts.progresso) && (await dialog().getByText('Original · Português').count()) === runCount && (await dialog().getByText('Tradução · Inglês').count()) === runCount,
    `trechos: ${runCount} · "${texts.progresso}" · em ${timings.gerarMs} ms`);
  const firstRun = runs().first();
  measures.revisao = await measureAll({
    original: firstRun.locator('.vnext-translation-source'),
    traducao: firstRun.locator('textarea'),
    sugestao: dialog().locator('.vnext-translation-suggestion p').first(),
    botaoSugestao: dialog().locator('.vnext-translation-suggestion button').first(),
    marcarRevisado: firstRun.getByRole('button', { name: /Marcar trecho \d+ como revisado/ }),
    salvarCopia: dialog().getByRole('button', { name: 'Salvar cópia traduzida' }),
    cancelar: dialog().getByRole('button', { name: 'Cancelar', exact: true }),
  });
  j.step('8 letras legíveis na revisão (original, tradução e avisos ≥ 13 px) e botões ≥ 24 px; "Salvar cópia traduzida" visível sem rolar',
    measures.revisao.original.fontPx >= MIN_BODY_FONT_PX && measures.revisao.traducao.fontPx >= MIN_BODY_FONT_PX && (measures.revisao.sugestao?.fontPx ?? 99) >= MIN_BODY_FONT_PX
      && (measures.revisao.botaoSugestao?.heightPx ?? 99) >= MIN_TARGET_PX && measures.revisao.marcarRevisado.heightPx >= MIN_TARGET_PX && measures.revisao.salvarCopia.fullyVisible && measures.revisao.salvarCopia.heightPx >= MIN_TARGET_PX,
    `original ${measures.revisao.original.fontPx} px · tradução ${measures.revisao.traducao.fontPx} px · aviso ${measures.revisao.sugestao?.fontPx} px · botão do aviso ${measures.revisao.botaoSugestao?.heightPx} px · Marcar ${measures.revisao.marcarRevisado.heightPx} px · Salvar ${measures.revisao.salvarCopia.heightPx} px (visível: ${measures.revisao.salvarCopia.fullyVisible})`);
  observations.primeiroAvisoAntesDeRolar = measures.revisao.sugestao;
  const exatSuggestion = runWith(TEXTS.exatidao).locator('[data-suggestion="numbers"]');
  await exatSuggestion.scrollIntoViewIfNeeded();
  measures.avisoExatidaoNoTrecho = await measureAll({
    aviso: exatSuggestion.locator('p'),
    botao: exatSuggestion.getByRole('button', { name: /^Aplicar ajuste de números/ }),
  });
  j.step('9 depois de rolar até Exatidão, o aviso e seu botão aparecem integralmente ao lado do trecho',
    Boolean(measures.avisoExatidaoNoTrecho.aviso?.fullyVisible) && Boolean(measures.avisoExatidaoNoTrecho.botao?.fullyVisible),
    `estado inicial preservado: ${JSON.stringify(observations.primeiroAvisoAntesDeRolar)} · no trecho: ${JSON.stringify(measures.avisoExatidaoNoTrecho)}`);
  await jargonStep('10 revisão (todos os trechos e avisos)', dialog());
  j.addEvidence(await shot(page, 'j09-03-revisao-com-avisos'));

  // ------------------------------------------------------------------ 4. Os avisos FR-85/FR-87, trecho por trecho
  // 4a. "Exatidão: ±0,02 % FE" → "Aplicar ajuste de números" → "0.02 % FS"
  const exat = runWith(TEXTS.exatidao);
  texts.exatidaoAntes = await runText(exat);
  const exatFix = exat.getByRole('button', { name: /^Aplicar ajuste de números/ });
  texts.exatidaoAviso = (await exat.locator('[data-suggestion="numbers"] p').innerText().catch(() => '')).replace(/\s+/g, ' ');
  j.step('11 em "Exatidão: ±0,02 % FE" a tradução vem com "EN: " e o aviso mostra os ajustes 0,02 → 0.02 e % FE → % FS com o botão "Aplicar ajuste de números (…)"',
    texts.exatidaoAntes === `EN: ${TEXTS.exatidao}` && (await exatFix.count()) === 1
      && /0,02\s*→\s*0\.02/.test(texts.exatidaoAviso) && /% FE\s*→\s*% FS/.test(texts.exatidaoAviso),
    `tradução: "${texts.exatidaoAntes}" · aviso: "${texts.exatidaoAviso}" · botão: ${await exatFix.innerText().catch(() => '-')}`);
  const tFix = Date.now();
  await clicks.click('ajustar números', exatFix);
  const fixedMs = await waitMs(async () => (await runText(exat)) === 'EN: Exatidão: ±0.02 % FS', { timeout: 5000 });
  timings.ajusteNumerosMs = fixedMs >= 0 ? Date.now() - tFix : -1;
  texts.exatidaoDepois = await runText(exat);
  const exatState = await runState(exat);
  const exatStatus = (await runStatus(exat)).trim();
  j.step('12 um clique aplica "0.02 % FS" no texto, o botão some e o trecho passa a "Corrigido e revisado" (resposta visível no próprio trecho)',
    texts.exatidaoDepois === 'EN: Exatidão: ±0.02 % FS' && (await exatFix.count()) === 0 && exatState === 'corrected' && /Corrigido e revisado/.test(exatStatus),
    `"${texts.exatidaoDepois}" · estado: ${exatState} · status: "${exatStatus}" · em ${timings.ajusteNumerosMs} ms`);

  // 4b. "Estabilidade: ±0,02 °C" → "0.02 °C"
  const estab = runWith(TEXTS.estabilidade);
  const estabFix = estab.getByRole('button', { name: /^Aplicar ajuste de números/ });
  const estabHad = await estabFix.count();
  if (estabHad) await clicks.click('ajustar números', estabFix);
  await waitMs(async () => (await runText(estab)) === 'EN: Estabilidade: ±0.02 °C', { timeout: 5000 });
  texts.estabilidade = await runText(estab);
  j.step('13 "Estabilidade: ±0,02 °C" também oferece o ajuste e vira "±0.02 °C"', estabHad === 1 && texts.estabilidade === 'EN: Estabilidade: ±0.02 °C', `botão: ${estabHad} · "${texts.estabilidade}"`);

  // 4c. Glossário PRESYS: "Faixa de Operação" → "Operating Range", "Código de Encomenda" → "Order Code", "Fornecimento Padrão" → "Standard Delivery"
  const glossaryChecks = [[TEXTS.faixa, 'Operating Range'], [TEXTS.encomenda, 'Order Code'], [TEXTS.fornecimento, 'Standard Delivery']];
  const glossaryResults = [];
  for (const [source, expected] of glossaryChecks) {
    const run = runWith(source);
    const hint = (await run.locator('[data-suggestion="glossary"] p').allInnerTexts()).join(' | ');
    const numberButton = await run.getByRole('button', { name: /^Aplicar ajuste de números/ }).count();
    glossaryResults.push({ source, expected, hint, numberButton, translation: await runText(run) });
  }
  texts.glossario = glossaryResults;
  j.step('14 o glossário PRESYS lembra os termos oficiais ("Glossário PRESYS: use \'Order Code\'…" / "Operating Range" / "Standard Delivery") e NÃO oferece ajuste de números em "-25 a 140 °C" (inteiros ficam)',
    glossaryResults.every((r) => r.hint.includes(`'${r.expected}'`) && r.numberButton === 0),
    glossaryResults.map((r) => `${r.source} → "${r.hint || '(sem aviso)'}" · botão de números: ${r.numberButton}`).join(' | '));

  // 4d. "1.500 mbar" ambíguo → pergunta explícita, nunca "1,500 → 1.500" automático
  const pressao = runWith(TEXTS.pressao);
  const pressaoConfirm = pressao.locator('[data-suggestion="confirm"]');
  texts.pressaoAntes = await runText(pressao);
  texts.pressaoPergunta = (await pressaoConfirm.locator('p').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const answerButtons = await pressaoConfirm.getByRole('button').allInnerTexts();
  texts.pressaoOpcoes = answerButtons;
  const pressaoNumberButton = await pressao.getByRole('button', { name: /^Aplicar ajuste de números/ }).count();
  // A leitura decimal preserva as três casas do original (1.500), conforme o contrato técnico;
  // reduzir a 1.5 perderia precisão. A pessoa precisa chegar ao trecho e ver as duas leituras antes de escolher.
  await pressaoConfirm.scrollIntoViewIfNeeded();
  const thousandsOption = pressaoConfirm.getByRole('button', { name: 'mil e quinhentos (1,500)', exact: true });
  const decimalOption = pressaoConfirm.getByRole('button', { name: 'um vírgula cinco (1.500)', exact: true });
  measures.pergunta = await measureAll({ texto: pressaoConfirm.locator('p'), milhar: thousandsOption, decimal: decimalOption });
  const readableQuestion = Object.values(measures.pergunta).every((item) => item?.fullyVisible && item.fontPx >= MIN_BODY_FONT_PX);
  const readableOptions = [measures.pergunta.milhar, measures.pergunta.decimal].every((item) => item?.heightPx >= MIN_TARGET_PX && item.widthPx >= MIN_TARGET_PX);
  j.step('15 "1.500 mbar" permanece inalterado antes da escolha; depois de rolar até o trecho aparecem a pergunta e duas opções legíveis, com as três casas decimais preservadas',
    texts.pressaoAntes.trimEnd() === `EN: ${TEXTS.pressao}`
      && /Confirme: '1\.500' é mil e quinhentos ou um vírgula cinco\?/.test(texts.pressaoPergunta)
      && answerButtons.length === 2 && answerButtons.includes('mil e quinhentos (1,500)') && answerButtons.includes('um vírgula cinco (1.500)')
      && pressaoNumberButton === 0 && readableQuestion && readableOptions,
    `antes da escolha: "${texts.pressaoAntes}" · pergunta: "${texts.pressaoPergunta}" · opções: ${JSON.stringify(answerButtons)} · botão "Aplicar ajuste" neste trecho: ${pressaoNumberButton} · medidas: ${JSON.stringify(measures.pergunta)}`);
  j.addEvidence(await shot(page, 'j09-03b-confirmacao-1500'));
  await clicks.click('confirmar 1.500', thousandsOption);
  await waitMs(async () => /1,500 mbar/.test(await runText(pressao)), { timeout: 5000 });
  texts.pressaoDepois = await runText(pressao);
  j.step('16 escolher "mil e quinhentos" grava "1,500 mbar" no inglês e a pergunta some', /^EN: Pressão máxima: 1,500 mbar\s?$/.test(texts.pressaoDepois) && (await pressao.locator('[data-suggestion="confirm"]').count()) === 0,
    `"${texts.pressaoDepois}"`);
  texts.progressoDepois = (await dialog().locator('.vnext-translation-review-progress').innerText()).replace(/\s+/g, ' ');
  j.addEvidence(await shot(page, 'j09-04-avisos-aplicados'));

  // "Marcar como revisado" num trecho sem aviso: resposta imediata?
  const faixaRun = runWith(TEXTS.faixa);
  const tMark = Date.now();
  await clicks.click('marcar revisado', faixaRun.getByRole('button', { name: /Marcar trecho \d+ como revisado/ }));
  const markedMs = await waitMs(async () => (await runState(faixaRun)) === 'reviewed', { timeout: 5000 });
  timings.marcarRevisadoMs = markedMs >= 0 ? Date.now() - tMark : -1;
  texts.progressoFinal = (await dialog().locator('.vnext-translation-review-progress').innerText()).replace(/\s+/g, ' ');
  j.step('17 "Marcar como revisado" responde na hora ("Revisado" com ✓) e o contador sobe', markedMs >= 0 && /4 de 7 trechos revisados/.test(texts.progressoFinal),
    `${timings.marcarRevisadoMs} ms · "${texts.progressoFinal}" (antes: "${texts.progressoDepois}")`);

  // ------------------------------------------------------------------ 5. Salvar e abrir a cópia EN
  const tSave = Date.now();
  await clicks.click('salvar cópia', dialog().getByRole('button', { name: 'Salvar cópia traduzida' }));
  const sawCreating = await waitMs(() => dialog().getByText(/Salvando e verificando a cópia/).isVisible().catch(() => false), { timeout: 3000 });
  const openCopy = dialog().getByRole('button', { name: 'Abrir cópia traduzida' });
  await openCopy.waitFor({ timeout: 30000 });
  timings.salvarCopiaMs = Date.now() - tSave;
  texts.copiaSalva = (await dialog().getByRole('status').last().innerText().catch(() => '')).trim();
  st = await state(page);
  const copyRecord = st.catalogs.find((c) => c.id !== originalId);
  measures.abrirCopia = await measure(openCopy);
  j.step('18 "Salvar cópia traduzida" cria a cópia (sem mexer no original), diz "Cópia em inglês salva e aceita" e oferece "Abrir cópia traduzida" como botão principal',
    Boolean(copyRecord) && /Cópia em inglês salva e aceita/.test(texts.copiaSalva) && measures.abrirCopia.fullyVisible && st.catalogs.length === 2 && st.runtime.catalogId === originalId,
    `${timings.salvarCopiaMs} ms · "Salvando…" visto: ${sawCreating >= 0} · "${texts.copiaSalva}" · cópia: "${copyRecord?.title}"`);
  await jargonStep('19 Centro de Tradução depois de salvar', dialog());
  j.addEvidence(await shot(page, 'j09-05-copia-salva'));
  const tOpenCopy = Date.now();
  await clicks.click('abrir cópia', openCopy);
  await page.waitForLoadState('load');
  await waitEditor(page);
  await waitSaved(page, 20000);
  timings.abrirCopiaMs = Date.now() - tOpenCopy;
  st = await state(page);
  const copyDoc = st.runtime.document;
  const original = await storedCatalog(originalId);
  observations.copia = { id: st.runtime.catalogId, titulo: st.runtime.title, idioma: copyDoc.locale, textos: textObjects(st).map((o) => o.text?.paragraphs?.map((p) => p.inlines.map((i) => i.text ?? '').join('')).join(' ') ?? '').filter(Boolean) };
  observations.original = { idioma: original?.locale, temVirgula: docText(original?.documentSnapshot ?? {}).includes('0,02 % FE'), titulo: original?.title };
  j.step('20 "Abrir cópia traduzida" abre o catálogo em INGLÊS (idioma en-US) com "0.02 % FS" e "1,500 mbar"; o original continua em português com "0,02 % FE"',
    st.runtime.catalogId === copyRecord?.id && copyDoc.locale === 'en-US' && docText(copyDoc).includes('0.02 % FS') && docText(copyDoc).includes('1,500 mbar') && original?.locale === 'pt-BR' && observations.original.temVirgula,
    `aberto em ${timings.abrirCopiaMs} ms · título: "${st.runtime.title}" · idioma: ${copyDoc.locale} · original: ${original?.locale}`);
  const titleInBar = (await shell().locator('header').innerText().catch(() => '')).replace(/\s+/g, ' ');
  observations.comoSabeQueEEN = { tituloNaBarra: titleInBar.slice(0, 160), haPalavraIngles: /ingl|english|en-US/i.test(titleInBar) };
  j.addEvidence(await shot(page, 'j09-06-copia-en-aberta'));

  // ------------------------------------------------------------------ 6. Publicar / PDF da cópia EN
  const tPub = Date.now();
  await clicks.click('publicar', page.getByRole('button', { name: /^(Publicar \/ PDF|Salvando…)$/ }));
  await review().waitFor({ timeout: 20000 });
  const done = await waitMs(async () => ['READY', 'BLOCKED'].includes((await hostStatus()) ?? ''), { timeout: 30000 });
  timings.publicarMs = done >= 0 ? Date.now() - tPub : -1;
  const pubStatus = await hostStatus();
  const pubText = (await review().getByRole('status').first().innerText().catch(() => '')).trim();
  const pubItems = await review().getByRole('listitem').allInnerTexts();
  observations.publicacao = { estado: pubStatus, status: pubText, itens: pubItems };
  if (pubStatus === 'READY') {
    j.step('21 "Publicar / PDF" da cópia EN fica "Pronto para imprimir ou salvar PDF."', /Pronto para imprimir/.test(pubText), `${timings.publicarMs} ms · "${pubText}"`);
    const pdf = await producePdf('imprimir pdf', 'j09-copia-en');
    observations.pdf = { ...pdf, text: pdf.text.slice(0, 400) };
    j.step('22 o PDF da cópia EN é A4, pesquisável, com "0.02 % FS" e "1,500 mbar" (e sem "0,02 % FE")',
      pdf.numPages >= 1 && pdf.allA4 && pdf.text.includes('0.02 % FS') && pdf.text.includes('1,500 mbar') && !pdf.text.includes('0,02 % FE') && pdf.approved === 'true',
      `${pdf.path} · ${pdf.numPages} página(s) · A4: ${pdf.allA4} · título sugerido: "${pdf.suggestedTitle}" · texto: "${pdf.text.slice(0, 200)}"`);
  } else {
    j.step('21 "Publicar / PDF" da cópia EN fica pronto', false, `estado: ${pubStatus} · "${pubText}" · itens: ${JSON.stringify(pubItems).slice(0, 400)}`);
  }
  j.addEvidence(await shot(page, 'j09-07-publicar-copia-en'));
  await review().getByRole('button', { name: 'Voltar ao editor' }).click().catch(() => {});
  await host().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

  // ------------------------------------------------------------------ 7. Biblioteca: os dois idiomas
  await page.getByRole('button', { name: /^(Voltar aos catálogos|Meus catálogos)$/ }).first().click();
  await waitLibrary(page);
  const libraryText = (await page.locator('[data-catalog-library]').innerText()).replace(/\s+/g, ' ');
  observations.biblioteca = { portugues: /Português \(Brasil\)/.test(libraryText), ingles: /Inglês \(Estados Unidos\)/.test(libraryText), amostra: libraryText.slice(0, 300) };
  j.step('23 na biblioteca aparecem o original "Português (Brasil)" e a cópia "Inglês (Estados Unidos)"', observations.biblioteca.portugues && observations.biblioteca.ingles && libraryText.includes(CATALOG) && libraryText.includes(copyRecord.title),
    observations.biblioteca.amostra);
  j.addEvidence(await shot(page, 'j09-08-biblioteca-dois-idiomas'));

  // ------------------------------------------------------------------ 8. Espanhol mantém a vírgula; Esc no meio da revisão
  await page.evaluate((id) => window.__FATHER__.open(id), originalId);
  await page.waitForLoadState('load');
  await waitEditor(page);
  await waitSaved(page, 20000);
  await clicks.click('traduzir (ES)', page.getByRole('button', { name: 'Traduzir', exact: true }));
  await dialog().waitFor({ timeout: 10000 });
  const selectEs = dialog().getByRole('combobox', { name: 'Idioma de destino' });
  observations.idiomaPadraoNaSegundaVez = await selectEs.inputValue();
  await selectEs.selectOption('es-ES');
  await clicks.click('gerar tradução (ES)', dialog().getByRole('button', { name: 'Gerar tradução', exact: true }));
  await waitMs(async () => (await runs().count()) > 0, { timeout: 30000 });
  const exatEs = runWith(TEXTS.exatidao);
  const pressaoEs = runWith(TEXTS.pressao);
  texts.exatidaoEs = await runText(exatEs);
  texts.pressaoEs = await runText(pressaoEs);
  const esNumberButtons = await dialog().getByRole('button', { name: /^Aplicar ajuste de números/ }).count();
  const esQuestions = await dialog().locator('[data-suggestion="confirm"]').count();
  j.step('24 em espanhol a vírgula e o "% FE" ficam ("ES: Exatidão: ±0,02 % FE"): nenhum "Aplicar ajuste de números" e nenhuma pergunta sobre "1.500"',
    texts.exatidaoEs === `ES: ${TEXTS.exatidao}` && /ES: Pressão máxima: 1\.500 mbar/.test(texts.pressaoEs) && esNumberButtons === 0 && esQuestions === 0,
    `"${texts.exatidaoEs}" · "${texts.pressaoEs}" · botões de ajuste: ${esNumberButtons} · perguntas: ${esQuestions}`);
  // O pai corrige um trecho à mão e aperta Esc (hábito do Word): o que acontece com a revisão?
  const esArea = exatEs.locator('textarea');
  await esArea.fill('ES: Exactitud: ±0,02 % FE');
  await esArea.blur();
  await waitMs(async () => (await runState(exatEs)) === 'corrected', { timeout: 5000 });
  const correctedBefore = await runState(exatEs);
  await esArea.focus();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const dialogClosed = (await dialog().count()) === 0;
  observations.escNaRevisao = { trechoCorrigidoAntes: correctedBefore, fechouComEsc: dialogClosed, dialogoDeConfirmacao: (await page.getByRole('alertdialog').count()) > 0 };
  if (dialogClosed) {
    await clicks.click('traduzir (de novo)', page.getByRole('button', { name: 'Traduzir', exact: true }));
    await dialog().waitFor({ timeout: 10000 });
    const runsAfter = await runs().count();
    observations.escNaRevisao.trechosAoReabrir = runsAfter;
    const dialogText = (await dialog().innerText()).replace(/\s+/g, ' ');
    observations.escNaRevisao.textoAoReabrir = dialogText.slice(0, 200);
    if (runsAfter === 0) {
      findingStep(j, '25 Esc (ou "Fechar") no meio da revisão fecha o Centro e DESCARTA a tradução gerada e as correções feitas à mão, sem perguntar; ao reabrir, volta à etapa 1 vazia',
        `trecho "Exactitud" corrigido (${correctedBefore}) → Esc → diálogo fechou sem confirmação → reabrir: ${runsAfter} trechos, etapa "Idioma" de novo; é preciso gerar e revisar tudo outra vez`, { id: 'E-02', severity: 'P2', knownFR: null });
    } else {
      j.step('25 Esc no meio da revisão não perde a revisão', true, `${runsAfter} trechos continuam ao reabrir`);
    }
  } else {
    j.step('25 Esc com o cursor na tradução não fecha o Centro', true, 'o diálogo continua aberto');
  }
  j.addEvidence(await shot(page, 'j09-09-espanhol-reaberto'));
  // Cancelar de verdade: nada é criado.
  const cancel = dialog().getByRole('button', { name: 'Cancelar', exact: true });
  if (await cancel.count()) await clicks.click('cancelar (ES)', cancel);
  await page.waitForTimeout(300);
  st = await state(page);
  j.step('26 "Cancelar" fecha o Centro sem criar nada: continuam só o original e a cópia EN', (await dialog().count()) === 0 && st.catalogs.length === 2 && st.catalogs.every((c) => !c.archivedAt),
    `catálogos: ${st.catalogs.map((c) => c.title).join(' · ')}`);

  // ------------------------------------------------------------------ 9. Console
  const { appErrors, devServerNoise } = classifyConsole(log);
  j.step('27 zero erros de console e de página', appErrors.length === 0 && log.pageErrors.length === 0,
    `console: ${appErrors.map((e) => e.text).join(' | ') || '-'} · página: ${log.pageErrors.join(' | ') || '-'} · ruído do servidor de desenvolvimento: ${devServerNoise.length}`);
  observations.cliquesDaTarefaPrincipal = Object.fromEntries(Object.entries(clicks.counts).filter(([k]) => !/\(ES\)|de novo|escrever/.test(k)));
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 800));
  await shot(page, 'j09-99-erro').then((p) => j.addEvidence(p)).catch(() => {});
} finally {
  status = await finishJourneyGraded(j, log, { extra: { clicks: clicks.counts, timings, measures, texts, observations, viewportUsed: viewport, server: server.baseUrl } });
  await browser.close();
  await server.close();
}
process.exit(status === 'fail' ? 1 : 0);

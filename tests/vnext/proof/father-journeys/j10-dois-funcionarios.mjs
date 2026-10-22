// J10 — Dois funcionários no mesmo catálogo (grupo D, Equipe B).
// Duas abas no MESMO navegador: aba 1 = ?user=A, aba 2 = ?user=B, mesmo ?db e mesmo ?catalog=. A aba 1 edita e
// espera "Salvo"; a aba 2 edita → vê o aviso de conflito (FR-43 texto seguro, Onda 1): "Salvar meu trabalho como
// cópia" vem primeiro; o alertdialog bloqueia o editor, protege os atalhos e pede confirmação ao abrir a versão mais
// recente. A cópia atualiza o endereço e reabre por F5. Presença/identidade do outro editor continua pendente da 4D.
//   BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j10-dois-funcionarios.mjs
//   VP=1280 BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j10-dois-funcionarios.mjs
import {
  createCatalog, ensureServer, freshDb, harnessUrl, journey, launch, shot, state, waitEditor, waitSaved,
} from './lib.mjs';
import {
  MIN_BODY_FONT_PX, MIN_TARGET_PX, classifyConsole, clickCounter, findingStep, finishJourneyGraded, measureAll,
  pendingStep, scanJargon, waitMs,
} from './fixtures/father-eyes.mjs';

const server = await ensureServer();
const { browser, context, page: tab1, log, viewport } = await launch();
const j = journey('j10-dois-funcionarios', 'J10 — Dois funcionários (duas abas, A e B) editam o mesmo catálogo: aviso de conflito, cópia sem perder nada, abrir a versão mais recente com confirmação');
const db = freshDb('j10');
const clicks = clickCounter();
const measures = {};
const timings = {};
const texts = {};
const observations = {};
let status = 'fail';
let tab2;
const CATALOG = 'PCON-Y18 — Catálogo 2026';
const ALLOW = [/^(Catalog|Builder|Zoom|Gemini)$/];
const plainText = (rich) => typeof rich === 'string' ? rich
  : (rich?.paragraphs ?? []).map((p) => (p.inlines ?? []).map((i) => i.text ?? '').join('')).join(' / ');
const docText = (doc) => doc.pages.flatMap((p) => p.objects.filter((o) => o.type === 'text').map((o) => plainText(o.text))).join(' | ');
const saveText = async (page) => ((await page.locator('header [data-save-phase]').first().textContent().catch(() => '')) ?? '').trim();
const SAVED_TEXT = /^Salvo(?: às \d\d:\d\d)?$/;
const conflictBand = (page) => page.getByRole('alertdialog', { name: 'Este catálogo foi salvo em outro lugar enquanto você editava', exact: true });
/** Documento gravado no "servidor" (localStorage) para um catálogo. */
const stored = (page, id) => page.evaluate((catalogId) => {
  const raw = localStorage.getItem(`father-journeys:catalog:${catalogId}`);
  return raw ? JSON.parse(raw) : null;
}, id);

/** Edita o primeiro texto da página 1 como o pai faria: dois cliques, escreve no fim, "Concluir". */
async function appendToFirstText(page, suffix) {
  const snapshot = await state(page);
  const text = snapshot.runtime.document.pages[0].objects.find((item) => item.type === 'text');
  if (!text) throw new Error('a página 1 não tem texto para editar');
  await page.getByRole('button', { name: 'Página 1', exact: true }).click().catch(() => {});
  await page.waitForTimeout(300);
  const hit = page.locator(`[data-editor-object-id="${text.id}"]`).first();
  await hit.scrollIntoViewIfNeeded();
  await hit.click();
  await page.waitForTimeout(200);
  await hit.dblclick();
  const box = page.getByRole('textbox', { name: 'Editar conteúdo do texto' });
  let path = 'dois cliques';
  if (!(await box.isVisible().catch(() => false))) await box.waitFor({ timeout: 2500 }).catch(() => {});
  if (!(await box.isVisible().catch(() => false))) {
    await hit.click();
    await page.keyboard.press('Enter');
    path = 'Enter com o texto selecionado';
    await box.waitFor({ timeout: 2500 }).catch(() => {});
  }
  if (!(await box.isVisible().catch(() => false))) {
    const panelButton = page.getByRole('complementary', { name: /Propriedades/ }).getByRole('button', { name: /Editar (o )?(texto|conteúdo)/ }).first();
    if (await panelButton.count()) { await panelButton.click(); path = 'botão do painel Propriedades'; }
    await box.waitFor({ timeout: 5000 });
  }
  const current = await box.inputValue();
  await box.fill(`${current}${suffix}`);
  await page.getByRole('button', { name: 'Concluir', exact: true }).first().click();
  return { id: text.id, value: `${current}${suffix}`, path };
}

/** Espera a aba entrar em conflito de salvamento; devolve quanto levou (ms) ou -1. */
const waitConflict = (page, timeout = 20000) => waitMs(async () => (await state(page)).runtime?.savePhase === 'conflict', { timeout, every: 100 });

/** Mede a faixa de conflito como o pai a vê. */
async function measureConflict(page) {
  const band = conflictBand(page);
  const m = await measureAll({
    faixa: band,
    titulo: band.locator('h2'),
    explicacao: band.locator('p').first(),
    item1: band.locator('li').first(),
    copia: band.getByRole('button', { name: /Salvar meu trabalho como cópia|Salvando cópia…/ }),
    maisRecente: band.getByRole('button', { name: /Abrir versão mais recente|Abrindo versão mais recente…/ }),
  });
  const order = await band.locator('button').allInnerTexts();
  const primary = await band.locator('button.vnext-btn-primary').first().innerText().catch(() => '');
  return { ...m, ordemDosBotoes: order.map((t) => t.trim()), botaoPrimario: primary.trim(), role: await band.getAttribute('role'), tone: await band.getAttribute('data-tone') };
}

try {
  // ------------------------------------------------------------------ 0. aba 1 cria; aba 2 abre o mesmo catálogo
  await tab1.goto(harnessUrl({ db, user: 'A' }));
  const catalogId = await createCatalog(tab1, { name: CATALOG });
  const rev0 = (await state(tab1)).runtime.remoteRevision;
  j.step('0 aba 1 (Funcionário A) cria "PCON-Y18 — Catálogo 2026" e vê "Salvo"', Boolean(catalogId) && SAVED_TEXT.test(await saveText(tab1)), `revisão ${rev0}`);

  tab2 = await context.newPage();
  const tOpen = Date.now();
  await tab2.goto(harnessUrl({ db, user: 'B', catalog: catalogId }));
  await waitEditor(tab2);
  await waitSaved(tab2);
  timings.aba2AbreMs = Date.now() - tOpen;
  const st2 = await state(tab2);
  j.step('1 aba 2 (Funcionário B) abre o MESMO catálogo, na mesma versão, e vê "Salvo"',
    st2.user === 'B' && st2.runtime.catalogId === catalogId && st2.runtime.remoteRevision === rev0 && SAVED_TEXT.test(await saveText(tab2)),
    `usuário ${st2.user} · revisão ${st2.runtime.remoteRevision} · em ${timings.aba2AbreMs} ms`);
  observations.avisoAoAbrirComOutroEditando = (await conflictBand(tab2).count()) > 0 || /outra pessoa|em outro lugar/i.test(await tab2.locator('[data-vnext-shell]').innerText());
  pendingStep(j, '2 ao abrir, a aba 2 é avisada de que outra pessoa está no catálogo',
    `pendente Onda 4 (4D: presença e identidade de quem está editando, FR-05) — aviso ao abrir (${observations.avisoAoAbrirComOutroEditando}); o pai só descobre ao salvar`);

  // ------------------------------------------------------------------ 1. aba 1 edita e espera "Salvo"
  const edit1 = await appendToFirstText(tab1, ' — texto da aba 1 (A)');
  const tSave1 = Date.now();
  await waitSaved(tab1, 20000);
  timings.aba1SalvaMs = Date.now() - tSave1;
  const rev1 = (await state(tab1)).runtime.remoteRevision;
  const savedAfterEdit1 = await saveText(tab1);
  j.step('3 aba 1 edita o título da capa (dois cliques) e volta a "Salvo" sozinha', edit1.path === 'dois cliques' && rev1 > rev0 && SAVED_TEXT.test(savedAfterEdit1),
    `caminho: ${edit1.path} · revisão ${rev0} → ${rev1} · ${timings.aba1SalvaMs} ms · status: ${savedAfterEdit1}`);

  // ------------------------------------------------------------------ 2. aba 2 edita → conflito
  await appendToFirstText(tab2, ' — texto da aba 2 (B)');
  timings.conflitoApareceMs = await waitConflict(tab2);
  const band2 = conflictBand(tab2);
  await band2.waitFor({ timeout: 5000 });
  texts.faixaConflito = (await band2.innerText()).replace(/\s+/g, ' ').trim();
  measures.conflito = await measureConflict(tab2);
  texts.statusSalvarAba2 = await saveText(tab2);
  const stConf = await state(tab2);
  j.step('4 a aba 2 vê o aviso de conflito logo depois de concluir a edição (sem rolar a tela)',
    timings.conflitoApareceMs >= 0 && measures.conflito.faixa?.fullyVisible && measures.conflito.role === 'alertdialog',
    `em ${timings.conflitoApareceMs} ms · ${JSON.stringify(measures.conflito.faixa)} · status: "${texts.statusSalvarAba2}"`);
  j.step('5 "Salvar meu trabalho como cópia" vem primeiro e é o botão principal; "Abrir versão mais recente" avisa que descarta (FR-43 texto seguro)',
    measures.conflito.ordemDosBotoes[0] === 'Salvar meu trabalho como cópia' && measures.conflito.botaoPrimario === 'Salvar meu trabalho como cópia'
      && /Abrir versão mais recente:.*(?:não entram no catálogo|descartadas)/.test(texts.faixaConflito),
    `ordem: ${measures.conflito.ordemDosBotoes.join(' › ')} · principal: "${measures.conflito.botaoPrimario}"`);
  j.step('6 o texto da aba 2 continua na tela enquanto o aviso está aberto (nada sumiu)',
    docText(stConf.runtime.document).includes('texto da aba 2 (B)') && /alterações que estão nesta tela continuam aqui/.test(texts.faixaConflito),
    docText(stConf.runtime.document).slice(0, 160));
  const conflictJargon = scanJargon(texts.faixaConflito, { allow: ALLOW });
  j.step('7 o aviso está em português, sem jargão (nada de "revision", "CAS", "conflito de versão")', conflictJargon.length === 0 && !/\bCAS\b|revision|remoteRevision/.test(texts.faixaConflito),
    conflictJargon.map((h) => `${h.term} («${h.context}»)`).join(' | ') || texts.faixaConflito.slice(0, 200));
  observations.aba1DuranteConflito = { status: await saveText(tab1), aviso: (await conflictBand(tab1).count()) > 0 };
  j.step('8 a aba 1 não é incomodada (continua "Salvo", sem aviso)', SAVED_TEXT.test(observations.aba1DuranteConflito.status) && !observations.aba1DuranteConflito.aviso, JSON.stringify(observations.aba1DuranteConflito));
  const smallF = Object.entries(measures.conflito).filter(([k, m]) => ['titulo', 'explicacao', 'item1', 'copia', 'maisRecente'].includes(k) && m && m.fontPx < MIN_BODY_FONT_PX).map(([k, m]) => `${k}: ${m.fontPx} px`);
  const smallT = Object.entries(measures.conflito).filter(([k, m]) => ['copia', 'maisRecente'].includes(k) && m && m.heightPx < MIN_TARGET_PX).map(([k, m]) => `${k}: ${m.heightPx} px`);
  j.step('9 letras ≥ 13 px e botões ≥ 24 px no diálogo de conflito', smallF.length === 0 && smallT.length === 0,
    `letras pequenas: ${smallF.join(', ') || '-'} · alvos pequenos: ${smallT.join(', ') || '-'}`);
  // A faixa diz "em outro lugar": não diz que foi OUTRA PESSOA nem quem. É o que o pai precisa saber para decidir.
  if (!/outra pessoa|outro funcionário|por .{2,40} (salvou|editou)/i.test(texts.faixaConflito)) {
    findingStep(j, '10 o aviso diz "salvo em outro lugar", mas não diz que foi outra pessoa (nem quem), que é o que o pai precisa para decidir',
      `título: "${(await band2.locator('h2').innerText()).trim()}" — "em outro lugar" soa como defeito do programa, não como "o Fulano também está mexendo"`, { id: 'D-05', severity: 'P3', knownFR: 'FR-43' });
  } else {
    j.step('10 o aviso explica que foi outra pessoa', true);
  }
  const conflictDocument = JSON.stringify(stConf.runtime.document);
  const modalFacts = await band2.evaluate((el) => ({
    modal: el.getAttribute('aria-modal') === 'true',
    focusInside: el.contains(document.activeElement),
    focused: document.activeElement?.textContent?.trim(),
    editorInert: Boolean(document.querySelector('[data-vnext-shell]')?.closest('[inert]')),
  }));
  await tab2.keyboard.press('Control+z');
  await tab2.keyboard.press('Escape');
  for (let n = 0; n < 4; n += 1) {
    await tab2.keyboard.press('Tab');
    j.step(`11 Tab ${n + 1} mantém o foco dentro da janela`,
      await band2.evaluate((el) => el.contains(document.activeElement)));
  }
  j.step('11 a janela bloqueia o editor; começa na cópia recomendada; Ctrl+Z e Esc não alteram o trabalho',
    modalFacts.modal && modalFacts.focusInside && modalFacts.editorInert && modalFacts.focused === 'Salvar meu trabalho como cópia'
      && await band2.isVisible() && JSON.stringify((await state(tab2)).runtime.document) === conflictDocument,
    JSON.stringify(modalFacts));
  observations.dialogoBloqueante = modalFacts;
  j.addEvidence(await shot(tab2, 'j10-01-aviso-de-conflito'));

  // ------------------------------------------------------------------ 3. "Salvar meu trabalho como cópia"
  await clicks.click('salvar como cópia', band2.getByRole('button', { name: 'Salvar meu trabalho como cópia' }));
  timings.copiaMs = await waitMs(async () => { const s = await state(tab2); return s.runtime?.title?.startsWith('Cópia de') && s.runtime.savePhase === 'idle' && !s.runtime.dirty; }, { timeout: 20000, every: 100 });
  const stCopy = await state(tab2);
  const copyId = stCopy.runtime.catalogId;
  const original = await stored(tab2, catalogId);
  const copyStored = await stored(tab2, copyId);
  observations.aposCopia = {
    titulo: stCopy.runtime.title, catalogoAberto: copyId, originalId: catalogId, status: await saveText(tab2),
    avisoSumiu: (await conflictBand(tab2).count()) === 0, url: tab2.url(), catalogos: stCopy.catalogs.map((c) => c.title),
    mensagem: await tab2.evaluate(() => (document.querySelector('[data-editor-notices] [data-editor-notice]')?.innerText ?? '').replace(/\s+/g, ' ').trim()),
  };
  j.step('12 um clique em "Salvar meu trabalho como cópia" cria e abre "Cópia de PCON-Y18 — Catálogo 2026", salva, e o aviso some',
    timings.copiaMs >= 0 && stCopy.runtime.title === `Cópia de ${CATALOG}` && copyId !== catalogId && observations.aposCopia.avisoSumiu && SAVED_TEXT.test(observations.aposCopia.status),
    `em ${timings.copiaMs} ms · ${JSON.stringify({ ...observations.aposCopia, url: undefined })}`);
  j.step('13 NADA se perde: a cópia tem o texto da aba 2 e o original guarda o texto da aba 1',
    Boolean(copyStored) && docText(copyStored.documentSnapshot).includes('texto da aba 2 (B)') && !docText(copyStored.documentSnapshot).includes('texto da aba 1 (A)')
      && Boolean(original) && docText(original.documentSnapshot).includes('texto da aba 1 (A)') && !docText(original.documentSnapshot).includes('texto da aba 2 (B)'),
    `cópia: ${copyStored ? docText(copyStored.documentSnapshot).slice(0, 100) : 'não encontrada'} · original: ${original ? docText(original.documentSnapshot).slice(0, 100) : 'não encontrado'}`);
  j.step('14 a biblioteca passa a ter os dois catálogos (original e cópia)',
    stCopy.catalogs.some((c) => c.title === CATALOG && !c.archivedAt) && stCopy.catalogs.some((c) => c.title === `Cópia de ${CATALOG}` && !c.archivedAt),
    stCopy.catalogs.map((c) => c.title).join(' · '));
  const copyUrl = new URL(tab2.url());
  j.step('15 depois da cópia, o endereço já aponta para ela e preserva o usuário e o banco do harness',
    copyUrl.searchParams.get('catalog') === copyId && copyUrl.searchParams.get('db') === db && copyUrl.searchParams.get('user') === 'B',
    tab2.url());
  j.addEvidence(await shot(tab2, 'j10-02-copia-aberta'));

  // F5 na aba 2: qual catálogo abre? (nada se perde: a cópia está na biblioteca)
  await tab2.reload();
  await waitEditor(tab2);
  await waitSaved(tab2);
  const stReload = await state(tab2);
  observations.aposF5 = { catalogoAberto: stReload.runtime.catalogId === catalogId ? 'original' : stReload.runtime.catalogId === copyId ? 'cópia' : 'outro', titulo: stReload.runtime.title };
  const copyAfterReload = await stored(tab2, copyId);
  j.step('16 F5 reabre a cópia, com o trabalho da aba 2 salvo e o original preservado',
    stReload.runtime.catalogId === copyId && stReload.runtime.title === `Cópia de ${CATALOG}`
      && docText(stReload.runtime.document).includes('texto da aba 2 (B)')
      && stReload.catalogs.some((c) => c.id === copyId) && Boolean(copyAfterReload)
      && docText(copyAfterReload.documentSnapshot).includes('texto da aba 2 (B)'),
    JSON.stringify(observations.aposF5));

  // ------------------------------------------------------------------ 4. Reabrir deliberadamente o original para outro conflito
  await tab2.goto(harnessUrl({ db, user: 'B', catalog: catalogId }));
  await waitEditor(tab2);
  await waitSaved(tab2);
  j.step('17 a aba 2 pode reabrir o original sem modificar a cópia', (await state(tab2)).runtime.catalogId === catalogId);
  await appendToFirstText(tab1, ' — 2ª alteração da aba 1');
  await waitSaved(tab1, 20000);
  await appendToFirstText(tab2, ' — 2ª alteração da aba 2');
  timings.conflito2Ms = await waitConflict(tab2);
  const band2b = conflictBand(tab2);
  await band2b.waitFor({ timeout: 5000 });
  j.step('17 segundo conflito aparece do mesmo jeito', timings.conflito2Ms >= 0, `em ${timings.conflito2Ms} ms`);
  await clicks.click('abrir versão mais recente', band2b.getByRole('button', { name: 'Abrir versão mais recente' }));
  await tab2.waitForTimeout(200);
  texts.confirmacaoDescartar = (await band2b.innerText()).replace(/\s+/g, ' ').trim();
  const confirmButtons = (await band2b.locator('button').allInnerTexts()).map((t) => t.trim());
  measures.confirmacao = await measureAll({ sim: band2b.getByRole('button', { name: 'Sim, descartar minhas alterações' }), nao: band2b.getByRole('button', { name: 'Não, voltar' }) });
  j.step('18 "Abrir versão mais recente" NÃO descarta na hora: pergunta "Tem certeza?" com "Sim, descartar minhas alterações" / "Não, voltar"',
    /Tem certeza\?/.test(texts.confirmacaoDescartar) && confirmButtons.includes('Sim, descartar minhas alterações') && confirmButtons.includes('Não, voltar'),
    `botões: ${confirmButtons.join(' › ')}`);
  // Medo de quebrar algo: na confirmação, qual botão está destacado — o que descarta ou o que volta?
  const simPrimary = await band2b.getByRole('button', { name: 'Sim, descartar minhas alterações' }).evaluate((el) => el.classList.contains('vnext-btn-primary')).catch(() => null);
  observations.confirmacaoBotaoDestacado = simPrimary === null ? null : simPrimary ? 'Sim, descartar minhas alterações' : 'Não, voltar';
  if (simPrimary) {
    findingStep(j, '18b no "Tem certeza?", o botão destacado (azul, à esquerda) é o que DESCARTA o trabalho; "Não, voltar" fica apagado',
      `classe vnext-btn-primary em "Sim, descartar minhas alterações"; "Não, voltar" é secundário — quem clicou em "Abrir versão mais recente" por curiosidade tende a clicar no azul de novo`, { id: 'D-08', severity: 'P3', knownFR: 'FR-43' });
  } else {
    j.step('18b no "Tem certeza?", o botão destacado é o seguro ("Não, voltar")', simPrimary === false, `destacado: ${observations.confirmacaoBotaoDestacado}`);
  }
  j.addEvidence(await shot(tab2, 'j10-03-confirmar-descartar'));
  await clicks.click('não, voltar', band2b.getByRole('button', { name: 'Não, voltar' }));
  await tab2.waitForTimeout(200);
  const stBack = await state(tab2);
  j.step('19 "Não, voltar" volta às duas opções e o texto da aba 2 continua lá',
    (await band2b.locator('button').allInnerTexts()).map((t) => t.trim())[0] === 'Salvar meu trabalho como cópia' && docText(stBack.runtime.document).includes('2ª alteração da aba 2'));
  await clicks.click('abrir versão mais recente', band2b.getByRole('button', { name: 'Abrir versão mais recente' }));
  await clicks.click('sim, descartar', band2b.getByRole('button', { name: 'Sim, descartar minhas alterações' }));
  timings.abrirMaisRecenteMs = await waitMs(async () => { const s = await state(tab2); return s.runtime?.savePhase === 'idle' && !s.runtime.dirty && (await conflictBand(tab2).count()) === 0; }, { timeout: 20000, every: 100 });
  const stLatest = await state(tab2);
  const latestText = docText(stLatest.runtime.document);
  j.step('20 depois de confirmar, a aba 2 mostra a versão da aba 1 (com a 2ª alteração da aba 1) e volta a "Salvo"',
    timings.abrirMaisRecenteMs >= 0 && latestText.includes('2ª alteração da aba 1') && !latestText.includes('2ª alteração da aba 2') && (await saveText(tab2)) === 'Salvo',
    `em ${timings.abrirMaisRecenteMs} ms · ${latestText.slice(0, 160)}`);
  observations.copiaDeSegurancaAposDescartar = await tab2.evaluate(() => window.__FATHER__.recoveryRecords()).catch(() => null);
  observations.mensagemAposAbrirMaisRecente = await tab2.evaluate(() => (document.querySelector('[data-editor-notices] [data-editor-notice]')?.innerText ?? '').replace(/\s+/g, ' ').trim());
  j.addEvidence(await shot(tab2, 'j10-04-versao-mais-recente'));

  // ------------------------------------------------------------------ 5. console e contagem
  const { appErrors, devServerNoise } = classifyConsole(log);
  j.step('21 zero erros de console e de página nas duas abas', appErrors.length === 0 && log.pageErrors.length === 0,
    `console: ${appErrors.map((e) => e.text).join(' | ') || '-'} · página: ${log.pageErrors.join(' | ') || '-'} · ruído do servidor de desenvolvimento: ${devServerNoise.length}`);
  observations.cliquesParaResolverComCopia = clicks.counts['salvar como cópia'] ?? 0;
  observations.cliquesParaAbrirMaisRecente = 2;
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 800));
  await shot(tab2 ?? tab1, 'j10-99-erro').then((p) => j.addEvidence(p)).catch(() => {});
} finally {
  status = await finishJourneyGraded(j, log, { extra: { clicks: clicks.counts, timings, measures, texts, observations, viewportUsed: viewport, server: server.baseUrl } });
  await browser.close();
  await server.close();
}
process.exit(status === 'fail' ? 1 : 0);

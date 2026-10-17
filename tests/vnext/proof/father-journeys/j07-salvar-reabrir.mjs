// J7 — Salvar e reabrir (grupo A, Equipe B). O pai edita o PCON-Y18, vê "Salvo" voltar sozinho, fecha
// a aba; reabre e está tudo lá. Depois, com o servidor lento (holdSaves), edita e fecha a aba no meio do
// salvamento; reabre OUTRO catálogo (TA-25N): nada bloqueia. Reabre o MESMO: aparece "Recuperação local"
// em linguagem simples; "Conferir se foi salvo" confirma e nada se perde. Por fim, fecha a aba com um
// texto ainda sendo digitado (caixa aberta) e confere se esse texto volta.
// "Salvo às HH:MM" é da Onda 2 (2G, FR-44) → pendente.
//   BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j07-salvar-reabrir.mjs
//   VP=1280 BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j07-salvar-reabrir.mjs
import {
  createCatalog, ensureServer, freshDb, harnessUrl, journey, launch, shot, state, visibleText, waitEditor,
  waitLibrary, waitSaved,
} from './lib.mjs';
import {
  MIN_BODY_FONT_PX, MIN_TARGET_PX, classifyConsole, clickCounter, findingStep, finishJourneyGraded, measureAll, pendingStep, scanJargon,
  waitMs,
} from './fixtures/father-eyes.mjs';

const server = await ensureServer();
const { browser, context, page: firstPage, log, viewport } = await launch();
const j = journey('j07-salvar-reabrir', 'J7 — Salvar e reabrir: fechar a aba no meio da edição, reabrir outro catálogo e depois o mesmo');
const db = freshDb('j07');
const A = 'PCON-Y18 — Folder 2026';
const B = 'TA-25N — Ficha técnica 2026';
const ALLOW = [/^(Catalog|Builder)$/, /^Zoom$/];
const clicks = clickCounter();
const timings = {};
const measures = {};
const texts = {};
let page = firstPage;
let status = 'fail';

const saveStatus = () => page.locator('[data-vnext-shell] [data-save-state][data-save-phase]').first();
const saveText = async () => ((await saveStatus().textContent().catch(() => '')) ?? '').trim();
const recoveryDialog = () => page.getByRole('dialog', { name: 'Recuperação local' });
const docIncludes = (snapshot, needle) => JSON.stringify(snapshot.runtime?.document ?? {}).includes(needle);
const storedIncludes = (snapshot, needle) => JSON.stringify(snapshot.runtime?.stored ?? {}).includes(needle);
const jargonStep = (label, text) => {
  const hits = scanJargon(text, { allow: ALLOW });
  j.step(`${label}: tudo em português, sem jargão`, hits.length === 0, hits.map((hit) => `${hit.term} («${hit.context}»)`).join(' | ') || '-');
};

/** Na biblioteca: "Abrir" na linha do catálogo. Devolve quanto levou até o editor montar. */
async function openFromLibrary(title, task) {
  await waitLibrary(page);
  const row = page.locator('article.vnext-library-row').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await row.waitFor({ timeout: 10000 });
  const startedAt = Date.now();
  await clicks.click(task, row.getByRole('button', { name: 'Abrir', exact: true }));
  // Com uma cópia local pendente, o editor fica escondido atrás de "Recuperação local" (sem [data-vnext-shell]).
  await page.locator('[data-vnext-shell], [role="dialog"][aria-label="Recuperação local"]').first().waitFor({ timeout: 60000 });
  if (await page.locator('[data-vnext-shell]').count()) await waitEditor(page);
  return Date.now() - startedAt;
}

async function backToLibrary() {
  await clicks.click('voltar', page.getByRole('button', { name: 'Voltar aos catálogos' }));
  await waitLibrary(page);
}

/** Edita o primeiro texto da página 1 como o pai faria: dois cliques, escreve no fim, "Concluir". */
async function appendToFirstText(suffix, { conclude = true } = {}) {
  const snapshot = await state(page);
  const text = snapshot.runtime.document.pages[0].objects.find((item) => item.type === 'text');
  if (!text) throw new Error('a página 1 não tem texto para editar');
  const hit = page.locator(`[data-editor-object-id="${text.id}"]`);
  await page.getByRole('button', { name: 'Página 1', exact: true }).click().catch(() => {});
  await page.waitForTimeout(400);
  await hit.scrollIntoViewIfNeeded();
  await hit.click();
  await page.waitForTimeout(300);
  await hit.dblclick();
  const box = page.getByRole('textbox', { name: 'Editar conteúdo do texto' });
  // Caminho do pai: dois cliques. Se não abrir, Enter (teclado de Word, FR-19); por último o painel Propriedades.
  let path = 'dois cliques';
  if (!(await box.isVisible().catch(() => false))) {
    await box.waitFor({ timeout: 2500 }).catch(() => {});
  }
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
  editPaths.push(path);
  const current = await box.inputValue();
  await box.fill(`${current}${suffix}`);
  if (conclude) await page.getByRole('button', { name: 'Concluir', exact: true }).first().click();
  return { id: text.id, value: `${current}${suffix}`, path };
}
const editPaths = [];

/** Fecha a aba como o pai (o navegador pode perguntar; lib.mjs aceita e registra) e abre uma nova. */
async function closeTab() {
  const closed = page.waitForEvent('close');
  await page.close({ runBeforeUnload: true });
  await closed;
  page = await context.newPage();
}

/** true = nenhuma tela "Recuperação local" apareceu em `ms`. */
async function noRecoveryDialog(ms = 2000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < ms) {
    if (await recoveryDialog().isVisible().catch(() => false)) return false;
    await page.waitForTimeout(100);
  }
  return true;
}

try {
  // 0. Dois catálogos criados pela interface.
  await page.goto(harnessUrl({ db }));
  const idA = await createCatalog(page, { name: A });
  await backToLibrary();
  const idB = await createCatalog(page, { name: B });
  await backToLibrary();
  j.step('dois catálogos criados pela interface (PCON-Y18 e TA-25N)', Boolean(idA && idB && idA !== idB));

  // 1. Abrir o PCON-Y18 e editar: "Salvo" volta sozinho.
  timings.openAMs = await openFromLibrary(A, 'abrir');
  await waitSaved(page);
  const before = await saveText();
  const rev1 = await appendToFirstText(' — rev. 1');
  j.step('dois cliques no título abrem a caixa de edição do texto (sem precisar do painel)', rev1.path === 'dois cliques', `caminho que funcionou: ${rev1.path}`);
  const during = await saveText();
  const savedMs = await waitMs(async () => (await saveText()) === 'Salvo' && !(await state(page)).runtime.dirty, { timeout: 15000 });
  timings.editToSavedMs = savedMs;
  measures.status = await measureAll({ status: saveStatus(), salvar: page.getByRole('button', { name: /^Salv/ }).first() });
  const afterEdit = await state(page);
  j.step('depois de editar, o status sai de "Salvo" e volta a "Salvo" sozinho em menos de 5 s (a alteração está gravada)',
    savedMs >= 0 && savedMs < 5000 && storedIncludes(afterEdit, 'rev. 1'), `antes: "${before}" · logo depois de "Concluir": "${during}" · "Salvo" após ${savedMs} ms`);
  j.step('o status "Salvo" fica na barra de cima, visível sem rolar', Boolean(measures.status.status?.fullyVisible), JSON.stringify(measures.status.status));
  pendingStep(j, 'o status mostra a hora ("Salvo às HH:MM")', `pendente Onda 2 (2G, FR-44): hoje mostra só "${await saveText()}"`);
  if ((measures.status.status?.fontPx ?? 99) < MIN_BODY_FONT_PX) {
    pendingStep(j, `o status "Salvo" tem letra legível (≥ ${MIN_BODY_FONT_PX} px)`,
      `pendente Onda 2 (2C, FR-16b escala 60+): hoje o "Salvo" da barra de cima tem ${measures.status.status.fontPx} px (${measures.status.status.heightPx} px de altura)`);
  }
  texts.editor = await visibleText(page, '[data-vnext-shell]');
  jargonStep('editor com o catálogo aberto', texts.editor);
  j.addEvidence(await shot(page, 'j07-01-editado-salvo'));

  // 2. Fechar a aba depois de "Salvo" e reabrir o mesmo catálogo: tudo lá, sem tela de recuperação.
  await closeTab();
  await page.goto(harnessUrl({ db }));
  timings.reopenSavedMs = await openFromLibrary(A, 'reabrir mesmo (salvo)');
  const cleanReopen = await noRecoveryDialog(2000);
  await waitSaved(page);
  const reopened = await state(page);
  j.step('fechar a aba depois de "Salvo" e reabrir o mesmo catálogo: a alteração está lá e nenhuma tela de recuperação aparece',
    cleanReopen && docIncludes(reopened, 'rev. 1') && (await saveText()) === 'Salvo', `tela de recuperação: ${!cleanReopen} · status: "${await saveText()}"`);

  // 3. Servidor lento: edita, o salvamento fica preso, fecha a aba no meio.
  await page.evaluate(() => window.__FATHER__.holdSaves(true));
  await appendToFirstText(' — rev. 2');
  await page.waitForTimeout(1500);
  const heldText = await saveText();
  await page.evaluate(() => window.__FATHER__.flushRecovery());
  const records = await page.evaluate(() => window.__FATHER__.recoveryRecords());
  const heldState = await state(page);
  measures.statusHeld = await measureAll({ status: saveStatus() });
  j.step('com o servidor lento o status NÃO diz "Salvo" (diz que está salvando) e uma cópia local do PCON-Y18 fica guardada',
    heldText !== 'Salvo' && heldState.runtime.dirty && records.some((record) => record.catalogId === idA),
    `status: "${heldText}" · cópias locais: ${JSON.stringify(records)}`);
  j.addEvidence(await shot(page, 'j07-02-salvando-servidor-lento'));
  const dialogsBefore = log.dialogs.length;
  await closeTab();
  const askedBeforeClose = log.dialogs.slice(dialogsBefore).some((dialog) => dialog.type === 'beforeunload');
  j.step('fechar a aba com trabalho ainda não salvo: o navegador pergunta antes de fechar', askedBeforeClose, JSON.stringify(log.dialogs.slice(dialogsBefore)));

  // 4. Reabrir OUTRO catálogo (TA-25N): nada bloqueia; dá para editar e salvar.
  await page.goto(harnessUrl({ db }));
  timings.openBMs = await openFromLibrary(B, 'reabrir outro');
  const cleanB = await noRecoveryDialog(2500);
  const stateB = await state(page);
  texts.editorB = await visibleText(page, '[data-vnext-shell]');
  const mentionsA = texts.editorB.includes('PCON-Y18') || /cópia de segurança|recupera/i.test(texts.editorB);
  j.step('reabrir OUTRO catálogo (TA-25N): nenhuma tela bloqueante vinda do PCON-Y18; abre salvo',
    cleanB && stateB.runtime?.title === B && stateB.runtime?.saveLabel === 'Saved',
    `tela de recuperação: ${!cleanB} · título: ${stateB.runtime?.title} · menção ao outro catálogo na tela: ${mentionsA}`);
  await appendToFirstText(' — editado');
  const savedBMs = await waitMs(async () => (await saveText()) === 'Salvo' && !(await state(page)).runtime.dirty, { timeout: 15000 });
  j.step('o TA-25N aceita edição e salva normalmente', savedBMs >= 0 && storedIncludes(await state(page), '— editado'), `${savedBMs} ms`);
  j.addEvidence(await shot(page, 'j07-03-outro-catalogo-sem-bloqueio'));

  // 5. Reabrir o MESMO (PCON-Y18): "Recuperação local" em linguagem simples.
  await backToLibrary();
  timings.openAPendingMs = await openFromLibrary(A, 'reabrir mesmo (pendente)');
  const dialog = recoveryDialog();
  const dialogMs = await waitMs(() => dialog.isVisible().catch(() => false), { timeout: 10000 });
  timings.recoveryDialogMs = dialogMs;
  texts.recovery = dialogMs >= 0 ? (await dialog.innerText()).replace(/\s+/g, ' ').trim() : '';
  const recoveryButtons = dialogMs >= 0 ? (await dialog.getByRole('button').allInnerTexts()).map((item) => item.trim()) : [];
  const primary = dialogMs >= 0 ? (await dialog.locator('.vnext-btn-primary').allInnerTexts()).map((item) => item.trim()) : [];
  measures.recovery = await measureAll({
    titulo: dialog.getByRole('heading').first(),
    texto: dialog.locator('p').first(),
    resumo: dialog.locator('[data-recovery-summary]'),
    decisao: dialog.locator('[data-recovery-decision]'),
    botaoRecomendado: dialog.locator('.vnext-btn-primary').first(),
    botaoSecundario: dialog.locator('.vnext-btn-secondary').first(),
  });
  j.step('reabrir o MESMO catálogo mostra "Recuperação local" (cópia de segurança neste computador) com o nome do catálogo, quando foi guardada e quantas páginas',
    dialogMs >= 0 && /Encontramos alterações deste catálogo que não foram salvas/.test(texts.recovery) && texts.recovery.includes(A)
    && /Guardada em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2} · \d+ página/.test(texts.recovery),
    `${dialogMs} ms · "${texts.recovery.slice(0, 420)}"`);
  jargonStep('tela "Recuperação local"', texts.recovery);
  j.step('uma opção vem destacada como recomendada ("Conferir se foi salvo") e as outras ficam discretas',
    primary.length === 1 && primary[0] === 'Conferir se foi salvo', `destacada: ${primary.join(' · ')} · botões: ${recoveryButtons.join(' · ')}`);
  const smallRecovery = Object.entries(measures.recovery).filter(([, m]) => m && m.fontPx < MIN_BODY_FONT_PX).map(([key, m]) => `${key}: ${m.fontPx} px`);
  const smallRecoveryTargets = ['botaoRecomendado', 'botaoSecundario'].filter((key) => measures.recovery[key] && measures.recovery[key].heightPx < MIN_TARGET_PX).map((key) => `${key}: ${measures.recovery[key].heightPx} px`);
  j.step(`a tela de recuperação tem textos ≥ ${MIN_BODY_FONT_PX} px e botões ≥ ${MIN_TARGET_PX} px`, smallRecovery.length === 0 && smallRecoveryTargets.length === 0,
    [...smallRecovery, ...smallRecoveryTargets].join(', ') || Object.entries(measures.recovery).map(([key, m]) => `${key}: ${m?.fontPx} px / ${m?.heightPx} px`).join(' · '));
  if (recoveryButtons.length >= 4) {
    j.finding(`A tela de recuperação oferece ${recoveryButtons.length} botões (${recoveryButtons.join(' / ')}). A recomendada vem destacada, mas "Ver alterações recuperadas" e "Apagar a cópia deste computador" poderiam ficar atrás de "Mais opções" para o pai não hesitar.`, { severity: 'low', where: 'Recuperação local' });
  }
  j.addEvidence(await shot(page, 'j07-04-recuperacao-local'));

  // 6. "Conferir se foi salvo": confirma o salvamento preso, abre com a rev. 2, nada se perde.
  await clicks.click('recuperar', dialog.getByRole('button', { name: 'Conferir se foi salvo' }));
  const closedMs = await waitMs(async () => !(await dialog.isVisible().catch(() => false)), { timeout: 15000 });
  await waitSaved(page, 15000);
  const recovered = await state(page);
  const recordsAfter = await page.evaluate(() => window.__FATHER__.recoveryRecords());
  j.step('"Conferir se foi salvo" confirma o salvamento preso e abre o catálogo com a alteração ("rev. 2"), sem diálogo e sem perder nada',
    closedMs >= 0 && docIncludes(recovered, 'rev. 2') && storedIncludes(recovered, 'rev. 2') && (await saveText()) === 'Salvo',
    `diálogo fechou em ${closedMs} ms · status: "${await saveText()}" · cópias locais restantes: ${JSON.stringify(recordsAfter)}`);
  j.step('recuperar = 1 clique na opção recomendada', clicks.counts.recuperar === 1, JSON.stringify(clicks.counts));
  j.addEvidence(await shot(page, 'j07-05-recuperado'));

  // 7. Abrir o mesmo de novo: sem diálogo (a cópia local já foi usada e limpa).
  await backToLibrary();
  await openFromLibrary(A, 'reabrir mesmo (limpo)');
  const cleanAgain = await noRecoveryDialog(2000);
  await waitSaved(page);
  j.step('abrir o PCON-Y18 mais uma vez: sem tela de recuperação (a cópia local foi limpa) e com a rev. 2', cleanAgain && docIncludes(await state(page), 'rev. 2'));

  // 8. Texto ainda sendo digitado (caixa aberta, sem "Concluir") quando a aba fecha.
  await appendToFirstText(' — rev. 3 digitando', { conclude: false });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__FATHER__.flushRecovery());
  const typingRecords = await page.evaluate(() => window.__FATHER__.recoveryRecords());
  const typingDirty = (await state(page)).runtime.dirty;
  const dialogsBeforeTyping = log.dialogs.length;
  await closeTab();
  const askedTyping = log.dialogs.slice(dialogsBeforeTyping).some((dialog) => dialog.type === 'beforeunload');
  await page.goto(harnessUrl({ db }));
  await openFromLibrary(A, 'reabrir mesmo (digitando)');
  const typingDialog = recoveryDialog();
  const typingDialogMs = await waitMs(() => typingDialog.isVisible().catch(() => false), { timeout: 6000 });
  texts.recoveryTyping = typingDialogMs >= 0 ? (await typingDialog.innerText()).replace(/\s+/g, ' ').trim() : '';
  const typingKept = typingDialogMs >= 0 && /texto que estava sendo digitado/i.test(texts.recoveryTyping);
  if (typingKept) {
    j.step('texto que estava sendo digitado (sem "Concluir") ao fechar a aba: o navegador avisou e a recuperação oferece esse texto de volta ("inclui: texto que estava sendo digitado")',
      askedTyping, `aviso do navegador: ${askedTyping} · sujo: ${typingDirty} · "${texts.recoveryTyping.slice(0, 300)}"`);
    const typingButtons = (await typingDialog.getByRole('button').allInnerTexts()).map((item) => item.trim());
    await typingDialog.getByRole('button', { name: 'Ver alterações recuperadas' }).click();
    await page.waitForTimeout(500);
    const inspection = (await typingDialog.innerText()).replace(/\s+/g, ' ');
    // O texto digitado fica numa caixa só de leitura (textarea): innerText não a inclui.
    const draftBox = typingDialog.locator('[data-protected-recovery-inspection] textarea').first();
    const draftShown = (await draftBox.count()) ? await draftBox.inputValue() : '';
    const inspectionJargon = scanJargon(inspection, { allow: ALLOW });
    j.step('"Ver alterações recuperadas" mostra uma prévia da página e o texto digitado ("rev. 3 digitando") numa caixa "Texto que estava sendo digitado", sem dados técnicos',
      draftShown.includes('rev. 3 digitando') && /Texto que estava sendo digitado/.test(inspection) && /Somente para ver/.test(inspection) && inspectionJargon.length === 0,
      `caixa: "${draftShown.slice(0, 80)}" · jargão: ${inspectionJargon.map((hit) => hit.term).join(', ') || '-'} · tela: ${inspection.slice(0, 300)}`);
    j.addEvidence(await shot(page, 'j07-06-texto-digitando-recuperado'));
    const recoverButton = typingDialog.getByRole('button', { name: 'Recuperar minhas alterações' });
    if (await recoverButton.count()) {
      await clicks.click('recuperar texto digitando', recoverButton);
      const recoveredMs = await waitMs(async () => !(await typingDialog.isVisible().catch(() => false)), { timeout: 10000 });
      await page.waitForTimeout(600);
      const box = page.getByRole('textbox', { name: 'Editar conteúdo do texto' });
      const boxValue = await box.inputValue().catch(() => '');
      const onPage = docIncludes(await state(page), 'rev. 3 digitando');
      j.step('"Recuperar minhas alterações" devolve o texto que estava sendo digitado (na caixa de edição ou na página)',
        recoveredMs >= 0 && (boxValue.includes('rev. 3 digitando') || onPage), `caixa de edição: "${boxValue.slice(0, 80)}" · na página: ${onPage}`);
      if (boxValue.includes('rev. 3 digitando')) {
        await page.getByRole('button', { name: 'Concluir', exact: true }).first().click();
        const savedTypingMs = await waitMs(async () => (await saveText()) === 'Salvo' && !(await state(page)).runtime.dirty, { timeout: 15000 });
        j.step('"Concluir" grava o texto recuperado ("Salvo")', savedTypingMs >= 0 && storedIncludes(await state(page), 'rev. 3 digitando'), `${savedTypingMs} ms`);
      }
    } else {
      j.step('há um botão "Recuperar minhas alterações" para o texto digitado', false, `botões: ${typingButtons.join(' · ')}`);
    }
  } else {
    findingStep(j, 'texto que estava sendo digitado (caixa aberta, sem "Concluir") some ao fechar a aba, sem aviso ou sem recuperação',
      `aviso do navegador ao fechar: ${askedTyping} · sujo: ${typingDirty} · cópia local: ${JSON.stringify(typingRecords)} · tela de recuperação: ${typingDialogMs >= 0} · "${texts.recoveryTyping.slice(0, 200)}"`,
      { id: 'A-05', severity: 'P2', knownFR: null });
  }

  // 9. Console limpo.
  const { appErrors, devServerNoise } = classifyConsole(log);
  j.step('zero erros de console e de página (do aplicativo)', appErrors.length === 0 && log.pageErrors.length === 0,
    `console: ${appErrors.map((entry) => entry.text).join(' | ') || '-'} · página: ${log.pageErrors.join(' | ') || '-'}`);
  if (devServerNoise.length) j.finding(`Ruído do servidor de desenvolvimento durante a prova (${devServerNoise.length} mensagens [hmr]/500: outro agente editando src/ neste worktree); não é erro do aplicativo.`, { severity: 'low', where: 'console (vite)' });
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 800));
  await shot(page, 'j07-99-erro').then((path) => j.addEvidence(path)).catch(() => {});
} finally {
  status = await finishJourneyGraded(j, log, { extra: { viewportUsed: viewport, server: server.baseUrl, timings, clicks: clicks.counts, editPaths, measures, texts, dialogs: log.dialogs } });
  await browser.close();
  await server.close();
}
process.exit(status === 'fail' ? 1 : 0);

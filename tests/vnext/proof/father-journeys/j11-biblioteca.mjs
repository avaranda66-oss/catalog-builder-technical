// J11 — Biblioteca (grupo A, Equipe B). O pai cria três catálogos pela interface, acha o PCON-Y18
// buscando "Y18", duplica como modelo (Duplicar + Renomear), arquiva o original por engano e recupera
// pela aba "Arquivados" → "Restaurar", preservando a identidade e o conteúdo.
//   BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j11-biblioteca.mjs
//   VP=1280 BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j11-biblioteca.mjs
import {
  createCatalog, ensureServer, freshDb, harnessUrl, journey, launch, shot, state, visibleText, waitEditor,
  waitLibrary, waitSaved,
} from './lib.mjs';
import {
  MIN_BODY_FONT_PX, classifyConsole, clickCounter, findingStep, finishJourneyGraded, measureAll, scanJargon,
  waitMs,
} from './fixtures/father-eyes.mjs';

const server = await ensureServer();
const { browser, page, log, viewport } = await launch();
const j = journey('j11-biblioteca', 'J11 — Biblioteca: buscar "Y18", duplicar como modelo, arquivar por engano e recuperar');
const db = freshDb('j11');
const clicks = clickCounter();
const timings = {};
const measures = {};
const texts = {};
// Nome do produto e "Zoom" (palavra corrente em português) não contam como inglês.
const ALLOW = [/^(Catalog|Builder)$/, /^Zoom$/];
const Y18 = 'PCON-Y18 — Folder 2026';
const NAMES = ['PSV Inspector', 'TA-25N — Ficha técnica 2026', Y18];
const COPY = `Cópia de ${Y18}`;
const MODEL = 'PCON-Y18 — Modelo de folder';
// Final de 20/10 (A-01/A-02/A-03): texto principal da biblioteca >= 15 px, secundário >= 13 px, alvos >= 44 px.
const LIB_TEXT_PX = 15;
const LIB_TARGET_PX = 44;
let status = 'fail';

const rows = () => page.locator('article.vnext-library-row');
const rowTitles = () => rows().locator('h2').allInnerTexts();
const rowOf = (title) => rows().filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const notice = () => page.locator('[data-library-notice]').first();
const noticeText = async () => ((await notice().locator('[data-library-notice-text]').textContent().catch(() => '')) ?? '').trim();
// Os nomes dos catálogos ("PSV Inspector" é produto PRESYS) saem do texto antes da varredura de jargão.
const jargonStep = (label, text) => {
  const cleaned = NAMES.reduce((acc, name) => acc.split(name).join(' '), text);
  const hits = scanJargon(cleaned, { allow: ALLOW });
  j.step(`${label}: tudo em português, sem jargão`, hits.length === 0, hits.map((hit) => `${hit.term} («${hit.context}»)`).join(' | ') || '-');
};

try {
  // 0. Três catálogos criados pela interface, voltando por "Meus catálogos" a cada vez.
  const t0 = Date.now();
  await page.goto(harnessUrl({ db }));
  await waitLibrary(page);
  // A-03: o diálogo "Novo catálogo" (rótulo, ajuda, descrições e "X") medido antes de criar.
  await page.getByRole('button', { name: 'Novo catálogo', exact: true }).click();
  const createDialog = page.getByRole('dialog', { name: 'Novo catálogo' });
  await createDialog.waitFor({ timeout: 10000 });
  measures.createDialog = await measureAll({
    rotuloNome: createDialog.locator('label.vnext-library-create-name'),
    ajuda: createDialog.locator('#create-name-help'),
    opcao: createDialog.getByRole('button', { name: 'Ficha técnica essencial', exact: true }).locator('strong'),
    descricaoOpcao: createDialog.locator('.vnext-library-create-options small').first(),
    recomendado: createDialog.getByText('Recomendado para começar'),
    fechar: createDialog.getByRole('button', { name: 'Fechar' }),
  });
  const smallCreate = [
    ...['rotuloNome', 'ajuda', 'opcao'].filter((key) => (measures.createDialog[key]?.fontPx ?? 0) < LIB_TEXT_PX).map((key) => `${key}: ${measures.createDialog[key]?.fontPx} px`),
    ...['descricaoOpcao', 'recomendado'].filter((key) => (measures.createDialog[key]?.fontPx ?? 0) < MIN_BODY_FONT_PX).map((key) => `${key}: ${measures.createDialog[key]?.fontPx} px`),
    ...((measures.createDialog.fechar?.heightPx ?? 0) < LIB_TARGET_PX ? [`fechar: ${measures.createDialog.fechar?.heightPx} px de altura`] : []),
  ];
  j.step(`"Novo catálogo": rótulo, ajuda e opções com ≥ ${LIB_TEXT_PX} px, descrições ≥ ${MIN_BODY_FONT_PX} px e "X" com ≥ ${LIB_TARGET_PX} px (A-03)`,
    smallCreate.length === 0, smallCreate.join(', ') || Object.entries(measures.createDialog).map(([key, m]) => `${key}: ${m?.fontPx} px / ${m?.heightPx} px`).join(' · '));
  await page.keyboard.press('Escape');
  await createDialog.waitFor({ state: 'hidden', timeout: 5000 });
  for (const name of NAMES) {
    await createCatalog(page, { name });
    await clicks.click('voltar à biblioteca', page.getByRole('button', { name: 'Voltar aos catálogos' }));
    await waitLibrary(page);
    await page.getByRole('heading', { name, exact: true }).waitFor({ timeout: 10000 });
  }
  timings.setupMs = Date.now() - t0;
  const titles0 = await rowTitles();
  j.step('três catálogos criados pela interface aparecem em "Ativos" (o mais recente primeiro)',
    titles0.length === 3 && titles0[0] === Y18, titles0.join(' · '));
  texts.list = await visibleText(page);
  jargonStep('lista com 3 catálogos', texts.list);
  j.addEvidence(await shot(page, 'j11-01-lista-3-catalogos'));

  // 1. Buscar "Y18".
  const search = page.getByRole('searchbox', { name: 'Buscar catálogos' });
  measures.search = await measureAll({
    caixa: page.locator('label.vnext-library-search'),
    campo: search,
    ordenarCaixa: page.locator('label.vnext-library-sort'),
    ordenar: page.getByRole('combobox', { name: 'Ordenar catálogos' }),
  });
  measures.sortClick = await page.evaluate(() => {
    // A-02: clicar perto da borda esquerda da moldura (sobre o ícone) também precisa cair no <select>.
    const select = document.querySelector('label.vnext-library-sort select');
    const frame = document.querySelector('label.vnext-library-sort')?.getBoundingClientRect();
    if (!select || !frame) return null;
    const hit = document.elementFromPoint(frame.left + 14, frame.top + frame.height / 2);
    return { iconHitsSelect: hit === select, frameHeightPx: Math.round(frame.height) };
  });
  j.step(`"Ordenar catálogos": a moldura inteira é o seletor (≥ ${LIB_TARGET_PX} px, texto ≥ ${LIB_TEXT_PX} px, clicar no ícone abre a lista) (A-02)`,
    (measures.search.ordenar?.heightPx ?? 0) >= LIB_TARGET_PX && (measures.search.ordenar?.fontPx ?? 0) >= LIB_TEXT_PX && measures.sortClick?.iconHitsSelect === true,
    `seletor: ${JSON.stringify(measures.search.ordenar)} · moldura: ${JSON.stringify(measures.search.ordenarCaixa)} · ${JSON.stringify(measures.sortClick)}`);
  const placeholder = await search.getAttribute('placeholder');
  j.step('a caixa de busca está visível sem rolar e diz "Buscar catálogos"',
    measures.search.caixa?.fullyVisible && placeholder === 'Buscar catálogos', `dica no campo: "${placeholder}" · ${JSON.stringify(measures.search.caixa)}`);
  await clicks.click('buscar', search);
  await search.pressSequentially('Y18', { delay: 80 });
  const filterMs = await waitMs(async () => (await rows().count()) === 1, { timeout: 5000 });
  timings.searchFilterMs = filterMs;
  const found = await rowTitles();
  j.step('digitar "Y18" deixa só o PCON-Y18 na lista, em menos de 1 s depois da última letra',
    filterMs >= 0 && filterMs < 1000 && found.length === 1 && found[0] === Y18, `${filterMs} ms · ${found.join(' · ')}`);
  j.addEvidence(await shot(page, 'j11-02-busca-y18'));
  await search.fill('');
  await search.pressSequentially('y18', { delay: 60 });
  const lowerMs = await waitMs(async () => (await rows().count()) === 1 && (await rowTitles())[0] === Y18, { timeout: 5000 });
  j.step('"y18" em minúsculas também encontra', lowerMs >= 0, `${lowerMs} ms`);
  await search.fill('');
  await search.pressSequentially('Z99', { delay: 60 });
  const emptyMs = await waitMs(() => page.getByRole('heading', { name: 'Nenhum catálogo encontrado' }).isVisible().catch(() => false), { timeout: 5000 });
  texts.emptySearch = ((await page.locator('.vnext-library-empty').innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
  measures.emptySearch = await measureAll({
    titulo: page.getByRole('heading', { name: 'Nenhum catálogo encontrado' }),
    dica: page.getByText('Tente outro termo de busca.'),
  });
  j.step('um termo sem resultado mostra "Nenhum catálogo encontrado" com a dica "Tente outro termo de busca."',
    emptyMs >= 0 && /Tente outro termo de busca/.test(texts.emptySearch), `${emptyMs} ms · "${texts.emptySearch}"`);
  await search.fill('');
  await search.pressSequentially('Y18', { delay: 60 });
  await waitMs(async () => (await rows().count()) === 1, { timeout: 5000 });
  j.step('buscar = 1 clique (na caixa) + digitar; nenhum botão "Buscar" é necessário', clicks.counts.buscar === 1, JSON.stringify(clicks.counts));

  // 2. Duplicar como modelo: "Duplicar" → "Cópia de …" no topo → "Renomear" → nome de modelo.
  const y18Row = rowOf(Y18);
  measures.row = await measureAll({
    titulo: y18Row.getByRole('heading'),
    meta: y18Row.locator('.vnext-library-meta'),
    abrir: y18Row.getByRole('button', { name: 'Abrir', exact: true }),
    duplicar: y18Row.getByRole('button', { name: 'Duplicar', exact: true }),
    renomear: y18Row.getByRole('button', { name: 'Renomear', exact: true }),
    mais: y18Row.getByRole('button', { name: `Mais ações de ${Y18}` }),
  });
  await clicks.click('duplicar como modelo', y18Row.getByRole('button', { name: 'Duplicar', exact: true }));
  const dupMs = await waitMs(() => page.getByRole('heading', { name: COPY, exact: true }).isVisible().catch(() => false), { timeout: 10000 });
  timings.duplicateMs = dupMs;
  const afterDup = await rowTitles();
  await waitMs(async () => (await noticeText()).length > 0, { timeout: 3000 });
  const dupNotice = await noticeText();
  j.step(`"Duplicar" cria "${COPY}" no topo da lista em menos de 2 s`,
    dupMs >= 0 && dupMs < 2000 && afterDup[0] === COPY, `${dupMs} ms · lista: ${afterDup.join(' · ')} · mensagem: "${dupNotice || '(nenhuma; a linha nova aparece no topo)'}"`);
  if (!dupNotice) j.finding('Duplicar em "Ativos" não mostra mensagem: o retorno é só a linha "Cópia de …" aparecendo no topo da lista (visível, mas discreto).', { severity: 'low', where: 'biblioteca, Ativos' });
  const copyRow = rowOf(COPY);
  measures.dupNotice = await measureAll({ aviso: notice() });
  const copyMarked = {
    copia: (await copyRow.getAttribute('data-library-highlighted')) !== null,
    selo: await copyRow.getByText('Cópia nova', { exact: true }).isVisible().catch(() => false),
    original: (await y18Row.getAttribute('data-library-highlighted').catch(() => null)) !== null,
    fundo: await copyRow.evaluate((row) => getComputedStyle(row).backgroundColor),
  };
  j.step(`depois de duplicar aparece "Cópia criada: “${COPY}”." sem rolar, e só a linha da cópia fica destacada ("Cópia nova") (J11)`,
    dupNotice === `Cópia criada: “${COPY}”.` && Boolean(measures.dupNotice.aviso?.fullyVisible) && copyMarked.copia && copyMarked.selo && !copyMarked.original,
    `mensagem: "${dupNotice}" · ${JSON.stringify(measures.dupNotice.aviso)} · ${JSON.stringify(copyMarked)}`);
  j.addEvidence(await shot(page, 'j11-02b-copia-criada-destacada'));
  await clicks.click('duplicar como modelo', copyRow.getByRole('button', { name: 'Renomear', exact: true }));
  const renameDialog = page.getByRole('dialog', { name: 'Renomear catálogo' });
  await renameDialog.waitFor({ timeout: 5000 });
  const renameField = renameDialog.getByRole('textbox');
  const prefilled = await renameField.inputValue();
  const renameFocused = await renameField.evaluate((input) => input === document.activeElement);
  texts.renameDialog = (await renameDialog.innerText()).replace(/\s+/g, ' ').trim();
  jargonStep('diálogo "Renomear catálogo"', texts.renameDialog);
  measures.renameDialog = await measureAll({
    titulo: renameDialog.getByRole('heading'),
    campo: renameField,
    salvar: renameDialog.getByRole('button', { name: 'Salvar nome' }),
    cancelar: renameDialog.getByRole('button', { name: 'Cancelar' }),
  });
  j.step('"Renomear" abre "Renomear catálogo" com o nome atual já preenchido e o cursor no campo',
    prefilled === COPY && renameFocused, `valor: "${prefilled}" · foco no campo: ${renameFocused} · botões: Salvar nome / Cancelar`);
  await renameField.fill(MODEL);
  await renameField.press('Enter');
  const renamedMs = await waitMs(() => page.getByRole('heading', { name: MODEL, exact: true }).isVisible().catch(() => false), { timeout: 10000 });
  j.step(`Enter salva o novo nome e a lista mostra "${MODEL}"`,
    renamedMs >= 0 && !(await renameDialog.isVisible().catch(() => false)), `${renamedMs} ms`);
  j.addEvidence(await shot(page, 'j11-03-copia-renomeada'));
  j.step('duplicar como modelo = 2 cliques (Duplicar, Renomear) + digitar o nome + Enter',
    clicks.counts['duplicar como modelo'] === 2, JSON.stringify(clicks.counts));

  // 3. Arquivar o original por engano: "Mais" → "Arquivar" → confirmação.
  const moreButton = y18Row.getByRole('button', { name: `Mais ações de ${Y18}` });
  const moreText = ((await moreButton.innerText()) ?? '').trim();
  await clicks.click('arquivar', moreButton);
  const menu = page.getByRole('menu', { name: `Mais ações de ${Y18}` });
  await menu.waitFor({ timeout: 5000 });
  const menuItems = (await menu.getByRole('menuitem').allInnerTexts()).map((item) => item.trim());
  measures.menu = await measureAll({ arquivar: menu.getByRole('menuitem', { name: 'Arquivar' }) });
  j.step('o botão "Mais" reúne Duplicar, Renomear, Usar como modelo e Arquivar',
    menuItems.length === 4 && ['Duplicar', 'Renomear', 'Usar como modelo', 'Arquivar'].every(label => menuItems.includes(label)),
    `botão: "${moreText}" · itens: ${menuItems.join(' · ')}`);
  await clicks.click('arquivar', menu.getByRole('menuitem', { name: 'Arquivar' }));
  const archiveDialog = page.getByRole('dialog', { name: `Arquivar “${Y18}”?` });
  await archiveDialog.waitFor({ timeout: 5000 });
  texts.archiveDialog = (await archiveDialog.innerText()).replace(/\s+/g, ' ').trim();
  jargonStep('diálogo "Arquivar…?"', texts.archiveDialog);
  const focusedButton = await page.evaluate(() => (document.activeElement?.textContent ?? '').trim());
  const confirmButton = archiveDialog.getByRole('button', { name: 'Arquivar catálogo', exact: true });
  measures.archiveDialog = await measureAll({
    titulo: archiveDialog.getByRole('heading'),
    texto: archiveDialog.locator('p').first(),
    cancelar: archiveDialog.getByRole('button', { name: 'Cancelar', exact: true }),
    confirmar: confirmButton,
    fechar: archiveDialog.getByRole('button', { name: 'Fechar' }),
  });
  const confirmColor = await confirmButton.evaluate((button) => getComputedStyle(button).backgroundColor);
  j.step('arquivar pede confirmação, explica como Restaurar; o foco começa em "Cancelar"',
    /não será excluído permanentemente/.test(texts.archiveDialog) && /Restaurar/.test(texts.archiveDialog) && focusedButton === 'Cancelar',
    `foco: "${focusedButton}" · cor do botão "Arquivar catálogo": ${confirmColor} · texto: "${texts.archiveDialog}"`);
  j.addEvidence(await shot(page, 'j11-04-confirmar-arquivar'));
  await clicks.click('arquivar', confirmButton);
  const goneMs = await waitMs(async () => (await rowOf(Y18).count()) === 0, { timeout: 10000 });
  await page.waitForTimeout(300);
  const archiveNotice = await noticeText();
  const afterArchive = await state(page);
  j.step('depois de confirmar, o PCON-Y18 some de "Ativos" e fica guardado como arquivado',
    goneMs >= 0 && afterArchive.catalogs.some((item) => item.title === Y18 && item.archivedAt), `${goneMs} ms · mensagem: "${archiveNotice || '(nenhuma)'}"`);
  const showArchived = notice().getByRole('button', { name: 'Ver Arquivados', exact: true });
  measures.archiveNotice = await measureAll({ aviso: notice(), verArquivados: showArchived });
  texts.archiveNotice = archiveNotice;
  if (!archiveNotice) {
    findingStep(j, 'depois de arquivar não aparece mensagem nem "Desfazer": a linha só some da lista',
      'quem arquivou por engano não tem como voltar na hora; precisa descobrir sozinho a aba "Arquivados" (a explicação ficou só no diálogo anterior)',
      { id: 'A-04', severity: 'P2', knownFR: 'FR-04 (4D: Restaurar)' });
  } else {
    j.step('depois de arquivar aparece "Catálogo arquivado. Ele continua em Arquivados." sem rolar, com o botão "Ver Arquivados" (A-04)',
      archiveNotice === 'Catálogo arquivado. Ele continua em Arquivados.' && Boolean(measures.archiveNotice.aviso?.fullyVisible)
      && Boolean(measures.archiveNotice.verArquivados?.fullyVisible) && (measures.archiveNotice.verArquivados?.heightPx ?? 0) >= LIB_TARGET_PX,
      `"${archiveNotice}" · aviso: ${JSON.stringify(measures.archiveNotice.aviso)} · botão: ${JSON.stringify(measures.archiveNotice.verArquivados)}`);
  }
  j.addEvidence(await shot(page, 'j11-04b-arquivado-aviso'));
  j.step('arquivar = 3 cliques (Mais → Arquivar → Arquivar catálogo)', clicks.counts.arquivar === 3, JSON.stringify(clicks.counts));

  // 4. Restaurar o próprio catálogo, sem criar outra cópia.
  await clicks.click('recuperar', (await showArchived.count()) ? showArchived : page.getByRole('tab', { name: 'Arquivados' }));
  j.step('"Ver Arquivados" abre a aba "Arquivados"',
    (await page.getByRole('tab', { name: 'Arquivados' }).getAttribute('aria-selected')) === 'true');
  const archivedRow = rowOf(Y18);
  const archivedRowMs = await waitMs(() => archivedRow.isVisible().catch(() => false), { timeout: 10000 });
  const searchAfterTab = await search.inputValue();
  const hint = page.locator('.vnext-library-archived-hint');
  texts.archived = await visibleText(page);
  jargonStep('aba "Arquivados"', texts.archived);
  const archivedButtons = (await archivedRow.getByRole('button').allInnerTexts()).map((item) => item.trim());
  measures.archived = await measureAll({
    dica: hint,
    estado: archivedRow.locator('.vnext-library-archived-state'),
    duplicar: archivedRow.getByRole('button', { name: 'Duplicar', exact: true }),
    restaurar: archivedRow.getByRole('button', { name: 'Restaurar', exact: true }),
    abaArquivados: page.getByRole('tab', { name: 'Arquivados' }),
  });
  j.step('em "Arquivados" o PCON-Y18 oferece Restaurar e Duplicar, com ajuda em português',
    archivedRowMs >= 0 && (await hint.isVisible()) && archivedButtons.includes('Restaurar') && archivedButtons.includes('Duplicar'),
    `${archivedRowMs} ms · busca ao trocar de aba: "${searchAfterTab}" (limpa sozinha) · botões: ${archivedButtons.join(' · ')} · dica: "${(await hint.innerText()).replace(/\s+/g, ' ')}"`);
  j.addEvidence(await shot(page, 'j11-05-arquivados'));
  const archivedBefore = await state(page);
  const originalBefore = archivedBefore.catalogs.find(item => item.title === Y18);
  const snapshotBefore = await page.evaluate(id => JSON.parse(localStorage.getItem(`father-journeys:catalog:${id}`)).documentSnapshot, originalBefore.id);
  await clicks.click('recuperar', archivedRow.getByRole('button', { name: 'Restaurar', exact: true }));
  const restoreDialog = page.getByRole('dialog', { name: `Restaurar “${Y18}”?` });
  await restoreDialog.waitFor();
  j.step('Restaurar pede confirmação e começa com foco em Cancelar',
    await restoreDialog.getByRole('button', { name: 'Cancelar' }).evaluate(button => button === document.activeElement));
  await restoreDialog.getByRole('button', { name: 'Cancelar' }).click();
  j.step('Cancelar mantém o catálogo em Arquivados', (await state(page)).catalogs.some(item => item.id === originalBefore.id && item.archivedAt));
  await archivedRow.getByRole('button', { name: 'Restaurar', exact: true }).click();
  await clicks.click('recuperar', restoreDialog.getByRole('button', { name: 'Restaurar catálogo', exact: true }));
  const recoverMs = await waitMs(async () =>
    (await page.getByRole('tab', { name: 'Ativos' }).getAttribute('aria-selected')) === 'true'
    && (await notice().isVisible().catch(() => false)), { timeout: 10000 });
  timings.recoverMs = recoverMs;
  texts.recoverNotice = await noticeText();
  measures.notice = await measureAll({ aviso: notice() });
  const recoveredRow = rowOf(Y18);
  const recoveredVisible = await recoveredRow.isVisible().catch(() => false);
  j.step('Restaurar volta para Ativos com confirmação visível sem rolar',
    recoverMs >= 0 && /restaurado/i.test(texts.recoverNotice) && Boolean(measures.notice.aviso?.fullyVisible),
    `${recoverMs} ms · "${texts.recoverNotice}" · ${JSON.stringify(measures.notice.aviso)}`);
  j.step(`o próprio catálogo "${Y18}" está em Ativos com o botão "Abrir"`,
    recoveredVisible && (await recoveredRow.getByRole('button', { name: 'Abrir', exact: true }).isVisible()));
  j.addEvidence(await shot(page, 'j11-06-recuperado-em-ativos'));
  j.step('recuperar = 3 cliques (Arquivados → Restaurar → Restaurar catálogo)', clicks.counts.recuperar === 3, JSON.stringify(clicks.counts));
  const afterRecover = await state(page);
  const restored = afterRecover.catalogs.find(item => item.title === Y18);
  const snapshotAfter = await page.evaluate(id => JSON.parse(localStorage.getItem(`father-journeys:catalog:${id}`)).documentSnapshot, restored.id);
  j.step('restauração preserva ID, nome e todo conteúdo, sem criar uma cópia',
    restored.id === originalBefore.id && !restored.archivedAt && afterRecover.catalogs.length === archivedBefore.catalogs.length
    && JSON.stringify(snapshotAfter) === JSON.stringify(snapshotBefore));

  // 5. A cópia recuperada abre e tem o mesmo conteúdo do original.
  const originalId = afterRecover.catalogs.find((item) => item.title === Y18)?.id;
  const copyId = afterRecover.catalogs.find((item) => item.title === MODEL)?.id;
  const shapes = await page.evaluate(([idA, idB]) => {
    const read = (id) => JSON.parse(localStorage.getItem(`father-journeys:catalog:${id}`)).documentSnapshot;
    const shape = (doc) => ({ pages: doc.pages.length, objects: doc.pages.reduce((sum, item) => sum + item.objects.length, 0) });
    return { original: shape(read(idA)), copy: shape(read(idB)) };
  }, [originalId, copyId]);
  await clicks.click('abrir recuperado', recoveredRow.getByRole('heading', { name: Y18, exact: true }));
  await waitEditor(page);
  await waitSaved(page);
  const opened = await state(page);
  j.step('o cartão inteiro abre o catálogo restaurado no editor, com o mesmo conteúdo',
    opened.mode === 'editor' && opened.runtime?.title === Y18 && opened.runtime?.saveLabel === 'Saved'
    && shapes.original.pages === shapes.copy.pages && shapes.original.objects === shapes.copy.objects, JSON.stringify(shapes));

  // Usar como modelo pede nome e abre uma cópia independente.
  await page.getByRole('button', { name: 'Voltar aos catálogos' }).click();
  await waitLibrary(page);
  await rowOf(Y18).getByRole('button', { name: `Mais ações de ${Y18}` }).click();
  await page.getByRole('menuitem', { name: 'Usar como modelo', exact: true }).click();
  const modelDialog = page.getByRole('dialog', { name: 'Usar como modelo', exact: true });
  await modelDialog.getByRole('textbox', { name: 'Nome do novo catálogo' }).fill('Y18 — Nova ficha');
  await modelDialog.getByRole('button', { name: 'Criar e abrir catálogo' }).click();
  await waitEditor(page);
  await waitSaved(page);
  const modelOpened = await state(page);
  j.step('Usar como modelo abre cópia com o nome escolhido, mantendo o original',
    modelOpened.runtime?.title === 'Y18 — Nova ficha' && modelOpened.runtime.document.id !== originalBefore.id
    && modelOpened.catalogs.some(item => item.id === originalBefore.id && item.title === Y18 && !item.archivedAt));

  // 6. Tamanhos (A-01/A-02): alvos ≥ 44 px; botões, campos e avisos ≥ 15 px; textos secundários ≥ 13 px.
  const targets = {
    'Abrir': measures.row.abrir, 'Duplicar': measures.row.duplicar, 'Renomear': measures.row.renomear, 'Mais': measures.row.mais,
    'menu Arquivar': measures.menu.arquivar, 'Restaurar': measures.archived.restaurar, 'Duplicar (arquivado)': measures.archived.duplicar, 'aba Arquivados': measures.archived.abaArquivados,
    'Salvar nome': measures.renameDialog.salvar, 'Arquivar catálogo': measures.archiveDialog.confirmar, 'Cancelar': measures.archiveDialog.cancelar,
    'Fechar (Arquivar)': measures.archiveDialog.fechar, 'Ver Arquivados': measures.archiveNotice?.verArquivados, 'Ordenar catálogos': measures.search.ordenar,
  };
  const smallTargets = Object.entries(targets).filter(([, m]) => m && m.heightPx < LIB_TARGET_PX).map(([key, m]) => `${key}: ${m.heightPx} px`);
  j.step(`alvos de clique da biblioteca com pelo menos ${LIB_TARGET_PX} px de altura`, smallTargets.length === 0,
    smallTargets.join(', ') || Object.entries(targets).map(([key, m]) => `${key}: ${m?.heightPx} px`).join(' · '));
  const actionTexts = {
    'Abrir': measures.row.abrir, 'Duplicar': measures.row.duplicar, 'Renomear': measures.row.renomear, 'Mais': measures.row.mais,
    'menu Arquivar': measures.menu.arquivar, 'Duplicar (arquivado)': measures.archived.duplicar, 'aba Arquivados': measures.archived.abaArquivados,
    'Salvar nome': measures.renameDialog.salvar, 'Arquivar catálogo': measures.archiveDialog.confirmar, 'Ver Arquivados': measures.archiveNotice?.verArquivados,
    'busca': measures.search.campo, 'Ordenar catálogos': measures.search.ordenar, 'texto do diálogo Arquivar': measures.archiveDialog.texto,
    'aviso "Catálogo arquivado"': measures.archiveNotice?.aviso, 'aviso "Cópia criada"': measures.notice.aviso,
  };
  const smallActionTexts = Object.entries(actionTexts).filter(([, m]) => m && m.fontPx < LIB_TEXT_PX).map(([key, m]) => `${key}: ${m.fontPx} px`);
  j.step(`botões, campos e avisos da biblioteca com texto de pelo menos ${LIB_TEXT_PX} px (A-01)`, smallActionTexts.length === 0,
    smallActionTexts.join(', ') || Object.entries(actionTexts).map(([key, m]) => `${key}: ${m?.fontPx} px`).join(' · '));
  const rowFonts = Object.entries(measures.row).filter(([, m]) => m && m.fontPx < MIN_BODY_FONT_PX).map(([key, m]) => `${key}: ${m.fontPx} px`);
  if (rowFonts.length === 0) j.step(`textos da linha do catálogo com pelo menos ${MIN_BODY_FONT_PX} px`, true);
  else findingStep(j, `na linha do catálogo, os botões (Abrir/Duplicar/Renomear/Mais) e a data têm menos de ${MIN_BODY_FONT_PX} px`, rowFonts.join(', '), { id: 'A-01', severity: 'P3', knownFR: 'FR-05' });
  const otherFonts = {
    'aviso "Cópia criada"': measures.notice.aviso, 'dica dos arquivados': measures.archived.dica, 'menu Arquivar': measures.menu.arquivar,
    'texto do diálogo Arquivar': measures.archiveDialog.texto, 'Nenhum catálogo encontrado (dica)': measures.emptySearch.dica,
  };
  const smallOther = Object.entries(otherFonts).filter(([, m]) => m && m.fontPx < MIN_BODY_FONT_PX).map(([key, m]) => `${key}: ${m.fontPx} px`);
  j.step(`avisos, dicas e diálogos da biblioteca com pelo menos ${MIN_BODY_FONT_PX} px`, smallOther.length === 0,
    smallOther.join(', ') || Object.entries(otherFonts).map(([key, m]) => `${key}: ${m?.fontPx} px`).join(' · '));

  // 7. Console limpo.
  const { appErrors, devServerNoise } = classifyConsole(log);
  j.step('zero erros de console e de página (do aplicativo)', appErrors.length === 0 && log.pageErrors.length === 0,
    `console: ${appErrors.map((entry) => entry.text).join(' | ') || '-'} · página: ${log.pageErrors.join(' | ') || '-'}`);
  if (devServerNoise.length) j.finding(`Ruído do servidor de desenvolvimento durante a prova (${devServerNoise.length} mensagens [hmr]/500: outro agente editando src/ neste worktree); não é erro do aplicativo.`, { severity: 'low', where: 'console (vite)' });
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 800));
  await shot(page, 'j11-99-erro').then((path) => j.addEvidence(path)).catch(() => {});
} finally {
  status = await finishJourneyGraded(j, log, { extra: { viewportUsed: viewport, server: server.baseUrl, timings, clicks: clicks.counts, measures, texts } });
  await browser.close();
  await server.close();
}
process.exit(status === 'fail' ? 1 : 0);

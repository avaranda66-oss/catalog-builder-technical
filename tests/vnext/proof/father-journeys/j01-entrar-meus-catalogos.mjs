// J1 — Entrar e ver "Meus catálogos" (grupo A, Equipe B).
// O pai abre o endereço e cai direto na biblioteca, tudo em português; entende o primeiro passo
// ("Novo catálogo"); o diálogo de criação já começa com o cursor em "Nome do catálogo"; Enter sem nome
// não cria nada; Esc fecha; cria "PCON-Y18 — Folder 2026" e volta por "Meus catálogos".
// O redirecionamento real "/ → /v2" depois do login não existe no harness: fica PENDENTE com
// referência ao teste unitário tests/app/root-redirect.test.tsx e à J1 em produção.
//   BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j01-entrar-meus-catalogos.mjs
//   VP=1280 BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j01-entrar-meus-catalogos.mjs
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ENGLISH, JARGON, ROOT, aria, ensureServer, freshDb, harnessUrl, journey, launch, shot, state,
  visibleText, waitEditor, waitLibrary, waitSaved,
} from './lib.mjs';
import {
  MIN_BODY_FONT_PX, MIN_TARGET_PX, classifyConsole, clickCounter, findingStep, finishJourneyGraded, measureAll, pendingStep, scanJargon,
  unexplainedMm, waitMs,
} from './fixtures/father-eyes.mjs';

const server = await ensureServer();
const { browser, page, log, viewport } = await launch();
const j = journey('j01-entrar-meus-catalogos', 'J1 — Entrar e ver "Meus catálogos" sem digitar nada, tudo em português');
const db = freshDb('j01');
const clicks = clickCounter();
const measures = {};
const timings = {};
const texts = {};
let status = 'fail';
const CATALOG_NAME = 'PCON-Y18 — Folder 2026';
// "PRESYS · Catalog Builder" é o nome do produto: registrado como observação, não como falha.
const BRAND = [/^(Catalog|Builder)$/];
// "Zoom" é palavra corrente em português (o pai usa "zoom" no celular): não conta como inglês.
const ALLOW = [...BRAND, /^Zoom$/];

try {
  // 1. Entrar: a biblioteca aparece sozinha (sem digitar /v2 no harness; em produção é o redirecionamento).
  const t0 = Date.now();
  await page.goto(harnessUrl({ db }));
  await waitLibrary(page);
  timings.libraryVisibleMs = Date.now() - t0;
  const heading = page.getByRole('heading', { name: 'Meus catálogos', exact: true });
  j.step('a biblioteca abre direto com o título "Meus catálogos"', await heading.isVisible(), `em ${timings.libraryVisibleMs} ms`);
  j.step('a biblioteca aparece em menos de 3 s', timings.libraryVisibleMs < 3000, `${timings.libraryVisibleMs} ms`);

  // 2. Tudo em português, sem jargão.
  texts.library = await visibleText(page);
  const libJargon = scanJargon(texts.library, { allow: ALLOW });
  const libMm = unexplainedMm(texts.library);
  j.step('textos da biblioteca em português, sem jargão técnico', libJargon.length === 0 && libMm.length === 0,
    `termos: ${libJargon.map((hit) => `${hit.term} («${hit.context}»)`).join(' | ') || '-'} · mm: ${libMm.join(' | ') || '-'}`);
  const brandHits = scanJargon(texts.library).filter((hit) => BRAND.some((ok) => ok.test(hit.term)));
  if (brandHits.length) j.finding('O nome do produto aparece em inglês ("PRESYS · Catalog Builder") na barra de cima; o resto está em português.', { severity: 'low', where: 'biblioteca, barra de cima' });

  // 3. Primeiro passo: o pai acha "Novo catálogo" sem ajuda? Dois caminhos, ambos visíveis sem rolar.
  const newButton = page.getByRole('button', { name: 'Novo catálogo', exact: true });
  const emptyCreate = page.getByRole('button', { name: 'Criar novo catálogo', exact: true });
  measures.library = await measureAll({
    titulo: heading,
    marca: page.locator('.vnext-library-shell header, .vnext-library-shell').getByText(/Catalog Builder/i),
    novoCatalogo: newButton,
    criarNovoCatalogo: emptyCreate,
    subtitulo: page.getByRole('heading', { name: 'Seus catálogos técnicos', exact: true }),
    dica: page.getByText('Encontre um catálogo, continue o trabalho ou comece um novo.'),
    abaAtivos: page.getByRole('tab', { name: 'Ativos' }),
    abaArquivados: page.getByRole('tab', { name: 'Arquivados' }),
    busca: page.getByRole('searchbox', { name: 'Buscar catálogos' }),
    buscaCaixa: page.locator('label.vnext-library-search'),
    ordenar: page.getByRole('combobox', { name: 'Ordenar catálogos' }),
    ordenarCaixa: page.locator('label.vnext-library-sort'),
    vazioTitulo: page.getByRole('heading', { name: 'Comece seu primeiro catálogo' }),
    vazioTexto: page.getByText('Use uma ficha técnica pronta para editar ou comece com uma página em branco.'),
  });
  j.step('"Novo catálogo" (barra de cima) e "Criar novo catálogo" (lista vazia) estão visíveis sem rolar',
    measures.library.novoCatalogo?.fullyVisible && measures.library.criarNovoCatalogo?.fullyVisible,
    JSON.stringify({ novo: measures.library.novoCatalogo, criar: measures.library.criarNovoCatalogo }));
  // A caixa de busca é o rótulo inteiro (clicar nele põe o cursor no campo); o seletor "Ordenar" só abre
  // clicando no próprio <select>, por isso ele é medido sozinho.
  const smallTargets = Object.entries(measures.library)
    .filter(([key, m]) => m && ['novoCatalogo', 'criarNovoCatalogo', 'abaAtivos', 'abaArquivados', 'buscaCaixa', 'ordenar'].includes(key) && m.heightPx < MIN_TARGET_PX)
    .map(([key, m]) => `${key}: ${m.heightPx} px`);
  if (smallTargets.length === 0) {
    j.step(`alvos de clique da biblioteca com pelo menos ${MIN_TARGET_PX} px de altura`, true);
  } else if (smallTargets.every((entry) => entry.startsWith('ordenar'))) {
    j.step(`botões, abas e caixa de busca com pelo menos ${MIN_TARGET_PX} px de altura`, true,
      `busca (rótulo): ${measures.library.buscaCaixa?.heightPx} px · campo: ${measures.library.busca?.heightPx} px`);
    findingStep(j, `o seletor "Ordenar catálogos" tem só ${measures.library.ordenar?.heightPx} px de altura (alvo pequeno para abrir a lista)`,
      `texto de ${measures.library.ordenar?.fontPx} px; a moldura em volta tem ${measures.library.ordenarCaixa?.heightPx} px, mas clicar nela não abre a lista`,
      { id: 'A-02', severity: 'P3', knownFR: 'FR-05' });
  } else {
    j.step(`alvos de clique da biblioteca com pelo menos ${MIN_TARGET_PX} px de altura`, false, smallTargets.join(', '));
  }
  const smallFonts = Object.entries(measures.library)
    .filter(([key, m]) => m && !['marca', 'ordenarCaixa', 'buscaCaixa'].includes(key) && m.fontPx < MIN_BODY_FONT_PX)
    .map(([key, m]) => `${key}: ${m.fontPx} px`);
  if (smallFonts.length === 0) j.step(`textos da biblioteca com pelo menos ${MIN_BODY_FONT_PX} px`, true);
  else findingStep(j, `textos da biblioteca abaixo de ${MIN_BODY_FONT_PX} px`, smallFonts.join(', '), { id: 'A-01', severity: 'P3', knownFR: 'FR-05' });
  if (measures.library.marca && measures.library.marca.fontPx < 12) {
    j.finding(`A marca "PRESYS · Catalog Builder" tem ${measures.library.marca.fontPx} px: ilegível para quem usa óculos de leitura (é decorativa, mas é a primeira linha da tela).`, { severity: 'low', where: 'biblioteca, barra de cima' });
  }
  j.addEvidence(await shot(page, 'j01-01-biblioteca-vazia'));

  // 4. O diálogo de criação: abre pela lista vazia, cursor já no nome, opções em português.
  await clicks.click('abrir diálogo (lista vazia)', emptyCreate);
  const dialog = page.getByRole('dialog', { name: 'Novo catálogo' });
  await dialog.waitFor({ timeout: 10000 });
  const nameField = dialog.getByRole('textbox', { name: 'Nome do catálogo' });
  const focusedOnName = await nameField.evaluate((input) => input === document.activeElement);
  j.step('"Criar novo catálogo" abre o diálogo "Novo catálogo" com o cursor já em "Nome do catálogo"', (await dialog.isVisible()) && focusedOnName,
    `foco no campo: ${focusedOnName}`);
  texts.dialogAria = await aria(page, dialog);
  texts.dialog = await dialog.innerText();
  const dialogJargon = scanJargon(texts.dialog, { allow: ALLOW });
  j.step('textos do diálogo em português, sem jargão', dialogJargon.length === 0,
    dialogJargon.map((hit) => `${hit.term} («${hit.context}»)`).join(' | ') || '-');
  const optionNames = await dialog.locator('.vnext-library-create-options button').evaluateAll((buttons) =>
    buttons.map((button) => (button.getAttribute('aria-label') ?? '').trim()));
  texts.optionNames = optionNames;
  j.step('as opções de começo têm nomes claros: "Em branco", "Ficha técnica essencial" (recomendada) e o modelo PRESYS',
    optionNames.includes('Em branco') && optionNames.includes('Ficha técnica essencial') && optionNames.some((name) => /^PRESYS/.test(name)),
    optionNames.join(' · '));
  const recommended = dialog.locator('.vnext-library-create-options button.is-recommended');
  j.step('uma opção vem marcada como "Recomendado para começar"', (await recommended.count()) === 1 && /Recomendado para começar/.test(texts.dialog));
  measures.dialog = await measureAll({
    titulo: dialog.getByRole('heading', { name: 'Novo catálogo' }),
    rotuloNome: dialog.locator('label.vnext-library-create-name'),
    campoNome: nameField,
    ajuda: dialog.locator('#create-name-help'),
    opcaoEmBranco: dialog.getByRole('button', { name: 'Em branco', exact: true }),
    opcaoRecomendada: recommended,
    descricaoOpcao: dialog.locator('.vnext-library-create-options small').first(),
    fechar: dialog.getByRole('button', { name: 'Fechar' }),
  });
  const smallDialog = Object.entries(measures.dialog).filter(([, m]) => m && m.fontPx < MIN_BODY_FONT_PX).map(([key, m]) => `${key}: ${m.fontPx} px`);
  if (smallDialog.length === 0) j.step(`textos do diálogo com pelo menos ${MIN_BODY_FONT_PX} px`, true);
  else findingStep(j, `no diálogo "Novo catálogo", o rótulo "Nome do catálogo" e a descrição das opções têm menos de ${MIN_BODY_FONT_PX} px`, smallDialog.join(', '), { id: 'A-03', severity: 'P3', knownFR: null });
  j.step(`o "X" de fechar tem pelo menos ${MIN_TARGET_PX} px`, (measures.dialog.fechar?.heightPx ?? 0) >= MIN_TARGET_PX && (measures.dialog.fechar?.widthPx ?? 0) >= MIN_TARGET_PX,
    JSON.stringify(measures.dialog.fechar));
  j.addEvidence(await shot(page, 'j01-02-dialogo-novo-catalogo'));

  // 5. Enter sem nome: não pode criar nada.
  const before = await state(page);
  await nameField.press('Enter');
  await page.waitForTimeout(800);
  const afterEnter = await state(page);
  const focusAfterEnter = await page.evaluate(() => {
    const active = document.activeElement;
    return active ? (active.getAttribute('aria-label') ?? active.textContent ?? active.tagName).trim().slice(0, 60) : null;
  });
  j.step('Enter com o nome vazio NÃO cria catálogo (o diálogo continua aberto, nenhum catálogo gravado)',
    afterEnter.mode === 'library' && afterEnter.createDispatchCount === before.createDispatchCount && afterEnter.catalogs.length === 0 && (await dialog.isVisible()),
    `criações: ${before.createDispatchCount} → ${afterEnter.createDispatchCount} · foco agora em: ${focusAfterEnter}`);
  j.step('depois do Enter, o foco vai para a opção recomendada (próximo passo), sem sair do diálogo', focusAfterEnter === 'Ficha técnica essencial', `foco: ${focusAfterEnter}`);

  // 6. Esc fecha o diálogo sem criar.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const afterEsc = await state(page);
  j.step('Esc fecha o diálogo sem criar nada', !(await dialog.isVisible().catch(() => false)) && afterEsc.catalogs.length === 0);

  // 7. Caminho principal: "Novo catálogo" → nome → "Ficha técnica essencial". Contar cliques.
  await clicks.click('criar catálogo', newButton);
  await dialog.waitFor({ timeout: 10000 });
  await nameField.fill(CATALOG_NAME);
  const starter = dialog.getByRole('button', { name: 'Ficha técnica essencial', exact: true });
  const tCreate = Date.now();
  await clicks.click('criar catálogo', starter);
  // Retorno imediato: o diálogo avisa que está criando? (leitura instantânea; o diálogo some em seguida)
  const creatingText = await page.evaluate(() => document.querySelector('[data-library-create-status]')?.textContent ?? '');
  await waitEditor(page);
  await waitSaved(page);
  timings.createToEditorSavedMs = Date.now() - tCreate;
  const editorState = await state(page);
  j.step('o catálogo abre no editor já salvo, com o nome digitado',
    editorState.mode === 'editor' && editorState.runtime?.title === CATALOG_NAME && editorState.runtime?.saveLabel === 'Saved',
    `título: ${editorState.runtime?.title} · ${timings.createToEditorSavedMs} ms · aviso durante a criação: "${(creatingText ?? '').trim() || '(nenhum visto)'}"`);
  j.step('criar o primeiro catálogo leva 2 cliques (Novo catálogo → opção) além de digitar o nome', clicks.counts['criar catálogo'] === 2, JSON.stringify(clicks.counts));
  const saveStatus = page.locator('[data-vnext-shell] [data-save-state][data-save-phase]').first();
  const saveText = ((await saveStatus.textContent().catch(() => '')) ?? '').trim();
  measures.editorStatus = await measureAll({ status: saveStatus, voltar: page.getByRole('button', { name: 'Voltar aos catálogos' }) });
  j.step('a barra de cima diz "Salvo"', saveText === 'Salvo', `texto: "${saveText}"`);
  texts.editor = await visibleText(page, '[data-vnext-shell]');
  const editorJargon = scanJargon(texts.editor, { allow: ALLOW });
  const editorMm = unexplainedMm(texts.editor);
  j.step('textos do editor em português, sem jargão (varredura estendida)', editorJargon.length === 0 && editorMm.length === 0,
    `termos: ${editorJargon.map((hit) => `${hit.term} («${hit.context}»)`).join(' | ') || '-'} · mm sem explicação: ${editorMm.join(' | ') || '-'}`);
  j.addEvidence(await shot(page, 'j01-03-editor-aberto'));

  // 8. Voltar por "Meus catálogos": a lista mostra o catálogo.
  const back = page.getByRole('button', { name: 'Voltar aos catálogos' });
  const backText = ((await back.textContent()) ?? '').trim();
  j.step('o botão de voltar se chama "Meus catálogos" na tela', backText === 'Meus catálogos', `texto: "${backText}"`);
  await clicks.click('voltar', back);
  await waitLibrary(page);
  const rowTitle = page.getByRole('heading', { name: CATALOG_NAME, exact: true });
  const rowMs = await waitMs(() => rowTitle.isVisible().catch(() => false), { timeout: 10000 });
  j.step('"Meus catálogos" volta à lista e o catálogo novo está lá', rowMs >= 0, `visível após ${rowMs} ms`);
  const row = page.locator('article.vnext-library-row').first();
  measures.row = await measureAll({
    titulo: row.getByRole('heading'),
    meta: row.locator('.vnext-library-meta'),
    abrir: row.getByRole('button', { name: 'Abrir', exact: true }),
    duplicar: row.getByRole('button', { name: 'Duplicar', exact: true }),
    renomear: row.getByRole('button', { name: 'Renomear', exact: true }),
    maisAcoes: row.getByRole('button', { name: /^Mais ações de/ }),
  });
  const smallRowTargets = Object.entries(measures.row).filter(([key, m]) => m && ['abrir', 'duplicar', 'renomear', 'maisAcoes'].includes(key) && m.heightPx < MIN_TARGET_PX).map(([key, m]) => `${key}: ${m.heightPx} px`);
  j.step(`botões da linha do catálogo com pelo menos ${MIN_TARGET_PX} px`, smallRowTargets.length === 0, smallRowTargets.join(', ') || '-');
  const smallRowFonts = Object.entries(measures.row).filter(([, m]) => m && m.fontPx < MIN_BODY_FONT_PX).map(([key, m]) => `${key}: ${m.fontPx} px`);
  if (smallRowFonts.length === 0) j.step(`textos da linha do catálogo com pelo menos ${MIN_BODY_FONT_PX} px`, true);
  else findingStep(j, `na linha do catálogo, os botões (Abrir/Duplicar/Renomear/Mais) e a data têm menos de ${MIN_BODY_FONT_PX} px`, smallRowFonts.join(', '), { id: 'A-01', severity: 'P3', knownFR: 'FR-05' });
  texts.libraryWithRow = await visibleText(page);
  const rowJargon = scanJargon(texts.libraryWithRow, { allow: ALLOW });
  j.step('lista com catálogo: tudo em português (data por extenso, "Atualizado em …")', rowJargon.length === 0 && /Atualizado em/.test(texts.libraryWithRow),
    rowJargon.map((hit) => `${hit.term} («${hit.context}»)`).join(' | ') || '-');
  j.addEvidence(await shot(page, 'j01-04-biblioteca-com-catalogo'));

  // 9. Redirecionamento "/ → /v2" após login: não é testável no harness.
  const redirectTest = resolve(ROOT, 'tests/app/root-redirect.test.tsx');
  pendingStep(j, 'o endereço raiz leva a "Meus catálogos" sem digitar /v2 (redirecionamento após login)',
    `pendente: só em produção (J1 do plano §2). Coberto por teste unitário: ${existsSync(redirectTest) ? 'tests/app/root-redirect.test.tsx existe' : 'tests/app/root-redirect.test.tsx NÃO encontrado'}; o harness monta a biblioteca direto.`);

  // 10. Console limpo.
  const { appErrors, devServerNoise } = classifyConsole(log);
  j.step('zero erros de console e de página (do aplicativo)', appErrors.length === 0 && log.pageErrors.length === 0,
    `console: ${appErrors.map((entry) => entry.text).join(' | ') || '-'} · página: ${log.pageErrors.join(' | ') || '-'}`);
  if (devServerNoise.length) j.finding(`Ruído do servidor de desenvolvimento durante a prova (${devServerNoise.length} mensagens [hmr]/500: outro agente editando src/ neste worktree); não é erro do aplicativo.`, { severity: 'low', where: 'console (vite)' });
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 800));
  await shot(page, 'j01-99-erro').then((path) => j.addEvidence(path)).catch(() => {});
} finally {
  status = await finishJourneyGraded(j, log, { extra: { viewportUsed: viewport, server: server.baseUrl, timings, clicks: clicks.counts, measures, texts } });
  await browser.close();
  await server.close();
}
process.exit(status === 'fail' ? 1 : 0);

// J15 (Onda 4.5 · Arsenal) — o pai guarda a tabela de especificações e o cabeçalho de uma página no arsenal da
// equipe, acha os dois pela busca e usa numa página nova; depois pede no chat "bota aquela tabela de especificações".
//   A  "Guardar tabela no arsenal…": o diálogo mostra a miniatura do que vai e avisa que a tabela vai SEM valores;
//      um valor técnico digitado na tabela ("0 a 200 psi") não entra no arsenal, o cabeçalho da tabela entra
//   B  título + linha selecionados → "Guardar no arsenal…" em Cabeçalhos, com etiqueta
//   C  "Arsenal…": a busca acha cada um, com miniatura ao vivo, "Guardado por você" e "Ainda não usado"
//   D  numa página nova, "Usar" põe o cabeçalho (no lugar de origem) e a tabela (abaixo dele, vazia: os valores vêm
//      do PDF); nenhuma chamada à IA nem requisição de rede; UM Desfazer tira cada um; Refazer devolve; o uso é contado
//   E  no chat, "bota aquela tabela de especificações" mostra o cartão "Achei no arsenal, sem usar IA" sem chamar a
//      IA; "Usar" põe a tabela e um Desfazer volta ao que era
//   F  textos simples, sem rolagem lateral no painel e no chat, zero erros de console
//   node tests/vnext/proof/father-journeys/j15-arsenal.mjs
//   VP=1280 node tests/vnext/proof/father-journeys/j15-arsenal.mjs
/* global window, process */
import {
  JARGON, consoleErrors, createCatalog, ensureServer, freshDb, harnessUrl, journey, launch, shot, state, waitLibrary, waitSaved,
} from './lib.mjs';

const CATALOG = 'PCON — arsenal da equipe';
const TABLE_NAME = 'Tabela de especificações PCON';
const HEADER_NAME = 'Cabeçalho Especificações PCON';
const TECHNICAL_VALUE = '0 a 200 psi';
const CHAT_REQUEST = 'bota aquela tabela de especificações';
/** Anything that would be the AI or the server: the edge functions, Supabase, Google. */
const AI_OR_SERVER = /\/functions\/v1\/|supabase\.co|generativelanguage|googleapis\.com|aiplatform/i;

const server = await ensureServer();
const { browser, page, log, viewport } = await launch();
page.setDefaultTimeout(10000);
const j = journey('j15-arsenal', 'J15 — Arsenal: guardar tabela e cabeçalho, achar pela busca, usar sem IA e pedir no chat');
const db = freshDb('j15');
const measures = {};
const outbound = [];
page.on('request', (request) => { if (AI_OR_SERVER.test(request.url())) outbound.push(request.url()); });

const plain = (rich) => (rich?.paragraphs ?? []).map((p) => (p.inlines ?? []).map((i) => i.text ?? '').join('')).join('\n').trim();
const cellText = (cell) => cell?.content?.type === 'richText' ? plain(cell.content.value) : cell?.content?.type === 'technicalCode' ? cell.content.value : '';
function grid(table) {
  if (!table) return [];
  return table.rows.map((row) => table.columns.map((column) => cellText(table.cells.find((cell) => cell.rowId === row.id && cell.columnId === column.id))));
}
const pageById = (st, id) => st.runtime.document.pages.find((entry) => entry.id === id);
/** AI calls other than the free availability check ("status"). */
const aiCalls = (st) => [...st.composerCalls.filter((call) => call.task !== 'status'), ...st.draftCalls.filter((call) => call.task !== 'status')];
const panel = () => page.getByRole('complementary', { name: 'Arsenal' });
const dock = () => page.locator('[data-vnext-assistant="open"]');
const undoButton = () => page.getByRole('button', { name: 'Desfazer última alteração' });
const redoButton = () => page.getByRole('button', { name: 'Refazer última alteração' });
const card = (name) => panel().locator('li[data-arsenal-preset]').filter({ has: page.getByRole('heading', { name, exact: true }) });

async function cardInfo(locator) {
  return locator.evaluate((node) => ({
    text: node.innerText.replace(/\s+/g, ' ').trim(),
    thumb: node.querySelector('[data-arsenal-thumb]')?.getAttribute('data-arsenal-thumb') ?? null,
    pageThumbnail: Boolean(node.querySelector('[data-page-thumbnail]')),
    drawn: [...node.querySelectorAll('[data-page-thumbnail] [data-object-id], [data-page-thumbnail] svg, [data-page-thumbnail] canvas')].length,
  }));
}
async function search(words) {
  const box = panel().getByRole('searchbox');
  await box.fill(words);
  await page.waitForTimeout(250);
  return panel().locator('li[data-arsenal-preset] h4').allInnerTexts();
}
async function sameDocument(target, timeout = 5000) {
  return page.waitForFunction((json) => JSON.stringify(window.__FATHER__.state().runtime.document) === json,
    JSON.stringify(target), { timeout }).then(() => true).catch(() => false);
}

try {
  // ------------------------------------------------------------------ preparo: ficha técnica PRESYS de 6 páginas
  // The first load of a fresh dev server compiles the editor: give it time.
  await page.goto(harnessUrl({ db }), { timeout: 180000 });
  await waitLibrary(page, 180000);
  await createCatalog(page, { name: CATALOG, starter: 'Ficha técnica (4 a 6 páginas)' });
  let st = await state(page);
  const specsPage = st.runtime.document.pages[2];
  const specsTable = specsPage.objects.find((object) => object.type === 'table');
  const [titleObject, ruleObject] = specsPage.objects;
  measures.source = { page: 3, objects: specsPage.objects.map((object) => object.type), title: plain(titleObject?.text) };
  await page.locator(`[data-page-nav-id="${specsPage.id}"]`).click();

  // ------------------------------------------------------------------ A. guardar a tabela (com um valor técnico digitado)
  const tableHit = page.locator(`[data-editor-object-id="${specsTable.id}"]`);
  await tableHit.dblclick({ position: { x: 30, y: 30 } });
  await page.locator('[data-table-grid-overlay]').waitFor({ state: 'visible' });
  await page.getByRole('gridcell', { name: 'Linha 2, coluna 2' }).dblclick();
  const inline = page.getByRole('textbox', { name: 'Conteúdo da célula, linha 2, coluna 2', exact: true });
  await inline.waitFor({ state: 'visible' });
  await inline.fill(TECHNICAL_VALUE);
  await inline.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  st = await state(page);
  const typed = grid(pageById(st, specsPage.id).objects.find((object) => object.id === specsTable.id)?.table);
  j.step('A0 o valor técnico "0 a 200 psi" foi digitado na tabela da página 3 (linha 2, coluna 2)', typed[1]?.[1] === TECHNICAL_VALUE, JSON.stringify(typed.slice(0, 2)));
  await waitSaved(page, 20000);
  await tableHit.click({ position: { x: 30, y: 30 } });
  const saveSelection = page.locator('[data-editor-action="save-selection-to-arsenal"]');
  await saveSelection.waitFor({ state: 'visible' });
  const saveLabel = (await saveSelection.innerText()).trim();
  await saveSelection.click();
  let dialog = page.getByRole('dialog', { name: 'Guardar no arsenal' });
  await dialog.waitFor();
  await dialog.locator('[data-arsenal-thumb="ready"]').waitFor({ timeout: 10000 }).catch(() => {});
  const tableDialog = {
    label: saveLabel,
    text: (await dialog.innerText()).replace(/\s+/g, ' '),
    picture: await dialog.locator('[data-arsenal-thumb]').first().getAttribute('data-arsenal-thumb').catch(() => null),
    values: await dialog.locator('[data-arsenal-table-values]').getAttribute('data-arsenal-table-values').catch(() => null),
    keepChecked: await dialog.getByRole('checkbox', { name: /Manter os valores/ }).isChecked(),
    category: await dialog.getByRole('combobox', { name: 'Categoria' }).inputValue(),
  };
  measures.tableDialog = tableDialog;
  j.step('A1 a tabela selecionada oferece "Guardar tabela no arsenal…" e o diálogo mostra a miniatura do que vai',
    saveLabel === 'Guardar tabela no arsenal…' && tableDialog.picture === 'ready', JSON.stringify({ saveLabel, picture: tableDialog.picture }));
  j.step('A2 por padrão a tabela vai SEM valores (só colunas, linhas, cabeçalho e aparência), em Tabelas; manter valores é escolha à parte',
    tableDialog.values === 'structure-only' && !tableDialog.keepChecked && tableDialog.category === 'tabelas'
      && tableDialog.text.includes('A tabela vai sem valores') && tableDialog.text.includes('Os valores vêm do PDF ou da planilha conferida'),
    tableDialog.text.slice(0, 400));
  j.addEvidence(await shot(page, 'j15-01-guardar-tabela'));
  await dialog.getByRole('textbox', { name: 'Nome' }).fill(TABLE_NAME);
  await dialog.getByRole('textbox', { name: 'Etiquetas (opcional)' }).fill('PCON, 3 modelos');
  const outboundBeforeSaves = outbound.length;
  await dialog.getByRole('button', { name: 'Guardar no arsenal', exact: true }).click();
  const tableSaved = await dialog.waitFor({ state: 'detached', timeout: 10000 }).then(() => true).catch(() => false);
  const savedTableMessage = await page.getByText(`“${TABLE_NAME}” guardado no arsenal`).first().innerText().catch(() => '');
  st = await state(page);
  const tableStored = st.arsenalTeamPresets.find((preset) => preset.name === TABLE_NAME);
  const tablePreset = tableStored ? await page.evaluate(async (id) => {
    const result = await window.__FATHER__.arsenal.repository.getMany([id]);
    return result.ok ? result.value[0] : null;
  }, tableStored.id) : null;
  const storedGrid = grid(tablePreset?.payload?.table);
  measures.tableSaved = { message: savedTableMessage, stored: tableStored, tableValues: tablePreset?.payload?.tableValues, grid: storedGrid, tags: tablePreset?.tags };
  j.step('A3 "Guardar no arsenal" fecha o diálogo e diz onde ficou, para a equipe, e que a tabela foi sem valores',
    tableSaved && /guardado no arsenal, em Tabelas\. Toda a equipe já pode usar\. A tabela foi sem valores\./.test(savedTableMessage)
      && tableStored?.category === 'tabelas', JSON.stringify({ tableSaved, savedTableMessage }));
  j.step('A4 no arsenal a tabela tem o cabeçalho e as células vazias: o "0 a 200 psi" não foi junto',
    tablePreset?.payload?.tableValues === 'structure-only' && storedGrid.length === typed.length
      && JSON.stringify(storedGrid[0]) === JSON.stringify(typed[0]) && storedGrid.slice(1).flat().every((value) => value === '')
      && !JSON.stringify(tablePreset?.payload ?? {}).includes('200 psi'), JSON.stringify(storedGrid));

  // ------------------------------------------------------------------ B. guardar o cabeçalho (título + linha)
  await page.locator(`[data-editor-object-id="${titleObject.id}"]`).click({ position: { x: 20, y: 10 } });
  await page.locator(`[data-editor-object-id="${ruleObject.id}"]`).click({ modifiers: ['Shift'] });
  st = await state(page);
  await saveSelection.waitFor({ state: 'visible' });
  const headerLabel = (await saveSelection.innerText()).trim();
  const selectedCount = await page.locator('aside[aria-label="Propriedades do objeto"]').getByText('2 objetos selecionados').count();
  await saveSelection.click();
  dialog = page.getByRole('dialog', { name: 'Guardar no arsenal' });
  await dialog.waitFor();
  const categories = await dialog.getByRole('combobox', { name: 'Categoria' }).locator('option').allInnerTexts();
  await dialog.getByRole('combobox', { name: 'Categoria' }).selectOption({ label: 'Cabeçalhos' });
  await dialog.getByRole('textbox', { name: 'Nome' }).fill(HEADER_NAME);
  await dialog.getByRole('textbox', { name: 'Etiquetas (opcional)' }).fill('PCON, título');
  await dialog.locator('[data-arsenal-thumb="ready"]').waitFor({ timeout: 10000 }).catch(() => {});
  const headerPicture = await dialog.locator('[data-arsenal-thumb]').first().getAttribute('data-arsenal-thumb').catch(() => null);
  j.addEvidence(await shot(page, 'j15-02-guardar-cabecalho'));
  await dialog.getByRole('button', { name: 'Guardar no arsenal', exact: true }).click();
  const headerSaved = await dialog.waitFor({ state: 'detached', timeout: 10000 }).then(() => true).catch(() => false);
  st = await state(page);
  const headerStored = st.arsenalTeamPresets.find((preset) => preset.name === HEADER_NAME);
  measures.headerSaved = { headerLabel, selectedCount, categories, headerPicture, stored: headerStored };
  j.step('B1 título e linha selecionados → "Guardar no arsenal…" deixa escolher Cabeçalhos e mostra a miniatura',
    headerLabel === 'Guardar no arsenal…' && selectedCount === 1 && categories.includes('Cabeçalhos') && headerPicture === 'ready',
    JSON.stringify(measures.headerSaved));
  j.step('B2 o cabeçalho ficou no arsenal da equipe, em Cabeçalhos, com você como autor',
    headerSaved && headerStored?.category === 'cabecalhos' && headerStored.createdBy === tableStored?.createdBy && !headerStored.deleted,
    JSON.stringify(st.arsenalTeamPresets));
  j.step('B3 guardar no arsenal não chamou a IA nem saiu para a rede',
    aiCalls(st).length === 0 && outbound.length === outboundBeforeSaves, JSON.stringify({ ai: aiCalls(st), outbound }));

  // ------------------------------------------------------------------ C. achar pela busca
  await page.getByRole('button', { name: 'Arsenal…', exact: true }).click();
  await panel().waitFor({ state: 'visible' });
  await panel().locator('[data-arsenal-loading]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  const panelIntro = (await panel().locator('header').innerText()).replace(/\s+/g, ' ');
  const foundTable = await search('especificacoes pcon');
  await card(TABLE_NAME).locator('[data-arsenal-thumb="ready"]').waitFor({ timeout: 10000 }).catch(() => {});
  const tableCard = await cardInfo(card(TABLE_NAME));
  j.addEvidence(await shot(page, 'j15-03-busca-tabela'));
  const foundHeader = await search('cabeçalho');
  await card(HEADER_NAME).locator('[data-arsenal-thumb="ready"]').waitFor({ timeout: 10000 }).catch(() => {});
  const headerCard = await cardInfo(card(HEADER_NAME));
  j.addEvidence(await shot(page, 'j15-04-busca-cabecalho'));
  measures.search = { panelIntro, foundTable, tableCard, foundHeader, headerCard };
  j.step('C1 o painel avisa que usar não gasta IA e a busca sem acento acha a tabela guardada',
    panelIntro.includes('Usar não gasta IA') && foundTable.includes(TABLE_NAME), JSON.stringify({ panelIntro, foundTable }));
  j.step('C2 o cartão da tabela tem miniatura ao vivo, "Guardado por você" e "Ainda não usado"',
    tableCard.thumb === 'ready' && tableCard.pageThumbnail && tableCard.text.includes('Guardado por você') && tableCard.text.includes('Ainda não usado'),
    JSON.stringify(tableCard));
  j.step('C3 "cabeçalho" acha o cabeçalho guardado (com miniatura) junto dos modelos PRESYS',
    foundHeader.includes(HEADER_NAME) && headerCard.thumb === 'ready' && headerCard.text.includes('Guardado por você'),
    JSON.stringify({ foundHeader, headerCard }));

  // ------------------------------------------------------------------ D. usar numa página nova (sem IA, um Desfazer)
  await panel().getByRole('button', { name: 'Fechar arsenal' }).click();
  await page.getByRole('button', { name: 'Adicionar nova página após a página atual' }).click();
  await page.waitForFunction((count) => window.__FATHER__.state().runtime.document.pages.length === count, 7);
  await waitSaved(page, 20000);
  st = await state(page);
  const newPageId = st.runtime.document.pages[3].id;
  const blank = st.runtime.document;
  const aiBeforeUse = aiCalls(st).length;
  const outboundBeforeUse = outbound.length;
  await page.getByRole('button', { name: 'Arsenal…', exact: true }).click();
  await panel().waitFor({ state: 'visible' });
  const objectsOn = (atLeast) => page.waitForFunction(([pageId, count]) =>
    window.__FATHER__.state().runtime.document.pages.find((p) => p.id === pageId)?.objects.length >= count, [newPageId, atLeast], { timeout: 10000 }).catch(() => {});

  // The header first (it goes back to its place at the top), then the table (it goes to the top of the free area).
  await search('cabeçalho pcon');
  await card(HEADER_NAME).getByRole('button', { name: `Usar “${HEADER_NAME}”` }).click();
  await objectsOn(2);
  await page.waitForTimeout(300);
  st = await state(page);
  const headerTexts = pageById(st, newPageId).objects.filter((object) => object.type === 'text').map((object) => plain(object.text));
  const headerLines = pageById(st, newPageId).objects.filter((object) => object.type === 'line').length;
  const headerMessage = await panel().locator('[data-arsenal-last-message]').innerText().catch(() => '');
  measures.useHeader = { texts: headerTexts, lines: headerLines, message: headerMessage,
    frames: pageById(st, newPageId).objects.map((object) => ({ type: object.type, ...object.frame })) };
  j.step('D1 "Usar" põe o cabeçalho guardado (título "Especificações técnicas" e a linha) na página nova (página 4), no mesmo lugar',
    JSON.stringify(headerTexts) === JSON.stringify([measures.source.title]) && headerLines === 1
      && measures.useHeader.frames.find((frame) => frame.type === 'text')?.yMm === titleObject.frame.yMm
      && /entrou na página 4 sem usar IA/.test(headerMessage), JSON.stringify(measures.useHeader));
  j.step('D2 usar o cabeçalho não chamou a IA nem saiu para a rede', aiCalls(st).length === aiBeforeUse && outbound.length === outboundBeforeUse,
    JSON.stringify({ ai: aiCalls(st), outbound }));
  const withHeader = st.runtime.document;
  await undoButton().click();
  j.step('D3 UM Desfazer tira o cabeçalho (a página volta a ficar vazia)', await sameDocument(blank),
    `objetos na página 4: ${pageById(await state(page), newPageId)?.objects.length}`);
  await redoButton().click();
  j.step('D4 Refazer devolve o mesmo cabeçalho', await sameDocument(withHeader));
  await waitSaved(page, 20000);

  await search('especificacoes pcon');
  await card(TABLE_NAME).getByRole('button', { name: `Usar “${TABLE_NAME}”` }).click();
  await objectsOn(3);
  await page.waitForTimeout(300);
  st = await state(page);
  const usedTable = pageById(st, newPageId)?.objects.find((object) => object.type === 'table');
  const usedGrid = grid(usedTable?.table);
  const usedMessage = await panel().locator('[data-arsenal-last-message]').innerText().catch(() => '');
  const frames = pageById(st, newPageId).objects.map((object) => ({ type: object.type, ...object.frame }));
  const tableFrame = frames.find((frame) => frame.type === 'table');
  const overlaps = frames.filter((frame) => frame.type !== 'table' && tableFrame
    && frame.xMm < tableFrame.xMm + tableFrame.widthMm && tableFrame.xMm < frame.xMm + frame.widthMm
    && frame.yMm < tableFrame.yMm + tableFrame.heightMm && tableFrame.yMm < frame.yMm + Math.max(frame.heightMm, 0.01));
  measures.useTable = { grid: usedGrid, message: usedMessage, frames };
  j.step('D5 "Usar" põe a tabela guardada abaixo do cabeçalho, sem cobri-lo, com o cabeçalho da tabela e as células vazias',
    Boolean(usedTable) && JSON.stringify(usedGrid[0]) === JSON.stringify(typed[0]) && usedGrid.slice(1).flat().every((value) => value === '')
      && usedTable.id !== specsTable.id && overlaps.length === 0 && /entrou na página 4 sem usar IA/.test(usedMessage),
    JSON.stringify({ grid: usedGrid, message: usedMessage, overlaps }));
  j.step('D6 usar a tabela não chamou a IA nem saiu para a rede', aiCalls(st).length === aiBeforeUse && outbound.length === outboundBeforeUse,
    JSON.stringify({ ai: aiCalls(st), outbound }));
  j.addEvidence(await shot(page, 'j15-05-cabecalho-e-tabela-usados'));
  const withTable = st.runtime.document;
  await undoButton().click();
  j.step('D7 UM Desfazer tira a tabela e deixa o cabeçalho', await sameDocument(withHeader));
  await redoButton().click();
  j.step('D8 Refazer devolve a mesma tabela', await sameDocument(withTable));
  await waitSaved(page, 20000);
  await search('pcon');
  await page.waitForTimeout(300);
  const usage = {
    table: await card(TABLE_NAME).locator('[data-arsenal-usage]').innerText().catch(() => ''),
    header: await card(HEADER_NAME).locator('[data-arsenal-usage]').innerText().catch(() => ''),
  };
  measures.usage = usage;
  j.step('D9 cada cartão conta o uso: "Usado 1×" (Desfazer e Refazer não contam de novo)',
    usage.table === 'Usado 1×' && usage.header === 'Usado 1×', JSON.stringify(usage));
  j.addEvidence(await shot(page, 'j15-06-uso-contado'));
  await panel().getByRole('button', { name: 'Fechar arsenal' }).click();

  // ------------------------------------------------------------------ E. pedir no chat
  // A blank page 5 for the request (the table goes on the open page).
  await page.getByRole('button', { name: 'Adicionar nova página após a página atual' }).click();
  await page.waitForFunction((count) => window.__FATHER__.state().runtime.document.pages.length === count, 8);
  await waitSaved(page, 20000);
  const pageCountBeforeChat = (await state(page)).runtime.document.pages.length;
  await page.getByRole('tab', { name: 'Assistente' }).click();
  await dock().waitFor({ state: 'visible', timeout: 10000 });
  const box = dock().getByRole('textbox', { name: 'Seu pedido ao Gemini' });
  await box.waitFor({ state: 'visible', timeout: 15000 });
  st = await state(page);
  const aiBeforeChat = aiCalls(st).length;
  const outboundBeforeChat = outbound.length;
  const beforeChat = st.runtime.document;
  const chatPageId = st.runtime.document.pages[4].id;
  await box.fill(CHAT_REQUEST);
  await dock().getByRole('button', { name: 'Enviar ao Gemini' }).click();
  const choice = dock().getByRole('group', { name: 'Arsenal, sem usar IA' }).last();
  const choiceShown = await choice.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  const choiceText = choiceShown ? (await choice.innerText()).replace(/\s+/g, ' ') : '';
  const choiceHeading = choiceShown ? (await choice.getByRole('heading').first().innerText()).trim() : '';
  st = await state(page);
  measures.chat = { heading: choiceHeading, text: choiceText, ai: aiCalls(st).slice(aiBeforeChat), outbound: outbound.slice(outboundBeforeChat) };
  j.step('E1 "bota aquela tabela de especificações" mostra o cartão "Achei no arsenal, sem usar IA"',
    choiceHeading === 'Achei no arsenal, sem usar IA' && /especifica/i.test(choiceText) && choiceText.includes('Usar não gasta IA'),
    choiceText.slice(0, 400));
  j.step('E2 o cartão aparece sem chamar a IA e sem sair para a rede, e nada muda antes de "Usar"',
    aiCalls(st).length === aiBeforeChat && outbound.length === outboundBeforeChat
      && JSON.stringify(st.runtime.document) === JSON.stringify(beforeChat), JSON.stringify(measures.chat));
  j.addEvidence(await shot(page, 'j15-07-chat-achei-no-arsenal'));
  const primaryName = choiceShown ? (await choice.locator('[data-arsenal-primary] strong').innerText().catch(() => '')) : '';
  measures.chat.primary = primaryName;
  if (choiceShown) await choice.getByRole('button', { name: 'Usar', exact: true }).click();
  await page.waitForFunction((id) => window.__FATHER__.state().runtime.document.pages.find((p) => p.id === id)?.objects.some((o) => o.type === 'table'),
    chatPageId, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  st = await state(page);
  const chatTable = pageById(st, chatPageId)?.objects.find((object) => object.type === 'table');
  const chatLog = await dock().getByRole('log').innerText().catch(() => '');
  measures.chat.used = { grid: grid(chatTable?.table), log: chatLog.slice(-300), ai: aiCalls(st).slice(aiBeforeChat) };
  j.step('E3 "Usar" no cartão põe a tabela na página aberta e a conversa diz que usou do arsenal, sem IA',
    Boolean(chatTable) && new RegExp(`Usei “${primaryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}” do arsenal`).test(chatLog)
      && aiCalls(st).length === aiBeforeChat && outbound.length === outboundBeforeChat
      && st.runtime.document.pages.length === pageCountBeforeChat, JSON.stringify(measures.chat.used).slice(0, 600));
  j.addEvidence(await shot(page, 'j15-08-chat-usado'));
  await undoButton().click();
  j.step('E4 UM Desfazer volta ao que era antes do pedido', await sameDocument(beforeChat));
  await waitSaved(page, 20000);

  // ------------------------------------------------------------------ F. texto, largura, console
  const texts = await dock().evaluate((node) => node.innerText);
  const jargon = texts.match(new RegExp(JARGON.source, 'gi')) ?? [];
  j.step('F1 a conversa e os cartões falam português simples (sem termos técnicos de programação)', jargon.length === 0, jargon.join(', '));
  measures.width = {
    chat: await dock().evaluate((node) => {
      const thread = node.querySelector('.ai-chat-thread') ?? node;
      return { scroll: thread.scrollWidth, client: thread.clientWidth };
    }),
  };
  await page.getByRole('button', { name: 'Arsenal…', exact: true }).click();
  await panel().waitFor({ state: 'visible' });
  measures.width.arsenal = await panel().evaluate((node) => {
    const body = node.querySelector('[data-arsenal-body]') ?? node;
    return { scroll: body.scrollWidth, client: body.clientWidth };
  });
  const panelText = await panel().innerText();
  const panelJargon = panelText.match(new RegExp(JARGON.source, 'gi')) ?? [];
  j.step('F2 o painel Arsenal e a conversa não rolam para o lado; o painel fala português simples',
    measures.width.chat.scroll <= measures.width.chat.client + 1 && measures.width.arsenal.scroll <= measures.width.arsenal.client + 1
      && panelJargon.length === 0, JSON.stringify({ ...measures.width, panelJargon }));
  const errors = consoleErrors(log);
  j.step('F3 zero erros de console e de página', errors.length === 0 && log.pageErrors.length === 0,
    JSON.stringify({ errors, pageErrors: log.pageErrors }).slice(0, 600));
  st = await state(page);
  j.step('F4 em toda a jornada nenhuma chamada à IA e nenhuma requisição à função da IA', aiCalls(st).length === 0 && outbound.length === 0,
    JSON.stringify({ composer: st.composerCalls, draft: st.draftCalls, outbound }));
  measures.composerCalls = st.composerCalls;
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 900));
  await shot(page, 'j15-99-erro').then((path) => j.addEvidence(path)).catch(() => {});
} finally {
  await j.finish(log, { extra: { viewportUsed: viewport, server: server.baseUrl, measures, outbound } });
  await browser.close().catch(() => {});
}
process.exit(j.steps.every((step) => step.ok) ? 0 : 1);

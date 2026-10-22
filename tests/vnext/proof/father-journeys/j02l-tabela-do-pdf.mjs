// J2-lite (Onda 3 · 3B) — o pai solta o folder e o manual do TA e pede, no chat do assistente, a tabela de especificações.
//   A  depois de soltar os PDFs, a conversa oferece "Montar tabela de especificações a partir destes PDFs"
//   B  com a leitura do servidor ainda NÃO implantada (como hoje em produção) o assistente diz isso em português claro:
//      nada é enviado, nada muda no catálogo, nada quebra
//   C  com o provedor CONTROLADO (window.__FATHER_DRAFT__: a resposta da IA montada com os fatos reais do folder p. 9 e do
//      manual p. 5) → "Tentar de novo": sugere a página de especificações de cada PDF, lê, confere cada valor no texto do
//      próprio PDF e mostra "Pendências (N)" e a prévia da tabela como cartões na conversa
//   D  o pai escolhe entre 155 °C (folder) e 140 °C (manual) para o TA-25N com um clique; só essa célula muda na prévia
//   E  "Aplicar" insere a tabela numa transação, só com valores conferidos ou escolhidos (o resto fica em branco)
//   F  UM Ctrl+Z tira a tabela inteira; Refazer a devolve
//   G  "Publicar / PDF" fica Pronto (READY)
//   node tests/vnext/proof/father-journeys/j02l-tabela-do-pdf.mjs
//   VP=1280 node tests/vnext/proof/father-journeys/j02l-tabela-do-pdf.mjs
/* global window, document, process */
import {
  JARGON, consoleErrors, ensureServer, freshDb, harnessUrl, journey, launch, shot, state, waitEditor, waitLibrary, waitSaved,
} from './lib.mjs';
import {
  FOLDER_FILE, MANUAL_FILE, TA, controlledAnswers, folderPdfBytes, manualPdfBytes,
} from './fixtures/spec-table-facts.mjs';

const ACTION = 'Montar tabela de especificações a partir destes PDFs';
const CATALOG = 'TA — especificações a partir do PDF';
/** Values a cell may hold: only the verified readings of the folder p. 9 and the manual p. 5 (facts of the fixture). */
const VERIFIED_DISPLAY = new Set(['-25 °C to +155 °C', '200 W', '300 W', '400 W', '10.5 kg', '12.5 kg']);

const server = await ensureServer();
const { browser, page, log, viewport } = await launch();
page.setDefaultTimeout(10000);
const j = journey('j02l-tabela-do-pdf', 'J2-lite — tabela de especificações verificada a partir do folder e do manual, no chat: pendências, escolha, aplicar, desfazer, publicar');
const db = freshDb('j02l');
const measures = {};

const dock = () => page.locator('[data-vnext-assistant="open"]');
const dockText = async () => ((await dock().innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
const plain = (rich) => (rich?.paragraphs ?? []).map((p) => (p.inlines ?? []).map((i) => i.text ?? '').join('')).join(' ').trim();
function tablesOf(document) {
  return document.pages.flatMap((pageItem, pageIndex) => pageItem.objects.filter((object) => object.type === 'table')
    .map((object) => ({ pageIndex, object })));
}
function matrix(table) {
  return table.rows.map((row) => table.columns.map((column) => {
    const cell = table.cells.find((item) => item.rowId === row.id && item.columnId === column.id);
    return cell?.content?.type === 'richText' ? plain(cell.content.value) : '';
  }));
}
async function cardTexts() {
  return page.evaluate(() => [...document.querySelectorAll('[data-vnext-assistant="open"] .ai-chat-card, [data-vnext-assistant="open"] .ai-chat-system')]
    .map((node) => node.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
}

try {
  // ------------------------------------------------------------------ preparo: catálogo novo com o assistente aberto
  await page.goto(harnessUrl({ db }));
  await waitLibrary(page);
  await page.getByRole('button', { name: 'Novo catálogo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo catálogo' });
  await dialog.waitFor({ timeout: 10000 });
  await dialog.getByRole('textbox', { name: 'Nome do catálogo' }).fill(CATALOG);
  await dialog.getByRole('button', { name: 'Criar com IA a partir de arquivos', exact: true }).click();
  await waitEditor(page);
  await waitSaved(page);
  await dock().waitFor({ state: 'visible', timeout: 10000 });
  const original = (await state(page)).runtime.document;

  // ------------------------------------------------------------------ A. os dois PDFs na conversa
  await dock().locator('input[type=file][aria-label="Escolher arquivos"]').setInputFiles([
    { name: FOLDER_FILE, mimeType: 'application/pdf', buffer: folderPdfBytes() },
    { name: MANUAL_FILE, mimeType: 'application/pdf', buffer: manualPdfBytes() },
  ]);
  const start = dock().getByRole('button', { name: ACTION, exact: true });
  await start.waitFor({ state: 'visible', timeout: 30000 });
  measures.footnote = await dock().locator('.ai-chat-composer, form, footer').last().innerText().catch(() => '');
  j.step('A1 depois de soltar os PDFs, a mensagem "Li 2 arquivos" oferece montar a tabela de especificações',
    await start.isEnabled() && /Li 2 arquivos/.test(await dockText()), (await dockText()).slice(0, 300));
  j.addEvidence(await shot(page, 'j02l-01-pdfs-na-conversa'));

  // ------------------------------------------------------------------ B. leitura do servidor ainda não implantada
  await start.click();
  const unavailable = dock().getByText(/A leitura de arquivos pela IA ainda não está disponível/);
  await unavailable.waitFor({ timeout: 15000 });
  let st = await state(page);
  measures.unavailable = { text: await unavailable.innerText(), draftCalls: st.draftCalls, uploads: st.draftUploads };
  j.step('B1 sem a função implantada, o assistente diz em português claro que a leitura ainda não está disponível',
    /Continue montando o catálogo à mão\. Nada foi alterado no catálogo\./.test(measures.unavailable.text), measures.unavailable.text);
  j.step('B2 nada foi enviado e nada mudou no catálogo (só a verificação gratuita foi tentada)',
    st.draftUploads.length === 0 && st.draftCalls.every((call) => call.task === 'status')
      && JSON.stringify(st.runtime.document) === JSON.stringify(original), JSON.stringify(measures.unavailable));
  j.step('B3 a conversa guarda o pedido do pai com as palavras do botão', (await dockText()).includes(ACTION));
  j.addEvidence(await shot(page, 'j02l-02-leitura-indisponivel'));

  // ------------------------------------------------------------------ C. provedor controlado → páginas → leitura
  await page.evaluate((config) => { window.__FATHER_DRAFT__ = config; }, controlledAnswers());
  await dock().locator('[data-spec-table="blocked"]').getByRole('button', { name: 'Tentar de novo' }).click();
  const pagesCard = dock().getByRole('group', { name: 'Páginas do PDF para a IA ler' });
  await pagesCard.waitFor({ timeout: 20000 });
  const pagesText = (await pagesCard.innerText()).replace(/\s+/g, ' ');
  const inputs = await pagesCard.getByRole('spinbutton').evaluateAll((nodes) => nodes.map((node) => node.value));
  measures.pages = { text: pagesText, inputs };
  j.step('C1 o cartão sugere a página de especificações de cada PDF (9 no folder, 5 no manual) e avisa que o PDF vai para a IA',
    pagesText.includes('Achei especificações na página 9') && pagesText.includes('Achei especificações na página 5')
      && JSON.stringify(inputs) === JSON.stringify(['9', '9', '5', '5']) && /o PDF vai para o servidor da empresa e para a IA do Google/.test(pagesText),
    JSON.stringify(measures.pages));
  j.addEvidence(await shot(page, 'j02l-03-paginas'));
  await pagesCard.getByRole('button', { name: 'Ler estas páginas', exact: true }).click();
  const preview = dock().getByRole('group', { name: 'Prévia da tabela de especificações' });
  await preview.waitFor({ timeout: 30000 });
  const pending = dock().getByRole('group', { name: 'Pendências antes de inserir' });
  st = await state(page);
  const extractions = st.draftCalls.filter((call) => call.task === 'extract_facts');
  measures.read = { extractions, uploads: st.draftUploads.length };
  j.step('C2 a IA leu só as páginas escolhidas (folder p. 9, manual p. 5), com a chave do servidor',
    JSON.stringify(extractions.map((call) => [call.fileName, call.firstPage, call.lastPage, call.outcome]))
      === JSON.stringify([[FOLDER_FILE, 9, 9, 'OK'], [MANUAL_FILE, 5, 5, 'OK']]) && st.draftUploads.length === 2, JSON.stringify(measures.read));
  const previewText = (await preview.innerText()).replace(/\s+/g, ' ');
  const pendingHeading = await pending.getByRole('heading', { name: /^Pendências \(\d+\)$/ }).innerText();
  measures.beforeChoice = { pendingHeading, previewText: previewText.slice(0, 600) };
  j.step('C3 "Pendências (7)" lista o que não entra sozinho (resolução sem unidade impressa, faixa e condição que divergem)',
    pendingHeading === 'Pendências (7)' && (await pending.innerText()).includes('Fontes divergem') && (await pending.innerText()).includes('Conferir na página'),
    pendingHeading);
  j.step('C4 a prévia mostra a tabela que vai entrar: 6 valores conferidos, 6 em branco',
    previewText.includes('6 valores conferidos no PDF entram na tabela. 6 ficam em branco para você conferir (veja as Pendências acima).')
      && previewText.includes('10.5 kg') && previewText.includes('Ela entra na página 1, que está vazia.')
      && (await preview.getByText('a escolher', { exact: true }).count()) === 3 && (await preview.getByText('em branco', { exact: true }).count()) === 3,
    previewText.slice(0, 400));
  j.step('C5 nada mudou no catálogo antes de "Aplicar"', JSON.stringify(st.runtime.document) === JSON.stringify(original));
  j.addEvidence(await shot(page, 'j02l-04-pendencias-e-previa'));

  // ------------------------------------------------------------------ D. escolha do conflito com um clique
  await pending.getByRole('button', { name: 'Usar -25 °C to +155 °C', exact: true }).click();
  const afterChoice = (await preview.innerText()).replace(/\s+/g, ' ');
  const headingAfter = await pending.getByRole('heading', { name: /^Pendências \(\d+\)$/ }).innerText();
  j.step('D1 um clique escolhe o valor do folder para o TA-25N; só essa célula passa a ser preenchida',
    headingAfter === 'Pendências (6)' && afterChoice.includes('7 valores conferidos no PDF entram na tabela. 5 ficam em branco')
      && (await pending.innerText()).includes('Escolhido: -25 °C to +155 °C'), `${headingAfter} · ${afterChoice.slice(0, 200)}`);
  j.addEvidence(await shot(page, 'j02l-05-escolha'));

  // ------------------------------------------------------------------ E. Aplicar
  const pagesBefore = (await state(page)).runtime.document.pages.length;
  await preview.getByRole('button', { name: 'Aplicar', exact: true }).click();
  const insertedMessage = dock().getByText(/^Tabela inserida na página 1\. 6 valores ficaram para conferir: veja as Pendências\. Use Desfazer se precisar\.$/);
  await insertedMessage.waitFor({ timeout: 10000 });
  st = await state(page);
  const placed = tablesOf(st.runtime.document);
  const grid = placed[0] ? matrix(placed[0].object.table) : [];
  const valueCells = grid.slice(1).flatMap((row) => row.slice(1)).filter((text) => text.trim());
  measures.applied = { tables: placed.length, title: placed[0] ? plain(placed[0].object.table.title) : '', grid };
  j.step('E1 "Aplicar" insere UMA tabela na página 1, com o cabeçalho dos três modelos',
    placed.length === 1 && placed[0].pageIndex === 0 && JSON.stringify(grid[0]) === JSON.stringify(['Característica', ...TA]),
    JSON.stringify(measures.applied).slice(0, 600));
  j.step('E2 toda célula de valor preenchida é um valor conferido no PDF ou o escolhido; o resto ficou em branco',
    valueCells.length === 7 && valueCells.every((text) => VERIFIED_DISPLAY.has(text))
      && grid.find((row) => row[0] === 'Resolution')?.slice(1).every((text) => text === '')
      && JSON.stringify(grid.find((row) => row[0] === 'Operating Range')) === JSON.stringify(['Operating Range', '-25 °C to +155 °C', '', '']),
    JSON.stringify(grid));
  j.step('E3 a prévia sai da conversa e as pendências ficam para achar cada célula ("Mostrar na tabela")',
    (await preview.count()) === 0 && (await dock().getByRole('group', { name: 'Pendências da tabela inserida' })
      .getByRole('button', { name: /^Mostrar na tabela: / }).count()) > 0);
  j.addEvidence(await shot(page, 'j02l-06-aplicado'));
  await waitSaved(page, 20000);
  const applied = (await state(page)).runtime.document;

  // ------------------------------------------------------------------ F. UM Ctrl+Z, depois Refazer
  await page.keyboard.press('Control+z');
  let undone = await page.waitForFunction(() => window.__FATHER__.state().runtime.document.pages
    .every((p) => p.objects.every((o) => o.type !== 'table')), null, { timeout: 3000 }).then(() => true).catch(() => false);
  let undoPath = 'Ctrl+Z logo depois de "Aplicar"';
  if (!undone) {
    const region = page.getByRole('region', { name: /^Página \d+$/ }).first();
    const box = await region.boundingBox();
    if (box) await page.mouse.click(box.x + 20, Math.min(box.y + box.height - 30, viewport.height - 20));
    await page.keyboard.press('Control+z');
    undone = await page.waitForFunction(() => window.__FATHER__.state().runtime.document.pages
      .every((p) => p.objects.every((o) => o.type !== 'table')), null, { timeout: 3000 }).then(() => true).catch(() => false);
    undoPath = 'clique na página + Ctrl+Z';
  }
  st = await state(page);
  j.step('F1 UM Ctrl+Z tira a tabela inteira (o catálogo volta ao que era)',
    undone && st.runtime.document.pages.length === pagesBefore && JSON.stringify(st.runtime.document) === JSON.stringify(original),
    `caminho: ${undoPath}`);
  await page.getByRole('button', { name: 'Refazer última alteração' }).click();
  st = await state(page);
  j.step('F2 Refazer devolve a mesma tabela', JSON.stringify(st.runtime.document) === JSON.stringify(applied));
  await waitSaved(page, 20000);

  // ------------------------------------------------------------------ G. Publicar / PDF → Pronto
  const publishStarted = Date.now();
  await page.getByRole('button', { name: 'Publicar / PDF', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Revisar e publicar' });
  await review.waitFor({ timeout: 15000 });
  await page.waitForFunction(() => ['READY', 'BLOCKED'].includes(document.querySelector('[data-publication-host]')?.getAttribute('data-publication-status')),
    null, { timeout: 30000 });
  const publication = await page.locator('[data-publication-host]').getAttribute('data-publication-status');
  const diagnostics = await review.locator('[data-publication-diagnostic]').evaluateAll((nodes) => nodes.map((n) => ({ code: n.dataset.publicationDiagnostic, text: n.innerText })));
  measures.publication = { status: publication, ms: Date.now() - publishStarted, diagnostics };
  j.step('G1 a revisão de publicação fica Pronto (READY) com a tabela inserida', publication === 'READY', JSON.stringify(measures.publication));
  j.addEvidence(await shot(page, 'j02l-07-publicacao'));
  await review.getByRole('button', { name: 'Voltar ao editor', exact: true }).click();

  // ------------------------------------------------------------------ texto, console
  const texts = await cardTexts();
  const jargon = texts.match(new RegExp(JARGON.source, 'gi')) ?? [];
  j.step('H1 os cartões falam português simples (sem termos técnicos de programação)', jargon.length === 0, jargon.join(', '));
  const errors = consoleErrors(log);
  j.step('H2 zero erros de console e de página', errors.length === 0 && log.pageErrors.length === 0,
    JSON.stringify({ errors, pageErrors: log.pageErrors }).slice(0, 600));
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 900));
  await shot(page, 'j02l-99-erro').then((path) => j.addEvidence(path)).catch(() => {});
} finally {
  await j.finish(log, { extra: { viewportUsed: viewport, server: server.baseUrl, measures } });
  await browser.close().catch(() => {});
}
process.exit(j.steps.every((step) => step.ok) ? 0 : 1);

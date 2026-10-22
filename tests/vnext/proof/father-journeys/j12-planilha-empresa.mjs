// J12 — Planilha da empresa (grupo E, Equipe B). O pai quer importar PCON-MASTER-ENGLISHV2.xlsx e escolher a aba
// DB_SENSORS. A interface integrada cria pelo cartão de arquivos, lê o XLSX, escolhe sete colunas,
// insere e divide a tabela, confere publicação, Desfazer e Refazer. O harness usa persistência simulada.
// O que já existe e dá para provar sem rede é o módulo src/vnext/ai-catalog/source-intake.ts (1G, FR-65): a prova
// importa o módulo no navegador (vite) e lê o arquivo REAL da empresa: abas ocultas/AccessLogs/preços ficam de fora
// por padrão, DB_SENSORS inteira ao escolher a aba, vírgulas e decimais como o Excel mostra, valor bruto preservado.
//   BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j12-planilha-empresa.mjs
//   VP=1280 BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j12-planilha-empresa.mjs
//   PCON_XLSX=<caminho> troca o arquivo (padrão: a planilha real da empresa na pasta CONFIGURATOR PCON).
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import ExcelJS from 'exceljs';
import {
  createCatalog, ensureServer, freshDb, harnessUrl, journey, launch, shot, state, visibleText, waitLibrary, waitSaved,
} from './lib.mjs';
import {
  classifyConsole, clickCounter, finishJourneyGraded, measureAll, scanJargon, MIN_TARGET_PX,
} from './fixtures/father-eyes.mjs';

const XLSX_PATH = process.env.PCON_XLSX || 'C:/Users/Usuario/Desktop/CONFIGURATOR PCON/PCON-MASTER-ENGLISHV2.xlsx';
const XLSX_NAME = basename(XLSX_PATH);
const SHEET = 'DB_SENSORS';
const ALLOW = [/^(Catalog|Builder)$/, /^Zoom$/, /^(PDF|A4)$/i];

const server = await ensureServer();
const { browser, page, log, viewport } = await launch();
const j = journey('j12-planilha-empresa', 'J12 — Planilha da empresa: importar PCON-MASTER-ENGLISHV2.xlsx e escolher DB_SENSORS (interface integrada + comparação célula a célula com o Excel real)');
const db = freshDb('j12');
const clicks = clickCounter();
const timings = {};
const measures = {};
const observations = {};
let status = 'fail';

const buttonNames = (root) => root.getByRole('button').evaluateAll((buttons) =>
  buttons.map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean));

/** Linhas de dados da aba (depois do cabeçalho): código preenchido e que não é a nota "New sensors:". */
const dataRows = (rows, headerRow) => rows.slice(headerRow + 1).filter((row) => (row[0] ?? '').trim() !== '' && !/^new sensors/i.test(row[0]));

/** O que o Excel mostra, calculado em Node com ExcelJS, para comparar célula a célula com o módulo. */
async function excelExpectation(path) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(path);
  const sheets = book.worksheets.map((ws) => ({ name: ws.name, state: ws.state, rows: ws.actualRowCount, dims: ws.dimensions?.range ?? null }));
  const ws = book.getWorksheet(SHEET);
  const priceColumns = [];
  const header = ws.getRow(4);
  header.eachCell({ includeEmpty: false }, (cell) => { if (/price/i.test(String(cell.text))) priceColumns.push(cell.address.replace(/\d+/g, '')); });
  const cells = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const column = cell.address.replace(/\d+/g, '');
      if (priceColumns.includes(column)) return;
      // Numa mesclagem o ExcelJS repete o valor da célula-mestre em todas; o Excel mostra só na primeira.
      if (cell.isMerged && cell.master && cell.master.address !== cell.address) return;
      const value = cell.value && typeof cell.value === 'object' && 'result' in cell.value ? cell.value.result : cell.value;
      if (value === null || value === undefined) return;
      if (typeof value === 'number') cells.push({ address: `${SHEET}!${cell.address}`, row: rowNumber, kind: 'number', value, numFmt: cell.numFmt ?? null });
      else if (typeof value === 'string' || (value && typeof value === 'object' && 'richText' in value)) cells.push({ address: `${SHEET}!${cell.address}`, row: rowNumber, kind: 'text', value: cell.text });
      else cells.push({ address: `${SHEET}!${cell.address}`, row: rowNumber, kind: typeof value, value: String(cell.text) });
    });
  });
  return { sheets, priceColumns, cells, hiddenSheets: sheets.filter((s) => s.state !== 'visible').map((s) => s.name) };
}

try {
  // ------------------------------------------------------------------ A. Caminho visível pela biblioteca
  await page.goto(harnessUrl({ db }));
  await waitLibrary(page);
  observations.biblioteca = { botoes: await buttonNames(page) };
  await clicks.click('procurar onde importar', page.getByRole('button', { name: 'Novo catálogo', exact: true }));
  const dialog = page.getByRole('dialog', { name: 'Novo catálogo' });
  await dialog.waitFor({ timeout: 10000 });
  const aiOption = dialog.getByRole('button', { name: 'Criar com IA a partir de arquivos', exact: true });
  measures.criarComArquivos = await measureAll({ opcao: aiOption });
  j.step('A1 Novo catálogo oferece Criar com IA a partir de arquivos como primeira opção',
    await aiOption.isVisible() && await dialog.locator('.vnext-library-create-options button').first().getAttribute('data-library-create-option') === 'ai-files');
  j.step('A1 a opção tem alvo legível e clicável', measures.criarComArquivos.opcao?.fullyVisible && measures.criarComArquivos.opcao.heightPx >= MIN_TARGET_PX,
    JSON.stringify(measures.criarComArquivos));
  j.addEvidence(await shot(page, 'j12-01-caminho-criar-com-arquivos'));
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });

  // ------------------------------------------------------------------ C. O módulo que já existe (FR-65), com o arquivo REAL
  j.step('C0 a planilha real da empresa existe no disco', existsSync(XLSX_PATH), XLSX_PATH);
  const bytes = await readFile(XLSX_PATH);
  const expected = await excelExpectation(XLSX_PATH);
  observations.excel = { abas: expected.sheets, colunasDePreco: expected.priceColumns, abasOcultas: expected.hiddenSheets, bytes: bytes.byteLength };
  const b64 = bytes.toString('base64');

  // A primeira importação de exceljs faz o vite otimizar a dependência e RECARREGAR a página: aquece antes de medir.
  const warm = await page.evaluate(async () => {
    try { await import('/src/vnext/ai-catalog/source-intake.ts'); return 'ok'; } catch (error) { return String(error); }
  }).catch((error) => `recarregou durante a importação: ${String(error.message).slice(0, 100)}`);
  observations.aquecimentoDoModulo = warm;
  await page.waitForTimeout(1500);
  await waitLibrary(page);

  const t0 = Date.now();
  const result = await page.evaluate(async ({ b64, name, sheet }) => {
    const mod = await import('/src/vnext/ai-catalog/source-intake.ts');
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], name);
    const summarize = (intake) => ({
      blocks: intake.blocks.map((b) => ({ kind: b.kind, sheet: b.source.sheet, title: b.title, rows: b.kind === 'table' ? b.rows.length : null,
        cols: b.kind === 'table' ? (b.rows[0]?.length ?? 0) : null, headerRow: b.headerRow ?? null, range: b.range ?? null, flags: b.kind === 'table' ? b.flags.length : null,
        merges: b.kind === 'table' ? b.merges.length : null, warnings: b.warnings })),
      ignored: intake.ignored.map((g) => ({ kind: g.kind, sheet: g.sheet, label: g.label, reason: g.reason, message: g.message })),
      warnings: intake.warnings, rangeRequests: intake.rangeRequests.map((r) => ({ sheet: r.sheet, message: r.message })),
    });
    const tDefault = performance.now();
    const byDefault = await mod.readSourceFile(file, 0, {});
    const defaultMs = Math.round(performance.now() - tDefault);
    const tChosen = performance.now();
    const chosen = await mod.readSourceFile(file, 0, { sheets: [sheet] });
    const chosenMs = Math.round(performance.now() - tChosen);
    const withPrices = await mod.readSourceFile(file, 0, { sheets: [sheet], includeInternal: true });
    const batch = await mod.readSources([file]);
    const table = chosen.blocks.find((b) => b.kind === 'table' && b.source.sheet === sheet) ?? null;
    const priceTable = withPrices.blocks.find((b) => b.kind === 'table' && b.source.sheet === sheet) ?? null;
    return {
      defaultMs, chosenMs, limits: mod.SOURCE_LIMITS,
      byDefault: summarize(byDefault), chosen: summarize(chosen),
      table: table ? { rows: table.rows, addresses: table.addresses, raw: table.raw, headerRow: table.headerRow ?? null, flags: table.flags, merges: table.merges, range: table.range ?? null } : null,
      priceHeader: priceTable ? priceTable.rows[priceTable.headerRow ?? 0] : null,
      batch: batch.map((r) => ({ fileName: r.fileName, status: r.status, code: r.code ?? null, message: r.message ?? null })),
      needsHelp: table ? mod.needsHelp(chosen) : null,
    };
  }, { b64, name: XLSX_NAME, sheet: SHEET });
  timings.moduloTotalMs = Date.now() - t0;
  timings.leituraPadraoMs = result.defaultMs;
  timings.leituraDbSensorsMs = result.chosenMs;

  // C1–C3: o que fica de fora por padrão.
  const ignoredSheets = result.byDefault.ignored.filter((g) => g.kind === 'sheet');
  const hiddenOut = expected.hiddenSheets.filter((name) => ignoredSheets.some((g) => g.sheet === name && g.reason === 'hidden'));
  j.step('C1 abas OCULTAS no Excel ficam de fora por padrão, cada uma com o motivo', hiddenOut.length === expected.hiddenSheets.length && expected.hiddenSheets.length > 0,
    `ocultas no Excel: [${expected.hiddenSheets.join(', ')}] · fora como "oculta": [${hiddenOut.join(', ')}]`);
  const internalExpected = ['AccessLogs', 'HELPER', 'CONFIGURADOR', 'PENDING_ITEMS'];
  const internalOut = internalExpected.filter((name) => ignoredSheets.some((g) => g.sheet === name && g.reason === 'internal'));
  j.step('C2 AccessLogs, HELPER, CONFIGURADOR e PENDING_ITEMS (uso interno) ficam de fora por padrão', internalOut.length === internalExpected.length,
    `fora como "interno": [${internalOut.join(', ')}] · motivo mostrado: "${ignoredSheets.find((g) => g.sheet === 'AccessLogs')?.message ?? '-'}"`);
  const priceOut = result.byDefault.ignored.filter((g) => g.kind === 'column' && g.sheet === SHEET && g.reason === 'internal').map((g) => g.label);
  const priceInRows = result.table ? result.table.rows[result.table.headerRow ?? 0].filter((h) => /price/i.test(h)) : ['(sem tabela)'];
  j.step(`C3 as colunas de PREÇO da ${SHEET} (${expected.priceColumns.join(', ')}) ficam de fora por padrão e não aparecem no cabeçalho`,
    expected.priceColumns.every((c) => priceOut.includes(c)) && priceInRows.length === 0,
    `fora: [${priceOut.join(', ')}] · cabeçalhos com "Price" na tabela: ${priceInRows.length} · com "incluir dados internos" o cabeçalho volta: ${JSON.stringify(result.priceHeader?.filter((h) => /price/i.test(h)) ?? null)}`);
  const contentSheets = ['INSTRUCTIONS', 'DB_BASE_UNIT', 'DB_SENSORS', 'DB_OPTIONS', 'DB_ACCESSORIES'];
  const blockSheets = result.byDefault.blocks.map((b) => b.sheet);
  j.step('C4 por padrão entram só as 5 abas de conteúdo visíveis, sem pedir intervalo e sem aviso', contentSheets.every((s) => blockSheets.includes(s)) && blockSheets.length === contentSheets.length && result.byDefault.rangeRequests.length === 0 && result.byDefault.warnings.length === 0,
    `abas lidas: [${blockSheets.join(', ')}] · pedidos de intervalo: ${result.byDefault.rangeRequests.length} · avisos: ${result.byDefault.warnings.length} · ${result.defaultMs} ms`);
  const ignoredText = result.byDefault.ignored.map((g) => g.message).join('\n');
  const ignoredJargon = scanJargon(ignoredText, { allow: ALLOW });
  j.step('C5 os motivos do que ficou de fora estão em português, sem jargão, e dizem o nome da aba/coluna', ignoredJargon.length === 0 && result.byDefault.ignored.every((g) => g.message.includes(g.sheet ?? '')),
    `${result.byDefault.ignored.length} motivos · jargão: ${ignoredJargon.map((h) => h.term).join(', ') || '-'} · exemplo: "${result.byDefault.ignored.find((g) => g.kind === 'column')?.message ?? '-'}"`);

  // C6–C9: a aba escolhida, DB_SENSORS.
  const table = result.table;
  j.step(`C6 escolhendo a aba ${SHEET}, só ela é lida (as outras ficam "não escolhida")`, Boolean(table) && result.chosen.blocks.length === 1 && result.chosen.ignored.filter((g) => g.kind === 'sheet').every((g) => g.reason === 'not-chosen'),
    `blocos: ${result.chosen.blocks.length} · abas não escolhidas: ${result.chosen.ignored.filter((g) => g.reason === 'not-chosen').length} · ${result.chosenMs} ms`);
  const header = table ? table.rows[table.headerRow ?? 0] : [];
  const data = table ? dataRows(table.rows, table.headerRow ?? 0) : [];
  const codes = data.map((row) => row[0]);
  observations.dbSensors = {
    intervalo: table?.range, linhasNaGrade: table?.rows.length, linhaDoCabecalho: (table?.headerRow ?? -1) + 1, cabecalho: header, colunas: header.length,
    linhasDeSensores: data.length, primeiroCodigo: codes[0], ultimoCodigo: codes.at(-1), linhasAntesDoCabecalho: table?.rows.slice(0, table.headerRow ?? 0).map((r) => r[0]),
    linhasDepoisDosDados: table?.rows.slice((table.headerRow ?? 0) + 1).filter((r) => !data.includes(r)).map((r) => r[0]), celulasMarcadas: table?.flags.length, mesclagens: table?.merges.length,
    exemplo: data.slice(0, 2),
  };
  j.step(`C7 ${SHEET}: cabeçalho reconhecido na linha 4 ("Code", "Range (1)"…, "Description") e ${data.length} linhas de sensores (o plano fala em 69)`,
    Boolean(table) && header[0] === 'Code' && header.includes('Description') && header.includes('Accuracy') && data.length === 68 && (table.flags.length === 0),
    `cabeçalho: ${JSON.stringify(header)} · sensores: ${data.length} (${codes[0]} … ${codes.at(-1)}) · linhas antes do cabeçalho: ${JSON.stringify(observations.dbSensors.linhasAntesDoCabecalho)} · depois dos dados: ${JSON.stringify(observations.dbSensors.linhasDepoisDosDados)} · células marcadas: ${table?.flags.length} · limite: ${result.limits.rows} linhas`);
  j.step(`C8 as ${data.length} linhas cabem numa importação (limite ${result.limits.rows} linhas × ${result.limits.columns} colunas) e o arquivo fica "pronto" sem pedir ajuda`,
    Boolean(table) && table.rows.length <= result.limits.rows && header.length <= result.limits.columns && result.needsHelp === false && result.batch[0]?.status === 'ready',
    `grade ${table?.rows.length} × ${header.length} · needsHelp: ${result.needsHelp} · lote: ${JSON.stringify(result.batch)}`);

  // C9: vírgulas e decimais iguais ao Excel (célula a célula, fora as colunas de preço).
  const byAddress = new Map();
  if (table) table.rows.forEach((row, r) => row.forEach((text, c) => byAddress.set(table.addresses[r][c], { text, raw: table.raw[r][c] })));
  const mismatches = [];
  let compared = 0, numeric = 0, commaDecimals = 0;
  for (const cell of expected.cells) {
    const got = byAddress.get(cell.address);
    if (!got) { mismatches.push({ address: cell.address, why: 'célula não importada', excel: cell.value }); continue; }
    compared += 1;
    if (cell.kind === 'number') {
      numeric += 1;
      const digitsExcel = String(cell.value).replace(/[^0-9]/g, '');
      const digitsGot = got.text.replace(/[^0-9]/g, '');
      const hasFraction = !Number.isInteger(cell.value);
      if (hasFraction && got.text.includes(',')) commaDecimals += 1;
      const ok = digitsExcel === digitsGot && (!hasFraction || got.text.includes(',')) && !got.text.includes('.') && got.raw === String(cell.value);
      if (!ok) mismatches.push({ address: cell.address, why: 'número', excel: cell.value, numFmt: cell.numFmt, mostrado: got.text, bruto: got.raw });
    } else {
      const excelText = String(cell.value).replace(/\r\n?/g, '\n');
      if (got.text !== excelText) mismatches.push({ address: cell.address, why: 'texto', excel: excelText.slice(0, 60), mostrado: got.text.slice(0, 60) });
    }
  }
  observations.comparacaoComExcel = { celulasComparadas: compared, numericas: numeric, decimaisComVirgula: commaDecimals, divergencias: mismatches.slice(0, 8), totalDivergencias: mismatches.length,
    exemploNumerico: expected.cells.filter((c) => c.kind === 'number' && !Number.isInteger(c.value)).slice(0, 3).map((c) => ({ excel: c.value, mostrado: byAddress.get(c.address)?.text, bruto: byAddress.get(c.address)?.raw })) };
  j.step(`C9 vírgulas e decimais iguais ao Excel: ${compared} células comparadas (${numeric} numéricas), decimais com vírgula como no Excel em português, valor bruto preservado, textos idênticos`,
    compared === 686 && mismatches.length === 0 && commaDecimals > 0,
    `comparadas: ${compared} · numéricas: ${numeric} · decimais com vírgula: ${commaDecimals} · divergências: ${mismatches.length} ${mismatches.length ? JSON.stringify(mismatches.slice(0, 4)) : ''} · exemplo: ${JSON.stringify(observations.comparacaoComExcel.exemploNumerico)}`);

  // ------------------------------------------------------------------ B. Importação pela interface real dos componentes
  await createCatalog(page, { name: 'PCON — Sensores e faixas', starter: 'Criar com IA a partir de arquivos' });
  const assistant = page.locator('[data-vnext-assistant="open"]');
  await assistant.waitFor({ state: 'visible', timeout: 15000 });
  const intake = assistant.getByRole('region', { name: 'Arquivos para o catálogo', exact: true });
  const drop = intake.getByRole('button', { name: 'Arraste aqui PDFs, planilhas e fotos (ou clique para escolher)', exact: true });
  j.step('B1 o cartão cria o catálogo e abre o assistente com a área de arquivos', await drop.isVisible());
  const beforeInsertion = structuredClone((await state(page)).runtime.document);
  const readingStarted = Date.now();
  await intake.locator('input[type=file][aria-label="Escolher arquivos"]').setInputFiles(XLSX_PATH);
  await page.waitForFunction(() => {
    const row = document.querySelector('.ai-intake-files > li');
    return row && ['ready', 'needs-help', 'error'].includes(row.getAttribute('data-intake-state'));
  }, null, { timeout: 45000 });
  timings.leituraPelaTelaMs = Date.now() - readingStarted;
  const files = intake.getByRole('list', { name: 'Arquivos enviados' });
  const fileState = await files.locator('li').first().getAttribute('data-intake-state');
  j.step('B2 o arquivo real é lido e aparece Pronto, sem pedir ajuda', fileState === 'ready',
    `${fileState} · ${timings.leituraPelaTelaMs} ms`);
  const found = intake.getByRole('region', { name: `O que encontrei em ${XLSX_NAME}`, exact: true });
  await found.waitFor({ state: 'visible' });
  const hiddenToggle = found.getByRole('checkbox', { name: 'Incluir dados ocultos', exact: true });
  const leftOut = found.locator('details.ai-intake-ignored');
  await leftOut.locator('summary').click();
  const ignoredUiText = await leftOut.innerText();
  const chooseButtons = await found.locator('[data-choose-columns]').allTextContents();
  j.step('B2 dados ocultos, registros de acesso e preços ficam de fora pela interface',
    !(await hiddenToggle.isChecked()) && ignoredUiText.includes('AccessLogs')
      && expected.hiddenSheets.every((name) => ignoredUiText.includes(name)) && /preço|price/i.test(ignoredUiText),
    ignoredUiText.slice(0, 900));
  observations.importacaoPelaTela = { estado: fileState, botoesDeTabelas: chooseButtons, deixadoDeFora: ignoredUiText };
  j.addEvidence(await shot(page, 'j12-02-planilha-lida-no-assistente'));
  await clicks.click('escolher DB_SENSORS', found.getByRole('button', { name: /^Escolher colunas — .*DB_SENSORS$/ }));
  const chooser = intake.getByRole('group', { name: /^Escolher colunas — .*DB_SENSORS$/ });
  await chooser.waitFor({ state: 'visible' });
  const choices = chooser.getByRole('group', { name: 'Colunas', exact: true }).getByRole('checkbox');
  const chosenColumns = await choices.evaluateAll((nodes) => nodes.flatMap((node, index) => node.checked ? [index] : []));
  const chosenNames = await choices.evaluateAll((nodes) => nodes.filter((node) => node.checked).map((node) => node.closest('label').querySelector('strong').textContent));
  const headerCheckbox = chooser.getByRole('checkbox', { name: 'A primeira linha é o cabeçalho (ela se repete nas páginas seguintes)', exact: true });
  j.step('B3 Escolher colunas recomenda sete das dez colunas úteis, sem preço',
    await choices.count() === header.length && chosenColumns.length === 7 && !chosenNames.some((name) => /price|preço/i.test(name))
      && await headerCheckbox.isChecked(), JSON.stringify({ chosenColumns, chosenNames }));
  const expectedUiRows = table.rows.slice(table.headerRow ?? 0)
    .map((row) => chosenColumns.map((column) => row[column] ?? ''))
    .filter((row, index) => index === 0 || row.some((value) => value.trim() !== ''));
  const preview = await chooser.getByRole('region', { name: 'Prévia das primeiras linhas' }).locator('tr').evaluateAll((rows) =>
    rows.map((row) => [...row.querySelectorAll('th,td')].map((cell) => cell.textContent)));
  j.step('B3 a prévia mantém os valores e vírgulas exatamente como o módulo conferido com o Excel',
    JSON.stringify(preview) === JSON.stringify(expectedUiRows.slice(0, 4)), JSON.stringify(preview));
  j.addEvidence(await shot(page, 'j12-03-db-sensors-colunas-previa'));
  const insertionStarted = Date.now();
  await clicks.click('inserir a planilha', chooser.getByRole('button', { name: 'Inserir como tabela', exact: true }));
  await page.waitForFunction(() => window.__FATHER__.state().runtime.document.pages.length > 1, null, { timeout: 30000 });
  await waitSaved(page, 30000);
  const inserted = (await state(page)).runtime.document;
  const parts = inserted.pages.flatMap((p) => p.objects.filter((o) => o.type === 'table').map((object) => ({ pageId: p.id, object })));
  const textOf = (content) => content?.type === 'richText'
    ? content.value.paragraphs.map((p) => p.inlines.map((i) => i.text ?? '\n').join('')).join('\n')
    : content?.type === 'technicalCode' ? content.value : '';
  const rowsOf = (t, headerOnly) => t.rows.filter((r) => headerOnly ? r.role === 'header' : r.role !== 'header')
    .map((row) => t.columns.map((column) => textOf(t.cells.find((c) => c.rowId === row.id && c.columnId === column.id)?.content)));
  const headersRepeated = parts.every(({ object }) => JSON.stringify(rowsOf(object.table, true)) === JSON.stringify([expectedUiRows[0]]));
  const actualUiBody = parts.flatMap(({ object }) => rowsOf(object.table, false));
  const actualSensorCodes = actualUiBody.map((row) => row[0]).filter((code) => code.trim() !== '' && !/^new sensors/i.test(code));
  timings.insercaoEDivisaoMs = Date.now() - insertionStarted;
  observations.tabelaInserida = { paginas: inserted.pages.length, partes: parts.length, sensores: actualSensorCodes.length,
    linhasComNotas: actualUiBody.length, chosenColumns, chosenNames, cabecalhoRepetido: headersRepeated };
  j.step('B4 Inserir como tabela divide automaticamente a planilha em páginas com cabeçalho repetido',
    parts.length >= 2 && parts.length === inserted.pages.length && headersRepeated && parts.every(({ object }) => object.table.columns.length === 7
      && object.frame.yMm + object.frame.heightMm <= 297 && object.frame.xMm + object.frame.widthMm <= 210),
    JSON.stringify(observations.tabelaInserida));
  j.step('B4 os 68 sensores e os valores das sete colunas ficam na ordem original, sem perda nem duplicação',
    actualSensorCodes.length === 68 && JSON.stringify(actualSensorCodes) === JSON.stringify(codes)
      && JSON.stringify(actualUiBody) === JSON.stringify(expectedUiRows.slice(1)));
  j.addEvidence(await shot(page, 'j12-04-planilha-inserida-e-dividida'));
  await assistant.getByRole('button', { name: 'Fechar painel do assistente', exact: true }).click();
  await page.getByRole('button', { name: 'Publicar / PDF', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Revisar e publicar' });
  await review.waitFor({ timeout: 15000 });
  await page.waitForFunction(() => ['READY', 'BLOCKED'].includes(document.querySelector('[data-publication-host]')?.getAttribute('data-publication-status')),
    null, { timeout: 45000 });
  const publicationStatus = await page.locator('[data-publication-host]').getAttribute('data-publication-status');
  observations.publicacao = { estado: publicationStatus, texto: (await review.innerText()).slice(0, 1600) };
  j.step('B5 a planilha dividida não bloqueia Publicar / PDF',
    publicationStatus === 'READY' && await review.getByRole('button', { name: 'Imprimir / salvar PDF', exact: true }).isEnabled(),
    JSON.stringify(observations.publicacao));
  j.addEvidence(await shot(page, 'j12-05-publicacao-da-planilha'));
  await review.getByRole('button', { name: 'Voltar ao editor', exact: true }).click();
  await page.getByRole('button', { name: 'Desfazer última alteração', exact: true }).click();
  j.step('B6 um Desfazer remove a inserção inteira e todas as páginas de continuação',
    JSON.stringify((await state(page)).runtime.document) === JSON.stringify(beforeInsertion));
  await page.getByRole('button', { name: 'Refazer última alteração', exact: true }).click();
  j.step('B6 Refazer restaura a planilha dividida com os mesmos dados',
    JSON.stringify((await state(page)).runtime.document) === JSON.stringify(inserted));
  await waitSaved(page, 30000);

  // ------------------------------------------------------------------ D. console
  const { appErrors, devServerNoise } = classifyConsole(log);
  j.step('D1 zero erros de console e de página (fora o ruído do servidor de desenvolvimento ao otimizar o exceljs)', appErrors.length === 0 && log.pageErrors.length === 0,
    `console: ${appErrors.map((e) => e.text).join(' | ') || '-'} · página: ${log.pageErrors.join(' | ') || '-'} · ruído do vite: ${devServerNoise.length}`);
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 800));
  await shot(page, 'j12-99-erro').then((p) => j.addEvidence(p)).catch(() => {});
} finally {
  status = await finishJourneyGraded(j, log, { extra: { clicks: clicks.counts, timings, measures, observations, viewportUsed: viewport, server: server.baseUrl, xlsx: XLSX_PATH } });
  await browser.close();
  await server.close();
}
process.exit(status === 'fail' ? 1 : 0);

// FR-37: 69 linhas (cabeçalho + 68 sensores) × 7 colunas, sem continuação.
// Medição descritiva no harness normal; não define orçamento de desempenho.
import {
  baseUrl, createCatalog, ensureServer, freshDb, harnessUrl, journey, launch,
  shot, state, waitSaved,
} from './lib.mjs';

const server = await ensureServer();
const { browser, context, page, log, viewport } = await launch();
page.setDefaultTimeout(15000);
const j = journey('measure-fr37', 'FR-37 — edição inline de tabela 69×7 sem dividir, documento + pintura e long tasks');
const measurements = {
  build: 'Vite dev, React development build com StrictMode',
  data: 'Dados sintéticos: 1 cabeçalho + 68 sensores, 7 colunas; não é importação do arquivo PCON real.',
  method: 'keydown Enter capturado no navegador → célula confirmada no documento e DOM → 2 requestAnimationFrame; não inclui digitação, abertura da célula nem autosave.',
  limit: 'Nenhum limiar numérico de aprovação foi definido pelo plano; aprovação abaixo verifica apenas correção.',
  samples: [],
};
const rows = [
  ['Modelo', 'Faixa', 'Exatidão', 'Saída', 'Alimentação', 'Conexão', 'Descrição'],
  ...Array.from({ length: 68 }, (_, index) => [
    `SENSOR-${String(index + 1).padStart(3, '0')}`, '-25 a 140 °C', '±0,02 % FE',
    '4 a 20 mA', '24 V', 'Rosca de teste', `Sensor de teste ${index + 1}`,
  ]),
];
const tsv = rows.map((row) => row.join('\t')).join('\n');
const textOf = (content) => content?.type === 'richText'
  ? content.value.paragraphs.map((paragraph) => paragraph.inlines.map((inline) => inline.text ?? '\n').join('')).join('\n')
  : content?.type === 'technicalCode' ? content.value : content?.type === 'measurement' ? content.valueText : '';
const tableRows = (table) => table.rows.map((row) => table.columns.map((column) =>
  textOf(table.cells.find((cell) => cell.rowId === row.id && cell.columnId === column.id)?.content)));
const findTable = (snapshot, id) => snapshot.runtime.document.pages.flatMap((p) => p.objects).find((object) => object.type === 'table' && (!id || object.id === id));
const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: values.length, medianMs: sorted[Math.floor(sorted.length / 2)] ?? null, maxMs: sorted.at(-1) ?? null, samplesMs: values };
};
let status = 'fail';

try {
  await page.goto(harnessUrl({ db: freshDb('fr37') }));
  await createCatalog(page, { name: 'FR-37 — 69 linhas e 7 colunas', starter: 'Em branco' });
  const region = page.getByRole('region', { name: /^Página \d+$/ }).first();
  const box = await region.boundingBox();
  if (!box) throw new Error('Página não tem caixa visível para colar.');
  await page.mouse.click(box.x + box.width / 2, Math.min(box.y + box.height - 40, viewport.height - 20));
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl() });
  const clipboard = await page.evaluate(async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch (error) { return String(error.message); }
  }, tsv);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(1000);
  let table = findTable(await state(page));
  measurements.pasteMethod = 'Ctrl+V real';
  if (!table) {
    measurements.pasteMethod = `Evento paste sintético; clipboard real: ${clipboard}`;
    await page.evaluate((text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, tsv);
    await page.waitForFunction(() => window.__FATHER__.state().runtime.document.pages.some((p) => p.objects.some((o) => o.type === 'table')));
    table = findTable(await state(page));
  }
  if (!table) throw new Error('Colar não criou a tabela.');
  await waitSaved(page, 30000);
  const initial = structuredClone((await state(page)).runtime.document);
  measurements.shape = { pages: initial.pages.length, rows: table.table.rows.length, columns: table.table.columns.length, cells: table.table.cells.length };
  j.step('tabela inteira 69×7 permanece em uma página e preserva todos os valores sintéticos',
    initial.pages.length === 1 && table.table.rows.length === 69 && table.table.columns.length === 7
      && JSON.stringify(tableRows(table.table)) === JSON.stringify(rows), JSON.stringify(measurements.shape));
  j.addEvidence(await shot(page, 'fr37-01-tabela-inteira'));
  const closeNotice = page.locator('[data-editor-notices]').getByRole('button', { name: 'Fechar', exact: true });
  if (await closeNotice.count()) await closeNotice.first().click();
  await page.locator(`[data-editor-object-id="${table.id}"]`).click({ position: { x: 20, y: 10 } });
  await page.getByRole('button', { name: 'Editar tabela', exact: true }).click();
  await page.locator('[data-table-grid-overlay]').waitFor({ state: 'visible' });

  // Observação somente: nenhuma mutação de sessão/documento ocorre por evaluate.
  await page.evaluate(() => {
    const metric = { tasks: [], supported: PerformanceObserver.supportedEntryTypes.includes('longtask'), armed: null, sample: null };
    if (metric.supported) {
      const observer = new PerformanceObserver((list) => {
        metric.tasks.push(...list.getEntries().map((entry) => ({ startTime: entry.startTime, duration: entry.duration })));
      });
      observer.observe({ type: 'longtask', buffered: true });
      metric.observer = observer;
    }
    document.addEventListener('keydown', (event) => {
      if (!metric.armed || event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const armed = metric.armed;
      metric.armed = null;
      const start = performance.now();
      metric.sample = { ...armed, start, documentAndDomMs: null, paintMs: null, timeout: false };
      const poll = () => {
        const runtime = window.__FATHER__.state().runtime;
        const object = runtime.document.pages.flatMap((p) => p.objects).find((o) => o.id === armed.objectId);
        const content = object?.table.cells.find((cell) => cell.id === armed.cellId)?.content;
        const text = content?.type === 'richText' ? content.value.paragraphs.map((p) => p.inlines.map((i) => i.text ?? '\n').join('')).join('\n')
          : content?.type === 'technicalCode' ? content.value : content?.type === 'measurement' ? content.valueText : '';
        const drawn = document.querySelector(`[data-cell-id="${CSS.escape(armed.cellId)}"]`)?.textContent ?? '';
        if (text === armed.value && drawn.includes(armed.value) && !document.querySelector('[data-cell-inline-editor]')) {
          metric.sample.documentAndDomMs = performance.now() - start;
          requestAnimationFrame(() => requestAnimationFrame(() => { metric.sample.paintMs = performance.now() - start; }));
        } else if (performance.now() - start >= 15000) metric.sample.timeout = true;
        else requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    }, { capture: true });
    window.__FR37_MEASURE__ = metric;
  });

  const expectedEditedRows = structuredClone(rows);
  for (let index = 0; index < 5; index += 1) {
    const row = index + 2;
    const column = 7;
    const cell = table.table.cells.find((candidate) => candidate.rowId === table.table.rows[row - 1].id && candidate.columnId === table.table.columns[column - 1].id);
    if (!cell) throw new Error(`Célula ${row}:${column} ausente.`);
    await page.getByRole('gridcell', { name: `Linha ${row}, coluna ${column}`, exact: true }).dblclick();
    const inline = page.getByRole('textbox', { name: `Conteúdo da célula, linha ${row}, coluna ${column}`, exact: true });
    await inline.waitFor({ state: 'visible' });
    const value = `Edição de desempenho ${index + 1}`;
    await inline.fill(value);
    await page.evaluate((armed) => {
      window.__FR37_MEASURE__.sample = null;
      window.__FR37_MEASURE__.armed = armed;
    }, { objectId: table.id, cellId: cell.id, value, row, column });
    await inline.press('Enter');
    await page.waitForFunction(() => Number.isFinite(window.__FR37_MEASURE__.sample?.paintMs) || window.__FR37_MEASURE__.sample?.timeout);
    await page.waitForTimeout(100); // Entrega as entradas de long task do intervalo já medido.
    const sample = await page.evaluate(() => {
      const metric = window.__FR37_MEASURE__, sample = metric.sample;
      const end = sample.start + (sample.paintMs ?? 15000);
      const tasks = metric.tasks.filter((task) => task.startTime + task.duration > sample.start && task.startTime < end)
        .map((task) => ({ ...task, overlapMs: Math.max(0, Math.min(task.startTime + task.duration, end) - Math.max(task.startTime, sample.start)) }));
      return { ...sample, longTaskSupported: metric.supported, longTasks: metric.supported ? tasks : null,
        longTaskTotalMs: metric.supported ? tasks.reduce((sum, task) => sum + task.overlapMs, 0) : null };
    });
    measurements.samples.push(sample);
    const updated = findTable(await state(page), table.id);
    expectedEditedRows[row - 1][column - 1] = value;
    j.step(`edição ${index + 1} confirma pela UI, desenha o valor e preserva toda a matriz 69×7 sem dividir`,
      !sample.timeout && Number.isFinite(sample.paintMs) && updated.table.rows.length === 69 && updated.table.columns.length === 7 && updated.table.cells.length === 483
        && JSON.stringify(tableRows(updated.table)) === JSON.stringify(expectedEditedRows)
        && (await state(page)).runtime.document.pages.length === 1,
      JSON.stringify(sample));
  }
  await waitSaved(page, 30000);
  const edited = structuredClone((await state(page)).runtime.document);
  j.addEvidence(await shot(page, 'fr37-02-cinco-edicoes'));
  await page.getByRole('button', { name: 'Voltar ao objeto', exact: true }).click();
  for (let index = 0; index < 5; index += 1) await page.getByRole('button', { name: 'Desfazer última alteração', exact: true }).click();
  j.step('cinco Desfazer restauram exatamente a tabela original', JSON.stringify((await state(page)).runtime.document) === JSON.stringify(initial));
  for (let index = 0; index < 5; index += 1) await page.getByRole('button', { name: 'Refazer última alteração', exact: true }).click();
  j.step('cinco Refazer restauram exatamente as cinco edições', JSON.stringify((await state(page)).runtime.document) === JSON.stringify(edited));
  await waitSaved(page, 30000);
  measurements.documentAndDomLatency = stats(measurements.samples.map((sample) => sample.documentAndDomMs));
  measurements.paintLatency = stats(measurements.samples.map((sample) => sample.paintMs));
  measurements.longTaskTotalMs = measurements.samples.every((sample) => sample.longTaskSupported)
    ? measurements.samples.reduce((sum, sample) => sum + sample.longTaskTotalMs, 0) : null;
  j.step('zero erros de console e de página', !log.pageErrors.length && !log.console.some((entry) => entry.type === 'error'), JSON.stringify(log));
} catch (error) {
  j.step('medição concluída sem exceção', false, String(error?.stack ?? error).slice(0, 1200));
  await shot(page, 'fr37-99-erro').then((path) => j.addEvidence(path)).catch(() => {});
} finally {
  status = await j.finish(log, { extra: { measurements, viewportUsed: viewport } });
  await browser.close();
  await server.close();
}
process.exit(status === 'fail' ? 1 : 0);

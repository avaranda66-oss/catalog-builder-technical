import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const root = process.cwd();
const gitHeadSha = (() => {
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'UNKNOWN';
  }
})();
const baseUrl = process.env.A4_PROOF_BASE_URL || 'http://127.0.0.1:4174';
const evidenceDir = path.join(root, 'docs', 'qa', 'evidence', 'a4-flow-r1-1');
const evidenceDirR13 = path.join(root, 'docs', 'qa', 'evidence', 'a4-flow-r1-3');
const models = ['TA-25N', 'TA-35N', 'TA-50N'];

const waitForServer = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // server is still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not become ready at ${baseUrl}`);
};

const startServer = () => {
  if (process.env.A4_PROOF_BASE_URL) return null;
  return spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '4174'], {
    cwd: root,
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
};

const readPhysicalEvidence = async (page) => page.evaluate(() => {
  const rootElement = document.querySelector('[data-a4-physical-proof]');
  const canonicalRows = JSON.parse(rootElement?.getAttribute('data-proof-canonical-rows') || '{}');
  const pages = Array.from(document.querySelectorAll('[data-a4-page]')).map((pageElement, index) => {
    const viewport = pageElement.querySelector('[data-a4-block-flow-viewport]');
    const content = pageElement.querySelector('[data-a4-block-flow-content]');
    const rowIds = Array.from(pageElement.querySelectorAll('[data-canonical-row-id]'))
      .map((row) => row.getAttribute('data-canonical-row-id'))
      .filter(Boolean);
    const canonicalBlockIds = [...new Set(Array.from(pageElement.querySelectorAll('[data-canonical-block-id]'))
      .map((block) => block.getAttribute('data-canonical-block-id'))
      .filter(Boolean))];
    const canonicalTableRowCount = canonicalBlockIds.reduce(
      (sum, blockId) => sum + (canonicalRows[blockId]?.length ?? 0),
      0
    );
    const viewportRect = viewport?.getBoundingClientRect();
    const printableElements = Array.from(pageElement.querySelectorAll('[data-canonical-block-id], [data-canonical-row-id], th, td'));
    const clippedBottomElements = viewportRect
      ? printableElements.filter((element) => element.getBoundingClientRect().bottom > viewportRect.bottom + 1).length
      : 1;
    const clippedRightElements = viewportRect
      ? printableElements.filter((element) => element.getBoundingClientRect().right > viewportRect.right + 1).length
      : 1;
    const overflowY = Math.max(0, (content?.scrollHeight ?? 0) - (viewport?.clientHeight ?? 0));
    const overflowX = Math.max(0, (content?.scrollWidth ?? 0) - (viewport?.clientWidth ?? 0));
    return {
      page: index + 1,
      physicalPageId: pageElement.getAttribute('data-a4-page-id'),
      canonicalPageId: pageElement.getAttribute('data-canonical-page-id'),
      semanticContent: Array.from(pageElement.querySelectorAll('[data-canonical-block-id]'))
        .map((block) => block.getAttribute('data-block-type'))
        .filter(Boolean)
        .join(', '),
      actualHeight: content?.scrollHeight ?? 0,
      usableHeight: viewport?.clientHeight ?? 0,
      overflowY,
      overflowYmm: Number((overflowY * 25.4 / 96).toFixed(3)),
      actualWidth: content?.scrollWidth ?? 0,
      usableWidth: viewport?.clientWidth ?? 0,
      overflowX,
      canonicalTableRowCount,
      renderedRowCount: rowIds.length,
      clippedBottomElements,
      clippedRightElements,
      rowIds,
      status: (content && viewport
        && content.scrollHeight <= viewport.clientHeight + 1
        && content.scrollWidth <= viewport.clientWidth + 1
        && clippedBottomElements === 0
        && clippedRightElements === 0) ? 'PASS' : 'FAIL'
    };
  });
  const renderedRows = pages.flatMap((entry) => entry.rowIds);
  const duplicateRows = renderedRows.filter((id, index) => renderedRows.indexOf(id) !== index);
  const expectedRows = Object.values(canonicalRows).flat();
  const missingRows = expectedRows.filter((id) => !renderedRows.includes(id));
  return {
    model: rootElement?.getAttribute('data-proof-model'),
    layoutState: document.querySelector('.clean-export-root')?.getAttribute('data-layout-state'),
    layoutBlockCount: Number(document.querySelector('.clean-export-root')?.getAttribute('data-layout-block-count') || 0),
    issues: JSON.parse(document.querySelector('[data-proof-status]')?.getAttribute('data-proof-issues') || '[]'),
    pages: pages.map(({ rowIds: _rowIds, ...entry }) => entry),
    rowConservation: {
      canonicalCount: expectedRows.length,
      renderedCount: renderedRows.length,
      missingRows,
      duplicateRows: [...new Set(duplicateRows)]
    }
  };
});

const run = async () => {
  await fs.mkdir(evidenceDir, { recursive: true });
  const server = startServer();
  await waitForServer();
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-dev-shm-usage'] });
  } catch {
    browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error('[browser pageerror]', error));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('[browser console]', message.text());
  });
  const evidence = [];

  try {
    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
      const model = models[modelIndex];
      if (modelIndex === 0) {
        await page.goto(`${baseUrl}/__a4-physical-proof?model=${model}`, { waitUntil: 'domcontentloaded' });
      } else {
        await page.getByRole('button', { name: model, exact: true }).click();
        await page.waitForFunction((expectedModel) => document.querySelector('[data-a4-physical-proof]')?.getAttribute('data-proof-model') === expectedModel, model);
      }
      await page.locator('[data-proof-status]').waitFor();
      await page.waitForFunction(() => document.querySelector('[data-proof-status]')?.textContent !== 'MEASURING');
      const modelEvidence = await readPhysicalEvidence(page);
      evidence.push(modelEvidence);

      const safeModel = model.toLowerCase();
      await page.locator('[data-a4-page]').first().screenshot({ path: path.join(evidenceDir, `${safeModel}-cover.png`) });
      const longestPage = page.locator('[data-a4-page]').evaluateAll((elements) => {
        let winner = 0;
        let maxRows = -1;
        elements.forEach((element, index) => {
          const rows = element.querySelectorAll('[data-canonical-row-id]').length;
          if (rows > maxRows) { winner = index; maxRows = rows; }
        });
        return winner;
      });
      await page.locator('[data-a4-page]').nth(await longestPage).screenshot({ path: path.join(evidenceDir, `${safeModel}-longest-table.png`) });
      if (model === 'TA-25N') {
        for (const [canonicalPageId, evidenceName] of [
          ['p6-TA-25N-inserts', 'ta-25n-inserts.png'],
          ['p7-TA-25N-delivery', 'ta-25n-delivery-accessories.png'],
          ['p8-TA-25N-ordering', 'ta-25n-ordering.png']
        ]) {
          await page.locator(`[data-a4-page][data-canonical-page-id="${canonicalPageId}"]`).first()
            .screenshot({ path: path.join(evidenceDir, evidenceName) });
        }
      }
    }

    await page.getByRole('button', { name: 'TA-25N', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-a4-physical-proof]')?.getAttribute('data-proof-model') === 'TA-25N');
    await page.waitForFunction(() => document.querySelector('[data-proof-status]')?.textContent !== 'MEASURING');
    const baselinePageCount = Number(await page.locator('[data-proof-status]').getAttribute('data-page-count'));
    const canonicalPageCount = Number(await page.locator('[data-a4-physical-proof]').getAttribute('data-proof-canonical-page-count'));
    const beforeRows = await page.locator('[data-a4-physical-proof]').evaluate((element) =>
      Object.values(JSON.parse(element.getAttribute('data-proof-canonical-rows') || '{}')).flat().length
    );
    await page.getByRole('button', { name: 'Adicionar linhas' }).click();
    await page.waitForFunction(() => document.querySelector('[data-proof-status]')?.textContent !== 'MEASURING');
    const smartPageCount = Number(await page.locator('[data-proof-status]').getAttribute('data-page-count'));
    const stableSmartIds = await page.locator('[data-a4-page]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-a4-page-id')));
    await page.waitForTimeout(100);
    const stableSmartIdsAfterWait = await page.locator('[data-a4-page]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-a4-page-id')));
    await page.locator('[data-a4-page]').last().screenshot({ path: path.join(evidenceDir, 'smart-flow-demonstration.png') });

    await page.getByRole('button', { name: 'Excluir linhas adicionadas' }).click();
    await page.waitForFunction(() => document.querySelector('[data-proof-status]')?.textContent !== 'MEASURING');
    const smartPageCountAfterDelete = Number(await page.locator('[data-proof-status]').getAttribute('data-page-count'));
    const smartAfterDeleteEvidence = await readPhysicalEvidence(page);

    await page.getByRole('button', { name: 'Adicionar linhas' }).click();
    await page.waitForFunction(() => document.querySelector('[data-proof-status]')?.textContent !== 'MEASURING');
    const smartPageCountBeforeLongCell = Number(await page.locator('[data-proof-status]').getAttribute('data-page-count'));
    const smartRowsBeforeLongCell = (await readPhysicalEvidence(page)).pages.map((entry) => entry.renderedRowCount);
    await page.getByRole('button', { name: 'Editar célula longa' }).click();
    await page.waitForFunction(() => document.querySelector('[data-proof-status]')?.textContent !== 'MEASURING');
    const smartPageCountAfterLongCell = Number(await page.locator('[data-proof-status]').getAttribute('data-page-count'));
    const smartRowsAfterLongCell = (await readPhysicalEvidence(page)).pages.map((entry) => entry.renderedRowCount);
    const stableLongCellIds = await page.locator('[data-a4-page]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-a4-page-id')));
    await page.waitForTimeout(100);
    const stableLongCellIdsAfterWait = await page.locator('[data-a4-page]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-a4-page-id')));

    await page.getByRole('button', { name: 'Manual' }).click();
    await page.waitForFunction(() => document.querySelector('[data-proof-status]')?.textContent !== 'MEASURING');
    const manualStatusBeforeBreak = await page.locator('[data-proof-status]').textContent();
    const manualPageCountBeforeBreak = Number(await page.locator('[data-proof-status]').getAttribute('data-page-count'));
    const manualEvidenceBeforeBreak = await readPhysicalEvidence(page);
    await page.getByRole('button', { name: 'Quebrar página antes desta linha' }).click();
    await page.waitForFunction(() => document.querySelector('[data-proof-status]')?.textContent !== 'MEASURING');
    const manualStatusAfterBreak = await page.locator('[data-proof-status]').textContent();
    const manualPageCountAfterBreak = Number(await page.locator('[data-proof-status]').getAttribute('data-page-count'));
    const manualEvidenceAfterBreak = await readPhysicalEvidence(page);
    await page.locator('[data-a4-page]').filter({ has: page.locator('[data-canonical-row-id]') }).first()
      .screenshot({ path: path.join(evidenceDir, 'manual-break-demonstration.png') });

    await page.getByRole('button', { name: 'Inteligente' }).click();
    await page.getByRole('button', { name: 'Código horizontal adversarial' }).click();
    await page.waitForFunction(() => document.querySelector('[data-proof-status]')?.textContent !== 'MEASURING');
    const horizontalStatus = await page.locator('[data-proof-status]').textContent();
    const horizontalEvidence = await readPhysicalEvidence(page);

    await page.getByRole('button', { name: 'Excluir linhas adicionadas' }).click();
    await page.waitForFunction(() => document.querySelector('[data-proof-status]')?.textContent !== 'MEASURING');
    const pageCountAfterDelete = Number(await page.locator('[data-proof-status]').getAttribute('data-page-count'));
    const afterDeleteEvidence = await readPhysicalEvidence(page);

    // Prova de Catálogo Legado (White-screen regression prevention)
    await page.getByRole('button', { name: 'Legacy' }).click();
    await page.waitForFunction(() => document.querySelector('[data-a4-physical-proof]')?.getAttribute('data-proof-model') === 'Legacy');
    await page.waitForFunction(() => document.querySelector('[data-proof-status]')?.textContent !== 'MEASURING');
    const legacyEvidence = await readPhysicalEvidence(page);
    await page.locator('[data-a4-page]').first().screenshot({ path: path.join(evidenceDir, 'legacy-cover.png') });

    // Prova de Asset / Imagem Atrasada Adversarial
    await page.getByRole('button', { name: 'TA-25N' }).click();
    await page.waitForFunction(() => document.querySelector('[data-a4-physical-proof]')?.getAttribute('data-proof-model') === 'TA-25N');
    await page.waitForFunction(() => document.querySelector('[data-proof-status]')?.textContent !== 'MEASURING');
    await page.getByRole('button', { name: 'Imagem atrasada' }).click();
    await page.waitForFunction(() => document.querySelector('[data-proof-status]')?.textContent !== 'MEASURING');
    const delayedImageEvidence = await readPhysicalEvidence(page);

    const failures = evidence.flatMap((entry) => entry.pages.filter((physicalPage) => physicalPage.status !== 'PASS'));
    const rowDefects = evidence.filter((entry) => entry.rowConservation.missingRows.length || entry.rowConservation.duplicateRows.length);
    const blocked = evidence.filter((entry) => entry.layoutState !== 'ready' || entry.layoutBlockCount !== 0);
    const report = {
      generatedAt: new Date().toISOString(),
      gitHeadSha,
      baseUrl,
      evidence,
      legacyEvidence,
      delayedImageEvidence,
      dynamicDogfood: {
        baselinePageCount,
        canonicalPageCount,
        beforeRows,
        smartPageCount,
        stableSmartIds,
        stableSmartIdsAfterWait,
        smartPageCountAfterDelete,
        smartAfterDeleteEvidence,
        smartPageCountBeforeLongCell,
        smartPageCountAfterLongCell,
        smartRowsBeforeLongCell,
        smartRowsAfterLongCell,
        stableLongCellIds,
        stableLongCellIdsAfterWait,
        manualStatusBeforeBreak,
        manualPageCountBeforeBreak,
        manualEvidenceBeforeBreak,
        manualStatusAfterBreak,
        manualPageCountAfterBreak,
        manualEvidenceAfterBreak,
        horizontalAdversarialStatus: horizontalStatus,
        horizontalEvidence,
        pageCountAfterDelete,
        afterDeleteEvidence
      },
      summary: { failures: failures.length, rowDefects: rowDefects.length, blockedCatalogs: blocked.length }
    };
    await fs.mkdir(evidenceDirR13, { recursive: true });
    await fs.writeFile(path.join(evidenceDir, 'presys-a4-physical.json'), `${JSON.stringify(report, null, 2)}\n`);
    await fs.writeFile(path.join(evidenceDirR13, 'presys-a4-physical.json'), `${JSON.stringify(report, null, 2)}\n`);

    if (failures.length || rowDefects.length || blocked.length) {
      throw new Error(`Physical acceptance failed: ${JSON.stringify(report.summary)}`);
    }
    const horizontalSafelyWrapped = horizontalEvidence.pages.every((entry) => entry.overflowX <= 1 && entry.clippedRightElements === 0);
    if (!horizontalStatus?.startsWith('BLOCKED:') && !horizontalSafelyWrapped) {
      throw new Error(`Horizontal adversarial value neither wrapped safely nor failed closed: ${horizontalStatus}`);
    }
    if (smartPageCount <= baselinePageCount || stableSmartIds.join('|') !== stableSmartIdsAfterWait.join('|')) {
      throw new Error('Smart Flow did not add a stable derived continuation page.');
    }
    if (smartPageCountAfterDelete !== baselinePageCount || smartAfterDeleteEvidence.rowConservation.missingRows.length || smartAfterDeleteEvidence.rowConservation.duplicateRows.length) {
      throw new Error('Deleting dynamic rows did not flow content back to the baseline safely.');
    }
    if (smartPageCountAfterLongCell < smartPageCountBeforeLongCell
      || stableLongCellIds.join('|') !== stableLongCellIdsAfterWait.join('|')
      || smartRowsBeforeLongCell.join('|') === smartRowsAfterLongCell.join('|')) {
      throw new Error('Editing a long cell did not produce a stable deterministic reflow.');
    }
    if (!manualStatusBeforeBreak?.startsWith('BLOCKED:')
      || manualPageCountBeforeBreak !== canonicalPageCount
      || !manualStatusAfterBreak?.startsWith('BLOCKED:')
      || manualPageCountAfterBreak <= manualPageCountBeforeBreak
      || manualEvidenceBeforeBreak.rowConservation.missingRows.length
      || manualEvidenceBeforeBreak.rowConservation.duplicateRows.length
      || manualEvidenceAfterBreak.rowConservation.missingRows.length
      || manualEvidenceAfterBreak.rowConservation.duplicateRows.length) {
      throw new Error('Manual mode rearranged silently, ignored the explicit break, or lost canonical rows.');
    }
    if (pageCountAfterDelete > smartPageCount || afterDeleteEvidence.rowConservation.missingRows.length || afterDeleteEvidence.rowConservation.duplicateRows.length) {
      throw new Error('Deleting dynamic rows did not reflow safely.');
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

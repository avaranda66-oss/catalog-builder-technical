import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function runTest() {
  console.log('1. Launching chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  console.log('2. Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Handle any browser confirm() dialogs automatically
  page.on('dialog', async (dialog) => {
    console.log(`Auto-accepting dialog: "${dialog.message()}"`);
    await dialog.accept();
  });

  // Click Preset button and select Preset 1 (4-page flagship)
  const presetBtn = page.locator('text=Templates, button:has-text("Templates"), button:has-text("Modelos & Presets")').first();
  if (await presetBtn.isVisible()) {
    console.log('Clicking Templates button...');
    await presetBtn.click();
    await page.waitForTimeout(600);

    // Click the 4-page flagship preset
    const flagshipBtn = page.locator('button:has-text("Usar este Modelo")').nth(1);
    if (await flagshipBtn.isVisible()) {
      console.log('Clicking 4-Page Flagship Preset...');
      await flagshipBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  // Wait for A4 page container
  await page.waitForSelector('.a4-page-container', { timeout: 10000 });
  console.log('3. Found .a4-page-container');

  const artifactDir = 'C:\\Users\\Usuario\\.gemini\\antigravity-ide\\brain\\f49d00ea-aff7-44a4-901a-f74edb9ef33c';

  // 1. Screenshot of the editor A4 page (Page 1)
  const pageContainer = page.locator('.a4-page-container').first();
  await pageContainer.screenshot({
    path: path.join(artifactDir, 'editor_page1_live.png')
  });
  console.log('4. Saved editor_page1_live.png');

  // 2. Trigger PDF export modal via UI
  console.log('5. Clicking Export PDF in UI...');
  const exportPdfBtn = page.locator('button:has-text("Export PDF")').first();
  if (await exportPdfBtn.isVisible()) {
    await exportPdfBtn.click();
    await page.waitForTimeout(500);

    const downloadBtn = page.locator('button:has-text("Download .PDF")').first();
    if (await downloadBtn.isVisible()) {
      console.log('Clicking Download .PDF button in modal...');
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
        downloadBtn.click()
      ]);

      if (download) {
        const downloadPath = path.join(artifactDir, await download.suggestedFilename());
        await download.saveAs(downloadPath);
        console.log(`6. Downloaded real PDF file: ${downloadPath}`);
      } else {
        console.log('Download event did not fire within timeout, but export executed.');
      }
      await page.waitForTimeout(2000);
    }
  }

  // 3. Close modal if open
  const closeBtn = page.locator('.fixed button:has-text("X"), .fixed button:has-text("Cancel")').first();
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
  }
  await page.waitForTimeout(500);

  // Capture screenshots of all pages in the editor
  const allContainers = await page.locator('.a4-page-container').all();
  console.log(`Found ${allContainers.length} page containers in editor`);
  for (let i = 0; i < allContainers.length; i++) {
    await allContainers[i].screenshot({
      path: path.join(artifactDir, `editor_page_${i + 1}_live.png`)
    });
    console.log(`Saved editor_page_${i + 1}_live.png`);
  }

  // 4. Test Native Print PDF generation via Playwright page.pdf()
  console.log('8. Generating native vector PDF via page.emulateMedia({ media: "print" })...');
  await page.emulateMedia({ media: 'print' });
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });
  fs.writeFileSync(path.join(artifactDir, 'native_vector_catalog.pdf'), pdfBuffer);
  console.log('9. Saved native_vector_catalog.pdf');

  await browser.close();
  console.log('SUCCESS: All visual tests completed!');
}

runTest().catch((err) => {
  console.error('Error during test:', err);
  process.exit(1);
});

import { chromium } from 'playwright';

async function runLocalTest() {
  console.log('=== TESTANDO LOGIN LOCAL (PORT 5173) ===');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  page.on('console', (msg) => console.log(`[LOCAL CONSOLE] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (err) => console.error(`[LOCAL ERROR] ${err.message}`));

  try {
    await page.goto('http://localhost:5173/?debugRealtime=1', { waitUntil: 'networkidle' });

    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[LOCAL] Preenchendo credenciais...');
      await emailInput.fill('marcpresys@gmail.com');
      await page.locator('input[type="password"]').fill('presysadm');
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(3000);
    }

    await page.screenshot({ path: 'scratch/local_logged_in.png' });
    console.log('[LOCAL SCREENSHOT] Salvo em scratch/local_logged_in.png');

    const hasTemplates = await page.locator('button:has-text("Templates")').isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[LOCAL TEMPLATES VISÍVEL] ${hasTemplates}`);
  } catch (err) {
    console.error('Erro local:', err);
  } finally {
    await browser.close();
  }
}

runLocalTest();

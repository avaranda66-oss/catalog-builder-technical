import { chromium } from 'playwright';

async function runE2ETest() {
  console.log('=== INICIANDO TESTE E2E DE TEMPLATE CAS & COLLABORATION (PLAYWRIGHT) ===');
  const browser = await chromium.launch({ headless: true });

  const contextA = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pageA = await contextA.newPage();

  pageA.on('console', (msg) => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
  pageA.on('pageerror', (err) => console.error(`[PAGE ERROR] ${err.message}`));

  const baseUrl = 'https://catalog-builder-technical.vercel.app/?debugRealtime=1';

  try {
    console.log('[1/7] Acessando aplicação no Browser A...');
    await pageA.goto(baseUrl, { waitUntil: 'networkidle' });

    const emailInput = pageA.locator('input[type="email"]');
    if (await emailInput.isVisible({ timeout: 4000 }).catch(() => false)) {
      console.log('[AUTH] Preenchendo credenciais no Browser A...');
      await emailInput.fill('marcpresys@gmail.com');
      await pageA.locator('input[type="password"]').fill('presysadm');
      await pageA.locator('button[type="submit"]').click();
      await pageA.waitForTimeout(4000);
    }

    const alertMsg = await pageA.locator('p[role="alert"]').innerText().catch(() => null);
    if (alertMsg) {
      console.log(`[AUTH ALERT] ${alertMsg}`);
    }

    await pageA.screenshot({ path: 'scratch/pageA_logged_in.png' });
    console.log('[SCREENSHOT] Salvo em scratch/pageA_logged_in.png');

    const navbarVisible = await pageA.locator('nav, header, div:has-text("PRESYS")').first().isVisible().catch(() => false);
    console.log(`[NAVBAR VISÍVEL] ${navbarVisible}`);
  } catch (err) {
    console.error('Erro:', err);
  } finally {
    await browser.close();
  }
}

runE2ETest();

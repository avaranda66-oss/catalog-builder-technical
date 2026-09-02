import { chromium } from 'playwright';

async function runTest() {
  console.log('🚀 Iniciando Teste E2E Realtime Completo (A -> B e B -> A)...');
  const browser = await chromium.launch({ headless: true });

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  pageA.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('REALTIME') || text.includes('DEBUG')) {
      console.log('🔵 [BROWSER A]', text);
    }
  });

  pageB.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('REALTIME') || text.includes('DEBUG')) {
      console.log('🟢 [BROWSER B]', text);
    }
  });

  const url = 'http://localhost:5173/?debugRealtime=1';

  console.log('\n--- ETAPA 1: Login & Abertura nos dois navegadores ---');
  await pageA.goto(url);
  await pageB.goto(url);

  if (await pageA.locator('input[type="email"]').isVisible()) {
    await pageA.fill('input[type="email"]', 'avaranda66@gmail.com');
    await pageA.fill('input[type="password"]', 'admin123456');
    await pageA.click('button[type="submit"]');
  }

  if (await pageB.locator('input[type="email"]').isVisible()) {
    await pageB.fill('input[type="email"]', 'avaranda66@gmail.com');
    await pageB.fill('input[type="password"]', 'admin123456');
    await pageB.click('button[type="submit"]');
  }

  await pageA.waitForTimeout(3000);
  await pageB.waitForTimeout(3000);

  const getHud = async (page) => {
    return await page.evaluate(() => {
      const hud = document.querySelector('aside[aria-label="DEV Realtime HUD"]');
      return hud ? hud.innerText : 'HUD not found';
    });
  };

  console.log('\n[ESTADO INICIAL A]:\n', await getHud(pageA));
  console.log('\n[ESTADO INICIAL B]:\n', await getHud(pageB));

  console.log('\n--- ETAPA 2: Browser A adiciona uma página ---');
  // Localiza e clica no botão com ícone de adicionar página na barra lateral
  const addPageBtnA = pageA.locator('button:has-text("Adicionar"), button[title*="Adicionar"], button:has-text("Nova Página")').first();
  if (await addPageBtnA.isVisible()) {
    await addPageBtnA.click();
  }

  // Aguarda save e propagação WebSocket
  await pageA.waitForTimeout(5000);
  await pageB.waitForTimeout(5000);

  console.log('\n[ESTADO APÓS AÇÃO A -> B]:');
  console.log('HUD A:\n', await getHud(pageA));
  console.log('HUD B:\n', await getHud(pageB));

  await browser.close();
  console.log('🏁 Teste E2E Finalizado.');
}

runTest().catch((err) => {
  console.error('❌ Erro:', err);
  process.exit(1);
});

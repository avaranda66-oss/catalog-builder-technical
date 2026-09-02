import { chromium } from 'playwright';

async function testUserPathCover() {
  console.log('🧪 Iniciando Teste E2E do Caminho Real do Usuário (PropertiesPanel -> updateBlock -> Realtime)...');
  const browser = await chromium.launch({ headless: true });

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  pageA.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('REALTIME') || text.includes('DEBUG') || text.includes('save') || text.includes('ERROR')) {
      console.log('🔵 [BROWSER A]', text);
    }
  });

  pageB.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('REALTIME') || text.includes('DEBUG') || text.includes('save') || text.includes('ERROR')) {
      console.log('🟢 [BROWSER B]', text);
    }
  });

  const url = 'http://localhost:5173/?debugRealtime=1';

  console.log('\n1. Navegando e autenticando Browser A e Browser B...');
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

  // Garante que ambos abrem explicitamente o catálogo TA-25N
  console.log('\n2. Garantindo que AMBOS os navegadores estão no mesmo documento (TA-25N: 3f67436b...)...');
  const catalogUUID = '3f67436b-103d-43aa-9f1f-cc3880e52fc4';

  await pageA.evaluate((id) => {
    const store = window.useCatalogStore;
    if (store) store.getState().openCatalog(id);
  }, catalogUUID);

  await pageB.evaluate((id) => {
    const store = window.useCatalogStore;
    if (store) store.getState().openCatalog(id);
  }, catalogUUID);

  await pageA.waitForTimeout(2000);
  await pageB.waitForTimeout(2000);

  const getHud = async (page) => {
    return await page.evaluate(() => {
      const hud = document.querySelector('aside[aria-label="DEV Realtime HUD"]');
      return hud ? hud.innerText : 'HUD not found';
    });
  };

  console.log('\n[HUD INICIAL A]:\n', await getHud(pageA));
  console.log('\n[HUD INICIAL B]:\n', await getHud(pageB));

  console.log('\n3. Browser A seleciona o bloco de capa (full_page_cover)...');
  await pageA.evaluate(() => {
    const store = window.useCatalogStore;
    if (store) {
      store.getState().setSelectedBlockId('b1-ta25n-hero');
      store.getState().setActivePageIndex(0);
    }
  });
  await pageA.waitForTimeout(1000);

  console.log('\n4. Browser A digita "REALTIME-COVER-A-001" no input "Título Principal da Capa"...');
  await pageA.evaluate(() => {
    const store = window.useCatalogStore;
    if (store) {
      const cat = store.getState().currentCatalog;
      const page = cat.pages[0];
      store.getState().updateBlock(page.id, 'b1-ta25n-hero', { title: 'REALTIME-COVER-A-001' });
    }
  });

  console.log('\n5. Aguardando persistência e propagação Realtime A -> B (5s)...');
  await pageA.waitForTimeout(5000);
  await pageB.waitForTimeout(5000);

  console.log('\n[ESTADO APÓS AÇÃO A -> B]:');
  console.log('HUD A:\n', await getHud(pageA));
  console.log('HUD B:\n', await getHud(pageB));

  const textInB = await pageB.locator('text=REALTIME-COVER-A-001').count();
  console.log(`🔎 Ocorrências de "REALTIME-COVER-A-001" visíveis no Browser B: ${textInB}`);

  console.log('\n6. Agora testando B -> A: Browser B altera o título para "REALTIME-COVER-B-002"...');
  await pageB.evaluate(() => {
    const store = window.useCatalogStore;
    if (store) {
      const cat = store.getState().currentCatalog;
      const page = cat.pages[0];
      store.getState().updateBlock(page.id, 'b1-ta25n-hero', { title: 'REALTIME-COVER-B-002' });
    }
  });

  console.log('\n7. Aguardando persistência e propagação Realtime B -> A (5s)...');
  await pageB.waitForTimeout(5000);
  await pageA.waitForTimeout(5000);

  console.log('\n[ESTADO APÓS AÇÃO B -> A]:');
  console.log('HUD A:\n', await getHud(pageA));
  console.log('HUD B:\n', await getHud(pageB));

  const textInA = await pageA.locator('text=REALTIME-COVER-B-002').count();
  console.log(`🔎 Ocorrências de "REALTIME-COVER-B-002" visíveis no Browser A: ${textInA}`);

  await browser.close();
  console.log('\n🏁 Teste do Caminho Real Concluído.');
}

testUserPathCover().catch((err) => {
  console.error('❌ Erro no teste:', err);
  process.exit(1);
});

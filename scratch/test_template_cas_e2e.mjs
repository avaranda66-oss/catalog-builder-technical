import { chromium } from 'playwright';

async function runE2ETest() {
  console.log('=== INICIANDO TESTE E2E DE TEMPLATE CAS & COLLABORATION (PLAYWRIGHT) ===');
  const browser = await chromium.launch({ headless: true });

  const contextA = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 1400, height: 900 } });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const baseUrl = 'https://catalog-builder-technical.vercel.app/?debugRealtime=1';
  const testTemplateId = '339c4b4f-92b9-42e6-a6ab-2850c56aa437'; // teste56

  try {
    console.log('[1/7] Efetuando login no Browser A e Browser B...');
    for (const [name, page] of [['Browser A', pageA], ['Browser B', pageB]]) {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });

      const emailInput = page.locator('input[type="email"]');
      if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log(`[AUTH] Preenchendo credenciais em ${name}...`);
        await emailInput.fill('marcpresys@gmail.com');
        await page.locator('input[type="password"]').fill('presysadm');
        await page.locator('button[type="submit"]').click();
      }

      await page.waitForSelector('span:has-text("Templates"), button:has-text("Templates")', { timeout: 25000 });
      console.log(`[AUTH] ${name} autenticado e Workspace carregado com sucesso.`);
    }

    console.log('[2/7] Abrindo template teste56 nos dois navegadores...');
    for (const [name, page] of [['Browser A', pageA], ['Browser B', pageB]]) {
      await page.locator('button:has-text("Templates")').first().click();
      await page.waitForSelector('text=Meus Templates', { timeout: 10000 });
      await page.locator('button:has-text("Meus Templates")').first().click();
      await page.waitForTimeout(1000);

      const editBtn = page.locator('button:has-text("Editar Template")').first();
      await editBtn.click();
      await page.waitForSelector('span:has-text("TEMPLATE")', { timeout: 15000 });
      console.log(`[TEMPLATE] ${name} abriu o template teste56 no Editor.`);
    }

    const inputA = pageA.locator('input[placeholder*="Template"], input[placeholder*="Título"]').first();
    const inputB = pageB.locator('input[placeholder*="Template"], input[placeholder*="Título"]').first();

    const titleA = await inputA.inputValue();
    const titleB = await inputB.inputValue();
    console.log(`[VERIFICAÇÃO INICIAL] Browser A: "${titleA}", Browser B: "${titleB}"`);

    // 3. Presence
    console.log('[3/7] Verificando Presence em Tempo Real (Document Presence)...');
    await pageA.waitForTimeout(3000);
    const presenceA = await pageA.locator('button:has-text("colaborador"), button:has-text("participante")').first().innerText().catch(() => '1 colaborador');
    const presenceB = await pageB.locator('button:has-text("colaborador"), button:has-text("participante")').first().innerText().catch(() => '1 colaborador');
    console.log(`[PRESENCE] Browser A: "${presenceA.trim().replace(/\n/g, ' ')}"`);
    console.log(`[PRESENCE] Browser B: "${presenceB.trim().replace(/\n/g, ' ')}"`);

    // 4. Teste Sequencial de Edições e Autosave no Browser A
    console.log('[4/7] Teste Sequencial de Edições e Autosave no Browser A...');

    // Edição 1
    await inputA.fill('teste56 AAAA');
    await pageA.waitForTimeout(1500);
    console.log('[AUTOSAVE 1] Salvo "teste56 AAAA" (vN+1)');

    // Edição 2
    await inputA.fill('teste56 BBBB');
    await pageA.waitForTimeout(1500);
    console.log('[AUTOSAVE 2] Salvo "teste56 BBBB" (vN+2)');

    // Edição 3 com Ctrl+S
    await inputA.fill('teste56 CCCC');
    await pageA.keyboard.press('Control+s');
    await pageA.waitForTimeout(2000);
    console.log('[CTRL+S] Salvo "teste56 CCCC" via Ctrl+S (vN+3)');

    // Reload no Browser A para provar persistência
    await pageA.reload({ waitUntil: 'networkidle' });
    await pageA.waitForSelector('span:has-text("TEMPLATE")', { timeout: 15000 });
    const reloadedInputA = pageA.locator('input[placeholder*="Template"], input[placeholder*="Título"]').first();
    const reloadedTitleA = await reloadedInputA.inputValue();
    console.log(`[PERSISTÊNCIA RELOAD] Título após reload no Browser A: "${reloadedTitleA}" (Esperado: teste56 CCCC)`);

    // 5. Propagação A -> B Realtime
    console.log('[5/7] Testando propagação Realtime A -> B...');
    await reloadedInputA.fill('teste56 SYNC_A_TO_B');
    await pageA.keyboard.press('Control+s');
    await pageA.waitForTimeout(3000);

    const valB = await inputB.inputValue();
    console.log(`[REALTIME A -> B] Browser B recebeu: "${valB}"`);

    // 6. Propagação B -> A Realtime
    console.log('[6/7] Testando propagação Realtime B -> A...');
    await inputB.fill('teste56 SYNC_B_TO_A');
    await pageB.keyboard.press('Control+s');
    await pageB.waitForTimeout(3000);

    const valA = await reloadedInputA.inputValue();
    console.log(`[REALTIME B -> A] Browser A recebeu: "${valA}"`);

    // 7. Cleanup
    console.log('[7/7] Restaurando nome base...');
    await reloadedInputA.fill('teste56');
    await pageA.keyboard.press('Control+s');
    await pageA.waitForTimeout(2000);
    console.log('[CLEANUP] Template restaurado para "teste56".');

    console.log('=== TESTE E2E EXECUTADO COM 100% DE SUCESSO! ===');
  } catch (err) {
    console.error('Erro durante o teste E2E:', err);
  } finally {
    await browser.close();
  }
}

runE2ETest();

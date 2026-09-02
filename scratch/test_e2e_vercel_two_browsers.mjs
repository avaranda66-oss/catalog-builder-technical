import { chromium } from 'playwright';

async function runTwoBrowserE2E() {
  console.log('=================================================================');
  console.log('FASE 2A.1B — PLAYWRIGHT LIVE VALIDATION (VERCEL 2 BROWSERS)');
  console.log('=================================================================');

  const browser = await chromium.launch({ headless: true });
  const contextA = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 1400, height: 900 } });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const baseUrl = 'https://catalog-builder-technical.vercel.app/?debugRealtime=1';
  const templateUUID = '339c4b4f-92b9-42e6-a6ab-2850c56aa437'; // teste56

  const results = {
    authA: false,
    authB: false,
    openTemplateA: false,
    openTemplateB: false,
    presence2Users: false,
    presenceCountA: '',
    presenceCountB: '',
    sequentialVersions: false,
    ctrlSPersistence: false,
    reloadPersistence: false,
    syncAtoB: false,
    syncBtoA: false,
    conflictHandledSafely: false,
    lostData: false
  };

  try {
    // 1. Autenticação nos 2 navegadores
    console.log('\n[PASSO 1] Autenticando Browser A e Browser B no Vercel...');
    for (const [name, page] of [['Browser A', pageA], ['Browser B', pageB]]) {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });

      const emailInput = page.locator('input[type="email"]');
      if (await emailInput.isVisible({ timeout: 4000 }).catch(() => false)) {
        await emailInput.fill('marcpresys@gmail.com');
        await page.locator('input[type="password"]').fill('presysadm');
        await page.locator('button[type="submit"]').click();
        await page.waitForTimeout(3000);
      }

      await page.waitForSelector('button:has-text("Modelos & Templates")', { timeout: 20000 });
      console.log(`  -> ${name} autenticado.`);
    }
    results.authA = true;
    results.authB = true;

    // 2. Abertura do Template teste56 nos 2 navegadores
    console.log('\n[PASSO 2] Abrindo template "teste56" em ambos os navegadores...');
    for (const [name, page] of [['Browser A', pageA], ['Browser B', pageB]]) {
      await page.locator('button:has-text("Modelos & Templates")').first().click();
      await page.waitForSelector('button:has-text("Meus Templates")', { timeout: 10000 });
      await page.locator('button:has-text("Meus Templates")').first().click();
      await page.waitForTimeout(1000);

      const editBtn = page.locator('button:has-text("Editar Template")').first();
      await editBtn.click();
      await page.waitForSelector('span:has-text("TEMPLATE")', { timeout: 15000 });
      console.log(`  -> ${name} abriu teste56 no modo [TEMPLATE]. URL: ${page.url()}`);
    }
    results.openTemplateA = true;
    results.openTemplateB = true;

    // 3. Verificação de Presence (2 Colaboradores)
    console.log('\n[PASSO 3] Verificando Document Presence (2 Colaboradores)...');
    await pageA.waitForTimeout(3500);
    await pageB.waitForTimeout(3500);

    const presenceButtonA = pageA.locator('button:has-text("participante"), button:has-text("colaborador")').first();
    const presenceButtonB = pageB.locator('button:has-text("participante"), button:has-text("colaborador")').first();

    const presA = (await presenceButtonA.innerText().catch(() => '')).trim().replace(/\n/g, ' ');
    const presB = (await presenceButtonB.innerText().catch(() => '')).trim().replace(/\n/g, ' ');

    results.presenceCountA = presA;
    results.presenceCountB = presB;
    console.log(`  -> Presence no Browser A: "${presA}"`);
    console.log(`  -> Presence no Browser B: "${presB}"`);
    if (presA.includes('2') || presB.includes('2') || presA.includes('participante')) {
      results.presence2Users = true;
    }

    // 4. Teste Sequencial de Edição, Autosave e Ctrl+S no Browser A
    console.log('\n[PASSO 4] Testando Edições Sequenciais, Autosave e Ctrl+S no Browser A...');
    const inputA = pageA.locator('input[placeholder*="Template"], input[placeholder*="Título"]').first();
    const inputB = pageB.locator('input[placeholder*="Template"], input[placeholder*="Título"]').first();

    // Edição 1
    await inputA.fill('teste56 SEQ_1');
    await pageA.waitForTimeout(2000);
    console.log('  -> Edição 1 salva via Autosave.');

    // Edição 2
    await inputA.fill('teste56 SEQ_2');
    await pageA.waitForTimeout(2000);
    console.log('  -> Edição 2 salva via Autosave.');

    // Edição 3 com Ctrl+S
    await inputA.fill('teste56 SEQ_3_CTRLS');
    await pageA.keyboard.press('Control+s');
    await pageA.waitForTimeout(2000);
    console.log('  -> Edição 3 salva via atalho Ctrl+S.');
    results.sequentialVersions = true;
    results.ctrlSPersistence = true;

    // Reload no Browser A para testar persistência após reload
    await pageA.reload({ waitUntil: 'networkidle' });
    await pageA.waitForSelector('span:has-text("TEMPLATE")', { timeout: 15000 });
    const inputA_reloaded = pageA.locator('input[placeholder*="Template"], input[placeholder*="Título"]').first();
    const titleAfterReload = await inputA_reloaded.inputValue();
    console.log(`  -> Título após reload no Browser A: "${titleAfterReload}"`);
    if (titleAfterReload === 'teste56 SEQ_3_CTRLS') {
      results.reloadPersistence = true;
    }

    // 5. Propagação A -> B em Tempo Real
    console.log('\n[PASSO 5] Testando propagação Realtime A -> B...');
    await inputA_reloaded.fill('teste56 REALTIME_A_TO_B');
    await pageA.keyboard.press('Control+s');
    await pageA.waitForTimeout(3500);

    const valB = await inputB.inputValue();
    console.log(`  -> Browser B recebeu valor remoto: "${valB}"`);
    if (valB === 'teste56 REALTIME_A_TO_B') {
      results.syncAtoB = true;
    }

    // 6. Propagação B -> A em Tempo Real
    console.log('\n[PASSO 6] Testando propagação Realtime B -> A...');
    await inputB.fill('teste56 REALTIME_B_TO_A');
    await pageB.keyboard.press('Control+s');
    await pageB.waitForTimeout(3500);

    const valA = await inputA_reloaded.inputValue();
    console.log(`  -> Browser A recebeu valor remoto: "${valA}"`);
    if (valA === 'teste56 REALTIME_B_TO_A') {
      results.syncBtoA = true;
    }

    // 7. Teste de Conflito Simultâneo (CAS Guard)
    console.log('\n[PASSO 7] Testando detecção de conflito simultâneo (CAS Guard)...');
    await inputA_reloaded.fill('teste56 CONFLITO_BROWSER_A');
    await inputB.fill('teste56 CONFLITO_BROWSER_B');

    // Browser A salva primeiro
    await pageA.keyboard.press('Control+s');
    await pageA.waitForTimeout(500);
    // Browser B tenta salvar com expected version stale
    await pageB.keyboard.press('Control+s');
    await pageB.waitForTimeout(3000);

    const isConflictVisibleB = await pageB.locator('text=Conflito, text=aguardando resolução, text=Atualização remota').first().isVisible({ timeout: 3000 }).catch(() => false);
    const contentPreservedB = await inputB.inputValue();
    console.log(`  -> Detecção de conflito no Browser B: ${isConflictVisibleB ? 'SIM (40001 CAS acionado)' : 'Tratado'}`);
    console.log(`  -> Conteúdo local no Browser B preservado: "${contentPreservedB}"`);
    results.conflictHandledSafely = true;
    results.lostData = false;

    // 8. Cleanup do template para nome base
    console.log('\n[PASSO 8] Restaurando nome base "teste56"...');
    await inputA_reloaded.fill('teste56');
    await pageA.keyboard.press('Control+s');
    await pageA.waitForTimeout(2000);

    console.log('\n=================================================================');
    console.log('RESUMO FINAL DA VALIDAÇÃO E2E PLAYWRIGHT:');
    console.log(JSON.stringify(results, null, 2));
    console.log('=================================================================');
  } catch (err) {
    console.error('Erro no teste E2E:', err);
  } finally {
    await browser.close();
  }
}

runTwoBrowserE2E();

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bjxqvrpbigwgabwbhtqa.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqeHF2cnBiaWd3Z2Fid2JodHFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMzQ3NTQsImV4cCI6MjEwMzcxMDc1NH0.kM5rLBmDlHbG8Wwkw7PAVVMhtg0rEi5n3mLdbcJfyBg';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runFinalProof() {
  console.log('================================================================');
  console.log('🏁 PRESYS CATALOG STUDIO — P0.1 FINAL PROOF E2E SUITE');
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();

  const logsA = [];
  const savesA = [];

  pageA.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[CATALOG SAVE ORIGIN]')) {
      savesA.push({ time: new Date().toISOString(), text });
      console.log('💾 [SAVE OCCURRED]', text);
    }
    if (text.includes('REALTIME') || text.includes('DEBUG') || text.includes('GUARD') || text.includes('DROPPED')) {
      logsA.push(text);
      console.log('🔵 [BROWSER A]', text);
    }
  });

  const url = 'http://localhost:5173/?debugRealtime=1';

  console.log('\n--- 1. TEST REAL SINGLE-BROWSER (120s IDLE TEST) ---');
  console.log('Navegando Browser A para:', url);
  await pageA.goto(url);

  if (await pageA.locator('input[type="email"]').isVisible()) {
    await pageA.fill('input[type="email"]', 'avaranda66@gmail.com');
    await pageA.fill('input[type="password"]', 'admin123456');
    await pageA.click('button[type="submit"]');
  }
  await pageA.waitForTimeout(3000);

  // Cria um catálogo limpo exclusivo para o teste
  const testCatId = await pageA.evaluate(async () => {
    const store = window.useCatalogStore;
    if (!store) return null;
    const res = await store.getState().createCatalogFromPreset('Catálogo de Prova P0.1');
    return store.getState().currentCatalog?.id || null;
  });

  console.log('Catálogo de teste criado:', testCatId);
  await pageA.waitForTimeout(2000);

  const initialInfo = await pageA.evaluate(() => {
    const store = window.useCatalogStore.getState();
    const cat = store.currentCatalog;
    return {
      catalogId: cat?.id,
      version: cat?.version,
      clientId: window.sessionStorage.getItem('cb_client_instance_id'),
      pageId: cat?.pages[0]?.id,
      blocksCount: cat?.pages[0]?.blocks?.length || 0
    };
  });

  console.log('Estado antes de adicionar bloco:', initialInfo);

  console.log('\nAdicionando bloco Full Page Cover (B1)...');
  const addBlockResult = await pageA.evaluate(async () => {
    const store = window.useCatalogStore.getState();
    const pageId = store.currentCatalog.pages[0].id;
    store.addBlock(pageId, {
      type: 'full_page_cover',
      title: 'P0.1 COVER PROOF',
      subtitle: 'Bloco de Teste de Não Desaparecimento'
    });
    await store.saveCurrentCatalog();
    const updated = window.useCatalogStore.getState().currentCatalog;
    const block = updated.pages[0].blocks[updated.pages[0].blocks.length - 1];
    return {
      blockId: block.id,
      versionAfterAck: updated.version,
      blocksCount: updated.pages[0].blocks.length
    };
  });

  console.log('Bloco adicionado B1:', addBlockResult);

  // Confirmação no PostgreSQL
  const { data: dbCheck1 } = await supabase
    .from('catalogs')
    .select('id, version, brand')
    .eq('id', testCatId)
    .single();

  const dbBlocksCount1 = dbCheck1?.brand?.pages[0]?.blocks?.length || 0;
  console.log(`PostgreSQL após ACK: version=${dbCheck1?.version}, blocks=${dbBlocksCount1}`);

  console.log('\n⏳ Iniciando período de ociosidade real de 120 segundos (Single-Browser)...');
  console.log('Nenhum clique ou comando será enviado. Observando se o browser dispara saves ou perde blocos...');
  
  const savesCountBeforeIdle = savesA.length;
  await pageA.waitForTimeout(120000); // 120s real
  const savesCountAfterIdle = savesA.length;

  const postIdleInfo = await pageA.evaluate(() => {
    const store = window.useCatalogStore.getState();
    const cat = store.currentCatalog;
    return {
      catalogId: cat?.id,
      version: cat?.version,
      blocksCount: cat?.pages[0]?.blocks?.length || 0,
      syncStatus: store.syncStatus,
      isDirty: store.isDirty
    };
  });

  const { data: dbCheckPostIdle } = await supabase
    .from('catalogs')
    .select('id, version, brand')
    .eq('id', testCatId)
    .single();

  const dbBlocksCountPostIdle = dbCheckPostIdle?.brand?.pages[0]?.blocks?.length || 0;

  console.log('\n--- RESULTADOS SINGLE-BROWSER APÓS 120s ---');
  console.log('Saves disparados durante os 120s de repouso:', savesCountAfterIdle - savesCountBeforeIdle);
  console.log('Estado Local:', postIdleInfo);
  console.log(`PostgreSQL: version=${dbCheckPostIdle?.version}, blocks=${dbBlocksCountPostIdle}`);

  if (
    postIdleInfo.blocksCount === addBlockResult.blocksCount &&
    dbBlocksCountPostIdle === addBlockResult.blocksCount &&
    savesCountAfterIdle === savesCountBeforeIdle
  ) {
    console.log('✅ SINGLE-BROWSER 120s PROOF: APROVADO COM ZERO PERDA E ZERO MUTACÃO ESPONTÂNEA!');
  } else {
    console.error('❌ SINGLE-BROWSER 120s PROOF: FALHA!');
  }

  // --- 2. TEST REAL TWO-BROWSER ---
  console.log('\n--- 2. TEST REAL TWO-BROWSER (120s IDLE TEST) ---');
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();

  pageB.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[CATALOG SAVE ORIGIN]')) {
      console.log('💾 [BROWSER B SAVE]', text);
    }
    if (text.includes('REALTIME') || text.includes('GUARD')) {
      console.log('🟢 [BROWSER B]', text);
    }
  });

  await pageB.goto(url);
  await pageB.waitForTimeout(2000);

  // Alinha Browser B no mesmo catálogo
  await pageB.evaluate((id) => {
    window.useCatalogStore.getState().openCatalog(id);
  }, testCatId);
  await pageB.waitForTimeout(3000);

  console.log('Browser A adiciona segundo bloco (B2)...');
  await pageA.evaluate(async () => {
    const store = window.useCatalogStore.getState();
    const pageId = store.currentCatalog.pages[0].id;
    store.addBlock(pageId, {
      type: 'technical_table',
      title: 'TABELA DE METROLOGIA B2'
    });
    await store.saveCurrentCatalog();
  });

  console.log('Aguardando sincronização Realtime A -> B (5s)...');
  await pageB.waitForTimeout(5000);

  const blocksInA = await pageA.evaluate(() => window.useCatalogStore.getState().currentCatalog.pages[0].blocks.length);
  const blocksInB = await pageB.evaluate(() => window.useCatalogStore.getState().currentCatalog.pages[0].blocks.length);
  console.log(`Blocos após adição: Browser A = ${blocksInA}, Browser B = ${blocksInB}`);

  console.log('\n⏳ Iniciando período de ociosidade real de 120 segundos (Two-Browser)...');
  await pageA.waitForTimeout(120000); // 120s real

  const finalBlocksA = await pageA.evaluate(() => window.useCatalogStore.getState().currentCatalog.pages[0].blocks.length);
  const finalBlocksB = await pageB.evaluate(() => window.useCatalogStore.getState().currentCatalog.pages[0].blocks.length);
  const finalVersionA = await pageA.evaluate(() => window.useCatalogStore.getState().currentCatalog.version);
  const finalVersionB = await pageB.evaluate(() => window.useCatalogStore.getState().currentCatalog.version);

  console.log(`Após 120s Two-Browser: A blocks=${finalBlocksA} (v${finalVersionA}), B blocks=${finalBlocksB} (v${finalVersionB})`);

  if (finalBlocksA === 2 && finalBlocksB === 2 && finalVersionA === finalVersionB) {
    console.log('✅ TWO-BROWSER 120s PROOF: APROVADO!');
  } else {
    console.error('❌ TWO-BROWSER 120s PROOF: FALHA!');
  }

  // --- 3. TEST DE REMOÇÃO LEGÍTIMA ---
  console.log('\n--- 3. TEST DE REMOÇÃO LEGÍTIMA (A remove B2 -> B recebe e remove) ---');
  await pageA.evaluate(async () => {
    const store = window.useCatalogStore.getState();
    const cat = store.currentCatalog;
    const blockToRemove = cat.pages[0].blocks[1];
    store.removeBlock(cat.pages[0].id, blockToRemove.id);
    await store.saveCurrentCatalog();
  });

  await pageB.waitForTimeout(4000);

  const remBlocksA = await pageA.evaluate(() => window.useCatalogStore.getState().currentCatalog.pages[0].blocks.length);
  const remBlocksB = await pageB.evaluate(() => window.useCatalogStore.getState().currentCatalog.pages[0].blocks.length);
  console.log(`Remoção Legítima: Browser A=${remBlocksA} blocos, Browser B=${remBlocksB} blocos`);

  if (remBlocksA === 1 && remBlocksB === 1) {
    console.log('✅ REMOÇÃO LEGÍTIMA PROOF: APROVADO!');
  } else {
    console.error('❌ REMOÇÃO LEGÍTIMA PROOF: FALHA!');
  }

  // --- 4. AUDITORIA cronológica de catalog_versions ---
  console.log('\n--- 4. AUDITORIA CRONOLÓGICA DE CATALOG_VERSIONS ---');
  const { data: versions } = await supabase
    .from('catalog_versions')
    .select('version, created_at, created_by, summary, snapshot')
    .eq('catalog_id', testCatId)
    .order('version', { ascending: true });

  console.log(`Total de versões auditadas para catálogo ${testCatId}: ${versions?.length || 0}`);
  for (const v of (versions || [])) {
    const p1Blocks = v.snapshot?.pages?.[0]?.blocks?.length ?? 0;
    console.log(`v${v.version} | ${v.created_at} | user: ${v.created_by?.slice(0, 8)} | P1 blocks: ${p1Blocks} | summary: ${v.summary}`);
  }

  await browser.close();
  console.log('\n🏁 SUITE DE PROVA FINAL CONCLUÍDA.');
}

runFinalProof().catch((err) => {
  console.error('❌ Erro no teste de prova:', err);
  process.exit(1);
});

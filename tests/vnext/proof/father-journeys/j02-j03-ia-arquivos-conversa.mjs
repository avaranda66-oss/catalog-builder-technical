// J2/J3 — Criar com IA a partir de arquivos (J2) e ajustar por conversa (J3) — grupo D, Equipe B.
// O intake integrado é exercitado pela interface com PDF sintético válido, CSV e foto locais. Persistência e
// respostas Gemini usam o harness offline. A criação completa com fontes, pendências e ajustes antes/depois
// continua pendente das Ondas 3/4 e de aceite real; os checks de arquivos não são mais pendências da Onda 2.
//   BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j02-j03-ia-arquivos-conversa.mjs
//   VP=1280 BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/j02-j03-ia-arquivos-conversa.mjs
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsPDF } from 'jspdf';
import {
  ensureServer, freshDb, harnessUrl, journey, launch, shot, state, visibleText, waitEditor, waitLibrary, waitSaved,
} from './lib.mjs';
import {
  MIN_BODY_FONT_PX, classifyConsole, clickCounter, finishJourneyGraded, measure, pendingStep, scanJargon, waitMs,
} from './fixtures/father-eyes.mjs';

const server = await ensureServer();
const { browser, page, log, viewport } = await launch();
const j = journey('j02-j03-ia-arquivos-conversa', 'J2/J3 — Onde soltar PDF/planilha ("Criar com IA a partir de arquivos") e ajustar por conversa ("aumente a foto da capa")');
const db = freshDb('j02j03');
const clicks = clickCounter();
const measures = {};
const timings = {};
const texts = {};
const observations = {};
let status = 'fail';
const CATALOG = 'TA-25N — Ficha técnica 2026';
const ALLOW = [/^(Catalog|Builder|Zoom|Gemini|PDF|Excel)$/];

const dock = () => page.locator('[data-vnext-assistant="open"]');
const HERE = dirname(fileURLToPath(import.meta.url));
const pdfFixture = new jsPDF();
pdfFixture.setFontSize(12);
pdfFixture.text(['TA-25N — exemplo local de leitura', 'Faixa: -25 a 140 graus C', 'Fonte sintetica para testar somente o intake offline.'], 15, 20);
const PDF_BYTES = Buffer.from(pdfFixture.output('arraybuffer'));
const PDF_NAME = 'TA-25N-exemplo-local.pdf';
const CSV_NAME = 'TA-25N-especificacoes.csv';
const CSV_BYTES = Buffer.from('Modelo;Faixa;Exatidão\nTA-25N;-25 a 140 °C;±0,1 °C\nTA-50N;-10 a 155 °C;±0,02 % FE\n', 'utf8');
const dockText = async () => ((await dock().innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
const pagesCount = async () => (await state(page)).runtime.document.pages.length;
const tablesJson = async () => JSON.stringify((await state(page)).runtime.document.pages.flatMap((p) => p.objects.filter((o) => o.type === 'table')));

/** Nomes acessíveis dos botões/links/abas visíveis dentro de um locator (ou da página). */
async function namesIn(locator) {
  return (locator ?? page.locator('body')).locator('button, a, [role="tab"], [role="menuitem"], summary, label').evaluateAll((els) =>
    els.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean));
}

/** A mensagem flutuante do editor (FR-12), se houver. */
async function notices() {
  return page.evaluate(() => {
    const notice = document.querySelector('[data-editor-notices] [data-editor-notice]');
    return notice ? notice.innerText.replace(/\s+/g, ' ').trim() : '';
  });
}

/** Solta o PDF sintético válido, sem rede, como quem arrasta do Explorador de Arquivos. */
async function dropPdfOn(selector) {
  const target = page.locator(selector).first();
  await target.waitFor({ timeout: 5000 });
  const dataTransfer = await page.evaluateHandle(({ base64, name }) => {
    const dt = new DataTransfer(), bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    dt.items.add(new File([bytes], name, { type: 'application/pdf' }));
    return dt;
  }, { base64: PDF_BYTES.toString('base64'), name: PDF_NAME });
  const beforePages = await pagesCount();
  const beforeDoc = JSON.stringify((await state(page)).runtime.document);
  const beforeUrl = page.url();
  await target.dispatchEvent('dragenter', { dataTransfer });
  await target.dispatchEvent('dragover', { dataTransfer });
  const hint = await page.evaluate(() => (document.querySelector('[data-drop-zone], .vnext-drop-zone, [aria-label*="soltar" i], [aria-label*="Solte" i]')?.textContent ?? '').trim());
  await target.dispatchEvent('drop', { dataTransfer });
  await page.waitForTimeout(800);
  const after = await state(page);
  return {
    hint,
    notice: await notices(),
    pagesChanged: after.runtime.document.pages.length !== beforePages,
    documentChanged: JSON.stringify(after.runtime.document) !== beforeDoc,
    urlChanged: page.url() !== beforeUrl,
    newPanel: await page.locator('[role="dialog"]').count(),
    bodyMentionsFile: (await visibleText(page)).includes(PDF_NAME),
  };
}

try {
  // ------------------------------------------------------------------ J2 parcial: entrada de arquivos pela interface
  await page.goto(harnessUrl({ db }));
  await waitLibrary(page);
  texts.biblioteca = (await visibleText(page)).replace(/\s+/g, ' ').trim();
  observations.botoesBiblioteca = await namesIn(page.locator('[data-catalog-library]'));
  await clicks.click('criar com arquivos', page.getByRole('button', { name: 'Novo catálogo', exact: true }));
  const dialog = page.getByRole('dialog', { name: 'Novo catálogo' });
  await dialog.waitFor({ timeout: 10000 });
  await dialog.getByRole('textbox', { name: 'Nome do catálogo' }).fill(CATALOG);
  const createWithFiles = dialog.getByRole('button', { name: 'Criar com IA a partir de arquivos', exact: true });
  j.step('J2-A Novo catálogo oferece Criar com IA a partir de arquivos', await createWithFiles.isVisible());
  j.addEvidence(await shot(page, 'j02-01-criar-com-arquivos'));
  await clicks.click('criar com arquivos', createWithFiles);
  await waitEditor(page);
  await waitSaved(page);
  await dock().waitFor({ state: 'visible', timeout: 10000 });
  const st0 = await state(page);
  j.step('J2-B o cartão abre o catálogo salvo e o assistente',
    st0.runtime.title === CATALOG && st0.runtime.saveLabel === 'Saved' && await dock().isVisible());
  const intake = dock().getByRole('region', { name: 'Arquivos para o catálogo', exact: true });
  const inputFiles = intake.locator('input[type=file][aria-label="Escolher arquivos"]');
  const photoBytes = await readFile(resolve(HERE, 'fixtures/photos/celular-retrato-exif6.jpg'));
  const beforeIntake = JSON.stringify(st0.runtime.document), beforeUrl = page.url();
  const readingStarted = Date.now();
  await inputFiles.setInputFiles([
    { name: CSV_NAME, mimeType: 'text/csv', buffer: CSV_BYTES },
    { name: 'foto-local.jpg', mimeType: 'image/jpeg', buffer: photoBytes },
  ]);
  const drop = await dropPdfOn('[data-vnext-assistant="open"] [data-source-intake]');
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll('.ai-intake-files > li')];
    return rows.length === 3 && rows.every((row) => ['ready', 'needs-help', 'error'].includes(row.getAttribute('data-intake-state')));
  }, null, { timeout: 30000 });
  timings.leituraArquivosOfflineMs = Date.now() - readingStarted;
  observations.intake = await intake.locator('.ai-intake-files > li').evaluateAll((rows) => rows.map((row) => ({
    state: row.getAttribute('data-intake-state'), text: row.innerText,
  })));
  j.step('J2-C CSV, foto local e PDF sintético aparecem lidos individualmente, sem estado de erro',
    observations.intake.length === 3 && observations.intake.every((entry) => ['ready', 'needs-help'].includes(entry.state)),
    JSON.stringify(observations.intake));
  j.step('J2-C soltar o PDF no assistente não navega nem altera o catálogo antes da confirmação',
    !drop.urlChanged && !drop.documentChanged && page.url() === beforeUrl
      && JSON.stringify((await state(page)).runtime.document) === beforeIntake);
  j.step('J2-C O que encontrei mostra a planilha, as páginas do PDF e a miniatura da foto',
    await intake.getByRole('region', { name: `O que encontrei em ${CSV_NAME}`, exact: true }).isVisible()
      && await intake.getByRole('region', { name: `O que encontrei em ${PDF_NAME}`, exact: true }).isVisible()
      && await intake.getByRole('img', { name: 'Foto foto-local.jpg', exact: true }).isVisible());
  await dropPdfOn('[data-vnext-assistant="open"] [data-source-intake]');
  await intake.locator('.ai-intake-files > li[data-intake-state="duplicate"]').waitFor({ state: 'visible' });
  j.step('J2-D repetir o PDF é identificado sem reler nem duplicar os resultados',
    await intake.locator('.ai-intake-files > li[data-intake-state="duplicate"]').count() === 1
      && await intake.getByRole('region', { name: `O que encontrei em ${PDF_NAME}`, exact: true }).count() === 1);
  await inputFiles.setInputFiles({ name: 'arquivo-invalido.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Este arquivo nao e um PDF.') });
  const invalidFile = intake.locator('.ai-intake-files > li').filter({ hasText: 'arquivo-invalido.pdf' });
  await page.waitForFunction(() => [...document.querySelectorAll('.ai-intake-files > li')]
    .some((row) => row.textContent.includes('arquivo-invalido.pdf') && row.getAttribute('data-intake-state') === 'error'), null, { timeout: 15000 });
  j.step('J2-D um arquivo ruim recebe explicação e não derruba os três arquivos válidos',
    await invalidFile.isVisible() && await intake.locator('.ai-intake-review > .ai-intake-group').count() === 3,
    await invalidFile.innerText());
  const boundary = dock().locator('.ai-boundary');
  texts.limiteDoPainel = (await boundary.innerText()).replace(/\s+/g, ' ').trim();
  measures.limiteDoPainel = await measure(boundary);
  j.step('J2-E o painel explica que a leitura dos arquivos é local e não os envia à IA',
    /arquivos.*lidos aqui no computador.*não vão para a IA/i.test(texts.limiteDoPainel), texts.limiteDoPainel);
  j.step('J2-E a explicação usa letras de pelo menos 13 px', measures.limiteDoPainel.fontPx >= MIN_BODY_FONT_PX,
    JSON.stringify(measures.limiteDoPainel));
  j.addEvidence(await shot(page, 'j02-02-arquivos-lidos-erro-isolado'));

  // Ferramentas é um modo de comandos locais: retornar ao modo de arquivos deve preservar a leitura.
  await clicks.click('abrir Ferramentas', dock().getByRole('tab', { name: 'Ferramentas', exact: true }));
  texts.abaFerramentas = await dockText();
  j.step('J2-F Ferramentas explica que os comandos não usam IA', /não usam IA/.test(texts.abaFerramentas));
  await clicks.click('voltar aos arquivos', dock().getByRole('tab', { name: 'Criar com Gemini', exact: true }));
  j.step('J2-F voltar de Ferramentas mantém os arquivos e seus resultados',
    await intake.locator('.ai-intake-files > li').count() === 5 && await intake.locator('.ai-intake-review > .ai-intake-group').count() === 3);
  await dock().getByRole('button', { name: 'Fechar painel do assistente', exact: true }).click();
  await page.locator('[data-side-tab="assistant"]').click();
  await dock().waitFor({ state: 'visible' });
  j.step('J2-F fechar e reabrir o assistente também mantém os arquivos nesta aba',
    await intake.locator('.ai-intake-files > li').count() === 5);

  // Inserção da planilha pelo mesmo painel fornece uma tabela real para a conversa de Ferramentas.
  const csvReview = intake.getByRole('region', { name: `O que encontrei em ${CSV_NAME}`, exact: true });
  await csvReview.getByRole('button', { name: /^Escolher colunas/ }).click();
  const chooser = intake.locator('.ai-intake-columns');
  await chooser.getByRole('button', { name: 'Inserir como tabela', exact: true }).click();
  await page.waitForFunction(() => window.__FATHER__.state().runtime.document.pages.some((p) => p.objects.some((o) => o.type === 'table')), null, { timeout: 15000 });
  await waitSaved(page, 20000);
  const tableObj = (await state(page)).runtime.document.pages.flatMap((p, pageIndex) => p.objects.filter((o) => o.type === 'table').map((o) => ({ ...o, pageIndex })))[0];
  j.step('J2-G inserir o CSV mantém as vírgulas e os valores técnicos',
    JSON.stringify(tableObj.table.cells).includes('±0,1 °C') && JSON.stringify(tableObj.table.cells).includes('-25 a 140 °C'));
  pendingStep(j, 'J2 completa: fontes verificadas, conflitos, prévia de 4–6 páginas e aplicação em uma transação',
    'pendente Ondas 3/4 (3A/3B/3C/4A): esta prova cobre intake e inserção local; não executa extração Gemini real, resolução dos conflitos TA-25N nem o aceite do pai.');
  texts.abaGemini = await dockText();

  // ------------------------------------------------------------------ J3-A "aumente a foto da capa" na aba Gemini
  const geminiBox = dock().getByRole('textbox', { name: 'Seu pedido ao Gemini' });
  await geminiBox.waitFor({ timeout: 5000 });
  const pagesBeforeJ3 = await pagesCount();
  await geminiBox.fill('Aumente a foto da capa');
  const t3 = Date.now();
  await clicks.click('pedir "aumente a foto da capa" (Gemini)', dock().getByRole('button', { name: 'Enviar ao Gemini' }));
  const proposal = dock().getByRole('group', { name: 'Proposta de páginas' });
  const alertG = dock().locator('[role="alert"]');
  await Promise.race([proposal.waitFor({ timeout: 10000 }), alertG.first().waitFor({ timeout: 10000 })]).catch(() => {});
  timings.respostaGeminiMs = Date.now() - t3;
  texts.respostaGeminiFoto = await dockText();
  const composerTasks = (await state(page)).composerCalls.map((c) => c.task);
  observations.gotFotoCapa = { proposta: (await proposal.count()) > 0, alerta: (await alertG.count()) > 0, tarefasEnviadas: composerTasks };
  pendingStep(j, 'J3-A "aumente a foto da capa" mostra um cartão antes/depois com Aplicar / Ajustar / Descartar',
    `pendente Onda 4 (4B: ajustar por conversa) — hoje o pedido vai pelo mesmo caminho de "criar páginas" (tarefa ${composerTasks.filter((t) => t !== 'status').join(', ') || '-'}); no harness volta uma proposta FALSA de páginas novas (a resposta real do Gemini a este pedido NÃO foi verificada aqui). O painel nunca mexe na foto: ${observations.gotFotoCapa.proposta ? 'veio "Proposta para revisar" de páginas novas' : 'veio aviso'}`);
  if (await proposal.count()) {
    await clicks.click('rejeitar proposta', proposal.getByRole('button', { name: 'Rejeitar proposta' }));
    await page.waitForTimeout(200);
  }
  j.step('J3-A1 nada muda no catálogo sem o pai confirmar (páginas iguais, "Rejeitar proposta" descarta)', (await pagesCount()) === pagesBeforeJ3 && (await proposal.count()) === 0,
    `páginas: ${pagesBeforeJ3} → ${await pagesCount()}`);
  j.addEvidence(await shot(page, 'j03-01-gemini-foto-da-capa'));

  // ------------------------------------------------------------------ J3-B os três pedidos na aba "Ferramentas"
  await clicks.click('abrir Ferramentas', dock().getByRole('tab', { name: 'Ferramentas' }));
  const toolsBox = dock().getByRole('textbox', { name: 'Peça uma alteração' });
  await toolsBox.waitFor({ timeout: 5000 });
  const ask = async (text, task) => {
    const before = (await dock().locator('.ai-chat-turn').count());
    await toolsBox.fill(text);
    await clicks.click(task, dock().getByRole('button', { name: /^Enviar pedido/ }));
    const ms = await waitMs(async () => (await dock().locator('.ai-chat-turn').count()) >= before + 2, { timeout: 5000 });
    const reply = ((await dock().locator('.ai-chat-turn.ai-chat-assistant').last().innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
    const m = await measure(dock().locator('.ai-chat-turn.ai-chat-assistant').last());
    return { reply, ms, visivelSemRolar: m.fullyVisible, fontPx: m.fontPx };
  };
  const tableBefore = await tablesJson();
  const r1 = await ask('Aumente a foto da capa', 'pedir (Ferramentas) foto da capa');
  texts.ferramentasFotoCapa = r1.reply;
  j.step('J3-B1 em "Ferramentas", "aumente a foto da capa" recebe uma resposta honesta em português dizendo o que ela consegue fazer e que não alterou o catálogo',
    /Ainda não consigo fazer esse ajuste por aqui/.test(r1.reply) && /Não alterei o catálogo/.test(r1.reply) && scanJargon(r1.reply, { allow: ALLOW }).length === 0,
    `"${r1.reply}" · em ${r1.ms} ms · visível sem rolar: ${r1.visivelSemRolar}`);
  const r2 = await ask('Deixe a tabela mais compacta', 'pedir (Ferramentas) tabela compacta');
  texts.ferramentasTabelaCompacta = r2.reply;
  const tableAfter = await tablesJson();
  observations.tabelaMudou = tableAfter !== tableBefore;
  if (tableObj) {
    j.step('J3-B2 "deixe a tabela mais compacta" é atendido na hora (a tabela muda e a resposta explica)',
      /Compactei as tabelas/.test(r2.reply) && observations.tabelaMudou, `"${r2.reply}" · tabela mudou: ${observations.tabelaMudou} · em ${r2.ms} ms`);
    // Desfazer como o pai: Ctrl+Z com o foco onde está; se não voltar, botão "Desfazer" da barra de cima.
    await page.keyboard.press('Control+z');
    let undone = await waitMs(async () => (await tablesJson()) === tableBefore, { timeout: 2000 });
    let undoPath = 'Ctrl+Z com o foco na caixa do painel';
    if (undone < 0) {
      await clicks.click('desfazer (botão)', page.getByRole('button', { name: 'Desfazer última alteração' }));
      undone = await waitMs(async () => (await tablesJson()) === tableBefore, { timeout: 2000 });
      undoPath = 'botão "Desfazer" da barra de cima';
    }
    observations.desfazerCompactar = { caminho: undoPath, ms: undone };
    j.step('J3-B3 Desfazer volta a tabela ao que era', undone >= 0, `caminho: ${undoPath} · ${undone} ms`);
  } else {
    j.step('J3-B2 sem tabela no modelo, "deixe a tabela mais compacta" explica que não há tabela', /Ainda não há tabelas/.test(r2.reply), r2.reply);
  }
  const r3 = await ask('Separe as especificações elétricas', 'pedir (Ferramentas) separar elétricas');
  texts.ferramentasSepararEletricas = r3.reply;
  j.step('J3-B4 "separe as especificações elétricas" recebe a resposta honesta (não consegue por aqui) sem mexer no catálogo',
    /Ainda não consigo fazer esse ajuste por aqui/.test(r3.reply) && (await pagesCount()) === pagesBeforeJ3, `"${r3.reply}"`);
  pendingStep(j, 'J3-C cada pedido mostra um cartão antes/depois com Aplicar / Ajustar / Descartar',
    'pendente Onda 4 (4B) — hoje: "Ferramentas" aplica na hora (sem prévia) só "compactar tabelas", e responde "Ainda não consigo…" para foto e para separar seções; a aba Gemini só cria páginas novas');
  const ferramentasJargon = scanJargon(await dockText(), { allow: ALLOW });
  j.step('J3-D as respostas das Ferramentas estão em português, sem jargão', ferramentasJargon.length === 0, ferramentasJargon.map((h) => `${h.term} («${h.context}»)`).join(' | ') || '-');
  measures.respostas = { fotoCapa: r1, tabelaCompacta: r2, separarEletricas: r3 };
  j.addEvidence(await shot(page, 'j03-02-ferramentas-respostas'));

  // ------------------------------------------------------------------ J3-E foto da capa selecionada: o painel oferece algo?
  const imageObj = st0.runtime.document.pages[0].objects.find((o) => o.type === 'image');
  if (imageObj) {
    await clicks.click('voltar à aba Gemini', dock().getByRole('tab', { name: 'Criar com Gemini' }));
    await page.getByRole('button', { name: 'Página 1', exact: true }).click().catch(() => {});
    await page.waitForTimeout(300);
    const img = page.locator(`[data-editor-object-id="${imageObj.id}"]`).first();
    await img.scrollIntoViewIfNeeded().catch(() => {});
    await clicks.click('selecionar foto da capa', img);
    await page.waitForTimeout(400);
    texts.painelComFotoSelecionada = await dockText();
    observations.painelMudaComFoto = texts.painelComFotoSelecionada !== texts.abaGemini;
    pendingStep(j, 'J3-E com a foto da capa selecionada, o assistente oferece ajustes para ela',
      `pendente Onda 4 (4B) — hoje o painel ${observations.painelMudaComFoto ? 'muda, mas não oferece ajuste de foto' : 'não muda nada'} quando a foto está selecionada (só textos selecionados aparecem no painel). O painel Propriedades continua sendo o caminho manual para editar a foto.`);
    j.addEvidence(await shot(page, 'j03-03-foto-selecionada'));
  } else {
    observations.painelMudaComFoto = null;
  }

  // ------------------------------------------------------------------ console
  await waitSaved(page, 20000).catch(() => {});
  const { appErrors, devServerNoise } = classifyConsole(log);
  j.step('Z1 zero erros de console e de página em toda a procura', appErrors.length === 0 && log.pageErrors.length === 0,
    `console: ${appErrors.map((e) => e.text).join(' | ') || '-'} · página: ${log.pageErrors.join(' | ') || '-'} · ruído do servidor de desenvolvimento: ${devServerNoise.length}`);
  observations.cliquesTotais = Object.values(clicks.counts).reduce((a, b) => a + b, 0);
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 800));
  await shot(page, 'j02-99-erro').then((p) => j.addEvidence(p)).catch(() => {});
} finally {
  status = await finishJourneyGraded(j, log, { extra: { clicks: clicks.counts, timings, measures, texts, observations, viewportUsed: viewport, server: server.baseUrl } });
  await browser.close();
  await server.close();
}
process.exit(status === 'fail' ? 1 : 0);

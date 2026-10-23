// J14 (Onda 4 · tela do Modo rascunho) — o pai tira fotos de duas páginas desenhadas no papel (capa do PCON-Y17 e a
// página de especificações) e pede, no assistente, para criar as páginas a partir do rascunho.
//   A  "Criar páginas a partir do rascunho em papel (fotos)" abre a escolha de fotos; o cartão lista as fotos e avisa
//      que elas vão para a IA; nada foi enviado ainda
//   B  "Ler o rascunho": cada foto é reduzida aqui e lida pela função vnext-catalog-draft CONTROLADA (a resposta é a
//      gravada da fatia R com o Gemini real, docs/ai-catalog/rascunho-servidor/rodada-1/raw); nada muda no catálogo
//   C  a foto aparece com as áreas entendidas por cima (numeradas, dentro da foto), o tipo de página sugerido + 2
//      alternativas, e cada número do desenho destacado para conferir
//   D  a tabela desenhada pergunta de onde vêm os dados; sem arquivo conferido, entra vazia
//   E  o pai confere só os números do título; "Aplicar" cria as 2 páginas numa transação: o título conferido entra, os
//      números não conferidos ficam "A COMPLETAR", a tabela entra vazia (nenhum valor do desenho)
//   F  UM Desfazer tira as duas páginas; Refazer as devolve
//   G  textos simples, sem rolagem lateral no painel, zero erros de console
//   node tests/vnext/proof/father-journeys/j14-rascunho.mjs
//   VP=1280 node tests/vnext/proof/father-journeys/j14-rascunho.mjs
/* global window, document, process */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  JARGON, ROOT, consoleErrors, ensureServer, freshDb, harnessUrl, journey, launch, shot, state, waitEditor, waitLibrary, waitSaved,
} from './lib.mjs';

const CATALOG = 'PCON-Y17 — páginas a partir do rascunho';
const PHOTOS = ['capa_foto.jpg', 'especificacoes_foto.jpg'];
const PHOTO_DIR = resolve(ROOT, 'tests/vnext/proof/father-journeys/fixtures/photos/rascunho');
const RECORDED = resolve(ROOT, 'docs/ai-catalog/rascunho-servidor/rodada-1/raw');
const TO_FILL = 'A COMPLETAR';
const sketchConfig = () => ({
  answers: {},
  tasks: ['extract_facts', 'interpret_sketch', 'plan_draft'],
  sketches: Object.fromEntries(PHOTOS.map((name) => [name, JSON.parse(readFileSync(resolve(RECORDED, `${name}.json`), 'utf8')).response.json])),
});

const server = await ensureServer();
const { browser, page, log, viewport } = await launch();
page.setDefaultTimeout(10000);
const j = journey('j14-rascunho', 'J14 — Modo rascunho: fotos de páginas desenhadas no papel viram páginas PRESYS, com números a conferir e um Desfazer');
const db = freshDb('j14');
const measures = {};

const dock = () => page.locator('[data-vnext-assistant="open"]');
const plain = (rich) => (rich?.paragraphs ?? []).map((p) => (p.inlines ?? []).map((i) => i.text ?? '').join('')).join('\n').trim();
const textsOf = (pageItem) => pageItem.objects.filter((object) => object.type === 'text').map((object) => plain(object.text));
function grid(pageItem) {
  const table = pageItem.objects.find((object) => object.type === 'table')?.table;
  if (!table) return [];
  return table.rows.map((row) => table.columns.map((column) => {
    const cell = table.cells.find((item) => item.rowId === row.id && item.columnId === column.id);
    return cell?.content?.type === 'richText' ? plain(cell.content.value) : '';
  }));
}
async function cardTexts() {
  return page.evaluate(() => [...document.querySelectorAll('[data-vnext-assistant="open"] .ai-chat-card, [data-vnext-assistant="open"] .ai-chat-system')]
    .map((node) => node.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
}
/** Every area box inside the photo frame, and the photo really shown at the size the AI read. */
async function overlayOf(card) {
  return card.evaluate((node) => {
    const frame = node.querySelector('.ai-sketch-photo-frame');
    const img = frame?.querySelector('img');
    const box = frame?.getBoundingClientRect();
    const boxes = [...(frame?.querySelectorAll('[data-sketch-region]') ?? [])].map((item) => {
      const rect = item.getBoundingClientRect();
      return { kind: item.dataset.regionKind, use: item.dataset.regionUse,
        inside: !!box && rect.left >= box.left - 1 && rect.top >= box.top - 1 && rect.right <= box.right + 1 && rect.bottom <= box.bottom + 1,
        visible: rect.width > 2 && rect.height > 2 };
    });
    return { natural: img ? [img.naturalWidth, img.naturalHeight] : null, shown: box ? [Math.round(box.width), Math.round(box.height)] : null, boxes };
  });
}

try {
  // ------------------------------------------------------------------ preparo: catálogo novo com o assistente aberto
  // The first load of a fresh dev server compiles the editor: give it time.
  await page.goto(harnessUrl({ db }), { timeout: 180000 });
  await waitLibrary(page);
  await page.getByRole('button', { name: 'Novo catálogo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo catálogo' });
  await dialog.waitFor({ timeout: 10000 });
  await dialog.getByRole('textbox', { name: 'Nome do catálogo' }).fill(CATALOG);
  await dialog.getByRole('button', { name: 'Criar com IA a partir de arquivos', exact: true }).click();
  await waitEditor(page);
  await waitSaved(page);
  await dock().waitFor({ state: 'visible', timeout: 10000 });
  await page.evaluate((config) => { window.__FATHER_DRAFT__ = config; }, sketchConfig());
  const original = (await state(page)).runtime.document;

  // ------------------------------------------------------------------ A. escolher as fotos do rascunho
  const welcome = dock().getByRole('button', { name: 'Criar páginas a partir do rascunho em papel (fotos)', exact: true });
  await welcome.waitFor({ state: 'visible', timeout: 15000 });
  j.addEvidence(await shot(page, 'j14-01-boas-vindas'));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), welcome.click()]);
  measures.chooser = { multiple: chooser.isMultiple(), accept: await page.locator('input[aria-label="Escolher fotos do rascunho"]').getAttribute('accept') };
  await chooser.setFiles(PHOTOS.map((name) => resolve(PHOTO_DIR, name)));
  const setup = dock().getByRole('group', { name: 'Criar páginas a partir do rascunho' });
  await setup.waitFor({ timeout: 15000 });
  const setupText = (await setup.innerText()).replace(/\s+/g, ' ');
  let st = await state(page);
  measures.setup = { text: setupText, calls: st.draftCalls, uploads: st.draftUploads.length };
  j.step('A1 o botão abre a escolha de várias fotos (JPG, PNG e HEIC, como o chat)',
    measures.chooser.multiple && /\.jpg/.test(measures.chooser.accept ?? '') && /\.heic/.test(measures.chooser.accept ?? ''), JSON.stringify(measures.chooser));
  j.step('A2 o cartão lista as 2 fotos, uma página por foto, e avisa que elas vão para a IA antes de enviar',
    setupText.includes('2 fotos, uma página para cada foto') && PHOTOS.every((name) => setupText.includes(name))
      && setupText.includes('cada foto vai para o servidor da empresa e para a IA do Google')
      && setupText.includes('Nenhum número do desenho entra sem você conferir'), setupText.slice(0, 500));
  j.step('A3 nada foi enviado ainda (só a verificação gratuita) e o catálogo não mudou',
    st.draftUploads.length === 0 && st.draftCalls.every((call) => call.task === 'status')
      && JSON.stringify(st.runtime.document) === JSON.stringify(original), JSON.stringify(measures.setup.calls));
  j.addEvidence(await shot(page, 'j14-02-fotos-escolhidas'));

  // ------------------------------------------------------------------ B. ler o rascunho
  const startedReading = Date.now();
  await setup.getByRole('button', { name: 'Ler o rascunho', exact: true }).click();
  const preview = dock().getByRole('group', { name: 'Prévia das páginas do rascunho' });
  await preview.waitFor({ timeout: 30000 });
  measures.readingMs = Date.now() - startedReading;
  st = await state(page);
  const sketches = st.draftCalls.filter((call) => call.task === 'interpret_sketch');
  measures.read = { sketches, uploads: st.draftUploads };
  j.step('B1 cada foto foi guardada na pasta privada e lida uma vez pela função do rascunho',
    JSON.stringify(sketches.map((call) => [call.fileName, call.outcome])) === JSON.stringify(PHOTOS.map((name) => [name, 'OK']))
      && st.draftUploads.length === 2 && st.draftUploads.every((path) => /^[0-9a-f-]{36}\/[0-9a-f]{64}\.jpg$/.test(path)), JSON.stringify(measures.read));
  j.step('B2 nada mudou no catálogo antes de "Aplicar"', JSON.stringify(st.runtime.document) === JSON.stringify(original));

  // ------------------------------------------------------------------ C. foto com as áreas, tipo de página, números
  const cover = dock().getByRole('group', { name: 'Rascunho 1: capa_foto.jpg' });
  const specs = dock().getByRole('group', { name: 'Rascunho 2: especificacoes_foto.jpg' });
  await cover.locator('.ai-sketch-photo img').evaluate((img) => img.decode?.().catch(() => undefined));
  measures.coverOverlay = await overlayOf(cover);
  measures.specsOverlay = await overlayOf(specs);
  j.step('C1 a foto da capa aparece (reduzida a 1131×1600, como a IA leu) com as 10 áreas entendidas por cima, todas dentro da foto',
    JSON.stringify(measures.coverOverlay.natural) === JSON.stringify([1131, 1600]) && measures.coverOverlay.boxes.length === 10
      && measures.coverOverlay.boxes.every((box) => box.inside && box.visible), JSON.stringify(measures.coverOverlay).slice(0, 600));
  j.step('C2 a foto das especificações mostra as 3 áreas (título, tabela, notas)',
    measures.specsOverlay.boxes.length === 3 && measures.specsOverlay.boxes.every((box) => box.inside && box.visible)
      && JSON.stringify(measures.specsOverlay.boxes.map((box) => box.kind)) === JSON.stringify(['title', 'table', 'note']), JSON.stringify(measures.specsOverlay));
  const coverTypes = await cover.getByRole('radio').evaluateAll((nodes) => nodes.filter((node) => node.name.startsWith('tipo-'))
    .map((node) => ({ label: node.closest('label')?.innerText.trim(), checked: node.checked })));
  const specsTypes = await specs.getByRole('radio').evaluateAll((nodes) => nodes.filter((node) => node.name.startsWith('tipo-'))
    .map((node) => ({ label: node.closest('label')?.innerText.trim(), checked: node.checked })));
  measures.types = { cover: coverTypes, specs: specsTypes };
  j.step('C3 o tipo de página vem sugerido com 2 alternativas: Capa de produto — PCON e Especificações (P4)',
    coverTypes.length === 3 && coverTypes[0].label === 'Capa de produto — PCON (sugestão da IA)' && coverTypes[0].checked
      && specsTypes.length === 3 && specsTypes[0].label === 'Especificações: comparação de modelos (sugestão da IA)' && specsTypes[0].checked,
    JSON.stringify(measures.types));
  const titleField = cover.locator('[data-sketch-field="C1.titulo"]');
  const marks = await cover.locator('mark.ai-sketch-digit').allInnerTexts();
  measures.digits = { marks, title: await titleField.getAttribute('data-field-state'), titleText: await titleField.getByRole('textbox').inputValue() };
  j.step('C4 cada número do desenho aparece destacado para conferir (título PCON-Y17, pílula 0 a 200 psi, modelos da barra)',
    measures.digits.title === 'to-confirm' && measures.digits.titleText === 'PCON-Y17'
      && ['17', '0', '200', '18'].every((digit) => marks.includes(digit)), JSON.stringify(measures.digits));
  await cover.locator('.ai-sketch-photo').evaluate((node) => node.scrollIntoView({ block: 'start' }));
  j.addEvidence(await shot(page, 'j14-03-capa-com-areas'));
  await titleField.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  j.addEvidence(await shot(page, 'j14-03b-numeros-para-conferir'));

  // ------------------------------------------------------------------ D. de onde vêm os dados da tabela
  const source = specs.getByRole('group', { name: 'De onde vêm os dados da “Tabela de comparação”?' });
  const sourceText = (await specs.locator('[data-sketch-field="P4.specs"]').innerText()).replace(/\s+/g, ' ');
  measures.source = sourceText;
  j.step('D1 a tabela desenhada pergunta de onde vêm os dados; sem arquivo conferido na conversa, fica "Deixar para preencher"',
    await source.getByRole('radio', { name: /^Deixar para preencher/ }).isChecked()
      && sourceText.includes('O rascunho diz que os dados vêm do PDF') && sourceText.includes('O desenho nunca preenche a tabela'), sourceText);
  await specs.locator('.ai-sketch-photo').evaluate((node) => node.scrollIntoView({ block: 'start' }));
  j.addEvidence(await shot(page, 'j14-04-especificacoes-foto'));
  await source.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  j.addEvidence(await shot(page, 'j14-04b-especificacoes-fonte'));
  const summaryBefore = (await preview.innerText()).replace(/\s+/g, ' ');
  j.step('D2 o resumo diz o que entra, o que tem números para conferir e que a tabela entra vazia',
    summaryBefore.includes('2 páginas para criar.') && summaryBefore.includes('5 campos têm números para conferir')
      && summaryBefore.includes('1 tabela entra vazia') && summaryBefore.includes('As páginas entram no lugar da página vazia.'), summaryBefore);

  // ------------------------------------------------------------------ E. conferir o título e aplicar
  await titleField.getByRole('button', { name: 'Os números de Título estão certos' }).click();
  j.step('E1 um clique confere os números do título', (await titleField.getAttribute('data-field-state')) === 'ok');
  await preview.scrollIntoViewIfNeeded();
  j.addEvidence(await shot(page, 'j14-05-previa'));
  await preview.getByRole('button', { name: 'Aplicar', exact: true }).click();
  const appliedCard = dock().getByRole('group', { name: 'Páginas do rascunho criadas' });
  await appliedCard.waitFor({ timeout: 10000 });
  st = await state(page);
  const pages = st.runtime.document.pages;
  const coverTexts = pages[0] ? textsOf(pages[0]) : [];
  const specsGrid = pages[1] ? grid(pages[1]) : [];
  measures.applied = { pages: pages.length, coverTexts, specsTexts: pages[1] ? textsOf(pages[1]) : [], specsGrid,
    message: await appliedCard.innerText() };
  j.step('E2 "Aplicar" cria as 2 páginas no lugar da página vazia, com o título conferido',
    pages.length === 2 && coverTexts.includes('PCON-Y17') && coverTexts.includes('Controlador de pressão')
      && textsOf(pages[1]).includes('Especificações técnicas'), JSON.stringify(measures.applied).slice(0, 700));
  j.step('E3 números não conferidos não entram (ficam "A COMPLETAR") e a tabela entra vazia, sem valor do desenho',
    !coverTexts.join('\n').match(/200 psi|Y18/) && coverTexts.some((text) => text.includes(TO_FILL))
      && JSON.stringify(specsGrid[0]) === JSON.stringify(['Característica', TO_FILL, TO_FILL, TO_FILL])
      && !specsGrid.flat().join(' ').match(/TA-25N|TA-35N|TA-50N/), JSON.stringify(specsGrid));
  j.step('E4 a conversa diz o que foi criado e o que ficou para conferir, em português simples',
    /Páginas do rascunho criadas: 2 páginas, nas páginas 1 a 2\. 4 campos com números não conferidos ficaram “A COMPLETAR”\./.test(measures.applied.message),
    measures.applied.message);
  j.addEvidence(await shot(page, 'j14-06-aplicado'));
  await waitSaved(page, 20000);
  const applied = (await state(page)).runtime.document;

  // ------------------------------------------------------------------ F. UM Desfazer; Refazer
  await appliedCard.getByRole('button', { name: /^Desfazer \(\d+ s\)$/ }).click();
  const undone = await page.waitForFunction((count) => window.__FATHER__.state().runtime.document.pages.length === count,
    original.pages.length, { timeout: 5000 }).then(() => true).catch(() => false);
  st = await state(page);
  j.step('F1 UM Desfazer tira as duas páginas (o catálogo volta ao que era)',
    undone && JSON.stringify(st.runtime.document) === JSON.stringify(original), `páginas: ${st.runtime.document.pages.length}`);
  await page.getByRole('button', { name: 'Refazer última alteração' }).click();
  st = await state(page);
  j.step('F2 Refazer devolve as mesmas páginas', JSON.stringify(st.runtime.document) === JSON.stringify(applied));
  await waitSaved(page, 20000);

  // ------------------------------------------------------------------ G. texto, largura, console
  const texts = await cardTexts();
  const jargon = texts.match(new RegExp(JARGON.source, 'gi')) ?? [];
  j.step('G1 os cartões falam português simples (sem termos técnicos de programação)', jargon.length === 0, jargon.join(', '));
  measures.width = await dock().evaluate((node) => {
    const thread = node.querySelector('.ai-chat-thread') ?? node;
    return { scroll: thread.scrollWidth, client: thread.clientWidth };
  });
  j.step('G2 o painel do assistente não rola para o lado', measures.width.scroll <= measures.width.client + 1, JSON.stringify(measures.width));
  const errors = consoleErrors(log);
  j.step('G3 zero erros de console e de página', errors.length === 0 && log.pageErrors.length === 0,
    JSON.stringify({ errors, pageErrors: log.pageErrors }).slice(0, 600));
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 900));
  await shot(page, 'j14-99-erro').then((path) => j.addEvidence(path)).catch(() => {});
} finally {
  await j.finish(log, { extra: { viewportUsed: viewport, server: server.baseUrl, measures } });
  await browser.close().catch(() => {});
}
process.exit(j.steps.every((step) => step.ok) ? 0 : 1);

// J00 — fumaça: a biblioteca abre em português, "Novo catálogo" cria uma "Ficha técnica essencial",
// o editor abre salvo e "Meus catálogos" volta à lista com o catálogo. Zero erros de console.
//   node tests/vnext/proof/father-journeys/j00-smoke.mjs
//   VP=1280 node tests/vnext/proof/father-journeys/j00-smoke.mjs
import {
  ENGLISH, JARGON, aria, consoleErrors, ensureServer, freshDb, harnessUrl, journey, launch, shot, state,
  visibleText, waitEditor, waitLibrary, waitSaved,
} from './lib.mjs';

const server = await ensureServer();
const { browser, page, log, viewport } = await launch();
const j = journey('j00-smoke', 'Fumaça: biblioteca → novo catálogo → editor salvo → voltar à biblioteca');
const db = freshDb('j00');
const names = { library: {}, editor: {} };
let status = 'fail';

try {
  // 1. Biblioteca
  await page.goto(harnessUrl({ db }));
  await waitLibrary(page);
  const heading = page.getByRole('heading', { name: 'Meus catálogos', exact: true });
  j.step('biblioteca abre com o título "Meus catálogos"', await heading.isVisible());
  const libraryText = await visibleText(page);
  const libraryJargon = libraryText.match(JARGON);
  const libraryEnglish = libraryText.match(ENGLISH);
  j.step('textos da biblioteca em português, sem jargão', !libraryJargon && !libraryEnglish,
    `jargão: ${libraryJargon?.[0] ?? '-'} · inglês: ${libraryEnglish?.[0] ?? '-'}`);
  names.library.buttons = await page.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => (button.getAttribute('aria-label') ?? button.textContent ?? '').trim()).filter(Boolean));
  names.library.headings = await page.getByRole('heading').allInnerTexts();
  j.addEvidence(await shot(page, 'j00-01-biblioteca'));

  // 2. Novo catálogo
  const newButton = page.getByRole('button', { name: 'Novo catálogo', exact: true });
  await newButton.click();
  const dialog = page.getByRole('dialog', { name: 'Novo catálogo' });
  await dialog.waitFor({ timeout: 10000 });
  j.step('"Novo catálogo" abre o diálogo "Novo catálogo"', await dialog.isVisible());
  names.library.dialog = await aria(page, dialog);
  const nameField = dialog.getByRole('textbox', { name: 'Nome do catálogo' });
  await nameField.fill('Catálogo de teste');
  j.step('campo "Nome do catálogo" aceita o nome', (await nameField.inputValue()) === 'Catálogo de teste');
  j.addEvidence(await shot(page, 'j00-02-novo-catalogo'));
  const starter = dialog.getByRole('button', { name: 'Ficha técnica essencial', exact: true });
  j.step('opção "Ficha técnica essencial" está no diálogo', await starter.isVisible());

  // 3. Editor
  const openStartedAt = Date.now();
  await starter.click();
  await waitEditor(page);
  await waitSaved(page);
  const openMs = Date.now() - openStartedAt;
  const afterOpen = await state(page);
  j.step('editor abre ([data-vnext-shell]) com o catálogo persistido',
    afterOpen.mode === 'editor' && afterOpen.runtime?.catalogId !== null, `em ${openMs} ms`);
  j.step('o catálogo recebeu o nome digitado', afterOpen.runtime?.title === 'Catálogo de teste',
    `título: ${afterOpen.runtime?.title}`);
  const saveState = page.locator('[data-save-state][data-save-phase]').first();
  const saveText = ((await saveState.textContent().catch(() => '')) ?? '').trim();
  j.step('aparece "Salvo" no editor', saveText === 'Salvo' && afterOpen.runtime?.saveLabel === 'Saved',
    `texto: "${saveText}" · saveLabel: ${afterOpen.runtime?.saveLabel}`);
  const editorText = await visibleText(page, '[data-vnext-shell]');
  const editorJargon = editorText.match(JARGON);
  const editorEnglish = editorText.match(ENGLISH);
  j.step('textos do editor em português, sem jargão', !editorJargon && !editorEnglish,
    `jargão: ${editorJargon?.[0] ?? '-'} · inglês: ${editorEnglish?.[0] ?? '-'}`);
  names.editor.buttons = await page.locator('[data-vnext-shell]').getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => (button.getAttribute('aria-label') ?? button.textContent ?? '').trim()).filter(Boolean));
  names.editor.headings = await page.locator('[data-vnext-shell]').getByRole('heading').allInnerTexts();
  j.addEvidence(await shot(page, 'j00-03-editor-salvo'));

  // 4. Voltar à biblioteca
  const back = page.getByRole('button', { name: /^(Voltar aos catálogos|Meus catálogos)$/ }).first();
  j.step('botão para voltar ("Meus catálogos") está visível', await back.isVisible());
  const backLabel = await back.evaluate((button) => ({
    ariaLabel: button.getAttribute('aria-label'), text: (button.textContent ?? '').trim(),
  }));
  names.editor.backButton = backLabel;
  await back.click();
  await waitLibrary(page);
  const row = page.getByText('Catálogo de teste', { exact: true }).first();
  await row.waitFor({ timeout: 10000 });
  const afterBack = await state(page);
  j.step('"Meus catálogos" volta à lista com o catálogo criado',
    afterBack.mode === 'library' && afterBack.catalogs.some((item) => item.title === 'Catálogo de teste' && !item.archivedAt),
    `catálogos: ${afterBack.catalogs.map((item) => item.title).join(', ')}`);
  j.addEvidence(await shot(page, 'j00-04-biblioteca-com-catalogo'));

  // 5. Console limpo
  const errors = consoleErrors(log);
  j.step('zero erros de console e de página', errors.length === 0 && log.pageErrors.length === 0,
    `console: ${errors.map((entry) => entry.text).join(' | ') || '-'} · página: ${log.pageErrors.join(' | ') || '-'}`);
  if (log.console.some((entry) => entry.type === 'warning')) {
    j.finding(`avisos de console (${log.console.filter((entry) => entry.type === 'warning').length})`, { severity: 'low', where: 'console' });
  }
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 800));
  await shot(page, 'j00-99-erro').then((path) => j.addEvidence(path)).catch(() => {});
} finally {
  status = await j.finish(log, { extra: { viewportUsed: viewport, accessibleNames: names, server: server.baseUrl } });
  await browser.close();
  await server.close();
}
process.exit(status === 'fail' ? 1 : 0);

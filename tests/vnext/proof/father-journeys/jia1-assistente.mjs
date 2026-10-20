// J-IA1 — Assistente IA sem chave pessoal (grupo D, Equipe B).
// O pai abre o "Assistente IA" sem chave nem senha; o painel diz "IA pronta."; ele pede "capa e
// especificações do TA-25N"; a proposta chega (capa + tabela "Ficha técnica" vazia + notas); clica em
// "Confirmar e inserir no catálogo"; UM Ctrl+Z desfaz as 3 páginas. Depois, com o limite diário
// atingido (?ia=limite) e com o servidor sem IA (?ia=off), lê a mensagem que aparece.
// "Avançado (chave própria)" não pode aparecer quando o servidor não oferece chave própria (FR-60/1B).
// FR-17/FR-16b integradas: abas, ausência de sobreposição e escala são verificações obrigatórias.
//   BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/jia1-assistente.mjs
//   VP=1280 BASE_URL=http://127.0.0.1:5190 node tests/vnext/proof/father-journeys/jia1-assistente.mjs
import {
  aria, createCatalog, ensureServer, freshDb, harnessUrl, journey, launch, shot, state, waitEditor, waitSaved,
} from './lib.mjs';
import {
  MIN_BODY_FONT_PX, MIN_TARGET_PX, classifyConsole, clickCounter, findingStep, finishJourneyGraded, measure, measureAll,
  scanJargon, unexplainedMm, waitMs,
} from './fixtures/father-eyes.mjs';

const server = await ensureServer();
const { browser, page, log, viewport } = await launch();
const j = journey('jia1-assistente', 'J-IA1 — Abrir o Assistente IA sem chave, pedir capa e especificações do TA-25N, confirmar e desfazer com um Ctrl+Z');
const db = freshDb('jia1');
const clicks = clickCounter();
const measures = {};
const timings = {};
const texts = {};
const observations = {};
let status = 'fail';
const CATALOG = 'TA-25N — Ficha técnica 2026';
const PEDIDO = 'Crie a capa e as especificações do TA-25N';
// "PRESYS · Catalog Builder" é o nome do produto; "Gemini" é o nome da IA; "Zoom" é palavra corrente.
const ALLOW = [/^(Catalog|Builder|Zoom|Gemini)$/];

const dock = () => page.getByRole('complementary', { name: 'Assistente do catálogo atual', exact: true });
const pagesCount = async () => (await state(page)).runtime.document.pages.length;
const saveText = async () => ((await page.locator('[data-vnext-shell] header [data-save-phase]').first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
const SAVED = /^Salvo(?: às \d{2}:\d{2})?$/;
const dockText = async () => ((await dock().innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
const smallFonts = (set, keys) => Object.entries(set).filter(([key, m]) => m && keys.includes(key) && m.fontPx < MIN_BODY_FONT_PX).map(([key, m]) => `${key}: ${m.fontPx} px`);
const smallTargets = (set, keys) => Object.entries(set).filter(([key, m]) => m && keys.includes(key) && m.heightPx < MIN_TARGET_PX).map(([key, m]) => `${key}: ${m.heightPx} px`);
/** Texto corrido de um objeto de texto do documento (RichText → string). */
const plainText = (rich) => typeof rich === 'string' ? rich
  : (rich?.paragraphs ?? []).map((p) => (p.inlines ?? []).map((i) => i.text ?? '').join('')).join(' / ');

/** A mensagem flutuante do editor (FR-12), se houver. */
async function notices() {
  return page.evaluate(() => {
    const root = document.querySelector('[data-editor-notices]');
    const notice = root?.querySelector('[data-editor-notice]');
    if (!notice) return { text: '', visible: false, tone: null };
    const rect = notice.getBoundingClientRect();
    const text = notice.innerText.replace(/\s+/g, ' ').trim();
    return { text, visible: text.length > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0, tone: notice.getAttribute('data-tone') };
  });
}

/** Observa, desde antes do clique, se "Avançado (chave própria)" chegou a aparecer (e por quanto tempo) e a sequência de textos de prontidão. */
async function installReadinessObserver() {
  await page.evaluate(() => {
    const rec = { advancedSeen: false, advancedFirstAtMs: null, advancedGoneAtMs: null, readiness: [] };
    const t0 = performance.now();
    const scan = () => {
      const buttons = [...document.querySelectorAll('[data-vnext-assistant="open"] button')];
      const present = buttons.some((b) => /Avançado \(chave própria\)/.test(b.textContent ?? ''));
      if (present) {
        rec.advancedSeen = true;
        if (rec.advancedFirstAtMs === null) rec.advancedFirstAtMs = Math.round(performance.now() - t0);
      } else if (rec.advancedFirstAtMs !== null && rec.advancedGoneAtMs === null) {
        rec.advancedGoneAtMs = Math.round(performance.now() - t0);
      }
      const r = document.querySelector('[data-vnext-assistant="open"] .ai-readiness')?.textContent?.trim();
      if (r && rec.readiness[rec.readiness.length - 1] !== r) rec.readiness.push(r);
    };
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__jia1 = { rec, stop: () => { mo.disconnect(); scan(); return rec; } };
  });
}

/** FR-17: properties may be hidden; compare the assistant with the visible, clipped page. */
async function overlap() {
  return page.evaluate(() => {
    const dockEl = document.querySelector('[data-vnext-assistant="open"]');
    const props = document.querySelector('aside[aria-label="Propriedades do objeto"]');
    const pageEl = document.querySelector('section[data-page-id]');
    const r = (el, clipped = false) => {
      if (!el || el.closest('[hidden]')) return null;
      const b = el.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) return null;
      let left = Math.max(0, b.left); let right = Math.min(window.innerWidth, b.right);
      if (clipped) for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowX)) continue;
        const bounds = parent.getBoundingClientRect();
        left = Math.max(left, bounds.left); right = Math.min(right, bounds.right);
      }
      return { left, right, top: Math.round(b.top), width: Math.max(0, right - left) };
    };
    const ix = (a, b) => a && b ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) : 0;
    const d = r(dockEl); const p = r(props); const pg = r(pageEl, true);
    return {
      viewport: window.innerWidth,
      dock: d, propriedades: p, pagina: pg,
      position: dockEl ? getComputedStyle(dockEl).position : null,
      propriedadesCobertasPx: ix(d, p),
      propriedadesCobertasPct: p?.width ? Math.round((ix(d, p) / p.width) * 100) : null,
      paginaCobertaPx: ix(d, pg),
      paginaCobertaPct: pg?.width ? Math.round((ix(d, pg) / pg.width) * 100) : null,
      propriedadesOcultas: Boolean(props?.closest('[hidden]')),
      abaAssistenteSelecionada: document.querySelector('[data-side-tab="assistant"]')?.getAttribute('aria-selected') === 'true',
    };
  });
}

/** Abre o painel do assistente (1 clique) e espera a prontidão resolver. Devolve o que o observador viu. */
async function openAssistant(task) {
  await installReadinessObserver();
  const openButton = page.getByRole('button', { name: 'Abrir assistente de edição' });
  const t0 = Date.now();
  await clicks.click(task, openButton);
  await dock().waitFor({ timeout: 5000 });
  await page.waitForFunction(() => {
    const t = document.querySelector('[data-vnext-assistant="open"] .ai-readiness')?.textContent?.trim() ?? '';
    return t !== '' && t !== 'Verificando a IA…';
  }, null, { timeout: 5000 }).catch(() => {});
  // Mais um instante para o observador registrar o sumiço do botão, se ele piscou.
  await page.waitForTimeout(150);
  const ms = Date.now() - t0;
  const rec = await page.evaluate(() => window.__jia1.stop());
  const readiness = ((await dock().locator('.ai-readiness').textContent().catch(() => '')) ?? '').trim();
  const keyInputs = await dock().locator('input[type="password"], input[autocomplete="current-password"]').count();
  const advanced = await dock().getByRole('button', { name: 'Avançado (chave própria)' }).count();
  const flickerMs = rec.advancedFirstAtMs !== null ? (rec.advancedGoneAtMs ?? ms) - rec.advancedFirstAtMs : 0;
  return { ms, rec, readiness, keyInputs, advanced, flickerMs };
}

try {
  // ------------------------------------------------------------------ A. catálogo e painel
  await page.goto(harnessUrl({ db }));
  const catalogId = await createCatalog(page, { name: CATALOG });
  const pagesBefore = await pagesCount();
  j.step('A0 catálogo "TA-25N — Ficha técnica 2026" criado e salvo', Boolean(catalogId) && (await state(page)).runtime.saveLabel === 'Saved', `páginas: ${pagesBefore}`);

  const openButton = page.getByRole('button', { name: 'Abrir assistente de edição' });
  measures.botaoAssistente = await measure(openButton);
  measures.botaoAssistente.visibleText = (await openButton.innerText()).replace(/\s+/g, ' ').trim();
  j.step('A1 o botão "Assistente IA" está na barra de cima, visível sem rolar, com esse nome',
    measures.botaoAssistente.fullyVisible && /Assistente IA$/.test(measures.botaoAssistente.visibleText),
    JSON.stringify(measures.botaoAssistente));

  const opened = await openAssistant('abrir o assistente');
  timings.iaProntaMs = opened.ms;
  texts.prontidao = opened.readiness;
  observations.sequenciaProntidao = opened.rec.readiness;
  observations.avancadoPiscou = { viu: opened.rec.advancedSeen, apareceuEmMs: opened.rec.advancedFirstAtMs, sumiuEmMs: opened.rec.advancedGoneAtMs, duracaoMs: opened.flickerMs };
  j.step('A2 o painel abre e diz "IA pronta." sem pedir chave nem senha', opened.readiness === 'IA pronta.' && opened.keyInputs === 0,
    `texto: "${opened.readiness}" · campos de senha/chave: ${opened.keyInputs} · em ${opened.ms} ms · sequência: ${opened.rec.readiness.join(' → ') || '-'}`);
  if (opened.advanced > 0) {
    j.step('A3 "Avançado (chave própria)" não aparece quando o servidor não oferece chave própria (FR-60/1B)', false,
      `botões "Avançado (chave própria)" na tela depois de "IA pronta.": ${opened.advanced}`);
  } else if (opened.rec.advancedSeen) {
    findingStep(j, 'A3 "Avançado (chave própria)" pisca ao abrir o painel: aparece enquanto diz "Verificando a IA…" e some em "IA pronta."',
      `apareceu em ${opened.rec.advancedFirstAtMs} ms e sumiu em ${opened.rec.advancedGoneAtMs} ms (visível por ~${opened.flickerMs} ms no harness; em produção dura o tempo da consulta ao servidor). Ao final: ${opened.advanced} botão(ões).`,
      { id: 'D-01', severity: 'P3', knownFR: 'FR-60' });
  } else {
    j.step('A3 "Avançado (chave própria)" não aparece quando o servidor não oferece chave própria (FR-60/1B)', true, 'nem de relance');
  }
  const focused = await page.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName ?? '');
  j.step('A4 o cursor já está na caixa "Seu pedido ao Gemini" ao abrir (não precisa clicar nela)', focused === 'gemini-catalog-command', `foco em: ${focused}`);

  texts.painelInicial = await dockText();
  const jargonA = scanJargon(texts.painelInicial, { allow: ALLOW });
  const mmA = unexplainedMm(texts.painelInicial);
  j.step('A5 textos do painel em português, sem jargão técnico', jargonA.length === 0 && mmA.length === 0,
    `termos: ${jargonA.map((h) => `${h.term} («${h.context}»)`).join(' | ') || '-'} · mm: ${mmA.join(' | ') || '-'}`);
  observations.palavrasNoPainel = ['proposta', 'propõe', 'versão', 'esqueleto', 'estrutura', 'páginas A4', 'Gemini', 'IA', 'inserir', 'confirma'].filter((w) => texts.painelInicial.includes(w));
  observations.vezesGemini = (texts.painelInicial.match(/Gemini/g) ?? []).length;
  observations.vezesIA = (texts.painelInicial.match(/\bIA\b/g) ?? []).length;

  const d = dock();
  measures.painel = await measureAll({
    rotuloEditando: d.locator('.vnext-assistant-dock-controls span').first(),
    fechar: d.getByRole('button', { name: 'Fechar painel do assistente' }),
    abaGemini: d.getByRole('tab', { name: 'Criar com Gemini' }),
    abaFerramentas: d.getByRole('tab', { name: 'Ferramentas' }),
    titulo: d.locator('h3').first(),
    descricao: d.locator('.ai-chat-heading p').first(),
    prontidao: d.locator('.ai-readiness'),
    contador: d.locator('.ai-chat-count'),
    boasVindas: d.locator('.ai-chat-welcome p').first(),
    sugestao1: d.locator('.ai-chat-suggestions button').first(),
    dicaPequena: d.locator('.ai-chat-welcome small'),
    rotuloPedido: d.locator('label[for="gemini-catalog-command"]'),
    caixaPedido: d.getByRole('textbox', { name: 'Seu pedido ao Gemini' }),
    enviar: d.getByRole('button', { name: 'Enviar ao Gemini' }),
    limite: d.locator('.ai-boundary'),
  });
  const fontKeys = ['rotuloEditando', 'fechar', 'abaGemini', 'abaFerramentas', 'titulo', 'descricao', 'prontidao', 'boasVindas', 'sugestao1', 'dicaPequena', 'rotuloPedido', 'caixaPedido', 'enviar', 'limite'];
  const targetKeys = ['fechar', 'abaGemini', 'abaFerramentas', 'sugestao1', 'enviar'];
  const smallF = smallFonts(measures.painel, fontKeys);
  const smallT = smallTargets(measures.painel, targetKeys);
  if (measures.botaoAssistente.fontPx < MIN_BODY_FONT_PX) smallF.unshift(`botão "Assistente IA" (barra de cima): ${measures.botaoAssistente.fontPx} px`);
  j.step('A6 letras ≥ 13 px e alvos ≥ 24 px no painel do assistente (FR-16b)',
    smallF.length === 0 && smallT.length === 0,
    `letras pequenas: ${smallF.join(', ') || '-'} · alvos pequenos: ${smallT.join(', ') || '-'}`);
  measures.sobreposicaoInicial = await overlap();
  j.step('A7 Assistente ocupa a coluna da direita, com Propriedades oculta e sem cobrir a página (FR-17)',
    measures.sobreposicaoInicial.abaAssistenteSelecionada && measures.sobreposicaoInicial.propriedadesOcultas
      && measures.sobreposicaoInicial.dock !== null && measures.sobreposicaoInicial.pagina !== null
      && measures.sobreposicaoInicial.position !== 'fixed' && measures.sobreposicaoInicial.paginaCobertaPx <= 1,
    JSON.stringify(measures.sobreposicaoInicial));
  j.addEvidence(await shot(page, 'jia1-01-painel-pronto'));

  // ------------------------------------------------------------------ B. pedido e proposta
  const box = d.getByRole('textbox', { name: 'Seu pedido ao Gemini' });
  await page.keyboard.type(PEDIDO);
  const sendButton = d.getByRole('button', { name: 'Enviar ao Gemini' });
  j.step('B0 depois de digitar, "Enviar ao Gemini" fica disponível', await sendButton.isEnabled());
  const tSend = Date.now();
  let preparing = false;
  await clicks.click('pedir', sendButton);
  const proposal = d.getByRole('group', { name: 'Proposta de páginas' });
  while (Date.now() - tSend < 10000) {
    if ((await d.locator('[role="status"]').count()) > 0) preparing = true;
    if ((await proposal.count()) > 0) break;
    await page.waitForTimeout(25);
  }
  await proposal.waitFor({ timeout: 10000 });
  timings.propostaMs = Date.now() - tSend;
  observations.viuPreparando = preparing;
  texts.proposta = (await proposal.innerText()).replace(/\s+/g, ' ').trim();
  texts.conversaAposProposta = await dockText();
  j.step('B1 a proposta chega como capa + tabela "Ficha técnica" (3 colunas × 5 linhas, vazia) + notas',
    /Proposta para revisar/.test(texts.proposta) && /Página 1: Catálogo técnico PRESYS · Capa/.test(texts.proposta)
      && /Página 2: Ficha técnica · Ficha técnica: 3 colunas × 5 linhas, dados ainda vazios/.test(texts.proposta) && /Página 3: Notas de revisão/.test(texts.proposta),
    texts.proposta.slice(0, 300));
  j.step('B2 a proposta aparece em menos de 3 s (no harness a IA é falsa e responde na hora)', timings.propostaMs < 3000,
    `${timings.propostaMs} ms · "Gemini está preparando…" chegou a aparecer: ${preparing}`);
  j.step('B3 a conversa explica a proposta e avisa que nenhum valor técnico será inventado',
    /Revise a proposta de 3 página\(s\) antes de aplicar\. Nenhum valor técnico será inventado\./.test(texts.conversaAposProposta), texts.conversaAposProposta.slice(0, 300));
  const confirmButton = proposal.getByRole('button', { name: 'Confirmar e inserir no catálogo' });
  const rejectButton = proposal.getByRole('button', { name: 'Rejeitar proposta' });
  measures.proposta = await measureAll({
    titulo: proposal.locator('h4'),
    resumo: proposal.locator('p').first(),
    item: proposal.locator('li').first(),
    confirmar: confirmButton,
    rejeitar: rejectButton,
  });
  measures.proposta.grupo = await measure(proposal);
  j.step('B4 "Confirmar e inserir no catálogo" e "Rejeitar proposta" estão visíveis sem rolar',
    measures.proposta.confirmar?.fullyVisible && measures.proposta.rejeitar?.fullyVisible, JSON.stringify({ confirmar: measures.proposta.confirmar, rejeitar: measures.proposta.rejeitar }));
  const smallFP = smallFonts(measures.proposta, ['titulo', 'resumo', 'item', 'confirmar', 'rejeitar']);
  const smallTP = smallTargets(measures.proposta, ['confirmar', 'rejeitar']);
  j.step('B5 letras e botões da proposta legíveis (≥ 13 px / ≥ 24 px, FR-16b)',
    smallFP.length === 0 && smallTP.length === 0,
    `letras pequenas: ${smallFP.join(', ') || '-'} · alvos pequenos: ${smallTP.join(', ') || '-'}`);
  const jargonB = scanJargon(texts.conversaAposProposta, { allow: ALLOW });
  j.step('B6 a proposta e a conversa estão em português, sem jargão', jargonB.length === 0, jargonB.map((h) => `${h.term} («${h.context}»)`).join(' | ') || '-');
  observations.palavrasNaProposta = ['proposta', 'revisar', 'esqueleto', 'estrutura', 'versão', 'dados ainda vazios', 'inserir', 'Rejeitar'].filter((w) => texts.conversaAposProposta.includes(w));
  // O histórico rola até os botões: o título "Proposta para revisar" e a "Página 1: Capa" podem ficar cortados acima.
  const clipped = await page.evaluate(() => {
    const h4 = document.querySelector('[data-vnext-assistant="open"] [role="group"][aria-label="Proposta de páginas"] h4');
    if (!h4) return null;
    let scroller = h4.parentElement;
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!scroller) return { semRolagem: true, cortado: false };
    const s = scroller.getBoundingClientRect(); const h = h4.getBoundingClientRect();
    const firstItem = h4.parentElement?.querySelector('li')?.getBoundingClientRect();
    return { topDaRolagem: Math.round(s.top), tituloTop: Math.round(h.top), tituloBottom: Math.round(h.bottom), pagina1Bottom: firstItem ? Math.round(firstItem.bottom) : null, cortado: h.bottom <= s.top + 2 };
  });
  observations.tituloDaPropostaCortado = clipped;
  if (clipped?.cortado) {
    findingStep(j, 'B7 a conversa rola até os botões e corta o título "Proposta para revisar" e a "Página 1: Capa" (o pai vê a proposta começando na "Página 2")',
      `título da proposta termina em y=${clipped.tituloBottom} px, acima do topo da área rolável (y=${clipped.topDaRolagem} px); "Página 1" termina em y=${clipped.pagina1Bottom} px`, { id: 'D-07', severity: 'P3', knownFR: null });
  } else {
    j.step('B7 o título "Proposta para revisar" está visível junto com os botões', true, JSON.stringify(clipped));
  }
  j.addEvidence(await shot(page, 'jia1-02-proposta'));

  // ------------------------------------------------------------------ C. confirmar e inserir
  const pagesPanelBefore = (await page.getByRole('complementary', { name: 'Páginas do catálogo' }).innerText()).replace(/\s+/g, ' ');
  const pageIndicatorBefore = (await page.locator('[data-vnext-shell] main strong').first().innerText().catch(() => '')).trim();
  const tConfirm = Date.now();
  await clicks.click('confirmar', confirmButton);
  const insertedMs = await waitMs(async () => (await pagesCount()) === pagesBefore + 3, { timeout: 5000 });
  timings.inseriuMs = insertedMs;
  const st = await state(page);
  const pagesAfter = st.runtime.document.pages.length;
  const newPages = st.runtime.document.pages.slice(pagesBefore);
  const tables = newPages.flatMap((p) => p.objects.filter((o) => o.type === 'table'));
  const table = tables[0];
  observations.tabelaInserida = table ? {
    rows: table.table.rows.length, columns: table.table.columns.length,
    styleKeys: Object.keys(table.table.style ?? {}), frame: table.frame,
  } : null;
  observations.paginasNovas = newPages.map((p) => p.objects.filter((o) => o.type === 'text').map((o) => plainText(o.text).slice(0, 40)));
  j.step('C1 "Confirmar e inserir" cria 3 páginas com 1 tabela de 3 colunas × 5 linhas', pagesAfter === pagesBefore + 3 && tables.length === 1 && table.table.columns.length === 3 && table.table.rows.length === 5,
    `páginas: ${pagesBefore} → ${pagesAfter} · tabelas novas: ${tables.length} · ${JSON.stringify(observations.tabelaInserida)} · em ${insertedMs} ms`);
  texts.conversaAposInserir = await dockText();
  const applied = d.locator('.ai-chat-turn').filter({ hasText: /Apliquei/ }).first();
  measures.mensagemApliquei = (await applied.count()) ? await measure(applied) : null;
  j.step('C2 o assistente responde "Apliquei 3 página(s) e 1 tabela(s)…" e a resposta está visível sem rolar',
    /Apliquei 3 página\(s\) e 1 tabela\(s\)/.test(texts.conversaAposInserir) && measures.mensagemApliquei?.fullyVisible, JSON.stringify(measures.mensagemApliquei));
  let notice = null;
  const tN = Date.now();
  while (Date.now() - tN < 2000) { const n = await notices(); if (n.text) { notice = { ...n, afterMs: Date.now() - tConfirm }; break; } await page.waitForTimeout(50); }
  observations.avisoDoEditorAoInserir = notice;
  const pagesPanelAfter = (await page.getByRole('complementary', { name: 'Páginas do catálogo' }).innerText()).replace(/\s+/g, ' ');
  const pageIndicatorAfter = (await page.locator('[data-vnext-shell] main strong').first().innerText().catch(() => '')).trim();
  observations.painelPaginas = { antes: pagesPanelBefore.slice(0, 120), depois: pagesPanelAfter.slice(0, 160) };
  observations.indicadorPagina = { antes: pageIndicatorBefore, depois: pageIndicatorAfter };
  j.step('C3 o painel "Páginas" passa a mostrar 4 páginas (retorno visível fora do chat)', /Páginas 4/.test(pagesPanelAfter) || /Página 4/.test(pagesPanelAfter), `antes: "${pagesPanelBefore.slice(0, 60)}" · depois: "${pagesPanelAfter.slice(0, 100)}"`);
  await waitSaved(page, 20000);
  timings.salvoAposInserirMs = Date.now() - tConfirm;
  const saveAfter = await saveText();
  j.step('C4 volta a "Salvo" sozinho depois de inserir', SAVED.test(saveAfter), `texto: "${saveAfter}" · ${timings.salvoAposInserirMs} ms`);
  j.step('C4 o salvamento confirmado mostra o horário (FR-44)', /^Salvo às \d{2}:\d{2}$/.test(saveAfter), saveAfter);
  j.addEvidence(await shot(page, 'jia1-03-inserido'));
  observations.cliquesAteInserir = (clicks.counts['abrir o assistente'] ?? 0) + (clicks.counts['pedir'] ?? 0) + (clicks.counts['confirmar'] ?? 0);
  j.step('C5 do editor até as páginas inseridas: 3 cliques + digitar o pedido', observations.cliquesAteInserir === 3, `cliques: ${observations.cliquesAteInserir} (abrir, enviar, confirmar)`);

  // ------------------------------------------------------------------ D. um Ctrl+Z
  const undoButton = page.getByRole('button', { name: 'Desfazer última alteração' });
  j.step('D0 o botão "Desfazer" da barra de cima fica ativo depois de inserir', await undoButton.isEnabled());
  const activeBefore = await page.evaluate(() => `${document.activeElement?.tagName ?? ''}#${document.activeElement?.id ?? ''}`);
  await page.keyboard.press('Control+z');
  let undoneMs = await waitMs(async () => (await pagesCount()) === pagesBefore, { timeout: 3000 });
  let undoPath = 'Ctrl+Z logo depois de "Confirmar"';
  let pagesUndo = await pagesCount();
  if (pagesUndo !== pagesBefore) {
    // Segundo caminho do pai: clica num canto vazio da página e tenta de novo.
    const region = page.getByRole('region', { name: /^Página \d+$/ }).first();
    const bb = await region.boundingBox();
    if (bb) await page.mouse.click(bb.x + 20, Math.min(bb.y + bb.height - 30, viewport.height - 20));
    clicks.counts['desfazer (clique extra na página)'] = 1;
    await page.keyboard.press('Control+z');
    undoneMs = await waitMs(async () => (await pagesCount()) === pagesBefore, { timeout: 3000 });
    undoPath = 'clique na página + Ctrl+Z';
    pagesUndo = await pagesCount();
  }
  timings.ctrlZMs = undoneMs;
  observations.ctrlZ = { caminho: undoPath, focoAntes: activeBefore };
  j.step('D1 UM Ctrl+Z desfaz as 3 páginas de uma vez', pagesUndo === pagesBefore, `${pagesAfter} → ${pagesUndo} · caminho: ${undoPath} · foco antes: ${activeBefore} · em ${undoneMs} ms`);
  if (pagesUndo === pagesBefore && undoPath !== 'Ctrl+Z logo depois de "Confirmar"') {
    findingStep(j, 'D1 o Ctrl+Z só funcionou depois de clicar na página', `logo depois de "Confirmar" o Ctrl+Z não desfez (foco em ${activeBefore})`, { id: 'D-02', severity: 'P2', knownFR: null });
  }
  const stUndo = await state(page);
  j.step('D2 depois do Ctrl+Z, "Refazer" fica disponível e a conversa continua no painel',
    stUndo.runtime.canRedo && /Apliquei 3 página\(s\)/.test(await dockText()) && (await d.locator('[role="alert"]').count()) === 0,
    `canRedo: ${stUndo.runtime.canRedo} · alertas no painel: ${await d.locator('[role="alert"]').count()}`);
  await waitSaved(page, 20000);
  j.step('D3 volta a "Salvo" depois do Ctrl+Z', SAVED.test(await saveText()));
  j.addEvidence(await shot(page, 'jia1-04-depois-ctrl-z'));

  // ------------------------------------------------------------------ E. Esc com texto digitado
  await box.click();
  clicks.counts['esc (clique na caixa)'] = 1;
  const escapeDraft = 'Rascunho que o pai estava escrevendo';
  await box.fill(escapeDraft);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const dockAfterEsc = await d.count();
  observations.escFechaPainel = dockAfterEsc === 0;
  if (dockAfterEsc === 0) {
    const reopened = await openAssistant('reabrir depois do Esc');
    observations.avancadoPiscouAoReabrir = reopened.rec.advancedSeen;
    const value = await d.getByRole('textbox', { name: 'Seu pedido ao Gemini' }).inputValue();
    observations.textoDepoisDoEsc = value;
    if (value === '') {
      findingStep(j, 'E1 Esc dentro da caixa de pedido fecha o painel e apaga o que estava escrito',
        `o painel fechou com Esc; ao reabrir (${reopened.ms} ms) a caixa "Seu pedido ao Gemini" voltou vazia`, { id: 'D-03', severity: 'P2', knownFR: null });
    } else {
      j.step('E1 Esc fecha o painel mas o texto digitado volta ao reabrir', value === escapeDraft, `texto: "${value}"`);
    }
  } else {
    j.step('E1 Esc dentro da caixa não fecha o painel (o texto digitado continua)', (await box.inputValue()) === escapeDraft);
  }
  const dockJargon = scanJargon(await dockText(), { allow: ALLOW });
  j.step('E2 painel sem jargão depois de usar', dockJargon.length === 0, dockJargon.map((h) => h.term).join(', ') || '-');
  texts.painelAria = await aria(page, d);

  // ------------------------------------------------------------------ F. limite diário (?ia=limite)
  await page.goto(harnessUrl({ db, ia: 'limite', catalog: catalogId }));
  await waitEditor(page);
  await waitSaved(page);
  const limite = await openAssistant('abrir (limite diário)');
  texts.prontidaoLimite = limite.readiness;
  observations.sequenciaProntidaoLimite = limite.rec.readiness;
  observations.avancadoPiscouLimite = { viu: limite.rec.advancedSeen, duracaoMs: limite.flickerMs };
  const boxL = d.getByRole('textbox', { name: 'Seu pedido ao Gemini' });
  await boxL.fill(PEDIDO);
  const tL = Date.now();
  await clicks.click('pedir (limite diário)', d.getByRole('button', { name: 'Enviar ao Gemini' }));
  const alertL = d.locator('[role="alert"]').first();
  await alertL.waitFor({ timeout: 10000 });
  timings.alertaLimiteMs = Date.now() - tL;
  texts.alertaLimite = (await alertL.innerText()).replace(/\s+/g, ' ').trim();
  measures.alertaLimite = await measure(alertL);
  const unsentL = d.locator('.ai-chat-unsent');
  j.step('F1 com o limite diário atingido, aparece em português o que fazer ("Continue editando manualmente hoje; amanhã o limite renova")',
    /O limite diário de uso da IA foi atingido\. Continue editando manualmente hoje; amanhã o limite renova\./.test(texts.alertaLimite) && measures.alertaLimite.fullyVisible,
    `"${texts.alertaLimite}" · em ${timings.alertaLimiteMs} ms · visível: ${measures.alertaLimite.fullyVisible} · prontidão: "${limite.readiness}"`);
  // Com o limite atingido, a consulta de prontidão falha (429) antes de o servidor dizer "byok: false"; o painel então
  // oferece "Avançado (chave própria)" — a chave pessoal + senha que o FR-60 tirou do caminho do pai.
  const advancedL = d.getByRole('button', { name: 'Avançado (chave própria)' });
  if ((await advancedL.count()) > 0) {
    measures.avancadoLimite = await measure(advancedL);
    await clicks.click('abrir "Avançado" (limite diário)', advancedL);
    await page.waitForTimeout(300);
    const settings = page.locator('#catalog-gemini-settings');
    texts.avancadoAberto = ((await settings.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
    observations.avancadoLimite = {
      camposDeSenha: await settings.locator('input[type="password"]').count(),
      campos: await settings.locator('input').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.type)),
      botoes: await settings.locator('button').allInnerTexts(),
      jargao: scanJargon(texts.avancadoAberto, { allow: ALLOW }).map((h) => h.term),
    };
    findingStep(j, 'F1b com o limite diário atingido, aparece "Avançado (chave própria)" — e ele pede chave do Gemini e senha, embora o servidor nunca tenha dito que aceita chave própria',
      `botão visível (${measures.avancadoLimite.fontPx} px); ao clicar: ${observations.avancadoLimite.camposDeSenha} campo(s) de senha, campos: ${observations.avancadoLimite.campos.join(' | ')}; botões: ${observations.avancadoLimite.botoes.join(' | ')}; texto: "${texts.avancadoAberto.slice(0, 260)}"`,
      { id: 'D-06', severity: 'P2', knownFR: 'FR-60' });
    await clicks.click('fechar "Avançado"', advancedL);
  } else {
    j.step('F1b com o limite diário atingido, "Avançado (chave própria)" continua escondido', true);
  }
  j.step('F2 o pedido volta para a caixa ("não enviado") e nenhuma proposta aparece',
    (await unsentL.count()) === 1 && (await boxL.inputValue()) === PEDIDO && (await d.getByRole('group', { name: 'Proposta de páginas' }).count()) === 0,
    `não enviado: ${await unsentL.count()} · caixa: "${await boxL.inputValue()}"`);
  j.step('F3 a mensagem de limite tem letras legíveis (≥ 13 px, FR-16b)',
    measures.alertaLimite.fontPx >= MIN_BODY_FONT_PX, `${measures.alertaLimite.fontPx} px`);
  j.addEvidence(await shot(page, 'jia1-05-limite-diario'));

  // ------------------------------------------------------------------ G. servidor sem IA (?ia=off)
  await page.goto(harnessUrl({ db, ia: 'off', catalog: catalogId }));
  await waitEditor(page);
  await waitSaved(page);
  const off = await openAssistant('abrir (servidor sem IA)');
  texts.prontidaoSemIA = off.readiness;
  observations.avancadoPiscouSemIA = { viu: off.rec.advancedSeen, duracaoMs: off.flickerMs };
  measures.prontidaoSemIA = await measure(d.locator('.ai-readiness'));
  j.step('G1 com o servidor sem IA, o painel avisa em português (sem pedir chave) e "Avançado" continua escondido',
    /A IA do servidor ainda não foi configurada\. Fale com o administrador\./.test(off.readiness) && off.keyInputs === 0 && off.advanced === 0,
    `"${off.readiness}" · campos de chave: ${off.keyInputs} · "Avançado": ${off.advanced}`);
  if (/Avançado \(chave própria\)/.test(off.readiness) && off.advanced === 0) {
    findingStep(j, 'G2 a mensagem "servidor sem IA" manda usar "Avançado (chave própria)", mas esse botão não existe na tela',
      `texto: "${off.readiness}" · botões "Avançado (chave própria)" na tela: ${off.advanced}`, { id: 'D-04', severity: 'P2', knownFR: 'FR-60' });
  } else {
    j.step('G2 a mensagem "servidor sem IA" não cita botão inexistente', true);
  }
  const boxO = d.getByRole('textbox', { name: 'Seu pedido ao Gemini' });
  await boxO.fill(PEDIDO);
  await clicks.click('pedir (servidor sem IA)', d.getByRole('button', { name: 'Enviar ao Gemini' }));
  const alertO = d.locator('[role="alert"]').first();
  await alertO.waitFor({ timeout: 10000 });
  texts.alertaSemIA = (await alertO.innerText()).replace(/\s+/g, ' ').trim();
  j.step('G3 ao enviar, a mesma explicação aparece como aviso e o pedido volta para a caixa',
    /A IA do servidor ainda não foi configurada/.test(texts.alertaSemIA) && (await boxO.inputValue()) === PEDIDO, `"${texts.alertaSemIA}"`);
  j.addEvidence(await shot(page, 'jia1-06-sem-ia'));

  // ------------------------------------------------------------------ H. console
  const { appErrors, devServerNoise } = classifyConsole(log);
  j.step('H1 zero erros de console e de página', appErrors.length === 0 && log.pageErrors.length === 0,
    `console: ${appErrors.map((e) => e.text).join(' | ') || '-'} · página: ${log.pageErrors.join(' | ') || '-'} · ruído do servidor de desenvolvimento: ${devServerNoise.length}`);
} catch (error) {
  j.step('execução sem exceção', false, String(error?.stack ?? error).slice(0, 800));
  await shot(page, 'jia1-99-erro').then((p) => j.addEvidence(p)).catch(() => {});
} finally {
  status = await finishJourneyGraded(j, log, { extra: { clicks: clicks.counts, timings, measures, texts, observations, viewportUsed: viewport, server: server.baseUrl } });
  await browser.close();
  await server.close();
}
process.exit(status === 'fail' ? 1 : 0);

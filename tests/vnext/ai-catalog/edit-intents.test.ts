import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { createCatalogDocument, createDocumentSession, type DocumentSession } from '../../../src/vnext/application';
import { createInsertSpec, createSizedEmptyTable } from '../../../src/vnext/app/editor-defaults';
import { mmToU, plainRichText, type CatalogDocument } from '../../../src/vnext/domain';
import { buildDocumentOutline } from '../../../src/vnext/ai-catalog/document-outline';
import {
  checkEditIntents, checkNumbers, EDIT_INTENT_RESPONSE_SCHEMA, maskNumbers, numberSources, parseEditOutline,
  unmaskNumbers, type EditIntent,
} from '../../../src/vnext/ai-catalog/edit-intent-contract';
import {
  applyEditPlan, assistantLaneFor, assistantRouteFor, planEditIntents, prepareEditIntentRequest, requestEditIntents,
  type EditIntentReplyParsed, type EditPlan,
} from '../../../src/vnext/ai-catalog/edit-intents';

beforeAll(() => { vi.stubGlobal('crypto', webcrypto); });

const PCON = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/examples/presys-capa-pcon-hibrido.catalog.json'), 'utf8')) as CatalogDocument;
const pconSession = () => createDocumentSession(structuredClone(PCON), { createId: () => crypto.randomUUID() });
const refOf = (outline: ReturnType<typeof buildDocumentOutline>, objectId: string) =>
  [...outline.objects].find(([, value]) => value.objectId === objectId)?.[0] ?? '';
const textOf = (session: DocumentSession, objectId: string) => {
  const object = session.getSnapshot().document.pages.flatMap(page => page.objects).find(entry => entry.id === objectId);
  return object?.type === 'text' ? object.text.paragraphs.map(p => p.inlines.map(i => i.kind === 'text' ? i.text : '').join('')).join('\n') : undefined;
};
function plan(session: DocumentSession, intents: EditIntent[], message: string, options = {}): EditPlan {
  const snapshot = session.getSnapshot();
  const outline = buildDocumentOutline(snapshot.document, options);
  const reply: EditIntentReplyParsed = { status: 'proposal', summary: 'Vou fazer a mudança pedida.', intents, blocked: [] };
  const outcome = planEditIntents(snapshot.document, snapshot.localSequence, outline, reply, [message]);
  if (outcome.status !== 'plan') throw new Error('NOT_A_PLAN');
  return outcome.plan;
}
const id = (suffix: string) => 'capa-pcon-hibrido-' + suffix;

describe('document outline (FR-72)', () => {
  it('describes the open page compactly, with Camadas names, hints and numbers as markers', () => {
    const doc = structuredClone(PCON);
    const outline = buildDocumentOutline(doc, { activePageId: doc.pages[0].id, selectedObjectIds: [id('titulo')] });
    const json = JSON.stringify(outline.outline);
    expect(json.length).toBeLessThanOrEqual(9_000);
    expect(parseEditOutline(outline.outline)).not.toBeNull();
    const page = outline.outline.pages[0];
    expect(page).toMatchObject({ ref: 'p1', number: 1, heading: 'PCON HÍBRIDO', objects: 38 });
    // 38 objects on the page plus the 3 shapes inside the shadow group.
    expect(page.detail).toHaveLength(41);
    const title = page.detail!.find(object => object.hint === 'titulo')!;
    expect(title).toMatchObject({ kind: 'text', name: 'Texto “PCON HÍBRIDO”', text: 'PCON HÍBRIDO', sizePt: 28, bold: true });
    expect(outline.outline.selection).toEqual([title.ref]);
    const range = page.detail!.find(object => object.hint === 'pilula-a1')!;
    expect(range).toMatchObject({ text: '{{A}} a {{B}} psi', nums: ['0', '250'] });
    // No digit travels inside an outline text, only in nums.
    for (const object of page.detail!) if (object.text) expect(object.text).not.toMatch(/\p{N}/u);
    // Layers order: the object on top comes first; the locked pattern says so.
    expect(page.detail![0].hint).toBe('rodape-2');
    expect(page.detail!.find(object => object.hint === 'fundo-azul-padrao')).toMatchObject({ locked: true, kind: 'polygon' });
    expect(page.detail!.find(object => object.hint === 'fundo-azul')).toMatchObject({ fill: 'degradê #173F65→#0C2640' });
    // Refs map back to the real ids; the outline itself never carries asset ids.
    expect(outline.objects.get(title.ref)).toEqual({ pageId: doc.pages[0].id, objectId: id('titulo') });
    expect(json).not.toContain('7e8ad13e');
  });
  it('lists every page and details only the open one; shrinks to fit a small budget', () => {
    const session = pconSession();
    const first = session.getSnapshot().document.pages[0].id;
    expect(session.execute({ type: 'page.duplicate', pageId: first }).ok).toBe(true);
    expect(session.execute({ type: 'page.add' }).ok).toBe(true);
    const doc = session.getSnapshot().document;
    const outline = buildDocumentOutline(doc, { activePageId: doc.pages[2].id });
    expect(outline.outline.activePage).toBe('p3');
    expect(outline.outline.pages.map(page => [page.ref, page.objects, Boolean(page.detail)]))
      .toEqual([['p1', 38, false], ['p2', 38, false], ['p3', 0, true]]);
    const small = buildDocumentOutline(doc, { activePageId: first, maxChars: 4_500 });
    expect(JSON.stringify(small.outline).length).toBeLessThanOrEqual(4_500);
    expect(small.outline.pages[0].detail!.length).toBeGreaterThan(8);
  });
  it('rejects tampered outlines on the server parser (digits in texts, unknown keys, dangling refs)', () => {
    const outline = structuredClone(buildDocumentOutline(structuredClone(PCON)).outline);
    const textObject = outline.pages[0].detail!.find(object => object.text)!;
    expect(parseEditOutline({ ...outline, extra: 1 })).toBeNull();
    textObject.text = 'Exatidão 0,025%';
    expect(parseEditOutline(outline)).toBeNull();
    textObject.text = 'PCON HÍBRIDO';
    expect(parseEditOutline({ ...outline, selection: ['o999'] })).toBeNull();
    expect(parseEditOutline({ ...outline, activePage: 'p9' })).toBeNull();
    expect(parseEditOutline(outline)).not.toBeNull();
  });
});

describe('numbers as markers', () => {
  it('masks, restores and checks numbers', () => {
    expect(maskNumbers('Exatidão ±0,025% FS na faixa 100–10000 psi')).toEqual({
      masked: 'Exatidão ±{{A}}% FS na faixa {{B}}–{{C}} psi', nums: ['0,025', '100', '10000'] });
    expect(unmaskNumbers('Accuracy ±{{A}}% FS, {{B}} to {{C}} psi', ['0,025', '100', '10000']))
      .toBe('Accuracy ±0,025% FS, 100 to 10000 psi');
    expect(unmaskNumbers('{{A}} e {{A}}', ['1'])).toBeNull();
    expect(unmaskNumbers('{{D}}', ['1'])).toBeNull();
    expect(maskNumbers('modelo {{A}}')).toBeNull();
    const sources = { conversation: new Set(['18']), document: new Set(['17']) };
    expect(checkNumbers('PCON HÍBRIDO', 'PCON-Y18', sources, false)).toMatchObject({ ok: true, fromConversation: ['18'] });
    expect(checkNumbers('PCON HÍBRIDO', 'PCON-Y19', sources, false)).toMatchObject({ ok: false, invented: ['19'] });
    expect(checkNumbers('0 a 250 psi', '0 to 250 psi', sources, true).ok).toBe(true);
    expect(checkNumbers('0 a 250 psi', '0 to 250.0 psi', sources, true).ok).toBe(false);
    expect(checkNumbers('0 a 250 psi', '0 psi', sources, true)).toMatchObject({ ok: false, dropped: ['250'] });
  });
});

describe('intent -> existing editor actions, one Desfazer', () => {
  it('"troque o título da capa para PCON-Y18": text.setContent, the digits from the chat are highlighted', () => {
    const session = pconSession();
    const outline = buildDocumentOutline(session.getSnapshot().document);
    const target = refOf(outline, id('titulo'));
    const result = plan(session, [{ kind: 'set_text', target, text: 'PCON-Y18' }], 'troque o título da capa para PCON-Y18');
    expect(result.actions.map(action => action.type)).toEqual(['text.setContent']);
    expect(result.items[0]).toMatchObject({ title: 'Trocar o texto', target: 'Texto “PCON HÍBRIDO”',
      before: 'PCON HÍBRIDO', after: 'PCON-Y18', confirm: ['18'] });
    const before = structuredClone(session.getSnapshot().document);
    applyEditPlan(session, result);
    expect(textOf(session, id('titulo'))).toBe('PCON-Y18');
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);
  });
  it('refuses a number the person never typed (invention), on the client and with the server rule', () => {
    const session = pconSession();
    const outline = buildDocumentOutline(session.getSnapshot().document);
    const target = refOf(outline, id('titulo'));
    const intents: EditIntent[] = [{ kind: 'set_text', target, text: 'PCON-Y18 com exatidão de 0,01%' }];
    const server = checkEditIntents(outline.outline, ['troque o título para PCON-Y18'], intents);
    expect(server.blocked).toEqual([{ kind: 'set_text', target, code: 'INVENTED_NUMBER' }]);
    const result = plan(session, intents, 'troque o título para PCON-Y18');
    expect(result.actions).toHaveLength(0);
    expect(result.blocked[0].reason).toMatch(/Valores técnicos só entram conferidos/);
    expect(() => applyEditPlan(session, result)).toThrow('EDIT_PLAN_EMPTY');
  });
  it('"traduza esta página": translations keep every number (markers), one losing a number is refused', () => {
    const session = pconSession();
    const doc = session.getSnapshot().document;
    const outline = buildDocumentOutline(doc);
    const range = refOf(outline, id('pilula-a1'));
    const subtitle = refOf(outline, id('subtitulo'));
    const lost = refOf(outline, id('pilula-a2'));
    expect(range && subtitle && lost).toBeTruthy();
    const result = plan(session, [
      { kind: 'translate_text', target: range, text: '{{A}} to {{B}} psi', language: 'en' },
      { kind: 'translate_text', target: subtitle, text: 'Pressure calibrator with hydraulic and pneumatic pump', language: 'en' },
      { kind: 'translate_text', target: lost, text: 'up to {{B}} psi', language: 'en' },
    ], 'traduza esta página para inglês');
    expect(result.items.map(item => item.after)).toEqual(['0 to 250 psi', 'Pressure calibrator with hydraulic and pneumatic pump']);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0].reason).toMatch(/perdia ou mudava um número/);
    const before = structuredClone(session.getSnapshot().document);
    expect(applyEditPlan(session, result).applied).toBe(2);
    expect(textOf(session, id('pilula-a1'))).toBe('0 to 250 psi');
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);
    expect(session.getSnapshot().canUndo).toBe(false);
  });
  it('a translation never changes a model code; codes kept as they are are skipped silently', () => {
    const session = pconSession();
    const outline = buildDocumentOutline(session.getSnapshot().document);
    const footer = refOf(outline, id('rodape-2'));
    const code = refOf(outline, id('modelo-1'));
    const footerText = outline.outline.pages[0].detail!.find(object => object.ref === footer)!.text!;
    expect(footerText.startsWith('PCON-HIBRIDO · ')).toBe(true);
    const result = plan(session, [
      { kind: 'translate_text', target: footer, text: footerText.replace('PCON-HIBRIDO', 'PCON-HYBRID').replace('Coleção experimental', 'Experimental collection') },
      { kind: 'translate_text', target: code, text: 'KOMPRESSOR-Y{{A}}' },
    ], 'traduza esta página para o inglês');
    expect(result.items).toHaveLength(0);
    expect(result.blocked.map(item => item.reason)).toEqual(['Recusado: a tradução mudava um código de modelo. Códigos ficam como estão.']);
  });
  it('"letra maior", "negrito", "cor" and "aumente a foto" use text.setStyle, polygon.setStyle and object.resize', () => {
    const session = pconSession();
    const outline = buildDocumentOutline(session.getSnapshot().document);
    const result = plan(session, [
      { kind: 'text_size', target: refOf(outline, id('subtitulo')), size: 'larger' },
      { kind: 'text_weight', target: refOf(outline, id('subtitulo')), weight: 'bold' },
      { kind: 'set_color', target: refOf(outline, id('fundo-azul')), color: 'azul_claro' },
      { kind: 'resize', target: refOf(outline, id('foto')), size: 'larger' },
    ], 'deixe o subtítulo maior e em negrito, a faixa azul claro e aumente a foto');
    expect(result.actions.map(action => action.type)).toEqual(['text.setStyle', 'object.resize', 'text.setStyle',
      'polygon.setStyle', 'object.resize']);
    expect(result.items.map(item => item.title)).toEqual(['Aumentar a letra', 'Deixar em negrito', 'Mudar a cor para azul-claro',
      'Aumentar o tamanho']);
    expect(result.items[0]).toMatchObject({ before: '10,5 pt', after: '12,5 pt' });
    const before = structuredClone(session.getSnapshot().document);
    applyEditPlan(session, result);
    const page = session.getSnapshot().document.pages[0];
    const band = page.objects.find(object => object.id === id('fundo-azul'));
    expect(band?.type === 'polygon' && band.style.fill).toEqual({ kind: 'linear', from: '#8FB8DE', to: '#6784A0', angleDeg: 90 });
    const photo = page.objects.find(object => object.id === id('foto'))!;
    expect(photo.frame.widthMm).toBeCloseTo(144, 1);
    expect(photo.frame.heightMm).toBeCloseTo(116.494 * 1.2, 1);
    expect(photo.frame.xMm).toBeCloseTo(34, 1);
    const subtitleObject = page.objects.find(object => object.id === id('subtitulo'));
    expect(subtitleObject?.type === 'text' && subtitleObject.style).toMatchObject({ fontSizePt: 12.5, fontWeight: 700 });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);
  });
  it('"apague a página 4": page.delete; the last page and locked objects are refused', () => {
    const session = pconSession();
    const first = session.getSnapshot().document.pages[0].id;
    for (let i = 0; i < 3; i++) expect(session.execute({ type: 'page.add' }).ok).toBe(true);
    const doc = session.getSnapshot().document;
    const outline = buildDocumentOutline(doc, { activePageId: first });
    const result = plan(session, [{ kind: 'delete_page', page: 'p4' },
      { kind: 'delete_object', target: refOf(outline, id('fundo-azul-padrao')) },
      { kind: 'set_color', target: refOf(outline, id('foto')), color: 'azul' }], 'apague a página 4', { activePageId: first });
    expect(result.actions).toEqual([{ type: 'page.delete', pageId: doc.pages[3].id }]);
    expect(result.items[0].target).toBe('Página 4');
    expect(result.blocked.map(item => item.reason)).toEqual([
      'Este objeto está travado. Destrave em Camadas e peça de novo.', 'Esse pedido não vale para este objeto.']);
    applyEditPlan(session, result);
    expect(session.getSnapshot().document.pages).toHaveLength(3);
    const single = pconSession();
    const lonely = plan(single, [{ kind: 'delete_page', page: 'p1' }], 'apague a página 1');
    expect(lonely.actions).toHaveLength(0);
    expect(lonely.blocked[0].reason).toMatch(/pelo menos uma página/);
  });
  it('table "letra maior" reuses the P/M/G size of the table panel', () => {
    const doc = createCatalogDocument(() => crypto.randomUUID(), 'Ficha');
    const session = createDocumentSession(doc, { createId: () => crypto.randomUUID() });
    const pageId = doc.pages[0].id;
    const table = createSizedEmptyTable({ rows: 3, columns: 2 });
    expect(session.execute({ type: 'object.insert', pageId, object: { type: 'table', zIndex: 0, table,
      frameU: { xU: mmToU(17), yU: mmToU(40), widthU: mmToU(176), heightU: mmToU(40) } } }).ok).toBe(true);
    expect(session.execute({ type: 'object.insert', pageId, object: createInsertSpec('text', doc.pages[0]) }).ok).toBe(true);
    const outline = buildDocumentOutline(session.getSnapshot().document);
    const tableRef = outline.outline.pages[0].detail!.find(object => object.kind === 'table')!.ref;
    const result = plan(session, [{ kind: 'text_size', target: tableRef, size: 'larger' }], 'deixe a tabela com letra maior');
    expect(result.actions.map(action => action.type)).toEqual(['table.style.setBase']);
    expect(result.items[0]).toMatchObject({ title: 'Aumentar a letra da tabela' });
    const before = structuredClone(session.getSnapshot().document);
    applyEditPlan(session, result);
    const object = session.getSnapshot().document.pages[0].objects.find(entry => entry.type === 'table');
    expect(object?.type === 'table' && object.table.style.base.fontSizePt).toBeGreaterThan(before.pages[0].objects
      .flatMap(entry => entry.type === 'table' ? [entry.table.style.base.fontSizePt ?? 0] : [])[0]);
    session.undo();
    expect(session.getSnapshot().document).toEqual(before);
  });
  it('a stale plan changes nothing; a failed preflight changes nothing', () => {
    const session = pconSession();
    const outline = buildDocumentOutline(session.getSnapshot().document);
    const result = plan(session, [{ kind: 'set_text', target: refOf(outline, id('titulo')), text: 'Novo título' }], 'troque o título');
    expect(session.execute({ type: 'page.add' }).ok).toBe(true);
    const after = structuredClone(session.getSnapshot().document);
    expect(() => applyEditPlan(session, result)).toThrow('EDIT_PLAN_STALE');
    expect(session.getSnapshot().document).toEqual(after);
    const fresh = plan(session, [{ kind: 'set_text', target: refOf(outline, id('titulo')), text: 'Novo título' }], 'troque');
    const broken = { ...fresh, actions: [...fresh.actions, { type: 'object.delete' as const, objectId: 'nao-existe' }] };
    expect(() => applyEditPlan(session, broken)).toThrow('EDIT_PLAN_PREFLIGHT_FAILED');
    expect(session.getSnapshot().document).toEqual(after);
  });
});

describe('request, reply and routing', () => {
  it('sends only the outline, the message and a short history; clarification and refusal pass through', async () => {
    const session = pconSession();
    const seen: unknown[] = [];
    const answers = [{ status: 'clarification', question: 'Qual faixa: o fundo azul, a divisa branca ou as pílulas de faixa?' },
      { status: 'refusal', reason: 'Não posso inventar a exatidão do Y18. Digite o valor ou use o PDF conferido.' }];
    for (const answer of answers) {
      const outcome = await requestEditIntents(session, 'mude a cor da faixa para azul claro', async request => {
        seen.push(request); return answer;
      }, Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' as const : 'user' as const, message: 'turno ' + i })));
      expect(outcome.status).toBe(answer.status);
    }
    const request = seen[0] as ReturnType<typeof prepareEditIntentRequest>['request'];
    expect(Object.keys(request).sort()).toEqual(['history', 'message', 'outline', 'task', 'version']);
    expect(request.history).toHaveLength(6);
    expect(JSON.stringify(request)).not.toMatch(/apiKey|assetId|7e8ad13e/);
    await expect(requestEditIntents(session, 'apague tudo', async () => ({ status: 'proposal', summary: 'Vou apagar.',
      intents: [{ kind: 'run_script', target: 'o1' }], blocked: [] }))).rejects.toThrow();
  });
  it('the response schema is bounded everywhere (maxLength on strings, maxItems on arrays)', () => {
    const walk = (node: Record<string, unknown>, path: string) => {
      if (node.type === 'STRING') expect(node.enum ?? node.maxLength, path).toBeDefined();
      if (node.type === 'ARRAY') { expect(node.maxItems, path).toBeDefined(); walk(node.items as Record<string, unknown>, path + '[]'); }
      if (node.type === 'OBJECT') for (const [key, child] of Object.entries(node.properties as Record<string, Record<string, unknown>>)) walk(child, path + '.' + key);
    };
    walk(EDIT_INTENT_RESPONSE_SCHEMA as unknown as Record<string, unknown>, '$');
  });
  it('routes typed requests of the single assistant: edits on the open document, new pages to the composer', () => {
    const doc = structuredClone(PCON);
    const empty = createCatalogDocument(() => crypto.randomUUID(), 'Novo');
    expect(assistantLaneFor('troque o título da capa para PCON-Y18', doc)).toBe('edit');
    expect(assistantLaneFor('Apague a página 4', doc)).toBe('edit');
    expect(assistantLaneFor('traduza esta página', doc)).toBe('edit');
    expect(assistantLaneFor('crie uma página com a tabela comparativa', doc)).toBe('compose');
    expect(assistantLaneFor('troque o título', empty)).toBe('compose');
    expect(assistantLaneFor('monte um folder de duas páginas', doc)).toBe('compose');
    // A short answer to the edit lane's question stays there; never on a blank catalog, never for new pages.
    expect(assistantLaneFor('os selos de faixa', doc)).toBe('compose');
    expect(assistantLaneFor('os selos de faixa', doc, { followUp: true })).toBe('edit');
    expect(assistantLaneFor('os selos de faixa', empty, { followUp: true })).toBe('compose');
    expect(assistantLaneFor('crie uma página nova de contato', doc, { followUp: true })).toBe('compose');
  });
  it('natural language (Onda 4.5): "põe X no rodapé" and translations edit the open catalog; "põe uma tabela…" builds', () => {
    const doc = structuredClone(PCON);
    // A value written INTO the catalog goes where it can be refused (edit_intent), never to the composer.
    for (const message of ['coloca a exatidão do TA-25N no rodapé', 'poe a faixa de pressão do TA-25N na tabela',
      'preenche a tabela com os valores do PCON', 'bota a pressão máxima de cada modelo embaixo do título',
      'escreve a certificação ISO no rodapé', 'atualiza a exatidão pra do modelo novo']) {
      expect(assistantLaneFor(message, doc), message).toBe('edit');
    }
    for (const message of ['passa o subtítulo pro espanhol', 'coloca em inglês o texto de destaque', 'duplica essa página',
      'aplica o estilo de título nesse texto', 'pinta a faixa de vermelho']) {
      expect(assistantLaneFor(message, doc), message).toBe('edit');
    }
    for (const message of ['na página de especificações põe uma tabela comparando 3 modelos', 'insere o cabeçalho padrão',
      'insere a página de faixas de medição', 'faz uma capa pro TA-25N', 'bota uma tabla com 6 linhas']) {
      expect(assistantLaneFor(message, doc), message).toBe('compose');
    }
  });
  it('routes "build from these files" to the catalog plan and drawn pages to the Modo rascunho, only with those files here', () => {
    const doc = structuredClone(PCON);
    const files = { catalogFiles: true, sketchPhotos: true };
    expect(assistantRouteFor('Monte o catálogo a partir destes arquivos', doc, files)).toBe('catalog-draft');
    expect(assistantRouteFor('crie as páginas com estes PDFs', doc, files)).toBe('catalog-draft');
    expect(assistantRouteFor('Monte o catálogo a partir destes arquivos', doc)).toBe('compose');
    expect(assistantRouteFor('crie a página deste rascunho', doc, files)).toBe('sketch');
    expect(assistantRouteFor('crie a página deste rascunho', doc, { catalogFiles: true })).toBe('compose');
    // Changes on the open catalog keep going to edit_intent, even with files in the conversation.
    expect(assistantRouteFor('troque o título da capa para PCON-Y18', doc, files)).toBe('edit');
    expect(assistantRouteFor('mude a cor da faixa para azul claro', doc, files)).toBe('edit');
    expect(assistantRouteFor('apague a página 4', doc, files)).toBe('edit');
    expect(assistantRouteFor('aumente a foto da página 2', doc, files)).toBe('edit');
    expect(assistantRouteFor('os selos', doc, { ...files, editFollowUp: true })).toBe('edit');
    // The welcome suggestions still create pages.
    expect(assistantRouteFor('Crie uma página comparando três modelos, com uma tabela comparativa para eu preencher com os dados.', doc, files)).toBe('compose');
    expect(assistantRouteFor('Crie uma capa e uma apresentação profissional para este catálogo.', doc, files)).toBe('compose');
  });
  it('numberSources reads the numbers typed by the person and those of the outline', () => {
    const outline = buildDocumentOutline(structuredClone(PCON)).outline;
    const sources = numberSources(['coloque Y18'], outline);
    expect([...sources.conversation]).toEqual(['18']);
    expect(sources.document.has('250')).toBe(true);
    expect(plainRichText('x', 'a').paragraphs).toHaveLength(1);
  });
});

// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession, type DocumentSession } from '@/vnext/application';
import { CatalogDocumentSchema, type CatalogDocument, type Page, type TableObject } from '@/vnext/domain';
import { TO_FILL } from '@/vnext/library/presys-archetypes';
import { createPresysPageTemplateRegistry } from '@/vnext/library/presys-ta25n-starter';
import { createStaticPageTemplateRegistry } from '@/vnext/application/template-registry';
import { parsePlanDraftRequest, planToken } from '@/vnext/ai-catalog/catalog-plan-contract';
import { CatalogDraftPlanSchema, type CatalogDraftPlan } from '@/vnext/ai-catalog/contracts';
import {
  buildPlanBrief, catalogPlanEntries, checkCatalogPlan, defaultSelection, reviewPlanPages, type PlanSourceFile,
} from '@/vnext/ai-catalog/catalog-plan';
import { applyPagePlan, compilePagePlan, undoPagePlan } from '@/vnext/ai-catalog/page-plan-apply';
import { factSetFromReport, type DraftFactSet } from '@/vnext/ai-catalog/draft-compiler';
import type { ExtractedPdf } from '@/vnext/ai-catalog/pdf-intake';
import { folderReport } from './draft-compiler-fixture';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());

/** Real text of the TA folder (presys-ta-folder (4).pdf), pages 2, 9, 19 and 20, as pdf-intake reads it. */
const TA_PAGES: Record<number, string> = {
  2: 'Common features of our TA Advanced Series\nTA Temperature Calibrators\n5.7" Touch Screen Color Display. Dual Core 1 GHz processor and Flash memory of 16 GB.\n'
    + 'Electric Power Supply: 115 or 230 Vac, 50/60 Hz.\nInput Current: -1 to 24.5 mA, ± 0.01% FS.\nThe New TA Advanced Temperature Calibrators are the result of our 20 years experience in\ndry block calibrators manufacturing.',
  9: 'Technical Specifications\nTA-25N / TA-35N / TA-50N\nOperating Range\n-25 °C to +155 °C   -35 °C to +155 °C   -50 °C to +155 °C\nElectric Power:\n200 W   300 W   400 W\n'
    + 'Order Code\nPower Supply\n1   - 115 Vac   2   - 230 Vac\nNH   - No Hart Communication',
  19: 'Standard Delivery\n- 01 x Soft Carrying Case **\n- 01 x Insert Extractor\n- 01 x Power Cable\nOrder Code Description\nTiny Steel Balls Flask\nLead Cable Kit\n03.03.0144-00\n06.07.0025-00',
  20: 'Presys has an ISO/IEC 17025 accredited laboratory\nEF0585-13\nwww.presys.com.br',
};
const folderPdf = (): ExtractedPdf => ({
  fileName: 'presys-ta-folder (4).pdf', sha256: 'a'.repeat(64), pageCount: 20, truncated: false,
  pages: Array.from({ length: 20 }, (_, index) => {
    const text = TA_PAGES[index + 1] ?? '';
    return { number: index + 1, text, textLength: text.length, needsVisualExtraction: !text };
  }),
});
const FILES: PlanSourceFile[] = [{ id: 'arquivo-1', fileName: 'presys-ta-folder (4).pdf', pdf: folderPdf() }];
const literal = (id: number, text: string, page: number, fact = '') => ({ id, text, file: fact ? '' : 'arquivo-1', page: fact ? 0 : page, fact });
const page = (kind: CatalogDraftPlan['pages'][number]['kind'], texts: Record<string, string> = {},
  tables: CatalogDraftPlan['pages'][number]['tables'] = []): CatalogDraftPlan['pages'][number] => ({
  kind, purpose: `Página ${kind}`, sourcePages: [{ file: 'arquivo-1', page: 2 }],
  texts: Object.entries(texts).map(([slot, text]) => ({ slot, text })), tables,
});
const T = planToken;

async function setAndFacts() {
  const set = factSetFromReport((await folderReport()).report, { title: 'Especificações técnicas' });
  const built = buildPlanBrief({ files: FILES, set, photos: [{ id: 'p', fileName: 'ta-25n.jpg' }] });
  return { set, ...built };
}
function planOf(pages: CatalogDraftPlan['pages'], literals: CatalogDraftPlan['literals'], questions: string[] = []): CatalogDraftPlan {
  return CatalogDraftPlanSchema.parse({ title: 'Série TA', pages, literals, questions });
}

describe('buildPlanBrief: what goes to plan_draft', () => {
  it('sends the page texts and only the facts checked against the PDF, in the shape the server accepts', async () => {
    const { set, brief, facts } = await setAndFacts();
    expect(parsePlanDraftRequest({ version: 1, task: 'plan_draft', brief })).not.toBeNull();
    expect(brief.models).toEqual(['TA-25N', 'TA-35N', 'TA-50N']);
    expect(brief.files[0].pages.map(item => item.page)).toEqual([2, 9, 19, 20]);
    expect(brief.photos).toEqual([{ id: 'foto-1', name: 'ta-25n.jpg' }]);
    // Resolution is VISUAL_ONLY in the fixture: it is not offered to the AI.
    expect(brief.facts.map(fact => fact.label)).not.toContain('Resolution');
    expect(brief.facts.find(fact => fact.label === 'Electric Power' && fact.model === 'TA-35N')?.value).toBe('300 W');
    for (const fact of brief.facts) expect(set.positions.some(position => position.id === facts.get(fact.id))).toBe(true);
  });
});

describe('checkCatalogPlan: nothing invented reaches a page', () => {
  it('writes each literal as printed when it is on the cited page, and says where it came from', async () => {
    const { set, facts } = await setAndFacts();
    const plan = planOf([page('visao_geral', { 'P2.intro': `Tela colorida de ${T(0)} sensível ao toque e ${T(1)} de experiência.` })],
      [literal(0, '5.7"', 2), literal(1, '20 years', 2)]);
    const checked = checkCatalogPlan(plan, { files: FILES, set, facts });
    const intro = checked.pages.find(item => item.kind === 'visao_geral')!.fields[0];
    expect(intro).toMatchObject({ status: 'ok', text: 'Tela colorida de 5.7" sensível ao toque e 20 years de experiência.' });
    expect(intro.uses.map(use => use.where)).toEqual(['presys-ta-folder (4).pdf · página 2', 'presys-ta-folder (4).pdf · página 2']);
  });

  it('rejects a text with a digit outside a token (the field keeps "A COMPLETAR")', async () => {
    const { set, facts } = await setAndFacts();
    const plan = planOf([page('visao_geral', { 'P2.intro': 'Calibrador com 30 anos de garantia.', 'P2.highlights-title': 'Destaques' })], []);
    const checked = checkCatalogPlan(plan, { files: FILES, set, facts });
    const fields = checked.pages.find(item => item.kind === 'visao_geral')!.fields;
    expect(fields.find(field => field.slot === 'P2.intro')).toMatchObject({ status: 'rejected' });
    expect(fields.find(field => field.slot === 'P2.intro')!.text).toBeUndefined();
    expect(fields.find(field => field.slot === 'P2.intro')!.message).toContain('número sem dizer de onde ele veio');
    expect(checked.counts.rejected).toBe(1);
    const entries = catalogPlanEntries(checked, defaultSelection(checked), set);
    const overview = entries.find(entry => entry.key === checked.pages.find(item => item.kind === 'visao_geral')!.key)!;
    expect(overview.kind === 'template' && Object.keys(overview.fills)).toEqual(['P2.highlights-title']);
  });

  it('leaves a literal that is not in the file as "A COMPLETAR" and lists it', async () => {
    const { set, facts } = await setAndFacts();
    const plan = planOf([page('capa', { 'P1.tagline': `Exatidão de ${T(0)}` })], [literal(0, '± 0.005 °C', 9)]);
    const checked = checkCatalogPlan(plan, { files: FILES, set, facts });
    const tagline = checked.pages[0].fields[0];
    expect(tagline).toMatchObject({ status: 'pending', text: `Exatidão de ${TO_FILL}` });
    expect(tagline.message).toContain('“± 0.005 °C” não foi achado em presys-ta-folder (4).pdf · página 9');
    expect(checked.counts).toMatchObject({ checked: 0, notFound: 1 });
  });

  it('takes a fact literal from the checked fact itself, and never an unchecked one', async () => {
    const { set, brief, facts } = await setAndFacts();
    const power = brief.facts.find(fact => fact.label === 'Electric Power' && fact.model === 'TA-50N')!;
    const plan = planOf([page('capa', { 'P1.tagline': `Até ${T(0)} de potência`, 'P1.series': `Série ${T(1)}` })],
      [literal(0, '999 W', 0, power.id), literal(1, '0.01', 0, 'f99')]);
    const checked = checkCatalogPlan(plan, { files: FILES, set, facts });
    expect(checked.pages[0].fields.find(field => field.slot === 'P1.tagline')).toMatchObject({ status: 'ok', text: 'Até 400 W de potência' });
    expect(checked.pages[0].fields.find(field => field.slot === 'P1.tagline')!.uses[0].where).toBe('valor conferido da tabela: Electric Power · TA-50N');
    expect(checked.pages[0].fields.find(field => field.slot === 'P1.series')).toMatchObject({ status: 'pending', text: `Série ${TO_FILL}` });
  });

  it('accepts the product names of the brief without a token, and a literal found on another page of the same file', async () => {
    const { set, facts } = await setAndFacts();
    const plan = planOf([page('capa', { 'P1.model': 'TA-25N / TA-35N', 'P1.tagline': `Rede ${T(0)}` })], [literal(0, '50/60 Hz', 9)]);
    const checked = checkCatalogPlan(plan, { files: FILES, set, facts });
    expect(checked.pages[0].fields.map(field => [field.slot, field.status, field.text])).toEqual([
      ['P1.model', 'ok', 'TA-25N / TA-35N'], ['P1.tagline', 'ok', 'Rede 50/60 Hz']]);
    expect(checked.pages[0].fields[1].uses[0].where).toBe('presys-ta-folder (4).pdf · página 2');
  });

  it('never takes the specification table from the plan, and adds cover, specifications and back cover in place', async () => {
    const { set, facts } = await setAndFacts();
    const plan = planOf([page('fornecimento_acessorios', { 'P7.title': 'Fornecimento' }), page('especificacoes', { 'P2.intro': 'x' })], []);
    const checked = checkCatalogPlan(plan, { files: FILES, set, facts });
    expect(checked.pages.map(item => [item.kind, item.addedByApp])).toEqual([
      ['capa', true], ['fornecimento_acessorios', false], ['especificacoes', false], ['contracapa', true]]);
    expect(checked.pages.find(item => item.kind === 'especificacoes')).toMatchObject({ specTable: true, fields: [] });
    const without = checkCatalogPlan(planOf([page('contracapa'), page('capa')], []), { files: FILES, set, facts });
    expect(without.pages.map(item => [item.kind, item.addedByApp])).toEqual([['capa', false], ['especificacoes', true], ['contracapa', false]]);
  });

  it('lists one item per line in the highlights and the delivery, and checks every table cell', async () => {
    const { set, facts } = await setAndFacts();
    const plan = planOf([
      page('visao_geral', { 'P2.highlights': `• Tela de ${T(0)}\n• Memória de ${T(1)}\n\n- Relatório automático` }),
      page('fornecimento_acessorios', { 'P7.delivery': `${T(2)} Maleta de transporte\n${T(2)} Extrator de inserto` }, [{
        slot: 'P7.accessories', header: ['Descrição', 'Código de pedido'], notes: [],
        rows: [{ section: '', cells: ['Frasco de esferas', T(3)] }, { section: '', cells: ['Kit de cabos', '06.07.0025-00'] }],
      }]),
    ], [literal(0, '5.7"', 2), literal(1, '16 GB', 2), literal(2, '01 x', 19), literal(3, '03.03.0144-00', 19)]);
    const checked = checkCatalogPlan(plan, { files: FILES, set, facts });
    const overview = checked.pages.find(item => item.kind === 'visao_geral')!.fields[0];
    expect(overview.text).toBe('▸ Tela de 5.7"\n▸ Memória de 16 GB\n▸ Relatório automático');
    const delivery = checked.pages.find(item => item.kind === 'fornecimento_acessorios')!;
    expect(delivery.fields[0].text).toBe('– 01 x Maleta de transporte\n– 01 x Extrator de inserto');
    // The second code was written without a token: that cell is not taken.
    expect(delivery.fields[1]).toMatchObject({ status: 'pending',
      table: { header: ['Descrição', 'Código de pedido'], rows: [['Frasco de esferas', '03.03.0144-00'], ['Kit de cabos', TO_FILL]] } });
  });
});

/* ------------------------------------------------------------------------------------------------------------ */

let serial = 0;
const createId = () => `id-${(++serial).toString(36).padStart(5, '0')}`;
function blankSession(): DocumentSession {
  return createDocumentSession(createCatalogDocument(createId, 'Catálogo TA'), { createId, templateRegistry: createPresysPageTemplateRegistry() });
}
const plainTexts = (pageItem: Page) => pageItem.objects.flatMap(object => object.type === 'text'
  ? [object.text.paragraphs.map(paragraph => paragraph.inlines.map(inline => inline.kind === 'text' ? inline.text : '').join('')).join('\n')] : []);
async function fullPlan() {
  const { set, facts } = await setAndFacts();
  const plan = planOf([
    page('capa', { 'P1.family': 'Calibradores de temperatura', 'P1.series': 'Série TA Avançada', 'P1.model': 'TA-25N / TA-35N' }),
    page('visao_geral', { 'P2.intro': `Tela de ${T(0)} sensível ao toque.`, 'P2.highlights': `Memória de ${T(1)}\nRelatório automático` }),
    page('especificacoes'),
    page('codigo_pedido', { 'P6.skeleton': 'TA-25N / TA-35N / TA-50N - [ ] - IN [ ]' }, [{ slot: 'P6.options', header: ['Código', 'Significado'], notes: [],
      rows: [{ section: 'Alimentação', cells: [] }, { section: '', cells: [T(2), T(3)] }] }]),
    page('contracapa', { 'P9.document-code': T(4) }),
  ], [literal(0, '5.7"', 2), literal(1, '16 GB', 2), literal(2, '1', 9), literal(3, '115 Vac', 9), literal(4, 'EF0585-13', 20)]);
  const checked = checkCatalogPlan(plan, { files: FILES, set, facts });
  return { set, checked };
}

describe('aplicar plano de páginas: the whole catalog in ONE Desfazer', () => {
  it('inserts the model pages and the compiled specification table, replacing the empty first page', async () => {
    const { set, checked } = await fullPlan();
    const session = blankSession();
    const before = session.getSnapshot().document;
    const compiled = compilePagePlan(before, catalogPlanEntries(checked, defaultSelection(checked), set), { transactionId: 'plano-ta' });
    const outcome = applyPagePlan(session, compiled);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const document = session.getSnapshot().document;
    expect(CatalogDocumentSchema.safeParse(document).success).toBe(true);
    // Capa, Visão geral, the table page, Código de pedido, Contracapa; the empty page 1 is gone.
    expect(document.pages).toHaveLength(5);
    expect(document.pages.some(item => item.id === before.pages[0].id)).toBe(false);
    expect(outcome.applied.message).toContain('Catálogo montado: 5 páginas nas páginas 1 a 5.');
    const [cover, overview, specs, order, back] = document.pages;
    expect(plainTexts(cover)).toEqual(expect.arrayContaining(['Calibradores de temperatura', 'Série TA Avançada', 'TA-25N / TA-35N']));
    // An unfilled field keeps the model's marker.
    expect(plainTexts(cover).some(text => text.includes(TO_FILL))).toBe(true);
    expect(plainTexts(overview)).toEqual(expect.arrayContaining(['Tela de 5.7" sensível ao toque.', '▸ Memória de 16 GB\n▸ Relatório automático']));
    expect(cover.safeArea).toEqual({ topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 });
    const specTable = specs.objects.find((object): object is TableObject => object.type === 'table')!;
    const values = specTable.table.cells.flatMap(cell => cell.content.type === 'richText'
      ? [cell.content.value.paragraphs.map(paragraph => paragraph.inlines.map(inline => inline.kind === 'text' ? inline.text : '').join('')).join('')] : []);
    expect(values).toEqual(expect.arrayContaining(['200 W', '300 W', '400 W', '-50 °C to +155 °C']));
    const orderTable = order.objects.find((object): object is TableObject => object.type === 'table')!;
    expect(orderTable.table.rows).toHaveLength(3);
    expect(plainTexts(back)).toContain('EF0585-13');

    // One Desfazer takes the whole catalog back.
    expect(undoPagePlan(session, outcome.applied)).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);
    expect(session.getSnapshot().canUndo).toBe(false);
  });

  it('keeps only the pages the person kept, in the order chosen', async () => {
    const { set, checked } = await fullPlan();
    const session = blankSession();
    const keys = defaultSelection(checked);
    const kept = [keys[0], keys[3], keys[1]];
    const compiled = compilePagePlan(session.getSnapshot().document, catalogPlanEntries(checked, kept, set));
    const outcome = applyPagePlan(session, compiled);
    expect(outcome.ok && outcome.applied.pageIds).toHaveLength(3);
    const texts = session.getSnapshot().document.pages.map(plainTexts);
    expect(texts[1]).toContain('TA-25N / TA-35N / TA-50N - [ ] - IN [ ]');
    expect(texts[2]).toContain('Tela de 5.7" sensível ao toque.');
  });

  it('goes after the open page of a catalog with content, and keeps that page', async () => {
    const { set, checked } = await fullPlan();
    const session = blankSession();
    const first = session.getSnapshot().document.pages[0];
    session.execute({ type: 'page.template.insert', templateId: 'presys-p9-contracapa', afterPageId: first.id });
    session.execute({ type: 'page.delete', pageId: first.id });
    const before = session.getSnapshot().document;
    const compiled = compilePagePlan(before, catalogPlanEntries(checked, [defaultSelection(checked)[0]], set), { afterPageId: before.pages[0].id });
    expect(compiled.replacesEmptyPage).toBe(false);
    expect(applyPagePlan(session, compiled).ok).toBe(true);
    expect(session.getSnapshot().document.pages.map(item => item.id).slice(0, 1)).toEqual([before.pages[0].id]);
    expect(session.getSnapshot().document.pages).toHaveLength(2);
  });

  it('changes nothing when a step is refused (the rehearsal fails first) or the catalog changed meanwhile', async () => {
    const { set, checked } = await fullPlan();
    const session = blankSession();
    const before = session.getSnapshot().document;
    const compiled = compilePagePlan(before, catalogPlanEntries(checked, defaultSelection(checked), set));
    const refused = applyPagePlan(session, compiled, { templateRegistry: createStaticPageTemplateRegistry([]) });
    expect(refused).toEqual({ ok: false, message: 'Não foi possível montar as páginas. Nada foi alterado.' });
    expect(session.getSnapshot().document).toBe(before);

    session.execute({ type: 'page.template.insert', templateId: 'presys-p2-visao-geral', afterPageId: before.pages[0].id });
    session.execute({ type: 'page.delete', pageId: before.pages[0].id });
    const stale = applyPagePlan(session, compiled);
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.message).toContain('O catálogo mudou');
  });

  it('offers Desfazer only while the plan is still the last change', async () => {
    const { set, checked } = await fullPlan();
    const session = blankSession();
    const outcome = applyPagePlan(session, compilePagePlan(session.getSnapshot().document, catalogPlanEntries(checked, defaultSelection(checked), set)));
    if (!outcome.ok) throw new Error(outcome.message);
    const document: CatalogDocument = session.getSnapshot().document;
    session.execute({ type: 'document.rename', title: 'Outro nome' });
    expect(undoPagePlan(session, outcome.applied)).toBe(false);
    expect(session.getSnapshot().document.pages).toEqual(document.pages);
  });

  it('reads each page as it will be applied: fields to complete, photos to choose, text that may not fit', async () => {
    const { set, checked } = await fullPlan();
    const document = createCatalogDocument(createId, 'x');
    const compiled = compilePagePlan(document, catalogPlanEntries(checked, defaultSelection(checked), set));
    const reviews = reviewPlanPages(checked, compiled);
    const cover = reviews.find(review => review.key === checked.pages[0].key)!;
    expect(cover.toComplete).toEqual(['Frase de destaque']);
    expect(cover.photos).toEqual(['Logotipo da PRESYS', 'Foto principal do produto']);
    const long = planOf([page('capa', { 'P1.tagline': 'Calibração rápida e precisa, com relatório ao fim de cada tarefa' })], []);
    const longChecked = checkCatalogPlan(long, { files: FILES, set: set as DraftFactSet, facts: new Map() });
    const longReview = reviewPlanPages(longChecked, compilePagePlan(document, catalogPlanEntries(longChecked, [longChecked.pages[0].key], set)));
    expect(longReview[0].mayOverflow).toEqual(['Frase de destaque']);
  });
});

import { z } from 'zod';
import { createCatalogDocument, createDocumentSession, createStaticPageTemplateRegistry, parseCanonicalDocument, type DocumentSession } from '../application';
import type { PageTemplateDefinition } from '../application/template-registry';
import { materializeTablePreset } from '../application/table-preset-registry';
import { sha256 } from '../asset/integrity';
import { type CatalogDocument, type RichText, type TableModel } from '../domain';
import { decisionKey, selectedValue, reviewIssues, validateTechnicalInput, type Decisions, type TechnicalInput } from './contracts';
import { institutionalOpening, institutionalClosing } from './institutional-pages';

export const CatalogPlanSchema = z.object({
  version: z.literal(1), template: z.enum(['comparison-a4-v1', 'institutional-technical-a4-v1']), style: z.enum(['comparison', 'technical-specification']),
  sectionOrder: z.array(z.string()).min(1).max(16), rowsPerPage: z.literal(8),
}).strict();
export type CatalogPlan = z.infer<typeof CatalogPlanSchema>;
export interface GeneratedCatalog { input: TechnicalInput; decisions: Decisions; plan: CatalogPlan; document: CatalogDocument }
export interface TechnicalCellTrace { cellId: string; factId: string; label: string; section: string; model: string; value: string; unit: string; condition: string; source?: { sourceId: string; page: number; quote: string }; status: string }

/** Simulated provider: allowlisted presentation, no model/service or inference. */
export function mockCatalogPlan(input: TechnicalInput): CatalogPlan {
  return { version: 1, template: 'comparison-a4-v1', style: 'comparison', sectionOrder: input.sections.map(section => section.id), rowsPerPage: 8 };
}
export function planMockRequest(input: TechnicalInput, request: string): CatalogPlan {
  const text = request.trim().toLocaleLowerCase('pt-BR').replace(/\.$/, '');
  const plan = mockCatalogPlan(input);
  // Deterministic fallback for the documented natural-language QA scenario.
  // Gemini must still return a schema-validated plan in live mode.
  if (text === 'crie um cat\u00e1logo institucional extenso com tabelas t\u00e9cnicas' ||
      text === 'monte um caderno institucional comparativo com sum\u00e1rio e fontes') {
    return { ...plan, template: 'institutional-technical-a4-v1', style: 'technical-specification' };
  }
  if (text === 'crie uma comparação por seção' || text === 'crie uma comparação profissional dos três modelos, separando as especificações elétricas') return plan;
  if (text === 'comece pelas especificações elétricas' && input.sections.some(section => section.id === 'electrical')) return { ...plan, sectionOrder: ['electrical', ...plan.sectionOrder.filter(id => id !== 'electrical')] };
  throw new Error('REQUEST_NOT_SUPPORTED');
}
function checkedPlan(input: TechnicalInput, raw: unknown): CatalogPlan {
  const plan = CatalogPlanSchema.parse(raw), expected = new Set(input.sections.map(section => section.id));
  if (plan.sectionOrder.length !== expected.size || new Set(plan.sectionOrder).size !== expected.size || plan.sectionOrder.some(id => !expected.has(id))) throw new Error('PLAN_SECTION_COVERAGE');
  return plan;
}
const rich = (id: string, text: string): RichText => ({ paragraphs: text.split('\n').map((line, index) => ({ id: `${id}:p${index}`, inlines: line ? [{ kind: 'text', id: `${id}:t${index}`, text: line, marks: [] }] : [] })) });
export function richTextLiteral(value: RichText): string { return value.paragraphs.map(p => p.inlines.map(i => i.kind === 'text' ? i.text : '\n').join('')).join('\n'); }
export function tableMatrix(table: TableModel): string[][] {
  return table.rows.map(row => table.columns.map(column => {
    const cell = table.cells.find(cell => cell.rowId === row.id && cell.columnId === column.id);
    if (!cell || cell.coveredBy) throw new Error('GENERATION_CELL_TOPOLOGY');
    if (cell.content.type === 'empty') return '';
    if (cell.content.type !== 'richText') throw new Error('GENERATION_CELL_TYPE');
    return richTextLiteral(cell.content.value);
  }));
}
function chunks(input: TechnicalInput, plan: CatalogPlan) {
  return plan.sectionOrder.flatMap(sectionId => {
    const index = input.sections.findIndex(section => section.id === sectionId), section = input.sections[index];
    const result = [];
    for (let start = 0; start < section.rows.length; start += plan.rowsPerPage) result.push({ index, section, start, rows: section.rows.slice(start, start + plan.rowsPerPage) });
    return result;
  });
}
function matrixFor(input: TechnicalInput, decisions: Decisions, chunk: ReturnType<typeof chunks>[number]) {
  return [['Característica', ...input.models, 'Unidade', 'Condição / observação'], ...chunk.rows.map((row, offset) => [
    row.label, ...input.models.map((_, model) => selectedValue(input, chunk.index, chunk.start + offset, model, decisions).value), row.unit, row.condition,
  ])];
}

export async function compileCatalog(raw: unknown, rawPlan?: unknown, decisions: Decisions = {}, createId = () => crypto.randomUUID()): Promise<GeneratedCatalog> {
  const input = await validateTechnicalInput(raw), plan = checkedPlan(input, rawPlan ?? mockCatalogPlan(input));
  const allowedDecisions = new Map(reviewIssues(input, {}).map(issue => [issue.id, issue.fact]));
  for (const [id, choice] of Object.entries(decisions)) {
    const fact = allowedDecisions.get(id);
    if (!fact || (fact.status === 'missing' ? choice !== 'missing' : typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice >= fact.candidates.length)) throw new Error('REVIEW_DECISION_INVALID');
  }
  const blank = createCatalogDocument(createId, input.title);
  // Approved existing palette/presets, with a light section fill for this specimen.
  blank.style.palette = ['#172033', '#003366', '#EDF5FF', '#FFFFFF'];
  const technicalChunks = chunks(input, plan);
  const institutional = plan.template === 'institutional-technical-a4-v1';
  const pageCount = technicalChunks.length + (institutional ? 3 : 0);
  const technicalPages: PageTemplateDefinition[] = technicalChunks.map((chunk, page) => {
    const id = `generated-${page}`, matrix = matrixFor(input, decisions, chunk), count = input.models.length;
    // Allocate real physical width to all four data columns and wrap notes normally.
    // Both the old 30 mm notes column and the later 17.25 mm model columns
    // caused genuine Chromium/Linux publication blockers. Preserve typography.
    let table: TableModel = {
      id, columns: matrix[0].map((_, col) => ({ id: `${id}-col${col}`, width: col === 0 ? { mode: 'fixed', mm: count === 4 ? 31 : 44 } : col === count + 1 ? { mode: 'fixed', mm: count === 4 ? 20 : 20 } : col === count + 2 ? { mode: 'fixed', mm: count === 4 ? 35 : 38 } : { mode: 'flex', weight: 1 }, minMm: 16 })),
      rows: matrix.map((_, row) => ({ id: `${id}-row${row}`, role: row === 0 ? 'header' : 'body', heightPolicy: { mode: 'AUTO' } })),
      cells: matrix.flatMap((values, row) => values.map((value, col) => ({ id: `${id}-r${row}c${col}`, rowId: `${id}-row${row}`, columnId: `${id}-col${col}`, content: value ? { type: 'richText' as const, value: rich(`${id}-r${row}c${col}`, value) } : { type: 'empty' as const } }))),
      style: { base: {}, rowRoles: {}, annotation: {}, annotationGapMm: 1 }, annotations: [], legend: [],
    };
    table = materializeTablePreset(table, blank.style, plan.style);
    const text = (value: string, yMm: number, heightMm: number, size: number, bold = false) => ({ type: 'text' as const, frame: { xMm: 17, yMm, widthMm: 176, heightMm }, zIndex: 0, text: rich(`${id}-text${yMm}`, value), style: { fontFamily: 'Noto Sans', fontSizePt: size, fontWeight: bold ? 700 as const : 400 as const, lineHeight: 1.25, color: bold ? '#003366' : '#172033' } });
    return { id, label: chunk.section.title, safeArea: { topMm: 12, rightMm: 12, bottomMm: 12, leftMm: 12 }, objects: [
      text('PRESYS · Estudo de catálogo', 14, 9, 12, true), text(input.title, 27, 16, 17, true),
      text(`${chunk.section.title}${chunk.start ? ' · continuação' : ''}`, 46, 10, 12, true),
      { type: 'table', frame: { xMm: 17, yMm: 62, widthMm: 176, heightMm: 173 }, zIndex: 1, table },
      text('Dados sintéticos originais. Não representam especificações de produtos PRESYS.', 247, 13, 9),
      text(`Fontes: ${input.sources.map(source => `${source.id} (rev. ${source.revision})`).join('; ')}.\n${page + (institutional ? 3 : 1)} / ${pageCount} · Conferir dados aprovados antes de publicar.`, 266, 17, 8),
    ] };
  });
  const definitions: PageTemplateDefinition[] = [
    ...(institutional ? institutionalOpening(input, technicalChunks.length) : []),
    ...technicalPages,
    ...(institutional ? institutionalClosing(input) : []),
  ];
  const session = createDocumentSession(blank, { createId, templateRegistry: createStaticPageTemplateRegistry(definitions) });
  for (const definition of definitions) {
    const pages = session.getSnapshot().document.pages;
    const result = session.execute({ type: 'page.template.insert', templateId: definition.id, afterPageId: pages[pages.length - 1].id }, { transactionId: 'generation' });
    if (!result.ok) throw new Error(result.error.code);
  }
  const removed = session.execute({ type: 'page.delete', pageId: blank.pages[0].id }, { transactionId: 'generation' });
  if (!removed.ok) throw new Error(removed.error.code);
  const document = parseCanonicalDocument(session.getSnapshot().document);
  assertGeneratedIntegrity({ input, decisions, plan, document });
  return { input, decisions: { ...decisions }, plan, document };
}

/** Every model value, label, unit and condition must match the complete selected input matrix. */
export function assertGeneratedIntegrity(value: GeneratedCatalog): TechnicalCellTrace[] {
  const plan = checkedPlan(value.input, value.plan), parts = chunks(value.input, plan), trace: TechnicalCellTrace[] = [];
  parseCanonicalDocument(value.document);
  const offset = plan.template === 'institutional-technical-a4-v1' ? 2 : 0;
  const expectedPages = parts.length + (offset ? 3 : 0);
  if (value.document.pages.length !== expectedPages) throw new Error('GENERATION_PAGE_COVERAGE');
  if (offset) {
    for (const index of [0, 1, expectedPages - 1]) {
      if (value.document.pages[index].objects.some(object => object.type === 'table')) throw new Error('GENERATION_UNEXPECTED_TABLE');
    }
    const literalText = (page: number) => value.document.pages[page].objects
      .filter(object => object.type === 'text')
      .map(object => object.type === 'text' ? richTextLiteral(object.text) : '')
      .join('\n');
    if (!literalText(0).includes(value.input.title) ||
      value.input.models.some(model => !literalText(0).includes(model)) ||
      value.input.sections.some(section => !literalText(1).includes(section.title)) ||
      value.input.sources.some(source => !literalText(expectedPages - 1).includes(source.id))) {
      throw new Error('GENERATION_INSTITUTIONAL_CONTENT_MISMATCH');
    }
  }
  parts.forEach((chunk, page) => {
    const objects = value.document.pages[page + offset].objects.filter(object => object.type === 'table');
    if (objects.length !== 1 || objects[0].type !== 'table') throw new Error('GENERATION_TABLE_COVERAGE');
    const table = objects[0].table;
    if (JSON.stringify(tableMatrix(table)) !== JSON.stringify(matrixFor(value.input, value.decisions, chunk))) throw new Error('GENERATION_VALUE_MISMATCH');
    chunk.rows.forEach((row, offset) => value.input.models.forEach((model, modelIndex) => {
      const selected = selectedValue(value.input, chunk.index, chunk.start + offset, modelIndex, value.decisions);
      const cell = table.cells.find(cell => cell.rowId === table.rows[offset + 1].id && cell.columnId === table.columns[modelIndex + 1].id)!;
      trace.push({ cellId: cell.id, factId: decisionKey(chunk.section.id, row.id, modelIndex), label: row.label, section: chunk.section.title, model, value: selected.value, unit: row.unit, condition: row.condition, status: selected.status, ...('source' in selected ? { source: selected.source } : {}) });
    }));
  });
  return trace;
}
export async function generationHash(value: GeneratedCatalog): Promise<string> {
  const captured = structuredClone(value);
  await validateTechnicalInput(captured.input); assertGeneratedIntegrity(captured);
  return sha256(JSON.stringify(captured));
}
export async function approveGeneration(value: GeneratedCatalog): Promise<string> {
  if (reviewIssues(value.input, value.decisions).some(issue => !issue.resolved)) throw new Error('UNRESOLVED_TECHNICAL_REVIEW');
  return generationHash(value);
}

export type Refinement = 'compact' | 'electrical-first';
export function proposeRefinement(request: string): Refinement {
  const text = request.trim().toLocaleLowerCase('pt-BR');
  if (text === 'deixe mais compacto' || text === 'deixe mais compacto.') return 'compact';
  if (text === 'separe as especificações elétricas' || text === 'separe as especificações elétricas.') return 'electrical-first';
  throw new Error('REQUEST_NOT_SUPPORTED');
}
/** Existing CAS commands + coalesced session history. No value edits are emitted. */
export function applyRefinement(session: DocumentSession, proposal: Refinement) {
  z.enum(['compact', 'electrical-first']).parse(proposal);
  const before = session.getSnapshot().document, transactionId = crypto.randomUUID();
  if (proposal === 'electrical-first') throw new Error('REFINEMENT_REQUIRES_NEW_PLAN_REVIEW');
  const actions = before.pages.flatMap(page => page.objects.flatMap(object => object.type === 'table' ? [{
    type: 'table.style.setBase' as const, pageId: page.id, objectId: object.id, tableId: object.table.id, expectedBase: object.table.style.base,
    patch: { paddingMm: { top: 0.8, right: 0.8, bottom: 0.8, left: 0.8 } },
  }] : []));
  // Validate the complete candidate first to prevent partial mutation.
  const candidate = createDocumentSession(before, { createId: () => crypto.randomUUID() });
  for (const action of actions) if (!candidate.execute(action).ok) throw new Error('REFINEMENT_INVALID');
  for (const action of actions) if (!session.execute(action, { transactionId }).ok) throw new Error('REFINEMENT_STALE');
}

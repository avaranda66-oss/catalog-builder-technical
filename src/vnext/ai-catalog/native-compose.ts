import { z } from 'zod';
import { createDocumentSession, type DocumentSession } from '../application';
import { mmToU, plainRichText, type CatalogDocument, type TableModel } from '../domain';
import { createSizedEmptyTable } from '../app/editor-defaults';

/**
 * A creative, bounded editorial draft, not an AI-authored engineering record.
 * Technical quantities, product claims and citations are intentionally absent.
 * Source-backed technical-cell authoring requires the separate reviewed PDF lane.
 */
const prose = z.string().trim().min(1).max(150).refine(value =>
  ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127));
export const ComposePageSchema = z.object({
  type: z.enum(['cover', 'section', 'comparison']),
  heading: prose,
  subtitle: prose.optional(),
  table: z.object({
    columns: z.array(prose).min(2).max(6),
    rowLabels: z.array(prose).min(1).max(12),
  }).strict().optional(),
}).strict().superRefine((page, ctx) => {
  if (page.type === 'comparison' && !page.table) ctx.addIssue({ code: 'custom', message: 'COMPARISON_NEEDS_TABLE' });
  if (page.type !== 'comparison' && page.table) ctx.addIssue({ code: 'custom', message: 'TABLE_ONLY_IN_COMPARISON' });
});
export const NativeComposePlanSchema = z.object({
  version: z.literal(1),
  status: z.literal('proposal'),
  summary: z.string().trim().min(6).max(260),
  pages: z.array(ComposePageSchema).min(1).max(4),
}).strict();
export type NativeComposePlan = z.infer<typeof NativeComposePlanSchema>;

export const NativeComposeRequestSchema = z.object({
  version: z.literal(1), task: z.literal('compose_scaffold'),
  message: z.string().trim().min(8).max(1800),
  history: z.array(z.object({ role: z.enum(['user','assistant']),
    message: z.string().trim().min(1).max(800) }).strict()).max(8),
  document: z.object({ title: prose, pages: z.number().int().min(1).max(250),
    currentPageHeadings: z.array(prose).max(12) }).strict(),
}).strict();
export type NativeComposeRequest = z.infer<typeof NativeComposeRequestSchema>;
export const NativeComposeReplySchema = z.discriminatedUnion('status', [
  NativeComposePlanSchema,
  z.object({ status: z.literal('clarification'),
    question: z.string().trim().min(8).max(250) }).strict(),
]);
export type NativeComposeReply = z.infer<typeof NativeComposeReplySchema>;
export type NativeComposeGateway = (request: NativeComposeRequest) => Promise<unknown>;

export function prepareNativeComposeRequest(
  document: CatalogDocument, message: string,
  history: NativeComposeRequest['history'] = [],
): NativeComposeRequest {
  // A text object may itself contain confidential engineering facts. Never
  // harvest existing page contents into provider context by default.
  // Explicit user messages can share only what the author chose to type.
  const headings: string[] = [];
  // No engineering values, PDF quotes, images, assets or credentials are
  // automatically sent as document context in this route.
  return NativeComposeRequestSchema.parse({
    version: 1, task: 'compose_scaffold', message,
    history: history.slice(-8), document: {
      title: document.title.slice(0, 150), pages: document.pages.length,
      currentPageHeadings: headings,
    },
  });
}

export function verifyNativeComposeReply(untrusted: unknown): NativeComposeReply {
  const reply = NativeComposeReplySchema.parse(untrusted);
  if (reply.status === 'proposal') {
    const cells = reply.pages.reduce((total, page) =>
      total + (page.table?.columns.length ?? 0) * ((page.table?.rowLabels.length ?? 0) + 1), 0);
    if (cells > 156) throw new Error('AI_SCAFFOLD_CELL_CAP');
  }
  return reply;
}

export async function requestNativeCompose(
  document: CatalogDocument, message: string,
  gateway: NativeComposeGateway, history: NativeComposeRequest['history'] = [],
): Promise<NativeComposeReply> {
  return verifyNativeComposeReply(await gateway(prepareNativeComposeRequest(document, message, history)));
}

const asFrame = (xMm: number, yMm: number, widthMm: number, heightMm: number) =>
  ({ xU: mmToU(xMm), yU: mmToU(yMm), widthU: mmToU(widthMm), heightU: mmToU(heightMm) });
const headingStyle = (large: boolean) => ({
  fontFamily: 'Noto Sans', fontSizePt: large ? 22 : 16,
  lineHeight: 1.2, fontWeight: 700 as const, color: '#003366', textAlign: 'left' as const,
});

function scaffoldTable(page: z.infer<typeof ComposePageSchema>): TableModel {
  if (!page.table) throw new Error('SCAFFOLD_MISSING_TABLE');
  const { columns, rowLabels } = page.table;
  const table = createSizedEmptyTable({ rows: rowLabels.length + 1, columns: columns.length });
  return {
    ...table,
    rows: table.rows.map((row, i) => ({ ...row, role: i === 0 ? 'header' as const : 'body' as const })),
    columns: table.columns.map(col => ({ ...col, width: { mode: 'flex' as const, weight: 1 }, minMm: 15 })),
    cells: table.cells.map(cell => {
      const ri = table.rows.findIndex(row => row.id === cell.rowId);
      const ci = table.columns.findIndex(col => col.id === cell.columnId);
      const text = ri === 0 ? columns[ci] : ci === 0 ? rowLabels[ri - 1] : '';
      return { ...cell, content: text
        ? { type: 'richText' as const, value: plainRichText(cell.id + ':draft', text) }
        : { type: 'empty' as const } };
    }),
  };
}

/** Preflight a complete draft in isolation, then commit through canonical CAS actions. */
export function applyNativeCompose(session: DocumentSession, rawPlan: unknown, expectedRevision: number): {
  pagesAdded: number; tablesAdded: number; revision: number;
} {
  const plan = NativeComposePlanSchema.parse(rawPlan);
  const before = session.getSnapshot();
  if (before.localSequence !== expectedRevision) throw new Error('SCAFFOLD_STALE_DOCUMENT');
  const reuseBlankFirstPage = before.document.pages.length === 1 &&
    before.document.pages[0].objects.length === 0;
  const newPages = plan.pages.length - (reuseBlankFirstPage ? 1 : 0);
  if (before.document.pages.length + newPages > 250) throw new Error('SCAFFOLD_PAGE_CAP');

  const run = (target: DocumentSession, transactionId: string) => {
    let previousId = target.getSnapshot().document.pages.at(-1)?.id;
    if (!previousId) throw new Error('SCAFFOLD_INVALID_TARGET');
    let tables = 0;
    for (const [index, page] of plan.pages.entries()) {
      let newPage;
      if (reuseBlankFirstPage && index === 0) {
        // Starting a new catalog should not leave an empty cover page behind.
        newPage = target.getSnapshot().document.pages[0];
      } else {
        const added = target.execute({ type: 'page.add', afterPageId: previousId }, { transactionId });
        if (!added.ok) throw new Error('SCAFFOLD_PAGE_ADD_FAILED');
        const next = target.getSnapshot().document.pages;
        const position = next.findIndex(p => p.id === previousId);
        newPage = next[position + 1];
        if (!newPage) throw new Error('SCAFFOLD_PAGE_MISSING');
        previousId = newPage.id;
      }
      const objects = [{
        type: 'text' as const, frameU: asFrame(18, page.type === 'cover' ? 56 : 20, 172, 28),
        zIndex: 0, text: plainRichText('scaffold-heading', page.heading), style: headingStyle(page.type === 'cover'),
      }, ...(page.subtitle ? [{
        type: 'text' as const, frameU: asFrame(18, page.type === 'cover' ? 96 : 52, 172, 32),
        zIndex: 1, text: plainRichText('scaffold-subtitle', page.subtitle),
        style: { ...headingStyle(false), fontSizePt: 11, fontWeight: 400 as const, color: '#40566b' },
      }] : [])];
      for (const object of objects) {
        if (!target.execute({ type: 'object.insert', pageId: newPage.id, object }, { transactionId }).ok) {
          throw new Error('SCAFFOLD_TEXT_INSERT_FAILED');
        }
      }
      if (page.table) {
        // Table body remains EMPTY. Neither Gemini nor this route certifies
        // numerical engineering values. Fill it through reviewed sources.
        const table = scaffoldTable(page);
        const top = page.subtitle ? 90 : 66;
        const height = Math.min(165, 13 * table.rows.length + 12);
        if (!target.execute({ type: 'object.insert', pageId: newPage.id,
          object: { type: 'table', frameU: asFrame(17, top, 176, height),
            zIndex: 2, table } }, { transactionId }).ok) {
          throw new Error('SCAFFOLD_TABLE_INSERT_FAILED');
        }
        tables++;
      }
    }
    return tables;
  };
  const scratch = createDocumentSession(before.document, { createId: () => crypto.randomUUID() });
  run(scratch, 'scaffold-preflight');
  if (session.getSnapshot().localSequence !== expectedRevision) throw new Error('SCAFFOLD_STALE_DOCUMENT');
  const tablesAdded = run(session, crypto.randomUUID());
  return { pagesAdded: plan.pages.length, tablesAdded, revision: session.getSnapshot().localSequence };
}

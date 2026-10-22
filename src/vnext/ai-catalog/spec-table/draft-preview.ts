import type { RichText, TableModel } from '../../domain';
import type { CompiledDraft, DraftCellTrace } from '../draft-compiler';

/**
 * J2-lite: what the compiled table will look like, read from the compiled
 * steps themselves (the TableModel `object.insert` will write), so the
 * preview card shows exactly what "Aplicar" inserts, part by part.
 */
export interface DraftPreviewCell {
  readonly text: string;
  /** Only for cells that hold a fact: 'verified' / 'chosen' are filled, the others stay for the person. */
  readonly state?: DraftCellTrace['state'];
  /** The files disagree here and the person has not chosen yet ("a escolher"). */
  readonly toChoose?: true;
}
export interface DraftPreviewPart {
  readonly part: number;
  readonly title: string;
  readonly rows: readonly { readonly role: string; readonly cells: readonly DraftPreviewCell[] }[];
  readonly notes: readonly string[];
}
export interface DraftPreview {
  readonly parts: readonly DraftPreviewPart[];
  /** Value cells filled from verified facts (or a person's choice). */
  readonly filled: number;
  /** Value cells left blank for the person. */
  readonly blank: number;
}

const plain = (rich: RichText | undefined) => (rich?.paragraphs ?? [])
  .map(paragraph => paragraph.inlines.map(inline => inline.kind === 'text' ? inline.text : ' ').join('')).join(' ').trim();

function cellText(table: TableModel, rowId: string, columnId: string): string {
  const cell = table.cells.find(item => item.rowId === rowId && item.columnId === columnId);
  if (!cell || cell.coveredBy) return '';
  if (cell.content.type === 'richText') return plain(cell.content.value);
  if (cell.content.type === 'technicalCode') return cell.content.value;
  return '';
}

export function draftPreview(draft: CompiledDraft): DraftPreview {
  const parts: DraftPreviewPart[] = [];
  const toChoose = new Set(draft.pending.filter(item => item.status === 'CONFLICT' && !item.resolved && item.choice !== 'missing')
    .map(item => item.id));
  for (const step of draft.steps) {
    if (step.kind !== 'table' || step.action.object.type !== 'table') continue;
    const table = step.action.object.table;
    const traces = new Map(draft.cells.filter(cell => cell.part === step.part && cell.kind === 'value')
      .map(cell => [`${cell.rowIndex}:${cell.columnIndex}`, cell]));
    parts.push({
      part: step.part,
      title: plain(table.title),
      rows: table.rows.map((row, rowIndex) => ({
        role: row.role ?? 'body',
        cells: table.columns.map((column, columnIndex) => {
          const trace = traces.get(`${rowIndex}:${columnIndex}`);
          return { text: cellText(table, row.id, column.id), ...(trace ? { state: trace.state } : {}),
            ...(trace?.state === 'pending' && toChoose.has(trace.factId) ? { toChoose: true as const } : {}) };
        }),
      })),
      notes: table.annotations.map(note => plain(note.text)).filter(Boolean),
    });
  }
  const values = draft.cells.filter(cell => cell.kind === 'value');
  const filled = values.filter(cell => cell.state === 'verified' || cell.state === 'chosen').length;
  return { parts, filled, blank: values.length - filled };
}

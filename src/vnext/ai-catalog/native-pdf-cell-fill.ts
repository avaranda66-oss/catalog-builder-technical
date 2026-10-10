import { createDocumentSession, type DocumentSession } from '../application';
import type { CellContent, TableModel } from '../domain/editorial-model';
import { prepareGroundedPdfInput, type LocalPdfMaterial } from './pdf-grounded-input';
import { type RealPdfExtractionProposal } from './pdf-grounded-input';

/**
 * Carefully scoped bridge from real PDF bytes to an EXISTING native table.
 * Never parse arbitrary cell values from the provider response alone.
 * All claims go through the PDF hash + atomic-literal evidence validator.
 *
 * This path is ONLY for one-model-per-column, one-characteristic-per-row,
 * searchable single-line source quotes. It cannot certify multi-column PDF
 * geometry or scanned documents. No cells are changed during preparation.
 */
export interface NativePdfCellFillTarget {
  readonly pageId: string;
  readonly objectId: string;
}
export interface NativePdfCellEvidence {
  readonly rowLabel: string;
  readonly model: string;
  readonly cellId: string;
  readonly status: 'known' | 'missing';
  readonly displayValue: string;
  readonly unit: string;
  readonly source?: Readonly<{
    sourceId: string; page: number; quote: string; pdfSha256: string;
  }>;
}
export interface NativePdfCellFillPreview {
  readonly documentId: string;
  readonly revision: number;
  readonly tableId: string;
  readonly pageId: string;
  readonly objectId: string;
  readonly verifiedCells: number;
  readonly missingCells: number;
  readonly cells: readonly NativePdfCellEvidence[];
  readonly pdfHashes: readonly { sourceId: string; sha256: string }[];
}
type NativeFillAction = Parameters<DocumentSession['execute']>[0];
const authorized = new WeakMap<NativePdfCellFillPreview, {
  session: DocumentSession;
  action: NativeFillAction;
  revision: number;
}>();

function simpleCellText(content: CellContent): string | null {
  if (content.type !== 'richText' || content.value.paragraphs.length !== 1) return null;
  const paragraph = content.value.paragraphs[0];
  if (paragraph.inlines.length !== 1 || paragraph.inlines[0].kind !== 'text') return null;
  const inline = paragraph.inlines[0];
  if (inline.marks.length) return null;
  return inline.text;
}

function tableAt(session: DocumentSession, target: NativePdfCellFillTarget) {
  const snapshot = session.getSnapshot();
  const page = snapshot.document.pages.find(p => p.id === target.pageId);
  const object = page?.objects.find(o => o.id === target.objectId);
  if (!page || !object || object.type !== 'table' || object.locked) {
    throw new Error('PDF_FILL_TARGET_NOT_EDITABLE_TABLE');
  }
  return { snapshot, object, table: object.table };
}
function uniqueGridCell(table: TableModel, rowId: string, colId: string) {
  const matching = table.cells.filter(cell => cell.rowId === rowId && cell.columnId === colId);
  if (matching.length !== 1 || matching[0].coveredBy || matching[0].span) {
    throw new Error('PDF_FILL_GRID_TOPOLOGY_UNSUPPORTED');
  }
  return matching[0];
}
function exactHeader(table: TableModel, rowId: string, colId: string, expected: string) {
  const literal = simpleCellText(uniqueGridCell(table, rowId, colId).content);
  if (literal !== expected) throw new Error('PDF_FILL_TABLE_IDENTITY_MISMATCH');
}

/** Validate real PDF bytes first, then prepare one atomic canonical table action. */
export async function prepareNativePdfCellFill(
  session: DocumentSession,
  target: NativePdfCellFillTarget,
  materials: readonly LocalPdfMaterial[],
  untrusted: RealPdfExtractionProposal | unknown,
): Promise<NativePdfCellFillPreview> {
  const origin = tableAt(session, target);
  const prepared = await prepareGroundedPdfInput(materials, untrusted);
  if (session.getSnapshot().localSequence !== origin.snapshot.localSequence ||
      session.getSnapshot().document.id !== origin.snapshot.document.id) {
    throw new Error('PDF_FILL_STALE_DURING_VERIFICATION');
  }
  const input = prepared.input;
  if (input.sections.length !== 1 || input.sections[0].rows.length < 1 ||
      input.models.length !== origin.table.columns.length - 1 ||
      input.sections[0].rows.length !== origin.table.rows.length - 1 ||
      input.models.length > 4) throw new Error('PDF_FILL_TABLE_SHAPE_MISMATCH');
  const rows = input.sections[0].rows;
  if (rows.some(row => row.condition.trim() !== '')) {
    // Conditions must remain visible to the reader. This particular native
    // table has no designated condition column, so refuse to lose them.
    throw new Error('PDF_FILL_CONDITIONS_REQUIRE_EXPLICIT_COLUMN');
  }
  if (origin.table.rows[0].role !== 'header' ||
      origin.table.rows.slice(1).some(row => row.role !== 'body')) {
    throw new Error('PDF_FILL_TABLE_ROLE_UNSUPPORTED');
  }
  exactHeader(origin.table, origin.table.rows[0].id,
    origin.table.columns[0].id, 'Característica');
  for (let col=0; col<input.models.length; col++) {
    exactHeader(origin.table, origin.table.rows[0].id,
      origin.table.columns[col+1].id,input.models[col]);
  }
  for (let row=0; row<rows.length; row++) {
    exactHeader(origin.table,origin.table.rows[row+1].id,
      origin.table.columns[0].id,rows[row].label);
  }
  const digest=new Map(prepared.pdfBytes.map(source=>[source.sourceId,source.sha256]));
  const evidence: NativePdfCellEvidence[]=[];
  const targets: Array<{
    cellId: string;
    expectedTopology: {kind:'ordinary'};
    expectedContent: CellContent;
    content: {type:'empty'} | {type:'richTextPlain';plainText:string};
  }>=[];
  let verifiedCells=0,missingCells=0;
  for(let ri=0;ri<rows.length;ri++)for(let ci=0;ci<input.models.length;ci++){
    const fact=rows[ri].values[ci];
    if(fact.status==='conflict') throw new Error('PDF_FILL_UNRESOLVED_SOURCE_CONFLICT');
    const cell=uniqueGridCell(origin.table,origin.table.rows[ri+1].id,
      origin.table.columns[ci+1].id);
    if(cell.content.type!=='empty') throw new Error('PDF_FILL_EXISTING_VALUE_PROTECTED');
    if(fact.status==='missing'){
      missingCells++;
      evidence.push(Object.freeze({rowLabel:rows[ri].label,model:input.models[ci],
        cellId:cell.id,status:'missing' as const,displayValue:'',unit:rows[ri].unit}));
      targets.push({cellId:cell.id,expectedTopology:{kind:'ordinary'},
        expectedContent:cell.content,content:{type:'empty'}});
      continue;
    }
    const candidate=fact.candidate;
    const hash=digest.get(candidate.source.sourceId);
    if(!hash)throw new Error('PDF_FILL_SOURCE_HASH_MISSING');
    const value=candidate.value + (rows[ri].unit ? ' '+rows[ri].unit : '');
    if(value.length>160)throw new Error('PDF_FILL_CELL_TEXT_TOO_LONG');
    verifiedCells++;
    evidence.push(Object.freeze({rowLabel:rows[ri].label,model:input.models[ci],
      cellId:cell.id,status:'known' as const,displayValue:value,unit:rows[ri].unit,
      source:Object.freeze({...candidate.source,pdfSha256:hash})}));
    targets.push({cellId:cell.id,expectedTopology:{kind:'ordinary'},
      expectedContent:cell.content,content:{type:'richTextPlain',plainText:value}});
  }
  if(verifiedCells===0)throw new Error('PDF_FILL_NO_SUPPORTED_SOURCE_FACTS');
  const action:NativeFillAction={
    type:'table.cells.setContents',pageId:target.pageId,objectId:target.objectId,
    tableId:origin.table.id,
    geometry:{rowIds:origin.table.rows.slice(1).map(row=>row.id),
      columnIds:origin.table.columns.slice(1).map(col=>col.id)},
    targets,
  };
  // Execute the exact action in isolation before ever changing the editor.
  const scratch=createDocumentSession(origin.snapshot.document,
    {createId:()=>crypto.randomUUID()});
  const dry=scratch.execute(action,{transactionId:'pdf-fill-isolated-preflight'});
  if(!dry.ok)throw new Error('PDF_FILL_CANONICAL_PREFLIGHT_FAILED');
  const preview:NativePdfCellFillPreview=Object.freeze({
    documentId:origin.snapshot.document.id,revision:origin.snapshot.localSequence,
    tableId:origin.table.id,pageId:target.pageId,objectId:target.objectId,
    verifiedCells,missingCells,
    cells:Object.freeze(evidence),
    pdfHashes:Object.freeze(prepared.pdfBytes.map(source=>
      Object.freeze({sourceId:source.sourceId,sha256:source.sha256}))),
  });
  authorized.set(preview,{session,action,revision:origin.snapshot.localSequence});
  return preview;
}

/** Call only after the human has inspected the exact source/quote preview. */
export function approveNativePdfCellFill(
  session: DocumentSession, preview: NativePdfCellFillPreview,
): {filled: number; missing: number; revision: number} {
  const pending=authorized.get(preview);
  if(!pending || pending.session!==session)throw new Error('PDF_FILL_PREVIEW_NOT_ISSUED');
  authorized.delete(preview); // single-use approval, never replay credentials/facts
  const current=session.getSnapshot();
  if(current.document.id!==preview.documentId ||
      current.localSequence!==pending.revision ||
      current.localSequence!==preview.revision)throw new Error('PDF_FILL_STALE_APPROVAL');
  const result=session.execute(pending.action,{transactionId:crypto.randomUUID()});
  if(!result.ok)throw new Error('PDF_FILL_CANONICAL_COMMIT_BLOCKED');
  return {filled:preview.verifiedCells,missing:preview.missingCells,
    revision:session.getSnapshot().localSequence};
}

import { richTextSemanticFingerprint } from '../application/text-editing';
import type { RichText, TableLegendEntry, TableModel } from '../domain/editorial-model';
import type { TableClipboardPayload } from './table-clipboard';

export interface ExistingMarkerRef {
  kind: 'existing';
  legendEntryId: string;
}

export interface CreatedMarkerRef {
  kind: 'created';
  clientKey: string;
}

export type MarkerDestinationRef = ExistingMarkerRef | CreatedMarkerRef;

export interface LegendCreatePlan {
  clientKey: string;
  markerCode: string;
  text: RichText;
}

export interface MarkerReconciliationPlan {
  refsByCellIndex: ReadonlyMap<number, MarkerDestinationRef>;
  legendCreates: readonly LegendCreatePlan[];
  requiresLegendCas: boolean;
}

export class TableMarkerAuthoringError extends Error {
  constructor(
    readonly code: 'LEGEND_MARKER_CODE_CONFLICT' | 'LEGEND_NOT_FOUND',
    message: string
  ) {
    super(message);
    this.name = 'TableMarkerAuthoringError';
  }
}

export function legendSemanticallyEquals(
  legend: Pick<TableLegendEntry, 'markerCode' | 'text'>,
  markerCode: string,
  text: RichText
): boolean {
  return legend.markerCode === markerCode
    && richTextSemanticFingerprint(legend.text) === richTextSemanticFingerprint(text);
}

export function legendUsageCount(table: TableModel, legendEntryId: string): number {
  return table.cells.reduce((count, cell) =>
    count + (cell.content.type === 'marker' && cell.content.legendEntryId === legendEntryId ? 1 : 0), 0);
}

export function assertMarkerCodeAvailable(
  table: TableModel,
  markerCode: string,
  text: RichText,
  excludeLegendId?: string
): void {
  const sameCode = table.legend.filter((entry) =>
    entry.id !== excludeLegendId && entry.markerCode === markerCode
  );
  if (sameCode.length === 0) return;
  if (sameCode.length === 1 && legendSemanticallyEquals(sameCode[0], markerCode, text)) {
    throw new TableMarkerAuthoringError(
      'LEGEND_MARKER_CODE_CONFLICT',
      `Legend code ${markerCode} already exists; reuse the existing Legend instead of creating a duplicate`
    );
  }
  throw new TableMarkerAuthoringError(
    'LEGEND_MARKER_CODE_CONFLICT',
    `Legend code ${markerCode} already has different or ambiguous meaning`
  );
}

export function planMarkerReconciliation(
  table: TableModel,
  payload: TableClipboardPayload
): MarkerReconciliationPlan {
  const refsByCellIndex = new Map<number, MarkerDestinationRef>();
  const legendCreates: LegendCreatePlan[] = [];
  const pendingByCode = new Map<string, { fingerprint: string; clientKey: string }>();
  let requiresLegendCas = false;

  payload.cells.forEach((cell, cellIndex) => {
    if (cell.type !== 'marker') return;

    if (payload.sourceTableId === table.id) {
      const existingById = table.legend.find((entry) => entry.id === cell.sourceLegendEntryId);
      if (existingById) {
        refsByCellIndex.set(cellIndex, { kind: 'existing', legendEntryId: existingById.id });
        return;
      }
    }

    requiresLegendCas = true;
    const sameCode = table.legend.filter((entry) => entry.markerCode === cell.markerCode);
    if (sameCode.length > 1) {
      throw new TableMarkerAuthoringError(
        'LEGEND_MARKER_CODE_CONFLICT',
        `Destination contains ambiguous duplicate Legend code ${cell.markerCode}`
      );
    }
    if (sameCode.length === 1) {
      if (!legendSemanticallyEquals(sameCode[0], cell.markerCode, cell.legendText)) {
        throw new TableMarkerAuthoringError(
          'LEGEND_MARKER_CODE_CONFLICT',
          `Destination Legend code ${cell.markerCode} has different meaning`
        );
      }
      refsByCellIndex.set(cellIndex, { kind: 'existing', legendEntryId: sameCode[0].id });
      return;
    }

    const fingerprint = richTextSemanticFingerprint(cell.legendText);
    const pending = pendingByCode.get(cell.markerCode);
    if (pending) {
      if (pending.fingerprint !== fingerprint) {
        throw new TableMarkerAuthoringError(
          'LEGEND_MARKER_CODE_CONFLICT',
          `Clipboard contains conflicting meanings for Legend code ${cell.markerCode}`
        );
      }
      refsByCellIndex.set(cellIndex, { kind: 'created', clientKey: pending.clientKey });
      return;
    }

    const clientKey = `legend-create-${legendCreates.length + 1}`;
    pendingByCode.set(cell.markerCode, { fingerprint, clientKey });
    legendCreates.push({
      clientKey,
      markerCode: cell.markerCode,
      text: cell.legendText,
    });
    refsByCellIndex.set(cellIndex, { kind: 'created', clientKey });
  });

  return { refsByCellIndex, legendCreates, requiresLegendCas };
}

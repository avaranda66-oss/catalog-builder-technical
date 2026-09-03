// src/domain/product-workbook/ingestion.ts
// Productive Foundation for Assisted PDF / Source Document Ingestion (PIM.W1 / EMENDA 13).
// Invariant: Zero Automatic Approval of AI/extracted data.
// All extractions are queued as Candidates/Suggestions for explicit human review before entering the ProductWorkbook.
// Zero explicit any. Zero side-effects.

import {
  ProductWorkbookV2,
  TechnicalDatum,
  TechnicalValue,
  Evidence,
  DatumStatus,
  DatasetKind,
  TechnicalDataset,
  DatasetColumn,
  DatasetRow,
  DatasetCell,
  getDatasetCellKey
} from './types';
import { ProductWorkbookError } from './operations';
import { isValidSemanticKey } from './schema';

export type ExtractionJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface ExtractionJob {
  readonly id: string;
  readonly sourceDocumentId: string;
  readonly status: ExtractionJobStatus;
  readonly progress: number; // 0 to 100
  readonly totalCandidatesFound: number;
  readonly startedAt: string; // ISO-8601
  readonly completedAt?: string; // ISO-8601
  readonly error?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export type CandidateReviewStatus = 'pending_review' | 'approved' | 'rejected';

/**
 * Candidate single datum extracted from a technical document (e.g. PDF).
 */
export interface ExtractedDatumCandidate {
  readonly id: string;
  readonly jobId: string;
  readonly sourceDocumentId: string;
  readonly suggestedSemanticKey: string;
  readonly suggestedLabel: string;
  readonly suggestedValue: TechnicalValue;
  readonly confidence: number; // 0.0 to 1.0
  readonly page?: number | string;
  readonly section?: string;
  readonly locator?: string;
  readonly excerpt?: string;
  readonly status: CandidateReviewStatus;
  readonly rejectionReason?: string;
  readonly reviewedAt?: string;
  readonly reviewedBy?: string;
}

/**
 * Candidate technical dataset extracted from a document table.
 */
export interface ExtractedDatasetCandidate {
  readonly id: string;
  readonly jobId: string;
  readonly sourceDocumentId: string;
  readonly suggestedKind: DatasetKind;
  readonly suggestedLabel: string;
  readonly suggestedSemanticKey: string;
  readonly columns: readonly {
    readonly semanticKey: string;
    readonly label: string;
    readonly valueType: TechnicalValue['type'];
  }[];
  readonly rows: readonly {
    readonly semanticKey?: string;
    readonly label?: string;
  }[];
  readonly cells: readonly {
    readonly rowIdx: number;
    readonly colIdx: number;
    readonly value: TechnicalValue;
    readonly excerpt?: string;
  }[];
  readonly confidence: number; // 0.0 to 1.0
  readonly status: CandidateReviewStatus;
  readonly rejectionReason?: string;
  readonly reviewedAt?: string;
  readonly reviewedBy?: string;
}

/**
 * Creates a new tracked extraction job for a SourceDocument.
 */
export function createExtractionJob(params: {
  id?: string;
  sourceDocumentId: string;
  metadata?: Record<string, string>;
}): ExtractionJob {
  return {
    id: params.id ?? `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    sourceDocumentId: params.sourceDocumentId,
    status: 'queued',
    progress: 0,
    totalCandidatesFound: 0,
    startedAt: new Date().toISOString(),
    metadata: params.metadata ? { ...params.metadata } : undefined
  };
}

/**
 * Approves an extracted datum candidate and promotes it into a canonical TechnicalDatum in the Product Workbook.
 * Strictly guarantees:
 * - Human verification is recorded
 * - Exact source document evidence (page, locator, excerpt) is attached
 * - Datum is placed into the specified target TechnicalModule
 * - Status is marked as 'verified'
 */
export function approveDatumCandidate(params: {
  candidate: ExtractedDatumCandidate;
  targetWorkbook: ProductWorkbookV2;
  targetModuleId: string;
  reviewerId?: string;
  status?: DatumStatus; // Defaults to 'verified'
  adjustedSemanticKey?: string;
  adjustedLabel?: string;
  adjustedValue?: TechnicalValue;
}): {
  updatedWorkbook: ProductWorkbookV2;
  approvedDatum: TechnicalDatum;
  updatedCandidate: ExtractedDatumCandidate;
} {
  const { candidate, targetWorkbook, targetModuleId, reviewerId, status, adjustedSemanticKey, adjustedLabel, adjustedValue } = params;

  if (candidate.status === 'approved') {
    throw new ProductWorkbookError('ALREADY_APPROVED', 'Este candidato já foi aprovado anteriormente.');
  }

  const targetModule = targetWorkbook.modules.find((m) => m.id === targetModuleId);
  if (!targetModule) {
    throw new ProductWorkbookError(
      'TARGET_MODULE_NOT_FOUND',
      `Módulo alvo "${targetModuleId}" não encontrado no workbook.`
    );
  }

  const finalSemanticKey = adjustedSemanticKey ?? candidate.suggestedSemanticKey;
  const finalLabel = adjustedLabel ?? candidate.suggestedLabel;
  const finalValue = adjustedValue ?? candidate.suggestedValue;
  const finalStatus: DatumStatus = status ?? 'verified';

  if (!isValidSemanticKey(finalSemanticKey)) {
    throw new ProductWorkbookError(
      'INVALID_SEMANTIC_KEY',
      `semanticKey "${finalSemanticKey}" é inválida.`
    );
  }

  // Verifica colisão de semanticKey
  if (Object.values(targetWorkbook.data).some((d) => d.semanticKey === finalSemanticKey)) {
    throw new ProductWorkbookError(
      'DUPLICATE_SEMANTIC_KEY',
      `Já existe um dado técnico com a semanticKey "${finalSemanticKey}".`
    );
  }

  const datumId = `dtm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const evidenceId = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const evidence: Evidence = {
    id: evidenceId,
    sourceDocumentId: candidate.sourceDocumentId,
    page: candidate.page,
    section: candidate.section,
    locator: candidate.locator,
    observedValue: finalValue,
    excerpt: candidate.excerpt,
    capturedAt: new Date().toISOString(),
    capturedBy: reviewerId,
    notes: `Aprovado via Ingestão Assistida (Job: ${candidate.jobId}, Confiança: ${Math.round(candidate.confidence * 100)}%)`
  };

  const approvedDatum: TechnicalDatum = {
    id: datumId,
    semanticKey: finalSemanticKey,
    moduleId: targetModuleId,
    label: finalLabel,
    value: finalValue,
    evidence: [evidence],
    status: finalStatus,
    audit: {
      createdAt: new Date().toISOString(),
      createdBy: reviewerId,
      updatedAt: new Date().toISOString(),
      updatedBy: reviewerId
    }
  };

  const updatedWorkbook: ProductWorkbookV2 = {
    ...targetWorkbook,
    modules: targetWorkbook.modules.map((m) =>
      m.id === targetModuleId ? { ...m, datumIds: [...m.datumIds, datumId] } : m
    ),
    data: {
      ...targetWorkbook.data,
      [datumId]: approvedDatum
    }
  };

  const updatedCandidate: ExtractedDatumCandidate = {
    ...candidate,
    status: 'approved',
    reviewedAt: new Date().toISOString(),
    reviewedBy: reviewerId
  };

  return { updatedWorkbook, approvedDatum, updatedCandidate };
}

/**
 * Rejects an extracted datum candidate with a mandatory human reason.
 */
export function rejectDatumCandidate(params: {
  candidate: ExtractedDatumCandidate;
  rejectionReason: string;
  reviewerId?: string;
}): ExtractedDatumCandidate {
  const { candidate, rejectionReason, reviewerId } = params;

  if (!rejectionReason || rejectionReason.trim().length === 0) {
    throw new ProductWorkbookError('REJECTION_REASON_REQUIRED', 'Motivo da rejeição é obrigatório.');
  }

  return {
    ...candidate,
    status: 'rejected',
    rejectionReason: rejectionReason.trim(),
    reviewedAt: new Date().toISOString(),
    reviewedBy: reviewerId
  };
}

/**
 * Approves an extracted dataset candidate, creating TechnicalDatums for all cells and promoting
 * the complete TechnicalDataset into the Product Workbook.
 */
export function approveDatasetCandidate(params: {
  candidate: ExtractedDatasetCandidate;
  targetWorkbook: ProductWorkbookV2;
  targetModuleId: string;
  reviewerId?: string;
  status?: DatumStatus;
}): {
  updatedWorkbook: ProductWorkbookV2;
  approvedDataset: TechnicalDataset;
  updatedCandidate: ExtractedDatasetCandidate;
} {
  const { candidate, targetWorkbook, targetModuleId, reviewerId, status } = params;

  if (candidate.status === 'approved') {
    throw new ProductWorkbookError('ALREADY_APPROVED', 'Este dataset já foi aprovado anteriormente.');
  }

  const targetModule = targetWorkbook.modules.find((m) => m.id === targetModuleId);
  if (!targetModule) {
    throw new ProductWorkbookError(
      'TARGET_MODULE_NOT_FOUND',
      `Módulo alvo "${targetModuleId}" não encontrado no workbook.`
    );
  }

  const datasetId = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const finalStatus: DatumStatus = status ?? 'verified';

  // Cria colunas
  const columns: DatasetColumn[] = candidate.columns.map((c, idx) => ({
    id: `col_${datasetId}_${idx + 1}`,
    semanticKey: c.semanticKey,
    label: c.label,
    valueType: c.valueType,
    order: idx
  }));

  // Cria linhas
  const rows: DatasetRow[] = candidate.rows.map((r, idx) => ({
    id: `row_${datasetId}_${idx + 1}`,
    semanticKey: r.semanticKey,
    label: r.label,
    order: idx
  }));

  const newWorkbookData = { ...targetWorkbook.data };
  const cells: Record<string, DatasetCell> = {};
  const createdDatumIds: string[] = [];

  for (const cell of candidate.cells) {
    const row = rows[cell.rowIdx];
    const col = columns[cell.colIdx];
    if (!row || !col) continue;

    const datumId = `dtm_${datasetId}_${cell.rowIdx}_${cell.colIdx}_${Math.random().toString(36).slice(2, 6)}`;
    const datumSemanticKey = `${candidate.suggestedSemanticKey}.${row.id}.${col.id}`;

    const evidence: Evidence = {
      id: `ev_${datumId}`,
      sourceDocumentId: candidate.sourceDocumentId,
      observedValue: cell.value,
      excerpt: cell.excerpt,
      capturedAt: new Date().toISOString(),
      capturedBy: reviewerId,
      notes: `Aprovado via Ingestão de Tabela (Job: ${candidate.jobId})`
    };

    const technicalDatum: TechnicalDatum = {
      id: datumId,
      semanticKey: datumSemanticKey,
      moduleId: targetModuleId,
      label: `${row.label ?? row.id} - ${col.label}`,
      value: cell.value,
      evidence: [evidence],
      status: finalStatus,
      audit: {
        createdAt: new Date().toISOString(),
        createdBy: reviewerId,
        updatedAt: new Date().toISOString(),
        updatedBy: reviewerId
      }
    };

    newWorkbookData[datumId] = technicalDatum;
    createdDatumIds.push(datumId);

    const cellKey = getDatasetCellKey(row.id, col.id);
    cells[cellKey] = {
      rowId: row.id,
      columnId: col.id,
      datumId
    };
  }

  const approvedDataset: TechnicalDataset = {
    id: datasetId,
    semanticKey: candidate.suggestedSemanticKey,
    moduleId: targetModuleId,
    label: candidate.suggestedLabel,
    kind: candidate.suggestedKind,
    columns,
    rows,
    cells,
    order: targetWorkbook.datasets.length
  };

  const updatedWorkbook: ProductWorkbookV2 = {
    ...targetWorkbook,
    modules: targetWorkbook.modules.map((m) =>
      m.id === targetModuleId
        ? { ...m, datumIds: [...m.datumIds, ...createdDatumIds] }
        : m
    ),
    data: newWorkbookData,
    datasets: [...targetWorkbook.datasets, approvedDataset]
  };

  const updatedCandidate: ExtractedDatasetCandidate = {
    ...candidate,
    status: 'approved',
    reviewedAt: new Date().toISOString(),
    reviewedBy: reviewerId
  };

  return { updatedWorkbook, approvedDataset, updatedCandidate };
}

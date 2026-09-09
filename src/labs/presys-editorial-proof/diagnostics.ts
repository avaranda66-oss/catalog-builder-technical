export type Severity = 'ERROR' | 'WARNING';
export interface Diagnostic {
  code: string;
  severity: Severity;
  details: string;
  pageId?: string;
  objectId?: string;
  tableId?: string;
  rowId?: string;
  cellId?: string;
  annotationId?: string;
}
export class ProofError extends Error {
  constructor(public readonly code: string, details = code) {
    super(`${code}: ${details}`);
    this.name = 'ProofError';
  }
}
export function diagnostic(code: string, details: string, location: Partial<Omit<Diagnostic,'code'|'details'>> = {}): Diagnostic {
  return {code, severity:'ERROR', details, ...location};
}
export function asDiagnostic(error: unknown): Diagnostic {
  return diagnostic(error instanceof ProofError ? error.code : 'PROOF_FAILURE', error instanceof Error ? error.message : String(error));
}

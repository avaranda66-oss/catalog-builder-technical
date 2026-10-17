/**
 * Allowlisted result codes of the vnext-catalog-draft Edge Function (FR-66).
 * The server only ever answers with one of these codes (plus an optional
 * reason); the browser maps them to plain Portuguese (draft-client.ts) and
 * ignores anything else, so provider or Edge error text (which can contain
 * secrets) never reaches the screen. Pure module: imported by Deno, Node and
 * the browser, so no imports and only erasable TypeScript syntax.
 */
export const DRAFT_ERROR_CODES = Object.freeze([
  'METHOD_NOT_ALLOWED',
  'INVALID_ORIGIN',
  'DRAFT_DISABLED',
  'SERVER_NOT_CONFIGURED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'PAYLOAD_TOO_LARGE',
  'INVALID_REQUEST',
  'PROVIDER_NOT_CONFIGURED',
  /** Migration 00028 (settled budget) is not applied: extraction never runs on the 00027 ledger. */
  'BUDGET_NOT_READY',
  'AGENT_DAILY_BUDGET_EXCEEDED',
  'SOURCE_NOT_FOUND',
  'SOURCE_HASH_MISMATCH',
  'SOURCE_TOO_LARGE',
  'TOKEN_BUDGET_EXCEEDED',
  'PROVIDER_FILE_FAILED',
  'EXTRACTION_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_RATE_LIMIT',
  'PROVIDER_REJECTED_KEY',
  'INVALID_PROVIDER_RESPONSE',
] as const);
export type DraftErrorCode = typeof DRAFT_ERROR_CODES[number];

/** Why a provider answer was unusable (sent with INVALID_PROVIDER_RESPONSE). */
export const DRAFT_ERROR_REASONS = Object.freeze(['MAX_TOKENS', 'INVALID_JSON', 'CONTRACT', 'SAFETY', 'BLOCKED', 'EMPTY'] as const);
export type DraftErrorReason = typeof DRAFT_ERROR_REASONS[number];

export function isDraftErrorCode(value: unknown): value is DraftErrorCode {
  return typeof value === 'string' && (DRAFT_ERROR_CODES as readonly string[]).includes(value);
}
export function isDraftErrorReason(value: unknown): value is DraftErrorReason {
  return typeof value === 'string' && (DRAFT_ERROR_REASONS as readonly string[]).includes(value);
}

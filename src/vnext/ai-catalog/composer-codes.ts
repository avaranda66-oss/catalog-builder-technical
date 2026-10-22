/**
 * Allowlisted result codes of the vnext-catalog-composer Edge Function.
 * The server only ever answers with one of these codes (plus an optional
 * reason); the browser maps them to Portuguese messages and ignores anything
 * else, so provider or Edge error text (which can contain secrets) never
 * reaches the screen. Pure module: imported by Deno, Node and the browser.
 */
export const COMPOSER_ERROR_CODES = Object.freeze([
  'METHOD_NOT_ALLOWED',
  'INVALID_ORIGIN',
  'COMPOSER_DISABLED',
  'SERVER_NOT_CONFIGURED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'PAYLOAD_TOO_LARGE',
  'INVALID_REQUEST',
  'BYOK_DISABLED',
  'PROVIDER_NOT_CONFIGURED',
  'AGENT_DAILY_BUDGET_EXCEEDED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_RATE_LIMIT',
  'PROVIDER_REJECTED_KEY',
  'TOKEN_BUDGET_EXCEEDED',
  'INVALID_PROVIDER_RESPONSE',
] as const);
export type ComposerErrorCode = typeof COMPOSER_ERROR_CODES[number];

/** Why a provider answer was unusable (sent with INVALID_PROVIDER_RESPONSE). */
export const COMPOSER_ERROR_REASONS = Object.freeze([
  'MAX_TOKENS',
  'INVALID_JSON',
  'CONTRACT',
  'SAFETY',
  'BLOCKED',
  'EMPTY',
] as const);
export type ComposerErrorReason = typeof COMPOSER_ERROR_REASONS[number];

export function isComposerErrorCode(value: unknown): value is ComposerErrorCode {
  return typeof value === 'string' && (COMPOSER_ERROR_CODES as readonly string[]).includes(value);
}
export function isComposerErrorReason(value: unknown): value is ComposerErrorReason {
  return typeof value === 'string' && (COMPOSER_ERROR_REASONS as readonly string[]).includes(value);
}

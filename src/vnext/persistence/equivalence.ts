import type { CatalogDocument } from '../domain';
import { parseCanonicalSnapshot } from './snapshot';

function stableJsonValue(value: unknown): unknown {
  if (typeof value === 'number') return Object.is(value, -0) ? 0 : value;
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value === null || typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== undefined) result[key] = stableJsonValue(child);
  }
  return result;
}

/** Exact canonical authored-state equivalence independent of object key insertion order. */
export function canonicalDocumentEquivalence(document: CatalogDocument): string {
  const canonical = parseCanonicalSnapshot(document);
  return JSON.stringify(stableJsonValue(canonical));
}

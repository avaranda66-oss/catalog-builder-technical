export const AUTH_RETURN_STORAGE_KEY = 'catalog-builder.auth-return.v1';

const CANONICAL_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const V2_TARGET_PATTERN = new RegExp(`^/v2(?:/|\\?catalog=${CANONICAL_UUID})?$`);

export function normalizeTrustedV2ReturnTarget(value: string | null | undefined): string | null {
  if (!value || value.includes('\\') || value.includes('#')) return null;
  return V2_TARGET_PATTERN.test(value) ? value : null;
}

export function currentTrustedV2ReturnTarget(
  locationLike: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location
): string | null {
  if (locationLike.hash) return null;
  return normalizeTrustedV2ReturnTarget(`${locationLike.pathname}${locationLike.search}`);
}

function targetStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
export function storeTrustedV2ReturnTarget(
  value: string,
  storage?: Storage
): boolean {
  const target = normalizeTrustedV2ReturnTarget(value);
  const targetStore = targetStorage(storage);
  if (!target || !targetStore) return false;
  try {
    targetStore.setItem(AUTH_RETURN_STORAGE_KEY, target);
    return true;
  } catch {
    return false;
  }
}

export function consumeTrustedV2ReturnTarget(storage?: Storage): string | null {
  const targetStore = targetStorage(storage);
  if (!targetStore) return null;
  let value: string | null;
  try {
    value = targetStore.getItem(AUTH_RETURN_STORAGE_KEY);
    targetStore.removeItem(AUTH_RETURN_STORAGE_KEY);
  } catch {
    return null;
  }
  return normalizeTrustedV2ReturnTarget(value);
}
export function clearTrustedV2ReturnTarget(storage?: Storage): void {
  const targetStore = targetStorage(storage);
  if (!targetStore) return;
  try {
    targetStore.removeItem(AUTH_RETURN_STORAGE_KEY);
  } catch {
    // Storage is best-effort only; auth never depends on client storage.
  }
}

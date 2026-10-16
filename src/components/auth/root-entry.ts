import { consumeTrustedV2ReturnTarget } from './return-target';

/**
 * Where a signed-in person goes from "/".
 *
 * Everyone lands on "Meus catálogos" (/v2). The classic editor is an administrator mode reached only
 * with "/?classico=1". A return target saved by /v2 (e.g. /v2?catalog=<id>) still wins, so deep links
 * keep working. If /v2 sends the person straight back here, the second automatic redirect is refused
 * instead of looping.
 */
export const CLASSIC_MODE_QUERY_PARAM = 'classico';
export const DEFAULT_SIGNED_IN_TARGET = '/v2';
export const ROOT_REDIRECT_GUARD_STORAGE_KEY = 'catalog-builder.root-v2-redirect.v1';
export const ROOT_REDIRECT_LOOP_WINDOW_MS = 15_000;

type EntryLocation = Pick<Location, 'pathname' | 'search'>;

export type SignedInEntryDecision =
  | { readonly kind: 'redirect'; readonly target: string; readonly reason: 'return-target' | 'default' }
  | { readonly kind: 'stay'; readonly reason: 'classic' | 'other-route' }
  | { readonly kind: 'loop-blocked'; readonly target: string };

/** Indirection so tests can observe navigation; jsdom cannot spy on `window.location`. */
export const rootEntryNavigation = {
  replace(target: string): void {
    window.location.replace(target);
  },
  assign(target: string): void {
    window.location.assign(target);
  },
};

export function wantsClassicApp(search: string): boolean {
  return new URLSearchParams(search).get(CLASSIC_MODE_QUERY_PARAM) === '1';
}

const ROOT_PATHS = new Set(['', '/', '/index.html']);

/** Only the plain site address defaults to /v2; print, labs and other routes keep their own screens. */
export function isDefaultEntryLocation(location: EntryLocation): boolean {
  if (!ROOT_PATHS.has(location.pathname)) return false;
  const params = new URLSearchParams(location.search);
  if (params.get('print') === '1' || params.has('lab')) return false;
  return !wantsClassicApp(location.search);
}

function sessionStore(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function lastAutomaticRedirectAt(storage: Storage | undefined): number | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(ROOT_REDIRECT_GUARD_STORAGE_KEY);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function rememberAutomaticRedirect(storage: Storage | undefined, at: number): void {
  try {
    storage?.setItem(ROOT_REDIRECT_GUARD_STORAGE_KEY, String(at));
  } catch {
    // Best effort: without storage the redirect still happens, only without loop protection.
  }
}

/** Called when "/" shows the login screen: a bounce that needs a new login is not a loop. */
export function clearRootRedirectGuard(storage?: Storage): void {
  try {
    sessionStore(storage)?.removeItem(ROOT_REDIRECT_GUARD_STORAGE_KEY);
  } catch {
    // Storage is best effort only.
  }
}

export interface ResolveSignedInEntryOptions {
  readonly location?: EntryLocation;
  readonly storage?: Storage;
  readonly now?: () => number;
}

/** Decides (and records) the automatic redirect for a signed-in visit. Consumes the return target. */
export function resolveSignedInEntry(options: ResolveSignedInEntryOptions = {}): SignedInEntryDecision {
  const location = options.location ?? window.location;
  const storage = sessionStore(options.storage);
  const now = (options.now ?? Date.now)();
  const returnTarget = consumeTrustedV2ReturnTarget(storage);
  const target = returnTarget ?? (isDefaultEntryLocation(location) ? DEFAULT_SIGNED_IN_TARGET : null);
  if (!target) {
    return { kind: 'stay', reason: wantsClassicApp(location.search) ? 'classic' : 'other-route' };
  }
  const previous = lastAutomaticRedirectAt(storage);
  if (previous !== undefined && now >= previous && now - previous < ROOT_REDIRECT_LOOP_WINDOW_MS) {
    return { kind: 'loop-blocked', target };
  }
  rememberAutomaticRedirect(storage, now);
  return { kind: 'redirect', target, reason: returnTarget ? 'return-target' : 'default' };
}

import { consumeTrustedV2ReturnTarget } from './return-target';

/**
 * Where a signed-in person goes from any address the old app serves ("/" and everything except /v2).
 *
 * Everyone lands on "Meus catálogos" (/v2). The classic editor is an administrator mode reached only
 * with "/?classico=1" (and its own print round trip). A return target saved by /v2
 * (e.g. /v2?catalog=<id>) still wins, so deep links keep working. If /v2 sends the person straight back here, the second automatic redirect is refused
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

/** Print pages open from the classic editor and keep their own screen. */
function isPrintLocation(location: EntryLocation, params: URLSearchParams): boolean {
  return location.pathname === '/print' || params.get('print') === '1';
}

/** Development labs only exist in the dev server; in production they are just another address. */
function isLabLocation(location: EntryLocation, params: URLSearchParams): boolean {
  return location.pathname.startsWith('/__lab/') || params.has('lab');
}

const ROOT_PATHS = new Set(['', '/', '/index.html']);

/**
 * "Voltar ao editor" on a classic print page returns to "/?catalog=…&version=…" (or template=…),
 * an address only the classic editor creates (the new editor uses /v2?catalog=…).
 */
function isClassicPrintReturn(location: EntryLocation, params: URLSearchParams): boolean {
  return ROOT_PATHS.has(location.pathname)
    && (params.has('catalog') || params.has('template'))
    && params.has('version');
}

function isClassicLocation(location: EntryLocation, params: URLSearchParams): boolean {
  return params.get(CLASSIC_MODE_QUERY_PARAM) === '1' || isClassicPrintReturn(location, params);
}

export interface EntryLocationOptions {
  /** Defaults to the dev server flag: labs never keep a signed-in person outside /v2 in production. */
  readonly labsAvailable?: boolean;
}

/**
 * Every address served by the old app opens "Meus catálogos" (/v2), including old links such as
 * /ai-catalog-prototype.html or a mistyped path. Only print pages, development labs, the classic
 * print round trip and "?classico=1" stay.
 */
export function isDefaultEntryLocation(location: EntryLocation, options: EntryLocationOptions = {}): boolean {
  const params = new URLSearchParams(location.search);
  if (isPrintLocation(location, params)) return false;
  if ((options.labsAvailable ?? import.meta.env.DEV === true) && isLabLocation(location, params)) return false;
  return !isClassicLocation(location, params);
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

export interface ResolveSignedInEntryOptions extends EntryLocationOptions {
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
  const target = returnTarget ?? (isDefaultEntryLocation(location, options) ? DEFAULT_SIGNED_IN_TARGET : null);
  if (!target) {
    const params = new URLSearchParams(location.search);
    const classic = !isPrintLocation(location, params) && isClassicLocation(location, params);
    return { kind: 'stay', reason: classic ? 'classic' : 'other-route' };
  }
  const previous = lastAutomaticRedirectAt(storage);
  if (previous !== undefined && now >= previous && now - previous < ROOT_REDIRECT_LOOP_WINDOW_MS) {
    return { kind: 'loop-blocked', target };
  }
  rememberAutomaticRedirect(storage, now);
  return { kind: 'redirect', target, reason: returnTarget ? 'return-target' : 'default' };
}

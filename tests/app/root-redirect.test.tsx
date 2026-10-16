import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { storeTrustedV2ReturnTarget } from '@/components/auth/return-target';
import {
  clearRootRedirectGuard,
  DEFAULT_SIGNED_IN_TARGET,
  isDefaultEntryLocation,
  resolveSignedInEntry,
  ROOT_REDIRECT_GUARD_STORAGE_KEY,
  ROOT_REDIRECT_LOOP_WINDOW_MS,
  rootEntryNavigation,
  wantsClassicApp,
} from '@/components/auth/root-entry';
import * as SupabaseService from '@/services/supabase.service';
import { useAssetStore } from '@/stores/useAssetStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCatalogStore } from '@/stores/useCatalogStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useMediaStore } from '@/stores/useMediaStore';
import { useTemplateStore } from '@/stores/useTemplateStore';
import { useUIStore } from '@/stores/useUIStore';

const CATALOG_ID = '11111111-1111-4111-8111-111111111111';

function at(pathname: string, search = '') {
  return { pathname, search };
}

describe('FR-01 where a signed-in person lands from "/"', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('opens "Meus catálogos" (/v2) when there is no saved target', () => {
    const decision = resolveSignedInEntry({ location: at('/'), now: () => 1_000 });
    expect(decision).toEqual({ kind: 'redirect', target: DEFAULT_SIGNED_IN_TARGET, reason: 'default' });
    expect(DEFAULT_SIGNED_IN_TARGET).toBe('/v2');
  });

  it('keeps the classic app only with ?classico=1', () => {
    expect(wantsClassicApp('?classico=1')).toBe(true);
    expect(wantsClassicApp('?classico=0')).toBe(false);
    expect(resolveSignedInEntry({ location: at('/', '?classico=1') })).toEqual({ kind: 'stay', reason: 'classic' });
    expect(sessionStorage.getItem(ROOT_REDIRECT_GUARD_STORAGE_KEY)).toBeNull();
  });

  it('still honours a deep link saved by /v2, even from the classic address', () => {
    storeTrustedV2ReturnTarget(`/v2?catalog=${CATALOG_ID}`);
    const decision = resolveSignedInEntry({ location: at('/', '?classico=1'), now: () => 5_000 });
    expect(decision).toEqual({ kind: 'redirect', target: `/v2?catalog=${CATALOG_ID}`, reason: 'return-target' });
    // The saved target is used once.
    expect(resolveSignedInEntry({ location: at('/', '?classico=1') })).toEqual({ kind: 'stay', reason: 'classic' });
  });

  it('leaves print pages and development labs on their own screens', () => {
    expect(isDefaultEntryLocation(at('/print'))).toBe(false);
    expect(isDefaultEntryLocation(at('/', '?print=1'))).toBe(false);
    expect(isDefaultEntryLocation(at('/', `?print=1&catalog=${CATALOG_ID}&version=3`))).toBe(false);
    expect(isDefaultEntryLocation(at('/', '?lab=product-workspace'), { labsAvailable: true })).toBe(false);
    expect(isDefaultEntryLocation(at('/__lab/product-workspace'), { labsAvailable: true })).toBe(false);
    expect(isDefaultEntryLocation(at('/index.html'))).toBe(true);
    expect(resolveSignedInEntry({ location: at('/print') })).toEqual({ kind: 'stay', reason: 'other-route' });
    expect(resolveSignedInEntry({ location: at('/', '?print=1') })).toEqual({ kind: 'stay', reason: 'other-route' });
  });

  it('opens /v2 from every other address the old app serves, old links included', () => {
    for (const [pathname, search] of [
      ['/ai-catalog-prototype.html', ''],
      ['/qualquer-coisa', ''],
      ['/v2/x', ''],
      ['/index.html', '?catalog=abc'],
      ['/ai-catalog-prototype.html', `?catalog=${CATALOG_ID}&version=3`],
    ] as const) {
      sessionStorage.clear();
      expect(resolveSignedInEntry({ location: at(pathname, search), now: () => 1_000 }))
        .toEqual({ kind: 'redirect', target: '/v2', reason: 'default' });
    }
  });

  it('never keeps a signed-in person in a lab address in production', () => {
    expect(isDefaultEntryLocation(at('/', '?lab=product-workspace'), { labsAvailable: false })).toBe(true);
    expect(isDefaultEntryLocation(at('/__lab/product-workspace'), { labsAvailable: false })).toBe(true);
  });

  it('keeps the classic print round trip ("Voltar ao editor") in the classic app', () => {
    expect(resolveSignedInEntry({ location: at('/', `?catalog=${CATALOG_ID}&version=3`) }))
      .toEqual({ kind: 'stay', reason: 'classic' });
    expect(resolveSignedInEntry({ location: at('/', `?template=${CATALOG_ID}&version=1`) }))
      .toEqual({ kind: 'stay', reason: 'classic' });
    expect(sessionStorage.getItem(ROOT_REDIRECT_GUARD_STORAGE_KEY)).toBeNull();
  });

  it('refuses a second automatic redirect right after the first one (no loop)', () => {
    expect(resolveSignedInEntry({ location: at('/'), now: () => 10_000 }).kind).toBe('redirect');
    expect(resolveSignedInEntry({ location: at('/'), now: () => 12_000 })).toEqual({ kind: 'loop-blocked', target: '/v2' });
    expect(resolveSignedInEntry({ location: at('/'), now: () => 10_000 + ROOT_REDIRECT_LOOP_WINDOW_MS }).kind).toBe('redirect');
  });

  it('starts fresh after the login screen clears the guard', () => {
    expect(resolveSignedInEntry({ location: at('/'), now: () => 20_000 }).kind).toBe('redirect');
    clearRootRedirectGuard();
    expect(resolveSignedInEntry({ location: at('/'), now: () => 20_500 }).kind).toBe('redirect');
  });

  it('still redirects when the browser blocks session storage', () => {
    const blocked = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    } as unknown as Storage;
    expect(resolveSignedInEntry({ location: at('/'), storage: blocked }).kind).toBe('redirect');
  });
});

describe('FR-01 App entry for a signed-in person', () => {
  let replace: ReturnType<typeof vi.spyOn>;
  let assign: ReturnType<typeof vi.spyOn>;
  let loadWorkspace: ReturnType<typeof vi.spyOn>;
  let loadLatestCatalog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    replace = vi.spyOn(rootEntryNavigation, 'replace').mockImplementation(() => undefined);
    assign = vi.spyOn(rootEntryNavigation, 'assign').mockImplementation(() => undefined);
    vi.spyOn(SupabaseService, 'getSupabase').mockReturnValue(null);
    vi.spyOn(useAuthStore.getState(), 'initialize').mockResolvedValue(undefined);
    loadWorkspace = vi.spyOn(useLibraryStore.getState(), 'loadWorkspace').mockResolvedValue(undefined);
    vi.spyOn(useLibraryStore.getState(), 'initRealtimeSubscription').mockReturnValue(() => undefined);
    loadLatestCatalog = vi.spyOn(useCatalogStore.getState(), 'loadLatestCatalog').mockResolvedValue(undefined);
    vi.spyOn(useMediaStore.getState(), 'loadAssets').mockResolvedValue(undefined);
    vi.spyOn(useTemplateStore.getState(), 'loadTemplates').mockResolvedValue(undefined);
    vi.spyOn(useAssetStore.getState(), 'loadWorkspaceAssets').mockResolvedValue(undefined);
    vi.spyOn(useAssetStore.getState(), 'initRealtimeSubscription').mockReturnValue(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    useUIStore.setState({ activeTab: 'library' });
    useAuthStore.setState({
      status: 'authenticated',
      userId: 'root-entry-user',
      role: 'editor',
      email: 'root-entry@example.test',
      errorMessage: null,
    });
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
    sessionStorage.clear();
  });

  it('goes straight to /v2 and never loads the classic workspace', async () => {
    window.history.replaceState(null, '', '/');
    render(<App />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/v2'));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Abrindo seus catálogos…');
    expect(loadWorkspace).not.toHaveBeenCalled();
    expect(loadLatestCatalog).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /Abrir editor de catálogos/ })).not.toBeInTheDocument();
  });

  it('opens /v2 from the old AI prototype address instead of the classic editor', async () => {
    window.history.replaceState(null, '', '/ai-catalog-prototype.html');
    render(<App />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/v2'));
    expect(loadLatestCatalog).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Abrindo seus catálogos…');
  });

  it('keeps the classic app with ?classico=1 and offers the way back to the catalogs', async () => {
    window.history.replaceState(null, '', '/?classico=1');
    render(<App />);
    const link = await screen.findByRole('link', { name: /Abrir editor de catálogos/ });
    expect(link).toHaveAttribute('href', '/v2');
    expect(replace).not.toHaveBeenCalled();
    // The classic workspace bootstrap runs (only App loads the latest classic catalog).
    await waitFor(() => expect(loadLatestCatalog).toHaveBeenCalledTimes(1));
    expect(loadWorkspace).toHaveBeenCalled();
  });

  it('shows a clear way out instead of looping when /v2 sends the person back', async () => {
    window.history.replaceState(null, '', '/');
    sessionStorage.setItem(ROOT_REDIRECT_GUARD_STORAGE_KEY, String(Date.now()));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Não foi possível abrir seus catálogos' })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(loadWorkspace).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Abrir meus catálogos' }));
    });
    expect(assign).toHaveBeenCalledWith('/v2');
  });

  it('shows the login screen and clears the loop guard when signed out', async () => {
    sessionStorage.setItem(ROOT_REDIRECT_GUARD_STORAGE_KEY, String(Date.now()));
    useAuthStore.setState({ status: 'unauthenticated', userId: null, role: null, email: null, errorMessage: null });
    render(<App />);
    await waitFor(() => expect(sessionStorage.getItem(ROOT_REDIRECT_GUARD_STORAGE_KEY)).toBeNull());
    expect(replace).not.toHaveBeenCalled();
  });
});

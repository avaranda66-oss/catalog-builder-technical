import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetPersistenceBridge, AssetResolutionResult, AssetRuntimeState } from '@/vnext/asset';
import type { AssetRef } from '@/vnext/domain';
import type { SaveProjection, VNextPersistenceRuntime } from '@/vnext/persistence';
import { SaveSummary } from '@/vnext/app/editor/SaveSummary';
import { ImageRepairIndicator, PhotoStatusMark } from '@/vnext/app/editor/ImageRepairIndicator';
import { fatherSavedTime, formatSavedTime } from '@/vnext/app/save-presentation';
import { StrictCasCatalogRepository, deferred, documentFixture, runtimeFixture } from '../persistence/w3h-fixtures';

afterEach(cleanup);

describe('FR-44 save state under the catalog title', () => {
  it('shows "Salvo às HH:MM" only after this tab got the confirmation, keeping the state readable alone', () => {
    const savedAt = new Date(2026, 9, 16, 14, 5, 30).getTime();
    const { container, rerender } = render(<SaveSummary save={{ phase: 'idle', label: 'Saved', dirty: false, canSave: true, savedAt }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Salvo às 14:05');
    expect(container.querySelector('[data-save-state]')?.textContent).toBe('Salvo');

    rerender(<SaveSummary save={{ phase: 'idle', label: 'Saved', dirty: false, canSave: true }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Salvo$/);

    rerender(<SaveSummary save={{ phase: 'idle', label: 'Unsaved changes', dirty: true, canSave: true, savedAt }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Alterações não salvas$/);
  });

  it('names an expired session apart from "Sem conexão"', () => {
    const { rerender } = render(<SaveSummary save={{ phase: 'unauthorized', label: 'Session expired', dirty: true, canSave: true }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Sessão expirada — entre novamente');
    expect(screen.getByRole('status')).toHaveAttribute('data-save-phase', 'unauthorized');
    rerender(<SaveSummary save={{ phase: 'unavailable', label: 'Offline / unavailable', dirty: true, canSave: true }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Sem conexão / indisponível');
  });

  it('formats the time with two digits for hour and minute', () => {
    expect(formatSavedTime(new Date(2026, 0, 2, 9, 7).getTime())).toBe('09:07');
    const save: SaveProjection = { phase: 'saving', label: 'Saving…', dirty: true, canSave: false, savedAt: 1 };
    expect(fatherSavedTime(save)).toBeUndefined();
  });
});

const asset: AssetRef = {
  id: 'a0000000-0000-4000-a000-000000000001', version: '1', sha256: 'a'.repeat(64),
  mime: 'image/png', widthPx: 10, heightPx: 10, name: 'foto.png', alt: 'Foto do produto',
};

describe('FR-41 photo mark on the page', () => {
  it('says "Carregando foto…" while the photo is still downloading, without one announcement per photo', () => {
    const { container } = render(<ImageRepairIndicator objectId="photo" loading state={undefined} onRetry={vi.fn()} />);
    expect(container.querySelector('[data-asset-status="loading"]')).toHaveTextContent('Carregando foto…');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps the texts and the button at screen size inside the zoomed page (they undo the page zoom)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/vnext/app/editor/ImageRepairIndicator.css'), 'utf8');
    expect(css).toMatch(/\.repair-content \{[^}]*zoom: var\(--vnext-stage-unzoom, 1\)/);
    expect(css).toMatch(/\.repair-retry \{[^}]*min-height: 32px/);
    expect(css).toMatch(/\.repair-retry \{[^}]*font-size: 14px/);
    const { container } = render(<ImageRepairIndicator objectId="photo" loading={false}
      state={{ status: 'offline', asset }} onRetry={vi.fn()} />);
    const content = container.querySelector('.repair-content');
    expect(content).toContainElement(screen.getByText('Sem conexão'));
    expect(content).toContainElement(screen.getByRole('button', { name: /^Tentar novamente/ }));
  });

  it.each([
    ['offline', 'Sem conexão'],
    ['unavailable', 'Foto não carregou'],
  ] as const)('offers "Tentar novamente" for a %s photo', (status, title) => {
    const onRetry = vi.fn();
    const state = { status, error: 'x', asset } as AssetRuntimeState;
    const onPointerDown = vi.fn();
    render(<div onPointerDown={onPointerDown}><ImageRepairIndicator objectId="photo" loading={false} state={state} onRetry={onRetry} /></div>);
    expect(screen.getByText(title)).toBeInTheDocument();
    // The name says which photo the button is for; it starts with the words on the button.
    const button = screen.getByRole('button', { name: 'Tentar novamente — foto “Foto do produto”' });
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it('asks for the photo again when the file itself is damaged (trying again cannot fix it)', () => {
    render(<ImageRepairIndicator objectId="photo" loading={false} state={{ status: 'integrity-failed', code: 'HASH_MISMATCH', message: 'x', asset }} onRetry={vi.fn()} />);
    expect(screen.getByText('Foto com problema')).toBeInTheDocument();
    expect(screen.getByText('Envie a foto de novo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Tentar novamente/ })).not.toBeInTheDocument();
  });

  it('falls back to the file name, and to the plain button text when the photo has neither', () => {
    const { rerender } = render(<ImageRepairIndicator objectId="photo" loading={false}
      state={{ status: 'offline', asset: { ...asset, alt: '' } }} onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Tentar novamente — foto “foto.png”' })).toBeInTheDocument();
    rerender(<ImageRepairIndicator objectId="photo" loading={false}
      state={{ status: 'offline', asset: { ...asset, alt: '', name: '' } }} onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('shows nothing for a photo that loaded', () => {
    const { container } = render(<ImageRepairIndicator objectId="photo" loading={false}
      state={{ status: 'resolved', url: 'blob:x', expiresAt: 1, asset }} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

/** The editor passes the photo state from the workspace; this host does the same. */
function Host({ runtime, bridge }: { runtime: VNextPersistenceRuntime; bridge: Pick<AssetPersistenceBridge, 'resolve'> }) {
  const state = React.useSyncExternalStore(runtime.workspace.subscribe, () => runtime.workspace.getSnapshot().assetRuntimeStates.get(asset.id));
  return <PhotoStatusMark objectId="photo" assetId={asset.id} state={state} runtime={runtime} bridge={bridge} />;
}

describe('FR-41 "Tentar novamente" in the editor', () => {
  it('downloads the same photo again (no upload), shows it loading and removes the mark when it arrives', async () => {
    const base = documentFixture();
    const document = {
      ...base,
      pages: [{ ...base.pages[0]!, objects: [{ id: 'photo', type: 'image' as const, assetId: asset.id, fit: 'contain' as const, zIndex: 0,
        frame: { xMm: 10, yMm: 10, widthMm: 40, heightMm: 30 } }] }],
      assets: [asset],
    };
    const { runtime } = runtimeFixture(new StrictCasCatalogRepository(document), document, 6100, { autosave: false });
    runtime.workspace.setAssetRuntimeState(asset.id, { status: 'unavailable', error: 'Foto não carregou', asset });
    const pending = deferred<AssetResolutionResult>();
    const bridge = { resolve: vi.fn<AssetPersistenceBridge['resolve']>(() => pending.promise) };

    render(<Host runtime={runtime} bridge={bridge} />);
    fireEvent.click(screen.getByRole('button', { name: /^Tentar novamente/ }));

    expect(bridge.resolve).toHaveBeenCalledWith(asset, expect.objectContaining({
      forceRefresh: true,
      authLineage: 'user-a:0',
      openSessionId: runtime.workspace.getSnapshot().binding.openSessionId,
    }));
    expect(screen.getByText('Carregando foto…')).toBeInTheDocument();

    await act(async () => {
      pending.resolve({ ok: true, state: { status: 'resolved', url: 'blob:nova', expiresAt: Date.now() + 60_000, asset } });
      await pending.promise;
    });
    expect(screen.queryByText('Carregando foto…')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Tentar novamente/ })).not.toBeInTheDocument();
    expect(runtime.workspace.getSnapshot().assetUrls.get(asset.id)).toBe('blob:nova');
    await runtime.dispose();
  });
});

import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiCatalogPrototypeApp } from '@/vnext/ai-catalog/PrototypeApp';
import { createSyntheticSpecifications } from '@/vnext/ai-catalog/fixture';
import { LocalGenerationRepository, PROTOTYPE_STORAGE_KEY } from '@/vnext/ai-catalog/repository';
import type { GeneratedCatalog } from '@/vnext/ai-catalog/composition';
import type { CatalogListItem, PersistenceResult } from '@/vnext/persistence/contracts';

const compile = vi.hoisted(() => vi.fn());
vi.mock('@/vnext/ai-catalog/composition', async importOriginal => ({
  ...await importOriginal<typeof import('@/vnext/ai-catalog/composition')>(),
  compileCatalog: compile,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
beforeEach(() => { compile.mockReset(); localStorage.removeItem(PROTOTYPE_STORAGE_KEY); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.removeItem(PROTOTYPE_STORAGE_KEY); });
afterAll(() => vi.unstubAllGlobals());

describe('prototype cancellation and navigation causality', () => {
  it('ignores a cancelled generation and leaves the next intake usable after its promise settles', async () => {
    const original = await vi.importActual<typeof import('@/vnext/ai-catalog/composition')>('@/vnext/ai-catalog/composition');
    const generation = await original.compileCatalog(await createSyntheticSpecifications());
    const pending = deferred<GeneratedCatalog>();
    compile.mockReturnValueOnce(pending.promise);
    render(<AiCatalogPrototypeApp />);
    fireEvent.click(await screen.findByRole('button', { name: 'Criar com IA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Usar especificações de exemplo' }));
    const generate = screen.getByRole('button', { name: 'Gerar catálogo' });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(generate);
    await waitFor(() => expect(compile).toHaveBeenCalledTimes(1));
    expect(generate).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à Library' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Criar com IA' }));
    expect(screen.getByRole('button', { name: 'Usar especificações de exemplo' })).toBeEnabled();
    await act(async () => { pending.resolve(generation); await pending.promise; });
    expect(screen.getByRole('heading', { name: '1. Fornecer materiais' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '2. Gerar catálogo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar catálogo' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Usar especificações de exemplo' })).toBeEnabled();
  });

  it('does not let a late initial Library query replace an intake already selected by the user', async () => {
    const listing = deferred<PersistenceResult<readonly CatalogListItem[]>>();
    vi.spyOn(LocalGenerationRepository.prototype, 'listCatalogs').mockReturnValueOnce(listing.promise);
    render(<AiCatalogPrototypeApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Criar com IA' }));
    expect(screen.getByRole('heading', { name: '1. Fornecer materiais' })).toBeInTheDocument();
    await act(async () => { listing.resolve({ ok: true, value: [] }); await listing.promise; });
    expect(screen.getByRole('heading', { name: '1. Fornecer materiais' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Library local de demonstração' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar especificações de exemplo' })).toBeEnabled();
  });
});

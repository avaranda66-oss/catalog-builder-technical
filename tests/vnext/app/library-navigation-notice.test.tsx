import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSaveBeforeLibraryNavigation, libraryNavigationNotice } from '@/vnext/app/catalog-navigation';
import { LibraryNavigationNotice } from '@/vnext/app/editor/LibraryNavigationNotice';
import { documentFixture, runtimeFixture, StrictCasCatalogRepository } from '../persistence/w3h-fixtures';

function setup() {
  const document = documentFixture();
  const repository = new StrictCasCatalogRepository(document);
  const { runtime, session } = runtimeFixture(repository, document, 700, { autosave: true });
  return { repository, runtime, session };
}

describe('FR-06 the editor shows why "Catálogos" stayed', () => {
  afterEach(() => cleanup());

  it('renders nothing while there is nothing to explain', async () => {
    const { runtime } = setup();
    render(<LibraryNavigationNotice runtime={runtime} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await runtime.dispose();
  });

  it('shows the reason of a blocked click at the top and lets the person close it', async () => {
    const { repository, runtime, session } = setup();
    repository.saveOverride = async () => ({ ok: false, error: { code: 'OFFLINE' } });
    session.execute({ type: 'document.rename', title: 'Sem internet' });
    const navigate = vi.fn();
    render(<LibraryNavigationNotice runtime={runtime} />);

    await act(async () => {
      expect(await createSaveBeforeLibraryNavigation(runtime, navigate)()).toBe(false);
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Seu trabalho ainda não foi salvo, por isso você continua neste catálogo.');
    expect(navigate).not.toHaveBeenCalled();
    // On document.body, above the page stage overlay that would otherwise take its clicks.
    expect(alert.parentElement).toBe(document.body);

    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(libraryNavigationNotice(runtime).get()).toBeUndefined();
    await runtime.dispose();
  });

  it('disappears by itself when a later save shows "Salvo"', async () => {
    const { repository, runtime, session } = setup();
    repository.saveOverride = async () => ({ ok: false, error: { code: 'OFFLINE' } });
    session.execute({ type: 'document.rename', title: 'Conexão voltou' });
    render(<LibraryNavigationNotice runtime={runtime} />);
    await act(async () => {
      expect(await createSaveBeforeLibraryNavigation(runtime, vi.fn())()).toBe(false);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await act(async () => {
      expect((await runtime.manualSave()).ok).toBe(true);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await runtime.dispose();
  });

  it('keeps one notice per editor runtime', async () => {
    const first = setup();
    const second = setup();
    libraryNavigationNotice(first.runtime).set('Aviso do primeiro catálogo');
    expect(libraryNavigationNotice(first.runtime)).toBe(libraryNavigationNotice(first.runtime));
    expect(libraryNavigationNotice(second.runtime).get()).toBeUndefined();
    await first.runtime.dispose();
    await second.runtime.dispose();
  });
});

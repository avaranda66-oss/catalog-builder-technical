import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  VNextAccessResolving,
  VNextServerAccessUnavailable,
} from '@/vnext/app/bootstrap';
import { CatalogLibrary } from '@/vnext/app/CatalogLibrary';
import type { CatalogLibraryService } from '@/vnext/library';

afterEach(cleanup);

function serviceWithList(result: unknown): CatalogLibraryService {
  return {
    list: vi.fn().mockResolvedValue(result),
    listStarters: () => [],
    getCreateState: () => 'idle',
    createBlank: vi.fn(),
  } as unknown as CatalogLibraryService;
}

describe('PILOT.B access-entry runtime states', () => {
  it('keeps protected Library controls absent while access is resolving', () => {
    const { container, queryByRole } = render(<VNextAccessResolving />);
    expect(container.querySelector('[data-vnext-access-state="resolving"]')).not.toBeNull();
    expect(container.querySelector('[data-catalog-library]')).toBeNull();
    expect(queryByRole('button', { name: /Novo catálogo|Criar novo catálogo|Abrir/ })).toBeNull();
    expect(container).toHaveTextContent('Validando acesso…');
  });

  it('server authorization invalidation is not rendered as a Library error', () => {
    const retry = vi.fn();
    const signOut = vi.fn();
    const { container, getByRole } = render(
      <VNextServerAccessUnavailable onRetry={retry} onSignOut={signOut} />
    );

    expect(container.querySelector('[data-catalog-library]')).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Tentar novamente' }));
    fireEvent.click(getByRole('button', { name: 'Sair' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('shows empty create state and logout only after an authorized list succeeds', async () => {
    const signOut = vi.fn();
    const service = serviceWithList({ ok: true, value: [] });
    const { getByRole, getByText } = render(
      <CatalogLibrary service={service} onOpen={vi.fn()} onSignOut={signOut} />
    );

    await waitFor(() => expect(getByText('Comece seu primeiro catálogo')).toBeInTheDocument());
    expect(getByRole('button', { name: 'Criar novo catálogo' })).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: 'Sair' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('renders catalog-list failure exclusively and suppresses create/open affordances', async () => {
    const service = serviceWithList({ ok: false, error: { code: 'REMOTE_FAILURE' } });
    const { container, getByRole, queryByText, queryByRole } = render(
      <CatalogLibrary service={service} onOpen={vi.fn()} onSignOut={vi.fn()} />
    );

    await waitFor(() => expect(container.querySelector('[data-library-list-error]')).not.toBeNull());
    expect(getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(queryByText('Comece seu primeiro catálogo')).toBeNull();
    expect(queryByRole('button', { name: 'Novo catálogo' })).toBeNull();
    expect(queryByRole('button', { name: 'Criar novo catálogo' })).toBeNull();
    expect(queryByRole('button', { name: 'Abrir' })).toBeNull();
  });

  it('routes a server UNAUTHORIZED list result through access invalidation', async () => {
    const unauthorized = vi.fn();
    const service = serviceWithList({ ok: false, error: { code: 'UNAUTHORIZED' } });
    const { container, queryByText } = render(
      <CatalogLibrary service={service} onOpen={vi.fn()} onUnauthorized={unauthorized} />
    );

    await waitFor(() => expect(unauthorized).toHaveBeenCalledTimes(1));
    expect(container.querySelector('[data-library-list-error]')).toBeNull();
    expect(queryByText(/Você não tem acesso/)).toBeNull();
    expect(queryByText('Comece seu primeiro catálogo')).toBeNull();
  });
});

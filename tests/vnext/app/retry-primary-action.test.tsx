import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VNextServerAccessUnavailable } from '@/vnext/app/bootstrap';
import { CatalogOpenFailure } from '@/vnext/app/CatalogLibrary';

describe('FR-06 "Tentar novamente" is the main action when trying again can work', () => {
  afterEach(() => cleanup());

  it('on the access error, retry is primary and "Sair" is secondary', () => {
    const retry = vi.fn();
    const signOut = vi.fn();
    render(<VNextServerAccessUnavailable onRetry={retry} onSignOut={signOut} />);
    const retryButton = screen.getByRole('button', { name: 'Tentar novamente' });
    expect(retryButton).toHaveClass('is-primary');
    expect(screen.getByRole('button', { name: 'Sair' })).not.toHaveClass('is-primary');
    fireEvent.click(retryButton);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('when a catalog could not open for a network reason, retry is primary', () => {
    const retry = vi.fn();
    const back = vi.fn();
    render(<CatalogOpenFailure code="OFFLINE" onRetry={retry} onBack={back} />);
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toHaveClass('vnext-library-create');
    expect(screen.getByRole('button', { name: 'Voltar aos catálogos' })).not.toHaveClass('vnext-library-create');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('when retrying cannot help, going back is the only and main action', () => {
    render(<CatalogOpenFailure code="NOT_FOUND" onRetry={vi.fn()} onBack={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar aos catálogos' })).toHaveClass('vnext-library-create');
  });
});

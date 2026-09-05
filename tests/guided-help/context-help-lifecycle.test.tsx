import { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContextHelpDrawer } from '../../src/components/guided-help/ContextHelpDrawer';
import { ContextHelpTrigger } from '../../src/components/guided-help/ContextHelpTrigger';
import { LearnModeProvider } from '../../src/features/guided-help';

describe('AUD-004 — Context help lifecycle', () => {
  it('keeps the app rendered across closed → open → close → reopen', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <StrictMode>
        <LearnModeProvider>
          <main data-testid="app-shell">
            <ContextHelpTrigger helpId="library" />
            <ContextHelpTrigger helpId="family" />
            <ContextHelpDrawer />
          </main>
        </LearnModeProvider>
      </StrictMode>
    );

    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Entenda esta área' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Biblioteca de Produtos (Library)' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Entenda esta área' })[1]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Família de Produtos' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar painel de ajuda' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('Rendered more hooks'));

    consoleError.mockRestore();
  });
});

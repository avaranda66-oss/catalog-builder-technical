import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictDialog, type ConflictDialogResolution } from '@/vnext/app/editor/ConflictDialog';
import type { ConflictResolutionResult, ConflictResolutionState } from '@/vnext/persistence';

afterEach(cleanup);

function resolutionWith(overrides: Partial<ConflictDialogResolution> = {}) {
  return {
    openLatest: vi.fn(async (): Promise<ConflictResolutionResult> => ({ ok: true, catalogId: 'a', kind: 'latest' })),
    saveAsCopy: vi.fn(async (): Promise<ConflictResolutionResult> => ({ ok: true, catalogId: 'b', kind: 'copy' })),
    keepsLocalBackup: true,
    ...overrides,
  };
}

/** The dialog over an editor shell with one focusable control, like the real editor. */
function renderDialog(resolution = resolutionWith(), state: ConflictResolutionState = 'idle') {
  const view = render(
    <div data-vnext-shell="">
      <button type="button">Botão do editor</button>
      <ConflictDialog documentTitle="TA-25N" state={state} resolution={resolution} />
    </div>
  );
  return { ...view, resolution, shell: view.container.querySelector<HTMLElement>('[data-vnext-shell]')! };
}

describe('FR-43 conflict dialog', () => {
  it('blocks the editor and starts on the safe choice', () => {
    const { shell } = renderDialog();
    const dialog = screen.getByRole('alertdialog', { name: 'Este catálogo foi salvo em outro lugar enquanto você editava' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(shell.inert).toBe(true);
    expect(screen.getByRole('button', { name: 'Salvar meu trabalho como cópia' })).toHaveFocus();
    expect(dialog).toHaveTextContent('(recomendado)');
  });

  it('cannot be closed with Esc, because the work on screen could not be saved', () => {
    const { resolution } = renderDialog();
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(resolution.openLatest).not.toHaveBeenCalled();
    expect(resolution.saveAsCopy).not.toHaveBeenCalled();
  });

  it('asks before opening the latest version, with "Não, voltar" ready first', async () => {
    const { resolution } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir versão mais recente' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Tem certeza? O catálogo “TA-25N” vai mostrar a versão salva no outro lugar.');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Uma cópia de segurança delas fica guardada neste computador');
    expect(screen.getByRole('button', { name: 'Não, voltar' })).toHaveFocus();
    expect(resolution.openLatest).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sim, descartar minhas alterações' })); });
    expect(resolution.openLatest).toHaveBeenCalledTimes(1);
  });

  it('says plainly that the changes are lost when this computer keeps no backup', () => {
    renderDialog(resolutionWith({ keepsLocalBackup: false }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('As alterações desta tela não entram no catálogo e serão descartadas.');
    expect(screen.getByRole('alertdialog')).not.toHaveTextContent('cópia de segurança');
  });

  it('explains a refused "Abrir versão mais recente" inside the dialog and points to the copy', async () => {
    const resolution = resolutionWith({
      openLatest: vi.fn(async (): Promise<ConflictResolutionResult> => ({ ok: false, error: { code: 'LOCAL_PROTECTION_UNAVAILABLE' } })),
    });
    renderDialog(resolution);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir versão mais recente' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sim, descartar minhas alterações' })); });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível guardar a cópia de segurança neste computador, então nada foi descartado. Use “Salvar meu trabalho como cópia”.'
    );
    expect(screen.getByRole('button', { name: 'Salvar meu trabalho como cópia' })).toBeEnabled();
  });

  it('shows the work in progress and keeps both choices locked while one runs', () => {
    renderDialog(resolutionWith(), 'resolving-save-as-copy');
    expect(screen.getByRole('button', { name: 'Salvando cópia…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Abrir versão mais recente' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Aguarde, isso leva só alguns segundos.');
  });

  it('gives the editor back when the conflict is solved', () => {
    const { shell, unmount } = renderDialog();
    expect(shell.inert).toBe(true);
    unmount();
    expect(shell.inert).toBe(false);
  });
});

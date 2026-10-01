import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicationReview } from '@/vnext/app/PublicationReview';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { VNextError } from '@/vnext/domain';
import type { PublicationReviewResult, PublicationSource } from '@/vnext/publication/review';

const checks = vi.hoisted(() => ({ review: vi.fn(), verify: vi.fn(), release: vi.fn() }));
vi.mock('@/vnext/publication/review', async original => ({ ...await original<object>(),
  reviewPublication: checks.review, verifyPublicationForPrint: checks.verify, releasePublicationResources: checks.release }));

beforeEach(() => {
  vi.resetAllMocks();
  checks.review.mockImplementation(async (source: PublicationSource) => ({ status: 'READY', document: source.document,
    plans: new Map(), urls: new Map(), diagnostics: [], snapshot: { facts: [], geometryDiagnostics: [] } }));
  checks.verify.mockResolvedValue(undefined);
  vi.spyOn(window, 'print').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup(saved = true) {
  let id = 0;
  let source: PublicationSource | undefined = saved ? { document: createW2CDemoDocument(() => `dialog-${++id}`),
    openSessionId: 'open-a', remoteRevision: 1, authLineage: 'a', authorityScopeId: 'a', assetUrls: new Map() } : undefined;
  let listener = () => {};
  const close = vi.fn();
  const view = render(<PublicationReview getSource={() => source} subscribe={callback => { listener = callback; return () => {}; }} onClose={close} />);
  return { view, close, invalidate: () => { source = undefined; listener(); } };
}

describe('W5.C publication dialog guards', () => {
  it('guides an unsaved document back to the editor without running preflight', async () => {
    const { view } = setup(false);
    expect(view.getByRole('alert').textContent).toContain('Salve o catálogo');
    await waitFor(() => expect(view.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeDisabled());
    expect(checks.review).not.toHaveBeenCalled();
  });
  it('rechecks before explicit print and removes approval on source drift', async () => {
    const { view, invalidate } = setup();
    const button = view.getByRole('button', { name: 'Imprimir / salvar PDF' });
    await waitFor(() => expect(button).toBeEnabled());
    const host = document.querySelector<HTMLElement>('[data-publication-host]')!;
    fireEvent(window, new Event('beforeprint'));
    expect(host.dataset.printApproved).toBeUndefined();
    fireEvent.click(button);
    await waitFor(() => expect(window.print).toHaveBeenCalledOnce());
    expect(checks.verify).toHaveBeenCalledOnce(); expect(host.dataset.printApproved).toBe('true');
    act(invalidate);
    expect(button).toBeDisabled(); expect(host.dataset.printApproved).toBeUndefined();
    expect(view.getByRole('alert').textContent).toContain('acesso mudou');
  });
  it('does not print after the user closes during async final verification', async () => {
    let resume = () => {};
    checks.verify.mockImplementation(async (_result: PublicationReviewResult, _root: HTMLElement, current: () => boolean) => {
      await new Promise<void>(resolve => { resume = resolve; });
      if (!current()) throw new VNextError('PUBLICATION_SOURCE_CHANGED');
    });
    const { view, close } = setup();
    const button = view.getByRole('button', { name: 'Imprimir / salvar PDF' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(view.getByRole('button', { name: 'Voltar ao editor' }));
    expect(close).toHaveBeenCalledOnce(); view.unmount();
    await act(async () => { resume(); });
    expect(window.print).not.toHaveBeenCalled(); expect(checks.release).toHaveBeenCalledOnce();
  });
  it('disables print when the final verification fails', async () => {
    checks.verify.mockRejectedValue(new VNextError('PDF_EXPORT_BLOCKED'));
    const { view } = setup();
    const button = view.getByRole('button', { name: 'Imprimir / salvar PDF' });
    await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
    await waitFor(() => expect(view.getByRole('alert').textContent).toContain('não pôde ser verificada'));
    expect(button).toBeDisabled(); expect(window.print).not.toHaveBeenCalled();
  });
  it('releases resources from a cancelled in-flight review', async () => {
    let complete = (_result: PublicationReviewResult) => {};
    checks.review.mockImplementation(() => new Promise<PublicationReviewResult>(resolve => { complete = resolve; }));
    const { view } = setup();
    await waitFor(() => expect(checks.review).toHaveBeenCalledOnce()); view.unmount();
    let id = 0;
    const checked = { status: 'BLOCKED' as const, document: createW2CDemoDocument(() => `cancelled-${++id}`), plans: new Map(), urls: new Map(), diagnostics: [] };
    await act(async () => { complete(checked); });
    expect(checks.release).toHaveBeenCalledWith(checked); expect(window.print).not.toHaveBeenCalled();
  });
});

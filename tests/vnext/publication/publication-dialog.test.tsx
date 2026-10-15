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

function setup(saved = true, onLocateDiagnostic?: (diagnostic: import('@/vnext/domain').Diagnostic) => void, waitingMessage?: string) {
  let id = 0;
  const catalog = createW2CDemoDocument(() => `dialog-${++id}`);
  const savedSource = (remoteRevision = 1): PublicationSource => ({ document: catalog,
    openSessionId: 'open-a', remoteRevision, authLineage: 'a', authorityScopeId: 'a', assetUrls: new Map() });
  let source: PublicationSource | undefined = saved ? savedSource() : undefined;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of [...listeners]) listener(); };
  const close = vi.fn();
  const view = render(<PublicationReview getSource={() => source} subscribe={callback => { listeners.add(callback); return () => { listeners.delete(callback); }; }}
    onClose={close} onLocateDiagnostic={onLocateDiagnostic} waitingMessage={waitingMessage} />);
  return {
    view, close, listeners,
    invalidate: () => { source = undefined; notify(); },
    save: (remoteRevision = 2) => { source = savedSource(remoteRevision); notify(); },
  };
}

describe('W5.C publication dialog guards', () => {
  it('FR-50 waits for an unsaved document to be saved and then checks it without reopening', async () => {
    const { view, save, listeners } = setup(false);
    expect(view.getByRole('status')).toHaveTextContent('Salvando o catálogo… A verificação começa sozinha');
    expect(document.querySelector('[data-publication-host]')).toHaveAttribute('data-publication-status', 'WAITING');
    await waitFor(() => expect(view.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeDisabled());
    expect(checks.review).not.toHaveBeenCalled();
    expect(listeners.size).toBeGreaterThan(0);
    act(() => save(2));
    await waitFor(() => expect(view.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeEnabled());
    expect(checks.review).toHaveBeenCalledOnce();
    expect(checks.review.mock.calls[0][0]).toMatchObject({ remoteRevision: 2 });
    expect(view.getByRole('status')).toHaveTextContent('Pronto para imprimir ou salvar PDF.');
  });
  it('FR-50 never shows BLOCKED between the save and the start of the check', async () => {
    const statuses: string[] = [];
    const observer = new MutationObserver(() => statuses.push(document.querySelector('[data-publication-host]')?.getAttribute('data-publication-status') ?? ''));
    const { save } = setup(false);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-publication-status'] });
    act(() => save(2));
    await waitFor(() => expect(document.querySelector('[data-publication-host]')).toHaveAttribute('data-publication-status', 'READY'));
    observer.disconnect();
    expect(statuses).not.toContain('BLOCKED');
  });
  it('explains a save problem while waiting instead of looking stuck', async () => {
    const { view } = setup(false, undefined, 'Não foi possível salvar agora. Confira a conexão e tente Salvar novamente.');
    expect(view.getByRole('status')).toHaveTextContent('Não foi possível salvar agora.');
    expect(view.getByRole('status')).toHaveAttribute('data-tone', 'warning');
    await waitFor(() => expect(view.getByRole('button', { name: 'Verificar novamente' })).toBeInTheDocument());
  });
  it('"Verificar novamente" re-reads the saved version and runs every check again', async () => {
    const { view, invalidate, save } = setup();
    await waitFor(() => expect(view.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeEnabled());
    act(invalidate);
    expect(view.getByRole('alert')).toHaveTextContent('Clique em Verificar novamente');
    act(() => save(3));
    fireEvent.click(view.getByRole('button', { name: 'Verificar novamente' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeEnabled());
    expect(checks.review).toHaveBeenCalledTimes(2);
    expect(checks.review.mock.calls[1][0]).toMatchObject({ remoteRevision: 3 });
    expect(checks.release).toHaveBeenCalledOnce();
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
  it('suggests the catalog filename only while printing and restores the app title afterward', async () => {
    document.title = 'Editor de catálogos';
    checks.review.mockImplementation(async (source: PublicationSource) => ({ status: 'READY', document: { ...source.document, title: 'TA-25N: ensaio / técnico.pdf' },
      plans: new Map(), urls: new Map(), diagnostics: [], snapshot: { facts: [], geometryDiagnostics: [] } }));
    const { view } = setup();
    const button = view.getByRole('button', { name: 'Imprimir / salvar PDF' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(window.print).toHaveBeenCalledOnce());
    expect(document.title).toBe('TA-25N ensaio técnico');
    fireEvent(window, new Event('afterprint'));
    expect(document.title).toBe('Editor de catálogos');
    expect(document.querySelector('[data-publication-host]')).not.toHaveAttribute('data-print-approved');
    // FR-52: one line; the page CSS already forces A4, margins, scale and background colours.
    const instruction = document.querySelector('[data-publication-print-instruction]')!;
    expect(instruction).toHaveTextContent('Na janela que abrir, escolha Salvar como PDF (em Destino ou Impressora) e clique em Salvar.');
    expect(view.queryByRole('list', { name: 'Como salvar o PDF' })).toBeNull();
    expect(view.queryByText(/100%|margens|segundo plano/)).toBeNull();
  });
  it('restores the app title when closing a print review without an afterprint event', async () => {
    document.title = 'Editor de catálogos';
    const { view } = setup();
    const button = view.getByRole('button', { name: 'Imprimir / salvar PDF' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(window.print).toHaveBeenCalledOnce());
    view.unmount();
    expect(document.title).toBe('Editor de catálogos');
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
  it('shows an actionable blocked issue and preserves exact evidence in a closed disclosure', async () => {
    checks.review.mockImplementation(async (source: PublicationSource) => ({ status: 'BLOCKED', document: source.document,
      plans: new Map(), urls: new Map(), diagnostics: [{ code: 'TABLE_WIDTH_INFEASIBLE', severity: 'ERROR',
        details: 'Fixed widths and minima exceed frame', pageId: source.document.pages[0].id }] }));
    const { view } = setup();
    await waitFor(() => expect(view.getByText(/As larguras das colunas não cabem/)).toBeInTheDocument());
    expect(view.getByText('Página 1')).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeDisabled();
    const detail = view.getByText('Detalhes técnicos').closest('details')!;
    expect(detail.open).toBe(false);
    expect(detail).toHaveTextContent('TABLE_WIDTH_INFEASIBLE');
    expect(detail).toHaveTextContent('Fixed widths and minima exceed frame');
    expect(detail).toHaveTextContent('dialog-2');
    expect(view.getByText(/As larguras das colunas não cabem/)).not.toHaveTextContent('TABLE_WIDTH_INFEASIBLE');
  });
  it('labels a warning as a review point without changing the engine ready status', async () => {
    checks.review.mockImplementation(async (source: PublicationSource) => ({ status: 'READY', document: source.document,
      plans: new Map(), urls: new Map(), diagnostics: [{ code: 'SAFE_AREA_VIOLATION', severity: 'WARNING',
        details: 'Authored frame crosses configured safe area', pageId: source.document.pages[0].id }],
      snapshot: { facts: [], geometryDiagnostics: [] } }));
    const { view } = setup();
    await waitFor(() => expect(view.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeEnabled());
    expect(view.getByRole('heading', { name: 'Pontos para revisar' })).toBeInTheDocument();
    expect(view.getByText('Revisar', { exact: true })).toBeInTheDocument();
    expect(document.querySelector('[data-publication-host]')).toHaveAttribute('data-publication-status', 'READY');
  });
  it('opens the exact diagnostic location only while its source is current', async () => {
    checks.review.mockImplementation(async (source: PublicationSource) => ({ status: 'BLOCKED', document: source.document,
      plans: new Map(), urls: new Map(), diagnostics: [{ code: 'TEXT_OBJECT_OVERFLOW', severity: 'ERROR',
        details: 'Overflow', pageId: source.document.pages[0].id, objectId: 'overflowing-text-object' }] }));
    const locate = vi.fn();
    const { view, close, invalidate } = setup(true, locate);
    const button = await view.findByRole('button', { name: 'Corrigir este item' });
    fireEvent.click(button);
    expect(close).toHaveBeenCalledOnce();
    expect(locate).toHaveBeenCalledWith(expect.objectContaining({ code: 'TEXT_OBJECT_OVERFLOW', pageId: expect.any(String), objectId: expect.any(String) }));
    act(invalidate);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(locate).toHaveBeenCalledOnce();
    expect(window.print).not.toHaveBeenCalled();
  });
  it('FR-51 quotes the provisional text and still offers the exact location', async () => {
    checks.review.mockImplementation(async (source: PublicationSource) => ({ status: 'BLOCKED', document: source.document,
      plans: new Map(), urls: new Map(), diagnostics: [{ code: 'UNRESOLVED_PLACEHOLDER', severity: 'ERROR',
        details: 'surface=text; token=A COMPLETAR', pageId: source.document.pages[0].id, objectId: 'any-text' }] }));
    const locate = vi.fn();
    const { view } = setup(true, locate);
    await waitFor(() => expect(view.getByText('Ainda está escrito “A COMPLETAR”. Troque pela informação correta antes de publicar.')).toBeInTheDocument());
    expect(view.getByRole('heading', { name: 'Itens para corrigir' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeDisabled();
    fireEvent.click(view.getByRole('button', { name: 'Corrigir este item' }));
    expect(locate).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNRESOLVED_PLACEHOLDER', objectId: 'any-text' }));
  });
});

import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '../../../src/vnext/application';
import { createInsertSpec } from '../../../src/vnext/app/editor-defaults';
import { CatalogNativeComposer } from '../../../src/vnext/ai-catalog/CatalogNativeComposer';
import { VerifiedPdfTableReview } from '../../../src/vnext/ai-catalog/VerifiedPdfTableReview';
import type { NativeComposeFunctionsClient } from '../../../src/vnext/ai-catalog/native-compose-client';
import type { NativePdfCellFillPreview } from '../../../src/vnext/ai-catalog/native-pdf-cell-fill';

const verification = vi.hoisted(() => ({ prepare: vi.fn(), approve: vi.fn() }));
vi.mock('../../../src/vnext/ai-catalog/native-pdf-cell-fill', () => ({
  prepareNativePdfCellFill: verification.prepare,
  approveNativePdfCellFill: verification.approve,
}));
vi.mock('../../../src/vnext/ai-catalog/ProviderCredentialsSettings', () => ({
  ProviderCredentialsSettings: ({ onUnlock }: { onUnlock: (provider: 'gemini', key: string) => void }) =>
    <button type="button" onClick={() => onUnlock('gemini', 'qa-fake-only-unlock')}>Autorizar teste local</button>,
}));

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
beforeEach(() => { verification.prepare.mockReset(); verification.approve.mockReset(); });
afterEach(() => { cleanup(); localStorage.clear(); });
afterAll(() => vi.unstubAllGlobals());
const id = () => crypto.randomUUID();
const makeSession = () => createDocumentSession(createCatalogDocument(id, 'Revisão local'), { createId: id });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function pdfFile(name: string) {
  const file = new File([], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(8) });
  return file;
}
function manifestFile(name = 'manifest.json') {
  const file = new File([], name, { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => JSON.stringify({
    sources: [{ sourceId: 'first', fileName: 'first.pdf', revision: '1' }], proposal: {},
  }) });
  return file;
}
async function startVerification() {
  const session = makeSession();
  const before = structuredClone(session.getSnapshot().document);
  const held = deferred<NativePdfCellFillPreview>();
  verification.prepare.mockReturnValue(held.promise);
  const props = { session, target: { pageId: id(), objectId: id() } };
  const ui = render(<VerifiedPdfTableReview {...props} />);
  fireEvent.click(screen.getByText('Preencher tabela com PDFs (revisão técnica)'));
  fireEvent.change(screen.getByLabelText('PDFs originais para validação'), { target: { files: [pdfFile('first.pdf')] } });
  fireEvent.change(screen.getByLabelText('Manifesto das fontes PDF'), { target: { files: [manifestFile()] } });
  fireEvent.click(screen.getByRole('button', { name: 'Conferir citações nos PDFs' }));
  await waitFor(() => expect(verification.prepare).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: 'Conferindo arquivos…' })).toBeDisabled();
  const preview: NativePdfCellFillPreview = {
    documentId: before.id, revision: 0, tableId: id(), pageId: id(), objectId: id(),
    verifiedCells: 1, missingCells: 0, cells: [], pdfHashes: [],
  };
  return { session, before, held, preview, props, ui };
}

describe('Independent UI cancellation preserves document and permits another request', () => {
  it.each(['PDFs', 'manifesto'] as const)('recovers when %s changes during pending source verification', async changed => {
    const f = await startVerification();
    if (changed === 'PDFs') fireEvent.change(screen.getByLabelText('PDFs originais para validação'), { target: { files: [pdfFile('replacement.pdf')] } });
    else fireEvent.change(screen.getByLabelText('Manifesto das fontes PDF'), { target: { files: [manifestFile('replacement.json')] } });
    await act(async () => { f.held.resolve(f.preview); });
    expect(f.session.getSnapshot().document).toEqual(f.before);
    expect(verification.approve).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Revisar valores e citações PDF' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conferir citações nos PDFs' })).toBeEnabled();
  });

  it('shows the completed source preview when inputs did not change, without applying it', async () => {
    const f = await startVerification();
    await act(async () => { f.held.resolve(f.preview); });
    expect(screen.getByRole('group', { name: 'Revisar valores e citações PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conferir citações nos PDFs' })).toBeEnabled();
    expect(verification.approve).not.toHaveBeenCalled();
    expect(f.session.getSnapshot().document).toEqual(f.before);
  });
});

async function startComposerRequest() {
  const session = makeSession();
  const page = session.getSnapshot().document.pages[0];
  expect(session.execute({ type: 'object.insert', pageId: page.id, object: createInsertSpec('text', page) }).ok).toBe(true);
  const object = session.getSnapshot().document.pages[0].objects[0];
  if (object.type !== 'text') throw new Error('Expected real selected text');
  const selected = { objectId: object.id, text: object.text };
  const before = structuredClone(session.getSnapshot().document);
  const held = deferred<{ data: { reply: unknown }; error: null }>();
  const invoke = vi.fn(() => held.promise);
  const client = { functions: { invoke } } as NativeComposeFunctionsClient;
  const props = { session, documentId: before.id, ownerScope: 'qa-local', client, selected };
  const ui = render(<CatalogNativeComposer {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Conectar Gemini' }));
  fireEvent.click(screen.getByRole('button', { name: 'Autorizar teste local' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), {
    target: { value: 'Organize uma apresentação editorial do catálogo.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Enviar ao Gemini/ }));
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('status')).toHaveTextContent('Gemini está preparando');
  return { session, before, held, invoke, ui, props };
}
const clarification = { data: { reply: { status: 'clarification' as const, question: 'Qual seção editorial devemos organizar?' } }, error: null };

describe('Independent delayed composer cancellation', () => {
  it.each(['selected-object', 'rewrite-mode', 'next-draft'] as const)('recovers after %s changes while a valid request is pending', async change => {
    const f = await startComposerRequest();
    if (change === 'selected-object') f.ui.rerender(<CatalogNativeComposer {...f.props} selected={undefined} />);
    else if (change === 'rewrite-mode') fireEvent.click(screen.getByRole('button', { name: 'Reescrever este texto com Gemini' }));
    else fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), { target: { value: 'Próximo pedido editorial.' } });
    await act(async () => { f.held.resolve(clarification); });
    expect(f.session.getSnapshot().document).toEqual(f.before);
    expect(f.invoke).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(clarification.data.reply.question)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Peça uma nova apresentação editorial.' } });
    expect(screen.getByRole('button', { name: /(?:Enviar|Pedir reescrita) ao Gemini/ })).toBeEnabled();
  });

  it('finishes an unchanged request and shows its clarification without document edits', async () => {
    const f = await startComposerRequest();
    await act(async () => { f.held.resolve(clarification); });
    expect(screen.getByRole('log')).toHaveTextContent(clarification.data.reply.question);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(f.session.getSnapshot().document).toEqual(f.before);
    expect(f.invoke).toHaveBeenCalledTimes(1);
  });
});

// Both arrival orders matter: the obsolete completion must neither release a
// newer request's controls nor replace a preview which that request has issued.
const obsoleteCompletions = [
  ['resolve', 'while-current-pending'], ['reject', 'while-current-pending'],
  ['resolve', 'after-current-preview'], ['reject', 'after-current-preview'],
] as const;

describe('Independent ownership of overlapping PDF verifications', () => {
  it.each(obsoleteCompletions)('ignores obsolete %s %s and preserves only the current source preview', async (outcome, order) => {
    const f = await startVerification();
    const next = deferred<NativePdfCellFillPreview>();
    verification.prepare.mockReturnValue(next.promise);
    // A different upload can legitimately keep the same name in the manifest.
    fireEvent.change(screen.getByLabelText('PDFs originais para validação'), { target: { files: [pdfFile('first.pdf')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferir citações nos PDFs' }));
    await waitFor(() => expect(verification.prepare).toHaveBeenCalledTimes(2));
    const current = { ...f.preview, verifiedCells: 2, cells: [{
      rowLabel: 'Campo atual', model: 'Modelo atual', cellId: id(),
      status: 'known' as const, displayValue: '00024', unit: '',
    }] };
    if (order === 'after-current-preview') await act(async () => { next.resolve(current); });
    await act(async () => {
      if (outcome === 'resolve') f.held.resolve({ ...f.preview, cells: [{
        rowLabel: 'Campo obsoleto', model: 'Modelo anterior', cellId: id(),
        status: 'known' as const, displayValue: '00017', unit: '',
      }] });
      else f.held.reject(new Error('obsolete PDF verification failed'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Campo obsoleto/)).not.toBeInTheDocument();
    expect(f.session.getSnapshot().document).toEqual(f.before);
    expect(verification.approve).not.toHaveBeenCalled();
    if (order === 'while-current-pending') {
      expect(screen.getByRole('button', { name: 'Conferindo arquivos…' })).toBeDisabled();
      expect(screen.queryByRole('group', { name: 'Revisar valores e citações PDF' })).not.toBeInTheDocument();
      await act(async () => { next.resolve(current); });
    }
    expect(screen.getByRole('group', { name: 'Revisar valores e citações PDF' })).toHaveTextContent('Campo atual / Modelo atual');
    expect(screen.getByRole('group', { name: 'Revisar valores e citações PDF' })).toHaveTextContent('00024');
    expect(screen.getByRole('button', { name: 'Conferir citações nos PDFs' })).toBeEnabled();
    expect(f.session.getSnapshot().document).toEqual(f.before);
    expect(verification.approve).not.toHaveBeenCalled();
  });

  it('invalidates a pending preview when the selected table changes and permits verification of the new target', async () => {
    const f = await startVerification();
    const target = { pageId: f.props.target.pageId, objectId: id() };
    f.ui.rerender(<VerifiedPdfTableReview {...f.props} target={target} />);
    await act(async () => { f.held.resolve(f.preview); });
    expect(screen.queryByRole('group', { name: 'Revisar valores e citações PDF' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conferir citações nos PDFs' })).toBeEnabled();
    const next = deferred<NativePdfCellFillPreview>();
    verification.prepare.mockReturnValue(next.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Conferir citações nos PDFs' }));
    await waitFor(() => expect(verification.prepare).toHaveBeenCalledTimes(2));
    expect(verification.prepare.mock.calls[1][1]).toEqual(target);
    await act(async () => { next.resolve({ ...f.preview, ...target }); });
    expect(screen.getByRole('group', { name: 'Revisar valores e citações PDF' })).toBeInTheDocument();
    expect(verification.approve).not.toHaveBeenCalled();
    expect(f.session.getSnapshot().document).toEqual(f.before);
  });

  it('shows a current verification failure and permits a successful retry without applying values', async () => {
    const f = await startVerification();
    await act(async () => { f.held.reject(new Error('current verification failed')); });
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível atestar as fontes');
    expect(screen.getByRole('button', { name: 'Conferir citações nos PDFs' })).toBeEnabled();
    const next = deferred<NativePdfCellFillPreview>();
    verification.prepare.mockReturnValue(next.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Conferir citações nos PDFs' }));
    await waitFor(() => expect(verification.prepare).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => { next.resolve(f.preview); });
    expect(screen.getByRole('group', { name: 'Revisar valores e citações PDF' })).toBeInTheDocument();
    expect(verification.approve).not.toHaveBeenCalled();
    expect(f.session.getSnapshot().document).toEqual(f.before);
  });

  it.each(['resolve', 'reject'] as const)('discards obsolete %s after the PDF review is unmounted', async outcome => {
    const f = await startVerification();
    f.ui.unmount();
    render(<VerifiedPdfTableReview {...f.props} />);
    await act(async () => {
      if (outcome === 'resolve') f.held.resolve(f.preview);
      else f.held.reject(new Error('unmounted PDF verification failed'));
    });
    expect(screen.queryByRole('group', { name: 'Revisar valores e citações PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(verification.approve).not.toHaveBeenCalled();
    expect(f.session.getSnapshot().document).toEqual(f.before);
  });
});

const editorialReply = (label: string) => ({ data: { reply: {
  version: 1, status: 'proposal', summary: 'Somente proposta editorial ' + label + '.',
  pages: [{ type: 'cover', heading: 'Conteúdo editorial ' + label }],
} }, error: null });

describe('Independent ownership of overlapping composer requests', () => {
  it.each(obsoleteCompletions)('ignores obsolete %s %s; only the current proposal can be approved', async (outcome, order) => {
    const f = await startComposerRequest();
    const next = deferred<{ data: { reply: unknown }; error: null }>();
    f.invoke.mockReturnValue(next.promise);
    fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), { target: { value: 'Crie a capa editorial atual.' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar ao Gemini/ }));
    await waitFor(() => expect(f.invoke).toHaveBeenCalledTimes(2));
    if (order === 'after-current-preview') await act(async () => { next.resolve(editorialReply('atual')); });
    await act(async () => {
      if (outcome === 'resolve') f.held.resolve(editorialReply('obsoleto'));
      else f.held.reject(new Error('obsolete provider request failed'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Somente proposta editorial obsoleto/)).not.toBeInTheDocument();
    expect(screen.getByRole('log')).not.toHaveTextContent('Conteúdo editorial obsoleto');
    expect(f.session.getSnapshot().document).toEqual(f.before);
    if (order === 'while-current-pending') {
      expect(screen.getByRole('status')).toHaveTextContent('Gemini está preparando');
      expect(screen.getByRole('button', { name: 'Preparando…' })).toBeDisabled();
      expect(screen.queryByRole('group', { name: 'Proposta de páginas' })).not.toBeInTheDocument();
      await act(async () => { next.resolve(editorialReply('atual')); });
    }
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Proposta de páginas' })).toHaveTextContent('Conteúdo editorial atual');
    expect(f.session.getSnapshot().document).toEqual(f.before);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e inserir no catálogo' }));
    const approved = structuredClone(f.session.getSnapshot().document);
    expect(approved.pages).toHaveLength(f.before.pages.length + 1);
    expect(JSON.stringify(approved)).toContain('Conteúdo editorial atual');
    expect(JSON.stringify(approved)).not.toContain('Conteúdo editorial obsoleto');
    expect(screen.queryByRole('group', { name: 'Proposta de páginas' })).not.toBeInTheDocument();
    expect(f.session.undo().ok).toBe(true);
    expect(f.session.getSnapshot().document).toEqual(f.before);
    expect(f.session.redo().ok).toBe(true);
    expect(f.session.getSnapshot().document).toEqual(approved);
  });

  it('shows a current provider failure and allows retry with explicit approval still required', async () => {
    const f = await startComposerRequest();
    await act(async () => { f.held.reject(new Error('current provider request failed')); });
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível consultar o Gemini');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    const next = deferred<{ data: { reply: unknown }; error: null }>();
    f.invoke.mockReturnValue(next.promise);
    fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), { target: { value: 'Tente a capa editorial novamente.' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar ao Gemini/ }));
    await waitFor(() => expect(f.invoke).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => { next.resolve(editorialReply('atual')); });
    expect(screen.getByRole('group', { name: 'Proposta de páginas' })).toBeInTheDocument();
    expect(f.session.getSnapshot().document).toEqual(f.before);
  });

  it.each(['resolve', 'reject'] as const)('discards obsolete %s after composer unmount without persisting an assistant turn', async outcome => {
    const f = await startComposerRequest();
    const historyBefore = { ...localStorage };
    f.ui.unmount();
    await act(async () => {
      if (outcome === 'resolve') f.held.resolve(editorialReply('obsoleto'));
      else f.held.reject(new Error('unmounted provider request failed'));
    });
    expect({ ...localStorage }).toEqual(historyBefore);
    expect(f.session.getSnapshot().document).toEqual(f.before);
    expect(f.invoke).toHaveBeenCalledTimes(1);
  });
});

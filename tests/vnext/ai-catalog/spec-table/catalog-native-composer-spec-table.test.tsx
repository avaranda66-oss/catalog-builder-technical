import { webcrypto } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '@/vnext/application';
import type { TableObject } from '@/vnext/domain';
import { CatalogNativeComposer } from '@/vnext/ai-catalog/CatalogNativeComposer';
import type { NativeComposeFunctionsClient } from '@/vnext/ai-catalog/native-compose-client';
import type { DraftClient } from '@/vnext/ai-catalog/draft-client';
import { clearByokCredential } from '@/vnext/ai-catalog/byok-session';
import { forgetSourceIntakeSessions } from '@/vnext/ai-catalog/intake/intake-store';
import { serverSpecTableGateway } from '@/vnext/ai-catalog/spec-table/spec-table-gateway';
import { SPEC_TABLE_ACTION_MANY, SPEC_TABLE_ACTION_ONE } from '@/vnext/ai-catalog/spec-table/useSpecTableDraft';
import {
  FOLDER_FILE, MANUAL_FILE, controlledAnswers, folderPdfBytes, manualPdfBytes,
} from '../../proof/father-journeys/fixtures/spec-table-facts.mjs';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { cleanup(); forgetSourceIntakeSessions(); localStorage.clear(); clearByokCredential(); vi.restoreAllMocks(); });
afterAll(() => vi.unstubAllGlobals());

const USER = '0f8fad5b-d9cb-469f-a165-70867728950e';
const httpFailure = (status: number, body: unknown) => ({ data: null, error: Object.assign(new Error('non-2xx'),
  { name: 'FunctionsHttpError', context: { status, clone() { return this; }, json: async () => body } }) });
const composerClient = { functions: { invoke: vi.fn(async () => ({ data: { code: 'OK', status: { enabled: true,
  mode: 'bounded-acceptance', serverKey: true, byok: false, remainingMicrousd: null, callReserveMicrousd: 7800 } }, error: null })) } } as unknown as NativeComposeFunctionsClient;

/** The function vnext-catalog-draft: not deployed yet (404, as production today) or answering controlled sheets. */
function draftClient(deployed: boolean) {
  const answers = controlledAnswers().answers;
  const uploads: string[] = [];
  const invoke = vi.fn(async (_name: string, { body }: { body: { task: string; source?: { path: string; fileName: string } } }) => {
    if (!deployed) return httpFailure(404, { code: 'NOT_FOUND', message: 'Requested function was not found' });
    if (body.task === 'status') return { data: { code: 'OK', status: { serverKey: true, budget: 'ok' } }, error: null };
    if (!body.source || !uploads.includes(body.source.path)) return httpFailure(404, { code: 'SOURCE_NOT_FOUND' });
    return { data: { code: 'OK', extraction: { promptVersion: 'p', model: 'controlado', sheet: answers[body.source.fileName],
      trimmed: 0, usage: { inputTokens: 1, outputTokens: 1, estimatedUsd: 0 }, ms: 1 } }, error: null };
  });
  const upload = vi.fn(async (path: string) => {
    if (!deployed) return { data: null, error: { statusCode: '404', message: 'Bucket not found' } };
    uploads.push(path);
    return { data: { path }, error: null };
  });
  const client = { functions: { invoke }, storage: { from: () => ({ upload }) } } as unknown as DraftClient;
  return { client, invoke, upload };
}

function make(deployed: boolean) {
  const doc = createCatalogDocument(() => crypto.randomUUID(), 'TA');
  const session = createDocumentSession(doc, { createId: () => crypto.randomUUID() });
  const draft = draftClient(deployed);
  const onShowTable = vi.fn();
  render(<CatalogNativeComposer documentId={doc.id} session={session} ownerScope="user:01" client={composerClient}
    onBeforeMutation={() => true} activePageId={doc.pages[0].id} onShowTable={onShowTable}
    factExtraction={serverSpecTableGateway(draft.client, USER)} />);
  return { doc, session, draft, onShowTable };
}
const pdf = (bytes: Uint8Array, name: string) => new File([bytes.slice().buffer as ArrayBuffer], name, { type: 'application/pdf' });
async function attach(files: File[]) {
  fireEvent.change(screen.getByLabelText('Escolher arquivos'), { target: { files } });
}
const tables = (session: ReturnType<typeof createDocumentSession>) => session.getSnapshot().document.pages
  .flatMap(page => page.objects.filter((object): object is TableObject => object.type === 'table'));

describe('J2-lite inside the chat: a verified specification table from the dropped PDFs', () => {
  it('when the server reading is not deployed it says so plainly, sends no file and changes nothing', async () => {
    const { doc, session, draft } = make(false);
    await attach([pdf(folderPdfBytes(), FOLDER_FILE)]);
    const start = await screen.findByRole('button', { name: SPEC_TABLE_ACTION_ONE }, { timeout: 20000 });
    expect(screen.getByText(/Só vai para a IA o PDF que você mandar ler/)).toBeInTheDocument();
    fireEvent.click(start);
    const alert = await screen.findByText(/A leitura de arquivos pela IA ainda não está disponível/);
    expect(alert.textContent).toMatch(/Nada foi alterado no catálogo\.$/);
    expect(draft.upload).not.toHaveBeenCalled();
    expect(draft.invoke.mock.calls.map(([, options]) => (options as { body: { task: string } }).body.task)).toEqual(['status']);
    expect(session.getSnapshot().document).toEqual(doc);
    // The request stays in the conversation as the person's own words.
    expect(screen.getByRole('log').textContent).toContain(SPEC_TABLE_ACTION_ONE);
  }, 30000);

  it('pages → pending → conflict choice → preview → Aplicar in one transaction → Desfazer', async () => {
    const { doc, session, draft, onShowTable } = make(true);
    await attach([pdf(folderPdfBytes(), FOLDER_FILE), pdf(manualPdfBytes(), MANUAL_FILE)]);
    fireEvent.click(await screen.findByRole('button', { name: SPEC_TABLE_ACTION_MANY }, { timeout: 20000 }));

    const pages = await screen.findByRole('group', { name: 'Páginas do PDF para a IA ler' }, { timeout: 20000 });
    expect(within(pages).getByText('Achei especificações na página 9. Se não for, mude abaixo.')).toBeInTheDocument();
    expect(within(pages).getByText('Achei especificações na página 5. Se não for, mude abaixo.')).toBeInTheDocument();
    expect(within(pages).getByText(/o PDF vai para o servidor da empresa e para a IA do Google/)).toBeInTheDocument();
    const [from] = within(pages).getAllByRole('spinbutton', { name: 'Da página' });
    // A range that does not exist is refused here, before anything is sent.
    fireEvent.change(from, { target: { value: '11' } });
    fireEvent.click(within(pages).getByRole('button', { name: 'Ler estas páginas' }));
    expect(await within(pages).findByRole('alert')).toHaveTextContent(`${FOLDER_FILE}: Escolha páginas entre 1 e 10.`);
    expect(draft.upload).not.toHaveBeenCalled();
    fireEvent.change(within(pages).getAllByRole('spinbutton', { name: 'Da página' })[0], { target: { value: '9' } });
    fireEvent.click(within(pages).getByRole('button', { name: 'Ler estas páginas' }));

    const preview = await screen.findByRole('group', { name: 'Prévia da tabela de especificações' }, { timeout: 20000 });
    const extractions = draft.invoke.mock.calls.map(([, options]) => (options as { body: Record<string, unknown> }).body)
      .filter(body => body.task === 'extract_facts');
    expect(extractions.map(body => [(body.source as { fileName: string }).fileName, (body.source as { firstPage: number }).firstPage,
      (body.source as { lastPage: number }).lastPage])).toEqual([[FOLDER_FILE, 9, 9], [MANUAL_FILE, 5, 5]]);
    // No credential ever leaves the browser: the server key reads the file.
    expect(JSON.stringify(extractions)).not.toMatch(/key|credential|byok/i);
    expect(within(preview).getByText('6 valores conferidos no PDF entram na tabela. 6 ficam em branco para você conferir (veja as Pendências acima).')).toBeInTheDocument();
    expect(within(preview).getByRole('table')).toHaveTextContent('10.5 kg');

    const pending = screen.getByRole('group', { name: 'Pendências antes de inserir' });
    expect(within(pending).getByRole('heading', { name: 'Pendências (7)' })).toBeInTheDocument();
    fireEvent.click(within(pending).getByRole('button', { name: 'Usar -25 °C to +155 °C' }));
    expect(within(pending).getByRole('heading', { name: 'Pendências (6)' })).toBeInTheDocument();
    expect(within(preview).getByText('7 valores conferidos no PDF entram na tabela. 5 ficam em branco para você conferir (veja as Pendências acima).')).toBeInTheDocument();
    expect(session.getSnapshot().document).toEqual(doc);

    fireEvent.click(within(preview).getByRole('button', { name: 'Aplicar' }));
    expect(tables(session)).toHaveLength(1);
    const inserted = await screen.findByText('Tabela inserida na página 1. 6 valores ficaram para conferir: veja as Pendências. Use Desfazer se precisar.');
    expect(onShowTable).toHaveBeenCalledWith(doc.pages[0].id, tables(session)[0].id);
    expect(screen.queryByRole('group', { name: 'Prévia da tabela de especificações' })).toBeNull();
    // After insertion the list stays to find each cell, and choices can no longer change the table.
    const after = screen.getByRole('group', { name: 'Pendências da tabela inserida' });
    expect(within(after).queryByRole('button', { name: /^Usar / })).toBeNull();
    fireEvent.click(within(after).getByRole('button', { name: 'Mostrar na tabela: TA-25N · Resolution' }));
    expect(onShowTable).toHaveBeenLastCalledWith(doc.pages[0].id, tables(session)[0].id);

    fireEvent.click(within(inserted.closest('.ai-chat-bubble') as HTMLElement).getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(session.getSnapshot().document).toEqual(doc));
  }, 60000);
});

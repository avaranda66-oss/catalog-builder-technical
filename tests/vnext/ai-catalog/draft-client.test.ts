import { describe, expect, it, vi } from 'vitest';
import {
  DRAFT_FUNCTION_NAME, DraftRequestError, draftErrorMessage, draftReadinessText, extractFactsFromFile, readDraftReadiness,
  requestFactExtraction, sourceMimeType, storeSourceFile, type DraftClient,
} from '../../../src/vnext/ai-catalog/draft-client';
import { DRAFT_ERROR_CODES } from '../../../src/vnext/ai-catalog/draft-codes';
import type { ExtractedPdf } from '../../../src/vnext/ai-catalog/pdf-intake';

const USER = '0f8fad5b-d9cb-469f-a165-70867728950e';
const SHA = 'a'.repeat(64);
const BYTES = new TextEncoder().encode('%PDF-1.7 fake');
const SHEET = { title: 'TA', models: ['TA-25N'], sections: [], sharedTables: [], pages: [{ page: 6, content: 'no-specifications' }] };
const OK = { code: 'OK', extraction: { promptVersion: 'fr66-2026-10-17.3', model: 'gemini-3.8-flash', modelVersion: 'gemini-3.8-flash',
  cached: false, sheet: SHEET, trimmed: 0, usage: { inputTokens: 21_945, outputTokens: 12_982, estimatedUsd: 0.13 }, ms: 71_000 } };
/** supabase-js FunctionsHttpError shape: the Response is in `context`. */
const httpError = (status: number, body: unknown) => ({ name: 'FunctionsHttpError', context: new Response(JSON.stringify(body), { status }) });

function client(options: { invoke?: (body: unknown) => { data: unknown; error: unknown }; upload?: { error: unknown } } = {}) {
  const invoke = vi.fn(async (_name: string, { body }: { body: unknown }) => options.invoke?.(body) ?? { data: OK, error: null });
  const upload = vi.fn(async () => ({ data: null as unknown, ...(options.upload ?? { data: { path: 'x' }, error: null }) }));
  const from = vi.fn(() => ({ upload }));
  const value: DraftClient = { functions: { invoke }, storage: { from } };
  return { value, invoke, upload, from };
}
const PDF: ExtractedPdf = { fileName: 'manual.pdf', sha256: SHA, pageCount: 39, truncated: false,
  pages: [{ number: 6, text: 'Pt-100', textLength: 6, needsVisualExtraction: false }] };

describe('only PDFs and photos leave the computer', () => {
  it('knows the kinds that may go to the server', () => {
    expect(sourceMimeType('manual.PDF')).toBe('application/pdf');
    expect(sourceMimeType('foto.jpeg', 'image/jpeg')).toBe('image/jpeg');
    expect(sourceMimeType('foto.png', 'application/octet-stream')).toBe('image/png');
    expect(sourceMimeType('scan', 'image/webp')).toBe('image/webp');
    for (const [name, type] of [['precos.xlsx', ''], ['lista.csv', 'text/csv'], ['planilha.xls', ''], ['tabela.ods', ''],
      ['foto.heic', 'image/heic'], ['manual.pdf', 'image/png'], ['disfarce.pdf', 'text/csv'], ['sem-extensao', '']]) {
      expect(sourceMimeType(name, type)).toBeNull();
    }
  });

  it('never uploads a spreadsheet and stores a PDF privately under "<user>/<sha256>.pdf" without overwriting', async () => {
    const box = client();
    await expect(storeSourceFile(box.value, { userId: USER, fileName: 'precos.xlsx', bytes: BYTES, sha256: SHA }))
      .rejects.toMatchObject({ code: 'SOURCE_KIND_NOT_ALLOWED' });
    expect(box.upload).not.toHaveBeenCalled();
    const stored = await storeSourceFile(box.value, { userId: USER, fileName: 'manual.pdf', bytes: BYTES, sha256: SHA });
    expect(stored).toEqual({ path: `${USER}/${SHA}.pdf`, mimeType: 'application/pdf' });
    expect(box.from).toHaveBeenCalledWith('vnext-source-files');
    expect(box.upload).toHaveBeenCalledWith(`${USER}/${SHA}.pdf`, BYTES, { contentType: 'application/pdf', upsert: false });
  });

  it('reuses a file already stored and reports other upload failures', async () => {
    const again = client({ upload: { error: { statusCode: '409', message: 'The resource already exists' } } });
    await expect(storeSourceFile(again.value, { userId: USER, fileName: 'manual.pdf', bytes: BYTES, sha256: SHA })).resolves.toBeTruthy();
    const denied = client({ upload: { error: { statusCode: '403', message: 'new row violates row-level security policy' } } });
    await expect(storeSourceFile(denied.value, { userId: USER, fileName: 'manual.pdf', bytes: BYTES, sha256: SHA }))
      .rejects.toMatchObject({ code: 'SOURCE_UPLOAD_FAILED' });
    await expect(storeSourceFile(denied.value, { userId: 'not-a-user', fileName: 'manual.pdf', bytes: BYTES, sha256: SHA }))
      .rejects.toMatchObject({ code: 'SOURCE_UPLOAD_FAILED' });
  });
});

describe('extract_facts request', () => {
  const input = { path: `${USER}/${SHA}.pdf`, sha256: SHA, mimeType: 'application/pdf' as const, fileName: 'manual.pdf',
    pageCount: 39, firstPage: 5, lastPage: 8, models: ['TA-25N'] };

  it('sends the exact contract without any credential', async () => {
    const box = client();
    const extraction = await requestFactExtraction(box.value, input);
    expect(box.invoke).toHaveBeenCalledWith(DRAFT_FUNCTION_NAME, { body: {
      version: 1, task: 'extract_facts', models: ['TA-25N'],
      source: { path: input.path, sha256: SHA, mimeType: 'application/pdf', fileName: 'manual.pdf', pageCount: 39, firstPage: 5, lastPage: 8 },
    } });
    expect(JSON.stringify(box.invoke.mock.calls)).not.toMatch(/credential|apiKey/);
    expect(extraction).toMatchObject({ cached: false, sheet: SHEET, usage: { estimatedUsd: 0.13 } });
  });

  it('checks the page range before calling', async () => {
    const box = client();
    for (const range of [{ firstPage: 0 }, { firstPage: 9, lastPage: 8 }, { lastPage: 40 }, { firstPage: 1, lastPage: 13 }]) {
      await expect(requestFactExtraction(box.value, { ...input, ...range })).rejects.toMatchObject({ code: 'PAGE_RANGE_INVALID' });
    }
    expect(box.invoke).not.toHaveBeenCalled();
  });

  it('maps server codes, network failures, old or missing functions and odd replies', async () => {
    const cases: [ReturnType<typeof client>, string, string?][] = [
      [client({ invoke: () => ({ data: null, error: httpError(503, { code: 'BUDGET_NOT_READY' }) }) }), 'BUDGET_NOT_READY'],
      [client({ invoke: () => ({ data: null, error: httpError(502, { code: 'INVALID_PROVIDER_RESPONSE', reason: 'MAX_TOKENS' }) }) }),
        'INVALID_PROVIDER_RESPONSE', 'MAX_TOKENS'],
      [client({ invoke: () => ({ data: null, error: httpError(500, { message: 'Google said: key AIza... is bad' }) }) }), 'DRAFT_UNAVAILABLE'],
      [client({ invoke: () => ({ data: null, error: httpError(404, 'Function not found') }) }), 'DRAFT_UNAVAILABLE'],
      [client({ invoke: () => ({ data: null, error: { name: 'FunctionsFetchError' } }) }), 'NETWORK'],
      [client({ invoke: () => ({ data: { code: 'OK', extraction: { sheet: 'x' } }, error: null }) }), 'INVALID_REPLY'],
    ];
    for (const [box, code, reason] of cases) {
      const error = await requestFactExtraction(box.value, input).catch(failure => failure as DraftRequestError);
      expect(error).toBeInstanceOf(DraftRequestError);
      expect(error).toMatchObject({ code, ...(reason ? { reason } : {}) });
      expect(String((error as Error).message)).not.toContain('AIza');
    }
  });
});

describe('the whole path for one file', () => {
  it('stores, asks and verifies locally', async () => {
    const box = client();
    const { review, extraction } = await extractFactsFromFile(box.value, { userId: USER,
      file: { name: 'manual.pdf', type: 'application/pdf', bytes: BYTES }, pdf: PDF, firstPage: 6, lastPage: 6, models: ['TA-25N'] });
    expect(box.upload).toHaveBeenCalledTimes(1);
    expect(extraction.sheet).toEqual(SHEET);
    expect(review.pages).toEqual([expect.objectContaining({ page: 6, values: 0, message: 'Página 6: não tem valores de especificação.' })]);
    expect(review.source).toMatchObject({ sourceId: 'arquivo', fileName: 'manual.pdf', firstPage: 6, lastPage: 6 });
  });

  it('never sends a spreadsheet to the server', async () => {
    const box = client();
    await expect(extractFactsFromFile(box.value, { userId: USER, file: { name: 'precos.csv', bytes: BYTES }, pdf: PDF,
      firstPage: 6, lastPage: 6 })).rejects.toMatchObject({ code: 'SOURCE_KIND_NOT_ALLOWED' });
    expect(box.upload).not.toHaveBeenCalled();
    expect(box.invoke).not.toHaveBeenCalled();
  });
});

describe('readiness and plain Portuguese', () => {
  it('reads the free status task', async () => {
    const status = (value: Record<string, unknown>) => client({ invoke: () => ({ data: { code: 'OK', status: { enabled: true,
      serverKey: true, budget: 'settled', remainingMicrousd: 2_500_000, callReserveMicrousd: 218_880, ...value } }, error: null }) });
    expect(await readDraftReadiness(status({}).value)).toEqual({ kind: 'ready', remainingMicrousd: 2_500_000, callReserveMicrousd: 218_880 });
    // The tasks the deployed function knows: an older deploy without the list plans and reads sketches nowhere.
    expect(await readDraftReadiness(status({ tasks: ['extract_facts', 'interpret_sketch', 'plan_draft'] }).value))
      .toMatchObject({ kind: 'ready', planning: true, sketching: true });
    expect(await readDraftReadiness(status({ tasks: ['extract_facts', 'plan_draft'] }).value))
      .toMatchObject({ kind: 'ready', planning: true, sketching: false });
    expect(await readDraftReadiness(status({ serverKey: false }).value)).toEqual({ kind: 'blocked', code: 'PROVIDER_NOT_CONFIGURED' });
    expect(await readDraftReadiness(status({ budget: 'missing' }).value)).toEqual({ kind: 'blocked', code: 'BUDGET_NOT_READY' });
    expect(await readDraftReadiness(status({ remainingMicrousd: 1 }).value)).toEqual({ kind: 'blocked', code: 'AGENT_DAILY_BUDGET_EXCEEDED' });
    const off = client({ invoke: () => ({ data: null, error: httpError(503, { code: 'DRAFT_DISABLED' }) }) });
    expect(await readDraftReadiness(off.value)).toEqual({ kind: 'blocked', code: 'DRAFT_DISABLED' });
    expect(draftReadinessText({ kind: 'ready', remainingMicrousd: null, callReserveMicrousd: null })).toBe('Leitura de arquivos pronta.');
    expect(draftReadinessText(undefined)).toBe('Verificando a leitura de arquivos…');
  });

  it('has a plain message for every code, with no code, English or provider text', () => {
    const codes = [...DRAFT_ERROR_CODES, 'NETWORK', 'DRAFT_UNAVAILABLE', 'INVALID_REPLY', 'SOURCE_KIND_NOT_ALLOWED',
      'SOURCE_UPLOAD_FAILED', 'PAGE_RANGE_INVALID'] as const;
    for (const code of codes) {
      const message = draftErrorMessage(new DraftRequestError(code));
      expect(message.length).toBeGreaterThan(30);
      expect(message).toMatch(/Nada foi alterado no catálogo\.$/u);
      expect(message).not.toMatch(/[A-Z]{3,}_[A-Z]+|Gemini|token|budget|bucket|JSON|HTTP|API/u);
    }
    expect(draftErrorMessage(new DraftRequestError('INVALID_PROVIDER_RESPONSE', 'MAX_TOKENS')))
      .toContain('Essas páginas têm valores demais para uma leitura só. Escolha menos páginas');
    expect(draftErrorMessage(new DraftRequestError('SOURCE_KIND_NOT_ALLOWED'))).toContain('Planilhas do Excel ou CSV não são enviadas');
    expect(draftErrorMessage(new Error('Google: key AIza'))).not.toContain('AIza');
  });
});

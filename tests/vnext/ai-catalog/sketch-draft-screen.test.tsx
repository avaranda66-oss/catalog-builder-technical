import { webcrypto } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '@/vnext/application';
import { CatalogNativeComposer } from '@/vnext/ai-catalog/CatalogNativeComposer';
import type { NativeComposeFunctionsClient } from '@/vnext/ai-catalog/native-compose-client';
import type { DraftClient } from '@/vnext/ai-catalog/draft-client';
import { clearByokCredential } from '@/vnext/ai-catalog/byok-session';
import { forgetSourceIntakeSessions } from '@/vnext/ai-catalog/intake/intake-store';
import { serverSpecTableGateway } from '@/vnext/ai-catalog/spec-table/spec-table-gateway';
import { SKETCH_NOT_DEPLOYED } from '@/vnext/ai-catalog/useSketchDraft';
import { TO_FILL } from '@/vnext/library/presys-archetypes';
import { createPresysPageTemplateRegistry } from '@/vnext/library/presys-ta25n-starter';
import type { CatalogDocument } from '@/vnext/domain';
import { pngBytes, recordedSketchReply, type RecordedSketch } from './sketch-fixtures';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { cleanup(); forgetSourceIntakeSessions(); localStorage.clear(); clearByokCredential(); vi.restoreAllMocks(); });
afterAll(() => vi.unstubAllGlobals());

const USER = '0f8fad5b-d9cb-469f-a165-70867728950e';
const composerClient = { functions: { invoke: vi.fn(async () => ({ data: { code: 'OK', status: { enabled: true,
  mode: 'bounded-acceptance', serverKey: true, byok: false, remainingMicrousd: null, callReserveMicrousd: 7800 } }, error: null })) } } as unknown as NativeComposeFunctionsClient;
const httpError = (status: number, body: unknown) => ({ name: 'FunctionsHttpError', context: new Response(JSON.stringify(body), { status }) });

/** The draft function as deployed with this slice, answering each photo with the real Gemini answer recorded by slice R. */
function draftClient(options: { readonly sketching?: boolean; readonly failing?: readonly string[] } = {}) {
  const uploads: string[] = [];
  const invoke = vi.fn(async (_name: string, { body }: { body: { task: string; source?: { path: string; fileName: string } } }) => {
    if (body.task === 'status') {
      return { data: { code: 'OK', status: { serverKey: true, budget: 'ok',
        tasks: options.sketching === false ? ['extract_facts', 'plan_draft'] : ['extract_facts', 'interpret_sketch', 'plan_draft'] } }, error: null };
    }
    if (body.task !== 'interpret_sketch' || !body.source || !uploads.includes(body.source.path)) return { data: null, error: httpError(400, { code: 'INVALID_REQUEST' }) };
    if (options.failing?.includes(body.source.fileName)) return { data: null, error: httpError(502, { code: 'INVALID_PROVIDER_RESPONSE' }) };
    return { data: recordedSketchReply(body.source.fileName as RecordedSketch), error: null };
  });
  const upload = vi.fn(async (path: string) => { uploads.push(path); return { data: { path }, error: null }; });
  return { client: { functions: { invoke }, storage: { from: () => ({ upload }) } } as unknown as DraftClient, invoke, uploads };
}
function make(options: Parameters<typeof draftClient>[0] = {}) {
  const createId = () => crypto.randomUUID();
  const doc = createCatalogDocument(createId, 'PCON');
  const session = createDocumentSession(doc, { createId, templateRegistry: createPresysPageTemplateRegistry() });
  const draft = draftClient(options);
  const onShowPage = vi.fn();
  render(<CatalogNativeComposer documentId={doc.id} session={session} ownerScope="user:01" client={composerClient}
    onBeforeMutation={() => true} activePageId={doc.pages[0].id} onShowPage={onShowPage}
    factExtraction={serverSpecTableGateway(draft.client, USER)} />);
  return { doc, session, draft, onShowPage };
}
const photo = (name: string) => new File([pngBytes(1131, 1600).buffer as ArrayBuffer], name, { type: 'image/png' });
const tasks = (invoke: ReturnType<typeof draftClient>['invoke']) => invoke.mock.calls.map(([, options]) => (options as { body: { task: string } }).body.task);
const pageTexts = (document: CatalogDocument) => document.pages.map(page => page.objects.flatMap(object => object.type === 'text'
  ? [object.text.paragraphs.map(paragraph => paragraph.inlines.map(inline => inline.kind === 'text' ? inline.text : '').join('')).join('\n')] : []));

async function choosePhotos(names: readonly string[]) {
  fireEvent.click(await screen.findByRole('button', { name: 'Criar páginas a partir do rascunho em papel (fotos)' }));
  fireEvent.change(screen.getByLabelText('Escolher fotos do rascunho'), { target: { files: names.map(photo) } });
  return screen.findByRole('group', { name: 'Criar páginas a partir do rascunho' }, { timeout: 10000 });
}
async function review(names: readonly string[], options: Parameters<typeof draftClient>[0] = {}) {
  const made = make(options);
  const setup = await choosePhotos(names);
  fireEvent.click(within(setup).getByRole('button', { name: 'Ler o rascunho' }));
  const preview = await screen.findByRole('group', { name: 'Prévia das páginas do rascunho' }, { timeout: 10000 });
  return { ...made, preview };
}

describe('Modo rascunho na conversa do assistente', () => {
  it('says plainly when the deployed function cannot read sketches yet, before sending or paying anything', async () => {
    const { doc, session, draft } = make({ sketching: false });
    fireEvent.click(await screen.findByRole('button', { name: 'Criar páginas a partir do rascunho em papel (fotos)' }));
    fireEvent.change(screen.getByLabelText('Escolher fotos do rascunho'), { target: { files: [photo('capa.png')] } });
    expect(await screen.findByText(SKETCH_NOT_DEPLOYED)).toBeInTheDocument();
    expect(tasks(draft.invoke)).toEqual(['status']);
    expect(draft.uploads).toEqual([]);
    expect(session.getSnapshot().document).toEqual(doc);
  });

  it('asks before sending, then shows each photo with the areas the AI understood, the page type and every digit to confirm', async () => {
    const made = make();
    const setup = await choosePhotos(['capa.png', 'especificacoes.png']);
    expect(within(setup).getByText(/Nenhum número do desenho entra sem você conferir/)).toBeInTheDocument();
    expect(within(setup).getAllByRole('listitem').map(item => item.textContent)).toEqual(['capa.png', 'especificacoes.png']);
    expect(tasks(made.draft.invoke)).toEqual(['status']);
    expect(made.draft.uploads).toEqual([]);
    fireEvent.click(within(setup).getByRole('button', { name: 'Ler o rascunho' }));
    const preview = await screen.findByRole('group', { name: 'Prévia das páginas do rascunho' }, { timeout: 10000 });
    expect(tasks(made.draft.invoke)).toEqual(['status', 'interpret_sketch', 'interpret_sketch']);
    expect(made.draft.uploads.every(path => path.startsWith(`${USER}/`) && path.endsWith('.png'))).toBe(true);
    expect(JSON.stringify(made.draft.invoke.mock.calls)).not.toMatch(/apiKey|credential|byok/i);
    expect(made.session.getSnapshot().document).toEqual(made.doc);

    const cover = screen.getByRole('group', { name: 'Rascunho 1: capa.png' });
    expect(cover.querySelectorAll('[data-sketch-region]')).toHaveLength(10);
    expect(within(cover).getByRole('radio', { name: 'Capa de produto — PCON (sugestão da IA)' })).toBeChecked();
    expect(within(cover).getAllByRole('radio').filter(item => item.getAttribute('name')?.startsWith('tipo-'))).toHaveLength(3);
    const title = within(cover).getByRole('textbox', { name: 'Texto de Título' });
    expect(title).toHaveValue('PCON-Y17');
    const titleField = title.closest('[data-sketch-field]')!;
    expect(titleField).toHaveAttribute('data-field-state', 'to-confirm');
    expect([...titleField.querySelectorAll('mark')].map(mark => mark.textContent)).toEqual(['17']);
    expect(within(cover).getByText('O logotipo PRESYS já faz parte do modelo.')).toBeInTheDocument();
    expect(within(cover).getByText(/Escolha a foto na página, depois de aplicar\. O rascunho pede: foto do PCON-Y17\./)).toBeInTheDocument();
    expect(within(cover).getByText('Faixa colorida: já faz parte do modelo.')).toBeInTheDocument();

    const specs = screen.getByRole('group', { name: 'Rascunho 2: especificacoes.png' });
    const source = within(specs).getByRole('group', { name: 'De onde vêm os dados da “Tabela de comparação”?' });
    expect(within(source).getByRole('radio', { name: `Deixar para preencher (a tabela entra vazia, com “${TO_FILL}”)` })).toBeChecked();
    expect(within(specs).getByText(/O rascunho diz que os dados vêm do PDF\. Para usar o PDF, leia antes a tabela/)).toBeInTheDocument();
    expect(within(specs).getByText('O desenho nunca preenche a tabela: os valores vêm só do arquivo escolhido.')).toBeInTheDocument();

    expect(preview).toHaveTextContent('2 páginas para criar. 5 campos entram com o texto do rascunho. 5 campos têm números para conferir; '
      + `sem conferir, entram como “${TO_FILL}”. 1 tabela entra vazia, para preencher. 1 foto fica para escolher na página.`);
    expect(preview).toHaveTextContent('As páginas entram no lugar da página vazia.');
  }, 30000);

  it('applies only the confirmed digits, in one step that one Desfazer takes out', async () => {
    const { doc, session, onShowPage } = await review(['capa.png', 'especificacoes.png']);
    const cover = screen.getByRole('group', { name: 'Rascunho 1: capa.png' });
    fireEvent.click(within(cover).getByRole('button', { name: 'Os números de Título estão certos' }));
    expect(within(cover).getByRole('textbox', { name: 'Texto de Título' }).closest('[data-sketch-field]')).toHaveAttribute('data-field-state', 'ok');
    // A corrected text needs a new confirmation.
    fireEvent.change(within(cover).getByRole('textbox', { name: 'Texto de Subtítulo' }), { target: { value: 'Controlador de pressão 2' } });
    expect(within(cover).getByRole('textbox', { name: 'Texto de Subtítulo' }).closest('[data-sketch-field]')).toHaveAttribute('data-field-state', 'to-confirm');

    fireEvent.click(within(screen.getByRole('group', { name: 'Prévia das páginas do rascunho' })).getByRole('button', { name: 'Aplicar' }));
    const applied = await screen.findByRole('group', { name: 'Páginas do rascunho criadas' });
    const after = session.getSnapshot().document;
    expect(after.pages).toHaveLength(2);
    const texts = pageTexts(after);
    expect(texts[0]).toEqual(expect.arrayContaining(['PCON-Y17', 'saída pneumática', 'hidráulico', 'pneumático']));
    expect(texts[0].join('\n')).not.toMatch(/200 psi|Y18|Controlador de pressão/u);
    expect(texts[1]).toContain('Especificações técnicas');
    expect(within(applied).getByText(/^Páginas do rascunho criadas: 2 páginas, nas páginas 1 a 2\. 5 campos com números não conferidos ficaram “A COMPLETAR”\./))
      .toBeInTheDocument();
    expect(onShowPage).toHaveBeenCalledWith(after.pages[0].id);

    fireEvent.click(within(applied).getByRole('button', { name: /^Desfazer \(\d+ s\)$/ }));
    await waitFor(() => expect(session.getSnapshot().document).toEqual(doc));
    expect(await screen.findByText(/Desfiz as páginas do rascunho/)).toBeInTheDocument();
  }, 30000);

  it('lets the person pick another page type and leave a page out; a photo that failed can be tried again', async () => {
    const { session, draft } = await review(['capa.png', 'acessorios.png'], { failing: ['acessorios.png'] });
    const failed = screen.getByRole('group', { name: 'Rascunho 2: acessorios.png' });
    expect(within(failed).getByRole('alert')).toHaveTextContent('A IA não conseguiu entender o desenho desta vez.');
    const cover = screen.getByRole('group', { name: 'Rascunho 1: capa.png' });
    fireEvent.click(within(cover).getByRole('radio', { name: 'Capa' }));
    expect(within(cover).queryByRole('textbox', { name: 'Texto de Título' })).not.toBeInTheDocument();
    expect(within(cover).getByRole('radio', { name: 'Capa de produto — PCON (sugestão da IA)' })).not.toBeChecked();

    fireEvent.click(within(failed).getByRole('button', { name: 'Tentar de novo esta foto' }));
    await waitFor(() => expect(tasks(draft.invoke).filter(task => task === 'interpret_sketch')).toHaveLength(3));
    fireEvent.click(within(screen.getByRole('group', { name: 'Rascunho 2: acessorios.png' })).getByRole('button', { name: 'Não criar esta página' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Prévia das páginas do rascunho' })).getByRole('button', { name: 'Aplicar' }));
    await screen.findByRole('group', { name: 'Páginas do rascunho criadas' });
    expect(session.getSnapshot().document.pages).toHaveLength(1);
  }, 30000);

  it('offers the sketch on a photo dropped in the conversation, and explains a HEIC photo without sending it', async () => {
    const { draft } = make();
    fireEvent.change(screen.getByLabelText('Escolher arquivos'), { target: { files: [photo('capa.png')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Esta foto é um rascunho: criar a página' }, { timeout: 10000 }));
    expect(await screen.findByRole('group', { name: 'Criar páginas a partir do rascunho' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // The sketch picker stays in the panel after the welcome is gone.
    const heic = new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99, 0, 0, 0, 0]).buffer as ArrayBuffer], 'IMG_0001.HEIC', { type: 'image/heic' });
    fireEvent.change(screen.getByLabelText('Escolher fotos do rascunho'), { target: { files: [heic] } });
    const setup = await screen.findByRole('group', { name: 'Criar páginas a partir do rascunho' });
    fireEvent.click(within(setup).getByRole('button', { name: 'Ler o rascunho' }));
    const failed = await screen.findByRole('group', { name: 'Rascunho 1: IMG_0001.HEIC' }, { timeout: 10000 });
    expect(within(failed).getByRole('alert')).toHaveTextContent(/formato HEIC, do iPhone/);
    expect(tasks(draft.invoke).filter(task => task === 'interpret_sketch')).toEqual([]);
    expect(within(screen.getByRole('group', { name: 'Prévia das páginas do rascunho' })).getByRole('button', { name: 'Aplicar' })).toBeDisabled();
  }, 30000);
});

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createDocumentSession } from '../../../src/vnext/application';
import { createInMemoryArsenalStore } from '../../../src/vnext/arsenal/memory-repository';
import { createAssistantArsenal } from '../../../src/vnext/arsenal/assistant-arsenal';
import type { ArsenalInsertionService, ArsenalInsertRequest } from '../../../src/vnext/arsenal/insertion';
import type { ArsenalCaptureService } from '../../../src/vnext/arsenal/capture';
import type { ArsenalPresetDraft } from '../../../src/vnext/arsenal/contracts';
import {
  builtinCoverPreset, CONTRACT_ACTORS, coverPageDraft, headerBlockDraft, specTableDraft, titleStyleDraft,
} from './contract/fixtures';
import { routerDocument } from './arsenal-ia-fixtures';

/**
 * Onda 4.5 — the arsenal as the assistant uses it: "Usar" loads the preset, picks the target from the open page and the
 * selection, inserts it through the insertion service (zero AI), and counts the use; "Guardar no arsenal?" captures the
 * page the AI built and creates a team preset with origin "ai".
 */
beforeAll(() => { vi.stubGlobal('crypto', webcrypto); });

function setup(options: { insertFails?: boolean; captureFails?: boolean } = {}) {
  const store = createInMemoryArsenalStore({ builtins: [builtinCoverPreset()] });
  const repository = store.as(CONTRACT_ACTORS.author);
  const document = routerDocument();
  const session = createDocumentSession(document, { createId: () => crypto.randomUUID() });
  const requests: ArsenalInsertRequest[] = [];
  const insertion: ArsenalInsertionService = {
    async insert(request, port) {
      requests.push(request);
      if (options.insertFails) return { ok: false, error: { code: 'ACTION_FAILED', details: 'x' }, rolledBack: true };
      const transactionId = port.createTransactionId();
      if (request.target.kind === 'new-page') {
        const added = port.execute({ type: 'page.add', afterPageId: request.target.afterPageId }, { transactionId });
        if (!added.ok) throw new Error('PAGE_ADD');
        return { ok: true, transactionId, pageId: added.metadata.createdIds[0], objectIds: [], placeholders: [{ assetId: 'x', reason: 'UNAVAILABLE' }] };
      }
      return { ok: true, transactionId, pageId: request.target.kind === 'page' ? request.target.pageId : document.pages[0].id,
        objectIds: [], placeholders: [] };
    },
  };
  const captured: unknown[] = [];
  const capture: ArsenalCaptureService = {
    capture(request) {
      captured.push(request);
      if (options.captureFails) return { ok: false, error: { code: 'SOURCE_EMPTY', details: 'x' } };
      return { ok: true, notes: [], content: { kind: 'page', origin: 'ai', payload: coverPageDraft().payload,
        suggestedName: 'Página', suggestedCategory: 'paginas' } };
    },
  };
  const make = async (drafts: ArsenalPresetDraft[]) => {
    const ids: string[] = [];
    for (const draft of drafts) {
      const created = await repository.create({ presetId: crypto.randomUUID(), mutationId: crypto.randomUUID(), draft });
      if (!created.ok) throw new Error(created.error.code);
      ids.push(created.value.id);
    }
    const listed = await repository.list();
    if (!listed.ok) throw new Error('LIST');
    return { ids, arsenal: createAssistantArsenal({ repository, insertion, capture, presets: listed.value, isAssetAvailable: async () => true }) };
  };
  return { repository, session, document, requests, captured, make };
}

describe('Usar: a preset from the assistant, zero AI', () => {
  it('a page preset goes on a new page after the open one, and the use is counted', async () => {
    const f = setup();
    const { arsenal } = await f.make([]);
    const result = await arsenal.use('builtin:contrato-capa', { session: f.session, activePageId: f.document.pages[0].id, selectedObjectIds: [] });
    expect(f.requests[0].target).toEqual({ kind: 'new-page', afterPageId: f.document.pages[0].id });
    expect(result).toMatchObject({ ok: true, newPage: true });
    expect(result.ok && result.text).toMatch(/^Usei “Capa PRESYS \(embutida\)” do arsenal: página nova \(página 2\), sem usar IA\./);
    expect(result.ok && result.text).toMatch(/Uma foto não carregou e virou a moldura “Foto a escolher”/);
    const listed = await f.repository.list();
    expect(listed.ok && listed.value.find(preset => preset.id === 'builtin:contrato-capa')?.useCount).toBe(1);
    // One Desfazer takes the new page away.
    f.session.undo();
    expect(f.session.getSnapshot().document.pages).toHaveLength(2);
  });

  it('a header goes back to its place on the open page; a table goes on the open page', async () => {
    const f = setup();
    const { ids, arsenal } = await f.make([headerBlockDraft(), specTableDraft()]);
    const pageId = f.document.pages[1].id;
    await arsenal.use(ids[0], { session: f.session, activePageId: pageId, selectedObjectIds: [] });
    const table = await arsenal.use(ids[1], { session: f.session, activePageId: pageId, selectedObjectIds: [] });
    expect(f.requests.map(request => request.target)).toEqual([
      { kind: 'page', pageId, placement: 'original' },
      { kind: 'page', pageId },
    ]);
    expect(table.ok && table.text).toMatch(/As células da tabela vêm vazias: os valores vêm do PDF ou da planilha/);
  });

  it('a style needs one selected object of its kind; nothing runs otherwise', async () => {
    const f = setup();
    const { ids, arsenal } = await f.make([titleStyleDraft()]);
    const context = { session: f.session, activePageId: f.document.pages[0].id };
    expect(await arsenal.use(ids[0], { ...context, selectedObjectIds: [] }))
      .toEqual({ ok: false, text: 'Este estilo vale para um texto. Selecione um texto na página e peça de novo. Nada foi mudado.' });
    expect(await arsenal.use(ids[0], { ...context, selectedObjectIds: ['photo'] })).toMatchObject({ ok: false });
    expect(f.requests).toHaveLength(0);
    const styled = await arsenal.use(ids[0], { ...context, selectedObjectIds: ['title'] });
    expect(f.requests[0].target).toEqual({ kind: 'object', objectId: 'title' });
    expect(styled.ok && styled.text).toBe('Apliquei o estilo “Título grande branco”, sem usar IA. Um Desfazer volta tudo.');
  });

  it('an unknown preset or a failed insertion changes nothing and is not counted', async () => {
    const f = setup({ insertFails: true });
    const { ids, arsenal } = await f.make([headerBlockDraft()]);
    const context = { session: f.session, activePageId: f.document.pages[0].id, selectedObjectIds: [] };
    expect(await arsenal.use('99999999-9999-4999-8999-999999999999', context))
      .toEqual({ ok: false, text: 'Este modelo não está mais no arsenal. Nada foi mudado.' });
    expect(await arsenal.use(ids[0], context)).toMatchObject({ ok: false, text: expect.stringMatching(/Nada foi mudado\.$/) });
    const listed = await f.repository.list();
    expect(listed.ok && listed.value.find(preset => preset.id === ids[0])?.useCount).toBe(0);
  });
});

describe('Guardar no arsenal?: what the AI built, kept for the team', () => {
  it('captures the page as origin "ai" with the name and category the person confirmed', async () => {
    const f = setup();
    const { arsenal } = await f.make([]);
    const result = await arsenal.save!({ document: f.session.getSnapshot().document, pageId: f.document.pages[0].id,
      name: 'Capa do PCON', category: 'capas' });
    expect(f.captured[0]).toMatchObject({ source: { kind: 'page', pageId: f.document.pages[0].id }, origin: 'ai' });
    expect(result).toMatchObject({ ok: true, text: 'Guardei “Capa do PCON” no arsenal, em Capas. Toda a equipe já pode usar, sem gastar IA.' });
    const listed = await f.repository.list();
    const saved = listed.ok ? listed.value.find(preset => preset.name === 'Capa do PCON') : undefined;
    expect(saved).toMatchObject({ origin: 'ai', category: 'capas', kind: 'page', createdBy: CONTRACT_ACTORS.author.userId });
  });

  it('an empty name or a failed capture saves nothing', async () => {
    const f = setup({ captureFails: true });
    const { arsenal } = await f.make([]);
    const document = f.session.getSnapshot().document;
    expect(await arsenal.save!({ document, pageId: f.document.pages[0].id, name: '   ', category: 'paginas' }))
      .toEqual({ ok: false, text: 'Escreva um nome para guardar no arsenal.' });
    expect(await arsenal.save!({ document, pageId: f.document.pages[0].id, name: 'Página', category: 'paginas' }))
      .toEqual({ ok: false, text: 'Não deu para guardar esta página no arsenal.' });
    const listed = await f.repository.list();
    expect(listed.ok && listed.value.filter(preset => preset.scope === 'team')).toHaveLength(0);
  });

  it('without a capture service the offer is not made', () => {
    const f = setup();
    const arsenal = createAssistantArsenal({ repository: f.repository, insertion: { insert: async () => { throw new Error('NO'); } },
      presets: [], isAssetAvailable: async () => true });
    expect(arsenal.save).toBeUndefined();
  });
});

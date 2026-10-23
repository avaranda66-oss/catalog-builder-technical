import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { createDocumentSession, type DocumentSession } from '@/vnext/application';
import { walkPageObjects, type AssetRef, type CatalogDocument, type EditorialObject } from '@/vnext/domain';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { createPresysPageTemplateRegistry } from '@/vnext/library/presys-ta25n-starter';
import { createPresysArsenalBuiltinSource } from '@/vnext/arsenal/builtin-source';
import { createInMemoryArsenalStore } from '@/vnext/arsenal/memory-repository';
import type { ArsenalPreset } from '@/vnext/arsenal';
import type { AssetResolutionResult } from '@/vnext/asset';
import {
  arsenalAssetAvailability,
  arsenalViewerFromAuth,
  createArsenalEditorRuntime,
} from '@/vnext/app/editor/arsenal/create-arsenal-runtime';
import { arsenalTargetFor, createSessionInsertionPort } from '@/vnext/app/editor/arsenal/arsenal-runtime';
import { arsenalCardPreview } from '@/vnext/app/editor/arsenal/ArsenalThumbnail';
import { arsenalGalleryQueryFor, useAssistantArsenal } from '@/vnext/app/editor/arsenal/use-assistant-arsenal';
import { ACTORS, testUuid, viewerOf } from './arsenal-doubles';

/**
 * Onda 4.5 — integration of the slices: the editor's arsenal built by `createArsenalEditorRuntime` over the real
 * repository (in memory, same contract as Supabase) with the real PRESYS built-ins, the engine's insertion and
 * capture, and the assistant's view of it (`useAssistantArsenal`). Nothing here calls the AI.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function openCatalog(): DocumentSession {
  return createDocumentSession(createW2CDemoDocument(ids('integ-seed')), {
    createId: ids('integ-generated'),
    templateRegistry: createPresysPageTemplateRegistry(),
  });
}

function realRuntime(options: { readonly isAssetAvailable?: (asset: AssetRef) => Promise<boolean> } = {}) {
  const store = createInMemoryArsenalStore({
    builtins: createPresysArsenalBuiltinSource().list(),
    now: () => '2026-10-23T12:00:00.000Z',
  });
  const repository = store.as({ ...ACTORS.author });
  const runtime = createArsenalEditorRuntime({
    repository,
    viewer: viewerOf(ACTORS.author),
    createId: testUuid,
    ...(options.isAssetAvailable ? { isAssetAvailable: options.isAssetAvailable } : {}),
  });
  return { store, repository, runtime };
}

function objectsOf(document: CatalogDocument): EditorialObject[] {
  return document.pages.flatMap((page) => walkPageObjects(page).map(({ object }) => object));
}

const sampleAsset: AssetRef = {
  id: 'asset-foto', kind: 'image', mimeType: 'image/png', widthPx: 10, heightPx: 10,
} as unknown as AssetRef;

describe('Onda 4.5 — integração do Arsenal no editor', () => {
  describe('quem usa o arsenal (login)', () => {
    it('admin, editor e leitor passam com seu papel; papel desconhecido fica sem papel', () => {
      expect(arsenalViewerFromAuth({ userId: 'u1', role: 'admin' })).toEqual({ userId: 'u1', role: 'admin' });
      expect(arsenalViewerFromAuth({ userId: 'u2', role: 'editor' })).toEqual({ userId: 'u2', role: 'editor' });
      expect(arsenalViewerFromAuth({ userId: 'u3', role: 'viewer' })).toEqual({ userId: 'u3', role: 'viewer' });
      expect(arsenalViewerFromAuth({ userId: 'u4', role: 'owner' })).toEqual({ userId: 'u4', role: null });
      expect(arsenalViewerFromAuth({ userId: null, role: null })).toEqual({ userId: null, role: null });
    });
  });

  describe('fotos dos modelos (resolvedor de fotos do app)', () => {
    it('foto que carrega entra no catálogo aberto na hora; a que não carrega vira "Foto a escolher"', async () => {
      const install = vi.fn();
      const resolved = { ok: true, state: { status: 'resolved', url: 'blob:foto', asset: sampleAsset } } as unknown as AssetResolutionResult;
      const available = arsenalAssetAvailability(async () => resolved, install);
      await expect(available(sampleAsset)).resolves.toBe(true);
      expect(install).toHaveBeenCalledWith(sampleAsset, expect.objectContaining({ status: 'resolved', url: 'blob:foto' }));

      const missing = { ok: false, state: { status: 'unavailable', error: 'sumiu', asset: sampleAsset } } as unknown as AssetResolutionResult;
      const noInstall = vi.fn();
      await expect(arsenalAssetAvailability(async () => missing, noInstall)(sampleAsset)).resolves.toBe(false);
      expect(noInstall).not.toHaveBeenCalled();
    });

    it('resolvedor que falha conta como "não carrega"; instalar que falha não derruba a foto', async () => {
      await expect(arsenalAssetAvailability(async () => { throw new Error('rede'); })(sampleAsset)).resolves.toBe(false);
      const resolved = { ok: true, state: { status: 'resolved', url: 'blob:foto', asset: sampleAsset } } as unknown as AssetResolutionResult;
      const available = arsenalAssetAvailability(async () => resolved, () => { throw new Error('troca de sessão'); });
      await expect(available(sampleAsset)).resolves.toBe(true);
    });
  });

  describe('runtime real: repositório + embutidos PRESYS + motor de inserção', () => {
    it('monta repositório, inserção, captura, serviço e quem está usando', () => {
      const { runtime, repository } = realRuntime();
      expect(runtime.repository).toBe(repository);
      expect(runtime.viewer).toEqual({ userId: ACTORS.author.userId, role: ACTORS.author.role });
      expect(typeof runtime.insertion.insert).toBe('function');
      expect(runtime.capture).toBeDefined();
      expect(runtime.service).toBeDefined();
      expect(runtime.createId).toBe(testUuid);
      expect(runtime.isAssetAvailable).toBeUndefined();
    });

    it('cada modelo PRESYS embutido entra no catálogo aberto, sem IA, e um Desfazer o tira', async () => {
      const { runtime, repository } = realRuntime({ isAssetAvailable: async () => false });
      const listed = await repository.list();
      expect(listed.ok).toBe(true);
      const builtinIds = listed.ok ? listed.value.filter((preset) => preset.scope === 'builtin').map((preset) => preset.id) : [];
      expect(builtinIds.length).toBeGreaterThanOrEqual(20);

      const presets: ArsenalPreset[] = [];
      for (let start = 0; start < builtinIds.length; start += 10) {
        const loaded = await repository.getMany(builtinIds.slice(start, start + 10));
        expect(loaded.ok).toBe(true);
        if (loaded.ok) presets.push(...loaded.value);
      }
      expect(presets.map((preset) => preset.id)).toEqual(builtinIds);

      const session = openCatalog();
      const port = createSessionInsertionPort(session, runtime);
      const firstPageId = session.getSnapshot().document.pages[0].id;
      // Style presets need an object of their type: the pages put them in the catalog first (kept).
      const ordered = [...presets.filter((preset) => preset.kind === 'page'), ...presets.filter((preset) => preset.kind !== 'page')];
      let styled = 0;
      let unchanged = 0;
      for (const preset of ordered) {
        const document = session.getSnapshot().document;
        let pageId = firstPageId;
        let selected: EditorialObject[] = [];
        if (preset.payload.kind === 'style') {
          const target = preset.payload.style.target;
          const host = document.pages.find((page) => walkPageObjects(page).some(({ object }) => object.type === target && !object.locked));
          const object = host && walkPageObjects(host).map((entry) => entry.object).find((candidate) => candidate.type === target && !candidate.locked);
          if (!host || !object) continue;
          pageId = host.id;
          selected = [object];
        }
        const choice = arsenalTargetFor(preset, { pageId, selectedObjects: selected });
        expect(choice.ok, preset.id).toBe(true);
        if (!choice.ok) continue;
        const result = await runtime.insertion.insert({ preset, target: choice.target }, port);
        expect(result.ok, `${preset.id}: ${result.ok ? '' : `${result.error.code} ${result.error.details}`}`).toBe(true);
        if (!result.ok) continue;
        expect(result.transactionId.startsWith('arsenal:')).toBe(true);
        if (result.unchanged) {
          // A style the object already wore: nothing changed and nothing entered the Desfazer history.
          expect(preset.kind, preset.id).toBe('style');
          expect(session.getSnapshot().document, preset.id).toEqual(document);
          unchanged += 1;
          continue;
        }
        expect(session.getSnapshot().document, preset.id).not.toEqual(document);
        if (preset.kind === 'page') {
          // Pages stay: the style presets below need their objects.
          expect(session.getSnapshot().document.pages.map((page) => page.id)).toContain(result.pageId);
          continue;
        }
        if (preset.kind === 'style') styled += 1;
        const undone = session.undo();
        expect(undone.ok, preset.id).toBe(true);
        expect(session.getSnapshot().document, `${preset.id}: um Desfazer volta tudo`).toEqual(document);
      }
      expect(styled).toBeGreaterThan(0);
      expect(unchanged).toBeLessThan(styled);
      expect(objectsOf(session.getSnapshot().document).length).toBeGreaterThan(objectsOf(createW2CDemoDocument(ids('x'))).length);
    });

    it('usar um embutido conta o uso no repositório (built-ins também)', async () => {
      const { repository } = realRuntime();
      const listed = await repository.list();
      const builtin = listed.ok ? listed.value.find((preset) => preset.scope === 'builtin') : undefined;
      expect(builtin).toBeDefined();
      const usage = await repository.recordUse(builtin!.id);
      expect(usage).toMatchObject({ ok: true, value: { presetId: builtin!.id, useCount: 1 } });
    });
  });

  describe('miniatura dos cartões', () => {
    it('sem construtor do runtime, desenha a prévia da inserção com o estilo do catálogo aberto', async () => {
      const { repository } = realRuntime();
      const listed = await repository.list();
      const pageId = listed.ok ? listed.value.find((preset) => preset.kind === 'page')!.id : '';
      const loaded = await repository.getMany([pageId]);
      const preset = loaded.ok ? loaded.value[0] : undefined;
      expect(preset).toBeDefined();
      const document = createW2CDemoDocument(ids('thumb'));
      const preview = arsenalCardPreview(preset!, document, new Map());
      expect(preview).not.toBeNull();
      expect(preview!.page.objects.length).toBeGreaterThan(0);
    });

    it('o construtor do runtime manda; se ele falhar, o cartão fica sem desenho (sem quebrar a lista)', async () => {
      const { repository } = realRuntime();
      const listed = await repository.list();
      const loaded = await repository.getMany([listed.ok ? listed.value[0].id : '']);
      const preset = loaded.ok ? loaded.value[0] : undefined;
      const document = createW2CDemoDocument(ids('thumb'));
      const page = { id: 'p', widthMm: 210 as const, heightMm: 297 as const, objects: [] };
      const builder = vi.fn(() => ({ page }));
      expect(arsenalCardPreview(preset!, document, new Map(), builder)).toEqual({ page });
      expect(builder).toHaveBeenCalledWith(preset);
      expect(arsenalCardPreview(preset!, document, new Map(), () => { throw new Error('quebrou'); })).toBeNull();
    });
  });

  describe('o arsenal visto pelo assistente', () => {
    const summaries = [
      { id: 'a', kind: 'page', name: 'Capa azul PCON', category: 'capas', tags: ['azul'], synonyms: [], description: '' },
      { id: 'b', kind: 'table', name: 'Tabela de especificações', category: 'tabelas', tags: [], synonyms: [], description: '' },
    ] as never[];

    it('"Ver outros" leva só as palavras do pedido que ainda acham algo', () => {
      expect(arsenalGalleryQueryFor('bota a capa azul', summaries)).toBe('capa azul');
      expect(arsenalGalleryQueryFor('põe a capa verde', summaries)).toBe('capa');
      expect(arsenalGalleryQueryFor('coloca 3 tabelas', summaries)).toBe('tabela');
      expect(arsenalGalleryQueryFor('qualquer coisa', summaries)).toBe('');
    });

    it('lê a lista uma vez, usa um embutido na sessão (nova página, uso contado) e nunca chama a IA', async () => {
      const { runtime, repository } = realRuntime({ isAssetAvailable: async () => false });
      const session = openCatalog();
      const document = session.getSnapshot().document;
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const { result } = renderHook(() => useAssistantArsenal({
        runtime, document, assetUrls: new Map(), refreshKey: 0, galleryOpen: false,
      }));
      await waitFor(() => expect(result.current?.presets.length).toBeGreaterThanOrEqual(20));
      expect(result.current?.openGallery).toBeUndefined();
      const page = result.current!.presets.find((preset) => preset.kind === 'page')!;
      const before = session.getSnapshot().document.pages.length;
      let used: Awaited<ReturnType<NonNullable<typeof result.current>['use']>> | undefined;
      await act(async () => {
        used = await result.current!.use(page.id, { session, activePageId: document.pages[0].id, selectedObjectIds: [] });
      });
      expect(used).toMatchObject({ ok: true, newPage: true });
      expect(session.getSnapshot().document.pages.length).toBe(before + 1);
      const listed = await repository.list();
      expect(listed.ok && listed.value.find((preset) => preset.id === page.id)?.useCount).toBe(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('"Guardar no arsenal?" do chat grava como IA, avisa o editor e a lista nova aparece', async () => {
      const { runtime, repository } = realRuntime();
      const session = openCatalog();
      const document = session.getSnapshot().document;
      const onSaved = vi.fn();
      const { result, rerender } = renderHook((props: { refreshKey: number }) => useAssistantArsenal({
        runtime, document, assetUrls: new Map(), refreshKey: props.refreshKey, galleryOpen: false, onSaved,
      }), { initialProps: { refreshKey: 0 } });
      await waitFor(() => expect(result.current?.presets.length).toBeGreaterThan(0));
      expect(result.current?.save).toBeDefined();
      // A page the AI built (here: a PRESYS model) is what the chat offers to keep.
      const model = result.current!.presets.find((preset) => preset.kind === 'page')!;
      let used: Awaited<ReturnType<NonNullable<typeof result.current>['use']>> | undefined;
      await act(async () => {
        used = await result.current!.use(model.id, { session, activePageId: document.pages[0].id, selectedObjectIds: [] });
      });
      expect(used).toMatchObject({ ok: true, newPage: true });
      const built = session.getSnapshot().document;
      const pageId = used!.ok ? used!.pageId : '';
      let saved: Awaited<ReturnType<NonNullable<NonNullable<typeof result.current>['save']>>> | undefined;
      await act(async () => {
        saved = await result.current!.save!({ document: built, pageId, name: 'Capa do chat', category: 'capas' });
      });
      expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true });
      expect(onSaved).toHaveBeenCalledTimes(1);
      const listed = await repository.list();
      const stored = listed.ok ? listed.value.find((preset) => preset.name === 'Capa do chat') : undefined;
      expect(stored).toMatchObject({ origin: 'ai', category: 'capas', createdBy: ACTORS.author.userId });
      rerender({ refreshKey: 1 });
      await waitFor(() => expect(result.current?.presets.some((preset) => preset.name === 'Capa do chat')).toBe(true));
    });

    it('"Abrir o arsenal" do chat chama a galeria do editor com as palavras que acham algo', async () => {
      const { runtime } = realRuntime();
      const document = openCatalog().getSnapshot().document;
      const openGallery = vi.fn();
      const { result } = renderHook(() => useAssistantArsenal({
        runtime, document, assetUrls: new Map(), refreshKey: 0, galleryOpen: false, openGallery,
      }));
      await waitFor(() => expect(result.current?.presets.length).toBeGreaterThan(0));
      result.current!.openGallery!('bota uma capa xyzw');
      expect(openGallery).toHaveBeenCalledWith('capa');
    });

    it('sem runtime não há arsenal no assistente; o cartão desenha a miniatura do preset', async () => {
      const document = openCatalog().getSnapshot().document;
      const none = renderHook(() => useAssistantArsenal({ runtime: undefined, document, assetUrls: new Map(), refreshKey: 0, galleryOpen: false }));
      expect(none.result.current).toBeUndefined();

      const { runtime } = realRuntime();
      const { result } = renderHook(() => useAssistantArsenal({ runtime, document, assetUrls: new Map(), refreshKey: 0, galleryOpen: false }));
      await waitFor(() => expect(result.current?.presets.length).toBeGreaterThan(0));
      const page = result.current!.presets.find((preset) => preset.kind === 'page')!;
      const view = render(<>{result.current!.renderThumbnail!(page)}</>);
      await waitFor(() => expect(view.container.querySelector('[data-arsenal-thumb="loading"]')).toBeNull());
      expect(view.container.firstElementChild).not.toBeNull();
    });
  });
});

describe('Onda 4.5 — estilo que já estava aplicado', () => {
  it('não entra no histórico, não conta uso e a mensagem não manda usar Desfazer', async () => {
    const { runtime, repository } = realRuntime();
    const session = openCatalog();
    const port = createSessionInsertionPort(session, runtime);
    const listed = await repository.list();
    const summaries = listed.ok ? listed.value : [];
    const pageSummary = summaries.find((preset) => preset.kind === 'page')!;
    const pages = await repository.getMany([pageSummary.id]);
    const page = pages.ok ? pages.value[0] : undefined;
    const placed = await runtime.insertion.insert({ preset: page!, target: { kind: 'new-page', afterPageId: session.getSnapshot().document.pages[0].id } }, port);
    expect(placed.ok).toBe(true);
    const host = session.getSnapshot().document.pages.find((candidate) => candidate.id === (placed.ok ? placed.pageId : ''))!;
    const text = walkPageObjects(host).map(({ object }) => object).find((object) => object.type === 'text' && !object.locked)!;
    const styles = await repository.getMany(summaries.filter((preset) => preset.kind === 'style').map((preset) => preset.id).slice(0, 10));
    const textStyle = styles.ok ? styles.value.find((preset) => preset.payload.kind === 'style' && preset.payload.style.target === 'text') : undefined;
    expect(textStyle).toBeDefined();

    const first = await runtime.insertion.insert({ preset: textStyle!, target: { kind: 'object', objectId: text.id } }, port);
    expect(first.ok).toBe(true);
    const styled = session.getSnapshot().document;
    const again = await runtime.insertion.insert({ preset: textStyle!, target: { kind: 'object', objectId: text.id } }, port);
    expect(again).toMatchObject({ ok: true, unchanged: true });
    expect(session.getSnapshot().document).toEqual(styled);
    const { arsenalInsertedMessage } = await import('@/vnext/app/editor/arsenal/arsenal-runtime');
    const message = arsenalInsertedMessage(textStyle!, { placeholders: 0, unchanged: true });
    expect(message).toContain('Nada mudou');
    expect(message).not.toContain('Desfazer');

    const { createAssistantArsenal } = await import('@/vnext/arsenal/assistant-arsenal');
    const recordUse = vi.spyOn(repository, 'recordUse');
    const assistant = createAssistantArsenal({
      repository, insertion: runtime.insertion, presets: summaries, isAssetAvailable: async () => false, createId: testUuid,
    });
    const said = await assistant.use(textStyle!.id, { session, activePageId: host.id, selectedObjectIds: [text.id] });
    expect(said).toMatchObject({ ok: true, unchanged: true });
    expect(said.text).toContain('Nada mudou');
    expect(said.text).not.toContain('Desfazer');
    expect(recordUse).not.toHaveBeenCalled();
    expect(session.getSnapshot().document).toEqual(styled);
  });
});

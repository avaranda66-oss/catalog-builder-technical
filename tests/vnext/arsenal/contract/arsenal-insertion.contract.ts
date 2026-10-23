import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createCatalogDocument,
  createDocumentSession,
  type DocumentSession,
} from '../../../../src/vnext/application';
import type {
  ApplicationAction,
  ApplicationActionResult,
  ApplicationExecutionContext,
} from '../../../../src/vnext/application/contracts';
import { frameToCanonicalU, walkPageObjects } from '../../../../src/vnext/domain';
import { plainRichText, type AssetRef, type CatalogDocument, type EditorialObject } from '../../../../src/vnext/domain/editorial-model';
import {
  findArsenalTableValueViolations,
  type ArsenalPreset,
  type ArsenalPresetDraft,
} from '../../../../src/vnext/arsenal/contracts';
import type {
  ArsenalInsertionPort,
  ArsenalInsertionService,
  ArsenalInsertResult,
} from '../../../../src/vnext/arsenal/insertion';
import {
  CONTRACT_ASSET,
  coverPageDraft,
  headerBlockDraft,
  logoBlockDraft,
  specTableDraft,
  teamPresetFromDraft,
  titleStyleDraft,
} from './fixtures';

/**
 * Contract suite of `ArsenalInsertionService` (rules in src/vnext/arsenal/insertion.ts). The capture/insertion slice
 * runs it with every feature:
 *
 *   runArsenalInsertionContract('serviço de inserção', { createService, features: ALL_ARSENAL_INSERTION_FEATURES });
 *
 * The rules that do not depend on a kind (one transaction, all-or-nothing, nothing runs on a bad preset or target)
 * use the header block, so `block` is always required.
 */

export const ALL_ARSENAL_INSERTION_FEATURES = ['block', 'page', 'table', 'style', 'images'] as const;
export type ArsenalInsertionFeature = (typeof ALL_ARSENAL_INSERTION_FEATURES)[number];

export interface ArsenalInsertionContractHarness {
  createService(): ArsenalInsertionService;
  /** The finished implementation declares all of `ALL_ARSENAL_INSERTION_FEATURES`. */
  readonly features: readonly ArsenalInsertionFeature[];
}

export interface RecordedExecute {
  readonly action: ApplicationAction;
  readonly context: ApplicationExecutionContext;
}

export interface RecordingInsertionPort extends ArsenalInsertionPort {
  readonly session: DocumentSession;
  readonly executes: RecordedExecute[];
  readonly undoCalls: () => number;
}

export interface RecordingInsertionPortOptions {
  readonly assetAvailable?: (asset: AssetRef) => boolean;
  /** 1-based: this `execute` call fails without touching the document (simulates an action refused midway). */
  readonly failOnExecute?: number;
}

/** A port over a real editor session that records every call, for contract assertions. */
export function createRecordingInsertionPort(
  session: DocumentSession,
  options: RecordingInsertionPortOptions = {},
): RecordingInsertionPort {
  const executes: RecordedExecute[] = [];
  let undoCalls = 0;
  return {
    session,
    executes,
    undoCalls: () => undoCalls,
    getDocument: () => session.getSnapshot().document,
    execute(action, context): ApplicationActionResult {
      executes.push({ action, context });
      if (options.failOnExecute === executes.length) {
        return { ok: false, error: { code: 'ACTION_INVALID', details: 'contract: forced failure' } };
      }
      return session.execute(action, context);
    },
    undo() {
      undoCalls += 1;
      return session.undo();
    },
    isAssetAvailable: async (asset) => options.assetAvailable?.(asset) ?? true,
    createTransactionId: () => `arsenal-contract:${randomUUID()}`,
  };
}

/** A fresh catalog with two pages, a text and a shape on the first page. */
export function createContractSession(): DocumentSession {
  const id = () => randomUUID();
  const session = createDocumentSession(createCatalogDocument(id, 'Catálogo do contrato'), { createId: id });
  const pageId = session.getSnapshot().document.pages[0].id;
  const setup: ApplicationAction[] = [
    { type: 'page.add', afterPageId: pageId },
    {
      type: 'object.insert', pageId,
      object: {
        type: 'text', zIndex: 0, frameU: frameToCanonicalU({ xMm: 18, yMm: 40, widthMm: 120, heightMm: 10 }),
        text: plainRichText('contract-text', 'Texto de exemplo'), style: { fontSizePt: 10 },
      },
    },
    {
      type: 'object.insert', pageId,
      object: {
        type: 'shape', zIndex: 1, shape: 'rectangle', frameU: frameToCanonicalU({ xMm: 18, yMm: 60, widthMm: 40, heightMm: 20 }),
        style: { fill: '#cccccc' },
      },
    },
  ];
  for (const action of setup) {
    const result = session.execute(action);
    if (!result.ok) throw new Error(`contract setup failed: ${result.error.code} ${result.error.details}`);
  }
  return session;
}

function allObjects(document: CatalogDocument): EditorialObject[] {
  return document.pages.flatMap((page) => walkPageObjects(page).map(({ object }) => object));
}

function payloadIds(draft: ArsenalPresetDraft): string[] {
  const { payload } = draft;
  if (payload.kind === 'style') return [];
  if (payload.kind === 'table') return [payload.table.id];
  return payload.objects.map((object) => object.id);
}

function expectNothingRan(result: ArsenalInsertResult, port: RecordingInsertionPort, before: CatalogDocument, code: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(code);
  expect(result.rolledBack).toBe(false);
  expect(port.executes).toHaveLength(0);
  expect(port.session.getSnapshot().document).toEqual(before);
}

function expectOneTransaction(result: ArsenalInsertResult, port: RecordingInsertionPort): asserts result is Extract<ArsenalInsertResult, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`insertion failed: ${result.error.code} ${result.error.details}`);
  expect(result.transactionId.length).toBeGreaterThan(0);
  expect(port.executes.length).toBeGreaterThan(0);
  expect(port.executes.every((call) => call.context.transactionId === result.transactionId)).toBe(true);
}

export function runArsenalInsertionContract(label: string, harness: ArsenalInsertionContractHarness): void {
  const has = (feature: ArsenalInsertionFeature) => harness.features.includes(feature);

  describe(`contrato da inserção do arsenal — ${label}`, () => {
    it('declara o bloco, base das regras gerais', () => {
      expect(has('block')).toBe(true);
    });

    it('bloco: entra com ids novos, um só transactionId e um Desfazer volta tudo', async () => {
      const session = createContractSession();
      const before = session.getSnapshot().document;
      const port = createRecordingInsertionPort(session);
      const pageId = before.pages[0].id;
      const draft = headerBlockDraft();
      const result = await harness.createService().insert(
        { preset: teamPresetFromDraft(draft), target: { kind: 'page', pageId, placement: 'original' } }, port);
      expectOneTransaction(result, port);
      expect(result.pageId).toBe(pageId);
      expect(result.placeholders).toEqual([]);
      const page = session.getSnapshot().document.pages.find((candidate) => candidate.id === pageId)!;
      const onPage = new Set(walkPageObjects(page).map(({ object }) => object.id));
      expect(result.objectIds.length).toBeGreaterThan(0);
      for (const id of result.objectIds) expect(onPage.has(id)).toBe(true);
      for (const id of payloadIds(draft)) expect(result.objectIds).not.toContain(id);
      expect(port.undoCalls()).toBe(0);
      expect(session.undo().ok).toBe(true);
      expect(session.getSnapshot().document).toEqual(before);
    });

    it('não executa nada com payload de versão mais nova ou preset inválido', async () => {
      const session = createContractSession();
      const before = session.getSnapshot().document;
      const pageId = before.pages[0].id;
      const newer = { ...teamPresetFromDraft(headerBlockDraft()), payloadSchemaVersion: 2 } as unknown as ArsenalPreset;
      const port = createRecordingInsertionPort(session);
      expectNothingRan(await harness.createService().insert({ preset: newer, target: { kind: 'page', pageId } }, port), port, before, 'UNSUPPORTED_VERSION');
      const mismatch = { ...teamPresetFromDraft(headerBlockDraft()), kind: 'table', category: 'tabelas' } as unknown as ArsenalPreset;
      const port2 = createRecordingInsertionPort(session);
      expectNothingRan(await harness.createService().insert({ preset: mismatch, target: { kind: 'page', pageId } }, port2), port2, before, 'INVALID_PRESET');
    });

    it('não executa nada com alvo errado ou inexistente', async () => {
      const session = createContractSession();
      const before = session.getSnapshot().document;
      const preset = teamPresetFromDraft(headerBlockDraft());
      const port = createRecordingInsertionPort(session);
      expectNothingRan(await harness.createService().insert({ preset, target: { kind: 'new-page' } }, port), port, before, 'TARGET_INVALID');
      const port2 = createRecordingInsertionPort(session);
      expectNothingRan(await harness.createService().insert({ preset, target: { kind: 'page', pageId: 'pagina-inexistente' } }, port2), port2, before, 'TARGET_NOT_FOUND');
    });

    it('falha no meio desfaz tudo com um só Desfazer', async () => {
      const session = createContractSession();
      const before = session.getSnapshot().document;
      const port = createRecordingInsertionPort(session, { failOnExecute: 2 });
      const result = await harness.createService().insert(
        { preset: teamPresetFromDraft(headerBlockDraft()), target: { kind: 'page', pageId: before.pages[0].id, placement: 'original' } }, port);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('ACTION_FAILED');
      expect(result.rolledBack).toBe(true);
      expect(port.undoCalls()).toBe(1);
      expect(session.getSnapshot().document).toEqual(before);
    });

    it.runIf(has('page'))('página: entra como página nova depois da indicada, com o fundo do modelo', async () => {
      const session = createContractSession();
      const before = session.getSnapshot().document;
      const port = createRecordingInsertionPort(session);
      const draft = coverPageDraft();
      const result = await harness.createService().insert(
        { preset: teamPresetFromDraft(draft), target: { kind: 'new-page', afterPageId: before.pages[0].id } }, port);
      expectOneTransaction(result, port);
      const pages = session.getSnapshot().document.pages;
      expect(pages).toHaveLength(before.pages.length + 1);
      expect(pages[1].id).toBe(result.pageId);
      expect(pages[1].background).toEqual(draft.payload.kind === 'page' ? draft.payload.background : undefined);
      expect(pages[1].objects.length).toBeGreaterThanOrEqual(draft.payload.kind === 'page' ? draft.payload.objects.length : 0);
      expect(session.undo().ok).toBe(true);
      expect(session.getSnapshot().document).toEqual(before);
    });

    it.runIf(has('table'))('tabela "só estrutura" não traz valores para o catálogo', async () => {
      const session = createContractSession();
      const before = session.getSnapshot().document;
      const port = createRecordingInsertionPort(session);
      const draft = specTableDraft();
      const result = await harness.createService().insert(
        { preset: teamPresetFromDraft(draft), target: { kind: 'page', pageId: before.pages[1].id } }, port);
      expectOneTransaction(result, port);
      const tables = allObjects(session.getSnapshot().document)
        .filter((object): object is Extract<EditorialObject, { type: 'table' }> => object.type === 'table' && result.objectIds.includes(object.id));
      expect(tables).toHaveLength(1);
      expect(findArsenalTableValueViolations(tables[0].table)).toEqual([]);
      if (draft.payload.kind === 'table') {
        expect(tables[0].table.id).not.toBe(draft.payload.table.id);
        expect(tables[0].table.rows).toHaveLength(draft.payload.table.rows.length);
        expect(tables[0].table.columns).toHaveLength(draft.payload.table.columns.length);
      }
    });

    it.runIf(has('style'))('estilo: aplica no objeto do tipo certo e recusa outro tipo sem executar nada', async () => {
      const session = createContractSession();
      const document = session.getSnapshot().document;
      const text = document.pages[0].objects.find((object) => object.type === 'text')!;
      const shape = document.pages[0].objects.find((object) => object.type === 'shape')!;
      const draft = titleStyleDraft();
      const port = createRecordingInsertionPort(session);
      const result = await harness.createService().insert({ preset: teamPresetFromDraft(draft), target: { kind: 'object', objectId: text.id } }, port);
      expectOneTransaction(result, port);
      expect(result.objectIds).toEqual([text.id]);
      const styled = allObjects(session.getSnapshot().document).find((object) => object.id === text.id);
      if (draft.payload.kind === 'style' && draft.payload.style.target === 'text' && styled?.type === 'text') {
        expect(styled.style).toMatchObject(draft.payload.style.text);
      } else {
        throw new Error('styled object is not the text');
      }
      const before = session.getSnapshot().document;
      const port2 = createRecordingInsertionPort(session);
      expectNothingRan(await harness.createService().insert({ preset: teamPresetFromDraft(draft), target: { kind: 'object', objectId: shape.id } }, port2), port2, before, 'TARGET_INVALID');
    });

    it.runIf(has('images'))('imagem: reaproveita o asset disponível e troca o indisponível pela moldura', async () => {
      const draft = logoBlockDraft();
      const preset = teamPresetFromDraft(draft);

      const available = createContractSession();
      const portA = createRecordingInsertionPort(available, { assetAvailable: () => true });
      const ok = await harness.createService().insert({ preset, target: { kind: 'page', pageId: available.getSnapshot().document.pages[0].id, placement: 'original' } }, portA);
      expectOneTransaction(ok, portA);
      expect(ok.placeholders).toEqual([]);
      const docA = available.getSnapshot().document;
      expect(docA.assets.some((asset) => asset.id === CONTRACT_ASSET.id)).toBe(true);
      expect(allObjects(docA).some((object) => object.type === 'image' && object.assetId === CONTRACT_ASSET.id)).toBe(true);

      const missing = createContractSession();
      const portB = createRecordingInsertionPort(missing, { assetAvailable: () => false });
      const framed = await harness.createService().insert({ preset, target: { kind: 'page', pageId: missing.getSnapshot().document.pages[0].id, placement: 'original' } }, portB);
      expectOneTransaction(framed, portB);
      expect(framed.placeholders).toEqual([{ assetId: CONTRACT_ASSET.id, reason: 'UNAVAILABLE' }]);
      const docB = missing.getSnapshot().document;
      expect(docB.assets.some((asset) => asset.id === CONTRACT_ASSET.id)).toBe(false);
      expect(allObjects(docB).some((object) => (object.type === 'image' || object.type === 'icon') && object.assetId === CONTRACT_ASSET.id)).toBe(false);
      expect(JSON.stringify(docB)).toContain('A COMPLETAR');
    });
  });
}

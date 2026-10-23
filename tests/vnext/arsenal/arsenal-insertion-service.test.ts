import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDocumentSession, type DocumentSession } from '../../../src/vnext/application';
import {
  frameToCanonicalU,
  plainRichText,
  visualPageObjects,
  walkPageObjects,
  type CatalogDocument,
  type EditorialObject,
  type Frame,
  type Page,
} from '../../../src/vnext/domain';
import { buildPresysArchetypePage, createPresysArchetypeDocument, createPresysArchetypeTemplateRegistry } from '../../../src/vnext/library/presys-archetypes';
import {
  findArsenalTableValueViolations,
  parseArsenalPresetDraft,
  stripArsenalTableValues,
  type ArsenalPreset,
  type ArsenalPresetDraft,
} from '../../../src/vnext/arsenal/contracts';
import type { ArsenalCaptureRequest } from '../../../src/vnext/arsenal/capture';
import { buildArsenalPresetDraft, captureArsenalContent } from '../../../src/vnext/arsenal/arsenal-capture';
import { createArsenalInsertionService, insertArsenalPreset } from '../../../src/vnext/arsenal/arsenal-insertion';
import { arsenalContentBoxMm, frameInside } from '../../../src/vnext/arsenal/arsenal-geometry';
import { ALL_ARSENAL_INSERTION_FEATURES, createContractSession, createRecordingInsertionPort, runArsenalInsertionContract } from './contract/arsenal-insertion.contract';
import { contractTable, headerBlockDraft, specTableDraft, teamPresetFromDraft, titleStyleDraft } from './contract/fixtures';

runArsenalInsertionContract('serviço de inserção (fatia arsenal-motor)', {
  createService: createArsenalInsertionService,
  features: ALL_ARSENAL_INSERTION_FEATURES,
});

// ---------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------

const id = () => randomUUID();

/** A PRESYS catalog (cover + specifications) with the Onda 4 control footer on. */
function presysSession(title = 'Catálogo PRESYS'): DocumentSession {
  const document = createPresysArchetypeDocument({ documentId: id(), title, sequence: ['P1', 'P4', 'P2'] });
  return createDocumentSession(document, { createId: id });
}

function snapshot(session: DocumentSession): CatalogDocument {
  return session.getSnapshot().document;
}

const ID_KEYS = new Set(['id', 'rowId', 'columnId', 'coveredBy', 'legendEntryId']);

/**
 * An object as the person sees it: no ids (fresh on every insertion) and no stacking numbers (the painting order is
 * compared instead). Ids that point at each other inside a table are replaced by their order of appearance, so a
 * broken reference still shows up.
 */
function look(object: EditorialObject): unknown {
  const names = new Map<string, string>();
  const name = (value: string) => {
    if (!names.has(value)) names.set(value, `#${names.size}`);
    return names.get(value)!;
  };
  const walk = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) return value.map((entry) => (key === 'annotationIds' ? name(String(entry)) : walk(entry)));
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return Object.fromEntries(Object.keys(record).sort()
        .filter((entry) => entry !== 'zIndex' && record[entry] !== undefined)
        .map((entry) => [entry, ID_KEYS.has(entry) && typeof record[entry] === 'string' ? name(record[entry] as string) : walk(record[entry], entry)]));
    }
    return value;
  };
  return walk(object);
}

function looks(page: Page, ids?: readonly string[]): unknown[] {
  return visualPageObjects(page)
    .map(({ object }) => object)
    .filter((object) => !ids || ids.includes(object.id))
    .map(look);
}

function presetOf(request: ArsenalCaptureRequest, overrides: Partial<ArsenalPresetDraft> = {}): ArsenalPreset {
  const captured = captureArsenalContent(request);
  if (!captured.ok) throw new Error(`capture failed: ${captured.error.code} ${captured.error.details}`);
  const draft = parseArsenalPresetDraft({ ...buildArsenalPresetDraft(captured.content), ...overrides });
  if (!draft.ok) throw new Error(`draft invalid: ${draft.issues.map((issue) => issue.code).join(', ')}`);
  return teamPresetFromDraft(draft.value);
}

function pageOf(document: CatalogDocument, pageId: string): Page {
  return document.pages.find((page) => page.id === pageId)!;
}

function pageNumber(document: CatalogDocument, pageId: string): number {
  return document.pages.findIndex((page) => page.id === pageId) + 1;
}

// ---------------------------------------------------------------------------------------------------------------
// Round trip: capture → insertion
// ---------------------------------------------------------------------------------------------------------------

describe('ida e volta: captura → inserção', () => {
  it('página inteira volta idêntica (área segura, objetos, estilos, ordem) em outro catálogo, com um Desfazer', async () => {
    const source = presysSession('Origem');
    const sourcePage = snapshot(source).pages[1];
    const preset = presetOf({ document: snapshot(source), source: { kind: 'page', pageId: sourcePage.id }, origin: 'person', tableValues: 'generic-values' });

    const target = createContractSession();
    const before = snapshot(target);
    const port = createRecordingInsertionPort(target);
    const result = await insertArsenalPreset({ preset, target: { kind: 'new-page', afterPageId: before.pages[0].id } }, port);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const inserted = pageOf(snapshot(target), result.pageId);
    expect(snapshot(target).pages[1].id).toBe(result.pageId);
    expect(inserted.safeArea).toEqual(sourcePage.safeArea);
    expect(inserted.background).toEqual(sourcePage.background);
    expect(looks(inserted)).toEqual(looks(sourcePage));
    expect(port.executes.map((call) => call.action.type)).toContain('page.setSafeArea');
    expect(new Set(port.executes.map((call) => call.context.transactionId))).toEqual(new Set([result.transactionId]));

    expect(target.undo().ok).toBe(true);
    expect(snapshot(target)).toEqual(before);
  });

  it('bloco com grupo e objeto travado volta no mesmo lugar ("original"), mesmas medidas e estilos', async () => {
    const source = presysSession('Origem');
    const page = snapshot(source).pages[1];
    const [title, rule, models] = ['title', 'title-rule', 'models'].map((suffix) => page.objects.find((object) => object.id.endsWith(`-${suffix}`))!);
    const grouped = source.execute({ type: 'group.create', pageId: page.id, objectIds: [title.id, rule.id] });
    expect(grouped.ok).toBe(true);
    const groupId = grouped.ok ? grouped.metadata.createdIds[0] : '';
    expect(source.execute({ type: 'object.setLocked', objectId: models.id, expectedLocked: false, locked: true }).ok).toBe(true);
    const sourcePage = pageOf(snapshot(source), page.id);
    const preset = presetOf({ document: snapshot(source), source: { kind: 'objects', pageId: page.id, objectIds: [groupId, models.id] }, origin: 'person' });
    expect(preset.category).toBe('cabecalhos');

    const target = presysSession('Destino');
    const before = snapshot(target);
    const targetPage = before.pages[2];
    const port = createRecordingInsertionPort(target);
    const result = await insertArsenalPreset({ preset, target: { kind: 'page', pageId: targetPage.id, placement: 'original' } }, port);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.objectIds).toHaveLength(2);
    const after = pageOf(snapshot(target), targetPage.id);
    expect(looks(after, result.objectIds)).toEqual(looks(sourcePage, [groupId, models.id]));
    // On top of what the page already had.
    const topBefore = Math.max(...targetPage.objects.map((object) => object.zIndex));
    for (const objectId of result.objectIds) expect(after.objects.find((object) => object.id === objectId)!.zIndex).toBeGreaterThan(topBefore);

    expect(target.undo().ok).toBe(true);
    expect(snapshot(target)).toEqual(before);
  });

  it('tabela "com valores" (escolha explícita) volta com a mesma estrutura, estilo, valores e tamanho', async () => {
    const source = presysSession('Origem');
    const tableObject = snapshot(source).pages[1].objects.find((object) => object.type === 'table')!;
    const preset = presetOf({ document: snapshot(source), source: { kind: 'table', objectId: tableObject.id }, origin: 'person', tableValues: 'generic-values' });
    expect(preset.payload.kind === 'table' && preset.payload.tableValues).toBe('generic-values');

    const target = createContractSession();
    const port = createRecordingInsertionPort(target);
    const result = await insertArsenalPreset({ preset, target: { kind: 'page', pageId: snapshot(target).pages[1].id } }, port);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const inserted = walkPageObjects(pageOf(snapshot(target), result.pageId)).find(({ object }) => object.id === result.objectIds[0])!.object;
    expect(inserted.type).toBe('table');
    if (inserted.type !== 'table' || tableObject.type !== 'table') return;
    expect(inserted.frame.widthMm).toBe(tableObject.frame.widthMm);
    expect(inserted.frame.heightMm).toBe(tableObject.frame.heightMm);
    expect(look({ ...inserted, frame: tableObject.frame })).toEqual(look(tableObject));
  });

  it('tabela por padrão vai sem valores técnicos e entra vazia (só cabeçalho), com um Desfazer', async () => {
    const source = presysSession('Origem');
    const tableObject = snapshot(source).pages[1].objects.find((object) => object.type === 'table')!;
    if (tableObject.type !== 'table') throw new Error('P4 has a table');
    expect(findArsenalTableValueViolations(tableObject.table).length).toBeGreaterThan(0);
    const preset = presetOf({ document: snapshot(source), source: { kind: 'table', objectId: tableObject.id }, origin: 'person' });
    expect(preset.payload.kind === 'table' && preset.payload.tableValues).toBe('structure-only');

    const target = presysSession('Destino');
    const before = snapshot(target);
    const port = createRecordingInsertionPort(target);
    const result = await insertArsenalPreset({ preset, target: { kind: 'page', pageId: before.pages[2].id } }, port);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const inserted = walkPageObjects(pageOf(snapshot(target), result.pageId)).find(({ object }) => object.id === result.objectIds[0])!.object;
    if (inserted.type !== 'table') throw new Error('table expected');
    expect(findArsenalTableValueViolations(inserted.table)).toEqual([]);
    expect(look({ ...inserted, table: inserted.table, frame: tableObject.frame })).toEqual(look({ ...tableObject, table: stripArsenalTableValues(tableObject.table) }));
    expect(target.undo().ok).toBe(true);
    expect(snapshot(target)).toEqual(before);
  });

  it('estilo de texto, forma, linha e tabela aplicam o mesmo visual (um Desfazer cada)', async () => {
    const source = presysSession('Origem');
    const [cover, specs] = snapshot(source).pages;
    const family = cover.objects.find((object) => object.id.endsWith('-family'))!;
    const band = cover.objects.find((object) => object.id.endsWith('-band'))!;
    const rule = specs.objects.find((object) => object.id.endsWith('-title-rule'))!;
    const table = specs.objects.find((object) => object.type === 'table')!;

    const target = createContractSession();
    const document = snapshot(target);
    const pageId = document.pages[1].id;
    const text = document.pages[0].objects.find((object) => object.type === 'text')!;
    const shape = document.pages[0].objects.find((object) => object.type === 'shape')!;
    const insert = (object: Parameters<DocumentSession['execute']>[0]) => {
      const result = target.execute(object);
      if (!result.ok) throw new Error(result.error.code);
      return result.metadata.createdIds[0];
    };
    const lineId = insert({ type: 'object.insert', pageId, object: { type: 'line', zIndex: 0, axis: 'horizontal', color: '#000000', frameU: frameToCanonicalU({ xMm: 20, yMm: 20, widthMm: 50, heightMm: 0.3 }) } });
    const tableId = insert({ type: 'object.insert', pageId, object: { type: 'table', zIndex: 1, frameU: frameToCanonicalU({ xMm: 20, yMm: 40, widthMm: 120, heightMm: 30 }), table: contractTable('dest') } });

    for (const [sourceObject, targetId] of [[family, text.id], [band, shape.id], [rule, lineId], [table, tableId]] as const) {
      const preset = presetOf({ document: snapshot(source), source: { kind: 'style', objectId: sourceObject.id }, origin: 'person' });
      const before = snapshot(target);
      const port = createRecordingInsertionPort(target);
      const result = await insertArsenalPreset({ preset, target: { kind: 'object', objectId: targetId } }, port);
      expect(result.ok).toBe(true);
      const styled = walkPageObjects(snapshot(target).pages.find((page) => walkPageObjects(page).some(({ object }) => object.id === targetId))!)
        .find(({ object }) => object.id === targetId)!.object;
      if (sourceObject.type === 'text' && styled.type === 'text') {
        const { fontFamily: _family, ...expected } = sourceObject.style;
        expect(styled.style).toMatchObject(expected);
      } else if (sourceObject.type === 'shape' && styled.type === 'shape') {
        expect(styled.style).toEqual(sourceObject.style);
      } else if (sourceObject.type === 'line' && styled.type === 'line') {
        expect({ color: styled.color, thicknessPt: styled.thicknessPt, dash: styled.dash, opacity: styled.opacity })
          .toEqual({ color: sourceObject.color, thicknessPt: sourceObject.thicknessPt, dash: sourceObject.dash, opacity: sourceObject.opacity });
      } else if (sourceObject.type === 'table' && styled.type === 'table') {
        expect(styled.table.style.base).toEqual(sourceObject.table.style.base);
        expect(styled.table.style.rowRoles).toEqual(sourceObject.table.style.rowRoles);
        expect(styled.table.style.annotationGapMm).toBe(sourceObject.table.style.annotationGapMm);
      } else {
        throw new Error(`unexpected pair ${sourceObject.type} → ${styled.type}`);
      }
      expect(target.undo().ok).toBe(true);
      expect(snapshot(target)).toEqual(before);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------------------------------------------

function resolvedFrames(page: Page, ids: readonly string[]): Frame[] {
  return walkPageObjects(page)
    .filter(({ object, parentGroup }) => ids.includes(object.id) || (parentGroup && ids.includes(parentGroup.id)))
    .map(({ resolvedFrameU }) => ({ xMm: resolvedFrameU.xU / 10_000, yMm: resolvedFrameU.yU / 10_000, widthMm: resolvedFrameU.widthU / 10_000, heightMm: resolvedFrameU.heightU / 10_000 }));
}

function overlaps(a: Frame, b: Frame): boolean {
  return a.xMm < b.xMm + b.widthMm && b.xMm < a.xMm + a.widthMm && a.yMm < b.yMm + b.heightMm && b.yMm < a.yMm + a.heightMm;
}

/** A small callout block ("chamada") filed under Páginas: it has no fixed place. */
function calloutPreset(): ArsenalPreset {
  return teamPresetFromDraft({
    kind: 'block', origin: 'person', name: 'Chamada', category: 'paginas', tags: ['chamada'], synonyms: [], payloadSchemaVersion: 1,
    payload: {
      kind: 'block', frame: { xMm: 150, yMm: 250, widthMm: 60, heightMm: 30 }, tableValues: 'structure-only', assets: [],
      objects: [
        { id: 'callout-box', type: 'shape', shape: 'rectangle', zIndex: 0, frame: { xMm: 0, yMm: 0, widthMm: 60, heightMm: 30 }, style: { fill: '#DCEFF8' } },
        { id: 'callout-text', type: 'text', zIndex: 1, frame: { xMm: 4, yMm: 4, widthMm: 52, heightMm: 10 }, text: plainRichText('callout-text', 'Destaque'), style: { fontSizePt: 12 } },
      ],
    },
  });
}

describe('posição sensata: nada fora da área segura nem embaixo do rodapé automático', () => {
  it('blocos sem posição vão para o meio da área livre, sem cobrir o que já está na página', async () => {
    const session = presysSession('Destino');
    const pageId = snapshot(session).pages[1].id;
    const placed: Frame[] = [];
    for (let round = 0; round < 4; round += 1) {
      const document = snapshot(session);
      const page = pageOf(document, pageId);
      const box = arsenalContentBoxMm(page, document.style.pageFooter, pageNumber(document, pageId));
      expect(box.yMm + box.heightMm).toBeLessThanOrEqual(279);
      const existing = page.objects.filter((object) => frameInside(object.frame, box) && object.type !== 'line').map((object) => object.frame);
      const result = await insertArsenalPreset({ preset: calloutPreset(), target: { kind: 'page', pageId } }, createRecordingInsertionPort(session));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const frames = resolvedFrames(pageOf(snapshot(session), pageId), result.objectIds);
      for (const frame of frames) expect(frameInside(frame, box)).toBe(true);
      const outer = frames[0];
      for (const other of [...existing, ...placed]) expect(overlaps(outer, other)).toBe(false);
      placed.push(outer);
    }
  });

  it('tabela sem posição vai para o topo da área livre, dentro da área segura, e cabe na largura', async () => {
    const session = presysSession('Destino');
    const document = snapshot(session);
    const page = document.pages[2];
    const box = arsenalContentBoxMm(page, document.style.pageFooter, 3);
    const wide = teamPresetFromDraft({ ...specTableDraft(), payload: { ...(specTableDraft().payload as Extract<ArsenalPresetDraft['payload'], { kind: 'table' }>), sizeMm: { widthMm: 260, heightMm: 30 } } });
    const result = await insertArsenalPreset({ preset: wide, target: { kind: 'page', pageId: page.id } }, createRecordingInsertionPort(session));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [frame] = resolvedFrames(pageOf(snapshot(session), page.id), result.objectIds);
    expect(frameInside(frame, box)).toBe(true);
    expect(frame.widthMm).toBe(box.widthMm);
    for (const object of page.objects.filter((entry) => frameInside(entry.frame, box))) expect(overlaps(frame, object.frame)).toBe(false);
  });

  it('um ponto escolhido é respeitado, mas puxado para dentro da área segura', async () => {
    const session = presysSession('Destino');
    const document = snapshot(session);
    const page = document.pages[2];
    const box = arsenalContentBoxMm(page, document.style.pageFooter, 3);
    const result = await insertArsenalPreset({ preset: calloutPreset(), target: { kind: 'page', pageId: page.id, placement: { xMm: 190, yMm: 290 } } }, createRecordingInsertionPort(session));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [frame] = resolvedFrames(pageOf(snapshot(session), page.id), result.objectIds);
    expect(frameInside(frame, box)).toBe(true);
    expect(frame.xMm + frame.widthMm).toBeCloseTo(box.xMm + box.widthMm, 4);
    expect(frame.yMm + frame.heightMm).toBeCloseTo(box.yMm + box.heightMm, 4);
  });

  it('cabeçalho sem posição volta ao lugar de origem (faixa sangrada continua no topo)', async () => {
    const session = createContractSession();
    const pageId = snapshot(session).pages[1].id;
    const result = await insertArsenalPreset({ preset: teamPresetFromDraft(headerBlockDraft()), target: { kind: 'page', pageId } }, createRecordingInsertionPort(session));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const frames = resolvedFrames(pageOf(snapshot(session), pageId), result.objectIds);
    expect(frames[0]).toEqual({ xMm: 0, yMm: 0, widthMm: 210, heightMm: 24 });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Fonts, locks and stale targets
// ---------------------------------------------------------------------------------------------------------------

describe('regras de segurança da inserção', () => {
  it('fonte que o catálogo de destino não tem cai na fonte do documento', async () => {
    const draft = headerBlockDraft();
    if (draft.payload.kind !== 'block') throw new Error('block');
    const objects = draft.payload.objects.map((object) => object.type === 'text' ? { ...object, style: { ...object.style, fontFamily: 'Fonte Inexistente' } } : object);
    const preset = teamPresetFromDraft({ ...draft, payload: { ...draft.payload, objects } });
    const session = createContractSession();
    const pageId = snapshot(session).pages[1].id;
    const result = await insertArsenalPreset({ preset, target: { kind: 'page', pageId, placement: 'original' } }, createRecordingInsertionPort(session));
    expect(result.ok).toBe(true);
    const text = pageOf(snapshot(session), pageId).objects.find((object) => object.type === 'text');
    expect(text?.type === 'text' && text.style.fontFamily).toBeFalsy();
    expect(text?.type === 'text' && text.style.fontSizePt).toBe(14);
  });

  it('estilo em objeto travado ou texto dentro de grupo é recusado sem executar nada', async () => {
    const session = createContractSession();
    const document = snapshot(session);
    const [text, shape] = document.pages[0].objects;
    expect(session.execute({ type: 'object.setLocked', objectId: text.id, expectedLocked: false, locked: true }).ok).toBe(true);
    const port = createRecordingInsertionPort(session);
    const locked = await insertArsenalPreset({ preset: teamPresetFromDraft(titleStyleDraft()), target: { kind: 'object', objectId: text.id } }, port);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.error.code).toBe('TARGET_INVALID');
    expect(port.executes).toHaveLength(0);

    expect(session.execute({ type: 'object.setLocked', objectId: text.id, expectedLocked: true, locked: false }).ok).toBe(true);
    expect(session.execute({ type: 'group.create', pageId: document.pages[0].id, objectIds: [text.id, shape.id] }).ok).toBe(true);
    const port2 = createRecordingInsertionPort(session);
    const grouped = await insertArsenalPreset({ preset: teamPresetFromDraft(titleStyleDraft()), target: { kind: 'object', objectId: text.id } }, port2);
    expect(grouped.ok).toBe(false);
    expect(port2.executes).toHaveLength(0);
  });

  it('página removida enquanto as imagens eram conferidas: nada executa', async () => {
    const session = createContractSession();
    const pageId = snapshot(session).pages[1].id;
    const port = createRecordingInsertionPort(session);
    const racing = {
      ...port,
      isAssetAvailable: async () => {
        session.execute({ type: 'page.delete', pageId });
        return true;
      },
    };
    const logo = teamPresetFromDraft({
      ...headerBlockDraft(),
      payload: {
        kind: 'block', frame: { xMm: 150, yMm: 10, widthMm: 40, heightMm: 20 }, tableValues: 'structure-only',
        assets: [{ id: '7e8ad13e-8bd3-4709-8e89-98870ee157bf', version: '1', sha256: 'a'.repeat(64), mime: 'image/png', widthPx: 400, heightPx: 200, name: 'logo.png', alt: 'Logo' }],
        objects: [{ id: 'logo', type: 'image', zIndex: 0, frame: { xMm: 0, yMm: 0, widthMm: 40, heightMm: 20 }, assetId: '7e8ad13e-8bd3-4709-8e89-98870ee157bf', fit: 'contain' }],
      },
    });
    const result = await insertArsenalPreset({ preset: logo, target: { kind: 'page', pageId } }, racing);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('TARGET_NOT_FOUND');
    expect(port.executes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Built-in PRESYS page models
// ---------------------------------------------------------------------------------------------------------------

describe('modelo PRESYS embutido (somente leitura)', () => {
  function builtinP4(): ArsenalPreset {
    const page = buildPresysArchetypePage('P4', { pageId: 'builtin-p4' });
    return {
      id: 'builtin:presys-p4-especificacoes', scope: 'builtin', origin: 'builtin', kind: 'page', name: 'Especificações', category: 'paginas',
      tags: [], synonyms: [], payloadSchemaVersion: 1, revision: 1, createdBy: null, createdByName: null, createdAt: null, updatedAt: null,
      useCount: 0, lastUsedAt: null,
      payload: { kind: 'page', safeArea: page.safeArea, objects: page.objects, tableValues: 'generic-values', assets: [] },
    };
  }

  it('entra por page.template.insert quando o editor conhece o modelo (igual a "Usar modelo…"), com um Desfazer', async () => {
    const document = createPresysArchetypeDocument({ documentId: id(), title: 'Destino', sequence: ['P1'] });
    const session = createDocumentSession(document, { createId: id, templateRegistry: createPresysArchetypeTemplateRegistry() });
    const before = snapshot(session);
    const port = createRecordingInsertionPort(session);
    const result = await insertArsenalPreset({ preset: builtinP4(), target: { kind: 'new-page', afterPageId: before.pages[0].id } }, port);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(port.executes.map((call) => call.action.type)).toEqual(['page.template.insert']);
    const inserted = pageOf(snapshot(session), result.pageId);
    expect(looks(inserted)).toEqual(looks(buildPresysArchetypePage('P4', { pageId: 'reference' })));
    expect(result.objectIds).toEqual(inserted.objects.map((object) => object.id));
    expect(session.undo().ok).toBe(true);
    expect(snapshot(session)).toEqual(before);
  });

  it('sem o modelo no editor, monta a mesma página a partir do conteúdo', async () => {
    const session = createContractSession();
    const port = createRecordingInsertionPort(session);
    const result = await insertArsenalPreset({ preset: builtinP4(), target: { kind: 'new-page' } }, port);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(port.executes[0].action.type).toBe('page.template.insert');
    expect(port.executes[1].action.type).toBe('page.add');
    expect(looks(pageOf(snapshot(session), result.pageId))).toEqual(looks(buildPresysArchetypePage('P4', { pageId: 'reference' })));
    expect(port.undoCalls()).toBe(0);
  });
});

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDocumentSession, type DocumentSession } from '../../../src/vnext/application';
import { frameToCanonicalU, type CatalogDocument } from '../../../src/vnext/domain';
import { createPresysArchetypeDocument } from '../../../src/vnext/library/presys-archetypes';
import {
  findArsenalTableValueViolations,
  parseArsenalPresetDraft,
  validateArsenalPayload,
} from '../../../src/vnext/arsenal/contracts';
import { buildArsenalPresetDraft, captureArsenalContent, createArsenalCaptureService } from '../../../src/vnext/arsenal/arsenal-capture';
import { ARSENAL_PHOTO_PLACEHOLDER_TEXT } from '../../../src/vnext/arsenal/arsenal-placeholder';
import { CONTRACT_ASSET, contractTable } from './contract/fixtures';

const id = () => randomUUID();

function presysSession(): DocumentSession {
  return createDocumentSession(createPresysArchetypeDocument({ documentId: id(), title: 'Origem', sequence: ['P1', 'P4'] }), { createId: id });
}

const doc = (session: DocumentSession): CatalogDocument => session.getSnapshot().document;

function insert(session: DocumentSession, action: Parameters<DocumentSession['execute']>[0]): string {
  const result = session.execute(action);
  if (!result.ok) throw new Error(`${result.error.code} ${result.error.details}`);
  return result.metadata.createdIds[0];
}

/** A catalog with the contract logo registered and drawn on page 2, inside a group with a caption. */
function sessionWithLogo(): { session: DocumentSession; pageId: string; groupId: string; imageId: string; captionId: string } {
  const session = presysSession();
  const pageId = doc(session).pages[1].id;
  const imageId = insert(session, {
    type: 'object.insert', pageId,
    object: { type: 'image', zIndex: 10, frameU: frameToCanonicalU({ xMm: 120, yMm: 150, widthMm: 60, heightMm: 40 }), assetId: CONTRACT_ASSET.id, asset: CONTRACT_ASSET, fit: 'contain' },
  });
  const captionId = insert(session, {
    type: 'object.insert', pageId,
    object: { type: 'text', zIndex: 11, frameU: frameToCanonicalU({ xMm: 120, yMm: 192, widthMm: 60, heightMm: 8 }), text: { paragraphs: [{ id: 'cap:p', inlines: [{ kind: 'text', id: 'cap:t', text: 'Legenda da foto', marks: [] }] }] }, style: { fontSizePt: 8 } },
  });
  const groupId = insert(session, { type: 'group.create', pageId, objectIds: [imageId, captionId] });
  return { session, pageId, groupId, imageId, captionId };
}

describe('captura do arsenal', () => {
  it('página inteira: guarda área segura, objetos visíveis e sugere Capa para a primeira página', () => {
    const session = presysSession();
    const cover = doc(session).pages[0];
    const result = createArsenalCaptureService().capture({ document: doc(session), source: { kind: 'page', pageId: cover.id }, origin: 'person' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.kind).toBe('page');
    expect(result.content.suggestedCategory).toBe('capas');
    expect(result.content.suggestedName.startsWith('Capa')).toBe(true);
    expect(result.content.suggestedName).not.toContain('A COMPLETAR');
    const { payload } = result.content;
    if (payload.kind !== 'page') throw new Error('page payload');
    expect(payload.safeArea).toEqual(cover.safeArea);
    expect(payload.objects).toHaveLength(cover.objects.length);
    expect(payload.objects.map((object) => object.zIndex)).toEqual(payload.objects.map((_, index) => index));
    const draft = parseArsenalPresetDraft(buildArsenalPresetDraft(result.content));
    expect(draft.ok).toBe(true);
  });

  it('tabela: por padrão guarda só estrutura e estilo (corpo vazio, "valores vêm do PDF") e avisa', () => {
    const session = presysSession();
    const table = doc(session).pages[1].objects.find((object) => object.type === 'table')!;
    if (table.type !== 'table') throw new Error('table');
    const result = captureArsenalContent({ document: doc(session), source: { kind: 'table', objectId: table.id }, origin: 'person' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { payload } = result.content;
    if (payload.kind !== 'table') throw new Error('table payload');
    expect(payload.tableValues).toBe('structure-only');
    expect(findArsenalTableValueViolations(payload.table)).toEqual([]);
    expect(payload.table.rows).toHaveLength(table.table.rows.length);
    expect(payload.table.columns).toEqual(table.table.columns);
    expect(payload.table.style).toEqual(table.table.style);
    expect(payload.sizeMm).toEqual({ widthMm: table.frame.widthMm, heightMm: table.frame.heightMm });
    expect(result.notes).toContainEqual({ code: 'TABLE_VALUES_REMOVED', objectIds: [table.id] });
    expect(result.content.suggestedCategory).toBe('tabelas');
  });

  it('tabela: "manter valores" só por escolha explícita, e então guarda medidas, notas e título', () => {
    const session = presysSession();
    const pageId = doc(session).pages[1].id;
    const objectId = insert(session, {
      type: 'object.insert', pageId,
      object: { type: 'table', zIndex: 20, frameU: frameToCanonicalU({ xMm: 18, yMm: 150, widthMm: 120, heightMm: 30 }), table: contractTable('kept', 'with-values') },
    });
    const kept = captureArsenalContent({ document: doc(session), source: { kind: 'table', objectId }, origin: 'person', tableValues: 'generic-values' });
    expect(kept.ok).toBe(true);
    if (!kept.ok || kept.content.payload.kind !== 'table') return;
    expect(kept.notes).toEqual([]);
    const cells = kept.content.payload.table.cells.map((cell) => cell.content.type);
    expect(cells).toContain('measurement');
    expect(kept.content.payload.table.annotations).toHaveLength(1);
    expect(kept.content.payload.table.title).toBeDefined();
    expect(kept.content.suggestedName).toBe('Tabela – Especificações do PCON-1000');

    const stripped = captureArsenalContent({ document: doc(session), source: { kind: 'table', objectId }, origin: 'ai' });
    expect(stripped.ok).toBe(true);
    if (!stripped.ok || stripped.content.payload.kind !== 'table') return;
    expect(stripped.content.origin).toBe('ai');
    const headerRowId = stripped.content.payload.table.rows[0].id;
    expect(stripped.content.payload.table.cells.filter((cell) => cell.content.type !== 'empty').map((cell) => cell.rowId))
      .toEqual([headerRowId, headerRowId]);
    expect(stripped.content.payload.table.annotations).toEqual([]);
    expect(stripped.content.payload.table.title).toBeUndefined();
  });

  it('seleção: grupo com imagem guarda o quadro de origem, posições relativas e o asset; moldura quando pedida', () => {
    const { session, pageId, groupId } = sessionWithLogo();
    const group = doc(session).pages[1].objects.find((object) => object.id === groupId)!;
    const result = captureArsenalContent({ document: doc(session), source: { kind: 'objects', pageId, objectIds: [groupId] }, origin: 'person' });
    expect(result.ok).toBe(true);
    if (!result.ok || result.content.payload.kind !== 'block') return;
    const { payload } = result.content;
    expect(payload.frame).toEqual(group.frame);
    expect(payload.objects[0].frame).toEqual({ ...group.frame, xMm: 0, yMm: 0 });
    expect(payload.assets).toEqual([CONTRACT_ASSET]);
    expect(validateArsenalPayload(payload)).toEqual([]);

    const framed = captureArsenalContent({ document: doc(session), source: { kind: 'objects', pageId, objectIds: [groupId] }, origin: 'person', placeholderAssetIds: [CONTRACT_ASSET.id] });
    expect(framed.ok).toBe(true);
    if (!framed.ok || framed.content.payload.kind !== 'block') return;
    expect(framed.content.payload.assets).toEqual([]);
    expect(JSON.stringify(framed.content.payload)).toContain(ARSENAL_PHOTO_PLACEHOLDER_TEXT);
    expect(framed.notes.find((note) => note.code === 'IMAGE_PLACEHOLDER')?.objectIds).toHaveLength(1);
    const outer = framed.content.payload.objects[0];
    expect(outer.type).toBe('group');
    if (outer.type === 'group') expect(outer.objects.map((child) => child.type)).toEqual(['shape', 'text', 'text']);
  });

  it('seleção: ocultos ficam de fora (com aviso); só ocultos = nada a guardar', () => {
    const session = presysSession();
    const page = doc(session).pages[1];
    const [title, rule] = page.objects;
    expect(session.execute({ type: 'object.setHidden', objectId: rule.id, expectedHidden: false, hidden: true }).ok).toBe(true);
    const result = captureArsenalContent({ document: doc(session), source: { kind: 'objects', pageId: page.id, objectIds: [title.id, rule.id] }, origin: 'person' });
    expect(result.ok).toBe(true);
    if (!result.ok || result.content.payload.kind !== 'block') return;
    expect(result.content.payload.objects).toHaveLength(1);
    expect(result.content.payload.frame).toEqual(title.frame);
    expect(result.notes).toContainEqual({ code: 'HIDDEN_OBJECTS_SKIPPED', objectIds: [rule.id] });

    const empty = captureArsenalContent({ document: doc(session), source: { kind: 'objects', pageId: page.id, objectIds: [rule.id] }, origin: 'person' });
    expect(empty).toEqual({ ok: false, error: { code: 'SOURCE_EMPTY', details: rule.id } });
  });

  it('seleção de um filho de grupo leva só ele, na posição da página', () => {
    const { session, pageId, captionId } = sessionWithLogo();
    const result = captureArsenalContent({ document: doc(session), source: { kind: 'objects', pageId, objectIds: [captionId] }, origin: 'person' });
    expect(result.ok).toBe(true);
    if (!result.ok || result.content.payload.kind !== 'block') return;
    expect(result.content.payload.frame).toEqual({ xMm: 120, yMm: 192, widthMm: 60, heightMm: 8 });
    expect(result.content.payload.objects).toHaveLength(1);
    expect(result.content.payload.objects[0].type).toBe('text');
  });

  it('estilo: guarda o visual de texto, forma, linha e tabela; imagem e grupo não têm estilo', () => {
    const { session, groupId, imageId } = sessionWithLogo();
    const [cover, specs] = doc(session).pages;
    const family = cover.objects.find((object) => object.id.endsWith('-family'))!;
    const text = captureArsenalContent({ document: doc(session), source: { kind: 'style', objectId: family.id }, origin: 'person' });
    expect(text.ok && text.content.payload).toEqual({ kind: 'style', style: { target: 'text', text: family.type === 'text' ? family.style : {} } });
    expect(text.ok && text.content.suggestedName).toBe('Texto 26 pt negrito');
    const rule = specs.objects.find((object) => object.type === 'line')!;
    const line = captureArsenalContent({ document: doc(session), source: { kind: 'style', objectId: rule.id }, origin: 'person' });
    expect(line.ok && line.content.payload.kind === 'style' && line.content.payload.style.target).toBe('line');
    const table = specs.objects.find((object) => object.type === 'table')!;
    const tableStyle = captureArsenalContent({ document: doc(session), source: { kind: 'style', objectId: table.id }, origin: 'person' });
    expect(tableStyle.ok && tableStyle.content.suggestedCategory).toBe('estilos');
    for (const objectId of [groupId, imageId]) {
      const refused = captureArsenalContent({ document: doc(session), source: { kind: 'style', objectId }, origin: 'person' });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.code).toBe('SOURCE_UNSUPPORTED');
    }
  });

  it('fonte inexistente ou alvo errado: erro claro, nada é inventado', () => {
    const session = presysSession();
    const document = doc(session);
    const text = document.pages[0].objects.find((object) => object.type === 'text')!;
    const cases = [
      captureArsenalContent({ document, source: { kind: 'page', pageId: 'sem-pagina' }, origin: 'person' }),
      captureArsenalContent({ document, source: { kind: 'objects', pageId: document.pages[0].id, objectIds: ['sem-objeto'] }, origin: 'person' }),
      captureArsenalContent({ document, source: { kind: 'table', objectId: text.id }, origin: 'person' }),
      captureArsenalContent({ document, source: { kind: 'objects', pageId: document.pages[0].id, objectIds: [] }, origin: 'person' }),
    ];
    expect(cases.map((entry) => (entry.ok ? 'ok' : entry.error.code))).toEqual(['SOURCE_NOT_FOUND', 'SOURCE_NOT_FOUND', 'SOURCE_UNSUPPORTED', 'SOURCE_EMPTY']);
  });

  it('rascunho: nome e categoria da pessoa prevalecem; vazio usa a sugestão; categoria fora do tipo é recusada', () => {
    const session = presysSession();
    const table = doc(session).pages[1].objects.find((object) => object.type === 'table')!;
    const captured = captureArsenalContent({ document: doc(session), source: { kind: 'table', objectId: table.id }, origin: 'person' });
    if (!captured.ok) throw new Error('capture');
    const named = buildArsenalPresetDraft(captured.content, { name: '  Ficha   técnica ', tags: ['ficha'], description: 'Três colunas' });
    expect(named.name).toBe('Ficha técnica');
    expect(parseArsenalPresetDraft(named).ok).toBe(true);
    expect(buildArsenalPresetDraft(captured.content, { name: '   ' }).name).toBe(captured.content.suggestedName);
    expect(parseArsenalPresetDraft(buildArsenalPresetDraft(captured.content, { category: 'capas' })).ok).toBe(false);
  });
});

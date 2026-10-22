import { describe, expect, it } from 'vitest';
import { CatalogDocumentSchema, plainRichText, type CatalogDocument, type EditorialObject } from '@/vnext/domain';
import {
  ApplicationActionSchema,
  createCatalogDocument,
  createDocumentSession,
  executeApplicationAction,
  parseCanonicalDocument,
} from '@/vnext/application';

function ids(prefix = 'generated') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

const ASSET = {
  id: 'asset-bg', version: '1', sha256: 'a'.repeat(64), mime: 'image/png' as const,
  widthPx: 2481, heightPx: 3509, name: 'fundo.png', alt: 'Fundo',
};

function documentWith(objects: EditorialObject[]): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'Onda 3.5');
  return { ...base, assets: [ASSET], pages: [{ ...base.pages[0], objects }] };
}

const shape: EditorialObject = {
  id: 'shape', type: 'shape', shape: 'rectangle', frame: { xMm: 10, yMm: 10, widthMm: 40, heightMm: 20 }, zIndex: 0,
  style: { fill: '#EDF5FF', stroke: { pattern: 'solid', thicknessPt: 1, color: '#003F78' } },
};
const line: EditorialObject = {
  id: 'line', type: 'line', axis: 'horizontal', color: '#003366', frame: { xMm: 10, yMm: 50, widthMm: 100, heightMm: 0.8 }, zIndex: 1,
};
const polygon: EditorialObject = {
  id: 'polygon', type: 'polygon', frame: { xMm: 0, yMm: 0, widthMm: 210, heightMm: 120 }, zIndex: -1,
  points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.55 }, { x: 0, y: 1 }],
  style: { fill: { kind: 'solid', color: '#092D4D' } },
};
const text: EditorialObject = {
  id: 'text', type: 'text', frame: { xMm: 14, yMm: 236, widthMm: 17, heightMm: 4.1 }, zIndex: 3,
  text: plainRichText('text-rich', '0 a 250 psi'), style: { fontSizePt: 6.4, color: '#FFFFFF', textAlign: 'center' },
};

function run(document: CatalogDocument, action: unknown) {
  return executeApplicationAction(document, action, { createId: ids() });
}

function objectOf<T extends EditorialObject['type']>(document: CatalogDocument, id: string, type: T): Extract<EditorialObject, { type: T }> {
  const object = document.pages[0].objects.find((entry) => entry.id === id);
  if (!object || object.type !== type) throw new Error(`Missing ${type} ${id}`);
  return object as Extract<EditorialObject, { type: T }>;
}

describe('Onda 3.5 canonical model: old documents load unchanged', () => {
  it('a document without any new field parses to exactly itself (schemaVersion stays 1)', () => {
    const old = documentWith([shape, line, text]);
    const parsed = parseCanonicalDocument(JSON.parse(JSON.stringify(old)));
    expect(parsed).toEqual(old);
    expect(parsed.schemaVersion).toBe(1);
  });

  it('accepts the new element and styles and refuses invalid ones', () => {
    const rich = documentWith([
      { ...shape, style: { ...(shape as Extract<EditorialObject, { type: 'shape' }>).style, opacity: 0.5, cornerRadiusMm: 2, strokeDash: 'dashed' } },
      { ...line, thicknessPt: 2, dash: 'dotted', opacity: 0.8 } as EditorialObject,
      { ...polygon, style: { fill: { kind: 'pattern', pattern: 'waves', color: '#FFFFFF', background: '#092D4D', spacingMm: 4 } } } as EditorialObject,
      { ...text, box: { fill: '#092D4D', paddingMm: 2, fitText: true }, leader: { anchorXMm: 40, anchorYMm: -10, head: 'arrow', elbow: true, color: '#092D4D', thicknessPt: 0.75 } } as EditorialObject,
    ]);
    const withBackground = { ...rich, pages: [{ ...rich.pages[0], background: { color: '#F7F3EA', image: { assetId: 'asset-bg', fit: 'cover' as const } } }] };
    expect(() => parseCanonicalDocument(withBackground)).not.toThrow();
    expect(CatalogDocumentSchema.safeParse({ ...rich, pages: [{ ...rich.pages[0], background: {} }] }).success).toBe(false);
    const badPolygon = { ...polygon, points: [{ x: 0, y: 0 }, { x: 1.2, y: 0 }, { x: 0, y: 1 }] };
    expect(CatalogDocumentSchema.safeParse(documentWith([badPolygon as EditorialObject])).success).toBe(false);
    const twoPoints = { ...polygon, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
    expect(CatalogDocumentSchema.safeParse(documentWith([twoPoints as EditorialObject])).success).toBe(false);
  });

  it('refuses a page background that points to a missing picture', () => {
    const base = documentWith([]);
    expect(() => parseCanonicalDocument({ ...base, pages: [{ ...base.pages[0], background: { image: { assetId: 'missing', fit: 'cover' } } }] }))
      .toThrow(/ASSET_REFERENCE_DANGLING/);
  });
});

describe('Onda 3.5 style actions', () => {
  it('shape.setStyle replaces the style, refuses a stale one, and one Desfazer brings it back', () => {
    const document = documentWith([shape]);
    const session = createDocumentSession(document, { createId: ids() });
    const before = objectOf(document, 'shape', 'shape').style;
    const style = { fill: '#8A642B', opacity: 0.6, cornerRadiusMm: 3, strokeDash: 'dashed' as const, stroke: before.stroke };
    const result = session.execute({ type: 'shape.setStyle', objectId: 'shape', expectedStyle: before, style }, { transactionId: 't1' });
    expect(result.ok).toBe(true);
    expect(objectOf(session.getSnapshot().document, 'shape', 'shape').style).toEqual(style);
    expect(run(session.getSnapshot().document, { type: 'shape.setStyle', objectId: 'shape', expectedStyle: before, style: before }))
      .toMatchObject({ ok: false, error: { code: 'TARGET_STALE' } });
    session.undo();
    expect(session.getSnapshot().document).toEqual(document);
  });

  it('line.setStyle adds thickness, dash and opacity and can take them away again', () => {
    const document = documentWith([line]);
    const result = run(document, { type: 'line.setStyle', objectId: 'line', expectedStyle: { color: '#003366' },
      style: { color: '#8A642B', thicknessPt: 1.5, dash: 'dashed', opacity: 0.5 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(objectOf(result.document, 'line', 'line')).toMatchObject({ color: '#8A642B', thicknessPt: 1.5, dash: 'dashed', opacity: 0.5 });
    const back = run(result.document, { type: 'line.setStyle', objectId: 'line',
      expectedStyle: { color: '#8A642B', thicknessPt: 1.5, dash: 'dashed', opacity: 0.5 }, style: { color: '#003366' } });
    expect(back.ok && back.document).toEqual(document);
  });

  it('polygon.setStyle switches to a gradient and polygon.setPoints moves the vertices', () => {
    const document = documentWith([polygon]);
    const current = objectOf(document, 'polygon', 'polygon');
    const gradient = run(document, { type: 'polygon.setStyle', objectId: 'polygon', expectedStyle: current.style,
      style: { fill: { kind: 'linear', from: '#092D4D', to: '#8A642B', angleDeg: 90 }, opacity: 0.9 } });
    expect(gradient.ok).toBe(true);
    if (!gradient.ok) return;
    const points = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }];
    const moved = run(gradient.document, { type: 'polygon.setPoints', objectId: 'polygon', expectedPoints: current.points, points });
    expect(moved.ok && objectOf(moved.document, 'polygon', 'polygon').points).toEqual(points);
    expect(run(gradient.document, { type: 'polygon.setPoints', objectId: 'polygon', expectedPoints: points, points: current.points }))
      .toMatchObject({ ok: false, error: { code: 'TARGET_STALE' } });
  });

  it('text.setBox and text.setLeader add, change and remove the selo and the pointer of one text box', () => {
    const document = documentWith([text]);
    const box = { fill: '#092D4D', paddingMm: 1.5, fitText: true };
    const withBox = run(document, { type: 'text.setBox', objectId: 'text', expectedBox: null, box });
    expect(withBox.ok).toBe(true);
    if (!withBox.ok) return;
    const leader = { anchorXMm: 60, anchorYMm: -20, head: 'dot' as const, elbow: true, color: '#092D4D', thicknessPt: 0.75 };
    const withLeader = run(withBox.document, { type: 'text.setLeader', objectId: 'text', expectedLeader: null, leader });
    expect(withLeader.ok).toBe(true);
    if (!withLeader.ok) return;
    const after = objectOf(withLeader.document, 'text', 'text');
    expect(after).toMatchObject({ box, leader, frame: text.frame });
    expect(run(withLeader.document, { type: 'text.setBox', objectId: 'text', expectedBox: null, box })).toMatchObject({ ok: false, error: { code: 'TARGET_STALE' } });
    const removed = run(withLeader.document, { type: 'text.setBox', objectId: 'text', expectedBox: box, box: null });
    expect(removed.ok && objectOf(removed.document, 'text', 'text').box).toBeUndefined();
  });

  it('text.setStyle takes a free size, any colour, line height and letter spacing in one step', () => {
    const document = documentWith([text]);
    const result = run(document, { type: 'text.setStyle', objectId: 'text', expectedStyle: (text as Extract<EditorialObject, { type: 'text' }>).style,
      patch: { fontSizePt: 7.2, color: '#F3DDB8', lineHeight: 1.1, letterSpacingEm: 0.08 } });
    expect(result.ok && objectOf(result.document, 'text', 'text').style).toEqual({ fontSizePt: 7.2, color: '#F3DDB8', textAlign: 'center', lineHeight: 1.1, letterSpacingEm: 0.08 });
  });

  it('page.setBackground sets colour and picture as a page property and is undone in one step', () => {
    const document = documentWith([shape]);
    const session = createDocumentSession(document, { createId: ids() });
    const pageId = document.pages[0].id;
    const background = { color: '#092D4D', image: { assetId: 'asset-bg', fit: 'cover' as const } };
    expect(session.execute({ type: 'page.setBackground', pageId, expectedBackground: null, background }, { transactionId: 'bg' }).ok).toBe(true);
    expect(session.getSnapshot().document.pages[0].background).toEqual(background);
    expect(session.getSnapshot().document.pages[0].objects).toEqual(document.pages[0].objects);
    expect(run(session.getSnapshot().document, { type: 'page.setBackground', pageId, expectedBackground: background,
      background: { image: { assetId: 'nope', fit: 'cover' } } })).toMatchObject({ ok: false, error: { code: 'ASSET_NOT_FOUND' } });
    session.undo();
    expect(session.getSnapshot().document).toEqual(document);
  });

  it('refuses locked objects and wrong types, and allows style changes of a selo inside a group', () => {
    const locked = documentWith([{ ...shape, locked: true }]);
    expect(run(locked, { type: 'shape.setStyle', objectId: 'shape', expectedStyle: objectOf(locked, 'shape', 'shape').style, style: {} }))
      .toMatchObject({ ok: false, error: { code: 'OBJECT_LOCKED' } });
    expect(run(documentWith([line]), { type: 'shape.setStyle', objectId: 'line', expectedStyle: {}, style: {} }))
      .toMatchObject({ ok: false, error: { code: 'OBJECT_TYPE_MISMATCH' } });
    const pill = { ...text, id: 'pill', frame: { ...text.frame, xMm: 0, yMm: 0 }, box: { fill: '#EDF3F7', paddingMm: 1.5, fitText: true } } as EditorialObject;
    const other = { ...text, id: 'pill-2', text: plainRichText('pill-2-rich', 'DT'), frame: { ...text.frame, xMm: 20, yMm: 0 } } as EditorialObject;
    const grouped = documentWith([{ id: 'bar', type: 'group', frame: { xMm: 14, yMm: 266, widthMm: 37, heightMm: 4.1 }, zIndex: 0, objects: [pill, other] as never }]);
    const result = run(grouped, { type: 'text.setBox', objectId: 'pill', expectedBox: { fill: '#EDF3F7', paddingMm: 1.5, fitText: true },
      box: { fill: '#8A642B', paddingMm: 1.5, fitText: true } });
    expect(result.ok).toBe(true);
    const group = result.ok ? result.document.pages[0].objects[0] : undefined;
    expect(group?.type === 'group' && group.objects[0].type === 'text' && group.objects[0].box?.fill).toBe('#8A642B');
  });

  it('inserts a polygon, a selo and a callout through object.insert', () => {
    const document = documentWith([]);
    const pageId = document.pages[0].id;
    const result = run(document, { type: 'object.insert', pageId, object: {
      type: 'polygon', frameU: { xU: 0, yU: 0, widthU: 2_100_000, heightU: 1_200_000 }, zIndex: -1,
      points: [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], style: { fill: { kind: 'solid', color: '#092D4D' } } } });
    expect(result.ok).toBe(true);
    expect(ApplicationActionSchema.safeParse({ type: 'object.insert', pageId, object: {
      type: 'text', frameU: { xU: 0, yU: 0, widthU: 10, heightU: 10 }, zIndex: 0, text: plainRichText('a', 'Selo'), style: {},
      box: { fill: '#092D4D', paddingMm: 2, fitText: true } } }).success).toBe(true);
  });
});

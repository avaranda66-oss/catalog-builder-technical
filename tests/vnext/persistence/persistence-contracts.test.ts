import { describe, expect, it } from 'vitest';
import {
  mmToU,
  type AssetRef,
  type CatalogDocument,
  type EditorialObject,
  type GroupObject,
  type RichText,
  type TableModel,
} from '@/vnext/domain';
import {
  PERSISTENCE_ERROR_CODES,
  PersistenceContractError,
  checkCatalogRootPersistenceCompatibility,
  parseCanonicalSnapshot,
  parsePersistenceEnvelope,
  persistenceHandleFromEnvelope,
  serializeCanonicalSnapshot,
  type CatalogPersistenceEnvelope,
} from '@/vnext/persistence';

function richText(prefix: string): RichText {
  return {
    paragraphs: [
      {
        id: `${prefix}-p1`,
        inlines: [
          { kind: 'text', id: `${prefix}-t1`, text: 'Calibração ±0.01 °C', marks: ['bold'] },
          { kind: 'lineBreak', id: `${prefix}-br` },
          { kind: 'text', id: `${prefix}-t2`, text: 'Ω µ ≤ ≥ ≈', marks: ['italic'] },
        ],
      },
      {
        id: `${prefix}-p2`,
        inlines: [{ kind: 'text', id: `${prefix}-t3`, text: 'x₂', marks: ['subscript'] }],
        list: { kind: 'unordered', level: 2 },
      },
    ],
  };
}

function asset(id: string, sha: string, mime: AssetRef['mime']): AssetRef {
  return {
    id,
    version: 'asset-v7',
    sha256: sha.repeat(64),
    mime,
    widthPx: 2048,
    heightPx: 1536,
    name: `${id}.png`,
    alt: `Alt ${id} – PRESYS`,
  };
}

function tableFixture(): TableModel {
  return {
    id: 'table-main',
    columns: [
      {
        id: 'column-fixed',
        width: { mode: 'fixed', mm: 30.125 },
        minMm: 20,
        maxMm: 40,
        style: { textAlign: 'right' },
      },
      {
        id: 'column-flex',
        width: { mode: 'flex', weight: 3 },
        minMm: 20.25,
        maxMm: 90.5,
      },
    ],
    rows: [
      {
        id: 'row-header',
        role: 'header',
        heightPolicy: { mode: 'FIXED_MM', heightMm: 8.125 },
        style: { fontWeight: 700, background: '#003366' },
      },
      {
        id: 'row-body',
        role: 'body',
        heightPolicy: { mode: 'MIN_MM', minMm: 7.25 },
      },
    ],
    cells: [
      {
        id: 'cell-header-a',
        rowId: 'row-header',
        columnId: 'column-fixed',
        content: { type: 'richText', value: richText('cell-rich') },
        contentPresentation: { wrapPolicy: 'nowrap' },
        annotationIds: ['annotation-note'],
        style: { color: '#FFFFFF', paddingMm: { left: 1.25, right: 1.5 } },
      },
      {
        id: 'cell-header-b',
        rowId: 'row-header',
        columnId: 'column-flex',
        content: { type: 'marker', legendEntryId: 'legend-main' },
      },
      {
        id: 'cell-body-a',
        rowId: 'row-body',
        columnId: 'column-fixed',
        content: { type: 'empty' },
        span: { rows: 1, columns: 2 },
      },
      {
        id: 'cell-body-b',
        rowId: 'row-body',
        columnId: 'column-flex',
        content: { type: 'empty' },
        coveredBy: 'cell-body-a',
      },
    ],
    style: {
      base: {
        fontFamily: 'Noto Sans',
        fontSizePt: 9,
        lineHeight: 1.2,
        borders: { bottom: { pattern: 'solid', thicknessPt: 0.5, color: '#172033' } },
      },
      rowRoles: {
        header: { fontWeight: 700, background: '#003366' },
        body: { color: '#172033' },
      },
      annotation: { fontSizePt: 7, color: '#172033' },
      annotationGapMm: 1.375,
    },
    annotationIds: ['annotation-caption'],
    annotations: [
      { id: 'annotation-caption', kind: 'caption', text: richText('caption-rich') },
      { id: 'annotation-note', kind: 'note', text: richText('note-rich') },
    ],
    legend: [
      { id: 'legend-main', markerCode: 'M1', text: richText('legend-rich') },
    ],
  };
}

function groupFixture(): GroupObject {
  return {
    id: 'group-main',
    type: 'group',
    frame: { xMm: 120.125, yMm: 150.25, widthMm: 30, heightMm: 20 },
    zIndex: 6,
    locked: true,
    objects: [
      {
        id: 'group-text',
        type: 'text',
        frame: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 },
        zIndex: 0,
        text: richText('group-text-rich'),
        style: { fontSizePt: 8 },
      },
      {
        id: 'group-shape',
        type: 'shape',
        frame: { xMm: 10, yMm: 10, widthMm: 20, heightMm: 10 },
        zIndex: 1,
        shape: 'rectangle',
        style: { fill: '#0072CE' },
      },
    ],
  };
}

function canonicalFixture(rootId = '11111111-1111-4111-8111-111111111111'): CatalogDocument {
  const objects: EditorialObject[] = [
    {
      id: 'text-main',
      type: 'text',
      frame: { xMm: 12.3456, yMm: 14.0001, widthMm: 80.4321, heightMm: 20.125 },
      zIndex: 4,
      locked: true,
      text: richText('text-main-rich'),
      style: { fontFamily: 'Noto Sans', fontSizePt: 10.5, lineHeight: 1.3, fontWeight: 700, color: '#172033', textAlign: 'left' },
    },
    {
      id: 'image-main',
      type: 'image',
      frame: { xMm: 100.25, yMm: 14.125, widthMm: 45.5, heightMm: 30.25 },
      zIndex: 1,
      assetId: 'asset-photo',
      fit: 'cover',
      focalPoint: { x: 0.3125, y: 0.6875 },
    },
    {
      id: 'table-object',
      type: 'table',
      frame: { xMm: 12.125, yMm: 50.25, widthMm: 120.375, heightMm: 60.5 },
      zIndex: 5,
      table: tableFixture(),
    },
    {
      id: 'shape-main',
      type: 'shape',
      frame: { xMm: 145.125, yMm: 52.25, widthMm: 30.5, heightMm: 20.75 },
      zIndex: 0,
      shape: 'ellipse',
      style: { fill: '#003366', stroke: { pattern: 'solid', thicknessPt: 1.25, color: '#FFFFFF' } },
    },
    {
      id: 'line-main',
      type: 'line',
      frame: { xMm: 12.5, yMm: 120.125, widthMm: 100.25, heightMm: 0.5 },
      zIndex: 3,
      axis: 'horizontal',
      color: '#172033',
    },
    {
      id: 'icon-main',
      type: 'icon',
      frame: { xMm: 150.25, yMm: 90.5, widthMm: 12.25, heightMm: 12.25 },
      zIndex: 2,
      assetId: 'asset-icon',
    },
    groupFixture(),
  ];

  return {
    schemaVersion: 1,
    id: rootId,
    title: 'Catálogo PSV — W3.A',
    locale: 'pt-BR',
    style: {
      fonts: [
        { family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' },
        { family: 'Noto Sans', revision: '5.3.0', weight: 700, style: 'italic' },
      ],
      defaultText: {
        fontFamily: 'Noto Sans',
        fontSizePt: 10,
        lineHeight: 1.25,
        fontWeight: 400,
        color: '#172033',
        paddingMm: { top: 0.5, right: 0.75, bottom: 0.5, left: 0.75 },
      },
      palette: ['#003366', '#0072CE', '#172033', '#FFFFFF'],
    },
    assets: [
      asset('asset-photo', 'a', 'image/png'),
      asset('asset-icon', 'b', 'image/webp'),
    ],
    pages: [
      {
        id: 'page-a',
        widthMm: 210,
        heightMm: 297,
        safeArea: { topMm: 12.125, rightMm: 11.875, bottomMm: 13.25, leftMm: 12.5 },
        objects,
      },
      {
        id: 'page-b',
        widthMm: 210,
        heightMm: 297,
        objects: [
          {
            id: 'page-b-text',
            type: 'text',
            frame: { xMm: 20.25, yMm: 25.5, widthMm: 60.75, heightMm: 15.125 },
            zIndex: -1,
            text: richText('page-b-rich'),
            style: { fontSizePt: 9 },
          },
        ],
      },
    ],
    source: { documentId: 'source-document-legacy', serverVersion: 42 },
  };
}

function envelopeFor(document: CatalogDocument): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id,
    remoteRevision: 17,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-11T20:00:00.000Z',
    updatedAt: '2026-09-11T22:00:00.000Z',
    createdBy: 'user-create',
    updatedBy: 'user-update',
    archivedAt: null,
    origin: { originKind: 'starter', originId: 'starter-psv', originRevision: 3 },
    documentSchemaVersion: 1,
    documentSnapshot: document,
  };
}

function expectContractError(action: () => unknown, code: PersistenceContractError['code']): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PersistenceContractError);
    expect((error as PersistenceContractError).code).toBe(code);
    return;
  }
  throw new Error(`Expected PersistenceContractError ${code}`);
}

function allFrames(document: CatalogDocument): Array<readonly [string, number, number, number, number]> {
  const frames: Array<readonly [string, number, number, number, number]> = [];
  for (const page of document.pages) {
    for (const object of page.objects) {
      frames.push([object.id, mmToU(object.frame.xMm), mmToU(object.frame.yMm), mmToU(object.frame.widthMm), mmToU(object.frame.heightMm)]);
      if (object.type === 'group') {
        for (const child of object.objects) {
          frames.push([child.id, mmToU(child.frame.xMm), mmToU(child.frame.yMm), mmToU(child.frame.widthMm), mmToU(child.frame.heightMm)]);
        }
      }
    }
  }
  return frames;
}

describe('W3.A canonical persistence round-trip', () => {
  it('preserves the complete authored CatalogDocument with deep structural equality and object/page ordering', () => {
    const source = canonicalFixture();
    const serialized = serializeCanonicalSnapshot(source);
    const loaded = parseCanonicalSnapshot(serialized);

    expect(loaded).toEqual(source);
    expect(loaded.pages.map((page) => page.id)).toEqual(['page-a', 'page-b']);
    expect(loaded.pages[0].objects.map((object) => object.id)).toEqual(source.pages[0].objects.map((object) => object.id));
    expect(loaded.style).toEqual(source.style);
    expect(loaded.source).toEqual({ documentId: 'source-document-legacy', serverVersion: 42 });
  });

  it('preserves authored integer-U geometry, Group-local frames, zIndex and lock state exactly', () => {
    const source = canonicalFixture();
    const loaded = parseCanonicalSnapshot(serializeCanonicalSnapshot(source));

    expect(allFrames(loaded)).toEqual(allFrames(source));
    const sourceGroup = source.pages[0].objects.find((object): object is GroupObject => object.type === 'group');
    const loadedGroup = loaded.pages[0].objects.find((object): object is GroupObject => object.type === 'group');
    expect(loadedGroup?.objects.map((child) => child.frame)).toEqual(sourceGroup?.objects.map((child) => child.frame));
    expect(loaded.pages[0].objects.map(({ id, zIndex, locked }) => ({ id, zIndex, locked })))
      .toEqual(source.pages[0].objects.map(({ id, zIndex, locked }) => ({ id, zIndex, locked })));
  });

  it('preserves Text/RichText identities, Table structure/presentation, all primitives, and AssetRef integrity metadata', () => {
    const source = canonicalFixture();
    const loaded = parseCanonicalSnapshot(serializeCanonicalSnapshot(source));
    const sourceTable = source.pages[0].objects.find((object) => object.type === 'table');
    const loadedTable = loaded.pages[0].objects.find((object) => object.type === 'table');
    const sourceText = source.pages[0].objects.find((object) => object.type === 'text');
    const loadedText = loaded.pages[0].objects.find((object) => object.type === 'text');

    expect(loadedText?.type === 'text' ? loadedText.text : undefined)
      .toEqual(sourceText?.type === 'text' ? sourceText.text : undefined);
    expect(loadedTable?.type === 'table' ? loadedTable.table : undefined)
      .toEqual(sourceTable?.type === 'table' ? sourceTable.table : undefined);
    expect(loaded.assets).toEqual(source.assets);
    expect(loaded.pages[0].objects.map((object) => object.type))
      .toEqual(['text', 'image', 'table', 'shape', 'line', 'icon', 'group']);
  });

  it('keeps remoteRevision outside authored content and leaves source.serverVersion as provenance', () => {
    const source = canonicalFixture();
    const authoredBefore = structuredClone(source);
    const envelope = parsePersistenceEnvelope(envelopeFor(source));
    const firstHandle = persistenceHandleFromEnvelope(envelope);
    const acknowledgedHandle = { ...firstHandle, remoteRevision: 18 };

    expect(firstHandle).toEqual({ catalogId: source.id, remoteRevision: 17 });
    expect(acknowledgedHandle).toEqual({ catalogId: source.id, remoteRevision: 18 });
    expect(envelope.documentSnapshot).toEqual(authoredBefore);
    expect(envelope.documentSnapshot.source?.serverVersion).toBe(42);
  });

  it('rejects envelope id/title/locale/schema projection mismatches without rewriting the document', () => {
    const source = canonicalFixture();
    const base = envelopeFor(source);
    const authoredBefore = structuredClone(source);

    expectContractError(() => parsePersistenceEnvelope({ ...base, catalogId: '22222222-2222-4222-8222-222222222222' }), 'ENVELOPE_MISMATCH');
    expectContractError(() => parsePersistenceEnvelope({ ...base, title: 'Metadata wins' }), 'ENVELOPE_MISMATCH');
    expectContractError(() => parsePersistenceEnvelope({ ...base, locale: 'en-US' }), 'ENVELOPE_MISMATCH');
    expectContractError(() => parsePersistenceEnvelope({ ...base, documentSchemaVersion: 2 }), 'ENVELOPE_MISMATCH');
    expect(source).toEqual(authoredBefore);
  });

  it('rejects invalid canonical documents, unsupported schemas, malformed JSON, and unknown authored fields explicitly', () => {
    const source = canonicalFixture();
    const duplicateId = structuredClone(source);
    duplicateId.pages[0].objects[1].id = duplicateId.pages[0].objects[0].id;
    const signedAssetUrl = structuredClone(source) as unknown as {
      assets: Array<Record<string, unknown>>;
    };
    signedAssetUrl.assets[0].signedUrl = 'https://example.invalid/signed';
    signedAssetUrl.assets[0].bytes = [137, 80, 78, 71];

    expectContractError(() => parseCanonicalSnapshot(duplicateId), 'INVALID_DOCUMENT');
    expectContractError(() => parseCanonicalSnapshot({ ...source, schemaVersion: 2 }), 'UNSUPPORTED_VERSION');
    expectContractError(() => parseCanonicalSnapshot('{bad json'), 'INVALID_DOCUMENT');
    expectContractError(() => parseCanonicalSnapshot(signedAssetUrl), 'INVALID_DOCUMENT');
    expectContractError(
      () => parseCanonicalSnapshot({ ...source, pages: [{ ...source.pages[0], unexpectedAuthoredField: 'must-not-drop' }, source.pages[1]] }),
      'INVALID_DOCUMENT'
    );
  });

  it('accepts valid canonical non-UUID roots while reporting persistence incompatibility without rewriting them', () => {
    const source = canonicalFixture('legacy-proof-root');
    const parsed = parseCanonicalSnapshot(serializeCanonicalSnapshot(source));
    const compatibility = checkCatalogRootPersistenceCompatibility(parsed);

    expect(parsed.id).toBe('legacy-proof-root');
    expect(compatibility).toEqual({
      compatible: false,
      catalogId: 'legacy-proof-root',
      reason: 'ROOT_ID_NOT_UUID_COMPATIBLE',
    });
    expect(parsed.id).toBe(source.id);
  });

  it('recognizes UUID-compatible durable roots without changing the identity', () => {
    const source = canonicalFixture();
    expect(checkCatalogRootPersistenceCompatibility(source)).toEqual({ compatible: true, catalogId: source.id });
  });

  it('keeps archive lifecycle metadata outside and independent from the authored snapshot', () => {
    const source = canonicalFixture();
    const envelope = parsePersistenceEnvelope(envelopeFor(source));
    const authoredBefore = structuredClone(envelope.documentSnapshot);
    const archived = { ...envelope, archivedAt: '2026-09-11T23:00:00.000Z' };

    expect(archived.archivedAt).not.toBe(envelope.archivedAt);
    expect(archived.documentSnapshot).toBe(envelope.documentSnapshot);
    expect(archived.documentSnapshot).toEqual(authoredBefore);
  });

  it('keeps semantic persistence failure classes distinct', () => {
    expect(PERSISTENCE_ERROR_CODES).toEqual([
      'NOT_FOUND',
      'UNAUTHORIZED',
      'ARCHIVED',
      'CONFLICT',
      'INVALID_DOCUMENT',
      'UNSUPPORTED_VERSION',
      'OFFLINE',
      'REMOTE_FAILURE',
      'AMBIGUOUS_COMMIT_OUTCOME',
      'ENVELOPE_MISMATCH',
    ]);
  });
});

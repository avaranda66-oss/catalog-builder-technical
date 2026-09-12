import {
  CatalogDocumentSchema,
  findObjectInTree,
  walkPageObjects,
  type CatalogDocument,
  type EditorialObject,
  type GroupObject,
  type LeafEditorialObject,
  type Page,
  type RichText,
  type TableModel,
} from '../domain';
import { validateDocument } from '../table';
import type { ApplicationErrorCode, IdGenerator } from './contracts';

export class ApplicationDocumentError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    details: string = code
  ) {
    super(details);
    this.name = 'ApplicationDocumentError';
  }
}

function richTextIdentityIds(richText: RichText): string[] {
  return richText.paragraphs.flatMap((paragraph) => [
    paragraph.id,
    ...paragraph.inlines.map((inline) => inline.id),
  ]);
}

/** Canonical structural IDs owned by one object. RichText-local IDs are intentionally excluded. */
export function canonicalObjectIdentityIds(object: EditorialObject): string[] {
  if (object.type === 'group') {
    return [object.id, ...object.objects.flatMap((child) => canonicalObjectIdentityIds(child))];
  }
  if (object.type !== 'table') return [object.id];
  return [
    object.id,
    object.table.id,
    ...object.table.columns.map((column) => column.id),
    ...object.table.rows.map((row) => row.id),
    ...object.table.cells.map((cell) => cell.id),
    ...object.table.annotations.map((annotation) => annotation.id),
    ...object.table.legend.map((entry) => entry.id),
  ];
}

/** IDs whose uniqueness is canonical at CatalogDocument scope. */
export function canonicalIdentityIds(document: CatalogDocument): string[] {
  const ids = [document.id, ...document.assets.map((asset) => asset.id)];
  for (const page of document.pages) {
    ids.push(page.id);
    for (const object of page.objects) ids.push(...canonicalObjectIdentityIds(object));
  }
  return ids;
}

/**
 * Generation reserves every currently used identity string, including RichText-local
 * IDs. This avoids new collisions without changing the Foundation's identity scopes.
 */
function reservationIdentityIds(document: CatalogDocument): string[] {
  const ids = canonicalIdentityIds(document);
  for (const page of document.pages) {
    for (const { object } of walkPageObjects(page)) {
      if (object.type === 'text') {
        ids.push(...richTextIdentityIds(object.text));
        continue;
      }
      if (object.type !== 'table') continue;
      for (const cell of object.table.cells) {
        if (cell.content.type === 'richText') ids.push(...richTextIdentityIds(cell.content.value));
      }
      for (const annotation of object.table.annotations) ids.push(...richTextIdentityIds(annotation.text));
      for (const entry of object.table.legend) ids.push(...richTextIdentityIds(entry.text));
    }
  }
  return ids;
}

export function parseCanonicalDocument(input: unknown): CatalogDocument {
  const parsed = CatalogDocumentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationDocumentError('DOCUMENT_INVALID', parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  const diagnostics = validateDocument(parsed.data).filter((diagnostic) => diagnostic.severity === 'ERROR');
  if (diagnostics.length > 0) {
    throw new ApplicationDocumentError('DOCUMENT_INVALID', diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.details}`).join('; '));
  }
  return parsed.data;
}

class IdAllocator {
  private readonly used: Set<string>;

  constructor(
    existingIds: readonly string[],
    private readonly createId: IdGenerator
  ) {
    this.used = new Set(existingIds);
  }

  next(): string {
    let id: string;
    try {
      id = this.createId();
    } catch (error) {
      throw new ApplicationDocumentError('ID_GENERATION_FAILED', error instanceof Error ? error.message : String(error));
    }
    if (typeof id !== 'string' || id.length === 0) throw new ApplicationDocumentError('ID_GENERATION_FAILED', 'ID generator returned an empty ID');
    if (this.used.has(id)) throw new ApplicationDocumentError('DUPLICATE_ID', id);
    this.used.add(id);
    return id;
  }
}

export interface CanonicalIdAllocator {
  next(): string;
}

export function createCanonicalIdAllocator(
  document: CatalogDocument,
  createId: IdGenerator
): CanonicalIdAllocator {
  return new IdAllocator(reservationIdentityIds(document), createId);
}

function defaultPage(id: string): Page {
  return {
    id,
    widthMm: 210,
    heightMm: 297,
    safeArea: { topMm: 12, rightMm: 12, bottomMm: 12, leftMm: 12 },
    objects: [],
  };
}

export function createCatalogDocument(createId: IdGenerator, title = 'Novo catálogo'): CatalogDocument {
  const allocator = new IdAllocator([], createId);
  const document: CatalogDocument = {
    schemaVersion: 1,
    id: allocator.next(),
    title,
    locale: 'pt-BR',
    style: {
      fonts: [
        { family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' },
        { family: 'Noto Sans', revision: '5.3.0', weight: 700, style: 'normal' },
      ],
      defaultText: {
        fontFamily: 'Noto Sans',
        fontSizePt: 10,
        lineHeight: 1.25,
        fontWeight: 400,
        color: '#172033',
      },
      palette: ['#003366', '#0072CE', '#172033', '#FFFFFF'],
    },
    pages: [defaultPage(allocator.next())],
    assets: [],
  };
  return parseCanonicalDocument(document);
}

export function createBlankPage(document: CatalogDocument, createId: IdGenerator): Page {
  const allocator = new IdAllocator(reservationIdentityIds(document), createId);
  return defaultPage(allocator.next());
}

function instantiateRichTextWithFreshIds(richText: RichText, allocator: IdAllocator): RichText {
  return {
    paragraphs: richText.paragraphs.map((paragraph) => ({
      ...paragraph,
      id: allocator.next(),
      inlines: paragraph.inlines.map((inline) => ({ ...inline, id: allocator.next() })),
    })),
  };
}

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
export type LeafObjectInstantiationSeed = WithoutId<LeafEditorialObject>;
export type GroupObjectInstantiationSeed = Omit<GroupObject, 'id' | 'objects'> & {
  readonly objects: readonly LeafObjectInstantiationSeed[];
};
export type ObjectInstantiationSeed = LeafObjectInstantiationSeed | GroupObjectInstantiationSeed;

function instantiationSeedIdentityIds(seed: ObjectInstantiationSeed): string[] {
  if (seed.type === 'group') return seed.objects.flatMap((child) => instantiationSeedIdentityIds(child));
  if (seed.type === 'text') return richTextIdentityIds(seed.text);
  if (seed.type !== 'table') return [];

  const ids = [
    seed.table.id,
    ...seed.table.columns.map((column) => column.id),
    ...seed.table.rows.map((row) => row.id),
    ...seed.table.cells.map((cell) => cell.id),
    ...seed.table.annotations.map((annotation) => annotation.id),
    ...seed.table.legend.map((entry) => entry.id),
  ];
  for (const cell of seed.table.cells) {
    if (cell.content.type === 'richText') ids.push(...richTextIdentityIds(cell.content.value));
  }
  for (const annotation of seed.table.annotations) ids.push(...richTextIdentityIds(annotation.text));
  for (const entry of seed.table.legend) ids.push(...richTextIdentityIds(entry.text));
  return ids;
}

export interface ObjectLocation {
  page: Page;
  object: EditorialObject;
  pageIndex: number;
  objectIndex: number;
  parentGroup?: GroupObject;
  childIndex?: number;
}

/** Pure application-layer lookup of canonical object ownership and array position. */
export function findObjectLocation(document: CatalogDocument, objectId: string): ObjectLocation | undefined {
  const entry=findObjectInTree(document,objectId);
  if(!entry)return undefined;
  return {
    page:entry.page,
    object:entry.object,
    pageIndex:document.pages.indexOf(entry.page),
    objectIndex:entry.topLevelIndex,
    ...(entry.parentGroup?{parentGroup:entry.parentGroup,childIndex:entry.childIndex}:{}),
  };
}

export function objectInstantiationSeedFromObject(object: EditorialObject): ObjectInstantiationSeed {
  if(object.type==='group') {
    const { id:_id,objects,...rest }=object;
    return { ...rest, objects: objects.map((child)=>objectInstantiationSeedFromObject(child) as LeafObjectInstantiationSeed) };
  }
  const { id: _id, ...seed } = object;
  return seed as LeafObjectInstantiationSeed;
}

function instantiateTableWithFreshIds(table: TableModel, allocator: IdAllocator): TableModel {
  const mapping = new Map<string, string>();
  mapping.set(table.id, allocator.next());
  for (const column of table.columns) mapping.set(column.id, allocator.next());
  for (const row of table.rows) mapping.set(row.id, allocator.next());
  for (const cell of table.cells) mapping.set(cell.id, allocator.next());
  for (const annotation of table.annotations) mapping.set(annotation.id, allocator.next());
  for (const entry of table.legend) mapping.set(entry.id, allocator.next());

  const mapped = (id: string): string => {
    const value = mapping.get(id);
    if (!value) throw new ApplicationDocumentError('DOCUMENT_INVALID', `Unmapped table identity: ${id}`);
    return value;
  };

  return {
    ...table,
    id: mapped(table.id),
    columns: table.columns.map((column) => ({ ...column, id: mapped(column.id) })),
    rows: table.rows.map((row) => ({ ...row, id: mapped(row.id) })),
    cells: table.cells.map((cell) => ({
      ...cell,
      id: mapped(cell.id),
      rowId: mapped(cell.rowId),
      columnId: mapped(cell.columnId),
      ...(cell.coveredBy === undefined ? {} : { coveredBy: mapped(cell.coveredBy) }),
      ...(cell.annotationIds === undefined ? {} : { annotationIds: cell.annotationIds.map(mapped) }),
      content: cell.content.type === 'richText'
        ? { ...cell.content, value: instantiateRichTextWithFreshIds(cell.content.value, allocator) }
        : cell.content.type === 'marker'
          ? { ...cell.content, legendEntryId: mapped(cell.content.legendEntryId) }
          : { ...cell.content },
    })),
    ...(table.annotationIds === undefined ? {} : { annotationIds: table.annotationIds.map(mapped) }),
    annotations: table.annotations.map((annotation) => ({
      ...annotation,
      id: mapped(annotation.id),
      text: instantiateRichTextWithFreshIds(annotation.text, allocator),
    })),
    legend: table.legend.map((entry) => ({
      ...entry,
      id: mapped(entry.id),
      text: instantiateRichTextWithFreshIds(entry.text, allocator),
    })),
  };
}

function instantiateObjectWithAllocator(seed: ObjectInstantiationSeed, allocator: IdAllocator): EditorialObject {
  const id = allocator.next();
  switch (seed.type) {
    case 'text':
      return {
        ...seed,
        id,
        frame: { ...seed.frame },
        style: { ...seed.style },
        text: instantiateRichTextWithFreshIds(seed.text, allocator),
      };
    case 'table':
      return {
        ...seed,
        id,
        frame: { ...seed.frame },
        table: instantiateTableWithFreshIds(seed.table, allocator),
      };
    case 'image':
      return {
        ...seed,
        id,
        frame: { ...seed.frame },
        ...(seed.focalPoint ? { focalPoint: { ...seed.focalPoint } } : {}),
      };
    case 'shape':
      return {
        ...seed,
        id,
        frame: { ...seed.frame },
        style: {
          ...seed.style,
          ...(seed.style.stroke ? { stroke: { ...seed.style.stroke } } : {}),
        },
      };
    case 'line':
    case 'icon':
      return { ...seed, id, frame: { ...seed.frame } };
    case 'group':
      return {
        ...seed,
        id,
        frame: { ...seed.frame },
        objects: seed.objects.map((child) => instantiateObjectWithAllocator(child, allocator) as LeafEditorialObject),
      };
  }
}

/** Allocates one fresh canonical root identity using the same reservation machinery as all W2.B/W2.E instantiation. */
export function allocateFreshCanonicalId(document:CatalogDocument,createId:IdGenerator):string {
  return new IdAllocator(reservationIdentityIds(document),createId).next();
}

/** Freshly instantiates one object against all identities already reserved by the document. */
export function instantiateObjectWithFreshIds(
  document: CatalogDocument,
  seed: ObjectInstantiationSeed,
  createId: IdGenerator
): EditorialObject {
  const allocator = new IdAllocator(
    [...reservationIdentityIds(document), ...instantiationSeedIdentityIds(seed)],
    createId
  );
  return instantiateObjectWithAllocator(seed, allocator);
}

export interface PageInstantiationSeed {
  readonly safeArea?: Page['safeArea'];
  readonly objects: readonly ObjectInstantiationSeed[];
}

/**
 * Materializes a page in one allocator scope. Template seed identities are reserved
 * before the first generated ID so table/RichText remapping cannot collide with the
 * source graph or any identity already present in the document.
 */
export function instantiatePageWithFreshIds(
  document: CatalogDocument,
  seed: PageInstantiationSeed,
  createId: IdGenerator
): Page {
  const allocator = new IdAllocator(
    [
      ...reservationIdentityIds(document),
      ...seed.objects.flatMap((object) => instantiationSeedIdentityIds(object)),
    ],
    createId
  );
  return {
    id: allocator.next(),
    widthMm: 210,
    heightMm: 297,
    ...(seed.safeArea === undefined ? {} : { safeArea: { ...seed.safeArea } }),
    objects: seed.objects.map((object) => instantiateObjectWithAllocator(object, allocator)),
  };
}

export function duplicatePageWithFreshIds(
  document: CatalogDocument,
  page: Page,
  createId: IdGenerator
): Page {
  const allocator = new IdAllocator(reservationIdentityIds(document), createId);
  return {
    ...page,
    id: allocator.next(),
    ...(page.safeArea === undefined ? {} : { safeArea: { ...page.safeArea } }),
    objects: page.objects.map((object) => instantiateObjectWithAllocator(objectInstantiationSeedFromObject(object), allocator)),
  };
}

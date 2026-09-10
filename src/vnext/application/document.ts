import { CatalogDocumentSchema, type CatalogDocument, type Page, type RichText } from '../domain';
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

/** IDs whose uniqueness is canonical at CatalogDocument scope. */
export function canonicalIdentityIds(document: CatalogDocument): string[] {
  const ids = [document.id, ...document.assets.map((asset) => asset.id)];
  for (const page of document.pages) {
    ids.push(page.id);
    for (const object of page.objects) {
      ids.push(object.id);
      if (object.type !== 'table') continue;

      const table = object.table;
      ids.push(
        table.id,
        ...table.columns.map((column) => column.id),
        ...table.rows.map((row) => row.id),
        ...table.cells.map((cell) => cell.id),
        ...table.annotations.map((annotation) => annotation.id),
        ...table.legend.map((entry) => entry.id),
      );
    }
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
    for (const object of page.objects) {
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

function duplicateRichTextWithFreshIds(richText: RichText, allocator: IdAllocator): RichText {
  return {
    paragraphs: richText.paragraphs.map((paragraph) => ({
      ...paragraph,
      id: allocator.next(),
      inlines: paragraph.inlines.map((inline) => ({ ...inline, id: allocator.next() })),
    })),
  };
}

export function duplicatePageWithFreshIds(
  document: CatalogDocument,
  page: Page,
  createId: IdGenerator
): Page {
  const allocator = new IdAllocator(reservationIdentityIds(document), createId);
  const mapping = new Map<string, string>();
  mapping.set(page.id, allocator.next());

  for (const object of page.objects) {
    mapping.set(object.id, allocator.next());
    if (object.type !== 'table') continue;
    const table = object.table;
    mapping.set(table.id, allocator.next());
    for (const column of table.columns) mapping.set(column.id, allocator.next());
    for (const row of table.rows) mapping.set(row.id, allocator.next());
    for (const cell of table.cells) mapping.set(cell.id, allocator.next());
    for (const annotation of table.annotations) mapping.set(annotation.id, allocator.next());
    for (const entry of table.legend) mapping.set(entry.id, allocator.next());
  }

  const duplicate: Page = {
    ...page,
    id: mapping.get(page.id)!,
    safeArea: page.safeArea ? { ...page.safeArea } : undefined,
    objects: page.objects.map((object) => {
      if (object.type === 'text') {
        return {
          ...object,
          id: mapping.get(object.id)!,
          frame: { ...object.frame },
          style: { ...object.style },
          text: duplicateRichTextWithFreshIds(object.text, allocator),
        };
      }

      if (object.type !== 'table') {
        return {
          ...object,
          id: mapping.get(object.id)!,
          frame: { ...object.frame },
          ...(object.type === 'image' && object.focalPoint ? { focalPoint: { ...object.focalPoint } } : {}),
          ...(object.type === 'shape' ? {
            style: {
              ...object.style,
              ...(object.style.stroke ? { stroke: { ...object.style.stroke } } : {}),
            },
          } : {}),
        };
      }

      const table = object.table;
      return {
        ...object,
        id: mapping.get(object.id)!,
        frame: { ...object.frame },
        table: {
          ...table,
          id: mapping.get(table.id)!,
          columns: table.columns.map((column) => ({ ...column, id: mapping.get(column.id)! })),
          rows: table.rows.map((row) => ({ ...row, id: mapping.get(row.id)! })),
          cells: table.cells.map((cell) => ({
            ...cell,
            id: mapping.get(cell.id)!,
            rowId: mapping.get(cell.rowId)!,
            columnId: mapping.get(cell.columnId)!,
            coveredBy: cell.coveredBy ? mapping.get(cell.coveredBy) : undefined,
            annotationIds: cell.annotationIds?.map((id) => mapping.get(id)!),
            content: cell.content.type === 'richText'
              ? { ...cell.content, value: duplicateRichTextWithFreshIds(cell.content.value, allocator) }
              : cell.content.type === 'marker'
                ? { ...cell.content, legendEntryId: mapping.get(cell.content.legendEntryId)! }
                : { ...cell.content },
          })),
          annotationIds: table.annotationIds?.map((id) => mapping.get(id)!),
          annotations: table.annotations.map((annotation) => ({
            ...annotation,
            id: mapping.get(annotation.id)!,
            text: duplicateRichTextWithFreshIds(annotation.text, allocator),
          })),
          legend: table.legend.map((entry) => ({
            ...entry,
            id: mapping.get(entry.id)!,
            text: duplicateRichTextWithFreshIds(entry.text, allocator),
          })),
        },
      };
    }),
  };
  return duplicate;
}

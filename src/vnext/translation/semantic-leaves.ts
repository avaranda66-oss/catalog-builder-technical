import {
  walkPageObjects,
  type CatalogDocument,
  type RichText,
  type TableModel,
} from '../domain';
import {
  TranslationFoundationError,
  type ExcludedTranslationSurface,
  type TranslationCoverage,
  type TranslationLeafKind,
  type TranslationLocator,
  type TranslationSemanticLeaf,
} from './contracts';

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)])
  );
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new TranslationFoundationError('INVALID_REQUEST', 'SHA-256 is unavailable in this runtime');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function locatorKey(locator: TranslationLocator): string {
  switch (locator.kind) {
    case 'catalogTitle':
      return `catalog:${locator.catalogId}`;
    case 'textObject':
      return `page:${locator.pageId}/object:${locator.objectId}`;
    case 'tableCell':
      return `page:${locator.pageId}/object:${locator.objectId}/table:${locator.tableId}/cell:${locator.cellId}`;
    case 'tableTitle':
      return `page:${locator.pageId}/object:${locator.objectId}/table:${locator.tableId}/title`;
    case 'tableAnnotation':
      return `page:${locator.pageId}/object:${locator.objectId}/table:${locator.tableId}/annotation:${locator.annotationId}`;
    case 'tableLegend':
      return `page:${locator.pageId}/object:${locator.objectId}/table:${locator.tableId}/legend:${locator.legendEntryId}`;
  }
}

function richStructure(richText: RichText): unknown {
  return richText.paragraphs.map((paragraph) => ({
    id: paragraph.id,
    ...(paragraph.list ? { list: paragraph.list } : {}),
    inlines: paragraph.inlines.map((inline) => inline.kind === 'text'
      ? { kind: inline.kind, id: inline.id, text: inline.text, marks: inline.marks }
      : { kind: inline.kind, id: inline.id }),
  }));
}

async function richTextLeaf(
  kind: TranslationLeafKind,
  locator: TranslationLocator,
  sourceLocale: string,
  context: string,
  richText: RichText
): Promise<TranslationSemanticLeaf | undefined> {
  assertRichTextShape(richText, `rich-text:${locatorKey(locator)}`);
  const runs = richText.paragraphs.flatMap((paragraph) =>
    paragraph.inlines.flatMap((inline) => inline.kind === 'text'
      ? [{
          paragraphId: paragraph.id,
          runId: inline.id,
          text: inline.text,
          marks: [...inline.marks],
        }]
      : [])
  );
  if (runs.length === 0) return undefined;
  const leafId = `${kind}:${locatorKey(locator)}`;
  const sourceHash = await sha256Hex(stableSerialize({
    kind,
    locator,
    sourceLocale,
    structure: richStructure(richText),
  }));
  return { leafId, kind, locator, sourceLocale, sourceHash, context, runs };
}

async function catalogTitleLeaf(document: CatalogDocument): Promise<TranslationSemanticLeaf> {
  const locator: TranslationLocator = { kind: 'catalogTitle', catalogId: document.id };
  const runId = `catalog-title:${document.id}`;
  const sourceHash = await sha256Hex(stableSerialize({
    kind: 'catalogTitle',
    locator,
    sourceLocale: document.locale,
    runs: [{ runId, text: document.title }],
  }));
  return {
    leafId: `catalogTitle:${locatorKey(locator)}`,
    kind: 'catalogTitle',
    locator,
    sourceLocale: document.locale,
    sourceHash,
    context: 'Catalog title',
    runs: [{ runId, text: document.title, marks: [] }],
  };
}

function excluded(
  reason: ExcludedTranslationSurface['reason'],
  surfaceId: string,
  locator: Record<string, string>
): ExcludedTranslationSurface {
  return { reason, surfaceId, locator };
}

function unknownSurface(label: string, value: unknown): never {
  throw new TranslationFoundationError(
    'UNCLASSIFIED_TEXT_SURFACE',
    `Unknown canonical translation surface ${label}: ${String(value)}`
  );
}

function assertKnownKeys(
  label: string,
  value: Record<string, unknown>,
  allowed: readonly string[]
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) unknownSurface(`${label}-field`, unknown.sort().join(','));
}

function assertRichTextShape(richText: RichText, label: string): void {
  assertKnownKeys(label, richText as unknown as Record<string, unknown>, ['paragraphs']);
  richText.paragraphs.forEach((paragraph, paragraphIndex) => {
    assertKnownKeys(
      `${label}.paragraph[${paragraphIndex}]`,
      paragraph as unknown as Record<string, unknown>,
      ['id', 'inlines', 'list']
    );
    paragraph.inlines.forEach((inline, inlineIndex) => {
      assertKnownKeys(
        `${label}.paragraph[${paragraphIndex}].inline[${inlineIndex}]`,
        inline as unknown as Record<string, unknown>,
        inline.kind === 'text' ? ['kind', 'id', 'text', 'marks'] : ['kind', 'id']
      );
    });
  });
}

function assertObjectShape(object: Record<string, unknown>): void {
  const common = ['id', 'type', 'frame', 'zIndex', 'locked'];
  switch (object.type) {
    case 'table': assertKnownKeys('table-object', object, [...common, 'table']); break;
    case 'text': assertKnownKeys('text-object', object, [...common, 'text', 'style']); break;
    case 'image': assertKnownKeys('image-object', object, [...common, 'assetId', 'fit', 'focalPoint']); break;
    case 'shape': assertKnownKeys('shape-object', object, [...common, 'shape', 'style']); break;
    case 'line': assertKnownKeys('line-object', object, [...common, 'axis', 'color']); break;
    case 'icon': assertKnownKeys('icon-object', object, [...common, 'assetId']); break;
    case 'group': assertKnownKeys('group-object', object, [...common, 'objects']); break;
    default: unknownSurface('editorial-object', object.type);
  }
}

async function tableLeaves(
  pageId: string,
  objectId: string,
  table: TableModel,
  sourceLocale: string,
  eligible: TranslationSemanticLeaf[],
  exclusions: ExcludedTranslationSurface[]
): Promise<void> {
  assertKnownKeys('table-model', table as unknown as Record<string, unknown>, [
    'id', 'title', 'columns', 'rows', 'cells', 'style', 'annotationIds', 'annotations', 'legend',
  ]);
  table.columns.forEach((column, index) => {
    assertKnownKeys(`table-column[${index}]`, column as unknown as Record<string, unknown>, [
      'id', 'width', 'minMm', 'maxMm', 'style',
    ]);
  });
  table.rows.forEach((row, index) => {
    assertKnownKeys(`table-row[${index}]`, row as unknown as Record<string, unknown>, [
      'id', 'role', 'heightPolicy', 'style',
    ]);
  });

  if (table.title) {
    const locator: TranslationLocator = { kind: 'tableTitle', pageId, objectId, tableId: table.id };
    const leaf = await richTextLeaf('tableTitle', locator, sourceLocale, 'Table title', table.title);
    if (leaf) eligible.push(leaf);
    else exclusions.push(excluded('empty-rich-text', `table-title:${table.id}`, { pageId, objectId, tableId: table.id }));
  }

  const rows = new Map(table.rows.map((row) => [row.id, row] as const));
  for (const [cellIndex, cell] of table.cells.entries()) {
    const base = { pageId, objectId, tableId: table.id, cellId: cell.id };
    assertKnownKeys(`table-cell[${cellIndex}]`, cell as unknown as Record<string, unknown>, [
      'id', 'rowId', 'columnId', 'content', 'contentPresentation', 'span', 'coveredBy', 'annotationIds', 'style',
    ]);
    const contentRecord = cell.content as unknown as Record<string, unknown>;
    switch (cell.content.type) {
      case 'richText':
        assertKnownKeys(`table-cell-content[${cellIndex}]`, contentRecord, ['type', 'value']);
        break;
      case 'technicalCode':
        assertKnownKeys(`table-cell-content[${cellIndex}]`, contentRecord, ['type', 'value']);
        break;
      case 'measurement':
        assertKnownKeys(`table-cell-content[${cellIndex}]`, contentRecord, ['type', 'valueText', 'unit', 'qualifier']);
        break;
      case 'marker':
        assertKnownKeys(`table-cell-content[${cellIndex}]`, contentRecord, ['type', 'legendEntryId']);
        break;
      case 'image':
        assertKnownKeys(`table-cell-content[${cellIndex}]`, contentRecord, ['type', 'assetId']);
        break;
      case 'empty':
        assertKnownKeys(`table-cell-content[${cellIndex}]`, contentRecord, ['type']);
        break;
      default:
        unknownSurface('table-cell-content', contentRecord.type);
    }
    switch (cell.content.type) {
      case 'richText': {
        const locator: TranslationLocator = { kind: 'tableCell', ...base };
        const rowRole = rows.get(cell.rowId)?.role ?? 'unknown';
        const leaf = await richTextLeaf(
          'tableCell',
          locator,
          sourceLocale,
          `Table cell ${cellIndex + 1} (${rowRole})`,
          cell.content.value
        );
        if (leaf) eligible.push(leaf);
        else exclusions.push(excluded('empty-rich-text', `cell:${cell.id}`, base));
        break;
      }
      case 'technicalCode':
        exclusions.push(excluded('technical-code', `cell:${cell.id}`, base));
        break;
      case 'measurement':
        exclusions.push(excluded('measurement', `cell:${cell.id}`, base));
        break;
      case 'marker':
        exclusions.push(excluded('marker', `cell:${cell.id}`, base));
        break;
      case 'image':
        exclusions.push(excluded('image-cell', `cell:${cell.id}`, base));
        break;
      case 'empty':
        exclusions.push(excluded('empty-cell', `cell:${cell.id}`, base));
        break;
      default:
        unknownSurface('table-cell-content', (cell.content as { type?: unknown }).type);
    }
  }

  for (const annotation of table.annotations) {
    assertKnownKeys('table-annotation', annotation as unknown as Record<string, unknown>, ['id', 'kind', 'text']);
    if (!['caption', 'note', 'footnote'].includes(annotation.kind)) {
      unknownSurface('table-annotation-kind', annotation.kind);
    }
    const locator: TranslationLocator = {
      kind: 'tableAnnotation',
      pageId,
      objectId,
      tableId: table.id,
      annotationId: annotation.id,
    };
    const leaf = await richTextLeaf(
      'tableAnnotation',
      locator,
      sourceLocale,
      `Table ${annotation.kind}`,
      annotation.text
    );
    if (leaf) eligible.push(leaf);
    else exclusions.push(excluded('empty-rich-text', `annotation:${annotation.id}`, { pageId, objectId, tableId: table.id, annotationId: annotation.id }));
  }

  for (const legend of table.legend) {
    assertKnownKeys('table-legend-entry', legend as unknown as Record<string, unknown>, ['id', 'markerCode', 'text']);
    const locator: TranslationLocator = {
      kind: 'tableLegend',
      pageId,
      objectId,
      tableId: table.id,
      legendEntryId: legend.id,
    };
    const leaf = await richTextLeaf('tableLegend', locator, sourceLocale, 'Table legend explanatory text', legend.text);
    if (leaf) eligible.push(leaf);
    else exclusions.push(excluded('empty-rich-text', `legend:${legend.id}`, { pageId, objectId, tableId: table.id, legendEntryId: legend.id }));
  }
}

function assertUniqueLeafIds(leaves: readonly TranslationSemanticLeaf[]): void {
  const ids = new Set<string>();
  for (const leaf of leaves) {
    if (ids.has(leaf.leafId)) {
      throw new TranslationFoundationError('INVALID_REQUEST', `Duplicate semantic leaf ID: ${leaf.leafId}`);
    }
    ids.add(leaf.leafId);
  }
}

export async function extractSemanticTranslationCoverage(document: CatalogDocument): Promise<TranslationCoverage> {
  assertKnownKeys('catalog-document', document as unknown as Record<string, unknown>, [
    'schemaVersion', 'id', 'title', 'locale', 'style', 'pages', 'assets', 'source',
  ]);
  const eligible: TranslationSemanticLeaf[] = [await catalogTitleLeaf(document)];
  const exclusions: ExcludedTranslationSurface[] = document.assets.map((asset) => {
    assertKnownKeys('asset-ref', asset as unknown as Record<string, unknown>, [
      'id', 'version', 'sha256', 'mime', 'widthPx', 'heightPx', 'name', 'alt',
    ]);
    return excluded('asset-alt', `asset-alt:${asset.id}`, { assetId: asset.id });
  });

  for (const page of document.pages) {
    assertKnownKeys('page', page as unknown as Record<string, unknown>, [
      'id', 'widthMm', 'heightMm', 'safeArea', 'objects',
    ]);
    for (const { object } of walkPageObjects(page)) {
      assertObjectShape(object as unknown as Record<string, unknown>);
      switch (object.type) {
        case 'text': {
          const locator: TranslationLocator = { kind: 'textObject', pageId: page.id, objectId: object.id };
          const leaf = await richTextLeaf('textObject', locator, document.locale, 'Text object', object.text);
          if (leaf) eligible.push(leaf);
          else exclusions.push(excluded('empty-rich-text', `text:${object.id}`, { pageId: page.id, objectId: object.id }));
          break;
        }
        case 'table':
          await tableLeaves(page.id, object.id, object.table, document.locale, eligible, exclusions);
          break;
        case 'group':
          exclusions.push(excluded('group-container', `group:${object.id}`, { pageId: page.id, objectId: object.id }));
          break;
        case 'image':
          exclusions.push(excluded('image-object', `image:${object.id}`, { pageId: page.id, objectId: object.id, assetId: object.assetId }));
          break;
        case 'icon':
          exclusions.push(excluded('icon-object', `icon:${object.id}`, { pageId: page.id, objectId: object.id, assetId: object.assetId }));
          break;
        case 'shape':
          exclusions.push(excluded('shape', `shape:${object.id}`, { pageId: page.id, objectId: object.id }));
          break;
        case 'line':
          exclusions.push(excluded('line', `line:${object.id}`, { pageId: page.id, objectId: object.id }));
          break;
        default:
          unknownSurface('editorial-object', (object as { type?: unknown }).type);
      }
    }
  }

  assertUniqueLeafIds(eligible);
  return {
    sourceCatalogId: document.id,
    sourceLocale: document.locale,
    eligible,
    excluded: exclusions,
    complete: true,
  };
}

import { getDocument, OPS, version } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { MAX_PAGE_TEXT, MAX_PDF_BYTES, MAX_PDF_PAGES } from './pdf-intake';

/** Read-only diagnostics. These types cannot approve or populate a catalog. */
export interface NativePdfBox {
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
  readonly top: number;
}
export interface NativePdfRun {
  readonly id: string;
  readonly itemIndex: number;
  readonly str: string;
  readonly transform: readonly number[];
  readonly width: number;
  readonly height: number;
  readonly direction: string;
  readonly hasEOL: boolean;
  readonly markedTags: readonly string[];
  readonly evidenceRole: 'content' | 'artifact' | 'ambiguous';
  readonly font: Readonly<{
    name: string; family: string; ascent: number; descent: number; vertical: boolean;
  }> | null;
  /** Font-metric placement envelope, not an attested glyph or table-cell box. */
  readonly metricBox: NativePdfBox | null;
  readonly parserWhitespace: boolean;
  readonly geometrySupported: boolean;
}
export interface NativePdfPage {
  readonly number: number;
  /** PDF.js visible page view (CropBox intersected with MediaBox). */
  readonly view: readonly number[];
  readonly rotation: number;
  readonly userUnit: number;
  readonly coordinateSystem: 'pdf-user-space-bottom-left';
  readonly runs: readonly NativePdfRun[];
  readonly nativeRunCount: number;
  readonly nativeTextLength: number;
  readonly runStringsSha256: string;
  readonly truncated: boolean;
  readonly markedContent: Readonly<{
    itemCount: number; textMappingExact: boolean; operatorsBalanced: boolean; textMaxDepth: number;
  }>;
  readonly blockedReasons: readonly string[];
}
export interface NativePdfSnapshot {
  readonly purpose: 'native-pdf-diagnostic-only';
  readonly fileName: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly pageCount: number;
  readonly selectedPages: readonly number[];
  readonly parser: Readonly<{ name: 'PDF.js'; version: string; unicodeNormalization: false }>;
  readonly pages: readonly NativePdfPage[];
  readonly blockedReasons: readonly string[];
}
export interface NativeCellRegion {
  readonly page: number;
  readonly box: NativePdfBox;
  /** Optional assertion of the complete run selection; never a text override. */
  readonly expectedRunIds?: readonly string[];
}
export interface NativeRunJoin {
  readonly leftRunId: string;
  readonly rightRunId: string;
  readonly gap: number;
  readonly kind: 'touching' | 'overlap' | 'gap';
}
export interface NativeCellDiagnostic {
  readonly purpose: 'native-pdf-diagnostic-only';
  readonly status: 'LITERAL' | 'UNCERTAIN' | 'BLOCKED';
  readonly sha256: string;
  readonly page: number;
  readonly box: NativePdfBox;
  readonly runs: readonly NativePdfRun[];
  /** Concatenation of intact parser strings, with no inserted separators. */
  readonly rawLiteral: string;
  readonly joins: readonly NativeRunJoin[];
  readonly reasons: readonly string[];
  readonly excludedArtifactRunIds: readonly string[];
}

export const MAX_NATIVE_SELECTED_PAGES = 30;
export const MAX_NATIVE_PAGE_RUNS = 10_000;
const issuedSnapshots = new WeakSet<object>();
const pua = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u;

async function sha256(bytes: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
}
function boxValid(box: NativePdfBox): boolean {
  return [box.left, box.bottom, box.right, box.top].every(Number.isFinite) &&
    box.left < box.right && box.bottom < box.top;
}
function contains(outer: NativePdfBox, inner: NativePdfBox): boolean {
  return inner.left >= outer.left && inner.right <= outer.right &&
    inner.bottom >= outer.bottom && inner.top <= outer.top;
}
function intersects(a: NativePdfBox, b: NativePdfBox): boolean {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
}

/** Copies caller bytes synchronously, before hashing/parsing can yield. */
export async function readNativePdfSnapshot(
  fileName: string,
  input: ArrayBuffer,
  options: { readonly pages: readonly number[]; readonly expectedSha256?: string },
): Promise<NativePdfSnapshot> {
  if (!fileName.toLowerCase().endsWith('.pdf') || input.byteLength < 8 || input.byteLength > MAX_PDF_BYTES) {
    throw new Error('PDF_INPUT_INVALID');
  }
  const owned = input.slice(0);
  const selectedPages = [...options.pages];
  if (!selectedPages.length || selectedPages.length > MAX_NATIVE_SELECTED_PAGES ||
      new Set(selectedPages).size !== selectedPages.length ||
      selectedPages.some(page => !Number.isInteger(page) || page < 1 || page > MAX_PDF_PAGES)) {
    throw new Error('PDF_NATIVE_PAGE_SELECTION_INVALID');
  }
  if (new TextDecoder('ascii').decode(new Uint8Array(owned, 0, 5)) !== '%PDF-') {
    throw new Error('PDF_SIGNATURE_INVALID');
  }
  if (options.expectedSha256 !== undefined && !/^[0-9a-f]{64}$/.test(options.expectedSha256)) {
    throw new Error('PDF_NATIVE_HASH_INVALID');
  }
  const expectedSha256 = options.expectedSha256;
  const digest = await sha256(owned);
  if (expectedSha256 !== undefined && expectedSha256 !== digest) throw new Error('PDF_NATIVE_HASH_MISMATCH');
  // PDF.js may transfer its buffer. The hashed copy and parser copy are separate.
  const pdf = await getDocument({
    data: new Uint8Array(owned.slice(0)), useSystemFonts: true, disableFontFace: true,
    isEvalSupported: false, stopAtErrors: true,
  }).promise;
  const pages: NativePdfPage[] = [];
  const blockedReasons: string[] = [];
  try {
    if (selectedPages.some(page => page > pdf.numPages)) throw new Error('PDF_NATIVE_PAGE_OUT_OF_RANGE');
    if (pdf.numPages > MAX_PDF_PAGES) blockedReasons.push('DOCUMENT_PAGE_LIMIT');
    if (!blockedReasons.length) {
      for (const pageNumber of selectedPages) {
        const page = await pdf.getPage(pageNumber);
        try {
          const content = await page.getTextContent({ disableNormalization: true });
          const nativeItems = content.items.flatMap((item, itemIndex) => 'str' in item ? [{ item, itemIndex }] : []);
          const marked = await page.getTextContent({ disableNormalization: true, includeMarkedContent: true });
          const operators = await page.getOperatorList();
          const markerReasons: string[] = [];
          const tagsByItem = new Map<number, readonly string[]>();
          const markerStack: string[] = [];
          let textIndex = 0;
          let textMappingExact = true;
          let textMaxDepth = 0;
          for (const item of marked.items) {
            if ('str' in item) {
              const original = nativeItems[textIndex];
              const base = original?.item;
              if (!base || item.str !== base.str || item.dir !== base.dir || item.width !== base.width ||
                  item.height !== base.height || item.fontName !== base.fontName || item.hasEOL !== base.hasEOL ||
                  item.transform.length !== base.transform.length || item.transform.some((value, axis) => value !== base.transform[axis])) {
                textMappingExact = false;
              }
              if (original) tagsByItem.set(original.itemIndex, Object.freeze([...markerStack]));
              textIndex++;
            } else if (item.type === 'beginMarkedContent' || item.type === 'beginMarkedContentProps') {
              // PDF.js emits tag at runtime; its 4.10 declarations omit this property.
              const tag = 'tag' in item ? item.tag : null;
              if (typeof tag !== 'string' || !tag.length) markerReasons.push('MARKED_CONTENT_TAG_INVALID');
              markerStack.push(typeof tag === 'string' ? tag : '');
              textMaxDepth = Math.max(textMaxDepth, markerStack.length);
            } else if (item.type === 'endMarkedContent') {
              if (!markerStack.length) markerReasons.push('MARKED_CONTENT_UNBALANCED');
              else markerStack.pop();
            } else markerReasons.push('MARKED_CONTENT_EVENT_UNSUPPORTED');
          }
          if (markerStack.length) markerReasons.push('MARKED_CONTENT_UNBALANCED');
          if (textIndex !== nativeItems.length) textMappingExact = false;
          if (!textMappingExact) markerReasons.push('MARKED_CONTENT_MAPPING_MISMATCH');
          if (textMaxDepth > 1) markerReasons.push('MARKED_CONTENT_NESTING_UNSUPPORTED');
          // getTextContent silently omits an unmatched EMC. Validate the raw
          // operator stack as well, without using paint replay to assign roles.
          let operatorDepth = 0;
          let operatorsBalanced = true;
          for (const operator of operators.fnArray) {
            if (operator === OPS.beginMarkedContent || operator === OPS.beginMarkedContentProps) operatorDepth++;
            if (operator === OPS.endMarkedContent) {
              if (!operatorDepth) operatorsBalanced = false;
              else operatorDepth--;
            }
          }
          if (operatorDepth) operatorsBalanced = false;
          if (!operatorsBalanced) markerReasons.push('MARKED_CONTENT_OPERATORS_UNBALANCED');
          const nativeTextLength = nativeItems.reduce((sum, { item }) => sum + item.str.length, 0);
          const truncated = nativeItems.length > MAX_NATIVE_PAGE_RUNS || nativeTextLength > MAX_PAGE_TEXT;
          const pageReasons: string[] = [...new Set(markerReasons)];
          if (page.rotate !== 0) pageReasons.push('PAGE_ROTATION_UNSUPPORTED');
          if (truncated) pageReasons.push('PAGE_TRUNCATED');
          if (!nativeItems.some(({ item }) => /\S/u.test(item.str))) pageReasons.push('NO_NATIVE_TEXT');
          const view = [...page.view];
          if (view.length !== 4 || !boxValid({ left: view[0], bottom: view[1], right: view[2], top: view[3] }) ||
              !Number.isFinite(page.userUnit) || page.userUnit <= 0) pageReasons.push('PAGE_GEOMETRY_INVALID');
          const runs: NativePdfRun[] = [];
          let includedText = 0;
          for (const { item, itemIndex } of nativeItems) {
            if (runs.length === MAX_NATIVE_PAGE_RUNS || includedText + item.str.length > MAX_PAGE_TEXT) break;
            includedText += item.str.length;
            const transform = item.transform.map(value => typeof value === 'number' ? value : NaN);
            const style = content.styles[item.fontName];
            const font = style ? Object.freeze({ name: item.fontName, family: style.fontFamily, ascent: style.ascent, descent: style.descent, vertical: style.vertical }) : null;
            const geometrySupported = transform.length === 6 && transform.every(Number.isFinite) &&
              transform[0] > 0 && transform[3] > 0 && transform[1] === 0 && transform[2] === 0 &&
              item.dir === 'ltr' && Number.isFinite(item.width) && item.width >= 0 &&
              Number.isFinite(item.height) && item.height >= 0 && font !== null && !font.vertical &&
              Number.isFinite(font.ascent) && Number.isFinite(font.descent) && font.ascent > font.descent;
            const metricBox = geometrySupported ? Object.freeze({
              left: transform[4], right: transform[4] + item.width,
              bottom: transform[5] + transform[3] * font!.descent,
              top: transform[5] + transform[3] * font!.ascent,
            }) : null;
            runs.push(Object.freeze({
              id: `p${pageNumber}:i${itemIndex}`, itemIndex, str: item.str,
              transform: Object.freeze(transform), width: item.width, height: item.height,
              direction: item.dir, hasEOL: item.hasEOL, font, metricBox,
              markedTags: tagsByItem.get(itemIndex) ?? Object.freeze([]),
              evidenceRole: markerReasons.length ? 'ambiguous' : tagsByItem.get(itemIndex)?.includes('Artifact') ? 'artifact' : 'content',
              // PDF.js pushWhitespace creates these by geometric heuristics.
              // They are preserved but do not attest encoded source separators.
              parserWhitespace: /^\s+$/u.test(item.str) && item.height === 0,
              geometrySupported,
            }));
          }
          pages.push(Object.freeze({
            number: pageNumber, view: Object.freeze(view), rotation: page.rotate, userUnit: page.userUnit,
            coordinateSystem: 'pdf-user-space-bottom-left', runs: Object.freeze(runs),
            nativeRunCount: nativeItems.length, nativeTextLength,
            runStringsSha256: await sha256(new TextEncoder().encode(JSON.stringify(nativeItems.map(({ item, itemIndex }) => [itemIndex, item.str]))).buffer),
            truncated, blockedReasons: Object.freeze(pageReasons),
            markedContent: Object.freeze({ itemCount: marked.items.length, textMappingExact, operatorsBalanced, textMaxDepth }),
          }));
        } finally { page.cleanup(); }
      }
    }
    const snapshot: NativePdfSnapshot = Object.freeze({
      purpose: 'native-pdf-diagnostic-only', fileName, sha256: digest, byteLength: owned.byteLength,
      pageCount: pdf.numPages, selectedPages: Object.freeze(selectedPages),
      parser: Object.freeze({ name: 'PDF.js', version, unicodeNormalization: false }),
      pages: Object.freeze(pages), blockedReasons: Object.freeze(blockedReasons),
    });
    issuedSnapshots.add(snapshot);
    return snapshot;
  } finally { await pdf.destroy(); }
}

/** Single-baseline region diagnostics only; never proves model/field ownership. */
export function reconstructNativeCellRegion(snapshot: NativePdfSnapshot, region: NativeCellRegion): NativeCellDiagnostic {
  const box = Object.freeze({ ...region.box });
  let excludedArtifactRunIds: readonly string[] = [];
  const finish = (status: NativeCellDiagnostic['status'], reasons: readonly string[], runs: readonly NativePdfRun[] = [], joins: readonly NativeRunJoin[] = []): NativeCellDiagnostic => Object.freeze({
    purpose: 'native-pdf-diagnostic-only', status, sha256: snapshot.sha256, page: region.page, box,
    runs: Object.freeze([...runs]), rawLiteral: runs.map(run => run.str).join(''),
    joins: Object.freeze([...joins]), reasons: Object.freeze([...new Set(reasons)]),
    excludedArtifactRunIds: Object.freeze([...excludedArtifactRunIds]),
  });
  if (!issuedSnapshots.has(snapshot)) return finish('BLOCKED', ['UNTRUSTED_SNAPSHOT']);
  if (!boxValid(box)) return finish('BLOCKED', ['REGION_INVALID']);
  if (snapshot.blockedReasons.length) return finish('BLOCKED', snapshot.blockedReasons);
  const page = snapshot.pages.find(candidate => candidate.number === region.page);
  if (!page) return finish('BLOCKED', ['PAGE_NOT_SELECTED']);
  if (page.blockedReasons.length) return finish('BLOCKED', page.blockedReasons);
  excludedArtifactRunIds = page.runs.filter(run => run.evidenceRole === 'artifact').map(run => run.id);
  const contentRuns = page.runs.filter(run => run.evidenceRole === 'content');
  const pageBox = { left: page.view[0], bottom: page.view[1], right: page.view[2], top: page.view[3] };
  if (!contains(pageBox, box)) return finish('BLOCKED', ['REGION_OUTSIDE_VISIBLE_PAGE']);
  // Unknown geometry cannot be safely declared outside a selection.
  if (contentRuns.some(run => run.str.length && !run.geometrySupported)) return finish('BLOCKED', ['RUN_GEOMETRY_UNSUPPORTED']);
  const touched = contentRuns.filter(run => run.str.length && run.metricBox && intersects(box, run.metricBox));
  if (touched.some(run => !contains(box, run.metricBox!))) return finish('BLOCKED', ['REGION_CUTS_RUN'], touched);
  if (!touched.some(run => /\S/u.test(run.str))) return finish('BLOCKED', ['REGION_HAS_NO_TEXT'], touched);
  const ordered = [...touched].sort((a, b) => a.transform[4] - b.transform[4] || a.itemIndex - b.itemIndex);
  if (region.expectedRunIds && (new Set(region.expectedRunIds).size !== region.expectedRunIds.length ||
      region.expectedRunIds.length !== ordered.length || region.expectedRunIds.some(id => !ordered.some(run => run.id === id)))) {
    return finish('BLOCKED', ['RUN_SELECTION_MISMATCH'], ordered);
  }
  if (ordered.some(run => pua.test(run.str))) return finish('BLOCKED', ['PRIVATE_USE_GLYPH'], ordered);
  const baseline = ordered[0].transform[5];
  if (ordered.some(run => run.transform[5] !== baseline)) return finish('BLOCKED', ['MULTIPLE_BASELINES_UNSUPPORTED'], ordered);
  const joins: NativeRunJoin[] = [];
  const uncertain: string[] = [];
  if (ordered.some(run => run.parserWhitespace)) uncertain.push('PARSER_WHITESPACE_UNATTESTED');
  for (let index = 1; index < ordered.length; index++) {
    const left = ordered[index - 1];
    const right = ordered[index];
    if (left.transform[4] === right.transform[4] && /\S/u.test(left.str) && /\S/u.test(right.str)) {
      return finish('BLOCKED', ['OVERLAPPING_ORDER_AMBIGUOUS'], ordered, joins);
    }
    const gap = right.transform[4] - (left.transform[4] + left.width);
    const kind = gap > 0 ? 'gap' : gap === 0 ? 'touching' : 'overlap';
    joins.push(Object.freeze({ leftRunId: left.id, rightRunId: right.id, gap, kind }));
    if (kind === 'gap' && !/\s$/u.test(left.str) && !/^\s/u.test(right.str)) uncertain.push('GAP_WITHOUT_LITERAL_SEPARATOR');
    if (left.hasEOL) uncertain.push('NATIVE_LINE_END_WITHIN_REGION');
  }
  return finish(uncertain.length ? 'UNCERTAIN' : 'LITERAL', uncertain, ordered, joins);
}

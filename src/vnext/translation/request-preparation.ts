import {
  TranslationFoundationError,
  W5_TRANSLATION_LIMITS,
  type TranslationProviderUnit,
  type TranslationSemanticLeaf,
} from './contracts';
import { sha256Hex } from './semantic-leaves';
import { protectTechnicalTokens, technicalProtectionNamespace, type ProtectedText } from './technical-token-protector';
import { translationRunKey } from './response-validation';

export interface PreparedTranslationRun {
  readonly runId: string;
  readonly sourceRunId: string;
  readonly partIndex: number;
  readonly prefixBefore: string;
  readonly separatorAfter: string;
  readonly fragmented: boolean;
}

export interface PreparedTranslationUnit {
  readonly unit: TranslationProviderUnit;
  readonly sourceLeafId: string;
  readonly parts: readonly PreparedTranslationRun[];
  readonly protections: ReadonlyMap<string, ProtectedText>;
}

// Leave room for translated prose to expand within the unchanged 4,000-character response limit.
const LONG_RUN_CHUNK_CHARS = 2_800;

function splitProtectedText(value: ProtectedText): { value: ProtectedText; separatorAfter: string }[] {
  if (value.protectedText.length <= LONG_RUN_CHUNK_CHARS) {
    return [{ value, separatorAfter: '' }];
  }
  const text = value.protectedText;
  const chunks: { value: ProtectedText; separatorAfter: string }[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + LONG_RUN_CHUNK_CHARS, text.length);
    let separatorAfter = '';
    if (end < text.length) {
      // A placeholder is one indivisible technical value, even at a chunk boundary.
      for (const token of value.tokens) {
        const tokenStart = text.indexOf(token.placeholder, start);
        if (tokenStart >= start && tokenStart < end && tokenStart + token.placeholder.length > end) {
          end = tokenStart;
          break;
        }
      }
      // Never divide a UTF-16 surrogate pair.
      if (end > start && /[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
      const minimum = start + Math.floor(LONG_RUN_CHUNK_CHARS / 2);
      let wordBoundary = -1;
      let sentenceBoundary = -1;
      for (const match of text.slice(start, end).matchAll(/\s+/g)) {
        const position = start + match.index;
        if (position < minimum) continue;
        wordBoundary = position;
        if (/[.!?;]/.test(text[position - 1])) sentenceBoundary = position;
      }
      const boundary = sentenceBoundary >= minimum ? sentenceBoundary : wordBoundary;
      if (boundary >= minimum) end = boundary;
      const separator = text.slice(end).match(/^\s+/)?.[0] ?? '';
      separatorAfter = separator;
    }
    if (end <= start) throw new TranslationFoundationError('PAYLOAD_TOO_LARGE', 'Cannot safely divide a translation run');
    const protectedText = text.slice(start, end);
    chunks.push({ value: { ...value, protectedText, tokens: value.tokens.filter(token => protectedText.includes(token.placeholder)) }, separatorAfter });
    start = end + separatorAfter.length;
  }
  return chunks;
}

/** Fragment transport only. Canonical leaf/run identities, rich-text marks and source hashes stay unchanged. */
export async function prepareTranslationLeaf(leaf: TranslationSemanticLeaf): Promise<PreparedTranslationUnit[]> {
  const reservedRunIds = new Set(leaf.runs.map(run => run.runId));
  const preparedRuns = (await Promise.all(leaf.runs.map(async run => {
    const namespace = await technicalProtectionNamespace(leaf.leafId, run.runId);
    const protectedValue = protectTechnicalTokens(run.text, namespace);
    const chunks = splitProtectedText(protectedValue);
    const fragmented = chunks.length > 1;
    // Boundary whitespace belongs to the canonical run, not to provider prose. Fold
    // whitespace-only chunks into their neighbour so no empty request is dispatched.
    const proseChunks: typeof chunks = [];
    let leadingWhitespace = '';
    for (const chunk of chunks) {
      if (!chunk.value.protectedText.trim()) {
        const whitespace = chunk.value.protectedText + chunk.separatorAfter;
        if (proseChunks.length) proseChunks[proseChunks.length - 1].separatorAfter += whitespace;
        else leadingWhitespace += whitespace;
      } else {
        proseChunks.push({ ...chunk, value: { ...chunk.value, protectedText: leadingWhitespace + chunk.value.protectedText } });
        leadingWhitespace = '';
      }
    }
    return proseChunks.map((chunk, partIndex) => {
      let runId = run.runId;
      if (fragmented) {
        runId = `translation-part:${namespace}:${partIndex}`;
        while (reservedRunIds.has(runId)) runId += ':';
        reservedRunIds.add(runId);
      }
      const prefixBefore = fragmented ? chunk.value.protectedText.match(/^\s+/)?.[0] ?? '' : '';
      const suffix = fragmented ? chunk.value.protectedText.match(/\s+$/)?.[0] ?? '' : '';
      return { runId, sourceRunId: run.runId, partIndex, prefixBefore, separatorAfter: suffix + chunk.separatorAfter,
        fragmented, value: fragmented ? { ...chunk.value, protectedText: chunk.value.protectedText.trim() } : chunk.value };
    });
  }))).flat();

  const groups: typeof preparedRuns[] = [];
  let group: typeof preparedRuns = [];
  let chars = 0;
  for (const run of preparedRuns) {
    if (group.length && chars + run.value.protectedText.length > W5_TRANSLATION_LIMITS.maxTotalChars) {
      groups.push(group); group = []; chars = 0;
    }
    group.push(run); chars += run.value.protectedText.length;
  }
  if (group.length) groups.push(group);
  const fragmentIdentity = groups.length > 1 ? await sha256Hex(leaf.leafId) : undefined;
  return groups.map((runs, index) => {
    const unitId = fragmentIdentity ? `translation-fragment:${fragmentIdentity}:${index}` : leaf.leafId;
    return {
      sourceLeafId: leaf.leafId,
      unit: { unitId, sourceHash: leaf.sourceHash, kind: leaf.kind, context: leaf.context,
        runs: runs.map(run => ({ runId: run.runId, protectedText: run.value.protectedText })) },
      parts: runs.map(({ runId, sourceRunId, partIndex, prefixBefore, separatorAfter, fragmented }) => ({ runId, sourceRunId, partIndex, prefixBefore, separatorAfter, fragmented })),
      protections: new Map(runs.map(run => [translationRunKey(unitId, run.runId), run.value])),
    };
  });
}

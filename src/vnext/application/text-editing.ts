import type { RichText } from '../domain/editorial-model';
import type { CanonicalIdAllocator } from './document';

export interface ReconciledRichText {
  richText: RichText;
  createdIds: readonly string[];
}

function editableParagraphText(paragraph: RichText['paragraphs'][number]): string | null {
  if (paragraph.list) return null;
  if (paragraph.inlines.length === 0) return '';
  if (paragraph.inlines.length !== 1) return null;
  const inline = paragraph.inlines[0];
  return inline.kind === 'text' ? inline.text : null;
}

/**
 * Projects only the deliberately lossless W2.G textarea subset.
 * Null means the RichText must remain on the richer canonical path.
 */
export function projectEditableRichText(richText: RichText): string | null {
  const lines: string[] = [];
  for (const paragraph of richText.paragraphs) {
    const text = editableParagraphText(paragraph);
    if (text === null) return null;
    lines.push(text);
  }
  return lines.join('\n');
}

export function richTextEquals(left: RichText, right: RichText): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function lcsMatches(before: readonly string[], after: readonly string[]): Array<readonly [number, number]> {
  const lengths = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
  for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
      lengths[beforeIndex][afterIndex] = before[beforeIndex] === after[afterIndex]
        ? 1 + lengths[beforeIndex + 1][afterIndex + 1]
        : Math.max(lengths[beforeIndex + 1][afterIndex], lengths[beforeIndex][afterIndex + 1]);
    }
  }

  const matches: Array<readonly [number, number]> = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < before.length && afterIndex < after.length) {
    if (
      before[beforeIndex] === after[afterIndex]
      && lengths[beforeIndex][afterIndex] === 1 + lengths[beforeIndex + 1][afterIndex + 1]
    ) {
      matches.push([beforeIndex, afterIndex]);
      beforeIndex += 1;
      afterIndex += 1;
    } else if (lengths[beforeIndex + 1][afterIndex] >= lengths[beforeIndex][afterIndex + 1]) {
      beforeIndex += 1;
    } else {
      afterIndex += 1;
    }
  }
  return matches;
}

function retainParagraph(
  paragraph: RichText['paragraphs'][number],
  text: string,
  allocate: () => string
): RichText['paragraphs'][number] {
  if (text.length === 0) return paragraph.inlines.length === 0 ? paragraph : { ...paragraph, inlines: [] };
  const inline = paragraph.inlines[0];
  if (inline?.kind === 'text') {
    if (inline.text === text) return paragraph;
    return { ...paragraph, inlines: [{ ...inline, text }] };
  }
  return {
    ...paragraph,
    inlines: [{ kind: 'text', id: allocate(), text, marks: [] }],
  };
}

function freshParagraph(text: string, allocate: () => string): RichText['paragraphs'][number] {
  const paragraphId = allocate();
  return {
    id: paragraphId,
    inlines: text.length === 0
      ? []
      : [{ kind: 'text', id: allocate(), text, marks: [] }],
  };
}

/**
 * Deterministic W2.G reconciliation:
 * 1. LCS anchors retain unchanged semantic paragraphs across insert/delete.
 * 2. Gaps use left-to-right positional substitution to preserve ordinary edited
 *    paragraph/inline identity.
 * 3. Only genuinely new paragraphs/inlines allocate through the canonical allocator.
 */
export function reconcileEditableRichText(
  current: RichText,
  plainText: string,
  allocator: CanonicalIdAllocator
): ReconciledRichText | null {
  const currentPlainText = projectEditableRichText(current);
  if (currentPlainText === null) return null;
  if (currentPlainText === plainText) return { richText: current, createdIds: [] };

  const before = current.paragraphs.map((paragraph) => editableParagraphText(paragraph)!);
  const after = plainText.split('\n');
  const anchors = lcsMatches(before, after);
  const createdIds: string[] = [];
  const allocate = (): string => {
    const id = allocator.next();
    createdIds.push(id);
    return id;
  };
  const paragraphs: RichText['paragraphs'] = [];

  let previousBefore = -1;
  let previousAfter = -1;
  const withSentinel: Array<readonly [number, number]> = [...anchors, [before.length, after.length]];
  for (const [anchorBefore, anchorAfter] of withSentinel) {
    const beforeStart = previousBefore + 1;
    const afterStart = previousAfter + 1;
    const beforeGapLength = anchorBefore - beforeStart;
    const afterGapLength = anchorAfter - afterStart;
    const substitutions = Math.min(beforeGapLength, afterGapLength);

    for (let offset = 0; offset < substitutions; offset += 1) {
      paragraphs.push(retainParagraph(current.paragraphs[beforeStart + offset], after[afterStart + offset], allocate));
    }
    for (let offset = substitutions; offset < afterGapLength; offset += 1) {
      paragraphs.push(freshParagraph(after[afterStart + offset], allocate));
    }
    if (anchorBefore < before.length) paragraphs.push(current.paragraphs[anchorBefore]);

    previousBefore = anchorBefore;
    previousAfter = anchorAfter;
  }

  return { richText: { paragraphs }, createdIds };
}

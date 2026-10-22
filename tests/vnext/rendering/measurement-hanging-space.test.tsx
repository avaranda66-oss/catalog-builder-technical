import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { plainRichText } from '@/vnext/domain';
import { pxToQ } from '@/vnext/domain/physical';
import { intrinsicMetrics, textFlowRecords } from '@/vnext/rendering/measurement';
import { RichTextRenderer } from '@/vnext/rendering/RichTextRenderer';

afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren();
});

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return { x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON: () => ({}) };
}

interface WordRange { start: number; end: number; rects: DOMRect[] }
/** Synthetic Range geometry isolates the contract; Chromium must still confirm its real pre-wrap behavior. */
function fixture({
  text = 'A B', nowrap = false,
  fullRects = [rect(0, 0, 103.4, 12), rect(0, 12, 20, 12)],
  wordRanges = [{ start: 0, end: 1, rects: [rect(0, 0, 97, 12)] }, { start: 2, end: 3, rects: [rect(0, 12, 20, 12)] }],
  image,
}: { text?: string; nowrap?: boolean; fullRects?: DOMRect[]; wordRanges?: WordRange[]; image?: DOMRect } = {}) {
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  const rich = plainRichText('space', text), flow = document.createElement('div');
  flow.dataset.flowRoot = '';
  flow.innerHTML = renderToStaticMarkup(<RichTextRenderer rich={rich} nowrap={nowrap} />);
  document.body.append(flow);
  vi.spyOn(flow, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 100, 24));
  if (image) {
    const img = document.createElement('img'); flow.append(img);
    vi.spyOn(img, 'getBoundingClientRect').mockReturnValue(image);
  }
  const wordMeasurements = vi.fn();
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    let start: number | undefined, end: number | undefined;
    return {
      selectNodeContents: () => { start = undefined; end = undefined; },
      setStart: (_node: Node, offset: number) => { start = offset; },
      setEnd: (_node: Node, offset: number) => { end = offset; },
      getClientRects: () => {
        if (start === undefined) return fullRects;
        wordMeasurements(start, end);
        const match = wordRanges.find(word => word.start === start && word.end === end);
        if (!match) throw new Error(`Unexpected measured text range ${start}:${end}`);
        return match.rects;
      },
    } as unknown as Range;
  });
  return { flow, rich, wordMeasurements };
}

describe('Intrinsic width with hanging pre-wrap spaces', () => {
  it('excludes the hanging line-end space while preserving height, text records and the source', () => {
    const { flow, rich } = fixture(), source = structuredClone(rich);
    const records = textFlowRecords(flow, rich), metrics = intrinsicMetrics(flow, rich);
    expect(metrics.widthQ).toBe(pxToQ(97));
    expect(metrics.heightQ).toBe(pxToQ(24));
    expect(metrics.records).toEqual(records);
    expect(metrics.records).toContainEqual(['T', 'space:p', 'space:t', 0, 0, 0, pxToQ(103.4), pxToQ(12)]);
    expect(rich).toEqual(source);
  });

  it('keeps a printed word that really exceeds the available width', () => {
    const { flow, rich } = fixture({ wordRanges: [
      { start: 0, end: 1, rects: [rect(0, 0, 103.4, 12)] },
      { start: 2, end: 3, rects: [rect(0, 12, 20, 12)] },
    ] });
    expect(intrinsicMetrics(flow, rich).widthQ).toBe(pxToQ(103.4));
  });

  it('does not discard a nonbreaking space even alongside an ordinary wrap space', () => {
    const { flow, rich } = fixture({ text: 'A\u00a0B C', wordRanges: [
      { start: 0, end: 3, rects: [rect(0, 0, 103.4, 12)] },
      { start: 4, end: 5, rects: [rect(0, 12, 20, 12)] },
    ] });
    expect(intrinsicMetrics(flow, rich).widthQ).toBe(pxToQ(103.4));
  });

  it('keeps the full width of pre/nowrap text, including its spaces', () => {
    const { flow, rich, wordMeasurements } = fixture({ nowrap: true, fullRects: [rect(0, 0, 103.4, 12)] });
    expect(intrinsicMetrics(flow, rich).widthQ).toBe(pxToQ(103.4));
    expect(wordMeasurements).not.toHaveBeenCalled();
  });

  it('preserves image overflow after removing a hanging text space', () => {
    const { flow, rich } = fixture({ image: rect(0, 0, 105, 29) }), metrics = intrinsicMetrics(flow, rich);
    expect(metrics.widthQ).toBe(pxToQ(105));
    expect(metrics.heightQ).toBe(pxToQ(29));
  });

  it('retains the positions of words separated by interior whitespace', () => {
    const { flow, rich } = fixture({ text: 'A B C', wordRanges: [
      { start: 0, end: 1, rects: [rect(0, 0, 30, 12)] },
      { start: 2, end: 3, rects: [rect(70, 0, 27, 12)] },
      { start: 4, end: 5, rects: [rect(0, 12, 20, 12)] },
    ] });
    expect(intrinsicMetrics(flow, rich).widthQ).toBe(pxToQ(97));
  });

  it('retains real overflow to the left of the flow box', () => {
    const { flow, rich } = fixture({
      fullRects: [rect(-3, 0, 103, 12), rect(0, 12, 20, 12)],
      wordRanges: [
        { start: 0, end: 1, rects: [rect(-3, 0, 103, 12)] },
        { start: 2, end: 3, rects: [rect(0, 12, 20, 12)] },
      ],
    });
    expect(intrinsicMetrics(flow, rich).widthQ).toBe(pxToQ(103));
  });

  it('keeps the ordinary measurement path when text already fits', () => {
    const { flow, rich, wordMeasurements } = fixture({ fullRects: [rect(0, 0, 97, 12), rect(0, 12, 20, 12)] });
    expect(intrinsicMetrics(flow, rich).widthQ).toBe(pxToQ(97));
    expect(wordMeasurements).not.toHaveBeenCalled();
  });
});

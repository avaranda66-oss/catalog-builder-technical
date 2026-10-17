import { createHash, webcrypto } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import { mmToU, uToQ } from '@/vnext/domain/physical';
import { DocumentRenderer, compilePlans } from '@/vnext/rendering';
import { captureSnapshot } from '@/vnext/rendering/measurement';
import { layoutReport } from '@/vnext/publication';
import { documentStyle } from '../proof/test-data';

afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren();
});

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return { x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON: () => ({}) };
}

/**
 * jsdom has no layout: deterministic rectangles stand in for the browser so the test checks that the text
 * fact carries the same measure that TEXT_OBJECT_OVERFLOW uses (FR-15), not real typesetting.
 */
function fixture(textHeightPx: number) {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  const object = { id: 'text-object', type: 'text' as const, zIndex: 0, text: plainRichText('rich', 'Faixa de medição'),
    style: {}, frame: { xMm: 10, yMm: 20, widthMm: 80, heightMm: 10 } };
  const doc: CatalogDocument = { id: 'text-measurement', schemaVersion: 1, title: 'Texto', locale: 'pt-BR',
    style: documentStyle, assets: [], pages: [{ id: 'page', widthMm: 210, heightMm: 297, objects: [object] }] };
  const plans = compilePlans(doc).plans;
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(<DocumentRenderer document={doc} plans={plans} assetUrls={new Map()} />);
  document.body.append(root);
  const px = (mm: number) => uToQ(mmToU(mm)) / 64;
  const objectX = px(object.frame.xMm), objectY = px(object.frame.yMm);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.pageId) return rect(0, 0, px(210), px(297));
    if (this.dataset.objectId) return rect(objectX, objectY, px(object.frame.widthMm), px(object.frame.heightMm));
    if (this.hasAttribute('data-flow-root')) return rect(objectX, objectY, px(object.frame.widthMm), textHeightPx);
    return rect(0, 0, 0, 0);
  });
  const nativeComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => new Proxy(nativeComputedStyle(element), {
    get(target, property) {
      if (['transform', 'scale', 'translate', 'rotate'].includes(String(property))) return 'none';
      if (property === 'zoom') return '1';
      const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value;
    },
  }));
  vi.spyOn(document, 'createRange').mockImplementation(() => ({
    selectNodeContents: () => undefined,
    getClientRects: () => [rect(objectX, objectY, 120, textHeightPx)],
  }) as unknown as Range);
  return { doc, root, plans, object };
}

describe('FR-15 text measurement in the layout snapshot', () => {
  it('records the measured width and height of the text next to its unchanged text signature', async () => {
    const { doc, root, plans } = fixture(60);
    const snapshot = await captureSnapshot(doc, plans, root);
    const fact = snapshot.facts.find((entry) => entry.kind === 'object' && entry.objectId === 'text-object');
    const records = [['P', 'rich:p'], ['T', 'rich:p', 'rich:t', 0, 0, 0, 120 * 64, 60 * 64]];
    expect(fact).toMatchObject({
      intrinsicContentWidthQ: 120 * 64,
      intrinsicContentHeightQ: 60 * 64,
      textFlowSignature: createHash('sha256').update(JSON.stringify(records)).digest('hex'),
    });
  });

  it('flags TEXT_OBJECT_OVERFLOW exactly when the recorded text height is taller than the box', async () => {
    const tall = fixture(60);
    const tallSnapshot = await captureSnapshot(tall.doc, tall.plans, tall.root);
    const tallFact = tallSnapshot.facts.find((entry) => entry.kind === 'object');
    expect(tallFact?.kind === 'object' && tallFact.intrinsicContentHeightQ).toBeGreaterThan(uToQ(mmToU(tall.object.frame.heightMm)));
    expect(layoutReport(tall.doc, tall.plans, tallSnapshot, tall.root).map((diagnostic) => diagnostic.code)).toContain('TEXT_OBJECT_OVERFLOW');
    vi.restoreAllMocks(); document.body.replaceChildren();

    const short = fixture(20);
    const shortSnapshot = await captureSnapshot(short.doc, short.plans, short.root);
    const shortFact = shortSnapshot.facts.find((entry) => entry.kind === 'object');
    expect(shortFact?.kind === 'object' && shortFact.intrinsicContentHeightQ).toBeLessThanOrEqual(uToQ(mmToU(short.object.frame.heightMm)));
    expect(layoutReport(short.doc, short.plans, shortSnapshot, short.root).map((diagnostic) => diagnostic.code)).not.toContain('TEXT_OBJECT_OVERFLOW');
  });
});

import { describe, expect, it } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '@/vnext/application';
import { frameToCanonicalU, minimumUForProjectedQ, mmToU, plainRichText, uToQ, type CatalogDocument, type Diagnostic, type TextObject } from '@/vnext/domain';
import type { FitHeightMeasurement } from '@/vnext/editor/table-fit-height-authoring';
import { applyTextFitHeight, prepareTextFitHeight, textFitHeightAction } from '@/vnext/editor/text-fit-height-authoring';

function ids(prefix = 'generated') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function textDocument(frame = { xMm: 20, yMm: 30, widthMm: 80, heightMm: 10 }, options: { locked?: boolean } = {}): CatalogDocument {
  const base = createCatalogDocument(ids('base'), 'FR-15');
  const text: TextObject = {
    id: 'text', type: 'text', frame, zIndex: 0, ...(options.locked ? { locked: true } : {}),
    text: plainRichText('text-rich', 'Parágrafo longo'), style: { fontSizePt: 10 },
  };
  return { ...base, pages: [{ ...base.pages[0], objects: [text] }] };
}

const pageId = (document: CatalogDocument) => document.pages[0].id;

function measured(
  document: CatalogDocument,
  textQ: { heightQ?: number; widthQ?: number },
  options: { snapshot?: boolean; diagnostics?: Diagnostic[]; geometryError?: boolean } = {}
): FitHeightMeasurement {
  const object = document.pages[0].objects[0];
  const frame = frameToCanonicalU(object.frame);
  return {
    source: document,
    plans: new Map(),
    diagnostics: options.diagnostics ?? [],
    snapshot: options.snapshot === false ? undefined : {
      facts: [{
        kind: 'object', pageId: pageId(document), objectId: object.id,
        authoredXU: frame.xU, authoredYU: frame.yU, authoredWidthU: frame.widthU, authoredHeightU: frame.heightU,
        xQ: uToQ(frame.xU), yQ: uToQ(frame.yU), widthQ: uToQ(frame.widthU), heightQ: uToQ(frame.heightU),
        textFlowSignature: 'a'.repeat(64),
        ...(textQ.heightQ !== undefined ? { intrinsicContentHeightQ: textQ.heightQ } : {}),
        ...(textQ.widthQ !== undefined ? { intrinsicContentWidthQ: textQ.widthQ } : {}),
      }],
      geometryDiagnostics: options.geometryError
        ? [{ code: 'RENDER_GEOMETRY_MISMATCH', severity: 'ERROR', details: 'mismatch', pageId: pageId(document), objectId: object.id }]
        : [],
    },
  };
}

describe('FR-15 prepareTextFitHeight', () => {
  it('grows the box to the measured text height, exactly like the table fit (minimumUForProjectedQ)', () => {
    const document = textDocument();
    const heightQ = uToQ(mmToU(23.4));
    const result = prepareTextFitHeight(document, pageId(document), 'text', measured(document, { heightQ, widthQ: uToQ(mmToU(60)) }));
    expect(result).toEqual({
      ok: true,
      prepared: {
        pageId: pageId(document), objectId: 'text', expectedFrame: frameToCanonicalU(document.pages[0].objects[0].frame),
        measuredIntrinsicHeightQ: heightQ, preparedHeightU: minimumUForProjectedQ(heightQ), grows: true,
      },
    });
    // After the fit the text no longer overflows: the frame projects to at least the text height.
    if (result.ok) expect(uToQ(result.prepared.preparedHeightU)).toBeGreaterThanOrEqual(heightQ);
  });

  it('also shrinks a box that is taller than its text', () => {
    const document = textDocument({ xMm: 20, yMm: 30, widthMm: 80, heightMm: 40 });
    const result = prepareTextFitHeight(document, pageId(document), 'text', measured(document, { heightQ: uToQ(mmToU(8)), widthQ: 100 }));
    expect(result).toMatchObject({ ok: true, prepared: { grows: false } });
  });

  it('says the box already fits when the height would not change', () => {
    const document = textDocument();
    const heightQ = uToQ(mmToU(10));
    expect(prepareTextFitHeight(document, pageId(document), 'text', measured(document, { heightQ, widthQ: 100 })))
      .toMatchObject({ ok: false, reason: 'ALREADY_FITS', message: 'A caixa já está na altura do texto.' });
  });

  it('never grows past the bottom margin (safe area) of the page', () => {
    // Default page: 297 mm tall with a 12 mm safe area, so the box may end at 285 mm.
    const document = textDocument({ xMm: 20, yMm: 250, widthMm: 80, heightMm: 10 });
    const fits = prepareTextFitHeight(document, pageId(document), 'text', measured(document, { heightQ: uToQ(mmToU(35)), widthQ: 100 }));
    expect(fits.ok).toBe(true);
    const tooTall = prepareTextFitHeight(document, pageId(document), 'text', measured(document, { heightQ: uToQ(mmToU(35.5)), widthQ: 100 }));
    expect(tooTall).toMatchObject({ ok: false, reason: 'NO_ROOM' });
    if (!tooTall.ok) expect(tooTall.message).toContain('margem de baixo');
  });

  it('uses the page edge when the page has no safe area', () => {
    const base = textDocument({ xMm: 20, yMm: 250, widthMm: 80, heightMm: 10 });
    const document: CatalogDocument = { ...base, pages: [{ ...base.pages[0], safeArea: undefined }] };
    expect(prepareTextFitHeight(document, pageId(document), 'text', measured(document, { heightQ: uToQ(mmToU(47)), widthQ: 100 })).ok).toBe(true);
    expect(prepareTextFitHeight(document, pageId(document), 'text', measured(document, { heightQ: uToQ(mmToU(47.5)), widthQ: 100 })))
      .toMatchObject({ ok: false, reason: 'NO_ROOM' });
  });

  it('does not offer a height fit when a word is wider than the box', () => {
    const document = textDocument();
    expect(prepareTextFitHeight(document, pageId(document), 'text', measured(document, { heightQ: 4000, widthQ: uToQ(mmToU(81)) })))
      .toMatchObject({ ok: false, reason: 'TOO_WIDE' });
  });

  it('waits for a current, stable measurement of this exact catalog', () => {
    const document = textDocument();
    const other = textDocument();
    expect(prepareTextFitHeight(document, pageId(document), 'text', null)).toMatchObject({ ok: false, reason: 'MEASURING', message: 'Medindo o texto…' });
    expect(prepareTextFitHeight(document, pageId(document), 'text', measured(other, { heightQ: 4000, widthQ: 100 })))
      .toMatchObject({ ok: false, reason: 'MEASURING' });
    expect(prepareTextFitHeight(document, pageId(document), 'text', measured(document, { heightQ: 4000, widthQ: 100 }, { snapshot: false })))
      .toMatchObject({ ok: false, reason: 'MEASURING' });
    expect(prepareTextFitHeight(document, pageId(document), 'text', measured(document, {})))
      .toMatchObject({ ok: false, reason: 'MEASURING' });
    expect(prepareTextFitHeight(document, pageId(document), 'text', measured(document, { heightQ: 4000, widthQ: 100 }, { geometryError: true })))
      .toMatchObject({ ok: false, reason: 'UNSTABLE' });
    expect(prepareTextFitHeight(document, pageId(document), 'text', measured(document, { heightQ: 4000, widthQ: 100 }, {
      snapshot: false, diagnostics: [{ code: 'LAYOUT_UNSTABLE', severity: 'ERROR', details: 'x' }],
    }))).toMatchObject({ ok: false, reason: 'UNSTABLE' });
  });

  it('refuses locked and missing boxes', () => {
    const locked = textDocument(undefined, { locked: true });
    expect(prepareTextFitHeight(locked, pageId(locked), 'text', measured(locked, { heightQ: 4000, widthQ: 100 })))
      .toMatchObject({ ok: false, reason: 'LOCKED' });
    const document = textDocument();
    expect(prepareTextFitHeight(document, pageId(document), 'missing', measured(document, { heightQ: 4000, widthQ: 100 })))
      .toMatchObject({ ok: false, reason: 'NO_TEXT' });
  });
});

describe('FR-15 applyTextFitHeight', () => {
  it('resizes only the height, as one step that Desfazer reverts', () => {
    const session = createDocumentSession(textDocument(), { createId: ids() });
    const document = session.getSnapshot().document;
    const heightQ = uToQ(mmToU(23.4));
    const preparation = prepareTextFitHeight(document, pageId(document), 'text', measured(document, { heightQ, widthQ: 100 }));
    if (!preparation.ok) throw new Error(preparation.message);
    expect(textFitHeightAction(preparation.prepared)).toMatchObject({ type: 'object.resize', objectId: 'text', heightU: preparation.prepared.preparedHeightU });

    const outcome = applyTextFitHeight(session, document, preparation.prepared, 'fit-1');
    expect(outcome).toEqual({ ok: true, message: 'Altura da caixa ajustada: agora o texto cabe inteiro. Use Desfazer se precisar.' });
    const after = session.getSnapshot().document.pages[0].objects[0];
    expect(frameToCanonicalU(after.frame)).toEqual({ ...preparation.prepared.expectedFrame, heightU: preparation.prepared.preparedHeightU });
    session.undo();
    expect(session.getSnapshot().document.pages[0].objects[0].frame).toEqual(document.pages[0].objects[0].frame);
  });

  it('refuses to use a measurement of an older version of the catalog', () => {
    const session = createDocumentSession(textDocument(), { createId: ids() });
    const document = session.getSnapshot().document;
    const preparation = prepareTextFitHeight(document, pageId(document), 'text', measured(document, { heightQ: 6000, widthQ: 100 }));
    if (!preparation.ok) throw new Error(preparation.message);
    session.execute({ type: 'object.move', objectId: 'text', xU: mmToU(30), yU: mmToU(40) });
    const moved = session.getSnapshot().document;
    expect(applyTextFitHeight(session, document, preparation.prepared, 'fit-2'))
      .toEqual({ ok: false, message: 'O texto mudou depois da medição. Aguarde alguns segundos e tente novamente.' });
    expect(session.getSnapshot().document).toBe(moved);
  });
});

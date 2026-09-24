import { describe, expect, it } from 'vitest';
import { prepareTableFitHeight, type FitHeightMeasurement } from '@/vnext/editor/table-fit-height-authoring';
import { minimumUForProjectedQ, mmToU, uToQ, type CatalogDocument } from '@/vnext/domain';
import type { LayoutSnapshot, TablePlan } from '@/vnext/rendering';
import {
  createW4DTableDocument,
  W4D_OBJECT_A_ID,
  W4D_PAGE_ID,
  W4D_TABLE_A_ID,
} from '../proof/fixtures/w4d-table-document';

function measurement(
  document: CatalogDocument,
  intrinsicQ: number,
  options: {
    snapshot?: boolean;
    plan?: boolean;
    diagnostics?: FitHeightMeasurement['diagnostics'];
    geometryError?: boolean;
  } = {}
): FitHeightMeasurement {
  const snapshot: LayoutSnapshot | undefined = options.snapshot === false ? undefined : {
    facts: [{
      kind: 'table',
      pageId: W4D_PAGE_ID,
      objectId: W4D_OBJECT_A_ID,
      tableId: W4D_TABLE_A_ID,
      frameWidthU: mmToU(88),
      columnWidthsU: [],
      frameQ: uToQ(mmToU(88)),
      trackQ: [],
      renderedIntrinsicHeightQ: intrinsicQ,
    }],
    geometryDiagnostics: options.geometryError ? [{
      code: 'RENDER_GEOMETRY_MISMATCH',
      severity: 'ERROR',
      pageId: W4D_PAGE_ID,
      objectId: W4D_OBJECT_A_ID,
      tableId: W4D_TABLE_A_ID,
      details: 'mismatch',
    }] : [],
  };  return {
    source: document,
    plans: options.plan === false
      ? new Map()
      : new Map([[W4D_TABLE_A_ID, {} as TablePlan]]),
    snapshot,
    diagnostics: options.diagnostics ?? [],
  };
}

describe('W4.E Fit Height preparation', () => {
  it('uses renderedIntrinsicHeightQ and minimumUForProjectedQ exactly', () => {
    const document = createW4DTableDocument();
    const intrinsicQ = 12_345;
    const result = prepareTableFitHeight(
      document,
      W4D_PAGE_ID,
      W4D_OBJECT_A_ID,
      measurement(document, intrinsicQ)
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prepared.measuredIntrinsicHeightQ).toBe(intrinsicQ);
    expect(result.prepared.preparedHeightU).toBe(minimumUForProjectedQ(intrinsicQ));
    expect(uToQ(result.prepared.preparedHeightU)).toBeGreaterThanOrEqual(intrinsicQ);
    expect(uToQ(result.prepared.preparedHeightU - 1)).toBeLessThan(intrinsicQ);
    expect(result.prepared.expectedTable.id).toBe(W4D_TABLE_A_ID);
    expect(result.prepared.expectedTypography).toEqual({
      fonts: document.style.fonts,
      defaultText: document.style.defaultText,
    });
  });

  it('fails closed for stale source, missing snapshot, missing plan and missing fact', () => {
    const document = createW4DTableDocument();
    const clone = structuredClone(document);
    expect(prepareTableFitHeight(document, W4D_PAGE_ID, W4D_OBJECT_A_ID, measurement(clone, 1000)))
      .toMatchObject({ ok: false, reason: 'MEASURING' });
    expect(prepareTableFitHeight(document, W4D_PAGE_ID, W4D_OBJECT_A_ID, measurement(document, 1000, { snapshot: false })))
      .toMatchObject({ ok: false, reason: 'MEASURING' });
    expect(prepareTableFitHeight(document, W4D_PAGE_ID, W4D_OBJECT_A_ID, measurement(document, 1000, { plan: false })))
      .toMatchObject({ ok: false, reason: 'NO_PLAN' });
    const noFact = measurement(document, 1000);
    noFact.snapshot = { facts: [], geometryDiagnostics: [] };
    expect(prepareTableFitHeight(document, W4D_PAGE_ID, W4D_OBJECT_A_ID, noFact))
      .toMatchObject({ ok: false, reason: 'NO_FACT' });
  });

  it('disables Fit for unstable or geometry-mismatched measurement', () => {
    const document = createW4DTableDocument();
    expect(prepareTableFitHeight(
      document,
      W4D_PAGE_ID,
      W4D_OBJECT_A_ID,
      measurement(document, 1000, {
        diagnostics: [{ code: 'LAYOUT_UNSTABLE', severity: 'ERROR', details: 'fact changed' }],
      })
    )).toMatchObject({ ok: false, reason: 'UNSTABLE' });
    expect(prepareTableFitHeight(
      document,
      W4D_PAGE_ID,
      W4D_OBJECT_A_ID,
      measurement(document, 1000, { geometryError: true })
    )).toMatchObject({ ok: false, reason: 'UNSTABLE' });
  });

  it('rejects locked Tables and non-Table targets before preparation', () => {
    const document = createW4DTableDocument();
    const table = document.pages[0].objects[0];
    if (table.type !== 'table') throw new Error('Expected Table');
    const locked: CatalogDocument = {
      ...document,
      pages: [{ ...document.pages[0], objects: [{ ...table, locked: true }, document.pages[0].objects[1]] }],
    };
    expect(prepareTableFitHeight(locked, W4D_PAGE_ID, W4D_OBJECT_A_ID, measurement(locked, 1000)))
      .toMatchObject({ ok: false, reason: 'LOCKED' });
    expect(prepareTableFitHeight(document, W4D_PAGE_ID, 'missing', measurement(document, 1000)))
      .toMatchObject({ ok: false, reason: 'NO_TABLE' });
  });

  it('reports page and safe-area consequences without clamping or rejecting preparation', () => {
    const document = createW4DTableDocument();
    const tooTallQ = uToQ(mmToU(310));
    const tall = prepareTableFitHeight(
      document,
      W4D_PAGE_ID,
      W4D_OBJECT_A_ID,
      measurement(document, tooTallQ)
    );
    expect(tall.ok).toBe(true);
    if (!tall.ok) return;
    expect(tall.prepared.tallerThanPage).toBe(true);
    expect(tall.prepared.wouldExceedPage).toBe(true);

    const safeCrossingQ = uToQ(mmToU(260));
    const safe = prepareTableFitHeight(
      document,
      W4D_PAGE_ID,
      W4D_OBJECT_A_ID,
      measurement(document, safeCrossingQ)
    );
    expect(safe.ok).toBe(true);
    if (!safe.ok) return;
    expect(safe.prepared.wouldViolateSafeArea).toBe(true);
    expect(safe.prepared.preparedHeightU).toBe(minimumUForProjectedQ(safeCrossingQ));
  });
});

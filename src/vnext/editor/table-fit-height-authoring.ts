import {
  frameToCanonicalU,
  minimumUForProjectedQ,
  mmToU,
  type CatalogDocument,
  type Diagnostic,
} from '../domain';
import { add } from '../domain/physical';
import type { LayoutSnapshot, TablePlan } from '../rendering';

export type FitHeightUnavailableReason =
  | 'NO_TABLE'
  | 'LOCKED'
  | 'MEASURING'
  | 'UNSTABLE'
  | 'NO_PLAN'
  | 'NO_FACT';

export interface FitHeightMeasurement {
  source: CatalogDocument;
  plans: ReadonlyMap<string, TablePlan>;
  snapshot?: LayoutSnapshot;
  diagnostics?: readonly Diagnostic[];
}

export interface PreparedTableFitHeight {
  pageId: string;
  objectId: string;
  tableId: string;  expectedFrame: ReturnType<typeof frameToCanonicalU>;
  expectedTable: Extract<CatalogDocument['pages'][number]['objects'][number], { type: 'table' }>['table'];
  expectedTypography: Pick<CatalogDocument['style'], 'fonts' | 'defaultText'>;
  measuredIntrinsicHeightQ: number;
  preparedHeightU: number;
  wouldExceedPage: boolean;
  tallerThanPage: boolean;
  wouldViolateSafeArea: boolean;
}

export type TableFitHeightPreparation =
  | { ok: true; prepared: PreparedTableFitHeight }
  | { ok: false; reason: FitHeightUnavailableReason; message: string };

const unavailable = (
  reason: FitHeightUnavailableReason,
  message: string
): TableFitHeightPreparation => ({ ok: false, reason, message });

export function prepareTableFitHeight(
  document: CatalogDocument,
  pageId: string,
  objectId: string,
  measurement: FitHeightMeasurement | null | undefined
): TableFitHeightPreparation {  const page = document.pages.find((entry) => entry.id === pageId);
  const object = page?.objects.find((entry) => entry.id === objectId);
  if (!page || !object || object.type !== 'table') {
    return unavailable('NO_TABLE', 'Selecione uma única tabela para ajustar a altura.');
  }
  if (object.locked) {
    return unavailable('LOCKED', 'Tabela bloqueada não pode ter a altura ajustada.');
  }
  if (!measurement || measurement.source !== document || !measurement.snapshot) {
    const unstable = measurement?.diagnostics?.some((diagnostic) =>
      diagnostic.code === 'LAYOUT_UNSTABLE' || diagnostic.code === 'RENDER_GEOMETRY_MISMATCH'
    );
    return unstable
      ? unavailable('UNSTABLE', 'A medição da tabela ainda não está estável.')
      : unavailable('MEASURING', 'Medindo tabela…');
  }
  if (measurement.diagnostics?.some((diagnostic) =>
    diagnostic.code === 'LAYOUT_UNSTABLE' || diagnostic.code === 'RENDER_GEOMETRY_MISMATCH'
  ) || measurement.snapshot.geometryDiagnostics.some((diagnostic) => diagnostic.severity === 'ERROR')) {
    return unavailable('UNSTABLE', 'A medição da tabela ainda não está estável.');
  }
  if (!measurement.plans.has(object.table.id)) {
    return unavailable('NO_PLAN', 'A tabela não possui uma medição de layout válida.');
  }  const fact = measurement.snapshot.facts.find((entry) =>
    entry.kind === 'table'
    && entry.pageId === page.id
    && entry.objectId === object.id
    && entry.tableId === object.table.id
  );
  if (!fact || fact.kind !== 'table' || fact.renderedIntrinsicHeightQ <= 0) {
    return unavailable('NO_FACT', 'Medindo tabela…');
  }

  const preparedHeightU = minimumUForProjectedQ(fact.renderedIntrinsicHeightQ);
  const frame = frameToCanonicalU(object.frame);
  const pageWidthU = mmToU(page.widthMm);
  const pageHeightU = mmToU(page.heightMm);
  const bottomU = add(frame.yU, preparedHeightU);
  const tallerThanPage = preparedHeightU > pageHeightU;
  const wouldExceedPage = bottomU > pageHeightU || frame.yU < 0;
  const safe = page.safeArea;
  const wouldViolateSafeArea = Boolean(safe && (
    frame.xU < mmToU(safe.leftMm)
    || frame.yU < mmToU(safe.topMm)
    || add(frame.xU, frame.widthU) > add(pageWidthU, -mmToU(safe.rightMm))
    || bottomU > add(pageHeightU, -mmToU(safe.bottomMm))
  ));

  return {
    ok: true,
    prepared: {
      pageId: page.id,
      objectId: object.id,
      tableId: object.table.id,
      expectedFrame: frame,
      expectedTable: object.table,
      expectedTypography: {
        fonts: document.style.fonts,
        defaultText: document.style.defaultText,
      },
      measuredIntrinsicHeightQ: fact.renderedIntrinsicHeightQ,
      preparedHeightU,
      wouldExceedPage,
      tallerThanPage,
      wouldViolateSafeArea,
    },
  };
}

import { frameToCanonicalU, minimumUForProjectedQ, mmToU, uToQ, type CatalogDocument } from '../domain';
import { add } from '../domain/physical';
import type { ApplicationAction, DocumentSession, FrameU } from '../application';
import type { FitHeightMeasurement } from './table-fit-height-authoring';

/**
 * FR-15 "Ajustar altura ao texto": makes a text box exactly as tall as its text, from the editor's last
 * stable layout measurement (the same measure that raises TEXT_OBJECT_OVERFLOW), in the pattern of
 * `prepareTableFitHeight`. The change itself is one `object.resize`, so one Desfazer undoes it.
 */
export type TextFitHeightUnavailableReason =
  | 'NO_TEXT'
  | 'LOCKED'
  | 'MEASURING'
  | 'UNSTABLE'
  | 'TOO_WIDE'
  | 'NO_ROOM'
  | 'ALREADY_FITS';

export interface PreparedTextFitHeight {
  pageId: string;
  objectId: string;
  expectedFrame: FrameU;
  measuredIntrinsicHeightQ: number;
  preparedHeightU: number;
  /** True when the box gets taller, that is, the text did not fit. */
  grows: boolean;
}

export type TextFitHeightPreparation =
  | { ok: true; prepared: PreparedTextFitHeight }
  | { ok: false; reason: TextFitHeightUnavailableReason; message: string };

export interface TextFitHeightOutcome {
  ok: boolean;
  message: string;
}

const unavailable = (reason: TextFitHeightUnavailableReason, message: string): TextFitHeightPreparation =>
  ({ ok: false, reason, message });

const MEASURING_MESSAGE = 'Medindo o texto…';
const UNSTABLE_MESSAGE = 'A medição do texto ainda não terminou. Aguarde alguns segundos.';

function unstable(measurement: FitHeightMeasurement): boolean {
  return Boolean(
    measurement.diagnostics?.some((diagnostic) =>
      diagnostic.code === 'LAYOUT_UNSTABLE' || diagnostic.code === 'RENDER_GEOMETRY_MISMATCH')
    || measurement.snapshot?.geometryDiagnostics.some((diagnostic) => diagnostic.severity === 'ERROR')
  );
}

/** Lowest point the box may reach: the page's safe area when it has one, otherwise the page edge. */
function bottomLimitU(page: CatalogDocument['pages'][number]): number {
  const pageHeightU = mmToU(page.heightMm);
  return page.safeArea ? add(pageHeightU, -mmToU(page.safeArea.bottomMm)) : pageHeightU;
}

export function prepareTextFitHeight(
  document: CatalogDocument,
  pageId: string,
  objectId: string,
  measurement: FitHeightMeasurement | null | undefined
): TextFitHeightPreparation {
  const page = document.pages.find((entry) => entry.id === pageId);
  const object = page?.objects.find((entry) => entry.id === objectId);
  if (!page || !object || object.type !== 'text') {
    return unavailable('NO_TEXT', 'Selecione uma caixa de texto para ajustar a altura.');
  }
  if (object.locked) {
    return unavailable('LOCKED', 'A caixa de texto está bloqueada. Desbloqueie para ajustar a altura.');
  }
  if (!measurement || measurement.source !== document || !measurement.snapshot) {
    return measurement && unstable(measurement)
      ? unavailable('UNSTABLE', UNSTABLE_MESSAGE)
      : unavailable('MEASURING', MEASURING_MESSAGE);
  }
  if (unstable(measurement)) return unavailable('UNSTABLE', UNSTABLE_MESSAGE);

  const fact = measurement.snapshot.facts.find((entry) =>
    entry.kind === 'object' && entry.pageId === page.id && entry.objectId === object.id);
  const heightQ = fact?.kind === 'object' ? fact.intrinsicContentHeightQ : undefined;
  const widthQ = fact?.kind === 'object' ? fact.intrinsicContentWidthQ : undefined;
  if (heightQ === undefined || widthQ === undefined || heightQ <= 0) {
    return unavailable('MEASURING', MEASURING_MESSAGE);
  }

  const frame = frameToCanonicalU(object.frame);
  if (widthQ > uToQ(frame.widthU)) {
    return unavailable('TOO_WIDE', 'Uma palavra é mais larga que a caixa. Aumente a largura da caixa ou divida a palavra.');
  }
  const preparedHeightU = minimumUForProjectedQ(heightQ);
  // Same rendered height (a few ten-thousandths of a millimetre apart at most): nothing visible would change.
  if (uToQ(preparedHeightU) === uToQ(frame.heightU)) {
    return unavailable('ALREADY_FITS', 'A caixa já está na altura do texto.');
  }
  const grows = preparedHeightU > frame.heightU;
  // Growing never pushes the box past the bottom margin; shrinking is always allowed.
  if (grows && add(frame.yU, preparedHeightU) > bottomLimitU(page)) {
    return unavailable(
      'NO_ROOM',
      'O texto não cabe até a margem de baixo da página. Diminua a letra, encurte o texto ou suba a caixa.'
    );
  }
  return {
    ok: true,
    prepared: {
      pageId: page.id,
      objectId: object.id,
      expectedFrame: frame,
      measuredIntrinsicHeightQ: heightQ,
      preparedHeightU,
      grows,
    },
  };
}

export function textFitHeightAction(prepared: PreparedTextFitHeight): ApplicationAction {
  return {
    type: 'object.resize',
    objectId: prepared.objectId,
    xU: prepared.expectedFrame.xU,
    yU: prepared.expectedFrame.yU,
    widthU: prepared.expectedFrame.widthU,
    heightU: prepared.preparedHeightU,
  };
}

/**
 * Applies a preparation made from `document`. The measurement is only valid for that exact document, so
 * any change since then (a new letter, a move) refuses the fit instead of resizing to an old height.
 */
export function applyTextFitHeight(
  session: DocumentSession,
  document: CatalogDocument,
  prepared: PreparedTextFitHeight,
  transactionId: string
): TextFitHeightOutcome {
  const stale = { ok: false, message: 'O texto mudou depois da medição. Aguarde alguns segundos e tente novamente.' };
  if (session.getSnapshot().document !== document) return stale;
  const result = session.execute(textFitHeightAction(prepared), { transactionId });
  if (!result.ok) {
    return result.error.code === 'OBJECT_LOCKED'
      ? { ok: false, message: 'A caixa de texto está bloqueada. Desbloqueie para ajustar a altura.' }
      : stale;
  }
  return {
    ok: true,
    message: prepared.grows
      ? 'Altura da caixa ajustada: agora o texto cabe inteiro. Use Desfazer se precisar.'
      : 'Altura da caixa ajustada ao texto. Use Desfazer se precisar.',
  };
}

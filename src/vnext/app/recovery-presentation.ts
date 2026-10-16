import type { AuthoringRecoveryOverlay, RecoveryStartupCandidate } from '../recovery';

/**
 * Plain-language wording for the local backup ("cópia de segurança neste computador")
 * screen. No raw records, JSON, internal IDs or technical terms reach the father.
 */

export const RECOVERY_KICKER = 'Cópia de segurança neste computador';
export const PENDING_SAVE_PHASE_MESSAGE = 'Há um salvamento anterior deste catálogo que ainda precisa ser verificado.';

export function recoveryCandidateTitle(candidate: RecoveryStartupCandidate): string {
  return candidate.inspection.status === 'VALID'
    ? candidate.inspection.record.documentSnapshot.title
    : 'Cópia de segurança danificada';
}

export function recoveryDecisionMessage(candidate: RecoveryStartupCandidate): string {
  switch (candidate.decision.kind) {
    case 'RECOVERABLE_OVER_SAME_REMOTE_BASE':
      return candidate.inspection.status === 'VALID' && candidate.inspection.record.pendingRemoteMutation
        ? 'O último salvamento destas alterações não chegou a ser confirmado. Verifique antes de continuar.'
        : 'Estas alterações foram feitas sobre a versão salva atual e podem ser recuperadas.';
    case 'REMOTE_NEWER_OR_DIFFERENT_CONFLICT':
      return 'A versão salva mudou depois destas alterações. Elas ficaram guardadas só para consulta.';
    case 'SAME_REVISION_DIGEST_MISMATCH':
      return 'A versão salva não confere com esta cópia de segurança. Por segurança, ela não pode ser recuperada.';
    case 'REMOTE_UNAVAILABLE':
      return 'Não foi possível consultar a versão salva agora. Você pode ver as alterações, mas não recuperá-las.';
    case 'INVALID_OR_UNSUPPORTED_RECORD':
      return 'Esta cópia de segurança está danificada e não pode ser aberta.';
    case 'REDUNDANT_ALREADY_IN_CLOUD':
      return 'Estas alterações já estão salvas.';
    case 'NO_RECOVERY':
      return 'Não há nada para recuperar.';
  }
}

function pageCountLabel(count: number): string {
  return count === 1 ? '1 página' : `${count} páginas`;
}

function savedAtLabel(isoTimestamp: string): string | undefined {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return undefined;
  const day = date.toLocaleDateString('pt-BR');
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `Guardada em ${day} às ${time}`;
}

/** One readable line: when the backup was written, how many pages, and any unfinished typing. */
export function recoveryCandidateSummary(candidate: RecoveryStartupCandidate): string | undefined {
  if (candidate.inspection.status !== 'VALID') return undefined;
  const { record } = candidate.inspection;
  const parts = [savedAtLabel(record.updatedAt), pageCountLabel(record.documentSnapshot.pages.length)];
  const overlay = record.authoringRecoveryOverlay ? overlayHeading(record.authoringRecoveryOverlay) : undefined;
  if (overlay) parts.push(`inclui: ${overlay.toLowerCase()}`);
  return parts.filter(Boolean).join(' · ');
}

export function overlayHeading(overlay: AuthoringRecoveryOverlay): string {
  switch (overlay.kind) {
    case 'TEXT_DRAFT_V1': return 'Texto que estava sendo digitado';
    case 'TABLE_TITLE_DRAFT_V1': return 'Título de tabela que estava sendo digitado';
    case 'INSPECTOR_FRAME_DRAFT_V1': return 'Posição e tamanho que estavam sendo alterados';
    case 'TABLE_CELL_DRAFT_V1': return 'Célula de tabela que estava sendo editada';
  }
}

const QUALIFIER_LABEL = { '': '', approx: 'aprox. ', min: 'mín. ', max: 'máx. ' } as const;

function cellDraftDetail(overlay: Extract<AuthoringRecoveryOverlay, { kind: 'TABLE_CELL_DRAFT_V1' }>): string {
  const { draft } = overlay;
  switch (overlay.activeType) {
    case 'empty': return 'Célula vazia.';
    case 'richText': return `Texto: ${draft.richText}`;
    case 'technicalCode': return `Código: ${draft.technicalCode}`;
    case 'measurement': {
      const { qualifier, valueText, unit } = draft.measurement;
      return `Medida: ${`${QUALIFIER_LABEL[qualifier]}${valueText} ${unit}`.trim()}`;
    }
  }
}

/** Readable value of an unfinished edit, never the raw stored structure. */
export function overlayDetail(overlay: AuthoringRecoveryOverlay): string {
  switch (overlay.kind) {
    case 'TEXT_DRAFT_V1':
    case 'TABLE_TITLE_DRAFT_V1':
      return overlay.draft;
    case 'INSPECTOR_FRAME_DRAFT_V1': {
      const { x, y, width, height } = overlay.draft;
      return `Horizontal ${x} mm, vertical ${y} mm, largura ${width} mm, altura ${height} mm.`;
    }
    case 'TABLE_CELL_DRAFT_V1':
      return cellDraftDetail(overlay);
  }
}

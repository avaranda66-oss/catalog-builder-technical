import type { SaveProjection } from '../persistence';

export type FatherSaveLabel =
  | 'Salvar'
  | 'Salvando…'
  | 'Salvo'
  | 'Alterações não salvas'
  | 'Conflito'
  | 'Não foi possível confirmar o salvamento'
  | 'Sem conexão / indisponível'
  | 'Sessão expirada — entre novamente';

const FATHER_SAVE_LABELS: Readonly<Record<SaveProjection['label'], FatherSaveLabel>> = {
  Save: 'Salvar',
  'Saving…': 'Salvando…',
  Saved: 'Salvo',
  'Unsaved changes': 'Alterações não salvas',
  Conflict: 'Conflito',
  'Could not verify save': 'Não foi possível confirmar o salvamento',
  'Offline / unavailable': 'Sem conexão / indisponível',
  'Session expired': 'Sessão expirada — entre novamente',
};

export function fatherSaveLabel(label: SaveProjection['label']): FatherSaveLabel {
  return FATHER_SAVE_LABELS[label];
}

/** "14:05": hour and minute on this computer's clock. */
export function formatSavedTime(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** FR-44: the time is shown only after this tab got the server's confirmation ("Salvo às 14:05"). */
export function fatherSavedTime(save: SaveProjection): string | undefined {
  return save.label === 'Saved' && save.savedAt !== undefined ? `às ${formatSavedTime(save.savedAt)}` : undefined;
}

/** FR-44: what the automatic save will do next, for the save problem band. */
function automaticRetrySentence(save: SaveProjection): string {
  if (!save.retry) return '';
  return save.retry.exhausted
    ? ' Tentamos salvar várias vezes sem conseguir. Quando a conexão voltar, clique em Salvar.'
    : ' Vamos tentar salvar de novo sozinhos em instantes. Você também pode clicar em Salvar.';
}

/** Repository details stay in the runtime; only actionable office language reaches the editor. */
export function fatherSaveExplanation(save: SaveProjection): string {
  switch (save.phase) {
    case 'conflict': return 'Este catálogo mudou em outro lugar. Salve seu trabalho como uma cópia ou abra a versão mais recente.';
    case 'ambiguous': return save.retry
      ? `O salvamento ainda não foi confirmado. Mantenha esta aba aberta.${automaticRetrySentence(save)}`
      : 'O salvamento ainda não foi confirmado. Mantenha esta aba aberta e use Salvar para verificar novamente.';
    case 'unavailable': return save.retry
      ? `Não foi possível falar com o servidor agora. Confira a conexão. Suas alterações continuam nesta tela, mas ainda não foram salvas.${automaticRetrySentence(save)}`
      : 'Não foi possível salvar agora. Confira a conexão e tente Salvar novamente.';
    case 'unauthorized': return 'Sua sessão expirou ou sua permissão de edição mudou. Não feche esta aba: suas alterações continuam nesta tela. Entre novamente com a mesma conta e clique em Salvar.';
    case 'blocked': return save.message === 'Conclua a composição de texto antes de salvar.'
      ? save.message
      : 'Confira os campos que está editando e use Salvar antes de sair deste catálogo.';
    default: return fatherSaveLabel(save.label);
  }
}

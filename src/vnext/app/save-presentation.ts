import type { SaveProjection } from '../persistence';

export type FatherSaveLabel =
  | 'Salvar'
  | 'Salvando…'
  | 'Salvo'
  | 'Alterações não salvas'
  | 'Conflito'
  | 'Não foi possível confirmar o salvamento'
  | 'Sem conexão / indisponível';

const FATHER_SAVE_LABELS: Readonly<Record<SaveProjection['label'], FatherSaveLabel>> = {
  Save: 'Salvar',
  'Saving…': 'Salvando…',
  Saved: 'Salvo',
  'Unsaved changes': 'Alterações não salvas',
  Conflict: 'Conflito',
  'Could not verify save': 'Não foi possível confirmar o salvamento',
  'Offline / unavailable': 'Sem conexão / indisponível',
};

export function fatherSaveLabel(label: SaveProjection['label']): FatherSaveLabel {
  return FATHER_SAVE_LABELS[label];
}

/** Repository details stay in the runtime; only actionable office language reaches the editor. */
export function fatherSaveExplanation(save: SaveProjection): string {
  switch (save.phase) {
    case 'conflict': return 'Este catálogo mudou em outro lugar. Abra a versão mais recente ou salve seu trabalho como uma cópia.';
    case 'ambiguous': return 'O salvamento ainda não foi confirmado. Mantenha esta aba aberta e use Salvar para verificar novamente.';
    case 'unavailable': return 'Não foi possível salvar agora. Confira a conexão e tente Salvar novamente.';
    case 'unauthorized': return 'Sua sessão ou permissão de edição mudou. Entre novamente com a mesma conta para recuperar seu trabalho.';
    case 'blocked': return save.message === 'Conclua a composição de texto antes de salvar.'
      ? save.message
      : 'Confira os campos que está editando e use Salvar antes de sair deste catálogo.';
    default: return fatherSaveLabel(save.label);
  }
}

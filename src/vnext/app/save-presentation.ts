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

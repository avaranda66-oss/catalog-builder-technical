/**
 * Tone of an editor status message (FR-12). The editor reports results as plain Portuguese sentences, so the tone is
 * read from the sentence itself:
 * - `progress`: work still running ("Enviando imagem…"); stays until the result replaces it;
 * - `error`: a problem or an instruction the person still has to follow; stays until closed or replaced;
 * - `success`: a finished change ("Objeto excluído."); disappears after a few seconds;
 * - `info`: anything else; stays until closed or replaced, like before.
 */
export type EditorNoticeTone = 'progress' | 'error' | 'success' | 'info';

export const SUCCESS_NOTICE_TIMEOUT_MS = 4000;

const PROGRESS = /(?:…|\.\.\.)\s*$/u;
const PROBLEM = /\b(?:não foi possível|não pôde|não pode|não podem|não há|não existe|não está mais|não cabe|nada foi alterado|nenhum[a]?\b[^.]*\bfoi|indisponível|inválid[oa]s?|falh(?:a|ou|aram)|erro|conclua|selecione|informe|aguarde|escolha|cole o|mudou|mudaram|revise|exige|fora da página|cruza|sem conexão|tente novamente|desagrupe|desbloqueie|toque na|clique em)\b/iu;
const SUCCESS = /\b(?:atualizad|excluíd|inserid|removid|adicionad|duplicad|agrupad|desfeit|refeit|criad|copiad|mesclad|desmesclad|substituíd|ajustad|ativad|desativad|aplicad|alinhad|distribuíd|organizad|localizad|enviad|salv|movid|redimensionad|definid|restaurad|cancelad|bloquead|desbloquead)[oa]s?\b/iu;

export function classifyEditorNotice(message: string): EditorNoticeTone {
  if (PROGRESS.test(message)) return 'progress';
  if (PROBLEM.test(message)) return 'error';
  if (SUCCESS.test(message)) return 'success';
  return 'info';
}

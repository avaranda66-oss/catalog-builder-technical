/**
 * Tone of an editor status message (FR-12). The editor reports results as plain Portuguese sentences, so the tone is
 * read from the sentence itself:
 * - `progress`: work still running ("Enviando imagem…"); stays until the result replaces it;
 * - `error`: a problem, a refusal or an instruction the person still has to follow; stays until closed or replaced;
 * - `success`: a finished change ("Objeto excluído."); a short one disappears after a few seconds, a longer one that
 *   explains what to do next stays long enough to be read (see {@link editorNoticeTimeoutMs});
 * - `info`: anything else, such as "Texto sem alterações."; same timing as `success`.
 *
 * Problem words win over success words, so "Tabela adicionada. Confira a altura…" stays on screen. A caller that
 * knows the tone passes an {@link EditorNotice} instead, and the sentence is not read at all.
 */
export type EditorNoticeTone = 'progress' | 'error' | 'success' | 'info';

/** A short finished change ("Objeto excluído.") leaves after this. */
export const SUCCESS_NOTICE_TIMEOUT_MS = 4000;
/**
 * A finished change that explains itself in more words ("… A primeira linha virou o cabeçalho. Para voltar, use
 * Desfazer.") is an instruction too: it never leaves before this, and longer ones stay longer (C-03, J4).
 */
export const LONG_NOTICE_MIN_TIMEOUT_MS = 12_000;
/** Up to this many words a success is "short" and leaves after {@link SUCCESS_NOTICE_TIMEOUT_MS}. */
export const SHORT_NOTICE_MAX_WORDS = 8;
/** Reading time per word for a 60-year-old reader without hurry (100 words per minute). */
export const NOTICE_READING_MS_PER_WORD = 600;

/**
 * Matches whole words only. `\b` cannot be used: in JavaScript it only knows ASCII letters, so it never matches
 * next to "ã", "á" or "é" ("não há" would never match).
 */
function wholeWords(alternatives: readonly string[]): RegExp {
  return new RegExp(String.raw`(?<![\p{L}\p{N}])(?:` + alternatives.join('|') + String.raw`)(?![\p{L}\p{N}])`, 'iu');
}

const PROGRESS = /(?:…|\.\.\.)\s*$/u;

const PROBLEM = wholeWords([
  // Negations and refusals.
  'não', 'nada', 'nenhum', 'nenhuma', 'só pode', 'só podem', 'somente leitura', 'faria', 'fariam', 'deve', 'devem',
  'indisponível', 'indisponíveis', 'inválid[oa]s?', 'falh(?:a|as|ou|aram)', 'erro', 'erros', 'encerrad[oa]s?',
  'mudou', 'mudaram', 'fora da página', 'cruza', 'cruzar', 'sem conexão', 'exige', 'exigem', 'impede', 'impedem',
  // Instructions the person still has to follow.
  'conclua', 'confirme', 'selecione', 'informe', 'aguarde', 'escolha', 'cole', 'confira', 'revise', 'verifique',
  'remova', 'salve', 'mantenha', 'tente novamente', 'desagrupe', 'desbloqueie', 'toque na', 'toque no', 'clique em',
]);

const SUCCESS = wholeWords([
  '(?:atualizad|excluíd|inserid|removid|adicionad|duplicad|agrupad|desagrupad|desfeit|refeit|criad|copiad|colad'
  + '|mesclad|desmesclad|substituíd|ajustad|ativad|desativad|aplicad|alinhad|distribuíd|organizad|localizad|enviad'
  + '|salv|movid|redimensionad|definid|restaurad|cancelad|bloquead|desbloquead|renomead|traduzid|preenchid)[oa]s?',
]);

export function classifyEditorNotice(message: string): EditorNoticeTone {
  if (PROGRESS.test(message)) return 'progress';
  if (PROBLEM.test(message)) return 'error';
  if (SUCCESS.test(message)) return 'success';
  return 'info';
}

/**
 * A status message whose tone the caller already knows. Use it when a finished change has to explain itself with
 * words the sentence classifier reads as a problem (FR-12): "Tabela criada … A linha 3 tinha menos colunas" is still
 * a success and must not stay on screen as a red error.
 */
export interface EditorNotice {
  readonly text: string;
  readonly tone: EditorNoticeTone;
}

/** What the editor may report: a plain sentence (tone read from the words) or a sentence with its tone. */
export type EditorNoticeInput = string | EditorNotice;

export function successNotice(text: string): EditorNotice {
  return { text, tone: 'success' };
}

export function editorNoticeText(notice: EditorNoticeInput): string {
  return typeof notice === 'string' ? notice : notice.text;
}

export function editorNoticeTone(notice: EditorNoticeInput): EditorNoticeTone {
  return typeof notice === 'string' ? classifyEditorNotice(notice) : notice.tone;
}

/** Only errors and work in progress stay on screen until closed; successes and neutral messages may leave alone. */
export function editorNoticeAutoHides(tone: EditorNoticeTone): boolean {
  return tone === 'success' || tone === 'info';
}

export function editorNoticeWordCount(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

/**
 * How long a message stays before leaving on its own, or `null` when it stays until the person closes it (or the
 * next message replaces it). The rule the person can rely on: a short success leaves by itself; an error or an
 * instruction stays until closed; a longer success, which always carries an instruction, stays at least
 * {@link LONG_NOTICE_MIN_TIMEOUT_MS} and more when it has more words. Pointing at the message (or focusing its
 * button) pauses the countdown; leaving it starts the full time again.
 */
export function editorNoticeTimeoutMs(notice: EditorNoticeInput): number | null {
  if (!editorNoticeAutoHides(editorNoticeTone(notice))) return null;
  const words = editorNoticeWordCount(editorNoticeText(notice));
  if (words <= SHORT_NOTICE_MAX_WORDS) return SUCCESS_NOTICE_TIMEOUT_MS;
  return Math.max(LONG_NOTICE_MIN_TIMEOUT_MS, words * NOTICE_READING_MS_PER_WORD);
}

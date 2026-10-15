/**
 * Short replies ("Sim", "3", "capa") are legitimate in a conversation. The
 * composer already deployed in production rejects messages shorter than 8
 * characters, so the browser frames them with neutral context. The framing
 * also helps the model connect the answer to its previous question. Pure
 * module shared by the browser and scripts/probe-composer.mjs.
 */
export const COMPOSER_LEGACY_MIN_MESSAGE = 8;

export function frameShortComposerMessage(message: string, hasHistory: boolean): string {
  const text = message.trim();
  if (text.length >= COMPOSER_LEGACY_MIN_MESSAGE) return text;
  return (hasHistory ? 'Resposta do usuário à pergunta anterior: ' : 'Pedido do usuário: ') + text;
}

export function frameShortRewriteInstruction(message: string): string {
  const text = message.trim();
  return text.length >= COMPOSER_LEGACY_MIN_MESSAGE ? text : 'Instrução do usuário: ' + text;
}

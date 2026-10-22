import { ComposerRequestError, type ComposerClientCode, type ComposerReadiness } from './native-compose-client';

/**
 * Plain Portuguese for every composer outcome, each with what to do next.
 * Never shows codes, provider text or technical terms to the author.
 */
const UNCHANGED = ' O catálogo não foi alterado.';
const MESSAGES: Record<ComposerClientCode, string> = {
  COMPOSER_DISABLED: 'A IA está desligada no servidor neste momento. Continue editando manualmente; o administrador pode religá-la.',
  SERVER_NOT_CONFIGURED: 'O servidor da IA não está completo. Fale com o administrador e continue editando manualmente.',
  UNAUTHENTICATED: 'Sua sessão expirou. Entre de novo no aplicativo e tente outra vez.',
  FORBIDDEN: 'Sua conta não tem permissão para usar a IA. Fale com o administrador.',
  INVALID_ORIGIN: 'Este endereço do aplicativo não está liberado para a IA. Use o endereço oficial ou fale com o administrador.',
  METHOD_NOT_ALLOWED: 'Não foi possível falar com a IA agora. Tente de novo em instantes.',
  PAYLOAD_TOO_LARGE: 'O pedido ficou grande demais. Escreva um pedido mais curto e tente de novo.',
  TOKEN_BUDGET_EXCEEDED: 'O pedido e a conversa ficaram longos demais. Escreva um pedido mais curto e peça menos páginas de cada vez.',
  INVALID_REQUEST: 'A IA não aceitou o pedido desse jeito. Escreva com outras palavras e tente de novo.',
  BYOK_DISABLED: 'O uso de chave própria está desligado no servidor. Escolha “Voltar a usar a IA do servidor” no menu de opções (⚙) e tente de novo.',
  PROVIDER_NOT_CONFIGURED: 'A IA do servidor ainda não foi configurada. Fale com o administrador. Se você tiver uma chave própria do Gemini, use “Usar minha própria chave” no menu de opções do assistente (⚙).',
  AGENT_DAILY_BUDGET_EXCEEDED: 'O limite diário de uso da IA foi atingido. Continue editando manualmente hoje; amanhã o limite renova.',
  PROVIDER_RATE_LIMIT: 'O serviço do Google está ocupado. Espere um minuto e tente de novo.',
  PROVIDER_REJECTED_KEY: 'O Google recusou a chave da IA do servidor. Fale com o administrador.',
  PROVIDER_UNAVAILABLE: 'O serviço de IA não respondeu agora. Verifique a internet e tente de novo em instantes.',
  INVALID_PROVIDER_RESPONSE: 'A IA respondeu de um jeito que não pôde ser usado. Tente de novo, pedindo no máximo 4 páginas.',
  INVALID_REPLY: 'A IA respondeu de um jeito que não pôde ser usado. Tente de novo, pedindo no máximo 4 páginas.',
  NETWORK: 'Sem conexão com o servidor. Verifique a internet e tente de novo.',
  NATIVE_COMPOSER_UNAVAILABLE: 'Não foi possível consultar a IA agora. Tente de novo em instantes.',
};

export function composerErrorMessage(error: unknown, context: { usingOwnKey: boolean } = { usingOwnKey: false }): string {
  // Anything that is not an allowlisted failure (for example a reply that
  // failed the local strict check) is reported as an unusable answer.
  const failure = error instanceof ComposerRequestError ? error : new ComposerRequestError('INVALID_REPLY');
  let message = MESSAGES[failure.code];
  if (failure.code === 'PROVIDER_UNAVAILABLE' && failure.httpStatus === 429) message = MESSAGES.PROVIDER_RATE_LIMIT;
  if (failure.code === 'PROVIDER_REJECTED_KEY' && context.usingOwnKey) {
    message = 'O Google recusou a sua chave própria. Confira a chave em “Usar minha própria chave” no menu de opções (⚙) ou volte a usar a IA do servidor.';
  }
  if (failure.code === 'INVALID_PROVIDER_RESPONSE' && failure.reason === 'MAX_TOKENS') {
    message = 'A resposta da IA ficou longa demais. Peça menos páginas de cada vez (por exemplo, uma capa e uma tabela) e tente de novo.';
  }
  if (failure.code === 'INVALID_PROVIDER_RESPONSE' && (failure.reason === 'SAFETY' || failure.reason === 'BLOCKED')) {
    message = 'A IA não quis responder a este pedido. Escreva com outras palavras e tente de novo.';
  }
  return message + UNCHANGED;
}

export function composerReadinessText(readiness: ComposerReadiness | undefined, usingOwnKey: boolean): string {
  if (usingOwnKey) return 'IA pronta, usando a sua chave própria nesta aba.';
  if (!readiness) return 'Verificando a IA…';
  if (readiness.kind === 'available') return 'IA disponível.';
  if (readiness.kind === 'blocked') return MESSAGES[readiness.code];
  if (!readiness.serverKey) return MESSAGES.PROVIDER_NOT_CONFIGURED;
  if (readiness.remainingMicrousd !== null && readiness.callReserveMicrousd !== null &&
    readiness.remainingMicrousd < readiness.callReserveMicrousd) return MESSAGES.AGENT_DAILY_BUDGET_EXCEEDED;
  return 'IA pronta.';
}

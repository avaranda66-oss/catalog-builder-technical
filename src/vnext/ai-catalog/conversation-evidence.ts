import type { TechnicalInput } from './contracts';

export interface ConversationTurn {
  readonly role: 'user' | 'assistant';
  readonly message: string;
  readonly recordedAt: string;
}
const secretPatterns = [
  /\b(?:AIza|sk-(?:proj-)?)[A-Za-z0-9_-]{20,}\b/g,
  /\bAQ\.[A-Za-z0-9_-]{20,}\b/g,
  /\bBearer\s+\S+/gi,
  /\b(?:api[_ -]?key|token|senha|password)\s*[:=]\s*\S+/gi,
];
export function redactConversationMessage(value: string): string {
  let text = value;
  for (const pattern of secretPatterns) text = text.replace(pattern, '[CREDENCIAL_OCULTA]');
  return text.slice(0, 1200);
}

export function buildConversationEvidence(input: TechnicalInput,
  turns: readonly ConversationTurn[],
  selectedPlan: { template: string; style: string; sectionOrder: string[] } | null = null,
) {
  if (turns.length > 500) throw new Error('TRANSCRIPT_LIMIT');
  for (const turn of turns) {
    if (!['user', 'assistant'].includes(turn.role) ||
        !Number.isFinite(Date.parse(turn.recordedAt))) throw new Error('TRANSCRIPT_INVALID');
  }
  const messages = turns.map(turn => ({
    role: turn.role, message: redactConversationMessage(turn.message), recordedAt: turn.recordedAt,
  }));
  return {
    version: 1,
    scope: 'LOCAL_CLIENT_DIALOGUE_ONLY',
    explicitlyNotProven: ['MODEL_PROVIDER_ORIGIN', 'CLOUD_PERSISTENCE', 'PDF_OUTPUT_IDENTITY', 'UNCOACHED_HUMAN_PILOT'],
    sourceKind: input.kind,
    sourceHashes: input.sources.map(source => ({ sourceId: source.id, sha256: source.sha256 })),
    sourceModelLabels: input.models,
    totals: {
      messages: messages.length,
      user: messages.filter(turn => turn.role === 'user').length,
      assistant: messages.filter(turn => turn.role === 'assistant').length,
    },
    approvedPlan: selectedPlan,
    pdfOutputSha256: null,
    messages,
  };
}

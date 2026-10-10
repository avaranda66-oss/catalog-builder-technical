import { z } from 'zod';
import { redactConversationMessage } from './conversation-evidence';

export const WORKBENCH_MESSAGE_LIMIT = 500;
export const WORKBENCH_STORAGE_PREFIX = 'catalog-builder:ai-workbench-dialogue:v1:';
export const WorkbenchEntrySchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(1200),
  timestamp: z.string().datetime(),
  revision: z.number().int().nonnegative(),
  action: z.enum(['compact', 'undo', 'redo', 'publication', 'editor', 'help', 'reference']).optional(),
}).strict();
export type WorkbenchEntry = z.infer<typeof WorkbenchEntrySchema>;
const TranscriptSchema = z.object({
  version: z.literal(1),
  documentId: z.string().uuid(),
  entries: z.array(WorkbenchEntrySchema).max(WORKBENCH_MESSAGE_LIMIT),
}).strict();

export type WorkbenchAction = 'compact' | 'undo' | 'redo' | 'publication' | 'editor' | 'help';
export function interpretWorkbenchRequest(request: string): WorkbenchAction {
  const normalized = request.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (/^(deixe|deixar|torne|tornar|compacte|compactar|reduza|reduzir|diminua).*\b(compact|espac|tabela|margem)/.test(normalized) ||
      /^mais compacto[.!]?$/i.test(normalized)) return 'compact';
  if (/^(desfaca|desfazer|voltar (a )?(ultima|ultima alteracao)|undo)\b/.test(normalized)) return 'undo';
  if (/^(refaca|refazer|redo)\b/.test(normalized)) return 'redo';
  if (/^(abra|abrir|mostre|mostrar|revisar|revisao|gerar|exportar).*\b(pdf|publicac|impress)/.test(normalized)) return 'publication';
  if (/^(abrir|abra|mostrar|mostre|editar|edite).*\b(editor|manual|edicao)/.test(normalized)) return 'editor';
  return 'help';
}
export function dialogueKey(documentId: string, ownerScope?: string): string {
  const id = z.string().uuid().parse(documentId);
  // A shared device must never display one account's local messages to another.
  const account = ownerScope ? z.string().min(1).max(256).parse(ownerScope) : null;
  return WORKBENCH_STORAGE_PREFIX + (account ? encodeURIComponent(account) + ':' : '') + id;
}
export function readWorkbenchDialogue(storage: Pick<Storage, 'getItem'>, documentId: string, ownerScope?: string): WorkbenchEntry[] {
  try {
    const raw = storage.getItem(dialogueKey(documentId, ownerScope));
    if (!raw || raw.length > 1_500_000) return [];
    const record = TranscriptSchema.parse(JSON.parse(raw));
    if (record.documentId !== documentId) return [];
    return record.entries;
  } catch { return []; }
}
export function appendWorkbenchDialogue(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  documentId: string,
  previous: readonly WorkbenchEntry[],
  next: WorkbenchEntry,
  ownerScope?: string,
): WorkbenchEntry[] {
  if (previous.length >= WORKBENCH_MESSAGE_LIMIT) throw new Error('DIALOGUE_CAP_REACHED_EXPORT_FIRST');
  const content = redactConversationMessage(next.content);
  const safe = WorkbenchEntrySchema.parse({ ...next, content });
  const entries = [...previous, safe];
  storage.setItem(dialogueKey(documentId, ownerScope), JSON.stringify(
    TranscriptSchema.parse({ version: 1, documentId, entries })));
  return entries;
}

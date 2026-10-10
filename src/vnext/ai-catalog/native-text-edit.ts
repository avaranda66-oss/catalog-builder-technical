import { z } from 'zod';
import type { DocumentSession } from '../application';
import type { RichText } from '../domain';

/**
 * Deliberately narrow: selected, single-line editorial prose only.
 * It does NOT approve changes to engineering figures, model codes, tables,
 * images, multi-span formatted paragraphs, or citations.
 */
function safeEditorialText(value: string): boolean {
  if (!value.trim() || value.length > 400) return false;
  if ([...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return false;
  // Numbers and model identifiers are engineering claims unless source-reviewed.
  // Do not try to reason about them with an unconstrained language model.
  if (/\p{Number}/u.test(value)) return false;
  if (/<\/?(?:script|img|iframe|style)\b/i.test(value)) return false;
  return true;
}
const editorial = z.string().trim().min(3).max(400).refine(safeEditorialText, 'EDITORIAL_ONLY_NO_NUMBERS');
const id = z.string().uuid();
const TurnSchema = z.object({ role: z.enum(['user','assistant']),
  message: z.string().min(1).max(800) }).strict();
export const NativeTextEditRequestSchema = z.object({
  version: z.literal(1), task: z.literal('revise_selected_text'),
  message: z.string().trim().min(8).max(1200),
  history: z.array(TurnSchema).max(8),
  target: z.object({ objectId: id, text: editorial }).strict(),
}).strict();
export type NativeTextEditRequest = z.infer<typeof NativeTextEditRequestSchema>;
export const NativeTextEditReplySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('proposal'), revisedText: editorial }).strict(),
  z.object({ status: z.literal('clarification'),
    question: z.string().trim().min(8).max(250) }).strict(),
]);
export type NativeTextEditReply = z.infer<typeof NativeTextEditReplySchema>;
export type NativeTextEditGateway = (request: NativeTextEditRequest) => Promise<unknown>;
export interface SelectedEditorialText {
  readonly objectId: string;
  readonly text: RichText;
  readonly locked?: boolean;
}

/** Reject multi-inline/marked text: rewriting it could destroy formatting. */
export function plainSelectedEditorialText(target: SelectedEditorialText): string | null {
  if (target.locked || target.text.paragraphs.length !== 1) return null;
  const paragraph = target.text.paragraphs[0];
  if (paragraph.inlines.length !== 1) return null;
  const inline = paragraph.inlines[0];
  if (inline.kind !== 'text' || inline.marks.length) return null;
  return safeEditorialText(inline.text) ? inline.text : null;
}
export function prepareNativeTextEditRequest(
  target: SelectedEditorialText, message: string,
  history: NativeTextEditRequest['history'] = [],
): NativeTextEditRequest {
  const original = plainSelectedEditorialText(target);
  if (!original) throw new Error('SELECTED_TEXT_REQUIRES_MANUAL_REVIEW');
  return NativeTextEditRequestSchema.parse({
    version: 1, task: 'revise_selected_text', message,
    history: history.slice(-8), target: { objectId: target.objectId, text: original },
  });
}
export async function proposeNativeTextEdit(
  target: SelectedEditorialText, message: string, gateway: NativeTextEditGateway,
  history: NativeTextEditRequest['history'] = [],
): Promise<NativeTextEditReply> {
  return NativeTextEditReplySchema.parse(
    await gateway(prepareNativeTextEditRequest(target, message, history)));
}
/** Real canonical CAS text action, never an AI-mutated DOM node. */
export function applyNativeTextEdit(
  session: DocumentSession, target: SelectedEditorialText,
  rawReply: unknown, expectedRevision: number,
): { newRevision: number; before: string; after: string } {
  const reply = NativeTextEditReplySchema.parse(rawReply);
  if (reply.status !== 'proposal') throw new Error('TEXT_EDIT_NOT_PROPOSAL');
  const before = plainSelectedEditorialText(target);
  if (!before) throw new Error('SELECTED_TEXT_REQUIRES_MANUAL_REVIEW');
  const snapshot = session.getSnapshot();
  if (snapshot.localSequence !== expectedRevision) throw new Error('TEXT_EDIT_STALE_REVISION');
  const current = snapshot.document.pages.flatMap(p => p.objects)
    .find(o => o.id === target.objectId);
  if (!current || current.type !== 'text' || current.locked ||
      JSON.stringify(current.text) !== JSON.stringify(target.text)) {
    throw new Error('TEXT_EDIT_TARGET_CHANGED');
  }
  if (reply.revisedText === before) throw new Error('TEXT_EDIT_NO_CHANGE');
  const result = session.execute({
    type: 'text.setContent', objectId: current.id,
    expectedText: current.text, plainText: reply.revisedText,
  });
  if (!result.ok) throw new Error('TEXT_EDIT_CANONICAL_ACTION_FAILED');
  return { newRevision: session.getSnapshot().localSequence, before, after: reply.revisedText };
}

import { z } from 'zod';
import type { TechnicalInput } from './contracts';
import { CatalogPlanSchema, type CatalogPlan } from './composition';

/**
 * The model may plan presentation, never author engineering facts or arbitrary
 * document commands. The compiler remains the only source of editorial objects.
 */
const id = z.string().regex(/^[a-z0-9-]{1,40}$/);
const label = z.string().min(1).max(100);
export const CatalogAgentRequestSchema = z.object({
  version: z.literal(1),
  task: z.literal('plan_catalog'),
  message: z.string().trim().min(4).max(800),
  sections: z.array(z.object({ id, title: label }).strict()).min(1).max(6),
  models: z.array(label).min(2).max(4),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.sections.map(section => section.id)).size !== value.sections.length) {
    ctx.addIssue({ code: 'custom', path: ['sections'], message: 'Duplicate section' });
  }
});
export type CatalogAgentRequest = z.infer<typeof CatalogAgentRequestSchema>;

export const CatalogAgentReplySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('proposal'), plan: CatalogPlanSchema }).strict(),
  z.object({ status: z.literal('clarification'), question: z.string().trim().min(5).max(250) }).strict(),
]);
export type CatalogAgentReply = z.infer<typeof CatalogAgentReplySchema>;

export function prepareCatalogAgentRequest(input: TechnicalInput, message: string): CatalogAgentRequest {
  // Only metadata is sent for layout planning. Never send specification values,
  // document bytes, source quotations or local storage contents on this route.
  return CatalogAgentRequestSchema.parse({
    version: 1,
    task: 'plan_catalog',
    message,
    sections: input.sections.map(section => ({ id: section.id, title: section.title })),
    models: input.models,
  });
}

export function verifyCatalogAgentReply(request: CatalogAgentRequest, untrusted: unknown): CatalogAgentReply {
  const reply = CatalogAgentReplySchema.parse(untrusted);
  if (reply.status === 'clarification') return reply;
  const expected = new Set(request.sections.map(section => section.id));
  const actual = reply.plan.sectionOrder;
  if (actual.length !== expected.size || new Set(actual).size !== actual.length ||
    actual.some(id => !expected.has(id))) throw new Error('AI_PLAN_SECTION_COVERAGE');
  return reply;
}

export type CatalogAgentGateway = (request: CatalogAgentRequest) => Promise<unknown>;
export async function proposeCatalogPlan(
  input: TechnicalInput, message: string, gateway: CatalogAgentGateway
): Promise<CatalogAgentReply> {
  const request = prepareCatalogAgentRequest(input, message);
  const raw = await gateway(request);
  return verifyCatalogAgentReply(request, raw);
}

/** Usage estimate is descriptive, not a substitute for server-side quota enforcement. */
export const GEMINI_PLANNER_MODEL = 'gemini-3.5-flash-lite';
export function estimatePlannerCostUsd(inputTokens: number, outputTokens: number): number {
  if (![inputTokens, outputTokens].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new RangeError('INVALID_TOKEN_USAGE');
  }
  // Google AI Developer API paid Standard rate, checked 2026-10-09.
  return (inputTokens * 0.30 + outputTokens * 2.50) / 1_000_000;
}

export function resolvedPlan(reply: CatalogAgentReply): CatalogPlan | undefined {
  return reply.status === 'proposal' ? reply.plan : undefined;
}

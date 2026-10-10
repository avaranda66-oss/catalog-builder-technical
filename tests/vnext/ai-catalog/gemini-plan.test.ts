import { describe, expect, it } from 'vitest';
import { createSyntheticSpecifications } from '../../../src/vnext/ai-catalog/fixture';
import {
  CatalogAgentRequestSchema, estimatePlannerCostUsd, prepareCatalogAgentRequest,
  proposeCatalogPlan, verifyCatalogAgentReply,
} from '../../../src/vnext/ai-catalog/gemini-plan';

describe('Catalog agent safe planning contract', () => {
  const plan = (sections: string[]) => ({
    version: 1, template: 'comparison-a4-v1', style: 'comparison',
    sectionOrder: sections, rowsPerPage: 8,
  });

  it('sends only minimal presentation metadata, excluding engineering facts and source passages', async () => {
    const input = await createSyntheticSpecifications();
    const request = prepareCatalogAgentRequest(input, 'Compare os modelos e organize as seÃ§Ãµes.');
    const serialized = JSON.stringify(request);
    expect(request.task).toBe('plan_catalog');
    expect(request.sections).toHaveLength(input.sections.length);
    expect(serialized).not.toContain('Â±0,0100%');
    expect(serialized).not.toContain('pages');
    expect(serialized).not.toContain('sha256');
  });
  it('rejects commands, credentials and arbitrary extra fields', () => {
    const input = {
      version: 1, task: 'plan_catalog', message: 'Crie uma ficha tÃ©cnica.',
      sections: [{ id: 'thermal', title: 'TÃ©rmica' }], models: ['A', 'B'],
      apiKey: 'DO_NOT_ACCEPT',
    };
    expect(CatalogAgentRequestSchema.safeParse(input).success).toBe(false);
  });
  it('accepts full, strictly allowlisted coverage and preserves order', async () => {
    const input = await createSyntheticSpecifications();
    const sections = input.sections.map(section => section.id);
    const reply = await proposeCatalogPlan(input, 'Comece pela parte elÃ©trica.', async () => ({
      status: 'proposal', plan: plan([...sections].reverse()),
    }));
    expect(reply.status).toBe('proposal');
    if (reply.status === 'proposal') expect(reply.plan.sectionOrder).toEqual([...sections].reverse());
  });
  it('rejects invented, missing and duplicated section IDs', async () => {
    const input = await createSyntheticSpecifications();
    const request = prepareCatalogAgentRequest(input, 'Compare os modelos.');
    const sections = request.sections.map(x => x.id);
    expect(() => verifyCatalogAgentReply(request, { status: 'proposal', plan: plan(['invented', ...sections.slice(1)]) })).toThrow();
    expect(() => verifyCatalogAgentReply(request, { status: 'proposal', plan: plan([sections[0]]) })).toThrow();
    expect(() => verifyCatalogAgentReply(request, { status: 'proposal', plan: plan([sections[0], sections[0]]) })).toThrow();
  });
  it('rejects unsupported template, freeform HTML and model-provided actions', async () => {
    const input = await createSyntheticSpecifications();
    const request = prepareCatalogAgentRequest(input, 'Compare os modelos.');
    const sections = request.sections.map(x => x.id);
    expect(() => verifyCatalogAgentReply(request, { status: 'proposal', plan: { ...plan(sections), template: 'arbitrary-html' } })).toThrow();
    expect(() => verifyCatalogAgentReply(request, { status: 'proposal', plan: plan(sections), code: '<script>bad</script>' })).toThrow();
  });
  it('allows safe clarification without applying any edits', async () => {
    const input = await createSyntheticSpecifications();
    const answer = await proposeCatalogPlan(input, 'Crie uma ficha.', async () => ({
      status: 'clarification', question: 'VocÃª prefere iniciar pelas especificaÃ§Ãµes elÃ©tricas?',
    }));
    expect(answer).toMatchObject({ status: 'clarification' });
  });
  it('estimates capped token usage without network requests', () => {
    expect(estimatePlannerCostUsd(1000, 500)).toBeCloseTo(0.00155);
    expect(() => estimatePlannerCostUsd(-1, 500)).toThrow();
  });
});

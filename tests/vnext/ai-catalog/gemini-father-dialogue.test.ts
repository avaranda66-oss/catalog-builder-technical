import { describe, expect, it } from 'vitest';
import { createSyntheticSpecifications } from '../../../src/vnext/ai-catalog/fixture';
import { reviewIssues, type Decisions } from '../../../src/vnext/ai-catalog/contracts';
import { approveGeneration, assertGeneratedIntegrity, compileCatalog } from '../../../src/vnext/ai-catalog/composition';
import { proposeCatalogPlan } from '../../../src/vnext/ai-catalog/gemini-plan';

const fatherRequests = [
  'Monte para mim uma ficha profissional comparando os tres instrumentos.',
  'Organize as tabelas primeiro pelas especificacoes eletricas.',
  'Crie o documento em um estilo tecnico limpo e facil de imprimir.',
];

describe('Father-style natural language interactions with a mock Gemini response', () => {
  it.each(fatherRequests)('builds a source-validated canonical document from: %s', async message => {
    const input = await createSyntheticSpecifications();
    const order = input.sections.map(s => s.id);
    const reply = await proposeCatalogPlan(input, message, async () => ({
      status: 'proposal',
      plan: { version: 1, template: 'comparison-a4-v1',
        style: message.includes('limpo') ? 'technical-specification' : 'comparison',
        sectionOrder: message.includes('eletricas') ? [...order].reverse() : order,
        rowsPerPage: 8 },
    }));
    expect(reply.status).toBe('proposal');
    if (reply.status !== 'proposal') throw new Error('MISSING_PLAN');
    const decisions: Decisions = {};
    for (const item of reviewIssues(input, {})) {
      decisions[item.id] = item.fact.status === 'missing' ? 'missing' : 0;
    }
    const built = await compileCatalog(input, reply.plan, decisions);
    const trace = assertGeneratedIntegrity(built);
    expect(trace.length).toBeGreaterThanOrEqual(35);
    expect(built.document.pages.length).toBeGreaterThanOrEqual(2);
    expect(await approveGeneration(built)).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects a fabricated model plan with technical value editing instructions', async () => {
    const input = await createSyntheticSpecifications();
    await expect(proposeCatalogPlan(input, 'Atualize as tolerancias sem consultar fontes.', async request => ({
      status: 'proposal',
      plan: { version: 1, template: 'comparison-a4-v1', style: 'comparison',
        sectionOrder: request.sections.map(s => s.id), rowsPerPage: 8 },
      editEngineeringValues: { pressure: '999 bar' },
    }))).rejects.toThrow();
  });
});

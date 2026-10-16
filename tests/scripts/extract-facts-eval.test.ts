import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GroundTruthSchema, SpikePlanSchema, estimateCostUsd, judgeValue, parseCliArgs, summarizeAgainstTruth, type GroundTruth,
} from '../../scripts/extract-facts-eval';
import type { SourceFactValue } from '../../src/vnext/ai-catalog/fact-extraction';

const truth: GroundTruth = GroundTruthSchema.parse({
  version: 1, checkedOn: '2026-10-15', method: 'teste',
  sources: [
    { sourceId: 'ta-folder', file: 'f.pdf', sha256: 'a'.repeat(64), coveredPages: [9, 10], models: ['TA-25N', 'TA-35N'] },
    { sourceId: 'y17', file: 'y.pdf', sha256: 'b'.repeat(64), coveredPages: [11], models: ['PCON-Y17'] },
  ],
  rows: [
    { sourceId: 'ta-folder', page: 9, row: 'electric-power', labels: ['Electric Power'], unit: 'W', values: { 'TA-25N': '200', 'TA-35N': '300' } },
    { sourceId: 'ta-folder', page: 9, row: 'heating-time', labels: ['Heating Time'], unit: 'min', condition: '25 °C to 140 °C',
      values: { 'TA-25N': '10', 'TA-35N': '16' } },
    { sourceId: 'ta-folder', page: 9, row: 'axial-uniformity', labels: ['Axial Uniformity Dry Block'], values: { 'TA-25N': '± 0.05' } },
    { sourceId: 'ta-folder', page: 9, row: 'radial-uniformity', labels: ['Radial Uniformity Dry Block'], values: { 'TA-25N': '± 0.01' } },
    { sourceId: 'y17', page: 11, row: 'weight', labels: ['Weight'], unit: 'kg', variant: ['DT'], values: { 'PCON-Y17': '6.2' } },
    { sourceId: 'y17', page: 11, row: 'weight', labels: ['Weight'], unit: 'kg', variant: ['RM'], values: { 'PCON-Y17': '8.5' } },
  ],
});
const value = (overrides: Partial<SourceFactValue>): SourceFactValue => ({
  sourceId: 'ta-folder', model: 'TA-25N', key: 'electric-power', label: 'Electric Power:', value: '200', unit: 'W', condition: '',
  page: 9, quote: 'Electric Power: 200 W 300 W', status: 'VERIFIED_TEXT', ...overrides,
});

describe('extraction spike: answer key comparison', () => {
  it('accepts the printed figures and rejects another model\'s figures', () => {
    expect(judgeValue(value({}), truth)).toMatchObject({ verdict: 'CORRECT', row: 'electric-power' });
    expect(judgeValue(value({ value: '300' }), truth)).toMatchObject({ verdict: 'WRONG', expected: ['200'] });
  });

  it('accepts a value that keeps its printed condition, but not another model\'s condition', () => {
    const heating = { key: 'heating-time', label: 'Heating Time', unit: '' };
    expect(judgeValue(value({ ...heating, value: '10 min (25 °C to 140 °C)' }), truth).verdict).toBe('CORRECT');
    expect(judgeValue(value({ ...heating, value: '10', unit: 'min', condition: '25 °C to -25 °C' }), truth))
      .toMatchObject({ verdict: 'WRONG', note: 'condição diferente do gabarito' });
  });

  it('tells rows with shared words apart and flags a wrong unit', () => {
    expect(judgeValue(value({ key: 'radial-uniformity', label: 'Radial Uniformity Dry Block:', value: '± 0.01', unit: '°C' }), truth).verdict)
      .toBe('CORRECT');
    expect(judgeValue(value({ key: 'x', label: 'Axial Uniformity Dry Block', value: '± 0.01', unit: '' }), truth).verdict).toBe('WRONG');
    expect(judgeValue(value({ unit: 'kW' }), truth)).toMatchObject({ verdict: 'WRONG', note: 'unidade diferente do gabarito' });
  });

  it('sends what the key cannot place to a person', () => {
    expect(judgeValue(value({ page: 12 }), truth).verdict).toBe('UNMATCHED');
    expect(judgeValue(value({ model: 'TA-50N' }), truth).note).toBe('modelo fora do gabarito');
    expect(judgeValue(value({ key: 'warranty', label: 'Warranty' }), truth).note).toBe('linha não encontrada no gabarito');
    expect(judgeValue(value({ sourceId: 'other' }), truth).note).toBe('arquivo sem gabarito');
  });

  it('calls a value cited on a covered page where its row is not printed wrong', () => {
    expect(judgeValue(value({ page: 10 }), truth)).toMatchObject({ verdict: 'WRONG', note: 'esta linha está na página 9' });
  });

  it('needs the version (DT/RM) for rows with versions', () => {
    const weight = { sourceId: 'y17', model: 'PCON-Y17', key: 'weight', label: 'Weight', unit: 'kg', page: 11 };
    expect(judgeValue(value({ ...weight, value: '6.2', condition: 'DT Version' }), truth).verdict).toBe('CORRECT');
    expect(judgeValue(value({ ...weight, value: '6.2', condition: 'RM Version' }), truth).verdict).toBe('WRONG');
    expect(judgeValue(value({ ...weight, value: '6.2' }), truth).note).toBe('valor certo, mas não diz de qual versão é');
  });

  it('counts wrong verified values (the go/no-go number), caught errors and coverage', () => {
    const summary = summarizeAgainstTruth([
      value({}), value({ model: 'TA-35N', value: '200' }), value({ model: 'TA-35N', value: '300', status: 'UNVERIFIED' }),
      value({ page: 12 }), value({ key: 'axial-uniformity', label: 'Axial Uniformity Dry Block', value: '± 0.06', status: 'VISUAL_ONLY' }),
    ], truth, ['ta-folder']);
    expect(summary.wrongVerified.map(item => item.value.model)).toEqual(['TA-35N']);
    expect(summary.unmatchedVerified).toHaveLength(1);
    expect(summary.wrongCaught).toHaveLength(1);
    expect(summary.coverage).toEqual({ positions: 6, verified: 1, anyStatus: 2 });
    expect(summary.byStatus.VERIFIED_TEXT).toEqual({ CORRECT: 1, WRONG: 1, UNMATCHED: 1 });
  });
});

describe('extraction spike: cost, options and committed plan', () => {
  it('prices input and output (thinking included) per million tokens', () => {
    expect(estimateCostUsd('gemini-3.5-flash-lite', { promptTokenCount: 1_000_000, candidatesTokenCount: 400_000, thoughtsTokenCount: 600_000 }))
      .toBeCloseTo(0.30 + 2.50);
    expect(estimateCostUsd('gemini-3.8-flash', { promptTokenCount: 10_000, candidatesTokenCount: 2_000 })).toBeCloseTo(0.0075 + 0.0075);
    expect(estimateCostUsd('outro-modelo', { promptTokenCount: 1 })).toBeUndefined();
  });

  it('parses the command line and refuses unknown or incomplete options', () => {
    expect(parseCliArgs(['--plan', 'p.json', '--out', 'o', '--replay', '--only', 'a,b', '--concurrency', '3'])).toEqual({
      plan: 'p.json', out: 'o', replay: true, dryRun: false, concurrency: 3, only: ['a', 'b'] });
    expect(() => parseCliArgs(['--plan', 'p.json'])).toThrow('Use:');
    expect(() => parseCliArgs(['--plan', 'p.json', '--out', 'o', '--key', 'x'])).toThrow('Opção desconhecida');
    expect(() => parseCliArgs(['--plan', '--out', 'o'])).toThrow('Falta o valor');
    expect(() => parseCliArgs(['--plan', 'p', '--out', 'o', '--concurrency', '9'])).toThrow('--concurrency');
  });

  it('keeps the committed plan and the hand-checked answer key valid (at least 30 checked values)', () => {
    const plan = SpikePlanSchema.parse(JSON.parse(readFileSync('docs/ai-catalog/spike-extracao/plan.json', 'utf8')));
    expect(plan.llms.map(llm => llm.id)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash']);
    const key = GroundTruthSchema.parse(JSON.parse(readFileSync(plan.truth!, 'utf8')));
    const positions = key.rows.reduce((sum, row) => sum + Object.keys(row.values).length, 0);
    expect(positions).toBeGreaterThanOrEqual(30);
    expect(new Set(key.sources.map(source => source.sourceId))).toEqual(new Set(plan.sources.map(source => source.id)));
  });
});

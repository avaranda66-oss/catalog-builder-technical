import { describe, expect, it } from 'vitest';
import { ControlledTranslationProvider } from '@/vnext/translation/provider-client';
import { TranslationFoundationService } from '@/vnext/translation/service';
import { extractSemanticTranslationCoverage } from '@/vnext/translation/semantic-leaves';
import { materializeTranslationCandidate, requireReviewText } from '@/vnext/translation/candidate';
import { protectTechnicalTokens, technicalProtectionNamespace } from '@/vnext/translation/technical-token-protector';
import { P2_TECHNICAL_BENCHMARK, createP2TechnicalBenchmark } from './p2-technical-benchmark-fixture';

describe('P2 technical benchmark — controlled structural evidence, not live Gemini quality', () => {
  for (const targetLocale of ['es-ES', 'en-US'] as const) {
    it(targetLocale + ': preserves topology, all technical values, exclusions and the original', async () => {
      const source = createP2TechnicalBenchmark();
      const original = structuredClone(source);
      const coverage = await extractSemanticTranslationCoverage(source);
      const replacements = new Map<string, string>();
      for (const leaf of coverage.eligible) for (const run of leaf.runs) {
        const reference = P2_TECHNICAL_BENCHMARK.find(item => item.source === run.text);
        if (!reference) continue;
        const namespace = await technicalProtectionNamespace(leaf.leafId, run.runId);
        const protectedSource = protectTechnicalTokens(run.text, namespace);
        const protectedReference = protectTechnicalTokens(reference[targetLocale], namespace);
        expect(protectedReference.tokens.map(item => item.value)).toEqual(protectedSource.tokens.map(item => item.value));
        replacements.set(protectedSource.protectedText, protectedReference.protectedText);
      }
      const provider = new ControlledTranslationProvider(request => ({
        contractVersion: request.contractVersion, profileVersion: request.profileVersion,
        requestId: request.requestId, targetLocale: request.targetLocale,
        provider: { providerId: 'gemini', modelId: 'gemini-2.5-flash' },
        units: request.units.map(unit => ({ unitId: unit.unitId, runs: unit.runs.map(run => ({
          runId: run.runId, translatedText: replacements.get(run.protectedText) ?? run.protectedText,
        })) })),
      }));
      const result = await new TranslationFoundationService(provider).translateCatalog(source, targetLocale);
      const candidate = await materializeTranslationCandidate(source, result);
      expect(candidate.document.locale).toBe(targetLocale);
      expect(source).toEqual(original);
      expect(candidate.document.assets).toEqual(original.assets);
      expect(candidate.document.style).toEqual(original.style);
      expect(candidate.document.pages.map(page => [page.id, page.widthMm, page.heightMm])).toEqual(
        original.pages.map(page => [page.id, page.widthMm, page.heightMm]));
      for (const item of P2_TECHNICAL_BENCHMARK) {
        const run = candidate.runs.find(run => run.sourceText === item.source);
        expect(run?.translatedText).toBe(item[targetLocale]);
        expect(() => requireReviewText(item.source, run!.translatedText)).not.toThrow();
      }
      const originalTable = original.pages[0].objects.find(object => object.type === 'table');
      const candidateTable = candidate.document.pages[0].objects.find(object => object.type === 'table');
      if (originalTable?.type !== 'table' || candidateTable?.type !== 'table') throw new Error('Missing table');
      expect(candidateTable.frame).toEqual(originalTable.frame);
      expect(candidateTable.table.style).toEqual(originalTable.table.style);
      expect(candidateTable.table.columns).toEqual(originalTable.table.columns);
      expect(candidateTable.table.rows).toEqual(originalTable.table.rows);
      expect(candidateTable.table.cells.filter(cell => cell.content.type !== 'richText')).toEqual(
        originalTable.table.cells.filter(cell => cell.content.type !== 'richText'));
      for (let index = 0; index < original.pages.length; index++) {
        expect(candidate.document.pages[index].objects.map(object => [object.id, object.type, object.frame, object.zIndex]))
          .toEqual(original.pages[index].objects.map(object => [object.id, object.type, object.frame, object.zIndex]));
      }
      const sourceText = original.pages[0].objects.find(object => object.type === 'text');
      const targetText = candidate.document.pages[0].objects.find(object => object.type === 'text');
      if (sourceText?.type !== 'text' || targetText?.type !== 'text') throw new Error('Missing text');
      const topology = (text: typeof sourceText.text) => text.paragraphs.map(paragraph => [
        paragraph.id, paragraph.list, paragraph.inlines.map(run => run.kind === 'text' ? [run.id, run.kind, run.marks] : run),
      ]);
      expect(topology(targetText.text)).toEqual(topology(sourceText.text));
    });

    it(targetLocale + ': changing numbers, units, codes, standards, protocols or symbols fails closed', () => {
      const mutations = [
        ['±0,05 % FS', '±0,50 % FS'], ['100 Ω', '100 V'], ['TA-25N', 'TA-35N'],
        ['IEC 61010-1', 'IEC 61010-2'], ['TCP/IP', 'HTTP'], ['µA', 'mA'], ['°C', '°F'],
      ] as const;
      for (const [before, after] of mutations) {
        const source = P2_TECHNICAL_BENCHMARK.find(item => item.source.includes(before));
        if (!source) throw new Error('Mutation source missing');
        expect(() => requireReviewText(source.source, source[targetLocale].replace(before, after))).toThrow();
      }
    });
  }

  it('has explicit linguistic reference criteria separate from structural token assertions', () => {
    // These reviewed examples/rubric are benchmark references, not a statistical quality score.
    expect(P2_TECHNICAL_BENCHMARK.every(item => item.meaning && item['es-ES'] && item['en-US'])).toBe(true);
    expect(P2_TECHNICAL_BENCHMARK[1]['en-US']).toContain('expanded uncertainty');
    expect(P2_TECHNICAL_BENCHMARK[5]['en-US']).toContain('Unconfirmed');
    expect(P2_TECHNICAL_BENCHMARK[5]['es-ES']).toContain('no confirmados');
  });
});

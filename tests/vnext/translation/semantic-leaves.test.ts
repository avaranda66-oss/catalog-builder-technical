import { describe, expect, it } from 'vitest';
import { validateDocument, type CatalogDocument } from '@/vnext';
import {
  TranslationFoundationError,
  extractSemanticTranslationCoverage,
} from '@/vnext/translation';
import { createW5ATranslationDocument } from './w5a-fixture';

describe('W5.A canonical semantic translation leaves', () => {
  it('enumerates the complete canonical minimum across the entire catalog and Group descendants', async () => {
    const document = createW5ATranslationDocument();
    expect(validateDocument(document).filter((diagnostic) => diagnostic.severity === 'ERROR')).toEqual([]);

    const coverage = await extractSemanticTranslationCoverage(document);
    expect(coverage.complete).toBe(true);
    expect(coverage.sourceCatalogId).toBe(document.id);
    expect(coverage.sourceLocale).toBe('pt-BR');
    expect(coverage.eligible).toHaveLength(9);

    expect(coverage.eligible.map((leaf) => leaf.kind)).toEqual([
      'catalogTitle',
      'textObject',
      'tableTitle',
      'tableCell',
      'tableAnnotation',
      'tableAnnotation',
      'tableAnnotation',
      'tableLegend',
      'textObject',
    ]);
    expect(coverage.eligible.find((leaf) => leaf.locator.kind === 'textObject' && leaf.locator.objectId === 'w5a-group-text'))
      .toBeDefined();
    expect(coverage.eligible.find((leaf) => leaf.locator.kind === 'tableAnnotation' && leaf.context === 'Table caption'))
      .toBeDefined();
    expect(coverage.eligible.find((leaf) => leaf.locator.kind === 'tableAnnotation' && leaf.context === 'Table note'))
      .toBeDefined();
    expect(coverage.eligible.find((leaf) => leaf.locator.kind === 'tableAnnotation' && leaf.context === 'Table footnote'))
      .toBeDefined();
  });

  it('explicitly excludes typed technical surfaces, AssetRef.alt, and non-text primitives', async () => {
    const document = createW5ATranslationDocument();
    const coverage = await extractSemanticTranslationCoverage(document);
    const reasons = coverage.excluded.map((surface) => surface.reason);

    for (const expected of [
      'asset-alt',
      'technical-code',
      'measurement',
      'marker',
      'image-cell',
      'empty-cell',
      'image-object',
      'shape',
      'line',
      'group-container',
      'icon-object',
    ] as const) {
      expect(reasons).toContain(expected);
    }

    const providerEligibleText = coverage.eligible.flatMap((leaf) => leaf.runs.map((run) => run.text)).join('\n');
    expect(providerEligibleText).not.toContain('ALT IMUTÁVEL NÃO TRADUZIR');
    expect(providerEligibleText).not.toContain('PCON-Y18');
    expect(coverage.excluded.find((surface) => surface.surfaceId === 'cell:w5a-cell-code')?.reason).toBe('technical-code');
    expect(coverage.excluded.find((surface) => surface.surfaceId === 'cell:w5a-cell-measure')?.reason).toBe('measurement');
    expect(coverage.excluded.find((surface) => surface.surfaceId === 'cell:w5a-cell-marker')?.reason).toBe('marker');
  });

  it('preserves RichText identity, marks, lists, line breaks, and the source document byte-for-byte', async () => {
    const document = createW5ATranslationDocument();
    const before = JSON.stringify(document);
    const original = document.pages[0].objects.find((object) => object.id === 'w5a-text-main');
    if (original?.type !== 'text') throw new Error('Missing W5.A Text fixture');

    const coverage = await extractSemanticTranslationCoverage(document);
    const leaf = coverage.eligible.find((candidate) => candidate.locator.kind === 'textObject' && candidate.locator.objectId === original.id);
    expect(leaf?.runs.map((run) => ({ paragraphId: run.paragraphId, runId: run.runId, marks: run.marks }))).toEqual([
      { paragraphId: 'w5a-text-rich:p1', runId: 'w5a-text-rich:t1', marks: ['bold'] },
      { paragraphId: 'w5a-text-rich:p1', runId: 'w5a-text-rich:t2', marks: ['italic'] },
      { paragraphId: 'w5a-text-rich:p1', runId: 'w5a-text-rich:t3', marks: [] },
      { paragraphId: 'w5a-text-rich:p2', runId: 'w5a-text-rich:t4', marks: ['subscript'] },
    ]);
    expect(JSON.stringify(document)).toBe(before);
    expect(original.text.paragraphs[0].inlines[2]).toEqual({ kind: 'lineBreak', id: 'w5a-text-rich:br1' });
    expect(original.text.paragraphs[1].list).toEqual({ kind: 'unordered', level: 1 });
  });

  it('hashes the same unchanged source deterministically and changes the hash on relevant text mutation', async () => {
    const source = createW5ATranslationDocument();
    const first = await extractSemanticTranslationCoverage(source);
    const second = await extractSemanticTranslationCoverage(source);
    expect(second.eligible.map((leaf) => leaf.sourceHash)).toEqual(first.eligible.map((leaf) => leaf.sourceHash));

    const changed = structuredClone(source);
    const text = changed.pages[0].objects.find((object) => object.id === 'w5a-text-main');
    if (text?.type !== 'text') throw new Error('Missing W5.A Text fixture');
    const inline = text.text.paragraphs[0].inlines[0];
    if (inline.kind !== 'text') throw new Error('Missing W5.A text run');
    inline.text = 'Conteúdo alterado';

    const changedCoverage = await extractSemanticTranslationCoverage(changed);
    const beforeLeaf = first.eligible.find((leaf) => leaf.locator.kind === 'textObject' && leaf.locator.objectId === 'w5a-text-main');
    const afterLeaf = changedCoverage.eligible.find((leaf) => leaf.locator.kind === 'textObject' && leaf.locator.objectId === 'w5a-text-main');
    expect(afterLeaf?.leafId).toBe(beforeLeaf?.leafId);
    expect(afterLeaf?.sourceHash).not.toBe(beforeLeaf?.sourceHash);
  });

  it('fails closed when a future canonical object surface is not classified', async () => {
    const source = createW5ATranslationDocument();
    const corrupted = structuredClone(source) as unknown as {
      pages: Array<{ objects: Array<Record<string, unknown>> }>;
    };
    corrupted.pages[0].objects.push({
      id: 'future-text-object',
      type: 'futureText',
      frame: { xMm: 1, yMm: 1, widthMm: 10, heightMm: 10 },
      zIndex: 99,
      text: 'future surface',
    });

    await expect(
      extractSemanticTranslationCoverage(corrupted as unknown as CatalogDocument)
    ).rejects.toEqual(expect.objectContaining<Partial<TranslationFoundationError>>({
      code: 'UNCLASSIFIED_TEXT_SURFACE',
    }));
  });

  it('fails closed when a known translation-sensitive shape gains an unclassified future field', async () => {
    const source = createW5ATranslationDocument();
    const evolved = structuredClone(source) as unknown as {
      pages: Array<{ objects: Array<Record<string, unknown>> }>;
    };
    const text = evolved.pages[0].objects.find((object) => object.id === 'w5a-text-main');
    if (!text) throw new Error('Missing W5.A Text fixture');
    text.futureCaption = {
      paragraphs: [{
        id: 'future-caption:p',
        inlines: [{ kind: 'text', id: 'future-caption:t', text: 'Novo texto canônico', marks: [] }],
      }],
    };

    await expect(
      extractSemanticTranslationCoverage(evolved as unknown as CatalogDocument)
    ).rejects.toEqual(expect.objectContaining<Partial<TranslationFoundationError>>({
      code: 'UNCLASSIFIED_TEXT_SURFACE',
    }));
  });
});

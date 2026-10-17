import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { compileCatalog, generationReviewNotes, mockCatalogPlan, planMockRequest } from '@/vnext/ai-catalog/composition';
import { createSyntheticSpecifications } from '@/vnext/ai-catalog/fixture';
import { parseCanonicalDocument } from '@/vnext/application';
import { instantiatePageWithFreshIds } from '@/vnext/application/document';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { W2E_PAGE_TEMPLATE } from '@/vnext/app/page-template-fixtures';
import type { AssetRef, CatalogDocument } from '@/vnext/domain';
import { createDefaultCatalogStarterRegistry } from '@/vnext/library';
import { buildPresysArchetypePage, PRESYS_ARCHETYPES, presysDocumentStyle } from '@/vnext/library/presys-archetypes';
import { createPresysPageTemplateRegistry, createPresysStarterDocument, PRESYS_STARTER, PRESYS_STARTER_REVIEW_NOTES } from '@/vnext/library/presys-ta25n-starter';
import { compilePlans, DocumentRenderer } from '@/vnext/rendering';

afterEach(cleanup);

/** FR-81: review, provenance and demonstration wording that must never reach a printed page. */
const FORBIDDEN: readonly RegExp[] = [
  /MATERIAL SINTÉTICO/i, /sintétic/i, /de teste/i, /demonstra/i, /\bvalide\b/i, /antes de publicar/i, /conferir dados/i,
  /revisão humana/i, /\bhash/i, /fixture/i, /\bfontes?\s*:/i, /fontes presys/i, /parcialmente preenchido/i,
  /estudo de catálogo/i, /não representam/i, /\b[a-f0-9]{16,}\b/i, /EM0291/,
];

function printedText(document: CatalogDocument): string {
  const view = render(<DocumentRenderer document={document} plans={compilePlans(document).plans} assetUrls={new Map()} />);
  const text = view.container.textContent ?? '';
  view.unmount();
  return text;
}

function expectNoDemoText(label: string, document: CatalogDocument) {
  const text = printedText(document);
  expect(text.length, label).toBeGreaterThan(0);
  for (const pattern of FORBIDDEN) expect(text, `${label}: ${pattern}`).not.toMatch(pattern);
}

describe('FR-81 no demonstration or review text is printed', () => {
  it('every catalog starter renders without review or demonstration notes', () => {
    const registry = createDefaultCatalogStarterRegistry();
    for (const summary of registry.list()) {
      const starter = registry.get(summary.starterId);
      if (!starter) throw new Error(summary.starterId);
      expectNoDemoText(summary.starterId, starter.sourceDocument);
    }
  });

  it('every page model (archetypes P1–P9, TA-25N pages, demo fixture) renders without them', () => {
    for (const archetype of PRESYS_ARCHETYPES) {
      const document: CatalogDocument = parseCanonicalDocument({
        schemaVersion: 1, id: 'doc', title: 'Modelos', locale: 'pt-BR', style: presysDocumentStyle(), assets: [],
        pages: [buildPresysArchetypePage(archetype.id, { pageId: `page-${archetype.id}` })],
      });
      expectNoDemoText(archetype.label, document);
    }
    const asset: AssetRef = PRESYS_STARTER.sourceDocument.assets[0];
    const templates = createPresysPageTemplateRegistry();
    templates.install(asset);
    const host = createPresysStarterDocument(asset);
    let next = 0;
    for (const template of [...templates.list(), W2E_PAGE_TEMPLATE]) {
      const demo = createW2CDemoDocument(() => `demo-${++next}`);
      const base = template.id === W2E_PAGE_TEMPLATE.id ? demo : host;
      const page = instantiatePageWithFreshIds(base, template, () => `fresh-${++next}`);
      expectNoDemoText(template.label, { ...base, pages: [page] });
    }
  });

  it('AI-composed catalogs (comparison and institutional) print only catalog content; provenance goes to review notes', async () => {
    const input = await createSyntheticSpecifications();
    const comparison = await compileCatalog(input, mockCatalogPlan(input));
    expectNoDemoText('comparison', comparison.document);
    const institutionalPlan = planMockRequest(input, 'Monte um caderno institucional comparativo com sumário e fontes.');
    const institutional = await compileCatalog(input, institutionalPlan);
    expectNoDemoText('institutional', institutional.document);
    const notes = generationReviewNotes(input);
    expect(notes[0]).toContain('Não representam especificações de produtos PRESYS');
    expect(notes.slice(1)).toEqual(input.sources.map((source) => `Fonte: ${source.name} · revisão ${source.revision}`));
  });

  it('the TA-25N starter keeps its provenance as review notes instead of page text', () => {
    expect(PRESYS_STARTER.reviewNotes).toEqual(PRESYS_STARTER_REVIEW_NOTES);
    expect(PRESYS_STARTER_REVIEW_NOTES.join(' ')).toContain('Fontes PRESYS: manual EM0291-04');
    expect(printedText(PRESYS_STARTER.sourceDocument)).not.toContain('EM0291');
  });
});

import { parseCanonicalDocument } from '../application';
import { findObjectInTree, type CatalogDocument, type RichText } from '../domain';
import { TranslationFoundationError, resolveTranslationProfile, type TranslationFoundationResult, type TranslationLocator, type TranslationSemanticLeaf } from './contracts';
import { extractSemanticTranslationCoverage, stableSerialize } from './semantic-leaves';
import { protectTechnicalTokens } from './technical-token-protector';

export interface TranslationReviewRun {
  readonly unitId: string;
  readonly runId: string;
  readonly kind: string;
  readonly sourceText: string;
  readonly translatedText: string;
  readonly pageLabel: string;
  readonly typeLabel: string;
  readonly locationLabel: string;
}

function invalid(message: string): never {
  throw new TranslationFoundationError('INVALID_PROVIDER_RESPONSE', message);
}

export function requireReviewText(source: string, translated: string): void {
  // Authored placeholder-looking literals are facts too. Only newly introduced transport placeholders are forbidden.
  let withoutSourceLiterals = translated;
  for (const literal of source.match(/\[\[VNEXT_TECH_[^\]]+\]\]/g) ?? []) withoutSourceLiterals = withoutSourceLiterals.replace(literal, '');
  const unsupportedControl = Array.from(translated).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  });
  if (!translated.trim() || translated.length > 4000 || /<\/?[a-z][^>]*>/i.test(translated) || withoutSourceLiterals.includes('[[VNEXT_TECH_') || unsupportedControl) {
    invalid('Review text is empty, too large or contains unsupported markup');
  }
  const tokens = (text: string) => protectTechnicalTokens(text).tokens.map(token => token.value).sort();
  if (stableSerialize(tokens(source)) !== stableSerialize(tokens(translated))) {
    throw new TranslationFoundationError('TECHNICAL_TOKEN_MISMATCH', 'Review must preserve technical values');
  }
}

function richTextAt(document: CatalogDocument, locator: TranslationLocator): RichText | undefined {
  if (locator.kind === 'catalogTitle') return undefined;
  const entry = findObjectInTree(document, locator.objectId);
  if (!entry || entry.page.id !== locator.pageId) invalid('Translation object is missing');
  const object = entry.object;
  if (locator.kind === 'textObject') return object.type === 'text' ? object.text : invalid('Wrong text target');
  if (object.type !== 'table' || object.table.id !== locator.tableId) invalid('Wrong table target');
  if (locator.kind === 'tableTitle') return object.table.title;
  if (locator.kind === 'tableAnnotation') return object.table.annotations.find(item => item.id === locator.annotationId)?.text;
  if (locator.kind === 'tableLegend') return object.table.legend.find(item => item.id === locator.legendEntryId)?.text;
  const cell = object.table.cells.find(item => item.id === locator.cellId);
  return cell?.content.type === 'richText' ? cell.content.value : undefined;
}

/** Assemble validated text into the existing canonical shape before ordinary clone allocation. */
export async function materializeTranslationCandidate(
  source: CatalogDocument,
  result: TranslationFoundationResult,
  corrections: ReadonlyMap<string, string> = new Map()
): Promise<{ document: CatalogDocument; runs: readonly TranslationReviewRun[] }> {
  const profile = resolveTranslationProfile(source.locale, result.targetLocale, result.profileVersion);
  if (result.provider.providerId !== profile.providerId || result.provider.modelId !== profile.modelId) invalid('Wrong candidate provider profile');
  if (result.sourceCatalogId !== source.id || result.sourceLocale !== source.locale) invalid('Wrong translation source');
  const coverage = await extractSemanticTranslationCoverage(source);
  const units = new Map(result.units.map(unit => [unit.unitId, unit]));
  if (units.size !== result.units.length || units.size !== coverage.eligible.length) invalid('Incomplete translation coverage');
  const document = structuredClone(source);
  const runs: TranslationReviewRun[] = [];
  const usedCorrections = new Set<string>();
  for (const leaf of coverage.eligible) {
    const unit = units.get(leaf.leafId);
    if (!unit || unit.sourceHash !== leaf.sourceHash || unit.kind !== leaf.kind || stableSerialize(unit.locator) !== stableSerialize(leaf.locator)) {
      throw new TranslationFoundationError('STALE_RESULT', 'Translation no longer matches its source');
    }
    const translations = new Map(unit.runs.map(run => [run.runId, run.translatedText]));
    if (translations.size !== unit.runs.length || translations.size !== leaf.runs.length) invalid('Incomplete translation runs');
    const rich = richTextAt(document, leaf.locator);
    for (const sourceRun of leaf.runs) {
      const original = translations.get(sourceRun.runId);
      if (original === undefined) invalid('Missing translation run');
      const key = translationReviewKey(leaf.leafId, sourceRun.runId);
      const translated = corrections.get(key) ?? original;
      if (corrections.has(key)) usedCorrections.add(key);
      requireReviewText(sourceRun.text, translated);
      if (leaf.kind === 'catalogTitle') document.title = translated;
      else {
        const inline = rich?.paragraphs.flatMap(paragraph => paragraph.inlines).find(item => item.id === sourceRun.runId);
        if (!inline || inline.kind !== 'text') invalid('Missing canonical text run');
        inline.text = translated;
      }
      runs.push({ unitId: leaf.leafId, runId: sourceRun.runId, kind: leaf.kind, sourceText: sourceRun.text, translatedText: translated,
        ...reviewLocation(source, leaf) });
    }
  }
  if (usedCorrections.size !== corrections.size) invalid('Unknown review correction');
  document.locale = result.targetLocale;
  return { document: parseCanonicalDocument(document), runs };
}

export function translationReviewKey(unitId: string, runId: string): string {
  return JSON.stringify([unitId, runId]);
}

function reviewLocation(source: CatalogDocument, leaf: TranslationSemanticLeaf): { pageLabel: string; typeLabel: string; locationLabel: string } {
  const labels = { catalogTitle: 'Título do catálogo', textObject: 'Texto', tableCell: 'Célula da tabela', tableTitle: 'Título da tabela', tableAnnotation: 'Nota da tabela', tableLegend: 'Legenda da tabela' };
  const pageId = leaf.locator.kind === 'catalogTitle' ? undefined : leaf.locator.pageId;
  const pageLabel = pageId === undefined ? 'Catálogo' : `Página ${source.pages.findIndex(page => page.id === pageId) + 1}`;
  const typeLabel = labels[leaf.kind];
  return { pageLabel, typeLabel, locationLabel: `${pageLabel} · ${typeLabel}` };
}

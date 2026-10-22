import type { CatalogDocument, Page } from '../domain';
import { buildPresysArchetypePage, PRESYS_ARCHETYPES, presysDocumentStyle } from './presys-archetypes';
import { buildPresysPconCoverPage, PRESYS_PCON_COVER } from './presys-cover-pcon';
import {
  createPresysStarterDocument,
  PRESYS_IMAGE_MANIFEST,
  PRESYS_PAGE_TEMPLATE_LABELS,
  PRESYS_STARTER,
} from './presys-ta25n-starter';

/**
 * The page models offered by "Usar modelo…" (FR-80), with what the gallery
 * needs to draw each one as a thumbnail (FR-18). The archetypes P1–P9 come
 * first, then the native PCON cover; the TA-25N pages follow where the official image can be prepared.
 */
export interface PresysPageModelChoice {
  readonly templateId: string;
  readonly label: string;
  readonly description?: string;
  readonly preview: {
    readonly page: Page;
    readonly document: CatalogDocument;
    readonly assetUrls: ReadonlyMap<string, string>;
  };
}

export const PRESYS_DEFAULT_PAGE_MODEL_ID = PRESYS_ARCHETYPES[0].templateId;

let archetypeChoices: readonly PresysPageModelChoice[] | undefined;
let ta25nChoices: readonly PresysPageModelChoice[] | undefined;

function archetypeModels(): readonly PresysPageModelChoice[] {
  if (archetypeChoices) return archetypeChoices;
  const pages = PRESYS_ARCHETYPES.map((archetype) => buildPresysArchetypePage(archetype.id, { pageId: `preview-${archetype.templateId}` }));
  const document: CatalogDocument = {
    schemaVersion: 1, id: 'presys-page-model-previews', title: 'Modelos de página', locale: 'pt-BR',
    style: presysDocumentStyle(), pages, assets: [],
  };
  const noImages = new Map<string, string>();
  // Onda 3.5 (S3): the native PCON cover is offered right after the archetypes (its photo slot waits for the real photo).
  const cover = buildPresysPconCoverPage({ pageId: `preview-${PRESYS_PCON_COVER.templateId}` });
  const withCover: CatalogDocument = { ...document, pages: [...pages, cover] };
  archetypeChoices = Object.freeze([
    ...PRESYS_ARCHETYPES.map((archetype, index) => ({
      templateId: archetype.templateId, label: archetype.label, description: archetype.description,
      preview: { page: pages[index], document: withCover, assetUrls: noImages },
    })),
    { templateId: PRESYS_PCON_COVER.templateId, label: PRESYS_PCON_COVER.label, description: PRESYS_PCON_COVER.description,
      preview: { page: cover, document: withCover, assetUrls: noImages } },
  ]);
  return archetypeChoices;
}

function ta25nModels(): readonly PresysPageModelChoice[] {
  if (ta25nChoices) return ta25nChoices;
  // The preview draws the packaged official image; inserting still prepares the durable copy first.
  const document = createPresysStarterDocument(PRESYS_STARTER.sourceDocument.assets[0]);
  const assetUrls = new Map([[PRESYS_IMAGE_MANIFEST.seedAssetId, PRESYS_IMAGE_MANIFEST.runtimePackagedPath]]);
  ta25nChoices = Object.freeze(document.pages.map((page) => ({
    templateId: page.id, label: PRESYS_PAGE_TEMPLATE_LABELS[page.id],
    description: page.id === document.pages[0].id ? 'Página do TA-25N com a foto oficial e o resumo do produto.' : 'Página do TA-25N com as especificações e condições.',
    preview: { page, document, assetUrls },
  })));
  return ta25nChoices;
}

export function presysPageModelChoices(options: { readonly includeTa25n: boolean }): readonly PresysPageModelChoice[] {
  return options.includeTa25n ? [...archetypeModels(), ...ta25nModels()] : archetypeModels();
}

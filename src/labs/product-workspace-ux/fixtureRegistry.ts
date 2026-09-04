// src/labs/product-workspace-ux/fixtureRegistry.ts
/**
 * Registry central de fixtures do Laboratório Mega Workspace UX.
 * 
 * Regra Arquitetural (AMENDMENT 3):
 * - O laboratório e este registry conhecem os produtos disponíveis (TA, PCON, STRESS).
 * - Os componentes visuais reutilizáveis NÃO possuem nenhum switch ou branch hardcoded de produto.
 * - Suporta chave dinâmica 'activeProductId: string'.
 */

import { WorkspaceSection, ProductWorkspaceMetadata } from './types';
import { TA25N_INITIAL_SECTIONS, TA25N_METADATA } from './ta25n.fixture';
import { PCON_Y18_INITIAL_SECTIONS, PCON_Y18_METADATA } from './pconKompressorY18.fixture';
import { STRESS_500_INITIAL_SECTIONS, STRESS_500_METADATA } from './stressProduct500.fixture';

export interface ProductFixtureEntry {
  metadata: ProductWorkspaceMetadata;
  initialSections: WorkspaceSection[];
}

export const PRODUCT_FIXTURES: Record<string, ProductFixtureEntry> = {
  ta25n: {
    metadata: TA25N_METADATA,
    initialSections: TA25N_INITIAL_SECTIONS
  },
  pcon_y18: {
    metadata: PCON_Y18_METADATA,
    initialSections: PCON_Y18_INITIAL_SECTIONS
  },
  stress_500: {
    metadata: STRESS_500_METADATA,
    initialSections: STRESS_500_INITIAL_SECTIONS
  }
};

export const DEFAULT_PRODUCT_ID = 'ta25n';

export function getProductFixture(productId: string): ProductFixtureEntry {
  return PRODUCT_FIXTURES[productId] || PRODUCT_FIXTURES[DEFAULT_PRODUCT_ID];
}

export function listProductFixtures(): ProductWorkspaceMetadata[] {
  return Object.values(PRODUCT_FIXTURES).map((entry) => entry.metadata);
}

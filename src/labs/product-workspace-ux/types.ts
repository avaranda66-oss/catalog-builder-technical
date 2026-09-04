// src/labs/product-workspace-ux/types.ts
/**
 * Types & Contracts do Human-First Mega Product Workspace UX Lab.
 * 
 * Regra Arquitetural:
 * - Não pixel-perfect (sem x, y, width px, height px livre como Figma)
 * - Structured Editorial Grid: small, medium, large, full
 * - Desacoplado de contratos de backend/PIM
 */

export type BlockSize = 'small' | 'medium' | 'large' | 'full';

export type BlockKind =
  | 'hero_summary'
  | 'fact_grid'
  | 'mega_table'
  | 'table'
  | 'feature_list'
  | 'documents'
  | 'conflicts'
  | 'notes';

export interface FactSource {
  documentId: string;
  documentTitle: string;
  documentCode: string; // Ex: "EM0291-04"
  page: number;
  excerpt: string;
  verifiedStatus: 'verified' | 'review_required' | 'unverified';
  isFamilyInherited?: boolean;
  claimValue?: string; // Valor específico afirmado por esta fonte
  confidence?: number;
  technicalMetadata?: {
    uploadedAt?: string;
    checksum?: string;
    ocrConfidence?: number;
    rawExtractionKey?: string;
  };
}

export interface FactConflictOption {
  sourceTitle: string;
  sourceCode: string;
  page: number;
  extractedValue: string;
  unit?: string;
}

export interface FactConflictDetails {
  title: string;
  description: string;
  options: FactConflictOption[];
  detectedAt: string;
}

export type FactOriginKind = 'product_local' | 'family' | 'product_override';

export interface FactItem {
  id: string;
  label: string;
  value: string;
  unit?: string;
  isHighlighted?: boolean;
  isHidden?: boolean; // Permite esconder do resumo/visualização sem apagar do produto
  originScope: 'model' | 'family';
  originKind?: FactOriginKind; // 'product_local' | 'family' | 'product_override'
  originLabel: string; // Ex: "Linha PCON" ou "PCON KOMPRESSOR-Y18"
  category?: string;
  semanticKey: string; // "pressure.range"
  aliases?: string[];
  source?: FactSource;
  sources?: FactSource[]; // Suporte completo a múltiplas fontes/evidências
  conflict?: FactConflictDetails;
}

export type FactSourceState =
  | 'no_source'
  | 'single_source'
  | 'multiple_agreeing'
  | 'conflicting_sources'
  | 'inherited_source';

export function getFactSources(fact: FactItem): FactSource[] {
  if (fact.sources && fact.sources.length > 0) {
    return fact.sources;
  }
  if (fact.source) {
    return [fact.source];
  }
  return [];
}

export function getFactSourceState(fact: FactItem): FactSourceState {
  const sources = getFactSources(fact);
  if (sources.length === 0) return 'no_source';
  if (fact.conflict || sources.some((s) => s.verifiedStatus === 'review_required')) {
    return 'conflicting_sources';
  }
  if (fact.originScope === 'family' || sources.some((s) => s.isFamilyInherited)) {
    return 'inherited_source';
  }
  if (sources.length > 1) {
    return 'multiple_agreeing';
  }
  return 'single_source';
}

export interface ProductWorkspaceMetadata {
  id: string;
  name: string;
  sku?: string;
  category: string;
  familyLine: string;
  department: string;
  layoutRevision: number; // "Versão da organização"
  dataRevision: number;   // "Versão dos dados técnicos"
  isSynthetic?: boolean;
  fixtureBadge?: string;  // Ex: "LAB / SYNTHETIC FIXTURE"
}

export interface StagedDatumChange {
  datumId: string;
  draft: Partial<FactItem>;
  scope: 'model' | 'family';
  stagedAt: number;
}

export interface AITruthSummary {
  facts: Array<{ id: string; label: string; value: string; documentCode: string; confidence: number }>;
  conflicts: Array<{ id: string; label: string; divergingValues: string[]; documentCodes: string[] }>;
  reviewCandidates: Array<{ id: string; label: string; suggestedValue: string; reason: string }>;
}

export interface MegaTableColumn {
  id: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  visible?: boolean;
}

export interface MegaTableCellData {
  value: string;
  unit?: string;
  source?: FactSource;
  highlight?: boolean;
}

export interface MegaTableRow {
  id: string;
  group?: string; // e.g. "Termorresistências (RTD)", "Termopares", "Sinais Elétricos"
  cells: Record<string, MegaTableCellData>;
}

export interface MegaTableData {
  columns: MegaTableColumn[];
  rows: MegaTableRow[];
  defaultDensity?: 'compact' | 'normal' | 'comfortable';
  supportsFullscreen?: boolean;
}

export interface SimpleTableColumn {
  id: string;
  header: string;
}

export interface SimpleTableRow {
  id: string;
  values: string[];
}

export interface SimpleTableData {
  columns: SimpleTableColumn[];
  rows: SimpleTableRow[];
}

export interface FeatureListItem {
  id: string;
  title: string;
  description: string;
  category?: string;
  iconName?: string;
}

export interface DocumentCardItem {
  id: string;
  title: string;
  code: string;
  revision: string;
  date: string;
  totalPages: number;
  referencedFactsCount: number;
  fileSize: string;
  downloadUrl?: string;
}

export interface WorkspaceBlock {
  id: string;
  kind: BlockKind;
  title?: string;
  subtitle?: string;
  size: BlockSize;
  isHidden?: boolean;
  data:
    | { kind: 'hero_summary'; facts: FactItem[]; heroImage?: string; headline: string }
    | { kind: 'fact_grid'; facts: FactItem[]; layoutVariant?: 'cards' | 'key_value' }
    | { kind: 'mega_table'; table: MegaTableData }
    | { kind: 'table'; table: SimpleTableData }
    | { kind: 'feature_list'; items: FeatureListItem[] }
    | { kind: 'documents'; documents: DocumentCardItem[] }
    | { kind: 'conflicts'; conflicts: FactItem[] }
    | { kind: 'notes'; content: string };
}

export interface WorkspaceSection {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  isCollapsed?: boolean;
  blocks: WorkspaceBlock[];
}

export type WorkspacePerspective =
  | 'standard'
  | 'engineering'
  | 'commercial'
  | 'documentation';

export type WorkspaceMode = 'view' | 'edit_workspace';

export interface UndoSnapshot {
  timestamp: number;
  description: string;
  sections: WorkspaceSection[];
}

export interface SemanticRenameImpactPreview {
  currentKey: string;
  newKey: string;
  affectedProductsCount: number;
  affectedTablesCount: number;
  affectedViewsCount: number;
  affectedCatalogReferencesCount: number;
  sampleLocations: Array<{ type: string; name: string }>;
  willRetainOldKeyAsAlias: boolean;
}

export interface AIOrganizeDiff {
  newSectionsCount: number;
  newTablesCount: number;
  groupedCardsCount: number;
  removedFactsCount: number;
  summary: string;
  details: string[];
}

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  sectionId: string;
  sectionTitle: string;
  blockId: string;
  type: 'fact' | 'sensor' | 'table_row' | 'document' | 'alias';
  matchedQuery: string;
}

/**
 * Derived counts helpers: garante que contagens nunca sejam fonte primária estática
 * sujeita a desatualização, e sim sempre computadas dinamicamente da projeção de seções.
 */
export function deriveFactsCount(sections: WorkspaceSection[]): number {
  let count = 0;
  for (const sec of sections) {
    for (const block of sec.blocks) {
      if (block.data.kind === 'fact_grid' || block.data.kind === 'hero_summary') {
        count += block.data.facts.length;
      } else if (block.data.kind === 'mega_table') {
        count += block.data.table.rows.length;
      } else if (block.data.kind === 'table') {
        count += block.data.table.rows.length;
      } else if (block.data.kind === 'conflicts') {
        count += block.data.conflicts.length;
      }
    }
  }
  return count;
}

export function deriveTablesCount(sections: WorkspaceSection[]): number {
  let count = 0;
  for (const sec of sections) {
    for (const block of sec.blocks) {
      if (block.data.kind === 'mega_table' || block.data.kind === 'table') {
        count += 1;
      }
    }
  }
  return count;
}

export function deriveSourcesCount(sections: WorkspaceSection[]): number {
  const sourceDocCodes = new Set<string>();
  for (const sec of sections) {
    for (const block of sec.blocks) {
      if (block.data.kind === 'fact_grid' || block.data.kind === 'hero_summary') {
        for (const f of block.data.facts) {
          getFactSources(f).forEach((s) => sourceDocCodes.add(s.documentCode));
        }
      } else if (block.data.kind === 'documents') {
        block.data.documents.forEach((d) => sourceDocCodes.add(d.code));
      }
    }
  }
  return sourceDocCodes.size;
}

export function deriveConflictsCount(sections: WorkspaceSection[]): number {
  let count = 0;
  for (const sec of sections) {
    for (const block of sec.blocks) {
      if (block.data.kind === 'conflicts') {
        count += block.data.conflicts.length;
      } else if (block.data.kind === 'fact_grid' || block.data.kind === 'hero_summary') {
        count += block.data.facts.filter((f) => f.conflict != null).length;
      }
    }
  }
  return count;
}


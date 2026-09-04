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

export interface FactItem {
  id: string;
  label: string;
  value: string;
  unit?: string;
  isHighlighted?: boolean;
  originScope: 'model' | 'family';
  originLabel: string; // "Linha TA" ou "TA-25N"
  category?: string;
  semanticKey: string; // "temperature.stability"
  aliases?: string[];
  source?: FactSource;
  conflict?: FactConflictDetails;
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

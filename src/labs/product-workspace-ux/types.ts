// src/labs/product-workspace-ux/types.ts
/**
 * Types & Contracts do Human-First Mega Product Workspace UX Lab.
 * 
 * Regra Arquitetural:
 * - Não pixel-perfect (sem x, y, width px, height px livre como Figma)
 * - Structured Editorial Grid: small, medium, large, full
 * - Desacoplado de contratos de backend/PIM
 */

export type WorkspaceBlockSize = 'small' | 'medium' | 'large' | 'full';
export type BlockSize = WorkspaceBlockSize;

export type WorkspaceBlockVisibility = 'visible' | 'hidden';

export type BlockKind =
  | 'hero_summary'
  | 'fact_grid'
  | 'mega_table'
  | 'table'
  | 'feature_list'
  | 'documents'
  | 'conflicts'
  | 'notes';

/**
 * Discriminado Lossless TechnicalValue DTO (Amendment 3).
 * Mapeia 1:1 o TechnicalValue do domínio sem degradação para uniões primitivas.
 */
export type TechnicalValueDTO =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'boolean'; readonly value: boolean }
  | {
      readonly type: 'quantity';
      readonly amount: number;
      readonly unit: string;
      readonly qualifier?: string;
    }
  | {
      readonly type: 'range';
      readonly lower?: number;
      readonly upper?: number;
      readonly unit: string;
      readonly lowerInclusive?: boolean;
      readonly upperInclusive?: boolean;
    }
  | {
      readonly type: 'enum';
      readonly code: string;
      readonly label?: string;
    }
  | {
      readonly type: 'technical_token';
      readonly token: string;
      readonly category?: string;
    }
  | {
      readonly type: 'asset_reference';
      readonly assetId: string;
      readonly mimeType?: string;
      readonly label?: string;
    }
  | {
      readonly type: 'product_reference';
      readonly targetProductId: string;
      readonly relationKind?: string;
    }
  | {
      readonly type: 'unknown';
      readonly reason?: string;
    };

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
  evidenceState?: FactSourceState;
  /** DTO estruturado completo do TechnicalValue (Amendment 3: lossless) */
  technicalValue?: TechnicalValueDTO;
}

export type FactSourceState =
  | 'no_source'
  | 'single_source'
  | 'multiple_agreeing'
  | 'conflicting_sources';

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
  sources?: FactSource[];
  highlight?: boolean;
  type?: 'fact_ref' | 'editorial_literal';
  factId?: string; // Stable TechnicalDatum identity
  canonicalSemanticKey?: string;
  hasConflict?: boolean;
  status?: 'verified' | 'unverified' | 'review_required';
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
  size: WorkspaceBlockSize;
  /** @deprecated Use visibility. Mantido para compatibilidade com o laboratório visual. */
  isHidden?: boolean;
  /** Alinhado 1:1 com o domínio de produção: 'visible' | 'hidden' */
  visibility?: WorkspaceBlockVisibility;
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

/** @deprecated LAB COMPATIBILITY ONLY. Production ViewModel uses strictly InteractionMode and DetailLevel. */
export type WorkspacePerspective =
  | 'commercial'
  | 'engineering'
  | 'metrology'
  | 'compliance'
  | 'standard';

/** @deprecated LAB COMPATIBILITY ONLY. Production ViewModel uses strictly InteractionMode and DetailLevel. */
export type WorkspaceMode = 'view' | 'edit_workspace';

/**
 * Eixos Ortogonais de UI (Amendment 5):
 * 1. InteractionMode: Ação que o usuário está realizando no workspace.
 * 2. DetailLevel: Nível de profundidade técnica/metrológica exibido na tela.
 */
export type InteractionMode = 'view' | 'edit_layout' | 'edit_data';
export type DetailLevel = 'simple' | 'advanced';

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
 * Métricas formais do Workspace (UX1.3 & UX1.3A):
 * - knowledgeFactsCount: total canônico de fatos técnicos na base de conhecimento (definido APENAS quando factsById/knowledgeBaseFacts é fornecido, NUNCA por inferência de layout)
 * - referencedFactsCount: total de fatos técnicos únicos referenciados na árvore de layout
 * - visibleUniqueFactsCount: fatos únicos atualmente referenciados na projeção visível
 * - visibleFactOccurrences: total de referências/ocorrências renderizadas em blocos e células
 * - tableFactReferencesCount: total de referências que aparecem dentro de células de tabelas
 * - tablesCount: quantidade de blocos de tabela (mega_table / table)
 * - sourcesCount: quantidade de documentos de fonte únicos (por stable documentId)
 * - conflictsCount: quantidade de fatos técnicos únicos com divergência/conflito na view ativa
 * - knowledgeConflictsCount?: quantidade canônica de conflitos na base de conhecimento
 * - visibleConflictsCount: conflitos renderizados em blocos visíveis
 */
export interface WorkspaceMetrics {
  /** Total canônico de fatos técnicos na base de conhecimento (APENAS quando factsById/knowledgeBaseFacts é fornecido; zero fallback para layout) */
  knowledgeFactsCount?: number;
  /** Total de fatos técnicos únicos referenciados no layout (substitui inferência indevida de knowledgeFactsCount no LAB) */
  referencedFactsCount: number;
  /** Fatos técnicos únicos referenciados pela visualização ativa (blocos visíveis) */
  visibleUniqueFactsCount: number;
  /** Total de ocorrências visuais de fatos renderizadas */
  visibleFactOccurrences: number;
  /** Total de referências a fatos dentro de células de tabelas */
  tableFactReferencesCount: number;
  /** Quantidade de blocos de tabela */
  tablesCount: number;
  /** Quantidade de documentos de fonte únicos (por documentId) */
  sourcesCount: number;
  /** Quantidade de fatos técnicos únicos com divergência/conflito */
  conflictsCount: number;
  /** Conflitos canônicos da base de conhecimento (opcional) */
  knowledgeConflictsCount?: number;
  /** Conflitos visíveis na tela ativa */
  visibleConflictsCount: number;
  /** @deprecated Use visibleUniqueFactsCount */
  uniqueFactsCount: number;
  /** @deprecated Use visibleUniqueFactsCount */
  factsCount: number;
}

export function deriveWorkspaceMetrics(
  sections: WorkspaceSection[],
  knowledgeBaseFacts?: FactItem[]
): WorkspaceMetrics {
  const uniqueVisibleFactIds = new Set<string>();
  const allKnownFactIds = new Set<string>();
  let visibleFactOccurrences = 0;
  let tableFactReferencesCount = 0;
  let tablesCount = 0;
  const uniqueSourceDocIds = new Set<string>();
  const uniqueConflictFactIds = new Set<string>();

  for (const sec of sections) {
    for (const block of sec.blocks) {
      const isBlockVisible = block.visibility !== 'hidden' && !block.isHidden;

      if (block.data.kind === 'fact_grid' || block.data.kind === 'hero_summary') {
        for (const fact of block.data.facts) {
          allKnownFactIds.add(fact.id);
          if (isBlockVisible && !fact.isHidden) {
            uniqueVisibleFactIds.add(fact.id);
            visibleFactOccurrences += 1;
          }

          getFactSources(fact).forEach((s) => {
            if (s.documentId) uniqueSourceDocIds.add(s.documentId);
          });

          if (fact.conflict) {
            uniqueConflictFactIds.add(fact.id);
          }
        }
      } else if (block.data.kind === 'conflicts') {
        for (const fact of block.data.conflicts) {
          allKnownFactIds.add(fact.id);
          if (isBlockVisible && !fact.isHidden) {
            uniqueVisibleFactIds.add(fact.id);
            visibleFactOccurrences += 1;
            uniqueConflictFactIds.add(fact.id);
          }

          getFactSources(fact).forEach((s) => {
            if (s.documentId) uniqueSourceDocIds.add(s.documentId);
          });
        }
      } else if (block.data.kind === 'mega_table') {
        if (isBlockVisible) tablesCount += 1;
        for (const row of block.data.table.rows) {
          for (const cellKey of Object.keys(row.cells)) {
            const cell = row.cells[cellKey];
            if (cell.type === 'fact_ref' && cell.factId) {
              allKnownFactIds.add(cell.factId);
              if (isBlockVisible) {
                uniqueVisibleFactIds.add(cell.factId);
                visibleFactOccurrences += 1;
                tableFactReferencesCount += 1;
              }
            }
            if (cell.source?.documentId) {
              uniqueSourceDocIds.add(cell.source.documentId);
            }
            if (cell.sources) {
              cell.sources.forEach((s) => {
                if (s.documentId) uniqueSourceDocIds.add(s.documentId);
              });
            }
            if (cell.hasConflict && cell.factId && isBlockVisible) {
              uniqueConflictFactIds.add(cell.factId);
            }
          }
        }
      } else if (block.data.kind === 'table') {
        if (isBlockVisible) tablesCount += 1;
      } else if (block.data.kind === 'documents') {
        for (const doc of block.data.documents) {
          if (doc.id) {
            uniqueSourceDocIds.add(doc.id);
          }
        }
      }
    }
  }

  // Canonical rule: knowledgeFactsCount nunca é inferido caminhando pela tela.
  const knowledgeFactsCount = knowledgeBaseFacts
    ? new Set(knowledgeBaseFacts.map((f) => f.id)).size
    : undefined;

  const referencedFactsCount = allKnownFactIds.size;
  const visibleUniqueFactsCount = uniqueVisibleFactIds.size;

  return {
    knowledgeFactsCount,
    referencedFactsCount,
    visibleUniqueFactsCount,
    visibleFactOccurrences,
    tableFactReferencesCount,
    tablesCount,
    sourcesCount: uniqueSourceDocIds.size,
    conflictsCount: uniqueConflictFactIds.size,
    knowledgeConflictsCount: knowledgeBaseFacts
      ? knowledgeBaseFacts.filter((f) => Boolean(f.conflict)).length
      : undefined,
    visibleConflictsCount: uniqueConflictFactIds.size,
    uniqueFactsCount: visibleUniqueFactsCount,
    factsCount: visibleUniqueFactsCount
  };
}

/** @deprecated Use deriveWorkspaceMetrics(sections).uniqueFactsCount */
export function deriveFactsCount(sections: WorkspaceSection[]): number {
  return deriveWorkspaceMetrics(sections).uniqueFactsCount;
}

/** @deprecated Use deriveWorkspaceMetrics(sections).tablesCount */
export function deriveTablesCount(sections: WorkspaceSection[]): number {
  return deriveWorkspaceMetrics(sections).tablesCount;
}

/** @deprecated Use deriveWorkspaceMetrics(sections).sourcesCount */
export function deriveSourcesCount(sections: WorkspaceSection[]): number {
  return deriveWorkspaceMetrics(sections).sourcesCount;
}

/** @deprecated Use deriveWorkspaceMetrics(sections).conflictsCount */
export function deriveConflictsCount(sections: WorkspaceSection[]): number {
  return deriveWorkspaceMetrics(sections).conflictsCount;
}


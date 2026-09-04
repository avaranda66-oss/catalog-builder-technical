// src/domain/product-workspace/projection.ts
// Pure domain projection engine for Mega Product Workspace (PIM.MEGA.WORKSPACE.FOUNDATION1A).
// Projects canonical data truth (ProductWorkbookV2 / ResolvedProductKnowledge) into a human-first consumable UI model.
// Guaranteed: ZERO COPY OF TRUTH. Changing TechnicalDatum values updates the projection instantly.
// Zero explicit any.

import {
  ProductWorkbookV2,
  ResolvedProductKnowledge,
  TechnicalDatum,
  TechnicalValue,
  TechnicalDataset,
  SourceDocument,
  EffectiveDatumStatus,
  DatumOrigin
} from '../product-workbook/types';
import { getDatasetCellKey } from '../product-workbook/types';
import {
  WorkspaceLayoutV1,
  WorkspaceMode,
  WorkspaceProjection,
  ProjectedSection,
  ProjectedBlock,
  ProjectedFactItem,
  ProjectedTable,
  ProjectedTableCell,
  ProjectedSourceItem,
  WorkspaceStats,
  WorkspaceTechnicalTableDef
} from './types';
import { autoOrganizeProductWorkspace } from './auto-organizer';
import { matchesSemanticQuery } from './semantics';

export interface BuildWorkspaceProjectionParams {
  workbook: ProductWorkbookV2;
  effectiveKnowledge?: ResolvedProductKnowledge;
  layout?: WorkspaceLayoutV1;
  sources?: readonly SourceDocument[];
  mode?: WorkspaceMode;
  searchQuery?: string;
}

/**
 * Converte um TechnicalValue em representação textual humanizada e elegante.
 */
export function formatTechnicalValue(val: TechnicalValue): { text: string; unit?: string } {
  if (!val) return { text: '—' };

  switch (val.type) {
    case 'text':
      return { text: val.value };
    case 'number':
      return { text: String(val.value) };
    case 'boolean':
      return { text: val.value ? 'Sim' : 'Não' };
    case 'quantity': {
      const qualPrefix = val.qualifier && val.qualifier !== 'exact' ? `${val.qualifier} ` : '';
      return {
        text: `${qualPrefix}${val.amount} ${val.unit}`.trim(),
        unit: val.unit
      };
    }
    case 'range': {
      const lower = val.lower !== undefined ? String(val.lower) : '';
      const upper = val.upper !== undefined ? String(val.upper) : '';
      const unit = val.unit ? ` ${val.unit}` : '';
      if (lower && upper) {
        return { text: `${lower} a ${upper}${unit}`, unit: val.unit };
      }
      if (lower) {
        return { text: `>= ${lower}${unit}`, unit: val.unit };
      }
      if (upper) {
        return { text: `<= ${upper}${unit}`, unit: val.unit };
      }
      return { text: `—${unit}`, unit: val.unit };
    }
    case 'enum':
      return { text: val.label || val.code };
    case 'technical_token':
      return { text: val.token };
    case 'asset_reference':
      return { text: val.label || `[Mídia ${val.assetId}]` };
    case 'product_reference':
      return { text: `[Produto ${val.targetProductId}]` };
    case 'unknown':
      return { text: val.reason ? `(Não especificado: ${val.reason})` : '—' };
    default:
      return { text: '—' };
  }
}

/**
 * Constrói a projeção completa e pura do workspace para consumo da interface.
 */
export function buildWorkspaceProjection(params: BuildWorkspaceProjectionParams): WorkspaceProjection {
  const {
    workbook,
    effectiveKnowledge,
    sources = [],
    mode = 'simple',
    searchQuery = ''
  } = params;

  // Garante layout via auto-organizer se não fornecido
  const layout = params.layout || autoOrganizeProductWorkspace({
    workbook,
    effectiveKnowledge,
    sources
  });

  const productId = workbook.owner.id;

  // Mapa rápido de datums efetivos (com origem, override, conflito)
  const datumMap = new Map<string, { datum: TechnicalDatum; origin: DatumOrigin; status: EffectiveDatumStatus; isOverride: boolean; isPendingOverride?: boolean; conflictReason?: string }>();

  if (effectiveKnowledge) {
    for (const eff of effectiveKnowledge.effectiveData.values()) {
      datumMap.set(eff.datum.id, {
        datum: eff.datum,
        origin: eff.origin,
        status: eff.effectiveStatus,
        isOverride: eff.origin === 'product_override',
        isPendingOverride: eff.isPendingOverride,
        conflictReason: eff.conflictReason
      });
    }
  }

  // Fallback / complementa com dados locais do workbook
  for (const d of Object.values(workbook.data)) {
    if (!datumMap.has(d.id)) {
      datumMap.set(d.id, {
        datum: d,
        origin: 'product_local',
        status: d.status,
        isOverride: false
      });
    }
  }

  // Mapa rápido de datasets (locais e efetivos)
  const datasetMap = new Map<string, TechnicalDataset>();
  for (const ds of (workbook.datasets || [])) {
    datasetMap.set(ds.id, ds);
  }
  if (effectiveKnowledge?.effectiveDatasets) {
    for (const effDs of effectiveKnowledge.effectiveDatasets.values()) {
      datasetMap.set(effDs.dataset.id, effDs.dataset);
    }
  }

  // Mapa de fontes
  const sourceMap = new Map<string, SourceDocument>();
  for (const s of sources) {
    sourceMap.set(s.id, s);
  }

  // Descritores semânticos definidos no layout
  const descriptors = layout.semanticDescriptors || {};

  // Função auxiliar para projetar um FactItem
  function projectFactItem(datumId: string): ProjectedFactItem | null {
    const entry = datumMap.get(datumId);
    if (!entry) return null;

    const { datum, origin, status, isOverride, isPendingOverride, conflictReason } = entry;
    const desc = descriptors[datum.semanticKey];
    const displayOverride = layout.displayOverrides?.[datum.semanticKey];
    const displayLabel = displayOverride?.customLabel || desc?.displayLabel || datum.label || datum.semanticKey;
    const aliases = desc?.aliases || [];
    const formatted = formatTechnicalValue(datum.value);

    // Identificação de fontes
    let topSourceSummary: string | undefined;
    if (datum.evidence && datum.evidence.length > 0) {
      const firstEv = datum.evidence[0];
      const srcDoc = sourceMap.get(firstEv.sourceDocumentId);
      if (srcDoc) {
        topSourceSummary = `${srcDoc.title}${firstEv.page ? ` (pág. ${firstEv.page})` : ''}`;
      }
    }

    return {
      datumId: datum.id,
      canonicalSemanticKey: datum.semanticKey,
      displayLabel,
      aliases,
      formattedValue: formatted.text,
      rawTypedValue: datum.value,
      unit: formatted.unit,
      origin,
      status,
      hasConflict: status === 'conflicting',
      conflictReason,
      sourcesCount: datum.evidence ? datum.evidence.length : 0,
      topSourceSummary,
      isOverride,
      isPendingOverride
    };
  }

  // Função auxiliar para projetar uma tabela
  function projectTechnicalTable(tableDef: WorkspaceTechnicalTableDef): ProjectedTable {
    const projectedCells: Record<string, ProjectedTableCell> = {};

    for (const row of tableDef.rows) {
      for (const col of tableDef.columns) {
        const cellKey = getDatasetCellKey(row.id, col.id);
        const cellDef = tableDef.cells[cellKey];

        if (!cellDef) {
          projectedCells[cellKey] = {
            rowId: row.id,
            columnId: col.id,
            cellType: 'editorial_literal',
            formattedValue: '—',
            isEditorialOnly: true
          };
          continue;
        }

        if (cellDef.type === 'datum_ref') {
          const fact = projectFactItem(cellDef.datumId);
          projectedCells[cellKey] = {
            rowId: row.id,
            columnId: col.id,
            cellType: 'datum_ref',
            datumRefId: cellDef.datumId,
            formattedValue: fact ? fact.formattedValue : '—',
            rawValue: fact?.rawTypedValue,
            status: fact?.status,
            hasConflict: fact?.hasConflict,
            isEditorialOnly: false
          };
        } else if (cellDef.type === 'dataset_cell_ref') {
          const ds = datasetMap.get(cellDef.datasetId);
          const dsCell = ds?.cells[getDatasetCellKey(cellDef.rowId, cellDef.columnId)];
          const fact = dsCell ? projectFactItem(dsCell.datumId) : null;
          projectedCells[cellKey] = {
            rowId: row.id,
            columnId: col.id,
            cellType: 'dataset_cell_ref',
            datumRefId: dsCell?.datumId,
            formattedValue: fact ? fact.formattedValue : '—',
            rawValue: fact?.rawTypedValue,
            status: fact?.status,
            hasConflict: fact?.hasConflict,
            isEditorialOnly: false
          };
        } else {
          projectedCells[cellKey] = {
            rowId: row.id,
            columnId: col.id,
            cellType: 'editorial_literal',
            formattedValue: cellDef.value,
            isEditorialOnly: true
          };
        }
      }
    }

    return {
      id: tableDef.id,
      title: tableDef.title,
      description: tableDef.description,
      columns: tableDef.columns,
      rows: tableDef.rows,
      cells: projectedCells,
      isFromDataset: false
    };
  }

  // Função auxiliar para projetar um DatasetView como ProjectedTable
  function projectDatasetView(datasetId: string, customTitle?: string): ProjectedTable | null {
    const ds = datasetMap.get(datasetId);
    if (!ds) return null;

    const columns = ds.columns.map((c) => ({
      id: c.id,
      label: c.label,
      headerType: 'quantity' as const,
      unit: c.unit,
      align: 'left' as const
    }));

    const rows = ds.rows.map((r) => ({
      id: r.id,
      label: r.label || r.id,
      order: r.order
    }));

    const projectedCells: Record<string, ProjectedTableCell> = {};
    for (const row of rows) {
      for (const col of columns) {
        const cellKey = getDatasetCellKey(row.id, col.id);
        const dsCell = ds.cells[cellKey];
        if (dsCell) {
          const fact = projectFactItem(dsCell.datumId);
          projectedCells[cellKey] = {
            rowId: row.id,
            columnId: col.id,
            cellType: 'datum_ref',
            datumRefId: dsCell.datumId,
            formattedValue: fact ? fact.formattedValue : '—',
            rawValue: fact?.rawTypedValue,
            status: fact?.status,
            hasConflict: fact?.hasConflict,
            isEditorialOnly: false
          };
        } else {
          projectedCells[cellKey] = {
            rowId: row.id,
            columnId: col.id,
            cellType: 'editorial_literal',
            formattedValue: '—',
            isEditorialOnly: true
          };
        }
      }
    }

    return {
      id: ds.id,
      title: customTitle || ds.label,
      description: ds.description,
      columns,
      rows,
      cells: projectedCells,
      isFromDataset: true,
      sourceDatasetId: ds.id
    };
  }

  // Projeção das Seções e Blocos
  const projectedSections: ProjectedSection[] = [];
  let tablesCount = 0;

  for (const sectionDef of layout.sections) {
    const projectedBlocks: ProjectedBlock[] = [];

    for (const blockId of sectionDef.blockIds) {
      const blockDef = layout.blocks[blockId];
      if (!blockDef) continue;

      switch (blockDef.kind) {
        case 'fact_grid': {
          const items = blockDef.datumIds
            .map((id) => projectFactItem(id))
            .filter((item): item is ProjectedFactItem => item !== null);

          projectedBlocks.push({
            id: blockDef.id,
            kind: 'fact_grid',
            size: blockDef.size,
            visibility: blockDef.visibility,
            title: blockDef.title,
            items,
            columns: blockDef.columns || 3
          });
          break;
        }

        case 'datum_list': {
          const items = blockDef.datumIds
            .map((id) => projectFactItem(id))
            .filter((item): item is ProjectedFactItem => item !== null);

          projectedBlocks.push({
            id: blockDef.id,
            kind: 'datum_list',
            size: blockDef.size,
            visibility: blockDef.visibility,
            title: blockDef.title,
            items
          });
          break;
        }

        case 'technical_table': {
          const table = projectTechnicalTable(blockDef.tableDef);
          tablesCount++;
          projectedBlocks.push({
            id: blockDef.id,
            kind: 'technical_table',
            size: blockDef.size,
            visibility: blockDef.visibility,
            table
          });
          break;
        }

        case 'dataset_view': {
          const table = projectDatasetView(blockDef.datasetId, blockDef.customTitle);
          if (table) {
            tablesCount++;
            projectedBlocks.push({
              id: blockDef.id,
              kind: 'dataset_view',
              size: blockDef.size,
              visibility: blockDef.visibility,
              table
            });
          }
          break;
        }

        case 'text_note': {
          projectedBlocks.push({
            id: blockDef.id,
            kind: 'text_note',
            size: blockDef.size,
            visibility: blockDef.visibility,
            title: blockDef.title,
            content: blockDef.content,
            calloutVariant: blockDef.calloutVariant || 'info'
          });
          break;
        }

        case 'source_group': {
          const projectedSources: ProjectedSourceItem[] = [];
          for (const sId of blockDef.sourceDocumentIds) {
            const src = sourceMap.get(sId);
            if (!src) continue;
            let citations = 0;
            for (const entry of datumMap.values()) {
              if (entry.datum.evidence?.some((ev) => ev.sourceDocumentId === sId)) {
                citations++;
              }
            }
            projectedSources.push({
              id: src.id,
              title: src.title,
              documentType: src.documentType,
              revision: src.revision,
              language: src.language,
              externalUrl: src.externalUrl,
              citationCount: citations
            });
          }

          projectedBlocks.push({
            id: blockDef.id,
            kind: 'source_group',
            size: blockDef.size,
            visibility: blockDef.visibility,
            title: blockDef.title,
            sources: projectedSources
          });
          break;
        }

        case 'divider': {
          projectedBlocks.push({
            id: blockDef.id,
            kind: 'divider',
            size: blockDef.size,
            visibility: blockDef.visibility,
            spacing: blockDef.spacing || 'medium'
          });
          break;
        }
      }
    }

    projectedSections.push({
      id: sectionDef.id,
      title: sectionDef.title,
      description: sectionDef.description,
      order: sectionDef.order,
      collapsed: Boolean(sectionDef.collapsed),
      icon: sectionDef.icon,
      blocks: projectedBlocks
    });
  }

  // Fatos de resumo de destaque para o topo do Workspace
  const summaryFacts: ProjectedFactItem[] = [];
  const firstSection = projectedSections[0];
  if (firstSection && firstSection.blocks.length > 0) {
    const firstBlock = firstSection.blocks[0];
    if (firstBlock.kind === 'fact_grid') {
      summaryFacts.push(...firstBlock.items.slice(0, 6));
    }
  }

  // Estatísticas de integridade do produto
  let localCount = 0;
  let inheritedCount = 0;
  let overrideCount = 0;
  let conflictCount = 0;

  for (const item of datumMap.values()) {
    if (item.origin === 'product_local') localCount++;
    else if (item.origin === 'family') inheritedCount++;
    else if (item.origin === 'product_override') {
      inheritedCount++;
      overrideCount++;
    }
    if (item.status === 'conflicting') conflictCount++;
  }

  const stats: WorkspaceStats = {
    totalDatums: datumMap.size,
    localDatums: localCount,
    inheritedDatums: inheritedCount,
    overrides: overrideCount,
    conflicts: conflictCount,
    tablesCount,
    sourcesCount: sources.length
  };

  // Suporte a Busca
  let searchHits: WorkspaceProjection['searchHits'] = undefined;
  const cleanQuery = searchQuery.trim().toLowerCase();
  if (cleanQuery) {
    const matchedDatumIds: string[] = [];
    const matchedSectionIds: string[] = [];
    const matchedTableIds: string[] = [];

    // Busca em datums (display label, canonical key, aliases, formatted value)
    for (const [datumId, entry] of datumMap.entries()) {
      const desc = descriptors[entry.datum.semanticKey];
      const matchesDesc = desc ? matchesSemanticQuery(desc, cleanQuery) : false;
      const matchesLabel = (entry.datum.label || '').toLowerCase().includes(cleanQuery);
      const matchesKey = entry.datum.semanticKey.toLowerCase().includes(cleanQuery);
      const formatted = formatTechnicalValue(entry.datum.value).text.toLowerCase();
      const matchesVal = formatted.includes(cleanQuery);

      if (matchesDesc || matchesLabel || matchesKey || matchesVal) {
        matchedDatumIds.push(datumId);
      }
    }

    // Busca em seções
    for (const sec of projectedSections) {
      if (sec.title.toLowerCase().includes(cleanQuery) || (sec.description && sec.description.toLowerCase().includes(cleanQuery))) {
        matchedSectionIds.push(sec.id);
      }
      for (const b of sec.blocks) {
        if (b.kind === 'technical_table' || b.kind === 'dataset_view') {
          if (b.table.title.toLowerCase().includes(cleanQuery)) {
            matchedTableIds.push(b.table.id);
          }
        }
      }
    }

    searchHits = {
      query: searchQuery,
      matchedDatumIds,
      matchedSectionIds,
      matchedTableIds
    };
  }

  return {
    productId,
    title: layout.title || `Ficha Técnica — ${productId}`,
    mode,
    summaryFacts,
    sections: projectedSections,
    stats,
    searchHits
  };
}

// src/domain/product-workspace/auto-organizer.ts
// Pure, deterministic layout organizer for Product Workspace (PIM.MEGA.WORKSPACE.FOUNDATION1A).
// Automatically derives clean human-first layouts (Mega Tables, Fact Grids, Sections) from raw TechnicalDatums & Datasets.
// Invariants strictly guaranteed:
// 1. Zero hardcoding of product IDs or specific models (works for TA, PCON, and any future industrial product).
// 2. Zero AI dependency: fully deterministic, rule-based semantic inference.
// 3. Zero data duplication: blocks store strict datumId / datasetId references, never copied values.
// 4. Large natural matrices (e.g. 76 sensor datums) are grouped into elegant technical tables instead of 76 cards.
// Zero explicit any.

import {
  ProductWorkbookV2,
  ResolvedProductKnowledge,
  TechnicalDatum,
  SourceDocument
} from '../product-workbook/types';
import { getDatasetCellKey } from '../product-workbook/types';
import {
  WorkspaceLayoutV1,
  WorkspaceSectionDef,
  WorkspaceBlockDef,
  FactGridBlockDef,
  TechnicalTableBlockDef,
  DatasetViewBlockDef,
  SourceGroupBlockDef,
  WorkspaceTechnicalTableDef,
  WorkspaceTableColumnDef,
  WorkspaceTableRowDef,
  WorkspaceTableCellDef,
  SemanticDescriptor
} from './types';
import { createSemanticDescriptor } from './semantics';

export interface AutoOrganizeParams {
  workbook: ProductWorkbookV2;
  effectiveKnowledge?: ResolvedProductKnowledge;
  layout?: WorkspaceLayoutV1;
  sources?: readonly SourceDocument[];
}

/**
 * Agrupa datums por chave semântica base para detectar matrizes naturais (ex: sensores com faixa, exatidão, resolução).
 */
interface MatrixCluster {
  baseKey: string;
  groupLabel: string;
  rowKeys: string[];
  colKeys: string[];
  matrixDatums: Map<string, TechnicalDatum>; // key: `${rowKey}|${colKey}`
}

/**
 * Atributos comuns que caracterizam dimensões de colunas em tabelas técnicas industriais.
 */
const COMMON_COLUMN_SUFFIXES = [
  { suffix: 'range', label: 'Faixa de Trabalho' },
  { suffix: 'input_range', label: 'Faixa de Entrada' },
  { suffix: 'output_range', label: 'Faixa de Saída' },
  { suffix: 'resolution', label: 'Resolução' },
  { suffix: 'accuracy', label: 'Exatidão' },
  { suffix: 'standard_accuracy', label: 'Exatidão Padrão' },
  { suffix: 'precision', label: 'Precisão' },
  { suffix: 'stability', label: 'Estabilidade' },
  { suffix: 'impedance', label: 'Impedância' },
  { suffix: 'input_impedance', label: 'Impedância de Entrada' },
  { suffix: 'holes', label: 'Furações' },
  { suffix: 'diameter', label: 'Diâmetro' },
  { suffix: 'immersion', label: 'Imersão' },
  { suffix: 'description', label: 'Descrição' }
];

/**
 * Tenta detectar uma matriz semântica natural em um conjunto de datums.
 * Exemplo: ta.electrical.inputs.rtd.pt100.range, ta.electrical.inputs.rtd.pt100.accuracy...
 */
function detectNaturalMatrix(datums: TechnicalDatum[]): MatrixCluster | null {
  if (datums.length < 6) return null;

  // Mapa de sufixo conhecido encontrado
  const rowMap = new Map<string, Map<string, TechnicalDatum>>();
  const colSet = new Set<string>();

  for (const datum of datums) {
    const parts = datum.semanticKey.split('.');
    if (parts.length < 3) continue;

    const lastPart = parts[parts.length - 1];
    const knownCol = COMMON_COLUMN_SUFFIXES.find(
      (c) => c.suffix === lastPart || lastPart.endsWith(`_${c.suffix}`)
    );

    if (knownCol) {
      const rowKey = parts.slice(0, parts.length - 1).join('.');
      const colKey = knownCol.suffix;

      if (!rowMap.has(rowKey)) {
        rowMap.set(rowKey, new Map());
      }
      rowMap.get(rowKey)!.set(colKey, datum);
      colSet.add(colKey);
    }
  }

  // Se temos pelo menos 3 linhas e pelo menos 2 colunas consistentes, é uma matriz natural!
  if (rowMap.size >= 3 && colSet.size >= 2) {
    const matrixDatums = new Map<string, TechnicalDatum>();
    for (const [rKey, cols] of rowMap.entries()) {
      for (const [cKey, d] of cols.entries()) {
        matrixDatums.set(`${rKey}|${cKey}`, d);
      }
    }

    // Calcula prefixo comum mais longo para o baseKey
    const firstRowParts = Array.from(rowMap.keys())[0].split('.');
    let commonPrefixParts = firstRowParts;
    for (const rKey of rowMap.keys()) {
      const parts = rKey.split('.');
      commonPrefixParts = commonPrefixParts.filter((p, i) => p === parts[i]);
    }
    const baseKey = commonPrefixParts.join('.') || 'technical.matrix';

    return {
      baseKey,
      groupLabel: formatHumanLabelFromKey(baseKey),
      rowKeys: Array.from(rowMap.keys()),
      colKeys: Array.from(colSet),
      matrixDatums
    };
  }

  return null;
}

/**
 * Converte chave semântica em label humano elegante.
 */
function formatHumanLabelFromKey(key: string): string {
  const lastPart = key.split('.').pop() || key;
  return lastPart
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Monta automaticamente o layout humano limpo para um produto.
 */
export function autoOrganizeProductWorkspace(params: AutoOrganizeParams): WorkspaceLayoutV1 {
  const { workbook, effectiveKnowledge, layout, sources = [] } = params;

  // Se um layout prévio válido já existir e tiver seções, respeita a customização do usuário
  if (layout && layout.sections && layout.sections.length > 0) {
    return layout;
  }

  const productId = workbook.owner.id;
  const sections: WorkspaceSectionDef[] = [];
  const blocks: Record<string, WorkspaceBlockDef> = {};
  const semanticDescriptors: Record<string, SemanticDescriptor> = {};

  // Coleta todos os datums efetivos (ou locais do workbook)
  const allDatums: TechnicalDatum[] = [];
  if (effectiveKnowledge) {
    for (const eff of effectiveKnowledge.effectiveData.values()) {
      allDatums.push(eff.datum);
    }
  } else {
    allDatums.push(...Object.values(workbook.data));
  }

  // Gera descritores semânticos iniciais para cada datum
  for (const d of allDatums) {
    if (!semanticDescriptors[d.semanticKey]) {
      semanticDescriptors[d.semanticKey] = createSemanticDescriptor({
        canonicalKey: d.semanticKey,
        displayLabel: d.label || formatHumanLabelFromKey(d.semanticKey),
        description: d.description
      });
    }
  }

  // Identifica Datums já atribuídos a blocos para não duplicar visualmente
  const usedDatumIds = new Set<string>();

  // ==========================================================================
  // SEÇÃO 1: RESUMO TÉCNICO & INFORMAÇÕES PRINCIPAIS (Fact Grid de alto nível)
  // ==========================================================================
  // Busca fatos-chave comuns (faixa, exatidão, resolução, estabilidade, dimensões, peso, alimentação)
  const summaryKeywords = [
    'range',
    'temperature_range',
    'pressure_range',
    'accuracy',
    'stability',
    'resolution',
    'weight',
    'power_supply',
    'dimensions'
  ];

  const summaryDatums: TechnicalDatum[] = [];
  for (const kw of summaryKeywords) {
    const match = allDatums.find(
      (d) =>
        !usedDatumIds.has(d.id) &&
        (d.semanticKey.endsWith(`.${kw}`) || d.semanticKey.includes(`.${kw}.`))
    );
    if (match) {
      summaryDatums.push(match);
      usedDatumIds.add(match.id);
    }
  }

  // Se não achou por keyword, pega os primeiros 6 datums como resumo
  if (summaryDatums.length === 0 && allDatums.length > 0) {
    for (const d of allDatums.slice(0, 6)) {
      summaryDatums.push(d);
      usedDatumIds.add(d.id);
    }
  }

  if (summaryDatums.length > 0) {
    const summaryBlockId = `block_summary_${productId}`;
    const summaryBlock: FactGridBlockDef = {
      id: summaryBlockId,
      kind: 'fact_grid',
      title: 'Destaques e Especificações Principais',
      datumIds: summaryDatums.map((d) => d.id),
      columns: 3
    };
    blocks[summaryBlockId] = summaryBlock;

    sections.push({
      id: 'section_summary',
      title: 'Resumo do Produto',
      description: 'Visão executiva das características principais e metrológicas essenciais.',
      blockIds: [summaryBlockId],
      order: 0,
      icon: 'sparkles'
    });
  }

  // ==========================================================================
  // SEÇÃO 2: TABELAS TÉCNICAS E MATRIZES DE ENGENHARIA (Mega Tables / Datasets)
  // ==========================================================================
  const tableSectionBlockIds: string[] = [];

  // A) Incorpora TechnicalDatasets existentes no workbook
  for (const ds of (workbook.datasets || [])) {
    const dsBlockId = `block_dataset_${ds.id}`;
    const dsBlock: DatasetViewBlockDef = {
      id: dsBlockId,
      kind: 'dataset_view',
      datasetId: ds.id,
      customTitle: ds.label
    };
    blocks[dsBlockId] = dsBlock;
    tableSectionBlockIds.push(dsBlockId);

    // Marca células como utilizadas
    for (const cell of Object.values(ds.cells)) {
      usedDatumIds.add(cell.datumId);
    }
  }

  // B) Detecção de Matrizes Naturais nos datums restantes (ex: 76 datums de sensores -> 1 Tabela!)
  // Agrupa datums não usados por moduleId
  const datumsByModule = new Map<string, TechnicalDatum[]>();
  for (const d of allDatums) {
    if (usedDatumIds.has(d.id)) continue;
    if (!datumsByModule.has(d.moduleId)) {
      datumsByModule.set(d.moduleId, []);
    }
    datumsByModule.get(d.moduleId)!.push(d);
  }

  let autoTableCounter = 1;
  for (const [moduleId, moduleDatums] of datumsByModule.entries()) {
    const matrix = detectNaturalMatrix(moduleDatums);
    if (matrix) {
      // Cria uma Mega Tabela pura para essa matriz natural!
      const tableId = `mega_table_${moduleId}_${autoTableCounter++}`;
      const columns: WorkspaceTableColumnDef[] = [
        {
          id: 'col_entity',
          label: 'Item / Sensor',
          headerType: 'text',
          align: 'left'
        },
        ...matrix.colKeys.map((colKey) => {
          const matchingSpec = COMMON_COLUMN_SUFFIXES.find((s) => s.suffix === colKey);
          return {
            id: `col_${colKey}`,
            label: matchingSpec?.label || formatHumanLabelFromKey(colKey),
            headerType: 'quantity' as const,
            align: 'left' as const
          };
        })
      ];

      const rows: WorkspaceTableRowDef[] = matrix.rowKeys.map((rowKey, idx) => ({
        id: `row_${idx}`,
        label: formatHumanLabelFromKey(rowKey),
        order: idx
      }));

      const cells: Record<string, WorkspaceTableCellDef> = {};
      rows.forEach((row, rIdx) => {
        const rowKey = matrix.rowKeys[rIdx];
        // Célula da primeira coluna: label descritivo
        const firstColKey = getDatasetCellKey(row.id, 'col_entity');
        cells[firstColKey] = {
          type: 'editorial_literal',
          value: row.label
        };

        // Células de dados
        matrix.colKeys.forEach((colKey) => {
          const datum = matrix.matrixDatums.get(`${rowKey}|${colKey}`);
          const cellKey = getDatasetCellKey(row.id, `col_${colKey}`);
          if (datum) {
            cells[cellKey] = {
              type: 'datum_ref',
              datumId: datum.id
            };
            usedDatumIds.add(datum.id);
          } else {
            cells[cellKey] = {
              type: 'editorial_literal',
              value: '—'
            };
          }
        });
      });

      const moduleObj = workbook.modules.find((m) => m.id === moduleId);
      const tableTitle = moduleObj ? moduleObj.label : matrix.groupLabel;

      const tableDef: WorkspaceTechnicalTableDef = {
        id: tableId,
        title: tableTitle,
        description: `Tabela técnica organizada automaticamente agrupando ${matrix.rowKeys.length} linhas de especificações.`,
        columns,
        rows,
        cells
      };

      const tableBlockId = `block_table_${tableId}`;
      const tableBlock: TechnicalTableBlockDef = {
        id: tableBlockId,
        kind: 'technical_table',
        tableDef
      };

      blocks[tableBlockId] = tableBlock;
      tableSectionBlockIds.push(tableBlockId);
    }
  }

  if (tableSectionBlockIds.length > 0) {
    sections.push({
      id: 'section_technical_tables',
      title: 'Tabelas Técnicas & Matrizes',
      description: 'Tabelas completas de exatidão, sensores, entradas elétricas e acessórios.',
      blockIds: tableSectionBlockIds,
      order: sections.length,
      icon: 'table'
    });
  }

  // ==========================================================================
  // SEÇÃO 3: ESPECIFICAÇÕES TÉCNICAS E CARACTERÍSTICAS RESTANTES
  // ==========================================================================
  // Agrupa os datums restantes por seus módulos originais ou afinidade semântica
  const remainingDatums = allDatums.filter((d) => !usedDatumIds.has(d.id));
  if (remainingDatums.length > 0) {
    // Agrupa por módulo
    const remainingByModule = new Map<string, TechnicalDatum[]>();
    for (const d of remainingDatums) {
      if (!remainingByModule.has(d.moduleId)) {
        remainingByModule.set(d.moduleId, []);
      }
      remainingByModule.get(d.moduleId)!.push(d);
    }

    const detailBlockIds: string[] = [];

    for (const [modId, modDatums] of remainingByModule.entries()) {
      const moduleObj = workbook.modules.find((m) => m.id === modId);
      const modLabel = moduleObj?.label || 'Outras Especificações';
      const blockId = `block_detail_${modId}`;

      // Se tiver até 12 datums, faz um Fact Grid limpo; se tiver mais, usa Fact Grid de 3 colunas
      const factBlock: FactGridBlockDef = {
        id: blockId,
        kind: 'fact_grid',
        title: modLabel,
        datumIds: modDatums.map((d) => d.id),
        columns: modDatums.length > 6 ? 3 : 2
      };

      blocks[blockId] = factBlock;
      detailBlockIds.push(blockId);
      modDatums.forEach((d) => usedDatumIds.add(d.id));
    }

    sections.push({
      id: 'section_detailed_specs',
      title: 'Dados Técnicos Complementares',
      description: 'Propriedades físicas, elétricas e ambientais detalhadas.',
      blockIds: detailBlockIds,
      order: sections.length,
      icon: 'list'
    });
  }

  // ==========================================================================
  // SEÇÃO 4: DOCUMENTOS OFICIAIS & FONTES DE EVIDÊNCIA
  // ==========================================================================
  if (sources.length > 0) {
    const sourceBlockId = `block_sources_${productId}`;
    const sourceBlock: SourceGroupBlockDef = {
      id: sourceBlockId,
      kind: 'source_group',
      title: 'Documentos e Manuais de Referência',
      sourceDocumentIds: sources.map((s) => s.id)
    };
    blocks[sourceBlockId] = sourceBlock;

    sections.push({
      id: 'section_sources',
      title: 'Documentação & Fontes',
      description: 'Manuais técnicos, catálogos e normas que comprovam as especificações deste produto.',
      blockIds: [sourceBlockId],
      order: sections.length,
      icon: 'book'
    });
  }

  return {
    schemaVersion: 1,
    id: `layout_${productId}`,
    productId,
    title: `Ficha Técnica Inteligente — ${workbook.owner.id}`,
    description: 'Layout human-first gerado com separação estrita entre autoridade de dados e apresentação.',
    sections,
    blocks,
    semanticDescriptors,
    metadata: {
      generatedAt: new Date().toISOString(),
      autoOrganized: 'true'
    }
  };
}

// src/domain/product-workbook/dataset-reuse.ts
// Pure immutable domain operations for Technical Dataset Reuse, Cloning, Templates,
// and Cross-Product Propagation (PIM.REUSE1).
// Zero explicit any. Zero side-effects.

import {
  TechnicalDataset,
  DatasetColumn,
  DatasetRow,
  DatasetCell,
  DatasetKind,
  ProductWorkbookV2,
  TechnicalDatum,
  TechnicalValue,
  UnitCode,
  DatumStatus,
  CanonicalDecision,
  getDatasetCellKey
} from './types';
import { ProductWorkbookError } from './operations';
import { isValidSemanticKey } from './schema';
import { isCanonicalDecisionValidForDatum } from './provenance.engine';

export interface DatasetColumnDefinition {
  readonly semanticKey: string;
  readonly label: string;
  readonly valueType: TechnicalValue['type'];
  readonly unit?: UnitCode;
  readonly order?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface DatasetRowDefinition {
  readonly semanticKey?: string;
  readonly label?: string;
  readonly order?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Domain specification for a reusable Technical Dataset Template.
 * Templates define ONLY structural shapes and column/row constraints.
 * They contain ZERO fabricated product facts or technical values.
 */
export interface DatasetTemplate {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly kind: DatasetKind;
  readonly defaultModuleSemanticKey?: string;
  readonly columns: readonly DatasetColumnDefinition[];
  readonly sampleRows?: readonly DatasetRowDefinition[];
}

export interface CloneDatasetOptions {
  /**
   * Se true, preserva evidências cujos documentos de origem estejam autorizados em validSourceDocumentIds.
   * Se false (padrão), remove todas as evidências (requer nova aferição).
   */
  readonly preserveEvidence?: boolean;
  /**
   * Lista de IDs de documentos fonte válidos no contexto do target.
   * Evidências apontando para documentos não presentes nesta lista são descartadas.
   */
  readonly validSourceDocumentIds?: readonly string[];
  /**
   * Status a ser atribuído aos novos datums clonados (padrão: 'draft').
   */
  readonly datumStatusFallback?: DatumStatus;
  readonly newDatasetId?: string;
  readonly newSemanticKey?: string;
  readonly newLabel?: string;
  readonly targetModuleId?: string;
}

/**
 * 1. COPY STRUCTURE (PIM.REUSE1.1)
 *
 * Cria uma cópia puramente ESTRUTURAL de um TechnicalDataset em um workbook de destino.
 * Invariantes garantidas:
 * - Novo datasetId
 * - Novas identidades para colunas e linhas
 * - ZERO células e ZERO valores técnicos copiados (cells: {})
 * - ZERO datumIds compartilhados acidentalmente
 */
export function copyDatasetStructure(params: {
  sourceDataset: TechnicalDataset;
  targetWorkbook: ProductWorkbookV2;
  targetModuleId: string;
  options?: {
    newDatasetId?: string;
    newSemanticKey?: string;
    newLabel?: string;
  };
}): {
  updatedWorkbook: ProductWorkbookV2;
  createdDataset: TechnicalDataset;
} {
  const { sourceDataset, targetWorkbook, targetModuleId, options } = params;

  // Valida existência do módulo alvo
  const targetModule = targetWorkbook.modules.find((m) => m.id === targetModuleId);
  if (!targetModule) {
    throw new ProductWorkbookError(
      'TARGET_MODULE_NOT_FOUND',
      `Módulo alvo com ID "${targetModuleId}" não existe no workbook de destino.`
    );
  }

  const newDatasetId = options?.newDatasetId ?? `ds_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newSemanticKey = options?.newSemanticKey ?? sourceDataset.semanticKey;
  const newLabel = options?.newLabel ?? sourceDataset.label;

  if (!isValidSemanticKey(newSemanticKey)) {
    throw new ProductWorkbookError(
      'INVALID_SEMANTIC_KEY',
      `semanticKey do dataset "${newSemanticKey}" é inválida.`
    );
  }

  // Verifica colisão de dataset semanticKey no destino
  if (targetWorkbook.datasets.some((d) => d.semanticKey === newSemanticKey)) {
    throw new ProductWorkbookError(
      'DUPLICATE_DATASET_SEMANTIC_KEY',
      `Já existe um dataset com a semanticKey "${newSemanticKey}" no workbook de destino.`
    );
  }

  // Clona colunas com novos IDs estáveis
  const newColumns: DatasetColumn[] = sourceDataset.columns.map((c, idx) => ({
    id: `col_${newDatasetId}_${idx + 1}`,
    semanticKey: c.semanticKey,
    label: c.label,
    valueType: c.valueType,
    unit: c.unit,
    order: c.order,
    metadata: c.metadata ? { ...c.metadata } : undefined
  }));

  // Clona linhas com novos IDs estáveis
  const newRows: DatasetRow[] = sourceDataset.rows.map((r, idx) => ({
    id: `row_${newDatasetId}_${idx + 1}`,
    semanticKey: r.semanticKey,
    label: r.label,
    order: r.order,
    metadata: r.metadata ? { ...r.metadata } : undefined
  }));

  // Cria o novo dataset com CÉLULAS ESTRITAMENTE VAZIAS
  const createdDataset: TechnicalDataset = {
    id: newDatasetId,
    semanticKey: newSemanticKey,
    moduleId: targetModuleId,
    label: newLabel,
    description: sourceDataset.description,
    kind: sourceDataset.kind,
    columns: newColumns,
    rows: newRows,
    cells: {}, // ZERO valores técnicos copiados
    order: targetWorkbook.datasets.length,
    metadata: sourceDataset.metadata ? { ...sourceDataset.metadata } : undefined
  };

  const updatedWorkbook: ProductWorkbookV2 = {
    ...targetWorkbook,
    datasets: [...targetWorkbook.datasets, createdDataset]
  };

  return { updatedWorkbook, createdDataset };
}

/**
 * 2. CLONE INDEPENDENT (PIM.REUSE1.2)
 *
 * Clona um dataset completo com seus dados técnicos de forma totalmente independente.
 * Invariantes garantidas:
 * - Novo datasetId
 * - Novas identidades para colunas, linhas e células
 * - Novos TechnicalDatum IDs gerados no mapa targetWorkbook.data
 * - Nenhuma referência compartilhada ao workbook de origem
 * - Evidência só é copiada se explicitamente autorizada pela política e validada contra documentos do destino
 */
export function cloneDataset(params: {
  sourceDataset: TechnicalDataset;
  sourceWorkbook: ProductWorkbookV2;
  targetWorkbook: ProductWorkbookV2;
  targetModuleId: string;
  options?: CloneDatasetOptions;
}): {
  updatedWorkbook: ProductWorkbookV2;
  createdDataset: TechnicalDataset;
} {
  const { sourceDataset, sourceWorkbook, targetWorkbook, targetModuleId, options } = params;

  const targetModule = targetWorkbook.modules.find((m) => m.id === targetModuleId);
  if (!targetModule) {
    throw new ProductWorkbookError(
      'TARGET_MODULE_NOT_FOUND',
      `Módulo alvo com ID "${targetModuleId}" não existe no workbook de destino.`
    );
  }

  const newDatasetId = options?.newDatasetId ?? `ds_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newSemanticKey = options?.newSemanticKey ?? sourceDataset.semanticKey;
  const newLabel = options?.newLabel ?? sourceDataset.label;
  const statusFallback = options?.datumStatusFallback ?? 'draft';

  if (!isValidSemanticKey(newSemanticKey)) {
    throw new ProductWorkbookError(
      'INVALID_SEMANTIC_KEY',
      `semanticKey do dataset "${newSemanticKey}" é inválida.`
    );
  }

  if (targetWorkbook.datasets.some((d) => d.semanticKey === newSemanticKey)) {
    throw new ProductWorkbookError(
      'DUPLICATE_DATASET_SEMANTIC_KEY',
      `Já existe um dataset com a semanticKey "${newSemanticKey}" no workbook de destino.`
    );
  }

  // Mapeamento de IDs antigos para novos IDs
  const colIdMap = new Map<string, string>();
  const newColumns: DatasetColumn[] = sourceDataset.columns.map((c, idx) => {
    const newColId = `col_${newDatasetId}_${idx + 1}`;
    colIdMap.set(c.id, newColId);
    return {
      id: newColId,
      semanticKey: c.semanticKey,
      label: c.label,
      valueType: c.valueType,
      unit: c.unit,
      order: c.order,
      metadata: c.metadata ? { ...c.metadata } : undefined
    };
  });

  const rowIdMap = new Map<string, string>();
  const newRows: DatasetRow[] = sourceDataset.rows.map((r, idx) => {
    const newRowId = `row_${newDatasetId}_${idx + 1}`;
    rowIdMap.set(r.id, newRowId);
    return {
      id: newRowId,
      semanticKey: r.semanticKey,
      label: r.label,
      order: r.order,
      metadata: r.metadata ? { ...r.metadata } : undefined
    };
  });

  const validSourceSet = new Set(options?.validSourceDocumentIds ?? []);
  const preserveEv = Boolean(options?.preserveEvidence);

  // Clona dados técnicos para targetWorkbook.data com novas identidades
  const newWorkbookData = { ...targetWorkbook.data };
  const newCells: Record<string, DatasetCell> = {};
  const clonedDatumIdsForModule: string[] = [];

  for (const oldCell of Object.values(sourceDataset.cells)) {
    const newRowId = rowIdMap.get(oldCell.rowId);
    const newColId = colIdMap.get(oldCell.columnId);
    if (!newRowId || !newColId) continue;

    const sourceDatum = sourceWorkbook.data[oldCell.datumId];
    if (!sourceDatum) continue;

    // Gera novo datum ID garantidamente único
    const newDatumId = `dtm_${newDatasetId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Trata evidências com política estrita (EMENDA ADICIONAL & ITEM 9)
    const clonedEvidence = preserveEv
      ? sourceDatum.evidence.filter((e) => validSourceSet.has(e.sourceDocumentId))
      : [];

    // ITEM 9: CanonicalDecision só pode ser preservada se TODAS as evidências
    // referenciadas pela decisão sobreviverem no destino.
    let finalDecision: CanonicalDecision | undefined = undefined;
    let finalStatus: DatumStatus = statusFallback;

    if (preserveEv && sourceDatum.canonicalDecision) {
      const candidateDatum: TechnicalDatum = {
        ...sourceDatum,
        id: newDatumId,
        evidence: clonedEvidence
      };
      const validation = isCanonicalDecisionValidForDatum(sourceDatum.canonicalDecision, candidateDatum);
      if (validation.valid) {
        finalDecision = sourceDatum.canonicalDecision;
        finalStatus = sourceDatum.status;
      } else {
        // Se qualquer evidência referenciada pela decisão foi filtrada:
        finalDecision = undefined;
        finalStatus = 'draft';
      }
    }

    const newDatum: TechnicalDatum = {
      id: newDatumId,
      semanticKey: `${newSemanticKey}.${newRowId}.${newColId}`,
      moduleId: targetModuleId,
      label: sourceDatum.label,
      description: sourceDatum.description,
      localizedLabels: sourceDatum.localizedLabels ? { ...sourceDatum.localizedLabels } : undefined,
      value: { ...sourceDatum.value } as TechnicalValue,
      evidence: clonedEvidence,
      canonicalDecision: finalDecision,
      status: finalStatus,
      audit: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    newWorkbookData[newDatumId] = newDatum;
    clonedDatumIdsForModule.push(newDatumId);

    const newCellKey = getDatasetCellKey(newRowId, newColId);
    newCells[newCellKey] = {
      rowId: newRowId,
      columnId: newColId,
      datumId: newDatumId
    };
  }

  // Atualiza datumIds no módulo de destino
  const updatedModules = targetWorkbook.modules.map((m) => {
    if (m.id === targetModuleId) {
      return {
        ...m,
        datumIds: Array.from(new Set([...m.datumIds, ...clonedDatumIdsForModule]))
      };
    }
    return m;
  });

  const createdDataset: TechnicalDataset = {
    id: newDatasetId,
    semanticKey: newSemanticKey,
    moduleId: targetModuleId,
    label: newLabel,
    description: sourceDataset.description,
    kind: sourceDataset.kind,
    columns: newColumns,
    rows: newRows,
    cells: newCells,
    order: targetWorkbook.datasets.length,
    metadata: sourceDataset.metadata ? { ...sourceDataset.metadata } : undefined
  };

  const updatedWorkbook: ProductWorkbookV2 = {
    ...targetWorkbook,
    modules: updatedModules,
    data: newWorkbookData,
    datasets: [...targetWorkbook.datasets, createdDataset]
  };

  return { updatedWorkbook, createdDataset };
}

/**
 * 3. CANONICAL DATASET TEMPLATES (PIM.REUSE1.4)
 * Modelos padronizados de tabelas técnicas da instrumentação/metrologia.
 * Contêm zero fatos inventados ou valores fabricados.
 */
export const CANONICAL_DATASET_TEMPLATES: readonly DatasetTemplate[] = [
  {
    id: 'template_metrology_specifications',
    name: 'Especificações Metrológicas',
    description: 'Matriz de faixas, exatidão, estabilidade e resolução',
    kind: 'matrix',
    defaultModuleSemanticKey: 'metrology.specs',
    columns: [
      { semanticKey: 'spec.range', label: 'Faixa de Operação', valueType: 'range', order: 0 },
      { semanticKey: 'spec.accuracy', label: 'Exatidão', valueType: 'text', order: 1 },
      { semanticKey: 'spec.stability', label: 'Estabilidade', valueType: 'text', order: 2 },
      { semanticKey: 'spec.resolution', label: 'Resolução', valueType: 'text', order: 3 }
    ],
    sampleRows: [
      { semanticKey: 'sensor.internal', label: 'Sensor Interno', order: 0 },
      { semanticKey: 'sensor.external', label: 'Sonda Externa', order: 1 }
    ]
  },
  {
    id: 'template_accessories',
    name: 'Tabela de Acessórios',
    description: 'Coleção estruturada de insertos, cabos, adaptadores e opcionais',
    kind: 'accessories',
    defaultModuleSemanticKey: 'accessories.standard',
    columns: [
      { semanticKey: 'item.code', label: 'Código do Acessório', valueType: 'technical_token', order: 0 },
      { semanticKey: 'item.description', label: 'Descrição', valueType: 'text', order: 1 },
      { semanticKey: 'item.category', label: 'Tipo / Inclusão', valueType: 'text', order: 2 },
      { semanticKey: 'item.compatibility', label: 'Compatibilidade', valueType: 'text', order: 3 }
    ]
  },
  {
    id: 'template_ordering',
    name: 'Matriz de Código de Pedido',
    description: 'Tabela semântica de opções de configuração e códigos de pedido',
    kind: 'ordering',
    defaultModuleSemanticKey: 'ordering.matrix',
    columns: [
      { semanticKey: 'order.field', label: 'Campo / Parâmetro', valueType: 'text', order: 0 },
      { semanticKey: 'order.code', label: 'Código da Opção', valueType: 'technical_token', order: 1 },
      { semanticKey: 'order.description', label: 'Descrição da Opção', valueType: 'text', order: 2 },
      { semanticKey: 'order.notes', label: 'Observações / Restrições', valueType: 'text', order: 3 }
    ]
  },
  {
    id: 'template_electrical_specifications',
    name: 'Especificações Elétricas e Comunicação',
    description: 'Entradas, saídas de sinal, alimentação e interfaces industriais',
    kind: 'performance',
    defaultModuleSemanticKey: 'electrical.signals',
    columns: [
      { semanticKey: 'signal.type', label: 'Sinal / Interface', valueType: 'text', order: 0 },
      { semanticKey: 'signal.range', label: 'Faixa do Sinal', valueType: 'text', order: 1 },
      { semanticKey: 'signal.accuracy', label: 'Exatidão da Medição', valueType: 'text', order: 2 }
    ]
  },
  {
    id: 'template_dimensions_mechanical',
    name: 'Dimensões e Características Mecânicas',
    description: 'Poço, insertos, carcaça e especificações físicas do equipamento',
    kind: 'dimensions',
    defaultModuleSemanticKey: 'mechanics.dimensions',
    columns: [
      { semanticKey: 'dimension.param', label: 'Parâmetro Físico', valueType: 'text', order: 0 },
      { semanticKey: 'dimension.value', label: 'Valor Nominal', valueType: 'quantity', order: 1 },
      { semanticKey: 'dimension.notes', label: 'Tolerâncias / Detalhes', valueType: 'text', order: 2 }
    ]
  },
  {
    id: 'template_thermal_performance',
    name: 'Desempenho Térmico',
    description: 'Tempos de aquecimento, resfriamento e estabilização térmica',
    kind: 'performance',
    defaultModuleSemanticKey: 'performance.thermal',
    columns: [
      { semanticKey: 'thermal.step', label: 'Transição / Ensaio', valueType: 'text', order: 0 },
      { semanticKey: 'thermal.duration', label: 'Tempo Típico', valueType: 'text', order: 1 },
      { semanticKey: 'thermal.conditions', label: 'Condição Ambiente', valueType: 'text', order: 2 }
    ]
  }
];

/**
 * Instancia um novo TechnicalDataset a partir de um Template estruturado.
 * Cria a estrutura com células vazias prontas para receber dados técnicos comprovados.
 */
export function instantiateDatasetFromTemplate(params: {
  template: DatasetTemplate;
  targetWorkbook: ProductWorkbookV2;
  targetModuleId: string;
  options?: {
    semanticKey?: string;
    label?: string;
  };
}): {
  updatedWorkbook: ProductWorkbookV2;
  createdDataset: TechnicalDataset;
} {
  const { template, targetWorkbook, targetModuleId, options } = params;

  const targetModule = targetWorkbook.modules.find((m) => m.id === targetModuleId);
  if (!targetModule) {
    throw new ProductWorkbookError(
      'TARGET_MODULE_NOT_FOUND',
      `Módulo alvo com ID "${targetModuleId}" não existe no workbook de destino.`
    );
  }

  const newDatasetId = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newSemanticKey = options?.semanticKey ?? `${targetModule.semanticKey}.${template.id.replace('template_', '')}`;
  const newLabel = options?.label ?? template.name;

  if (!isValidSemanticKey(newSemanticKey)) {
    throw new ProductWorkbookError(
      'INVALID_SEMANTIC_KEY',
      `semanticKey do dataset "${newSemanticKey}" é inválida.`
    );
  }

  if (targetWorkbook.datasets.some((d) => d.semanticKey === newSemanticKey)) {
    throw new ProductWorkbookError(
      'DUPLICATE_DATASET_SEMANTIC_KEY',
      `Já existe um dataset com a semanticKey "${newSemanticKey}" no workbook de destino.`
    );
  }

  const newColumns: DatasetColumn[] = template.columns.map((c, idx) => ({
    id: `col_${newDatasetId}_${idx + 1}`,
    semanticKey: c.semanticKey,
    label: c.label,
    valueType: c.valueType,
    unit: c.unit,
    order: c.order ?? idx,
    metadata: c.metadata ? { ...c.metadata } : undefined
  }));

  const newRows: DatasetRow[] = (template.sampleRows ?? []).map((r, idx) => ({
    id: `row_${newDatasetId}_${idx + 1}`,
    semanticKey: r.semanticKey,
    label: r.label,
    order: r.order ?? idx,
    metadata: r.metadata ? { ...r.metadata } : undefined
  }));

  const createdDataset: TechnicalDataset = {
    id: newDatasetId,
    semanticKey: newSemanticKey,
    moduleId: targetModuleId,
    label: newLabel,
    description: template.description,
    kind: template.kind,
    columns: newColumns,
    rows: newRows,
    cells: {}, // Estrutura limpa sem valores inventados
    order: targetWorkbook.datasets.length,
    metadata: undefined
  };

  const updatedWorkbook: ProductWorkbookV2 = {
    ...targetWorkbook,
    datasets: [...targetWorkbook.datasets, createdDataset]
  };

  return { updatedWorkbook, createdDataset };
}

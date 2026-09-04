// src/domain/table-binding/pim-saved-view-projection.adapter.ts
// Adapter puro para conversão canônica de ProductDataView (Saved View PIM) em SavedViewProjection (Emendas 8, 10, 11, 14).
// Invariante estrito: Saved View NÃO é um dataset inventado.
// As células referenciam os TechnicalDatum reais identificados em datumKeys.
// Células editoriais (property) são puramente literais sem binding PIM falso.
// Células de valor técnico (value) mantêm a source identity individual de cada datum.
// Zero broad casts. Zero explicit any. Zero dependência de Supabase ou React.

import {
  ProductDataView,
  ResolvedProductKnowledge,
  evaluateSavedView
} from '../product-workbook';
import {
  SavedViewProjection,
  TechnicalDatasetColumn,
  TechnicalDatasetRow,
  BoundTechnicalCellProjection,
  LiteralCellProjection
} from './product-knowledge-provider.types';
import { TableBindingMode } from '../table-core/table.types';
import { projectTechnicalValueFailClosed } from './product-workbook-datum.resolver';

export interface ProjectPimSavedViewParams {
  readonly view: ProductDataView;
  readonly knowledge: ResolvedProductKnowledge;
  readonly bindingMode?: TableBindingMode;
}

/**
 * Converte um ProductDataView do PIM em uma SavedViewProjection materializável pelo Table Core V2.
 * Estrutura discriminada (Emenda 14):
 * - Coluna "property": Rótulo legível editorial do dado técnico (LiteralCellProjection).
 * - Coluna "value": Célula vinculada diretamente ao TechnicalDatum real correspondente (BoundTechnicalCellProjection).
 * Fail-Closed: Se a view não contiver linhas avaliadas, retorna undefined (não finge suporte).
 */
export function projectPimSavedViewToSavedViewProjection(
  params: ProjectPimSavedViewParams
): SavedViewProjection | undefined {
  const { view, knowledge, bindingMode = 'live' } = params;

  const evaluated = evaluateSavedView(view, knowledge);
  if (!evaluated.rows || evaluated.rows.length === 0) {
    return undefined;
  }

  // 1. Colunas canônicas da projeção da View (Propriedade x Valor)
  const columns: TechnicalDatasetColumn[] = [
    {
      key: 'property',
      label: 'Propriedade',
      align: 'left',
      widthMm: 80
    },
    {
      key: 'value',
      label: 'Valor',
      align: 'left',
      widthMm: 100
    }
  ];

  // 2. Linhas geradas a partir dos fatos técnicos reais
  const rows: TechnicalDatasetRow[] = evaluated.rows.map((evaluatedRow) => {
    const datum = evaluatedRow.datum.datum;
    const origin = evaluatedRow.datum.origin;
    const isFamily = origin === 'family';

    // Identidade individual por célula do dado efetivo (Emendas 8 e 11)
    const sourceOwnerKind: 'product' | 'family' = isFamily ? 'family' : 'product';
    const sourceOwnerId = isFamily ? (knowledge.familyId ?? knowledge.productId) : knowledge.productId;
    const sourceRevision = isFamily ? knowledge.familyRevision : knowledge.productRevision;

    const cellValue = projectTechnicalValueFailClosed(datum.value);

    const cells: Record<string, BoundTechnicalCellProjection | LiteralCellProjection> = {
      property: {
        kind: 'literal',
        value: { kind: 'text', text: evaluatedRow.label }
      },
      value: {
        kind: 'bound',
        datumId: datum.id,
        datumKey: evaluatedRow.semanticKey,
        value: cellValue,
        sourceOwnerKind,
        sourceOwnerId,
        sourceRevision
      }
    };

    return {
      rowId: `row_sv_${evaluatedRow.semanticKey}`,
      label: evaluatedRow.label,
      cells
    };
  });

  return {
    id: view.id,
    title: view.name,
    productId: knowledge.productId,
    columns,
    rows,
    bindingMode,
    sourceRevision: knowledge.productRevision,
    sourceOwnerKind: 'product',
    sourceOwnerId: knowledge.productId
  };
}

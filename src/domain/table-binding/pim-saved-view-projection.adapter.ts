// src/domain/table-binding/pim-saved-view-projection.adapter.ts
// Adapter puro para conversão canônica de ProductDataView (Saved View PIM) em SavedViewProjection (Emenda 12).
// Invariante estrito: Saved View NÃO é um dataset inventado.
// As células referenciam os TechnicalDatum reais identificados em datumKeys.
// Zero explicit any. Zero dependência de Supabase ou React.

import {
  ProductDataView,
  ResolvedProductKnowledge,
  evaluateSavedView
} from '../product-workbook';
import {
  SavedViewProjection,
  TechnicalDatasetColumn,
  TechnicalDatasetRow,
  TechnicalDatasetCellProjection
} from './product-knowledge-provider.types';
import { TableBindingMode } from '../table-core/table.types';
import { mapTechnicalValueToTableLiteralV2 } from './product-workbook-datum.resolver';

export interface ProjectPimSavedViewParams {
  readonly view: ProductDataView;
  readonly knowledge: ResolvedProductKnowledge;
  readonly bindingMode?: TableBindingMode;
}

/**
 * Converte um ProductDataView do PIM em uma SavedViewProjection materializável pelo Table Core V2.
 * Estrutura:
 * - Coluna "property": Rótulo legível do dado técnico (literal texto).
 * - Coluna "value": Célula vinculada diretamente ao TechnicalDatum real correspondente.
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
    const literalRes = mapTechnicalValueToTableLiteralV2(datum.value);
    const cellValue = literalRes.supported ? literalRes.content : ({ kind: 'text', text: '' } as const);

    const cells: Record<string, TechnicalDatasetCellProjection | { kind: 'text'; text: string }> = {
      property: {
        kind: 'text',
        text: evaluatedRow.label
      },
      value: {
        datumId: datum.id,
        datumKey: evaluatedRow.semanticKey,
        value: cellValue
      }
    };

    return {
      rowId: `row_sv_${evaluatedRow.semanticKey}`,
      label: evaluatedRow.label,
      cells: cells as Record<string, TechnicalDatasetCellProjection>
    };
  });

  return {
    id: view.id,
    title: view.name,
    productId: knowledge.productId,
    columns,
    rows,
    bindingMode,
    sourceRevision: knowledge.productRevision
  };
}

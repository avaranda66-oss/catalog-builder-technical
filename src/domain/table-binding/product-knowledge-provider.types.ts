// src/domain/table-binding/product-knowledge-provider.types.ts
// Contrato de integração neutro para o Product Knowledge Provider (Fases 10, 11 e Emendas 1, 10).
// Totalmente desacoplado de React, Zustand, UI e Supabase.
// Zero explicit any.

import { TableDatumStatus } from './table-datum.types';
import { TableCellLiteralContent, TableBindingMode, TableHorizontalAlign } from '../table-core/table.types';

export type ProductKnowledgeResultKind = 'datum' | 'dataset' | 'saved_view' | 'asset';

export type ProductKnowledgeProviderStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'unavailable' | 'error';

export interface BaseProductKnowledgeSearchResult {
  readonly id: string;
  readonly kind: ProductKnowledgeResultKind;
  readonly semanticKey: string;
  readonly label: string;
  readonly description?: string;
  readonly status: TableDatumStatus;
  readonly origin: string;
  readonly sourceCount: number;
  readonly preview: string | TableCellLiteralContent;
  readonly datasetId?: string;
  readonly savedViewId?: string;
  readonly sourceRevision?: number;
  readonly sourceOwnerKind?: 'product' | 'family';
  readonly sourceOwnerId?: string;
}

export interface BindableProductKnowledgeResult extends BaseProductKnowledgeSearchResult {
  readonly bindable: true;
  readonly productId: string;
  readonly productModel?: string;
}

export interface AbstractFamilyKnowledgeResult extends BaseProductKnowledgeSearchResult {
  readonly bindable: false;
  readonly productId?: undefined;
  readonly productModel?: undefined;
  readonly sourceOwnerKind: 'family';
  readonly sourceOwnerId: string;
}

export type ProductKnowledgeSearchResult = BindableProductKnowledgeResult | AbstractFamilyKnowledgeResult;

export interface ProductKnowledgeDatumResult {
  readonly productId: string;
  readonly semanticKey: string;
  readonly label: string;
  readonly status: TableDatumStatus;
  readonly origin: string;
  readonly sourceCount: number;
  readonly value: TableCellLiteralContent;
  readonly sourceRevision?: number;
  readonly sourceOwnerKind?: 'product' | 'family';
  readonly sourceOwnerId?: string;
}

export interface BoundTechnicalCellProjection {
  readonly kind: 'bound';
  readonly datumId: string;
  readonly datumKey: string;
  readonly value: TableCellLiteralContent;
  readonly sourceOwnerKind?: 'product' | 'family';
  readonly sourceOwnerId?: string;
  readonly sourceRevision?: number;
}

export interface LiteralCellProjection {
  readonly kind: 'literal';
  readonly value: TableCellLiteralContent;
}

export type TechnicalCellProjection = BoundTechnicalCellProjection | LiteralCellProjection;

export interface TechnicalDatasetCellProjection {
  readonly datumId: string;
  readonly datumKey: string;
  readonly value: TableCellLiteralContent;
  readonly sourceOwnerKind?: 'product' | 'family';
  readonly sourceOwnerId?: string;
  readonly sourceRevision?: number;
}

export interface TechnicalDatasetColumn {
  readonly id?: string;
  readonly key: string;
  readonly label: string;
  readonly widthMm?: number;
  readonly align?: TableHorizontalAlign;
  readonly isCustom?: boolean;
}

export interface TechnicalDatasetRow {
  readonly rowId: string;
  readonly label?: string;
  readonly cells: Record<
    string,
    BoundTechnicalCellProjection | LiteralCellProjection | TechnicalDatasetCellProjection | TableCellLiteralContent
  >;
}

export interface SavedViewProjection {
  readonly id: string;
  readonly title: string;
  readonly productId: string;
  readonly columns: readonly TechnicalDatasetColumn[];
  readonly rows?: readonly TechnicalDatasetRow[];
  readonly datasetId?: string;
  readonly bindingMode: TableBindingMode;
  readonly sourceRevision?: number;
  readonly sourceOwnerKind?: 'product' | 'family';
  readonly sourceOwnerId?: string;
}

export interface TechnicalDatasetProjection {
  readonly datasetId: string;
  readonly productId: string;
  readonly title?: string;
  readonly columns: readonly TechnicalDatasetColumn[];
  readonly rows: readonly TechnicalDatasetRow[];
  readonly bindingMode: TableBindingMode;
  readonly sourceRevision?: number;
  readonly sourceOwnerKind?: 'product' | 'family';
  readonly sourceOwnerId?: string;
}

/**
 * Contrato de Provedor de Conhecimento de Produto do PIM.
 */
export interface ProductKnowledgeProvider {
  isAvailable?(): boolean;
  getStatus?(): ProductKnowledgeProviderStatus;
  search(productId: string | undefined, query: string): Promise<ProductKnowledgeSearchResult[]>;
  getDatum(productId: string, semanticKey: string): Promise<ProductKnowledgeDatumResult | undefined>;
  getDataset(productId: string, datasetId: string): Promise<TechnicalDatasetProjection | undefined>;
  getSavedView(productId: string, viewId: string): Promise<SavedViewProjection | undefined>;
}

/**
 * Provider padrão para ambiente de produção quando a integração real com o PIM ainda não está conectada.
 * Fail-closed estrito (Emenda 1 & 10): Nunca retorna dados fictícios em produção.
 */
export class UnavailableProductKnowledgeProvider implements ProductKnowledgeProvider {
  isAvailable(): boolean {
    return false;
  }

  async search(_productId?: string | undefined, _query?: string): Promise<ProductKnowledgeSearchResult[]> {
    return [];
  }

  async getDatum(_productId?: string, _semanticKey?: string): Promise<ProductKnowledgeDatumResult | undefined> {
    return undefined;
  }

  async getDataset(_productId?: string, _datasetId?: string): Promise<TechnicalDatasetProjection | undefined> {
    return undefined;
  }

  async getSavedView(_productId?: string, _viewId?: string): Promise<SavedViewProjection | undefined> {
    return undefined;
  }
}

/**
 * Provider Test-Double para suítes de testes unitários e de integração (Emenda 1).
 * PROIBIDO o uso em runtime de produção.
 */
export class TestProductKnowledgeProvider implements ProductKnowledgeProvider {
  private readonly items: ProductKnowledgeSearchResult[] = [];
  private readonly datasets = new Map<string, TechnicalDatasetProjection>();
  private readonly savedViews = new Map<string, SavedViewProjection>();

  isAvailable(): boolean {
    return true;
  }

  constructor(initialItems?: ProductKnowledgeSearchResult[]) {
    if (initialItems) {
      this.items = [...initialItems];
    }
  }

  registerDataset(dataset: TechnicalDatasetProjection): void {
    this.datasets.set(`${dataset.productId}:${dataset.datasetId}`, dataset);
  }

  registerSavedView(view: SavedViewProjection): void {
    this.savedViews.set(`${view.productId}:${view.id}`, view);
  }

  async search(productId: string | undefined, query: string): Promise<ProductKnowledgeSearchResult[]> {
    const q = query.toLowerCase().trim();
    return this.items.filter((item) => {
      const matchProduct = !productId || item.productId === productId;
      const matchQuery =
        !q ||
        item.label.toLowerCase().includes(q) ||
        item.semanticKey.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q));
      return matchProduct && matchQuery;
    });
  }

  async getDatum(productId: string, semanticKey: string): Promise<ProductKnowledgeDatumResult | undefined> {
    const found = this.items.find(
      (it): it is BindableProductKnowledgeResult =>
        it.bindable && it.kind === 'datum' && it.productId === productId && it.semanticKey === semanticKey
    );
    if (!found) return undefined;

    return {
      productId: found.productId,
      semanticKey: found.semanticKey,
      label: found.label,
      status: found.status,
      origin: found.origin,
      sourceCount: found.sourceCount,
      value: typeof found.preview === 'string' ? { kind: 'text', text: found.preview } : found.preview,
      sourceRevision: found.sourceRevision
    };
  }

  async getDataset(productId: string, datasetId: string): Promise<TechnicalDatasetProjection | undefined> {
    return this.datasets.get(`${productId}:${datasetId}`);
  }

  async getSavedView(productId: string, viewId: string): Promise<SavedViewProjection | undefined> {
    const found = this.savedViews.get(`${productId}:${viewId}`);
    if (found) return found;

    return {
      id: viewId,
      title: 'Saved View Padrão',
      productId,
      columns: [
        { key: 'range', label: 'Faixa' },
        { key: 'accuracy', label: 'Exatidão' },
        { key: 'stability', label: 'Estabilidade' }
      ],
      rows: [],
      bindingMode: 'live',
      sourceRevision: 1
    };
  }
}

// src/domain/table-binding/product-registry-reader.types.ts
// Interface pura de leitura de identidade de produtos (Emenda 3).
// Desacopla o ProductKnowledgeProvider e o Runtime de Zustand ou componentes React.
// Zero dependência de Supabase ou React. Zero explicit any.

export interface ProductIdentity {
  readonly id: string;
  readonly code: string;
  readonly model?: string;
  readonly name?: string;
  readonly familyId?: string;
  readonly familyName?: string;
}

/**
 * Leitor canônico de identidade de produto para resolução de escopo e herança familiar.
 */
export interface ProductRegistryReader {
  getProductIdentity(productId: string): Promise<ProductIdentity | null>;
  getProductsByIds(ids: string[]): Promise<ProductIdentity[]>;
  getAllProducts?(): Promise<ProductIdentity[]>;
}

/**
 * Implementação em memória para testes e cenários desacoplados.
 */
export class InMemoryProductRegistryReader implements ProductRegistryReader {
  private readonly products = new Map<string, ProductIdentity>();

  constructor(initialProducts?: readonly ProductIdentity[]) {
    if (initialProducts) {
      for (const p of initialProducts) {
        this.products.set(p.id, p);
      }
    }
  }

  public registerProduct(product: ProductIdentity): void {
    this.products.set(product.id, product);
  }

  public async getProductIdentity(productId: string): Promise<ProductIdentity | null> {
    return this.products.get(productId) ?? null;
  }

  public async getProductsByIds(ids: string[]): Promise<ProductIdentity[]> {
    const result: ProductIdentity[] = [];
    for (const id of ids) {
      const p = this.products.get(id);
      if (p) result.push(p);
    }
    return result;
  }

  public async getAllProducts(): Promise<ProductIdentity[]> {
    return Array.from(this.products.values());
  }
}

import { Catalog } from '../domain/catalog.schema';
import { Product } from '../domain/product.schema';
import { calculateRowDivergences, FieldDivergence } from '../domain/divergence';

export interface ComplianceItem {
  pageNumber: number;
  blockId: string;
  productCode: string;
  productModel: string;
  divergences: FieldDivergence[];
  notes?: string;
}

export interface ComplianceReport {
  totalRowsChecked: number;
  divergenceCount: number;
  isFullyCompliant: boolean;
  items: ComplianceItem[];
  generatedAt: string;
}

export class AIService {
  /**
   * Varre todas as tabelas do catálogo e gera um relatório factual de conformidade contra a biblioteca oficial.
   */
  static checkCatalogCompliance(
    catalog: Catalog,
    libraryProducts: Product[]
  ): ComplianceReport {
    const items: ComplianceItem[] = [];
    let totalRowsChecked = 0;
    let divergenceCount = 0;

    const productMap = new Map<string, Product>();
    for (const prod of libraryProducts) {
      productMap.set(prod.id, prod);
    }

    for (const page of catalog.pages) {
      for (const block of page.blocks || []) {
        if (block.type === 'table' && block.tableRows) {
          for (const row of block.tableRows) {
            totalRowsChecked++;
            const product = row.productRefId ? productMap.get(row.productRefId) : undefined;
            if (!product) {
              items.push({
                pageNumber: page.pageNumber,
                blockId: block.id,
                productCode: 'DESCONHECIDO',
                productModel: 'Produto não encontrado na biblioteca',
                divergences: [],
                notes: 'O produto referenciado nesta linha foi removido ou não existe na biblioteca oficial.'
              });
              divergenceCount++;
              continue;
            }

            const divergences = calculateRowDivergences(row, product);
            if (divergences.length > 0) {
              divergenceCount += divergences.length;
              items.push({
                pageNumber: page.pageNumber,
                blockId: block.id,
                productCode: product.code,
                productModel: product.model,
                divergences
              });
            }
          }
        }
      }
    }

    return {
      totalRowsChecked,
      divergenceCount,
      isFullyCompliant: divergenceCount === 0,
      items,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Responde perguntas do usuário baseando-se estritamente nos dados oficiais da biblioteca de produtos.
   */
  static queryLibrary(
    query: string,
    libraryProducts: Product[]
  ): { answer: string; matchedProducts: Product[]; confidence: 'high' | 'medium' | 'none' } {
    const q = query.toLowerCase().trim();
    if (!q) {
      return {
        answer: 'Por favor, digite sua dúvida sobre modelos, faixas de medição ou especificações dos sensores.',
        matchedProducts: [],
        confidence: 'none'
      };
    }

    const matched = libraryProducts.filter((p) => {
      const fullText = `${p.code} ${p.family} ${p.model} ${p.description} ${p.specs.range} ${p.specs.unit} ${p.specs.accuracy}`.toLowerCase();
      return fullText.includes(q) || q.split(' ').some((term) => term.length > 2 && fullText.includes(term));
    });

    if (matched.length === 0) {
      return {
        answer: `⚠️ **Informação não encontrada na Biblioteca Oficial:**\nNão localizei nenhum sensor ou especificação cadastrada com o termo "${query}". Por diretriz de segurança, o assistente não inventa dados técnicos.`,
        matchedProducts: [],
        confidence: 'none'
      };
    }

    let responseText = `🔍 **Encontrei ${matched.length} produto(s) correspondente(s) na Biblioteca Oficial:**\n\n`;
    for (const p of matched.slice(0, 3)) {
      responseText += `- **${p.code} (${p.model}):**\n`;
      responseText += `  • Família: ${p.family}\n`;
      responseText += `  • Faixa Nominal: ${p.specs.range} ${p.specs.unit}\n`;
      responseText += `  • Precisão: ${p.specs.accuracy}\n`;
      responseText += `  • Sinal de Saída: ${p.specs.output || 'N/A'}\n`;
      responseText += `  • Conexão de Processo: ${p.specs.processConnection || 'N/A'}\n\n`;
    }

    return {
      answer: responseText,
      matchedProducts: matched,
      confidence: matched.length === 1 ? 'high' : 'medium'
    };
  }
}

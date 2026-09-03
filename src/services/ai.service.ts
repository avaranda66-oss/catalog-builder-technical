import { Catalog, BlockType } from '../domain/catalog.schema';
import { Product } from '../domain/product.schema';
import { calculateRowDivergences, FieldDivergence } from '../domain/divergence';
import {
  evaluateBlockComplianceCapability,
  isTableLikeBlock
} from '../domain/compliance-coverage';

export type ComplianceStatus = 'compliant' | 'divergent' | 'partial' | 'no_tables';

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
  coverageComplete: boolean;
  complianceStatus: ComplianceStatus;
  auditedBlocksCount: number;
  skippedBlocksCount: number;
  skippedBlockTypes: BlockType[];
  items: ComplianceItem[];
  generatedAt: string;
  notes?: string;
}

export class AIService {
  /**
   * Tradução do catálogo via serviço de IA.
   * Na Fase P0/P1, chamadas externas de IA estão desabilitadas no cliente para proteção de credenciais.
   * A integração será ativada via Supabase Edge Function autenticada na Fase P2.
   */
  static async translateCatalog(
    _catalog: Catalog,
    _targetLanguage: string = 'English'
  ): Promise<{ success: boolean; catalog?: Catalog; error?: string }> {
    return {
      success: false,
      error: 'A tradução via IA em tempo real está programada para execução segura via Supabase Edge Function autenticada (Fase P2).'
    };
  }

  /**
   * Varre todas as tabelas do catálogo e gera um relatório de conformidade factual contra a biblioteca oficial em memória.
   * 100% determinístico e seguro (Zero chamadas de rede externas).
   * Reporta veracidade de cobertura (Fase CORE.H2): distingue 100% conforme de auditoria parcial ou ausência de tabelas.
   */
  static checkCatalogCompliance(
    catalog: Catalog,
    libraryProducts: Product[]
  ): ComplianceReport {
    const items: ComplianceItem[] = [];
    let totalRowsChecked = 0;
    let divergenceCount = 0;
    let auditedBlocksCount = 0;
    let skippedBlocksCount = 0;
    const skippedBlockTypesSet = new Set<BlockType>();

    const productMap = new Map<string, Product>();
    for (const prod of libraryProducts) {
      productMap.set(prod.id, prod);
    }

    for (const page of catalog.pages || []) {
      for (const block of page.blocks || []) {
        if (!isTableLikeBlock(block.type)) continue;

        const evalResult = evaluateBlockComplianceCapability(block);

        if (evalResult.isSupported && block.tableRows) {
          auditedBlocksCount++;
          for (const row of block.tableRows) {
            totalRowsChecked++;
            const product = row.productRefId ? productMap.get(row.productRefId) : undefined;
            if (!product) {
              items.push({
                pageNumber: page.pageNumber,
                blockId: block.id,
                productCode: 'UNKNOWN',
                productModel: 'Produto não encontrado na biblioteca',
                divergences: [],
                notes: 'O produto referenciado foi removido ou não existe na biblioteca oficial.'
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
        } else {
          // Bloco tabular não suportado / skipped para conferência de produtos
          skippedBlocksCount++;
          skippedBlockTypesSet.add(block.type);
        }
      }
    }

    const skippedBlockTypes = Array.from(skippedBlockTypesSet);
    const coverageComplete = skippedBlocksCount === 0;
    const isFullyCompliant = divergenceCount === 0 && coverageComplete && totalRowsChecked > 0;

    let complianceStatus: ComplianceStatus;
    if (divergenceCount > 0) {
      complianceStatus = 'divergent';
    } else if (skippedBlocksCount > 0) {
      complianceStatus = 'partial';
    } else if (totalRowsChecked === 0) {
      complianceStatus = 'no_tables';
    } else {
      complianceStatus = 'compliant';
    }

    let notes: string | undefined;
    if (complianceStatus === 'no_tables') {
      if (auditedBlocksCount > 0) {
        notes = 'Nenhuma linha ou especificação vinculada à Biblioteca Oficial encontrada nas tabelas do catálogo.';
      } else {
        notes = 'Nenhuma tabela compatível com a Biblioteca Oficial encontrada para auditoria.';
      }
    } else if (complianceStatus === 'partial') {
      notes = `Auditoria parcial: ${auditedBlocksCount} tabela(s) verificada(s), ${skippedBlocksCount} estrutura(s) especializada(s) não suportada(s) (${skippedBlockTypes.join(', ')}).`;
    }

    return {
      totalRowsChecked,
      divergenceCount,
      isFullyCompliant,
      coverageComplete,
      complianceStatus,
      auditedBlocksCount,
      skippedBlocksCount,
      skippedBlockTypes,
      items,
      generatedAt: new Date().toISOString(),
      notes
    };
  }

  /**
   * Consulta a biblioteca de produtos de forma factual e determinística em memória.
   * Não inventa dados e responde estritamente com base nos registros verificados.
   */
  static queryLibrary(
    query: string,
    libraryProducts: Product[]
  ): { answer: string; matchedProducts: Product[]; confidence: 'high' | 'medium' | 'none' } {
    const q = query.toLowerCase().trim();
    if (!q) {
      return {
        answer: 'Por favor, digite sua consulta sobre modelos, faixas de pressão ou especificações técnicas.',
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
        answer: `⚠️ **Informação não localizada na Biblioteca Oficial:**\nNenhum sensor ou especificação encontrada para "${query}". Por diretriz de segurança, o assistente não inventa dados técnicos.`,
        matchedProducts: [],
        confidence: 'none'
      };
    }

    let responseText = `🔍 **Localizado(s) ${matched.length} produto(s) na Biblioteca Oficial:**\n\n`;
    for (const p of matched.slice(0, 3)) {
      responseText += `- **${p.code} (${p.model}):**\n`;
      responseText += `  • Família: ${p.family}\n`;
      responseText += `  • Faixa: ${p.specs.range} ${p.specs.unit}\n`;
      responseText += `  • Exatidão: ${p.specs.accuracy}\n`;
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

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

export const GEMINI_API_KEY =
  import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyA_g3VFEPbNMO_gqGIXw_lp6l9rBKjfr1Y';

export class AIService {
  /**
   * Translates the entire catalog to the target language using Google Gemini AI.
   * Directly updates titles, subtitles, text blocks, table columns, legends, and canvas layers in real time.
   */
  static async translateCatalog(
    catalog: Catalog,
    targetLanguage: string = 'English'
  ): Promise<{ success: boolean; catalog?: Catalog; error?: string }> {
    try {
      // 1. Extract all translatable texts into a clean structured payload
      const textsToTranslate: Record<string, string> = {};

      if (catalog.title) textsToTranslate['catalog_title'] = catalog.title;
      if (catalog.subtitle) textsToTranslate['catalog_subtitle'] = catalog.subtitle;

      catalog.pages.forEach((page, pageIdx) => {
        if (page.title) textsToTranslate[`page_${pageIdx}_title`] = page.title;

        page.blocks.forEach((block) => {
          if (block.title) textsToTranslate[`block_${block.id}_title`] = block.title;
          if (block.subtitle) textsToTranslate[`block_${block.id}_subtitle`] = block.subtitle;
          if (block.badgeText) textsToTranslate[`block_${block.id}_badge`] = block.badgeText;
          if (block.textContent) textsToTranslate[`block_${block.id}_text`] = block.textContent;

          // Table columns
          if (block.tableColumns) {
            block.tableColumns.forEach((col, cIdx) => {
              if (col.label) textsToTranslate[`block_${block.id}_col_${cIdx}`] = col.label;
            });
          }

          // Features list
          if (block.features) {
            block.features.forEach((feat, fIdx) => {
              if (feat.title) textsToTranslate[`block_${block.id}_feat_${fIdx}_title`] = feat.title;
              if (feat.description) textsToTranslate[`block_${block.id}_feat_${fIdx}_desc`] = feat.description;
            });
          }

          // Custom data / Canvas Layers / Legend
          const custom = block.customData || {};
          if (custom.brandSubtitle) textsToTranslate[`block_${block.id}_brandSubtitle`] = custom.brandSubtitle;
          if (custom.overview) textsToTranslate[`block_${block.id}_overview`] = custom.overview;
          if (custom.legendTitle) textsToTranslate[`block_${block.id}_legendTitle`] = custom.legendTitle;

          // Canvas layers
          if (Array.isArray(custom.canvasLayers)) {
            custom.canvasLayers.forEach((layer: any, lIdx: number) => {
              if (layer.content) textsToTranslate[`block_${block.id}_layer_${lIdx}_content`] = layer.content;
              if (layer.label) textsToTranslate[`block_${block.id}_layer_${lIdx}_label`] = layer.label;
            });
          }

          // Legend custom labels
          if (custom.legendLabels && typeof custom.legendLabels === 'object') {
            Object.entries(custom.legendLabels).forEach(([key, val]) => {
              if (typeof val === 'string') textsToTranslate[`block_${block.id}_legend_${key}`] = val;
            });
          }
        });
      });

      // 2. Call Google Gemini API
      const prompt = `You are a professional industrial instrumentation and metrology technical translator.
Translate all values in the following JSON dictionary to ${targetLanguage}.
Keep all technical codes, units (bar, psi, mA, V, °C, etc.), and formulas intact.
Return ONLY valid JSON with the exact same keys and the translated values. Do not wrap in markdown or commentary.

${JSON.stringify(textsToTranslate, null, 2)}`;

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn('Gemini API Translation Error:', errorText);
        return { success: false, error: `Gemini API Error: ${response.statusText}` };
      }

      const resData = await response.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        return { success: false, error: 'Empty response received from Gemini AI.' };
      }

      const cleanJson = rawText.replace(/```json\n?|```/g, '').trim();
      const translations: Record<string, string> = JSON.parse(cleanJson);

      // 3. Re-inject translations into a cloned Catalog
      const updatedCatalog: Catalog = JSON.parse(JSON.stringify(catalog));

      if (translations['catalog_title']) updatedCatalog.title = translations['catalog_title'];
      if (translations['catalog_subtitle']) updatedCatalog.subtitle = translations['catalog_subtitle'];

      updatedCatalog.pages.forEach((page, pageIdx) => {
        if (translations[`page_${pageIdx}_title`]) {
          page.title = translations[`page_${pageIdx}_title`];
        }

        page.blocks.forEach((block) => {
          if (translations[`block_${block.id}_title`]) block.title = translations[`block_${block.id}_title`];
          if (translations[`block_${block.id}_subtitle`]) block.subtitle = translations[`block_${block.id}_subtitle`];
          if (translations[`block_${block.id}_badge`]) block.badgeText = translations[`block_${block.id}_badge`];
          if (translations[`block_${block.id}_text`]) block.textContent = translations[`block_${block.id}_text`];

          if (block.tableColumns) {
            block.tableColumns.forEach((col, cIdx) => {
              if (translations[`block_${block.id}_col_${cIdx}`]) {
                col.label = translations[`block_${block.id}_col_${cIdx}`];
              }
            });
          }

          if (block.features) {
            block.features.forEach((feat, fIdx) => {
              if (translations[`block_${block.id}_feat_${fIdx}_title`]) {
                feat.title = translations[`block_${block.id}_feat_${fIdx}_title`];
              }
              if (translations[`block_${block.id}_feat_${fIdx}_desc`]) {
                feat.description = translations[`block_${block.id}_feat_${fIdx}_desc`];
              }
            });
          }

          const custom = block.customData || {};
          if (translations[`block_${block.id}_brandSubtitle`]) custom.brandSubtitle = translations[`block_${block.id}_brandSubtitle`];
          if (translations[`block_${block.id}_overview`]) custom.overview = translations[`block_${block.id}_overview`];
          if (translations[`block_${block.id}_legendTitle`]) custom.legendTitle = translations[`block_${block.id}_legendTitle`];

          if (Array.isArray(custom.canvasLayers)) {
            custom.canvasLayers.forEach((layer: any, lIdx: number) => {
              if (translations[`block_${block.id}_layer_${lIdx}_content`]) {
                layer.content = translations[`block_${block.id}_layer_${lIdx}_content`];
              }
              if (translations[`block_${block.id}_layer_${lIdx}_label`]) {
                layer.label = translations[`block_${block.id}_layer_${lIdx}_label`];
              }
            });
          }

          if (custom.legendLabels && typeof custom.legendLabels === 'object') {
            const updatedLegend: Record<string, string> = { ...custom.legendLabels };
            Object.keys(updatedLegend).forEach((key) => {
              if (translations[`block_${block.id}_legend_${key}`]) {
                updatedLegend[key] = translations[`block_${block.id}_legend_${key}`];
              }
            });
            custom.legendLabels = updatedLegend;
          }

          block.customData = custom;
        });
      });

      return { success: true, catalog: updatedCatalog };
    } catch (err: any) {
      console.error('Error translating catalog:', err);
      return { success: false, error: err.message || 'Translation failed' };
    }
  }

  /**
   * Scans all tables in the catalog and generates a factual compliance report against the official library.
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
                productCode: 'UNKNOWN',
                productModel: 'Product not found in library',
                divergences: [],
                notes: 'The referenced product was removed or does not exist in the library.'
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
   * Answers user questions strictly based on official product library data.
   */
  static queryLibrary(
    query: string,
    libraryProducts: Product[]
  ): { answer: string; matchedProducts: Product[]; confidence: 'high' | 'medium' | 'none' } {
    const q = query.toLowerCase().trim();
    if (!q) {
      return {
        answer: 'Please type your question regarding models, pressure ranges, or sensor specifications.',
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
        answer: `⚠️ **Information not found in Official Library:**\nNo sensor or specification found for "${query}". By safety guidelines, the assistant does not fabricate technical data.`,
        matchedProducts: [],
        confidence: 'none'
      };
    }

    let responseText = `🔍 **Found ${matched.length} matching product(s) in Official Library:**\n\n`;
    for (const p of matched.slice(0, 3)) {
      responseText += `- **${p.code} (${p.model}):**\n`;
      responseText += `  • Family: ${p.family}\n`;
      responseText += `  • Range: ${p.specs.range} ${p.specs.unit}\n`;
      responseText += `  • Accuracy: ${p.specs.accuracy}\n`;
      responseText += `  • Output: ${p.specs.output || 'N/A'}\n`;
      responseText += `  • Process Connection: ${p.specs.processConnection || 'N/A'}\n\n`;
    }

    return {
      answer: responseText,
      matchedProducts: matched,
      confidence: matched.length === 1 ? 'high' : 'medium'
    };
  }
}

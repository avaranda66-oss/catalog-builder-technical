import { describe, expect, it } from 'vitest';
import * as viaExtraction from '../../../src/vnext/ai-catalog/fact-extraction';
import {
  ALL_MODELS_COLUMN, FACT_EXTRACTION_PROMPT_VERSION, FACT_EXTRACTION_PROMPT_VERSION_V3, PAGE_CONTENT_KINDS,
  buildFactExtractionPrompt, buildFactExtractionPromptV3, factSheetResponseSchema, factSheetResponseSchemaV3,
  type ExtractionSource,
} from '../../../src/vnext/ai-catalog/fact-extraction-prompt';

const MANUAL: ExtractionSource = {
  sourceId: 'arquivo', fileName: 'manual-ta.pdf', sha256: 'b'.repeat(64), pageCount: 39, firstPage: 5, lastPage: 8,
};
const TA = ['TA-25N', 'TA-35N', 'TA-50N'];
type Node = { type?: string; maxLength?: number; enum?: string[]; maxItems?: number; minItems?: number;
  properties?: Record<string, Node>; items?: Node; required?: string[] };

describe('fact extraction prompt module (FR-66, shared by Deno, Node and the browser)', () => {
  it('keeps the spike v2 prompt and schema, re-exported by fact-extraction.ts unchanged', () => {
    expect(viaExtraction.buildFactExtractionPrompt).toBe(buildFactExtractionPrompt);
    expect(viaExtraction.factSheetResponseSchema).toBe(factSheetResponseSchema);
    expect(viaExtraction.FACT_EXTRACTION_PROMPT_VERSION).toBe('fr66a-2026-10-15.2');
    expect(FACT_EXTRACTION_PROMPT_VERSION).toBe('fr66a-2026-10-15.2');
  });

  it('v3 is the v2 prompt word for word plus the shared-table and page rules', () => {
    const v2 = buildFactExtractionPrompt({ sources: [MANUAL], models: TA });
    const v3 = buildFactExtractionPromptV3({ sources: [MANUAL], models: TA });
    expect(v3.startsWith(v2 + '\n')).toBe(true);
    const added = v3.slice(v2.length + 1).split('\n');
    expect(added.map(item => item.split('.')[0])).toEqual(['13', '14', '15', '16']);
    expect(v3).toContain('goes in "sharedTables", never in "sections". Do not skip it: copy every row');
    expect(v3).toContain('each copied exactly as printed and never renamed or translated; when a header is printed in two lines, copy only its first line');
    expect(v3).toContain('own printed header (for example "Entradas"), not under a name you choose');
    expect(v3).toContain(`use one column named "${ALL_MODELS_COLUMN}"`);
    expect(v3).toContain('each row has ONE sourceRef');
    expect(v3).toContain('pages = one entry for EVERY page you were asked to read');
    expect(v3).toContain('Read ONLY pages 5 to 8.');
    expect(FACT_EXTRACTION_PROMPT_VERSION_V3).not.toBe(FACT_EXTRACTION_PROMPT_VERSION);
  });

  it('v3 schema extends v2, bounds every string and reports pages by an enum', () => {
    const v2 = factSheetResponseSchema(['arquivo']) as Node;
    const v3 = factSheetResponseSchemaV3(['arquivo']) as Node;
    for (const key of ['title', 'models', 'sections']) expect(v3.properties?.[key]).toEqual(v2.properties?.[key]);
    expect(v3.required).toEqual(['title', 'models', 'sections', 'sharedTables', 'pages']);
    const strings: Node[] = [];
    const walk = (node: Node) => {
      if (node.type === 'STRING') strings.push(node);
      Object.values(node.properties ?? {}).forEach(walk);
      if (node.items) walk(node.items);
    };
    walk(v3);
    expect(strings.length).toBeGreaterThan(15);
    for (const node of strings) expect(node.maxLength !== undefined || node.enum !== undefined).toBe(true);
    const page = v3.properties?.pages.items as Node;
    expect(page.properties?.content.enum).toEqual([...PAGE_CONTENT_KINDS]);
    const sharedRow = v3.properties?.sharedTables.items?.properties?.rows.items as Node;
    expect(sharedRow.required).toEqual(['label', 'sourceRef', 'values']);
    expect(sharedRow.properties?.values.items?.required).toEqual(['column', 'literal']);
    // Gemini answers 400 "invalid argument" when these arrays carry maxItems (2026-10-17): the server bounds them.
    for (const node of [v3.properties?.sharedTables, v3.properties?.pages, v3.properties?.sharedTables.items?.properties?.rows,
      v3.properties?.sharedTables.items?.properties?.columns]) expect(node?.maxItems).toBeUndefined();
  });
});

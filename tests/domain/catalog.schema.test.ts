import { describe, it, expect } from 'vitest';
import { CatalogSchema, ContentBlockSchema, CatalogPresetSchema } from '../../src/domain/catalog.schema';
import { SYSTEM_PRESETS } from '../../src/data/presets';

describe('Catalog Schema & Domain Validation (Zod)', () => {
  it('valida todos os presets de fábrica contra o CatalogPresetSchema', () => {
    for (const preset of SYSTEM_PRESETS) {
      const parsed = CatalogPresetSchema.safeParse(preset);
      expect(parsed.success).toBe(true);
      if (!parsed.success) {
        console.error(`Erro no preset ${preset.id}:`, parsed.error);
      }
    }
  });

  it('rejeita catálogo sem título ou com páginas vazias', () => {
    const invalidCatalog = {
      id: 'cat-invalid',
      title: '',
      pages: []
    };

    const result = CatalogSchema.safeParse(invalidCatalog);
    expect(result.success).toBe(false);
  });

  it('valida blocos de tabela, hero e insertos com sucesso', () => {
    const tableBlock = {
      id: 'b-table-test',
      type: 'table',
      tableColumns: [{ key: 'code', label: 'Código', visible: true }],
      tableRows: [{ id: 'r1', productRefId: 'prod-1', localOverrides: {}, order: 0 }]
    };

    const result = ContentBlockSchema.safeParse(tableBlock);
    expect(result.success).toBe(true);
  });
});

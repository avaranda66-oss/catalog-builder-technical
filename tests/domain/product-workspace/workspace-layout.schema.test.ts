// tests/domain/product-workspace/workspace-layout.schema.test.ts
import { describe, it, expect } from 'vitest';
import {
  WorkspaceLayoutV1Schema,
  SemanticDescriptorSchema,
  WorkspaceTechnicalTableDefSchema,
  WorkspaceEditDraftSchema
} from '../../../src/domain/product-workspace/schema';
import { WorkspaceLayoutV1 } from '../../../src/domain/product-workspace/types';

describe('Workspace Layout V1 Schema & Referential Integrity', () => {
  it('valida com sucesso um layout V1 íntegro com seções e blocos', () => {
    const validLayout: WorkspaceLayoutV1 = {
      schemaVersion: 1,
      id: 'layout-ta25n',
      productId: 'prod-ta25n',
      title: 'Ficha Técnica TA-25N',
      description: 'Layout canônico de homologação',
      sections: [
        {
          id: 'sec-resumo',
          title: 'Resumo Executivo',
          blockIds: ['block-facts-1'],
          order: 0
        }
      ],
      blocks: {
        'block-facts-1': {
          id: 'block-facts-1',
          kind: 'fact_grid',
          title: 'Destaques',
          datumIds: ['datum-range-1', 'datum-accuracy-1'],
          columns: 2
        }
      }
    };

    const parseResult = WorkspaceLayoutV1Schema.safeParse(validLayout);
    expect(parseResult.success).toBe(true);
  });

  it('rejeita fail-closed layout com referência de bloco órfão na seção', () => {
    const invalidLayout = {
      schemaVersion: 1,
      id: 'layout-ta25n',
      productId: 'prod-ta25n',
      title: 'Ficha Técnica TA-25N',
      sections: [
        {
          id: 'sec-resumo',
          title: 'Resumo Executivo',
          blockIds: ['block-inexistente-404'],
          order: 0
        }
      ],
      blocks: {}
    };

    const parseResult = WorkspaceLayoutV1Schema.safeParse(invalidLayout);
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      expect(parseResult.error.issues[0].message).toContain('referencia blockId inexistente');
    }
  });

  it('valida descritores semânticos com regex rigoroso de chave canônica', () => {
    const validDescriptor = {
      canonicalKey: 'metrology.temperature.stability',
      displayLabel: 'Estabilidade Térmica',
      aliases: ['estabilidade', 'deriva térmica'],
      description: 'Estabilidade temporal após 30 min'
    };

    expect(SemanticDescriptorSchema.safeParse(validDescriptor).success).toBe(true);

    // Chave inválida com maiúsculas ou caracteres proibidos
    const invalidDescriptor = {
      canonicalKey: 'Metrology.Temperature.Range!',
      displayLabel: 'Faixa Inválida',
      aliases: []
    };
    expect(SemanticDescriptorSchema.safeParse(invalidDescriptor).success).toBe(false);
  });

  it('valida tabelas técnicas com células datum_ref e editorial_literal', () => {
    const validTable = {
      id: 'tbl-inserts',
      title: 'Blocos de Inserção (Inserts)',
      columns: [
        { id: 'c1', label: 'Código' },
        { id: 'c2', label: 'Furos' }
      ],
      rows: [
        { id: 'r1', label: 'IN-01', order: 0 }
      ],
      cells: {
        'r2:r1|c2:c1': { type: 'editorial_literal', value: 'IN-01' },
        'r2:r1|c2:c2': { type: 'datum_ref', datumId: 'datum-hole-1' }
      }
    };

    expect(WorkspaceTechnicalTableDefSchema.safeParse(validTable).success).toBe(true);
  });

  it('valida staging drafts de edição técnica com valores tipados', () => {
    const validDraft = {
      productId: 'prod-ta25n',
      stagedDatumChanges: {
        'datum-temp-1': {
          datumId: 'datum-temp-1',
          semanticKey: 'metrology.temperature.range',
          oldValue: { type: 'range', lower: -25, upper: 140, unit: '°C' },
          newValue: { type: 'range', lower: -30, upper: 140, unit: '°C' },
          reason: 'Nova calibração de fábrica',
          stagedAt: '2026-09-04T05:00:00Z'
        }
      }
    };

    expect(WorkspaceEditDraftSchema.safeParse(validDraft).success).toBe(true);
  });
});

// tests/translation/white-screen-repro.test.ts
// Validação de que os casos de reprodução de dados legados agora passam com segurança e sem lançar erro.

import { describe, it, expect } from 'vitest';
import { PrintableTextRegistry } from '@/translation/printable-text.registry';

describe('REPRODUCTION FIXED: Malformed / Legacy customData shapes are safely handled', () => {
  it('REPRO 1 FIXED: customData.bulletList string instead of array no longer throws', () => {
    const malformedCatalog: any = {
      id: 'cat-malformed-1',
      title: 'Test',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 'b1',
              type: 'additel_two_col_hero',
              customData: {
                bulletList: 'not an array - legacy string format'
              }
            }
          ]
        }
      ]
    };

    expect(() => {
      const nodes = PrintableTextRegistry.extractCatalogNodes(malformedCatalog);
      expect(nodes).toBeDefined();
    }).not.toThrow();
  });

  it('REPRO 2 FIXED: customData.items object in software_connectivity no longer throws', () => {
    const malformedCatalog: any = {
      id: 'cat-malformed-2',
      title: 'Test',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 'b2',
              type: 'software_connectivity',
              customData: {
                items: { item1: 'Software ISOPLAN' }
              }
            }
          ]
        }
      ]
    };

    expect(() => {
      const nodes = PrintableTextRegistry.extractCatalogNodes(malformedCatalog);
      expect(nodes).toBeDefined();
    }).not.toThrow();
  });
});

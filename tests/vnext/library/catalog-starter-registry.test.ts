import { describe, expect, it } from 'vitest';
import { createCatalogDocument } from '@/vnext/application';
import {
  CatalogStarterRegistryError,
  createStaticCatalogStarterRegistry,
  type CatalogStarterDefinition,
} from '@/vnext/library';

function definition(starterId: string, revision = 1): CatalogStarterDefinition {
  let next = 1;
  return {
    starterId,
    revision,
    label: `Starter ${starterId}`,
    description: 'Descrição determinística',
    category: 'Teste',
    sourceDocument: createCatalogDocument(() => `source-${starterId}-${next++}`, `Documento ${starterId}`),
  };
}

describe('W3.F static Catalog Starter registry', () => {
  it('preserves deterministic declaration order and exposes metadata without authored documents', () => {
    const registry = createStaticCatalogStarterRegistry([definition('alpha', 3), definition('beta', 7)]);
    expect(registry.list()).toEqual([
      { starterId: 'alpha', revision: 3, label: 'Starter alpha', description: 'Descrição determinística', category: 'Teste' },
      { starterId: 'beta', revision: 7, label: 'Starter beta', description: 'Descrição determinística', category: 'Teste' },
    ]);
    expect(registry.list()[0]).not.toHaveProperty('sourceDocument');
    expect(registry.get('alpha')?.sourceDocument.title).toBe('Documento alpha');
    expect(registry.get('missing')).toBeUndefined();
  });

  it('fails closed on duplicate IDs, invalid revisions, and invalid source documents', () => {
    expect(() => createStaticCatalogStarterRegistry([definition('same'), definition('same')]))
      .toThrowError(CatalogStarterRegistryError);
    expect(() => createStaticCatalogStarterRegistry([definition('negative', -1)]))
      .toThrowError(CatalogStarterRegistryError);
    expect(() => createStaticCatalogStarterRegistry([{
      ...definition('invalid'),
      sourceDocument: { ...definition('invalid').sourceDocument, pages: [] },
    }])).toThrow();
  });
});

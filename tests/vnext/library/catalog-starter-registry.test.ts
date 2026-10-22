import { describe, expect, it } from 'vitest';
import { createCatalogDocument } from '@/vnext/application';
import {
  CatalogStarterRegistryError,
  createStaticCatalogStarterRegistry,
  createDefaultCatalogStarterRegistry,
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
  it('C1-01 retains essential and lists official starter separately without leaking dependencies in summary', () => {
    const registry = createDefaultCatalogStarterRegistry();
    expect(registry.list().map(item => item.starterId)).toEqual(['essential-technical-sheet', 'presys-ficha-tecnica-a4', 'presys-folder-a4', 'presys-ta25n-a4']);
    expect(registry.get('essential-technical-sheet')?.sourceDocument.assets).toEqual([]);
    expect(registry.get('essential-technical-sheet')?.sourceDocument.pages).toHaveLength(1);
    expect(registry.list()[3]).not.toHaveProperty('sourceDocument');
    expect(registry.list()[3]).not.toHaveProperty('requiredAssets');
  });
  it('FR-80 adds product-agnostic PRESYS starters made of archetype pages, with one recommended', () => {
    const registry = createDefaultCatalogStarterRegistry();
    const sheet = registry.get('presys-ficha-tecnica-a4');
    const folder = registry.get('presys-folder-a4');
    expect(sheet?.label).toBe('Ficha técnica (4 a 6 páginas)');
    expect(sheet?.sourceDocument.pages).toHaveLength(6);
    expect(folder?.label).toBe('Folder (8 a 12 páginas)');
    expect(folder?.sourceDocument.pages.length).toBeGreaterThanOrEqual(8);
    expect(folder?.sourceDocument.pages.length).toBeLessThanOrEqual(12);
    expect((folder?.sourceDocument.pages.length ?? 1) % 2).toBe(0);
    for (const starter of [sheet, folder]) {
      expect(starter?.sourceDocument.assets).toEqual([]);
      expect(starter?.requiredAssets).toBeUndefined();
    }
    expect(registry.list().filter(item => item.recommended).map(item => item.starterId)).toEqual(['presys-ficha-tecnica-a4']);
    expect(registry.list().find(item => item.starterId === 'presys-ta25n-a4')?.reviewNotes?.length).toBeGreaterThan(0);
  });
  it('accepts at most one recommended starter', () => {
    expect(() => createStaticCatalogStarterRegistry([
      { ...definition('first'), recommended: true }, { ...definition('second'), recommended: true },
    ])).toThrowError(CatalogStarterRegistryError);
  });
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

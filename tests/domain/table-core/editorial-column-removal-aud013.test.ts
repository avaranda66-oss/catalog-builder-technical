import { describe, expect, it } from 'vitest';
import {
  Catalog,
  ContentBlock,
  ContentBlockSchema,
  TableColumnConfig
} from '../../../src/domain/catalog.schema';
import {
  LegacyTableColumnRemovalError,
  adaptLegacyBlockToTableCore,
  removeLegacyTableColumn,
  validateTableModel
} from '../../../src/domain/table-core';
import { StorageService } from '../../../src/services/storage.service';

const columns: TableColumnConfig[] = [
  { key: 'a', label: 'A', visible: true, isCustom: true },
  { key: 'b', label: 'B', visible: true, isCustom: true },
  { key: 'c', label: 'C', visible: true, isCustom: true }
];

function createBlock(): ContentBlock {
  return {
    id: 'aud013-table',
    type: 'specs_table',
    tableColumns: columns,
    tableRows: [
      {
        id: 'row-1',
        localOverrides: { a: 'A1', b: 'B1-editorial', c: 'C1' },
        cellValues: {
          a: { kind: 'text', text: 'A1-value' },
          b: { kind: 'text', text: 'B1-ghost-value' },
          c: { kind: 'text', text: 'C1-value' }
        },
        cellBindings: {
          b: {
            sourceKind: 'pim_datum',
            productId: 'product-1',
            semanticKey: 'spec.b',
            bindingMode: 'snapshot',
            snapshot: { kind: 'text', text: 'B1-factual-snapshot' }
          },
          c: {
            sourceKind: 'pim_datum',
            productId: 'product-1',
            semanticKey: 'spec.c',
            bindingMode: 'live'
          }
        }
      },
      {
        id: 'row-2',
        localOverrides: { a: 'A2', b: 'B2-editorial', c: 'C2' }
      }
    ]
  };
}

function applyPatch(block: ContentBlock, patch: ReturnType<typeof removeLegacyTableColumn>): ContentBlock {
  return { ...block, ...patch };
}

describe('AUD013 — editorial/technical column ghost data', () => {
  it('T1 remove middle column: removes B and every row payload keyed by B', () => {
    const block = createBlock();
    const updated = applyPatch(block, removeLegacyTableColumn(block, columns, 'b'));

    expect(updated.tableColumns?.map((column) => column.key)).toEqual(['a', 'c']);
    for (const row of updated.tableRows || []) {
      expect(row.localOverrides?.b).toBeUndefined();
      expect(row.cellValues?.b).toBeUndefined();
      expect(row.cellBindings?.b).toBeUndefined();
    }
  });

  it('T2 remove last column: removes C without disturbing A/B payloads', () => {
    const block = createBlock();
    const updated = applyPatch(block, removeLegacyTableColumn(block, columns, 'c'));

    expect(updated.tableColumns?.map((column) => column.key)).toEqual(['a', 'b']);
    expect(updated.tableRows?.[0].localOverrides).toEqual({ a: 'A1', b: 'B1-editorial' });
    expect(updated.tableRows?.[0].cellBindings).toHaveProperty('b');
    expect(updated.tableRows?.[0].cellBindings).not.toHaveProperty('c');
  });

  it('T3 multiple rows: removes the target payload from every persisted row', () => {
    const block = createBlock();
    const updated = applyPatch(block, removeLegacyTableColumn(block, columns, 'b'));

    expect(updated.tableRows).toHaveLength(2);
    expect(updated.tableRows?.every((row) => row.localOverrides?.b === undefined)).toBe(true);
  });

  it('T4 factual bindings and editorial literals are both removed by the same cascade', () => {
    const block = createBlock();
    const updated = applyPatch(block, removeLegacyTableColumn(block, columns, 'b'));
    const row = updated.tableRows?.[0];

    expect(row?.localOverrides?.b).toBeUndefined();
    expect(row?.cellValues?.b).toBeUndefined();
    expect(row?.cellBindings?.b).toBeUndefined();
    expect(row?.cellBindings?.c?.semanticKey).toBe('spec.c');
  });

  it('T5 save/reload: schema roundtrip keeps B absent and the adapted Table Core valid', () => {
    const block = createBlock();
    const updated = applyPatch(block, removeLegacyTableColumn(block, columns, 'b'));
    const reloaded = ContentBlockSchema.parse(JSON.parse(JSON.stringify(updated)));
    const adapted = adaptLegacyBlockToTableCore(reloaded);

    expect(reloaded.tableColumns?.some((column) => column.key === 'b')).toBe(false);
    expect(reloaded.tableRows?.some((row) => row.localOverrides?.b !== undefined)).toBe(false);
    expect(adapted.supported).toBe(true);
    if (adapted.supported) expect(validateTableModel(adapted.table).valid).toBe(true);
  });

  it('T6 clone/serialization: positional custom_table data is canonicalized without semantic residue', () => {
    const legacyCustom: ContentBlock = {
      id: 'aud013-custom',
      type: 'custom_table',
      customData: {
        headers: ['A', 'B', 'C'],
        rows: [
          ['A-custom-1', 'B-custom-ghost-1', 'C-custom-1'],
          ['A-custom-2', 'B-custom-ghost-2', 'C-custom-2']
        ],
        showLegend: true
      }
    };

    const updated = applyPatch(
      legacyCustom,
      removeLegacyTableColumn(legacyCustom, columns, 'b')
    );
    const cloned = structuredClone(updated);
    const serialized = JSON.stringify(cloned);

    expect(cloned.tableColumns?.map((column) => column.key)).toEqual(['a', 'c']);
    expect(cloned.tableRows?.map((row) => row.localOverrides)).toEqual([
      { a: 'A-custom-1', c: 'C-custom-1' },
      { a: 'A-custom-2', c: 'C-custom-2' }
    ]);
    expect(cloned.customData).toEqual({ showLegend: true });
    expect(serialized).not.toContain('B-custom-ghost');
  });

  it('T7 re-add: a new B column with the same key does not resurrect the removed value or binding', () => {
    const block = createBlock();
    const removed = applyPatch(block, removeLegacyTableColumn(block, columns, 'b'));
    const readded: ContentBlock = {
      ...removed,
      tableColumns: [
        ...(removed.tableColumns || []),
        { key: 'b', label: 'B semelhante', visible: true, isCustom: true }
      ]
    };
    const adapted = adaptLegacyBlockToTableCore(readded);

    expect(adapted.supported).toBe(true);
    if (adapted.supported) {
      const mapping = adapted.bridge.getByLegacyCoordinates('row-1', 'b');
      expect(mapping?.content).toEqual({ kind: 'empty' });
      expect(mapping?.cellBinding).toBeUndefined();
    }
  });

  it('T8 unrelated rows/columns preserve identity when no target payload requires cloning', () => {
    const block = createBlock();
    const unaffectedRow = {
      id: 'row-3',
      localOverrides: { a: 'A3', c: 'C3' }
    };
    block.tableRows = [...(block.tableRows || []), unaffectedRow];
    const aColumn = columns[0];
    const cColumn = columns[2];
    const cBinding = block.tableRows[0].cellBindings?.c;

    const patch = removeLegacyTableColumn(block, columns, 'b');

    expect(patch.tableColumns[0]).toBe(aColumn);
    expect(patch.tableColumns[1]).toBe(cColumn);
    expect(patch.tableRows?.[2]).toBe(unaffectedRow);
    expect(patch.tableRows?.[0].cellBindings?.c).toBe(cBinding);
  });

  it('T9 fail-before-mutation: invalid removal leaves the input bit-identical', () => {
    const block = createBlock();
    const before = JSON.stringify(block);

    expect(() => removeLegacyTableColumn(block, [columns[0]], 'a')).toThrowError(
      LegacyTableColumnRemovalError
    );
    expect(JSON.stringify(block)).toBe(before);
  });

  it('T10 hybrid custom_table preserves canonical tableRows authority', () => {
    const hybridCustom: ContentBlock = {
      id: 'aud013-hybrid-custom',
      type: 'custom_table',
      tableColumns: columns,
      customData: {
        headers: ['A', 'B', 'C'],
        rows: [
          ['legacy-A1', 'legacy-B1', 'legacy-C1'],
          ['legacy-A2', 'legacy-B2', 'legacy-C2']
        ],
        showLegend: true
      },
      tableRows: [
        {
          id: 'row-1',
          localOverrides: { a: 'canonical-A1', b: 'canonical-B1', c: 'canonical-C1' },
          cellValues: {
            a: { kind: 'text', text: 'canonical-A1-value' },
            b: { kind: 'text', text: 'canonical-B1-value' },
            c: { kind: 'text', text: 'canonical-C1-value' }
          },
          cellBindings: {
            c: {
              sourceKind: 'pim_datum',
              productId: 'product-1',
              semanticKey: 'spec.c',
              bindingMode: 'live'
            }
          }
        },
        {
          id: 'row-2',
          localOverrides: { a: 'canonical-A2', b: 'canonical-B2', c: 'canonical-C2' }
        },
        {
          id: 'row-3',
          localOverrides: { a: 'NEW-A3', b: 'NEW-B3', c: 'NEW-C3' },
          cellBindings: {
            a: {
              sourceKind: 'pim_datum',
              productId: 'product-3',
              semanticKey: 'spec.a',
              bindingMode: 'snapshot',
              snapshot: { kind: 'text', text: 'NEW-A3-snapshot' }
            },
            b: {
              sourceKind: 'pim_datum',
              productId: 'product-3',
              semanticKey: 'spec.b',
              bindingMode: 'live'
            }
          }
        }
      ]
    };

    const updated = applyPatch(
      hybridCustom,
      removeLegacyTableColumn(hybridCustom, columns, 'b')
    );

    expect(updated.tableColumns?.map((column) => column.key)).toEqual(['a', 'c']);
    expect(updated.tableRows?.map((row) => row.id)).toEqual(['row-1', 'row-2', 'row-3']);
    expect(updated.tableRows).toHaveLength(3);
    expect(updated.tableRows?.[0].localOverrides).toEqual({ a: 'canonical-A1', c: 'canonical-C1' });
    expect(updated.tableRows?.[0].cellValues).toEqual({
      a: { kind: 'text', text: 'canonical-A1-value' },
      c: { kind: 'text', text: 'canonical-C1-value' }
    });
    expect(updated.tableRows?.[0].cellBindings?.c?.semanticKey).toBe('spec.c');
    expect(updated.tableRows?.[2].localOverrides).toEqual({ a: 'NEW-A3', c: 'NEW-C3' });
    expect(updated.tableRows?.[2].cellBindings?.a?.semanticKey).toBe('spec.a');
    for (const row of updated.tableRows || []) {
      expect(row.localOverrides?.b).toBeUndefined();
      expect(row.cellValues?.b).toBeUndefined();
      expect(row.cellBindings?.b).toBeUndefined();
    }
    expect(updated.customData).toEqual({ showLegend: true });
    expect(JSON.stringify(updated)).not.toContain('legacy-A');
  });

  it('T11 real editor transition keeps materialized and appended tableRows authoritative', () => {
    const legacyRows = [
      ['legacy-A1', 'legacy-B1', 'legacy-C1'],
      ['legacy-A2', 'legacy-B2', 'legacy-C2']
    ];
    const materializedRows = legacyRows.map((row, rowIndex) => ({
      id: `crow-${rowIndex + 1}`,
      order: rowIndex,
      localOverrides: {
        a: row[0],
        b: row[1],
        c: row[2]
      }
    }));
    const hybridAfterInsert: ContentBlock = {
      id: 'aud013-editor-transition',
      type: 'custom_table',
      tableColumns: columns,
      customData: {
        headers: ['A', 'B', 'C'],
        rows: legacyRows,
        showLegend: true
      },
      tableRows: [
        ...materializedRows,
        {
          id: 'row-new-3',
          order: 2,
          localOverrides: { a: 'NEW-A3', b: 'NEW-B3', c: 'NEW-C3' },
          cellValues: {
            c: { kind: 'text', text: 'NEW-C3-value' }
          }
        }
      ]
    };

    const updated = applyPatch(
      hybridAfterInsert,
      removeLegacyTableColumn(hybridAfterInsert, columns, 'b')
    );

    expect(updated.tableRows?.map((row) => row.id)).toEqual(['crow-1', 'crow-2', 'row-new-3']);
    expect(updated.tableRows?.[2].localOverrides).toEqual({ a: 'NEW-A3', c: 'NEW-C3' });
    expect(updated.tableRows?.[2].cellValues?.c).toEqual({ kind: 'text', text: 'NEW-C3-value' });
    expect(updated.customData).toEqual({ showLegend: true });
  });

  it('R4.1c T8: hybrid custom_table column removal survives the real catalog cache/load round-trip without legacy resurrection', async () => {
    const hybrid: ContentBlock = {
      id: 'r4-t8-hybrid',
      type: 'custom_table',
      tableColumns: columns,
      customData: {
        headers: ['A', 'B', 'C'],
        rows: [
          ['legacy-A1', 'legacy-B1', 'legacy-C1'],
          ['legacy-A2', 'legacy-B2', 'legacy-C2']
        ],
        showLegend: true
      },
      tableRows: [
        {
          id: 'canonical-row-1',
          localOverrides: { a: 'A1', b: 'B1', c: 'C1' },
          cellValues: {
            a: { kind: 'text', text: 'A1-value' },
            b: { kind: 'text', text: 'B1-value' },
            c: { kind: 'text', text: 'C1-value' }
          },
          cellBindings: {
            b: {
              sourceKind: 'pim_datum',
              productId: 'product-1',
              semanticKey: 'spec.b',
              bindingMode: 'live'
            },
            c: {
              sourceKind: 'pim_datum',
              productId: 'product-1',
              semanticKey: 'spec.c',
              bindingMode: 'snapshot',
              snapshot: { kind: 'text', text: 'C1-snapshot' }
            }
          }
        },
        {
          id: 'canonical-row-2',
          localOverrides: { a: 'A2', b: 'B2', c: 'C2' }
        },
        {
          id: 'canonical-row-3-new',
          localOverrides: { a: 'NEW-A3', b: 'NEW-B3', c: 'NEW-C3' },
          cellValues: { c: { kind: 'text', text: 'NEW-C3-value' } },
          cellBindings: {
            a: {
              sourceKind: 'pim_datum',
              productId: 'product-3',
              semanticKey: 'spec.a',
              bindingMode: 'live'
            },
            b: {
              sourceKind: 'pim_datum',
              productId: 'product-3',
              semanticKey: 'spec.b',
              bindingMode: 'live'
            }
          }
        }
      ]
    };
    const updated = applyPatch(hybrid, removeLegacyTableColumn(hybrid, columns, 'b'));
    const catalog: Catalog = {
      id: 'r4-t8-roundtrip-catalog',
      title: 'R4 T8 roundtrip',
      subtitle: '',
      themeId: 'default-technical',
      pages: [{ id: 'r4-t8-page', pageNumber: 1, pageType: 'technical', title: '', blocks: [updated] }],
      sourceLocale: 'pt-BR',
      locale: 'pt-BR',
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
      version: 1
    };

    await StorageService.cacheCatalog(catalog);
    const reloaded = await StorageService.loadCatalog(catalog.id);
    await StorageService.deleteCatalog(catalog.id);

    const block = reloaded?.pages[0]?.blocks[0];
    expect(block?.tableColumns?.map((column) => column.key)).toEqual(['a', 'c']);
    expect(block?.tableRows?.map((row) => row.id)).toEqual([
      'canonical-row-1',
      'canonical-row-2',
      'canonical-row-3-new'
    ]);
    expect(block?.tableRows?.[0].localOverrides).toEqual({ a: 'A1', c: 'C1' });
    expect(block?.tableRows?.[0].cellValues).toEqual({
      a: { kind: 'text', text: 'A1-value' },
      c: { kind: 'text', text: 'C1-value' }
    });
    expect(block?.tableRows?.[0].cellBindings).toEqual({
      c: {
        sourceKind: 'pim_datum',
        productId: 'product-1',
        semanticKey: 'spec.c',
        bindingMode: 'snapshot',
        snapshot: { kind: 'text', text: 'C1-snapshot' }
      }
    });
    expect(block?.tableRows?.[2].localOverrides).toEqual({ a: 'NEW-A3', c: 'NEW-C3' });
    expect(block?.tableRows?.[2].cellValues).toEqual({ c: { kind: 'text', text: 'NEW-C3-value' } });
    expect(block?.tableRows?.[2].cellBindings?.a?.semanticKey).toBe('spec.a');
    expect(block?.tableRows?.some((row) => Object.prototype.hasOwnProperty.call(row.localOverrides ?? {}, 'b'))).toBe(false);
    expect(block?.tableRows?.some((row) => Object.prototype.hasOwnProperty.call(row.cellValues ?? {}, 'b'))).toBe(false);
    expect(block?.tableRows?.some((row) => Object.prototype.hasOwnProperty.call(row.cellBindings ?? {}, 'b'))).toBe(false);
    expect(block?.customData).toEqual({ showLegend: true });
  });
});

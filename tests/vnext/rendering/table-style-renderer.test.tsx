import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { compilePlans } from '@/vnext/rendering';
import { TableRenderer } from '@/vnext/rendering/TableRenderer';
import {
  createW4F2Document,
  W4F2_MERGED_OBJECT_ID,
  W4F2_OBJECT_ID,
} from '../proof/fixtures/w4f2-table-document';

function tableObject(document: ReturnType<typeof createW4F2Document>, objectId: string) {
  const object = document.pages[0].objects.find((entry) => entry.id === objectId);
  if (!object || object.type !== 'table') throw new Error('Expected Table object');
  return object;
}

describe('W4.F.2 canonical Table renderer placement', () => {
  it('applies verticalAlign inside a merged Cell without changing span topology', () => {
    const document = createW4F2Document();
    const object = tableObject(document, W4F2_MERGED_OBJECT_ID);
    const anchor = object.table.cells.find((cell) => cell.span);
    if (!anchor) throw new Error('Expected merged anchor');
    const beforeSpan = structuredClone(anchor.span);
    anchor.style = { ...(anchor.style ?? {}), verticalAlign: 'middle' };

    const plan = compilePlans(document).plans.get(object.table.id);
    expect(plan).toBeDefined();
    const html = renderToStaticMarkup(
      <TableRenderer table={object.table} plan={plan} assets={document.assets} assetUrls={new Map()} />
    );

    expect(html).toContain(`data-cell-id="${anchor.id}"`);
    expect(html).toContain('justify-content:center');
    expect(anchor.span).toEqual(beforeSpan);
    expect(anchor.coveredBy).toBeUndefined();
  });

  it('keeps Image Cell fit semantics while verticalAlign positions the existing flow', () => {
    const document = createW4F2Document();
    const object = tableObject(document, W4F2_OBJECT_ID);
    const cell = object.table.cells[5];
    const asset = {
      id: 'w4f2-image',
      version: '1',
      sha256: 'a'.repeat(64),
      mime: 'image/png' as const,
      widthPx: 320,
      heightPx: 180,
      name: 'technical-image.png',
      alt: 'Imagem técnica',
    };
    document.assets.push(asset);
    cell.content = { type: 'image', assetId: asset.id };
    cell.contentPresentation = {
      image: { fit: 'cover', targetWidthMm: 24, targetHeightMm: 12 },
    };
    cell.style = { ...(cell.style ?? {}), verticalAlign: 'bottom' };

    const plan = compilePlans(document).plans.get(object.table.id);
    expect(plan).toBeDefined();
    const html = renderToStaticMarkup(
      <TableRenderer
        table={object.table}
        plan={plan}
        assets={document.assets}
        assetUrls={new Map([[asset.id, '/technical-image.png']])}
      />
    );

    expect(html).toContain('justify-content:flex-end');
    expect(html).toContain('data-asset-id="w4f2-image"');
    expect(html).toContain('object-fit:cover');
    expect(cell.contentPresentation.image?.fit).toBe('cover');
  });
});

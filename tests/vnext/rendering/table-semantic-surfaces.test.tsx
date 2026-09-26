import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { plainRichText } from '@/vnext/domain';
import { compilePlans } from '@/vnext/rendering';
import {
  annotationDisplayText,
  annotationNumber,
  cellDisplayText,
  referencedAnnotations,
} from '@/vnext/rendering/render-plan';
import { TableRenderer } from '@/vnext/rendering/TableRenderer';
import {
  createW4F2Document,
  W4F2_MERGED_OBJECT_ID,
  W4F2_OBJECT_ID,
} from '../proof/fixtures/w4f2-table-document';

function tableObject(document: ReturnType<typeof createW4F2Document>, objectId = W4F2_OBJECT_ID) {
  const object = document.pages[0].objects.find((entry) => entry.id === objectId);
  if (!object || object.type !== 'table') throw new Error('Expected Table object');
  return object;
}

describe('W4.F.3 canonical Table semantic rendering', () => {
  it('renders title before captions/grid, then numbered notes, then Legend', () => {
    const document = createW4F2Document();
    const object = tableObject(document);
    const table = object.table;
    table.title = plainRichText('title', 'Título da tabela');
    table.annotations = [
      { id: 'caption', kind: 'caption', text: plainRichText('caption', 'Legenda da tabela') },
      { id: 'note', kind: 'note', text: plainRichText('note', 'Nota técnica') },
      { id: 'footnote', kind: 'footnote', text: plainRichText('footnote', 'Rodapé técnico') },
    ];
    table.annotationIds = ['caption', 'footnote'];
    table.cells[0].annotationIds = ['note'];
    table.legend = [
      { id: 'legend-b', markerCode: 'B', text: plainRichText('legend-b', 'Segundo') },
      { id: 'legend-a', markerCode: 'A', text: plainRichText('legend-a', 'Primeiro') },
    ];
    table.cells[1].content = { type: 'marker', legendEntryId: 'legend-a' };

    const plan = compilePlans(document).plans.get(table.id);
    expect(plan).toBeDefined();
    const html = renderToStaticMarkup(
      <TableRenderer table={table} plan={plan} assets={document.assets} assetUrls={new Map()} />
    );

    const titleIndex = html.indexOf('Título da tabela');
    const captionIndex = html.indexOf('Legenda da tabela');
    const gridIndex = html.indexOf(`data-table-id="${table.id}"`);
    const noteIndex = html.indexOf('Nota técnica');
    const footnoteIndex = html.indexOf('Rodapé técnico');
    const legendBIndex = html.indexOf('Segundo');
    const legendAIndex = html.indexOf('Primeiro');
    expect(titleIndex).toBeGreaterThan(-1);
    expect(titleIndex).toBeLessThan(captionIndex);
    expect(captionIndex).toBeLessThan(gridIndex);
    expect(gridIndex).toBeLessThan(noteIndex);
    expect(noteIndex).toBeLessThan(footnoteIndex);
    expect(footnoteIndex).toBeLessThan(legendBIndex);
    expect(legendBIndex).toBeLessThan(legendAIndex);
    expect(html).toContain(`data-table-title="${table.id}"`);
  });

  it('derives annotation numbering solely from canonical annotations order', () => {
    const document = createW4F2Document();
    const table = tableObject(document).table;
    const note = { id: 'note', kind: 'note' as const, text: plainRichText('note', 'Nota') };
    const footnote = { id: 'footnote', kind: 'footnote' as const, text: plainRichText('footnote', 'Rodapé') };
    const caption = { id: 'caption', kind: 'caption' as const, text: plainRichText('caption', 'Legenda') };
    table.annotations = [caption, note, footnote];
    table.cells[0].annotationIds = [note.id, footnote.id];

    expect(annotationNumber(table, note.id)).toBe(1);
    expect(annotationNumber(table, footnote.id)).toBe(2);
    expect(annotationDisplayText(note, table).paragraphs[0].inlines[0]).toMatchObject({ text: '1. ' });
    const firstDisplay = cellDisplayText(table.cells[0], table)!;
    const firstRefs = firstDisplay.paragraphs.at(-1)!.inlines.filter((inline) => inline.kind === 'text').slice(-2);
    expect(firstRefs.map((inline) => inline.kind === 'text' ? inline.text : '')).toEqual(['1', '2']);

    table.annotations = [caption, footnote, note];
    expect(annotationNumber(table, footnote.id)).toBe(1);
    expect(annotationNumber(table, note.id)).toBe(2);
    expect(annotationDisplayText(note, table).paragraphs[0].inlines[0]).toMatchObject({ text: '2. ' });
    const reorderedDisplay = cellDisplayText(table.cells[0], table)!;
    const reorderedRefs = reorderedDisplay.paragraphs.at(-1)!.inlines.filter((inline) => inline.kind === 'text').slice(-2);
    expect(reorderedRefs.map((inline) => inline.kind === 'text' ? inline.text : '')).toEqual(['2', '1']);
  });

  it('renders only referenced annotations while title remains unconditional', () => {
    const document = createW4F2Document();
    const table = tableObject(document).table;
    table.title = plainRichText('title', 'Título sempre visível');
    table.annotations = [
      { id: 'used', kind: 'note', text: plainRichText('used', 'Usada') },
      { id: 'unused', kind: 'note', text: plainRichText('unused', 'Não usada') },
    ];
    table.annotationIds = ['used'];
    expect(referencedAnnotations(table).map((entry) => entry.id)).toEqual(['used']);

    const plan = compilePlans(document).plans.get(table.id);
    const html = renderToStaticMarkup(
      <TableRenderer table={table} plan={plan} assets={document.assets} assetUrls={new Map()} />
    );
    expect(html).toContain('Título sempre visível');
    expect(html).toContain('Usada');
    expect(html).not.toContain('Não usada');
  });

  it('keeps merged owner Image Cell rendering through canonical contain/cover path', () => {
    const document = createW4F2Document();
    const object = tableObject(document, W4F2_MERGED_OBJECT_ID);
    const owner = object.table.cells.find((cell) => cell.span);
    if (!owner) throw new Error('Expected merged owner');
    const asset = {
      id: 'semantic-image',
      version: '1',
      sha256: 'c'.repeat(64),
      mime: 'image/png' as const,
      widthPx: 400,
      heightPx: 250,
      name: 'semantic.png',
      alt: 'Imagem semântica',
    };
    document.assets.push(asset);
    owner.content = { type: 'image', assetId: asset.id };
    owner.contentPresentation = {
      image: { fit: 'contain', targetWidthMm: 30, targetHeightMm: 15 },
    };

    const plan = compilePlans(document).plans.get(object.table.id);
    const html = renderToStaticMarkup(
      <TableRenderer
        table={object.table}
        plan={plan}
        assets={document.assets}
        assetUrls={new Map([[asset.id, '/semantic.png']])}
      />
    );
    expect(html).toContain('data-asset-id="semantic-image"');
    expect(html).toContain('object-fit:contain');
    expect(html).toContain('width:');
    expect(owner.span).toBeDefined();
  });
});

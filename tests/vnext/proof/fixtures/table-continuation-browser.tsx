import React from 'react';
import ReactDOM from 'react-dom/client';
import { createDocumentSession } from '@/vnext/application';
import { createMinimalW2CTable, createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { VNextApp } from '@/vnext/app/VNextApp';
import { plainRichText, type CatalogDocument, type TableModel, type TableObject } from '@/vnext/domain';

/**
 * FR-35 browser fixture: the simple-mode editor (in memory) with one long PRESYS-like table of `?rows=` rows
 * (header included, default 40), a title and a note under it, placed so it does not fit on its A4 page.
 */

function createBrowserId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

const FR35_OBJECT_ID = 'fr35-table';

function longTable(rowCount: number): TableModel {
  const base = createMinimalW2CTable();
  const names = ['Código', 'Faixa de medição', 'Saída', 'Exatidão'];
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    id: `fr35-row-${index}`, role: index === 0 ? 'header' as const : 'body' as const, heightPolicy: { mode: 'AUTO' as const },
  }));
  const value = (row: number, column: number) => row === 0 ? names[column]
    : column === 0 ? `TA-25N-${String(row).padStart(2, '0')}`
      : column === 1 ? `${-20 + row * 5} a ${150 + row * 10} °C`
        : column === 2 ? (row % 3 === 0 ? '0 a 10 V' : '4 a 20 mA') : '± 0,1 % do fundo de escala';
  return {
    ...base,
    id: 'fr35-table-model',
    title: plainRichText('fr35-title', 'Faixas de medição'),
    columns: names.map((_, index) => ({ id: `fr35-col-${index}`, width: { mode: 'flex' as const, weight: index === 3 ? 2 : 1 }, minMm: 15 })),
    rows,
    cells: rows.flatMap((row, rowIndex) => names.map((_, columnIndex) => {
      const id = `fr35-cell-${rowIndex}-${columnIndex}`;
      return { id, rowId: row.id, columnId: `fr35-col-${columnIndex}`, content: { type: 'richText' as const, value: plainRichText(`${id}-text`, value(rowIndex, columnIndex)) } };
    })),
    style: { ...base.style, rowRoles: { header: { fontWeight: 700, background: '#E8EEF5' } } },
    annotations: [{ id: 'fr35-note', kind: 'note', text: plainRichText('fr35-note-text', 'Valores de referência a 25 °C.') }],
    annotationIds: ['fr35-note'],
  };
}

const rows = Math.max(2, Math.min(150, Number(new URLSearchParams(window.location.search).get('rows') ?? 40) || 40));
const base = createW2CDemoDocument(createBrowserId);
const table: TableObject = { id: FR35_OBJECT_ID, type: 'table', frame: { xMm: 15, yMm: 30, widthMm: 180, heightMm: 120 }, zIndex: 0, table: longTable(rows) };
const document0: CatalogDocument = { ...base, pages: [{ ...base.pages[0], objects: [table] }] };
const session = createDocumentSession(document0, { createId: createBrowserId });

function summary() {
  const { document, canUndo } = session.getSnapshot();
  return {
    canUndo,
    pages: document.pages.map((page) => ({
      id: page.id,
      tables: page.objects.flatMap((object) => object.type === 'table' ? [{
        id: object.id,
        frame: object.frame,
        rows: object.table.rows.length,
        headerRows: object.table.rows.filter((row) => row.role === 'header').length,
        title: object.table.title?.paragraphs.map((paragraph) => paragraph.inlines.map((inline) => inline.kind === 'text' ? inline.text : '\n').join('')).join('\n') ?? '',
        notes: (object.table.annotationIds ?? []).length,
        firstBody: object.table.cells.find((cell) => cell.rowId === object.table.rows.find((row) => row.role === 'body')?.id && cell.columnId === object.table.columns[0].id)?.content,
      }] : []),
    })),
  };
}
(window as unknown as { __FR35__: unknown }).__FR35__ = { summary, rows };

const root = window.document.getElementById('root');
if (!root) throw new Error('Missing FR-35 proof root');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <VNextApp session={session} simpleByDefault />
  </React.StrictMode>
);

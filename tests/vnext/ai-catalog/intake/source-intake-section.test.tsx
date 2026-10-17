import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { jsPDF } from 'jspdf';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession, type DocumentSession } from '@/vnext/application';
import type { TableObject } from '@/vnext/domain';
import type { FitHeightMeasurement } from '@/vnext/editor/table-fit-height-authoring';
import { SourceIntakeSection } from '@/vnext/ai-catalog/intake/SourceIntakeSection';
import { DROP_ZONE_TEXT } from '@/vnext/ai-catalog/intake/SourceDropZone';
import { cellText, measureTable } from '../../editor/table-split-fixtures';
import { fileOf, masterWorkbook, png } from './intake-fixtures';

const id = () => crypto.randomUUID();
const tables = (session: DocumentSession): TableObject[] => session.getSnapshot().document.pages
  .flatMap((page) => page.objects.filter((object): object is TableObject => object.type === 'table'));

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:foto'), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup() {
  const session = createDocumentSession(createCatalogDocument(id, 'TA-25N — Ficha técnica 2026'), { createId: id });
  const onShowTable = vi.fn();
  const props = { session, activePageId: session.getSnapshot().document.pages[0].id, onBeforeMutation: () => true, onShowTable };
  const ui = render(<SourceIntakeSection {...props} measurement={null} />);
  const rerender = (measurement: FitHeightMeasurement | null) => ui.rerender(<SourceIntakeSection {...props} measurement={measurement} />);
  return { session, onShowTable, ui, rerender };
}
const choose = (files: File[]) => fireEvent.change(screen.getByLabelText('Escolher arquivos'), { target: { files } });

/** A small text PDF with one aligned table, and a second page that is only a picture (scanned). */
function folderPdf(): ArrayBuffer {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  pdf.setFontSize(10);
  pdf.text('Calibrador de temperatura TA-25N', 40, 60);
  const rows = [['Modelo', 'Faixa', 'Exatidão'], ['TA-25N', '-25 a 140 °C', '±0,1 °C'], ['TA-35N', '-35 a 155 °C', '±0,15 °C'], ['TA-50N', '33 a 650 °C', '±0,2 °C']];
  rows.forEach((row, index) => row.forEach((value, column) => pdf.text(value, 40 + column * 150, 100 + index * 16)));
  pdf.addPage();
  const image = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0));
  pdf.addImage(image, 'PNG', 20, 20, 555, 760);
  return pdf.output('arraybuffer');
}

describe('FR-64 files in the assistant', () => {
  it('shows one drop zone that says what it takes', () => {
    setup();
    expect(screen.getByRole('button', { name: DROP_ZONE_TEXT })).toHaveAccessibleDescription(/Até 10 arquivos/);
    expect(screen.queryByRole('list', { name: 'Arquivos enviados' })).not.toBeInTheDocument();
  });

  it('J12: PCON-MASTER → DB_SENSORS with 7 columns becomes a table continued on the next pages, with one Desfazer', async () => {
    const f = setup();
    const before = f.session.getSnapshot().document;
    choose([fileOf(await masterWorkbook(), 'PCON-MASTER-ENGLISHV2.xlsx'), fileOf('isto não é uma planilha', 'quebrada.xlsx')]);
    const list = screen.getByRole('list', { name: 'Arquivos enviados' });
    expect(within(list).getAllByText('Lendo…')).toHaveLength(2);
    await waitFor(() => expect(within(list).getByText('Pronto')).toBeInTheDocument(), { timeout: 15_000 });
    await waitFor(() => expect(within(list).getByText(/^Não foi possível: A planilha parece danificada/)).toBeInTheDocument());

    const found = screen.getByRole('region', { name: 'O que encontrei em PCON-MASTER-ENGLISHV2.xlsx' });
    expect(within(found).getByText('Aba DB_SENSORS')).toBeInTheDocument();
    expect(within(found).getByText(/70 linhas × 10 colunas/)).toBeInTheDocument();
    fireEvent.click(within(found).getByText(/^Deixado de fora/));
    expect(within(found).getByText(/“AccessLogs” não foi importada/)).toBeInTheDocument();
    expect(within(found).getByText(/“Price”/)).toBeInTheDocument();
    expect(within(found).getByRole('checkbox', { name: 'Incluir dados ocultos' })).not.toBeChecked();

    fireEvent.click(within(found).getByRole('button', { name: 'Escolher colunas — Aba DB_SENSORS' }));
    const chooser = screen.getByRole('group', { name: 'Escolher colunas — Aba DB_SENSORS' });
    const boxes = within(chooser).getAllByRole('checkbox').filter((box) => !box.closest('.ai-intake-header-toggle'));
    expect(boxes).toHaveLength(10);
    expect(boxes.filter((box) => (box as HTMLInputElement).checked)).toHaveLength(7);
    expect(within(chooser).getByText('7 de 10 colunas escolhidas.')).toBeInTheDocument();
    expect(within(chooser).getByRole('checkbox', { name: /A primeira linha é o cabeçalho/ })).toBeChecked();
    const preview = within(chooser).getByRole('region', { name: 'Prévia das primeiras linhas' });
    expect(within(preview).getByRole('columnheader', { name: 'Code' })).toBeInTheDocument();
    expect(within(preview).getByText('0,40 inH2O')).toBeInTheDocument();
    expect(within(chooser).getByText(/A tabela terá 70 linhas\. Se não couber numa página/)).toBeInTheDocument();
    // An 8th column is allowed, with a plain warning.
    fireEvent.click(within(chooser).getByRole('checkbox', { name: /Description/ }));
    expect(within(chooser).getByText(/8 de 10 colunas escolhidas\. Com mais de 7 colunas o texto fica apertado/)).toBeInTheDocument();
    fireEvent.click(within(chooser).getByRole('checkbox', { name: /Description/ }));

    fireEvent.click(within(chooser).getByRole('button', { name: 'Inserir como tabela' }));
    expect(screen.getByRole('status')).toHaveTextContent('Tabela inserida. Medindo a página…');
    const [inserted] = tables(f.session);
    expect(inserted.table.columns).toHaveLength(7);
    // The editor measures the new table: it is taller than the page, so it continues on new pages.
    const document = f.session.getSnapshot().document;
    act(() => { f.rerender(measureTable(document, { pageId: document.pages[0].id, objectId: inserted.id, rowHeightMm: 8 })); });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      /^Tabela com 70 linhas × 7 colunas inserida na página 1\. \d+ linhas movidas para as páginas 2 e 3, com o cabeçalho repetido\. Use Desfazer se precisar\.$/));
    const parts = tables(f.session);
    expect(parts).toHaveLength(3);
    expect(parts.every((part) => cellText(part.table, part.table.rows[0].id, 0) === 'Code')).toBe(true);
    expect(f.onShowTable).toHaveBeenCalledWith(document.pages[0].id, inserted.id);
    expect(f.session.undo().ok).toBe(true);
    expect(f.session.getSnapshot().document).toEqual(before);
  });

  it('PDFs say where each table and text came from, and which pages look scanned; photos show as thumbnails', async () => {
    setup();
    choose([fileOf(folderPdf(), 'folder TA.pdf'), fileOf(png(800, 600), 'TA-25N frente.png')]);
    const list = screen.getByRole('list', { name: 'Arquivos enviados' });
    await waitFor(() => expect(within(list).queryByText('Lendo…')).not.toBeInTheDocument(), { timeout: 15_000 });
    // The scanned page needs help; the photo is ready.
    expect(within(list).getByText('Precisa da sua ajuda')).toBeInTheDocument();
    expect(within(list).getByText('Pronto')).toBeInTheDocument();
    const pdf = screen.getByRole('region', { name: 'O que encontrei em folder TA.pdf' });
    expect(within(pdf).getByText('Páginas lidas: 1 e 2 de 2.')).toBeInTheDocument();
    expect(within(pdf).getByText(/A página 2 parece escaneada ou desenhada: o texto e as tabelas dela ainda não são lidos aqui/)).toBeInTheDocument();
    expect(within(pdf).getByText('Tabela da página 1')).toBeInTheDocument();
    fireEvent.click(within(pdf).getByRole('button', { name: 'Escolher colunas — Tabela da página 1' }));
    const chooser = screen.getByRole('group', { name: 'Escolher colunas — Tabela da página 1' });
    expect(within(chooser).getByText('Origem: folder TA.pdf · página 1')).toBeInTheDocument();
    fireEvent.click(within(chooser).getByRole('button', { name: 'Voltar' }));
    const photo = screen.getByRole('region', { name: 'O que encontrei em TA-25N frente.png' });
    expect(within(photo).getByRole('img', { name: 'Foto TA-25N frente.png' })).toHaveAttribute('src', 'blob:foto');
    expect(within(photo).getByText('800 × 600 pixels')).toBeInTheDocument();
    expect(within(photo).getByText(/pode sair borrada na impressão/)).toBeInTheDocument();
  });

  it('accepts files dropped on the box, and "Tirar" takes one out of the list', async () => {
    setup();
    const zone = screen.getByRole('button', { name: DROP_ZONE_TEXT }).closest('.ai-intake-drop')!;
    const files = [fileOf('Modelo;Faixa\nPCON-Y17;0 a 20 bar\n', 'lista.csv'), fileOf('Modelo;Faixa\nPCON-Y17;0 a 20 bar\n', 'lista (1).csv')];
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'], files } });
    expect(zone).toHaveAttribute('data-dragging', 'true');
    fireEvent.drop(zone, { dataTransfer: { types: ['Files'], files } });
    const list = screen.getByRole('list', { name: 'Arquivos enviados' });
    await waitFor(() => expect(within(list).getByText('Ignorado: arquivo repetido')).toBeInTheDocument());
    expect(within(list).getByText('Este arquivo é igual a “lista.csv” e não foi lido de novo.')).toBeInTheDocument();
    fireEvent.click(within(list).getByRole('button', { name: 'Tirar lista (1).csv da lista' }));
    expect(within(list).queryByText('lista (1).csv')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'O que encontrei em lista.csv' })).toBeInTheDocument();
  });

  it('a table that fits is inserted at once in the open page and shown in the editor', async () => {
    const f = setup();
    choose([fileOf('Modelo;Faixa;Exatidão\nPCON-Y17;0 a 20 bar;0,025 %FS\nPCON-Y18;0 a 70 bar;0,05 %FS\n', 'lista.csv')]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Escolher colunas — Tabela do arquivo' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Escolher colunas — Tabela do arquivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inserir como tabela' }));
    const document = f.session.getSnapshot().document;
    const [table] = tables(f.session);
    act(() => { f.rerender(measureTable(document, { pageId: document.pages[0].id, objectId: table.id, rowHeightMm: 7 })); });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Tabela com 3 linhas × 3 colunas inserida na página 1. Use Desfazer se precisar.'));
    expect(f.session.getSnapshot().document.pages).toHaveLength(1);
    expect(f.onShowTable).toHaveBeenCalledWith(document.pages[0].id, table.id);
  });

  it('never inserts while a text or cell edit cannot be finished', async () => {
    const session = createDocumentSession(createCatalogDocument(id), { createId: id });
    render(<SourceIntakeSection session={session} onBeforeMutation={() => false} />);
    choose([fileOf('Modelo;Faixa\nPCON-Y17;0 a 20 bar\n', 'lista.csv')]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Escolher colunas — Tabela do arquivo' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Escolher colunas — Tabela do arquivo' }));
    const before = session.getSnapshot().document;
    fireEvent.click(screen.getByRole('button', { name: 'Inserir como tabela' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Conclua ou cancele a edição aberta na página antes de inserir a tabela.');
    expect(session.getSnapshot().document).toBe(before);
  });
});

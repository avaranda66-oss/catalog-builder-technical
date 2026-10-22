import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileDraftDocument, factSetFromReport, type DraftCellTarget, type DraftFactSet } from '@/vnext/ai-catalog/draft-compiler';
import { PendingFactsPanel } from '@/vnext/ai-catalog/PendingFactsPanel';
import { folderReport, manualReport, twoFiles } from './draft-compiler-fixture';

afterEach(cleanup);

const conflictSet = async () => (await twoFiles()).set;

function Harness({ initial, onRecorded, cells, onSelectCell }: {
  initial: DraftFactSet; onRecorded?: (set: DraftFactSet) => void;
  cells?: ReadonlyMap<string, DraftCellTarget>; onSelectCell?: (target: DraftCellTarget) => void;
}) {
  const [set, setSet] = useState(initial);
  return <PendingFactsPanel factSet={set} cells={cells} onSelectCell={onSelectCell}
    onChange={next => { setSet(next); onRecorded?.(next); }} />;
}

describe('PendingFactsPanel (FR-68)', () => {
  it('lists every value left for the person with its file, page and quote', async () => {
    render(<Harness initial={factSetFromReport((await folderReport()).report)} />);
    expect(screen.getByRole('heading', { name: 'Pendências (3)' })).toBeTruthy();
    const items = screen.getAllByRole('listitem').filter(item => item.classList.contains('ai-pending-item'));
    expect(items).toHaveLength(3);
    const first = within(items[0]);
    expect(first.getByText('TA-25N · Resolution')).toBeTruthy();
    expect(first.getByText('Conferir na página')).toBeTruthy();
    expect(first.getByText('presys-ta-folder.pdf · página 1')).toBeTruthy();
    expect(first.getByText('“Resolution 0.01 0.01 0.01”')).toBeTruthy();
    expect(first.getByText('A célula fica em branco. Confira no arquivo e digite o valor na tabela.')).toBeTruthy();
    // Nothing to choose for a value that is not verified.
    expect(first.queryByRole('button')).toBeNull();
  });

  it('shows the 140 x 155 °C conflict side by side and records one explicit choice before applying', async () => {
    const recorded = vi.fn();
    const initial = await conflictSet();
    render(<Harness initial={initial} onRecorded={recorded} />);
    expect(screen.getByRole('heading', { name: 'Pendências (4)' })).toBeTruthy();
    const item = screen.getByText('TA-25N · Faixa de Operação (°C)').closest('li')!;
    const view = within(item);
    expect(view.getByText('Fontes divergem')).toBeTruthy();
    expect(view.getByText('manual-ta-pt.pdf · página 1')).toBeTruthy();
    expect(view.getByText('presys-ta-folder.pdf · página 1')).toBeTruthy();
    const use155 = view.getByRole('button', { name: 'Usar -25 °C to +155 °C' });
    expect(use155.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(use155);
    expect(recorded).toHaveBeenCalledTimes(1);
    const next: DraftFactSet = recorded.mock.calls[0][0];
    expect(next.choices).toEqual({ 'specs/faixa-de-operacao/0': 1 });
    expect(initial.choices).toEqual({});
    expect(screen.getByRole('heading', { name: 'Pendências (3)' })).toBeTruthy();
    const after = within(screen.getByText('TA-25N · Faixa de Operação (°C)').closest('li')!);
    expect(after.getByRole('button', { name: 'Usar -25 °C to +155 °C' }).getAttribute('aria-pressed')).toBe('true');
    expect(after.getByRole('status').textContent).toBe('Escolhido: -25 °C to +155 °C (presys-ta-folder.pdf · página 1).');
    // The compiled cell takes exactly the chosen verified reading.
    const { document } = compileDraftDocument(next);
    const table = document.pages[0].objects.find(object => object.type === 'table');
    const cell = table?.type === 'table' ? table.table.cells.find(entry => entry.rowId === table.table.rows[1].id && entry.columnId === table.table.columns[1].id) : undefined;
    expect(cell?.content.type === 'richText' && cell.content.value.paragraphs[0].inlines.map(inline => inline.kind === 'text' ? inline.text : '').join(''))
      .toBe('-25 °C to +155 °C');

    fireEvent.click(after.getByRole('button', { name: 'Deixar em branco' }));
    expect(recorded.mock.calls[1][0].choices).toEqual({ 'specs/faixa-de-operacao/0': 'missing' });
    expect(within(screen.getByText('TA-25N · Faixa de Operação (°C)').closest('li')!).getByRole('status').textContent)
      .toBe('Deixado em branco: preencha depois na tabela.');
  });

  it('asks for the condition too (23 °C x 20 °C)', async () => {
    render(<Harness initial={await conflictSet()} />);
    const item = within(screen.getByText('Condição de Faixa de Operação (°C)').closest('li')!);
    expect(item.getByRole('button', { name: 'Usar Temperatura Ambiente: 20°C' })).toBeTruthy();
    expect(item.getByRole('button', { name: 'Usar ambient temperature: 23 °C' })).toBeTruthy();
  });

  it('after insertion, clicking an item selects its cell', async () => {
    const set = factSetFromReport((await folderReport()).report);
    const { applied } = compileDraftDocument(set);
    const onSelectCell = vi.fn();
    render(<Harness initial={set} cells={applied.cells} onSelectCell={onSelectCell} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar na tabela: TA-35N · Resolution' }));
    expect(onSelectCell).toHaveBeenCalledWith(applied.cells.get('specs/resolution/1'));
    expect(onSelectCell.mock.calls[0][0]).toMatchObject({ state: 'pending', kind: 'value' });
  });

  it('says so when nothing is pending', async () => {
    const { report } = await manualReport();
    render(<Harness initial={factSetFromReport(report)} />);
    expect(screen.getByRole('heading', { name: 'Pendências (0)' })).toBeTruthy();
    expect(screen.getByText('Nenhuma pendência: todos os valores foram conferidos nos arquivos.')).toBeTruthy();
  });
});

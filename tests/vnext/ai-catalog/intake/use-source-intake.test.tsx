import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readSources } from '@/vnext/ai-catalog/source-intake';
import { intakeStateLabel, tableBlocks } from '@/vnext/ai-catalog/intake/intake-model';
import { useSourceIntake } from '@/vnext/ai-catalog/intake/useSourceIntake';
import { sourceTableCells, suggestSourceColumns } from '@/vnext/ai-catalog/intake/source-table-insert';

import { fileOf, masterWorkbook, png } from './intake-fixtures';

describe('FR-64 useSourceIntake', () => {
  it('reads a mixed batch file by file: a damaged file, a repeated file and a photo do not stop the others', async () => {
    const { result } = renderHook(() => useSourceIntake());
    const master = await masterWorkbook();
    const csv = 'Modelo;Faixa\nPCON-Y17;0 a 20 bar\n';
    act(() => {
      result.current.addFiles([
        fileOf(master, 'PCON-MASTER-ENGLISHV2.xlsx'), fileOf('isto não é uma planilha', 'quebrada.xlsx'),
        fileOf(csv, 'lista.csv'), fileOf(csv, 'lista (cópia).csv'), fileOf(png(2400, 1800), 'TA-25N frente.png'),
      ]);
    });
    // Every file shows "Lendo…" at once.
    expect(result.current.entries.map((entry) => intakeStateLabel(entry))).toEqual(Array(5).fill('Lendo…'));
    expect(result.current.busy).toBe(true);
    await waitFor(() => expect(result.current.busy).toBe(false), { timeout: 15_000 });
    const [sheet, broken, list, copy, photo] = result.current.entries;
    expect(sheet.state).toBe('ready');
    expect(broken.state).toBe('error');
    expect(intakeStateLabel(broken)).toBe('Não foi possível: A planilha parece danificada. Abra no Excel, salve de novo como .xlsx e envie outra vez.');
    expect(list.state).toBe('ready');
    expect(copy).toMatchObject({ state: 'duplicate', duplicateOf: 'lista.csv' });
    expect(copy.message).toBe('Este arquivo é igual a “lista.csv” e não foi lido de novo.');
    expect(photo).toMatchObject({ state: 'ready', kind: 'photo' });
    expect(sheet.sha256).toMatch(/^[0-9a-f]{64}$/);

    // Prices, access logs and hidden sheets stay out by default.
    const intake = sheet.intake!;
    expect(tableBlocks(intake).map((block) => block.source.sheet)).toEqual(['DB_SENSORS']);
    const ignored = intake.ignored.map((item) => item.message).join('\n');
    expect(ignored).toContain('“AccessLogs”');
    expect(ignored).toContain('“DB_OLD” não foi importada: estava oculta');
    expect(ignored).toContain('“ORIGINAL_Y17”');
    expect(ignored).toContain('(“Price”)');
    expect(ignored).toContain('(“Price Y18-HP”)');

    // "Escolher colunas": 7 suggested for A4, the text as Excel shows it.
    const block = tableBlocks(intake)[0];
    const columns = suggestSourceColumns(block);
    expect(columns).toHaveLength(7);
    const cells = sourceTableCells({ block, columns, header: true });
    expect(cells).toHaveLength(70);
    expect(cells[0]).toEqual(['Code', 'Range (1)', 'Range (2)', 'Range (3)', 'Gauge Type', 'Accuracy', 'Precision']);
    expect(cells[1]).toEqual(['0D100', '± 100 Pa', '0,40 inH2O', '±1 mbar', 'Differential', '0,025', 'Standard Precision']);
  });

  it('"Incluir dados ocultos" reads the hidden sheets again; prices and access logs stay out unless a sheet is asked for', async () => {
    const { result } = renderHook(() => useSourceIntake());
    const master = await masterWorkbook();
    act(() => { result.current.addFiles([fileOf(master, 'PCON-MASTER-ENGLISHV2.xlsx')]); });
    await waitFor(() => expect(result.current.entries[0].state).toBe('ready'));
    const id = result.current.entries[0].id;
    act(() => { result.current.reread(id, { includeHidden: true }); });
    expect(result.current.entries[0].state).toBe('reading');
    await waitFor(() => expect(result.current.entries[0].state).not.toBe('reading'));
    expect(tableBlocks(result.current.entries[0].intake).map((block) => block.source.sheet)).toEqual(['DB_SENSORS', 'DB_OLD']);
    const sensors = tableBlocks(result.current.entries[0].intake)[0];
    expect(sensors.rows[3]).not.toContain('Price');
    // One internal sheet asked for by name ("Ler mesmo assim"): read, the others kept.
    act(() => { result.current.reread(id, { sheets: ['DB_SENSORS', 'DB_OLD', 'AccessLogs'] }); });
    await waitFor(() => expect(result.current.entries[0].state).not.toBe('reading'));
    expect(tableBlocks(result.current.entries[0].intake).map((block) => block.source.sheet)).toEqual(['DB_SENSORS', 'AccessLogs', 'DB_OLD']);
    expect(result.current.entries[0].options).toMatchObject({ includeHidden: true, sheets: ['DB_SENSORS', 'DB_OLD', 'AccessLogs'] });
  });

  it('keeps at most 10 files: the extra ones are not read and say what to do', async () => {
    const read = vi.fn(readSources);
    const { result } = renderHook(() => useSourceIntake({ read }));
    act(() => {
      result.current.addFiles(Array.from({ length: 11 }, (_, index) => fileOf(`Modelo;Faixa\nM${index};${index}\n`, `lista-${index}.csv`)));
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.entries.filter((entry) => entry.state === 'ready')).toHaveLength(10);
    expect(result.current.entries[10]).toMatchObject({ state: 'skipped' });
    expect(result.current.entries[10].message).toContain('no máximo 10 arquivos');
    expect(read).toHaveBeenCalledTimes(10);
    // Taking one out makes room for the next drop.
    act(() => { result.current.remove(result.current.entries[0].id); });
    act(() => { result.current.addFiles([fileOf('Modelo;Faixa\nNovo;1\n', 'nova.csv')]); });
    await waitFor(() => expect(result.current.entries.at(-1)?.state).toBe('ready'));
  });

  it('a file dropped again later, with the same content, is not read again', async () => {
    const read = vi.fn(readSources);
    const { result } = renderHook(() => useSourceIntake({ read }));
    act(() => { result.current.addFiles([fileOf('Modelo;Faixa\nA;1\n', 'a.csv')]); });
    await waitFor(() => expect(result.current.entries[0].state).toBe('ready'));
    act(() => { result.current.addFiles([fileOf('Modelo;Faixa\nA;1\n', 'a de novo.csv')]); });
    await waitFor(() => expect(result.current.entries[1].state).toBe('duplicate'));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('ignores the answer for a file taken out of the list while it was being read', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const read = vi.fn(async (files: readonly File[]) => { await gate; return readSources(files); });
    const { result } = renderHook(() => useSourceIntake({ read }));
    act(() => { result.current.addFiles([fileOf('Modelo;Faixa\nA;1\n', 'a.csv'), fileOf('Modelo;Faixa\nB;2\n', 'b.csv')]); });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    act(() => { result.current.remove(result.current.entries[0].id); });
    await act(async () => { release(); });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.entries.map((entry) => [entry.fileName, entry.state])).toEqual([['b.csv', 'ready']]);
  });
});

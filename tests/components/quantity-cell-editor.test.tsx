import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CellEditorModal } from '../../src/components/library/product-workspace/CellEditorModal';
import type { DatasetColumn, DatasetRow, TechnicalDataset, TechnicalDatum, TechnicalValue } from '../../src/domain/product-workbook';

const row: DatasetRow = { id: 'row-1', label: 'Ponto 1', order: 0 };

const makeDataset = (valueType: TechnicalValue['type']): TechnicalDataset => ({
  id: 'dataset-1',
  semanticKey: 'specs.measurement',
  moduleId: 'module-1',
  label: 'Medições',
  kind: 'matrix',
  columns: [{ id: 'column-1', semanticKey: 'specs.value', label: 'Valor', valueType, order: 0 }],
  rows: [row],
  cells: {},
  order: 0
});

const makeDatum = (value: TechnicalValue): TechnicalDatum => ({
  id: 'datum-1',
  semanticKey: 'specs.value',
  moduleId: 'module-1',
  label: 'Valor',
  value,
  evidence: [],
  status: 'verified'
});

function renderEditor(valueType: TechnicalValue['type'], value: TechnicalValue) {
  const onSaveCell = vi.fn();
  const onClose = vi.fn();
  render(
    <CellEditorModal
      isOpen
      onClose={onClose}
      dataset={makeDataset(valueType)}
      row={row}
      column={makeDataset(valueType).columns[0] as DatasetColumn}
      currentDatum={makeDatum(value)}
      onSaveCell={onSaveCell}
      onClearCell={vi.fn()}
    />
  );
  return { onSaveCell, onClose };
}

describe('CellEditorModal typed values', () => {
  it('AUD-013: preserves an unchanged quantity amount, unit and qualifier on save', () => {
    const value: TechnicalValue = { type: 'quantity', amount: 10, unit: 'bar', qualifier: 'nominal' };
    const { onSaveCell, onClose } = renderEditor('quantity', value);

    fireEvent.click(screen.getByRole('button', { name: /Salvar Célula/i }));

    expect(onSaveCell).toHaveBeenCalledWith(value, 'Valor', 'verified');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports editing quantity amount, unit and qualifier without changing the variant', () => {
    const { onSaveCell } = renderEditor('quantity', { type: 'quantity', amount: 10, unit: 'bar' });

    fireEvent.change(screen.getByPlaceholderText('Ex: 10 ou 10,5'), { target: { value: '12,5' } });
    fireEvent.change(screen.getByLabelText('Unidade da quantidade'), { target: { value: 'kPa' } });
    fireEvent.change(screen.getByLabelText('Qualificador da quantidade'), { target: { value: 'approx' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar Célula/i }));

    expect(onSaveCell).toHaveBeenCalledWith(
      { type: 'quantity', amount: 12.5, unit: 'kPa', qualifier: 'approx' },
      'Valor',
      'verified'
    );
  });

  it('rejects invalid quantity input before calling the save callback', () => {
    const { onSaveCell } = renderEditor('quantity', { type: 'quantity', amount: 10, unit: 'bar' });

    fireEvent.change(screen.getByPlaceholderText('Ex: 10 ou 10,5'), { target: { value: 'not-a-number' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar Célula/i }));

    expect(screen.getByText('Informe uma quantidade numérica válida.')).toBeInTheDocument();
    expect(onSaveCell).not.toHaveBeenCalled();
  });

  it.each([
    { type: 'number', value: { type: 'number', value: 42 } },
    { type: 'text', value: { type: 'text', value: 'Alumínio' } },
    { type: 'range', value: { type: 'range', lower: 0, upper: 10, unit: 'bar', lowerInclusive: false, upperInclusive: true } },
    { type: 'boolean', value: { type: 'boolean', value: false } }
  ] as const)('round-trips supported $type values without changing their variant', ({ type, value }) => {
    const { onSaveCell } = renderEditor(type, value);

    fireEvent.click(screen.getByRole('button', { name: /Salvar Célula/i }));

    expect(onSaveCell).toHaveBeenCalledWith(value, 'Valor', 'verified');
  });

  it.each([
    { type: 'enum', value: { type: 'enum', code: 'PT100', label: 'Pt100' } },
    { type: 'technical_token', value: { type: 'technical_token', token: 'IP67', category: 'protection' } },
    { type: 'asset_reference', value: { type: 'asset_reference', assetId: 'asset-1', mimeType: 'image/png' } },
    { type: 'product_reference', value: { type: 'product_reference', targetProductId: 'product-2', relationKind: 'replacement' } },
    { type: 'unknown', value: { type: 'unknown', reason: 'legacy payload' } }
  ] as const)('preserves unsupported $type variants without coercion', ({ type, value }) => {
    const { onSaveCell } = renderEditor(type, value);

    expect(screen.getByText(/somente leitura/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Salvar Célula/i }));

    expect(onSaveCell).toHaveBeenCalledWith(value, 'Valor', 'verified');
  });
});

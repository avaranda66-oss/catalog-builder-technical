import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PasteGrowOffer, PasteTableArea } from '@/vnext/app/editor/PasteTableArea';

afterEach(cleanup);

const models = 'Modelo\tFaixa\tExatidão\nTA-25N\t-25 °C a 140 °C\t±0,1 °C\nTA-50N\t-40 °C a 155 °C\t±0,15 °C';

describe('FR-31 Colar tabela do Excel (área de colar)', () => {
  it('shows a plain Portuguese box with a real tab/newline example and focuses it', () => {
    render(<PasteTableArea onCreate={() => true} onCancel={() => undefined} />);
    const box = screen.getByRole('textbox', { name: 'Cole aqui (Ctrl+V)' });
    expect(box).toHaveFocus();
    expect(box.getAttribute('placeholder')).toContain('Modelo\tFaixa');
    expect(box.getAttribute('placeholder')).toContain('\nTA-25N');
    expect(box.getAttribute('placeholder')).not.toContain('\\t');
    expect(screen.getByRole('button', { name: 'Criar tabela' })).toBeDisabled();
  });

  it('previews the pasted cells, proposes the header and creates with the chosen header', () => {
    const onCreate = vi.fn(() => true);
    render(<PasteTableArea onCreate={onCreate} onCancel={() => undefined} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Cole aqui (Ctrl+V)' }), { target: { value: models } });
    expect(screen.getByText('3 linhas × 3 colunas')).toBeInTheDocument();
    const preview = screen.getByRole('table', { name: 'Prévia da tabela' });
    expect(preview).toHaveTextContent('±0,1 °C');
    expect(screen.getByRole('columnheader', { name: 'Exatidão' })).toBeInTheDocument();
    const header = screen.getByRole('checkbox', { name: 'A primeira linha é o cabeçalho (fica em destaque)' });
    expect(header).toBeChecked();
    fireEvent.click(header);
    expect(screen.queryByRole('columnheader')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Criar tabela' }));
    expect(onCreate).toHaveBeenCalledWith(models, false);
    expect(screen.getByRole('textbox', { name: 'Cole aqui (Ctrl+V)' })).toHaveValue('');
  });

  it('keeps the text when the table could not be created', () => {
    render(<PasteTableArea onCreate={() => false} onCancel={() => undefined} />);
    const box = screen.getByRole('textbox', { name: 'Cole aqui (Ctrl+V)' });
    fireEvent.change(box, { target: { value: models } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar tabela' }));
    expect(box).toHaveValue(models);
  });

  it('explains what will happen with short rows and too many columns', () => {
    render(<PasteTableArea onCreate={() => true} onCancel={() => undefined} />);
    const box = screen.getByRole('textbox', { name: 'Cole aqui (Ctrl+V)' });
    fireEvent.change(box, { target: { value: 'A\tB\tC\nx' } });
    expect(screen.getByText('A linha 2 tinha menos colunas; completamos com células vazias.')).toBeInTheDocument();
    fireEvent.change(box, { target: { value: Array.from({ length: 11 }, (_, index) => `C${index}`).join('\t') } });
    expect(screen.getByRole('alert')).toHaveTextContent('A tabela copiada tem 11 colunas.');
    expect(screen.getByRole('button', { name: 'Criar tabela' })).toBeDisabled();
  });

  it('closes on Cancelar', () => {
    const onCancel = vi.fn();
    render(<PasteTableArea onCreate={() => true} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('FR-31 oferta "Adicionar N linhas e colar"', () => {
  it('offers to grow the table and lets the user cancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<PasteGrowOffer label="Adicionar 3 linhas e colar" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole('region', { name: 'Colar dados maiores que a tabela' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar 3 linhas e colar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

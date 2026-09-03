import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeleteFamilyModal } from '../../src/components/library/DeleteFamilyModal';
import { RenameFamilyModal } from '../../src/components/library/RenameFamilyModal';
import { ProductFamily } from '../../src/domain/product.schema';

describe('LIB.F1 — DeleteFamilyModal Component', () => {
  const sampleFamily: ProductFamily = {
    id: 'f-1',
    name: 'Transmissores de Pressão',
    slug: 'transmissores-de-pressao',
    sort_order: 1,
    created_at: '',
    updated_at: ''
  };

  it('MODAL-DELETE-GUARD: quando productCount > 0, exibe estado bloqueado e não permite exclusão', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteFamilyModal
        isOpen={true}
        family={sampleFamily}
        productCount={5}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    // Título de bloqueio
    expect(screen.getByText('Não é possível excluir a família')).toBeDefined();
    expect(screen.getByText(/5 produtos associados/)).toBeDefined();

    // Botão de ação é apenas "Entendido"
    const understoodBtn = screen.getByRole('button', { name: 'Entendido' });
    expect(understoodBtn).toBeDefined();

    // Não deve existir botão de "Excluir família"
    expect(screen.queryByRole('button', { name: 'Excluir família' })).toBeNull();

    fireEvent.click(understoodBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('MODAL-DELETE-SAFE: quando productCount === 0, exibe botão de exclusão e foco no Cancelar', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteFamilyModal
        isOpen={true}
        family={sampleFamily}
        productCount={0}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText('Excluir família "Transmissores de Pressão"?')).toBeDefined();

    const cancelBtn = screen.getByRole('button', { name: 'Cancelar' });
    const deleteBtn = screen.getByRole('button', { name: 'Excluir família' });

    expect(cancelBtn).toBeDefined();
    expect(deleteBtn).toBeDefined();

    fireEvent.click(deleteBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('LIB.F1 — RenameFamilyModal Component', () => {
  const sampleFamily: ProductFamily = {
    id: 'f-1',
    name: 'Válvulas',
    slug: 'valvulas',
    sort_order: 1,
    created_at: '',
    updated_at: ''
  };

  const existingFamilies: ProductFamily[] = [
    sampleFamily,
    { id: 'f-2', name: 'Bombas', slug: 'bombas', sort_order: 2, created_at: '', updated_at: '' }
  ];

  it('MODAL-RENAME: valida duplicata em tempo real e desabilita botão Salvar', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <RenameFamilyModal
        isOpen={true}
        family={sampleFamily}
        existingFamilies={existingFamilies}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    const input = screen.getByLabelText(/Nome da Família:/) as HTMLInputElement;
    expect(input.value).toBe('Válvulas');

    const saveBtn = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement;

    // Digita nome duplicado
    fireEvent.change(input, { target: { value: 'Bombas' } });
    expect(saveBtn.disabled).toBe(true);

    // Digita nome novo válido
    fireEvent.change(input, { target: { value: 'Válvulas Esféricas' } });
    expect(saveBtn.disabled).toBe(false);

    fireEvent.click(saveBtn);
    expect(onConfirm).toHaveBeenCalledWith('Válvulas Esféricas');
  });
});

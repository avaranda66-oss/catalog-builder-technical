// tests/library-v2/library-experience-gate.test.tsx
// Teste de integridade do Gate de Experiência Dupla (LibraryExperienceGate).
// Valida preservação absoluta da Library Classic como padrão e ativação opt-in da V2.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LibraryExperienceGate } from '../../src/components/library-v2/index';

// Mocks para isolar store e subcomponentes pesados
vi.mock('../../src/components/library/LibraryView', () => ({
  LibraryView: () => <div data-testid="library-classic-view">Library Classic Active</div>
}));

vi.mock('../../src/stores/useLibraryStore', () => ({
  useLibraryStore: () => ({
    products: [
      { id: 'p1', code: 'TA-25N', model: 'TA-25N', family: 'Banhos Térmicos', specs: { range: '-25 a 155 °C' } }
    ],
    families: [{ id: 'f1', name: 'Banhos Térmicos', slug: 'banhos-termicos' }],
    selectedFamily: 'Banhos Térmicos',
    setSelectedFamily: vi.fn(),
    getColumnsForFamily: vi.fn().mockReturnValue([]),
    addProduct: vi.fn()
  })
}));

describe('LibraryExperienceGate - Dual Experience Safety', () => {
  it('deve renderizar a Library Classic por padrão estrito sem quebrar o workflow existente', () => {
    render(<LibraryExperienceGate />);

    expect(screen.getByTestId('library-classic-view')).toBeDefined();
    expect(screen.getByText('Library Classic Active')).toBeDefined();

    // Banner de opt-in para a V2 deve estar visível e convidativo
    expect(screen.getByText('✨ Testar Library V2 Guided')).toBeDefined();
  });

  it('ao clicar em Testar Library V2 Guided, deve transicionar suavemente para a V2', () => {
    render(<LibraryExperienceGate />);

    const optInButton = screen.getByText('✨ Testar Library V2 Guided');
    fireEvent.click(optInButton);

    // Agora a V2 Guided deve estar visível
    expect(screen.getByText('Visão Geral')).toBeDefined();
    expect(screen.getByText('Informações Técnicas')).toBeDefined();
    expect(screen.getByText('Voltar para Classic')).toBeDefined();
  });

  it('quando forçado para v2, deve renderizar diretamente a experiência guiada', () => {
    render(<LibraryExperienceGate forcedExperience="v2" />);

    expect(screen.queryByTestId('library-classic-view')).toBeNull();
    expect(screen.getByText('Visão Geral')).toBeDefined();
    expect(screen.getByText('Modo Aprender')).toBeDefined();
    expect(screen.getByText('Ajuda & Glossário')).toBeDefined();
  });

  it('na V2, o botão Voltar para Classic deve retornar com segurança para a Classic', () => {
    render(<LibraryExperienceGate forcedExperience="v2" />);

    const backButton = screen.getByText('Voltar para Classic');
    fireEvent.click(backButton);

    expect(screen.getByTestId('library-classic-view')).toBeDefined();
  });
});

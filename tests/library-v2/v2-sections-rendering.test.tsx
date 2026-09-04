// tests/library-v2/v2-sections-rendering.test.tsx
// Testes de renderização das 8 seções funcionais da Library V2.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LibraryV2Container } from '../../src/components/library-v2/LibraryV2Container';

vi.mock('../../src/stores/useLibraryStore', () => ({
  useLibraryStore: () => ({
    products: [
      {
        id: 'p1',
        code: 'TA-25N',
        model: 'TA-25N',
        family: 'Banhos Térmicos',
        specs: { range: '-25 °C a 155 °C', accuracy: '± 0,1 °C', powerSupply: '115/230 Vac' }
      },
      {
        id: 'p2',
        code: 'TA-35N',
        model: 'TA-35N',
        family: 'Banhos Térmicos',
        specs: { range: '-35 °C a 155 °C', accuracy: '± 0,1 °C', powerSupply: '115/230 Vac' }
      }
    ],
    families: [{ id: 'f1', name: 'Banhos Térmicos', slug: 'banhos-termicos', description: 'Linha de calibração' }],
    selectedFamily: 'Banhos Térmicos',
    setSelectedFamily: vi.fn(),
    getColumnsForFamily: vi.fn().mockReturnValue([]),
    addProduct: vi.fn()
  })
}));

describe('LibraryV2Container - Navegação e Renderização das 8 Seções', () => {
  it('deve renderizar a Seção 1 (Visão Geral) por padrão com métricas e modelos', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);

    expect(screen.getByText('Banhos Térmicos')).toBeDefined();
    expect(screen.getByText('Modelos Físicos')).toBeDefined();
    expect(screen.getAllByText('TA-25N').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('TA-35N').length).toBeGreaterThanOrEqual(1);
  });

  it('deve navegar para a Seção 2 (Informações Técnicas) e exibir herança/overrides', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);

    const navTechData = screen.getByText('Informações Técnicas');
    fireEvent.click(navTechData);

    expect(screen.getByText('Informações Técnicas & Fatos')).toBeDefined();
    expect(screen.getByText('Módulo: Metrologia')).toBeDefined();
    expect(screen.getByText('Módulo: Elétrica')).toBeDefined();
  });

  it('deve navegar para a Seção 3 (Tabelas Técnicas) e exibir matriz comparativa', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);

    const navTables = screen.getByText('Tabelas Técnicas');
    fireEvent.click(navTables);

    expect(screen.getByText('Matrizes Comparativas e Tabelas de Engenharia')).toBeDefined();
    expect(screen.getByText('Matriz Comparativa de Modelos')).toBeDefined();
  });

  it('deve navegar para a Seção 4 (Documentos)', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);

    const navDocs = screen.getByText('Documentos');
    fireEvent.click(navDocs);

    expect(screen.getByText('Documentos Fonte & Certificados')).toBeDefined();
    expect(screen.getByText(/Manual de Instruções e Especificações Técnicas/i)).toBeDefined();
  });

  it('deve navegar para a Seção 5 (Fontes & Evidências)', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);

    const navSources = screen.getByText('Fontes & Evidências');
    fireEvent.click(navSources);

    expect(screen.getByText('Evidências Documentais Auditáveis')).toBeDefined();
  });

  it('deve navegar para a Seção 6 (Conflitos / Revisões)', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);

    const navConflicts = screen.getByText('Conflitos / Revisões');
    fireEvent.click(navConflicts);

    expect(screen.getByText('Conflitos de Evidências & Decisões Canônicas')).toBeDefined();
    expect(screen.getByText('Nenhum Conflito Ativo no Momento')).toBeDefined();
  });

  it('deve navegar para a Seção 7 (Organização de Módulos)', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);

    const navOrg = screen.getByText('Organização');
    fireEvent.click(navOrg);

    expect(screen.getByText('Organização dos Módulos do Caderno Técnico')).toBeDefined();
  });

  it('deve navegar para a Seção 8 (Avançado - Modo Engenharia)', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);

    const navAdv = screen.getByText('Avançado');
    fireEvent.click(navAdv);

    expect(screen.getByText('Transparência Técnica & Registro Semântico')).toBeDefined();
    expect(screen.getByText('metrology.temperature.range')).toBeDefined();
  });

  it('deve alternar o Modo Aprender 🎓 ao clicar no botão do cabeçalho', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);

    const learnToggle = screen.getByRole('switch', { name: /Alternar Modo Aprender/i });
    expect(learnToggle).toBeDefined();

    // Clica para ativar
    fireEvent.click(learnToggle);
    expect(screen.getByText('ON')).toBeDefined();

    // Clica para desativar
    fireEvent.click(learnToggle);
    expect(screen.getByText('OFF')).toBeDefined();
  });
});

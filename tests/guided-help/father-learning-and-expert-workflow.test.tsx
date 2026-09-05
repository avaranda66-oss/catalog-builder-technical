// tests/guided-help/father-learning-and-expert-workflow.test.tsx
// Bateria de Testes: Father Learning Test (10/10) & Expert Workflow Benchmark.
// Valida auto-descoberta sem documentação externa e agilidade operacional no Modo Expert.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LibraryV2Container } from '../../src/components/library-v2/LibraryV2Container';

// Mock da Store para isolamento determinístico
vi.mock('../../src/stores/useLibraryStore', () => ({
  useLibraryStore: () => ({
    products: [
      {
        id: 'ta-25n',
        code: 'TA-25N',
        model: 'TA-25N',
        family: 'Banhos Térmicos',
        description: 'Calibrador de Banho Térmico Portátil',
        specs: {
          range: '-25 °C a 155 °C',
          accuracy: '± 0,1 °C',
          powerSupply: '115 / 230 Vac'
        }
      },
      {
        id: 'ta-35n',
        code: 'TA-35N',
        model: 'TA-35N',
        family: 'Banhos Térmicos',
        description: 'Calibrador de Alta Temperatura',
        specs: {
          range: '-35 °C a 155 °C',
          accuracy: '± 0,1 °C',
          powerSupply: '115 / 230 Vac'
        }
      }
    ],
    families: [
      {
        id: 'fam-banhos',
        name: 'Banhos Térmicos',
        slug: 'banhos-termicos',
        description: 'Calibradores com controle térmico avançado.'
      }
    ],
    selectedFamily: 'Banhos Térmicos',
    setSelectedFamily: vi.fn(),
    getColumnsForFamily: vi.fn().mockReturnValue([
      { key: 'specs.range', label: 'Faixa de Medição' },
      { key: 'specs.accuracy', label: 'Exatidão' }
    ]),
    addProduct: vi.fn(),
    syncStatus: 'synced',
    workspaceSource: 'offline',
    dataProvenance: 'demo_seed'
  })
}));

describe('FATHER LEARNING TEST — Auto-descoberta Intuitiva 10/10', () => {
  it('1. Família: Descobre facilmente qual família está ativa e seu escopo', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);
    expect(screen.getAllByText(/Banhos Térmicos/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Família Ativa/i)).toBeDefined();
  });

  it('2. Informação Técnica: Descobre a separação de especificações em módulos técnicos', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);
    const techDataNav = screen.getByText('Informações Técnicas');
    fireEvent.click(techDataNav);

    expect(screen.getByText(/Informações Técnicas & Fatos/i)).toBeDefined();
    expect(screen.getByText(/Módulo: Metrologia/i)).toBeDefined();
    expect(screen.getByText(/Módulo: Elétrica/i)).toBeDefined();
  });

  it('3. Tabela Técnica: Descobre a matriz comparativa entre modelos físicos', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);
    const tablesNav = screen.getByText('Tabelas Técnicas');
    fireEvent.click(tablesNav);

    expect(screen.getByText(/Matrizes Comparativas e Tabelas de Engenharia/i)).toBeDefined();
    expect(screen.getByText(/Matriz Comparativa de Modelos/i)).toBeDefined();
    expect(screen.getByText(/Vinculada ao Produto/i)).toBeDefined();
  });

  it('4. Origem de um Valor: Descobre a seção de evidências e procedência documental', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);
    const sourcesNav = screen.getByText(/Fontes & Evidências/i);
    fireEvent.click(sourcesNav);

    expect(screen.getByText(/Evidências Documentais Auditáveis/i)).toBeDefined();
    expect(screen.getByText(/Transparência de Metadados/i)).toBeDefined();
  });

  it('5. Herança: Descobre a regra de herança de família e seu badge visual', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);
    fireEvent.click(screen.getByText('Informações Técnicas'));

    expect(screen.getByText(/Entenda como funciona a/i)).toBeDefined();
    expect(screen.getAllByText(/Herdado da Família/i).length).toBeGreaterThanOrEqual(1);
  });

  it('6. Exceção de Modelo: Descobre o que é um Override de produto específico', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);
    fireEvent.click(screen.getByText('Informações Técnicas'));

    expect(screen.getByText(/Exceção do Modelo \(Override\)/i)).toBeDefined();
  });

  it('7. Conflito: Descobre o que são divergências documentais e Decisões Canônicas', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);
    const conflictsNav = screen.getByText(/Conflitos \/ Revisões/i);
    fireEvent.click(conflictsNav);

    expect(screen.getByText(/Conflitos de Evidências & Decisões Canônicas/i)).toBeDefined();
    expect(screen.getAllByText(/Decisão Canônica/i).length).toBeGreaterThanOrEqual(1);
  });

  it('8. Chave Semântica: Descobre onde visualizar as chaves técnicas dos dados', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);
    fireEvent.click(screen.getByText('Informações Técnicas'));

    const toggleKeysBtn = screen.getByText('Chaves Técnicas');
    fireEvent.click(toggleKeysBtn);

    expect(screen.getByText(/Chave: metrology.range/i)).toBeDefined();
  });

  it('9. Como Adicionar Informação: Descobre botão de novo modelo e atalho para o modo clássico', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);
    expect(screen.getByText('Novo Modelo')).toBeDefined();

    fireEvent.click(screen.getByText('Informações Técnicas'));
    expect(screen.getByText('Gerenciar Esquema no Modo Clássico')).toBeDefined();
  });

  it('10. Onde Buscar Ajuda: Descobre Modo Aprender, Glossário e Tour', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);
    expect(screen.getByLabelText(/Alternar Modo Aprender/i)).toBeDefined();
    expect(screen.getByTitle(/Abrir Central de Conhecimento e Glossário/i)).toBeDefined();
    expect(screen.getByText('Guia Rápido da Tela')).toBeDefined();
  });
});

describe('EXPERT WORKFLOW TEST — Learn Mode OFF (Zero Penalidade)', () => {
  it('no modo padrão (Learn Mode OFF), nenhum tour automático ou modal invasivo bloqueia a tela', () => {
    render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);

    // Não deve haver tour modal ativo de imediato
    expect(screen.queryByText('Passo 1 de')).toBeNull();

    // Navegação ágil entre as seções
    fireEvent.click(screen.getByText('Informações Técnicas'));
    expect(screen.getByText(/Módulo: Metrologia/i)).toBeDefined();

    fireEvent.click(screen.getByText('Tabelas Técnicas'));
    expect(screen.getByText(/Matriz de Modelos/i)).toBeDefined();

    fireEvent.click(screen.getByText('Organização'));
    expect(screen.getByText(/Organização dos Módulos do Caderno Técnico/i)).toBeDefined();

    fireEvent.click(screen.getByText('Avançado'));
    expect(screen.getByText(/Transparência Técnica & Estrutura de Domínio/i)).toBeDefined();
  });

  it('permite alternar para o Modo Clássico com um único clique (Zero Workflow Lock-in)', () => {
    const onSwitch = vi.fn();
    render(<LibraryV2Container onSwitchToClassic={onSwitch} />);

    const classicBtn = screen.getAllByText('Modo Clássico')[0];
    fireEvent.click(classicBtn);

    expect(onSwitch).toHaveBeenCalledTimes(1);
  });
});

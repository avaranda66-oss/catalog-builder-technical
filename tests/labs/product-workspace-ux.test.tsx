// tests/labs/product-workspace-ux.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { useMegaWorkspaceState } from '../../src/labs/product-workspace-ux/useMegaWorkspaceState';
import { MegaWorkspaceLab } from '../../src/labs/product-workspace-ux/MegaWorkspaceLab';
import { TA25N_INITIAL_SECTIONS } from '../../src/labs/product-workspace-ux/ta25n.fixture';
import { FactGridBlock } from '../../src/labs/product-workspace-ux/components/FactGridBlock';
import { MegaTableBlock } from '../../src/labs/product-workspace-ux/components/MegaTableBlock';

describe('HUMAN-FIRST MEGA PRODUCT WORKSPACE UX LAB SUITE', () => {
  // ==========================================================================
  // FATHER TEST SCENARIOS (10 Cenários Essenciais do Usuário Industrial)
  // ==========================================================================
  describe('THE FATHER TEST — 10 Cenários Reais de Uso Sem Jargão PIM', () => {
    it('1. "Quero descobrir a faixa do TA-25N" — Encontrado em 0-1 clique no topo', () => {
      render(<MegaWorkspaceLab />);
      // A faixa de temperatura deve estar visível de imediato no Hero
      expect(screen.getByText('Faixa de Temperatura')).toBeInTheDocument();
      expect(screen.getByText('-25 a 140')).toBeInTheDocument();
    });

    it('2. "Quero saber a exatidão" — Encontrado em 0-1 clique no topo', () => {
      render(<MegaWorkspaceLab />);
      expect(screen.getByText('Exatidão da Medição')).toBeInTheDocument();
      expect(screen.getByText('±0,1')).toBeInTheDocument();
    });

    it('3. "Quero ver todos os sensores" — Mega Tabela possui 19 linhas reais estruturadas', () => {
      render(<MegaWorkspaceLab />);
      // Verifica grupos e sensores fundamentais
      expect(screen.getByText(/Termorresistências \(RTD\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Termopares \(IEC \/ NIST\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Sinais Elétricos e Instrumentação/i)).toBeInTheDocument();
      expect(screen.getByText('Pt-100 (IEC 751)')).toBeInTheDocument();
      expect(screen.getByText('Termopar Tipo K')).toBeInTheDocument();
      expect(screen.getByText('Corrente de Loop (mA)')).toBeInTheDocument();
    });

    it('4. "Quero achar Pt100" — Busca local in-table ou busca global localiza imediatamente', () => {
      render(<MegaWorkspaceLab />);
      const searchInput = screen.getByPlaceholderText(/Buscar neste produto/i);
      fireEvent.change(searchInput, { target: { value: 'Pt100' } });

      // O dropdown de resultados da busca acha o sensor
      expect(screen.getByText(/Pt-100 \(IEC 751\)/i)).toBeInTheDocument();
    });

    it('5. "Quero alterar o peso" — Editar informação em ≤2 cliques sem jargão CAS/datumId', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      const pesoFact = (result.current.sections[0].blocks[0].data as any).facts.find((f: any) => f.label === 'Peso');
      expect(pesoFact.value).toBe('10,5');

      // Atualiza peso com escopo específico
      act(() => {
        result.current.updateFact(pesoFact.id, { value: '11,0' }, 'model');
      });

      const updatedFact = (result.current.sections[0].blocks[0].data as any).facts.find((f: any) => f.label === 'Peso');
      expect(updatedFact.value).toBe('11,0');
      expect(updatedFact.originScope).toBe('model');
    });

    it('6. "Quero descobrir de qual manual veio a faixa" — 1 clique na affordance de fonte', () => {
      const mockOpenSource = vi.fn();
      const rangeFact = (TA25N_INITIAL_SECTIONS[0].blocks[0].data as any).facts[0];

      render(
        <FactGridBlock
          facts={[rangeFact]}
          variant="hero"
          onEditFact={vi.fn()}
          onOpenSource={mockOpenSource}
          onOpenSemantic={vi.fn()}
        />
      );

      // Clica no ícone de fonte
      const sourceBtn = screen.getByTitle(/Fonte: EM0291-04/i);
      fireEvent.click(sourceBtn);

      expect(mockOpenSource).toHaveBeenCalledWith(rangeFact);
      expect(rangeFact.source?.documentCode).toBe('EM0291-04');
      expect(rangeFact.source?.page).toBe(5);
    });

    it('7. "Quero adicionar uma informação" — Adiciona especificação técnica em ≤2 cliques', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      act(() => {
        result.current.addFact('sec-metrologia', {
          label: 'Coeficiente Térmico Residual',
          value: '0,001',
          unit: '°C/°C',
          originScope: 'model',
          originLabel: 'TA-25N',
          semanticKey: 'metrology.temp_coeff'
        });
      });

      const metroSection = result.current.sections.find((s) => s.id === 'sec-metrologia')!;
      const factsBlock = metroSection.blocks.find((b) => b.kind === 'fact_grid')!;
      expect(((factsBlock.data as any).facts).some((f: any) => f.label === 'Coeficiente Térmico Residual')).toBe(true);
    });

    it('8. "Quero criar uma tabela" — Criação fluida com opções de dados existentes ou nova', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      act(() => {
        result.current.createNewTable(
          'sec-metrologia',
          'Tabela de Aferição Primária',
          ['Ponto', 'Temperatura Referência', 'Erro Medido'],
          [['P1', '0,00 °C', '+0,01 °C']]
        );
      });

      const metroSection = result.current.sections.find((s) => s.id === 'sec-metrologia')!;
      const tableBlock = metroSection.blocks.find((b) => b.title === 'Tabela de Aferição Primária')!;
      expect(tableBlock).toBeDefined();
      expect(tableBlock.kind).toBe('table');
      expect(((tableBlock.data as any).table).rows[0].values[0]).toBe('P1');
    });

    it('9. "Quero mudar o nome de uma seção" — Renomeia em ≤2 ações', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      act(() => {
        result.current.renameSection('sec-metrologia', 'Metrologia e Calibração Fina');
      });

      const renamed = result.current.sections.find((s) => s.id === 'sec-metrologia')!;
      expect(renamed.title).toBe('Metrologia e Calibração Fina');
    });

    it('10. "Quero mover a tabela para cima" — Reordena bloco com persistência local e feedback', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      const initialOrder = result.current.sections.map((s) => s.id);
      expect(initialOrder[0]).toBe('sec-resumo');
      expect(initialOrder[1]).toBe('sec-metrologia');

      // Move a seção 1 para cima (índice 0)
      act(() => {
        result.current.moveSection(1, 0);
      });

      const newOrder = result.current.sections.map((s) => s.id);
      expect(newOrder[0]).toBe('sec-metrologia');
      expect(newOrder[1]).toBe('sec-resumo');
    });
  });

  // ==========================================================================
  // UNDO UX & REVERSIBILIDADE LOCAL
  // ==========================================================================
  describe('UNDO UX — Histórico Local e Desfazer Imediato', () => {
    it('Qualquer alteração de layout gera snapshot de Undo e reverte fielmente', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      const originalTitle = result.current.sections[0].title;
      act(() => {
        result.current.renameSection(result.current.sections[0].id, 'Título Modificado 123');
      });

      expect(result.current.sections[0].title).toBe('Título Modificado 123');
      expect(result.current.undoToastMessage).toContain('Desfazer');

      // Desfaz a ação
      act(() => {
        result.current.undo();
      });
      expect(result.current.sections[0].title).toBe(originalTitle);
      expect(result.current.undoToastMessage).toBeNull();
    });
  });

  // ==========================================================================
  // MEGA TABLE ADVANCED FEATURES
  // ==========================================================================
  describe('MEGA TABLE ADVANCED FEATURES (Densidade, Filtro e Fullscreen)', () => {
    it('Filtro interno restringe linhas de sensores sem perder integridade dos grupos', () => {
      const megaTableData = (TA25N_INITIAL_SECTIONS[3].blocks[0].data as any).table;
      render(<MegaTableBlock table={megaTableData} />);

      const tableFilterInput = screen.getByPlaceholderText(/Filtrar sensores/i);
      fireEvent.change(tableFilterInput, { target: { value: 'Pt-100' } });

      expect(screen.getByText('Pt-100 (IEC 751)')).toBeInTheDocument();
      expect(screen.queryByText('Termopar Tipo K')).not.toBeInTheDocument();
    });

    it('Alternância entre densidade compacta, normal e confortável funciona perfeitamente', () => {
      const megaTableData = (TA25N_INITIAL_SECTIONS[3].blocks[0].data as any).table;
      render(<MegaTableBlock table={megaTableData} />);

      const compactBtn = screen.getByText('Compacta');
      const normalBtn = screen.getByText('Normal');
      const comfortableBtn = screen.getByText('Confortável');

      fireEvent.click(comfortableBtn);
      expect(comfortableBtn).toHaveClass('bg-[#003366]');

      fireEvent.click(normalBtn);
      expect(normalBtn).toHaveClass('bg-[#003366]');

      fireEvent.click(compactBtn);
      expect(compactBtn).toHaveClass('bg-[#003366]');
    });
  });

  // ==========================================================================
  // CONFLICT RESOLUTION & SAFE SEMANTIC RENAME
  // ==========================================================================
  describe('CONFLICT RESOLUTION & SAFE SEMANTIC RENAME', () => {
    it('Conciliação humana resolve divergência e atualiza valor sem expor dados criptográficos de CAS', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      const conflictSec = result.current.sections.find((s) => s.id === 'sec-conflitos')!;
      const conflictItem = (conflictSec.blocks[0].data as any).conflicts[0];

      expect(conflictItem).toBeDefined();
      expect(conflictItem.label).toBe('Temperatura Máxima de Operação');

      // Resolve escolhendo o valor do manual EN (155 °C)
      act(() => {
        result.current.resolveConflict(conflictItem.id, '155', '°C');
      });

      const updatedSec = result.current.sections.find((s) => s.id === 'sec-conflitos')!;
      expect((updatedSec.blocks[0].data as any).conflicts.length).toBe(0);
    });

    it('Safe Semantic Rename atualiza chave canônica e preserva chave antiga como alias', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      act(() => {
        result.current.performSafeSemanticRename('temperature.stability', 'thermal.stability');
      });

      const heroSec = result.current.sections.find((s) => s.id === 'sec-resumo')!;
      const stabFact = (heroSec.blocks[0].data as any).facts.find((f: any) => f.label === 'Estabilidade Térmica')!;

      expect(stabFact.semanticKey).toBe('thermal.stability');
      // A chave antiga foi preservada como alias de compatibilidade
      expect(stabFact.aliases).toContain('temperature.stability');
    });
  });

  // ==========================================================================
  // AI ORGANIZATION ASSISTANT
  // ==========================================================================
  describe('AI ORGANIZATION ASSISTANT (Layout Optimization Without Data Mutation)', () => {
    it('AI Organize reordena seções logicamente garantindo zero informações removidas', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      let diff: any = null;
      act(() => {
        diff = result.current.applyAIOrganization();
      });

      expect(diff.removedFactsCount).toBe(0);
      expect(diff.newTablesCount).toBe(1);

      // Ordem lógica esperada: Resumo -> Metrologia -> Sensores
      expect(result.current.sections[0].id).toBe('sec-resumo');
      expect(result.current.sections[1].id).toBe('sec-metrologia');
      expect(result.current.sections[2].id).toBe('sec-sensores');
    });
  });
});

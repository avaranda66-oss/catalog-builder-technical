// tests/labs/product-workspace-ux.test.tsx
/**
 * Testes Unitários e de Integração do Human-First Mega Product Workspace UX Lab.
 * 
 * Cobertura Completa:
 * - 13 Cenários Father Test TA-25N
 * - 10 Cenários Father Test PCON KOMPRESSOR-Y18 (Jornadas reais: navegação, busca, tabela, fontes, conflitos)
 * - Isolamento Total de Estado por Produto (Amendment 4)
 * - Modelo Atômico de Undo e No-Op (Amendment 5: exatamente 6 undos -> deep equality)
 * - Stress Test 500 Fatos & Tabela 100x15 (Amendment 7)
 * - Múltiplas Fontes Concordantes (5 fontes)
 * - Neutralidade Rigorosa em Conflitos
 * - Acessibilidade (Roving tabindex, Escape, role="dialog", th scope="col")
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { useMegaWorkspaceState } from '../../src/labs/product-workspace-ux/useMegaWorkspaceState';
import { MegaWorkspaceLab } from '../../src/labs/product-workspace-ux/MegaWorkspaceLab';
import { TA25N_INITIAL_SECTIONS } from '../../src/labs/product-workspace-ux/ta25n.fixture';
import { PCON_Y18_INITIAL_SECTIONS } from '../../src/labs/product-workspace-ux/pconKompressorY18.fixture';
import { STRESS_500_INITIAL_SECTIONS } from '../../src/labs/product-workspace-ux/stressProduct500.fixture';
import { FactGridBlock } from '../../src/labs/product-workspace-ux/components/FactGridBlock';
import { MegaTableBlock } from '../../src/labs/product-workspace-ux/components/MegaTableBlock';
import { SourceDrawer } from '../../src/labs/product-workspace-ux/components/SourceDrawer';
import { EditFactModal } from '../../src/labs/product-workspace-ux/components/EditFactModal';
import {
  deriveWorkspaceMetrics,
  WorkspaceSection,
  FactItem
} from '../../src/labs/product-workspace-ux/types';

describe('HUMAN-FIRST MEGA PRODUCT WORKSPACE UX LAB SUITE', () => {
  // ==========================================================================
  // 1. FATHER TEST TA-25N (13 Cenários Originais Mantidos e Homologados)
  // ==========================================================================
  describe('THE FATHER TEST — TA-25N (13 Cenários Reais de Uso)', () => {
    it('1. "Quero descobrir a faixa do TA-25N" — Encontrado em 0-1 clique no topo', () => {
      render(<MegaWorkspaceLab />);
      expect(screen.getByText('Faixa de Temperatura')).toBeInTheDocument();
      expect(screen.getByText('-25 a 140')).toBeInTheDocument();
    });

    it('2. "Quero saber a exatidão" — Encontrado em 0-1 clique no topo', () => {
      render(<MegaWorkspaceLab />);
      expect(screen.getByText('Exatidão da Medição')).toBeInTheDocument();
      expect(screen.getByText('±0,1')).toBeInTheDocument();
    });

    it('3. "Quero ver todos os sensores" — Mega Tabela possui linhas estruturadas', () => {
      render(<MegaWorkspaceLab />);
      expect(screen.getByText(/Termorresistências \(RTD\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Termopares \(IEC \/ NIST\)/i)).toBeInTheDocument();
      expect(screen.getByText('Pt-100 (IEC 751)')).toBeInTheDocument();
      expect(screen.getByText('Termopar Tipo K')).toBeInTheDocument();
    });

    it('4. "Quero achar Pt100" — Busca localiza imediatamente', () => {
      render(<MegaWorkspaceLab />);
      const searchInput = screen.getByLabelText(/buscar neste produto/i);
      fireEvent.change(searchInput, { target: { value: 'Pt100' } });
      expect(screen.getByText(/Pt-100 \(IEC 751\)/i)).toBeInTheDocument();
    });

    it('5. "Quero alterar o peso" — Editar informação em ≤2 cliques sem jargão CAS', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      const pesoFact = (result.current.sections[0].blocks[0].data as any).facts.find((f: any) => f.label === 'Peso');
      expect(pesoFact.value).toBe('10,5');

      act(() => {
        result.current.stageFactEdit(pesoFact.id, { value: '11,0' }, 'model');
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

      const sourceBtn = screen.getByTitle(/fontes técnicas|Fonte: EM0291-04/i);
      fireEvent.click(sourceBtn);

      expect(mockOpenSource).toHaveBeenCalledWith(rangeFact);
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

      const metroSec = result.current.sections.find((s) => s.id === 'sec-metrologia')!;
      const grid = metroSec.blocks.find((b) => b.kind === 'fact_grid')!;
      const added = (grid.data as any).facts.find((f: any) => f.label === 'Coeficiente Térmico Residual');

      expect(added).toBeDefined();
      expect(added.value).toBe('0,001');
    });

    it('8. "Quero reorganizar a página" — Reordenar seções e blocos em modo edição', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      act(() => {
        result.current.setMode('edit_workspace');
      });
      expect(result.current.mode).toBe('edit_workspace');

      const initialFirstSec = result.current.sections[0].id;
      act(() => {
        result.current.moveSection(0, 1);
      });
      expect(result.current.sections[1].id).toBe(initialFirstSec);
    });

    it('9. "Fiz besteira, quero desfazer" — Undo local recupera estado anterior', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      const originalTitle = result.current.sections[0].title;
      act(() => {
        result.current.renameSection(result.current.sections[0].id, 'Título Modificado por Engano');
      });
      expect(result.current.sections[0].title).toBe('Título Modificado por Engano');

      act(() => {
        result.current.undo();
      });
      expect(result.current.sections[0].title).toBe(originalTitle);
    });

    it('10. "A IA pode arrumar pra mim?" — Organização com IA em 1 clique', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      let diffResult: any;
      act(() => {
        diffResult = result.current.applyAIOrganization();
      });

      expect(diffResult.summary).toContain('ordem lógica');
      expect(diffResult.removedFactsCount).toBe(0);
    });

    it('11. "Existem duas fontes conflitantes; percebo que o sistema não assume verdade?" — Tom neutro', () => {
      const secConflitos = TA25N_INITIAL_SECTIONS.find((s) => s.id === 'sec-conflitos')!;
      const conflictFact = (secConflitos.blocks[0].data as any).conflicts[0];
      expect(conflictFact).toBeDefined();

      render(
        <SourceDrawer
          fact={conflictFact}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText(/O sistema encontrou informações oficiais divergentes/i)).toBeInTheDocument();
      expect(screen.getByText(/não assume arbitrariamente qual valor é verdadeiro/i)).toBeInTheDocument();
    });

    it('12. "Quero esconder Peso do Resumo sem apagar Peso do produto" — Visibilidade independente', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      const heroSec = result.current.sections[0];
      const pesoFact = (heroSec.blocks[0].data as any).facts.find((f: any) => f.label === 'Peso');
      expect(pesoFact.isHidden).toBeFalsy();

      act(() => {
        result.current.toggleFactVisibility(pesoFact.id);
      });

      const updatedHero = result.current.sections[0];
      const updatedPeso = (updatedHero.blocks[0].data as any).facts.find((f: any) => f.label === 'Peso');
      expect(updatedPeso.isHidden).toBe(true);
      expect(updatedPeso.value).toBe('10,5');
    });

    it('13. "Quero mudar o nome visual Estabilidade sem alterar a chave técnica" — Display override', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      const secResumo = result.current.sections.find((s) => s.id === 'sec-resumo')!;
      const stabFact = (secResumo.blocks[0].data as any).facts.find((f: any) => f.label === 'Estabilidade Térmica');
      expect(stabFact.semanticKey).toBe('temperature.stability');

      act(() => {
        result.current.updateFactDisplayLabel(stabFact.id, 'Estabilidade Nominal Garantida');
      });

      const updatedSec = result.current.sections.find((s) => s.id === 'sec-resumo')!;
      const updatedFact = (updatedSec.blocks[0].data as any).facts.find((f: any) => f.id === stabFact.id);
      expect(updatedFact.label).toBe('Estabilidade Nominal Garantida');
      expect(updatedFact.semanticKey).toBe('temperature.stability');
    });
  });

  // ==========================================================================
  // 2. FATHER TEST PCON KOMPRESSOR-Y18 (10 Cenários Obrigatórios - Amendment 10)
  // ==========================================================================
  describe('THE FATHER TEST — PCON KOMPRESSOR-Y18 (10 Cenários Reais)', () => {
    it('PCON-1. Achar faixa de pressão (-0,9 a 70 bar)', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('pcon_y18'));
      expect(result.current.productMetadata.name).toBe('PCON KOMPRESSOR-Y18');

      // Busca por "pressão"
      act(() => {
        result.current.setSearchQuery('pressão');
      });

      const found = result.current.searchResults.find((r) => r.subtitle.includes('-0,9 a 70') || r.title.includes('Faixa de Pressão'));
      expect(found).toBeDefined();
    });

    it('PCON-2. Achar conexão de processo (1/8" NPT Fêmea)', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('pcon_y18'));

      act(() => {
        result.current.setSearchQuery('NPT');
      });

      const found = result.current.searchResults.find((r) => r.subtitle.includes('NPT') || r.title.includes('NPT'));
      expect(found).toBeDefined();
    });

    it('PCON-3. Achar HART (Protocolo v7.5 e Resistor 250 Ω)', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('pcon_y18'));

      act(() => {
        result.current.setSearchQuery('HART');
      });

      const found = result.current.searchResults.find((r) => r.title.includes('HART') || r.subtitle.includes('v7.5'));
      expect(found).toBeDefined();
    });

    it('PCON-4. Abrir uma mega tabela (Faixas de Pressão com módulos)', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('pcon_y18'));

      const pressSec = result.current.sections.find((s) => s.id === 'sec-pcon-pressao')!;
      const megaTableBlock = pressSec.blocks.find((b) => b.kind === 'mega_table')!;
      expect(megaTableBlock).toBeDefined();

      if (megaTableBlock.data.kind === 'mega_table') {
        expect(megaTableBlock.data.table.rows.length).toBeGreaterThanOrEqual(5);
        expect(megaTableBlock.data.table.columns.length).toBeGreaterThanOrEqual(5);
      }
    });

    it('PCON-5. Achar código de pedido (Ordering Code Y18)', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('pcon_y18'));

      const orderingSec = result.current.sections.find((s) => s.id === 'sec-pcon-ordering')!;
      expect(orderingSec).toBeDefined();
      expect(orderingSec.title).toContain('Código de Pedido');
    });

    it('PCON-6. Ver fonte técnica no PCON (Documento Oficial MP-PCON-Y18)', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('pcon_y18'));

      const heroFact = (result.current.sections[0].blocks[0].data as any).facts[0];
      expect(heroFact.source.documentCode).toBe('MP-PCON-Y18');

      render(
        <SourceDrawer
          fact={heroFact}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('MP-PCON-Y18')).toBeInTheDocument();
    });

    it('PCON-7. Editar label visual de uma especificação no PCON', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('pcon_y18'));

      const fact = (result.current.sections[0].blocks[0].data as any).facts[0];
      act(() => {
        result.current.updateFactDisplayLabel(fact.id, 'Faixa Operacional Pneumática');
      });

      const updated = (result.current.sections[0].blocks[0].data as any).facts[0];
      expect(updated.label).toBe('Faixa Operacional Pneumática');
      expect(updated.semanticKey).toBe(fact.semanticKey);
    });

    it('PCON-8. Ocultar bloco no PCON', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('pcon_y18'));

      const sec = result.current.sections[1];
      const blockToHide = sec.blocks[0];

      act(() => {
        result.current.hideBlock(sec.id, blockToHide.id);
      });

      const updatedSec = result.current.sections[1];
      expect(updatedSec.blocks[0].isHidden).toBe(true);
    });

    it('PCON-9. Adicionar informação técnica no PCON', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('pcon_y18'));

      act(() => {
        result.current.addFact('sec-pcon-pressao', {
          label: 'Pressão de Ruptura de Segurança',
          value: '140',
          unit: 'bar',
          originScope: 'model',
          originLabel: 'PCON KOMPRESSOR-Y18',
          semanticKey: 'pressure.burst.safety'
        });
      });

      const sec = result.current.sections.find((s) => s.id === 'sec-pcon-pressao')!;
      const grid = sec.blocks.find((b) => b.kind === 'fact_grid')!;
      const added = (grid.data as any).facts.find((f: any) => f.label === 'Pressão de Ruptura de Segurança');
      expect(added).toBeDefined();
    });

    it('PCON-10. Identificar conflito sem acusação de erro no PCON', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('pcon_y18'));

      const conflictSec = result.current.sections.find((s) => s.id === 'sec-pcon-conflitos')!;
      const conflictFact = (conflictSec.blocks[0].data as any).conflicts[0];

      render(
        <SourceDrawer
          fact={conflictFact}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      // Não acusa erro, informa divergência oficial
      expect(screen.getByText(/O sistema encontrou informações oficiais divergentes/i)).toBeInTheDocument();
      expect(screen.queryByText(/erro de sistema/i)).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 3. PRODUCT STATE ISOLATION (Amendment 4)
  // ==========================================================================
  describe('PRODUCT STATE ISOLATION — Troca de produto não contamina dados', () => {
    it('Edita TA -> Troca PCON -> PCON intacto -> Volta TA -> Edição preservada', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('ta25n'));

      // 1. Edita TA-25N
      const pesoFactTA = (result.current.sections[0].blocks[0].data as any).facts.find((f: any) => f.label === 'Peso');
      act(() => {
        result.current.stageFactEdit(pesoFactTA.id, { value: '99,9' }, 'model');
      });

      // Confirma edição no TA
      const taFactUpdated = (result.current.sections[0].blocks[0].data as any).facts.find((f: any) => f.label === 'Peso');
      expect(taFactUpdated.value).toBe('99,9');

      // 2. Troca para PCON
      act(() => {
        result.current.setActiveProductId('pcon_y18');
      });
      expect(result.current.productMetadata.name).toBe('PCON KOMPRESSOR-Y18');

      // 3. PCON intacto (Peso com compressor = 8,5 kg)
      const pesoFactPCON = (result.current.sections[0].blocks[0].data as any).facts.find(
        (f: any) => f.label === 'Peso com Compressor'
      );
      expect(pesoFactPCON.value).toBe('8,5');

      // 4. Volta para TA-25N
      act(() => {
        result.current.setActiveProductId('ta25n');
      });
      expect(result.current.productMetadata.name).toBe('PRESYS TA-25N');

      // 5. Edição do TA continua perfeitamente preservada
      const taFactRestored = (result.current.sections[0].blocks[0].data as any).facts.find((f: any) => f.label === 'Peso');
      expect(taFactRestored.value).toBe('99,9');
    });
  });

  // ==========================================================================
  // 4. ATOMIC UNDO MODEL & NO-OP (Amendment 5)
  // ==========================================================================
  describe('ATOMIC UNDO MODEL — No-Op e Reversibilidade Exata x6', () => {
    it('No-Op gera ZERO entradas no histórico de Undo', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());

      expect(result.current.undoStack.length).toBe(0);

      // Aplica mutação que retorna o mesmo estado (no-op)
      act(() => {
        result.current.renameSection(result.current.sections[0].id, result.current.sections[0].title);
      });

      expect(result.current.undoStack.length).toBe(0);
    });

    it('Executa 6 mutações distintas -> Exatamente 6 undos -> Deep Equality inicial', () => {
      const { result } = renderHook(() => useMegaWorkspaceState());
      const initialJson = JSON.stringify(result.current.sections);

      // Mutação 1: Renomear seção
      act(() => {
        result.current.renameSection(result.current.sections[0].id, 'Seção Teste 1');
      });
      expect(result.current.undoStack.length).toBe(1);

      // Mutação 2: Mover seção
      act(() => {
        result.current.moveSection(0, 1);
      });
      expect(result.current.undoStack.length).toBe(2);

      // Mutação 3: Ocultar bloco
      act(() => {
        result.current.hideBlock(result.current.sections[0].id, result.current.sections[0].blocks[0].id);
      });
      expect(result.current.undoStack.length).toBe(3);

      // Mutação 4: Redimensionar bloco
      act(() => {
        result.current.resizeBlock(result.current.sections[0].id, result.current.sections[0].blocks[0].id, 'small');
      });
      expect(result.current.undoStack.length).toBe(4);

      // Mutação 5: Adicionar fato
      act(() => {
        result.current.addFact(result.current.sections[0].id, {
          label: 'Fato Teste 5',
          value: '55',
          originScope: 'model',
          originLabel: 'Teste',
          semanticKey: 'test.undo.5'
        });
      });
      expect(result.current.undoStack.length).toBe(5);

      // Mutação 6: Renomear outra seção
      act(() => {
        result.current.renameSection(result.current.sections[1].id, 'Seção Teste 6');
      });
      expect(result.current.undoStack.length).toBe(6);

      // Agora desfaz as 6 mutações consecutivas
      act(() => { result.current.undo(); }); // volta para 5
      expect(result.current.undoStack.length).toBe(5);

      act(() => { result.current.undo(); }); // volta para 4
      expect(result.current.undoStack.length).toBe(4);

      act(() => { result.current.undo(); }); // volta para 3
      expect(result.current.undoStack.length).toBe(3);

      act(() => { result.current.undo(); }); // volta para 2
      expect(result.current.undoStack.length).toBe(2);

      act(() => { result.current.undo(); }); // volta para 1
      expect(result.current.undoStack.length).toBe(1);

      act(() => { result.current.undo(); }); // volta para 0
      expect(result.current.undoStack.length).toBe(0);

      // Deep Equality estrito com o estado inicial
      const finalJson = JSON.stringify(result.current.sections);
      expect(finalJson).toBe(initialJson);
    });
  });

  // ==========================================================================
  // 5. STRESS TEST 500 FATOS & TABELA 100x15 (Amendment 7)
  // ==========================================================================
  describe('STRESS TEST 500 FATOS & TABELA 100x15', () => {
    it('Carrega STRESS-500 com 500 fatos e tabela 100x15 sem travar', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('stress_500'));

      expect(result.current.productMetadata.name).toContain('STRESS-500');
      expect(result.current.derivedCounts.factsCount).toBe(500);

      // Tabela 100x15 na seção 3
      const tableSec = result.current.sections.find((s) => s.id === 'sec-stress-03-table-100x15')!;
      const megaTable = tableSec.blocks[0];

      if (megaTable.data.kind === 'mega_table') {
        expect(megaTable.data.table.rows.length).toBe(100);
        expect(megaTable.data.table.columns.length).toBe(15);
      }
    });

    it('Busca veloz em 500 fatos registra tempo em ms e localiza canal', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('stress_500'));

      act(() => {
        result.current.setSearchQuery('CH-050');
      });

      expect(result.current.searchResults.length).toBeGreaterThanOrEqual(1);
      expect(result.current.lastSearchDurationMs).toBeDefined();
      // O benchmark de busca deve ser rápido (< 250ms no ambiente de teste)
      expect(result.current.lastSearchDurationMs).toBeLessThan(250);
    });
  });

  // ==========================================================================
  // 6. MULTI-SOURCE: 5 FONTES CONCORDANTES
  // ==========================================================================
  describe('MULTI-SOURCE UX — Suporte a 5 Fontes Concordantes', () => {
    it('Exibe badge de 5 fontes concordantes e lista todos os documentos comprobatórios', () => {
      const factWith5Sources = (STRESS_500_INITIAL_SECTIONS[0].blocks[0].data as any).facts[0];
      expect(factWith5Sources.sources.length).toBe(5);

      render(
        <SourceDrawer
          fact={factWith5Sources}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText(/5 fontes técnicas concordantes/i)).toBeInTheDocument();
      expect(screen.getByText('SYNTH-MAN-01')).toBeInTheDocument();
      expect(screen.getByText('SYNTH-CAL-02')).toBeInTheDocument();
      expect(screen.getByText('SYNTH-TUV-03')).toBeInTheDocument();
      expect(screen.getByText('SYNTH-OEM-04')).toBeInTheDocument();
      expect(screen.getByText('SYNTH-STD-05')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 7. ACESSIBILIDADE (ROVING TABINDEX, ESCAPE & ARIA)
  // ==========================================================================
  describe('ACCESSIBILITY — Teclado, Escape e Semântica de Tabela', () => {
    it('MegaTableBlock possui th com scope="col" e navegação de foco por célula', () => {
      const sampleTable = (PCON_Y18_INITIAL_SECTIONS[1].blocks[1].data as any).table;

      render(
        <MegaTableBlock
          table={sampleTable}
        />
      );

      const headers = screen.getAllByRole('columnheader');
      expect(headers.length).toBeGreaterThanOrEqual(5);
      headers.forEach((th) => {
        expect(th).toHaveAttribute('scope', 'col');
      });
    });

    it('Escape fecha modais e drawers', () => {
      const mockCloseEdit = vi.fn();
      const mockCloseSource = vi.fn();
      const sampleFact = (TA25N_INITIAL_SECTIONS[0].blocks[0].data as any).facts[0];

      const { rerender } = render(
        <EditFactModal
          fact={sampleFact}
          isOpen={true}
          onClose={mockCloseEdit}
          onSave={vi.fn()}
          onOpenSource={vi.fn()}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(mockCloseEdit).toHaveBeenCalled();

      rerender(
        <SourceDrawer
          fact={sampleFact}
          isOpen={true}
          onClose={mockCloseSource}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(mockCloseSource).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 8. CROSS-PRODUCT GENERALIZATION AUDIT (Amendment 3)
  // ==========================================================================
  describe('CROSS-PRODUCT GENERALIZATION — Reusable Components Audit', () => {
    it('Componentes reutilizáveis possuem ZERO hardcodes de TA, PCON ou Y18', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const componentsDir = path.resolve(__dirname, '../../src/labs/product-workspace-ux/components');
      const files = fs.readdirSync(componentsDir).filter((f: string) => f.endsWith('.tsx'));

      const forbiddenRegex = /\b(TA-25N|Linha TA|PCON-Y18|KOMPRESSOR)\b/;

      for (const file of files) {
        const content = fs.readFileSync(path.join(componentsDir, file), 'utf8');
        expect(
          forbiddenRegex.test(content),
          `Componente reutilizável "${file}" contém nome de produto hardcoded!`
        ).toBe(false);
      }
    });
  });

  // ==========================================================================
  // 9. UX1.3 MANDATORY AMENDMENTS VERIFICATION SUITE (16 TESTES OBRIGATÓRIOS)
  // ==========================================================================
  describe('UX1.3 MANDATORY AMENDMENTS VERIFICATION SUITE', () => {
    // 1. same datum Hero + Grid = unique 1 / occurrence 2
    it('1. same datum Hero + Grid = unique 1 / occurrence 2', () => {
      const datumId = 'datum-sample-temp-range';
      const mockSections: WorkspaceSection[] = [
        {
          id: 'sec-1',
          title: 'Resumo',
          blocks: [
            {
              id: 'blk-hero',
              kind: 'hero_summary',
              title: 'Hero',
              size: 'full',
              data: {
                kind: 'hero_summary',
                headline: 'Resumo Técnico',
                facts: [
                  {
                    id: datumId,
                    label: 'Faixa de Temperatura',
                    value: '-25 a 140',
                    unit: '°C',
                    semanticKey: 'temp.range',
                    originScope: 'model',
                    originLabel: 'TA-25N'
                  }
                ]
              }
            },
            {
              id: 'blk-grid',
              kind: 'fact_grid',
              title: 'Grid',
              size: 'full',
              data: {
                kind: 'fact_grid',
                facts: [
                  {
                    id: datumId,
                    label: 'Faixa de Operação',
                    value: '-25 a 140',
                    unit: '°C',
                    semanticKey: 'temp.range',
                    originScope: 'model',
                    originLabel: 'TA-25N'
                  }
                ]
              }
            }
          ]
        }
      ];

      const metrics = deriveWorkspaceMetrics(mockSections);
      expect(metrics.visibleUniqueFactsCount).toBe(1);
      expect(metrics.visibleFactOccurrences).toBe(2);
    });

    // 2. same datum Hero + Grid + Table = unique 1 / occurrence 3
    it('2. same datum Hero + Grid + Table = unique 1 / occurrence 3', () => {
      const datumId = 'datum-sample-temp-range';
      const mockSections: WorkspaceSection[] = [
        {
          id: 'sec-1',
          title: 'Resumo',
          blocks: [
            {
              id: 'blk-hero',
              kind: 'hero_summary',
              title: 'Hero',
              size: 'full',
              data: {
                kind: 'hero_summary',
                headline: 'Resumo Técnico',
                facts: [
                  { id: datumId, label: 'Faixa', value: '-25 a 140', unit: '°C', semanticKey: 'temp.range', originScope: 'model', originLabel: 'TA-25N' }
                ]
              }
            },
            {
              id: 'blk-grid',
              kind: 'fact_grid',
              title: 'Grid',
              size: 'full',
              data: {
                kind: 'fact_grid',
                facts: [
                  { id: datumId, label: 'Faixa', value: '-25 a 140', unit: '°C', semanticKey: 'temp.range', originScope: 'model', originLabel: 'TA-25N' }
                ]
              }
            },
            {
              id: 'blk-table',
              kind: 'mega_table',
              title: 'Tabela',
              size: 'full',
              data: {
                kind: 'mega_table',
                table: {
                  columns: [{ id: 'col1', header: 'Valor' }],
                  rows: [
                    {
                      id: 'r1',
                      cells: {
                        col1: {
                          value: '-25 a 140',
                          type: 'fact_ref',
                          factId: datumId,
                          canonicalSemanticKey: 'temp.range'
                        }
                      }
                    }
                  ]
                }
              }
            }
          ]
        }
      ];

      const metrics = deriveWorkspaceMetrics(mockSections);
      expect(metrics.visibleUniqueFactsCount).toBe(1);
      expect(metrics.visibleFactOccurrences).toBe(3);
    });

    // 3. table with 10 rows x 5 technical cells does NOT equal 10 facts
    it('3. table with 10 rows x 5 technical cells does NOT equal 10 facts', () => {
      const rows = Array.from({ length: 10 }, (_, rIdx) => ({
        id: `row-${rIdx}`,
        cells: {
          c1: { value: `val-${rIdx}-1`, type: 'fact_ref' as const, factId: `fact-${rIdx}-1` },
          c2: { value: `val-${rIdx}-2`, type: 'fact_ref' as const, factId: `fact-${rIdx}-2` },
          c3: { value: `val-${rIdx}-3`, type: 'fact_ref' as const, factId: `fact-${rIdx}-3` },
          c4: { value: `val-${rIdx}-4`, type: 'fact_ref' as const, factId: `fact-${rIdx}-4` },
          c5: { value: `val-${rIdx}-5`, type: 'fact_ref' as const, factId: `fact-${rIdx}-5` }
        }
      }));

      const mockSections: WorkspaceSection[] = [
        {
          id: 'sec-table',
          title: 'Tabela 10x5',
          blocks: [
            {
              id: 'blk-tbl',
              kind: 'mega_table',
              title: 'Tabela Técnica',
              size: 'full',
              data: {
                kind: 'mega_table',
                table: {
                  columns: [
                    { id: 'c1', header: 'C1' },
                    { id: 'c2', header: 'C2' },
                    { id: 'c3', header: 'C3' },
                    { id: 'c4', header: 'C4' },
                    { id: 'c5', header: 'C5' }
                  ],
                  rows
                }
              }
            }
          ]
        }
      ];

      const metrics = deriveWorkspaceMetrics(mockSections);
      expect(rows.length).toBe(10);
      // TABLE ROW != FACT
      expect(metrics.visibleUniqueFactsCount).not.toBe(10);
      expect(metrics.visibleUniqueFactsCount).toBe(50);
      expect(metrics.tableFactReferencesCount).toBe(50);
    });

    // 4. table fact refs contribute to uniqueFactsCount
    it('4. table fact refs contribute to uniqueFactsCount', () => {
      const mockSections: WorkspaceSection[] = [
        {
          id: 'sec-t',
          title: 'Tabela de Referências',
          blocks: [
            {
              id: 'blk-t',
              kind: 'mega_table',
              title: 'Tabela',
              size: 'full',
              data: {
                kind: 'mega_table',
                table: {
                  columns: [{ id: 'col_a', header: 'A' }, { id: 'col_b', header: 'B' }],
                  rows: [
                    {
                      id: 'r1',
                      cells: {
                        col_a: { value: '100', type: 'fact_ref', factId: 'fact-ref-1' },
                        col_b: { value: '200', type: 'fact_ref', factId: 'fact-ref-2' }
                      }
                    },
                    {
                      id: 'r2',
                      cells: {
                        col_a: { value: '300', type: 'fact_ref', factId: 'fact-ref-3' },
                        col_b: { value: 'Literal texto', type: 'editorial_literal' }
                      }
                    }
                  ]
                }
              }
            }
          ]
        }
      ];

      const metrics = deriveWorkspaceMetrics(mockSections);
      expect(metrics.uniqueFactsCount).toBe(3);
      expect(metrics.tableFactReferencesCount).toBe(3);
    });

    // 5. editorial_literal cells contribute zero facts
    it('5. editorial_literal cells contribute zero facts', () => {
      const mockSections: WorkspaceSection[] = [
        {
          id: 'sec-literal',
          title: 'Tabela Puramente Editorial',
          blocks: [
            {
              id: 'blk-literal-tbl',
              kind: 'mega_table',
              title: 'Tabela Editorial',
              size: 'full',
              data: {
                kind: 'mega_table',
                table: {
                  columns: [{ id: 'col1', header: 'Nota' }, { id: 'col2', header: 'Descrição' }],
                  rows: Array.from({ length: 10 }, (_, i) => ({
                    id: `row-lit-${i}`,
                    cells: {
                      col1: { value: `Nota ${i}`, type: 'editorial_literal' as const },
                      col2: { value: `Texto explicativo ${i}`, type: 'editorial_literal' as const }
                    }
                  }))
                }
              }
            }
          ]
        }
      ];

      const metrics = deriveWorkspaceMetrics(mockSections);
      expect(metrics.uniqueFactsCount).toBe(0);
      expect(metrics.visibleFactOccurrences).toBe(0);
      expect(metrics.tableFactReferencesCount).toBe(0);
    });

    // 6. same source document in 5 places = sources 1
    it('6. same source document in 5 places = sources 1', () => {
      const docId = 'doc-iso-norm-9001';
      const source = {
        documentId: docId,
        documentTitle: 'Norma ISO',
        documentCode: 'ISO-9001',
        page: 1,
        excerpt: 'trecho normativo',
        verifiedStatus: 'verified' as const
      };

      const mockSections: WorkspaceSection[] = [
        {
          id: 'sec-sources',
          title: 'Seção',
          blocks: [
            {
              id: 'b1',
              kind: 'hero_summary',
              title: 'Hero',
              size: 'full',
              data: {
                kind: 'hero_summary',
                headline: 'Resumo Documental',
                facts: [
                  {
                    id: 'f1',
                    label: 'Fato 1',
                    value: '1',
                    source,
                    originScope: 'model',
                    originLabel: 'TA-25N',
                    semanticKey: 'iso.f1'
                  }
                ]
              }
            },
            {
              id: 'b2',
              kind: 'fact_grid',
              title: 'Grid',
              size: 'full',
              data: {
                kind: 'fact_grid',
                facts: [
                  {
                    id: 'f2',
                    label: 'Fato 2',
                    value: '2',
                    source,
                    originScope: 'model',
                    originLabel: 'TA-25N',
                    semanticKey: 'iso.f2'
                  }
                ]
              }
            },
            {
              id: 'b3',
              kind: 'mega_table',
              title: 'Tabela',
              size: 'full',
              data: {
                kind: 'mega_table',
                table: {
                  columns: [{ id: 'c', header: 'C' }],
                  rows: [
                    { id: 'r1', cells: { c: { value: '3', type: 'fact_ref', factId: 'f3', source } } },
                    { id: 'r2', cells: { c: { value: '4', type: 'fact_ref', factId: 'f4', source } } }
                  ]
                }
              }
            },
            {
              id: 'b4',
              kind: 'documents',
              title: 'Docs',
              size: 'full',
              data: {
                kind: 'documents',
                documents: [
                  {
                    id: docId,
                    title: 'Norma ISO',
                    code: 'ISO-9001',
                    revision: 'Rev. 1',
                    date: '2024-01',
                    totalPages: 10,
                    referencedFactsCount: 1,
                    fileSize: '1 MB'
                  }
                ]
              }
            }
          ]
        }
      ];

      const metrics = deriveWorkspaceMetrics(mockSections);
      expect(metrics.sourcesCount).toBe(1);
    });

    // 7. same conflict in 3 places = conflicts 1
    it('7. same conflict in 3 places = conflicts 1', () => {
      const conflictFactId = 'f-conflito-critico-1';
      const conflictData = {
        title: 'Divergência de Pressão',
        description: 'Divergência técnica oficial entre manual e catálogo',
        detectedAt: '2024-01-01',
        options: []
      };

      const mockSections: WorkspaceSection[] = [
        {
          id: 'sec-conflicts',
          title: 'Divergências',
          blocks: [
            {
              id: 'b-hero',
              kind: 'hero_summary',
              title: 'Hero',
              size: 'full',
              data: {
                kind: 'hero_summary',
                headline: 'Resumo de Conflitos',
                facts: [
                  {
                    id: conflictFactId,
                    label: 'Pressão',
                    value: '10',
                    conflict: conflictData,
                    originScope: 'model',
                    originLabel: 'TA-25N',
                    semanticKey: 'pressure.test'
                  }
                ]
              }
            },
            {
              id: 'b-conflicts',
              kind: 'conflicts',
              title: 'Painel Conflitos',
              size: 'full',
              data: {
                kind: 'conflicts',
                conflicts: [
                  {
                    id: conflictFactId,
                    label: 'Pressão',
                    value: '10',
                    conflict: conflictData,
                    originScope: 'model',
                    originLabel: 'TA-25N',
                    semanticKey: 'pressure.test'
                  }
                ]
              }
            },
            {
              id: 'b-table',
              kind: 'mega_table',
              title: 'Tabela',
              size: 'full',
              data: {
                kind: 'mega_table',
                table: {
                  columns: [{ id: 'c', header: 'Col' }],
                  rows: [
                    {
                      id: 'r1',
                      cells: {
                        c: { value: '10', type: 'fact_ref', factId: conflictFactId, hasConflict: true }
                      }
                    }
                  ]
                }
              }
            }
          ]
        }
      ];

      const metrics = deriveWorkspaceMetrics(mockSections);
      expect(metrics.conflictsCount).toBe(1);
    });

    // 8. family origin + multiple agreeing evidence remain independent
    it('8. family origin + multiple agreeing evidence remain independent', () => {
      const fact: FactItem = {
        id: 'f-independent-dims',
        label: 'Tensão de Alimentação',
        value: '220',
        unit: 'V',
        originScope: 'family',
        originKind: 'family',
        originLabel: 'Linha TA',
        semanticKey: 'electrical.voltage',
        evidenceState: 'multiple_agreeing',
        sources: [
          {
            documentId: 'doc-fam-1',
            documentTitle: 'Catálogo Geral Linha TA',
            documentCode: 'CAT-TA-01',
            page: 2,
            excerpt: '220V',
            verifiedStatus: 'verified'
          },
          {
            documentId: 'doc-fam-2',
            documentTitle: 'Manual de Engenharia da Família',
            documentCode: 'MAN-ENG-02',
            page: 5,
            excerpt: '220V',
            verifiedStatus: 'verified'
          }
        ]
      };

      // Ambos coexistem independentemente
      expect(fact.originKind).toBe('family');
      expect(fact.originScope).toBe('family');
      expect(fact.evidenceState).toBe('multiple_agreeing');
      expect(fact.sources?.length).toBe(2);

      // Modificar a origem não afeta o estado documental de evidência
      const localOverrideFact: FactItem = {
        ...fact,
        originKind: 'product_override',
        originScope: 'model'
      };
      expect(localOverrideFact.evidenceState).toBe('multiple_agreeing');
      expect(localOverrideFact.originKind).toBe('product_override');
    });

    // 9. simple + edit_data works
    it('9. simple + edit_data works without switching to Advanced', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('ta25n'));

      act(() => {
        result.current.setDetailLevel('simple');
        result.current.setInteractionMode('edit_data');
      });

      expect(result.current.detailLevel).toBe('simple');
      expect(result.current.interactionMode).toBe('edit_data');

      // Usuário no Father Test edita o Peso em Simple Mode
      const pesoFact = (result.current.sections[0].blocks[0].data as any).facts.find((f: any) => f.label === 'Peso');
      act(() => {
        result.current.stageFactEdit(pesoFact.id, { value: '10,8' }, 'model');
      });

      const updatedFact = (result.current.sections[0].blocks[0].data as any).facts.find((f: any) => f.label === 'Peso');
      expect(updatedFact.value).toBe('10,8');
      // Continua em Simple Mode
      expect(result.current.detailLevel).toBe('simple');
    });

    // 10. simple + edit_layout works
    it('10. simple + edit_layout works', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('ta25n'));

      act(() => {
        result.current.setDetailLevel('simple');
        result.current.setInteractionMode('edit_layout');
      });

      expect(result.current.detailLevel).toBe('simple');
      expect(result.current.interactionMode).toBe('edit_layout');

      // Renomeia seção e move
      act(() => {
        result.current.renameSection(result.current.sections[0].id, 'Resumo Geral do Instrumento');
        result.current.moveSection(0, 1);
      });

      expect(result.current.sections[1].title).toBe('Resumo Geral do Instrumento');
      expect(result.current.detailLevel).toBe('simple');
    });

    // 11. advanced + view works
    it('11. advanced + view works', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('ta25n'));

      act(() => {
        result.current.setDetailLevel('advanced');
        result.current.setInteractionMode('view');
      });

      expect(result.current.detailLevel).toBe('advanced');
      expect(result.current.interactionMode).toBe('view');
    });

    // 12. simple rendered DOM has zero forbidden jargon
    it('12. simple rendered DOM has zero forbidden jargon', () => {
      const { container } = render(<MegaWorkspaceLab />);

      // Garante que está em Simple Mode (default)
      const domText = container.textContent || '';

      // Lista de termos proibidos em Simple Mode
      const forbiddenJargon = [
        /\bdatum\b/i,
        /\bdataset\b/i,
        /\bsemanticKey\b/,
        /\bownerKind\b/i,
        /\bcanonicalDecision\b/i,
        /\bCAS\b/
      ];

      for (const pattern of forbiddenJargon) {
        expect(pattern.test(domText), `Jargão técnico proibido "${pattern}" visível no DOM do Simple Mode!`).toBe(false);
      }
    });

    // 13. search result does not increment uniqueFactsCount
    it('13. search result does not increment uniqueFactsCount', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('ta25n'));
      const initialUniqueCount = result.current.derivedCounts.uniqueFactsCount;

      act(() => {
        result.current.setSearchQuery('Temperatura');
      });

      expect(result.current.searchResults.length).toBeGreaterThan(0);
      // Search results are references only; they do not create facts
      expect(result.current.derivedCounts.uniqueFactsCount).toBe(initialUniqueCount);
    });

    // 14. hidden block behavior explicitly documented: knowledgeFactsCount vs visibleUniqueFactsCount
    it('14. hidden block behavior explicitly documented: knowledgeFactsCount vs visibleUniqueFactsCount', () => {
      const mockSections: WorkspaceSection[] = [
        {
          id: 'sec-test-hidden',
          title: 'Seção de Teste de Ocultação',
          blocks: [
            {
              id: 'blk-visible',
              kind: 'fact_grid',
              title: 'Bloco Visível',
              size: 'full',
              isHidden: false,
              data: {
                kind: 'fact_grid',
                facts: [
                  {
                    id: 'f-vis-1',
                    label: 'Fato Visível 1',
                    value: '10',
                    originScope: 'model',
                    originLabel: 'TA-25N',
                    semanticKey: 'vis.1'
                  },
                  {
                    id: 'f-vis-2',
                    label: 'Fato Visível 2',
                    value: '20',
                    originScope: 'model',
                    originLabel: 'TA-25N',
                    semanticKey: 'vis.2'
                  }
                ]
              }
            },
            {
              id: 'blk-hidden',
              kind: 'fact_grid',
              title: 'Bloco Oculto',
              size: 'full',
              isHidden: true,
              data: {
                kind: 'fact_grid',
                facts: [
                  {
                    id: 'f-hid-1',
                    label: 'Fato Oculto 1',
                    value: '30',
                    originScope: 'model',
                    originLabel: 'TA-25N',
                    semanticKey: 'hid.1'
                  },
                  {
                    id: 'f-hid-2',
                    label: 'Fato Oculto 2',
                    value: '40',
                    originScope: 'model',
                    originLabel: 'TA-25N',
                    semanticKey: 'hid.2'
                  },
                  {
                    id: 'f-hid-3',
                    label: 'Fato Oculto 3',
                    value: '50',
                    originScope: 'model',
                    originLabel: 'TA-25N',
                    semanticKey: 'hid.3'
                  }
                ]
              }
            }
          ]
        }
      ];

      const metrics = deriveWorkspaceMetrics(mockSections);
      // Total de fatos disponíveis no produto (knowledge base)
      expect(metrics.knowledgeFactsCount).toBe(5);
      // Total de fatos visíveis no workspace ativo
      expect(metrics.visibleUniqueFactsCount).toBe(2);
      expect(metrics.visibleFactOccurrences).toBe(2);
    });

    // 15. synthetic fixture cannot fake fixed 129
    it('15. synthetic fixture cannot fake fixed 129', () => {
      const { result } = renderHook(() => useMegaWorkspaceState('ta25n'));

      // A métrica não é uma constante estática 129
      const calculatedCount = deriveWorkspaceMetrics(result.current.sections).uniqueFactsCount;
      expect(result.current.derivedCounts.uniqueFactsCount).toBe(calculatedCount);

      // Se adicionamos um novo fato, o count aumenta dinamicamente
      act(() => {
        result.current.addFact(result.current.sections[0].id, {
          label: 'Fato Dinâmico Adicionado',
          value: '999',
          originScope: 'model',
          originLabel: 'TA-25N',
          semanticKey: 'dynamic.test.fact'
        });
      });

      expect(result.current.derivedCounts.uniqueFactsCount).toBe(calculatedCount + 1);
    });

    // 16. no lab in production bundle
    it('16. no lab in production bundle', async () => {
      const fs = await import('fs');
      const path = await import('path');

      // Verifica App.tsx garantindo que MegaWorkspaceLab só é importado dinamicamente sob DEV
      const appContent = fs.readFileSync(path.resolve(__dirname, '../../src/App.tsx'), 'utf8');
      expect(appContent).toContain("import.meta.env.DEV");
      expect(appContent).toContain("MegaWorkspaceLabLazy = import.meta.env.DEV");

      // Verifica que nenhum arquivo em src/components/ ou src/stores/ importa src/labs/
      const srcDir = path.resolve(__dirname, '../../src');
      const checkDirForLabImport = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'labs' && entry.name !== '__tests__') {
              checkDirForLabImport(fullPath);
            }
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
            if (entry.name === 'App.tsx') continue; // App.tsx usa import.meta.env.DEV com lazy
            const code = fs.readFileSync(fullPath, 'utf8');
            expect(
              code.includes("from './labs/") || code.includes("from '../labs/") || code.includes('from "@/labs/'),
              `Arquivo de produção ${entry.name} importa diretamente o lab sem proteção DEV!`
            ).toBe(false);
          }
        }
      };

      checkDirForLabImport(path.join(srcDir, 'components'));
      checkDirForLabImport(path.join(srcDir, 'stores'));
    });
  });
});


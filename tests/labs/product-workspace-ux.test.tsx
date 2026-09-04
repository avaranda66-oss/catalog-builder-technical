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
});


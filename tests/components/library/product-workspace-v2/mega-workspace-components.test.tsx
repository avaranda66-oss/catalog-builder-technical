// tests/components/library/product-workspace-v2/mega-workspace-components.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  WorkspaceSearch,
  SourceTraceDrawer,
  SemanticEditor,
  MegaWorkspaceShell
} from '../../../../src/components/library/product-workspace-v2';
import {
  ProjectedSourceTrace,
  SemanticDescriptor,
  WorkspaceProjection
} from '../../../../src/domain/product-workspace/types';

describe('Mega Workspace V2 React Components Foundation', () => {
  describe('WorkspaceSearch Component', () => {
    it('renderiza o input de busca e dispara callback ao digitar e ao limpar', () => {
      const onQueryChange = vi.fn();
      render(
        <WorkspaceSearch
          query="temperatura"
          onQueryChange={onQueryChange}
          matchesCount={3}
        />
      );

      const input = screen.getByPlaceholderText(/Buscar especificação/i);
      expect(input).toBeDefined();
      expect(screen.getByText('3 itens')).toBeDefined();

      const clearBtn = screen.getByTitle('Limpar busca');
      fireEvent.click(clearBtn);
      expect(onQueryChange).toHaveBeenCalledWith('');
    });
  });

  describe('SourceTraceDrawer Component', () => {
    const sampleTrace: ProjectedSourceTrace = {
      datumId: 'datum-range-1',
      displayLabel: 'Faixa de Temperatura',
      canonicalKey: 'metrology.temperature.range',
      currentValueFormatted: '-25 a 140 °C',
      originText: 'Calibrador TA-25N',
      hasConflict: false,
      hasEvidence: true,
      items: [
        {
          sourceTitle: 'Manual de Instruções TA',
          documentType: 'manual',
          revision: 'EM0291-04',
          page: 5,
          section: '1. Especificações',
          observedValueText: '-25 a 140 °C',
          isConsensus: true
        }
      ]
    };

    it('renderiza título, documento, página e esconde UUIDs por padrão no modo simples', () => {
      const onClose = vi.fn();
      render(
        <SourceTraceDrawer
          isOpen={true}
          onClose={onClose}
          trace={sampleTrace}
          mode="simple"
        />
      );

      expect(screen.getByText('Rastreamento de Origem')).toBeDefined();
      expect(screen.getByText('Faixa de Temperatura')).toBeDefined();
      expect(screen.getByText('Manual de Instruções TA')).toBeDefined();
      expect(screen.getByText(/Pág. 5/)).toBeDefined();

      // No modo simples, detalhes técnicos começam recolhidos
      expect(screen.queryByText('datum-range-1')).toBeNull();

      // Abre detalhes técnicos
      const toggleBtn = screen.getByText(/Detalhes Técnicos & Identificadores/i);
      fireEvent.click(toggleBtn);
      expect(screen.getByText('datum-range-1')).toBeDefined();
    });
  });

  describe('SemanticEditor Component', () => {
    const sampleDescriptor: SemanticDescriptor = {
      canonicalKey: 'metrology.temperature.stability',
      displayLabel: 'Estabilidade Térmica',
      aliases: ['estabilidade']
    };

    it('permite alterar o label de exibição e adicionar aliases mantendo a canonicalKey', () => {
      const onSave = vi.fn();
      const onClose = vi.fn();

      render(
        <SemanticEditor
          isOpen={true}
          onClose={onClose}
          descriptor={sampleDescriptor}
          onSave={onSave}
        />
      );

      expect(screen.getByText('metrology.temperature.stability')).toBeDefined();

      const labelInput = screen.getByPlaceholderText(/Ex: Faixa de Temperatura/i);
      fireEvent.change(labelInput, { target: { value: 'Estabilidade de Bloco' } });

      const aliasInput = screen.getByPlaceholderText(/Novo sinônimo/i);
      fireEvent.change(aliasInput, { target: { value: 'deriva' } });
      const addBtn = screen.getByRole('button', { name: /Adicionar/i });
      fireEvent.click(addBtn);

      const saveBtn = screen.getByRole('button', { name: /Salvar Identidade/i });
      fireEvent.click(saveBtn);

      expect(onSave).toHaveBeenCalledWith({
        canonicalKey: 'metrology.temperature.stability',
        displayLabel: 'Estabilidade de Bloco',
        aliases: ['estabilidade', 'deriva'],
        description: undefined
      });
    });
  });

  describe('MegaWorkspaceShell Component', () => {
    const sampleProjection: WorkspaceProjection = {
      productId: 'TA-25N',
      title: 'Ficha Técnica Inteligente — TA-25N',
      mode: 'simple',
      summaryFacts: [
        {
          datumId: 'd-1',
          canonicalSemanticKey: 'metrology.temp.range',
          displayLabel: 'Faixa',
          aliases: [],
          formattedValue: '-25 a 140 °C',
          rawTypedValue: { type: 'range', lower: -25, upper: 140, unit: '°C' },
          origin: 'product_local',
          status: 'verified',
          hasConflict: false,
          sourcesCount: 1,
          isOverride: false
        }
      ],
      sections: [
        {
          id: 'sec-resumo',
          title: 'Resumo Executivo',
          order: 0,
          collapsed: false,
          blocks: [
            {
              id: 'b-1',
              kind: 'fact_grid',
              title: 'Destaques',
              columns: 3,
              items: [
                {
                  datumId: 'd-1',
                  canonicalSemanticKey: 'metrology.temp.range',
                  displayLabel: 'Faixa',
                  aliases: [],
                  formattedValue: '-25 a 140 °C',
                  rawTypedValue: { type: 'range', lower: -25, upper: 140, unit: '°C' },
                  origin: 'product_local',
                  status: 'verified',
                  hasConflict: false,
                  sourcesCount: 1,
                  isOverride: false
                }
              ]
            }
          ]
        }
      ],
      stats: {
        totalDatums: 1,
        localDatums: 1,
        inheritedDatums: 0,
        overrides: 0,
        conflicts: 0,
        tablesCount: 0,
        sourcesCount: 1
      }
    };

    it('renderiza o shell completo com alternância entre Modo Simples e Modo Avançado', () => {
      const onSelectTrace = vi.fn();
      const onSelectSemantics = vi.fn();
      const onSaveDescriptor = vi.fn();

      render(
        <MegaWorkspaceShell
          projection={sampleProjection}
          activeTrace={null}
          selectedDescriptor={null}
          aiEnvelope={null}
          onSelectTrace={onSelectTrace}
          onSelectSemantics={onSelectSemantics}
          onSaveDescriptor={onSaveDescriptor}
        />
      );

      expect(screen.getByText('Ficha Técnica Inteligente — TA-25N')).toBeDefined();
      expect(screen.getByText('1 especificações')).toBeDefined();
      expect(screen.getByText('Destaques Principais')).toBeDefined();

      // No modo normal (simples) não mostra jargão de chave canônica
      expect(screen.queryByText('metrology.temp.range')).toBeNull();

      // Alterna para Avançado
      const advBtn = screen.getByRole('button', { name: 'Avançado' });
      fireEvent.click(advBtn);

      // Agora a chave canônica fica visível para engenharia/auditoria
      expect(screen.getByText('metrology.temp.range')).toBeDefined();
    });
  });
});

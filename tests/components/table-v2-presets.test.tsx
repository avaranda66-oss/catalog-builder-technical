import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TechnicalTable } from '../../src/components/technical-table/TechnicalTable';
import { CustomTableBlock } from '../../src/components/editor/blocks/CustomTableBlock';
import {
  TABLE_SEMANTIC_PRESET_CONFIGS,
  buildTableBlockFromPreset,
  getTechnicalTablePresetConfig
} from '../../src/domain/technical-table-presets';
import { TABLE_VISUAL_FAMILIES } from '../../src/components/technical-table/table-tokens';
import { ContentBlock, CatalogTableRow } from '../../src/domain/catalog.schema';

describe('Table V2 Matrix (R2-T1 to R2-T12)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // R2-T1: technical_spec preset renders
  it('R2-T1: technical_spec preset renders with correct columns and styling', () => {
    const block = buildTableBlockFromPreset('test-ts', 'technical_spec', [
      { id: 'r1', localOverrides: { parameter: 'Faixa de Operação', value: '-25 °C to +155 °C', condition: 'Ambiente: 23 °C' }, order: 0 }
    ]);

    render(
      <TechnicalTable
        family={block.customData?.tableFamily}
        columns={block.tableColumns!}
        rows={block.tableRows!}
        isEditable={false}
      />
    );

    expect(screen.getByText('Parâmetro / Especificação')).toBeDefined();
    expect(screen.getByText('Valor / Tolerância Metrológica')).toBeDefined();
    expect(screen.getByText('Condição de Ensaio / Nota')).toBeDefined();
    expect(screen.getByText('Faixa de Operação')).toBeDefined();
    expect(screen.getByText('-25 °C to +155 °C')).toBeDefined();
  });

  // R2-T2: measurement_spec preset renders
  it('R2-T2: measurement_spec preset renders with function and accuracy columns', () => {
    const block = buildTableBlockFromPreset('test-ms', 'measurement_spec', [
      { id: 'm1', localOverrides: { function: 'Pt-100', range: 'A COMPLETAR', accuracy: '± 0.1 °C', config: '2, 3 e 4 fios' }, order: 0 }
    ]);

    render(
      <TechnicalTable
        family={block.customData?.tableFamily}
        columns={block.tableColumns!}
        rows={block.tableRows!}
        isEditable={false}
      />
    );

    expect(screen.getByText('Função / Sinal')).toBeDefined();
    expect(screen.getByText('Exatidão')).toBeDefined();
    expect(screen.getByText('Pt-100')).toBeDefined();
    expect(screen.getByText('± 0.1 °C')).toBeDefined();
  });

  // R2-T3: markers and legends preserved
  it('R2-T3: markers and legends preserved (●, ○, ■, etc.)', () => {
    const block = buildTableBlockFromPreset('test-conn', 'connectivity_spec', [
      { id: 'c1', localOverrides: { interface: 'Porta USB Host', availability: '●', function: 'Exportação de relatórios' }, order: 0 },
      { id: 'c2', localOverrides: { interface: 'Protocolo HART', availability: '○', function: 'Comunicação opcional' }, order: 1 }
    ]);

    const { container } = render(
      <TechnicalTable
        family={block.customData?.tableFamily}
        columns={block.tableColumns!}
        rows={block.tableRows!}
        legendConfig={block.customData?.legendConfig}
        isEditable={false}
      />
    );

    expect(screen.getByText('Porta USB Host')).toBeDefined();
    // Marcadores SVG renderizados
    const markers = container.querySelectorAll('svg');
    expect(markers.length).toBeGreaterThan(0);
  });

  // R2-T4: section rows render correctly
  it('R2-T4: section rows render spanning all columns with proper section styling', () => {
    const columns = [
      { key: 'col1', label: 'Coluna 1', visible: true },
      { key: 'col2', label: 'Coluna 2', visible: true }
    ];
    const rows: CatalogTableRow[] = [
      { id: 's1', kind: 'section', localOverrides: { col1: 'DESEMPENHO TÉRMICO' }, order: 0 },
      { id: 'd1', kind: 'data', localOverrides: { col1: 'Estabilidade', col2: '± 0.02 °C' }, order: 1 }
    ];

    render(
      <TechnicalTable
        family="precision_blue"
        columns={columns}
        rows={rows}
        isEditable={false}
      />
    );

    const sectionCell = screen.getByText('DESEMPENHO TÉRMICO');
    expect(sectionCell).toBeDefined();
    const td = sectionCell.closest('td');
    expect(td?.getAttribute('colspan')).toBe('2');
  });

  // R2-T5: multiline values preserved
  it('R2-T5: multiline values preserved with line breaks intact', () => {
    const multilineText = 'Linha 1\nLinha 2\nLinha 3';
    const rows: CatalogTableRow[] = [
      { id: 'r1', localOverrides: { param: 'Multilinha', val: multilineText }, order: 0 }
    ];

    const { container } = render(
      <TechnicalTable
        family="precision_blue"
        columns={[
          { key: 'param', label: 'Parâmetro', visible: true },
          { key: 'val', label: 'Valor', visible: true }
        ]}
        rows={rows}
        isEditable={false}
      />
    );

    const spans = container.querySelectorAll('.whitespace-pre-line');
    const valSpan = Array.from(spans).find(s => s.textContent?.includes('Linha 1'));
    expect(valSpan).toBeDefined();
    expect(valSpan?.textContent).toBe('Linha 1\nLinha 2\nLinha 3');
  });

  // R2-T6: dense mode does not remove source text
  it('R2-T6: dense mode (compact) renders full text without truncation', () => {
    const textLong = 'Verificação metrológica completa de 6 páginas em conformidade EURAMET';
    const rows: CatalogTableRow[] = [
      { id: 'r1', localOverrides: { col: textLong }, order: 0 }
    ];

    render(
      <TechnicalTable
        family="precision_blue"
        density="compact"
        columns={[{ key: 'col', label: 'Descrição', visible: true }]}
        rows={rows}
        isEditable={false}
      />
    );

    expect(screen.getByText(textLong)).toBeDefined();
  });

  // R2-T7: A COMPLETAR editable
  it('R2-T7: "A COMPLETAR" cells are editable table cells in editor mode', () => {
    const onUpdateCell = vi.fn();
    const rows: CatalogTableRow[] = [
      { id: 'r1', localOverrides: { ip: 'A COMPLETAR' }, order: 0 }
    ];

    render(
      <TechnicalTable
        family="precision_blue"
        columns={[{ key: 'ip', label: 'Grau IP', visible: true }]}
        rows={rows}
        isEditable={true}
        onUpdateCell={onUpdateCell}
      />
    );

    const cellSpan = screen.getByText('A COMPLETAR');
    expect(cellSpan).toBeDefined();
    expect(cellSpan.getAttribute('contenteditable')).toBe('true');

    // Desfocar simulando edição de texto
    cellSpan.textContent = 'IP65';
    fireEvent.blur(cellSpan);
    expect(onUpdateCell).toHaveBeenCalledWith('r1', 'ip', 'IP65');
  });

  // R2-T8: export has no editor controls
  it('R2-T8: export mode (isExport=true) does not render add column, add row, or delete controls', () => {
    const block: ContentBlock = {
      id: 'blk-custom-table',
      type: 'custom_table',
      title: 'Tabela de Teste',
      tableColumns: [{ key: 'c1', label: 'C1', visible: true }],
      tableRows: [{ id: 'r1', localOverrides: { c1: 'Valor 1' }, order: 0 }]
    };

    const { container } = render(
      <CustomTableBlock
        block={block}
        pageId="p1"
        isExport={true}
      />
    );

    // Sem botões de adicionar coluna/linha ou lixeira
    expect(container.querySelector('button')).toBeNull();
    expect(screen.queryByText('+ Coluna')).toBeNull();
    expect(screen.queryByText('+ Inserir Linha')).toBeNull();
  });

  // R2-T9: existing CustomTable edit behavior remains
  it('R2-T9: CustomTableBlock maintains normal edit actions when selected in editor mode', () => {
    const block: ContentBlock = {
      id: 'blk-custom-table-edit',
      type: 'custom_table',
      title: 'Tabela Editável',
      tableColumns: [{ key: 'c1', label: 'C1', visible: true }],
      tableRows: [{ id: 'r1', localOverrides: { c1: 'Valor 1' }, order: 0 }]
    };

    render(
      <CustomTableBlock
        block={block}
        pageId="p1"
        isSelected={true}
        isExport={false}
      />
    );

    expect(screen.getByText('+ Coluna')).toBeDefined();
    expect(screen.getByText('+ Inserir Linha')).toBeDefined();
  });

  // R2-T10: existing specialized table export behavior remains
  it('R2-T10: clean export rendering preserves standard table layout', () => {
    const block = buildTableBlockFromPreset('std-deliv', 'standard_delivery', [
      { id: 's1', localOverrides: { item: 'Cabo de Força', qty: '01 un.', included: '■' }, order: 0 }
    ]);

    const { container } = render(
      <TechnicalTable
        family={block.customData?.tableFamily}
        columns={block.tableColumns!}
        rows={block.tableRows!}
        isEditable={false}
      />
    );

    expect(container.querySelector('table')).not.toBeNull();
    expect(screen.getByText('Cabo de Força')).toBeDefined();
    expect(screen.getByText('01 un.')).toBeDefined();
  });

  // R2-T11: precision_blue remains compatible
  it('R2-T11: precision_blue visual family tokens match required design system', () => {
    const precisionBlue = TABLE_VISUAL_FAMILIES.precision_blue;
    expect(precisionBlue).toBeDefined();
    expect(precisionBlue.headerBg).toBe('bg-[#003366]');
    expect(precisionBlue.headerTextColor).toBe('text-white');
    expect(precisionBlue.accentColor).toBe('#003366');
    expect(precisionBlue.sectionBg).toContain('bg-blue-100/80');
  });

  // R2-T12: no table engine duplication
  it('R2-T12: all 11 semantic table presets exist under canonical TableSemanticPresetId', () => {
    const expectedPresets = [
      'quick_spec',
      'technical_spec',
      'measurement_spec',
      'capability_matrix',
      'feature_table',
      'connectivity_spec',
      'insert_matrix',
      'standard_delivery',
      'accessories',
      'ordering_information',
      'technical_notes'
    ];

    expect(Object.keys(TABLE_SEMANTIC_PRESET_CONFIGS)).toHaveLength(11);
    for (const presetId of expectedPresets) {
      const cfg = getTechnicalTablePresetConfig(presetId as any);
      expect(cfg).toBeDefined();
      expect(cfg.presetId).toBe(presetId);
      expect(cfg.columns.length).toBeGreaterThan(0);
    }
  });
});

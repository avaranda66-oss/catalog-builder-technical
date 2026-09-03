// tests/components/editor/table-core-renderer.test.tsx
// Suíte de Testes do Renderizador Canônico Compartilhado TableCoreRenderer (Fase CORE.T2A).
// Valida formatação pura, physical layout em mm, omissão de células mescladas, bindings e modo export limpo.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TableCoreRenderer, collectTableRenderDiagnostics } from '../../../src/components/editor/table-core';
import {
  createTable,
  setCellContent,
  mergeCells,
  setTableWidth,
  applyTablePreset,
  adaptLegacyBlockToTableCore
} from '../../../src/domain/table-core';
import { ContentBlock } from '../../../src/domain/catalog.schema';

describe('TableCoreRenderer (CORE.T2A)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  const renderComponent = (element: React.ReactElement) => {
    act(() => {
      root?.render(element);
    });
  };

  it('RENDER-TEXT-1: Renderiza célula textual pura', () => {
    let table = createTable({
      columns: [{ semanticKey: 'desc', defaultLabel: 'Descrição', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });
    table = setCellContent(table, table.rows[0].id, table.columns[0].id, {
      kind: 'text',
      text: 'Calibrador de Pressão Digital'
    });

    renderComponent(<TableCoreRenderer table={table} mode="editor" />);

    expect(container.textContent).toContain('Calibrador de Pressão Digital');
    expect(container.textContent).toContain('Descrição');
  });

  it('RENDER-NUMBER-1: Renderiza célula numérica com precisão de decimais, prefixo e sufixo', () => {
    let table = createTable({
      columns: [{ semanticKey: 'pressure', defaultLabel: 'Pressão', widthSpec: { mode: 'auto' }, align: 'right' }],
      rowsCount: 1
    });
    table = setCellContent(table, table.rows[0].id, table.columns[0].id, {
      kind: 'number',
      value: 12.3456,
      format: {
        decimals: 2,
        prefix: 'P = ',
        suffix: ' bar'
      }
    });

    renderComponent(<TableCoreRenderer table={table} mode="editor" />);

    expect(container.textContent).toContain('P = 12.35 bar');
  });

  it('RENDER-VALUE-UNIT-1: Renderiza grandeza física com qualificador, valor e unidade sem concatenação permanente', () => {
    let table = createTable({
      columns: [{ semanticKey: 'accuracy', defaultLabel: 'Exatidão', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });
    table = setCellContent(table, table.rows[0].id, table.columns[0].id, {
      kind: 'value_unit',
      amount: 0.025,
      unit: '% FE',
      qualifier: '±'
    });

    renderComponent(<TableCoreRenderer table={table} mode="editor" />);

    expect(container.textContent).toContain('± 0.025 % FE');
  });

  it('RENDER-BADGE-1: Renderiza badge com variantes semânticas e classes de cor adequadas', () => {
    let table = createTable({
      columns: [{ semanticKey: 'status', defaultLabel: 'Status', widthSpec: { mode: 'auto' }, align: 'center' }],
      rowsCount: 1
    });
    table = setCellContent(table, table.rows[0].id, table.columns[0].id, {
      kind: 'badge',
      label: 'Aprovado',
      variant: 'success'
    });

    renderComponent(<TableCoreRenderer table={table} mode="editor" />);

    const badge = container.querySelector('span.border-emerald-200');
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe('Aprovado');
  });

  it('RENDER-ASSET-1: Renderiza imagem referenciada quando resolvida pelo resolver', () => {
    let table = createTable({
      columns: [{ semanticKey: 'photo', defaultLabel: 'Foto', widthSpec: { mode: 'auto' }, align: 'center' }],
      rowsCount: 1
    });
    table = setCellContent(table, table.rows[0].id, table.columns[0].id, {
      kind: 'asset_reference',
      assetId: 'asset-img-ta25n',
      altText: 'Transmissor TA-25N',
      targetWidthMm: 40
    });

    const resolveAsset = (id: string) => {
      if (id === 'asset-img-ta25n') {
        return { url: 'https://cdn.example.com/ta25n.png', altText: 'TA-25N Oficial' };
      }
      return undefined;
    };

    renderComponent(<TableCoreRenderer table={table} mode="editor" resolveAsset={resolveAsset} />);

    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/ta25n.png');
    expect(img?.getAttribute('alt')).toBe('Transmissor TA-25N');
    expect(img?.style.maxWidth).toBe('40mm');
  });

  it('RENDER-ASSET-MISSING-1: Mídia não resolvida NUNCA renderiza tag <img> quebrada', () => {
    let table = createTable({
      columns: [{ semanticKey: 'diagram', defaultLabel: 'Esquema', widthSpec: { mode: 'auto' }, align: 'center' }],
      rowsCount: 1
    });
    table = setCellContent(table, table.rows[0].id, table.columns[0].id, {
      kind: 'asset_reference',
      assetId: 'asset-inexistente-999'
    });

    renderComponent(<TableCoreRenderer table={table} mode="editor" resolveAsset={() => undefined} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('[Mídia: asset-inexistente-999]');

    // No modo export, nem mesmo o texto de placeholder deve poluir o documento
    renderComponent(<TableCoreRenderer table={table} mode="export" resolveAsset={() => undefined} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).not.toContain('[Mídia:');
  });

  it('RENDER-DATUM-SNAPSHOT-1: Renderiza valor materializado quando bindingMode for snapshot', () => {
    let table = createTable({
      columns: [{ semanticKey: 'hart', defaultLabel: 'Protocolo', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });
    table = setCellContent(table, table.rows[0].id, table.columns[0].id, {
      kind: 'datum_reference',
      productId: 'prod-hart-1',
      datumKey: 'comm.protocol',
      bindingMode: 'snapshot',
      snapshot: {
        kind: 'text',
        text: 'HART v7.0'
      }
    });

    renderComponent(<TableCoreRenderer table={table} mode="editor" />);

    expect(container.textContent).toContain('HART v7.0');
  });

  it('RENDER-DATUM-LIVE-1: Renderiza valor obtido do resolver externo em modo live', () => {
    let table = createTable({
      columns: [{ semanticKey: 'temp', defaultLabel: 'Temperatura', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });
    table = setCellContent(table, table.rows[0].id, table.columns[0].id, {
      kind: 'datum_reference',
      productId: 'prod-temp-1',
      datumKey: 'metrology.temperature.max',
      bindingMode: 'live'
    });

    const resolveDatum = () => ({
      value: { kind: 'value_unit' as const, amount: 650, unit: '°C' },
      status: 'approved' as const
    });

    renderComponent(<TableCoreRenderer table={table} mode="editor" resolveDatum={resolveDatum} />);

    expect(container.textContent).toContain('650 °C');
  });

  it('RENDER-DATUM-UNRESOLVED-1: Dado não resolvido exibe indicador no editor e falha de forma segura no export', () => {
    let table = createTable({
      columns: [{ semanticKey: 'supply', defaultLabel: 'Alimentação', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });
    table = setCellContent(table, table.rows[0].id, table.columns[0].id, {
      kind: 'datum_reference',
      productId: 'prod-elec-1',
      datumKey: 'electrical.supply.voltage',
      bindingMode: 'live'
    });

    // Editor: exibe indicador pendente
    renderComponent(<TableCoreRenderer table={table} mode="editor" resolveDatum={() => undefined} />);
    expect(container.textContent).toContain('[Pendente: electrical.supply.voltage]');

    // Export: não exibe texto de debug nem quebra
    renderComponent(<TableCoreRenderer table={table} mode="export" resolveDatum={() => undefined} />);
    expect(container.textContent).not.toContain('[Pendente:');
  });

  it('RENDER-MERGE-1: Células cobertas por mesclagem são estritamente OMITIDAS do DOM (Zero <td> duplicado)', () => {
    let table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'Col 1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'Col 2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    const r0 = table.rows[0].id;
    const c0 = table.columns[0].id;
    table = setCellContent(table, r0, c0, { kind: 'text', text: 'Cabeçalho Mesclado' });
    table = mergeCells(table, r0, c0, 2, 1);

    renderComponent(<TableCoreRenderer table={table} mode="editor" />);

    // Na primeira linha, deve haver apenas 1 <td> (a âncora com colSpan=2)
    const tbody = container.querySelector('tbody');
    const firstTr = tbody?.querySelectorAll('tr')[0];
    const cellsInFirstRow = firstTr?.querySelectorAll('td');

    expect(cellsInFirstRow?.length).toBe(1);
    expect(cellsInFirstRow?.[0].getAttribute('colspan')).toBe('2');
    expect(cellsInFirstRow?.[0].textContent).toContain('Cabeçalho Mesclado');
  });

  it('RENDER-WIDTH-MM-1: Larguras físicas das colunas e da tabela são renderizadas com autoridade em mm', () => {
    let table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'fixed_mm', widthMm: 45 }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'fixed_mm', widthMm: 65 }, align: 'left' }
      ],
      rowsCount: 1
    });
    table = setTableWidth(table, { mode: 'fixed_mm', widthMm: 110 });

    renderComponent(<TableCoreRenderer table={table} mode="editor" />);

    const tableDiv = container.querySelector('div[data-table-mode="editor"]') as HTMLDivElement;
    expect(tableDiv?.style.width).toBe('110mm');

    const cols = container.querySelectorAll('colgroup col');
    expect((cols[0] as HTMLElement).style.width).toBe('45mm');
    expect((cols[1] as HTMLElement).style.width).toBe('65mm');
  });

  it('RENDER-PRESET-1: Presets canônicos aplicam tokens tipados de cabeçalho e borda', () => {
    let table = createTable({
      columns: [{ semanticKey: 'k', defaultLabel: 'Parâmetro', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });
    table = applyTablePreset(table, 'parameter_value');

    renderComponent(<TableCoreRenderer table={table} mode="editor" />);

    const theadRow = container.querySelector('thead tr');
    // preset parameter_value usa slate_100 para fundo de cabeçalho
    expect(theadRow?.className).toContain('bg-slate-100');
  });

  it('RENDER-EDITOR-EXPORT-PARITY-1: Modos editor e export renderizam a mesma estrutura útil de conteúdo', () => {
    let table = createTable({
      columns: [
        { semanticKey: 'code', defaultLabel: 'Código', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'range', defaultLabel: 'Faixa', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 1
    });
    table = setCellContent(table, table.rows[0].id, table.columns[0].id, { kind: 'text', text: 'TA-25N' });
    table = setCellContent(table, table.rows[0].id, table.columns[1].id, { kind: 'text', text: '-25 a 140 °C' });

    renderComponent(<TableCoreRenderer table={table} mode="editor" />);
    const editorTexts = Array.from(container.querySelectorAll('tbody td')).map((td) => td.textContent);

    renderComponent(<TableCoreRenderer table={table} mode="export" />);
    const exportTexts = Array.from(container.querySelectorAll('tbody td')).map((td) => td.textContent);

    expect(editorTexts).toEqual(exportTexts);
    expect(editorTexts).toEqual(['TA-25N', '-25 a 140 °C']);
  });

  it('RENDER-EXPORT-CHROME-1: Modo export não renderiza controles do editor, seleção ou atributos interativos', () => {
    const table = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const targetCellId = Object.values(table.cells)[0].id;
    renderComponent(
      <TableCoreRenderer
        table={table}
        mode="export"
        selectedCellId={targetCellId}
      />
    );

    // No export mode, o contorno de seleção 'outline-blue-500' NÃO deve estar presente
    expect(container.querySelector('.outline-blue-500')).toBeNull();
    // Não deve conter atributos data-cell-id no modo export
    expect(container.querySelector('[data-cell-id]')).toBeNull();
  });

  it('RENDER-EMPTY-1: Células vazias não inventam dados nem textos fantasmas', () => {
    const table = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'Vazio', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    renderComponent(<TableCoreRenderer table={table} mode="export" />);

    const td = container.querySelector('tbody td');
    expect(td?.textContent).toBe('');
  });

  it('RENDER-LEGACY-ADAPTER-1: Bloco specs_table adaptado renderiza com identidades estáveis e fidelidade', () => {
    const legacyBlock: ContentBlock = {
      id: 'blk_specs_render',
      type: 'specs_table',
      title: 'Especificações Termometria',
      tableColumns: [
        { key: 'faixa', label: 'Faixa de Operação', visible: true, width: 120 },
        { key: 'resolucao', label: 'Resolução', visible: true, width: 90 }
      ],
      tableRows: [
        { id: 'r1', localOverrides: { faixa: '0 a 500 °C', resolucao: '0.01 °C' } }
      ]
    };

    const adaptRes = adaptLegacyBlockToTableCore(legacyBlock);
    expect(adaptRes.supported).toBe(true);

    if (adaptRes.supported) {
      renderComponent(<TableCoreRenderer table={adaptRes.table} mode="editor" />);

      expect(container.textContent).toContain('Faixa de Operação');
      expect(container.textContent).toContain('Resolução');
      expect(container.textContent).toContain('0 a 500 °C');
      expect(container.textContent).toContain('0.01 °C');
    }
  });

  it('RENDER-CLEAN-A4-PARITY-1: Fundamento de paridade com CleanA4Document (largura útil e estrutura)', () => {
    let table = createTable({
      columns: [
        { semanticKey: 'p', defaultLabel: 'Parâmetro', widthSpec: { mode: 'weighted', weight: 2 }, align: 'left' },
        { semanticKey: 'v', defaultLabel: 'Valor', widthSpec: { mode: 'weighted', weight: 1 }, align: 'right' }
      ],
      rowsCount: 2
    });

    renderComponent(<TableCoreRenderer table={table} mode="export" />);

    const tableEl = container.querySelector('table');
    expect(tableEl).toBeTruthy();
    expect(tableEl?.getAttribute('role')).toBe('table');
    expect(container.querySelectorAll('colgroup col')).toHaveLength(2);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('RENDER-DATUM-REVIEW-NOSNAPSHOT: review_required sem snapshot exibe aviso no editor e gera diagnóstico rastreável', () => {
    let table = createTable({
      columns: [{ semanticKey: 'rev', defaultLabel: 'Revisão', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });
    table = setCellContent(table, table.rows[0].id, table.columns[0].id, {
      kind: 'datum_reference',
      productId: 'p1',
      datumKey: 'electrical.power',
      bindingMode: 'review_required'
    });

    const diagnostics = collectTableRenderDiagnostics(table);
    expect(diagnostics.some((d) => d.code === 'REVIEW_REQUIRED_WITHOUT_SNAPSHOT')).toBe(true);

    // Editor: exibe indicador explícito de pendência
    renderComponent(<TableCoreRenderer table={table} mode="editor" />);
    expect(container.textContent).toContain('[Revisão pendente: electrical.power]');

    // Export: não gera dado falso nem crasha
    renderComponent(<TableCoreRenderer table={table} mode="export" />);
    expect(container.textContent).not.toContain('[Revisão pendente:');
  });

  it('RENDER-GEOMETRY-INVALID: Geometria inválida exibe aviso no editor e não quebra exportação', () => {
    let table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'fixed_mm', widthMm: 150 }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'fixed_mm', widthMm: 150 }, align: 'left' }
      ],
      rowsCount: 1
    });
    // 300mm excede a largura do A4 (182mm útil)
    table = setTableWidth(table, { mode: 'fixed_mm', widthMm: 300 });

    const diagnostics = collectTableRenderDiagnostics(table);
    expect(diagnostics.some((d) => d.code === 'INVALID_GEOMETRY')).toBe(true);

    // Editor: alerta visual renderizado
    renderComponent(<TableCoreRenderer table={table} mode="editor" />);
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('Aviso de Geometria:');

    // Export: não crasha, renderiza a tabela com fail-safe
    renderComponent(<TableCoreRenderer table={table} mode="export" />);
    const tableEl = container.querySelector('table');
    expect(tableEl).toBeTruthy();
  });

  it('RENDER-DIVIDER: Linha com kind="divider" é renderizada como separador estrutural explícito', () => {
    let table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    // Transforma a segunda linha em divisor
    table.rows[1].kind = 'divider';
    table = setCellContent(table, table.rows[1].id, table.columns[0].id, {
      kind: 'text',
      text: 'Seção Suplementar'
    });

    renderComponent(<TableCoreRenderer table={table} mode="editor" />);

    const dividerRow = container.querySelector('tr[data-row-kind="divider"]');
    expect(dividerRow).toBeTruthy();
    expect(dividerRow?.getAttribute('role')).toBe('separator');

    const td = dividerRow?.querySelector('td');
    expect(td?.getAttribute('colspan')).toBe('2');
    expect(td?.textContent).toContain('Seção Suplementar');
  });

  it('RENDER-CONTENT-EXHAUSTIVE: Todos os tipos discriminados de TableCellContent são renderizados exaustivamente', () => {
    let table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c3', defaultLabel: 'C3', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c4', defaultLabel: 'C4', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c5', defaultLabel: 'C5', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    const r0 = table.rows[0].id;
    const r1 = table.rows[1].id;

    table = setCellContent(table, r0, table.columns[0].id, { kind: 'empty' });
    table = setCellContent(table, r0, table.columns[1].id, { kind: 'text', text: 'Txt' });
    table = setCellContent(table, r0, table.columns[2].id, { kind: 'number', value: 42 });
    table = setCellContent(table, r0, table.columns[3].id, { kind: 'value_unit', amount: 5, unit: 'bar' });
    table = setCellContent(table, r0, table.columns[4].id, { kind: 'badge', label: 'OK', variant: 'success' });
    table = setCellContent(table, r1, table.columns[0].id, { kind: 'asset_reference', assetId: 'img1' });
    table = setCellContent(table, r1, table.columns[1].id, {
      kind: 'datum_reference',
      productId: 'p1',
      datumKey: 'key1',
      bindingMode: 'snapshot',
      snapshot: { kind: 'text', text: 'Snap' }
    });

    // Não deve lançar erro de runtime assertNever
    expect(() => {
      renderComponent(
        <TableCoreRenderer
          table={table}
          mode="editor"
          resolveAsset={() => ({ url: 'https://cdn.example.com/img.png' })}
        />
      );
    }).not.toThrow();

    expect(container.textContent).toContain('Txt');
    expect(container.textContent).toContain('42');
    expect(container.textContent).toContain('5 bar');
    expect(container.textContent).toContain('OK');
    expect(container.textContent).toContain('Snap');
  });

  it('RENDER-MODE-EXPLICIT: Propriedade mode é estritamente obrigatória e isola atributos interativos', () => {
    const table = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    // Em modo editor: data-cell-id e data-table-id estão presentes
    renderComponent(<TableCoreRenderer table={table} mode="editor" />);
    expect(container.querySelector('[data-table-mode="editor"]')).toBeTruthy();
    expect(container.querySelector('[data-cell-id]')).toBeTruthy();

    // Em modo export: zero atributos interativos do editor
    renderComponent(<TableCoreRenderer table={table} mode="export" />);
    expect(container.querySelector('[data-table-mode="export"]')).toBeTruthy();
    expect(container.querySelector('[data-cell-id]')).toBeNull();
  });
});

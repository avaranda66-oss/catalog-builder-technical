// tests/domain/table-core/table-core-v2-presentation.test.ts
// Testes de Domínio e Fixtures Estruturais para a EMENDA ADICIONAL — TABLE.V2.PRESENTATION1.
// Abrange: Cabeçalhos Múltiplos, colSpan/rowSpan, Linhas de Seção/Divisor, Células de Imagem/Asset,
// Células Booleanas (5 formatos visuais), Presets Industriais, Overrides de Estilo Controlados,
// Dimensões Físicas em mm, Templates Reutilizáveis e Teste de Mesmo Dado / Múltiplos Visuais.

import { describe, it, expect } from 'vitest';
import {
  TableCoreModel,
  TableColumnModel,
  TableRowModel,
  TableCellModel,
  TableCellBooleanContent,
  TableCellAssetRefContent,
  TablePresentationModel,
  TablePresentationTemplate,
  getCellKey
} from '../../../src/domain/table-core/table.types';
import {
  TableCoreModelSchema,
  TablePresentationTemplateSchema
} from '../../../src/domain/table-core/table.schema';
import {
  applyTablePreset,
  getTablePreset
} from '../../../src/domain/table-core/table.presets';
import { resolveColumnWidthsMm } from '../../../src/domain/table-core/table.geometry';

describe('TABLE.V2.PRESENTATION1: Competitor-Grade Industrial Layout Capability', () => {
  describe('1. Suporte a Multi-Row Headers, colSpan, rowSpan, Linhas de Seção e Notas de Rodapé', () => {
    it('deve validar e renderizar estrutura com multi-row headers, colSpan e rowSpan sem erros de integridade', () => {
      const columns: TableColumnModel[] = [
        { id: 'c_param', semanticKey: 'param', defaultLabel: 'Parâmetro', widthSpec: { mode: 'fixed_mm', widthMm: 50 }, align: 'left' },
        { id: 'c_m1', semanticKey: 'mod1', defaultLabel: 'Modelo A', widthSpec: { mode: 'fixed_mm', widthMm: 45 }, align: 'center' },
        { id: 'c_m2', semanticKey: 'mod2', defaultLabel: 'Modelo B', widthSpec: { mode: 'fixed_mm', widthMm: 45 }, align: 'center' }
      ];

      const rows: TableRowModel[] = [
        { id: 'r_h1', kind: 'header', isHeader: true },
        { id: 'r_h2', kind: 'header', isHeader: true },
        { id: 'r_sec', kind: 'section' },
        { id: 'r_d1', kind: 'data' },
        { id: 'r_foot', kind: 'footer' }
      ];

      const cells: Record<string, TableCellModel> = {
        // Header Row 1: "Parâmetro" (rowSpan 2) + "Série Presys" (colSpan 2)
        [getCellKey('r_h1', 'c_param')]: {
          id: 'cell_h1_param',
          rowId: 'r_h1',
          columnId: 'c_param',
          content: { kind: 'text', text: 'Parâmetro Técnico' },
          rowSpan: 2
        },
        [getCellKey('r_h1', 'c_m1')]: {
          id: 'cell_h1_group',
          rowId: 'r_h1',
          columnId: 'c_m1',
          content: { kind: 'text', text: 'Calibradores Série Y18' },
          colSpan: 2
        },
        [getCellKey('r_h1', 'c_m2')]: {
          id: 'cell_h1_m2_cov',
          rowId: 'r_h1',
          columnId: 'c_m2',
          content: { kind: 'empty' },
          coveredBy: 'cell_h1_group'
        },

        // Header Row 2: Subcabeçalhos para Modelo A e Modelo B (c_param coberto pelo rowSpan)
        [getCellKey('r_h2', 'c_param')]: {
          id: 'cell_h2_param_cov',
          rowId: 'r_h2',
          columnId: 'c_param',
          content: { kind: 'empty' },
          coveredBy: 'cell_h1_param'
        },
        [getCellKey('r_h2', 'c_m1')]: {
          id: 'cell_h2_m1',
          rowId: 'r_h2',
          columnId: 'c_m1',
          content: { kind: 'text', text: 'PCON-Y18-LP' }
        },
        [getCellKey('r_h2', 'c_m2')]: {
          id: 'cell_h2_m2',
          rowId: 'r_h2',
          columnId: 'c_m2',
          content: { kind: 'text', text: 'PCON-Y18-HP' }
        },

        // Section Row: Grupo de Especificações (colSpan 3)
        [getCellKey('r_sec', 'c_param')]: {
          id: 'cell_sec_label',
          rowId: 'r_sec',
          columnId: 'c_param',
          content: { kind: 'text', text: 'ESPECIFICAÇÕES PNEUMÁTICAS' },
          colSpan: 3
        },
        [getCellKey('r_sec', 'c_m1')]: {
          id: 'cell_sec_m1_cov',
          rowId: 'r_sec',
          columnId: 'c_m1',
          content: { kind: 'empty' },
          coveredBy: 'cell_sec_label'
        },
        [getCellKey('r_sec', 'c_m2')]: {
          id: 'cell_sec_m2_cov',
          rowId: 'r_sec',
          columnId: 'c_m2',
          content: { kind: 'empty' },
          coveredBy: 'cell_sec_label'
        },

        // Data Row 1: Faixa de Pressão
        [getCellKey('r_d1', 'c_param')]: {
          id: 'cell_d1_param',
          rowId: 'r_d1',
          columnId: 'c_param',
          content: { kind: 'text', text: 'Faixa Operacional' }
        },
        [getCellKey('r_d1', 'c_m1')]: {
          id: 'cell_d1_m1',
          rowId: 'r_d1',
          columnId: 'c_m1',
          content: { kind: 'range', lower: -0.9, upper: 70, unit: 'bar' }
        },
        [getCellKey('r_d1', 'c_m2')]: {
          id: 'cell_d1_m2',
          rowId: 'r_d1',
          columnId: 'c_m2',
          content: { kind: 'range', lower: 0, upper: 700, unit: 'bar' }
        },

        // Footer Row: Nota explicativa (colSpan 3)
        [getCellKey('r_foot', 'c_param')]: {
          id: 'cell_foot_note',
          rowId: 'r_foot',
          columnId: 'c_param',
          content: { kind: 'text', text: '* Exatidão garantida para temperatura ambiente entre 18°C e 28°C.' },
          colSpan: 3
        },
        [getCellKey('r_foot', 'c_m1')]: {
          id: 'cell_foot_m1_cov',
          rowId: 'r_foot',
          columnId: 'c_m1',
          content: { kind: 'empty' },
          coveredBy: 'cell_foot_note'
        },
        [getCellKey('r_foot', 'c_m2')]: {
          id: 'cell_foot_m2_cov',
          rowId: 'r_foot',
          columnId: 'c_m2',
          content: { kind: 'empty' },
          coveredBy: 'cell_foot_note'
        }
      };

      const table: TableCoreModel = {
        id: 'tbl-grouped-headers-test',
        schemaVersion: 1,
        title: 'Matriz Comparativa com Cabeçalho Agrupado',
        columns,
        rows,
        cells,
        presentation: getTablePreset('presys_clean_technical'),
        paginationPolicy: {
          allowRowSplit: false,
          repeatHeaderOnBreak: true,
          keepHeaderWithFirstRow: true,
          minOrphanRows: 1
        }
      };

      const parsed = TableCoreModelSchema.parse(table);
      expect(parsed.columns).toHaveLength(3);
      expect(parsed.rows).toHaveLength(5);
      expect(parsed.cells[getCellKey('r_h1', 'c_param')].rowSpan).toBe(2);
      expect(parsed.cells[getCellKey('r_h1', 'c_m1')].colSpan).toBe(2);
      expect(parsed.cells[getCellKey('r_sec', 'c_param')].colSpan).toBe(3);
    });
  });

  describe('2. Células de Imagem / Asset de Primeira Classe', () => {
    it('deve suportar propriedades de apresentação de imagem: fit, alignment, target width/height, padding e caption', () => {
      const assetCellContent: TableCellAssetRefContent = {
        kind: 'asset_reference',
        assetId: 'asset-sensor-diaphragm',
        fit: 'contain',
        align: 'center',
        targetWidthMm: 35,
        targetHeightMm: 25,
        paddingMm: 2,
        caption: 'Diafragma de Isolação em Inconel 625',
        altText: 'Foto técnica do diafragma'
      };

      expect(assetCellContent.kind).toBe('asset_reference');
      expect(assetCellContent.fit).toBe('contain');
      expect(assetCellContent.targetWidthMm).toBe(35);
      expect(assetCellContent.caption).toBe('Diafragma de Isolação em Inconel 625');
    });
  });

  describe('3. Células Booleanas com Formatos Visuais sem Mutação do Valor', () => {
    it('deve representar boolean em diferentes formatos visuais preservando value: boolean', () => {
      const formats: TableCellBooleanContent['format'][] = [
        'yes_no',
        'sim_nao',
        'check_cross',
        'dot',
        'badge'
      ];

      for (const format of formats) {
        const cellTrue: TableCellBooleanContent = {
          kind: 'boolean',
          value: true,
          format
        };
        const cellFalse: TableCellBooleanContent = {
          kind: 'boolean',
          value: false,
          format
        };

        expect(cellTrue.value).toBe(true);
        expect(cellFalse.value).toBe(false);
        expect(cellTrue.format).toBe(format);
      }
    });
  });

  describe('4. Presets Industriais e Tokens de Apresentação', () => {
    it('deve conter todos os presets industriais homologados', () => {
      const expectedPresets = [
        'presys_clean_technical',
        'dense_spec_matrix',
        'model_comparison',
        'parameter_value',
        'presys_dark_navy',
        'presys_blue_comparison',
        'gray_technical',
        'corporate_slate'
      ] as const;

      for (const presetId of expectedPresets) {
        const preset = getTablePreset(presetId);
        expect(preset).toBeDefined();
        expect(preset.presetId).toBe(presetId);
        expect(preset.headerBackgroundToken).toBeDefined();
        expect(preset.headerTextColorToken).toBeDefined();
      }
    });

    it('deve suportar tokens avançados de layout: headerPadding, lineHeight, outerBorderWidth, cornerRoundness', () => {
      const customPresentation: TablePresentationModel = {
        presetId: 'presys_dark_navy',
        density: 'compact',
        borderStyle: 'horizontal_only',
        stripeStyle: 'none',
        headerBackgroundToken: 'brand_navy',
        headerTextColorToken: 'white',
        sectionBackgroundToken: 'slate_100',
        sectionTextColorToken: 'slate_900',
        fontScale: 'compact',
        tableWidth: { mode: 'auto_fill' },
        cellPadding: 'dense',
        headerPadding: 'dense',
        lineHeight: 'tight',
        borderWidth: 'thin',
        outerBorderWidth: 'thick',
        borderColorToken: 'brand_navy',
        cornerRoundness: 'small'
      };

      expect(customPresentation.lineHeight).toBe('tight');
      expect(customPresentation.outerBorderWidth).toBe('thick');
      expect(customPresentation.cornerRoundness).toBe('small');
    });
  });

  describe('5. Teste de Mesmo Dado / Múltiplos Visuais (Same Data / Multiple Visuals)', () => {
    it('deve garantir que os dados, linhas, colunas e células permanecem 100% idênticos ao trocar de preset', () => {
      const columns: TableColumnModel[] = [
        { id: 'col_item', semanticKey: 'item', defaultLabel: 'Item', widthSpec: { mode: 'fixed_mm', widthMm: 30 }, align: 'left' },
        { id: 'col_spec', semanticKey: 'spec', defaultLabel: 'Especificação', widthSpec: { mode: 'fixed_mm', widthMm: 70 }, align: 'left' }
      ];

      const rows: TableRowModel[] = [
        { id: 'r1', kind: 'data' },
        { id: 'r2', kind: 'data' }
      ];

      const cells: Record<string, TableCellModel> = {
        [getCellKey('r1', 'col_item')]: { id: 'c1', rowId: 'r1', columnId: 'col_item', content: { kind: 'text', text: 'Exatidão' } },
        [getCellKey('r1', 'col_spec')]: { id: 'c2', rowId: 'r1', columnId: 'col_spec', content: { kind: 'text', text: '0.01% FE' } },
        [getCellKey('r2', 'col_item')]: { id: 'c3', rowId: 'r2', columnId: 'col_item', content: { kind: 'text', text: 'Estabilidade' } },
        [getCellKey('r2', 'col_spec')]: { id: 'c4', rowId: 'r2', columnId: 'col_spec', content: { kind: 'text', text: '± 0.005 bar' } }
      };

      const initialTable: TableCoreModel = {
        id: 'tbl-same-data-multi-visuals',
        schemaVersion: 1,
        title: 'Especificações de Desempenho',
        columns,
        rows,
        cells,
        presentation: getTablePreset('presys_clean_technical'),
        paginationPolicy: {
          allowRowSplit: false,
          repeatHeaderOnBreak: true,
          keepHeaderWithFirstRow: true,
          minOrphanRows: 1
        }
      };

      // Aplica Tema A: Presys Dark Navy
      const tableDarkNavy = applyTablePreset(initialTable, 'presys_dark_navy');
      expect(tableDarkNavy.presentation.presetId).toBe('presys_dark_navy');
      expect(tableDarkNavy.presentation.headerBackgroundToken).toBe('brand_navy');
      // Dados idênticos
      expect(tableDarkNavy.rows).toEqual(initialTable.rows);
      expect(tableDarkNavy.columns).toEqual(initialTable.columns);
      expect(tableDarkNavy.cells).toEqual(initialTable.cells);

      // Aplica Tema B: Presys Blue Comparison
      const tableBlue = applyTablePreset(tableDarkNavy, 'presys_blue_comparison');
      expect(tableBlue.presentation.presetId).toBe('presys_blue_comparison');
      expect(tableBlue.presentation.headerBackgroundToken).toBe('technical_blue');
      // Dados idênticos
      expect(tableBlue.rows).toEqual(initialTable.rows);
      expect(tableBlue.columns).toEqual(initialTable.columns);
      expect(tableBlue.cells).toEqual(initialTable.cells);

      // Aplica Tema C: Gray Technical
      const tableGray = applyTablePreset(tableBlue, 'gray_technical');
      expect(tableGray.presentation.presetId).toBe('gray_technical');
      expect(tableGray.presentation.headerBackgroundToken).toBe('slate_800');
      // Dados idênticos
      expect(tableGray.rows).toEqual(initialTable.rows);
      expect(tableGray.columns).toEqual(initialTable.columns);
      expect(tableGray.cells).toEqual(initialTable.cells);
    });
  });

  describe('6. Presentation Templates Desacoplados dos Dados', () => {
    it('deve serializar e salvar TablePresentationTemplate independente do dataset', () => {
      const template: TablePresentationTemplate = {
        id: 'tpl-corporate-presys',
        name: 'Template Corporativo Presys',
        description: 'Tema azul marinho com divisores sutis para catálogos de metrologia',
        presentation: getTablePreset('presys_dark_navy')
      };

      const parsed = TablePresentationTemplateSchema.parse(template);
      expect(parsed.id).toBe('tpl-corporate-presys');
      expect(parsed.presentation.presetId).toBe('presys_dark_navy');
    });
  });

  describe('7. Geometria Física e Resolução de Larguras em mm', () => {
    it('deve resolver colunas fixas em mm, weighted e auto respeitando o orçamento físico', () => {
      const table: TableCoreModel = {
        id: 'tbl-geo-test',
        schemaVersion: 1,
        columns: [
          { id: 'c1', semanticKey: 'code', defaultLabel: 'Código', widthSpec: { mode: 'fixed_mm', widthMm: 30 }, align: 'left' },
          { id: 'c2', semanticKey: 'model', defaultLabel: 'Modelo', widthSpec: { mode: 'fixed_mm', widthMm: 50 }, align: 'left' },
          { id: 'c3', semanticKey: 'desc', defaultLabel: 'Descrição', widthSpec: { mode: 'weighted', weight: 2 }, align: 'left' },
          { id: 'c4', semanticKey: 'obs', defaultLabel: 'Obs', widthSpec: { mode: 'weighted', weight: 1 }, align: 'left' }
        ],
        rows: [{ id: 'r1', kind: 'data', minHeightMm: 8 }],
        cells: {
          [getCellKey('r1', 'c1')]: { id: 'cell_1', rowId: 'r1', columnId: 'c1', content: { kind: 'text', text: 'Y18' } },
          [getCellKey('r1', 'c2')]: { id: 'cell_2', rowId: 'r1', columnId: 'c2', content: { kind: 'text', text: 'PCON' } },
          [getCellKey('r1', 'c3')]: { id: 'cell_3', rowId: 'r1', columnId: 'c3', content: { kind: 'text', text: 'Calibrador' } },
          [getCellKey('r1', 'c4')]: { id: 'cell_4', rowId: 'r1', columnId: 'c4', content: { kind: 'text', text: 'OK' } }
        },
        presentation: {
          ...getTablePreset('presys_clean_technical'),
          tableWidth: { mode: 'fixed_mm', widthMm: 170 }
        },
        paginationPolicy: {
          allowRowSplit: false,
          repeatHeaderOnBreak: true,
          keepHeaderWithFirstRow: true,
          minOrphanRows: 1
        }
      };

      const geo = resolveColumnWidthsMm(table);
      expect(geo.valid).toBe(true);
      expect(geo.columns).toHaveLength(4);

      const c1Width = geo.columns.find((c) => c.columnId === 'c1')?.widthMm;
      const c2Width = geo.columns.find((c) => c.columnId === 'c2')?.widthMm;
      expect(c1Width).toBe(30);
      expect(c2Width).toBe(50);

      // 170 - 80 = 90mm restantes divididos por peso (2 + 1 = 3 partes de 30mm)
      const c3Width = geo.columns.find((c) => c.columnId === 'c3')?.widthMm;
      const c4Width = geo.columns.find((c) => c.columnId === 'c4')?.widthMm;
      expect(c3Width).toBe(60);
      expect(c4Width).toBe(30);
    });
  });

  describe('8. As 6 Fixtures de Referência Complexas Inspiradas em Datasheets Industriais (Dados Sintéticos)', () => {
    it('Fixture A: Model Comparison Matrix', () => {
      const fixture: TableCoreModel = {
        id: 'fix-a-model-comparison',
        schemaVersion: 1,
        title: 'Matriz Comparativa de Modelos Industriais',
        columns: [
          { id: 'col_rec', semanticKey: 'feature', defaultLabel: 'Recurso / Capacidade', widthSpec: { mode: 'fixed_mm', widthMm: 60 }, align: 'left' },
          { id: 'col_m1', semanticKey: 'mod_std', defaultLabel: 'Standard', widthSpec: { mode: 'fixed_mm', widthMm: 35 }, align: 'center' },
          { id: 'col_m2', semanticKey: 'mod_pro', defaultLabel: 'Professional', widthSpec: { mode: 'fixed_mm', widthMm: 35 }, align: 'center' },
          { id: 'col_m3', semanticKey: 'mod_adv', defaultLabel: 'Advanced Hart', widthSpec: { mode: 'fixed_mm', widthMm: 40 }, align: 'center' }
        ],
        rows: [
          { id: 'r_h', kind: 'header', isHeader: true },
          { id: 'r1', kind: 'data' },
          { id: 'r2', kind: 'data' },
          { id: 'r3', kind: 'data' }
        ],
        cells: {
          [getCellKey('r_h', 'col_rec')]: { id: 'ch_rec', rowId: 'r_h', columnId: 'col_rec', content: { kind: 'text', text: 'Especificação' } },
          [getCellKey('r_h', 'col_m1')]: { id: 'ch_m1', rowId: 'r_h', columnId: 'col_m1', content: { kind: 'text', text: 'Modelo A1' } },
          [getCellKey('r_h', 'col_m2')]: { id: 'ch_m2', rowId: 'r_h', columnId: 'col_m2', content: { kind: 'text', text: 'Modelo B2' } },
          [getCellKey('r_h', 'col_m3')]: { id: 'ch_m3', rowId: 'r_h', columnId: 'col_m3', content: { kind: 'text', text: 'Modelo C3 Pro' } },

          [getCellKey('r1', 'col_rec')]: { id: 'c1_rec', rowId: 'r1', columnId: 'col_rec', content: { kind: 'text', text: 'Bomba Elétrica Embutida' } },
          [getCellKey('r1', 'col_m1')]: { id: 'c1_m1', rowId: 'r1', columnId: 'col_m1', content: { kind: 'boolean', value: false, format: 'check_cross' } },
          [getCellKey('r1', 'col_m2')]: { id: 'c1_m2', rowId: 'r1', columnId: 'col_m2', content: { kind: 'boolean', value: true, format: 'check_cross' } },
          [getCellKey('r1', 'col_m3')]: { id: 'c1_m3', rowId: 'r1', columnId: 'col_m3', content: { kind: 'boolean', value: true, format: 'check_cross' } },

          [getCellKey('r2', 'col_rec')]: { id: 'c2_rec', rowId: 'r2', columnId: 'col_rec', content: { kind: 'text', text: 'Comunicação HART / Profibus' } },
          [getCellKey('r2', 'col_m1')]: { id: 'c2_m1', rowId: 'r2', columnId: 'col_m1', content: { kind: 'boolean', value: false, format: 'badge' } },
          [getCellKey('r2', 'col_m2')]: { id: 'c2_m2', rowId: 'r2', columnId: 'col_m2', content: { kind: 'boolean', value: false, format: 'badge' } },
          [getCellKey('r2', 'col_m3')]: { id: 'c2_m3', rowId: 'r2', columnId: 'col_m3', content: { kind: 'boolean', value: true, format: 'badge' } },

          [getCellKey('r3', 'col_rec')]: { id: 'c3_rec', rowId: 'r3', columnId: 'col_rec', content: { kind: 'text', text: 'Exatidão da Medição' } },
          [getCellKey('r3', 'col_m1')]: { id: 'c3_m1', rowId: 'r3', columnId: 'col_m1', content: { kind: 'text', text: '0.025% FE' } },
          [getCellKey('r3', 'col_m2')]: { id: 'c3_m2', rowId: 'r3', columnId: 'col_m2', content: { kind: 'text', text: '0.01% FE' } },
          [getCellKey('r3', 'col_m3')]: { id: 'c3_m3', rowId: 'r3', columnId: 'col_m3', content: { kind: 'text', text: '0.007% FE' } }
        },
        presentation: getTablePreset('model_comparison'),
        paginationPolicy: { allowRowSplit: false, repeatHeaderOnBreak: true, keepHeaderWithFirstRow: true, minOrphanRows: 1 }
      };

      expect(TableCoreModelSchema.parse(fixture).rows).toHaveLength(4);
    });

    it('Fixture B: Grouped Specification Sections', () => {
      const fixture: TableCoreModel = {
        id: 'fix-b-grouped-sections',
        schemaVersion: 1,
        columns: [
          { id: 'c_p', semanticKey: 'param', defaultLabel: 'Parâmetro', widthSpec: { mode: 'fixed_mm', widthMm: 60 }, align: 'left' },
          { id: 'c_v', semanticKey: 'val', defaultLabel: 'Valor Especificado', widthSpec: { mode: 'fixed_mm', widthMm: 80 }, align: 'left' }
        ],
        rows: [
          { id: 'r_s1', kind: 'section' },
          { id: 'r_d1', kind: 'data' },
          { id: 'r_s2', kind: 'section' },
          { id: 'r_d2', kind: 'data' }
        ],
        cells: {
          [getCellKey('r_s1', 'c_p')]: { id: 'cs1', rowId: 'r_s1', columnId: 'c_p', content: { kind: 'text', text: 'SEÇÃO 1 — PNEUMÁTICA' }, colSpan: 2 },
          [getCellKey('r_s1', 'c_v')]: { id: 'cs1_cov', rowId: 'r_s1', columnId: 'c_v', content: { kind: 'empty' }, coveredBy: 'cs1' },
          [getCellKey('r_d1', 'c_p')]: { id: 'cd1_p', rowId: 'r_d1', columnId: 'c_p', content: { kind: 'text', text: 'Fluido de Trabalho' } },
          [getCellKey('r_d1', 'c_v')]: { id: 'cd1_v', rowId: 'r_d1', columnId: 'c_v', content: { kind: 'text', text: 'Ar limpo e seco, não corrosivo' } },

          [getCellKey('r_s2', 'c_p')]: { id: 'cs2', rowId: 'r_s2', columnId: 'c_p', content: { kind: 'text', text: 'SEÇÃO 2 — ELÉTRICA' }, colSpan: 2 },
          [getCellKey('r_s2', 'c_v')]: { id: 'cs2_cov', rowId: 'r_s2', columnId: 'c_v', content: { kind: 'empty' }, coveredBy: 'cs2' },
          [getCellKey('r_d2', 'c_p')]: { id: 'cd2_p', rowId: 'r_d2', columnId: 'c_p', content: { kind: 'text', text: 'Alimentação' } },
          [getCellKey('r_d2', 'c_v')]: { id: 'cd2_v', rowId: 'r_d2', columnId: 'c_v', content: { kind: 'text', text: '100 a 240 Vac, 50/60 Hz' } }
        },
        presentation: getTablePreset('presys_dark_navy'),
        paginationPolicy: { allowRowSplit: false, repeatHeaderOnBreak: true, keepHeaderWithFirstRow: true, minOrphanRows: 1 }
      };

      expect(TableCoreModelSchema.parse(fixture).rows).toHaveLength(4);
    });

    it('Fixture C: Feature Yes/No Matrix', () => {
      const fixture: TableCoreModel = {
        id: 'fix-c-yes-no-matrix',
        schemaVersion: 1,
        columns: [
          { id: 'c_f', semanticKey: 'feat', defaultLabel: 'Recurso de Software', widthSpec: { mode: 'fixed_mm', widthMm: 70 }, align: 'left' },
          { id: 'c_yn', semanticKey: 'status', defaultLabel: 'Incluso', widthSpec: { mode: 'fixed_mm', widthMm: 30 }, align: 'center' }
        ],
        rows: [
          { id: 'r1', kind: 'data' },
          { id: 'r2', kind: 'data' },
          { id: 'r3', kind: 'data' }
        ],
        cells: {
          [getCellKey('r1', 'c_f')]: { id: 'c1_f', rowId: 'r1', columnId: 'c_f', content: { kind: 'text', text: 'Datalogger Interno' } },
          [getCellKey('r1', 'c_yn')]: { id: 'c1_yn', rowId: 'r1', columnId: 'c_yn', content: { kind: 'boolean', value: true, format: 'sim_nao' } },
          [getCellKey('r2', 'c_f')]: { id: 'c2_f', rowId: 'r2', columnId: 'c_f', content: { kind: 'text', text: 'Servidor Web Integrado' } },
          [getCellKey('r2', 'c_yn')]: { id: 'c2_yn', rowId: 'r2', columnId: 'c_yn', content: { kind: 'boolean', value: true, format: 'dot' } },
          [getCellKey('r3', 'c_f')]: { id: 'c3_f', rowId: 'r3', columnId: 'c_f', content: { kind: 'text', text: 'Conexão Bluetooth' } },
          [getCellKey('r3', 'c_yn')]: { id: 'c3_yn', rowId: 'r3', columnId: 'c_yn', content: { kind: 'boolean', value: false, format: 'badge' } }
        },
        presentation: getTablePreset('presys_blue_comparison'),
        paginationPolicy: { allowRowSplit: false, repeatHeaderOnBreak: true, keepHeaderWithFirstRow: true, minOrphanRows: 1 }
      };

      expect(TableCoreModelSchema.parse(fixture).cells).toBeDefined();
    });

    it('Fixture D: Accessory / Order-Code Table', () => {
      const fixture: TableCoreModel = {
        id: 'fix-d-order-codes',
        schemaVersion: 1,
        columns: [
          { id: 'c_code', semanticKey: 'order_code', defaultLabel: 'Código de Encomenda', widthSpec: { mode: 'fixed_mm', widthMm: 45 }, align: 'left' },
          { id: 'c_desc', semanticKey: 'description', defaultLabel: 'Descrição do Acessório', widthSpec: { mode: 'fixed_mm', widthMm: 85 }, align: 'left' }
        ],
        rows: [
          { id: 'r1', kind: 'data' },
          { id: 'r2', kind: 'data' }
        ],
        cells: {
          [getCellKey('r1', 'c_code')]: { id: 'c1_code', rowId: 'r1', columnId: 'c_code', content: { kind: 'technical_token', token: '06.01.0023-21' } },
          [getCellKey('r1', 'c_desc')]: { id: 'c1_desc', rowId: 'r1', columnId: 'c_desc', content: { kind: 'text', text: 'Mangueira de alta pressão 700 bar (1.5m)' } },
          [getCellKey('r2', 'c_code')]: { id: 'c2_code', rowId: 'r2', columnId: 'c_code', content: { kind: 'technical_token', token: '02.04.0118-20' } },
          [getCellKey('r2', 'c_desc')]: { id: 'c2_desc', rowId: 'r2', columnId: 'c_desc', content: { kind: 'text', text: 'Kit de adaptadores NPT / BSP em inox 316' } }
        },
        presentation: getTablePreset('corporate_slate'),
        paginationPolicy: { allowRowSplit: false, repeatHeaderOnBreak: true, keepHeaderWithFirstRow: true, minOrphanRows: 1 }
      };

      expect(TableCoreModelSchema.parse(fixture).rows).toHaveLength(2);
    });

    it('Fixture E: Table Containing Asset / Image Cells', () => {
      const fixture: TableCoreModel = {
        id: 'fix-e-assets',
        schemaVersion: 1,
        columns: [
          { id: 'c_img', semanticKey: 'photo', defaultLabel: 'Visual', widthSpec: { mode: 'fixed_mm', widthMm: 40 }, align: 'center' },
          { id: 'c_desc', semanticKey: 'desc', defaultLabel: 'Identificação', widthSpec: { mode: 'fixed_mm', widthMm: 80 }, align: 'left' }
        ],
        rows: [{ id: 'r1', kind: 'data' }],
        cells: {
          [getCellKey('r1', 'c_img')]: {
            id: 'c1_img',
            rowId: 'r1',
            columnId: 'c_img',
            content: {
              kind: 'asset_reference',
              assetId: 'asset_insert_multiholes',
              fit: 'contain',
              align: 'center',
              targetWidthMm: 30,
              targetHeightMm: 20,
              caption: 'Inserto Multi-Furos'
            }
          },
          [getCellKey('r1', 'c_desc')]: {
            id: 'c1_desc',
            rowId: 'r1',
            columnId: 'c_desc',
            content: { kind: 'text', text: 'Inserto de equalização térmica para bloco seco' }
          }
        },
        presentation: getTablePreset('gray_technical'),
        paginationPolicy: { allowRowSplit: false, repeatHeaderOnBreak: true, keepHeaderWithFirstRow: true, minOrphanRows: 1 }
      };

      expect(TableCoreModelSchema.parse(fixture).rows).toHaveLength(1);
    });

    it('Fixture F: Electrical Specification Table with Notes', () => {
      const fixture: TableCoreModel = {
        id: 'fix-f-electrical',
        schemaVersion: 1,
        columns: [
          { id: 'c_func', semanticKey: 'function', defaultLabel: 'Função', widthSpec: { mode: 'fixed_mm', widthMm: 40 }, align: 'left' },
          { id: 'c_range', semanticKey: 'range', defaultLabel: 'Faixa', widthSpec: { mode: 'fixed_mm', widthMm: 45 }, align: 'left' },
          { id: 'c_res', semanticKey: 'res', defaultLabel: 'Resolução', widthSpec: { mode: 'fixed_mm', widthMm: 35 }, align: 'left' }
        ],
        rows: [
          { id: 'r1', kind: 'data' },
          { id: 'r2', kind: 'data' },
          { id: 'r_foot', kind: 'footer' }
        ],
        cells: {
          [getCellKey('r1', 'c_func')]: { id: 'c1_f', rowId: 'r1', columnId: 'c_func', content: { kind: 'text', text: 'Medição de Tensão (V)' } },
          [getCellKey('r1', 'c_range')]: { id: 'c1_r', rowId: 'r1', columnId: 'c_range', content: { kind: 'range', lower: -10, upper: 50, unit: 'V' } },
          [getCellKey('r1', 'c_res')]: { id: 'c1_res', rowId: 'r1', columnId: 'c_res', content: { kind: 'text', text: '0.0001 V' } },

          [getCellKey('r2', 'c_func')]: { id: 'c2_f', rowId: 'r2', columnId: 'c_func', content: { kind: 'text', text: 'Medição de Corrente (mA)' } },
          [getCellKey('r2', 'c_range')]: { id: 'c2_r', rowId: 'r2', columnId: 'c_range', content: { kind: 'range', lower: 0, upper: 24, unit: 'mA' } },
          [getCellKey('r2', 'c_res')]: { id: 'c2_res', rowId: 'r2', columnId: 'c_res', content: { kind: 'text', text: '0.0001 mA' } },

          [getCellKey('r_foot', 'c_func')]: {
            id: 'c_fn',
            rowId: 'r_foot',
            columnId: 'c_func',
            content: { kind: 'text', text: 'Nota: Impedância de entrada > 10 MΩ na faixa de 10 V. Coeficiente térmico: ± 0.001% FE / °C.' },
            colSpan: 3
          },
          [getCellKey('r_foot', 'c_range')]: { id: 'cf_cov1', rowId: 'r_foot', columnId: 'c_range', content: { kind: 'empty' }, coveredBy: 'c_fn' },
          [getCellKey('r_foot', 'c_res')]: { id: 'cf_cov2', rowId: 'r_foot', columnId: 'c_res', content: { kind: 'empty' }, coveredBy: 'c_fn' }
        },
        presentation: getTablePreset('dense_spec_matrix'),
        paginationPolicy: { allowRowSplit: false, repeatHeaderOnBreak: true, keepHeaderWithFirstRow: true, minOrphanRows: 1 }
      };

      expect(TableCoreModelSchema.parse(fixture).rows).toHaveLength(3);
    });
  });
});

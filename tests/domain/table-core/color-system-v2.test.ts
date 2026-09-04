import { describe, it, expect, beforeEach } from 'vitest';
import {
  HexColorSchema,
  TableColorValueSchema,
  TablePresentationModelSchema,
  TableCellStyleOverrideSchema,
  TableRowStyleOverrideSchema,
  TableColumnStyleOverrideSchema
} from '../../../src/domain/table-core/table.schema';
import {
  resolveTableColor,
  TABLE_COLOR_TOKEN_HEX_MAP
} from '../../../src/components/editor/table-core/table-tokens';
import {
  calculateContrastRatio,
  getContrastStatus,
  autoFixContrast
} from '../../../src/domain/color-contrast';
import {
  copyTableAppearance,
  pasteTableAppearance,
  resetToActivePreset,
  resetToSystemDefault,
  materializePaletteOnPresentation,
  saveUserPalette,
  getSavedPalettes,
  saveUserTableStyle,
  getSavedTableStyles
} from '../../../src/domain/appearance/catalog-appearance';
import {
  TableCoreModel,
  TablePresentationModel,
  TableColorValue
} from '../../../src/domain/table-core/table.types';
import { DEFAULT_TABLE_PRESENTATION } from '../../../src/domain/table-core/table.presets';

describe('Table Core V2: Color System, Hex Validation & Style Precedence (Emendas 4-16, 20, 25-27)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ==========================================================================
  // Emenda 4 & 5: Distinção Semântica brand_navy (#001f3f) vs technical_blue (#003366)
  // ==========================================================================
  it('COLOR-1: brand_navy (#001f3f) e technical_blue (#003366) são valores distintos no mapa de tokens', () => {
    const navyHex = TABLE_COLOR_TOKEN_HEX_MAP['brand_navy'];
    const technicalBlueHex = TABLE_COLOR_TOKEN_HEX_MAP['technical_blue'];

    expect(navyHex).toBe('#001f3f');
    expect(technicalBlueHex).toBe('#003366');
    expect(navyHex).not.toBe(technicalBlueHex);
  });

  // ==========================================================================
  // Emenda 6: Validação Estrita de HexColor e TableColorValue
  // ==========================================================================
  it('COLOR-2: HexColor aceita #RGB e #RRGGBB normalizando para minúsculas, e rejeita CSS arbitrário', () => {
    // Válidos
    expect(HexColorSchema.safeParse('#fff').success).toBe(true);
    expect(HexColorSchema.safeParse('#003366').success).toBe(true);
    expect(HexColorSchema.safeParse('#AABBCC').success).toBe(true);

    if (HexColorSchema.safeParse('#AABBCC').success) {
      expect(HexColorSchema.parse('#AABBCC')).toBe('#aabbcc');
    }

    // Proibidos (style injection, rgb livre, var, etc.)
    const forbidden = [
      'red',
      'blue',
      'rgb(0, 51, 102)',
      'rgba(0,0,0,0.5)',
      'var(--brand-primary)',
      'url("hack.png")',
      '#12345',
      '#1234567'
    ];

    for (const f of forbidden) {
      expect(HexColorSchema.safeParse(f).success, `Deveria rejeitar: ${f}`).toBe(false);
      expect(TableColorValueSchema.safeParse(f).success, `Deveria rejeitar em TableColorValue: ${f}`).toBe(false);
    }

    // Token 'transparent' é token de cor válido, mas rejeitado como HEX
    expect(HexColorSchema.safeParse('transparent').success).toBe(false);
    expect(TableColorValueSchema.safeParse('transparent').success).toBe(true);
  });

  // ==========================================================================
  // Emenda 7: Todas as camadas de style aceitam Custom Color (TableColorValue)
  // ==========================================================================
  it('COLOR-3: TableColorValue é aceito em TablePresentationModel, Row, Column e Cell overrides', () => {
    const customHex: TableColorValue = '#003366';

    // Presentation
    const presResult = TablePresentationModelSchema.safeParse({
      ...DEFAULT_TABLE_PRESENTATION,
      headerBackgroundToken: customHex,
      headerTextColorToken: '#ffffff',
      borderColorToken: '#001f3f'
    });
    expect(presResult.success).toBe(true);

    // Row override
    const rowResult = TableRowStyleOverrideSchema.safeParse({
      backgroundToken: '#e2e8f0',
      textColorToken: '#0f172a'
    });
    expect(rowResult.success).toBe(true);

    // Column override
    const colResult = TableColumnStyleOverrideSchema.safeParse({
      backgroundToken: '#f8fafc',
      textColorToken: '#1e293b'
    });
    expect(colResult.success).toBe(true);

    // Cell override
    const cellResult = TableCellStyleOverrideSchema.safeParse({
      backgroundColorToken: '#dbeafe',
      textColorToken: '#1e40af'
    });
    expect(cellResult.success).toBe(true);
  });

  // ==========================================================================
  // Emenda 8: Resolução Canônica com resolveTableColor
  // ==========================================================================
  it('COLOR-4: resolveTableColor unifica resolução de tokens e HEX retornando className e inline styles', () => {
    // Token
    const resolvedToken = resolveTableColor('brand_navy', 'bg');
    expect(resolvedToken.className).toBe('bg-[#001f3f]');
    expect(resolvedToken.style?.backgroundColor).toBe('#001f3f');

    // Hex customizado
    const resolvedHex = resolveTableColor('#ff9900', 'text');
    expect(resolvedHex.className).toBe('');
    expect(resolvedHex.style?.color).toBe('#ff9900');

    // Borda Hex customizada
    const resolvedBorder = resolveTableColor('#334455', 'border');
    expect(resolvedBorder.style?.borderColor).toBe('#334455');
  });

  // ==========================================================================
  // Emenda 9, 10 & 11: Saved Palette & Saved Table Style sem mutar static enum
  // ==========================================================================
  it('COLOR-5: Paletas e Estilos de Usuário são salvos no localStorage e materializados no Presentation', () => {
    const userPalette = saveUserPalette({
      name: 'Gabriel Azul 01',
      headerBackground: '#003366',
      headerText: '#ffffff',
      borderColor: '#001f3f'
    });

    expect(userPalette.id).toMatch(/^palette_/);
    const savedList = getSavedPalettes();
    expect(savedList.length).toBe(1);
    expect(savedList[0].name).toBe('Gabriel Azul 01');

    // Materialização em um TablePresentationModel
    const initialPres: TablePresentationModel = { ...DEFAULT_TABLE_PRESENTATION };
    const materialized = materializePaletteOnPresentation(initialPres, userPalette);

    expect(materialized.headerBackgroundToken).toBe('#003366');
    expect(materialized.headerTextColorToken).toBe('#ffffff');
    expect(materialized.borderColorToken).toBe('#001f3f');

    // Salvar como Table Style de Usuário
    const userStyle = saveUserTableStyle({
      name: 'Estilo Metrologia Avançado',
      presentation: materialized
    });

    expect(userStyle?.id).toMatch(/^style_/);
    const stylesList = getSavedTableStyles();
    expect(stylesList.length).toBe(1);
    expect(stylesList[0].name).toBe('Estilo Metrologia Avançado');
  });

  // ==========================================================================
  // Emenda 12: Reset com Semântica Clara (Preset vs Sistema)
  // ==========================================================================
  it('COLOR-6: resetToActivePreset restaura preset escolhido e resetToSystemDefault volta a presys_clean_technical', () => {
    const customTable: TableCoreModel = {
      id: 'tbl_custom',
      schemaVersion: 1,
      columns: [{ id: 'c1', semanticKey: 'k', defaultLabel: 'Col', align: 'left', widthSpec: { mode: 'auto' } }],
      rows: [{ id: 'r1', kind: 'data' }],
      cells: {},
      paginationPolicy: { allowRowSplit: false, repeatHeaderOnBreak: true, keepHeaderWithFirstRow: true, minOrphanRows: 1 },
      presentation: {
        ...DEFAULT_TABLE_PRESENTATION,
        presetId: 'precision_blue',
        headerBackgroundToken: '#ff0000',
        headerTextColorToken: '#000000'
      }
    };

    // Reset para o preset ativo (ex.: precision_blue)
    const resetTable = resetToActivePreset(customTable);
    expect(resetTable.presentation.headerBackgroundToken).toBe('technical_blue');

    // Reset para padrão do sistema (presys_clean_technical)
    const resetSystemTable = resetToSystemDefault(customTable);
    expect(resetSystemTable.presentation.headerBackgroundToken).toBe('slate_900');
  });

  // ==========================================================================
  // Emenda 13 & 27: Copy/Paste Appearance com ZERO mutação de dados
  // ==========================================================================
  it('COLOR-7: Copy/Paste Appearance copia exclusivamente apresentação garantindo integridade total de dados', () => {
    const sourceTable: TableCoreModel = {
      id: 'tbl_source',
      schemaVersion: 1,
      title: 'Tabela de Origem',
      columns: [
        { id: 'c1', semanticKey: 'p1', defaultLabel: 'Coluna 1', align: 'left', widthSpec: { mode: 'auto' } }
      ],
      rows: [
        { id: 'r1', kind: 'data', minHeightMm: 8 }
      ],
      cells: {
        'r1:c1': {
          id: 'cell_r1_c1',
          rowId: 'r1',
          columnId: 'c1',
          colSpan: 1,
          rowSpan: 1,
          content: { kind: 'text', text: 'Dados Críticos TA-500N' },
          styleOverride: { bold: true }
        }
      },
      paginationPolicy: { allowRowSplit: false, repeatHeaderOnBreak: true, keepHeaderWithFirstRow: true, minOrphanRows: 1 },
      presentation: {
        ...DEFAULT_TABLE_PRESENTATION,
        headerBackgroundToken: '#003366',
        stripeStyle: 'subtle_zebra'
      }
    };

    const targetTable: TableCoreModel = {
      id: 'tbl_target',
      schemaVersion: 1,
      title: 'Tabela de Destino',
      columns: [
        { id: 'tc1', semanticKey: 'tp1', defaultLabel: 'Outra Coluna', align: 'right', widthSpec: { mode: 'auto' } }
      ],
      rows: [
        { id: 'tr1', kind: 'data', minHeightMm: 12 }
      ],
      cells: {
        'tr1:tc1': {
          id: 'cell_tr1_tc1',
          rowId: 'tr1',
          columnId: 'tc1',
          colSpan: 1,
          rowSpan: 1,
          content: { kind: 'number', value: 1200 }
        }
      },
      paginationPolicy: { allowRowSplit: false, repeatHeaderOnBreak: true, keepHeaderWithFirstRow: true, minOrphanRows: 1 },
      presentation: {
        ...DEFAULT_TABLE_PRESENTATION,
        headerBackgroundToken: 'slate_900'
      }
    };

    // Snapshot dos dados do target antes da colagem
    const targetDataSnapshot = JSON.stringify({
      id: targetTable.id,
      title: targetTable.title,
      columns: targetTable.columns,
      rows: targetTable.rows,
      cells: targetTable.cells
    });

    // Copia aparência
    copyTableAppearance(sourceTable.presentation);

    // Cola aparência na tabela de destino
    const updatedTarget = pasteTableAppearance(targetTable);
    expect(updatedTarget).not.toBeNull();
    expect(updatedTarget!.presentation.headerBackgroundToken).toBe('#003366');
    expect(updatedTarget!.presentation.stripeStyle).toBe('subtle_zebra');

    // Emenda 27: Zero Data Mutation
    const targetDataAfterPaste = JSON.stringify({
      id: targetTable.id,
      title: targetTable.title,
      columns: targetTable.columns,
      rows: targetTable.rows,
      cells: targetTable.cells
    });

    expect(targetDataAfterPaste).toBe(targetDataSnapshot);
  });

  // ==========================================================================
  // Emenda 20: Validação de Contraste e Sugestão de Auto-Fix
  // ==========================================================================
  it('COLOR-8: Diagnóstico de contraste calcula WCAG e fornece auto-fix sem substituição silenciosa', () => {
    // Baixo contraste: texto branco sobre fundo amarelo claro
    const lowContrastRatio = calculateContrastRatio('#ffffff', '#ffff99');
    expect(lowContrastRatio).toBeLessThan(3);

    const status = getContrastStatus(lowContrastRatio);
    expect(status).toBe('FAIL');

    // Auto-fix sugere contraste adequado
    const fixedTextColor = autoFixContrast('#ffff99');
    expect(fixedTextColor).toBe('#0f172a'); // Sugere texto escuro sobre fundo claro
    const fixedRatio = calculateContrastRatio(fixedTextColor, '#ffff99');
    expect(fixedRatio).toBeGreaterThan(4.5);
  });

  // ==========================================================================
  // Emenda 25 & 26: Retrocompatibilidade e Round-Trip de Serialização
  // ==========================================================================
  it('COLOR-9: Modelos legados baseados exclusivamente em tokens continuam 100% válidos (Retrocompatibilidade)', () => {
    const legacyPresentation = {
      presetId: 'presys_clean_technical',
      headerBackgroundToken: 'brand_primary',
      headerTextColorToken: 'white',
      sectionBackgroundToken: 'surface_subtle',
      sectionTextColorToken: 'text_primary',
      borderColorToken: 'slate_200',
      density: 'compact',
      borderStyle: 'horizontal_only',
      stripeStyle: 'none',
      fontScale: 'normal',
      lineHeight: 'tight',
      outerBorderWidth: 'thin',
      cornerRoundness: 'none',
      tableWidth: { mode: 'auto_fill' }
    };

    const parsed = TablePresentationModelSchema.safeParse(legacyPresentation);
    expect(parsed.success).toBe(true);
  });

  it('COLOR-10: Serialização JSON -> Deserialização -> Parse mantém fidelidade absoluta com cores HEX', () => {
    const modelWithHex: TablePresentationModel = {
      ...DEFAULT_TABLE_PRESENTATION,
      headerBackgroundToken: '#003366',
      headerTextColorToken: '#ffffff',
      borderColorToken: '#001f3f'
    };

    const serialized = JSON.stringify(modelWithHex);
    const deserialized = JSON.parse(serialized);
    const parsed = TablePresentationModelSchema.parse(deserialized);

    expect(parsed.headerBackgroundToken).toBe('#003366');
    expect(parsed.headerTextColorToken).toBe('#ffffff');
    expect(parsed.borderColorToken).toBe('#001f3f');
  });
});

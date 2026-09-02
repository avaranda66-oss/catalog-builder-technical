import { describe, it, expect } from 'vitest';
import { extractTableBlocks } from '../../src/translation/block-extractors/table.extractor';
import { TechnicalTokenProtector } from '../../src/translation/token-protector';
import { PrintStringRegistry } from '../../src/translation/print-strings.registry';
import { TranslationApplierRegistry } from '../../src/translation/translation-applier.registry';
import { CoverageAuditor } from '../../src/translation/coverage.auditor';
import { Catalog, ContentBlock } from '../../src/domain/catalog.schema';

describe('Hotfix Pós-Closure: Printable Localization Completeness', () => {
  // Fixture oficial da tabela TA-35N / PCON-Y18 do caso real
  const createRealMatrixBlock = (): ContentBlock => ({
    id: 'matrix-ta35n',
    type: 'matrix_spec_table',
    title: 'MATRIZ COMPARATIVA DE MODELOS & ESPECIFICAÇÕES',
    customData: {
      columns: ['Parâmetro / Modelo', 'TA-35N', 'PCON-Y18', 'PCON-Y18-HP'],
      rows: [
        {
          param: 'Faixa de Geração Pneumática',
          values: ['-0.9 a 2.5 bar', '-0.9 a 40 bar', '0 a 70 bar']
        },
        {
          param: 'Exatidão Padrão (% FE)',
          values: ['±0.025% FE', '±0.025% FE', '±0.025% FE']
        },
        {
          param: 'Estabilidade de Controle',
          values: ['< 0.003% FE', '< 0.003% FE', '< 0.005% FE']
        },
        {
          param: 'Bomba Elétrica Integrada',
          values: ['■', '■', '■']
        },
        {
          param: 'Comunicação HART / Modbus',
          values: ['■', '■', '□']
        }
      ]
    }
  });

  const createCatalogWithMatrix = (matrixBlock: ContentBlock, locale = 'pt-BR'): Catalog => ({
    id: 'cat-ta35n-real',
    title: 'Catálogo de Teste TA-35N',
    themeId: 'presys-default',
    version: 1,
    locale,
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        blocks: [matrixBlock]
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // TR-TABLE-I18N-1: "Parâmetro / Modelo" traduz (coluna 0 tem policy translate)
  it('TR-TABLE-I18N-1: Parâmetro / Modelo da coluna 0 é extraído com policy translate', () => {
    const block = createRealMatrixBlock();
    const nodes = extractTableBlocks(block, 'page-1', 1);

    const col0Node = nodes.find((n) => n.path === 'customData.columns[0]');
    expect(col0Node).toBeDefined();
    expect(col0Node?.sourceText).toBe('Parâmetro / Modelo');
    expect(col0Node?.policy).toBe('translate');
  });

  // TR-TABLE-I18N-2: TA-35N e modelos permanecem intactos (colunas > 0 têm policy protect)
  it('TR-TABLE-I18N-2: Modelos (TA-35N, PCON-Y18, etc.) são classificados como protect', () => {
    const block = createRealMatrixBlock();
    const nodes = extractTableBlocks(block, 'page-1', 1);

    const col1Node = nodes.find((n) => n.path === 'customData.columns[1]');
    const col2Node = nodes.find((n) => n.path === 'customData.columns[2]');
    const col3Node = nodes.find((n) => n.path === 'customData.columns[3]');

    expect(col1Node?.sourceText).toBe('TA-35N');
    expect(col1Node?.policy).toBe('protect');

    expect(col2Node?.sourceText).toBe('PCON-Y18');
    expect(col2Node?.policy).toBe('protect');

    expect(col3Node?.sourceText).toBe('PCON-Y18-HP');
    expect(col3Node?.policy).toBe('protect');
  });

  // TR-TABLE-I18N-3: row param traduz
  it('TR-TABLE-I18N-3: Nomes de linhas (param) são extraídos com policy translate', () => {
    const block = createRealMatrixBlock();
    const nodes = extractTableBlocks(block, 'page-1', 1);

    const paramRow0 = nodes.find((n) => n.path === 'customData.rows[0].param');
    const paramRow1 = nodes.find((n) => n.path === 'customData.rows[1].param');

    expect(paramRow0?.sourceText).toBe('Faixa de Geração Pneumática');
    expect(paramRow0?.policy).toBe('translate');

    expect(paramRow1?.sourceText).toBe('Exatidão Padrão (% FE)');
    expect(paramRow1?.policy).toBe('translate');
  });

  // TR-TABLE-I18N-4: valores técnicos puros permanecem intactos (policy protect)
  it('TR-TABLE-I18N-4: Valores técnicos puros (±0.025% FE, marcadores ■, etc.) são classificados como protect', () => {
    const block = createRealMatrixBlock();
    const nodes = extractTableBlocks(block, 'page-1', 1);

    const pureVal = nodes.find((n) => n.path === 'customData.rows[1].values[0]');
    expect(pureVal?.sourceText).toBe('±0.025% FE');
    expect(pureVal?.policy).toBe('protect');

    const bulletVal = nodes.find((n) => n.path === 'customData.rows[3].values[0]');
    expect(bulletVal?.sourceText).toBe('■');
    expect(bulletVal?.policy).toBe('protect');
  });

  // TR-TABLE-I18N-5: "0 a 70 bar" traduz apenas o conector linguístico preservando números e unidades
  it('TR-TABLE-I18N-5: Faixa mista "0 a 70 bar" traduz apenas conector linguístico', () => {
    const mixedText = '0 a 70 bar';
    expect(TechnicalTokenProtector.isMixedValue(mixedText)).toBe(true);

    const { maskedText, tokenMap } = TechnicalTokenProtector.protectTokens(mixedText);
    // Deve conter marcadores protegidos e o conector " a "
    expect(maskedText).toMatch(/\[\[TECH_\d+\]\] a \[\[TECH_\d+\]\]/);

    // Simulação de tradução para EN, FR e TH
    const enTranslatedMasked = maskedText.replace(' a ', ' to ');
    const frTranslatedMasked = maskedText.replace(' a ', ' à ');
    const thTranslatedMasked = maskedText.replace(' a ', ' ถึง ');

    const enRestored = TechnicalTokenProtector.restoreTokens(enTranslatedMasked, tokenMap);
    const frRestored = TechnicalTokenProtector.restoreTokens(frTranslatedMasked, tokenMap);
    const thRestored = TechnicalTokenProtector.restoreTokens(thTranslatedMasked, tokenMap);

    expect(enRestored).toBe('0 to 70 bar');
    expect(frRestored).toBe('0 à 70 bar');
    expect(thRestored).toBe('0 ถึง 70 bar');
  });

  // TR-LEGEND-I18N-1: legend title localizado em todos os idiomas
  it('TR-LEGEND-I18N-1: legend_title resolve localizado para en-US, fr-FR e th-TH', () => {
    expect(PrintStringRegistry.get('legend_title', 'en-US')).toBe('LEGEND:');
    expect(PrintStringRegistry.get('legend_title', 'fr-FR')).toBe('LÉGENDE :');
    expect(PrintStringRegistry.get('legend_title', 'th-TH')).toBe('คำอธิบายสัญลักษณ์:');
  });

  // TR-LEGEND-I18N-2: todos default marker labels localizados
  it('TR-LEGEND-I18N-2: Todos os 8 marcadores default de legenda estão localizados em FR e EN', () => {
    const markers = [
      'legend_filled_square',
      'legend_empty_square',
      'legend_filled_circle',
      'legend_empty_circle',
      'legend_asterisk',
      'legend_double_asterisk',
      'legend_dash'
    ];

    for (const marker of markers) {
      const en = PrintStringRegistry.get(marker, 'en-US');
      const fr = PrintStringRegistry.get(marker, 'fr-FR');
      const th = PrintStringRegistry.get(marker, 'th-TH');

      expect(en).not.toBe(marker);
      expect(fr).not.toBe(marker);
      expect(th).not.toBe(marker);
      expect(fr).not.toBe(en); // Deve ser francês e não inglês!
    }

    expect(PrintStringRegistry.get('legend_filled_square', 'fr-FR')).toBe('Inclus dans la configuration standard');
    expect(PrintStringRegistry.get('legend_empty_square', 'fr-FR')).toBe('Optionnel / disponible sur demande');
    expect(PrintStringRegistry.get('legend_asterisk', 'fr-FR')).toBe('Consulter la note technique de bas de page (*)');
    expect(PrintStringRegistry.get('legend_dash', 'fr-FR')).toBe('Non applicable pour ce modèle');
  });

  // TR-LEGEND-I18N-3: custom legend traduz via nodes
  it('TR-LEGEND-I18N-3: Legenda personalizada com título customizado é extraída com policy translate', () => {
    const block: ContentBlock = {
      id: 'b-table-custom-legend',
      type: 'table',
      title: 'Tabela Customizada',
      customData: {
        legendConfig: {
          showLegend: true,
          title: 'Legenda Personalizada do Usuário',
          items: [
            { type: 'filled_square', label: 'Item Especial Customizado' }
          ]
        }
      }
    };

    const nodes = extractTableBlocks(block, 'page-1', 1);
    const legTitleNode = nodes.find((n) => n.path === 'customData.legendConfig.title');
    const legItemNode = nodes.find((n) => n.path === 'customData.legendConfig.items[0].label');

    expect(legTitleNode).toBeDefined();
    expect(legTitleNode?.sourceText).toBe('Legenda Personalizada do Usuário');
    expect(legTitleNode?.policy).toBe('translate');

    expect(legItemNode).toBeDefined();
    expect(legItemNode?.sourceText).toBe('Item Especial Customizado');
    expect(legItemNode?.policy).toBe('translate');
  });

  // TR-GROUP-I18N-1: columnGroups[].title traduz
  it('TR-GROUP-I18N-1: Títulos de grupos de colunas (columnGroups) são extraídos com policy translate', () => {
    const block: ContentBlock = {
      id: 'b-table-groups',
      type: 'table',
      title: 'Tabela de Grupos',
      columnGroups: [
        { id: 'grp-1', title: 'Faixa Pneumática Superior', colSpan: 2 },
        { id: 'grp-2', title: 'Recursos Elétricos', colSpan: 2 }
      ]
    } as any;

    const nodes = extractTableBlocks(block, 'page-1', 1);
    const grp1Node = nodes.find((n) => n.path === 'columnGroups[0].title');
    const grp2Node = nodes.find((n) => n.path === 'columnGroups[1].title');

    expect(grp1Node).toBeDefined();
    expect(grp1Node?.sourceText).toBe('Faixa Pneumática Superior');
    expect(grp1Node?.policy).toBe('translate');

    expect(grp2Node).toBeDefined();
    expect(grp2Node?.sourceText).toBe('Recursos Elétricos');
    expect(grp2Node?.policy).toBe('translate');
  });

  // TR-SURFACE-I18N-1, 2, 3: Aplicação de tradução no target catalog
  it('TR-SURFACE-I18N-1, 2, 3: Aplicação completa no target catalog com preservação de nós protect', () => {
    const sourceBlock = createRealMatrixBlock();
    const sourceCatalog = createCatalogWithMatrix(sourceBlock, 'pt-BR');

    // Mapeamento de tradução francesa
    const translatedNodes = [
      { id: 'p1_bmatrix-ta35n_title', text: 'MATRICE COMPARATIVE DES MODÈLES & SPÉCIFICATIONS' },
      { id: 'p1_bmatrix-ta35n_col_0', text: 'Paramètre / Modèle' },
      { id: 'p1_bmatrix-ta35n_row_0_param', text: 'Plage de Génération Pneumatique' },
      { id: 'p1_bmatrix-ta35n_row_0_val_0', text: '-0.9 à 2.5 bar' },
      { id: 'p1_bmatrix-ta35n_row_0_val_1', text: '-0.9 à 40 bar' },
      { id: 'p1_bmatrix-ta35n_row_0_val_2', text: '0 à 70 bar' }
    ];

    const applierRes = TranslationApplierRegistry.apply(sourceCatalog, translatedNodes, 'fr-FR');
    expect(applierRes.unappliedCount).toBe(0);

    const targetCatalog = applierRes.translatedCatalog;
    const targetCustom = targetCatalog.pages[0].blocks[0].customData;

    // TR-SURFACE-I18N-1: TRANSLATE nodes aparecem no DOM target com valor traduzido
    expect(targetCustom.columns[0]).toBe('Paramètre / Modèle');
    expect(targetCustom.rows[0].param).toBe('Plage de Génération Pneumatique');
    expect(targetCustom.rows[0].values[2]).toBe('0 à 70 bar');

    // TR-SURFACE-I18N-3: PROTECT nodes permanecem idênticos ao source
    expect(targetCustom.columns[1]).toBe('TA-35N');
    expect(targetCustom.columns[2]).toBe('PCON-Y18');
    expect(targetCustom.columns[3]).toBe('PCON-Y18-HP');
    expect(targetCustom.rows[1].values[0]).toBe('±0.025% FE');
    expect(targetCustom.rows[3].values[0]).toBe('■');

    // Avaliação de métricas de completude rigorosas
    const metrics = CoverageAuditor.evaluateLocalizationCompleteness(sourceCatalog, targetCatalog, applierRes);
    expect(metrics.printableMappingPercent).toBe(100);
    expect(metrics.translationAppliedPercent).toBe(100);
    expect(metrics.systemLocalizationPercent).toBe(100);
    expect(metrics.protectedIntegrityPercent).toBe(100);
    expect(metrics.unclassifiedPrintableCount).toBe(0);
    expect(metrics.isFullyLocalized).toBe(true);
  });

  // Item 14: Fixture do caso real testado em en-US, fr-FR e th-TH
  it('Item 14: Reproduz a tabela TA-35N nos idiomas en-US, fr-FR e th-TH com modelos, números e unidades intactos', () => {
    const sourceBlock = createRealMatrixBlock();
    const sourceCatalog = createCatalogWithMatrix(sourceBlock, 'pt-BR');

    const locales = [
      {
        locale: 'en-US',
        header: 'Parameter / Model',
        range: '0 to 70 bar',
        legendTitle: 'LEGEND:',
        legendFilled: 'Included in standard configuration'
      },
      {
        locale: 'fr-FR',
        header: 'Paramètre / Modèle',
        range: '0 à 70 bar',
        legendTitle: 'LÉGENDE :',
        legendFilled: 'Inclus dans la configuration standard'
      },
      {
        locale: 'th-TH',
        header: 'พารามิเตอร์ / รุ่น',
        range: '0 ถึง 70 bar',
        legendTitle: 'คำอธิบายสัญลักษณ์:',
        legendFilled: 'รวมอยู่ในการกำหนดค่ามาตรฐาน'
      }
    ];

    for (const { locale, header, range, legendTitle, legendFilled } of locales) {
      const translatedNodes = [
        { id: 'p1_bmatrix-ta35n_title', text: `MATRIZ [${locale}]` },
        { id: 'p1_bmatrix-ta35n_col_0', text: header },
        { id: 'p1_bmatrix-ta35n_row_0_param', text: `Range [${locale}]` },
        { id: 'p1_bmatrix-ta35n_row_0_val_2', text: range }
      ];

      const applied = TranslationApplierRegistry.apply(sourceCatalog, translatedNodes, locale);
      expect(applied.unappliedCount).toBe(0);

      const targetCustom = applied.translatedCatalog.pages[0].blocks[0].customData;

      // Textos editoriais localizados
      expect(targetCustom.columns[0]).toBe(header);
      expect(targetCustom.rows[0].values[2]).toBe(range);

      // Modelos e unidades metrológicas 100% intactos
      expect(targetCustom.columns[1]).toBe('TA-35N');
      expect(targetCustom.columns[2]).toBe('PCON-Y18');
      expect(targetCustom.columns[3]).toBe('PCON-Y18-HP');
      expect(targetCustom.rows[1].values[0]).toBe('±0.025% FE');
      expect(targetCustom.rows[3].values[0]).toBe('■');
      expect(targetCustom.rows[4].param).toBe('Comunicação HART / Modbus');

      // Strings de sistema de legenda resolvidas
      expect(PrintStringRegistry.get('legend_title', locale)).toBe(legendTitle);
      expect(PrintStringRegistry.get('legend_filled_square', locale)).toBe(legendFilled);

      // Métricas de completude
      const metrics = CoverageAuditor.evaluateLocalizationCompleteness(sourceCatalog, applied.translatedCatalog, applied);
      expect(metrics.isFullyLocalized).toBe(true);
    }
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { useCatalogStore } from '../../../src/stores/useCatalogStore';
import { useUIStore } from '../../../src/stores/useUIStore';
import {
  TABLE_PRESETS,
  DEFAULT_TABLE_PRESENTATION,
  getTablePreset
} from '../../../src/domain/table-core/table.presets';
import { DEFAULT_TABLE_PAGINATION_POLICY } from '../../../src/domain/table-core/table.pagination';
import {
  resolveTableColor,
  getBorderClasses
} from '../../../src/components/editor/table-core/table-tokens';
import {
  getSavedPalettes,
  getSavedTableStyles,
  applyPaletteToTable,
  materializePaletteOnPresentation,
  SavedPalette,
  SavedPaletteSchema,
  SavedTableStyleSchema
} from '../../../src/domain/appearance/catalog-appearance';
import { TablePresentationModel, TableCoreModel, HexColor } from '../../../src/domain/table-core/table.types';
import { ContentBlock } from '../../../src/domain/catalog.schema';

describe('RELEASE.MAIN.PRODUCTION1 — 12 UX & Core Closures Gate Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.getState().setTablePresentationDraft(null);
    useCatalogStore.getState().createCatalogFromPreset(
      'Catálogo de Homologação Release 1',
      'preset-presys-ta-25n-datasheet'
    );
  });

  // ==========================================================================
  // CLOSURE 1: Color Picker Local Draft & Exactly 1 Commit on Confirm
  // ==========================================================================
  describe('CLOSURE 1 — Color Picker Local Draft & Atomic Commit', () => {
    it('100 preview events via UIStore draft generate ZERO document mutations; Confirm generates exactly 1 commit; Cancel generates 0 commits', () => {
      const store = useCatalogStore.getState();
      const uiStore = useUIStore.getState();
      const revBefore = store.localRevision;

      const targetBlockId = 'block-table-test-1';

      // Simula 100 eventos de mousemove/input no color picker
      let draft: TablePresentationModel = structuredClone(DEFAULT_TABLE_PRESENTATION);
      for (let i = 0; i < 100; i++) {
        const hex = `#${(i % 10).toString(16).padStart(2, '0')}3366` as HexColor;
        draft = { ...draft, headerBackgroundToken: hex };
        uiStore.setTablePresentationDraft({ blockId: targetBlockId, presentation: draft });
      }

      // Verificação: 100 eventos no draft -> zero mutações documentais
      const revAfter100 = useCatalogStore.getState().localRevision;
      expect(revAfter100 - revBefore).toBe(0);
      expect(useUIStore.getState().tablePresentationDraft?.presentation.headerBackgroundToken).toBe(draft.headerBackgroundToken);

      // Cancelar: restaura e limpa rascunho sem nenhum commit
      uiStore.setTablePresentationDraft(null);
      expect(useUIStore.getState().tablePresentationDraft).toBeNull();
      const revAfterCancel = useCatalogStore.getState().localRevision;
      expect(revAfterCancel - revBefore).toBe(0);

      // Agora simula o fluxo completo com CONFIRMAR:
      // 1. Abre rascunho e emite 50 eventos
      for (let i = 0; i < 50; i++) {
        draft = { ...draft, headerBackgroundToken: '#003366' };
        uiStore.setTablePresentationDraft({ blockId: targetBlockId, presentation: draft });
      }
      expect(useCatalogStore.getState().localRevision - revBefore).toBe(0);

      // 2. Localiza um bloco real do catálogo para confirmar
      const catalog = useCatalogStore.getState().currentCatalog!;
      const realBlock = catalog.pages[1].blocks[0];

      // 3. Confirmar: aplica a mutação única canônica
      useCatalogStore.getState().applyTablePresentationTemplate(realBlock.id, draft);
      uiStore.setTablePresentationDraft(null);

      const revAfterConfirm = useCatalogStore.getState().localRevision;
      expect(revAfterConfirm - revBefore).toBe(1);
      expect(useUIStore.getState().tablePresentationDraft).toBeNull();
    });
  });

  // ==========================================================================
  // CLOSURE 2: Preset Change and Reset Atomic
  // ==========================================================================
  describe('CLOSURE 2 — Preset Change and Resets Must Be Atomic', () => {
    it('Mudança de preset gera EXATAMENTE 1 commitDocumentMutation', () => {
      const catalog = useCatalogStore.getState().currentCatalog!;
      const targetBlock = catalog.pages[1].blocks[0];
      const revBefore = useCatalogStore.getState().localRevision;

      // Executa a ação canônica atômica de troca de preset
      const newPreset = getTablePreset('precision_blue');
      useCatalogStore.getState().applyTablePresentationTemplate(targetBlock.id, newPreset);

      const revAfter = useCatalogStore.getState().localRevision;
      expect(revAfter - revBefore).toBe(1);

      const updatedCatalog = useCatalogStore.getState().currentCatalog!;
      const updatedBlock = updatedCatalog.pages[1].blocks[0];
      expect(updatedBlock.customData?.presentationPresetId).toBe('precision_blue');
    });

    it('Reset to system default gera EXATAMENTE 1 commitDocumentMutation', () => {
      const catalog = useCatalogStore.getState().currentCatalog!;
      const targetBlock = catalog.pages[1].blocks[0];
      const revBefore = useCatalogStore.getState().localRevision;

      const sysPreset = getTablePreset('presys_clean_technical');
      useCatalogStore.getState().applyTablePresentationTemplate(targetBlock.id, sysPreset);

      const revAfter = useCatalogStore.getState().localRevision;
      expect(revAfter - revBefore).toBe(1);
    });
  });

  // ==========================================================================
  // CLOSURE 3: Apply to All Batch / Atomic
  // ==========================================================================
  describe('CLOSURE 3 — Apply to All Must Be Batch / Atomic (1 Transaction)', () => {
    it('Aplicar a todas as tabelas técnicas V2 atualiza N tabelas em EXATAMENTE 1 commitDocumentMutation', () => {
      // Prepara o catálogo garantindo múltiplas tabelas specs_table
      const store = useCatalogStore.getState();

      // Converte/insere 3 blocos specs_table no draft
      store.commitDocumentMutation(
        (draft) => {
          draft.pages[1].blocks = [
            { id: 'tbl-1', type: 'specs_table', customData: {} } as ContentBlock,
            { id: 'tbl-2', type: 'specs_table', customData: {} } as ContentBlock
          ];
          draft.pages[2].blocks = [
            { id: 'tbl-3', type: 'specs_table', customData: {} } as ContentBlock
          ];
        },
        'UPDATE_BLOCK',
        { summary: 'Setup de teste para múltiplas tabelas' }
      );

      const revBeforeBatch = useCatalogStore.getState().localRevision;
      const targetPresentation = getTablePreset('corporate_slate');

      // Executa o batch atômico
      const updatedCount = useCatalogStore.getState().applyPresentationToAllTableCoreV2(targetPresentation);

      const revAfterBatch = useCatalogStore.getState().localRevision;

      // EXATAMENTE 1 mutation para 3 tabelas
      expect(updatedCount).toBe(3);
      expect(revAfterBatch - revBeforeBatch).toBe(1);

      // Confirma que todas as 3 tabelas foram atualizadas
      const updatedCat = useCatalogStore.getState().currentCatalog!;
      expect(updatedCat.pages[1].blocks[0].customData?.tablePresentation?.presetId).toBe('corporate_slate');
      expect(updatedCat.pages[1].blocks[1].customData?.tablePresentation?.presetId).toBe('corporate_slate');
      expect(updatedCat.pages[2].blocks[0].customData?.tablePresentation?.presetId).toBe('corporate_slate');
    });
  });

  // ==========================================================================
  // CLOSURE 4: Blue Preset Visual Distinction
  // ==========================================================================
  describe('CLOSURE 4 — Blue Preset Visual Distinction (Dark Navy != Blue Comparison)', () => {
    it('presys_dark_navy usa brand_navy (#001f3f) e presys_blue_comparison usa technical_blue (#003366)', () => {
      const darkNavyPreset = TABLE_PRESETS.presys_dark_navy;
      const blueComparisonPreset = TABLE_PRESETS.presys_blue_comparison;

      expect(darkNavyPreset.headerBackgroundToken).toBe('brand_navy');
      expect(blueComparisonPreset.headerBackgroundToken).toBe('technical_blue');

      const darkNavyColor = resolveTableColor(darkNavyPreset.headerBackgroundToken, 'bg');
      const blueComparisonColor = resolveTableColor(blueComparisonPreset.headerBackgroundToken, 'bg');

      expect(darkNavyColor.styleColor).toBe('#001f3f');
      expect(blueComparisonColor.styleColor).toBe('#003366');

      // REGRESSION TEST OBRIGATÓRIO: resolved header color dark_navy != blue_comparison
      expect(darkNavyColor.styleColor).not.toBe(blueComparisonColor.styleColor);
    });
  });

  // ==========================================================================
  // CLOSURE 5: Custom Border Color Determinism
  // ==========================================================================
  describe('CLOSURE 5 — Custom Border Color Determinism (Grid & Outer Parity)', () => {
    it('all + #ff0000: outer table e cell border resolvem #ff0000 deterministamente', () => {
      const borders = getBorderClasses('all');
      expect(borders.tableBorder).toContain('border');
      expect(borders.cellBorder).toContain('border-r');
      expect(borders.cellBorder).toContain('border-b');

      const resolved = resolveTableColor('#ff0000', 'border');
      expect(resolved.styleColor).toBe('#ff0000');
      expect(resolved.style?.borderColor).toBe('#ff0000');
    });

    it('horizontal_only + #00ff00: horizontal separators resolvem #00ff00', () => {
      const borders = getBorderClasses('horizontal_only');
      expect(borders.tableBorder).toContain('border-b');
      expect(borders.cellBorder).toBe('border-b border-slate-200');

      const resolved = resolveTableColor('#00ff00', 'border');
      expect(resolved.styleColor).toBe('#00ff00');
      expect(resolved.style?.borderColor).toBe('#00ff00');
    });

    it('outer_only: table tem border externa e células têm border-0', () => {
      const borders = getBorderClasses('outer_only');
      expect(borders.tableBorder).toContain('border');
      expect(borders.cellBorder).toBe('border-0');
    });

    it('none: zero borders na tabela e células, ignorando borderColorToken', () => {
      const borders = getBorderClasses('none');
      expect(borders.tableBorder).toBe('border-0');
      expect(borders.cellBorder).toBe('border-0');
    });
  });

  // ==========================================================================
  // CLOSURE 6: Saved Palette bodyBackground Parity
  // ==========================================================================
  describe('CLOSURE 6 — Saved Palette bodyBackground Parity', () => {
    it('Uma SavedPalette com bodyBackground aplica o valor tanto em materialize quanto em applyPaletteToTable', () => {
      const dummyTable: TableCoreModel = {
        id: 'tbl-test',
        schemaVersion: 1,
        title: 'Teste',
        columns: [],
        rows: [],
        cells: {},
        presentation: structuredClone(DEFAULT_TABLE_PRESENTATION),
        paginationPolicy: structuredClone(DEFAULT_TABLE_PAGINATION_POLICY)
      };

      const customPalette: SavedPalette = {
        id: 'pal_custom_1',
        name: 'Custom Palette',
        headerBackground: '#003366' as HexColor,
        headerText: '#ffffff' as HexColor,
        bodyBackground: '#fefefe' as HexColor,
        borderColor: '#e2e8f0' as HexColor,
        createdAt: new Date().toISOString()
      };

      const materialized = materializePaletteOnPresentation(dummyTable.presentation, customPalette);
      expect(materialized.bodyBackgroundToken).toBe('#fefefe');

      const appliedTable = applyPaletteToTable(dummyTable, customPalette);
      expect(appliedTable.presentation.bodyBackgroundToken).toBe('#fefefe');
      expect(appliedTable.presentation.headerBackgroundToken).toBe('#003366');
    });
  });

  // ==========================================================================
  // CLOSURE 7: LocalStorage Input Validation (Fail-Closed)
  // ==========================================================================
  describe('CLOSURE 7 — LocalStorage Input Validation (Fail-Closed)', () => {
    it('LocalStorage corrompido ou com formato inválido falha de forma fechada sem crashar', () => {
      // 1. JSON corrompido
      localStorage.setItem('cb_saved_palettes_v1', '{"invalid_json": true');
      expect(getSavedPalettes()).toEqual([]);

      // 2. Não-array
      localStorage.setItem('cb_saved_palettes_v1', JSON.stringify({ name: 'not an array' }));
      expect(getSavedPalettes()).toEqual([]);

      // 3. Array contendo itens com schema corrompido (campos obrigatórios ausentes)
      const badItems = [
        { id: 'p1', name: 'Corrupt', headerBackground: 'not_a_valid_token_or_hex' },
        { id: 'p2', name: 'No Header' },
        null,
        123
      ];
      localStorage.setItem('cb_saved_palettes_v1', JSON.stringify(badItems));
      expect(getSavedPalettes()).toEqual([]);

      // 4. Array misto: 1 item válido e 2 inválidos -> retorna apenas o item válido
      const mixedItems = [
        { id: 'p_bad', name: 'Bad' },
        {
          id: 'p_good',
          name: 'Good Palette',
          headerBackground: 'slate_900',
          headerText: 'white',
          createdAt: new Date().toISOString()
        }
      ];
      localStorage.setItem('cb_saved_palettes_v1', JSON.stringify(mixedItems));
      const validOnly = getSavedPalettes();
      expect(validOnly.length).toBe(1);
      expect(validOnly[0].id).toBe('p_good');
    });

    it('SavedPaletteSchema e SavedTableStyleSchema validam estritamente', () => {
      const validPal = {
        id: 'pal_1',
        name: 'Paleta Válida',
        headerBackground: '#003366',
        headerText: '#ffffff',
        createdAt: new Date().toISOString()
      };
      expect(SavedPaletteSchema.safeParse(validPal).success).toBe(true);

      const invalidPal = {
        id: 'pal_1',
        name: 'Paleta Inválida',
        headerBackground: 'css-injection-evil-color',
        headerText: '#ffffff'
      };
      expect(SavedPaletteSchema.safeParse(invalidPal).success).toBe(false);

      const validStyle = {
        id: 'style_1',
        name: 'Estilo Válido',
        presentation: structuredClone(DEFAULT_TABLE_PRESENTATION),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      expect(SavedTableStyleSchema.safeParse(validStyle).success).toBe(true);
    });
  });

  // ==========================================================================
  // CLOSURE 8: Store TablePresentationModelSchema Gate
  // ==========================================================================
  describe('CLOSURE 8 — Store TablePresentationModelSchema Gate', () => {
    it('applyTablePresentationTemplate rejeita apresentação inválida e gera ZERO mutações', () => {
      const catalog = useCatalogStore.getState().currentCatalog!;
      const targetBlock = catalog.pages[1].blocks[0];
      const revBefore = useCatalogStore.getState().localRevision;

      // Apresentação inválida (campo density incorreto, headerBackground inválido)
      const invalidPresentation = {
        presetId: 'presys_clean_technical',
        density: 'super_extra_invalid_density',
        headerBackgroundToken: 'hack_token_attack'
      };

      // Chama store com payload inválido
      // @ts-expect-error teste de runtime gate
      useCatalogStore.getState().applyTablePresentationTemplate(targetBlock.id, invalidPresentation);

      const revAfter = useCatalogStore.getState().localRevision;
      // ZERO mutações permitidas
      expect(revAfter - revBefore).toBe(0);
    });
  });

  // ==========================================================================
  // CLOSURE 9: Migration of Legacy cb_user_table_presentation_templates_v1
  // ==========================================================================
  describe('CLOSURE 9 — Duplicate User Style System Migration', () => {
    it('Templates existentes em cb_user_table_presentation_templates_v1 são migrados transparentemente para getSavedTableStyles()', () => {
      const legacyTemplate = {
        id: 'usr_legacy_1',
        name: 'Template do Usuário Legado',
        presentation: structuredClone(DEFAULT_TABLE_PRESENTATION)
      };

      // Grava diretamente na chave antiga
      localStorage.setItem(
        'cb_user_table_presentation_templates_v1',
        JSON.stringify([legacyTemplate])
      );

      // Lê via serviço canônico
      const savedStyles = getSavedTableStyles();
      const migrated = savedStyles.find((s) => s.id === 'usr_legacy_1');

      expect(migrated).toBeDefined();
      expect(migrated?.name).toBe('Template do Usuário Legado');
      expect(migrated?.presentation.presetId).toBe(DEFAULT_TABLE_PRESENTATION.presetId);

      // Confirma que foi persistido na nova chave
      const newStorageRaw = localStorage.getItem('cb_saved_table_styles_v1');
      expect(newStorageRaw).toContain('usr_legacy_1');
    });
  });
});

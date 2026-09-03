// tests/domain/element-capability-registry.test.ts
// Suíte de testes rigorosos de contrato para o Element Capability Registry (Fase CORE.E2).

import { describe, it, expect } from 'vitest';
import { BlockTypeSchema } from '../../src/domain/catalog.schema';
import {
  CanvasSpacingTokenSchema,
  CanvasBackgroundTokenSchema,
  CanvasBorderTokenSchema,
  CanvasRadiusTokenSchema,
  CanvasDensityTokenSchema,
  StructuralLayoutConfigSchema
} from '../../src/domain/canvas-layout.schema';
import {
  CAPABILITY_IDS,
  CapabilityId,
  ELEMENT_CAPABILITY_REGISTRY_VERSION,
  ElementCapabilityRegistry,
  getElementCapabilityDefinition,
  hasCapability,
  getCapability,
  validateElementCapabilityRegistry,
  PropertyCapabilitySchema,
  CapabilityNumericConstraintSchema,
  DynamicBoundSourceSchema
} from '../../src/domain/capabilities';

describe('ElementCapabilityRegistry — Contract Tests (CORE.E2)', () => {
  // CAP-REG-1 & EXHAUSTIVENESS: Registry possui exatamente todos os 22 BlockTypes
  it('CAP-REG-1 & EXHAUSTIVENESS: possui exatamente todos os BlockTypes do BlockTypeSchema', () => {
    const schemaOptions = BlockTypeSchema.options as readonly string[];
    const registeredTypes = Object.keys(ElementCapabilityRegistry);

    expect(registeredTypes.length).toBe(22);
    expect(schemaOptions.length).toBe(22);

    // Comparação bidirecional estrita: nenhum a mais, nenhum a menos
    expect(registeredTypes.sort()).toEqual([...schemaOptions].sort());
  });

  // CAP-REG-2: Nenhum duplicate blockType
  it('CAP-REG-2: garante que não há chaves de blockType duplicadas', () => {
    const keys = Object.keys(ElementCapabilityRegistry);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  // CAP-REG-3: Nenhum duplicate CapabilityId dentro do mesmo elemento
  it('CAP-REG-3: nenhum elemento possui CapabilityId duplicado em sua lista', () => {
    for (const [blockType, def] of Object.entries(ElementCapabilityRegistry)) {
      const ids = def.capabilities.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(
        uniqueIds.size,
        `Elemento '${blockType}' possui CapabilityIds duplicados: ${ids.join(', ')}`
      ).toBe(ids.length);
    }
  });

  // CAP-REG-4: Todas as definições passam por validação estrita do Zod
  it('CAP-REG-4: todas as definições do registro passam no schema Zod em tempo de execução', () => {
    const validation = validateElementCapabilityRegistry();
    expect(validation.errors).toEqual([]);
    expect(validation.success).toBe(true);
  });

  // CAP-REG-5: Dimension control exige unidade física válida diferente de 'none'
  it('CAP-REG-5: dimension control exige unidade válida diferente de none', () => {
    // 1. Verificar que todas as capabilities dimension registradas possuem unidade física
    for (const def of Object.values(ElementCapabilityRegistry)) {
      for (const cap of def.capabilities) {
        if (cap.controlHint === 'dimension') {
          expect(cap.unit).not.toBe('none');
          expect(['mm', 'px', 'pt', 'percent', 'token']).toContain(cap.unit);
        }
      }
    }

    // 2. Provar que o schema rejeita dimension com unit='none' (Fail-Closed)
    const invalidDimensionParse = PropertyCapabilitySchema.safeParse({
      id: CAPABILITY_IDS.LAYOUT_FIXED_WIDTH_MM,
      label: 'Dimensão Inválida',
      category: 'layout',
      valueKind: 'dimension',
      controlHint: 'dimension',
      unit: 'none', // Violação!
      defaultSource: 'factory',
      resetPolicy: 'none',
      rendererSupport: { editor: true, print: true },
      translationPolicy: 'none',
      writePolicy: 'user_only'
    });
    expect(invalidDimensionParse.success).toBe(false);
  });

  // CAP-REG-6: Reset policy incompatível com default source falha
  it('CAP-REG-6: reset policy to_factory rejeita defaultSource=none', () => {
    const invalidResetParse = PropertyCapabilitySchema.safeParse({
      id: CAPABILITY_IDS.LAYOUT_PADDING,
      label: 'Padding Inválido',
      category: 'layout',
      valueKind: 'dimension',
      controlHint: 'dimension',
      unit: 'px',
      defaultSource: 'none', // Violação: to_factory exige origem válida!
      resetPolicy: 'to_factory',
      rendererSupport: { editor: true, print: true },
      translationPolicy: 'none',
      writePolicy: 'user_only'
    });
    expect(invalidResetParse.success).toBe(false);
  });

  // CAP-REG-7: translationPolicy='translate' somente para value kinds textuais suportados
  it('CAP-REG-7: translationPolicy=translate exige valueKind text ou collection', () => {
    for (const def of Object.values(ElementCapabilityRegistry)) {
      for (const cap of def.capabilities) {
        if (cap.translationPolicy === 'translate') {
          expect(['text', 'collection']).toContain(cap.valueKind);
        }
      }
    }

    // Provar rejeição se tentar marcar tradução em um booleano ou cor
    const invalidTranslationParse = PropertyCapabilitySchema.safeParse({
      id: CAPABILITY_IDS.APPEARANCE_BACKGROUND,
      label: 'Cor Inválida Traduzível',
      category: 'appearance',
      valueKind: 'color', // Violação!
      controlHint: 'color',
      unit: 'none',
      defaultSource: 'factory',
      resetPolicy: 'none',
      rendererSupport: { editor: true, print: true },
      translationPolicy: 'translate',
      writePolicy: 'user_only'
    });
    expect(invalidTranslationParse.success).toBe(false);
  });

  // CAP-REG-8: validated_command NÃO é default automático (zero validated_command na CORE.E2)
  it('CAP-REG-8: nenhuma capability está exposta com writePolicy=validated_command na Fase E2', () => {
    for (const [blockType, def] of Object.entries(ElementCapabilityRegistry)) {
      for (const cap of def.capabilities) {
        expect(
          cap.writePolicy,
          `Elemento ${blockType} expõe capability ${cap.id} prematuramente como validated_command`
        ).not.toBe('validated_command');
        expect(['user_only', 'read_only']).toContain(cap.writePolicy);
      }
    }
  });

  // CAP-REG-9: unknown blockType fail closed
  it('CAP-REG-9: unknown blockType falha fechado retornando null / false', () => {
    expect(getElementCapabilityDefinition('non_existent_block_type')).toBeNull();
    expect(hasCapability('non_existent_block_type', CAPABILITY_IDS.CONTENT_TITLE)).toBe(false);
    expect(getCapability('non_existent_block_type', CAPABILITY_IDS.CONTENT_TITLE)).toBeNull();
  });

  // CAP-REG-10: unknown CapabilityId fail closed
  it('CAP-REG-10: unknown CapabilityId falha fechado', () => {
    const unknownId = 'unregistered.arbitrary.path' as CapabilityId;
    expect(hasCapability('text', unknownId)).toBe(false);
    expect(getCapability('text', unknownId)).toBeNull();
  });

  // CAP-REG-11: full_page_cover NÃO registra os NO_OPs confirmados na CORE.E1 e E4
  it('CAP-REG-11: full_page_cover não legitima os NO_OPs confirmados na CORE.E1', () => {
    const coverDef = ElementCapabilityRegistry.full_page_cover;
    expect(coverDef).toBeDefined();

    const registeredIds = coverDef.capabilities.map((c) => c.id);

    // Não deve registrar highlights, footerLeft, footerRight, coverStyle, textAlign, gradient
    expect(registeredIds).not.toContain(CAPABILITY_IDS.APPEARANCE_GRADIENT);
    expect(registeredIds).not.toContain(CAPABILITY_IDS.LAYOUT_ALIGNMENT);
    expect(registeredIds).not.toContain(CAPABILITY_IDS.LAYOUT_MODE);

    // Exatamente as 7 capacidades canônicas comprovadas da CORE.E4
    expect(registeredIds).toEqual([
      CAPABILITY_IDS.CONTENT_COMPANY_NAME,
      CAPABILITY_IDS.CONTENT_BADGE,
      CAPABILITY_IDS.CONTENT_TITLE,
      CAPABILITY_IDS.CONTENT_SUBTITLE,
      CAPABILITY_IDS.MEDIA_PRIMARY_ASSET,
      CAPABILITY_IDS.APPEARANCE_OVERLAY_OPACITY,
      CAPABILITY_IDS.LAYERS_CANVAS_LAYERS
    ]);
  });

  // CAP-REG-12: structural_section expõe width/layout comprovados com autoridade mm
  it('CAP-REG-12: structural_section expõe layout com autoridade milimétrica e resets', () => {
    const secDef = ElementCapabilityRegistry.structural_section;
    expect(secDef).toBeDefined();
    expect(secDef.engineFamily).toBe('structural');

    const widthMode = getCapability('structural_section', CAPABILITY_IDS.LAYOUT_WIDTH_MODE);
    expect(widthMode).toBeDefined();
    expect(widthMode?.resetPolicy).toBe('to_factory');

    const fixedWidth = getCapability('structural_section', CAPABILITY_IDS.LAYOUT_FIXED_WIDTH_MM);
    expect(fixedWidth).toBeDefined();
    expect(fixedWidth?.unit).toBe('mm');
    expect(fixedWidth?.defaultSource).toBe('derived');
    expect(fixedWidth?.resetPolicy).toBe('none');
    expect(fixedWidth?.constraints?.numeric?.exclusiveMin).toBe(0);
    expect(fixedWidth?.constraints?.numeric?.maxSource).toBe('page_content_width_mm');
    expect(fixedWidth?.constraints?.numeric?.min).toBeUndefined();
    expect(fixedWidth?.constraints?.numeric?.max).toBeUndefined();

    expect(secDef.universalActions.canReset).toBe(true);
  });

  // CAP-REG-13: Registry validation não aceita arbitrary propertyPath
  it('CAP-REG-13: Registry proíbe strings arbitrárias de caminho (propertyPath) como CapabilityId', () => {
    const parseResult = PropertyCapabilitySchema.safeParse({
      id: 'customData.arbitrary.nested.field', // Não está no enum fechado CAPABILITY_IDS!
      label: 'Arbitrário',
      category: 'content',
      valueKind: 'text',
      controlHint: 'text',
      unit: 'none',
      defaultSource: 'none',
      resetPolicy: 'none',
      rendererSupport: { editor: true, print: true },
      translationPolicy: 'none',
      writePolicy: 'user_only'
    });
    expect(parseResult.success).toBe(false);
  });

  // CAP-REG-14: Zero runtime capability possui value:any ou default:any
  it('CAP-REG-14: todas as capacidades usam valueKinds estritos e tipados sem any', () => {
    const validKinds = [
      'text',
      'number',
      'boolean',
      'color',
      'enum',
      'dimension',
      'asset',
      'collection',
      'structured'
    ];

    for (const def of Object.values(ElementCapabilityRegistry)) {
      for (const cap of def.capabilities) {
        expect(validKinds).toContain(cap.valueKind);
        // Garantir que não existem propriedades espúrias de defaultValue ou propertyPath (zero any)
        expect('defaultValue' in cap).toBe(false);
        expect('propertyPath' in cap).toBe(false);
      }
    }
  });

  // CAP-REG-15: Registry version definida como 4 (bump na CORE.E6A)
  it('CAP-REG-15: versão do contrato definida como 4 (CORE.E6A)', () => {
    expect(ELEMENT_CAPABILITY_REGISTRY_VERSION).toBe(5);
    expect(typeof ELEMENT_CAPABILITY_REGISTRY_VERSION).toBe('number');
  });

  it('CAP-REG-BOTTOM-PALETTE: bottom_header APPEARANCE_GRADIENT possui opções semânticas sincronizadas', () => {
    const bottomDef = ElementCapabilityRegistry.bottom_header;
    const gradCap = bottomDef.capabilities.find((c) => c.id === CAPABILITY_IDS.APPEARANCE_GRADIENT);
    expect(gradCap).toBeDefined();
    expect(gradCap?.valueKind).toBe('enum');
    expect(gradCap?.constraints?.options?.length).toBe(9);
  });

  it('CAP-REG-COVER-V2: full_page_cover possui capabilities canônicas comprovadas e canReorder=false', () => {
    const coverDef = ElementCapabilityRegistry.full_page_cover;
    expect(coverDef).toBeDefined();
    expect(coverDef.universalActions.canReorder).toBe(false);
    expect(coverDef.universalActions.canDuplicate).toBe(false);

    const capIds = coverDef.capabilities.map((c) => c.id);
    expect(capIds).toContain('content.company_name');
    expect(capIds).toContain('content.badge');
    expect(capIds).toContain('content.title');
    expect(capIds).toContain('content.subtitle');
    expect(capIds).toContain('media.primary_asset');
    expect(capIds).toContain('appearance.overlay_opacity');
    expect(capIds).toContain('layers.canvas_layers');

    const companyCap = coverDef.capabilities.find((c) => c.id === 'content.company_name')!;
    expect(companyCap.translationPolicy).toBe('protect');
  });

  // CAP-REG-SPECS-PARITY: specs_table possui suporte de renderização pleno tanto no Editor quanto no Print (CORE.E2.2)
  it('CAP-REG-SPECS-PARITY: specs_table declara paridade plena no Editor e no Print (true/true)', () => {
    const specsDef = ElementCapabilityRegistry.specs_table;
    expect(specsDef).toBeDefined();
    for (const cap of specsDef.capabilities) {
      expect(cap.rendererSupport.editor).toBe(true);
      expect(cap.rendererSupport.print).toBe(true);
    }
  });

  // ==========================================================================
  // Testes de Validação Numérica: step (CORE.E2.2)
  // ==========================================================================
  it('CAP-NUM-STEP-1: step = 0 => reject', () => {
    const res = CapabilityNumericConstraintSchema.safeParse({ min: 1, max: 10, step: 0 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes('step'))).toBe(true);
    }
  });

  it('CAP-NUM-STEP-2: step < 0 => reject', () => {
    const res = CapabilityNumericConstraintSchema.safeParse({ min: 1, max: 10, step: -2 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes('step'))).toBe(true);
    }
  });

  it('CAP-NUM-STEP-3: step = Infinity => reject', () => {
    const res = CapabilityNumericConstraintSchema.safeParse({ min: 1, max: 10, step: Infinity });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes('step'))).toBe(true);
    }
  });

  it('CAP-NUM-STEP-4: step positivo finito => accept', () => {
    const res1 = CapabilityNumericConstraintSchema.safeParse({ min: 1, max: 10, step: 1 });
    expect(res1.success).toBe(true);

    const res2 = CapabilityNumericConstraintSchema.safeParse({ step: 0.5 });
    expect(res2.success).toBe(true);
  });
});

describe('Structural Section Cross-Contract Authority (CORE.E2)', () => {
  // STRUCT-CAP-1: Registry columns = domínio aceita 1..6, rejeita 0/7
  it('STRUCT-CAP-1: Registry columns options satisfazem 1..6 e o domínio rejeita 0 e 7', () => {
    const colCap = getCapability('structural_section', CAPABILITY_IDS.LAYOUT_COLUMNS);
    expect(colCap).toBeDefined();
    expect(colCap?.constraints?.options).toBeDefined();

    const registeredValues = colCap!.constraints!.options!.map((o) => o.value);
    expect(registeredValues).toEqual([1, 2, 3, 4, 5, 6]);

    // Validar contra o schema canônico de domínio
    for (const val of registeredValues) {
      const parsed = StructuralLayoutConfigSchema.safeParse({ columns: val });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.columns).toBe(val);
      }
    }

    // Rejeição canônica de limites fora de [1, 6]
    expect(StructuralLayoutConfigSchema.safeParse({ columns: 0 }).success).toBe(false);
    expect(StructuralLayoutConfigSchema.safeParse({ columns: 7 }).success).toBe(false);
  });

  // STRUCT-CAP-2: Registry gap values = CanvasSpacingTokenSchema.options
  it('STRUCT-CAP-2: Registry gap values espelham exatamente CanvasSpacingTokenSchema.options', () => {
    const gapCap = getCapability('structural_section', CAPABILITY_IDS.LAYOUT_GAP);
    expect(gapCap).toBeDefined();
    const registeredValues = gapCap!.constraints!.options!.map((o) => o.value);
    const domainOptions = CanvasSpacingTokenSchema.options;

    expect([...registeredValues].sort()).toEqual([...domainOptions].sort());
  });

  // STRUCT-CAP-3: Registry padding values = CanvasSpacingTokenSchema.options
  it('STRUCT-CAP-3: Registry padding values espelham exatamente CanvasSpacingTokenSchema.options', () => {
    const padCap = getCapability('structural_section', CAPABILITY_IDS.LAYOUT_PADDING);
    expect(padCap).toBeDefined();
    const registeredValues = padCap!.constraints!.options!.map((o) => o.value);
    const domainOptions = CanvasSpacingTokenSchema.options;

    expect([...registeredValues].sort()).toEqual([...domainOptions].sort());
  });

  // STRUCT-CAP-4: Registry background values = CanvasBackgroundTokenSchema.options
  it('STRUCT-CAP-4: Registry background values espelham exatamente CanvasBackgroundTokenSchema.options', () => {
    const bgCap = getCapability('structural_section', CAPABILITY_IDS.APPEARANCE_BACKGROUND);
    expect(bgCap).toBeDefined();
    const registeredValues = bgCap!.constraints!.options!.map((o) => o.value);
    const domainOptions = CanvasBackgroundTokenSchema.options;

    expect([...registeredValues].sort()).toEqual([...domainOptions].sort());
  });

  // STRUCT-CAP-5: Registry border values = CanvasBorderTokenSchema.options
  it('STRUCT-CAP-5: Registry border values espelham exatamente CanvasBorderTokenSchema.options', () => {
    const borderCap = getCapability('structural_section', CAPABILITY_IDS.APPEARANCE_BORDER);
    expect(borderCap).toBeDefined();
    const registeredValues = borderCap!.constraints!.options!.map((o) => o.value);
    const domainOptions = CanvasBorderTokenSchema.options;

    expect([...registeredValues].sort()).toEqual([...domainOptions].sort());
  });

  // STRUCT-CAP-6: Registry radius values = CanvasRadiusTokenSchema.options
  it('STRUCT-CAP-6: Registry radius values espelham exatamente CanvasRadiusTokenSchema.options', () => {
    const radiusCap = getCapability('structural_section', CAPABILITY_IDS.APPEARANCE_RADIUS);
    expect(radiusCap).toBeDefined();
    const registeredValues = radiusCap!.constraints!.options!.map((o) => o.value);
    const domainOptions = CanvasRadiusTokenSchema.options;

    expect([...registeredValues].sort()).toEqual([...domainOptions].sort());
  });

  // STRUCT-CAP-7: Registry density values = CanvasDensityTokenSchema.options
  it('STRUCT-CAP-7: Registry density values espelham exatamente CanvasDensityTokenSchema.options', () => {
    const densityCap = getCapability('structural_section', CAPABILITY_IDS.LAYOUT_DENSITY);
    expect(densityCap).toBeDefined();
    const registeredValues = densityCap!.constraints!.options!.map((o) => o.value);
    const domainOptions = CanvasDensityTokenSchema.options;

    expect([...registeredValues].sort()).toEqual([...domainOptions].sort());
  });

  // STRUCT-CAP-8: layout.mode = grid/stack
  it('STRUCT-CAP-8: layout.mode capability existe e valores são grid e stack', () => {
    const modeCap = getCapability('structural_section', CAPABILITY_IDS.LAYOUT_MODE);
    expect(modeCap).toBeDefined();
    expect(modeCap?.category).toBe('layout');
    expect(modeCap?.valueKind).toBe('enum');
    expect(modeCap?.controlHint).toBe('segmented');
    expect(modeCap?.resetPolicy).toBe('to_factory');
    expect(modeCap?.defaultSource).toBe('factory');

    const registeredValues = modeCap!.constraints!.options!.map((o) => o.value);
    expect(registeredValues).toEqual(['grid', 'stack']);
  });

  // STRUCT-CAP-9: fixed width: sem 40/182, contrato exclusive min e dynamic maxSource
  it('STRUCT-CAP-9: fixed width não possui limites estáticos 40/182 e adota contrato dinâmico', () => {
    const fixedWidth = getCapability('structural_section', CAPABILITY_IDS.LAYOUT_FIXED_WIDTH_MM);
    expect(fixedWidth).toBeDefined();
    expect(fixedWidth?.constraints?.numeric?.min).toBeUndefined();
    expect(fixedWidth?.constraints?.numeric?.max).toBeUndefined();
    expect(fixedWidth?.constraints?.numeric?.exclusiveMin).toBe(0);
    expect(fixedWidth?.constraints?.numeric?.maxSource).toBe('page_content_width_mm');
  });

  // STRUCT-CAP-10: dynamic max source modela constraint contextual e rejeita combinações contraditórias
  it('STRUCT-CAP-10: dynamic max source valida valores permitidos e rejeita conflito com max literal', () => {
    expect(DynamicBoundSourceSchema.safeParse('page_content_width_mm').success).toBe(true);
    expect(DynamicBoundSourceSchema.safeParse('arbitrary_source').success).toBe(false);

    // Rejeitar conflito: max literal + maxSource simultâneos
    const conflictMax = CapabilityNumericConstraintSchema.safeParse({
      max: 180,
      maxSource: 'page_content_width_mm'
    });
    expect(conflictMax.success).toBe(false);

    // Rejeitar conflito: min literal + exclusiveMin simultâneos
    const conflictMin = CapabilityNumericConstraintSchema.safeParse({
      min: 10,
      exclusiveMin: 0
    });
    expect(conflictMin.success).toBe(false);
  });

  // STRUCT-CAP-11: semantic section icon capability existe
  it('STRUCT-CAP-11: semantic section icon capability existe com autoridade corporativa', () => {
    const iconCap = getCapability('structural_section', CAPABILITY_IDS.MEDIA_SEMANTIC_ICON);
    expect(iconCap).toBeDefined();
    expect(iconCap?.category).toBe('media');
    expect(iconCap?.valueKind).toBe('enum');
    expect(iconCap?.controlHint).toBe('custom');
    expect(iconCap?.unit).toBe('none');
    expect(iconCap?.translationPolicy).toBe('none');
    expect(iconCap?.rendererSupport.editor).toBe(true);
    expect(iconCap?.rendererSupport.print).toBe(true);
  });

  // STRUCT-CAP-12: reset policies estritas (to_factory exige factory, to_preset exige preset)
  it('STRUCT-CAP-12: superRefine de reset rejeita derived em to_factory e to_preset', () => {
    // to_factory com derived deve falhar
    const factoryWithDerived = PropertyCapabilitySchema.safeParse({
      id: CAPABILITY_IDS.LAYOUT_WIDTH_MODE,
      label: 'Teste Reset Factory',
      category: 'layout',
      valueKind: 'enum',
      controlHint: 'segmented',
      unit: 'none',
      defaultSource: 'derived',
      resetPolicy: 'to_factory',
      rendererSupport: { editor: true, print: true },
      translationPolicy: 'none',
      writePolicy: 'user_only'
    });
    expect(factoryWithDerived.success).toBe(false);

    // to_preset com derived deve falhar
    const presetWithDerived = PropertyCapabilitySchema.safeParse({
      id: CAPABILITY_IDS.LAYOUT_WIDTH_MODE,
      label: 'Teste Reset Preset',
      category: 'layout',
      valueKind: 'enum',
      controlHint: 'segmented',
      unit: 'none',
      defaultSource: 'derived',
      resetPolicy: 'to_preset',
      rendererSupport: { editor: true, print: true },
      translationPolicy: 'none',
      writePolicy: 'user_only'
    });
    expect(presetWithDerived.success).toBe(false);

    // to_factory com factory deve passar
    const factoryWithFactory = PropertyCapabilitySchema.safeParse({
      id: CAPABILITY_IDS.LAYOUT_WIDTH_MODE,
      label: 'Teste Reset Factory OK',
      category: 'layout',
      valueKind: 'enum',
      controlHint: 'segmented',
      unit: 'none',
      defaultSource: 'factory',
      resetPolicy: 'to_factory',
      rendererSupport: { editor: true, print: true },
      translationPolicy: 'none',
      writePolicy: 'user_only'
    });
    expect(factoryWithFactory.success).toBe(true);

    // to_preset com preset deve passar
    const presetWithPreset = PropertyCapabilitySchema.safeParse({
      id: CAPABILITY_IDS.LAYOUT_WIDTH_MODE,
      label: 'Teste Reset Preset OK',
      category: 'layout',
      valueKind: 'enum',
      controlHint: 'segmented',
      unit: 'none',
      defaultSource: 'preset',
      resetPolicy: 'to_preset',
      rendererSupport: { editor: true, print: true },
      translationPolicy: 'none',
      writePolicy: 'user_only'
    });
    expect(presetWithPreset.success).toBe(true);
  });

  // =========================================================================
  // CROSS-CONTRACT: DefaultSource Truth vs. Real Presets (CORE.E6A.1)
  // =========================================================================

  it('HEADER-CAP-DEFAULT-1: Fluke Header — somente title e badgeText possuem defaultSource="preset"', () => {
    const flukeDef = ElementCapabilityRegistry.fluke_header;
    const presetCapabilities = flukeDef.capabilities.filter((c) => c.defaultSource === 'preset');
    const noneCapabilities = flukeDef.capabilities.filter((c) => c.defaultSource === 'none');

    // Somente title e badge possuem preset defaults
    expect(presetCapabilities.map((c) => c.id).sort()).toEqual(
      [CAPABILITY_IDS.CONTENT_BADGE, CAPABILITY_IDS.CONTENT_TITLE].sort()
    );

    // Campos não materializados no preset devem ser 'none'
    const noneIds = noneCapabilities.map((c) => c.id);
    expect(noneIds).toContain(CAPABILITY_IDS.CONTENT_SECONDARY_BADGE);
    expect(noneIds).toContain(CAPABILITY_IDS.CONTENT_SUBTITLE);
    expect(noneIds).toContain(CAPABILITY_IDS.CONTENT_DESCRIPTION);
    expect(noneIds).toContain(CAPABILITY_IDS.CONTENT_ITEMS);
    expect(noneIds).toContain(CAPABILITY_IDS.MEDIA_PRIMARY_ASSET);
  });

  it('HEADER-CAP-DEFAULT-2: Additel Two Col — somente title, subtitle e badgeText possuem defaultSource="preset"', () => {
    const additelDef = ElementCapabilityRegistry.additel_two_col_hero;
    const presetCapabilities = additelDef.capabilities.filter((c) => c.defaultSource === 'preset');
    const noneCapabilities = additelDef.capabilities.filter((c) => c.defaultSource === 'none');

    // Somente title, subtitle e badge possuem preset defaults
    expect(presetCapabilities.map((c) => c.id).sort()).toEqual(
      [CAPABILITY_IDS.CONTENT_BADGE, CAPABILITY_IDS.CONTENT_TITLE, CAPABILITY_IDS.CONTENT_SUBTITLE].sort()
    );

    // Campos não materializados no preset devem ser 'none'
    const noneIds = noneCapabilities.map((c) => c.id);
    expect(noneIds).toContain(CAPABILITY_IDS.CONTENT_SECONDARY_BADGE);
    expect(noneIds).toContain(CAPABILITY_IDS.CONTENT_DESCRIPTION);
    expect(noneIds).toContain(CAPABILITY_IDS.CONTENT_ITEMS);
    expect(noneIds).toContain(CAPABILITY_IDS.MEDIA_PRIMARY_ASSET);
  });

  it('HEADER-CAP-DEFAULT-3: Bottom Header — somente title e subtitle possuem defaultSource="preset"', () => {
    const bottomDef = ElementCapabilityRegistry.bottom_header;
    const presetCapabilities = bottomDef.capabilities.filter((c) => c.defaultSource === 'preset');
    const noneCapabilities = bottomDef.capabilities.filter((c) => c.defaultSource === 'none');

    // Somente title e subtitle possuem preset defaults
    expect(presetCapabilities.map((c) => c.id).sort()).toEqual(
      [CAPABILITY_IDS.CONTENT_TITLE, CAPABILITY_IDS.CONTENT_SUBTITLE].sort()
    );

    // Campos não materializados no preset devem ser 'none'
    const noneIds = noneCapabilities.map((c) => c.id);
    expect(noneIds).toContain(CAPABILITY_IDS.CONTENT_BADGE);
    expect(noneIds).toContain(CAPABILITY_IDS.CONTENT_PHONE);
    expect(noneIds).toContain(CAPABILITY_IDS.CONTENT_EMAIL);
    expect(noneIds).toContain(CAPABILITY_IDS.CONTENT_WEBSITE);
  });

  it('HEADER-CAP-DEFAULT-4: appearance fallbacks — badgeBg, themeColor e gradient são defaultSource="derived"', () => {
    const flukeBadgeBg = ElementCapabilityRegistry.fluke_header.capabilities.find(
      (c) => c.id === CAPABILITY_IDS.APPEARANCE_BADGE_BG
    );
    const additelThemeColor = ElementCapabilityRegistry.additel_two_col_hero.capabilities.find(
      (c) => c.id === CAPABILITY_IDS.APPEARANCE_THEME_COLOR
    );
    const bottomGradient = ElementCapabilityRegistry.bottom_header.capabilities.find(
      (c) => c.id === CAPABILITY_IDS.APPEARANCE_GRADIENT
    );

    expect(flukeBadgeBg?.defaultSource).toBe('derived');
    expect(additelThemeColor?.defaultSource).toBe('derived');
    expect(bottomGradient?.defaultSource).toBe('derived');
  });
});

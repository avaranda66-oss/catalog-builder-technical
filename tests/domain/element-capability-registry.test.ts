// tests/domain/element-capability-registry.test.ts
// Suíte de testes rigorosos de contrato para o Element Capability Registry (Fase CORE.E2).

import { describe, it, expect } from 'vitest';
import { BlockTypeSchema } from '../../src/domain/catalog.schema';
import {
  CAPABILITY_IDS,
  CapabilityId,
  ELEMENT_CAPABILITY_REGISTRY_VERSION,
  ElementCapabilityRegistry,
  getElementCapabilityDefinition,
  hasCapability,
  getCapability,
  validateElementCapabilityRegistry,
  PropertyCapabilitySchema
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

  // CAP-REG-11: full_page_cover NÃO registra os NO_OPs confirmados
  it('CAP-REG-11: full_page_cover não legitima os NO_OPs confirmados na CORE.E1', () => {
    const coverDef = ElementCapabilityRegistry.full_page_cover;
    expect(coverDef).toBeDefined();

    const registeredIds = coverDef.capabilities.map((c) => c.id);

    // Não deve registrar highlights, footerLeft, footerRight, coverStyle, textAlign, gradient
    expect(registeredIds).not.toContain(CAPABILITY_IDS.APPEARANCE_GRADIENT);
    expect(registeredIds).not.toContain(CAPABILITY_IDS.CONTENT_SUBTITLE);

    // Apenas capacidades conservadoras comprovadas
    expect(registeredIds).toEqual([
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
    expect(fixedWidth?.resetPolicy).toBe('to_preset');
    expect(fixedWidth?.constraints?.numeric?.min).toBe(40);
    expect(fixedWidth?.constraints?.numeric?.max).toBe(182);

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
        // Garantir que não existem propriedades espúrias de defaultValue ou propertyPath
        expect((cap as any).defaultValue).toBeUndefined();
        expect((cap as any).propertyPath).toBeUndefined();
      }
    }
  });

  // CAP-REG-15: Registry version definida como 1
  it('CAP-REG-15: versão do contrato definida como 1', () => {
    expect(ELEMENT_CAPABILITY_REGISTRY_VERSION).toBe(1);
    expect(typeof ELEMENT_CAPABILITY_REGISTRY_VERSION).toBe('number');
  });

  // Teste de Integridade Documental: specs_table reflete a realidade de Drift (editor=false, print=true)
  it('CAP-REG-SPECS: specs_table declara honestamente a ausência no Editor e presença no Print', () => {
    const specsDef = ElementCapabilityRegistry.specs_table;
    expect(specsDef).toBeDefined();
    for (const cap of specsDef.capabilities) {
      expect(cap.rendererSupport.editor).toBe(false);
      expect(cap.rendererSupport.print).toBe(true);
    }
  });
});

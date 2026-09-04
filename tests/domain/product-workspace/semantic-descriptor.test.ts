// tests/domain/product-workspace/semantic-descriptor.test.ts
import { describe, it, expect } from 'vitest';
import {
  createSemanticDescriptor,
  updateDisplayLabel,
  addAlias,
  removeAlias,
  matchesSemanticQuery,
  planCanonicalRename
} from '../../../src/domain/product-workspace/semantics';
import { ProductWorkbookV2, createWorkbook, ensureWorkbookV2, addModule, addDatum } from '../../../src/domain/product-workbook';

describe('Semantic Descriptor & Canonical Rename Safety', () => {
  it('cria descritor semântico com chave canônica estável e label editável', () => {
    const desc = createSemanticDescriptor({
      canonicalKey: 'metrology.temperature.stability',
      displayLabel: 'Estabilidade Térmica',
      aliases: ['estabilidade', 'deriva']
    });

    expect(desc.canonicalKey).toBe('metrology.temperature.stability');
    expect(desc.displayLabel).toBe('Estabilidade Térmica');
    expect(desc.aliases).toContain('estabilidade');
  });

  it('permite alterar o displayLabel humano preservando 100% a canonicalKey', () => {
    const original = createSemanticDescriptor({
      canonicalKey: 'metrology.temperature.stability',
      displayLabel: 'Estabilidade Térmica'
    });

    const updated = updateDisplayLabel(original, 'Estabilidade de Bloco Seco');

    expect(updated.canonicalKey).toBe('metrology.temperature.stability'); // Imutável!
    expect(updated.displayLabel).toBe('Estabilidade de Bloco Seco');
    // Antigo label é preservado como alias para não quebrar buscas
    expect(updated.aliases).toContain('Estabilidade Térmica');
  });

  it('gerencia adição e remoção de aliases com normalização e sem duplicatas', () => {
    let desc = createSemanticDescriptor({
      canonicalKey: 'ta.sensor.rtd.pt100',
      displayLabel: 'Termorresistência Pt-100'
    });

    desc = addAlias(desc, 'Pt100');
    desc = addAlias(desc, 'RTD Pt-100');
    desc = addAlias(desc, 'Pt100'); // Duplicata

    expect(desc.aliases.length).toBe(2);
    expect(desc.aliases).toContain('Pt100');

    desc = removeAlias(desc, 'Pt100');
    expect(desc.aliases).not.toContain('Pt100');
    expect(desc.aliases).toContain('RTD Pt-100');
  });

  it('reconhece termos de busca por label, chave canônica e aliases', () => {
    const desc = createSemanticDescriptor({
      canonicalKey: 'electrical.inputs.thermocouple.j',
      displayLabel: 'Termopar Tipo J',
      aliases: ['TC-J', 'termopar J']
    });

    expect(matchesSemanticQuery(desc, 'Termopar')).toBe(true);
    expect(matchesSemanticQuery(desc, 'TC-J')).toBe(true);
    expect(matchesSemanticQuery(desc, 'thermocouple.j')).toBe(true);
    expect(matchesSemanticQuery(desc, 'Pt-100')).toBe(false);
  });

  describe('Canonical Rename Planner (10-Step Safety Engine)', () => {
    function setupTestWorkbook(): ProductWorkbookV2 {
      let wb = ensureWorkbookV2(
        createWorkbook({
          id: 'wb-test',
          owner: { kind: 'product', id: 'TA-25N' },
          revision: 1
        })
      );

      wb = ensureWorkbookV2(
        addModule(wb, {
          id: 'mod-metrology',
          semanticKey: 'metrology.general',
          label: 'Metrologia',
          kind: 'key_value',
          order: 0
        })
      );

      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: 'metrology.temperature.stability',
            moduleId: 'mod-metrology',
            label: 'Estabilidade',
            value: { type: 'quantity', amount: 0.05, unit: '°C' },
            evidence: [],
            status: 'verified'
          },
          'datum-stab-1'
        )
      );

      return wb;
    }

    it('planeja renomeação com sucesso mapeando dados afetados e gerando rollback', () => {
      const wb = setupTestWorkbook();

      const plan = planCanonicalRename({
        workbook: wb,
        oldCanonicalKey: 'metrology.temperature.stability',
        newCanonicalKey: 'metrology.thermal.stability',
        rationale: 'Adequação ao vocabulário metrológico internacional VIM',
        plannedBy: 'engenharia@presys.com.br'
      });

      expect(plan.isValid).toBe(true);
      expect(plan.validationErrors.length).toBe(0);
      expect(plan.affectedDatumIds).toContain('datum-stab-1');
      expect(plan.aliasPreserved).toBe(true);
      expect(plan.collisionCheck.hasCollision).toBe(false);
      expect(plan.rollbackPlan.canRollback).toBe(true);
      expect(plan.rollbackPlan.instructions).toContain('metrology.temperature.stability');
    });

    it('rejeita plano se a nova chave colidir com datum existente (fail-closed)', () => {
      let wb = setupTestWorkbook();
      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: 'metrology.thermal.stability',
            moduleId: 'mod-metrology',
            label: 'Existente',
            value: { type: 'text', value: 'existente' },
            evidence: [],
            status: 'draft'
          },
          'datum-existing'
        )
      );

      const plan = planCanonicalRename({
        workbook: wb,
        oldCanonicalKey: 'metrology.temperature.stability',
        newCanonicalKey: 'metrology.thermal.stability',
        rationale: 'Tentativa com chave em colisão'
      });

      expect(plan.isValid).toBe(false);
      expect(plan.collisionCheck.hasCollision).toBe(true);
      expect(plan.validationErrors.some((e) => e.includes('Colisão detectada'))).toBe(true);
    });

    it('rejeita plano se a nova chave for sintaticamente inválida', () => {
      const wb = setupTestWorkbook();

      const plan = planCanonicalRename({
        workbook: wb,
        oldCanonicalKey: 'metrology.temperature.stability',
        newCanonicalKey: 'CHAVE_INVALIDA_SEM_PONTOS',
        rationale: 'Tentativa inválida'
      });

      expect(plan.isValid).toBe(false);
      expect(plan.validationErrors.some((e) => e.includes('é inválida'))).toBe(true);
    });
  });
});

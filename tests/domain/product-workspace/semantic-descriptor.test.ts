// tests/domain/product-workspace/semantic-descriptor.test.ts
import { describe, it, expect } from 'vitest';
import {
  createSemanticDescriptor,
  updateDisplayLabel,
  addAlias,
  removeAlias,
  matchesSemanticQuery,
  planCanonicalRename,
  validateSemanticRegistry,
  createProductSemanticRegistry,
  registerSemanticDescriptor,
  addCanonicalAlias,
  removeCanonicalAlias
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

  describe('Semantic Registry Validation & Idempotency (Amendments A & K)', () => {
    it('valida registro semântico com relatório próprio e códigos dedicados', () => {
      const reg = {
        schemaVersion: 1 as const,
        owner: { kind: 'product' as const, id: 'TA-25N' },
        revision: 1,
        descriptors: {
          'metrology.temp.range': createSemanticDescriptor({
            canonicalKey: 'metrology.temp.range',
            displayLabel: 'Faixa de Temperatura',
            aliases: ['temp.range', 'faixa']
          }),
          // Inconsistência de chave do mapa vs canonicalKey
          'metrology.temp.accuracy': createSemanticDescriptor({
            canonicalKey: 'metrology.temp.exactness',
            displayLabel: 'Exatidão'
          }),
          // Colisão de alias com chave canônica existente
          'metrology.temp.stability': createSemanticDescriptor({
            canonicalKey: 'metrology.temp.stability',
            displayLabel: 'Estabilidade',
            aliases: ['metrology.temp.range'] // Colide com chave canônica!
          })
        },
        createdAt: '2026-09-04T00:00:00Z',
        updatedAt: '2026-09-04T00:00:00Z'
      };

      const report = validateSemanticRegistry(reg);
      expect(report.isValid).toBe(false);
      expect(report.errors.some((e) => e.code === 'DESCRIPTOR_KEY_MISMATCH')).toBe(true);
      expect(report.errors.some((e) => e.code === 'ALIAS_CANONICAL_COLLISION')).toBe(true);
    });

    it('re-registrar descritor idêntico é NO-OP sem subida de revisão (Emenda K)', () => {
      const initial = createProductSemanticRegistry({ productId: 'TA-25N', revision: 1 });
      const desc = createSemanticDescriptor({
        canonicalKey: 'metrology.accuracy',
        displayLabel: 'Exatidão'
      });

      const updated = registerSemanticDescriptor(initial, desc);
      expect(updated.revision).toBe(2);

      // Re-registro idêntico: não deve alterar objeto nem subir revisão
      const noOp = registerSemanticDescriptor(updated, desc);
      expect(noOp).toBe(updated);
      expect(noOp.revision).toBe(2);
    });

    it('adicionar alias existente ou remover alias inexistente é NO-OP (Emenda K)', () => {
      const initial = createProductSemanticRegistry({ productId: 'TA-25N', revision: 1 });
      const desc = createSemanticDescriptor({
        canonicalKey: 'metrology.accuracy',
        displayLabel: 'Exatidão',
        aliases: ['precisão']
      });

      const withDesc = registerSemanticDescriptor(initial, desc);
      expect(withDesc.revision).toBe(2);

      // Adicionar alias que já existe
      const duplicateAlias = addCanonicalAlias(withDesc, 'metrology.accuracy', 'precisão');
      expect(duplicateAlias).toBe(withDesc);
      expect(duplicateAlias.revision).toBe(2);

      // Remover alias que não existe
      const nonExistentRemove = removeCanonicalAlias(withDesc, 'metrology.accuracy', 'alias_fantasma');
      expect(nonExistentRemove).toBe(withDesc);
      expect(nonExistentRemove.revision).toBe(2);
    });
  });
});

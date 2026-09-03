// tests/domain/product-workbook/operations-and-scale.test.ts
// Test suite covering fail-closed domain operations, immutability, and scale benchmarks.

import { describe, it, expect } from 'vitest';
import {
  createWorkbook,
  addModule,
  addDatum,
  createOverride,
  resolveEffectiveProductKnowledge,
  compareResolvedProducts,
  ProductWorkbook
} from '../../../src/domain/product-workbook';

describe('PIM.W1 — Domain Operations & Scale Fixtures', () => {
  // =========================================================================
  // FAIL-CLOSED-1: Rejeição de chaves semânticas duplicadas
  // =========================================================================
  it('FAIL-CLOSED-1: addDatum rejeita duplicata de semanticKey no mesmo workbook', () => {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'p1' } });
    wb = addModule(wb, { id: 'm1', semanticKey: 'spec.mod', label: 'Módulo', kind: 'key_value', order: 1 });

    wb = addDatum(wb, {
      semanticKey: 'spec.sensor.type',
      moduleId: 'm1',
      label: 'Tipo de Sensor',
      value: { type: 'text', value: 'PT100' },
      evidence: [],
      status: 'approved'
    });

    expect(() => {
      addDatum(wb, {
        semanticKey: 'spec.sensor.type', // DUPLICADO!
        moduleId: 'm1',
        label: 'Tipo de Sensor Duplicado',
        value: { type: 'text', value: 'Termopar' },
        evidence: [],
        status: 'draft'
      });
    }).toThrowError(/DUPLICATE_DATUM_KEY/);
  });

  // =========================================================================
  // FAIL-CLOSED-2: Rejeição de moduleId inexistente
  // =========================================================================
  it('FAIL-CLOSED-2: addDatum rejeita inclusão em moduleId inexistente', () => {
    const wb = createWorkbook({ owner: { kind: 'product', id: 'p1' } });

    expect(() => {
      addDatum(wb, {
        semanticKey: 'spec.standalone.value',
        moduleId: 'mod_non_existent',
        label: 'Dado Órfão',
        value: { type: 'number', value: 42 },
        evidence: [],
        status: 'draft'
      });
    }).toThrowError(/MODULE_NOT_FOUND/);
  });

  // =========================================================================
  // FAIL-CLOSED-3: Overrides rejeitados em workbooks de Família
  // =========================================================================
  it('FAIL-CLOSED-3: createOverride rejeita invocação em workbooks de Família', () => {
    const famWb = createWorkbook({ owner: { kind: 'family', id: 'fam-1' } });

    expect(() => {
      createOverride(famWb, {
        targetSemanticKey: 'spec.family.val',
        mode: 'override',
        overriddenValue: { type: 'text', value: 'invalid' }
      });
    }).toThrowError(/INVALID_OWNER/);
  });

  // =========================================================================
  // IMMUTABILITY-1: Todas as operações preservam o objeto original intacto
  // =========================================================================
  it('IMMUTABILITY-1: addDatum incrementa revision e não muta a instância anterior', () => {
    let wbOriginal = createWorkbook({ owner: { kind: 'product', id: 'p1' } });
    wbOriginal = addModule(wbOriginal, { id: 'm1', semanticKey: 'spec.mod', label: 'Mod', kind: 'key_value', order: 1 });
    const revisionBefore = wbOriginal.revision;

    const wbModified = addDatum(wbOriginal, {
      semanticKey: 'spec.mod.field',
      moduleId: 'm1',
      label: 'Campo',
      value: { type: 'text', value: 'Valor' },
      evidence: [],
      status: 'approved'
    });

    expect(wbModified.revision).toBe(revisionBefore + 1);
    expect(Object.keys(wbOriginal.data).length).toBe(0); // Original permaneceu vazio!
    expect(Object.keys(wbModified.data).length).toBe(1);
  });

  // =========================================================================
  // SCALE-FIXTURE: 10 Workbooks × centenas de dados técnicos (PIM Scale Benchmark)
  // =========================================================================
  it('SCALE-FIXTURE: resolve herança e compara 10 workbooks com centenas de dados em milissegundos sem mutação', () => {
    const startTime = performance.now();

    // 1. Cria Família com 5 módulos e 10 dados cada (50 dados da família)
    let famWb = createWorkbook({ id: 'fam-scale-1', owner: { kind: 'family', id: 'fam-root' } });
    for (let m = 1; m <= 5; m++) {
      famWb = addModule(famWb, {
        id: `fam-m-${m}`,
        semanticKey: `domain.module_scale_${m}`,
        label: `Módulo Escala ${m}`,
        kind: 'key_value',
        order: m
      });

      for (let d = 1; d <= 10; d++) {
        famWb = addDatum(famWb, {
          semanticKey: `domain.module_scale_${m}.field_${d}`,
          moduleId: `fam-m-${m}`,
          label: `Campo F-${m}-${d}`,
          value: { type: 'quantity', amount: m * 100 + d, unit: 'bar' },
          evidence: [],
          status: 'approved'
        });
      }
    }

    expect(Object.keys(famWb.data).length).toBe(50);

    // 2. Cria 9 Produtos com herança da família + 10 dados locais cada + 5 overrides
    const productWorkbooks: ProductWorkbook[] = [];

    for (let p = 1; p <= 9; p++) {
      let prodWb = createWorkbook({
        id: `prod-scale-${p}`,
        owner: { kind: 'product', id: `product-uuid-${p}` }
      });

      // Módulo local
      prodWb = addModule(prodWb, {
        id: `prod-${p}-local-m`,
        semanticKey: `prod_${p}.custom_module`,
        label: `Módulo Customizado P${p}`,
        kind: 'key_value',
        order: 10
      });

      // 10 Dados locais
      for (let ld = 1; ld <= 10; ld++) {
        prodWb = addDatum(prodWb, {
          semanticKey: `prod_${p}.custom_module.item_${ld}`,
          moduleId: `prod-${p}-local-m`,
          label: `Item P${p}-${ld}`,
          value: { type: 'text', value: `V-${p}-${ld}` },
          evidence: [],
          status: 'approved'
        });
      }

      // 5 Overrides em dados da família
      for (let ov = 1; ov <= 5; ov++) {
        prodWb = createOverride(prodWb, {
          targetSemanticKey: `domain.module_scale_1.field_${ov}`,
          mode: 'override',
          overriddenValue: { type: 'quantity', amount: 9990 + ov + p, unit: 'bar' },
          overriddenStatus: 'approved'
        });
      }

      productWorkbooks.push(prodWb);
    }

    // 3. Resolução de Conhecimento Efetivo para os 9 produtos
    const resolvedProducts = productWorkbooks.map((pw) => ({
      productId: pw.owner.id,
      knowledge: resolveEffectiveProductKnowledge({
        familyWorkbook: famWb,
        productWorkbook: pw
      })
    }));

    // Cada produto deve ter 50 herdados + 10 locais = 60 fatos efetivos
    for (const rp of resolvedProducts) {
      expect(rp.knowledge.effectiveData.size).toBe(60);
    }

    // 4. Comparação Multi-Produto da Matriz Completa
    const matrix = compareResolvedProducts(resolvedProducts);
    expect(matrix.productIds.length).toBe(9);
    // 50 chaves da família + (9 produtos × 10 chaves locais) = 140 chaves distintas
    expect(matrix.rows.length).toBe(140);

    const elapsedMs = performance.now() - startTime;

    // Deve executar sem esforço quadrático e resolver centenas de fatos em menos de 500ms
    expect(elapsedMs).toBeLessThan(500);
  });
});

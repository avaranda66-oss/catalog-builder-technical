// tests/domain/product-workspace/mega-workspace-view-model.test.ts
// Unit tests for Mega Workspace Pure Production ViewModel & Adapter.
// Verifies Amendments B, D, E, G, H, I, J, L.

import { describe, it, expect } from 'vitest';
import {
  buildMegaWorkspaceViewModel,
  collectReferencedSourceDocumentIds
} from '../../../src/domain/product-workspace/view-model';
import {
  createWorkbook,
  ensureWorkbookV2,
  addModule,
  addDatum,
  ProductWorkbookV2
} from '../../../src/domain/product-workbook';
import { SourceDocument } from '../../../src/domain/product-workbook/types';

describe('Mega Workspace Production ViewModel & Adapter', () => {
  function createTestFamilyWorkbook(): ProductWorkbookV2 {
    let wb = ensureWorkbookV2(
      createWorkbook({
        id: 'fam-ta',
        owner: { kind: 'family', id: 'TA' },
        revision: 5
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
          semanticKey: 'metrology.temperature.range',
          moduleId: 'mod-metrology',
          label: 'Faixa de Temperatura',
          value: { type: 'range', lower: -25, upper: 155, unit: '°C' },
          evidence: [
            {
              id: 'ev-family-1',
              sourceDocumentId: 'doc-manual-ta',
              page: 12,
              section: 'Especificações Técnicas',
              observedValue: { type: 'range', lower: -25, upper: 155, unit: '°C' }
            }
          ],
          status: 'verified'
        },
        'datum-range-1'
      )
    );

    wb = ensureWorkbookV2(
      addDatum(
        wb,
        {
          semanticKey: 'metrology.accuracy',
          moduleId: 'mod-metrology',
          label: 'Exatidão',
          value: { type: 'quantity', amount: 0.1, unit: '°C' },
          evidence: [],
          status: 'approved'
        },
        'datum-acc-1'
      )
    );

    return wb;
  }

  // Test 23 & 24 & 34: Family-only product properties & Product field mapping
  it('garante que produto family-only tem hasProductWorkbook=false, productRevision=undefined e nunca expõe revision 0 (Emenda B)', () => {
    const familyWb = createTestFamilyWorkbook();
    const product = {
      id: 'prod-ta25n',
      model: 'TA-25N',
      code: 'TA-25N-CODE',
      family_id: 'fam-ta'
    };
    const family = {
      id: 'fam-ta',
      name: 'Família TA'
    };

    const vm = buildMegaWorkspaceViewModel({
      product,
      family,
      productWorkbook: null, // Family-only!
      familyWorkbook: familyWb
    });

    // Test 23: hasProductWorkbook stays false
    expect(vm.product.hasProductWorkbook).toBe(false);
    expect(vm.product.isFamilyOnly).toBe(true);

    // Test 24: persisted revision remains undefined (never revision 0)
    expect(vm.product.productRevision).toBeUndefined();
    expect(vm.product.familyRevision).toBe(5);

    // Test 34: Product field mapping (model -> displayName, code -> code, family.name -> familyLabel)
    expect(vm.product.displayName).toBe('TA-25N');
    expect(vm.product.code).toBe('TA-25N-CODE');
    expect(vm.product.familyLabel).toBe('Família TA');

    // Fatos devem ser herdados com segurança
    expect(vm.metrics.knowledgeFactsCount).toBe(2);
    expect(Object.keys(vm.factsById).length).toBe(2);
  });

  // Test 25 & 26: Simple Mode publishing policy protects verified family from draft override
  it('protege a verdade verificada da família contra draft override em Simple View (Emenda G)', () => {
    const familyWb = createTestFamilyWorkbook();

    // Produto com um override em draft que tenta alterar a faixa de temperatura
    let prodWb = ensureWorkbookV2(
      createWorkbook({
        id: 'wb-prod-ta25n',
        owner: { kind: 'product', id: 'prod-ta25n' },
        revision: 2
      })
    );

    prodWb = {
      ...prodWb,
      overrides: {
        'metrology.temperature.range': {
          targetSemanticKey: 'metrology.temperature.range',
          mode: 'override',
          overriddenValue: { type: 'range', lower: -30, upper: 160, unit: '°C' },
          overriddenStatus: 'draft',
          evidence: []
        }
      }
    };

    const vm = buildMegaWorkspaceViewModel({
      product: { id: 'prod-ta25n', model: 'TA-25N' },
      family: { id: 'fam-ta', name: 'Família TA' },
      productWorkbook: prodWb,
      familyWorkbook: familyWb,
      session: {
        interactionMode: 'view',
        detailLevel: 'simple'
      }
    });

    // Encontra o fato de faixa de temperatura
    const rangeFact = Object.values(vm.factsById).find(
      (f) => f.semanticKey === 'metrology.temperature.range'
    );
    expect(rangeFact).toBeDefined();

    // Test 25: O valor factual seguro da família NÃO é substituído pelo draft
    expect(rangeFact?.formattedValue).toContain('-25 a 155 °C');

    // Test 26: O override pendente é sinalizado para auditoria humana sem substituir o valor
    expect(rangeFact?.isPendingOverride).toBe(true);
    expect(rangeFact?.pendingOverrideValue).toContain('-30 a 160 °C');
  });

  // Test 27: No legacy product.specs fallback
  it('exibe empty state sem fallback para product.specs quando não há dados PIM (Emenda H)', () => {
    const vm = buildMegaWorkspaceViewModel({
      product: {
        id: 'prod-legacy',
        model: 'Legacy-100',
        code: 'LEG-100'
      },
      family: null,
      productWorkbook: null,
      familyWorkbook: null
    });

    expect(vm.isEmptyState).toBe(true);
    expect(vm.metrics.knowledgeFactsCount).toBe(0);
    expect(Object.keys(vm.factsById).length).toBe(0);
    expect(vm.sections.length).toBe(0);
  });

  // Test 28: Source fetch uses exact referenced IDs
  it('coleta exatamente os IDs de fontes referenciados pelas evidências (Emenda D)', () => {
    const familyWb = createTestFamilyWorkbook();
    const effectiveKnowledge = {
      productId: 'prod-ta25n',
      effectiveData: new Map([
        [
          'metrology.temperature.range',
          {
            datum: Object.values(familyWb.data)[0],
            origin: 'family' as const,
            effectiveStatus: 'verified' as const,
            overrideMode: 'inherit' as const
          }
        ]
      ]),
      effectiveDatasets: new Map(),
      conflictsCount: 0,
      suppressedKeys: [],
      hasProductWorkbook: false
    };

    const referencedIds = collectReferencedSourceDocumentIds(effectiveKnowledge as any);
    expect(referencedIds).toEqual(['doc-manual-ta']);
    expect(referencedIds.length).toBe(1);
  });

  // Test 29: Missing SourceDocument does not fabricate provenance (fail-soft)
  it('marca proveniência incompleta e documento indisponível sem inventar metadados quando fonte falta (Emenda L & E)', () => {
    const familyWb = createTestFamilyWorkbook();
    const sourceDocs: SourceDocument[] = []; // Nenhuma fonte carregada na lista

    const vm = buildMegaWorkspaceViewModel({
      product: { id: 'prod-ta25n', model: 'TA-25N' },
      family: { id: 'fam-ta', name: 'Família TA' },
      productWorkbook: null,
      familyWorkbook: familyWb,
      sourceDocuments: sourceDocs
    });

    const rangeFact = Object.values(vm.factsById).find(
      (f) => f.semanticKey === 'metrology.temperature.range'
    );
    expect(rangeFact).toBeDefined();
    // Test 29: Proveniência incompleta sinalizada
    expect(rangeFact?.provenanceIncomplete).toBe(true);

    const missingDoc = vm.sourcesById['doc-manual-ta'];
    expect(missingDoc).toBeDefined();
    expect(missingDoc.title).toBe('Documento de origem indisponível');
    expect(missingDoc.isUnavailable).toBe(true);
    // Emenda E: Zero fabricated confidence / attributes
    expect((missingDoc as any).confidence).toBeUndefined();
  });

  // Test: TechnicalValue is direct domain type (Amendment I)
  it('preserva TechnicalValue com a tipagem e variantes do domínio (Emenda I)', () => {
    const familyWb = createTestFamilyWorkbook();
    const vm = buildMegaWorkspaceViewModel({
      product: { id: 'prod-ta25n', model: 'TA-25N' },
      family: { id: 'fam-ta', name: 'Família TA' },
      productWorkbook: null,
      familyWorkbook: familyWb
    });

    const rangeFact = Object.values(vm.factsById).find(
      (f) => f.semanticKey === 'metrology.temperature.range'
    );
    expect(rangeFact?.technicalValue.type).toBe('range');
    if (rangeFact?.technicalValue.type === 'range') {
      expect(rangeFact.technicalValue.lower).toBe(-25);
      expect(rangeFact.technicalValue.upper).toBe(155);
      expect(rangeFact.technicalValue.unit).toBe('°C');
    }
  });
});

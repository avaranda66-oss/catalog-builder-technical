// tests/domain/product-workbook/revision-semantics.test.ts
// Test suite covering Phase PIM.W1.2: Product Workbook Revision & CAS Concurrency Semantics.
//
// Regras Centrais:
// 1. ProductWorkbook.revision representa a versão autoritativa persistida do servidor (CAS token).
// 2. Mutações puras de domínio NÃO incrementam revision; preservam o valor N intacto.
// 3. Somente a autoridade de persistência avança N -> N+1 em commits bem-sucedidos.
// 4. Dirty state e contagem de mutações locais pertencem ao pipeline de edição/save, nunca ao workbook canônico.

import { describe, it, expect } from 'vitest';
import {
  createWorkbook,
  addModule,
  addDatum,
  attachEvidence,
  setCanonicalDecision,
  approveDatum,
  createSavedView,
  createOverride,
  resolveEffectiveProductKnowledge,
  getProductKnowledgeSnapshot,
  parseProductWorkbook,
  validateProductWorkbook
} from '../../../src/domain/product-workbook';

describe('PIM.W1.2 — Product Workbook Revision & CAS Semantics Suite', () => {
  // =========================================================================
  // PIM-REV-1: createWorkbook com revision default 0
  // =========================================================================
  it('PIM-REV-1: createWorkbook inicializa com revision 0 por padrão ou aceita revision inicial explicitada', () => {
    // Default 0
    const wbDefault = createWorkbook({ owner: { kind: 'product', id: 'prod-rev-1' } });
    expect(wbDefault.revision).toBe(0);

    // Explícita (ex: workbook carregado da persistência com revisão conhecida)
    const wbExplicit = createWorkbook({
      owner: { kind: 'product', id: 'prod-rev-1-custom' },
      revision: 42
    });
    expect(wbExplicit.revision).toBe(42);
  });

  // =========================================================================
  // PIM-REV-2: workbook com revision 7 permanece 7 após addModule
  // =========================================================================
  it('PIM-REV-2: workbook carregado/criado com revision 7 permanece revision 7 depois de addModule', () => {
    const serverRevision = 7;
    const wbLoaded = createWorkbook({
      owner: { kind: 'product', id: 'prod-rev-2' },
      revision: serverRevision
    });

    expect(wbLoaded.revision).toBe(7);

    const wbWithModule = addModule(wbLoaded, {
      id: 'mod-specs',
      semanticKey: 'hardware.specs',
      label: 'Especificações Técnicas',
      kind: 'key_value',
      order: 1
    });

    // Invariante PIM.W1.2: mutações locais puras NÃO alteram a revisão do servidor
    expect(wbWithModule.revision).toBe(serverRevision);
    expect(wbWithModule.revision).toBe(7);
  });

  // =========================================================================
  // PIM-REV-3: sequência multi-operação preserva revision N
  // =========================================================================
  it('PIM-REV-3: sequência completa de 6 mutações de domínio preserva estritamente revision N', () => {
    const N = 15;
    let wb = createWorkbook({ owner: { kind: 'product', id: 'prod-rev-3' }, revision: N });
    expect(wb.revision).toBe(N);

    // 1. addModule
    wb = addModule(wb, {
      id: 'm-power',
      semanticKey: 'electrical.power',
      label: 'Alimentação Elétrica',
      kind: 'key_value',
      order: 1
    });
    expect(wb.revision).toBe(N);

    // 2. addDatum
    wb = addDatum(
      wb,
      {
        semanticKey: 'electrical.voltage.nominal',
        moduleId: 'm-power',
        label: 'Tensão Nominal',
        value: { type: 'quantity', amount: 24, unit: 'V' },
        evidence: [],
        status: 'draft'
      },
      'd-voltage'
    );
    expect(wb.revision).toBe(N);

    // 3. attachEvidence
    wb = attachEvidence(wb, 'd-voltage', {
      id: 'ev-manual-p12',
      sourceDocumentId: 'doc-user-manual',
      page: 12,
      observedValue: { type: 'quantity', amount: 24, unit: 'V' }
    });
    expect(wb.revision).toBe(N);

    // 4. canonicalDecision
    wb = setCanonicalDecision(wb, 'd-voltage', {
      kind: 'selected_evidence',
      selectedEvidenceId: 'ev-manual-p12',
      rationale: 'Confirmado no manual do fabricante página 12.',
      decidedAt: '2026-09-01T10:00:00Z'
    });
    expect(wb.revision).toBe(N);

    // 5. approveDatum
    wb = approveDatum(wb, 'd-voltage', 'engineer-tester');
    expect(wb.revision).toBe(N);

    // 6. savedView
    wb = createSavedView(wb, {
      id: 'view-elec',
      name: 'Resumo Elétrico',
      datumKeys: ['electrical.voltage.nominal']
    });
    expect(wb.revision).toBe(N);

    // 7. createOverride
    wb = createOverride(wb, {
      targetSemanticKey: 'fam.inherited.spec',
      mode: 'override',
      overriddenValue: { type: 'text', value: 'Valor Customizado do Produto' },
      notes: 'Override local no produto'
    });
    expect(wb.revision).toBe(N);
  });

  // =========================================================================
  // PIM-REV-4: immutability continua verdadeira mesmo sem revision++
  // =========================================================================
  it('PIM-REV-4: immutability estrutural e de referências continua estritamente garantida sem mutação in-place', () => {
    const wbInitial = createWorkbook({ owner: { kind: 'product', id: 'prod-immut' }, revision: 3 });
    const wbWithMod = addModule(wbInitial, {
      id: 'm-dim',
      semanticKey: 'physical.dimensions',
      label: 'Dimensões',
      kind: 'key_value',
      order: 1
    });

    // 1. Instâncias são referencialmente diferentes (imutabilidade)
    expect(wbWithMod).not.toBe(wbInitial);
    expect(wbWithMod.modules).not.toBe(wbInitial.modules);

    // 2. Instância inicial permaneceu totalmente intacta
    expect(wbInitial.modules.length).toBe(0);
    expect(wbWithMod.modules.length).toBe(1);

    // 3. Reversão de CAS: ambas compartilham o mesmo token de servidor
    expect(wbInitial.revision).toBe(3);
    expect(wbWithMod.revision).toBe(3);
  });

  // =========================================================================
  // PIM-REV-5: serialize -> parse preserva revision exatamente
  // =========================================================================
  it('PIM-REV-5: serialização JSON e deserialização Zod preservam o token de revisão exatamente', () => {
    let wb = createWorkbook({ owner: { kind: 'product', id: 'prod-ser' }, revision: 99 });
    wb = addModule(wb, { id: 'm1', semanticKey: 'spec.mod', label: 'Mod', kind: 'key_value', order: 1 });
    wb = addDatum(
      wb,
      {
        semanticKey: 'spec.mod.d1',
        moduleId: 'm1',
        label: 'Dado',
        value: { type: 'text', value: 'Valor de Teste' },
        evidence: [],
        status: 'approved'
      },
      'd1'
    );

    const serialized = JSON.stringify(wb);
    const parsed = parseProductWorkbook(JSON.parse(serialized));

    expect(parsed.revision).toBe(99);
    expect(parsed.revision).toBe(wb.revision);
  });

  // =========================================================================
  // PIM-REV-6: inheritance/resolution não altera revision
  // =========================================================================
  it('PIM-REV-6: resolução de herança efetiva não altera os tokens de revisão dos workbooks envolvidos', () => {
    const famWb = createWorkbook({ owner: { kind: 'family', id: 'fam-rev' }, revision: 4 });
    const prodWb = createWorkbook({ owner: { kind: 'product', id: 'prod-rev' }, revision: 12 });

    const resolved = resolveEffectiveProductKnowledge({
      familyWorkbook: famWb,
      productWorkbook: prodWb
    });

    // Workbooks originais permanecem inalterados
    expect(famWb.revision).toBe(4);
    expect(prodWb.revision).toBe(12);

    // Objeto resolvido expõe as revisões persistidas originais correspondentes
    expect(resolved.productRevision).toBe(12);
    expect(resolved.familyRevision).toBe(4);
  });

  // =========================================================================
  // PIM-REV-7: knowledge snapshot referencia a revision do workbook persistido
  // =========================================================================
  it('PIM-REV-7: knowledge snapshot referencia a revision do workbook persistido, não uma contagem arbitrária de mutations', () => {
    const famRev = 8;
    const prodRev = 25;

    // 1. Família com dado aprovado
    let famWb = createWorkbook({ owner: { kind: 'family', id: 'fam-7' }, revision: famRev });
    famWb = addModule(famWb, { id: 'mf', semanticKey: 'fam.specs', label: 'Fam Specs', kind: 'key_value', order: 1 });
    famWb = addDatum(
      famWb,
      {
        semanticKey: 'fam.specs.material',
        moduleId: 'mf',
        label: 'Material da Carcaça',
        value: { type: 'text', value: 'Inox 316L' },
        evidence: [{ id: 'ev-fam', sourceDocumentId: 'doc-fam', observedValue: { type: 'text', value: 'Inox 316L' } }],
        status: 'approved'
      },
      'd-fam-mat'
    );

    // 2. Produto com dado local aprovado
    let prodWb = createWorkbook({ owner: { kind: 'product', id: 'prod-7' }, revision: prodRev });
    prodWb = addModule(prodWb, { id: 'mp', semanticKey: 'prod.specs', label: 'Prod Specs', kind: 'key_value', order: 2 });
    prodWb = addDatum(
      prodWb,
      {
        semanticKey: 'prod.specs.serial',
        moduleId: 'mp',
        label: 'Número de Série',
        value: { type: 'text', value: 'SN-2026-999' },
        evidence: [{ id: 'ev-prod', sourceDocumentId: 'doc-prod', observedValue: { type: 'text', value: 'SN-2026-999' } }],
        status: 'approved'
      },
      'd-prod-sn'
    );

    const effective = resolveEffectiveProductKnowledge({
      familyWorkbook: famWb,
      productWorkbook: prodWb
    });

    const snapshot = getProductKnowledgeSnapshot({ effectiveKnowledge: effective });

    expect(snapshot.productRevision).toBe(prodRev);
    expect(snapshot.productRevision).toBe(25);

    // Fato originado do produto referencia prodRev (25)
    const prodFact = snapshot.facts.get('prod.specs.serial');
    expect(prodFact).toBeDefined();
    expect(prodFact?.origin).toBe('product_local');
    expect(prodFact?.revision).toBe(25);

    // Fato originado da família referencia famRev (8)
    const famFact = snapshot.facts.get('fam.specs.material');
    expect(famFact).toBeDefined();
    expect(famFact?.origin).toBe('family');
    expect(famFact?.revision).toBe(8);
  });

  // =========================================================================
  // PIM-REV-8: validateProductWorkbook aprova corretos e rejeita adulterações
  // =========================================================================
  it('PIM-REV-8: validateProductWorkbook aprova revisões inteiras >= 0 e rejeita adulterações de tipo/sinal', () => {
    const wbValid = createWorkbook({ owner: { kind: 'product', id: 'prod-v' }, revision: 0 });
    expect(validateProductWorkbook(wbValid).valid).toBe(true);

    const wbValidHigh = createWorkbook({ owner: { kind: 'product', id: 'prod-v2' }, revision: 10000 });
    expect(validateProductWorkbook(wbValidHigh).valid).toBe(true);

    // Rejeição de revisão negativa
    const wbNegative = {
      ...wbValid,
      revision: -1
    };
    const resNegative = validateProductWorkbook(wbNegative as any);
    expect(resNegative.valid).toBe(false);
    expect(resNegative.errors.some((e) => e.code === 'INVALID_REVISION')).toBe(true);

    // Rejeição de número com casas decimais (float)
    const wbFloat = {
      ...wbValid,
      revision: 1.5
    };
    const resFloat = validateProductWorkbook(wbFloat as any);
    expect(resFloat.valid).toBe(false);
    expect(resFloat.errors.some((e) => e.code === 'INVALID_REVISION')).toBe(true);

    // Rejeição de string / tipo inválido
    const wbString = {
      ...wbValid,
      revision: 'v1'
    };
    const resString = validateProductWorkbook(wbString as any);
    expect(resString.valid).toBe(false);
    expect(resString.errors.some((e) => e.code === 'INVALID_REVISION')).toBe(true);
  });
});

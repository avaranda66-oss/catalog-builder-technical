// tests/domain/page-composition-policy.test.ts
// Testes Unitários da Política Pura de Composição de Páginas e Recuperação (Fase 3A.6)

import { describe, it, expect } from 'vitest';
import { CatalogPage } from '../../src/domain/catalog.schema';
import {
  evaluatePageCompositionInsertion,
  evaluateMixedCoverRecovery
} from '../../src/domain/page-composition-policy';

describe('Fase 3A.6 — Page Composition Policy (Domain Pure Functions)', () => {
  const emptyPage: CatalogPage = {
    id: 'page-empty',
    pageNumber: 1,
    title: 'Folha 1',
    blocks: []
  };

  const normalPage: CatalogPage = {
    id: 'page-normal',
    pageNumber: 1,
    title: 'Folha Técnica',
    blocks: [
      { id: 'b-text', type: 'text', textContent: 'Texto técnico' },
      { id: 'b-table', type: 'table' }
    ]
  };

  const coverOnlyPage: CatalogPage = {
    id: 'page-cover',
    pageNumber: 1,
    title: 'Capa',
    blocks: [
      { id: 'b-cover', type: 'full_page_cover', title: 'Capa Editorial A4' }
    ]
  };

  const mixedPage: CatalogPage = {
    id: 'page-mixed',
    pageNumber: 1,
    title: 'Mista',
    blocks: [
      { id: 'b-cover-1', type: 'full_page_cover', title: 'Capa' },
      { id: 'b-sec-1', type: 'structural_section' }
    ]
  };

  const multiCoverPage: CatalogPage = {
    id: 'page-multi-cover',
    pageNumber: 1,
    title: 'Multi Cover',
    blocks: [
      { id: 'b-cover-1', type: 'full_page_cover', title: 'Capa 1' },
      { id: 'b-cover-2', type: 'full_page_cover', title: 'Capa 2' },
      { id: 'b-sec-1', type: 'structural_section' }
    ]
  };

  // ==========================================================================
  // 1. evaluatePageCompositionInsertion (Simetria de Inserção)
  // ==========================================================================

  it('FULLCOVER-POLICY-1: página vazia aceita qualquer tipo de bloco com segurança', () => {
    expect(evaluatePageCompositionInsertion(emptyPage, 'full_page_cover')).toEqual({ isSafe: true });
    expect(evaluatePageCompositionInsertion(emptyPage, 'structural_section')).toEqual({ isSafe: true });
    expect(evaluatePageCompositionInsertion(emptyPage, 'text')).toEqual({ isSafe: true });
    expect(evaluatePageCompositionInsertion(emptyPage, 'table')).toEqual({ isSafe: true });
  });

  it('FULLCOVER-POLICY-2: página com blocos normais rejeita incoming full_page_cover (Simetria)', () => {
    const result = evaluatePageCompositionInsertion(normalPage, 'full_page_cover');
    expect(result.isSafe).toBe(false);
    if (!result.isSafe) {
      expect(result.reason).toBe('INCOMING_COVER_ON_NON_EMPTY_PAGE');
    }
  });

  it('FULLCOVER-POLICY-3: página com capa inteira rejeita incoming bloco de fluxo (Tabela, Seção, Texto)', () => {
    const resTable = evaluatePageCompositionInsertion(coverOnlyPage, 'table');
    expect(resTable.isSafe).toBe(false);
    if (!resTable.isSafe) {
      expect(resTable.reason).toBe('EXISTING_COVER_WITH_FLOW_BLOCK');
    }

    const resSec = evaluatePageCompositionInsertion(coverOnlyPage, 'structural_section');
    expect(resSec.isSafe).toBe(false);
    if (!resSec.isSafe) {
      expect(resSec.reason).toBe('EXISTING_COVER_WITH_FLOW_BLOCK');
    }

    const resImg = evaluatePageCompositionInsertion(coverOnlyPage, 'image');
    expect(resImg.isSafe).toBe(false);
    if (!resImg.isSafe) {
      expect(resImg.reason).toBe('EXISTING_COVER_WITH_FLOW_BLOCK');
    }
  });

  it('FULLCOVER-POLICY-4: página já mista rejeita inserções adicionais', () => {
    const result = evaluatePageCompositionInsertion(mixedPage, 'text');
    expect(result.isSafe).toBe(false);
    if (!result.isSafe) {
      expect(result.reason).toBe('PAGE_ALREADY_MIXED');
    }
  });

  it('FULLCOVER-POLICY-5: página com blocos normais aceita incoming blocos normais', () => {
    expect(evaluatePageCompositionInsertion(normalPage, 'structural_section')).toEqual({ isSafe: true });
    expect(evaluatePageCompositionInsertion(normalPage, 'text')).toEqual({ isSafe: true });
    expect(evaluatePageCompositionInsertion(normalPage, 'box')).toEqual({ isSafe: true });
  });

  // ==========================================================================
  // 2. evaluateMixedCoverRecovery (Elegibilidade Estrita de Recuperação)
  // ==========================================================================

  it('RECOVERY-POLICY-1: página com exatamente 1 capa e >= 1 bloco não-capa é elegível', () => {
    const evalRes = evaluateMixedCoverRecovery(mixedPage);
    expect(evalRes.eligible).toBe(true);
    expect(evalRes.coverCount).toBe(1);
    expect(evalRes.nonCoverCount).toBe(1);
  });

  it('RECOVERY-POLICY-2: página vazia ou só com blocos normais NÃO é elegível', () => {
    expect(evaluateMixedCoverRecovery(emptyPage).eligible).toBe(false);
    expect(evaluateMixedCoverRecovery(normalPage).eligible).toBe(false);
  });

  it('RECOVERY-POLICY-3: página contendo apenas 1 capa e zero blocos normais NÃO é elegível', () => {
    const evalRes = evaluateMixedCoverRecovery(coverOnlyPage);
    expect(evalRes.eligible).toBe(false);
    expect(evalRes.coverCount).toBe(1);
    expect(evalRes.nonCoverCount).toBe(0);
  });

  it('RECOVERY-POLICY-4: página com múltiplas capas inteiras falha fechado (Fail-Closed, eligible = false)', () => {
    const evalRes = evaluateMixedCoverRecovery(multiCoverPage);
    expect(evalRes.eligible).toBe(false);
    expect(evalRes.coverCount).toBe(2);
    expect(evalRes.nonCoverCount).toBe(1);
  });
});

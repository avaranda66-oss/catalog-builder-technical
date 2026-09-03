import { describe, it, expect } from 'vitest';
import { resolveFamilySelectionAfterDelete, slugifyFamilyName } from '../../src/domain/family-selection.helper';
import { ProductFamily } from '../../src/domain/product.schema';

describe('LIB.F1 — resolveFamilySelectionAfterDelete (Deterministic Contract)', () => {
  const mockFamilies: ProductFamily[] = [
    { id: 'fam-1', name: 'Família Alpha', slug: 'familia-alpha', sort_order: 1, created_at: '', updated_at: '' },
    { id: 'fam-2', name: 'Família Beta', slug: 'familia-beta', sort_order: 2, created_at: '', updated_at: '' },
    { id: 'fam-3', name: 'Família Gamma', slug: 'familia-gamma', sort_order: 3, created_at: '', updated_at: '' }
  ];

  it('CONTRACT-1: Se a família excluída NÃO era a selecionada, mantém a seleção atual inalterada', () => {
    // Selecionada é Gamma, exclui Alpha
    const result = resolveFamilySelectionAfterDelete(mockFamilies, 'fam-1', 'Família Gamma');
    expect(result).toBe('Família Gamma');

    // Selecionada é Beta, exclui Gamma
    const result2 = resolveFamilySelectionAfterDelete(mockFamilies, 'fam-3', 'Família Beta');
    expect(result2).toBe('Família Beta');
  });

  it('CONTRACT-2: Se a família selecionada for excluída e houver vizinho à direita, seleciona a próxima à direita', () => {
    // Selecionada é Alpha (índice 0), exclui Alpha -> próxima à direita é Beta (novo índice 0)
    const result = resolveFamilySelectionAfterDelete(mockFamilies, 'fam-1', 'Família Alpha');
    expect(result).toBe('Família Beta');

    // Selecionada é Beta (índice 1), exclui Beta -> próxima à direita é Gamma (novo índice 1)
    const result2 = resolveFamilySelectionAfterDelete(mockFamilies, 'fam-2', 'Família Beta');
    expect(result2).toBe('Família Gamma');
  });

  it('CONTRACT-3: Se a família selecionada for a ÚLTIMA da lista (sem vizinho à direita), seleciona a anterior (à esquerda)', () => {
    // Selecionada é Gamma (índice 2, última), exclui Gamma -> seleciona a anterior: Beta
    const result = resolveFamilySelectionAfterDelete(mockFamilies, 'fam-3', 'Família Gamma');
    expect(result).toBe('Família Beta');
  });

  it('CONTRACT-4: Se a ÚNICA família remanescente for excluída, retorna string vazia (Empty State)', () => {
    const singleFamily: ProductFamily[] = [
      { id: 'fam-lone', name: 'Única Família', slug: 'unica-familia', sort_order: 1, created_at: '', updated_at: '' }
    ];

    const result = resolveFamilySelectionAfterDelete(singleFamily, 'fam-lone', 'Única Família');
    expect(result).toBe('');
  });

  it('CONTRACT-5: Reconhece a seleção tanto por nome quanto por ID ou slug', () => {
    // Por ID
    const byId = resolveFamilySelectionAfterDelete(mockFamilies, 'fam-1', 'fam-1');
    expect(byId).toBe('Família Beta');

    // Por Slug
    const bySlug = resolveFamilySelectionAfterDelete(mockFamilies, 'fam-1', 'familia-alpha');
    expect(bySlug).toBe('Família Beta');
  });

  it('CONTRACT-6: Retorna currentSelected se o ID a excluir não existir na lista', () => {
    const result = resolveFamilySelectionAfterDelete(mockFamilies, 'fam-inexistente', 'Família Alpha');
    expect(result).toBe('Família Alpha');
  });
});

describe('LIB.F1 — slugifyFamilyName', () => {
  it('gera slug canônico removendo acentos e caracteres especiais', () => {
    expect(slugifyFamilyName('Transmissores de Pressão Relativa')).toBe('transmissores-de-pressao-relativa');
    expect(slugifyFamilyName('Válvulas & Conexões (1/2")')).toBe('valvulas-conexoes-1-2');
    expect(slugifyFamilyName('  Espaços Extras  ')).toBe('espacos-extras');
  });
});

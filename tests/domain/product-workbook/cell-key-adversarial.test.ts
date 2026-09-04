// tests/domain/product-workbook/cell-key-adversarial.test.ts
// Bateria de testes adversariais para getDatasetCellKey e parseDatasetCellKey (PIM.PRODUCTION.CORE1.1).
// Prova a reversibilidade determinística e imunidade a colisões sob tokens perigosos (|c, :, ::, |, unicode, whitespace).

import { describe, it, expect } from 'vitest';
import { getDatasetCellKey, parseDatasetCellKey } from '../../../src/domain/product-workbook';

describe('Dataset Cell Key Parser — Adversarial & Collision Safety', () => {
  const adversarialTokens = [
    '|c',
    ':',
    '::',
    '|',
    'row|c_with_embedded_token',
    'col:with:multiple:colons',
    'complex|c::with::both::tokens|c',
    'unicode_teste_calibração_°C_±0.05',
    '日本語_モデル_123',
    'العربية_معايرة',
    'with spaces in id',
    '  leading_and_trailing_spaces  ',
    'r10:fake_inner_key|c20:fake_col',
    'Special@#$%^&*()_+~`{}[]<>?'
  ];

  it('PARSER-ADV-1: Reversibilidade 100% perfeita para combinações cruzadas de tokens adversariais', () => {
    for (const rowId of adversarialTokens) {
      for (const colId of adversarialTokens) {
        const key = getDatasetCellKey(rowId, colId);
        const parsed = parseDatasetCellKey(key);

        expect(parsed.rowId).toBe(rowId);
        expect(parsed.columnId).toBe(colId);
      }
    }
  });

  it('PARSER-ADV-2: Sobrevive especificamente quando rowId contém exatamente o token "|c"', () => {
    const dangerousRowId = 'my_row|c_danger';
    const regularColId = 'col_01';

    const key = getDatasetCellKey(dangerousRowId, regularColId);
    expect(key).toBe(`r${dangerousRowId.length}:${dangerousRowId}|c${regularColId.length}:${regularColId}`);

    const parsed = parseDatasetCellKey(key);
    expect(parsed.rowId).toBe(dangerousRowId);
    expect(parsed.columnId).toBe(regularColId);
  });

  it('PARSER-ADV-3: Sobrevive quando rowId e colId são compostos unicamente de ":" e "|c"', () => {
    const rowId = ':::|c:::';
    const colId = '|c|c:::';

    const key = getDatasetCellKey(rowId, colId);
    const parsed = parseDatasetCellKey(key);

    expect(parsed.rowId).toBe(rowId);
    expect(parsed.columnId).toBe(colId);
  });

  it('PARSER-ADV-4: Rejeita chaves malformadas ou corrompidas de forma fail-closed', () => {
    // Não começa com 'r'
    expect(() => parseDatasetCellKey('x10:row|c10:col')).toThrow(/deve iniciar com "r"/);

    // Sem delimitador :
    expect(() => parseDatasetCellKey('r10row|c10col')).toThrow(/delimitador de tamanho da linha ausente/);

    // Comprimento total insuficiente para o tamanho de linha declarado
    expect(() => parseDatasetCellKey('r10:short')).toThrow(/tamanho insuficiente/);

    // Delimitador |c ausente na posição calculada
    expect(() => parseDatasetCellKey('r10:short|c5:col01')).toThrow(/delimitador "\|c" não encontrado/);
    expect(() => parseDatasetCellKey('r5:row01X5:col01')).toThrow(/delimitador "\|c" não encontrado/);

    // Comprimento da coluna incompatível
    expect(() => parseDatasetCellKey('r5:row01|c10:short_col')).toThrow(/tamanho de coluna incompatível/);
  });
});

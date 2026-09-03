// tests/domain/table-core/cell-key.test.ts
// Testes Adversariais do Contrato de Chaves de Célula (Collision-Safe Cell Key Contract).

import { describe, it, expect } from 'vitest';
import { getCellKey, parseCellKey } from '../../../src/domain/table-core';

describe('Table Core V2: Collision-Safe Cell Key Contract', () => {
  it('CELL-KEY-1: Identificadores simples geram chaves determinísticas e reversíveis', () => {
    const k1 = getCellKey('row_1', 'col_1');
    const k2 = getCellKey('row_1', 'col_1');

    expect(k1).toBe(k2);
    expect(k1).toBe('r5:row_1|c5:col_1');

    const parsed = parseCellKey(k1);
    expect(parsed).toEqual({ rowId: 'row_1', columnId: 'col_1' });
  });

  it('CELL-KEY-2: Candidato a colisão por delimitador ("a::b" e "c" vs "a" e "b::c") produz chaves diferentes', () => {
    const key1 = getCellKey('a::b', 'c');
    const key2 = getCellKey('a', 'b::c');

    expect(key1).toBe('r4:a::b|c1:c');
    expect(key2).toBe('r1:a|c4:b::c');
    expect(key1).not.toBe(key2);

    expect(parseCellKey(key1)).toEqual({ rowId: 'a::b', columnId: 'c' });
    expect(parseCellKey(key2)).toEqual({ rowId: 'a', columnId: 'b::c' });
  });

  it('CELL-KEY-3: Identificadores com caracteres Unicode e símbolos complexos são preservados e reversíveis', () => {
    const rowId = 'linha_°C_±0.05';
    const colId = 'col_Ω_µA';

    const key = getCellKey(rowId, colId);
    expect(key).toBe(`r${rowId.length}:${rowId}|c${colId.length}:${colId}`);

    const parsed = parseCellKey(key);
    expect(parsed).toEqual({ rowId, columnId: colId });
  });

  it('CELL-KEY-4: Identificadores vazios são estritamente rejeitados com exceção explícita', () => {
    expect(() => getCellKey('', 'col_1')).toThrow('Coordenadas de célula não podem ser vazias');
    expect(() => getCellKey('row_1', '')).toThrow('Coordenadas de célula não podem ser vazias');
    expect(() => getCellKey('', '')).toThrow('Coordenadas de célula não podem ser vazias');
  });

  it('CELL-KEY-5: Bateria determinística de 10.000 pares de coordenadas produz zero duplicatas de chave', () => {
    const seenKeys = new Set<string>();
    const totalPairs = 10000;

    for (let i = 0; i < totalPairs; i++) {
      const rowId = `r_${i % 100}_sub_${i % 7}`;
      const colId = `c_${Math.floor(i / 100)}_k`;

      const key = getCellKey(rowId, colId);
      expect(seenKeys.has(key)).toBe(false);
      seenKeys.add(key);

      const parsed = parseCellKey(key);
      expect(parsed).toEqual({ rowId, columnId: colId });
    }

    expect(seenKeys.size).toBe(totalPairs);
  });
});

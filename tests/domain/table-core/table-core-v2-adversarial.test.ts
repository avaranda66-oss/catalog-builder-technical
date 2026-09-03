// tests/domain/table-core/table-core-v2-adversarial.test.ts
// Testes Adversariais e Casos de Borda para Table Core V2.
// Garante estabilidade sob condições anômalas, dados corrompidos, falhas de provider e colisões.
// Zero explicit any.

import { describe, it, expect } from 'vitest';
import {
  TableCellContentSchema
} from '../../../src/domain/table-core/table.schema';
import {
  getCellKey,
  parseCellKey,
  TableCoreModel,
  TableColumnModel,
  TableRowModel,
  TableCellModel
} from '../../../src/domain/table-core/table.types';
import { getTablePreset } from '../../../src/domain/table-core/table.presets';
import { resolveColumnWidthsMm } from '../../../src/domain/table-core/table.geometry';
import { UnavailableProductKnowledgeProvider } from '../../../src/domain/table-binding/product-knowledge-provider.types';

describe('Table Core V2: Adversarial & Edge Cases', () => {
  describe('1. Collision-Safe Cell Key Contract', () => {
    it('deve rejeitar chaves ou coordenadas vazias com erro determinístico', () => {
      expect(() => getCellKey('', 'col1')).toThrow();
      expect(() => getCellKey('row1', '')).toThrow();
    });

    it('deve codificar e decodificar com segurança caracteres delimitadores conflitantes', () => {
      const complexRowId = 'row:pipe|colon::danger';
      const complexColId = 'col|pipe:r4:special';

      const key = getCellKey(complexRowId, complexColId);
      const parsed = parseCellKey(key);

      expect(parsed).not.toBeNull();
      expect(parsed?.rowId).toBe(complexRowId);
      expect(parsed?.columnId).toBe(complexColId);
    });

    it('deve retornar null ao tentar fazer parse de string arbitrária malformada', () => {
      expect(parseCellKey('invalid-key')).toBeNull();
      expect(parseCellKey('r99:short|c1:a')).toBeNull();
      expect(parseCellKey('')).toBeNull();
    });
  });

  describe('2. Invariante de Snapshot Obrigatório em Modo Snapshot', () => {
    it('deve rejeitar via Zod TableCellBoundContent com bindingMode="snapshot" sem snapshot materializado', () => {
      const invalidSnapshotContent = {
        kind: 'datum_reference',
        productId: 'prod-1',
        datumKey: 'accuracy',
        bindingMode: 'snapshot'
        // snapshot propositalmente omitido
      };

      const result = TableCellContentSchema.safeParse(invalidSnapshotContent);
      expect(result.success).toBe(false);
    });

    it('deve aceitar TableCellBoundContent com bindingMode="snapshot" quando snapshot está presente', () => {
      const validSnapshotContent = {
        kind: 'datum_reference',
        productId: 'prod-1',
        datumKey: 'accuracy',
        bindingMode: 'snapshot',
        snapshot: {
          kind: 'text',
          text: '0.01% FE'
        }
      };

      const result = TableCellContentSchema.safeParse(validSnapshotContent);
      expect(result.success).toBe(true);
    });
  });

  describe('3. Diagnóstico e Resiliência em Geometria Inválida', () => {
    it('deve acusar warning de geometria se colunas fixas excederem a largura total fixa sem lançar exceção', () => {
      const columns: TableColumnModel[] = [
        { id: 'c1', semanticKey: 'col1', defaultLabel: 'C1', widthSpec: { mode: 'fixed_mm', widthMm: 120 }, align: 'left' },
        { id: 'c2', semanticKey: 'col2', defaultLabel: 'C2', widthSpec: { mode: 'fixed_mm', widthMm: 100 }, align: 'left' }
      ];

      const rows: TableRowModel[] = [{ id: 'r1', kind: 'data' }];
      const cells: Record<string, TableCellModel> = {
        [getCellKey('r1', 'c1')]: { id: 'c1', rowId: 'r1', columnId: 'c1', content: { kind: 'empty' } },
        [getCellKey('r1', 'c2')]: { id: 'c2', rowId: 'r1', columnId: 'c2', content: { kind: 'empty' } }
      };

      const table: TableCoreModel = {
        id: 'tbl-overflow-geo',
        schemaVersion: 1,
        columns,
        rows,
        cells,
        presentation: {
          ...getTablePreset('presys_clean_technical'),
          tableWidth: { mode: 'fixed_mm', widthMm: 180 } // 120 + 100 = 220 > 180!
        },
        paginationPolicy: { allowRowSplit: false, repeatHeaderOnBreak: true, keepHeaderWithFirstRow: true, minOrphanRows: 1 }
      };

      const result = resolveColumnWidthsMm(table);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('deve retornar valid=false com mensagem de erro quando coluna possui largura não positiva', () => {
      const columns: TableColumnModel[] = [
        { id: 'c1', semanticKey: 'col1', defaultLabel: 'C1', widthSpec: { mode: 'fixed_mm', widthMm: -10 }, align: 'left' }
      ];

      const rows: TableRowModel[] = [{ id: 'r1', kind: 'data' }];
      const cells: Record<string, TableCellModel> = {
        [getCellKey('r1', 'c1')]: { id: 'c1', rowId: 'r1', columnId: 'c1', content: { kind: 'empty' } }
      };

      const table: TableCoreModel = {
        id: 'tbl-invalid-col-geo',
        schemaVersion: 1,
        columns,
        rows,
        cells,
        presentation: getTablePreset('presys_clean_technical'),
        paginationPolicy: { allowRowSplit: false, repeatHeaderOnBreak: true, keepHeaderWithFirstRow: true, minOrphanRows: 1 }
      };

      const result = resolveColumnWidthsMm(table);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('4. Resiliência a Literais Incompletos ou com Valores Negativos / Nulos', () => {
    it('deve aceitar faixa apenas com limite inferior (≥ X)', () => {
      const partialRange = {
        kind: 'range' as const,
        lower: 0,
        unit: 'bar'
      };

      const parsed = TableCellContentSchema.safeParse(partialRange);
      expect(parsed.success).toBe(true);
    });

    it('deve aceitar faixa apenas com limite superior (≤ X)', () => {
      const partialRange = {
        kind: 'range' as const,
        upper: 700,
        unit: 'bar'
      };

      const parsed = TableCellContentSchema.safeParse(partialRange);
      expect(parsed.success).toBe(true);
    });

    it('deve aceitar temperaturas negativas e números fracionários de alta precisão', () => {
      const subZeroRange = {
        kind: 'range' as const,
        lower: -45.5,
        upper: 140.25,
        unit: '°C'
      };

      const parsed = TableCellContentSchema.safeParse(subZeroRange);
      expect(parsed.success).toBe(true);
    });
  });

  describe('5. Fail-Closed Strictness do Provedor de Produção', () => {
    it('nunca deve vazar dados ou lançar exceções não tratadas', async () => {
      const provider = new UnavailableProductKnowledgeProvider();
      expect(provider.isAvailable()).toBe(false);

      const res = await provider.search(undefined, 'qualquer termo perigoso');
      expect(res).toEqual([]);

      const datum = await provider.getDatum('qualquer-id', 'qualquer-key');
      expect(datum).toBeUndefined();
    });
  });
});

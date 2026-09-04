// tests/domain/product-workspace/workspace-auto-organizer.test.ts
import { describe, it, expect } from 'vitest';
import {
  autoOrganizeProductWorkspace
} from '../../../src/domain/product-workspace/auto-organizer';
import {
  ProductWorkbookV2,
  createWorkbook,
  ensureWorkbookV2,
  addModule,
  addDatum,
  TechnicalDataset,
  getDatasetCellKey
} from '../../../src/domain/product-workbook';

describe('Workspace Auto Organizer (Pure Deterministic Layout Engine)', () => {
  function createSyntheticSensorWorkbook(sensorCount: number): ProductWorkbookV2 {
    let wb = ensureWorkbookV2(
      createWorkbook({
        id: 'wb-sensors',
        owner: { kind: 'product', id: 'CALIBRATOR-TEST' },
        revision: 1
      })
    );

    wb = ensureWorkbookV2(
      addModule(wb, {
        id: 'mod-electrical',
        semanticKey: 'electrical.inputs',
        label: 'Entradas Elétricas & Sensores Auxiliares',
        kind: 'collection',
        order: 0
      })
    );

    // Gera múltiplos sensores com 4 especificações cada (faixa, resolução, exatidão padrão, exatidão)
    const sensorNames = ['tc_j', 'tc_k', 'tc_t', 'tc_e', 'tc_n', 'tc_r', 'tc_s', 'tc_b', 'rtd_pt100', 'rtd_pt1000', 'voltage_mv', 'current_ma'];
    const sensorsToGenerate = sensorNames.slice(0, sensorCount);

    for (const s of sensorsToGenerate) {
      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: `electrical.inputs.${s}.input_range`,
            moduleId: 'mod-electrical',
            label: `${s.toUpperCase()} Faixa`,
            value: { type: 'range', lower: -100, upper: 1000, unit: '°C' },
            evidence: [],
            status: 'verified'
          },
          `datum-${s}-range`
        )
      );
      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: `electrical.inputs.${s}.resolution`,
            moduleId: 'mod-electrical',
            label: `${s.toUpperCase()} Resolução`,
            value: { type: 'quantity', amount: 0.01, unit: '°C' },
            evidence: [],
            status: 'verified'
          },
          `datum-${s}-res`
        )
      );
      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: `electrical.inputs.${s}.accuracy`,
            moduleId: 'mod-electrical',
            label: `${s.toUpperCase()} Exatidão`,
            value: { type: 'quantity', amount: 0.1, unit: '°C' },
            evidence: [],
            status: 'verified'
          },
          `datum-${s}-acc`
        )
      );
      wb = ensureWorkbookV2(
        addDatum(
          wb,
          {
            semanticKey: `electrical.inputs.${s}.standard_accuracy`,
            moduleId: 'mod-electrical',
            label: `${s.toUpperCase()} Exatidão Padrão`,
            value: { type: 'quantity', amount: 0.05, unit: '°C' },
            evidence: [],
            status: 'verified'
          },
          `datum-${s}-std-acc`
        )
      );
    }

    return wb;
  }

  it('converte uma matriz massiva de sensores (ex: 48 datums de 12 sensores) em UMA tabela técnica elegante', () => {
    const wb = createSyntheticSensorWorkbook(12); // 12 sensores * 4 = 48 datums
    expect(Object.keys(wb.data).length).toBe(48);

    const layout = autoOrganizeProductWorkspace({ workbook: wb });

    // Encontra a seção de tabelas técnicas
    const tableSection = layout.sections.find((s) => s.id === 'section_technical_tables');
    expect(tableSection).toBeDefined();

    // Deve conter um bloco de tabela técnica
    const tableBlockId = tableSection!.blockIds[0];
    const tableBlock = layout.blocks[tableBlockId];
    expect(tableBlock.kind).toBe('technical_table');

    if (tableBlock.kind === 'technical_table') {
      const table = tableBlock.tableDef;
      // Linhas = 12 sensores
      expect(table.rows.length).toBe(12);
      // Colunas = Sensor + Colunas detectadas
      expect(table.columns.length).toBeGreaterThanOrEqual(3);

      // Células apontam para datumId (referencial, zero cópia!)
      const sampleCellKey = getDatasetCellKey(table.rows[0].id, 'col_accuracy');
      const sampleCell = table.cells[sampleCellKey];
      expect(sampleCell.type).toBe('datum_ref');
    }
  });

  it('projeta TechnicalDataset existente prioritariamente na seção de tabelas', () => {
    let wb = ensureWorkbookV2(
      createWorkbook({
        id: 'wb-dataset-test',
        owner: { kind: 'product', id: 'TA-35N' },
        revision: 1
      })
    );

    wb = ensureWorkbookV2(
      addModule(wb, {
        id: 'mod-inserts',
        semanticKey: 'inserts.general',
        label: 'Blocos de Inserção',
        kind: 'collection',
        order: 0
      })
    );

    const dataset: TechnicalDataset = {
      id: 'ds-inserts-ta',
      semanticKey: 'inserts.table',
      moduleId: 'mod-inserts',
      label: 'Tabela de Blocos e Acessórios',
      kind: 'accessories',
      order: 0,
      columns: [
        { id: 'c-code', semanticKey: 'inserts.code', label: 'Código', valueType: 'text', order: 0 }
      ],
      rows: [
        { id: 'r-in01', label: 'IN-01', order: 0 }
      ],
      cells: {},
      metadata: {}
    };

    wb = { ...wb, datasets: [dataset] };

    const layout = autoOrganizeProductWorkspace({ workbook: wb });
    const tableSection = layout.sections.find((s) => s.id === 'section_technical_tables');
    expect(tableSection).toBeDefined();

    const dsBlock = layout.blocks[tableSection!.blockIds[0]];
    expect(dsBlock.kind).toBe('dataset_view');
  });

  it('cria fact grid para especificações principais de resumo', () => {
    let wb = ensureWorkbookV2(
      createWorkbook({
        id: 'wb-summary',
        owner: { kind: 'product', id: 'TA-50N' },
        revision: 1
      })
    );

    wb = ensureWorkbookV2(
      addModule(wb, {
        id: 'mod-meta',
        semanticKey: 'meta.general',
        label: 'Geral',
        kind: 'key_value',
        order: 0
      })
    );

    wb = ensureWorkbookV2(
      addDatum(
        wb,
        {
          semanticKey: 'metrology.temperature_range',
          moduleId: 'mod-meta',
          label: 'Faixa de Temperatura',
          value: { type: 'range', lower: 50, upper: 500, unit: '°C' },
          evidence: [],
          status: 'approved'
        },
        'd-range'
      )
    );

    const layout = autoOrganizeProductWorkspace({ workbook: wb });
    const summarySection = layout.sections.find((s) => s.id === 'section_summary');
    expect(summarySection).toBeDefined();

    const summaryBlock = layout.blocks[summarySection!.blockIds[0]];
    expect(summaryBlock.kind).toBe('fact_grid');
    if (summaryBlock.kind === 'fact_grid') {
      expect(summaryBlock.datumIds).toContain('d-range');
    }
  });
});

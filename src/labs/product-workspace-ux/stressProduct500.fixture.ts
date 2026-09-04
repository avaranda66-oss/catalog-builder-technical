// src/labs/product-workspace-ux/stressProduct500.fixture.ts
/**
 * Fixture de Stress Sintético para Validação de Legibilidade e Performance da UX.
 * 
 * ESPECIFICAÇÕES DO STRESS:
 * - 500 fatos técnicos no total
 * - 5 mega tabelas, incluindo uma com 100 linhas e 15 colunas
 * - 12 seções editoriais (incluindo seção vazia de expansão)
 * - Nomes e rótulos longos para testar wrap de layout
 * - Casos de evidência: 0 fontes, 1 fonte, 2 concordantes, 5 concordantes, conflitos, herdado e override
 * 
 * ATENÇÃO METROLÓGICA (AMENDMENT 8):
 * - Esta fixture é 100% SINTÉTICA e criada exclusivamente para testes de interface.
 * - Marcada como isSynthetic: true / LAB_FIXTURE.
 */

import {
  WorkspaceSection,
  FactSource,
  ProductWorkspaceMetadata,
  MegaTableColumn,
  MegaTableRow,
  FactItem
} from './types';

export const STRESS_500_METADATA: ProductWorkspaceMetadata = {
  id: 'stress_500',
  name: 'STRESS-500 EXTREME (Synthetic Benchmark)',
  sku: 'SYNTH-500-STRESS',
  category: 'Instrumento Multi-Variável Complexo de Teste',
  familyLine: 'Linha STRESS-BENCHMARK',
  department: 'Laboratório de Validação de Desempenho UX',
  layoutRevision: 12,
  dataRevision: 88,
  isSynthetic: true,
  fixtureBadge: 'LAB / SYNTHETIC FIXTURE'
};

// 5 Fontes de Apoio para Caso de Múltiplas Fontes Concordantes (5 Agreeing Sources)
export const STRESS_SOURCE_1: FactSource = {
  documentId: 'doc-stress-1',
  documentTitle: 'Manual do Usuário Avançado STRESS-500 (Sintético)',
  documentCode: 'SYNTH-MAN-01',
  page: 12,
  excerpt: 'Faixa estendida de operação garantida sob regime contínuo de 0 a 1000 bar com conformidade total.',
  verifiedStatus: 'verified'
};

export const STRESS_SOURCE_2: FactSource = {
  documentId: 'doc-stress-2',
  documentTitle: 'Relatório de Ensaio Metrológico Sintético (PTB / NIST)',
  documentCode: 'SYNTH-CAL-02',
  page: 44,
  excerpt: 'Aferição independente atesta medição de 0 a 1000 bar com incerteza expandida k=2.',
  verifiedStatus: 'verified'
};

export const STRESS_SOURCE_3: FactSource = {
  documentId: 'doc-stress-3',
  documentTitle: 'Certificado de Homologação TÜV Nord (Sintético)',
  documentCode: 'SYNTH-TUV-03',
  page: 5,
  excerpt: 'Aprovado para operação ininterrupta na escala de 0 a 1000 bar sob severidade SIL-3.',
  verifiedStatus: 'verified'
};

export const STRESS_SOURCE_4: FactSource = {
  documentId: 'doc-stress-4',
  documentTitle: 'Folha de Dados do Fabricante de Sensores (Sintético)',
  documentCode: 'SYNTH-OEM-04',
  page: 18,
  excerpt: 'Elemento sensor primário especificado para 0 a 1000 bar com linearidade superior.',
  verifiedStatus: 'verified'
};

export const STRESS_SOURCE_5: FactSource = {
  documentId: 'doc-stress-5',
  documentTitle: 'Norma de Aplicação em Campo Petroquímico (Sintético)',
  documentCode: 'SYNTH-STD-05',
  page: 89,
  excerpt: 'Recomendação técnica ratifica o intervalo nominal de 0 a 1000 bar para processos críticos.',
  verifiedStatus: 'verified'
};

// Fontes para Conflito
export const STRESS_CONFLICT_SRC_A: FactSource = {
  documentId: 'doc-stress-conf-a',
  documentTitle: 'Especificação Preliminar R&D (Sintético)',
  documentCode: 'SPEC-RD-2023',
  page: 3,
  excerpt: 'Tempo de subida nominal da rampa de pressurização especificado em 12 segundos.',
  verifiedStatus: 'review_required'
};

export const STRESS_CONFLICT_SRC_B: FactSource = {
  documentId: 'doc-stress-conf-b',
  documentTitle: 'Manual de Produção Série Final (Sintético)',
  documentCode: 'MAN-PROD-2024',
  page: 15,
  excerpt: 'Tempo de subida nominal da rampa de pressurização estabelecido em 18 segundos com amortecimento.',
  verifiedStatus: 'review_required'
};

// ============================================================================
// GERADOR DA TABELA 100x15 (100 rows, 15 columns)
// ============================================================================
const TABLE_100x15_COLUMNS: MegaTableColumn[] = [
  { id: 'c01_id', header: 'Código do Canal', width: '130px' },
  { id: 'c02_param', header: 'Parâmetro Metrológico Complexo', width: '260px' },
  { id: 'c03_min', header: 'Faixa Mínima', width: '110px', align: 'right' },
  { id: 'c04_nom', header: 'Faixa Nominal', width: '120px', align: 'right' },
  { id: 'c05_max', header: 'Faixa Máxima', width: '110px', align: 'right' },
  { id: 'c06_unit', header: 'Unidade', width: '90px', align: 'center' },
  { id: 'c07_res', header: 'Resolução', width: '110px', align: 'right' },
  { id: 'c08_uncert', header: 'Incerteza (k=2)', width: '120px', align: 'right' },
  { id: 'c09_temp_coef', header: 'Coef. Temp. (ppm/K)', width: '140px', align: 'right' },
  { id: 'c10_drift', header: 'Deriva Anual', width: '120px', align: 'right' },
  { id: 'c11_sampling', header: 'Taxa Amostral (Hz)', width: '130px', align: 'right' },
  { id: 'c12_response', header: 'Tempo Resposta t90', width: '130px', align: 'right' },
  { id: 'c13_protocol', header: 'Protocolo Fieldbus', width: '140px' },
  { id: 'c14_calib', header: 'Ciclo de Calibração', width: '140px' },
  { id: 'c15_status', header: 'Status de Conformidade', width: '160px' }
];

const TABLE_100x15_ROWS: MegaTableRow[] = Array.from({ length: 100 }, (_, i) => {
  const rowNum = i + 1;
  const group = rowNum <= 25
    ? 'Canais Analógicos de Alta Tensão e Isolação Galvânica'
    : rowNum <= 50
    ? 'Transdutores Piezoresistivos de Pressão Dinâmica'
    : rowNum <= 75
    ? 'Sensores Termométricos RTD e Termopares Especiais'
    : 'Módulos de Interface Fieldbus e Comunicação em Tempo Real';

  return {
    id: `row-100x15-${rowNum}`,
    group,
    cells: {
      c01_id: { value: `CH-${String(rowNum).padStart(3, '0')}`, type: 'editorial_literal' },
      c02_param: {
        value: `Grandeza Paramétrica Canal ${rowNum} com Compensação Multivariável Ativa`,
        highlight: rowNum % 10 === 0,
        type: 'editorial_literal'
      },
      c03_min: { value: (rowNum * 1.5 - 50).toFixed(2), type: 'editorial_literal' },
      c04_nom: {
        value: (rowNum * 10).toFixed(1),
        type: 'fact_ref',
        factId: `f-stress-ch-${rowNum}`,
        canonicalSemanticKey: `stress.channel.${rowNum}.nominal`
      },
      c05_max: { value: (rowNum * 15 + 100).toFixed(2), type: 'editorial_literal' },
      c06_unit: { value: rowNum % 2 === 0 ? 'kPa' : 'mV', type: 'editorial_literal' },
      c07_res: { value: '0,0001', type: 'editorial_literal' },
      c08_uncert: { value: `±${(0.01 + (rowNum % 5) * 0.002).toFixed(3)}%`, type: 'editorial_literal' },
      c09_temp_coef: { value: `${10 + (rowNum % 7)} ppm`, type: 'editorial_literal' },
      c10_drift: { value: `< 0,02%/ano`, type: 'editorial_literal' },
      c11_sampling: { value: `${100 + (rowNum % 10) * 10}`, type: 'editorial_literal' },
      c12_response: { value: `${25 + (rowNum % 15)} ms`, type: 'editorial_literal' },
      c13_protocol: { value: rowNum % 3 === 0 ? 'HART 7' : rowNum % 3 === 1 ? 'Profibus-PA' : 'Modbus TCP', type: 'editorial_literal' },
      c14_calib: { value: '12 meses', type: 'editorial_literal' },
      c15_status: { value: rowNum % 4 === 0 ? 'Auditado ISO 17025' : 'Homologado Lab', type: 'editorial_literal' }
    }
  };
});

// Helper gerador de tabelas auxiliares
function generateAuxTable(rowsCount: number, prefix: string, groupName: string): MegaTableRow[] {
  return Array.from({ length: rowsCount }, (_, i) => {
    const idx = i + 1;
    return {
      id: `${prefix}-row-${idx}`,
      group: groupName,
      cells: {
        col_id: { value: `${prefix.toUpperCase()}-${String(idx).padStart(2, '0')}`, type: 'editorial_literal' },
        col_name: { value: `Item Técnico de Monitoramento ${idx} da Matriz de Validação`, type: 'editorial_literal' },
        col_value: {
          value: `${(idx * 3.7).toFixed(2)}`,
          type: 'fact_ref',
          factId: `f-stress-${prefix}-${idx}`,
          canonicalSemanticKey: `stress.${prefix}.${idx}.val`
        },
        col_unit: { value: 'unid', type: 'editorial_literal' },
        col_tol: { value: '±0,05%', type: 'editorial_literal' },
        col_status: { value: 'Normal', type: 'editorial_literal' }
      }
    };
  });
}

// ============================================================================
// SEÇÕES DO STRESS-500
// ============================================================================
export const STRESS_500_INITIAL_SECTIONS: WorkspaceSection[] = [
  // 1. Resumo do Instrumento Sintético (10 fatos com labels longas, 5 agreeing sources, override)
  {
    id: 'sec-stress-01-hero',
    title: '1. Resumo Executivo e Métricas Globais',
    description: 'Parâmetros condensados de alto nível para o dispositivo de teste sintético',
    icon: 'Sparkles',
    blocks: [
      {
        id: 'blk-stress-hero',
        kind: 'hero_summary',
        title: 'Painel Geral de Diagnóstico Sintético',
        size: 'full',
        data: {
          kind: 'hero_summary',
          headline: 'Instrumento sintético de 500 grandezas para homologação de performance e robustez de UX editorial',
          facts: [
            {
              id: 'f-stress-hero-1',
              label: 'Faixa Operacional Extrema em Regime Contínuo com Múltiplas Fontes Concordantes',
              value: '0 a 1000',
              unit: 'bar',
              isHighlighted: true,
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'STRESS-500 EXTREME',
              semanticKey: 'benchmark.pressure.range',
              source: STRESS_SOURCE_1,
              sources: [STRESS_SOURCE_1, STRESS_SOURCE_2, STRESS_SOURCE_3, STRESS_SOURCE_4, STRESS_SOURCE_5]
            },
            {
              id: 'f-stress-hero-2',
              label: 'Estabilidade Térmica com Especificação Própria (Override Local da Linha)',
              value: '±0,001',
              unit: '°C',
              isHighlighted: true,
              originScope: 'model',
              originKind: 'product_override',
              originLabel: 'STRESS-500 EXTREME (Override)',
              semanticKey: 'benchmark.thermal.stability_override',
              source: STRESS_SOURCE_1
            },
            {
              id: 'f-stress-hero-3',
              label: 'Taxa Global de Transmissão de Pacotes de Telemetria Digital Industrial',
              value: '1.000.000',
              unit: 'pps',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'STRESS-500 EXTREME',
              semanticKey: 'benchmark.comm.packet_rate',
              source: STRESS_SOURCE_2
            },
            {
              id: 'f-stress-hero-4',
              label: 'Consumo Nominal de Energia Elétrica Compartilhado por Toda a Família',
              value: '45',
              unit: 'W',
              originScope: 'family',
              originKind: 'family',
              originLabel: 'Linha STRESS-BENCHMARK',
              semanticKey: 'benchmark.electrical.power',
              source: { ...STRESS_SOURCE_3, isFamilyInherited: true }
            },
            {
              id: 'f-stress-hero-5',
              label: 'Tempo Médio Entre Falhas Comprovado em Campo MTBF Estimado',
              value: '120.000',
              unit: 'horas',
              originScope: 'family',
              originKind: 'family',
              originLabel: 'Linha STRESS-BENCHMARK',
              semanticKey: 'benchmark.reliability.mtbf',
              source: { ...STRESS_SOURCE_4, isFamilyInherited: true }
            },
            {
              id: 'f-stress-hero-6',
              label: 'Grau de Proteção Mecânica contra Penetração de Sólidos e Líquidos',
              value: 'IP67 / NEMA 4X',
              originScope: 'family',
              originKind: 'family',
              originLabel: 'Linha STRESS-BENCHMARK',
              semanticKey: 'benchmark.physical.ingress_protection',
              source: { ...STRESS_SOURCE_5, isFamilyInherited: true }
            },
            {
              id: 'f-stress-hero-7',
              label: 'Pressão Hidrostática de Teste Destrutivo para Ruptura de Carcaça',
              value: '2500',
              unit: 'bar',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'STRESS-500 EXTREME',
              semanticKey: 'benchmark.burst.pressure',
              source: STRESS_SOURCE_1
            },
            {
              id: 'f-stress-hero-8',
              label: 'Resolução de Amostragem do Conversor Analógico-Digital Delta-Sigma',
              value: '32',
              unit: 'bits',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'STRESS-500 EXTREME',
              semanticKey: 'benchmark.adc.bits',
              source: STRESS_SOURCE_2
            },
            {
              id: 'f-stress-hero-9',
              label: 'Dimensões Físicas Externas do Gabinete Montado em Rack 19 Polegadas',
              value: '482 x 177 x 450',
              unit: 'mm',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'STRESS-500 EXTREME',
              semanticKey: 'benchmark.dimensions.rack',
              source: STRESS_SOURCE_1
            },
            {
              id: 'f-stress-hero-10',
              label: 'Massa Total do Equipamento com Cabos e Acessórios Conectados',
              value: '18,4',
              unit: 'kg',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'STRESS-500 EXTREME',
              semanticKey: 'benchmark.physical.weight_total',
              source: STRESS_SOURCE_1
            }
          ]
        }
      }
    ]
  },

  // 2. Parâmetros Metrológicos Críticos (40 fatos: 0 fontes, 1 fonte, 2 agreeing, 5 agreeing)
  {
    id: 'sec-stress-02-metro',
    title: '2. Parâmetros Metrológicos Críticos',
    description: 'Matriz expandida de constantes físicas e calibrações de laboratório',
    icon: 'SlidersHorizontal',
    blocks: [
      {
        id: 'blk-stress-grid-metro-40',
        kind: 'fact_grid',
        title: 'Grade de Fatos com Diferentes Estados de Evidência',
        size: 'full',
        data: {
          kind: 'fact_grid',
          layoutVariant: 'cards',
          facts: Array.from({ length: 40 }, (_, i) => {
            const idx = i + 1;
            // Distribuição dos estados de evidência:
            // 1-5: 0 fontes (no_source)
            // 6-15: 1 fonte (single_source)
            // 16-25: 2 fontes concordantes (multiple_agreeing)
            // 26-30: 5 fontes concordantes (multiple_agreeing 5)
            // 31-35: herdado da família
            // 36-40: product_override
            let sources: FactSource[] | undefined;
            let originKind: FactItem['originKind'] = 'product_local';
            let originScope: FactItem['originScope'] = 'model';
            let originLabel = 'STRESS-500 EXTREME';

            if (idx <= 5) {
              sources = []; // 0 fontes
            } else if (idx <= 15) {
              sources = [STRESS_SOURCE_1]; // 1 fonte
            } else if (idx <= 25) {
              sources = [STRESS_SOURCE_1, STRESS_SOURCE_2]; // 2 fontes concordantes
            } else if (idx <= 30) {
              sources = [STRESS_SOURCE_1, STRESS_SOURCE_2, STRESS_SOURCE_3, STRESS_SOURCE_4, STRESS_SOURCE_5]; // 5 fontes
            } else if (idx <= 35) {
              originScope = 'family';
              originKind = 'family';
              originLabel = 'Linha STRESS-BENCHMARK';
              sources = [{ ...STRESS_SOURCE_1, isFamilyInherited: true }];
            } else {
              originKind = 'product_override';
              originLabel = 'STRESS-500 EXTREME (Override)';
              sources = [STRESS_SOURCE_2];
            }

            return {
              id: `f-stress-metro-${idx}`,
              label: `Especificação Metrológica Detalhada Número ${idx} com Compensação Térmica Dinâmica e Amortecimento de Ruído Residual`,
              value: (idx * 2.45).toFixed(2),
              unit: idx % 2 === 0 ? 'ppm' : 'µV',
              originScope,
              originKind,
              originLabel,
              semanticKey: `stress.metrology.spec_${idx}`,
              sources,
              source: sources && sources[0] ? sources[0] : undefined
            };
          })
        }
      }
    ]
  },

  // 3. MATRIZ OPERACIONAL EXTREMA (MEGA TABLE 100x15 = 100 fatos tabulares)
  {
    id: 'sec-stress-03-table-100x15',
    title: '3. Matriz Operacional Extrema (100 Linhas x 15 Colunas)',
    description: 'Mega tabela para homologação de performance de rolagem, sticky header e teclado',
    icon: 'Table',
    blocks: [
      {
        id: 'blk-stress-table-100x15',
        kind: 'mega_table',
        title: 'Mapeamento Geral de Canais e Transdutores (100x15)',
        size: 'full',
        data: {
          kind: 'mega_table',
          table: {
            defaultDensity: 'compact',
            supportsFullscreen: true,
            columns: TABLE_100x15_COLUMNS,
            rows: TABLE_100x15_ROWS
          }
        }
      }
    ]
  },

  // 4. DINÂMICA TÉRMICA E COMPENSAÇÃO (MEGA TABLE 2: 50 rows x 6 cols = 50 fatos)
  {
    id: 'sec-stress-04-thermal-table',
    title: '4. Dinâmica Térmica e Compensação',
    description: 'Tabela secundária com 50 linhas de controle térmico',
    icon: 'Table',
    blocks: [
      {
        id: 'blk-stress-table-thermal-50',
        kind: 'mega_table',
        title: 'Coeficientes Térmicos de Calibração Secundária (50 Linhas)',
        size: 'full',
        data: {
          kind: 'mega_table',
          table: {
            defaultDensity: 'compact',
            supportsFullscreen: true,
            columns: [
              { id: 'col_id', header: 'Sensor ID', width: '130px' },
              { id: 'col_name', header: 'Descrição do Sensor Térmico', width: '260px' },
              { id: 'col_value', header: 'Resistência Nominal', width: '140px', align: 'right' },
              { id: 'col_unit', header: 'Unidade', width: '90px', align: 'center' },
              { id: 'col_tol', header: 'Tolerância', width: '120px', align: 'right' },
              { id: 'col_status', header: 'Diagnóstico', width: '140px' }
            ],
            rows: generateAuxTable(50, 'therm', 'Sensores de Monitoramento Térmico em Bloco de Alumínio')
          }
        }
      }
    ]
  },

  // 5. ENTRADAS E SAÍDAS ANALÓGICAS (MEGA TABLE 3: 50 rows x 6 cols = 50 fatos)
  {
    id: 'sec-stress-05-io-table',
    title: '5. Entradas e Saídas Analógicas',
    description: 'Tabela de barramento analógico com 50 linhas',
    icon: 'Table',
    blocks: [
      {
        id: 'blk-stress-table-io-50',
        kind: 'mega_table',
        title: 'Mapeamento de E/S Analógicas de Alta Velocidade (50 Linhas)',
        size: 'full',
        data: {
          kind: 'mega_table',
          table: {
            defaultDensity: 'compact',
            supportsFullscreen: true,
            columns: [
              { id: 'col_id', header: 'Porta IO', width: '130px' },
              { id: 'col_name', header: 'Nome da Porta de Comunicação', width: '260px' },
              { id: 'col_value', header: 'Nível de Tensão', width: '140px', align: 'right' },
              { id: 'col_unit', header: 'Unidade', width: '90px', align: 'center' },
              { id: 'col_tol', header: 'Incerteza', width: '120px', align: 'right' },
              { id: 'col_status', header: 'Integridade', width: '140px' }
            ],
            rows: generateAuxTable(50, 'io', 'Canais de Entrada Analógica com Amostragem Simultânea')
          }
        }
      }
    ]
  },

  // 6. BARRAMENTO DIGITAL E CONECTIVIDADE (MEGA TABLE 4: 40 rows x 6 cols = 40 fatos)
  {
    id: 'sec-stress-06-bus-table',
    title: '6. Barramento Digital e Conectividade',
    description: 'Tabela de barramento de dados com 40 linhas',
    icon: 'Table',
    blocks: [
      {
        id: 'blk-stress-table-bus-40',
        kind: 'mega_table',
        title: 'Endereçamento Modbus, HART e Profibus (40 Linhas)',
        size: 'full',
        data: {
          kind: 'mega_table',
          table: {
            defaultDensity: 'compact',
            supportsFullscreen: true,
            columns: [
              { id: 'col_id', header: 'Reg. Hex', width: '130px' },
              { id: 'col_name', header: 'Mapeamento de Registrador Digital', width: '260px' },
              { id: 'col_value', header: 'Valor Hexadecimal', width: '140px', align: 'right' },
              { id: 'col_unit', header: 'Tipo', width: '90px', align: 'center' },
              { id: 'col_tol', header: 'Acesso', width: '120px', align: 'right' },
              { id: 'col_status', header: 'Comunicação', width: '140px' }
            ],
            rows: generateAuxTable(40, 'bus', 'Registradores de Memória Compartilhada do DSP Central')
          }
        }
      }
    ]
  },

  // 7. MATRIZ DE ACESSÓRIOS E PEÇAS DE REPOSIÇÃO (MEGA TABLE 5: 60 rows x 6 cols = 60 fatos)
  {
    id: 'sec-stress-07-acc-table',
    title: '7. Matriz de Acessórios e Peças de Reposição',
    description: 'Tabela de suprimentos e peças com 60 linhas',
    icon: 'Table',
    blocks: [
      {
        id: 'blk-stress-table-acc-60',
        kind: 'mega_table',
        title: 'Itens de Reposição e Acessórios Homologados (60 Linhas)',
        size: 'full',
        data: {
          kind: 'mega_table',
          table: {
            defaultDensity: 'compact',
            supportsFullscreen: true,
            columns: [
              { id: 'col_id', header: 'Código ERP', width: '130px' },
              { id: 'col_name', header: 'Descrição do Acessório Industrial', width: '260px' },
              { id: 'col_value', header: 'Quantidade Mínima', width: '140px', align: 'right' },
              { id: 'col_unit', header: 'Emb.', width: '90px', align: 'center' },
              { id: 'col_tol', header: 'Prazo', width: '120px', align: 'right' },
              { id: 'col_status', header: 'Disponibilidade', width: '140px' }
            ],
            rows: generateAuxTable(60, 'part', 'Catálogo de Cabos, Conectores e Estojos Industriais')
          }
        }
      }
    ]
  },

  // 8. ESPECIFICAÇÕES AMBIENTAIS E ROBUSTEZA (60 fatos em Fact Grid)
  {
    id: 'sec-stress-08-env',
    title: '8. Especificações Ambientais e Robusteza',
    description: 'Resistência a vibração, choque mecânico, atmosfera salina e radiação eletromagnética',
    icon: 'SlidersHorizontal',
    blocks: [
      {
        id: 'blk-stress-grid-env-60',
        kind: 'fact_grid',
        title: 'Parâmetros de Certificação Ambiental e Ensaio Destrutivo (60 Fatos)',
        size: 'full',
        data: {
          kind: 'fact_grid',
          layoutVariant: 'cards',
          facts: Array.from({ length: 60 }, (_, i) => {
            const idx = i + 1;
            return {
              id: `f-stress-env-${idx}`,
              label: `Ensaio de Compatibilidade Eletromagnética e Choque Térmico Nível ${idx} em Conformidade MIL-STD-810H`,
              value: `${(idx * 5.2).toFixed(1)}`,
              unit: idx % 2 === 0 ? 'g RMS' : 'kV/m',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'STRESS-500 EXTREME',
              semanticKey: `stress.environmental.test_${idx}`,
              source: STRESS_SOURCE_3
            };
          })
        }
      }
    ]
  },

  // 9. SEÇÃO VAZIA DE EXPANSÃO FUTURA (Teste de Legibilidade de Seções Vazias)
  {
    id: 'sec-stress-09-empty',
    title: '9. Seção Vazia de Expansão Futura (Zero Blocos)',
    description: 'Esta seção foi intencionalmente deixada sem blocos para validar o tratamento elegante de seções vazias na interface editorial',
    icon: 'Layers',
    blocks: []
  },

  // 10. NORMAS E CERTIFICAÇÕES GLOBAIS (50 fatos em Fact Grid)
  {
    id: 'sec-stress-10-certs',
    title: '10. Normas e Certificações Globais',
    description: 'Lista exaustiva de diretivas e laudos internacionais',
    icon: 'SlidersHorizontal',
    blocks: [
      {
        id: 'blk-stress-grid-certs-50',
        kind: 'fact_grid',
        title: 'Certificados e Rastreabilidade Metrológica Internacional (50 Fatos)',
        size: 'full',
        data: {
          kind: 'fact_grid',
          layoutVariant: 'cards',
          facts: Array.from({ length: 50 }, (_, i) => {
            const idx = i + 1;
            return {
              id: `f-stress-cert-${idx}`,
              label: `Certificado de Homologação para Áreas Classificadas com Risco de Explosão Zona ${idx} Diretiva ATEX / IECEx`,
              value: `Ex db IIC T${(idx % 6) + 1} Gb`,
              originScope: 'family',
              originKind: 'family',
              originLabel: 'Linha STRESS-BENCHMARK',
              semanticKey: `stress.certification.norm_${idx}`,
              source: { ...STRESS_SOURCE_4, isFamilyInherited: true }
            };
          })
        }
      }
    ]
  },

  // 11. DOCUMENTAÇÃO TÉCNICA E EVIDÊNCIAS (8 Documentos + 30 Fatos)
  {
    id: 'sec-stress-11-docs',
    title: '11. Documentação Técnica e Evidências',
    description: 'Manuais de engenharia, esquemáticos e laudos laboratoriais',
    icon: 'FileText',
    blocks: [
      {
        id: 'blk-stress-docs-list',
        kind: 'documents',
        title: 'Repositório Central de Evidências Oficiais',
        size: 'full',
        data: {
          kind: 'documents',
          documents: [
            {
              id: 'doc-s-1',
              title: 'Manual de Engenharia e Arquitetura STRESS-500 (Sintético)',
              code: 'SYNTH-MAN-01',
              revision: 'Rev. 12',
              date: '2024-03',
              totalPages: 240,
              referencedFactsCount: 180,
              fileSize: '18.4 MB'
            },
            {
              id: 'doc-s-2',
              title: 'Relatório Metrológico de Incertezas Globais (Sintético)',
              code: 'SYNTH-CAL-02',
              revision: 'Rev. 4',
              date: '2024-02',
              totalPages: 110,
              referencedFactsCount: 145,
              fileSize: '8.2 MB'
            },
            {
              id: 'doc-s-3',
              title: 'Laudo de Ensaios Destrutivos TÜV Nord (Sintético)',
              code: 'SYNTH-TUV-03',
              revision: 'Rev. 2',
              date: '2023-12',
              totalPages: 95,
              referencedFactsCount: 88,
              fileSize: '6.7 MB'
            },
            {
              id: 'doc-s-4',
              title: 'Especificação de Sensores OEM Multicanais (Sintético)',
              code: 'SYNTH-OEM-04',
              revision: 'Rev. 8',
              date: '2024-01',
              totalPages: 160,
              referencedFactsCount: 120,
              fileSize: '12.1 MB'
            }
          ]
        }
      },
      {
        id: 'blk-stress-docs-facts-30',
        kind: 'fact_grid',
        title: 'Metadados de Publicação e Controle Documental (30 Fatos)',
        size: 'full',
        data: {
          kind: 'fact_grid',
          layoutVariant: 'cards',
          facts: Array.from({ length: 30 }, (_, i) => {
            const idx = i + 1;
            return {
              id: `f-stress-doc-meta-${idx}`,
              label: `Registro de Revisão de Engenharia e Controle de Mudança de Firmware Versão ${idx} do Instrumento`,
              value: `Hash SHA256-${idx}A8F9`,
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'STRESS-500 EXTREME',
              semanticKey: `stress.docs.hash_${idx}`,
              source: STRESS_SOURCE_1
            };
          })
        }
      }
    ]
  },

  // 12. GESTÃO DE DIVERGÊNCIAS E CONFLITOS (10 Conflitos com Mensagem Neutra)
  {
    id: 'sec-stress-12-conflicts',
    title: '12. Gestão de Divergências e Conflitos Oficiais',
    description: 'Mediação de fontes com informações divergentes detectadas automaticamente',
    icon: 'AlertTriangle',
    blocks: [
      {
        id: 'blk-stress-conflicts-list',
        kind: 'conflicts',
        title: 'Divergências Documentais em Mediação Técnica (10 Conflitos)',
        size: 'full',
        data: {
          kind: 'conflicts',
          conflicts: Array.from({ length: 10 }, (_, i) => {
            const idx = i + 1;
            return {
              id: `f-stress-conflict-${idx}`,
              label: `Parâmetro em Análise ${idx}: Tempo de Subida da Rampa de Pressurização sob Carga Máxima`,
              value: '12 vs 18',
              unit: 's',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'STRESS-500 EXTREME',
              semanticKey: `stress.conflicts.rise_time_${idx}`,
              source: STRESS_CONFLICT_SRC_A,
              sources: [STRESS_CONFLICT_SRC_A, STRESS_CONFLICT_SRC_B],
              conflict: {
                title: `Divergência Técnica Oficial no Parâmetro ${idx}`,
                description: 'O sistema encontrou informações oficiais divergentes entre a Especificação Preliminar R&D e o Manual de Produção Série Final.',
                detectedAt: '2024-03-02T14:30:00Z',
                options: [
                  {
                    sourceTitle: 'Especificação Preliminar R&D (Sintético)',
                    sourceCode: 'SPEC-RD-2023',
                    page: 3,
                    extractedValue: '12',
                    unit: 's'
                  },
                  {
                    sourceTitle: 'Manual de Produção Série Final (Sintético)',
                    sourceCode: 'MAN-PROD-2024',
                    page: 15,
                    extractedValue: '18',
                    unit: 's'
                  }
                ]
              }
            };
          })
        }
      }
    ]
  }
];

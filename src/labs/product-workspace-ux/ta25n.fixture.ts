// src/labs/product-workspace-ux/ta25n.fixture.ts
/**
 * Fixture visual representativa do calibrador térmico PRESYS TA-25N.
 * Totaliza ~129 fatos técnicos e especificações metrológicas reais.
 * 
 * Regra Arquitetural:
 * - Local-first / Standalone (zero dependência de banco de dados ou Supabase)
 * - Fixture estritamente para o laboratório de UX
 */

import { WorkspaceSection, FactSource, ProductWorkspaceMetadata } from './types';

export const TA25N_METADATA: ProductWorkspaceMetadata = {
  id: 'ta25n',
  name: 'PRESYS TA-25N',
  sku: 'TA-25N',
  category: 'Calibrador Bloco Seco',
  familyLine: 'Linha TA',
  department: 'Metrologia Industrial',
  layoutRevision: 1,
  dataRevision: 4,
  isSynthetic: false
};


export const TA_MANUAL_PT_SOURCE: FactSource = {
  documentId: 'doc-manual-pt',
  documentTitle: 'Manual de Operação e Calibração TA-25N',
  documentCode: 'EM0291-04',
  page: 5,
  excerpt: 'O calibrador bloco seco modelo TA-25N opera na faixa de temperatura de -25 °C à temperatura ambiente até 140 °C, sob temperatura ambiente de 23 °C.',
  verifiedStatus: 'verified',
  technicalMetadata: {
    uploadedAt: '2023-07-15T10:00:00Z',
    ocrConfidence: 0.99,
    rawExtractionKey: 'manual_pt_ta25n_p5'
  }
};

export const TA_MANUAL_EN_SOURCE: FactSource = {
  documentId: 'doc-manual-en',
  documentTitle: 'Dry Block Temperature Calibrator TA-25N Technical Manual',
  documentCode: 'EM0314-01',
  page: 5,
  excerpt: 'Temperature range: -25 °C to 140 °C (ambient 23 °C). Maximum operating temperature: 155 °C under restricted duty cycle.',
  verifiedStatus: 'review_required',
  technicalMetadata: {
    uploadedAt: '2022-11-20T14:30:00Z',
    ocrConfidence: 0.98,
    rawExtractionKey: 'manual_en_ta25n_p5'
  }
};

export const TA_COMMERCIAL_CATALOG_SOURCE: FactSource = {
  documentId: 'doc-catalog-commercial',
  documentTitle: 'Catálogo de Produtos Presys Instrumentos - Calibradores Linha TA',
  documentCode: 'CAT-TA-2024-V2',
  page: 12,
  excerpt: 'Família TA: calibradores portáteis com bloco térmico de alta estabilidade, para uso em laboratório e campo com estojo reforçado.',
  verifiedStatus: 'verified'
};

export const TA25N_INITIAL_SECTIONS: WorkspaceSection[] = [
  // --------------------------------------------------------------------------
  // 1. RESUMO / HERO
  // --------------------------------------------------------------------------
  {
    id: 'sec-resumo',
    title: 'Resumo do Equipamento',
    description: 'Principais destaques metrológicos e operacionais do TA-25N',
    icon: 'Sparkles',
    blocks: [
      {
        id: 'blk-hero-highlights',
        kind: 'hero_summary',
        size: 'full',
        data: {
          kind: 'hero_summary',
          headline: 'Calibrador de Temperatura Bloco Seco Portátil para Uso em Campo e Bancada',
          facts: [
            {
              id: 'f-hero-range',
              label: 'Faixa de Temperatura',
              value: '-25 a 140',
              unit: '°C',
              isHighlighted: true,
              originScope: 'model',
              originLabel: 'TA-25N',
              semanticKey: 'temperature.range',
              aliases: ['faixa', 'temperatura', 'range', 'span'],
              source: TA_MANUAL_PT_SOURCE,
              sources: [TA_MANUAL_PT_SOURCE, TA_COMMERCIAL_CATALOG_SOURCE]
            },
            {
              id: 'f-hero-accuracy',
              label: 'Exatidão da Medição',
              value: '±0,1',
              unit: '°C',
              isHighlighted: true,
              originScope: 'model',
              originLabel: 'TA-25N',
              semanticKey: 'temperature.accuracy',
              aliases: ['exatidao', 'precisao', 'accuracy', 'acuracia'],
              source: TA_MANUAL_PT_SOURCE,
              sources: [TA_MANUAL_PT_SOURCE]
            },
            {
              id: 'f-hero-stability',
              label: 'Estabilidade Térmica',
              value: '±0,02',
              unit: '°C',
              isHighlighted: true,
              originScope: 'model',
              originLabel: 'TA-25N',
              semanticKey: 'temperature.stability',
              aliases: ['estabilidade', 'thermal stability', 'stability'],
              source: TA_MANUAL_PT_SOURCE,
              sources: [TA_MANUAL_PT_SOURCE]
            },
            {
              id: 'f-hero-weight',
              label: 'Peso',
              value: '10,5',
              unit: 'kg',
              isHighlighted: true,
              originScope: 'family',
              originLabel: 'Linha TA',
              semanticKey: 'physical.weight',
              aliases: ['peso', 'massa', 'weight'],
              source: {
                ...TA_MANUAL_PT_SOURCE,
                page: 15,
                excerpt: 'O peso do calibrador da Linha TA é de aproximadamente 10,5 kg.',
                isFamilyInherited: true
              },
              sources: [
                {
                  ...TA_MANUAL_PT_SOURCE,
                  page: 15,
                  excerpt: 'O peso do calibrador da Linha TA é de aproximadamente 10,5 kg.',
                  isFamilyInherited: true
                }
              ]
            }
          ]
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 2. METROLOGIA
  // --------------------------------------------------------------------------
  {
    id: 'sec-metrologia',
    title: 'Especificações Metrológicas',
    description: 'Resolução, uniformidade, tempos de estabilização e exatidão garantida',
    icon: 'Scale',
    blocks: [
      {
        id: 'blk-metrology-facts',
        kind: 'fact_grid',
        size: 'full',
        data: {
          kind: 'fact_grid',
          layoutVariant: 'key_value',
          facts: [
            {
              id: 'f-metro-res',
              label: 'Resolução do Display',
              value: '0,01',
              unit: '°C',
              originScope: 'family',
              originLabel: 'Linha TA',
              semanticKey: 'metrology.resolution',
              aliases: ['resolucao', 'resolution'],
              source: TA_MANUAL_PT_SOURCE
            },
            {
              id: 'f-metro-axial',
              label: 'Uniformidade Axial (em 40 mm)',
              value: '±0,05',
              unit: '°C',
              originScope: 'model',
              originLabel: 'TA-25N',
              semanticKey: 'metrology.uniformity.axial',
              aliases: ['uniformidade axial', 'axial uniformity'],
              source: TA_MANUAL_PT_SOURCE
            },
            {
              id: 'f-metro-radial',
              label: 'Uniformidade Radial',
              value: '±0,02',
              unit: '°C',
              originScope: 'model',
              originLabel: 'TA-25N',
              semanticKey: 'metrology.uniformity.radial',
              aliases: ['uniformidade radial', 'radial uniformity'],
              source: TA_MANUAL_PT_SOURCE
            },
            {
              id: 'f-metro-units',
              label: 'Escalas Selecionáveis',
              value: '°C, °F e K',
              originScope: 'family',
              originLabel: 'Linha TA',
              semanticKey: 'metrology.units',
              aliases: ['escalas', 'unidades de temperatura'],
              source: TA_MANUAL_PT_SOURCE
            },
            {
              id: 'f-metro-stab-time',
              label: 'Tempo de Estabilização',
              value: '15',
              unit: 'minutos',
              originScope: 'model',
              originLabel: 'TA-25N',
              semanticKey: 'metrology.stabilization_time',
              aliases: ['tempo de estabilizacao', 'stabilization time'],
              source: TA_MANUAL_PT_SOURCE
            },
            {
              id: 'f-metro-sensor-ref',
              label: 'Entrada para Sensor de Referência',
              value: 'Pt-100 padrão 4 fios com coeficientes Callendar-Van Dusen',
              originScope: 'family',
              originLabel: 'Linha TA',
              semanticKey: 'metrology.reference_input',
              aliases: ['sensor de referencia', 'pt100 externo'],
              source: TA_MANUAL_PT_SOURCE
            }
          ]
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 3. PERFORMANCE TÉRMICA
  // --------------------------------------------------------------------------
  {
    id: 'sec-performance',
    title: 'Performance Térmica',
    description: 'Curvas de tempo de aquecimento e resfriamento sob 23 °C ambiente',
    icon: 'Thermometer',
    blocks: [
      {
        id: 'blk-thermal-table',
        kind: 'table',
        title: 'Tempos de Aquecimento e Resfriamento',
        size: 'medium',
        data: {
          kind: 'table',
          table: {
            columns: [
              { id: 'transicao', header: 'Faixa de Transição' },
              { id: 'direcao', header: 'Sentido Térmico' },
              { id: 'tempo', header: 'Tempo Típico (min)' }
            ],
            rows: [
              { id: 'r1', values: ['25 °C a 100 °C', 'Aquecimento', '15 min'] },
              { id: 'r2', values: ['100 °C a 140 °C', 'Aquecimento', '10 min'] },
              { id: 'r3', values: ['25 °C a 0 °C', 'Resfriamento', '16 min'] },
              { id: 'r4', values: ['0 °C a -25 °C', 'Resfriamento', '22 min'] }
            ]
          }
        }
      },
      {
        id: 'blk-thermal-notes',
        kind: 'notes',
        size: 'medium',
        data: {
          kind: 'notes',
          content: 'Testes realizados utilizando insert de 6 furos padrão e bloco isolador em temperatura ambiente de 23 °C ± 2 °C. Valores obtidos com tensão nominal de alimentação.'
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 4. ENTRADAS E SENSORES (MEGA TABELA FULL WIDTH)
  // --------------------------------------------------------------------------
  {
    id: 'sec-sensores',
    title: 'Entradas Elétricas e Sensores Compatíveis',
    description: 'Faixas completas de medição de RTDs, termopares e sinais de processo (19 linhas)',
    icon: 'Cpu',
    blocks: [
      {
        id: 'blk-mega-sensores-table',
        kind: 'mega_table',
        title: 'Tabela Completa de Sensores e Sinais Elétricos',
        subtitle: 'Termorresistências, termopares e sinais de instrumentação industrial com resolução e exatidão',
        size: 'full',
        data: {
          kind: 'mega_table',
          table: {
            defaultDensity: 'compact',
            supportsFullscreen: true,
            columns: [
              { id: 'sensor', header: 'Tipo de Entrada / Sensor', width: '220px', align: 'left', visible: true },
              { id: 'range_min', header: 'Faixa Mín.', width: '110px', align: 'right', visible: true },
              { id: 'range_max', header: 'Faixa Máx.', width: '110px', align: 'right', visible: true },
              { id: 'unit', header: 'Unid.', width: '70px', align: 'center', visible: true },
              { id: 'resolution', header: 'Resolução', width: '100px', align: 'right', visible: true },
              { id: 'accuracy', header: 'Exatidão Garantida', width: '160px', align: 'left', visible: true },
              { id: 'standard', header: 'Norma / Conexão', width: '150px', align: 'left', visible: true }
            ],
            rows: [
              // Grupo RTD
              {
                id: 'row-pt100',
                group: 'Termorresistências (RTD)',
                cells: {
                  sensor: { value: 'Pt-100 (IEC 751)', highlight: true, source: TA_MANUAL_PT_SOURCE },
                  range_min: { value: '-200,0' },
                  range_max: { value: '850,0' },
                  unit: { value: '°C' },
                  resolution: { value: '0,01' },
                  accuracy: { value: '±0,1 °C ou ±0,02% FS' },
                  standard: { value: '2, 3 ou 4 fios' }
                }
              },
              {
                id: 'row-pt500',
                group: 'Termorresistências (RTD)',
                cells: {
                  sensor: { value: 'Pt-500' },
                  range_min: { value: '-200,0' },
                  range_max: { value: '850,0' },
                  unit: { value: '°C' },
                  resolution: { value: '0,01' },
                  accuracy: { value: '±0,15 °C' },
                  standard: { value: 'IEC 60751' }
                }
              },
              {
                id: 'row-pt1000',
                group: 'Termorresistências (RTD)',
                cells: {
                  sensor: { value: 'Pt-1000' },
                  range_min: { value: '-200,0' },
                  range_max: { value: '850,0' },
                  unit: { value: '°C' },
                  resolution: { value: '0,01' },
                  accuracy: { value: '±0,15 °C' },
                  standard: { value: 'IEC 60751' }
                }
              },
              {
                id: 'row-cu10',
                group: 'Termorresistências (RTD)',
                cells: {
                  sensor: { value: 'Cu-10 (Minco 16-9)' },
                  range_min: { value: '-30,0' },
                  range_max: { value: '260,0' },
                  unit: { value: '°C' },
                  resolution: { value: '0,01' },
                  accuracy: { value: '±0,2 °C' },
                  standard: { value: '3 ou 4 fios' }
                }
              },
              {
                id: 'row-ni120',
                group: 'Termorresistências (RTD)',
                cells: {
                  sensor: { value: 'Ni-120' },
                  range_min: { value: '-80,0' },
                  range_max: { value: '260,0' },
                  unit: { value: '°C' },
                  resolution: { value: '0,01' },
                  accuracy: { value: '±0,2 °C' },
                  standard: { value: '3 ou 4 fios' }
                }
              },

              // Grupo Termopares
              {
                id: 'row-tc-k',
                group: 'Termopares (IEC / NIST)',
                cells: {
                  sensor: { value: 'Termopar Tipo K' },
                  range_min: { value: '-270,0' },
                  range_max: { value: '1372,0' },
                  unit: { value: '°C' },
                  resolution: { value: '0,1' },
                  accuracy: { value: '±0,25 °C + CJC' },
                  standard: { value: 'NIST Monograph 175' }
                }
              },
              {
                id: 'row-tc-j',
                group: 'Termopares (IEC / NIST)',
                cells: {
                  sensor: { value: 'Termopar Tipo J' },
                  range_min: { value: '-210,0' },
                  range_max: { value: '1200,0' },
                  unit: { value: '°C' },
                  resolution: { value: '0,1' },
                  accuracy: { value: '±0,25 °C + CJC' },
                  standard: { value: 'IEC 60584' }
                }
              },
              {
                id: 'row-tc-t',
                group: 'Termopares (IEC / NIST)',
                cells: {
                  sensor: { value: 'Termopar Tipo T' },
                  range_min: { value: '-270,0' },
                  range_max: { value: '400,0' },
                  unit: { value: '°C' },
                  resolution: { value: '0,1' },
                  accuracy: { value: '±0,20 °C + CJC' },
                  standard: { value: 'IEC 60584' }
                }
              },
              {
                id: 'row-tc-e',
                group: 'Termopares (IEC / NIST)',
                cells: {
                  sensor: { value: 'Termopar Tipo E' },
                  range_min: { value: '-270,0' },
                  range_max: { value: '1000,0' },
                  unit: { value: '°C' },
                  resolution: { value: '0,1' },
                  accuracy: { value: '±0,20 °C + CJC' },
                  standard: { value: 'IEC 60584' }
                }
              },
              {
                id: 'row-tc-n',
                group: 'Termopares (IEC / NIST)',
                cells: {
                  sensor: { value: 'Termopar Tipo N' },
                  range_min: { value: '-270,0' },
                  range_max: { value: '1300,0' },
                  unit: { value: '°C' },
                  resolution: { value: '0,1' },
                  accuracy: { value: '±0,30 °C + CJC' },
                  standard: { value: 'IEC 60584' }
                }
              },
              {
                id: 'row-tc-r',
                group: 'Termopares (IEC / NIST)',
                cells: {
                  sensor: { value: 'Termopar Tipo R' },
                  range_min: { value: '-50,0' },
                  range_max: { value: '1768,0' },
                  unit: { value: '°C' },
                  resolution: { value: '0,1' },
                  accuracy: { value: '±0,70 °C + CJC' },
                  standard: { value: 'NIST 175' }
                }
              },
              {
                id: 'row-tc-s',
                group: 'Termopares (IEC / NIST)',
                cells: {
                  sensor: { value: 'Termopar Tipo S' },
                  range_min: { value: '-50,0' },
                  range_max: { value: '1768,0' },
                  unit: { value: '°C' },
                  resolution: { value: '0,1' },
                  accuracy: { value: '±0,70 °C + CJC' },
                  standard: { value: 'NIST 175' }
                }
              },
              {
                id: 'row-tc-b',
                group: 'Termopares (IEC / NIST)',
                cells: {
                  sensor: { value: 'Termopar Tipo B' },
                  range_min: { value: '250,0' },
                  range_max: { value: '1820,0' },
                  unit: { value: '°C' },
                  resolution: { value: '0,1' },
                  accuracy: { value: '±1,0 °C + CJC' },
                  standard: { value: 'NIST 175' }
                }
              },
              {
                id: 'row-tc-u',
                group: 'Termopares (IEC / NIST)',
                cells: {
                  sensor: { value: 'Termopar Tipo U (DIN)' },
                  range_min: { value: '-200,0' },
                  range_max: { value: '600,0' },
                  unit: { value: '°C' },
                  resolution: { value: '0,1' },
                  accuracy: { value: '±0,30 °C' },
                  standard: { value: 'DIN 43710' }
                }
              },
              {
                id: 'row-tc-l',
                group: 'Termopares (IEC / NIST)',
                cells: {
                  sensor: { value: 'Termopar Tipo L (DIN)' },
                  range_min: { value: '-200,0' },
                  range_max: { value: '900,0' },
                  unit: { value: '°C' },
                  resolution: { value: '0,1' },
                  accuracy: { value: '±0,30 °C' },
                  standard: { value: 'DIN 43710' }
                }
              },

              // Grupo Sinais Elétricos
              {
                id: 'row-mv',
                group: 'Sinais Elétricos e Instrumentação',
                cells: {
                  sensor: { value: 'Tensão Contínua (mV)' },
                  range_min: { value: '-10,0' },
                  range_max: { value: '1000,0' },
                  unit: { value: 'mV' },
                  resolution: { value: '0,001' },
                  accuracy: { value: '±0,01% FS + 1 µV' },
                  standard: { value: 'Impedância > 10 MΩ' }
                }
              },
              {
                id: 'row-volts',
                group: 'Sinais Elétricos e Instrumentação',
                cells: {
                  sensor: { value: 'Tensão Contínua (V)' },
                  range_min: { value: '0,0' },
                  range_max: { value: '11,0' },
                  unit: { value: 'V' },
                  resolution: { value: '0,0001' },
                  accuracy: { value: '±0,015% FS' },
                  standard: { value: 'Impedância 1 MΩ' }
                }
              },
              {
                id: 'row-ma',
                group: 'Sinais Elétricos e Instrumentação',
                cells: {
                  sensor: { value: 'Corrente de Loop (mA)' },
                  range_min: { value: '0,0' },
                  range_max: { value: '24,0' },
                  unit: { value: 'mA' },
                  resolution: { value: '0,0001' },
                  accuracy: { value: '±0,015% FS' },
                  standard: { value: 'Alimentação 24 Vdc interna' }
                }
              },
              {
                id: 'row-ohms',
                group: 'Sinais Elétricos e Instrumentação',
                cells: {
                  sensor: { value: 'Resistência Elétrica (Ω)' },
                  range_min: { value: '0,0' },
                  range_max: { value: '4000,0' },
                  unit: { value: 'Ω' },
                  resolution: { value: '0,01' },
                  accuracy: { value: '±0,01% FS' },
                  standard: { value: 'Corrente de excitação 0,5 mA' }
                }
              }
            ]
          }
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 5. CONSTRUÇÃO E DIMENSÕES
  // --------------------------------------------------------------------------
  {
    id: 'sec-construcao',
    title: 'Construção e Dimensões Físicas',
    description: 'Materiais, dimensões do bloco de equalização e carcaça industrial',
    icon: 'Box',
    blocks: [
      {
        id: 'blk-construction-facts',
        kind: 'fact_grid',
        size: 'full',
        data: {
          kind: 'fact_grid',
          layoutVariant: 'key_value',
          facts: [
            {
              id: 'f-const-dim',
              label: 'Dimensões Externas (A x L x P)',
              value: '260 x 200 x 305',
              unit: 'mm',
              originScope: 'model',
              originLabel: 'TA-25N',
              semanticKey: 'physical.dimensions',
              aliases: ['dimensoes', 'tamanho', 'dimensions'],
              source: TA_MANUAL_PT_SOURCE
            },
            {
              id: 'f-const-weight-total',
              label: 'Peso Total com Insert',
              value: '10,5',
              unit: 'kg',
              originScope: 'family',
              originLabel: 'Linha TA',
              semanticKey: 'physical.weight',
              aliases: ['peso', 'massa'],
              source: TA_MANUAL_PT_SOURCE
            },
            {
              id: 'f-const-well-depth',
              label: 'Profundidade Útil do Poço',
              value: '124',
              unit: 'mm',
              originScope: 'model',
              originLabel: 'TA-25N',
              semanticKey: 'physical.well_depth',
              aliases: ['profundidade do poco', 'well depth'],
              source: TA_MANUAL_PT_SOURCE
            },
            {
              id: 'f-const-well-dia',
              label: 'Diâmetro do Poço',
              value: '25,4 (1")',
              unit: 'mm',
              originScope: 'family',
              originLabel: 'Linha TA',
              semanticKey: 'physical.well_diameter',
              aliases: ['diametro do poco'],
              source: TA_MANUAL_PT_SOURCE
            },
            {
              id: 'f-const-housing',
              label: 'Material da Carcaça',
              value: 'Alumínio usinado e aço carbono com pintura eletrostática a pó',
              originScope: 'family',
              originLabel: 'Linha TA',
              semanticKey: 'physical.housing_material',
              aliases: ['material', 'carcaca', 'chassi'],
              source: TA_MANUAL_PT_SOURCE
            },
            {
              id: 'f-const-ip',
              label: 'Grau de Proteção',
              value: 'IP-20',
              originScope: 'family',
              originLabel: 'Linha TA',
              semanticKey: 'environment.ingress_protection',
              aliases: ['grau de protecao', 'ip'],
              source: TA_MANUAL_PT_SOURCE
            }
          ]
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 6. ALIMENTAÇÃO E AMBIENTE
  // --------------------------------------------------------------------------
  {
    id: 'sec-alimentacao',
    title: 'Alimentação Elétrica e Ambiente Operacional',
    description: 'Requisitos de rede, potência e condições climáticas recomendadas',
    icon: 'Zap',
    blocks: [
      {
        id: 'blk-power-facts',
        kind: 'fact_grid',
        size: 'full',
        data: {
          kind: 'fact_grid',
          layoutVariant: 'key_value',
          facts: [
            {
              id: 'f-pow-voltage',
              label: 'Tensão de Alimentação',
              value: '115 ou 230 Vac selecionável, 50/60 Hz',
              originScope: 'family',
              originLabel: 'Linha TA',
              semanticKey: 'electrical.voltage',
              aliases: ['voltagem', 'tensao', 'alimentacao'],
              source: TA_MANUAL_PT_SOURCE
            },
            {
              id: 'f-pow-consumption',
              label: 'Potência Máxima Consumida',
              value: '300',
              unit: 'W',
              originScope: 'model',
              originLabel: 'TA-25N',
              semanticKey: 'electrical.power_consumption',
              aliases: ['potencia', 'consumo', 'watts'],
              source: TA_MANUAL_PT_SOURCE
            },
            {
              id: 'f-env-op-temp',
              label: 'Temperatura Ambiente de Operação',
              value: '0 a 50',
              unit: '°C',
              originScope: 'family',
              originLabel: 'Linha TA',
              semanticKey: 'environment.ambient_temp',
              aliases: ['temperatura de operacao', 'condicoes ambientais'],
              source: TA_MANUAL_PT_SOURCE
            },
            {
              id: 'f-env-humidity',
              label: 'Umidade Relativa Suportada',
              value: '0 a 90% UR sem condensação',
              originScope: 'family',
              originLabel: 'Linha TA',
              semanticKey: 'environment.humidity',
              aliases: ['umidade', 'humidity'],
              source: TA_MANUAL_PT_SOURCE
            }
          ]
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 7. RECURSOS E CONECTIVIDADE
  // --------------------------------------------------------------------------
  {
    id: 'sec-recursos',
    title: 'Recursos Avançados e Conectividade',
    description: 'Controle microprocessado, interfaces de comunicação e automação de calibração',
    icon: 'Radio',
    blocks: [
      {
        id: 'blk-features-list',
        kind: 'feature_list',
        size: 'full',
        data: {
          kind: 'feature_list',
          items: [
            {
              id: 'feat-1',
              title: 'Controle Peltier de Alta Eficiência',
              description: 'Módulos termoelétricos de última geração permitindo ciclos rápidos de resfriamento sem gás refrigerante.'
            },
            {
              id: 'feat-2',
              title: 'Comunicação Serial RS-232 / RS-485 e USB',
              description: 'Permite integração direta com computadores para ensaios automatizados e registro em tempo real.'
            },
            {
              id: 'feat-3',
              title: 'Compatibilidade com Software ISOPLAN',
              description: 'Emissão automática de certificados de calibração e rotinas de teste sem intervenção humana.'
            },
            {
              id: 'feat-4',
              title: 'Entrada Auxiliar de Referência (Calibrador Completo)',
              description: 'Permite leitura simultânea do sensor sob teste e de sonda termoelétrica de referência certificada.'
            }
          ]
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 8. DOCUMENTOS E EVIDÊNCIAS
  // --------------------------------------------------------------------------
  {
    id: 'sec-documentos',
    title: 'Documentos e Fontes de Engenharia',
    description: 'Manuais técnicos oficiais, catálogos e certificados vinculados aos fatos deste produto',
    icon: 'FileText',
    blocks: [
      {
        id: 'blk-docs-cards',
        kind: 'documents',
        size: 'full',
        data: {
          kind: 'documents',
          documents: [
            {
              id: 'doc-manual-pt',
              title: 'Manual de Operação e Calibração TA-25N',
              code: 'EM0291-04',
              revision: 'Rev. 4',
              date: 'Julho/2023',
              totalPages: 48,
              referencedFactsCount: 94,
              fileSize: '3,8 MB'
            },
            {
              id: 'doc-manual-en',
              title: 'Dry Block Temperature Calibrator TA-25N Technical Manual',
              code: 'EM0314-01',
              revision: 'Rev. 1',
              date: 'Novembro/2022',
              totalPages: 52,
              referencedFactsCount: 31,
              fileSize: '4,1 MB'
            },
            {
              id: 'doc-catalog-commercial',
              title: 'Catálogo Geral da Linha TA de Calibradores',
              code: 'CAT-TA-2024-V2',
              revision: 'Rev. 2',
              date: 'Janeiro/2024',
              totalPages: 16,
              referencedFactsCount: 14,
              fileSize: '8,5 MB'
            }
          ]
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 9. REVISÕES NECESSÁRIAS / CONFLITOS
  // --------------------------------------------------------------------------
  {
    id: 'sec-conflitos',
    title: 'Revisões Necessárias',
    description: 'Divergências detectadas automaticamente entre manuais que requerem conciliação humana',
    icon: 'AlertTriangle',
    blocks: [
      {
        id: 'blk-conflicts-list',
        kind: 'conflicts',
        size: 'full',
        data: {
          kind: 'conflicts',
          conflicts: [
            {
              id: 'f-conflict-temp-max',
              label: 'Temperatura Máxima de Operação',
              value: '140',
              unit: '°C',
              originScope: 'model',
              originLabel: 'TA-25N',
              semanticKey: 'temperature.max_limit',
              aliases: ['temperatura maxima', 'max temp'],
              sources: [
                {
                  ...TA_MANUAL_PT_SOURCE,
                  claimValue: '140 °C',
                  verifiedStatus: 'review_required'
                },
                {
                  ...TA_MANUAL_EN_SOURCE,
                  claimValue: '155 °C',
                  verifiedStatus: 'review_required'
                }
              ],
              conflict: {
                title: 'Divergência de temperatura máxima entre manuais',
                description: 'O Manual PT (EM0291-04) define 140 °C como limite superior, enquanto o Manual EN (EM0314-01) menciona 155 °C para ciclo restrito.',
                detectedAt: '2024-03-01T08:00:00Z',
                options: [
                  {
                    sourceTitle: 'Manual de Operação PT',
                    sourceCode: 'EM0291-04',
                    page: 5,
                    extractedValue: '140',
                    unit: '°C'
                  },
                  {
                    sourceTitle: 'Technical Manual EN',
                    sourceCode: 'EM0314-01',
                    page: 5,
                    extractedValue: '155',
                    unit: '°C'
                  }
                ]
              }
            }
          ]
        }
      }
    ]
  }
];

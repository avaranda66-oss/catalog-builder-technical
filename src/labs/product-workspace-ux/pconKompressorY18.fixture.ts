// src/labs/product-workspace-ux/pconKompressorY18.fixture.ts
/**
 * Fixture visual representativa do calibrador e controlador de pressão PCON KOMPRESSOR-Y18.
 * Totaliza ~100 fatos técnicos, múltiplas tabelas, conexões, HART e acessórios.
 * 
 * ATENÇÃO METROLÓGICA (AMENDMENT 8):
 * - Esta fixture é ESTRITAMENTE SINTÉTICA para testes de UX do laboratório.
 * - Não constitui especificação comercial ou metrológica oficial da PRESYS.
 * - Marcada como isSynthetic: true / LAB_FIXTURE.
 */

import { WorkspaceSection, FactSource, ProductWorkspaceMetadata } from './types';

export const PCON_Y18_METADATA: ProductWorkspaceMetadata = {
  id: 'pcon_y18',
  name: 'PCON KOMPRESSOR-Y18',
  sku: 'PCON-Y18-70B',
  category: 'Controlador e Calibrador de Pressão',
  familyLine: 'Linha PCON',
  department: 'Calibração de Pressão & Instrumentação',
  layoutRevision: 1,
  dataRevision: 2,
  isSynthetic: true,
  fixtureBadge: 'LAB / SYNTHETIC FIXTURE'
};

// Fontes Sintéticas de Demonstração
export const PCON_MANUAL_OP_SOURCE: FactSource = {
  documentId: 'doc-pcon-manual-op',
  documentTitle: 'Manual de Operação PCON KOMPRESSOR-Y18 (Demonstração)',
  documentCode: 'MP-PCON-Y18',
  page: 8,
  excerpt: 'O PCON KOMPRESSOR-Y18 integra compressor elétrico interno gerando até 70 bar (1000 psi) com controle automático estável em malha fechada.',
  verifiedStatus: 'verified',
  technicalMetadata: {
    uploadedAt: '2024-01-10T09:00:00Z',
    ocrConfidence: 0.99,
    rawExtractionKey: 'manual_op_pcon_y18_p8'
  }
};

export const PCON_DATA_SHEET_SOURCE: FactSource = {
  documentId: 'doc-pcon-datasheet',
  documentTitle: 'Folha de Especificação Técnica PCON Series (Demonstração)',
  documentCode: 'DS-PCON-Y18',
  page: 3,
  excerpt: 'Exatidão padrão de 0,015% do fundo de escala com compensação barométrica e estabilidade de controle de 0,002 bar.',
  verifiedStatus: 'verified',
  technicalMetadata: {
    uploadedAt: '2024-02-14T14:20:00Z',
    ocrConfidence: 0.98,
    rawExtractionKey: 'ds_pcon_y18_p3'
  }
};

export const PCON_COMMUNICATION_SOURCE: FactSource = {
  documentId: 'doc-pcon-hart-comm',
  documentTitle: 'Guia de Comunicação HART e Fieldbus PCON (Demonstração)',
  documentCode: 'COMM-PCON-HART-02',
  page: 14,
  excerpt: 'Compatível com comandos universais e de prática comum do protocolo HART v7.5, com resistor interno de 250 ohms selecionável por software.',
  verifiedStatus: 'verified'
};

export const PCON_PRELIMINARY_MANUAL_SOURCE: FactSource = {
  documentId: 'doc-pcon-preliminary',
  documentTitle: 'Manual Preliminar de Engenharia PCON (Demonstração)',
  documentCode: 'MP-PCON-PRELIM-REV0',
  page: 19,
  excerpt: 'Pressão máxima admissível na entrada pneumática de alimentação auxiliar: 80 bar sob ciclo de trabalho contínuo.',
  verifiedStatus: 'review_required'
};

export const PCON_OFFICIAL_HOMOLOGATION_SOURCE: FactSource = {
  documentId: 'doc-pcon-homologation',
  documentTitle: 'Relatório Oficial de Homologação Térmica e Pneumática (Demonstração)',
  documentCode: 'REL-HOMOLOG-PCON-Y18',
  page: 7,
  excerpt: 'Pressão máxima admissível na entrada pneumática de alimentação auxiliar: 75 bar para garantir vida útil das vedações internas.',
  verifiedStatus: 'review_required'
};

export const PCON_Y18_INITIAL_SECTIONS: WorkspaceSection[] = [
  // --------------------------------------------------------------------------
  // 1. RESUMO GERAL (HERO)
  // --------------------------------------------------------------------------
  {
    id: 'sec-pcon-hero',
    title: 'Resumo Geral do Instrumento',
    description: 'Destaques operacionais e capacidade pneumática do PCON KOMPRESSOR-Y18',
    icon: 'Sparkles',
    blocks: [
      {
        id: 'blk-pcon-hero-summary',
        kind: 'hero_summary',
        title: 'Calibrador & Controlador de Pressão com Compressor Integrado',
        size: 'full',
        data: {
          kind: 'hero_summary',
          headline: 'Geração e calibração automática de pressão de -0,9 bar a 70 bar com exatidão de 0,015% FS',
          facts: [
            {
              id: 'f-pcon-hero-range',
              label: 'Faixa de Pressão',
              value: '-0,9 a 70',
              unit: 'bar',
              isHighlighted: true,
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'pressure.range.nominal',
              source: PCON_MANUAL_OP_SOURCE,
              sources: [PCON_MANUAL_OP_SOURCE, PCON_DATA_SHEET_SOURCE]
            },
            {
              id: 'f-pcon-hero-accuracy',
              label: 'Exatidão Padrão',
              value: '±0,015%',
              unit: 'FS',
              isHighlighted: true,
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'pressure.accuracy.standard',
              source: PCON_DATA_SHEET_SOURCE
            },
            {
              id: 'f-pcon-hero-stability',
              label: 'Estabilidade de Controle',
              value: '±0,002',
              unit: 'bar',
              isHighlighted: true,
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'pressure.control.stability',
              source: PCON_DATA_SHEET_SOURCE
            },
            {
              id: 'f-pcon-hero-hart',
              label: 'Comunicação HART',
              value: 'Protocolo v7.5',
              isHighlighted: true,
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'communication.hart.version',
              source: PCON_COMMUNICATION_SOURCE
            },
            {
              id: 'f-pcon-hero-connection',
              label: 'Conexão de Teste',
              value: '1/8" NPT Fêmea',
              isHighlighted: true,
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'pressure.connection.port',
              source: PCON_MANUAL_OP_SOURCE
            },
            {
              id: 'f-pcon-hero-weight',
              label: 'Peso com Compressor',
              value: '8,5',
              unit: 'kg',
              originScope: 'family',
              originKind: 'family',
              originLabel: 'Linha PCON',
              semanticKey: 'physical.dimensions.weight',
              source: { ...PCON_DATA_SHEET_SOURCE, isFamilyInherited: true }
            }
          ]
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 2. FAIXAS DE PRESSÃO E MEDIÇÃO
  // --------------------------------------------------------------------------
  {
    id: 'sec-pcon-pressao',
    title: 'Faixas de Pressão e Medição',
    description: 'Limites de pressão, vácuo, sobrepressão e resolução pneumática',
    icon: 'SlidersHorizontal',
    blocks: [
      {
        id: 'blk-pcon-pressao-facts',
        kind: 'fact_grid',
        title: 'Especificações Barométricas e Pneumáticas',
        size: 'large',
        data: {
          kind: 'fact_grid',
          layoutVariant: 'cards',
          facts: [
            {
              id: 'f-pcon-press-vacuo',
              label: 'Faixa de Vácuo',
              value: '-0,9 a 0',
              unit: 'bar',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'pressure.range.vacuum',
              source: PCON_MANUAL_OP_SOURCE
            },
            {
              id: 'f-pcon-press-pos',
              label: 'Faixa Positiva com Compressor',
              value: '0 a 70',
              unit: 'bar',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'pressure.range.positive',
              source: PCON_MANUAL_OP_SOURCE
            },
            {
              id: 'f-pcon-press-res',
              label: 'Resolução de Leitura',
              value: '0,0001',
              unit: 'bar',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'pressure.resolution',
              source: PCON_DATA_SHEET_SOURCE
            },
            {
              id: 'f-pcon-press-overpressure',
              label: 'Sobrecarga Máxima Admissível',
              value: '105',
              unit: 'bar',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'pressure.overpressure.limit',
              source: PCON_DATA_SHEET_SOURCE
            },
            {
              id: 'f-pcon-press-sensor-type',
              label: 'Tecnologia do Sensor',
              value: 'Piezorresistivo Compensado',
              originScope: 'family',
              originKind: 'family',
              originLabel: 'Linha PCON',
              semanticKey: 'pressure.sensor.type',
              source: { ...PCON_DATA_SHEET_SOURCE, isFamilyInherited: true }
            },
            {
              id: 'f-pcon-press-units',
              label: 'Unidades de Engenharia',
              value: 'bar, psi, kPa, MPa, kgf/cm², mmHg',
              originScope: 'family',
              originKind: 'family',
              originLabel: 'Linha PCON',
              semanticKey: 'pressure.units.supported',
              source: { ...PCON_MANUAL_OP_SOURCE, isFamilyInherited: true }
            }
          ]
        }
      },
      {
        id: 'blk-pcon-table-ranges',
        kind: 'mega_table',
        title: 'Tabela de Módulos e Faixas de Pressão Disponíveis',
        size: 'full',
        data: {
          kind: 'mega_table',
          table: {
            defaultDensity: 'compact',
            supportsFullscreen: true,
            columns: [
              { id: 'module_code', header: 'Código do Módulo', width: '150px' },
              { id: 'type', header: 'Tipo de Pressão', width: '140px' },
              { id: 'min_range', header: 'Mínimo', width: '110px', align: 'right' },
              { id: 'max_range', header: 'Máximo', width: '110px', align: 'right' },
              { id: 'unit', header: 'Unidade', width: '90px', align: 'center' },
              { id: 'accuracy', header: 'Exatidão (% FS)', width: '130px', align: 'right' },
              { id: 'resolution', header: 'Resolução', width: '110px', align: 'right' }
            ],
            rows: [
              {
                id: 'row-p-mod-1',
                group: 'Módulos Internos de Baixa/Média Pressão',
                cells: {
                  module_code: { value: 'MOD-P-01' },
                  type: { value: 'Relativa / Vácuo' },
                  min_range: { value: '-0,9' },
                  max_range: { value: '2' },
                  unit: { value: 'bar' },
                  accuracy: { value: '±0,015', highlight: true },
                  resolution: { value: '0,00001' }
                }
              },
              {
                id: 'row-p-mod-2',
                group: 'Módulos Internos de Baixa/Média Pressão',
                cells: {
                  module_code: { value: 'MOD-P-02' },
                  type: { value: 'Relativa' },
                  min_range: { value: '0' },
                  max_range: { value: '10' },
                  unit: { value: 'bar' },
                  accuracy: { value: '±0,015' },
                  resolution: { value: '0,0001' }
                }
              },
              {
                id: 'row-p-mod-3',
                group: 'Módulos Internos de Baixa/Média Pressão',
                cells: {
                  module_code: { value: 'MOD-P-03' },
                  type: { value: 'Relativa' },
                  min_range: { value: '0' },
                  max_range: { value: '40' },
                  unit: { value: 'bar' },
                  accuracy: { value: '±0,015' },
                  resolution: { value: '0,0001' }
                }
              },
              {
                id: 'row-p-mod-4',
                group: 'Módulos Internos de Alta Pressão (Compressor)',
                cells: {
                  module_code: { value: 'MOD-P-04 (Padrão Y18)' },
                  type: { value: 'Relativa / Vácuo' },
                  min_range: { value: '-0,9' },
                  max_range: { value: '70' },
                  unit: { value: 'bar' },
                  accuracy: { value: '±0,015', highlight: true },
                  resolution: { value: '0,0001' }
                }
              },
              {
                id: 'row-p-mod-5',
                group: 'Módulos Internos de Alta Pressão (Compressor)',
                cells: {
                  module_code: { value: 'MOD-P-05' },
                  type: { value: 'Absoluta' },
                  min_range: { value: '0' },
                  max_range: { value: '70' },
                  unit: { value: 'bar abs' },
                  accuracy: { value: '±0,020' },
                  resolution: { value: '0,0001' }
                }
              }
            ]
          }
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 3. CONTROLE PNEUMÁTICO E COMPRESSOR
  // --------------------------------------------------------------------------
  {
    id: 'sec-pcon-controle',
    title: 'Controle Pneumático e Compressor',
    description: 'Dinâmica de pressurização interna, servoválvulas e estabilidade',
    icon: 'SlidersHorizontal',
    blocks: [
      {
        id: 'blk-pcon-controle-facts',
        kind: 'fact_grid',
        title: 'Desempenho do Compressor Integrado',
        size: 'full',
        data: {
          kind: 'fact_grid',
          layoutVariant: 'cards',
          facts: [
            {
              id: 'f-pcon-ctrl-comp-type',
              label: 'Compressor Interno',
              value: 'Duplo Pistão Isento de Óleo',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'compressor.type',
              source: PCON_MANUAL_OP_SOURCE
            },
            {
              id: 'f-pcon-ctrl-stab-time',
              label: 'Tempo Típico de Estabilização',
              value: '< 25',
              unit: 's',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'pressure.stabilization.time',
              source: PCON_DATA_SHEET_SOURCE
            },
            {
              id: 'f-pcon-ctrl-valves',
              label: 'Servoválvulas de Controle',
              value: 'Proporcionais PWM Alta Resolução',
              originScope: 'family',
              originKind: 'family',
              originLabel: 'Linha PCON',
              semanticKey: 'pressure.valves.technology',
              source: { ...PCON_DATA_SHEET_SOURCE, isFamilyInherited: true }
            },
            {
              id: 'f-pcon-ctrl-max-volume',
              label: 'Volume Máximo do Instrumento sob Teste',
              value: '250',
              unit: 'ml',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'pressure.max.test.volume',
              source: PCON_MANUAL_OP_SOURCE
            }
          ]
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 4. ENTRADAS ELÉTRICAS E MEDIÇÃO
  // --------------------------------------------------------------------------
  {
    id: 'sec-pcon-eletrica',
    title: 'Entradas Elétricas e Medição',
    description: 'Canais de mA, V, alimentação auxiliar e alimentação de loop 24 VDC',
    icon: 'SlidersHorizontal',
    blocks: [
      {
        id: 'blk-pcon-table-electrical',
        kind: 'mega_table',
        title: 'Tabela de Faixas e Exatidão dos Sinais Elétricos',
        size: 'full',
        data: {
          kind: 'mega_table',
          table: {
            defaultDensity: 'compact',
            supportsFullscreen: true,
            columns: [
              { id: 'param', header: 'Grandeza Elétrica', width: '180px' },
              { id: 'range', header: 'Faixa de Operação', width: '160px' },
              { id: 'resolution', header: 'Resolução', width: '120px', align: 'right' },
              { id: 'accuracy', header: 'Exatidão (% da Leitura)', width: '180px', align: 'right' },
              { id: 'impedance', header: 'Impedância de Entrada', width: '150px' }
            ],
            rows: [
              {
                id: 'row-el-ma-in',
                group: 'Medição de Corrente e Tensão',
                cells: {
                  param: { value: 'Medição de Corrente (mA)' },
                  range: { value: '0 a 24,5 mA' },
                  resolution: { value: '0,0001 mA' },
                  accuracy: { value: '±0,01% + 1 µA', highlight: true },
                  impedance: { value: '30 Ω' }
                }
              },
              {
                id: 'row-el-v-in',
                group: 'Medição de Corrente e Tensão',
                cells: {
                  param: { value: 'Medição de Tensão (V)' },
                  range: { value: '0 a 30 VDC' },
                  resolution: { value: '0,001 V' },
                  accuracy: { value: '±0,01% + 1 mV' },
                  impedance: { value: '> 1 MΩ' }
                }
              },
              {
                id: 'row-el-loop-power',
                group: 'Fontes Auxiliares de Alimentação',
                cells: {
                  param: { value: 'Alimentação 24 VDC (Loop Power)' },
                  range: { value: '24 VDC ± 10% (até 50 mA)' },
                  resolution: { value: '-' },
                  accuracy: { value: 'Regulado isolado' },
                  impedance: { value: 'Proteção contra curto' }
                }
              }
            ]
          }
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 5. COMUNICAÇÃO E PROTOCOLO HART
  // --------------------------------------------------------------------------
  {
    id: 'sec-pcon-hart',
    title: 'Comunicação e Protocolo HART',
    description: 'Configuração, leitura de variáveis dinâmicas e calibração de transmissores inteligentes',
    icon: 'SlidersHorizontal',
    blocks: [
      {
        id: 'blk-pcon-hart-facts',
        kind: 'fact_grid',
        title: 'Recursos Integrados do Modem HART',
        size: 'full',
        data: {
          kind: 'fact_grid',
          layoutVariant: 'cards',
          facts: [
            {
              id: 'f-pcon-hart-ver',
              label: 'Versão do Protocolo HART',
              value: 'v7.5',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'communication.hart.version',
              source: PCON_COMMUNICATION_SOURCE
            },
            {
              id: 'f-pcon-hart-resistor',
              label: 'Resistor Interno de Carga',
              value: '250 Ω selecionável',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'communication.hart.resistor',
              source: PCON_COMMUNICATION_SOURCE
            },
            {
              id: 'f-pcon-hart-polling',
              label: 'Faixa de Polling Address',
              value: '0 a 63',
              originScope: 'family',
              originKind: 'family',
              originLabel: 'Linha PCON',
              semanticKey: 'communication.hart.polling_range',
              source: { ...PCON_COMMUNICATION_SOURCE, isFamilyInherited: true }
            },
            {
              id: 'f-pcon-hart-pv-read',
              label: 'Leitura de Variáveis PV / SV / TV / QV',
              value: 'Simultânea em Tempo Real',
              originScope: 'family',
              originKind: 'family',
              originLabel: 'Linha PCON',
              semanticKey: 'communication.hart.variables',
              source: { ...PCON_COMMUNICATION_SOURCE, isFamilyInherited: true }
            }
          ]
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 6. TESTE DE PRESSOSTATO (SWITCH)
  // --------------------------------------------------------------------------
  {
    id: 'sec-pcon-switch',
    title: 'Teste de Pressostato (Switch)',
    description: 'Detecção automática de abertura, fechamento, banda morta e histerese',
    icon: 'SlidersHorizontal',
    blocks: [
      {
        id: 'blk-pcon-switch-facts',
        kind: 'fact_grid',
        title: 'Capacidade do Testador de Switch',
        size: 'full',
        data: {
          kind: 'fact_grid',
          layoutVariant: 'cards',
          facts: [
            {
              id: 'f-pcon-sw-response',
              label: 'Tempo de Resposta do Switch',
              value: '1',
              unit: 'ms',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'switch.response_time',
              source: PCON_DATA_SHEET_SOURCE
            },
            {
              id: 'f-pcon-sw-test-voltage',
              label: 'Tensão de Teste nos Contatos',
              value: '5 VDC (Corrente < 1 mA)',
              originScope: 'family',
              originKind: 'family',
              originLabel: 'Linha PCON',
              semanticKey: 'switch.test_voltage',
              source: { ...PCON_DATA_SHEET_SOURCE, isFamilyInherited: true }
            },
            {
              id: 'f-pcon-sw-hysteresis',
              label: 'Cálculo de Histerese / Banda Morta',
              value: 'Automático com Registro dos Dois Pontos',
              originScope: 'family',
              originKind: 'family',
              originLabel: 'Linha PCON',
              semanticKey: 'switch.hysteresis_calc',
              source: { ...PCON_DATA_SHEET_SOURCE, isFamilyInherited: true }
            }
          ]
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 7. AQUISIÇÃO E DATALOGGER
  // --------------------------------------------------------------------------
  {
    id: 'sec-pcon-datalogger',
    title: 'Aquisição e Datalogger',
    description: 'Registro temporal em memória não volátil e exportação de dados',
    icon: 'SlidersHorizontal',
    blocks: [
      {
        id: 'blk-pcon-logger-facts',
        kind: 'fact_grid',
        title: 'Especificações do Registrador de Dados',
        size: 'full',
        data: {
          kind: 'fact_grid',
          layoutVariant: 'cards',
          facts: [
            {
              id: 'f-pcon-log-capacity',
              label: 'Capacidade de Memória',
              value: '100.000',
              unit: 'pontos',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'datalogger.capacity',
              source: PCON_DATA_SHEET_SOURCE
            },
            {
              id: 'f-pcon-log-interval',
              label: 'Intervalo de Amostragem Programável',
              value: '0,1 a 3600',
              unit: 's',
              originScope: 'family',
              originKind: 'family',
              originLabel: 'Linha PCON',
              semanticKey: 'datalogger.interval',
              source: { ...PCON_DATA_SHEET_SOURCE, isFamilyInherited: true }
            },
            {
              id: 'f-pcon-log-export',
              label: 'Exportação Direta de Arquivos',
              value: 'USB Drive (Formato CSV / PDF)',
              originScope: 'family',
              originKind: 'family',
              originLabel: 'Linha PCON',
              semanticKey: 'datalogger.export_format',
              source: { ...PCON_MANUAL_OP_SOURCE, isFamilyInherited: true }
            }
          ]
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 8. CONEXÕES PNEUMÁTICAS E DE PROCESSO
  // --------------------------------------------------------------------------
  {
    id: 'sec-pcon-conexoes',
    title: 'Conexões Pneumáticas e de Processo',
    description: 'Entradas, saídas de teste, purga rápida e conexões roscadas',
    icon: 'SlidersHorizontal',
    blocks: [
      {
        id: 'blk-pcon-conexoes-facts',
        kind: 'fact_grid',
        title: 'Portas de Conexão Mecânica',
        size: 'full',
        data: {
          kind: 'fact_grid',
          layoutVariant: 'cards',
          facts: [
            {
              id: 'f-pcon-conn-test-port',
              label: 'Conexão da Porta de Teste Principal',
              value: '1/8" NPT Fêmea com Engate Rápido',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'connections.test_port',
              source: PCON_MANUAL_OP_SOURCE
            },
            {
              id: 'f-pcon-conn-aux-input',
              label: 'Entrada de Pressão Auxiliar Externa',
              value: '1/8" NPT Fêmea com Filtro Coalescente',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'connections.aux_input_port',
              source: PCON_MANUAL_OP_SOURCE
            },
            {
              id: 'f-pcon-conn-vent-valve',
              label: 'Válvula de Despressurização e Purga',
              value: 'Comando Elétrico e Alívio Manual Rápido',
              originScope: 'family',
              originKind: 'family',
              originLabel: 'Linha PCON',
              semanticKey: 'connections.vent_valve',
              source: { ...PCON_MANUAL_OP_SOURCE, isFamilyInherited: true }
            }
          ]
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 9. ACESSÓRIOS E COMPONENTES DE CAMPO
  // --------------------------------------------------------------------------
  {
    id: 'sec-pcon-acessorios',
    title: 'Acessórios e Componentes de Campo',
    description: 'Mangueiras de alta pressão, adaptadores de conexão e estojos',
    icon: 'SlidersHorizontal',
    blocks: [
      {
        id: 'blk-pcon-table-accessories',
        kind: 'mega_table',
        title: 'Tabela de Acessórios Homologados',
        size: 'full',
        data: {
          kind: 'mega_table',
          table: {
            defaultDensity: 'compact',
            supportsFullscreen: true,
            columns: [
              { id: 'part_number', header: 'Código do Item', width: '140px' },
              { id: 'item_name', header: 'Descrição do Acessório', width: '220px' },
              { id: 'application', header: 'Aplicação Principal', width: '220px' },
              { id: 'pressure_rating', header: 'Pressão Máxima', width: '130px', align: 'right' },
              { id: 'type', header: 'Fornecimento', width: '110px', align: 'center' }
            ],
            rows: [
              {
                id: 'row-acc-01',
                group: 'Mangueiras e Conexões Rápidas',
                cells: {
                  part_number: { value: '06.01.0012-00' },
                  item_name: { value: 'Mangueira de Alta Pressão 1/4" NPT 1,5m' },
                  application: { value: 'Conexão ao manômetro ou transmissor' },
                  pressure_rating: { value: '200 bar' },
                  type: { value: 'Incluso' }
                }
              },
              {
                id: 'row-acc-02',
                group: 'Mangueiras e Conexões Rápidas',
                cells: {
                  part_number: { value: '06.01.0015-00' },
                  item_name: { value: 'Jogo de Adaptadores de Latão BSP e NPT' },
                  application: { value: '1/8", 1/4", 3/8", 1/2" macho e fêmea' },
                  pressure_rating: { value: '150 bar' },
                  type: { value: 'Incluso' }
                }
              },
              {
                id: 'row-acc-03',
                group: 'Proteção e Transporte',
                cells: {
                  part_number: { value: '06.02.0088-00' },
                  item_name: { value: 'Estojo Rígido Antichoque com Rodízios' },
                  application: { value: 'Transporte em campo com vedação IP67' },
                  pressure_rating: { value: '-' },
                  type: { value: 'Incluso' }
                }
              },
              {
                id: 'row-acc-04',
                group: 'Proteção e Transporte',
                cells: {
                  part_number: { value: '06.03.0044-00' },
                  item_name: { value: 'Cabo de Teste para Pressostato com Garras' },
                  application: { value: 'Conexão aos contatos do switch' },
                  pressure_rating: { value: '-' },
                  type: { value: 'Incluso' }
                }
              }
            ]
          }
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 10. CÓDIGO DE PEDIDO (ORDERING CODE)
  // --------------------------------------------------------------------------
  {
    id: 'sec-pcon-ordering',
    title: 'Código de Pedido (Ordering Code)',
    description: 'Estrutura de codificação de pedido do calibrador PCON',
    icon: 'Tag',
    blocks: [
      {
        id: 'blk-pcon-table-ordering',
        kind: 'mega_table',
        title: 'Matriz de Configuração do Código de Pedido',
        size: 'full',
        data: {
          kind: 'mega_table',
          table: {
            defaultDensity: 'compact',
            supportsFullscreen: true,
            columns: [
              { id: 'field', header: 'Campo', width: '90px' },
              { id: 'meaning', header: 'Significado', width: '180px' },
              { id: 'option_code', header: 'Código da Opção', width: '140px', align: 'center' },
              { id: 'description', header: 'Descrição da Opção Selecionada', width: '280px' }
            ],
            rows: [
              {
                id: 'row-ord-model',
                group: 'Campos Obrigatórios de Configuração',
                cells: {
                  field: { value: 'Campo 1' },
                  meaning: { value: 'Modelo Base' },
                  option_code: { value: 'Y18', highlight: true },
                  description: { value: 'PCON KOMPRESSOR-Y18 com compressor integrado' }
                }
              },
              {
                id: 'row-ord-range',
                group: 'Campos Obrigatórios de Configuração',
                cells: {
                  field: { value: 'Campo 2' },
                  meaning: { value: 'Faixa Pneumática' },
                  option_code: { value: '70B' },
                  description: { value: 'Faixa nominal de -0,9 a 70 bar relativa' }
                }
              },
              {
                id: 'row-ord-hart',
                group: 'Campos Opcionais de Comunicação',
                cells: {
                  field: { value: 'Campo 3' },
                  meaning: { value: 'Comunicação Digital' },
                  option_code: { value: 'H' },
                  description: { value: 'Comunicação HART habilitada de fábrica' }
                }
              },
              {
                id: 'row-ord-power',
                group: 'Alimentação e Bateria',
                cells: {
                  field: { value: 'Campo 4' },
                  meaning: { value: 'Bateria Interna' },
                  option_code: { value: 'BAT' },
                  description: { value: 'Pacote recarregável Li-Ion autonomia 8 horas' }
                }
              }
            ]
          }
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 11. DOCUMENTAÇÃO TÉCNICA
  // --------------------------------------------------------------------------
  {
    id: 'sec-pcon-documentos',
    title: 'Documentação Técnica',
    description: 'Manuais de operação, datasheets e certificados vinculados',
    icon: 'FileText',
    blocks: [
      {
        id: 'blk-pcon-docs-card',
        kind: 'documents',
        title: 'Manuais e Certificados Registrados',
        size: 'full',
        data: {
          kind: 'documents',
          documents: [
            {
              id: 'pcon-doc-1',
              title: 'Manual de Operação PCON KOMPRESSOR-Y18 (Demonstração)',
              code: 'MP-PCON-Y18',
              revision: 'Rev. 3',
              date: '2024-01',
              totalPages: 84,
              referencedFactsCount: 42,
              fileSize: '4.8 MB'
            },
            {
              id: 'pcon-doc-2',
              title: 'Folha de Especificação Técnica PCON Series (Demonstração)',
              code: 'DS-PCON-Y18',
              revision: 'Rev. 2',
              date: '2024-02',
              totalPages: 12,
              referencedFactsCount: 35,
              fileSize: '1.2 MB'
            },
            {
              id: 'pcon-doc-3',
              title: 'Guia de Comunicação HART e Fieldbus PCON (Demonstração)',
              code: 'COMM-PCON-HART-02',
              revision: 'Rev. 1',
              date: '2023-11',
              totalPages: 32,
              referencedFactsCount: 16,
              fileSize: '2.1 MB'
            }
          ]
        }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // 12. GESTÃO DE DIVERGÊNCIAS E CONFLITOS TÉCNICOS
  // --------------------------------------------------------------------------
  {
    id: 'sec-pcon-conflitos',
    title: 'Divergências Documentais',
    description: 'Identificação neutra de informações divergentes entre fontes oficiais',
    icon: 'AlertTriangle',
    blocks: [
      {
        id: 'blk-pcon-conflicts-list',
        kind: 'conflicts',
        title: 'Divergência Técnica em Análise',
        size: 'full',
        data: {
          kind: 'conflicts',
          conflicts: [
            {
              id: 'f-pcon-conflict-aux-press',
              label: 'Pressão Máxima de Alimentação Auxiliar Externa',
              value: '75 vs 80',
              unit: 'bar',
              originScope: 'model',
              originKind: 'product_local',
              originLabel: 'PCON KOMPRESSOR-Y18',
              semanticKey: 'pressure.auxiliary.max_inlet',
              source: PCON_OFFICIAL_HOMOLOGATION_SOURCE,
              sources: [PCON_OFFICIAL_HOMOLOGATION_SOURCE, PCON_PRELIMINARY_MANUAL_SOURCE],
              conflict: {
                title: 'Divergência na Pressão Máxima de Alimentação Auxiliar Externa',
                description: 'O sistema encontrou informações oficiais divergentes entre o Relatório Oficial de Homologação e o Manual Preliminar.',
                detectedAt: '2024-03-01T11:00:00Z',
                options: [
                  {
                    sourceTitle: 'Relatório Oficial de Homologação (Demonstração)',
                    sourceCode: 'REL-HOMOLOG-PCON-Y18',
                    page: 7,
                    extractedValue: '75',
                    unit: 'bar'
                  },
                  {
                    sourceTitle: 'Manual Preliminar de Engenharia (Demonstração)',
                    sourceCode: 'MP-PCON-PRELIM-REV0',
                    page: 19,
                    extractedValue: '80',
                    unit: 'bar'
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

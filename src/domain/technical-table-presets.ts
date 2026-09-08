// src/domain/technical-table-presets.ts
// Presets Semânticos Canônicos do Table V2 (PRESYS / Additel Metrology Catalog).
// Desacoplado de classes CSS de frameworks, persistência customizada ou schemas duplicados.
// Zero explicit any.

import { TableColumnConfig, CatalogTableRow, ContentBlock } from './catalog.schema';
import { TableVisualFamily } from '../components/technical-table/table-tokens';
import { TableLegendConfig } from '../components/technical-table/TechnicalLegend';

export type TableSemanticPresetId =
  | 'quick_spec'
  | 'technical_spec'
  | 'measurement_spec'
  | 'capability_matrix'
  | 'feature_table'
  | 'connectivity_spec'
  | 'insert_matrix'
  | 'standard_delivery'
  | 'accessories'
  | 'ordering_information'
  | 'technical_notes';

export interface TablePresetConfig {
  presetId: TableSemanticPresetId;
  title: string;
  family: TableVisualFamily;
  density: 'compact' | 'regular';
  columns: TableColumnConfig[];
  legendConfig?: TableLegendConfig;
  badgeText?: string;
  subtitle?: string;
}

export const TABLE_SEMANTIC_PRESET_CONFIGS: Record<TableSemanticPresetId, TablePresetConfig> = {
  // 1. Destaques Rápidos (Capa Editorial Técnica)
  quick_spec: {
    presetId: 'quick_spec',
    title: 'DESTAQUES TÉCNICOS / QUICK SPECIFICATIONS',
    family: 'precision_blue',
    density: 'compact',
    columns: [
      { key: 'parameter', label: 'Parâmetro', visible: true, width: 200, align: 'left' },
      { key: 'value', label: 'Especificação Nominal', visible: true, align: 'right' }
    ]
  },

  // 2. Especificação Técnica Principal do Bloco Seco (Hero Technical Table)
  technical_spec: {
    presetId: 'technical_spec',
    title: 'ESPECIFICAÇÕES TÉCNICAS DO CALIBRADOR',
    family: 'precision_blue',
    density: 'compact',
    columns: [
      { key: 'parameter', label: 'Parâmetro / Especificação', visible: true, width: 280, align: 'left' },
      { key: 'value', label: 'Valor / Tolerância Metrológica', visible: true, align: 'right' },
      { key: 'condition', label: 'Condição de Ensaio / Nota', visible: true, width: 170, align: 'left' }
    ]
  },

  // 3. Especificações das Entradas Elétricas de Medição (DUT & Sensor de Referência)
  measurement_spec: {
    presetId: 'measurement_spec',
    title: 'ESPECIFICAÇÕES ELÉTRICAS E MEDIÇÃO DE ENTRADA (DUT & REF)',
    family: 'precision_blue',
    density: 'compact',
    columns: [
      { key: 'function', label: 'Função / Sinal', visible: true, width: 150, align: 'left' },
      { key: 'range', label: 'Faixa de Medição', visible: true, width: 150, align: 'left' },
      { key: 'accuracy', label: 'Exatidão', visible: true, width: 140, align: 'left' },
      { key: 'config', label: 'Configuração / Conexão', visible: true, width: 140, align: 'left' },
      { key: 'notes', label: 'Observações Técnicas', visible: true, align: 'left' }
    ]
  },

  // 4. Matriz de Compatibilidade e Recursos Funcionais
  capability_matrix: {
    presetId: 'capability_matrix',
    title: 'RECURSOS METROLÓGICOS E MODOS OPERACIONAIS',
    family: 'precision_blue',
    density: 'compact',
    columns: [
      { key: 'feature', label: 'Recurso / Modo de Operação', visible: true, width: 280, align: 'left' },
      { key: 'standard', label: 'Standard', visible: true, width: 80, align: 'center' },
      { key: 'optional', label: 'Opcional', visible: true, width: 80, align: 'center' },
      { key: 'notes', label: 'Descrição / Aplicação', visible: true, align: 'left' }
    ],
    legendConfig: {
      showLegend: true,
      title: 'Legenda Técnica de Modos',
      items: [
        { type: 'filled_circle', label: 'Recurso nativo / Standard' },
        { type: 'empty_circle', label: 'Disponível sob pedido / Opcional' },
        { type: 'dash', label: 'Não aplicável para este chassi' }
      ]
    }
  },

  // 5. Tabela Visual de Recursos e Display
  feature_table: {
    presetId: 'feature_table',
    title: 'RECURSOS DE INTERFACE E OPERAÇÃO EM TELA',
    family: 'precision_blue',
    density: 'compact',
    columns: [
      { key: 'feature', label: 'Recurso', visible: true, width: 160, align: 'left' },
      { key: 'interface', label: 'Interface / Operação', visible: true, width: 200, align: 'left' },
      { key: 'description', label: 'Descrição Operacional', visible: true, align: 'left' }
    ]
  },

  // 6. Conectividade, Protocolos e Indústria 4.0
  connectivity_spec: {
    presetId: 'connectivity_spec',
    title: 'CONECTIVIDADE, COMUNICAÇÃO E INDÚSTRIA 4.0',
    family: 'precision_blue',
    density: 'compact',
    columns: [
      { key: 'interface', label: 'Interface / Protocolo', visible: true, width: 180, align: 'left' },
      { key: 'availability', label: 'Disponibilidade', visible: true, width: 110, align: 'center' },
      { key: 'function', label: 'Função / Aplicação Metrológica', visible: true, align: 'left' }
    ],
    legendConfig: {
      showLegend: true,
      title: 'Legenda de Conectividade',
      items: [
        { type: 'filled_circle', label: 'Interface padrão de fábrica' },
        { type: 'empty_circle', label: 'Opcional sob solicitação' },
        { type: 'dash', label: 'Não disponível' }
      ]
    }
  },

  // 7. Matriz de Insertos Mecânicos (Série N)
  insert_matrix: {
    presetId: 'insert_matrix',
    title: 'MATRIZ DE INSERTOS DE EQUALIZAÇÃO TÉRMICA — SÉRIE N (POÇO Ø 25.4 mm)',
    family: 'precision_blue',
    density: 'compact',
    columns: [
      { key: 'insert', label: 'Inserto', visible: true, width: 80, align: 'center' },
      { key: 'geometry', label: 'Furações e Diâmetros (Geometria)', visible: true, width: 300, align: 'left' },
      { key: 'code', label: 'Código PRESYS', visible: true, width: 140, align: 'center' },
      { key: 'notes', label: 'Aplicação Recomendada', visible: true, align: 'left' }
    ]
  },

  // 8. Fornecimento Padrão (Standard Delivery)
  standard_delivery: {
    presetId: 'standard_delivery',
    title: 'FORNECIMENTO PADRÃO (STANDARD DELIVERY)',
    family: 'precision_blue',
    density: 'compact',
    columns: [
      { key: 'item', label: 'Item Fornecido', visible: true, width: 280, align: 'left' },
      { key: 'qty', label: 'Qtd.', visible: true, width: 80, align: 'center' },
      { key: 'included', label: 'Incluso', visible: true, width: 80, align: 'center' },
      { key: 'notes', label: 'Observações / Especificação', visible: true, align: 'left' }
    ],
    legendConfig: {
      showLegend: true,
      title: 'Status de Entrega',
      items: [
        { type: 'filled_square', label: 'Item integrante da entrega padrão' },
        { type: 'empty_square', label: 'Item sobressalente / Opcional' }
      ]
    }
  },

  // 9. Acessórios Opcionais e Códigos de Reposição
  accessories: {
    presetId: 'accessories',
    title: 'ACESSÓRIOS OPCIONAIS E CÓDIGOS DE REPOSIÇÃO',
    family: 'precision_blue',
    density: 'compact',
    columns: [
      { key: 'code', label: 'Código PRESYS', visible: true, width: 140, align: 'center' },
      { key: 'description', label: 'Descrição do Acessório', visible: true, width: 320, align: 'left' },
      { key: 'applicability', label: 'Compatibilidade de Chassi', visible: true, align: 'left' }
    ]
  },

  // 10. Matriz de Codificação de Pedido (Ordering Information)
  ordering_information: {
    presetId: 'ordering_information',
    title: 'ESTRUTURA DE CODIFICAÇÃO DE PEDIDO (ORDERING CODE)',
    family: 'precision_blue',
    density: 'compact',
    columns: [
      { key: 'field', label: 'Campo / Posição', visible: true, width: 170, align: 'left' },
      { key: 'code', label: 'Código', visible: true, width: 90, align: 'center' },
      { key: 'meaning', label: 'Significado / Descrição da Opção', visible: true, width: 330, align: 'left' },
      { key: 'status', label: 'Status', visible: true, width: 80, align: 'center' }
    ],
    legendConfig: {
      showLegend: true,
      title: 'Classificação da Opção',
      items: [
        { type: 'filled_circle', label: 'Configuração padrão de linha' },
        { type: 'empty_circle', label: 'Opcional de fábrica' }
      ]
    }
  },

  // 11. Notas Técnicas e Metrológicas
  technical_notes: {
    presetId: 'technical_notes',
    title: 'NOTAS TÉCNICAS E CONDIÇÕES DE REFERÊNCIA',
    family: 'precision_blue',
    density: 'compact',
    columns: [
      { key: 'symbol', label: 'Ref.', visible: true, width: 60, align: 'center' },
      { key: 'note', label: 'Condição Metrológica / Definição Normativa', visible: true, align: 'left' }
    ]
  }
};

/**
 * Retorna a configuração do preset solicitado.
 */
export function getTechnicalTablePresetConfig(presetId: TableSemanticPresetId): TablePresetConfig {
  const config = TABLE_SEMANTIC_PRESET_CONFIGS[presetId];
  if (!config) {
    throw new Error(`Preset semântico desconhecido: "${presetId}"`);
  }
  return structuredClone(config);
}

/**
 * Cria um ContentBlock do tipo 'custom_table' configurado com base no preset semântico.
 */
export function buildTableBlockFromPreset(
  blockId: string,
  presetId: TableSemanticPresetId,
  rows: CatalogTableRow[],
  overrides?: {
    title?: string;
    subtitle?: string;
    badgeText?: string;
  }
): ContentBlock {
  const cfg = getTechnicalTablePresetConfig(presetId);

  return {
    id: blockId,
    type: 'custom_table',
    title: overrides?.title ?? cfg.title,
    subtitle: overrides?.subtitle ?? cfg.subtitle,
    badgeText: overrides?.badgeText ?? cfg.badgeText,
    tableColumns: cfg.columns,
    tableRows: rows,
    customData: {
      tablePreset: presetId,
      tableFamily: cfg.family,
      density: cfg.density,
      legendConfig: cfg.legendConfig
    }
  };
}

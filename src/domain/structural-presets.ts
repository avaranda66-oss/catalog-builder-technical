// src/domain/structural-presets.ts
// Registro Canônico Centralizado de Presets Estruturais — PRESYS Catalog Studio (Fase 3A.4)
// Define templates visuais puros sem UUIDs de instância e sem claims regulatórios.
// Todos os iconIds satisfazem obrigatoriamente getCorporateIcon(iconId) !== undefined.

import type { StructuralLayoutConfig } from './canvas-layout.schema';
import type { ContentBlock } from './catalog.schema';
import { createStructuralSectionBlock } from './canvas-layout.engine';

export interface StructuralCardTemplate {
  title: string;
  body?: string;
  badge?: string;
  iconId?: string;
  emphasis?: 'normal' | 'highlight' | 'informative' | 'technical';
}

export interface StructuralSectionPresetDefinition {
  id: string; // Identificador canônico estável do template (ex: 'structural-connectivity')
  label: string;
  description: string;
  badge?: string;
  contentLocale: 'pt-BR';
  section: {
    title: string;
    subtitle?: string;
    badgeText?: string;
    iconId?: string;
    layout?: Partial<StructuralLayoutConfig>;
  };
  cards: StructuralCardTemplate[];
}

export const STRUCTURAL_SECTION_PRESETS: readonly StructuralSectionPresetDefinition[] = [
  // 1. Principais Recursos (Grid 4 colunas)
  {
    id: 'structural-feature-grid',
    label: 'Principais Recursos',
    description: 'Grid balanceado de 4 colunas para apresentação de funcionalidades técnicas centrais.',
    badge: '4 Colunas',
    contentLocale: 'pt-BR',
    section: {
      title: 'Principais Recursos',
      subtitle: '',
      badgeText: '',
      iconId: 'layers', // Símbolo de camadas/arquitetura (sem insinuação de certificação)
      layout: {
        mode: 'grid',
        columns: 4,
        widthMode: 'fill',
        gap: 'sm',
        padding: 'md',
        density: 'normal',
        background: 'soft',
        border: 'subtle',
        radius: 'sm'
      }
    },
    cards: [
      {
        title: 'Desempenho e Exatidão',
        body: '',
        iconId: 'target',
        emphasis: 'normal'
      },
      {
        title: 'Interface e Operação',
        body: '',
        iconId: 'monitor',
        emphasis: 'normal'
      },
      {
        title: 'Processamento Digital',
        body: '',
        iconId: 'cpu',
        emphasis: 'normal'
      },
      {
        title: 'Alimentação e Chave',
        body: '',
        iconId: 'power',
        emphasis: 'normal'
      }
    ]
  },

  // 2. Conectividade e Interfaces (Grid 4 colunas)
  {
    id: 'structural-connectivity',
    label: 'Conectividade e Interfaces',
    description: 'Painel dedicado a portas de comunicação industrial, barramentos de campo e interfaces digitais.',
    badge: 'Comunicação',
    contentLocale: 'pt-BR',
    section: {
      title: 'Conectividade e Interfaces',
      subtitle: '',
      badgeText: '',
      iconId: 'network',
      layout: {
        mode: 'grid',
        columns: 4,
        widthMode: 'fill',
        gap: 'sm',
        padding: 'md',
        density: 'normal',
        background: 'soft',
        border: 'subtle',
        radius: 'sm'
      }
    },
    cards: [
      {
        title: 'Comunicação de Rede',
        body: '',
        iconId: 'network',
        emphasis: 'normal'
      },
      {
        title: 'Interface Serial e Cabos',
        body: '',
        iconId: 'cable',
        emphasis: 'normal'
      },
      {
        title: 'Conexão USB',
        body: '',
        iconId: 'usb',
        emphasis: 'normal'
      },
      {
        title: 'Comunicação Sem Fio',
        body: '',
        iconId: 'wifi',
        emphasis: 'normal'
      }
    ]
  },

  // 3. Destaques de Engenharia (Grid 3 colunas com destaque)
  {
    id: 'structural-highlights',
    label: 'Destaques de Engenharia',
    description: '3 blocos com ênfase técnica em destaque superior para diferenciais de projeto.',
    badge: '3 Colunas',
    contentLocale: 'pt-BR',
    section: {
      title: 'Destaques de Engenharia',
      subtitle: '',
      badgeText: '',
      iconId: 'layers',
      layout: {
        mode: 'grid',
        columns: 3,
        widthMode: 'fill',
        gap: 'md',
        padding: 'md',
        density: 'normal',
        background: 'technical',
        border: 'subtle',
        radius: 'md'
      }
    },
    cards: [
      {
        title: 'Construção e Robustez',
        body: '',
        iconId: 'shield',
        emphasis: 'highlight'
      },
      {
        title: 'Monitoramento de Sinais',
        body: '',
        iconId: 'activity',
        emphasis: 'normal'
      },
      {
        title: 'Ajuste e Manutenção',
        body: '',
        iconId: 'wrench',
        emphasis: 'normal'
      }
    ]
  },

  // 4. Aplicações Industriais (Grid 3 colunas)
  {
    id: 'structural-applications',
    label: 'Aplicações Industriais',
    description: 'Distribuição em 3 colunas para cenários de uso em bancada, planta ou manutenção de campo.',
    badge: 'Aplicações',
    contentLocale: 'pt-BR',
    section: {
      title: 'Aplicações Industriais',
      subtitle: '',
      badgeText: '',
      iconId: 'factory',
      layout: {
        mode: 'grid',
        columns: 3,
        widthMode: 'fill',
        gap: 'sm',
        padding: 'md',
        density: 'normal',
        background: 'soft',
        border: 'subtle',
        radius: 'sm'
      }
    },
    cards: [
      {
        title: 'Laboratório e Bancada',
        body: '',
        iconId: 'sliders',
        emphasis: 'normal'
      },
      {
        title: 'Planta de Processos',
        body: '',
        iconId: 'factory',
        emphasis: 'normal'
      },
      {
        title: 'Serviço e Campo',
        body: '',
        iconId: 'wrench',
        emphasis: 'normal'
      }
    ]
  },

  // 5. Software e Gestão de Dados (Grid 4 colunas)
  {
    id: 'structural-software-data',
    label: 'Software e Gestão de Dados',
    description: 'Cartões informativos para software supervisório, exportação de registros e armazenamento.',
    badge: 'Dados',
    contentLocale: 'pt-BR',
    section: {
      title: 'Software e Gestão de Dados',
      subtitle: '',
      badgeText: '',
      iconId: 'database',
      layout: {
        mode: 'grid',
        columns: 4,
        widthMode: 'fill',
        gap: 'sm',
        padding: 'md',
        density: 'normal',
        background: 'soft',
        border: 'subtle',
        radius: 'sm'
      }
    },
    cards: [
      {
        title: 'Banco de Dados e Histórico',
        body: '',
        iconId: 'database',
        emphasis: 'normal'
      },
      {
        title: 'Análise e Gráficos',
        body: '',
        iconId: 'chart',
        emphasis: 'normal'
      },
      {
        title: 'Planilha e Relatórios',
        body: '',
        iconId: 'file-data',
        emphasis: 'normal'
      },
      {
        title: 'Nuvem e Telemetria',
        body: '',
        iconId: 'cloud',
        emphasis: 'normal'
      }
    ]
  },

  // 6. Seção Vazia (Grid 4 colunas sem cards)
  {
    id: 'structural-empty',
    label: 'Seção Estrutural Personalizada',
    description: 'Seção limpa sem cards pré-configurados, permitindo montagem livre a partir do zero.',
    badge: 'Vazia',
    contentLocale: 'pt-BR',
    section: {
      title: 'Nova Seção Estrutural',
      subtitle: '',
      badgeText: '',
      iconId: undefined,
      layout: {
        mode: 'grid',
        columns: 4,
        widthMode: 'fill',
        gap: 'sm',
        padding: 'md',
        density: 'normal',
        background: 'soft',
        border: 'subtle',
        radius: 'sm'
      }
    },
    cards: []
  }
];

export function getStructuralSectionPreset(presetId: string): StructuralSectionPresetDefinition | undefined {
  return STRUCTURAL_SECTION_PRESETS.find((p) => p.id === presetId);
}

/**
 * Cria um ContentBlock do tipo 'structural_section' a partir de um preset.
 * Aplica governança estrita de locale (Fase 3A.4):
 * - Se currentLocale coincidir com o contentLocale do preset (pt-BR ou indefinido): injeta a copy editorial do preset.
 * - Se currentLocale for diferente (ex: fr-FR, de-DE): preserva estrutura, layout e iconIds, mas campos de texto entram vazios.
 */
export function createStructuralSectionFromPreset(presetId: string, currentLocale?: string): ContentBlock {
  const preset = getStructuralSectionPreset(presetId);
  if (!preset) {
    throw new Error(`Preset estrutural não encontrado: ${presetId}`);
  }

  const isMatchingLocale = !currentLocale || currentLocale === preset.contentLocale;

  return createStructuralSectionBlock({
    title: isMatchingLocale ? preset.section.title : '',
    subtitle: isMatchingLocale ? (preset.section.subtitle || '') : '',
    badgeText: isMatchingLocale ? (preset.section.badgeText || '') : '',
    iconId: preset.section.iconId,
    layout: preset.section.layout,
    cards: preset.cards.map((card) => ({
      title: isMatchingLocale ? card.title : '',
      body: isMatchingLocale ? (card.body || '') : '',
      badge: isMatchingLocale ? card.badge : undefined,
      iconId: card.iconId,
      emphasis: card.emphasis
    }))
  });
}

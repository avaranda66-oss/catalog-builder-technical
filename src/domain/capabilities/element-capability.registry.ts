// src/domain/capabilities/element-capability.registry.ts
// Registro Canônico de Capacidades de Elementos do Catálogo (Fase CORE.E2).
// Descreve estritamente as capacidades REAIS e validadas dos 22 BlockTypes oficiais.
// Proíbe NO-OPs, propriedades fantasmas e autorizações prematuras de escrita para IA.

import { BlockType } from '../catalog.schema';
import { CAPABILITY_IDS, CapabilityId } from './capability.ids';
import {
  ElementCapabilityDefinition,
  PropertyCapability
} from './capability.types';
import { ElementCapabilityDefinitionSchema } from './capability.schema';

export const ELEMENT_CAPABILITY_REGISTRY_VERSION = 1;

export const ElementCapabilityRegistry: Readonly<Record<BlockType, ElementCapabilityDefinition>> = {
  // 1. TEXT
  text: {
    blockType: 'text',
    displayName: 'Texto Livre',
    engineFamily: 'flow',
    inspectorFamily: 'simple_content',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_BODY,
        label: 'Conteúdo Textual',
        category: 'content',
        valueKind: 'text',
        controlHint: 'textarea',
        unit: 'none',
        defaultSource: 'none',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 2. IMAGE
  image: {
    blockType: 'image',
    displayName: 'Imagem Técnica Individual',
    engineFamily: 'flow',
    inspectorFamily: 'media',
    capabilities: [
      {
        id: CAPABILITY_IDS.MEDIA_PRIMARY_ASSET,
        label: 'Arquivo de Imagem',
        category: 'media',
        valueKind: 'asset',
        controlHint: 'asset_picker',
        unit: 'none',
        defaultSource: 'none',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.MEDIA_CAPTION,
        label: 'Legenda Técnica',
        category: 'media',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'none',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 3. TABLE
  table: {
    blockType: 'table',
    displayName: 'Tabela Técnica de Produtos',
    engineFamily: 'table_legacy',
    inspectorFamily: 'table',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título da Tabela',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.DATA_COLUMNS,
        label: 'Configuração de Colunas',
        category: 'data',
        valueKind: 'structured',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.DATA_ROWS,
        label: 'Linhas de Dados / Produtos',
        category: 'data',
        valueKind: 'collection',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'document',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 4. BOX
  box: {
    blockType: 'box',
    displayName: 'Caixa de Destaque / Advertência',
    engineFamily: 'flow',
    inspectorFamily: 'simple_content',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_BODY,
        label: 'Texto de Aviso / Nota',
        category: 'content',
        valueKind: 'text',
        controlHint: 'textarea',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.APPEARANCE_BACKGROUND,
        label: 'Cor de Fundo',
        category: 'appearance',
        valueKind: 'color',
        controlHint: 'color',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.APPEARANCE_BORDER,
        label: 'Cor da Borda',
        category: 'appearance',
        valueKind: 'color',
        controlHint: 'color',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.LAYOUT_PADDING,
        label: 'Espaçamento Interno',
        category: 'layout',
        valueKind: 'dimension',
        controlHint: 'dimension',
        unit: 'px',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only',
        constraints: {
          numeric: { min: 4, max: 48, step: 2 }
        }
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 5. HERO BANNER
  hero_banner: {
    blockType: 'hero_banner',
    displayName: 'Hero Banner Corporativo',
    engineFamily: 'flow',
    inspectorFamily: 'hero',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_BADGE,
        label: 'Selo / Badge Superior',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título Principal',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_SUBTITLE,
        label: 'Subtítulo / Descritivo',
        category: 'content',
        valueKind: 'text',
        controlHint: 'textarea',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.MEDIA_PRIMARY_ASSET,
        label: 'Fotografia de Destaque',
        category: 'media',
        valueKind: 'asset',
        controlHint: 'asset_picker',
        unit: 'none',
        defaultSource: 'none',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.MEDIA_CAPTION,
        label: 'Legenda da Fotografia',
        category: 'media',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'none',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.APPEARANCE_GRADIENT,
        label: 'Paleta Visual de Fundo',
        category: 'appearance',
        valueKind: 'enum',
        controlHint: 'color',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 6. FEATURES LIST
  features_list: {
    blockType: 'features_list',
    displayName: 'Lista de Recursos & Diferenciais',
    engineFamily: 'flow',
    inspectorFamily: 'composite',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título da Seção',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_ITEMS,
        label: 'Itens de Diferenciais Técnicos',
        category: 'content',
        valueKind: 'collection',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 7. SPECS TABLE
  // NOTA ARQUITETURAL: No baseline atual, specs_table possui DRIFT CONFIRMADO
  // (rendererSupport.editor = false; rendererSupport.print = true).
  // O Registry relata a realidade de forma transparente e não mascara o bug.
  specs_table: {
    blockType: 'specs_table',
    displayName: 'Tabela de Especificações Técnicas (Legada)',
    engineFamily: 'table_legacy',
    inspectorFamily: 'table',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título da Tabela',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: false, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.DATA_COLUMNS,
        label: 'Colunas de Especificação',
        category: 'data',
        valueKind: 'structured',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: false, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.DATA_ROWS,
        label: 'Linhas de Especificação',
        category: 'data',
        valueKind: 'collection',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'document',
        resetPolicy: 'none',
        rendererSupport: { editor: false, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 8. ELECTRICAL TABLE
  electrical_table: {
    blockType: 'electrical_table',
    displayName: 'Tabela de Parâmetros Elétricos',
    engineFamily: 'table_legacy',
    inspectorFamily: 'table',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título da Tabela',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.DATA_COLUMNS,
        label: 'Colunas de Grandezas Elétricas',
        category: 'data',
        valueKind: 'structured',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.DATA_ROWS,
        label: 'Linhas de Faixas e Exatidões',
        category: 'data',
        valueKind: 'collection',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'document',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 9. ACCESSORIES TABLE
  accessories_table: {
    blockType: 'accessories_table',
    displayName: 'Tabela de Acessórios & Sobressalentes',
    engineFamily: 'table_legacy',
    inspectorFamily: 'table',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título da Tabela',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.DATA_COLUMNS,
        label: 'Colunas de Itens e Códigos',
        category: 'data',
        valueKind: 'structured',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.DATA_ROWS,
        label: 'Linhas de Acessórios',
        category: 'data',
        valueKind: 'collection',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'document',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 10. ORDERING CODES
  ordering_codes: {
    blockType: 'ordering_codes',
    displayName: 'Código de Pedido / Codificação',
    engineFamily: 'specialized',
    inspectorFamily: 'composite',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título do Código de Pedido',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_ORDERING_SEGMENTS,
        label: 'Segmentos de Codificação',
        category: 'content',
        valueKind: 'collection',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 11. IMAGE GALLERY
  image_gallery: {
    blockType: 'image_gallery',
    displayName: 'Galeria de Fotos Industriais',
    engineFamily: 'flow',
    inspectorFamily: 'media',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título da Galeria',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.MEDIA_GALLERY_ITEMS,
        label: 'Fotos e Legendas da Galeria',
        category: 'media',
        valueKind: 'collection',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 12. CONTACT FOOTER
  contact_footer: {
    blockType: 'contact_footer',
    displayName: 'Rodapé Técnico de Contato',
    engineFamily: 'flow',
    inspectorFamily: 'simple_content',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_COMPANY_NAME,
        label: 'Razão Social / Marca',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'protect',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_PHONE,
        label: 'Telefone de Contato',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_EMAIL,
        label: 'E-mail Comercial',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_WEBSITE,
        label: 'Website Oficial',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_ADDRESS,
        label: 'Endereço Corporativo',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'protect',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 13. CUSTOM TABLE
  custom_table: {
    blockType: 'custom_table',
    displayName: 'Tabela Customizada',
    engineFamily: 'table_legacy',
    inspectorFamily: 'table',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título da Tabela',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.DATA_COLUMNS,
        label: 'Definição de Colunas',
        category: 'data',
        valueKind: 'structured',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.DATA_ROWS,
        label: 'Linhas da Tabela Customizada',
        category: 'data',
        valueKind: 'collection',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'document',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 14. ADDITEL TWO COL HERO
  additel_two_col_hero: {
    blockType: 'additel_two_col_hero',
    displayName: 'Header Dual-Column Presys',
    engineFamily: 'flow',
    inspectorFamily: 'hero',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_BADGE,
        label: 'Selo / Marca Superior',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_SECONDARY_BADGE,
        label: 'Slogan do Selo',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título Principal',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_SUBTITLE,
        label: 'Subtítulo',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_DESCRIPTION,
        label: 'Visão Geral / Overview',
        category: 'content',
        valueKind: 'text',
        controlHint: 'textarea',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_ITEMS,
        label: 'Lista de Destaques Técnicos (Bullets)',
        category: 'content',
        valueKind: 'collection',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.MEDIA_PRIMARY_ASSET,
        label: 'Foto do Instrumento',
        category: 'media',
        valueKind: 'asset',
        controlHint: 'asset_picker',
        unit: 'none',
        defaultSource: 'none',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.APPEARANCE_THEME_COLOR,
        label: 'Cor Temática de Destaque',
        category: 'appearance',
        valueKind: 'color',
        controlHint: 'color',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 15. FLUKE HEADER
  fluke_header: {
    blockType: 'fluke_header',
    displayName: 'Header Metrológico Industrial',
    engineFamily: 'flow',
    inspectorFamily: 'hero',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_BADGE,
        label: 'Texto Principal do Badge',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_SECONDARY_BADGE,
        label: 'Texto Secundário do Badge',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título Principal',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_SUBTITLE,
        label: 'Subtítulo',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_DESCRIPTION,
        label: 'Descrição Técnica',
        category: 'content',
        valueKind: 'text',
        controlHint: 'textarea',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_ITEMS,
        label: 'Lista de Destaques Metrológicos',
        category: 'content',
        valueKind: 'collection',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.MEDIA_PRIMARY_ASSET,
        label: 'Foto do Instrumento',
        category: 'media',
        valueKind: 'asset',
        controlHint: 'asset_picker',
        unit: 'none',
        defaultSource: 'none',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.APPEARANCE_BADGE_BG,
        label: 'Cor de Fundo do Badge',
        category: 'appearance',
        valueKind: 'color',
        controlHint: 'color',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 16. INSERTS VISUAL
  inserts_visual: {
    blockType: 'inserts_visual',
    displayName: 'Insertos & Furações Térmicas',
    engineFamily: 'specialized',
    inspectorFamily: 'composite',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título do Bloco',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_EXTERNAL_DIAMETER,
        label: 'Diâmetro Externo / Subtítulo',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'protect',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_INSERTS,
        label: 'Círculos Visuais de Insertos',
        category: 'content',
        valueKind: 'collection',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.DATA_COLUMNS,
        label: 'Colunas da Tabela de Insertos',
        category: 'data',
        valueKind: 'structured',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.DATA_ROWS,
        label: 'Linhas da Tabela de Insertos',
        category: 'data',
        valueKind: 'collection',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 17. MULTI MODE CALIBRATOR
  multi_mode_calibrator: {
    blockType: 'multi_mode_calibrator',
    displayName: 'Sistema Multifunção de Calibração',
    engineFamily: 'flow',
    inspectorFamily: 'composite',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título do Bloco',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_BADGE,
        label: 'Selo / Badge Superior',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_MODES,
        label: 'Modos de Calibração',
        category: 'content',
        valueKind: 'collection',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 18. FULL PAGE COVER
  // NOTA ARQUITETURAL: Modela estritamente a realidade comprovada pelo renderer.
  // NO-OPs eliminados: highlights, footerLeft, footerRight, coverStyle, textAlign, gradient.
  // Escritas divergentes de title/subtitle não são marcadas como validated_command.
  full_page_cover: {
    blockType: 'full_page_cover',
    displayName: 'Capa A4 Página Inteira',
    engineFamily: 'cover_legacy',
    inspectorFamily: 'composite',
    capabilities: [
      {
        id: CAPABILITY_IDS.MEDIA_PRIMARY_ASSET,
        label: 'Fotografia de Fundo (Full-Bleed)',
        category: 'media',
        valueKind: 'asset',
        controlHint: 'asset_picker',
        unit: 'none',
        defaultSource: 'none',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.APPEARANCE_OVERLAY_OPACITY,
        label: 'Escurecimento da Foto (Contraste)',
        category: 'appearance',
        valueKind: 'number',
        controlHint: 'range',
        unit: 'percent',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only',
        constraints: {
          numeric: { min: 0, max: 100, step: 1 }
        }
      },
      {
        id: CAPABILITY_IDS.LAYERS_CANVAS_LAYERS,
        label: 'Camadas Livres da Capa (CanvasLayers)',
        category: 'layers',
        valueKind: 'structured',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'derived',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: false, // Capa é estritamente isolada: exatamente 1 por página
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 19. BOTTOM HEADER
  bottom_header: {
    blockType: 'bottom_header',
    displayName: 'Rodapé Técnico Metrológico',
    engineFamily: 'flow',
    inspectorFamily: 'hero',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título da Empresa',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_SUBTITLE,
        label: 'Subtítulo',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_BADGE,
        label: 'Selo / Certificação',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_PHONE,
        label: 'Telefone',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_EMAIL,
        label: 'E-mail',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_WEBSITE,
        label: 'Website',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.APPEARANCE_GRADIENT,
        label: 'Gradiente de Fundo',
        category: 'appearance',
        valueKind: 'enum',
        controlHint: 'color',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 20. MATRIX SPEC TABLE
  matrix_spec_table: {
    blockType: 'matrix_spec_table',
    displayName: 'Tabela Matricial de Modelos & Parâmetros',
    engineFamily: 'table_legacy',
    inspectorFamily: 'table',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título da Matriz',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.DATA_MATRIX_COLUMNS,
        label: 'Colunas de Modelos Matriciais',
        category: 'data',
        valueKind: 'structured',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.DATA_MATRIX_ROWS,
        label: 'Linhas de Parâmetros e Valores',
        category: 'data',
        valueKind: 'structured',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 21. SOFTWARE CONNECTIVITY
  software_connectivity: {
    blockType: 'software_connectivity',
    displayName: 'Conectividade & Softwares',
    engineFamily: 'flow',
    inspectorFamily: 'composite',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título da Seção',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_BADGE,
        label: 'Selo / Badge Superior',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_ITEMS,
        label: 'Cards de Softwares e Protocolos',
        category: 'content',
        valueKind: 'collection',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: false,
      canReorder: true
    }
  },

  // 22. STRUCTURAL SECTION
  // REFERÊNCIA ARQUITETURAL CANÔNICA (Fase 3A.2)
  structural_section: {
    blockType: 'structural_section',
    displayName: 'Seção Estrutural Presys',
    engineFamily: 'structural',
    inspectorFamily: 'structural',
    capabilities: [
      {
        id: CAPABILITY_IDS.CONTENT_TITLE,
        label: 'Título da Seção',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_SUBTITLE,
        label: 'Subtítulo da Seção',
        category: 'content',
        valueKind: 'text',
        controlHint: 'textarea',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.CONTENT_BADGE,
        label: 'Selo / Badge Superior',
        category: 'content',
        valueKind: 'text',
        controlHint: 'text',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'translate',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.MEDIA_SEMANTIC_ICON,
        label: 'Ícone Semântico Corporativo da Seção',
        category: 'media',
        valueKind: 'enum',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      },
      {
        id: CAPABILITY_IDS.LAYOUT_MODE,
        label: 'Modo de Distribuição dos Cards',
        category: 'layout',
        valueKind: 'enum',
        controlHint: 'segmented',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'to_factory',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only',
        constraints: {
          options: [
            { label: 'Grid Multicolunas', value: 'grid' },
            { label: 'Pilha Vertical (Stack)', value: 'stack' }
          ]
        }
      },
      {
        id: CAPABILITY_IDS.LAYOUT_WIDTH_MODE,
        label: 'Modo de Largura da Seção',
        category: 'layout',
        valueKind: 'enum',
        controlHint: 'segmented',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'to_factory',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only',
        constraints: {
          options: [
            { label: 'Preencher Folha (Fill)', value: 'fill' },
            { label: 'Largura Fixa (Fixed)', value: 'fixed' }
          ]
        }
      },
      {
        id: CAPABILITY_IDS.LAYOUT_FIXED_WIDTH_MM,
        label: 'Largura Fixa em Milímetros',
        category: 'layout',
        valueKind: 'dimension',
        controlHint: 'dimension',
        unit: 'mm',
        defaultSource: 'derived',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only',
        constraints: {
          numeric: {
            exclusiveMin: 0,
            maxSource: 'page_content_width_mm'
          }
        }
      },
      {
        id: CAPABILITY_IDS.LAYOUT_COLUMNS,
        label: 'Número de Colunas no Grid',
        category: 'layout',
        valueKind: 'number',
        controlHint: 'segmented',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'to_factory',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only',
        constraints: {
          options: [
            { label: '1', value: 1 },
            { label: '2', value: 2 },
            { label: '3', value: 3 },
            { label: '4', value: 4 },
            { label: '5', value: 5 },
            { label: '6', value: 6 }
          ]
        }
      },
      {
        id: CAPABILITY_IDS.LAYOUT_GAP,
        label: 'Espaçamento Entre Cards (Gap)',
        category: 'layout',
        valueKind: 'enum',
        controlHint: 'select',
        unit: 'token',
        defaultSource: 'factory',
        resetPolicy: 'to_factory',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only',
        constraints: {
          options: [
            { label: 'Nenhum', value: 'none' },
            { label: 'Extra Pequeno (xs)', value: 'xs' },
            { label: 'Pequeno (sm)', value: 'sm' },
            { label: 'Médio (md)', value: 'md' },
            { label: 'Grande (lg)', value: 'lg' },
            { label: 'Extra Grande (xl)', value: 'xl' }
          ]
        }
      },
      {
        id: CAPABILITY_IDS.LAYOUT_PADDING,
        label: 'Espaçamento Interno da Seção',
        category: 'layout',
        valueKind: 'enum',
        controlHint: 'select',
        unit: 'token',
        defaultSource: 'factory',
        resetPolicy: 'to_factory',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only',
        constraints: {
          options: [
            { label: 'Nenhum', value: 'none' },
            { label: 'Extra Pequeno (xs)', value: 'xs' },
            { label: 'Pequeno (sm)', value: 'sm' },
            { label: 'Médio (md)', value: 'md' },
            { label: 'Grande (lg)', value: 'lg' },
            { label: 'Extra Grande (xl)', value: 'xl' }
          ]
        }
      },
      {
        id: CAPABILITY_IDS.LAYOUT_DENSITY,
        label: 'Densidade Vertical dos Cards',
        category: 'layout',
        valueKind: 'enum',
        controlHint: 'segmented',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'to_factory',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only',
        constraints: {
          options: [
            { label: 'Compacta', value: 'compact' },
            { label: 'Normal', value: 'normal' },
            { label: 'Confortável', value: 'comfortable' }
          ]
        }
      },
      {
        id: CAPABILITY_IDS.LAYOUT_ALIGNMENT,
        label: 'Alinhamento Horizontal no Grid',
        category: 'layout',
        valueKind: 'enum',
        controlHint: 'segmented',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'to_factory',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only',
        constraints: {
          options: [
            { label: 'Esquerda', value: 'left' },
            { label: 'Centro', value: 'center' },
            { label: 'Direita', value: 'right' }
          ]
        }
      },
      {
        id: CAPABILITY_IDS.APPEARANCE_BACKGROUND,
        label: 'Estilo de Fundo da Seção',
        category: 'appearance',
        valueKind: 'enum',
        controlHint: 'select',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'to_factory',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only',
        constraints: {
          options: [
            { label: 'Transparente', value: 'transparent' },
            { label: 'Superfície (Branco)', value: 'surface' },
            { label: 'Suave (Cinza Claro)', value: 'soft' },
            { label: 'Técnico Corporativo', value: 'technical' }
          ]
        }
      },
      {
        id: CAPABILITY_IDS.APPEARANCE_BORDER,
        label: 'Estilo de Borda da Seção',
        category: 'appearance',
        valueKind: 'enum',
        controlHint: 'select',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'to_factory',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only',
        constraints: {
          options: [
            { label: 'Nenhuma', value: 'none' },
            { label: 'Sutil', value: 'subtle' },
            { label: 'Sólida', value: 'solid' },
            { label: 'Destaque (Accent)', value: 'accent' }
          ]
        }
      },
      {
        id: CAPABILITY_IDS.APPEARANCE_RADIUS,
        label: 'Raio das Bordas dos Cards',
        category: 'appearance',
        valueKind: 'enum',
        controlHint: 'select',
        unit: 'none',
        defaultSource: 'factory',
        resetPolicy: 'to_factory',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only',
        constraints: {
          options: [
            { label: 'Reto (Nenhum)', value: 'none' },
            { label: 'Pequeno (sm)', value: 'sm' },
            { label: 'Médio (md)', value: 'md' },
            { label: 'Grande (lg)', value: 'lg' }
          ]
        }
      },
      {
        id: CAPABILITY_IDS.LAYERS_CHILDREN,
        label: 'Cards Filhos Estruturais',
        category: 'layers',
        valueKind: 'collection',
        controlHint: 'custom',
        unit: 'none',
        defaultSource: 'preset',
        resetPolicy: 'none',
        rendererSupport: { editor: true, print: true },
        translationPolicy: 'none',
        writePolicy: 'user_only'
      }
    ],
    universalActions: {
      canDuplicate: true,
      canDelete: true,
      canReset: true,
      canReorder: true
    }
  }
};

// ============================================================================
// Funções Utilitárias do Registro (Fail-Closed)
// ============================================================================

/**
 * Retorna a definição completa de capabilities de um BlockType.
 * Se o BlockType for desconhecido, falha fechado retornando null.
 */
export function getElementCapabilityDefinition(
  blockType: string
): ElementCapabilityDefinition | null {
  if (Object.prototype.hasOwnProperty.call(ElementCapabilityRegistry, blockType)) {
    return ElementCapabilityRegistry[blockType as BlockType];
  }
  return null;
}

/**
 * Verifica se um BlockType possui suporte a uma determinada CapabilityId.
 */
export function hasCapability(
  blockType: string,
  capabilityId: CapabilityId
): boolean {
  const def = getElementCapabilityDefinition(blockType);
  if (!def) return false;
  return def.capabilities.some((c) => c.id === capabilityId);
}

/**
 * Retorna a especificação de uma capability específica em um BlockType.
 */
export function getCapability(
  blockType: string,
  capabilityId: CapabilityId
): PropertyCapability | null {
  const def = getElementCapabilityDefinition(blockType);
  if (!def) return null;
  return def.capabilities.find((c) => c.id === capabilityId) || null;
}

/**
 * Retorna a lista de todas as definições registradas.
 */
export function getAllElementCapabilityDefinitions(): ElementCapabilityDefinition[] {
  return Object.values(ElementCapabilityRegistry);
}

/**
 * Executa validação de sanidade em tempo de execução via Zod em todas as entradas.
 */
export function validateElementCapabilityRegistry(): { success: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const [key, def] of Object.entries(ElementCapabilityRegistry)) {
    const res = ElementCapabilityDefinitionSchema.safeParse(def);
    if (!res.success) {
      errors.push(`Erro de validação no elemento '${key}': ${res.error.message}`);
    }
  }
  return {
    success: errors.length === 0,
    errors
  };
}

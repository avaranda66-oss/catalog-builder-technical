import {
  CatalogPage,
  PageSection,
  CatalogPreset,
  DesignTokens,
  ContactInfo,
  createSection,
  createPage,
} from '../types/catalog-builder'
import { Catalog, Product, FieldDefinition } from '../types/database'

// ============================================================================
// DEFAULT DESIGN TOKENS — Presys Industrial
// ============================================================================

export const PRESYS_DESIGN_TOKENS: DesignTokens = {
  colors: {
    primary: '#003366',
    dark: '#001A33',
    accent: '#2563EB',
    headerBg: '#1A1A2E',
    headerText: '#FFFFFF',
    surface: '#FAFAFA',
    border: '#D4D4D4',
  },
  fonts: {
    heading: 'Inter, sans-serif',
    body: 'Inter, sans-serif',
    data: 'JetBrains Mono, monospace',
  },
  spacing: {
    pageMarginMm: 15,
    sectionGapMm: 6,
    cellHeightPx: 44,
  },
}

export const PRESYS_CONTACT: ContactInfo = {
  companyName: 'Presys Instrumentos',
  logoUrl: '/img/logo-presys.png',
  website: 'www.presys.com.br',
  phone: '+55 (11) 3038-1300',
  email: 'vendas@presys.com.br',
}

// ============================================================================
// DEFAULT PAGES — the template structure for a PCON-style catalog
// ============================================================================

export const DEFAULT_PAGES: CatalogPage[] = [
  createPage('Capa e Visão Geral', [
    createSection('hero_banner', {
      title: 'Capa e Destaques',
      content: {
        logoUrl: PRESYS_CONTACT.logoUrl,
        companyTag: 'Calibração e Instrumentação',
      },
    }),
  ]),
  createPage('Especificações Técnicas', [
    createSection('specs_table', {
      title: 'Especificações de Pressão',
      content: {
        rows: [
          { param: 'Faixa de Controle', value: '' },
          { param: 'Estabilidade de Controle', value: '' },
          { param: 'Exatidão da Indicação', value: '' },
          { param: 'Tempo de Controle', value: '' },
          { param: 'Compatibilidade de Fluido', value: '' },
        ],
      },
    }),
    createSection('electrical_table', {
      title: 'Calibrador de Processos Elétricos',
      content: { rows: [] },
    }),
  ]),
  createPage('Dados Gerais e Acessórios', [
    createSection('general_specs_table', {
      title: 'Especificações Gerais',
      content: { rows: [] },
    }),
    createSection('accessories_table', {
      title: 'Acessórios e Opcionais',
      content: { rows: [] },
    }),
    createSection('contact_footer', {
      title: 'Rodapé de Contato',
      content: { ...PRESYS_CONTACT },
    }),
  ]),
]

// ============================================================================
// SYSTEM PRESETS
// ============================================================================

export const SYSTEM_PRESETS: CatalogPreset[] = [
  {
    id: 'preset-presys-industrial',
    name: 'Presys Industrial Standard',
    description: 'Layout técnico industrial oficial Presys com azul corporativo (#003366), cabeçalho escuro e tabelas metrológicas.',
    design_tokens: PRESYS_DESIGN_TOKENS,
    contact: PRESYS_CONTACT,
    default_pages: DEFAULT_PAGES,
    is_system: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'preset-fluke-metrology',
    name: 'Fluke Calibration Style (914X / 75X)',
    description: 'Layout clássico estilo Fluke Calibration com detalhes em amarelo industrial (#D97706), tipografia técnica e matriz de pedido.',
    design_tokens: {
      colors: {
        primary: '#D97706',
        dark: '#18181B',
        accent: '#B45309',
        headerBg: '#18181B',
        headerText: '#FFFFFF',
        surface: '#FAFAFA',
        border: '#D4D4D4',
      },
      fonts: {
        heading: 'Inter, sans-serif',
        body: 'Inter, sans-serif',
        data: 'JetBrains Mono, monospace',
      },
      spacing: { pageMarginMm: 15, sectionGapMm: 6, cellHeightPx: 44 },
    },
    contact: PRESYS_CONTACT,
    default_pages: DEFAULT_PAGES,
    is_system: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'preset-additel-precision',
    name: 'Additel Precision Style (761A / 875)',
    description: 'Layout moderno estilo Additel com azul elétrico (#0284C7), grid de especificações técnicas e destaques em duas colunas.',
    design_tokens: {
      colors: {
        primary: '#0284C7',
        dark: '#0F172A',
        accent: '#0369A1',
        headerBg: '#0F172A',
        headerText: '#FFFFFF',
        surface: '#F8FAFC',
        border: '#CBD5E1',
      },
      fonts: {
        heading: 'Inter, sans-serif',
        body: 'Inter, sans-serif',
        data: 'JetBrains Mono, monospace',
      },
      spacing: { pageMarginMm: 14, sectionGapMm: 5, cellHeightPx: 42 },
    },
    contact: PRESYS_CONTACT,
    default_pages: DEFAULT_PAGES,
    is_system: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'preset-isotech-calibration',
    name: 'Isotech Isocal Style (Venus / Europa)',
    description: 'Layout focado em blocos térmicos e calibração de temperatura com acabamento bordô/navy (#991B1B) e diagramas de aplicação.',
    design_tokens: {
      colors: {
        primary: '#991B1B',
        dark: '#1E1B4B',
        accent: '#B91C1C',
        headerBg: '#1E1B4B',
        headerText: '#FFFFFF',
        surface: '#FFFFFF',
        border: '#E2E8F0',
      },
      fonts: {
        heading: 'Inter, sans-serif',
        body: 'Inter, sans-serif',
        data: 'JetBrains Mono, monospace',
      },
      spacing: { pageMarginMm: 14, sectionGapMm: 6, cellHeightPx: 42 },
    },
    contact: PRESYS_CONTACT,
    default_pages: DEFAULT_PAGES,
    is_system: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'preset-clean-white',
    name: 'Clean White Minimalist',
    description: 'Layout limpo com fundo claro, ideal para impressão econômica e alta legibilidade.',
    design_tokens: {
      colors: {
        primary: '#2563EB',
        dark: '#1E293B',
        accent: '#3B82F6',
        headerBg: '#F1F5F9',
        headerText: '#0F172A',
        surface: '#FFFFFF',
        border: '#E2E8F0',
      },
      fonts: {
        heading: 'Inter, sans-serif',
        body: 'Inter, sans-serif',
        data: 'JetBrains Mono, monospace',
      },
      spacing: { pageMarginMm: 12, sectionGapMm: 5, cellHeightPx: 40 },
    },
    contact: PRESYS_CONTACT,
    default_pages: DEFAULT_PAGES,
    is_system: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

// ============================================================================
// INITIAL CATALOG
// ============================================================================

export const INITIAL_CATALOG: Catalog = {
  id: 'a0000000-0000-0000-0000-000000000001',
  name: 'PCON Series — Controladores e Calibradores de Pressão',
  locale: 'pt-BR',
  status: 'published',
  template_key: 'presys-premium',
  brand: {
    companyName: PRESYS_CONTACT.companyName,
    primaryColor: '#003366',
    darkColor: '#001A33',
    accentColor: '#2563EB',
    logoUrl: PRESYS_CONTACT.logoUrl,
    website: PRESYS_CONTACT.website,
    phone: PRESYS_CONTACT.phone,
    email: PRESYS_CONTACT.email,
  },
  version: 1,
  updated_by: null,
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
}

// ============================================================================
// INITIAL FIELD DEFINITIONS — editable by the user
// ============================================================================

export const INITIAL_FIELD_DEFINITIONS: FieldDefinition[] = [
  { id: 'f-1', catalog_id: INITIAL_CATALOG.id, section: 'marketing', key: 'title', label: 'Título Comercial', field_type: 'text', unit: null, validation: { required: true }, sort_order: 1, visible_in_catalog: true, created_at: new Date().toISOString() },
  { id: 'f-2', catalog_id: INITIAL_CATALOG.id, section: 'marketing', key: 'subtitle', label: 'Subtítulo', field_type: 'text', unit: null, validation: {}, sort_order: 2, visible_in_catalog: true, created_at: new Date().toISOString() },
  { id: 'f-3', catalog_id: INITIAL_CATALOG.id, section: 'marketing', key: 'overview', label: 'Descrição Geral', field_type: 'multiline', unit: null, validation: { required: true }, sort_order: 3, visible_in_catalog: true, created_at: new Date().toISOString() },
  { id: 'f-4', catalog_id: INITIAL_CATALOG.id, section: 'specs', key: 'control_range', label: 'Faixa de Controle', field_type: 'range', unit: 'bar', validation: {}, sort_order: 10, visible_in_catalog: true, created_at: new Date().toISOString() },
  { id: 'f-5', catalog_id: INITIAL_CATALOG.id, section: 'specs', key: 'stability', label: 'Estabilidade', field_type: 'measurement', unit: '%FS', validation: {}, sort_order: 11, visible_in_catalog: true, created_at: new Date().toISOString() },
  { id: 'f-6', catalog_id: INITIAL_CATALOG.id, section: 'specs', key: 'accuracy', label: 'Exatidão', field_type: 'accuracy', unit: '%FS', validation: {}, sort_order: 12, visible_in_catalog: true, created_at: new Date().toISOString() },
]

// ============================================================================
// INITIAL PRODUCTS — demo seed (PCON is just an example)
// ============================================================================

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'b0000000-0000-0000-0000-000000000001',
    catalog_id: INITIAL_CATALOG.id,
    sku: 'PCON-Y17',
    name: 'PCON-Y17 Controlador de Bancada',
    family: 'PCON',
    status: 'published',
    sort_order: 1,
    version: 1,
    updated_by: null,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    data: {
      marketing: {
        title: 'Controlador e Calibrador Automático de Pressão de Alta Precisão',
        subtitle: 'Calibradores de Pressão Documentadores',
        overview: 'O PCON-Y17 é um controlador e calibrador automático de pressão de alta precisão projetado para aplicações metrológicas exigentes em laboratórios e oficinas.',
        features: [
          'Controle automático de pressão desde vácuo até 3000 psi (210 bar)',
          'Estabilidade de controle de 0,002% do Fundo de Escala (FS)',
          'Exatidão metrológica de até ± 0,012% FS com sensores internos',
          'Display touchscreen colorido de 5,7 polegadas',
          'Medição simultânea de sinais elétricos (mA, V, mV, ohm, RTD)',
          'Configurador HART integrado opcional',
          'Compatível com software ISOPLAN',
          'Relatórios automatizados em PDF, CSV e XML',
        ],
      },
      specs: [
        { param: 'Faixa de Controle', value: 'Vácuo a 3000 psi (210 bar)' },
        { param: 'Estabilidade de Controle', value: '± 0,002% FS' },
        { param: 'Exatidão da Indicação', value: '± 0,012% FS' },
        { param: 'Tempo de Controle', value: 'Aprox. 10 segundos' },
        { param: 'Módulos de Pressão', value: 'Até 3 sensores de alta exatidão' },
        { param: 'Fluidos Compatíveis', value: 'Gás limpo e seco (ar, nitrogênio)' },
        { param: 'Temperatura de Operação', value: '0 °C a 50 °C' },
      ],
      electrical: [
        { signal: 'Corrente (mA)', range: '-1 a 24,5 mA', resolution: '0,0001 mA', accuracy: '± 0,02% FS', note: 'Impedância < 10 ohm' },
        { signal: 'Tensão (V)', range: '-1 a 30 Vdc', resolution: '0,0001 V', accuracy: '± 0,01% FS', note: 'Impedância > 1 Mohm' },
        { signal: 'Milivolt (mV)', range: '-10 a 150 mV', resolution: '0,001 mV', accuracy: '± 0,01% FS', note: 'Impedância > 1 Gohm' },
        { signal: 'Resistência (ohm)', range: '0 a 400 ohm / 0 a 2500 ohm', resolution: '0,01 ohm', accuracy: '± 0,01% FS', note: '2, 3 ou 4 fios' },
        { signal: 'Temperatura RTD', range: '-200 a 850 °C', resolution: '0,01 °C', accuracy: '± 0,1 °C', note: 'Pt-100, Pt-500, Pt-1000' },
      ],
      general: [
        { param: 'Interface', desc: 'Display touchscreen colorido 5,7"' },
        { param: 'Comunicação', desc: 'Ethernet RJ45, USB, Wi-Fi opcional' },
        { param: 'Protocolos', desc: 'SCPI, Modbus RTU/TCP, HART opcional' },
        { param: 'Dimensões', desc: '135 x 350 x 270 mm (Mesa)' },
        { param: 'Peso', desc: 'Aprox. 5,0 kg (Mesa) / 9,5 kg (Rack)' },
        { param: 'Alimentação', desc: '100 a 240 Vac, 50/60 Hz' },
        { param: 'Garantia', desc: '1 Ano contra defeitos de fabricação' },
      ],
      accessories: [
        { code: '06.01.1031-00', description: 'Bolsa de transporte reforçada', type: 'Standard' },
        { code: '06.07.0025-00', description: 'Kit de cabos de ponta de prova', type: 'Standard' },
        { code: 'SI-1000', description: 'Filtro separador de impurezas', type: 'Optional' },
        { code: 'ISOPLAN-5', description: 'Software de calibração ISOPLAN', type: 'Optional' },
      ],
    },
  },
  {
    id: 'b0000000-0000-0000-0000-000000000002',
    catalog_id: INITIAL_CATALOG.id,
    sku: 'PCON-Y18-LP',
    name: 'PCON-Y18-LP Calibrador de Baixa Pressão',
    family: 'PCON',
    status: 'published',
    sort_order: 2,
    version: 1,
    updated_by: null,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    data: {
      marketing: {
        title: 'Calibrador Automático para Baixa Pressão e Pressão Diferencial',
        subtitle: 'Calibração em Nível Pascal',
        overview: 'O PCON-Y18-LP é especializado para baixas pressões e calibrações diferenciais com estabilidade de controle em níveis de Pascal.',
        features: [
          'Calibração dedicada de baixíssima pressão e pressão diferencial',
          'Estabilidade de controle ultra-fina de até ± 0,05 Pa',
          'Exatidão metrológica de até ± 0,25 Pa',
          'Display touchscreen interativo de 5,7 polegadas',
          'Calibrador de sinais elétricos integrado',
          'Geração automática de relatórios em PDF via USB',
        ],
      },
      specs: [
        { param: 'Faixa de Controle', value: 'Baixa Pressão e Diferencial (±10 mbar, ±100 mbar)' },
        { param: 'Estabilidade de Controle', value: '± 0,05 Pa' },
        { param: 'Exatidão da Indicação', value: 'Até ± 0,25 Pa' },
        { param: 'Tempo de Controle', value: 'Aprox. 10 a 15 segundos' },
        { param: 'Fluidos Compatíveis', value: 'Ar limpo e seco ou gases não-corrosivos' },
      ],
    },
  },
]

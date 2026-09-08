import { CatalogPreset } from '../domain/catalog.schema';
import { buildPresysTechnicalCatalog } from './presys-technical-catalogs';

export const SYSTEM_PRESETS: CatalogPreset[] = [
  // =========================================================================
  // GRUPO A: TEMPLATES / ESQUELETOS DE ESTRUTURA EM BRANCO (SEM PRODUTO FIXO)
  // =========================================================================
  {
    id: 'template-3pages-technical',
    name: 'Esqueleto: Ficha Técnica Completa (3 Páginas em Branco)',
    description: 'Estrutura pré-moldada de 3 páginas: Capa editorial em branco, página técnica com tabela e features vazias, e página de acessórios/diagramas.',
    category: 'layout_template',
    isSystem: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    catalog: {
      id: 'cat-template-3pages',
      title: 'Novo Catálogo Técnico',
      subtitle: 'Subtítulo do Documento ou Linha de Produtos',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1-template-cover',
          pageNumber: 1,
          pageType: 'cover',
          title: 'Capa Editorial (Em Branco)',
          blocks: [
            {
              id: 'b1-template-hero',
              type: 'full_page_cover',
              title: 'NOME DO EQUIPAMENTO',
              subtitle: 'Subtítulo Comercial / Descritivo Técnico',
              badgeText: 'PRESYS INSTRUMENTAÇÃO · ESPECIFICAÇÃO TÉCNICA',
              imageUrl: '',
              customData: {
                coverStyle: 'clean_gradient',
                overlayOpacity: 30,
                textAlign: 'left',
                showLogoBox: true,
                showAccentLine: true,
                brandName: 'PRESYS',
                brandSubtitle: 'INSTRUMENTOS & SISTEMAS',
                overview: 'Insira aqui a visão geral do produto, principais aplicações industriais e diferenciais de engenharia.',
                footerLeft: 'www.presys.com.br · vendas@presys.com.br',
                footerRight: 'PRESYS METROLOGY & PROCESS AUTOMATION'
              }
            }
          ]
        },
        {
          id: 'p2-template-specs',
          pageNumber: 2,
          pageType: 'technical',
          title: 'Ficha Técnica (Em Branco)',
          blocks: [
            {
              id: 'b2-template-header',
              type: 'hero_banner',
              badgeText: 'ESPECIFICAÇÕES TÉCNICAS E OPERACIONAIS',
              title: 'Visão Geral e Parâmetros Técnicos',
              subtitle: 'Descrição técnica detalhada das capacidades e faixas de operação.',
              imageUrl: '',
              imageCaption: 'Foto do equipamento em bancada ou laboratório.'
            },
            {
              id: 'b3-template-table',
              type: 'table',
              title: 'Tabela de Especificações do Produto',
              tableColumns: [
                { key: 'code', label: 'Código', visible: true, width: 110 },
                { key: 'model', label: 'Modelo', visible: true, width: 130 },
                { key: 'range', label: 'Faixa Operacional', visible: true, width: 140 },
                { key: 'accuracy', label: 'Exatidão', visible: true, width: 120 },
                { key: 'output', label: 'Sinal de Saída', visible: true, width: 130 }
              ],
              tableRows: []
            },
            {
              id: 'b4-template-features',
              type: 'features_list',
              title: 'Recursos e Diferenciais',
              features: [
                { id: 'f1', title: 'Recurso Principal 1', description: 'Descreva aqui o primeiro diferencial técnico do instrumento.' },
                { id: 'f2', title: 'Recurso Principal 2', description: 'Descreva aqui o segundo diferencial técnico do instrumento.' }
              ]
            },
            {
              id: 'b5-template-bottom',
              type: 'bottom_header',
              title: 'PRESYS INSTRUMENTOS E SISTEMAS LTDA'
            }
          ]
        },
        {
          id: 'p3-template-diagrams',
          pageNumber: 3,
          pageType: 'technical',
          title: 'Acessórios & Diagramas (Em Branco)',
          blocks: [
            {
              id: 'b6-template-inserts',
              type: 'inserts_visual',
              title: 'Acessórios e Insertos Compatíveis',
              subtitle: 'Selecione os blocos de prova ou acessórios recomendados.',
              badgeText: 'ACESSÓRIOS ORIGINAIS',
              customData: {
                selectedInserts: ['IN01', 'IN02', 'IN03', 'IN04', 'IN05', 'IN06', 'INCL']
              }
            },
            {
              id: 'b7-template-conn',
              type: 'software_connectivity',
              title: 'Conectividade e Ligações Frontais',
              subtitle: 'Diagrama ilustrativo das conexões elétricas e de processo.',
              badgeText: 'INTERFACE MULTISSINAIS'
            },
            {
              id: 'b8-template-footer',
              type: 'bottom_header',
              title: 'PRESYS — ENGENHARIA DE METROLOGIA'
            }
          ]
        }
      ]
    }
  },
  {
    id: 'template-2pages-cover-specs',
    name: 'Esqueleto: Capa Fotográfica + Ficha Técnica (2 Páginas em Branco)',
    description: 'Estrutura ideal para catálogo executivo de 2 páginas: Capa de alto impacto e verso com especificações técnicas e tabela.',
    category: 'layout_template',
    isSystem: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    catalog: {
      id: 'cat-template-2pages',
      title: 'Catálogo Comercial 2 Páginas',
      subtitle: 'Estrutura Executiva de Apresentação',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1-template-cover2',
          pageNumber: 1,
          pageType: 'cover',
          title: 'Capa Editorial',
          blocks: [
            {
              id: 'b1-cover2',
              type: 'full_page_cover',
              title: 'MODELO DO PRODUTO',
              subtitle: 'Linha de Instrumentação Industrial',
              badgeText: 'PRESYS INDUSTRIAL · DOCUMENTAÇÃO TÉCNICA',
              imageUrl: '',
              customData: {
                coverStyle: 'photo_hero',
                overlayOpacity: 40,
                textAlign: 'left',
                showLogoBox: true,
                showAccentLine: true,
                brandName: 'PRESYS',
                brandSubtitle: 'INSTRUMENTS & SYSTEMS',
                overview: 'Insira o resumo executivo e a proposta de valor do produto neste espaço.',
                footerLeft: 'www.presys.com.br · vendas@presys.com.br',
                footerRight: 'PRESYS METROLOGY & AUTOMATION'
              }
            }
          ]
        },
        {
          id: 'p2-template-specs2',
          pageNumber: 2,
          pageType: 'technical',
          title: 'Ficha Técnica',
          blocks: [
            {
              id: 'b2-header2',
              type: 'hero_banner',
              badgeText: 'ESPECIFICAÇÕES DE ENGENHARIA',
              title: 'Dados Técnicos e Metrológicos',
              subtitle: 'Tabela de modelos, faixas e conectividade.',
              imageUrl: '',
              imageCaption: 'Instrumento em operação.'
            },
            {
              id: 'b3-table2',
              type: 'table',
              title: 'Tabela Comparativa de Modelos',
              tableColumns: [
                { key: 'code', label: 'Código', visible: true, width: 110 },
                { key: 'model', label: 'Modelo', visible: true, width: 130 },
                { key: 'range', label: 'Faixa Operacional', visible: true, width: 140 },
                { key: 'accuracy', label: 'Exatidão', visible: true, width: 120 }
              ],
              tableRows: []
            },
            {
              id: 'b4-bottom2',
              type: 'bottom_header',
              title: 'PRESYS INSTRUMENTOS E SISTEMAS LTDA'
            }
          ]
        }
      ]
    }
  },
  {
    id: 'template-1page-comparison-matrix',
    name: 'Esqueleto: Matriz Comparativa de Linha (1 Página em Branco)',
    description: 'Estrutura de 1 página A4 dedicada a tabela comparativa matricial de múltiplos produtos, famílias e acessórios.',
    category: 'layout_template',
    isSystem: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    catalog: {
      id: 'cat-template-matrix',
      title: 'Matriz Comparativa de Instrumentos',
      subtitle: 'Guia de Seleção Técnica e Modelos',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1-matrix',
          pageNumber: 1,
          pageType: 'technical',
          title: 'Matriz Comparativa',
          blocks: [
            {
              id: 'b1-matrix-header',
              type: 'hero_banner',
              badgeText: 'GUIA DE SELEÇÃO E COMPARATIVO',
              title: 'Comparativo Técnico de Modelos',
              subtitle: 'Analise as faixas, exatidões e opcionais de cada versão.',
              imageUrl: '',
              imageCaption: 'Linha completa de instrumentos.'
            },
            {
              id: 'b2-matrix-table',
              type: 'matrix_spec_table',
              title: 'Matriz de Recursos e Especificações',
              subtitle: 'Tabela detalhada de parâmetros cruzados por modelo.',
              badgeText: 'MATRIZ TÉCNICA'
            },
            {
              id: 'b3-matrix-bottom',
              type: 'bottom_header',
              title: 'PRESYS INSTRUMENTOS E SISTEMAS LTDA'
            }
          ]
        }
      ]
    }
  },
  {
    id: 'template-1page-executive-datasheet',
    name: 'Esqueleto: One-Pager Executivo (1 Página em Branco)',
    description: 'Estrutura compacta de 1 folha A4 com cabeçalho, tabela de especificações, bullet points e rodapé.',
    category: 'layout_template',
    isSystem: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    catalog: {
      id: 'cat-template-onepager',
      title: 'Datasheet Comercial 1 Página',
      subtitle: 'Ficha Rápida para Engenharia e Vendas',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1-onepager',
          pageNumber: 1,
          pageType: 'cover',
          title: 'Datasheet Executivo',
          blocks: [
            {
              id: 'b1-onepager-hero',
              type: 'hero_banner',
              badgeText: 'PRESYS — INSTRUMENTAÇÃO INDUSTRIAL DE PRECISÃO',
              title: 'Nome do Equipamento / Modelo',
              subtitle: 'Resumo das características funcionais e faixa de trabalho.',
              imageUrl: '',
              imageCaption: 'Foto do instrumento.'
            },
            {
              id: 'b2-onepager-table',
              type: 'table',
              title: 'Especificações Técnicas Principais',
              tableColumns: [
                { key: 'code', label: 'Código', visible: true, width: 110 },
                { key: 'model', label: 'Modelo', visible: true, width: 130 },
                { key: 'range', label: 'Faixa', visible: true, width: 120 },
                { key: 'accuracy', label: 'Exatidão', visible: true, width: 120 }
              ],
              tableRows: []
            },
            {
              id: 'b3-onepager-features',
              type: 'features_list',
              title: 'Recursos Metrológicos',
              features: [
                { id: 'f1', title: 'Recurso 1', description: 'Destaque operacional do equipamento.' },
                { id: 'f2', title: 'Recurso 2', description: 'Destaque operacional do equipamento.' }
              ]
            },
            {
              id: 'b4-onepager-bottom',
              type: 'bottom_header',
              title: 'PRESYS INSTRUMENTOS & SISTEMAS LTDA'
            }
          ]
        }
      ]
    }
  },

  // =========================================================================
  // GRUPO B: CATÁLOGOS / DATASHEETS DE PRODUTOS OFICIAIS PRONTOS (COM DADOS)
  // =========================================================================
  {
    id: 'preset-presys-ta-25n-datasheet',
    name: 'PRESYS TA-25N — Datasheet Técnico',
    description: 'Datasheet técnico completo de 6 páginas em alta densidade, estruturado no padrão Additel com tabelas especializadas Table V2, especificações de medição elétrica, insertos e fornecimento padrão.',
    category: 'official_product_catalog',
    isSystem: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    catalog: buildPresysTechnicalCatalog('TA-25N')
  },
  {
    id: 'preset-presys-ta-35n-datasheet',
    name: 'PRESYS TA-35N — Datasheet Técnico',
    description: 'Datasheet técnico completo de 6 páginas em alta densidade, estruturado no padrão Additel com tabelas especializadas Table V2, faixa até -35 °C, potência 300 W e insertos intercambiáveis.',
    category: 'official_product_catalog',
    isSystem: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    catalog: buildPresysTechnicalCatalog('TA-35N')
  },
  {
    id: 'preset-presys-ta-50n-datasheet',
    name: 'PRESYS TA-50N — Datasheet Técnico',
    description: 'Datasheet técnico completo de 6 páginas em alta densidade, estruturado no padrão Additel com tabelas especializadas Table V2, faixa criogênica até -50 °C, potência 400 W e insertos intercambiáveis.',
    category: 'official_product_catalog',
    isSystem: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    catalog: buildPresysTechnicalCatalog('TA-50N')
  },
  {
    id: 'preset-presys-psv-portable-full-bleed',
    name: 'PRESYS PSV Portable — Estação de Teste de Válvulas de Segurança',
    description: 'Catálogo oficial completo com capa fotográfica full-bleed, especificações de ensaio hidrostático/pneumático de bancada e tabela técnica.',
    category: 'official_product_catalog',
    isSystem: true,
    createdAt: '2026-08-31T12:00:00.000Z',
    catalog: {
      id: 'cat-preset-psv-portable',
      title: 'PRESYS PSV Portable — Portable Safety Valve Test Station',
      subtitle: 'Estação Portátil de Testes e Calibração de Válvulas de Segurança e Alívio',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1-psv-cover',
          pageNumber: 1,
          pageType: 'cover',
          title: 'Capa Fotográfica Full-Bleed',
          blocks: [
            {
              id: 'b1-psv-full-cover',
              type: 'full_page_cover',
              title: 'PSV PORTABLE',
              subtitle: 'Portable Safety Valve Test Station',
              badgeText: 'PRESYS · METROLOGIA & SEGURANÇA OPERACIONAL',
              imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1400&q=85',
              customData: {
                coverStyle: 'photo_hero',
                overlayOpacity: 45,
                textAlign: 'left',
                showLogoBox: true,
                showAccentLine: true,
                brandName: 'PRESYS',
                brandSubtitle: 'INSTRUMENTOS & SISTEMAS',
                overview: 'Equipamento robusto para ensaios hidrostáticos e pneumáticos de válvulas de segurança (PSV) em campo e oficina, atendendo normas ASME e NR-13 com rastreabilidade digital completa.',
                footerLeft: 'www.presys.com.br · vendas@presys.com.br',
                footerRight: 'PRESYS METROLOGY & PROCESS AUTOMATION'
              }
            }
          ]
        },
        {
          id: 'p2-psv-specs',
          pageNumber: 2,
          pageType: 'technical',
          title: 'Especificações Técnicas de Bancada',
          blocks: [
            {
              id: 'b2-psv-hero',
              type: 'hero_banner',
              badgeText: 'ENGENHARIA E OPERAÇÃO DE CAMPO',
              title: 'Ensaio Automatizado de Válvulas de Alívio e Segurança',
              subtitle: 'Detecção automática de abertura (pop-test), pressão de reassentamento e estanqueidade com registro digital de curvas.',
              imageUrl: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80',
              imageCaption: 'Estação PSV Portable acoplada a bancada de fixação universal.'
            },
            {
              id: 'b3-psv-table',
              type: 'table',
              title: 'Especificações Técnicas do Instrumento',
              tableColumns: [
                { key: 'code', label: 'Código', visible: true, width: 110 },
                { key: 'model', label: 'Modelo', visible: true, width: 130 },
                { key: 'range', label: 'Faixa Operacional', visible: true, width: 140 },
                { key: 'accuracy', label: 'Exatidão', visible: true, width: 120 },
                { key: 'output', label: 'Sinal de Saída', visible: true, width: 130 }
              ],
              tableRows: [
                { id: 'r1', productRefId: 'prod-psv-1000', localOverrides: {}, order: 0 }
              ]
            },
            {
              id: 'b4-psv-bottom',
              type: 'bottom_header',
              title: 'PRESYS INSTRUMENTOS E SISTEMAS LTDA'
            }
          ]
        }
      ]
    }
  },
  {
    id: 'preset-presys-pcon-y18-full',
    name: 'PRESYS PCON-Y18 — Calibrador Automático de Pressão',
    description: 'Catálogo oficial completo com bomba elétrica integrada de -0.9 a 70 bar, tela touch colorida e comunicação HART.',
    category: 'official_product_catalog',
    isSystem: true,
    createdAt: '2026-08-31T12:00:00.000Z',
    catalog: {
      id: 'cat-preset-pcon-y18',
      title: 'PRESYS PCON-Y18 — Calibrador Automático de Pressão',
      subtitle: 'Geração e Controle Automático de Pressão até 70 bar',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1-pcon-cover',
          pageNumber: 1,
          pageType: 'cover',
          title: 'Capa Editorial PCON-Y18',
          blocks: [
            {
              id: 'b1-pcon-hero',
              type: 'full_page_cover',
              title: 'PCON-Y18',
              subtitle: 'Automatic Pressure Calibrator',
              badgeText: 'PRESYS METROLOGY · GERAÇÃO AUTÔNOMA DE PRESSÃO',
              imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1400&q=85',
              customData: {
                coverStyle: 'photo_hero',
                overlayOpacity: 40,
                textAlign: 'left',
                showLogoBox: true,
                showAccentLine: true,
                brandName: 'PRESYS',
                brandSubtitle: 'INSTRUMENTS & SYSTEMS',
                overview: 'Calibrador de pressão automático compacto com bomba elétrica integrada para vácuo e pressão até 70 bar, display touch colorido e comunicador HART.',
                footerLeft: 'www.presys.com.br · vendas@presys.com.br',
                footerRight: 'PRESYS METROLOGY'
              }
            }
          ]
        },
        {
          id: 'p2-pcon-specs',
          pageNumber: 2,
          pageType: 'technical',
          title: 'Ficha Técnica PCON-Y18',
          blocks: [
            {
              id: 'b2-pcon-header',
              type: 'hero_banner',
              badgeText: 'ESPECIFICAÇÕES DE ENGENHARIA',
              title: 'PRESYS PCON-Y18 — Dados Metrológicos',
              subtitle: 'Controle elétrico motorizado com exatidão 0.025% FE e módulo documentador.',
              imageUrl: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80',
              imageCaption: 'PCON-Y18 com bomba interna.'
            },
            {
              id: 'b3-pcon-table',
              type: 'table',
              title: 'Tabela de Especificações',
              tableColumns: [
                { key: 'code', label: 'Código', visible: true, width: 110 },
                { key: 'model', label: 'Modelo', visible: true, width: 130 },
                { key: 'range', label: 'Faixa Operacional', visible: true, width: 140 },
                { key: 'accuracy', label: 'Exatidão', visible: true, width: 120 }
              ],
              tableRows: [
                { id: 'r1', productRefId: 'prod-presys-pcon-y18', localOverrides: {}, order: 0 }
              ]
            },
            {
              id: 'b4-pcon-bottom',
              type: 'bottom_header',
              title: 'PRESYS INSTRUMENTOS E SISTEMAS LTDA'
            }
          ]
        }
      ]
    }
  }
];

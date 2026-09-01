import { CatalogPreset } from '../domain/catalog.schema';

export const SYSTEM_PRESETS: CatalogPreset[] = [
  // =========================================================================
  // PRESET 0: CATÁLOGO OFICIAL PRESYS PSV PORTABLE (CAPA FOTOGRÁFICA FULL-BLEED)
  // =========================================================================
  {
    id: 'preset-presys-psv-portable-full-bleed',
    name: 'Catálogo Presys PSV Portable — Estação de Teste de Válvulas (Capa Fotográfica Full-Bleed)',
    description: 'Design de alto impacto fotográfico: Capa 100% sangrada com foto de bancada industrial, tipografia imponente, especificações de ensaio de bancada e tabela técnica de modelos.',
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
        // Folha 1: Capa Fotográfica Full-Bleed 100% A4
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

        // Folha 2: Especificações Técnicas de Bancada
        {
          id: 'p2-psv-specs',
          pageNumber: 2,
          pageType: 'technical',
          title: 'Especificações Técnicas de Bancada',
          blocks: [
            {
              id: 'b2-psv-hero',
              type: 'hero_banner',
              badgeText: 'PRESYS — ESTAÇÕES DE TESTE EM CAMPO E OFICINA',
              title: 'PSV Portable — Sistema Pneumático e Hidrostático',
              subtitle: 'Faixas de pressão configuráveis até 300 bar, fixação universal de flanges e aquisição automática de dados.',
              imageUrl: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=1000&q=80'
            },
            {
              id: 'b2-psv-table',
              type: 'table',
              title: 'Matriz Comparativa de Modelos PSV Tester',
              tableColumns: [
                { key: 'code', label: 'Código', visible: true, width: 110 },
                { key: 'model', label: 'Modelo', visible: true, width: 140 },
                { key: 'range', label: 'Faixa de Pressão', visible: true, width: 130 },
                { key: 'unit', label: 'Unidade', visible: true, width: 70 },
                { key: 'accuracy', label: 'Exatidão', visible: true, width: 100 },
                { key: 'processConnection', label: 'Conexão / Flange', visible: true, width: 150 }
              ],
              tableRows: [
                { id: 'r1', productRefId: 'prod-presys-pcon-y18', localOverrides: {}, order: 0 },
                { id: 'r2', productRefId: 'prod-pcon-200', localOverrides: {}, order: 1 }
              ]
            },
            {
              id: 'b2-psv-footer',
              type: 'contact_footer',
              title: 'PRESYS INSTRUMENTOS & SISTEMAS LTDA'
            }
          ]
        }
      ]
    }
  },
  {
    id: 'preset-presys-pcon-flagship-4p',
    name: 'Catálogo Oficial Presys PCON-Y18-LP — Calibrador de Pressão & Processos (4 Páginas)',
    description: 'Edição editorial completa: Capa inteira A4 de alto impacto, especificações de pressão e loop HART, diagrama de insertos e furações, galeria de campo, sistema multifunção 4 modos e part number configurável.',
    isSystem: true,
    createdAt: '2026-08-31T12:00:00.000Z',
    catalog: {
      id: 'cat-preset-pcon-flagship-4p',
      title: 'Catálogo Oficial de Calibração & Instrumentação PRESYS 2026',
      subtitle: 'Calibradores de Processos, Padrões Metrológicos e Automação Industrial',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        // Folha 1: Capa Inteira Editorial A4
        {
          id: 'p1-pcon-full-cover',
          pageNumber: 1,
          pageType: 'cover',
          title: 'Capa Editorial A4',
          blocks: [
            {
              id: 'b1-full-cover',
              type: 'full_page_cover',
              title: 'PCON-Y18-LP / SÉRIE CALIBRADORES DE PRESSÃO',
              subtitle: 'Calibrador Automático de Pressão de Alta Estabilidade para Laboratório e Campo',
              badgeText: 'CALIBRAÇÃO RBC · ISO/IEC 17025',
              imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80',
              customData: {
                overview: 'Projetado para atender as mais exigentes demandas metrológicas de calibração de transmissores, manômetros e pressostatos com bomba pneumática interna motorizada, exatidão de até 0.01% FE e controle em malha fechada.',
                highlights: [
                  { label: 'Exatidão Metrológica', value: 'até 0.01% FE', icon: 'ShieldCheck' },
                  { label: 'Geração Autônoma', value: '-0.9 a 70 bar', icon: 'Activity' },
                  { label: 'Comunicação Digital', value: 'HART 7 & Modbus', icon: 'Zap' },
                  { label: 'Interface Touchscreen', value: 'Colorida 5.7"', icon: 'Cpu' }
                ]
              }
            }
          ]
        },

        // Folha 2: Especificações Técnicas de Pressão e Sinais Elétricos
        {
          id: 'p2-pcon-specs',
          pageNumber: 2,
          pageType: 'technical',
          title: 'Especificações Técnicas & Loop',
          blocks: [
            {
              id: 'b2-hero-banner',
              type: 'hero_banner',
              badgeText: 'PRESYS — INSTRUMENTAÇÃO INDUSTRIAL DE PRECISÃO',
              title: 'Linha Industrial Presys PCON-Y18 & Série T',
              subtitle: 'Calibradores de processos com geração autônoma de pressão, controle elétrico e rastreabilidade total.',
              imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
              imageCaption: 'Calibrador Presys com comunicação HART.'
            },
            {
              id: 'b3-specs-table',
              type: 'table',
              title: 'Tabela de Especificações Técnicas de Pressão',
              tableColumns: [
                { key: 'code', label: 'Código', visible: true, width: 110 },
                { key: 'model', label: 'Modelo', visible: true, width: 130 },
                { key: 'range', label: 'Faixa de Pressão', visible: true, width: 130 },
                { key: 'unit', label: 'Unidade', visible: true, width: 70 },
                { key: 'accuracy', label: 'Exatidão', visible: true, width: 100 },
                { key: 'output', label: 'Sinal Saída', visible: true, width: 120 }
              ],
              tableRows: [
                { id: 'r1', productRefId: 'prod-presys-pcon-y18', localOverrides: {}, order: 0 },
                { id: 'r2', productRefId: 'prod-presys-ta-650p', localOverrides: {}, order: 1 },
                { id: 'r3', productRefId: 'prod-pcon-200', localOverrides: {}, order: 2 }
              ]
            },
            {
              id: 'b4-elec-table',
              type: 'electrical_table',
              title: 'Sinais Elétricos, Loop 24V & Comunicação Digital',
              tableColumns: [
                { key: 'sinal', label: 'Sinal de Saída', visible: true },
                { key: 'alimentacao', label: 'Alimentação', visible: true },
                { key: 'carga', label: 'Carga Máxima', visible: true },
                { key: 'isolacao', label: 'Isolação', visible: true }
              ],
              tableRows: [
                {
                  id: 'er1',
                  localOverrides: {
                    sinal: '4-20 mA + Protocolo HART 7',
                    alimentacao: 'Bateria Li-Ion recarregável / 24 Vdc',
                    carga: '250 a 1100 Ω',
                    isolacao: '1500 Vrms galvânica'
                  },
                  order: 0
                }
              ]
            }
          ]
        },

        // Folha 3: Insertos de Equalização Térmica, Galeria de Campo & Software
        {
          id: 'p3-pcon-inserts-gallery',
          pageNumber: 3,
          pageType: 'technical',
          title: 'Insertos & Aplicações em Campo',
          blocks: [
            {
              id: 'b5-inserts',
              type: 'inserts_visual',
              title: 'INSERTOS DE EQUALIZAÇÃO TÉRMICA & FURAÇÕES PADRONIZADAS PRESYS',
              customData: {
                externalDiameter: 'Diâmetro Externo: Ø 32mm / Ø 35mm',
                inserts: [
                  { code: 'IN1P', title: 'Misto...', holes: ['3', '6', '1/4', '8'] },
                  { code: 'IN1A', title: 'Imperial...', holes: ['1/8', '3/16', '1/4', '3/8'] },
                  { code: 'IN1E', title: 'Multi-Sens...', holes: ['4', '6', '1/4', '8', '10'] },
                  { code: 'IN01', title: 'Grande...', holes: ['3/4'] },
                  { code: 'IN02', title: 'Diâmetro...', holes: ['1/2'] },
                  { code: 'IN03', title: 'Quadruplo...', holes: ['6', '1/4', '1/4', '1/4'] },
                  { code: 'IN04', title: 'Triplo...', holes: ['6', '6', '6', '1/4'] },
                  { code: 'INCL', title: 'Esferas de...', holes: ['Copo 28'] }
                ],
                tableColumns: ['TA-25N / 35N / 50N', 'TA-350P / 650P', 'TA-1200P'],
                tableRows: [
                  {
                    code: 'IN1P',
                    holesDesc: '1 × 3mm, 1 × 6mm, 1 × 1/4", 1 × 8mm',
                    models: { 'TA-25N / 35N / 50N': '06.04.0121-00', 'TA-350P / 650P': '06.04.0128-00', 'TA-1200P': '06.04.0156-00' }
                  },
                  {
                    code: 'IN1A',
                    holesDesc: '1 × 1/8", 1 × 3/16", 2 × 1/4", 1 × 3/8"',
                    models: { 'TA-25N / 35N / 50N': '06.04.0122-00', 'TA-350P / 650P': '06.04.0129-00', 'TA-1200P': '06.04.0157-00' }
                  },
                  {
                    code: 'IN01',
                    holesDesc: '1 × 3/4" (Furo Centralizado)',
                    models: { 'TA-25N / 35N / 50N': '06.04.0011-00', 'TA-350P / 650P': '06.04.0101-00', 'TA-1200P': '06.04.0031-00' }
                  },
                  {
                    code: 'INCL',
                    holesDesc: 'Inserto Tipo Copo com microesferas de aço',
                    models: { 'TA-25N / 35N / 50N': '06.04.0086-00', 'TA-350P / 650P': '06.04.0099-00', 'TA-1200P': '—' }
                  }
                ]
              }
            },
            {
              id: 'b6-gallery',
              type: 'image_gallery',
              title: 'APLICAÇÕES EM BANCADA DE CALIBRAÇÃO & CAMPO',
              images: [
                { url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80', caption: 'Montagem em bancada de calibração' },
                { url: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=400&q=80', caption: 'Operação em campo industrial' },
                { url: 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=400&q=80', caption: 'Comunicação via protocolo HART' }
              ]
            },
            {
              id: 'b7-software',
              type: 'software_connectivity',
              title: 'SOFTWARE DE CALIBRAÇÃO & CONECTIVIDADE INDUSTRIAL'
            }
          ]
        },

        // Folha 4: Sistema Multifunção, Código de Encomenda & Rodapé
        {
          id: 'p4-pcon-multimode-order',
          pageNumber: 4,
          pageType: 'technical',
          title: 'Sistema Multifunção & Encomenda',
          blocks: [
            {
              id: 'b8-multimode',
              type: 'multi_mode_calibrator',
              title: 'SISTEMA MULTIFUNÇÃO — 4 MODOS DE CALIBRAÇÃO TÉRMICA EM 1 ÚNICO INSTRUMENTO',
              badgeText: 'Multifunctional Series'
            },
            {
              id: 'b9-ordering',
              type: 'ordering_codes',
              title: 'ESTRUTURA DO CÓDIGO DE ENCOMENDA PRESYS (PART NUMBER)',
              orderingSegments: [
                { id: 's1', code: 'PCON-Y18', name: 'Modelo', options: ['PCON-Y18-LP', 'PCON-Y18', 'PCON-Y18-HP'] },
                { id: 's2', code: 'FAIXA', name: 'Faixa Operacional', options: ['2.5B (-0.9 a 2.5 bar)', '40B (-0.9 a 40 bar)', '70B (0 a 70 bar)'] },
                { id: 's3', code: 'EXATIDÃO', name: 'Classe de Exatidão', options: ['0.025% FE (Padrão)', '0.01% FE (Alta Precisão)'] },
                { id: 's4', code: 'COMUNICAÇÃO', name: 'Protocolos', options: ['HART 7', 'Profibus PA', 'Modbus RTU'] }
              ]
            },
            {
              id: 'b10-bottom-header',
              type: 'bottom_header',
              title: 'PRESYS INSTRUMENTOS & SISTEMAS LTDA',
              subtitle: 'Soluções completas para calibração de pressão, temperatura e sinais de processo.'
            }
          ]
        }
      ]
    }
  },

  // =========================================================================
  // PRESET 2: CATÁLOGO DUAL-COLUMN PRESYS PCON-Y18 (3 PÁGINAS)
  // =========================================================================
  {
    id: 'preset-benchmark-presys-pcon',
    name: 'Catálogo Presys PCON-Y18 Dual-Column (3 Páginas)',
    description: 'Layout em duas colunas assimétricas com bullets de destaque, matriz comparativa e tabela de sinais elétricos.',
    isSystem: true,
    createdAt: '2026-08-31T12:00:00.000Z',
    catalog: {
      id: 'cat-preset-pcon-y18-3p',
      title: 'Presys PCON-Y18 Séries — Calibradores Automáticos de Pressão',
      subtitle: 'Guia de Seleção & Especificações Técnicas Completas',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1-presys-cover',
          pageNumber: 1,
          pageType: 'cover',
          title: 'Visão Geral & Recursos',
          blocks: [
            {
              id: 'b1-presys-hero',
              type: 'additel_two_col_hero',
              title: 'Presys PCON-Y18 Series',
              subtitle: 'Calibrador Automático de Pressão & Padrão de Calibração',
              badgeText: 'PRESYS Metrology',
              imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
              imageCaption: 'Instrumento autônomo com bomba elétrica e módulos duplos.',
              customData: {
                overview: 'O calibrador automático Presys PCON-Y18 representa um avanço metrológico completo com geração de pressão autônoma de vácuo até 100 bar (1.500 psi). Totalmente integrado com bomba elétrica de velocidade controlada, módulos intercambiáveis de alta exatidão (0.01% FE) e comunicação com protocolo HART e Profibus.'
              }
            },
            {
              id: 'b2-matrix',
              type: 'matrix_spec_table',
              title: 'MATRIZ COMPARATIVA DE MODELOS & FAIXAS OPERACIONAIS'
            }
          ]
        },
        {
          id: 'p2-presys-specs',
          pageNumber: 2,
          pageType: 'technical',
          title: 'Especificações Técnicas',
          blocks: [
            {
              id: 'b3-specs-table',
              type: 'table',
              title: 'Especificações Técnicas de Pressão e Módulos',
              tableColumns: [
                { key: 'code', label: 'Código', visible: true, width: 110 },
                { key: 'model', label: 'Modelo', visible: true, width: 130 },
                { key: 'range', label: 'Faixa de Pressão', visible: true, width: 130 },
                { key: 'accuracy', label: 'Exatidão', visible: true, width: 100 },
                { key: 'output', label: 'Sinal Saída', visible: true, width: 120 }
              ],
              tableRows: [
                { id: 'r1', productRefId: 'prod-presys-pcon-y18', localOverrides: {}, order: 0 },
                { id: 'r2', productRefId: 'prod-pcon-200', localOverrides: {}, order: 1 }
              ]
            },
            {
              id: 'b4-elec-table',
              type: 'electrical_table',
              title: 'Sinais Elétricos, Loop 24V & HART',
              tableColumns: [
                { key: 'sinal', label: 'Sinal de Saída', visible: true },
                { key: 'alimentacao', label: 'Alimentação', visible: true },
                { key: 'carga', label: 'Carga Máxima', visible: true },
                { key: 'isolacao', label: 'Isolação', visible: true }
              ],
              tableRows: [
                {
                  id: 'er1',
                  localOverrides: {
                    sinal: '4-20 mA + Protocolo HART 7',
                    alimentacao: 'Bateria Li-Ion / 24 Vdc',
                    carga: '250 a 1100 Ω',
                    isolacao: '1500 Vrms'
                  },
                  order: 0
                }
              ]
            },
            {
              id: 'b5-software',
              type: 'software_connectivity',
              title: 'SOFTWARE & CONECTIVIDADE'
            }
          ]
        },
        {
          id: 'p3-presys-accessories',
          pageNumber: 3,
          pageType: 'technical',
          title: 'Acessórios & Encomenda',
          blocks: [
            {
              id: 'b6-accessories',
              type: 'accessories_table',
              title: 'Tabela de Acessórios & Opcionais',
              tableColumns: [
                { key: 'codigo', label: 'Código do Acessório', visible: true, width: 140 },
                { key: 'descricao', label: 'Descrição do Componente', visible: true },
                { key: 'tipo', label: 'Fornecimento', visible: true, width: 120 }
              ],
              tableRows: [
                { id: 'ar1', localOverrides: { codigo: 'PRESYS-HOSE-HP', descricao: 'Mangueira de Alta Pressão 1/4" NPT (2m)', tipo: 'Incluso' }, order: 0 },
                { id: 'ar2', localOverrides: { codigo: 'PRESYS-MNF-2V', descricao: 'Válvula Manifold de 2 Vias em Inox 316', tipo: 'Opcional' }, order: 1 }
              ]
            },
            {
              id: 'b7-ordering',
              type: 'ordering_codes',
              title: 'ESTRUTURA DO CÓDIGO DE ENCOMENDA PRESYS (PART NUMBER)'
            },
            {
              id: 'b8-bottom',
              type: 'bottom_header',
              title: 'PRESYS INSTRUMENTOS & SISTEMAS LTDA'
            }
          ]
        }
      ]
    }
  },

  // =========================================================================
  // PRESET 3: CATÁLOGO PRESYS SÉRIE T METROLOGIA (2 PÁGINAS)
  // =========================================================================
  {
    id: 'preset-benchmark-presys-t',
    name: 'Catálogo Presys Série T Termometria & Calibração (2 Páginas)',
    description: 'Header com tarja metrológica, painel de destaques técnicos e tabela completa.',
    isSystem: true,
    createdAt: '2026-08-31T12:00:00.000Z',
    catalog: {
      id: 'cat-preset-t-2p',
      title: 'Field Metrology Wells & Portable Calibration Standards',
      subtitle: 'Presys Série T Metrology & Calibration Datasheet',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1-presys-cover',
          pageNumber: 1,
          pageType: 'cover',
          title: 'Field Metrology Wells',
          blocks: [
            {
              id: 'b1-presys-header',
              type: 'fluke_header',
              badgeText: 'PRESYS Calibration',
              title: 'Field Metrology Wells / Presys Série T',
              imageUrl: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80',
              customData: {
                description: 'Os blocos secos de calibração metrológica Presys Série T combinam máxima portabilidade e velocidade térmica com desempenho de laboratório primário.'
              }
            },
            {
              id: 'b2-matrix',
              type: 'matrix_spec_table',
              title: 'ESPECIFICAÇÕES TÉRMICAS & FAIXAS DE OPERAÇÃO'
            }
          ]
        },
        {
          id: 'p2-presys-specs',
          pageNumber: 2,
          pageType: 'technical',
          title: 'Insertos & Encomenda',
          blocks: [
            {
              id: 'b3-inserts',
              type: 'inserts_visual',
              title: 'INSERTOS DE EQUALIZAÇÃO TÉRMICA & FURAÇÕES PADRONIZADAS'
            },
            {
              id: 'b4-ordering',
              type: 'ordering_codes',
              title: 'ESTRUTURA DO CÓDIGO DE ENCOMENDA (PART NUMBER)'
            },
            {
              id: 'b5-footer',
              type: 'contact_footer'
            }
          ]
        }
      ]
    }
  },

  // =========================================================================
  // PRESET 4: ONE-PAGER DATASHEET EXECUTIVO PRESYS (1 PÁGINA A4 COMPLETA)
  // =========================================================================
  {
    id: 'preset-presys-onepager',
    name: 'Datasheet Executivo Presys PCON (1 Página A4 Completa)',
    description: 'Documento condensado de 1 folha A4 com header corporativo, tabela de especificações, destaques técnicos e rodapé em perfeito preenchimento.',
    isSystem: true,
    createdAt: '2026-08-31T12:00:00.000Z',
    catalog: {
      id: 'cat-preset-presys-onepager',
      title: 'Datasheet Comercial Presys PCON-Y18-LP',
      subtitle: 'Ficha Técnica Rápida para Engenharia e Suprimentos',
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
              id: 'b1-hero',
              type: 'hero_banner',
              badgeText: 'PRESYS — INSTRUMENTAÇÃO INDUSTRIAL DE PRECISÃO',
              title: 'Calibrador Automático Presys PCON-Y18-LP',
              subtitle: 'Geração autônoma de pressão de vácuo até 70 bar com controle motorizado e exatidão 0.025% FE.',
              imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
              imageCaption: 'PCON-Y18 com display gráfico touch.'
            },
            {
              id: 'b2-specs',
              type: 'table',
              title: 'Especificações Técnicas do Instrumento',
              tableColumns: [
                { key: 'code', label: 'Código', visible: true, width: 110 },
                { key: 'model', label: 'Modelo', visible: true, width: 130 },
                { key: 'range', label: 'Faixa Operacional', visible: true, width: 130 },
                { key: 'unit', label: 'Unidade', visible: true, width: 70 },
                { key: 'accuracy', label: 'Exatidão', visible: true, width: 100 }
              ],
              tableRows: [
                { id: 'r1', productRefId: 'prod-presys-pcon-y18', localOverrides: {}, order: 0 },
                { id: 'r2', productRefId: 'prod-pcon-200', localOverrides: {}, order: 1 }
              ]
            },
            {
              id: 'b3-features',
              type: 'features_list',
              title: 'Recursos Metrológicos Principais',
              features: [
                { id: 'f1', title: 'Bomba Elétrica Embutida', description: 'Gera pressão e vácuo automaticamente sem necessidade de bomba manual ou cilindro externo.' },
                { id: 'f2', title: 'Comunicação HART 7 & Modbus', description: 'Permite configurar e calibrar transmissores inteligentes diretamente no campo.' }
              ]
            },
            {
              id: 'b4-bottom',
              type: 'bottom_header',
              title: 'PRESYS INSTRUMENTOS & SISTEMAS LTDA'
            }
          ]
        }
      ]
    }
  },

  // =========================================================================
  // PRESET 4: DATASHEET INDIVIDUAL PRESYS TA-25N (-25 to 155 °C)
  // =========================================================================
  {
    id: 'preset-presys-ta-25n-datasheet',
    name: 'PRESYS TA-25N — Advanced Temperature Calibrator (-25 to 155 °C)',
    description: 'Datasheet técnico completo do calibrador de bloco seco TA-25N para exportação, com especificações elétricas, metrologia tripla, benchmarks de aquecimento e tabela de inserts.',
    isSystem: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    catalog: {
      id: 'cat-ta-25n-datasheet',
      title: 'PRESYS TA-25N — Advanced Temperature Calibrator',
      subtitle: 'Dry-Block Calibrator with Embedded Multi-Signal Electric Calibrator (-25 to 155 °C)',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1-ta25n-cover',
          pageNumber: 1,
          pageType: 'cover',
          title: 'Capa Editorial TA-25N',
          blocks: [
            {
              id: 'b1-ta25n-hero',
              type: 'full_page_cover',
              title: 'TA-25N',
              subtitle: 'Advanced Temperature Calibrator (-25 to 155 °C)',
              badgeText: 'PRESYS METROLOGY · ISO 17025 ACCREDITED COMPLIANCE · CE MARK',
              imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1400&q=85',
              customData: {
                coverStyle: 'photo_hero',
                overlayOpacity: 40,
                textAlign: 'left',
                showLogoBox: true,
                showAccentLine: true,
                brandName: 'PRESYS',
                brandSubtitle: 'INSTRUMENTS & SYSTEMS',
                overview: 'Calibrador de temperatura de bloco seco de alta performance para calibração de termopares, termorresistências, termostatos e transmissores 4-20 mA / HART com exatidão de até ±0.05 °C com padrão externo.',
                footerLeft: 'www.presys.com.br · vendas@presys.com.br',
                footerRight: 'CE Compliant · EN 61010-1 / EN 61326-1'
              }
            }
          ]
        },
        {
          id: 'p2-ta25n-specs',
          pageNumber: 2,
          pageType: 'technical',
          title: 'Ficha Técnica TA-25N',
          blocks: [
            {
              id: 'b2-ta25n-header',
              type: 'hero_banner',
              badgeText: 'ESPECIFICAÇÕES TÉCNICAS E METROLÓGICAS OFICIAIS',
              title: 'PRESYS TA-25N — Especificações de Engenharia',
              subtitle: 'Faixa de trabalho de -25 a 155 °C com controle térmico Peltier e calibrador multissinais elétrico incorporado.',
              imageUrl: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80',
              imageCaption: 'Gabinete metálico compacto 260x200x305 mm com touchscreen 5.7".'
            },
            {
              id: 'b3-ta25n-table',
              type: 'table',
              title: 'Parâmetros Metrológicos e Elétricos (Manual EM0314-01)',
              tableColumns: [
                { key: 'code', label: 'Modelo', visible: true, width: 100 },
                { key: 'range', label: 'Faixa Operacional', visible: true, width: 130 },
                { key: 'accuracy', label: 'Exatidão', visible: true, width: 190 },
                { key: 'powerSupply', label: 'Alimentação / Potência', visible: true, width: 160 }
              ],
              tableRows: [
                { id: 'r1', productRefId: 'prod-presys-ta-25n', localOverrides: {}, order: 0 }
              ]
            },
            {
              id: 'b4-ta25n-features',
              type: 'features_list',
              title: 'Destaques Metrológicos e Funcionais',
              features: [
                { id: 'f1', title: 'Exatidão Tripla', description: '±0.1 °C com referência interna, ±0.07 °C com referência externa e ±0.05 °C com sensor padrão externo Callendar-Van Dusen.' },
                { id: 'f2', title: 'Dinâmica Térmica Rápida', description: 'Aquecimento de 25 a 140 °C em apenas 10 minutos; Resfriamento de 25 a -25 °C em 11 minutos (Peltier 200 W).' },
                { id: 'f3', title: 'Comunicação e Web Server', description: 'Ethernet integrado com servidor Web na porta 5000, USB host/device, protocolo HART® nativo e software ISOPLAN®.' }
              ]
            },
            {
              id: 'b5-ta25n-bottom',
              type: 'bottom_header',
              title: 'PRESYS INSTRUMENTOS E SISTEMAS LTDA · SÃO PAULO, BRASIL'
            }
          ]
        },
        {
          id: 'p3-ta25n-inserts',
          pageNumber: 3,
          pageType: 'technical',
          title: 'Insertos e Acessórios TA-25N',
          blocks: [
            {
              id: 'b6-ta25n-inserts-visual',
              type: 'inserts_visual',
              title: 'Blocos de Prova (Inserts) Intercambiáveis Ø 25.4 x 124 mm',
              subtitle: 'Modelos padrão métricos, imperiais, multi-furos e Insert Caneca exclusivo com microesferas de aço.',
              badgeText: 'ACESSÓRIOS E COMPONENTES ORIGINAIS PRESYS',
              customData: {
                selectedInserts: ['IN01', 'IN02', 'IN03', 'IN04', 'IN05', 'IN06', 'IN07', 'IN08', 'INCL', 'IN1P', 'IN1A', 'IN1E']
              }
            },
            {
              id: 'b7-ta25n-conn-visual',
              type: 'software_connectivity',
              title: 'Diagrama de Ligações Frontais e Conectividade',
              subtitle: 'Bornes para medição de mA, mV, RTD 2/3/4 fios, Termopares, Termostatos e Fonte TPS 24V HART®.',
              badgeText: 'PAINEL FRONTAL MULTISSINAIS'
            },
            {
              id: 'b8-ta25n-footer',
              type: 'bottom_header',
              title: 'PRESYS — METROLOGIA E AUTOMAÇÃO INDUSTRIAL'
            }
          ]
        }
      ]
    }
  },

  // =========================================================================
  // PRESET 5: DATASHEET INDIVIDUAL PRESYS TA-35N (-35 to 155 °C)
  // =========================================================================
  {
    id: 'preset-presys-ta-35n-datasheet',
    name: 'PRESYS TA-35N — Advanced Temperature Calibrator (-35 to 155 °C)',
    description: 'Datasheet técnico completo do calibrador de bloco seco TA-35N para exportação, com faixa até -35 °C, potência de 300 W, probe externo e protocolo HART.',
    isSystem: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    catalog: {
      id: 'cat-ta-35n-datasheet',
      title: 'PRESYS TA-35N — Advanced Temperature Calibrator',
      subtitle: 'Dry-Block Calibrator with Embedded Multi-Signal Electric Calibrator (-35 to 155 °C)',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1-ta35n-cover',
          pageNumber: 1,
          pageType: 'cover',
          title: 'Capa Editorial TA-35N',
          blocks: [
            {
              id: 'b1-ta35n-hero',
              type: 'full_page_cover',
              title: 'TA-35N',
              subtitle: 'Advanced Temperature Calibrator (-35 to 155 °C)',
              badgeText: 'PRESYS METROLOGY · ISO 17025 ACCREDITED COMPLIANCE · CE MARK',
              imageUrl: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=1400&q=85',
              customData: {
                coverStyle: 'photo_hero',
                overlayOpacity: 40,
                textAlign: 'left',
                showLogoBox: true,
                showAccentLine: true,
                brandName: 'PRESYS',
                brandSubtitle: 'INSTRUMENTS & SYSTEMS',
                overview: 'Calibrador de temperatura de bloco seco com faixa expandida até -35 °C, ideal para indústrias farmacêutica, química, alimentícia e calibração de sensores criogênicos com exatidão até ±0.05 °C.',
                footerLeft: 'www.presys.com.br · vendas@presys.com.br',
                footerRight: 'CE Compliant · EN 61010-1 / EN 61326-1'
              }
            }
          ]
        },
        {
          id: 'p2-ta35n-specs',
          pageNumber: 2,
          pageType: 'technical',
          title: 'Ficha Técnica TA-35N',
          blocks: [
            {
              id: 'b2-ta35n-header',
              type: 'hero_banner',
              badgeText: 'ESPECIFICAÇÕES TÉCNICAS E METROLÓGICAS OFICIAIS',
              title: 'PRESYS TA-35N — Especificações de Engenharia',
              subtitle: 'Faixa de trabalho de -35 a 155 °C com controle térmico Peltier de 300 W e calibrador elétrico multissinais.',
              imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
              imageCaption: 'Gabinete 260x200x305 mm, 10.5 kg, poço Ø 25.4 x 124 mm.'
            },
            {
              id: 'b3-ta35n-table',
              type: 'table',
              title: 'Parâmetros Metrológicos e Elétricos (Manual EM0314-01)',
              tableColumns: [
                { key: 'code', label: 'Modelo', visible: true, width: 100 },
                { key: 'range', label: 'Faixa Operacional', visible: true, width: 130 },
                { key: 'accuracy', label: 'Exatidão', visible: true, width: 190 },
                { key: 'powerSupply', label: 'Alimentação / Potência', visible: true, width: 160 }
              ],
              tableRows: [
                { id: 'r1', productRefId: 'prod-presys-ta-35n', localOverrides: {}, order: 0 }
              ]
            },
            {
              id: 'b4-ta35n-features',
              type: 'features_list',
              title: 'Destaques Metrológicos e Funcionais',
              features: [
                { id: 'f1', title: 'Faixa Térmica Subzero (-35 °C)', description: 'Atinge -35 °C a partir da temperatura ambiente de 23 °C em apenas 16 minutos com excelente estabilidade de 0.02 °C.' },
                { id: 'f2', title: 'Calibração Automática de Tarefas', description: 'Execução de rotinas As Found e As Left diretamente no instrumento, calculando desvios e gerando laudos em PDF.' },
                { id: 'f3', title: 'Entrada Probe Externo CVD', description: 'Controle de temperatura baseado em sensor padrão externo inserido no poço com coeficientes Callendar-Van Dusen.' }
              ]
            },
            {
              id: 'b5-ta35n-bottom',
              type: 'bottom_header',
              title: 'PRESYS INSTRUMENTOS E SISTEMAS LTDA · SÃO PAULO, BRASIL'
            }
          ]
        },
        {
          id: 'p3-ta35n-inserts',
          pageNumber: 3,
          pageType: 'technical',
          title: 'Insertos e Acessórios TA-35N',
          blocks: [
            {
              id: 'b6-ta35n-inserts-visual',
              type: 'inserts_visual',
              title: 'Blocos de Prova (Inserts) Intercambiáveis Ø 25.4 x 124 mm',
              subtitle: 'Modelos padrão métricos, imperiais, multi-furos e Insert Caneca exclusivo com microesferas de aço.',
              badgeText: 'ACESSÓRIOS E COMPONENTES ORIGINAIS PRESYS',
              customData: {
                selectedInserts: ['IN01', 'IN02', 'IN03', 'IN04', 'IN05', 'IN06', 'IN07', 'IN08', 'INCL', 'IN1P', 'IN1A', 'IN1E']
              }
            },
            {
              id: 'b7-ta35n-conn-visual',
              type: 'software_connectivity',
              title: 'Diagrama de Ligações Frontais e Conectividade',
              subtitle: 'Bornes para medição de mA, mV, RTD 2/3/4 fios, Termopares, Termostatos e Fonte TPS 24V HART®.',
              badgeText: 'PAINEL FRONTAL MULTISSINAIS'
            },
            {
              id: 'b8-ta35n-footer',
              type: 'bottom_header',
              title: 'PRESYS — METROLOGIA E AUTOMAÇÃO INDUSTRIAL'
            }
          ]
        }
      ]
    }
  },

  // =========================================================================
  // PRESET 6: DATASHEET INDIVIDUAL PRESYS TA-50N (-50 to 155 °C)
  // =========================================================================
  {
    id: 'preset-presys-ta-50n-datasheet',
    name: 'PRESYS TA-50N — Advanced Temperature Calibrator (-50 to 155 °C)',
    description: 'Datasheet técnico completo do calibrador de bloco seco TA-50N para exportação, com estágio criogênico de -50 °C, potência de 400 W, chassi reforçado e exatidão metrológica tripla.',
    isSystem: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    catalog: {
      id: 'cat-ta-50n-datasheet',
      title: 'PRESYS TA-50N — Advanced Temperature Calibrator',
      subtitle: 'Dry-Block Calibrator with Embedded Multi-Signal Electric Calibrator (-50 to 155 °C)',
      themeId: 'default-technical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      pages: [
        {
          id: 'p1-ta50n-cover',
          pageNumber: 1,
          pageType: 'cover',
          title: 'Capa Editorial TA-50N',
          blocks: [
            {
              id: 'b1-ta50n-hero',
              type: 'full_page_cover',
              title: 'TA-50N',
              subtitle: 'Advanced Temperature Calibrator (-50 to 155 °C)',
              badgeText: 'PRESYS METROLOGY · ISO 17025 ACCREDITED COMPLIANCE · CE MARK',
              imageUrl: 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?auto=format&fit=crop&w=1400&q=85',
              customData: {
                coverStyle: 'photo_hero',
                overlayOpacity: 40,
                textAlign: 'left',
                showLogoBox: true,
                showAccentLine: true,
                brandName: 'PRESYS',
                brandSubtitle: 'INSTRUMENTS & SYSTEMS',
                overview: 'Calibrador de temperatura de bloco seco de ultra-baixa temperatura até -50 °C com 400 W de potência termoelétrica, ideal para calibrações de extrema exatidão em laboratórios acreditados e indústrias de processo.',
                footerLeft: 'www.presys.com.br · vendas@presys.com.br',
                footerRight: 'CE Compliant · EN 61010-1 / EN 61326-1'
              }
            }
          ]
        },
        {
          id: 'p2-ta50n-specs',
          pageNumber: 2,
          pageType: 'technical',
          title: 'Ficha Técnica TA-50N',
          blocks: [
            {
              id: 'b2-ta50n-header',
              type: 'hero_banner',
              badgeText: 'ESPECIFICAÇÕES TÉCNICAS E METROLÓGICAS OFICIAIS',
              title: 'PRESYS TA-50N — Especificações de Engenharia',
              subtitle: 'Faixa operacional de -50 a 155 °C com estágio Peltier de alta potência de 400 W e chassi 315x200x305 mm.',
              imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
              imageCaption: 'Chassi reforçado 315x200x305 mm, 12.5 kg, com dissipação otimizada.'
            },
            {
              id: 'b3-ta50n-table',
              type: 'table',
              title: 'Parâmetros Metrológicos e Elétricos (Manual EM0314-01)',
              tableColumns: [
                { key: 'code', label: 'Modelo', visible: true, width: 100 },
                { key: 'range', label: 'Faixa Operacional', visible: true, width: 130 },
                { key: 'accuracy', label: 'Exatidão', visible: true, width: 190 },
                { key: 'powerSupply', label: 'Alimentação / Potência', visible: true, width: 160 }
              ],
              tableRows: [
                { id: 'r1', productRefId: 'prod-presys-ta-50n', localOverrides: {}, order: 0 }
              ]
            },
            {
              id: 'b4-ta50n-features',
              type: 'features_list',
              title: 'Destaques Metrológicos e Funcionais',
              features: [
                { id: 'f1', title: 'Ultra-Baixa Temperatura (-50 °C)', description: 'Resfriamento potente de 25 a -50 °C em 25 minutos com dissipação térmica otimizada e estabilidade de 0.02 °C.' },
                { id: 'f2', title: 'Calibrador Multissinais Completo', description: 'Medição independente de corrente (mA), mV, Ohms, RTDs (Pt100, Pt1000), Termopares (J, K, T, E, N, R, S, B, C) e Switches.' },
                { id: 'f3', title: 'Conectividade e Protocolo HART®', description: 'Fonte de 24 Vcc integrada para transmissores a 2 fios e comunicador HART® com biblioteca DD da FieldComm Group.' }
              ]
            },
            {
              id: 'b5-ta50n-bottom',
              type: 'bottom_header',
              title: 'PRESYS INSTRUMENTOS E SISTEMAS LTDA · SÃO PAULO, BRASIL'
            }
          ]
        },
        {
          id: 'p3-ta50n-inserts',
          pageNumber: 3,
          pageType: 'technical',
          title: 'Insertos e Acessórios TA-50N',
          blocks: [
            {
              id: 'b6-ta50n-inserts-visual',
              type: 'inserts_visual',
              title: 'Blocos de Prova (Inserts) Intercambiáveis Ø 25.4 x 124 mm',
              subtitle: 'Modelos padrão métricos, imperiais, multi-furos e Insert Caneca exclusivo com microesferas de aço.',
              badgeText: 'ACESSÓRIOS E COMPONENTES ORIGINAIS PRESYS',
              customData: {
                selectedInserts: ['IN01', 'IN02', 'IN03', 'IN04', 'IN05', 'IN06', 'IN07', 'IN08', 'INCL', 'IN1P', 'IN1A', 'IN1E']
              }
            },
            {
              id: 'b7-ta50n-conn-visual',
              type: 'software_connectivity',
              title: 'Diagrama de Ligações Frontais e Conectividade',
              subtitle: 'Bornes para medição de mA, mV, RTD 2/3/4 fios, Termopares, Termostatos e Fonte TPS 24V HART®.',
              badgeText: 'PAINEL FRONTAL MULTISSINAIS'
            },
            {
              id: 'b8-ta50n-footer',
              type: 'bottom_header',
              title: 'PRESYS — METROLOGIA E AUTOMAÇÃO INDUSTRIAL'
            }
          ]
        }
      ]
    }
  }
];


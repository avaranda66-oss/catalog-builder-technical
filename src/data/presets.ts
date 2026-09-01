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
  }
];
